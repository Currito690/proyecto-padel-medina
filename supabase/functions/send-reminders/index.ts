// Supabase Edge Function: send-reminders
// Deploy with: npx supabase functions deploy send-reminders
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_MAILTO = `mailto:${Deno.env.get('VAPID_EMAIL') || 'admin@padelmedina.com'}`;

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. Get confirmed bookings that haven't been reminded
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select(`
                id, date, time_slot, user_id,
                courts ( name )
            `)
            .eq('status', 'confirmed')
            .eq('reminder_sent', false);

        if (bookingsError) throw bookingsError;
        if (!bookings || bookings.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending reminders' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const now = new Date();
        const calcNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
        const toNotify = [];
        const bookingIdsToUpdate = [];

        // 2. Filter bookings starting within the next 10.5 hours
        for (const b of bookings) {
            const [hour, min] = b.time_slot.split(' - ')[0].split(':');
            const [year, month, day] = b.date.split('-');
            const bookingDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), 0);

            const diffHours = (bookingDate.getTime() - calcNow.getTime()) / (1000 * 60 * 60);

            if (diffHours > 0 && diffHours <= 10.5) {
                toNotify.push(b);
                bookingIdsToUpdate.push(b.id);
            }
        }

        if (toNotify.length === 0) {
            return new Response(JSON.stringify({ message: 'No bookings match time window' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 3. Get push subscriptions and user profiles
        const userIds = [...new Set(toNotify.map(b => b.user_id))];
        const [{ data: subs, error: subsError }, { data: profiles }] = await Promise.all([
            supabase.from('push_subscriptions').select('*').in('user_id', userIds),
            supabase.from('profiles').select('id, name, email').in('id', userIds),
        ]);

        if (subsError) throw subsError;

        const profilesByUser: Record<string, { name: string; email: string }> =
            (profiles || []).reduce((acc: Record<string, { name: string; email: string }>, p: { id: string; name: string; email: string }) => {
                acc[p.id] = p;
                return acc;
            }, {});

        let sentCount = 0;
        const failedPushes = [];

        // 4. Send push notifications
        if (subs && subs.length > 0) {
            const subsByUser = subs.reduce((acc, sub) => {
                if (!acc[sub.user_id]) acc[sub.user_id] = [];
                acc[sub.user_id].push(sub);
                return acc;
            }, {});

            for (const b of toNotify) {
                const userSubs = subsByUser[b.user_id] || [];
                const courtName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name;
                const payload = JSON.stringify({
                    title: `Padel Medina: ¡Juegas en 10h!`,
                    body: `Tu partido en ${courtName || 'tu pista'} empieza hoy a las ${b.time_slot.split(' - ')[0]}. ¡Sé puntual!`,
                    url: '/mis-reservas'
                });

                for (const sub of userSubs) {
                    try {
                        const subscriptionObj = typeof sub.subscription === 'string'
                            ? JSON.parse(sub.subscription)
                            : sub.subscription;
                        await webpush.sendNotification(subscriptionObj, payload);
                        sentCount++;
                    } catch (e) {
                        failedPushes.push(e);
                    }
                }
            }
        }

        // 5. Send reminder emails via send-booking-email function
        const emailFnUrl = `${supabaseUrl}/functions/v1/send-booking-email`;
        for (const b of toNotify) {
            const profile = profilesByUser[b.user_id];
            if (!profile?.email) continue;
            const courtName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name;

            fetch(emailFnUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                    type: 'reminder',
                    email: profile.email,
                    userName: profile.name || 'jugador/a',
                    courtName: courtName || 'tu pista',
                    date: b.date,
                    timeSlot: b.time_slot,
                }),
            }).catch((e) => console.warn('Reminder email error:', e));
        }

        // 6. Mark as reminder_sent = true
        await supabase
            .from('bookings')
            .update({ reminder_sent: true })
            .in('id', bookingIdsToUpdate);

        return new Response(JSON.stringify({ sentCount, updatedBookings: bookingIdsToUpdate.length, failedPushes: failedPushes.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('send-reminders error:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
});
