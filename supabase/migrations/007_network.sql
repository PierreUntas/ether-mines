-- 007: the network, the world's shared goal.
--   act_network counts relit dark validators (block 74) across all players, and names the five players
--   who have relit the most. The game shows it in the quest log and animates the great diamond.
-- Requires 001_schema.sql, 002_security.sql. Replayable without error.

create index if not exists blocks_network on public.blocks (world, placed_by) where id = 74;

create or replace function public.act_network(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); total int; top jsonb;
begin
  if not _rate(me, 'network', 0.2, 5) then return _no('too many actions'); end if;
  select count(*) into total from blocks where world = w and id = 74;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.c) order by t.c desc, t.name), '[]'::jsonb) into top
    from (select coalesce(max(placed_name), 'anonymous') as name, count(*) as c from blocks
           where world = w and id = 74 group by placed_by order by count(*) desc limit 5) t;
  return jsonb_build_object('ok', true, 'n', total, 'top', top);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;
