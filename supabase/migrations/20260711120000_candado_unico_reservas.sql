-- CANDADO definitivo contra dobles reservas: nunca puede haber dos reservas
-- CONFIRMADAS para la misma pista, día y franja. Si por cualquier carrera dos
-- pagos intentaran confirmar el mismo hueco, el segundo falla y dispara la
-- alerta de "cobro sin reserva" (devolución) en vez de un doble-booking.
-- Verificado antes de crear: no existen duplicados en los datos actuales.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_slot_confirmed
  ON public.bookings (court_id, date, time_slot)
  WHERE status = 'confirmed';
