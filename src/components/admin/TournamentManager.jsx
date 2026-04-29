import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

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
      restMinutesBetweenMatches: 30,
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
  // Editor de horario con cuadrante (día × hora × pista)
  const [editingTime, setEditingTime] = useState(null); // { match, isCons, cat } | null
  const [editingTimeDay, setEditingTimeDay] = useState(null);
  // Panel de inscripciones (con talla y pago)
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [regsList, setRegsList] = useState([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  // QR del enlace público de inscripción (data URL para mostrar y descargar)
  const [qrDataUrl, setQrDataUrl] = useState('');
  // Panel de cabezas de serie (selector por categoría)
  const [showSeedsPanel, setShowSeedsPanel] = useState(false);
  // Editor de pistas durante el torneo (panel modal)
  const [showCourtsEditor, setShowCourtsEditor] = useState(false);

  // Genera el QR del enlace público cada vez que cambia publishedId.
  // Usa la lib qrcode local — no depende de servicios externos.
  useEffect(() => {
    if (!publishedId) { setQrDataUrl(''); return; }
    const url = `${window.location.origin}/torneos/${publishedId}`;
    QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch((e) => { console.error('QR generation failed:', e); setQrDataUrl(''); });
  }, [publishedId]);

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
  // Devuelve el nombre legible de una pista. Si tConfig.courtNames[N] está
  // definido y no vacío, lo usa; si no, "Pista N" (comportamiento previo).
  const getCourtName = (n) => {
    const custom = tConfig.courtNames?.[n];
    if (custom && String(custom).trim().length > 0) return String(custom).trim();
    return `Pista ${n}`;
  };

  // Convierte un match.time almacenado ("dd/mm HH:00 - Pista 3") al texto
  // que se muestra al usuario, reemplazando "Pista N" por el nombre custom.
  const displayTime = (timeStr) => {
    if (!timeStr) return '';
    const m = timeStr.match(/^(.*) - Pista (\d+)$/);
    if (!m) return timeStr;
    return `${m[1]} - ${getCourtName(parseInt(m[2], 10))}`;
  };

  const getAvailableCourtsForHour = (hourStr, courtsCount, courtStartHours) => {
    if (!courtStartHours || Object.keys(courtStartHours).length === 0) return courtsCount;
    let count = 0;
    for (let c = 1; c <= courtsCount; c++) {
      const courtStart = courtStartHours[c] || tConfig.startHour;
      if (hourStr >= courtStart) count++;
    }
    return Math.max(count, 0);
  };

  // Supabase Realtime: auto-sync de inscripciones al panel cuando está abierto.
  // Solo añadimos a participants las parejas con confirmation_status='confirmed'.
  // Las nuevas inscripciones nacen como 'pending' (no entran), y entran cuando
  // el admin las confirma (UPDATE).
  useEffect(() => {
    if (!publishedId || !showAvailability) return;
    const addIfConfirmed = (reg) => {
      if (!reg || reg.confirmation_status !== 'confirmed') return;
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
    };
    const channel = supabase
      .channel(`tournament-avail-${publishedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tournament_registrations',
        filter: `tournament_id=eq.${publishedId}`
      }, (payload) => addIfConfirmed(payload.new))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tournament_registrations',
        filter: `tournament_id=eq.${publishedId}`
      }, (payload) => addIfConfirmed(payload.new))
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

  // ── Inscripciones: cargar, marcar como pagado, exportar CSV ───────────────
  const loadRegistrations = async () => {
    if (!publishedId) return;
    setLoadingRegs(true);
    const { data, error } = await supabase
      .from('tournament_registrations')
      .select('*')
      .eq('tournament_id', publishedId)
      .order('created_at', { ascending: true });
    if (error) {
      alert('Error al cargar inscripciones: ' + error.message);
      setLoadingRegs(false);
      return;
    }
    setRegsList(data || []);
    setLoadingRegs(false);
  };

  const openRegistrationsPanel = async () => {
    setShowRegistrations(true);
    await loadRegistrations();
  };

  // Confirma o rechaza una inscripción y dispara el correo a la pareja.
  // action: 'confirm' | 'reject'.
  const setRegistrationConfirmation = async (reg, action) => {
    if (!reg) return;
    const verb = action === 'confirm' ? 'CONFIRMAR' : 'RECHAZAR';
    if (!window.confirm(`¿${verb} la pareja "${reg.player1_name} y ${reg.player2_name}" (${reg.category})?\n\nSe enviará un correo a la pareja.`)) return;

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    const updates = { confirmation_status: newStatus, confirmed_at: new Date().toISOString() };

    const { error: updErr } = await supabase
      .from('tournament_registrations')
      .update(updates)
      .eq('id', reg.id);
    if (updErr) { alert('Error al actualizar la inscripción: ' + updErr.message); return; }

    // Optimistic update local
    setRegsList(prev => prev.map(r => r.id === reg.id ? { ...r, ...updates } : r));

    // Disparamos el correo. Si falla solo avisamos: el cambio de estado ya está guardado.
    const emails = [reg.player1_email, reg.player2_email]
      .map(e => (e || '').trim())
      .filter(Boolean);
    if (emails.length === 0) {
      alert(`Pareja ${action === 'confirm' ? 'confirmada' : 'rechazada'} en BBDD, pero no había ningún correo guardado y no se ha podido avisar.`);
      return;
    }
    try {
      const { error: fnErr, data } = await supabase.functions.invoke('send-tournament-confirmation', {
        body: {
          action,
          emails,
          coupleName: `${reg.player1_name} y ${reg.player2_name}`,
          tournamentName: tConfig.name,
          category: reg.category,
        },
      });
      if (fnErr || (data && data.error)) {
        console.error('send-tournament-confirmation error', fnErr || data?.error);
        alert(`Estado guardado, pero el correo no se pudo enviar: ${fnErr?.message || data?.error || 'desconocido'}`);
      }
    } catch (e) {
      console.error('invoke error', e);
      alert(`Estado guardado, pero el correo no se pudo enviar: ${e?.message || e}`);
    }
  };

  const markRegistrationPaid = async (regId, currentStatus) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    const updates = { payment_status: newStatus };
    if (newStatus === 'paid') {
      updates.paid_at = new Date().toISOString();
      updates.payment_method = 'manual';
      const fee = parseFloat(tConfig.registrationFeeAmount || 0);
      if (fee > 0) updates.amount_paid = fee;
    } else {
      updates.paid_at = null;
    }
    const { error } = await supabase
      .from('tournament_registrations')
      .update(updates)
      .eq('id', regId);
    if (error) { alert('Error: ' + error.message); return; }
    setRegsList(prev => prev.map(r => r.id === regId ? { ...r, ...updates } : r));
  };

  const csvEscape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadRegistrationsCsv = () => {
    if (regsList.length === 0) { alert('No hay inscripciones que exportar.'); return; }
    const headers = ['Categoría','Jugador 1','Email 1','Tel 1','Talla 1','Jugador 2','Email 2','Tel 2','Talla 2','Estado pago','Importe','Pagado en','Fecha inscripción'];
    const rows = regsList.map(r => [
      r.category,
      r.player1_name, r.player1_email, r.player1_phone, r.player1_shirt_size || r.shirt_size || '',
      r.player2_name, r.player2_email, r.player2_phone, r.player2_shirt_size || '',
      r.payment_status,
      r.amount_paid != null ? Number(r.amount_paid).toFixed(2) : '',
      r.paid_at ? new Date(r.paid_at).toLocaleString('es-ES') : '',
      r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    // BOM para que Excel detecte UTF-8 con tildes
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inscripciones_${(tConfig.name || 'torneo').replace(/[^a-z0-9]+/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const syncRegistrations = async () => {
    if (!publishedId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.from('tournament_registrations')
        .select('*')
        .eq('tournament_id', publishedId);

      if (error) throw error;

      // Solo entran al cuadro las parejas confirmadas por el admin.
      // Las pendientes y rechazadas se quedan fuera hasta que se confirmen.
      const confirmed = (data || []).filter(r => r.confirmation_status === 'confirmed');
      const pendingCount = (data || []).filter(r => (r.confirmation_status || 'pending') === 'pending').length;

      const newParticipants = [];
      confirmed.forEach(reg => {
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
        alert(
          `Se han añadido ${newParticipants.length} pareja(s) confirmada(s) desde la web.` +
          (pendingCount > 0 ? `\n\n⚠️ Hay ${pendingCount} pareja(s) pendiente(s) de validar — no entran al cuadro hasta que las confirmes.` : '')
        );
      } else {
        alert(
          'No hay inscripciones confirmadas nuevas.' +
          (pendingCount > 0 ? `\n\n⚠️ Hay ${pendingCount} pareja(s) pendiente(s) de validar.` : '')
        );
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
      const config = { ...tConfig, rounds, consRounds, participants, phase };
      const { error } = await supabase.from('tournaments')
        .update({ config })
        .eq('id', publishedId);
      if (error) throw error;
      alert('Plazo de inscripción actualizado.');
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el plazo.');
    }
  };

  // Cierre/reapertura manual de inscripciones por parte del admin.
  // Independiente de la fecha límite — si está cerrado, la web pública
  // bloquea el formulario aunque el plazo aún no haya pasado.
  const toggleRegistrationClosed = async () => {
    if (!publishedId) { alert('Publica primero el torneo.'); return; }
    const closing = !tConfig.registrationClosed;
    if (closing) {
      const ok = window.confirm('¿Cerrar las inscripciones ahora? Los jugadores no podrán apuntarse hasta que vuelvas a abrirlas.');
      if (!ok) return;
    }
    try {
      const newConfig = { ...tConfig, registrationClosed: closing };
      const config = { ...newConfig, rounds, consRounds, participants, phase };
      const { error } = await supabase.from('tournaments')
        .update({ config })
        .eq('id', publishedId);
      if (error) throw error;
      setTConfig(newConfig);
      alert(closing ? '🔒 Inscripciones cerradas.' : '🔓 Inscripciones reabiertas.');
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el estado de las inscripciones.');
    }
  };

  const handlePublishBracket = async () => {
    if (!publishedId) {
      alert('Primero debes publicar el torneo (Fase 2).');
      return;
    }
    // Aviso si el plazo de inscripción aún está abierto: publicar el cuadro
    // antes de tiempo bloquea inscripciones que aún podrían llegar.
    const deadlineStr = tConfig.registrationDeadline;
    if (deadlineStr) {
      const deadlineMs = new Date(deadlineStr + 'T23:59:59').getTime();
      if (Date.now() < deadlineMs) {
        const fmt = new Date(deadlineStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const ok = window.confirm(
          `⚠️ El plazo de inscripción todavía está abierto hasta el ${fmt}.\n\n` +
          'Si publicas el cuadro ahora, el enlace público pasará a mostrar el cuadro y se cerrará la posibilidad de inscribirse.\n\n' +
          '¿Estás seguro de que quieres publicar el cuadro?'
        );
        if (!ok) return;
      }
    }
    try {
      // bracketPublished=true marca el cuadro como visible al público.
      // Mientras esto sea false (o ausente), el enlace /torneos/:id sigue
      // mostrando el formulario de inscripción aunque haya rounds generadas
      // (las rounds se generan localmente con "Generar Cuadro" en admin).
      const tConfigWithFlag = { ...tConfig, bracketPublished: true };
      const config = { ...tConfigWithFlag, rounds, consRounds, participants, phase };
      const { error } = await supabase.from('tournaments')
        .update({ config, status: 'open' })
        .eq('id', publishedId);
      if (error) throw error;
      setTConfig(tConfigWithFlag);
      alert('¡Cuadro publicado! Los jugadores pueden verlo (incluida la consolación si la has generado) en:\n/torneos/' + publishedId + '/cuadro');
    } catch (e) {
      console.error(e);
      alert('Error al publicar el cuadro: ' + (e.message || e));
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
      const nextMatch = rArray[rIdx + 1][nextMatchIdx];
      const prevPlayer = isTop ? nextMatch.p1 : nextMatch.p2;
      const changed = prevPlayer?.id !== winner.id;
      if (isTop) nextMatch.p1 = winner;
      else nextMatch.p2 = winner;
      // Si cambió el jugador que avanza y la hora NO es manual, borramos la
      // hora para que el auto-scheduler la recalcule con las disponibilidades
      // de la nueva pareja.
      if (changed && !nextMatch.timeManual) nextMatch.time = null;

      // Limpiar el ganador y rastro de rondas futuras cuando el admin corrige
      // un ganador anterior. También borramos tiempos no-manuales aguas abajo
      // donde los jugadores se quedan "sin definir" (hay que re-programar).
      let fR = rIdx + 1;
      let fM = nextMatchIdx;
      while (fR < rArray.length) {
         rArray[fR][fM].winner = null;
         const nextF = Math.floor(fM / 2);
         if (fR < rArray.length - 1) {
             const isTopF = fM % 2 === 0;
             const downstream = rArray[fR + 1][nextF];
             const downstreamPrev = isTopF ? downstream.p1 : downstream.p2;
             if (downstreamPrev?.id !== winner.id) {
               if (isTopF) downstream.p1 = null;
               else downstream.p2 = null;
               if (!downstream.timeManual) downstream.time = null;
             }
         }
         fM = nextF;
         fR++;
      }

      // Auto-advance if opponent in next round is a bye
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

       // ── Cabezas de serie ───────────────────────────────────────────────
       // Si alguna pareja tiene un campo `seed` numérico, las colocamos en
       // las posiciones estándar del cuadro para que el #1 y #2 solo se
       // crucen en la final. El resto se reparte en las posiciones libres.
       const seededHere = catParts.filter(p => Number.isFinite(p.seed) && p.seed > 0)
         .sort((a, b) => a.seed - b.seed);
       const hasSeeds = seededHere.length > 0;

       if (hasSeeds) {
         // seedPositions(n) → array de tamaño n con los rankings de seed que
         // deben ir en cada posición del cuadro (estándar).
         const seedPositions = (n) => {
           if (n === 1) return [1];
           const half = seedPositions(n / 2);
           const out = [];
           for (const s of half) { out.push(s); out.push(n + 1 - s); }
           return out;
         };
         const positions = seedPositions(pow); // ej. pow=8 → [1,8,4,5,2,7,3,6]

         const slot = new Array(pow).fill(null);
         // Coloca cada seed en su slot según su ranking
         seededHere.forEach(p => {
           const idx = positions.indexOf(p.seed);
           if (idx >= 0 && idx < pow) slot[idx] = p;
         });
         // Resto de parejas (sin seed o con seed > pow): los rellenamos en
         // orden de "peor seed opuesto primero". Esto garantiza que los BYEs
         // (slots que se quedan vacíos) caigan opuestos a los MEJORES seeds,
         // por lo que el #1, #2... son los que tienen bye en R1.
         const unseeded = catParts.filter(p => !slot.some(s => s?.id === p.id));
         const emptyIdxs = [];
         for (let i = 0; i < pow; i++) if (!slot[i]) emptyIdxs.push(i);
         // Para cada slot vacío, miramos el seed del oponente directo (i^1)
         // y ordenamos: peor seed (más alto numéricamente) primero, luego sin seed.
         emptyIdxs.sort((a, b) => {
           const sa = slot[a ^ 1]?.seed;
           const sb = slot[b ^ 1]?.seed;
           // Sin seed → ∞ (van al final, sus slots quedarán para byes si sobran)
           const va = Number.isFinite(sa) ? sa : Infinity;
           const vb = Number.isFinite(sb) ? sb : Infinity;
           return vb - va; // mayor (peor seed) primero
         });
         let ui = 0;
         for (const idx of emptyIdxs) {
           if (ui < unseeded.length) {
             slot[idx] = unseeded[ui++];
           } else {
             slot[idx] = { id: `bye-${cat}-${idx}`, name: '---', isBye: true };
           }
         }
         catParts = slot;
       } else {
         // Sin seeds → comportamiento original: intercalar BYEs entre parejas
         // reales para evitar partidos BYE vs BYE.
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
    setEditingTime({ match, isCons, cat });
    // Prellenar el día a partir de la hora actual si existe, si no el primer día
    const currentSlot = match.time ? match.time.split(' - Pista')[0].trim() : null;
    const currentDay = currentSlot ? currentSlot.split(' ')[0] : null;
    const activeDays = getActiveDates(tConfig.startDate, tConfig.endDate);
    setEditingTimeDay(currentDay || activeDays[0] || null);
  };

  // Cuadrante de ocupación:
  //   occupancy[slot (dd/mm HH:00)][court (1..N)] = { matchId, cat, isCons, label } | undefined
  const buildOccupancyMap = () => {
    const map = {};
    const addRounds = (roundsObj, isCons) => {
      Object.entries(roundsObj).forEach(([ct, catR]) => {
        catR.forEach(round => round.forEach(m => {
          if (!m.time || m.time === 'A convenir') return;
          const [slotPart, courtPart] = m.time.split(' - Pista');
          const slot = slotPart.trim();
          const court = parseInt(courtPart);
          if (!map[slot]) map[slot] = {};
          map[slot][court] = {
            matchId: m.id,
            cat: ct,
            isCons,
            label: `${m.p1?.name || '?'} vs ${m.p2?.name || '?'}`,
          };
        }));
      });
    };
    addRounds(rounds, false);
    addRounds(consRounds, true);
    return map;
  };

  const commitEditingTime = (day, hour, court) => {
    if (!editingTime) return;
    const { match, isCons, cat } = editingTime;
    const newTime = `${day} ${hour} - Pista ${court}`;
    const targetRoundsGlob = isCons ? consRounds : rounds;
    const targetRounds = targetRoundsGlob[cat];
    const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    nextRounds[match.round][match.matchIndex] = {
      ...nextRounds[match.round][match.matchIndex],
      time: newTime,
      timeManual: true, // marca puesta por admin → se muestra aunque el match no esté listo
    };
    if (isCons) setConsRounds({ ...consRounds, [cat]: nextRounds });
    else setRounds({ ...rounds, [cat]: nextRounds });
    setEditingTime(null);
  };

  const clearEditingTime = () => {
    if (!editingTime) return;
    const { match, isCons, cat } = editingTime;
    const targetRoundsGlob = isCons ? consRounds : rounds;
    const targetRounds = targetRoundsGlob[cat];
    const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
    nextRounds[match.round][match.matchIndex] = {
      ...nextRounds[match.round][match.matchIndex],
      time: null,
      timeManual: false,
    };
    if (isCons) setConsRounds({ ...consRounds, [cat]: nextRounds });
    else setRounds({ ...rounds, [cat]: nextRounds });
    setEditingTime(null);
  };

  // Recalcula los horarios de TODOS los partidos no-manuales aplicando afinidad
  // horaria + orden entre rondas + cupo de pistas. Útil para reparar brackets
  // que quedaron mal programados con la versión vieja del auto-scheduler.
  const recomputeAllAutoTimes = () => {
    const globalSlots = buildGlobalSlots();
    if (globalSlots.length === 0) { alert('Configura las fechas del torneo antes de recalcular.'); return; }
    const slotIdx = (s) => globalSlots.indexOf(s);
    const getSlot = (t) => t ? t.split(' - Pista')[0].trim() : null;

    // Clonar todo y limpiar times auto-asignados; respetar los manuales.
    const cloneCatRounds = (obj) => Object.fromEntries(
      Object.entries(obj).map(([c, rs]) => [c, rs.map(r => r.map(m => ({ ...m })))])
    );
    const nextMain = cloneCatRounds(rounds);
    const nextCons = cloneCatRounds(consRounds);

    // Limpia times no manuales.
    const clearAuto = (obj) => Object.values(obj).forEach(cr =>
      cr.forEach(round => round.forEach(m => {
        if (!m.timeManual) m.time = null;
      }))
    );
    clearAuto(nextMain);
    clearAuto(nextCons);

    const restMin = parseInt(tConfig.restMinutesBetweenMatches ?? 30, 10) || 0;

    // Scheduler: procesar ronda a ronda para que los predecesores estén listos.
    const scheduleCatRounds = (catRoundsObj, isCons) => {
      Object.entries(catRoundsObj).forEach(([cat, catRounds]) => {
        const durationMin = tConfig.matchDurationByCategory?.[cat] ?? 90;
        const gapSlots = Math.ceil((durationMin + restMin) / 60);
        const allowedCourts = getAllowedCourts(cat, isCons);
        for (let r = 0; r < catRounds.length; r++) {
          catRounds[r].forEach((m, mIdx) => {
            if (m.timeManual && m.time) return; // respeta lo puesto por admin
            if (!m.p1 || !m.p2 || m.p1.isBye || m.p2.isBye) return;

            let earliestIdx = 0;
            if (r > 0) {
              const predA = catRounds[r - 1][mIdx * 2];
              const predB = catRounds[r - 1][mIdx * 2 + 1];
              const aIdx = slotIdx(getSlot(predA?.time));
              const bIdx = slotIdx(getSlot(predB?.time));
              earliestIdx = Math.max(aIdx, bIdx) + gapSlots;
            }

            const occupied = buildOccupiedCourts(nextMain, nextCons);
            const p1Slots = expandPlayerSlots(m.p1, globalSlots);
            const p2Slots = expandPlayerSlots(m.p2, globalSlots);
            let common = p1Slots.filter(s => p2Slots.includes(s));
            if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);

            const picked = pickSlotAndCourt(common, occupied, allowedCourts, globalSlots, earliestIdx);
            if (picked) m.time = `${picked.slot} - Pista ${picked.court}`;
          });
        }
      });
    };

    scheduleCatRounds(nextMain, false);
    scheduleCatRounds(nextCons, true);

    setRounds(nextMain);
    setConsRounds(nextCons);
    alert('✅ Horarios recalculados respetando afinidad de jugadores, orden entre rondas y cupo de pistas. Los horarios que tú hayas puesto a mano se respetaron.');
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
    else {
      setRounds({ ...rounds, [cat]: nextRounds });
      // Si el score cambió/decidió un winner del cuadro principal, sincronizar
      // la consolación: si ya había un loser viejo (admin corrige resultado),
      // se sustituye por el nuevo en lugar de añadir uno duplicado.
      if (winner && !match.isRR) {
        syncConsOnMainWinner(cat, match, match.winner, winner);
      }
    }
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

  // Pistas permitidas para una categoría/cuadro. Si el admin no ha marcado
  // ninguna en config, devuelve TODAS las pistas (comportamiento previo).
  const getAllowedCourts = (cat, isCons) => {
    const cfg = tConfig.courtsByCategory?.[cat]?.[isCons ? 'cons' : 'main'];
    if (Array.isArray(cfg) && cfg.length > 0) return cfg.slice();
    return Array.from({ length: tConfig.courtsCount || 1 }, (_, i) => i + 1);
  };

  // occupiedCourts[slot] = Set(court) — qué pistas están YA ocupadas en cada
  // slot a partir de los matches programados (rounds + consRounds).
  const buildOccupiedCourts = (mainRounds, consRoundsSnap) => {
    const map = {};
    const add = (roundsObj) => {
      Object.values(roundsObj).forEach(catR => {
        catR.forEach(round => round.forEach(m => {
          if (!m.time || m.time === 'A convenir') return;
          const parts = m.time.split(' - Pista');
          const slot = parts[0].trim();
          const court = parseInt(parts[1], 10);
          if (!Number.isFinite(court)) return;
          if (!map[slot]) map[slot] = new Set();
          map[slot].add(court);
        }));
      });
    };
    add(mainRounds);
    add(consRoundsSnap);
    return map;
  };

  // Encuentra (slot, court) libre para un match de una categoría dada.
  //   candidates: slots preferidos (afinidad horaria de los jugadores).
  //   occupied:   buildOccupiedCourts() snapshot.
  //   allowedCourts: pistas que la categoría puede usar (de getAllowedCourts).
  //   globalSlots: lista completa para fallback.
  // Devuelve { slot, court } o null si no encuentra ninguna.
  const pickSlotAndCourt = (candidates, occupied, allowedCourts, globalSlots, earliestIdx = 0) => {
    if (!globalSlots.length) return null;
    const idxOf = (s) => globalSlots.indexOf(s);
    const findFree = (slot) => {
      const hourPart = slot.split(' ')[1];
      const taken = occupied[slot] || new Set();
      // Solo pistas allowed para esta cat, libres en este slot Y abiertas
      // a esa hora (respetando courtStartHours).
      for (const c of allowedCourts) {
        if (taken.has(c)) continue;
        const startsAt = tConfig.courtStartHours?.[c];
        if (startsAt && hourPart < startsAt) continue;
        return c;
      }
      return null;
    };
    const tryList = (list) => {
      for (const s of list) {
        if (idxOf(s) < earliestIdx) continue;
        const c = findFree(s);
        if (c != null) return { slot: s, court: c };
      }
      return null;
    };
    return tryList(candidates && candidates.length ? candidates : globalSlots)
        || tryList(globalSlots);
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

  // Inyecta un perdedor del cuadro principal en el cuadro de consolación.
  // Reemplaza el primer placeholder disponible en R0 (cons-placeholder-*).
  // Si no hay consolación generada o no quedan placeholders, no hace nada.
  // Helpers PUROS (no leen de state, reciben catConsRounds como input).
  // Devuelven el nuevo array o null si no hubo cambios.

  const pushLoserToConsPure = (catConsRounds, loser) => {
    if (!catConsRounds || catConsRounds.length === 0 || !loser || loser.isBye) return null;
    const alreadyIn = catConsRounds.some(r => r.some(m => m.p1?.id === loser.id || m.p2?.id === loser.id));
    if (alreadyIn) return null;
    const next = catConsRounds.map(r => r.map(m => ({ ...m })));
    const r0 = next[0];
    for (const m of r0) {
      if (m.p1?.isPlaceholder) { m.p1 = { ...loser }; return next; }
      if (m.p2?.isPlaceholder) { m.p2 = { ...loser }; return next; }
    }
    for (const m of r0) {
      if (m.p1?.isBye && m.p2?.isBye) { m.p1 = { ...loser }; return next; }
    }
    return null;
  };

  // Reemplaza al perdedor "viejo" por uno "nuevo" en TODAS sus apariciones del
  // cuadro de consolación: en R0 cambia el slot, en R1+ también, y limpia
  // winner/score y time no-manual de los matches afectados (ya que el rastro
  // anterior ya no aplica). Devuelve null si oldLoser no estaba en cons.
  const swapLoserInConsPure = (catConsRounds, oldLoser, newLoser) => {
    if (!catConsRounds || catConsRounds.length === 0 || !oldLoser) return null;
    const next = catConsRounds.map(r => r.map(m => ({ ...m })));
    let changed = false;
    const replaceWith = (newLoser && !newLoser.isBye)
      ? { ...newLoser }
      : { id: `cons-placeholder-replaced-${Date.now()}`, name: 'Perdedor por definir', isPlaceholder: true };
    for (let r = 0; r < next.length; r++) {
      for (const m of next[r]) {
        if (m.p1?.id === oldLoser.id) {
          m.p1 = { ...replaceWith };
          m.winner = null; m.score = null;
          if (!m.timeManual) m.time = null;
          changed = true;
        }
        if (m.p2?.id === oldLoser.id) {
          m.p2 = { ...replaceWith };
          m.winner = null; m.score = null;
          if (!m.timeManual) m.time = null;
          changed = true;
        }
        if (m.winner?.id === oldLoser.id) {
          m.winner = null;
          changed = true;
        }
      }
    }
    return changed ? next : null;
  };

  // Compat: alias del helper anterior basado en state actual (pocas llamadas
  // externas). Mantiene la firma original.
  const pushLoserToConsolation = (cat, loser) => pushLoserToConsPure(consRounds[cat], loser);

  // Sincroniza la consolación tras asignar/cambiar el winner de un match del
  // cuadro principal. Maneja:
  //   · Primera asignación → inyecta newLoser en consolación.
  //   · Cambio de winner   → swap oldLoser por newLoser en consolación.
  //   · Sin cambio         → no toca nada.
  // Aplica solo a matches R0 (siempre) o R1 cuyo perdedor tuvo BYE en R0.
  const syncConsOnMainWinner = (cat, match, oldWinner, newWinner) => {
    if (!match.p1 || !match.p2 || match.p1.isBye || match.p2.isBye) return;
    if (!newWinner) return;

    const newLoser = newWinner.id === match.p1.id ? match.p2 : match.p1;
    if (!newLoser || newLoser.isBye) return;

    let sendToCons = false;
    if (match.round === 0) {
      sendToCons = true;
    } else if (match.round === 1) {
      const r0 = (rounds[cat] || [])[0] || [];
      const r0Match = r0.find(r0m => r0m.p1?.id === newLoser.id || r0m.p2?.id === newLoser.id);
      if (r0Match && (r0Match.p1?.isBye || r0Match.p2?.isBye)) sendToCons = true;
    }
    if (!sendToCons) return;

    const oldLoser = oldWinner ? (oldWinner.id === match.p1.id ? match.p2 : match.p1) : null;
    if (oldLoser && oldLoser.id === newLoser.id) return;

    setConsRounds(prev => {
      const catCons = prev[cat];
      if (!catCons || catCons.length === 0) return prev;
      let updated = null;
      if (oldLoser && oldLoser.id !== newLoser.id) {
        updated = swapLoserInConsPure(catCons, oldLoser, newLoser);
      } else {
        updated = pushLoserToConsPure(catCons, newLoser);
      }
      return updated ? { ...prev, [cat]: updated } : prev;
    });
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
      if (nextMatch && nextMatch.p1 && nextMatch.p2 && !nextMatch.p1.isBye && !nextMatch.p2.isBye) {
        const globalSlots = buildGlobalSlots();
        const slotIdx = (s) => globalSlots.indexOf(s);
        const getSlotFromMatch = (m) => m?.time ? m.time.split(' - Pista')[0].trim() : null;
        const predA = nextRounds[match.round][nextMatchIdx * 2];
        const predB = nextRounds[match.round][nextMatchIdx * 2 + 1];
        const predAIdx = slotIdx(getSlotFromMatch(predA));
        const predBIdx = slotIdx(getSlotFromMatch(predB));
        // Factor cansancio: nextStart >= predStart + duración + descanso
        const durationMin = tConfig.matchDurationByCategory?.[cat] ?? 90;
        const restMin = parseInt(tConfig.restMinutesBetweenMatches ?? 30, 10) || 0;
        const gapSlots = Math.ceil((durationMin + restMin) / 60);
        const earliestIdx = Math.max(predAIdx, predBIdx) + gapSlots;

        // Cuándo re-schedulear:
        //   · si no hay hora asignada aún, o
        //   · si la hora actual no la fijó el admin Y viola el orden entre rondas
        //     (p.ej. la generó una versión vieja del auto-scheduler sin enforcement).
        const curIdx = slotIdx(getSlotFromMatch(nextMatch));
        const violatesOrder = curIdx !== -1 && curIdx < earliestIdx;
        const shouldSchedule = !nextMatch.time || (!nextMatch.timeManual && violatesOrder);

        if (shouldSchedule) {
          if (violatesOrder && !nextMatch.timeManual) nextMatch.time = null;

          const updatedMain = isCons ? rounds : { ...rounds, [cat]: nextRounds };
          const updatedCons = isCons ? { ...consRounds, [cat]: nextRounds } : consRounds;
          const occupied = buildOccupiedCourts(updatedMain, updatedCons);
          const allowedCourts = getAllowedCourts(cat, isCons);

          const p1Slots = expandPlayerSlots(nextMatch.p1, globalSlots);
          const p2Slots = expandPlayerSlots(nextMatch.p2, globalSlots);
          let common = p1Slots.filter(s => p2Slots.includes(s));
          if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);

          const picked = pickSlotAndCourt(common, occupied, allowedCourts, globalSlots, earliestIdx);
          nextMatch.time = picked ? `${picked.slot} - Pista ${picked.court}` : '';
        }
      }
    }

    if (isCons) {
      setConsRounds({ ...consRounds, [cat]: nextRounds });
    } else {
      setRounds({ ...rounds, [cat]: nextRounds });

      // ── Auto-inyectar perdedor en el cuadro de consolación ──────────────
      // Reglas:
      //   · Perdedor de R0  → siempre va a consolación.
      //   · Perdedor de R1  → solo si su oponente de R0 era BYE (él no jugó R0).
      // Si el admin corrige el resultado, el helper también swap el loser
      // viejo por el nuevo en la consolación, en lugar de añadir uno nuevo.
      syncConsOnMainWinner(cat, match, match.winner, participant);
    }
  };


  // Genera el cuadro de eliminatorias finales tras una liguilla.
  // Toma los top N (configurable) de la clasificación de la categoría y los
  // empareja al estilo estándar (1º vs último, 2º vs penúltimo, etc.) en
  // consRounds[cat], reutilizando la estructura existente.
  const generateLiguillaKO = (cat) => {
    const catRounds = rounds[cat];
    if (!catRounds || catRounds.length === 0) return;

    // Construir clasificación a partir de los partidos de liguilla
    const standings = {};
    catRounds.forEach(round => round.forEach(m => {
      [m.p1, m.p2].forEach(p => {
        if (p && !p.isBye && !standings[p.id]) standings[p.id] = { pair: p, pj: 0, pg: 0, pp: 0, pts: 0 };
      });
      if (m.winner && m.p1 && m.p2 && !m.p1.isBye && !m.p2.isBye) {
        standings[m.p1.id].pj++; standings[m.p2.id].pj++;
        if (m.winner.id === m.p1.id) {
          standings[m.p1.id].pg++; standings[m.p1.id].pts += 2; standings[m.p2.id].pp++;
        } else {
          standings[m.p2.id].pg++; standings[m.p2.id].pts += 2; standings[m.p1.id].pp++;
        }
      }
    }));
    const ordered = Object.values(standings).sort((a, b) => b.pts - a.pts || b.pg - a.pg);

    const totalPlayed = catRounds.reduce((acc, r) => acc + r.filter(m => m.winner).length, 0);
    const totalMatches = catRounds.reduce((acc, r) => acc + r.length, 0);
    if (totalPlayed < totalMatches) {
      alert(`La liguilla todavía tiene partidos sin resultado (${totalMatches - totalPlayed} pendientes). Resuélvelos antes de generar las eliminatorias.`);
      return;
    }

    const qualifyN = parseInt(tConfig.liguillaQualifyPerGroup || 2, 10);
    if (ordered.length < qualifyN) {
      alert(`No hay suficientes parejas clasificadas (${ordered.length}) para generar las eliminatorias con top ${qualifyN}.`);
      return;
    }

    // Top N → emparejamientos estándar: 1 vs N, 2 vs N-1, etc.
    const top = ordered.slice(0, qualifyN);
    const koRounds = [];
    let pow = 1;
    while (pow < qualifyN) pow *= 2;
    const numRounds = Math.log2(pow);

    // Slot 0 (top): seed1 vs lastSeed; slot 1: seed2 vs (last-1) etc.
    const r0Matches = [];
    for (let i = 0; i < pow / 2; i++) {
      const a = top[i] ? top[i].pair : null;
      const b = top[pow - 1 - i] ? top[pow - 1 - i].pair : null;
      r0Matches.push({
        id: `ko-${cat}-r0-m${i}`,
        round: 0,
        matchIndex: i,
        p1: a || { id: `ko-bye-${cat}-${i}-a`, name: '---', isBye: true },
        p2: b || { id: `ko-bye-${cat}-${i}-b`, name: '---', isBye: true },
        winner: null, time: null, score: null,
      });
    }
    koRounds.push(r0Matches);

    for (let r = 1; r < numRounds; r++) {
      const numMatchesInRound = pow / Math.pow(2, r + 1);
      const matches = [];
      for (let m = 0; m < numMatchesInRound; m++) {
        matches.push({
          id: `ko-${cat}-r${r}-m${m}`,
          round: r, matchIndex: m,
          p1: null, p2: null, winner: null, time: null, score: null,
        });
      }
      koRounds.push(matches);
    }

    // Si hay opción de 3º y 4º puesto, lo añadimos como un match aparte en
    // un campo extra del torneo: lo guardamos al final del array de la última
    // ronda como una entrada con id especial.
    if (tConfig.liguillaThirdPlace && qualifyN >= 4 && numRounds >= 2) {
      koRounds[numRounds - 1].push({
        id: `ko-${cat}-3rd`,
        round: numRounds - 1, matchIndex: 1,
        p1: null, p2: null, winner: null, time: null, score: null,
        isThirdPlace: true,
      });
    }

    setConsRounds(prev => ({ ...prev, [cat]: koRounds }));
    alert(`✅ Eliminatorias finales generadas (top ${qualifyN}). Aparecerán como cuadro adicional debajo de la liguilla.`);
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

    // Asignador de slots respetando horas por pista (mismo que en generateBracket)
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

  // ── Página inline de Cabezas de Serie ────────────────────────────────
  // Selector por categoría: el admin asigna las parejas que ocuparán los
  // byes de R1. Las plazas de seed = nº de byes de la categoría.
  if (showSeedsPanel) {
    // Categorías: las del torneo o, si no hay, las de las parejas
    const cfgCats = (tConfig.categories || '').split(',').map(c => c.trim()).filter(Boolean);
    const partCats = Array.from(new Set(participants.map(p => p.category).filter(Boolean)));
    const allCats = cfgCats.length > 0 ? cfgCats : partCats;

    const setSeed = (participantId, seedValue) => {
      // seedValue: número o null (sin seed)
      setParticipants(prev => prev.map(p => {
        if (p.id !== participantId) return p;
        const next = { ...p };
        if (seedValue == null) delete next.seed;
        else next.seed = Number(seedValue);
        return next;
      }));
    };

    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
        <button onClick={() => setShowSeedsPanel(false)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', padding: 0, marginBottom: '1rem' }}>
          ← Volver al torneo
        </button>

        <div style={{ background: 'white', borderRadius: '1.25rem', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>🏆 Cabezas de Serie · {tConfig.name}</h2>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5 }}>
              Selecciona las parejas que ocuparán los <strong>byes de la primera ronda</strong>. El nº de plazas equivale al nº de byes de cada categoría — se calcula automáticamente según las parejas inscritas. El #1 y el #2 quedan en lados opuestos del cuadro.
            </p>
          </div>
        </div>

        {allCats.length === 0 && (
          <div style={{ background: 'white', borderRadius: '1rem', padding: '2rem', textAlign: 'center', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
            Configura las categorías del torneo (o añade parejas) antes de asignar cabezas de serie.
          </div>
        )}

        {allCats.map(cat => {
          // Parejas de esa categoría (solo cuentan si están en participants)
          const catParts = participants.filter(p => (p.category || '').split(' + ').includes(cat) || p.category === cat);
          const n = catParts.length;
          if (n < 2) {
            return (
              <div key={cat} style={{ background: 'white', borderRadius: '1rem', padding: '1.25rem 1.5rem', marginBottom: '0.75rem', border: '1px solid #E2E8F0' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>{cat}</h3>
                <p style={{ margin: '0.3rem 0 0', color: '#94A3B8', fontSize: '0.85rem' }}>
                  Solo {n} pareja{n === 1 ? '' : 's'} en esta categoría — añade más para que tenga sentido asignar cabezas.
                </p>
              </div>
            );
          }
          // pow = potencia de 2 más cercana, byes = pow - n
          let pow = 2; while (pow < n) pow *= 2;
          const byesCount = pow - n;
          // Slots de seed: tantos como byes (si no hay byes, no hay cabezas con bye)
          const seedSlots = Math.max(byesCount, 0);

          // Mapa actual seed → participantId, para saber qué hay y bloquear duplicados
          const seedMap = {};
          catParts.forEach(p => {
            if (Number.isFinite(p.seed) && p.seed > 0 && p.seed <= seedSlots) seedMap[p.seed] = p.id;
          });

          return (
            <div key={cat} style={{ background: 'white', borderRadius: '1rem', padding: '1.25rem 1.5rem', marginBottom: '0.75rem', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>{cat}</h3>
                <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                  {n} parejas · cuadro de {pow} · <strong style={{ color: byesCount > 0 ? '#16A34A' : '#94A3B8' }}>{byesCount} bye{byesCount === 1 ? '' : 's'}</strong>
                </span>
              </div>

              {seedSlots === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '0.7rem 0.9rem', borderRadius: '0.5rem' }}>
                  No hay byes en esta categoría (el nº de parejas es potencia de 2). Todas juegan la primera ronda — no hace falta asignar cabezas de serie aquí.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Array.from({ length: seedSlots }, (_, i) => i + 1).map(seedNum => {
                    const currentId = seedMap[seedNum] || '';
                    return (
                      <div key={seedNum} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#F8FAFC', padding: '0.6rem 0.8rem', borderRadius: '0.5rem' }}>
                        <span style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: seedNum === 1 ? '#FBBF24' : seedNum === 2 ? '#94A3B8' : '#CBD5E1', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>
                          {seedNum}
                        </span>
                        <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem', flexShrink: 0 }}>Cabeza de serie</span>
                        <select
                          value={currentId}
                          onChange={e => {
                            const newId = e.target.value;
                            // Si la pareja seleccionada ya tenía OTRO seed, lo limpia.
                            // Si el slot tenía OTRA pareja, le quita el seed a esa pareja.
                            setParticipants(prev => {
                              let next = prev.map(p => {
                                // Quitar seed si esta pareja ya estaba en otro slot
                                if (newId && p.id === newId && p.seed && p.seed !== seedNum) {
                                  const cp = { ...p }; delete cp.seed; return cp;
                                }
                                // Quitar seed a la pareja anterior de este slot (si la había)
                                if (currentId && p.id === currentId) {
                                  const cp = { ...p }; delete cp.seed; return cp;
                                }
                                return p;
                              });
                              // Asignar el nuevo seed (si no es vacío)
                              if (newId) {
                                next = next.map(p => p.id === newId ? { ...p, seed: seedNum } : p);
                              }
                              return next;
                            });
                          }}
                          style={{ flex: 1, padding: '0.55rem 0.7rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.88rem', fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}
                        >
                          <option value="">— Sin asignar —</option>
                          {catParts.map(p => (
                            <option key={p.id} value={p.id} disabled={Number.isFinite(p.seed) && p.seed !== seedNum && p.seed <= seedSlots}>
                              {p.name}{Number.isFinite(p.seed) && p.seed !== seedNum && p.seed <= seedSlots ? ` (ya es #${p.seed})` : ''}
                            </option>
                          ))}
                        </select>
                        {currentId && (
                          <button onClick={() => setSeed(currentId, null)} title="Quitar de cabezas de serie" style={{ background: 'none', border: '1px solid #CBD5E1', color: '#94A3B8', borderRadius: '0.4rem', cursor: 'pointer', padding: '0.3rem 0.55rem', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginTop: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400E', lineHeight: 1.5 }}>
            💡 Al pulsar <strong>Generar Cuadro</strong>, los cabezas de serie se colocarán en posiciones estándar (#1 y #2 en lados opuestos) y serán los que tengan <strong>bye en la primera ronda</strong>.
          </p>
        </div>
      </div>
    );
  }

  // ── Página inline de Inscripciones ──────────────────────────────────────
  // Va ANTES de los if(phase===...) para que tenga prioridad sobre cualquier
  // fase. Cuando el admin pulsa "📋 Inscripciones" entramos en una vista
  // propia, con botón Volver. Se pinta como un return aparte (no es overlay).
  if (showRegistrations) {
    const thCell = { textAlign: 'left', padding: '0.55rem 0.75rem', fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
    const tdCell = { padding: '0.6rem 0.75rem', verticalAlign: 'top', color: '#0F172A' };
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
        <button onClick={() => setShowRegistrations(false)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', padding: 0, marginBottom: '1rem' }}>
          ← Volver al torneo
        </button>
        <div style={{ background: 'white', borderRadius: '1.25rem', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>📋 Inscripciones · {tConfig.name}</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                {regsList.length} pareja{regsList.length === 1 ? '' : 's'} inscrita{regsList.length === 1 ? '' : 's'}
                {tConfig.gift === 'shirt' && ' · 🎁 Camiseta'}
                {tConfig.registrationFeeEnabled && tConfig.registrationFeeAmount > 0 && ` · 💳 ${tConfig.registrationFeeAmount}€`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={loadRegistrations} disabled={loadingRegs} style={{ padding: '0.55rem 0.9rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                {loadingRegs ? 'Cargando…' : '🔄 Refrescar'}
              </button>
              <button onClick={downloadRegistrationsCsv} style={{ padding: '0.55rem 0.9rem', borderRadius: '0.5rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                ⬇ Exportar CSV
              </button>
            </div>
          </div>
          <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
            {regsList.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.95rem' }}>
                {loadingRegs ? 'Cargando…' : 'Aún no hay inscripciones online.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                      <th style={thCell}>Pareja</th>
                      <th style={thCell}>Categoría</th>
                      <th style={thCell}>Contacto</th>
                      {tConfig.gift === 'shirt' && <th style={thCell}>Talla</th>}
                      {tConfig.registrationFeeEnabled && <th style={thCell}>Pago</th>}
                      {tConfig.registrationFeeEnabled && <th style={thCell}>Acción pago</th>}
                      <th style={thCell}>Validación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regsList.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={tdCell}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.player1_name}</div>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.player2_name}</div>
                        </td>
                        <td style={tdCell}>{r.category}</td>
                        <td style={tdCell}>
                          <div style={{ fontSize: '0.78rem', color: '#475569' }}>{r.player1_phone}</div>
                          <div style={{ fontSize: '0.78rem', color: '#475569' }}>{r.player2_phone}</div>
                          {(r.player1_email || r.player2_email) && (
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                              {[r.player1_email, r.player2_email].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        {tConfig.gift === 'shirt' && (
                          <td style={{ ...tdCell, fontWeight: 700, color: '#0369A1' }}>
                            <div>{r.player1_shirt_size || r.shirt_size || <span style={{ color: '#CBD5E1', fontWeight: 400 }}>—</span>}</div>
                            <div>{r.player2_shirt_size || <span style={{ color: '#CBD5E1', fontWeight: 400 }}>—</span>}</div>
                          </td>
                        )}
                        {tConfig.registrationFeeEnabled && (
                          <td style={tdCell}>
                            {(() => {
                              const colors = {
                                paid: { bg: '#DCFCE7', color: '#15803D', label: '✓ Pagado' },
                                pending: { bg: '#FEF3C7', color: '#92400E', label: '⏳ Pendiente' },
                                failed: { bg: '#FEE2E2', color: '#B91C1C', label: '✗ Fallido' },
                                not_required: { bg: '#F1F5F9', color: '#64748B', label: 'Sin pago' },
                              };
                              const c = colors[r.payment_status] || colors.pending;
                              return (
                                <span style={{ display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: c.bg, color: c.color }}>
                                  {c.label}
                                  {r.amount_paid != null && ` · ${Number(r.amount_paid).toFixed(2)}€`}
                                </span>
                              );
                            })()}
                          </td>
                        )}
                        {tConfig.registrationFeeEnabled && (
                          <td style={tdCell}>
                            {r.payment_status !== 'not_required' && (
                              <button onClick={() => markRegistrationPaid(r.id, r.payment_status)} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: 'none', background: r.payment_status === 'paid' ? '#FEF2F2' : '#16A34A', color: r.payment_status === 'paid' ? '#DC2626' : 'white', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                                {r.payment_status === 'paid' ? 'Marcar pendiente' : 'Marcar pagado'}
                              </button>
                            )}
                          </td>
                        )}
                        <td style={tdCell}>
                          {(() => {
                            const cs = r.confirmation_status || 'pending';
                            const palette = {
                              pending:   { bg: '#FEF3C7', color: '#92400E', label: '⏳ Pendiente' },
                              confirmed: { bg: '#DCFCE7', color: '#15803D', label: '✓ Confirmada' },
                              rejected:  { bg: '#FEE2E2', color: '#B91C1C', label: '✗ Rechazada' },
                            };
                            const c = palette[cs] || palette.pending;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                                <span style={{ display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: c.bg, color: c.color }}>
                                  {c.label}
                                </span>
                                {cs === 'pending' && (
                                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    <button onClick={() => setRegistrationConfirmation(r, 'confirm')} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                                      Confirmar
                                    </button>
                                    <button onClick={() => setRegistrationConfirmation(r, 'reject')} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: 'none', background: '#DC2626', color: 'white', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                                      Rechazar
                                    </button>
                                  </div>
                                )}
                                {cs !== 'pending' && (
                                  <button onClick={() => setRegistrationConfirmation(r, cs === 'confirmed' ? 'reject' : 'confirm')} style={{ padding: '0.25rem 0.55rem', borderRadius: '0.4rem', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>
                                    {cs === 'confirmed' ? 'Cambiar a rechazada' : 'Cambiar a confirmada'}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                💤 Descanso mínimo entre partidos de un mismo jugador
              </label>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#64748B', lineHeight: 1.45 }}>
                El auto-programador usará <strong>duración del partido + este descanso</strong> como hueco mínimo entre el inicio del partido anterior de una pareja y el siguiente.
              </p>
              <select
                value={tConfig.restMinutesBetweenMatches ?? 30}
                onChange={e => setTConfig({ ...tConfig, restMinutesBetweenMatches: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                <option value={0}>Sin descanso obligatorio</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min (recomendado)</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min (1h)</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min (2h)</option>
              </select>
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
                      <option value="liguilla_ko">Liguilla + eliminatorias finales</option>
                    </select>
                  </div>
                ))}
              </div>

              {/* Sub-config para liguilla_ko */}
              {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).some(cat => tConfig.formatByCategory?.[cat] === 'liguilla_ko') && (
                <div style={{ marginTop: '0.85rem', padding: '0.75rem', borderRadius: '0.625rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Eliminatorias finales</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#1E293B', fontWeight: 600 }}>
                      Clasifican por categoría:
                      <select
                        value={tConfig.liguillaQualifyPerGroup ?? 2}
                        onChange={e => setTConfig({ ...tConfig, liguillaQualifyPerGroup: parseInt(e.target.value) })}
                        style={{ padding: '0.35rem 0.55rem', borderRadius: '0.4rem', border: '1.5px solid #FDE68A', fontSize: '0.78rem', backgroundColor: 'white', cursor: 'pointer' }}
                      >
                        <option value={2}>Top 2 (semifinales)</option>
                        <option value={4}>Top 4 (cuartos)</option>
                        <option value={8}>Top 8 (octavos)</option>
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#1E293B', fontWeight: 600, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!tConfig.liguillaThirdPlace}
                        onChange={e => setTConfig({ ...tConfig, liguillaThirdPlace: e.target.checked })}
                        style={{ width: '16px', height: '16px', accentColor: '#D97706' }}
                      />
                      Incluir partido por el 3º y 4º puesto
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ── Pistas asignadas por categoría ── */}
            <div style={{ padding: '1rem', backgroundColor: '#F0F9FF', borderRadius: '0.75rem', border: '1px solid #BAE6FD' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#075985' }}>
                🏟️ Pistas asignadas por categoría
              </label>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#0369A1', lineHeight: 1.5 }}>
                Marca en qué pistas se podrá programar cada categoría (cuadro principal y consolación). Si no marcas ninguna, el auto-programador podrá usar cualquier pista del torneo.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tConfig.categories.split(',').map(c => c.trim()).filter(Boolean).map(cat => {
                  const courtsAvailable = Array.from({ length: tConfig.courtsCount || 1 }, (_, i) => i + 1);
                  const mainAllowed = tConfig.courtsByCategory?.[cat]?.main || [];
                  const consAllowed = tConfig.courtsByCategory?.[cat]?.cons || [];
                  const toggleCourt = (kind, courtN) => {
                    const current = tConfig.courtsByCategory?.[cat]?.[kind] || [];
                    const next = current.includes(courtN) ? current.filter(c => c !== courtN) : [...current, courtN].sort((a, b) => a - b);
                    setTConfig({
                      ...tConfig,
                      courtsByCategory: {
                        ...tConfig.courtsByCategory,
                        [cat]: { ...(tConfig.courtsByCategory?.[cat] || {}), [kind]: next },
                      },
                    });
                  };
                  const renderRow = (kind, label, allowed) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ minWidth: '90px', fontSize: '0.78rem', color: '#0F172A', fontWeight: 700 }}>{label}</span>
                      {courtsAvailable.map(c => {
                        const checked = allowed.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCourt(kind, c)}
                            style={{ padding: '0.3rem 0.55rem', borderRadius: '0.4rem', border: `1.5px solid ${checked ? '#0EA5E9' : '#CBD5E1'}`, background: checked ? '#0EA5E9' : 'white', color: checked ? 'white' : '#475569', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}
                            title={getCourtName(c)}
                          >
                            {getCourtName(c)}
                          </button>
                        );
                      })}
                      {allowed.length === 0 && (
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontStyle: 'italic' }}>(todas)</span>
                      )}
                    </div>
                  );
                  return (
                    <div key={cat} style={{ padding: '0.6rem 0.75rem', borderRadius: '0.5rem', background: 'white', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#075985' }}>{cat}</span>
                      {renderRow('main', 'Principal', mainAllowed)}
                      {renderRow('cons', 'Consolación', consAllowed)}
                    </div>
                  );
                })}
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

            {/* ── Regalo por inscripción ── */}
            <div style={{ padding: '1rem', backgroundColor: '#F0F9FF', borderRadius: '0.75rem', border: '1px solid #BAE6FD' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#075985' }}>
                🎁 Regalo por inscripción
              </label>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#0369A1', lineHeight: 1.5 }}>
                Si eliges <strong>Camiseta</strong>, los jugadores tendrán que indicar su talla (XS-XXL) al inscribirse.
              </p>
              <select
                value={tConfig.gift || 'none'}
                onChange={e => setTConfig({ ...tConfig, gift: e.target.value })}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #BAE6FD', fontSize: '0.875rem', cursor: 'pointer', backgroundColor: 'white', color: '#0F172A' }}
              >
                <option value="none">Ninguno</option>
                <option value="shirt">Camiseta</option>
                <option value="material">Material deportivo</option>
              </select>
            </div>

            {/* ── Pago online de inscripción ── */}
            <div style={{ padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '0.75rem', border: '1px solid #BBF7D0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 800, color: '#166534', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!tConfig.registrationFeeEnabled}
                  onChange={e => setTConfig({ ...tConfig, registrationFeeEnabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#16A34A' }}
                />
                💳 Cobrar inscripción online
              </label>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#15803D', lineHeight: 1.5 }}>
                Mostrará a los jugadores el importe a pagar al inscribirse. La pasarela automática se conectará en una entrega aparte; mientras tanto el admin marca el pago como recibido a mano desde "Inscripciones".
              </p>
              {tConfig.registrationFeeEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <input
                      type="number" min="0" step="0.5"
                      placeholder="Importe"
                      value={tConfig.registrationFeeAmount ?? ''}
                      onChange={e => setTConfig({ ...tConfig, registrationFeeAmount: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #BBF7D0', fontSize: '0.875rem', backgroundColor: 'white', color: '#0F172A', boxSizing: 'border-box' }}
                    />
                    <select
                      value={tConfig.registrationFeeCurrency || 'EUR'}
                      onChange={e => setTConfig({ ...tConfig, registrationFeeCurrency: e.target.value })}
                      style={{ width: '90px', padding: '0.6rem 0.5rem', borderRadius: '0.625rem', border: '1.5px solid #BBF7D0', fontSize: '0.875rem', backgroundColor: 'white', cursor: 'pointer' }}
                    >
                      <option value="EUR">EUR €</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#166534', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={tConfig.registrationFeeRequired !== false}
                      onChange={e => setTConfig({ ...tConfig, registrationFeeRequired: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16A34A' }}
                    />
                    El pago es obligatorio para confirmar la inscripción
                  </label>
                </div>
              )}
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
            {publishedId && (
              <button onClick={openRegistrationsPanel} style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', backgroundColor: '#7C3AED', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                📋 Inscripciones
              </button>
            )}
            <button
              onClick={() => setShowSeedsPanel(true)}
              disabled={participants.length < 2}
              title={participants.length < 2 ? 'Añade al menos 2 parejas' : 'Selecciona los cabezas de serie por categoría'}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', backgroundColor: participants.length < 2 ? '#CBD5E1' : '#F59E0B', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: participants.length < 2 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              🏆 Cabezas de Serie
            </button>
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

            {/* QR del enlace público — para imprimir o compartir en redes */}
            {qrDataUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '0.75rem', border: '1.5px solid #BAE6FD', marginBottom: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📱 Código QR para inscribirse</p>
                <img src={qrDataUrl} alt="QR de inscripción al torneo" style={{ width: '180px', height: '180px', display: 'block' }} />
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = qrDataUrl;
                    a.download = `qr_inscripcion_${(tConfig.name || 'torneo').replace(/[^a-z0-9]+/gi, '_')}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #BAE6FD', backgroundColor: '#EFF6FF', color: '#0369A1', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  ⬇ Descargar QR
                </button>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B', textAlign: 'center', maxWidth: '260px' }}>
                  Imprímelo o cuélgalo en el club. Los jugadores lo escanean y van directos al formulario de inscripción.
                </p>
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  const fullConfig = { ...tConfig, rounds, consRounds, participants, phase };
                  const { error } = await supabase.from('tournaments')
                    .update({ config: fullConfig, name: tConfig.name || 'Torneo' })
                    .eq('id', publishedId);
                  if (error) throw error;
                  alert('✅ Enlace actualizado con la configuración actual (fechas, horarios, categorías, pistas, cuadros).');
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
            {publishedId && (
              <button
                onClick={toggleRegistrationClosed}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', backgroundColor: tConfig.registrationClosed ? '#16A34A' : '#DC2626', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {tConfig.registrationClosed ? '🔓 Reabrir inscripción' : '🔒 Cerrar inscripción'}
              </button>
            )}
          </div>
          {tConfig.registrationClosed && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#B91C1C', fontWeight: 700 }}>
              🔒 Las inscripciones están <strong>cerradas manualmente</strong>. Los jugadores no podrán apuntarse aunque el plazo aún no haya pasado.
            </p>
          )}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <h4 style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>
                Elenco "{newCoupleCategory || 'Todas'}": {participants.filter(p => !newCoupleCategory || p.category === newCoupleCategory).length} parejas
                <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: '0.5rem' }}>(total: {participants.length})</span>
              </h4>
              <button
                onClick={generateBracket}
                disabled={participants.length < 2}
                title={participants.length < 2 ? 'Añade al menos 2 parejas para generar el cuadro' : 'Genera el cuadro de eliminatoria/liguilla con las parejas inscritas'}
                style={{ padding: '0.5rem 0.95rem', borderRadius: '0.5rem', border: 'none', backgroundColor: participants.length < 2 ? '#CBD5E1' : '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.78rem', cursor: participants.length < 2 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
              >
                🎲 Generar Cuadro
              </button>
            </div>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.45rem', backgroundColor: '#FEF3C7', border: '1.5px solid #FDE68A', borderRadius: '0.4rem' }} title="Cabeza de serie (1 = 1º cabeza, 2 = 2º…). Vacío = sin seed.">
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Seed</span>
                        <input
                          type="number" min="1" max="64"
                          value={p.seed ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            const seedNum = v === '' ? null : Math.max(1, parseInt(v, 10));
                            setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, seed: seedNum } : x));
                          }}
                          style={{ width: '40px', padding: '0.15rem 0.3rem', border: '1px solid #FDE68A', borderRadius: '0.3rem', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', backgroundColor: 'white', color: '#0F172A' }}
                        />
                      </div>
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
      {/* ── Modal editor de horario con cuadrante día × pista × hora ── */}
      {editingTime && (() => {
        const occ = buildOccupancyMap();
        const activeDays = getActiveDates(tConfig.startDate, tConfig.endDate);
        const day = editingTimeDay || activeDays[0];
        // Horas válidas para ese día según tConfig (firstDayStartHour para el día 1)
        const isFirstDay = activeDays[0] === day;
        const sHourIdx = HOURS.indexOf(isFirstDay && tConfig.firstDayStartHour ? tConfig.firstDayStartHour : tConfig.startHour);
        const eHourIdx = HOURS.indexOf(tConfig.endHour);
        const dayHours = (sHourIdx >= 0 && eHourIdx >= 0) ? HOURS.slice(sHourIdx, eHourIdx) : HOURS;
        const courts = Array.from({ length: tConfig.courtsCount }, (_, i) => i + 1);
        const { match, isCons, cat } = editingTime;
        const currentSlot = match.time ? match.time.split(' - Pista')[0].trim() : null;
        const currentCourt = match.time ? parseInt(match.time.split(' - Pista')[1]) : null;

        return (
          <div
            onClick={() => setEditingTime(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
          >
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '860px', marginTop: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Elegir horario · {isCons ? 'Consolación' : 'Principal'} · {cat}</h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                    {match.p1?.name || '¿?'} <span style={{ color: '#CBD5E1' }}>vs</span> {match.p2?.name || '¿?'}
                  </p>
                </div>
                <button onClick={() => setEditingTime(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {activeDays.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setEditingTimeDay(d)}
                      style={{ padding: '0.5rem 0.9rem', borderRadius: '999px', border: `1.5px solid ${day === d ? '#1B3A6E' : '#CBD5E1'}`, background: day === d ? '#1B3A6E' : 'white', color: day === d ? 'white' : '#475569', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#F0FDF4', border: '1.5px solid #BBF7D0' }} /> Libre
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#FEE2E2', border: '1.5px solid #FECACA' }} /> Ocupada
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#DBEAFE', border: '1.5px solid #93C5FD' }} /> Selección actual
                  </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>Hora</th>
                        {courts.map(c => (
                          <th key={c} style={{ textAlign: 'center', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#0F172A', fontSize: '0.78rem', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', minWidth: '140px' }}>
                            {getCourtName(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayHours.map(hour => (
                        <tr key={hour}>
                          <td style={{ textAlign: 'right', padding: '0.45rem 0.75rem', color: '#475569', fontWeight: 700, borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{hour}</td>
                          {courts.map(c => {
                            const slot = `${day} ${hour}`;
                            const info = occ[slot]?.[c];
                            const isCurrent = currentSlot === slot && currentCourt === c;
                            const isThisMatch = info?.matchId === match.id;
                            const occupied = !!info && !isThisMatch;
                            const bg = isCurrent ? '#DBEAFE' : occupied ? '#FEE2E2' : '#F0FDF4';
                            const border = isCurrent ? '1.5px solid #93C5FD' : occupied ? '1.5px solid #FECACA' : '1.5px solid #BBF7D0';
                            return (
                              <td key={c} style={{ padding: '0.25rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0' }}>
                                <button
                                  type="button"
                                  disabled={occupied}
                                  onClick={() => !occupied && commitEditingTime(day, hour, c)}
                                  style={{ width: '100%', minHeight: '40px', padding: '0.25rem 0.4rem', borderRadius: '0.4rem', background: bg, border, color: occupied ? '#B91C1C' : isCurrent ? '#1D4ED8' : '#15803D', fontWeight: 700, fontSize: '0.7rem', cursor: occupied ? 'not-allowed' : 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                                  title={occupied ? `Ocupada: ${info.label}` : isCurrent ? 'Asignada a este partido' : 'Libre — pulsa para asignar'}
                                >
                                  {occupied ? info.label : isCurrent ? 'Actual' : 'Libre'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button type="button" onClick={clearEditingTime} style={{ padding: '0.55rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    Borrar horario (volverá a auto-asignarse)
                  </button>
                  <button type="button" onClick={() => setEditingTime(null)} style={{ padding: '0.55rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    Cerrar sin cambios
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Editor de pistas durante el torneo ── */}
      {showCourtsEditor && (
        <div onClick={() => setShowCourtsEditor(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '560px', marginTop: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>🏟️ Pistas del torneo</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Cambios efectivos al pulsar "🔄 Recalcular horarios". Los partidos ya jugados no se mueven.
                </p>
              </div>
              <button onClick={() => setShowCourtsEditor(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Número de pistas</label>
                <input
                  type="number" min="1" max="20"
                  value={tConfig.courtsCount}
                  onChange={e => {
                    const n = Math.max(1, parseInt(e.target.value || '1', 10));
                    // Limpiar courtStartHours fuera de rango
                    const next = {};
                    for (let c = 1; c <= n; c++) {
                      if (tConfig.courtStartHours?.[c]) next[c] = tConfig.courtStartHours[c];
                    }
                    setTConfig({ ...tConfig, courtsCount: n, courtStartHours: next });
                  }}
                  style={{ width: '120px', padding: '0.65rem 0.75rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', fontWeight: 700, fontSize: '1rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Nombre y hora de apertura por pista</label>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4 }}>
                  Pon un nombre personalizado si quieres que aparezca en lugar de "Pista N" (ej. "Pista Municipal"). La hora controla a partir de cuándo está disponible esa pista (deja la del torneo si no abre más tarde).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {Array.from({ length: tConfig.courtsCount }, (_, i) => i + 1).map(courtNum => (
                    <div key={courtNum} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                      <span style={{ minWidth: '60px', fontWeight: 700, fontSize: '0.78rem', color: '#94A3B8' }}>#{courtNum}</span>
                      <input
                        type="text"
                        placeholder={`Pista ${courtNum}`}
                        value={tConfig.courtNames?.[courtNum] || ''}
                        onChange={e => setTConfig({ ...tConfig, courtNames: { ...tConfig.courtNames, [courtNum]: e.target.value } })}
                        style={{ flex: '2 1 140px', minWidth: 0, padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}
                      />
                      <select
                        value={tConfig.courtStartHours?.[courtNum] || tConfig.startHour}
                        onChange={e => setTConfig({ ...tConfig, courtStartHours: { ...tConfig.courtStartHours, [courtNum]: e.target.value } })}
                        style={{ flex: '1 1 120px', minWidth: 0, padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        {HOURS.slice(HOURS.indexOf(tConfig.startHour), HOURS.indexOf(tConfig.endHour) + 1).map(h => (
                          <option key={h} value={h}>Desde {h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setShowCourtsEditor(false)} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  Cerrar
                </button>
                <button
                  onClick={() => { setShowCourtsEditor(false); recomputeAllAutoTimes(); }}
                  style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Aplicar y recalcular horarios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


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
            {publishedId && (
              <button onClick={toggleRegistrationClosed} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.4rem', backgroundColor: tConfig.registrationClosed ? '#16A34A' : '#DC2626', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {tConfig.registrationClosed ? '🔓 Reabrir' : '🔒 Cerrar inscripción'}
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
                onClick={recomputeAllAutoTimes}
                title="Re-asigna horarios de todos los partidos respetando afinidad de jugadores, orden entre rondas y cupo de pistas. No toca los horarios que hayas puesto manualmente."
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                🔄 Recalcular horarios
              </button>
              <button
                onClick={() => setShowCourtsEditor(true)}
                title="Añade o quita pistas del torneo y ajusta a partir de qué hora está disponible cada una."
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #FED7AA', backgroundColor: '#FFF7ED', color: '#9A3412', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                🏟️ Pistas
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
               <div style={{ padding: '1rem 1.5rem', backgroundColor: '#1E293B', borderRadius: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                 <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>
                   Categoría: {cat} — {tConfig.formatByCategory?.[cat] === 'liguilla_ko' ? 'Liguilla + KO' : 'Liguilla'}
                 </h2>
                 {!isExporting && tConfig.formatByCategory?.[cat] === 'liguilla_ko' && (!consRounds[cat] || consRounds[cat].length === 0) && (
                   <button onClick={() => generateLiguillaKO(cat)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#F59E0B', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                     🏆 Generar Eliminatorias Finales
                   </button>
                 )}
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
                           {(() => {
                             const isReady = match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye;
                             const show = isReady || match.timeManual;
                             return (
                               <span style={{ fontSize: '0.65rem', fontWeight: 700, color: show ? '#64748B' : '#CBD5E1' }}>
                                 {show ? (match.time ? displayTime(match.time) : 'Horario por definir') : 'Esperando rondas previas'}
                               </span>
                             );
                           })()}
                           {!isExporting && <button onClick={() => handleEditTime(match, false, cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.1rem' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>}
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center' }}>
                           {[{ player: match.p1, side: 'p1' }, { player: match.p2, side: 'p2' }].map(({ player, side }, sIdx) => {
                             const isWinner = match.winner?.id === player?.id;
                             return (
                               <div key={side} style={{ flex: 1, padding: '0.6rem 0.75rem', backgroundColor: isWinner ? '#DCFCE7' : 'transparent', borderRight: sIdx === 0 ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <span style={{ fontSize: '0.85rem', fontWeight: isWinner ? 800 : 600, color: isWinner ? '#16A34A' : '#334155', flex: 1 }}>{player?.name}</span>
                                 {match.score && <div style={{ display: 'flex', gap: '0.15rem' }}>{parseScore(match.score, sIdx).map((s, i) => <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, background: isWinner ? '#16A34A' : '#E2E8F0', color: isWinner ? 'white' : '#475569', borderRadius: '3px', padding: '0.05rem 0.25rem' }}>{s}</span>)}</div>}
                                 {isWinner && <span style={{ fontSize: '0.85rem' }}>🏆</span>}
                               </div>
                             );
                           })}
                         </div>
                         {!isExporting && (
                           <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid #F1F5F9' }}>
                             {editingScoreId === match.id ? (
                               <>
                                 <div style={{ display: 'flex', gap: '0.3rem' }}>
                                   <input autoFocus type="text" placeholder="Ej: 6-4 3-6 7-5" value={scoreInput} onChange={e => setScoreInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleScoreSubmit(match, scoreInput, false, cat); if (e.key === 'Escape') { setEditingScoreId(null); setScoreInput(''); } }} style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', fontSize: '0.78rem' }} />
                                   <button onClick={() => handleScoreSubmit(match, scoreInput, false, cat)} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#16A34A', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✓</button>
                                   <button onClick={() => { setEditingScoreId(null); setScoreInput(''); }} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✕</button>
                                 </div>
                                 <p style={{ margin: '0.3rem 0 0', fontSize: '0.62rem', color: '#16A34A', fontWeight: 600, textAlign: 'center' }}>
                                   ✨ El ganador se detecta automáticamente al guardar
                                 </p>
                               </>
                             ) : (
                               <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: match.score ? 'transparent' : '#F0FDF4', border: match.score ? 'none' : '1px solid #BBF7D0', borderRadius: '0.4rem', cursor: 'pointer', color: match.score ? '#64748B' : '#15803D', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', padding: '0.35rem 0.5rem' }}>
                                 {match.score ? `✎ ${match.score}` : '+ Introducir resultado (auto-detecta ganador)'}
                               </button>
                             )}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               ))}

               {/* Eliminatorias Finales (cuando format === 'liguilla_ko') */}
               {tConfig.formatByCategory?.[cat] === 'liguilla_ko' && consRounds[cat]?.length > 0 && (
                 <div style={{ marginTop: '2rem', padding: '1.25rem', backgroundColor: '#FFFBEB', borderRadius: '1rem', border: '1.5px solid #FDE68A' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                     <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#92400E' }}>🏆 Eliminatorias Finales</h3>
                     {!isExporting && (
                       <button onClick={() => setConsRounds(prev => ({ ...prev, [cat]: [] }))} style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                         Borrar y regenerar
                       </button>
                     )}
                   </div>
                   {consRounds[cat].map((roundMatches, kIdx) => {
                     const totalKoRounds = consRounds[cat].length;
                     const left = totalKoRounds - kIdx;
                     const roundLabel = left === 1 ? 'Final' : left === 2 ? 'Semifinales' : left === 3 ? 'Cuartos' : `Ronda ${kIdx + 1}`;
                     return (
                       <div key={kIdx} style={{ marginBottom: '1.25rem' }}>
                         <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{roundLabel}</h4>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                           {roundMatches.map(match => (
                             <div key={match.id} style={{ backgroundColor: 'white', border: '1.5px solid #FDE68A', borderRadius: '0.625rem', overflow: 'hidden' }}>
                               {match.isThirdPlace && (
                                 <div style={{ padding: '0.2rem 0.6rem', backgroundColor: '#FEF3C7', fontSize: '0.65rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>3º y 4º puesto</div>
                               )}
                               <div style={{ display: 'flex', alignItems: 'center' }}>
                                 {[{ player: match.p1, side: 'p1' }, { player: match.p2, side: 'p2' }].map(({ player, side }, sIdx) => {
                                   const isWinner = match.winner?.id === player?.id;
                                   return (
                                     <div key={side} style={{ flex: 1, padding: '0.5rem 0.7rem', backgroundColor: isWinner ? '#DCFCE7' : 'transparent', borderRight: sIdx === 0 ? '1px solid #FDE68A' : 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                       <span style={{ fontSize: '0.82rem', fontWeight: isWinner ? 800 : 600, color: isWinner ? '#16A34A' : (player ? '#334155' : '#CBD5E1'), flex: 1 }}>
                                         {player ? player.name : 'Por definir'}
                                       </span>
                                       {isWinner && <span>🏆</span>}
                                     </div>
                                   );
                                 })}
                               </div>
                               {!isExporting && match.p1 && match.p2 && (
                                 <div style={{ padding: '0.3rem 0.5rem', borderTop: '1px solid #FEF3C7' }}>
                                   {editingScoreId === match.id ? (
                                     <div style={{ display: 'flex', gap: '0.3rem' }}>
                                       <input autoFocus type="text" placeholder="Ej: 6-4 6-3" value={scoreInput} onChange={e => setScoreInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleScoreSubmit(match, scoreInput, true, cat); if (e.key === 'Escape') { setEditingScoreId(null); setScoreInput(''); } }} style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', fontSize: '0.78rem' }} />
                                       <button onClick={() => handleScoreSubmit(match, scoreInput, true, cat)} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#16A34A', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✓</button>
                                       <button onClick={() => { setEditingScoreId(null); setScoreInput(''); }} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>✕</button>
                                     </div>
                                   ) : (
                                     <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: match.score ? 'transparent' : '#F0FDF4', border: match.score ? 'none' : '1px solid #BBF7D0', borderRadius: '0.4rem', cursor: 'pointer', color: match.score ? '#64748B' : '#15803D', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', padding: '0.3rem 0.5rem' }}>
                                       {match.score ? `✎ ${match.score}` : '+ Introducir resultado'}
                                     </button>
                                   )}
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                     );
                   })}
                 </div>
               )}
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
                { title: `🥇 Principal · ${cat}`, data: catRounds, isCons: false, id: `export-main-${cat.replace(/\s+/g, '_')}` },
                { title: `🥈 Consolación · ${cat}`, data: catCons, isCons: true, id: `export-cons-${cat.replace(/\s+/g, '_')}` }
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
            
            {/* Si es el cuadro de consolación, lo pintamos invertido (Final a la
                izquierda, R0 a la derecha) para distinguirlo del principal.
                Conservamos originalIdx para que getRoundName y la lógica de
                swap (rIdx === 0) sigan funcionando con el índice real. */}
            {(() => {
              const indexedRounds = bracket.data.map((round, originalIdx) => ({ round, originalIdx }));
              const renderedRounds = bracket.isCons ? [...indexedRounds].reverse() : indexedRounds;
              return (
            <div style={{ display: 'flex', overflowX: 'auto', gap: '2.5rem', paddingBottom: '2rem', minHeight: '350px', alignItems: 'stretch' }}>
              {renderedRounds.map(({ round: roundMatches, originalIdx: rIdx }) => (
                <div key={`round-${rIdx}`} style={{ display: 'flex', flexDirection: 'column', minWidth: '220px' }}>
                  <h4 style={{ textAlign: 'center', color: bracket.isCons ? '#D97706' : '#16A34A', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem 0', padding: '0.35rem 0.75rem', backgroundColor: bracket.isCons ? '#FFFBEB' : '#F0FDF4', borderRadius: '0.5rem', border: `1px solid ${bracket.isCons ? '#FDE68A' : '#DCFCE7'}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {getRoundName(rIdx, bracket.data.length)}
                  </h4>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                  {roundMatches.map(match => (
                    <div key={match.id} style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', margin: '1rem 0', opacity: match.p1?.isBye && match.p2?.isBye ? 0.3 : 1 }}>
                      {(!match.p1?.isBye && !match.p2?.isBye) && (
                        <div style={{ backgroundColor: '#F8FAFC', padding: '0.4rem 0.75rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {(() => {
                            const isReady = match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye;
                            const show = isReady || match.timeManual;
                            return (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: show ? '#64748B' : '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {show ? (match.time ? displayTime(match.time) : 'Horario por definir') : 'Esperando rondas previas'}
                              </span>
                            );
                          })()}
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
                            onClick={swappable ? () => handleSwapPlayers(cat, bracket.isCons, match.matchIndex, side) : undefined}
                            style={{ padding: '0.6rem 0.75rem', backgroundColor: bg, borderBottom: sIdx === 0 ? '1.5px solid #F1F5F9' : 'none', cursor: swappable ? 'pointer' : 'default', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem', outline: isSelected ? '2px solid #7C3AED' : 'none' }}
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
                            <>
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
                                  style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1.5px solid #CBD5E1', borderRadius: '0.4rem', fontSize: '0.78rem', fontFamily: 'inherit', minWidth: 0 }}
                                />
                                <button onClick={() => handleScoreSubmit(match, scoreInput, bracket.isCons, cat)} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#16A34A', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>✓</button>
                                <button onClick={() => { setEditingScoreId(null); setScoreInput(''); }} style={{ padding: '0.3rem 0.5rem', border: 'none', borderRadius: '0.4rem', backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>✕</button>
                              </div>
                              <p style={{ margin: '0.3rem 0 0', fontSize: '0.62rem', color: '#16A34A', fontWeight: 600, textAlign: 'center' }}>
                                ✨ El ganador se detecta automáticamente al guardar
                              </p>
                            </>
                          ) : (
                            <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: match.score ? 'transparent' : '#F0FDF4', border: match.score ? 'none' : '1px solid #BBF7D0', borderRadius: '0.4rem', cursor: 'pointer', color: match.score ? '#64748B' : '#15803D', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', padding: '0.35rem 0.5rem' }}>
                              {match.score ? `✎ ${match.score}` : '+ Introducir resultado (auto-detecta ganador)'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ))}

              {/* "Campeón" siempre al final del flujo visual: si es consolación
                  la columna del trofeo va a la IZQUIERDA (porque ya invertimos
                  el orden de las rondas, así queda al lado de la final). */}
              {!bracket.isCons && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '180px' }}>
                  <h4 style={{ textAlign: 'center', color: '#F59E0B', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                    Campeón Absoluto
                  </h4>
                  <div style={{ backgroundColor: '#FEF3C7', border: `2px solid #F59E0B`, borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#D97706' }}>
                      {bracket.data[bracket.data.length - 1]?.[0]?.winner?.name || 'TBD'}
                    </span>
                  </div>
                </div>
              )}
            </div>
              );
            })()}
            {/* Trofeo a la izquierda en consolación, fuera del scroll wrapper para
                que aparezca antes visualmente (en columnas) */}
            {bracket.isCons && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', backgroundColor: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏆 Campeón Consolación</span>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: '#D97706' }}>
                  {bracket.data[bracket.data.length - 1]?.[0]?.winner?.name || 'TBD'}
                </span>
              </div>
            )}
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
  const { user } = useAuth();
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
    if (!window.confirm('¿Estás seguro de que quieres eliminar este torneo permanentemente?\n\nTambién se borrarán todas las inscripciones asociadas.')) return;

    // 1) Borrar inscripciones asociadas primero (por si el FK no tiene ON DELETE CASCADE).
    const { error: regErr } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('tournament_id', id);
    if (regErr) {
      console.warn('Error borrando inscripciones:', regErr);
      alert('Error al borrar inscripciones: ' + regErr.message);
      return;
    }

    // 2) Borrar el torneo.
    const { error, count } = await supabase
      .from('tournaments')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
      return;
    }
    if (count === 0) {
      // RLS bloqueó el borrado silenciosamente (no eres admin o no está aplicada la migración).
      alert('No se pudo eliminar el torneo. Verifica que estás logeado como admin y que la migración RLS está aplicada en Supabase.');
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

  // Sube a Supabase cualquier torneo que haya quedado en el localStorage de
  // este navegador (por usar una versión antigua de la app). Evita duplicados
  // comparando por nombre + startDate contra lo que ya exista en DB.
  const syncLocalTournamentsToDb = async () => {
    const found = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('padel_medina_tournament_')) continue;
      if (key === 'padel_medina_tournaments_list') continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const cfg = data.tConfig || {};
        const name = cfg.name || data.name || null;
        if (!name) continue;
        const config = { ...cfg, rounds: data.rounds || {}, consRounds: data.consRounds || {}, participants: data.participants || [], phase: data.phase || 'config' };
        found.push({ name, config, startDate: cfg.startDate || null, localKey: key });
      } catch {}
    }
    if (found.length === 0) {
      alert('No hay torneos locales pendientes de subir en este dispositivo.');
      return;
    }

    // Coger lo que ya está en DB para detectar duplicados por (nombre + startDate)
    const { data: existing, error: exErr } = await supabase
      .from('tournaments')
      .select('id, name, config');
    if (exErr) {
      alert('Error al consultar torneos existentes: ' + exErr.message);
      return;
    }
    const isDup = (candidate) => (existing || []).some(t =>
      (t.name || '').trim().toLowerCase() === candidate.name.trim().toLowerCase()
      && (t.config?.startDate || null) === (candidate.startDate || null)
    );

    const toUpload = found.filter(f => !isDup(f));
    if (toUpload.length === 0) {
      alert(`Los ${found.length} torneos locales ya están en la base de datos. No se subió nada nuevo.`);
      return;
    }

    const rows = toUpload.map(f => ({
      name: f.name,
      config: f.config,
      status: 'draft',
      admin_id: user?.id || null,
    }));

    const { error: insErr } = await supabase.from('tournaments').insert(rows);
    if (insErr) {
      alert('Error al subir torneos: ' + insErr.message + '\n\nSi ves un error de RLS, aplica la migración 20260422_tournaments_admin_write.sql en Supabase.');
      return;
    }

    alert(`✅ ${toUpload.length} torneo${toUpload.length === 1 ? '' : 's'} subido${toUpload.length === 1 ? '' : 's'} a la base de datos. Se verá${toUpload.length === 1 ? '' : 'n'} ahora desde cualquier dispositivo.`);
    fetchTournaments();
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
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0F172A' }}>Mis Torneos</h1>
            <p style={{ margin: '0.2rem 0 0', color: '#64748B', fontSize: '0.9rem' }}>Gestiona tus competiciones activas y crea nuevas.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={syncLocalTournamentsToDb}
              title="Sube a la base de datos cualquier torneo que haya quedado solo en el navegador (versión antigua de la app)."
              style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', backgroundColor: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', border: '1.5px solid #CBD5E1', fontSize: '0.82rem' }}
            >
              🔄 Sincronizar desde este dispositivo
            </button>
            <button onClick={createNewTournament} style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, cursor: 'pointer', border: 'none', boxShadow: '0 4px 6px -1px rgba(22,163,74,0.2)' }}>
               ➕ Crear Nuevo Torneo
            </button>
          </div>
       </div>
       <p style={{ margin: '0 0 1.25rem', fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.5 }}>
         ¿Ves distintos torneos en cada dispositivo aunque uses la misma cuenta? Entra desde el dispositivo donde creaste el torneo y pulsa <strong>Sincronizar desde este dispositivo</strong>: subirá a Supabase lo que haya quedado solo en ese navegador.
       </p>

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
