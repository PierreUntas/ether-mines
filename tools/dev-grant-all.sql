-- Dev utility: restocks ONE named test player with a full loadout — every tool/weapon/armor/resource,
-- every placeable block, one of every unique item (pickaxes, seals, trophies...), a ready-made
-- validator (no need to find a ruin), and plenty of Gwei. Lets you test the game without redoing every
-- step by hand.
--
-- Not a migration: never run automatically (not touched by tools/installation.mjs, tests/sql/run.sh,
-- or any client code). Paste into the Supabase SQL Editor yourself and run it whenever you want to
-- restock a test account. Safe to re-run. Edit "nickname"/"w" below first.

do $$
declare
  nickname text := 'Pierre';
  w        text := 'principal';
  uid      uuid;
  r        record;
  vid      bigint;
  u        jsonb;
begin
  select user_id into uid from players where world = w and lower(name) = lower(nickname);
  if uid is null then raise exception 'no player named % in world %', nickname, w; end if;

  -- every fungible item (tools, weapons, armor, resources)
  insert into inventory (user_id, world, item, n)
    select uid, w, id, 999 from rule_items where not uniq
    on conflict (user_id, world, item) do update set n = 999;

  -- every placeable block (the "item" side of rule_place — what you'd actually hold and place)
  insert into inventory (user_id, world, item, n)
    select uid, w, item, 999 from (select distinct item from rule_place) p
    on conflict (user_id, world, item) do update set n = 999;

  -- one of every unique item, if not already owned
  for r in select id from rule_items where uniq loop
    if not exists (select 1 from uniques where user_id = uid and world = w and item = r.id) then
      perform _mint(uid, w, r.id, 'test loadout');
    end if;
  end loop;

  -- a ready-made validator, far out of the way, already active — nothing to find or relight
  if not exists (select 1 from validators where world = w and owner = uid) then
    insert into validators (world, x, y, z, owner, owner_name, state, rarity, level,
        gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at, last_attested_at)
      values (w, 9000, 34, 9000, uid, nickname, 'active', 'legendary', 5, 300, 50, now(), now(), now())
      returning id into vid;
    u := _mint(uid, w, 203, '9000, 34, 9000');
    update uniques set validator_id = vid where user_id = uid and world = w and serial = (u ->> 'serial')::int;
  end if;

  -- plenty of Gwei (never lowers an existing balance)
  update players set gwei = greatest(gwei, 1000000) where user_id = uid and world = w;
end $$;
