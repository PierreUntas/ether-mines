-- 033: consumables and the Genesis tier. A consumable (rule_items.consumable) is spent one at a time by
-- act_use_item; its effect (healing, speed, night vision, the mobs' ward) plays client-side like the rest
-- of combat, except the Home Beacon's teleport, which the server must allow: it checks that a bed stands
-- where you're going and records that position, so the next move from there isn't refused. A recipe can
-- also require owning a unique item without spending it (rule_recipes.req_unique: the Genesis gear needs
-- a boss trophy). Requires 001_schema.sql, 002_security.sql. Replayable without error.

alter table public.rule_items add column if not exists consumable boolean not null default false;
alter table public.rule_recipes add column if not exists req_unique smallint;

create or replace function public._core_craft(w text, out_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r rule_recipes; k text; v jsonb; inv jsonb := '{}'; u jsonb;
begin
  perform _player(me, w);
  select * into r from rule_recipes where out_item = out_id;
  if not found then return _no('unknown recipe'); end if;
  if r.req_unique is not null and not exists (select 1 from uniques where user_id = me and world = w and item = r.req_unique) then
    return _no('needs a trophy', jsonb_build_object('item', r.req_unique));
  end if;
  for k, v in select * from jsonb_each(r.need) loop
    if _count(me, w, k::int) < v::int then return _no('missing ingredients', jsonb_build_object('item', k::int)); end if;
  end loop;
  for k, v in select * from jsonb_each(r.need) loop inv := _give(me, w, k::int, -(v::int), inv); end loop;
  if r.uniq then u := _mint(me, w, out_id, null); return jsonb_build_object('ok', true, 'inv', inv, 'unique', u); end if;
  inv := _give(me, w, out_id, r.n, inv);
  return jsonb_build_object('ok', true, 'inv', inv);
end $$;

-- bx/by/bz: the Home Beacon's bed (its foot or head), ignored for the other consumables
create or replace function public._core_use_item(w text, item int, bx int, by int, bz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv jsonb := '{}'; c int;
begin
  perform _player(me, w);
  if not exists (select 1 from rule_items where id = item and consumable) then return _no('not usable'); end if;
  if _count(me, w, item) < 1 then return _no('none left'); end if;
  if item = 307 then
    if bx is null then return _no('no bed to go back to'); end if;
    c := _cell(w, bx, by, bz);
    if c is null or c not between 137 and 144 then return _no('that bed is gone', jsonb_build_object('cell', c)); end if;
    update players set pos_x = bx + 0.5, pos_y = by + 1, pos_z = bz + 0.5, pos_at = clock_timestamp()
      where user_id = me and world = w;
  end if;
  inv := _give(me, w, item, -1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', item);
end $$;

create or replace function public.act_use_item(w text, item int, bx int default null, by int default null, bz int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'use_item', 1, 4) then return _no('too many actions'); end if;
  return _core_use_item(w, item, bx, by, bz);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
