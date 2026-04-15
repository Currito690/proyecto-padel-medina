import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOURS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', 
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

const TournamentEditor = ({ tournamentKey, onBack }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [editingScoreId, setEditingScoreId] = useState(null);
  const [scoreInput, setScoreInput] = useState('');
  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem(`padel_medina_tournament_${tournamentKey}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading tournament state from localStorage', e);
    }
    return null;
  };

  const savedData = loadSavedState();
  console.log("DEBUG: TournamentManager rendered, publishedId =", savedData?.publishedId);
  const [phase, setPhase] = useState(savedData?.phase || 'config'); 
  const [publishedId, setPublishedId] = useState(savedData?.publishedId || null);
  const [syncing, setSyncing] = useState(false);
  
  const [tConfig, setTConfig] = useState(() => {
    const fallback = {
      name: '',
      categories: 'Masculino, Femenino',
      startDay: 'Viernes', endDay: 'Domingo',
      startHour: '09:00', endHour: '22:00',
      firstDayStartHour: '16:00',
      courtsCount: 2,
      matchDuration: 90,
    };
    if (savedData?.tConfig) {
      return { ...fallback, ...savedData.tConfig, categories: savedData.tConfig.categories || 'Masculino, Femenino' };
    }
    return fallback;
  });
  
  const catListDefault = tConfig.categories.split(',').map(c => c.trim()).filter(Boolean);

  const [participants, setParticipants] = useState(() => {
     const firstCat = catListDefault[0] || 'General';
     // Remap any 'General' legacy category to the first real category on load
     return (savedData?.participants || []).map(p => ({
       ...p,
       category: (!p.category || p.category === 'General') ? firstCat : p.category
     }));
  });
  const [newCouple, setNewCouple] = useState('');
  // Default to first category so dropdown is never empty
  const [newCoupleCategory, setNewCoupleCategory] = useState(catListDefault[0] || '');
  const [newPreferences, setNewPreferences] = useState([]); 
  
  const [rounds, setRounds] = useState(() => {
     if (savedData?.rounds && Array.isArray(savedData.rounds)) {
        return { 'General': savedData.rounds };
     }
     return savedData?.rounds || {};
  });
  
  const [consRounds, setConsRounds] = useState(() => {
     if (savedData?.consRounds && Array.isArray(savedData.consRounds)) {
        return { 'General': savedData.consRounds };
     }
     return savedData?.consRounds || {};
  });

  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedHourStart, setSelectedHourStart] = useState(HOURS[0]);
  const [selectedHourEnd, setSelectedHourEnd] = useState(HOURS[1]);

  useEffect(() => {
    localStorage.setItem(`padel_medina_tournament_${tournamentKey}`, JSON.stringify({ phase, tConfig, participants, rounds, consRounds, publishedId }));
  }, [phase, tConfig, participants, rounds, consRounds, publishedId, tournamentKey]);

  const handleResetTournament = () => {
    if (window.confirm('¿Estás seguro de que quieres borrar este torneo y empezar uno nuevo? Se perderán todas las parejas y el cuadro generado.')) {
      localStorage.removeItem(`padel_medina_tournament_${tournamentKey}`);
      setPhase('config');
      setTConfig({ name: '', categories: 'Masculino, Femenino', startDay: 'Viernes', endDay: 'Domingo', startHour: '09:00', endHour: '22:00', firstDayStartHour: '16:00', courtsCount: 2, matchDuration: 90 });
      setParticipants([]);
      setRounds({});
      setConsRounds({});
      setNewCouple('');
      setNewCoupleCategory('');
      setNewPreferences([]);
      setPublishedId(null);
    }
  };

  const handlePublish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('tournaments')
        .insert({ name: tConfig.name, config: tConfig, admin_id: user?.id })
        .select()
        .single();
        
      if (error) throw error;
      setPublishedId(data.id);
      alert('¡Torneo publicado! Ya puedes enviar el enlace a los jugadores.');
    } catch (e) {
      console.error(e);
      alert('Error al publicar el torneo. Comprueba tu conexión o verifica que la base de datos esté lista.');
    }
  };

  const syncRegistrations = async () => {
    if (!publishedId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.from('tournament_registrations')
        .select('*')
        .eq('tournament_id', publishedId);
      
      if (error) throw error;
      
      const newParticipants = [];
      data.forEach(reg => {
        const prefRules = reg.unavailable_times || [];
        const prefNames = prefRules.map(p => p.label);
        const exists = participants.some(p => p.name === `${reg.player1_name} y ${reg.player2_name}` || p.id === reg.id);
        
        if (!exists) {
          newParticipants.push({
            id: reg.id,
            name: `${reg.player1_name} y ${reg.player2_name}`,
            category: reg.category,
            prefRules,
            prefNames
          });
        }
      });
      
      if (newParticipants.length > 0) {
        setParticipants([...participants, ...newParticipants]);
        alert(`Se han añadido ${newParticipants.length} nuevas parejas desde la web.`);
      } else {
        alert('No hay inscripciones nuevas online.');
      }
    } catch (e) {
      console.error(e);
      alert('Error al sincronizar las inscripciones online.');
    }
    setSyncing(false);
  };

  const addPreference = () => {
    const startIndex = HOURS.indexOf(selectedHourStart);
    const endIndex = HOURS.indexOf(selectedHourEnd);
    
    if (startIndex >= endIndex) {
      alert("La hora de fin debe ser posterior a la de inicio.");
      return;
    }

    const rangeSlots = HOURS.slice(startIndex, endIndex).map(h => `${selectedDay} ${h}`);
    
    setNewPreferences([
      ...newPreferences, 
      { id: Date.now().toString(), day: selectedDay, label: `${selectedDay} de ${selectedHourStart} a ${selectedHourEnd}`, slots: rangeSlots }
    ]);
  };

  const removePreference = (id) => {
    setNewPreferences(prev => prev.filter(p => p.id !== id));
  };

  const addParticipant = (e) => {
    e.preventDefault();
    if (!newCouple.trim()) return;

    const catList = tConfig.categories.split(',').map(c => c.trim()).filter(Boolean);
    const assignedCat = newCoupleCategory || catList[0] || 'General';

    setParticipants([...participants, { 
      id: Date.now().toString(), 
      name: newCouple.trim(),
      category: assignedCat,
      prefRules: [...newPreferences],
      prefNames: newPreferences.map(p => p.label)
    }]);
    setNewCouple('');
    setNewCoupleCategory(catList[0] || ''); // reset to first category, not empty
    setNewPreferences([]);
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

    // Calcular potencia de 2 más cercana (4, 8, 16, 32...) no se hace globalmente
    // Rellenar huecos vacíos tampoco
    
    // 1) Generar los slots globales del torneo en base a la configuración
    const sDayIdx = DAYS.indexOf(tConfig.startDay);
    const eDayIdx = DAYS.indexOf(tConfig.endDay);
    const sHourIdx = HOURS.indexOf(tConfig.startHour);
    const eHourIdx = HOURS.indexOf(tConfig.endHour);
    const firstDayHourIdx = tConfig.firstDayStartHour ? HOURS.indexOf(tConfig.firstDayStartHour) : sHourIdx;
    
    let globalSlots = [];
    for(let d = sDayIdx; d <= eDayIdx; d++) {
        if(d >= 0 && d < DAYS.length) {
            const actualStartHourIdx = (d === sDayIdx) ? firstDayHourIdx : sHourIdx;
            for(let h = actualStartHourIdx; h < eHourIdx; h++) {
               if(h >= 0 && h < HOURS.length) { globalSlots.push(`${DAYS[d]} ${HOURS[h]}`); }
            }
        }
    }
    
    // Diccionario para registrar cuántos partidos hay en cada hora
    let slotUsage = {};
    globalSlots.forEach(s => slotUsage[s] = 0);

    // Expandir disponibilidad de TODOS los participantes (excluyendo sus horas bloqueadas)
    const expandedParticipants = p.map(part => {
       if (part.isBye) return part;
       const blockedSlots = new Set((part.prefRules || []).flatMap(rule => rule.slots));
       const finalSlots = globalSlots.filter(gs => !blockedSlots.has(gs));
       return { ...part, finalSlots };
    });

    const catList = tConfig.categories.split(',').map(c => c.trim()).filter(Boolean);
    const newAllRounds = {};

    // If only one category exists, assign all participants to it regardless of stored category
    const normalizedParticipants = expandedParticipants.map(exp => {
      if (exp.isBye) return exp;
      if (catList.length === 1) return { ...exp, category: catList[0] };
      const match = catList.find(c => c.toLowerCase() === (exp.category || '').toLowerCase());
      if (!match) return { ...exp, category: catList[0] }; // fallback to first category
      return { ...exp, category: match };
    });

    catList.forEach(cat => {
       let catParts = normalizedParticipants.filter(exp => exp.category === cat);
       if (catParts.length < 2) return; // Skip empty categories

       // Calcular potencia de 2 más cercana
       let pow = 2;
       while (pow < catParts.length) pow *= 2;
       
       const byesCount = pow - catParts.length;
       for (let i = 0; i < byesCount; i++) {
           catParts.push({ id: `bye-${cat}-${i}`, name: '---', isBye: true });
       }
       
       const numRounds = Math.log2(pow);
       const catRounds = [];
       
       for (let r = 0; r < numRounds; r++) {
         const numMatchesInRound = pow / Math.pow(2, r + 1);
         const matches = [];
         for (let m = 0; m < numMatchesInRound; m++) {
           matches.push({
             id: `cat-${cat}-r${r}-m${m}`,
             round: r,
             matchIndex: m,
             p1: r === 0 ? catParts[m * 2] : null,
             p2: r === 0 ? catParts[m * 2 + 1] : null,
             winner: null,
             time: null,
             score: null
           });
         }
         catRounds.push(matches);
       }

       if (catRounds[0]) {
         catRounds[0].forEach(match => {
           if (match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye) {
              const p1Final = match.p1.finalSlots || [];
              const p2Final = match.p2.finalSlots || [];
              let common = p1Final.filter(s => p2Final.includes(s));
              if (common.length === 0) common = p1Final.length > 0 ? p1Final : (p2Final.length > 0 ? p2Final : globalSlots);
              const assignedTime = common.find(s => slotUsage[s] < tConfig.courtsCount);
              if (assignedTime) {
                  slotUsage[assignedTime]++;
                  match.time = `${assignedTime} - Pista ${slotUsage[assignedTime]}`;
              } else {
                  match.time = "A convenir";
              }
           }
         });
       }

       if (catRounds[0]) {
          catRounds[0].forEach(match => {
             if (match.p1?.isBye && match.p2 && !match.p2.isBye) {
                advanceWinnerMut(catRounds, 0, match.matchIndex, match.p2);
             } else if (match.p2?.isBye && match.p1 && !match.p1.isBye) {
                advanceWinnerMut(catRounds, 0, match.matchIndex, match.p1);
             }
          });
       }

       newAllRounds[cat] = catRounds;
    });

    if (Object.keys(newAllRounds).length === 0) {
      alert('No hay suficientes parejas en ninguna categoría para generar un cuadro. Asegúrate de tener al menos 2 parejas por categoría.');
      return;
    }

    setRounds(newAllRounds);
    setConsRounds({});
    setPhase('bracket');
  };

  const handleEditTime = (match, isCons = false, cat) => {
    const newTime = prompt("Introduce el horario para este partido (Ej: Sábado 18:00):", match.time || "");
    if (newTime !== null) {
       const targetRoundsGlob = isCons ? consRounds : rounds;
       const targetRounds = targetRoundsGlob[cat];
       const nextRounds = [...targetRounds];
       nextRounds[match.round] = [...nextRounds[match.round]];
       nextRounds[match.round][match.matchIndex] = { ...nextRounds[match.round][match.matchIndex], time: newTime.trim() };
       if (isCons) setConsRounds({...consRounds, [cat]: nextRounds}); 
       else setRounds({...rounds, [cat]: nextRounds});
    }
  };


  // Helper: expand slots for a participant excluding their blocked slots
  const expandPlayerSlots = (part, globalSlots) => {
    if (!part || part.isBye) return [];
    if (!part.prefRules || part.prefRules.length === 0) return [...globalSlots];
    const blockedSlots = new Set(part.prefRules.flatMap(r => r.slots));
    return globalSlots.filter(gs => !blockedSlots.has(gs));
  };

  // Helper: parse score string into per-player set values
  // e.g. "6-4 3-6 7-6" with pIdx=0 → ['6','3','7']
  const parseScore = (scoreStr, pIdx) => {
    if (!scoreStr) return [];
    return scoreStr.trim().split(/\s+/).map(s => {
      const p = s.split('-');
      return p.length === 2 ? p[pIdx] : null;
    }).filter(n => n !== null);
  };

  // Determine winner automatically from score string
  const determineWinnerFromScore = (scoreStr, p1, p2) => {
    if (!scoreStr || !p1 || !p2 || p1.isBye || p2.isBye) return null;
    let p1Wins = 0, p2Wins = 0;
    scoreStr.trim().split(/\s+/).forEach(s => {
      const parts = s.split('-');
      if (parts.length === 2) {
        const a = parseInt(parts[0]), b = parseInt(parts[1]);
        if (!isNaN(a) && !isNaN(b)) { if (a > b) p1Wins++; else if (b > a) p2Wins++; }
      }
    });
    if (p1Wins > p2Wins) return p1;
    if (p2Wins > p1Wins) return p2;
    return null;
  };

  const handleScoreSubmit = (match, scoreStr, isCons, cat) => {
    const trimmed = scoreStr.trim();
    setEditingScoreId(null);
    setScoreInput('');
    if (!trimmed) return;
    const targetRounds = (isCons ? consRounds : rounds)[cat];
    const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    nextRounds[match.round][match.matchIndex].score = trimmed;
    const winner = determineWinnerFromScore(trimmed, match.p1, match.p2);
    if (winner) {
      advanceWinnerMut(nextRounds, match.round, match.matchIndex, winner);
      // Auto-schedule next match
      const nextRoundIdx = match.round + 1;
      const nextMatchIdx = Math.floor(match.matchIndex / 2);
      if (nextRoundIdx < nextRounds.length) {
        const nextMatch = nextRounds[nextRoundIdx][nextMatchIdx];
        if (nextMatch && nextMatch.p1 && nextMatch.p2 && !nextMatch.p1.isBye && !nextMatch.p2.isBye && !nextMatch.time) {
          const globalSlots = buildGlobalSlots();
          const updatedMain = isCons ? rounds : { ...rounds, [cat]: nextRounds };
          const updatedCons = isCons ? { ...consRounds, [cat]: nextRounds } : consRounds;
          const slotUsage = buildSlotUsage(globalSlots, updatedMain, updatedCons);
          const p1Slots = expandPlayerSlots(nextMatch.p1, globalSlots);
          const p2Slots = expandPlayerSlots(nextMatch.p2, globalSlots);
          let common = p1Slots.filter(s => p2Slots.includes(s));
          if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);
          const assigned = common.find(s => slotUsage[s] !== undefined && slotUsage[s] < tConfig.courtsCount);
          nextMatch.time = assigned ? `${assigned} - Pista ${slotUsage[assigned] + 1}` : 'A convenir';
        }
      }
    }
    if (isCons) setConsRounds({ ...consRounds, [cat]: nextRounds });
    else setRounds({ ...rounds, [cat]: nextRounds });
  };

  // Helper: reconstruct slotUsage from ALL matches that already have a time
  const buildSlotUsage = (globalSlots, mainRounds, consRoundsSnap) => {
    const usage = {};
    globalSlots.forEach(s => { usage[s] = 0; });
    const countRounds = (roundsObj) => {
      Object.values(roundsObj).forEach(catR => {
        catR.forEach(round => {
          round.forEach(m => {
            if (m.time && m.time !== 'A convenir') {
              const base = m.time.split(' - Pista')[0].trim();
              if (usage[base] !== undefined) usage[base]++;
            }
          });
        });
      });
    };
    countRounds(mainRounds);
    countRounds(consRoundsSnap);
    return usage;
  };

  // Helper: compute globalSlots from tConfig
  const buildGlobalSlots = () => {
    const sDayIdx = DAYS.indexOf(tConfig.startDay);
    const eDayIdx = DAYS.indexOf(tConfig.endDay);
    const sHourIdx = HOURS.indexOf(tConfig.startHour);
    const eHourIdx = HOURS.indexOf(tConfig.endHour);
    const firstDayHourIdx = tConfig.firstDayStartHour ? HOURS.indexOf(tConfig.firstDayStartHour) : sHourIdx;
    const slots = [];
    for (let d = sDayIdx; d <= eDayIdx; d++) {
      if (d >= 0 && d < DAYS.length) {
        const actualStart = (d === sDayIdx) ? firstDayHourIdx : sHourIdx;
        for (let h = actualStart; h < eHourIdx; h++) {
          if (h >= 0 && h < HOURS.length) slots.push(`${DAYS[d]} ${HOURS[h]}`);
        }
      }
    }
    return slots;
  };

  const handleSetWinner = (match, participant, isCons = false, cat) => {
    if (!participant || participant.isBye) return;
    const targetRoundsGlob = isCons ? consRounds : rounds;
    const targetRounds = targetRoundsGlob[cat];
    const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    advanceWinnerMut(nextRounds, match.round, match.matchIndex, participant);

    // Auto-schedule the next round match if both players are now known
    const nextRoundIdx = match.round + 1;
    const nextMatchIdx = Math.floor(match.matchIndex / 2);

    if (nextRoundIdx < nextRounds.length) {
      const nextMatch = nextRounds[nextRoundIdx][nextMatchIdx];
      if (nextMatch && nextMatch.p1 && nextMatch.p2 && !nextMatch.p1.isBye && !nextMatch.p2.isBye && !nextMatch.time) {
        const globalSlots = buildGlobalSlots();

        // Build snapshots with the new nextRounds applied
        const updatedMain = isCons ? rounds : { ...rounds, [cat]: nextRounds };
        const updatedCons = isCons ? { ...consRounds, [cat]: nextRounds } : consRounds;
        const slotUsage = buildSlotUsage(globalSlots, updatedMain, updatedCons);

        const p1Slots = expandPlayerSlots(nextMatch.p1, globalSlots);
        const p2Slots = expandPlayerSlots(nextMatch.p2, globalSlots);
        let common = p1Slots.filter(s => p2Slots.includes(s));
        if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);

        const assigned = common.find(s => slotUsage[s] !== undefined && slotUsage[s] < tConfig.courtsCount);
        nextMatch.time = assigned ? `${assigned} - Pista ${slotUsage[assigned] + 1}` : 'A convenir';
      }
    }

    if (isCons) setConsRounds({...consRounds, [cat]: nextRounds});
    else setRounds({...rounds, [cat]: nextRounds});
  };


  const generateConsolation = (cat) => {
    const catRounds = rounds[cat];
    if (!catRounds || catRounds.length < 1) return;
    
    // Perdedores puros de R0
    const losersR0 = catRounds[0].map(m => {
       if (m.winner && m.p1 && m.p2 && !m.p1.isBye && !m.p2.isBye) {
          return m.winner.id === m.p1.id ? m.p2 : m.p1;
       }
       return null;
    }).filter(Boolean);

    // Perdedores de R1 cuyo oponente (o él) tuvo BYE en R0
    const losersR1WithBye = (catRounds[1] || []).map(m => {
       if (m.winner && m.p1 && m.p2) {
          const loser = m.winner.id === m.p1.id ? m.p2 : m.p1;
          if (loser.isBye) return null;
          const r0Match = catRounds[0].find(r0m => r0m.p1?.id === loser.id || r0m.p2?.id === loser.id);
          if (r0Match && (r0Match.p1?.isBye || r0Match.p2?.isBye)) {
             return loser;
          }
       }
       return null;
    }).filter(Boolean);

    const consPlayers = [...losersR0, ...losersR1WithBye];
    if (consPlayers.length < 2) {
        alert(`Faltan jugadores eliminados en sus primeros partidos para formar el cuadro de consolación de ${cat}.`);
        return;
    }

    let p = [...consPlayers];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    let pow = 2;
    while (pow < p.length) pow *= 2;
    const byesCount = pow - p.length;
    for (let i = 0; i < byesCount; i++) {
        p.push({ id: `cons-bye-${cat}-${i}`, name: '---', isBye: true });
    }

    const numRounds = Math.log2(pow);
    const newRounds = [];

    // Use shared helpers to get globalSlots and reconstruct full slotUsage
    // (accounting for ALL matches in ALL categories and existing consolation)
    const globalSlots = buildGlobalSlots();
    // Include the consolation bracket being generated in the snapshot
    // (consRounds doesn't have this cat yet, but we pass what we have)
    const slotUsage = buildSlotUsage(globalSlots, rounds, consRounds);

    
    for (let r = 0; r < numRounds; r++) {
      const numMatchesInRound = pow / Math.pow(2, r + 1);
      const matches = [];
      for (let m = 0; m < numMatchesInRound; m++) {
        matches.push({
          id: `cons-cat-${cat}-r${r}-m${m}`,
          round: r,
          matchIndex: m,
          p1: r === 0 ? p[m * 2] : null,
          p2: r === 0 ? p[m * 2 + 1] : null,
          winner: null,
          time: null,
          score: null
        });
      }
      newRounds.push(matches);
    }

    if (newRounds[0]) {
      newRounds[0].forEach(match => {
        if (match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye) {
           const p1Final = match.p1.finalSlots || [];
           const p2Final = match.p2.finalSlots || [];
           let common = p1Final.filter(s => p2Final.includes(s));
           if (common.length === 0) common = p1Final.length > 0 ? p1Final : (p2Final.length > 0 ? p2Final : globalSlots);
           const assignedTime = common.find(s => slotUsage[s] < tConfig.courtsCount);
           if (assignedTime) {
               slotUsage[assignedTime]++;
               match.time = `${assignedTime} - Pista ${slotUsage[assignedTime]}`;
           } else {
               match.time = "A convenir";
           }
        }
      });
    }

    if (newRounds[0]) {
       newRounds[0].forEach(match => {
          if (match.p1?.isBye && match.p2 && !match.p2.isBye) {
             advanceWinnerMut(newRounds, 0, match.matchIndex, match.p2);
          } else if (match.p2?.isBye && match.p1 && !match.p1.isBye) {
             advanceWinnerMut(newRounds, 0, match.matchIndex, match.p1);
          }
       });
    }

    setConsRounds(prev => ({...prev, [cat]: newRounds}));
  };

  const handleDownloadPDF = async (elementId, title) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    setIsExporting(elementId);
    
    // Pequeño retardo para asegurar que la UI se actualizó (escondiendo botones)
    setTimeout(async () => {
      try {
        const originalStyle = element.getAttribute('style');
        
        // Forzar expansión para captura completa si hay scroll horizontal
        element.style.width = 'max-content';
        element.style.minWidth = '1200px';
        element.style.padding = '3rem';
        element.style.backgroundColor = '#FFFFFF';

        const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgRatio = canvas.width / canvas.height;
        
        let finalWidth = pdfWidth;
        let finalHeight = finalWidth / imgRatio;
        
        if (finalHeight > pdfHeight) {
           finalHeight = pdfHeight;
           finalWidth = finalHeight * imgRatio;
        }
        
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;
        
        pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
        
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
        pdf.save(`Cuadro_${tConfig.name.replace(/\s+/g, '_')}_${safeTitle}.pdf`);
      } catch (err) {
        console.error("Error generating PDF:", err);
        alert("Hubo un error al generar el PDF.");
      } finally {
        element.removeAttribute('style');
        setIsExporting(false);
      }
    }, 100);
  };

  const getRoundName = (roundIndex, totalRounds) => {
    const roundsLeft = totalRounds - roundIndex;
    if (roundsLeft === 1) return 'Final';
    if (roundsLeft === 2) return 'Semifinales';
    if (roundsLeft === 3) return 'Cuartos de Final';
    if (roundsLeft === 4) return 'Octavos de Final';
    if (roundsLeft === 5) return 'Dieciseisavos';
    if (roundsLeft === 6) return 'Treintaidosavos';
    if (roundsLeft === 7) return 'Sesentaicuatroavos';
    return `Ronda ${roundIndex + 1}`;
  };

  const activeDays = (() => {
    const sIdx = DAYS.indexOf(tConfig.startDay);
    const eIdx = DAYS.indexOf(tConfig.endDay);
    if (sIdx <= eIdx) return DAYS.slice(sIdx, eIdx + 1);
    return [...DAYS.slice(sIdx), ...DAYS.slice(0, eIdx + 1)];
  })();

  const activeHours = (() => {
    const isFirstDay = selectedDay === tConfig.startDay;
    const startHourStr = isFirstDay && tConfig.firstDayStartHour ? tConfig.firstDayStartHour : tConfig.startHour;
    const sIdx = HOURS.indexOf(startHourStr);
    const eIdx = HOURS.indexOf(tConfig.endHour);
    if (sIdx <= eIdx) return HOURS.slice(sIdx, eIdx + 1);
    return HOURS;
  })();

  if (phase === 'config') {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
           <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
              ← Volver al panel de Todos los Torneos
           </button>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <p className="section-label" style={{ margin: 0 }}>Configuración del Torneo</p>
            {(participants.length > 0 || rounds.length > 0) && (
               <button onClick={handleResetTournament} style={{ padding: '0.4rem 0.8rem', borderRadius: '0.5rem', backgroundColor: '#FEE2E2', color: '#EF4444', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Borrar Torneo Viejo</button>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Nombre del Torneo</label>
              <input type="text" placeholder="Ej: Torneo Verano 2026" value={tConfig.name} onChange={e => setTConfig({...tConfig, name: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Categorías (separadas por comas)</label>
              <input type="text" placeholder="Ej: Masculino, Femenino, Mixto" value={tConfig.categories} onChange={e => setTConfig({...tConfig, categories: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Día Inicio</label>
                <select value={tConfig.startDay} onChange={e => setTConfig({...tConfig, startDay: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Día Fin</label>
                <select value={tConfig.endDay} onChange={e => setTConfig({...tConfig, endDay: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Horario Inicial (Diario)</label>
                <select value={tConfig.startHour} onChange={e => setTConfig({...tConfig, startHour: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {HOURS.slice(0, HOURS.length - 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Horario Final (Diario)</label>
                <select value={tConfig.endHour} onChange={e => setTConfig({...tConfig, endHour: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {HOURS.slice(HOURS.indexOf(tConfig.startHour) + 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                Hora de Inicio el 1º Día ({tConfig.startDay})
              </label>
              <select value={tConfig.firstDayStartHour || tConfig.startHour} onChange={e => setTConfig({...tConfig, firstDayStartHour: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                {HOURS.slice(0, HOURS.indexOf(tConfig.endHour)).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                * Frecuentemente los torneos empiezan por la tarde el primer día y por la mañana el resto.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Número de Pistas a utilizar</label>
              <select value={tConfig.courtsCount} onChange={e => setTConfig({...tConfig, courtsCount: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                <option value={1}>1 Pista (Pista 1 Indoor)</option>
                <option value={2}>2 Pistas (Indoor 1 y 2)</option>
                <option value={3}>3 Pistas (Añadir 1 Municipal)</option>
                <option value={4}>4 Pistas (Todas)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                Duración de cada partido
              </label>
              <select
                value={tConfig.matchDuration ?? 90}
                onChange={e => setTConfig({...tConfig, matchDuration: parseInt(e.target.value)})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}
              >
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos (1 hora)</option>
                <option value={75}>75 minutos</option>
                <option value={90}>90 minutos (1h 30min)</option>
                <option value={105}>105 minutos</option>
                <option value={120}>120 minutos (2 horas)</option>
              </select>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                Tiempo estimado por partido incluyendo calentamiento.
              </p>
            </div>
          </div>

          <button onClick={() => { 
              const initialStart = tConfig.firstDayStartHour || tConfig.startHour;
              setSelectedDay(tConfig.startDay); 
              setSelectedHourStart(initialStart);
              setSelectedHourEnd(HOURS[HOURS.indexOf(initialStart) + 1] || tConfig.endHour);
              setPhase('setup'); 
            }} 
            disabled={!tConfig.name.trim()} style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: 'none', backgroundColor: tConfig.name.trim() ? '#0F172A' : '#94A3B8', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: tConfig.name.trim() ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s' }}>
            Guardar Configuración y Continuar
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
           <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
              ← Volver al panel de Todos los Torneos
           </button>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p className="section-label" style={{ margin: 0 }}>{tConfig.name ? `Fase 2: Inscripción - ${tConfig.name}` : 'Inscripción de Torneo'}</p>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!publishedId ? (
              <button onClick={handlePublish} style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', backgroundColor: '#3B82F6', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Publicar Link
              </button>
            ) : (
              <button disabled style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Link Público Activo
              </button>
            )}
            
            {publishedId && (
              <button onClick={syncRegistrations} disabled={syncing} style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', backgroundColor: '#0F172A', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: syncing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Sincronizar (Web)
              </button>
            )}
          </div>
        </div>

        {publishedId && (
          <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '1rem', border: '1px dashed #CBD5E1', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Enlace para jugadores:</p>
              <a href={`${window.location.origin}/torneos/${publishedId}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem', color: '#2563EB', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>
                {window.location.host}/torneos/{publishedId}
              </a>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/torneos/${publishedId}`); alert('¡Enlace copiado al portapapeles!'); }} style={{ marginLeft: '1rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#334155', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              Copiar
            </button>
          </div>
        )}

        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <form onSubmit={addParticipant} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="Nombre de la pareja (Ej: Juan y Alberto)" 
                value={newCouple}
                onChange={(e) => setNewCouple(e.target.value)}
                style={{ flex: 2, minWidth: '200px', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem' }}
              />
              <select 
                value={newCoupleCategory} 
                onChange={(e) => setNewCoupleCategory(e.target.value)} 
                style={{ flex: 1, minWidth: '120px', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem' }}
              >
                <option value="">-- Elige Categoría --</option>
                {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button type="submit" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                Añadir
              </button>
            </div>
            
            <div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>No disponible (horas en las que <strong>no</strong> puede jugar):</p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <select 
                  value={selectedDay} 
                  onChange={e => setSelectedDay(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}
                >
                  {activeDays.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>de</span>
                <select 
                  value={selectedHourStart} 
                  onChange={e => setSelectedHourStart(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}
                >
                  {activeHours.slice(0, activeHours.length - 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>a</span>
                <select 
                  value={selectedHourEnd} 
                  onChange={e => setSelectedHourEnd(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}
                >
                  {activeHours.slice(activeHours.indexOf(selectedHourStart) + 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <button 
                  type="button" 
                  onClick={addPreference}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', opacity: 0.9 }}
                >
                  + Añadir
                </button>
              </div>

              {newPreferences.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {newPreferences.map(pref => (
                    <div key={pref.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#FEF2F2', border: '1.5px solid #DC2626', color: '#DC2626', padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {pref.label}
                      <button type="button" onClick={() => removePreference(pref.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7, marginLeft: '0.2rem' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>

          <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#64748B', fontSize: '0.85rem' }}>
              Elenco "{newCoupleCategory || 'Todas'}": {participants.filter(p => !newCoupleCategory || p.category === newCoupleCategory).length} parejas
              <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: '0.5rem' }}>(total: {participants.length})</span>
            </h4>
            {participants.filter(p => !newCoupleCategory || p.category === newCoupleCategory).length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontStyle: 'italic' }}>No hay parejas en esta categoría todavía.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {participants
                  .filter(p => !newCoupleCategory || p.category === newCoupleCategory)
                  .map((p, idx) => (
                  <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.9rem', display: 'block' }}>{idx + 1}. {p.name}</span>
                      <span style={{ display: 'inline-block', backgroundColor: '#E2E8F0', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginTop: '0.2rem', marginBottom: '0.1rem' }}>
                         {p.category}
                      </span>
                      {p.prefNames?.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: '#DC2626', display: 'block', marginTop: '0.2rem' }}>
                          No puede: {p.prefNames.join(', ')}
                        </span>
                      )}
                    </div>
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
          <button onClick={() => setPhase('config')} style={{ border: 'none', background: 'none', color: '#64748B', cursor: 'pointer', padding: '1rem 0 0 0', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}>
            ← Atrás a Configuración
          </button>
        </div>
      </div>
     </div>
    );
  }

  // BRACKET PHASE
  if (Object.keys(rounds).length === 0) {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
            ← Volver al panel de Todos los Torneos
          </button>
        </div>
        <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '1rem', border: '1px dashed #CBD5E1', maxWidth: '600px', margin: '0 auto' }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem' }}>⚠️ El cuadro está vacío</p>
          <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Puede que las categorías del torneo no coincidan con las de las parejas inscritas. Vuelve a inscripción, comprueba que cada pareja tenga una categoría correcta y vuelve a sortear.</p>
          <button onClick={() => setPhase('setup')} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
            ← Volver a Inscripción y Re-sortear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
         <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
            ← Volver al panel de Todos los Torneos
         </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Torneo: {tConfig.name}</h2>
          <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>{tConfig.startDay} a {tConfig.endDay} ({tConfig.startHour} - {tConfig.endHour})</p>
          <p style={{ margin: '0.1rem 0', fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
            ⏱ Duración por partido: <strong>{tConfig.matchDuration ?? 90} min</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>Haz clic en el ganador de cada partido para avanzar ronda.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isExporting && (
            <button 
              onClick={() => setPhase('setup')}
              style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Atrás a Inscripción
            </button>
          )}
        </div>
      </div>

      {Object.keys(rounds).map(cat => {
         const catRounds = rounds[cat] || [];
         const catCons = consRounds[cat] || [];
         if (catRounds.length === 0) return null;

         return (
            <div key={cat} style={{ marginBottom: '4rem' }}>
               <div style={{ padding: '1rem 1.5rem', backgroundColor: '#1E293B', color: 'white', borderRadius: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Categoría: {cat}</h2>
                  {!isExporting && catCons.length === 0 && (
                    <button onClick={() => generateConsolation(cat)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#F59E0B', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                      🏆 Generar Consolación ({cat})
                    </button>
                  )}
               </div>

              {[
                { title: `🥇 P. ${cat}`, data: catRounds, isCons: false, id: `export-main-${cat.replace(/\s+/g, '_')}` },
                { title: `🥈 C. ${cat}`, data: catCons, isCons: true, id: `export-cons-${cat.replace(/\s+/g, '_')}` }
              ].map(bracket => {
                if (!bracket.data || bracket.data.length === 0) return null;
                return (
                  <div id={bracket.id} key={bracket.title} style={{ padding: '1.5rem', backgroundColor: '#FAFAF9', borderRadius: '1rem', marginBottom: '3rem', borderTop: bracket.isCons ? '2px dashed #E2E8F0' : 'none', marginTop: bracket.isCons ? '2rem' : '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: bracket.isCons ? '#D97706' : '#0F172A' }}>
                        {isExporting === bracket.id ? `${tConfig.name} - ${bracket.title}` : bracket.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {!isExporting && (
                          <button onClick={() => handleDownloadPDF(bracket.id, bracket.title)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Exportar PDF
                          </button>
                        )}
                        {bracket.isCons && !isExporting && (
                           <button onClick={() => setConsRounds(prev => ({...prev, [cat]: []}))} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Restaurar Consolación</button>
                        )}
                      </div>
                    </div>
            
            <div style={{ display: 'flex', overflowX: 'auto', gap: '2.5rem', paddingBottom: '2rem', minHeight: '350px', alignItems: 'stretch' }}>
              {bracket.data.map((roundMatches, rIdx) => (
                <div key={`round-${rIdx}`} style={{ display: 'flex', flexDirection: 'column', minWidth: '220px' }}>
                  <h4 style={{ textAlign: 'center', color: '#16A34A', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem 0', padding: '0.35rem 0.75rem', backgroundColor: '#F0FDF4', borderRadius: '0.5rem', border: '1px solid #DCFCE7', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {getRoundName(rIdx, bracket.data.length)}
                  </h4>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                  {roundMatches.map(match => (
                    <div key={match.id} style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', margin: '1rem 0', opacity: match.p1?.isBye && match.p2?.isBye ? 0.3 : 1 }}>
                      {(!match.p1?.isBye && !match.p2?.isBye) && (
                        <div style={{ backgroundColor: '#F8FAFC', padding: '0.4rem 0.75rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {match.time || 'Horario por definir'}
                          </span>
                          {!isExporting && (
                             <button onClick={() => handleEditTime(match, bracket.isCons, cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.2rem' }}>
                               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                             </button>
                          )}
                        </div>
                      )}
                      
                      <div onClick={() => handleSetWinner(match, match.p1, bracket.isCons, cat)} style={{ padding: '0.6rem 0.75rem', backgroundColor: match.winner?.id === match.p1?.id ? (bracket.isCons ? '#FEF3C7' : '#DCFCE7') : 'transparent', borderBottom: '1.5px solid #F1F5F9', cursor: match.p1?.isBye ? 'default' : 'pointer', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: match.winner?.id === match.p1?.id ? 800 : 600, color: match.winner?.id === match.p1?.id ? (bracket.isCons ? '#D97706' : '#16A34A') : '#334155', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {match.p1 ? match.p1.name : '\u00A0'}
                        </span>
                        {match.score && (
                          <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                            {parseScore(match.score, 0).map((s, i) => (
                              <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, background: match.winner?.id === match.p1?.id ? (bracket.isCons ? '#F59E0B' : '#16A34A') : '#E2E8F0', color: match.winner?.id === match.p1?.id ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.3rem', minWidth: '1.2rem', textAlign: 'center' }}>{s}</span>
                            ))}
                          </div>
                        )}
                        {match.winner?.id === match.p1?.id && <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🏆</span>}
                      </div>

                      <div onClick={() => handleSetWinner(match, match.p2, bracket.isCons, cat)} style={{ padding: '0.6rem 0.75rem', backgroundColor: match.winner?.id === match.p2?.id ? (bracket.isCons ? '#FEF3C7' : '#DCFCE7') : '#F8FAFC', cursor: match.p2?.isBye ? 'default' : 'pointer', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: match.winner?.id === match.p2?.id ? 800 : 600, color: match.winner?.id === match.p2?.id ? (bracket.isCons ? '#D97706' : '#16A34A') : '#334155', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {match.p2 ? match.p2.name : '\u00A0'}
                        </span>
                        {match.score && (
                          <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                            {parseScore(match.score, 1).map((s, i) => (
                              <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, background: match.winner?.id === match.p2?.id ? (bracket.isCons ? '#F59E0B' : '#16A34A') : '#E2E8F0', color: match.winner?.id === match.p2?.id ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.3rem', minWidth: '1.2rem', textAlign: 'center' }}>{s}</span>
                            ))}
                          </div>
                        )}
                        {match.winner?.id === match.p2?.id && <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🏆</span>}
                      </div>

                      {(!match.p1?.isBye && !match.p2?.isBye) && !isExporting && (
                        <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid #F1F5F9' }}>
                          {editingScoreId === match.id ? (
                            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                              <input
                                autoFocus
                                type="text"
                                placeholder="Ej: 6-4 3-6 7-5"
                                value={scoreInput}
                                onChange={e => setScoreInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleScoreSubmit(match, scoreInput, bracket.isCons, cat);
                                  if (e.key === 'Escape') { setEditingScoreId(null); setScoreInput(''); }
                                }}
                                style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', fontSize: '0.78rem', fontFamily: 'inherit', minWidth: 0 }}
                              />
                              <button onClick={() => handleScoreSubmit(match, scoreInput, bracket.isCons, cat)} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#16A34A', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>✓</button>
                              <button onClick={() => { setEditingScoreId(null); setScoreInput(''); }} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: match.score ? '#64748B' : '#2563EB', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', padding: 0 }}>
                              {match.score ? '✎ Editar resultado' : '+ Añadir resultado'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '180px' }}>
                <h4 style={{ textAlign: 'center', color: bracket.isCons ? '#D97706' : '#F59E0B', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                  {bracket.isCons ? 'Campeón Consolación' : 'Campeón Absoluto'}
                </h4>
                <div style={{ backgroundColor: '#FEF3C7', border: `2px solid ${bracket.isCons ? '#D97706' : '#F59E0B'}`, borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#D97706' }}>
                    {bracket.data[bracket.data.length - 1]?.[0]?.winner?.name || 'TBD'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
            </div>
         );
      })}
    </div>
  );
};

const TournamentManager = () => {
  const [tournaments, setTournaments] = useState(() => {
    try {
      const saved = localStorage.getItem('padel_medina_tournaments_list');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    // Migration: si existe el torneo antiguo unificado, lo metemos en la lista.
    if (localStorage.getItem('padel_medina_current_tournament')) {
       const legacyData = JSON.parse(localStorage.getItem('padel_medina_current_tournament'));
       const legacyId = 'legacy_1';
       localStorage.setItem(`padel_medina_tournament_${legacyId}`, JSON.stringify(legacyData));
       localStorage.removeItem('padel_medina_current_tournament');
       const nName = legacyData.tConfig?.name || 'Torneo Activo';
       const newList = [{ id: legacyId, name: nName, date: new Date().toISOString() }];
       localStorage.setItem('padel_medina_tournaments_list', JSON.stringify(newList));
       return newList;
    }
    return [];
  });

  const [activeId, setActiveId] = useState(null);

  const createNewTournament = () => {
     const newId = Date.now().toString();
     const newList = [...tournaments, { id: newId, name: 'Nuevo Torneo', date: new Date().toISOString() }];
     setTournaments(newList);
     localStorage.setItem('padel_medina_tournaments_list', JSON.stringify(newList));
     setActiveId(newId);
  };

  const deleteTournament = (id) => {
     if (window.confirm('¿Estás seguro de que quieres eliminar este torneo permanentemente?')) {
        const newList = tournaments.filter(t => t.id !== id);
        setTournaments(newList);
        localStorage.setItem('padel_medina_tournaments_list', JSON.stringify(newList));
        localStorage.removeItem(`padel_medina_tournament_${id}`);
     }
  };

  const updateTournamentName = (id, newName) => {
     if (!newName) return;
     const newList = tournaments.map(t => t.id === id ? { ...t, name: newName } : t);
     setTournaments(newList);
     localStorage.setItem('padel_medina_tournaments_list', JSON.stringify(newList));
  };

  if (activeId) {
     return <TournamentEditor tournamentKey={activeId} onBack={(newName) => {
         if (newName) updateTournamentName(activeId, newName);
         setActiveId(null);
     }} />;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0F172A' }}>Mis Torneos</h1>
            <p style={{ margin: '0.2rem 0 0', color: '#64748B', fontSize: '0.9rem' }}>Gestiona tus competiciones activas y crea nuevas.</p>
          </div>
          <button onClick={createNewTournament} style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, cursor: 'pointer', border: 'none', boxShadow: '0 4px 6px -1px rgba(22,163,74,0.2)' }}>
             ➕ Crear Nuevo Torneo
          </button>
       </div>

       {tournaments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '1rem', border: '1px dashed #CBD5E1' }}>
             <p style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: 600 }}>No hay torneos creados activos.</p>
             <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Haz clic en el botón superior para empezar uno nuevo.</p>
          </div>
       ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
             {tournaments.map(t => (
                <div key={t.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1E293B' }}>{t.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Creado: {new Date(t.date).toLocaleDateString()}</span>
                   </div>
                   <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      <button onClick={() => setActiveId(t.id)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: '#0F172A', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                         Abrir / Editar
                      </button>
                      <button onClick={() => deleteTournament(t.id)} style={{ padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: '#FEE2E2', color: '#EF4444', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                   </div>
                </div>
             ))}
          </div>
       )}
    </div>
  );
};

export default TournamentManager;
