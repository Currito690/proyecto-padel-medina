// supabase/functions/redsys-create/index.ts
// Genera los parámetros firmados para redirigir al TPV de Redsys
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Credenciales (cambiar por las reales cuando tengas el contrato) ──
const MERCHANT_CODE = Deno.env.get('REDSYS_MERCHANT_CODE') ?? '999008881'; // test
const TERMINAL      = Deno.env.get('REDSYS_TERMINAL')      ?? '1';          // test
const SECRET_KEY    = Deno.env.get('REDSYS_SECRET_KEY')    ?? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7'; // test

// ── URL del TPV ──
const REDSYS_URL = Deno.env.get('REDSYS_ENV') === 'production'
  ? 'https://sis.redsys.es/sis/realizarPago'
  : 'https://sis-t.redsys.es:25443/sis/realizarPago';

// ── Genera número de pedido único (12 chars, empieza por dígito) ──
function generateOrderId(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return (ts + rand).slice(0, 12);
}

// ── 1. Deriva la clave por pedido usando 3DES ──
function deriveKey(secretBase64: string, orderId: string): Buffer {
  const key = Buffer.from(secretBase64, 'base64');
  const iv = Buffer.alloc(8, 0); // Redsys usa IV vacío (ceros)
  const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv);
  cipher.setAutoPadding(false);

  // Redsys exige pad de ceros (\0) hasta que sea múltiplo de 8
  let paddedOrder = orderId;
  while (paddedOrder.length % 8 !== 0) {
    paddedOrder += '\0';
  }

  const res1 = cipher.update(paddedOrder, 'utf8');
  const res2 = cipher.final();
  return Buffer.concat([res1, res2]);
}

// ── 2. MAC SHA256 de los parámetros con la clave derivada ──
function signHMACSHA256(derivedKey: Buffer, paramsB64: string): string {
  const hmac = crypto.createHmac('sha256', derivedKey);
  hmac.update(paramsB64);
  return hmac.digest('base64');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { amount, orderId: customOrderId, courtId, userId, date, timeSlot, successUrl, failUrl, notifyUrl } = await req.json();

    const orderId = customOrderId ?? generateOrderId();
    const amountCents = Math.round(amount * 100).toString().padStart(4, '0'); // en céntimos

    const params = {
      DS_MERCHANT_MERCHANTCODE: MERCHANT_CODE,
      DS_MERCHANT_TERMINAL: TERMINAL,
      DS_MERCHANT_TRANSACTIONTYPE: '0',       // Cargo
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_AMOUNT: amountCents,
      DS_MERCHANT_CURRENCY: '978',            // EUR
      DS_MERCHANT_URLOK: successUrl,
      DS_MERCHANT_URLKO: failUrl,
      DS_MERCHANT_MERCHANTURL: notifyUrl,
      DS_MERCHANT_CONSUMERLANGUAGE: '002',    // Español
      DS_MERCHANT_PRODUCTDESCRIPTION: `Pista de pádel ${date} ${timeSlot}`,
      // Metadata para el webhook
      DS_MERCHANT_MERCHANTDATA: JSON.stringify({ courtId, userId, date, timeSlot }),
    };

    const paramsStr = JSON.stringify(params);
    const paramsB64 = Buffer.from(paramsStr).toString('base64');

    // Firma HMAC SHA-256 con clave derivada de 3DES del order
    const derivedKey = deriveKey(SECRET_KEY, orderId);
    const signature = signHMACSHA256(derivedKey, paramsB64);

    return new Response(JSON.stringify({
      Ds_SignatureVersion: 'HMAC_SHA256_V1',
      Ds_MerchantParameters: paramsB64,
      Ds_Signature: signature,
      redsysUrl: REDSYS_URL,
      orderId,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
