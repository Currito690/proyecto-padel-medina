import { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';
import { toast } from '../../utils/notify';

// CONTROL HORARIO (admin): jornadas del personal a partir de los fichajes de
// entrada/salida (hora del SERVIDOR + GPS + firma). Además:
//  - Tarifas editables: €/h en club (atención) y €/h de entreno POR TIPO DE
//    GRUPO (individual, grupo de 2, de 3 y de 4).
//  - Las horas de ENTRENO se calculan cruzando cada jornada con los huecos
//    marcados como 'entreno' en el horario (blocked_slots), cada uno con su
//    tipo de grupo. El resto de la jornada se paga a tarifa de club.
//  - Exportación del mes a PDF y a Excel (CSV).

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

// Tipos de entreno (columna en site_settings, etiqueta, abreviatura)
const GRUPOS = [
  { key: 'individual', col: 'tarifa_entreno_individual', label: '🎾 Individual', abr: 'Ind' },
  { key: 'grupo2', col: 'tarifa_entreno_grupo2', label: '👥 Grupo 2', abr: 'G2' },
  { key: 'grupo3', col: 'tarifa_entreno_grupo3', label: '👥 Grupo 3', abr: 'G3' },
  { key: 'grupo4', col: 'tarifa_entreno_grupo4', label: '👥 Grupo 4', abr: 'G4' },
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
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(null); // firma ampliada

  // Tarifas (site_settings): { club, individual, grupo2, grupo3, grupo4 } como texto editable
  const [settingsId, setSettingsId] = useState(null);
  const [rates, setRates] = useState({ club: '0', individual: '0', grupo2: '0', grupo3: '0', grupo4: '0' });
  const [savingRates, setSavingRates] = useState(false);
  const setRate = (k, v) => setRates(prev => ({ ...prev, [k]: v }));

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  useEffect(() => {
    supabase.from('site_settings')
      .select('id, tarifa_hora_club, tarifa_entreno_individual, tarifa_entreno_grupo2, tarifa_entreno_grupo3, tarifa_entreno_grupo4')
      .single()
      .then(({ data }) => {
        if (!data) return;
        setSettingsId(data.id);
        setRates({
          club: String(data.tarifa_hora_club ?? 0).replace('.', ','),
          individual: String(data.tarifa_entreno_individual ?? 0).replace('.', ','),
          grupo2: String(data.tarifa_entreno_grupo2 ?? 0).replace('.', ','),
          grupo3: String(data.tarifa_entreno_grupo3 ?? 0).replace('.', ','),
          grupo4: String(data.tarifa_entreno_grupo4 ?? 0).replace('.', ','),
        });
      });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const primerYmd = `${year}-${pad(month + 1)}-01`;
      const ultimoYmd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
      const [{ data: fData }, { data: eData }] = await Promise.all([
        supabase
          .from('fichajes')
          .select('id, user_id, tipo, fichado_at, lat, lng, precision_m, firma')
          .gte('fichado_at', `${primerYmd}T00:00:00`)
          .lt('fichado_at', new Date(year, month + 1, 1).toISOString())
          .order('fichado_at', { ascending: true }),
        supabase
          .from('blocked_slots')
          .select('date, time_slot, tipo, entreno_grupo')
          .eq('tipo', 'entreno')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
      ]);
      const rows = fData || [];
      setFichajes(rows);
      setEntrenos(eData || []);
      const uids = [...new Set(rows.map(f => f.user_id))];
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
        setNames(Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])));
      }
      setLoading(false);
    })();
  }, [year, month]);

  const guardarTarifas = async () => {
    const parsed = {};
    for (const [k, v] of Object.entries(rates)) {
      const n = parseEur(v);
      if (n === null) { toast('Tarifa no válida (ej: 8,50)', 'error'); return; }
      parsed[k] = n;
    }
    if (!settingsId) { toast('No se pudieron cargar los ajustes', 'error'); return; }
    setSavingRates(true);
    const { error } = await supabase.from('site_settings')
      .update({
        tarifa_hora_club: parsed.club,
        tarifa_entreno_individual: parsed.individual,
        tarifa_entreno_grupo2: parsed.grupo2,
        tarifa_entreno_grupo3: parsed.grupo3,
        tarifa_entreno_grupo4: parsed.grupo4,
      })
      .eq('id', settingsId);
    setSavingRates(false);
    if (error) toast('Error al guardar: ' + error.message, 'error');
    else toast('Tarifas guardadas ✓', 'success');
  };

  const tarifa = (k) => parseEur(rates[k]) ?? 0;

  // Entrenos del mes agrupados por día: intervalos por grupo + unión total
  const entrenosPorDia = useMemo(() => {
    const m = {}; // ymd -> { grupos: {key: [[a,b],...]}, all: [[a,b],...] }
    for (const e of entrenos) {
      const g = e.entreno_grupo || 'grupo4'; // entrenos antiguos sin tipo → grupo 4
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
  }, [entrenos]);

  // Emparejar entrada→salida en jornadas + desglose club/entreno por grupo
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
        let msEntreno = 0;
        if (dia) {
          for (const g of GRUPOS) {
            msPorGrupo[g.key] = overlapMs(ini, fin, dia.grupos[g.key] || []);
          }
          msEntreno = overlapMs(ini, fin, dia.all);
        }
        const ms = fin - ini;
        jor.push({ userId: f.user_id, fecha, entrada: ent, salida: f, ms, msPorGrupo, msEntreno, msClub: Math.max(0, ms - msEntreno) });
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
      if (!tot[j.userId]) tot[j.userId] = { ms: 0, msClub: 0, msEntreno: 0, porGrupo: { individual: 0, grupo2: 0, grupo3: 0, grupo4: 0 } };
      tot[j.userId].ms += j.ms || 0;
      tot[j.userId].msClub += j.msClub || 0;
      tot[j.userId].msEntreno += j.msEntreno || 0;
      for (const g of GRUPOS) tot[j.userId].porGrupo[g.key] += j.msPorGrupo?.[g.key] || 0;
    }
    return { jornadas: jor, totalesPorUser: tot };
  }, [fichajes, entrenosPorDia]);

  const eurosJornada = (j) => {
    if (!j.ms) return 0;
    let e = (j.msClub / 3600000) * tarifa('club');
    for (const g of GRUPOS) e += ((j.msPorGrupo?.[g.key] || 0) / 3600000) * tarifa(g.key);
    return e;
  };
  const eurosTotal = (t) => {
    let e = (t.msClub / 3600000) * tarifa('club');
    for (const g of GRUPOS) e += (t.porGrupo[g.key] / 3600000) * tarifa(g.key);
    return e;
  };

  // ── Exportar Excel (CSV con ; — abre directo en Excel español) ──
  const exportCsv = () => {
    const nombreMes = `${MESES[month].toLowerCase()}-${year}`;
    const header = 'Trabajador;Fecha;Entrada;Salida;Horas totales;Horas club;H. individual;H. grupo 2;H. grupo 3;H. grupo 4;Importe (EUR)';
    const filas = [...jornadas].reverse().filter(j => j.entrada && j.salida).map(j =>
      [names[j.userId] || 'Trabajador', j.fecha, hora(j.entrada.fichado_at), hora(j.salida.fichado_at),
        horasDec(j.ms), horasDec(j.msClub),
        ...GRUPOS.map(g => horasDec(j.msPorGrupo?.[g.key] || 0)),
        eurosJornada(j).toFixed(2).replace('.', ',')].join(';'));
    const totales = Object.entries(totalesPorUser).map(([uid, t]) =>
      `TOTAL ${names[uid] || ''};;;;${horasDec(t.ms)};${horasDec(t.msClub)};${GRUPOS.map(g => horasDec(t.porGrupo[g.key])).join(';')};${eurosTotal(t).toFixed(2).replace('.', ',')}`);
    const tarifasTxt = [
      `Tarifa club (EUR/h);${tarifa('club').toFixed(2).replace('.', ',')}`,
      ...GRUPOS.map(g => `Tarifa entreno ${g.abr} (EUR/h);${tarifa(g.key).toFixed(2).replace('.', ',')}`),
    ];
    const csv = '﻿' + [header, ...filas, '', ...totales, '', ...tarifasTxt].join('\n');
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
    const nombreMes = `${MESES[month]} ${year}`;
    let y = 18;
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(`Control horario — ${nombreMes}`, 14, y); y += 6;
    doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
    doc.text(`Padel Medina · Tarifas €/h: club ${tarifa('club').toFixed(2)} · ind ${tarifa('individual').toFixed(2)} · G2 ${tarifa('grupo2').toFixed(2)} · G3 ${tarifa('grupo3').toFixed(2)} · G4 ${tarifa('grupo4').toFixed(2)}`, 14, y); y += 8;

    const cols = [
      { t: 'Fecha', x: 13 }, { t: 'Ent.', x: 40 }, { t: 'Sal.', x: 55 }, { t: 'Club', x: 70 },
      { t: 'Ind', x: 92 }, { t: 'G2', x: 112 }, { t: 'G3', x: 132 }, { t: 'G4', x: 152 }, { t: 'Importe', x: 172 },
    ];
    const headerRow = () => {
      doc.setFillColor(27, 58, 110);
      doc.rect(11, y - 4.5, 188, 7, 'F');
      doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
      cols.forEach(c => doc.text(c.t, c.x, y));
      doc.setFont(undefined, 'normal'); doc.setTextColor(30);
      y += 7;
    };
    headerRow();

    const cerradas = [...jornadas].reverse().filter(j => j.entrada && j.salida);
    for (const j of cerradas) {
      if (y > 272) { doc.addPage(); y = 18; headerRow(); }
      doc.setFontSize(8);
      doc.text(j.fecha, 13, y);
      doc.text(hora(j.entrada.fichado_at), 40, y);
      doc.text(hora(j.salida.fichado_at), 55, y);
      doc.text(fmtHoras(j.msClub), 70, y);
      GRUPOS.forEach((g, i) => doc.text(fmtHoras(j.msPorGrupo?.[g.key] || 0), [92, 112, 132, 152][i], y));
      doc.text(eurosJornada(j).toFixed(2) + ' €', 172, y);
      y += 5.5;
    }

    y += 4;
    doc.setDrawColor(200); doc.line(11, y - 3, 199, y - 3);
    doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
    for (const [uid, t] of Object.entries(totalesPorUser)) {
      if (y > 268) { doc.addPage(); y = 18; }
      doc.text(`TOTAL ${names[uid] || 'Trabajador'}: ${fmtHoras(t.ms)}  →  ${eurosTotal(t).toFixed(2)} €`, 13, y); y += 5.5;
      doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
      doc.text(`club ${fmtHoras(t.msClub)} · ind ${fmtHoras(t.porGrupo.individual)} · G2 ${fmtHoras(t.porGrupo.grupo2)} · G3 ${fmtHoras(t.porGrupo.grupo3)} · G4 ${fmtHoras(t.porGrupo.grupo4)}`, 13, y);
      doc.setFont(undefined, 'bold'); doc.setFontSize(9.5); doc.setTextColor(30);
      y += 7;
    }
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text('Fichajes con hora de servidor, ubicación GPS y firma del trabajador (ver panel online).', 13, 290);
    doc.save(`control-horario-${MESES[month].toLowerCase()}-${year}.pdf`);
  };

  const esteMes = year === now.getFullYear() && month === now.getMonth();
  const hayJornadas = jornadas.some(j => j.entrada && j.salida);

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Control horario del personal</p>

      {/* Tarifas editables */}
      <div style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>💶 Tarifas por hora</div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[{ key: 'club', label: '🏢 En club' }, ...GRUPOS.map(g => ({ key: g.key, label: g.label }))].map(({ key, label }) => (
            <label key={key} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
              {label}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <input value={rates[key]} onChange={e => setRate(key, e.target.value)} inputMode="decimal"
                  style={{ width: 74, padding: '0.5rem 0.6rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 700 }} />
                <span style={{ color: '#64748B', fontWeight: 700, fontSize: '0.78rem' }}>€/h</span>
              </div>
            </label>
          ))}
          <button onClick={guardarTarifas} disabled={savingRates}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', opacity: savingRates ? 0.7 : 1 }}>
            {savingRates ? 'Guardando…' : 'Guardar tarifas'}
          </button>
        </div>
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
          Al marcar un <strong>entreno</strong> en el horario se elige su grupo (individual, G2, G3, G4) y esas horas se pagan a su tarifa; el resto de la jornada fichada, a tarifa de club.
        </p>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {Object.entries(totalesPorUser).map(([uid, t]) => (
            <div key={uid} style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{names[uid] || 'Trabajador'}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#166534' }}>{fmtHoras(t.ms)}</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>{fmtEur(eurosTotal(t))}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 700, marginTop: '0.25rem', lineHeight: 1.6 }}>
                🏢 club {fmtHoras(t.msClub)}
                {GRUPOS.filter(g => t.porGrupo[g.key] > 0).map(g => (
                  <span key={g.key}> · {g.label} {fmtHoras(t.porGrupo[g.key])}</span>
                ))}
              </div>
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
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>{fmtEur(eurosJornada(j))}</div>
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
