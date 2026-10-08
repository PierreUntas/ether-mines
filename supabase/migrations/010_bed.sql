-- Migration 010: a proper 2-block bed (foot + head), same multi-block pattern as Door.
-- rule_blocks has no facing column, so the facing is encoded directly in kind ('bed0f'..'bed3h');
-- the (dx,dz) offset to the other half is computed with an explicit CASE on kind (never string parsing,
-- since this runs in a security definer function).

create or replace function public._core_mine(w text, px int, py int, pz int, held text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; id0 int; rb rule_blocks; t_tier int := 0; t_mult real := 1; useri int;
  need real; ch jsonb := '[]'; inv jsonb := '{}'; oy int; other int; above int; ab rule_blocks; n int; odx int; odz int;
begin
  pl := _player(me, w);
  id0 := _cell(w, px, py, pz);
  select * into rb from rule_blocks where id = id0;
  if id0 = 0 or rb.id is null or rb.hard is null then return _no('nothing to mine', jsonb_build_object('cell', id0)); end if;
  if not _can_build(me, w, px, pz) then return _no('protected', jsonb_build_object('cell', id0)); end if;
  if held = '102' and _count(me, w, 102) > 0 then
    select tier, rule_items.tool into t_tier, t_mult from rule_items where id = 102;
  elsif held like 'nft%' then
    select u.serial, i.tier, i.tool into useri, t_tier, t_mult from uniques u join rule_items i on i.id = u.item
      where u.user_id = me and u.world = w and u.serial = nullif(substr(held, 4), '')::int;
    t_tier := coalesce(t_tier, 0); t_mult := coalesce(t_mult, 1);
  end if;
  if t_tier < rb.tier then return _no('tool too weak', jsonb_build_object('cell', id0)); end if;
  need := rb.hard / t_mult;
  if pl.mine_at is not null and extract(epoch from clock_timestamp() - pl.mine_at) < need * 0.5 - 0.1 then
    return _no('too fast', jsonb_build_object('cell', id0));
  end if;
  update players set mine_at = clock_timestamp() where user_id = me and world = w;
  ch := ch || _set(w, px, py, pz, 0, null, null, null);
  if rb.kind = 'door' then
    oy := case when rb.top then py - 1 else py + 1 end; other := _cell(w, px, oy, pz);
    if (select kind from rule_blocks where id = other) = 'door' then ch := ch || _set(w, px, oy, pz, 0, null, null, null); end if;
  elsif rb.kind like 'bed%' then
    odx := case rb.kind
      when 'bed0f' then 0 when 'bed1f' then -1 when 'bed2f' then 0 when 'bed3f' then 1
      when 'bed0h' then 0 when 'bed1h' then 1 when 'bed2h' then 0 when 'bed3h' then -1 end;
    odz := case rb.kind
      when 'bed0f' then -1 when 'bed1f' then 0 when 'bed2f' then 1 when 'bed3f' then 0
      when 'bed0h' then 1 when 'bed1h' then 0 when 'bed2h' then -1 when 'bed3h' then 0 end;
    other := _cell(w, px + odx, py, pz + odz);
    if (select kind from rule_blocks where id = other) like 'bed%' then
      ch := ch || _set(w, px + odx, py, pz + odz, 0, null, null, null);
    end if;
  end if;
  above := _cell(w, px, py + 1, pz); select * into ab from rule_blocks where id = above;
  if ab.kind = 'cross' then ch := ch || _set(w, px, py + 1, pz, 0, null, null, null);
  elsif ab.kind in ('plate', 'cable', 'lever') then
    ch := ch || _set(w, px, py + 1, pz, 0, null, null, null);
    if ab.drop_item is not null then inv := _give(me, w, ab.drop_item, 1, inv); end if;
  end if;
  n := case rb.drop_item when 101 then 1 + (random() < 0.4)::int when 104 then (random() < 0.4)::int else 1 end;
  if rb.drop_item is not null and n > 0 then inv := _give(me, w, rb.drop_item, n, inv); end if;
  if useri is not null then update uniques set mined = mined + 1 where user_id = me and world = w and serial = useri; end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'got', jsonb_build_object('item', rb.drop_item, 'n', n));
end $$;

-- Place: the item is in the inventory, the cell is free, the support is right.
create or replace function public._core_place(w text, px int, py int, pz int, it int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; cr rule_blocks; rb rule_blocks; below int; up int; ch jsonb := '[]'; inv jsonb := '{}'; s int;
  odx int; odz int; ocur int; ocr rule_blocks;
begin
  pl := _player(me, w);
  if py < 1 or py >= 64 or abs(px) >= 100000 or abs(pz) >= 100000 then return _no('out of the world'); end if;
  if not exists (select 1 from rule_place where item = it and block = bid) then return _no('item not placeable'); end if;
  if _count(me, w, it) < 1 then return _no('empty inventory', jsonb_build_object('inv', jsonb_build_object(it::text, 0))); end if;
  if not _can_build(me, w, px, pz) then return _no('protected'); end if;
  cur := _cell(w, px, py, pz); select * into cr from rule_blocks where id = cur;
  if cur <> 0 and cr.kind not in ('water', 'cross') then return _no('space occupied', jsonb_build_object('cell', cur)); end if;
  select * into rb from rule_blocks where id = bid;
  below := _cell(w, px, py - 1, pz);
  if rb.kind = 'cross' and below not in (1, 2) then return _no('needs support'); end if;
  if rb.kind in ('plate', 'cable', 'lever') and not coalesce((select solid from rule_blocks where id = below), false) then return _no('needs support'); end if;
  if rb.kind = 'door' then
    if py + 1 >= 64 then return _no('out of the world'); end if;
    up := _cell(w, px, py + 1, pz);
    if up <> 0 and (select kind from rule_blocks where id = up) not in ('water', 'cross') then return _no('space occupied'); end if;
  elsif rb.kind like 'bed%f' then
    odx := case rb.kind when 'bed0f' then 0 when 'bed1f' then -1 when 'bed2f' then 0 when 'bed3f' then 1 end;
    odz := case rb.kind when 'bed0f' then -1 when 'bed1f' then 0 when 'bed2f' then 1 when 'bed3f' then 0 end;
    ocur := _cell(w, px + odx, py, pz + odz); select * into ocr from rule_blocks where id = ocur;
    if ocur <> 0 and ocr.kind not in ('water', 'cross') then return _no('space occupied', jsonb_build_object('cell', ocur)); end if;
  end if;
  inv := _give(me, w, it, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, bid, me, pl.name, s);
  if rb.kind = 'door' then ch := ch || _set(w, px, py + 1, pz, bid + 1, me, pl.name, s);
  elsif rb.kind like 'bed%f' then ch := ch || _set(w, px + odx, py, pz + odz, bid + 4, me, pl.name, s);
  end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'serial', s);
end $$;
