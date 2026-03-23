import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.1.1?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature || !endpointSecret) {
    return new Response('Missing signature or secret', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      endpointSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      const { court_id, user_id, date, time_slot } = paymentIntent.metadata || {};

      if (court_id && user_id && date && time_slot) {
        const { error } = await supabase.from('bookings').insert({
          court_id: court_id,
          user_id: user_id,
          date: date,
          time_slot: time_slot,
          status: 'confirmed',
          is_free: false,
        });

        if (error) {
          console.error('Error inserting booking:', error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      } else {
        console.error('Missing metadata for booking creation', paymentIntent.metadata);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
