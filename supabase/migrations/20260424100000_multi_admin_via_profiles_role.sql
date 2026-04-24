-- Multi-admin: cambiar todas las policies de escritura que hardcodean el email
-- admin@padelmedina.com por una comprobación contra profiles.role = 'admin'.
-- De esta forma el club puede dar permisos de admin a quien quiera desde
-- Supabase con:   UPDATE profiles SET role = 'admin' WHERE email = '…';

-- ── Asegurar que profiles tiene la columna role ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client';

-- Hacer que el admin original siga siendo admin tras la migración
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@padelmedina.com';

-- Helper: función estable para comprobar si el usuario actual es admin.
-- SECURITY DEFINER para que la policy pueda leer profiles aunque el usuario
-- no tenga SELECT directo sobre la tabla.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── tournaments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage tournaments" ON public.tournaments;
CREATE POLICY "Admins manage tournaments"
  ON public.tournaments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── tournament_registrations ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage registrations" ON public.tournament_registrations;
CREATE POLICY "Admins manage registrations"
  ON public.tournament_registrations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── events ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage all events" ON public.events;
CREATE POLICY "Admins manage all events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── court_payment_rules ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin manage payment rules" ON public.court_payment_rules;
CREATE POLICY "Admin manage payment rules"
  ON public.court_payment_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Permitir que cualquier usuario autenticado lea su propio rol
-- (necesario para que AuthContext.jsx del frontend pueda resolverlo).
DROP POLICY IF EXISTS "Users read own profile role" ON public.profiles;
CREATE POLICY "Users read own profile role"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
