// supabase/functions/redsys-notify/index.ts
// Recibe la notificación de Redsys cuando se completa un pago (Producción)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';

// ── Clave SHA-256 de producción (configurar en Supabase Dashboard > Settings > Secrets) ──
const SECRET_KEY = Deno.env.get('REDSYS_SECRET_KEY');

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
  if (!SECRET_KEY) return false;
  const derivedKey = deriveKey(SECRET_KEY, orderId);
  const expectedSig = signHMACSHA256(derivedKey, paramsB64);
  const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return normalize(expectedSig) === normalize(receivedSig);
}

serve(async (req) => {
  try {
    if (!SECRET_KEY) {
      console.error('REDSYS_SECRET_KEY no configurado en Supabase Secrets');
      return new Response('KO', { status: 500 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);

    const dsParams    = params.get('Ds_MerchantParameters') ?? '';
    const dsSignature = params.get('Ds_Signature') ?? '';

    // Decodificar parámetros para obtener orderId
    const decoded = JSON.parse(atob(dsParams));
    const orderId = decoded.Ds_Order ?? '';

    // Verificar firma con clave derivada por 3DES del orderId
    if (!verifySignature(dsParams, dsSignature, orderId)) {
      console.error('Redsys notify: firma inválida para pedido', orderId);
      return new Response('KO', { status: 400 });
    }

    const responseCode = parseInt(decoded.Ds_Response ?? '9999', 10);
    const merchantData = JSON.parse(decoded.Ds_MerchantData ?? '{}');
    const { courtId, userId, date, timeSlot, isSharedPayment, sharedPhones } = merchantData;

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
        payment_type: isSharedPayment ? 'split' : 'full',
        split_phones: isSharedPayment ? sharedPhones : [],
        split_paid: isSharedPayment ? 1 : 4, // 1 pagado (el creador)
      });

      if (error) {
        console.error('Error guardando reserva Redsys:', error);
        return new Response('KO', { status: 500 });
      }

      // Obtener nombre de pista y usuario para la notificación push
      const [courtRes, userRes] = await Promise.all([
        supabase.from('courts').select('name').eq('id', courtId).single(),
        supabase.from('profiles').select('name').eq('id', userId).single(),
      ]);

      const courtName = courtRes.data?.name || 'Pista';
      const userName = userRes.data?.name || 'Usuario';

      const [y, m, d] = date.split('-');
      const dateStr = `${d}/${m}/${y}`;

      // Notificar al admin via push
      const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`;
      const isSplitStr = isSharedPayment ? ' (Pago Compartido: 1/4 pagado)' : '';
      
      await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: '💳 Reserva pagada online' + (isSharedPayment ? ' 👯' : ''),
          body: `${userName} ha reservado ${courtName} · ${dateStr} · ${timeSlot}${isSplitStr}`,
          url: '/',
        }),
      }).catch(console.warn);

      console.log(`Redsys OK: reserva creada para ${userName} - ${courtName} ${date} ${timeSlot}`);
    } else {
      console.log(`Redsys: pago rechazado con código ${responseCode} para pedido ${orderId}`);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Redsys notify error:', err);
    return new Response('KO', { status: 500 });
  }
});
