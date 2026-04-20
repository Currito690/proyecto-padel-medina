import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

const getRoundName = (roundIndex, totalRounds) => {
  const left = totalRounds - roundIndex;
  if (left === 1) return 'Final';
  if (left === 2) return 'Semifinales';
  if (left === 3) return 'Cuartos de Final';
  if (left === 4) return 'Octavos de Final';
  if (left === 5) return 'Dieciseisavos';
  return `Ronda ${roundIndex + 1}`;
};

const fmtDateDisplay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

const parseScore = (scoreStr, pIdx) => {
  if (!scoreStr) return [];
  return scoreStr.trim().split(/\s+/).map(s => {
    const p = s.split('-');
    return p.length === 2 ? p[pIdx] : null;
  }).filter(n => n !== null);
};

function MatchCard({ match, isCons, compact = false }) {
  if (!match.p1 && !match.p2) {
    return (
      <div style={{ backgroundColor: '#F8FAFC', border: '1.5px dashed #E2E8F0', borderRadius: '0.75rem', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '64px' }}>
        <span style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: 600 }}>Por definir</span>
      </div>
    );
  }

  const winnerColor = isCons ? '#D97706' : '#16A34A';
  const winnerBg = isCons ? '#FFFBEB' : '#F0FDF4';
  const winnerBorder = isCons ? '#FDE68A' : '#DCFCE7';

  return (
    <div style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      {match.time && !match.p1?.isBye && !match.p2?.isBye && (
        <div style={{ padding: '0.3rem 0.65rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.02em' }}>
            {match.time}
          </span>
        </div>
      )}
      {[{ player: match.p1, side: 0 }, { player: match.p2, side: 1 }].map(({ player, side }) => {
        const isWinner = match.winner?.id === player?.id;
        const isBye = player?.isBye;
        return (
          <div
            key={side}
            style={{
              padding: compact ? '0.45rem 0.65rem' : '0.65rem 0.875rem',
              backgroundColor: isWinner ? winnerBg : isBye ? '#F8FAFC' : 'white',
              borderBottom: side === 0 ? `1.5px solid ${isWinner ? winnerBorder : '#F1F5F9'}` : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'background-color 0.15s',
            }}
          >
            <span style={{
              fontSize: compact ? '0.78rem' : '0.875rem',
              fontWeight: isWinner ? 800 : 600,
              color: isWinner ? winnerColor : isBye ? '#CBD5E1' : '#334155',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontStyle: isBye ? 'italic' : 'normal',
            }}>
              {player ? player.name : <span style={{ color: '#CBD5E1', fontStyle: 'italic', fontWeight: 400 }}>Por definir</span>}
            </span>
            {match.score && !isBye && (
              <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }}>
                {parseScore(match.score, side).map((s, i) => (
                  <span key={i} style={{ fontSize: '0.68rem', fontWeight: 800, background: isWinner ? winnerColor : '#E2E8F0', color: isWinner ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.25rem', minWidth: '1.1rem', textAlign: 'center' }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
            {isWinner && <span style={{ fontSize: compact ? '0.78rem' : '0.9rem', flexShrink: 0 }}>🏆</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function TournamentBracket() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);

  useEffect(() => {
    const fetchTournament = async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        setError('No se encontró este torneo.');
      } else {
        setTournament(data);
        const rounds = data.config?.rounds || {};
        const cats = Object.keys(rounds);
        if (cats.length > 0) setActiveTab(cats[0]);
      }
      setLoading(false);
    };
    fetchTournament();
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#1B3A6E', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', maxWidth: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🎾</span>
          <h2 style={{ margin: '0 0 0.5rem', color: '#0F172A' }}>Torneo no encontrado</h2>
          <p style={{ color: '#64748B' }}>{error || 'Este torneo no existe.'}</p>
        </div>
      </div>
    );
  }

  const cfg = tournament.config || {};
  const rounds = cfg.rounds || {};
  const consRounds = cfg.consRounds || {};
  const cats = Object.keys(rounds);
  const hasBracket = cats.length > 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6E 0%, #152D57 100%)', color: 'white', padding: 'clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem)', boxShadow: '0 4px 20px rgba(27,58,110,0.3)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Link
            to={`/torneos/${id}`}
            style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem' }}
          >
            ← Inscripción
          </Link>
          <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, letterSpacing: '-0.03em', color: 'white' }}>
            {tournament.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            {cfg.startDate && cfg.endDate && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: '0.9rem' }}>
                {fmtDateDisplay(cfg.startDate)} — {fmtDateDisplay(cfg.endDate)}
              </span>
            )}
            {hasBracket && (
              <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '2rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Cuadro en vivo
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(1rem, 3vw, 2rem) clamp(0.75rem, 3vw, 1.5rem)' }}>

        {!hasBracket ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: 'white', borderRadius: '1.5rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '1rem' }}>⏳</span>
            <h2 style={{ margin: '0 0 0.5rem', color: '#0F172A', fontSize: '1.5rem' }}>El cuadro aún no está disponible</h2>
            <p style={{ color: '#64748B', margin: 0, maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
              El organizador publicará el cuadro cuando el torneo comience. ¡Vuelve pronto!
            </p>
          </div>
        ) : (
          <>
            {/* Category tabs */}
            {cats.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
                {cats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    style={{
                      padding: '0.5rem 1.25rem',
                      borderRadius: '2rem',
                      border: '2px solid',
                      borderColor: activeTab === cat ? '#1B3A6E' : '#E2E8F0',
                      backgroundColor: activeTab === cat ? '#1B3A6E' : 'white',
                      color: activeTab === cat ? 'white' : '#475569',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {cats.map(cat => {
              if (cats.length > 1 && activeTab !== cat) return null;
              const catRounds = rounds[cat] || [];
              const catCons = consRounds[cat] || [];
              if (catRounds.length === 0) return null;
              const isLiguilla = catRounds[0]?.[0]?.isRR;

              if (isLiguilla) {
                // Standings computation
                const standingsMap = {};
                catRounds.forEach(round => round.forEach(m => {
                  [m.p1, m.p2].forEach(p => {
                    if (p && !standingsMap[p.id]) standingsMap[p.id] = { pair: p, pj: 0, pg: 0, pp: 0, pts: 0 };
                  });
                  if (m.winner) {
                    standingsMap[m.p1.id].pj++; standingsMap[m.p2.id].pj++;
                    if (m.winner.id === m.p1.id) {
                      standingsMap[m.p1.id].pg++; standingsMap[m.p1.id].pts += 2; standingsMap[m.p2.id].pp++;
                    } else {
                      standingsMap[m.p2.id].pg++; standingsMap[m.p2.id].pts += 2; standingsMap[m.p1.id].pp++;
                    }
                  }
                }));
                const standings = Object.values(standingsMap).sort((a, b) => b.pts - a.pts || b.pg - a.pg);

                return (
                  <div key={cat}>
                    {/* Standings table */}
                    <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div style={{ padding: '0.875rem 1.25rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>🏆 Clasificación</h3>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                              {['#', 'Pareja', 'PJ', 'PG', 'PP', 'Pts'].map(h => (
                                <th key={h} style={{ padding: '0.6rem 0.875rem', textAlign: h === 'Pareja' ? 'left' : 'center', color: '#64748B', fontWeight: 700, fontSize: '0.75rem', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((s, i) => (
                              <tr key={s.pair.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: i === 0 ? '#F0FDF4' : 'white' }}>
                                <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', fontWeight: 800, color: i === 0 ? '#16A34A' : '#94A3B8' }}>{i + 1}</td>
                                <td style={{ padding: '0.75rem 0.875rem', fontWeight: 700, color: '#0F172A' }}>{s.pair.name}</td>
                                <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', color: '#475569' }}>{s.pj}</td>
                                <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', color: '#16A34A', fontWeight: 700 }}>{s.pg}</td>
                                <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', color: '#DC2626', fontWeight: 700 }}>{s.pp}</td>
                                <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', fontWeight: 900, color: i === 0 ? '#16A34A' : '#0F172A' }}>{s.pts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Round matches */}
                    {catRounds.map((roundMatches, rIdx) => (
                      <div key={rIdx} style={{ marginBottom: '1.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Jornada {rIdx + 1}
                          </span>
                          <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {roundMatches.map(match => (
                            <MatchCard key={match.id} match={match} isCons={false} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              // Eliminatoria (main + optional consolation)
              return (
                <div key={cat}>
                  {[
                    { title: 'Cuadro Principal', data: catRounds, isCons: false },
                    { title: 'Cuadro de Consolación', data: catCons, isCons: true },
                  ].map(bracket => {
                    if (!bracket.data || bracket.data.length === 0) return null;
                    return (
                      <div key={bracket.title} style={{ marginBottom: '3rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: bracket.isCons ? '#D97706' : '#0F172A' }}>
                            {bracket.isCons ? '🥈' : '🥇'} {bracket.title}
                          </h3>
                          <div style={{ flex: 1, height: '2px', backgroundColor: bracket.isCons ? '#FDE68A' : '#E2E8F0', borderRadius: '1px' }} />
                        </div>

                        {/* Mobile: vertical list */}
                        <div className="bracket-mobile">
                          {bracket.data.map((roundMatches, rIdx) => {
                            const visibleMatches = roundMatches.filter(m => !(m.p1?.isBye && m.p2?.isBye));
                            if (visibleMatches.length === 0) return null;
                            return (
                              <div key={rIdx} style={{ marginBottom: '1.25rem' }}>
                                <div style={{ display: 'inline-block', padding: '0.3rem 0.875rem', backgroundColor: bracket.isCons ? '#FFFBEB' : '#EBF0FA', color: bracket.isCons ? '#92400E' : '#1B3A6E', borderRadius: '2rem', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                                  {getRoundName(rIdx, bracket.data.length)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {visibleMatches.map(match => (
                                    <MatchCard key={match.id} match={match} isCons={bracket.isCons} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop: horizontal bracket */}
                        <div className="bracket-desktop" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                          <div style={{ display: 'flex', gap: '1.5rem', minWidth: 'max-content', alignItems: 'stretch', paddingRight: '0.5rem' }}>
                            {bracket.data.map((roundMatches, rIdx) => {
                              const visibleMatches = roundMatches.filter(m => !(m.p1?.isBye && m.p2?.isBye));
                              if (visibleMatches.length === 0 && rIdx > 0) return null;
                              return (
                                <div key={rIdx} style={{ display: 'flex', flexDirection: 'column', width: '210px', flexShrink: 0 }}>
                                  <div style={{ textAlign: 'center', padding: '0.4rem 0.75rem', backgroundColor: bracket.isCons ? '#FFFBEB' : '#EBF0FA', color: bracket.isCons ? '#92400E' : '#1B3A6E', borderRadius: '0.5rem', fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem', whiteSpace: 'nowrap', border: `1px solid ${bracket.isCons ? '#FDE68A' : '#C3D4F5'}` }}>
                                    {getRoundName(rIdx, bracket.data.length)}
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: '0.75rem' }}>
                                    {roundMatches.map(match => (
                                      <MatchCard key={match.id} match={match} isCons={bracket.isCons} compact />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>

      <style>{`
        .bracket-mobile { display: block; }
        .bracket-desktop { display: none; }
        @media (min-width: 768px) {
          .bracket-mobile { display: none; }
          .bracket-desktop { display: block; }
        }
      `}</style>
    </div>
  );
}
