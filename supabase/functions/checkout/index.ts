// "checkout" function: opens a Stripe Checkout page for one premium piece (rules.js COSMETICS, category
// 'premium', price in euro cents), or a whole premium set at its reduced price (SET_EUR, 051_premium_sets.sql). The player must be signed in and have a password (050_purchases.sql,
// srv_premium_quote); the piece is only granted once Stripe's signed webhook says it was paid
// (stripe-webhook). Secret: STRIPE_SECRET_KEY (sk_test_… or sk_live_…), set in Supabase, never in the repo.
import '../_shared/stripe.js';
import '../_shared/rules.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
const Kit = (globalThis as any).StripeKit;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// a set's name, as the shop shows it (rules.js SETS: "Proof-of-Work" → "Proof-of-Work set")
// deno-lint-ignore no-explicit-any
const setName = (set: string) => `${(((globalThis as any).Rules?.SETS || {})[set] || [set])[0]} set`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!key) return json({ error: 'payments are not open yet' }, 503);
    const live = key.startsWith('sk_live_');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'not signed in' }, 401);
    const user = who.user.id;

    const { cosmetic, set, world, back } = await req.json();
    const isSet = typeof set === 'string';
    if (isSet ? !/^[a-z0-9_-]{1,24}$/.test(set) : !Number.isInteger(cosmetic)) return json({ error: 'invalid piece' }, 400);
    if (typeof world !== 'string' || !/^[a-z0-9-]{1,32}$/.test(world)) return json({ error: 'invalid world' }, 400);
    const ret = Kit.safeReturn(back);
    if (!ret) return json({ error: 'invalid return address' }, 400);

    const q = isSet
      ? await admin.rpc('srv_premium_quote_set', { p_user: user, set_: set, live, w: world })
      : await admin.rpc('srv_premium_quote', { p_user: user, cid: cosmetic, live, w: world });
    if (q.error) throw q.error;
    if (!q.data?.ok) return json({ error: q.data?.error || 'refused' }, 409);

    const back_ = (state: string) => `${ret}?monde=${encodeURIComponent(world)}&shop=${state}`;
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: Kit.form({
        mode: 'payment',
        locale: 'auto',
        client_reference_id: user,
        success_url: back_('paid'),
        cancel_url: back_('cancel'),
        line_items: [
          {
            quantity: 1,
            price_data: { currency: 'eur', unit_amount: q.data.eur, product_data: { name: `Ether Mines · ${isSet ? setName(set) : q.data.name}` } },
          },
        ],
        metadata: isSet
          ? { user, set, pieces: q.data.pieces.join(','), world, nick: q.data.nick }
          : { user, cosmetic, world, nick: q.data.nick },
        payment_intent_data: { metadata: isSet ? { user, set } : { user, cosmetic } },
        // EU law on digital content: the buyer agrees to get it at once and so loses the 14-day withdrawal
        custom_text: {
          submit: {
            message:
              'Your piece is added to your account as soon as the payment goes through. By paying, you agree to get it right away and give up your 14-day right of withdrawal.',
          },
        },
      }),
    });
    const s = await res.json();
    if (!res.ok) return json({ error: s?.error?.message || 'Stripe refused' }, 502);

    const p = isSet
      ? await admin.rpc('srv_premium_pending_set', { p_user: user, set_: set, pieces_: q.data.pieces, eur_: q.data.eur, live, session: s.id })
      : await admin.rpc('srv_premium_pending', { p_user: user, cid: cosmetic, eur_: q.data.eur, live, session: s.id });
    if (p.error) throw p.error;
    return json({ url: s.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
