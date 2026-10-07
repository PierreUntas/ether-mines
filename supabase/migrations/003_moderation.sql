-- 003: server-arbitrated chat, reports, and client error logging.
--   1. Chat goes through act_chat: username and color taken from the player's own game record (no
--      speaking as someone else), rate limited, length capped, banned words masked, muted players refused.
--   2. /report: three different players (who have already played) within 24h mute a player (1h, doubling
--      on each repeat offense).
--   3. log_error: players' JavaScript errors land in the client_errors table (kept 14 days).
-- Requires 002_security.sql (_rate, _me_or_fail). Replayable without error.

-- ---------- 1. chat ----------
create table if not exists public.chat (
  id      bigint generated always as identity primary key,
  world   text        not null,
  user_id uuid        not null references auth.users (id) on delete cascade,
  name    text        not null,
  color   text        not null,
  text    text        not null,
  at      timestamptz not null default now()
);
create index if not exists chat_world_at on public.chat (world, at);
alter table public.chat enable row level security;
drop policy if exists "read chat" on public.chat;
create policy "read chat" on public.chat for select using (true);
revoke insert, update, delete on public.chat from anon, authenticated;

-- Masked words in chat (compared without accents or case, whole word). Extendable by hand:
--   insert into chat_banned_words values ('word') on conflict do nothing;
create table if not exists public.chat_banned_words (word text primary key);
alter table public.chat_banned_words enable row level security; -- no policy: functions only
insert into public.chat_banned_words values
  ('fuck'), ('fucking'), ('shit'), ('bitch'), ('cunt'), ('asshole'), ('bastard'), ('slut'), ('whore'),
  ('dick'), ('pussy'), ('nigger'), ('nigga'), ('faggot'), ('retard')
on conflict do nothing;

create or replace function public._strip_accents(t text) returns text language sql immutable as $$
  select translate(lower(t), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa') $$;

-- Replaces each banned word with stars, leaving the rest of the message as is.
create or replace function public._mask(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare m record; base text := _strip_accents(t); out_ text := t; pos int; l int;
begin
  for m in select word from chat_banned_words loop
    l := char_length(m.word);
    loop
      -- first occurrence of the whole word (no letter or digit around it)
      select min(s.i) into pos from generate_series(1, char_length(base) - l + 1) s(i)
       where substr(base, s.i, l) = m.word
         and (s.i = 1 or substr(base, s.i - 1, 1) !~ '[a-z0-9]')
         and (s.i + l > char_length(base) or substr(base, s.i + l, 1) !~ '[a-z0-9]');
      exit when pos is null;
      out_ := overlay(out_ placing repeat('*', l) from pos for l);
      base := overlay(base placing repeat('*', l) from pos for l);
    end loop;
  end loop;
  return out_;
end $$;

create or replace function public.act_chat(w text, msg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); p players; t text; c text;
begin
  if octet_length(coalesce(msg, '')) > 1000 then return _no('message too long'); end if;
  select * into p from players where user_id = me and world = w;
  if p.muted_until > now() then
    return _no('muted', jsonb_build_object('minutes', ceil(extract(epoch from p.muted_until - now()) / 60)));
  end if;
  if not _rate(me, 'chat', 1, 4) then return _no('too many actions'); end if;
  -- control characters stripped, whitespace collapsed, 140 characters at most
  t := left(btrim(regexp_replace(regexp_replace(coalesce(msg, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 140);
  if t = '' then return _no('empty message'); end if;
  t := _mask(t);
  c := case when p.color ~ '^#[0-9a-fA-F]{6}$' then p.color else '#cccccc' end;
  insert into chat (world, user_id, name, color, text) values (w, me, left(coalesce(nullif(btrim(p.name), ''), 'anonymous'), 20), c, t);
  if random() < 0.02 then delete from chat where at < now() - interval '2 days'; end if;
  return jsonb_build_object('ok', true, 'text', t);
end $$;

-- ---------- 2. reports ----------
create table if not exists public.reports (
  world    text        not null,
  reporter uuid        not null references auth.users (id) on delete cascade,
  target   uuid        not null references auth.users (id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (world, reporter, target)
);
alter table public.reports enable row level security; -- no policy: functions only

create or replace function public.act_report(w text, username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); tgt players; n int; d interval;
begin
  if not _rate(me, 'report', 0.1, 5) then return _no('too many actions'); end if;
  -- against throwaway accounts made to silence someone: must have genuinely played in this world
  if not exists (select 1 from players where user_id = me and world = w and serial >= 20
                 and created_at < now() - interval '2 hours') then
    return _no('must have played a little');
  end if;
  select * into tgt from players where world = w and lower(name) = lower(btrim(left(username, 40))) and user_id <> me limit 1;
  if tgt.user_id is null then return _no('unknown player'); end if;
  insert into reports (world, reporter, target) values (w, me, tgt.user_id)
    on conflict (world, reporter, target) do update set at = now();
  select count(*) into n from reports where world = w and target = tgt.user_id and at > now() - interval '24 hours';
  if n >= 3 and coalesce(tgt.muted_until, '-infinity') < now() then
    d := interval '1 hour' * power(2, least(tgt.mutes, 4));   -- at most 16 hours
    update players set muted_until = now() + d, mutes = mutes + 1 where user_id = tgt.user_id and world = w;
    delete from reports where world = w and target = tgt.user_id;   -- start over after the sanction
    return jsonb_build_object('ok', true, 'muted', true);
  end if;
  return jsonb_build_object('ok', true, 'muted', false);
end $$;

-- ---------- 3. client errors ----------
create table if not exists public.client_errors (
  id      bigint generated always as identity primary key,
  user_id uuid,
  world   text,
  msg     text        not null,
  stack   text,
  src     text,
  ua      text,
  n       integer     not null default 1,
  at      timestamptz not null default now()
);
create index if not exists client_errors_at on public.client_errors (at);
alter table public.client_errors enable row level security; -- no policy: read from the Supabase dashboard

create or replace function public.log_error(w text, msg text, stack text, src text, ua text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m text := left(coalesce(msg, '?'), 500); last_id bigint;
begin
  if me is null then return; end if;
  if not _rate(me, 'error', 0.1, 10) then return; end if;
  -- same error, same player, within the hour: count instead of duplicating
  select id into last_id from client_errors where user_id = me and client_errors.msg = m and at > now() - interval '1 hour' limit 1;
  if last_id is not null then
    update client_errors set n = n + 1, at = now() where id = last_id;
  else
    insert into client_errors (user_id, world, msg, stack, src, ua)
      values (me, left(w, 32), m, left(stack, 2000), left(src, 300), left(ua, 300));
  end if;
  if random() < 0.02 then delete from client_errors where at < now() - interval '14 days'; end if;
end $$;

-- ---------- 4. rights and broadcast ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_'
             or p.proname in ('set_recovery_code', 'claim_recovery', 'log_error')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
do $$ begin
  begin alter publication supabase_realtime add table public.chat; exception when duplicate_object then null; end;
end $$;
