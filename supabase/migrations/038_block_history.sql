-- 038: the block explorer. Every change to a block (placed, mined) is logged with who did it and when,
-- and block_info() gives a block's story to any player who looks at it (I key, 07-interface.js):
-- who placed it, when, how many blocks that builder has standing in the world, and its last changes.
-- The log is filled by a trigger on blocks, so every act_* function that writes a block feeds it
-- without being touched. Opening a door or a lever (_flip: same author, same serial) isn't a change of
-- hands and isn't logged. Only the last 12 changes of each block are kept.
-- Names only, never an account id: the same nicknames everyone already sees over the blocks.
-- Requires 001_schema.sql. Replayable without error.

create table if not exists public.block_history (
  world      text        not null,
  x          integer     not null,
  y          integer     not null,
  z          integer     not null,
  at         timestamptz not null default now(),
  seq        bigserial,
  id         smallint    not null,  -- the block after the change (0: mined)
  prev       smallint,              -- the block before it (null: the generated terrain's, unknown here)
  actor      uuid,                  -- who did it (null: the server itself)
  actor_name text,
  primary key (world, x, y, z, seq)
);
alter table public.block_history enable row level security; -- no policy: read through block_info()

create or replace function public._log_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text;
begin
  if tg_op = 'UPDATE' then
    if new.id = old.id then return new; end if;
    -- a door or a lever switching state: the same signature, not a new owner
    if new.id <> 0 and old.id <> 0 and new.placed_by is not distinct from old.placed_by
       and new.serial is not distinct from old.serial then return new; end if;
  end if;
  if me is not null then select name into nm from players where user_id = me and world = new.world; end if;
  insert into block_history (world, x, y, z, id, prev, actor, actor_name)
    values (new.world, new.x, new.y, new.z, new.id, case when tg_op = 'UPDATE' then old.id end, me, nm);
  delete from block_history h where h.world = new.world and h.x = new.x and h.y = new.y and h.z = new.z
    and h.seq <= (select seq from block_history k where k.world = new.world and k.x = new.x and k.y = new.y and k.z = new.z
                  order by seq desc offset 12 limit 1);
  return new;
end $$;

drop trigger if exists blocks_history on public.blocks;
create trigger blocks_history after insert or update on public.blocks
  for each row execute function public._log_block();

-- a block's story: its current signature, the builder's standing block count, its last changes (newest first)
create or replace function public.block_info(w text, px int, py int, pz int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b blocks; n int := 0;
begin
  select * into b from blocks where world = w and x = px and y = py and z = pz;
  if b.placed_by is not null then
    select count(*) into n from blocks where world = w and placed_by = b.placed_by and id <> 0;
  end if;
  return jsonb_build_object(
    'id', b.id,
    'name', b.placed_name,
    'serial', b.serial,
    'at', case when b.placed_by is not null then b.updated_at end,
    'builder_blocks', n,
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', h.at, 'id', h.id, 'prev', h.prev, 'name', h.actor_name) order by h.seq desc)
                         from block_history h where h.world = w and h.x = px and h.y = py and h.z = pz), '[]'::jsonb));
end $$;

revoke all on function public.block_info(text, int, int, int) from public, anon;
grant execute on function public.block_info(text, int, int, int) to authenticated;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
