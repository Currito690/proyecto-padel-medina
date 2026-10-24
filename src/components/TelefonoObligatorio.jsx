import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { toast } from '../utils/notify';
import { eliminarMiCuenta, MSG_ERROR_ELIMINAR } from '../utils/cuenta';
import { normalizarTelefono, esTelefonoValido, formatearTelefono, MSG_TELEFONO_INVALIDO } from '../utils/telefono';

// Teléfono OBLIGATORIO de los jugadores (petición del club, octubre de 2026).
//
// - TelefonoObligatorio: ventana que tapa toda la app a cualquier jugador cuya
//   ficha no tenga un teléfono válido. No se puede cerrar: solo desaparece al
//   guardar un número que valga. Va montada en App.jsx para los clientes. Lo
//   único que se puede hacer sin dar el teléfono es cerrar sesión, leer la
//   política de privacidad o eliminar la cuenta.
// - FilaTelefono: fila del perfil para ver y cambiar el número.
//
// El número se guarda en profiles.phone normalizado ("+34667421519"); la base
// de datos lo normaliza también por su cuenta (trigger) y apunta cuándo lo puso
// el propio jugador (phone_confirmed_at).

// Páginas donde no se tapa nada: borrar la cuenta y los textos legales tienen
// que poder leerse sin dar el teléfono.
const RUTAS_LIBRES = ['/eliminar-cuenta', '/privacidad', '/aviso-legal', '/reset-password'];
const rutaLibre = (pathname) => RUTAS_LIBRES.includes((pathname || '').replace(/\/+$/, '') || '/');

// Para que el perfil y la ventana se enteren el uno del otro al guardar.
const EVENTO = 'pm:telefono';
const avisarCambio = (phone) => {
  try { window.dispatchEvent(new CustomEvent(EVENTO, { detail: { phone } })); } catch { /* sin CustomEvent */ }
};

// Lee el teléfono (y el rol, por si la ficha dice otra cosa que la sesión).
// Devuelve { phone, role } o lanza si no se pudo leer.
async function leerFicha(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('phone, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || { phone: null, role: null };
}

// Guarda el número en la ficha del jugador y devuelve cómo ha quedado.
async function guardarTelefono(userId, valor) {
  const phone = normalizarTelefono(valor);
  if (!phone) {
    const e = new Error(MSG_TELEFONO_INVALIDO);
    e.invalido = true;
    throw e;
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ phone })
    .eq('id', userId)
    .select('phone')
    .single();
  if (error) throw error;
  // La base de datos lo normaliza por su cuenta: si no coincide, no vale.
  if (!esTelefonoValido(data?.phone)) {
    const e = new Error('El servidor no ha aceptado ese número. Revísalo e inténtalo otra vez.');
    e.invalido = true;
    throw e;
  }
  avisarCambio(data.phone);
  return data.phone;
}

// Los errores de red y del servidor llegan en inglés: algo claro en su lugar.
function textoError(err) {
  if (err?.invalido) return err.message;
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Sin conexión. Comprueba tu internet e inténtalo de nuevo.';
  }
  if (err?.code === '42501' || msg.includes('permission') || msg.includes('row-level security')) {
    return 'No tienes permiso para cambiar este dato. Escribe al club.';
  }
  return 'No se ha podido guardar. Inténtalo de nuevo en un momento.';
}

const estiloInput = (conError) => ({
  width: '100%', boxSizing: 'border-box',
  padding: '0.85rem 1rem', minHeight: '52px',
  fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.04em',
  color: '#0F172A', fontFamily: 'inherit',
  border: `1.5px solid ${conError ? '#FCA5A5' : '#CBD5E1'}`,
  borderRadius: '0.875rem', background: 'white', outline: 'none',
});

const estiloBoton = (ocupado) => ({
  width: '100%', minHeight: '50px', padding: '0.8rem 1rem',
  backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.875rem',
  fontWeight: 800, fontSize: '0.98rem', fontFamily: 'inherit',
  cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.7 : 1,
  boxShadow: '0 4px 14px rgba(22,163,74,0.28)',
});

