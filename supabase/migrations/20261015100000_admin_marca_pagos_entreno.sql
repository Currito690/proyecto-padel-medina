-- El ADMINISTRADOR marca desde su Horario cómo pagó CADA ALUMNO de un entreno
-- (💳 tarjeta / 📱 bizum / 💶 efectivo 'mano', y NULL = desmarcar). Usa el
-- MISMO campo clases_monitor.pagos que marca el monitor desde su agenda, así
-- que los dos ven lo mismo: los pagos de los entrenos son MUTUOS.
--
-- Va por RPC con SECURITY DEFINER: las políticas de clases_monitor NO cambian
-- (el admin sigue sin permiso de INSERT/UPDATE sobre la tabla). Solo puede
-- tocar pagos, un alumno cada vez, y solo en clases que el monitor YA ha
-- confirmado (no crea la fila ni cambia personas ni precio). La fila se
-- bloquea (FOR UPDATE) para no pisar un pago que el monitor guarde a la vez.
--
-- El MONITOR marca también un alumno cada vez con monitor_marcar_pago_alumno
-- (misma lógica, pero solo en SUS clases: user_id = auth.uid(), lo mismo que
-- ya le dejan hacer las políticas). Así ninguno de los dos borra lo que el
-- otro acaba de marcar: cada uno cambia solo su alumno sobre la fila bloqueada.
-- Requiere las migraciones clases_monitor y clases_monitor_pagos.

CREATE OR REPLACE FUNCTION public.admin_marcar_pago_alumno(
  p_user_id UUID,
  p_date DATE,
  p_time_slot TEXT,
  p_court_id UUID,
  p_idx INT,
  p_metodo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_personas INT;
  v_pagos JSONB;
BEGIN
  -- Solo un administrador puede usarla
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede marcar pagos de alumnos';
  END IF;
  IF p_idx IS NULL OR p_idx < 0 THEN
    RAISE EXCEPTION 'Alumno fuera de rango';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('tarjeta', 'bizum', 'mano') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  SELECT id, personas, pagos INTO v_id, v_personas, v_pagos
  FROM public.clases_monitor
  WHERE user_id = p_user_id
    AND date = p_date
    AND time_slot = p_time_slot
    AND court_id = p_court_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El monitor aún no ha confirmado la clase';
  END IF;
  IF p_idx >= v_personas THEN
    RAISE EXCEPTION 'Alumno fuera de rango (la clase tiene % alumnos)', v_personas;
  END IF;

  -- Sin pagos todavía (NULL o algo que no sea una lista): lista vacía
  IF v_pagos IS NULL OR jsonb_typeof(v_pagos) <> 'array' THEN
    v_pagos := '[]'::jsonb;
  END IF;
  -- Rellenar hasta un hueco por alumno (misma normalización que la agenda del monitor)
  WHILE jsonb_array_length(v_pagos) < v_personas LOOP
    v_pagos := v_pagos || 'null'::jsonb;
  END LOOP;
  v_pagos := jsonb_set(v_pagos, ARRAY[p_idx::text], COALESCE(to_jsonb(p_metodo), 'null'::jsonb), true);

  UPDATE public.clases_monitor
  SET pagos = v_pagos,
      updated_at = now()
  WHERE id = v_id;
  RETURN v_pagos;
END $$;

REVOKE ALL ON FUNCTION public.admin_marcar_pago_alumno(UUID, DATE, TEXT, UUID, INT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_marcar_pago_alumno(UUID, DATE, TEXT, UUID, INT, TEXT) TO authenticated;

-- El MONITOR marca un alumno de UNA DE SUS clases (la agenda de Lolo). Antes
-- la app releía la fila y la guardaba entera: si el admin marcaba otro alumno
-- justo entre medias, ese pago se perdía. Aquí se cambia solo ese alumno.
CREATE OR REPLACE FUNCTION public.monitor_marcar_pago_alumno(
  p_date DATE,
  p_time_slot TEXT,
  p_court_id UUID,
  p_idx INT,
  p_metodo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_personas INT;
  v_pagos JSONB;
BEGIN
  -- Solo con sesión, y solo sobre sus propias clases (WHERE user_id = auth.uid())
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión para marcar pagos';
  END IF;
  IF p_idx IS NULL OR p_idx < 0 THEN
    RAISE EXCEPTION 'Alumno fuera de rango';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('tarjeta', 'bizum', 'mano') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  SELECT id, personas, pagos INTO v_id, v_personas, v_pagos
  FROM public.clases_monitor
  WHERE user_id = auth.uid()
    AND date = p_date
    AND time_slot = p_time_slot
    AND court_id = p_court_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirma primero cuántas personas tuvo la clase (botones 1-4)';
  END IF;
  IF p_idx >= v_personas THEN
    RAISE EXCEPTION 'Alumno fuera de rango (la clase tiene % alumnos)', v_personas;
  END IF;

  IF v_pagos IS NULL OR jsonb_typeof(v_pagos) <> 'array' THEN
    v_pagos := '[]'::jsonb;
  END IF;
  WHILE jsonb_array_length(v_pagos) < v_personas LOOP
    v_pagos := v_pagos || 'null'::jsonb;
  END LOOP;
  v_pagos := jsonb_set(v_pagos, ARRAY[p_idx::text], COALESCE(to_jsonb(p_metodo), 'null'::jsonb), true);

  UPDATE public.clases_monitor
  SET pagos = v_pagos,
      updated_at = now()
  WHERE id = v_id;
  RETURN v_pagos;
END $$;

REVOKE ALL ON FUNCTION public.monitor_marcar_pago_alumno(DATE, TEXT, UUID, INT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.monitor_marcar_pago_alumno(DATE, TEXT, UUID, INT, TEXT) TO authenticated;
