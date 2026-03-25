// supabase/functions/redsys-notify/index.ts
// Recibe la notificación de Redsys cuando se completa un pago
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET_KEY = Deno.env.get('REDSYS_SECRET_KEY') ?? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function verifySignature(params: string, receivedSig: string): Promise<boolean> {
  try {
    const secretBytes = base64ToBytes(SECRET_KEY);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(params));
    const computed = bytesToBase64(new Uint8Array(sig));
    // Normalizar: reemplazar + por - y / por _ (URL-safe base64)
    const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return normalize(computed) === normalize(receivedSig);
  } catch {
    return false;
  }
}

serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const dsParams     = params.get('Ds_MerchantParameters') ?? '';
    const dsSignature  = params.get('Ds_Signature') ?? '';

    // Verificar firma
    const valid = await verifySignature(dsParams, dsSignature);
    if (!valid) {
      console.error('Redsys: firma inválida');
      return new Response('KO', { status: 400 });
    }

    // Decodificar parámetros
    const decoded = JSON.parse(atob(dsParams));
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
        payment_method: 'redsys',
        redsys_order: decoded.Ds_Order,
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
