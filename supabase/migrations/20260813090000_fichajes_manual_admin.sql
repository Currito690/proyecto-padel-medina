-- TURNOS MANUALES: si al trabajador se le olvida fichar, el ADMIN puede
-- añadir la jornada a mano desde CONTROL HORARIO. Queda marcada como manual
-- (manual = true, sin firma ni GPS), con quién la añadió y una nota opcional.
-- Los fichajes firmados por el trabajador siguen siendo inmutables: el admin
-- solo puede insertar y borrar fichajes MANUALES, nunca tocar los firmados.

ALTER TABLE public.fichajes
  ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS nota TEXT;

-- Se ENDURECE la política de INSERT del trabajador: las políticas permisivas
-- se suman con OR, así que sin el "manual = false" el propio trabajador podría
-- insertarse turnos falsos marcados como añadidos por el admin. Y con
-- "fichado_at = now()" la hora la pone SÍ o SÍ el servidor: el default now()
-- de la columna vale el mismo now() de la transacción, así que el fichaje
-- normal de la app pasa, pero una hora inventada enviada por la API no.
DROP POLICY IF EXISTS "Trabajador ficha" ON public.fichajes;
CREATE POLICY "Trabajador ficha"
  ON public.fichajes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND manual = false AND creado_por IS NULL AND fichado_at = now());

-- El admin inserta turnos manuales para cualquier trabajador, siempre
-- marcados como manual y firmados con su propio uuid en creado_por.
DROP POLICY IF EXISTS "Admin anade fichaje manual" ON public.fichajes;
CREATE POLICY "Admin anade fichaje manual"
  ON public.fichajes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND manual = true AND creado_por = auth.uid());

DROP POLICY IF EXISTS "Admin borra fichajes manuales" ON public.fichajes;
CREATE POLICY "Admin borra fichajes manuales"
  ON public.fichajes FOR DELETE TO authenticated
  USING (public.is_admin() AND manual = true);
