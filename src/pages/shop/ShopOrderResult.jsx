import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { fmtEur } from '../../utils/shopFormat';

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
    <div style={{ maxWidth: 520, margin: '2rem auto', textAlign: 'center' }}>
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '1.25rem', padding: '2.5rem 1.75rem' }}>
        {loading && !order ? (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏳</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem' }}>Confirmando tu pago…</h1>
            <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Pedido <strong>{numero}</strong></p>
          </>
        ) : pagado ? (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem' }}>✓</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', margin: '0 0 0.5rem' }}>¡Gracias por tu compra!</h1>
            <p style={{ color: '#64748B', fontSize: '0.92rem', margin: '0 0 0.5rem' }}>Tu pedido <strong>{numero}</strong> se ha confirmado.</p>
            {order && <p style={{ color: '#16A34A', fontWeight: 800, fontSize: '1.1rem' }}>{fmtEur(order.total_centimos)}</p>}
            <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '0.75rem 0 0' }}>Te hemos enviado un email con el detalle. {order?.metodo_entrega === 'envio' ? 'Prepararemos tu envío en breve.' : 'Podrás recogerlo en el club.'}</p>
          </>
        ) : fallido ? (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem' }}>✕</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', margin: '0 0 0.5rem' }}>Pago no completado</h1>
            <p style={{ color: '#64748B', fontSize: '0.92rem' }}>El pedido <strong>{numero}</strong> no se pudo cobrar. No se te ha hecho ningún cargo. Puedes intentarlo de nuevo.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem' }}>Pedido {numero}</h1>
            <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Estamos procesando tu pedido. Recibirás un email cuando se confirme el pago.</p>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/tienda" style={{ padding: '0.7rem 1.4rem', background: '#16A34A', color: 'white', borderRadius: '0.75rem', fontWeight: 800, textDecoration: 'none' }}>Volver a la tienda</Link>
          {fallido && <Link to="/tienda/checkout" style={{ padding: '0.7rem 1.4rem', background: 'white', color: '#1B3A6E', border: '1.5px solid #CBD5E1', borderRadius: '0.75rem', fontWeight: 800, textDecoration: 'none' }}>Reintentar</Link>}
        </div>
      </div>
    </div>
  );
}
