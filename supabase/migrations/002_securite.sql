-- 002 : sécurité des actions.
--   1. Limites de rythme : un joueur ne peut pas enchaîner les appels plus vite qu'un humain.
--   2. Portée de main et déplacements : chaque action sur un bloc envoie la position du joueur ;
--      le bloc doit être à portée, et la position doit être atteignable depuis la précédente.
-- Les fonctions act_* de 001 deviennent des fonctions internes _core_* ; les nouvelles act_* vérifient puis les appellent.
-- Rejouable sans erreur.

-- ---------- 1. limites de rythme (seau de jetons par joueur et par type d'action) ----------
create table if not exists public.rate_limits (
  user_id uuid        not null references auth.users (id) on delete cascade,
  kind    text        not null,
  tokens  real        not null,
  at      timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.rate_limits enable row level security; -- aucune règle : réservé aux fonctions

-- Consomme un jeton si possible. per_s : jetons regagnés par seconde ; burst : réserve maximale.
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

-- ---------- 2. position du joueur ----------
alter table public.players add column if not exists pos_x real;
alter table public.players add column if not exists pos_y real;
alter table public.players add column if not exists pos_z real;
alter table public.players add column if not exists pos_at timestamptz;

-- Vérifie qu'une position annoncée est plausible (atteignable depuis la dernière connue, ou téléportation permise)
-- et, si une cible est donnée, qu'elle est à portée de main. Enregistre la position si tout va bien.
-- Renvoie null si c'est bon, sinon la raison du refus.
create or replace function public._check_pos(me uuid, w text, ex real, ey real, ez real, tx int default null, ty int default null, tz int default null)
returns text language plpgsql security definer set search_path = public as $$
declare p players; dt real; horiz real; up real; ok boolean := false;
begin
  if ex is null or ey is null or ez is null then return 'position manquante'; end if;
  if abs(ex) > 100000 or abs(ez) > 100000 or ey < -20 or ey > 80 then return 'position hors du monde'; end if;
  select * into p from players where user_id = me and world = w;
  if p.pos_at is null then ok := true;                                   -- première position connue
  else
    dt := greatest(extract(epoch from clock_timestamp() - p.pos_at), 0);
    horiz := sqrt((ex - p.pos_x) ^ 2 + (ez - p.pos_z) ^ 2);
    up := ey - p.pos_y;                                                  -- les chutes ne sont pas limitées
    ok := horiz <= 9 * dt + 8 and up <= 9 * dt + 6;                       -- course 6,6 blocs/s, avec de la marge pour le réseau
    if not ok then ok := sqrt((ex - 8.5) ^ 2 + (ez - 10.5) ^ 2) <= 8; end if; -- retour au sanctuaire (/sanctuaire, chute dans le vide)
    if not ok then                                                        -- /rejoindre : à côté d'un joueur actif récemment
      ok := exists (select 1 from players o where o.world = w and o.user_id <> me and o.pos_at > clock_timestamp() - interval '2 minutes'
                    and sqrt((ex - o.pos_x) ^ 2 + (ez - o.pos_z) ^ 2) <= 6);
    end if;
  end if;
  if not ok then return 'déplacement impossible'; end if;
  if tx is not null and sqrt((tx + 0.5 - ex) ^ 2 + (ty + 0.5 - (ey + 1.6)) ^ 2 + (tz + 0.5 - ez) ^ 2) > 6.5 then
    return 'trop loin';
  end if;
  update players set pos_x = ex, pos_y = ey, pos_z = ez, pos_at = clock_timestamp() where user_id = me and world = w;
  return null;
end $$;

-- ---------- 3. les anciennes act_* deviennent internes ----------
do $$
declare r record;
begin
  for r in select * from (values
      ('act_mine', 'text, integer, integer, integer, text', '_core_mine'),
      ('act_place', 'text, integer, integer, integer, integer, integer', '_core_place'),
      ('act_toggle', 'text, integer, integer, integer', '_core_toggle'),
      ('act_relight', 'text, integer, integer, integer', '_core_relight'),
      ('act_craft', 'text, integer', '_core_craft'),
      ('act_gift', 'text, text, text', '_core_gift'),
      ('act_rewards', 'text', '_core_rewards'),
      ('act_claim', 'text, integer, integer', '_core_claim'),
      ('act_unclaim', 'text, integer, integer', '_core_unclaim'),
      ('act_member', 'text, text, boolean', '_core_member')) as t(old, args, core) loop
    if to_regprocedure('public.' || r.old || '(' || r.args || ')') is not null then
      if to_regprocedure('public.' || r.core || '(' || r.args || ')') is null then
        execute format('alter function public.%I(%s) rename to %I', r.old, r.args, r.core);
      else
        execute format('drop function public.%I(%s)', r.old, r.args);   -- 001 relancé après 002
      end if;
    end if;
  end loop;
end $$;

-- Contenu d'une case pour corriger l'affichage du client après un refus ; null si le tronçon n'est pas encore figé.
create or replace function public._cell_soft(w text, x int, y int, z int) returns int
language plpgsql security definer set search_path = public as $$
begin
  return _cell(w, x, y, z);
exception when others then
  return null;
end $$;

-- ---------- 4. nouvelles act_* : rythme, position, portée, puis la règle du jeu ----------
create or replace function public._me_or_fail(w text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  perform _player(auth.uid(), w);
  return auth.uid();
end $$;

create or replace function public.act_mine(w text, px int, py int, pz int, held text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'mine', 8, 16) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e, jsonb_build_object('cell', _cell_soft(w, px, py, pz))); end if;
  return _core_mine(w, px, py, pz, held);
end $$;

create or replace function public.act_place(w text, px int, py int, pz int, it int, bid int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'place', 8, 16) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e, jsonb_build_object('cell', _cell_soft(w, px, py, pz))); end if;
  -- on ne pose pas un bloc plein dans son propre corps
  if (select solid from rule_blocks where id = bid) and (select kind from rule_blocks where id = bid) not in ('door')
     and px + 1 > ex - 0.3 and px < ex + 0.3 and pz + 1 > ez - 0.3 and pz < ez + 0.3 and py + 1 > ey and py < ey + 1.75 then
    return _no('case occupée');
  end if;
  return _core_place(w, px, py, pz, it, bid);
end $$;

create or replace function public.act_toggle(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'toggle', 4, 8) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e); end if;
  return _core_toggle(w, px, py, pz);
