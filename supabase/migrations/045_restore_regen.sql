-- 045: a restore can also regenerate the terrain (GEN 27: the towers and the Merge Sanctum grew). Frozen
-- chunks never change on their own; with regen, the frozen chunks outside the claims are dropped too, and
-- frozen again from the generator deployed now (the freeze function) the next time someone comes by.
-- Deploy the freeze function with the new generator first. Same as 042's admin_restore_world otherwise.
--   select admin_restore_world('principal', false, true);   -- a preview, chunks to regenerate included
--   select admin_restore_world('principal', true, true);    -- the real thing
-- Requires 042_world_restore.sql. Replayable without error.

drop function if exists public.admin_restore_world(text, boolean);
create or replace function public.admin_restore_world(w text, apply boolean default false, regen boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; total int; claimed int; zones jsonb; chunks_n int := 0;
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
  -- regen: the frozen terrain outside the claims goes too, and is frozen again from the generator deployed
  -- now (the freeze function), the next time someone comes by: new buildings appear where people played
  if regen then
    select count(*) into chunks_n from chunks c where c.world = w
      and not exists (select 1 from claims cl where cl.world = w and cl.cx = c.cx and cl.cz = c.cz);
  end if;
  if apply then
    delete from blocks b using restore_victims v where b.world = w and b.x = v.x and b.y = v.y and b.z = v.z;
    get diagnostics n = row_count;
    if regen then
      delete from chunks c where c.world = w
        and not exists (select 1 from claims cl where cl.world = w and cl.cx = c.cx and cl.cz = c.cz);
      get diagnostics chunks_n = row_count;
    end if;
    insert into world_restores (world, at, erased) values (w, now(), n)
      on conflict (world) do update set at = now(), erased = excluded.erased;
  end if;
  return jsonb_build_object(
    'world', w,
    case when apply then 'erased' else 'would_erase' end, n,
    'kept_in_claims', claimed,
    'kept_elsewhere', total - claimed - n, -- chests, signs, validators' ruins
    'zones', zones,
    case when apply then 'terrain_regenerated' else 'terrain_to_regenerate' end, case when regen then chunks_n end, -- chunks
    'next', case when apply then 'the players in this world reload on their own'
      else format('select admin_restore_world(%L, true%s);', w, case when regen then ', true' else '' end) end);
end $$;

revoke all on function public.admin_restore_world(text, boolean, boolean) from public, anon, authenticated, service_role;
