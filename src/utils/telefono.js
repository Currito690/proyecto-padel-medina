// Teléfono de contacto de los jugadores (profiles.phone). El club lo quiere
// OBLIGATORIO y válido: con él avisa de cambios en las reservas y localiza a
// quien debe un pago. Se guarda normalizado al estilo internacional y sin
// espacios ("+34667421519"); para enseñarlo está formatearTelefono.
//
// Las MISMAS reglas están en la base de datos (public.normalizar_telefono,
// migración 20261024100000): si cambian aquí, cambiarlas también allí.

const SOLO_DIGITOS = /^\d+$/;
// Números de relleno que nadie tiene: el ejemplo de los formularios y las secuencias.
const FALSOS = new Set(['600000000', '123456789', '987654321']);

// Número español: 9 cifras, empieza por 6, 7, 8 o 9 y no es de relleno.
function nacional(d) {
  if (!/^[6-9]\d{8}$/.test(d)) return null;
  if (/^(\d)\1{8}$/.test(d) || FALSOS.has(d)) return null;
  return '+34' + d;
}

// "+34667421519" si el número vale; null si no. Admite espacios, puntos,
// guiones y paréntesis, y los prefijos +34, 0034 y 34. Otros países: con
// prefijo "+" (o "00") y entre 8 y 15 cifras.
export function normalizarTelefono(valor) {
  if (valor == null) return null;
  let s = String(valor).trim().replace(/[-\s.()]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const d = s.slice(1);
    if (!SOLO_DIGITOS.test(d)) return null;
    if (d.startsWith('34')) return nacional(d.slice(2));
    if (d.length < 8 || d.length > 15 || d[0] === '0' || /^(\d)\1+$/.test(d)) return null;
    return '+' + d;
  }
  if (!SOLO_DIGITOS.test(s)) return null;
  return nacional(s.length === 11 && s.startsWith('34') ? s.slice(2) : s);
}

export const esTelefonoValido = (valor) => normalizarTelefono(valor) !== null;

// Para enseñarlo: "+34667421519" → "667 421 519"; otros países, tal cual.
export function formatearTelefono(valor) {
  const n = normalizarTelefono(valor);
  if (!n) return valor ? String(valor) : '';
  if (n.startsWith('+34') && n.length === 12) {
    const d = n.slice(3);
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return n;
}

export const MSG_TELEFONO_INVALIDO = 'Escribe un número de teléfono válido: 9 cifras que empiecen por 6, 7, 8 o 9 (o, si es de otro país, con su prefijo: +33…).';
