-- 021: the validator production loop. A cycle is 5 minutes; a validator attested (act_maintain_validator)
-- within the last two cycles keeps producing at full rate, net of its upkeep (gwei_per_cycle -
-- maintenance_cost). Left unattended, cycles are "missed": no Gwei, and after 3/8 missed cycles the
-- validator degrades active -> damaged -> corrupted (corrupted needs a Validator Heart to repair).
-- Ticking is lazy (like the old rewards_at), never a background job: settled on attest and on the
-- periodic "collect all" (act_rewards, now paying Gwei instead of Ether Crystal).
-- Requires 001_schema.sql, 002_security.sql, 019_gwei_currency.sql, 020_validators.sql. Replayable without error.

create or replace function public._tick_validator(w text, vid bigint) returns validators
language plpgsql security definer set search_path = public as $$
declare v validators; cycles int; maintained boolean; net int;
begin
  select * into v from validators where id = vid and world = w for update;
  if not found or v.state = 'dormant' or v.owner is null or v.last_cycle_at is null then return v; end if;
  cycles := floor(least(extract(epoch from now() - v.last_cycle_at), 86400) / 300)::int; -- 24h catch-up cap, 300s = 1 cycle
  if cycles <= 0 then return v; end if;
  -- maintained = attested within the last two cycles, counting back from now (not from last_cycle_at,
  -- which would let one attestation count as "maintained" forever if nobody ever ticks again)
  maintained := v.last_attested_at is not null and v.last_attested_at >= now() - interval '600 seconds';
  if maintained then
    net := greatest(v.gwei_per_cycle - v.maintenance_cost, 0) * cycles;
    if net > 0 then perform _gwei(v.owner, w, net); end if;
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300), missed_cycles = 0
      where id = vid returning * into v;
  else
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300),
      missed_cycles = missed_cycles + cycles,
      state = case when missed_cycles + cycles >= 8 then 'corrupted' when missed_cycles + cycles >= 3 then 'damaged' else state end
      where id = vid returning * into v;
  end if;
  return v;
end $$;

-- Attest: settles any catch-up, then resets the clock. Free from "damaged"; from "corrupted" it costs
-- a Validator Heart (item 105), the same resource a fresh reanimation needs.
create or replace function public._core_maintain_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v validators; inv jsonb := '{}';
begin
  perform _player(me, w);
  select * into v from validators where id = validator_id and world = w;
  if not found then return _no('unknown validator'); end if;
  if v.owner <> me then return _no('not your validator'); end if;
  if v.state = 'dormant' then return _no('this validator is dormant: reanimate it first'); end if;
  v := _tick_validator(w, validator_id);
  if v.state = 'corrupted' then
    if _count(me, w, 105) < 1 then return _no('corrupted: needs a validator heart to repair'); end if;
    inv := _give(me, w, 105, -1, inv);
  end if;
  update validators set state = 'active', missed_cycles = 0, last_attested_at = now() where id = validator_id returning * into v;
  return jsonb_build_object('ok', true, 'inv', inv, 'validator', row_to_json(v), 'gwei', _gwei_balance(me, w));
end $$;

