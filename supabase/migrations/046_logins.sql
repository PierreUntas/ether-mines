-- 046: a login and a password, to find your game on any device. Playing still starts without any
-- account (a guest session kept by the browser, as before); a player can then secure their game with a
-- login of their choosing and a password: no email, nothing personal. On another device, logging in moves
-- the game over to that device's session, the same way a recovery code does (the recovery codes stay).
-- Logins are case-insensitive: "Pierre", "pierre" and "PIERRE" are one login (login_key, lower case),
-- shown as the player typed it. Passwords are kept as bcrypt hashes (pgcrypto); five wrong passwords in a
-- row lock that login for ten minutes, whoever tries.
-- A device whose game left for another one (moved_accounts) is told so, and asked to log in again.
-- For the game's owner, by hand in the SQL Editor (no player, not even the game server, can call them):
--   select admin_login_info('pierre');                       -- whose login, which worlds, a few things they own
--   select admin_reset_password('pierre', 'new-password');   -- a player who forgot it (check it's them first)
-- Requires 001_schema.sql (pgcrypto, recovery), 008_trades.sql, 020_validators.sql, 022_cosmetics.sql,
-- 034_signs.sql, 038_block_history.sql. Replayable without error.

create table if not exists public.logins (
  login_key    text        primary key,           -- the login in lower case: logins are case-insensitive
  login        text        not null,              -- as the player typed it
  user_id      uuid        not null unique references auth.users (id) on delete cascade,
  pass_hash    text        not null,
  fails        integer     not null default 0,     -- wrong passwords in a row
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.logins enable row level security; -- no policy: only the functions below read or write it

-- a guest session whose game was moved to another device (a login, a recovery code)
create table if not exists public.moved_accounts (
  old_id uuid        primary key,
  login  text,
  at     timestamptz not null default now()
);
alter table public.moved_accounts enable row level security;

-- everything an account owns, handed to another one (old -> me): 022's recovery, plus the trade offers,
-- the signs, the block history, the login. In a world where both have a game, old's game wins (the
-- device's own game there is the one left behind).
create or replace function public._move_account(old uuid, me uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if old is null or me is null or old = me then return 0; end if;
  delete from public.inventory i where i.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = i.world);
  delete from public.uniques u where u.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = u.world);
  delete from public.cosmetics_owned c where c.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = c.world);
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.inventory set user_id = me where user_id = old;
  update public.uniques set user_id = me where user_id = old;
  update public.cosmetics_owned set user_id = me where user_id = old;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  update public.claims set owner = me where owner = old;
  update public.claims set members = array_replace(members, old, me) where old = any (members);
  update public.validators set owner = me where owner = old;
  update public.offers set from_user = me where from_user = old;
  update public.offers set to_user = me where to_user = old;
  update public.signs set author = me where author = old;
  update public.block_history set actor = me where actor = old;
  delete from public.recovery where user_id = me and exists (select 1 from public.recovery r where r.user_id = old);
  update public.recovery set user_id = me where user_id = old;
  delete from public.logins where user_id = me and exists (select 1 from public.logins l where l.user_id = old);
  update public.logins set user_id = me, updated_at = now() where user_id = old;
  insert into public.moved_accounts (old_id, login, at) values (old, (select login from public.logins where user_id = me), now())
    on conflict (old_id) do update set login = excluded.login, at = now();
  delete from public.moved_accounts where old_id = me; -- this device has a game again
  return n;
end $$;

-- 022's recovery by code, now through _move_account (same result, plus the offers, signs, history, login)
create or replace function public._core_claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare old uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into old from public.recovery where code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex');
  if old is null then raise exception 'unknown code'; end if;
  if old = me then return 0; end if;
  return _move_account(old, me);
end $$;

create or replace function public._login_key(l text) returns text language sql immutable as $$ select lower(trim(l)) $$;
create or replace function public._login_ok(l text) returns boolean language sql immutable as $$
  select coalesce(trim(l) ~ '^[A-Za-z0-9_.-]{3,20}$', false) $$;

