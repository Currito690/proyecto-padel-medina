-- El guardián de apertura de reservas en BD usaba la regla ANTIGUA ("todas las
-- fechas futuras se abren a las HH:MM de hoy"), mientras que la web ya usa la
-- regla nueva: "la fecha D se abre a la hora de liberación, N días antes"
-- (N = booking_window_days). El desajuste rechazó el 11/07 una reserva YA
-- COBRADA en Redsys (pedido 216231857106) → cobro sin reserva.
--
-- Cambios:
--  1) Misma regla que el frontend: D se abre a las HH:MM del día (D - N).
--     De paso, esto también impide reservar por API más allá de la ventana.
--  2) El service_role (webhook de pagos) queda EXENTO: si el cobro ya está
--     hecho, rechazar el INSERT solo produce un pago sin reserva.
--  3) Admins siguen exentos.

CREATE OR REPLACE FUNCTION public.enforce_bookings_release_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release TIME;
  v_window INTEGER;
  v_opens_at TIMESTAMPTZ;
BEGIN
  -- Webhook de pagos: el dinero ya se cobró; nunca rechazar.
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins exentos
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT slots_release_time, COALESCE(booking_window_days, 7)
    INTO v_release, v_window
    FROM public.site_settings
    ORDER BY id ASC
    LIMIT 1;

  IF v_release IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hoy (y el pasado) nunca se bloquea por hora de apertura.
  IF NEW.date <= (now() AT TIME ZONE 'Europe/Madrid')::date THEN
    RETURN NEW;
  END IF;

  -- REGLA (idéntica al frontend): la fecha D se abre a la hora de liberación
  -- del día (D - N). Ej.: antelación 2 + 09:00 → el sábado abre el jueves 09:00.
  v_opens_at := ((NEW.date - v_window) + v_release) AT TIME ZONE 'Europe/Madrid';

  IF now() < v_opens_at THEN
    RAISE EXCEPTION
      'Las reservas para el % se abren el % a las %.',
      to_char(NEW.date, 'DD/MM'),
      to_char(NEW.date - v_window, 'DD/MM'),
      to_char(v_release, 'HH24:MI')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
