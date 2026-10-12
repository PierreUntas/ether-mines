-- One-off admin script: gives the "SpaceWolf" player a stack of every block/item, one of each
-- unique (nft) item, and a Gwei balance, on the real production database -- so late-game content
-- can be tested without grinding the early objectives. NOT a migration: not swept into
-- installation.sql by tools/installation.mjs (only supabase/migrations/*.sql is), not meant to be
-- replayed as part of deployment. Paste into Supabase's SQL Editor and run once, as the postgres
-- role (which bypasses RLS and the grants revoked from anon/authenticated on "_"-prefixed
-- functions) -- _give/_mint/_gwei take the target user id as an explicit argument, so this needs
-- no auth.uid() session context.
--
-- Check the world name first if in doubt: select distinct world from players;
-- (defaults to 'principal' -- src/game/14-startup.js falls back to it when the world field is left blank)
--
-- Safe to run more than once for the blocks/items/Gwei (just tops up another stack) -- but _mint
-- never dedupes, so re-running also mints a second set of the 8 unique items each time. Comment
-- out the nft_ids loop below before re-running if that's not what you want.

do $$
declare
  w text := 'principal';         -- set this if SpaceWolf's world isn't 'principal'
  nickname text := 'SpaceWolf';
  me uuid;
  it int;
  inv jsonb := '{}'::jsonb;
  -- every block id in rules.js's B, minus: water (11), bedrock (12), the lit lever (65, its off
  -- twin 64 is enough), the dark/old validator (73/74, world-placed-and-relit only, not meant to
  -- be held), and every non-base orientation of a rotated family (stairs, ladder, gates, doors) --
  -- same filtering as src/game/04-render.js's giveAll(), generated straight from rules.js so it
  -- can't drift from the real id list
  block_ids int[] := array[
    1,2,3,4,5,6,7,8,9,10,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,
    40,44,48,64,66,67,68,69,70,71,72,75,76,77,78,79,80,81,82,83,84,85,86,87,88,92,93,94,98,111,
    112,116,120,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,
    144,145
  ];
  -- fungible items (101-110): Ether Crystal, pickaxe/weapon/armor tiers, shards, Diamond Shard
  item_ids int[] := array[101,102,103,104,105,106,107,108,109,110];
  -- unique (nft) items (201-208): minted once each via _mint, never stacked in inventory --
  -- Crystal/Pure Ether Pickaxe, Validator Seal/Star, Genesis Titan Fang, Plasma Pistol,
  -- Titan Core Shard, Plasma Conduit Core
  nft_ids int[] := array[201,202,203,204,205,206,207,208];
begin
  select user_id into me from players where world = w and lower(name) = lower(nickname);
  if me is null then
    raise exception 'no player named % in world % -- check the nickname and world (select distinct world, name from players)', nickname, w;
  end if;
  perform _player(me, w); -- make sure the player row exists / is locked, same as every act_* does

  foreach it in array block_ids loop
    inv := _give(me, w, it, 64, inv);
  end loop;
  foreach it in array item_ids loop
    inv := _give(me, w, it, 64, inv);
  end loop;
  foreach it in array nft_ids loop
    perform _mint(me, w, it, 'admin grant');
  end loop;

  perform _gwei(me, w, 100000);

  raise notice 'done: % blocks/items granted, % nfts minted, +100000 gwei, for % in world %',
    array_length(block_ids, 1) + array_length(item_ids, 1), array_length(nft_ids, 1), nickname, w;
end $$;