-- your login (create it, change your password, or rename it if the new one is free)
create or replace function public.act_set_login(login text, password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
declare me uuid := auth.uid(); k text := _login_key(login); other uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  if not _rate(me, 'login', 0.2, 5) then return jsonb_build_object('ok', false, 'err', 'too many attempts'); end if;
  if not _login_ok(login) then return jsonb_build_object('ok', false, 'err', 'bad login'); end if;
  if password is null or length(password) < 6 or length(password) > 72 then
    return jsonb_build_object('ok', false, 'err', 'bad password');
  end if;
  select user_id into other from public.logins where login_key = k;
  if other is not null and other <> me then return jsonb_build_object('ok', false, 'err', 'login taken'); end if;
  delete from public.logins where user_id = me and login_key <> k; -- renamed: the old one is free again
  insert into public.logins (login_key, login, user_id, pass_hash)
    values (k, trim(login), me, extensions.crypt(password, extensions.gen_salt('bf', 10)))
    on conflict (login_key) do update set login = excluded.login, pass_hash = excluded.pass_hash, fails = 0,
      locked_until = null, updated_at = now();
  return jsonb_build_object('ok', true, 'login', trim(login));
end $$;

-- checks a login and its password; counts the wrong ones (five in a row: ten minutes locked)
create or replace function public._login_check(login text, password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
declare r public.logins;
begin
  select * into r from public.logins where login_key = _login_key(login) for update;
  if not found then return jsonb_build_object('ok', false, 'err', 'wrong login or password'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'err', 'locked', 'wait', ceil(extract(epoch from r.locked_until - now())));
  end if;
  if password is null or extensions.crypt(password, r.pass_hash) <> r.pass_hash then
    update public.logins set fails = case when r.fails + 1 >= 5 then 0 else r.fails + 1 end,
      locked_until = case when r.fails + 1 >= 5 then now() + interval '10 minutes' else null end
      where login_key = r.login_key;
    return jsonb_build_object('ok', false, 'err', 'wrong login or password');
  end if;
  update public.logins set fails = 0, locked_until = null where login_key = r.login_key;
  return jsonb_build_object('ok', true, 'login', r.login, 'user', r.user_id);
end $$;

-- before switching this device to a fresh session: is the password right? (nothing moves)
create or replace function public.act_check_login(login text, password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  if not _rate(me, 'login', 0.2, 5) then return jsonb_build_object('ok', false, 'err', 'too many attempts'); end if;
  r := _login_check(login, password);
  return r - 'user';
end $$;

-- logging in: the login's game comes over to this device's session (the client opens a fresh one first)
create or replace function public.act_login(login text, password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb; old uuid; n integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  if not _rate(me, 'login', 0.2, 5) then return jsonb_build_object('ok', false, 'err', 'too many attempts'); end if;
  r := _login_check(login, password);
  if not (r ->> 'ok')::boolean then return r; end if;
  old := (r ->> 'user')::uuid;
  n := _move_account(old, me);
  return jsonb_build_object('ok', true, 'login', r ->> 'login', 'worlds', n);
end $$;

-- this session's login, if any; and if its game left for another device, the login it left with
create or replace function public.act_my_login() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  return jsonb_build_object('ok', true,
    'login', (select login from public.logins where user_id = me),
    'moved', (select coalesce(login, '') from public.moved_accounts where old_id = me));
end $$;

-- ---------- for the game's owner only, by hand ----------
create or replace function public.admin_login_info(login text) returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare r public.logins;
begin
  select * into r from public.logins where login_key = _login_key(login);
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true, 'login', r.login, 'created', r.created_at, 'locked_until', r.locked_until,
    'recovery_code', exists (select 1 from public.recovery where user_id = r.user_id),
    'worlds', coalesce((select jsonb_agg(jsonb_build_object(
        'world', p.world, 'name', p.name, 'last_saved', p.updated_at, 'gwei', p.gwei,
        'items', (select coalesce(jsonb_object_agg(i.item, i.n), '{}'::jsonb) from public.inventory i where i.user_id = r.user_id and i.world = p.world and i.n > 0),
        'uniques', (select coalesce(jsonb_agg(u.item order by u.item), '[]'::jsonb) from public.uniques u where u.user_id = r.user_id and u.world = p.world),
        'claims', (select coalesce(jsonb_agg(jsonb_build_object('x', c.cx * 16 + 8, 'z', c.cz * 16 + 8)), '[]'::jsonb) from public.claims c where c.owner = r.user_id and c.world = p.world),
        'validators', (select count(*) from public.validators v where v.owner = r.user_id and v.world = p.world)))
      from public.players p where p.user_id = r.user_id), '[]'::jsonb));
end $$;

create or replace function public.admin_reset_password(login text, password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
begin
  if password is null or length(password) < 6 or length(password) > 72 then
    return jsonb_build_object('ok', false, 'err', 'the password needs 6 to 72 characters');
  end if;
  update public.logins set pass_hash = extensions.crypt(password, extensions.gen_salt('bf', 10)), fails = 0, locked_until = null,
    updated_at = now() where login_key = _login_key(login);
  if not found then return jsonb_build_object('ok', false, 'err', 'no such login'); end if;
  return jsonb_build_object('ok', true, 'login', (select l.login from public.logins l where l.login_key = _login_key(login)));
end $$;

-- rights: the act_ functions for the players, the internal ones and the admin ones for nobody
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname in ('_move_account', '_core_claim_recovery', '_login_key', '_login_ok', '_login_check',
             'act_set_login', 'act_check_login', 'act_login', 'act_my_login', 'admin_login_info', 'admin_reset_password') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 4) = 'act_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if left(f.name, 6) = 'admin_' then execute format('revoke all on function %s from service_role', f.sig); end if;
  end loop;
end $$;
