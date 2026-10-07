# Ether Mines — pointers for Claude Code

Minecraft-style block game set in the Ethereum universe. Static site (ether-mines.vercel.app) + Supabase. The README describes the whole game; this file only keeps the working rules.

## Architecture
- **Client**: no build. Three.js r128, classic scripts `src/game/NN-*.js` loaded in order by `index.html` and sharing the global scope (a test checks the order). Modules shared between client and server: `supabase/functions/_shared/world.js` (generator), `rules.js` (blocks, items, recipes), `src/mesh.js`.
- **Server**: Supabase. Anonymous auth, RLS, `act_*` functions (security definer) that arbitrate everything; `_*` functions are internal. `freeze` Edge Function (terrain), deployed by GitHub Actions.
- **Identity**: one unique nickname per world, linked to an anonymous Supabase account (recovery code to switch devices). No wallet required.

## Rules to never break
- Block numbers are **appended at the end, never reused**, and a block number must never be the same as an item's (items: 101–105, 201–203).
- Never rename a `localStorage` key.
- SQL migrations in `supabase/migrations/NNN_*.sql`: **additive and replayable** (create or replace, if not exists). Don't modify a migration that's already published: add a new one.
- After any change to the rules or a migration: `node tools/rules.mjs > supabase/rules.sql` then `node tools/installation.mjs > supabase/installation.sql`. Any new table must also be wiped by `supabase/reset.sql`.
- Changing the terrain: bump `GEN` in `world.js`. Change `SEED` or `SEASON` (`src/game/03-state.js`) only together with a database reset.
- The server never trusts the client: every action that grants or moves value goes through an `act_*` function with `_rate` and position checks.
- Game text, comments, and commit messages in English. Replies to Pierre in English, simple, no internal jargon.

## Tests (all must pass before pushing)
- `node --test tests/*.test.mjs`
- `tests/sql/run.sh` (local Postgres 16; PGHOST, PGPORT, PGUSER variables)
- `node tests/navigateur.mjs` (Playwright + Chromium, solo mode)
- `npx prettier@3 --check "src/game/*.js" "src/*.js" "supabase/functions/_shared/*.js"`

## Deployment
- Pushing to `main` deploys the site (Vercel) and the `freeze` function (GitHub Actions).
- The database isn't deployed automatically: Pierre runs `supabase/installation.sql` in Supabase's SQL Editor.
- Never put a private key, a `service_role` key, or a secret in the repo. `src/config.js` only contains the URL and the public `anon` key.
