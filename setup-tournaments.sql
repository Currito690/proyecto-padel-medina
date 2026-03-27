-- ============================================
-- PADEL MEDINA - Setup Public Tournaments
-- ============================================

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view open tournaments" ON tournaments;
CREATE POLICY "Public can view open tournaments" ON tournaments FOR SELECT USING (status = 'open');
DROP POLICY IF EXISTS "Admins manage their tournaments" ON tournaments;
CREATE POLICY "Admins manage their tournaments" ON tournaments FOR ALL USING (auth.uid() = admin_id);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  player1_name TEXT NOT NULL,
  player1_email TEXT,
  player1_phone TEXT,
  player2_name TEXT NOT NULL,
  player2_email TEXT,
  player2_phone TEXT,
  unavailable_times JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can register" ON tournament_registrations;
CREATE POLICY "Anyone can register" ON tournament_registrations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins view registrations" ON tournament_registrations;
CREATE POLICY "Admins view registrations" ON tournament_registrations FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_registrations.tournament_id AND t.admin_id = auth.uid())
);
