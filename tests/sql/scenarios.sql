-- Game and cheating scenarios against the schema (001_schema.sql + rules.sql).
-- Run by tests/sql/run.sh. Any failing check stops everything with a clear message.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;
-- a forbidden action must be refused by Postgres (rights or RLS rules)
create function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: % (accepted when it should have been refused)', label;
exception when insufficient_privilege then raise notice 'ok: % (refused)', label;
end $$;
-- a constraint (not a rights/RLS rule) must refuse the statement, e.g. a partial unique index
create function pg_temp.refused_by_constraint(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: % (accepted when it should have been refused)', label;
exception when unique_violation then raise notice 'ok: % (refused)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

select v as gy from fixtures where k = 'gy' \gset
select v as gid from fixtures where k = 'gid' \gset
select v as s1 from fixtures where k = 's1' \gset
select v as s2 from fixtures where k = 's2' \gset
select v as s3 from fixtures where k = 's3' \gset
select v as rx from fixtures where k = 'rx' \gset
select v as ry from fixtures where k = 'ry' \gset
select v as rz from fixtures where k = 'rz' \gset
select v as tcx from fixtures where k = 'tcx' \gset
select v as tcy from fixtures where k = 'tcy' \gset
select v as tcz from fixtures where k = 'tcz' \gset
grant select on fixtures, samples to authenticated;

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');

-- ---------- the server reads terrain exactly like the generator ----------
select pg_temp.ok('SQL terrain decode = JS generator (' || count(*) || ' cells)', bool_and(public._cell('w', x, y, z) = v)) from samples;

-- ---------- player A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('mine grass by hand', (act_mine('w', 20, :gy, 3, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('grass drops dirt', (select n from inventory where item = 2) = 1);
select pg_temp.ok('granite refused by hand', act_mine('w', 20, :s1, 3, null, 20.5, :s1 + 1, 4.5) ->> 'err' = 'tool too weak');
reset role;
update players set pos_at = now() - interval '1 hour';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
do $$ begin perform act_mine('w', 500, 30, 500, null, 500.5, 31, 502.5); raise exception 'FAILED: un-frozen chunk accepted';
exception when raise_exception then if sqlerrm not like 'freeze:%' then raise; end if; raise notice 'ok: un-frozen chunk → asks to "freeze"'; end $$;

reset role;
update players set name = 'Pierre', pos_x = 20.5, pos_y = :s1 + 1, pos_z = 4.5, pos_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 9, 12), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 101, 15),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 48, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 13, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 105, 1);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

select pg_temp.ok('craft a wooden pickaxe', act_craft('w', 102) -> 'inv' ->> '102' = '1');
select pg_temp.ok('craft a volt blade', act_craft('w', 106) -> 'inv' ->> '106' = '1');
select pg_temp.ok('craft volt plating', act_craft('w', 108) -> 'inv' ->> '108' = '1');
select pg_temp.ok('craft the crystal pickaxe (unique item #1)', act_craft('w', 201) -> 'unique' ->> 'serial' = '1');
select pg_temp.ok('unknown recipe refused', act_craft('w', 999) ->> 'err' = 'unknown recipe');
select pg_sleep(1.2);
select pg_temp.ok('granite with the crystal pickaxe', (act_mine('w', 20, :s1, 3, 'nft1', 20.5, :s1 + 1, 4.5) ->> 'ok')::boolean);
select pg_temp.ok('granite right after: too fast', act_mine('w', 20, :s2, 3, '102', 20.5, :s1 + 1, 4.5) ->> 'err' = 'too fast');
select pg_temp.ok('another player''s unique item (nft9): bare-hand tier', (select act_mine('w', 20, :s3, 3, 'nft9', 20.5, :s1 + 1, 4.5) ->> 'err') in ('tool too weak', 'too fast'));
select pg_temp.ok('unique pickaxe''s mining counter', (select mined from uniques where serial = 1) = 1);

select pg_temp.ok('place a door (two halves)', jsonb_array_length(act_place('w', 20, :gy, 3, 48, 52, 20.5, :gy + 1, 6.5) -> 'changes') = 2);
select pg_temp.ok('open the door', act_toggle('w', 20, :gy, 3, 20.5, :gy + 1, 6.5) -> 'changes' -> 0 ->> 'id' = '54');

-- bed: a 2-block foot+head placement, same mechanism as the door above (terrain height varies by
-- column, so the two target cells are force-cleared first rather than assumed to already be air)
reset role;
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 137, 1);
select public._set('w', 20, :gy + 1, 10, 0, null, null, null);
select public._set('w', 21, :gy + 1, 10, 0, null, null, null);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('place a bed (two halves: foot + head)', jsonb_array_length(act_place('w', 20, :gy + 1, 10, 137, 140, 20.5, :gy + 1, 9.5) -> 'changes') = 2);
reset role;
select pg_temp.ok('the head sits 4 ids past the foot, one cell further in the facing direction', public._cell('w', 21, :gy + 1, 10) = 144);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_sleep(0.5);
select pg_temp.ok('mine the head half: exactly one bed item back', act_mine('w', 21, :gy + 1, 10, null, 20.5, :gy + 1, 9.5) -> 'got' ->> 'item' = '137');
reset role;
select pg_temp.ok('mining either half clears both cells', public._cell('w', 20, :gy + 1, 10) = 0 and public._cell('w', 21, :gy + 1, 10) = 0);
select pg_temp.ok('exactly one bed item in the inventory after mining either half', (select n from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and item = 137) = 1);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('place an item missing from the inventory', act_place('w', 21, :gy + 1, 3, 70, 70, 20.5, :gy + 1, 6.5) ->> 'err' = 'empty inventory');
select pg_temp.ok('turn an item into something else', act_place('w', 21, :gy + 1, 3, 48, 13, 20.5, :gy + 1, 6.5) ->> 'err' = 'item not placeable');
-- 031: a validator is relit, never built: a Validator block left in a chest can't be placed
reset role;
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 13, 1) on conflict (user_id, world, item) do update set n = 1;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('a validator is never built', act_place('w', 21, :gy + 1, 3, 13, 13, 20.5, :gy + 1, 6.5) ->> 'err' = 'validators are relit, not built');
select pg_temp.ok('no validators row from a refused placement', not exists (select 1 from validators where world = 'w' and x = 21 and z = 3));
select pg_temp.ok('no validator recipe left', not exists (select 1 from rule_recipes where out_item = 13));
select pg_temp.ok('block out of reach', act_mine('w', 30, :gy, 3, null, 20.5, :gy + 1, 6.5) ->> 'err' = 'too far');
select pg_temp.ok('teleport refused', act_mine('w', 300, 30, 300, null, 300.5, 31, 302.5) ->> 'err' = 'impossible move');
select pg_temp.ok('return to the sanctuary allowed', act_mine('w', 8, 32, 8, null, 8.5, 33, 10.5) ->> 'err' = 'protected');
select pg_temp.ok('position ping', (act_pos('w', 10.5, 33, 10.5) ->> 'ok')::boolean);
reset role;
update players set pos_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('claim a chunk from a distance', act_claim('w', 2, 0, 20.5, :gy + 1, 6.5) ->> 'err' = 'must be inside the claim');
select pg_temp.ok('claim a chunk', (act_claim('w', 1, 0, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('the claim costs 2 crystals', (select n from inventory where item = 101) = 5);
select pg_temp.ok('claim the sanctuary', act_claim('w', 0, 0, 8.5, 33, 10.5) ->> 'ok' = 'false');
reset role;
update players set pos_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('relight refused: the fourth column is still broken', act_relight('w', :rx, :ry, :rz, :rx + 0.5, :ry, :rz + 2.5) ->> 'err' = 'rebuild the fourth column first');
reset role;
select public._set('w', :rx + 2, :ry, :rz + 2, 127, null, null, null);
select public._set('w', :rx + 2, :ry + 1, :rz + 2, 127, null, null, null);
select public._set('w', :rx + 2, :ry + 2, :rz + 2, 127, null, null, null);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('relight the ruin', act_relight('w', :rx, :ry, :rz, :rx + 0.5, :ry, :rz + 2.5) -> 'unique' ->> 'id' = '203');
select pg_temp.ok('the network counts the relit validator', (act_network('w') ->> 'n')::int = 1 and act_network('w') -> 'top' -> 0 ->> 'n' = '1');
select pg_temp.ok('the old validator is signed', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---------- validators (020): the seal is bound to a validators row, one seal per validator ----------
reset role;
select id as vid from validators where world = 'w' and x = :rx and y = :ry and z = :rz \gset
select pg_temp.ok('relight created a validators row', :vid is not null);
select pg_temp.ok('the seal points at that validator', (select validator_id from uniques where item = 203) = :vid);
select pg_temp.ok('the validator starts active, level 1', (select state || ',' || level from validators where id = :vid) = 'active,1');
select pg_temp.refused_by_constraint('a second seal for the same validator (one seal per validator)',
  format($f$insert into uniques (user_id, world, serial, item, validator_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 999, 203, %s)$f$, :vid));
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

select pg_temp.ok('brand-new account: no gift', act_gift('w', '3,4:0', 'sheep') ->> 'err' = 'the animals do not know you yet');
reset role;
update players set created_at = now() - interval '1 day';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('gift from the sheep', act_gift('w', '3,4:0', 'sheep') -> 'inv' ->> '71' = '1');
select pg_temp.ok('same gift twice', act_gift('w', '3,4:0', 'sheep') ->> 'ok' = 'false');

-- ---------- direct cheating: everything must be refused ----------
select pg_temp.refused('write a block', $q$insert into blocks (world, x, y, z, id) values ('w', 0, 40, 0, 70)$q$);
select pg_temp.refused('give yourself items', $q$insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 70, 999)$q$);
select pg_temp.refused('modify your serial counter', $q$update players set serial = 0$q$);
select pg_temp.refused('invent terrain', $q$insert into chunks (world, cx, cz, gen, sy, data) values ('w', 9, 9, 1, 64, 'x')$q$);
select pg_temp.refused('call an internal function', $q$select _give('aaaaaaaa-0000-0000-0000-000000000001', 'w', 70, 999, '{}')$q$);
select pg_temp.refused('create yourself a unique item', $q$insert into uniques (user_id, world, serial, item) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 99, 202)$q$);
update players set state = '{"bar": 1}';
select pg_temp.ok('preferences stay editable', (select state ->> 'bar' from players) = '1');
select set_recovery_code() as code \gset

-- ---------- validator production and maintenance (021): Gwei, not Ether Crystal ----------
reset role;
update validators set gwei_per_cycle = 12, maintenance_cost = 2,
  last_cycle_at = now() - interval '10 minutes', last_attested_at = now() - interval '2 minutes'
  where id = :vid;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('attesting a maintained validator pays net production (2 cycles x 10), no reach needed',
  (act_maintain_validator('w', :vid) ->> 'gwei')::int = 20);
select pg_temp.ok('gwei credited to the player, not the inventory', (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 20);
reset role;
-- proves the no-reach-check claim for real: far enough that a position check would refuse "too far"
update players set pos_x = 50000, pos_y = 40, pos_z = 50000, pos_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('attesting works from anywhere, not just next to the validator', (act_maintain_validator('w', :vid) ->> 'ok')::boolean);
reset role;
-- back to a normal in-world spot: this row (position included) later becomes B's via claim_recovery,
-- and a stray far-away position would otherwise break B's own position checks much further down
update players set pos_x = 20.5, pos_y = :gy + 1, pos_z = 6.5, pos_at = null where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- attested 6 days ago (044: the health check's window is 8 days): still healthy
begin;
update validators set last_cycle_at = now() - interval '25 hours', last_attested_at = now() - interval '6 days' where id = :vid;
select _tick_validator('w', :vid) \g /dev/null
select pg_temp.ok('a validator attested 6 days ago is still healthy',
  (select state || ',' || missed_cycles from validators where id = :vid) = 'active,0');
rollback;
-- left damaged by the old rule, attested 3 days ago: active again (044: no damaged step any more)
begin;
update validators set state = 'damaged', last_cycle_at = now() - interval '1 hour', last_attested_at = now() - interval '3 days' where id = :vid;
select _tick_validator('w', :vid) \g /dev/null
select pg_temp.ok('a validator the old rule left damaged is active again',
  (select state from validators where id = :vid) = 'active');
rollback;
-- 15 minutes past the 8 days: corrupted at once (no damaged step)
begin;
update validators set last_cycle_at = now() - interval '15 minutes', last_attested_at = now() - interval '8 days 15 minutes' where id = :vid;
select _tick_validator('w', :vid) \g /dev/null
select pg_temp.ok('8 days without an attestation: corrupted, never damaged',
  (select state from validators where id = :vid) = 'corrupted');
rollback;
-- silence for 9 days (past the 8 days' health-check grace window): production still pays out in full
-- (24h catch-up cap -> 288 cycles), only the health check is missed and the validator degrades
update validators set last_cycle_at = now() - interval '25 hours', last_attested_at = now() - interval '9 days' where id = :vid;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('neglect past the grace window still pays out production (288 cycles x 10 net)',
  (act_rewards('w') ->> 'gained')::int = 2880);
reset role;
select pg_temp.ok('288 missed health checks degrade the validator to corrupted',
  (select state || ',' || missed_cycles from validators where id = :vid) = 'corrupted,288');
select pg_temp.ok('balance reflects the production that was never clawed back (20 + 2880)',
  (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2900);
-- pin last_cycle_at to "now" so the next calls' own ticks are no-ops: keeps the balance assertions below exact
update validators set last_cycle_at = now() where id = :vid;
delete from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and world = 'w' and item = 105;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('attesting a corrupted validator without a validator heart is refused',
  act_maintain_validator('w', :vid) ->> 'err' = 'corrupted: needs a validator heart to repair');
select pg_temp.ok('a refused repair attempt does not touch the balance', (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2900);
reset role;
insert into inventory (user_id, world, item, n) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 105, 1)
  on conflict (user_id, world, item) do update set n = 1;
delete from rate_limits where kind = 'maintain_validator'; -- the burst of 3 was already spent by the calls above
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('a validator heart repairs a corrupted validator',
  act_maintain_validator('w', :vid) -> 'validator' ->> 'state' = 'active');
select pg_temp.ok('the heart was consumed', (select coalesce(n, 0) from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and world = 'w' and item = 105) = 0);
select pg_temp.ok('no elapsed cycle since the repair: balance unchanged', (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2900);
-- upgrade: 50 gwei at level 1, raises both production and upkeep
reset role;
update players set gwei = 1000 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('upgrade costs 50 gwei at level 1', (act_upgrade_validator('w', :vid) ->> 'cost')::int = 50);
select pg_temp.ok('level 2, balance debited', (select level from validators where id = :vid) = 2
  and (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 950);
-- cosmetics (022): bought with gwei, no gameplay effect, never twice
select pg_temp.ok('buy a block-pack cosmetic: grants the blocks', (act_buy_cosmetic('w', 5) -> 'inv' ->> '128')::int = 8);
select pg_temp.ok('gwei debited by its price', (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 750);
-- 032: a block pack can be bought again (it just grants more blocks); a wearable only once
select pg_temp.ok('a block pack can be bought again', (act_buy_cosmetic('w', 5) -> 'inv' ->> '128')::int = 16);
select pg_temp.ok('... and is paid again', (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 550);
select pg_temp.ok('a wearable is bought once', act_buy_cosmetic('w', 42) ->> 'ok' = 'true');
select pg_temp.ok('... and never twice', act_buy_cosmetic('w', 42) ->> 'err' = 'already owned');
reset role;
update players set gwei = 50 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('an unaffordable cosmetic is refused, no debit', act_buy_cosmetic('w', 4) ->> 'err' = 'not enough gwei'
  and (select gwei from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 50);

-- ---------- player B ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B can''t see A''s inventory', (select count(*) from inventory) = 0);
select pg_temp.ok('B mines in A''s claim', act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'err' = 'protected');
select pg_temp.ok('B opens A''s door', act_toggle('w', 20, :gy, 3, 20.5, :gy + 1, 6.5) ->> 'err' = 'protected');
reset role;
insert into players (user_id, world, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 'Lea') on conflict (user_id, world) do update set name = 'Lea';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('A invites Lea', (act_member('w', 'lea', true) ->> 'ok')::boolean);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B mines at A''s place after the invite', (act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('B can''t attest A''s validator (no reach check, ownership still enforced)', act_maintain_validator('w', :vid) ->> 'err' = 'not your validator');
select pg_temp.ok('B can''t upgrade A''s validator', act_upgrade_validator('w', :vid) ->> 'err' = 'not your validator');

-- ---------- recovering a game by code ----------
select pg_temp.ok('unknown code refused', claim_recovery('0000-0000-0000-0000') = -1);
select pg_temp.ok('B recovers A''s game', claim_recovery(:'code') = 1);
select pg_temp.ok('the inventory moved over, without duplicates', (select n from inventory where item = 101) = 5 and (select count(*) from inventory where item = 2) = 1);
select pg_temp.ok('the unique items followed', (select count(*) from uniques) = 2);
reset role;
select pg_temp.ok('A has nothing left', (select count(*) from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
select pg_temp.ok('signed blocks followed', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('the claim followed', (select owner from claims where cx = 1 and cz = 0) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('the validator followed', (select owner from validators where id = :vid) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('the owned cosmetic followed', (select user_id from cosmetics_owned where cosmetic_id = 5) = 'bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('rate limit: 20 crafts in a row, some refused', (select count(*) filter (where act_craft('w', 999) ->> 'err' = 'too many actions') from generate_series(1, 20)) >= 5);
do $$ declare i int; n int := 0; begin
  for i in 1..6 loop
    begin
      if claim_recovery('0000-0000-0000-000' || i) <> -1 then raise exception 'FAILED: a made-up code was accepted'; end if;
    exception when raise_exception then
      if sqlerrm like 'FAILED%' then raise; end if;
      if sqlerrm like 'too many attempts%' then n := n + 1; end if;
    end;
  end loop;
  if n < 3 then raise exception 'FAILED: no limit on code guesses (% refusals)', n; end if;
  raise notice 'ok: mass code guessing throttled';
end $$;
reset role;
-- ---------- chat, reports, errors (003) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('chat: message accepted', (act_chat('w', '  hello   everyone ') ->> 'text') = 'hello everyone');
select pg_temp.ok('chat: username taken from the game record', (select name from chat order by id desc limit 1) = 'Pierre');
select pg_temp.ok('chat: insult masked', act_chat('w', 'You BITCH !') ->> 'text' = 'You ***** !');
select pg_temp.ok('chat: word containing an insult left as is', act_chat('w', 'bitching') ->> 'text' = 'bitching');
select pg_temp.refused('write to chat without going through the server', $q$insert into chat (world, user_id, name, color, text) values ('w', 'bbbbbbbb-0000-0000-0000-000000000002', 'Admin', '#fff', 'x')$q$);
select pg_temp.ok('chat: burst throttled', (select count(*) filter (where act_chat('w', 'spam') ->> 'err' = 'too many actions') from generate_series(1, 10)) >= 8);
select pg_temp.refused('unmute yourself', $q$update players set muted_until = null where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$);
reset role;
insert into auth.users values ('cccccccc-0000-0000-0000-000000000003'), ('dddddddd-0000-0000-0000-000000000004'), ('eeeeeeee-0000-0000-0000-000000000005');
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('brand-new account: report refused', act_report('w', 'pierre') ->> 'err' = 'must have played a little');
reset role;
update players set mine_at = now(), serial = 20, created_at = now() - interval '1 day' where user_id in ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000005');
insert into players (user_id, world, mine_at, serial, created_at) values ('dddddddd-0000-0000-0000-000000000004', 'w', now(), 20, now() - interval '1 day'), ('eeeeeeee-0000-0000-0000-000000000005', 'w', now(), 20, now() - interval '1 day') on conflict do nothing;
set role authenticated;
select pg_temp.ok('report an unknown player', act_report('w', 'nobody') ->> 'err' = 'unknown player');
select pg_temp.ok('first report', act_report('w', 'pierre') ->> 'muted' = 'false');
select pg_temp.ok('reporting twice counts once', act_report('w', 'pierre') ->> 'muted' = 'false');
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('second report', act_report('w', 'Pierre') ->> 'muted' = 'false');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false) \g /dev/null
select pg_temp.ok('third report: muted', act_report('w', 'Pierre') ->> 'muted' = 'true');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('a muted player can''t speak', act_chat('w', 'hi') ->> 'err' = 'muted');
select log_error('w', 'TypeError: x is undefined', 'at f (src/game/05-player.js:1)', '/src/game/05-player.js', 'test');
select log_error('w', 'TypeError: x is undefined', null, null, 'test');
select pg_temp.ok('errors are not readable by players', (select count(*) from client_errors) = 0);
reset role;
select pg_temp.ok('repeated error counted once', (select n from client_errors where msg = 'TypeError: x is undefined') = 2);
select pg_temp.ok('muted for one hour', (select muted_until between now() + interval '59 minutes' and now() + interval '61 minutes' from players where name = 'Pierre'));
-- ---------- chests (004) ----------
reset role;
update players set pos_at = now() - interval '1 minute', mine_at = now() - interval '1 minute';
insert into inventory (user_id, world, item, n) values ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 98, 1), ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 3, 10)
  on conflict (user_id, world, item) do update set n = excluded.n;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('place a chest', (act_place('w', 21, :gy, 4, 98, 98, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('new chest is empty', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 6.5) -> 'items' = '{}'::jsonb);
select pg_temp.ok('deposit 3 granite', act_chest_move('w', 21, :gy, 4, 3, 3, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '3');
select pg_temp.ok('the bag lost 3 granite', (select n from inventory where item = 3) = 7);
select pg_temp.ok('deposit more than you have', act_chest_move('w', 21, :gy, 4, 3, 50, 20.5, :gy + 1, 6.5) ->> 'err' = 'not enough in your bag');
select pg_temp.ok('withdraw 2 granite', act_chest_move('w', 21, :gy, 4, 3, -2, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '1');
select pg_temp.ok('withdraw more than there is: only the rest', act_chest_move('w', 21, :gy, 4, 3, -9, 20.5, :gy + 1, 6.5) -> 'items' = '{}'::jsonb);
select pg_temp.ok('deposit again', act_chest_move('w', 21, :gy, 4, 3, 4, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '4');
select pg_temp.ok('open a chest that doesn''t exist', act_chest('w', 20, :gy, 4, 20.5, :gy + 1, 6.5) ->> 'err' = 'no chest here');
select pg_temp.ok('chest out of reach', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 12.5) ->> 'err' = 'too far');
select pg_temp.ok('chests aren''t readable directly', (select count(*) from chests) = 0);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('chest in another player''s claim: closed', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 6.5) ->> 'err' = 'protected');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('break the chest', (act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('its contents return to the bag', (select n from inventory where item = 3) = 10);
select pg_temp.ok('the broken chest comes back too', (select n from inventory where item = 98) = 1);
reset role;
select pg_temp.ok('no chest recorded anymore', (select count(*) from chests) = 0);
-- ---------- username hardening (005) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.refused('delete your own record to reset your counters', $q$delete from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$);
do $$ begin
  update players set world = 'elsewhere' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
  raise exception 'FAILED: record moved to another world';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: moving your record (refused)';
end $$;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  update players set name = 'pierre' where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w';
  raise exception 'FAILED: someone else''s username accepted';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: taking someone else''s username (refused)';
end $$;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
update players set name = '  ' || repeat('x', 500) || chr(8203) || '  ', color = 'javascript:alert(1)' where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w';
select pg_temp.ok('username cut to 20 characters, color fixed', (select char_length(name) = 20 and color = '#8a7bef' from players where world = 'w'));
select pg_temp.ok('new game without deleting the record', (act_new_game('w') ->> 'ok')::boolean and (select state = '{}'::jsonb and serial = 20 from players where world = 'w'));
select pg_temp.ok('the jellyfish gifts a crystal', act_gift('w', '9,9:1', 'jellyfish') ->> 'item' = '101');
select pg_temp.ok('huge chat message refused', act_chat('w', repeat('a', 5000)) ->> 'err' = 'message too long');
reset role;
-- a validator just placed produces nothing until a full cycle (5 minutes) has elapsed
insert into blocks (world, x, y, z, id, placed_by) values ('w', 120, 40, 120, 13, 'cccccccc-0000-0000-0000-000000000003');
insert into validators (world, x, y, z, owner, owner_name, state, rarity, level, gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at, last_attested_at)
  values ('w', 120, 40, 120, 'cccccccc-0000-0000-0000-000000000003', 'c', 'active', 'common', 1, 12, 2, now(), now(), now());
delete from rate_limits where kind = 'rewards';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('freshly placed validator produces nothing yet (0 elapsed cycles)', (act_rewards('w') ->> 'gained')::int = 0);
reset role;
-- ---------- public zones (006) ----------
reset role;
update players set pos_at = now() - interval '1 hour', mine_at = now() - interval '1 minute';
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('mine a column of the Atrium', act_mine('w', 14, 34, 10, null, 12.5, 33, 8.5) ->> 'err' = 'protected');
select pg_temp.ok('claim a chunk of the Atrium', act_claim('w', 0, 0, 12.5, 33, 8.5) ->> 'ok' = 'false');
reset role;
select pg_temp.ok('the City zone is protected', _public_zone(8, -56) and _public_zone(30, -56) and not _public_zone(8, -20) and not _public_zone(20, 3));

-- toggling a door/lever is reversible, so it stays allowed in public zones even though mining/placing/claiming don't (011_toggle_public.sql)
select public._set('w', 12, 34, 8, 48, null, null, null);
select public._set('w', 12, 35, 8, 49, null, null, null);
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('open a door inside the Atrium (toggle allowed in public zones)', (act_toggle('w', 12, 34, 8, 12.5, 33, 8.5) ->> 'ok')::boolean);
reset role;
select pg_temp.ok('the door actually opened (both halves)', public._cell('w', 12, 34, 8) = 50 and public._cell('w', 12, 35, 8) = 51);

-- mob loot (013_mob_loot.sql): a thematic, chance-based resource on a reported kill, rate-limited and
-- position-checked since the server can't re-derive "which mob died" the way it can a block.
-- 'loot_mob' is a fresh rate-limit kind here, so the burst (5) starts full without needing a reset.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
do $$
declare got boolean := false; ok_count int := 0; res jsonb;
begin
  for i in 1..5 loop
    res := act_loot_mob('w', 'wraith', 12.5, 33, 8.5);
    if (res ->> 'ok')::boolean is true then ok_count := ok_count + 1; end if;
  end loop;
  if ok_count <> 5 then raise exception 'FAILED: expected 5 allowed loot rolls (burst), got %', ok_count; end if;
  res := act_loot_mob('w', 'wraith', 12.5, 33, 8.5);
  if res ->> 'err' <> 'too many actions' then raise exception 'FAILED: 6th loot roll should be rate-limited, got %', res; end if;
  raise notice 'ok: the loot rate limit (burst 5) kicks in after 5 rolls';
end $$;
reset role;
-- the drop itself is random (~55% a roll once 024's Gwei/cosmetic tiers take their share): 40 rolls,
-- the rate limit cleared between each, so a miss is ~1e-14 instead of the ~2% of 5 rolls (it used to flake)
do $$
declare got boolean := false; res jsonb;
begin
  for i in 1..40 loop
    delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
    res := act_loot_mob('w', 'wraith', 12.5, 33, 8.5);
    if res ->> 'item' is not null then got := true; exit; end if;
  end loop;
  if not got then raise exception 'FAILED: wraith never dropped an item over 40 rolls'; end if;
  raise notice 'ok: wraith loot drops an item sometimes';
end $$;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('loot roll refused far from the reported position', act_loot_mob('w', 'wraith', 500.5, 33, 500.5) ->> 'err' = 'impossible move');
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null

-- the Genesis Titan's trophy (015_boss_loot.sql): guaranteed, not chance-based, and rate-limited
-- independently of regular mob loot ('loot_boss', not 'loot_mob')
select pg_temp.ok('the titan always drops its trophy', act_loot_mob('w', 'titan', 12.5, 33, 8.5) -> 'unique' ->> 'id' = '205');
select pg_temp.ok('a second titan claim is refused (burst 1)', act_loot_mob('w', 'titan', 12.5, 33, 8.5) ->> 'err' = 'too many actions');
select pg_temp.ok('regular mob loot is unaffected by the titan rate limit', (act_loot_mob('w', 'shadow', 12.5, 33, 8.5) ->> 'ok')::boolean);
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_boss';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null

-- towers' Plasma Core (016_tower_boss_loot.sql): same guaranteed-drop shape as the Titan, sharing the
-- same 'loot_boss' bucket — grinding one boss type can't be used to out-pace the other
select pg_temp.ok('the plasma core always drops its trophy', act_loot_mob('w', 'plasma_core', 12.5, 33, 8.5) -> 'unique' ->> 'id' = '206');
select pg_temp.ok('a titan claim right after is refused too (shared loot_boss bucket)', act_loot_mob('w', 'titan', 12.5, 33, 8.5) ->> 'err' = 'too many actions');
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_boss';

-- loot tiers (024_loot_tiers.sql): a layered chance of Gwei or a combat-exclusive cosmetic on top of
-- the per-mob resource table above — never on a boss kill, still a guaranteed trophy only. Stays as
-- the postgres role throughout (auth.uid() only reads the jwt claim GUC, same either way) so the
-- mid-loop rate-limit resets below aren't themselves blocked by RLS the way a real player's would be.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
do $$
declare res jsonb; got_gwei boolean := false; got_cosmetic boolean := false; before_gwei bigint; after_gwei bigint;
begin
  select gwei into before_gwei from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
  for i in 1..600 loop -- stops as soon as both tiers showed up; 600 keeps a miss of the ~3% tier at ~1e-8
    res := act_loot_mob('w', 'wraith', 12.5, 33, 8.5);
    if res ->> 'gwei' is not null then got_gwei := true; end if;
    if res ->> 'cosmetic' is not null then got_cosmetic := true; end if;
    exit when got_gwei and got_cosmetic;
    if i % 5 = 0 then delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob'; end if;
  end loop;
  select gwei into after_gwei from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
  if not got_gwei then raise exception 'FAILED: never rolled the rare Gwei tier over 600 kills (~12%% odds each)'; end if;
  if not got_cosmetic then raise exception 'FAILED: never rolled the epic cosmetic tier over 600 kills (~3%% odds each)'; end if;
  if after_gwei <= before_gwei then raise exception 'FAILED: Gwei balance did not increase from rare-tier loot'; end if;
  raise notice 'ok: loot tiers award Gwei and a combat-exclusive cosmetic over enough kills';
end $$;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_boss';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('a combat-exclusive cosmetic cannot be bought even by id', act_buy_cosmetic('w', 11) ->> 'err' = 'not for sale');
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'buy_cosmetic';

-- boss bonus trophies (026_boss_bonus_trophies.sql): an independent ~20% chance of a second unique on
-- top of the guaranteed main one. Stays as postgres (see the loot-tiers block above) so the mid-loop
-- rate-limit resets below aren't themselves blocked by RLS.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
do $$
declare res jsonb; got_bonus boolean := false; n_main int := 0;
begin
  for i in 1..60 loop
    res := act_loot_mob('w', 'titan', 12.5, 33, 8.5);
    if (res -> 'unique' ->> 'id') = '205' then n_main := n_main + 1; end if;
    if (res -> 'bonus' ->> 'id') = '207' then got_bonus := true; end if;
    delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_boss';
  end loop;
  if n_main <> 60 then raise exception 'FAILED: the main trophy should be guaranteed every kill, got % of 60', n_main; end if;
  if not got_bonus then raise exception 'FAILED: never rolled the bonus trophy over 60 titan kills (~20%% odds each)'; end if;
  raise notice 'ok: boss kills still guarantee the main trophy, and sometimes mint a second bonus one';
end $$;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_boss';

-- tower treasure (025_tower_treasure.sql): the chest at (:tcx, :tcy, :tcz) is a synthetic stand-in for
-- a tower's (tests/fixtures.mjs — no real tower lands in this tiny frozen test area) — generator-only,
-- no blocks override row, which is exactly the signal act_chest seeds on.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
reset role;
update players set pos_at = now() - interval '1 hour' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select act_chest('w', :tcx, :tcy, :tcz, :tcx + 0.5, :tcy + 1, :tcz + 0.5) -> 'items' as tchest_items \gset
select pg_temp.ok('tower chest seeded with 15-25 crystals', ((:'tchest_items')::jsonb ->> '101')::int between 15 and 25);
select pg_temp.ok('tower chest seeded with 4-8 pure shards', ((:'tchest_items')::jsonb ->> '103')::int between 4 and 8);
select pg_temp.ok('opening it again gives the same loot, not reseeded',
  act_chest('w', :tcx, :tcy, :tcz, :tcx + 0.5, :tcy + 1, :tcz + 0.5) -> 'items' = (:'tchest_items')::jsonb);
select pg_temp.ok('re-placing a chest at that same spot works (the chest item came back when it broke)',
  (act_place('w', 21, :gy, 4, 98, 98, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('a fresh player-placed chest gets no free treasure',
  act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 6.5) -> 'items' = '{}'::jsonb);
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'chest';

-- network attack event (027_network_attack.sql): _attack_window(ts) is a pure function of its argument,
-- so the boundary is tested with fixed timestamps instead of depending on whatever time the suite runs at.
select pg_temp.ok('attack window: active 3 minutes past the hour', (select active from _attack_window('2026-01-01 12:03:00+00')));
select pg_temp.ok('attack window: closed 11 minutes past the hour', not (select active from _attack_window('2026-01-01 12:11:00+00')));
select pg_temp.ok('attack window: window id is the hour count', (select window_id from _attack_window('2026-01-01 01:00:00+00')) = 490897);
select pg_temp.ok('attack window: ends 10 minutes past the hour', (select ends_at from _attack_window('2026-01-01 12:03:00+00')) = '2026-01-01 12:10:00+00'::timestamptz);

update players set pos_at = now() - interval '1 hour' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('a corrupted node far from the Atrium is refused regardless of the attack window',
  act_loot_mob('w', 'corrupted_node', 50, 1, 50) ->> 'err' = 'too far from the Atrium');
reset role;
update players set pos_at = now() - interval '1 hour' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w'; -- far jump again, same allowance
-- whether a kill near the Atrium is accepted depends on the real attack window at test time (every
-- real hour, 10 minutes of it) — asserted against the window's own live answer, not a fixed expectation.
-- captured here (still postgres): _attack_window is an internal "_" function, only callable directly
-- by the functions that wrap it (security definer), not by "authenticated" itself.
select active as live from _attack_window() \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select act_loot_mob('w', 'corrupted_node', 8.5, 1, 8.5) as node_res \gset
select pg_temp.ok('a corrupted node kill near the Atrium matches the live attack window',
  case when (:'live')::boolean then (:'node_res')::jsonb ->> 'err' is distinct from 'no attack right now'
       else (:'node_res')::jsonb ->> 'err' = 'no attack right now' end);
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'attack_node';

-- resolution (act_network, lazy like _tick_validator's catch-up): two past, unresolved windows are
-- hand-inserted — deterministic regardless of real time — one below the 20-kill threshold, one at it.
-- network_score is seeded so the catch-up loop covers exactly these two windows, no silent-window noise.
select window_id as live_window from _attack_window() \gset
insert into network_score (world, score, last_resolved_window) values ('w', 0, :live_window - 3)
  on conflict (world) do update set score = 0, last_resolved_window = :live_window - 3;
insert into network_events (world, window_id, kills, participants) values
  ('w', :live_window - 2, 7, jsonb_build_object('bbbbbbbb-0000-0000-0000-000000000002', 7)),
  ('w', :live_window - 1, 25, jsonb_build_object('bbbbbbbb-0000-0000-0000-000000000002', 20, 'cccccccc-0000-0000-0000-000000000003', 5));
select coalesce((select gwei from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w'), 0) as b_gwei_before \gset
select coalesce((select gwei from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w'), 0) as c_gwei_before \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('resolving triggers on the next act_network call', (act_network('w') ->> 'ok')::boolean);
reset role;
select pg_temp.ok('below-threshold window: +1 score, no payout',
  (select score from network_score where world = 'w') = 11); -- 1 (below) + 10 (at/above)
select pg_temp.ok('at/above-threshold window: each participant paid 50 gwei',
  (select gwei from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w') = :b_gwei_before + 50
  and (select gwei from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w') = :c_gwei_before + 50);
select pg_temp.ok('winning participants earned the defenders'' cosmetic once',
  (select count(*) from cosmetics_owned where world = 'w' and cosmetic_id = 14
    and user_id in ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003')) = 2);
select pg_temp.ok('both windows marked resolved', (select bool_and(resolved) from network_events where world = 'w' and window_id in (:live_window - 2, :live_window - 1)));
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select (act_network('w') ->> 'ok') as resolved_again_ok \gset
reset role;
select pg_temp.ok('resolving again is a no-op: still ok', :'resolved_again_ok' = 'true');
select pg_temp.ok('resolving again is a no-op: score unchanged', (select score from network_score where world = 'w') = 11);
select pg_temp.ok('resolving again is a no-op: balance unchanged', (select gwei from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w') = :c_gwei_before + 50);
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'network';

-- a successful defense also counts toward each contributor's own tally, not just the payout (028_leaderboard.sql)
select pg_temp.ok('a successful defense counts toward each contributor''s own tally',
  (select defenses_won from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w') = 1
  and (select defenses_won from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w') = 1);
select pg_temp.ok('gwei_earned only grows: C''s fresh cumulative total matches the payout exactly (never spent, so balance = earned)',
  (select gwei_earned from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w') = :c_gwei_before + 50);

-- leaderboard (act_leaderboard, 028_leaderboard.sql): the three rankings reflect what just happened.
select coalesce(name, 'anonymous') as c_name from players where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select act_leaderboard('w') as lb \gset
select pg_temp.ok('leaderboard: C appears in the gwei-earned ranking with the right amount',
  exists (select 1 from jsonb_array_elements((:'lb')::jsonb -> 'gwei') e where e ->> 'name' = :'c_name' and (e ->> 'n')::int = :c_gwei_before + 50));
select pg_temp.ok('leaderboard: C appears in the defenses-repelled ranking',
  exists (select 1 from jsonb_array_elements((:'lb')::jsonb -> 'defenses') e where e ->> 'name' = :'c_name' and (e ->> 'n')::int = 1));
select pg_temp.ok('leaderboard: C''s one active validator (fixture from the 007_network.sql section above) shows up too',
  exists (select 1 from jsonb_array_elements((:'lb')::jsonb -> 'validators') e where e ->> 'name' = 'c' and (e ->> 'n')::int = 1));
reset role;
delete from rate_limits where user_id = 'cccccccc-0000-0000-0000-000000000003' and kind = 'leaderboard';

-- the network's capstone (014_relight_capstone.sql): crossing a shared milestone mints a Validator Star.
-- Run last, after the recovery-by-code section above: player A has no save left in this world (it moved
-- to B), so this relight acts on a brand-new player A, with its own fresh validators row.
select public._set('w', 900, 30, 900, 74, null, null, null); -- a second relit validator elsewhere: count is now 2
select public._set('w', 900, 30, 910, 73, null, null, null); -- a fresh dark validator to relight, column already whole
select public._set('w', 902, 30, 912, 127, null, null, null);
select public._set('w', 902, 31, 912, 127, null, null, null);
select public._set('w', 902, 32, 912, 127, null, null, null);
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 105, 1) on conflict (user_id, world, item) do update set n = 1;
update players set pos_at = null where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'; -- next position is "first known": no distance check
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('crossing a network tier mints a Validator Star', act_relight('w', 900, 30, 910, 900.5, 30, 912.5) -> 'star' ->> 'id' = '204');
select pg_temp.ok('the network now counts 3 relit validators', (select count(*) from blocks where world = 'w' and id = 74) = 3);
reset role;
\echo All SQL scenarios pass.

-- ---------- trading between players (008_trades.sql) ----------
reset role;
insert into auth.users values ('f0000000-0000-0000-0000-000000000006'), ('f0000000-0000-0000-0000-000000000007');
insert into players (user_id, world, name) values ('f0000000-0000-0000-0000-000000000006', 'w', 'Fanny'), ('f0000000-0000-0000-0000-000000000007', 'w', 'Gus');
insert into inventory values ('f0000000-0000-0000-0000-000000000006', 'w', 101, 10), ('f0000000-0000-0000-0000-000000000007', 'w', 9, 30);
insert into uniques (user_id, world, serial, item, place, mined) values
  ('f0000000-0000-0000-0000-000000000006', 'w', 1, 201, 'forge of Fanny', 42),
  ('f0000000-0000-0000-0000-000000000006', 'w', 2, 203, '1, 2, 3', 0),
  ('f0000000-0000-0000-0000-000000000007', 'w', 1, 202, 'forge of Gus', 7);
insert into claims (world, cx, cz, owner, owner_name) values ('w', 40, 40, 'f0000000-0000-0000-0000-000000000006', 'Fanny'), ('w', 41, 40, 'f0000000-0000-0000-0000-000000000007', 'Gus');
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', false) \g /dev/null
select pg_temp.ok('offer to an unknown player', act_offer('w', 'Nobody', '{"items":{"101":1}}', '{}') ->> 'err' = 'unknown player in this world');
select pg_temp.ok('offer giving nothing', act_offer('w', 'Gus', '{}', '{"items":{"9":1}}') ->> 'err' = 'you must give something');
select pg_temp.ok('give more than you have', act_offer('w', 'gus', '{"items":{"101":11}}', '{}') ->> 'missing' = 'resources');
select pg_temp.ok('negative quantity', act_offer('w', 'Gus', '{"items":{"101":-5}}', '{}') ->> 'err' = 'invalid offer');
reset role;
delete from rate_limits;
set role authenticated;
select pg_temp.ok('a seal can''t be traded', act_offer('w', 'Gus', '{"uniques":[2]}', '{}') ->> 'missing' = 'unique item');
select pg_temp.ok('give another player''s claim', act_offer('w', 'Gus', '{"parcels":[[41,40]]}', '{}') ->> 'missing' = 'claim');
select pg_temp.ok('ask for what the other doesn''t have', act_offer('w', 'Gus', '{"items":{"101":1}}', '{"uniques":[201]}') ->> 'err' = 'that player doesn''t have what you''re asking for');
reset role;
delete from rate_limits;
set role authenticated;
select (act_offer('w', 'Gus', '{"items":{"101":4},"uniques":[1],"parcels":[[40,40]]}', '{"items":{"9":20},"uniques":[202],"parcels":[[41,40]]}') ->> 'id') as oid \gset
select pg_temp.ok('offer created', :oid > 0);
select pg_temp.ok('accept your own offer', act_offer_accept('w', :oid) ->> 'err' = 'offer not found');
select pg_temp.ok('the offer shows up in my offers', jsonb_array_length(act_offers('w') -> 'offers') = 1);
select pg_temp.refused('edit an offer by hand', $q$update offers set status = 'accepted'$q$);
select (act_offer('w', 'Gus', '{"items":{"101":10}}', '{}') ->> 'id') as oid2 \gset
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000007', false) \g /dev/null
select pg_temp.ok('Gus sees both of his offers', jsonb_array_length(act_offers('w') -> 'offers') = 2);
select pg_temp.ok('trade accepted', (act_offer_accept('w', :oid) ->> 'ok')::boolean);
select pg_temp.ok('accept twice', act_offer_accept('w', :oid) ->> 'err' = 'this offer is no longer open');
select pg_temp.ok('a gift promised twice no longer goes through', act_offer_accept('w', :oid2) ->> 'missing' = 'resources');
select pg_temp.ok('decline an offer', (act_offer_close('w', :oid2) ->> 'ok')::boolean);
reset role;
select pg_temp.ok('resources traded', (select array_agg(right(user_id::text, 1) || ':' || item || ':' || n order by user_id, item) from inventory where user_id::text like 'f0%' and n > 0)
  = array['6:9:20', '6:101:6', '7:9:10', '7:101:4']);
select pg_temp.ok('unique items traded, with their history', (select array_agg(right(user_id::text, 1) || ':' || item || ':' || mined order by user_id, item) from uniques where user_id::text like 'f0%')
  = array['6:202:7', '6:203:0', '7:201:42']);
select pg_temp.ok('claims traded', (select owner_name from claims where world = 'w' and cx = 40 and cz = 40) = 'Gus' and (select owner_name from claims where world = 'w' and cx = 41 and cz = 40) = 'Fanny');
select pg_temp.ok('offers closed', (select array_agg(status order by id) from offers) = array['accepted', 'declined']);

-- ---------- story chapters (029_chapters.sql): a reward only against proofs the server checks ----------
reset role;
insert into auth.users values ('c4000000-0000-0000-0000-000000000004');
insert into players (user_id, world, name) values ('c4000000-0000-0000-0000-000000000004', 'w', 'Hana');
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('claiming a chapter without its proof is refused', act_claim_chapter('w', 'genesis') ->> 'err' = 'chapter not finished');
select pg_temp.ok('an unknown chapter is refused', act_claim_chapter('w', 'nope') ->> 'err' = 'unknown chapter');
select pg_temp.ok('a title can''t be bought', act_buy_cosmetic('w', 15) ->> 'err' = 'not for sale');
reset role;
insert into inventory values ('c4000000-0000-0000-0000-000000000004', 'w', 102, 1);
delete from rate_limits;
set role authenticated;
select pg_temp.ok('genesis pays 50 Gwei', (act_claim_chapter('w', 'genesis') ->> 'gwei')::int = 50);
select pg_temp.ok('... and grants the Pathfinder title', exists (select 1 from cosmetics_owned where user_id = 'c4000000-0000-0000-0000-000000000004' and cosmetic_id = 15));
select pg_temp.ok('a chapter pays only once', act_claim_chapter('w', 'genesis') ->> 'err' = 'already claimed');
select pg_temp.ok('the forge needs the pure ether pickaxe', act_claim_chapter('w', 'forge') ->> 'err' = 'chapter not finished');
select pg_temp.ok('the network chapter needs its proofs', act_claim_chapter('w', 'network') ->> 'err' = 'chapter not finished');
reset role;
insert into blocks (world, x, y, z, id, placed_by) values
  ('w', 300, 40, 300, 112, 'c4000000-0000-0000-0000-000000000004'), ('w', 301, 40, 300, 117, 'c4000000-0000-0000-0000-000000000004');
delete from rate_limits;
set role authenticated;
select pg_temp.ok('circuits need all three gate kinds', act_claim_chapter('w', 'circuits') ->> 'err' = 'chapter not finished');
reset role;
insert into blocks (world, x, y, z, id, placed_by) values ('w', 302, 40, 300, 122, 'c4000000-0000-0000-0000-000000000004');
delete from rate_limits;
set role authenticated;
select pg_temp.ok('circuits pay once an AND, an OR and a NOT stand', (act_claim_chapter('w', 'circuits') ->> 'total_gwei')::int = 150);
reset role;
select pg_temp.ok('chapter Gwei counts toward the leaderboard', (select gwei_earned from players where user_id = 'c4000000-0000-0000-0000-000000000004') = 150);
-- the Merge twins (030): a guaranteed Merge Aegis, then chapter 5 pays against it
reset role;
delete from rate_limits;
update players set pos_x = 12.5, pos_y = 33, pos_z = 8.5, pos_at = now() where user_id = 'c4000000-0000-0000-0000-000000000004';
set role authenticated;
select pg_temp.ok('chapter 5 needs the Merge Aegis', act_claim_chapter('w', 'merge') ->> 'err' = 'chapter not finished');
select pg_temp.ok('bringing down the twins mints the Merge Aegis', act_loot_mob('w', 'merge_twins', 12.5, 33, 8.5) -> 'unique' ->> 'id' = '209');
select pg_temp.ok('a second report right away is rate-limited', act_loot_mob('w', 'merge_twins', 12.5, 33, 8.5) ->> 'err' = 'too many actions');
reset role;
delete from rate_limits;
set role authenticated;
select pg_temp.ok('chapter 5 pays 600 Gwei', (act_claim_chapter('w', 'merge') ->> 'gwei')::int = 600);
reset role;
-- the Front-Runner (039): guaranteed boots and two Diamond Shards, rate-limited like every boss
delete from rate_limits;
set role authenticated;
select act_loot_mob('w', 'front_runner', 12.5, 33, 8.5) as fr \gset
select pg_temp.ok('outrunning the Front-Runner mints its boots', (:'fr'::jsonb) -> 'unique' ->> 'id' = '211');
select pg_temp.ok('... and cuts two Diamond Shards', ((:'fr'::jsonb) ->> 'shards')::int = 2);
select pg_temp.ok('a second Front-Runner report right away is rate-limited', act_loot_mob('w', 'front_runner', 12.5, 33, 8.5) ->> 'err' = 'too many actions');
select pg_temp.ok('a Sandwich Bot drops like an ordinary mob', act_loot_mob('w', 'mev_bot', 12.5, 33, 8.5) ->> 'ok' = 'true');
reset role;
-- hovercraft (040): twice the pace for a glider's owner, and for the passenger of a Twin Diamond's driver
update players set pos_x = 112.5, pos_y = 33, pos_z = 8.5, pos_at = clock_timestamp() - interval '3 seconds' where user_id = 'c4000000-0000-0000-0000-000000000004';
set role authenticated;
select pg_temp.ok('50 blocks in 3 seconds on foot: refused', act_pos('w', 162.5, 33, 8.5) ->> 'err' = 'impossible move');
reset role;
insert into uniques (user_id, world, serial, item) values ('c4000000-0000-0000-0000-000000000004', 'w', 900, 217);
set role authenticated;
select pg_temp.ok('... on a Neon Glider: allowed', (act_pos('w', 162.5, 33, 8.5) ->> 'ok')::boolean);
reset role;
update players set pos_x = 112.5, pos_y = 33, pos_z = 9.5, pos_at = clock_timestamp() - interval '3 seconds' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('behind a Neon Glider (no back seat): refused', act_pos('w', 150.5, 33, 9.5) ->> 'err' = 'impossible move');
reset role;
insert into uniques (user_id, world, serial, item) values ('c4000000-0000-0000-0000-000000000004', 'w', 901, 213);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('in the back seat of a Twin Diamond: allowed', (act_pos('w', 150.5, 33, 9.5) ->> 'ok')::boolean);
select set_config('request.jwt.claim.sub', 'c4000000-0000-0000-0000-000000000004', false) \g /dev/null
reset role;
select pg_temp.ok('the Diamond Gliders are crafted uniques', (select count(*) from rule_recipes where out_item between 213 and 220 and uniq) = 8);
\echo Chapter scenarios pass.

-- the shop's week (032_shop.sql): same picks as rules.js, 25% off, limited pieces only in their week
reset role;
select pg_temp.ok('the weekly picks match rules.js, week after week',
  not exists (select 1 from shop_weeks where _shop_featured(w) <> f));
delete from rate_limits;
update players set gwei = 100000 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select (select x::int from jsonb_array_elements_text(_shop_featured(_shop_week()) -> 'sale') x where x::int <> 42 limit 1) as sale_id,
  (_shop_featured(_shop_week()) ->> 'limited')::int as lim_id \gset
select price as sale_price from rule_cosmetics where id = :sale_id \gset
select min(id) as other_lim from rule_cosmetics where limited and id <> :lim_id \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('this week''s sale is 25% off', (act_buy_cosmetic('w', :sale_id) ->> 'paid')::int = (:sale_price * 3) / 4);
select pg_temp.ok('a limited piece out of its week is refused', act_buy_cosmetic('w', :other_lim) ->> 'err' = 'not in the shop this week');
select pg_temp.ok('this week''s limited piece can be bought', act_buy_cosmetic('w', :lim_id) ->> 'ok' = 'true');
reset role;
\echo Shop scenarios pass.

-- consumables and the Genesis tier (033): spent one at a time, the beacon needs a real bed, the Genesis
-- gear needs its boss trophy (owned, kept)
reset role;
delete from rate_limits;
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 303, 2), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 307, 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 104, 3), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 110, 4),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 103, 2), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 9, 2)
  on conflict (user_id, world, item) do update set n = excluded.n;
insert into blocks (world, x, y, z, id) values ('w', 5, 50, 5, 137) on conflict (world, x, y, z) do update set id = 137;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('a tonic is drunk: one less', (act_use_item('w', 303) -> 'inv' ->> '303')::int = 1);
select pg_temp.ok('a block is not a consumable', act_use_item('w', 3) ->> 'err' = 'not usable');
select pg_temp.ok('the beacon needs a bed where you go', act_use_item('w', 307, 6, 50, 5) ->> 'err' = 'that bed is gone');
select pg_temp.ok('the beacon takes you to your bed', act_use_item('w', 307, 5, 50, 5) ->> 'ok' = 'true');
select pg_temp.ok('... and the server now knows you''re there', (select round(pos_x::numeric, 1) from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 5.5);
reset role;
delete from rate_limits;
set role authenticated;
select pg_temp.ok('none left once used', act_use_item('w', 307, 5, 50, 5) ->> 'err' = 'none left');
select pg_temp.ok('the Genesis Blade needs the Titan''s fang', act_craft('w', 301) ->> 'err' = 'needs a trophy');
reset role;
insert into uniques (user_id, world, serial, item) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 9001, 205);
delete from rate_limits;
set role authenticated;
select pg_temp.ok('with the fang, the blade is forged', (act_craft('w', 301) -> 'inv' ->> '301')::int = 1);
reset role;
select pg_temp.ok('... and the fang is kept', exists (select 1 from uniques where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and item = 205));
\echo Consumable scenarios pass.

-- signs (034): only the sign's own placer writes, the chat filter applies, an empty text clears it
reset role;
delete from rate_limits;
insert into blocks (world, x, y, z, id, placed_by) values ('w', 6, 50, 5, 160, 'aaaaaaaa-0000-0000-0000-000000000001')
  on conflict (world, x, y, z) do update set id = 160, placed_by = excluded.placed_by;
insert into blocks (world, x, y, z, id, placed_by) values ('w', 7, 50, 5, 3, 'aaaaaaaa-0000-0000-0000-000000000001')
  on conflict (world, x, y, z) do update set id = 3, placed_by = excluded.placed_by;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('write on your sign', act_sign('w', 6, 50, 5, '  Welcome   to my house ') ->> 'text' = 'Welcome to my house');
select pg_temp.ok('everyone can read it', (select text from signs where world = 'w' and x = 6 and y = 50 and z = 5) = 'Welcome to my house');
select pg_temp.ok('a granite block is not a sign', act_sign('w', 7, 50, 5, 'hi') ->> 'err' = 'not a sign');
select pg_temp.ok('60 characters at most', length(act_sign('w', 6, 50, 5, repeat('a', 200)) ->> 'text') = 60);
select set_config('request.jwt.claim.sub', 'c4000000-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('someone else can''t write on it', act_sign('w', 6, 50, 5, 'mine now') ->> 'err' = 'not your sign');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('a muted player can''t write at all', act_sign('w', 6, 50, 5, 'hi') ->> 'err' = 'muted');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('the chat filter applies', act_sign('w', 6, 50, 5, 'what the shit') ->> 'text' = 'what the ****');
reset role;
delete from rate_limits;
set role authenticated;
select pg_temp.ok('an empty text clears it', act_sign('w', 6, 50, 5, '   ') ->> 'ok' = 'true');
select pg_temp.ok('... and the row is gone', not exists (select 1 from signs where world = 'w' and x = 6));
reset role;
\echo Sign scenarios pass.

-- sign reports (036): three players who have played take a sign's text down and mute its author
reset role;
delete from rate_limits;
update players set serial = greatest(serial, 20), created_at = now() - interval '1 day' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and world = 'w';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('a sign to report', act_sign('w', 6, 50, 5, 'Something rude') ->> 'ok' = 'true');
select pg_temp.ok('you can''t report your own sign', act_report_sign('w', 6, 50, 5) ->> 'err' = 'your own sign');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
reset role;
update players set created_at = now() where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
set role authenticated;
select pg_temp.ok('a brand-new account can''t report a sign', act_report_sign('w', 6, 50, 5) ->> 'err' = 'must have played a little');
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('nothing to report where there is no sign', act_report_sign('w', 7, 50, 5) ->> 'err' = 'no sign here');
select pg_temp.ok('first sign report', act_report_sign('w', 6, 50, 5) ->> 'removed' = 'false');
select pg_temp.ok('reporting a sign twice counts once', act_report_sign('w', 6, 50, 5) ->> 'removed' = 'false');
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('second sign report', act_report_sign('w', 6, 50, 5) ->> 'removed' = 'false');
select pg_temp.ok('players can''t read who reported what', (select count(*) from sign_reports) = 0);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false) \g /dev/null
select pg_temp.ok('third sign report: the text comes down', act_report_sign('w', 6, 50, 5) ->> 'removed' = 'true');
select pg_temp.ok('... for everyone', not exists (select 1 from signs where world = 'w' and x = 6 and y = 50 and z = 5));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('... and its author can''t write signs for a while', act_sign('w', 6, 50, 5, 'again') ->> 'err' = 'muted');
reset role;
select pg_temp.ok('... nor chat', (select muted_until > now() from players where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and world = 'w'));
update players set muted_until = null where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and world = 'w';
\echo Sign report scenarios pass.

-- player count (035): every nickname of the world, as a bare number, readable by any player
reset role;
select count(*) as named from players where world = 'w' and coalesce(btrim(name), '') <> '' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('a player can''t read the others'' rows', (select count(*) from players where world = 'w') = 1);
select pg_temp.ok('... but gets the count of every nickname', world_player_count('w') = :named and :named > 1);
select pg_temp.ok('an empty world counts zero', world_player_count('nowhere') = 0);
reset role;
\echo Player count scenarios pass.

-- Diamond Shards (037): a boss kill gives 1 or 2 on top of its trophy
reset role;
delete from rate_limits;
update players set pos_x = 12.5, pos_y = 33, pos_z = 8.5, pos_at = now() where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select act_loot_mob('w', 'titan', 12.5, 33, 8.5) as titan \gset
select pg_temp.ok('a boss kill gives Diamond Shards', (:'titan'::jsonb ->> 'shards')::int between 1 and 2 and (:'titan'::jsonb -> 'inv' ->> '110')::int >= 1);
reset role;
\echo Diamond Shard scenarios pass.

-- block explorer (038): every change of a block is logged, block_info tells its story without account ids
reset role;
select count(*) > 0 as logged from block_history \gset
select pg_temp.ok('the blocks placed and mined above were logged', :'logged'::boolean);
select x as bx, y as by_, z as bz, placed_name as bname from blocks
  where world = 'w' and placed_by is not null and placed_name is not null and id <> 0 order by updated_at desc limit 1 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select block_info('w', :bx, :by_, :bz) as info \gset
select pg_temp.ok('block_info names the builder', :'info'::jsonb ->> 'name' = :'bname');
select pg_temp.ok('... counts their standing blocks', (:'info'::jsonb ->> 'builder_blocks')::int >= 1);
select pg_temp.ok('... and lists its history, newest first, with a name', jsonb_array_length(:'info'::jsonb -> 'history') >= 1
  and :'info'::jsonb -> 'history' -> 0 ->> 'name' = :'bname');
select pg_temp.ok('... never an account id', position('aaaaaaaa' in :'info') = 0 and position('bbbbbbbb' in :'info') = 0);
select pg_temp.ok('an untouched block has no story', jsonb_array_length(block_info('w', 900, 5, 900) -> 'history') = 0
  and block_info('w', 900, 5, 900) ->> 'name' is null);
select pg_temp.ok('players can''t read the raw log', (select count(*) from block_history) = 0);
reset role;
-- the log keeps the last 12 changes of a block, and a door opening is not a change of hands
insert into blocks (world, x, y, z, id, placed_by, placed_name, serial) values ('w', 901, 5, 901, 79, 'someone', 'Someone', 1);
do $$ begin for i in 1..20 loop update blocks set id = case when id = 0 then 79 else 0 end where world = 'w' and x = 901 and y = 5 and z = 901; end loop; end $$;
select pg_temp.ok('only the last 12 changes are kept', (select count(*) from block_history where world = 'w' and x = 901 and y = 5 and z = 901) = 12);
insert into blocks (world, x, y, z, id, placed_by, placed_name, serial) values ('w', 902, 5, 902, 90, 'someone', 'Someone', 2);
update blocks set id = 91 where world = 'w' and x = 902 and y = 5 and z = 902;
select pg_temp.ok('a door switching state isn''t logged', (select count(*) from block_history where world = 'w' and x = 902 and y = 5 and z = 902) = 1);
\echo Block explorer scenarios pass.

-- the game server (041): it pays the loot and the tonic with the service key; while it's up, players can't
reset role;
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  perform srv_loot_mob('cccccccc-0000-0000-0000-000000000003', 'w', 'shadow', 0, 0, 0);
  raise exception 'a player called srv_loot_mob';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform srv_heartbeat(array['w']);
  raise exception 'a player called srv_heartbeat';
exception when insufficient_privilege then null; end $$;
reset role;
set role service_role;
select srv_loot_mob('cccccccc-0000-0000-0000-000000000003', 'w', 'titan', 9999, 0, 9999) as srvloot \gset
select pg_temp.ok('the game server pays a kill, wherever it says', (:'srvloot'::jsonb ->> 'ok')::boolean and :'srvloot'::jsonb -> 'unique' is not null);
select pg_temp.ok('... never for someone not in the world', not (srv_loot_mob('dddddddd-0000-0000-0000-00000000dddd', 'w', 'shadow', 0, 0, 0) ->> 'ok')::boolean);
select srv_heartbeat(array['w']) \g /dev/null
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select act_loot_mob('w', 'wraith', 12.5, 33, 8.5) as claimed \gset
select pg_temp.ok('while the game server is up, a player can''t claim loot', :'claimed'::jsonb ->> 'err' = 'the game server pays the loot');
reset role;
update game_servers set seen = now() - interval '5 minutes';
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('... and can again once it''s gone', (act_loot_mob('w', 'wraith', 12.5, 33, 8.5) ->> 'ok')::boolean);
reset role;
select _give('cccccccc-0000-0000-0000-000000000003', 'w', 303, 1, '{}') \g /dev/null
select _count('cccccccc-0000-0000-0000-000000000003', 'w', 303) as tonics \gset
set role service_role;
select pg_temp.ok('the game server takes a tonic', (srv_use_item('cccccccc-0000-0000-0000-000000000003', 'w', 303) ->> 'ok')::boolean);
select pg_temp.ok('... only a tonic', not (srv_use_item('cccccccc-0000-0000-0000-000000000003', 'w', 304) ->> 'ok')::boolean);
reset role;
select pg_temp.ok('... one less in the inventory', _count('cccccccc-0000-0000-0000-000000000003', 'w', 303) = :tonics - 1);
\echo Game server scenarios pass.

-- restoring a world (042_world_restore.sql): everything players changed goes, except in claims, chests,
-- signs and validators' ruins; a preview first; only the owner (SQL Editor) can run it
reset role;
insert into claims (world, cx, cz, owner) values ('rw', 40, 40, 'aaaaaaaa-0000-0000-0000-000000000001');
insert into blocks (world, x, y, z, id, placed_name) values
  ('rw', 645, 30, 645, 3, 'Alice'),   -- inside the claimed chunk (40, 40)
  ('rw', 700, 30, 700, 3, 'Bob'),     -- out in the wild: goes
  ('rw', 701, 30, 700, 0, null),      -- a hole: filled again
  ('rw', 710, 30, 710, 98, 'Bob'),    -- a chest: stays
  ('rw', 720, 30, 720, 3, 'Bob'),     -- a sign's cell: stays
  ('rw', 731, 32, 730, 3, 'Bob'),     -- a relit validator's column: stays
  ('rw', 800, 50, 800, 0, null);      -- a tower chest someone broke
insert into chests (world, x, y, z, items) values ('rw', 710, 30, 710, '{"101": 3}');
insert into signs (world, x, y, z, text) values ('rw', 720, 30, 720, 'hello');
insert into validators (world, x, y, z, state) values ('rw', 729, 30, 728, 'active');
select admin_restore_world('rw') as preview \gset
select pg_temp.ok('restore preview: says what would go', (:'preview'::jsonb ->> 'would_erase')::int = 3
  and (:'preview'::jsonb ->> 'kept_in_claims')::int = 1 and (:'preview'::jsonb ->> 'kept_elsewhere')::int = 3);
select pg_temp.ok('... and changes nothing', (select count(*) from blocks where world = 'rw') = 7);
select pg_temp.ok('... names who built there', :'preview'::jsonb -> 'zones' @> '[{"builders": ["Bob"]}]');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.refused('a player can''t restore a world', $$select admin_restore_world('rw', true)$$);
reset role;
set role service_role;
select pg_temp.refused('... nor the game server', $$select admin_restore_world('rw', true)$$);
reset role;
select admin_restore_world('rw', true) as restored \gset
select pg_temp.ok('restore: the wild blocks are gone', (:'restored'::jsonb ->> 'erased')::int = 3
  and not exists (select 1 from blocks where world = 'rw' and (x, z) in ((700, 700), (701, 700), (800, 800))));
select pg_temp.ok('... claims, chests, signs and ruins stay', (select count(*) from blocks where world = 'rw') = 4
  and (select items from chests where world = 'rw' and x = 710) = '{"101": 3}');
select pg_temp.ok('... the screens are told', (select erased from world_restores where world = 'rw') = 3);
select _seed_tower_chest('rw', 800, 50, 800) \g /dev/null
select pg_temp.ok('... a broken tower chest comes back empty', not exists (select 1 from chests where world = 'rw' and x = 800));
select _seed_tower_chest('rw', 810, 50, 810) \g /dev/null
select pg_temp.ok('... an untouched one still holds its treasure', exists (select 1 from chests where world = 'rw' and x = 810));
-- regen (045): the frozen chunks outside the claims go too, to be frozen again by the new generator
insert into chunks (world, cx, cz, gen, sy, data) values ('rw', 40, 40, 1, 64, ''), ('rw', 50, 50, 1, 64, '');
select admin_restore_world('rw', false, true) as regenp \gset
select pg_temp.ok('regen preview: counts the chunks, drops nothing',
  (:'regenp'::jsonb ->> 'terrain_to_regenerate')::int = 1 and (select count(*) from chunks where world = 'rw') = 2);
select admin_restore_world('rw', true, true) as regen \gset
select pg_temp.ok('regen: the unclaimed chunk is dropped, the claimed one kept', (:'regen'::jsonb ->> 'terrain_regenerated')::int = 1
  and exists (select 1 from chunks where world = 'rw' and cx = 40) and not exists (select 1 from chunks where world = 'rw' and cx = 50));
\echo World restore scenarios pass.

-- ---------- logins (046): a login and a password, case-insensitive, to find your game on another device ----------
reset role;
insert into auth.users values ('a1000000-0000-0000-0000-000000000001'), ('a1000000-0000-0000-0000-000000000002'), ('a1000000-0000-0000-0000-000000000003');
delete from rate_limits;
select count(*) as b_worlds from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('login: a bad login is refused', act_set_login('a b', 'secret1') ->> 'err' = 'bad login');
select pg_temp.ok('login: a short password is refused', act_set_login('Pierre_B', 'abc') ->> 'err' = 'bad password');
select pg_temp.ok('login: set', (act_set_login('Pierre_B', 'secret1') ->> 'ok')::boolean);
select pg_temp.ok('login: it''s mine', act_my_login() ->> 'login' = 'Pierre_B');
select pg_temp.refused('login: nobody reads the passwords', $q$select admin_login_info('pierre_b')$q$);
select pg_temp.ok('login: the table shows nothing to a player', (select count(*) from logins) = 0);
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('login: taken, whatever the case', act_set_login('PIERRE_b', 'other12') ->> 'err' = 'login taken');
select pg_temp.ok('login: a wrong password is refused', act_login('pierre_b', 'nope!!') ->> 'err' = 'wrong login or password');
select pg_temp.ok('login: an unknown login says the same', act_login('nobody', 'secret1') ->> 'err' = 'wrong login or password');
select pg_temp.ok('login: the check says yes, any case', (act_check_login('PIERRE_B', 'secret1') ->> 'ok')::boolean);
reset role;
select pg_temp.ok('login: a check moves nothing', (select count(*) from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = :b_worlds);
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('login: logged in on another device, any case', (act_login('pierre_B', 'secret1') ->> 'worlds')::int = :b_worlds);
reset role;
select pg_temp.ok('login: the game came over', (select count(*) from players where user_id = 'a1000000-0000-0000-0000-000000000001') = :b_worlds
  and not exists (select 1 from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002')
  and exists (select 1 from inventory where user_id = 'a1000000-0000-0000-0000-000000000001'));
select pg_temp.ok('login: ... and the login with it', (select user_id from logins where login_key = 'pierre_b') = 'a1000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('login: the old device is told its game left', act_my_login() ->> 'moved' = 'Pierre_B' and act_my_login() -> 'login' = 'null'::jsonb);
-- five wrong passwords in a row: locked for a while, even with the right one
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', false) \g /dev/null
select count(*) from generate_series(1, 5) i where act_check_login('pierre_b', 'wrong' || i) ->> 'err' = 'wrong login or password' \g /dev/null
reset role;
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('login: locked after five wrong passwords', act_login('pierre_b', 'secret1') ->> 'err' = 'locked');
select pg_temp.ok('login: guessing is throttled too', (select count(*) filter (where act_check_login('x' || i, 'y') ->> 'err' = 'too many attempts') from generate_series(1, 8) i) >= 3);
reset role;
-- the owner helps a player who forgot their password
select pg_temp.ok('admin: who it is', admin_login_info('PIERRE_B') -> 'worlds' -> 0 ->> 'name' = 'Pierre');
select pg_temp.ok('admin: a new password', (admin_reset_password('pierre_b', 'newpass1') ->> 'ok')::boolean);
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('login: the old password no longer works', act_check_login('pierre_b', 'secret1') ->> 'ok' = 'false');
select pg_temp.ok('login: the new one does, and the lock is lifted', (act_login('Pierre_B', 'newpass1') ->> 'ok')::boolean);
select pg_temp.ok('login: renamed, the old one is free', (act_set_login('Pierre', 'newpass1') ->> 'ok')::boolean and act_my_login() ->> 'login' = 'Pierre');
select pg_temp.refused('admin: a player can''t reset a password', $q$select admin_reset_password('pierre', 'hacked1')$q$);
reset role;
set role service_role;
select pg_temp.refused('admin: ... nor the game server', $q$select admin_reset_password('pierre', 'hacked1')$q$);
reset role;
\echo Login scenarios pass.
