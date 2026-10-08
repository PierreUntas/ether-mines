-- 012: a dark validator can't be relit until the ruin's fourth broken column (its +x, +z corner,
-- supabase/functions/_shared/world.js: the 4th entry of the [dx,dz] column list) is rebuilt back
-- to its full height — any solid blocks will do, not necessarily the original marble/mossy-stone.
-- Requires 001_schema.sql, 002_security.sql (_cell_soft). Replayable without error.

create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb; solid boolean;
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
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'serial', s);
end $$;
