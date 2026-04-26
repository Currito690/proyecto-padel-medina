-- Inscripciones: talla de camiseta (si el torneo regala camiseta) + estado de pago.
-- El "regalo por inscripción" y la config de pago viven en tournaments.config (JSONB)
-- así que no necesitan columnas nuevas, solo claves dentro del JSON:
--   config.gift: 'none' | 'shirt' | 'material'
--   config.registrationFeeEnabled: bool
--   config.registrationFeeAmount: number (EUR)
--   config.registrationFeeCurrency: 'EUR'
--   config.registrationFeeRequired: bool

ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS shirt_size text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Restricción: payment_status válido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_payment_status_chk'
  ) THEN
    ALTER TABLE public.tournament_registrations
      ADD CONSTRAINT tournament_registrations_payment_status_chk
      CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_shirt_size_chk'
  ) THEN
    ALTER TABLE public.tournament_registrations
      ADD CONSTRAINT tournament_registrations_shirt_size_chk
      CHECK (shirt_size IS NULL OR shirt_size IN ('XS','S','M','L','XL','XXL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament
  ON public.tournament_registrations (tournament_id);
