-- RESERVAS ENCIMA DE UN BLOQUEO O DE OTRA RESERVA (14/11/2026).
--
-- La base de datos no miraba los bloqueos al crear una reserva: la única
-- política de INSERT de bookings es "Usuarios crean reservas" (uid() = user_id)
-- y el candado único uq_bookings_slot_activa compara el TEXTO exacto de la
-- franja. Solo la pantalla de reservas respetaba los bloqueos, así que un
-- jugador con sesión podía meter por la API (o tocando el carrito guardado en
-- el navegador y pagando en el club) una reserva confirmada encima de un
-- bloqueo, de un entreno o de un partido del torneo, o encima de otra reserva
-- con otro texto ("21:00 - 22:30" contra "20:30 - 22:00").
--
-- QUÉ SE RECHAZA, solo a los jugadores: una reserva viva (confirmed o
-- pendiente_pago) cuya franja se SOLAPE con
--   · cualquier fila de blocked_slots de esa pista y ese día (bloqueado,
--     entreno o torneo), o
--   · otra reserva viva de esa pista y ese día. Un 'pendiente_pago' de hace
--     más de 15 minutos ya no cuenta, igual que en la pantalla de reservas y
--     en expire_stale_holds. La reserva NUEVA cuenta siempre, y en las que
--     crea un jugador created_at = now(): no puede inventarse un hold que no
--     caduque nunca (la app no manda esa columna).
-- Solapar = inicio < fin del otro Y inicio del otro < fin, en minutos: dos
-- franjas que solo se tocan en el borde ("20:30 - 22:00" y "22:00 - 23:30")
-- NO se solapan (igual que rebuildAvailableTimes en src/utils/schedule.js).
--
-- EXENTOS (no se comprueba nada): los admin (public.is_admin(); reservan
-- encima de bloqueos a propósito), el service_role (redsys-notify confirma
-- pagos ya cobrados: nunca rechazar) y las sesiones SQL sin ningún JWT (psql,
-- cron).
--
-- CUÁNDO: en INSERT y en UPDATE de court_id, date, time_slot o status. Dejar
-- una reserva en 'cancelled' (o cualquier estado que no ocupa pista) no se
-- comprueba nunca, así que cancelar sigue funcionando siempre.
--
-- ERROR: SQLSTATE 'PM409' con un mensaje en español listo para el jugador, con
-- la pista, el día y la hora (las apps de las tiendas que aún no conocen el
-- código lo enseñan tal cual). No dice de quién es la otra reserva, solo si
-- es del propio jugador (su pago sin terminar o su reserva). El porqué va en
-- DETAIL y HINT = 'PISTA_NO_DISPONIBLE' (o 'FRANJA_NO_VALIDA' si la franja no
-- se entiende). PostgREST lo devuelve con HTTP 400 y code 'PM409'; la app lo
-- reconoce en src/utils/huecoOcupado.js.
--
-- LECTURA DE LA FRANJA "HH:MM - HH:MM" (franja_minutos): minutos desde las
-- 00:00 y tramo [inicio, fin), como toMin/parseSlot de src/utils/schedule.js.
--   · Se toleran espacios de más y horas de una cifra ("9:00 - 10:30").
--   · Fin "00:00" o "24:00" = medianoche (1440). schedule.js escribe la
--     medianoche como "24:00" (fmtMin(1440)) y las pantallas del admin no
--     dejan crear franjas que acaben a las 00:00 ni que crucen la medianoche
--     (los partidos del torneo acaban como tarde a las 23:59), así que un fin
--     "00:00" solo puede venir de una fila hecha a mano: se entiende como
--     "hasta medianoche", no como un tramo vacío.
--   · Mal formada (otro formato, horas o minutos imposibles, fin <= inicio o
--     cruzando la medianoche): si es la reserva NUEVA de un jugador se rechaza
--     (la app nunca ofrece una franja así); si es un bloqueo u otra reserva ya
--     guardados, se ignora, igual que en la pantalla de reservas (allí no
--     ocupa ningún hueco).
--
-- ORDEN: los BEFORE triggers saltan por orden alfabético de nombre. El
-- prefijo zz_ hace que este vaya el ÚLTIMO, después de
-- trg_bookings_rechaza_baneados, trg_bookings_release_time y
-- trg_expire_stale_holds (que cancela antes los holds caducados de la misma
-- franja). De todas formas la consulta ya ignora por su cuenta los holds de
-- más de 15 minutos.
--
-- CONCURRENCIA: dos jugadores reservando a la vez franjas distintas que se
-- solapan no se verían el uno al otro (el candado único solo mira el texto).
-- Por eso, antes de mirar, el trigger toma un candado de transacción por
-- pista y día (pg_advisory_xact_lock): el segundo espera a que termine el
-- primero y entonces ya ve su reserva. Solo lo toman las reservas de
-- jugadores y dura lo que dura su petición.
--
-- ÍNDICES: las dos búsquedas van por (court_id, date) y ya tienen índice:
-- idx_blocked_slots_court_date y, en bookings, idx_bookings_court_date_status
-- (20260428200000_perf_indexes.sql) o uq_bookings_slot_activa. No hace falta
-- ninguno nuevo.
--
-- PARA DESHACERLO (deja la base de datos como estaba):
--   DROP TRIGGER IF EXISTS trg_zz_bookings_rechaza_solapes ON public.bookings;
--   DROP FUNCTION IF EXISTS public.bookings_rechaza_solapes();
--   DROP FUNCTION IF EXISTS public.franja_minutos(text);

