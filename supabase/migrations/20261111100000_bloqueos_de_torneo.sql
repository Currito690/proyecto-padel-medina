-- Bloqueos automáticos de las pistas del torneo (11/11/2026).
-- El panel de torneos crea un bloqueo tipo 'torneo' por cada partido con
-- hora y pista, con el torneo al que pertenece, y lo mueve/borra cuando
-- cambia el cuadro. Al borrar el torneo se borran sus bloqueos.
ALTER TABLE public.blocked_slots
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.blocked_slots DROP CONSTRAINT IF EXISTS blocked_slots_tipo_chk;
ALTER TABLE public.blocked_slots
  ADD CONSTRAINT blocked_slots_tipo_chk CHECK (tipo IN ('bloqueado', 'entreno', 'torneo'));

CREATE INDEX IF NOT EXISTS blocked_slots_tournament_idx ON public.blocked_slots (tournament_id) WHERE tournament_id IS NOT NULL;

-- Que PostgREST vea la columna nueva ya (el event trigger pgrst_ddl_watch
-- también lo hace; esto es por si acaso).
NOTIFY pgrst, 'reload schema';
