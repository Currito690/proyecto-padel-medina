// supabase/functions/redsys-notify-split/index.ts
// Recibe la notificación de Redsys cuando un acompañante paga su parte (Pago Compartido)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';

const SECRET_KEY = Deno.env.get('REDSYS_SECRET_KEY');

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

function signHMACSHA256(derivedKey: CryptoJS.lib.WordArray, paramsB64: string): string {
  const hmac = CryptoJS.HmacSHA256(paramsB64, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

function verifySignature(paramsB64: string, receivedSig: string, orderId: string): boolean {
  if (!SECRET_KEY) return false;
  const derivedKey = deriveKey(SECRET_KEY, orderId);
  const expectedSig = signHMACSHA256(derivedKey, paramsB64);
  const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return normalize(expectedSig) === normalize(receivedSig);
}

serve(async (req) => {
  try {
    if (!SECRET_KEY) return new Response('KO', { status: 500 });

    const body = await req.text();
    const params = new URLSearchParams(body);

    const dsParams    = params.get('Ds_MerchantParameters') ?? '';
    const dsSignature = params.get('Ds_Signature') ?? '';
    const decoded     = JSON.parse(atob(dsParams));
    const orderId     = decoded.Ds_Order ?? '';

    if (!verifySignature(dsParams, dsSignature, orderId)) {
      console.error('Firma inválida para pago split, pedido', orderId);
      return new Response('KO', { status: 400 });
    }

    const responseCode = parseInt(decoded.Ds_Response ?? '9999', 10);
    const merchantData = JSON.parse(decoded.Ds_MerchantData ?? '{}');
    const { splitToken } = merchantData;

    if (responseCode <= 99 && splitToken) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Marcar el token como pagado
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('shared_payment_tokens')
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq('token', splitToken)
        .select('booking_id')
        .single();

      if (tokenErr) {
        console.error('Error actualizando token split:', tokenErr);
        return new Response('KO', { status: 500 });
      }

      // Incrementar contador de pagos en la reserva
      if (tokenRow?.booking_id) {
        await supabase.rpc('increment_split_paid', { booking_id: tokenRow.booking_id })
          .catch(async () => {
            // Fallback si no existe la función RPC: actualizar manualmente
            const { data: b } = await supabase
              .from('bookings')
              .select('split_paid')
              .eq('id', tokenRow.booking_id)
              .single();
            if (b) {
              await supabase
                .from('bookings')
                .update({ split_paid: (b.split_paid || 1) + 1 })
                .eq('id', tokenRow.booking_id);
            }
          });
      }

      console.log(`Pago split OK: token=${splitToken}`);
    } else {
      console.log(`Pago split rechazado: código=${responseCode}, token=${splitToken}`);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('redsys-notify-split error:', err);
    return new Response('KO', { status: 500 });
  }
});
