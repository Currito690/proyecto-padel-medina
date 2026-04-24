-- Hora a partir de la cual se activa el pago en el club (NULL o '00:00' = siempre disponible)
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS club_open_time TIME DEFAULT '00:00';
