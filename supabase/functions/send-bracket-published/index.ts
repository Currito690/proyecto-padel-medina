// supabase/functions/send-bracket-published/index.ts
// Deploy: npx supabase functions deploy send-bracket-published
// Notifica a todos los jugadores inscritos que el cuadro del torneo se ha
// publicado e incluye el enlace para verlo.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>';
const REPLY_TO = 'info@padelmedina.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function bracketHtml(tournamentName: string, tournamentUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cuadro publicado</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#16A34A 0%,#059669 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">🏆</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">¡Cuadro publicado!</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 12px;font-weight:800">¡Ya está el cuadro!</h2>
      <p style="color:#64748B;margin:0 0 20px;font-size:15px;line-height:1.6">
        Se acaba de publicar el cuadro del torneo <strong style="color:#0F172A">${tournamentName}</strong>. Consulta tus partidos, horarios y la pista que te toca.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
        <tr><td align="center">
          <a href="${tournamentUrl}" style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:14px 36px;border-radius:10px;box-shadow:0 4px 12px rgba(22,163,74,0.25)">
            Ver cuadro del torneo
          </a>
        </td></tr>
      </table>
      <p style="color:#94A3B8;margin:0;font-size:12px;text-align:center;line-height:1.6">
        O copia este enlace en tu navegador:<br>
        <a href="${tournamentUrl}" style="color:#2563EB;text-decoration:none;word-break:break-all">${tournamentUrl}</a>
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;margin-top:24px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#15803D;line-height:1.6">
            💡 <strong>Sé puntual.</strong> Llega 5–10 minutos antes de tu partido para calentar y empezar a la hora.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { emails, tournamentName, tournamentUrl } = await req.json();

    if (!Array.isArray(emails) || emails.length === 0 || !tournamentName || !tournamentUrl) {
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

    // Limpia y deduplica los correos
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmails = Array.from(new Set(
      (emails as unknown[])
        .map(e => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
        .filter(e => emailRe.test(e))
    ));

    if (cleanEmails.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid emails' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `🏆 Cuadro publicado — ${tournamentName}`;
    const html = bracketHtml(tournamentName, tournamentUrl);

    // Envío individual por cada destinatario para preservar privacidad
    // (no se ven los demás correos en el "To"). En paralelo con allSettled
    // para no parar el resto si uno falla.
    const sends = cleanEmails.map(email =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [email], subject, html }),
      }).then(async (res) => ({ email, ok: res.ok, status: res.status, body: res.ok ? null : await res.text() }))
    );
    const results = await Promise.allSettled(sends);

    let success = 0; let failed = 0;
    const failures: { email: string; reason: string }[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) success++;
      else {
        failed++;
        const reason = r.status === 'rejected' ? String(r.reason) : `HTTP ${r.value.status}: ${r.value.body}`;
        failures.push({ email: r.status === 'fulfilled' ? r.value.email : 'unknown', reason });
      }
    }
    if (failures.length > 0) console.warn('send-bracket-published failures:', failures);

    return new Response(JSON.stringify({ success: true, sent: success, failed, total: cleanEmails.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-bracket-published error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
