-- Reglas de métodos de pago por pista + franja horaria.
-- Si NO existe fila para un (court_id, time_slot), se permiten todos los métodos.
-- Si existe, solo se permiten los métodos listados en methods[].
-- Métodos válidos: 'redsys' (tarjeta), 'bizum', 'club' (pago en recepción).

CREATE TABLE IF NOT EXISTS public.court_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  time_slot text NOT NULL,
  methods text[] NOT NULL DEFAULT ARRAY['redsys','bizum','club'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (court_id, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_court_payment_rules_court
  ON public.court_payment_rules (court_id);

ALTER TABLE public.court_payment_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view payment rules" ON public.court_payment_rules;
CREATE POLICY "Public can view payment rules"
  ON public.court_payment_rules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin manage payment rules" ON public.court_payment_rules;
CREATE POLICY "Admin manage payment rules"
  ON public.court_payment_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
