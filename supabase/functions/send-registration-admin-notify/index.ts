// supabase/functions/send-registration-admin-notify/index.ts
// Deploy: npx supabase functions deploy send-registration-admin-notify
// Avisa al club por correo cuando llega una nueva inscripción a un torneo.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>';
const REPLY_TO = 'info@padelmedina.com';
// Destinatario fijo: buzón del club. Si en el futuro se quiere cambiar
// se puede leer de Deno.env.get('CLUB_NOTIFY_EMAIL') sin romper nada.
const ADMIN_EMAIL = Deno.env.get('CLUB_NOTIFY_EMAIL') || 'padelmedina@hotmail.es';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

function row(label: string, value: string): string {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;width:120px;vertical-align:top">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#0F172A;font-weight:600">${value}</td>
    </tr>`;
}

interface RegistrationPayload {
  tournamentName: string;
  category: string;
  player1Name: string;
  player2Name: string;
  player1Email?: string | null;
  player2Email?: string | null;
  player1Phone?: string | null;
  player2Phone?: string | null;
  player1ShirtSize?: string | null;
  player2ShirtSize?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  amount?: number | null;
  registrationsUrl?: string | null;
}

function buildHtml(p: RegistrationPayload): string {
  const couple = `${p.player1Name} y ${p.player2Name}`;
  const contact1 = [p.player1Phone, p.player1Email].filter(Boolean).join(' · ');
  const contact2 = [p.player2Phone, p.player2Email].filter(Boolean).join(' · ');
  const sizes = (p.player1ShirtSize || p.player2ShirtSize)
    ? `J1: ${p.player1ShirtSize || '—'} · J2: ${p.player2ShirtSize || '—'}`
    : '';
  const payLabel = (() => {
    if (!p.paymentStatus || p.paymentStatus === 'not_required') return '';
    const method = p.paymentMethod === 'card' ? 'Tarjeta'
      : p.paymentMethod === 'club' ? 'En el club'
      : '';
    const amount = p.amount != null ? ` · ${Number(p.amount).toFixed(2)}€` : '';
    const status = p.paymentStatus === 'paid' ? '✓ Pagado'
      : p.paymentStatus === 'pending' ? '⏳ Pendiente'
      : p.paymentStatus;
    return `${status}${method ? ' · ' + method : ''}${amount}`;
  })();

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nueva inscripción</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);padding:28px;text-align:center">
      <div style="font-size:36px;line-height:1;margin-bottom:8px">📋</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px">Nueva inscripción</h1>
      <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">${escapeHtml(p.tournamentName)}</p>
    </td></tr>
    <tr><td style="padding:26px 28px">
      <h2 style="color:#0F172A;font-size:18px;margin:0 0 6px;font-weight:800">${escapeHtml(couple)}</h2>
      <p style="color:#64748B;margin:0 0 18px;font-size:13px">Categoría: <strong style="color:#0F172A">${escapeHtml(p.category)}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:10px;padding:8px 14px;margin-bottom:14px">
        ${row('Jugador 1', escapeHtml(p.player1Name))}
        ${row('Contacto J1', escapeHtml(contact1))}
        ${row('Jugador 2', escapeHtml(p.player2Name))}
        ${row('Contacto J2', escapeHtml(contact2))}
        ${sizes ? row('Tallas', escapeHtml(sizes)) : ''}
        ${payLabel ? row('Pago', escapeHtml(payLabel)) : ''}
      </table>
      ${p.registrationsUrl ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td align="center">
        <a href="${escapeHtml(p.registrationsUrl)}" style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 26px;border-radius:8px">
          Ver y validar inscripciones
        </a>
      </td></tr></table>` : ''}
      <p style="color:#94A3B8;margin:18px 0 0;font-size:12px;line-height:1.5">
        Recuerda confirmar la pareja en el panel de admin para que entre en el cuadro.
      </p>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:14px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:11px;color:#94A3B8">Aviso automático · Padel Medina</p>
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
    const payload = await req.json() as RegistrationPayload;

    if (!payload.tournamentName || !payload.category || !payload.player1Name || !payload.player2Name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `📋 Nueva inscripción — ${payload.tournamentName} (${payload.category})`;
    const html = buildHtml(payload);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [ADMIN_EMAIL], subject, html }),
    });
    const result = await res.json();
    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id, sentTo: ADMIN_EMAIL }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-registration-admin-notify error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
