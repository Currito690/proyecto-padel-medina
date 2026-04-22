-- Reglas de métodos de pago por pista + franja horaria + día de la semana.
-- day_of_week: -1 = aplica a todos los días, 0..6 = domingo..sábado (getDay() de JS).
-- Si NO existe fila para (court, slot, day) ni para (court, slot, -1), se permiten todos los métodos.
-- Métodos válidos: 'redsys' (tarjeta), 'bizum', 'club' (pago en recepción).

-- ── Crear tabla si no existe ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.court_payment_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id    uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  time_slot   text NOT NULL,
  day_of_week smallint NOT NULL DEFAULT -1,
  methods     text[] NOT NULL DEFAULT ARRAY['redsys','bizum','club'],
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Por si la tabla existía sin day_of_week (de la migración 20260421):
ALTER TABLE public.court_payment_rules
  ADD COLUMN IF NOT EXISTS day_of_week smallint NOT NULL DEFAULT -1;

-- ── Sustituir el UNIQUE viejo (court_id, time_slot) por uno que incluya día ──
ALTER TABLE public.court_payment_rules
  DROP CONSTRAINT IF EXISTS court_payment_rules_court_id_time_slot_key;
DROP INDEX IF EXISTS court_payment_rules_court_id_time_slot_key;

ALTER TABLE public.court_payment_rules
  DROP CONSTRAINT IF EXISTS court_payment_rules_unique;
ALTER TABLE public.court_payment_rules
  ADD CONSTRAINT court_payment_rules_unique
  UNIQUE (court_id, time_slot, day_of_week);

CREATE INDEX IF NOT EXISTS idx_court_payment_rules_court
  ON public.court_payment_rules (court_id);

-- ── RLS: lectura pública, escritura solo admin ────────────────────────────
ALTER TABLE public.court_payment_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view payment rules" ON public.court_payment_rules;
CREATE POLICY "Public can view payment rules"
  ON public.court_payment_rules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin manage payment rules" ON public.court_payment_rules;
CREATE POLICY "Admin manage payment rules"
  ON public.court_payment_rules
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@padelmedina.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'admin@padelmedina.com');
