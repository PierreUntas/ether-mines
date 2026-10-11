-- 020: validators become real rows (position, state, rarity, level, production), not just a block id
-- counted on the fly. A validator is dormant until reanimated (relit from a ruin, or crafted and placed);
-- its seal (item 203, already non-transferable) now points at the row instead of carrying raw onchain
-- coordinates.
-- Requires 001_schema.sql, 002_security.sql, 012_relight_column.sql. Replayable without error.

create table if not exists public.validators (
  id               bigserial   primary key,
  world            text        not null,
  x                integer     not null,
  y                integer     not null,
  z                integer     not null,
  owner            uuid        references auth.users (id) on delete cascade,
  owner_name       text,
  state            text        not null default 'dormant' check (state in ('dormant', 'active', 'damaged', 'corrupted')),
  rarity           text        not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  level            smallint    not null default 1,
  specialty        text        check (specialty in ('production', 'defense', 'exploration', 'craft')),
  gwei_per_cycle   integer     not null default 0,
  maintenance_cost integer     not null default 0,
  missed_cycles    integer     not null default 0,
  last_cycle_at    timestamptz,
  last_attested_at timestamptz,
  reanimated_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (world, x, y, z)
);
create index if not exists validators_owner on public.validators (world, owner) where owner is not null;
create index if not exists validators_state on public.validators (world, state);
alter table public.validators enable row level security;
drop policy if exists "read validators" on public.validators;
create policy "read validators" on public.validators for select using (true);

-- The seal now points at its validator row; vx/vy/vz (chain-era) are dropped later in 023_remove_onchain.sql
-- once nothing writes them anymore.
alter table public.uniques add column if not exists validator_id bigint references public.validators (id);
create unique index if not exists uniques_one_seal_per_validator on public.uniques (world, validator_id)
  where item = 203 and validator_id is not null;

-- Rarity at reanimation: common 60%, rare 25%, epic 12%, legendary 3%.
create or replace function public._pick_rarity() returns text
language sql volatile as $$
  select case when r < 0.60 then 'common' when r < 0.85 then 'rare' when r < 0.97 then 'epic' else 'legendary' end
  from (select random() as r) s
$$;

-- Gross production and upkeep per cycle (one cycle = 5 minutes, see _tick_validator), by rarity and level
-- (+15% per level above 1, level 10 at most). Net gain per maintained cycle is gwei_per_cycle - maintenance_cost.
create or replace function public._validator_stats(rarity text, level int) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'gwei_per_cycle', floor((case rarity when 'common' then 12 when 'rare' then 25 when 'epic' then 50 else 100 end)
      * (1 + 0.15 * (level - 1)))::int,
    'maintenance_cost', floor((case rarity when 'common' then 2 when 'rare' then 5 when 'epic' then 10 else 20 end)
      * (1 + 0.15 * (level - 1)))::int
  )
$$;

-- Relight a dark validator: same preconditions as before (012/014), now also reanimates a validators row
-- (random rarity) and points the minted seal at it instead of recording raw vx/vy/vz.
create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb; star jsonb; solid boolean;
        relit_n int; shard boolean := false; rarity text; stats jsonb; vid bigint;
begin
  pl := _player(me, w);
  if _cell(w, px, py, pz) <> 73 then return _no('not a dark validator', jsonb_build_object('cell', _cell(w, px, py, pz))); end if;
  for i in 0..2 loop
    solid := coalesce((select rb.solid from rule_blocks rb where rb.id = _cell_soft(w, px + 2, py + i, pz + 2)), false);
    if not solid then return _no('rebuild the fourth column first'); end if;
  end loop;
  if _count(me, w, 105) < 1 then return _no('needs a validator heart'); end if;
  inv := _give(me, w, 105, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, 74, me, pl.name, s);
  rarity := _pick_rarity();
  stats := _validator_stats(rarity, 1);
  insert into validators (world, x, y, z, owner, owner_name, state, rarity, level, gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at)
    values (w, px, py, pz, me, pl.name, 'active', rarity, 1, (stats ->> 'gwei_per_cycle')::int, (stats ->> 'maintenance_cost')::int, now(), now())
    on conflict (world, x, y, z) do update set owner = excluded.owner, owner_name = excluded.owner_name, state = 'active',
      rarity = excluded.rarity, level = 1, gwei_per_cycle = excluded.gwei_per_cycle, maintenance_cost = excluded.maintenance_cost,
      missed_cycles = 0, reanimated_at = now(), last_cycle_at = now()
    returning id into vid;
  u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
  update uniques set validator_id = vid where user_id = me and world = w and serial = (u ->> 'serial')::int;
  select count(*) into relit_n from blocks where world = w and id = 74;
  if relit_n = any (array[3, 10, 25, 50, 100]) then
    star := _mint(me, w, 204, 'crossed the ' || relit_n || '-relit threshold');
  end if;
  if relit_n >= 100 and random() < 0.15 then
    inv := _give(me, w, 110, 1, inv);
    shard := true;
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'star', star, 'shard', shard, 'serial', s, 'validator', vid);
end $$;

