-- El MONITOR marca desde su agenda cómo pagó CADA JUGADOR de una reserva
-- (🏪 club / 💳 tarjeta / 📱 bizum, y repetir = desmarcar). Usa el MISMO
-- campo bookings.pagos_jugadores que el admin marca desde su Horario, así
-- que el panel y Finanzas lo ven exactamente igual.
--
-- Va por RPC con SECURITY DEFINER: el monitor NO gana permiso de UPDATE
-- sobre bookings — solo puede tocar pagos_jugadores, un jugador cada vez,
-- en reservas confirmadas. Requiere la migración bookings_pagos_jugadores.

CREATE OR REPLACE FUNCTION public.monitor_marcar_pago_jugador(p_booking_id UUID, p_idx INT, p_metodo TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pagos JSONB;
BEGIN
  -- Solo el monitor (o un admin) puede usarla
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('monitor', 'admin') OR email = 'lolo@padelmedina.com')
  ) THEN
    RAISE EXCEPTION 'Solo el monitor o un admin pueden marcar pagos';
  END IF;
  IF p_idx < 0 OR p_idx > 3 THEN
    RAISE EXCEPTION 'Jugador fuera de rango (1-4)';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('tarjeta', 'bizum', 'club') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  SELECT COALESCE(pagos_jugadores, '[]'::jsonb) INTO v_pagos
  FROM public.bookings
  WHERE id = p_booking_id AND status = 'confirmed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva no existe o no está confirmada';
  END IF;

  -- Rellenar hasta 4 huecos (misma normalización que el panel del admin)
  WHILE jsonb_array_length(v_pagos) < 4 LOOP
    v_pagos := v_pagos || 'null'::jsonb;
  END LOOP;
  v_pagos := jsonb_set(v_pagos, ARRAY[p_idx::text], COALESCE(to_jsonb(p_metodo), 'null'::jsonb), true);

  UPDATE public.bookings SET pagos_jugadores = v_pagos WHERE id = p_booking_id;
  RETURN v_pagos;
END $$;

REVOKE ALL ON FUNCTION public.monitor_marcar_pago_jugador(UUID, INT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.monitor_marcar_pago_jugador(UUID, INT, TEXT) TO authenticated;
