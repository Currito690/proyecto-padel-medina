import { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { toast, confirmDialog } from '../utils/notify';

const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// ── Helpers del informe mensual del monitor ──────────────────────────────────
const MESES_M = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtHorasM = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
const slotIntervalM = (ymd, slotStr) => {
  const [a, b] = slotStr.split(' - ');
  return [new Date(`${ymd}T${a}:00`).getTime(), new Date(`${ymd}T${b}:00`).getTime()];
};
const mergeIntsM = (ints) => {
  const s = [...ints].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
};
const overlapM = (a1, a2, ints) =>
  ints.reduce((s, [b1, b2]) => s + Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)), 0);
const mondayOf = (ymd) => {
  const dt = new Date(ymd + 'T12:00:00');
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

// Vista de SOLO LECTURA para el rol 'monitor' (lolo). Muestra el día separado
// POR PISTAS (2 columnas), con cada franja ocupada coloreada según su tipo:
// reservada (rojo), bloqueada (ámbar) o entreno (azul).

const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatLong(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${d} de ${MONTHS[m - 1]}`;
}

// Mismos colores que el horario del admin: azul = pagada con tarjeta/bizum,
// rojo = pago en club / manual, gris = bloqueada, morado = entreno.
const TIPO = {
  reservaOnline: { label: 'Reservada', emoji: '💳', bg: '#EFF6FF', border: '#93C5FD', color: '#2563EB' },
  reserva: { label: 'Reservada', emoji: '🎾', bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626' },
  bloqueo: { label: 'Bloqueada', emoji: '🔒', bg: '#F1F5F9', border: '#CBD5E1', color: '#64748B' },
  entreno: { label: 'Entreno', emoji: '🏋️', bg: '#FAF5FF', border: '#D8B4FE', color: '#9333EA' },
};

const LEYENDA = [
  { label: 'Tarjeta / Bizum', t: TIPO.reservaOnline },
  { label: 'Club / Manual', t: TIPO.reserva },
  { label: 'Bloqueada', t: TIPO.bloqueo },
  { label: 'Entreno', t: TIPO.entreno },
];

// Cómo se pagó la reserva (mismas etiquetas que en el panel del admin)
const METODO = {
  tarjeta: '💳 Tarjeta',
  bizum: '📱 Bizum',
  club: '🏪 Pago en club',
  gratis: '🎁 Gratis',
  manual: '✍️ Manual',
};

export default function MonitorView() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [courts, setCourts] = useState([]); // [{id,name,slots:[{time,tipo,note}]}]
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [bk, bl, ct] = await Promise.all([
        supabase.from('bookings').select('court_id, time_slot, observaciones, status, user_id, metodo_pago, created_at').eq('date', d),
        supabase.from('blocked_slots').select('court_id, time_slot, tipo, entreno_grupo').eq('date', d),
        supabase.from('courts').select('id, name'),
      ]);

      // Nombres de quienes reservaron (para mostrárselos al monitor).
      const userIds = [...new Set((bk.data || []).map((b) => b.user_id).filter(Boolean))];
      let nameById = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', userIds);
        nameById = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
      }

      const byCourt = {};
      (ct.data || []).forEach((c) => { byCourt[c.id] = { id: c.id, name: c.name, slots: [] }; });
      const ensure = (cid) => byCourt[cid] || (byCourt[cid] = { id: cid, name: 'Pista', slots: [] });
      (bk.data || []).forEach((b) => {
        if (b.status === 'cancelled') return;
        // Holds 'pendiente_pago' solo cuentan 15 min (jugador pagando en el banco)
        if (b.status === 'pendiente_pago' && (Date.now() - new Date(b.created_at).getTime()) > 15 * 60 * 1000) return;
        const who = b.status === 'pendiente_pago' ? '⏳ Pago en curso' : (b.observaciones || nameById[b.user_id] || '');
        ensure(b.court_id).slots.push({ time: b.time_slot, tipo: 'reserva', note: who, metodo: b.metodo_pago });
      });
      (bl.data || []).forEach((s) => {
        const GRUPO = { individual: 'Individual', grupo2: 'Grupo 2', grupo3: 'Grupo 3', grupo4: 'Grupo 4' };
        ensure(s.court_id).slots.push({
          time: s.time_slot,
          tipo: s.tipo === 'entreno' ? 'entreno' : 'bloqueo',
          note: s.tipo === 'entreno' ? (GRUPO[s.entreno_grupo] || '') : '',
          grupo: s.entreno_grupo || null,
        });
      });
      const list = Object.values(byCourt).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
      list.forEach((c) => c.slots.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
      setCourts(list);
    } catch {
      setCourts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // ── Fichaje (control horario del trabajador) ────────────────────────────
  // La HORA la pone el servidor (default now() en BD); aquí solo se captura
  // la ubicación GPS del dispositivo al fichar.
  const [fichajes, setFichajes] = useState([]); // los de HOY
  const [fichando, setFichando] = useState(false);

  const loadFichajes = useCallback(async () => {
    if (!user?.id) return;
    const hoy = toYMD(new Date());
    const { data } = await supabase
      .from('fichajes')
      .select('id, tipo, fichado_at, lat, lng')
      .eq('user_id', user.id)
      .gte('fichado_at', `${hoy}T00:00:00`)
      .order('fichado_at', { ascending: true });
    setFichajes(data || []);
  }, [user?.id]);
  useEffect(() => { loadFichajes(); }, [loadFichajes]);

  const ultimoFichaje = fichajes[fichajes.length - 1];
  const trabajando = ultimoFichaje?.tipo === 'entrada';

  const getPosicion = () => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision_m: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  // El fichaje NO es un simple botón: el trabajador debe FIRMAR. El botón abre
  // el panel de firma y solo al confirmar la firma se registra (con GPS+hora).
  const [firmando, setFirmando] = useState(false); // tipo pendiente: 'entrada'|'salida'|null

  const registrarFichaje = async (firmaDataUrl) => {
    if (fichando) return;
    setFichando(true);
    const tipo = trabajando ? 'salida' : 'entrada';
    const pos = await getPosicion();
    if (!pos) {
      const ok = await confirmDialog(
        'No se pudo obtener tu ubicación (¿permiso denegado?). ¿Fichar igualmente sin ubicación?',
        { title: 'Sin ubicación', okText: 'Fichar igualmente' }
      );
      if (!ok) { setFichando(false); return; }
    }
    const { error } = await supabase.from('fichajes').insert({
      user_id: user.id,
      tipo,
      firma: firmaDataUrl,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      precision_m: pos?.precision_m ?? null,
    });
    if (error) {
      toast('No se pudo fichar: ' + error.message, 'error');
    } else {
      toast(tipo === 'entrada' ? '🟢 Entrada fichada. ¡Buen turno!' : '🔴 Salida fichada. ¡Hasta la próxima!', 'success');
      await loadFichajes();
      setFirmando(false);
    }
    setFichando(false);
  };

  // ── Confirmación de clases: cuántas personas tuvo cada entreno del día ──
  // Lo que confirme lolo manda sobre lo planificado (se guarda en su propia
  // tabla clases_monitor; el horario sigue siendo solo lectura para él).
  const [clasesConf, setClasesConf] = useState({}); // "courtId|time" -> personas
  const [confGuardando, setConfGuardando] = useState(null);

  const loadClasesConf = useCallback(async (d) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('clases_monitor')
      .select('court_id, time_slot, personas')
      .eq('user_id', user.id)
      .eq('date', d);
    const m = {};
    (data || []).forEach(c => { m[`${c.court_id}|${c.time_slot}`] = c.personas; });
    setClasesConf(m);
  }, [user?.id]);
  useEffect(() => { loadClasesConf(date); }, [date, loadClasesConf]);

  const confirmarClase = async (courtId, timeSlot, personas) => {
    const key = `${courtId}|${timeSlot}`;
    setConfGuardando(key);
    const { error } = await supabase.from('clases_monitor').upsert(
      { user_id: user.id, date, time_slot: timeSlot, court_id: courtId, personas, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date,time_slot,court_id' }
    );
    setConfGuardando(null);
    if (error) { toast('No se pudo guardar: ' + error.message, 'error'); return; }
    setClasesConf(prev => ({ ...prev, [key]: personas }));
    toast(`Clase de ${timeSlot} guardada: ${personas} ${personas === 1 ? 'persona' : 'personas'} ✓`, 'success');
  };

  // Entrenos del día visible (para la tarjeta de clases)
  const entrenosDelDia = courts.flatMap(c =>
    c.slots.filter(s => s.tipo === 'entreno').map(s => ({ courtId: c.id, courtName: c.name, time: s.time, grupo: s.grupo }))
  ).sort((a, b) => a.time.localeCompare(b.time));

  const GRUPO_PERSONAS = { individual: 1, grupo2: 2, grupo3: 3, grupo4: 4 };

  // ── Mis tarifas de clase: las fija el PROPIO monitor (tabla monitor_tarifas) ──
  const [misTarifas, setMisTarifas] = useState({ individual: '0', grupo2: '0', grupo3: '0', grupo4: '0' });
  const [tarifasAbiertas, setTarifasAbiertas] = useState(false);
  const [tarifasGuardando, setTarifasGuardando] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('monitor_tarifas').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setMisTarifas({
          individual: String(data.tarifa_individual ?? 0).replace('.', ','),
          grupo2: String(data.tarifa_grupo2 ?? 0).replace('.', ','),
          grupo3: String(data.tarifa_grupo3 ?? 0).replace('.', ','),
          grupo4: String(data.tarifa_grupo4 ?? 0).replace('.', ','),
        });
      });
  }, [user?.id]);

  const guardarMisTarifas = async () => {
    const parse = (v) => { const n = Number(String(v).replace(',', '.').trim()); return isFinite(n) && n >= 0 ? n : null; };
    const vals = {
      individual: parse(misTarifas.individual), grupo2: parse(misTarifas.grupo2),
      grupo3: parse(misTarifas.grupo3), grupo4: parse(misTarifas.grupo4),
    };
    if (Object.values(vals).some(v => v === null)) { toast('Tarifa no válida (ej: 12,50)', 'error'); return; }
    setTarifasGuardando(true);
    const { error } = await supabase.from('monitor_tarifas').upsert({
      user_id: user.id,
      tarifa_individual: vals.individual, tarifa_grupo2: vals.grupo2,
      tarifa_grupo3: vals.grupo3, tarifa_grupo4: vals.grupo4,
      updated_at: new Date().toISOString(),
    });
    setTarifasGuardando(false);
    if (error) toast('Error al guardar: ' + error.message, 'error');
    else toast('Tus tarifas se han guardado ✓', 'success');
  };

  // ── Mi informe del mes (PDF): totales por SEMANA + total del mes, con
  // desglose de horas de clases vs horas de club. Sueldo = hora FIJA × todas
  // las horas. Los precios de las clases van APARTE (sección propia).
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const generarInforme = async () => {
    if (generandoPdf) return;
    setGenerandoPdf(true);
    try {
      const base = new Date(date + 'T12:00:00');
      const yy = base.getFullYear(), mm = base.getMonth();
      const primer = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
      const ultimo = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(new Date(yy, mm + 1, 0).getDate()).padStart(2, '0')}`;
      const [fRes, eRes] = await Promise.all([
        supabase.from('fichajes').select('tipo, fichado_at').eq('user_id', user.id)
          .gte('fichado_at', `${primer}T00:00:00`).lt('fichado_at', new Date(yy, mm + 1, 1).toISOString())
          .order('fichado_at', { ascending: true }),
        supabase.from('blocked_slots').select('date, time_slot').eq('tipo', 'entreno')
          .gte('date', primer).lte('date', ultimo),
      ]);

      // Entrenos por día (unión de intervalos: para separar horas de clase)
      const porDia = {};
      (eRes.data || []).forEach(e => {
        (porDia[e.date] = porDia[e.date] || []).push(slotIntervalM(e.date, e.time_slot));
      });
      for (const d of Object.keys(porDia)) porDia[d] = mergeIntsM(porDia[d]);

      // Jornadas → acumular por semana y total (SOLO HORAS)
      let abierto = null;
      const sem = {}; // lunesYmd -> { ms, msClase, msClub }
      const tot = { ms: 0, msClase: 0, msClub: 0 };
      (fRes.data || []).forEach(f => {
        if (f.tipo === 'entrada') { abierto = f; return; }
        if (!abierto) return;
        const ini = new Date(abierto.fichado_at).getTime();
        const fin = new Date(f.fichado_at).getTime();
        const fecha = toYMD(new Date(abierto.fichado_at));
        abierto = null;
        const ms = fin - ini;
        const msClase = porDia[fecha] ? overlapM(ini, fin, porDia[fecha]) : 0;
        const wk = mondayOf(fecha);
        if (!sem[wk]) sem[wk] = { ms: 0, msClase: 0, msClub: 0 };
        sem[wk].ms += ms; sem[wk].msClase += msClase; sem[wk].msClub += Math.max(0, ms - msClase);
        tot.ms += ms; tot.msClase += msClase; tot.msClub += Math.max(0, ms - msClase);
      });

      if (tot.ms === 0) { toast('No hay jornadas cerradas este mes', 'error'); return; }

      // ── PDF (solo horas, sin dinero) ──
      const doc = new jsPDF();
      const NAVY = [27, 58, 110], GREEN = [22, 163, 74], INK = [15, 23, 42], MUTED = [100, 116, 139];

      // Cabecera de marca
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, 210, 34, 'F');
      doc.setFillColor(...GREEN);
      doc.rect(0, 34, 210, 1.6, 'F');
      doc.setTextColor(255);
      doc.setFontSize(9); doc.setFont(undefined, 'bold');
      doc.text('PADEL MEDINA · CONTROL HORARIO', 14, 13);
      doc.setFontSize(19);
      doc.text(`Informe de horas — ${MESES_M[mm]} ${yy}`, 14, 24);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9.5); doc.setTextColor(200, 215, 235);
      doc.text(`${user?.name || 'Monitor'}`, 14, 30);

      // Cajas de resumen (3): total, clases, club
      const cajas = [
        { titulo: 'TOTAL DEL MES', valor: fmtHorasM(tot.ms), fill: [240, 253, 244], borde: [187, 247, 208], color: [22, 101, 52] },
        { titulo: 'HORAS COMO MONITOR', valor: fmtHorasM(tot.msClase), fill: [250, 245, 255], borde: [216, 180, 254], color: [126, 34, 206] },
        { titulo: 'HORAS EN EL CLUB', valor: fmtHorasM(tot.msClub), fill: [248, 250, 252], borde: [226, 232, 240], color: [51, 65, 85] },
      ];
      let cx = 14;
      cajas.forEach(c => {
        doc.setFillColor(...c.fill);
        doc.setDrawColor(...c.borde);
        doc.roundedRect(cx, 42, 58, 22, 2.5, 2.5, 'FD');
        doc.setFontSize(6.8); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
        doc.text(c.titulo, cx + 4, 49);
        doc.setFontSize(15); doc.setTextColor(...c.color);
        doc.text(c.valor, cx + 4, 59);
        cx += 61;
      });

      // Tabla por semanas
      let py = 78;
      doc.setFillColor(...NAVY);
      doc.roundedRect(14, py - 5.5, 182, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
      doc.text('SEMANA', 18, py);
      doc.text('HORAS TOTALES', 106, py, { align: 'right' });
      doc.text('CLASES', 146, py, { align: 'right' });
      doc.text('CLUB', 188, py, { align: 'right' });
      py += 9;
      const semanas = Object.keys(sem).sort();
      semanas.forEach((wk, i) => {
        const finSem = new Date(wk + 'T12:00:00'); finSem.setDate(finSem.getDate() + 6);
        const finYmd = `${finSem.getFullYear()}-${String(finSem.getMonth() + 1).padStart(2, '0')}-${String(finSem.getDate()).padStart(2, '0')}`;
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, py - 5, 182, 7.5, 'F');
        }
        doc.setFont(undefined, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        doc.text(`Semana del ${ddmm(wk)} al ${ddmm(finYmd)}`, 18, py);
        doc.text(fmtHorasM(sem[wk].ms), 106, py, { align: 'right' });
        doc.setFont(undefined, 'normal'); doc.setTextColor(126, 34, 206);
        doc.text(fmtHorasM(sem[wk].msClase), 146, py, { align: 'right' });
        doc.setTextColor(...MUTED);
        doc.text(fmtHorasM(sem[wk].msClub), 188, py, { align: 'right' });
        py += 7.5;
      });
      // Fila TOTAL
      doc.setFillColor(220, 252, 231);
      doc.roundedRect(14, py - 5, 182, 8.5, 1.5, 1.5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.setTextColor(22, 101, 52);
      doc.text('TOTAL DEL MES', 18, py + 0.5);
      doc.text(fmtHorasM(tot.ms), 106, py + 0.5, { align: 'right' });
      doc.text(fmtHorasM(tot.msClase), 146, py + 0.5, { align: 'right' });
      doc.text(fmtHorasM(tot.msClub), 188, py + 0.5, { align: 'right' });

      // Pie
      doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
      doc.text('Horas según fichajes firmados, con hora de servidor y ubicación GPS.', 14, 285);
      doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
      doc.save(`mis-horas-${MESES_M[mm].toLowerCase()}-${yy}.pdf`);
      toast('Informe descargado 📄', 'success');
    } catch (e) {
      console.error(e);
      toast('No se pudo generar el informe', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  };

  // ¿Está AHORA dentro de una clase? (para que se vea que el fichaje cae en clase)
  const enClaseAhora = (() => {
    if (!trabajando || date !== toYMD(new Date())) return false;
    const ahora = new Date();
    const hm = ahora.getHours() * 60 + ahora.getMinutes();
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return entrenosDelDia.some(e => {
      const [a, b] = e.time.split(' - ');
      return hm >= toM(a) && hm < toM(b);
    });
  })();

  // Cambio de día a MEDIANOCHE: si lolo estaba mirando "hoy", saltar al día nuevo.
  useEffect(() => {
    let prevToday = toYMD(new Date());
    const id = setInterval(() => {
      const t = toYMD(new Date());
      if (t !== prevToday) {
        const old = prevToday;
        prevToday = t;
        setDate(d => (d === old ? t : d));
      }
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const shiftDay = (delta) => {
    const [y, m, d] = date.split('-').map(Number);
    setDate(toYMD(new Date(y, m - 1, d + delta)));
  };

  const isToday = date === toYMD(new Date());
  const totalOcupadas = courts.reduce((n, c) => n + c.slots.length, 0);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#EEF2F7 0%,#F8FAFC 240px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .agenda-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
        @media (min-width: 760px) { .agenda-grid { grid-template-columns: repeat(3, 1fr); } }
        .court-card { background:#fff; border:1px solid #E8EDF3; border-radius:1rem; padding:0.75rem 0.7rem 0.8rem; box-shadow:0 1px 3px rgba(15,23,42,0.05); }
        .slot { border-radius:0.6rem; padding:0.45rem 0.55rem; margin-top:0.4rem; }
        .slot-time { font-weight:800; font-size:0.82rem; color:#0F172A; letter-spacing:-0.01em; line-height:1.15; }
        .slot-tag { font-size:0.68rem; font-weight:800; margin-top:2px; display:inline-flex; align-items:center; gap:3px; }
        .nav-arrow { width:38px; height:38px; border-radius:0.7rem; border:1px solid #E2E8F0; background:#fff; color:#1B3A6E; font-size:1.3rem; font-weight:800; cursor:pointer; line-height:1; flex-shrink:0; }
        .nav-arrow:active { background:#F1F5F9; }
      `}</style>

      {/* Cabecera */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E8EDF3', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/logo.png" alt="Padel Medina" style={{ height: 30 }} />
          <span style={{ fontWeight: 800, color: '#1B3A6E', fontSize: '1.02rem' }}>Agenda</span>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
          Salir
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '1rem 0.9rem 2.5rem', boxSizing: 'border-box' }}>
        <p style={{ margin: '0 0 0.85rem', color: '#64748B', fontSize: '0.85rem' }}>
          Hola <strong style={{ color: '#0F172A' }}>{user?.name || 'monitor'}</strong>, pistas ocupadas del día por reservas, bloqueos y entrenos.
        </p>

        {/* ── Fichaje / control horario ── */}
        <div style={{ background: 'white', border: `1.5px solid ${trabajando ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: '0.95rem', padding: '0.9rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Control horario</div>
              <div style={{ fontSize: '0.78rem', color: trabajando ? '#15803D' : '#64748B', fontWeight: 700, marginTop: 2 }}>
                {trabajando ? `Trabajando desde las ${horaDe(ultimoFichaje.fichado_at)}` : 'Turno sin iniciar'}
                {enClaseAhora && <span style={{ color: '#7E22CE' }}> · 🎾 ahora en clase</span>}
              </div>
            </div>
            <button onClick={() => setFirmando(true)} disabled={fichando} style={{
              padding: '0.7rem 1.2rem', borderRadius: '0.7rem', border: 'none', cursor: fichando ? 'wait' : 'pointer',
              background: trabajando ? '#DC2626' : '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.88rem',
              fontFamily: 'inherit', opacity: fichando ? 0.7 : 1, boxShadow: trabajando ? '0 4px 14px rgba(220,38,38,0.3)' : '0 4px 14px rgba(22,163,74,0.3)',
            }}>
              {trabajando ? '🔴 Firmar salida' : '🟢 Firmar entrada'}
            </button>
          </div>
          {fichajes.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
              {fichajes.map(f => (
                <span key={f.id} style={{ fontSize: '0.7rem', fontWeight: 800, color: f.tipo === 'entrada' ? '#15803D' : '#B91C1C', background: f.tipo === 'entrada' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${f.tipo === 'entrada' ? '#BBF7D0' : '#FECACA'}`, borderRadius: 999, padding: '0.22rem 0.6rem' }}>
                  {f.tipo === 'entrada' ? '🟢 Entrada' : '🔴 Salida'} {horaDe(f.fichado_at)}{f.lat != null ? ' · 📍' : ''}
                </span>
              ))}
            </div>
          )}
          <button onClick={generarInforme} disabled={generandoPdf} style={{ marginTop: '0.7rem', width: '100%', padding: '0.6rem', borderRadius: '0.65rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', opacity: generandoPdf ? 0.6 : 1 }}>
            {generandoPdf ? 'Generando…' : '📄 Mi informe del mes (horas por semana y clases)'}
          </button>
        </div>

        {/* ── Mis tarifas de clase (las pone el propio monitor; van aparte del sueldo) ── */}
        <div style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.95rem', padding: '0.75rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <button onClick={() => setTarifasAbiertas(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>💶 Mis precios de clase</span>
            <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 700 }}>{tarifasAbiertas ? '▲ cerrar' : '▼ editar'}</span>
          </button>
          {tarifasAbiertas && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {[['individual', '🎾 Individual'], ['grupo2', '👥 Grupo 2'], ['grupo3', '👥 Grupo 3'], ['grupo4', '👥 Grupo 4']].map(([k, label]) => (
                  <label key={k} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>
                    {label}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <input value={misTarifas[k]} onChange={e => setMisTarifas(prev => ({ ...prev, [k]: e.target.value }))} inputMode="decimal"
                        style={{ width: 70, padding: '0.5rem 0.6rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 700 }} />
                      <span style={{ color: '#64748B', fontWeight: 700, fontSize: '0.75rem' }}>€/h</span>
                    </div>
                  </label>
                ))}
                <button onClick={guardarMisTarifas} disabled={tarifasGuardando}
                  style={{ padding: '0.55rem 1rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', opacity: tarifasGuardando ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {tarifasGuardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: '#94A3B8' }}>
                Estos precios son de tus clases y van <strong>aparte de tu sueldo</strong> (tu hora de trabajo se paga siempre igual).
              </p>
            </div>
          )}
        </div>

        {/* ── Clases del día: lolo confirma cuántas personas tuvo cada entreno ── */}
        {entrenosDelDia.length > 0 && (
          <div style={{ background: 'white', border: '1.5px solid #D8B4FE', borderRadius: '0.95rem', padding: '0.9rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
            <div style={{ fontWeight: 800, color: '#7E22CE', fontSize: '0.9rem' }}>🎾 Clases del día</div>
            <p style={{ margin: '0.2rem 0 0.7rem', fontSize: '0.74rem', color: '#64748B' }}>
              Al terminar, marca cuántas personas ha tenido cada clase (así se calcula bien tu hora).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {entrenosDelDia.map(e => {
                const key = `${e.courtId}|${e.time}`;
                const confirmado = clasesConf[key];               // lo que marcó lolo
                const planificado = GRUPO_PERSONAS[e.grupo] || null; // lo que puso el admin
                const activo = confirmado ?? null;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', border: '1px solid #F1F5F9', borderRadius: '0.7rem', padding: '0.55rem 0.7rem', background: confirmado ? '#FAF5FF' : '#FFFFFF' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.82rem' }}>{e.time} · {e.courtName}</div>
                      <div style={{ fontSize: '0.68rem', color: confirmado ? '#7E22CE' : '#94A3B8', fontWeight: 700 }}>
                        {confirmado
                          ? `✓ Confirmada: ${confirmado} ${confirmado === 1 ? 'persona' : 'personas'}`
                          : planificado ? `Prevista: ${planificado} pers. — confirma al terminar` : 'Sin confirmar'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {[1, 2, 3, 4].map(n => (
                        <button key={n} disabled={confGuardando === key}
                          onClick={() => confirmarClase(e.courtId, e.time, n)}
                          style={{
                            width: 38, height: 38, borderRadius: '0.6rem', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit',
                            border: `1.5px solid ${activo === n ? '#9333EA' : '#E2E8F0'}`,
                            background: activo === n ? '#9333EA' : 'white',
                            color: activo === n ? 'white' : '#475569',
                            opacity: confGuardando === key ? 0.6 : 1,
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selector de día */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#fff', border: '1px solid #E8EDF3', borderRadius: '0.95rem', padding: '0.55rem 0.7rem', marginBottom: '0.8rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <button onClick={() => shiftDay(-1)} aria-label="Día anterior" className="nav-arrow">‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.98rem', textTransform: 'capitalize' }}>
              {formatLong(date)} {isToday && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#15803D', background: '#DCFCE7', padding: '0.1rem 0.4rem', borderRadius: 999, verticalAlign: 'middle', marginLeft: 4 }}>HOY</span>}
            </div>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ border: 'none', background: 'transparent', color: '#94A3B8', fontSize: '0.72rem', fontFamily: 'inherit', textAlign: 'center', marginTop: 2 }} />
          </div>
          <button onClick={() => shiftDay(1)} aria-label="Día siguiente" className="nav-arrow">›</button>
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {LEYENDA.map(({ label, t }) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: '0.28rem 0.6rem', borderRadius: 999 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color, display: 'inline-block' }} /> {label}
            </span>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem 0' }}>Cargando…</p>
        ) : totalOcupadas === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B', background: '#fff', border: '1px dashed #CBD5E1', borderRadius: '1rem', padding: '2.5rem 1rem' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '0.4rem' }}>✅</div>
            <p style={{ margin: 0, fontWeight: 800, color: '#0F172A' }}>Todas las pistas libres</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>No hay reservas ni bloqueos este día.</p>
          </div>
        ) : (
          <div className="agenda-grid">
            {courts.map((c) => (
              <div key={c.id} className="court-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                  <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>{c.name}</span>
                  {c.slots.length > 0 && (
                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', background: '#F1F5F9', borderRadius: 999, padding: '0.1rem 0.45rem' }}>{c.slots.length}</span>
                  )}
                </div>

                {c.slots.length === 0 ? (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.6rem', padding: '0.5rem 0.55rem' }}>
                    🟢 Libre
                  </div>
                ) : (
                  c.slots.map((s, i) => {
                    const m = (s.tipo === 'reserva' && (s.metodo === 'tarjeta' || s.metodo === 'bizum'))
                      ? TIPO.reservaOnline
                      : (TIPO[s.tipo] || TIPO.bloqueo);
                    return (
                      <div key={i} className="slot" style={{ background: m.bg, border: `1px solid ${m.border}`, borderLeft: `3px solid ${m.color}` }}>
                        <div className="slot-time">{s.time}</div>
                        <div className="slot-tag" style={{ color: m.color }}>{m.emoji} {m.label}</div>
                        {s.note && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2, fontWeight: 600 }}>{s.tipo === 'reserva' ? '👤 ' : ''}{s.note}</div>}
                        {s.tipo === 'reserva' && METODO[s.metodo] && (
                          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2, fontWeight: 700 }}>{METODO[s.metodo]}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {firmando && (
        <SignaturePad
          tipo={trabajando ? 'salida' : 'entrada'}
          saving={fichando}
          onCancel={() => setFirmando(false)}
          onConfirm={registrarFichaje}
        />
      )}
    </div>
  );
}

// ── Panel de firma: el trabajador dibuja su firma con el dedo/ratón ──────────
function SignaturePad({ tipo, saving, onCancel, onConfirm }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ajustar resolución al tamaño real (nitidez en móvil)
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';
  }, []);

  const posFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = posFromEvent(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = posFromEvent(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const confirm = () => {
    if (!hasInk) { toast('Dibuja tu firma antes de continuar', 'error'); return; }
    // Fondo blanco (el canvas es transparente) para que la firma se vea en el email/panel
    const canvas = canvasRef.current;
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    onConfirm(out.toDataURL('image/png'));
  };

  const esEntrada = tipo === 'entrada';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: 440, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.1rem', fontWeight: 800, color: esEntrada ? '#15803D' : '#B91C1C' }}>
          {esEntrada ? '🟢 Firmar ENTRADA' : '🔴 Firmar SALIDA'}
        </h3>
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: '#64748B' }}>
          Firma en el recuadro para confirmar tu {esEntrada ? 'entrada' : 'salida'}. Se registrará con la hora y tu ubicación.
        </p>
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{ width: '100%', height: 190, border: '2px dashed #CBD5E1', borderRadius: '0.75rem', background: '#F8FAFC', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <button onClick={clear} disabled={saving} style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', padding: '0.4rem' }}>↺ Borrar</button>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Firma con el dedo o el ratón</span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '0.8rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ flex: 2, padding: '0.8rem', borderRadius: '0.7rem', border: 'none', background: esEntrada ? '#16A34A' : '#DC2626', color: 'white', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Fichando…' : 'Confirmar fichaje'}
          </button>
        </div>
      </div>
    </div>
  );
}
