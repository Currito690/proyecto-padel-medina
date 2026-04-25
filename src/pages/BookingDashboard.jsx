import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import TimeSlotList from '../components/booking/TimeSlotList';
import DateSelector from '../components/booking/DateSelector';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const SCHEDULE_TIMES = [
  '09:00 - 10:30',
  '10:30 - 12:00',
  '12:00 - 13:30',
  '16:00 - 17:30',
  '17:30 - 19:00',
  '19:00 - 20:30',
  '20:30 - 22:00',
];

const PadelIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2 Q16 6 16 12 Q16 18 12 22" />
    <path d="M12 2 Q8 6 8 12 Q8 18 12 22" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);

const PickleballIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="8" />
    <line x1="12" y1="16" x2="12" y2="22" />
  </svg>
);

const BookingDashboard = () => {
  const { user } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pagoCancelado, setPagoCancelado] = useState(false);
  const [courts, setCourts] = useState([]);
  const [events, setEvents] = useState([]);

  // Leer el param, mostrarlo en estado y limpiar la URL de inmediato
  useEffect(() => {
    if (searchParams.get('pago') === 'cancelado') {
      setPagoCancelado(true);
      searchParams.delete('pago');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [siteSettings, setSiteSettings] = useState({ booking_window_days: 7, court_price: 18.00, slots_release_time: '00:00' });
  const [slotsLocked, setSlotsLocked] = useState(false);
  const [isBanned, setIsBanned] = useState(false);

  const getMaxDate = () => {
    const now = new Date();
    const maxDate = new Date(now);
    maxDate.setDate(now.getDate() + (parseInt(siteSettings.booking_window_days, 10) || 7));
    return maxDate.getFullYear() + '-' + String(maxDate.getMonth() + 1).padStart(2, '0') + '-' + String(maxDate.getDate()).padStart(2, '0');
  };
  const maxValidDate = getMaxDate();

  const [selectedCourt, setSelectedCourt] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [view, setView] = useState('courts');
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [courtsError, setCourtsError] = useState(null);

  useEffect(() => {
    loadCourts();
    supabase.from('events').select('*').eq('published', true).order('event_date', { ascending: true }).then(({ data }) => setEvents(data || []));
  }, []);

  const loadCourts = async () => {
    setLoadingCourts(true);
    setCourtsError(null);

    const [settingsRes, courtsRes, profileRes] = await Promise.all([
      supabase.from('site_settings').select('*').single(),
      supabase.from('courts').select('*').eq('active', true).order('name'),
      supabase.from('profiles').select('banned').eq('id', user.id).single(),
    ]);

    if (profileRes.data?.banned) {
      setIsBanned(true);
      setLoadingCourts(false);
      return;
    }

    if (settingsRes.data) {
      const s = settingsRes.data;
      const releaseTime = s.slots_release_time || '00:00';
      const parsedPrice = parseFloat(s.court_price);
      setSiteSettings({
        booking_window_days: parseInt(s.booking_window_days, 10) || 7,
        court_price: isNaN(parsedPrice) ? 18.00 : parsedPrice,
        slots_release_time: releaseTime,
      });
      // Check if courts are still locked for today
      const now = new Date();
      const [rH, rM] = releaseTime.split(':').map(Number);
      const releaseMinutes = rH * 60 + rM;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      setSlotsLocked(nowMinutes < releaseMinutes);
    }

    if (courtsRes.error) setCourtsError(courtsRes.error.message);
    else if (!courtsRes.data || courtsRes.data.length === 0) setCourtsError('No hay pistas activas en la base de datos.');
    else setCourts(courtsRes.data);
    
    setLoadingCourts(false);
  };

  const loadSlots = async (courtId, date) => {
    setLoadingSlots(true);
    const [{ data: bookings }, { data: blocked }] = await Promise.all([
      supabase.from('bookings').select('time_slot').eq('court_id', courtId).eq('date', date).eq('status', 'confirmed'),
      supabase.from('blocked_slots').select('time_slot').eq('court_id', courtId).eq('date', date),
    ]);
    const bookedTimes = new Set(bookings?.map(b => b.time_slot) || []);
    const blockedTimes = new Set(blocked?.map(b => b.time_slot) || []);

    const now = new Date();
    const todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const isTodayOrPast = date <= todayDateStr;
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();

    const newSlots = SCHEDULE_TIMES.map((time, idx) => {
      let isPast = false;
      if (isTodayOrPast) {
        if (date < todayDateStr) {
          isPast = true;
        } else {
          const startStr = time.split(' - ')[0]; // "09:00"
          const [hoursStr, minutesStr] = startStr.split(':');
          if (currentHours > parseInt(hoursStr, 10) || (currentHours === parseInt(hoursStr, 10) && currentMinutes > parseInt(minutesStr, 10))) {
            isPast = true;
          }
        }
      }
      
      const isBooked = bookedTimes.has(time) || blockedTimes.has(time);

      return {
        id: `slot-${idx}`,
        time,
        status: isBooked || isPast ? 'occupied' : 'available',
      };
    });
    setSlots(newSlots);
    setLoadingSlots(false);
  };

  // El release_time solo bloquea fechas FUTURAS. Hoy siempre se puede reservar
  // (los slots pasados ya quedan marcados como ocupados por loadSlots).
  const isDateLocked = (dateStr) => {
    if (!slotsLocked) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return dateStr > todayStr;
  };

  const handleCourtChange = (courtId) => {
    if (isDateLocked(selectedDate)) {
      alert(`Las reservas para fechas futuras se abren a las ${siteSettings.slots_release_time}. Hoy puedes reservar normalmente.`);
      return;
    }
    setSelectedCourt(courtId);
    setSelectedSlot(null);
    setView('calendar');
    loadSlots(courtId, selectedDate);
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedSlot(null);
    if (selectedCourt) loadSlots(selectedCourt, e.target.value);
  };

  const handleBook = () => {
    if (isDateLocked(selectedDate)) {
      alert(`Las reservas para esta fecha se abren a las ${siteSettings.slots_release_time}.`);
      return;
    }
    const slot = slots.find(s => s.id === selectedSlot);
    const court = courts.find(c => c.id === selectedCourt);
    addItem({
      courtId: selectedCourt,
      courtName: court.name,
      sport: court.sport,
      gradient: court.gradient,
      date: selectedDate,
      timeSlot: slot.time,
      price: court.price != null ? court.price : siteSettings.court_price,
    });
    navigate('/carrito');
  };

  // Re-evaluar el bloqueo cada 30s para que se desbloquee solo a la hora exacta
  // (release_time = 09:00) sin obligar al usuario a recargar la página.
  useEffect(() => {
    if (!siteSettings.slots_release_time) return;
    const evaluate = () => {
      const now = new Date();
      const [rH, rM] = siteSettings.slots_release_time.split(':').map(Number);
      const releaseMin = rH * 60 + rM;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      setSlotsLocked(nowMin < releaseMin);
    };
    evaluate();
    const id = setInterval(evaluate, 30 * 1000);
    return () => clearInterval(id);
  }, [siteSettings.slots_release_time]);

  const currentCourt = courts.find(c => c.id === selectedCourt);
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Jugador';

  const responsiveStyles = `
    .courts-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.875rem;
    }
    @media (min-width: 768px) {
      .courts-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }
    }
    @media (min-width: 1024px) {
      .courts-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
      }
    }
    @media (max-width: 380px) {
      .booking-title { font-size: 1.5rem !important; }
      .booking-map iframe { height: 170px !important; }
      .hero-title { font-size: 1.5rem !important; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.85); }
    }
    @keyframes floatBlob {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(8px, -6px) scale(1.05); }
    }

    .hero-card {
      position: relative;
      overflow: hidden;
      border-radius: 1.5rem;
      padding: 1.75rem 1.375rem 1.625rem;
      background: linear-gradient(150deg, #1B3A6E 0%, #0F2550 100%);
      color: white;
      box-shadow: 0 16px 40px rgba(15, 37, 80, 0.28);
      margin-bottom: 1rem;
    }
    .hero-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(2px);
      animation: floatBlob 6s ease-in-out infinite;
      pointer-events: none;
    }
    .hero-title {
      font-size: 1.7rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin: 0 0 0.5rem;
      color: white;
    }
    .hero-subtitle {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.78);
      line-height: 1.5;
      margin: 0 0 1.125rem;
      max-width: 32ch;
    }
    @media (min-width: 640px) {
      .hero-card { padding: 2.25rem 1.75rem; border-radius: 1.75rem; }
      .hero-title { font-size: 2rem; }
      .hero-subtitle { font-size: 0.95rem; }
    }

    .stats-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      padding: 0.875rem 0.5rem;
      background: white;
      border: 1px solid var(--color-border);
      border-radius: 1rem;
      margin-bottom: 1.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem;
      text-align: center;
      min-width: 0;
    }
    .stat-item + .stat-item {
      border-left: 1px solid var(--color-border);
    }
    .stat-value {
      font-size: 0.95rem;
      font-weight: 900;
      color: var(--color-text-primary);
      letter-spacing: -0.02em;
    }
    .stat-label {
      font-size: 0.66rem;
      font-weight: 700;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    @media (min-width: 640px) {
      .stat-value { font-size: 1.05rem; }
      .stat-label { font-size: 0.72rem; }
    }

    .features-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    @media (min-width: 640px) {
      .features-grid { grid-template-columns: repeat(3, 1fr); }
    }
    .feature-card {
      background: white;
      border: 1px solid var(--color-border);
      border-radius: 1rem;
      padding: 1rem 1.125rem;
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .feature-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // ---- Banned View ----
  if (isBanned) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '380px', padding: '2rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#FEF2F2', border: '2px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontWeight: 900, color: '#0F172A', fontSize: '1.25rem', letterSpacing: '-0.02em' }}>Cuenta desactivada</h2>
          <p style={{ margin: '0 0 1.5rem', color: '#64748B', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Tu cuenta ha sido desactivada por el administrador del club. Ponte en contacto con nosotros para más información.
          </p>
          <a href="mailto:info@padelmedina.com" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', backgroundColor: '#0F172A', color: 'white', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
            Contactar con el club
          </a>
        </div>
      </div>
    );
  }

  // ---- Courts View ----
  if (view === 'courts') {
    return (
      <div className="dashboard-container">
        <style>{responsiveStyles}</style>

        {pagoCancelado && (
          <div style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A3412" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 800, color: '#9A3412', fontSize: '0.9rem' }}>Pago cancelado</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#C2410C' }}>No se ha realizado ningún cargo. Puedes volver a reservar cuando quieras.</p>
              </div>
            </div>
            <button onClick={() => setPagoCancelado(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9A3412', fontSize: '1.2rem', padding: '0.25rem', lineHeight: 1 }}>✕</button>
          </div>
        )}

        <h1 className="sr-only">Padel Medina - Club de Pádel</h1>

        {/* ── Hero ── */}
        <section className="hero-card">
          <span className="hero-blob" style={{ width: '180px', height: '180px', right: '-60px', top: '-60px', background: 'radial-gradient(circle, rgba(61,139,42,0.28), transparent 70%)' }} />
          <span className="hero-blob" style={{ width: '140px', height: '140px', left: '-40px', bottom: '-50px', background: 'radial-gradient(circle, rgba(96,165,250,0.22), transparent 70%)', animationDelay: '1.5s' }} />

          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', padding: '0.35rem 0.75rem', borderRadius: '2rem', marginBottom: '1rem', backdropFilter: 'blur(8px)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ADE80', animation: 'pulseDot 1.8s ease-in-out infinite', boxShadow: '0 0 8px rgba(74,222,128,0.8)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'white' }}>Hola, {firstName}</span>
          </div>

          <h2 className="hero-title">Tu club de pádel en Medina&nbsp;Sidonia</h2>
          <p className="hero-subtitle">Reserva tu pista en segundos. Pádel y pickleball, abierto todos los días.</p>

          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            <a
              href="#pistas"
              onClick={(e) => { e.preventDefault(); document.getElementById('pistas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.1rem', borderRadius: '2rem', background: 'white', color: '#0F2550', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
            >
              Reservar ahora
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
              </svg>
            </a>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 0.875rem', borderRadius: '2rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.9)', fontSize: '0.75rem', fontWeight: 600 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              Medina Sidonia, Cádiz
            </span>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <div className="stats-strip">
          <div className="stat-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2 Q16 6 16 12 Q16 18 12 22"/><path d="M12 2 Q8 6 8 12 Q8 18 12 22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            <span className="stat-value">Pádel</span>
            <span className="stat-label">y Pickleball</span>
          </div>
          <div className="stat-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D8B2A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span className="stat-value">09:00–22:00</span>
            <span className="stat-label">Todos los días</span>
          </div>
          <div className="stat-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            <span className="stat-value">Online</span>
            <span className="stat-label">Reserva 100%</span>
          </div>
        </div>

        {/* ── Próximos eventos ── */}
        {events.length > 0 && (
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Próximos eventos</p>
            <div style={{ height: '1px', flex: 1, background: 'var(--color-border)', margin: '0 0.875rem' }} />
          </div>
            <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
              {events.map(ev => {
                const dateStr = ev.event_date
                  ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase()
                  : null;
                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (!ev.registration_url) return;
                      try {
                        const path = new URL(ev.registration_url).pathname;
                        navigate(path);
                      } catch {
                        navigate(ev.registration_url);
                      }
                    }}
                    onMouseOver={e => { if (ev.registration_url) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.16)'; } }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; }}
                    style={{ flexShrink: 0, width: '220px', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', cursor: ev.registration_url ? 'pointer' : 'default', border: '1px solid #E2E8F0', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  >
                    {ev.poster_url ? (
                      <img src={ev.poster_url} alt={ev.title} style={{ width: '100%', height: '130px', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ height: '130px', background: 'linear-gradient(135deg, #1B3A6E, #0F2550)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 2 Q16 6 16 12 Q16 18 12 22"/><path d="M12 2 Q8 6 8 12 Q8 18 12 22"/>
                          <line x1="2" y1="12" x2="22" y2="12"/>
                        </svg>
                      </div>
                    )}
                    <div style={{ padding: '0.7rem 0.875rem', backgroundColor: 'white' }}>
                      {dateStr && <p style={{ margin: '0 0 0.2rem', fontSize: '0.65rem', fontWeight: 800, color: '#16A34A', letterSpacing: '0.05em' }}>{dateStr}</p>}
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.title}</p>
                      {ev.registration_url && <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', fontWeight: 700, color: '#2563EB' }}>Inscribirse →</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {slotsLocked && (
          <div style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A3412" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: '#9A3412', fontSize: '0.9rem' }}>Reservas de fechas futuras cerradas hasta las {siteSettings.slots_release_time}</p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#C2410C' }}>Hoy puedes reservar con normalidad. Las pistas de mañana en adelante se desbloquean a esa hora.</p>
            </div>
          </div>
        )}

        <div id="pistas" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '0.875rem', scrollMarginTop: '72px' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Pistas disponibles</p>
          <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
        </div>

        {loadingCourts ? (

          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94A3B8' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : courtsError ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '1rem', padding: '1.25rem', color: '#DC2626', fontSize: '0.875rem', fontWeight: 500 }}>
            {courtsError}
          </div>
        ) : (
          <div className="courts-grid">
            {courts.map((court) => (
              <button
                key={court.id}
                onClick={() => handleCourtChange(court.id)}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.14)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                }}
                style={{
                  display: 'flex', flexDirection: 'column',
                  padding: 0, borderRadius: '1.25rem',
                  background: 'white', border: '1px solid #E2E8F0',
                  cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s',
                }}
              >
                {/* Gradient top */}
                <div style={{
                  background: court.gradient,
                  padding: '1.75rem 1rem 1.5rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', right: '-28px', bottom: '-28px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(255,255,255,0.09)' }} />
                  <div style={{ position: 'absolute', left: '-18px', top: '-18px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem' }}>
                    {court.sport}
                  </span>
                  <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {court.sport === 'Pádel' ? <PadelIcon /> : <PickleballIcon />}
                  </div>
                </div>
                {/* Info bottom */}
                <div style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 900, fontSize: '1rem', color: '#0F172A', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {court.name}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginTop: '0.1rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {court.location}
                    </span>
                  </div>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1.75rem', padding: '1rem 1.25rem', borderRadius: '1rem', backgroundColor: 'white', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '0.75rem', background: 'var(--color-accent-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Sesiones de 90 minutos</p>
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Abierto de 09:00 a 22:00 todos los días</p>
          </div>
        </div>

        {/* ── ¿Por qué Padel Medina? ── */}
        <section style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.875rem', gap: '0.875rem' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Por qué Padel Medina</p>
            <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon" style={{ background: '#EFF6FF' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>Reserva rápida</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>En menos de 30 segundos desde el móvil.</p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon" style={{ background: '#F0FDF4' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 12 11 12"/></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>Cancelación flexible</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>Hasta 24h antes, sin penalización.</p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon" style={{ background: '#FFF7ED' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>Torneos y eventos</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>Competiciones regulares para todos los niveles.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Mapa ── */}
        <div className="booking-map" style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.875rem', gap: '0.875rem' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Cómo llegar</p>
            <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
          </div>
          <div style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid #E2E8F0', position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <iframe
              title="Ubicación Padel Medina"
              src="https://maps.google.com/maps?q=Calle+Alemania+4,+Medina+Sidonia,+Cadiz,+España&output=embed&z=16"
              width="100%"
              height="220"
              style={{ display: 'block', border: 'none' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=Calle+Alemania+4-20,+11170+Medina+Sidonia,+Cádiz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ position: 'absolute', bottom: '0.75rem', left: '50%', transform: 'translateX(-50%)', textDecoration: 'none', display: 'flex' }}
            >
              <span style={{ backgroundColor: '#0F172A', color: 'white', padding: '0.5rem 1.1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', whiteSpace: 'nowrap' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                </svg>
                Abrir en Google Maps
              </span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ---- Calendar / Time Slots View ----
  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <header>
          <button
            onClick={() => setView('courts')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Volver a pistas
          </button>

          <div style={{ padding: '1.25rem', borderRadius: '1rem', background: currentCourt?.gradient, marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{currentCourt?.sport}</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>{currentCourt?.name}</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>{currentCourt?.location}</p>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <p className="section-label" style={{ margin: 0 }}>Selecciona fecha</p>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'capitalize' }}>
                {new Date(selectedDate).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <DateSelector 
              selectedDate={selectedDate} 
              maxValidDate={maxValidDate} 
              onSelectDate={(newDate) => {
                setSelectedDate(newDate);
                setSelectedSlot(null);
                if (selectedCourt) loadSlots(selectedCourt, newDate);
              }} 
            />
          </div>
        </header>

        <main>
          <p className="section-label">Horas disponibles</p>
          {isDateLocked(selectedDate) && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '0.875rem', padding: '0.875rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#B91C1C' }}>Fecha bloqueada hasta las {siteSettings.slots_release_time}</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#7F1D1D' }}>Vuelve a esa hora para poder reservar este día. Para hoy puedes reservar con normalidad.</p>
              </div>
            </div>
          )}
          {loadingSlots ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94A3B8' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : (
            <div style={{ pointerEvents: isDateLocked(selectedDate) ? 'none' : 'auto', opacity: isDateLocked(selectedDate) ? 0.45 : 1, filter: isDateLocked(selectedDate) ? 'grayscale(0.6)' : 'none' }}>
              <TimeSlotList
                slots={slots}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
                onBook={handleBook}
                price={currentCourt?.price != null ? currentCourt.price : siteSettings.court_price}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default BookingDashboard;
