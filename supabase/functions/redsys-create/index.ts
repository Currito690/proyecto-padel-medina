// supabase/functions/redsys-create/index.ts
// Genera los parámetros firmados para redirigir al TPV de Redsys (Producción)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Credenciales de producción (configurar en Supabase Dashboard > Settings > Secrets) ──
const MERCHANT_CODE = Deno.env.get('REDSYS_MERCHANT_CODE');
const TERMINAL      = Deno.env.get('REDSYS_TERMINAL') ?? '1';
const SECRET_KEY    = Deno.env.get('REDSYS_SECRET_KEY');

// ── URL del TPV Virtual Redsys (Producción Real) ──
const REDSYS_URL = 'https://sis.redsys.es/sis/realizarPago';

// ── Genera número de pedido único (12 chars, empieza por 4 dígitos) ──
function generateOrderId(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return (ts + rand).slice(0, 12);
}

// ── 1. Deriva la clave por pedido usando 3DES-CBC ──
function deriveKey(secretBase64: string, orderId: string): CryptoJS.lib.WordArray {
  const key = CryptoJS.enc.Base64.parse(secretBase64);
  const iv = CryptoJS.enc.Hex.parse('0000000000000000');

  let padded = orderId;
  while (padded.length % 8 !== 0) padded += '\0';

  const encrypted = CryptoJS.TripleDES.encrypt(
    CryptoJS.enc.Utf8.parse(padded),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }
  );

  return encrypted.ciphertext;
}

// ── 2. HMAC-SHA256 con la clave derivada ──
function signHMACSHA256(derivedKey: CryptoJS.lib.WordArray, paramsB64: string): string {
  const hmac = CryptoJS.HmacSHA256(paramsB64, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Validar credenciales configuradas
  if (!SECRET_KEY || !MERCHANT_CODE) {
    console.error('Faltan credenciales Redsys: REDSYS_SECRET_KEY o REDSYS_MERCHANT_CODE no configurados en Supabase Secrets');
    return new Response(JSON.stringify({ error: 'Configuración Redsys incompleta. Contacta con el administrador.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { amount, orderId: customOrderId, courtId, userId, date, timeSlot, successUrl, failUrl, notifyUrl, paymentMethod } = await req.json();

    const orderId = customOrderId ?? generateOrderId();
    const amountCents = Math.round(amount * 100).toString().padStart(4, '0');

    const params: Record<string, string> = {
      DS_MERCHANT_MERCHANTCODE:       MERCHANT_CODE,
      DS_MERCHANT_TERMINAL:           TERMINAL,
      DS_MERCHANT_TRANSACTIONTYPE:    '0',
      DS_MERCHANT_ORDER:              orderId,
      DS_MERCHANT_AMOUNT:             amountCents,
      DS_MERCHANT_CURRENCY:           '978', // EUR
      DS_MERCHANT_URLOK:              successUrl,
      DS_MERCHANT_URLKO:              failUrl,
      DS_MERCHANT_MERCHANTURL:        notifyUrl,
      DS_MERCHANT_CONSUMERLANGUAGE:   '002', // Español
      DS_MERCHANT_PRODUCTDESCRIPTION: `Pista padel ${date} ${timeSlot}`,
      DS_MERCHANT_MERCHANTDATA:       JSON.stringify({ courtId, userId, date, timeSlot }),
    };

    // Forzar Bizum si se solicita explícitamente
    if (paymentMethod === 'bizum') {
      params.DS_MERCHANT_PAYMENT_METHODS = 'BIZUM';
    }

    const paramsB64 = btoa(JSON.stringify(params));
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
    console.error('Redsys create error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
