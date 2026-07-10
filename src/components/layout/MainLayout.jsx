import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

const MainLayout = () => {
  return (
    <>
      <style>{`
        .main-layout {
          display: flex;
          flex-direction: column;
          background: var(--color-bg-secondary);
        }

        /* ── Top header bar ── */
        .top-header {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: calc(56px + env(safe-area-inset-top));
          padding-top: env(safe-area-inset-top);
          padding-left: calc(1.25rem + env(safe-area-inset-left));
          padding-right: calc(1.25rem + env(safe-area-inset-right));
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(226,232,240,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 12px rgba(0,0,0,0.06);
          z-index: 100;
        }
        .top-header-logo-img {
          height: 36px;
          width: auto;
          object-fit: contain;
          display: block;
        }
        /* Filo de marca bajo la cabecera (navy → verde) */
        .top-header::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -1px;
          height: 2.5px;
          background: linear-gradient(90deg, #1B3A6E 0%, #16A34A 60%, #4ADE80 100%);
          opacity: 0.85;
        }

        .main-content {
          padding-top: calc(56px + env(safe-area-inset-top));
          padding-bottom: 0;
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
        }
      `}</style>

      <div className="main-layout">
        {/* Top branding header */}
        <header className="top-header">
          <img src="/logo.png" alt="Padel Medina" className="top-header-logo-img" />
        </header>

        <main className="main-content">
          <Outlet />
          <footer style={{ textAlign: 'center', padding: '1rem 1rem 0.5rem', color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 500 }}>
            © {new Date().getFullYear()} Dimana STUDIO
          </footer>
        </main>

        <BottomNav />
      </div>
    </>
  );
};

export default MainLayout;
