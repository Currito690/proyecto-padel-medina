import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { toast, confirmDialog } from '../utils/notify';

const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

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
        </div>

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
