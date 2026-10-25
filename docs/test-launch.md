# Test launch: every platform, real players, now

The goal of the next weeks is one number: **do players come back?** The game counts it
(`053_play_days.sql`): read it in Supabase's SQL Editor whenever you like.

```sql
select * from public.retention_summary;          -- by platform: players, % back the next day (D1), % back a week later (D7)
select * from public.retention order by first_day desc;   -- the same, day by day
```

Common markers for a free game: around 30–40% D1 and 10–15% D7 is a good start. Far below: fix what players
hit before spending on promotion. Payments stay in test mode (`PAYMENTS: 'test'`) during the test: the shop
works with Gwei; the euro pieces show their price but can't be bought in `principal` yet.

## The platforms, fastest first

| Platform | How players get it | Cost | Delay |
|---|---|---|---|
| Web (computer and phone) | ethermines.org, already live | 0 | now |
| itch.io | the existing page: a link to the web game, the Mac and Windows downloads | 0 | today |
| Android | Google Play, internal testing (up to 100 testers by email), then closed testing | 25 $ once | a day or two |
| iPhone / iPad | TestFlight (up to 10 000 testers by a public link) | 99 $ a year | 1–2 days (first review) |
| Mac, Windows | itch.io downloads now; Steam later (100 $ a game, a review) | 0 | today |

**Google Play's rule for new personal accounts**: before the public release, a closed test with at least
12 testers who stay opted in for 14 days in a row. Start the closed test as soon as the account exists: the
14 days run while the rest of the test goes on.

## The builds (Unity, menu Ether Mines)

1. **Ether Mines → Prepare player settings** once per build: name, id `org.ethermines.game`, version, icon,
   landscape, IL2CPP. It replaces the project's leftover "unity" / "DefaultCompany".
2. **Android**: create an upload key once, kept outside the repo and backed up (lose it and you can't update
   the app):
   `keytool -genkey -v -keystore ~/ethermines-upload.jks -alias ethermines -keyalg RSA -keysize 2048 -validity 10000`
   then, in the terminal that starts Unity: `export ETHERMINES_KEYSTORE=~/ethermines-upload.jks ETHERMINES_KEYSTORE_PASS=… ETHERMINES_KEY_ALIAS=ethermines ETHERMINES_KEY_PASS=…`
   and **Build → Android (Google Play .aab)**. Upload `Builds/Android/EtherMines.aab` to Play Console →
   Testing → Internal testing → Create release. Add the testers' Gmail addresses, send them the opt-in link.
3. **iPhone**: **Build → iPhone (Xcode project)**, open `Builds/iOS/Unity-iPhone.xcodeproj`, pick your team
   (Signing & Capabilities), Product → Archive → Distribute App → App Store Connect → Upload. In App Store
   Connect → TestFlight: answer the export question (standard encryption only: HTTPS), add an external group,
   turn on the public link once the beta review passes.
4. **Mac**: **Build → Mac**, zip `Builds/Mac/Ether Mines.app`. Without the Apple account it isn't notarized:
   players right-click → Open the first time (say so on the itch.io page). With the account, notarize it
   (`xcrun notarytool`) and the warning goes.
5. **Windows**: **Build → Windows** (needs Unity's "Windows Build Support (Mono)" module from Unity Hub), zip
   the `Builds/Windows` folder. Windows may show "unknown publisher": More info → Run anyway.
6. On itch.io: Edit game → Uploads: the two zips, marked macOS and Windows; keep the "Play in browser" link
   to ethermines.org/play.html.

## The store pages

**Name**: Ether Mines · **Subtitle** (Apple, 30 characters): Build together, play anywhere
**Category**: Games → Adventure (secondary: Simulation) · **Age rating**: 12+ (players chat; there is a word
filter, ignore and report) · **Price**: free, in-app purchases (cosmetics only)
**Privacy** (App Store "nutrition label", Play "Data safety"): collected and linked to the player: a nickname,
gameplay (the world, the inventory, the position), purchases; an email only if they give one for a purchase.
Not used for tracking, not sold, no ads. Policy: https://ethermines.org/legal.html

**Short description** (Play, 80 characters):
EN: A block world in Ethereum's colors. Mine, build and play with friends anywhere.
FR : Un monde de blocs aux couleurs d'Ethereum. Mine, construis, joue avec tes amis.

**Description**:

EN
> Ether Mines is a block world built with friends, in Ethereum's colors. Mine crystals, craft blades and
> plating, raise your validators, and build a city that remembers who placed every block.
>
> - One world for everyone: play on the web, your phone, your tablet or your computer, together, in real time.
> - Mine, craft, build: tools, gear, furniture, circuits with plates, gates and doors.
> - Fight: parry, combos, bosses at the top of the towers and in the depths.
> - Your validators earn Gwei while you play; spend it in the Workshop.
> - Dress your character: outfits, helmets, gauntlets, emotes.
>
> Free to play. The shop only sells looks: nothing that makes you stronger.

FR
> Ether Mines est un monde de blocs à construire entre amis, aux couleurs d'Ethereum. Mine des cristaux,
> forge des lames et des plastrons, fais tourner tes validateurs et bâtis une cité qui se souvient de qui a
> posé chaque bloc.
>
> - Un seul monde pour tous : sur le web, ton téléphone, ta tablette ou ton ordinateur, ensemble, en direct.
> - Mine, fabrique, construis : outils, équipement, meubles, circuits avec plaques, portes logiques et portes.
> - Combats : parades, combos, boss au sommet des tours et dans les profondeurs.
> - Tes validateurs gagnent des Gwei pendant que tu joues ; dépense-les à l'Atelier.
> - Habille ton personnage : tenues, casques, gants, émotes.
>
> Gratuit. La boutique ne vend que de l'apparence : rien qui rende plus fort.

**Keywords** (Apple, 100 characters): blocks,sandbox,crafting,multiplayer,ethereum,mining,building,cross-play,voxel,adventure

**Screenshots**: `press/` has five (the City, the characters, a tower, night, the shop). The stores also want
sizes per device: iPhone 6.7" (1290 × 2796, landscape 2796 × 1290), iPad 13" (2064 × 2752), Android phone
(at least 1080 px on the short side). Take them in the Unity editor's Game view at those sizes.

## The message to find testers

EN (Farcaster, r/ethereum, Discords, X)
> I made Ether Mines: a block world in Ethereum's colors where you run validators, mine crystals and build
> with friends, on the web, iPhone, Android, Mac and PC, all in the same world. It's free and I'm looking for
> 50 players to try it this week and tell me what they think. Play in the browser: https://ethermines.org ·
> iPhone (TestFlight) and Android: reply and I'll send you the link.

FR (amis, Discords francophones, LinkedIn)
> J'ai créé Ether Mines : un monde de blocs aux couleurs d'Ethereum où l'on fait tourner des validateurs, mine
> des cristaux et construit entre amis, sur le web, iPhone, Android, Mac et PC, tous dans le même monde. C'est
> gratuit et je cherche 50 joueurs pour le tester cette semaine et me dire ce qu'ils en pensent. Dans le
> navigateur : https://ethermines.org · iPhone (TestFlight) et Android : réponds-moi et je t'envoie le lien.

## After a week
Read `retention_summary`, the errors (`select * from client_errors order by at desc limit 50;`) and what
players said. Fix the three biggest problems, then decide (docs/todo.md): payments live and the public
release, or another round of testing.
