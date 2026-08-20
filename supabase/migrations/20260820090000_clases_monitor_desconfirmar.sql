-- El monitor puede QUITAR la confirmación de una clase (p. ej. si la clase
-- se cancela o no vino nadie): en la app, volver a pulsar el número (1-4) ya
-- marcado borra su confirmación y la clase deja de contar (y de sumar dinero
-- en ENTRENOS). Sin esta política la tabla solo permitía crear/editar/ver.
DROP POLICY IF EXISTS "Monitor desconfirma sus clases" ON public.clases_monitor;
CREATE POLICY "Monitor desconfirma sus clases"
  ON public.clases_monitor FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
