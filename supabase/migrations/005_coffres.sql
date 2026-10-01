-- 005 : malles (coffres posables). Le contenu de chaque malle est gardé par le serveur.
--   act_chest lit un coffre ; act_chest_move y dépose (n > 0) ou en retire (n < 0) des objets de son sac.
--   Ouvrir un coffre : être à portée de main, et pouvoir construire à cet endroit (dans une parcelle :
--   seulement le propriétaire et ses invités ; ailleurs, tout le monde).
--   Un coffre cassé rend son contenu à celui qui le casse.
-- Rejouable sans erreur. Nécessite 002_securite.sql. Le bloc coffre (98) vient de regles.sql.

create table if not exists public.chests (
  world text  not null,
  x     int   not null,
  y     int   not null,
  z     int   not null,
  items jsonb not null default '{}'::jsonb,   -- { "objet": nombre }
  primary key (world, x, y, z)
);
alter table public.chests enable row level security; -- aucune règle : réservé aux fonctions

create or replace function public._chest_ok(me uuid, w text, px int, py int, pz int, ex real, ey real, ez real) returns text
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  if not _rate(me, 'chest', 6, 12) then return 'trop d''actions'; end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return e; end if;
  if _cell(w, px, py, pz) <> 98 then return 'pas de malle ici'; end if;
  if not _can_build(me, w, px, pz) then return 'protégé'; end if;
  return null;
end $$;

create or replace function public.act_chest(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
begin
  if e is not null then return _no(e); end if;
  return jsonb_build_object('ok', true, 'items',
    coalesce((select items from chests where world = w and x = px and y = py and z = pz), '{}'::jsonb));
end $$;

create or replace function public.act_chest_move(w text, px int, py int, pz int, item int, n int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
        cur jsonb; have int; inv jsonb := '{}'::jsonb;
begin
  if e is not null then return _no(e); end if;
  if n = 0 or abs(n) > 10000 then return _no('quantité invalide'); end if;
  insert into chests (world, x, y, z) values (w, px, py, pz) on conflict do nothing;
  select items into cur from chests where world = w and x = px and y = py and z = pz for update;
  have := coalesce((cur ->> item::text)::int, 0);
  if n > 0 then
    if _count(me, w, item) < n then return _no('pas assez dans ton sac'); end if;
    if have = 0 and (select count(*) from jsonb_object_keys(cur)) >= 27 then return _no('malle pleine'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := cur || jsonb_build_object(item::text, have + n);
  else
    n := greatest(n, -have);
    if n = 0 then return _no('rien de cet objet dans la malle'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := case when have + n = 0 then cur - item::text else cur || jsonb_build_object(item::text, have + n) end;
  end if;
  update chests set items = cur where world = w and x = px and y = py and z = pz;
  return jsonb_build_object('ok', true, 'items', cur, 'inv', inv);
end $$;

-- Coffre cassé ou remplacé : son contenu va dans le sac de celui qui l'a cassé.
create or replace function public._chest_broken() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chests; k text; v text; inv jsonb := '{}'::jsonb;
begin
  if new.id = 98 then return new; end if;
  select * into c from chests where world = new.world and x = new.x and y = new.y and z = new.z;
  if c.world is null then return new; end if;
  if auth.uid() is not null then
    for k, v in select * from jsonb_each_text(c.items) loop
      inv := _give(auth.uid(), new.world, k::int, v::int, inv);
    end loop;
  end if;
  delete from chests where world = new.world and x = new.x and y = new.y and z = new.z;
  return new;
end $$;
drop trigger if exists chest_broken on public.blocks;
create trigger chest_broken after insert or update of id on public.blocks
  for each row execute function public._chest_broken();

-- droits : seules les act_* sont appelables par les joueurs
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
