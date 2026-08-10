import { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';

// CONTROL HORARIO (admin) — hoy es el panel de INGRESOS DE LAS CLASES.
// El sueldo del trabajador es fijo (fuera de la app) y sus fichajes NO se
// muestran ni se exportan (petición del club: horas a cero). Lo que ve el admin:
//  - Ingresos de las clases del mes: total, por día y por clase, cada una por
//    SU precio (el que el monitor puso a esa clase o su tarifa por grupo)
//  - Cómo pagó cada alumno (tarjeta / bizum / en mano)
// SOLO cuentan las clases que el monitor CONFIRMA al acabar el día.

const pad = (n) => String(n).padStart(2, '0');
const fechaLarga = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtEur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function TimeClockManager() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [confirmadas, setConfirmadas] = useState([]); // clases_monitor: personas + precio + pagos
  const [names, setNames] = useState({});
  const [courtNames, setCourtNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [tarifasMonitor, setTarifasMonitor] = useState({}); // user_id -> precios de clase (los fija el monitor)

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  useEffect(() => {
    supabase.from('monitor_tarifas').select('*')
      .then(async ({ data }) => {
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
        const uids = Object.keys(m);
        if (uids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
          setNames(prev => ({ ...prev, ...Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])) }));
        }
      });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const primerYmd = `${year}-${pad(month + 1)}-01`;
      const ultimoYmd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
      const [{ data: cData }, { data: ctData }] = await Promise.all([
        supabase
          .from('clases_monitor')
          .select('*')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
        supabase.from('courts').select('id, name'),
      ]);
      setConfirmadas(cData || []);
      setCourtNames(Object.fromEntries((ctData || []).map(c => [c.id, c.name])));
      const uids = [...new Set((cData || []).map(c => c.user_id))];
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
        setNames(prev => ({ ...prev, ...Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])) }));
      }
      setLoading(false);
    })();
  }, [year, month]);

  // INGRESOS DE CLASES: cada clase confirmada entra por SU precio (el que el
  // monitor puso a ESA clase o, si no puso, su tarifa según el grupo).
  const clasesDetalle = useMemo(() => {
    const PERSONAS_GRUPO = { 1: 'individual', 2: 'grupo2', 3: 'grupo3', 4: 'grupo4' };
    return confirmadas.map(c => {
      const gKey = PERSONAS_GRUPO[c.personas] || 'grupo4';
      const precio = c.precio != null ? Number(c.precio) : (tarifasMonitor[c.user_id]?.[gKey] ?? 0);
      return { ...c, gKey, precio, pagos: Array.isArray(c.pagos) ? c.pagos : [] };
    });
  }, [confirmadas, tarifasMonitor]);

  // Por día (del más reciente al más antiguo), con sus clases dentro
  const ingresosPorDia = useMemo(() => {
    const m = {};
    for (const c of clasesDetalle) (m[c.date] = m[c.date] || []).push(c);
    return Object.keys(m).sort((a, b) => b.localeCompare(a)).map(d => ({
      date: d,
      clases: m[d].sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
      total: m[d].reduce((s, c) => s + c.precio, 0),
    }));
  }, [clasesDetalle]);

  const totalIngresos = useMemo(() => clasesDetalle.reduce((s, c) => s + c.precio, 0), [clasesDetalle]);

  // Con qué pagó cada alumno, sumado en el mes (uno por persona de cada clase)
  const pagosResumen = useMemo(() => {
    const r = { tarjeta: 0, bizum: 0, mano: 0, sin: 0 };
    for (const c of clasesDetalle) {
      for (let i = 0; i < c.personas; i++) {
        const p = c.pagos[i];
        if (p === 'tarjeta') r.tarjeta++;
        else if (p === 'bizum') r.bizum++;
        else if (p === 'mano') r.mano++;
        else r.sin++;
      }
    }
    return r;
  }, [clasesDetalle]);

  // Desglose de pagos de UNA clase, en texto (plain = sin emojis, para CSV/PDF)
  const pagosDeClase = (c, plain = false) => {
    const r = { tarjeta: 0, bizum: 0, mano: 0, sin: 0 };
    for (let i = 0; i < c.personas; i++) {
      const p = c.pagos[i];
      if (r[p] !== undefined) r[p]++;
      else r.sin++;
    }
    const E = plain
      ? { tarjeta: '', bizum: '', mano: '', sin: '' }
      : { tarjeta: '💳 ', bizum: '📱 ', mano: '💶 ', sin: '⚪ ' };
    const parts = [];
    if (r.tarjeta) parts.push(`${E.tarjeta}${r.tarjeta} tarjeta`);
    if (r.bizum) parts.push(`${E.bizum}${r.bizum} bizum`);
    if (r.mano) parts.push(`${E.mano}${r.mano} en mano`);
    if (r.sin) parts.push(`${E.sin}${r.sin} sin marcar`);
    return parts.join(' · ');
  };

  // ── Exportar Excel (CSV con ; — abre directo en Excel español) ──
  // SOLO ingresos: las horas/fichajes no se exportan (a cero por petición).
  const exportCsv = () => {
    const nombreMes = `${MESES[month].toLowerCase()}-${year}`;
    const eur = (n) => n.toFixed(2).replace('.', ',');
    const lineas = [
      `INGRESOS DE CLASES ${MESES[month].toUpperCase()} ${year};Fecha;Clases;Importe;Pagos de los alumnos`,
      ...[...ingresosPorDia].reverse().map(d =>
        `;${d.date};${d.clases.length};${eur(d.total)};${d.clases.map(c => `${c.time_slot} ${eur(c.precio)} (${pagosDeClase(c, true)})`).join(' | ')}`),
      `TOTAL;;${clasesDetalle.length};${eur(totalIngresos)} EUR;tarjeta ${pagosResumen.tarjeta} · bizum ${pagosResumen.bizum} · en mano ${pagosResumen.mano} · sin marcar ${pagosResumen.sin}`,
    ];
    const csv = '﻿' + lineas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ingresos-clases-${nombreMes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Exportar PDF (solo ingresos de clases) ──
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
    doc.text(`Ingresos de clases — ${MESES[month]} ${year}`, 14, 24);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(200, 215, 235);
    doc.text('Clases confirmadas por el monitor · por día y total del mes', 14, 30);

    // Cajas de resumen: total del mes + cómo pagaron los alumnos
    let y = 46;
    doc.setFillColor(250, 245, 255);
    doc.setDrawColor(216, 180, 254);
    doc.roundedRect(12, y - 5, 90, 26, 2.5, 2.5, 'FD');
    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
    doc.text('INGRESOS DEL MES', 17, y + 1);
    doc.setFontSize(16); doc.setTextColor(126, 34, 206);
    doc.text(`${totalIngresos.toFixed(2)} €`, 17, y + 10);
    doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(`${clasesDetalle.length} ${clasesDetalle.length === 1 ? 'clase confirmada' : 'clases confirmadas'}`, 17, y + 16.5);

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.roundedRect(108, y - 5, 90, 26, 2.5, 2.5, 'FD');
    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
    doc.text('CÓMO PAGARON LOS ALUMNOS', 113, y + 1);
    doc.setFontSize(11); doc.setTextColor(30, 64, 175);
    doc.text(`tarjeta ${pagosResumen.tarjeta} · bizum ${pagosResumen.bizum} · en mano ${pagosResumen.mano}`, 113, y + 10);
    doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(pagosResumen.sin > 0 ? `${pagosResumen.sin} sin marcar por el monitor` : 'Todos los pagos marcados', 113, y + 16.5);
    y += 34;

    // ── Ingresos POR DÍA (mismo desglose que el panel) ──
    if (ingresosPorDia.length > 0) {
      doc.setFillColor(...NAVY);
      doc.roundedRect(12, y - 5.5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
      doc.text('INGRESOS DE CLASES POR DÍA', 15, y);
      doc.text('IMPORTE', 194, y, { align: 'right' });
      y += 9;
      for (const d of [...ingresosPorDia].reverse()) {
        if (y > 268) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
        doc.text(`${fechaLarga(d.date)}  ·  ${d.clases.length} ${d.clases.length === 1 ? 'clase' : 'clases'}`, 15, y);
        doc.setTextColor(126, 34, 206);
        doc.text(`${d.total.toFixed(2)} €`, 194, y, { align: 'right' });
        y += 5.6;
        doc.setFont(undefined, 'normal'); doc.setFontSize(7.8);
        for (const c of d.clases) {
          if (y > 272) { doc.addPage(); y = 20; }
          doc.setTextColor(...MUTED);
          doc.text(`${c.time_slot} · ${courtNames[c.court_id] || 'Pista'} · ${c.personas} pers. · ${pagosDeClase(c, true) || 'pagos sin marcar'}`.slice(0, 95), 19, y);
          doc.setTextColor(71, 85, 105);
          doc.text(`${c.precio.toFixed(2)} €`, 194, y, { align: 'right' });
          y += 5;
        }
        y += 2.5;
      }
      if (y > 266) { doc.addPage(); y = 20; }
      doc.setFillColor(250, 245, 255);
      doc.roundedRect(12, y - 5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(107, 33, 168);
      doc.text(`TOTAL DEL MES · ${clasesDetalle.length} clases`, 15, y + 0.5);
      doc.text(`${totalIngresos.toFixed(2)} €`, 194, y + 0.5, { align: 'right' });
    } else {
      doc.setFontSize(10); doc.setTextColor(...MUTED);
      doc.text('Sin clases confirmadas este mes.', 14, y + 2);
    }

    // Pie
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text('Solo cuentan las clases confirmadas por el monitor; cada una entra por su precio.', 14, 285);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
    doc.save(`ingresos-clases-${MESES[month].toLowerCase()}-${year}.pdf`);
  };

  const esteMes = year === now.getFullYear() && month === now.getMonth();
  const hayDatos = clasesDetalle.length > 0;

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Control horario · Ingresos de las clases</p>

      {/* Precios de clase del monitor (los fija él; aquí solo se ven) */}
      {Object.entries(tarifasMonitor).length > 0 && (
        <div style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '0.85rem 1.1rem', marginBottom: '1.25rem' }}>
          {Object.entries(tarifasMonitor).map(([uid, t]) => (
            <div key={uid} style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
              🎾 Precios de clase de <strong>{names[uid] || 'monitor'}</strong> (los fija él en su pantalla):
              {' '}Ind {fmtEur(t.individual)} · G2 {fmtEur(t.grupo2)} · G3 {fmtEur(t.grupo3)} · G4 {fmtEur(t.grupo4)} <strong>por clase</strong>
            </div>
          ))}
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: '#94A3B8' }}>
            El sueldo del trabajador es fijo — aquí se ven los ingresos de sus clases.
            <strong> Solo cuentan las clases que el monitor confirma</strong> al acabar el día, cada una por su precio
            (el que él ponga a esa clase, o su tarifa del grupo si no lo cambia).
          </p>
        </div>
      )}

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
          <button onClick={exportPdf} disabled={!hayDatos} style={{ ...exportBtn, opacity: hayDatos ? 1 : 0.4 }}>📄 PDF</button>
          <button onClick={exportCsv} disabled={!hayDatos} style={{ ...exportBtn, opacity: hayDatos ? 1 : 0.4 }}>📊 Excel</button>
        </div>
      </div>

      {/* ── INGRESOS DE LAS CLASES: total del mes, cómo pagaron y día a día ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando clases…</div>
      ) : (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
            <div style={{ background: '#FAF5FF', border: '1.5px solid #D8B4FE', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7E22CE', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💰 Ingresos de clases · {MESES[month]}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#6B21A8', marginTop: '0.15rem' }}>{fmtEur(totalIngresos)}</div>
              <div style={{ fontSize: '0.7rem', color: '#9333EA', fontWeight: 700, marginTop: '0.2rem' }}>
                {clasesDetalle.length} {clasesDetalle.length === 1 ? 'clase confirmada' : 'clases confirmadas'} por el monitor
              </div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>👥 Cómo pagaron los alumnos</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#1E40AF', marginTop: '0.35rem' }}>
                💳 {pagosResumen.tarjeta} tarjeta · 📱 {pagosResumen.bizum} bizum · 💶 {pagosResumen.mano} en mano
              </div>
              <div style={{ fontSize: '0.7rem', color: pagosResumen.sin > 0 ? '#B45309' : '#2563EB', fontWeight: 700, marginTop: '0.2rem' }}>
                {pagosResumen.sin > 0 ? `⚪ ${pagosResumen.sin} sin marcar por el monitor` : 'Todos los pagos marcados ✓'}
              </div>
            </div>
          </div>

          {/* Ingresos POR DÍA, con cada clase y sus pagos dentro */}
          {ingresosPorDia.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1rem', fontSize: '0.85rem' }}>
              Sin clases confirmadas este mes — los ingresos aparecen cuando el monitor confirma sus clases.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {ingresosPorDia.map(d => (
                <div key={d.date} style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.95rem', padding: '0.8rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem', textTransform: 'capitalize' }}>{fechaLarga(d.date)}</span>
                    <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
                      {d.clases.length} {d.clases.length === 1 ? 'clase' : 'clases'} · <strong style={{ color: '#6B21A8', fontSize: '0.95rem' }}>{fmtEur(d.total)}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: '1px dashed #F1F5F9' }}>
                    {d.clases.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                        <span style={{ color: '#0F172A', fontWeight: 700 }}>
                          🎾 {c.time_slot} · {courtNames[c.court_id] || 'Pista'} · {c.personas} {c.personas === 1 ? 'persona' : 'personas'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748B', fontWeight: 600, fontSize: '0.72rem' }}>{pagosDeClase(c)}</span>
                          <strong style={{ color: '#6B21A8' }}>{fmtEur(c.precio)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const navBtn = { width: 40, height: 40, borderRadius: '0.6rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', fontSize: '1.3rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 };
const exportBtn = { padding: '0.6rem 1rem', borderRadius: '0.7rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' };
