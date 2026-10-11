-- 024: loot tiers for regular (non-boss) mob kills. Layers two chances on top of the existing
-- resource-chance table instead of replacing it: a rare tier (Gwei, a direct link between combat and
-- the off-chain economy) and an epic tier (a combat-exclusive cosmetic, never sold in the shop). Boss
-- kills (titan, plasma_core) are untouched — their guaranteed trophy is already the legendary tier.
-- Requires 001_schema.sql, 002_security.sql, 013_mob_loot.sql..018_more_mob_loot.sql,
-- 019_gwei_currency.sql, 022_cosmetics.sql. Replayable without error.

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb; cid smallint; g int;
begin
  if mob_type in ('titan', 'plasma_core') then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    u := _mint(me, w, case when mob_type = 'titan' then 205 else 206 end, null);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u);
  end if;
  if not _rate(me, 'loot_mob', 0.2, 5) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  -- epic (~3%): a combat-exclusive cosmetic the player doesn't already own; falls through to the
  -- common table once every combat cosmetic is collected. rare (~12%): a small Gwei bonus.
  r := random();
  if r < 0.03 then
    select id into cid from rule_cosmetics where category = 'combat'
      and id not in (select cosmetic_id from cosmetics_owned where user_id = me and world = w)
      order by random() limit 1;
    if cid is not null then
      insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, cid);
      return jsonb_build_object('ok', true, 'inv', inv, 'cosmetic', cid);
    end if;
  elsif r < 0.15 then
    g := 10 + floor(random() * 41)::int; -- 10..50
    perform _gwei(me, w, g);
    return jsonb_build_object('ok', true, 'inv', inv, 'gwei', g, 'total_gwei', _gwei_balance(me, w));
  end if;
  -- common (unchanged): the existing per-mob-type resource chance, its own independent roll
  r := random();
  it := case mob_type
    when 'shadow' then case when r < 0.5 then 101 end
    when 'guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'sentinel' then case when r < 0.4 then 103 end
    when 'wraith' then case when r < 0.25 then 104 when r < 0.65 then 103 end
    when 'warden' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'garden_guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'prowler' then case when r < 0.5 then 101 end
    when 'sky_raider' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'water_lurker' then case when r < 0.25 then 103 when r < 0.5 then 104 end
    when 'bat' then case when r < 0.45 then 101 end
    when 'crawler' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    when 'golem' then case when r < 0.3 then 103 when r < 0.55 then 104 end
    else null
  end;
  if it is null then return jsonb_build_object('ok', true, 'inv', inv); end if;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;

-- combat-exclusive cosmetics are never for sale, even by calling act_buy_cosmetic with their id directly.
create or replace function public._core_buy_cosmetic(w text, cid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc rule_cosmetics; inv jsonb := '{}';
begin
  perform _player(me, w);
  select * into rc from rule_cosmetics where id = cid;
  if not found then return _no('unknown cosmetic'); end if;
  if rc.category = 'combat' then return _no('not for sale'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = rc.id) then
    return _no('already owned');
  end if;
  if _gwei_balance(me, w) < rc.price then return _no('not enough gwei', jsonb_build_object('need', rc.price)); end if;
  perform _gwei(me, w, -rc.price);
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, rc.id);
  if rc.grant_item is not null then inv := _give(me, w, rc.grant_item, coalesce(rc.grant_qty, 1), inv); end if;
  return jsonb_build_object('ok', true, 'cosmetic', rc.id, 'inv', inv, 'gwei', _gwei_balance(me, w));
end $$;