-- Place: same body as 010_bed.sql's _core_place (door and bed double-placement), except a freshly
-- placed/crafted validator block (13) also reanimates a validators row (always common rarity: crafting
-- it is a shortcut, not a discovery).
create or replace function public._core_place(w text, px int, py int, pz int, it int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; cr rule_blocks; rb rule_blocks; below int; up int; ch jsonb := '[]'; inv jsonb := '{}'; s int;
  odx int; odz int; ocur int; ocr rule_blocks; stats jsonb;
begin
  pl := _player(me, w);
  if py < 1 or py >= 64 or abs(px) >= 100000 or abs(pz) >= 100000 then return _no('out of the world'); end if;
  if not exists (select 1 from rule_place where item = it and block = bid) then return _no('item not placeable'); end if;
  if _count(me, w, it) < 1 then return _no('empty inventory', jsonb_build_object('inv', jsonb_build_object(it::text, 0))); end if;
  if not _can_build(me, w, px, pz) then return _no('protected'); end if;
  cur := _cell(w, px, py, pz); select * into cr from rule_blocks where id = cur;
  if cur <> 0 and cr.kind not in ('water', 'cross') then return _no('space occupied', jsonb_build_object('cell', cur)); end if;
  select * into rb from rule_blocks where id = bid;
  below := _cell(w, px, py - 1, pz);
  if rb.kind = 'cross' and below not in (1, 2) then return _no('needs support'); end if;
  if rb.kind in ('plate', 'cable', 'lever') and not coalesce((select solid from rule_blocks where id = below), false) then return _no('needs support'); end if;
  if rb.kind = 'door' then
    if py + 1 >= 64 then return _no('out of the world'); end if;
    up := _cell(w, px, py + 1, pz);
    if up <> 0 and (select kind from rule_blocks where id = up) not in ('water', 'cross') then return _no('space occupied'); end if;
  elsif rb.kind like 'bed%f' then
    odx := case rb.kind when 'bed0f' then 0 when 'bed1f' then -1 when 'bed2f' then 0 when 'bed3f' then 1 end;
    odz := case rb.kind when 'bed0f' then -1 when 'bed1f' then 0 when 'bed2f' then 1 when 'bed3f' then 0 end;
    ocur := _cell(w, px + odx, py, pz + odz); select * into ocr from rule_blocks where id = ocur;
    if ocur <> 0 and ocr.kind not in ('water', 'cross') then return _no('space occupied', jsonb_build_object('cell', ocur)); end if;
  end if;
  inv := _give(me, w, it, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, bid, me, pl.name, s);
  if rb.kind = 'door' then ch := ch || _set(w, px, py + 1, pz, bid + 1, me, pl.name, s);
  elsif rb.kind like 'bed%f' then ch := ch || _set(w, px + odx, py, pz + odz, bid + 4, me, pl.name, s);
  end if;
  if bid = 13 then
    stats := _validator_stats('common', 1);
    insert into validators (world, x, y, z, owner, owner_name, state, rarity, level, gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at)
      values (w, px, py, pz, me, pl.name, 'active', 'common', 1, (stats ->> 'gwei_per_cycle')::int, (stats ->> 'maintenance_cost')::int, now(), now())
      on conflict (world, x, y, z) do update set owner = excluded.owner, owner_name = excluded.owner_name, state = 'active',
        rarity = 'common', level = 1, gwei_per_cycle = excluded.gwei_per_cycle, maintenance_cost = excluded.maintenance_cost,
        missed_cycles = 0, reanimated_at = now(), last_cycle_at = now();
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'serial', s);
end $$;

-- Recovery (001_schema.sql) must also hand over owned validators, or they'd stay stuck on the old
-- account's uuid after a code recovery.
create or replace function public._core_claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare old uuid; me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into old from public.recovery where code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex');
  if old is null then raise exception 'unknown code'; end if;
  if old = me then return 0; end if;
  -- this device's account steps aside for the code's account, world by world
  delete from public.inventory i where i.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = i.world);
  delete from public.uniques u where u.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = u.world);
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.inventory set user_id = me where user_id = old;
  update public.uniques set user_id = me where user_id = old;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  update public.claims set owner = me where owner = old;
  update public.claims set members = array_replace(members, old, me) where old = any (members);
  update public.validators set owner = me where owner = old;
  delete from public.recovery where user_id = me;
  update public.recovery set user_id = me where user_id = old;
  return n;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
