-- Ajuste: el bloqueo por slots_release_time SOLO afecta a reservas para
-- fechas futuras. Hoy se puede reservar a cualquier hora; lo que se libera
-- a las 09:00 (o lo que toque) es la posibilidad de reservar mañana, pasado
-- mañana, etc.

CREATE OR REPLACE FUNCTION public.enforce_bookings_release_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  release_time TIME;
  now_local TIME;
  today_local DATE;
BEGIN
  -- Admins exentos
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT slots_release_time INTO release_time
    FROM public.site_settings
    ORDER BY id ASC
    LIMIT 1;

  IF release_time IS NULL OR release_time = '00:00'::time THEN
    RETURN NEW;
  END IF;

  today_local := (now() AT TIME ZONE 'Europe/Madrid')::date;

  -- Reservas para hoy: nunca se bloquean por release_time
  -- (los slots ya pasados son filtrados por la UI).
  IF NEW.date <= today_local THEN
    RETURN NEW;
  END IF;

  now_local := (now() AT TIME ZONE 'Europe/Madrid')::time;

  IF now_local < release_time THEN
    RAISE EXCEPTION
      'Las reservas para fechas futuras se abren a las %. Hoy puedes reservar normalmente.',
      to_char(release_time, 'HH24:MI')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
