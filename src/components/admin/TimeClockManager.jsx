import { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';
import { toast } from '../../utils/notify';

// CONTROL HORARIO (admin): jornadas del personal a partir de los fichajes
// (hora del SERVIDOR + GPS + firma).
// MODELO DE PAGO:
//  - El trabajador cobra una HORA FIJA (tarifa_hora_club, la fija el admin):
//    todas sus horas fichadas se pagan igual, esté en clase o atendiendo.
//  - Los PRECIOS DE LAS CLASES van APARTE: los fija el propio monitor
//    (tabla monitor_tarifas) y se calculan como concepto separado
//    (horas de clase por grupo × su precio), sin tocar el sueldo.
//  - Las horas de clase se detectan cruzando los fichajes con los entrenos
//    del horario; el nº real de personas lo confirma el monitor cada día.

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
const fmtEur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const parseEur = (str) => {
  const n = Number(String(str).replace(',', '.').trim());
  return isFinite(n) && n >= 0 ? n : null;
};
const mapsUrl = (f) => (f && f.lat != null ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : null);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Tipos de clase (columna en monitor_tarifas, etiqueta, abreviatura)
const GRUPOS = [
  { key: 'individual', col: 'tarifa_individual', label: '🎾 Individual', abr: 'Ind' },
  { key: 'grupo2', col: 'tarifa_grupo2', label: '👥 Grupo 2', abr: 'G2' },
  { key: 'grupo3', col: 'tarifa_grupo3', label: '👥 Grupo 3', abr: 'G3' },
  { key: 'grupo4', col: 'tarifa_grupo4', label: '👥 Grupo 4', abr: 'G4' },
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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [fichajes, setFichajes] = useState([]);
  const [entrenos, setEntrenos] = useState([]); // blocked_slots tipo=entreno del mes
  const [confirmadas, setConfirmadas] = useState([]); // clases_monitor: personas confirmadas
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(null); // firma ampliada

  // Tarifa de hora FIJA (site_settings, la fija el admin). Los precios de las
  // clases los fija cada monitor (monitor_tarifas) y aquí solo se leen.
  const [settingsId, setSettingsId] = useState(null);
  const [rateClub, setRateClub] = useState('0');
  const [savingRates, setSavingRates] = useState(false);
  const [tarifasMonitor, setTarifasMonitor] = useState({}); // user_id -> {individual, grupo2, grupo3, grupo4}

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  useEffect(() => {
    supabase.from('site_settings').select('id, tarifa_hora_club').single()
      .then(({ data }) => {
        if (!data) return;
        setSettingsId(data.id);
        setRateClub(String(data.tarifa_hora_club ?? 0).replace('.', ','));
      });
    supabase.from('monitor_tarifas').select('*')
      .then(({ data }) => {
        const m = {};
        (data || []).forEach(r => {
          m[r.user_id] = {
            individual: Number(r.tarifa_individual) || 0,
            grupo2: Number(r.tarifa_grupo2) || 0,
            grupo3: Number(r.tarifa_grupo3) || 0,
            grupo4: Number(r.tarifa_grupo4) || 0,
          };
        });
        setTarifasMonitor(m);
      });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const primerYmd = `${year}-${pad(month + 1)}-01`;
      const ultimoYmd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
      const [{ data: fData }, { data: eData }, { data: cData }] = await Promise.all([
        supabase
          .from('fichajes')
          .select('id, user_id, tipo, fichado_at, lat, lng, precision_m, firma')
          .gte('fichado_at', `${primerYmd}T00:00:00`)
          .lt('fichado_at', new Date(year, month + 1, 1).toISOString())
          .order('fichado_at', { ascending: true }),
        supabase
          .from('blocked_slots')
          .select('date, time_slot, court_id, tipo, entreno_grupo')
          .eq('tipo', 'entreno')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
        supabase
          .from('clases_monitor')
          .select('date, time_slot, court_id, personas')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
      ]);
      const rows = fData || [];
      setFichajes(rows);
      setEntrenos(eData || []);
      setConfirmadas(cData || []);
      const uids = [...new Set(rows.map(f => f.user_id))];
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
        setNames(Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])));
      }
      setLoading(false);
    })();
  }, [year, month]);

  const guardarTarifa = async () => {
    const club = parseEur(rateClub);
    if (club === null) { toast('Tarifa no válida (ej: 8,50)', 'error'); return; }
    if (!settingsId) { toast('No se pudieron cargar los ajustes', 'error'); return; }
    setSavingRates(true);
    const { error } = await supabase.from('site_settings')
      .update({ tarifa_hora_club: club })
      .eq('id', settingsId);
    setSavingRates(false);
    if (error) toast('Error al guardar: ' + error.message, 'error');
    else toast('Tarifa guardada ✓', 'success');
  };

  const tarifaFija = parseEur(rateClub) ?? 0;
  const precioClase = (uid, key) => tarifasMonitor[uid]?.[key] ?? 0;

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

  // Emparejar entrada→salida en jornadas + desglose de horas clase/club
  const { jornadas, totalesPorUser } = useMemo(() => {
    const jor = [];
    const abiertos = {};
    for (const f of fichajes) {
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

  // SUELDO: hora fija × todas las horas fichadas (clase o club, da igual)
  const sueldoJornada = (j) => (j.ms / 3600000) * tarifaFija;
  const sueldoTotal = (t) => (t.ms / 3600000) * tarifaFija;
  // CLASES (aparte): horas de clase por grupo × precio de clase del monitor
  const clasesAparte = (uid, t) =>
    GRUPOS.reduce((s, g) => s + (t.porGrupo[g.key] / 3600000) * precioClase(uid, g.key), 0);

  // ── Exportar Excel (CSV con ; — abre directo en Excel español) ──
  const exportCsv = () => {
    const nombreMes = `${MESES[month].toLowerCase()}-${year}`;
    const header = 'Trabajador;Fecha;Entrada;Salida;Horas totales;Horas club;Horas clases;Sueldo (EUR)';
    const filas = [...jornadas].reverse().filter(j => j.entrada && j.salida).map(j =>
      [names[j.userId] || 'Trabajador', j.fecha, hora(j.entrada.fichado_at), hora(j.salida.fichado_at),
        horasDec(j.ms), horasDec(j.msClub), horasDec(j.msClase),
        sueldoJornada(j).toFixed(2).replace('.', ',')].join(';'));
    const totales = Object.entries(totalesPorUser).flatMap(([uid, t]) => [
      `TOTAL ${names[uid] || ''};;;;${horasDec(t.ms)};${horasDec(t.msClub)};${horasDec(t.msClase)};${sueldoTotal(t).toFixed(2).replace('.', ',')}`,
      `Clases APARTE ${names[uid] || ''};${GRUPOS.map(g => `${g.abr} ${horasDec(t.porGrupo[g.key])}h`).join(';')};;${clasesAparte(uid, t).toFixed(2).replace('.', ',')}`,
    ]);
    const csv = '﻿' + [header, ...filas, '', ...totales, '', `Tarifa hora fija (EUR/h);${tarifaFija.toFixed(2).replace('.', ',')}`].join('\n');
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
    const cabecera = () => {
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
      doc.text(`Hora fija del trabajador: ${tarifaFija.toFixed(2)} €/h (todas las horas) · Las clases se facturan aparte`, 14, 30);
    };
    cabecera();

    // Tabla de jornadas
    let y = 46;
    const thead = () => {
      doc.setFillColor(...NAVY);
      doc.roundedRect(12, y - 5.5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('FECHA', 15, y);
      doc.text('ENTRADA', 58, y, { align: 'right' });
      doc.text('SALIDA', 78, y, { align: 'right' });
      doc.text('CLUB', 103, y, { align: 'right' });
      doc.text('CLASES', 128, y, { align: 'right' });
      doc.text('TOTAL', 153, y, { align: 'right' });
      doc.text('SUELDO', 194, y, { align: 'right' });
      y += 9;
    };
    thead();

    const cerradas = [...jornadas].reverse().filter(j => j.entrada && j.salida);
    cerradas.forEach((j, i) => {
      if (y > 270) { doc.addPage(); y = 20; thead(); }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(12, y - 4.6, 186, 6.8, 'F');
      }
      doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...INK);
      doc.text(j.fecha, 15, y);
      doc.text(hora(j.entrada.fichado_at), 58, y, { align: 'right' });
      doc.text(hora(j.salida.fichado_at), 78, y, { align: 'right' });
      doc.setTextColor(...MUTED);
      doc.text(fmtHoras(j.msClub), 103, y, { align: 'right' });
      doc.setTextColor(126, 34, 206);
      doc.text(fmtHoras(j.msClase), 128, y, { align: 'right' });
      doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
      doc.text(fmtHoras(j.ms), 153, y, { align: 'right' });
      doc.setTextColor(22, 101, 52);
      doc.text(sueldoJornada(j).toFixed(2) + ' €', 194, y, { align: 'right' });
      y += 6.8;
    });

    // Tarjeta de total por trabajador
    y += 5;
    for (const [uid, t] of Object.entries(totalesPorUser)) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(12, y - 5, 186, 26, 2.5, 2.5, 'FD');
      doc.setFont(undefined, 'bold'); doc.setFontSize(10.5); doc.setTextColor(22, 101, 52);
      doc.text(`${names[uid] || 'Trabajador'} — ${fmtHoras(t.ms)}`, 17, y + 1.5);
      doc.text(`Sueldo: ${sueldoTotal(t).toFixed(2)} €`, 193, y + 1.5, { align: 'right' });
      doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
      doc.text(`Desglose: en club ${fmtHoras(t.msClub)} · en clases ${fmtHoras(t.msClase)}`, 17, y + 8);
      doc.setTextColor(126, 34, 206);
      doc.text(
        `Clases aparte: ${GRUPOS.filter(g => t.porGrupo[g.key] > 0).map(g => `${g.abr} ${fmtHoras(t.porGrupo[g.key])} × ${precioClase(uid, g.key).toFixed(2)}€`).join(' · ') || 'sin clases'}  =  ${clasesAparte(uid, t).toFixed(2)} €`,
        17, y + 14.5
      );
      y += 32;
    }

    // Pie
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text('Fichajes con hora de servidor, ubicación GPS y firma del trabajador (ver panel online).', 14, 285);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
    doc.save(`control-horario-${MESES[month].toLowerCase()}-${year}.pdf`);
  };

  const esteMes = year === now.getFullYear() && month === now.getMonth();
  const hayJornadas = jornadas.some(j => j.entrada && j.salida);

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Control horario del personal</p>

      {/* Tarifa fija (admin) + precios de clase del monitor (solo lectura) */}
      <div style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>💶 Tarifa por hora (fija)</div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
            Hora del trabajador (clase o club, se paga igual)
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <input value={rateClub} onChange={e => setRateClub(e.target.value)} inputMode="decimal"
                style={{ width: 90, padding: '0.55rem 0.7rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', fontWeight: 700 }} />
              <span style={{ color: '#64748B', fontWeight: 700 }}>€/h</span>
            </div>
          </label>
          <button onClick={guardarTarifa} disabled={savingRates}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', opacity: savingRates ? 0.7 : 1 }}>
            {savingRates ? 'Guardando…' : 'Guardar tarifa'}
          </button>
        </div>
        {Object.entries(tarifasMonitor).length > 0 && (
          <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px dashed #E2E8F0' }}>
            {Object.entries(tarifasMonitor).map(([uid, t]) => (
              <div key={uid} style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                🎾 Precios de clase de <strong>{names[uid] || 'monitor'}</strong> (los fija él, van aparte del sueldo):
                {' '}Ind {fmtEur(t.individual)} · G2 {fmtEur(t.grupo2)} · G3 {fmtEur(t.grupo3)} · G4 {fmtEur(t.grupo4)} por hora
              </div>
            ))}
          </div>
        )}
      </div>

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
          <button onClick={exportPdf} disabled={!hayJornadas} style={{ ...exportBtn, opacity: hayJornadas ? 1 : 0.4 }}>📄 PDF</button>
          <button onClick={exportCsv} disabled={!hayJornadas} style={{ ...exportBtn, opacity: hayJornadas ? 1 : 0.4 }}>📊 Excel</button>
        </div>
      </div>

      {/* Totales por trabajador */}
      {!loading && Object.keys(totalesPorUser).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {Object.entries(totalesPorUser).map(([uid, t]) => (
            <div key={uid} style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{names[uid] || 'Trabajador'}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#166534' }}>{fmtHoras(t.ms)}</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>{fmtEur(sueldoTotal(t))}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 700, marginTop: '0.25rem' }}>
                🏢 club {fmtHoras(t.msClub)} · 🎾 clases {fmtHoras(t.msClase)}
              </div>
              {t.msClase > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#7E22CE', fontWeight: 700, marginTop: '0.2rem' }}>
                  💜 Clases aparte: {fmtEur(clasesAparte(uid, t))}
                  {' '}({GRUPOS.filter(g => t.porGrupo[g.key] > 0).map(g => `${g.abr} ${fmtHoras(t.porGrupo[g.key])}`).join(' · ')})
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lista de jornadas */}
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
            return (
              <div key={i} style={{ background: 'white', borderRadius: '0.95rem', border: `1.5px solid ${j.abierta ? '#FDE68A' : '#E2E8F0'}`, padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', textTransform: 'capitalize' }}>{fechaLarga(j.fecha)}</div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>{names[j.userId] || 'Trabajador'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {j.abierta ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 999, padding: '0.25rem 0.7rem' }}>⏳ Turno abierto</span>
                    ) : j.ms > 0 ? (
                      <>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A' }}>{fmtHoras(j.ms)}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>{fmtEur(sueldoJornada(j))}</div>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>—</span>
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
                  {ubic ? (
                    <a href={ubic} target="_blank" rel="noopener noreferrer" style={{ ...chip('#EFF6FF', '#BFDBFE', '#1D4ED8'), textDecoration: 'none', cursor: 'pointer' }}>
                      📍 Ver ubicación en el mapa
                    </a>
                  ) : (
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
const exportBtn = { padding: '0.6rem 1rem', borderRadius: '0.7rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' };
const chip = (bg, border, color) => ({ fontSize: '0.72rem', fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 999, padding: '0.28rem 0.65rem', whiteSpace: 'nowrap' });
