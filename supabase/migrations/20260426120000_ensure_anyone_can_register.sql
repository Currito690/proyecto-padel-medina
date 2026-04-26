-- Re-asegurar que la policy "Anyone can register" sigue presente. En las
-- migraciones de multi_admin se redefinió la policy de gestión de admin pero
-- por si acaso volvemos a recrear la pública para evitar 42501 al inscribirse
-- desde un usuario anónimo o cliente normal.

ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can register" ON public.tournament_registrations;
CREATE POLICY "Anyone can register"
  ON public.tournament_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
