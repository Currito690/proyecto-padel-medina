import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toast, confirmDialog } from '../utils/notify';

const SharedPayment = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState('loading'); // loading | found | paid | invalid
  const [tokenData, setTokenData] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    loadToken();
  }, [token]);

  const loadToken = async () => {
    const { data, error } = await supabase
      .from('shared_payment_tokens')
      .select('*, bookings(*, courts(name, sport, gradient, location))')
      .eq('token', token)
      .single();

    if (error || !data) { setState('invalid'); return; }
    if (data.paid) { setState('paid'); setTokenData(data); return; }

    setTokenData(data);
    setBooking(data.bookings);
    setState('found');
  };

  const handlePay = async () => {
    if (!tokenData || !booking) return;
    setLoading(true);

    const origin = window.location.origin;
    const redirectFn = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-redirect`;
    const successUrl = `${redirectFn}?to=${encodeURIComponent(`${origin}/pago-compartido?token=${token}&pago=ok`)}`;
    const failUrl    = `${redirectFn}?to=${encodeURIComponent(`${origin}/pago-compartido?token=${token}&pago=error`)}`;
    const notifyUrl  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-notify-split`;

    const rawRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        amount: tokenData.amount,
        courtId: booking.court_id,
        userId: booking.user_id,
        date: booking.date,
        timeSlot: booking.time_slot,
        successUrl,
        failUrl,
        notifyUrl,
        paymentMethod: 'card',
        isSharedPayment: false,
        sharedPhones: [],
        splitToken: token,
      }),
    });

    if (!rawRes.ok) {
      toast('Error al conectar con la pasarela de pago. Inténtalo de nuevo.', 'error');
      setLoading(false);
      return;
    }

    const data = await rawRes.json();
    if (!data?.Ds_MerchantParameters) {
      toast('Error al conectar con la pasarela de pago. Inténtalo de nuevo.', 'error');
      setLoading(false);
      return;
    }
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
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── Pago completado (retorno desde Redsys) ──
  const pagoResult = searchParams.get('pago');
  if (pagoResult === 'ok') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '4rem', textAlign: 'center', marginBottom: '1rem' }}>🎾</div>
          <h1 style={{ ...styles.title, color: '#16A34A', textAlign: 'center' }}>¡Pago completado!</h1>
          <p style={{ ...styles.subtitle, textAlign: 'center' }}>Tu parte de la reserva ha sido confirmada. ¡Nos vemos en la pista!</p>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div style={styles.page}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '1rem' }}>❌</div>
          <h1 style={{ ...styles.title, textAlign: 'center' }}>Enlace no válido</h1>
          <p style={{ ...styles.subtitle, textAlign: 'center' }}>Este enlace de pago ha caducado o no es correcto. Contacta con quien te lo envió.</p>
        </div>
      </div>
    );
  }

  if (state === 'paid') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '1rem' }}>✅</div>
          <h1 style={{ ...styles.title, color: '#16A34A', textAlign: 'center' }}>Ya pagado</h1>
          <p style={{ ...styles.subtitle, textAlign: 'center' }}>Esta parte ya fue abonada anteriormente. ¡Nos vemos en la pista!</p>
        </div>
      </div>
    );
  }

  // state === 'found'
  const court = booking?.courts;
  const [y, m, d] = (booking?.date || '').split('-');
  const dateFormatted = formatDate(booking?.date);

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .pay-btn:hover { background: #1D4ED8 !important; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(37,99,235,0.4) !important; }
        .pay-btn:active { transform: translateY(0); }
      `}</style>

      <div style={{ ...styles.card, animation: 'fadeUp 0.4s ease' }}>
        {/* Header con logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: court?.gradient || 'linear-gradient(135deg,#16A34A,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            🎾
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Padel Medina</p>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Invitación de pago</p>
          </div>
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
          Un amigo te ha reservado una pista y necesita que pagues tu parte para confirmar la reserva.
        </p>

        {/* Tarjeta de reserva */}
        <div style={{ background: 'linear-gradient(135deg, #F8FAFF, #EFF6FF)', border: '1px solid #BFDBFE', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Detalles de la reserva</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Row icon="🏟️" label="Pista" value={`${court?.name} · ${court?.sport}`} />
            <Row icon="📍" label="Ubicación" value={court?.location || 'Padel Medina'} />
            <Row icon="📅" label="Fecha" value={dateFormatted} />
            <Row icon="⏰" label="Horario" value={booking?.time_slot} />
          </div>
        </div>

        {/* Importe */}
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.8rem', fontWeight: 700, color: '#16A34A' }}>Tu parte (1/4 de la pista)</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#4B5563' }}>Pago seguro con Redsys · SSL</p>
          </div>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#15803D', letterSpacing: '-1px' }}>
            {Number(tokenData.amount).toFixed(2).replace('.', ',')} €
          </p>
        </div>

        <button
          className="pay-btn"
          onClick={handlePay}
          disabled={loading}
          style={{
            width: '100%',
            padding: '1rem',
            background: loading ? '#94A3B8' : '#2563EB',
            color: 'white',
            border: 'none',
            borderRadius: '0.875rem',
            fontFamily: 'inherit',
            fontSize: '1.05rem',
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
            boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
          }}
        >
          {loading ? (
            <>
              <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Conectando con el banco...
            </>
          ) : (
            <>💳 Pagar {Number(tokenData.amount).toFixed(2).replace('.', ',')} € con Tarjeta</>
          )}
        </button>

        <p style={{ margin: '0.875rem 0 0', textAlign: 'center', fontSize: '0.72rem', color: '#94A3B8' }}>
          🔒 Pago procesado por Redsys · Certificado PCI DSS
        </p>
      </div>
    </div>
  );
};

const Row = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
    <span style={{ fontSize: '0.9rem', width: '20px', textAlign: 'center' }}>{icon}</span>
    <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, minWidth: '70px' }}>{label}</span>
    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>{value}</span>
  </div>
);

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  card: {
    background: 'white',
    borderRadius: '1.5rem',
    padding: '2rem',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 900,
    margin: '0 0 0.5rem',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#64748B',
    margin: 0,
    lineHeight: 1.6,
  },
};

export default SharedPayment;
