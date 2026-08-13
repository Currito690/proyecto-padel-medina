import { useState, useEffect, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { MONITOR_EMAILS } from '../../utils/staff';
import { toast, confirmDialog } from '../../utils/notify';

// CONTROL HORARIO (admin): toda la información del control de horas del
// personal a partir de sus fichajes (hora del SERVIDOR + GPS + firma).
// MODELO: el trabajador tiene SUELDO FIJO (fuera de la app) → aquí NO se
// calcula sueldo. Lo que ve el admin son las HORAS trabajadas (con desglose
// en club / en clases) y cada jornada con su entrada, salida, firma y
// ubicación. El dinero de las clases vive en la sección ENTRENOS.

const pad = (n) => String(n).padStart(2, '0');
const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fechaLarga = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const ymdDe = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtHoras = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${pad(m)}m`;
};
const horasDec = (ms) => (ms / 3600000).toFixed(2).replace('.', ',');
const mapsUrl = (f) => (f && f.lat != null ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : null);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Tipos de clase (para el desglose de horas por grupo)
const GRUPOS = [
  { key: 'individual', label: '🎾 Individual' },
  { key: 'grupo2', label: '👥 Grupo 2' },
  { key: 'grupo3', label: '👥 Grupo 3' },
  { key: 'grupo4', label: '👥 Grupo 4' },
];

// Intervalo [ini, fin] en ms de un hueco "09:00 - 10:30" de un día
const slotInterval = (ymd, slotStr) => {
  const [a, b] = slotStr.split(' - ');
  return [new Date(`${ymd}T${a}:00`).getTime(), new Date(`${ymd}T${b}:00`).getTime()];
};
// Unir intervalos solapados (dos pistas con entreno a la vez cuentan una sola vez)
const mergeIntervals = (ints) => {
  const s = [...ints].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
};
const overlapMs = (a1, a2, ints) =>
  ints.reduce((s, [b1, b2]) => s + Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)), 0);

export default function TimeClockManager() {
  const { user: adminUser } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [fichajes, setFichajes] = useState([]);
  const [entrenos, setEntrenos] = useState([]); // blocked_slots tipo=entreno del mes
  const [confirmadas, setConfirmadas] = useState([]); // clases_monitor (grupo REAL de cada clase)
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(null); // firma ampliada
  const [conManual, setConManual] = useState(true); // false = falta la migración fichajes_manual_admin

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const load = useCallback(async () => {
    setLoading(true);
    const primerYmd = `${year}-${pad(month + 1)}-01`;
    const ultimoYmd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
    // Mes en hora LOCAL por los dos lados: con "T00:00:00" a secas Postgres
    // lo lee en UTC y las 00:00-02:00 del día 1 no caerían en ningún mes
    const consultaFichajes = (cols) => supabase
      .from('fichajes')
      .select(cols)
      .gte('fichado_at', new Date(year, month, 1).toISOString())
      .lt('fichado_at', new Date(year, month + 1, 1).toISOString())
      .order('fichado_at', { ascending: true });
    let [fRes, { data: eData }, { data: cData }] = await Promise.all([
      consultaFichajes('id, user_id, tipo, fichado_at, lat, lng, precision_m, firma, manual, nota'),
      supabase
        .from('blocked_slots')
        .select('date, time_slot, court_id, tipo, entreno_grupo')
        .eq('tipo', 'entreno')
        .gte('date', primerYmd)
        .lte('date', ultimoYmd),
      supabase
        .from('clases_monitor')
        .select('*')
        .gte('date', primerYmd)
        .lte('date', ultimoYmd),
    ]);
    // BD sin migrar (sin columnas de turno manual): cargar sin ellas. SOLO si
    // el error es por las columnas: reintentar sin ellas ante un fallo de red
    // mezclaría los turnos manuales con los fichajes reales al emparejar.
    if (fRes.error) {
      if (/manual|nota/i.test(fRes.error.message || '')) {
        setConManual(false);
        fRes = await consultaFichajes('id, user_id, tipo, fichado_at, lat, lng, precision_m, firma');
      }
    } else {
      setConManual(true);
    }
    const rows = fRes.data || [];
    setFichajes(rows);
    setEntrenos(eData || []);
    setConfirmadas(cData || []);
    const uids = [...new Set(rows.map(f => f.user_id))];
    if (uids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
      setNames(Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])));
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // ── Turno manual: el admin apunta la jornada cuando al trabajador se le
  // olvidó fichar. Se insertan los dos fichajes (entrada y salida) marcados
  // como manual = true (sin firma ni GPS) y con nota opcional.
  const hoyYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [trabajadores, setTrabajadores] = useState([]); // perfiles con rol monitor
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState({ userId: '', fecha: hoyYmd, entrada: '09:00', salida: '13:00', nota: '' });
  const [guardandoTurno, setGuardandoTurno] = useState(false);

  useEffect(() => {
    (async () => {
      const filtro = ['role.eq.monitor', ...MONITOR_EMAILS.map(e => `email.eq.${e}`)].join(',');
      const { data } = await supabase.from('profiles').select('id, name, email').or(filtro);
      setTrabajadores(data || []);
    })();
  }, []);

  const guardarTurno = async () => {
    if (guardandoTurno) return;
    const userId = form.userId || trabajadores[0]?.id;
    if (!userId) { toast('No se encontró al trabajador (perfil con rol monitor)', 'error'); return; }
    if (!adminUser?.id) { toast('Sesión de administrador no disponible, vuelve a entrar', 'error'); return; }
    if (!form.fecha || !form.entrada || !form.salida) { toast('Rellena el día y las horas de entrada y salida', 'error'); return; }
    // Horas en LOCAL → Date las convierte bien a UTC al guardar (toISOString)
    const ini = new Date(`${form.fecha}T${form.entrada}:00`);
    const fin = new Date(`${form.fecha}T${form.salida}:00`);
    if (!(fin > ini)) { toast('La salida debe ser posterior a la entrada (mismo día)', 'error'); return; }
    // También la SALIDA: sin esto se podrían apuntar horas aún sin trabajar
    if (fin > new Date()) { toast('El turno no puede terminar en el futuro', 'error'); return; }
    setGuardandoTurno(true);
    try {
      // Fichajes ya existentes del trabajador ese día: un turno manual que se
      // solape con otro MANUAL es un duplicado (se bloquea); si hay fichajes
      // REALES ese día se avisa, porque el turno manual SUMA horas aparte.
      // Medianoche a medianoche por PARTES de fecha (con +24h a secas, el día
      // del cambio de hora dura 23 o 25 horas y el corte caería mal).
      const [fy, fm, fd] = form.fecha.split('-').map(Number);
      const diaIni = new Date(fy, fm - 1, fd);
      const diaFin = new Date(fy, fm - 1, fd + 1);
      const { data: delDia, error: errDia } = await supabase
        .from('fichajes')
        .select('tipo, fichado_at, manual')
        .eq('user_id', userId)
        .gte('fichado_at', diaIni.toISOString())
        .lt('fichado_at', diaFin.toISOString())
        .order('fichado_at', { ascending: true });
      // Sin la comprobación no se garantiza que no haya duplicados: mejor no
      // guardar (salvo que el error sea por falta de migración: entonces el
      // propio insert dará su aviso correcto).
      if (errDia && !/manual/i.test(errDia.message || '')) {
        toast('No se pudieron comprobar los fichajes de ese día, inténtalo de nuevo', 'error');
        return;
      }
      if (!errDia && delDia?.length) {
        const manuales = delDia.filter(f => f.manual);
        let abierta = null;
        for (const f of manuales) {
          if (f.tipo === 'entrada') { abierta = new Date(f.fichado_at); continue; }
          if (!abierta) continue;
          const cierre = new Date(f.fichado_at);
          if (ini < cierre && abierta < fin) {
            toast(`Ese día ya hay un turno manual de ${hora(abierta.toISOString())} a ${hora(cierre.toISOString())} que se solapa. Bórralo primero si quieres cambiarlo.`, 'error');
            return;
          }
          abierta = null;
        }
        const reales = delDia.filter(f => !f.manual);
        if (reales.length) {
          const listado = reales.map(f => `${f.tipo === 'entrada' ? '🟢' : '🔴'} ${hora(f.fichado_at)}`).join(' · ');
          const ok = await confirmDialog(
            `Ese día el trabajador ya fichó: ${listado}. El turno manual se sumará APARTE de esas horas. ¿Añadirlo igualmente?`,
            { title: 'Ya hay fichajes ese día', okText: 'Añadir igualmente' }
          );
          if (!ok) return;
        }
      }
      const comun = { user_id: userId, manual: true, creado_por: adminUser.id, nota: form.nota.trim() || null };
      const { error } = await supabase.from('fichajes').insert([
        { ...comun, tipo: 'entrada', fichado_at: ini.toISOString() },
        { ...comun, tipo: 'salida', fichado_at: fin.toISOString() },
      ]);
      if (error) {
        if (/manual|creado_por|nota/i.test(error.message || '')) {
          toast('Falta aplicar la migración fichajes_manual_admin en Supabase para poder añadir turnos', 'error');
        } else {
          toast('No se pudo guardar el turno: ' + error.message, 'error');
        }
        return;
      }
      toast('Turno añadido ✓', 'success');
      setFormAbierto(false);
      setForm(f => ({ ...f, nota: '' }));
      // Si el turno es de otro mes, saltar a él (el cambio de mes ya recarga)
      const [y, m] = form.fecha.split('-').map(Number);
      if (y !== year || m - 1 !== month) { setYear(y); setMonth(m - 1); }
      else load();
    } finally {
      setGuardandoTurno(false);
    }
  };

  const borrarTurnoManual = async (j) => {
    const ids = [j.entrada, j.salida].filter(f => f?.manual).map(f => f.id);
    if (!ids.length) return;
    const ok = await confirmDialog(
      'Se borrará este turno añadido a mano y sus horas dejarán de contar. Los fichajes firmados por el trabajador no se tocan.',
      { title: 'Borrar turno manual', okText: 'Borrar turno' }
    );
    if (!ok) return;
    // .select() devuelve lo borrado: sin él, RLS puede filtrar las filas en
    // silencio (0 borradas) y aquí saldría un "Turno borrado" falso.
    const { data: borrados, error } = await supabase.from('fichajes').delete().in('id', ids).select('id');
    if (error) toast('No se pudo borrar: ' + error.message, 'error');
    else if (!borrados?.length) toast('No se borró nada: tu usuario no consta como admin en la base de datos (profiles.role)', 'error');
    else { toast('Turno borrado', 'success'); load(); }
  };

  // Entrenos del mes agrupados por día: intervalos por grupo + unión total.
  // El grupo REAL: lo confirmado por el monitor manda; sin datos → planificado.
  const entrenosPorDia = useMemo(() => {
    const PERSONAS_GRUPO = { 1: 'individual', 2: 'grupo2', 3: 'grupo3', 4: 'grupo4' };
    const conf = {};
    for (const c of confirmadas) conf[`${c.date}|${c.time_slot}|${c.court_id}`] = c.personas;
    const m = {}; // ymd -> { grupos: {key: [[a,b],...]}, all: [[a,b],...] }
    for (const e of entrenos) {
      const personas = conf[`${e.date}|${e.time_slot}|${e.court_id}`];
      const g = PERSONAS_GRUPO[personas] || e.entreno_grupo || 'grupo4';
      if (!m[e.date]) m[e.date] = { grupos: {}, all: [] };
      const iv = slotInterval(e.date, e.time_slot);
      if (!m[e.date].grupos[g]) m[e.date].grupos[g] = [];
      m[e.date].grupos[g].push(iv);
      m[e.date].all.push(iv);
    }
    for (const d of Object.keys(m)) {
      for (const g of Object.keys(m[d].grupos)) m[d].grupos[g] = mergeIntervals(m[d].grupos[g]);
      m[d].all = mergeIntervals(m[d].all);
    }
    return m;
  }, [entrenos, confirmadas]);

  // Emparejar entrada→salida en jornadas + desglose de horas clase/club.
  // Los turnos MANUALES se emparejan APARTE de los fichajes firmados: aunque
  // un turno añadido a mano se solape en horas con fichajes reales, nunca les
  // "roba" la salida ni los deja descolocados.
  const { jornadas, totalesPorUser } = useMemo(() => {
    const emparejar = (rows) => {
      const jor = [];
      const abiertos = {};
      for (const f of rows) {
        if (f.tipo === 'entrada') {
          if (abiertos[f.user_id]) jor.push({ userId: f.user_id, fecha: ymdDe(abiertos[f.user_id].fichado_at), entrada: abiertos[f.user_id], salida: null, ms: 0, abierta: true });
          abiertos[f.user_id] = f;
        } else if (abiertos[f.user_id]) {
          const ent = abiertos[f.user_id];
          delete abiertos[f.user_id];
          const ini = new Date(ent.fichado_at).getTime();
          const fin = new Date(f.fichado_at).getTime();
          const fecha = ymdDe(ent.fichado_at);
          const dia = entrenosPorDia[fecha];
          const msPorGrupo = {};
          let msClase = 0;
          if (dia) {
            for (const g of GRUPOS) msPorGrupo[g.key] = overlapMs(ini, fin, dia.grupos[g.key] || []);
            msClase = overlapMs(ini, fin, dia.all);
          }
          const ms = fin - ini;
          jor.push({ userId: f.user_id, fecha, entrada: ent, salida: f, ms, msPorGrupo, msClase, msClub: Math.max(0, ms - msClase) });
        } else {
          jor.push({ userId: f.user_id, fecha: ymdDe(f.fichado_at), entrada: null, salida: f, ms: 0 });
        }
      }
      for (const ent of Object.values(abiertos)) {
        jor.push({ userId: ent.user_id, fecha: ymdDe(ent.fichado_at), entrada: ent, salida: null, ms: 0, abierta: true });
      }
      return jor;
    };
    const jor = [
      ...emparejar(fichajes.filter(f => !f.manual)),
      ...emparejar(fichajes.filter(f => f.manual)),
    ];
    jor.sort((a, b) => new Date((b.entrada || b.salida).fichado_at) - new Date((a.entrada || a.salida).fichado_at));

    const tot = {};
    for (const j of jor) {
      if (!tot[j.userId]) tot[j.userId] = { ms: 0, msClub: 0, msClase: 0, porGrupo: { individual: 0, grupo2: 0, grupo3: 0, grupo4: 0 } };
      tot[j.userId].ms += j.ms || 0;
      tot[j.userId].msClub += j.msClub || 0;
      tot[j.userId].msClase += j.msClase || 0;
      for (const g of GRUPOS) tot[j.userId].porGrupo[g.key] += j.msPorGrupo?.[g.key] || 0;
    }
    return { jornadas: jor, totalesPorUser: tot };
  }, [fichajes, entrenosPorDia]);

  // ── Exportar Excel (CSV con ; — abre directo en Excel español) ──
  const exportCsv = () => {
    const nombreMes = `${MESES[month].toLowerCase()}-${year}`;
    const header = 'Trabajador;Fecha;Entrada;Salida;Horas totales;Horas club;Horas clases;Origen';
    const filas = [...jornadas].reverse().filter(j => j.entrada && j.salida).map(j =>
      [names[j.userId] || 'Trabajador', j.fecha, hora(j.entrada.fichado_at), hora(j.salida.fichado_at),
        horasDec(j.ms), horasDec(j.msClub), horasDec(j.msClase),
        (j.entrada.manual || j.salida.manual) ? 'Añadido por admin' : 'Fichado en la app'].join(';'));
    const totales = Object.entries(totalesPorUser).map(([uid, t]) =>
      `TOTAL ${names[uid] || ''};;;;${horasDec(t.ms)};${horasDec(t.msClub)};${horasDec(t.msClase)}`);
    const csv = '﻿' + [header, ...filas, '', ...totales].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `control-horario-${nombreMes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Exportar PDF ──
  const exportPdf = () => {
    const doc = new jsPDF();
    const NAVY = [27, 58, 110], GREEN = [22, 163, 74], INK = [15, 23, 42], MUTED = [100, 116, 139];

    // Cabecera de marca
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, 210, 34, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, 34, 210, 1.6, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('PADEL MEDINA · ADMINISTRACIÓN', 14, 13);
    doc.setFontSize(19);
    doc.text(`Control horario — ${MESES[month]} ${year}`, 14, 24);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(200, 215, 235);
    doc.text('Horas del personal según sus fichajes (el sueldo del trabajador es fijo)', 14, 30);

    // Tabla de jornadas (solo horas)
    let y = 46;
    const thead = () => {
      doc.setFillColor(...NAVY);
      doc.roundedRect(12, y - 5.5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('FECHA', 15, y);
      doc.text('ENTRADA', 72, y, { align: 'right' });
      doc.text('SALIDA', 100, y, { align: 'right' });
      doc.text('H. CLUB', 130, y, { align: 'right' });
      doc.text('H. CLASES', 162, y, { align: 'right' });
      doc.text('TOTAL', 194, y, { align: 'right' });
      y += 9;
    };
    thead();

    const cerradas = [...jornadas].reverse().filter(j => j.entrada && j.salida);
    const hayManuales = cerradas.some(j => j.entrada.manual || j.salida.manual);
    cerradas.forEach((j, i) => {
      if (y > 268) { doc.addPage(); y = 20; thead(); }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(12, y - 4.6, 186, 6.8, 'F');
      }
      doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...INK);
      doc.text(j.fecha + ((j.entrada.manual || j.salida.manual) ? ' *' : ''), 15, y);
      doc.text(hora(j.entrada.fichado_at), 72, y, { align: 'right' });
      doc.text(hora(j.salida.fichado_at), 100, y, { align: 'right' });
      doc.setTextColor(...MUTED);
      doc.text(fmtHoras(j.msClub), 130, y, { align: 'right' });
      doc.setTextColor(126, 34, 206);
      doc.text(fmtHoras(j.msClase), 162, y, { align: 'right' });
      doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
      doc.text(fmtHoras(j.ms), 194, y, { align: 'right' });
      y += 6.8;
    });

    // Tarjeta de horas totales por trabajador
    y += 6;
    for (const [uid, t] of Object.entries(totalesPorUser)) {
      if (y > 245) { doc.addPage(); y = 20; }
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(12, y - 5, 90, 26, 2.5, 2.5, 'FD');
      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
      doc.text(`HORAS TOTALES · ${(names[uid] || 'TRABAJADOR').toUpperCase()}`, 17, y + 1);
      doc.setFontSize(16); doc.setTextColor(22, 101, 52);
      doc.text(fmtHoras(t.ms), 17, y + 10);
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(71, 85, 105);
      doc.text(`club ${fmtHoras(t.msClub)} · clases ${fmtHoras(t.msClase)}`, 17, y + 16.5);
      y += 34;
    }

    // Pie
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    if (hayManuales) doc.text('* Jornada añadida a mano por administración (sin firma ni GPS).', 14, 280);
    doc.text('Fichajes con hora de servidor, ubicación GPS y firma del trabajador (ver panel online).', 14, 285);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
    doc.save(`control-horario-${MESES[month].toLowerCase()}-${year}.pdf`);
  };

  const esteMes = year === now.getFullYear() && month === now.getMonth();
  const hayJornadas = jornadas.some(j => j.entrada && j.salida);

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Control horario del personal</p>

      {/* Selector de mes + exportar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
          <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '1.05rem', minWidth: 150, textAlign: 'center' }}>
            {MESES[month]} {year}
          </div>
          <button onClick={() => shiftMonth(1)} disabled={esteMes} style={{ ...navBtn, opacity: esteMes ? 0.35 : 1, cursor: esteMes ? 'not-allowed' : 'pointer' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setFormAbierto(v => !v)} style={{ ...exportBtn, borderColor: '#86EFAC', color: '#15803D', background: formAbierto ? '#F0FDF4' : 'white' }}>
            {formAbierto ? '▲ Cerrar' : '➕ Añadir turno'}
          </button>
          <button onClick={exportPdf} disabled={!hayJornadas} style={{ ...exportBtn, opacity: hayJornadas ? 1 : 0.4 }}>📄 PDF</button>
          <button onClick={exportCsv} disabled={!hayJornadas} style={{ ...exportBtn, opacity: hayJornadas ? 1 : 0.4 }}>📊 Excel</button>
        </div>
      </div>

      {/* ── Añadir turno manual (cuando al trabajador se le olvidó fichar) ── */}
      {formAbierto && (
        <div style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '1rem', padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.92rem' }}>✍️ Añadir turno manual</div>
          <p style={{ margin: '0.25rem 0 0.8rem', fontSize: '0.76rem', color: '#4D7C0F' }}>
            Para cuando se le olvida fichar: la jornada queda marcada como <strong>añadida por administración</strong> (sin firma ni GPS) y cuenta en las horas del mes.
          </p>
          {!conManual && (
            <p style={{ margin: '0 0 0.8rem', fontSize: '0.76rem', fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.6rem', padding: '0.5rem 0.7rem' }}>
              ⚠️ Falta aplicar la migración <code>fichajes_manual_admin</code> en Supabase: hasta entonces no se pueden guardar turnos manuales.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {trabajadores.length > 1 && (
              <label style={lblForm}>
                Trabajador
                <select value={form.userId || trabajadores[0]?.id || ''} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} style={inpForm}>
                  {trabajadores.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
                </select>
              </label>
            )}
            <label style={lblForm}>
              Día
              <input type="date" value={form.fecha} max={hoyYmd} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={inpForm} />
            </label>
            <label style={lblForm}>
              Entrada
              <input type="time" value={form.entrada} onChange={e => setForm(f => ({ ...f, entrada: e.target.value }))} style={inpForm} />
            </label>
            <label style={lblForm}>
              Salida
              <input type="time" value={form.salida} onChange={e => setForm(f => ({ ...f, salida: e.target.value }))} style={inpForm} />
            </label>
            <label style={{ ...lblForm, flex: '1 1 160px' }}>
              Nota (opcional)
              <input value={form.nota} placeholder="p. ej. se le olvidó fichar" maxLength={120} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} style={{ ...inpForm, width: '100%', boxSizing: 'border-box' }} />
            </label>
            <button onClick={guardarTurno} disabled={guardandoTurno}
              style={{ padding: '0.6rem 1.1rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'inherit', opacity: guardandoTurno ? 0.7 : 1 }}>
              {guardandoTurno ? 'Guardando…' : 'Guardar turno'}
            </button>
          </div>
        </div>
      )}

      {/* Totales de horas por trabajador */}
      {!loading && Object.keys(totalesPorUser).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {Object.entries(totalesPorUser).map(([uid, t]) => (
            <div key={`h-${uid}`} style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>⏱ Horas · {names[uid] || 'Trabajador'}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#166534', marginTop: '0.15rem' }}>{fmtHoras(t.ms)}</div>
              <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 700, marginTop: '0.2rem' }}>
                🏢 club {fmtHoras(t.msClub)} · 🎾 clases {fmtHoras(t.msClase)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de jornadas: entrada, salida, firma y ubicación */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando fichajes…</div>
      ) : jornadas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1.25rem' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🕐</div>
          <p style={{ fontWeight: 700, color: '#64748B', margin: 0 }}>Sin fichajes este mes</p>
          <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>El trabajador aún no ha fichado entrada/salida.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {jornadas.map((j, i) => {
            const ubic = mapsUrl(j.entrada) || mapsUrl(j.salida);
            const esManual = Boolean(j.entrada?.manual || j.salida?.manual);
            const notaManual = j.entrada?.nota || j.salida?.nota || '';
            return (
              <div key={i} style={{ background: 'white', borderRadius: '0.95rem', border: `1.5px solid ${j.abierta ? '#FDE68A' : '#E2E8F0'}`, padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', textTransform: 'capitalize' }}>{fechaLarga(j.fecha)}</div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>{names[j.userId] || 'Trabajador'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {j.abierta ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 999, padding: '0.25rem 0.7rem' }}>⏳ Turno abierto</span>
                    ) : j.ms > 0 ? (
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A' }}>{fmtHoras(j.ms)}</div>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>—</span>
                    )}
                    {esManual && (
                      <button onClick={() => borrarTurnoManual(j)} title="Borrar este turno manual"
                        style={{ border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '0.55rem', width: 32, height: 32, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>
                        🗑
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem', alignItems: 'center' }}>
                  {j.entrada && (
                    <span style={chip('#F0FDF4', '#BBF7D0', '#15803D')}>🟢 Entrada {hora(j.entrada.fichado_at)}</span>
                  )}
                  {j.salida && (
                    <span style={chip('#FEF2F2', '#FECACA', '#B91C1C')}>🔴 Salida {hora(j.salida.fichado_at)}</span>
                  )}
                  {j.ms > 0 && (
                    <span style={chip('#F8FAFC', '#E2E8F0', '#475569')}>🏢 Club {fmtHoras(j.msClub)}</span>
                  )}
                  {j.ms > 0 && GRUPOS.filter(g => (j.msPorGrupo?.[g.key] || 0) > 0).map(g => (
                    <span key={g.key} style={chip('#FAF5FF', '#D8B4FE', '#9333EA')}>{g.label} {fmtHoras(j.msPorGrupo[g.key])}</span>
                  ))}
                  {esManual && (
                    <span style={chip('#FFFBEB', '#FDE68A', '#B45309')}>✍️ Añadido por admin{notaManual ? ` · ${notaManual}` : ''}</span>
                  )}
                  {ubic ? (
                    <a href={ubic} target="_blank" rel="noopener noreferrer" style={{ ...chip('#EFF6FF', '#BFDBFE', '#1D4ED8'), textDecoration: 'none', cursor: 'pointer' }}>
                      📍 Ver ubicación en el mapa
                    </a>
                  ) : !esManual && (
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>📍 sin ubicación</span>
                  )}
                </div>

                {/* Firmas del trabajador (entrada / salida) */}
                {(j.entrada?.firma || j.salida?.firma) && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px dashed #E2E8F0' }}>
                    {j.entrada?.firma && <Firma label="Firma entrada" src={j.entrada.firma} onZoom={setZoom} />}
                    {j.salida?.firma && <Firma label="Firma salida" src={j.salida.firma} onZoom={setZoom} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Firma ampliada */}
      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', maxWidth: 480, width: '100%' }}>
            <img src={zoom} alt="Firma" style={{ width: '100%', display: 'block', borderRadius: '0.5rem' }} />
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8', margin: '0.6rem 0 0' }}>Toca para cerrar</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Firma({ label, src, onZoom }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <img src={src} alt={label} onClick={() => onZoom(src)}
        style={{ height: 54, width: 'auto', maxWidth: 160, border: '1px solid #E2E8F0', borderRadius: '0.5rem', background: 'white', cursor: 'zoom-in', objectFit: 'contain' }} />
    </div>
  );
}

const navBtn = { width: 40, height: 40, borderRadius: '0.6rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', fontSize: '1.3rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 };
const lblForm = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#3F6212' };
const inpForm = { padding: '0.5rem 0.6rem', borderRadius: '0.6rem', border: '1.5px solid #BBF7D0', background: 'white', fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', fontFamily: 'inherit' };
const exportBtn = { padding: '0.6rem 1rem', borderRadius: '0.7rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' };
const chip = (bg, border, color) => ({ fontSize: '0.72rem', fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 999, padding: '0.28rem 0.65rem', whiteSpace: 'nowrap' });