end $$;

create or replace function public.act_relight(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'relight', 1, 3) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return _no(e); end if;
  return _core_relight(w, px, py, pz);
end $$;

-- Simple signal de position (toutes les ~15 s en mouvement) : sert à /rejoindre et garde la position serveur fraîche.
create or replace function public.act_pos(w text, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'pos', 0.5, 3) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.act_craft(w text, out_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'craft', 4, 12) then return _no('trop d''actions'); end if;
  return _core_craft(w, out_id);
end $$;

create or replace function public.act_gift(w text, animal text, kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'gift', 0.5, 3) then return _no('trop d''actions'); end if;
  return _core_gift(w, animal, kind);
end $$;

create or replace function public.act_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'rewards', 0.1, 2) then return jsonb_build_object('ok', true, 'inv', '{}'::jsonb, 'slots', 0); end if;
  return _core_rewards(w);
end $$;

-- Revendiquer : il faut se trouver dans le tronçon revendiqué.
create or replace function public.act_claim(w text, qx int, qz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  if floor(ex)::int >> 4 <> qx or floor(ez)::int >> 4 <> qz then return _no('il faut se trouver dans la parcelle'); end if;
  return _core_claim(w, qx, qz);
end $$;

create or replace function public.act_unclaim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('trop d''actions'); end if;
  return _core_unclaim(w, qx, qz);
end $$;

create or replace function public.act_member(w text, pseudo text, invite boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'member', 0.5, 4) then return _no('trop d''actions'); end if;
  return _core_member(w, pseudo, invite);
end $$;

-- Codes de sauvegarde : pas plus d'un essai toutes les quelques secondes (contre les essais en masse).
-- Un code inconnu renvoie -1 au lieu d'une erreur : une erreur annulerait aussi le jeton consommé.
do $$ begin
  if to_regprocedure('public._core_claim_recovery(text)') is null and to_regprocedure('public.claim_recovery(text)') is not null then
    alter function public.claim_recovery(text) rename to _core_claim_recovery;
  elsif to_regprocedure('public._core_claim_recovery(text)') is not null then
    drop function if exists public.claim_recovery(text);
  end if;
end $$;
create or replace function public.claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if not _rate(auth.uid(), 'recovery', 0.2, 3) then raise exception 'trop d''essais, patiente un peu'; end if;
  begin
    return _core_claim_recovery(code);
  exception when raise_exception then
    if sqlerrm = 'code inconnu' then return -1; end if;
    raise;
  end;
end $$;

-- ---------- 5. droits : seules les act_* et les codes sont appelables par les joueurs ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_' or p.proname in ('set_recovery_code', 'claim_recovery')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
