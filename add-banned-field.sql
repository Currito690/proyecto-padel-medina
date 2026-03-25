-- ============================================
-- MIGRACIÓN: campo banned en profiles
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================

-- 1. Añadir columna banned (si no existe)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;

-- 2. Política para que los admins puedan actualizar perfiles (banear/desbanear)
DROP POLICY IF EXISTS "Admins editan perfiles" ON profiles;
CREATE POLICY "Admins editan perfiles" ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
