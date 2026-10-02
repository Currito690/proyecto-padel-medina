// supabase/functions/send-booking-email/index.ts
// Deploy: npx supabase functions deploy send-booking-email
// Secret needed: RESEND_API_KEY (la misma API key que tienes en Supabase Auth SMTP)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>';
const REPLY_TO = 'info@padelmedina.com';
const APP_URL = Deno.env.get('APP_URL') || 'https://padelmedina.com';
// Email del administrador que recibe el aviso de cada reserva (con método de pago).
const ADMIN_EMAIL = Deno.env.get('ADMIN_NOTIFY_EMAIL') || 'padelmedina@hotmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Escapa cualquier texto que venga del usuario antes de meterlo en el HTML,
// para que nadie pueda colar etiquetas ni romper el correo.
function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

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

function reminderHtml(userName: string, courtName: string, timeSlot: string, hoursLeft?: number, isToday = true): string {
  const startTime = timeSlot.split(' - ')[0];
  // Horas reales hasta el partido y "hoy"/"mañana" según la fecha.
  const heading = typeof hoursLeft === 'number' && hoursLeft > 0
    ? `¡Tienes partido en ${hoursLeft} ${hoursLeft === 1 ? 'hora' : 'horas'}!`
    : '¡Tienes partido pronto!';
  const cuando = isToday ? 'hoy' : 'mañana';

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
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">${heading}</h2>
      <p style="color:#64748B;margin:0 0 28px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${userName}</strong>, te recordamos que ${cuando} tienes una pista reservada:
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

// Aviso interno al admin con los datos de la reserva + método de pago.
// cancelada=true → cabecera roja "Reserva cancelada" (mismo cuerpo de datos).
function adminBookingHtml(
  userName: string, courtName: string, date: string, timeSlot: string,
  metodoPago: string, userEmail?: string, userPhone?: string, cancelada = false,
): string {
  const dateLong = date ? formatDateLong(date) : '—';
  const contacto = [userEmail, userPhone].filter(Boolean).join(' · ');
  const row = (icon: string, label: string, value: string) => `
    <tr>
      <td width="36" valign="top" style="padding-bottom:14px"><span style="font-size:22px">${icon}</span></td>
      <td style="padding-bottom:14px;padding-left:8px">
        <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">${label}</div>
        <div style="font-size:16px;color:#0F172A;font-weight:700">${value}</div>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nueva reserva</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:${cancelada ? 'linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%)' : 'linear-gradient(135deg,#1B3A6E 0%,#152D57 100%)'};padding:32px 28px;text-align:center">
      <div style="font-size:40px;line-height:1;margin-bottom:8px">${cancelada ? '❌' : '🎾'}</div>
      <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px">${cancelada ? 'Reserva cancelada' : 'Nueva reserva'}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">${cancelada ? 'El jugador ha cancelado — el hueco vuelve a estar libre' : 'Aviso para el administrador'}</p>
    </td></tr>
    <tr><td style="padding:28px 28px 8px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px"><tr><td style="padding:20px 20px 6px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('👤', 'Jugador', `${userName}${contacto ? `<div style="font-size:13px;color:#64748B;font-weight:500;margin-top:2px">${contacto}</div>` : ''}`)}
          ${row('🏟️', 'Pista', courtName)}
          ${row('📅', 'Fecha', `<span style="text-transform:capitalize">${dateLong}</span>`)}
          ${row('⏰', 'Horario', timeSlot)}
          ${row('💶', 'Método de pago', metodoPago)}
        </table>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8">Padel Medina · aviso automático de reserva</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// Aviso al CLIENTE de que el club ha cancelado su reserva (lo usa el panel).
function clientCancelHtml(userName: string, courtName: string, date: string, timeSlot: string): string {
  const dateLong = date ? formatDateLong(date) : '—';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reserva cancelada</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">❌</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Reserva cancelada</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">Tu reserva ha sido cancelada</h2>
      <p style="color:#64748B;margin:0 0 28px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${userName}</strong>, sentimos avisarte de que el club ha cancelado esta reserva. Si el pago estaba hecho, nos pondremos en contacto contigo.
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
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${APP_URL}/reservar" style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 32px;border-radius:10px">
          Hacer otra reserva
        </a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
        Padel Medina · ¿Dudas? Escríbenos a
        <a href="mailto:${REPLY_TO}" style="color:#16A34A;text-decoration:none">${REPLY_TO}</a>
      </p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Solo el propio backend (service role) o un usuario con sesión válida:
// sin esto, cualquiera con la anon key podía mandar correos "de Padel
// Medina" a quien quisiera. En cloud iba sin verificar; en el Plesk se cierra.
// Devolvemos además quién llama (service role / admin / usuario normal) y su
// email de sesión, para forzar el destinatario y blindar los avisos de admin.
type AuthResult =
  | { ok: false; status: number; error: string }
  | { ok: true; serviceRole: true; isAdmin: true; email: null }
  | { ok: true; serviceRole: false; isAdmin: boolean; email: string | null };
async function callerAutorizado(req: Request): Promise<AuthResult> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'No autenticado' };
  if (serviceKey && token === serviceKey) return { ok: true, serviceRole: true, isAdmin: true, email: null };
  if (!url || !serviceKey) return { ok: false, status: 500, error: 'Función mal configurada' };
  const meRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) return { ok: false, status: 401, error: 'Sesión inválida' };
  const me = await meRes.json().catch(() => null);
  const callerId = me?.id;
  const callerEmail = typeof me?.email === 'string' ? me.email : null;
  if (!callerId) return { ok: false, status: 401, error: 'Sesión inválida' };

  // ¿Es admin? Lo decide profiles.role en el servidor, nunca el navegador.
  let isAdmin = false;
  try {
    const roleRes = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=role`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const rows = await roleRes.json().catch(() => []);
    isAdmin = Array.isArray(rows) && rows[0]?.role === 'admin';
  } catch (_e) {
    isAdmin = false;
  }
  return { ok: true, serviceRole: false, isAdmin, email: callerEmail };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await callerAutorizado(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, email, userName, courtName, date, timeSlot, metodoPago, userPhone, hoursLeft, isToday } = await req.json();
    const reminderIsToday = isToday !== false;

    const isAdminType = type === 'admin' || type === 'admin-cancel';
    const isAdminCancel = type === 'admin-cancel';
    const isConfirmation = type === 'confirmation';
    const isCancelada = type === 'cancelada';

    // Nota: los tipos 'admin'/'admin-cancel' SÍ los puede pedir un cliente con
    // sesión, porque es el propio jugador quien, al reservar en el club o cancelar,
    // dispara el aviso al club. No es un agujero: el destinatario va SIEMPRE a
    // ADMIN_EMAIL (nunca a una dirección elegida por el navegador) y todo el texto
    // va escapado. Bloquearlo dejaba al club sin el correo de esas reservas.

    // El aviso al admin no necesita `email` del jugador (va a ADMIN_EMAIL).
    if (!type || !courtName || !timeSlot || (!isAdminType && !email)) {
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

    const startTime = timeSlot.split(' - ')[0];
    const [y, m, d] = (date || '').split('-');
    const dateShort = d && m && y ? `${d}/${m}/${y}` : '';

    // Destinatario. El aviso interno va al admin. Para el resto: el backend o
    // un admin pueden escribir a cualquier jugador (lo necesita el panel para
    // 'cancelada'); un usuario normal solo puede mandarse el correo a sí mismo,
    // nunca a una dirección que elija en el navegador.
    let to: string;
    if (isAdminType) {
      to = ADMIN_EMAIL;
    } else if (auth.serviceRole || auth.isAdmin) {
      to = email;
    } else {
      if (!auth.email) {
        return new Response(JSON.stringify({ error: 'No podemos verificar tu correo' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      to = auth.email;
    }

    const subject = isAdminCancel
      ? `❌ Reserva CANCELADA: ${courtName}${dateShort ? ` · ${dateShort}` : ''} · ${timeSlot}`
      : isAdminType
        ? `🎾 Nueva reserva: ${courtName}${dateShort ? ` · ${dateShort}` : ''} · ${timeSlot}${metodoPago ? ` · ${metodoPago}` : ''}`
        : isConfirmation
          ? `Reserva confirmada – ${courtName}${dateShort ? ` · ${dateShort}` : ''}`
          : isCancelada
            ? `Tu reserva ha sido cancelada – ${courtName}${dateShort ? ` · ${dateShort}` : ''}`
            : `Recordatorio: tienes partido ${reminderIsToday ? 'hoy' : 'mañana'} a las ${startTime}`;

    // Escapamos todo lo que venga del usuario antes de incrustarlo en el HTML.
    const safeName = escapeHtml(userName || 'jugador/a');
    const safeCourt = escapeHtml(courtName);
    const safeSlot = escapeHtml(timeSlot);
    const safeMetodo = escapeHtml(metodoPago || '—');
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(userPhone);

    const html = isAdminType
      ? adminBookingHtml(safeName, safeCourt, date, safeSlot, safeMetodo, safeEmail, safePhone, isAdminCancel)
      : isConfirmation
        ? confirmationHtml(safeName, safeCourt, date, safeSlot)
        : isCancelada
          ? clientCancelHtml(safeName, safeCourt, date, safeSlot)
          : reminderHtml(safeName, safeCourt, safeSlot, typeof hoursLeft === 'number' ? hoursLeft : undefined, reminderIsToday);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [to], subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Email (${type}) sent to ${to} — id: ${result.id}`);
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
