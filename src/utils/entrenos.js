// Estado de cobro de un ENTRENO (clase del monitor), derivado de clases_monitor.
// Lo marca el monitor (Lolo) alumno por alumno; aquí lo resumimos para pintar
// la celda del entreno en las parrillas de pistas (admin y monitor).
//
// Acepta la fila tal cual la usa la agenda del monitor ({ personas, pagos:[...] })
// o la forma agregada del panel del admin ({ personas, pagados }).
//   'sin'     → el monitor aún no ha confirmado la clase (no hay datos de pago)
//   'impago'  → confirmada, pero nadie ha pagado todavía
//   'parcial' → confirmada, han pagado algunos alumnos (no todos)
//   'pagado'  → confirmada, han pagado todos los alumnos
export function estadoPagoEntreno(conf) {
  if (!conf) return 'sin';
  const personas = Number(conf.personas) || 0;
  if (personas <= 0) return 'sin';
  const pagados = Array.isArray(conf.pagos)
    ? conf.pagos.filter(Boolean).length
    : (Number(conf.pagados) || 0);
  if (pagados >= personas) return 'pagado';
  if (pagados > 0) return 'parcial';
  return 'impago';
}

// Nº de alumnos que han pagado (para mostrar "2/3"), tolerante a las dos formas.
export function pagadosDeEntreno(conf) {
  if (!conf) return 0;
  return Array.isArray(conf.pagos)
    ? conf.pagos.filter(Boolean).length
    : (Number(conf.pagados) || 0);
}

// ¿El entreno está PAGADO del todo? (han pagado todos los alumnos confirmados)
export function entrenoPagado(conf) {
  return estadoPagoEntreno(conf) === 'pagado';
}

// Nº de posiciones con método marcado en un array de pagos (null = sin marcar).
// Vale para bookings.pagos_jugadores y para clases_monitor.pagos.
export function contarMarcados(pagos) {
  return Array.isArray(pagos) ? pagos.filter(Boolean).length : 0;
}

// ¿Una RESERVA de pista está cobrada? Para el color pagado/sin pagar.
// OJO: no se mira is_free: una reserva MANUAL del admin nace is_free=true pero
// SIN cobrar (es "pendiente de cobro en mostrador"), y pasa a is_free=false al
// cobrarla; por eso aquí mandan el método y cobro_confirmado, no is_free.
//   pagada = pagó online (tarjeta/bizum y, si es split, los 4), o es 'gratis'
//            (cortesía), o se confirmó el cobro (club / manual cobrado).
//   Un hold (pago en curso en el banco) NO cuenta como pagada.
//
// Pago compartido (split): cuenta como pagada si han pagado los 4 (ver
// pagadosSplit) o si el admin confirmó el cobro de la pista ("Marcar pista
// pagada"). Sin esto, el split se quedaba en rojo aunque el admin hubiera
// marcado los pagos (Finanzas cuenta lo online como cobrado).
// En club/manual NO se mira pagos_jugadores: el trigger
// bookings_autoconfirma_por_pagos convierte "4 marcados" en cobro_confirmado,
// y si después alguien deshizo el cobro, Finanzas la da por pendiente: aquí
// también (mismo criterio que Finanzas, que solo mira cobro_confirmado).
// pagosJugadores es opcional: quien no lo pase tiene la regla de siempre.
export function reservaPagada({ metodo, cobroConfirmado, esHold, paymentType, splitPaid, pagosJugadores } = {}) {
  if (esHold) return false;                           // pago en curso: aún no
  if (metodo === 'gratis') return true;               // cortesía: nada que cobrar
  if (metodo === 'tarjeta' || metodo === 'bizum') {   // pagada online…
    if (paymentType === 'split') {                    // …el split, solo si está pagado entero
      return pagadosSplit(splitPaid, pagosJugadores) >= 4 || !!cobroConfirmado;
    }
    return true;
  }
  return !!cobroConfirmado;                            // club / manual: pagada si se confirmó el cobro
}

