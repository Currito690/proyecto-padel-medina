import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import TimeSlotList from '../components/booking/TimeSlotList';
import DateSelector from '../components/booking/DateSelector';
import { useAuth } from '../context/AuthContext';

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
  const navigate = useNavigate();
  const [courts, setCourts] = useState([]);
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
      setSiteSettings({
        booking_window_days: parseInt(s.booking_window_days, 10) || 7,
        court_price: parseFloat(s.court_price) || 18.00,
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

  const handleCourtChange = (courtId) => {
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
    const slot = slots.find(s => s.id === selectedSlot);
    const court = courts.find(c => c.id === selectedCourt);
    navigate('/checkout', {
      state: {
        courtId: selectedCourt,
        courtName: court.name,
        sport: court.sport,
        gradient: court.gradient,
        date: selectedDate,
        timeSlot: slot.time,
        price: siteSettings.court_price
      },
    });
  };

  const currentCourt = courts.find(c => c.id === selectedCourt);
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Jugador';

  const responsiveStyles = `
    .courts-grid {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    @media (min-width: 640px) {
      .courts-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }
    }
    @media (min-width: 1024px) {
      .courts-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
      }
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
        <header style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Hola, {firstName}
          </p>
          <h1 className="sr-only">Padel Medina - Club de Pádel</h1>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            ¿Dónde juegas hoy?
          </h2>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '0.15rem', color: 'var(--color-accent)' }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ lineHeight: 1.4, fontWeight: 500 }}>
              Calle Alemania, 4-20, 11170<br />
              Medina Sidonia, Cádiz
            </span>
          </div>
        </header>

        {slotsLocked && (
          <div style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🔒</span>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: '#9A3412', fontSize: '0.9rem' }}>Reservas cerradas hasta las {siteSettings.slots_release_time}</p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#C2410C' }}>Las pistas se desbloquean automáticamente a esa hora. Vuelve entonces para reservar.</p>
            </div>
          </div>
        )}

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
                style={{
                  display: 'flex', alignItems: 'center', gap: '1.25rem',
                  padding: '1.25rem', borderRadius: '1.25rem',
                  background: court.gradient, border: 'none', cursor: 'pointer',
                  textAlign: 'left', position: 'relative', overflow: 'hidden',
                  boxShadow: court.sport === 'Pádel' ? '0 8px 24px rgba(22,163,74,0.3)' : '0 8px 24px rgba(14,165,233,0.3)',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = court.sport === 'Pádel' ? '0 16px 32px rgba(22,163,74,0.4)' : '0 16px 32px rgba(14,165,233,0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = court.sport === 'Pádel' ? '0 8px 24px rgba(22,163,74,0.3)' : '0 8px 24px rgba(14,165,233,0.3)';
                }}
              >
                <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '100px', height: '100px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.08)' }} />
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {court.sport === 'Pádel' ? <PadelIcon /> : <PickleballIcon />}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 900, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.02em' }}>{court.name}</span>
                  <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginTop: '0.1rem' }}>{court.sport} · {court.location}</span>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2rem', padding: '1.25rem', borderRadius: '1rem', backgroundColor: 'var(--color-accent-light)', border: '1px solid var(--color-border-accent)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '0.1rem' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-accent-hover)', fontWeight: 500 }}>
            Sesiones de 90 min · Abierto de 09:00 a 22:00
          </p>
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
          {loadingSlots ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94A3B8' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : (
            <TimeSlotList
              slots={slots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              onBook={handleBook}
              price={siteSettings.court_price}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default BookingDashboard;
