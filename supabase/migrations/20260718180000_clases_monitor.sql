-- El monitor confirma AL FINAL DEL DÍA cuántas personas tuvo cada clase
-- (la realidad puede diferir de lo planificado por el admin). El control
-- horario usa SU confirmación; si no confirma, vale el grupo planificado.
CREATE TABLE IF NOT EXISTS public.clases_monitor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  court_id UUID NOT NULL,
  personas INT NOT NULL CHECK (personas BETWEEN 1 AND 4),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date, time_slot, court_id)
);

ALTER TABLE public.clases_monitor ENABLE ROW LEVEL SECURITY;

-- El monitor crea/edita SOLO sus confirmaciones
DROP POLICY IF EXISTS "Monitor confirma sus clases" ON public.clases_monitor;
CREATE POLICY "Monitor confirma sus clases"
  ON public.clases_monitor FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Monitor edita sus clases" ON public.clases_monitor;
CREATE POLICY "Monitor edita sus clases"
  ON public.clases_monitor FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ver clases propias o admin" ON public.clases_monitor;
CREATE POLICY "Ver clases propias o admin"
  ON public.clases_monitor FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
