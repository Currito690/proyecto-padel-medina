import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast, confirmDialog } from '../../utils/notify';
import { toTitleCase, normalizeForCompare } from '../../utils/names';
import { useServerTime, formatNowShort, isServerTimeSynced, serverNowMs } from '../../utils/serverTime';

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
  // Reservas externas (gente que reservó pista normal) en el rango de
  // fechas del torneo. El scheduler las trata como slots ocupados, así
  // ningún partido del torneo cae sobre una reserva.
  // Formato: { 'DD/MM HH:MM': Set<court_id> }
  const [externalBookings, setExternalBookings] = useState({});
  // Filtro de categoría en el panel de inscripciones. 'Todas' muestra todo.
  const [regsCatFilter, setRegsCatFilter] = useState('Todas');
  // Modal de edición de disponibilidad para una inscripción online concreta.
  // Reutiliza gridBlockedSlots / handleCellMouseDown del editor de parejas.
  const [editingRegAvail, setEditingRegAvail] = useState(null);
  const [savingRegAvail, setSavingRegAvail] = useState(false);
  // QR del enlace público de inscripción (data URL para mostrar y descargar)
  const [qrDataUrl, setQrDataUrl] = useState('');
  // Panel de cabezas de serie (selector por categoría)
  const [showSeedsPanel, setShowSeedsPanel] = useState(false);
  // Editor de pistas durante el torneo (panel modal)
  const [showCourtsEditor, setShowCourtsEditor] = useState(false);
  // Modal/panel admin-only con el listado de TODOS los partidos del torneo
  // agrupados por día y ordenados por hora. Útil para imprimir el "parte del
  // día" o llamar a las parejas en orden.
  const [showMatchesList, setShowMatchesList] = useState(false);
  const [matchesListDayFilter, setMatchesListDayFilter] = useState('all');
  const [matchesListPdfLoading, setMatchesListPdfLoading] = useState(false);
  // Modal pre-generación: deja al admin elegir/confirmar el formato
  // (eliminatoria, liguilla, liguilla+KO) por cada categoría antes de
  // generar el cuadro. Estado pickerFormats es la copia editable que se
  // aplicará a tConfig.formatByCategory al pulsar "Generar".
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [pickerFormats, setPickerFormats] = useState({});
  // Selector de destinatarios para el correo de "cuadro publicado/actualizado".
  // Permite al admin elegir qué parejas reciben el aviso (por defecto todas
  // las confirmadas con correo válido). Útil para reenviar solo a las que
  // se quedaron fuera por rate-limit en envíos previos.
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientPickerData, setRecipientPickerData] = useState([]);
  const [recipientPickerSelected, setRecipientPickerSelected] = useState(() => new Set());
  const [recipientPickerKind, setRecipientPickerKind] = useState('published');
  const [recipientPickerSending, setRecipientPickerSending] = useState(false);
  // Si true, al generar el cuadro NO se auto-asignan horarios a la primera
  // ronda. El admin los pone a mano viendo la disponibilidad de los jugadores.
  const [pickerManualR0, setPickerManualR0] = useState(false);
  // Selección de qué categorías regenerar (de uno en uno o todas a la vez).
  // Por defecto se marcan las que NO tienen rounds aún. El admin puede
  // marcar/desmarcar para regenerar solo las que quiera y conservar las demás.
  const [pickerSelectedCats, setPickerSelectedCats] = useState({});
  // Estructura del cuadro cuando el nº de parejas no es potencia de 2:
  //   false (default) → Ronda Previa (cuadro principal más pequeño)
  //   true            → Octavos con byes (cuadro principal más grande)
  const [pickerUseByes, setPickerUseByes] = useState(false);

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

  // Carga las reservas externas (gente que ha reservado pista normal) en
  // el rango de fechas del torneo. Las usa el scheduler para no pisar
  // huecos ya reservados por otros usuarios. También las usa el editor
  // de horario manual para mostrar esos slots como ocupados.
  const loadExternalBookings = async () => {
    if (!tConfig.startDate || !tConfig.endDate) return {};
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('date, time_slot, court_id, status')
        .gte('date', tConfig.startDate)
        .lte('date', tConfig.endDate)
        .eq('status', 'confirmed');
      if (error) throw error;
      const map = {};
      (data || []).forEach(b => {
        const [y, m, d] = b.date.split('-');
        const slot = `${d}/${m} ${b.time_slot}`;
        if (!map[slot]) map[slot] = new Set();
        map[slot].add(b.court_id);
      });
      setExternalBookings(map);
      return map;
    } catch (e) {
      console.warn('No se pudieron cargar las reservas externas:', e?.message || e);
      return {};
    }
  };
  // Cargar al montar / cuando cambian las fechas del torneo
  useEffect(() => {
    if (!dbLoaded) return;
    loadExternalBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoaded, tConfig.startDate, tConfig.endDate]);

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

  const handleResetTournament = async () => {
    const ok = await confirmDialog(
      '¿Estás seguro de que quieres borrar este torneo y empezar uno nuevo? Se perderán todas las parejas y el cuadro generado.',
      { title: 'Reiniciar torneo', okText: 'Borrar y empezar', danger: true }
    );
    if (ok) {
      localStorage.removeItem(`padel_medina_tournament_${tournamentKey}`);
      setPhase('config');
      setTConfig({ name: '', categories: 'Masculino, Femenino', startDate: '', endDate: '', registrationDeadline: '', registrationDeadlineTime: '23:59', startHour: '09:00', endHour: '22:00', firstDayStartHour: '16:00', courtsCount: 2, courtStartHours: {}, matchDurationByCategory: { 'Masculino': 90, 'Femenino': 90 } });
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
      toast('¡Torneo publicado! Ya aparece en la página pública y puedes enviar el enlace a los jugadores.', 'success');
    } catch (e) {
      console.error(e);
      toast('Error al publicar el torneo: ' + (e.message || e));
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
      toast('Error al cargar inscripciones: ' + error.message);
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
    const ok = await confirmDialog(
      `¿${verb} la pareja "${reg.player1_name} y ${reg.player2_name}" (${reg.category})?\n\nSe enviará un correo a la pareja.`,
      { title: action === 'confirm' ? 'Confirmar inscripción' : 'Rechazar inscripción', okText: action === 'confirm' ? 'Confirmar' : 'Rechazar', danger: action === 'reject' }
    );
    if (!ok) return;

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    const updates = { confirmation_status: newStatus, confirmed_at: new Date().toISOString() };

    const { error: updErr } = await supabase
      .from('tournament_registrations')
      .update(updates)
      .eq('id', reg.id);
    if (updErr) { toast('Error al actualizar la inscripción: ' + updErr.message); return; }

    // Optimistic update local
    setRegsList(prev => prev.map(r => r.id === reg.id ? { ...r, ...updates } : r));

    // Disparamos el correo. Si falla solo avisamos: el cambio de estado ya está guardado.
    const emails = [reg.player1_email, reg.player2_email]
      .map(e => (e || '').trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast(`Pareja ${action === 'confirm' ? 'confirmada' : 'rechazada'} en BBDD, pero no había ningún correo guardado y no se ha podido avisar.`);
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
        toast(`Estado guardado, pero el correo no se pudo enviar: ${fnErr?.message || data?.error || 'desconocido'}`);
      }
    } catch (e) {
      console.error('invoke error', e);
      toast(`Estado guardado, pero el correo no se pudo enviar: ${e?.message || e}`);
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
    if (error) { toast('Error: ' + error.message); return; }
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
    const manualOnly = participants.filter(p => !regsList.some(r => r.id === p.id));
    if (regsList.length === 0 && manualOnly.length === 0) { toast('No hay inscripciones que exportar.', 'error'); return; }
    const headers = ['Origen','Categoría','Jugador 1','Email 1','Tel 1','Talla 1','Jugador 2','Email 2','Tel 2','Talla 2','Estado pago','Importe','Pagado en','Fecha inscripción'];
    const onlineRows = regsList.map(r => [
      'Online',
      r.category,
      r.player1_name, r.player1_email, r.player1_phone, r.player1_shirt_size || r.shirt_size || '',
      r.player2_name, r.player2_email, r.player2_phone, r.player2_shirt_size || '',
      r.payment_status,
      r.amount_paid != null ? Number(r.amount_paid).toFixed(2) : '',
      r.paid_at ? new Date(r.paid_at).toLocaleString('es-ES') : '',
      r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : '',
    ]);
    const manualRows = manualOnly.map(p => [
      'Manual',
      p.category || '',
      p.name, '', '', p.player1_shirt_size || '',
      '', '', '', p.player2_shirt_size || '',
      '', '', '', '',
    ]);
    const csv = [headers, ...onlineRows, ...manualRows].map(row => row.map(csvEscape).join(',')).join('\n');
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
        toast(
          `Se han añadido ${newParticipants.length} pareja(s) confirmada(s) desde la web.` +
          (pendingCount > 0 ? `\n\n⚠️ Hay ${pendingCount} pareja(s) pendiente(s) de validar — no entran al cuadro hasta que las confirmes.` : '')
        );
      } else {
        toast(
          'No hay inscripciones confirmadas nuevas.' +
          (pendingCount > 0 ? `\n\n⚠️ Hay ${pendingCount} pareja(s) pendiente(s) de validar.` : '')
        );
      }
    } catch (e) {
      console.error(e);
      toast('Error al sincronizar las inscripciones online.', 'error');
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
      toast('Plazo de inscripción actualizado.');
    } catch (e) {
      console.error(e);
      toast('Error al actualizar el plazo.', 'error');
    }
  };

  // Cierre/reapertura manual de inscripciones por parte del admin.
  // Independiente de la fecha límite — si está cerrado, la web pública
  // bloquea el formulario aunque el plazo aún no haya pasado.
  const toggleRegistrationClosed = async () => {
    if (!publishedId) { toast('Publica primero el torneo.'); return; }
    const closing = !tConfig.registrationClosed;
    if (closing) {
      const ok = await confirmDialog(
        '¿Cerrar las inscripciones ahora? Los jugadores no podrán apuntarse hasta que vuelvas a abrirlas.',
        { title: 'Cerrar inscripción', okText: 'Cerrar inscripción', danger: true }
      );
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
      toast(closing ? '🔒 Inscripciones cerradas.' : '🔓 Inscripciones reabiertas.');
    } catch (e) {
      console.error(e);
      toast('Error al actualizar el estado de las inscripciones.', 'error');
    }
  };

  const handlePublishBracket = async () => {
    if (!publishedId) {
      toast('Primero debes publicar el torneo (Fase 2).');
      return;
    }
    const wasPublished = !!tConfig.bracketPublished;
    // Aviso si el plazo de inscripción aún está abierto: publicar el cuadro
    // antes de tiempo bloquea inscripciones que aún podrían llegar.
    const deadlineStr = tConfig.registrationDeadline;
    const deadlineTime = tConfig.registrationDeadlineTime || '23:59';
    if (!wasPublished && deadlineStr) {
      const deadlineMs = new Date(`${deadlineStr}T${deadlineTime}:00`).getTime();
      // Hora del servidor (no del navegador del admin) para que un reloj
      // mal puesto no salte el aviso de "plazo aún abierto".
      if (serverNowMs() < deadlineMs) {
        const fmtDay = new Date(deadlineStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const fmt = `${fmtDay} a las ${deadlineTime}`;
        const ok = await confirmDialog(
          `⚠️ El plazo de inscripción todavía está abierto hasta el ${fmt}.\n\n` +
          'Si publicas el cuadro ahora, el enlace público pasará a mostrar el cuadro y se cerrará la posibilidad de inscribirse.\n\n' +
          '¿Estás seguro de que quieres publicar el cuadro?',
          { title: 'Publicar cuadro', okText: 'Publicar cuadro', danger: true }
        );
        if (!ok) return;
      }
    }
    try {
      // En la primera publicación, marcamos bracketPublished=true en DB.
      // Si ya estaba publicado (re-publicar = solo notificar), saltamos
      // este paso porque la flag y el config ya están actualizados.
      if (!wasPublished) {
        const tConfigWithFlag = { ...tConfig, bracketPublished: true };
        const config = { ...tConfigWithFlag, rounds, consRounds, participants, phase };
        const { error } = await supabase.from('tournaments')
          .update({ config, status: 'open' })
          .eq('id', publishedId);
        if (error) throw error;
        setTConfig(tConfigWithFlag);
        toast('🏆 Cuadro publicado. Elige a qué parejas avisar por correo.', 'success');
      }

      // Abrir el selector de destinatarios. El admin elige qué parejas
      // reciben el correo (por defecto todas las confirmadas con correo
      // válido). Esto evita el problema del rate-limit de Resend cuando
      // antes se mandaba todo de golpe.
      await openRecipientPicker(wasPublished ? 'updated' : 'published');
    } catch (e) {
      console.error(e);
      toast('Error al publicar el cuadro: ' + (e.message || e), 'error');
    }
  };

  // Abre el modal con la lista de parejas confirmadas + correo válido.
  // El admin marca/desmarca y al pulsar "Enviar" llama a la edge function
  // solo con los seleccionados.
  const openRecipientPicker = async (kind) => {
    if (!publishedId) return;
    try {
      const { data: regs, error } = await supabase
        .from('tournament_registrations')
        .select('id, category, player1_name, player2_name, player1_email, player2_email')
        .eq('tournament_id', publishedId)
        .eq('confirmation_status', 'confirmed')
        .order('category', { ascending: true })
        .order('player1_name', { ascending: true });
      if (error) throw error;
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const withEmails = (regs || []).filter(r =>
        emailRe.test((r.player1_email || '').trim()) ||
        emailRe.test((r.player2_email || '').trim())
      );
      if (withEmails.length === 0) {
        toast('No hay parejas confirmadas con correo válido a las que avisar.', 'warning');
        return;
      }
      setRecipientPickerKind(kind);
      setRecipientPickerData(withEmails);
      setRecipientPickerSelected(new Set(withEmails.map(r => r.id)));
      setRecipientPickerOpen(true);
    } catch (e) {
      toast('Error al cargar parejas: ' + (e.message || e), 'error');
    }
  };

  const sendBracketEmailsToSelected = async () => {
    if (recipientPickerSending) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const selectedRegs = recipientPickerData.filter(r => recipientPickerSelected.has(r.id));
    const emails = Array.from(new Set(
      selectedRegs.flatMap(r => [r.player1_email, r.player2_email])
        .map(e => (e || '').trim().toLowerCase())
        .filter(e => emailRe.test(e))
    ));
    if (emails.length === 0) {
      toast('Marca al menos una pareja con correo válido.', 'warning');
      return;
    }
    setRecipientPickerSending(true);
    try {
      const tournamentUrl = `${window.location.origin}/torneos/${publishedId}/cuadro`;
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-bracket-published', {
        body: {
          emails,
          tournamentName: tConfig.name || 'Torneo',
          tournamentUrl,
          kind: recipientPickerKind,
        },
      });
      if (fnErr || (fnData && fnData.error)) {
        toast(`Error al enviar correos: ${fnErr?.message || fnData?.error || 'desconocido'}`, 'error');
      } else {
        const sent = fnData?.sent ?? emails.length;
        const failed = fnData?.failed ?? 0;
        toast(`📧 Enviado a ${sent} jugador${sent === 1 ? '' : 'es'}${failed > 0 ? ` (${failed} fallido${failed === 1 ? '' : 's'})` : ''}`, 'success');
        setRecipientPickerOpen(false);
      }
    } catch (e) {
      toast('Error al enviar correos: ' + (e.message || e), 'error');
    } finally {
      setRecipientPickerSending(false);
    }
  };

  const addParticipant = (e) => {
    e.preventDefault();
    if (!newCouple.trim()) return;

    const catList = tConfig.categories.split(',').map(c => c.trim()).filter(Boolean);
    const assignedCat = newCoupleCategory || catList[0] || 'General';
    const normalizedName = toTitleCase(newCouple);

    // Detección de duplicados en la misma categoría (case/accent insensitive).
    const dup = participants.some(p =>
      p.category === assignedCat &&
      normalizeForCompare(p.name) === normalizeForCompare(normalizedName)
    );
    if (dup) {
      toast(`Ya hay una pareja "${normalizedName}" en la categoría ${assignedCat}.`, 'error');
      return;
    }

    setParticipants([...participants, {
      id: Date.now().toString(),
      name: normalizedName,
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
      const currentMatch = rArray[rIdx][mIdx];
      // nextSlot: routing personalizado, usado en partidos de la ronda PREVIA
      // — el ganador va a un slot concreto del cuadro principal en lugar de
      // seguir la regla estándar (matchIdx/2). En partidos normales no existe
      // y caemos al cálculo clásico.
      let nextMatchIdx, isTop;
      if (Number.isFinite(currentMatch.nextSlot)) {
        const targetSlot = currentMatch.nextSlot;
        nextMatchIdx = Math.floor(targetSlot / 2);
        isTop = targetSlot % 2 === 0;
      } else {
        nextMatchIdx = Math.floor(mIdx / 2);
        isTop = mIdx % 2 === 0;
      }
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

  // Abre el modal pre-generación con los formatos actuales pre-seleccionados.
  // Permite al admin confirmar/cambiar el formato por categoría antes de
  // disparar la generación, sin tener que volver a la pantalla de Config.
  const openFormatPicker = () => {
    if (participants.length < 2) {
      toast('Añade al menos 2 parejas para crear un torneo.');
      return;
    }
    if (!tConfig.startDate || !tConfig.endDate) {
      toast("Configura las fechas de inicio y fin del torneo antes de generar el cuadro.\n\nVuelve a Configuración y rellena los campos 'Fecha de Inicio' y 'Fecha de Fin'.");
      return;
    }
    const cats = (tConfig.categories || '').split(',').map(c => c.trim()).filter(Boolean);
    const initial = {};
    const initialSel = {};
    cats.forEach(c => {
      initial[c] = tConfig.formatByCategory?.[c] || 'eliminatoria';
      // Por defecto NO marcamos ninguna: el admin elige explícitamente
      // qué categoría/s regenerar. Sin esto, si abre el modal y pulsa
      // Generar sin pensarlo, podría regenerar varias categorías a la vez
      // (incluyendo las que ya tenía hechas o las que no quería tocar).
      initialSel[c] = false;
    });
    setPickerFormats(initial);
    setPickerSelectedCats(initialSel);
    setPickerManualR0(false); // por defecto auto-schedule completo
    setPickerUseByes(false); // por defecto: ronda previa
    setShowFormatPicker(true);
  };

  // Aplica los formatos elegidos a tConfig y dispara la generación. La
  // generación regenera rounds/consRounds (es lo que hace generateBracket
  // de toda la vida) — no toca el resto de la config (fechas, pistas,
  // cabezas de serie, parejas, ni los horarios manuales que estaban en
  // matches que sigan existiendo si la pareja sigue en el cuadro).
  const confirmFormatPicker = () => {
    const newFormats = { ...(tConfig.formatByCategory || {}), ...pickerFormats };
    setTConfig(prev => ({ ...prev, formatByCategory: newFormats }));
    setShowFormatPicker(false);
    const manualR0 = pickerManualR0;
    const useByes = pickerUseByes;
    // Lista de categorías a regenerar EN ESTA pasada. Si ninguna está
    // marcada, asumimos "todas" (compatibilidad con el botón directo).
    const onlyCats = Object.entries(pickerSelectedCats).filter(([, v]) => v).map(([c]) => c);
    if (onlyCats.length === 0) {
      toast('Marca al menos una categoría para generar.', 'error');
      return;
    }
    // Pequeño delay para que el setState se aplique antes de generar
    setTimeout(() => generateBracket(newFormats, { manualR0, onlyCats, useByes }), 50);
  };

  const generateBracket = (overrideFormats, opts = {}) => {
    if (participants.length < 2) {
      toast("Añade al menos 2 parejas para crear un torneo.");
      return;
    }
    if (!tConfig.startDate || !tConfig.endDate) {
      toast("Configura las fechas de inicio y fin del torneo antes de generar el cuadro.\n\nVuelve a Configuración y rellena los campos 'Fecha de Inicio' y 'Fecha de Fin'.");
      return;
    }
    // Validación de duplicados por categoría: misma pareja repetida rompe el cuadro.
    const dupsByCat = {};
    participants.forEach(part => {
      const key = `${part.category}::${normalizeForCompare(part.name)}`;
      dupsByCat[key] = (dupsByCat[key] || 0) + 1;
    });
    const dupes = Object.entries(dupsByCat).filter(([, n]) => n > 1).map(([k]) => k.split('::')[1]);
    if (dupes.length > 0) {
      toast(`Hay parejas duplicadas en la misma categoría: ${[...new Set(dupes)].join(', ')}. Elimina una de cada antes de generar el cuadro.`, 'error');
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
    // Colchón de 14 días tras el endDate: si el torneo se queda corto de
    // slots para todos los partidos, las horas "extendidas" siguen estando en
    // globalSlots y las comparaciones de orden temporal funcionan. Sin esto
    // la final podía caer al primer slot libre del día 1.
    if (tConfig.endDate) {
      const endDate = new Date(tConfig.endDate + 'T12:00:00');
      for (let i = 1; i <= 14; i++) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() + i);
        const label = fmtDateLabel(d);
        for (let h = sHourIdx; h < eHourIdx; h++) {
          if (h >= 0 && h < HOURS.length) globalSlots.push(`${label} ${HOURS[h]}`);
        }
      }
    }

    // Diccionario para registrar cuántos partidos hay en cada hora
    // (compatibilidad — algunas funciones todavía lo leen)
    let slotUsage = {};
    globalSlots.forEach(s => slotUsage[s] = 0);

    // Tracking de disponibilidad POR PISTA (no solo por slot). Sin esto,
    // si una categoría está restringida a Pista 2, el scheduler le mete
    // dos partidos al mismo slot+pista (porque Pista 1 sigue libre y la
    // capacidad del slot total es 2). Con `occupied[slot]` (Set de
    // pistas tomadas) lo evitamos.
    // Pre-poblamos con las reservas externas (gente que reservó pista
    // normal): el scheduler trata esos slots+pista como ocupados, así no
    // se cuela un partido del torneo encima de una reserva ya hecha.
    const occupied = {};
    Object.entries(externalBookings).forEach(([slot, courts]) => {
      occupied[slot] = new Set(courts);
      slotUsage[slot] = (slotUsage[slot] ?? 0) + courts.size;
    });
    const markOccupied = (slot, court) => {
      if (!occupied[slot]) occupied[slot] = new Set();
      occupied[slot].add(court);
      slotUsage[slot] = (slotUsage[slot] ?? 0) + 1;
    };
    const isCourtFree = (slot, court) => !(occupied[slot]?.has(court));

    // Tracking POR PAREJA: en qué slots ya está jugando cada pareja. Si
    // una pareja está inscrita en DOS categorías (Masculino C y Masculino D),
    // sus partidos no pueden coincidir en la misma franja horaria. Sin esto
    // el scheduler le pone dos partidos a la misma hora en distinta pista.
    const playerSlots = {}; // { participantId: Set<slot> }
    const markPlayerSlot = (slot, p1, p2) => {
      [p1, p2].forEach(p => {
        if (!p || p.isBye || p.isPlaceholder || p.isPrelimPlaceholder) return;
        if (!playerSlots[p.id]) playerSlots[p.id] = new Set();
        playerSlots[p.id].add(slot);
      });
    };
    const arePlayersFree = (slot, p1, p2) => {
      for (const p of [p1, p2]) {
        if (!p || p.isBye || p.isPlaceholder || p.isPrelimPlaceholder) continue;
        if (playerSlots[p.id]?.has(slot)) return false;
      }
      return true;
    };

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

    // Normaliza la categoría preservando el formato dual ("A y B"). Si la
    // categoría guardada no coincide con ninguna del torneo en absoluto,
    // fallback a la primera. Si es dual con al menos una válida, se mantiene.
    const splitCatStr = (raw) => (raw || '').split(/\s+y\s+|\s+\+\s+/).map(s => s.trim()).filter(Boolean);
    const normalizedParticipants = expandedParticipants.map(exp => {
      if (exp.isBye) return exp;
      if (catList.length === 1) return { ...exp, category: catList[0] };
      const parts = splitCatStr(exp.category);
      const anyValid = parts.some(p => catList.some(c => c.toLowerCase() === p.toLowerCase()));
      if (!anyValid) return { ...exp, category: catList[0] };
      return exp; // mantener tal cual (puede ser "A y B")
    });

    catList.forEach(cat => {
       // Modo "regenerar solo algunas categorías": si opts.onlyCats está
       // definido y esta cat no está en él, conservamos su cuadro actual
       // (si lo tiene). Así el admin puede generar de uno en uno sin
       // perder los cuadros ya hechos.
       if (opts.onlyCats && !opts.onlyCats.includes(cat)) {
         if (rounds && rounds[cat] && rounds[cat].length > 0) {
           newAllRounds[cat] = rounds[cat];
           // También marcamos sus slots como ocupados para que las cats
           // que SÍ se regeneran no pisen los horarios existentes.
           rounds[cat].forEach(round => round.forEach(m => {
             if (!m.time || m.time === 'A convenir') return;
             const parts = m.time.split(' - Pista');
             const slot = parts[0].trim();
             const court = parseInt(parts[1], 10);
             if (Number.isFinite(court)) markOccupied(slot, court);
             markPlayerSlot(slot, m.p1, m.p2);
           }));
         }
         return;
       }

       // Una pareja con categoría "Masculino C y Masculino D" debe aparecer
       // en AMBAS catList (cuadro de C y cuadro de D). El scheduler enforce
       // que no se solapen sus partidos vía playerSlots.
       let catParts = normalizedParticipants.filter(exp => {
         const parts = splitCatStr(exp.category);
         return parts.some(p => p.toLowerCase() === cat.toLowerCase()) || exp.category === cat;
       });
       if (catParts.length < 2) return;

       // overrideFormats viene del modal de "Generar Cuadro" — lo aplicamos
       // aquí porque el setState de tConfig todavía puede no haberse aplicado.
       const format = overrideFormats?.[cat] || tConfig.formatByCategory?.[cat] || 'eliminatoria';

       // ── Helpers del scheduler (compartidos por liguilla y eliminatoria) ──
       const allowedCourtsForCat = getAllowedCourts(cat, false);
       const slotMinutesGen = (s) => {
         if (!s) return -1;
         const parts = s.split(' ');
         if (parts.length !== 2) return -1;
         const [d, m] = parts[0].split('/').map(Number);
         const [h, mi] = parts[1].split(':').map(Number);
         if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(h)) return -1;
         return ((m - 1) * 31 + (d - 1)) * 24 * 60 + h * 60 + (mi || 0);
       };
       // pickSlotCourtForMatch: encuentra { slot, court } válido respetando
       //   - earliestMinutes (orden temporal con predecesores + barrera)
       //   - allowedCourtsForCat (pistas permitidas por categoría)
       //   - occupied (qué pistas ya están tomadas en cada slot — across cats)
       //   - tConfig.courtStartHours (a partir de qué hora abre cada pista)
       //   - preferred (afinidad horaria de los jugadores; preferencia)
       //   - p1, p2: para evitar que la misma pareja juegue 2 partidos a la
       //     vez en categorías distintas (caso doble inscripción).
       const pickSlotCourtForMatch = (earliestMinutes, preferred = null, p1 = null, p2 = null) => {
         const tryList = (list) => {
           for (const s of list) {
             if (slotMinutesGen(s) < earliestMinutes) continue;
             if (!arePlayersFree(s, p1, p2)) continue; // anti-solape
             const hourPart = s.split(' ')[1];
             for (const c of allowedCourtsForCat) {
               if (!isCourtFree(s, c)) continue;
               const startsAt = tConfig.courtStartHours?.[c];
               if (startsAt && hourPart < startsAt) continue;
               return { slot: s, court: c };
             }
           }
           return null;
         };
         if (preferred && preferred.length > 0) {
           const f = tryList(preferred);
           if (f) return f;
         }
         const f2 = tryList(globalSlots);
         if (f2) return f2;
         const lastSlot = globalSlots[globalSlots.length - 1];
        if (lastSlot) {
           const [lastDateLabel, lastHour] = lastSlot.split(' ');
           const lastHourIdx = HOURS.indexOf(lastHour);
           for (let h = lastHourIdx + 1; h < HOURS.length; h++) {
             const s = `${lastDateLabel} ${HOURS[h]}`;
             if (slotMinutesGen(s) < earliestMinutes) continue;
             if (!arePlayersFree(s, p1, p2)) continue;
             for (const c of allowedCourtsForCat) {
               if (!isCourtFree(s, c)) continue;
               const startsAt = tConfig.courtStartHours?.[c];
               if (startsAt && HOURS[h] < startsAt) continue;
               return { slot: s, court: c };
             }
           }
           const [ld, lm] = lastDateLabel.split('/').map(Number);
           const lastDateObj = new Date(new Date().getFullYear(), lm - 1, ld);
           for (let extra = 1; extra <= 60; extra++) {
             const next = new Date(lastDateObj);
             next.setDate(lastDateObj.getDate() + extra);
             const nextLabel = fmtDateLabel(next);
             for (let h = 0; h < HOURS.length; h++) {
               const s = `${nextLabel} ${HOURS[h]}`;
               if (slotMinutesGen(s) < earliestMinutes) continue;
               if (!arePlayersFree(s, p1, p2)) continue;
               for (const c of allowedCourtsForCat) {
                 if (!isCourtFree(s, c)) continue;
                 const startsAt = tConfig.courtStartHours?.[c];
                 if (startsAt && HOURS[h] < startsAt) continue;
                 return { slot: s, court: c };
               }
             }
           }
         }
         return null;
       };

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
             const picked = pickSlotCourtForMatch(0, common, t1, t2);
             const time = picked
               ? `${picked.slot} - Pista ${picked.court}`
               : 'Sin horario';
             if (picked) {
               markOccupied(picked.slot, picked.court);
               markPlayerSlot(picked.slot, t1, t2);
             }
             roundMatches.push({
               id: `rr-${cat}-r${r}-m${roundMatches.length}`,
               round: r, matchIndex: roundMatches.length,
               p1: t1, p2: t2, winner: null, score: null, isRR: true,
               time,
             });
           }
           if (roundMatches.length > 0) rrCatRounds.push(roundMatches);
           const last = pool.pop();
           pool.splice(1, 0, last);
         }
         newAllRounds[cat] = rrCatRounds;
         return;
       }

       // ── Cuadro eliminatoria — dos estrategias posibles ──────────────────
       // a) RONDA PREVIA (default): mayor potencia de 2 ≤ totalParejas como
       //    tamaño del cuadro principal. El sobrante juega una ronda PREVIA
       //    corta y los ganadores entran al cuadro principal.
       // b) OCTAVOS CON BYES (opts.useByes): siguiente potencia de 2 ≥ total
       //    como tamaño del cuadro principal, con byes para rellenar. Estructura
       //    clásica con todos los partidos en R1 (octavos) y algunas parejas
       //    pasan directas a cuartos por bye.
       let floorPow = 1;
       while (floorPow * 2 <= catParts.length) floorPow *= 2;
       let ceilPow = 1;
       while (ceilPow < catParts.length) ceilPow *= 2;
       const useByesMode = !!opts.useByes && catParts.length > 1;
       const mainBracketSize = useByesMode ? ceilPow : floorPow;
       const prelimMatchCount = useByesMode ? 0 : (catParts.length - floorPow);
       const directCount = mainBracketSize - prelimMatchCount; // plazas directas en main

       const seedPositions = (n) => {
         if (n === 1) return [1];
         const half = seedPositions(n / 2);
         const out = [];
         for (const s of half) { out.push(s); out.push(n + 1 - s); }
         return out;
       };
       const positions = seedPositions(mainBracketSize);

       const seededHere = catParts
         .filter(p => Number.isFinite(p.seed) && p.seed > 0)
         .sort((a, b) => a.seed - b.seed);
       const unseededAll = catParts.filter(p => !seededHere.some(s => s.id === p.id));
       // Mezcla aleatoria del unseeded para evitar sesgo de orden de inscripción
       for (let i = unseededAll.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [unseededAll[i], unseededAll[j]] = [unseededAll[j], unseededAll[i]];
       }

       const slot = new Array(mainBracketSize).fill(null);
       // 1) Coloca los seeds en sus posiciones estándar (#1 y #2 en lados
       //    opuestos del cuadro, etc.)
       seededHere.forEach(p => {
         const idx = positions.indexOf(p.seed);
         if (idx >= 0 && idx < mainBracketSize) slot[idx] = p;
       });

       let catRounds;

       if (prelimMatchCount === 0) {
         // El nº de parejas es ya potencia de 2 (o useByes=true → relleno con
         // byes). Rellenamos slots libres con unseeded en el orden mezclado;
         // si faltan, rellenamos con BYEs distribuidos para no juntar dos byes
         // en el mismo R1 (regla: máx 1 bye por partido de R1).
         const byesNeededHere = Math.max(0, mainBracketSize - catParts.length);
         if (byesNeededHere === 0) {
           let ui = 0;
           for (let i = 0; i < mainBracketSize; i++) {
             if (slot[i]) continue;
             slot[i] = unseededAll[ui++];
           }
         } else {
           // useByes mode con sobrantes: distribuye byes inteligentemente.
           // Reglas:
           //  1) Cada seed prefiere bye en SU partido de R1 (ventaja).
           //  2) Los byes restantes se reparten entre cuartos DIFERENTES
           //     (no dos byes en partidos R1 que alimentan el mismo cuarto)
           //     hasta que cada cuarto tenga 1, luego 2, etc. — round-robin.
           //  3) Sin esto, dos byes adyacentes feeding el mismo cuarto
           //     producen un cuarto donde ambas parejas pasan directas
           //     (ej. "Miguel y Juanan vs Fabián" antes de jugar nada).
           const byeSlots = new Set();
           const matchesWithBye = new Set();
           let byesAllocated = 0;
           // 1) Seeds primero
           const seedSlotsSorted = seededHere
             .map(p => positions.indexOf(p.seed))
             .filter(i => i >= 0 && i < mainBracketSize)
             .sort((a, b) => slot[a].seed - slot[b].seed);
           for (const sIdx of seedSlotsSorted) {
             if (byesAllocated >= byesNeededHere) break;
             const matchIdx = Math.floor(sIdx / 2);
             if (matchesWithBye.has(matchIdx)) continue;
             byeSlots.add(sIdx ^ 1);
             matchesWithBye.add(matchIdx);
             byesAllocated++;
           }
           // 2) Byes restantes round-robin por cuartos (mainBracketSize/4
           //    cuartos; cada cuarto = 2 R1 matches consecutivos).
           //    Buscamos siempre el cuarto con menos byes y le metemos uno.
           const numR1 = mainBracketSize / 2;
           const numCuartos = Math.max(1, Math.floor(mainBracketSize / 4));
           const cuartoByeCount = new Array(numCuartos).fill(0);
           // Cuenta los byes ya colocados (de los seeds) por cuarto
           matchesWithBye.forEach(m => {
             const c = Math.floor(m / 2);
             if (c < numCuartos) cuartoByeCount[c]++;
           });
           while (byesAllocated < byesNeededHere) {
             // Encuentra cuarto con menos byes que tenga al menos un R1 libre
             let pick = -1;
             let minCount = Infinity;
             for (let c = 0; c < numCuartos; c++) {
               if (cuartoByeCount[c] >= 2) continue; // cuarto ya saturado
               // Comprueba si hay R1 libre en este cuarto
               const m1 = c * 2, m2 = c * 2 + 1;
               const m1Free = !matchesWithBye.has(m1);
               const m2Free = !matchesWithBye.has(m2);
               if (!m1Free && !m2Free) continue;
               if (cuartoByeCount[c] < minCount) {
                 minCount = cuartoByeCount[c];
                 pick = c;
               }
             }
             if (pick < 0) break; // no más sitio
             // Dentro del cuarto elegido, escoge un R1 libre
             const m1 = pick * 2, m2 = pick * 2 + 1;
             const chosenM = !matchesWithBye.has(m1) ? m1 : m2;
             const s1 = chosenM * 2, s2 = chosenM * 2 + 1;
             const target = slot[s1] ? s2 : (slot[s2] ? s1 : s2);
             byeSlots.add(target);
             matchesWithBye.add(chosenM);
             cuartoByeCount[pick]++;
             byesAllocated++;
           }
           // Fallback si quedó algún bye por colocar
           for (let m = 0; m < numR1 && byesAllocated < byesNeededHere; m++) {
             if (matchesWithBye.has(m)) continue;
             const s1 = m * 2, s2 = m * 2 + 1;
             const target = slot[s1] ? s2 : (slot[s2] ? s1 : s2);
             byeSlots.add(target);
             matchesWithBye.add(m);
             byesAllocated++;
           }
           let ui = 0;
           for (let i = 0; i < mainBracketSize; i++) {
             if (slot[i]) continue;
             if (byeSlots.has(i)) {
               slot[i] = { id: `bye-${cat}-${i}`, name: '---', isBye: true };
             } else if (ui < unseededAll.length) {
               slot[i] = unseededAll[ui++];
             } else {
               slot[i] = { id: `bye-${cat}-${i}`, name: '---', isBye: true };
             }
           }
         }
         catParts = slot;

         const numRounds = Math.log2(mainBracketSize);
         catRounds = [];
         for (let r = 0; r < numRounds; r++) {
           const numMatchesInRound = mainBracketSize / Math.pow(2, r + 1);
           const matches = [];
           for (let m = 0; m < numMatchesInRound; m++) {
             matches.push({
               id: `cat-${cat}-r${r}-m${m}`,
               round: r,
               matchIndex: m,
               p1: r === 0 ? catParts[m * 2] : null,
               p2: r === 0 ? catParts[m * 2 + 1] : null,
               winner: null, time: null, score: null,
             });
           }
           catRounds.push(matches);
         }
       } else {
         // 2) Hay sobrantes → ronda previa.
         //    Las (directCount - seeds) parejas mejor "rankeadas" del unseeded
         //    pasan directas; el resto juega previa.
         const directUnseededNeeded = Math.max(0, directCount - seededHere.length);
         const directUnseeded = unseededAll.slice(0, directUnseededNeeded);
         const prelimPairs = unseededAll.slice(directUnseededNeeded);

         // 3) Identifica los slots del cuadro principal donde irán los
         //    ganadores de previa: los slots con seed-rank más alto (los
         //    que normalmente serían los seeds peores: N, N-1, …). Así el
         //    #1 enfrenta a un ganador de previa en R1 — no a un directo.
         const slotsByRank = [];
         for (let s = 0; s < floorPow; s++) slotsByRank.push({ slot: s, rank: positions[s] });
         slotsByRank.sort((a, b) => b.rank - a.rank);
         const prelimSlotIdxs = [];
         for (const { slot: s } of slotsByRank) {
           if (slot[s]) continue; // ya hay un seed
           prelimSlotIdxs.push(s);
           if (prelimSlotIdxs.length === prelimMatchCount) break;
         }

         // Crea placeholders en esos slots
         prelimSlotIdxs.forEach((slotIdx, pi) => {
           slot[slotIdx] = {
             id: `prelim-winner-${cat}-${pi}`,
             name: `Ganador previa ${pi + 1}`,
             isPrelimPlaceholder: true,
             prelimMatchIdx: pi,
           };
         });

         // Rellena slots restantes con direct unseeded
         let dui = 0;
         for (let i = 0; i < floorPow; i++) {
           if (slot[i]) continue;
           slot[i] = directUnseeded[dui++];
         }
         catParts = slot;

         // 4) Construye los partidos de la previa con nextSlot apuntando al
         //    slot del cuadro principal donde caerá el ganador.
         const prelimMatches = [];
         for (let pi = 0; pi < prelimMatchCount; pi++) {
           prelimMatches.push({
             id: `cat-${cat}-r0-prelim-${pi}`,
             round: 0,
             matchIndex: pi,
             p1: prelimPairs[pi * 2],
             p2: prelimPairs[pi * 2 + 1],
             winner: null, time: null, score: null,
             isPrelim: true,
             nextSlot: prelimSlotIdxs[pi],
           });
         }

         // 5) Cuadro principal a partir de round 1 (porque la previa es R0)
         const numRoundsMain = Math.log2(floorPow);
         const mainRounds = [];
         for (let r = 0; r < numRoundsMain; r++) {
           const numMatches = floorPow / Math.pow(2, r + 1);
           const matches = [];
           for (let m = 0; m < numMatches; m++) {
             matches.push({
               id: `cat-${cat}-r${r + 1}-m${m}`,
               round: r + 1,
               matchIndex: m,
               p1: r === 0 ? catParts[m * 2] : null,
               p2: r === 0 ? catParts[m * 2 + 1] : null,
               winner: null, time: null, score: null,
             });
           }
           mainRounds.push(matches);
         }

         catRounds = [prelimMatches, ...mainRounds];
       }

       // Si opts.manualR0 está activo, NO programamos horarios para R0.
       // El admin pondrá cada hora del primer partido a mano (con el editor
       // de horario que ya tiene cada match). El resto de rondas se siguen
       // programando con barrera de ronda — al asignar manualmente la hora
       // de R0 podrá pulsar "Recalcular horarios" para que las siguientes
       // se reorganicen respetando la elección manual.
       if (catRounds[0] && !opts.manualR0) {
         catRounds[0].forEach(match => {
           if (match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye) {
              const p1Final = match.p1.finalSlots || [];
              const p2Final = match.p2.finalSlots || [];
              let common = p1Final.filter(s => p2Final.includes(s));
              if (common.length === 0) common = p1Final.length > 0 ? p1Final : (p2Final.length > 0 ? p2Final : globalSlots);
              const picked = pickSlotCourtForMatch(0, common, match.p1, match.p2);
              if (picked) {
                markOccupied(picked.slot, picked.court);
                markPlayerSlot(picked.slot, match.p1, match.p2);
                match.time = `${picked.slot} - Pista ${picked.court}`;
              }
           }
         });
       }

       // Pre-assign slots for rounds 1+ so the full schedule is visible upfront.
       // CRÍTICO: cada partido tiene que ir DESPUÉS de los dos partidos que le dan
       // jugadores. Si los cuartos acaban a las 21:00, las semifinales no pueden
       // ponerse a las 18:00 del mismo día. Para partidos cuyos predecesores son
       // BYEs (sin time), aplicamos una "barrera de ronda": no pueden ir antes
       // que el último partido real de la ronda anterior.
       const getSlotPart = (t) => t ? t.split(' - Pista')[0].trim() : null;
       const durationMin = tConfig.matchDurationByCategory?.[cat] ?? 90;
       const restMin = parseInt(tConfig.restMinutesBetweenMatches ?? 30, 10) || 0;
       const gapSlots = Math.ceil((durationMin + restMin) / 60);
       const gapMinutes = gapSlots * 60;
       const hasPrelim = !!catRounds[0]?.[0]?.isPrelim;

       // Distribución por días: si el torneo dura varios días, NO queremos
       // que la final caiga el día 1. Asignamos cada ronda a un día mínimo
       // proporcional: r=0 → día 0, r=última (final) → último día, el resto
       // repartidos linealmente. Si el torneo es de 1 solo día, sin efecto.
       const numRoundsTotal = catRounds.length;
       const numDaysTotal = activeDateList.length;
       const minDayForRound = (r) => {
         if (numDaysTotal <= 1 || numRoundsTotal <= 1) return 0;
         return Math.round((r * (numDaysTotal - 1)) / (numRoundsTotal - 1));
       };
       const minDayMinutesForRound = (r) => {
         const idx = minDayForRound(r);
         const dateLabel = activeDateList[idx];
         if (!dateLabel) return 0;
         const startH = idx === 0 ? (tConfig.firstDayStartHour || tConfig.startHour) : tConfig.startHour;
         return slotMinutesGen(`${dateLabel} ${startH}`);
       };

       // computeEarliestMinutes: timestamp mínimo permitido (en minutos absolutos)
       // para un partido de ronda r, partido mIdx. Combina:
       //   - predecesores específicos (con previa: nextSlot routing; sino m/2)
       //   - barrera de ronda: max time de cualquier partido real en r-1
       //   - día mínimo asignado a la ronda (la final cae el último día)
       const computeEarliestMinutes = (r, mIdx) => {
         if (r === 0) return 0;
         let predTimes = [];
         if (r === 1 && hasPrelim) {
           const targetSlots = [mIdx * 2, mIdx * 2 + 1];
           predTimes = catRounds[0]
             .filter(p => p.isPrelim && targetSlots.includes(p.nextSlot))
             .map(p => p.time);
         } else {
           const predA = catRounds[r - 1][mIdx * 2];
           const predB = catRounds[r - 1][mIdx * 2 + 1];
           predTimes = [predA?.time, predB?.time];
         }
         const minutes = predTimes.map(t => slotMinutesGen(getSlotPart(t))).filter(m => m >= 0);
         const predEarliest = minutes.length > 0 ? Math.max(...minutes) + gapMinutes : 0;
         const barrierMinutes = catRounds[r - 1]
           .map(m => slotMinutesGen(getSlotPart(m.time)))
           .filter(m => m >= 0);
         const barrier = barrierMinutes.length > 0 ? Math.max(...barrierMinutes) + gapMinutes : 0;
         const minDay = minDayMinutesForRound(r);
         return Math.max(predEarliest, barrier, minDay);
       };

       // Si manualR0=true, NO programamos R1+ tampoco. El admin pone las
       // horas de la primera ronda viendo la disponibilidad de los jugadores,
       // y después pulsa "Recalcular horarios" para auto-asignar R1+ usando
       // como base las horas manuales que ha fijado. Sin esto, el R1+ se
       // queda con horas auto-asignadas y ocupando pistas que el admin ve
       // como "ocupadas" al ir a poner el R0.
       if (!opts.manualR0) {
         // PASS 1: Pre-asigna slot+pista a R1+ respetando:
         //   - earliestMinutes (orden temporal)
         //   - allowedCourtsForCat (pistas permitidas por categoría)
         //   - occupied (pistas ya tomadas en cada slot, across categorías)
         //   - afinidad de jugadores (cuando son conocidos)
         for (let r = 1; r < catRounds.length; r++) {
           catRounds[r].forEach((match, mIdx) => {
             const earliestMinutes = computeEarliestMinutes(r, mIdx);
             let preferred = null;
             if (match.p1?.finalSlots && match.p2?.finalSlots && !match.p1.isBye && !match.p2.isBye && !match.p1.isPlaceholder && !match.p2.isPlaceholder && !match.p1.isPrelimPlaceholder && !match.p2.isPrelimPlaceholder) {
               const common = match.p1.finalSlots.filter(s => match.p2.finalSlots.includes(s));
               if (common.length > 0) preferred = common;
             }
             const picked = pickSlotCourtForMatch(earliestMinutes, preferred, match.p1, match.p2);
             if (picked) {
               markOccupied(picked.slot, picked.court);
               markPlayerSlot(picked.slot, match.p1, match.p2);
               match.time = `${picked.slot} - Pista ${picked.court}`;
             }
           });
         }

         // PASS 2: Validación. Si algún match quedó en una hora anterior a sus
         // predecesores, lo reasignamos. Hasta 3 iteraciones para propagar.
         for (let pass = 0; pass < 3; pass++) {
           let fixed = 0;
           for (let r = 1; r < catRounds.length; r++) {
             catRounds[r].forEach((match, mIdx) => {
               if (!match.time) return;
               const earliestMinutes = computeEarliestMinutes(r, mIdx);
               const curMinutes = slotMinutesGen(getSlotPart(match.time));
               if (curMinutes >= 0 && curMinutes < earliestMinutes) {
                 const oldParts = match.time.split(' - Pista');
                 const oldSlot = oldParts[0].trim();
                 const oldCourt = parseInt(oldParts[1], 10);
                 if (occupied[oldSlot] && Number.isFinite(oldCourt)) {
                   occupied[oldSlot].delete(oldCourt);
                   slotUsage[oldSlot] = Math.max(0, (slotUsage[oldSlot] ?? 0) - 1);
                 }
                 // También liberamos el slot viejo del tracking por jugador
                 [match.p1, match.p2].forEach(p => {
                   if (p && playerSlots[p.id]) playerSlots[p.id].delete(oldSlot);
                 });
                 const picked = pickSlotCourtForMatch(earliestMinutes, null, match.p1, match.p2);
                 if (picked) {
                   markOccupied(picked.slot, picked.court);
                   markPlayerSlot(picked.slot, match.p1, match.p2);
                   match.time = `${picked.slot} - Pista ${picked.court}`;
                   fixed++;
                 }
               }
             });
           }
           if (fixed === 0) break;
         }
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
      toast('No hay suficientes parejas en ninguna categoría para generar un cuadro. Asegúrate de tener al menos 2 parejas por categoría.', 'error');
      return;
    }

    setRounds(newAllRounds);
    // Si estamos regenerando solo algunas categorías, conservamos las
    // consolaciones de las que NO se regeneran.
    if (opts.onlyCats && Array.isArray(opts.onlyCats)) {
      setConsRounds(prev => {
        const next = {};
        Object.entries(prev || {}).forEach(([cat, val]) => {
          if (!opts.onlyCats.includes(cat)) next[cat] = val;
        });
        return next;
      });
    } else {
      setConsRounds({});
    }
    setPhase('bracket');
    } catch (err) {
      console.error('generateBracket error:', err);
      toast('Error al generar el cuadro: ' + (err?.message || String(err)));
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
    // Pre-poblamos con reservas externas: aparecen en el editor de horario
    // como ocupadas por "Reserva de pista" — el admin las ve y no puede
    // pisarlas con un partido del torneo.
    Object.entries(externalBookings).forEach(([slot, courts]) => {
      if (!map[slot]) map[slot] = {};
      courts.forEach(c => {
        map[slot][c] = {
          matchId: `booking-${slot}-${c}`,
          cat: null,
          isCons: false,
          label: '🔒 Reserva de pista',
        };
      });
    });
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
    // extraDays=14: incluimos 14 días de colchón después del endDate para
    // que cualquier hora "extendida" siga estando en globalSlots y los
    // comparadores de orden temporal (slotIdx) funcionen correctamente.
    const globalSlots = buildGlobalSlots(14);
    if (globalSlots.length === 0) { toast('Configura las fechas del torneo antes de recalcular.', 'error'); return; }
    const getSlot = (t) => t ? t.split(' - Pista')[0].trim() : null;
    // slotMinutes: ya no usamos slotIdx. Convertimos cada slot a minutos
    // absolutos para comparar tiempos correctamente incluso si el slot está
    // FUERA de globalSlots (caso típico cuando el scheduler extiende a días
    // posteriores al endDate del torneo).
    const slotMinutesGlobal = (s) => {
      if (!s) return -1;
      const parts = s.split(' ');
      if (parts.length !== 2) return -1;
      const [d, m] = parts[0].split('/').map(Number);
      const [h, mi] = parts[1].split(':').map(Number);
      if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(h)) return -1;
      return ((m - 1) * 31 + (d - 1)) * 24 * 60 + h * 60 + (mi || 0);
    };
    const slotIdx = (s) => globalSlots.indexOf(s);

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
        const hasPrelim = !!catRounds[0]?.[0]?.isPrelim;
        // Día mínimo para cada ronda: spread proporcional a lo largo del
        // torneo (R0 → día 1, final → último día, intermedias repartidas).
        const activeDatesArr = getActiveDates(tConfig.startDate, tConfig.endDate);
        const numDays = activeDatesArr.length;
        const numRounds = catRounds.length;
        const minDayIdxForRound = (r) => {
          if (numDays <= 1 || numRounds <= 1) return 0;
          return Math.round((r * (numDays - 1)) / (numRounds - 1));
        };
        const minDayIdxToSlotIdx = (dayIdx) => {
          const dateLabel = activeDatesArr[dayIdx];
          if (!dateLabel) return 0;
          const startH = dayIdx === 0 ? (tConfig.firstDayStartHour || tConfig.startHour) : tConfig.startHour;
          const slot = `${dateLabel} ${startH}`;
          const idx = globalSlots.indexOf(slot);
          return idx >= 0 ? idx : 0;
        };
        for (let r = 0; r < catRounds.length; r++) {
          // Barrera de ronda: ningún match de r puede ir antes que el último
          // match real de r-1 (también si los predecesores específicos son byes
          // sin time, cosa habitual en consolación).
          const barrierIndices = r > 0
            ? catRounds[r - 1].map(pm => slotIdx(getSlot(pm.time))).filter(i => i >= 0)
            : [];
          const barrierIdx = barrierIndices.length > 0 ? Math.max(...barrierIndices) + gapSlots : 0;
          const minDaySlot = r > 0 ? minDayIdxToSlotIdx(minDayIdxForRound(r)) : 0;

          catRounds[r].forEach((m, mIdx) => {
            if (m.timeManual && m.time) return; // respeta lo puesto por admin
            if (!m.p1 || !m.p2 || m.p1.isBye || m.p2.isBye) return;

            let earliestIdx = 0;
            if (r > 0) {
              // Con ronda previa, los partidos de R1 reciben ganadores via
              // `nextSlot` (no por la regla m/2). Sin previa o para r >= 2,
              // mapping estándar.
              let predTimes = [];
              if (r === 1 && hasPrelim) {
                const targetSlots = [mIdx * 2, mIdx * 2 + 1];
                predTimes = catRounds[0]
                  .filter(p => p.isPrelim && targetSlots.includes(p.nextSlot))
                  .map(p => p.time);
              } else {
                const predA = catRounds[r - 1][mIdx * 2];
                const predB = catRounds[r - 1][mIdx * 2 + 1];
                predTimes = [predA?.time, predB?.time];
              }
              const indices = predTimes.map(t => slotIdx(getSlot(t))).filter(i => i >= 0);
              const predEarliestIdx = indices.length > 0 ? Math.max(...indices) + gapSlots : 0;
              earliestIdx = Math.max(predEarliestIdx, barrierIdx, minDaySlot);
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

    // PASS 2: validación post-pase. Si algún match auto-asignado quedó antes
    // que sus predecesores (caso byes/placeholders), lo reasignamos. Hasta 3
    // iteraciones para propagar reajustes a rondas más tardías.
    const validateAndFixPass = (catRoundsObj, isCons) => {
      Object.entries(catRoundsObj).forEach(([cat, catRounds]) => {
        const durationMin = tConfig.matchDurationByCategory?.[cat] ?? 90;
        const gapSlots = Math.ceil((durationMin + restMin) / 60);
        const allowedCourts = getAllowedCourts(cat, isCons);
        const hasPrelim = !!catRounds[0]?.[0]?.isPrelim;
        for (let pass = 0; pass < 3; pass++) {
          let fixed = 0;
          for (let r = 1; r < catRounds.length; r++) {
            catRounds[r].forEach((m, mIdx) => {
              if (m.timeManual && m.time) return;
              if (!m.time) return;
              const barrierIndices = catRounds[r - 1]
                .map(pm => slotIdx(getSlot(pm.time)))
                .filter(i => i >= 0);
              const barrierIdx = barrierIndices.length > 0 ? Math.max(...barrierIndices) + gapSlots : 0;
              let predTimes = [];
              if (r === 1 && hasPrelim) {
                const targetSlots = [mIdx * 2, mIdx * 2 + 1];
                predTimes = catRounds[0]
                  .filter(p => p.isPrelim && targetSlots.includes(p.nextSlot))
                  .map(p => p.time);
              } else {
                const predA = catRounds[r - 1][mIdx * 2];
                const predB = catRounds[r - 1][mIdx * 2 + 1];
                predTimes = [predA?.time, predB?.time];
              }
              const indices = predTimes.map(t => slotIdx(getSlot(t))).filter(i => i >= 0);
              const predEarliestIdx = indices.length > 0 ? Math.max(...indices) + gapSlots : 0;
              const earliestIdx = Math.max(predEarliestIdx, barrierIdx);
              const curIdx = slotIdx(getSlot(m.time));
              if (curIdx >= 0 && curIdx < earliestIdx) {
                const occupied = buildOccupiedCourts(nextMain, nextCons);
                const p1Slots = expandPlayerSlots(m.p1, globalSlots);
                const p2Slots = expandPlayerSlots(m.p2, globalSlots);
                let common = p1Slots.filter(s => p2Slots.includes(s));
                if (common.length === 0) common = p1Slots.length > 0 ? p1Slots : (p2Slots.length > 0 ? p2Slots : globalSlots);
                const picked = pickSlotAndCourt(common, occupied, allowedCourts, globalSlots, earliestIdx);
                if (picked) {
                  m.time = `${picked.slot} - Pista ${picked.court}`;
                  fixed++;
                }
              }
            });
          }
          if (fixed === 0) break;
        }
      });
    };
    validateAndFixPass(nextMain, false);
    validateAndFixPass(nextCons, true);

    setRounds(nextMain);
    setConsRounds(nextCons);
    toast('✅ Horarios recalculados respetando afinidad de jugadores, orden entre rondas y cupo de pistas. Los horarios que tú hayas puesto a mano se respetaron.', 'success');
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
          const globalSlots = buildGlobalSlots(14);
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
  // slot a partir de los matches programados (rounds + consRounds) Y de las
  // reservas externas (gente que reservó pista normal). El scheduler usa
  // este map para no pisar slots ya ocupados.
  const buildOccupiedCourts = (mainRounds, consRoundsSnap) => {
    const map = {};
    // Pre-poblamos con reservas externas
    Object.entries(externalBookings).forEach(([slot, courts]) => {
      map[slot] = new Set(courts);
    });
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

  // Helper: compute globalSlots from tConfig.
  // extraDays > 0 añade días después del endDate con horario startHour..endHour.
  // CRÍTICO para los schedulers: si un match acaba "extendido" más allá del
  // endDate (porque el torneo se queda corto de slots), su hora tiene que
  // estar en globalSlots para que las comparaciones de orden temporal
  // funcionen. 14 días de colchón es suficiente para cualquier torneo realista.
  const buildGlobalSlots = (extraDays = 0) => {
    const sHourIdx = HOURS.indexOf(tConfig.startHour);
    const eHourIdx = HOURS.indexOf(tConfig.endHour);
    const firstDayHourIdx = tConfig.firstDayStartHour ? HOURS.indexOf(tConfig.firstDayStartHour) : sHourIdx;
    const slots = [];
    const activeDates = getActiveDates(tConfig.startDate, tConfig.endDate);
    activeDates.forEach((dateLabel, idx) => {
      const actualStart = idx === 0 ? firstDayHourIdx : sHourIdx;
      for (let h = actualStart; h < eHourIdx; h++) {
        if (h >= 0 && h < HOURS.length) slots.push(`${dateLabel} ${HOURS[h]}`);
      }
    });
    if (extraDays > 0 && tConfig.endDate) {
      const endDate = new Date(tConfig.endDate + 'T12:00:00');
      for (let i = 1; i <= extraDays; i++) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() + i);
        const label = fmtDateLabel(d);
        for (let h = sHourIdx; h < eHourIdx; h++) {
          if (h >= 0 && h < HOURS.length) slots.push(`${label} ${HOURS[h]}`);
        }
      }
    }
    return slots;
  };

  // Inyecta un perdedor del cuadro principal en el cuadro de consolación.
  // Reemplaza el primer placeholder disponible en R0 (cons-placeholder-*).
  // Si no hay consolación generada o no quedan placeholders, no hace nada.
  // Helpers PUROS (no leen de state, reciben catConsRounds como input).
  // Devuelven el nuevo array o null si no hubo cambios.

  // CONSOLACIÓN ESPEJO: el perdedor del match (mainRound, mainMatchIdx) del
  // cuadro principal va al placeholder cuyo `sourceMain` coincide — no al
  // primer hueco libre. Esto asegura que perdedores de matches adyacentes
  // del principal (M0 y M1, M2 y M3, etc.) se enfrenten entre sí en cons R0,
  // como en cualquier cuadro de doble eliminación estándar.
  // Si no se pasa sourceMain (compat) o no se encuentra el placeholder
  // vinculado, cae al comportamiento legacy: primer placeholder libre.
  const pushLoserToConsPure = (catConsRounds, loser, sourceMain = null) => {
    if (!catConsRounds || catConsRounds.length === 0 || !loser || loser.isBye) return null;
    const alreadyIn = catConsRounds.some(r => r.some(m => m.p1?.id === loser.id || m.p2?.id === loser.id));
    if (alreadyIn) return null;
    const next = catConsRounds.map(r => r.map(m => ({ ...m })));
    const r0 = next[0];
    // PASS 1 (espejo): buscar placeholder vinculado al main match origen.
    if (sourceMain && Number.isFinite(sourceMain.round) && Number.isFinite(sourceMain.matchIndex)) {
      for (const m of r0) {
        if (m.p1?.isPlaceholder && m.p1.sourceMain?.round === sourceMain.round && m.p1.sourceMain?.matchIndex === sourceMain.matchIndex) {
          m.p1 = { ...loser }; return next;
        }
        if (m.p2?.isPlaceholder && m.p2.sourceMain?.round === sourceMain.round && m.p2.sourceMain?.matchIndex === sourceMain.matchIndex) {
          m.p2 = { ...loser }; return next;
        }
      }
    }
    // PASS 2 (fallback legacy): primer placeholder libre.
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

  // Sincroniza la consolación tras asignar/cambiar el winner de un match del
  // cuadro principal. Maneja:
  //   · Primera asignación → inyecta newLoser en consolación.
  //   · Cambio de winner   → swap oldLoser por newLoser en consolación.
  //   · Sin cambio         → no toca nada.
  // Aplica solo a matches R0 (siempre) o R1 cuyo perdedor tuvo BYE en R0.
  // Cuando un placeholder de cons no se va a llenar (porque el cuarto que
  // se reservó para él produjo un loser que ya jugó 2 partidos y no aplica),
  // convertimos el primer placeholder libre en BYE y auto-advance al rival.
  // Así la pareja que estaba esperando no se queda sin partido.
  const releaseConsPlaceholderAsBye = (cat) => {
    setConsRounds(prev => {
      const catCons = prev[cat];
      if (!catCons || catCons.length === 0) return prev;
      const next = catCons.map(r => r.map(m => ({ ...m })));
      // Buscar primer R0 con un placeholder y un rival real
      for (const m of next[0]) {
        let placeholderSide = null;
        let realSide = null;
        if (m.p1?.isPlaceholder && m.p2 && !m.p2.isBye && !m.p2.isPlaceholder) {
          placeholderSide = 'p1'; realSide = 'p2';
        } else if (m.p2?.isPlaceholder && m.p1 && !m.p1.isBye && !m.p1.isPlaceholder) {
          placeholderSide = 'p2'; realSide = 'p1';
        }
        if (!placeholderSide) continue;
        // Convertir placeholder a BYE
        m[placeholderSide] = { id: `cons-bye-released-${Date.now()}-${m.matchIndex}`, name: '---', isBye: true };
        // Auto-advance al rival a la siguiente ronda
        if (m[realSide]) {
          advanceWinnerMut(next, 0, m.matchIndex, m[realSide]);
        }
        return { ...prev, [cat]: next };
      }
      return prev;
    });
  };

  // Resuelve TODOS los placeholders pendientes de una vez. Útil cuando el
  // admin sabe que ya no van a llegar más perdedores (porque los cuartos
  // del principal ya están todos resueltos o no se va a esperar más).
  // Convierte cada placeholder huérfano en BYE y avanza a su rival.
  const resolveAllConsPlaceholders = async (cat) => {
    const catCons = consRounds[cat];
    if (!catCons || catCons.length === 0) {
      toast('No hay cuadro de consolación que resolver.', 'error');
      return;
    }
    const pending = catCons[0].filter(m => {
      const p1Place = m.p1?.isPlaceholder;
      const p2Place = m.p2?.isPlaceholder;
      const p1Real = m.p1 && !m.p1.isBye && !m.p1.isPlaceholder;
      const p2Real = m.p2 && !m.p2.isBye && !m.p2.isPlaceholder;
      return (p1Place && p2Real) || (p2Place && p1Real);
    });
    if (pending.length === 0) {
      toast('No hay placeholders pendientes que resolver.', 'success');
      return;
    }
    const ok = await confirmDialog(
      `Hay ${pending.length} pareja${pending.length === 1 ? '' : 's'} esperando rival que no va a llegar. ¿Las pasamos directo a la siguiente ronda con BYE?`,
      { title: 'Resolver placeholders pendientes', okText: 'Sí, avanzar' }
    );
    if (!ok) return;
    setConsRounds(prev => {
      const cc = prev[cat];
      if (!cc || cc.length === 0) return prev;
      const next = cc.map(r => r.map(m => ({ ...m })));
      next[0].forEach(m => {
        let placeholderSide = null;
        let realSide = null;
        if (m.p1?.isPlaceholder && m.p2 && !m.p2.isBye && !m.p2.isPlaceholder) {
          placeholderSide = 'p1'; realSide = 'p2';
        } else if (m.p2?.isPlaceholder && m.p1 && !m.p1.isBye && !m.p1.isPlaceholder) {
          placeholderSide = 'p2'; realSide = 'p1';
        }
        if (!placeholderSide) return;
        m[placeholderSide] = { id: `cons-bye-released-${Date.now()}-${m.matchIndex}`, name: '---', isBye: true };
        if (m[realSide]) advanceWinnerMut(next, 0, m.matchIndex, m[realSide]);
      });
      return { ...prev, [cat]: next };
    });
    toast(`✓ ${pending.length} pareja${pending.length === 1 ? '' : 's'} avanzada${pending.length === 1 ? '' : 's'} a la siguiente ronda.`, 'success');
  };

  const syncConsOnMainWinner = (cat, match, oldWinner, newWinner) => {
    if (!match.p1 || !match.p2 || match.p1.isBye || match.p2.isBye) return;
    if (!newWinner) return;

    const newLoser = newWinner.id === match.p1.id ? match.p2 : match.p1;
    if (!newLoser || newLoser.isBye) return;

    // hasPrelim = R0 son partidos isPrelim → la primera ronda real del cuadro
    // principal es R1 (cuartos en el caso típico). En ese caso TODOS los
    // perdedores de R1 van a consolación porque para ellos R1 es su primer
    // partido jugado del torneo.
    const r0 = (rounds[cat] || [])[0] || [];
    const hasPrelim = !!r0[0]?.isPrelim;

    let sendToCons = false;
    if (match.round === 0) {
      sendToCons = true;
    } else if (match.round === 1) {
      if (hasPrelim) {
        sendToCons = true;
      } else {
        const r0Match = r0.find(r0m => r0m.p1?.id === newLoser.id || r0m.p2?.id === newLoser.id);
        if (r0Match && (r0Match.p1?.isBye || r0Match.p2?.isBye)) sendToCons = true;
      }
    }
    if (!sendToCons) {
      // El loser de R1 no es cons-eligible (ya jugó 2 partidos). Si la cons
      // tenía un placeholder reservado para este cuarto, lo liberamos como
      // BYE para que el rival que estaba esperando avance.
      if (match.round === 1 && !hasPrelim) {
        releaseConsPlaceholderAsBye(cat);
      }
      return;
    }

    const oldLoser = oldWinner ? (oldWinner.id === match.p1.id ? match.p2 : match.p1) : null;
    if (oldLoser && oldLoser.id === newLoser.id) return;

    setConsRounds(prev => {
      const catCons = prev[cat];
      if (!catCons || catCons.length === 0) return prev;
      let updated = null;
      if (oldLoser && oldLoser.id !== newLoser.id) {
        updated = swapLoserInConsPure(catCons, oldLoser, newLoser);
      } else {
        // sourceMain identifica la posición espejo donde debe ir el perdedor.
        // Para R1 con bye (sin previa), el placeholder está vinculado al R1
        // donde compitió por primera vez, no al R0 (que era bye).
        updated = pushLoserToConsPure(catCons, newLoser, { round: match.round, matchIndex: match.matchIndex });
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
        const globalSlots = buildGlobalSlots(14);
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

  // Mueve el partido entero (ambas parejas) a la siguiente ronda de
  // consolación, sin jugarse en esta ronda. Útil cuando no hay rivales
  // suficientes en la siguiente ronda y el admin prefiere que las dos parejas
  // se enfrenten una ronda más adelante (p.ej. mover un cuartos a semis).
  const handleAdvanceMatchWhole = (match, cat) => {
    if (!match.p1 || !match.p2) return;
    if (match.p1.isBye || match.p2.isBye) return;
    if (match.p1.isPlaceholder || match.p2.isPlaceholder) return;
    if (match.p1.isPrelimPlaceholder || match.p2.isPrelimPlaceholder) return;
    if (!window.confirm(`¿Pasar el partido completo a la siguiente ronda?\n\n${match.p1.name}\nvs\n${match.p2.name}\n\nLas dos parejas se enfrentarán en la ronda siguiente sin jugar este partido.`)) return;

    setConsRounds(prev => {
      const targetRounds = prev[cat];
      if (!targetRounds || match.round + 1 >= targetRounds.length) {
        toast('No hay siguiente ronda a la que avanzar.');
        return prev;
      }
      const nextRounds = targetRounds.map(r => r.map(m => ({ ...m })));
      const cur = nextRounds[match.round][match.matchIndex];
      const nextIdx = Math.floor(match.matchIndex / 2);
      const next = nextRounds[match.round + 1][nextIdx];
      if (!next) return prev;

      // Colocar ambas parejas en el partido siguiente.
      next.p1 = cur.p1;
      next.p2 = cur.p2;
      if (!next.timeManual) next.time = null;

      // Marcar el partido actual como movido — se vacían parejas, ganador,
      // marcador y hora para que no acepte resultado y muestre un aviso.
      cur.p1 = { id: `moved-${cur.id}-p1`, name: '↗ Movido a siguiente ronda', isBye: true };
      cur.p2 = { id: `moved-${cur.id}-p2`, name: '↗ Movido a siguiente ronda', isBye: true };
      cur.winner = null;
      cur.score = null;
      if (!cur.timeManual) cur.time = null;
      cur.movedUp = true;

      return { ...prev, [cat]: nextRounds };
    });
    toast('Partido movido a la siguiente ronda');
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
      toast(`La liguilla todavía tiene partidos sin resultado (${totalMatches - totalPlayed} pendientes). Resuélvelos antes de generar las eliminatorias.`);
      return;
    }

    const qualifyN = parseInt(tConfig.liguillaQualifyPerGroup || 2, 10);
    if (ordered.length < qualifyN) {
      toast(`No hay suficientes parejas clasificadas (${ordered.length}) para generar las eliminatorias con top ${qualifyN}.`, 'error');
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
    toast(`✅ Eliminatorias finales generadas (top ${qualifyN}). Aparecerán como cuadro adicional debajo de la liguilla.`, 'success');
  };

  const generateConsolation = (cat) => {
    const catRounds = rounds[cat];
    if (!catRounds || catRounds.length < 1) return;

    // Detección de ronda previa: si R0 son partidos isPrelim, la primera
    // ronda "real" del cuadro principal es R1 (los cuartos en este caso),
    // así que los perdedores de R1 también van a consolación porque para
    // ellos R1 ES su primera (y única) ronda jugada.
    const hasPrelim = !!catRounds[0]?.[0]?.isPrelim;

    // CONSOLACIÓN ESPEJO: cada SLOT de la consolación R0 está vinculado a un
    // MATCH origen del cuadro principal. El perdedor de ese match aterriza
    // SIEMPRE en su slot espejo, no donde haya hueco.
    //
    // `mainSources[i]` = info del match del principal que alimenta el slot i
    // de cons R0 (in-order, sin shuffle). Cada entry tiene:
    //   - sourceMain: { round, matchIndex }      ← para enlazar el placeholder
    //   - loser:      perdedor actual (si ya hay) o null si aún no se jugó
    //
    // Recorremos los R0 main matches EN ORDEN; cada match real que produce
    // perdedor genera UN slot espejo. Después, los R1 cons-eligibles (con
    // previa o con bye-en-R0) generan slots adicionales DESPUÉS, manteniendo
    // el orden del cuadro principal.
    const mainSources = [];

    catRounds[0].forEach((m, mIdx) => {
      if (!m.p1 || !m.p2) return;
      if (m.p1.isBye || m.p2.isBye) return; // bye en R0 → no produce perdedor real aquí
      let loser = null;
      if (m.winner) {
        loser = m.winner.id === m.p1.id ? m.p2 : m.p1;
      }
      mainSources.push({ sourceMain: { round: 0, matchIndex: mIdx }, loser });
    });

    (catRounds[1] || []).forEach((m, mIdx) => {
      if (!m.p1 || !m.p2) return;
      // Solo R1 cons-eligibles (igual criterio que el legacy):
      //   · con previa → todos los R1
      //   · sin previa → solo si vino de bye en R0
      let eligible = false;
      if (hasPrelim) {
        eligible = !(m.p1.isBye && m.p2.isBye);
      } else {
        // Verificar si alguno de los dos vino de bye en R0
        const camePlayer = (player) => {
          if (!player || player.isBye || player.isPlaceholder) return false;
          const r0Match = catRounds[0].find(r0m => r0m.p1?.id === player.id || r0m.p2?.id === player.id);
          return r0Match && (r0Match.p1?.isBye || r0Match.p2?.isBye);
        };
        eligible = camePlayer(m.p1) || camePlayer(m.p2);
      }
      if (!eligible) return;
      let loser = null;
      if (m.winner && !m.p1.isBye && !m.p2.isBye) {
        loser = m.winner.id === m.p1.id ? m.p2 : m.p1;
        if (loser?.isBye) loser = null;
      }
      mainSources.push({ sourceMain: { round: 1, matchIndex: mIdx }, loser });
    });

    // El tamaño y la composición del cuadro de consolación ahora vienen
    // íntegramente de `mainSources` (construido arriba): un slot por cada
    // R0 main match real + un slot por cada R1 cons-eligible. No necesitamos
    // contar `expectedLosers` aparte ni rellenar con placeholders extra.

    // CONSOLACIÓN ESPEJO (sin shuffle): construimos consPlayers RESPETANDO el
    // orden de `mainSources`. Cada entrada lleva `sourceMain` (referencia al
    // match origen del principal). Esto garantiza que el match cons R0 M0
    // empareje a los perdedores de main M0 y M1, M0/M1 vs M2/M3, etc. — el
    // "espejo" estándar de un cuadro de doble eliminación.
    //
    // Resultado: el orden de mainSources determina el bracket de cons R0.
    // Si una entry ya tiene loser conocido, se mete el loser real (con
    // sourceMain anotado por consistencia). Si no, se crea un placeholder
    // anclado a ese sourceMain — cuando llegue el loser real desde
    // pushLoserToConsPure, se ubicará en ESE slot concreto (no en el primero
    // libre).
    let consPlayers = mainSources.map((src) => {
      if (src.loser && !src.loser.isBye) {
        return { ...src.loser, sourceMain: src.sourceMain };
      }
      return {
        id: `cons-placeholder-${cat}-r${src.sourceMain.round}-m${src.sourceMain.matchIndex}`,
        name: 'Perdedor por definir',
        isPlaceholder: true,
        sourceMain: src.sourceMain,
      };
    });

    // Fallback final: si por algún motivo no hay nada, abortar.
    if (consPlayers.length < 2) {
      toast(`No hay suficientes parejas para generar el cuadro de consolación de "${cat}".`);
      return;
    }

    let p = [...consPlayers];
    // ⚠️ Antes aquí había un shuffle (perdedores reales) o un interleave
    // de mitades (placeholders). Ambos rompían la estructura espejo, así
    // que los hemos eliminado. El orden viene tal cual de mainSources.

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

    // 14 días extra para que las horas extendidas más allá del endDate sigan
    // dentro de globalSlots y los comparadores de orden temporal funcionen.
    const globalSlots = buildGlobalSlots(14);

    // Construimos `occupied` por (slot, court) a partir del estado actual.
    // CRÍTICO: el cuadro de consolación tiene sus propias pistas permitidas
    // (getAllowedCourts(cat, true)). Si solo Pista 2 está permitida, hay que
    // tener tracking por pista para que un partido de cons no se cuele en P1
    // cuando P2 está libre — y al revés.
    const occupied = buildOccupiedCourts(rounds, consRounds);
    const allowedCourtsForCons = getAllowedCourts(cat, true);
    const markOccupied = (slot, court) => {
      if (!occupied[slot]) occupied[slot] = new Set();
      occupied[slot].add(court);
    };
    const isCourtFree = (slot, court) => !(occupied[slot]?.has(court));
    const slotMinutesGen = (s) => {
      if (!s) return -1;
      const parts = s.split(' ');
      if (parts.length !== 2) return -1;
      const [d, m] = parts[0].split('/').map(Number);
      const [h, mi] = parts[1].split(':').map(Number);
      if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(h)) return -1;
      return ((m - 1) * 31 + (d - 1)) * 24 * 60 + h * 60 + (mi || 0);
    };
    // pickSlotCourtForCons: respeta earliestMinutes + allowedCourtsForCons +
    // courtStartHours + occupied. Igual que en generateBracket pero con las
    // pistas de CONSOLACIÓN.
    const pickSlotCourtForCons = (earliestMinutes, preferred = null) => {
      const tryList = (list) => {
        for (const s of list) {
          if (slotMinutesGen(s) < earliestMinutes) continue;
          const hourPart = s.split(' ')[1];
          for (const c of allowedCourtsForCons) {
            if (!isCourtFree(s, c)) continue;
            const startsAt = tConfig.courtStartHours?.[c];
            if (startsAt && hourPart < startsAt) continue;
            return { slot: s, court: c };
          }
        }
        return null;
      };
      if (preferred && preferred.length > 0) {
        const f = tryList(preferred);
        if (f) return f;
      }
      const f2 = tryList(globalSlots);
      if (f2) return f2;
      const lastSlot = globalSlots[globalSlots.length - 1];
      if (lastSlot) {
        const [lastDateLabel, lastHour] = lastSlot.split(' ');
        const lastHourIdx = HOURS.indexOf(lastHour);
        for (let h = lastHourIdx + 1; h < HOURS.length; h++) {
          const s = `${lastDateLabel} ${HOURS[h]}`;
          if (slotMinutesGen(s) < earliestMinutes) continue;
          for (const c of allowedCourtsForCons) {
            if (!isCourtFree(s, c)) continue;
            const startsAt = tConfig.courtStartHours?.[c];
            if (startsAt && HOURS[h] < startsAt) continue;
            return { slot: s, court: c };
          }
        }
        const [ld, lm] = lastDateLabel.split('/').map(Number);
        const lastDateObj = new Date(new Date().getFullYear(), lm - 1, ld);
        for (let extra = 1; extra <= 60; extra++) {
          const next = new Date(lastDateObj);
          next.setDate(lastDateObj.getDate() + extra);
          const nextLabel = fmtDateLabel(next);
          for (let h = 0; h < HOURS.length; h++) {
            const s = `${nextLabel} ${HOURS[h]}`;
            if (slotMinutesGen(s) < earliestMinutes) continue;
            for (const c of allowedCourtsForCons) {
              if (!isCourtFree(s, c)) continue;
              const startsAt = tConfig.courtStartHours?.[c];
              if (startsAt && HOURS[h] < startsAt) continue;
              return { slot: s, court: c };
            }
          }
        }
      }
      return null;
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

    // R0 (primera ronda de la consolación): scheduling con afinidad de jugadores.
    if (newRounds[0]) {
      newRounds[0].forEach(match => {
        if (match.p1 && match.p2 && !match.p1.isBye && !match.p2.isBye) {
           const p1Final = match.p1.finalSlots || [];
           const p2Final = match.p2.finalSlots || [];
           let common = p1Final.filter(s => p2Final.includes(s));
           if (common.length === 0) common = p1Final.length > 0 ? p1Final : (p2Final.length > 0 ? p2Final : globalSlots);
           const picked = pickSlotCourtForCons(0, common);
           if (picked) {
             markOccupied(picked.slot, picked.court);
             match.time = `${picked.slot} - Pista ${picked.court}`;
           }
        }
      });
    }

    // Pre-scheduling de R1+: cada match va DESPUÉS de sus predecesores Y de
    // cualquier match real de la ronda anterior (barrera de ronda). Respeta
    // las pistas permitidas para CONSOLACIÓN.
    {
      const getSlotPart = (t) => t ? t.split(' - Pista')[0].trim() : null;
      const durationMin = tConfig.matchDurationByCategory?.[cat] ?? 90;
      const restMin = parseInt(tConfig.restMinutesBetweenMatches ?? 30, 10) || 0;
      const gapSlots = Math.ceil((durationMin + restMin) / 60);
      const gapMinutes = gapSlots * 60;

      const computeEarliestMinutes = (r, mIdx) => {
        if (r === 0) return 0;
        const predA = newRounds[r - 1][mIdx * 2];
        const predB = newRounds[r - 1][mIdx * 2 + 1];
        const predTimes = [predA?.time, predB?.time];
        const minutes = predTimes.map(t => slotMinutesGen(getSlotPart(t))).filter(m => m >= 0);
        const predEarliest = minutes.length > 0 ? Math.max(...minutes) + gapMinutes : 0;
        const barrierMinutes = newRounds[r - 1]
          .map(m => slotMinutesGen(getSlotPart(m.time)))
          .filter(m => m >= 0);
        const barrier = barrierMinutes.length > 0 ? Math.max(...barrierMinutes) + gapMinutes : 0;
        return Math.max(predEarliest, barrier);
      };

      // PASS 1: pre-asigna respetando earliestMinutes + allowedCourtsForCons + occupied
      for (let r = 1; r < newRounds.length; r++) {
        newRounds[r].forEach((match, mIdx) => {
          const earliestMinutes = computeEarliestMinutes(r, mIdx);
          const picked = pickSlotCourtForCons(earliestMinutes);
          if (picked) {
            markOccupied(picked.slot, picked.court);
            match.time = `${picked.slot} - Pista ${picked.court}`;
          }
        });
      }

      // PASS 2: validación. Si algún match quedó en una hora anterior a sus
      // predecesores, lo reasignamos liberando la pista vieja primero.
      for (let pass = 0; pass < 3; pass++) {
        let fixed = 0;
        for (let r = 1; r < newRounds.length; r++) {
          newRounds[r].forEach((match, mIdx) => {
            if (!match.time) return;
            const earliestMinutes = computeEarliestMinutes(r, mIdx);
            const curMinutes = slotMinutesGen(getSlotPart(match.time));
            if (curMinutes >= 0 && curMinutes < earliestMinutes) {
              const oldParts = match.time.split(' - Pista');
              const oldSlot = oldParts[0].trim();
              const oldCourt = parseInt(oldParts[1], 10);
              if (occupied[oldSlot] && Number.isFinite(oldCourt)) {
                occupied[oldSlot].delete(oldCourt);
              }
              const picked = pickSlotCourtForCons(earliestMinutes);
              if (picked) {
                markOccupied(picked.slot, picked.court);
                match.time = `${picked.slot} - Pista ${picked.court}`;
                fixed++;
              }
            }
          });
        }
        if (fixed === 0) break;
      }
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

    // Pequeño retardo para asegurar que la UI se actualizó (escondiendo botones).
    setTimeout(async () => {
      // Inyectamos estilos solo durante la captura para reforzar contraste y
      // saturación de los colores. Cuando se imprime una imagen JPEG/PNG en
      // papel los colores claros se ven lavados; estos ajustes los hacen más
      // legibles sin cambiar la UI normal.
      const exportStyle = document.createElement('style');
      exportStyle.id = 'tm-pdf-export-styles';
      exportStyle.textContent = `
        #${elementId} { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; -webkit-font-smoothing: antialiased !important; -moz-osx-font-smoothing: grayscale !important; text-rendering: geometricPrecision !important; }
        #${elementId} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; -webkit-font-smoothing: antialiased !important; }
        /* Texto un punto más grueso y oscuro para que se lea mejor en papel */
        #${elementId} { color: #0F172A !important; }
        /* Refuerzo de bordes para que las cajas se distingan en papel */
        #${elementId} [style*="border"] { border-width: 2px !important; }
        /* Bordes y fondos de los matches: contraste más fuerte */
        #${elementId} [style*="#E2E8F0"] { border-color: #64748B !important; }
        /* Verde ganador: saturado */
        #${elementId} [style*="DCFCE7"] { background-color: #BBF7D0 !important; }
        #${elementId} [style*="#16A34A"] { color: #15803D !important; }
        /* Naranja consolación: saturado */
        #${elementId} [style*="FEF3C7"] { background-color: #FDE68A !important; }
        #${elementId} [style*="#D97706"] { color: #B45309 !important; }
        /* Texto secundario más oscuro para legibilidad */
        #${elementId} [style*="#64748B"] { color: #1E293B !important; }
        #${elementId} [style*="#94A3B8"] { color: #334155 !important; }
        #${elementId} [style*="#475569"] { color: #1E293B !important; }
        /* Nombres de pareja en negrita más fuerte */
        #${elementId} span[style*="font-weight: 600"] { font-weight: 700 !important; }
        #${elementId} span[style*="font-weight: 700"] { font-weight: 800 !important; }
        /* Fuentes ~25% más grandes solo en el PDF para que se lean en papel.
           Se bumpean los tamaños relativos más usados en el render del cuadro.
           No afecta a la UI normal porque solo se inyecta durante la captura. */
        #${elementId} [style*="font-size: 0.62rem"] { font-size: 0.85rem !important; }
        #${elementId} [style*="font-size: 0.65rem"] { font-size: 0.88rem !important; }
        #${elementId} [style*="font-size: 0.68rem"] { font-size: 0.9rem !important; }
        #${elementId} [style*="font-size: 0.7rem"]  { font-size: 0.92rem !important; }
        #${elementId} [style*="font-size: 0.72rem"] { font-size: 0.95rem !important; }
        #${elementId} [style*="font-size: 0.75rem"] { font-size: 0.98rem !important; }
        #${elementId} [style*="font-size: 0.78rem"] { font-size: 1rem !important; }
        #${elementId} [style*="font-size: 0.8rem"]  { font-size: 1.02rem !important; }
        #${elementId} [style*="font-size: 0.82rem"] { font-size: 1.05rem !important; }
        #${elementId} [style*="font-size: 0.85rem"] { font-size: 1.08rem !important; }
        #${elementId} [style*="font-size: 0.9rem"]  { font-size: 1.12rem !important; }
        #${elementId} [style*="font-size: 0.95rem"] { font-size: 1.18rem !important; }
        #${elementId} [style*="font-size: 1rem"]    { font-size: 1.22rem !important; }
        #${elementId} [style*="font-size: 1.05rem"] { font-size: 1.28rem !important; }
        #${elementId} [style*="font-size: 1.1rem"]  { font-size: 1.35rem !important; }
        #${elementId} [style*="font-size: 1.25rem"] { font-size: 1.55rem !important; }
      `;
      document.head.appendChild(exportStyle);

      // Pre-cargamos el logo. Si el fetch falla simplemente no se añade
      // (no rompe la exportación).
      let logoDataUrl = null;
      try {
        const logoRes = await fetch('/logo.png');
        const blob = await logoRes.blob();
        logoDataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('No se pudo cargar el logo para el PDF:', e);
      }

      try {
        // Forzar expansión para captura completa si hay scroll horizontal.
        // Reservo padding-top extra para el logo y el título.
        element.style.width = 'max-content';
        // Más ancho que antes (1600 vs 1200) para que los nombres de pareja
        // tengan espacio cuando se aplique el bump de tamaño de fuente y no
        // se trunquen con ellipsis.
        element.style.minWidth = '1600px';
        element.style.padding = '5rem 3rem 3rem 3rem';
        element.style.backgroundColor = '#FFFFFF';

        // scale=4 para texto extra-nítido en papel (antes 3). PNG sin pérdida.
        const canvas = await html2canvas(element, {
          scale: 4,
          useCORS: true,
          logging: false,
          backgroundColor: '#FFFFFF',
          imageTimeout: 0,
          letterRendering: true,
        });
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgRatio = canvas.width / canvas.height;

        // Margen pequeño para que no quede pegado al borde del papel
        const margin = 6;
        let finalWidth = pdfWidth - margin * 2;
        let finalHeight = finalWidth / imgRatio;

        if (finalHeight > pdfHeight - margin * 2) {
           finalHeight = pdfHeight - margin * 2;
           finalWidth = finalHeight * imgRatio;
        }

        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, undefined, 'FAST');

        // Logo en la esquina SUPERIOR DERECHA. Lee la proporción real de
        // la imagen (no asumir cuadrado) para no aplastarla. El logo de
        // padelmedina es horizontal (~1.83:1), así que con 45mm de ancho
        // queda en ~24.5mm de alto — bien visible sin invadir el cuadro.
        if (logoDataUrl) {
          try {
            const props = pdf.getImageProperties(logoDataUrl);
            const aspect = props.width / props.height; // ej. 1.83 para padelmedina
            const logoWidth = 45; // mm
            const logoHeight = logoWidth / aspect;
            const logoMargin = 8;
            pdf.addImage(
              logoDataUrl,
              'PNG',
              pdfWidth - logoWidth - logoMargin,
              logoMargin,
              logoWidth,
              logoHeight,
              undefined,
              'FAST'
            );
          } catch (e) {
            console.warn('No se pudo añadir el logo al PDF:', e);
          }
        }

        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
        pdf.save(`Cuadro_${tConfig.name.replace(/\s+/g, '_')}_${safeTitle}.pdf`);
      } catch (err) {
        console.error("Error generating PDF:", err);
        toast("Hubo un error al generar el PDF.", 'error');
      } finally {
        element.removeAttribute('style');
        const injected = document.getElementById('tm-pdf-export-styles');
        if (injected) injected.remove();
        setIsExporting(false);
      }
    }, 100);
  };

  // Genera un PDF nativo (no captura de pantalla) del listado de partidos.
  // Texto seleccionable, búsqueda en visor de PDF, tipografía nítida en
  // papel y paginación automática. Acepta filtro por día.
  const handleDownloadMatchesPDF = async (items, byDay, dayKeys, filterDay) => {
    const targetDays = filterDay === 'all' ? dayKeys : dayKeys.filter(d => d === filterDay);
    if (targetDays.length === 0) {
      toast('No hay partidos para ese día.', 'warning');
      return;
    }
    setMatchesListPdfLoading(true);
    try {
      // Pre-carga del logo (no rompe si falla)
      let logoDataUrl = null;
      try {
        const logoRes = await fetch('/logo.png');
        const blob = await logoRes.blob();
        logoDataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) { /* sin logo */ }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 10;
      const marginTop = 22;
      const marginBottom = 14;
      const usableW = pageW - 2 * marginX;

      // Anchos en mm: total 190 (cabe en A4 con margen 10)
      const cols = [
        { key: 'hour',  label: 'Hora',              width: 14 },
        { key: 'court', label: 'Pista',             width: 22 },
        { key: 'cat',   label: 'Categoría · Ronda', width: 38 },
        { key: 'p1',    label: 'Pareja 1',          width: 46 },
        { key: 'p2',    label: 'Pareja 2',          width: 46 },
        { key: 'score', label: 'Resultado',         width: 24 },
      ];
      let y = marginTop;

      const drawPageHeader = () => {
        if (logoDataUrl) {
          try {
            const props = pdf.getImageProperties(logoDataUrl);
            const aspect = props.width / props.height;
            const lw = 32;
            const lh = lw / aspect;
            pdf.addImage(logoDataUrl, 'PNG', pageW - lw - marginX, 6, lw, lh, undefined, 'FAST');
          } catch (e) { /* sin logo */ }
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.setTextColor(15, 23, 42);
        pdf.text(tConfig.name || 'Torneo', marginX, 12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        const subtitle = filterDay === 'all'
          ? `Partidos · ${dayKeys.length} día${dayKeys.length === 1 ? '' : 's'} · ${items.length} partido${items.length === 1 ? '' : 's'}`
          : `Partidos del ${filterDay} · ${byDay[filterDay]?.length || 0} partido${(byDay[filterDay]?.length || 0) === 1 ? '' : 's'}`;
        pdf.text(subtitle, marginX, 17);
      };

      const drawTableHeader = () => {
        pdf.setFillColor(15, 23, 42);
        pdf.rect(marginX, y, usableW, 7, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        let x = marginX;
        cols.forEach(c => {
          pdf.text(c.label, x + 1.5, y + 4.7);
          x += c.width;
        });
        y += 7;
      };

      const drawDayBanner = (day) => {
        pdf.setFillColor(30, 41, 59);
        pdf.rect(marginX, y, usableW, 8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        const count = byDay[day]?.length || 0;
        pdf.text(`${day}  -  ${count} partido${count === 1 ? '' : 's'}`, marginX + 2.5, y + 5.5);
        y += 8;
      };

      const ensureSpace = (need, day) => {
        if (y + need > pageH - marginBottom) {
          pdf.addPage();
          y = marginTop;
          drawPageHeader();
          if (day) {
            drawDayBanner(`${day} (cont.)`);
          }
          drawTableHeader();
        }
      };

      drawPageHeader();

      targetDays.forEach((day) => {
        ensureSpace(20, null);
        drawDayBanner(day);
        drawTableHeader();
        const rows = byDay[day] || [];

        rows.forEach((it, idx) => {
          const roundName = it.isCons ? 'Cons.' : (it.isPrelim ? 'Previa' : `R${it.round + 1}`);
          const courtName = getCourtName(it.court);
          pdf.setFontSize(9);
          const p1Lines = pdf.splitTextToSize(it.p1 || '', cols[3].width - 3).slice(0, 2);
          const p2Lines = pdf.splitTextToSize(it.p2 || '', cols[4].width - 3).slice(0, 2);
          const lineCount = Math.max(p1Lines.length, p2Lines.length, 2);
          const rowH = lineCount * 4.2 + 2.5;

          ensureSpace(rowH, day);

          // Fondo: alterna gris claro / blanco; verde claro si hay ganador
          if (it.winner) {
            pdf.setFillColor(240, 253, 244);
          } else if (idx % 2 === 0) {
            pdf.setFillColor(248, 250, 252);
          } else {
            pdf.setFillColor(255, 255, 255);
          }
          pdf.rect(marginX, y, usableW, rowH, 'F');

          let x = marginX;
          // Hora
          pdf.setTextColor(15, 23, 42);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.text(it.hour || '', x + 1.5, y + 5);
          x += cols[0].width;
          // Pista
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.text(courtName || '', x + 1.5, y + 5);
          x += cols[1].width;
          // Categoría · Ronda (2 líneas)
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text(it.cat || '', x + 1.5, y + 4);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          if (it.isCons) pdf.setTextColor(217, 119, 6);
          else pdf.setTextColor(100, 116, 139);
          pdf.text(`${it.isCons ? 'Consolación · ' : ''}${roundName}`, x + 1.5, y + 8);
          pdf.setTextColor(15, 23, 42);
          x += cols[2].width;
          // Pareja 1
          const p1Win = it.winner && it.winner === it.p1;
          pdf.setFont('helvetica', p1Win ? 'bold' : 'normal');
          pdf.setFontSize(9);
          if (p1Win) pdf.setTextColor(21, 128, 61);
          p1Lines.forEach((ln, i) => pdf.text(ln, x + 1.5, y + 4 + i * 4.2));
          pdf.setTextColor(15, 23, 42);
          x += cols[3].width;
          // Pareja 2
          const p2Win = it.winner && it.winner === it.p2;
          pdf.setFont('helvetica', p2Win ? 'bold' : 'normal');
          pdf.setFontSize(9);
          if (p2Win) pdf.setTextColor(21, 128, 61);
          p2Lines.forEach((ln, i) => pdf.text(ln, x + 1.5, y + 4 + i * 4.2));
          pdf.setTextColor(15, 23, 42);
          x += cols[4].width;
          // Resultado
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          if (it.score) pdf.setTextColor(21, 128, 61);
          else pdf.setTextColor(180, 188, 200);
          pdf.text(it.score || '-', x + 1.5, y + 5);
          pdf.setTextColor(15, 23, 42);

          // Borde inferior de la fila
          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(0.1);
          pdf.line(marginX, y + rowH, marginX + usableW, y + rowH);

          y += rowH;
        });
        y += 5; // separación entre días
      });

      // Numeración de páginas
      const pageCount = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`Página ${i} de ${pageCount}`, pageW - marginX, pageH - 6, { align: 'right' });
        pdf.text('Padel Medina', marginX, pageH - 6);
      }

      const safeName = (tConfig.name || 'Torneo').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const safeDay = filterDay === 'all' ? 'todos' : filterDay.replace(/\//g, '-');
      pdf.save(`Partidos_${safeName}_${safeDay}.pdf`);
    } catch (err) {
      console.error('Error generando PDF de partidos:', err);
      toast('Error al generar el PDF.', 'error');
    } finally {
      setMatchesListPdfLoading(false);
    }
  };

  // getRoundName: si pasas un array de rondas, detectamos automáticamente
  // si hay ronda previa (round 0 con isPrelim) y la nombramos como
  // "Ronda Previa". Si pasas un número, comportamiento clásico por
  // compatibilidad.
  const getRoundName = (roundIndex, allRoundsOrLength) => {
    const isArr = Array.isArray(allRoundsOrLength);
    const totalRounds = isArr ? allRoundsOrLength.length : allRoundsOrLength;
    const hasPrelim = isArr && allRoundsOrLength[0]?.[0]?.isPrelim === true;
    if (hasPrelim && roundIndex === 0) return 'Ronda Previa';
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

    const saveSeeds = async () => {
      // Persiste el estado completo del torneo (incluyendo participants con
      // sus seeds asignados) a Supabase. Si el torneo aún no está publicado
      // confiamos solo en el localStorage (que ya se guarda automáticamente
      // vía useEffect).
      if (!publishedId) {
        toast('Cabezas de serie guardados en este dispositivo.', 'success');
        return;
      }
      try {
        const config = { ...tConfig, rounds, consRounds, participants, phase };
        const { error } = await supabase.from('tournaments')
          .update({ config })
          .eq('id', publishedId);
        if (error) throw error;
        toast('🏆 Cabezas de serie guardados.', 'success');
      } catch (e) {
        console.error('saveSeeds error', e);
        toast('Error al guardar cabezas de serie: ' + (e.message || e), 'error');
      }
    };

    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowSeedsPanel(false)} style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', padding: 0 }}>
            ← Volver al torneo
          </button>
          <button onClick={saveSeeds} style={{ padding: '0.55rem 1.1rem', borderRadius: '0.55rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.18)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            💾 Guardar cabezas de serie
          </button>
        </div>

        <div style={{ background: 'white', borderRadius: '1.25rem', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>🏆 Cabezas de Serie · {tConfig.name}</h2>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5 }}>
              Asigna las parejas que entran como <strong>cabezas de serie</strong>. Se colocan en posiciones estándar: #1 y #2 en lados opuestos del cuadro (solo se cruzarían en la final), #3 y #4 en cuartos opuestos. Si hay <strong>ronda previa</strong> (cuando el nº de parejas no es potencia de 2), los seeds enfrentan a los ganadores de la previa en R1.
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
          // Acepta tanto el separador nuevo " y " como el antiguo " + " para no
          // romper inscripciones legacy guardadas antes del cambio de formato.
          const catParts = participants.filter(p => {
            const raw = p.category || '';
            const parts = raw.split(/\s+y\s+|\s+\+\s+/);
            return parts.includes(cat) || p.category === cat;
          });
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
          // floorPow = mayor potencia de 2 ≤ n. Si n > floorPow → previa.
          let floorPow = 1; while (floorPow * 2 <= n) floorPow *= 2;
          const prelimMatchCount = n - floorPow;
          // Cabezas de serie permitidos: hasta 4 (estándar de torneos pequeños)
          // o tantos como ganadores de previa haya, lo que sea mayor.
          const seedSlots = Math.min(n - 1, Math.max(prelimMatchCount, Math.min(4, Math.floor(floorPow / 2))));

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
                  {n} parejas · cuadro principal de {floorPow}
                  {prelimMatchCount > 0
                    ? <> · <strong style={{ color: '#D97706' }}>{prelimMatchCount} partido{prelimMatchCount === 1 ? '' : 's'} de previa</strong></>
                    : <> · <strong style={{ color: '#16A34A' }}>sin previa</strong></>}
                </span>
              </div>

              {seedSlots === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '0.7rem 0.9rem', borderRadius: '0.5rem' }}>
                  Pocas parejas para asignar cabezas de serie. Añade más y vuelve.
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
            💡 Al pulsar <strong>Generar Cuadro</strong>, los cabezas de serie ocupan sus posiciones estándar y, si hay <strong>ronda previa</strong>, enfrentan a los ganadores de la previa en R1 (sin byes salvajes).
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={saveSeeds} style={{ padding: '0.7rem 1.5rem', borderRadius: '0.55rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.18)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            💾 Guardar cabezas de serie
          </button>
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
    const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

    // Descompone "Masculino D y Masculino C" (o legacy "... + ...") en
    // ['Masculino D', 'Masculino C']. Si la categoría es simple devuelve [c].
    const splitCats = (raw) => {
      if (!raw) return [];
      return raw.split(/\s+y\s+|\s+\+\s+/).map(s => s.trim()).filter(Boolean);
    };
    // Lista de categorías para el desplegable (de la config del torneo).
    const tournamentCategories = (tConfig.categories || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Filtro: una pareja aparece si juega en la categoría seleccionada
    // (soporta dobles categorías). 'Todas' no filtra nada.
    const matchesFilter = (cat) =>
      regsCatFilter === 'Todas' || splitCats(cat).some(c =>
        c.toLowerCase() === regsCatFilter.toLowerCase()
      );

    const filteredRegs = regsList.filter(r => matchesFilter(r.category));

    // Detección de duplicados: misma pareja (nombres normalizados, indistinto
    // el orden) inscrita >1 vez en la misma categoría. Se marca en la fila
    // con un badge "⚠️ Duplicada".
    const dupKey = (r) => {
      const names = [normalizeForCompare(r.player1_name || ''), normalizeForCompare(r.player2_name || '')].sort().join('|');
      return `${normalizeForCompare(r.category || '')}::${names}`;
    };
    const dupCounts = {};
    regsList.forEach(r => { const k = dupKey(r); dupCounts[k] = (dupCounts[k] || 0) + 1; });

    // Parejas añadidas manualmente: están en `participants` pero no provienen
    // de una inscripción online (no figuran en regsList por id).
    const manualParticipants = participants.filter(p => !regsList.some(r => r.id === p.id));
    const filteredManual = manualParticipants.filter(p => matchesFilter(p.category));

    // ── Cambiar la categoría de una inscripción ────────────────────────
    // Útil cuando un jugador se equivocó al inscribirse. Actualiza la BBDD
    // y refresca la lista. La disponibilidad va con la fila → "se mueve"
    // sola a la nueva categoría.
    const changeRegCategory = async (reg, newCat) => {
      if (!newCat || newCat === reg.category) return;
      const ok = await confirmDialog(
        `¿Mover la pareja "${reg.player1_name} y ${reg.player2_name}" de "${reg.category}" a "${newCat}"?\n\nSu disponibilidad horaria se mantiene tal cual.`,
        { title: 'Cambiar categoría', okText: 'Cambiar' }
      );
      if (!ok) return;
      try {
        const { error } = await supabase
          .from('tournament_registrations')
          .update({ category: newCat })
          .eq('id', reg.id);
        if (error) throw error;
        setRegsList(prev => prev.map(r => r.id === reg.id ? { ...r, category: newCat } : r));
        toast(`✓ Pareja movida a ${newCat}.`, 'success');
      } catch (e) {
        console.error('changeRegCategory error:', e);
        toast('Error al cambiar la categoría: ' + (e.message || e), 'error');
      }
    };

    // ── Borrar una inscripción duplicada ────────────────────────────────
    // Elimina la fila (incluyendo sus tallas) para que no se cuente doble
    // en el recuento de camisetas ni se entrene a generar el cuadro.
    const deleteRegistration = async (reg) => {
      const ok = await confirmDialog(
        `¿Borrar definitivamente la inscripción de "${reg.player1_name} y ${reg.player2_name}" en "${reg.category}"?\n\nSe eliminan también sus tallas de camiseta y su disponibilidad. Esta acción no se puede deshacer.`,
        { title: 'Borrar inscripción', okText: 'Borrar', danger: true }
      );
      if (!ok) return;
      try {
        const { error } = await supabase
          .from('tournament_registrations')
          .delete()
          .eq('id', reg.id);
        if (error) throw error;
        setRegsList(prev => prev.filter(r => r.id !== reg.id));
        toast('🗑️ Inscripción borrada.', 'success');
      } catch (e) {
        console.error('deleteRegistration error:', e);
        toast('Error al borrar la inscripción: ' + (e.message || e), 'error');
      }
    };

    // ── Edición de disponibilidad de una pareja online ──────────────────
    // Abre el grid editor con los huecos bloqueados que ya tenía la pareja.
    const openEditRegAvail = (reg) => {
      const blocked = new Set();
      (reg.unavailable_times || []).forEach(rule => (rule.slots || []).forEach(s => blocked.add(s)));
      setGridBlockedSlots(blocked);
      setEditingRegAvail(reg);
    };
    // Guarda los cambios en la BBDD y refresca regsList localmente.
    const saveRegAvail = async () => {
      if (!editingRegAvail) return;
      setSavingRegAvail(true);
      try {
        const byDay = {};
        activeDays.forEach(day => {
          const blocked = getHoursForDay(day).filter(h => gridBlockedSlots.has(`${day} ${h}`));
          if (blocked.length > 0) byDay[day] = blocked;
        });
        const unavailableTimes = Object.entries(byDay).map(([day, hours]) => ({
          id: `${day}-${Date.now()}`,
          day,
          label: `${day}: ${hoursToRanges(hours).join(', ')}`,
          slots: hours.map(h => `${day} ${h}`),
        }));
        const { error } = await supabase
          .from('tournament_registrations')
          .update({ unavailable_times: unavailableTimes })
          .eq('id', editingRegAvail.id);
        if (error) throw error;
        setRegsList(prev => prev.map(r => r.id === editingRegAvail.id ? { ...r, unavailable_times: unavailableTimes } : r));
        toast('✓ Disponibilidad actualizada.', 'success');
        setEditingRegAvail(null);
        setGridBlockedSlots(new Set());
      } catch (e) {
        console.error('saveRegAvail error:', e);
        toast('Error al guardar disponibilidad: ' + (e.message || e), 'error');
      } finally {
        setSavingRegAvail(false);
      }
    };
    // Recuento de tallas combinando online + manuales.
    // IMPORTANTE: deduplicamos por (categoría, nombres normalizados). Si una
    // pareja figura dos veces como duplicada, sus tallas SOLO cuentan una vez
    // — si no, el club encargaría/contaría el doble de camisetas.
    const shirtTally = (() => {
      const counts = Object.fromEntries(SHIRT_SIZES.map(s => [s, 0]));
      let unassigned = 0;
      let total = 0;
      const push = (s) => {
        total++;
        if (s && counts[s] !== undefined) counts[s]++;
        else unassigned++;
      };
      const seen = new Set();
      regsList.forEach(r => {
        const k = dupKey(r);
        if (seen.has(k)) return; // duplicado: ya contado
        seen.add(k);
        push(r.player1_shirt_size || r.shirt_size);
        push(r.player2_shirt_size);
      });
      manualParticipants.forEach(p => {
        push(p.player1_shirt_size);
        push(p.player2_shirt_size);
      });
      return { counts, unassigned, total };
    })();
    const setManualShirtSize = (id, field, value) => {
      setParticipants(prev => prev.map(p => p.id === id ? { ...p, [field]: value || null } : p));
    };
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
                {regsList.length} pareja{regsList.length === 1 ? '' : 's'} online
                {manualParticipants.length > 0 && ` · ${manualParticipants.length} manual${manualParticipants.length === 1 ? '' : 'es'}`}
                {tConfig.gift === 'shirt' && ' · 🎁 Camiseta'}
                {tConfig.registrationFeeEnabled && tConfig.registrationFeeAmount > 0 && ` · 💳 ${tConfig.registrationFeeAmount}€`}
              </p>
              {tConfig.gift === 'shirt' && shirtTally.total > 0 && (
                <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>🎽 Tallas:</span>
                  {SHIRT_SIZES.map(s => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', background: shirtTally.counts[s] > 0 ? '#DBEAFE' : '#F1F5F9', color: shirtTally.counts[s] > 0 ? '#1E40AF' : '#94A3B8', fontWeight: 800, fontSize: '0.74rem', border: shirtTally.counts[s] > 0 ? '1px solid #BFDBFE' : '1px solid #E2E8F0' }}>
                      <span>{shirtTally.counts[s]}</span>
                      <span>{s}</span>
                    </span>
                  ))}
                  {shirtTally.unassigned > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', background: '#FEF3C7', color: '#92400E', fontWeight: 800, fontSize: '0.74rem', border: '1px solid #FDE68A' }}>
                      ❓ {shirtTally.unassigned} sin asignar
                    </span>
                  )}
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>
                    · Total jugadores: {shirtTally.total}
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {tournamentCategories.length > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>
                  Categoría:
                  <select
                    value={regsCatFilter}
                    onChange={e => setRegsCatFilter(e.target.value)}
                    style={{ padding: '0.45rem 0.7rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    <option value="Todas">Todas</option>
                    {tournamentCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              <button onClick={loadRegistrations} disabled={loadingRegs} style={{ padding: '0.55rem 0.9rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                {loadingRegs ? 'Cargando…' : '🔄 Refrescar'}
              </button>
              <button onClick={downloadRegistrationsCsv} style={{ padding: '0.55rem 0.9rem', borderRadius: '0.5rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                ⬇ Exportar CSV
              </button>
            </div>
          </div>
          <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
            {regsCatFilter !== 'Todas' && (
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#1E40AF', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                Filtrando por <strong>{regsCatFilter}</strong>: {filteredRegs.length} pareja{filteredRegs.length === 1 ? '' : 's'} online
                {filteredManual.length > 0 && ` · ${filteredManual.length} manual${filteredManual.length === 1 ? '' : 'es'}`}.
                Las parejas inscritas en doble categoría aparecen en cada una.
              </p>
            )}
            {filteredRegs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.95rem' }}>
                {loadingRegs ? 'Cargando…' : (regsCatFilter === 'Todas' ? 'Aún no hay inscripciones online.' : `No hay inscripciones online en ${regsCatFilter}.`)}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                      <th style={thCell}>Pareja</th>
                      <th style={thCell}>Categoría</th>
                      <th style={thCell}>Contacto</th>
                      <th style={thCell}>Disponibilidad</th>
                      {tConfig.gift === 'shirt' && <th style={thCell}>Talla</th>}
                      {tConfig.registrationFeeEnabled && <th style={thCell}>Pago</th>}
                      {tConfig.registrationFeeEnabled && <th style={thCell}>Acción pago</th>}
                      <th style={thCell}>Validación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegs.map(r => {
                      const isDup = (dupCounts[dupKey(r)] || 0) > 1;
                      const blocks = r.unavailable_times || [];
                      const totalBlockedHours = blocks.reduce((acc, b) => acc + (b.slots?.length || 0), 0);
                      return (
                      <tr key={`reg-${r.id}`} style={{ borderTop: '1px solid #F1F5F9', backgroundColor: isDup ? '#FEF2F2' : undefined }}>
                        <td style={tdCell}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.player1_name}</div>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.player2_name}</div>
                          {isDup && (
                            <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-block', padding: '0.15rem 0.45rem', borderRadius: '999px', background: '#FEE2E2', color: '#B91C1C', fontSize: '0.68rem', fontWeight: 800 }} title={`Esta pareja figura ${dupCounts[dupKey(r)]} veces en ${r.category}`}>
                                ⚠️ Duplicada ×{dupCounts[dupKey(r)]}
                              </span>
                              <button onClick={() => deleteRegistration(r)} style={{ padding: '0.15rem 0.45rem', borderRadius: '0.3rem', border: '1px solid #FCA5A5', background: 'white', color: '#B91C1C', fontWeight: 700, fontSize: '0.65rem', cursor: 'pointer' }} title="Borrar esta inscripción duplicada (también sus tallas)">
                                🗑️ Borrar
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={tdCell}>
                          {tournamentCategories.length > 1 ? (
                            <select
                              value={r.category}
                              onChange={e => changeRegCategory(r, e.target.value)}
                              style={{ padding: '0.3rem 0.45rem', borderRadius: '0.4rem', border: '1.5px solid #CBD5E1', background: 'white', fontSize: '0.78rem', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}
                              title="Cambiar categoría de esta pareja"
                            >
                              {!tournamentCategories.includes(r.category) && (
                                <option value={r.category}>{r.category}</option>
                              )}
                              {tournamentCategories.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            r.category
                          )}
                        </td>
                        <td style={tdCell}>
                          <div style={{ fontSize: '0.78rem', color: '#475569' }}>{r.player1_phone}</div>
                          <div style={{ fontSize: '0.78rem', color: '#475569' }}>{r.player2_phone}</div>
                          {(r.player1_email || r.player2_email) && (
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                              {[r.player1_email, r.player2_email].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td style={tdCell}>
                          {blocks.length === 0 ? (
                            <span style={{ fontSize: '0.74rem', color: '#16A34A', fontWeight: 600 }}>✓ Sin bloqueos</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 700 }}>{totalBlockedHours}h bloqueadas</span>
                              {blocks.slice(0, 3).map(b => (
                                <span key={b.id || b.day} style={{ fontSize: '0.68rem', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.1rem 0.35rem', borderRadius: '0.3rem' }}>
                                  {b.label || b.day}
                                </span>
                              ))}
                              {blocks.length > 3 && (
                                <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>+{blocks.length - 3} más</span>
                              )}
                            </div>
                          )}
                          <button onClick={() => openEditRegAvail(r)} style={{ marginTop: '0.35rem', padding: '0.22rem 0.55rem', borderRadius: '0.35rem', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer' }}>
                            ✎ Editar
                          </button>
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
                                {/* Botón borrar siempre visible — útil tanto para
                                    duplicados como para inscripciones erróneas */}
                                <button
                                  onClick={() => deleteRegistration(r)}
                                  title="Borrar esta inscripción (también sus tallas y disponibilidad)"
                                  style={{ marginTop: '0.15rem', padding: '0.25rem 0.55rem', borderRadius: '0.4rem', border: '1px solid #FCA5A5', background: 'white', color: '#B91C1C', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  🗑️ Borrar
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredManual.length > 0 && (
              <div style={{ marginTop: filteredRegs.length === 0 ? '0' : '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>✋ Parejas añadidas manualmente</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                    {filteredManual.length} pareja{filteredManual.length === 1 ? '' : 's'}
                  </span>
                </div>
                {tConfig.gift === 'shirt' && (
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#64748B' }}>
                    Asigna la talla de camiseta para cada jugador. Se sumará al recuento total.
                  </p>
                )}
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={thCell}>Pareja</th>
                        <th style={thCell}>Categoría</th>
                        {tConfig.gift === 'shirt' && <th style={thCell}>Talla J1</th>}
                        {tConfig.gift === 'shirt' && <th style={thCell}>Talla J2</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredManual.map(p => (
                        <tr key={`man-${p.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                          <td style={tdCell}>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{p.name}</div>
                          </td>
                          <td style={tdCell}>{p.category}</td>
                          {tConfig.gift === 'shirt' && (
                            <td style={tdCell}>
                              <select
                                value={p.player1_shirt_size || ''}
                                onChange={e => setManualShirtSize(p.id, 'player1_shirt_size', e.target.value)}
                                style={{ padding: '0.35rem 0.5rem', borderRadius: '0.4rem', border: '1.5px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700, color: '#0369A1', background: 'white', cursor: 'pointer' }}
                              >
                                <option value="">—</option>
                                {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          )}
                          {tConfig.gift === 'shirt' && (
                            <td style={tdCell}>
                              <select
                                value={p.player2_shirt_size || ''}
                                onChange={e => setManualShirtSize(p.id, 'player2_shirt_size', e.target.value)}
                                style={{ padding: '0.35rem 0.5rem', borderRadius: '0.4rem', border: '1.5px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700, color: '#0369A1', background: 'white', cursor: 'pointer' }}
                              >
                                <option value="">—</option>
                                {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Modal de edición de disponibilidad de una inscripción ── */}
        {editingRegAvail && (
          <div
            onMouseUp={() => setGridDragging(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
          >
            <div style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '680px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid #E2E8F0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>✎ Disponibilidad de la pareja</h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                    {editingRegAvail.player1_name} y {editingRegAvail.player2_name} · {editingRegAvail.category}
                  </p>
                </div>
                <button onClick={() => { setEditingRegAvail(null); setGridBlockedSlots(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.65rem', padding: '0.7rem 0.9rem', marginBottom: '0.9rem' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400E', lineHeight: 1.5 }}>
                    Marca las horas en las que la pareja <strong>NO puede jugar</strong>. Puedes arrastrar para marcar/desmarcar varias. Los cambios se guardan en la inscripción.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: '#FED7AA', border: '1px solid #F97316' }} />
                    No puede jugar
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: '#DCFCE7', border: '1px solid #86EFAC' }} />
                    Disponible
                  </div>
                </div>
                <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', userSelect: 'none' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ padding: '0.45rem 0.6rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '52px' }}>Hora</th>
                        {activeDays.map(day => (
                          <th key={day} style={{ padding: '0.45rem 0.45rem', color: '#0F172A', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '76px' }}>
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allGridHours.map((hour, hIdx) => (
                        <tr key={hour} style={{ backgroundColor: hIdx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                          <td style={{ padding: '0.18rem 0.6rem', color: '#64748B', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{hour}</td>
                          {activeDays.map(day => {
                            const isValid = getHoursForDay(day).includes(hour);
                            const isBlocked = gridBlockedSlots.has(`${day} ${hour}`);
                            return (
                              <td key={day} style={{ padding: '0.18rem 0.3rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0' }}>
                                <div
                                  onMouseDown={isValid ? () => handleCellMouseDown(day, hour) : undefined}
                                  onMouseEnter={isValid ? () => handleCellMouseEnter(day, hour) : undefined}
                                  style={{
                                    height: '24px',
                                    borderRadius: '4px',
                                    cursor: isValid ? 'pointer' : 'default',
                                    backgroundColor: !isValid ? '#F1F5F9' : isBlocked ? '#FED7AA' : '#DCFCE7',
                                    border: `1px solid ${!isValid ? '#E2E8F0' : isBlocked ? '#F97316' : '#86EFAC'}`,
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
                {gridBlockedSlots.size > 0 && (
                  <p style={{ margin: '0.65rem 0 0', fontSize: '0.76rem', color: '#DC2626', fontWeight: 600 }}>
                    {gridBlockedSlots.size} hora{gridBlockedSlots.size !== 1 ? 's' : ''} bloqueada{gridBlockedSlots.size !== 1 ? 's' : ''}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditingRegAvail(null); setGridBlockedSlots(new Set()); }} disabled={savingRegAvail} style={{ padding: '0.6rem 1rem', borderRadius: '0.55rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={saveRegAvail} disabled={savingRegAvail} style={{ padding: '0.6rem 1.1rem', borderRadius: '0.55rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: savingRegAvail ? 'not-allowed' : 'pointer', opacity: savingRegAvail ? 0.6 : 1 }}>
                    {savingRegAvail ? 'Guardando…' : '💾 Guardar disponibilidad'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input type="date" value={tConfig.registrationDeadline || ''} max={tConfig.startDate || ''} onChange={e => setTConfig({...tConfig, registrationDeadline: e.target.value})} style={{ flex: '2 1 180px', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }} />
                <input type="time" value={tConfig.registrationDeadlineTime || '23:59'} onChange={e => setTConfig({...tConfig, registrationDeadlineTime: e.target.value})} style={{ flex: '1 1 110px', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#0F172A', cursor: 'pointer', boxSizing: 'border-box' }} />
              </div>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>Fecha y hora límite para inscripciones online. Por defecto cierra a las 23:59 del día elegido.</p>
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
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/torneos/${publishedId}`); toast('¡Enlace copiado al portapapeles!', 'success'); }} style={{ marginLeft: '0.75rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#334155', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
                  toast('✅ Enlace actualizado con la configuración actual (fechas, horarios, categorías, pistas, cuadros).', 'success');
                } catch (e) {
                  console.error(e);
                  toast('Error al actualizar el enlace.', 'error');
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
            <input type="time" value={tConfig.registrationDeadlineTime || '23:59'} onChange={e => setTConfig({...tConfig, registrationDeadlineTime: e.target.value})} style={{ padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #FDE68A', fontSize: '0.9rem', cursor: 'pointer', backgroundColor: 'white', boxSizing: 'border-box' }} />
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
                onClick={openFormatPicker}
                disabled={participants.length < 2}
                title={participants.length < 2 ? 'Añade al menos 2 parejas para generar el cuadro' : 'Elige el formato por categoría y genera el cuadro'}
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
            onClick={openFormatPicker}
            style={{ width: '100%', padding: '1rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', opacity: participants.length < 2 ? 0.5 : 1 }}
          >
            🎲 Sortear y Generar Cuadro
          </button>
          {/* Si YA hay un cuadro generado, atajo para entrar en él SIN
              re-generar (sin re-sortear). Útil para volver a ver/seguir
              jugando sin perder los emparejamientos ni los horarios. */}
          {Object.keys(rounds || {}).length > 0 && (
            <button
              onClick={() => setPhase('bracket')}
              style={{ width: '100%', padding: '0.85rem 1rem', marginTop: '0.6rem', borderRadius: '0.75rem', border: '1.5px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}
            >
              ➡️ Continuar al cuadro existente (sin re-sortear)
            </button>
          )}
          <button onClick={() => setPhase('config')} style={{ border: 'none', background: 'none', color: '#64748B', cursor: 'pointer', padding: '1rem 0 0 0', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}>
            ← Atrás a Configuración
          </button>
        </div>
      </div>

      {/* Modal de elección de formato — debe renderizarse aquí (fase setup)
          porque es donde están los botones que lo abren. */}
      {showFormatPicker && (
        <div onClick={() => setShowFormatPicker(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '560px', marginTop: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>🎲 Formato por categoría</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Elige el formato de cada categoría antes de generar el cuadro. El resto de la configuración (fechas, pistas, parejas, cabezas de serie) se conserva.
                </p>
              </div>
              <button onClick={() => setShowFormatPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.74rem', color: '#475569', fontWeight: 700 }}>
                Marca qué categorías quieres generar/regenerar. Las desmarcadas conservan su cuadro actual intacto.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const all = {};
                    (tConfig.categories || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => { all[c] = true; });
                    setPickerSelectedCats(all);
                  }}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.35rem', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => setPickerSelectedCats({})}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.35rem', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}
                >
                  Desmarcar todas
                </button>
              </div>
              {(tConfig.categories || '').split(',').map(c => c.trim()).filter(Boolean).map(cat => {
                const partsInCat = participants.filter(p => p.category === cat).length;
                const checked = !!pickerSelectedCats[cat];
                const alreadyHas = !!(rounds && rounds[cat] && rounds[cat].length > 0);
                return (
                  <div key={cat} style={{ padding: '0.75rem 0.85rem', borderRadius: '0.6rem', background: checked ? '#F8FAFC' : '#FAFAFA', border: `1px solid ${checked ? '#E2E8F0' : '#F1F5F9'}`, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', opacity: checked ? 1 : 0.55 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => setPickerSelectedCats(prev => ({ ...prev, [cat]: e.target.checked }))}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#16A34A', flexShrink: 0 }}
                      title={checked ? 'Generar/regenerar esta categoría ahora' : 'Conservar el cuadro actual de esta categoría'}
                    />
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>{cat}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.15rem' }}>
                        {partsInCat} pareja{partsInCat === 1 ? '' : 's'}
                        {alreadyHas && <span style={{ marginLeft: '0.4rem', color: '#16A34A', fontWeight: 700 }}>· cuadro generado</span>}
                      </div>
                    </div>
                    <select
                      value={pickerFormats[cat] || 'eliminatoria'}
                      onChange={e => setPickerFormats(prev => ({ ...prev, [cat]: e.target.value }))}
                      disabled={!checked}
                      style={{ flex: '0 1 240px', minWidth: '180px', padding: '0.55rem 0.7rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, color: '#0F172A', background: checked ? 'white' : '#F1F5F9', cursor: checked ? 'pointer' : 'not-allowed' }}
                    >
                      <option value="eliminatoria">Eliminatoria (cuadro)</option>
                      <option value="liguilla">Liguilla (todos contra todos)</option>
                      <option value="liguilla_ko">Liguilla + eliminatorias finales</option>
                    </select>
                  </div>
                );
              })}

              {Object.values(pickerFormats).some(f => f === 'liguilla_ko') && (
                <div style={{ marginTop: '0.25rem', padding: '0.75rem 0.85rem', borderRadius: '0.6rem', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liguilla + KO — clasifican</p>
                  <select
                    value={tConfig.liguillaQualifyPerGroup ?? 2}
                    onChange={e => setTConfig({ ...tConfig, liguillaQualifyPerGroup: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '0.5rem', border: '1.5px solid #FDE68A', fontSize: '0.82rem', backgroundColor: 'white', cursor: 'pointer' }}
                  >
                    <option value={2}>Top 2 (semifinales)</option>
                    <option value={4}>Top 4 (cuartos)</option>
                    <option value={8}>Top 8 (octavos)</option>
                  </select>
                </div>
              )}

              <div style={{ marginTop: '0.25rem', padding: '0.75rem 0.85rem', borderRadius: '0.6rem', background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estructura del cuadro</p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer', marginBottom: '0.4rem' }}>
                  <input
                    type="radio"
                    checked={!pickerUseByes}
                    onChange={() => setPickerUseByes(false)}
                    style={{ width: '16px', height: '16px', marginTop: '0.15rem', cursor: 'pointer', accentColor: '#F97316' }}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#9A3412', lineHeight: 1.5 }}>
                    <strong>Ronda Previa</strong> — cuadro principal pequeño, sobrantes juegan una previa corta antes de cuartos. <span style={{ color: '#C2410C', fontSize: '0.7rem' }}>(Por defecto, menos byes)</span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={pickerUseByes}
                    onChange={() => setPickerUseByes(true)}
                    style={{ width: '16px', height: '16px', marginTop: '0.15rem', cursor: 'pointer', accentColor: '#F97316' }}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#9A3412', lineHeight: 1.5 }}>
                    <strong>Octavos con byes</strong> — cuadro principal grande (siguiente potencia de 2), parejas de más entran como byes. <span style={{ color: '#C2410C', fontSize: '0.7rem' }}>(Estructura clásica)</span>
                  </span>
                </label>
              </div>

              <div style={{ marginTop: '0.25rem', padding: '0.75rem 0.85rem', borderRadius: '0.6rem', background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pickerManualR0}
                    onChange={e => setPickerManualR0(e.target.checked)}
                    style={{ width: '16px', height: '16px', marginTop: '0.15rem', cursor: 'pointer', accentColor: '#0EA5E9' }}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#075985', lineHeight: 1.5 }}>
                    <strong>Pongo yo los horarios del primer partido a mano.</strong><br/>
                    <span style={{ color: '#0369A1', fontSize: '0.72rem' }}>
                      Útil para coordinar manualmente la primera ronda con la disponibilidad de los jugadores. La primera ronda se generará SIN horario — usa el icono ✎ de cada match para fijar la hora. Después pulsa "🔄 Recalcular horarios" para que el resto del cuadro se acomode a tu elección.
                    </span>
                  </span>
                </label>
              </div>

              {(rounds && Object.keys(rounds).length > 0) && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem 0.85rem', borderRadius: '0.6rem', background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#991B1B', lineHeight: 1.5 }}>
                    ⚠️ <strong>Ya hay un cuadro generado.</strong> Al pulsar "Generar" se regenerará desde cero — se perderán los resultados y los horarios manuales del cuadro actual. La configuración del torneo (fechas, pistas, cabezas de serie, parejas inscritas) se conserva.
                  </p>
                </div>
              )}
            </div>
            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => setShowFormatPicker(false)} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmFormatPicker} style={{ padding: '0.6rem 1.2rem', borderRadius: '0.5rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>
                🎲 Generar
              </button>
            </div>
          </div>
        </div>
      )}
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
        // Construimos un set por cada pareja con los slots que marcó como
        // no disponibles. Así en la grid podemos mostrar QUIÉN bloquea cada
        // celda (🅰️ = pareja 1, 🅱️ = pareja 2, 🅰🅱 = las dos).
        const blocksFor = (p) => {
          if (!p || p.isBye || p.isPlaceholder || p.isPrelimPlaceholder) return new Set();
          const out = new Set();
          (p.prefRules || []).forEach(rule => (rule.slots || []).forEach(s => out.add(s)));
          return out;
        };
        const blockedByP1 = blocksFor(match.p1);
        const blockedByP2 = blocksFor(match.p2);

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

                {/* Resumen de disponibilidad de cada pareja por separado.
                    🅰 = pareja 1, 🅱 = pareja 2 — los mismos iconos aparecen
                    en las celdas de la grid indicando QUIÉN bloquea cada hora. */}
                {[
                  { p: match.p1, badge: '🅰' },
                  { p: match.p2, badge: '🅱' },
                ].map(({ p, badge }, idx) => {
                  if (!p || p.isBye || p.isPlaceholder || p.isPrelimPlaceholder) return null;
                  const rules = p.prefRules || [];
                  return (
                    <div key={`avail-${idx}`} style={{ padding: '0.6rem 0.85rem', borderRadius: '0.6rem', background: rules.length === 0 ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${rules.length === 0 ? '#BBF7D0' : '#FED7AA'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A' }}>
                          {badge} <span style={{ marginLeft: '0.2rem' }}>{p.name}</span>
                        </span>
                        {rules.length === 0 ? (
                          <span style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 700 }}>✓ Sin bloqueos — siempre disponible</span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#9A3412', fontWeight: 700 }}>⚠ NO disponible en:</span>
                        )}
                      </div>
                      {rules.length > 0 && (
                        <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {rules.map(r => (
                            <span key={r.id || r.day} style={{ fontSize: '0.7rem', color: '#9A3412', background: 'white', border: '1px solid #FED7AA', padding: '0.15rem 0.45rem', borderRadius: '0.3rem' }}>
                              {r.label || r.day}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', color: '#64748B', fontWeight: 600, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#F0FDF4', border: '1.5px solid #BBF7D0' }} /> Libre
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#FEE2E2', border: '1.5px solid #FECACA' }} /> Ocupada
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#DBEAFE', border: '1.5px solid #93C5FD' }} /> Selección actual
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#FED7AA', border: '1.5px solid #F97316' }} /> 🅰 o 🅱 bloquea
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#FB923C', border: '1.5px solid #C2410C' }} /> 🅰🅱 ambas bloquean
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
                            const byP1 = blockedByP1.has(slot);
                            const byP2 = blockedByP2.has(slot);
                            const pairBlocked = (byP1 || byP2) && !occupied && !isCurrent;
                            // Color más fuerte si ambas parejas bloquean ese slot
                            const bothBlocked = byP1 && byP2 && pairBlocked;
                            const bg = occupied ? '#FEE2E2'
                              : isCurrent ? '#DBEAFE'
                              : bothBlocked ? '#FB923C'
                              : pairBlocked ? '#FED7AA'
                              : '#F0FDF4';
                            const border = occupied ? '1.5px solid #FECACA'
                              : isCurrent ? '1.5px solid #93C5FD'
                              : bothBlocked ? '1.5px solid #C2410C'
                              : pairBlocked ? '1.5px solid #F97316'
                              : '1.5px solid #BBF7D0';
                            const textColor = occupied ? '#B91C1C'
                              : isCurrent ? '#1D4ED8'
                              : bothBlocked ? '#7C2D12'
                              : pairBlocked ? '#9A3412'
                              : '#15803D';
                            // Etiqueta visual: indica QUIÉN bloquea
                            //   🅰 = solo pareja 1, 🅱 = solo pareja 2, 🅰🅱 = las dos
                            const blockBadge = bothBlocked ? '🅰🅱' : byP1 ? '🅰' : byP2 ? '🅱' : '';
                            const label = occupied ? info.label
                              : isCurrent ? 'Actual'
                              : pairBlocked ? `${blockBadge} No disp.`
                              : 'Libre';
                            const tooltip = occupied ? `Ocupada: ${info.label}`
                              : isCurrent ? 'Asignada a este partido'
                              : bothBlocked ? `Ambas parejas marcaron esta hora como NO disponible (${match.p1?.name || '🅰'} + ${match.p2?.name || '🅱'})`
                              : byP1 ? `🅰 ${match.p1?.name || 'Pareja 1'} marcó esta hora como NO disponible`
                              : byP2 ? `🅱 ${match.p2?.name || 'Pareja 2'} marcó esta hora como NO disponible`
                              : 'Libre — pulsa para asignar';
                            return (
                              <td key={c} style={{ padding: '0.25rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0' }}>
                                <button
                                  type="button"
                                  disabled={occupied}
                                  onClick={() => !occupied && commitEditingTime(day, hour, c)}
                                  style={{ width: '100%', minHeight: '40px', padding: '0.25rem 0.4rem', borderRadius: '0.4rem', background: bg, border, color: textColor, fontWeight: 700, fontSize: '0.7rem', cursor: occupied ? 'not-allowed' : 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                                  title={tooltip}
                                >
                                  {label}
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
      {/* ── Modal admin: listado de partidos por día ─────────────────────── */}
      {showMatchesList && (() => {
        // Recolectamos todos los matches (rounds + consRounds) con time set,
        // los agrupamos por día y los ordenamos por hora.
        const items = [];
        const collect = (roundsObj, isCons) => {
          Object.entries(roundsObj || {}).forEach(([cat, catRs]) => {
            (catRs || []).forEach((round, rIdx) => {
              (round || []).forEach(m => {
                if (!m.time || m.time === 'A convenir') return;
                if (m.p1?.isBye && m.p2?.isBye) return; // skip bye-vs-bye
                const parts = m.time.split(' - Pista');
                const slot = parts[0]?.trim();
                const court = parseInt(parts[1], 10);
                if (!slot) return;
                const [day, hour] = slot.split(' ');
                items.push({
                  day, hour, court,
                  cat, isCons,
                  round: rIdx,
                  isPrelim: !!m.p1?.isPrelim || !!m.isPrelim || !!round[0]?.isPrelim,
                  p1: m.p1?.name || (m.p1?.isBye ? 'BYE' : (m.p1?.isPrelimPlaceholder ? 'Ganador previa' : 'TBD')),
                  p2: m.p2?.name || (m.p2?.isBye ? 'BYE' : (m.p2?.isPrelimPlaceholder ? 'Ganador previa' : 'TBD')),
                  winner: m.winner?.name || null,
                  score: m.score || null,
                  matchId: m.id,
                });
              });
            });
          });
        };
        collect(rounds, false);
        collect(consRounds, true);

        // Agrupar por día
        const byDay = {};
        items.forEach(it => {
          if (!byDay[it.day]) byDay[it.day] = [];
          byDay[it.day].push(it);
        });
        // Orden de días: por fecha real (DD/MM)
        const dayKeys = Object.keys(byDay).sort((a, b) => {
          const [da, ma] = a.split('/').map(Number);
          const [db, mb] = b.split('/').map(Number);
          return (ma * 31 + da) - (mb * 31 + db);
        });
        // Dentro de cada día: orden por hora, luego por pista
        dayKeys.forEach(d => {
          byDay[d].sort((a, b) => {
            if (a.hour !== b.hour) return a.hour < b.hour ? -1 : 1;
            return (a.court || 0) - (b.court || 0);
          });
        });

        return (
          <div onClick={() => setShowMatchesList(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '900px', marginTop: '2rem', marginBottom: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>📅 Partidos por día · {tConfig.name}</h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                    {items.length} partido{items.length === 1 ? '' : 's'} programado{items.length === 1 ? '' : 's'} en {dayKeys.length} día{dayKeys.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={matchesListDayFilter}
                    onChange={e => setMatchesListDayFilter(e.target.value)}
                    title="Filtrar por día (también afecta al PDF descargado)"
                    style={{ padding: '0.45rem 0.7rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    <option value="all">Todos los días</option>
                    {dayKeys.map(d => (
                      <option key={d} value={d}>📅 {d} ({byDay[d].length})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDownloadMatchesPDF(items, byDay, dayKeys, matchesListDayFilter)}
                    disabled={matchesListPdfLoading || dayKeys.length === 0}
                    title="Descarga un PDF nativo (no captura) con los partidos del día seleccionado"
                    style={{ padding: '0.5rem 0.9rem', borderRadius: '0.5rem', border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontWeight: 700, fontSize: '0.78rem', cursor: matchesListPdfLoading ? 'wait' : 'pointer', opacity: matchesListPdfLoading ? 0.6 : 1 }}
                  >
                    {matchesListPdfLoading ? '⏳ Generando…' : '📄 Descargar PDF'}
                  </button>
                  <button onClick={() => setShowMatchesList(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
                </div>
              </div>
              <div style={{ padding: '1rem 1.5rem 1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
                {dayKeys.length === 0 ? (
                  <p style={{ margin: 0, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                    Aún no hay partidos con horario asignado. Genera el cuadro o usa "Recalcular horarios" para asignar tiempos.
                  </p>
                ) : (
                  (matchesListDayFilter === 'all' ? dayKeys : dayKeys.filter(d => d === matchesListDayFilter)).map(d => (
                    <div key={d} style={{ marginBottom: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 800, color: 'white', background: 'linear-gradient(135deg,#1E293B,#334155)', borderRadius: '0.5rem', display: 'inline-block' }}>
                        📅 {d} · {byDay[d].length} partido{byDay[d].length === 1 ? '' : 's'}
                      </h4>
                      <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.6rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px' }}>Hora</th>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px' }}>Pista</th>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoría · Ronda</th>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pareja 1</th>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pareja 2</th>
                              <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resultado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {byDay[d].map((it, i) => {
                              const isP1Win = it.winner && it.winner === it.p1;
                              const isP2Win = it.winner && it.winner === it.p2;
                              const roundName = it.isCons ? 'Cons.' : (it.isPrelim ? 'Previa' : `R${it.round}`);
                              return (
                                <tr key={i} style={{ borderTop: '1px solid #F1F5F9', backgroundColor: it.winner ? '#F0FDF4' : 'white' }}>
                                  <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: '#0F172A' }}>{it.hour}</td>
                                  <td style={{ padding: '0.5rem 0.6rem', color: '#475569', fontWeight: 600 }}>{getCourtName(it.court)}</td>
                                  <td style={{ padding: '0.5rem 0.6rem' }}>
                                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.78rem' }}>{it.cat}</div>
                                    <div style={{ fontSize: '0.7rem', color: it.isCons ? '#D97706' : '#64748B', fontWeight: 600 }}>{it.isCons ? '🥈 Consolación' : ''} {roundName}</div>
                                  </td>
                                  <td style={{ padding: '0.5rem 0.6rem', fontWeight: isP1Win ? 800 : 600, color: isP1Win ? '#15803D' : '#0F172A' }}>{it.p1} {isP1Win && '🏆'}</td>
                                  <td style={{ padding: '0.5rem 0.6rem', fontWeight: isP2Win ? 800 : 600, color: isP2Win ? '#15803D' : '#0F172A' }}>{it.p2} {isP2Win && '🏆'}</td>
                                  <td style={{ padding: '0.5rem 0.6rem', color: it.score ? '#15803D' : '#CBD5E1', fontWeight: 700, fontSize: '0.78rem' }}>{it.score || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showCourtsEditor && (
        <div onClick={() => setShowCourtsEditor(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '560px', marginTop: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>🏟️ Pistas del torneo</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Ajusta pistas, horarios y a qué categorías se asigna cada una. Pulsa "Aplicar y recalcular horarios" para llevar los cambios al cuadro actual. Los horarios manuales no se mueven.
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
              {/* ── Pistas asignadas por categoría (mismo control que en config) ── */}
              <div style={{ padding: '0.85rem', backgroundColor: '#F0F9FF', borderRadius: '0.65rem', border: '1px solid #BAE6FD' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.82rem', fontWeight: 800, color: '#075985' }}>
                  🏟️ Pistas asignadas por categoría
                </label>
                <p style={{ margin: '0 0 0.55rem', fontSize: '0.72rem', color: '#0369A1', lineHeight: 1.5 }}>
                  Marca en qué pistas se podrá programar cada categoría (cuadro principal y consolación). Si no marcas ninguna, el auto-programador podrá usar cualquier pista del torneo. Pulsa "Aplicar y recalcular horarios" para aplicarlo al cuadro actual.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ minWidth: '85px', fontSize: '0.74rem', color: '#0F172A', fontWeight: 700 }}>{label}</span>
                        {courtsAvailable.map(c => {
                          const checked = allowed.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => toggleCourt(kind, c)}
                              style={{ padding: '0.25rem 0.5rem', borderRadius: '0.35rem', border: `1.5px solid ${checked ? '#0EA5E9' : '#CBD5E1'}`, background: checked ? '#0EA5E9' : 'white', color: checked ? 'white' : '#475569', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                              title={getCourtName(c)}
                            >
                              {getCourtName(c)}
                            </button>
                          );
                        })}
                        {allowed.length === 0 && (
                          <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontStyle: 'italic' }}>(todas)</span>
                        )}
                      </div>
                    );
                    return (
                      <div key={cat} style={{ padding: '0.55rem 0.7rem', borderRadius: '0.45rem', background: 'white', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#075985' }}>{cat}</span>
                        {renderRow('main', 'Principal', mainAllowed)}
                        {renderRow('cons', 'Consolación', consAllowed)}
                      </div>
                    );
                  })}
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
      <ServerClockBanner />
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
            <input type="time" value={tConfig.registrationDeadlineTime || '23:59'} onChange={e => setTConfig({...tConfig, registrationDeadlineTime: e.target.value})} style={{ padding: '0.3rem 0.5rem', borderRadius: '0.4rem', border: '1.5px solid #FDE68A', fontSize: '0.8rem', cursor: 'pointer', backgroundColor: '#FFFBEB', boxSizing: 'border-box' }} />
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
                onClick={() => setShowMatchesList(true)}
                title="Listado de TODOS los partidos agrupados por día y ordenados por hora."
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #C4B5FD', backgroundColor: '#F5F3FF', color: '#6D28D9', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                📅 Partidos por día
              </button>
              <button
                onClick={async () => {
                  const ok = await confirmDialog(
                    '¿Reiniciar resultados? Se borrarán todos los ganadores y marcadores, pero las parejas quedarán en el mismo sitio del cuadro.',
                    { title: 'Reiniciar resultados', okText: 'Reiniciar', danger: true }
                  );
                  if (ok) {
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
                onClick={async () => {
                  const ok = await confirmDialog(
                    '¿Volver a sortear el cuadro? Se perderán todos los resultados actuales y se generará un nuevo orden aleatorio con las mismas parejas.',
                    { title: 'Re-sortear cuadro', okText: 'Re-sortear', danger: true }
                  );
                  if (ok) generateBracket();
                }}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #FDE68A', backgroundColor: 'white', color: '#B45309', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Re-sortear Cuadro
              </button>
              <button
                onClick={async () => {
                  const ok = await confirmDialog(
                    '¿Deshacer el sorteo? Se borrarán TODOS los cuadros (principal y consolación) y el cuadro dejará de ser público. Las parejas inscritas y la configuración del torneo se conservan.',
                    { title: 'Deshacer sorteo', okText: 'Deshacer sorteo', danger: true }
                  );
                  if (!ok) return;
                  const newTConfig = { ...tConfig, bracketPublished: false };
                  setRounds({});
                  setConsRounds({});
                  setTConfig(newTConfig);
                  setPhase('setup');
                  if (publishedId) {
                    try {
                      const config = { ...newTConfig, rounds: {}, consRounds: {}, participants, phase: 'setup' };
                      const { error } = await supabase.from('tournaments')
                        .update({ config })
                        .eq('id', publishedId);
                      if (error) throw error;
                      toast('Sorteo deshecho. Las parejas siguen inscritas y puedes volver a sortear cuando quieras.', 'success');
                    } catch (e) {
                      console.error(e);
                      toast('Error al guardar en la base de datos: ' + (e.message || e), 'error');
                    }
                  } else {
                    toast('Sorteo deshecho.', 'success');
                  }
                }}
                title="Vacía los cuadros principal y de consolación, deja de publicarlo, pero mantiene las parejas y la configuración intactas."
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', backgroundColor: 'white', color: '#B91C1C', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                🗑️ Deshacer Sorteo
              </button>
              <button
                onClick={handlePublishBracket}
                title={tConfig.bracketPublished ? 'Avisar a los jugadores de que el cuadro se ha actualizado' : 'Publicar el cuadro y avisar a los jugadores por correo'}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: tConfig.bracketPublished ? '1.5px solid #BFDBFE' : '1.5px solid #DCFCE7', backgroundColor: tConfig.bracketPublished ? '#EFF6FF' : '#F0FDF4', color: tConfig.bracketPublished ? '#1D4ED8' : '#16A34A', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                {tConfig.bracketPublished ? '🔄 Notificar Actualización' : 'Publicar Cuadro'}
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
           const liguillaExportId = `export-liguilla-${cat.replace(/\s+/g, '_')}`;
           const liguillaTitle = `${tConfig.formatByCategory?.[cat] === 'liguilla_ko' ? 'Liguilla + KO' : 'Liguilla'} · ${cat}`;
           return (
             <div key={cat} id={liguillaExportId} style={{ marginBottom: '4rem', backgroundColor: isExporting === liguillaExportId ? '#FFFFFF' : 'transparent' }}>
               <div style={{ padding: '1rem 1.5rem', backgroundColor: '#1E293B', borderRadius: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                 <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>
                   {isExporting === liguillaExportId
                     ? `${tConfig.name} - ${liguillaTitle}`
                     : `Categoría: ${cat} — ${tConfig.formatByCategory?.[cat] === 'liguilla_ko' ? 'Liguilla + KO' : 'Liguilla'}`}
                 </h2>
                 <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                   {!isExporting && (
                     <button onClick={() => handleDownloadPDF(liguillaExportId, liguillaTitle)} style={{ background: 'none', border: 'none', color: '#93C5FD', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                       Exportar PDF
                     </button>
                   )}
                   {!isExporting && tConfig.formatByCategory?.[cat] === 'liguilla_ko' && (!consRounds[cat] || consRounds[cat].length === 0) && (
                     <button onClick={() => generateLiguillaKO(cat)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#F59E0B', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                       🏆 Generar Eliminatorias Finales
                     </button>
                   )}
                 </div>
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
                           <>
                             <button
                               onClick={() => resolveAllConsPlaceholders(cat)}
                               title="Pasa a la siguiente ronda las parejas que están esperando un rival que no va a llegar"
                               style={{ background: 'none', border: 'none', color: '#0EA5E9', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                             >
                               ⏭️ Pasar parejas en espera
                             </button>
                             <button onClick={() => setConsRounds(prev => ({...prev, [cat]: []}))} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Restaurar Consolación</button>
                           </>
                        )}
                      </div>
                    </div>
                    {isSwapping && (
                      <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '0.5rem', padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400E', fontWeight: 600 }}>
                        🔀 Modo edición: haz clic en dos parejas de la <strong>primera ronda</strong> para intercambiarlas de posición.
                      </div>
                    )}
            
            {/* Principal: izquierda → derecha (R0 → Final).
                Consolación: derecha → izquierda (Final → R0) para distinguir
                visualmente del principal. Conservamos originalIdx para que
                getRoundName y la lógica de swap (rIdx === 0) sigan
                funcionando con el índice real. */}
            {(() => {
              const indexedRounds = bracket.data.map((round, originalIdx) => ({ round, originalIdx }));
              const renderedRounds = bracket.isCons ? [...indexedRounds].reverse() : indexedRounds;
              return (
            <div style={{ display: 'flex', overflowX: 'auto', gap: '2.5rem', paddingBottom: '2rem', minHeight: '350px', alignItems: 'stretch' }}>
              {/* En consolación, trofeo a la IZQUIERDA (al lado de la final
                  que ya está a la izquierda por el reverse). En principal
                  va a la derecha (al final del recorrido visual). */}
              {bracket.isCons && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '180px' }}>
                  <h4 style={{ textAlign: 'center', color: '#D97706', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                    🏆 Campeón Consolación
                  </h4>
                  <div style={{ backgroundColor: '#FFFBEB', border: `2px solid #FDE68A`, borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(217, 119, 6, 0.2)' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#D97706' }}>
                      {bracket.data[bracket.data.length - 1]?.[0]?.winner?.name || 'TBD'}
                    </span>
                  </div>
                </div>
              )}
              {renderedRounds.map(({ round: roundMatches, originalIdx: rIdx }) => (
                <div key={`round-${rIdx}`} style={{ display: 'flex', flexDirection: 'column', minWidth: '220px' }}>
                  <h4 style={{ textAlign: 'center', color: bracket.isCons ? '#D97706' : '#16A34A', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem 0', padding: '0.35rem 0.75rem', backgroundColor: bracket.isCons ? '#FFFBEB' : '#F0FDF4', borderRadius: '0.5rem', border: `1px solid ${bracket.isCons ? '#FDE68A' : '#DCFCE7'}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {getRoundName(rIdx, bracket.data)}
                  </h4>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                  {roundMatches.map(match => {
                    // Saltamos boxes sin partido real: bye-vs-bye o
                    // placeholder + bye (el placeholder se auto-resuelve a
                    // la siguiente ronda — no hay que mostrarlo aquí).
                    // Devolvemos null y dejamos que el flexbox redistribuya
                    // las cajas reales con justify-content: space-around.
                    const isBoth = (a, b) => a?.isBye && b?.isPlaceholder;
                    const isPlaceholderBye = isBoth(match.p1, match.p2) || isBoth(match.p2, match.p1);
                    const isBothBye = match.p1?.isBye && match.p2?.isBye;
                    if (isPlaceholderBye || isBothBye) return null;
                    return (
                    <div key={match.id} style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', margin: '1rem 0' }}>
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

                      {(!match.p1?.isBye && !match.p2?.isBye) && !isExporting && (() => {
                        // El botón "Introducir resultado" solo tiene sentido cuando AMBAS
                        // parejas son reales y conocidas. Si alguna sigue siendo un placeholder
                        // o aún no se ha resuelto la ronda anterior, mostramos un aviso
                        // y deshabilitamos la edición.
                        const ready = match.p1 && match.p2 && !match.p1.isPlaceholder && !match.p2.isPlaceholder;
                        if (!ready) {
                          return (
                            <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid #F1F5F9' }}>
                              <div style={{ width: '100%', textAlign: 'center', color: '#94A3B8', fontSize: '0.7rem', fontWeight: 700, padding: '0.35rem 0.5rem', background: '#F8FAFC', borderRadius: '0.4rem' }}>
                                ⏳ Esperando ganador de la ronda anterior
                              </div>
                            </div>
                          );
                        }
                        return (
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
                              <>
                                <button onClick={() => { setEditingScoreId(match.id); setScoreInput(match.score || ''); }} style={{ width: '100%', background: match.score ? 'transparent' : '#F0FDF4', border: match.score ? 'none' : '1px solid #BBF7D0', borderRadius: '0.4rem', cursor: 'pointer', color: match.score ? '#64748B' : '#15803D', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', padding: '0.35rem 0.5rem' }}>
                                  {match.score ? `✎ ${match.score}` : '+ Introducir resultado (auto-detecta ganador)'}
                                </button>
                                {bracket.isCons && !match.score && match.round + 1 < catCons.length && (
                                  <button
                                    onClick={() => handleAdvanceMatchWhole(match, cat)}
                                    title="Mueve el partido entero a la siguiente ronda sin jugarlo aquí"
                                    style={{ width: '100%', marginTop: '0.3rem', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '0.4rem', cursor: 'pointer', color: '#B45309', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', padding: '0.3rem 0.5rem' }}
                                  >
                                    ↗ Pasar partido completo a siguiente ronda
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    );
                  })}
                  </div>
                </div>
              ))}

              {/* En principal, trofeo a la DERECHA (al final del recorrido). */}
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
          </div>
        );
      })}
            </div>
         );
      })}

      {/* ── Selector de destinatarios para el correo del cuadro ── */}
      {recipientPickerOpen && (() => {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmailsOf = (r) => [r.player1_email, r.player2_email]
          .map(e => (e || '').trim().toLowerCase())
          .filter(e => emailRe.test(e));
        const byCat = recipientPickerData.reduce((acc, r) => {
          const c = r.category || 'Sin categoría';
          (acc[c] = acc[c] || []).push(r);
          return acc;
        }, {});
        const allIds = recipientPickerData.map(r => r.id);
        const selectAll = () => setRecipientPickerSelected(new Set(allIds));
        const selectNone = () => setRecipientPickerSelected(new Set());
        const toggle = (id) => setRecipientPickerSelected(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        });
        const toggleCategory = (cat) => {
          const ids = byCat[cat].map(r => r.id);
          const allOn = ids.every(id => recipientPickerSelected.has(id));
          setRecipientPickerSelected(prev => {
            const next = new Set(prev);
            if (allOn) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
          });
        };
        const selectedCount = recipientPickerSelected.size;
        const emailCount = recipientPickerData
          .filter(r => recipientPickerSelected.has(r.id))
          .reduce((acc, r) => acc + validEmailsOf(r).length, 0);
        const isUpdate = recipientPickerKind === 'updated';
        return (
          <div onClick={() => !recipientPickerSending && setRecipientPickerOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '620px', marginTop: '2rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 4rem)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                    {isUpdate ? '🔄 Notificar cuadro actualizado' : '📧 Avisar parejas del cuadro'}
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                    Marca las parejas que deben recibir el correo. Se mandan en tandas para no saltarse el límite de Resend.
                  </p>
                </div>
                <button onClick={() => !recipientPickerSending && setRecipientPickerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: '#F8FAFC' }}>
                <button onClick={selectAll} style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                  ✓ Marcar todas
                </button>
                <button onClick={selectNone} style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#64748B', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                  ✕ Desmarcar todas
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                  {selectedCount} de {recipientPickerData.length} parejas · {emailCount} correos
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem' }}>
                {Object.entries(byCat).map(([cat, list]) => {
                  const ids = list.map(r => r.id);
                  const allOn = ids.every(id => recipientPickerSelected.has(id));
                  const someOn = !allOn && ids.some(id => recipientPickerSelected.has(id));
                  return (
                    <div key={cat} style={{ marginBottom: '1rem' }}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: 'none', background: '#F1F5F9', cursor: 'pointer', marginBottom: '0.4rem' }}
                      >
                        <span style={{ fontSize: '0.95rem' }}>{allOn ? '☑️' : (someOn ? '◼️' : '⬜')}</span>
                        <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.85rem' }}>{cat}</span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>· {list.length} parejas</span>
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.4rem' }}>
                        {list.map(r => {
                          const checked = recipientPickerSelected.has(r.id);
                          const valid = validEmailsOf(r);
                          return (
                            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: '0.5rem', cursor: 'pointer', background: checked ? '#F0FDF4' : 'transparent', border: `1px solid ${checked ? '#BBF7D0' : '#E2E8F0'}` }}>
                              <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16A34A' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                  {r.player1_name} y {r.player2_name}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.15rem', wordBreak: 'break-all' }}>
                                  {valid.length > 0 ? valid.join(' · ') : <em style={{ color: '#DC2626' }}>sin correo válido</em>}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', background: '#F8FAFC' }}>
                <button
                  type="button"
                  disabled={recipientPickerSending}
                  onClick={() => setRecipientPickerOpen(false)}
                  style={{ padding: '0.65rem 1.2rem', borderRadius: '0.65rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: recipientPickerSending ? 'not-allowed' : 'pointer', opacity: recipientPickerSending ? 0.6 : 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={recipientPickerSending || selectedCount === 0}
                  onClick={sendBracketEmailsToSelected}
                  style={{ padding: '0.65rem 1.4rem', borderRadius: '0.65rem', border: 'none', background: selectedCount === 0 ? '#CBD5E1' : (isUpdate ? '#2563EB' : '#16A34A'), color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: (recipientPickerSending || selectedCount === 0) ? 'not-allowed' : 'pointer', opacity: recipientPickerSending ? 0.7 : 1 }}
                >
                  {recipientPickerSending ? 'Enviando…' : `📧 Enviar a ${selectedCount} pareja${selectedCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
      toast('Error al crear torneo: ' + error.message);
      return;
    }
    setTournaments(prev => [{ id: data.id, name: data.name, date: data.created_at, status: data.status, config: data.config || {} }, ...prev]);
    setActiveIdPersist(data.id);
  };

  const deleteTournament = async (id) => {
    const ok = await confirmDialog(
      '¿Estás seguro de que quieres eliminar este torneo permanentemente?\n\nTambién se borrarán todas las inscripciones asociadas.',
      { title: 'Eliminar torneo', okText: 'Eliminar permanentemente', danger: true }
    );
    if (!ok) return;

    // 1) Borrar inscripciones asociadas primero (por si el FK no tiene ON DELETE CASCADE).
    const { error: regErr } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('tournament_id', id);
    if (regErr) {
      console.warn('Error borrando inscripciones:', regErr);
      toast('Error al borrar inscripciones: ' + regErr.message);
      return;
    }

    // 2) Borrar el torneo.
    const { error, count } = await supabase
      .from('tournaments')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) {
      toast('Error al eliminar: ' + error.message);
      return;
    }
    if (count === 0) {
      // RLS bloqueó el borrado silenciosamente (no eres admin o no está aplicada la migración).
      toast('No se pudo eliminar el torneo. Verifica que estás logeado como admin y que la migración RLS está aplicada en Supabase.', 'error');
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
      toast('No hay torneos locales pendientes de subir en este dispositivo.', 'error');
      return;
    }

    // Coger lo que ya está en DB para detectar duplicados por (nombre + startDate)
    const { data: existing, error: exErr } = await supabase
      .from('tournaments')
      .select('id, name, config');
    if (exErr) {
      toast('Error al consultar torneos existentes: ' + exErr.message);
      return;
    }
    const isDup = (candidate) => (existing || []).some(t =>
      (t.name || '').trim().toLowerCase() === candidate.name.trim().toLowerCase()
      && (t.config?.startDate || null) === (candidate.startDate || null)
    );

    const toUpload = found.filter(f => !isDup(f));
    if (toUpload.length === 0) {
      toast(`Los ${found.length} torneos locales ya están en la base de datos. No se subió nada nuevo.`);
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
      toast('Error al subir torneos: ' + insErr.message + '\n\nSi ves un error de RLS, aplica la migración 20260422_tournaments_admin_write.sql en Supabase.');
      return;
    }

    toast(`✅ ${toUpload.length} torneo${toUpload.length === 1 ? '' : 's'} subido${toUpload.length === 1 ? '' : 's'} a la base de datos. Se verá${toUpload.length === 1 ? '' : 'n'} ahora desde cualquier dispositivo.`);
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

// Banner con la fecha y hora "oficial" del sistema (sincronizada con el
// servidor de Supabase). Se actualiza cada 30s. Si la sync con servidor
// falló, muestra la hora del navegador con un aviso.
const ServerClockBanner = () => {
  const now = useServerTime(30000);
  const synced = isServerTimeSynced();
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.4rem 0.85rem', marginBottom: '0.75rem',
      background: synced ? '#F0FDF4' : '#FFFBEB',
      border: synced ? '1px solid #BBF7D0' : '1px solid #FDE68A',
      borderRadius: '999px',
      fontSize: '0.78rem', fontWeight: 700,
      color: synced ? '#15803D' : '#92400E',
    }} title={synced ? 'Hora sincronizada con el servidor' : 'No se ha podido sincronizar con el servidor; mostrando hora del dispositivo'}>
      <span style={{ fontSize: '0.9rem' }}>🕒</span>
      <span>{formatNowShort(now)}</span>
      {!synced && <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>(reloj local)</span>}
    </div>
  );
};

export default TournamentManager;
