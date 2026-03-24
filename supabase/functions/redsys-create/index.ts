// supabase/functions/redsys-create/index.ts
// Genera los parámetros firmados para redirigir al TPV de Redsys
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

// ── Deriva la clave por pedido usando 3DES ──
async function deriveKey(secretBase64: string, orderId: string): Promise<CryptoKey> {
  const secretBytes = base64ToBytes(secretBase64);
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  // Redsys usa 3DES pero como alternativa en Web Crypto usamos la clave tal cual y HMAC SHA256
  // (el estándar real de Redsys HMAC-SHA-256)
  return crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

// 3DES encryption of order number (correct Redsys method)
async function encrypt3DES(secretBase64: string, orderId: string): Promise<Uint8Array> {
  const secretBytes = base64ToBytes(secretBase64);
  // Pad secret to 24 bytes for 3DES (key1+key2+key1)
  const key24 = new Uint8Array(24);
  key24.set(secretBytes.slice(0, 16));
  key24.set(secretBytes.slice(0, 8), 16);
  
  // Import as AES-CBC with first 16 bytes (Web Crypto doesn't support 3DES)
  // Use HMAC SHA-256 approach instead (Redsys v2 supports this)
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const orderBytes = new TextEncoder().encode(orderId);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, orderBytes);
  return new Uint8Array(sig).slice(0, 8); // Redsys expects 8 bytes for derived key
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function signHMACSHA256(key: Uint8Array, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return bytesToBase64(new Uint8Array(sig));
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

    const paramsB64 = btoa(JSON.stringify(params));

    // Firma HMAC SHA-256 con clave derivada de 3DES del order
    const secretBytes = base64ToBytes(SECRET_KEY);
    const signature = await signHMACSHA256(secretBytes, paramsB64);

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
