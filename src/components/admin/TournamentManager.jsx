import React, { useState } from 'react';

const TournamentManager = () => {
  const [phase, setPhase] = useState('setup'); // 'setup', 'bracket'
  const [participants, setParticipants] = useState([]);
  const [newCouple, setNewCouple] = useState('');
  const [rounds, setRounds] = useState([]);

  const addParticipant = (e) => {
    e.preventDefault();
    if (!newCouple.trim()) return;
    setParticipants([...participants, { id: Date.now().toString(), name: newCouple.trim() }]);
    setNewCouple('');
  };

  const removeParticipant = (id) => {
    setParticipants(participants.filter(p => p.id !== id));
  };

  const advanceWinnerMut = (rArray, rIdx, mIdx, winner) => {
    rArray[rIdx][mIdx].winner = winner;
    if (rIdx < rArray.length - 1) {
      const nextMatchIdx = Math.floor(mIdx / 2);
      const isTop = mIdx % 2 === 0;
      if (isTop) rArray[rIdx + 1][nextMatchIdx].p1 = winner;
      else rArray[rIdx + 1][nextMatchIdx].p2 = winner;
      
      // Limpiar el ganador de rondas futuras si cambiamos el ganador de una ronda anterior
      // (Para no arrastrar ganadores antiguos si administramos clics "atrás")
      let fR = rIdx + 1;
      let fM = nextMatchIdx;
      while (fR < rArray.length) {
         rArray[fR][fM].winner = null;
         const nextF = Math.floor(fM / 2);
         if (fR < rArray.length - 1) {
             const isTopF = fM % 2 === 0;
             if (isTopF && rArray[fR + 1][nextF].p1?.id !== winner.id) rArray[fR + 1][nextF].p1 = null;
             if (!isTopF && rArray[fR + 1][nextF].p2?.id !== winner.id) rArray[fR + 1][nextF].p2 = null;
         }
         fM = nextF;
         fR++;
      }

      // Auto-advance if opponent in next round is a bye
      const nextMatch = rArray[rIdx + 1][nextMatchIdx];
      if ((isTop && nextMatch.p2?.isBye) || (!isTop && nextMatch.p1?.isBye)) {
         advanceWinnerMut(rArray, rIdx + 1, nextMatchIdx, winner);
      }
    }
  };

  const generateBracket = () => {
    if (participants.length < 2) {
      alert("Añade al menos 2 parejas para crear un torneo.");
      return;
    }
    
    let p = [...participants];
    // Barajar aleatoriamente
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Calcular potencia de 2 más cercana (4, 8, 16, 32...)
    let pow = 2;
    while (pow < p.length) pow *= 2;
    
    // Rellenar huecos vacíos con "BYE" (pase directo)
    const byesCount = pow - p.length;
    for (let i = 0; i < byesCount; i++) {
        p.push({ id: `bye-${i}`, name: '---', isBye: true });
    }

    const numRounds = Math.log2(pow);
    const newRounds = [];
    
    // Generar la estructura de rondas vacía
    for (let r = 0; r < numRounds; r++) {
      const numMatchesInRound = pow / Math.pow(2, r + 1);
      const matches = [];
      for (let m = 0; m < numMatchesInRound; m++) {
        matches.push({
          id: `r${r}-m${m}`,
          round: r,
          matchIndex: m,
          p1: r === 0 ? p[m * 2] : null,
          p2: r === 0 ? p[m * 2 + 1] : null,
          winner: null
        });
      }
      newRounds.push(matches);
    }
    
    // Auto-avanzar los que se enfrentan a un BYE en primera ronda
    if (newRounds[0]) {
       newRounds[0].forEach(match => {
          if (match.p1?.isBye && match.p2 && !match.p2.isBye) {
             advanceWinnerMut(newRounds, 0, match.matchIndex, match.p2);
          } else if (match.p2?.isBye && match.p1 && !match.p1.isBye) {
             advanceWinnerMut(newRounds, 0, match.matchIndex, match.p1);
          }
       });
    }

    setRounds(newRounds);
    setPhase('bracket');
  };

  const handleSetWinner = (match, participant) => {
    if (!participant || participant.isBye) return;
    
    // Clonación profunda de estado
    const nextRounds = rounds.map(r => r.map(m => ({ ...m })));
    advanceWinnerMut(nextRounds, match.round, match.matchIndex, participant);
    setRounds(nextRounds);
  };

  const getRoundName = (roundIndex, totalRounds) => {
    const roundsLeft = totalRounds - roundIndex;
    if (roundsLeft === 1) return 'Final';
    if (roundsLeft === 2) return 'Semifinales';
    if (roundsLeft === 3) return 'Cuartos';
    if (roundsLeft === 4) return 'Octavos';
    return `Ronda ${roundIndex + 1}`;
  };

  if (phase === 'setup') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <p className="section-label" style={{ marginBottom: '1rem' }}>Inscripción de Torneo</p>
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <form onSubmit={addParticipant} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input 
              type="text" 
              placeholder="Ej: Juan y Alberto" 
              value={newCouple}
              onChange={(e) => setNewCouple(e.target.value)}
              style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem' }}
            />
            <button type="submit" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
              Añadir
            </button>
          </form>

          <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#64748B', fontSize: '0.85rem' }}>Participantes Instalados: {participants.length}</h4>
            {participants.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontStyle: 'italic' }}>No hay parejas añadidas todavía.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {participants.map((p, idx) => (
                  <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    <span style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.9rem' }}>{idx + 1}. {p.name}</span>
                    <button onClick={() => removeParticipant(p.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.2rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button 
            onClick={generateBracket}
            style={{ width: '100%', padding: '1rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', opacity: participants.length < 2 ? 0.5 : 1 }}
          >
            Sortear y Generar Cuadro
          </button>
        </div>
      </div>
    );
  }

  // BRACKET PHASE
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Cuadro del Torneo</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>Haz clic en el ganador de cada partido para avanzar ronda.</p>
        </div>
        <button 
          onClick={() => setPhase('setup')}
          style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Repetir Sorteo
        </button>
      </div>

      <div style={{ 
        display: 'flex', 
        overflowX: 'auto', 
        gap: '2.5rem', 
        paddingBottom: '2rem', 
        minHeight: '600px',
        alignItems: 'stretch'
      }}>
        {rounds.map((roundMatches, rIdx) => (
          <div key={`round-${rIdx}`} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-around', 
            minWidth: '220px',
            position: 'relative'
          }}>
            <h3 style={{ position: 'absolute', top: '-1.5rem', left: 0, width: '100%', textAlign: 'center', color: '#16A34A', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              {getRoundName(rIdx, rounds.length)}
            </h3>
            
            {roundMatches.map(match => (
              <div key={match.id} style={{
                backgroundColor: 'white',
                border: '1.5px solid #E2E8F0',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                margin: '1rem 0',
                opacity: match.p1?.isBye && match.p2?.isBye ? 0.3 : 1
              }}>
                {/* Player 1 */}
                <div 
                  onClick={() => handleSetWinner(match, match.p1)}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: match.winner?.id === match.p1?.id ? '#DCFCE7' : 'transparent',
                    borderBottom: '1.5px solid #F1F5F9',
                    cursor: match.p1?.isBye ? 'default' : 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: match.winner?.id === match.p1?.id ? 800 : 600,
                    color: match.winner?.id === match.p1?.id ? '#16A34A' : '#334155'
                  }}>
                    {match.p1 ? match.p1.name : '\u00A0'}
                  </span>
                </div>
                
                {/* Player 2 */}
                <div 
                  onClick={() => handleSetWinner(match, match.p2)}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: match.winner?.id === match.p2?.id ? '#DCFCE7' : '#F8FAFC',
                    cursor: match.p2?.isBye ? 'default' : 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: match.winner?.id === match.p2?.id ? 800 : 600,
                    color: match.winner?.id === match.p2?.id ? '#16A34A' : '#334155'
                  }}>
                    {match.p2 ? match.p2.name : '\u00A0'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Cesta del Ganador Absoluto (Opcional, se dibuja extra) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '180px' }}>
             <h3 style={{ textAlign: 'center', color: '#F59E0B', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
              Campeón
            </h3>
            <div style={{
                backgroundColor: '#FEF3C7',
                border: '2px solid #F59E0B',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                textAlign: 'center',
                boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)'
              }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#D97706' }}>
                  {rounds[rounds.length - 1]?.[0]?.winner?.name || 'TBD'}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TournamentManager;
