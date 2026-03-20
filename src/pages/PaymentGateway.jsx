import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PaymentGateway = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handlePayment = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      alert('Pago procesado con éxito. ¡Nos vemos en la pista!');
      navigate('/');
    }, 2000);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.875rem 1rem',
    borderRadius: '0.625rem',
    border: '1.5px solid #E2E8F0',
    fontSize: '0.95rem',
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#475569',
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div style={{ backgroundColor: 'var(--color-bg-secondary)', minHeight: '100vh', padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none',
            color: 'var(--color-text-secondary)', fontSize: '0.875rem',
            fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginBottom: '1.5rem', padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Volver
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>

          {/* Payment Form */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border)',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>Pago Seguro</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#635BFF', letterSpacing: '-0.5px' }}>stripe</span>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Correo del recibo</label>
                  <input required type="email" placeholder="tu@email.com" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Número de tarjeta</label>
                  <input required placeholder="1234 5678 9012 3456" style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Vencimiento</label>
                    <input required placeholder="MM / AA" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>CVC</label>
                    <input required placeholder="123" style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Nombre en tarjeta</label>
                  <input required placeholder="Juan García" style={inputStyle} />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                  style={{ width: '100%', padding: '1rem', marginTop: '0.5rem', fontSize: '1rem' }}
                >
                  {loading ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Procesando...
                    </>
                  ) : 'Pagar 14,00 €'}
                </button>
              </form>
            </div>
          </div>

          {/* Order Summary */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--color-border)',
          }}>
            <p className="section-label">Resumen del pedido</p>

            {/* Court Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '0.875rem',
                background: 'linear-gradient(135deg, #16A34A, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2 Q16 6 16 12 Q16 18 12 22" />
                  <path d="M12 2 Q8 6 8 12 Q8 18 12 22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.15rem', letterSpacing: '-0.01em' }}>Pista 1 · Pádel</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nave 1 · 90 minutos</p>
              </div>
            </div>

            {/* Details */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Fecha', value: 'Próx. seleccionada' },
                { label: 'Hora', value: '19:00 – 20:30' },
                { label: 'Sesión', value: '90 min' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1rem',
              backgroundColor: 'var(--color-accent-light)',
              borderRadius: '0.875rem',
            }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent-hover)' }}>Total</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>14,00 €</span>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PaymentGateway;
