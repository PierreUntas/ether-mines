-- 047: you enter the game with your nickname and a password. The nickname is the login (046's logins):
-- one in the whole game, case-insensitive. A free nickname with a password makes your account; your
-- nickname with its password, on another device, brings your game there; on your usual device the
-- browser remembers you. A game started before passwords (a nickname with no login yet) gets one when
-- its player enters on that same device with a password of their choosing, or from the owner
-- (admin_set_password: a temporary password, to be changed at the first entry: must_change).
-- For the game's owner, by hand in the SQL Editor (nobody else can call them):
--   select * from admin_players();                          -- every nickname: worlds, last played, password or not
--   select * from admin_temp_passwords();                   -- a temporary password for every game that has none
--   select admin_set_password('Lucas', 'temp-4821');        -- one player (a forgotten password: check it's them)
--   select admin_player_info('Lucas');                      -- what they own, to check it's them
-- The recovery codes and 046's separate logins keep working on the server; the screen no longer offers them.
-- Requires 046_logins.sql. Replayable without error.

alter table public.logins add column if not exists must_change boolean not null default false;

-- a nickname as the players' records keep them (005_usernames.sql): latin letters, digits, space, _ . -
create or replace function public._nick_ok(n text) returns boolean language sql immutable as $$
  select coalesce(btrim(n) ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.-]{2,20}$', false) $$;

-- entering the game. ok: you're in (login, must_change, moved: worlds brought over). Otherwise err:
-- 'wrong password' (or 'locked', with wait), 'nickname taken' (a game started before passwords, not
-- yours), 'bad nickname', 'bad password', 'fresh' (right password, but this device holds another game:
-- open a fresh session and enter again, so that game isn't overwritten), 'too many attempts'.
create or replace function public.act_enter(nick text, password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
declare me uuid := auth.uid(); k text := _login_key(nick); r public.logins; c jsonb; n integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  if not _rate(me, 'login', 0.2, 5) then return jsonb_build_object('ok', false, 'err', 'too many attempts'); end if;
  if not _nick_ok(nick) then return jsonb_build_object('ok', false, 'err', 'bad nickname'); end if;
  select * into r from public.logins where login_key = k;
  if found then
    if r.user_id <> me and (exists (select 1 from public.players where user_id = me and name is not null)
                            or exists (select 1 from public.logins where user_id = me)) then
      c := _login_check(nick, password);
      if not (c ->> 'ok')::boolean then return (c - 'user') || jsonb_build_object('err', case when c ->> 'err' = 'locked' then 'locked' else 'wrong password' end); end if;
      return jsonb_build_object('ok', false, 'err', 'fresh');
    end if;
    c := _login_check(nick, password);
    if not (c ->> 'ok')::boolean then return (c - 'user') || jsonb_build_object('err', case when c ->> 'err' = 'locked' then 'locked' else 'wrong password' end); end if;
    n := _move_account(r.user_id, me);
    return jsonb_build_object('ok', true, 'login', r.login, 'must_change', r.must_change, 'moved', n);
  end if;
  -- a nickname with no password yet: yours if no one else plays under it
  if exists (select 1 from public.players p where lower(p.name) = k and p.user_id <> me) then
    return jsonb_build_object('ok', false, 'err', 'nickname taken');
  end if;
  if exists (select 1 from public.logins where user_id = me) then return jsonb_build_object('ok', false, 'err', 'fresh'); end if;
  if password is null or length(password) < 6 or length(password) > 72 then
    return jsonb_build_object('ok', false, 'err', 'bad password');
  end if;
  insert into public.logins (login_key, login, user_id, pass_hash)
    values (k, btrim(nick), me, extensions.crypt(password, extensions.gen_salt('bf', 10)));
  return jsonb_build_object('ok', true, 'login', btrim(nick), 'must_change', false, 'created', true);
end $$;

-- your own password, changed (a temporary one included: must_change is lifted)
create or replace function public.act_set_password(password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  if not _rate(me, 'login', 0.2, 5) then return jsonb_build_object('ok', false, 'err', 'too many attempts'); end if;
  if password is null or length(password) < 6 or length(password) > 72 then
    return jsonb_build_object('ok', false, 'err', 'bad password');
  end if;
  update public.logins set pass_hash = extensions.crypt(password, extensions.gen_salt('bf', 10)), must_change = false,
    fails = 0, locked_until = null, updated_at = now() where user_id = me;
  if not found then return jsonb_build_object('ok', false, 'err', 'no account'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 046's, plus whether your password is a temporary one
create or replace function public.act_my_login() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'err', 'not signed in'); end if;
  return jsonb_build_object('ok', true,
    'login', (select login from public.logins where user_id = me),
    'must_change', coalesce((select must_change from public.logins where user_id = me), false),
    'moved', (select coalesce(login, '') from public.moved_accounts where old_id = me));
end $$;

-- ---------- for the game's owner only, by hand ----------
-- every nickname in the game: its worlds, when it last played, whether it has a password, and how many
-- accounts carry it (more than one: two different players, rename one before giving a password)
create or replace function public.admin_players()
returns table (nickname text, accounts bigint, worlds text, last_played timestamptz, has_password boolean, temporary boolean)
language sql stable security definer set search_path = public as $$
  select min(p.name), count(distinct p.user_id), string_agg(distinct p.world, ', '), max(p.updated_at),
         bool_or(l.user_id is not null), bool_or(coalesce(l.must_change, false))
  from public.players p left join public.logins l on l.user_id = p.user_id
  where p.name is not null
  group by lower(p.name)
  order by max(p.updated_at) desc nulls last;
$$;

-- a temporary password for one player, to be changed at their first entry
create or replace function public.admin_set_password(nick text, password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_variable
declare k text := _login_key(nick); owners uuid[]; shown text;
begin
  if password is null or length(password) < 6 or length(password) > 72 then
    return jsonb_build_object('ok', false, 'err', 'the password needs 6 to 72 characters');
  end if;
  update public.logins set pass_hash = extensions.crypt(password, extensions.gen_salt('bf', 10)), must_change = true,
    fails = 0, locked_until = null, updated_at = now() where login_key = k;
  if found then return jsonb_build_object('ok', true, 'nickname', (select login from public.logins where login_key = k), 'temporary', true); end if;
  select array_agg(distinct p.user_id), min(p.name) into owners, shown from public.players p where lower(p.name) = k;
  if owners is null then return jsonb_build_object('ok', false, 'err', 'no player with this nickname'); end if;
  if array_length(owners, 1) > 1 then
    return jsonb_build_object('ok', false, 'err', 'two different accounts carry this nickname: rename one first',
      'worlds', (select jsonb_agg(jsonb_build_object('world', p.world, 'account', p.user_id)) from public.players p where lower(p.name) = k));
  end if;
  if exists (select 1 from public.logins where user_id = owners[1]) then
    return jsonb_build_object('ok', false, 'err', 'this account already has a login: ' || (select login from public.logins where user_id = owners[1]));
  end if;
  insert into public.logins (login_key, login, user_id, pass_hash, must_change)
    values (k, btrim(shown), owners[1], extensions.crypt(password, extensions.gen_salt('bf', 10)), true);
  return jsonb_build_object('ok', true, 'nickname', btrim(shown), 'temporary', true);
end $$;

-- a temporary password for every game that has none yet: the list to send to each player (a nickname
-- carried by two accounts is left out, with a word about it)
create or replace function public.admin_temp_passwords()
returns table (nickname text, temporary_password text, worlds text, note text)
language plpgsql security definer set search_path = public, extensions as $$
declare g record; pw text; r jsonb;
begin
  for g in select lower(p.name) as k, min(p.name) as name, string_agg(distinct p.world, ', ') as worlds
           from public.players p
           where p.name is not null and not exists (select 1 from public.logins l where l.user_id = p.user_id)
             and not exists (select 1 from public.logins l where l.login_key = lower(p.name))
           group by lower(p.name) order by min(p.name) loop
    pw := 'ether-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);
    r := admin_set_password(g.name, pw);
    nickname := g.name;
    worlds := g.worlds;
    if (r ->> 'ok')::boolean then
      temporary_password := pw;
      note := 'to change at the first entry';
    else
      temporary_password := null;
      note := r ->> 'err';
    end if;
    return next;
  end loop;
end $$;

-- what a player owns, by nickname (with or without a password), to check a request is really theirs
create or replace function public.admin_player_info(nick text) returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare k text := _login_key(nick);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'account', a.uid,
      'password', exists (select 1 from public.logins l where l.user_id = a.uid),
      'worlds', (select jsonb_agg(jsonb_build_object(
          'world', p.world, 'name', p.name, 'last_saved', p.updated_at, 'gwei', p.gwei,
          'items', (select coalesce(jsonb_object_agg(i.item, i.n), '{}'::jsonb) from public.inventory i where i.user_id = a.uid and i.world = p.world and i.n > 0),
          'uniques', (select coalesce(jsonb_agg(u.item order by u.item), '[]'::jsonb) from public.uniques u where u.user_id = a.uid and u.world = p.world),
          'claims', (select coalesce(jsonb_agg(jsonb_build_object('x', c.cx * 16 + 8, 'z', c.cz * 16 + 8)), '[]'::jsonb) from public.claims c where c.owner = a.uid and c.world = p.world),
          'validators', (select count(*) from public.validators v where v.owner = a.uid and v.world = p.world)))
        from public.players p where p.user_id = a.uid)))
    from (select distinct p.user_id as uid from public.players p where lower(p.name) = k
          union select l.user_id from public.logins l where l.login_key = k) a), '[]'::jsonb);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname in ('_nick_ok', 'act_enter', 'act_set_password', 'act_my_login',
             'admin_players', 'admin_set_password', 'admin_temp_passwords', 'admin_player_info') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 4) = 'act_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if left(f.name, 6) = 'admin_' then execute format('revoke all on function %s from service_role', f.sig); end if;
  end loop;
end $$;
