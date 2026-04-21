-- Elimina el trigger on_booking_confirmed.
-- Motivo: llamaba a net.http_post pero la extensión pg_net no está habilitada
-- en el proyecto, lo que causaba que TODO INSERT en bookings fallara con
-- "schema 'net' does not exist".
--
-- El email de confirmación ya se envía desde el cliente (PaymentGateway.jsx)
-- vía supabase.functions.invoke('send-booking-email', ...), así que no se
-- pierde funcionalidad.

DROP TRIGGER IF EXISTS on_booking_confirmed ON public.bookings;
DROP FUNCTION IF EXISTS public.notify_booking_confirmation();
