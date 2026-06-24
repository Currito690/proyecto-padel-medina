import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur, imgUrl, effectivePrice } from '../../utils/shopFormat';
import { toast } from '../../utils/notify';

export default function ProductoDetalle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useProductCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select('*, product_images(id,ruta_imagen,es_principal,orden), product_variants(id,nombre,talla,color,precio_centimos,stock,activo,orden)')
        .eq('slug', slug)
        .eq('activo', true)
        .maybeSingle();
      if (!data) { setNotFound(true); setLoading(false); return; }
      setProduct(data);
      document.title = `${data.nombre} · Tienda Padel Medina`;
      const vs = (data.product_variants || []).filter(v => v.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const firstWithStock = vs.find(v => (v.stock || 0) > 0) || vs[0];
      setVariantId(firstWithStock ? firstWithStock.id : null);
      setLoading(false);
    })();
  }, [slug]);

  const images = useMemo(() => {
    const imgs = (product?.product_images || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    imgs.sort((a, b) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));
    return imgs;
  }, [product]);

  const variants = useMemo(
    () => (product?.product_variants || []).filter(v => v.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0)),
    [product]
  );
  const variant = variants.find(v => v.id === variantId) || null;
  const hasRealVariants = variants.length > 1 || variants.some(v => v.talla || v.color);
  const price = product ? effectivePrice(product, variant) : 0;
  const stock = variant ? (variant.stock || 0) : 0;
  const agotado = stock <= 0;

  const variantLabel = (v) => v.nombre && v.nombre !== 'Única' ? v.nombre : [v.talla, v.color].filter(Boolean).join(' / ') || 'Única';

  const handleAdd = () => {
    if (!variant) { toast('Selecciona una opción', 'error'); return; }
    if (agotado) return;
    addItem({
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      nombre: product.nombre,
      varianteDesc: hasRealVariants ? variantLabel(variant) : null,
      precioCentimos: price,
      imagen: images[0]?.ruta_imagen || null,
      stock,
    }, qty);
    toast('Añadido al carrito', 'success');
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: '#94A3B8' }}>Cargando…</div>;
  if (notFound) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94A3B8' }}>
      <p style={{ fontWeight: 700, color: '#64748B' }}>Producto no encontrado</p>
      <Link to="/tienda" style={{ color: '#16A34A', fontWeight: 700 }}>← Volver a la tienda</Link>
    </div>
  );

  const hasOffer = product.precio_oferta_centimos != null && (!variant || variant.precio_centimos == null);

  return (
    <div>
      <Link to="/tienda" style={{ color: '#64748B', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>← Tienda</Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.75rem', marginTop: '1rem' }}>
        {/* Galería */}
        <div>
          <div style={{ aspectRatio: '1 / 1', borderRadius: '1.25rem', overflow: 'hidden', background: images.length ? '#0F172A' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {images.length ? <img src={imgUrl(images[activeImg]?.ruta_imagen)} alt={product.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '4rem' }}>🎾</span>}
          </div>
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
              {images.map((im, i) => (
                <button key={im.id} onClick={() => setActiveImg(i)} style={{ width: 60, height: 60, borderRadius: '0.6rem', overflow: 'hidden', border: `2px solid ${i === activeImg ? '#16A34A' : '#E2E8F0'}`, padding: 0, cursor: 'pointer', background: '#0F172A' }}>
                  <img src={imgUrl(im.ruta_imagen)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 style={{ margin: '0 0 0.6rem', fontSize: '1.6rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>{product.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 900, color: '#16A34A', fontSize: '1.7rem' }}>{fmtEur(price)}</span>
            {hasOffer && <span style={{ fontSize: '1rem', color: '#94A3B8', textDecoration: 'line-through' }}>{fmtEur(product.precio_centimos)}</span>}
          </div>

          {product.descripcion && (
            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 1.25rem', whiteSpace: 'pre-wrap' }}>{product.descripcion}</p>
          )}

          {hasRealVariants && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Opción</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {variants.map(v => {
                  const sel = v.id === variantId;
                  const vAgot = (v.stock || 0) <= 0;
                  return (
                    <button key={v.id} onClick={() => { setVariantId(v.id); setQty(1); }} disabled={vAgot}
                      style={{ padding: '0.5rem 0.9rem', borderRadius: '0.6rem', border: `2px solid ${sel ? '#16A34A' : '#E2E8F0'}`, background: sel ? '#F0FDF4' : 'white', color: vAgot ? '#CBD5E1' : '#0F172A', fontWeight: 700, fontSize: '0.82rem', cursor: vAgot ? 'not-allowed' : 'pointer', textDecoration: vAgot ? 'line-through' : 'none' }}>
                      {variantLabel(v)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: agotado ? '#DC2626' : stock <= 5 ? '#D97706' : '#15803D' }}>
              {agotado ? 'Agotado' : stock <= 5 ? `¡Solo quedan ${stock}!` : 'En stock'}
            </span>
          </div>

          {!agotado && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #CBD5E1', borderRadius: '0.7rem', overflow: 'hidden' }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={qtyBtn}>−</button>
                <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 700 }}>{qty}</span>
                <button onClick={() => setQty(q => Math.min(stock, q + 1))} style={qtyBtn}>+</button>
              </div>
              <button onClick={handleAdd} style={{ flex: 1, minWidth: 180, padding: '0.85rem 1.5rem', background: '#16A34A', color: 'white', border: 'none', borderRadius: '0.8rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>
                Añadir al carrito
              </button>
            </div>
          )}

          <button onClick={() => navigate('/tienda/carrito')} style={{ marginTop: '0.9rem', background: 'none', border: 'none', color: '#1B3A6E', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}>
            Ver carrito →
          </button>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = { width: 38, height: 40, border: 'none', background: '#F8FAFC', color: '#0F172A', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer' };
