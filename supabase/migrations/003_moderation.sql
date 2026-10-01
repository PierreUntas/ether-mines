-- 003 : chat arbitré par le serveur, signalements, et remontée des erreurs du jeu.
--   1. Le chat passe par act_chat : pseudo et couleur pris dans la partie (impossible de parler au nom d'un autre),
--      rythme limité, longueur bornée, mots bannis masqués, joueurs rendus muets refusés.
--   2. /signaler : trois joueurs différents (ayant déjà joué) en 24 h rendent un joueur muet (1 h, puis le double à chaque récidive).
--   3. log_error : les erreurs JavaScript des joueurs arrivent dans la table client_errors (14 jours gardés).
-- Rejouable sans erreur. Nécessite 002_securite.sql (_rate, _me_or_fail).

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
drop policy if exists "lire le chat" on public.chat;
create policy "lire le chat" on public.chat for select using (true);
revoke insert, update, delete on public.chat from anon, authenticated;

alter table public.players add column if not exists muted_until timestamptz;
alter table public.players add column if not exists mutes integer not null default 0;
-- un joueur ne peut pas se rendre la parole lui-même
revoke update (muted_until, mutes) on public.players from anon, authenticated;

-- Mots masqués dans le chat (comparaison sans accents ni majuscules, mot entier). Complétable à la main :
--   insert into chat_mots_bannis values ('motif') on conflict do nothing;
create table if not exists public.chat_mots_bannis (mot text primary key);
alter table public.chat_mots_bannis enable row level security; -- aucune règle : réservé aux fonctions
insert into public.chat_mots_bannis values
  ('connard'), ('connasse'), ('salope'), ('salaud'), ('encule'), ('enculee'), ('pute'), ('putain'), ('batard'),
  ('fdp'), ('ntm'), ('tg'), ('nique'), ('niquer'), ('pd'), ('tapette'), ('gouine'), ('negre'), ('bougnoule'),
  ('youpin'), ('bicot'), ('mongol'), ('attarde'), ('fuck'), ('fucking'), ('shit'), ('bitch'), ('cunt'), ('nigger'),
  ('nigga'), ('faggot'), ('retard'), ('whore')
on conflict do nothing;

create or replace function public._sans_accents(t text) returns text language sql immutable as $$
  select translate(lower(t), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa') $$;

-- Remplace chaque mot banni par des étoiles, en gardant le reste du message tel quel.
create or replace function public._masquer(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare m record; base text := _sans_accents(t); out_ text := t; pos int; l int;
begin
  for m in select mot from chat_mots_bannis loop
    l := char_length(m.mot);
    loop
      -- première occurrence du mot entier (ni lettre ni chiffre autour)
      select min(s.i) into pos from generate_series(1, char_length(base) - l + 1) s(i)
       where substr(base, s.i, l) = m.mot
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
  select * into p from players where user_id = me and world = w;
  if p.muted_until > now() then
    return _no('muet', jsonb_build_object('minutes', ceil(extract(epoch from p.muted_until - now()) / 60)));
  end if;
  if not _rate(me, 'chat', 1, 4) then return _no('trop d''actions'); end if;
  -- caractères de contrôle retirés, espaces resserrés, 140 caractères au plus
  t := left(btrim(regexp_replace(regexp_replace(coalesce(msg, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 140);
  if t = '' then return _no('message vide'); end if;
  t := _masquer(t);
  c := case when p.color ~ '^#[0-9a-fA-F]{6}$' then p.color else '#cccccc' end;
  insert into chat (world, user_id, name, color, text) values (w, me, left(coalesce(nullif(btrim(p.name), ''), 'anonyme'), 20), c, t);
  if random() < 0.02 then delete from chat where at < now() - interval '2 days'; end if;
  return jsonb_build_object('ok', true, 'text', t);
end $$;

-- ---------- 2. signalements ----------
create table if not exists public.reports (
  world    text        not null,
  reporter uuid        not null references auth.users (id) on delete cascade,
  target   uuid        not null references auth.users (id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (world, reporter, target)
);
alter table public.reports enable row level security; -- aucune règle : réservé aux fonctions

create or replace function public.act_report(w text, pseudo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); tgt players; n int; d interval;
begin
  if not _rate(me, 'report', 0.1, 5) then return _no('trop d''actions'); end if;
  -- contre les comptes jetables créés pour faire taire quelqu'un : il faut avoir déjà joué dans ce monde
  if not exists (select 1 from players where user_id = me and world = w and (mine_at is not null or serial > 0)) then
    return _no('il faut avoir joué un peu');
  end if;
  select * into tgt from players where world = w and lower(name) = lower(btrim(pseudo)) and user_id <> me
    order by updated_at desc limit 1;
  if tgt.user_id is null then return _no('joueur inconnu'); end if;
  insert into reports (world, reporter, target) values (w, me, tgt.user_id)
    on conflict (world, reporter, target) do update set at = now();
  select count(*) into n from reports where world = w and target = tgt.user_id and at > now() - interval '24 hours';
  if n >= 3 and coalesce(tgt.muted_until, '-infinity') < now() then
    d := interval '1 hour' * power(2, least(tgt.mutes, 6));
    update players set muted_until = now() + d, mutes = mutes + 1 where user_id = tgt.user_id and world = w;
    delete from reports where world = w and target = tgt.user_id;   -- on repart de zéro après la sanction
    return jsonb_build_object('ok', true, 'muted', true);
  end if;
  return jsonb_build_object('ok', true, 'muted', false);
end $$;

-- ---------- 3. erreurs du jeu ----------
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
alter table public.client_errors enable row level security; -- aucune règle : lecture dans le tableau de bord Supabase

create or replace function public.log_error(w text, msg text, stack text, src text, ua text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m text := left(coalesce(msg, '?'), 500); last_id bigint;
begin
  if me is null then return; end if;
  if not _rate(me, 'error', 0.1, 10) then return; end if;
  -- même erreur, même joueur, dans l'heure : on compte au lieu de dupliquer
  select id into last_id from client_errors where user_id = me and client_errors.msg = m and at > now() - interval '1 hour' limit 1;
  if last_id is not null then
    update client_errors set n = n + 1, at = now() where id = last_id;
  else
    insert into client_errors (user_id, world, msg, stack, src, ua)
      values (me, left(w, 32), m, left(stack, 2000), left(src, 300), left(ua, 300));
  end if;
  if random() < 0.02 then delete from client_errors where at < now() - interval '14 days'; end if;
end $$;

-- ---------- 4. droits et diffusion ----------
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
