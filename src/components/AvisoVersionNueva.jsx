import { useVersionNueva } from '../utils/versionNueva';

// Aviso del panel del admin cuando se ha subido una versión nueva de la web:
// la pestaña se recargará sola al volver a ella o tras un rato sin tocarla
// (después de terminar de guardar), o al pulsar el botón.
export default function AvisoVersionNueva() {
  const { nueva, recargar } = useVersionNueva();
  if (!nueva) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', zIndex: 3000,
        left: 'calc(0.75rem + var(--sa-left, 0px))', right: 'calc(0.75rem + var(--sa-right, 0px))',
        bottom: 'calc(0.75rem + var(--sa-bottom, 0px))',
        margin: '0 auto', maxWidth: '40rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        padding: '0.75rem 1rem', borderRadius: '0.75rem',
        background: '#EFF6FF', border: '2px solid #60A5FA', color: '#1E3A8A',
        boxShadow: '0 8px 24px rgba(30,58,138,0.18)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>🔄</span>
      <span style={{ flex: 1, minWidth: '14rem', fontSize: '0.86rem', fontWeight: 600, lineHeight: 1.45 }}>
        Hay una versión nueva del panel. Se recargará sola al volver a esta pestaña o si la dejas un rato sin tocar, después de guardar lo pendiente.
      </span>
      <button
        type="button"
        onClick={recargar}
        style={{ padding: '0.5rem 0.9rem', borderRadius: '0.6rem', border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Recargar ahora
      </button>
    </div>
  );
}
