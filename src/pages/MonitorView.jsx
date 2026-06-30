import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

// Vista de SOLO LECTURA para el rol 'monitor' (p.ej. lolo). Muestra, por día,
// únicamente las franjas OCUPADAS de cada pista: reservadas, bloqueadas o de
// entreno. Sirve para que el monitor sepa a qué horas hay pista libre o no.

const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatLong(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${d} de ${MONTHS[m - 1]}`;
}

const TIPO_META = {
  reserva: { label: 'Reservada', emoji: '🎾', bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' },
  bloqueo: { label: 'Bloqueada', emoji: '🔒', bg: '#F1F5F9', border: '#CBD5E1', color: '#475569' },
  entreno: { label: 'Entreno', emoji: '🏋️', bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' },
};

export default function MonitorView() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [bk, bl, ct] = await Promise.all([
        supabase.from('bookings').select('court_id, time_slot, observaciones, status').eq('date', d),
        supabase.from('blocked_slots').select('court_id, time_slot, tipo').eq('date', d),
        supabase.from('courts').select('id, name'),
      ]);
      const courtName = Object.fromEntries((ct.data || []).map((c) => [c.id, c.name]));
      const items = [];
      (bk.data || []).forEach((b) => {
        if (b.status === 'cancelled') return;
        items.push({
          time: b.time_slot,
          court: courtName[b.court_id] || 'Pista',
          tipo: 'reserva',
          note: b.observaciones || '',
        });
      });
      (bl.data || []).forEach((s) => {
        items.push({
          time: s.time_slot,
          court: courtName[s.court_id] || 'Pista',
          tipo: s.tipo === 'entreno' ? 'entreno' : 'bloqueo',
          note: '',
        });
      });
      items.sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.court || '').localeCompare(b.court || ''));
      setSlots(items);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const shiftDay = (delta) => {
    const [y, m, d] = date.split('-').map(Number);
    const nd = new Date(y, m - 1, d + delta);
    setDate(toYMD(nd));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Cabecera */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/logo.png" alt="Padel Medina" style={{ height: 30 }} />
          <span style={{ fontWeight: 800, color: '#1B3A6E', fontSize: '1.02rem' }}>Agenda</span>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
          Salir
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', padding: '1.1rem 1rem 2.5rem', boxSizing: 'border-box' }}>
        <p style={{ margin: '0 0 0.9rem', color: '#64748B', fontSize: '0.85rem' }}>
          Hola <strong style={{ color: '#0F172A' }}>{user?.name || 'monitor'}</strong>, estas son las pistas ocupadas del día (reservas, bloqueos y entrenos).
        </p>

        {/* Selector de día */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '0.9rem', padding: '0.6rem 0.75rem', marginBottom: '1.1rem' }}>
          <button onClick={() => shiftDay(-1)} aria-label="Día anterior" style={navBtn}>‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.98rem', textTransform: 'capitalize' }}>{formatLong(date)}</div>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', color: '#94A3B8', fontSize: '0.72rem', fontFamily: 'inherit', textAlign: 'center', marginTop: 2 }}
            />
          </div>
          <button onClick={() => shiftDay(1)} aria-label="Día siguiente" style={navBtn}>›</button>
        </div>

        {/* Lista de franjas ocupadas */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem 0' }}>Cargando…</p>
        ) : slots.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B', background: '#fff', border: '1px dashed #CBD5E1', borderRadius: '0.9rem', padding: '2.25rem 1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>✅</div>
            <p style={{ margin: 0, fontWeight: 700, color: '#0F172A' }}>No hay pistas ocupadas este día</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>Todas las pistas están libres.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {slots.map((s, i) => {
              const meta = TIPO_META[s.tipo] || TIPO_META.bloqueo;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '0.85rem', padding: '0.75rem 0.9rem' }}>
                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem', minWidth: 96, whiteSpace: 'nowrap' }}>{s.time}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>{s.court}</div>
                    {s.note && <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 1 }}>{s.note}</div>}
                  </div>
                  <span style={{ flexShrink: 0, background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color, fontSize: '0.72rem', fontWeight: 800, padding: '0.3rem 0.6rem', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                    {meta.emoji} {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

const navBtn = {
  width: 38, height: 38, borderRadius: '0.7rem', border: '1px solid #E2E8F0', background: '#F8FAFC',
  color: '#1B3A6E', fontSize: '1.3rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
};
