import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { estadoAvisos, activarAvisos } from '../services/pushNotifications';
import { toast } from '../utils/notify';

// Invitación a activar los recordatorios de partido (aviso al móvil unas horas
// antes de la pista; el servidor nunca los manda de madrugada).

const CLAVE_DESCARTE = 'pm-avisos-descartado';
const DIAS_DESCARTE = 14;

const descartadaHacePoco = () => {
  try {
    const ts = Number(localStorage.getItem(CLAVE_DESCARTE));
    return ts > 0 && Date.now() - ts < DIAS_DESCARTE * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const descartar = () => {
  try { localStorage.setItem(CLAVE_DESCARTE, String(Date.now())); } catch { /* sin almacenamiento */ }
};

// Flujo común del botón: hay que llamarlo DENTRO del click (el navegador solo
// deja mostrar el diálogo de permiso tras un gesto del usuario).
async function activarDesdeBoton(userId) {
  const estado = await activarAvisos(supabase, userId, { preguntar: true });
  if (estado === 'activos') {
    toast('¡Listo! Te avisaremos antes de tus partidos.', 'success');
  } else if (estado === 'bloqueados') {
    toast('Los avisos están desactivados en los ajustes de tu móvil o navegador. Puedes activarlos allí cuando quieras.', 'info', 6000);
  }
  return estado;
}

const botonVerde = {
  padding: '0.6rem 1.1rem', minHeight: '40px',
  backgroundColor: '#16A34A', color: 'white',
  border: 'none', borderRadius: '0.625rem',
  fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 12px rgba(22,163,74,0.25)',
};

// Tarjeta para Mis reservas. Solo sale si aún no se ha preguntado al usuario y
// no la ha descartado en los últimos 14 días.
const AvisoRecordatorios = () => {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (!user?.id || descartadaHacePoco()) return;
    let vivo = true;
    estadoAvisos().then((estado) => { if (vivo) setVisible(estado === 'pendiente'); });
    return () => { vivo = false; };
  }, [user?.id]);

  if (!visible || !user) return null;

  const activar = async () => {
    setActivando(true);
    const estado = await activarDesdeBoton(user.id);
    // Si cerró el diálogo sin elegir, lo tomamos como "ahora no".
    if (estado === 'pendiente') descartar();
    setActivando(false);
    setVisible(false);
  };

  const ahoraNo = () => {
    descartar();
    setVisible(false);
  };

  return (
    <div className="anim-fade-up" style={{ backgroundColor: 'white', border: '1px solid #BBF7D0', borderRadius: '1.25rem', padding: '1.1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 4px 16px rgba(22,163,74,.08)' }}>
      <p style={{ margin: '0 0 .3rem', fontWeight: 800, fontSize: '1rem', color: '#0F172A', letterSpacing: '-.01em' }}>
        🔔 ¿Te avisamos antes de jugar?
      </p>
      <p style={{ margin: '0 0 .9rem', fontSize: '.85rem', color: '#64748B', lineHeight: 1.5 }}>
        Te mandamos un aviso al móvil unas horas antes de tu pista (nunca de madrugada).
      </p>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={activar} disabled={activando} style={{ ...botonVerde, opacity: activando ? 0.7 : 1, cursor: activando ? 'wait' : 'pointer' }}>
          {activando ? 'Activando…' : 'Activar avisos'}
        </button>
        <button onClick={ahoraNo} disabled={activando}
          style={{ padding: '0.6rem 1rem', minHeight: '40px', backgroundColor: 'transparent', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          Ahora no
        </button>
      </div>
    </div>
  );
};

// Fila del perfil con el estado de los recordatorios. Si el dispositivo no
// admite avisos no se muestra nada.
export const FilaRecordatorios = () => {
  const { user } = useAuth();
  const [estado, setEstado] = useState(null);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let vivo = true;
    let ultimo = null;
    // Al volver de los ajustes del móvil el permiso puede haber cambiado: si
    // acaba de concederse, de paso se registra el dispositivo (refresco silencioso).
    const leer = (alVolverDeAjustes) => estadoAvisos().then((e) => {
      if (!vivo) return;
      if (alVolverDeAjustes && e === 'activos' && ultimo !== 'activos') {
        activarAvisos(supabase, user.id, { preguntar: false });
      }
      ultimo = e;
      setEstado(e);
    });
    leer(false);
    const alVolver = () => {
      if (document.visibilityState === 'visible') leer(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [user?.id]);

  if (!user || !estado || estado === 'no-disponible') return null;

  const activar = async () => {
    setActivando(true);
    setEstado(await activarDesdeBoton(user.id));
    setActivando(false);
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: '1px solid var(--color-border)', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)', padding: '0.875rem 1.25rem', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
        <span style={{ width: '36px', height: '36px', borderRadius: '0.625rem', backgroundColor: '#ECFDF5', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>Recordatorios de partidos</span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>Un aviso unas horas antes de tu pista</span>
        </div>
      </div>
      {estado === 'activos' && (
        <span style={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 700, color: '#15803D', whiteSpace: 'nowrap' }}>Activados ✓</span>
      )}
      {estado === 'pendiente' && (
        <button onClick={activar} disabled={activando} style={{ ...botonVerde, flexShrink: 0, padding: '0.5rem 0.95rem', minHeight: '36px', opacity: activando ? 0.7 : 1, cursor: activando ? 'wait' : 'pointer' }}>
          {activando ? 'Activando…' : 'Activar'}
        </button>
      )}
      {estado === 'bloqueados' && (
        <span style={{ flexShrink: 0, maxWidth: '9.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', lineHeight: 1.35 }}>Desactivados en los ajustes del móvil</span>
      )}
    </div>
  );
};

export default AvisoRecordatorios;
