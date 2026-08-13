-- TIENDA ELIMINADA: la tienda online se quita de la app en su totalidad.
-- ⚠️ OJO: ejecutar esto BORRA DEFINITIVAMENTE el catálogo (productos,
-- categorías, variantes, imágenes), los PEDIDOS con su historial de pagos,
-- las tarifas de envío y el bucket de imágenes de producto. No hay vuelta
-- atrás: exporta antes lo que quieras conservar (Table Editor > Export CSV).
-- Las reservas, torneos, eventos y fichajes NO se tocan.

-- RPCs del flujo de pago de pedidos (las llamaba redsys-notify, rama 'order')
DROP FUNCTION IF EXISTS public.confirmar_pedido_pagado(TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.marcar_pedido_fallido(TEXT, TEXT, JSONB);

-- Tablas de pedidos (hijas primero por las claves foráneas)
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.order_items;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.shipping_rates;

-- Catálogo
DROP TABLE IF EXISTS public.product_images;
DROP TABLE IF EXISTS public.product_variants;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.categories;

-- Trigger helper que solo usaban products/orders (sus triggers caen con las tablas)
DROP FUNCTION IF EXISTS public.set_updated_at();

-- Bucket de imágenes de producto: primero sus políticas, luego los objetos
-- (un bucket con ficheros dentro no se puede borrar) y por último el bucket.
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id = 'product-images';
DELETE FROM storage.buckets WHERE id = 'product-images';