-- Franja "HH:MM - HH:MM" → tramo [inicio, fin) en minutos; NULL si no se
-- entiende (ver arriba).
CREATE OR REPLACE FUNCTION public.franja_minutos(p_franja text)
RETURNS int4range
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT CASE WHEN ini IS NOT NULL AND fin IS NOT NULL AND fin > ini
              THEN int4range(ini, fin) END
  FROM (
    SELECT
      CASE WHEN m[1]::int <= 23 AND m[2]::int <= 59
           THEN m[1]::int * 60 + m[2]::int END AS ini,
      CASE WHEN m[4]::int > 59 OR m[3]::int * 60 + m[4]::int > 1440 THEN NULL
           WHEN m[3]::int * 60 + m[4]::int = 0 THEN 1440  -- fin 00:00 = medianoche
           ELSE m[3]::int * 60 + m[4]::int END AS fin
    -- [0-9] y no \d: \d puede aceptar cifras de otros alfabetos y el ::int fallaría.
    FROM (SELECT regexp_match(p_franja, '^\s*([0-9]{1,2}):([0-9]{2})\s*-\s*([0-9]{1,2}):([0-9]{2})\s*$') AS m) r
  ) t
$$;

-- Solo la usa el trigger (que corre como su dueño): fuera de la API.
REVOKE ALL ON FUNCTION public.franja_minutos(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.franja_minutos(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.bookings_rechaza_solapes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rango int4range;
  v_vieja uuid;
  v_otra  text;
  v_tipo  text;
  v_hold  boolean;
  v_mia   boolean;
  v_pista text;
  v_donde text;
BEGIN
  -- Solo ocupan pista las reservas vivas. Cancelar no se comprueba nunca.
  IF NEW.status IS NULL OR NEW.status NOT IN ('confirmed', 'pendiente_pago') THEN
    RETURN NEW;
  END IF;

  -- En un UPDATE, solo si la reserva se mueve o cambia de estado.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.court_id IS NOT DISTINCT FROM OLD.court_id
       AND NEW.date IS NOT DISTINCT FROM OLD.date
       AND NEW.time_slot IS NOT DISTINCT FROM OLD.time_slot
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_vieja := OLD.id;
  END IF;

  -- Exentos: sesión SQL sin ningún JWT (psql, cron)...
  IF nullif(current_setting('request.jwt.claims', true), '') IS NULL
     AND nullif(current_setting('request.jwt.claim.sub', true), '') IS NULL
     AND nullif(current_setting('request.jwt.claim.role', true), '') IS NULL THEN
    RETURN NEW;
  END IF;
  -- ...el service_role (webhooks de pago: el dinero ya se cobró)...
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- ...y los admin, que reservan encima de bloqueos a propósito.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Campos vacíos: que dé su error la restricción NOT NULL de la tabla.
  IF NEW.court_id IS NULL OR NEW.date IS NULL OR NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  -- La hora de creación la pone la base de datos (la app nunca la manda): un
  -- hold con fecha futura no caducaría nunca y taparía las franjas que pisa.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  END IF;

  v_rango := public.franja_minutos(NEW.time_slot);
  IF v_rango IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PM409',
      MESSAGE = format('La hora elegida (%s) no es válida. Vuelve a elegirla, por favor.', btrim(NEW.time_slot)),
      DETAIL  = 'La franja tiene que ser "HH:MM - HH:MM", con el fin después del inicio y sin pasar de la medianoche.',
      HINT    = 'FRANJA_NO_VALIDA';
  END IF;

  -- Un candado por pista y día: dos reservas a la vez se ponen en fila y la
  -- segunda ya ve a la primera.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('reserva ' || NEW.court_id::text || ' ' || to_char(NEW.date, 'YYYY-MM-DD'), 0));

  -- 1) Bloqueos del club de esa pista y ese día: bloqueado, entreno o torneo.
  SELECT s.time_slot, s.tipo INTO v_otra, v_tipo
    FROM public.blocked_slots s
   WHERE s.court_id = NEW.court_id
     AND s.date = NEW.date
     AND public.franja_minutos(s.time_slot) && v_rango
   ORDER BY s.time_slot
   LIMIT 1;

  IF NOT FOUND THEN
    -- 2) Otra reserva viva de esa pista y ese día (no esta misma fila; sí
    --    otra del mismo jugador, p. ej. un pago con tarjeta sin terminar).
    SELECT b.time_slot, b.status = 'pendiente_pago', b.user_id = NEW.user_id
      INTO v_otra, v_hold, v_mia
      FROM public.bookings b
     WHERE b.court_id = NEW.court_id
       AND b.date = NEW.date
       AND b.id IS DISTINCT FROM NEW.id
       AND b.id IS DISTINCT FROM v_vieja
       AND (b.status = 'confirmed'
            OR (b.status = 'pendiente_pago' AND b.created_at >= now() - interval '15 minutes'))
       AND public.franja_minutos(b.time_slot) && v_rango
     ORDER BY b.time_slot
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT c.name INTO v_pista FROM public.courts c WHERE c.id = NEW.court_id;
  v_donde := format('%s, %s (%s)',
                    COALESCE(NULLIF(btrim(v_pista), ''), 'Pista'),
                    to_char(NEW.date, 'DD/MM'),
                    btrim(NEW.time_slot));

  RAISE EXCEPTION USING
    ERRCODE = 'PM409',
    MESSAGE = CASE
                WHEN v_hold AND v_mia THEN format('%s: tienes un pago sin terminar a esa hora. Espera unos minutos a que caduque o elige otra, por favor.', v_donde)
                WHEN v_mia            THEN format('%s: ya tienes una reserva a esa hora. Elige otra, por favor.', v_donde)
                WHEN v_hold           THEN format('%s: otro jugador está pagando esa hora ahora mismo. Elige otra, por favor.', v_donde)
                ELSE format('%s: esa hora ya no está libre. Elige otra, por favor.', v_donde)
              END,
    DETAIL  = CASE
                WHEN v_tipo = 'entreno' THEN format('Se solapa con un entreno (%s).', v_otra)
                WHEN v_tipo = 'torneo'  THEN format('Se solapa con un partido del torneo (%s).', v_otra)
                WHEN v_tipo IS NOT NULL THEN format('Se solapa con un bloqueo del club (%s).', v_otra)
                WHEN v_hold             THEN format('Se solapa con otra reserva que se está pagando (%s).', v_otra)
                ELSE format('Se solapa con otra reserva (%s).', v_otra)
              END,
    HINT    = 'PISTA_NO_DISPONIBLE';
END;
$function$;

-- zz_: el último de los BEFORE (ver ORDEN arriba).
DROP TRIGGER IF EXISTS trg_zz_bookings_rechaza_solapes ON public.bookings;
CREATE TRIGGER trg_zz_bookings_rechaza_solapes
  BEFORE INSERT OR UPDATE OF court_id, date, time_slot, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_rechaza_solapes();
