-- Al marcar los 4 pagos de una reserva (lo haga lolo desde su agenda o el
-- admin desde su Horario) la reserva queda COBRADA automáticamente en
-- FINANZAS (cobro_confirmado + cobrado_at): el admin no tiene que entrar a
-- confirmarla. Si luego se desmarca uno de los 4, vuelve a pendiente.
-- Misma regla que Finanzas para las reservas manuales del admin: is_free
-- pasa a false al cobrar y a true al deshacer.
CREATE OR REPLACE FUNCTION public.bookings_autoconfirma_por_pagos()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  antes int;
  despues int;
BEGIN
  antes := (SELECT count(*) FROM jsonb_array_elements(coalesce(OLD.pagos_jugadores, '[]'::jsonb)) e WHERE e <> 'null'::jsonb);
  despues := (SELECT count(*) FROM jsonb_array_elements(coalesce(NEW.pagos_jugadores, '[]'::jsonb)) e WHERE e <> 'null'::jsonb);
  IF despues >= 4 AND antes < 4 AND NOT coalesce(NEW.cobro_confirmado, false) THEN
    NEW.cobro_confirmado := true;
    NEW.cobrado_at := now();
    IF NEW.metodo_pago = 'manual' THEN NEW.is_free := false; END IF;
  ELSIF antes >= 4 AND despues < 4 AND coalesce(NEW.cobro_confirmado, false) THEN
    NEW.cobro_confirmado := false;
    NEW.cobrado_at := NULL;
    IF NEW.metodo_pago = 'manual' THEN NEW.is_free := true; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_autoconfirma_por_pagos ON public.bookings;
CREATE TRIGGER trg_bookings_autoconfirma_por_pagos
  BEFORE UPDATE OF pagos_jugadores ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_autoconfirma_por_pagos();
