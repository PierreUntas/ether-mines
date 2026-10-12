-- 030: the Merge Sanctum's twin bosses (mergeAt(), world.js; src/game/16-mobs.js). The client reports
-- one 'merge_twins' kill when both twins fall together; it pays like the other bosses: a guaranteed
-- unique (209, the Merge Aegis armor) and an independent ~20% bonus keepsake (210), sharing the
-- loot_boss rate limit with the Titan and the Plasma Core. The rest of act_loot_mob is 027's, unchanged.
-- The story chapter that goes with it (chapter 5, "The Merge") is paid by act_claim_chapter, proof: 209.
-- Requires 001_schema.sql, 002_security.sql, 024_loot_tiers.sql, 027_network_attack.sql, 029_chapters.sql.
-- Replayable without error.

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb; cid smallint; g int; bonus jsonb; aw record;
begin
  -- 030: the Merge twins, reported once, when both fall together — a guaranteed Merge Aegis, ~20% a bonus
  if mob_type = 'merge_twins' then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    u := _mint(me, w, 209, null);
    if random() < 0.2 then bonus := _mint(me, w, 210, null); end if;
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus);
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
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus);
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

-- chapter 5, The Merge: 600 Gwei and the Merge Keeper title, against the Merge Aegis
create or replace function public._core_claim_chapter(w text, chapter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid smallint; g int; proof boolean; nv int;
begin
  perform _player(me, w);
  select v.cid, v.g into cid, g from (values
    ('genesis', 15::smallint, 50), ('forge', 16::smallint, 100), ('awakening', 17::smallint, 200),
    ('network', 18::smallint, 400), ('circuits', 19::smallint, 100), ('merge', 20::smallint, 600)) v(id, cid, g) where v.id = chapter;
  if cid is null then return _no('unknown chapter'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = cid) then
    return _no('already claimed');
  end if;
  select count(*) into nv from validators where world = w and owner = me;
  proof := case chapter
    -- a pickaxe of any tier: the chapter's tools were crafted
    when 'genesis' then exists (select 1 from inventory where user_id = me and world = w and item = 102 and n > 0)
                     or exists (select 1 from uniques where user_id = me and world = w and item in (201, 202))
    -- the pure ether pickaxe: the forge's last tool
    when 'forge' then exists (select 1 from uniques where user_id = me and world = w and item = 202)
    -- a validator relit (or placed) under your name
    when 'awakening' then nv >= 1
    -- three validators, both boss trophies, and a kill during a network attack
    when 'network' then nv >= 3
                     and exists (select 1 from uniques where user_id = me and world = w and item = 205)
                     and exists (select 1 from uniques where user_id = me and world = w and item = 206)
                     and exists (select 1 from network_events where world = w and participants ? me::text)
    -- the Merge Aegis: both twins brought down together (030)
    when 'merge' then exists (select 1 from uniques where user_id = me and world = w and item = 209)
    -- an AND, an OR and a NOT gate standing in the world, placed by you
    when 'circuits' then (select count(distinct (id - 112) / 4) from blocks
                          where world = w and placed_by = me::text and id between 112 and 123) = 3
  end;
  if not proof then return _no('chapter not finished'); end if;
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, cid);
  perform _gwei(me, w, g);
  return jsonb_build_object('ok', true, 'cosmetic', cid, 'gwei', g, 'total_gwei', _gwei_balance(me, w));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
