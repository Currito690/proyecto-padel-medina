// supabase/functions/shop-create-order/index.ts
// Crea un pedido de la TIENDA y devuelve los parámetros firmados para Redsys.
//
// SEGURIDAD: el importe se RECALCULA SIEMPRE en el servidor desde la BD
// (products/product_variants). NUNCA se confía en el precio que envía el
// cliente. El pedido se crea en 'pendiente_pago' ANTES de pagar y se confirma
// de forma idempotente en redsys-notify (RPC confirmar_pedido_pagado).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MERCHANT_CODE = Deno.env.get('REDSYS_MERCHANT_CODE');
const TERMINAL      = Deno.env.get('REDSYS_TERMINAL') ?? '1';
const SECRET_KEY    = Deno.env.get('REDSYS_SECRET_KEY');
// Conmutable test/prod: define REDSYS_URL en Secrets para usar el entorno de
// pruebas (https://sis-t.redsys.es:25443/sis/realizarPago). Por defecto, prod.
const REDSYS_URL    = Deno.env.get('REDSYS_URL') ?? 'https://sis.redsys.es/sis/realizarPago';
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://padelmedina.com';
const SUPA_URL      = Deno.env.get('SUPABASE_URL')!;

function generateOrderId(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return (ts + rand).slice(0, 12);
}

