-- 042: putting a world back the way it was generated, except where it's claimed. Every change a player
-- makes to the terrain is a row in `blocks`, laid over the frozen terrain (`chunks`): erasing those rows
-- brings the original back (holes filled, trees grown back, wild builds gone). Run by hand, in the SQL
-- Editor, by the game's owner only (no player, not even the game server, can call it):
--   select admin_restore_world('principal');          -- a preview: what would go, what stays, where
--   select admin_restore_world('principal', true);    -- the real thing
-- What stays: every block inside a claimed chunk, chests (and what's in them, tower treasures included),
-- signs, and every validator with the ruin around it (relit columns and capstone). The screens in that
-- world are told (`world_restores`, read in real time) and reload; the game server reads its terrain again.
-- A tower chest that was broken comes back empty: _seed_tower_chest no longer seeds a cell that has a
-- history (block_history), so a restore never refills a treasure someone already took.
-- Requires 004_chests.sql, 020_validators.sql, 034_signs.sql, 037_diamond_shards.sql, 038_block_history.sql.
-- Replayable without error.

create table if not exists public.world_restores (
  world  text        primary key,
  at     timestamptz not null default now(),
  erased integer     not null default 0
);
alter table public.world_restores enable row level security;
drop policy if exists "read world restores" on public.world_restores;
create policy "read world restores" on public.world_restores for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table public.world_restores; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- 037's seeding, plus: a cell that ever changed (mined, built on) is no pristine tower chest
create or replace function public._seed_tower_chest(w text, px int, py int, pz int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from chests where world = w and x = px and y = py and z = pz) then return; end if;
  if exists (select 1 from blocks where world = w and x = px and y = py and z = pz) then return; end if;
  if exists (select 1 from block_history where world = w and x = px and y = py and z = pz) then return; end if;
  insert into chests (world, x, y, z, items) values (w, px, py, pz,
    jsonb_build_object('101', 15 + floor(random() * 11)::int, '103', 4 + floor(random() * 5)::int, '110', 1) -- + a Diamond Shard
      || case when random() < 0.5 then jsonb_build_object('104', 1) else '{}'::jsonb end)
    on conflict do nothing;
end $$;

-- the blocks a restore would erase: outside every claim, not a chest, not a sign, not by a validator
create or replace function public._restore_victims(w text)
returns table (x int, y int, z int, id smallint, placed_name text)
language sql stable security definer set search_path = public as $$
  select b.x, b.y, b.z, b.id, b.placed_name from blocks b
  where b.world = w
    and not exists (select 1 from claims c where c.world = w and c.cx = b.x >> 4 and c.cz = b.z >> 4)
    and not exists (select 1 from chests k where k.world = w and k.x = b.x and k.y = b.y and k.z = b.z)
    and not exists (select 1 from signs s where s.world = w and s.x = b.x and s.y = b.y and s.z = b.z)
    -- a validator's ruin: its columns 2 blocks out on each side, a capstone above
    and not exists (select 1 from validators v where v.world = w
                    and abs(b.x - v.x) <= 3 and abs(b.z - v.z) <= 3 and b.y between v.y - 2 and v.y + 6);
$$;

create or replace function public.admin_restore_world(w text, apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; total int; claimed int; zones jsonb;
begin
  perform set_config('client_min_messages', 'warning', true);
  drop table if exists pg_temp.restore_victims;
  create temp table restore_victims on commit drop as select * from _restore_victims(w);
  select count(*) into n from restore_victims;
  select count(*) into total from blocks b where b.world = w;
  select count(*) into claimed from blocks b where b.world = w
    and exists (select 1 from claims c where c.world = w and c.cx = b.x >> 4 and c.cz = b.z >> 4);
  -- where most of it is: the 10 busiest chunks (their middle), how much was dug, who built there
  select coalesce(jsonb_agg(t.z order by (t.z ->> 'blocks')::int desc), '[]'::jsonb) into zones from (
    select jsonb_build_object('x', (v.x >> 4) * 16 + 8, 'z', (v.z >> 4) * 16 + 8, 'blocks', count(*),
             'mined', count(*) filter (where v.id = 0),
             'builders', coalesce(jsonb_agg(distinct v.placed_name) filter (where v.placed_name is not null), '[]'::jsonb)) as z
    from restore_victims v group by v.x >> 4, v.z >> 4 order by count(*) desc limit 10) t;
  if apply then
    delete from blocks b using restore_victims v where b.world = w and b.x = v.x and b.y = v.y and b.z = v.z;
    get diagnostics n = row_count;
    insert into world_restores (world, at, erased) values (w, now(), n)
      on conflict (world) do update set at = now(), erased = excluded.erased;
  end if;
  return jsonb_build_object(
    'world', w,
    case when apply then 'erased' else 'would_erase' end, n,
    'kept_in_claims', claimed,
    'kept_elsewhere', total - claimed - n, -- chests, signs, validators' ruins
    'zones', zones,
    'next', case when apply then 'the players in this world reload on their own' else format('select admin_restore_world(%L, true);', w) end);
end $$;

revoke all on function public._restore_victims(text) from public, anon, authenticated;
revoke all on function public.admin_restore_world(text, boolean) from public, anon, authenticated, service_role;
