import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import TournamentManager from '../components/admin/TournamentManager';
import EventsManager from '../components/admin/EventsManager';
import FinanceManager from '../components/admin/FinanceManager';
import TimeClockManager from '../components/admin/TimeClockManager';
import EntrenosManager from '../components/admin/EntrenosManager';
import DateSelector from '../components/booking/DateSelector';
import { toast, confirmDialog } from '../utils/notify';
import { serverToday, serverNow } from '../utils/serverTime';
import { DEFAULT_SCHEDULE_CONFIG, normalizeScheduleConfig, buildScheduleTimes, rebuildAvailableTimes, parseSlot, toMin } from '../utils/schedule';
import {
  reservaPagada, resumenPagoReserva, resumenPagoEntreno, agregarClasesMonitor,
  pagoCaducado, estadoFilaReserva, filasPorClase, filasConPagos, metodoTrasPulsar,
  pagosConAlumno, faltaFuncionRpc, crearGuardiaRefresco, conGuardia, REFRESCO_AUTO_MS,
} from '../utils/entrenos';

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

// Cuenta fija a la que pasan las reservas de quien borra su cuenta
// (migración borrado_cuenta_usuario): sale como "Cliente eliminado".
const CLIENTE_ELIMINADO_ID = '00000000-0000-4000-8000-000000000001';

// Colores de la rejilla del HORARIO (solo panel del admin; la agenda del
// monitor tiene los suyos):
//   libre = VERDE · entreno = ROSA (esté cobrado o no) · reserva pagada = AZUL ·
//   reserva sin pagar = ROJO (también el pago en curso, que lleva ⏳) ·
//   bloqueada = GRIS. Fondo suave + borde + texto oscuro del mismo tono.
const slotColors = {
  available: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4', color: '#15803D' }, // libre (verde)
  entreno:   { borderColor: '#DB2777', backgroundColor: '#F472B6', color: '#500724' }, // entreno (rosa INTENSO: el club lo quería bien distinto del rojo claro de "sin pagar")
  pagado:    { borderColor: '#93C5FD', backgroundColor: '#EFF6FF', color: '#1D4ED8' }, // reserva pagada (azul)
  impago:    { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#B91C1C' }, // reserva sin pagar (rojo)
  blocked:   { borderColor: '#CBD5E1', backgroundColor: '#F1F5F9', color: '#475569' }, // bloqueada (gris)
  selected:  { borderColor: '#0F172A', backgroundColor: '#0F172A', color: 'white' },
};

// Color de una celda del Horario según lo que hay en ella.
const colorCelda = (slot) => {
  if (slot?.status === 'booked') return reservaPagada(slot) ? slotColors.pagado : slotColors.impago;
  if (slot?.status === 'blocked') return slot.tipo === 'entreno' ? slotColors.entreno : slotColors.blocked;
  return slotColors.available;
};

// Texto corto de la celda de un entreno (el color ya dice "entreno"; aquí, el cobro).
const etiquetaEntreno = (s) => {
  const r = resumenPagoEntreno(s.entrenoInfo);
  if (!r.confirmado) return '🏋️ Entreno';
  if (r.pagados >= r.personas) return '🏋️ Pagado';
  if (r.pagados === 0) return '🏋️ Sin pagar';
  return `🏋️ ${r.pagados}/${r.personas}`;
};

// Emoji de cada método de pago (reservas y entrenos).
const EMOJI_METODO = { tarjeta: '💳', bizum: '📱', club: '🏪', mano: '💶', manual: '✍️', gratis: '🎾' };

// Etiqueta "Pagada / Sin pagar" con color Y texto (no solo color).
function ChipPago({ pagada, children }) {
  const t = pagada ? slotColors.pagado : slotColors.impago;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 800, color: 'white', background: t.color, borderRadius: 999, padding: '0.25rem 0.65rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// Una línea "Jugador N / Alumno N → método o Sin pagar" (con hueco opcional
// a la derecha para los botones de marcar el pago). En móvil, si no caben al
// lado, los botones bajan a una segunda línea.
function FilaPago({ etiqueta, pagado, texto, metodo, children }) {
  const t = pagado ? slotColors.pagado : slotColors.impago;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem 0.45rem', padding: '0.4rem 0', borderTop: '1px solid #F1F5F9' }}>
      <div style={{ flex: '1 1 7.5rem', minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>{etiqueta}</div>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: t.color, lineHeight: 1.25 }}>
          {pagado ? `✓ ${EMOJI_METODO[metodo] ? EMOJI_METODO[metodo] + ' ' : ''}${texto}` : '✕ Sin pagar'}
        </div>
      </div>
      {children}
    </div>
  );
}

// Botones para marcar cómo pagó un jugador (reservas) o un alumno (entrenos):
// el método marcado va resaltado y volver a pulsarlo lo desmarca. El mismo
// aspecto en los dos sitios. metodos = [[clave, emoji, nombre], …].
// Si la tarjeta de la pista es estrecha, los botones bajan de línea (antes
// se cortaba el último por la derecha).
function BotonesPago({ metodos, actual, busy, quien, onPulsar }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', flexShrink: 0, maxWidth: '100%' }}>
      {metodos.map(([mk, emoji, nombre]) => {
        const on = actual === mk;
        return (
          <button key={mk} disabled={busy} onClick={() => onPulsar(mk)}
            title={on ? `Desmarcar (${nombre})` : `${quien} pagó: ${nombre}`} aria-pressed={on}
            style={{ padding: '0.32rem 0.5rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              border: `1.5px solid ${on ? '#1D4ED8' : '#E2E8F0'}`,
              background: on ? '#1D4ED8' : 'white',
              color: on ? 'white' : '#64748B' }}>
            {emoji} {nombre}
          </button>
        );
      })}
    </div>
  );
}

// Sin guardia de refresco (por si un componente se usa suelto): guarda tal cual.
const sinGuardia = (fn) => fn();

// Gestión del pago compartido por el admin: ver el estado X/4 y marcar pagada la
// parte de un jugador (p.ej. si paga en el club en vez de por su enlace).
// onPaidChange(n) avisa del nuevo split_paid para refrescar el resumen de pago.
// splitPaid: el de la celda del Horario; si cambia (refresco automático: un
// jugador ha pagado por su enlace) se relee la lista sin enseñar "Cargando".
function SplitAdmin({ bookingId, splitPaid, onPaidChange, conGuardado = sinGuardia }) {
  const [tokens, setTokens] = useState([]);
  const [paid, setPaid] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const cargadoRef = useRef(false);

  const load = useCallback(async () => {
    if (!cargadoRef.current) setLoading(true);
    const [{ data: b }, { data: toks }] = await Promise.all([
      supabase.from('bookings').select('split_paid').eq('id', bookingId).single(),
      supabase.from('shared_payment_tokens').select('id, phone, amount, paid').eq('booking_id', bookingId).order('created_at'),
    ]);
    const v = b?.split_paid || 1;
    setPaid(v);
    setTokens(toks || []);
    setLoading(false);
    cargadoRef.current = true;
    return v;
  }, [bookingId]);

  useEffect(() => { if (bookingId) load(); }, [bookingId, load, splitPaid]);

  const bumpPaid = async (delta) => {
    const { data: b } = await supabase.from('bookings').select('split_paid').eq('id', bookingId).single();
    const next = Math.min(4, Math.max(0, (b?.split_paid || 1) + delta));
    await supabase.from('bookings').update({ split_paid: next }).eq('id', bookingId);
  };

  const markToken = async (tok) => {
    setBusy(true);
    await conGuardado(async () => {
      await supabase.from('shared_payment_tokens').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', tok.id);
      await bumpPaid(1);
      onPaidChange?.(await load());
    });
    setBusy(false);
  };

  const markClub = async () => {
    setBusy(true);
    await conGuardado(async () => {
      await bumpPaid(1);
      onPaidChange?.(await load());
    });
    setBusy(false);
  };

  if (loading) return <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: '0.6rem 0 0' }}>Cargando pago compartido…</p>;

  return (
    <div style={{ marginTop: '0.6rem', background: 'white', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.length ? '0.5rem' : 0 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>👥 Pago compartido</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: paid >= 4 ? slotColors.pagado.color : '#B45309', background: paid >= 4 ? slotColors.pagado.backgroundColor : '#FFFBEB', border: `1px solid ${paid >= 4 ? slotColors.pagado.borderColor : '#FDE68A'}`, padding: '0.15rem 0.5rem', borderRadius: 999 }}>
          {paid >= 4 ? '✓ Todo pagado' : `${paid}/4`}
        </span>
      </div>
      {tokens.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', padding: '0.35rem 0', borderTop: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '0.78rem', color: '#0F172A', fontWeight: 600 }}>📱 {t.phone} · {Number(t.amount).toFixed(2).replace('.', ',')}€</span>
          {t.paid ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: slotColors.pagado.color, whiteSpace: 'nowrap' }}>✓ Pagado</span>
          ) : (
            <button onClick={() => markToken(t)} disabled={busy} style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', background: '#1D4ED8', border: 'none', borderRadius: '0.45rem', padding: '0.35rem 0.55rem', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>Marcar pagado</button>
          )}
        </div>
      ))}
      {paid < 4 && (
        <button onClick={markClub} disabled={busy} style={{ marginTop: '0.55rem', width: '100%', fontSize: '0.74rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.5rem', padding: '0.45rem', cursor: busy ? 'wait' : 'pointer' }}>
          🏪 Marcar un pago en el club (+1)
        </button>
      )}
    </div>
  );
}

// Los 4 huecos de pagos_jugadores (null = jugador sin marcar).
const normPagos = (arr) => {
  const a = Array.isArray(arr) ? [...arr] : [];
  while (a.length < 4) a.push(null);
  return a.slice(0, 4);
};

// Campos de pago de una fila de bookings, con la forma de la celda del Horario.
// Lo que no esté 'confirmed' nunca cuenta como pagado (esHold = sin pagar).
const pagoDesdeFila = (b) => ({
  metodo: b.metodo_pago || null,
  isFree: !!b.is_free,
  cobroConfirmado: !!b.cobro_confirmado,
  esHold: b.status !== 'confirmed',
  paymentType: b.payment_type || null,
  splitPaid: b.split_paid,
  pagosJugadores: normPagos(b.pagos_jugadores),
  importe: b.importe ?? null,
});

