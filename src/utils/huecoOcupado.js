// Aviso para el jugador cuando la base de datos no le deja guardar una reserva
// porque el hueco ya no está libre:
//   · PM409: la hora pisa un bloqueo del club (bloqueo, entreno o partido del
//     torneo) u otra reserva viva aunque tenga otro texto, o la franja no es
//     válida. Lo lanza el trigger trg_zz_bookings_rechaza_solapes (migración
//     20261114110000_bookings_rechaza_solapes.sql) y el mensaje ya viene en
//     español, con la pista, el día y la hora (sirve en un carrito de varias).
//   · 23505: candado único (otra reserva viva con la MISMA hora exacta). Con el
//     trigger casi no se ve: solo si choca justo a la vez con una del admin o
//     de un pago con tarjeta que se está confirmando.
// Devuelve el texto para el jugador, o null si el error es de otro tipo.
export function avisoHuecoOcupado(err) {
  if (!err) return null;
  if (err.code === 'PM409' || err.hint === 'PISTA_NO_DISPONIBLE' || err.hint === 'FRANJA_NO_VALIDA') {
    return err.message || 'Esa hora ya no está libre en esa pista. Elige otra, por favor.';
  }
  if (err.code === '23505') return 'Otro jugador acaba de quedarse ese hueco. Elige otra hora, por favor.';
  return null;
}
