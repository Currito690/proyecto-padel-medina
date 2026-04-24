-- Configuración de cancelación de reservas por parte del cliente
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS cancellation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS cancellation_hours INTEGER NOT NULL DEFAULT 24;
