-- 021: the validator production loop. A cycle is 5 minutes; a validator attested (act_maintain_validator)
-- within the last 24 hours keeps producing at full rate, net of its upkeep (gwei_per_cycle -
-- maintenance_cost) — a daily check-in is enough, no penalty for a normal day or two away: a real
-- validator keeps running whether or not its operator is watching. Left unattended past that, cycles are
-- "missed": no Gwei, and after 3/8 missed cycles the validator degrades active -> damaged -> corrupted
-- (corrupted needs a Validator Heart to repair). Ticking is lazy (like the old rewards_at), never a
-- background job: settled on attest and on the periodic "collect all" (act_rewards, now paying Gwei
-- instead of Ether Crystal). Attesting has no reach check, unlike mining/placing/relighting: a real
-- Ethereum validator attests over the network, not by being physically near anything, so the fiction
-- holds up fine without it — and it would otherwise force a player with validators scattered around the
-- world back to each one just to keep them running.
-- Requires 001_schema.sql, 002_security.sql, 019_gwei_currency.sql, 020_validators.sql. Replayable without error.

create or replace function public._tick_validator(w text, vid bigint) returns validators
language plpgsql security definer set search_path = public as $$
declare v validators; cycles int; maintained boolean; net int;
begin
  select * into v from validators where id = vid and world = w for update;
  if not found or v.state = 'dormant' or v.owner is null or v.last_cycle_at is null then return v; end if;
  cycles := floor(least(extract(epoch from now() - v.last_cycle_at), 86400) / 300)::int; -- 24h catch-up cap, 300s = 1 cycle
  if cycles <= 0 then return v; end if;
  -- maintained = attested within the last 24h, counting back from now (not from last_cycle_at, which
  -- would let one attestation count as "maintained" forever if nobody ever ticks again); matches the
  -- 24h catch-up cap above, so a daily visit always arrives fully maintained
  maintained := v.last_attested_at is not null and v.last_attested_at >= now() - interval '24 hours';
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

-- The 5-argument version (ex/ey/ez for a reach check) predates this: CREATE OR REPLACE can't change a
-- function's parameter list, so the old overload needs dropping explicitly or it lingers alongside this one.
drop function if exists public.act_maintain_validator(text, bigint, real, real, real);
create or replace function public.act_maintain_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'maintain_validator', 0.3, 3) then return _no('too many actions'); end if;
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
