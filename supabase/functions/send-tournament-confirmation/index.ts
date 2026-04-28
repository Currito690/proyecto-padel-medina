// supabase/functions/send-tournament-confirmation/index.ts
// Deploy: npx supabase functions deploy send-tournament-confirmation
// Secret needed: RESEND_API_KEY (la misma API key que send-booking-email)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>';
const REPLY_TO = 'info@padelmedina.com';
const APP_URL = Deno.env.get('APP_URL') || 'https://padelmedina.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function confirmedHtml(coupleName: string, tournamentName: string, category: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inscripción confirmada</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#16A34A 0%,#059669 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">🏆</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Inscripción confirmada</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">✅ ¡Estáis dentro!</h2>
      <p style="color:#64748B;margin:0 0 24px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${coupleName}</strong>, vuestra pareja ha sido <strong>confirmada</strong> por el club. ¡Nos vemos en pista!
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:18px 20px">
          <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Torneo</div>
          <div style="font-size:16px;color:#0F172A;font-weight:700;margin-bottom:14px">${tournamentName}</div>
          <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Categoría</div>
          <div style="font-size:16px;color:#0F172A;font-weight:700">${category}</div>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;margin-bottom:24px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#15803D;line-height:1.6">
            💡 Cuando se publique el cuadro recibiréis los horarios de vuestros partidos.
          </p>
        </td></tr>
      </table>
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

function rejectedHtml(coupleName: string, tournamentName: string, category: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inscripción no aceptada</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#D97706 0%,#B45309 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">📋</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Inscripción revisada</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">Cambio de categoría recomendado</h2>
      <p style="color:#64748B;margin:0 0 18px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${coupleName}</strong>, hemos revisado vuestra inscripción al torneo
        <strong style="color:#0F172A">${tournamentName}</strong> en la categoría <strong style="color:#0F172A">${category}</strong>.
      </p>
      <p style="color:#64748B;margin:0 0 24px;font-size:15px;line-height:1.6">
        Por nivel, creemos que <strong>deberíais apuntaros a una categoría superior</strong> para que la competición sea equilibrada y disfrutéis más del torneo.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;margin-bottom:24px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#9A3412;line-height:1.6">
            🔁 Volved a inscribiros desde la web eligiendo una categoría superior. Si tenéis dudas, escribidnos.
          </p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${APP_URL}" style="display:inline-block;background:#0F172A;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 32px;border-radius:10px">
          Ir a Padel Medina
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, emails, coupleName, tournamentName, category } = await req.json();

    if (!action || !Array.isArray(emails) || emails.length === 0 || !tournamentName || !category) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action !== 'confirm' && action !== 'reject') {
      return new Response(JSON.stringify({ error: 'Invalid action (must be confirm or reject)' }), {
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

    const safeCouple = coupleName || 'jugadores';
    const isConfirm = action === 'confirm';
    const subject = isConfirm
      ? `Inscripción confirmada – ${tournamentName} (${category})`
      : `Inscripción al torneo ${tournamentName}: cambio de categoría`;
    const html = isConfirm
      ? confirmedHtml(safeCouple, tournamentName, category)
      : rejectedHtml(safeCouple, tournamentName, category);

    // Validamos y deduplicamos los correos
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmails = Array.from(new Set(
      emails
        .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
        .filter((e: string) => emailRe.test(e))
    ));

    if (cleanEmails.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid emails' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resend acepta varios destinatarios en un único envío.
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: cleanEmails, subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Tournament email (${action}) sent to ${cleanEmails.join(',')} — id: ${result.id}`);
    return new Response(JSON.stringify({ success: true, id: result.id, sentTo: cleanEmails }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-tournament-confirmation error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
