-- 016: towers (src/game/16-mobs.js spawnMobChunk, supabase/functions/_shared/world.js towerAt()) add a
-- repeatable mid-tier boss, the Plasma Core, guaranteed to drop a Plasma Pistol on death — same shape
-- as the Genesis Titan's drop (015_boss_loot.sql), sharing its 'loot_boss' rate-limit bucket so
-- grinding one boss type can't be used to out-pace the other. Tower Wardens get a line in the regular
-- chance-based table alongside the other mobs. Requires 001_schema.sql, 002_security.sql,
-- 013_mob_loot.sql, 015_boss_loot.sql. Replayable without error.

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real; u jsonb;
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
  r := random();
  it := case mob_type
    when 'shadow' then case when r < 0.5 then 101 end
    when 'guardian' then case when r < 0.35 then 101 when r < 0.5 then 103 end
    when 'sentinel' then case when r < 0.4 then 103 end
    when 'wraith' then case when r < 0.25 then 104 when r < 0.65 then 103 end
    when 'warden' then case when r < 0.3 then 101 when r < 0.45 then 103 end
    else null
  end;
  if it is null then return jsonb_build_object('ok', true, 'inv', inv); end if;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;
