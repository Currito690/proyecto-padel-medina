// supabase/functions/redsys-notify/index.ts
// Recibe la notificación de Redsys cuando se completa un pago
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';

const SECRET_KEY = Deno.env.get('REDSYS_SECRET_KEY') ?? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';

// ── Deriva la clave por pedido usando 3DES-CBC ──
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

// ── HMAC-SHA256 con la clave derivada ──
function signHMACSHA256(derivedKey: CryptoJS.lib.WordArray, paramsB64: string): string {
  const hmac = CryptoJS.HmacSHA256(paramsB64, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

// ── Verifica la firma recibida de Redsys ──
function verifySignature(paramsB64: string, receivedSig: string, orderId: string): boolean {
  const derivedKey = deriveKey(SECRET_KEY, orderId);
  const expectedSig = signHMACSHA256(derivedKey, paramsB64);

  const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return normalize(expectedSig) === normalize(receivedSig);
}

serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const dsParams    = params.get('Ds_MerchantParameters') ?? '';
    const dsSignature = params.get('Ds_Signature') ?? '';

    // Decodificar parámetros para obtener orderId
    const decoded = JSON.parse(atob(dsParams));
    const orderId = decoded.Ds_Order ?? '';

    // Verificar firma con clave derivada por 3DES del orderId
    if (!verifySignature(dsParams, dsSignature, orderId)) {
      console.error('Redsys: firma inválida');
      return new Response('KO', { status: 400 });
    }

    const responseCode = parseInt(decoded.Ds_Response ?? '9999', 10);
    const merchantData = JSON.parse(decoded.Ds_MerchantData ?? '{}');
    const { courtId, userId, date, timeSlot } = merchantData;

    // Códigos 0000–0099 = pago OK
    if (responseCode <= 99) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { error } = await supabase.from('bookings').insert({
        court_id:  courtId,
        user_id:   userId,
        date:      date,
        time_slot: timeSlot,
        status:    'confirmed',
        is_free:   false,
      });

      if (error) {
        console.error('Error guardando reserva Redsys:', error);
        return new Response('KO', { status: 500 });
      }

      // Notificar al admin via push
      const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`;
      fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: 'Nueva reserva (Redsys)',
          body: `Pista ${courtId} · ${timeSlot} · ${date}`,
          url: '/',
        }),
      }).catch(console.warn);
    } else {
      console.log(`Redsys: pago rechazado con código ${responseCode}`);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Redsys notify error:', err);
    return new Response('KO', { status: 500 });
  }
});
