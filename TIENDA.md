# Tienda online — Padel Medina

Módulo de tienda de productos físicos integrado en la app existente (React + Vite + Supabase + Redsys + Resend). Reutiliza la infraestructura del proyecto; el dominio de tienda está **aislado** del de reservas/torneos.

## Arquitectura

- **Catálogo** (`products`, `product_variants`, `categories`, `product_images`): precios en **céntimos**, IVA incluido. Stock por variante. Imágenes en el bucket `product-images` (Storage).
- **Pedidos** (`orders`, `order_items`, `payments`): el pedido se crea en `pendiente_pago` **antes** de pagar y se confirma de forma **idempotente** tras la notificación de Redsys.
- **Carrito de productos**: contexto separado del de reservas (`ProductCartContext`, localStorage `padelmedina_shop_cart`, con cantidades y sin caducidad).
- **Tienda pública**: rutas `/tienda`, `/tienda/:slug`, `/tienda/carrito`, `/tienda/checkout`, `/tienda/pedido/:numero` (visibles sin login, con su propio layout). Requiere `BrowserRouter` (ya activo) para URLs reales/SEO.
- **Panel admin**: pestañas **Tienda** (`ProductsManager`) y **Pedidos** (`OrdersManager`) en el AdminDashboard.

## Seguridad (claves)

- **RLS**: catálogo de lectura pública (solo `activo=true`), escritura solo `is_admin()`. Pedidos: el cliente ve los suyos; el admin todos.
- **Precio recalculado en servidor**: `shop-create-order` ignora el importe del cliente y recalcula precio/stock/envío desde la BD. El cliente **no** puede crear ni marcar pedidos como pagados (sin policies de escritura).
- **Idempotencia + stock atómico**: `redsys-notify` (kind `order`) llama a la RPC `confirmar_pedido_pagado`, que descuenta stock y marca pagado en una transacción, solo la primera vez (Redsys reintenta notificaciones).

## Despliegue

### 1. Base de datos (migraciones)
Aplicar en orden (Supabase SQL Editor o `supabase db push`):
- `20260624100000_store_catalog.sql`
- `20260624100100_store_product_images_bucket.sql`
- `20260624100200_store_orders.sql`
- `20260624100300_store_confirm_order_rpc.sql`

Requiere `public.is_admin()` (migración `20260424100000`).

### 2. Edge Functions
```
supabase functions deploy shop-create-order
supabase functions deploy shop-order-status
supabase functions deploy send-order-email
supabase functions deploy redsys-notify   # modificada: añade rama kind='order'
```

### 3. Secrets (Supabase > Edge Functions > Secrets)
Ver `.env.example`. Para la tienda en concreto: `RESEND_API_KEY`, `APP_URL`, `SHOP_NOTIFY_EMAIL`, `REDSYS_*` y, opcional, `REDSYS_URL`.

### 4. Frontend
`git push` a `main` → Vercel autodeploy (los rewrites SPA ya cubren las rutas profundas).

## Checklist paso a producción (Redsys)

- [ ] Probar primero en **TEST**: define el secret `REDSYS_URL=https://sis-t.redsys.es:25443/sis/realizarPago` y usa tarjetas de prueba oficiales de Redsys.
- [ ] Verificar que la notificación `redsys-notify` marca el pedido como `pagado` y descuenta stock (revisar tabla `payments`).
- [ ] Comprobar que una notificación repetida **no** duplica stock ni email (idempotencia).
- [ ] Verificar email de confirmación al cliente y aviso al club.
- [ ] Para PRODUCCIÓN: **eliminar** el secret `REDSYS_URL` (o ponerlo a `https://sis.redsys.es/sis/realizarPago`) y cargar las credenciales reales (`REDSYS_MERCHANT_CODE`, `REDSYS_TERMINAL`, `REDSYS_SECRET_KEY`).
- [ ] (Opcional) Verificar el remitente `tienda@padelmedina.com` en Resend si se quiere usar en vez de `reservas@`.

## Decisiones de negocio (v1)
- Entrega: recogida en club **o** envío a domicilio (solo Península).
- Gastos de envío: por zona (tabla `shipping_rates`, sembrada con Península 4,90 € · gratis desde 50 €). Editables en el panel.
- IVA incluido en el precio. Sin factura con numeración legal (el email sirve de justificante).
- Variantes (talla/color) con stock independiente.