create or replace function public.act_maintain_validator(w text, validator_id bigint, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; v validators;
begin
  if not _rate(me, 'maintain_validator', 0.3, 3) then return _no('too many actions'); end if;
  select * into v from validators where id = validator_id and world = w;
  if not found then return _no('unknown validator'); end if;
  e := _check_pos(me, w, ex, ey, ez, v.x, v.y, v.z);
  if e is not null then return _no(e); end if;
  return _core_maintain_validator(w, validator_id);
end $$;

-- Upgrade: 50 * current level Gwei, caps at level 10, refuses while corrupted (repair first).
create or replace function public._core_upgrade_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v validators; cost bigint; stats jsonb;
begin
  perform _player(me, w);
  select * into v from validators where id = validator_id and world = w;
  if not found then return _no('unknown validator'); end if;
  if v.owner <> me then return _no('not your validator'); end if;
  if v.state = 'dormant' then return _no('this validator is dormant: reanimate it first'); end if;
  if v.state = 'corrupted' then return _no('repair it first'); end if;
  if v.level >= 10 then return _no('already at maximum level'); end if;
  cost := 50 * v.level;
  if _gwei_balance(me, w) < cost then return _no('not enough gwei', jsonb_build_object('need', cost)); end if;
  stats := _validator_stats(v.rarity, v.level + 1);
  perform _gwei(me, w, -cost);
  update validators set level = v.level + 1, gwei_per_cycle = (stats ->> 'gwei_per_cycle')::int,
      maintenance_cost = (stats ->> 'maintenance_cost')::int
    where id = validator_id returning * into v;
  return jsonb_build_object('ok', true, 'validator', row_to_json(v), 'gwei', _gwei_balance(me, w), 'cost', cost);
end $$;

create or replace function public.act_upgrade_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'upgrade_validator', 0.2, 2) then return _no('too many actions'); end if;
  return _core_upgrade_validator(w, validator_id);
end $$;

-- One-time catch-up for validators placed/relit before this pivot: 020_validators.sql deliberately
-- didn't backfill them, so a block 13 or 74 the caller signed (placed_by) with no row yet needs this
-- to join the new system — same resource cost as a fresh reanimation (a crafted validator is common
-- rarity only; a relit one still rolls its rarity and mints a fresh seal).
create or replace function public._core_attune_validator(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; inv jsonb := '{}'; rarity text; stats jsonb; vid bigint; u jsonb;
begin
  pl := _player(me, w);
  cur := _cell(w, px, py, pz);
  if cur not in (13, 74) then return _no('not a validator', jsonb_build_object('cell', cur)); end if;
  if (select placed_by from blocks where world = w and x = px and y = py and z = pz) <> me::text then
    return _no('not your validator');
  end if;
  if exists (select 1 from validators where world = w and x = px and y = py and z = pz) then
    return _no('already attuned');
  end if;
  if cur = 74 then
    if _count(me, w, 105) < 1 then return _no('needs a validator heart'); end if;
    inv := _give(me, w, 105, -1, inv);
    rarity := _pick_rarity();
  else
    if _count(me, w, 101) < 2 then return _no('needs 2 ether crystals'); end if;
    inv := _give(me, w, 101, -2, inv);
    rarity := 'common';
  end if;
  stats := _validator_stats(rarity, 1);
  insert into validators (world, x, y, z, owner, owner_name, state, rarity, level, gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at)
    values (w, px, py, pz, me, pl.name, 'active', rarity, 1, (stats ->> 'gwei_per_cycle')::int, (stats ->> 'maintenance_cost')::int, now(), now())
    returning id into vid;
  if cur = 74 then
    u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
    update uniques set validator_id = vid where user_id = me and world = w and serial = (u ->> 'serial')::int;
  end if;
  return jsonb_build_object('ok', true, 'inv', inv, 'validator', vid, 'unique', u);
end $$;

create or replace function public.act_attune_validator(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'attune_validator', 0.3, 3) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e); end if;
  return _core_attune_validator(w, px, py, pz);
end $$;

-- "Collect all": ticks every validator the caller owns and reports the total Gwei gained. act_rewards
-- keeps its name, rate limit, and client call site (it used to pay Ether Crystal); only the body changes.
create or replace function public._core_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; before bigint; after bigint; n int := 0; vid bigint;
begin
  pl := _player(me, w);
  before := pl.gwei;
  for vid in select id from validators where world = w and owner = me and state <> 'dormant' loop
    perform _tick_validator(w, vid);
    n := n + 1;
  end loop;
  select gwei into after from players where user_id = me and world = w;
  return jsonb_build_object('ok', true, 'inv', '{}'::jsonb, 'gwei', after, 'gained', after - before, 'n', n);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
