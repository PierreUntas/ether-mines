-- 011: opening/closing a door or lever is reversible (not mining, placing, or claiming), so it stays allowed
-- in public zones (the Atrium, the City) — otherwise a door placed there by the generator can never be opened.
-- Still respects other players' claims. Requires 001_schema.sql, 006_public_zones.sql. Replayable without error.

create or replace function public._can_toggle(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                      and c.owner <> me and not (me = any (c.members)))
$$;

create or replace function public._core_toggle(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cur int; rb rule_blocks; ch jsonb := '[]'; oy int; other int;
begin
  perform _player(me, w);
  cur := _cell(w, px, py, pz); select * into rb from rule_blocks where id = cur;
  if rb.kind not in ('door', 'lever') then return _no('nothing to toggle', jsonb_build_object('cell', cur)); end if;
  if not _can_toggle(me, w, px, pz) then return _no('protected'); end if;
  if rb.kind = 'lever' then return jsonb_build_object('ok', true, 'changes', ch || _flip(w, px, py, pz, case cur when 64 then 65 else 64 end)); end if;
  ch := ch || _flip(w, px, py, pz, cur # 2);
  oy := case when rb.top then py - 1 else py + 1 end; other := _cell(w, px, oy, pz);
  if (select kind from rule_blocks where id = other) = 'door' then ch := ch || _flip(w, px, oy, pz, other # 2); end if;
  return jsonb_build_object('ok', true, 'changes', ch);
end $$;

revoke all on function public._can_toggle(uuid, text, int, int) from public, anon, authenticated;
