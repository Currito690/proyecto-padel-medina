import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Reemplazar con clave pública real (VITE_STRIPE_PUBLISHABLE_KEY)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx');

const CheckoutForm = ({ clientSecret, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        // Redirige al panel de usuario cuando termine el flujo de pago con éxito o con más acciones requeridas
        return_url: `${window.location.origin}/mis-reservas`,
      },
      // Usaremos redirect automático de Stripe
    });

    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
    } else {
      // Como usamos redirect automático no llegará aquí normalmente, pero por si acaso
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PaymentElement />
      {error && <div style={{ color: '#DC2626', fontSize: '0.85rem', fontWeight: 500, padding: '0.8rem', backgroundColor: '#FEF2F2', borderRadius: '0.5rem' }}>{error}</div>}
      <button type="submit" disabled={!stripe || loading} className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem', background: '#0F172A', color: 'white', border: 'none' }}>
        {loading ? 'Procesando...' : 'Pagar 18,00 €'}
      </button>
    </form>
  );
};

const PaymentGateway = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState('');
  const [creatingIntent, setCreatingIntent] = useState(true);

  const booking = location.state || {};
  const { courtId, courtName, sport, gradient, date, timeSlot, price = 18 } = booking;
  const [paymentMethod, setPaymentMethod] = useState('stripe');
  const [processingClub, setProcessingClub] = useState(false);

  useEffect(() => {
    const createIntent = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
          body: {
            amount: Math.round(price * 100), // convert to cents
            currency: 'eur',
            metadata: {
              court_id: courtId,
              user_id: user.id,
              date,
              time_slot: timeSlot
            }
          }
        });

        if (error) throw error;
        setClientSecret(data.clientSecret);
      } catch (err) {
        console.error("Error creating payment intent:", err);
      } finally {
        setCreatingIntent(false);
      }
    };
    
    createIntent();
  }, [user, courtId, date, timeSlot]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleClubPayment = async () => {
    setProcessingClub(true);
    try {
      const { error } = await supabase.from('bookings').insert({
        court_id: courtId,
        user_id: user.id,
        date: date,
        time_slot: timeSlot,
        status: 'confirmed',
        is_free: false,
      });
      if (error) throw error;
      navigate('/mis-reservas');
    } catch (err) {
      console.error("Error al reservar:", err);
      alert('Error al procesar la reserva en el club: ' + err.message);
      setProcessingClub(false);
    }
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
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', backgroundColor: '#F1F5F9', padding: '0.25rem', borderRadius: '0.875rem' }}>
              <button 
                onClick={() => setPaymentMethod('stripe')}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.625rem', border: 'none', backgroundColor: paymentMethod === 'stripe' ? 'white' : 'transparent', color: paymentMethod === 'stripe' ? '#0F172A' : '#64748B', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: paymentMethod === 'stripe' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                Tarjeta / Móvil
              </button>
              <button 
                onClick={() => setPaymentMethod('club')}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.625rem', border: 'none', backgroundColor: paymentMethod === 'club' ? 'white' : 'transparent', color: paymentMethod === 'club' ? '#0F172A' : '#64748B', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: paymentMethod === 'club' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                Pago en el Club
              </button>
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border)' }}>
              {paymentMethod === 'stripe' ? (
                <>
                  <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>Pago Seguro</span>
                    </div>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#635BFF', letterSpacing: '-0.5px' }}>stripe</span>
                  </div>

                  <div style={{ padding: '1.5rem' }}>
                    {creatingIntent ? (
                      <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94A3B8' }}>
                        <div style={{ width: '28px', height: '28px', border: '3px solid #E2E8F0', borderTopColor: '#635BFF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                        Cargando pasarela de pagos...
                      </div>
                    ) : clientSecret ? (
                      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                        <CheckoutForm clientSecret={clientSecret} onSuccess={() => navigate('/mis-reservas')} />
                      </Elements>
                    ) : (
                      <div style={{ color: '#DC2626', backgroundColor: '#FEF2F2', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                        Hubo un error al iniciar el pago. Inténtalo de nuevo.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#0F172A', fontWeight: 800 }}>Pago en Recepción</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>
                      Tu pista quedará reservada inmediatamente y abonarás los {price.toFixed(2).replace('.', ',')} € en el mostrador del club el día del partido.
                    </p>
                  </div>
                  <button 
                    onClick={handleClubPayment} 
                    disabled={processingClub} 
                    className="btn-primary" 
                    style={{ width: '100%', padding: '1rem', fontSize: '1rem', background: '#16A34A', color: 'white', border: 'none' }}
                  >
                    {processingClub ? 'Confirmando...' : `Confirmar Reserva (${price.toFixed(2).replace('.', ',')} €)`}
                  </button>
                </div>
              )}
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
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>{price.toFixed(2).replace('.', ',')} €</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentGateway;
