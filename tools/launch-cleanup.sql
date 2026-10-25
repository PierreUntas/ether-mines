-- The launch's clean-up in the players' world (principal), by hand in Supabase's SQL Editor, AFTER
-- supabase/installation.sql (it needs 054_three_validators.sql). Never a migration.
-- Run it one step at a time: each step first LOOKS (a select, changes nothing), then CHANGES (between begin
-- and commit). Read what the look shows before running the change. If a change shows something wrong before
-- its commit, run rollback; instead and nothing is changed.
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

-- 1b. CHANGE
begin;
create temp table gone on commit drop as
  select id, x, y, z from (
    select v.id, v.x, v.y, v.z,
      row_number() over (partition by v.owner
        order by case v.rarity when 'legendary' then 0 when 'epic' then 1 when 'rare' then 2 else 3 end, v.level desc, v.reanimated_at nulls last, v.id) as n
    from validators v where v.world = 'principal' and v.owner is not null
  ) r where n > 3;
delete from uniques u using gone g where u.world = 'principal' and u.item = 203 and u.validator_id = g.id;
update blocks b set id = 73, placed_by = null, placed_name = null
  from gone g where b.world = 'principal' and b.x = g.x and b.y = g.y and b.z = g.z and b.id = 74;
delete from validators v using gone g where v.id = g.id;
select count(*) as validators_gone from gone;
-- nobody left above three:
select owner_name, count(*) from validators where world = 'principal' and owner is not null group by owner_name having count(*) > 3;
commit;

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

-- 2b. CHANGE
begin;
create temp table me on commit drop as select user_id from logins where login_key = 'pierre';
create temp table mine on commit drop as
  select v.id, v.x, v.y, v.z from validators v where v.world = 'principal' and v.owner in (select user_id from me);
delete from uniques u using mine g where u.world = 'principal' and u.item = 203 and u.validator_id = g.id;
update blocks b set id = 73, placed_by = null, placed_name = null
  from mine g where b.world = 'principal' and b.x = g.x and b.y = g.y and b.z = g.z and b.id = 74;
delete from validators v using mine g where v.id = g.id;
delete from inventory where world = 'principal' and user_id in (select user_id from me);
delete from uniques where world = 'principal' and user_id in (select user_id from me);
delete from cosmetics_owned where world = 'principal' and user_id in (select user_id from me);
delete from claims where world = 'principal' and owner in (select user_id from me);
delete from offers where world = 'principal' and (from_user in (select user_id from me) or to_user in (select user_id from me));
delete from players where world = 'principal' and user_id in (select user_id from me);
delete from play_days where world = 'principal' and who = 'pierre';
select count(*) as your_validators_gone from mine;
commit;
-- Then on each of your devices: log in again with Pierre and your password; the game starts from zero.

-- ============================================================================================================
-- 3. The map: every block changed outside the plots erased, the terrain regenerated from the generator
--    deployed now (deploy the freeze function first). Chests, signs and the validators' ruins stay.
-- ============================================================================================================

-- 3a. LOOK (changes nothing)
select admin_restore_world('principal', false, true);

-- 3b. CHANGE
select admin_restore_world('principal', true, true);
