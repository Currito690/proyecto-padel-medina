import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, courts(name, sport, location, gradient)')
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .order('date', { ascending: true })
      .order('time_slot', { ascending: true });
    if (data) setBookings(data);
    setLoading(false);
  };

  const isCancelable = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return true;
    const startTime = timeStr.split(' - ')[0]; // e.g., '16:00'
    const bookingDateTime = new Date(`${dateStr}T${startTime}:00`);
    const now = new Date();
    const diffHours = (bookingDateTime - now) / (1000 * 60 * 60);
    return diffHours >= 24;
  };

  const cancelBooking = async (booking) => {
    if (!isCancelable(booking.date, booking.time_slot)) {
      alert('Las reservas no se pueden cancelar con menos de 24 horas de antelación. En caso de emergencia, contacta con el administrador.');
      return;
    }
    if (!window.confirm('¿Estás seguro de que deseas cancelar esta reserva?')) return;

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
    setBookings(prev => prev.filter(b => b.id !== booking.id));
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.date >= today);
  const past = bookings.filter(b => b.date < today);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const todayDate = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (dateStr === todayDate) return 'Hoy';
    if (dateStr === tomorrow) return 'Mañana';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94A3B8' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 0.25rem' }}>
          Tus Reservas
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          Historial de partidos y próximas citas
        </p>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Upcoming */}
        {upcoming.length === 0 && past.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94A3B8' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 0.4rem' }}>Sin reservas aún</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>Reserva tu primera pista desde la pestaña Reservas</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <p className="section-label">Próximas</p>
                {upcoming.map(booking => (
                  <div key={booking.id} style={{ backgroundColor: 'white', borderRadius: '1.25rem', overflow: 'hidden', boxShadow: '0 4px 16px rgba(22,163,74,0.1)', border: '1px solid var(--color-border-accent)' }}>
                    <div style={{ height: '4px', background: booking.courts?.gradient || 'linear-gradient(90deg, #16A34A, #059669)' }} />
                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                          <span className="badge badge-success" style={{ marginBottom: '0.5rem' }}>Próximo partido</span>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 0.2rem', letterSpacing: '-0.02em' }}>
                            {booking.courts?.name} · {booking.courts?.sport}
                          </h3>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                            {booking.courts?.location}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                            {formatDate(booking.date)}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                            {booking.time_slot}
                          </span>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {booking.is_free ? 'Reserva admin (gratis)' : 'Confirmada'}
                        </div>
                        {isCancelable(booking.date, booking.time_slot) ? (
                          <button
                            onClick={() => cancelBooking(booking)}
                            style={{ backgroundColor: 'transparent', color: 'var(--color-danger)', border: '1.5px solid #FECACA', padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            Cancelar
                          </button>
                        ) : (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
                              No cancelable
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#CBD5E1', display: 'block', lineHeight: 1.2, fontWeight: 500 }}>
                              (&lt; 24h)
                            </span>
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
                <p className="section-label" style={{ marginTop: '0.5rem' }}>Historial</p>
                {past.map(booking => (
                  <div key={booking.id} style={{ backgroundColor: 'white', borderRadius: '1.25rem', padding: '1.25rem', border: '1px solid var(--color-border)', opacity: 0.65 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span className="badge badge-muted" style={{ marginBottom: '0.5rem' }}>Finalizado</span>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.2rem', letterSpacing: '-0.01em' }}>
                          {booking.courts?.name} · {booking.courts?.sport}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          {booking.courts?.location}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                          {formatDate(booking.date)}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          {booking.time_slot}
                        </span>
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
