// Pruebas del recordatorio de pista (lógica pura). Se ejecutan con Node 24:
//   node --test "supabase/functions/_shared/recordatorio.test.ts"
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caducidadAviso,
  construirAviso,
  cuandoEs,
  decidir,
  estaEnSilencio,
  horasFranja,
  inicioReserva,
  instanteDesdePared,
  leerInstante,
  leerPared,
  paredMadrid,
  planificar,
  textoPared,
} from './recordatorio.ts';
import type { Plan } from './recordatorio.ts';

// '2026-10-15 10:00' (hora de Madrid) → hora de pared en ms.
function P(texto: string): number {
  const v = leerPared(texto);
  assert.ok(v !== null, `fecha de prueba mal escrita: ${texto}`);
  return v as number;
}

// Momento en que se hizo la reserva (hora de Madrid) → created_at tal cual lo
// devuelve la API (UTC con zona).
function creadaEn(texto: string): string {
  return new Date(instanteDesdePared(P(texto))).toISOString().replace('Z', '+00:00');
}

// Hora de envío planificada ('YYYY-MM-DD HH:MM') o null si no hay recordatorio.
function envio(date: string, slot: string, creada?: string): string | null {
  const plan = planificar({ date, time_slot: slot, created_at: creada ? creadaEn(creada) : null });
  return plan ? textoPared(plan.envio) : null;
}

const HACE_DIAS = '2026-10-01 12:00';

describe('hora de pared de Madrid', () => {
  test('verano (UTC+2)', () => {
    assert.equal(textoPared(paredMadrid(Date.parse('2026-10-14T08:00:00Z'))), '2026-10-14 10:00');
  });

  test('invierno (UTC+1)', () => {
    assert.equal(textoPared(paredMadrid(Date.parse('2027-01-10T08:00:00Z'))), '2027-01-10 09:00');
  });

  test('medianoche sale como 00:00 (no 24:00) y cambia de día', () => {
    assert.equal(textoPared(paredMadrid(Date.parse('2026-10-14T22:00:00Z'))), '2026-10-15 00:00');
  });

  test('ida y vuelta pared ↔ instante', () => {
    for (const t of ['2026-10-14 23:30', '2027-01-10 09:00', '2026-07-01 00:15']) {
      assert.equal(textoPared(paredMadrid(instanteDesdePared(P(t)))), t);
    }
    assert.equal(new Date(instanteDesdePared(P('2026-10-14 10:00'))).toISOString(), '2026-10-14T08:00:00.000Z');
    assert.equal(new Date(instanteDesdePared(P('2027-01-10 10:00'))).toISOString(), '2027-01-10T09:00:00.000Z');
  });

  test('lee created_at con microsegundos y con formato de Postgres', () => {
    assert.equal(leerInstante('2026-10-14T21:30:00.123456+00:00'), Date.parse('2026-10-14T21:30:00.123Z'));
    assert.equal(leerInstante('2026-10-14 21:30:00.5+00'), Date.parse('2026-10-14T21:30:00.500Z'));
    assert.equal(leerInstante(null), null);
    assert.equal(leerInstante('basura'), null);
  });

  test('rechaza fechas y horas imposibles', () => {
    assert.equal(leerPared('2026-02-30'), null);
    assert.equal(leerPared('2026-10-15 25:00'), null);
    assert.equal(inicioReserva('2026-10-15', 'sin hora'), null);
    assert.equal(inicioReserva('15/10/2026', '10:00 - 11:30'), null);
  });
});

describe('silencio nocturno (22:00 a 09:00)', () => {
  test('bordes exactos', () => {
    assert.equal(estaEnSilencio(P('2026-10-15 21:59')), false);
    assert.equal(estaEnSilencio(P('2026-10-15 22:00')), true);
    assert.equal(estaEnSilencio(P('2026-10-16 00:00')), true);
    assert.equal(estaEnSilencio(P('2026-10-16 08:59')), true);
    assert.equal(estaEnSilencio(P('2026-10-16 09:00')), false);
  });
});

