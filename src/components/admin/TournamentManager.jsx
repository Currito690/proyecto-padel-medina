import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';

const HOURS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', 
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

const fmtDateLabel = (d) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

const getActiveDates = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const result = [];
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    result.push(fmtDateLabel(d));
  return result;
};

const fmtDateDisplay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

const TournamentEditor = ({ tournamentKey, onBack }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [editingScoreId, setEditingScoreId] = useState(null);
  const [scoreInput, setScoreInput] = useState('');
  const [swapMode, setSwapMode] = useState({}); // keyed by `${isCons}-${cat}`
  const [selectedSwapSlot, setSelectedSwapSlot] = useState(null); // {key, cat, isCons, matchIdx, side}
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
  const [phase, setPhase] = useState(savedData?.phase || 'config');
  // publishedId == tournamentKey desde el momento que el torneo existe en DB
  // (todos se crean ya en Supabase). Se mantiene como estado por compatibilidad.
  const [publishedId, setPublishedId] = useState(tournamentKey);
  const [syncing, setSyncing] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbStatus, setDbStatus] = useState('draft');
  
  const [tConfig, setTConfig] = useState(() => {
    const fallback = {
      name: '',
      categories: 'Masculino, Femenino',
      startDate: '', endDate: '',
      registrationDeadline: '',
      startHour: '09:00', endHour: '22:00',
      firstDayStartHour: '16:00',
      courtsCount: 2,
      courtStartHours: {},
      matchDurationByCategory: { 'Masculino': 90, 'Femenino': 90 },
      formatByCategory: {},
      dualCategoryMaxMatches: 1,
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

  const [editingParticipant, setEditingParticipant] = useState(null);
  const [gridBlockedSlots, setGridBlockedSlots] = useState(new Set());
  const [gridDragging, setGridDragging] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityCategory, setAvailabilityCategory] = useState('');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [gridDragAction, setGridDragAction] = useState(null);

  useEffect(() => {
    localStorage.setItem(`padel_medina_tournament_${tournamentKey}`, JSON.stringify({ phase, tConfig, participants, rounds, consRounds, publishedId }));
  }, [phase, tConfig, participants, rounds, consRounds, publishedId, tournamentKey]);

  // Fetch desde Supabase al montar. La DB es la fuente de verdad: si trae datos,
  // sobrescribe el estado local para que lo que se haya guardado desde otro
  // dispositivo se refleje al abrir el editor aquí.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('tournaments')
          .select('config, status, name')
          .eq('id', tournamentKey)
          .single();
        if (cancelled) return;
        if (error) {
          console.warn('No se pudo cargar el torneo desde DB:', error.message);
          setDbLoaded(true);
          return;
        }
        if (data) {
          setDbStatus(data.status || 'draft');
          const cfg = data.config || {};
          const hasDbData = !!(cfg.startDate || cfg.name || cfg.categories
            || (cfg.rounds && Object.keys(cfg.rounds).length)
            || (cfg.participants && cfg.participants.length));
          if (hasDbData) {
            const { rounds: dbRounds, consRounds: dbConsRounds, participants: dbParticipants, phase: dbPhase, ...dbTConfig } = cfg;
            if (data.name && !dbTConfig.name) dbTConfig.name = data.name;
            setTConfig(prev => ({ ...prev, ...dbTConfig }));
            if (dbRounds && typeof dbRounds === 'object') setRounds(dbRounds);
            if (dbConsRounds && typeof dbConsRounds === 'object') setConsRounds(dbConsRounds);
            if (Array.isArray(dbParticipants)) setParticipants(dbParticipants);
            if (dbPhase) setPhase(dbPhase);
          }
        }
        setDbLoaded(true);
      } catch (e) {
        console.warn('Error cargando torneo:', e);
        setDbLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [tournamentKey]);

  // Autosave a Supabase (debounced 1.2s) — solo después de haber cargado de DB
  // para no pisar datos remotos con estado local inicial.
  useEffect(() => {
    if (!dbLoaded) return;
    const timer = setTimeout(() => {
      const config = { ...tConfig, rounds, consRounds, participants, phase };
      supabase.from('tournaments')
        .update({ config, name: tConfig.name || 'Torneo' })
        .eq('id', tournamentKey)
        .then(({ error }) => { if (error) console.warn('Autosave torneo falló:', error.message); });
    }, 1200);
    return () => clearTimeout(timer);
  }, [dbLoaded, tournamentKey, tConfig, rounds, consRounds, participants, phase]);

  // Helper: get available courts count for a given slot hour
  const getAvailableCourtsForHour = (hourStr, courtsCount, courtStartHours) => {
    if (!courtStartHours || Object.keys(courtStartHours).length === 0) return courtsCount;
    let count = 0;
    for (let c = 1; c <= courtsCount; c++) {
      const courtStart = courtStartHours[c] || tConfig.startHour;
      if (hourStr >= courtStart) count++;
    }
    return Math.max(count, 0);
  };

  // Supabase Realtime: auto-sync inscriptions when panel is open
  useEffect(() => {
    if (!publishedId || !showAvailability) return;
    const channel = supabase
      .channel(`tournament-avail-${publishedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tournament_registrations',
        filter: `tournament_id=eq.${publishedId}`
      }, (payload) => {
        const reg = payload.new;
        if (!reg) return;
        const prefRules = reg.unavailable_times || [];
        const prefNames = prefRules.map(p => p.label);
        const newP = {
          id: reg.id,
          name: `${reg.player1_name} y ${reg.player2_name}`,
          category: reg.category,
          prefRules,
          prefNames
        };
        setParticipants(prev => {
          if (prev.some(p => p.id === reg.id || p.name === newP.name)) return prev;
          return [...prev, newP];
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [publishedId, showAvailability]);

  const handleResetTournament = () => {
    if (window.confirm('¿Estás seguro de que quieres borrar este torneo y empezar uno nuevo? Se perderán todas las parejas y el cuadro generado.')) {
      localStorage.removeItem(`padel_medina_tournament_${tournamentKey}`);
      setPhase('config');
      setTConfig({ name: '', categories: 'Masculino, Femenino', startDate: '', endDate: '', registrationDeadline: '', startHour: '09:00', endHour: '22:00', firstDayStartHour: '16:00', courtsCount: 2, courtStartHours: {}, matchDurationByCategory: { 'Masculino': 90, 'Femenino': 90 } });
      setParticipants([]);
      setRounds({});
      setConsRounds({});
      setNewCouple('');
      setNewCoupleCategory('');
      setPublishedId(null);
    }
  };

  const handlePublish = async () => {
    try {
      const config = { ...tConfig, rounds, consRounds, participants, phase };
      const { error } = await supabase.from('tournaments')
        .update({ name: tConfig.name || 'Torneo', config, status: 'open' })
        .eq('id', tournamentKey);
      if (error) throw error;
      setPublishedId(tournamentKey);
      setDbStatus('open');
      alert('¡Torneo publicado! Ya aparece en la página pública y puedes enviar el enlace a los jugadores.');
    } catch (e) {
      console.error(e);
      alert('Error al publicar el torneo: ' + (e.message || e));
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

  const handleUpdateDeadline = async () => {
    if (!publishedId) return;
    try {
      const { error } = await supabase.from('tournaments')
        .update({ config: { ...tConfig, rounds, consRounds } })
        .eq('id', publishedId);
      if (error) throw error;
      alert('Plazo de inscripción actualizado.');
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el plazo.');
    }
  };

  const handlePublishBracket = async () => {
    if (!publishedId) {
      alert('Primero debes publicar el torneo (Fase 2).');
      return;
    }
    try {
      const { error } = await supabase.from('tournaments')
        .update({ config: { ...tConfig, rounds, consRounds } })
        .eq('id', publishedId);
      if (error) throw error;
      alert('¡Cuadro publicado! Los jugadores pueden verlo en:\n/torneos/' + publishedId + '/cuadro');
    } catch (e) {
      console.error(e);
      alert('Error al publicar el cuadro.');
    }
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
      prefRules: [],
      prefNames: []
    }]);
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
    if (!tConfig.startDate || !tConfig.endDate) {
      alert("Configura las fechas de inicio y fin del torneo antes de generar el cuadro.\n\nVuelve a Configuración y rellena los campos 'Fecha de Inicio' y 'Fecha de Fin'.");
      return;
    }
    try {
    let p = [...participants];
    // Barajar aleatoriamente
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Calcular potencia de 2 más cercana (4, 8, 16, 32...) no se hace globalmente
    // Rellenar huecos vacíos tampoco
    
    // 1) Generar los slots globales del torneo en base a la configuración
    const sHourIdx = HOURS.indexOf(tConfig.startHour);
    const eHourIdx = HOURS.indexOf(tConfig.endHour);
    const firstDayHourIdx = tConfig.firstDayStartHour ? HOURS.indexOf(tConfig.firstDayStartHour) : sHourIdx;
    const activeDateList = getActiveDates(tConfig.startDate, tConfig.endDate);

    let globalSlots = [];
    activeDateList.forEach((dateLabel, idx) => {
      const actualStartHourIdx = idx === 0 ? firstDayHourIdx : sHourIdx;
      for (let h = actualStartHourIdx; h < eHourIdx; h++) {
        if (h >= 0 && h < HOURS.length) globalSlots.push(`${dateLabel} ${HOURS[h]}`);
      }
    });
    
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

    // pickSlot now respects per-court start hours
     const pickSlot = (candidates, usage, courts) => {
       if (!globalSlots.length) return 'Sin horario';
       const getCapacity = (slot) => {
         const hourPart = slot.split(' ')[1];
         return getAvailableCourtsForHour(hourPart, courts, tConfig.courtStartHours);
       };
       const free = (candidates.length ? candidates : globalSlots).find(s => (usage[s] ?? 0) < getCapacity(s));
       if (free) return free;
       const globalFree = globalSlots.find(s => (usage[s] ?? 0) < getCapacity(s));
       if (globalFree) return globalFree;
       // Extend beyond tournament end hour/day
       const lastSlot = globalSlots[globalSlots.length - 1];
       const [lastDateLabel, lastHour] = lastSlot.split(' ');
       const lastHourIdx = HOURS.indexOf(lastHour);
       for (let h = lastHourIdx + 1; h < HOURS.length; h++) {
         const s = `${lastDateLabel} ${HOURS[h]}`;
         if ((usage[s] ?? 0) < getCapacity(s)) return s;
       }
       const [ld, lm] = lastDateLabel.split('/').map(Number);
       const lastDateObj = new Date(new Date().getFullYear(), lm - 1, ld);
       for (let extra = 1; extra <= 30; extra++) {
         const next = new Date(lastDateObj);
         next.setDate(lastDateObj.getDate() + extra);
         const nextLabel = fmtDateLabel(next);
         for (let h = 0; h < HOURS.length; h++) {
           const s = `${nextLabel} ${HOURS[h]}`;
           if ((usage[s] ?? 0) < getCapacity(s)) return s;
         }
       }
       return lastSlot;
     };

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
       if (catParts.length < 2) return;

       const format = tConfig.formatByCategory?.[cat] || 'eliminatoria';

       if (format === 'liguilla') {
         // Round-robin: circle method
         let pool = [...catParts];
         if (pool.length % 2 !== 0) pool.push({ id: `bye-rr-${cat}`, name: '---', isBye: true });
         const n = pool.length;
         const rrCatRounds = [];
         for (let r = 0; r < n - 1; r++) {
           const roundMatches = [];
           for (let i = 0; i < n / 2; i++) {
             const t1 = pool[i];
             const t2 = pool[n - 1 - i];
             if (t1.isBye || t2.isBye) continue;
             const p1Slots = t1.finalSlots?.length ? t1.finalSlots : globalSlots;
             const p2Slots = t2.finalSlots?.length ? t2.finalSlots : globalSlots;
             let common = p1Slots.filter(s => p2Slots.includes(s));
             if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);
             const assigned = pickSlot(common, slotUsage, tConfig.courtsCount);
             slotUsage[assigned] = (slotUsage[assigned] ?? 0) + 1;
             roundMatches.push({
               id: `rr-${cat}-r${r}-m${roundMatches.length}`,
               round: r, matchIndex: roundMatches.length,
               p1: t1, p2: t2, winner: null, score: null, isRR: true,
               time: `${assigned} - Pista ${Math.min(slotUsage[assigned], tConfig.courtsCount)}`,
             });
           }
           if (roundMatches.length > 0) rrCatRounds.push(roundMatches);
           const last = pool.pop();
           pool.splice(1, 0, last);
         }
         newAllRounds[cat] = rrCatRounds;
         return;
       }

       // Calcular potencia de 2 más cercana (eliminatoria)
       let pow = 2;
       while (pow < catParts.length) pow *= 2;

       const byesCount = pow - catParts.length;
       // Intercalar BYEs entre parejas reales para evitar partidos BYE vs BYE
       // y que ninguna pareja llegue a la final sin haber jugado antes
       const paddedParts = [];
       let byeAdded = 0;
       for (let i = 0; i < catParts.length; i++) {
         paddedParts.push(catParts[i]);
         if (byeAdded < byesCount) {
           paddedParts.push({ id: `bye-${cat}-${byeAdded}`, name: '---', isBye: true });
           byeAdded++;
         }
       }
       catParts = paddedParts;
       
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
              const assignedTime = pickSlot(common, slotUsage, tConfig.courtsCount);
              slotUsage[assignedTime] = (slotUsage[assignedTime] ?? 0) + 1;
              match.time = `${assignedTime} - Pista ${Math.min(slotUsage[assignedTime], tConfig.courtsCount)}`;
           }
         });
       }

       // Pre-assign slots for rounds 1+ so the full schedule is visible upfront
       for (let r = 1; r < catRounds.length; r++) {
         catRounds[r].forEach(match => {
           const slot = pickSlot(globalSlots, slotUsage, tConfig.courtsCount);
           slotUsage[slot] = (slotUsage[slot] ?? 0) + 1;
           match.time = `${slot} - Pista ${Math.min(slotUsage[slot], tConfig.courtsCount)}`;
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
    } catch (err) {
      console.error('generateBracket error:', err);
      alert('Error al generar el cuadro: ' + (err?.message || String(err)));
    }
  };

  const handleSwapPlayers = (cat, isCons, matchIdx, side) => {
    const key = `${isCons}-${cat}`;
    if (!selectedSwapSlot) {
      setSelectedSwapSlot({ key, cat, isCons, matchIdx, side });
      return;
    }
    // Cancel if clicking the same slot
    if (selectedSwapSlot.key === key && selectedSwapSlot.matchIdx === matchIdx && selectedSwapSlot.side === side) {
      setSelectedSwapSlot(null);
      return;
    }
    // Only swap within the same bracket
    if (selectedSwapSlot.key !== key) {
      setSelectedSwapSlot({ key, cat, isCons, matchIdx, side });
      return;
    }
    const targetRoundsGlob = isCons ? consRounds : rounds;
    const targetRounds = targetRoundsGlob[cat];
    const newRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    const match1 = newRounds[0][selectedSwapSlot.matchIdx];
    const match2 = newRounds[0][matchIdx];
    const player1 = match1[selectedSwapSlot.side];
    const player2 = match2[side];
    match1[selectedSwapSlot.side] = player2;
    match2[side] = player1;
    if (isCons) setConsRounds({ ...consRounds, [cat]: newRounds });
    else setRounds({ ...rounds, [cat]: newRounds });
    setSelectedSwapSlot(null);
  };

  const toggleSwapMode = (key) => {
    setSwapMode(prev => ({ ...prev, [key]: !prev[key] }));
    setSelectedSwapSlot(null);
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
      if (match.isRR) {
        nextRounds[match.round][match.matchIndex].winner = winner;
        if (isCons) setConsRounds({ ...consRounds, [cat]: nextRounds });
        else setRounds({ ...rounds, [cat]: nextRounds });
        return;
      }
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
          let assigned = common.find(s => (slotUsage[s] ?? 0) < tConfig.courtsCount);
          if (!assigned) assigned = globalSlots.find(s => (slotUsage[s] ?? 0) < tConfig.courtsCount);
          if (!assigned) assigned = globalSlots[globalSlots.length - 1];
          nextMatch.time = `${assigned} - Pista ${Math.min((slotUsage[assigned] ?? 0) + 1, tConfig.courtsCount)}`;
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
    const sHourIdx = HOURS.indexOf(tConfig.startHour);
    const eHourIdx = HOURS.indexOf(tConfig.endHour);
    const firstDayHourIdx = tConfig.firstDayStartHour ? HOURS.indexOf(tConfig.firstDayStartHour) : sHourIdx;
    const slots = [];
    getActiveDates(tConfig.startDate, tConfig.endDate).forEach((dateLabel, idx) => {
      const actualStart = idx === 0 ? firstDayHourIdx : sHourIdx;
      for (let h = actualStart; h < eHourIdx; h++) {
        if (h >= 0 && h < HOURS.length) slots.push(`${dateLabel} ${HOURS[h]}`);
      }
    });
    return slots;
  };

  const handleSetWinner = (match, participant, isCons = false, cat) => {
    if (!participant || participant.isBye) return;
    const targetRoundsGlob = isCons ? consRounds : rounds;
    const targetRounds = targetRoundsGlob[cat];
    const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    if (match.isRR) {
      nextRounds[match.round][match.matchIndex].winner = participant;
      if (isCons) setConsRounds({ ...consRounds, [cat]: nextRounds });
      else setRounds({ ...rounds, [cat]: nextRounds });
      return;
    }
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

        const assigned = common.find(s => slotUsage[s] !== undefined && slotUsage[s] < tConfig.courtsCount)
          || common.reduce((min, s) => (slotUsage[s] ?? 0) < (slotUsage[min] ?? 0) ? s : min, common[0] || globalSlots[0]);
        nextMatch.time = assigned ? `${assigned} - Pista ${Math.min((slotUsage[assigned] ?? 0) + 1, tConfig.courtsCount)}` : '';
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

    let consPlayers = [...losersR0, ...losersR1WithBye];

    // Si aún no hay eliminados, generar el cuadro con marcadores de posición
    // basados en los participantes de la categoría (para poder programar horarios)
    if (consPlayers.length < 2) {
      const catParticipants = participants.filter(p => p.category === cat);
      if (catParticipants.length < 2) {
        alert(`No hay suficientes participantes en la categoría "${cat}" para generar el cuadro de consolación.`);
        return;
      }
      // Crear placeholders: "Perdedor P.X" para cada pareja esperada
      const expectedLosers = Math.ceil(catParticipants.length / 2);
      consPlayers = catParticipants.slice(0, expectedLosers).map((_part, i) => ({
        id: `cons-placeholder-${cat}-${i}`,
        name: `Perdedor P.${i + 1}`,
        isPlaceholder: true,
      }));
    }

    let p = [...consPlayers];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    let pow = 2;
    while (pow < p.length) pow *= 2;
    const byesCount = pow - p.length;
    // Intercalar BYEs entre parejas reales para evitar BYE vs BYE
    // y que ninguna pareja llegue directamente a la final sin jugar
    const paddedP = [];
    let byeAdded = 0;
    for (let i = 0; i < p.length; i++) {
      paddedP.push(p[i]);
      if (byeAdded < byesCount) {
        paddedP.push({ id: `cons-bye-${cat}-${byeAdded}`, name: '---', isBye: true });
        byeAdded++;
      }
    }
    p = paddedP;

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
           const assignedTime = pickSlot(common, slotUsage, tConfig.courtsCount);
           slotUsage[assignedTime] = (slotUsage[assignedTime] ?? 0) + 1;
           match.time = `${assignedTime} - Pista ${Math.min(slotUsage[assignedTime], tConfig.courtsCount)}`;
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

  const activeDays = getActiveDates(tConfig.startDate, tConfig.endDate);

  const getHoursForDay = (day) => {
    const isFirst = day === activeDays[0];
    const startH = isFirst && tConfig.firstDayStartHour ? tConfig.firstDayStartHour : tConfig.startHour;
    const sIdx = HOURS.indexOf(startH);
    const eIdx = HOURS.indexOf(tConfig.endHour);
    if (sIdx < 0 || eIdx < 0) return HOURS;
    return HOURS.slice(sIdx, eIdx + 1);
  };

  const allGridHours = (() => {
    let minIdx = HOURS.length;
    let maxIdx = 0;
    activeDays.forEach(day => {
      const hrs = getHoursForDay(day);
      if (hrs.length > 0) {
        minIdx = Math.min(minIdx, HOURS.indexOf(hrs[0]));
        maxIdx = Math.max(maxIdx, HOURS.indexOf(hrs[hrs.length - 1]));
      }
    });
    return minIdx >= HOURS.length ? HOURS : HOURS.slice(minIdx, maxIdx + 1);
  })();

  const openEditGrid = (participant) => {
    const blocked = new Set();
    (participant.prefRules || []).forEach(rule => rule.slots.forEach(slot => blocked.add(slot)));
    setGridBlockedSlots(blocked);
    setEditingParticipant(participant);
  };

  const hoursToRanges = (hours) => {
    const ranges = [];
    let i = 0;
    while (i < hours.length) {
      let j = i;
      while (j + 1 < hours.length && HOURS.indexOf(hours[j + 1]) === HOURS.indexOf(hours[j]) + 1) j++;
      const endIdx = HOURS.indexOf(hours[j]);
      const endH = endIdx < HOURS.length - 1 ? HOURS[endIdx + 1] : hours[j];
      ranges.push(`${hours[i]}-${endH}`);
      i = j + 1;
    }
    return ranges;
  };

  const saveEditGrid = () => {
    const byDay = {};
    activeDays.forEach(day => {
      const blocked = getHoursForDay(day).filter(h => gridBlockedSlots.has(`${day} ${h}`));
      if (blocked.length > 0) byDay[day] = blocked;
    });
    const prefRules = Object.entries(byDay).map(([day, hours]) => {
      const ranges = hoursToRanges(hours);
      return {
        id: `${day}-${Date.now()}`,
        day,
        label: `${day}: ${ranges.join(', ')}`,
        slots: hours.map(h => `${day} ${h}`),
      };
    });
    setParticipants(prev => prev.map(p =>
      p.id === editingParticipant.id ? { ...p, prefRules, prefNames: prefRules.map(r => r.label) } : p
    ));
    setEditingParticipant(null);
    setGridBlockedSlots(new Set());
  };

  const handleCellMouseDown = (day, hour) => {
    const key = `${day} ${hour}`;
    const action = gridBlockedSlots.has(key) ? 'unblock' : 'block';
    setGridDragAction(action);
    setGridDragging(true);
    setGridBlockedSlots(prev => {
      const next = new Set(prev);
      if (action === 'block') next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleCellMouseEnter = (day, hour) => {
    if (!gridDragging) return;
    const key = `${day} ${hour}`;
    setGridBlockedSlots(prev => {
      const next = new Set(prev);
      if (gridDragAction === 'block') next.add(key); else next.delete(key);
      return next;
    });
  };


  if (phase === 'config') {
    return (
      <div>
      <style>{`
        .tm-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .tm-header-info { flex: 1; min-width: 0; }
        .tm-btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-start; flex-shrink: 0; }
        .tm-section-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .tm-date-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .tm-date-row > div { flex: 1; min-width: 140px; }
        .tm-time-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .tm-time-row > div { flex: 1; min-width: 120px; }
        .tm-add-form { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .tm-add-form input { flex: 2; min-width: 160px; }
        .tm-add-form select { flex: 1; min-width: 110px; }
        .tm-deadline-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .tm-deadline-row input { flex: 1; min-width: 130px; }
        .tm-fmt-row {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 0.625rem;
        }
        .tm-fmt-label {
          flex-shrink: 0;
          min-width: 100px;
          font-size: 0.9rem;
          font-weight: 700;
          color: #1E293B;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tm-fmt-select {
          flex: 1;
          min-width: 0;
          min-height: 44px;
          padding: 0.5rem 0.75rem;
          padding-right: 2rem;
          border-radius: 0.5rem;
          border: 1.5px solid #CBD5E1;
          background-color: white;
          color: #0F172A;
          font-weight: 600;
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
        }
        @media (max-width: 480px) {
          .tm-btn-group button { font-size: 0.75rem !important; padding: 0.5rem 0.65rem !important; }
          .tm-header-info h2 { font-size: 1.15rem !important; }
          .tm-fmt-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.4rem;
            padding: 0.75rem;
          }
          .tm-fmt-label { min-width: 0; }
        }
      `}</style>
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

            <div className="tm-date-row">
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Fecha de Inicio</label>
                <input type="date" value={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, startDate: e.target.value, endDate: tConfig.endDate && tConfig.endDate < e.target.value ? e.target.value : tConfig.endDate})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Fecha de Fin</label>
                <input type="date" value={tConfig.endDate || ''} min={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, endDate: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Plazo de Inscripción</label>
              <input type="date" value={tConfig.registrationDeadline || ''} max={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, registrationDeadline: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }} />
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>Fecha límite para inscripciones online. Los jugadores no podrán inscribirse después de este día.</p>
            </div>

            <div className="tm-time-row">
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Horario Inicial (Diario)</label>
                <select value={tConfig.startHour} onChange={e => setTConfig({...tConfig, startHour: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {HOURS.slice(0, HOURS.length - 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Horario Final (Diario)</label>
                <select value={tConfig.endHour} onChange={e => setTConfig({...tConfig, endHour: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', cursor: 'pointer' }}>
                  {HOURS.slice(HOURS.indexOf(tConfig.startHour) + 1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                Hora de Inicio el 1º Día {tConfig.startDate ? `(${fmtDateDisplay(tConfig.startDate)})` : ''}
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

            {tConfig.courtsCount >= 2 && (
              <div style={{ padding: '1rem', backgroundColor: '#FFFAF0', borderRadius: '0.75rem', border: '1px solid #FED7AA' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 800, color: '#9A3412' }}>
                  🕐 Hora de inicio por pista (opcional)
                </label>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#C2410C', lineHeight: 1.5 }}>
                  Si alguna pista no está disponible desde el inicio, indica a partir de qué hora se puede utilizar. Por defecto usan el horario general.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {Array.from({ length: tConfig.courtsCount }, (_, i) => i + 1).map(courtNum => (
                    <div key={courtNum} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ minWidth: '80px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>Pista {courtNum}</span>
                      <select
                        value={tConfig.courtStartHours?.[courtNum] || tConfig.startHour}
                        onChange={e => setTConfig({
                          ...tConfig,
                          courtStartHours: {
                            ...tConfig.courtStartHours,
                            [courtNum]: e.target.value
                          }
                        })}
                        style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #FED7AA', fontSize: '0.875rem', cursor: 'pointer', backgroundColor: 'white' }}
                      >
                        {HOURS.slice(HOURS.indexOf(tConfig.startHour), HOURS.indexOf(tConfig.endHour) + 1).map(h => (
                          <option key={h} value={h}>Desde las {h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                ⏱ Duración de partido por categoría
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(cat => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ minWidth: '100px', fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>{cat}</span>
                    <select
                      value={tConfig.matchDurationByCategory?.[cat] ?? 90}
                      onChange={e => setTConfig({
                        ...tConfig,
                        matchDurationByCategory: {
                          ...tConfig.matchDurationByCategory,
                          [cat]: parseInt(e.target.value)
                        }
                      })}
                      style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', fontSize: '0.875rem', cursor: 'pointer', backgroundColor: 'white' }}
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min (1h)</option>
                      <option value={75}>75 min</option>
                      <option value={90}>90 min (1h 30min)</option>
                      <option value={105}>105 min</option>
                      <option value={120}>120 min (2h)</option>
                    </select>
                  </div>
                ))}
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                Tiempo estimado por partido incluyendo calentamiento, por cada categoría.
              </p>
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                Formato por categoría
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(cat => (
                  <div key={cat} className="tm-fmt-row">
                    <span className="tm-fmt-label">{cat}</span>
                    <select
                      value={tConfig.formatByCategory?.[cat] || 'eliminatoria'}
                      onChange={e => setTConfig({ ...tConfig, formatByCategory: { ...tConfig.formatByCategory, [cat]: e.target.value } })}
                      className="tm-fmt-select"
                    >
                      <option value="eliminatoria">Eliminatoria (cuadro)</option>
                      <option value="liguilla">Liguilla (todos contra todos)</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#FFF7ED', borderRadius: '0.75rem', border: '1px solid #FED7AA' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#9A3412' }}>
                Jugadores en dos categorías
              </label>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#C2410C', lineHeight: 1.5 }}>
                Nº máximo de partidos simultáneos para un jugador inscrito en dos categorías.
              </p>
              <select
                value={tConfig.dualCategoryMaxMatches ?? 1}
                onChange={e => setTConfig({ ...tConfig, dualCategoryMaxMatches: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #FED7AA', fontSize: '0.875rem', cursor: 'pointer', backgroundColor: 'white' }}
              >
                <option value={1}>1 — No puede coincidir con otro partido suyo</option>
                <option value={2}>2 — Puede jugar en ambas categorías a la vez</option>
              </select>
            </div>

          </div>

          <button onClick={() => setPhase('setup')}
            disabled={!tConfig.name.trim()} style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: 'none', backgroundColor: tConfig.name.trim() ? '#0F172A' : '#94A3B8', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: tConfig.name.trim() ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s' }}>
            Guardar Configuración y Continuar
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div onMouseUp={() => setGridDragging(false)}>
      <style>{`
        .tm-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .tm-header-info { flex: 1; min-width: 0; }
        .tm-btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-start; flex-shrink: 0; }
        .tm-section-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .tm-add-form { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .tm-add-form input { flex: 2; min-width: 160px; }
        .tm-add-form select { flex: 1; min-width: 110px; }
        .tm-deadline-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .tm-deadline-row input { flex: 1; min-width: 130px; }
        @media (max-width: 480px) {
          .tm-btn-group button { font-size: 0.75rem !important; padding: 0.5rem 0.65rem !important; }
        }
      `}</style>

      {/* ── Editar pareja modal ── */}
      {editingParticipant && (() => {
        const nameParts = editingParticipant.name.split(' y ');
        const p1 = nameParts[0]?.trim() || 'Jugador 1';
        const p2 = nameParts.slice(1).join(' y ').trim() || 'Jugador 2';
        return (
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
            onMouseUp={() => setGridDragging(false)}
          >
            <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '680px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginTop: '1rem', marginBottom: '1rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>Editar pareja</h3>
                <button onClick={() => { setEditingParticipant(null); setGridBlockedSlots(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
              </div>

              <div style={{ padding: '1.25rem 1.5rem' }}>
                {/* Players */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  {[{ label: 'Jugador 1', name: p1 }, { label: 'Jugador 2', name: p2 }].map(({ label, name }) => (
                    <div key={label} style={{ border: '1.5px solid #E2E8F0', borderRadius: '0.875rem', padding: '1rem' }}>
                      <p style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#16A34A,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>{name}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Warning */}
                <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400E', lineHeight: 1.5 }}>
                    A continuación se muestran los horarios disponibles del torneo. Selecciona las celdas en las que la pareja <strong>NO PUEDE JUGAR</strong>. Puedes arrastrar para seleccionar múltiples horas.
                  </p>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: '#FED7AA', border: '1px solid #F97316' }} />
                    No puede jugar
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: '#DCFCE7', border: '1px solid #86EFAC' }} />
                    Disponible
                  </div>
                </div>

                {/* Calendar grid */}
                <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', userSelect: 'none' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ padding: '0.5rem 0.75rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '52px' }}>Hora</th>
                        {activeDays.map(day => (
                          <th key={day} style={{ padding: '0.5rem 0.5rem', color: '#0F172A', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '80px' }}>
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allGridHours.map((hour, hIdx) => (
                        <tr key={hour} style={{ backgroundColor: hIdx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                          <td style={{ padding: '0.2rem 0.75rem', color: '#64748B', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{hour}</td>
                          {activeDays.map(day => {
                            const isValid = getHoursForDay(day).includes(hour);
                            const isBlocked = gridBlockedSlots.has(`${day} ${hour}`);
                            return (
                              <td key={day} style={{ padding: '0.2rem 0.35rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0' }}>
                                <div
                                  onMouseDown={isValid ? () => handleCellMouseDown(day, hour) : undefined}
                                  onMouseEnter={isValid ? () => handleCellMouseEnter(day, hour) : undefined}
                                  style={{
                                    height: '26px',
                                    borderRadius: '4px',
                                    cursor: isValid ? 'pointer' : 'default',
                                    backgroundColor: !isValid ? '#F1F5F9' : isBlocked ? '#FED7AA' : '#DCFCE7',
                                    border: `1px solid ${!isValid ? '#E2E8F0' : isBlocked ? '#F97316' : '#86EFAC'}`,
                                    transition: 'background-color 0.08s',
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Blocked summary */}
                {gridBlockedSlots.size > 0 && (
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>
                    {gridBlockedSlots.size} hora{gridBlockedSlots.size !== 1 ? 's' : ''} bloqueada{gridBlockedSlots.size !== 1 ? 's' : ''}
                  </p>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setEditingParticipant(null); setGridBlockedSlots(new Set()); }}
                    style={{ padding: '0.7rem 1.25rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveEditGrid}
                    style={{ padding: '0.7rem 1.5rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
        <div style={{ marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
           <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
              ← Volver al panel de Todos los Torneos
           </button>
        </div>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="tm-section-header">
          <p className="section-label" style={{ margin: 0 }}>{tConfig.name ? `Fase 2: Inscripción - ${tConfig.name}` : 'Inscripción de Torneo'}</p>

          <div className="tm-btn-group">
            {dbStatus === 'draft' ? (
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
          <div style={{ backgroundColor: '#F0F9FF', padding: '1rem', borderRadius: '1rem', border: '1.5px solid #BAE6FD', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#0369A1', textTransform: 'uppercase' }}>Enlace para jugadores:</p>
                <a href={`${window.location.origin}/torneos/${publishedId}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem', color: '#2563EB', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>
                  {window.location.host}/torneos/{publishedId}
                </a>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/torneos/${publishedId}`); alert('¡Enlace copiado al portapapeles!'); }} style={{ marginLeft: '0.75rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#334155', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Copiar
              </button>
            </div>
            <button
              onClick={async () => {
                try {
                  const { error } = await supabase.from('tournaments')
                    .update({ config: { ...tConfig } })
                    .eq('id', publishedId);
                  if (error) throw error;
                  alert('✅ Enlace actualizado con la configuración actual (fechas, horarios, categorías, pistas).');
                } catch (e) {
                  console.error(e);
                  alert('Error al actualizar el enlace.');
                }
              }}
              style={{
                width: '100%', padding: '0.65rem 1rem', borderRadius: '0.625rem',
                border: 'none', backgroundColor: '#0284C7', color: 'white',
                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                boxShadow: '0 2px 8px rgba(2,132,199,0.25)', transition: 'background-color 0.15s'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              Actualizar Enlace (sincronizar config)
            </button>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: '#0369A1', textAlign: 'center' }}>
              Pulsa este botón después de cambiar fechas, horarios o pistas para que los jugadores vean la info actualizada.
            </p>
          </div>
        )}

        <div style={{ backgroundColor: '#FFFBEB', padding: '1rem', borderRadius: '1rem', border: '1px solid #FDE68A', marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Plazo de Inscripción Online</p>
          <div className="tm-deadline-row">
            <input type="date" value={tConfig.registrationDeadline || ''} max={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, registrationDeadline: e.target.value})} style={{ padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #FDE68A', fontSize: '0.9rem', cursor: 'pointer', backgroundColor: 'white', boxSizing: 'border-box' }} />
            {publishedId ? (
              <button onClick={handleUpdateDeadline} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', backgroundColor: '#D97706', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Guardar plazo
              </button>
            ) : (
              <span style={{ fontSize: '0.75rem', color: '#92400E', fontWeight: 600 }}>Se guardará al publicar</span>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <form onSubmit={addParticipant} style={{ marginBottom: '1.5rem' }}>
            <div className="tm-add-form">
              <input
                type="text"
                placeholder="Nombre de la pareja (Ej: Juan y Alberto)"
                value={newCouple}
                onChange={(e) => setNewCouple(e.target.value)}
                style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
              <select
                value={newCoupleCategory}
                onChange={(e) => setNewCoupleCategory(e.target.value)}
                style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', boxSizing: 'border-box' }}
              >
                <option value="">-- Elige Categoría --</option>
                {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button type="submit" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Añadir
              </button>
            </div>
          </form>
          <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Tras añadir una pareja, usa el botón <strong style={{ color: '#0F172A' }}>✎ Editar</strong> para configurar sus horas bloqueadas.
          </p>

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
                      {p.prefRules?.length > 0 && (
                        <div style={{ marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          {p.prefRules.map(r => (
                            <span key={r.id} style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ color: '#F97316', fontSize: '0.6rem' }}>●</span>
                              {r.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <button onClick={() => openEditGrid(p)} title="Editar horarios" style={{ background: 'none', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', color: '#475569', cursor: 'pointer', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => removeParticipant(p.id)} title="Eliminar pareja" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.2rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Availability Heatmap ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={() => setShowAvailability(!showAvailability)}
              style={{
                width: '100%', padding: '0.875rem 1rem', borderRadius: '0.75rem',
                border: '1.5px solid #C4B5FD', backgroundColor: showAvailability ? '#7C3AED' : '#F5F3FF',
                color: showAvailability ? 'white' : '#6D28D9', fontWeight: 800, fontSize: '0.9rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', boxShadow: showAvailability ? '0 4px 12px rgba(124,58,237,0.3)' : 'none'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
              </svg>
              📊 {showAvailability ? 'Ocultar' : 'Ver'} Disponibilidad en Tiempo Real
              {publishedId && showAvailability && (
                <span style={{ marginLeft: '0.5rem', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              )}
            </button>

            {showAvailability && (
              <div style={{ marginTop: '1rem', backgroundColor: 'white', border: '1.5px solid #C4B5FD', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 4px 12px rgba(124,58,237,0.08)' }}>
                {/* Header */}
                <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'white' }}>
                      Mapa de Disponibilidad
                    </h4>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                      {participants.length} parejas inscritas · Horas bloqueadas por slot
                      {publishedId && ' · En vivo'}
                    </p>
                  </div>
                  <select
                    value={availabilityCategory}
                    onChange={e => setAvailabilityCategory(e.target.value)}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.9)', color: '#6D28D9' }}
                  >
                    <option value="">Todas las categorías</option>
                    {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Legend */}
                <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#FAFAF9', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.72rem', fontWeight: 600, color: '#64748B' }}>
                  {[
                    { bg: '#DCFCE7', border: '#86EFAC', label: '0 bloqueadas' },
                    { bg: '#FEF9C3', border: '#FDE047', label: '≤25%' },
                    { bg: '#FED7AA', border: '#FB923C', label: '≤50%' },
                    { bg: '#FECACA', border: '#F87171', label: '>50%' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: item.bg, border: `1px solid ${item.border}` }} />
                      {item.label}
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div style={{ padding: '1rem', overflowX: 'auto' }}>
                  {(() => {
                    const filteredP = availabilityCategory
                      ? participants.filter(p => p.category === availabilityCategory)
                      : participants;
                    const totalP = filteredP.length;

                    const getBlockedCount = (slot) => {
                      return filteredP.filter(p => p.prefRules?.some(r => r.slots?.includes(slot))).length;
                    };

                    const getBlockedNames = (slot) => {
                      return filteredP.filter(p => p.prefRules?.some(r => r.slots?.includes(slot))).map(p => p.name);
                    };

                    const getColor = (blocked) => {
                      if (blocked === 0) return { bg: '#DCFCE7', border: '#86EFAC', text: '#16A34A' };
                      const pct = totalP > 0 ? blocked / totalP : 0;
                      if (pct <= 0.25) return { bg: '#FEF9C3', border: '#FDE047', text: '#A16207' };
                      if (pct <= 0.50) return { bg: '#FED7AA', border: '#FB923C', text: '#C2410C' };
                      return { bg: '#FECACA', border: '#F87171', text: '#DC2626' };
                    };

                    if (activeDays.length === 0) {
                      return <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', padding: '2rem' }}>Configura las fechas del torneo para ver el mapa de disponibilidad.</p>;
                    }

                    return (
                      <>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', userSelect: 'none' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                              <th style={{ padding: '0.5rem 0.6rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '48px', position: 'sticky', left: 0, backgroundColor: '#F8FAFC', zIndex: 1 }}>Hora</th>
                              {activeDays.map(day => (
                                <th key={day} style={{ padding: '0.5rem 0.4rem', color: '#0F172A', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '72px' }}>
                                  {day}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {allGridHours.map((hour, hIdx) => {
                              const courtsAvail = getAvailableCourtsForHour(hour, tConfig.courtsCount, tConfig.courtStartHours);
                              return (
                                <tr key={hour} style={{ backgroundColor: hIdx % 2 === 0 ? 'white' : '#FAFAFB' }}>
                                  <td style={{ padding: '0.15rem 0.6rem', color: '#64748B', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: hIdx % 2 === 0 ? 'white' : '#FAFAFB', zIndex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem' }}>
                                      {hour}
                                      <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: 500 }}>({courtsAvail}p)</span>
                                    </div>
                                  </td>
                                  {activeDays.map(day => {
                                    const isValid = getHoursForDay(day).includes(hour);
                                    const slot = `${day} ${hour}`;
                                    const blocked = isValid ? getBlockedCount(slot) : 0;
                                    const color = isValid ? getColor(blocked) : { bg: '#F1F5F9', border: '#E2E8F0', text: '#CBD5E1' };
                                    const isHovered = hoveredSlot === slot;
                                    const blockedNames = isHovered ? getBlockedNames(slot) : [];

                                    return (
                                      <td key={day} style={{ padding: '0.15rem 0.3rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', position: 'relative' }}>
                                        <div
                                          onMouseEnter={isValid ? () => setHoveredSlot(slot) : undefined}
                                          onMouseLeave={() => setHoveredSlot(null)}
                                          style={{
                                            height: '28px',
                                            borderRadius: '4px',
                                            backgroundColor: color.bg,
                                            border: `1px solid ${color.border}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: isValid ? 'help' : 'default',
                                            transition: 'all 0.1s',
                                            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                                          }}
                                        >
                                          {isValid && totalP > 0 && (
                                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: color.text }}>
                                              {blocked}
                                            </span>
                                          )}
                                        </div>
                                        {/* Tooltip */}
                                        {isHovered && isValid && blocked > 0 && (
                                          <div style={{
                                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                                            backgroundColor: '#1E293B', color: 'white', padding: '0.5rem 0.75rem',
                                            borderRadius: '0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                            whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                                            pointerEvents: 'none', marginBottom: '4px'
                                          }}>
                                            <div style={{ marginBottom: '0.25rem', color: '#F87171', fontWeight: 700 }}>
                                              {blocked} pareja{blocked !== 1 ? 's' : ''} no disponible{blocked !== 1 ? 's' : ''}:
                                            </div>
                                            {blockedNames.map((name, i) => (
                                              <div key={i} style={{ color: '#CBD5E1', fontSize: '0.65rem' }}>• {name}</div>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Court availability summary */}
                        {tConfig.courtsCount >= 2 && Object.keys(tConfig.courtStartHours || {}).length > 0 && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', backgroundColor: '#FFFAF0', borderRadius: '0.625rem', border: '1px solid #FED7AA' }}>
                            <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', fontWeight: 800, color: '#9A3412' }}>🕐 Pistas disponibles por hora:</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              {(() => {
                                // Group hours by court count
                                const groups = {};
                                allGridHours.forEach(h => {
                                  const courts = getAvailableCourtsForHour(h, tConfig.courtsCount, tConfig.courtStartHours);
                                  if (!groups[courts]) groups[courts] = [];
                                  groups[courts].push(h);
                                });
                                return Object.entries(groups).map(([count, hours]) => (
                                  <span key={count} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#C2410C', backgroundColor: '#FFF7ED', padding: '0.2rem 0.6rem', borderRadius: '2rem', border: '1px solid #FED7AA' }}>
                                    {hours[0]}–{hours[hours.length - 1]}: {count} pista{count > 1 ? 's' : ''}
                                  </span>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

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
      <style>{`
        .tm-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .tm-header-info { flex: 1; min-width: 220px; }
        .tm-btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-start; }
        .tm-deadline-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
        .tm-deadline-row input { min-width: 130px; }
        @media (max-width: 480px) {
          .tm-btn-group button { font-size: 0.72rem !important; padding: 0.45rem 0.6rem !important; }
          .tm-header-info h2 { font-size: 1.15rem !important; }
        }
      `}</style>
      <div style={{ marginBottom: '1rem' }}>
         <button onClick={() => onBack(tConfig.name)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', padding: 0 }}>
            ← Volver al panel de Todos los Torneos
         </button>
      </div>
      <div className="tm-header-row">
        <div className="tm-header-info">
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Torneo: {tConfig.name}</h2>
          <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>{fmtDateDisplay(tConfig.startDate)} — {fmtDateDisplay(tConfig.endDate)} · {tConfig.startHour} a {tConfig.endHour}</p>
          <p style={{ margin: '0.1rem 0', fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
            {tConfig.matchDurationByCategory
              ? Object.entries(tConfig.matchDurationByCategory).map(([cat, dur]) => `${cat}: ${dur} min`).join(' · ')
              : `${tConfig.matchDuration ?? 90} min`}
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>Haz clic en el ganador de cada partido para avanzar ronda.</p>
          <div className="tm-deadline-row">
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400E', whiteSpace: 'nowrap' }}>Plazo inscripción:</span>
            <input type="date" value={tConfig.registrationDeadline || ''} max={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, registrationDeadline: e.target.value})} style={{ padding: '0.3rem 0.5rem', borderRadius: '0.4rem', border: '1.5px solid #FDE68A', fontSize: '0.8rem', cursor: 'pointer', backgroundColor: '#FFFBEB', boxSizing: 'border-box' }} />
            {publishedId && (
              <button onClick={handleUpdateDeadline} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.4rem', backgroundColor: '#D97706', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Guardar
              </button>
            )}
          </div>
        </div>
        <div className="tm-btn-group">
          {!isExporting && (
            <>
              <button
                onClick={() => setPhase('setup')}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Atrás a Inscripción
              </button>
              <button
                onClick={() => {
                  if (window.confirm('¿Reiniciar resultados? Se borrarán todos los ganadores y marcadores, pero las parejas quedarán en el mismo sitio del cuadro.')) {
                    const resetRounds = (allRounds) =>
                      Object.fromEntries(
                        Object.entries(allRounds).map(([cat, catRounds]) => [
                          cat,
                          catRounds.map((roundMatches, rIdx) =>
                            roundMatches.map(m => ({
                              ...m,
                              winner: null,
                              score: null,
                              // Only keep p1/p2 in round 0; clear propagated players in later rounds
                              p1: rIdx === 0 ? m.p1 : null,
                              p2: rIdx === 0 ? m.p2 : null,
                            }))
                          ),
                        ])
                      );
                    setRounds(prev => resetRounds(prev));
                    setConsRounds(prev => resetRounds(prev));
                  }
                }}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', backgroundColor: 'white', color: '#DC2626', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Reiniciar Torneo
              </button>
              <button
                onClick={() => {
                  if (window.confirm('¿Volver a sortear el cuadro? Se perderán todos los resultados actuales y se generará un nuevo orden aleatorio con las mismas parejas.')) {
                    generateBracket();
                  }
                }}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #FDE68A', backgroundColor: 'white', color: '#B45309', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Re-sortear Cuadro
              </button>
              <button
                onClick={handlePublishBracket}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #DCFCE7', backgroundColor: '#F0FDF4', color: '#16A34A', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Publicar Cuadro
              </button>
            </>
          )}
        </div>
      </div>

      {Object.keys(rounds).map(cat => {
         const catRounds = rounds[cat] || [];
         const catCons = consRounds[cat] || [];
         if (catRounds.length === 0) return null;
         const isLiguilla = tConfig.formatByCategory?.[cat] === 'liguilla' || catRounds[0]?.[0]?.isRR;

         if (isLiguilla) {
           // Compute standings
           const standingsMap = {};
           catRounds.forEach(round => round.forEach(m => {
             [m.p1, m.p2].forEach(p => { if (p && !standingsMap[p.id]) standingsMap[p.id] = { pair: p, pj: 0, pg: 0, pp: 0, pts: 0 }; });
             if (m.winner) {
               standingsMap[m.p1.id].pj++; standingsMap[m.p2.id].pj++;
               if (m.winner.id === m.p1.id) { standingsMap[m.p1.id].pg++; standingsMap[m.p1.id].pts += 2; standingsMap[m.p2.id].pp++; }
               else { standingsMap[m.p2.id].pg++; standingsMap[m.p2.id].pts += 2; standingsMap[m.p1.id].pp++; }
             }
           }));
           const standings = Object.values(standingsMap).sort((a, b) => b.pts - a.pts || b.pg - a.pg);
           return (
             <div key={cat} style={{ marginBottom: '4rem' }}>
               <div style={{ padding: '1rem 1.5rem', backgroundColor: '#1E293B', color: 'white', borderRadius: '1rem', marginBottom: '2rem' }}>
                 <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Categoría: {cat} — Liguilla</h2>
               </div>
               {/* Standings */}
               <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '2rem' }}>
                 <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                   <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>Clasificación</h3>
                 </div>
                 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                   <thead><tr style={{ backgroundColor: '#F8FAFC' }}>
                     {['#', 'Pareja', 'PJ', 'PG', 'PP', 'Pts'].map(h => (
                       <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: h === 'Pareja' ? 'left' : 'center', color: '#64748B', fontWeight: 700, fontSize: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
                     ))}
                   </tr></thead>
                   <tbody>
                     {standings.map((s, i) => (
                       <tr key={s.pair.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: i === 0 ? '#F0FDF4' : 'white' }}>
                         <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 800, color: i === 0 ? '#16A34A' : '#94A3B8' }}>{i + 1}</td>
                         <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#0F172A' }}>{s.pair.name}</td>
                         <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#475569' }}>{s.pj}</td>
                         <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#16A34A', fontWeight: 700 }}>{s.pg}</td>
                         <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#DC2626', fontWeight: 700 }}>{s.pp}</td>
                         <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 900, color: i === 0 ? '#16A34A' : '#0F172A' }}>{s.pts}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               {/* Rounds */}
               {catRounds.map((roundMatches, rIdx) => (
                 <div key={rIdx} style={{ marginBottom: '1.5rem' }}>
                   <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Jornada {rIdx + 1}</h4>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                     {roundMatches.map(match => (
                       <div key={match.id} style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden' }}>
                         <div style={{ backgroundColor: '#F8FAFC', padding: '0.35rem 0.75rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B' }}>{match.time || 'Horario por definir'}</span>
                           {!isExporting && <button onClick={() => handleEditTime(match, false, cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.1rem' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>}
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center' }}>
                           {[{ player: match.p1, side: 'p1' }, { player: match.p2, side: 'p2' }].map(({ player, side }, sIdx) => {
                             const isWinner = match.winner?.id === player?.id;
                             return (
                               <div key={side} onClick={() => handleSetWinner(match, player, false, cat)} style={{ flex: 1, padding: '0.6rem 0.75rem', backgroundColor: isWinner ? '#DCFCE7' : 'transparent', cursor: 'pointer', borderRight: sIdx === 0 ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <span style={{ fontSize: '0.85rem', fontWeight: isWinner ? 800 : 600, color: isWinner ? '#16A34A' : '#334155', flex: 1 }}>{player?.name}</span>
                                 {match.score && <div style={{ display: 'flex', gap: '0.15rem' }}>{parseScore(match.score, sIdx).map((s, i) => <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, background: isWinner ? '#16A34A' : '#E2E8F0', color: isWinner ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.25rem' }}>{s}</span>)}</div>}
                                 {isWinner && <span style={{ fontSize: '0.85rem' }}>🏆</span>}
                               </div>
                             );
                           })}
                         </div>
                         {!isExporting && (
                           <div style={{ padding: '0.35rem 0.5rem', borderTop: '1px solid #F1F5F9' }}>
                             {editingScoreId === match.id ? (
                               <div style={{ display: 'flex', gap: '0.3rem' }}>
                                 <input autoFocus type="text" placeholder="Ej: 6-4 3-6 7-5" value={scoreInput} onChange={e => setScoreInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleScoreSubmit(match, scoreInput, false, cat); if (e.key === 'Escape') { setEditingScoreId(null); setScoreInput(''); } }} style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', fontSize: '0.78rem' }} />
                                 <button onClick={() => handleScoreSubmit(match, scoreInput, false, cat)} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#16A34A', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✓</button>
                                 <button onClick={() => { setEditingScoreId(null); setScoreInput(''); }} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✕</button>
                               </div>
                             ) : (
                               <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: match.score ? '#64748B' : '#2563EB', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: 0 }}>
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
             </div>
           );
         }

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
                const swapKey = `${bracket.isCons}-${cat}`;
                const isSwapping = !!swapMode[swapKey];
                return (
                  <div id={bracket.id} key={bracket.title} style={{ padding: '1.5rem', backgroundColor: '#FAFAF9', borderRadius: '1rem', marginBottom: '3rem', borderTop: bracket.isCons ? '2px dashed #E2E8F0' : 'none', marginTop: bracket.isCons ? '2rem' : '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: bracket.isCons ? '#D97706' : '#0F172A' }}>
                        {isExporting === bracket.id ? `${tConfig.name} - ${bracket.title}` : bracket.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {!isExporting && (
                          <>
                            <button
                              onClick={() => toggleSwapMode(swapKey)}
                              style={{ background: 'none', border: 'none', color: isSwapping ? '#D97706' : '#7C3AED', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                              🔀 {isSwapping ? (selectedSwapSlot?.key === swapKey ? 'Selecciona 2ª pareja…' : 'Cancelar edición') : 'Editar orden'}
                            </button>
                            <button onClick={() => handleDownloadPDF(bracket.id, bracket.title)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Exportar PDF
                            </button>
                          </>
                        )}
                        {bracket.isCons && !isExporting && (
                           <button onClick={() => setConsRounds(prev => ({...prev, [cat]: []}))} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Restaurar Consolación</button>
                        )}
                      </div>
                    </div>
                    {isSwapping && (
                      <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '0.5rem', padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400E', fontWeight: 600 }}>
                        🔀 Modo edición: haz clic en dos parejas de la <strong>primera ronda</strong> para intercambiarlas de posición.
                      </div>
                    )}
            
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
                      
                      {(['p1', 'p2']).map((side, sIdx) => {
                        const player = match[side];
                        const isWinner = match.winner?.id === player?.id;
                        const isSelected = isSwapping && selectedSwapSlot?.key === swapKey && selectedSwapSlot?.matchIdx === match.matchIndex && selectedSwapSlot?.side === side && rIdx === 0;
                        const swappable = isSwapping && rIdx === 0 && !player?.isBye;
                        const baseBg = isWinner ? (bracket.isCons ? '#FEF3C7' : '#DCFCE7') : (sIdx === 1 ? '#F8FAFC' : 'transparent');
                        const bg = isSelected ? '#EDE9FE' : baseBg;
                        return (
                          <div
                            key={side}
                            onClick={() => swappable ? handleSwapPlayers(cat, bracket.isCons, match.matchIndex, side) : handleSetWinner(match, player, bracket.isCons, cat)}
                            style={{ padding: '0.6rem 0.75rem', backgroundColor: bg, borderBottom: sIdx === 0 ? '1.5px solid #F1F5F9' : 'none', cursor: (player?.isBye && !swappable) ? 'default' : 'pointer', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem', outline: isSelected ? '2px solid #7C3AED' : 'none' }}
                          >
                            {swappable && <span style={{ fontSize: '0.7rem', color: isSelected ? '#7C3AED' : '#A78BFA', flexShrink: 0 }}>⇄</span>}
                            <span style={{ fontSize: '0.82rem', fontWeight: isWinner ? 800 : 600, color: isSelected ? '#7C3AED' : (isWinner ? (bracket.isCons ? '#D97706' : '#16A34A') : '#334155'), flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {player ? player.name : '\u00A0'}
                            </span>
                            {match.score && (
                              <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                                {parseScore(match.score, sIdx).map((s, i) => (
                                  <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, background: isWinner ? (bracket.isCons ? '#F59E0B' : '#16A34A') : '#E2E8F0', color: isWinner ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.3rem', minWidth: '1.2rem', textAlign: 'center' }}>{s}</span>
                                ))}
                              </div>
                            )}
                            {isWinner && <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🏆</span>}
                          </div>
                        );
                      })}

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
  const [tournaments, setTournaments] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [activeId, setActiveId] = useState(() => localStorage.getItem('adminActiveTournamentId') || null);

  const setActiveIdPersist = (id) => {
    setActiveId(id);
    if (id) localStorage.setItem('adminActiveTournamentId', id);
    else localStorage.removeItem('adminActiveTournamentId');
  };

  const fetchTournaments = async () => {
    setListError(null);
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status, config, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setListError(error.message || 'Error al cargar torneos');
      setLoadingList(false);
      return;
    }
    setTournaments((data || []).map(t => ({
      id: t.id,
      name: t.name || 'Sin nombre',
      date: t.created_at,
      status: t.status,
      config: t.config || {},
    })));
    setLoadingList(false);
  };

  useEffect(() => {
    fetchTournaments();
    // Migración puntual: si quedó lista vieja en localStorage y no hay torneos en DB,
    // la subimos a Supabase una vez para no perder nada.
    (async () => {
      try {
        const legacy = localStorage.getItem('padel_medina_tournaments_list');
        if (!legacy) return;
        const list = JSON.parse(legacy);
        if (!Array.isArray(list) || list.length === 0) return;
        const { data: existing } = await supabase.from('tournaments').select('id').limit(1);
        if (existing && existing.length > 0) {
          // Ya hay torneos en DB: solo limpiamos el legacy, no migramos para evitar duplicados.
          localStorage.removeItem('padel_medina_tournaments_list');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        const rows = list.map(t => {
          let cfg = {};
          try { cfg = JSON.parse(localStorage.getItem(`padel_medina_tournament_${t.id}`) || '{}'); } catch {}
          const config = { ...(cfg.tConfig || {}), rounds: cfg.rounds || {}, consRounds: cfg.consRounds || {}, participants: cfg.participants || [], phase: cfg.phase || 'config' };
          return { name: t.name || 'Sin nombre', config, status: 'draft', admin_id: user?.id || null };
        });
        await supabase.from('tournaments').insert(rows);
        localStorage.removeItem('padel_medina_tournaments_list');
        fetchTournaments();
      } catch (e) {
        console.warn('Migración de torneos localStorage → DB falló:', e);
      }
    })();
  }, []);

  const createNewTournament = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ name: 'Nuevo Torneo', config: {}, status: 'draft', admin_id: user?.id || null })
      .select('id, name, status, config, created_at')
      .single();
    if (error) {
      alert('Error al crear torneo: ' + error.message);
      return;
    }
    setTournaments(prev => [{ id: data.id, name: data.name, date: data.created_at, status: data.status, config: data.config || {} }, ...prev]);
    setActiveIdPersist(data.id);
  };

  const deleteTournament = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este torneo permanentemente?')) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
      return;
    }
    setTournaments(prev => prev.filter(t => t.id !== id));
    localStorage.removeItem(`padel_medina_tournament_${id}`);
  };

  const updateTournamentName = async (id, newName) => {
    if (!newName) return;
    setTournaments(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
    const { error } = await supabase.from('tournaments').update({ name: newName }).eq('id', id);
    if (error) console.warn('Error actualizando nombre:', error);
  };

  if (activeId) {
     return <TournamentEditor tournamentKey={activeId} onBack={(newName) => {
         if (newName) updateTournamentName(activeId, newName);
         setActiveIdPersist(null);
         fetchTournaments();
     }} />;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0F172A' }}>Mis Torneos</h1>
            <p style={{ margin: '0.2rem 0 0', color: '#64748B', fontSize: '0.9rem' }}>Gestiona tus competiciones activas y crea nuevas.</p>
          </div>
          <button onClick={createNewTournament} style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, cursor: 'pointer', border: 'none', boxShadow: '0 4px 6px -1px rgba(22,163,74,0.2)' }}>
             ➕ Crear Nuevo Torneo
          </button>
       </div>

       {listError && (
          <div style={{ padding: '1rem 1.25rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem', color: '#B91C1C', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Error: {listError}
          </div>
       )}

       {loadingList ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#0F172A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
       ) : tournaments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '1rem', border: '1px dashed #CBD5E1' }}>
             <p style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: 600 }}>No hay torneos creados activos.</p>
             <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Haz clic en el botón superior para empezar uno nuevo.</p>
          </div>
       ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
             {tournaments.map(t => {
                const startDate = t.config?.startDate;
                const endDate = t.config?.endDate;
                const isPublished = t.status && t.status !== 'draft';
                return (
                <div key={t.id} style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1E293B' }}>{t.name}</h3>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: isPublished ? '#DCFCE7' : '#F1F5F9', color: isPublished ? '#15803D' : '#64748B' }}>
                          {isPublished ? 'Publicado' : 'Borrador'}
                        </span>
                      </div>
                      {startDate && endDate && (
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                          {fmtDateDisplay(startDate)} — {fmtDateDisplay(endDate)}
                        </p>
                      )}
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Creado: {new Date(t.date).toLocaleDateString('es-ES')}</span>
                   </div>
                   <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      <button onClick={() => setActiveIdPersist(t.id)} style={{ flex: 1, padding: '0.65rem', borderRadius: '0.5rem', backgroundColor: '#0F172A', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: '0.85rem', minHeight: '40px' }}>
                         Abrir / Editar
                      </button>
                      <button aria-label="Eliminar torneo" onClick={() => deleteTournament(t.id)} style={{ padding: '0.65rem 0.75rem', borderRadius: '0.5rem', backgroundColor: '#FEE2E2', color: '#EF4444', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40px' }}>
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                   </div>
                </div>
             );
             })}
          </div>
       )}
    </div>
  );
};

export default TournamentManager;
