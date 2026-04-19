-- Tabla de eventos/torneos para promoción pública
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  poster_url TEXT,
  event_date DATE,
  end_date DATE,
  registration_url TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published events"
  ON public.events FOR SELECT
  USING (published = true);

CREATE POLICY "Admins can manage own events"
  ON public.events FOR ALL
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

-- Bucket público para carteles de eventos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-posters',
  'event-posters',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can view event posters'
  ) THEN
    CREATE POLICY "Public can view event posters"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'event-posters');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auth can upload event posters'
  ) THEN
    CREATE POLICY "Auth can upload event posters"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'event-posters' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auth can update event posters'
  ) THEN
    CREATE POLICY "Auth can update event posters"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'event-posters' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auth can delete event posters'
  ) THEN
    CREATE POLICY "Auth can delete event posters"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'event-posters' AND auth.role() = 'authenticated');
  END IF;
END $$;
