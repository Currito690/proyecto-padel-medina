import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const PaymentGateway = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, total, clearCart } = useCart();

  const [paymentMethod, setPaymentMethod] = useState('redsys');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingClub, setProcessingClub] = useState(false);

  // Si el carrito está vacío, volver al inicio
  useEffect(() => {
    if (items.length === 0) {
      navigate('/', { replace: true });
    }
  }, [items.length, navigate]);

  // Redsys sólo soporta pago de un item a la vez con la integración actual
  useEffect(() => {
    if (items.length > 1 && paymentMethod === 'redsys') {
      setPaymentMethod('club');
    }
  }, [items.length, paymentMethod]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleRedsysPay = async () => {
    if (!user || items.length === 0) return;
    if (items.length > 1) {
      setError('El pago con tarjeta sólo admite una reserva a la vez. Usa "Pago en el Club" o elimina reservas del carrito.');
      return;
    }
    const item = items[0];
    setLoading(true);
    setError(null);
    try {
      const successUrl = `${window.location.origin}/mis-reservas?pago=ok`;
      const failUrl    = `${window.location.origin}/mis-reservas?pago=error`;
      const notifyUrl  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-notify`;

      const res = await supabase.functions.invoke('redsys-create', {
        body: {
          amount: item.price,
          courtId: item.courtId,
          userId: user.id,
          date: item.date,
          timeSlot: item.timeSlot,
          successUrl,
          failUrl,
          notifyUrl,
        },
      });

      if (res.error) {
        throw new Error(res.error?.message || 'No se pudo conectar con la pasarela de pago');
      }

      const data = res.data;
      if (!data || data.error) {
        throw new Error(data?.error || 'Respuesta vacía del servidor');
      }

      if (!data.Ds_MerchantParameters || !data.Ds_Signature || !data.redsysUrl) {
        throw new Error('Datos de pago incompletos');
      }

      // Limpiamos el carrito antes de redirigir al banco
      clearCart();

      // Crear formulario dinámico y enviarlo a Redsys
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.redsysUrl;

      [
        ['Ds_SignatureVersion',    'HMAC_SHA256_V1'],
        ['Ds_MerchantParameters', data.Ds_MerchantParameters],
        ['Ds_Signature',          data.Ds_Signature],
      ].forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('Error Redsys:', err);
      setError(`Error: ${err.message}`);
      setLoading(false);
    }
  };

  const handleClubPayment = async () => {
    if (items.length === 0) return;
    setProcessingClub(true);
    try {
      const rows = items.map((item) => ({
        court_id: item.courtId,
        user_id: user.id,
        date: item.date,
        time_slot: item.timeSlot,
        status: 'confirmed',
        is_free: false,
      }));

      const { error } = await supabase.from('bookings').insert(rows);
      if (error) throw error;

      // Notificar al admin
      const summary = items.length === 1
        ? `${user.name} — ${items[0].courtName} · ${items[0].timeSlot}`
        : `${user.name} — ${items.length} reservas`;
      supabase.functions.invoke('send-push', {
        body: {
          title: 'Nueva reserva',
          body: summary,
          url: '/',
        },
      }).catch(() => {});

      clearCart();
      navigate('/mis-reservas');
    } catch (err) {
      console.error('Error al reservar:', err);
      alert('Error al procesar la reserva: ' + err.message);
      setProcessingClub(false);
    }
  };

  if (items.length === 0) return null;

  const isMulti = items.length > 1;

  return (
    <div style={{ backgroundColor: 'var(--color-bg-secondary)', minHeight: '100vh', padding: '1.5rem 1rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .pay-tab { flex: 1; padding: 0.75rem; border-radius: 0.625rem; border: none; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .pay-tab-active  { background: white; color: #0F172A; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .pay-tab-inactive { background: transparent; color: #64748B; }
        .pay-tab-disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <button onClick={() => navigate('/carrito')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Volver al carrito
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          {/* ── Panel de pago ── */}
          <div>
            {/* Selector método */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', backgroundColor: '#F1F5F9', padding: '0.25rem', borderRadius: '0.875rem' }}>
              <button
                onClick={() => !isMulti && setPaymentMethod('redsys')}
                disabled={isMulti}
                className={`pay-tab ${paymentMethod === 'redsys' ? 'pay-tab-active' : 'pay-tab-inactive'} ${isMulti ? 'pay-tab-disabled' : ''}`}
                title={isMulti ? 'Sólo disponible con una reserva' : ''}
              >
                💳 Tarjeta / Bizum
              </button>
              <button onClick={() => setPaymentMethod('club')} className={`pay-tab ${paymentMethod === 'club' ? 'pay-tab-active' : 'pay-tab-inactive'}`}>
                🏪 Pago en el Club
              </button>
            </div>

            {isMulti && (
              <div style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#9A3412' }}>
                El pago con tarjeta sólo admite una reserva. Para pagar varias a la vez, usa "Pago en el Club".
              </div>
            )}

            <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border)' }}>
              {paymentMethod === 'redsys' ? (
                <>
                  {/* Header Redsys */}
                  <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Pago Seguro con Redsys</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>VISA</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#FFF7ED', color: '#C2410C', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>MC</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#F0FDF4', color: '#15803D', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>BIZUM</span>
                    </div>
                  </div>

                  <div style={{ padding: '1.75rem 1.5rem', textAlign: 'center' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                      </svg>
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>TPV Virtual Redsys</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5 }}>
                      Serás redirigido a la pasarela de pago segura del banco donde podrás pagar con tarjeta o Bizum.
                    </p>

                    {error && (
                      <div style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '0.875rem', borderRadius: '0.6rem', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid #FECACA' }}>
                        {error}
                      </div>
                    )}

                    <button
                      onClick={handleRedsysPay}
                      disabled={loading}
                      style={{ width: '100%', padding: '1rem', backgroundColor: loading ? '#94A3B8' : '#1D4ED8', color: 'white', border: 'none', borderRadius: '0.75rem', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background-color 0.2s' }}
                    >
                      {loading ? (
                        <>
                          <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                          Conectando con el banco...
                        </>
                      ) : (
                        `Pagar ${total.toFixed(2).replace('.', ',')} € →`
                      )}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Pago 100% seguro · Certificado SSL · PCI DSS</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#0F172A', fontWeight: 800 }}>Pago en Recepción</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>
                      {isMulti ? `Tus ${items.length} pistas quedarán reservadas inmediatamente` : 'Tu pista quedará reservada inmediatamente'} y abonarás los {total.toFixed(2).replace('.', ',')} € en el mostrador del club.
                    </p>
                  </div>
                  <button onClick={handleClubPayment} disabled={processingClub} style={{ width: '100%', padding: '1rem', fontSize: '1rem', background: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontFamily: 'inherit', fontWeight: 700, cursor: processingClub ? 'not-allowed' : 'pointer' }}>
                    {processingClub ? 'Confirmando...' : `Confirmar ${isMulti ? 'Reservas' : 'Reserva'} (${total.toFixed(2).replace('.', ',')} €)`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Resumen del pedido ── */}
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' }}>
            <p className="section-label">Resumen del pedido</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
              {items.map((item) => (
                <div key={item.cartId} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', background: item.gradient || 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.25rem' }}>{item.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 0.15rem', letterSpacing: '-0.01em' }}>{item.courtName} · {item.sport}</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                      {formatDate(item.date)} · {item.timeSlot}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>
                    {Number(item.price).toFixed(2).replace('.', ',')} €
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--color-accent-light)', borderRadius: '0.875rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent-hover)' }}>Total</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-accent-hover)', letterSpacing: '-1px' }}>{total.toFixed(2).replace('.', ',')} €</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentGateway;
