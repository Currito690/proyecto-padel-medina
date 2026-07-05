// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM · Tienda Padel Medina (estética "dark premium indoor")
// ─────────────────────────────────────────────────────────────────────────────
// Paleta
//   bg      #0D0D0D  negro carbón   → fondo principal
//   card    #1E1E1E  gris grafito   → tarjetas y secciones
//   lime    #C8F031  verde pista    → acento: CTAs, precios, badges
//   white   #FFFFFF  textos principales · muted #A3A3A3 secundarios
// Tipografía
//   display 'Archivo Black' (titulares en mayúsculas, sensación de estadio)
//   body    'Inter' (la del resto de la web)
// Estilo: bordes redondeados generosos (1rem+), mucho aire, hovers con borde
// lima y elevación sutil. Los badges siempre en mayúsculas.
// ─────────────────────────────────────────────────────────────────────────────

export const SHOP = {
  bg: '#0D0D0D',
  card: '#1E1E1E',
  cardSoft: '#161616',
  line: '#2B2B2B',
  lime: '#C8F031',
  limeSoft: 'rgba(200, 240, 49, 0.12)',
  white: '#FFFFFF',
  text: '#F5F5F5',
  muted: '#A3A3A3',
  danger: '#F87171',
  amber: '#FBBF24',
  display: "'Archivo Black', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
};

// Titular tipo estadio (mayúsculas, condensado)
export const displayFont = (size = '2rem') => ({
  fontFamily: SHOP.display,
  fontSize: size,
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  lineHeight: 1.05,
  color: SHOP.white,
  margin: 0,
});

// Botón principal (verde lima, grande y claro)
export const ctaBtn = (extra = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  padding: '0.95rem 1.8rem',
  background: SHOP.lime,
  color: '#0D0D0D',
  border: 'none',
  borderRadius: '0.9rem',
  fontFamily: SHOP.body,
  fontWeight: 900,
  fontSize: '0.95rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'transform .15s, box-shadow .15s, background .15s',
  boxShadow: '0 8px 24px rgba(200,240,49,0.25)',
  ...extra,
});

// Botón secundario (contorno sobre fondo oscuro)
export const ghostBtn = (extra = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  padding: '0.8rem 1.4rem',
  background: 'transparent',
  color: SHOP.white,
  border: `1.5px solid ${SHOP.line}`,
  borderRadius: '0.9rem',
  fontFamily: SHOP.body,
  fontWeight: 800,
  fontSize: '0.85rem',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'border-color .15s, color .15s',
  ...extra,
});

// Tarjeta oscura estándar
export const darkCard = (extra = {}) => ({
  background: SHOP.card,
  border: `1px solid ${SHOP.line}`,
  borderRadius: '1.1rem',
  ...extra,
});

// Badge de producto ("NOVEDAD", "-20%", "TOP VENTAS", "ÚLTIMAS UNIDADES"…)
export const badge = (bg = SHOP.lime, color = '#0D0D0D') => ({
  display: 'inline-block',
  background: bg,
  color,
  fontSize: '0.6rem',
  fontWeight: 900,
  padding: '0.25rem 0.55rem',
  borderRadius: '999px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontFamily: SHOP.body,
});

// Input sobre fondo oscuro
export const darkInput = (extra = {}) => ({
  width: '100%',
  padding: '0.75rem 0.9rem',
  borderRadius: '0.7rem',
  border: `1.5px solid ${SHOP.line}`,
  background: SHOP.cardSoft,
  color: SHOP.text,
  fontSize: '0.9rem',
  fontFamily: SHOP.body,
  outline: 'none',
  boxSizing: 'border-box',
  ...extra,
});

// ── Badges automáticos de un producto (con datos REALES) ────────────────────
// NOVEDAD (subido hace <30 días) · -X% (precio_oferta) · TOP VENTAS (destacado)
// · ÚLTIMAS UNIDADES (stock 1-3) · AGOTADO (stock 0)
export const productBadges = (product, stockTotal) => {
  const out = [];
  if (stockTotal <= 0) {
    out.push({ label: 'Agotado', bg: '#3F3F3F', color: '#D4D4D4' });
    return out;
  }
  if (product.precio_oferta_centimos != null && product.precio_centimos > 0) {
    const pct = Math.round((1 - product.precio_oferta_centimos / product.precio_centimos) * 100);
    if (pct > 0) out.push({ label: `-${pct}%`, bg: SHOP.lime, color: '#0D0D0D' });
  }
  if (product.destacado) out.push({ label: 'Top ventas', bg: '#FFFFFF', color: '#0D0D0D' });
  if (product.created_at && (Date.now() - new Date(product.created_at).getTime()) < 30 * 86400000) {
    out.push({ label: 'Novedad', bg: '#0EA5E9', color: 'white' });
  }
  if (stockTotal > 0 && stockTotal <= 3) {
    out.push({ label: 'Últimas unidades', bg: '#F59E0B', color: '#0D0D0D' });
  }
  return out.slice(0, 2); // máximo 2 para no tapar la foto
};

// Emoji para una categoría según su nombre (portada)
export const categoryEmoji = (nombre = '') => {
  const n = nombre.toLowerCase();
  if (n.includes('pala')) return '🎾';
  if (n.includes('ropa') || n.includes('textil') || n.includes('camiseta')) return '👕';
  if (n.includes('calzado') || n.includes('zapatilla')) return '👟';
  if (n.includes('accesorio') || n.includes('paletero') || n.includes('bola')) return '🎒';
  return '🛍️';
};