// Pago compartido: cuántos de los 4 jugadores han pagado su parte.
// El Jugador 1 es SIEMPRE quien reservó: pagó su parte online al reservar y
// split_paid ya la incluye. Las otras 3 partes salen de split_paid (pagos por
// enlace o "+1" en el club) o de lo marcado en los Jugadores 2-4 de
// pagos_jugadores (datos antiguos): el mayor de los dos, porque pueden ser los
// mismos pagos apuntados de dos formas. Sin pagosJugadores = split_paid.
export function pagadosSplit(splitPaid, pagosJugadores) {
  const sp = Math.min(4, Math.max(1, Math.trunc(Number(splitPaid)) || 1));
  const marcasOtros = Array.isArray(pagosJugadores) ? contarMarcados(pagosJugadores.slice(1, 4)) : 0;
  return Math.min(4, 1 + Math.max(sp - 1, marcasOtros));
}

// ── Pagos al detalle para el panel del admin ──────────────────────────────

// Un intento de pago con el banco ('pendiente_pago') solo retiene el hueco 15 min.
export const HOLD_MS = 15 * 60 * 1000;

// ¿Este 'pendiente_pago' ya caducó? (el jugador no terminó de pagar en 15 min:
// NO es una reserva y el hueco está libre). Sin created_at fiable se da por
// caducado, igual que hace la rejilla del Horario al descartarlo.
export function pagoCaducado(b, ahora = Date.now()) {
  if (!b || b.status !== 'pendiente_pago') return false;
  const t = new Date(b.created_at).getTime();
  if (!Number.isFinite(t)) return true;
  return ahora - t >= HOLD_MS;
}

// ¿Esta fila 'cancelled' es en realidad un pago online que no se completó? (el
// jugador volvió del banco sin pagar, el banco lo rechazó o falló antes de
// llegar: el intento pasa a 'cancelled'). El intento se crea SIN importe y
// redsys-notify solo lo rellena al confirmar el pago; desde la migración
// bookings_importe_y_reminder (2 de octubre de 2026) toda reserva online
// confirmada lo tiene. Así que tarjeta/bizum + sin importe + creada desde
// entonces = no llegó a ser reserva. Las anteriores (sin importe aunque se
// pagaran) no se pueden distinguir y siguen saliendo como canceladas; si la
// columna importe no viene en la fila, tampoco se arriesga.
const IMPORTE_ONLINE_DESDE = Date.parse('2026-10-03T00:00:00+02:00');
export function pagoOnlineNoCompletado(b) {
  if (b?.status !== 'cancelled') return false;
  if (b.metodo_pago !== 'tarjeta' && b.metodo_pago !== 'bizum') return false;
  if (!('importe' in b) || b.importe != null) return false;
  const t = new Date(b.created_at).getTime();
  return Number.isFinite(t) && t >= IMPORTE_ONLINE_DESDE;
}

// Cómo pintar una fila de la pestaña "Reservas":
//   'confirmada' | 'pago_en_curso' (< 15 min)
//   | 'pago_no_completado' ('pendiente_pago' de >= 15 min, o intento online
//     que acabó en 'cancelled' sin llegar a pagarse)
//   | 'cancelada' | 'otro' (estado desconocido)
export function estadoFilaReserva(b, ahora = Date.now()) {
  switch (b?.status) {
    case 'confirmed': return 'confirmada';
    case 'cancelled': return pagoOnlineNoCompletado(b) ? 'pago_no_completado' : 'cancelada';
    case 'pendiente_pago': return pagoCaducado(b, ahora) ? 'pago_no_completado' : 'pago_en_curso';
    default: return 'otro';
  }
}

// Nombre legible de cada método (reservas: metodo_pago y pagos_jugadores;
// entrenos: clases_monitor.pagos, donde 'mano' = efectivo en mano).
export const NOMBRE_METODO = {
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  club: 'En el club',
  mano: 'En mano',
  manual: 'Manual',
  gratis: 'Gratis',
  pagado: 'Pagado',
};
export const nombreMetodo = (m) => NOMBRE_METODO[m] || (m ? String(m) : '');

// "1 de 4 jugadores ha pagado" / "3 de 4 jugadores han pagado"
function textoXdeN(pagados, total, singular, plural) {
  const verbo = pagados === 1 || total === 1 ? 'ha' : 'han';
  return `${pagados} de ${total} ${total === 1 ? singular : plural} ${verbo} pagado`;
}

const euros = (n) => `${n.toFixed(2).replace('.', ',')} €`;

