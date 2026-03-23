import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const PaymentGateway = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card');

  const booking = location.state || {};
  const { courtId, courtName, sport, gradient, date, timeSlot } = booking;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const { error: dbError } = await supabase.from('bookings').insert({
      court_id: courtId,
      user_id: user.id,
      date,
      time_slot: timeSlot,
      status: 'confirmed',
      is_free: false,
    });
    setLoading(false);
    if (dbError) {
      setError('Esta franja ya no está disponible. Por favor elige otra.');
      return;
    }
    navigate('/mis-reservas');
  };

  const inputStyle = {
    width: '100%', padding: '0.875rem 1rem', borderRadius: '0.625rem',
    border: '1.5px solid #E2E8F0', fontSize: '0.95rem', backgroundColor: '#F8FAFC',
    color: '#0F172A', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
  };
  const labelStyle = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569',
    marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ backgroundColor: 'var(--color-bg-secondary)', minHeight: '100vh', padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Volver
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          {/* Payment Form */}
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>Pago Seguro</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: paymentMethod === 'card' ? '#635BFF' : paymentMethod === 'bizum' ? '#00c3a9' : '#003087', letterSpacing: '-0.5px', textTransform: paymentMethod === 'card' ? 'lowercase' : 'capitalize' }}>
                {paymentMethod === 'card' ? 'stripe' : paymentMethod === 'bizum' ? 'Bizum' : 'PayPal'}
              </span>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {error && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.625rem', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#DC2626', fontWeight: 500 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', backgroundColor: '#F1F5F9', padding: '0.375rem', borderRadius: '0.75rem' }}>
                <button 
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: paymentMethod === 'card' ? 'white' : 'transparent', boxShadow: paymentMethod === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, fontSize: '0.875rem', color: paymentMethod === 'card' ? '#0F172A' : '#64748B', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Tarjeta
                </button>
                <button 
                  type="button"
                  onClick={() => setPaymentMethod('bizum')}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: paymentMethod === 'bizum' ? 'white' : 'transparent', boxShadow: paymentMethod === 'bizum' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, fontSize: '0.875rem', color: paymentMethod === 'bizum' ? '#0F172A' : '#64748B', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Bizum
                </button>
                <button 
                  type="button"
                  onClick={() => setPaymentMethod('paypal')}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: paymentMethod === 'paypal' ? 'white' : 'transparent', boxShadow: paymentMethod === 'paypal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, fontSize: '0.875rem', color: paymentMethod === 'paypal' ? '#0F172A' : '#64748B', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  PayPal
                </button>
              </div>

              <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {paymentMethod === 'card' && (
                  <>
                    <div>
                      <label style={labelStyle}>Correo del recibo</label>
                      <input required type="email" defaultValue={user?.email} placeholder="tu@email.com" style={inputStyle} />
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
                  </>
                )}

                {paymentMethod === 'bizum' && (
                  <>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                       <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#00c3a9', color: 'white', marginBottom: '1rem' }}>
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                       </div>
                       <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>Introduce tu número de teléfono asociado a Bizum para autorizar el pago en tu app bancaria.</p>
                    </div>
                    <div>
                      <label style={labelStyle}>Número de teléfono</label>
                      <input required type="tel" placeholder="600 000 000" style={inputStyle} />
                    </div>
                  </>
                )}

                {paymentMethod === 'paypal' && (
                  <div style={{ textAlign: 'center', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                     <svg viewBox="0 0 124 33" style={{ height: '32px' }} xmlns="http://www.w3.org/2000/svg">
                       <path fill="#253b80" d="M46.21 26.32L48 14.85h4.15l-1.8 11.47zM57.65 14.85l-1.8 11.47h-4.14l1.8-11.47z"/><path fill="#179bd7" d="M120.76 15.68c-.62-2.3-2.6-3.08-5.34-3.08h-6.27l-2.02 12.78h4.29l.84-5.22h2.24c3.55 0 5.86-1.52 6.54-4.5.21-1 .18-1.54-.28-2.98"/>
                       <path fill="#253b80" d="M26.4 11.19c-1.3-.87-3.23-1.07-5.59-1.07H14.1l-3.32 20.94h4.86l1.52-9.62h2.98c3.27 0 5.67-1.35 6.42-4.1.28-1.07.27-2.02-.12-2.9-.38-1.06-1.12-2.04-2.45-2.93L15.4 12.35l3.24-2.22h3.9c1.6 0 3 .15 4.09.82 2.37 1.48 2.92 4.41 2.2 7.15-.6 2.27-2.39 3.59-5.12 3.59h-2.18L18.47 31h4.86l1.54-9.74h2.18c4.04 0 7.32-2.29 8.28-6.19.82-3.32-.45-6.07-3.41-7.92z"/>
                     </svg>
                     <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>Serás redirigido a PayPal para completar tu compra de forma segura.</p>
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem', fontSize: '1rem', background: paymentMethod === 'paypal' ? '#FFC439' : (paymentMethod === 'bizum' ? '#00c3a9' : undefined), color: paymentMethod === 'paypal' ? '#000' : undefined, border: paymentMethod === 'paypal' ? '1px solid #F6B828' : undefined, fontWeight: paymentMethod === 'paypal' ? '800' : undefined }}>
                  {loading ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Procesando...
                    </>
                  ) : paymentMethod === 'paypal' ? (
                    'Pagar con PayPal'
                  ) : paymentMethod === 'bizum' ? (
                    'Pagar con Bizum'
                  ) : (
                    'Pagar 14,00 €'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Order Summary */}
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' }}>
            <p className="section-label">Resumen del pedido</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '0.875rem', background: gradient || 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '1.5rem' }}>{sport === 'Pádel' ? '🎾' : '🏓'}</span>
              </div>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.15rem', letterSpacing: '-0.01em' }}>{courtName || 'Pista'} · {sport}</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>90 minutos</p>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Fecha', value: formatDate(date) },
                { label: 'Hora', value: timeSlot || '—' },
                { label: 'Sesión', value: '90 min' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--color-accent-light)', borderRadius: '0.875rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent-hover)' }}>Total</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>14,00 €</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default PaymentGateway;
