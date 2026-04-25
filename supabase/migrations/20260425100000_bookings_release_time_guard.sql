-- Bloquea inserciones en `bookings` antes de la hora de apertura configurada
-- en site_settings.slots_release_time. El admin queda exento (puede reservar
-- cualquier momento desde el panel).
--
-- Comparación en zona horaria del club (Europe/Madrid) para evitar el desfase
-- UTC del servidor.

CREATE OR REPLACE FUNCTION public.enforce_bookings_release_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  release_time TIME;
  now_local TIME;
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
    RETURN NEW; -- sin restricción
  END IF;

  now_local := (now() AT TIME ZONE 'Europe/Madrid')::time;

  IF now_local < release_time THEN
    RAISE EXCEPTION
      'Las reservas se abren a las %. Vuelve en ese momento para reservar.',
      to_char(release_time, 'HH24:MI')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_release_time ON public.bookings;
CREATE TRIGGER trg_bookings_release_time
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bookings_release_time();
