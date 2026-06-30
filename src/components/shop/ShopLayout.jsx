import { Outlet, Link, useLocation } from 'react-router-dom';
import { useProductCart } from '../../context/ProductCartContext';
import BottomNav from '../layout/BottomNav';

// Cabecera/standalone de la tienda pública (no usa el MainLayout de cliente,
// para que sea accesible también a visitantes anónimos). Respeta la identidad
// visual: navy de acento, fuente Inter, utilidades globales.
export default function ShopLayout() {
  const { count } = useProductCart();
  const { pathname } = useLocation();
  const onCart = pathname === '/tienda/carrito';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary, #F8FAFC)', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(226,232,240,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1rem', gap: '0.75rem',
      }}>
        <Link to="/tienda" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <img src="/logo.png" alt="Padel Medina" style={{ height: 32, width: 'auto' }} />
          <span style={{ fontWeight: 800, color: '#1B3A6E', fontSize: '1.05rem', letterSpacing: '-0.02em' }}>Tienda</span>
        </Link>

        <Link to="/tienda/carrito" aria-label="Carrito" style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 42, borderRadius: '0.75rem',
          background: onCart ? 'var(--color-accent-light, #EBF0FA)' : 'transparent',
          color: '#1B3A6E', textDecoration: 'none',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {count > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 9, background: '#DC2626', color: 'white', fontSize: '0.62rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid white',
            }}>{count > 99 ? '99+' : count}</span>
          )}
        </Link>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1080, margin: '0 auto', padding: '1.25rem 1rem 3rem', boxSizing: 'border-box' }}>
        <Outlet />
      </main>

      <footer style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted, #94A3B8)', fontSize: '0.72rem' }}>
        © {new Date().getFullYear()} Padel Medina
      </footer>

      {/* Navegación principal compartida con el resto de la app */}
      <BottomNav />
    </div>
  );
}