describe('planificar: ejemplos del club', () => {
  test('pista a las 10:00 reservada hace días → la víspera a las 21:00', () => {
    assert.equal(envio('2026-10-16', '10:00 - 11:30', HACE_DIAS), '2026-10-15 21:00');
  });

  test('pista a las 18:00 → a las 15:00', () => {
    assert.equal(envio('2026-10-16', '18:00 - 19:30', HACE_DIAS), '2026-10-16 15:00');
  });

  test('pista a las 12:00 → a las 09:00 del mismo día', () => {
    assert.equal(envio('2026-10-16', '12:00 - 13:30', HACE_DIAS), '2026-10-16 09:00');
  });

  test('pista a las 11:30 → la víspera a las 21:00', () => {
    assert.equal(envio('2026-10-16', '11:30 - 13:00', HACE_DIAS), '2026-10-15 21:00');
  });

  test('reserva hecha a las 23:30 para mañana a las 10:00 → 09:00 (justo 1 h antes)', () => {
    assert.equal(envio('2026-10-15', '10:00 - 11:30', '2026-10-14 23:30'), '2026-10-15 09:00');
  });

  test('reserva hecha a las 13:00 para hoy a las 15:00 → sin recordatorio', () => {
    assert.equal(envio('2026-10-15', '15:00 - 16:30', '2026-10-15 13:00'), null);
  });

  test('reserva hecha a las 10:00 para hoy a las 17:00 → a las 14:00', () => {
    assert.equal(envio('2026-10-15', '17:00 - 18:30', '2026-10-15 10:00'), '2026-10-15 14:00');
  });

  test('reserva hecha a las 20:30 para mañana a las 10:00 → 09:00', () => {
    assert.equal(envio('2026-10-16', '10:00 - 11:30', '2026-10-15 20:30'), '2026-10-16 09:00');
  });

  test('reserva hecha a las 21:30 para mañana a las 09:00 → sin recordatorio', () => {
    assert.equal(envio('2026-10-16', '09:00 - 10:30', '2026-10-15 21:30'), null);
  });

  test('sin created_at se usa la hora ideal', () => {
    assert.equal(envio('2026-10-16', '18:00 - 19:30'), '2026-10-16 15:00');
    assert.equal(envio('2026-10-16', '10:00 - 11:30'), '2026-10-15 21:00');
  });
});

describe('planificar: bordes', () => {
  test('víspera a fin de mes, de año y en febrero', () => {
    assert.equal(envio('2026-11-01', '10:00 - 11:30', HACE_DIAS), '2026-10-31 21:00');
    assert.equal(envio('2027-01-01', '08:00 - 09:30', '2026-12-01 10:00'), '2026-12-31 21:00');
    assert.equal(envio('2026-03-01', '09:30 - 11:00', '2026-02-01 10:00'), '2026-02-28 21:00');
    assert.equal(envio('2028-03-01', '10:00 - 11:30', '2028-02-01 10:00'), '2028-02-29 21:00');
  });

  test('ideal a las 09:00 exactas se queda; a las 08:45 pasa a la víspera', () => {
    assert.equal(envio('2026-10-16', '12:00 - 13:30', HACE_DIAS), '2026-10-16 09:00');
    assert.equal(envio('2026-10-16', '11:45 - 13:15', HACE_DIAS), '2026-10-15 21:00');
  });

  test('ideal a las 22:00 exactas → a las 21:00 de ese mismo día', () => {
    assert.equal(envio('2026-10-16', '01:00 - 02:30', HACE_DIAS), '2026-10-15 21:00');
  });

  test('ideal a las 21:30 (pista a las 00:30) se queda en la víspera a las 21:30', () => {
    assert.equal(envio('2026-10-16', '00:30 - 02:00', HACE_DIAS), '2026-10-15 21:30');
  });

  test('reservada a las 07:00 para las 11:00 → a las 09:00 exactas', () => {
    assert.equal(envio('2026-10-16', '11:00 - 12:30', '2026-10-16 07:00'), '2026-10-16 09:00');
  });

  test('2 h después de reservar cae a las 22:00 exactas → 09:00 del día siguiente', () => {
    assert.equal(envio('2026-10-16', '10:00 - 11:30', '2026-10-15 20:00'), '2026-10-16 09:00');
  });

  test('2 h después de reservar cae a las 21:59 → en la pasada de las 21:30', () => {
    assert.equal(envio('2026-10-16', '11:00 - 12:30', '2026-10-15 19:59'), '2026-10-15 21:30');
  });

  test('reservada a las 19:45 para mañana a las 09:00 o 09:30 → 21:30 (antes se perdía)', () => {
    assert.equal(envio('2026-10-16', '09:00 - 10:30', '2026-10-15 19:45'), '2026-10-15 21:30');
    assert.equal(envio('2026-10-16', '09:30 - 11:00', '2026-10-15 19:45'), '2026-10-15 21:30');
    assert.equal(envio('2026-10-16', '08:00 - 09:30', '2026-10-15 19:31'), '2026-10-15 21:30');
  });

  test('2 h después de reservar a las 21:30 exactas se queda', () => {
    assert.equal(envio('2026-10-16', '09:00 - 10:30', '2026-10-15 19:30'), '2026-10-15 21:30');
  });

  test('ideal a las 21:45 (pista a las 00:45) → a las 21:30', () => {
    assert.equal(envio('2026-10-16', '00:45 - 02:15', HACE_DIAS), '2026-10-15 21:30');
  });

  test('envío justo 1 h antes vale; 1 minuto después ya no', () => {
    assert.equal(envio('2026-10-15', '15:00 - 16:30', '2026-10-15 12:00'), '2026-10-15 14:00');
    assert.equal(envio('2026-10-15', '15:00 - 16:30', '2026-10-15 12:01'), null);
  });

  test('reserva hecha mucho antes no cambia el ideal', () => {
    assert.equal(envio('2026-10-16', '18:00 - 19:30', '2026-10-16 08:00'), '2026-10-16 15:00');
  });

  test('franja con hora de un dígito', () => {
    assert.equal(envio('2026-10-16', '9:00 - 10:30', HACE_DIAS), '2026-10-15 21:00');
  });

  test('datos que no se entienden → sin recordatorio', () => {
    assert.equal(planificar({ date: '2026-10-16', time_slot: '' }), null);
    assert.equal(planificar({ date: '', time_slot: '10:00 - 11:30' }), null);
  });
});

