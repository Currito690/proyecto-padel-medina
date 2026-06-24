-- ============================================================================
-- TIENDA ONLINE — RPC transaccional para confirmar pago y descontar stock
-- ----------------------------------------------------------------------------
-- La llama la Edge Function redsys-notify (con service_role) cuando Redsys
-- confirma un pago OK. Es:
--   · ATÓMICA: marca pagado + descuenta stock en una sola transacción.
--   · IDEMPOTENTE: si el pedido ya no está 'pendiente_pago' (Redsys reintenta
--     la notificación ante timeout), no vuelve a descontar stock ni a registrar
--     el pago; devuelve already_processed = true.
--   · SEGURA ANTE SOBREVENTA: el CHECK (stock >= 0) de product_variants hace
--     fallar (rollback) toda la transacción si no hay stock suficiente, de modo
--     que el pedido NO se marca pagado en ese caso (situación límite; el stock
--     debe validarse también en el checkout antes de pagar).
-- No se concede a anon/authenticated: solo el backend (service_role) la ejecuta.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_pedido_pagado(
  p_redsys_order_id    TEXT,
  p_metodo_pago        TEXT  DEFAULT NULL,
  p_authorisation_code TEXT  DEFAULT NULL,
  p_response_code      TEXT  DEFAULT NULL,
  p_raw                JSONB DEFAULT NULL
)
RETURNS TABLE (order_id UUID, numero_pedido TEXT, already_processed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item  RECORD;
BEGIN
  -- Bloquear la fila del pedido para serializar notificaciones concurrentes
  SELECT * INTO v_order
  FROM public.orders
  WHERE redsys_order_id = p_redsys_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado para redsys_order_id=%', p_redsys_order_id;
  END IF;

  -- Idempotencia: ya procesado anteriormente
  IF v_order.estado <> 'pendiente_pago' THEN
    RETURN QUERY SELECT v_order.id, v_order.numero_pedido, true;
    RETURN;
  END IF;

  -- Descontar stock de cada línea con variante (atómico; CHECK protege sobreventa)
  FOR v_item IN
    SELECT variant_id, cantidad
    FROM public.order_items
    WHERE order_id = v_order.id AND variant_id IS NOT NULL
  LOOP
    UPDATE public.product_variants
    SET stock = stock - v_item.cantidad
    WHERE id = v_item.variant_id;
  END LOOP;

  -- Marcar pagado
  UPDATE public.orders
  SET estado      = 'pagado',
      paid_at     = now(),
      metodo_pago = COALESCE(p_metodo_pago, metodo_pago)
  WHERE id = v_order.id;

  -- Registrar el pago (auditoría)
  INSERT INTO public.payments (
    order_id, redsys_order_id, importe_centimos, estado,
    codigo_respuesta, ds_authorisation_code, respuesta_completa
  ) VALUES (
    v_order.id, p_redsys_order_id, v_order.total_centimos, 'autorizado',
    p_response_code, p_authorisation_code, p_raw
  );

  RETURN QUERY SELECT v_order.id, v_order.numero_pedido, false;
END;
$$;

-- Registrar un pago FALLIDO (idempotente: solo si el pedido sigue pendiente)
CREATE OR REPLACE FUNCTION public.marcar_pedido_fallido(
  p_redsys_order_id TEXT,
  p_response_code   TEXT  DEFAULT NULL,
  p_raw             JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE redsys_order_id = p_redsys_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- No pisar un pedido ya pagado por una notificación de fallo tardía
  IF v_order.estado = 'pendiente_pago' THEN
    UPDATE public.orders SET estado = 'pago_fallido' WHERE id = v_order.id;
  END IF;

  INSERT INTO public.payments (
    order_id, redsys_order_id, importe_centimos, estado, codigo_respuesta, respuesta_completa
  ) VALUES (
    v_order.id, p_redsys_order_id, v_order.total_centimos, 'denegado', p_response_code, p_raw
  );
END;
$$;

-- Restringir la ejecución al backend (service_role). Nunca al cliente.
REVOKE ALL ON FUNCTION public.confirmar_pedido_pagado(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_pedido_fallido(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pedido_pagado(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_fallido(TEXT, TEXT, JSONB) TO service_role;
