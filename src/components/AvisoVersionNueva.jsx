import { useState } from 'react';
import { useVersionNueva } from '../utils/versionNueva';

// Aviso pequeño del panel del admin cuando se ha subido una versión nueva de
// la web. La pestaña se recarga sola cuando lleva un rato en segundo plano y
// todo está guardado; aquí se puede recargar ya o cerrar el aviso.
export default function AvisoVersionNueva() {
  const { nueva, recargar, noSePudo } = useVersionNueva();
  const [cerrado, setCerrado] = useState(false);
  if (!nueva || cerrado) return null;
  return (
    <div
      role="status"
      title="Se ha subido una versión nueva del panel. La pestaña se recargará sola cuando no la estés usando y todo esté guardado."
      style={{
        position: 'fixed', zIndex: 3000,
        right: 'calc(0.75rem + var(--sa-right, 0px))',
        bottom: 'calc(0.75rem + var(--sa-bottom, 0px))',
        maxWidth: 'calc(100vw - 1.5rem)',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.4rem 0.45rem 0.4rem 0.75rem', borderRadius: '999px',
        background: '#EFF6FF', border: '1.5px solid #60A5FA', color: '#1E3A8A',
        boxShadow: '0 6px 18px rgba(30,58,138,0.18)', fontSize: '0.78rem', fontWeight: 700,
      }}
    >
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {noSePudo ? '⚠️ Hay cambios sin guardar' : '🔄 Versión nueva'}
      </span>
      <button
        type="button"
        onClick={recargar}
        style={{ padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Recargar
      </button>
      <button
        type="button"
        aria-label="Cerrar el aviso"
        onClick={() => setCerrado(true)}
        style={{ padding: '0.2rem 0.45rem', borderRadius: '999px', border: 'none', background: 'transparent', color: '#1E3A8A', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
      >
        ✕
      </button>
    </div>
  );
}
