const MyBookings = () => {
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

        {/* Upcoming Booking */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1.25rem',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(22,163,74,0.1)',
          border: '1px solid var(--color-border-accent)',
        }}>
          {/* Green top strip */}
          <div style={{ height: '4px', background: 'linear-gradient(90deg, #16A34A, #059669)' }} />

          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span className="badge badge-success" style={{ marginBottom: '0.5rem' }}>
                  Próximo partido
                </span>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 0.2rem', letterSpacing: '-0.02em' }}>
                  Pista 1 · Pádel
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  Nave 1
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  Hoy
                </span>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  19:00 – 20:30
                </span>
              </div>
            </div>

            <div style={{
              borderTop: '1px dashed var(--color-border)',
              paddingTop: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Confirmada
              </div>
              <button style={{
                backgroundColor: 'transparent',
                color: 'var(--color-danger)',
                border: '1.5px solid #FECACA',
                padding: '0.4rem 0.875rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>

        {/* Section Label */}
        <p className="section-label" style={{ marginTop: '0.5rem' }}>Historial</p>

        {/* Past Booking */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1.25rem',
          padding: '1.25rem',
          border: '1px solid var(--color-border)',
          opacity: 0.65,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="badge badge-muted" style={{ marginBottom: '0.5rem' }}>Finalizado</span>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.2rem', letterSpacing: '-0.01em' }}>
                Pista 3 · Pickleball
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                Nave 1
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Ayer
              </span>
              <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                10:30 – 12:00
              </span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default MyBookings;