const estiloEnlace = {
  background: 'none', border: 'none', padding: '0.4rem 0.2rem', minHeight: '32px',
  color: '#64748B', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
  textDecoration: 'underline', cursor: 'pointer',
};

// Campo + botón para escribir el número. onGuardado(phone) al guardar bien.
function FormularioTelefono({ userId, inicial = '', textoBoton = 'Guardar teléfono', autoFocus = false, onGuardado, onCancelar }) {
  const [valor, setValor] = useState(inicial ? formatearTelefono(inicial) : '');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    if (!normalizarTelefono(valor)) {
      setError(MSG_TELEFONO_INVALIDO);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const phone = await guardarTelefono(userId, valor);
      toast('¡Gracias! Teléfono guardado.', 'success');
      onGuardado?.(phone);
    } catch (err) {
      setError(textoError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <label htmlFor="pm-telefono" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>
        Tu número de móvil
      </label>
      <input
        id="pm-telefono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => { setValor(e.target.value); if (error) setError(null); }}
        placeholder="6XX XXX XXX"
        aria-invalid={!!error}
        aria-describedby={error ? 'pm-telefono-error' : 'pm-telefono-ayuda'}
        style={estiloInput(!!error)}
      />
      {error ? (
        <p id="pm-telefono-error" role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', fontWeight: 600, color: '#B91C1C', lineHeight: 1.45 }}>{error}</p>
      ) : (
        <p id="pm-telefono-ayuda" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.45 }}>9 cifras. Si es de otro país, con su prefijo (+33…).</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
        {onCancelar && (
          <button type="button" onClick={onCancelar} disabled={guardando}
            style={{ flex: '0 0 auto', minHeight: '50px', padding: '0 1rem', backgroundColor: 'transparent', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '0.875rem', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando} style={estiloBoton(guardando)}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
      </div>
    </form>
  );
}

// Ventana que no se puede quitar hasta que el jugador guarde un teléfono válido.
const TelefonoObligatorio = () => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  // null = aún no se sabe (nunca se tapa nada sin saberlo), true/false = falta o no
  const [falta, setFalta] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    let vivo = true;
    let guardado = false; // ya se guardó un número: una lectura tardía no lo deshace
    let intentos = 0;
    const comprobar = async () => {
      try {
        const ficha = await leerFicha(user.id);
        if (!vivo || guardado) return;
        // Solo a los jugadores (nunca al admin ni al monitor, aunque la sesión
        // aún no haya afinado el rol).
        setFalta(ficha.role === 'client' && !esTelefonoValido(ficha.phone));
      } catch {
        // Sin red o error del servidor: no se bloquea a nadie a ciegas; se
        // vuelve a intentar un par de veces.
        if (!vivo || guardado || ++intentos >= 3) return;
        temporizador.current = setTimeout(comprobar, 5000);
      }
    };
    comprobar();
    const alGuardar = (e) => {
      if (!vivo || !esTelefonoValido(e.detail?.phone)) return;
      guardado = true;
      setFalta(false);
    };
    window.addEventListener(EVENTO, alGuardar);
    return () => {
      vivo = false;
      clearTimeout(temporizador.current);
      window.removeEventListener(EVENTO, alGuardar);
    };
  }, [user?.id]);

  const visible = !!user && falta === true && !rutaLibre(pathname);

  // Mientras está la ventana, la página de detrás no se mueve.
  useEffect(() => {
    if (!visible) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [visible]);

  if (!visible) return null;

  const cerrarSesion = () => { if (!borrando) logout(); };
  const eliminar = async () => {
    if (borrando) return;
    try {
      await eliminarMiCuenta(logout, { alEmpezar: () => setBorrando(true) });
    } catch (e) {
      setBorrando(false);
      toast(e?.message || MSG_ERROR_ELIMINAR, 'error');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-telefono-titulo"
      style={{
        position: 'fixed', inset: 0, zIndex: 50000,
        backgroundColor: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(3px)',
        // flex-start + margen auto: centrada cuando cabe y, con el teclado
        // abierto en un móvil pequeño, se desplaza desde arriba sin cortar nada.
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'calc(1rem + var(--sa-top)) 1rem calc(1rem + var(--sa-bottom))',
        overflowY: 'auto',
      }}
    >
      <div className="anim-fade-up" style={{ width: '100%', maxWidth: '420px', margin: 'auto 0', backgroundColor: 'white', borderRadius: '1.5rem', padding: '1.5rem 1.375rem 1rem', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '1rem', backgroundColor: '#ECFDF5', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.9rem' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <h2 id="pm-telefono-titulo" style={{ margin: '0 0 0.4rem', fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0F172A', lineHeight: 1.2 }}>
          Necesitamos tu número de teléfono
        </h2>
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.9rem', color: '#475569', lineHeight: 1.55 }}>
          Para seguir usando Padel Medina hace falta un teléfono de contacto. El club solo lo usará para avisarte de tus reservas y de los torneos.
        </p>
        <FormularioTelefono userId={user.id} autoFocus textoBoton="Guardar y continuar" onGuardado={() => setFalta(false)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '0 0.9rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={cerrarSesion} disabled={borrando} style={estiloEnlace}>Cerrar sesión</button>
          <Link to="/privacidad" style={estiloEnlace}>Privacidad</Link>
          <button type="button" onClick={eliminar} disabled={borrando} style={estiloEnlace}>{borrando ? 'Eliminando…' : 'Eliminar mi cuenta'}</button>
        </div>
      </div>
    </div>
  );
};

// Fila del perfil: el número actual y un botón para cambiarlo.
export const FilaTelefono = () => {
  const { user } = useAuth();
  const [phone, setPhone] = useState(undefined); // undefined = cargando
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let vivo = true;
    leerFicha(user.id).then((f) => { if (vivo) setPhone(f.phone || null); }).catch(() => { if (vivo) setPhone(null); });
    const alGuardar = (e) => { if (vivo) { setPhone(e.detail?.phone || null); setEditando(false); } };
    window.addEventListener(EVENTO, alGuardar);
    return () => { vivo = false; window.removeEventListener(EVENTO, alGuardar); };
  }, [user?.id]);

  if (!user) return null;
  const valido = esTelefonoValido(phone);

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: '1px solid var(--color-border)', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)', padding: '0.875rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
          <span style={{ width: '36px', height: '36px', borderRadius: '0.625rem', backgroundColor: '#ECFDF5', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>Teléfono</span>
            <span style={{ display: 'block', fontSize: '0.8rem', color: phone === undefined ? '#94A3B8' : valido ? 'var(--color-text-secondary)' : '#B45309', fontWeight: valido ? 600 : 500, lineHeight: 1.4 }}>
              {phone === undefined ? 'Cargando…' : valido ? formatearTelefono(phone) : 'Sin teléfono'}
            </span>
          </div>
        </div>
        {phone !== undefined && !editando && (
          <button type="button" onClick={() => setEditando(true)}
            style={{ flexShrink: 0, minHeight: '36px', padding: '0.45rem 0.9rem', backgroundColor: valido ? 'var(--color-bg-secondary)' : '#16A34A', color: valido ? 'var(--color-text-primary)' : 'white', border: valido ? '1px solid var(--color-border)' : 'none', borderRadius: '0.625rem', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
            {valido ? 'Cambiar' : 'Añadir'}
          </button>
        )}
      </div>
      {editando && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--color-border)' }}>
          <FormularioTelefono userId={user.id} inicial={valido ? phone : ''} autoFocus textoBoton="Guardar" onGuardado={() => setEditando(false)} onCancelar={() => setEditando(false)} />
        </div>
      )}
    </div>
  );
};

export default TelefonoObligatorio;
