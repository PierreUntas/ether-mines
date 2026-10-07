-- 005: username hardening.
--   Usernames: 20 characters at most, unique in a world (case-insensitive); valid color.
--   Prevents impersonating another player (chat, claim invites, reports).
--   "New game" goes through act_new_game instead of deleting/moving the player record (which would
--   reset its counters: today's gifts, position, mining pace, mute status...).
-- Requires 001_schema.sql, 002_security.sql. Replayable without error.

-- the player only sees their own record (RLS): the uniqueness check runs with the server's rights.
-- No "_" prefix: the migrations' rights loops don't lock it down (it only reveals whether a username is taken).
create or replace function public.is_username_taken(w text, name text, uid uuid, previous uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.world = w and lower(p.name) = lower(name)
                 and p.user_id <> uid and p.user_id is distinct from previous)
$$;

create or replace function public._players_guard() returns trigger
language plpgsql set search_path = public as $$
declare n text;
begin
  -- server functions (security definer) run as the owner: only they change these columns
  if current_user in ('authenticated', 'anon') and tg_op = 'UPDATE'
     and (new.user_id <> old.user_id or new.world <> old.world) then
    raise exception 'player record can''t be modified';
  end if;
  -- latin letters (accents included), digits, space, _ . - : no invisible characters or lookalikes (cyrillic...)
  n := nullif(left(btrim(regexp_replace(coalesce(new.name, ''), '[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]', '', 'g')), 20), '');
  new.name := n;
  if new.color is null or new.color !~ '^#[0-9a-fA-F]{6}$' then new.color := '#8a7bef'; end if;
  -- uniqueness checked when the username changes (not when the server moves a record, e.g. recovery code)
  if n is not null and (tg_op = 'INSERT' or lower(n) is distinct from lower(old.name))
     and is_username_taken(new.world, n, new.user_id, case when tg_op = 'UPDATE' then old.user_id end) then
    raise exception 'username already taken';
  end if;
  return new;
end $$;
drop trigger if exists players_guard on public.players;
create trigger players_guard before insert or update on public.players
  for each row execute function public._players_guard();
-- the unique index also settles simultaneous signups under the same username
create unique index if not exists players_username on public.players (world, lower(name)) where name is not null;

-- "New game": clears the saved game state in the player record, without touching server-side counters.
create or replace function public.act_new_game(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'newgame', 0.05, 2) then return _no('too many actions'); end if;
  update players set state = '{}'::jsonb where user_id = me and world = w;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- rights ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;
revoke all on function public.is_username_taken(text, text, uuid, uuid) from public, anon;
grant execute on function public.is_username_taken(text, text, uuid, uuid) to authenticated;
