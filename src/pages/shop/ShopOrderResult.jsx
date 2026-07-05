import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur } from '../../utils/shopFormat';
import { SHOP, displayFont, ctaBtn, ghostBtn, darkCard } from './shopTheme';

// Página de retorno tras pagar en Redsys. La FUENTE DE VERDAD del pago es la
// notificación server-to-server (redsys-notify); aquí solo consultamos el
// estado del pedido para mostrarlo. Si el pago fue OK, vaciamos el carrito.
export default function ShopOrderResult() {
  const { numero } = useParams();
  const [params] = useSearchParams();
  const hint = params.get('r'); // 'ok' | 'ko' (pista del redirect, no autoritativa)
  const { clear } = useProductCart();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let tries = 0;
    let cancel = false;
    const poll = async () => {
      try {
        const { data } = await supabase.functions.invoke('shop-order-status', { body: { numero_pedido: numero } });
        if (cancel) return;
        if (data?.order) {
          setOrder(data.order);
          if (data.order.estado && data.order.estado !== 'pendiente_pago') {
            setLoading(false);
            if (['pagado', 'preparando', 'enviado', 'entregado'].includes(data.order.estado)) clear();
            return;
          }
        }
      } catch { /* la función puede no estar desplegada todavía */ }
      // Reintenta unos segundos: la notificación de Redsys puede tardar
      if (++tries < 5 && !cancel) setTimeout(poll, 1500);
      else if (!cancel) setLoading(false);
    };
    poll();
    return () => { cancel = true; };
  }, [numero]);

  const pagado = order ? ['pagado', 'preparando', 'enviado', 'entregado'].includes(order.estado) : hint === 'ok';
  const fallido = order ? ['pago_fallido', 'cancelado'].includes(order.estado) : hint === 'ko';

  return (
    <div style={{ maxWidth: 540, margin: '2rem auto', textAlign: 'center' }}>
      <div style={darkCard({ padding: '2.75rem 1.75rem', borderRadius: '1.4rem' })}>
        {loading && !order ? (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏳</div>
            <h1 style={{ ...displayFont('1.25rem'), marginBottom: '0.6rem' }}>Confirmando tu pago…</h1>
            <p style={{ color: SHOP.muted, fontSize: '0.9rem' }}>Pedido <strong style={{ color: SHOP.white }}>{numero}</strong></p>
          </>
        ) : pagado ? (
          <>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: SHOP.limeSoft, color: SHOP.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem', border: `2px solid ${SHOP.lime}` }}>✓</div>
            <h1 style={{ ...displayFont('1.4rem'), marginBottom: '0.6rem' }}>¡Gracias por tu <span style={{ color: SHOP.lime }}>compra</span>!</h1>
            <p style={{ color: SHOP.muted, fontSize: '0.92rem', margin: '0 0 0.5rem' }}>Tu pedido <strong style={{ color: SHOP.white }}>{numero}</strong> se ha confirmado.</p>
            {order && <p style={{ color: SHOP.lime, fontWeight: 900, fontSize: '1.35rem', margin: '0.25rem 0' }}>{fmtEur(order.total_centimos)}</p>}
            <p style={{ color: SHOP.muted, fontSize: '0.82rem', margin: '0.75rem 0 0' }}>Te hemos enviado un email con el detalle. {order?.metodo_entrega === 'envio' ? 'Prepararemos tu envío en breve.' : 'Podrás recogerlo en el club.'}</p>
          </>
        ) : fallido ? (
          <>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', color: SHOP.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem', border: `2px solid ${SHOP.danger}` }}>✕</div>
            <h1 style={{ ...displayFont('1.4rem'), marginBottom: '0.6rem' }}>Pago no completado</h1>
            <p style={{ color: SHOP.muted, fontSize: '0.92rem' }}>El pedido <strong style={{ color: SHOP.white }}>{numero}</strong> no se pudo cobrar. No se te ha hecho ningún cargo. Puedes intentarlo de nuevo.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
            <h1 style={{ ...displayFont('1.25rem'), marginBottom: '0.6rem' }}>Pedido {numero}</h1>
            <p style={{ color: SHOP.muted, fontSize: '0.9rem' }}>Estamos procesando tu pedido. Recibirás un email cuando se confirme el pago.</p>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginTop: '1.75rem', flexWrap: 'wrap' }}>
          <Link to="/tienda" style={ctaBtn({ padding: '0.8rem 1.5rem', fontSize: '0.85rem' })}>Volver a la tienda</Link>
          {fallido && <Link to="/tienda/checkout" style={ghostBtn()}>Reintentar</Link>}
        </div>
      </div>
    </div>
  );
}
