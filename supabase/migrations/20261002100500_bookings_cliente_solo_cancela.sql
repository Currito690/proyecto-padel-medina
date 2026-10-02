-- La política de UPDATE de bookings no tenía WITH CHECK, así que un cliente podía
-- cambiar CUALQUIER columna de su propia reserva, incluido status -> 'confirmed'.
-- Un jugador listo podía crear un hold 'pendiente_pago', no pagar, e ir a
-- /mis-reservas?pago=ok para confirmarlo gratis desde el navegador.
--
-- Ahora un cliente SOLO puede dejar su reserva en 'cancelled'. Confirmar un pago
-- es cosa exclusiva de redsys-notify, que corre con la service key y se salta RLS.
-- Los administradores siguen pudiendo cambiar lo que haga falta.

DROP POLICY IF EXISTS "Usuarios cancelan sus reservas" ON public.bookings;
CREATE POLICY "Usuarios cancelan sus reservas" ON public.bookings
  FOR UPDATE
  USING ( auth.uid() = user_id OR public.is_admin() )
  WITH CHECK ( public.is_admin() OR status = 'cancelled' );
