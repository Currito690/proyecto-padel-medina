// Puente con la app Android para la ubicación.
//
// Dentro de la app, Chrome no da ubicación precisa en algunos móviles y la
// delegación de ubicación de Google se queda colgada. Así que la app lleva una
// pantalla nativa (UbicacionActivity) que coge la posición con el GPS de
// Android y vuelve a la web con las coordenadas en la URL:
//     ?gps=lat,lng,precision_m,marca_de_tiempo   o   ?gps=err:motivo
//
// La app se identifica al arrancar con ?gpsnativo=1 en su URL de inicio; la web
// lo recuerda y, a partir de ahí, pide la ubicación a la app y no a Chrome.

const CLAVE = 'gps_nativo';
const PAQUETE = 'com.padelmedina.app';

export function registrarDesdeUrl() {
  try {
    if (new URLSearchParams(window.location.search).get('gpsnativo') === '1') {
      localStorage.setItem(CLAVE, '1');
    }
  } catch { /* sin almacenamiento */ }
}

export function hayGpsNativo() {
  if (!/android/i.test(navigator.userAgent || '')) return false;
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}

// Abre la pantalla nativa. Resuelve true si la app ha tomado el control (la
// página se oculta) y false si nadie ha respondido en 2,5 s, para seguir por
// la vía normal del navegador.
export function pedirUbicacionNativa() {
  const volver = `${window.location.origin}${window.location.pathname}?gpsnativo=1&firmar=1`;
  const intent = `intent://ubicacion#Intent;scheme=padelmedina;package=${PAQUETE};S.volver=${encodeURIComponent(volver)};end`;
  return new Promise((resolve) => {
    let listo = false;
    const acabar = (v) => { if (!listo) { listo = true; resolve(v); } };
    const alOcultar = () => { if (document.visibilityState === 'hidden') acabar(true); };
    document.addEventListener('visibilitychange', alOcultar, { once: true });
    setTimeout(() => { document.removeEventListener('visibilitychange', alOcultar); acabar(false); }, 2500);
    try { window.location.href = intent; } catch { acabar(false); }
  });
}

// Lee lo que devuelve la app en la URL y la limpia. null si no hay nada.
export function leerVueltaNativa() {
  const p = new URLSearchParams(window.location.search);
  const gps = p.get('gps');
  const firmar = p.get('firmar') === '1';
  if (gps === null && !firmar) return null;
  p.delete('gps');
  p.delete('firmar');
  const q = p.toString();
  try { window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '')); } catch { /* nada */ }
  if (!gps) return { firmar, pos: null, error: null };
  if (gps.startsWith('err:')) return { firmar, pos: null, error: gps.slice(4) };
  const [lat, lng, precision, marca] = gps.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { firmar, pos: null, error: 'formato' };
  return {
    firmar,
    pos: { lat, lng, precision_m: Number.isFinite(precision) ? precision : null, captada: Number.isFinite(marca) && marca > 0 ? marca : Date.now() },
    error: null,
  };
}
