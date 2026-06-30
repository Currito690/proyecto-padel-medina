import { useEffect, useState } from 'react';

// Banner de instalación de la PWA para móviles.
// - Android/Chrome: usa el evento `beforeinstallprompt` → botón "Instalar".
// - iOS/Safari: no existe ese evento → mostramos instrucciones (Compartir → Añadir
//   a pantalla de inicio).
// No aparece si la app ya está instalada (display-mode standalone) ni si el usuario
// la descartó hace menos de DISMISS_DAYS.
const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_DAYS = 14;

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // evento beforeinstallprompt (Android)
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Ya instalada → no mostrar
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) return;

    // Descartada recientemente → no mostrar
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return;

    const ua = navigator.userAgent || '';
    const iOS = /iphone|ipad|ipod/i.test(ua);
    // En iOS, "Añadir a pantalla de inicio" solo funciona en Safari (no Chrome/Firefox/Edge iOS).
    const iosSafari = iOS && !/crios|fxios|edgios/i.test(ua);
    const android = /android/i.test(ua);

    if (iosSafari) {
      setIsIOS(true);
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    }

    // Android/Chrome: capturar el evento de instalación
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      if (android) setShow(true); // solo móvil
    };
    const onInstalled = () => {
      setShow(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* el usuario cerró el diálogo */ }
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <>
      <style>{`
        @keyframes a2hs-up { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
      <div
        role="dialog"
        aria-label="Instalar aplicación"
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 'calc(72px + env(safe-area-inset-bottom) + 12px)',
          width: 'calc(100% - 24px)',
          maxWidth: 460,
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '1rem',
          boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
          padding: '0.9rem 1rem',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          animation: 'a2hs-up 0.35s ease',
          boxSizing: 'border-box',
        }}
      >
        <img src="/favicon-192.png" alt="Padel Medina" style={{ width: 46, height: 46, borderRadius: '0.7rem', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 2px', fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>
            Instala Padel Medina
          </p>
          {isIOS ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569', lineHeight: 1.45 }}>
              Pulsa <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1B3A6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4" /><polyline points="8 8 12 4 16 8" /><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                </svg>
              </span> Compartir y luego <strong>"Añadir a pantalla de inicio"</strong>.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569', lineHeight: 1.45 }}>
              Añádela a tu pantalla de inicio para abrirla como una app, sin navegador.
            </p>
          )}
        </div>

        {!isIOS && (
          <button
            onClick={install}
            style={{
              flexShrink: 0,
              background: '#16A34A',
              color: '#fff',
              border: 'none',
              borderRadius: '0.6rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              padding: '0.6rem 0.95rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Instalar
          </button>
        )}

        <button
          onClick={dismiss}
          aria-label="Cerrar"
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            padding: 4,
            lineHeight: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </>
  );
}
