import { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../services/supabase';

// ENTRENOS (admin): toda la información de las clases del monitor, por mes.
//  - Cada día: sus entrenos — los CONFIRMADOS por el monitor (personas, precio
//    y cómo pagó cada alumno) y los previstos AÚN SIN CONFIRMAR (no suman).
//  - Totales del mes: ingresos y pagos de los alumnos.
// Solo suman las clases confirmadas que EXISTEN como entreno en el horario:
// una confirmación suelta que no se refleja en ningún entreno se ignora.

const pad = (n) => String(n).padStart(2, '0');
const fechaLarga = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtEur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const GRUPO_LABEL = { individual: 'Individual', grupo2: 'Grupo 2', grupo3: 'Grupo 3', grupo4: 'Grupo 4' };

export default function EntrenosManager() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [entrenos, setEntrenos] = useState([]); // blocked_slots tipo=entreno del mes
  const [confirmadas, setConfirmadas] = useState([]); // clases_monitor: personas + precio + pagos
  const [courtNames, setCourtNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [tarifasMonitor, setTarifasMonitor] = useState({}); // user_id -> precios de clase

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  useEffect(() => {
    supabase.from('monitor_tarifas').select('*').then(({ data }) => {
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
      const [{ data: eData }, { data: cData }, { data: ctData }] = await Promise.all([
        supabase
          .from('blocked_slots')
          .select('date, time_slot, court_id, entreno_grupo')
          .eq('tipo', 'entreno')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
        supabase
          .from('clases_monitor')
          .select('*')
          .gte('date', primerYmd)
          .lte('date', ultimoYmd),
        supabase.from('courts').select('id, name'),
      ]);
      setEntrenos(eData || []);
      setConfirmadas(cData || []);
      setCourtNames(Object.fromEntries((ctData || []).map(c => [c.id, c.name])));
      setLoading(false);
    })();
  }, [year, month]);

  // Solo cuentan las confirmaciones con SU entreno en el horario (mismo día,
  // pista y hora). Cada clase entra por SU precio: el que el monitor puso a
  // esa clase o, si no puso, su tarifa según el grupo confirmado.
  const entrenoKeys = useMemo(() => new Set(entrenos.map(e => `${e.date}|${e.court_id}|${e.time_slot}`)), [entrenos]);
  const clasesDetalle = useMemo(() => {
    const PERSONAS_GRUPO = { 1: 'individual', 2: 'grupo2', 3: 'grupo3', 4: 'grupo4' };
    return confirmadas
      .filter(c => entrenoKeys.has(`${c.date}|${c.court_id}|${c.time_slot}`))
      .map(c => {
        const gKey = PERSONAS_GRUPO[c.personas] || 'grupo4';
        const precio = c.precio != null ? Number(c.precio) : (tarifasMonitor[c.user_id]?.[gKey] ?? 0);
        return { ...c, gKey, precio, pagos: Array.isArray(c.pagos) ? c.pagos : [] };
      });
  }, [confirmadas, tarifasMonitor, entrenoKeys]);

  // Por día (del más reciente al más antiguo): confirmados + previstos sin confirmar
  const porDia = useMemo(() => {
    const m = {};
    for (const c of clasesDetalle) (m[c.date] = m[c.date] || { conf: [], pend: [] }).conf.push(c);
    const confSet = new Set(clasesDetalle.map(c => `${c.date}|${c.court_id}|${c.time_slot}`));
    for (const e of entrenos) {
      if (!confSet.has(`${e.date}|${e.court_id}|${e.time_slot}`)) {
        (m[e.date] = m[e.date] || { conf: [], pend: [] }).pend.push(e);
      }
    }
    return Object.keys(m).sort((a, b) => b.localeCompare(a)).map(d => ({
      date: d,
      conf: m[d].conf.sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
      pend: m[d].pend.sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
      total: m[d].conf.reduce((s, c) => s + c.precio, 0),
    }));
  }, [clasesDetalle, entrenos]);

  const totalIngresos = useMemo(() => clasesDetalle.reduce((s, c) => s + c.precio, 0), [clasesDetalle]);
  const totalPendientes = useMemo(() => porDia.reduce((s, d) => s + d.pend.length, 0), [porDia]);

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
  const exportCsv = () => {
    const nombreMes = `${MESES[month].toLowerCase()}-${year}`;
    const eur = (n) => n.toFixed(2).replace('.', ',');
    const lineas = [
      `ENTRENOS ${MESES[month].toUpperCase()} ${year};Fecha;Confirmados;Sin confirmar;Importe;Detalle`,
      ...[...porDia].reverse().map(d =>
        `;${d.date};${d.conf.length};${d.pend.length};${eur(d.total)};${[
          ...d.conf.map(c => `${c.time_slot} ${eur(c.precio)} (${pagosDeClase(c, true)})`),
          ...d.pend.map(e => `${e.time_slot} SIN CONFIRMAR`),
        ].join(' | ')}`),
      `TOTAL;;${clasesDetalle.length};${totalPendientes};${eur(totalIngresos)} EUR;tarjeta ${pagosResumen.tarjeta} · bizum ${pagosResumen.bizum} · en mano ${pagosResumen.mano} · sin marcar ${pagosResumen.sin}`,
    ];
    const csv = '﻿' + lineas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `entrenos-${nombreMes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Exportar PDF ──
  const exportPdf = () => {
    const doc = new jsPDF();
    const NAVY = [27, 58, 110], GREEN = [22, 163, 74], INK = [15, 23, 42], MUTED = [100, 116, 139];

    doc.setFillColor(...NAVY);
    doc.rect(0, 0, 210, 34, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, 34, 210, 1.6, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('PADEL MEDINA · ADMINISTRACIÓN', 14, 13);
    doc.setFontSize(19);
    doc.text(`Entrenos — ${MESES[month]} ${year}`, 14, 24);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(200, 215, 235);
    doc.text('Clases confirmadas por el monitor · ingresos por día y total del mes', 14, 30);

    let y = 46;
    doc.setFillColor(250, 245, 255);
    doc.setDrawColor(216, 180, 254);
    doc.roundedRect(12, y - 5, 90, 26, 2.5, 2.5, 'FD');
    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
    doc.text('INGRESOS DEL MES', 17, y + 1);
    doc.setFontSize(16); doc.setTextColor(126, 34, 206);
    doc.text(`${totalIngresos.toFixed(2)} €`, 17, y + 10);
    doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(`${clasesDetalle.length} confirmados${totalPendientes ? ` · ${totalPendientes} sin confirmar` : ''}`, 17, y + 16.5);

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

    if (porDia.length > 0) {
      doc.setFillColor(...NAVY);
      doc.roundedRect(12, y - 5.5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
      doc.text('ENTRENOS POR DÍA', 15, y);
      doc.text('IMPORTE', 194, y, { align: 'right' });
      y += 9;
      for (const d of [...porDia].reverse()) {
        if (y > 268) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
        doc.text(`${fechaLarga(d.date)}  ·  ${d.conf.length + d.pend.length} ${d.conf.length + d.pend.length === 1 ? 'entreno' : 'entrenos'}`, 15, y);
        doc.setTextColor(126, 34, 206);
        doc.text(`${d.total.toFixed(2)} €`, 194, y, { align: 'right' });
        y += 5.6;
        doc.setFont(undefined, 'normal'); doc.setFontSize(7.8);
        for (const c of d.conf) {
          if (y > 272) { doc.addPage(); y = 20; }
          doc.setTextColor(...MUTED);
          doc.text(`${c.time_slot} · ${courtNames[c.court_id] || 'Pista'} · ${c.personas} pers. · ${pagosDeClase(c, true) || 'pagos sin marcar'}`.slice(0, 95), 19, y);
          doc.setTextColor(71, 85, 105);
          doc.text(`${c.precio.toFixed(2)} €`, 194, y, { align: 'right' });
          y += 5;
        }
        for (const e of d.pend) {
          if (y > 272) { doc.addPage(); y = 20; }
          doc.setTextColor(180, 83, 9);
          doc.text(`${e.time_slot} · ${courtNames[e.court_id] || 'Pista'} · ${GRUPO_LABEL[e.entreno_grupo] || 'grupo por confirmar'} · SIN CONFIRMAR (no suma)`.slice(0, 95), 19, y);
          y += 5;
        }
        y += 2.5;
      }
      if (y > 266) { doc.addPage(); y = 20; }
      doc.setFillColor(250, 245, 255);
      doc.roundedRect(12, y - 5, 186, 8.5, 1.5, 1.5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(107, 33, 168);
      doc.text(`TOTAL DEL MES · ${clasesDetalle.length} entrenos confirmados`, 15, y + 0.5);
      doc.text(`${totalIngresos.toFixed(2)} €`, 194, y + 0.5, { align: 'right' });
    } else {
      doc.setFontSize(10); doc.setTextColor(...MUTED);
      doc.text('Sin entrenos este mes.', 14, y + 2);
    }

    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text('Solo suman las clases confirmadas por el monitor y que existen como entreno en el horario.', 14, 285);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
    doc.save(`entrenos-${MESES[month].toLowerCase()}-${year}.pdf`);
  };

  const esteMes = year === now.getFullYear() && month === now.getMonth();
  const hayDatos = porDia.length > 0;

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Entrenos del club</p>

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando entrenos…</div>
      ) : (
        <div style={{ marginBottom: '1.5rem' }}>
          {/* Totales del mes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
            <div style={{ background: '#FAF5FF', border: '1.5px solid #D8B4FE', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7E22CE', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💰 Ingresos de entrenos · {MESES[month]}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#6B21A8', marginTop: '0.15rem' }}>{fmtEur(totalIngresos)}</div>
              <div style={{ fontSize: '0.7rem', color: '#9333EA', fontWeight: 700, marginTop: '0.2rem' }}>
                {clasesDetalle.length} {clasesDetalle.length === 1 ? 'entreno confirmado' : 'entrenos confirmados'}
                {totalPendientes > 0 && ` · ⏳ ${totalPendientes} sin confirmar`}
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

          {/* Día a día: confirmados (suman) + previstos sin confirmar (no suman) */}
          {porDia.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1rem', fontSize: '0.85rem' }}>
              Sin entrenos este mes — aparecen al marcarlos en el Horario, y suman cuando el monitor los confirma.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {porDia.map(d => (
                <div key={d.date} style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.95rem', padding: '0.8rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem', textTransform: 'capitalize' }}>{fechaLarga(d.date)}</span>
                    <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
                      {d.conf.length + d.pend.length} {d.conf.length + d.pend.length === 1 ? 'entreno' : 'entrenos'} · <strong style={{ color: '#6B21A8', fontSize: '0.95rem' }}>{fmtEur(d.total)}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: '1px dashed #F1F5F9' }}>
                    {d.conf.map((c, i) => (
                      <div key={`c-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                        <span style={{ color: '#0F172A', fontWeight: 700 }}>
                          🏋️ {c.time_slot} · {courtNames[c.court_id] || 'Pista'} · {c.personas} {c.personas === 1 ? 'persona' : 'personas'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748B', fontWeight: 600, fontSize: '0.72rem' }}>{pagosDeClase(c)}</span>
                          <strong style={{ color: '#6B21A8' }}>{fmtEur(c.precio)}</strong>
                        </span>
                      </div>
                    ))}
                    {d.pend.map((e, i) => (
                      <div key={`p-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                        <span style={{ color: '#B45309', fontWeight: 700 }}>
                          ⏳ {e.time_slot} · {courtNames[e.court_id] || 'Pista'} · {GRUPO_LABEL[e.entreno_grupo] || 'grupo por confirmar'}
                        </span>
                        <span style={{ color: '#B45309', fontWeight: 700, fontSize: '0.7rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 999, padding: '0.15rem 0.5rem' }}>
                          sin confirmar — no suma
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
