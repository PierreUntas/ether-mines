// "stripe-webhook" function: Stripe calls it (no player token: deployed with --no-verify-jwt) when a payment
// goes through or is refunded. Every call must carry Stripe's signature, checked with STRIPE_WEBHOOK_SECRET
// (whsec_…, set in Supabase, never in the repo); anything else is refused. The database side is
// 050_purchases.sql (srv_premium_paid, srv_premium_refunded), safe to receive the same event twice.
// Events to send it (Stripe → Developers → Webhooks): checkout.session.completed,
// checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.closed.
import '../_shared/stripe.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
const Kit = (globalThis as any).StripeKit;
const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);
  const body = await req.text();
  const signed = await Kit.verify(body, req.headers.get('Stripe-Signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET') || '', Date.now() / 1000);
  if (!signed) return ok({ error: 'bad signature' }, 400);
  try {
    const ev = JSON.parse(body);
    const o = ev.data?.object || {};
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const done = (r: { error: unknown; data: unknown }) => {
      if (r.error) throw r.error;
      return ok({ received: true, result: r.data });
    };

    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      if (o.payment_status !== 'paid') return ok({ received: true, waiting: o.payment_status });
      const cid = Number(o.metadata?.cosmetic);
      return done(
        await admin.rpc('srv_premium_paid', {
          session: o.id,
          payment: o.payment_intent || null,
          mail: o.customer_details?.email || null,
          amount: o.amount_total,
          live: !!o.livemode,
          p_user: o.metadata?.user || null,
          cid: Number.isInteger(cid) ? cid : null,
        }),
      );
    }
    // a full refund, or a dispute the buyer won, takes the piece back
    if (ev.type === 'charge.refunded' && o.refunded && o.payment_intent)
      return done(await admin.rpc('srv_premium_refunded', { payment: o.payment_intent }));
    if (ev.type === 'charge.dispute.closed' && o.status === 'lost' && o.payment_intent)
      return done(await admin.rpc('srv_premium_refunded', { payment: o.payment_intent }));
    return ok({ received: true, ignored: ev.type });
  } catch (e) {
    // a 500 makes Stripe send it again later, which is what we want if the database hiccups
    return ok({ error: String((e as Error)?.message || e) }, 500);
  }
});
