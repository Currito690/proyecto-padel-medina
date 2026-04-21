import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const CartEmptyIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const PadelIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2 Q16 6 16 12 Q16 18 12 22" />
    <path d="M12 2 Q8 6 8 12 Q8 18 12 22" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);

const PickleballIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="8" />
    <line x1="12" y1="16" x2="12" y2="22" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

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
      <header style={{ marginBottom: '1.75rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.5rem 0', minHeight: '44px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Seguir reservando
        </button>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: '0 0 0.25rem' }}>
          Tu carrito
        </h2>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          {items.length === 0
            ? 'No tienes ninguna pista en el carrito.'
            : `${items.length} ${items.length === 1 ? 'pista' : 'pistas'} seleccionada${items.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {items.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ color: '#CBD5E1', marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
            <CartEmptyIcon />
          </div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Carrito vacío</h3>
          <p style={{ margin: '0 0 1.75rem', fontSize: '0.875rem', color: '#64748B' }}>
            Selecciona una pista para añadirla al carrito.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.875rem 1.75rem',
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-accent)',
              minHeight: '44px',
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
                {/* Sport icon */}
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '0.875rem',
                  background: item.gradient || 'linear-gradient(135deg, var(--color-accent), #0F2550)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.sport === 'Pádel' ? <PadelIcon /> : <PickleballIcon />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                    {item.courtName}
                    <span style={{ fontWeight: 500, color: '#64748B' }}> · {item.sport}</span>
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', textTransform: 'capitalize', lineHeight: 1.4 }}>
                    {formatDate(item.date)}<br />
                    <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{item.timeSlot}</span>
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                    {Number(item.price).toFixed(2).replace('.', ',')} €
                  </span>
                  <button
                    onClick={() => removeItem(item.cartId)}
                    aria-label="Eliminar del carrito"
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '0.625rem',
                      width: '36px',
                      height: '36px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#DC2626',
                      transition: 'background 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#FEE2E2'}
                    onMouseOut={e => e.currentTarget.style.background = '#FEF2F2'}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Order summary */}
          <div style={{
            background: 'white',
            borderRadius: '1.5rem',
            padding: '1.25rem',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-md)',
          }}>
            {/* Line items */}
            {items.length > 1 && (
              <div style={{ marginBottom: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map(item => (
                  <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 500 }}>{item.courtName} · {item.timeSlot}</span>
                    <span style={{ fontSize: '0.82rem', color: '#0F172A', fontWeight: 600 }}>{Number(item.price).toFixed(2).replace('.', ',')} €</span>
                  </div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.25rem 0' }} />
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.1rem',
              backgroundColor: 'var(--color-accent-light)',
              borderRadius: '0.875rem',
              marginBottom: '1rem',
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-accent-hover)' }}>Total a pagar</span>
              <span style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>
                {total.toFixed(2).replace('.', ',')} €
              </span>
            </div>

            <button
              onClick={handleCheckout}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
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
                boxShadow: 'var(--shadow-accent)',
                minHeight: '52px',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 28px -4px rgba(27,58,110,0.45)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-accent)'; }}
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
