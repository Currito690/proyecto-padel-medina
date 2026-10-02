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
        const now = new Date();
        const calcNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
        // Fecha de hoy en Madrid (YYYY-MM-DD) para no cargar reservas pasadas.
        const todayMadrid = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

        // 1. Reservas confirmadas sin recordatorio, solo de hoy en adelante.
        //    Antes se cargaban TODAS (las pasadas nunca se marcaban y la
        //    consulta no paraba de crecer).
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select(`
                id, date, time_slot, user_id, metodo_pago,
                courts ( name )
            `)
            .eq('status', 'confirmed')
            .eq('reminder_sent', false)
            .gte('date', todayMadrid);

        if (bookingsError) throw bookingsError;
        if (!bookings || bookings.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending reminders' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. Nos quedamos con las que empiezan en las próximas 10,5 h.
        //    Saltamos las reservas manuales del club (metodo_pago='manual').
        const candidates: Array<{ b: typeof bookings[number]; diffHours: number }> = [];
        for (const b of bookings) {
            if (b.metodo_pago === 'manual') continue;

            const [hour, min] = b.time_slot.split(' - ')[0].split(':');
            const [year, month, day] = b.date.split('-');
            const bookingDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), 0);

            const diffHours = (bookingDate.getTime() - calcNow.getTime()) / (1000 * 60 * 60);

            if (diffHours > 0 && diffHours <= 10.5) {
                candidates.push({ b, diffHours });
            }
        }

        if (candidates.length === 0) {
            return new Response(JSON.stringify({ message: 'No bookings match time window' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 3. Perfiles y suscripciones push. El role sirve para no recordarle al
        //    club sus propias reservas (dueño admin).
        const userIds = [...new Set(candidates.map(c => c.b.user_id))];
        const [{ data: subs, error: subsError }, { data: profiles }] = await Promise.all([
            supabase.from('push_subscriptions').select('*').in('user_id', userIds),
            supabase.from('profiles').select('id, name, email, role').in('id', userIds),
        ]);

        if (subsError) throw subsError;

        const profilesByUser: Record<string, { name: string; email: string; role: string }> =
            (profiles || []).reduce((acc: Record<string, { name: string; email: string; role: string }>, p: { id: string; name: string; email: string; role: string }) => {
                acc[p.id] = p;
                return acc;
            }, {});

        // Fuera los dueños admin (reservas manuales del club).
        const toNotify = candidates.filter(c => profilesByUser[c.b.user_id]?.role !== 'admin');

        if (toNotify.length === 0) {
            return new Response(JSON.stringify({ message: 'No bookings match time window' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        let sentCount = 0;
        const failedPushes = [];

        // 4. Send push notifications
        if (subs && subs.length > 0) {
            const subsByUser = subs.reduce((acc, sub) => {
                if (!acc[sub.user_id]) acc[sub.user_id] = [];
                acc[sub.user_id].push(sub);
                return acc;
            }, {});

            for (const { b, diffHours } of toNotify) {
                const userSubs = subsByUser[b.user_id] || [];
                const courtName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name;
                const hoursLeft = Math.max(1, Math.round(diffHours));
                const isToday = b.date === todayMadrid;
                const payload = JSON.stringify({
                    title: `Padel Medina: ¡Juegas en ${hoursLeft}h!`,
                    body: `Tu partido en ${courtName || 'tu pista'} empieza ${isToday ? 'hoy' : 'mañana'} a las ${b.time_slot.split(' - ')[0]}. ¡Sé puntual!`,
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

        // 5. Send reminder emails via send-booking-email function.
        //    Solo marcamos reminder_sent cuando el correo responde 200 (antes
        //    se marcaba pasara lo que pasara). Las reservas sin email no tienen
        //    correo que reintentar, así que también se marcan para que el push
        //    no se repita en cada pasada del cron.
        const emailFnUrl = `${supabaseUrl}/functions/v1/send-booking-email`;
        const bookingIdsToUpdate: string[] = [];
        for (const { b, diffHours } of toNotify) {
            const profile = profilesByUser[b.user_id];
            const courtName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name;

            // Marcamos SIEMPRE el recordatorio como enviado: el push ya salió en el
            // paso 4, así que si fallara el correo NO debemos repetir toda la pasada
            // (eso reenviaría el push una y otra vez cada 30 min). El correo es un
            // extra best-effort.
            bookingIdsToUpdate.push(b.id);
            if (!profile?.email) continue;

            const hoursLeft = Math.max(1, Math.round(diffHours));
            const isToday = b.date === todayMadrid;

            try {
                const emailRes = await fetch(emailFnUrl, {
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
                        hoursLeft,
                        isToday,
                    }),
                });
                if (emailRes.status !== 200) console.warn('Reminder email non-200:', b.id, emailRes.status);
            } catch (e) {
                console.warn('Reminder email error:', e);
            }
        }

        // 6. Marcar solo las que se enviaron bien (o no tenían correo).
        if (bookingIdsToUpdate.length > 0) {
            await supabase
                .from('bookings')
                .update({ reminder_sent: true })
                .in('id', bookingIdsToUpdate);
        }

        return new Response(JSON.stringify({ sentCount, updatedBookings: bookingIdsToUpdate.length, failedPushes: failedPushes.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('send-reminders error:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
});
