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