// Resumen del PAGO de una reserva para el admin al pulsarla en su Horario.
// Recibe la reserva con la forma de la celda del Horario:
//   { metodo, isFree, cobroConfirmado, esHold, paymentType, splitPaid,
//     pagosJugadores, importe }
// Devuelve:
//   estado        'pagada' | 'sin_pagar' | 'en_curso' (hold: también sin pagar)
//   pagada        boolean (= reservaPagada)
//   etiqueta      'Pagada' | 'Sin pagar' | 'Sin pagar · pago en curso'
//   metodoTexto   'Tarjeta', 'Bizum', 'En el club', 'Manual · pendiente de cobro',
//                 'Manual · cobrada', 'Gratis · cortesía', 'Pago compartido'…
//   importe / importeTexto  (null si no hay importe guardado)
//   nadaQueCobrar true en las de cortesía
//   pagados       nº de jugadores (de 4) con su parte pagada
//   textoPagados  "X de 4 jugadores han pagado" (o el aviso que toque)
//   jugadores     [{ n, estado: 'pagado'|'incluido'|'sin_pagar', metodo, texto }]
//                 'incluido' = cubierto por un pago de la pista entera
//   nota          aclaración en una frase (o null)
export function resumenPagoReserva(r = {}) {
  const { metodo, cobroConfirmado, esHold, paymentType, splitPaid, pagosJugadores, importe } = r;
  const split = paymentType === 'split';
  const online = metodo === 'tarjeta' || metodo === 'bizum';
  const gratis = metodo === 'gratis';
  const pagada = reservaPagada(r);
  const marcas = [0, 1, 2, 3].map(i => (Array.isArray(pagosJugadores) && pagosJugadores[i]) || null);
  const marcados = contarMarcados(marcas);

  let metodoTexto;
  if (split) metodoTexto = 'Pago compartido';
  else if (online || metodo === 'club') metodoTexto = nombreMetodo(metodo);
  else if (metodo === 'manual') metodoTexto = cobroConfirmado ? 'Manual · cobrada' : 'Manual · pendiente de cobro';
  else if (gratis) metodoTexto = 'Gratis · cortesía';
  else metodoTexto = 'Sin método (reserva antigua)';

  const imp = Number.parseFloat(importe);
  const importeNum = Number.isFinite(imp) && imp > 0 ? imp : null;
  // En split, bookings.importe guarda solo la parte (1/4) de quien reservó.
  const importeTexto = importeNum == null ? null : (split ? `${euros(importeNum)} por jugador` : euros(importeNum));

  // Jugadores: primero lo marcado a mano (pagos_jugadores)…
  const jugadores = marcas.map((m, i) => (m
    ? { n: i + 1, estado: 'pagado', metodo: m, texto: nombreMetodo(m) }
    : { n: i + 1, estado: 'sin_pagar', metodo: null, texto: 'Sin pagar' }));

  if (!esHold) {
    // …en split, el Jugador 1 es siempre quien reservó (pagó su parte online
    // al crear la reserva) y el resto de split_paid se reparte entre los
    // Jugadores 2-4 que nadie ha marcado (mismo recuento que pagadosSplit).
    if (split) {
      const j1 = jugadores[0];
      if (j1.estado === 'sin_pagar') {
        j1.estado = 'pagado';
        j1.metodo = online ? metodo : null;
        j1.texto = online ? `${nombreMetodo(metodo)} (quien reservó)` : 'Pagado (quien reservó)';
      }
      let faltan = pagadosSplit(splitPaid, marcas) - 1 - contarMarcados(marcas.slice(1));
      for (const j of jugadores.slice(1)) {
        if (faltan <= 0) break;
        if (j.estado !== 'sin_pagar') continue;
        j.estado = 'pagado';
        j.metodo = null;
        j.texto = 'Pagado';
        faltan--;
      }
    }
    // …y si la pista está pagada entera, el resto va incluido en ese pago.
    if (pagada) {
      const texto = gratis ? 'Cortesía' : (online && !split) ? 'Incluido en el pago' : 'Cobrado con la pista';
      jugadores.forEach(j => {
        if (j.estado === 'sin_pagar') { j.estado = 'incluido'; j.texto = texto; }
      });
    }
  }
  const cubiertosPorCobro = jugadores.filter(j => j.texto === 'Cobrado con la pista').length;

  const pagados = jugadores.filter(j => j.estado !== 'sin_pagar').length;

  let textoPagados;
  if (esHold) textoPagados = 'Pago en curso con el banco';
  else if (gratis) textoPagados = 'Cortesía: no hay nada que cobrar';
  else textoPagados = textoXdeN(pagados, 4, 'jugador', 'jugadores');

  let nota = null;
  if (esHold) {
    nota = 'El jugador está pagando en el banco. Si no termina en 15 minutos, el hueco se libera solo.';
  } else if (online && !split) {
    nota = `La pista se pagó entera ${metodo === 'bizum' ? 'por Bizum' : 'con tarjeta'} al reservar.`;
  } else if (!pagada && !gratis && marcados >= 4) {
    nota = 'Los 4 jugadores están marcados, pero el cobro de la pista está deshecho (en Finanzas figura pendiente). Si ya está cobrada, pulsa «Marcar pista pagada».';
  } else if (cubiertosPorCobro > 0) {
    nota = 'Cobro de la pista confirmado (también consta en Finanzas).';
  }

  return {
    estado: esHold ? 'en_curso' : (pagada ? 'pagada' : 'sin_pagar'),
    pagada,
    etiqueta: esHold ? 'Sin pagar · pago en curso' : (pagada ? 'Pagada' : 'Sin pagar'),
    metodo: metodo || null,
    metodoTexto,
    importe: importeNum,
    importeTexto,
    nadaQueCobrar: gratis,
    total: 4,
    pagados,
    textoPagados,
    jugadores,
    nota,
  };
}