describe('decidir en cada pasada del cron', () => {
  const plan18: Plan = { inicio: P('2026-10-16 18:00'), envio: P('2026-10-16 15:00') };

  test('antes de la hora espera; a la hora envía', () => {
    assert.equal(decidir(P('2026-10-16 14:30'), plan18), 'esperar');
    assert.equal(decidir(P('2026-10-16 15:00'), plan18), 'enviar');
    assert.equal(decidir(P('2026-10-16 16:30'), plan18), 'enviar');
  });

  test('hasta 30 min antes del partido; después se descarta', () => {
    assert.equal(decidir(P('2026-10-16 17:30'), plan18), 'enviar');
    assert.equal(decidir(P('2026-10-16 17:31'), plan18), 'descartar');
  });

  test('reserva ya empezada o jugada → descartar', () => {
    assert.equal(decidir(P('2026-10-16 18:10'), plan18), 'descartar');
    assert.equal(decidir(P('2026-10-17 10:00'), plan18), 'descartar');
  });

  test('sin plan → descartar', () => {
    assert.equal(decidir(P('2026-10-16 10:00'), null), 'descartar');
  });

  test('cron a las 22:00 con un envío pendiente de las 21:30 → espera a las 09:00', () => {
    const plan = planificar({ date: '2026-10-16', time_slot: '10:00 - 11:30', created_at: creadaEn('2026-10-15 19:30') });
    assert.ok(plan);
    assert.equal(textoPared(plan.envio), '2026-10-15 21:30');
    assert.equal(decidir(P('2026-10-15 22:00'), plan), 'esperar');
    assert.equal(decidir(P('2026-10-16 03:00'), plan), 'esperar');
    assert.equal(decidir(P('2026-10-16 08:30'), plan), 'esperar');
    assert.equal(decidir(P('2026-10-16 09:00'), plan), 'enviar');
  });

  test('…y si a las 09:00 ya no cabe (pista a las 09:00), se descarta', () => {
    const plan: Plan = { envio: P('2026-10-15 21:30'), inicio: P('2026-10-16 09:00') };
    assert.equal(decidir(P('2026-10-15 22:00'), plan), 'esperar');
    assert.equal(decidir(P('2026-10-16 08:30'), plan), 'esperar');
    assert.equal(decidir(P('2026-10-16 09:00'), plan), 'descartar');
  });

  test('a las 21:00 tocan juntas dos pistas de mañana del mismo usuario', () => {
    const a = planificar({ date: '2026-10-16', time_slot: '10:00 - 11:30', created_at: creadaEn(HACE_DIAS) });
    const b = planificar({ date: '2026-10-16', time_slot: '11:30 - 13:00', created_at: creadaEn(HACE_DIAS) });
    assert.equal(decidir(P('2026-10-15 21:00'), a), 'enviar');
    assert.equal(decidir(P('2026-10-15 21:00'), b), 'enviar');
  });

  // Cron real: pasa a las :00 y a las :30 (send-reminders redondea "ahora" al
  // minuto). Toda reserva con plan tiene que acabar avisada, nunca de noche,
  // nunca antes de 1 h 30 min tras reservar ni a menos de 30 min del partido.
  test('con el cron cada 30 min, toda reserva con plan acaba avisada', () => {
    const franjas = ['00:30', '00:45', '08:00', '09:00', '09:30', '10:00', '10:30', '11:30', '12:00', '16:00', '19:00', '21:00', '22:30', '23:30'];
    let conPlan = 0;
    for (const dia of ['2026-10-16', '2026-03-29', '2026-10-25', '2027-01-01']) {
      const inicioDia = P(dia);
      for (const franja of franjas) {
        const slot = `${franja} - 23:59`;
        // Reservas hechas cada 7 min durante los 2 días anteriores al partido.
        for (let creada = inicioDia - 2 * 24 * 60 * 60_000; creada < inicioDia + 24 * 60 * 60_000; creada += 7 * 60_000) {
          const plan = planificar({ date: dia, time_slot: slot, created_at: new Date(instanteDesdePared(creada)).toISOString() });
          if (!plan || creada >= plan.inicio) continue;
          conPlan++;
          let pasada = Math.ceil(creada / (30 * 60_000)) * 30 * 60_000;
          let decision = decidir(pasada, plan);
          while (decision === 'esperar') {
            pasada += 30 * 60_000;
            decision = decidir(pasada, plan);
          }
          const caso = `${dia} ${franja} reservada ${textoPared(creada)} (plan ${textoPared(plan.envio)})`;
          assert.equal(decision, 'enviar', caso);
          assert.equal(estaEnSilencio(pasada), false, caso);
          assert.ok(pasada >= creada + 90 * 60_000, caso);
          assert.ok(pasada <= plan.inicio - 30 * 60_000, caso);
        }
      }
    }
    assert.ok(conPlan > 1000);
  });
});

