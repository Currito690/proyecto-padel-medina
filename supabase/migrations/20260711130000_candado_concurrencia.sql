-- CONCURRENCIA: si dos jugadores intentan pagar EL MISMO hueco a la vez, el
-- segundo debe fallar ANTES de llegar al banco (nunca dos cobros por un hueco).
-- Sustituye al candado solo-confirmadas por uno que también cubre los holds.

-- 1) Higiene: cancelar holds caducados que pudieran existir
UPDATE public.bookings SET status = 'cancelled'
 WHERE status = 'pendiente_pago' AND created_at < now() - interval '15 minutes';

-- 2) Al intentar ocupar un hueco, caducar automáticamente holds viejos de ESE hueco
--    (así un pago abandonado nunca deja el hueco bloqueado a nivel de BD).
CREATE OR REPLACE FUNCTION public.expire_stale_holds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'pendiente_pago') THEN
    UPDATE public.bookings SET status = 'cancelled'
     WHERE court_id = NEW.court_id
       AND date = NEW.date
       AND time_slot = NEW.time_slot
       AND status = 'pendiente_pago'
       AND created_at < now() - interval '15 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_stale_holds ON public.bookings;
CREATE TRIGGER trg_expire_stale_holds
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.expire_stale_holds();

-- 3) CANDADO ÚNICO: máximo UNA reserva viva (confirmada O en pago) por hueco.
--    Dos holds simultáneos → el segundo falla al instante y el jugador ve el
--    aviso sin haber pagado nada.
DROP INDEX IF EXISTS public.uq_bookings_slot_confirmed;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_slot_activa
  ON public.bookings (court_id, date, time_slot)
  WHERE status IN ('confirmed', 'pendiente_pago');
