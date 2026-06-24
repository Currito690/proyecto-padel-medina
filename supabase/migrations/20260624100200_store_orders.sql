-- ============================================================================
-- TIENDA ONLINE — Pedidos, líneas, pagos y tarifas de envío
-- ----------------------------------------------------------------------------
-- Importes en CÉNTIMOS (integer). Precios CON IVA incluido (21%).
-- El pedido se crea en estado 'pendiente_pago' ANTES de ir a Redsys (patrón
-- seguro, como tournament_registrations) y solo se marca 'pagado' en la
-- notificación server-to-server, de forma idempotente (ver RPC en la
-- migración 20260624100300). redsys_order_id es ÚNICO = clave de idempotencia.
-- ============================================================================

-- Secuencia para el número de pedido legible (PM-AAAA-NNNNN)
CREATE SEQUENCE IF NOT EXISTS public.store_order_seq START 1;
-- El rol que inserta el pedido (service_role en las Edge Functions, o admin
-- desde el panel) necesita USAGE sobre la secuencia para el DEFAULT.
GRANT USAGE, SELECT ON SEQUENCE public.store_order_seq TO authenticated, service_role;

-- ── orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido TEXT NOT NULL UNIQUE
    DEFAULT ('PM-' || to_char(now(), 'YYYY') || '-' ||
             lpad(nextval('public.store_order_seq')::text, 5, '0')),
  redsys_order_id TEXT UNIQUE,                 -- Ds_Order; null hasta iniciar pago
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null = invitado
  cliente_nombre TEXT NOT NULL,
  cliente_email TEXT NOT NULL,
  cliente_telefono TEXT,
  metodo_entrega TEXT NOT NULL DEFAULT 'recogida',  -- 'recogida' | 'envio'
  direccion_envio JSONB,                            -- solo si metodo_entrega = 'envio'
  zona_envio TEXT,                                  -- p.ej. 'Península'
  subtotal_centimos INTEGER NOT NULL DEFAULT 0,
  gastos_envio_centimos INTEGER NOT NULL DEFAULT 0,
  total_centimos INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente_pago',
  metodo_pago TEXT,                                 -- 'redsys' | 'bizum'
  paid_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_estado_chk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_estado_chk
      CHECK (estado IN ('pendiente_pago','pagado','preparando','enviado','entregado','cancelado','pago_fallido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_metodo_entrega_chk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_metodo_entrega_chk
      CHECK (metodo_entrega IN ('recogida','envio'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── order_items (copia histórica de cada línea) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  nombre_producto TEXT NOT NULL,             -- snapshot
  variante_desc TEXT,                        -- snapshot (p.ej. "Talla M / Azul")
  precio_unitario_centimos INTEGER NOT NULL, -- snapshot
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  subtotal_centimos INTEGER NOT NULL
);

-- ── payments (auditoría de cada intento/resultado de Redsys) ─────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  redsys_order_id TEXT,
  importe_centimos INTEGER,
  estado TEXT,                  -- 'autorizado' | 'denegado'
  codigo_respuesta TEXT,        -- Ds_Response
  ds_authorisation_code TEXT,   -- Ds_AuthorisationCode
  respuesta_completa JSONB,     -- payload íntegro de Redsys
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── shipping_rates (tarifas de envío por zona, configurables) ────────────────
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zona TEXT NOT NULL,
  coste_centimos INTEGER NOT NULL DEFAULT 0 CHECK (coste_centimos >= 0),
  envio_gratis_desde_centimos INTEGER CHECK (envio_gratis_desde_centimos IS NULL OR envio_gratis_desde_centimos >= 0),
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tarifa por defecto: Península 4,90 € con envío gratis desde 50 € (editable en el panel)
INSERT INTO public.shipping_rates (zona, coste_centimos, envio_gratis_desde_centimos, orden)
SELECT 'Península', 490, 5000, 0
WHERE NOT EXISTS (SELECT 1 FROM public.shipping_rates);

-- Flag global para mostrar/ocultar la tienda (si existe la tabla site_settings)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'site_settings'
  ) THEN
    ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS tienda_activa BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_estado ON public.orders (estado);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

-- orders: el cliente ve los suyos; el admin gestiona todos.
-- La CREACIÓN y el marcado como 'pagado' los hace el backend (Edge Functions
-- de Redsys con service_role, que bypassa RLS), nunca el cliente: así el
-- precio/total se recalcula en servidor y no es manipulable.
DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
CREATE POLICY "Users read own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders"
  ON public.orders FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- order_items: visibles si el pedido es tuyo o eres admin
DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Users read own order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin())
  ));
DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items"
  ON public.order_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- payments: solo admin (auditoría)
DROP POLICY IF EXISTS "Admins read payments" ON public.payments;
CREATE POLICY "Admins read payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- shipping_rates: lectura pública (para calcular portes en checkout), escritura admin
DROP POLICY IF EXISTS "Public read shipping rates" ON public.shipping_rates;
CREATE POLICY "Public read shipping rates"
  ON public.shipping_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage shipping rates" ON public.shipping_rates;
CREATE POLICY "Admins manage shipping rates"
  ON public.shipping_rates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
