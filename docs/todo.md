# Ether Mines · to do

What's planned, roughly in order. Tick what's done, add what comes up.

## Selling the game
- [ ] Business model: free on the web and on phones, paid on Steam for computers, paid skins everywhere (one account: a skin bought anywhere is worn everywhere)
- [ ] Real payments for the shop's skins: Apple and Google in-app purchases in the Unity app (required there), Stripe on the web; every skin bought on the web also buyable in the app (Apple's rule)
- [ ] Keep real money and the game apart: skins are cosmetic only; Gwei are earned by playing, never bought or sold
- [ ] Test with real players first (TestFlight, the web version): do they come back the next day, the next week?
- [ ] Apple Developer account (99 $/year) for TestFlight and the App Store; Google Play Console account (25 $ once)
- [ ] The app's real identity before the stores: id (`org.ethermines.game`), icon, launch screen, store pages and screenshots, privacy policy, age rating
- [ ] Look into Ethereum ecosystem grants (an educational game about the ledger, validators, tokens)

## Unity interface
- [ ] The Objectives, Validators, Shop and Trade tabs and the chat box laid out as the web's (they have the new fonts and buttons, not yet the web's layout)

## Pending on Pierre's side
- [ ] `fly deploy` of the game server, from `server/` (see `server/README.md`), unless the GitLab `game-server` job already did it
