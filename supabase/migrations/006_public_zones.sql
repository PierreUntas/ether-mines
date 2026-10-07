-- 006: protected public zones. No one can mine, place, or claim there:
--   the Atrium (radius 7.9 around the sanctuary validator, at 8, 8);
--   the City (radius 30.5 around 8, -56).
-- Same measurements as the generator (supabase/functions/_shared/world.js: SPAWN, CITY) and the game (06-actions.js).
-- Requires 001_schema.sql, 002_security.sql. Replayable without error.

create or replace function public._public_zone(px int, pz int) returns boolean
language sql immutable as $$
  select sqrt((px - 8) ^ 2 + (pz - 8) ^ 2) <= 7.9 or sqrt((px - 8) ^ 2 + (pz + 56) ^ 2) <= 30.5
$$;

create or replace function public._can_build(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not _public_zone(px, pz)
     and not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                     and c.owner <> me and not (me = any (c.members)))
$$;

-- no claim on a chunk that touches a public zone
create or replace function public.act_claim(w text, qx int, qz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  if floor(ex)::int >> 4 <> qx or floor(ez)::int >> 4 <> qz then return _no('must be inside the claim'); end if;
  if exists (select 1 from generate_series(0, 15) a, generate_series(0, 15) b where _public_zone(qx * 16 + a, qz * 16 + b)) then
    return _no('this place belongs to everyone');
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
