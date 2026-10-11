-- 025: a treasure chest atop every tower (world.js GEN 19), seeded with better-than-average loot the
-- first time it's opened. Distinguishing a tower's chest from a player-placed one: the tower's comes
-- straight from the generator, so it has no blocks override row for that cell — a player-placed chest
-- always does (act_place writes one). Requires 001_schema.sql, 002_security.sql, 004_chests.sql.
-- Replayable without error.

create or replace function public._seed_tower_chest(w text, px int, py int, pz int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from chests where world = w and x = px and y = py and z = pz) then return; end if;
  if exists (select 1 from blocks where world = w and x = px and y = py and z = pz) then return; end if;
  insert into chests (world, x, y, z, items) values (w, px, py, pz,
    jsonb_build_object('101', 15 + floor(random() * 11)::int, '103', 4 + floor(random() * 5)::int) -- 15-25 crystals, 4-8 pure shards
      || case when random() < 0.5 then jsonb_build_object('104', 1) else '{}'::jsonb end)           -- 50% bonus genesis fragment
    on conflict do nothing;
end $$;

create or replace function public.act_chest(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
begin
  if e is not null then return _no(e); end if;
  perform _seed_tower_chest(w, px, py, pz);
  return jsonb_build_object('ok', true, 'items',
    coalesce((select items from chests where world = w and x = px and y = py and z = pz), '{}'::jsonb));
end $$;

create or replace function public.act_chest_move(w text, px int, py int, pz int, item int, n int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
        cur jsonb; have int; inv jsonb := '{}'::jsonb;
begin
  if e is not null then return _no(e); end if;
  if n = 0 or abs(n) > 10000 then return _no('invalid quantity'); end if;
  perform _seed_tower_chest(w, px, py, pz);
  insert into chests (world, x, y, z) values (w, px, py, pz) on conflict do nothing;
  select items into cur from chests where world = w and x = px and y = py and z = pz for update;
  if cur is null or _cell(w, px, py, pz) <> 98 then return _no('no chest here'); end if;
  have := coalesce((cur ->> item::text)::int, 0);
  if n > 0 then
    if _count(me, w, item) < n then return _no('not enough in your bag'); end if;
    if have = 0 and (select count(*) from jsonb_object_keys(cur)) >= 27 then return _no('chest full'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := cur || jsonb_build_object(item::text, have + n);
  else
    n := greatest(n, -have);
    if n = 0 then return _no('none of that item in the chest'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := case when have + n = 0 then cur - item::text else cur || jsonb_build_object(item::text, have + n) end;
  end if;
  update chests set items = cur where world = w and x = px and y = py and z = pz;
  return jsonb_build_object('ok', true, 'items', cur, 'inv', inv);
end $$;
