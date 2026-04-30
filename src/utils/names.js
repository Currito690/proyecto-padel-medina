// Normalización de nombres (jugadores y parejas) para la UI de torneos.
// Title Case con conectores en minúscula ("y", "de", "del", "la"…).

const SMALL_WORDS = new Set([
  'y', 'e', 'o', 'u',
  'de', 'del', 'da', 'do', 'di',
  'la', 'las', 'el', 'los',
]);

// "JUAN Y PEDRO", "juan y pedro" → "Juan y Pedro".
// Conectores ("y", "de", …) en minúscula salvo si son la primera palabra.
// Soporta nombres con apóstrofo y guión: "o'brien" → "O'Brien", "ana-maría" → "Ana-María".
export const toTitleCase = (s) => {
  if (!s || typeof s !== 'string') return '';
  const cap = (w) => {
    if (!w) return w;
    return w
      .split(/([\-'])/)
      .map(part => (part === '-' || part === "'") ? part : (part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');
  };
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : cap(w))
    .join(' ');
};

// Compara dos nombres para detectar duplicados ignorando mayúsculas,
// espacios y acentos.
export const normalizeForCompare = (s) => {
  if (!s || typeof s !== 'string') return '';
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
};
