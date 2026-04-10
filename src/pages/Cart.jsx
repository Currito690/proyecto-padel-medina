import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const Cart = () => {
  const navigate = useNavigate();
  const { items, removeItem, total } = useCart();

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    navigate('/checkout');
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: '780px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Seguir reservando
        </button>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Tu carrito
        </h2>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          {items.length === 0 ? 'No tienes ninguna pista en el carrito.' : `${items.length} ${items.length === 1 ? 'pista' : 'pistas'} en el carrito`}
        </p>
      </header>

      {items.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Carrito vacío</h3>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748B' }}>
            Selecciona una pista para añadirla al carrito.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#16A34A',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Ver pistas disponibles
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
            {items.map((item) => (
              <div
                key={item.cartId}
                style={{
                  background: 'white',
                  borderRadius: '1.25rem',
                  padding: '1rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '0.875rem',
                  background: item.gradient || 'linear-gradient(135deg, #16A34A, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{item.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                    {item.courtName} · {item.sport}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', textTransform: 'capitalize' }}>
                    {formatDate(item.date)} · {item.timeSlot}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                    {Number(item.price).toFixed(2).replace('.', ',')} €
                  </span>
                  <button
                    onClick={() => removeItem(item.cartId)}
                    aria-label="Eliminar del carrito"
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '0.5rem',
                      padding: '0.3rem 0.5rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#DC2626',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'white',
            borderRadius: '1.5rem',
            padding: '1.25rem',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              backgroundColor: 'var(--color-accent-light)',
              borderRadius: '0.875rem',
              marginBottom: '1rem',
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-accent-hover)' }}>Total</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>
                {total.toFixed(2).replace('.', ',')} €
              </span>
            </div>

            <button
              onClick={handleCheckout}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#16A34A',
                color: 'white',
                border: 'none',
                borderRadius: '0.875rem',
                fontFamily: 'inherit',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              Proceder al pago
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Cart;
