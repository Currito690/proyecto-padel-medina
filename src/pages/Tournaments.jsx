import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

const TrophyIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const Tournaments = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status, config, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[Tournaments] fetch error:', error);
        setFetchError(error.message || 'No se pudieron cargar los torneos');
      } else if (data) {
        const visible = data.filter(t => t.status !== 'draft');
        console.log('[Tournaments] fetched', visible.length, 'tournaments (', data.length - visible.length, 'drafts ocultos)');
        setTournaments(visible);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const hasBracket = (t) =>
    t.config?.rounds && Object.keys(t.config.rounds).length > 0;

  const deadlinePassed = (t) => {
    if (!t.config?.registrationDeadline) return false;
    return new Date() > new Date(t.config.registrationDeadline + 'T23:59:59');
  };

  const isOpen = (t) => t.status === 'open' || t.status == null;

  const getStatusBadge = (t) => {
    if (hasBracket(t)) return { label: 'Cuadro publicado', bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' };
    if (!isOpen(t) || deadlinePassed(t)) return { label: 'Inscripción cerrada', bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8' };
    return { label: 'Inscripción abierta', bg: '#ECFDF5', color: '#15803D', dot: '#22C55E' };
  };

  const getCategories = (t) =>
    t.config?.categories?.split(',').map(c => c.trim()).filter(Boolean) || [];

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 0.25rem' }}>Torneos</h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          {tournaments.length === 0 ? 'No hay torneos activos' : `${tournaments.length} torneo${tournaments.length !== 1 ? 's' : ''} disponible${tournaments.length !== 1 ? 's' : ''}`}
        </p>
      </header>

      {fetchError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1rem', color: '#B91C1C', fontSize: '0.85rem', fontWeight: 500 }}>
          <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Error al cargar torneos</strong>
          {fetchError}
        </div>
      )}

      {tournaments.length === 0 && !fetchError ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1.5rem',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
          color: '#CBD5E1',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <TrophyIcon />
          </div>
          <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 0.4rem', fontSize: '1rem' }}>Sin torneos por ahora</p>
          <p style={{ fontSize: '0.875rem', color: '#94A3B8', margin: 0 }}>
            Cuando el club publique un torneo aparecerá aquí.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tournaments.map((t) => {
            const badge = getStatusBadge(t);
            const cats = getCategories(t);
            const startFmt = fmtDate(t.config?.startDate);
            const endFmt = fmtDate(t.config?.endDate);
            const deadlineFmt = fmtDate(t.config?.registrationDeadline);
            const bracket = hasBracket(t);
            const open = isOpen(t) && !deadlinePassed(t) && !bracket;

            return (
              <div
                key={t.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '1.25rem',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Accent top bar */}
                <div style={{ height: '4px', background: bracket
                  ? 'linear-gradient(90deg, #1D4ED8, #3B82F6)'
                  : open
                  ? 'linear-gradient(90deg, #15803D, #22C55E)'
                  : 'linear-gradient(90deg, #94A3B8, #CBD5E1)'
                }} />

                <div style={{ padding: '1.25rem' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.875rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{
                        fontSize: '1.125rem', fontWeight: 900, margin: '0 0 0.5rem',
                        letterSpacing: '-0.02em', color: 'var(--color-text-primary)',
                      }}>
                        {t.name}
                      </h2>
                      {/* Status badge */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        backgroundColor: badge.bg, color: badge.color,
                        padding: '0.25rem 0.7rem', borderRadius: '999px',
                        fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: badge.dot, flexShrink: 0 }} />
                        {badge.label}
                      </span>
                    </div>

                    {/* Trophy icon */}
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '0.75rem', flexShrink: 0,
                      background: bracket ? '#EFF6FF' : open ? 'var(--color-accent-light)' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: bracket ? '#1D4ED8' : open ? 'var(--color-accent)' : '#94A3B8',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                      </svg>
                    </div>
                  </div>

                  {/* Info pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {startFmt && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', padding: '0.3rem 0.65rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--color-border)' }}>
                        <CalendarIcon />
                        {endFmt && startFmt !== endFmt ? `${startFmt} — ${endFmt}` : startFmt}
                      </span>
                    )}
                    {cats.map(cat => (
                      <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', padding: '0.3rem 0.65rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--color-border)' }}>
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Deadline note */}
                  {deadlineFmt && !bracket && (
                    <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', fontWeight: 600, color: deadlinePassed(t) ? '#DC2626' : '#92400E' }}>
                      {deadlinePassed(t) ? 'Plazo cerrado: ' : 'Plazo inscripción: '}
                      {deadlineFmt}
                    </p>
                  )}

                  {/* CTA */}
                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem' }}>
                    {bracket ? (
                      <button
                        onClick={() => navigate(`/torneos/${t.id}/cuadro`)}
                        style={{
                          width: '100%', padding: '0.875rem', minHeight: '44px',
                          background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
                          color: 'white', border: 'none', borderRadius: '0.75rem',
                          fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '0.5rem',
                          boxShadow: '0 6px 20px rgba(29,78,216,0.3)',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        Ver cuadro del torneo
                      </button>
                    ) : open ? (
                      <button
                        onClick={() => navigate(`/torneos/${t.id}`)}
                        style={{
                          width: '100%', padding: '0.875rem', minHeight: '44px',
                          background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
                          color: 'white', border: 'none', borderRadius: '0.75rem',
                          fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '0.5rem',
                          boxShadow: 'var(--shadow-accent)',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                        Inscribirse al torneo
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: '#F1F5F9', borderRadius: '0.75rem' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94A3B8' }}>Inscripción cerrada</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Tournaments;
