-- ============================================
-- PADEL MEDINA - Setup 12h Booking Reminders
-- ============================================

-- 1. Añadimos la columna para saber si ya se notificó
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- 2. Activamos las extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- 3. Programamos la llamada cada 30 minutos
-- Llama a la nueva Edge Function para procesar notificaciones
-- IMPORTANTE: Reemplazar el anon_key en futuras rotaciones.
SELECT cron.schedule(
    'send-booking-reminders-job',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://iquibawtbpamhaottlbr.supabase.co/functions/v1/send-reminders',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ"}'::jsonb
    )
    $$
);
