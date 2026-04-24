-- Añadir precio individual por pista (NULL = usa precio global de site_settings)
ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS price NUMERIC(8,2) DEFAULT NULL;
