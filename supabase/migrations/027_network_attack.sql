-- 027: the network attack event. Every real-world hour, for its first 10 minutes, a wave of corrupted
-- nodes converges on the Atrium (SPAWN, 8/8) — src/game/16-mobs.js spawns them client-side the same
-- deterministic way every other mob already works (no server presence, no realtime: every client
-- independently computes the same wall-clock window). Only kills are reported here, the same bounded,
-- rate-limited, position-checked trust act_loot_mob already extends to every other mob type.
-- Requires 001_schema.sql, 002_security.sql, 007_network.sql, 013_mob_loot.sql..018_more_mob_loot.sql,
-- 019_gwei_currency.sql, 022_cosmetics.sql, 024_loot_tiers.sql, 026_boss_bonus_trophies.sql.
-- Replayable without error.

-- Pure function of a timestamp (defaults to now()): which hourly window it falls in, whether that
-- window is still in its first 10 minutes, and when it closes. Parameterized so tests can assert both
-- sides of the boundary with a fixed timestamp instead of depending on whatever time the suite runs at.
create or replace function public._attack_window(ts timestamptz default now())
returns table(window_id bigint, active boolean, ends_at timestamptz)
language sql immutable as $$
  select floor(extract(epoch from ts) / 3600)::bigint,
         (extract(epoch from ts)::bigint % 3600) < 600,
         to_timestamp(floor(extract(epoch from ts) / 3600)::bigint * 3600 + 600)
$$;

create table if not exists public.network_events (
  world        text    not null,
  window_id    bigint  not null,
  kills        int     not null default 0,
  participants jsonb   not null default '{}', -- {user_id: kill_count}, read once at resolution to pay out
  resolved     boolean not null default false,
  primary key (world, window_id)
);
alter table public.network_events enable row level security; -- no policy: functions only

create table if not exists public.network_score (
  world              text primary key,
  score              int    not null default 0, -- running total, never resets; drives the diamond's tier
  last_resolved_window bigint not null default 0
);
alter table public.network_score enable row level security;
drop policy if exists "read network_score" on public.network_score;
create policy "read network_score" on public.network_score for select using (true); -- world-wide score, visible like blocks/claims

-- Resolves every closed window since the last one checked, including windows nobody touched at all (no
-- network_events row — "no punishment for nobody's timezone," a small score tick happens either way).
-- Capped at the last 24 windows, same spirit as _tick_validator's 24h catch-up cap. Below the 20-kill
-- threshold (including 0): +1 score, no individual payout. At or above it: +10 score, and every
-- contributor gets 50 Gwei plus, the first time ever, the defenders' cosmetic.
create or replace function public._resolve_attack_windows(w text) returns void
language plpgsql security definer set search_path = public as $$
declare cur bigint; from_w bigint; wid bigint; ev network_events; uid text; cid smallint;
begin
  select (_attack_window()).window_id into cur;
  insert into network_score (world) values (w) on conflict do nothing;
  select last_resolved_window into from_w from network_score where world = w for update;
  from_w := greatest(from_w, cur - 24);
  for wid in from_w + 1 .. cur - 1 loop
    select * into ev from network_events where world = w and window_id = wid;
    if found and not ev.resolved then
      if ev.kills >= 20 then
        update network_score set score = score + 10 where world = w;
        for uid in select jsonb_object_keys(ev.participants) loop
          perform _gwei(uid::uuid, w, 50);
          select id into cid from rule_cosmetics where category = 'event' limit 1;
          if cid is not null then
            insert into cosmetics_owned (user_id, world, cosmetic_id) values (uid::uuid, w, cid) on conflict do nothing;
          end if;
        end loop;
      else
        update network_score set score = score + 1 where world = w;
      end if;
      update network_events set resolved = true where world = w and window_id = wid;
    elsif not found then
      update network_score set score = score + 1 where world = w;
    end if;
  end loop;
  update network_score set last_resolved_window = cur - 1 where world = w and cur - 1 > last_resolved_window;
end $$;

create or replace function public.act_network(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); total int; top jsonb; aw record; sc int; kl int;
begin
  if not _rate(me, 'network', 0.2, 5) then return _no('too many actions'); end if;
  perform _resolve_attack_windows(w);
  select count(*) into total from blocks where world = w and id = 74;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.c) order by t.c desc, t.name), '[]'::jsonb) into top
    from (select coalesce(max(placed_name), 'anonymous') as name, count(*) as c from blocks
           where world = w and id = 74 group by placed_by order by count(*) desc limit 5) t;
  select * into aw from _attack_window();
  select score into sc from network_score where world = w;
  select kills into kl from network_events where world = w and window_id = aw.window_id;
  return jsonb_build_object('ok', true, 'n', total, 'top', top, 'attack', jsonb_build_object(
    'window_id', aw.window_id, 'active', aw.active, 'ends_at', aw.ends_at,
    'kills', coalesce(kl, 0), 'score', coalesce(sc, 0)));
end $$;

-- corrupted nodes: only during the attack window, only near the Atrium. Its own rate-limit bucket
-- ('attack_node') so grinding the event can't be throttled by, or used to bypass, regular mob loot.
create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb; cid smallint; g int; bonus jsonb; aw record;
begin
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

-- event cosmetics (same shape as combat ones, 024_loot_tiers.sql): never for sale either.
create or replace function public._core_buy_cosmetic(w text, cid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc rule_cosmetics; inv jsonb := '{}';
begin
  perform _player(me, w);
  select * into rc from rule_cosmetics where id = cid;
  if not found then return _no('unknown cosmetic'); end if;
  if rc.category in ('combat', 'event') then return _no('not for sale'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = rc.id) then
    return _no('already owned');
  end if;
  if _gwei_balance(me, w) < rc.price then return _no('not enough gwei', jsonb_build_object('need', rc.price)); end if;
  perform _gwei(me, w, -rc.price);
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, rc.id);
  if rc.grant_item is not null then inv := _give(me, w, rc.grant_item, coalesce(rc.grant_qty, 1), inv); end if;
  return jsonb_build_object('ok', true, 'cosmetic', rc.id, 'inv', inv, 'gwei', _gwei_balance(me, w));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
