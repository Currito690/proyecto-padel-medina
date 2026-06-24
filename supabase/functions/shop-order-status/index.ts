// supabase/functions/shop-order-status/index.ts
// Devuelve el ESTADO de un pedido por su número (para la página de resultado
// tras volver de Redsys). Usa service_role pero SOLO expone campos no sensibles
// (estado, total, método de entrega) — nunca email, dirección ni teléfono.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { numero_pedido } = await req.json();
    if (!numero_pedido) {
      return new Response(JSON.stringify({ error: 'Falta numero_pedido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await supabase
      .from('orders')
      .select('numero_pedido, estado, total_centimos, metodo_entrega')
      .eq('numero_pedido', numero_pedido)
      .maybeSingle();

    return new Response(JSON.stringify({ order: data || null }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
