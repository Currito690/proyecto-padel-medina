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
  const [compartido, setCompartido] = useState(false);
  const [shareLinks, setShareLinks] = useState([]); // [{ phone, link }]
  const [copiedIdx, setCopiedIdx] = useState(null);

  useEffect(() => {
    const isOk = searchParams.get('pago') === 'ok';
    const isCompartido = searchParams.get('compartido') === '1';
    if (isOk) setPagoOk(true);
    if (isCompartido) setCompartido(true);
    searchParams.delete('pago');
    searchParams.delete('compartido');
    setSearchParams(searchParams, { replace: true });
    loadBookings();
    if (isOk && isCompartido) {
      // Esperar un momento para que Redsys-notify haya procesado los tokens
      setTimeout(() => loadShareLinks(), 3000);
    }
  }, []);

  const dismissBanner = () => setPagoOk(false);

  const loadShareLinks = async () => {
    // Buscar la última reserva de este usuario con pago compartido
    const { data: lastBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id)
      .eq('payment_type', 'split')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastBooking?.id) return;

    const { data: tokens } = await supabase
      .from('shared_payment_tokens')
      .select('phone, token, paid')
      .eq('booking_id', lastBooking.id);

    if (tokens && tokens.length > 0) {
      const appUrl = window.location.origin;
      setShareLinks(tokens.map(t => ({
        phone: t.phone,
        link: `${appUrl}/pago-compartido?token=${t.token}`,
        paid: t.paid,
      })));
    }
  };

  const copyLink = (link, idx) => {
    navigator.clipboard.writeText(link);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

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

      {pagoOk && (
        <div style={{
          background: 'linear-gradient(135deg, #16A34A, #059669)',
          borderRadius: '1.25rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 8px 24px rgba(22,163,74,0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.5rem' }}>
              🎾
            </div>
            <div>
              <p style={{ margin: '0 0 0.2rem', fontWeight: 900, color: 'white', fontSize: '1.05rem' }}>
                ¡Enhorabuena! Reserva confirmada
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>
                Tu pista está reservada. ¡Que disfrutes del partido!
              </p>
            </div>
          </div>
          <button
            onClick={dismissBanner}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      {/* ── Panel de enlaces de WhatsApp para acompañantes ── */}
      {compartido && (
        <div style={{ background: 'white', borderRadius: '1.25rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', border: '1px solid #BFDBFE', boxShadow: '0 4px 20px rgba(37,99,235,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>👯</div>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>¡Envía el enlace de pago a tus amigos!</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>Cada amigo debe pagar su parte para confirmar la reserva completa.</p>
            </div>
          </div>

          {shareLinks.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.75rem', fontSize: '0.82rem', color: '#64748B' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid #CBD5E1', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              Preparando los enlaces... (puede tardar unos segundos)
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {shareLinks.map((sl, idx) => {
                const waMsg = encodeURIComponent(`🎾 ¡Te reservé una pista de pádel! Paga tu parte (${sl.link}) y confirmamos la reserva.`);
                const waUrl = `https://wa.me/34${sl.phone.replace(/\D/g,'')}?text=${waMsg}`;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.875rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 0.1rem', fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>Amigo {idx + 1} · +34 {sl.phone}</p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sl.link}</p>
                    </div>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: '#25D366', color: 'white', borderRadius: '0.625rem', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                    >
                      <span>📲</span> WhatsApp
                    </a>
                    <button
                      onClick={() => copyLink(sl.link, idx)}
                      style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: copiedIdx === idx ? '#22C55E' : '#F1F5F9', color: copiedIdx === idx ? 'white' : '#374151', border: 'none', borderRadius: '0.625rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                    >
                      {copiedIdx === idx ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
