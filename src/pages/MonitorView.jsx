import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

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
        supabase.from('blocked_slots').select('court_id, time_slot, tipo').eq('date', d),
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
        ensure(s.court_id).slots.push({ time: s.time_slot, tipo: s.tipo === 'entreno' ? 'entreno' : 'bloqueo', note: '' });
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
    </div>
  );
}
