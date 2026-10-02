-- 010 : le réseau, objectif commun du monde.
--   act_reseau compte les validateurs anciens rallumés (bloc 74) par tous les joueurs, et nomme les cinq
--   joueurs qui en ont rallumé le plus. Le jeu l'affiche dans les objectifs et fait réagir le grand diamant.
-- Rejouable sans erreur. Nécessite 001 et 002 (_rate, _me_or_fail).

create index if not exists blocks_reseau on public.blocks (world, placed_by) where id = 74;

create or replace function public.act_reseau(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); total int; top jsonb;
begin
  if not _rate(me, 'reseau', 0.2, 5) then return _no('trop d''actions'); end if;
  select count(*) into total from blocks where world = w and id = 74;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.c) order by t.c desc, t.name), '[]'::jsonb) into top
    from (select coalesce(max(placed_name), 'anonyme') as name, count(*) as c from blocks
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
