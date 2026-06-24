import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { fmtEur, imgUrl, effectivePrice, principalImagePath, totalStock } from '../../utils/shopFormat';

// Catálogo público: grid de productos activos con imagen, nombre y precio.
// Filtro por categoría + buscador. Respeta la identidad visual del sitio.
export default function Tienda() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    document.title = 'Tienda · Padel Medina';
    (async () => {
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase
          .from('products')
          .select('id,nombre,slug,precio_centimos,precio_oferta_centimos,categoria_id,destacado,orden,product_images(ruta_imagen,es_principal,orden),product_variants(precio_centimos,stock,activo)')
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (cat !== 'all' && p.categoria_id !== cat) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, cat]);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.6rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Tienda Padel Medina</h1>
        <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem' }}>Palas, ropa y accesorios. Recógelo en el club o te lo enviamos.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
          style={{ flex: '1 1 220px', maxWidth: 360, padding: '0.7rem 0.9rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
        <select value={cat} onChange={e => setCat(e.target.value)}
          style={{ padding: '0.7rem 0.9rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', cursor: 'pointer', background: 'white' }}>
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94A3B8' }}>Cargando productos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94A3B8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛍️</div>
          <p style={{ fontWeight: 700, color: '#64748B', margin: 0 }}>No hay productos disponibles</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
          {filtered.map(p => {
            const img = imgUrl(principalImagePath(p));
            const price = effectivePrice(p, null);
            const hasOffer = p.precio_oferta_centimos != null;
            const agotado = totalStock(p) <= 0;
            return (
              <Link key={p.id} to={`/tienda/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow .15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ position: 'relative', aspectRatio: '1 / 1', background: img ? '#0F172A' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {img ? <img src={img} alt={p.nombre} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '2.5rem' }}>🎾</span>}
                    {hasOffer && !agotado && <span style={tag('#16A34A')}>Oferta</span>}
                    {agotado && <span style={tag('#64748B')}>Agotado</span>}
                  </div>
                  <div style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.nombre}</h3>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 800, color: '#16A34A', fontSize: '1rem' }}>{fmtEur(price)}</span>
                      {hasOffer && <span style={{ fontSize: '0.75rem', color: '#94A3B8', textDecoration: 'line-through' }}>{fmtEur(p.precio_centimos)}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const tag = (bg) => ({ position: 'absolute', top: 8, left: 8, background: bg, color: 'white', fontSize: '0.62rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em' });