describe('caducidad del aviso (móvil apagado)', () => {
  test('el de la víspera caduca a las 22:00: nunca llega de madrugada', () => {
    assert.equal(textoPared(caducidadAviso(P('2026-10-15 21:00'), P('2026-10-16 10:00'))), '2026-10-15 22:00');
    assert.equal(textoPared(caducidadAviso(P('2026-10-15 21:30'), P('2026-10-16 09:00'))), '2026-10-15 22:00');
  });

  test('el del mismo día caduca al empezar el partido', () => {
    assert.equal(textoPared(caducidadAviso(P('2026-10-16 15:00'), P('2026-10-16 18:00'))), '2026-10-16 18:00');
  });

  test('pista a las 23:00 avisada a las 20:00 → caduca a las 22:00', () => {
    assert.equal(textoPared(caducidadAviso(P('2026-10-16 20:00'), P('2026-10-16 23:00'))), '2026-10-16 22:00');
  });

  test('en instantes reales, la víspera del cambio de hora de marzo', () => {
    // Sábado 28/03/2026 21:00 CET → 22:00 CET: 1 h real (el adelanto es a las 02:00).
    const desde = instanteDesdePared(P('2026-03-28 21:00'));
    const hasta = instanteDesdePared(caducidadAviso(P('2026-03-28 21:00'), P('2026-03-29 10:00')));
    assert.equal(hasta - desde, 60 * 60_000);
    // Y hasta el partido del domingo a las 10:00 (CEST) quedan 12 h reales, no 13.
    assert.equal(instanteDesdePared(P('2026-03-29 10:00')) - desde, 12 * 60 * 60_000);
  });
});

