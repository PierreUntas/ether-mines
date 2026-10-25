# Launch day, step by step

The order matters: payments open last, once everything under them is in place. Each step says how to check it.

## The week before
- [ ] Supabase on the Pro plan (Organization → Billing); a backup taken by hand (Database → Backups)
- [ ] Stripe "Ether Mines" account activated; `legal.html` completed (SIRET, address, consumer mediator, VAT
      line from the accountant: see the HTML comments in the page)
- [ ] The Unity builds approved: App Store (TestFlight build promoted) and Google Play (production track ready,
      not yet released)
- [ ] Apple and Google products "Ready to Submit" / active, prices checked against `docs/payments.md`
- [ ] Store secrets in Supabase: `APPLE_IAP_*`, `APPLE_BUNDLE_ID`, `GOOGLE_PLAY_*`, `GOOGLE_RTDN_TOKEN`
- [ ] A test purchase in a test world on each: web (Stripe test card), iPhone (sandbox), Android (license tester);
      each one refunded, and the piece gone
- [ ] What's new: the "Version 1" entry written (not pushed yet)
- [ ] The posts and the trailer ready to publish

## The day
1. **Announce a short pause** in the game's chat and on the accounts (the reset takes the world down a few minutes).
2. **Reset**: bump `SEASON` in `src/game/03-state.js`, then in Supabase's SQL Editor run `supabase/reset.sql`,
   then `supabase/installation.sql`. Check: `select count(*) from billing.purchases;` still counts the
   purchases (the reset keeps them); `select count(*) from rule_blocks;` is over 100.
3. **Stripe live**: Developers → API keys (live) → `STRIPE_SECRET_KEY` = `sk_live_…`; a live webhook to
   `…/functions/v1/stripe-webhook` with the same four events → `STRIPE_WEBHOOK_SECRET` = its `whsec_…`.
4. **The site**: `PAYMENTS: 'live'` in `src/config.js`, the "Version 1" news, `node tools/wiki.mjs > wiki.html`,
   `node unity/tools/export-news.mjs`; commit, `git push`. Vercel deploys it.
5. **The functions**, if GitLab CI didn't (no minutes left): the `npx supabase@2 functions deploy …` lines in
   `docs/payments.md` (checkout, stripe-webhook, iap-verify, iap-notify; freeze if the generator changed).
6. **The game server**: `fly deploy` from `server/` (the command in `server/README.md`) if it changed.
7. **Check, in `principal`**: enter, play a minute, open the shop: the Buy buttons show real prices. One real
   purchase at 1,99 €, then refund it from Stripe: the piece comes, then goes.
8. **Release the apps**: App Store (release the approved version), Google Play (roll out production).
9. **Publish**: the trailer and the posts (r/ethereum, r/indiegaming, Farcaster, X, Product Hunt, itch.io),
   the messages to the Ethereum ecosystem.

## The days after
- Watch the errors (Supabase → the `client_errors` table), Stripe's webhook deliveries (all 200), the game
  server's logs (`fly logs`).
- Answer contact@ethermines.org within a day: missing pieces, refunds, lost passwords.
- Note what players say, for the first update.
