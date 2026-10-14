-- 031: validators are only ever relit, never built. Crafting one (8 crystals, 4 marble) was a shortcut
-- around the whole Awakening (genesis rock, a validator heart, a guarded ruin) that still paid Gwei and
-- counted for the chapters' validator objectives and the leaderboard. The recipe is gone (rules.js), and
-- placing a Validator block (13) is refused here; validators already placed keep working as before.
-- Same _core_place as 020_validators.sql, minus its validator branch.
-- Requires 001_schema.sql, 002_security.sql, 010_bed.sql, 020_validators.sql. Replayable without error.

create or replace function public._core_place(w text, px int, py int, pz int, it int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; cr rule_blocks; rb rule_blocks; below int; up int; ch jsonb := '[]'; inv jsonb := '{}'; s int;
  odx int; odz int; ocur int; ocr rule_blocks;
begin
  pl := _player(me, w);
  if py < 1 or py >= 64 or abs(px) >= 100000 or abs(pz) >= 100000 then return _no('out of the world'); end if;
  if not exists (select 1 from rule_place where item = it and block = bid) then return _no('item not placeable'); end if;
  if bid = 13 then return _no('validators are relit, not built'); end if;
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

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
