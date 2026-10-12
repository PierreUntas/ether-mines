-- 030: validator pools (mini-guilds). Players pool their validators into a shared, informal group —
-- the real-world staking-pool metaphor, played. Once the pool's combined net production crosses a
-- threshold, every member's own validators earn a percentage bonus on top of their own production.
-- One pool per player, open join (no invite flow), capped membership: "groupes informels," not a
-- full guild system (no ranks, no chat channel). Plugs into the existing lazy-tick production loop
-- at exactly one point (_tick_validator's own net-Gwei line) -- no new background job, no cache.
-- Requires 001_schema.sql, 002_security.sql, 019_gwei_currency.sql, 020_validators.sql,
-- 021_gwei_cycle_and_maintenance.sql. Replayable without error.

create table if not exists public.validator_pools (
  id         bigserial   primary key,
  world      text        not null,
  name       text        not null,
  owner      uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- a function index (not a plain table constraint: lower(name) can't be a UNIQUE column list entry)
create unique index if not exists validator_pools_name on public.validator_pools (world, lower(name));
alter table public.validator_pools enable row level security;
drop policy if exists "read pools" on public.validator_pools;
create policy "read pools" on public.validator_pools for select using (true);

create table if not exists public.pool_members (
  pool_id   bigint      not null references public.validator_pools (id) on delete cascade,
  world     text        not null,
  user_id   uuid        not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
-- one pool per player at a time: keeps this "informal groups," not overlapping-membership guilds
create unique index if not exists pool_members_one_per_player on public.pool_members (world, user_id);
alter table public.pool_members enable row level security;
drop policy if exists "read pool members" on public.pool_members;
create policy "read pool members" on public.pool_members for select using (true);

-- A pool of 8 stays "a few friends you pooled validators with," not "the whole server."
create or replace function public._max_pool_members() returns int language sql immutable as $$ select 8 $$;

-- The pool's current combined net production (sum of every active member validator's own
-- gwei_per_cycle - maintenance_cost), and the bonus multiplier that production level unlocks.
-- Live join, no caching -- at the expected scale (a handful of concurrent players, a few validators
-- each) this is cheap, the same "just query it" philosophy _gwei_balance already uses.
create or replace function public._pool_production(w text, pid bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(v.gwei_per_cycle - v.maintenance_cost, 0)), 0)::int
  from pool_members pm join validators v on v.world = pm.world and v.owner = pm.user_id and v.state = 'active'
  where pm.world = w and pm.pool_id = pid
$$;
create or replace function public._pool_bonus_for(production int) returns numeric
language sql immutable as $$
  select case when production >= 1000 then 1.20 when production >= 450 then 1.15
    when production >= 180 then 1.10 when production >= 60 then 1.05 else 1.0 end
$$;
-- The multiplier _tick_validator applies for a given validator owner: 1.0 if they're in no pool.
create or replace function public._pool_bonus(w text, uid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select _pool_bonus_for(_pool_production(w, pm.pool_id)) from pool_members pm where pm.world = w and pm.user_id = uid),
    1.0
  )
$$;

-- The production tick now pays the pool bonus on top of each validator's own net production -- the
-- one change to this function; every existing caller (act_maintain_validator, act_upgrade_validator,
-- act_rewards) needs no change, same name/signature/call sites.
create or replace function public._tick_validator(w text, vid bigint) returns validators
language plpgsql security definer set search_path = public as $$
declare v validators; cycles int; maintained boolean; net int;
begin
  select * into v from validators where id = vid and world = w for update;
  if not found or v.state = 'dormant' or v.owner is null or v.last_cycle_at is null then return v; end if;
  cycles := floor(least(extract(epoch from now() - v.last_cycle_at), 86400) / 300)::int; -- 24h catch-up cap, 300s = 1 cycle
  if cycles <= 0 then return v; end if;
  net := greatest(v.gwei_per_cycle - v.maintenance_cost, 0) * cycles;
  net := floor(net * _pool_bonus(w, v.owner))::int;
  if net > 0 then perform _gwei(v.owner, w, net); end if;
  maintained := v.last_attested_at is not null and v.last_attested_at >= now() - interval '24 hours';
  if maintained then
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

create or replace function public._core_create_pool(w text, pool_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); clean text; pid bigint;
begin
  perform _player(me, w);
  if exists (select 1 from pool_members where world = w and user_id = me) then return _no('already in a pool'); end if;
  clean := nullif(left(btrim(regexp_replace(coalesce(pool_name, ''), '[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]', '', 'g')), 24), '');
  if clean is null then return _no('invalid pool name'); end if;
  if exists (select 1 from validator_pools where world = w and lower(name) = lower(clean)) then return _no('name already taken'); end if;
  insert into validator_pools (world, name, owner) values (w, clean, me) returning id into pid;
  insert into pool_members (pool_id, world, user_id) values (pid, w, me);
  return jsonb_build_object('ok', true, 'pool_id', pid, 'name', clean);
end $$;
create or replace function public.act_create_pool(w text, pool_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'pool', 0.05, 2) then return _no('too many actions'); end if;
  return _core_create_pool(w, pool_name);
end $$;

create or replace function public._core_join_pool(w text, target_pool bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  perform _player(me, w);
  if exists (select 1 from pool_members where world = w and user_id = me) then return _no('already in a pool'); end if;
  if not exists (select 1 from validator_pools where id = target_pool and world = w) then return _no('unknown pool'); end if;
  select count(*) into n from pool_members where world = w and pool_id = target_pool;
  if n >= _max_pool_members() then return _no('pool is full'); end if;
  insert into pool_members (pool_id, world, user_id) values (target_pool, w, me);
  return jsonb_build_object('ok', true, 'pool_id', target_pool);
end $$;
create or replace function public.act_join_pool(w text, target_pool bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'pool', 0.05, 2) then return _no('too many actions'); end if;
  return _core_join_pool(w, target_pool);
end $$;

-- Leaving reassigns ownership to the longest-standing remaining member, or deletes the now-empty
-- pool if the leaver was the last one in it.
create or replace function public._core_leave_pool(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pid bigint; next_owner uuid;
begin
  perform _player(me, w);
  select pool_id into pid from pool_members where world = w and user_id = me;
  if pid is null then return _no('not in a pool'); end if;
  delete from pool_members where world = w and user_id = me;
  if not exists (select 1 from pool_members where world = w and pool_id = pid) then
    delete from validator_pools where id = pid and world = w;
  else
    select user_id into next_owner from pool_members where world = w and pool_id = pid order by joined_at asc limit 1;
    update validator_pools set owner = next_owner where id = pid and world = w;
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.act_leave_pool(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'pool', 0.05, 2) then return _no('too many actions'); end if;
  return _core_leave_pool(w);
end $$;

-- Read-only: every pool in the world, its member count, current combined production and tier, plus
-- the caller's own pool id (or null) so the client knows whether to offer "join" or "leave."
create or replace function public.act_pool_list(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mine bigint; pools jsonb;
begin
  if me is not null then select pool_id into mine from pool_members where world = w and user_id = me; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'owner_name', (select name from players where user_id = p.owner and world = w),
      'members', (select count(*) from pool_members m where m.world = w and m.pool_id = p.id),
      'production', _pool_production(w, p.id), 'bonus', _pool_bonus_for(_pool_production(w, p.id))
    ) order by p.created_at), '[]'::jsonb) into pools
    from validator_pools p where p.world = w;
  return jsonb_build_object('ok', true, 'pools', pools, 'mine', mine, 'max_members', _max_pool_members());
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
