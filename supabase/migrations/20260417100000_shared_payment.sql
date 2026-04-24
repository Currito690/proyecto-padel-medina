-- Añadir columnas de pago compartido a bookings (si no existen)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS split_phones JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS split_paid INTEGER DEFAULT 4;

-- Tabla de tokens para pago compartido de acompañantes
CREATE TABLE IF NOT EXISTS shared_payment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  amount NUMERIC(8,2) NOT NULL,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permitir acceso anónimo a tokens (necesario para que el amigo pague sin estar logueado)
ALTER TABLE shared_payment_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read their token" ON shared_payment_tokens
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert tokens" ON shared_payment_tokens
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update tokens" ON shared_payment_tokens
  FOR UPDATE USING (true);
