-- The launch's clean-up in the players' world (principal), by hand in Supabase's SQL Editor, AFTER
-- supabase/installation.sql (it needs 054_three_validators.sql). Never a migration.
-- Run it one step at a time (select the lines, then Run): each step first LOOKS (a select, changes nothing),
-- then CHANGES (a single statement: all of it or nothing). Read what the look shows before running the change.
-- A validator that goes is put back as it was found: its block back to a dark validator (73) for anyone to
-- relight, its seal (item 203) taken out of its owner's chest, its row deleted.

-- ============================================================================================================
-- 1. Three validators at most: everyone keeps their three rarest (legendary, epic, rare, common; then the
--    highest level, then the first relit), the others go back to dark ruins.
-- ============================================================================================================

-- 1a. LOOK: who runs more than three, and which ones would go (n > 3)
with ranked as (
  select v.id, v.owner_name, v.rarity, v.level, v.x, v.y, v.z,
    row_number() over (partition by v.owner
      order by case v.rarity when 'legendary' then 0 when 'epic' then 1 when 'rare' then 2 else 3 end, v.level desc, v.reanimated_at nulls last, v.id) as n
  from validators v where v.world = 'principal' and v.owner is not null
)
select owner_name, n, rarity, level, x, y, z, case when n > 3 then 'GOES' else 'kept' end as fate
from ranked
where owner_name in (select owner_name from ranked group by owner_name having count(*) > 3)
order by owner_name, n;

-- 1b. CHANGE (one statement: Supabase's SQL Editor runs each statement apart, a temp table wouldn't last)
with gone as (
  select id, x, y, z from (
    select v.id, v.x, v.y, v.z,
      row_number() over (partition by v.owner
        order by case v.rarity when 'legendary' then 0 when 'epic' then 1 when 'rare' then 2 else 3 end, v.level desc, v.reanimated_at nulls last, v.id) as n
    from validators v where v.world = 'principal' and v.owner is not null
  ) r where n > 3
),
seals as (delete from uniques u using gone g where u.world = 'principal' and u.item = 203 and u.validator_id = g.id returning 1),
ruins as (update blocks b set id = 73, placed_by = null, placed_name = null
  from gone g where b.world = 'principal' and b.x = g.x and b.y = g.y and b.z = g.z and b.id = 74 returning 1),
vals as (delete from validators v using gone g where v.id = g.id returning 1)
select (select count(*) from vals) as validators_gone, (select count(*) from ruins) as ruins_dark_again, (select count(*) from seals) as seals_gone;
-- then 1a again: it should show nothing

-- ============================================================================================================
-- 2. Your own game in principal, from zero: the account named Pierre (its login and password stay; the
--    purchases paid in euros stay in billing.purchases and come back on their own). Your validators go back
--    to dark ruins, your chest, your uniques, your Gwei, your cosmetics bought with Gwei, your plots, your
--    trade offers go. The blocks you built outside a plot go with step 3.
-- ============================================================================================================

-- 2a. LOOK: the account, its game here
select l.login, l.user_id, p.name, p.gwei, p.gwei_earned,
  (select count(*) from validators v where v.world = 'principal' and v.owner = l.user_id) as validators,
  (select count(*) from uniques u where u.world = 'principal' and u.user_id = l.user_id) as uniques,
  (select count(*) from claims c where c.world = 'principal' and c.owner = l.user_id) as plots
from logins l left join players p on p.user_id = l.user_id and p.world = 'principal'
where l.login_key = 'pierre';

-- 2b. CHANGE (one statement, as in 1b)
with me as (select user_id as id from logins where login_key = 'pierre'),
mine as (select v.id, v.x, v.y, v.z from validators v, me where v.world = 'principal' and v.owner = me.id),
u as (delete from uniques x using me where x.world = 'principal'
        and (x.user_id = me.id or (x.item = 203 and x.validator_id in (select id from mine))) returning 1),
b as (update blocks bl set id = 73, placed_by = null, placed_name = null from mine g
        where bl.world = 'principal' and bl.x = g.x and bl.y = g.y and bl.z = g.z and bl.id = 74 returning 1),
v as (delete from validators vv using mine g where vv.id = g.id returning 1),
i as (delete from inventory x using me where x.world = 'principal' and x.user_id = me.id returning 1),
c as (delete from cosmetics_owned x using me where x.world = 'principal' and x.user_id = me.id returning 1),
pl as (delete from claims x using me where x.world = 'principal' and x.owner = me.id returning 1),
o as (delete from offers x using me where x.world = 'principal' and (x.from_user = me.id or x.to_user = me.id) returning 1),
p as (delete from players x using me where x.world = 'principal' and x.user_id = me.id returning 1),
d as (delete from play_days where world = 'principal' and who = 'pierre' returning 1)
select (select count(*) from v) as validators, (select count(*) from u) as uniques, (select count(*) from pl) as plots,
       (select count(*) from i) as inventory_rows, (select count(*) from p) as player_rows;
-- Then on each of your devices: log in again with Pierre and your password; the game starts from zero.

-- ============================================================================================================
-- 3. The map: every block changed outside the plots erased, the terrain regenerated from the generator
--    deployed now (deploy the freeze function first). Chests, signs and the validators' ruins stay.
-- ============================================================================================================

-- 3a. LOOK (changes nothing)
select admin_restore_world('principal', false, true);

-- 3b. CHANGE
select admin_restore_world('principal', true, true);
