-- 008 : durcissement avant l'ouverture aux joueurs (audit du serveur).
--   1. Un joueur ne peut plus effacer ni déplacer sa fiche « players » : cela remettait à zéro ses compteurs
--      (cadeaux du jour, position, rythme de minage, parole retirée…). « Nouvelle partie » passe par act_new_game.
--   2. Pseudos : 20 caractères au plus, uniques dans un monde (sans tenir compte des majuscules) ; couleur valide.
--      Empêche de se faire passer pour un autre (chat, invitations de parcelle, signalements).
--   3. Malle cassée pendant qu'un autre y puise : le contenu n'est plus versé deux fois.
--   4. Récompenses : un validateur ne compte que pour le temps où il était déjà posé.
--   5. Cadeaux : la méduse céleste offre un cristal (le client choisit l'animal : plus d'éclat pur gratuit).
--   6. Signalements : il faut avoir posé au moins 20 blocs pour signaler ; messages de chat trop longs refusés d'emblée.
--   7. La fonction « figer » peut appliquer une limite de rythme (_rate ouvert au rôle de service).
-- Rejouable sans erreur. Nécessite 001 à 007.

-- ---------- 1. la fiche du joueur ----------
drop policy if exists "effacer sa partie" on public.players;
-- âge de la fiche : les comptes tout neufs (jetables) ne peuvent ni recevoir de cadeaux ni signaler
alter table public.players add column if not exists created_at timestamptz not null default now();
revoke update (created_at) on public.players from anon, authenticated;
revoke delete on public.players from anon, authenticated;

-- le joueur ne voit que sa propre fiche (RLS) : la vérification d'unicité tourne avec les droits du serveur.
-- Nom sans « _ » : les boucles de droits des migrations ne la ferment pas (elle ne révèle que si un pseudo est pris).
drop function if exists public._pseudo_pris(text, text, uuid, uuid);
create or replace function public.pseudo_pris(w text, n text, uid uuid, ancien uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.world = w and lower(p.name) = lower(n)
                 and p.user_id <> uid and p.user_id is distinct from ancien)
$$;

create or replace function public._players_garde() returns trigger
language plpgsql set search_path = public as $$
declare n text;
begin
  -- les fonctions du serveur (security definer) tournent sous le propriétaire : elles seules changent ces colonnes
  if current_user in ('authenticated', 'anon') and tg_op = 'UPDATE'
     and (new.user_id <> old.user_id or new.world <> old.world) then
    raise exception 'fiche du joueur non modifiable';
  end if;
  -- lettres latines (accents compris), chiffres, espace, _ . - : pas de caractères invisibles ni de sosies (cyrillique…)
  n := nullif(left(btrim(regexp_replace(coalesce(new.name, ''), '[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]', '', 'g')), 20), '');
  new.name := n;
  if new.color is null or new.color !~ '^#[0-9a-fA-F]{6}$' then new.color := '#8a7bef'; end if;
  -- unicité vérifiée quand le pseudo change (pas quand le serveur déplace une fiche, ex. code de sauvegarde)
  if n is not null and (tg_op = 'INSERT' or lower(n) is distinct from lower(old.name))
     and pseudo_pris(new.world, n, new.user_id, case when tg_op = 'UPDATE' then old.user_id end) then
    raise exception 'pseudo déjà pris';
  end if;
  return new;
end $$;
drop trigger if exists players_garde on public.players;
create trigger players_garde before insert or update on public.players
  for each row execute function public._players_garde();
-- l'index unique tranche aussi les inscriptions simultanées sous le même pseudo
create unique index if not exists players_pseudo on public.players (world, lower(name)) where name is not null;

-- « Nouvelle partie » : efface l'état de jeu gardé dans la fiche, sans toucher aux compteurs du serveur.
create or replace function public.act_new_game(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'newgame', 0.05, 2) then return _no('trop d''actions'); end if;
  update players set state = '{}'::jsonb where user_id = me and world = w;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 3. malle cassée : le contenu est retiré avant d'être versé ----------
