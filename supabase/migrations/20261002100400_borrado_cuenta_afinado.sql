-- Dos correcciones en eliminar_mi_cuenta():
-- 1) La red de seguridad miraba public.time_logs, que no es la tabla de partes de
--    trabajo del club: la real es public.fichajes. Un cliente con fichajes (caso
--    raro) debe tratarse como personal y no poder borrarse solo.
-- 2) Al cancelar "reservas futuras" se cancelaban tambien las de HOY ya jugadas.
--    Ahora solo se cancelan las que aun no han terminado (hora de fin > ahora).

CREATE OR REPLACE FUNCTION public.eliminar_mi_cuenta()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- El personal del club (administradores y monitores) no puede darse de baja solo.
  IF v_rol IS DISTINCT FROM 'client' THEN
    RAISE EXCEPTION 'Las cuentas del personal del club no pueden eliminarse desde la app. Escribe a padelmedina@hotmail.com';
  END IF;

  -- Red de seguridad: si la cuenta tiene fichajes (partes de trabajo), es personal
  -- del club aunque su perfil diga otra cosa. No se borra.
  IF EXISTS (SELECT 1 FROM public.fichajes WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Esta cuenta tiene partes de trabajo del club. Escribe a padelmedina@hotmail.com para darla de baja';
  END IF;

  -- Reservas que AÚN NO han terminado: se cancelan (el hueco queda libre). Se
  -- compara la hora de fin de la franja ("HH:MM - HH:MM") con la hora actual de
  -- Madrid; las de hoy ya jugadas no se tocan.
  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE user_id = v_uid
     AND status = 'confirmed'
     AND ((date::text || ' ' || split_part(time_slot, ' - ', 2))::timestamp
            AT TIME ZONE 'Europe/Madrid') > now();
  GET DIAGNOSTICS v_futuras = ROW_COUNT;

  -- Todas sus reservas pasan a la cuenta anónima: el club conserva el histórico
  -- y los cobros, sin ningún dato personal.
  UPDATE public.bookings SET user_id = v_anonimo WHERE user_id = v_uid;
  GET DIAGNOSTICS v_reservas = ROW_COUNT;

  -- Inscripciones a torneos: se conserva la fila, se borran los datos personales.
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
$function$;
