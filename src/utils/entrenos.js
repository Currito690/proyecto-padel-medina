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

// ¿Una RESERVA de pista está cobrada? Para el color pagado/sin pagar.
// OJO: no se mira is_free: una reserva MANUAL del admin nace is_free=true pero
// SIN cobrar (es "pendiente de cobro en mostrador"), y pasa a is_free=false al
// cobrarla; por eso aquí mandan el método y cobro_confirmado, no is_free.
//   pagada = pagó online (tarjeta/bizum y, si es split, los 4), o es 'gratis'
//            (cortesía), o se confirmó el cobro (club / manual cobrado).
//   Un hold (pago en curso en el banco) NO cuenta como pagada.
export function reservaPagada({ metodo, cobroConfirmado, esHold, paymentType, splitPaid } = {}) {
  if (esHold) return false;                           // pago en curso: aún no
  if (metodo === 'gratis') return true;               // cortesía: nada que cobrar
  if (metodo === 'tarjeta' || metodo === 'bizum') {   // pagada online…
    if (paymentType === 'split') return Number(splitPaid) >= 4; // …el split, solo si pagaron los 4
    return true;
  }
  return !!cobroConfirmado;                            // club / manual: pagada si se confirmó el cobro
}
