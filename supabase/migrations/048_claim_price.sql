-- 048: a plot costs Gwei, more for each one you hold: 500 for the first, then twice as much each time
-- (1 000, 2 000, 4 000...), and 9 plots at most in a world. Holding a stretch of land is something a
-- player works for, and can't be done by the dozen to block the others. Plots already held stay; giving
-- one up (unclaim) brings the next price down again, nothing is refunded. Replaces 001's 2 Ether Crystals
-- and 16 plots. Requires 001_schema.sql, 019_gwei_currency.sql, 028_leaderboard.sql. Replayable.
create or replace function public._claim_price(n integer) returns bigint language sql immutable as $$
  select (500 * power(2, greatest(n, 0)))::bigint $$;

create or replace function public._core_claim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; held integer; price bigint;
begin
  pl := _player(me, w);
  if qx = 0 and qz = 0 then return _no('the sanctuary belongs to everyone'); end if;
  if abs(qx) > 6250 or abs(qz) > 6250 then return _no('out of the world'); end if;
  if exists (select 1 from claims where world = w and cx = qx and cz = qz) then return _no('already claimed'); end if;
  select count(*) into held from claims where world = w and owner = me;
  if held >= 9 then return _no('9 plots at most'); end if;
  price := _claim_price(held);
  if coalesce(pl.gwei, 0) < price then return jsonb_build_object('ok', false, 'err', 'needs ' || price || ' gwei', 'price', price); end if;
  perform _gwei(me, w, -price);
  insert into claims (world, cx, cz, owner, owner_name, members)
    select w, qx, qz, me, pl.name, coalesce((select members from claims where world = w and owner = me limit 1), '{}');
  return jsonb_build_object('ok', true, 'inv', '{}'::jsonb, 'gwei', price, 'total_gwei', _gwei_balance(me, w),
    'next_price', case when held + 1 >= 9 then null else _claim_price(held + 1) end);
end $$;

revoke all on function public._claim_price(integer) from public, anon, authenticated;
revoke all on function public._core_claim(text, int, int) from public, anon, authenticated;
