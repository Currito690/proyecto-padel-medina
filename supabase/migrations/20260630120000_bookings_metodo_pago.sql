-- Guarda el método de pago usado en cada reserva, para que el admin lo vea en
-- la sección de pistas. Valores: 'club', 'tarjeta', 'bizum', 'gratis', 'manual'.
-- Nullable: las reservas antiguas quedan en NULL (el frontend hace un fallback).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS metodo_pago TEXT;
