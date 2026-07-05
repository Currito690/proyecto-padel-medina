import { Link, useNavigate } from 'react-router-dom';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur, imgUrl } from '../../utils/shopFormat';
import { SHOP, displayFont, ctaBtn, darkCard } from './shopTheme';

// Carrito de la tienda (dark premium).
export default function ShopCart() {
  const navigate = useNavigate();
  const { items, setQty, removeItem, subtotalCentimos } = useProductCart();

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4.5rem 1rem', color: SHOP.muted }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🛒</div>
        <p style={{ fontWeight: 800, color: SHOP.white, margin: '0 0 1.25rem', fontSize: '1.05rem' }}>Tu carrito está vacío</p>
        <Link to="/tienda" style={ctaBtn()}>Ir a la tienda</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ ...displayFont('1.5rem'), marginBottom: '1.25rem' }}>Tu <span style={{ color: SHOP.lime }}>carrito</span></h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map(it => (
            <div key={it.key} style={darkCard({ display: 'flex', gap: '0.85rem', padding: '0.8rem' })}>
              <div style={{ width: 76, height: 76, flexShrink: 0, borderRadius: '0.7rem', overflow: 'hidden', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.imagen ? <img src={imgUrl(it.imagen)} alt={it.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.6rem' }}>🎾</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/tienda/${it.slug}`} style={{ fontWeight: 800, color: SHOP.white, fontSize: '0.9rem', textDecoration: 'none' }}>{it.nombre}</Link>
                {it.varianteDesc && <div style={{ fontSize: '0.75rem', color: SHOP.muted }}>{it.varianteDesc}</div>}
                <div style={{ fontWeight: 900, color: SHOP.lime, marginTop: '0.2rem' }}>{fmtEur(it.precioCentimos)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${SHOP.line}`, borderRadius: '0.6rem', overflow: 'hidden', background: SHOP.cardSoft }}>
                    <button onClick={() => setQty(it.key, it.cantidad - 1)} style={qtyBtn}>−</button>
                    <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: SHOP.white }}>{it.cantidad}</span>
                    <button onClick={() => setQty(it.key, it.cantidad + 1)} disabled={it.cantidad >= (it.stock ?? Infinity)} style={qtyBtn}>+</button>
                  </div>
                  <button onClick={() => removeItem(it.key)} style={{ background: 'none', border: 'none', color: SHOP.danger, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Quitar</button>
                </div>
              </div>
              <div style={{ fontWeight: 900, color: SHOP.white, whiteSpace: 'nowrap' }}>{fmtEur(it.precioCentimos * it.cantidad)}</div>
            </div>
          ))}
        </div>

        {/* Resumen */}
        <div style={darkCard({ padding: '1.25rem', position: 'sticky', top: 110 })}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', fontWeight: 900, color: SHOP.white, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resumen</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: SHOP.muted, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
            <span>Subtotal</span><span style={{ fontWeight: 800, color: SHOP.lime, fontSize: '1.05rem' }}>{fmtEur(subtotalCentimos)}</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: SHOP.muted, margin: '0 0 1rem' }}>Los gastos de envío se calculan en el siguiente paso. Recogida en el club: gratis.</p>
          <button onClick={() => navigate('/tienda/checkout')} style={ctaBtn({ width: '100%' })}>
            Tramitar pedido
          </button>
          <Link to="/tienda" style={{ display: 'block', textAlign: 'center', marginTop: '0.85rem', color: SHOP.muted, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>← Seguir comprando</Link>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = { width: 32, height: 34, border: 'none', background: 'transparent', color: '#F5F5F5', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' };
