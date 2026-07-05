import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import BottomNav from '../layout/BottomNav';
import { SHOP } from '../../pages/shop/shopTheme';

// Layout de la tienda pública — estética "dark premium indoor".
// Navbar sticky (logo + categorías reales + carrito con contador) y footer
// completo. Accesible a visitantes anónimos; mantiene el BottomNav de la app.
export default function ShopLayout() {
  const { count } = useProductCart();
  const { pathname } = useLocation();
  const onCart = pathname === '/tienda/carrito';
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    supabase.from('categories').select('id,nombre').order('orden').order('nombre')
      .then(({ data }) => setCategories(data || []));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: SHOP.bg, display: 'flex', flexDirection: 'column', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))', fontFamily: SHOP.body }}>
      <style>{`
        .shop-catbar { display: flex; gap: 0.45rem; overflow-x: auto; scrollbar-width: none; padding: 0.55rem 1rem; }
        .shop-catbar::-webkit-scrollbar { display: none; }
        .shop-catlink { flex-shrink: 0; padding: 0.42rem 0.95rem; border-radius: 999px; border: 1.5px solid ${SHOP.line}; color: ${SHOP.muted}; font-size: 0.78rem; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em; transition: all .15s; background: transparent; }
        .shop-catlink:hover, .shop-catlink.active { border-color: ${SHOP.lime}; color: ${SHOP.lime}; }
        .shop-cart-btn:hover { border-color: ${SHOP.lime}; }
      `}</style>

      {/* ── Navbar sticky ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(13,13,13,0.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${SHOP.line}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1rem', gap: '0.75rem' }}>
          <Link to="/tienda" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none', minWidth: 0 }}>
            <img src="/logo.png" alt="Padel Medina" style={{ height: 34, width: 'auto', filter: 'drop-shadow(0 0 6px rgba(200,240,49,0.25))' }} />
            <span style={{ fontFamily: SHOP.display, color: SHOP.white, fontSize: '0.98rem', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              Tienda <span style={{ color: SHOP.lime }}>·</span> Padel Medina
            </span>
          </Link>

          <Link to="/tienda/carrito" aria-label="Carrito" className="shop-cart-btn" style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: '0.8rem', flexShrink: 0,
            background: onCart ? SHOP.limeSoft : SHOP.card, border: `1.5px solid ${onCart ? SHOP.lime : SHOP.line}`,
            color: SHOP.white, textDecoration: 'none', transition: 'border-color .15s',
          }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {count > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, minWidth: 19, height: 19, padding: '0 5px',
                borderRadius: 10, background: SHOP.lime, color: '#0D0D0D', fontSize: '0.64rem', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${SHOP.bg}`,
              }}>{count > 99 ? '99+' : count}</span>
            )}
          </Link>
        </div>

        {/* Categorías (reales, de la BD) */}
        {categories.length > 0 && (
          <nav className="shop-catbar" style={{ maxWidth: 1120, margin: '0 auto', boxSizing: 'border-box' }}>
            <Link to="/tienda" className={`shop-catlink${pathname === '/tienda' && !window.location.search ? ' active' : ''}`}>Todo</Link>
            {categories.map(c => (
              <Link key={c.id} to={`/tienda?cat=${c.id}`} className="shop-catlink">{c.nombre}</Link>
            ))}
            <Link to="/tienda?cat=ofertas" className="shop-catlink" style={{ color: SHOP.lime, borderColor: 'rgba(200,240,49,0.4)' }}>% Ofertas</Link>
          </nav>
        )}
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1120, margin: '0 auto', padding: '1.25rem 1rem 3rem', boxSizing: 'border-box', color: SHOP.text }}>
        <Outlet />
      </main>

      {/* ── Footer completo ── */}
      <footer style={{ borderTop: `1px solid ${SHOP.line}`, background: SHOP.cardSoft, padding: '2rem 1rem 1.5rem' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontFamily: SHOP.display, color: SHOP.white, textTransform: 'uppercase', margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Padel Medina</p>
            <p style={{ color: SHOP.muted, fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>
              Club de pádel indoor en Medina Sidonia (Cádiz).<br />
              Recoge tu pedido en el club o te lo enviamos a casa.
            </p>
          </div>
          <div>
            <p style={{ color: SHOP.white, fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' }}>Contacto</p>
            <a href="https://wa.me/34667421519" target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: SHOP.muted, fontSize: '0.82rem', textDecoration: 'none', marginBottom: '0.3rem' }}>📱 WhatsApp del club</a>
            <a href="mailto:info@padelmedina.com" style={{ display: 'block', color: SHOP.muted, fontSize: '0.82rem', textDecoration: 'none' }}>✉️ info@padelmedina.com</a>
          </div>
          <div>
            <p style={{ color: SHOP.white, fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' }}>El club</p>
            <Link to="/" style={{ display: 'block', color: SHOP.muted, fontSize: '0.82rem', textDecoration: 'none', marginBottom: '0.3rem' }}>Reservar pista</Link>
            <Link to="/torneos" style={{ display: 'block', color: SHOP.muted, fontSize: '0.82rem', textDecoration: 'none', marginBottom: '0.3rem' }}>Torneos</Link>
            <Link to="/privacidad" style={{ display: 'block', color: SHOP.muted, fontSize: '0.82rem', textDecoration: 'none' }}>Política de privacidad</Link>
          </div>
          <div>
            <p style={{ color: SHOP.white, fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' }}>Pago seguro</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {['VISA', 'Mastercard', 'Bizum', 'Redsys'].map(m => (
                <span key={m} style={{ border: `1px solid ${SHOP.line}`, color: SHOP.muted, borderRadius: '0.4rem', padding: '0.25rem 0.55rem', fontSize: '0.7rem', fontWeight: 800 }}>{m}</span>
              ))}
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: '#525252', fontSize: '0.72rem', margin: '1.75rem 0 0' }}>
          © {new Date().getFullYear()} Padel Medina · IVA incluido en todos los precios
        </p>
      </footer>

      {/* Navegación principal compartida con el resto de la app */}
      <BottomNav />
    </div>
  );
}
