import { useAuth } from '../context/AuthContext';

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const Profile = () => {
  const { user, logout } = useAuth();
  const initial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';
  const isAdmin = user?.role === 'admin';

  const menuItems = [
    {
      label: 'Métodos de pago',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    },
    {
      label: 'Notificaciones',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
  ];

  return (
    <div className="dashboard-container">

      {/* Profile Hero */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(160deg, #ECFDF5 0%, #F0FDF4 50%, #F8FAFC 100%)',
        borderRadius: '1.5rem',
        border: '1px solid var(--color-border-accent)',
      }}>
        {/* Avatar */}
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #16A34A 0%, #059669 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', fontWeight: 800, color: 'white',
          boxShadow: '0 8px 24px rgba(22,163,74,0.35)',
          marginBottom: '1rem',
          border: '3px solid white',
        }}>
          {initial}
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
          {user?.name || 'Usuario Padel Medina'}
        </h2>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          {user?.email}
        </p>

        <span style={{
          backgroundColor: isAdmin ? '#FEF3C7' : 'var(--color-accent-light)',
          color: isAdmin ? '#D97706' : 'var(--color-accent-hover)',
          padding: '0.3rem 0.875rem',
          borderRadius: '999px',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}>
          {isAdmin ? 'Administrador' : 'Jugador'}
        </span>
      </div>

      {/* Settings List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {menuItems.map(({ label, icon }) => (
          <button
            key={label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              backgroundColor: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '1rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{icon}</span>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>{label}</span>
            </div>
            <ChevronRight />
          </button>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          width: '100%', padding: '1rem',
          backgroundColor: '#FEF2F2',
          color: 'var(--color-danger)',
          border: '1.5px solid #FECACA',
          borderRadius: '1rem',
          fontWeight: 700, fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
          transition: 'all 0.2s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Cerrar Sesión
      </button>

    </div>
  );
};

export default Profile;
