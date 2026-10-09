-- 015: the Genesis Titan (a single, fixed-location boss, src/game/16-mobs.js) always drops its trophy on
-- death — unlike regular mob loot, which is chance-based. Its own rate-limit kind ('loot_boss', burst 1,
-- one claim per ~20s) keeps it independent of the regular 'loot_mob' budget, so grinding ordinary mobs
-- can't be used to bypass it and vice versa. Requires 001_schema.sql, 002_security.sql, 013_mob_loot.sql.
-- Replayable without error.

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb;
begin
  if mob_type = 'titan' then
    if not _rate(me, 'loot_boss', 0.05, 1) then return _no('too many actions'); end if;
    e := _check_pos(me, w, ex, ey, ez);
    if e is not null then return _no(e); end if;
    u := _mint(me, w, 205, null);
    return jsonb_build_object('ok', true, 'inv', inv, 'unique', u);
  end if;
  if not _rate(me, 'loot_mob', 0.2, 5) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  r := random();
  it := case mob_type
    when 'shadow' then case when r < 0.5 then 101 end
    when 'guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'sentinel' then case when r < 0.4 then 103 end
    when 'wraith' then case when r < 0.25 then 104 when r < 0.65 then 103 end
    else null
  end;
  if it is null then return jsonb_build_object('ok', true, 'inv', inv); end if;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;
