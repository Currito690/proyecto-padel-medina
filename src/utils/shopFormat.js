import { supabase } from '../services/supabase';

// Helpers compartidos de la tienda (formato de dinero en céntimos, imágenes).
export const SHOP_BUCKET = 'product-images';

export const fmtEur = (cents) =>
  cents === null || cents === undefined
    ? '—'
    : (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const imgUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return supabase.storage.from(SHOP_BUCKET).getPublicUrl(path).data.publicUrl;
};

// Precio efectivo (céntimos) de un producto, considerando variante y oferta.
// Prioridad: precio propio de la variante > precio de oferta del producto > precio base.
export const effectivePrice = (product, variant) => {
  if (variant && variant.precio_centimos != null) return variant.precio_centimos;
  if (product.precio_oferta_centimos != null) return product.precio_oferta_centimos;
  return product.precio_centimos;
};

export const principalImagePath = (product) => {
  const imgs = product?.product_images || [];
  const pr = imgs.find(i => i.es_principal) || imgs[0];
  return pr ? pr.ruta_imagen : null;
};

export const totalStock = (product) =>
  (product?.product_variants || []).reduce((s, v) => s + (v.stock || 0), 0);
