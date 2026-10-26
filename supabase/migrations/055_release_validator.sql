-- 055: shut down one of your validators. It goes back to a dark validator (73) in the same place, for anyone
-- to relight (with a heart, for a rarity drawn again): you make room under the three-at-most of 054 to look
-- for a rarer one. What it earned until now is paid first; its seal (item 203) is taken away, whoever holds
-- it; its row is deleted, so it leaves the Validators tab. A crafted validator (block 13) goes the same way.
-- The network's milestones (the Network Star, 204) are minted once per world, so shutting down and relighting
-- doesn't cross them again. Requires 054_three_validators.sql. Replayable without error.

create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb; star jsonb; solid boolean;
        relit_n int; shard boolean := false; rarity text; stats jsonb; vid bigint;
begin
  pl := _player(me, w);
  if _cell(w, px, py, pz) <> 73 then return _no('not a dark validator', jsonb_build_object('cell', _cell(w, px, py, pz))); end if;
  for i in 0..2 loop
    solid := coalesce((select rb.solid from rule_blocks rb where rb.id = _cell_soft(w, px + 2, py + i, pz + 2)), false);
    if not solid then return _no('rebuild the fourth column first'); end if;
  end loop;
  -- three at most per player (whatever their state): a fourth ruin stays for someone else
  if (select count(*) from validators v where v.world = w and v.owner = me) >= 3 then
    return _no('three validators at most');
  end if;
  if _count(me, w, 105) < 1 then return _no('needs a validator heart'); end if;
  inv := _give(me, w, 105, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, 74, me, pl.name, s);
  rarity := _pick_rarity();
  stats := _validator_stats(rarity, 1);
  insert into validators (world, x, y, z, owner, owner_name, state, rarity, level, gwei_per_cycle, maintenance_cost, reanimated_at, last_cycle_at)
    values (w, px, py, pz, me, pl.name, 'active', rarity, 1, (stats ->> 'gwei_per_cycle')::int, (stats ->> 'maintenance_cost')::int, now(), now())
    on conflict (world, x, y, z) do update set owner = excluded.owner, owner_name = excluded.owner_name, state = 'active',
      rarity = excluded.rarity, level = 1, gwei_per_cycle = excluded.gwei_per_cycle, maintenance_cost = excluded.maintenance_cost,
      missed_cycles = 0, reanimated_at = now(), last_cycle_at = now()
    returning id into vid;
  u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
  update uniques set validator_id = vid where user_id = me and world = w and serial = (u ->> 'serial')::int;
  select count(*) into relit_n from blocks where world = w and id = 74;
  -- each milestone once in a world: a validator shut down and relit doesn't cross it a second time
  if relit_n = any (array[3, 10, 25, 50, 100])
     and not exists (select 1 from uniques where world = w and item = 204 and place = 'crossed the ' || relit_n || '-relit threshold') then
    star := _mint(me, w, 204, 'crossed the ' || relit_n || '-relit threshold');
  end if;
  if relit_n >= 100 and random() < 0.15 then
    inv := _give(me, w, 110, 1, inv);
    shard := true;
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'star', star, 'shard', shard, 'serial', s, 'validator', vid);
end $$;

create or replace function public._core_release_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v validators; ch jsonb := '[]'; cur int; seals int[];
begin
  perform _player(me, w);
  select * into v from validators vv where vv.id = _core_release_validator.validator_id and vv.world = w for update;
  if not found then return _no('unknown validator'); end if;
  if v.owner is distinct from me then return _no('not your validator'); end if;
  -- what it earned so far is yours
  perform _tick_validator(w, v.id);
  select coalesce(array_agg(u.serial), '{}') into seals from uniques u where u.world = w and u.item = 203 and u.validator_id = v.id and u.user_id = me;
  delete from uniques u where u.world = w and u.item = 203 and u.validator_id = v.id;
  cur := _cell(w, v.x, v.y, v.z);
  if cur in (13, 74) then ch := ch || _set(w, v.x, v.y, v.z, 73, null, null, null); end if;
  delete from validators where id = v.id;
  return jsonb_build_object('ok', true, 'changes', ch, 'seals', to_jsonb(seals), 'gwei', _gwei_balance(me, w),
    'released', jsonb_build_object('x', v.x, 'y', v.y, 'z', v.z, 'rarity', v.rarity, 'level', v.level));
end $$;

create or replace function public.act_release_validator(w text, validator_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'release_validator', 0.2, 2) then return _no('too many actions'); end if;
  return _core_release_validator(w, validator_id);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
