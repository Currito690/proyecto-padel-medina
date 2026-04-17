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

  // WhatsApp modal
  const [waModal, setWaModal] = useState(null);
  const [loadingTokens, setLoadingTokens] = useState(null);
  const [waLoadingShared, setWaLoadingShared] = useState(false); // banner mientras busca la reserva

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Busca la reserva de pago compartido más reciente (con o sin payment_type='split')
  const getRecentSplit = (list) => {
    const sorted = (list || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    // 1º intento: reserva marcada como split con pendiente de cobrar
    const strict = sorted.find(b => b.payment_type === 'split' && (b.split_paid || 0) < 4);
    if (strict) return strict;
    // 2º intento: reserva creada en los últimos 5 min (puede que redsys-notify aún no la marcó como split)
    const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
    return sorted.find(b => b.status === 'confirmed' && new Date(b.created_at).getTime() > fiveMinsAgo);
  };

  useEffect(() => {
    const isPayOk      = searchParams.get('pago') === 'ok';
    const isCompartido = searchParams.get('compartido') === '1';

    if (isPayOk) {
      setPagoOk(true);
      const np = new URLSearchParams(searchParams);
      np.delete('pago');
      np.delete('compartido');
      setSearchParams(np, { replace: true });
    }

    if (isPayOk && isCompartido) {
      setWaLoadingShared(true);
      (async () => {
        let data = await loadBookings();
        console.log('[WA] Inicio búsqueda reserva compartida. Total reservas:', data.length);
        let found = null;
        for (let i = 0; i < 8; i++) {
          found = getRecentSplit(data);
          console.log(`[WA] Intento ${i + 1}: found=`, found?.id, 'payment_type=', found?.payment_type);
          if (found) break;
          if (i < 7) {
            await sleep(3000);
            data = await fetchBookingsSilent();
          }
        }

        // Fallback: redsys-notify no creó la reserva → crearla desde el frontend
        if (!found) {
          console.log('[WA] Fallback: creando reserva desde frontend');
          try {
            const rawBooking = sessionStorage.getItem('sharedBooking');
            const rawPhones  = sessionStorage.getItem('sharedPhones');
            if (rawBooking && rawPhones) {
              const { courtId, date, timeSlot } = JSON.parse(rawBooking);
              const phones = JSON.parse(rawPhones);
              // Idempotencia: buscar si ya existe (con cualquier pago)
              const { data: existing } = await supabase
                .from('bookings')
                .select('id')
                .eq('user_id', user.id)
                .eq('court_id', courtId)
                .eq('date', date)
                .eq('time_slot', timeSlot)
                .eq('status', 'confirmed')
                .maybeSingle();
              if (existing) {
                console.log('[WA] Reserva ya existe (idempotencia):', existing.id);
                found = existing;
                data = await fetchBookingsSilent();
              } else {
                const { data: newB, error: newErr } = await supabase.from('bookings').insert({
                  court_id: courtId,
                  user_id: user.id,
                  date,
                  time_slot: timeSlot,
                  status: 'confirmed',
                  is_free: false,
                  payment_type: 'split',
                  split_phones: phones,
                  split_paid: 1,
                }).select().single();
                console.log('[WA] Reserva creada fallback:', newB?.id, newErr?.message);
                if (newB) { found = newB; data = await fetchBookingsSilent(); }
              }
            }
          } catch (e) { console.error('[WA] Fallback error:', e); }
        }

        if (found) await openWaModal(found.id, data);
        setWaLoadingShared(false);
      })();
    } else {
      loadBookings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga con spinner de página completa (primera carga)
  const loadBookings = async () => {
    setLoading(true);
    const data = await fetchBookingsSilent();
    setLoading(false);
    return data;
  };

  // Fetch silencioso sin cambiar el estado loading (para reintentos en background)
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

  // Carga tokens; si no existen, los crea desde booking.split_phones
  const openWaModal = async (bookingId, allBookings = null) => {
    setLoadingTokens(bookingId);

    let { data: tokens } = await supabase
      .from('shared_payment_tokens')
      .select('phone, token, paid, amount')
      .eq('booking_id', bookingId);

    console.log('[WA] openWaModal tokens:', tokens);

    // Fallback: tokens aún no generados → crearlos desde booking.split_phones o sessionStorage
    if (!tokens || tokens.length === 0) {
      const src = allBookings || bookings;
      const booking = src.find(b => b.id === bookingId);
      const splitPhones = (booking?.split_phones || []).filter(Boolean);
      const ssPhones = (() => { try { return JSON.parse(sessionStorage.getItem('sharedPhones') || '[]'); } catch { return []; } })();
      const phones = splitPhones.length > 0 ? splitPhones : ssPhones;
      console.log('[WA] Fallback phones:', phones);
      if (phones.length > 0) {
        // Importe: sessionStorage (guardado antes del redirect) o site_settings
        let splitAmount = 0;
        const stored = sessionStorage.getItem('sharedAmount');
        if (stored && parseFloat(stored) > 0) {
          splitAmount = parseFloat(stored);
        } else {
          const { data: ss } = await supabase.from('site_settings').select('court_price').single();
          splitAmount = Number(((ss?.court_price || 0) / 4).toFixed(2));
        }
        const { data: newTokens } = await supabase
          .from('shared_payment_tokens')
          .insert(phones.map(phone => ({
            booking_id: bookingId,
            phone: phone.replace(/\s/g, ''),
            amount: splitAmount,
          })))
          .select('phone, token, paid, amount');
        tokens = newTokens;
        sessionStorage.removeItem('sharedPhones');
        sessionStorage.removeItem('sharedAmount');
      }
    }

    setLoadingTokens(null);
    if (!tokens || tokens.length === 0) return;

    setWaModal({
      links: tokens.map(t => ({
        phone: t.phone,
        link: `${window.location.origin}/pago-compartido?token=${t.token}`,
        paid: t.paid,
        amount: t.amount,
      })),
      sentIdxs: new Set(),
    });
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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.5); } 50% { box-shadow: 0 0 0 8px rgba(37,211,102,0); } }
        .wa-pulse { animation: pulse 1.6s infinite; }
      `}</style>

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

      {/* ── Banner: preparando enlaces WhatsApp ── */}
      {waLoadingShared && (
        <div style={{ background: 'linear-gradient(135deg,#1D4ED8,#2563EB)', borderRadius: '1.25rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 6px 20px rgba(37,99,235,.35)' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .9s linear infinite', flexShrink: 0 }} />
          <div>
            <p style={{ margin: '0 0 .15rem', fontWeight: 800, color: 'white', fontSize: '.95rem' }}>Generando enlaces de pago compartido…</p>
            <p style={{ margin: 0, fontSize: '.78rem', color: 'rgba(255,255,255,.8)' }}>En unos segundos aparecerán los 3 links de WhatsApp para tus amigos.</p>
          </div>
        </div>
      )}

      {/* ── Modal WhatsApp ── */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.5rem 1.5rem 1rem 1rem', width: '100%', maxWidth: '440px', padding: '1.75rem 1.5rem 2rem', animation: 'slideUp .35s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ margin: '0 0 .25rem', fontSize: '1.1rem', fontWeight: 900, color: '#0F172A' }}>👯 Avisa al grupo</p>
                <p style={{ margin: 0, fontSize: '.8rem', color: '#64748B', lineHeight: 1.5 }}>Envía un único mensaje por WhatsApp al grupo de pádel con todos los enlaces.</p>
              </div>
              <button onClick={() => setWaModal(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: '#64748B', flexShrink: 0, marginLeft: '.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {(() => {
                const pendingLinks = waModal.links.filter(sl => !sl.paid);
                const paidLinks = waModal.links.filter(sl => sl.paid);
                
                if (pendingLinks.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '1.5rem', background: '#F0FDF4', borderRadius: '1rem', border: '2px solid #86EFAC' }}>
                      <span style={{ fontSize: '2rem', display: 'block', marginBottom: '.5rem' }}>✅</span>
                      <p style={{ margin: 0, fontWeight: 800, color: '#15803D' }}>Todos han pagado</p>
                    </div>
                  );
                }

                const waMsgLines = [
                  '🎾 ¡Hola! He reservado una pista en Padel Medina.',
                  'Por favor, pagad vuestra parte para confirmar la reserva antes de 48h:',
                  '',
                  ...pendingLinks.map((sl, idx) => `➡️ Jugador ${idx + 2}:\n${sl.link}`),
                  '',
                  '¡Nos vemos en la pista! 🏓'
                ];
                const waMsg = encodeURIComponent(waMsgLines.join('\n'));
                const waUrl = `https://wa.me/?text=${waMsg}`;

                return (
                  <>
                    <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '1rem', border: '1px solid #E2E8F0', fontSize: '.8rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                      {waMsgLines.join('\n')}
                    </div>
                    
                    <a href={waUrl} target="_blank" rel="noopener noreferrer"
                      onClick={() => setWaModal(null)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '1rem', borderRadius: '1rem', background: '#25D366', color: 'white', textDecoration: 'none', fontWeight: 800, fontSize: '.95rem', transition: 'all .2s', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' }}>
                      <span style={{ fontSize: '1.2rem' }}>📲</span> Compartir en WhatsApp
                    </a>
                    
                    {paidLinks.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '.75rem', color: '#64748B', textAlign: 'center', fontWeight: 600 }}>
                        {paidLinks.length} amigo(s) ya han pagado su parte.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
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

                      {/* Botón WhatsApp para pago compartido */}
                      {booking.payment_type === 'split' && booking.split_paid < 4 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <button
                            onClick={() => openWaModal(booking.id)}
                            disabled={loadingTokens === booking.id}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', padding: '.7rem 1rem', borderRadius: '.75rem', border: '2px solid #25D366', background: '#F0FFF4', color: '#15803D', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {loadingTokens === booking.id ? (
                              <><div style={{ width: '14px', height: '14px', border: '2px solid #86EFAC', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> Cargando...</>
                            ) : (
                              <><span style={{ fontSize: '1rem' }}>💬</span> Enviar enlaces de pago por WhatsApp ({booking.split_paid || 1}/4 pagado{booking.split_paid !== 1 ? 's' : ''})</>
                            )}
                          </button>
                        </div>
                      )}

                      <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          {booking.is_free ? 'Reserva admin (gratis)' : booking.payment_type === 'split' ? `Pago compartido · ${booking.split_paid || 1}/4` : 'Confirmada'}
                        </div>
                        {isCancelable(booking.date, booking.time_slot) ? (
                          <button onClick={() => cancelBooking(booking)} style={{ backgroundColor: 'transparent', color: 'var(--color-danger)', border: '1.5px solid #FECACA', padding: '.4rem .875rem', borderRadius: '.5rem', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}
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
