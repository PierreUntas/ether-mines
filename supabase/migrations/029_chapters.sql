-- 029: story chapters. The objectives are grouped into chapters (07-interface.js's CHAPTERS); finishing
-- one pays a Gwei reward and grants a title, a never-sold "title" cosmetic (rules.js COSMETICS 15-19).
-- Owning the title IS the "already claimed" marker: no new table, and account recovery (022) already
-- carries cosmetics_owned over. The client decides when a chapter is done (most objectives are client
-- flags), so the server only pays against proofs it can check itself — the chapter's key milestone —
-- never against the client's word alone.
-- Requires 001_schema.sql, 002_security.sql, 019_gwei_currency.sql, 020_validators.sql,
-- 022_cosmetics.sql, 027_network_attack.sql. Replayable without error.

create or replace function public._core_claim_chapter(w text, chapter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid smallint; g int; proof boolean; nv int;
begin
  perform _player(me, w);
  select v.cid, v.g into cid, g from (values
    ('genesis', 15::smallint, 50), ('forge', 16::smallint, 100), ('awakening', 17::smallint, 200),
    ('network', 18::smallint, 400), ('circuits', 19::smallint, 100)) v(id, cid, g) where v.id = chapter;
  if cid is null then return _no('unknown chapter'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = cid) then
    return _no('already claimed');
  end if;
  select count(*) into nv from validators where world = w and owner = me;
  proof := case chapter
    -- a pickaxe of any tier: the chapter's tools were crafted
    when 'genesis' then exists (select 1 from inventory where user_id = me and world = w and item = 102 and n > 0)
                     or exists (select 1 from uniques where user_id = me and world = w and item in (201, 202))
    -- the pure ether pickaxe: the forge's last tool
    when 'forge' then exists (select 1 from uniques where user_id = me and world = w and item = 202)
    -- a validator relit (or placed) under your name
    when 'awakening' then nv >= 1
    -- three validators, both boss trophies, and a kill during a network attack
    when 'network' then nv >= 3
                     and exists (select 1 from uniques where user_id = me and world = w and item = 205)
                     and exists (select 1 from uniques where user_id = me and world = w and item = 206)
                     and exists (select 1 from network_events where world = w and participants ? me::text)
    -- an AND, an OR and a NOT gate standing in the world, placed by you
    when 'circuits' then (select count(distinct (id - 112) / 4) from blocks
                          where world = w and placed_by = me::text and id between 112 and 123) = 3
  end;
  if not proof then return _no('chapter not finished'); end if;
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, cid);
  perform _gwei(me, w, g);
  return jsonb_build_object('ok', true, 'cosmetic', cid, 'gwei', g, 'total_gwei', _gwei_balance(me, w));
end $$;

create or replace function public.act_claim_chapter(w text, chapter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'claim_chapter', 0.2, 5) then return _no('too many actions'); end if;
  return _core_claim_chapter(w, chapter);
end $$;

-- titles are never sold either (same shape as 024's combat and 027's event cosmetics)
create or replace function public._core_buy_cosmetic(w text, cid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc rule_cosmetics; inv jsonb := '{}';
begin
  perform _player(me, w);
  select * into rc from rule_cosmetics where id = cid;
  if not found then return _no('unknown cosmetic'); end if;
  if rc.category in ('combat', 'event', 'title') then return _no('not for sale'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = rc.id) then
    return _no('already owned');
  end if;
  if _gwei_balance(me, w) < rc.price then return _no('not enough gwei', jsonb_build_object('need', rc.price)); end if;
  perform _gwei(me, w, -rc.price);
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, rc.id);
  if rc.grant_item is not null then inv := _give(me, w, rc.grant_item, coalesce(rc.grant_qty, 1), inv); end if;
  return jsonb_build_object('ok', true, 'cosmetic', rc.id, 'inv', inv, 'gwei', _gwei_balance(me, w));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