create or replace function public._chest_broken() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb; k text; v text; inv jsonb := '{}'::jsonb;
begin
  if new.id = 98 then return new; end if;
  -- la suppression verrouille la ligne : un retrait en cours attend, puis ne trouve plus rien
  delete from chests where world = new.world and x = new.x and y = new.y and z = new.z returning items into it;
  if it is null or auth.uid() is null then return new; end if;
  for k, v in select * from jsonb_each_text(it) loop
    inv := _give(auth.uid(), new.world, k::int, v::int, inv);
  end loop;
  return new;
end $$;
-- un retrait qui attendait la ligne supprimée doit échouer proprement
create or replace function public.act_chest_move(w text, px int, py int, pz int, item int, n int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
        cur jsonb; have int; inv jsonb := '{}'::jsonb;
begin
  if e is not null then return _no(e); end if;
  if n = 0 or abs(n) > 10000 then return _no('quantité invalide'); end if;
  insert into chests (world, x, y, z) values (w, px, py, pz) on conflict do nothing;
  select items into cur from chests where world = w and x = px and y = py and z = pz for update;
  if cur is null or _cell(w, px, py, pz) <> 98 then return _no('pas de malle ici'); end if;
  have := coalesce((cur ->> item::text)::int, 0);
  if n > 0 then
    if _count(me, w, item) < n then return _no('pas assez dans ton sac'); end if;
    if have = 0 and (select count(*) from jsonb_object_keys(cur)) >= 27 then return _no('malle pleine'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := cur || jsonb_build_object(item::text, have + n);
  else
    n := greatest(n, -have);
    if n = 0 then return _no('rien de cet objet dans la malle'); end if;
    inv := _give(me, w, item, -n, inv);
    cur := case when have + n = 0 then cur - item::text else cur || jsonb_build_object(item::text, have + n) end;
  end if;
  update chests set items = cur where world = w and x = px and y = py and z = pz;
  return jsonb_build_object('ok', true, 'items', cur, 'inv', inv);
end $$;

-- ---------- 4. récompenses : seulement les validateurs déjà posés au début de la période payée ----------
create or replace function public._core_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; poses int; anciens int; parts int; slots int; gain int; pris int;
        depart timestamptz; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if pl.rewards_at is null then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', 0, 'n', 0);
  end if;
  depart := greatest(pl.rewards_at, now() - interval '30 minutes');      -- rattrapage limité
  select count(*) filter (where id = 13), count(*) filter (where id = 74) into poses, anciens
    from blocks where world = w and placed_by = me::text and id in (13, 74) and updated_at <= depart;
  parts := least(poses, 5) + 5 * anciens;
  if parts = 0 then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', 0, 'n', 0);
  end if;
  slots := floor(extract(epoch from now() - depart) / 12)::int;
  gain := floor(slots * parts / 25.0)::int;
  if gain < 1 then
    if depart <> pl.rewards_at then update players set rewards_at = depart where user_id = me and world = w; end if;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', parts, 'n', 0);
  end if;
  pris := ceil(gain * 25.0 / parts)::int;
  update players set rewards_at = depart + make_interval(secs => pris * 12) where user_id = me and world = w;
  inv := _give(me, w, 101, gain, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'slots', pris, 'weight', parts, 'n', gain);
end $$;

-- ---------- 5. cadeaux ----------
do $$ begin
  if to_regprocedure('public._core_gift(text, text, text)') is not null then
    execute $f$
create or replace function public._core_gift(w text, animal text, kind text) returns jsonb
language plpgsql security definer set search_path = public as $g$
declare me uuid := auth.uid(); pl players; today text := to_char(now(), 'YYYY-MM-DD'); g jsonb; it int; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if animal is null or char_length(animal) > 40 then return _no('animal inconnu'); end if;
  if pl.created_at > now() - interval '30 minutes' then return _no('les animaux ne te connaissent pas encore'); end if;
  g := coalesce((select jsonb_object_agg(k, v) from jsonb_each(pl.gifts) e(k, v) where v #>> '{}' = today), '{}');
  if g ? animal then return _no('déjà offert aujourd''hui'); end if;
  if (select count(*) from jsonb_object_keys(g)) >= 15 then return _no('assez de cadeaux pour aujourd''hui'); end if;
  it := case kind when 'mouton' then 71 when 'renard' then 17 + floor(random() * 3)::int when 'meduse' then 101 else null end;
  if it is null then return _no('animal sans cadeau'); end if;
  update players set gifts = g || jsonb_build_object(animal, today) where user_id = me and world = w;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $g$;
    $f$;
  end if;
end $$;

-- ---------- 6. signalements et chat ----------
do $$ begin
  if to_regprocedure('public.act_report(text, text)') is not null then
    execute $f$
create or replace function public.act_report(w text, pseudo text) returns jsonb
language plpgsql security definer set search_path = public as $g$
declare me uuid := _me_or_fail(w); tgt players; n int; d interval;
begin
  if not _rate(me, 'report', 0.1, 5) then return _no('trop d''actions'); end if;
  -- contre les comptes jetables créés pour faire taire quelqu'un : il faut avoir vraiment joué dans ce monde
  if not exists (select 1 from players where user_id = me and world = w and serial >= 20
                 and created_at < now() - interval '2 hours') then
    return _no('il faut avoir joué un peu');
  end if;
  select * into tgt from players where world = w and lower(name) = lower(btrim(left(pseudo, 40))) and user_id <> me limit 1;
  if tgt.user_id is null then return _no('joueur inconnu'); end if;
  insert into reports (world, reporter, target) values (w, me, tgt.user_id)
    on conflict (world, reporter, target) do update set at = now();
  select count(*) into n from reports where world = w and target = tgt.user_id and at > now() - interval '24 hours';
  if n >= 3 and coalesce(tgt.muted_until, '-infinity') < now() then
    d := interval '1 hour' * power(2, least(tgt.mutes, 4));   -- 16 heures au plus
    update players set muted_until = now() + d, mutes = mutes + 1 where user_id = tgt.user_id and world = w;
    delete from reports where world = w and target = tgt.user_id;
    return jsonb_build_object('ok', true, 'muted', true);
  end if;
  return jsonb_build_object('ok', true, 'muted', false);
end $g$;
    $f$;
  end if;
  if to_regprocedure('public.act_chat(text, text)') is not null then
    execute $f$
create or replace function public.act_chat(w text, msg text) returns jsonb
language plpgsql security definer set search_path = public as $g$
declare me uuid := _me_or_fail(w); p players; t text; c text;
begin
  if octet_length(coalesce(msg, '')) > 1000 then return _no('message trop long'); end if;
  select * into p from players where user_id = me and world = w;
  if p.muted_until > now() then
    return _no('muet', jsonb_build_object('minutes', ceil(extract(epoch from p.muted_until - now()) / 60)));
  end if;
  if not _rate(me, 'chat', 1, 4) then return _no('trop d''actions'); end if;
  t := left(btrim(regexp_replace(regexp_replace(coalesce(msg, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 140);
  if t = '' then return _no('message vide'); end if;
  t := _masquer(t);
  c := case when p.color ~ '^#[0-9a-fA-F]{6}$' then p.color else '#cccccc' end;
  insert into chat (world, user_id, name, color, text) values (w, me, coalesce(p.name, 'anonyme'), c, t);
  if random() < 0.02 then delete from chat where at < now() - interval '2 days'; end if;
  return jsonb_build_object('ok', true, 'text', t);
end $g$;
    $f$;
  end if;
end $$;

-- ---------- 7. droits ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;
revoke all on function public.pseudo_pris(text, text, uuid, uuid) from public, anon;
grant execute on function public.pseudo_pris(text, text, uuid, uuid) to authenticated;
