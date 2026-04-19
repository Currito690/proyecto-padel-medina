// supabase/functions/send-booking-email/index.ts
// Deploy: npx supabase functions deploy send-booking-email
// Secret needed: RESEND_API_KEY (la misma API key que tienes en Supabase Auth SMTP)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>';
const REPLY_TO = 'info@padelmedina.com';
const APP_URL = Deno.env.get('APP_URL') || 'https://padelmedina.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[date.getDay()]}, ${d} de ${months[Number(m) - 1]} de ${y}`;
}

function confirmationHtml(userName: string, courtName: string, date: string, timeSlot: string): string {
  const dateLong = formatDateLong(date);
  const [y, m, d] = date.split('-');
  const dateShort = `${d}/${m}/${y}`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reserva confirmada</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#16A34A 0%,#059669 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">🎾</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Confirmación de reserva</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">✅ ¡Reserva confirmada!</h2>
      <p style="color:#64748B;margin:0 0 28px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${userName}</strong>, tu pista está reservada. ¡Nos vemos en la cancha!
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:20px 20px 6px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="36" valign="top" style="padding-bottom:16px"><span style="font-size:22px">🏟️</span></td>
              <td style="padding-bottom:16px;padding-left:8px">
                <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Pista</div>
                <div style="font-size:16px;color:#0F172A;font-weight:700">${courtName}</div>
              </td>
            </tr>
            <tr>
              <td width="36" valign="top" style="padding-bottom:16px"><span style="font-size:22px">📅</span></td>
              <td style="padding-bottom:16px;padding-left:8px">
                <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Fecha</div>
                <div style="font-size:16px;color:#0F172A;font-weight:700;text-transform:capitalize">${dateLong}</div>
              </td>
            </tr>
            <tr>
              <td width="36" valign="top"><span style="font-size:22px">⏰</span></td>
              <td style="padding-left:8px">
                <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Horario</div>
                <div style="font-size:16px;color:#0F172A;font-weight:700">${timeSlot}</div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;margin-bottom:28px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#15803D;line-height:1.6">
            💡 <strong>Consejo:</strong> Recibirás un recordatorio 10 horas antes de tu partido. ¡Recuerda ser puntual!
          </p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${APP_URL}/mis-reservas" style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 32px;border-radius:10px">
          Ver mis reservas
        </a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
        Padel Medina · ¿Necesitas cancelar? Hazlo desde
        <a href="${APP_URL}/mis-reservas" style="color:#16A34A;text-decoration:none">Mis Reservas</a>
      </p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

function reminderHtml(userName: string, courtName: string, timeSlot: string): string {
  const startTime = timeSlot.split(' - ')[0];

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recordatorio de reserva</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#D97706 0%,#B45309 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">⏰</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Recordatorio de partido</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">¡Tienes partido en ~10 horas!</h2>
      <p style="color:#64748B;margin:0 0 28px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${userName}</strong>, te recordamos que hoy tienes una pista reservada:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:20px 20px 6px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="36" valign="top" style="padding-bottom:16px"><span style="font-size:22px">🏟️</span></td>
              <td style="padding-bottom:16px;padding-left:8px">
                <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Pista</div>
                <div style="font-size:16px;color:#0F172A;font-weight:700">${courtName}</div>
              </td>
            </tr>
            <tr>
              <td width="36" valign="top"><span style="font-size:22px">⏰</span></td>
              <td style="padding-left:8px">
                <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Hora de inicio</div>
                <div style="font-size:40px;color:#D97706;font-weight:900;letter-spacing:-1px;line-height:1.1">${startTime}</div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;margin-bottom:28px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#9A3412;line-height:1.6">
            🎯 <strong>¡Sé puntual!</strong> Llega 5-10 minutos antes para calentar y comenzar a la hora acordada.
          </p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${APP_URL}/mis-reservas" style="display:inline-block;background:#D97706;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 32px;border-radius:10px">
          Ver mis reservas
        </a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
        Padel Medina · ¿No puedes ir? Cancela en
        <a href="${APP_URL}/mis-reservas" style="color:#16A34A;text-decoration:none">Mis Reservas</a> con tiempo.
      </p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, email, userName, courtName, date, timeSlot } = await req.json();

    if (!email || !type || !courtName || !timeSlot) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isConfirmation = type === 'confirmation';
    const safeName = userName || 'jugador/a';
    const startTime = timeSlot.split(' - ')[0];
    const [y, m, d] = (date || '').split('-');
    const dateShort = d && m && y ? `${d}/${m}/${y}` : '';

    const subject = isConfirmation
      ? `Reserva confirmada – ${courtName}${dateShort ? ` · ${dateShort}` : ''}`
      : `Recordatorio: tienes partido hoy a las ${startTime}`;

    const html = isConfirmation
      ? confirmationHtml(safeName, courtName, date, timeSlot)
      : reminderHtml(safeName, courtName, timeSlot);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [email], subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Email (${type}) sent to ${email} — id: ${result.id}`);
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-booking-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
