import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur, imgUrl, effectivePrice, principalImagePath, totalStock } from '../../utils/shopFormat';
import { SHOP, displayFont, ctaBtn, darkCard, badge, darkInput, productBadges, categoryEmoji } from './shopTheme';
import { toast } from '../../utils/notify';

// Portada + catálogo de la tienda (dark premium): hero, categorías destacadas,
// top ventas, banner de ofertas y grid completo con filtros. Datos 100% reales.
export default function Tienda() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const cat = searchParams.get('cat') || 'all';
  const [maxPrice, setMaxPrice] = useState('all'); // 'all' | céntimos tope
  const [sort, setSort] = useState('relevancia');  // relevancia | precio-asc | precio-desc | novedades
  const gridRef = useRef(null);
  const navigate = useNavigate();
  const { addItem } = useProductCart();

  useEffect(() => {
    document.title = 'Tienda · Padel Medina';
    (async () => {
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase
          .from('products')
          .select('id,nombre,slug,precio_centimos,precio_oferta_centimos,categoria_id,destacado,orden,created_at,product_images(ruta_imagen,es_principal,orden),product_variants(id,nombre,talla,color,precio_centimos,stock,activo)')
          .eq('activo', true)
          .order('destacado', { ascending: false })
          .order('orden', { ascending: true }),
        supabase.from('categories').select('id,nombre').order('orden').order('nombre'),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setLoading(false);
    })();
  }, []);

  const setCat = (v) => {
    const np = new URLSearchParams(searchParams);
    if (v === 'all') np.delete('cat'); else np.set('cat', v);
    setSearchParams(np, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter(p => {
      if (cat === 'ofertas') { if (p.precio_oferta_centimos == null) return false; }
      else if (cat !== 'all' && p.categoria_id !== cat) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      if (maxPrice !== 'all' && effectivePrice(p, null) > Number(maxPrice)) return false;
      return true;
    });
    if (sort === 'precio-asc') list = [...list].sort((a, b) => effectivePrice(a, null) - effectivePrice(b, null));
    if (sort === 'precio-desc') list = [...list].sort((a, b) => effectivePrice(b, null) - effectivePrice(a, null));
    if (sort === 'novedades') list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [products, search, cat, maxPrice, sort]);

  const destacados = useMemo(() => products.filter(p => p.destacado && totalStock(p) > 0).slice(0, 8), [products]);
  const maxDiscount = useMemo(() => {
    let m = 0;
    products.forEach(p => {
      if (p.precio_oferta_centimos != null && p.precio_centimos > 0) {
        m = Math.max(m, Math.round((1 - p.precio_oferta_centimos / p.precio_centimos) * 100));
      }
    });
    return m;
  }, [products]);

  const scrollToGrid = () => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Añadido rápido desde la tarjeta (solo productos de una única variante)
  const quickAdd = (e, p) => {
    e.preventDefault();
    const vs = (p.product_variants || []).filter(v => v.activo !== false);
    const real = vs.length > 1 || vs.some(v => v.talla || v.color);
    if (real) { navigate(`/tienda/${p.slug}`); return; } // necesita elegir talla/color
    const v = vs[0];
    if (!v || (v.stock || 0) <= 0) return;
    addItem({
      productId: p.id, variantId: v.id, slug: p.slug, nombre: p.nombre,
      varianteDesc: null, precioCentimos: effectivePrice(p, v),
      imagen: principalImagePath(p), stock: v.stock,
    }, 1);
    toast('¡Añadido al carrito! 🎾', 'success');
  };

  return (
    <div>
      <style>{`
        @keyframes shopFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .shop-hero-in { animation: shopFadeUp .5s ease both; }
        .shop-card { transition: transform .18s, border-color .18s, box-shadow .18s; }
        .shop-card:hover { transform: translateY(-4px); border-color: ${SHOP.lime} !important; box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
        .shop-card:hover .shop-quickadd { opacity: 1; transform: translateY(0); }
        .shop-quickadd { opacity: 0; transform: translateY(6px); transition: opacity .18s, transform .18s; }
        @media (hover: none) { .shop-quickadd { opacity: 1; transform: none; } }
        .shop-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(22,163,74,0.4); }
        .shop-catcard { transition: transform .18s, border-color .18s; }
        .shop-catcard:hover { transform: translateY(-3px); border-color: ${SHOP.lime} !important; }
        .shop-row { display: flex; gap: 0.9rem; overflow-x: auto; scrollbar-width: none; padding-bottom: 0.4rem; }
        .shop-row::-webkit-scrollbar { display: none; }
        .shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.9rem; }
        @media (min-width: 720px) { .shop-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1000px) { .shop-grid { grid-template-columns: repeat(4, 1fr); gap: 1.1rem; } }
        @media (max-width: 640px) {
          .shop-filters input { flex: 1 1 100% !important; max-width: none !important; }
          .shop-filters select { flex: 1 1 46%; min-width: 0; width: auto !important; }
        }
        @media (max-width: 380px) { .shop-grid { gap: 0.6rem; } }
      `}</style>

      {/* ── HERO ── */}
      <section className="shop-hero-in" style={{
        position: 'relative', overflow: 'hidden', borderRadius: '1.4rem', marginBottom: '1.75rem',
        background: `radial-gradient(1200px 400px at 85% -10%, rgba(34,197,94,0.16), transparent 60%), linear-gradient(140deg, #1B3A6E 0%, #0A1830 70%)`,
        border: `1px solid ${SHOP.line}`, padding: 'clamp(2.2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3rem)',
      }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', border: '2px solid rgba(74,222,128,0.15)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 40, bottom: -90, width: 200, height: 200, borderRadius: '50%', border: '2px solid rgba(74,222,128,0.08)', pointerEvents: 'none' }} />
        <span style={badge(SHOP.limeSoft, SHOP.lime)}>Tienda oficial del club</span>
        <h1 style={{ ...displayFont('clamp(2rem, 7vw, 3.4rem)'), margin: '0.9rem 0 0.6rem', maxWidth: '14ch' }}>
          Equípate como <span style={{ color: SHOP.lime }}>un pro</span>
        </h1>
        <p style={{ color: SHOP.muted, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '46ch', margin: '0 0 1.5rem' }}>
          Palas, ropa y accesorios seleccionados por jugadores del club. Recógelo en Padel Medina o recíbelo en casa.
        </p>
        <button onClick={scrollToGrid} className="shop-cta" style={ctaBtn()}>
          Ver colección
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        </button>
      </section>

      {/* ── Banner de ofertas (solo si hay ofertas REALES) ── */}
      {maxDiscount > 0 && cat !== 'ofertas' && (
        <button onClick={() => { setCat('ofertas'); scrollToGrid(); }} style={{
          width: '100%', border: 'none', cursor: 'pointer', borderRadius: '1rem', marginBottom: '1.75rem',
          background: SHOP.accent, color: 'white', padding: '0.9rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap',
          fontFamily: SHOP.display, textTransform: 'uppercase', fontSize: 'clamp(0.85rem, 3vw, 1.05rem)', letterSpacing: '0.02em',
        }}>
          ⚡ Ofertas del club — hasta -{maxDiscount}% · Ver todas →
        </button>
      )}

      {/* ── Categorías destacadas ── */}
      {categories.length > 0 && (
        <section style={{ marginBottom: '1.9rem' }}>
          <h2 style={{ ...displayFont('1.15rem'), marginBottom: '0.9rem' }}>Categorías</h2>
          <div className="shop-row">
            {categories.map(c => (
              <button key={c.id} onClick={() => { setCat(c.id); scrollToGrid(); }} className="shop-catcard" style={{
                ...darkCard({ cursor: 'pointer', flexShrink: 0, minWidth: 132, padding: '1.1rem 1rem', textAlign: 'center' }),
              }}>
                <div style={{ fontSize: '1.9rem', marginBottom: '0.4rem' }}>{categoryEmoji(c.nombre)}</div>
                <div style={{ color: SHOP.white, fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: SHOP.body }}>{c.nombre}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Top ventas ── */}
      {destacados.length > 0 && (
        <section style={{ marginBottom: '1.9rem' }}>
          <h2 style={{ ...displayFont('1.15rem'), marginBottom: '0.9rem' }}>Top <span style={{ color: SHOP.lime }}>ventas</span></h2>
          <div className="shop-row">
            {destacados.map(p => <ProductCard key={p.id} p={p} onQuickAdd={quickAdd} fixed />)}
          </div>
        </section>
      )}

      {/* ── Ventajas ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem', marginBottom: '2rem' }}>
        {[
          ['🏬', 'Recogida gratis', 'en el club'],
          ['📦', 'Envío a domicilio', 'España peninsular'],
          ['🔒', 'Pago 100% seguro', 'Redsys · Bizum'],
          ['🎾', 'Asesoramiento', 'de jugadores del club'],
        ].map(([icon, t, s]) => (
          <div key={t} style={darkCard({ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.7rem' })}>
            <span style={{ fontSize: '1.4rem' }}>{icon}</span>
            <div>
              <div style={{ color: SHOP.white, fontWeight: 800, fontSize: '0.8rem' }}>{t}</div>
              <div style={{ color: SHOP.muted, fontSize: '0.72rem' }}>{s}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Catálogo aún sin productos: estado "en preparación" (no parece roto) ── */}
      {!loading && products.length === 0 ? (
        <section ref={gridRef} style={{ scrollMarginTop: 110, textAlign: 'center', padding: '3rem 1rem', ...darkCard({}) }}>
          <div style={{ fontSize: '2.8rem', marginBottom: '0.75rem' }}>🛍️</div>
          <h2 style={{ ...displayFont('1.2rem'), marginBottom: '0.6rem' }}>Estamos preparando el catálogo</h2>
          <p style={{ color: SHOP.muted, fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '42ch', margin: '0 auto' }}>
            Muy pronto podrás comprar aquí palas, ropa y accesorios seleccionados por el club. ¡Vuelve en unos días!
          </p>
        </section>
      ) : (
      <section ref={gridRef} style={{ scrollMarginTop: 110 }}>
        <h2 style={{ ...displayFont('1.15rem'), marginBottom: '0.9rem' }}>
          {cat === 'ofertas' ? <>Ofertas <span style={{ color: SHOP.lime }}>%</span></> : 'Colección'}
        </h2>

        {/* Filtros */}
        <div className="shop-filters" style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
            style={darkInput({ flex: '1 1 200px', maxWidth: 340 })} />
          <select value={cat} onChange={e => setCat(e.target.value)} style={darkInput({ width: 'auto', cursor: 'pointer' })}>
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value="ofertas">% Ofertas</option>
          </select>
          <select value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={darkInput({ width: 'auto', cursor: 'pointer' })}>
            <option value="all">Cualquier precio</option>
            <option value="2500">Hasta 25 €</option>
            <option value="5000">Hasta 50 €</option>
            <option value="10000">Hasta 100 €</option>
            <option value="20000">Hasta 200 €</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} style={darkInput({ width: 'auto', cursor: 'pointer' })}>
            <option value="relevancia">Relevancia</option>
            <option value="novedades">Novedades</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: SHOP.muted }}>Cargando productos…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: SHOP.muted }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛍️</div>
            <p style={{ fontWeight: 700, margin: 0 }}>No hay productos que coincidan</p>
          </div>
        ) : (
          <div className="shop-grid">
            {filtered.map(p => <ProductCard key={p.id} p={p} onQuickAdd={quickAdd} />)}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

// ── Tarjeta de producto (dark premium, badges reales, añadir rápido) ─────────
function ProductCard({ p, onQuickAdd, fixed = false }) {
  const img = imgUrl(principalImagePath(p));
  const price = effectivePrice(p, null);
  const hasOffer = p.precio_oferta_centimos != null;
  const stockT = totalStock(p);
  const agotado = stockT <= 0;
  const badges = productBadges(p, stockT);
  const vs = (p.product_variants || []).filter(v => v.activo !== false);
  const needsVariant = vs.length > 1 || vs.some(v => v.talla || v.color);

  return (
    <Link to={`/tienda/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0, width: fixed ? 190 : 'auto', display: 'block' }}>
      <div className="shop-card" style={darkCard({ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' })}>
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: SHOP.imgBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {img
            ? <img src={img} alt={p.nombre} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: agotado ? 0.45 : 1 }} />
            : <span style={{ fontSize: '2.6rem' }}>🎾</span>}
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            {badges.map(b => <span key={b.label} style={badge(b.bg, b.color)}>{b.label}</span>)}
          </div>
          {!agotado && (
            <button onClick={(e) => onQuickAdd(e, p)} className="shop-quickadd" style={{
              position: 'absolute', left: 8, right: 8, bottom: 8, padding: '0.55rem',
              background: SHOP.accent, color: 'white', border: 'none', borderRadius: '0.65rem',
              fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              cursor: 'pointer', fontFamily: SHOP.body,
            }}>
              {needsVariant ? 'Elegir opción' : '+ Añadir'}
            </button>
          )}
        </div>
        <div style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: SHOP.white, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.nombre}</h3>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
            <span style={{ fontWeight: 900, color: agotado ? SHOP.muted : SHOP.lime, fontSize: '1.02rem' }}>{fmtEur(price)}</span>
            {hasOffer && <span style={{ fontSize: '0.74rem', color: '#6B7280', textDecoration: 'line-through' }}>{fmtEur(p.precio_centimos)}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
