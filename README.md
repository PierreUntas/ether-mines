# Ether Mines

**Play: [ethermines.org](https://ethermines.org)** — free, in the browser, no download.

A block world in Ethereum's colors, built with friends in the browser. You mine, craft, and build, and every block and item behaves like a token: mining mints, placing burns, and every placed block carries its author's name. The world is infinite: the terrain generates as you go.

## What's in it

- **World**: generated from a fixed seed (plains, pink forests, dunes, peaks, lakes, oceans, floating islands between 43 and 57 high, deep caves with pure-ether geodes below layer 20), loaded in 16 × 16-column chunks around each player, 64 blocks tall.
- **Infinite world**: you can walk in any direction up to 100,000 blocks from the center (bounds set by the base rules). Position and distance to the sanctuary show in the top left.
- **Plots**: in chat, `/claim` claims the chunk (16 × 16) you're standing in for 2 crystals (16 at most). Only the owner and their invites (`/invite nickname`, `/kick nickname`) can mine, build, and open doors there. `/unclaim` releases the plot, `/claims` lists them. Green posts (yours) or pink posts (someone else's) mark the corners. The sanctuary is untouchable.
- **Finding each other**: in chat, `/join nickname` teleports near an online friend, `/sanctuary` brings you back to the starting point.
- **Nature**: glowing ether mushrooms on cave floors, reeds on the banks, water lilies in shallow water, mossy rocks in plains and dunes. By day, butterflies fly around flowers and petals fall from pink trees; by night, fireflies.
- **Decoration** (Crafting): ether bricks (with slabs and stairs), polished granite, checkered marble, mossy stone, woven reed mat, library, crystal block, pink lantern and mushroom lantern, table and bed. Lanterns, the crystal block, pure ether, and mushrooms light up their surroundings.
- **Eating and sleeping**: right-click (or tap) a table to eat (one meal a day, increased speed for 90 seconds) and a bed to sleep (only at night): solo it skips straight to dawn; online it gives back all your hearts, and the night goes on, because every player of a world shares one clock. Either way, that bed becomes your home (Home Beacon). Table and bed are crafted at the workshop; a ready-made room already gathers them at the **refuge**, in the City.
- **Art direction**: the world of ethereum.org's illustrations. Mint, lavender, periwinkle and peach palette, navy ink outline around blocks, pale pink sky by day and orange sunsets. The sanctuary is an **Atrium**: checkered floor, pool, eight columns (the four aisles stay open), a white marble arched glass roof crowned with a diamond block, potted palms, on an open esplanade. The ruins are small temples of broken columns; **Ether Gardens** (marble terrace, fountain, lantern column, hedges, cypresses) dot the plains; lavender-blue cypresses and pink forests mingle. The **Circuits Complex**, its own standalone landmark east of the sanctuary, holds five separate walled rooms off a central corridor, one working example per gate-based objective (light a lamp, a two-key door, a self-oscillating blinker, a latch that remembers, a coin flip), free to study and copy.
- **The City**: a district generated 60 blocks north of the sanctuary, under the great diamond, linked to the Atrium by the **validators path** (a paved lane lined with lampposts). Every building has its place: the great Ledger hall under its glass pyramid (a diamond block floats inside), the pedimented temple, the library, the greenhouse, the domed rotunda, the market and its stalls, two colonnaded halls under glass roofs, fountain squares and gardens, the **refuge** (a small room to eat and sleep in). The City sits on a plateau that blends into the terrain. Validator robots and cats in the streets, disc ships overhead, flocks of birds by day. Hostile mobs never spawn or attack along the path itself either (`mobSafe()`, `06-actions.js`): the Atrium and City's own protected circles (`sanctuary()`) left a gap between them where a newcomer, explicitly sent down that one route, could otherwise be ambushed.
- **Villagers**: nine characters live in the Atrium, along the path, and in the City (guardian, builder, cartographer, merchant, librarian, gardener, oracle, scribe, traveler). Right-click to talk to them: tips, direction to the nearest ruin, state of the network. The validator robot and the space shiba have their fixed spot in the Atrium. A brand-new arrival's first moment isn't just a checklist: Thea, the Atrium's guardian, greets them before they have to go find anyone (`greetPlayer()`, `09-animals.js`, gated by the same `S.seen.intro` flag as the rest of the opening).
- **The network, a shared goal**: all players relight the old validators together. The world's counter (`act_network`, `007_network.sql`) shows at the top of the screen and in the Objectives tab, with the five best watchers; at 3, 10, 25, 50, and 100 validators, one more star orbits the great diamond.
- **Trades between players** (`008_trades.sql`): the chest's Trade tab, or `/trade nickname`. An offer says "I give" and "I want": resources, unique pickaxes, plots. Nothing is locked at creation; on acceptance, the server rechecks both sides and moves everything at once (or nothing). A unique item keeps its history as it changes hands. Validator seals can't be traded. 5 pending offers at most per player, valid for 3 days; 16 plots at most after a trade.
- **Seeing yourself**: the V key (or the button at the top of the screen on mobile) switches to a view from behind, then from the front; the chest shows your character, which you can spin and recolor. The place's name shows up when you enter the Atrium, the City, a ruin, a garden, the islands, or the depths.
- **World seed**: `SEED` in `world.js` fixes the whole terrain; `node tools/seeds.mjs` looks for seeds with a pleasant starting area (plains, sea nearby, healthy ground for the City). Changing it requires a database reset.
- **Inspired by ethereum.org's illustrations**: palm trees on beaches and dunes (and at the sanctuary's corners), glowing amethyst clusters in deep caves, cats, space shibas in spacesuits, and validator robots with pointy lavender hats (a robot and a shiba guard the sanctuary), a ring of orange blocks orbiting the great diamond. Crafting, Decoration: marble column, cyan neon, holographic screen, diamond block, studded game bricks (4 colors).
- **Construction**: pastel concrete (8 colors), stained glass (4), slabs, stairs oriented by your facing direction, doors spanning two blocks (right-click to open), fences and panes that connect to their neighbors, ladders (walk or jump into them to climb, crouch to hold still), chests to store items (right-click to open, crouch to place a block against one; inside a plot, only the owner and their invites can open them). You can step up onto slabs and stairs without jumping.
- **Circuits made of blocks**: lever and pressure plate (sources), ether cable, lamp and powered door. The current is recomputed continuously around the player and is never saved: only the levers' state is. A plate activates under any player, including a friend.
- **Logic gates** (Crafting, Circuits): AND (both sides powered), OR (one side or the back), NOT (active as long as the back isn't) and a clock (ticks every second). A gate is placed like a staircase: its output points in the direction you were facing, an arrow marks it on top. They chain together and with cables, enabling code locks, blinkers, or traps.
- **Progression**: objectives grouped into story chapters (button at the top of the screen, O key or Objectives tab, see "Story chapters" below) and four tool tiers. Your hand can't cut stone; the wooden pickaxe cuts stone and ore; the crystal pickaxe (unique item) opens geodes; the pure ether pickaxe (unique item) cuts the genesis rock, at the bottom of the world, which gives genesis fragments. With a fragment, shards, and crystals, you forge a validator heart.
- **Old validators**: a ruin with a dark validator per 80 × 80-block region (the first about forty meters from the sanctuary). Your objective's compass leads to the nearest one. Relighting it with a heart puts it under your name, rolls its rarity (common to legendary), and gives you a validator seal (unique item) as a keepsake. Validators are only ever relit, never built (`031_no_built_validators.sql`): the old Validator recipe is gone and placing that block is refused; validators placed before that keep working. See "Validators and Gwei" below for the production loop.
- **Animals**: ether sheep (plains), rabbits (dunes, plains, forests), pink foxes (forests), prism fish (oceans), sky jellyfish (around floating islands). Right-click or short tap to pet them: once a day, a sheep offers ether wool (a block), a fox a flower, a jellyfish a pure shard. They're placed and moved based on the seed and the time: every player sees them in the same spot, with no network traffic.
- **Rendering**: Three.js r128, textures generated in code in two looks: *Clay* by default (the pixel atlas smoothed and flattened, a toy-brick bevel on each block face in the shader, solid leaves, chibi avatars, Ethereum diamonds floating over the Atrium) and the original *Pixel* art (Settings → Look, or `?style=pixel`; the choice is kept per device, `ether-mines:style`; the pixel version as it was is also tagged `pixel-v1`), cast shadows (disabled on mobile), an 8-minute day/night cycle (online, one clock per world read from the real time, so friends fighting together see the same night: `tickClock()`, `08-sky.js`), blocks that glow at night, rippling water, fireflies at night, a placement effect, avatars that breathe and sway while walking.
- **Settings** (chest's Settings tab, specific to each device): look (clay or pixel, reloads the game), view distance, sharpness, shadows, fireflies, animals, hostile mobs (locked on in the main world `principal`, so ruins, geodes and genesis rock stay guarded for everyone and relighting stays fair; free in solo and in a private world such as `?monde=family-xyz`, which has its own Gwei, leaderboard and validators: a peaceful world for a child, say), camera sensitivity, frames-per-second counter.
- **Performance**: chunk meshing (≈ 18 ms per chunk on a server, probably 2 to 4 times slower on a phone) happens in a background worker, without blocking the frame; automatic fallback to in-place computation if the browser doesn't allow it (page opened via `file://`).
- **Keeping machines cool** (`src/game/10-loop.js`): at most 60 frames a second (a 120 Hz screen would draw twice as many for nothing), about 12 while nothing moves under your eyes (title screen, pause, chest or shop open), sharpness "Normal" by default (a Retina screen at full resolution costs twice the pixels). With *Adjust quality automatically* (Settings, on by default), 5 seconds of play under 40 frames a second lower the sharpness, then the shadows, then the view distance, one step at a time, saved and announced in the feed.
- **Fullscreen**: on Android, the game goes fullscreen and landscape when you start playing. On iPhone, Safari doesn't allow this for pages: the title screen offers to add the game to the home screen (Share button → "Add to Home Screen"), from where it opens without bars.
- **Sound**: entirely synthesized in `src/audio.js` (Web Audio, no file): footsteps and hits per material, breaks, placements, circuit clicks, a musical pad, birds by day, crickets by night, drops underground. M key or ♪ button to mute; the choice is kept in the browser (`ether-mines:son`).
- **Compass**: under the position (top left), a strip that scrolls as you turn: N, E, S, W and the diagonals (north is −z, toward the great diamond and the City; east is +x, the sea), the Atrium (⌂) and the current objective's target with its distance (`updateCompass()`, `07-interface.js`).
- **Full screen**: F key or the ⛶ button next to ♪ (on an iPhone, where no browser can put a page full screen, the button explains instead how to add the game to the home screen, which opens it full screen through `manifest.webmanifest`; hidden once launched from there). Switching keeps the mouse captured and never opens the pause menu.
- **Multiplayer**: other players appear with their nickname, blocks sync live, a chat (Enter, or its icon next to the chat log) and the list of online players.
- **Tokens (Ethereum's vocabulary, entirely off-chain)**: a chest with token sheets ("minted" for resources, "sealed" for unique items like the crystal pickaxe), a workshop, a ledger of mints and burns, a ledger view (T) that highlights your blocks.
- **Gwei and validators**: Gwei is the game's own currency, earned from validators you reanimate and spend on repairs, upgrades, and cosmetics. See "Validators and Gwei" below.

Nothing is recorded on a real blockchain. No wallet, no RPC call, nothing to buy with real money: Ethereum's vocabulary is kept as flavor, not as a mechanism. The old optional real-chain mirror (Sepolia) has been retired — see `legacy/README.md`.

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
| `act_relight` | a real dark validator, validator heart in the chest; reanimates it into the `validators` table (random rarity) |
| `act_maintain_validator` | ownership; settles missed cycles, repairs from "corrupted" (needs a validator heart), pays out net Gwei — no reach check, attests remotely like a real validator |
| `act_upgrade_validator` | ownership, not corrupted, level below 10, enough Gwei (50 × current level) |
| `act_buy_cosmetic` | not already owned (block packs excepted), enough Gwei at this week's price, limited pieces only in their week; grants existing decorative blocks for "block"-category cosmetics |
| `act_gift` | once a day per animal, 15 gifts a day at most |
| `act_rewards` | ticks every validator the player owns (lazy, like `players.rewards_at` used to for Ether Crystal), 24 h caught up at most |
| `act_claim`, `act_unclaim`, `act_member` | plots: cost, limit, owner |
| every action on a block | public zones (`006_public_zones.sql`): the Atrium and the City can't be mined, built on, or claimed |
| `act_chest`, `act_chest_move` | chests: a real chest block, within reach, right to build there, items present in the bag or the chest; a broken chest returns its contents to whoever breaks it |

On top of that, every action passes a common check (`supabase/migrations/002_security.sql`):

- **Rate**: each player has a token reserve per action type (mining and placing: 8 per second, doors 4, crafting 4, plots and invites 1 every 2 s, recovery codes 1 every 5 s). Beyond that: "too many actions".
- **Position and reach**: mining, placing, opening, relighting, and claiming send the player's position. The targeted block must be within reach (6.5 blocks from the eyes), you can't place a block inside your own body, and the position must be reachable from the previous one (running speed, with some margin for the network; free falls). Returning to the sanctuary and `/join` (next to an active player) stay allowed. To claim a plot, you need to be standing in it. The game also sends a position ping every 15 s while moving.
- **Chat** (`003_moderation.sql`): every message goes through `act_chat`. The nickname and color come from the save, so it's impossible to speak as someone else. One message per second (bursts of 4), 140 characters, banned words replaced with stars (list in the `chat_banned_words` table, to extend by hand). Messages older than 2 days are deleted.
- **Reports**: `/report nickname`. Three different players within 24 h mute a player for 1 h, then 2 h, 4 h… on each repeat offense. Only players who have already mined or placed a block can report (against throwaway accounts). `/ignore nickname` hides a player in your browser only. **Signs** (`036_sign_reports.sql`): right-click someone else's sign, then *Report*; three players who have played within 24 h take its text down and mute its author the same way (no chat, no sign text). The query to list the signs reported lately is at the top of the migration.
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
  01-textures.js        pixel art atlas generated in code, and its clay version
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
  16-mobs.js            hostile mobs, bosses
src/audio.js            generative sounds (Web Audio)
supabase/functions/_shared/world.js   world generator (game and server)
supabase/functions/_shared/rules.js   blocks, items, tiers, recipes, cosmetics (game and server)
supabase/functions/freeze/            Edge Function: generates and freezes a chunk's terrain
supabase/migrations/    database schema, act_* arbitration functions
supabase/rules.sql      game rules in SQL (generated by tools/rules.mjs)
supabase/reset.sql      full reset (world, saves, guest accounts)
tools/rules.mjs         generates supabase/rules.sql
legacy/                 the retired real-blockchain layer (contracts, Edge Functions) — see legacy/README.md
```

## Deploying

The terms of use, the illegal-content reporting procedure, the legal notice and the privacy policy live in `legal.html` (linked from the title screen, under the Enter button). Update it whenever the game starts storing something new, or changes how long it keeps it. The fonts are served from `fonts/` (SIL Open Font License), never from Google Fonts: a third-party font server would receive every visitor's IP address.

1. **Supabase**: create a free project on supabase.com.
2. **Guest accounts**: in *Authentication → Sign In / Providers*, enable *Allow anonymous sign-ins*. Every player gets an account automatically, no email or password.
3. **Database**: in the *SQL Editor*, run `supabase/installation.sql` (every migration in order, then the rules, in a single file generated by `node tools/installation.mjs > supabase/installation.sql`). It replays safely: re-run it whenever a game update touches the database or the rules.
4. **`freeze` function** (once, then on every change to the generator):
   ```
   npx supabase login
   npx supabase functions deploy freeze --project-ref <project id> --use-api
   ```
   Or automatically: add the GitLab CI/CD variables `SUPABASE_ACCESS_TOKEN` (supabase.com → *Account → Access Tokens*) and `SUPABASE_PROJECT_REF` to the project (*Settings → CI/CD → Variables*); the `freeze` job of `.gitlab-ci.yml` redeploys the function on every push to `main` that touches it, once the tests have passed.
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
| Gwei balance | Supabase, `players` table, `gwei` column (server-only, never part of `state`) |
| Validators: position, state, rarity, level, production | Supabase, `validators` table (world-readable, written by `act_*` functions) |
| Owned cosmetics | Supabase, `cosmetics_owned` table (read-only for the player); equipped choice in `players.state` |
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

- **The generator** (terrain, biomes, trees, caves, ores): bump `GEN` on every terrain change, then redeploy the `freeze` function (automatic with GitLab CI). Only never-touched chunks change. A seam can appear between a frozen chunk and a regenerated one (a small step, half a tree).
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

Tests run automatically on GitLab on every push (*Build → Pipelines*, `.gitlab-ci.yml`). A push that breaks something shows up in red.

- **Generator and rules** (no database): `node --test tests/*.test.mjs`. Checks that the world is deterministic, chunk encoding, the sanctuary and the first ruin, recipe consistency, and that `supabase/rules.sql` is up to date with `rules.js`.
- **Schema and arbitration**: `PGHOST=… PGUSER=postgres tests/sql/run.sh` on an empty Postgres 16 (a `mines_test` database is recreated). Installs every migration twice, the rules, chunks generated by the real generator, then plays about forty scenarios: server terrain reading identical to the generator, mining, tool tiers, rate limits, placing, doors, crafting, plots, invites, ruins, gifts, rewards, save recovery, rate limits, reach, impossible moves, and every attempt at direct cheating (writing a block, giving yourself items, making up terrain…). Finally checks that `reset.sql` wipes everything.
- **Formatting**: `npx prettier@3 --write "src/game/*.js" "src/*.js" "supabase/functions/_shared/*.js"` (checked by the tests).
- **Browser playthrough** (solo mode, Chromium): `npm i --no-save playwright@1.56.0 three@0.128.0 && npx playwright install chromium && node tests/navigateur.mjs`.
- **Screenshots from any viewpoint** (solo mode, same setup as the browser playthrough): `node tools/capture.mjs --x 8 --y 40 --z 20 --look-at 8,32,8 --time sunset --out captures/atrium.png`; see the top of `tools/capture.mjs` for every option (several angles around a point, several shots from a JSON file, interface on or off).
- **By hand**: opening `index.html#debug` exposes `window.mines` in the console (including `serverAct(name, args)`, `syncInventory()`, `get(x, y, z)`, `P` the player, `S.day` the time).

## Validators and Gwei

Ether Mines' economy is entirely off-chain: no wallet, no real chain, nothing of real-world value.
**Gwei** is the game's own fictional currency (`players.gwei`, a plain Postgres counter — never an
on-chain token), earned from validators and spent on repairs, upgrades, and cosmetics. `1 Æther = 1000
Gwei` is a display convention only (the client divides `S.gwei` by 1000 above a threshold); nothing is
stored in that unit.

```
Player finds a dormant validator (a "Dark Validator" in the ruins)
   │ act_relight — a validators row is created, rarity rolled, a seal (item 203) minted
   ▼
Validator, active: earns Gwei every cycle (5 minutes) net of its own upkeep, always — attest anytime
to collect it, whether you've checked in once a minute or once a week (24h catch-up cap)
   │ act_maintain_validator ("attest") — pays out, then separately checks the last 24h
   │ attested within the last 24h: healthy, no degradation
   │ longer than that: a missed health check — degrades, income keeps accruing regardless
   ▼
active ──(3 missed checks)──> damaged ──(8 missed checks)──> corrupted
   ↑ free to repair from damaged                   ↑ needs a Validator Heart (item 105) to repair
```

- **Rarity** (rolled on reanimation): common 60%, rare 25%, epic 12%,
  legendary 3%. Higher rarity means more Gwei per cycle, and a higher upkeep to match.
- **Level** (`act_upgrade_validator`, 50 × current level in Gwei, 10 at most): +15% to both production
  and upkeep per level.
- **Production and health are independent**: a validator earns its net Gwei for every elapsed cycle no
  matter how long it's been since you last attested (24h catch-up cap) — neglect never claws back Gwei
  already earned. Attesting is a separate, remote health check (no reach check, unlike mining, placing,
  or relighting — attest from the Validators tab, wherever the validator is): go more than 24h without
  one and it degrades, which still doesn't touch past earnings, just needs repairing (free from damaged,
  a Validator Heart from corrupted) to stop racking up missed checks.
- **Seal** (item 203): bound to one validator (`uniques.validator_id`), minted once, never traded
  (already enforced before the pivot) — a keepsake, not a credential anyone else can use.
- **Cosmetics** (`act_buy_cosmetic`, Shop tab): bought with Gwei, purely decorative — never a combat,
  speed, harvesting, or access advantage. The catalog (`COSMETICS` in `rules.js`) is a separate id space
  from blocks and items, so it can grow (rarity, limited editions, collections) without touching the
  append-only block/item numbering. The `combat` category is the one exception to "bought": never for
  sale, only ever granted by the loot tiers below — shown in the Shop as a trophy case, not a catalog.
- **Wearables and the weekly offer** (`032_shop.sql`, `src/game/17-looks.js`): each wearable has a slot
  (outfit, head, back, companion, trail, tool trim, plating trim) and many belong to a collection that
  follows Ethereum's history (Frontier, Homestead, Staker, The Merge, Dencun, Ether), priced from 250
  to 25,000 Gwei so the biggest pieces take days of validator income. Each week (Monday 00:00 UTC),
  three regular wearables are 25% off and one *limited* piece (the Dencun set) is the only week it can
  be bought; `shopFeatured()` in `rules.js` and `_shop_featured()` in SQL compute the same picks (a
  test checks two years of weeks). Block packs can be bought again and again. What you wear is
  `S.look` (saved with the game); outfit, head, back, companion and trail travel in presence so the
  other players see them, the trims stay on your own held item and armor. The shop's *Try* puts a piece
  on your character before you buy it.
- **Consumables and the Genesis tier** (`033_consumables.sql`, `src/game/18-potions.js`): crafted in the
  Potions category and spent by right-clicking them in hand (`act_use_item` takes one from the
  inventory). Ether Tonic (+5 hearts), Swift Elixir (2 min of speed), Owl Draught (3 min of night
  vision), Ward Incense (2 min during which ordinary mobs ignore you unless you strike them; guardians,
  wardens, turrets, bosses and attack nodes aren't fooled), Home Beacon (back to the last bed you slept
  in: the server checks the bed and records the position, so the teleport isn't refused as an
  impossible move). Item ids start at 301: below 200 every number is a block's or reserved for future
  blocks. The Genesis Blade and Genesis Plating need a boss trophy you own (`rule_recipes.req_unique`,
  kept, never consumed): the Titan's fang for the blade, the Plasma Core's pistol for the plating.
- **Furniture and signs** (`034_signs.sql`, `src/game/19-signs.js`): chairs and a sofa that turn to face
  you as you place them, four carpets you walk over, potted plants and flowers, all in the Furniture
  crafting category. They are ordinary blocks drawn as their own little boxes (shape `furn` in
  `src/mesh.js`, block ids 146 to 163; block ids stop at 200). A sign carries one line of text (60
  characters) that every player reads: only whoever placed it writes on it (`act_sign`), through the
  chat's word filter, muted players can't; the text lives in the `signs` table (streamed like blocks)
  online and in the save solo, and is drawn on both faces of the board while the sign stands.
- **Shared combat** (`src/game/16-mobs.js`, `src/net.js`): every screen still moves its own copy of a
  mob, but a mob has the same id everywhere (its chunk, its slot there and its kind), and every blow is
  sent to the players nearby on the region channels: the damage, the hp left and where the mob stands.
  So a mob loses the same hp on every screen (a screen that arrived late catches up on the first blow)
  and dies for everyone, bosses included. Whoever struck it in the last 30 seconds gets their own loot
  (`act_loot_mob`, unchanged: the server still decides what drops). A mob goes after the closest player,
  you or another one nearby, the same choice on every screen, and only strikes on its target's screen,
  so nobody takes a hit twice. Alone, nothing is sent.

See `supabase/migrations/019_gwei_currency.sql` through `024_loot_tiers.sql` for the schema, and
`legacy/README.md` for what used to exist here (a real, optional Sepolia mirror — retired, not deleted).

### Respawning

A killed mob stays dead for a while on your screen (`KILLED`, `src/game/16-mobs.js`): 2 minutes (walking
away and back no longer brings it straight back, nor does the night bring a prowler back at once), 25
seconds for a network attack node (the wave keeps coming, with room to breathe).

### Mob loot tiers

Every regular (non-boss) kill rolls one layer, independent of the mob's own resource-chance table:

| Tier | Odds | Reward |
| --- | --- | --- |
| Epic | ~3% | A combat-exclusive cosmetic (Shop tab), never sold — falls through to the common roll once every combat cosmetic is owned |
| Rare | ~12% | 10–50 Gwei, credited straight to the balance |
| Common | the rest | The mob's usual resource chance, unchanged (`act_loot_mob`, `013_mob_loot.sql` onward) |

Boss kills (Genesis Titan, Plasma Core) are untouched: a guaranteed unique trophy on every kill, the
legendary tier in all but name. See `supabase/migrations/024_loot_tiers.sql`.

A second, rarer trophy can also drop on a boss kill — an independent ~20% chance on top of the
guaranteed one (Titan Core Shard, Plasma Conduit Core), purely a keepsake like the main trophy, a reason
to keep farming a boss past the first kill. See `supabase/migrations/026_boss_bonus_trophies.sql`.
Every boss kill also gives **Diamond Shards** (1 or 2, 2 for the Merge twins), and every tower's
treasure chest holds one: the ingredient of the Radiant Diamond and of the Genesis gear (4 each). The
third source, a chance on each relight once 100 validators are lit in the world, is for the late game
(`037_diamond_shards.sql`).

### The Merge Sanctum

A floating arena in the sky (`mergeAt()`, `world.js`; one per 192 × 192 region, the nearest about
170 blocks west of the Atrium, over the sea), split down the middle: a proof-of-work forge to the west
(granite, coral, a furnace) and a proof-of-stake crystal half to the east (marble, lavender, a crystal
obelisk), a cyan seam where they meet and a two-tone diamond merging above the center. The **Beacon
Stair**, a spiral of floating steps half a block apart around a marble core, climbs from a landing on the
ground (or the sea) to a bridge on the south side.

It is guarded by twin bosses (`src/game/16-mobs.js`): **Proof-of-Work**, a slow, heavy mining rig, and
**Proof-of-Stake**, a fast floating crystal with four staked cubes orbiting it. Strike one down and it
only falls dormant for 12 seconds: unless its twin falls too in that window, it rises again with 60% of
its health. Both must fall together. They never leave their disc. The win (reported once, as
`merge_twins`, `030_merge_twins.sql`) mints the **Merge Aegis** (item 209), the best armor in the game
(−60% damage), and with a ~20% chance a **Difficulty Bomb Fragment** (210) as a keepsake.

### Creatures that stand out

Walking mobs step up one block at most, like you (`updateMobs()`, `src/game/16-mobs.js`): a wall two
blocks high stops them and they slide along it, and they only bite when nothing solid stands between
you, so a closed hut, a wall or a moat really shelters you. Fliers and swimmers (sky raiders, bats,
lurkers, the Proof-of-Stake twin, the Plasma Core) move freely, as before.

The bosses each have their own silhouette (`buildMob()`, `src/game/16-mobs.js`): the **Genesis Titan** is
a hunched colossus of genesis rock with a crown of spikes and a burning gold core; the **Plasma Core** is a
machine heart of magenta plasma in a dark cage, three rings of plates spinning around it, floating over its
tower's loggia; **Tower Wardens** are tall sentry knights with a tower shield and a halberd.

Two kinds of enemies hit from a distance (`MK[type].ranged`, `rangedAttack()`): **Tower Turrets**, bolted
to the first and second floors of every tower, swell their lens while charging, then fire one slow bolt;
the **Plasma Core** fires bursts of three when you keep your distance, and rams you up close. Shots only
leave along a clear line of sight, and a bolt dies on the first solid block: sidestep it, or put a wall
between you. Turrets drop nothing of their own (the server's loot tiers still roll on every kill).

Balanced after a first playtest: the tower's floors are tight, so they hold fewer wardens (one on the
ground floor, one or two above) and slower turrets, and every tower mob keeps a step away from the ladder's
hatch and holds its attacks while you climb; the **Genesis Titan**, slow on its feet, now hurls
chunks of genesis rock when you keep your distance and charges to close the gap; the **Merge twins**
can't leave their disc, so they're shielded from anyone who isn't standing on it (attacks from the stair
or the sky do 15% damage), and Proof-of-Stake fires bursts of its own.

### Tower treasure

Every tower (`towerAt()`, `world.js`) guards a chest on the boss's platform at the top, next to the
Plasma Core, seeded with better-than-average loot (15–25 Ether Crystals, 4–8 Pure Shards, a 50% chance
of a bonus Genesis Fragment) the first time it's opened — worth the climb even before the fight. See
`supabase/migrations/025_tower_treasure.sql`.

### The network attack event

Every real-world hour, for its first 10 minutes, a wave of corrupted nodes converges on the Atrium.
No new infrastructure: every client independently computes the same wall-clock window
(`attackWindow()`, `07-interface.js`, mirroring `_attack_window(ts)` in SQL) the same way the day/night
cycle already runs with no server round-trip, and only kills are reported to the server — the same
bounded, rate-limited, position-checked trust `act_loot_mob` already extends to every other mob
(`src/game/16-mobs.js`'s `syncNetworkAttack`, modeled directly on `syncNightProwler`).

Fighting them off pays: ~25% of a kill drops 10–50 Gwei, ~8% a defenders-exclusive cosmetic (Shop tab,
never sold), the rest a guaranteed small resource bundle — no whiffed kills during the event. Clearing
20 kills in the window counts as a successful defense: every contributor is paid 50 Gwei and, the first
time, the cosmetic. The event always resolves automatically (lazily, like `_tick_validator`'s catch-up),
even with zero kills — no punishment for nobody's timezone, but a successful defense is worth much more.
A running, server-wide defense score (`network_score`) never resets and recolors the great diamond in
the sky at each tier it crosses. See `supabase/migrations/027_network_attack.sql`.

### Story chapters

The objectives (`QUESTS`, `07-interface.js`) are grouped into chapters (`CHAPTERS`) that Thea, the Atrium's
guardian, opens and closes with a line each. Main chapters unlock one after another; a side chapter
unlocks once the chapter it follows is done; inside a chapter, objectives can be done in any order.

| Chapter | Objectives | Reward |
| --- | --- | --- |
| 1 · Genesis | wood, wooden pickaxe, crystal, pet an animal, reach the City, sleep | 50 Gwei · title *Pathfinder* |
| 2 · The Forge | crystal pickaxe, geode, pure ether pickaxe, a weapon, a mob | 100 Gwei · title *Smith* |
| 3 · The Awakening | genesis rock, validator heart, relight a validator, attest it | 200 Gwei · title *Awakener* |
| 4 · The Network | 3 validators, a trade, defend the Atrium, the Plasma Core, the Genesis Titan | 400 Gwei · title *Network Guardian* |
| 5 · The Merge | climb to the Merge Sanctum, bring down both twins together, wear the Merge Aegis | 600 Gwei · title *Merge Keeper* |
| Side · Circuits (after Genesis) | the five gate builds of the Circuits Complex, and an AND, an OR and a NOT gate of yours left standing | 100 Gwei · title *Circuit Sage* |

The objectives the server checks before paying a chapter follow what the server sees, not the browser: "Relight a validator" and "Relight three validators" count the validators you own on the server (`ownedValidators()`), and the Circuits chapter needs your three gate types still standing (`MY_GATES`, polled every 30 s until the title is earned). When the server still refuses, the message names what it is missing (`chapterMissing()`).

**Intro.** A brand-new player's first seconds are a 14-second cinematic (`playIntro()`, `07-interface.js`,
once ever, before Thea's greeting): high above, the great diamond, dim; down to the first ruin's dark
validator; then over to the Atrium and into the player's own eyes, facing Thea. Two lines of Thea's as
subtitles. Cinematics share one player (`cinePlay()`, `cineTick()`, `cineCamera()`): letterbox, HUD
hidden, player frozen, Skip button or Escape/Space/Enter.

**Epilogue and finale.** Once the last main chapter (The Merge) is done, the story is marked finished
(`S.seen.epilogue`) and Thea calls you back to the Atrium; the objectives bar points there ("Finale ·
Return to the Atrium"). Within 14 blocks of its center the finale plays once (`updateFinale()`, `07-interface.js`): a
30-second cinematic played in the engine (`cinePose()`: the game takes the camera, letterboxed, HUD hidden,
the player frozen, Skip button). Shot 1 circles the Atrium while night falls and a beam of light rises from
it; shot 2 cranes up and back through the fireworks with the great diamond beyond; shot 3 comes down to
Thea, whose two lines play as subtitles. A full-screen epilogue (closing text, the journey in numbers,
what to do next) then closes it (`S.seen.finale`). The epilogue card then stays at the top
of the Objectives tab, and every villager has a new line (`after` in `VILLAGERS`, `09-animals.js`), said
the first time you talk to them afterwards. Players who finished before the finale existed get it too. It waits 4 s after entering the world (so logging in inside the Atrium doesn't start it under the loading fade), and night falls over the Atrium for the fireworks. The epilogue card has a "Replay the finale" button.

After chapter 5, the validator milestones (3, 7, 12… 100 relit) take over. Most objectives are client
flags, so the reward (`act_claim_chapter`, `029_chapters.sql`) is only paid against proofs the server
checks itself: a pickaxe for Genesis, the pure ether pickaxe for the Forge, a validator for the
Awakening, three validators + both boss trophies + a kill during a network attack for the Network, and
an AND, an OR and a NOT gate placed by you for Circuits, the Merge Aegis for the Merge. Titles are never-sold cosmetics (ids 15–19);
owning one is what marks its chapter as claimed. The furthest title shows under your name for the other
players. Existing saves keep their progress: what was already done counts, and its rewards are claimed
on the next online session.

### The leaderboard monument

What other players are doing, standing in the City instead of buried in a tab: a sign near the City's
entrance (`src/game/07-interface.js`'s `lbSign`) showing the top 5 by Gwei earned (a cumulative counter,
`players.gwei_earned` — spending never lowers your rank, only earning raises it), by validators currently
kept active, and by network attacks repelled. No new rendering: a canvas texture redrawn on the same
60-second poll as the network panel, the same pattern already used for every procedural icon and the
butterflies' sprites. See `supabase/migrations/028_leaderboard.sql`.

## Known limits

- The server checks that reported positions are plausible, not fine-grained physics: a cheater can walk through a wall or fly at running speed. They can't mine from a distance, teleport, or act faster than a human.
- Objectives are tracked in the browser. Their chapter rewards are only paid against proofs the server checks itself (see "Story chapters"), so faking an objective gains nothing.
- Animals and gifts aren't checked one by one (the server caps gifts at 15 a day).
- Chat moderation is automatic and simple: no human moderator, and the filter only sees whole words (leetspeak slips through). Nicknames are unique per world, but not filtered: an offensive one has to be renamed by hand in the SQL Editor.
- Validator ticking is lazy (settled on attest, or on the periodic "collect all"), not a background job: a validator's displayed state can lag a few minutes behind its true state until someone looks.
- Supabase free tier: the project pauses after a week of inactivity, 2 million realtime messages a month and 100 a second, where every receiver counts as one more message. Positions are capped at 5 sends per second per player, only while moving, and only reach nearby players: the world is cut into 96-block squares, each with its own channel (`src/net.js`), you send on yours and listen to the 3x3 around you, and a player with nobody within one square sends nothing at all. Presence, chat and block changes stay on the world channel.

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
- 1 to 9, scroll: item bar · E: chest and crafting · T: ledger view · I: block explorer (who placed the block you aim at, when, and its history) · M: sound · Enter: chat (`/join nickname`, `/sanctuary`, `/claim`, `/unclaim`, `/invite nickname`, `/kick nickname`, `/claims`, `/ignore nickname`, `/listen nickname`, `/report nickname`)
- Mobile (Minecraft mobile layout): stick on the left to walk, drag to look around, long press to mine, short tap to place or activate; on the right, jump (↑), run (», stays active until you stop) and crouch (↓: slower, won't fall off edges, goes down into water); at the top, chest, chat, and menu; "…" at the end of the bar opens the chest
- Keyboard: C or Ctrl to crouch
