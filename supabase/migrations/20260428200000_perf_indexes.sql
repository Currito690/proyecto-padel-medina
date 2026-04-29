-- Índices de rendimiento para soportar carga alta tras el lanzamiento
-- oficial. Cubrimos los patrones de query más frecuentes detectados en
-- el frontend. Todos son CREATE INDEX IF NOT EXISTS — idempotentes.
--
-- bookings ─────────────────────────────────────────────────────────
-- Patrón principal: cargar slots de una pista concreta en una fecha.
-- "select time_slot where court_id=? and date=? and status='confirmed'"
CREATE INDEX IF NOT EXISTS idx_bookings_court_date_status
  ON public.bookings (court_id, date, status);

-- "select * where user_id=? order by date desc" (Mis Reservas)
CREATE INDEX IF NOT EXISTS idx_bookings_user_date
  ON public.bookings (user_id, date DESC);

-- Recordatorios: "select where date=today and status='confirmed'"
CREATE INDEX IF NOT EXISTS idx_bookings_date_status
  ON public.bookings (date, status);

-- blocked_slots ────────────────────────────────────────────────────
-- "select where court_id=? and date=?"
CREATE INDEX IF NOT EXISTS idx_blocked_slots_court_date
  ON public.blocked_slots (court_id, date);

-- events ───────────────────────────────────────────────────────────
-- "select where published=true order by event_date"
CREATE INDEX IF NOT EXISTS idx_events_published_date
  ON public.events (published, event_date);

-- tournaments ──────────────────────────────────────────────────────
-- "select where status='open' order by created_at desc" (banner home,
-- listado público) y "order by created_at desc" (panel admin).
CREATE INDEX IF NOT EXISTS idx_tournaments_status_created
  ON public.tournaments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_created
  ON public.tournaments (created_at DESC);

-- tournament_registrations ─────────────────────────────────────────
-- Ya hay idx en tournament_id; añadimos uno secundario para los
-- listados de admin que ordenan por created_at y filtran por estado
-- de confirmación.
CREATE INDEX IF NOT EXISTS idx_tournament_regs_tournament_created
  ON public.tournament_registrations (tournament_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_regs_confirmation
  ON public.tournament_registrations (tournament_id, confirmation_status);

-- profiles ─────────────────────────────────────────────────────────
-- Lookups por role (filtrado de admins) y banned (chequeo en login).
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);
