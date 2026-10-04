// Supabase Edge Function: stripe-webhook
// Stripe calls this after checkout; on payment success it inserts an order row.
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get('stripe-signature');
    const body = await req.text();
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );

    if (event.type === 'checkout.session.completed') {
      const s: any = event.data.object;
      const db = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const lineItems = await stripe.checkout.sessions.listLineItems(s.id);
      await db.from('orders').insert({
        user_id: s.metadata?.user_id || s.client_reference_id || null,
        items: lineItems.data.map(li => ({ name: li.description, qty: li.quantity, price: li.amount_total / 100 })),
        amount_total: (s.amount_total ?? 0) / 100,
        status: s.payment_status || 'paid',
      });
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 400 });
  }
});
