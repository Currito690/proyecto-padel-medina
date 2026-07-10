-- Confirmación de cobro de reservas pagadas en el club o creadas a mano:
-- el admin marca desde Finanzas cuándo el dinero se ha cobrado de verdad.
-- (Las de tarjeta/bizum se consideran cobradas automáticamente al pagar online.)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cobro_confirmado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobrado_at TIMESTAMPTZ;
