-- Permitir que cualquier usuario (incluidos anónimos) vea la lista de torneos.
-- Esto es necesario para la sección /torneos donde listamos todos los torneos
-- creados por el admin. Las inscripciones siguen restringidas por sus propias
-- políticas.

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Quita cualquier política previa con este nombre (idempotente)
DROP POLICY IF EXISTS "Public can view tournaments" ON public.tournaments;

CREATE POLICY "Public can view tournaments"
  ON public.tournaments FOR SELECT
  USING (true);
