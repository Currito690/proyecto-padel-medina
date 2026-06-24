import { Link, useNavigate } from 'react-router-dom';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur, imgUrl } from '../../utils/shopFormat';

export default function ShopCart() {
  const navigate = useNavigate();
  const { items, setQty, removeItem, subtotalCentimos } = useProductCart();

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94A3B8' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🛒</div>
        <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 1rem' }}>Tu carrito está vacío</p>
        <Link to="/tienda" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#16A34A', color: 'white', borderRadius: '0.75rem', fontWeight: 800, textDecoration: 'none' }}>Ir a la tienda</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1.25rem', fontSize: '1.5rem', fontWeight: 900, color: '#0F172A' }}>Tu carrito</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map(it => (
            <div key={it.key} style={{ display: 'flex', gap: '0.85rem', background: 'white', border: '1px solid #E2E8F0', borderRadius: '1rem', padding: '0.75rem' }}>
              <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: '0.6rem', overflow: 'hidden', background: it.imagen ? '#0F172A' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.imagen ? <img src={imgUrl(it.imagen)} alt={it.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.5rem' }}>🎾</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/tienda/${it.slug}`} style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', textDecoration: 'none' }}>{it.nombre}</Link>
                {it.varianteDesc && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{it.varianteDesc}</div>}
                <div style={{ fontWeight: 800, color: '#16A34A', marginTop: '0.2rem' }}>{fmtEur(it.precioCentimos)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.45rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #CBD5E1', borderRadius: '0.6rem', overflow: 'hidden' }}>
                    <button onClick={() => setQty(it.key, it.cantidad - 1)} style={qtyBtn}>−</button>
                    <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{it.cantidad}</span>
                    <button onClick={() => setQty(it.key, it.cantidad + 1)} disabled={it.cantidad >= (it.stock ?? Infinity)} style={qtyBtn}>+</button>
                  </div>
                  <button onClick={() => removeItem(it.key)} style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Quitar</button>
                </div>
              </div>
              <div style={{ fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>{fmtEur(it.precioCentimos * it.cantidad)}</div>
            </div>
          ))}
        </div>

        {/* Resumen */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '1rem', padding: '1.25rem', position: 'sticky', top: 80 }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800 }}>Resumen</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
            <span>Subtotal</span><span style={{ fontWeight: 700, color: '#0F172A' }}>{fmtEur(subtotalCentimos)}</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 1rem' }}>Los gastos de envío se calculan en el siguiente paso.</p>
          <button onClick={() => navigate('/tienda/checkout')} style={{ width: '100%', padding: '0.9rem', background: '#16A34A', color: 'white', border: 'none', borderRadius: '0.8rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>
            Tramitar pedido
          </button>
          <Link to="/tienda" style={{ display: 'block', textAlign: 'center', marginTop: '0.75rem', color: '#1B3A6E', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>Seguir comprando</Link>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = { width: 32, height: 34, border: 'none', background: '#F8FAFC', color: '#0F172A', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' };
