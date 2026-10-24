-- 049: the surface's own mobs, one per biome (src/mobs-core.js MK, spawnChunk): the Gas Scorpion of the dunes,
-- the Phishing Spider of the forests, the Pump Slime of the plains and the Cold Wallet Yeti of the snowy peaks.
-- Their loot joins the common table of _loot_mob; everything else is 041's, unchanged (the function is
-- replaced whole). Requires 041_game_server.sql. Replayable without error.

-- the loot of a kill, for one player (check_pos: their reported position must match the one on record)
create or replace function public._loot_mob(me uuid, w text, mob_type text, ex real, ey real, ez real, check_pos boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; it int; inv jsonb := '{}'; r real; u jsonb; cid smallint; g int; bonus jsonb; aw record; sh int;
begin
  -- 030: the Merge twins, reported once, when both fall together — a guaranteed Merge Aegis, ~20% a bonus
  if mob_type = 'merge_twins' then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    if check_pos then e := _check_pos(me, w, ex, ey, ez); end if;
    if e is not null then return _no(e); end if;
    u := _mint(me, w, 209, null);
    if random() < 0.2 then bonus := _mint(me, w, 210, null); end if;
    sh := 2;                                                    -- 037: two Diamond Shards, both twins down
    inv := _give(me, w, 110, sh, inv);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus, 'shards', sh);
  end if;
  -- 039: the Front-Runner, the Mempool's boss: guaranteed Front-Runner Boots, ~20% a Flashbots Bundle,
  -- two Diamond Shards; the same loot_boss rate limit as every other boss
  if mob_type = 'front_runner' then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    if check_pos then e := _check_pos(me, w, ex, ey, ez); end if;
    if e is not null then return _no(e); end if;
    u := _mint(me, w, 211, null);
    if random() < 0.2 then bonus := _mint(me, w, 212, null); end if;
    sh := 2;
    inv := _give(me, w, 110, sh, inv);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u, 'bonus', bonus, 'shards', sh);
  end if;
  if mob_type = 'corrupted_node' then
    if not _rate(me, 'attack_node', 0.3, 6) then return _no('too many actions'); end if;
    if check_pos then e := _check_pos(me, w, ex, ey, ez); end if;
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
    if check_pos then e := _check_pos(me, w, ex, ey, ez); end if;
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
  if check_pos then e := _check_pos(me, w, ex, ey, ez); end if;
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
    when 'mev_bot' then case when r < 0.5 then 101 end                -- 039: the Front-Runner's Sandwich Bots
    when 'gas_scorpion' then case when r < 0.35 then 101 when r < 0.5 then 103 end  -- 049: the surface's biome mobs
    when 'phish_spider' then case when r < 0.45 then 101 end
    when 'pump_slime' then case when r < 0.55 then 101 end
    when 'yeti' then case when r < 0.3 then 103 when r < 0.55 then 104 end
    else null
  end;
  if it is null then return jsonb_build_object('ok', true, 'inv', inv); end if;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;

revoke all on function public._loot_mob(uuid, text, text, real, real, real, boolean) from public, anon, authenticated;
