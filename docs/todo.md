# Ether Mines · to do

The road to version 1, roughly in order. Tick what's done, add what comes up. (Pierre's French copy of this
plan, with a calendar, lives outside the repo.)

## Done
- [x] Web game, accounts (nickname + password), game server on Fly.io, wiki built from the game's data
- [x] Unity app (iPhone, Android, Mac, PC) at the web's level
- [x] Shop in three aisles (Store in euros, Workshop in Gwei, Wardrobe), weekly showcase, premium sets, saved outfits
- [x] Stripe on the web (050, 051): Checkout, signed webhook, refunds, test mode tried end to end
- [x] Guard and parry poses from Pierre's sketches

## 1. Finish the game
- [ ] Premium skins redrawn from Pierre's sketches (the 10 Proof-of-Work / Proof-of-Stake pieces are placeholders): at least two full sets for launch
- [ ] The pistol redesigned (proposals A, B, C, or a sketch)
- [ ] Other designs from sketches (mobs, items, buildings)
- [x] Unity: the Objectives, Validators and Trade tabs and the chat laid out as the web's (rounded cards, quest rings, chat bubbles); to check on a device
- [x] `tests/navigateur.mjs`: the "doorway off axis" walk failed on slow machines (more real time)
- [ ] Rebuild and check on iPhone and Android: guard, parry, shop, life bar
- [ ] Play test with real players (web, TestFlight): do they come back the next day, the next week? Fix what they hit

## 2. Production
### Payments
- [x] Apple and Google in-app purchases in the Unity app (Iap.cs, iap-verify, iap-notify, 052): coded and tested against fake stores; to try on real stores once the accounts exist (docs/payments.md)
- [ ] Apple Developer account (99 $/year) and Google Play Console (25 $ once)
- [ ] The products in App Store Connect and Play Console (ids and prices from rules.js)
- [ ] Stripe "Ether Mines" account activated (SIRET, IBAN, statement descriptor ETHER MINES), live key and live webhook in Supabase secrets
- [ ] `PAYMENTS: 'live'` in `src/config.js` on launch day; one real purchase, then refunded
### Legal and accounting
- [x] `legal.html`: terms of sale, payment processors, what's kept with a purchase (still to fill in: SIRET, address, consumer mediator, VAT line)
- [ ] The 14-day withdrawal waiver for digital content in the terms and in the app (Stripe's page already shows it)
- [ ] An accountant: VAT (franchise en base, "TVA non applicable, art. 293 B du CGI"?), thresholds, sales abroad (OSS)
- [ ] Receipts or invoices for Stripe sales
- [ ] Handing purchases back after a season reset (kept with nickname and email; by hand for now)
### App stores
- [ ] The app's identity: id (`org.ethermines.game`), icon, launch screen
- [ ] Store pages: texts, screenshots (iPhone, iPad, Android), a short video
- [ ] Privacy labels, age rating, content questionnaire (player chat)
- [ ] TestFlight, Google Play internal testing, then review
- [ ] Steam (paid Mac and PC version), after the mobile and web launch
### Servers and tools
- [ ] Supabase Pro (no pausing, daily backups)
- [ ] Fly.io: machine size and auto restart of the game server
- [x] GitLab CI minutes ran out: a lighter pipeline (the browser test by hand, tests only when their files change)
- [ ] Error and visit tracking checked
- [ ] Launch reset: new `SEASON`, `reset.sql` then `installation.sql` (purchases are kept)
- [x] A launch-day checklist, step by step (`docs/launch-checklist.md`)

## 3. Getting the word out
- [ ] A 30–60 s trailer (mining, the City, a boss, a parry, the shop)
- [x] A press kit: logo, screenshots, a one-page presentation, contact (`presskit.html`, `press/`)
- [x] The site's home: store links, trailer and Discord shown once their addresses are in `src/config.js`, press kit link
- [ ] The game's accounts: X, Farcaster, Discord
- [ ] Launch posts: r/ethereum, r/indiegaming, Farcaster, X, Product Hunt, itch.io
- [ ] The Ethereum ecosystem: Ethereum Foundation (ESP, the educational side), ETHGlobal, crypto media, Minecraft and crypto creators
- [ ] A "Version 1" entry in What's new
- [ ] After launch: one new premium collection a month, announced through the weekly showcase

## Pending on Pierre's side
- [ ] `fly deploy` of the game server, from `server/` (see `server/README.md`), unless the GitLab `game-server` job already did it
