// "iap-verify" function: the Unity app sends what the App Store or Google Play handed it after a purchase
// (Apple: the transaction id; Google: the product id and purchase token). This function asks Apple's or
// Google's own server whether that purchase is real, ours and not refunded, then records it
// (052_store_purchases.sql, srv_store_paid): the piece or set is the player's in every world. The app only
// finishes the purchase with the store once this answers ok. Secrets (set in Supabase, never in the repo):
//   Apple:  APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY (the .p8's text), APPLE_BUNDLE_ID
//   Google: GOOGLE_PLAY_SERVICE_ACCOUNT (the service account's JSON), GOOGLE_PLAY_PACKAGE
import '../_shared/rules.js';
import '../_shared/stores.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
const Stores = (globalThis as any).AppStores;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'not signed in' }, 401);

    const { store, world, transactionId, productId, purchaseToken } = await req.json();
    if (typeof world !== 'string' || !/^[a-z0-9-]{1,32}$/.test(world)) return json({ error: 'invalid world' }, 400);
    // deno-lint-ignore no-explicit-any
    let r: any;
    if (store === 'apple') {
      if (!env('APPLE_IAP_PRIVATE_KEY')) return json({ error: 'payments are not open yet' }, 503);
      const apple = { keyId: env('APPLE_IAP_KEY_ID'), issuerId: env('APPLE_IAP_ISSUER_ID'), privateKey: env('APPLE_IAP_PRIVATE_KEY'), bundleId: env('APPLE_BUNDLE_ID') };
      r = Stores.checkApple(apple, await Stores.appleTransaction(apple, transactionId));
    } else if (store === 'google') {
      if (!env('GOOGLE_PLAY_SERVICE_ACCOUNT')) return json({ error: 'payments are not open yet' }, 503);
      r = await Stores.googlePurchase({ account: JSON.parse(env('GOOGLE_PLAY_SERVICE_ACCOUNT')), packageName: env('GOOGLE_PLAY_PACKAGE') }, productId, purchaseToken);
    } else return json({ error: 'unknown store' }, 400);
    if (r.error) return json({ error: r.error }, 409);

    const q = await admin.rpc('srv_store_paid', {
      p_user: who.user.id,
      store_: store,
      tx: r.tx,
      cid: r.product.cosmetic ?? null,
      set_: r.product.set ?? null,
      live: r.live,
      w: world,
    });
    if (q.error) throw q.error;
    if (!q.data?.ok) return json({ error: q.data?.error || 'refused' }, 409);
    return json({ ok: true, pieces: q.data.pieces, already: !!q.data.already });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
