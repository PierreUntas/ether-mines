-- 040: hovercraft, the Diamond Gliders (items 213-220, rules.js; src/game/20-hover.js). They are crafted
-- like the special pickaxes (_core_craft mints the unique, nothing new there); what changes is movement:
-- a rider goes twice as fast as a runner, which _check_pos (002_security.sql) would refuse as an
-- impossible move. _check_pos is 002's with one change: the horizontal allowance is twice as large for a
-- player who owns a glider, or who sits close to one who does and moved within the last 20 seconds (the
-- Twin Diamond's back seat: its passenger goes where the driver goes). A rider pings its position every
-- 3 seconds instead of 15, so that driver's position stays fresh.
-- Requires 002_security.sql. Replayable without error.

create or replace function public._check_pos(me uuid, w text, ex real, ey real, ez real, tx int default null, ty int default null, tz int default null)
returns text language plpgsql security definer set search_path = public as $$
declare p players; dt real; horiz real; up real; ok boolean := false; pace real := 9;
begin
  if ex is null or ey is null or ez is null then return 'missing position'; end if;
  if abs(ex) > 100000 or abs(ez) > 100000 or ey < -20 or ey > 80 then return 'position out of the world'; end if;
  select * into p from players where user_id = me and world = w;
  if p.pos_at is null then ok := true;                                   -- first known position
  else
    dt := greatest(extract(epoch from clock_timestamp() - p.pos_at), 0);
    horiz := sqrt((ex - p.pos_x) ^ 2 + (ez - p.pos_z) ^ 2);
    up := ey - p.pos_y;                                                  -- falls aren't limited
    -- 040: on a hovercraft (13.2 blocks/s), or in the back seat of a recently-moved rider's Twin Diamond
    if horiz > 9 * dt + 8 and (
         exists (select 1 from uniques where user_id = me and world = w and item between 213 and 220)
         or exists (select 1 from players o join uniques u on u.user_id = o.user_id and u.world = o.world and u.item between 213 and 216
                    where o.world = w and o.user_id <> me and o.pos_at > clock_timestamp() - interval '20 seconds'
                      and sqrt((ex - o.pos_x) ^ 2 + (ez - o.pos_z) ^ 2) <= 45)) then
      pace := 18;
    end if;
    ok := horiz <= pace * dt + 8 and up <= 9 * dt + 6;                    -- 6.6 blocks/s running pace, with slack for network lag
    if not ok then ok := sqrt((ex - 8.5) ^ 2 + (ez - 10.5) ^ 2) <= 8; end if; -- return to the sanctuary (/sanctuary, falling into the void)
    if not ok then                                                        -- /join: next to a recently-active player
      ok := exists (select 1 from players o where o.world = w and o.user_id <> me and o.pos_at > clock_timestamp() - interval '2 minutes'
                    and sqrt((ex - o.pos_x) ^ 2 + (ez - o.pos_z) ^ 2) <= 6);
    end if;
  end if;
  if not ok then return 'impossible move'; end if;
  if tx is not null and sqrt((tx + 0.5 - ex) ^ 2 + (ty + 0.5 - (ey + 1.6)) ^ 2 + (tz + 0.5 - ez) ^ 2) > 6.5 then
    return 'too far';
  end if;
  update players set pos_x = ex, pos_y = ey, pos_z = ez, pos_at = clock_timestamp() where user_id = me and world = w;
  return null;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
