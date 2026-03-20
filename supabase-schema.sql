-- ============================================
-- PADEL MEDINA — Schema Supabase
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================

-- 1. TABLA: courts (pistas)
CREATE TABLE courts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  location TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  gradient TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLA: profiles (extiende auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA: bookings (reservas)
CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID REFERENCES courts ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  is_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice único: solo una reserva confirmada por pista/fecha/franja
CREATE UNIQUE INDEX bookings_unique_confirmed
  ON bookings (court_id, date, time_slot)
  WHERE status = 'confirmed';

-- 4. TABLA: blocked_slots (franjas bloqueadas)
CREATE TABLE blocked_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID REFERENCES courts ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (court_id, date, time_slot)
);

-- ============================================
-- DATOS INICIALES: pistas
-- ============================================
INSERT INTO courts (name, sport, location, gradient) VALUES
  ('Pista 1', 'Pádel', 'Nave 1', 'linear-gradient(135deg, #16A34A 0%, #059669 100%)'),
  ('Pista 2', 'Pádel', 'Nave 2', 'linear-gradient(135deg, #15803D 0%, #166534 100%)'),
  ('Pista 3', 'Pickleball', 'Nave 1', 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)');

-- ============================================
-- TRIGGER: crear perfil automáticamente al registrarse
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email ILIKE '%admin%' THEN 'admin'
      WHEN NEW.email = 'admin@padelmedina.com' THEN 'admin'
      ELSE 'client'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Usuarios ven su perfil" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuarios editan su perfil" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins ven todos los perfiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- courts: todos pueden ver, solo admins modifican
CREATE POLICY "Todos ven pistas" ON courts FOR SELECT USING (true);
CREATE POLICY "Admins modifican pistas" ON courts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- bookings: todos ven las confirmadas (para saber disponibilidad), cada uno ve las suyas, admins ven todas
CREATE POLICY "Todos ven reservas confirmadas" ON bookings FOR SELECT USING (
  status = 'confirmed'
);
CREATE POLICY "Usuarios ven sus reservas" ON bookings FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Usuarios crean reservas" ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuarios cancelan sus reservas" ON bookings FOR UPDATE USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- blocked_slots: todos ven, solo admins gestionan
CREATE POLICY "Todos ven bloqueados" ON blocked_slots FOR SELECT USING (true);
CREATE POLICY "Admins gestionan bloqueados" ON blocked_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
