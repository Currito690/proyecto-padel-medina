-- El MONITOR confirma desde su agenda el COBRO de las reservas con PAGO EN
-- CLUB (el jugador paga en mostrador y lolo lo marca al momento). Usa el
-- MISMO campo que FINANZAS del admin (cobro_confirmado + cobrado_at), así
-- que en Finanzas sale como cobrada exactamente igual que si la marcara él.
--
-- Va por RPC con SECURITY DEFINER: el monitor NO gana permiso de UPDATE
-- sobre bookings — solo puede tocar este campo y solo en reservas
-- confirmadas de pago en club. Deshacer también está permitido (errores).

CREATE OR REPLACE FUNCTION public.monitor_confirmar_cobro(p_booking_id UUID, p_confirmado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resultado BOOLEAN;
BEGIN
  -- Solo el monitor (o un admin) puede usarla
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('monitor', 'admin') OR email = 'lolo@padelmedina.com')
  ) THEN
    RAISE EXCEPTION 'Solo el monitor o un admin pueden confirmar cobros';
  END IF;

  UPDATE public.bookings
  SET cobro_confirmado = p_confirmado,
      cobrado_at = CASE WHEN p_confirmado THEN now() ELSE NULL END
  WHERE id = p_booking_id
    AND metodo_pago = 'club'
    AND status = 'confirmed'
  RETURNING cobro_confirmado INTO v_resultado;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe o no es de pago en club';
  END IF;
  RETURN v_resultado;
END $$;

REVOKE ALL ON FUNCTION public.monitor_confirmar_cobro(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.monitor_confirmar_cobro(UUID, BOOLEAN) TO authenticated;
