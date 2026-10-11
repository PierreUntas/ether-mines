-- Dev utility: restocks ONE named test player with a full loadout — every tool/weapon/armor/resource,
-- every placeable block, one of every unique item (pickaxes, seals, trophies...), a ready-made
-- validator (no need to find a ruin), and plenty of Gwei. Lets you test the game without redoing every
-- step by hand. Also drags every validator you already own (relit for real, or placed from a crafted
-- block — each is its own validator, at its own position) to right where you are, so Attest/Upgrade
-- never refuse "out of reach": real validators stay wherever you last relit/placed them otherwise, often
-- far from each other and from you.
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
  vx       int;
  vy       int;
  vz       int;
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

  select round(pos_x)::int, round(pos_y)::int, round(pos_z)::int into vx, vy, vz from players where user_id = uid and world = w;
  if vx is null then
    raise notice 'skipped validators: % has no known position yet — play a few seconds, then re-run', nickname;
  else
    -- a ready-made validator, already active — only the first time, so re-running doesn't keep adding more
    if not exists (select 1 from validators where world = w and owner = uid) then
      insert into validators (world, x, y, z, owner, owner_name, state, rarity, level,
          gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at, last_attested_at)
        values (w, vx, vy, vz, uid, nickname, 'active', 'legendary', 5, 300, 50, now(), now(), now())
        returning id into vid;
      u := _mint(uid, w, 203, vx || ', ' || vy || ', ' || vz);
      update uniques set validator_id = vid where user_id = uid and world = w and serial = (u ->> 'serial')::int;
    end if;

    -- every validator you own, wherever it actually is (relit for real, or placed from a crafted
    -- block), dragged next to your current position so none of them refuse "out of reach" anymore.
    -- Spread on a small grid (not all stacked on the same cell: world+x+y+z is unique).
    with numbered as (
      select id, (row_number() over (order by id) - 1)::int as rn from validators where world = w and owner = uid
    )
    update validators v set x = vx + (n.rn % 3) - 1, y = vy, z = vz + (n.rn / 3)
    from numbered n where v.id = n.id;
  end if;

  -- plenty of Gwei (never lowers an existing balance)
  update players set gwei = greatest(gwei, 1000000) where user_id = uid and world = w;
end $$;
