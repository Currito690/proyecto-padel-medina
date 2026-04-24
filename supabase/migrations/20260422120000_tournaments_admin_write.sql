-- Políticas RLS de escritura para torneos e inscripciones.
-- La tabla tournaments ya tenía ENABLE ROW LEVEL SECURITY + política de SELECT pública,
-- pero NINGUNA política de INSERT/UPDATE/DELETE → el admin no podía guardar ni borrar
-- nada desde el cliente (las operaciones fallaban en silencio por RLS).

-- ── tournaments ────────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tournaments" ON public.tournaments;
CREATE POLICY "Admins manage tournaments"
  ON public.tournaments
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@padelmedina.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'admin@padelmedina.com');

-- ── tournament_registrations ──────────────────────────────────────────────────
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

-- Cualquier jugador (anónimo o autenticado) puede inscribirse
DROP POLICY IF EXISTS "Anyone can register" ON public.tournament_registrations;
CREATE POLICY "Anyone can register"
  ON public.tournament_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- El admin puede leer / borrar / actualizar cualquier inscripción
DROP POLICY IF EXISTS "Admins manage registrations" ON public.tournament_registrations;
CREATE POLICY "Admins manage registrations"
  ON public.tournament_registrations
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@padelmedina.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'admin@padelmedina.com');
