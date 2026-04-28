-- Inscripciones a torneos: estado de confirmación por el admin.
-- El admin valida que la pareja es del nivel que dice antes de aceptarla.
--   pending   → recién inscrita, esperando validación del club
--   confirmed → admin acepta la pareja (entrará en el cuadro)
--   rejected  → admin rechaza (se le sugiere subir de categoría)
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_confirmation_status_chk'
  ) THEN
    ALTER TABLE public.tournament_registrations
      ADD CONSTRAINT tournament_registrations_confirmation_status_chk
      CHECK (confirmation_status IN ('pending', 'confirmed', 'rejected'));
  END IF;
END $$;