// Suma las confirmaciones de clases_monitor por pista y hora (clave
// "court_id|time_slot"). Si en la misma pista/hora hay varios monitores, se
// suman sus alumnos y sus pagos (los de cada uno, en orden). De cada fila solo
// cuentan los `personas` primeros pagos (si el monitor bajó el nº de alumnos,
// los pagos sobrantes no son de nadie).
//   → { [clave]: { personas, pagos: [...], pagados, monitores } }
export function agregarClasesMonitor(filas) {
  const out = {};
  (Array.isArray(filas) ? filas : []).forEach(c => {
    const key = `${c.court_id}|${c.time_slot}`;
    const personas = Math.max(0, Number(c.personas) || 0);
    const raw = Array.isArray(c.pagos) ? c.pagos : [];
    const pagos = Array.from({ length: personas }, (_, i) => raw[i] || null);
    const prev = out[key] || { personas: 0, pagos: [], pagados: 0, monitores: 0 };
    out[key] = {
      personas: prev.personas + personas,
      pagos: [...prev.pagos, ...pagos],
      pagados: prev.pagados + contarMarcados(pagos),
      monitores: prev.monitores + 1,
    };
  });
  return out;
}

// Resumen del cobro de un ENTRENO para el admin al pulsarlo en su Horario.
// conf = una entrada de agregarClasesMonitor (o una fila de clases_monitor);
// null/sin personas = el monitor aún no ha confirmado la clase.
//   → { confirmado, personas, pagados, estado (estadoPagoEntreno), texto,
//       alumnos: [{ n, pagado, metodo, texto }] }
export function resumenPagoEntreno(conf) {
  const personas = Math.max(0, Number(conf?.personas) || 0);
  if (!conf || personas <= 0) {
    return { confirmado: false, personas: 0, pagados: 0, estado: 'sin', texto: 'El monitor aún no ha confirmado la clase', alumnos: [] };
  }
  // Forma antigua sin detalle ({ personas, pagados }): solo se sabe cuántos.
  const pagos = Array.isArray(conf.pagos)
    ? conf.pagos
    : Array.from({ length: Number(conf.pagados) || 0 }, () => 'pagado');
  const alumnos = Array.from({ length: personas }, (_, i) => {
    const m = pagos[i] || null;
    return m
      ? { n: i + 1, pagado: true, metodo: m, texto: nombreMetodo(m) }
      : { n: i + 1, pagado: false, metodo: null, texto: 'Sin pagar' };
  });
  const pagados = alumnos.filter(a => a.pagado).length;
  return {
    confirmado: true,
    personas,
    pagados,
    estado: estadoPagoEntreno({ personas, pagados }),
    texto: textoXdeN(pagados, personas, 'alumno', 'alumnos'),
    alumnos,
  };
}