// PAGO de una reserva, lo primero al pulsarla en el Horario: "Pagada / Sin
// pagar" (color y texto), método, importe y "X de 4 jugadores han pagado" con
// la lista de jugadores. En esa MISMA lista el admin marca cómo pagó cada uno
// (💳 tarjeta / 📱 bizum / 🏪 club, repetir = desmarcar) y debajo está el atajo
// "Marcar pista pagada" (= cobro_confirmado, el mismo check que usa Finanzas).
// En pago compartido, los pagos de cada jugador se marcan SOLO en la gestión
// de los enlaces (SplitAdmin, que sube split_paid).
// onGone: la reserva ya no está viva al releerla (cancelada o pago no
// completado); el padre cierra el panel y recarga la rejilla.
// Lo que se pinta sale SIEMPRE de la celda del Horario (reserva): el padre la
// mantiene al día con lo que se guarda aquí (onSaved) y con el refresco
// automático, así que si el monitor marca un pago con el panel abierto, se ve.
// conGuardado: avisa al refresco automático de que se está guardando.
function PagoReservaAdmin({ reserva, onSaved, onGone, conGuardado = sinGuardia }) {
  const bookingId = reserva.bookingId;
  const datos = {
    metodo: reserva.metodo || null,
    isFree: !!reserva.isFree,
    cobroConfirmado: !!reserva.cobroConfirmado,
    esHold: !!reserva.esHold,
    paymentType: reserva.paymentType || null,
    splitPaid: reserva.splitPaid,
    pagosJugadores: normPagos(reserva.pagosJugadores),
    importe: reserva.importe ?? null,
  };
  const [busy, setBusy] = useState(false);
  const { pagosJugadores: pagos, cobroConfirmado: cobro, isFree, metodo } = datos;

  // Aviso al padre: cambia la celda (color) y, con ella, este panel.
  const actualizar = (patch) => onSaved?.(patch);

  // Todo guardado de este panel (también los del pago compartido) cuenta aquí,
  // para que la lectura de al abrir no pise lo que se marque antes de que llegue.
  const guardadosRef = useRef(0);
  const guardar = (fn) => { guardadosRef.current += 1; return conGuardado(fn); };

  // Releer SIEMPRE de BD al abrir: la celda puede tener hasta un refresco de
  // retraso. Lo leído se pasa al padre: así la celda se pinta con lo de verdad.
  useEffect(() => {
    let alive = true;
    const guardadosAlPedir = guardadosRef.current;
    supabase.from('bookings').select('*').eq('id', bookingId).single().then(({ data }) => {
      if (!alive || !data) return;
      if (guardadosRef.current !== guardadosAlPedir) return; // ya se guardó algo después: vale lo guardado
      // Ya no es una reserva (se canceló, o el pago con el banco falló o
      // caducó mientras la rejilla seguía sin recargar): no se pinta como
      // pago (saldría "Pagada" con el método del intento) ni se pasa a la celda.
      if (data.status !== 'confirmed' && (data.status !== 'pendiente_pago' || pagoCaducado(data))) {
        onGone?.();
        return;
      }
      onSaved?.(pagoDesdeFila(data));
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const marcar = async (idx, metodoPago) => {
    if (busy) return;
    const nuevo = metodoTrasPulsar(pagos[idx], metodoPago); // repetir = desmarcar
    setBusy(true);
    // Con la MISMA función que usa el monitor desde su agenda: cambia SOLO
    // este jugador, con la reserva bloqueada, así no se pisa lo que él haya
    // marcado entretanto (guardar la lista entera de 4 sí lo pisaría).
    const { data, error } = await guardar(async () => {
      const res = await supabase.rpc('monitor_marcar_pago_jugador', { p_booking_id: bookingId, p_idx: idx, p_metodo: nuevo });
      if (!res.error || !faltaFuncionRpc(res.error)) return res;
      // Servidor sin esa función todavía: como antes, guardando la lista entera.
      const lista = pagos.map((m, i) => (i === idx ? nuevo : m));
      const upd = await supabase.from('bookings').update({ pagos_jugadores: lista }).eq('id', bookingId);
      return { data: lista, error: upd.error };
    });
    setBusy(false);
    if (error) {
      toast(/pagos_jugadores/i.test(error.message || '')
        ? 'Falta aplicar la migración bookings_pagos_jugadores en Supabase'
        : 'Error: ' + error.message, 'error');
      return;
    }
    const next = normPagos(Array.isArray(data) ? data : pagos.map((m, i) => (i === idx ? nuevo : m)));
    // Con los 4 pagos marcados, la BD confirma el cobro sola (trigger
    // bookings_autoconfirma_por_pagos) y lo deshace al desmarcar uno:
    // reflejarlo aquí sin tener que reabrir la reserva.
    const antes = pagos.filter(Boolean).length;
    const despues = next.filter(Boolean).length;
    if (despues >= 4 && antes < 4) {
      actualizar({ pagosJugadores: next, cobroConfirmado: true, ...(metodo === 'manual' ? { isFree: false } : {}) });
    } else if (antes >= 4 && despues < 4 && cobro) {
      actualizar({ pagosJugadores: next, cobroConfirmado: false, ...(metodo === 'manual' ? { isFree: true } : {}) });
    } else {
      actualizar({ pagosJugadores: next });
    }
  };

  const togglePagada = async () => {
    if (busy) return;
    const next = !cobro;
    // La MISMA regla que Finanzas (confirmarCobro/deshacerCobro): una reserva
    // manual del admin nace is_free=true y pasa a contar como ingreso al
    // cobrarse; al deshacer vuelve a gratuita. Sin esto, el mismo botón daría
    // cifras distintas según se pulse aquí o en Finanzas.
    const patch = { cobro_confirmado: next, cobrado_at: next ? new Date().toISOString() : null };
    let nextFree = isFree;
    if (metodo === 'manual') {
      if (next && isFree) { patch.is_free = false; nextFree = false; }
      if (!next) { patch.is_free = true; nextFree = true; }
    }
    setBusy(true);
    const { error } = await guardar(() => supabase.from('bookings').update(patch).eq('id', bookingId));
    setBusy(false);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    actualizar({ cobroConfirmado: next, isFree: nextFree });
    toast(next ? '✓ Pista marcada como pagada (también en Finanzas)' : 'Pista marcada como pendiente de cobro', 'success');
  };

  const r = resumenPagoReserva(datos);
  const tono = r.pagada ? slotColors.pagado : slotColors.impago;
  const esSplit = datos.paymentType === 'split';
  const online = metodo === 'tarjeta' || metodo === 'bizum';
  // "Marcar pista pagada" solo donde el cobro se confirma a mano (club, manual,
  // pago compartido…). Lo pagado entero online o de cortesía ya está pagado, y
  // un pago en curso se resuelve solo con el banco.
  const conAtajoPagada = !datos.esHold && metodo !== 'gratis' && (esSplit || !online);
  // Botones por jugador: igual que en la agenda del monitor, no se ofrecen si
  // la pista se pagó entera online o es de cortesía (no hay nada que marcar).
  // Tampoco en pago compartido: ahí cada pago se apunta en SplitAdmin (sube
  // split_paid); con los dos controles el mismo pago se contaba dos veces o
  // ninguna.
  const conBotonesJugador = conAtajoPagada && !esSplit;
  const METODOS_PISTA = [['tarjeta', '💳', 'Tarjeta'], ['bizum', '📱', 'Bizum'], ['club', '🏪', 'Club']];

  return (
    <div style={{ marginBottom: '0.75rem', background: 'white', border: `1.5px solid ${tono.borderColor}`, borderRadius: '0.75rem', overflow: 'hidden' }}>
      {/* Estado (+ importe a la derecha) y, debajo, el método */}
      <div style={{ background: tono.backgroundColor, padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
          <ChipPago pagada={r.pagada}>{r.pagada ? '✓' : r.estado === 'en_curso' ? '⏳' : '✕'} {r.etiqueta}</ChipPago>
          {r.importeTexto && (
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', background: 'white', border: '1px solid #E2E8F0', borderRadius: 999, padding: '0.2rem 0.55rem', whiteSpace: 'nowrap' }}>
              {r.importeTexto}
            </span>
          )}
        </div>
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
          {esSplit ? '👥' : (EMOJI_METODO[metodo] || '💰')} {r.metodoTexto}
        </p>
      </div>

      <div style={{ padding: '0.6rem 0.75rem 0.7rem' }}>
        <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 800, color: tono.color }}>{r.textoPagados}</p>
        {r.nota && <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4 }}>{r.nota}</p>}

        {/* Jugador 1..4: estado + botones para marcar cómo pagó. Un pago en
            curso con el banco no se marca (se resuelve solo) y no se lista;
            en una de cortesía tampoco, salvo que alguien esté marcado. */}
        {!datos.esHold && !(r.nadaQueCobrar && !pagos.some(Boolean)) && (
          <div style={{ marginTop: '0.45rem' }}>
            {r.jugadores.map((j, i) => (
              <FilaPago key={j.n} etiqueta={`👤 Jugador ${j.n}`} pagado={j.estado !== 'sin_pagar'} texto={j.texto} metodo={j.metodo}>
                {conBotonesJugador && (
                  <BotonesPago metodos={METODOS_PISTA} actual={pagos[i]} busy={busy} quien={`Jugador ${j.n}`} onPulsar={(mk) => marcar(i, mk)} />
                )}
              </FilaPago>
            ))}
          </div>
        )}

        {conAtajoPagada && (
          <button onClick={togglePagada} disabled={busy}
            style={{ marginTop: '0.55rem', width: '100%', fontSize: '0.76rem', fontWeight: 800, padding: '0.5rem 0.7rem', borderRadius: '0.6rem', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${cobro ? '#1D4ED8' : '#CBD5E1'}`, background: cobro ? '#1D4ED8' : 'white', color: cobro ? 'white' : '#475569' }}>
            {cobro ? '✓ Pista pagada · pulsa para deshacer' : 'Marcar pista pagada'}
          </button>
        )}

        {esSplit && !datos.esHold && (
          <SplitAdmin bookingId={bookingId} splitPaid={datos.splitPaid} conGuardado={guardar} onPaidChange={(n) => actualizar({ splitPaid: n })} />
        )}
      </div>
    </div>
  );
}

// Métodos de pago de un alumno de entreno (clases_monitor.pagos; 'mano' = efectivo).
const METODOS_ENTRENO = [['tarjeta', '💳', 'Tarjeta'], ['bizum', '📱', 'Bizum'], ['mano', '💶', 'Efectivo']];

// Cobro de un ENTRENO al pulsarlo en el Horario. Lo marcan, alumno por alumno,
// el monitor desde su agenda y el admin desde aquí (los dos sobre la MISMA fila
// de clases_monitor, vía la RPC admin_marcar_pago_alumno): lo que marque uno lo
// ve el otro. Solo se puede marcar cuando el monitor ha confirmado la clase
// (cuántos alumnos tuvo). Si en esa pista y hora hay varios monitores, arriba
// va la suma y debajo los alumnos de cada uno.
//   info  = entrada de agregarClasesMonitor (suma de la pista/hora) o null
//   filas = filas de clases_monitor de esa pista/hora ({ user_id, date,
//           time_slot, court_id, personas, pagos, nombre })
//   onSaved(fila, pagos) = pago guardado: el padre actualiza la celda
//   onRefrescar() = algo no cuadraba (p. ej. el monitor quitó la confirmación)
function ResumenEntreno({ info, filas, onSaved, onRefrescar, conGuardado = sinGuardia }) {
  const [busy, setBusy] = useState(false);
  const r = resumenPagoEntreno(info);
  const todo = r.confirmado && r.pagados >= r.personas;
  const tono = !r.confirmado ? slotColors.entreno : todo ? slotColors.pagado : slotColors.impago;
  const lista = (Array.isArray(filas) ? filas : []).filter(f => (Number(f.personas) || 0) > 0);
  const varios = lista.length > 1;

  const marcar = async (fila, idx, metodo) => {
    if (busy) return;
    const nuevo = metodoTrasPulsar((Array.isArray(fila.pagos) ? fila.pagos : [])[idx], metodo); // repetir = desmarcar
    setBusy(true);
    const { data, error } = await conGuardado(() => supabase.rpc('admin_marcar_pago_alumno', {
      p_user_id: fila.user_id,
      p_date: fila.date,
      p_time_slot: fila.time_slot,
      p_court_id: fila.court_id,
      p_idx: idx,
      p_metodo: nuevo,
    }));
    setBusy(false);
    if (error) {
      if (faltaFuncionRpc(error)) {
        toast('Falta aplicar la migración admin_marca_pagos_entreno en Supabase: aún no se pueden marcar pagos de entrenos desde aquí', 'error');
        return;
      }
      toast('No se pudo guardar el pago: ' + error.message, 'error');
      onRefrescar?.(); // lo de la pantalla no cuadra con la BD: traer lo de verdad
      return;
    }
    onSaved?.(fila, Array.isArray(data) ? data : pagosConAlumno(fila.pagos, fila.personas, idx, nuevo));
  };

  // Alumnos de una fila (un monitor), con los botones para marcar cómo pagó.
  // 'mano' se lee "Efectivo", como en su botón.
  const alumnosDe = (fila) => resumenPagoEntreno(fila).alumnos.map((a, i) => (
    <FilaPago key={a.n} etiqueta={`🎾 Alumno ${a.n}`} pagado={a.pagado} texto={a.metodo === 'mano' ? 'Efectivo' : a.texto} metodo={a.metodo}>
      <BotonesPago metodos={METODOS_ENTRENO} actual={(Array.isArray(fila.pagos) ? fila.pagos : [])[i] || null}
        busy={busy} quien={`Alumno ${a.n}`} onPulsar={(mk) => marcar(fila, i, mk)} />
    </FilaPago>
  ));

  return (
    <div style={{ marginBottom: '0.75rem', background: 'white', border: `1.5px solid ${tono.borderColor}`, borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ background: tono.backgroundColor, padding: '0.6rem 0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem 0.6rem' }}>
        {r.confirmado ? (
          <>
            <ChipPago pagada={todo}>{todo ? '✓ Pagado' : r.pagados > 0 ? '◐ Pago parcial' : '✕ Sin pagar'}</ChipPago>
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: tono.color }}>{r.texto}</span>
          </>
        ) : (
          <span style={{ fontSize: '0.84rem', fontWeight: 800, color: tono.color }}>⏳ {r.texto}</span>
        )}
      </div>
      <div style={{ padding: '0.35rem 0.75rem 0.6rem' }}>
        {r.confirmado ? (
          lista.length === 0 ? (
            // Sin el detalle por monitor (no debería pasar): solo lectura
            r.alumnos.map(a => (
              <FilaPago key={a.n} etiqueta={`🎾 Alumno ${a.n}`} pagado={a.pagado} texto={a.texto} metodo={a.metodo} />
            ))
          ) : !varios ? (
            alumnosDe(lista[0])
          ) : (
            lista.map(fila => (
              <div key={fila.user_id} style={{ marginTop: '0.35rem' }}>
                <p style={{ margin: '0.25rem 0 0.1rem', fontSize: '0.74rem', fontWeight: 800, color: '#0F172A' }}>
                  🏋️ {fila.nombre || 'Monitor'} · <span style={{ fontWeight: 700, color: '#64748B' }}>{resumenPagoEntreno(fila).texto}</span>
                </p>
                {alumnosDe(fila)}
              </div>
            ))
          )
        ) : (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4 }}>
            Cuando el monitor confirme cuántos alumnos vinieron, aquí verás cómo pagó cada uno y podrás marcarlo tú también.
          </p>
        )}
        {info?.monitores > 1 && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: '#64748B' }}>Suma de {info.monitores} monitores en esta pista y hora.</p>
        )}
      </div>
    </div>
  );
}

// Filas de bookings de UN día para la pestaña "Reservas", con el perfil de cada
// jugador (profiles NO se puede incrustar desde bookings: no hay FK, se carga
// aparte). Trae todos los estados. Devuelve null si la consulta falla.
async function cargarReservasDia(date) {
  const { data: bookings, error } = await supabase
    .from('bookings')
    // '*' y no una lista: así trae importe y cobro_confirmado si existen en
    // este servidor (pedir una columna que no exista tumbaría toda la lista).
    .select('*, courts(name, sport, gradient)')
    .eq('date', date)
    .order('time_slot', { ascending: true });
  if (error) { console.error('Error cargando reservas:', error); return null; }
  const rows = bookings || [];
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map(b => b.user_id).filter(Boolean))];
  const profileMap = {};
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }
  return rows.map(b => ({ ...b, profiles: profileMap[b.user_id] || null }));
}

const editLabel = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const editInput = { width: '100%', padding: '0.7rem 0.85rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

const UserRow = ({ u, togglingId, toggleBan, onDeleted, onUpdated, supabase }) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [eName, setEName] = useState(u.name || '');
  const [eEmail, setEEmail] = useState(u.email || '');
  const [ePhone, setEPhone] = useState(u.phone || '');
  const [ePassword, setEPassword] = useState('');

  const openEdit = () => {
    setEName(u.name || ''); setEEmail(u.email || ''); setEPhone(u.phone || ''); setEPassword('');
    setShowEdit(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (ePassword && ePassword.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    setSavingEdit(true);
    try {
      const body = { userId: u.id, name: eName.trim(), phone: ePhone.trim() };
      if (eEmail.trim() && eEmail.trim() !== u.email) body.email = eEmail.trim();
      if (ePassword) body.password = ePassword;
      const { data, error } = await supabase.functions.invoke('admin-update-user', { body });
      if (error) {
        let msg = error.message || 'Error desconocido';
        try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onUpdated(u.id, { name: eName.trim(), phone: ePhone.trim(), ...(body.email ? { email: body.email } : {}) });
      toast('Jugador actualizado', 'success');
      setShowEdit(false);
    } catch (err) {
      toast('Error al guardar: ' + (err.message || JSON.stringify(err)), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: u.id },
      });
      if (error) {
        let msg = error.message || 'Error desconocido';
        try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onDeleted(u.id);
    } catch (err) {
      toast('Error al eliminar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <>
      {showConfirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.25rem', padding: '2rem 1.75rem', maxWidth: '420px', width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid #FEE2E2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Eliminar usuario</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B' }}>Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div style={{ background: '#FEF2F2', borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '1.25rem', border: '1px solid #FECACA' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#7F1D1D', fontWeight: 600 }}>¿Seguro que quieres eliminar permanentemente a <strong>{u.name || u.email}</strong>?</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#991B1B' }}>⚠️ Se eliminarán su perfil y todas sus reservas. El acceso a la app quedará revocado.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowConfirmDelete(false)} disabled={deleting} style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.75rem', background: deleting ? '#FCA5A5' : '#DC2626', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {deleting ? (
                  <><svg style={{ animation: 'spin 0.8s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Eliminando...</>
                ) : '🗑 Eliminar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: '1.25rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', marginTop: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Editar jugador</h3>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={editLabel}>Nombre</label>
                <input value={eName} onChange={e => setEName(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Email</label>
                <input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Teléfono</label>
                <input value={ePhone} onChange={e => setEPhone(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Nueva contraseña <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none' }}>(opcional)</span></label>
                <input type="password" value={ePassword} onChange={e => setEPassword(e.target.value)} placeholder="Dejar en blanco para no cambiarla" minLength={6} style={editInput} />
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowEdit(false)} disabled={savingEdit} style={{ padding: '0.65rem 1.1rem', borderRadius: '0.65rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={savingEdit} style={{ padding: '0.65rem 1.3rem', borderRadius: '0.65rem', border: 'none', background: '#16A34A', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.7 : 1 }}>
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', backgroundColor: u.banned ? '#FEF2F2' : 'white', borderRadius: '0.875rem', border: `1px solid ${u.banned ? '#FECACA' : '#E2E8F0'}`, opacity: u.banned ? 0.85 : 1, transition: 'all 0.2s' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: u.banned ? '#94A3B8' : '#0F172A', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || '—'}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: u.role === 'admin' ? '#FEF9C3' : '#F0FDF4', color: u.role === 'admin' ? '#92400E' : '#15803D', textTransform: 'uppercase' }}>{u.role || 'cliente'}</span>
            {u.banned && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: '#FEF2F2', color: '#DC2626', textTransform: 'uppercase' }}>Baja</span>}
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.775rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '—'}{u.phone ? ` · ${u.phone}` : ''}</p>
        </div>
        {u.role !== 'admin' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={openEdit} title="Editar datos y contraseña" style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}>
              ✎ Editar
            </button>
            <button disabled={togglingId === u.id} onClick={() => toggleBan(u)} style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: `1.5px solid ${u.banned ? '#16A34A' : '#DC2626'}`, backgroundColor: u.banned ? '#F0FDF4' : '#FEF2F2', color: u.banned ? '#16A34A' : '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: togglingId === u.id ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: togglingId === u.id ? 0.6 : 1 }}>
              {togglingId === u.id ? '...' : u.banned ? 'Reactivar' : 'Dar de baja'}
            </button>
            <button
              onClick={() => setShowConfirmDelete(true)}
              title="Eliminar usuario permanentemente"
              style={{ padding: '0.4rem 0.55rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#94A3B8', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.backgroundColor = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#94A3B8'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const UserDirectoryTab = ({ supabase, allUsers, setAllUsers }) => {
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoadingUsers(true);
      const { data } = await supabase.from('profiles').select('id, name, email, phone, role, banned').order('name');
      setAllUsers(data || []);
      setLoadingUsers(false);
    }
    if (allUsers.length === 0) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBan = async (u) => {
    setTogglingId(u.id);
    const newBanned = !u.banned;
    const { error } = await supabase.from('profiles').update({ banned: newBanned }).eq('id', u.id);
    if (error) {
      console.error('Error al actualizar estado del jugador:', error);
      toast('Error: ' + (error.message || 'No se pudo actualizar. Asegúrate de haber ejecutado la migración SQL en Supabase.'));
    } else {
      setAllUsers(prev => prev.map(p => p.id === u.id ? { ...p, banned: newBanned } : p));
    }
    setTogglingId(null);
  };

  const filtered = allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || '').includes(search)
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />
        <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>

      {loadingUsers ? (
        <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem' }}>Cargando jugadores...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem' }}>No se encontraron jugadores.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(u => (
            <UserRow
              key={u.id}
              u={u}
              togglingId={togglingId}
              toggleBan={toggleBan}
              onDeleted={(id) => setAllUsers(prev => prev.filter(p => p.id !== id))}
              onUpdated={(id, patch) => setAllUsers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))}
              supabase={supabase}
            />
          ))}
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', textAlign: 'right', marginTop: '0.25rem' }}>{filtered.length} jugadores · {filtered.filter(u => u.banned).length} dados de baja</p>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {

  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('adminActiveTab') || 'schedule');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const DEFAULT_CLUB_HOURS = { 0:'00:00', 1:'00:00', 2:'00:00', 3:'00:00', 4:'00:00', 5:'00:00', 6:'00:00' };
  const [siteSettings, setSiteSettings] = useState({ booking_window_days: 7, court_price: 18.00, slots_release_time: '00:00', club_open_time: '00:00', club_hours: DEFAULT_CLUB_HOURS, cancellation_enabled: true, cancellation_hours: 24, schedule_config: DEFAULT_SCHEDULE_CONFIG });
  // Parrilla editable por el admin; loadSlots (useCallback sin deps) la lee de
  // este ref para usar siempre la última versión guardada.
  const scheduleCfgRef = useRef(DEFAULT_SCHEDULE_CONFIG);
  const [schedDraft, setSchedDraft] = useState(null); // null = editor de horario cerrado
  const [savingSched, setSavingSched] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null); // { type: 'ok'|'error', text: string }
  const [settingsLoadError, setSettingsLoadError] = useState(false); // la carga de site_settings falló → no dejar guardar
  // Copia de los ajustes tal cual se cargaron: al guardar solo enviamos las
  // columnas que han cambiado respecto a esto, para no pisar cambios hechos
  // en otra pestaña/dispositivo mientras tanto.
  const settingsLoadedRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState(serverToday());
  const [courts, setCourts] = useState([]);
  const [slots, setSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const courtsRef = useRef([]);
  // Refresco AUTOMÁTICO (los pagos son mutuos con el monitor): cada guardado
  // de un pago pasa por conGuardado, y un refresco pedido antes o durante un
  // guardado no se aplica (si no, desharía en pantalla lo recién marcado).
  // Los contadores deciden qué lectura de la parrilla manda si se cruzan:
  // una automática solo vale si no ha empezado otra lectura después.
  const [guardia] = useState(crearGuardiaRefresco);
  const conGuardado = useCallback((fn) => conGuardia(guardia, fn), [guardia]);
  const cargaSeqRef = useRef(0);          // toda lectura de la parrilla
  const cargaExplicitaSeqRef = useRef(0); // solo las pedidas a mano (día, acciones…)
  const reservasSeqRef = useRef(0);       // lecturas de la pestaña Reservas
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [bookObs, setBookObs] = useState(''); // nombre/observaciones para reserva manual (no registrados)
  const [allDbBookings, setAllDbBookings] = useState([]);
  const [loadingAllBookings, setLoadingAllBookings] = useState(false);
  const [bookingsDate, setBookingsDate] = useState(serverToday());
  // Pestaña Reservas: hora con la que se decide si un 'pendiente_pago' sigue en
  // curso (< 15 min) o ya no se completó (= la hora de la última lectura de la
  // lista: solo avanza al volver a leerla), y si se ven
  // los intentos de pago no completados (por defecto, ocultos tras un aviso).
  const [relojReservas, setRelojReservas] = useState(() => Date.now());
  const [verPagosNoCompletados, setVerPagosNoCompletados] = useState(false);

  // Cambio de día a MEDIANOCHE: si el admin estaba mirando "hoy" y la fecha
  // cambia (deja la web abierta o entra a las 00:0x), saltar al día nuevo solo.
  useEffect(() => {
    let prevToday = serverToday();
    const id = setInterval(() => {
      const t = serverToday();
      if (t !== prevToday) {
        const old = prevToday;
        prevToday = t;
        setSelectedDate(d => (d === old ? t : d));
        setBookingsDate(d => (d === old ? t : d));
      }
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);
  // Huecos personalizados (fuera de la parrilla fija) del día seleccionado
  const [customByCourt, setCustomByCourt] = useState({}); // courtId -> [{id, time}]
  const [customModal, setCustomModal] = useState(null); // { courtId, courtName } | null
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customDate, setCustomDate] = useState('');
  // Entreno con duración a medida (Desde/Hasta editables al marcarlo)
  const [entrenoModal, setEntrenoModal] = useState(null); // { courtId, courtName, grupo, grupoLabel } | null
  const [entrenoStart, setEntrenoStart] = useState('');
  const [entrenoEnd, setEntrenoEnd] = useState('');
  // "Editar hora" de un hueco LIBRE, solo para el día seleccionado
  const [editHourModal, setEditHourModal] = useState(null); // { courtId, courtName, originalTime, customId, hides } | null
  const [editHourStart, setEditHourStart] = useState('');
  const [editHourEnd, setEditHourEnd] = useState('');
  const [moveBooking, setMoveBooking] = useState(null); // { id, courtId, courtName, date, time, client }
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [moveTargetCourtId, setMoveTargetCourtId] = useState('');
  const [moveTargetTime, setMoveTargetTime] = useState('');
  const [moveSlotInfo, setMoveSlotInfo] = useState(null); // null | 'checking' | 'available' | 'conflict'
  const [showStats, setShowStats] = useState(true);
  const [courtPriceEdits, setCourtPriceEdits] = useState({});
  const [savingCourtPrice, setSavingCourtPrice] = useState(null);
  const [courtPriceMsg, setCourtPriceMsg] = useState({});
  // paymentRules[courtId][day][timeSlot] = string[] de métodos permitidos.
  // day: -1 = todos los días, 0..6 = dom..sáb (Date.getDay()).
  // Sin entrada para (court, day, slot) → cae a (court, -1, slot) → si tampoco hay, todos los métodos.
  const [paymentRules, setPaymentRules] = useState({});
  const [expandedPaymentCourt, setExpandedPaymentCourt] = useState(null);
  const [paymentDayFilter, setPaymentDayFilter] = useState(-1); // selector de día activo en la UI
  const [savingPaymentCell, setSavingPaymentCell] = useState(null); // `${courtId}-${day}-${slot}-${method}`

  const ALL_METHODS = ['redsys', 'bizum', 'club'];
  const METHOD_LABELS = { redsys: 'Tarjeta', bizum: 'Bizum', club: 'Club' };
  const DAY_OPTIONS = [
    { key: -1, label: 'Todos los días', short: 'Todos' },
    { key: 1, label: 'Lunes', short: 'Lun' },
    { key: 2, label: 'Martes', short: 'Mar' },
    { key: 3, label: 'Miércoles', short: 'Mié' },
    { key: 4, label: 'Jueves', short: 'Jue' },
    { key: 5, label: 'Viernes', short: 'Vie' },
    { key: 6, label: 'Sábado', short: 'Sáb' },
    { key: 0, label: 'Domingo', short: 'Dom' },
  ];

  // Devuelve los métodos permitidos para (court, slot) en un día concreto.
  // Prioridad: regla del día específico → regla de "todos los días" → ALL_METHODS.
  const getAllowedMethods = (courtId, slot, day = paymentDayFilter) => {
    const courtRules = paymentRules[courtId];
    if (!courtRules) return ALL_METHODS;
    if (courtRules[day]?.[slot] !== undefined) return courtRules[day][slot];
    if (day !== -1 && courtRules[-1]?.[slot] !== undefined) return courtRules[-1][slot];
    return ALL_METHODS;
  };

  const sameMethods = (a, b) => a.length === b.length && a.every(x => b.includes(x));

  const togglePaymentMethod = async (courtId, slot, method) => {
    const day = paymentDayFilter;
    const current = getAllowedMethods(courtId, slot, day);
    const next = current.includes(method)
      ? current.filter(m => m !== method)
      : [...current, method];

    const cellKey = `${courtId}-${day}-${slot}-${method}`;
    setSavingPaymentCell(cellKey);

    // Si estamos editando un día concreto y el resultado coincide con lo que se
    // heredaría de "Todos los días", borramos la fila específica en vez de
    // duplicar la regla heredada: así la celda vuelve a mostrarse como heredada.
    const courtRules = paymentRules[courtId];
    const inherited = courtRules?.[-1]?.[slot] !== undefined ? courtRules[-1][slot] : ALL_METHODS;
    if (day !== -1 && sameMethods(next, inherited)) {
      const prevState = paymentRules;
      // Optimistic: quitar el override del día
      setPaymentRules(prev => {
        const c = { ...(prev[courtId] || {}) };
        const dayRules = { ...(c[day] || {}) };
        delete dayRules[slot];
        c[day] = dayRules;
        return { ...prev, [courtId]: c };
      });
      const { error } = await supabase
        .from('court_payment_rules')
        .delete()
        .eq('court_id', courtId)
        .eq('time_slot', slot)
        .eq('day_of_week', day);
      setSavingPaymentCell(null);
      if (error) {
        console.error('Error borrando regla de pago:', error);
        toast('Error al guardar: ' + error.message);
        setPaymentRules(prevState); // Revert
      }
      return;
    }

    // Optimistic update
    setPaymentRules(prev => ({
      ...prev,
      [courtId]: {
        ...(prev[courtId] || {}),
        [day]: { ...(prev[courtId]?.[day] || {}), [slot]: next },
      },
    }));

    const { error } = await supabase
      .from('court_payment_rules')
      .upsert(
        { court_id: courtId, time_slot: slot, day_of_week: day, methods: next, updated_at: new Date().toISOString() },
        { onConflict: 'court_id,time_slot,day_of_week' }
      );

    setSavingPaymentCell(null);
    if (error) {
      console.error('Error guardando regla de pago:', error);
      toast('Error al guardar: ' + error.message);
      // Revert
      setPaymentRules(prev => ({
        ...prev,
        [courtId]: {
          ...(prev[courtId] || {}),
          [day]: { ...(prev[courtId]?.[day] || {}), [slot]: current },
        },
      }));
    }
  };

  // "Volver a heredado": borra TODAS las reglas propias de un día para una pista,
  // de modo que ese día vuelve a regirse por la regla de "Todos los días".
  const volverAHeredado = async (courtId) => {
    const day = paymentDayFilter;
    if (day === -1) return;
    const dayLabel = DAY_OPTIONS.find(o => o.key === day)?.label || 'ese día';
    const ok = await confirmDialog(
      `¿Volver a la regla por defecto (todos los días) para ${dayLabel}? Se borrarán las reglas propias de ese día en esta pista.`,
      { title: 'Volver a heredado', okText: 'Volver a heredado' }
    );
    if (!ok) return;
    const prevState = paymentRules;
    setPaymentRules(prev => {
      const c = { ...(prev[courtId] || {}) };
      delete c[day];
      return { ...prev, [courtId]: c };
    });
    const { error } = await supabase
      .from('court_payment_rules')
      .delete()
      .eq('court_id', courtId)
      .eq('day_of_week', day);
    if (error) {
      toast('Error al restaurar: ' + error.message, 'error');
      setPaymentRules(prevState);
    } else {
      toast(`${dayLabel} vuelve a usar la regla por defecto`, 'success');
    }
  };

  // Releer de BD las reservas vivas (confirmadas + holds de pago aún válidos) de
  // una pista y día, y decir si alguna SOLAPA con el intervalo [ini, fin] en
  // minutos. Se usa antes de bloquear/marcar entreno para no pisar una reserva
  // (la detección es por intervalos, no por igualdad de texto del hueco).
  const haySolapeConReservas = async (courtId, date, ini, fin) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('time_slot, status, created_at')
      .eq('court_id', courtId)
      .eq('date', date)
      .in('status', ['confirmed', 'pendiente_pago']);
    if (error) { toast('Error comprobando reservas: ' + error.message, 'error'); return true; }
    const HOLD_MS = 15 * 60 * 1000;
    return (data || []).some(b => {
      if (b.status === 'pendiente_pago' && (Date.now() - new Date(b.created_at).getTime()) >= HOLD_MS) return false;
      const [a, bb] = parseSlot(b.time_slot);
      return ini < bb && a < fin;
    });
  };

  // Marcar el entreno con su duración REAL (puede diferir del hueco de la
  // parrilla; ej.: hueco 19:00-20:30 pero el entreno dura 20:00-21:00).
  const confirmarEntreno = async () => {
    if (!entrenoStart || !entrenoEnd || entrenoEnd <= entrenoStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    const time_slot = `${entrenoStart} - ${entrenoEnd}`;
    // No pisar una reserva viva de ese día/pista (por solape de intervalos).
    const [ini, fin] = parseSlot(time_slot);
    if (await haySolapeConReservas(entrenoModal.courtId, selectedDate, ini, fin)) {
      toast('Ese horario pisa una reserva de ese día. Muévela o cámbiale la hora al entreno.', 'error');
      return;
    }
    const { error } = await supabase.from('blocked_slots').insert({
      court_id: entrenoModal.courtId,
      date: selectedDate,
      time_slot,
      created_by: user.id,
      tipo: 'entreno',
      entreno_grupo: null, // el nº de personas lo confirma el monitor
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast(`🏋️ Entreno de ${time_slot} marcado ✓ (las personas las confirma el monitor)`, 'success');
    setEntrenoModal(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── "EDITAR HORA": cambiar un hueco LIBRE a otra hora SOLO ese día ──
  // Se materializa como hueco personalizado que lleva en hides el hueco base
  // al que sustituye; "Quitar hueco" sobre el nuevo restaura el original.
  // custom_slots no tiene política de UPDATE, así que re-editar un
  // personalizado = insertar el nuevo y borrar el viejo.
  const confirmarEditarHora = async () => {
    if (!editHourStart || !editHourEnd || editHourEnd <= editHourStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    const time_slot = `${editHourStart} - ${editHourEnd}`;
    if (time_slot === editHourModal.originalTime) { setEditHourModal(null); return; }
    const finDt = new Date(`${selectedDate}T${editHourEnd}:00`);
    if (finDt <= serverNow()) { toast('Esa hora ya ha pasado para este día', 'error'); return; }
    // La hora nueva no puede pisar nada ocupado ese día en esa pista
    const [ini, fin] = parseSlot(time_slot);
    const pisaOcupado = Object.entries(slots[editHourModal.courtId] || {}).some(([t, v]) => {
      if (v.status === 'available') return false;
      const [a, b] = parseSlot(t);
      return ini < b && a < fin;
    });
    if (pisaOcupado) { toast('Esa hora pisa una reserva, bloqueo o entreno de ese día', 'error'); return; }
    const { error } = await supabase.from('custom_slots').insert({
      court_id: editHourModal.courtId,
      date: selectedDate,
      time_slot,
      created_by: user.id,
      // hueco base editado → hides = ese hueco; personalizado re-editado →
      // arrastra el hides que ya tuviera (o ninguno)
      hides: editHourModal.customId ? (editHourModal.hides || null) : editHourModal.originalTime,
    });
    if (error) {
      if (error.code === '23505') toast('Ya existe un hueco con esa hora ese día', 'error');
      else if (/hides/i.test(error.message || '')) toast('Falta aplicar la migración custom_slots_hides en Supabase', 'error');
      else toast('Error: ' + error.message, 'error');
      return;
    }
    if (editHourModal.customId) await supabase.from('custom_slots').delete().eq('id', editHourModal.customId);
    toast(`🕐 ${editHourModal.originalTime} → ${time_slot} (solo el ${selectedDate.split('-').reverse().join('/')})`, 'success');
    setEditHourModal(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── Huecos personalizados: crear y quitar ──
  const crearCustomSlot = async () => {
    if (!customDate) { toast('Elige el día del hueco', 'error'); return; }
    if (!customStart || !customEnd || customEnd <= customStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    // Evitar huecos nacidos "en el pasado" (ej.: crear un 00:00-01:00 por la
    // noche con la fecha de HOY — esa medianoche pertenece al día SIGUIENTE).
    const finDt = new Date(`${customDate}T${customEnd}:00`);
    if (finDt <= serverNow()) {
      toast('Ese horario ya ha pasado para ese día. Si es para esta noche, pon la fecha de MAÑANA.', 'error');
      return;
    }
    const time_slot = `${customStart} - ${customEnd}`;
    // No pisar nada ocupado (reservas vivas, bloqueos, entrenos) ni otro hueco
    // personalizado de ese día en esa pista — por solape de intervalos. Se
    // consulta a BD porque el hueco puede ser para un día distinto al cargado.
    const [ni, nf] = parseSlot(time_slot);
    const [resBk, resBl, resCs] = await Promise.all([
      supabase.from('bookings').select('time_slot, status, created_at').eq('court_id', customModal.courtId).eq('date', customDate).in('status', ['confirmed', 'pendiente_pago']),
      supabase.from('blocked_slots').select('time_slot').eq('court_id', customModal.courtId).eq('date', customDate),
      supabase.from('custom_slots').select('time_slot').eq('court_id', customModal.courtId).eq('date', customDate),
    ]);
    if (resBk.error || resBl.error || resCs.error) {
      toast('Error comprobando disponibilidad: ' + (resBk.error || resBl.error || resCs.error).message, 'error');
      return;
    }
    const HOLD_MS = 15 * 60 * 1000;
    const solapa = (slotStr) => { const [a, b] = parseSlot(slotStr); return ni < b && a < nf; };
    const pisaOcupado =
      (resBk.data || []).some(b => (b.status === 'confirmed' || (Date.now() - new Date(b.created_at).getTime()) < HOLD_MS) && solapa(b.time_slot)) ||
      (resBl.data || []).some(b => solapa(b.time_slot));
    if (pisaOcupado) { toast('Esa hora pisa una reserva, bloqueo o entreno de ese día', 'error'); return; }
    if ((resCs.data || []).some(c => solapa(c.time_slot))) { toast('Ya hay un hueco personalizado que se solapa con esa hora ese día', 'error'); return; }
    const { error } = await supabase.from('custom_slots').insert({
      court_id: customModal.courtId, date: customDate, time_slot, created_by: user.id,
    });
    if (error) { toast(error.code === '23505' ? 'Ese hueco ya existe ese día' : 'Error: ' + error.message, 'error'); return; }
    toast(`Hueco ${time_slot} añadido a ${customModal.courtName} el ${customDate.split('-').reverse().join('/')} ✓`, 'success');
    setCustomModal(null);
    // Saltar al día del hueco para verlo recién creado
    if (customDate !== selectedDate) setSelectedDate(customDate);
    await loadSlots(customDate);
  };

  const eliminarCustomSlot = async () => {
    const cs = (customByCourt[activeSlot?.courtId] || []).find(c => c.time === activeSlot?.time);
    if (!cs) return;
    const msg = cs.hides
      ? `¿Quitar el hueco ${activeSlot.time}? Volverá a ofrecerse el hueco original de ${cs.hides}.`
      : `¿Quitar el hueco personalizado ${activeSlot.time}? Dejará de ofrecerse a los jugadores.`;
    const ok = await confirmDialog(msg, { title: 'Quitar hueco', okText: 'Quitar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('custom_slots').delete().eq('id', cs.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── Horario de la parrilla: el admin cambia las horas cuando quiere ──
  // Misma validación para la vista previa y para Guardar: lo que el admin ve
  // en verde es exactamente lo que se puede guardar.
  const validarBorradorHorario = (draft) => {
    const mins = parseInt(draft.slot_minutes, 10);
    if (!Number.isFinite(mins) || mins < 30 || mins > 240) return { error: 'La duración de cada sesión debe estar entre 30 y 240 minutos' };
    if (draft.periods.length === 0) return { error: 'Añade al menos un tramo' };
    if (draft.periods.some(p => !p.start || !p.end)) return { error: 'Completa las horas de todos los tramos' };
    if (draft.periods.some(p => p.end <= p.start)) return { error: 'En cada tramo, la hora de fin debe ser mayor que la de inicio' };
    const sorted = [...draft.periods].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (toMin(sorted[i].start) < toMin(sorted[i - 1].end)) {
        return { error: `Los tramos se solapan: el de las ${sorted[i].start} empieza antes de que acabe el de las ${sorted[i - 1].start}` };
      }
    }
    const clean = { slot_minutes: mins, periods: sorted.map(p => ({ start: p.start, end: p.end })) };
    if (buildScheduleTimes(clean).length === 0) return { error: `Con esas horas no cabe ninguna sesión de ${mins} min — revisa los tramos` };
    return { clean };
  };

  const guardarHorario = async () => {
    if (!schedDraft) return;
    const { error: draftError, clean } = validarBorradorHorario(schedDraft);
    if (draftError) { toast(draftError, 'error'); return; }
    // Reglas de métodos de pago ligadas a franjas que desaparecen: avisar y
    // limpiarlas — si quedaran huérfanas, esas horas volverían en silencio a
    // aceptar todos los métodos sin que el admin pudiera verlo en su tabla.
    const nuevos = new Set(buildScheduleTimes(clean));
    const { data: reglas } = await supabase.from('court_payment_rules').select('time_slot');
    const huerfanas = [...new Set((reglas || []).map(r => r.time_slot).filter(t => !nuevos.has(t)))];
    if (huerfanas.length > 0) {
      const ok = await confirmDialog(
        `Tienes restricciones de métodos de pago en franjas que dejan de existir (${huerfanas.join(', ')}). Se eliminarán y esas horas volverán a aceptar todos los métodos hasta que las configures de nuevo. ¿Guardar igualmente?`,
        { title: 'Cambiar horario', okText: 'Guardar y limpiar', danger: true }
      );
      if (!ok) return;
    }
    setSavingSched(true);
    const { data: savedRows, error } = await supabase.from('site_settings').update({ schedule_config: clean }).eq('id', 1).select('id');
    if (!error && (!savedRows || savedRows.length === 0)) {
      setSavingSched(false);
      toast('No se guardó el horario: sin permiso o fila inexistente', 'error');
      return;
    }
    if (!error && huerfanas.length > 0) {
      const { error: delError } = await supabase.from('court_payment_rules').delete().in('time_slot', huerfanas);
      if (delError) toast('El horario se guardó, pero no se pudieron limpiar las reglas de pago antiguas: ' + delError.message, 'error');
      else setPaymentRules(prev => {
        const next = {};
        Object.entries(prev).forEach(([courtId, days]) => {
          next[courtId] = {};
          Object.entries(days).forEach(([day, slotRules]) => {
            next[courtId][day] = Object.fromEntries(Object.entries(slotRules).filter(([slot]) => nuevos.has(slot)));
          });
        });
        return next;
      });
    }
    setSavingSched(false);
    if (error) { toast('Error al guardar el horario: ' + error.message, 'error'); return; }
    scheduleCfgRef.current = normalizeScheduleConfig(clean);
    setSiteSettings(s => ({ ...s, schedule_config: clean }));
    setSchedDraft(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
    toast('✓ Horario actualizado. La nueva parrilla ya se ofrece a los jugadores.', 'success');
  };

  // auto = refresco automático (cada REFRESCO_AUTO_MS o al volver a primer
  // plano): no se pide mientras se guarda un pago, no avisa de errores (se
  // queda lo que había) y lo que traiga solo se aplica si sigue valiendo.
  const loadSlots = useCallback(async (date, { auto = false } = {}) => {
    const foto = auto ? guardia.pedir() : null;
    if (auto && foto == null) return; // guardando: ya tocará en la siguiente vuelta
    const seq = ++cargaSeqRef.current;
    const seqExplicita = auto ? null : ++cargaExplicitaSeqRef.current;
    const [resBookings, resBlocked, resCustoms, resClases] = await Promise.all([
      supabase.from('bookings').select('*').eq('date', date).in('status', ['confirmed', 'pendiente_pago']),
      supabase.from('blocked_slots').select('*').eq('date', date),
      supabase.from('custom_slots').select('*').eq('date', date),
      // Cobro de los entrenos: lo marcan el monitor y el admin en clases_monitor
      // (el admin, por RLS, ve todas las filas). Una fila por monitor: user_id
      // y date hacen falta para marcar los pagos desde el Horario. Si la tabla
      // no existe aún, data va vacío y los entrenos salen como "el monitor aún
      // no ha confirmado la clase".
      supabase.from('clases_monitor').select('user_id, date, court_id, time_slot, personas, pagos').eq('date', date).order('user_id'),
    ]);

    if (resBookings.error && !auto) {
      console.error('Error cargando reservas:', resBookings.error);
      toast('Error cargando reservas de BD: ' + resBookings.error.message);
    }

    // Holds 'pendiente_pago': bloquean el hueco 15 min (jugador pagando en el
    // banco); pasado ese tiempo no son reservas y el hueco está libre.
    let bookings = (resBookings.data || []).filter(b => b.status === 'confirmed' || !pagoCaducado(b));
    const blocked = resBlocked.data || [];
    const filasClases = resClases.data || [];

    // Nombres de quienes reservaron y de los monitores de los entrenos (estos,
    // para separar sus alumnos si coinciden varios en la misma pista y hora).
    const idsPerfiles = [...new Set([...bookings.map(b => b.user_id), ...filasClases.map(c => c.user_id)].filter(Boolean))];
    const nombreMonitor = {};
    let pError = null;
    if (idsPerfiles.length > 0) {
      const res = await supabase.from('profiles').select('id, name, email').in('id', idsPerfiles);
      const profiles = res.data;
      pError = res.error;
      if (pError) console.error('Error cargando perfiles:', pError);
      if (profiles) {
        const profileMap = {};
        profiles.forEach(p => {
          profileMap[p.id] = p.name || p.email?.split('@')[0] || 'Cliente';
          nombreMonitor[p.id] = p.name || p.email?.split('@')[0] || null;
        });
        bookings = bookings.map(b => ({ ...b, profiles: { name: profileMap[b.user_id] } }));
      }
    }

    // ¿Sigue valiendo esta lectura? A partir de aquí todo es síncrono.
    if (auto) {
      // Automática: solo si nadie ha pedido otra lectura después, no se ha
      // guardado nada desde que se pidió, y no ha fallado nada (con un fallo
      // de red es mejor dejar lo que había que pintar una parrilla a medias).
      if (seq !== cargaSeqRef.current || !guardia.vale(foto)) return;
      if (resBookings.error || resBlocked.error || resCustoms.error || resClases.error || pError) return;
    } else if (seqExplicita !== cargaExplicitaSeqRef.current) {
      return; // ya se pidió otra (p. ej. se cambió de día): manda esa
    }

    // Cobro por entreno (clave court_id|time_slot), con el método de cada
    // alumno. Si hubiera varios monitores en la misma pista/hora, se suman;
    // las filas de cada uno van aparte para poder marcar sus pagos.
    const clasesEntreno = agregarClasesMonitor(filasClases);
    const filasEntreno = filasPorClase(filasClases.map(c => ({ ...c, nombre: nombreMonitor[c.user_id] || null })));

    const newSlots = {};
    courtsRef.current.forEach(court => {
      newSlots[court.id] = {};
    });
    // Huecos personalizados del día (entran a la parrilla como ANCLAS;
    // hides = hueco base al que sustituyen ese día vía "Editar hora")
    const cMap = {};
    (resCustoms.data || []).forEach(cs => {
      (cMap[cs.court_id] = cMap[cs.court_id] || []).push({ id: cs.id, time: cs.time_slot, hides: cs.hides || null });
    });
    setCustomByCourt(cMap);
    bookings?.forEach(b => {
      if (newSlots[b.court_id]) {
        newSlots[b.court_id][b.time_slot] = {
          status: 'booked',
          client: b.status === 'pendiente_pago'
            ? `⏳ ${b.profiles?.name || 'Pago en curso'}`
            : (b.observaciones || b.profiles?.name || 'Cliente'),
          bookingId: b.id, metodo: b.metodo_pago, isFree: b.is_free, paymentType: b.payment_type, splitPaid: b.split_paid,
          pagosJugadores: Array.isArray(b.pagos_jugadores) ? b.pagos_jugadores : [],
          cobroConfirmado: !!b.cobro_confirmado,
          esHold: b.status === 'pendiente_pago',
          importe: b.importe ?? null,
          userId: b.user_id,
        };
      }
    });
    blocked?.forEach(b => {
      if (!newSlots[b.court_id]) return;
      const existing = newSlots[b.court_id][b.time_slot];
      // Si ya hay una RESERVA a esa misma hora, no la pisamos con el bloqueo:
      // marcamos el conflicto para que se vea (reserva + bloqueo a la vez).
      if (existing && existing.status === 'booked') {
        existing.conflicto = true;
        return;
      }
      const cell = { status: 'blocked', blockedId: b.id, tipo: b.tipo || 'bloqueado' };
      // Entreno: le colgamos lo que ha confirmado el monitor (alumnos y cómo
      // pagó cada uno). null = el monitor aún no ha confirmado la clase.
      if (cell.tipo === 'entreno') {
        cell.entrenoInfo = clasesEntreno[`${b.court_id}|${b.time_slot}`] || null;
        cell.entrenoFilas = filasEntreno[`${b.court_id}|${b.time_slot}`] || [];
      }
      newSlots[b.court_id][b.time_slot] = cell;
    });

    // ── Disponibles (idéntico a la vista del jugador) ──
    // SIN auto-ajuste: las horas no cambian solas. Un hueco base pisado por
    // un entreno/reserva queda ocupado a su hora real y no se recoloca; los
    // huecos personalizados del admin se ofrecen tal cual y tapan al hueco
    // base que se solape. La parrilla base la define el admin aquí arriba.
    courtsRef.current.forEach(court => {
      const entries = newSlots[court.id] || {};
      const ocupadas = Object.entries(entries).filter(([, v]) => v.status !== 'available');
      const occupiedIvs = ocupadas.map(([t]) => parseSlot(t));
      const customTimes = (cMap[court.id] || []).map(c => c.time);
      const hiddenTimes = (cMap[court.id] || []).map(c => c.hides).filter(Boolean);
      const rebuilt = {};
      ocupadas.forEach(([t, v]) => { rebuilt[t] = v; });
      rebuildAvailableTimes(scheduleCfgRef.current, occupiedIvs, customTimes, hiddenTimes).forEach(t => {
        if (!rebuilt[t]) rebuilt[t] = { status: 'available' };
      });
      newSlots[court.id] = rebuilt;
    });

    setSlots(newSlots);
  }, [guardia]);

  // Carga inicial: siempre llama a setLoading(false) pase lo que pase
  useEffect(() => {
    async function init() {
      try {
        // Cargar ajustes globales. supabase-js NO lanza: devuelve {error}. Si
        // falla, marcamos el error para avisar y bloquear "Guardar Ajustes"
        // (guardar sobre un estado sin cargar machacaría la fila con valores por defecto).
        const { data: settingsData, error: settingsErr } = await supabase.from('site_settings').select('*').single();
        if (settingsErr || !settingsData) {
          console.error('Error cargando site_settings:', settingsErr);
          setSettingsLoadError(true);
        } else {
          const schedCfg = normalizeScheduleConfig(settingsData.schedule_config);
          scheduleCfgRef.current = schedCfg;
          const loadedSettings = {
            booking_window_days: settingsData.booking_window_days,
            court_price: parseFloat(settingsData.court_price),
            slots_release_time: settingsData.slots_release_time || '00:00',
            club_open_time: settingsData.club_open_time || '00:00',
            club_hours: settingsData.club_hours || DEFAULT_CLUB_HOURS,
            cancellation_enabled: settingsData.cancellation_enabled ?? true,
            cancellation_hours: settingsData.cancellation_hours ?? 24,
            schedule_config: schedCfg,
          };
          settingsLoadedRef.current = loadedSettings;
          setSiteSettings(loadedSettings);
        }

        const { data } = await supabase.from('courts').select('*').order('name');
        const loaded = data || [];
        courtsRef.current = loaded;
        setCourts(loaded);

        // Cargar reglas de métodos de pago por pista + franja + día
        const { data: rulesData } = await supabase
          .from('court_payment_rules')
          .select('court_id, time_slot, day_of_week, methods');
        if (rulesData) {
          const rulesMap = {};
          rulesData.forEach(r => {
            const day = r.day_of_week ?? -1;
            if (!rulesMap[r.court_id]) rulesMap[r.court_id] = {};
            if (!rulesMap[r.court_id][day]) rulesMap[r.court_id][day] = {};
            rulesMap[r.court_id][day][r.time_slot] = r.methods || [];
          });
          setPaymentRules(rulesMap);
        }

        if (loaded.length > 0) await loadSlots(selectedDate);
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ¿El destino de un "Mover reserva" SOLAPA con algo? Comprueba por intervalos
  // (no por igualdad de texto) contra: reservas vivas (confirmadas + holds de
  // pago válidos, salvo la que se mueve), bloqueos/entrenos y otros huecos
  // personalizados de esa pista/fecha (un custom con la MISMA hora destino es el
  // propio hueco al que se mueve y no cuenta). Devuelve true si hay conflicto.
  const destinoTieneSolape = async (courtId, date, time, excludeId) => {
    const [ti, tf] = parseSlot(time);
    const solapa = (slotStr) => { const [a, b] = parseSlot(slotStr); return ti < b && a < tf; };
    const [resBk, resBl, resCs] = await Promise.all([
      supabase.from('bookings').select('id, time_slot, status, created_at').eq('court_id', courtId).eq('date', date).in('status', ['confirmed', 'pendiente_pago']),
      supabase.from('blocked_slots').select('time_slot').eq('court_id', courtId).eq('date', date),
      supabase.from('custom_slots').select('time_slot').eq('court_id', courtId).eq('date', date),
    ]);
    if (resBk.error || resBl.error || resCs.error) return true; // ante la duda, no dejar mover
    const HOLD_MS = 15 * 60 * 1000;
    const bookingConflict = (resBk.data || []).some(b =>
      b.id !== excludeId &&
      (b.status === 'confirmed' || (Date.now() - new Date(b.created_at).getTime()) < HOLD_MS) &&
      solapa(b.time_slot)
    );
    const blockedConflict = (resBl.data || []).some(b => solapa(b.time_slot));
    const customConflict = (resCs.data || []).some(c => c.time_slot !== time && solapa(c.time_slot));
    return bookingConflict || blockedConflict || customConflict;
  };

  // Comprueba disponibilidad del slot destino al mover una reserva
  useEffect(() => {
    if (!moveTargetDate || !moveTargetCourtId || !moveTargetTime) {
      setMoveSlotInfo(null);
      return;
    }
    setMoveSlotInfo('checking');
    let alive = true;
    (async () => {
      const conflict = await destinoTieneSolape(moveTargetCourtId, moveTargetDate, moveTargetTime, moveBooking?.id);
      if (alive) setMoveSlotInfo(conflict ? 'conflict' : 'available');
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveTargetDate, moveTargetCourtId, moveTargetTime, moveBooking]);

  // Recarga slots cuando cambia la fecha
  useEffect(() => {
    if (courtsRef.current.length > 0) loadSlots(selectedDate);
  }, [selectedDate, loadSlots]);

  // Carga TODAS las filas del día cuando se activa la pestaña Reservas
  // (la lista decide cómo pintar cada una: reserva, pago en curso, pago no
  // completado o cancelada). Si se cambia de día rápido, solo vale la última.
  useEffect(() => {
    if (activeTab !== 'bookings') return;
    let alive = true;
    reservasSeqRef.current += 1; // lo que traiga un refresco automático ya en vuelo, no vale
    setLoadingAllBookings(true);
    cargarReservasDia(bookingsDate).then(rows => {
      if (!alive) return;
      if (rows) setAllDbBookings(rows);
      setRelojReservas(Date.now());
      setLoadingAllBookings(false);
    });
    return () => { alive = false; };
  }, [activeTab, bookingsDate]);

  // ── Refresco AUTOMÁTICO ──
  // Los pagos son MUTUOS con el monitor (lo que marque él en su agenda sale
  // aquí y al revés), así que mientras la web está visible se relee sola, sin
  // recargar, cada REFRESCO_AUTO_MS:
  //   · Horario abierto: la parrilla del día que se ve (colores, y el panel
  //     abierto de la reserva o el entreno, que se pinta con la celda).
  //   · Pestaña Reservas abierta: la lista del día. Un "pago en curso" cambia
  //     solo (se confirma, se cancela o caduca a los 15 min) y la hora con la
  //     que se clasifica solo avanza al volver a leer la lista (moverla sobre
  //     la copia vieja pondría una reserva ya pagada como "pago no completado").
  // Al volver a primer plano se relee en el momento (es el mismo refresco que
  // había antes, ahora con las mismas protecciones): la parrilla esté en la
  // pestaña que esté (mientras tanto han podido entrar reservas: riesgo de
  // bloquear/mover sobre algo ya reservado) y la lista si está abierta.
  // Al entrar en el Horario desde otra pestaña también se relee al momento.
  // Nunca enseña "Cargando", no cierra paneles ni ventanas, y no aplica una
  // lectura que se cruce con un guardado (ver crearGuardiaRefresco).
  const pestanaAnteriorRef = useRef(activeTab);
  useEffect(() => {
    let alive = true;
    const refrescarHorario = () => {
      if (courtsRef.current.length > 0) loadSlots(selectedDate, { auto: true });
    };
    const refrescarReservas = async () => {
      const foto = guardia.pedir();
      if (foto == null) return;
      const seq = ++reservasSeqRef.current;
      const rows = await cargarReservasDia(bookingsDate);
      // si falla, mejor no reclasificar con datos viejos
      if (!alive || !rows || seq !== reservasSeqRef.current || !guardia.vale(foto)) return;
      setAllDbBookings(rows);
      setRelojReservas(Date.now());
    };
    const refrescar = (alVolver) => {
      if (document.visibilityState !== 'visible') return;
      if (alVolver || activeTab === 'schedule') refrescarHorario();
      if (activeTab === 'bookings') refrescarReservas();
    };
    const vengoDeOtra = pestanaAnteriorRef.current !== activeTab;
    pestanaAnteriorRef.current = activeTab;
    if (vengoDeOtra && activeTab === 'schedule') refrescar(false);
    const id = setInterval(() => refrescar(false), REFRESCO_AUTO_MS);
    const onVisible = () => refrescar(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTab, selectedDate, bookingsDate, loadSlots, guardia]);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action, opts = {}) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const { courtId, time } = activeSlot;
    const slot = slots[courtId]?.[time];
    let actionError = null;

    if (action === 'reserve') {
      const obs = (bookObs || '').trim();
      const bookUserId = selectedUserId || user.id;
      const bookedUserName = obs || allUsers.find(u => u.id === bookUserId)?.name || user.name || 'Cliente';
      const bookedCourt = courts.find(c => c.id === courtId);
      const courtName = bookedCourt?.name || 'Pista';
      // Importe que correspondería cobrar por esta pista: su precio propio o, si
      // no tiene, el global de site_settings (en euros). La reserva nace gratis
      // (manual) y pasa a ingreso al marcarla pagada, pero dejamos el importe listo.
      const importe = Number(bookedCourt?.price != null ? bookedCourt.price : siteSettings.court_price);
      const { error } = await supabase.from('bookings').insert({ court_id: courtId, user_id: bookUserId, date: selectedDate, time_slot: time, status: 'confirmed', is_free: true, observaciones: obs || null, metodo_pago: 'manual', importe: Number.isFinite(importe) ? importe : null });
      actionError = error;
      if (!error) {
        supabase.functions.invoke('send-push', {
          body: {
            title: 'Nueva reserva',
            body: `${bookedUserName} — ${courtName} · ${time} · ${formatDate(selectedDate)}`,
            url: '/admin',
          },
        }).catch(() => {});
        // Si el admin asignó la reserva a un usuario REGISTRADO, avisarle por email.
        const bookedUser = selectedUserId ? allUsers.find(u => u.id === selectedUserId) : null;
        if (bookedUser?.email) {
          supabase.functions.invoke('send-booking-email', {
            body: {
              type: 'confirmation',
              email: bookedUser.email,
              userName: bookedUser.name || 'jugador/a',
              courtName,
              date: selectedDate,
              timeSlot: time,
            },
          }).catch(() => {});
        }
        // Y SIEMPRE (registrado o no), correo al admin con los datos de la reserva.
        supabase.functions.invoke('send-booking-email', {
          body: {
            type: 'admin',
            email: bookedUser?.email || '',
            userName: bookedUserName,
            userPhone: bookedUser?.phone || '',
            courtName,
            date: selectedDate,
            timeSlot: time,
            metodoPago: '✍️ Reserva manual (admin)',
          },
        }).catch(() => {});
      }
      setSelectedUserId(null);
      setShowUserPicker(false);
      setBookObs('');
    } else if (action === 'block') {
      const tipo = opts.tipo === 'entreno' ? 'entreno' : 'bloqueado';
      // No bloquear sobre una reserva viva (por solape de intervalos, releyendo BD).
      const [ini, fin] = parseSlot(time);
      if (await haySolapeConReservas(courtId, selectedDate, ini, fin)) {
        toast(`No se puede ${tipo === 'entreno' ? 'marcar el entreno' : 'bloquear'}: ese horario pisa una reserva de ese día.`, 'error');
        setIsProcessing(false);
        return;
      }
      const { error } = await supabase.from('blocked_slots').insert({ court_id: courtId, date: selectedDate, time_slot: time, created_by: user.id, tipo, entreno_grupo: tipo === 'entreno' ? (opts.grupo || 'grupo4') : null });
      actionError = error;
    } else if (action === 'cancel') {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', slot.bookingId);
      actionError = error;
    } else if (action === 'unblock') {
      const { error } = await supabase.from('blocked_slots').delete().eq('id', slot.blockedId);
      actionError = error;
    }

    if (actionError) {
      console.error('Action error:', actionError);
      toast('Error en base de datos: ' + actionError.message + (actionError.details ? ' - ' + actionError.details : ''));
    }

    setActiveSlot(null);
    await loadSlots(selectedDate);
    setIsProcessing(false);
  };

  const cancelBooking = async (bookingId) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await loadSlots(selectedDate);
  };

  const handleMoveBooking = async () => {
    if (!moveBooking || !moveTargetDate || !moveTargetCourtId || !moveTargetTime) return;
    setIsProcessing(true);
    // Revalidar el destino por solape JUSTO antes de mover: entre la comprobación
    // visual y el clic ha podido entrar una reserva desde la web/app.
    if (await destinoTieneSolape(moveTargetCourtId, moveTargetDate, moveTargetTime, moveBooking.id)) {
      setMoveSlotInfo('conflict');
      toast('Ese destino se acaba de ocupar o solapa con algo. Elige otra franja.', 'error');
      setIsProcessing(false);
      return;
    }
    const { error } = await supabase.from('bookings').update({
      date: moveTargetDate,
      time_slot: moveTargetTime,
      court_id: moveTargetCourtId,
      // Nueva hora, nuevo recordatorio (send-reminders lo vuelve a planificar).
      reminder_sent: false,
    }).eq('id', moveBooking.id);
    if (error) {
      toast('Error al mover la reserva: ' + error.message);
    } else {
      setMoveBooking(null);
      await loadSlots(selectedDate);
      if (activeTab === 'bookings') {
        // Recargar el MISMO día que se está viendo en la pestaña Reservas
        // (antes se cambiaba la lista por todas las confirmadas desde hoy).
        reservasSeqRef.current += 1; // un refresco automático ya en vuelo, no vale
        const rows = await cargarReservasDia(bookingsDate);
        if (rows) { setAllDbBookings(rows); setRelojReservas(Date.now()); }
      }
    }
    setIsProcessing(false);
  };

  const toggleCourt = async (courtId) => {
    const court = courts.find(c => c.id === courtId);
    const nuevo = !court.active;
    // Confirmar contra BD: .select('id') devuelve la fila tocada; data vacío =
    // no se guardó (sin permiso o fila inexistente). Solo tocamos la UI si fue bien.
    const { data, error } = await supabase.from('courts').update({ active: nuevo }).eq('id', courtId).select('id');
    if (error || !data || data.length === 0) {
      toast(error ? 'Error: ' + error.message : 'No se guardó: sin permiso o fila inexistente', 'error');
      return;
    }
    const updated = courts.map(c => c.id === courtId ? { ...c, active: nuevo } : c);
    courtsRef.current = updated;
    setCourts(updated);
  };

  const saveCourtPrice = async (courtId) => {
    const raw = courtPriceEdits[courtId];
    if (raw === undefined) return;
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0) return;
    setSavingCourtPrice(courtId);
    const { data, error } = await supabase.from('courts').update({ price }).eq('id', courtId).select('id');
    setSavingCourtPrice(null);
    if (error || !data || data.length === 0) {
      setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'error', text: error ? error.message : 'No se guardó: sin permiso o fila inexistente' } }));
    } else {
      const updated = courts.map(c => c.id === courtId ? { ...c, price } : c);
      courtsRef.current = updated;
      setCourts(updated);
      setCourtPriceEdits(prev => { const n = { ...prev }; delete n[courtId]; return n; });
      setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'ok' } }));
      setTimeout(() => setCourtPriceMsg(prev => { const n = { ...prev }; delete n[courtId]; return n; }), 2000);
    }
  };

  // "Usar precio global": borra el precio propio de la pista (price = null) para
  // que vuelva a regirse por el precio global de Configuración.
  const useGlobalPrice = async (courtId) => {
    setSavingCourtPrice(courtId);
    const { data, error } = await supabase.from('courts').update({ price: null }).eq('id', courtId).select('id');
    setSavingCourtPrice(null);
    if (error || !data || data.length === 0) {
      setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'error', text: error ? error.message : 'No se guardó: sin permiso o fila inexistente' } }));
      return;
    }
    const updated = courts.map(c => c.id === courtId ? { ...c, price: null } : c);
    courtsRef.current = updated;
    setCourts(updated);
    setCourtPriceEdits(prev => { const n = { ...prev }; delete n[courtId]; return n; });
    setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'ok' } }));
    setTimeout(() => setCourtPriceMsg(prev => { const n = { ...prev }; delete n[courtId]; return n; }), 2000);
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setActiveSlot(null);
  };

  const handleSaveSettings = async () => {
    // Si la carga inicial falló, no dejamos guardar (machacaría la fila con
    // valores por defecto). El botón ya está deshabilitado; esto es por si acaso.
    if (settingsLoadError) {
      setSettingsMsg({ type: 'error', text: 'No se pudieron cargar los ajustes, así que no se pueden guardar. Recarga la página.' });
      return;
    }
    setSavingSettings(true);
    setSettingsMsg(null);
    // Validar ANTES de guardar: un campo vacío guardaría null y rompería en silencio.
    const windowDays = parseInt(siteSettings.booking_window_days, 10);
    const price = parseFloat(siteSettings.court_price);
    if (!Number.isFinite(windowDays) || windowDays < 1) {
      setSavingSettings(false);
      setSettingsMsg({ type: 'error', text: 'Los días de antelación deben ser un número (mínimo 1).' });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSavingSettings(false);
      setSettingsMsg({ type: 'error', text: 'El precio de la pista debe ser un número (0 o más).' });
      return;
    }
    // Antelación mínima para cancelar: solo si la cancelación está activada.
    // Rechazar vacío/no numérico — antes un campo en blanco guardaba 0 sin querer.
    let cancellationHours = settingsLoadedRef.current?.cancellation_hours ?? 24;
    if (siteSettings.cancellation_enabled) {
      const rawCh = siteSettings.cancellation_hours;
      if (rawCh === '' || rawCh === null || rawCh === undefined) {
        setSavingSettings(false);
        setSettingsMsg({ type: 'error', text: 'Indica la antelación mínima para cancelar (horas). Pon 0 si quieres permitir cancelar hasta el último momento.' });
        return;
      }
      const ch = parseInt(rawCh, 10);
      if (!Number.isFinite(ch) || ch < 0) {
        setSavingSettings(false);
        setSettingsMsg({ type: 'error', text: 'La antelación mínima para cancelar debe ser un número de horas (0 o más).' });
        return;
      }
      cancellationHours = ch;
    }
    // Sanear club_hours: null = día desactivado (se respeta); '' (bug) → '00:00'.
    const sanitizedClubHours = {};
    Object.entries(siteSettings.club_hours || {}).forEach(([k, v]) => {
      sanitizedClubHours[k] = v === '' ? '00:00' : v;
    });
    const desired = {
      booking_window_days: windowDays,
      court_price: price,
      slots_release_time: siteSettings.slots_release_time || '00:00',
      club_open_time: siteSettings.club_open_time || '00:00',
      club_hours: sanitizedClubHours,
      cancellation_enabled: !!siteSettings.cancellation_enabled,
      cancellation_hours: cancellationHours,
    };
    // Enviar SOLO las columnas que han cambiado respecto a lo que se cargó, para
    // no pisar cambios hechos en otra pestaña/dispositivo mientras tanto.
    const loaded = settingsLoadedRef.current || {};
    const patch = {};
    Object.keys(desired).forEach(k => {
      const changed = k === 'club_hours'
        ? JSON.stringify(desired[k]) !== JSON.stringify(loaded[k])
        : desired[k] !== loaded[k];
      if (changed) patch[k] = desired[k];
    });
    if (Object.keys(patch).length === 0) {
      setSavingSettings(false);
      // Reflejar el saneado de club_hours en la UI aunque no haya cambio en BD.
      setSiteSettings(s => ({ ...s, club_hours: sanitizedClubHours, cancellation_hours: cancellationHours }));
      setSettingsMsg({ type: 'ok', text: 'No había cambios que guardar.' });
      setTimeout(() => setSettingsMsg(null), 4000);
      return;
    }
    const { data, error } = await supabase.from('site_settings').update(patch).eq('id', 1).select('id');
    setSavingSettings(false);
    if (error || !data || data.length === 0) {
      console.error(error);
      setSettingsMsg({ type: 'error', text: error ? 'Error al guardar: ' + error.message : 'No se guardó: sin permiso o fila inexistente.' });
    } else {
      settingsLoadedRef.current = { ...settingsLoadedRef.current, ...desired };
      setSiteSettings(s => ({ ...s, club_hours: sanitizedClubHours, cancellation_hours: cancellationHours }));
      // Si cambió el precio global, avisar de las pistas con precio propio (que no lo usan).
      const ownPriceCourts = courts.filter(c => c.price != null);
      const extraMsg = patch.court_price !== undefined && ownPriceCourts.length > 0
        ? ` Estas pistas tienen precio propio y no usan el global: ${ownPriceCourts.map(c => c.name).join(', ')}.`
        : '';
      setSettingsMsg({ type: 'ok', text: '✓ Ajustes guardados. Los cambios ya son visibles para los clientes.' + extraMsg });
      setTimeout(() => setSettingsMsg(null), extraMsg ? 7000 : 4000);
    }
  };

  const allBookings = [];
  courts.forEach(court => {
    Object.keys(slots[court.id] || {}).forEach(time => {
      const slot = slots[court.id]?.[time];
      if (slot?.status === 'booked') {
        allBookings.push({ ...court, time, client: slot.client, bookingId: slot.bookingId });
      }
    });
  });

  // Pistas ocupadas por bloqueos y por entrenos del día, POR SEPARADO (en el
  // dashboard se muestran diferenciadas, con su pista y su hora)
  const detalleBloqueos = [];
  courts.forEach(court => {
    Object.entries(slots[court.id] || {}).forEach(([time, slot]) => {
      if (slot.status === 'blocked') {
        detalleBloqueos.push({ courtName: court.name, time, esEntreno: slot.tipo === 'entreno' });
      }
    });
  });
  detalleBloqueos.sort((a, b) => a.time.localeCompare(b.time));
  const bloqueadasDia = detalleBloqueos.filter(s => !s.esEntreno);
  const entrenosDia = detalleBloqueos.filter(s => s.esEntreno);
  const activeCourts = courts.filter(c => c.active).length;
  // Parrilla vigente (para la tabla de métodos de pago y el modal de mover)
  const scheduleCfgView = normalizeScheduleConfig(siteSettings.schedule_config);
  const scheduleTimes = buildScheduleTimes(scheduleCfgView);

  const menuItems = [
    { key: 'schedule', label: 'Horario', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { key: 'bookings', label: `Reservas (${allBookings.length})`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { key: 'courts', label: 'Pistas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 2 Q16 6 16 12 Q16 18 12 22"/><path d="M12 2 Q8 6 8 12 Q8 18 12 22"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: 'users', label: 'Jugadores', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: 'tournaments', label: 'Torneos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
    { key: 'events', label: 'Eventos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
    { key: 'finance', label: 'Finanzas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { key: 'timeclock', label: 'Control horario', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { key: 'entrenos', label: 'Entrenos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/></svg> },
    { key: 'settings', label: 'Configuración', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/><circle cx="12" cy="12" r="3"/></svg> },
  ];

  return (
    <>
      <style>{`
        .admin-layout { display: flex; min-height: 100vh; background: var(--color-bg-secondary); }
        .admin-sidebar {
          width: min(280px, 85vw); background: white; border-right: 1px solid var(--color-border);
          display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 50;
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
          transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow-y: auto;
        }
        .admin-sidebar.open { transform: translateX(0); }
        .sidebar-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40;
          opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        .sidebar-overlay.open { opacity: 1; pointer-events: auto; }

        .admin-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 100vh; }
        .admin-header {
          background: white; border-bottom: 1px solid var(--color-border);
          padding: 0.75rem 1rem;
          padding-top: calc(0.75rem + env(safe-area-inset-top));
          padding-left: calc(1rem + env(safe-area-inset-left));
          padding-right: calc(1rem + env(safe-area-inset-right));
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem;
          position: sticky; top: 0; z-index: 10; box-shadow: var(--shadow-sm);
          min-height: calc(56px + env(safe-area-inset-top));
        }
        .admin-header-title {
          flex: 1;
          min-width: 0;
          text-align: center;
          font-weight: 800;
          color: #0F172A;
          font-size: 1rem;
          letter-spacing: -0.02em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-burger {
          flex-shrink: 0;
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          border: 1.5px solid var(--color-border);
          background: white;
          border-radius: 0.625rem;
          color: #0F172A;
          cursor: pointer;
          padding: 0;
        }
        .admin-burger:hover { border-color: #16A34A; color: #16A34A; }

        /* Filo de marca bajo la cabecera del panel (navy → verde) */
        .admin-header::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -1px;
          height: 2.5px;
          background: linear-gradient(90deg, #1B3A6E 0%, #16A34A 60%, #4ADE80 100%);
          opacity: 0.85;
        }

        /* Items del menú: hover suave + barra verde en el activo */
        .admin-nav-item { position: relative; }
        .admin-nav-item:hover:not(.active) { background: #F1F5F9 !important; color: #0F172A !important; }
        .admin-nav-item.active::before {
          content: '';
          position: absolute;
          left: -1rem; top: 22%; bottom: 22%;
          width: 3.5px;
          border-radius: 0 4px 4px 0;
          background: linear-gradient(180deg, #16A34A, #4ADE80);
        }
        .admin-logout:hover { border-color: #FECACA !important; color: #DC2626 !important; background: #FEF2F2 !important; }
        .admin-body { flex: 1; padding: 1.5rem 1rem; max-width: 100%; width: 100%; padding-left: calc(1rem + env(safe-area-inset-left)); padding-right: calc(1rem + env(safe-area-inset-right)); }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
        .slots-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin-bottom: 0.625rem; }
        .courts-list { display: flex; flex-direction: column; gap: 1.25rem; }

        @media (min-width: 400px) { .slots-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 480px) { .slots-grid { grid-template-columns: repeat(7, 1fr); } }
        @media (min-width: 1024px) {
          .admin-sidebar { transform: translateX(0) !important; position: sticky; height: 100vh; top: 0; }
          .sidebar-overlay { display: none; }
          .desktop-hide { display: none !important; }
          .admin-header { padding: 0.875rem 2rem; }
          .admin-body { padding: 2rem; }
          .courts-list { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      {/* Modal: duración del entreno */}
      {entrenoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#BE185D' }}>🏋️ Entreno — {entrenoModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              Marca el horario real de la clase (ej.: de 20:00 a 21:00). Ese tramo queda ocupado para los jugadores. De cuántas personas es lo confirma el monitor al acabar el día.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={entrenoStart} onChange={e => setEntrenoStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={entrenoEnd} onChange={e => setEntrenoEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setEntrenoModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmarEntreno} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#DB2777', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Marcar entreno</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar la hora de un hueco (solo ese día) */}
      {editHourModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#1D4ED8' }}>🕐 Editar hora — {editHourModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              El hueco de <strong>{editHourModal.originalTime}</strong> pasará a ofrecerse a la hora nueva <strong>solo este día</strong>. Para deshacerlo: pulsa el hueco nuevo → Quitar hueco. Para cambiar el horario de todos los días usa "✎ Modificar horas".
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={editHourStart} onChange={e => setEditHourStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={editHourEnd} onChange={e => setEditHourEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setEditHourModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmarEditarHora} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar hora</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nuevo hueco personalizado */}
      {customModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>🕐 Nuevo hueco — {customModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              Ej.: tras una clase de 20:00 a 21:00, ofrece de 21:00 a 22:30. ⚠️ Un hueco de madrugada (00:00) pertenece al día <strong>siguiente</strong>.
            </p>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.75rem' }}>Día
              <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} min={serverToday()}
                style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setCustomModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={crearCustomSlot} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Crear hueco</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-layout">
        {/* Sidebar */}
        <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div style={{
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: '1px solid var(--color-border)',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'relative',
          }}>
            {/* Close button (mobile only) */}
            <button className="desktop-hide" onClick={() => setIsSidebarOpen(false)} style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: '#F1F5F9', border: 'none', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem', color: '#64748B', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {/* Logo a tamaño completo, sin recortar */}
            <img src="/logo.png" alt="Padel Medina" style={{ width: '140px', objectFit: 'contain', display: 'block' }} />

            {/* Badge Panel Admin */}
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'white', background: '#1B3A6E', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>Panel Admin</span>
          </div>

          <div style={{ padding: '1.25rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: '0 0 0.5rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Menú Principal</p>
            
            {menuItems.map(item => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  className={`admin-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => { setActiveTab(item.key); localStorage.setItem('adminActiveTab', item.key); setIsSidebarOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                    padding: '0.875rem 1rem', borderRadius: '0.75rem', border: 'none',
                    backgroundColor: isActive ? '#F0FDF4' : 'transparent',
                    color: isActive ? '#16A34A' : '#475569',
                    fontFamily: 'inherit', fontWeight: isActive ? 800 : 600, fontSize: '0.95rem',
                    cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ display: 'flex', color: isActive ? '#16A34A' : '#94A3B8' }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
            <button onClick={logout} className="admin-logout" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="admin-main">
          {/* Header (hidden on desktop) */}
          <div className="admin-header desktop-hide">
            <button aria-label="Abrir panel" onClick={() => setIsSidebarOpen(true)} className="admin-burger">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="admin-header-title">
              {menuItems.find(m => m.key === activeTab)?.label.split(' (')[0]}
            </span>
            <div style={{ width: '44px', flexShrink: 0 }} />
          </div>

          <div className="admin-body">
          {/* Stats toggle header */}
          <button
            onClick={() => setShowStats(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0.5rem', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'inherit' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: showStats ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Dashboard
          </button>
          {/* Stats */}
          {showStats && (
          <>
          <div className="stats-grid">
            {[
              { label: 'Reservas hoy', value: allBookings.length, color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
              { label: 'Pistas activas', value: activeCourts, color: '#0EA5E9', bg: '#F0F9FF', border: '#BAE6FD' },
              { label: '🔒 Bloqueadas', value: bloqueadasDia.length, color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
              { label: '🏋️ Entrenos', value: entrenosDia.length, color: '#9D174D', bg: '#FBCFE8', border: '#EC4899' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '0.875rem', padding: '0.875rem 0.625rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.58rem', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>{s.label}</p>
              </div>
            ))}
          </div>
          {/* Qué pista y a qué hora: bloqueos en gris, entrenos en morado */}
          {detalleBloqueos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '-0.75rem 0 1.5rem' }}>
              {bloqueadasDia.map((s, i) => (
                <span key={`b-${i}`} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '0.28rem 0.65rem', whiteSpace: 'nowrap' }}>
                  🔒 {s.courtName} · {s.time}
                </span>
              ))}
              {entrenosDia.map((s, i) => (
                <span key={`e-${i}`} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9D174D', background: '#FBCFE8', border: '1px solid #EC4899', borderRadius: 999, padding: '0.28rem 0.65rem', whiteSpace: 'nowrap' }}>
                  🏋️ {s.courtName} · {s.time}
                </span>
              ))}
            </div>
          )}
          </>
          )}

          {/* Tabs removed in favor of sidebar */}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : (
            <>
              {/* ── TAB: HORARIO ── */}
              {activeTab === 'schedule' && (
                <div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p className="section-label">Selecciona fecha</p>
                    <input type="date" value={selectedDate} onChange={handleDateChange}
                      style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', width: '100%' }} />
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#94A3B8', textTransform: 'capitalize' }}>{formatDate(selectedDate)}</p>
                  </div>

                  {/* ── Horario de la parrilla: editable por el admin cuando quiera ── */}
                  <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {schedDraft === null ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Horario de la parrilla</p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            {scheduleCfgView.periods.map(p => `${p.start}–${p.end}`).join(' · ')} · sesiones de {scheduleCfgView.slot_minutes} min
                          </p>
                        </div>
                        <button
                          onClick={() => setSchedDraft(JSON.parse(JSON.stringify(scheduleCfgView)))}
                          style={{ padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                          ✎ Modificar horas
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Modificar horario de la parrilla</p>
                          <button onClick={() => setSchedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
                        </div>
                        <p style={{ margin: '0 0 0.875rem', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.45 }}>
                          Cada tramo (mañana / tarde) se rellena con sesiones seguidas y acaba en seco a su hora tope: la mañana llega como mucho a las 14:00 y no aparecen pistas hasta el tramo de las 16:00. Las horas NO se mueven solas: si un entreno pisa un hueco, ese hueco queda ocupado; para ofrecer otra hora usa "+ Hueco" en la pista.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
                          {schedDraft.periods.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap', padding: '0.6rem 0.75rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', alignSelf: 'center', minWidth: '58px' }}>Tramo {i + 1}</span>
                              <label style={{ flex: 1, minWidth: '110px', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Desde
                                <input type="time" value={p.start}
                                  onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, periods: d.periods.map((q, j) => j === i ? { ...q, start: v } : q) })); }}
                                  style={{ width: '100%', marginTop: 4, padding: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }} />
                              </label>
                              <label style={{ flex: 1, minWidth: '110px', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Hasta (tope)
                                <input type="time" value={p.end}
                                  onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, periods: d.periods.map((q, j) => j === i ? { ...q, end: v } : q) })); }}
                                  style={{ width: '100%', marginTop: 4, padding: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }} />
                              </label>
                              {schedDraft.periods.length > 1 && (
                                <button onClick={() => setSchedDraft(d => ({ ...d, periods: d.periods.filter((_, j) => j !== i) }))} title="Quitar este tramo"
                                  style={{ padding: '0.45rem 0.6rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', alignSelf: 'center' }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
                          <button onClick={() => setSchedDraft(d => ({ ...d, periods: [...d.periods, { start: '', end: '' }] }))}
                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.625rem', border: '1.5px dashed #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                            + Añadir tramo
                          </button>
                          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Duración de cada sesión (min)
                            <input type="number" min="30" max="240" step="15" value={schedDraft.slot_minutes}
                              onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, slot_minutes: v })); }}
                              style={{ display: 'block', width: '110px', marginTop: 4, padding: '0.45rem 0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: 700 }} />
                          </label>
                        </div>
                        {(() => {
                          // La preview usa la MISMA validación que Guardar: si
                          // algo impide guardar, aquí se ve el motivo exacto.
                          const { error: draftError, clean } = validarBorradorHorario(schedDraft);
                          return (
                            <div style={{ marginBottom: '0.875rem' }}>
                              <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Así quedará la parrilla</p>
                              {draftError ? (
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>{draftError}</p>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {buildScheduleTimes(clean).map(t => (
                                    <span key={t} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.25rem 0.55rem', borderRadius: '999px' }}>{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                          <button onClick={() => setSchedDraft(null)} disabled={savingSched}
                            style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancelar
                          </button>
                          <button onClick={guardarHorario} disabled={savingSched}
                            style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: savingSched ? '#94A3B8' : '#16A34A', color: 'white', fontWeight: 800, cursor: savingSched ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {savingSched ? 'Guardando…' : '✓ Guardar horario'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Leyenda de la rejilla: un color por estado */}
                  <div style={{ display: 'flex', gap: '0.45rem 0.9rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
                    {[
                      { label: 'Libre', s: slotColors.available },
                      { label: 'Entreno', s: slotColors.entreno },
                      { label: '✓ Reserva pagada', s: slotColors.pagado },
                      { label: '✕ Reserva sin pagar', s: slotColors.impago },
                      { label: 'Bloqueada', s: slotColors.blocked },
                    ].map(({ label, s }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: s.backgroundColor, border: `1.5px solid ${s.borderColor}`, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color }}>{label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B' }}>⏳ = pago en curso</span>
                  </div>

                  <div className="courts-list">
                    {courts.map(court => {
                      const isCourtActive = activeSlot?.courtId === court.id;
                      const selectedSlotData = isCourtActive ? slots[court.id]?.[activeSlot.time] : null;
                      return (
                        <div key={court.id} style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', opacity: court.active ? 1 : 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                          <div style={{ background: court.gradient, padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 800, color: 'white', fontSize: '0.95rem' }}>{court.name}</span>
                              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>· {court.sport} · {court.location}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                              {court.active && (
                                <button onClick={() => { setCustomModal({ courtId: court.id, courtName: court.name }); setCustomStart(''); setCustomEnd(''); setCustomDate(selectedDate); }}
                                  title="Añadir un hueco a medida (ej: 21:00 - 22:30)"
                                  style={{ fontSize: '0.68rem', fontWeight: 800, backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.45)', padding: '0.25rem 0.6rem', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  + Hueco
                                </button>
                              )}
                              {!court.active && <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.25)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>INACTIVA</span>}
                            </div>
                          </div>

                          <div style={{ padding: '0.875rem' }}>
                            <div className="slots-grid">
                              {/* La rejilla ya viene RECOLOCADA de loadSlots (misma lógica que
                                  la vista del jugador): se pinta exactamente lo que existe */}
                              {Object.keys(slots[court.id] || {})
                                .sort((a, b) => a.slice(0, 5).localeCompare(b.slice(0, 5)))
                                .map(time => {
                                const slot = slots[court.id]?.[time];
                                const esCustom = (customByCourt[court.id] || []).some(cs => cs.time === time);
                                const isSelected = activeSlot?.courtId === court.id && activeSlot?.time === time;
                                // Seleccionada: oscura (se distingue de los 5 colores de estado)
                                const c = isSelected ? slotColors.selected : colorCelda(slot);
                                return (
                                  <button key={time} disabled={!court.active} aria-pressed={isSelected}
                                    onClick={() => setActiveSlot(prev => prev?.courtId === court.id && prev?.time === time ? null : { courtId: court.id, time })}
                                    style={{ padding: '0.5rem 0.2rem', borderRadius: '0.5rem', border: `1.5px ${esCustom ? 'dashed' : 'solid'} ${c.borderColor}`, backgroundColor: c.backgroundColor, color: c.color, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', cursor: court.active ? 'pointer' : 'not-allowed', transition: 'all 0.15s', lineHeight: 1.3, boxShadow: isSelected ? '0 0 0 2px #FFFFFF, 0 0 0 4px #0F172A' : 'none' }}
                                  >
                                    <div>{slot?.conflicto ? '⚠️ ' : ''}{esCustom ? '🕐 ' : ''}{time.split(' - ')[0]}</div>
                                    {/* Pagada/sin pagar también con símbolo, no solo color
                                        (el pago en curso ya lleva ⏳ en el nombre) */}
                                    <div style={{ fontSize: '0.58rem', fontWeight: 600, marginTop: '0.15rem' }}>
                                      {slot?.status === 'booked'
                                        ? (slot.esHold ? '' : reservaPagada(slot) ? '✓ ' : '✕ ') + slot.client.split(' ')[0]
                                        : slot?.status === 'blocked' ? (slot.tipo === 'entreno' ? etiquetaEntreno(slot) : '🔒 Bloqueada') : 'Libre'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {isCourtActive && selectedSlotData && (
                              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', padding: '0.875rem', marginTop: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.875rem' }}>{activeSlot.time}</p>
                                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.775rem', color: '#64748B' }}>
                                      {selectedSlotData.status === 'booked' ? `Cliente: ${selectedSlotData.client}` : selectedSlotData.status === 'blocked' ? (selectedSlotData.tipo === 'entreno' ? '🏋️ Entreno' : '🔒 Bloqueada por administrador') : 'Franja disponible'}
                                      {selectedSlotData.status === 'booked' && selectedSlotData.userId === CLIENTE_ELIMINADO_ID && ' (borró su cuenta)'}
                                    </p>
                                    {selectedSlotData.conflicto && (
                                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.5rem', padding: '0.3rem 0.5rem' }}>
                                        ⚠️ Hay un bloqueo o entreno a esta misma hora. Revísalo: la reserva manda.
                                      </p>
                                    )}
                                  </div>
                                  <button onClick={() => { setActiveSlot(null); setBookObs(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.2rem', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                                </div>
                                {/* Resumen del pago (reserva) o del cobro (entreno), antes de las acciones */}
                                {selectedSlotData.status === 'blocked' && selectedSlotData.tipo === 'entreno' && (
                                  <ResumenEntreno
                                    key={selectedSlotData.blockedId}
                                    info={selectedSlotData.entrenoInfo}
                                    filas={selectedSlotData.entrenoFilas}
                                    conGuardado={conGuardado}
                                    onSaved={(fila, pagos) => {
                                      // Celda y resumen al momento, con lo que devolvió la BD
                                      const { courtId, time } = activeSlot;
                                      setSlots(prev => {
                                        const cel = prev[courtId]?.[time];
                                        if (!cel?.entrenoFilas) return prev;
                                        const filas = filasConPagos(cel.entrenoFilas, fila, pagos);
                                        if (filas === cel.entrenoFilas) return prev; // ya no es esa clase (cambió el día)
                                        const info = Object.values(agregarClasesMonitor(filas))[0] || null;
                                        return { ...prev, [courtId]: { ...prev[courtId], [time]: { ...cel, entrenoFilas: filas, entrenoInfo: info } } };
                                      });
                                    }}
                                    onRefrescar={() => loadSlots(selectedDate, { auto: true })}
                                  />
                                )}
                                {selectedSlotData.status === 'booked' && (
                                  <PagoReservaAdmin
                                    key={selectedSlotData.bookingId}
                                    reserva={selectedSlotData}
                                    conGuardado={conGuardado}
                                    onSaved={(patch) => {
                                      // Mantener fresco el mapa de slots del padre
                                      const { courtId, time } = activeSlot;
                                      // Un pago en curso que ya se confirmó: recargar la rejilla
                                      // para quitar el ⏳ y poner el nombre de la reserva.
                                      if (slots[courtId]?.[time]?.esHold && patch.esHold === false) loadSlots(selectedDate);
                                      setSlots(prev => {
                                        const c = prev[courtId];
                                        if (!c?.[time]) return prev;
                                        return { ...prev, [courtId]: { ...c, [time]: { ...c[time], ...patch } } };
                                      });
                                    }}
                                    onGone={() => {
                                      toast('Esta reserva ya no está activa: se canceló o el pago no se completó. Horario actualizado.', 'warning');
                                      setActiveSlot(null);
                                      loadSlots(selectedDate);
                                    }}
                                  />
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {selectedSlotData.status === 'available' && (
                                    <>
                                      {showUserPicker ? (
                                        <div style={{ width: '100%', backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', padding: '0.875rem', marginBottom: '0.5rem' }}>
                                          <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>Selecciona el jugador para esta reserva:</p>
                                          <input
                                            autoFocus
                                            type="text"
                                            placeholder="Buscar por nombre o email..."
                                            value={userSearch}
                                            onChange={e => setUserSearch(e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                                          />
                                          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            {allUsers
                                              .filter(u => (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
                                              .map(u => (
                                                <button key={u.id} onClick={() => { setSelectedUserId(u.id); setShowUserPicker(false); setUserSearch(''); }}
                                                  style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: selectedUserId === u.id ? '2px solid #16A34A' : '1px solid #E2E8F0', backgroundColor: selectedUserId === u.id ? '#F0FDF4' : 'white', cursor: 'pointer', fontSize: '0.82rem' }}>
                                                  <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>{u.name || 'Sin nombre'}</span>
                                                  <span style={{ color: '#64748B' }}>{u.email}</span>
                                                </button>
                                              ))}
                                          </div>
                                          <button onClick={() => { setShowUserPicker(false); setSelectedUserId(null); }} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                          <input
                                            value={bookObs}
                                            onChange={e => setBookObs(e.target.value)}
                                            placeholder="Nombre / observaciones (si no está registrado)"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                          />
                                          {selectedUserId && (
                                            <span style={{ fontSize: '0.78rem', backgroundColor: '#F0FDF4', color: '#16A34A', padding: '0.25rem 0.6rem', borderRadius: '999px', fontWeight: 700, border: '1px solid #86EFAC' }}>
                                              ✓ {allUsers.find(u => u.id === selectedUserId)?.name || 'Jugador seleccionado'}
                                            </span>
                                          )}
                                          <button onClick={() => {
                                            if (allUsers.length === 0) {
                                              supabase.from('profiles').select('id, name, email, phone, role').order('name')
                                                .then(({data}) => setAllUsers(data || []));
                                            }
                                            setShowUserPicker(true);
                                          }} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            👤 {selectedUserId ? 'Cambiar jugador' : 'Elegir jugador'}
                                          </button>
                                          <button disabled={isProcessing} onClick={() => handleAction('reserve')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: isProcessing ? '#94A3B8' : '#16A34A', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            {isProcessing ? 'Procesando...' : '✓ Reservar (gratis)'}
                                          </button>
                                          <button disabled={isProcessing} onClick={() => handleAction('block', { tipo: 'bloqueado' })} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🔒 Bloquear
                                          </button>
                                          {/* Entreno: el admin solo marca QUE hay clase y su horario; de cuántas
                                              personas es lo confirma el monitor al acabar el día */}
                                          <button disabled={isProcessing}
                                            onClick={() => {
                                              const [ini, fin] = activeSlot.time.split(' - ');
                                              setEntrenoModal({ courtId: court.id, courtName: court.name });
                                              setEntrenoStart(ini);
                                              setEntrenoEnd(fin);
                                            }}
                                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #F9A8D4', backgroundColor: '#FDF2F8', color: '#BE185D', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🏋️ Entreno
                                          </button>
                                          {/* Editar hora: mueve este hueco a otra hora SOLO este día */}
                                          <button disabled={isProcessing}
                                            onClick={() => {
                                              const cs = (customByCourt[court.id] || []).find(c => c.time === activeSlot.time);
                                              const [ini, fin] = activeSlot.time.split(' - ');
                                              setEditHourModal({ courtId: court.id, courtName: court.name, originalTime: activeSlot.time, customId: cs?.id || null, hides: cs?.hides || null });
                                              setEditHourStart(ini);
                                              setEditHourEnd(fin);
                                            }}
                                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #93C5FD', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🕐 Editar hora
                                          </button>
                                          {(customByCourt[court.id] || []).some(cs => cs.time === activeSlot.time) && (
                                            <button disabled={isProcessing} onClick={eliminarCustomSlot} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                              🗑️ Quitar hueco
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {selectedSlotData.status === 'booked' && (
                                    <>
                                      <button onClick={() => {
                                        const court = courts.find(c => c.id === activeSlot.courtId);
                                        setMoveBooking({ id: selectedSlotData.bookingId, courtId: activeSlot.courtId, courtName: court?.name || 'Pista', date: selectedDate, time: activeSlot.time, client: selectedSlotData.client });
                                        setMoveTargetDate(selectedDate);
                                        setMoveTargetCourtId(activeSlot.courtId);
                                        setMoveTargetTime(activeSlot.time);
                                        setMoveSlotInfo(null);
                                      }} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #2563EB', backgroundColor: '#EFF6FF', color: '#2563EB', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        ↔ Mover reserva
                                      </button>
                                      <button onClick={() => handleAction('cancel')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#DC2626', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        ✕ Cancelar reserva
                                      </button>
                                    </>
                                  )}
                                  {selectedSlotData.status === 'blocked' && (
                                    <button onClick={() => handleAction('unblock')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#0EA5E9', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                      🔓 Desbloquear
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── TAB: RESERVAS ── */}
              {activeTab === 'bookings' && (() => {
                const today = serverToday();
                const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 60);
                const maxDateStr = maxDate.getFullYear() + '-' + String(maxDate.getMonth()+1).padStart(2,'0') + '-' + String(maxDate.getDate()).padStart(2,'0');
                const startDate = new Date(); startDate.setDate(startDate.getDate() - 30);
                const startDateStr = startDate.getFullYear() + '-' + String(startDate.getMonth()+1).padStart(2,'0') + '-' + String(startDate.getDate()).padStart(2,'0');
                const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                const cancelDbBooking = async (b) => {
                  const nombre = b.profiles?.name || b.profiles?.email?.split('@')[0] || 'el cliente';
                  const esReembolsable = b.metodo_pago === 'tarjeta' || b.metodo_pago === 'bizum';
                  const ok = await confirmDialog(
                    esReembolsable
                      ? `¿Cancelar la reserva de ${nombre} (${b.time_slot})? Se pagó por ${b.metodo_pago === 'tarjeta' ? 'tarjeta' : 'Bizum'}: la DEVOLUCIÓN hay que hacerla a mano, esto no la hace.`
                      : `¿Cancelar la reserva de ${nombre} (${b.time_slot})?`,
                    { title: 'Cancelar reserva', okText: 'Cancelar reserva', danger: true }
                  );
                  if (!ok) return;
                  // Confirmar contra BD: data vacío = no se canceló (sin permiso o fila inexistente).
                  // conGuardado: que un refresco automático en vuelo no la "descancele" en pantalla.
                  const { data, error } = await conGuardado(() => supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id).select('id'));
                  if (error || !data || data.length === 0) {
                    toast(error ? 'Error al cancelar: ' + error.message : 'No se canceló: sin permiso o fila inexistente', 'error');
                    return;
                  }
                  setAllDbBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x));
                  toast('Reserva cancelada', 'success');
                  // Avisar al cliente (dueño de la reserva) por email de la cancelación.
                  if (b.profiles?.email) {
                    supabase.functions.invoke('send-booking-email', {
                      body: {
                        type: 'cancelada',
                        email: b.profiles.email,
                        userName: b.profiles.name || 'jugador/a',
                        courtName: b.courts?.name || 'Pista',
                        date: b.date,
                        timeSlot: b.time_slot,
                      },
                    }).catch(() => {});
                  }
                };
                // Cada fila según su estado. Un 'pendiente_pago' de más de 15 min,
                // o un intento online que acabó cancelado sin pagarse, NO es una
                // reserva (el jugador no terminó de pagar y el hueco quedó libre):
                // va aparte, atenuado y oculto tras un aviso.
                const filas = allDbBookings.map(b => ({ b, est: estadoFilaReserva(b, relojReservas) }));
                const noCompletados = filas.filter(f => f.est === 'pago_no_completado');
                const visibles = filas.filter(f => f.est !== 'pago_no_completado');
                const nCanceladas = visibles.filter(f => f.est === 'cancelada').length;
                const nReservas = visibles.length - nCanceladas;
                const ESTILO_FILA = {
                  confirmada:         { bg: 'white',   border: '1px solid #E2E8F0',  opacity: 1 },
                  pago_en_curso:      { bg: '#FFFBEB', border: '1px solid #FDE68A',  opacity: 1 },
                  cancelada:          { bg: '#FFF7F7', border: '1px solid #FECACA',  opacity: 0.75 },
                  pago_no_completado: { bg: '#F8FAFC', border: '1px dashed #CBD5E1', opacity: 0.6 },
                  otro:               { bg: 'white',   border: '1px solid #E2E8F0',  opacity: 1 },
                };
                const ETIQUETA_ESTADO = {
                  pago_en_curso:      { texto: '⏳ PAGO EN CURSO', bg: '#FEF3C7', color: '#92400E', detalle: 'Pagando en el banco: si no termina en 15 min, se libera el hueco.' },
                  cancelada:          { texto: '✕ CANCELADA', bg: '#FEE2E2', color: '#B91C1C', detalle: null },
                  pago_no_completado: { texto: 'PAGO NO COMPLETADO', bg: '#E2E8F0', color: '#475569', detalle: 'No es una reserva: no terminó de pagar y el hueco quedó libre.' },
                };
                const renderFila = ({ b, est }) => {
                  const st = ESTILO_FILA[est] || ESTILO_FILA.otro;
                  const tag = ETIQUETA_ESTADO[est] || (est === 'otro' ? { texto: String(b.status || '—').toUpperCase(), bg: '#F1F5F9', color: '#475569', detalle: null } : null);
                  const tachada = est === 'cancelada' || est === 'pago_no_completado';
                  const conAcciones = est === 'confirmada' || est === 'pago_en_curso' || est === 'otro';
                  const nombre = b.profiles?.name || b.profiles?.email?.split('@')[0] || 'Cliente';
                  // Mismo criterio que Finanzas: GRATIS solo la cortesía (una manual
                  // nace is_free=true pero SIN cobrar) y club/manual sin cobro
                  // confirmado = pendiente de cobro (como en el Horario).
                  const esGratis = !tachada && (b.metodo_pago === 'gratis' || (b.is_free && !b.metodo_pago));
                  const pendienteCobro = !tachada && (b.metodo_pago === 'club' || b.metodo_pago === 'manual') && !b.cobro_confirmado;
                  return (
                    <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem 0.875rem', backgroundColor: st.bg, borderRadius: '0.875rem', padding: '0.875rem', border: st.border, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', opacity: st.opacity }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '0.625rem', background: b.courts?.gradient || 'linear-gradient(135deg,#16A34A,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, filter: est === 'pago_no_completado' ? 'grayscale(1)' : 'none' }}>
                        <span style={{ fontSize: '1rem' }}>{b.courts?.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                      </div>
                      {/* Texto: ocupa lo que pueda; en móvil los botones bajan a otra línea */}
                      <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>{b.courts?.name || 'Pista'}</p>
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.775rem', color: '#64748B', textDecoration: tachada ? 'line-through' : 'none' }}>
                          {b.time_slot} · {nombre}
                        </p>
                        {(tag || esGratis || pendienteCobro || b.user_id === CLIENTE_ELIMINADO_ID) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                            {tag && <span style={{ backgroundColor: tag.bg, color: tag.color, padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>{tag.texto}</span>}
                            {esGratis && <span style={{ backgroundColor: '#F0FDF4', color: '#15803D', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>GRATIS</span>}
                            {pendienteCobro && <span style={{ backgroundColor: slotColors.impago.backgroundColor, color: slotColors.impago.color, padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>PENDIENTE DE COBRO</span>}
                            {b.user_id === CLIENTE_ELIMINADO_ID && <span style={{ fontSize: '0.7rem', color: '#64748B' }}>(borró su cuenta)</span>}
                          </div>
                        )}
                        {tag?.detalle && <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: tag.color, fontWeight: 600, lineHeight: 1.35 }}>{tag.detalle}</p>}
                      </div>
                      {conAcciones && <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
                        <button onClick={() => {
                          setMoveBooking({ id: b.id, courtId: b.court_id, courtName: b.courts?.name || 'Pista', date: b.date, time: b.time_slot, client: nombre });
                          setMoveTargetDate(b.date);
                          setMoveTargetCourtId(b.court_id);
                          setMoveTargetTime(b.time_slot);
                          setMoveSlotInfo(null);
                        }} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #2563EB', backgroundColor: '#EFF6FF', color: '#2563EB', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                          Mover
                        </button>
                        <button onClick={() => cancelDbBooking(b)}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#FEF2F2', color: '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                          Cancelar
                        </button>
                      </div>}
                    </div>
                  );
                };
                return (
                  <div>
                    <div style={{ marginBottom: '1.25rem' }}>
                      <DateSelector
                        selectedDate={bookingsDate}
                        maxValidDate={maxDateStr}
                        startDate={startDateStr}
                        onSelectDate={setBookingsDate}
                      />
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#94A3B8', textAlign: 'center' }}>
                        <span style={{ textTransform: 'capitalize' }}>{fmtDate(bookingsDate)}</span>
                        {' · '}{nReservas} reserva{nReservas !== 1 ? 's' : ''}
                        {nCanceladas > 0 && ` · ${nCanceladas} cancelada${nCanceladas !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {loadingAllBookings ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                        <div style={{ width: '28px', height: '28px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                      </div>
                    ) : (
                      <>
                        {visibles.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94A3B8' }}>
                            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.875rem', display: 'block' }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <p style={{ fontWeight: 700, margin: 0, color: '#64748B' }}>No hay reservas este día</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {visibles.map(renderFila)}
                          </div>
                        )}
                        {noCompletados.length > 0 && (
                          <div style={{ marginTop: '0.875rem' }}>
                            <button onClick={() => setVerPagosNoCompletados(v => !v)} aria-expanded={verPagosNoCompletados}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '0.75rem', padding: '0.7rem 0.875rem', cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>
                              <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', lineHeight: 1.4 }}>
                                <strong>{noCompletados.length === 1 ? '1 intento de pago no completado' : `${noCompletados.length} intentos de pago no completados`}</strong>
                                {' '}— no {noCompletados.length === 1 ? 'es una reserva' : 'son reservas'}: el jugador no terminó de pagar y el hueco quedó libre.
                              </span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>{verPagosNoCompletados ? 'Ocultar ▲' : 'Ver ▼'}</span>
                            </button>
                            {verPagosNoCompletados && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {noCompletados.map(renderFila)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ── TAB: FINANZAS ── */}
              {activeTab === 'finance' && <FinanceManager />}

              {/* ── TAB: CONTROL HORARIO ── */}
              {activeTab === 'timeclock' && <TimeClockManager />}

              {/* ── TAB: ENTRENOS ── */}
              {activeTab === 'entrenos' && <EntrenosManager />}

              {/* ── TAB: CONFIGURACIÓN ── */}
              {activeTab === 'settings' && (
                <div style={{ maxWidth: '600px' }}>
                  <p className="section-label" style={{ marginBottom: '1.5rem' }}>Ajustes Generales del Club</p>

                  {settingsLoadError && (
                    <div style={{ marginBottom: '1.25rem', padding: '0.875rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      No se pudieron cargar los ajustes. No se pueden guardar cambios hasta recargar la página (si no, se machacarían con valores por defecto).
                    </div>
                  )}

                  <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: settingsLoadError ? 0.6 : 1, pointerEvents: settingsLoadError ? 'none' : 'auto' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        Días de antelación permitidos para reservar
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Controla hasta qué día pueden ver y reservar los clientes. Por ejemplo, si pones "2" y hoy es Lunes, solo podrán ver pistas hasta el Miércoles. Si pones "7", verán una semana justa.
                      </p>
                      <input 
                        type="number" 
                        min="1" max="90"
                        value={siteSettings.booking_window_days}
                        onChange={(e) => setSiteSettings({...siteSettings, booking_window_days: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        Precio por reserva de pista (€)
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B' }}>El precio que se cobrará a los clientes tanto por tarjeta como en efectivo en el club.</p>
                      <input 
                        type="number" 
                        step="0.5" min="0"
                        value={siteSettings.court_price}
                        onChange={(e) => setSiteSettings({...siteSettings, court_price: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        🔓 Hora de apertura de reservas
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Las pistas de cada día se abren a esta hora, <strong>tantos días antes como marquen los "Días de antelación"</strong>. Por ejemplo, con antelación <strong>2</strong> y hora <strong>09:00</strong>: el jueves a las 9:00 se abre el sábado, el viernes a las 9:00 se abre el domingo, y así cada día. Los días ya abiertos siguen abiertos.
                      </p>
                      <input
                        type="time"
                        value={siteSettings.slots_release_time || '00:00'}
                        onChange={(e) => setSiteSettings({...siteSettings, slots_release_time: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        🏪 Horario de Pago en Recepción por día
                      </label>
                      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Configura para cada día si el "Pago en el Club" está disponible y a partir de qué hora. Si desactivas un día, los clientes solo podrán pagar con tarjeta o Bizum ese día.
                      </p>
                      <style>{`
                        .ch-row {
                          display: flex;
                          align-items: center;
                          gap: 0.75rem;
                          padding: 0.7rem 0.875rem;
                          border-radius: 0.75rem;
                          border: 1.5px solid;
                          flex-wrap: wrap;
                        }
                        .ch-row-head {
                          display: flex;
                          align-items: center;
                          gap: 0.75rem;
                          flex: 0 0 auto;
                        }
                        .ch-day-label {
                          width: 88px;
                          font-weight: 700;
                          font-size: 0.9rem;
                          color: #0F172A;
                        }
                        .ch-toggle {
                          flex-shrink: 0;
                          width: 44px;
                          height: 26px;
                          border-radius: 13px;
                          border: none;
                          position: relative;
                          cursor: pointer;
                          transition: background .2s;
                          padding: 0;
                        }
                        .ch-toggle-dot {
                          position: absolute;
                          width: 20px;
                          height: 20px;
                          border-radius: 50%;
                          background: white;
                          top: 3px;
                          transition: left .2s;
                          box-shadow: 0 1px 3px rgba(0,0,0,.25);
                        }
                        .ch-time-wrap {
                          display: flex;
                          align-items: center;
                          gap: 0.4rem;
                          flex: 1 1 160px;
                          min-width: 0;
                        }
                        .ch-time-input {
                          flex: 1;
                          min-width: 0;
                          min-height: 40px;
                          padding: 0.4rem 0.6rem;
                          border-radius: 0.5rem;
                          border: 1.5px solid #CBD5E1;
                          background-color: white;
                          color: #0F172A;
                          font-weight: 600;
                        }
                        @media (max-width: 480px) {
                          .ch-row { gap: 0.6rem; padding: 0.65rem 0.75rem; }
                          .ch-row-head { flex: 1 1 100%; justify-content: space-between; }
                          .ch-day-label { width: auto; }
                          .ch-time-wrap { flex: 1 1 100%; }
                        }
                      `}</style>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { key: 1, label: 'Lunes' },
                          { key: 2, label: 'Martes' },
                          { key: 3, label: 'Miércoles' },
                          { key: 4, label: 'Jueves' },
                          { key: 5, label: 'Viernes' },
                          { key: 6, label: 'Sábado' },
                          { key: 0, label: 'Domingo' },
                        ].map(({ key, label }) => {
                          const val = siteSettings.club_hours?.[key];
                          const enabled = val !== null && val !== undefined;
                          const updateHours = (newVal) => setSiteSettings(s => ({ ...s, club_hours: { ...s.club_hours, [key]: newVal } }));
                          return (
                            <div key={key} className="ch-row" style={{ borderColor: enabled ? '#BBF7D0' : '#E2E8F0', background: enabled ? '#F0FDF4' : '#F8FAFC' }}>
                              <div className="ch-row-head">
                                <span className="ch-day-label">{label}</span>
                                <button
                                  type="button"
                                  aria-label={`Pago en club ${enabled ? 'activado' : 'desactivado'} el ${label}`}
                                  onClick={() => updateHours(enabled ? null : '07:00')}
                                  className="ch-toggle"
                                  style={{ background: enabled ? '#16A34A' : '#CBD5E1' }}
                                >
                                  <span className="ch-toggle-dot" style={{ left: enabled ? '21px' : '3px' }} />
                                </button>
                              </div>
                              {enabled ? (
                                <div className="ch-time-wrap">
                                  <span style={{ fontSize: '0.78rem', color: '#64748B', whiteSpace: 'nowrap', fontWeight: 600 }}>A partir de</span>
                                  <input
                                    type="time"
                                    value={val || '00:00'}
                                    onChange={(e) => updateHours(e.target.value || '00:00')}
                                    className="ch-time-input"
                                  />
                                  {val === '00:00' && <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700, whiteSpace: 'nowrap' }}>siempre</span>}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600, flex: '1 1 auto' }}>No disponible</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        ❌ Cancelación de reservas por el cliente
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Permite o bloquea que los clientes cancelen sus propias reservas desde "Mis Reservas". Si lo activas, puedes exigir un mínimo de antelación.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.875rem', borderRadius: '0.75rem', border: '1.5px solid', borderColor: siteSettings.cancellation_enabled ? '#BBF7D0' : '#E2E8F0', background: siteSettings.cancellation_enabled ? '#F0FDF4' : '#F8FAFC' }}>
                        <button
                          type="button"
                          onClick={() => setSiteSettings(s => ({ ...s, cancellation_enabled: !s.cancellation_enabled }))}
                          style={{ flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: siteSettings.cancellation_enabled ? '#16A34A' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}
                        >
                          <span style={{ position: 'absolute', width: '16px', height: '16px', borderRadius: '50%', background: 'white', top: '3px', left: siteSettings.cancellation_enabled ? '21px' : '3px', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                          {siteSettings.cancellation_enabled ? 'Permitida' : 'No permitida'}
                        </span>
                      </div>

                      {siteSettings.cancellation_enabled && (
                        <div style={{ marginTop: '0.875rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#1E293B', fontSize: '0.85rem' }}>
                            Antelación mínima para cancelar (horas)
                          </label>
                          <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
                            A partir de cuántas horas antes del inicio de la reserva se puede cancelar. Por ejemplo, <strong>24</strong> significa que el cliente podrá cancelar si faltan 24h o más. Pon <strong>0</strong> para permitir cancelar hasta el último momento.
                          </p>
                          <input
                            type="number"
                            min="0" max="168"
                            value={siteSettings.cancellation_hours}
                            onChange={(e) => setSiteSettings({ ...siteSettings, cancellation_hours: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                          />
                        </div>
                      )}
                    </div>

                    {settingsMsg && (
                      <div style={{
                        padding: '0.875rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        backgroundColor: settingsMsg.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
                        color: settingsMsg.type === 'ok' ? '#15803D' : '#DC2626',
                        border: `1px solid ${settingsMsg.type === 'ok' ? '#86EFAC' : '#FECACA'}`,
                        animation: 'fadeIn 0.2s ease',
                      }}>
                        {settingsMsg.type === 'ok'
                          ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        }
                        {settingsMsg.text}
                      </div>
                    )}
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings || settingsLoadError}
                      style={{ marginTop: '0.5rem', padding: '0.875rem', borderRadius: '0.75rem', border: 'none', backgroundColor: (savingSettings || settingsLoadError) ? '#94A3B8' : '#16A34A', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: (savingSettings || settingsLoadError) ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s' }}
                    >
                      {savingSettings ? 'Guardando cambios...' : 'Guardar Ajustes'}
                    </button>

                  </div>
                </div>
              )}

              {/* ── TAB: PISTAS ── */}
              {activeTab === 'courts' && (
                <div>
                  <p className="section-label" style={{ marginBottom: '1rem' }}>Gestión de pistas</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {courts.map(court => {
                      const editedPrice = courtPriceEdits[court.id];
                      const displayPrice = editedPrice !== undefined ? editedPrice : (court.price != null ? court.price : siteSettings.court_price);
                      const isDirty = editedPrice !== undefined && parseFloat(editedPrice) !== (court.price != null ? court.price : siteSettings.court_price);
                      const msg = courtPriceMsg[court.id];
                      return (
                        <div key={court.id} style={{ backgroundColor: 'white', borderRadius: '1rem', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', background: court.gradient, opacity: court.active ? 1 : 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.2s' }}>
                              <span style={{ fontSize: '1.25rem' }}>{court.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: 0, fontWeight: 700, color: court.active ? '#0F172A' : '#94A3B8', fontSize: '0.95rem', transition: 'color 0.2s' }}>{court.name}</p>
                              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>{court.sport} · {court.location}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: court.active ? '#16A34A' : '#94A3B8', transition: 'color 0.2s' }}>{court.active ? 'Activa' : 'Inactiva'}</span>
                              <button onClick={() => toggleCourt(court.id)} aria-label={court.active ? 'Desactivar' : 'Activar'}
                                style={{ width: '48px', height: '26px', borderRadius: '999px', border: 'none', backgroundColor: court.active ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', top: '3px', left: court.active ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                              </button>
                            </div>
                          </div>

                          {/* Precio por pista */}
                          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px dashed #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Precio:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={displayPrice}
                                onChange={e => setCourtPriceEdits(prev => ({ ...prev, [court.id]: e.target.value }))}
                                style={{ width: '80px', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', border: `1.5px solid ${isDirty ? '#2563EB' : '#CBD5E1'}`, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', textAlign: 'right' }}
                              />
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>€</span>
                            </div>
                            {isDirty && (
                              <button
                                onClick={() => saveCourtPrice(court.id)}
                                disabled={savingCourtPrice === court.id}
                                style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: 'none', backgroundColor: savingCourtPrice === court.id ? '#94A3B8' : '#2563EB', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                              >
                                {savingCourtPrice === court.id ? '...' : 'Guardar'}
                              </button>
                            )}
                            {court.price != null && (
                              <button
                                onClick={() => useGlobalPrice(court.id)}
                                disabled={savingCourtPrice === court.id}
                                title="Quitar el precio propio y usar el global de Configuración"
                                style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: savingCourtPrice === court.id ? 'not-allowed' : 'pointer' }}
                              >
                                Usar precio global
                              </button>
                            )}
                            {msg?.type === 'ok' && <span style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 700 }}>✓ Guardado</span>}
                            {msg?.type === 'error' && <span style={{ fontSize: '0.78rem', color: '#DC2626', fontWeight: 700 }}>Error: {msg.text}</span>}
                            {court.price == null && !isDirty && (
                              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>(precio global: {siteSettings.court_price} €)</span>
                            )}
                          </div>

                          {/* Métodos de pago por franja */}
                          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px dashed #E2E8F0' }}>
                            <button
                              onClick={() => setExpandedPaymentCourt(expandedPaymentCourt === court.id ? null : court.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', borderRadius: '0.5rem', background: expandedPaymentCourt === court.id ? '#EFF6FF' : '#F8FAFC', border: `1.5px solid ${expandedPaymentCourt === court.id ? '#BFDBFE' : '#E2E8F0'}`, color: expandedPaymentCourt === court.id ? '#1D4ED8' : '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                              </svg>
                              Métodos de pago por franja
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedPaymentCourt === court.id ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>

                            {expandedPaymentCourt === court.id && (
                              <div style={{ marginTop: '0.75rem', background: '#F8FAFC', borderRadius: '0.75rem', padding: '0.75rem', border: '1px solid #E2E8F0' }}>
                                <p style={{ margin: '0 0 0.625rem', fontSize: '0.72rem', color: '#64748B', lineHeight: 1.45 }}>
                                  Marca qué métodos quedan disponibles en cada franja. Selecciona un día para configurarlo solo para ese día (por defecto la regla de "Todos los días" se aplica a los días sin regla específica). Sin marcas en una franja, los clientes no podrán pagar.
                                </p>

                                {/* Selector de día */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                                  {DAY_OPTIONS.map(opt => {
                                    const active = paymentDayFilter === opt.key;
                                    const isAll = opt.key === -1;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setPaymentDayFilter(opt.key)}
                                        style={{
                                          padding: '0.35rem 0.7rem',
                                          borderRadius: '999px',
                                          border: `1.5px solid ${active ? (isAll ? '#1D4ED8' : '#16A34A') : '#CBD5E1'}`,
                                          background: active ? (isAll ? '#1D4ED8' : '#16A34A') : 'white',
                                          color: active ? 'white' : '#475569',
                                          fontFamily: 'inherit',
                                          fontWeight: 700,
                                          fontSize: '0.72rem',
                                          cursor: 'pointer',
                                          minHeight: '34px',
                                        }}
                                      >
                                        {opt.short}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.625rem' }}>
                                  <p style={{ margin: 0, fontSize: '0.7rem', color: paymentDayFilter === -1 ? '#1D4ED8' : '#15803D', fontWeight: 700 }}>
                                    {paymentDayFilter === -1
                                      ? 'Editando regla por defecto (todos los días)'
                                      : `Editando solo ${DAY_OPTIONS.find(o => o.key === paymentDayFilter)?.label}`}
                                  </p>
                                  {paymentDayFilter !== -1 && paymentRules[court.id]?.[paymentDayFilter] && Object.keys(paymentRules[court.id][paymentDayFilter]).length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => volverAHeredado(court.id)}
                                      style={{ padding: '0.3rem 0.65rem', borderRadius: '999px', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer' }}
                                    >
                                      ↺ Volver a heredado
                                    </button>
                                  )}
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '360px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Franja</th>
                                        {ALL_METHODS.map(m => (
                                          <th key={m} style={{ textAlign: 'center', padding: '0.4rem 0.5rem', fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{METHOD_LABELS[m]}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {scheduleTimes.map(slot => {
                                        const allowed = getAllowedMethods(court.id, slot, paymentDayFilter);
                                        // Si la celda actual hereda de "Todos los días" (no hay regla propia),
                                        // la marcamos en gris claro para hacerlo visible.
                                        const isInherited = paymentDayFilter !== -1 && paymentRules[court.id]?.[paymentDayFilter]?.[slot] === undefined;
                                        return (
                                          <tr key={slot} style={{ borderTop: '1px solid #E2E8F0', opacity: isInherited ? 0.7 : 1 }}>
                                            <td style={{ padding: '0.45rem 0.5rem', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                              {slot}
                                              {isInherited && <span style={{ marginLeft: '0.4rem', fontSize: '0.62rem', color: '#94A3B8', fontWeight: 600 }}>(heredado)</span>}
                                            </td>
                                            {ALL_METHODS.map(m => {
                                              const checked = allowed.includes(m);
                                              const saving = savingPaymentCell === `${court.id}-${paymentDayFilter}-${slot}-${m}`;
                                              return (
                                                <td key={m} style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                  <button
                                                    onClick={() => !saving && togglePaymentMethod(court.id, slot, m)}
                                                    disabled={saving}
                                                    aria-label={`${checked ? 'Desactivar' : 'Activar'} ${METHOD_LABELS[m]} en ${slot}`}
                                                    style={{
                                                      width: '26px', height: '26px', borderRadius: '0.5rem',
                                                      border: `1.5px solid ${checked ? '#16A34A' : '#CBD5E1'}`,
                                                      background: checked ? '#16A34A' : 'white',
                                                      cursor: saving ? 'wait' : 'pointer',
                                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                      transition: 'all 0.15s',
                                                      opacity: saving ? 0.6 : 1,
                                                    }}
                                                  >
                                                    {checked && (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12"/>
                                                      </svg>
                                                    )}
                                                  </button>
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '0.875rem', border: '1px solid #86EFAC' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803D', fontWeight: 500, lineHeight: 1.55 }}>
                      Las pistas desactivadas no aceptan nuevas reservas. Puedes poner el precio a <strong>0 €</strong> para que una pista sea gratuita. Si no se asigna precio individual, se usa el precio global de Configuración.
                    </p>
                  </div>
                </div>
              )}
              {/* ── TAB: JUGADORES ── */}
              {activeTab === 'users' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <p className="section-label" style={{ margin: 0 }}>Directorio de Jugadores</p>
                    <button onClick={async () => {
                      const { data } = await supabase.from('profiles').select('id, name, email, phone, role').order('name');
                      setAllUsers(data || []);
                    }} style={{ padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                      ↻ Actualizar lista
                    </button>
                  </div>
                  <UserDirectoryTab supabase={supabase} allUsers={allUsers} setAllUsers={setAllUsers} />
                </div>
              )}
              {/* ── TAB: TORNEOS ── */}
              {activeTab === 'tournaments' && <TournamentManager />}

              {/* ── TAB: EVENTOS ── */}
              {activeTab === 'events' && <EventsManager />}

            </>
          )}
        </div>
      </div>
    </div>

    {/* ── MODAL: MOVER RESERVA ── */}
    {moveBooking && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setMoveBooking(null); }}>
        <div style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: 'white', fontSize: '1.05rem' }}>Mover reserva</p>
              <p style={{ margin: '0.2rem 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>{moveBooking.client} · {moveBooking.courtName}</p>
            </div>
            <button onClick={() => setMoveBooking(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'white', fontSize: '1rem', lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reserva actual</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#0F172A', fontWeight: 600 }}>
                {moveBooking.courtName} · {formatDate(moveBooking.date)} · {moveBooking.time}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva fecha</label>
              <input type="date" value={moveTargetDate} onChange={e => setMoveTargetDate(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva pista</label>
              <select value={moveTargetCourtId} onChange={e => setMoveTargetCourtId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, backgroundColor: 'white', boxSizing: 'border-box' }}>
                {courts.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva franja horaria</label>
              <select value={moveTargetTime} onChange={e => setMoveTargetTime(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, backgroundColor: 'white', boxSizing: 'border-box' }}>
                <option value="">— Selecciona franja —</option>
                {scheduleTimes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {moveSlotInfo === 'checking' && (
              <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center' }}>Comprobando disponibilidad...</p>
            )}
            {moveSlotInfo === 'available' && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#15803D', fontWeight: 700, fontSize: '0.875rem' }}>
                ✓ Franja disponible
              </div>
            )}
            {moveSlotInfo === 'conflict' && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontWeight: 700, fontSize: '0.875rem' }}>
                ✕ Franja ocupada o bloqueada — elige otra
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setMoveBooking(null)} style={{ flex: 1, padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                disabled={moveSlotInfo !== 'available' || isProcessing}
                onClick={handleMoveBooking}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '0.75rem', border: 'none', background: moveSlotInfo === 'available' && !isProcessing ? '#16A34A' : '#CBD5E1', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: moveSlotInfo === 'available' && !isProcessing ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                {isProcessing ? 'Moviendo...' : '↔ Confirmar traslado'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
);
};

export default AdminDashboard;
