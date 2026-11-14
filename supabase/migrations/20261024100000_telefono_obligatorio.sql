-- Teléfono obligatorio de los jugadores (petición del club, 24 de octubre de 2026).
--
-- Hasta ahora profiles.phone estaba VACÍO en todas las fichas: el registro lo
-- pedía, pero se quedaba en auth.users.raw_user_meta_data y handle_new_user no
-- lo copiaba. Con esta migración:
--   1. normalizar_telefono(): las mismas reglas que src/utils/telefono.js
--      ("+34667421519"; null si el número no vale).
--   2. Un trigger normaliza lo que entre en profiles.phone por cualquier sitio
--      (app, panel del admin, alta) y apunta cuándo lo puso el propio jugador.
--   3. handle_new_user copia el teléfono del registro a la ficha.
--   4. Se recuperan los teléfonos que ya dieron al registrarse.
--   5. Privacidad: la política "Manager select all profiles" dejaba leer TODAS
--      las fichas (nombre, correo y ahora el teléfono) a cualquier usuario con
--      sesión. Se sustituye por una solo para el monitor (que necesita los
--      nombres de quien reservó, en su agenda).

-- 1. Normalización ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_telefono(p text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
  s text;
  d text;
BEGIN
  -- Fuera espacios (también los de no separación que ponen Contactos y
  -- WhatsApp), puntos, guiones y paréntesis: "(+34) 667-42.15 19"
  s := regexp_replace(btrim(p), '[-\s.()   ﻿]', '', 'g');
  IF s = '' THEN RETURN NULL; END IF;
  IF s LIKE '00%' THEN s := '+' || substr(s, 3); END IF;
  IF s LIKE '+%' THEN
    d := substr(s, 2);
    IF d !~ '^[0-9]+$' THEN RETURN NULL; END IF;
    IF d LIKE '34%' THEN
      d := substr(d, 3);
    ELSE
      -- Otro país: entre 8 y 15 cifras, sin cero inicial y sin ser todo la misma cifra.
      IF length(d) < 8 OR length(d) > 15 OR d LIKE '0%' OR d ~ '^(\d)\1+$' THEN RETURN NULL; END IF;
      RETURN '+' || d;
    END IF;
  ELSE
    IF s !~ '^[0-9]+$' THEN RETURN NULL; END IF;
    d := CASE WHEN length(s) = 11 AND s LIKE '34%' THEN substr(s, 3) ELSE s END;
  END IF;
  -- Número español: 9 cifras, empieza por 6, 7, 8 o 9 y no es de relleno.
  IF d !~ '^[6-9][0-9]{8}$' THEN RETURN NULL; END IF;
  IF d ~ '^(\d)\1{8}$' OR d IN ('600000000', '123456789', '987654321') THEN RETURN NULL; END IF;
  RETURN '+34' || d;
END
$$;

-- 2. Trigger: guarda normalizado y apunta cuándo lo confirmó el jugador --------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz;
COMMENT ON COLUMN public.profiles.phone_confirmed_at IS
  'Cuándo puso (o cambió) el propio jugador su teléfono desde la app. Vacío en los recuperados del registro o escritos por el admin.';

CREATE OR REPLACE FUNCTION public.profiles_normaliza_telefono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  n := public.normalizar_telefono(NEW.phone);
  -- Si no vale, se guarda tal cual (recortado): la app lo da por "sin teléfono".
  NEW.phone := COALESCE(n, NULLIF(btrim(NEW.phone), ''));
  IF TG_OP = 'UPDATE' AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF n IS NOT NULL AND auth.uid() = NEW.id THEN
      NEW.phone_confirmed_at := now();   -- lo puso el propio jugador desde la app
    ELSE
      NEW.phone_confirmed_at := NULL;    -- se quitó, no vale o lo escribió el admin: sin confirmar
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS profiles_normaliza_telefono ON public.profiles;
CREATE TRIGGER profiles_normaliza_telefono
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_normaliza_telefono();

-- 3. El alta copia el teléfono del registro a la ficha ------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'admin@padelmedina.com' THEN 'admin'
      ELSE 'client'
    END,
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Recuperar los teléfonos que ya dieron al registrarse ---------------------
UPDATE public.profiles p
SET phone = public.normalizar_telefono(u.raw_user_meta_data->>'phone')
FROM auth.users u
WHERE u.id = p.id
  AND NULLIF(btrim(COALESCE(p.phone, '')), '') IS NULL
  AND public.normalizar_telefono(u.raw_user_meta_data->>'phone') IS NOT NULL;

-- 5. Privacidad: solo cada uno ve su ficha; el admin y el monitor, todas -------
CREATE OR REPLACE FUNCTION public.es_monitor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('monitor', 'manager')
  )
  OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN ('lolo@padelmedina.com', 'play-review-monitor@padelmedina.com');
$$;

DROP POLICY IF EXISTS "Manager select all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Monitor ve los perfiles" ON public.profiles;
CREATE POLICY "Monitor ve los perfiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.es_monitor());

-- 6. Cada jugador puede editar su ficha (nombre, teléfono), pero no lo que es
-- cosa del club. El guardián que ya impedía cambiarse el rol vigila también la
-- baja (banned), la tarifa y la fecha de confirmación del teléfono, que solo
-- escribe el trigger de arriba. Un jugador dado de baja podía quitarse la baja
-- con una petición a mano a la API (fallo anterior a esta migración).
CREATE OR REPLACE FUNCTION public.profiles_bloquea_cambio_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.banned IS DISTINCT FROM OLD.banned
      OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
      OR NEW.phone_confirmed_at IS DISTINCT FROM OLD.phone_confirmed_at)
     AND COALESCE(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar ese dato'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_bloquea_cambio_role ON public.profiles;
CREATE TRIGGER profiles_bloquea_cambio_role
  BEFORE UPDATE OF role, banned, hourly_rate, phone_confirmed_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_bloquea_cambio_role();
