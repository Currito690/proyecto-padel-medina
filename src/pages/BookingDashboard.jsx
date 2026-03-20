import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TimeSlotList from '../components/booking/TimeSlotList';
import { useAuth } from '../context/AuthContext';

const generateMockSlots = () => {
  const scheduleTimes = [
    '09:00 - 10:30',
    '10:30 - 12:00',
    '12:00 - 13:30',
    '16:00 - 17:30',
    '17:30 - 19:00',
    '19:00 - 20:30',
    '20:30 - 22:00',
  ];
  return scheduleTimes.map((time, index) => ({
    id: `slot-${index}`,
    time,
    status: Math.random() > 0.6 ? 'occupied' : 'available',
  }));
};

const MOCK_COURTS = [
  { id: '1', name: 'Pista 1', sport: 'Pádel', location: 'Nave 1', gradient: 'linear-gradient(135deg, #16A34A 0%, #059669 100%)' },
  { id: '2', name: 'Pista 2', sport: 'Pádel', location: 'Nave 2', gradient: 'linear-gradient(135deg, #15803D 0%, #166534 100%)' },
  { id: '3', name: 'Pista 3', sport: 'Pickleball', location: 'Nave 1', gradient: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)' },
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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCourt, setSelectedCourt] = useState(MOCK_COURTS[0].id);
  const [slots, setSlots] = useState(generateMockSlots());
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [view, setView] = useState('courts');

  const handleSelectSlot = (slotId) => setSelectedSlot(slotId);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSlots(generateMockSlots());
    setSelectedSlot(null);
  };

  const handleCourtChange = (courtId) => {
    setSelectedCourt(courtId);
    setSlots(generateMockSlots());
    setSelectedSlot(null);
    setView('calendar');
  };

  const handleBook = () => navigate('/checkout');

  const currentCourt = MOCK_COURTS.find((c) => c.id === selectedCourt);
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

  // ---- Courts View ----
  if (view === 'courts') {
    return (
      <div className="dashboard-container">
        <style>{responsiveStyles}</style>
        {/* Header */}
        <header style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Hola, {firstName}
          </p>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            ¿Dónde juegas hoy?
          </h1>
        </header>

        {/* Court Cards */}
        <div className="courts-grid">
          {MOCK_COURTS.map((court) => (
            <button
              key={court.id}
              onClick={() => handleCourtChange(court.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.25rem',
                padding: '1.25rem',
                borderRadius: '1.25rem',
                background: court.gradient,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: court.sport === 'Pádel'
                  ? '0 8px 24px rgba(22,163,74,0.3)'
                  : '0 8px 24px rgba(14,165,233,0.3)',
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = court.sport === 'Pádel'
                  ? '0 16px 32px rgba(22,163,74,0.4)'
                  : '0 16px 32px rgba(14,165,233,0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = court.sport === 'Pádel'
                  ? '0 8px 24px rgba(22,163,74,0.3)'
                  : '0 8px 24px rgba(14,165,233,0.3)';
              }}
            >
              {/* Decorative circle */}
              <div style={{
                position: 'absolute', right: '-20px', top: '-20px',
                width: '100px', height: '100px', borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }} />

              {/* Icon */}
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {court.sport === 'Pádel' ? <PadelIcon /> : <PickleballIcon />}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 900, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.02em' }}>
                  {court.name}
                </span>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginTop: '0.1rem' }}>
                  {court.sport} · {court.location}
                </span>
              </div>

              {/* Arrow */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          ))}
        </div>

        {/* Info Card */}
        <div style={{
          marginTop: '2rem',
          padding: '1.25rem',
          borderRadius: '1rem',
          backgroundColor: 'var(--color-accent-light)',
          border: '1px solid var(--color-border-accent)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}>
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
      <div className="dashboard-layout">
        <header className="dashboard-sidebar">
          {/* Back */}
          <button
            onClick={() => setView('courts')}
            style={{
              background: 'none', border: 'none',
              color: 'var(--color-text-secondary)', fontSize: '0.875rem',
              fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              marginBottom: '1.5rem', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Volver a pistas
          </button>

          {/* Court banner */}
          <div style={{
            padding: '1.25rem',
            borderRadius: '1rem',
            background: currentCourt?.gradient,
            marginBottom: '1.5rem',
          }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {currentCourt?.sport}
            </p>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>
              {currentCourt?.name}
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
              {currentCourt?.location}
            </p>
          </div>

          {/* Date picker */}
          <div>
            <p className="section-label">Selecciona fecha</p>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                border: '1.5px solid var(--color-border)',
                backgroundColor: 'white',
                color: 'var(--color-text-primary)',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            />
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
              {formatDate(selectedDate)}
            </p>
          </div>
        </header>

        <main className="dashboard-main">
          <p className="section-label">Horas disponibles</p>
          <TimeSlotList
            slots={slots}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSelectSlot}
            onBook={handleBook}
          />
        </main>
      </div>
    </div>
  );
};

export default BookingDashboard;
