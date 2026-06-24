-- ============================================================================
-- TIENDA ONLINE — Catálogo (categorías, productos, variantes, imágenes)
-- ----------------------------------------------------------------------------
-- Dominio NUEVO y aislado de reservas/torneos. Convenciones del repo:
--   · id UUID gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT now()
--   · RLS: lectura pública del catálogo activo / escritura solo public.is_admin()
-- NOVEDAD respecto al resto del proyecto (por el brief de la tienda):
--   · Importes monetarios en CÉNTIMOS (integer), no en euros numeric.
--   · slug TEXT UNIQUE para URLs amigables (/tienda/:slug).
-- ============================================================================

-- Helper reutilizable: mantener updated_at al actualizar una fila.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT DEFAULT '',
  precio_centimos INTEGER NOT NULL CHECK (precio_centimos >= 0),
  precio_oferta_centimos INTEGER CHECK (precio_oferta_centimos IS NULL OR precio_oferta_centimos >= 0),
  categoria_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  activo BOOLEAN DEFAULT true,
  destacado BOOLEAN DEFAULT false,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── product_variants ────────────────────────────────────────────────────────
-- El STOCK real vive aquí. Un producto "simple" tiene 1 variante ("Única").
-- precio_centimos NULL = hereda products.precio_centimos.
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT 'Única',
  talla TEXT,
  color TEXT,
  sku TEXT,
  precio_centimos INTEGER CHECK (precio_centimos IS NULL OR precio_centimos >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── product_images ──────────────────────────────────────────────────────────
-- Varias imágenes por producto. Ruta en el bucket de Storage 'product-images'
-- (convención products/{product_id}/{uuid}.{ext}).
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ruta_imagen TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  es_principal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_categoria ON public.products (categoria_id);
CREATE INDEX IF NOT EXISTS idx_products_activo ON public.products (activo);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images (product_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- categories: lectura pública, escritura admin
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories"
  ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products: público ve los activos; admin gestiona todos (incl. inactivos)
DROP POLICY IF EXISTS "Public read active products" ON public.products;
CREATE POLICY "Public read active products"
  ON public.products FOR SELECT USING (activo = true);
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
  ON public.products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_variants: público ve variantes activas de productos activos
DROP POLICY IF EXISTS "Public read active variants" ON public.product_variants;
CREATE POLICY "Public read active variants"
  ON public.product_variants FOR SELECT
  USING (
    activo = true
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.activo = true)
  );
DROP POLICY IF EXISTS "Admins manage variants" ON public.product_variants;
CREATE POLICY "Admins manage variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_images: público ve imágenes de productos activos
DROP POLICY IF EXISTS "Public read images of active products" ON public.product_images;
CREATE POLICY "Public read images of active products"
  ON public.product_images FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.activo = true));
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins manage product images"
  ON public.product_images FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
