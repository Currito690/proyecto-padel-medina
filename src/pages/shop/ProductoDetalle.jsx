import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur, imgUrl, effectivePrice, principalImagePath, totalStock } from '../../utils/shopFormat';
import { SHOP, displayFont, ctaBtn, darkCard, badge, productBadges } from './shopTheme';
import { toast } from '../../utils/notify';

// Ficha de producto (dark premium): galería, badges reales, selector de
// variante/cantidad, pestañas y productos relacionados. CTA fija en móvil.
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
  const [tab, setTab] = useState('desc');
  const [related, setRelated] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setActiveImg(0);
      setQty(1);
      setTab('desc');
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

      // "Completa tu equipación": otros productos de la misma categoría
      if (data.categoria_id) {
        const { data: rel } = await supabase
          .from('products')
          .select('id,nombre,slug,precio_centimos,precio_oferta_centimos,product_images(ruta_imagen,es_principal,orden),product_variants(stock,activo)')
          .eq('activo', true)
          .eq('categoria_id', data.categoria_id)
          .neq('id', data.id)
          .limit(4);
        setRelated(rel || []);
      } else {
        setRelated([]);
      }
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
    toast('¡Añadido al carrito! 🎾', 'success');
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: SHOP.muted }}>Cargando…</div>;
  if (notFound) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: SHOP.muted }}>
      <p style={{ fontWeight: 700 }}>Producto no encontrado</p>
      <Link to="/tienda" style={{ color: SHOP.lime, fontWeight: 700 }}>← Volver a la tienda</Link>
    </div>
  );

  const hasOffer = product.precio_oferta_centimos != null && (!variant || variant.precio_centimos == null);
  const badges = productBadges(product, totalStock(product));

  return (
    <div style={{ paddingBottom: '4.5rem' }}>
      <style>{`
        .pd-sticky { display: none; }
        @media (max-width: 640px) {
          .pd-sticky { display: flex; position: fixed; left: 10px; right: 10px; bottom: calc(78px + env(safe-area-inset-bottom)); z-index: 60; }
        }
        .pd-thumb { transition: border-color .15s; }
        .pd-cta:hover { transform: translateY(-2px); }
        .pd-rel-card { transition: transform .15s, border-color .15s; }
        .pd-rel-card:hover { transform: translateY(-3px); border-color: ${SHOP.lime} !important; }
      `}</style>

      <Link to="/tienda" style={{ color: SHOP.muted, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>← Tienda</Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.75rem', marginTop: '1rem' }}>
        {/* ── Galería ── */}
        <div>
          <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '1.25rem', overflow: 'hidden', background: '#111111', border: `1px solid ${SHOP.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {images.length
              ? <img src={imgUrl(images[activeImg]?.ruta_imagen)} alt={product.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '4rem' }}>🎾</span>}
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
              {badges.map(b => <span key={b.label} style={badge(b.bg, b.color)}>{b.label}</span>)}
            </div>
          </div>
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
              {images.map((im, i) => (
                <button key={im.id} onClick={() => setActiveImg(i)} className="pd-thumb" style={{ width: 62, height: 62, borderRadius: '0.6rem', overflow: 'hidden', border: `2px solid ${i === activeImg ? SHOP.lime : SHOP.line}`, padding: 0, cursor: 'pointer', background: '#111111' }}>
                  <img src={imgUrl(im.ruta_imagen)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <div>
          <h1 style={{ ...displayFont('clamp(1.4rem, 4.5vw, 2rem)'), marginBottom: '0.75rem' }}>{product.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '1.1rem' }}>
            <span style={{ fontWeight: 900, color: SHOP.lime, fontSize: '1.9rem', fontFamily: SHOP.body }}>{fmtEur(price)}</span>
            {hasOffer && <span style={{ fontSize: '1rem', color: '#6B7280', textDecoration: 'line-through' }}>{fmtEur(product.precio_centimos)}</span>}
            {hasOffer && <span style={badge(SHOP.lime)}>-{Math.round((1 - product.precio_oferta_centimos / product.precio_centimos) * 100)}%</span>}
          </div>

          {hasRealVariants && (
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: SHOP.muted, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Talla / opción</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {variants.map(v => {
                  const sel = v.id === variantId;
                  const vAgot = (v.stock || 0) <= 0;
                  return (
                    <button key={v.id} onClick={() => { setVariantId(v.id); setQty(1); }} disabled={vAgot}
                      style={{ padding: '0.55rem 1rem', borderRadius: '0.65rem', border: `2px solid ${sel ? SHOP.lime : SHOP.line}`, background: sel ? SHOP.limeSoft : SHOP.card, color: vAgot ? '#525252' : SHOP.white, fontWeight: 800, fontSize: '0.84rem', cursor: vAgot ? 'not-allowed' : 'pointer', textDecoration: vAgot ? 'line-through' : 'none' }}>
                      {variantLabel(v)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '0.83rem', fontWeight: 800, color: agotado ? SHOP.danger : stock <= 5 ? SHOP.amber : SHOP.lime }}>
              {agotado ? '● Agotado' : stock <= 5 ? `● ¡Solo quedan ${stock}!` : '● En stock'}
            </span>
          </div>

          {!agotado && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${SHOP.line}`, borderRadius: '0.7rem', overflow: 'hidden', background: SHOP.card }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={qtyBtn}>−</button>
                <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 800, color: SHOP.white }}>{qty}</span>
                <button onClick={() => setQty(q => Math.min(stock, q + 1))} style={qtyBtn}>+</button>
              </div>
              <button onClick={handleAdd} className="pd-cta" style={ctaBtn({ flex: 1, minWidth: 190 })}>
                Añadir al carrito
              </button>
            </div>
          )}

          <button onClick={() => navigate('/tienda/carrito')} style={{ marginTop: '1rem', background: 'none', border: 'none', color: SHOP.muted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}>
            Ver carrito →
          </button>

          {/* ── Pestañas ── */}
          <div style={{ marginTop: '1.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', borderBottom: `1px solid ${SHOP.line}`, marginBottom: '0.9rem' }}>
              {[['desc', 'Descripción'], ['envio', 'Envío y recogida']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{
                  padding: '0.6rem 0.9rem', background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === k ? SHOP.lime : SHOP.muted, fontWeight: 800, fontSize: '0.82rem',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: `2px solid ${tab === k ? SHOP.lime : 'transparent'}`, marginBottom: -1,
                }}>{l}</button>
              ))}
            </div>
            {tab === 'desc' ? (
              product.descripcion
                ? <p style={{ color: '#C7C7C7', fontSize: '0.9rem', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{product.descripcion}</p>
                : <p style={{ color: SHOP.muted, fontSize: '0.85rem', margin: 0 }}>Pregúntanos por este producto en el club.</p>
            ) : (
              <ul style={{ color: '#C7C7C7', fontSize: '0.88rem', lineHeight: 1.9, margin: 0, paddingLeft: '1.1rem' }}>
                <li><strong style={{ color: SHOP.white }}>Recogida en el club:</strong> gratis, te avisamos por email cuando esté listo.</li>
                <li><strong style={{ color: SHOP.white }}>Envío a domicilio:</strong> España peninsular. El coste se calcula al finalizar la compra.</li>
                <li><strong style={{ color: SHOP.white }}>Pago seguro:</strong> tarjeta o Bizum a través de Redsys.</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Completa tu equipación ── */}
      {related.length > 0 && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2 style={{ ...displayFont('1.1rem'), marginBottom: '0.9rem' }}>Completa tu <span style={{ color: SHOP.lime }}>equipación</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.9rem' }}>
            {related.map(r => {
              const img = imgUrl(principalImagePath(r));
              const rPrice = effectivePrice(r, null);
              return (
                <Link key={r.id} to={`/tienda/${r.slug}`} style={{ textDecoration: 'none' }}>
                  <div className="pd-rel-card" style={darkCard({ overflow: 'hidden' })}>
                    <div style={{ aspectRatio: '1/1', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {img ? <img src={img} alt={r.nombre} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>🎾</span>}
                    </div>
                    <div style={{ padding: '0.6rem 0.7rem' }}>
                      <div style={{ color: SHOP.white, fontWeight: 700, fontSize: '0.78rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.nombre}</div>
                      <div style={{ color: SHOP.lime, fontWeight: 900, fontSize: '0.88rem', marginTop: '0.25rem' }}>{fmtEur(rPrice)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CTA fija en móvil ── */}
      {!agotado && (
        <div className="pd-sticky" style={{ gap: '0.6rem', alignItems: 'center', background: 'rgba(20,20,20,0.97)', border: `1px solid ${SHOP.line}`, borderRadius: '1rem', padding: '0.6rem 0.8rem', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: SHOP.white, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>{product.nombre}</div>
            <div style={{ color: SHOP.lime, fontWeight: 900, fontSize: '0.95rem' }}>{fmtEur(price)}</div>
          </div>
          <button onClick={handleAdd} style={ctaBtn({ flex: 1, padding: '0.75rem 1rem', fontSize: '0.8rem' })}>Añadir</button>
        </div>
      )}
    </div>
  );
}

const qtyBtn = { width: 40, height: 42, border: 'none', background: 'transparent', color: '#F5F5F5', fontSize: '1.15rem', fontWeight: 800, cursor: 'pointer' };
