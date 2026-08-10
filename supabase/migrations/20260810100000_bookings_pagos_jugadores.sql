-- Cómo pagó CADA JUGADOR de una reserva de pista (lo marca el admin al pulsar
-- la reserva en su Horario): ['tarjeta','bizum','club', null...] — null = sin
-- marcar. Es independiente de metodo_pago (método con el que se creó la
-- reserva) y complementario a cobro_confirmado ("pista pagada" del todo, el
-- mismo check que usa Finanzas).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pagos_jugadores JSONB DEFAULT '[]'::jsonb;