function deriveKey(secretBase64: string, orderId: string): CryptoJS.lib.WordArray {
  const key = CryptoJS.enc.Base64.parse(secretBase64);
  const iv = CryptoJS.enc.Hex.parse('0000000000000000');
  let padded = orderId;
  while (padded.length % 8 !== 0) padded += '\0';
  const encrypted = CryptoJS.TripleDES.encrypt(
    CryptoJS.enc.Utf8.parse(padded), key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }
  );
  return encrypted.ciphertext;
}
function signHMACSHA256(derivedKey: CryptoJS.lib.WordArray, paramsB64: string): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(paramsB64, derivedKey));
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!SECRET_KEY || !MERCHANT_CODE) return json({ error: 'Configuración Redsys incompleta.' });

  try {
    const { items, cliente, metodo_entrega, direccion, metodo_pago, user_id } = await req.json();

    if (!Array.isArray(items) || items.length === 0) return json({ error: 'Carrito vacío' });
    if (!cliente?.nombre?.trim() || !cliente?.email?.trim()) return json({ error: 'Faltan datos del cliente' });

    const supabase = createClient(SUPA_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Recalcular cada línea desde la BD (precio y stock autoritativos) ──
    let subtotal = 0;
    const orderItemsRows: Record<string, unknown>[] = [];
    for (const it of items) {
      const qty = Math.max(1, parseInt(it.cantidad, 10) || 1);
      const { data: variant } = await supabase
        .from('product_variants')
        .select('id, nombre, talla, color, precio_centimos, stock, activo, product_id, product:products(id,nombre,precio_centimos,precio_oferta_centimos,activo)')
        .eq('id', it.variantId)
        .maybeSingle();

      const product = variant?.product as Record<string, unknown> | undefined;
      if (!variant || variant.activo === false || !product || product.activo === false) {
        return json({ error: 'Algún producto ya no está disponible. Revisa tu carrito.' });
      }
      if ((variant.stock ?? 0) < qty) {
        return json({ error: `Sin stock suficiente de "${product.nombre}".` });
      }
      const unit = variant.precio_centimos != null
        ? variant.precio_centimos
        : (product.precio_oferta_centimos != null ? product.precio_oferta_centimos as number : product.precio_centimos as number);
      const lineSubtotal = unit * qty;
      subtotal += lineSubtotal;

      const varianteDesc = (variant.nombre && variant.nombre !== 'Única')
        ? variant.nombre
        : ([variant.talla, variant.color].filter(Boolean).join(' / ') || null);

      orderItemsRows.push({
        product_id: product.id,
        variant_id: variant.id,
        nombre_producto: product.nombre,
        variante_desc: varianteDesc,
        precio_unitario_centimos: unit,
        cantidad: qty,
        subtotal_centimos: lineSubtotal,
      });
    }

    // ── Gastos de envío (recalculados en servidor) ──
    let gastos = 0;
    let zona: string | null = null;
    const esEnvio = metodo_entrega === 'envio';
    if (esEnvio) {
      const { data: rates } = await supabase.from('shipping_rates').select('*').eq('activo', true).order('orden');
      const rate = (rates || []).find((r: any) => /pen[ií]nsula/i.test(r.zona)) || (rates || [])[0];
      if (rate) {
        zona = rate.zona;
        gastos = (rate.envio_gratis_desde_centimos != null && subtotal >= rate.envio_gratis_desde_centimos)
          ? 0 : (rate.coste_centimos || 0);
      }
      if (!direccion?.calle || !direccion?.cp || !direccion?.ciudad || !direccion?.provincia) {
        return json({ error: 'Dirección de envío incompleta' });
      }
    }
    const total = subtotal + gastos;
    if (total <= 0) return json({ error: 'El total del pedido no es válido' });

    // ── Crear el pedido (pendiente_pago) ──
    const orderId = generateOrderId();
    const { data: order, error: ordErr } = await supabase.from('orders').insert({
      redsys_order_id: orderId,
      user_id: user_id || null,
      cliente_nombre: cliente.nombre.trim(),
      cliente_email: cliente.email.trim(),
      cliente_telefono: cliente.telefono?.trim() || null,
      metodo_entrega: esEnvio ? 'envio' : 'recogida',
      direccion_envio: esEnvio ? direccion : null,
      zona_envio: zona,
      subtotal_centimos: subtotal,
      gastos_envio_centimos: gastos,
      total_centimos: total,
      estado: 'pendiente_pago',
      metodo_pago: metodo_pago === 'bizum' ? 'bizum' : 'redsys',
    }).select('id, numero_pedido').single();
    if (ordErr) { console.error('insert order', ordErr); return json({ error: 'No se pudo crear el pedido' }); }

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItemsRows.map(r => ({ ...r, order_id: order.id })));
    if (itemsErr) {
      console.error('insert order_items', itemsErr);
      await supabase.from('orders').delete().eq('id', order.id);
      return json({ error: 'No se pudo crear el pedido' });
    }

    // ── Parámetros Redsys ──
    const amountCents = String(total).padStart(4, '0');
    const redirect = `${SUPA_URL}/functions/v1/redsys-redirect?to=`;
    const params: Record<string, string> = {
      DS_MERCHANT_MERCHANTCODE:       MERCHANT_CODE,
      DS_MERCHANT_TERMINAL:           TERMINAL,
      DS_MERCHANT_TRANSACTIONTYPE:    '0',
      DS_MERCHANT_ORDER:              orderId,
      DS_MERCHANT_AMOUNT:             amountCents,
      DS_MERCHANT_CURRENCY:           '978',
      DS_MERCHANT_URLOK:              redirect + encodeURIComponent(`${APP_URL}/tienda/pedido/${order.numero_pedido}?r=ok`),
      DS_MERCHANT_URLKO:              redirect + encodeURIComponent(`${APP_URL}/tienda/pedido/${order.numero_pedido}?r=ko`),
      DS_MERCHANT_MERCHANTURL:        `${SUPA_URL}/functions/v1/redsys-notify`,
      DS_MERCHANT_CONSUMERLANGUAGE:   '002',
      DS_MERCHANT_PRODUCTDESCRIPTION: `Pedido ${order.numero_pedido}`.slice(0, 125),
      DS_MERCHANT_MERCHANTDATA:       JSON.stringify({ kind: 'order' }),
      DS_MERCHANT_PAYMETHODS:         metodo_pago === 'bizum' ? 'z' : 'C',
    };

    const paramsB64 = btoa(JSON.stringify(params));
    const signature = signHMACSHA256(deriveKey(SECRET_KEY, orderId), paramsB64);

    return json({
      Ds_SignatureVersion: 'HMAC_SHA256_V1',
      Ds_MerchantParameters: paramsB64,
      Ds_Signature: signature,
      redsysUrl: REDSYS_URL,
      numero_pedido: order.numero_pedido,
    });
  } catch (err) {
    console.error('shop-create-order error:', err);
    return json({ error: err.message || 'Error inesperado' });
  }
});
