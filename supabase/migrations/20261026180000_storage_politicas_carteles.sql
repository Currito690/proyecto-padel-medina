-- Políticas de storage para los carteles (eventos y torneos) en el bucket
-- público "event-posters". Tras pasar al Supabase autoalojado el bucket existía
-- pero storage.objects tenía RLS activo y NINGUNA política, así que toda subida
-- fallaba ("El evento se guardó pero el cartel no se pudo subir").
--
-- Lectura: cualquiera (el bucket es público y las URLs van en la web).
-- Subir, cambiar y borrar: solo el admin (public.is_admin()), no cualquier
-- usuario con sesión como decía la migración original de eventos.

DROP POLICY IF EXISTS "Public can view event posters" ON storage.objects;
DROP POLICY IF EXISTS "Auth can upload event posters" ON storage.objects;
DROP POLICY IF EXISTS "Auth can update event posters" ON storage.objects;
DROP POLICY IF EXISTS "Auth can delete event posters" ON storage.objects;
DROP POLICY IF EXISTS "Carteles: ver" ON storage.objects;
DROP POLICY IF EXISTS "Carteles: subir (admin)" ON storage.objects;
DROP POLICY IF EXISTS "Carteles: cambiar (admin)" ON storage.objects;
DROP POLICY IF EXISTS "Carteles: borrar (admin)" ON storage.objects;

CREATE POLICY "Carteles: ver"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-posters');

CREATE POLICY "Carteles: subir (admin)"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'event-posters' AND public.is_admin());

CREATE POLICY "Carteles: cambiar (admin)"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'event-posters' AND public.is_admin())
  WITH CHECK (bucket_id = 'event-posters' AND public.is_admin());

CREATE POLICY "Carteles: borrar (admin)"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'event-posters' AND public.is_admin());
