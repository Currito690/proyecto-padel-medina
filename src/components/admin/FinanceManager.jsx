import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';

const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'year', label: 'Este año' },
  { key: 'custom', label: 'Personalizado' },
];

const KPI = ({ label, value, sub, color = '#0F172A', bg = 'white', border = '#E2E8F0' }) => (
  <div style={{ backgroundColor: bg, padding: '1.25rem 1.5rem', borderRadius: '1rem', border: `1px solid ${border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
    <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{value}</p>
    {sub && <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>{sub}</p>}
  </div>
);

const LineChart = ({ data }) => {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return null;
  const VW = 600;
  const chartH = 130;
  const padL = 4;
  const padR = 8;
  const innerW = VW - padL - padR;
  const max = Math.max(...data.map(d => d.amount), 1);
  const labelEvery = data.length <= 14 ? 1 : data.length <= 31 ? 3 : 7;

  const px = (i) => padL + (i / (data.length - 1 || 1)) * innerW;
  const py = (v) => chartH - Math.max(0, (v / max) * (chartH - 10)) - 2;

  const points = data.map((d, i) => `${px(i)},${py(d.amount)}`).join(' ');
  const areaPoints = `${px(0)},${chartH} ${points} ${px(data.length - 1)},${chartH}`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${VW} ${chartH + 28}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ADE80" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4ADE80" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={VW - padR} y1={chartH - f * (chartH - 12)} y2={chartH - f * (chartH - 12)}
            stroke="#F1F5F9" strokeWidth={1} />
        ))}
        {/* Filled area */}
        <polygon points={areaPoints} fill="url(#lineArea)" />
        {/* Line */}
        <polyline points={points} fill="none" stroke="#22C55E" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots + hover zones */}
        {data.map((d, i) => {
          const cx = px(i);
          const cy = py(d.amount);
          const showLabel = i % labelEvery === 0;
          const dateObj = new Date(d.date + 'T12:00:00');
          const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
          const isHovered = tooltip?.i === i;
          return (
            <g key={d.date} onMouseEnter={() => setTooltip({ i, cx, cy, amount: d.amount, date: d.date })}>
              <circle cx={cx} cy={cy} r={isHovered ? 5 : 3}
                fill={isHovered ? '#16A34A' : '#22C55E'} stroke="white" strokeWidth={1.5}
                style={{ transition: 'r 0.1s' }} />
              <rect x={cx - 10} y={0} width={20} height={chartH + 4} fill="transparent" />
              {showLabel && (
                <text x={cx} y={chartH + 18} textAnchor="middle" fontSize={9} fill="#94A3B8" fontWeight="600">
                  {dayLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', top: Math.max(0, tooltip.cy - 36),
          left: Math.min(tooltip.cx + 12, VW - 110),
          backgroundColor: '#0F172A', color: 'white', padding: '0.4rem 0.6rem',
          borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700, pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          {new Date(tooltip.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          <br />{tooltip.amount.toFixed(2)} €
        </div>
      )}
    </div>
  );
};

export default function FinanceManager() {
  const [period, setPeriod] = useState(() => localStorage.getItem('financeTab') || 'month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [courtPrice, setCourtPrice] = useState(18);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    if (period === 'today') {
      const t = fmt(now);
      return { fromDate: t, toDate: t };
    }
    if (period === 'week') {
      const dow = now.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diff);
      return { fromDate: fmt(mon), toDate: fmt(now) };
    }
    if (period === 'month') {
      return { fromDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, toDate: fmt(now) };
    }
    if (period === 'year') {
      return { fromDate: `${now.getFullYear()}-01-01`, toDate: fmt(now) };
    }
    return { fromDate: customFrom, toDate: customTo };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setPage(0);
    Promise.all([
      supabase.from('bookings')
        .select('id, date, time_slot, status, is_free, court_id, courts(name, sport), profiles(name, email)')
        .eq('status', 'confirmed')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })
        .order('time_slot', { ascending: false }),
      supabase.from('site_settings').select('court_price').single(),
    ]).then(([{ data: bData }, { data: sData }]) => {
      setBookings(bData || []);
      if (sData?.court_price) setCourtPrice(parseFloat(sData.court_price));
      setLoading(false);
    });
  }, [fromDate, toDate]);

  const paidBookings = useMemo(() => bookings.filter(b => !b.is_free), [bookings]);
  const freeBookings = useMemo(() => bookings.filter(b => b.is_free), [bookings]);
  const totalRevenue = paidBookings.length * courtPrice;

  // Previous period revenue for comparison
  const prevRevenue = useMemo(() => {
    // We don't have prev period data loaded, skip for now
    return null;
  }, []);

  // Days in range
  const daysInRange = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const ms = new Date(toDate + 'T12:00:00') - new Date(fromDate + 'T12:00:00');
    return Math.round(ms / 86400000) + 1;
  }, [fromDate, toDate]);

  // Chart data: one bar per day
  const chartData = useMemo(() => {
    if (!fromDate || !toDate) return [];
    const map = {};
    paidBookings.forEach(b => { map[b.date] = (map[b.date] || 0) + courtPrice; });
    const days = [];
    const from = new Date(fromDate + 'T12:00:00');
    const to = new Date(toDate + 'T12:00:00');
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const k = fmt(d);
      days.push({ date: k, amount: map[k] || 0 });
    }
    return days;
  }, [paidBookings, fromDate, toDate, courtPrice]);

  // By court
  const byCourt = useMemo(() => {
    const map = {};
    paidBookings.forEach(b => {
      const name = b.courts?.name || 'Desconocida';
      map[name] = (map[name] || 0) + 1;
    });
    const total = paidBookings.length || 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));
  }, [paidBookings]);

  // By time slot
  const bySlot = useMemo(() => {
    const map = {};
    paidBookings.forEach(b => { map[b.time_slot] = (map[b.time_slot] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [paidBookings]);

  // Sorted + filtered table
  const tableRows = useMemo(() => {
    let rows = [...bookings];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(b =>
        b.profiles?.name?.toLowerCase().includes(q) ||
        b.profiles?.email?.toLowerCase().includes(q) ||
        b.courts?.name?.toLowerCase().includes(q) ||
        b.date?.includes(q)
      );
    }
    rows.sort((a, b) => {
      let av = a[sortField] ?? '';
      let bv = b[sortField] ?? '';
      if (sortField === 'player') { av = a.profiles?.name ?? ''; bv = b.profiles?.name ?? ''; }
      if (sortField === 'court') { av = a.courts?.name ?? ''; bv = b.courts?.name ?? ''; }
      if (sortField === 'amount') { av = a.is_free ? 0 : courtPrice; bv = b.is_free ? 0 : courtPrice; }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return rows;
  }, [bookings, search, sortField, sortDir, courtPrice]);

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE);
  const pageRows = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const header = 'Fecha,Hora,Pista,Jugador,Email,Tipo,Importe';
    const rows = tableRows.map(b => [
      b.date, b.time_slot,
      b.courts?.name || '',
      b.profiles?.name || '',
      b.profiles?.email || '',
      b.is_free ? 'Gratuita' : 'De pago',
      b.is_free ? '0.00' : courtPrice.toFixed(2),
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `finanzas_${fromDate}_${toDate}.csv`;
    a.click();
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ color: '#CBD5E1', marginLeft: '0.25rem' }}>↕</span>;
    return <span style={{ color: '#16A34A', marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const thStyle = (field) => ({
    padding: '0.6rem 0.875rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700,
    color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid #E2E8F0', cursor: 'pointer', whiteSpace: 'nowrap',
    userSelect: 'none', backgroundColor: '#F8FAFC',
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 0 3rem' }}>
      <style>{`
        @media (max-width: 480px) {
          .fin-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 0.75rem !important; }
          .fin-split-grid { grid-template-columns: 1fr !important; }
          .fin-table td, .fin-table th { padding: 0.5rem 0.6rem !important; font-size: 0.75rem !important; }
          .fin-search { width: 100% !important; }
          .fin-title { font-size: 1.3rem !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="fin-title" style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Panel Financiero</h1>
          {fromDate && toDate && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B', fontWeight: 500 }}>
              {new Date(fromDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              {fromDate !== toDate && ` — ${new Date(toDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </p>
          )}
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#334155', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => { setPeriod(p.key); localStorage.setItem('financeTab', p.key); }}
            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: '1.5px solid', borderColor: period === p.key ? '#16A34A' : '#E2E8F0', backgroundColor: period === p.key ? '#F0FDF4' : 'white', color: period === p.key ? '#15803D' : '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.875rem', fontWeight: 600 }} />
          <span style={{ color: '#94A3B8', fontWeight: 700 }}>—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.875rem', fontWeight: 600 }} />
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid #E2E8F0', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="fin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <KPI label="Ingresos del período" value={`${totalRevenue.toFixed(2)} €`} sub={`${paidBookings.length} reservas de pago`} color="#16A34A" bg="#F0FDF4" border="#BBF7D0" />
            <KPI label="Reservas totales" value={bookings.length} sub={`${paidBookings.length} de pago · ${freeBookings.length} gratuitas`} color="#0F172A" />
            <KPI label="Ingresos por día" value={daysInRange > 0 ? `${(totalRevenue / daysInRange).toFixed(2)} €` : '—'} sub="media del período" color="#0EA5E9" />
            <KPI label="Precio por pista" value={`${courtPrice.toFixed(2)} €`} sub="tarifa actual" color="#7C3AED" />
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos por día</p>
              <LineChart data={chartData} />
            </div>
          )}

          {/* Desglose por pista + franjas */}
          <div className="fin-split-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* By court */}
            <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', padding: '1.25rem 1.5rem' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por pista</p>
              {byCourt.length === 0 ? <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>Sin datos</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {byCourt.map(({ name, count, pct }) => (
                    <div key={name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>{name}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16A34A' }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#F1F5F9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', backgroundColor: '#4ADE80', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By time slot */}
            <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', padding: '1.25rem 1.5rem' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Franjas más populares</p>
              {bySlot.length === 0 ? <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>Sin datos</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {bySlot.map(([slot, count], i) => {
                    const maxCount = bySlot[0][1] || 1;
                    const pct = Math.round(count / maxCount * 100);
                    const colors = ['#16A34A', '#0EA5E9', '#7C3AED', '#F59E0B', '#EF4444', '#EC4899'];
                    return (
                      <div key={slot}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>{slot}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: colors[i] }}>{count} reservas</span>
                        </div>
                        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#F1F5F9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', backgroundColor: colors[i], transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Transactions table */}
          <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Movimientos · {tableRows.length} registros
              </p>
              <input
                placeholder="Buscar jugador, pista, fecha..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="fin-search" style={{ padding: '0.45rem 0.75rem', border: '1.5px solid #E2E8F0', borderRadius: '0.5rem', fontSize: '0.82rem', width: '220px', outline: 'none' }}
              />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="fin-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {[
                      { field: 'date', label: 'Fecha' },
                      { field: 'time_slot', label: 'Franja' },
                      { field: 'court', label: 'Pista' },
                      { field: 'player', label: 'Jugador' },
                      { field: 'is_free', label: 'Tipo' },
                      { field: 'amount', label: 'Importe' },
                    ].map(({ field, label }) => (
                      <th key={field} style={thStyle(field)} onClick={() => toggleSort(field)}>
                        {label}<SortIcon field={field} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>
                        Sin reservas en este período
                      </td>
                    </tr>
                  ) : pageRows.map((b, i) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                      <td style={{ padding: '0.6rem 0.875rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                        {new Date(b.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem', color: '#475569', whiteSpace: 'nowrap' }}>{b.time_slot}</td>
                      <td style={{ padding: '0.6rem 0.875rem', color: '#475569' }}>{b.courts?.name || '—'}</td>
                      <td style={{ padding: '0.6rem 0.875rem', color: '#0F172A', fontWeight: 600 }}>
                        <div>{b.profiles?.name || '—'}</div>
                        {b.profiles?.email && <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 400 }}>{b.profiles.email}</div>}
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 700,
                          backgroundColor: b.is_free ? '#F1F5F9' : '#DCFCE7',
                          color: b.is_free ? '#64748B' : '#15803D',
                        }}>
                          {b.is_free ? 'Gratuita' : 'De pago'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem', fontWeight: 800, color: b.is_free ? '#94A3B8' : '#16A34A', whiteSpace: 'nowrap' }}>
                        {b.is_free ? '—' : `${courtPrice.toFixed(2)} €`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                  Página {page + 1} de {totalPages}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: page === 0 ? '#CBD5E1' : '#334155', fontWeight: 700, cursor: page === 0 ? 'default' : 'pointer', fontSize: '0.82rem' }}>
                    ← Anterior
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: page === totalPages - 1 ? '#CBD5E1' : '#334155', fontWeight: 700, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: '0.82rem' }}>
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
