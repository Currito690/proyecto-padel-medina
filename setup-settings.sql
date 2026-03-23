-- Crear tabla de configuración global
CREATE TABLE IF NOT EXISTS site_settings (
  id integer PRIMARY KEY DEFAULT 1,
  booking_window_days integer NOT NULL DEFAULT 7,
  court_price numeric NOT NULL DEFAULT 18.00,
  -- Asegurar que solo pueda haber una fila en la tabla de configuración
  CONSTRAINT single_row CHECK (id = 1)
);

-- Habilitar Políticas de Seguridad (RLS)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Política 1: Todos (incluso usuarios no autenticados o clientes) pueden LEER la configuración
CREATE POLICY "Cualquiera puede leer la configuración"
  ON site_settings FOR SELECT
  USING (true);

-- Política 2: Solo administradores pueden MODIFICAR la configuración
-- Nota: Aseguramos que solo los admins puedan hacer UPDATE.
CREATE POLICY "Solo administradores modifican"
  ON site_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Asegurarse de que exista la fila por defecto inicial
INSERT INTO site_settings (id, booking_window_days, court_price)
VALUES (1, 7, 18.00)
ON CONFLICT (id) DO NOTHING;
