-- 009 : zones publiques protégées. Personne ne peut y miner, poser ni revendiquer :
--   l'Atrium (rayon 7,9 autour du validateur du sanctuaire, en 8, 8) ;
--   la Cité (rayon 30,5 autour de 8, −56).
-- Mêmes mesures que le générateur (supabase/functions/_shared/world.js : SPAWN, CITE) et que le jeu (06-actions.js).
-- Rejouable sans erreur. Nécessite 001 et 002.

create or replace function public._zone_publique(px int, pz int) returns boolean
language sql immutable as $$
  select sqrt((px - 8) ^ 2 + (pz - 8) ^ 2) <= 7.9 or sqrt((px - 8) ^ 2 + (pz + 56) ^ 2) <= 30.5
$$;

create or replace function public._can_build(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not _zone_publique(px, pz)
     and not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                     and c.owner <> me and not (me = any (c.members)))
$$;

-- pas de parcelle sur un tronçon qui touche une zone publique
create or replace function public.act_claim(w text, qx int, qz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  if floor(ex)::int >> 4 <> qx or floor(ez)::int >> 4 <> qz then return _no('il faut se trouver dans la parcelle'); end if;
  if exists (select 1 from generate_series(0, 15) a, generate_series(0, 15) b where _zone_publique(qx * 16 + a, qz * 16 + b)) then
    return _no('ce lieu appartient à tout le monde');
  end if;
  return _core_claim(w, qx, qz);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;
