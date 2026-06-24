// Tests del cálculo de subtotal/envío/total de la tienda.
// Ejecutar: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcSubtotal, calcShipping, calcTotal } from '../src/utils/shopPricing.js';

const items = [
  { precioCentimos: 2990, cantidad: 2 }, // 59,80 €
  { precioCentimos: 1500, cantidad: 1 }, // 15,00 €
];
const ratePeninsula = { coste_centimos: 490, envio_gratis_desde_centimos: 5000 };

test('subtotal suma precio × cantidad en céntimos', () => {
  assert.equal(calcSubtotal(items), 2990 * 2 + 1500); // 7480
  assert.equal(calcSubtotal([]), 0);
});

test('recogida en club no tiene gastos de envío', () => {
  assert.equal(calcShipping({ subtotalCentimos: 1000, metodoEntrega: 'recogida', rate: ratePeninsula }), 0);
});

test('envío cobra la tarifa si no se alcanza el umbral de envío gratis', () => {
  assert.equal(calcShipping({ subtotalCentimos: 3000, metodoEntrega: 'envio', rate: ratePeninsula }), 490);
});

test('envío gratis al alcanzar o superar el umbral', () => {
  assert.equal(calcShipping({ subtotalCentimos: 5000, metodoEntrega: 'envio', rate: ratePeninsula }), 0);
  assert.equal(calcShipping({ subtotalCentimos: 9999, metodoEntrega: 'envio', rate: ratePeninsula }), 0);
});

test('sin tarifa configurada, el envío es 0 (no rompe)', () => {
  assert.equal(calcShipping({ subtotalCentimos: 1000, metodoEntrega: 'envio', rate: null }), 0);
});

test('total = subtotal + envío', () => {
  // 7480 subtotal > 5000 umbral → envío gratis
  assert.equal(calcTotal({ items, metodoEntrega: 'envio', rate: ratePeninsula }), 7480);
  // carrito pequeño con envío
  const small = [{ precioCentimos: 1000, cantidad: 1 }];
  assert.equal(calcTotal({ items: small, metodoEntrega: 'envio', rate: ratePeninsula }), 1490);
  // recogida
  assert.equal(calcTotal({ items: small, metodoEntrega: 'recogida', rate: ratePeninsula }), 1000);
});
