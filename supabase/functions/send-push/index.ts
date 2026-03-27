// Supabase Edge Function: send-push
// Deploy with: npx supabase functions deploy send-push
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_MAILTO = `mailto:${Deno.env.get('VAPID_EMAIL') || 'admin@padelmedina.com'}`;

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    try {
        const body = await req.json();
        const { title, body: message, url } = body;

        const { data: subs, error } = await supabase
            .from('push_subscriptions')
            .select('*');

        if (error) {
            console.error('Error fetching subscriptions:', error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        if (!subs || subs.length === 0) {
            console.log('No subscriptions found');
            return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const payload = JSON.stringify({
            title: title || 'Padel Medina',
            body: message || '',
            url: url || '/'
        });

        const results = await Promise.allSettled(
            subs.map(async (sub) => {
                const subscriptionObj = typeof sub.subscription === 'string'
                    ? JSON.parse(sub.subscription)
                    : sub.subscription;
                return webpush.sendNotification(subscriptionObj, payload);
            })
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');

        console.log(`Push enviado a ${sent}/${subs.length} dispositivos`);
        if (failed.length > 0) console.log('Failed pushes:', failed);

        return new Response(JSON.stringify({ sent, total: subs.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (err) {
        console.error('send-push error:', err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});
