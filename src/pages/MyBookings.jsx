import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const MyBookings = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagoOk, setPagoOk] = useState(false);

  const sendConfirmationEmail = (booking) => {
    if (!user?.email) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-email`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'confirmation',
        email: user.email,
        userName: user.name,
        courtName: booking.courts?.name || 'Pista',
        date: booking.date,
        timeSlot: booking.time_slot,
      }),
    })
      .then(r => r.json())
      .then(r => console.log('Email result:', r))
      .catch(e => console.error('Email error:', e));
  };

  useEffect(() => {
    const isPayOk = searchParams.get('pago') === 'ok';
    if (isPayOk) {
      setPagoOk(true);
      const np = new URLSearchParams(searchParams);
      np.delete('pago');
      setSearchParams(np, { replace: true });

      (async () => {
        const raw = sessionStorage.getItem('pendingBooking');

        // Enviar email de confirmación inmediatamente con los datos disponibles
        if (raw) {
          const { courtName, date, timeSlot } = JSON.parse(raw);
          sendConfirmationEmail({
            courts: { name: courtName || 'Pista' },
            date,
            time_slot: timeSlot,
          });
        }

        let data = await loadBookings();

        if (!raw) {
          // Pago en club: enviar email para reservas creadas en los últimos 5 min
          const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          data.filter(b => b.created_at >= cutoff).forEach(sendConfirmationEmail);
          return;
        }

        // Redsys/Bizum: esperar a que redsys-notify cree la reserva (para UI)
        const { courtId, date, timeSlot } = JSON.parse(raw);
        for (let i = 0; i < 4; i++) {
          const found = data.find(b => b.court_id === courtId && b.date === date && b.time_slot === timeSlot);
          if (found) { sessionStorage.removeItem('pendingBooking'); return; }
          if (i < 3) {
            await new Promise(r => setTimeout(r, 2500));
            data = await fetchBookingsSilent();
          }
        }

        // Fallback: redsys-notify no creó la reserva → crearla desde el frontend
        const { error } = await supabase.from('bookings').insert({
          court_id: courtId,
          user_id: user.id,
          date,
          time_slot: timeSlot,
          status: 'confirmed',
          is_free: false,
        });
        if (!error) await fetchBookingsSilent();
        sessionStorage.removeItem('pendingBooking');
      })();
    } else {
      loadBookings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    const data = await fetchBookingsSilent();
    setLoading(false);
    return data;
  };

  const fetchBookingsSilent = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, courts(name, sport, location, gradient)')
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });
    if (error) console.error('fetchBookings error:', error.message);
    if (data) setBookings(data);
    return data || [];
  };

  const isCancelable = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return true;
    const bookingDateTime = new Date(`${dateStr}T${timeStr.split(' - ')[0]}:00`);
    return (bookingDateTime - new Date()) / (1000 * 60 * 60) >= 24;
  };

  const cancelBooking = async (booking) => {
    if (!isCancelable(booking.date, booking.time_slot)) {
      alert('Las reservas no se pueden cancelar con menos de 24 horas de antelación.');
      return;
    }
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
    setBookings(prev => prev.filter(b => b.id !== booking.id));
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.date >= today);
  const past = bookings.filter(b => b.date < today);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === tomorrowStr) return 'Mañana';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Banner pago OK ── */}
      {pagoOk && (
        <div style={{ background: 'linear-gradient(135deg,#16A34A,#059669)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.5rem' }}>🎾</div>
            <div>
              <p style={{ margin: '0 0 .2rem', fontWeight: 900, color: 'white', fontSize: '1.05rem' }}>¡Enhorabuena! Reserva confirmada</p>
              <p style={{ margin: 0, fontSize: '.82rem', color: 'rgba(255,255,255,.85)' }}>Tu pista está reservada. ¡Que disfrutes del partido!</p>
            </div>
          </div>
          <button onClick={() => setPagoOk(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
      )}

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 .25rem' }}>Tus Reservas</h1>
        <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--color-text-muted)' }}>Historial de partidos y próximas citas</p>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {upcoming.length === 0 && past.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94A3B8' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 .4rem' }}>Sin reservas aún</p>
            <p style={{ fontSize: '.875rem', margin: 0 }}>Reserva tu primera pista desde la pestaña Reservas</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <p className="section-label">Próximas</p>
                {upcoming.map(booking => (
                  <div key={booking.id} style={{ backgroundColor: 'white', borderRadius: '1.25rem', overflow: 'hidden', boxShadow: '0 4px 16px rgba(22,163,74,.1)', border: '1px solid var(--color-border-accent)' }}>
                    <div style={{ height: '4px', background: booking.courts?.gradient || 'linear-gradient(90deg,#16A34A,#059669)' }} />
                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                          <span className="badge badge-success" style={{ marginBottom: '.5rem' }}>Próximo partido</span>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 .2rem', letterSpacing: '-.02em' }}>
                            {booking.courts?.name} · {booking.courts?.sport}
                          </h3>
                          <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{booking.courts?.location}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{formatDate(booking.date)}</span>
                          <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: 'var(--color-accent)' }}>{booking.time_slot}</span>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          {booking.is_free ? 'Reserva admin (gratis)' : 'Confirmada'}
                        </div>
                        {isCancelable(booking.date, booking.time_slot) ? (
                          <button onClick={() => cancelBooking(booking)}
                            style={{ backgroundColor: 'transparent', color: 'var(--color-danger)', border: '1.5px solid #FECACA', padding: '.4rem .875rem', borderRadius: '.5rem', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                            Cancelar
                          </button>
                        ) : (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '.75rem', color: '#94A3B8', fontWeight: 700, display: 'block', lineHeight: 1.2 }}>No cancelable</span>
                            <span style={{ fontSize: '.65rem', color: '#CBD5E1', display: 'block', lineHeight: 1.2, fontWeight: 500 }}>(&lt; 24h)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {past.length > 0 && (
              <>
                <p className="section-label" style={{ marginTop: '.5rem' }}>Historial</p>
                {past.map(booking => (
                  <div key={booking.id} style={{ backgroundColor: 'white', borderRadius: '1.25rem', padding: '1.25rem', border: '1px solid var(--color-border)', opacity: 0.65 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span className="badge badge-muted" style={{ marginBottom: '.5rem' }}>Finalizado</span>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 .2rem', letterSpacing: '-.01em' }}>{booking.courts?.name} · {booking.courts?.sport}</h3>
                        <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{booking.courts?.location}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{formatDate(booking.date)}</span>
                        <span style={{ display: 'block', fontSize: '.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{booking.time_slot}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MyBookings;
