-- CORREGIR HORA DE FICHAJE (admin): si a lolo se le olvida picar y pica más
-- tarde, el admin puede corregir la HORA de cualquier fichaje desde CONTROL
-- HORARIO. Requiere tener aplicada antes la migración fichajes_manual_admin.
--
-- Garantías (las da la BD, no la app):
--  · Solo el admin puede actualizar, y SOLO la columna fichado_at: la firma,
--    el GPS, el tipo y el dueño de la fila son intocables (GRANT por columna).
--  · El RASTRO lo escribe un TRIGGER del servidor: hora original (la primera),
--    quién editó y cuándo. Ni se puede falsear ni se puede borrar.
--  · Tampoco por INSERT se puede colar un rastro inventado (políticas abajo).

ALTER TABLE public.fichajes
  ADD COLUMN IF NOT EXISTS hora_original TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editado_por UUID,
  ADD COLUMN IF NOT EXISTS editado_at TIMESTAMPTZ;

-- Solo el admin puede actualizar (el trabajador sigue sin poder tocar nada)
DROP POLICY IF EXISTS "Admin edita hora de fichaje" ON public.fichajes;
CREATE POLICY "Admin edita hora de fichaje"
  ON public.fichajes FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ...y SOLO la hora: ni firma, ni lat/lng, ni tipo, ni user_id, ni siquiera
-- el rastro de edición (ese lo mantiene el trigger de abajo).
REVOKE UPDATE ON public.fichajes FROM authenticated;
GRANT UPDATE (fichado_at) ON public.fichajes TO authenticated;

-- El rastro lo pone SIEMPRE el servidor al cambiar la hora: conserva la
-- PRIMERA hora original aunque se edite varias veces, apunta quién y cuándo,
-- y de paso impide poner el fichaje en el futuro.
CREATE OR REPLACE FUNCTION public.fichajes_audita_edicion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fichado_at IS DISTINCT FROM OLD.fichado_at THEN
    IF NEW.fichado_at > now() THEN
      RAISE EXCEPTION 'La hora del fichaje no puede estar en el futuro';
    END IF;
    NEW.hora_original := COALESCE(OLD.hora_original, OLD.fichado_at);
    NEW.editado_por := auth.uid();
    NEW.editado_at := now();
  ELSE
    -- Sin cambio de hora, el rastro no se toca (ni se puede limpiar)
    NEW.hora_original := OLD.hora_original;
    NEW.editado_por := OLD.editado_por;
    NEW.editado_at := OLD.editado_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fichajes_audita_edicion ON public.fichajes;
CREATE TRIGGER trg_fichajes_audita_edicion
  BEFORE UPDATE ON public.fichajes
  FOR EACH ROW EXECUTE FUNCTION public.fichajes_audita_edicion();

-- Las políticas de INSERT tampoco dejan estrenar una fila con rastro
-- inventado (p. ej. un fichaje "corregido por el admin" que nadie corrigió).
DROP POLICY IF EXISTS "Trabajador ficha" ON public.fichajes;
CREATE POLICY "Trabajador ficha"
  ON public.fichajes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND manual = false AND creado_por IS NULL AND fichado_at = now()
    AND hora_original IS NULL AND editado_por IS NULL AND editado_at IS NULL);

DROP POLICY IF EXISTS "Admin anade fichaje manual" ON public.fichajes;
CREATE POLICY "Admin anade fichaje manual"
  ON public.fichajes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND manual = true AND creado_por = auth.uid()
    AND hora_original IS NULL AND editado_por IS NULL AND editado_at IS NULL);
