# Premium payments (Stripe)

The premium pieces (`rules.js` COSMETICS, category `premium`, `eur` in cents) are sold for euros through
Stripe Checkout. Nothing about money ever goes through the game's client: it only asks the `checkout` Edge
Function for a payment page, and the piece is granted when Stripe's signed webhook says it was paid.

## How it fits together
1. Shop → **Buy** → `Net.buyPremium` → Edge Function `checkout` (player token required).
   It checks the piece and the account (`srv_premium_quote`: premium, not owned, nickname with a password),
   opens a Stripe Checkout session, and records it as `pending` (`srv_premium_pending`).
2. The player pays on Stripe's page, then comes back to `?monde=<world>&shop=paid` (or `shop=cancel`).
3. Stripe calls `stripe-webhook` (signed with `STRIPE_WEBHOOK_SECRET`): `checkout.session.completed` →
   `srv_premium_paid` (amount checked, safe to receive twice); `charge.refunded` (full refund) or a lost
   dispute → `srv_premium_refunded`, which takes the piece back.
4. The game reads `act_premium_owned(world)`: the account's paid pieces, in every world.

Purchases live in `billing.purchases` (050_purchases.sql), which `reset.sql` keeps: real money is never wiped
with a season. Each row keeps the nickname and the buyer's email.

## Test mode, then live
- `CONFIG.PAYMENTS` in `src/config.js`: `'test'` opens the Buy button in test worlds only (never
  `principal`), `'live'` everywhere, `''` nowhere. The server agrees: a test key can't sell in `principal`, and
  test purchases never count there.
- Test card: 4242 4242 4242 4242, any future date, any CVC.

## Setup (once, by Pierre)
1. Stripe dashboard, in **test mode**: Developers → API keys → copy the secret key (`sk_test_…`).
2. Developers → Webhooks → Add endpoint:
   `https://euytymfcncakzqzdynbq.supabase.co/functions/v1/stripe-webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`,
   `charge.dispute.closed`. Copy its signing secret (`whsec_…`).
3. Supabase → Edge Functions → Secrets: add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
   **Never in the repo.**
4. Run `supabase/installation.sql`. The functions deploy from GitLab CI when pushed to `main`.

Going live: the same steps with the live keys (`sk_live_…`, a live webhook), then `PAYMENTS: 'live'`.

# In-app purchases (App Store, Google Play)

In the Unity app the same premium pieces and sets are sold by the stores (`unity/Assets/Scripts/Game/Iap.cs`,
Unity IAP). The app never grants anything itself: each purchase goes to the `iap-verify` Edge Function, which
asks Apple's or Google's own server whether it is real, ours and not refunded, and records it in
`billing.purchases` (052_store_purchases.sql) beside Stripe's. Only then does the app finish the purchase with
the store. Refunds come back through `iap-notify`, which confirms them with the store before taking anything
back. In the apps a set is sold whole, at its full price, to whoever owns none of its pieces.

## The products (non-consumable), ids from `rules.js` (STORE_PREFIX)
The list follows the catalog: `node -e` on `AppStores.products()` (supabase/functions/_shared/stores.js)
prints it again after a change.

| Product id | Name | Price |
|---|---|---|
| `org.ethermines.game.piece.107` | Forge Rig | 4,99 € |
| `org.ethermines.game.piece.108` | Hashrate Helm | 2,99 € |
| `org.ethermines.game.piece.109` | Ember Wings | 4,99 € |
| `org.ethermines.game.piece.110` | Forge Sparks | 1,99 € |
| `org.ethermines.game.piece.111` | Forge Blade Trim | 2,99 € |
| `org.ethermines.game.piece.112` | Validator Robe | 4,99 € |
| `org.ethermines.game.piece.113` | Staking Halo | 2,99 € |
| `org.ethermines.game.piece.114` | Beacon Wings | 4,99 € |
| `org.ethermines.game.piece.115` | Stake Light | 1,99 € |
| `org.ethermines.game.piece.116` | Stake Blade Trim | 2,99 € |
| `org.ethermines.game.set.pow` | Proof-of-Work set | 12,99 € |
| `org.ethermines.game.set.pos` | Proof-of-Stake set | 12,99 € |

## Apple (once)
1. App Store Connect → Business: sign the Paid Apps agreement, add the bank account and the tax forms.
2. The app (bundle id `org.ethermines.game`) → In-App Purchases: one **Non-Consumable** per row above.
3. Users and Access → Integrations → In-App Purchase: generate a key. Note its Key ID and the Issuer ID, and
   download the `.p8` (only once).
4. Supabase → Edge Functions → Secrets: `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`
   (the whole text of the .p8), `APPLE_BUNDLE_ID` = `org.ethermines.game`. **Never in the repo.**
5. The app → App Information → App Store Server Notifications, version 2, production and sandbox:
   `https://euytymfcncakzqzdynbq.supabase.co/functions/v1/iap-notify?store=apple`
6. Test with a Sandbox account (Users and Access → Sandbox) on a TestFlight build, in a test world.

## Google (once)
1. Play Console → Setup → Payments profile (the merchant account).
2. The app (package `org.ethermines.game`) → Monetize → Products → In-app products: one per row above.
3. Google Cloud: a service account, its JSON key; Play Console → Users and permissions: invite it with
   "View financial data" and "Manage orders".
4. Supabase secrets: `GOOGLE_PLAY_SERVICE_ACCOUNT` (the whole JSON), `GOOGLE_PLAY_PACKAGE` = `org.ethermines.game`,
   `GOOGLE_RTDN_TOKEN` (a long random word of your own).
5. Refunds: Monetize → Monetization setup → Real-time developer notifications: a Pub/Sub topic, with a push
   subscription to `https://euytymfcncakzqzdynbq.supabase.co/functions/v1/iap-notify?store=google&token=<GOOGLE_RTDN_TOKEN>`
6. Test with License testers (Setup → License testing) on an internal testing build, in a test world.

## Deploying
The functions deploy from GitLab CI with the others; by hand:
```
npx supabase@2 functions deploy iap-verify --project-ref euytymfcncakzqzdynbq --use-api
npx supabase@2 functions deploy iap-notify --no-verify-jwt --project-ref euytymfcncakzqzdynbq --use-api
```
