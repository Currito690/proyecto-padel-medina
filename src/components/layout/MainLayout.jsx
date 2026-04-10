import { Outlet, Link, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';

const MainLayout = () => {
  const location = useLocation();
  const { count } = useCart();
  const isActive = (path) => location.pathname === path;

  const navItems = [
    {
      path: '/',
      label: 'Reservas',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'none' : 'none'} stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      path: '/carrito',
      label: 'Carrito',
      badge: count,
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      ),
    },
    {
      path: '/mis-reservas',
      label: 'Mis Reservas',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      path: '/perfil',
      label: 'Perfil',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <style>{`
        .main-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--color-bg-secondary);
        }

        /* ── Top header bar ── */
        .top-header {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 56px;
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(226,232,240,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 1.25rem;
          box-shadow: 0 1px 12px rgba(0,0,0,0.06);
          z-index: 100;
        }
        .top-header-logo-img {
          height: 36px;
          width: auto;
          object-fit: contain;
          display: block;
        }

        .main-content {
          flex: 1;
          padding-top: 56px;   /* top header height */
          padding-bottom: 72px; /* bottom nav height */
        }

        /* ── Bottom nav ── */
        .bottom-nav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: rgba(255,255,255,0.93);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(226,232,240,0.8);
          display: flex;
          justify-content: space-around;
          align-items: stretch;
          height: 64px;
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -2px 16px rgba(0,0,0,0.06);
          z-index: 100;
        }
        .nav-link {
          flex: 1;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          transition: color 0.2s;
          position: relative;
          padding: 0 4px;
        }
        .nav-link-active { color: var(--color-accent); }
        .nav-link-inactive { color: var(--color-text-muted); }
        .nav-active-dot {
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 20px; height: 3px;
          background: var(--color-accent);
          border-radius: 0 0 3px 3px;
        }
        .nav-label {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .nav-icon-wrap {
          position: relative;
          display: inline-flex;
        }
        .nav-badge {
          position: absolute;
          top: -6px;
          right: -9px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: #DC2626;
          color: white;
          font-size: 0.62rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid white;
          box-sizing: border-box;
        }

        @media (min-width: 640px) {
          .bottom-nav { height: 68px; }
          .main-content { padding-bottom: 76px; }
          .nav-label { font-size: 0.7rem; }
        }

        @media (min-width: 1024px) {
          .top-header {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 0 0 1rem 1rem;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
          .bottom-nav {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 1rem 1rem 0 0;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
        }
      `}</style>

      <div className="main-layout">
        {/* Top branding header */}
        <header className="top-header">
          <img src="/logo.png" alt="Padel Medina" className="top-header-logo-img" />
        </header>

        <main className="main-content">
          <Outlet />
        </main>

        <nav className="bottom-nav">
          {navItems.map(({ path, label, icon, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`nav-link ${active ? 'nav-link-active' : 'nav-link-inactive'}`}
              >
                {active && <span className="nav-active-dot" />}
                <span className="nav-icon-wrap">
                  {icon(active)}
                  {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
                </span>
                <span className="nav-label">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
};

export default MainLayout;
