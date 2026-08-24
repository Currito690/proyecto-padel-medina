// supabase/functions/redsys-create/index.ts
// Genera los parámetros firmados para redirigir al TPV de Redsys (Producción)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { amount, orderId: customOrderId, courtId, userId, date, timeSlot, successUrl, failUrl, notifyUrl, paymentMethod, isSharedPayment, sharedPhones, splitToken, kind, registrationId, tournamentName, bookingId } = await req.json();

    const orderId = customOrderId ?? generateOrderId();

    // Diferenciamos pago de reserva (kind='booking', default) vs pago de
    // inscripción a torneo (kind='tournament').
    const isTournament = kind === 'tournament';

    // Importe a cobrar. Para torneos NO nos fiamos del que manda el navegador:
    // lo calculamos aquí desde la cuota del torneo (cuota por jugador × 2,
    // igual que hace TournamentRegistration.jsx). Si no, cualquiera podría
    // pagar 1 céntimo y quedar como "pagado".
    let chargeAmount = amount;
    let expectedCents: number | null = null;
    if (isTournament) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof registrationId !== 'string' || !UUID_RE.test(registrationId)) {
        throw new Error('Inscripción no válida');
      }
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: reg, error: regErr } = await admin
        .from('tournament_registrations')
        .select('id, payment_status, tournaments!inner(config)')
        .eq('id', registrationId)
        .maybeSingle();
      if (regErr) {
        console.error('Error cargando inscripción para cobro:', regErr);
        throw new Error('No se pudo comprobar la inscripción');
      }
      if (!reg) throw new Error('Inscripción no encontrada');
      if (reg.payment_status === 'paid') throw new Error('Esta inscripción ya está pagada');
      // supabase-js devuelve la relación como objeto (o array según versión).
      const rel = (reg as Record<string, unknown>).tournaments;
      const cfg = ((Array.isArray(rel) ? rel[0] : rel) as { config?: Record<string, unknown> } | null)?.config ?? {};
      const fee = parseFloat(String(cfg.registrationFeeAmount ?? 0));
      if (!cfg.registrationFeeEnabled || !(fee > 0)) {
        throw new Error('Este torneo no tiene cuota de inscripción online');
      }
      chargeAmount = Math.round(fee * 2 * 100) / 100; // por pareja
      expectedCents = Math.round(chargeAmount * 100);
    }
    const amountCents = Math.round(chargeAmount * 100).toString().padStart(4, '0');

    // expectedCents viaja firmado en MerchantData: redsys-notify comprueba que
    // lo cobrado coincide antes de marcar la inscripción como pagada.
    const merchantDataObj: Record<string, unknown> = isTournament
      ? { kind: 'tournament', registrationId, expectedCents }
      : {
          kind: 'booking',
          bookingId: bookingId || null, // reserva 'pendiente_pago' pre-creada (tolerancia cero)
          courtId,
          userId,
          date,
          timeSlot,
          isSharedPayment: !!isSharedPayment,
          sharedPhones: isSharedPayment ? sharedPhones : []
        };
    if (splitToken && !isTournament) merchantDataObj.splitToken = splitToken;

    const productDescription = isTournament
      ? `Inscripcion torneo ${(tournamentName || '').slice(0, 60)}`.slice(0, 125)
      : `Pista padel ${date} ${timeSlot}`;

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
      DS_MERCHANT_PRODUCTDESCRIPTION: productDescription,
      DS_MERCHANT_MERCHANTDATA:       JSON.stringify(merchantDataObj),
    };

    if (paymentMethod === 'bizum') {
      params.DS_MERCHANT_PAYMETHODS = 'z';
    } else {
      params.DS_MERCHANT_PAYMETHODS = 'C'; // Tarjeta
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
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
