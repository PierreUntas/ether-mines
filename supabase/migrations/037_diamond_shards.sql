-- 037: Diamond Shards (#110) within reach from the start. Until now they only came from relighting a
-- validator once 100 were lit in the world (014, 020), so on a fresh world the Radiant Diamond and the
-- Genesis Blade and Plating (4 shards each) were out of reach for weeks. Now also: every boss kill (the
-- Titan and the Plasma Core 1 or 2, the Merge twins 2) and every tower's treasure chest (1). The relight
-- source stays, for the late game. act_loot_mob is 030's with only the boss branches extended.
-- Requires 025_tower_treasure.sql, 030_merge_twins.sql. Replayable without error.

create or replace function public._seed_tower_chest(w text, px int, py int, pz int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from chests where world = w and x = px and y = py and z = pz) then return; end if;
  if exists (select 1 from blocks where world = w and x = px and y = py and z = pz) then return; end if;
  insert into chests (world, x, y, z, items) values (w, px, py, pz,
    jsonb_build_object('101', 15 + floor(random() * 11)::int, '103', 4 + floor(random() * 5)::int, '110', 1) -- + a Diamond Shard
      || case when random() < 0.5 then jsonb_build_object('104', 1) else '{}'::jsonb end)
    on conflict do nothing;
end $$;

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb; cid smallint; g int; bonus jsonb; aw record; sh int;
begin
  -- 030: the Merge twins, reported once, when both fall together — a guaranteed Merge Aegis, ~20% a bonus
  if mob_type = 'merge_twins' then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    u := _mint(me, w, 209, null);
    if random() < 0.2 then bonus := _mint(me, w, 210, null); end if;
    sh := 2;                                                    -- 037: two Diamond Shards, both twins down
    inv := _give(me, w, 110, sh, inv);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus, 'shards', sh);
  end if;
  if mob_type = 'corrupted_node' then
    if not _rate(me, 'attack_node', 0.3, 6) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    if sqrt((ex - 8) ^ 2 + (ez - 8) ^ 2) > 30 then return _no('too far from the Atrium'); end if;
    select * into aw from _attack_window();
    if not aw.active then return _no('no attack right now'); end if;
    insert into network_events (world, window_id, kills, participants) values (w, aw.window_id, 1, jsonb_build_object(me::text, 1))
      on conflict (world, window_id) do update set kills = network_events.kills + 1,
        participants = network_events.participants || jsonb_build_object(me::text, coalesce((network_events.participants ->> me::text)::int, 0) + 1);
    r := random();
    if r < 0.08 then
      select id into cid from rule_cosmetics where category = 'event'
        and id not in (select cosmetic_id from cosmetics_owned where user_id = me and world = w) order by random() limit 1;
      if cid is not null then
        insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, cid);
        return jsonb_build_object('ok', true, 'inv', inv, 'cosmetic', cid);
      end if;
    elsif r < 0.33 then
      g := 10 + floor(random() * 41)::int;
      perform _gwei(me, w, g);
      return jsonb_build_object('ok', true, 'inv', inv, 'gwei', g, 'total_gwei', _gwei_balance(me, w));
    end if;
    inv := _give(me, w, 101, 1 + floor(random() * 2)::int, inv); -- no whiffed kills during the event: a guaranteed small bundle
    return jsonb_build_object('ok', true, 'inv', inv);
  end if;
  if mob_type in ('titan', 'plasma_core') then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    u := _mint(me, w, case when mob_type = 'titan' then 205 else 206 end, null);
    if random() < 0.2 then
      bonus := _mint(me, w, case when mob_type = 'titan' then 207 else 208 end, null);
    end if;
    sh := 1 + floor(random() * 2)::int;                         -- 037: one or two Diamond Shards
    inv := _give(me, w, 110, sh, inv);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus, 'shards', sh);
  end if;
  if not _rate(me, 'loot_mob', 0.2, 5) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  -- epic (~3%): a combat-exclusive cosmetic the player doesn't already own; falls through to the
  -- common table once every combat cosmetic is collected. rare (~12%): a small Gwei bonus.
  r := random();
  if r < 0.03 then
    select id into cid from rule_cosmetics where category = 'combat'
      and id not in (select cosmetic_id from cosmetics_owned where user_id = me and world = w)
      order by random() limit 1;
    if cid is not null then
      insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, cid);
      return jsonb_build_object('ok', true, 'inv', inv, 'cosmetic', cid);
    end if;
  elsif r < 0.15 then
    g := 10 + floor(random() * 41)::int; -- 10..50
    perform _gwei(me, w, g);
    return jsonb_build_object('ok', true, 'inv', inv, 'gwei', g, 'total_gwei', _gwei_balance(me, w));
  end if;
  -- common (unchanged): the existing per-mob-type resource chance, its own independent roll
  r := random();
  it := case mob_type
    when 'shadow' then case when r < 0.5 then 101 end
    when 'guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'sentinel' then case when r < 0.4 then 103 end
    when 'wraith' then case when r < 0.25 then 104 when r < 0.65 then 103 end
    when 'warden' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'garden_guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'prowler' then case when r < 0.5 then 101 end
    when 'sky_raider' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'water_lurker' then case when r < 0.25 then 103 when r < 0.5 then 104 end
    when 'bat' then case when r < 0.45 then 101 end
    when 'crawler' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'golem' then case when r < 0.3 then 103 when r < 0.55 then 104 end
    else null
  end;
  if it is null then return jsonb_build_object('ok', true, 'inv', inv); end if;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;


do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
