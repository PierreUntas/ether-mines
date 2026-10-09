-- 014: a real payoff for the network's shared milestones (supabase/migrations/007_network.sql's TIERS
-- [3, 10, 25, 50, 100]), which until now were pure flavor text and an orbiting star mesh. Whoever's relight
-- crosses a tier mints a one-of-a-kind Validator Star (#204) commemorating it — same mechanism as the
-- existing Validator Seal (#203). And once the network is fully awake (tier 100 crossed), every relight
-- from then on has a chance of also returning a Diamond Shard (#110), the ingredient for the new Radiant
-- Diamond block (#145) — so the reward keeps flowing to everyone who keeps relighting, not just whoever
-- happened to cross the 100th threshold. Requires 001_schema.sql, 002_security.sql (_cell_soft). Replayable
-- without error.

create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb; star jsonb; solid boolean; relit_n int; shard boolean := false;
begin
  pl := _player(me, w);
  if _cell(w, px, py, pz) <> 73 then return _no('not a dark validator', jsonb_build_object('cell', _cell(w, px, py, pz))); end if;
  for i in 0..2 loop
    -- the column's chunk may not be frozen yet even though the validator's is: _cell_soft, not _cell, so an
    -- un-frozen neighbor reads as "not solid" (a clean refusal) instead of raising
    solid := coalesce((select rb.solid from rule_blocks rb where rb.id = _cell_soft(w, px + 2, py + i, pz + 2)), false);
    if not solid then return _no('rebuild the fourth column first'); end if;
  end loop;
  if _count(me, w, 105) < 1 then return _no('needs a validator heart'); end if;
  inv := _give(me, w, 105, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, 74, me, pl.name, s);
  u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
  update uniques set vx = px, vy = py, vz = pz where user_id = me and world = w and serial = (u ->> 'serial')::int;
  select count(*) into relit_n from blocks where world = w and id = 74;
  if relit_n = any (array[3, 10, 25, 50, 100]) then
    star := _mint(me, w, 204, 'crossed the ' || relit_n || '-relit threshold');
  end if;
  if relit_n >= 100 and random() < 0.15 then
    inv := _give(me, w, 110, 1, inv);
    shard := true;
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'star', star, 'shard', shard, 'serial', s);
end $$;
