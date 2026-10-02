-- ============================================================
-- Padel Medina · cambios de base de datos a aplicar en produccion
-- Generado el 2026-10-02. Aplicar ANTES de desplegar la web nueva
-- (la web ya usa la columna bookings.importe).
-- ============================================================
BEGIN;

-- 1) Rol cliente por defecto (cierra el agujero del correo con 'admin')
-- Las altas nuevas son SIEMPRE 'client'. Antes, cualquier correo que CONTUVIERA
-- la palabra "admin" (p. ej. "badminton@..." o "admin.lopez@gmail.com") recibia
-- rol de administrador al registrarse: un agujero de seguridad. Los admin se
-- promocionan a mano con UPDATE profiles SET role='admin' WHERE email='...'.
-- Hay que reaplicar este trigger tras cualquier restauracion de la base de datos.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'admin@padelmedina.com' THEN 'admin'
      ELSE 'client'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2) Columnas bookings.importe y bookings.reminder_sent
-- Dos columnas que faltaban en bookings:
--
-- importe (numeric): el precio cobrado por esa reserva, en euros. Hasta ahora no
-- se guardaba, asi que Finanzas recalculaba el pasado con el precio actual de la
-- pista (si cambiabas un precio, cambiaba el valor de reservas ya hechas). Se
-- rellena al crear la reserva (club, tarjeta/bizum via redsys-notify, y manual).
-- Las reservas antiguas quedan en NULL y Finanzas cae al calculo de siempre.
--
-- reminder_sent (boolean): la funcion send-reminders la usa para no repetir el
-- aviso "Juegas en 10h", pero la columna no existia en este servidor, asi que la
-- funcion fallaba nada mas ejecutarse. Sin ella, los recordatorios no pueden
-- funcionar.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS importe numeric;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- 3) Rechazar reservas de usuarios dados de baja
-- "Dar de baja" a un jugador solo se aplicaba en la pantalla: la API seguia
-- aceptando sus reservas. Este trigger rechaza en la base de datos cualquier
-- reserva creada por un usuario marcado como banned, salvo que la cree un admin
-- (el admin puede seguir reservando para quien sea).

CREATE OR REPLACE FUNCTION public.bookings_rechaza_baneados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Los admin pueden crear reservas para cualquiera.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND banned IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tu cuenta esta dada de baja y no puede hacer reservas. Contacta con el club.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bookings_rechaza_baneados ON public.bookings;
CREATE TRIGGER trg_bookings_rechaza_baneados
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_rechaza_baneados();

-- 4) Afinar el borrado de cuenta (fichajes + reservas no jugadas)
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

-- 4b) Un cliente solo puede CANCELAR su reserva, nunca confirmarla sin pagar.
DROP POLICY IF EXISTS "Usuarios cancelan sus reservas" ON public.bookings;
CREATE POLICY "Usuarios cancelan sus reservas" ON public.bookings
  FOR UPDATE
  USING ( auth.uid() = user_id OR public.is_admin() )
  WITH CHECK ( public.is_admin() OR status = 'cancelled' );

-- 5) DATOS: arreglar el jueves vacio (los clientes no veian 'Pago en el club')
UPDATE public.site_settings SET club_hours = jsonb_set(club_hours::jsonb, '{4}', '"00:00"'::jsonb)::json WHERE (club_hours::jsonb ->> '4') = '';

-- 6) DATOS: quitar las 4 reglas sobrantes del miercoles de Pista 1 (vuelven a 'heredado')
DELETE FROM public.court_payment_rules WHERE day_of_week = 3 AND court_id = '13fb4ae3-aca6-4e06-97e5-1c014a782fc9';

-- 7) DATOS: cerrar las 3 reservas atascadas en 'pendiente_pago' desde agosto/septiembre
UPDATE public.bookings SET status = 'cancelled' WHERE status = 'pendiente_pago' AND created_at < now() - interval '1 day';

COMMIT;

-- 8) DATOS (ejecutar APARTE, DESPUES de desplegar la web, para que no se vuelvan a acumular):
--    borra las suscripciones push muertas; el admin crea una limpia al entrar.
-- DELETE FROM public.push_subscriptions;
