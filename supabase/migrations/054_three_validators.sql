-- 054: three validators at most per player and world. Relighting a fourth ruin is refused; the ruins stay
-- for the others. Same _core_relight as 020_validators.sql, with only the count added. The players who already
-- run more keep them until the launch's clean-up (tools/launch-cleanup.sql keeps each player's three rarest).
-- Requires 020_validators.sql. Replayable without error.

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
  if relit_n = any (array[3, 10, 25, 50, 100]) then
    star := _mint(me, w, 204, 'crossed the ' || relit_n || '-relit threshold');
  end if;
  if relit_n >= 100 and random() < 0.15 then
    inv := _give(me, w, 110, 1, inv);
    shard := true;
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'star', star, 'shard', shard, 'serial', s, 'validator', vid);
end $$;
