-- 032: a shop worth coming back to. Wearables in slots (head, back, companion, trail...), collections,
-- and a weekly offer: each week (Monday 00:00 UTC) three regular wearables are 25% off and one "limited"
-- piece is for sale, the only week it can be bought. The picks are computed here exactly as
-- supabase/functions/_shared/rules.js's shopFeatured() does: change both together. Block packs (a
-- cosmetic that grants items) can now be bought again and again. Still purely decorative.
-- Requires 022_cosmetics.sql (and 029_chapters.sql's not-for-sale rule, kept). Replayable without error.

alter table public.rule_cosmetics add column if not exists limited boolean not null default false;

create or replace function public._shop_week() returns integer
language sql stable as $$
  select floor((extract(epoch from now()) - 345600) / 604800)::int
$$;

-- this week's discounted ids (3) and limited id (or null), same picks as rules.js's shopFeatured()
create or replace function public._shop_featured(wk int) returns jsonb
language plpgsql stable set search_path = public as $$
declare reg smallint[]; lim smallint[]; n int; sale jsonb := '[]';
begin
  select coalesce(array_agg(id order by id), '{}') into reg from rule_cosmetics
    where category not in ('combat', 'event', 'title') and price > 0 and not limited and grant_item is null;
  select coalesce(array_agg(id order by id), '{}') into lim from rule_cosmetics where limited;
  n := coalesce(array_length(reg, 1), 0);
  if n > 0 then
    for k in 0..2 loop sale := sale || to_jsonb(reg[((wk * 3 + k) % n) + 1]); end loop;
  end if;
  return jsonb_build_object('sale', sale,
    'limited', case when coalesce(array_length(lim, 1), 0) > 0 then lim[(wk % array_length(lim, 1)) + 1] end);
end $$;

create or replace function public._core_buy_cosmetic(w text, cid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc rule_cosmetics; inv jsonb := '{}'; f jsonb; cost int;
begin
  perform _player(me, w);
  select * into rc from rule_cosmetics where id = cid;
  if not found then return _no('unknown cosmetic'); end if;
  if rc.category in ('combat', 'event', 'title') or rc.price <= 0 then return _no('not for sale'); end if;
  -- a block pack can be bought again; anything else only once
  if rc.grant_item is null and exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = rc.id) then
    return _no('already owned');
  end if;
  f := _shop_featured(_shop_week());
  if rc.limited and (f ->> 'limited') is distinct from rc.id::text then return _no('not in the shop this week'); end if;
  cost := case when (f -> 'sale') @> to_jsonb(rc.id) then (rc.price * 3) / 4 else rc.price end;
  if _gwei_balance(me, w) < cost then return _no('not enough gwei', jsonb_build_object('need', cost)); end if;
  perform _gwei(me, w, -cost);
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, rc.id) on conflict do nothing;
  if rc.grant_item is not null then inv := _give(me, w, rc.grant_item, coalesce(rc.grant_qty, 1), inv); end if;
  return jsonb_build_object('ok', true, 'cosmetic', rc.id, 'inv', inv, 'paid', cost, 'gwei', _gwei_balance(me, w));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
