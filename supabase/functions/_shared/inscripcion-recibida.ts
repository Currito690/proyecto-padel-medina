// Correo «¡Genial! Hemos recibido vuestra inscripción» para la pareja.
// Lo usan send-registration-admin-notify (en cada inscripción nueva) y
// send-tournament-confirmation (action 'received', para mandarlo a mano).
// Los textos que llegan aquí ya vienen escapados.

const CONTACTO = 'info@padelmedina.com';

export function asuntoInscripcionRecibida(torneo: string, categoria: string): string {
  return `Hemos recibido vuestra inscripción – ${torneo} (${categoria})`;
}

export function htmlInscripcionRecibida(pareja: string, torneo: string, categoria: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inscripción recibida</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
  <tr><td align="center">
  <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#16A34A 0%,#059669 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">🎾</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Inscripción recibida</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">¡Genial! Hemos recibido vuestra inscripción</h2>
      <p style="color:#64748B;margin:0 0 24px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${pareja}</strong>, gracias por apuntaros. Vuestra inscripción ya está registrada.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:18px 20px">
          <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Torneo</div>
          <div style="font-size:16px;color:#0F172A;font-weight:700;margin-bottom:14px">${torneo}</div>
          <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Categoría</div>
          <div style="font-size:16px;color:#0F172A;font-weight:700">${categoria}</div>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;margin-bottom:24px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#15803D;line-height:1.6">
            💡 El club revisará la inscripción y os avisaremos por correo cuando esté confirmada. Cuando se publique el cuadro recibiréis los horarios de vuestros partidos.
          </p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
        Padel Medina · ¿Dudas? Escríbenos a
        <a href="mailto:${CONTACTO}" style="color:#16A34A;text-decoration:none">${CONTACTO}</a>
      </p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function textoInscripcionRecibida(pareja: string, torneo: string, categoria: string): string {
  return [
    `¡Genial! Hemos recibido vuestra inscripción, ${pareja}.`,
    '',
    `Torneo: ${torneo}`,
    `Categoría: ${categoria}`,
    '',
    'El club revisará la inscripción y os avisaremos por correo cuando esté confirmada.',
    `¿Dudas? Escríbenos a ${CONTACTO}`,
  ].join('\n');
}
