-- Trigger que envía email de confirmación automáticamente al crear una reserva confirmada
-- Usa pg_net (ya habilitado) para llamar a la edge function send-booking-email

CREATE OR REPLACE FUNCTION notify_booking_confirmation()
RETURNS TRIGGER AS $$
DECLARE
  v_email    TEXT;
  v_name     TEXT;
  v_court    TEXT;
BEGIN
  -- Email y nombre del usuario
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  SELECT name  INTO v_name  FROM public.profiles WHERE id = NEW.user_id;
  -- Nombre de la pista
  SELECT name  INTO v_court FROM public.courts WHERE id = NEW.court_id;

  IF v_email IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://iquibawtbpamhaottlbr.supabase.co/functions/v1/send-booking-email',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := json_build_object(
        'type',      'confirmation',
        'email',     v_email,
        'userName',  COALESCE(v_name, split_part(v_email, '@', 1)),
        'courtName', COALESCE(v_court, 'Pista'),
        'date',      NEW.date::text,
        'timeSlot',  NEW.time_slot
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS on_booking_confirmed ON public.bookings;

-- Crear trigger: dispara en cada INSERT con status = 'confirmed'
CREATE TRIGGER on_booking_confirmed
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION notify_booking_confirmation();
