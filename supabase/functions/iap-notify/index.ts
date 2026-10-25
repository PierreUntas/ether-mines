// "iap-notify" function: Apple and Google call it (no player token: deployed with --no-verify-jwt) when an
// in-app purchase is refunded. Nothing in the call is trusted as is: the refund is confirmed with Apple's or
// Google's own server (stores.js appleRefund, googleRefund) before the piece is taken back
// (052_store_purchases.sql, srv_store_refunded). Google's push carries ?token=GOOGLE_RTDN_TOKEN, a secret
// of ours, so random calls stop at the door.
//   App Store Connect → App → App Store Server Notifications (v2): .../functions/v1/iap-notify?store=apple
//   Play Console → Monetize → Real-time developer notifications, a Pub/Sub push subscription to
//   .../functions/v1/iap-notify?store=google&token=<GOOGLE_RTDN_TOKEN>
import '../_shared/rules.js';
import '../_shared/stores.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
const Stores = (globalThis as any).AppStores;
const env = (k: string) => Deno.env.get(k) || '';
const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);
  const url = new URL(req.url);
  const store = url.searchParams.get('store');
  try {
    const body = await req.json();
    let tx: string | null = null;
    if (store === 'apple' && env('APPLE_IAP_PRIVATE_KEY')) {
      tx = await Stores.appleRefund({ keyId: env('APPLE_IAP_KEY_ID'), issuerId: env('APPLE_IAP_ISSUER_ID'), privateKey: env('APPLE_IAP_PRIVATE_KEY'), bundleId: env('APPLE_BUNDLE_ID') }, body);
    } else if (store === 'google' && env('GOOGLE_PLAY_SERVICE_ACCOUNT')) {
      if (!env('GOOGLE_RTDN_TOKEN') || url.searchParams.get('token') !== env('GOOGLE_RTDN_TOKEN')) return ok({ error: 'bad token' }, 403);
      tx = await Stores.googleRefund({ account: JSON.parse(env('GOOGLE_PLAY_SERVICE_ACCOUNT')), packageName: env('GOOGLE_PLAY_PACKAGE') }, body);
    } else return ok({ received: true, ignored: true });
    if (!tx) return ok({ received: true, nothing: true });
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const r = await admin.rpc('srv_store_refunded', { store_: store, tx });
    if (r.error) throw r.error;
    return ok({ received: true, result: r.data });
  } catch (e) {
    // a 500 makes the store send it again later
    return ok({ error: String((e as Error)?.message || e) }, 500);
  }
});
