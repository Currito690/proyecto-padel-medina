// supabase/functions/send-push/index.ts
// Envía push notifications a todos los admins suscritos
import { createClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { title, body, url } = await req.json();

    webPush.setVapidDetails(
      `mailto:${Deno.env.get('VAPID_EMAIL')}`,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('subscription');

    if (error) throw error;

    const results = await Promise.allSettled(
      (subs || []).map((row) =>
        webPush.sendNotification(
          row.subscription,
          JSON.stringify({ title, body, url: url || '/' })
        )
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`Push enviado a ${sent}/${subs?.length ?? 0} dispositivos`);

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
