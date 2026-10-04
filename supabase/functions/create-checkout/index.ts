// Supabase Edge Function: create-checkout
// POST { items: [{name, type, price, qty}], userId, userEmail, successUrl, cancelUrl }
// -> { url }  (Stripe Checkout session URL)
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { items, userId, userEmail, successUrl, cancelUrl } = await req.json();
    if (!Array.isArray(items) || !items.length) {
      return new Response(JSON.stringify({ error: 'No items provided' }), { status: 400, headers: corsHeaders });
    }
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail || undefined,
      client_reference_id: userId || undefined,
      metadata: { user_id: userId || '' },
      line_items: items.map((i: any) => ({
        quantity: Math.max(1, Number(i.qty) || 1),
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(i.price) * 100),
          product_data: { name: String(i.name), metadata: { type: String(i.type || '') } },
        },
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
