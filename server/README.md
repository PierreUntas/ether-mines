# Ether Mines · game server

A small Node.js process that carries the players' real-time traffic: who is online in each world and
where they stand, moves, PvP hits, blows on shared mobs, plasma shots. The browsers connect to it over a
WebSocket (`src/net.js`, `CONFIG.GAME_SERVER` in `src/config.js`).

It saves nothing: the world, inventories and accounts stay in Supabase, behind the `act_*` functions.
It replaces Supabase Realtime's presence and region channels for this traffic; if it can't be reached,
the game falls back to those channels on its own and tries the server again every few seconds.

## How it works

- **Who you are.** The browser sends its Supabase session token in its `hello`. The server asks Supabase
  whose token it is (`/auth/v1/user`) and reads that player's nickname and color with the same token
  (`players`, where a player can only read their own row). No secret key is needed.
- **Who receives what.** Moves go to the players within 160 blocks, a blow on a mob within 64, a shot
  within 96. A PvP hit goes only to its target, and only if the target stands within reach (8 blocks,
  40 with the Plasma Pistol) by the server's own positions.
- **PvP is settled here.** The server reads which weapons each player really owns (their `inventory` and
  `uniques` rows, with their own token, refreshed every minute; the browser sends its renewed token as
  `token`). A blow with a weapon you don't have counts as bare hands; blows faster than the weapon's pace
  (450 ms, 300 ms for the pistol) are dropped; the damage (`dmg`) is computed here from `WEAPONS`, which a
  test keeps equal to `rules.js`. A plasma shot is only shown to others if you own the pistol.
- **Mobs' health lives here.** Each screen still moves its own copy of a mob, but every blow comes here
  with the weapon used: checked like a PvP blow (owned weapon, pace, reach; at most 1.5× the weapon's
  damage, for a riposte), taken off the mob's health, and sent back to the striker and to everyone within
  64 blocks. The server alone says a mob is dead, names who struck it in the last 30 s (each gets their
  own loot from Supabase, as before), and keeps it dead for 2 minutes (25 s for a network attack's node).
  The Merge twins only stay down if both fall within 12 s. `MOB_HP` must match `MK` in
  `src/game/16-mobs.js` (a test checks). An older page (blows without `item`) is only relayed, as before.
- **The mobs run here.** For every world with someone in it, the server runs the hostile mobs itself,
  ten times a second, with the game's own logic (`src/mobs-core.js`, `src/mobs.js`): where they spawn
  (from the seed and the terrain), resting by day, the night prowlers, the network attack, the guardians
  of a relit validator gone. It reads the terrain like the browser does (`src/terrain.js`: generated from
  the seed at once, then the frozen chunks and changed blocks from Supabase with a player's own token;
  the browsers pass on the block changes they see, `edit`). Each player gets the mobs within 48 blocks
  (`ms`: ten times a second for one on the hunt, twice for one wandering), the blows aimed at them
  (`mhit`, which they may parry: `parry` stuns the mob here) and every bolt fired nearby (`mshot`). The
  `welcome` says `mobs: 1`; `MOB_SIM=0` turns it off (the screens then run the mobs, as below).
- **One mob, one place (without the server's mobs).** The screen of the player a mob is after leads it: about 8 times a second it
  sends where the mobs it leads stand (`mobs`, 24 at most), and the bolts they fire (`mobshot`). The server
  passes them on to the players nearby, whose screens stop moving their own copy and follow. If two
  screens both lead the same mob, the one whose player stands closer keeps it.
- **The list of players.** Every two seconds, everyone in a world gets the list of the others with their
  position (the online badge, `/join`).
- **One connection per account.** A second tab or a reconnection replaces the older connection.
- **Limits.** 2 KB per message, about 40 messages a second per connection, dead connections dropped
  after a missed ping. `ALLOWED_ORIGINS` keeps other sites from connecting.
- **Protocol.** `PROTOCOL` in `src/server.js` and `GS_PROTOCOL` in `src/net.js` must match: a browser
  with another version is turned away (`bye: version`) and stays on Supabase's channels.

`GET /health` answers `{ ok, protocol, players, worlds, mobs, connections, messages }` (`mobs`: how many
the server is running).

## Running it locally

```sh
cd server && npm ci
npm run dev          # AUTH_MODE=test on port 8787: accepts "test:<id>:<name>" tokens, no Supabase
```

Tests: `npm ci --prefix server && node --test tests/gameserver.test.mjs` (from the repo root).

## Hosting on Fly.io (once)

1. Create an account on fly.io and install `flyctl` (`brew install flyctl`), then `fly auth login`.
2. From `server/`: `fly apps create ethermines-game` (if the name is taken, pick another one and change
   `app` in `fly.toml`).
3. First deploy, by hand: copy the game's shared scripts in, then deploy (from the repository's root):
   `mkdir -p server/shared && cp supabase/functions/_shared/world.js supabase/functions/_shared/rules.js src/mesh.js src/mobs-core.js server/shared/ && cd server && fly deploy`.
   Check `https://ethermines-game.fly.dev/health`.
4. Automatic deploys from GitLab: `fly tokens create deploy -a ethermines-game`, and save the token as the
   CI/CD variable `FLY_API_TOKEN` (masked, protected). The `game-server` job then copies the shared scripts in and deploys on every push to
   main that changes `server/`.
5. Turn it on for the players: set `GAME_SERVER: 'wss://ethermines-game.fly.dev'` in `src/config.js`
   and push.

Configuration (`fly.toml`, `[env]`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the public key),
`ALLOWED_ORIGINS`, `PORT`.
