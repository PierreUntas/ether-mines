-- 002: action security.
--   1. Rate limits: a player can't call faster than a human could.
--   2. Reach and movement: every action on a block sends the player's position; the block must be in
--      reach, and the position must be reachable from the previous one.
-- Requires 001_schema.sql (_core_* functions, _no, _can_build...). Replayable without error.

-- ---------- 1. rate limits (token bucket per player and action kind) ----------
create table if not exists public.rate_limits (
  user_id uuid        not null references auth.users (id) on delete cascade,
  kind    text        not null,
  tokens  real        not null,
  at      timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.rate_limits enable row level security; -- no policy: functions only

-- Consumes a token if possible. per_s: tokens regained per second; burst: maximum reserve.
create or replace function public._rate(me uuid, kind_ text, per_s real, burst real) returns boolean
language plpgsql security definer set search_path = public as $$
declare r rate_limits; t real;
begin
  select * into r from rate_limits where user_id = me and kind = kind_ for update;
  if not found then
    insert into rate_limits (user_id, kind, tokens, at) values (me, kind_, burst - 1, clock_timestamp()) on conflict do nothing;
    return true;
  end if;
  t := least(burst, r.tokens + per_s * extract(epoch from clock_timestamp() - r.at));
  if t < 1 then
    update rate_limits set tokens = t, at = clock_timestamp() where user_id = me and kind = kind_;
    return false;
  end if;
  update rate_limits set tokens = t - 1, at = clock_timestamp() where user_id = me and kind = kind_;
  return true;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role; -- called directly by the "freeze" Edge Function

-- ---------- 2. player position ----------
alter table public.players add column if not exists pos_x real;
alter table public.players add column if not exists pos_y real;
alter table public.players add column if not exists pos_z real;
alter table public.players add column if not exists pos_at timestamptz;

-- Checks that a reported position is plausible (reachable from the last known one, or a permitted
-- teleport) and, if a target is given, that it's within reach. Stores the position if all is well.
-- Returns null if ok, otherwise the refusal reason.
create or replace function public._check_pos(me uuid, w text, ex real, ey real, ez real, tx int default null, ty int default null, tz int default null)
returns text language plpgsql security definer set search_path = public as $$
declare p players; dt real; horiz real; up real; ok boolean := false;
begin
  if ex is null or ey is null or ez is null then return 'missing position'; end if;
  if abs(ex) > 100000 or abs(ez) > 100000 or ey < -20 or ey > 80 then return 'position out of the world'; end if;
  select * into p from players where user_id = me and world = w;
  if p.pos_at is null then ok := true;                                   -- first known position
  else
    dt := greatest(extract(epoch from clock_timestamp() - p.pos_at), 0);
    horiz := sqrt((ex - p.pos_x) ^ 2 + (ez - p.pos_z) ^ 2);
    up := ey - p.pos_y;                                                  -- falls aren't limited
    ok := horiz <= 9 * dt + 8 and up <= 9 * dt + 6;                       -- 6.6 blocks/s running pace, with slack for network lag
    if not ok then ok := sqrt((ex - 8.5) ^ 2 + (ez - 10.5) ^ 2) <= 8; end if; -- return to the sanctuary (/sanctuary, falling into the void)
    if not ok then                                                        -- /join: next to a recently-active player
      ok := exists (select 1 from players o where o.world = w and o.user_id <> me and o.pos_at > clock_timestamp() - interval '2 minutes'
                    and sqrt((ex - o.pos_x) ^ 2 + (ez - o.pos_z) ^ 2) <= 6);
    end if;
  end if;
  if not ok then return 'impossible move'; end if;
  if tx is not null and sqrt((tx + 0.5 - ex) ^ 2 + (ty + 0.5 - (ey + 1.6)) ^ 2 + (tz + 0.5 - ez) ^ 2) > 6.5 then
    return 'too far';
  end if;
  update players set pos_x = ex, pos_y = ey, pos_z = ez, pos_at = clock_timestamp() where user_id = me and world = w;
  return null;
end $$;

-- Cell content, used to fix up the client's display after a refusal; null if the chunk isn't frozen yet.
create or replace function public._cell_soft(w text, x int, y int, z int) returns int
language plpgsql security definer set search_path = public as $$
begin
  return _cell(w, x, y, z);
exception when others then
  return null;
end $$;

create or replace function public._me_or_fail(w text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform _player(auth.uid(), w);
  return auth.uid();
end $$;

-- ---------- rate + position + reach, then the game rule ----------
create or replace function public.act_mine(w text, px int, py int, pz int, held text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'mine', 8, 16) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e, jsonb_build_object('cell', _cell_soft(w, px, py, pz))); end if;
  return _core_mine(w, px, py, pz, held);
end $$;

create or replace function public.act_place(w text, px int, py int, pz int, it int, bid int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'place', 8, 16) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e, jsonb_build_object('cell', _cell_soft(w, px, py, pz))); end if;
  -- don't place a solid block inside your own body
  if (select solid from rule_blocks where id = bid) and (select kind from rule_blocks where id = bid) not in ('door')
     and px + 1 > ex - 0.3 and px < ex + 0.3 and pz + 1 > ez - 0.3 and pz < ez + 0.3 and py + 1 > ey and py < ey + 1.75 then
    return _no('space occupied');
  end if;
  return _core_place(w, px, py, pz, it, bid);
end $$;

create or replace function public.act_toggle(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'toggle', 4, 8) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e); end if;
  return _core_toggle(w, px, py, pz);
end $$;

create or replace function public.act_relight(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'relight', 1, 3) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e); end if;
  return _core_relight(w, px, py, pz);
end $$;

-- Simple position ping (every ~15s while moving): used by /join and keeps the server-side position fresh.
create or replace function public.act_pos(w text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'pos', 0.5, 3) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.act_craft(w text, out_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'craft', 4, 12) then return _no('too many actions'); end if;
  return _core_craft(w, out_id);
end $$;

create or replace function public.act_gift(w text, animal text, kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'gift', 0.5, 3) then return _no('too many actions'); end if;
  return _core_gift(w, animal, kind);
end $$;

create or replace function public.act_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'rewards', 0.1, 2) then return jsonb_build_object('ok', true, 'inv', '{}'::jsonb, 'slots', 0); end if;
  return _core_rewards(w);
end $$;

-- Claim: must be standing inside the claimed chunk.
create or replace function public.act_claim(w text, qx int, qz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('too many actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  if floor(ex)::int >> 4 <> qx or floor(ez)::int >> 4 <> qz then return _no('must be inside the claim'); end if;
  return _core_claim(w, qx, qz);
end $$;

create or replace function public.act_unclaim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('too many actions'); end if;
  return _core_unclaim(w, qx, qz);
end $$;

create or replace function public.act_member(w text, username text, invite boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'member', 0.5, 4) then return _no('too many actions'); end if;
  return _core_member(w, username, invite);
end $$;

-- Recovery codes: at most one attempt every few seconds (against mass guessing).
-- An unknown code returns -1 instead of an error: an error would also roll back the consumed token.
create or replace function public.claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not _rate(auth.uid(), 'recovery', 0.2, 3) then raise exception 'too many attempts, wait a moment'; end if;
  begin
    return _core_claim_recovery(code);
  exception when raise_exception then
    if sqlerrm = 'unknown code' then return -1; end if;
    raise;
  end;
end $$;

-- ---------- rights: only act_* and the recovery functions are callable by players ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_' or p.proname in ('set_recovery_code', 'claim_recovery')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
