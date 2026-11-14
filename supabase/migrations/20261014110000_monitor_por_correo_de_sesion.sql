-- 2026-10-14: las funciones del MONITOR reconocían a lolo por profiles.email,
-- que cualquier usuario puede cambiar desde su perfil. Un cliente que se pusiera
-- ese correo podía confirmar cobros y marcar pagos de jugadores.
--
-- Ahora el correo se lee de la SESIÓN (auth.jwt(), lo firma GoTrue y el usuario
-- no lo puede tocar). Todo lo demás queda exactamente igual que en
-- 20260820100000_monitor_confirmar_cobro.sql y 20260907090000_monitor_pagos_jugadores.sql.

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
      AND role IN ('monitor', 'admin')
  ) AND lower(COALESCE(auth.jwt() ->> 'email', '')) <> 'lolo@padelmedina.com' THEN
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
      AND role IN ('monitor', 'admin')
  ) AND lower(COALESCE(auth.jwt() ->> 'email', '')) <> 'lolo@padelmedina.com' THEN
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
