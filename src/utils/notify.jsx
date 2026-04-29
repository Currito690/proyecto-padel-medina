// Utilidades globales para reemplazar alert() y window.confirm() del navegador
// con toasts y modales propios de la app.
//
// Uso:
//   import { toast, confirmDialog } from '@/utils/notify';
//
//   toast('Operación guardada');                    // info
//   toast('Pareja confirmada', 'success');          // verde
//   toast('Error: no se pudo enviar', 'error');     // rojo
//
//   const ok = await confirmDialog('¿Borrar el torneo?');
//   if (!ok) return;
//
//   const ok = await confirmDialog('¿Borrar?', { danger: true, okText: 'Borrar', title: 'Borrar torneo' });
//
// El componente se monta solo una vez en <body> al primer uso. No
// requiere Provider — la API es imperativa y funciona desde cualquier
// sitio (handlers, async functions, fuera de React).

import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

let _toastApi = null;
let _confirmApi = null;

function NotifyContainer() {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    _toastApi = (message, type = 'info', durationMs = 3500) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts(prev => [...prev, { id, message: String(message ?? ''), type }]);
      window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), durationMs);
    };
    _confirmApi = (message, options = {}) => new Promise(resolve => {
      setConfirmState({ message: String(message ?? ''), options, resolve });
    });
    return () => { _toastApi = null; _confirmApi = null; };
  }, []);

  const closeConfirm = (result) => {
    if (confirmState) {
      try { confirmState.resolve(result); } catch {}
    }
    setConfirmState(null);
  };

  // Cerrar confirm con tecla Escape (=cancelar) o Enter (=confirmar)
  useEffect(() => {
    if (!confirmState) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeConfirm(false); }
      else if (e.key === 'Enter') { e.preventDefault(); closeConfirm(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmState]);

  const typeColors = {
    success: { bg: '#16A34A', icon: '✓' },
    error:   { bg: '#DC2626', icon: '✕' },
    info:    { bg: '#0F172A', icon: 'ℹ' },
    warning: { bg: '#D97706', icon: '⚠' },
  };

  return (
    <>
      {/* ── Toasts ──────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '1.25rem',
          right: '1.25rem',
          zIndex: 100000,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 2.5rem)',
        }}
      >
        {toasts.map(t => {
          const c = typeColors[t.type] || typeColors.info;
          return (
            <div
              key={t.id}
              role="status"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                background: c.bg,
                color: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
                fontSize: '0.9rem',
                fontWeight: 600,
                maxWidth: '380px',
                pointerEvents: 'auto',
                lineHeight: 1.4,
                animation: 'notifyIn 0.18s ease-out',
              }}
            >
              <span style={{ fontWeight: 800, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.message}</span>
            </div>
          );
        })}
      </div>

      {/* ── Confirm dialog ──────────────────────────────────────── */}
      {confirmState && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 100001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            animation: 'notifyFade 0.15s ease-out',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
              animation: 'notifyPop 0.18s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: confirmState.options.danger ? '#FEE2E2' : '#FEF3C7',
                  color: confirmState.options.danger ? '#DC2626' : '#92400E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {confirmState.options.danger ? '!' : '?'}
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                {confirmState.options.title || 'Confirmar acción'}
              </h3>
            </div>
            <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.94rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => closeConfirm(false)}
                style={{
                  padding: '0.65rem 1.1rem',
                  borderRadius: '0.55rem',
                  border: '1.5px solid #CBD5E1',
                  background: 'white',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                {confirmState.options.cancelText || 'Cancelar'}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                autoFocus
                style={{
                  padding: '0.65rem 1.4rem',
                  borderRadius: '0.55rem',
                  border: 'none',
                  background: confirmState.options.danger ? '#DC2626' : '#0F172A',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: confirmState.options.danger
                    ? '0 4px 12px rgba(220,38,38,0.25)'
                    : '0 4px 12px rgba(15,23,42,0.18)',
                }}
              >
                {confirmState.options.okText || 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes notifyIn { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes notifyFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes notifyPop  { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </>
  );
}

let _mounted = false;
function ensureMounted() {
  if (_mounted || typeof document === 'undefined') return;
  _mounted = true;
  let host = document.getElementById('notify-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notify-root';
    document.body.appendChild(host);
  }
  createRoot(host).render(<NotifyContainer />);
}

// API pública ─────────────────────────────────────────────────────
// type: 'info' | 'success' | 'error' | 'warning'
export function toast(message, type = 'info', durationMs) {
  ensureMounted();
  const fire = () => {
    if (_toastApi) _toastApi(message, type, durationMs);
    else window.setTimeout(fire, 30);
  };
  fire();
}

// options: { title?, okText?, cancelText?, danger? }
export function confirmDialog(message, options) {
  ensureMounted();
  return new Promise((resolve) => {
    const fire = () => {
      if (_confirmApi) _confirmApi(message, options).then(resolve);
      else window.setTimeout(fire, 30);
    };
    fire();
  });
}
