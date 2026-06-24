-- ============================================================================
-- TIENDA ONLINE — Bucket de Storage para imágenes de producto
-- ----------------------------------------------------------------------------
-- Clona el patrón del bucket 'event-posters' PERO endurece la escritura a
-- admin (public.is_admin()) en lugar de a cualquier 'authenticated'
-- (el bucket de eventos permite subir a cualquier usuario logueado; aquí NO).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- Lectura pública (catálogo visible para cualquiera)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public can view product images'
  ) THEN
    CREATE POLICY "Public can view product images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'product-images');
  END IF;

  -- Subir: solo admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can upload product images'
  ) THEN
    CREATE POLICY "Admins can upload product images"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
  END IF;

  -- Actualizar: solo admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can update product images'
  ) THEN
    CREATE POLICY "Admins can update product images"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'product-images' AND public.is_admin());
  END IF;

  -- Borrar: solo admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can delete product images'
  ) THEN
    CREATE POLICY "Admins can delete product images"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'product-images' AND public.is_admin());
  END IF;
END $$;
