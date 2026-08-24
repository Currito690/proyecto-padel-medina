-- Bloquea que un usuario se cambie a sí mismo el rol (profiles.role).
--
-- Problema: la policy "Usuarios editan su perfil" (supabase-schema.sql) permite
-- UPDATE sobre la propia fila sin WITH CHECK ni límite de columnas. Como desde
-- 20260424100000 todo lo de torneos/inscripciones/eventos se protege con
-- public.is_admin() (profiles.role = 'admin'), cualquier jugador podía hacer
-- PATCH /rest/v1/profiles?id=eq.<su uuid> {"role":"admin"} y convertirse en
-- admin de todo.
--
-- Qué hace:
--   1) Trigger BEFORE UPDATE OF role que aborta si el rol cambia y quien lo
--      hace es un usuario normal (anon/authenticated sin rol admin).
--      - El SQL editor (postgres) y el service_role NO llevan JWT de usuario,
--        así que siguen pudiendo promocionar admins como está documentado:
--        UPDATE profiles SET role = 'admin' WHERE email = '…';
--      - Un admin logueado puede seguir cambiando roles desde el panel.
--      - Cambiar `banned`, `name`, `phone`, etc. no se ve afectado (el trigger
--        solo salta si el UPDATE toca la columna role y su valor cambia).
--   2) Recrea la policy de auto-edición con WITH CHECK explícito (la fila
--      resultante sigue siendo la del propio usuario).

CREATE OR REPLACE FUNCTION public.profiles_bloquea_cambio_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND COALESCE(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el rol'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_bloquea_cambio_role ON public.profiles;
CREATE TRIGGER profiles_bloquea_cambio_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_bloquea_cambio_role();

-- Misma policy que antes pero con WITH CHECK: la fila actualizada tiene que
-- seguir siendo la del propio usuario. El rol lo vigila el trigger de arriba.
DROP POLICY IF EXISTS "Usuarios editan su perfil" ON public.profiles;
CREATE POLICY "Usuarios editan su perfil"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
