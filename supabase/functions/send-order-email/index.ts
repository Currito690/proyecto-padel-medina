// supabase/functions/send-order-email/index.ts
// Email de confirmación de compra de la TIENDA (cliente) + aviso al club.
// Reutiliza Resend (mismo RESEND_API_KEY) y la identidad visual de Padel Medina.
// Deploy: npx supabase functions deploy send-order-email
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Padel Medina <reservas@padelmedina.com>'; // remitente verificado en Resend
const REPLY_TO = 'info@padelmedina.com';
const APP_URL = Deno.env.get('APP_URL') || 'https://padelmedina.com';
// Email del club que recibe aviso de venta (configurable; por defecto info@).
const SHOP_NOTIFY_EMAIL = Deno.env.get('SHOP_NOTIFY_EMAIL') || 'info@padelmedina.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const eur = (c: number) => (Number(c || 0) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function itemsRows(items: any[]): string {
  return (items || []).map(it => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #EEF2F7;font-size:14px;color:#0F172A">
        ${esc(it.nombre_producto)}${it.variante_desc ? `<span style="color:#94A3B8"> · ${esc(it.variante_desc)}</span>` : ''}
        <span style="color:#94A3B8"> × ${esc(it.cantidad)}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #EEF2F7;font-size:14px;color:#0F172A;text-align:right;white-space:nowrap;font-weight:600">${eur(it.subtotal_centimos)}</td>
    </tr>`).join('');
}

function orderHtml(order: any): string {
  const addr = order.direccion_envio;
  const entrega = order.metodo_entrega === 'envio'
    ? `Envío a domicilio${addr ? `<br><span style="color:#64748B">${esc([addr.calle, addr.cp, addr.ciudad, addr.provincia].filter(Boolean).join(', '))}</span>` : ''}`
    : 'Recogida en el club';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedido confirmado</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center">
  <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <tr><td style="background:linear-gradient(135deg,#16A34A 0%,#059669 100%);padding:36px 28px;text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:10px">🛍️</div>
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">Padel Medina</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500">Confirmación de pedido</p>
    </td></tr>
    <tr><td style="padding:32px 28px">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 10px;font-weight:800">✅ ¡Pedido confirmado!</h2>
      <p style="color:#64748B;margin:0 0 22px;font-size:15px;line-height:1.6">
        Hola <strong style="color:#0F172A">${esc(order.cliente_nombre)}</strong>, hemos recibido tu pago. ¡Gracias por tu compra!
      </p>
      <p style="margin:0 0 18px;font-size:13px;color:#475569">Nº de pedido: <strong style="color:#0F172A">${esc(order.numero_pedido)}</strong></p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${itemsRows(order.order_items)}</table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
        <tr><td style="font-size:14px;color:#64748B;padding:3px 0">Subtotal</td><td style="font-size:14px;color:#0F172A;text-align:right;padding:3px 0">${eur(order.subtotal_centimos)}</td></tr>
        <tr><td style="font-size:14px;color:#64748B;padding:3px 0">Envío</td><td style="font-size:14px;color:#0F172A;text-align:right;padding:3px 0">${order.gastos_envio_centimos > 0 ? eur(order.gastos_envio_centimos) : 'Gratis'}</td></tr>
        <tr><td style="font-size:17px;color:#0F172A;font-weight:800;padding:10px 0 0;border-top:2px solid #0F172A">Total</td><td style="font-size:17px;color:#16A34A;font-weight:800;text-align:right;padding:10px 0 0;border-top:2px solid #0F172A">${eur(order.total_centimos)}</td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:10px;margin-top:22px">
        <tr><td style="padding:14px 16px">
          <div style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Entrega</div>
          <div style="font-size:14px;color:#0F172A;font-weight:600">${entrega}</div>
        </td></tr>
      </table>

      <p style="color:#94A3B8;margin:22px 0 0;font-size:12px;line-height:1.6">Si tienes cualquier duda, responde a este email.</p>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0">
      <p style="margin:0;font-size:12px;color:#94A3B8">Padel Medina · <a href="${APP_URL}/tienda" style="color:#16A34A;text-decoration:none">Volver a la tienda</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [to], subject, html }),
  });
  const result = await res.json();
  if (!res.ok) throw result;
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { order } = await req.json();
    if (!order?.cliente_email || !order?.numero_pedido) {
      return new Response(JSON.stringify({ error: 'Pedido inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY no configurado');
      return new Response(JSON.stringify({ error: 'Email not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Email al cliente
    await sendEmail(order.cliente_email, `Pedido confirmado · ${order.numero_pedido}`, orderHtml(order));

    // Aviso al club (no rompe el flujo si falla)
    try {
      const resumen = (order.order_items || []).map((it: any) => `${it.cantidad}× ${it.nombre_producto}${it.variante_desc ? ` (${it.variante_desc})` : ''}`).join('<br>');
      await sendEmail(
        SHOP_NOTIFY_EMAIL,
        `🛍️ Nuevo pedido ${order.numero_pedido} — ${eur(order.total_centimos)}`,
        `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0F172A">
          <h2>Nuevo pedido pagado: ${esc(order.numero_pedido)}</h2>
          <p><strong>Cliente:</strong> ${esc(order.cliente_nombre)} · ${esc(order.cliente_email)} · ${esc(order.cliente_telefono || '—')}</p>
          <p><strong>Entrega:</strong> ${order.metodo_entrega === 'envio' ? 'Envío' : 'Recogida en club'}</p>
          <p>${resumen}</p>
          <p><strong>Total:</strong> ${eur(order.total_centimos)}</p>
        </div>`
      );
    } catch (e) { console.warn('aviso al club falló:', e); }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-order-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
