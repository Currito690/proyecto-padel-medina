const TimeSlotList = ({ slots, selectedSlot, onSelectSlot, onBook }) => {
  return (
    <div>
      <div className="time-slot-grid">
        {slots.map((slot) => {
          const isOccupied = slot.status === 'occupied';
          const isSelected = selectedSlot === slot.id;

          return (
            <button
              key={slot.id}
              disabled={isOccupied}
              onClick={() => onSelectSlot(slot.id)}
              style={{
                padding: '1rem 0.75rem',
                borderRadius: '0.875rem',
                backgroundColor: isSelected
                  ? 'var(--color-accent)'
                  : isOccupied
                  ? '#FEF2F2'
                  : 'white',
                color: isSelected
                  ? 'white'
                  : isOccupied
                  ? '#DC2626'
                  : 'var(--color-text-primary)',
                border: isSelected
                  ? '1.5px solid var(--color-accent)'
                  : isOccupied
                  ? '1.5px solid #FECACA'
                  : '1.5px solid var(--color-border)',
                boxShadow: isSelected
                  ? 'var(--shadow-accent)'
                  : isOccupied
                  ? 'none'
                  : 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                cursor: isOccupied ? 'not-allowed' : 'pointer',
                opacity: isOccupied ? 0.55 : 1,
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <span style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                textDecoration: isOccupied ? 'line-through' : 'none',
              }}>
                {slot.time}
              </span>
              <span style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                opacity: 0.75,
                backgroundColor: isSelected
                  ? 'rgba(255,255,255,0.2)'
                  : isOccupied
                  ? '#FEE2E2'
                  : 'var(--color-accent-light)',
                color: isSelected
                  ? 'white'
                  : isOccupied
                  ? '#DC2626'
                  : 'var(--color-accent)',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
              }}>
                {isOccupied ? 'Ocupado' : 'Libre'}
              </span>
            </button>
          );
        })}
      </div>

      {selectedSlot && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          padding: '1rem 1rem',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--color-border)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 40,
        }}>
          <button
            onClick={onBook}
            className="btn-primary"
            style={{ width: '100%', maxWidth: '500px', padding: '1rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12V22H4V12" />
              <path d="M22 7H2v5h20V7z" />
              <path d="M12 22V7" />
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
            </svg>
            Confirmar Reserva
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeSlotList;
