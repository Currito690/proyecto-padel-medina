-- 2026-10-19: avisos push también en la app NUEVA de Android (Capacitor).
--
-- La app de Android deja de ser la web dentro de Chrome (TWA, que usaba web
-- push) y pasa a ser una app de verdad, como la de iPhone. Sus avisos van por
-- Firebase Cloud Messaging (FCM) con un token del dispositivo:
--   endpoint = 'fcm:' + token, subscription = {"token": "<token>"}, plataforma = 'android'
-- (los envía _shared/fcm.ts con el secreto FCM_SERVICE_ACCOUNT).
--
-- Idempotente: se puede ejecutar más de una vez.

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_plataforma_check;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_plataforma_check CHECK (plataforma IN ('web', 'ios', 'android'));

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

  IF p_plataforma IS NULL OR p_plataforma NOT IN ('web', 'ios', 'android') THEN
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
  ELSIF p_plataforma = 'android' THEN
    -- Los tokens de FCM: letras, números, ":", "-" y "_" (unos 150-250 caracteres).
    IF p_endpoint !~ '^fcm:[A-Za-z0-9:_-]{20,1024}$'
       OR (p_subscription->>'token') IS DISTINCT FROM substr(p_endpoint, 5) THEN
      RAISE EXCEPTION 'Token de Android no válido';
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
