# Ether Mines — pointers for Claude Code

Minecraft-style block game set in the Ethereum universe. Static site (ethermines.org, also ether-mines.vercel.app) + Supabase. The README describes the whole game; this file only keeps the working rules.

## Talking to Pierre
- **Reply to Pierre in French**: simple, clear, no internal jargon. Game text, code comments, and commit messages stay in English.
- End with what changed, what was checked, and what Pierre has to do himself (SQL to run in Supabase, a reset, a page to reload), if anything.

## Architecture
- **Client**: no build. Three.js r128, classic scripts `src/game/NN-*.js` loaded in order by `index.html` and sharing the global scope (a test checks the order). Modules shared between client and server: `supabase/functions/_shared/world.js` (generator), `rules.js` (blocks, items, recipes), `src/mesh.js`, `src/mobs-core.js` (the mobs' logic: MK, where they spawn, how they hunt; also run by the game server, which is redeployed when any of these change).
- **Server**: Supabase. Anonymous auth, RLS, `act_*` functions (security definer) that arbitrate everything; `_*` functions are internal. `freeze` Edge Function (terrain), deployed by GitLab CI (`.gitlab-ci.yml`).
- **Game server** (`server/`, Node.js + `ws`, hosted on Fly.io): the players' real time (presence, moves, PvP hits, mob blows, shots) over one WebSocket, when `CONFIG.GAME_SERVER` is set; otherwise, or when it's down, `src/net.js` falls back to Supabase Realtime's presence and region channels. It saves nothing, but it settles PvP damage, keeps the mobs' health and **runs the mobs itself** (`server/src/mobs.js`, on the terrain it reads from Supabase, `server/src/terrain.js`); the game then only draws them. It also keeps the players' hearts (`server/src/health.js`) and pays the mobs' loot with the `service_role` key (a Fly secret, `SUPABASE_SERVICE_KEY`; `srv_*` functions in `041_game_server.sql`, only callable with that key; `act_loot_mob` refuses while the server is up). Without it, each screen runs them (`src/game/16-mobs.js`). `WEAPONS` in `server/src/server.js` must match `rules.js` (a test checks). `PROTOCOL` (server) and `GS_PROTOCOL` (net.js) must change together. See `server/README.md`.
- **Identity**: a nickname (one in the whole game, case-insensitive) and a password (`046_logins.sql`, `047_nickname_password.sql`), on top of an anonymous Supabase session kept by the browser; entering on another device moves the game to that device's session. No wallet, no real blockchain (the old Sepolia layer lives in `legacy/`).

## Rules to never break
- Block numbers are **appended at the end, never reused**, and a block number must never be the same as an item's (items: 101–105, 201–203).
- Never rename a `localStorage` key.
- SQL migrations in `supabase/migrations/NNN_*.sql`: **additive and replayable** (create or replace, if not exists). Don't modify a migration that's already published: add a new one.
- After any change to the rules or a migration: `node tools/rules.mjs > supabase/rules.sql` then `node tools/installation.mjs > supabase/installation.sql`. Any new table must also be wiped by `supabase/reset.sql`.
- The players' wiki (`wiki.html`) is built from the game's data (recipes, items, cosmetics, mobs, objectives, chapters): after changing any of them, `node tools/wiki.mjs > wiki.html` (a test checks it). Its hand-written parts live in `tools/wiki.mjs`.
- **What's new** (`src/news.js`): with each update players will notice, add or extend the newest entry (date, title, a few short lines written for the players, not commit messages), then rebuild the wiki, which shows the log too.
- **The Unity client** (`unity/`, see its README) mirrors the web version: after changing `rules.js`, run `node unity/tools/export-rules.mjs` (a test checks it); after changing `world.js` or `src/mesh.js`, port the change to `unity/Assets/Scripts/Core/` and run the parity checks in `unity/CoreTests` (dotnet); after changing textures, `node unity/tools/export-art.mjs`; after changing a mob's model (`buildMob`) or `MK`, `node unity/tools/export-mobs.mjs` (a test checks it); after changing the animals or villagers (`09-animals.js`), `node unity/tools/export-animals.mjs` (a test checks it); after changing the circuits (`12-circuits.js`), port it to `unity/Assets/Scripts/Core/Circuits.cs` and run the parity checks (`golden-circuits.mjs`); after changing a sound (`src/audio.js`), port its recipe to `unity/Assets/Scripts/Game/Sounds.cs`; after changing a held item's model (`clayModel` in `04-render.js`) or adding an item, `node unity/tools/export-held.mjs`; after changing a look (`17-looks.js`) or adding a cosmetic, `node unity/tools/export-looks.mjs` (both need Playwright, like the browser test).
- Changing the terrain: bump `GEN` in `world.js` and add a line to `docs/generator-history.md`. Change `SEED` or `SEASON` (`src/game/03-state.js`) only together with a database reset.
- The server never trusts the client: every action that grants or moves value goes through an `act_*` function with `_rate` and position checks.

## Hidden constraints (learned the hard way)
- **The world is 64 blocks tall** (`SY`). Anything built above y 63 is silently cut off: check the tallest point of a structure against where it can stand (a tower on a hill starts at y 40+).
- **Terrain changes only reach untouched chunks.** As soon as a player mines or places a block in a chunk, the server freezes its terrain for good. A new building only appears where nobody has played yet, unless the database is reset: tell Pierre.
- **The server freezes chunks with the generator deployed from `main`.** A branch's preview shows its new terrain only until something in that chunk gets frozen.
- **Structures are contracts with other code.** Towers (21x21 since GEN 27, `TR`, `TOWER_LADDER`, `TOWER_CHEST` in `world.js`): platforms at ty+7/13/19, wardens, two turrets (floors 7 and 13, corners (−6, 6) and (6, 6), clear of the ladder at (7, −7)) and the Plasma Core (floating over the loggia, under the roof at ty+24) placed by `src/mobs-core.js` (`spawnChunk`) from the same `towerAt()`, the treasure chest at (x−6, ty+20, z−6) (`025_tower_treasure.sql` seeds a chest the generator placed: no `blocks` row, no history). The Merge Sanctum (`mergeAt()`, radius `MERGE_R` = 18): floor at y+1, the twins spawned by `mobs-core.js` 9 blocks west and east of the center and kept on the disc, the Beacon Stair's last step on the ring's north-middle cell so it lands on the bridge (walk-tested from the ground and from the sea). The City, the Atrium and the Circuits Complex are public zones checked in SQL (`_public_zone`) with the same radii as `world.js`. Search for every use of a position before moving it.
- **A door or a ladder must be reachable by walking**: check the ground in front of an entrance (stairs, not a two-block step) and test the climb in the browser.

## Working on the repo
- **`git pull` before starting.** Pierre also works in other sessions (Claude in the browser) on the same repo.
- Small, safe changes can go straight to `main`. For anything bigger, or when another session may be working at the same time, use a branch and open a pull request without merging it.
- **Every branch gets a Vercel preview** (link in the pull request). Test it with a throwaway world: `…vercel.app/?monde=test-something`. Never test on `principal`, the players' world: it shares the same database.

## Tests (all must pass before pushing)
- `npm ci --prefix server` (once), then `node --test tests/*.test.mjs` (includes the game server's tests)
- `tests/sql/run.sh` (local Postgres 16; PGHOST, PGPORT, PGUSER variables). If there's no local Postgres, push to a branch and let GitLab CI run them.
- `node tests/navigateur.mjs` (Playwright + Chromium, solo mode). Setup once: `npm i --no-save playwright@1.56.0 three@0.128.0 && npx playwright install chromium`
- `npx prettier@3 --check "src/game/*.js" "src/*.js" "supabase/functions/_shared/*.js"`
- **After every push, check the GitLab pipeline** (Build → Pipelines: the test jobs, and `freeze` when the generator changed). If it's red, fix it right away: `main` must always be green.

## Seeing the game (visual changes)
- For any change you can see (terrain, buildings, decor, textures, lighting, interface), don't work blind: take screenshots with `node tools/capture.mjs` (setup and options at the top of the file), look at them, and iterate until it matches what Pierre asked. Compare with his reference image when he gives one.
- Shoot from several angles (`--around x,y,z --count 4`) and at the times of day that matter (`--time morning|sunset|night`); `--no-mobs` keeps hostile mobs out of the frame. Watch out for viewpoints buried in terrain or trees: move the camera rather than trusting a bad shot.
- Show Pierre the final captures with the change, not just a description.

## Testing tools
- `index.html#debug` exposes `window.mines` in the console: the player `P`, `yaw`/`pitch`, `S` (state, `S.day` for the time of day), `playing`, `get(x, y, z)`, `commit`, `serverAct`, `giveAll()` (a stack of every block and item, to skip the early grind), and more (see the end of `src/game/14-startup.js`).
- `tools/dev-grant-all.sql` and `tools/dev-reset-validators.sql`: stock or reset ONE named test player in Supabase, by hand in the SQL Editor. Never migrations, never on someone else's account.
- `tools/seeds.mjs`: look for a world seed with a pleasant starting area.

## Deployment
- The repo lives on GitLab (gitlab.com/pierre.untas/ethermines, remote `origin`; the suspended GitHub repo is the `github` remote, its `.github/workflows` kept as is). Pushing to `main` deploys the site (Vercel) and the `freeze` function (GitLab CI, after the tests pass).
- The database isn't deployed automatically: Pierre runs `supabase/installation.sql` in Supabase's SQL Editor.
- Never put a private key, a `service_role` key, or a secret in the repo. `src/config.js` only contains the URL and the public `anon` key.
