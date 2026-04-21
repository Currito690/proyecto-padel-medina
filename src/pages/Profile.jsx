import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';
  const isAdmin = user?.role === 'admin';

  const [notifOpen, setNotifOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const openNotifications = async () => {
    setNotifOpen(true);
    if (events.length > 0) return;
    setEventsLoading(true);
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('published', true)
      .order('event_date', { ascending: true });
    setEvents(data || []);
    setEventsLoading(false);
  };

  const menuItems = [
    {
      label: 'Métodos de pago',
      iconBg: '#EFF6FF',
      iconColor: '#2563EB',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    },
    {
      label: 'Notificaciones',
      iconBg: '#FFF7ED',
      iconColor: '#EA580C',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        padding: '1.75rem 1.25rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(150deg, #1B3A6E 0%, #0F2550 100%)',
        borderRadius: '1.5rem',
        boxShadow: '0 8px 32px rgba(27,58,110,0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', top: '-60px', right: '-40px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', bottom: '-30px', left: '-20px', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
          {/* Avatar */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.75rem', fontWeight: 800, color: 'white',
            border: '2.5px solid rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}>
            {initial}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.2rem', letterSpacing: '-0.02em', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || 'Usuario Padel Medina'}
            </h2>
            <p style={{ margin: '0 0 0.625rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
            <span style={{
              backgroundColor: isAdmin ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.15)',
              color: isAdmin ? '#FCD34D' : 'rgba(255,255,255,0.9)',
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              border: isAdmin ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(255,255,255,0.2)',
            }}>
              {isAdmin ? 'Administrador' : 'Jugador'}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications panel */}
      {notifOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setNotifOpen(false)}>
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem 1.5rem 0 0', width: '100%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Notificaciones</h3>
              <button onClick={() => setNotifOpen(false)} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: '#64748B', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {eventsLoading ? (
              <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem 0' }}>Cargando…</p>
            ) : events.length === 0 ? (
              <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>No hay eventos publicados por el momento.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {events.map(ev => {
                  const dateStr = ev.event_date
                    ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                    : null;
                  return (
                    <div key={ev.id} style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      {ev.poster_url && <img src={ev.poster_url} alt={ev.title} style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />}
                      <div style={{ padding: '0.875rem 1rem', backgroundColor: 'white' }}>
                        {dateStr && <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#16A34A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{dateStr}</p>}
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>{ev.title}</p>
                        {ev.description && <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>{ev.description}</p>}
                        {ev.registration_url && (
                          <button onClick={() => { setNotifOpen(false); try { navigate(new URL(ev.registration_url).pathname); } catch { navigate(ev.registration_url); } }} style={{ marginTop: '0.25rem', padding: '0.5rem 1rem', backgroundColor: '#16A34A', color: 'white', borderRadius: '0.625rem', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer' }}>
                            Inscribirse →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings List */}
      <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        {menuItems.map(({ label, icon, iconBg, iconColor }, idx) => (
          <button
            key={label}
            onClick={label === 'Notificaciones' ? openNotifications : undefined}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              backgroundColor: 'white',
              border: 'none',
              borderTop: idx > 0 ? '1px solid var(--color-border)' : 'none',
              width: '100%',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.15s',
              minHeight: '60px',
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <span style={{
                width: '36px', height: '36px', borderRadius: '0.625rem',
                backgroundColor: iconBg, color: iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{icon}</span>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>{label}</span>
            </div>
            <ChevronRight />
          </button>
        ))}
      </div>

      {/* Contact Section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1.25rem',
        border: '1px solid var(--color-border)',
        marginBottom: '1.5rem',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ width: '36px', height: '36px', borderRadius: '0.625rem', backgroundColor: '#ECFDF5', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Contacto del Club</span>
        </div>

        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '0.15rem' }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              Calle Alemania, 4-20<br />
              11170 Medina Sidonia, Cádiz
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <a
              href="tel:+34667421519"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.75rem', minHeight: '44px',
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.75rem',
                fontWeight: 600, fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Llamar
            </a>
            <a
              href="https://wa.me/34667421519"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.75rem', minHeight: '44px',
                backgroundColor: '#25D366', color: 'white',
                borderRadius: '0.75rem', fontWeight: 600, fontSize: '0.85rem',
                textDecoration: 'none', boxShadow: '0 4px 12px rgba(37,211,102,0.25)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
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