describe('texto del aviso', () => {
  test('mismo día', () => {
    assert.deepEqual(
      construirAviso([{ date: '2026-10-15', time_slot: '18:00 - 19:30', pista: 'Pista 1' }], '2026-10-15'),
      {
        title: '🎾 Hoy juegas a las 18:00',
        body: 'Tienes la Pista 1 reservada de 18:00 a 19:30. ¡Te esperamos!',
        url: '/mis-reservas',
      },
    );
  });

  test('víspera', () => {
    assert.deepEqual(
      construirAviso([{ date: '2026-10-16', time_slot: '10:00 - 11:30', pista: 'Pista 2' }], '2026-10-15'),
      {
        title: '🎾 Mañana juegas a las 10:00',
        body: 'Tienes la Pista 2 reservada mañana de 10:00 a 11:30. ¡Te esperamos!',
        url: '/mis-reservas',
      },
    );
  });

  test('varias reservas del mismo día en un solo aviso (y ordenadas)', () => {
    const aviso = construirAviso([
      { date: '2026-10-15', time_slot: '19:30 - 21:00', pista: 'Pista 2' },
      { date: '2026-10-15', time_slot: '18:00 - 19:30', pista: 'Pista 1' },
    ], '2026-10-15');
    assert.equal(aviso.title, '🎾 Hoy juegas a las 18:00');
    assert.equal(aviso.body, 'Hoy tienes 2 pistas: Pista 1 a las 18:00 y Pista 2 a las 19:30. ¡Te esperamos!');
    assert.equal(aviso.url, '/mis-reservas');
  });

  test('tres reservas de mañana', () => {
    const aviso = construirAviso([
      { date: '2026-10-16', time_slot: '10:00 - 11:30', pista: 'Pista 1' },
      { date: '2026-10-16', time_slot: '11:30 - 13:00', pista: 'Pista 2' },
      { date: '2026-10-16', time_slot: '13:00 - 14:30', pista: 'Pista 3' },
    ], '2026-10-15');
    assert.equal(aviso.title, '🎾 Mañana juegas a las 10:00');
    assert.equal(aviso.body, 'Mañana tienes 3 pistas: Pista 1 a las 10:00, Pista 2 a las 11:30 y Pista 3 a las 13:00. ¡Te esperamos!');
  });

  test('reservas de hoy y de mañana en la misma pasada', () => {
    const aviso = construirAviso([
      { date: '2026-10-16', time_slot: '10:00 - 11:30', pista: 'Pista 2' },
      { date: '2026-10-15', time_slot: '22:30 - 00:00', pista: 'Pista 1' },
    ], '2026-10-15');
    assert.equal(aviso.title, '🎾 Hoy juegas a las 22:30');
    assert.equal(aviso.body, 'Hoy tienes la Pista 1 a las 22:30. Mañana tienes la Pista 2 a las 10:00. ¡Te esperamos!');
  });

  test('pista sin nombre, nombre sin "Pista" y franja sin hora de fin', () => {
    assert.equal(
      construirAviso([{ date: '2026-10-15', time_slot: '18:00 - 19:30', pista: null }], '2026-10-15').body,
      'Tienes tu pista reservada de 18:00 a 19:30. ¡Te esperamos!',
    );
    assert.equal(
      construirAviso([{ date: '2026-10-15', time_slot: '18:00 - 19:30', pista: 'Cristal' }], '2026-10-15').body,
      'Tienes la pista Cristal reservada de 18:00 a 19:30. ¡Te esperamos!',
    );
    assert.equal(
      construirAviso([{ date: '2026-10-15', time_slot: '18:00', pista: 'Pista 1' }], '2026-10-15').body,
      'Tienes la Pista 1 reservada a las 18:00. ¡Te esperamos!',
    );
  });

  test('hoy / mañana / otro día, también a fin de mes', () => {
    assert.equal(cuandoEs('2026-10-15', '2026-10-15'), 'hoy');
    assert.equal(cuandoEs('2026-11-01', '2026-10-31'), 'mañana');
    assert.equal(cuandoEs('2027-01-01', '2026-12-31'), 'mañana');
    assert.equal(cuandoEs('2026-10-17', '2026-10-15'), 'el 17/10');
  });

  test('horas de la franja', () => {
    assert.deepEqual(horasFranja('18:00 - 19:30'), { desde: '18:00', hasta: '19:30' });
    assert.deepEqual(horasFranja('9:00 - 10:30'), { desde: '09:00', hasta: '10:30' });
    assert.deepEqual(horasFranja('18:00'), { desde: '18:00', hasta: null });
  });
});
