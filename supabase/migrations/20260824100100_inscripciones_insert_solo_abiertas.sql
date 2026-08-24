-- Inscripciones a torneos: el INSERT público ya no puede "auto-pagarse",
-- "auto-confirmarse" ni entrar en torneos cerrados.
--
-- Problema: la policy "Anyone can register" era WITH CHECK (true). Con la anon
-- key (que va en el bundle de la web) cualquiera podía insertar una fila con
-- payment_status = 'paid', confirmation_status = 'confirmed', amount_paid, etc.
-- y apuntarse a torneos en borrador, cerrados o con el plazo vencido. El panel
-- se fía de esos campos (sincronizar inscripciones mete al cuadro las
-- 'confirmed'; el correo al club dice "✓ Pagado").
--
-- Qué hace:
--   1) Función public.torneo_admite_inscripciones(uuid): true solo si el
--      torneo existe, status = 'open', config.registrationClosed no es true,
--      config.bracketPublished no es true y, si hay
--      config.registrationDeadline (YYYY-MM-DD, con hora opcional en
--      config.registrationDeadlineTime, por defecto 23:59), aún no ha pasado
--      (hora de Madrid). Misma regla que TournamentRegistration.jsx.
--      SECURITY DEFINER para no depender de la policy pública de SELECT de
--      tournaments. Si el formato de fecha/hora es raro no bloquea (compatible
--      con configs antiguas).
--   2) Recrea "Anyone can register" forzando los valores de "inscripción
--      recién hecha": pago pending/not_required, sin importe ni fechas de
--      pago/confirmación, confirmation_status = 'pending', método card/club o
--      nulo. Es exactamente lo que envía TournamentRegistration.jsx.
--
-- No cambia nada para el admin (policy "Admins manage registrations" via
-- is_admin()) ni para redsys-notify (service_role, sin RLS).

CREATE OR REPLACE FUNCTION public.torneo_admite_inscripciones(t_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_status text;
  t_config jsonb;
  deadline_txt text;
  hora_txt text;
  limite timestamp;
BEGIN
  SELECT status, config INTO t_status, t_config
  FROM public.tournaments
  WHERE id = t_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF t_status IS DISTINCT FROM 'open' THEN
    RETURN false;
  END IF;
  IF lower(coalesce(t_config ->> 'registrationClosed', 'false')) = 'true' THEN
    RETURN false;
  END IF;
  IF lower(coalesce(t_config ->> 'bracketPublished', 'false')) = 'true' THEN
    RETURN false;
  END IF;

  -- Plazo de inscripción (opcional).
  deadline_txt := nullif(trim(coalesce(t_config ->> 'registrationDeadline', '')), '');
  IF deadline_txt IS NULL THEN
    RETURN true;
  END IF;
  IF deadline_txt !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN true; -- formato inesperado: no bloqueamos (config antigua)
  END IF;
  hora_txt := nullif(trim(coalesce(t_config ->> 'registrationDeadlineTime', '')), '');
  IF hora_txt IS NULL OR hora_txt !~ '^\d{2}:\d{2}$' THEN
    hora_txt := '23:59';
  END IF;
  BEGIN
    limite := (deadline_txt || ' ' || hora_txt)::timestamp;
  EXCEPTION WHEN OTHERS THEN
    RETURN true; -- fecha/hora inválida: no bloqueamos
  END;
  RETURN (now() AT TIME ZONE 'Europe/Madrid') <= limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.torneo_admite_inscripciones(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can register" ON public.tournament_registrations;
CREATE POLICY "Anyone can register"
  ON public.tournament_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    payment_status IN ('pending', 'not_required')
    AND (payment_method IS NULL OR payment_method IN ('card', 'club'))
    AND amount_paid IS NULL
    AND paid_at IS NULL
    AND confirmation_status = 'pending'
    AND confirmed_at IS NULL
    AND public.torneo_admite_inscripciones(tournament_id)
  );
