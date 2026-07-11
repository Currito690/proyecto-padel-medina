-- El CHECK antiguo de bookings.status no admitía 'pendiente_pago', lo que
-- rompía el flujo tolerancia-cero (el hold no se podía crear y el jugador no
-- podía ni iniciar el pago). Se amplía la lista de estados permitidos.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed', 'cancelled', 'pendiente_pago', 'pending'));
