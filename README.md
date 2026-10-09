# Ether Mines

A block world in Ethereum's colors, built with friends in the browser. You mine, craft, and build, and every block and item behaves like a token: mining mints, placing burns, and every placed block carries its author's name. The world is infinite: the terrain generates as you go.

## What's in it

- **World**: generated from a fixed seed (plains, pink forests, dunes, peaks, lakes, oceans, floating islands between 43 and 57 high, deep caves with pure-ether geodes below layer 20), loaded in 16 × 16-column chunks around each player, 64 blocks tall.
- **Infinite world**: you can walk in any direction up to 100,000 blocks from the center (bounds set by the base rules). Position and distance to the sanctuary show in the top left.
- **Plots**: in chat, `/claim` claims the chunk (16 × 16) you're standing in for 2 crystals (16 at most). Only the owner and their invites (`/invite nickname`, `/kick nickname`) can mine, build, and open doors there. `/unclaim` releases the plot, `/claims` lists them. Green posts (yours) or pink posts (someone else's) mark the corners. The sanctuary is untouchable.
- **Finding each other**: in chat, `/join nickname` teleports near an online friend, `/sanctuary` brings you back to the starting point.
- **Race**: `/race` in chat starts a timer across six glowing beacons arranged around the sanctuary, to touch in order; the start and final time are announced in chat, to compare with friends. Purely for fun, no reward.
- **Nature**: glowing ether mushrooms on cave floors, reeds on the banks, water lilies in shallow water, mossy rocks in plains and dunes. By day, butterflies fly around flowers and petals fall from pink trees; by night, fireflies.
- **Decoration** (Crafting): ether bricks (with slabs and stairs), polished granite, checkered marble, mossy stone, woven reed mat, library, crystal block, pink lantern and mushroom lantern, table and bed. Lanterns, the crystal block, pure ether, and mushrooms light up their surroundings.
- **Eating and sleeping**: right-click (or tap) a table to eat (one meal a day, increased speed for 90 seconds) and a bed to sleep (only at night) and skip straight to dawn. Table and bed are crafted at the workshop; a ready-made room already gathers them at the **refuge**, in the City.
- **Art direction**: the world of ethereum.org's illustrations. Mint, lavender, periwinkle and peach palette, navy ink outline around blocks, pale pink sky by day and orange sunsets. The sanctuary is an **Atrium**: checkered floor, pool, eight columns (the four aisles stay open), a white marble arched glass roof crowned with a diamond block, potted palms, on an open esplanade. The ruins are small temples of broken columns; **Ether Gardens** (marble terrace, fountain, lantern column, hedges, cypresses) dot the plains; lavender-blue cypresses and pink forests mingle.
- **The City**: a district generated 60 blocks north of the sanctuary, under the great diamond, linked to the Atrium by the **validators path** (a paved lane lined with lampposts). Every building has its place: the great Ledger hall under its glass pyramid (a diamond block floats inside), the pedimented temple, the library, the greenhouse, the domed rotunda, the market and its stalls, two colonnaded halls under glass roofs, fountain squares and gardens, the **refuge** (a small room to eat and sleep in), the **workshop** (a working logic-gate latch, free to study and copy). The City sits on a plateau that blends into the terrain. Validator robots and cats in the streets, disc ships overhead, flocks of birds by day.
- **Villagers**: nine characters live in the Atrium, along the path, and in the City (guardian, builder, cartographer, merchant, librarian, gardener, oracle, scribe, traveler). Right-click to talk to them: tips, direction to the nearest ruin, state of the network. The validator robot and the space shiba have their fixed spot in the Atrium.
- **The network, a shared goal**: all players relight the old validators together. The world's counter (`act_network`, `007_network.sql`) shows at the top of the screen and in the Objectives tab, with the five best watchers; at 3, 10, 25, 50, and 100 validators, one more star orbits the great diamond.
- **Trades between players** (`008_trades.sql`): the chest's Trade tab, or `/trade nickname`. An offer says "I give" and "I want": resources, unique pickaxes, plots. Nothing is locked at creation; on acceptance, the server rechecks both sides and moves everything at once (or nothing). A unique item keeps its history as it changes hands. Validator seals can't be traded. 5 pending offers at most per player, valid for 3 days; 16 plots at most after a trade.
- **Seeing yourself**: the V key (or the button at the top of the screen on mobile) switches to a view from behind, then from the front; the chest shows your character, which you can spin and recolor. The place's name shows up when you enter the Atrium, the City, a ruin, a garden, the islands, or the depths.
- **World seed**: `SEED` in `world.js` fixes the whole terrain; `node tools/seeds.mjs` looks for seeds with a pleasant starting area (plains, sea nearby, healthy ground for the City). Changing it requires a database reset.
- **Inspired by ethereum.org's illustrations**: palm trees on beaches and dunes (and at the sanctuary's corners), glowing amethyst clusters in deep caves, cats, space shibas in spacesuits, and validator robots with pointy lavender hats (a robot and a shiba guard the sanctuary), a ring of orange blocks orbiting the great diamond. Crafting, Decoration: marble column, cyan neon, holographic screen, diamond block, studded game bricks (4 colors).
- **Construction**: pastel concrete (8 colors), stained glass (4), slabs, stairs oriented by your facing direction, doors spanning two blocks (right-click to open), fences and panes that connect to their neighbors, ladders (walk or jump into them to climb, crouch to hold still), chests to store items (right-click to open, crouch to place a block against one; inside a plot, only the owner and their invites can open them). You can step up onto slabs and stairs without jumping.
- **Circuits made of blocks**: lever and pressure plate (sources), ether cable, lamp and powered door. The current is recomputed continuously around the player and is never saved: only the levers' state is. A plate activates under any player, including a friend.
- **Logic gates** (Crafting, Circuits): AND (both sides powered), OR (one side or the back), NOT (active as long as the back isn't) and a clock (ticks every second). A gate is placed like a staircase: its output points in the direction you were facing, an arrow marks it on top. They chain together and with cables, enabling code locks, blinkers, or traps.
- **Progression**: a thread of objectives (button at the top of the screen, O key or Objectives tab) and four tool tiers. Your hand can't cut stone; the wooden pickaxe cuts stone and ore; the crystal pickaxe (unique item) opens geodes; the pure ether pickaxe (unique item) cuts the genesis rock, at the bottom of the world, which gives genesis fragments. With a fragment, shards, and crystals, you forge a validator heart.
- **Old validators**: a ruin with a dark validator per 80 × 80-block region (the first about forty meters from the sanctuary). Your objective's compass leads to the nearest one. Relighting it with a heart puts it under your name: one crystal a minute, and a validator seal (unique item) as a keepsake. A validator you place yourself mints a crystal every 5 minutes; 5 at most count per player (`002_security.sql`).
- **Animals**: ether sheep (plains), rabbits (dunes, plains, forests), pink foxes (forests), prism fish (oceans), sky jellyfish (around floating islands). Right-click or short tap to pet them: once a day, a sheep offers ether wool (a block), a fox a flower, a jellyfish a pure shard. They're placed and moved based on the seed and the time: every player sees them in the same spot, with no network traffic.
- **Rendering**: Three.js r128, pixel art textures generated in code, cast shadows (disabled on mobile), an 8-minute day/night cycle, blocks that glow at night, rippling water, fireflies at night, a placement effect, avatars that breathe and sway while walking.
- **Settings** (chest's Settings tab, specific to each device): view distance, sharpness, shadows, fireflies, animals, camera sensitivity, frames-per-second counter.
- **Performance**: chunk meshing (≈ 18 ms per chunk on a server, probably 2 to 4 times slower on a phone) happens in a background worker, without blocking the frame; automatic fallback to in-place computation if the browser doesn't allow it (page opened via `file://`).
- **Fullscreen**: on Android, the game goes fullscreen and landscape when you start playing. On iPhone, Safari doesn't allow this for pages: the title screen offers to add the game to the home screen (Share button → "Add to Home Screen"), from where it opens without bars.
- **Sound**: entirely synthesized in `src/audio.js` (Web Audio, no file): footsteps and hits per material, breaks, placements, circuit clicks, a musical pad, birds by day, crickets by night, drops underground. M key or ♪ button to mute; the choice is kept in the browser (`ether-mines:son`).
- **Multiplayer**: other players appear with their nickname, blocks sync live, a chat (Enter, or its icon next to the chat log) and the list of online players.
- **Tokens (simulated)**: a chest with token sheets (ERC-1155 for resources, ERC-721 for the crystal pickaxe), a workshop, a ledger of mints and burns, a ledger view (T) that highlights your blocks.
- **Validator seal, for real**: a seal can be minted as a real non-transferable ERC-721 on the Sepolia testnet, then attested and rewarded per epoch. See "Web3 layer".

Nothing is recorded on a real blockchain, except for validator seals (optional, testnet, no real value — see "Web3 layer").

## Stack

- Native HTML, CSS, and JavaScript, no framework or build step.
- [Supabase](https://supabase.com): Auth (guest accounts), Realtime (presence, positions, block and claim changes), Postgres (world, chests, rules, arbitration functions), and one Edge Function (`freeze`).
- Static hosting on Vercel.

### The server is authoritative

Players can't write anything directly: no blocks, no terrain, no chest. Every action goes through a SQL `act_*` function that checks the rules then applies the change:

| Action | What the server checks |
| --- | --- |
| `act_mine` | a real block there, tool owned and of sufficient tier, plausible mining rate, zone not protected; draws the loot itself |
| `act_place` | item present in the chest, allowed transform (oriented stairs, door), free cell, correct support, zone not protected |
| `act_toggle` | a real door or lever, zone not protected |
| `act_craft` | recipe known to the server, ingredients present |
| `act_relight` | a real dark validator, validator heart in the chest |
| `act_gift` | once a day per animal, 15 gifts a day at most |
| `act_rewards` | validators signed by the player (5 placed at most: 1 crystal every 5 minutes each; old ones relit: 1 a minute), elapsed time (30 minutes caught up at most) |
| `act_claim`, `act_unclaim`, `act_member` | plots: cost, limit, owner |
| every action on a block | public zones (`006_public_zones.sql`): the Atrium and the City can't be mined, built on, or claimed |
| `act_chest`, `act_chest_move` | chests: a real chest block, within reach, right to build there, items present in the bag or the chest; a broken chest returns its contents to whoever breaks it |

On top of that, every action passes a common check (`supabase/migrations/002_security.sql`):

- **Rate**: each player has a token reserve per action type (mining and placing: 8 per second, doors 4, crafting 4, plots and invites 1 every 2 s, recovery codes 1 every 5 s). Beyond that: "too many actions".
- **Position and reach**: mining, placing, opening, relighting, and claiming send the player's position. The targeted block must be within reach (6.5 blocks from the eyes), you can't place a block inside your own body, and the position must be reachable from the previous one (running speed, with some margin for the network; free falls). Returning to the sanctuary and `/join` (next to an active player) stay allowed. To claim a plot, you need to be standing in it. The game also sends a position ping every 15 s while moving.
- **Chat** (`003_moderation.sql`): every message goes through `act_chat`. The nickname and color come from the save, so it's impossible to speak as someone else. One message per second (bursts of 4), 140 characters, banned words replaced with stars (list in the `chat_banned_words` table, to extend by hand). Messages older than 2 days are deleted.
- **Reports**: `/report nickname`. Three different players within 24 h mute a player for 1 h, then 2 h, 4 h… on each repeat offense. Only players who have already mined or placed a block can report (against throwaway accounts). `/ignore nickname` hides a player in your browser only.
- **Game errors**: JavaScript errors from online players (and unexpected server refusals) land in the `client_errors` table, one row per error with a counter, kept 14 days. See "Monitoring the game" below.

A chunk's original terrain is generated **server-side** by the `freeze` Edge Function, with the same generator as the game (`supabase/functions/_shared/world.js`): no way to make up terrain. The rules (blocks, tools, recipes) come from `supabase/functions/_shared/rules.js`, shared with the game; `node tools/rules.mjs > supabase/rules.sql` turns them into SQL tables.

The game shows the result right away and the server confirms: on refusal, the block reverts and the chest is reread from the server.

```
index.html              page structure
src/style.css           interface
src/config.js           Supabase URL and public key (empty = solo mode)
src/net.js              network layer (Supabase)
src/errors.js           reports players' errors to the server
src/mesh.js             chunk meshing (pure function, shared with the worker)
src/mesh-worker.js      background meshing (Web Worker)
manifest.webmanifest, icons/   installable app (fullscreen)
src/game/               the game, in files loaded in order (shared global scope):
  00-base.js            shared shortcuts, generator, and rules
  01-textures.js        pixel art atlas generated in code
  02-blocks.js          block shapes, access to the loaded world
  03-state.js           game state, saves, seasons
  04-render.js          Three.js scene, chunk meshing, hand, icons
  05-player.js          physics, keyboard/mouse/touch input, aiming
  06-actions.js         mine, place, craft, server arbitration, plots
  07-interface.js       bar, chest, crafting, ledger, objectives
  08-sky.js             day and night
  09-animals.js         animals
  10-loop.js            main loop
  11-multiplayer.js     other players, chat
  12-circuits.js        electrical current (levers, cables, lamps, doors)
  13-chunks.js          loading chunks around the player
  14-startup.js         account, title screen, startup
  15-chain.js           web3 layer (validators, Sepolia)
src/audio.js            generative sounds (Web Audio)
supabase/functions/_shared/world.js   world generator (game and server)
supabase/functions/_shared/rules.js   blocks, items, tiers, recipes (game and server)
supabase/functions/freeze/            Edge Function: generates and freezes a chunk's terrain
supabase/functions/link-wallet/       Edge Function: links a wallet via a signed message (web3 layer)
supabase/functions/chain/             Edge Function: onchain mint/attest/claim (web3 layer)
supabase/migrations/    database schema, act_* arbitration functions
supabase/rules.sql      game rules in SQL (generated by tools/rules.mjs)
supabase/reset.sql      full reset (world, saves, guest accounts)
tools/rules.mjs         generates supabase/rules.sql
contracts/              Seal and Network (Foundry + OpenZeppelin) — see "Web3 layer"
```

## Deploying

1. **Supabase**: create a free project on supabase.com.
2. **Guest accounts**: in *Authentication → Sign In / Providers*, enable *Allow anonymous sign-ins*. Every player gets an account automatically, no email or password.
3. **Database**: in the *SQL Editor*, run `supabase/installation.sql` (every migration in order, then the rules, in a single file generated by `node tools/installation.mjs > supabase/installation.sql`). It replays safely: re-run it whenever a game update touches the database or the rules.
4. **`freeze` function** (once, then on every change to the generator):
   ```
   npx supabase login
   npx supabase functions deploy freeze --project-ref <project id> --use-api
   ```
   Or automatically: add the GitHub secrets `SUPABASE_ACCESS_TOKEN` (supabase.com → *Account → Access Tokens*) and `SUPABASE_PROJECT_REF` to the repo; the `.github/workflows/supabase-functions.yml` workflow redeploys the function on every push that touches it.
5. **Keys**: in *Project Settings → API*, copy the project URL and the public `anon` key into `src/config.js`. This key is meant to be public: the migrations' rules are what protects the database.
6. **Vercel**: import the repo (*Add New → Project*), no special settings needed (static site). Every push to `main` redeploys.
7. **Play**: open the site, pick a nickname. The link contains the world's name (`?monde=principal`); send it to your friends. A different world name gives a separate, blank world.

Without keys in `src/config.js`, the game runs solo and saves in the browser.

To wipe everything and start over:
1. run `supabase/reset.sql`, then `supabase/installation.sql`;
2. bump `SEASON` in `src/game/03-state.js` and publish: saves kept in browsers are cleared on the next load (nickname and sound setting kept).

## What's saved where

| Data | Where |
| --- | --- |
| Original terrain of touched chunks | Supabase, `chunks` table (generated and written by the `freeze` function, never modified) |
| Modified blocks (x, y, z), author, and serial number | Supabase, `blocks` table (written by the `act_*` functions) |
| Plots | Supabase, `claims` table |
| Chest | Supabase, `inventory` table (read-only for the player) |
| Unique items (pickaxes, seals) | Supabase, `uniques` table (read-only for the player) |
| Game rules | Supabase, `rule_*` tables (from `rules.sql`) |
| Game preferences: bar, position, seen objectives, ledger | Supabase, `players` table, `state` column (the only part the player can modify); a copy in the browser (`ether-mines:<world>`) |
| Positions, chat, presence | Supabase Realtime (nothing is kept) |
| Guest account | Supabase Auth; the session is kept by the browser (`ether-mines:session`) |
| Recovery codes | Supabase, `recovery` table (SHA-256 hash only, never the code) |
| Nickname, color, id | Browser (`ether-mines:profil`) |
| Sound on or off | Browser (`ether-mines:son`) |
| Current in cables, lamps, and doors | Nowhere: recomputed from the levers and plates |

## Evolving the game without losing saves

A player's world is three layers stacked on top of each other:

1. **The generator** (`genChunk()` in `supabase/functions/_shared/world.js`), which draws a chunk from the seed and its coordinates.
2. **Frozen chunks** (`chunks` table): as soon as a block is modified in a chunk, its original terrain is recorded as is. It never depends on the generator again.
3. **Modifications** (`blocks` table), in x, y, z coordinates, layered on top.

When a chunk loads: frozen terrain if it exists, otherwise the generator; then modifications. Built areas never move, and untouched areas benefit from the latest generator, like Minecraft chunks.

### What you can change freely

- **The generator** (terrain, biomes, trees, caves, ores): bump `GEN` on every terrain change, then redeploy the `freeze` function (automatic with the GitHub workflow). Only never-touched chunks change. A seam can appear between a frozen chunk and a regenerated one (a small step, half a tree).
- New blocks, items, recipes (in `rules.js`): re-run `node tools/rules.mjs > supabase/rules.sql` then execute `rules.sql` in Supabase, otherwise the server will refuse the new content.
- Mechanics, interface, rendering.

### What you must never do

- **Renumber or remove a block type** (the numbers in `B` and `ITEM`): only add to them.
- **Move the origin** or the spawn point (`SPAWN`): recorded coordinates depend on it.
- **Change the chunk size** (`CH = 16`) or the height (`SY`) without converting the `chunks` table.
- **Rewrite or delete rows** of `chunks` or `blocks` in a migration.
- **Rename the `localStorage` keys** (`ether-mines:<world>`, `ether-mines:profil`).
- Give a block a number already taken by an item (`ITEM`, e.g. 101 to 105, 201 to 203): the game and server would confuse them. A test checks this.

### Making an update

1. **Database**: if the database changes, add `supabase/migrations/00N_description.sql`, additive only (new tables, new columns with a default value). Export tables to CSV from the *Table Editor* before a big migration.
2. **Local save**: if the shape of the `S` state changes, bump `SAVE_V` and add a step in `migrateSave()`. New fields can simply be added to `S0()`.
3. **Test**: push to a branch. Vercel gives a preview URL, to test on a throwaway world (`?monde=test`). The database is the same as production: never test on `principal`.
4. **Publish**: run the SQL migration if there is one, then merge into `main`. Players already connected need to reload the page.

## Accounts and recovery codes

- On first visit, the game creates a guest account and saves progress to it every 5 seconds, on pause, and when leaving the page.
- On the title screen, *Account → Show my recovery code* gives a code like `4FC0-B18D-A98D-75EF`. On another device (or after clearing the browser), entering it in *Recover my progress* attaches the save and the signed blocks to this new device.
- The code attaches everything the old account owns: saves, chests, unique items, signed blocks, plots.

## Testing

Tests run automatically on GitHub on every push (*Actions* tab, *Tests* workflow). A push that breaks something shows up in red.

- **Generator and rules** (no database): `node --test tests/*.test.mjs`. Checks that the world is deterministic, chunk encoding, the sanctuary and the first ruin, recipe consistency, and that `supabase/rules.sql` is up to date with `rules.js`.
- **Schema and arbitration**: `PGHOST=… PGUSER=postgres tests/sql/run.sh` on an empty Postgres 16 (a `mines_test` database is recreated). Installs every migration twice, the rules, chunks generated by the real generator, then plays about forty scenarios: server terrain reading identical to the generator, mining, tool tiers, rate limits, placing, doors, crafting, plots, invites, ruins, gifts, rewards, save recovery, rate limits, reach, impossible moves, and every attempt at direct cheating (writing a block, giving yourself items, making up terrain…). Finally checks that `reset.sql` wipes everything.
- **Formatting**: `npx prettier@3 --write "src/game/*.js" "src/*.js" "supabase/functions/_shared/*.js"` (checked by the tests).
- **Browser playthrough** (solo mode, Chromium): `npm i --no-save playwright@1.56.0 three@0.128.0 && npx playwright install chromium && node tests/navigateur.mjs`.
- **By hand**: opening `index.html#debug` exposes `window.mines` in the console (including `serverAct(name, args)`, `syncInventory()`, `get(x, y, z)`, `P` the player, `S.day` the time).

## Web3 layer (validators, Sepolia)

An optional V1 web3 layer that only covers validators — not plots, not pickaxes, not
resources. **The game stays free to play, with just a nickname, no wallet needed.** The blockchain
is only a public, verifiable mirror of a fact that already exists in the database: "this player relit
this validator." This isn't play-to-earn: nothing has real value (Sepolia is a testnet), nothing
is for sale, and there is no way to convert anything into real money.

```
Player (nickname, no wallet)
   │ relights an old validator — an unchanged game action, still arbitrated by the database
   ▼
Supabase database (uniques, item 203: world, x, y, z, date)
   │ the player clicks "Mint," "Attest," or "Claim"
   ▼
Edge Functions link-wallet / chain — operator key, Supabase secret, never in the repo
   │ transaction simulated then sent, gas paid by the operator, never by the player
   ▼
Seal (ERC-721 / ERC-5192) and Network — Sepolia
```

### The two contracts (`contracts/`, Foundry + OpenZeppelin)

- **`Seal`**: non-transferable ERC-721 (ERC-5192). One seal per validator, never two: its id
  (`tokenId`) is computed by the contract itself from `(world, x, y, z)`, never supplied from the outside.
  Metadata and image generated entirely onchain (`tokenURI`, no external link). `mint()` is reserved
  to the operator role.
- **`Network`**: one-day epochs. `attester()` records a seal's participation in the current
  epoch; once it closes, its attestant count (`n`) is frozen forever. The reward per seal follows
  the same shape as Ethereum's issuance curve: an epoch's total issuance ∝ √n, so 1/√n per
  seal. `reclamer()` pays out **real Sepolia ETH**, drawn from the contract's balance — refilled by
  hand (see below), never deposited by a player. `attester()` and `reclamer()` are also reserved to the
  operator role; the payout always goes to the seal's actual holder, never to whoever sends the transaction.

Addresses on Sepolia:

- Seal: `0x73215D0e62E16a64A0110889867Cd7EF460F1D4B` — [Etherscan](https://sepolia.etherscan.io/address/0x73215D0e62E16a64A0110889867Cd7EF460F1D4B)
- Network: `0xE70104D3786c2DE304E0635d27BD8c3e4De48e23` — [Etherscan](https://sepolia.etherscan.io/address/0xE70104D3786c2DE304E0635d27BD8c3e4De48e23)

### Mapping to real Ethereum

| Ether Mines | Real Ethereum |
| --- | --- |
| Relighting an old validator, in-game | Depositing 32 ETH into the official deposit contract |
| Seal (non-transferable ERC-721) | Active validator status |
| `attester()` once per epoch | Validity attestation every slot (~12 s), by committee |
| One-day epoch | Real epoch of about 6.4 minutes (32 slots) |
| An epoch's issuance ∝ √n | Annual issuance ∝ √(total ETH staked) |
| `reclamer()` on demand | Withdrawing accumulated rewards |
| `Network`'s balance refilled by hand | New ETH issuance by the protocol |

### What's simplified

- **No slashing**: a missed epoch simply isn't paid, there's no penalty beyond that.
- **One-day epoch**, much longer than the real ~6.4 minutes — easier to explain, but
  slower to observe in a demo (expect to wait between two epochs, or reduce `EPOCH_DURATION`
  for a demo).
- **No activation queue**: a seal participates starting the current epoch, whereas a real deposit
  sometimes waits months before becoming an active validator.
- **Reward funded by hand**, not a real protocol issuance: on a testnet, no one
  issues new ETH; `Network`'s balance comes from public faucets, refilled manually.
- **`attester()` is just a record**: no cryptographic verification of a block or a committee,
  just "this seal is participating in this epoch."

### Technical choices and limits

- **No custody**: no contract ever holds a token on a player's behalf, nor any real
  deposit. This eliminates the whole class of risks around deposit/withdrawal contracts (the most
  frequently hacked part of real Ethereum), at the cost of not being able to simulate real staking with capital at risk.
- **No two-way sync**: an in-game trade never moves the onchain token; since the
  seal is non-transferable (ERC-5192), the question doesn't even arise the other way. The blockchain
  stays a mirror, never the engine of the game.
- **Everything goes through the operator** (`mint`, `attester`, `reclamer` reserved to `OPERATOR_ROLE`): the player
  never pays gas, but the game depends on the Edge Function's availability for these three actions — a
  deliberate tradeoff, not an oversight.
- **Low-privilege operator key**: it can only call these three specific functions. It can neither
  change roles, nor withdraw `Network`'s balance, nor touch `Seal` or `Network` any other way. A separate
  admin key (`DEFAULT_ADMIN_ROLE`), used once at deployment then kept offline,
  is the only one that can change that.
- **Deliberately narrow scope**, limited to validators: plots and pickaxes were left out.
  Tokenizing them would have required either custody (the contract holds the token until the player has a
  wallet) or two-way sync between the game and the chain — both paths explored then
  dropped, for added risk that far outweighed the real benefit.

### Getting started

1. **A Sepolia wallet to deploy** (`DEPLOYER_PRIVATE_KEY`), with a bit of Sepolia ETH (public faucet).
   It becomes the admin of both contracts — keep it offline after deployment.
2. **An address for the operator** (`OPERATOR_ADDRESS`, just the address, not its private key). Its private key
   becomes the Supabase secret `OPERATOR_PRIVATE_KEY` for the `chain` function — never used to deploy.
3. **A Sepolia RPC endpoint** (Alchemy, Infura, or a public one like
   `https://ethereum-sepolia-rpc.publicnode.com`).
4. **An Etherscan key** (for automatic source verification).
5. **Deploy and verify**:
   ```
   cd contracts
   forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-git --no-commit
   DEPLOYER_PRIVATE_KEY=0x… OPERATOR_ADDRESS=0x… \
     forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast \
       --verify --etherscan-api-key $ETHERSCAN_API_KEY
   ```
   `lib/` isn't checked in (see `contracts/.gitignore`): the first line rebuilds it identically.
6. **Report the two displayed addresses**: in `src/config.js` (`SEAL_ADDRESS`, `NETWORK_ADDRESS`,
   `SEPOLIA_RPC_URL` — a public, read-only endpoint, never a private key) and in the Supabase secrets
   for the `link-wallet`/`chain` functions (`supabase secrets set SEAL_ADDRESS=… NETWORK_ADDRESS=…
   SEPOLIA_RPC_URL=… OPERATOR_PRIVATE_KEY=…`).
7. **Run the migration**: `supabase/installation.sql` (already up to date) in the SQL Editor.
8. **Two balances to refill now and then, from public Sepolia faucets — not for the same purpose**:
   - **The operator address itself**: it's the one sending the transactions (`mint`, `attester`,
     `reclamer`), so it pays their gas out of its own pocket. A simple transfer to `OPERATOR_ADDRESS` is enough
     (from a wallet, or `cast send $OPERATOR_ADDRESS --value 0.02ether --rpc-url $SEPOLIA_RPC_URL --private-key 0x…`).
     Without this, the `chain` function fails on the very first transaction.
   - **The `Network` contract**: its balance is what pays the *rewards* given to players (distinct from
     the gas above):
     ```
     cast send $NETWORK_ADDRESS --value 0.05ether --rpc-url $SEPOLIA_RPC_URL --private-key 0x…
     ```
   In both cases, an insufficient balance simply makes the action fail cleanly (nothing is lost,
   no one is stuck): retry after refilling.
9. **If automatic verification fails**, retry it by hand, for example for `Seal`:
   ```
   forge verify-contract <seal_address> src/Seal.sol:Seal --chain sepolia \
     --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address)" <admin>)
   ```

### Testing the contracts

`cd contracts && forge test` — 40 tests, including fuzzing (256 runs per property) on computing
a seal's id, extreme coordinates, and `Network`'s reward curve (no one
receives more than their share, the amount paid out never exceeds the planned issuance, no way to bypass
an epoch's closing). Also run on GitHub on every push (*Tests* workflow, *contracts* job).

## Known limits

- The server checks that reported positions are plausible, not fine-grained physics: a cheater can walk through a wall or fly at running speed. They can't mine from a distance, teleport, or act faster than a human.
- Objectives are tracked in the browser; they give no reward, so there's nothing to gain by cheating on them.
- Animals and gifts aren't checked one by one (the server caps gifts at 15 a day).
- Chat moderation is automatic and simple: no human moderator, and the filter only sees whole words (leetspeak slips through). Several players can share the same nickname; `/report` targets the most recent one.
- The web3 layer ("Web3 layer") only covers validator seals, not pickaxes or plots — a scope choice, not a technical limit: see "Technical choices and limits" below.
- Supabase free tier: the project pauses after a week of inactivity, 2 million realtime messages a month (positions are capped at 5 sends per second per player, only while moving).

## Monitoring the game

In Supabase → *SQL Editor*:

```sql
-- errors from the last 24 h, most frequent first
select msg, sum(n) as times, count(distinct user_id) as players, max(at) as last_seen
from client_errors where at > now() - interval '1 day' group by msg order by times desc;

-- mute a player by hand, or give them back their voice
update players set muted_until = now() + interval '1 day' where world = 'principal' and name = 'Nickname';
update players set muted_until = null where world = 'principal' and name = 'Nickname';

-- add a word to the chat filter (lowercase, no accents)
insert into chat_banned_words values ('word') on conflict do nothing;
```

## Commands

- WASD or arrows: walk · Shift: run · Space: jump
- Hold left click: mine · right click: place
- Right-click a door or lever: activate it
- 1 to 9, scroll: item bar · E: chest and crafting · T: ledger view · M: sound · Enter: chat (`/join nickname`, `/sanctuary`, `/claim`, `/unclaim`, `/invite nickname`, `/kick nickname`, `/claims`, `/ignore nickname`, `/listen nickname`, `/report nickname`)
- Mobile (Minecraft mobile layout): stick on the left to walk, drag to look around, long press to mine, short tap to place or activate; on the right, jump (↑), run (», stays active until you stop) and crouch (↓: slower, won't fall off edges, goes down into water); at the top, chest, chat, and menu; "…" at the end of the bar opens the chest
- Keyboard: C or Ctrl to crouch
