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
grant execute on all functions in schema pg_temp to authenticated;

select v as gy from fixtures where k = 'gy' \gset
select v as gid from fixtures where k = 'gid' \gset
select v as s1 from fixtures where k = 's1' \gset
select v as s2 from fixtures where k = 's2' \gset
select v as s3 from fixtures where k = 's3' \gset
select v as rx from fixtures where k = 'rx' \gset
select v as ry from fixtures where k = 'ry' \gset
select v as rz from fixtures where k = 'rz' \gset
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

-- ---------- seal coordinates and wallet linking (009) ----------
select pg_temp.ok('seal coordinates recorded', (select (vx, vy, vz) from uniques where item = 203) = (:rx, :ry, :rz));
select (act_wallet_nonce() ->> 'nonce') as nonce1 \gset
select pg_temp.ok('wallet-link nonce received', length(:'nonce1') = 32);
select (act_wallet_nonce() ->> 'nonce') as nonce2 \gset
select pg_temp.ok('a new nonce replaces the old one', :'nonce1' <> :'nonce2');
select pg_temp.ok('the nonce is not directly readable', (select count(*) from wallet_nonces) = 0);
select pg_temp.refused('assign yourself a wallet directly', $q$insert into wallets (user_id, address) values ('aaaaaaaa-0000-0000-0000-000000000001', '0xBAD')$q$);
reset role;
select pg_temp.ok('only one nonce kept per player', (select count(*) from wallet_nonces) = 1);
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

-- ---------- validator rewards ----------
reset role;
update players set rewards_at = now() - interval '60 seconds';
update blocks set updated_at = now() - interval '1 hour' where id = 74; -- relit before the paid period
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('rewards: one old validator, 1 minute → 1 crystal', act_rewards('w') ->> 'n' = '1');
select pg_temp.ok('reward paid out', (select n from inventory where item = 101) = 6);
reset role;
-- 8 placed validators: only 5 count; 10 minutes → (5 + 5) shares × 50 slots / 25 = 20 crystals
insert into blocks (world, x, y, z, id, placed_by, updated_at) select 'w', 100 + k, 40, 100, 13, 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day' from generate_series(1, 8) k;
update players set rewards_at = now() - interval '10 minutes' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('at most 5 placed validators count', (act_rewards('w') ->> 'n')::int = 20);
reset role;
update players set rewards_at = now() - interval '5 hours' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from rate_limits where kind = 'rewards'; -- the previous call emptied the reserve
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('at most 30 minutes caught up: 150 slots × 10 shares / 25 = 60', (act_rewards('w') ->> 'n')::int = 60);
select pg_temp.ok('inventory: 6 + 20 + 60', (select n from inventory where item = 101) = 86);
reset role;
delete from blocks where world = 'w' and x between 101 and 108 and y = 40 and z = 100;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

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

-- ---------- recovering a game by code ----------
select pg_temp.ok('unknown code refused', claim_recovery('0000-0000-0000-0000') = -1);
select pg_temp.ok('B recovers A''s game', claim_recovery(:'code') = 1);
select pg_temp.ok('the inventory moved over, without duplicates', (select n from inventory where item = 101) = 86 and (select count(*) from inventory where item = 2) = 1);
select pg_temp.ok('the unique items followed', (select count(*) from uniques) = 2);
reset role;
select pg_temp.ok('A has nothing left', (select count(*) from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
select pg_temp.ok('signed blocks followed', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('the claim followed', (select owner from claims where cx = 1 and cz = 0) = 'bbbbbbbb-0000-0000-0000-000000000002');
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
-- a validator just placed doesn't count for past time
insert into blocks (world, x, y, z, id, placed_by) values ('w', 120, 40, 120, 13, 'cccccccc-0000-0000-0000-000000000003');
update players set rewards_at = now() - interval '20 minutes' where user_id = 'cccccccc-0000-0000-0000-000000000003';
delete from rate_limits where kind = 'rewards';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('validator placed too late: nothing for the past', (act_rewards('w') ->> 'n')::int = 0);
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
    if res ->> 'item' is not null then got := true; end if;
  end loop;
  if ok_count <> 5 then raise exception 'FAILED: expected 5 allowed loot rolls (burst), got %', ok_count; end if;
  if not got then raise exception 'FAILED: wraith never dropped loot over 5 rolls (65%% odds each, ~0.5%% chance)'; end if;
  res := act_loot_mob('w', 'wraith', 12.5, 33, 8.5);
  if res ->> 'err' <> 'too many actions' then raise exception 'FAILED: 6th loot roll should be rate-limited, got %', res; end if;
  raise notice 'ok: wraith loot drops sometimes, and the rate limit (burst 5) kicks in after';
end $$;
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('loot roll refused far from the reported position', act_loot_mob('w', 'wraith', 500.5, 33, 500.5) ->> 'err' = 'impossible move');
reset role;
delete from rate_limits where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'loot_mob';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
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
