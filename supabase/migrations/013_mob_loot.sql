-- 013: hostile mobs drop a thematic resource on death — a modest, chance-based bonus layered on top of
-- mining, not a replacement for it. Mobs have no server-side presence (deterministic from the seed, like
-- animals), so this trusts the client-reported mob type the same way _core_mine already trusts "held" for
-- tool tier: bounded by position plausibility and a conservative rate limit, not independently re-derived.
-- Requires 001_schema.sql, 002_security.sql (_me_or_fail, _rate, _check_pos, _give). Replayable without error.

create or replace function public.act_loot_mob(w text, mob_type text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text; it int; inv jsonb := '{}'; r real;
begin
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
revoke all on function public.act_loot_mob(text, text, real, real, real) from public, anon, authenticated;
grant execute on function public.act_loot_mob(text, text, real, real, real) to authenticated;
