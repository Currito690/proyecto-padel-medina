import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

const HOURS = [
  '00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'
];

const fmtDateLabel = (d) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

const getActiveDates = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const result = [];
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    result.push(fmtDateLabel(d));
  return result;
};

const fmtDateDisplay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

const fmtDayHeader = (label, startDate) => {
  const [dd, mm] = label.split('/').map(Number);
  const year = startDate ? new Date(startDate + 'T12:00:00').getFullYear() : new Date().getFullYear();
  const d = new Date(year, mm - 1, dd);
  return `${d.toLocaleDateString('es-ES', { weekday: 'short' })} ${label}`;
};

export default function TournamentRegistration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [cat, setCat] = useState('');
  const [p1Name, setP1Name] = useState('');
  const [p1Email, setP1Email] = useState('');
  const [p1Phone, setP1Phone] = useState('');
  const [p1Size, setP1Size] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p2Email, setP2Email] = useState('');
  const [p2Phone, setP2Phone] = useState('');
  const [p2Size, setP2Size] = useState('');

  // Dual category
  const [cat2, setCat2] = useState('');
  const [dualCategory, setDualCategory] = useState(false);

  // Grid unavailability state
  const [gridBlockedSlots, setGridBlockedSlots] = useState(new Set());
  const [gridDragging, setGridDragging] = useState(false);
  const [gridDragAction, setGridDragAction] = useState(null);

  useEffect(() => {
    const fetchTournament = async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        setError('Este torneo no existe o ya ha cerrado inscripciones.');
      } else {
        // If bracket is published, redirect to bracket view
        if (data.config?.rounds && Object.keys(data.config.rounds).length > 0) {
          navigate(`/torneos/${id}/cuadro`, { replace: true });
          return;
        }
        // If tournament is not open for registration
        if (data.status !== 'open') {
          setError('Este torneo no existe o ya ha cerrado inscripciones.');
          setLoading(false);
          return;
        }
        setTournament(data);
        const categories = data.config?.categories?.split(',').map(c => c.trim()).filter(Boolean) || [];
        setCat(categories[0] || '');
      }
      setLoading(false);
    };
    fetchTournament();
  }, [id]);

  const activeDays = tournament
    ? getActiveDates(tournament.config.startDate, tournament.config.endDate)
    : [];

  const deadlinePassed = (() => {
    if (!tournament?.config?.registrationDeadline) return false;
    return new Date() > new Date(tournament.config.registrationDeadline + 'T23:59:59');
  })();

  const getHoursForDay = (day) => {
    if (!tournament) return HOURS;
    const cfg = tournament.config;
    const isFirst = day === activeDays[0];
    const startH = isFirst && cfg.firstDayStartHour ? cfg.firstDayStartHour : cfg.startHour;
    const sIdx = HOURS.indexOf(startH);
    const eIdx = HOURS.indexOf(cfg.endHour);
    if (sIdx < 0 || eIdx < 0) return HOURS;
    return HOURS.slice(sIdx, eIdx + 1);
  };

  const allGridHours = (() => {
    if (!activeDays.length) return [];
    let minIdx = HOURS.length;
    let maxIdx = 0;
    activeDays.forEach(day => {
      const hrs = getHoursForDay(day);
      if (hrs.length) {
        minIdx = Math.min(minIdx, HOURS.indexOf(hrs[0]));
        maxIdx = Math.max(maxIdx, HOURS.indexOf(hrs[hrs.length - 1]));
      }
    });
    return minIdx >= HOURS.length ? [] : HOURS.slice(minIdx, maxIdx + 1);
  })();

  const hoursToRanges = (hours) => {
    const ranges = [];
    let i = 0;
    while (i < hours.length) {
      let j = i;
      while (j + 1 < hours.length && HOURS.indexOf(hours[j + 1]) === HOURS.indexOf(hours[j]) + 1) j++;
      const endIdx = HOURS.indexOf(hours[j]);
      const endH = endIdx < HOURS.length - 1 ? HOURS[endIdx + 1] : hours[j];
      ranges.push(`${hours[i]}-${endH}`);
      i = j + 1;
    }
    return ranges;
  };

  const handleCellMouseDown = (day, hour) => {
    const key = `${day} ${hour}`;
    const action = gridBlockedSlots.has(key) ? 'unblock' : 'block';
    setGridDragAction(action);
    setGridDragging(true);
    setGridBlockedSlots(prev => {
      const next = new Set(prev);
      if (action === 'block') next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleCellMouseEnter = (day, hour) => {
    if (!gridDragging) return;
    const key = `${day} ${hour}`;
    setGridBlockedSlots(prev => {
      const next = new Set(prev);
      if (gridDragAction === 'block') next.add(key); else next.delete(key);
      return next;
    });
  };

  const giftIsShirt = tournament?.config?.gift === 'shirt';
  const feeEnabled = !!tournament?.config?.registrationFeeEnabled;
  const feeRequired = tournament?.config?.registrationFeeRequired !== false;
  const feeAmount = parseFloat(tournament?.config?.registrationFeeAmount || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!p1Name || !p2Name || !cat) {
      alert('Introduce el nombre de ambos jugadores y la categoría.');
      return;
    }
    if (!p1Phone || !p2Phone) {
      alert('El teléfono de ambos jugadores es obligatorio.');
      return;
    }
    if (giftIsShirt && (!p1Size || !p2Size)) {
      alert('Indica la talla de camiseta de cada jugador.');
      return;
    }
    setLoading(true);

    // Convert grid to unavailable_times array
    const byDay = {};
    activeDays.forEach(day => {
      const blocked = getHoursForDay(day).filter(h => gridBlockedSlots.has(`${day} ${h}`));
      if (blocked.length > 0) byDay[day] = blocked;
    });
    const unavailableTimes = Object.entries(byDay).map(([day, hours]) => ({
      id: `${day}-${Date.now()}`,
      day,
      label: `${day}: ${hoursToRanges(hours).join(', ')}`,
      slots: hours.map(h => `${day} ${h}`),
    }));

    const paymentStatus = feeEnabled && feeAmount > 0 ? 'pending' : 'not_required';
    const totalFee = feeEnabled && feeAmount > 0 ? feeAmount * 2 : 0; // por pareja = 2 jugadores

    // Generamos el UUID en el cliente para no necesitar SELECT después del
    // INSERT (los clientes no-admin no tienen policy SELECT sobre la tabla).
    const registrationId = (crypto.randomUUID && crypto.randomUUID())
      || `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const { error: insError } = await supabase
      .from('tournament_registrations')
      .insert({
        id: registrationId,
        tournament_id: id,
        category: dualCategory && cat2 && cat2 !== cat ? `${cat} + ${cat2}` : cat,
        player1_name: p1Name,
        player1_email: p1Email,
        player1_phone: p1Phone,
        player2_name: p2Name,
        player2_email: p2Email,
        player2_phone: p2Phone,
        unavailable_times: unavailableTimes,
        player1_shirt_size: giftIsShirt ? (p1Size || null) : null,
        player2_shirt_size: giftIsShirt ? (p2Size || null) : null,
        payment_status: paymentStatus,
        amount_paid: null,
      });

    if (insError) {
      alert('Hubo un error al registrarte. Vuelve a intentarlo.');
      console.error(insError);
      setLoading(false);
      return;
    }

    // Si hay cuota online y es obligatoria, redirigir a Redsys.
    // Si es opcional, mostrar success con un botón "Pagar ahora" más adelante.
    if (totalFee > 0 && feeRequired) {
      try {
        await redirectToRedsys(registrationId, totalFee);
        return; // el navegador navegará al TPV
      } catch (e) {
        console.error('Error iniciando pago:', e);
        alert('No se pudo conectar con la pasarela de pago. Tu inscripción quedó como pendiente; el club te indicará cómo pagar.');
        setSuccess(true);
        setLoading(false);
        return;
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  const redirectToRedsys = async (registrationId, amount) => {
    const redirectFn = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-redirect`;
    const successUrl = `${redirectFn}?to=${encodeURIComponent(`${window.location.origin}/torneos/${id}?inscripcion=ok`)}`;
    const failUrl    = `${redirectFn}?to=${encodeURIComponent(`${window.location.origin}/torneos/${id}?inscripcion=fallo`)}`;
    const notifyUrl  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-notify`;

    const res = await supabase.functions.invoke('redsys-create', {
      body: {
        kind: 'tournament',
        registrationId,
        tournamentName: tournament?.name || 'Torneo',
        amount,
        successUrl,
        failUrl,
        notifyUrl,
        paymentMethod: 'card',
      },
    });
    if (res.error || !res.data || res.data.error) {
      throw new Error(res.error?.message || res.data?.error || 'Pasarela no disponible');
    }
    const data = res.data;

    // Crear formulario y postearlo a Redsys
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.redsysUrl;
    [
      ['Ds_SignatureVersion', 'HMAC_SHA256_V1'],
      ['Ds_MerchantParameters', data.Ds_MerchantParameters],
      ['Ds_Signature', data.Ds_Signature],
    ].forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#0F172A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>😢</span>
          <h1 style={{ margin: '0 0 1rem', fontSize: '1.5rem', fontWeight: 800 }}>Ups...</h1>
          <p style={{ color: '#64748B' }}>{error}</p>
          <button onClick={() => navigate('/')} style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#0F172A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            Volver a Padel Medina
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' }}>
        <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: '#DCFCE7', color: '#16A34A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2rem' }}>✓</div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 900, color: '#0F172A' }}>¡Inscripción Confirmada!</h1>
          <p style={{ color: '#475569', marginBottom: '2rem', lineHeight: '1.5' }}>
            Nos vemos en la pista. El club se pondrá en contacto contigo para los horarios del cuadro.
          </p>
          <button onClick={() => navigate('/')} style={{ width: '100%', padding: '0.875rem', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
            Ir a Padel Medina
          </button>
        </div>
      </div>
    );
  }

  const categories = tournament.config.categories.split(',').map(c => c.trim()).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: 'clamp(1rem, 4vw, 2rem) 1rem' }} onMouseUp={() => setGridDragging(false)}>
      <style>{`@media (max-width: 480px) { .treg-main { padding: 1.25rem !important; border-radius: 1rem !important; } .treg-title { font-size: 1.5rem !important; } }`}</style>
      <div style={{ maxWidth: '640px', margin: '0 auto 0.75rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#1B3A6E', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', padding: 0, transition: 'opacity 0.15s' }}
          onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
          onMouseOut={e => e.currentTarget.style.opacity = '1'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Volver
        </button>
      </div>
      <main className="treg-main" style={{ maxWidth: '640px', margin: '0 auto', backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>

        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: deadlinePassed ? '#FEE2E2' : '#EFF6FF', color: deadlinePassed ? '#DC2626' : '#2563EB', fontWeight: 800, borderRadius: '2rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            {deadlinePassed ? 'Inscripción Cerrada' : 'Inscripción Abierta'}
          </div>
          <h1 className="treg-title" style={{ margin: '0 0 0.5rem', fontSize: '2rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em' }}>
            {tournament.name}
          </h1>
          {tournament.config.startDate && tournament.config.endDate && (
            <p style={{ margin: '0.25rem 0 0', color: '#475569', fontWeight: 700, fontSize: '0.95rem' }}>
              {fmtDateDisplay(tournament.config.startDate)} — {fmtDateDisplay(tournament.config.endDate)}
            </p>
          )}
          {tournament.config.registrationDeadline && (
            <p style={{ margin: '0.5rem 0 0', color: deadlinePassed ? '#DC2626' : '#92400E', fontWeight: 600, fontSize: '0.82rem', backgroundColor: deadlinePassed ? '#FEE2E2' : '#FFFBEB', display: 'inline-block', padding: '0.3rem 0.75rem', borderRadius: '2rem' }}>
              Plazo: {fmtDateDisplay(tournament.config.registrationDeadline)}{deadlinePassed ? ' · CERRADO' : ''}
            </p>
          )}
          {!deadlinePassed && (
            <p style={{ margin: '0.75rem 0 0', color: '#64748B', fontWeight: 500 }}>
              Rellena los datos de tu pareja para apuntaros al torneo.
            </p>
          )}
        </div>

        {deadlinePassed && (
          <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#FEF2F2', borderRadius: '1rem', border: '1px solid #FECACA', marginBottom: '1rem' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#DC2626' }}>El plazo de inscripción ha finalizado.</p>
            <p style={{ margin: '0.5rem 0 0', color: '#7F1D1D', fontSize: '0.9rem' }}>Contacta con el club en padelmedina@hotmail.com para más información.</p>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: deadlinePassed ? 'none' : 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* 1 — Categoría */}
          <section>
            <h2 style={stepStyle}>
              <Num>1</Num> Categoría
            </h2>
            <select value={cat} onChange={e => { setCat(e.target.value); setCat2(''); }} style={selectStyle} required>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {categories.length > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.75rem', cursor: 'pointer', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>
                <input type="checkbox" checked={dualCategory} onChange={e => { setDualCategory(e.target.checked); if (!e.target.checked) setCat2(''); }} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#F97316' }} />
                ¿Participáis también en otra categoría?
              </label>
            )}
            {dualCategory && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: '#92400E', fontWeight: 600 }}>Segunda categoría:</p>
                <select value={cat2} onChange={e => setCat2(e.target.value)} style={selectStyle} required={dualCategory}>
                  <option value="">-- Selecciona --</option>
                  {categories.filter(c => c !== cat).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </section>

          {/* 2 — Jugadores */}
          <section>
            <h2 style={stepStyle}>
              <Num>2</Num> Jugadores
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Jugador 1 */}
              <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jugador 1</p>
                <input type="text" required placeholder="Nombre completo" value={p1Name} onChange={e => setP1Name(e.target.value)} style={inputStyle} />
                <input type="email" placeholder="Correo (opcional)" value={p1Email} onChange={e => setP1Email(e.target.value)} style={inputStyle} />
                <input type="tel" required placeholder="Teléfono *" value={p1Phone} onChange={e => setP1Phone(e.target.value)} style={inputStyle} />
                {giftIsShirt && (
                  <select required value={p1Size} onChange={e => setP1Size(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: '#F0F9FF' }}>
                    <option value="">Talla camiseta *</option>
                    {['XS','S','M','L','XL','XXL'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              {/* Jugador 2 */}
              <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jugador 2</p>
                <input type="text" required placeholder="Nombre completo" value={p2Name} onChange={e => setP2Name(e.target.value)} style={inputStyle} />
                <input type="email" placeholder="Correo (opcional)" value={p2Email} onChange={e => setP2Email(e.target.value)} style={inputStyle} />
                <input type="tel" required placeholder="Teléfono *" value={p2Phone} onChange={e => setP2Phone(e.target.value)} style={inputStyle} />
                {giftIsShirt && (
                  <select required value={p2Size} onChange={e => setP2Size(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: '#F0F9FF' }}>
                    <option value="">Talla camiseta *</option>
                    {['XS','S','M','L','XL','XXL'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </div>
            {giftIsShirt && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#0369A1', fontWeight: 600 }}>
                🎁 Este torneo regala camiseta a los inscritos. Indica la talla de cada jugador.
              </p>
            )}
            {feeEnabled && feeAmount > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', backgroundColor: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803D', fontWeight: 800 }}>
                  💳 Cuota de inscripción
                </p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#166534', lineHeight: 1.5 }}>
                  {feeAmount.toFixed(2).replace('.', ',')} € por jugador · <strong>{(feeAmount * 2).toFixed(2).replace('.', ',')} € por pareja</strong>
                </p>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.74rem', color: '#166534', lineHeight: 1.4 }}>
                  {feeRequired
                    ? 'Al pulsar "Inscribirse" se abrirá la pasarela de pago segura para abonar la cuota. Si el pago falla, podrás reintentar desde el listado del club.'
                    : 'El pago es opcional. Tu inscripción quedará como pendiente y podrás pagar en el club.'}
                </p>
              </div>
            )}
          </section>

          {/* 3 — Horarios no disponibles */}
          <section>
            <h2 style={stepStyle}>
              <Num>3</Num> Preferencias horarias
            </h2>

            {/* Warning */}
            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400E', lineHeight: 1.5 }}>
                Selecciona las celdas en las que la pareja <strong>NO PUEDE JUGAR</strong>. Puedes pulsar y arrastrar para marcar varias horas a la vez.
              </p>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: '#FED7AA', border: '1px solid #F97316' }} />
                No puede jugar
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: '#DCFCE7', border: '1px solid #86EFAC' }} />
                Disponible
              </div>
            </div>

            {/* Grid */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', userSelect: 'none' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '0.5rem 0.6rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '48px' }}>Hora</th>
                    {activeDays.map(day => (
                      <th key={day} style={{ padding: '0.5rem 0.4rem', color: '#0F172A', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap', minWidth: '72px' }}>
                        {fmtDayHeader(day, tournament.config.startDate)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allGridHours.map((hour, hIdx) => (
                    <tr key={hour} style={{ backgroundColor: hIdx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                      <td style={{ padding: '0.15rem 0.6rem', color: '#64748B', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{hour}</td>
                      {activeDays.map(day => {
                        const isValid = getHoursForDay(day).includes(hour);
                        const isBlocked = gridBlockedSlots.has(`${day} ${hour}`);
                        return (
                          <td key={day} style={{ padding: '0.15rem 0.3rem', borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #E2E8F0' }}>
                            <div
                              onMouseDown={isValid ? () => handleCellMouseDown(day, hour) : undefined}
                              onMouseEnter={isValid ? () => handleCellMouseEnter(day, hour) : undefined}
                              style={{
                                height: '24px',
                                borderRadius: '4px',
                                cursor: isValid ? 'pointer' : 'default',
                                backgroundColor: !isValid ? '#F1F5F9' : isBlocked ? '#FED7AA' : '#DCFCE7',
                                border: `1px solid ${!isValid ? '#E2E8F0' : isBlocked ? '#F97316' : '#86EFAC'}`,
                                transition: 'background-color 0.08s',
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {gridBlockedSlots.size > 0 && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>
                {gridBlockedSlots.size} hora{gridBlockedSlots.size !== 1 ? 's' : ''} marcada{gridBlockedSlots.size !== 1 ? 's' : ''} como no disponible
              </p>
            )}
          </section>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '1rem', borderRadius: '1rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 800, fontSize: '1.1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Procesando...' : 'Inscribirse al Torneo'}
          </button>
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8', margin: '0.5rem 0 0' }}>
            Al inscribirte aceptas nuestra{' '}
            <Link to="/privacidad" style={{ color: '#64748B', textDecoration: 'underline' }}>Política de Privacidad</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

// Small helpers for consistent styling
const Num = ({ children }) => (
  <span style={{ width: '24px', height: '24px', backgroundColor: '#0F172A', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
    {children}
  </span>
);

const stepStyle = { margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' };
const inputStyle = { padding: '0.7rem 0.875rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', width: '100%', boxSizing: 'border-box', fontSize: '0.9rem' };
const selectStyle = { width: '100%', padding: '1rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', outline: 'none', backgroundColor: '#F8FAFC', cursor: 'pointer' };
