-- 2026-10-14: avisos push a los JUGADORES (recordatorio de su pista), también
-- en la app de iPhone.
--
-- Hasta ahora solo los administradores registraban su dispositivo y los avisos
-- iban por web push (web y app Android). El iPhone no tiene web push: usa APNs
-- (el servicio de Apple) con un token del dispositivo. Por eso:
--
-- 1) push_subscriptions.plataforma: 'web' (web push) o 'ios' (APNs). Formato:
--    - web: endpoint = subscription.endpoint, subscription = subscription.toJSON()
--    - ios: endpoint = 'apns:' + token hex, subscription = {"token": "<hex>"}
--    updated_at: última vez que el dispositivo se registró.
-- 2) registrar_dispositivo_push(): la app guarda el dispositivo con esta función
--    y no con un upsert directo. Si el mismo móvil (mismo endpoint) ya estaba a
--    nombre de otra cuenta, pasa a la cuenta que tiene la sesión abierta. Con
--    RLS el upsert directo daba error en ese caso y el móvil se quedaba a
--    nombre de la cuenta anterior (recibiendo sus avisos).
-- 3) Índices para send-reminders (reservas pendientes de aviso) y para buscar
--    los dispositivos de un usuario.
-- 4) Policies: el usuario ya solo VE y BORRA sus filas. Altas y cambios, solo
--    con la función de arriba (que valida el formato); antes cualquiera podía
--    insertar a mano una dirección https cualquiera y el servidor le enviaba.
-- 5) La cuenta admin@padelmedina.com (según auth.users) queda con role
--    'admin': las funciones ya no deciden quién es admin por profiles.email,
--    que cada usuario puede cambiar desde su perfil.
--
-- ORDEN DE DESPLIEGUE (si se invierte, los jugadores que activen los avisos
-- recibirían los avisos internos del club con datos de otros clientes, porque
-- el send-push viejo manda a TODAS las filas):
--   1) Copiar ENTERA la carpeta supabase/functions/_shared/ al servidor y luego
--      los index.ts de send-push, send-reminders y send-booking-email;
--      reiniciar las funciones. Sin _shared, send-push y send-reminders no
--      arrancan (y se pierden también los avisos al admin).
--      Comprobar: send-push con service role responde "audiencia":"admins" y
--      la línea del crontab de send-reminders (a mano, sin >/dev/null) da 200.
--   2) Esta migración.
--   3) Por último, la web (y después la app de iPhone).
--
-- Idempotente: se puede ejecutar más de una vez.

-- ── 1. Columnas ────────────────────────────────────────────────────────────
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS plataforma text NOT NULL DEFAULT 'web';
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_plataforma_check;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_plataforma_check CHECK (plataforma IN ('web', 'ios'));

-- ── 2. Registrar el dispositivo de la sesión actual ────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_dispositivo_push(
  p_endpoint text,
  p_subscription jsonb,
  p_plataforma text DEFAULT 'web'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión iniciada';
  END IF;

  IF p_plataforma IS NULL OR p_plataforma NOT IN ('web', 'ios') THEN
    RAISE EXCEPTION 'Plataforma no válida';
  END IF;

  IF p_endpoint IS NULL OR length(p_endpoint) < 10 OR length(p_endpoint) > 2048 THEN
    RAISE EXCEPTION 'Dispositivo no válido';
  END IF;

  IF p_subscription IS NULL OR jsonb_typeof(p_subscription) <> 'object'
     OR length(p_subscription::text) > 4096 THEN
    RAISE EXCEPTION 'Datos del dispositivo no válidos';
  END IF;

  -- Coherencia con el formato de cada plataforma (el servidor envía a lo que
  -- haya aquí: que nadie pueda colar una dirección cualquiera).
  IF p_plataforma = 'ios' THEN
    IF p_endpoint !~ '^apns:[0-9A-Fa-f]{64,200}$'
       OR (p_subscription->>'token') IS DISTINCT FROM substr(p_endpoint, 6) THEN
      RAISE EXCEPTION 'Token de iPhone no válido';
    END IF;
  ELSE
    IF p_endpoint !~ '^https://'
       OR (p_subscription->>'endpoint') IS DISTINCT FROM p_endpoint THEN
      RAISE EXCEPTION 'Suscripción web no válida';
    END IF;
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, subscription, plataforma, updated_at)
  VALUES (v_uid, p_endpoint, p_subscription, p_plataforma, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id      = auth.uid(),
        subscription = EXCLUDED.subscription,
        plataforma   = EXCLUDED.plataforma,
        updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_dispositivo_push(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_dispositivo_push(text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_dispositivo_push(text, jsonb, text) TO authenticated;

-- ── 3. Índices ─────────────────────────────────────────────────────────────
-- send-reminders: "confirmadas, sin aviso, de hoy a pasado mañana".
CREATE INDEX IF NOT EXISTS idx_bookings_recordatorio_pendiente
  ON public.bookings (date)
  WHERE status = 'confirmed' AND reminder_sent = false;

-- Dispositivos de un usuario (recordatorios y avisos a los administradores).
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

-- ── 4. Policies de push_subscriptions ──────────────────────────────────────
-- Sustituye a "Usuarios gestionan sus push subscriptions" (FOR ALL, de
-- push-subscriptions.sql). Cerrar sesión borra la fila de este dispositivo
-- (DELETE); el borrado de cuenta y las funciones van con SECURITY DEFINER o la
-- service role y no dependen de estas policies.
DROP POLICY IF EXISTS "Usuarios gestionan sus push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Usuarios ven sus push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Usuarios borran sus push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Usuarios ven sus push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Usuarios borran sus push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── 5. La cuenta histórica del club, admin por rol ─────────────────────────
-- Por el correo de auth.users (el usuario no lo puede cambiar a su antojo),
-- no por el de profiles.
UPDATE public.profiles p
   SET role = 'admin'
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) = 'admin@padelmedina.com'
   AND p.role IS DISTINCT FROM 'admin';
