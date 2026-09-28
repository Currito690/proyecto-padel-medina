-- 2026-09-28: borrado de cuenta por el propio usuario.
--
-- Google Play exige que una app que permite crear cuenta permita también
-- borrarla desde dentro de la app. El problema: bookings.user_id apunta a
-- auth.users con ON DELETE CASCADE, así que borrar al usuario se llevaría por
-- delante sus reservas y, con ellas, la contabilidad del club.
--
-- Solución: antes de borrar al usuario, sus reservas se reasignan a una cuenta
-- fija "Cliente eliminado". El club conserva el histórico y los importes; los
-- datos personales (nombre, correo, teléfono, cuenta de acceso) desaparecen.

-- ── 1. Cuenta fija a la que se reasignan las reservas ──────────────────────
-- No tiene contraseña ni correo confirmado: no se puede iniciar sesión con ella.
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'cliente-eliminado@padelmedina.com',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Cliente eliminado"}'::jsonb,
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, name, role, banned)
VALUES ('00000000-0000-4000-8000-000000000001', 'cliente-eliminado@padelmedina.com', 'Cliente eliminado', 'client', true)
ON CONFLICT (id) DO UPDATE SET name = 'Cliente eliminado', banned = true;

-- ── 2. Función de borrado ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eliminar_mi_cuenta()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rol text;
  v_email text;
  v_anonimo uuid := '00000000-0000-4000-8000-000000000001';
  v_futuras int := 0;
  v_reservas int := 0;
  v_inscripciones int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión iniciada';
  END IF;

  IF v_uid = v_anonimo THEN
    RAISE EXCEPTION 'Esta cuenta no se puede eliminar';
  END IF;

  SELECT role, email INTO v_rol, v_email FROM public.profiles WHERE id = v_uid;

  -- El personal del club (administradores y monitores) no puede darse de baja
  -- solo: se llevaría por delante fichajes, clases y la gestión del club. Tiene
  -- que pedirlo al club, que lo hace desde el panel.
  IF v_rol IS DISTINCT FROM 'client' THEN
    RAISE EXCEPTION 'Las cuentas del personal del club no pueden eliminarse desde la app. Escribe a padelmedina@hotmail.com';
  END IF;

  -- Red de seguridad: si la cuenta tiene partes de trabajo, es personal del club
  -- aunque su perfil diga otra cosa. No se borra (además la clave ajena lo
  -- impediría con un error ilegible).
  IF EXISTS (SELECT 1 FROM public.time_logs WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Esta cuenta tiene partes de trabajo del club. Escribe a padelmedina@hotmail.com para darla de baja';
  END IF;

  -- Reservas futuras: se cancelan (el hueco queda libre para otro jugador).
  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE user_id = v_uid
     AND status = 'confirmed'
     AND date >= (now() AT TIME ZONE 'Europe/Madrid')::date;
  GET DIAGNOSTICS v_futuras = ROW_COUNT;

  -- Todas sus reservas pasan a la cuenta anónima: el club conserva el histórico
  -- y los cobros, sin ningún dato personal.
  UPDATE public.bookings SET user_id = v_anonimo WHERE user_id = v_uid;
  GET DIAGNOSTICS v_reservas = ROW_COUNT;

  -- Inscripciones a torneos: se conserva la fila (el cuadro y los resultados no
  -- se tocan) pero se borran los datos personales del jugador.
  IF v_email IS NOT NULL THEN
    UPDATE public.tournament_registrations
       SET player1_name = 'Jugador eliminado', player1_email = NULL, player1_phone = NULL
     WHERE lower(player1_email) = lower(v_email);
    GET DIAGNOSTICS v_inscripciones = ROW_COUNT;

    UPDATE public.tournament_registrations
       SET player2_name = 'Jugador eliminado', player2_email = NULL, player2_phone = NULL
     WHERE lower(player2_email) = lower(v_email);
  END IF;

  -- Avisos push del dispositivo.
  DELETE FROM public.push_subscriptions WHERE user_id = v_uid;

  -- Y por último la cuenta: el perfil cae en cascada con el usuario.
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'reservas_reasignadas', v_reservas,
    'reservas_futuras_canceladas', v_futuras,
    'inscripciones_anonimizadas', v_inscripciones
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_mi_cuenta() FROM public;
GRANT EXECUTE ON FUNCTION public.eliminar_mi_cuenta() TO authenticated;
