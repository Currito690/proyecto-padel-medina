import React, { useRef, useEffect } from 'react';

const DateSelector = ({ selectedDate, maxValidDate, onSelectDate }) => {
  const scrollRef = useRef(null);

  // Generar array de fechas desde hoy hasta maxValidDate
  const getValidDates = () => {
    const dates = [];
    const now = new Date();
    // Start at today local
    let current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    
    const maxParts = maxValidDate.split('-');
    const end = new Date(parseInt(maxParts[0]), parseInt(maxParts[1]) - 1, parseInt(maxParts[2]), 12, 0, 0);

    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const dates = getValidDates();

  // Scroll inicial a la fecha seleccionada si se monta off-screen
  useEffect(() => {
    if (scrollRef.current) {
      const selectedEl = scrollRef.current.querySelector('[data-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, []);

  return (
    <div 
      ref={scrollRef}
      style={{
        display: 'flex',
        gap: '0.75rem',
        overflowX: 'auto',
        paddingBottom: '0.75rem',
        paddingTop: '0.25rem',
        scrollbarWidth: 'none', // Firefox
        msOverflowStyle: 'none', // IE
        WebkitOverflowScrolling: 'touch'
      }}
      className="hide-scrollbar"
    >
      <style>
        {`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      
      {dates.map((date) => {
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const isSelected = dateStr === selectedDate;
        
        const dayOfWeekRaw = date.toLocaleDateString('es-ES', { weekday: 'short' });
        const dayOfWeek = dayOfWeekRaw.toUpperCase().replace('.', '');
        
        const dayOfMonth = date.getDate();
        
        const monthRaw = date.toLocaleDateString('es-ES', { month: 'short' });
        const month = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1).replace('.', '');

        return (
          <button
            key={dateStr}
            data-selected={isSelected}
            onClick={() => onSelectDate(dateStr)}
            style={{
              flexShrink: 0,
              minWidth: '4.8rem',
              padding: '0.85rem 0.5rem',
              borderRadius: '0.75rem',
              backgroundColor: isSelected ? '#F7FEE7' : 'white',
              border: isSelected ? '1.5px solid #84CC16' : '1.5px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 8px 16px rgba(132, 204, 22, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)',
              transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? '#65A30D' : '#64748B', marginBottom: '0.2rem' }}>
              {dayOfWeek}
            </span>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: isSelected ? '#4D7C0F' : '#334155', lineHeight: '1.1' }}>
              {dayOfMonth}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: isSelected ? '#65A30D' : '#94A3B8', marginTop: '0.25rem' }}>
              {month}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default DateSelector;
