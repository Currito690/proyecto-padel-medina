// Lógica PURA de precios de la tienda (sin dependencias de navegador/Supabase),
// para poder testearla con `node --test`. Todo en céntimos (enteros).
// El servidor (shop-create-order) recalcula igualmente; esto es el preview cliente.

export function calcSubtotal(items) {
  return (items || []).reduce((s, i) => s + (i.precioCentimos || 0) * (i.cantidad || 0), 0);
}

// rate: fila de shipping_rates { coste_centimos, envio_gratis_desde_centimos } | null
export function calcShipping({ subtotalCentimos, metodoEntrega, rate }) {
  if (metodoEntrega !== 'envio' || !rate) return 0;
  if (rate.envio_gratis_desde_centimos != null && subtotalCentimos >= rate.envio_gratis_desde_centimos) return 0;
  return rate.coste_centimos || 0;
}

export function calcTotal({ items, metodoEntrega, rate }) {
  const subtotalCentimos = calcSubtotal(items);
  return subtotalCentimos + calcShipping({ subtotalCentimos, metodoEntrega, rate });
}
