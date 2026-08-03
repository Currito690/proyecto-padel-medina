import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';

// CONTROL HORARIO (admin): jornadas del personal a partir de los fichajes de
// entrada/salida. Cada fichaje lleva hora del SERVIDOR y ubicación GPS (si el
// trabajador dio permiso) con enlace al mapa. Registro inmutable.

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
const mapsUrl = (f) => (f && f.lat != null ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : null);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function TimeClockManager() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [fichajes, setFichajes] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const desde = `${year}-${pad(month + 1)}-01T00:00:00`;
      const hasta = new Date(year, month + 1, 1).toISOString();
      const { data } = await supabase
        .from('fichajes')
        .select('id, user_id, tipo, fichado_at, lat, lng, precision_m')
        .gte('fichado_at', desde)
        .lt('fichado_at', hasta)
        .order('fichado_at', { ascending: true });
      const rows = data || [];
      setFichajes(rows);
      const uids = [...new Set(rows.map(f => f.user_id))];
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
        setNames(Object.fromEntries((profs || []).map(p => [p.id, p.name || p.email])));
      }
      setLoading(false);
    })();
  }, [year, month]);

  // Emparejar entrada→salida en jornadas, por trabajador
  const { jornadas, totalMsPorUser } = useMemo(() => {
    const jor = []; // { userId, fecha, entrada, salida, ms, abierta }
    const abiertos = {};
    for (const f of fichajes) {
      if (f.tipo === 'entrada') {
        // si había una entrada sin cerrar, se registra como jornada abierta (olvidó fichar salida)
        if (abiertos[f.user_id]) jor.push({ userId: abiertos[f.user_id].user_id, fecha: ymdDe(abiertos[f.user_id].fichado_at), entrada: abiertos[f.user_id], salida: null, ms: 0, abierta: true });
        abiertos[f.user_id] = f;
      } else if (abiertos[f.user_id]) {
        const ent = abiertos[f.user_id];
        delete abiertos[f.user_id];
        jor.push({ userId: f.user_id, fecha: ymdDe(ent.fichado_at), entrada: ent, salida: f, ms: new Date(f.fichado_at) - new Date(ent.fichado_at) });
      } else {
        // salida sin entrada previa (raro): se muestra suelta
        jor.push({ userId: f.user_id, fecha: ymdDe(f.fichado_at), entrada: null, salida: f, ms: 0 });
      }
    }
    // entradas aún abiertas (trabajando ahora o fichaje olvidado)
    for (const ent of Object.values(abiertos)) {
      jor.push({ userId: ent.user_id, fecha: ymdDe(ent.fichado_at), entrada: ent, salida: null, ms: 0, abierta: true });
    }
    // ordenar por fecha desc, luego hora desc
    jor.sort((a, b) => {
      const ta = new Date((a.entrada || a.salida).fichado_at);
      const tb = new Date((b.entrada || b.salida).fichado_at);
      return tb - ta;
    });
    // total de horas por trabajador
    const tot = {};
    for (const j of jor) tot[j.userId] = (tot[j.userId] || 0) + j.ms;
    return { jornadas: jor, totalMsPorUser: tot };
  }, [fichajes]);

  const esteMes = year === now.getFullYear() && month === now.getMonth();

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Control horario del personal</p>

      {/* Selector de mes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '1.05rem', minWidth: 170, textAlign: 'center' }}>
          {MESES[month]} {year}
        </div>
        <button onClick={() => shiftMonth(1)} disabled={esteMes} style={{ ...navBtn, opacity: esteMes ? 0.35 : 1, cursor: esteMes ? 'not-allowed' : 'pointer' }}>›</button>
      </div>

      {/* Totales por trabajador */}
      {!loading && Object.keys(totalMsPorUser).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {Object.entries(totalMsPorUser).map(([uid, ms]) => (
            <div key={uid} style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{names[uid] || 'Trabajador'}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#166534', marginTop: '0.15rem' }}>{fmtHoras(ms)}</div>
              <div style={{ fontSize: '0.68rem', color: '#16A34A' }}>trabajadas este mes</div>
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
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A' }}>{fmtHoras(j.ms)}</span>
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
                  {ubic ? (
                    <a href={ubic} target="_blank" rel="noopener noreferrer" style={{ ...chip('#EFF6FF', '#BFDBFE', '#1D4ED8'), textDecoration: 'none', cursor: 'pointer' }}>
                      📍 Ver ubicación en el mapa
                    </a>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>📍 sin ubicación</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const navBtn = { width: 40, height: 40, borderRadius: '0.6rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', fontSize: '1.3rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 };
const chip = (bg, border, color) => ({ fontSize: '0.72rem', fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 999, padding: '0.28rem 0.65rem', whiteSpace: 'nowrap' });
