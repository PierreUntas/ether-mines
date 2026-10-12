-- 031: nicknames go through the chat's banned-word list too (chat_banned_words, 003_moderation.sql).
--   A nickname shows above your head and in every list, so it's checked harder than a chat message:
--   accents stripped, common leetspeak undone (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s), then a long
--   banned word (5 letters or more, or "fuck") is refused anywhere in the name, even glued to other
--   letters, and a short one only as a whole word (so "Dickens" or "Yoshitaka" stay fine).
--   A few French words join the list (they also get masked in the chat).
-- Requires 001_schema.sql, 003_moderation.sql, 005_usernames.sql. Replayable without error.

insert into public.chat_banned_words values
  ('connard'), ('connasse'), ('salope'), ('pute'), ('encule'), ('enculer'), ('batard'), ('nazi'), ('hitler')
on conflict do nothing;

-- no "_" prefix on purpose: the guard below runs with the player's own rights (it checks current_user),
-- and the rights loops revoke "_" functions from players; this one only answers yes or no
create or replace function public.username_banned(n text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare base text := translate(_strip_accents(coalesce(n, '')), '013457@$', 'oieaasta');
        glued text := regexp_replace(base, '[^a-z]', '', 'g');
        words text[] := regexp_split_to_array(base, '[^a-z]+');
begin
  return exists (select 1 from chat_banned_words b
                 where (char_length(b.word) >= 5 or b.word = 'fuck') and position(b.word in glued) > 0
                    or b.word = any (words));
end $$;

-- the start screen asks before entering the world (no "_" prefix: callable by players, like is_username_taken)
create or replace function public.is_username_allowed(uname text) returns boolean
language sql stable security definer set search_path = public as $$
  select not username_banned(uname)
$$;

-- 005's guard, plus the banned-word check
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
  if n is not null and (tg_op = 'INSERT' or n is distinct from old.name) and username_banned(n) then
    raise exception 'username not allowed';
  end if;
  -- uniqueness checked when the username changes (not when the server moves a record, e.g. recovery code)
  if n is not null and (tg_op = 'INSERT' or lower(n) is distinct from lower(old.name))
     and is_username_taken(new.world, n, new.user_id, case when tg_op = 'UPDATE' then old.user_id end) then
    raise exception 'username already taken';
  end if;
  return new;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
