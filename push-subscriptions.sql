-- ============================================
-- MIGRACIÓN: tabla push_subscriptions
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL UNIQUE,
  subscription JSONB  NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuario gestiona sus propias suscripciones
DROP POLICY IF EXISTS "Usuarios gestionan sus push subscriptions" ON push_subscriptions;
CREATE POLICY "Usuarios gestionan sus push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
