-- INSTALLATION COMPLÈTE de la base de Mines d'Éther. FICHIER GÉNÉRÉ par tools/installation.mjs : ne pas modifier à la main.
-- Contient : 001_schema.sql, 002_securite.sql, 003_moderation.sql, 005_coffres.sql, 006_renumerotation.sql, 007_economie.sql, 008_durcissement.sql, 009_zones.sql, 010_reseau.sql, puis regles.sql.
-- À lancer en une fois dans Supabase (SQL Editor). Se relance sans risque. Pour repartir de zéro : reset.sql d'abord.

-- ════════════════ 001_schema.sql ════════════════
-- 001 : schéma complet de Mines d'Éther.
-- Le serveur fait autorité : les joueurs ne peuvent rien écrire directement dans le monde ni dans leur coffre.
-- Chaque action (miner, poser, fabriquer…) passe par une fonction act_* qui vérifie les règles puis applique.
-- Prérequis : Authentication → Sign In / Providers → « Allow anonymous sign-ins » activé.
-- Ensuite : lancer supabase/regles.sql (règles du jeu générées depuis le code) et déployer la fonction « figer ».
-- Migrations suivantes : uniquement additives.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================================
-- 1. Le monde
-- =========================================================================================

-- Terrain d'origine figé, par tronçon de 16 × 16 colonnes. Écrit uniquement par la fonction « figer »,
-- qui le génère côté serveur avec le même générateur que le jeu : un joueur ne peut pas inventer du terrain.
create table if not exists public.chunks (
  world      text        not null,
  cx         integer     not null,
  cz         integer     not null,
  gen        integer     not null,   -- version du générateur
  sy         integer     not null,   -- hauteur du monde (64)
  data       text        not null,   -- blocs encodés par plages (longueur, bloc) puis base64
  created_at timestamptz not null default now(),
  primary key (world, cx, cz)
);
alter table public.chunks enable row level security;
drop policy if exists "lire les tronçons" on public.chunks;
create policy "lire les tronçons" on public.chunks for select using (true);

-- Blocs modifiés. Écrits uniquement par les fonctions act_*.
create table if not exists public.blocks (
  world        text        not null,
  x            integer     not null,
  y            integer     not null,
  z            integer     not null,
  id           smallint    not null,
  placed_by    text,       -- compte de l'auteur, null pour un bloc miné
  placed_name  text,
  serial       integer,
  updated_at   timestamptz not null default now(),
  primary key (world, x, y, z)
);
create index if not exists blocks_zone on public.blocks (world, x, z);
create index if not exists blocks_auteur on public.blocks (world, placed_by) where placed_by is not null;
alter table public.blocks enable row level security;
drop policy if exists "lire les blocs" on public.blocks;
create policy "lire les blocs" on public.blocks for select using (true);

-- Parcelles : un tronçon revendiqué ne se modifie que par son propriétaire et ses invités.
create table if not exists public.claims (
  world       text        not null,
  cx          integer     not null,
  cz          integer     not null,
  owner       uuid        not null references auth.users (id) on delete cascade,
  owner_name  text,
  members     uuid[]      not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (world, cx, cz)
);
create index if not exists claims_owner on public.claims (world, owner);
alter table public.claims enable row level security;
drop policy if exists "lire les parcelles" on public.claims;
create policy "lire les parcelles" on public.claims for select using (true);

-- =========================================================================================
-- 2. Les joueurs
-- =========================================================================================

-- Partie de chaque joueur, par monde. Le client ne peut écrire que ses préférences (state : barre, position,
-- objectifs vus, registre) ; les compteurs d'arbitrage sont réservés au serveur.
create table if not exists public.players (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world      text        not null,
  name       text,
  color      text,
  state      jsonb       not null default '{}'::jsonb,
  serial     integer     not null default 0,      -- numéro du dernier bloc posé
  mine_at    timestamptz,                         -- dernier bloc miné (vitesse de minage)
  rewards_at timestamptz,                         -- dernière récompense de validateur
  gifts      jsonb       not null default '{}'::jsonb, -- cadeaux d'animaux du jour
  updated_at timestamptz not null default now(),
  primary key (user_id, world)
);
alter table public.players enable row level security;
drop policy if exists "lire sa partie" on public.players;
create policy "lire sa partie" on public.players for select to authenticated using (auth.uid() = user_id);
drop policy if exists "créer sa partie" on public.players;
create policy "créer sa partie" on public.players for insert to authenticated
  with check (auth.uid() = user_id and char_length(world) between 1 and 32 and pg_column_size(state) < 300000);
drop policy if exists "sauver sa partie" on public.players;
create policy "sauver sa partie" on public.players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id and pg_column_size(state) < 300000);
drop policy if exists "effacer sa partie" on public.players;
create policy "effacer sa partie" on public.players for delete to authenticated using (auth.uid() = user_id);
revoke insert, update on public.players from anon, authenticated;
grant insert (user_id, world, name, color, state, updated_at) on public.players to authenticated;
grant update (user_id, world, name, color, state, updated_at) on public.players to authenticated; -- user_id et world : nécessaires à l'upsert, bornés par la règle « sauver sa partie »

-- Coffre : quantités par objet. Lecture seule pour le joueur.
create table if not exists public.inventory (
  user_id  uuid     not null references auth.users (id) on delete cascade,
  world    text     not null,
  item     smallint not null,
  n        integer  not null check (n >= 0),
  primary key (user_id, world, item)
);
alter table public.inventory enable row level security;
drop policy if exists "lire son coffre" on public.inventory;
create policy "lire son coffre" on public.inventory for select to authenticated using (auth.uid() = user_id);

-- Objets uniques (futurs NFT) : numérotés par joueur, avec leur histoire.
create table if not exists public.uniques (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world      text        not null,
  serial     integer     not null,
  item       smallint    not null,
  place      text,
  mined      integer     not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, world, serial)
);
alter table public.uniques enable row level security;
drop policy if exists "lire ses objets uniques" on public.uniques;
create policy "lire ses objets uniques" on public.uniques for select to authenticated using (auth.uid() = user_id);

-- Codes de sauvegarde (seule l'empreinte est gardée).
create table if not exists public.recovery (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  code_hash  text        not null unique,
  created_at timestamptz not null default now()
);
alter table public.recovery enable row level security;

-- =========================================================================================
-- 3. Les règles (remplies par supabase/regles.sql, généré depuis le code du jeu)
-- =========================================================================================
create table if not exists public.rule_blocks (
  id        smallint primary key,
  name      text,
  hard      real,       -- secondes à la main ; null = incassable
  tier      smallint not null default 0,  -- palier d'outil requis
  drop_item smallint,   -- ce qu'il donne (null = rien)
  kind      text not null,               -- cube, cross, water, slab, stairs, door, lever, plate, cable
  solid     boolean not null,
  top       boolean not null default false
);
create table if not exists public.rule_place (item smallint not null, block smallint not null, primary key (item, block));
create table if not exists public.rule_items (id smallint primary key, name text, tool real not null default 1, tier smallint not null default 0, uniq boolean not null default false);
create table if not exists public.rule_recipes (out_item smallint primary key, n integer not null, need jsonb not null, uniq boolean not null default false);
alter table public.rule_blocks enable row level security;
alter table public.rule_place enable row level security;
alter table public.rule_items enable row level security;
alter table public.rule_recipes enable row level security;

-- =========================================================================================
-- 4. Outils internes (non appelables par les joueurs)
-- =========================================================================================

-- Bloc actuel en (x, y, z) : modification connue, sinon terrain figé. Tronçon pas encore figé : erreur « figer ».
create or replace function public._cell(w text, px int, py int, pz int) returns smallint
language plpgsql stable security definer set search_path = public as $$
declare v smallint; c record; b bytea; idx int; acc int := 0; i int := 0; r int; n int;
begin
  if py < 0 or py >= 64 then return 0; end if;
  select id into v from blocks where world = w and x = px and y = py and z = pz;
  if found then return v; end if;
  select sy, data into c from chunks where world = w and cx = px >> 4 and cz = pz >> 4;
  if not found then raise exception 'figer:%,%', px >> 4, pz >> 4; end if;
  if py >= c.sy then return 0; end if;
  b := decode(c.data, 'base64'); idx := (px & 15) + (pz & 15) * 16 + py * 256; n := length(b);
  while i + 1 < n loop
    r := get_byte(b, i);
    if idx < acc + r then return get_byte(b, i + 1); end if;
    acc := acc + r; i := i + 2;
  end loop;
  return 0;
end $$;

create or replace function public._set(w text, px int, py int, pz int, bid int, who uuid, who_name text, ser int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into blocks (world, x, y, z, id, placed_by, placed_name, serial, updated_at)
    values (w, px, py, pz, bid, who::text, who_name, ser, now())
    on conflict (world, x, y, z) do update set id = excluded.id, placed_by = excluded.placed_by,
      placed_name = excluded.placed_name, serial = excluded.serial, updated_at = now();
  return jsonb_build_object('x', px, 'y', py, 'z', pz, 'id', bid, 'by', who, 'name', who_name, 'serial', ser);
end $$;

-- Change le bloc sans toucher à sa signature (portes, leviers).
create or replace function public._flip(w text, px int, py int, pz int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r blocks;
begin
  insert into blocks (world, x, y, z, id) values (w, px, py, pz, bid)
    on conflict (world, x, y, z) do update set id = excluded.id, updated_at = now() returning * into r;
  return jsonb_build_object('x', px, 'y', py, 'z', pz, 'id', bid, 'by', r.placed_by, 'name', r.placed_name, 'serial', r.serial);
end $$;

create or replace function public._player(me uuid, w text) returns public.players
language plpgsql security definer set search_path = public as $$
declare p players;
begin
  if me is null then raise exception 'non connecté'; end if;
  if char_length(w) not between 1 and 32 then raise exception 'monde invalide'; end if;
  insert into players (user_id, world) values (me, w) on conflict do nothing;
  select * into p from players where user_id = me and world = w for update;
  return p;
end $$;

create or replace function public._count(me uuid, w text, it int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select n from inventory where user_id = me and world = w and item = it), 0)
$$;

-- Ajoute (ou retire, si d < 0) des objets au coffre ; renvoie le coffre modifié dans inv.
create or replace function public._give(me uuid, w text, it int, d int, inv jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if d < 0 then
    update inventory set n = n + d where user_id = me and world = w and item = it returning n into v;
    if v is null or v < 0 then raise exception 'coffre insuffisant'; end if;
  else
    insert into inventory (user_id, world, item, n) values (me, w, it, d)
      on conflict (user_id, world, item) do update set n = inventory.n + d returning n into v;
  end if;
  return inv || jsonb_build_object(it::text, v);
end $$;

create or replace function public._mint(me uuid, w text, it int, where_ text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s int;
begin
  select coalesce(max(serial), 0) + 1 into s from uniques where user_id = me and world = w;
  insert into uniques (user_id, world, serial, item, place) values (me, w, s, it, where_);
  return jsonb_build_object('serial', s, 'id', it, 'place', where_, 'date', to_char(now(), 'DD/MM/YYYY'), 'mined', 0);
end $$;

-- Le sanctuaire est intouchable ; une parcelle ne se modifie que par son propriétaire et ses invités.
create or replace function public._can_build(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not (px between 4 and 12 and pz between 4 and 12)
     and not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                     and c.owner <> me and not (me = any (c.members)))
$$;

create or replace function public._no(msg text, extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'err', msg) || extra $$;

-- =========================================================================================
-- 5. Les actions des joueurs
-- =========================================================================================

-- Miner : outil suffisant, rythme plausible, butin tiré par le serveur.
drop function if exists public.act_mine(text, int, int, int, text);
create or replace function public.act_mine(w text, px int, py int, pz int, held text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; id0 int; rb rule_blocks; t_tier int := 0; t_mult real := 1; useri int;
  need real; ch jsonb := '[]'; inv jsonb := '{}'; oy int; other int; above int; ab rule_blocks; n int;
begin
  pl := _player(me, w);
  id0 := _cell(w, px, py, pz);
  select * into rb from rule_blocks where id = id0;
  if id0 = 0 or rb.id is null or rb.hard is null then return _no('rien à miner', jsonb_build_object('cell', id0)); end if;
  if not _can_build(me, w, px, pz) then return _no('protégé', jsonb_build_object('cell', id0)); end if;
  if held = '102' and _count(me, w, 102) > 0 then
    select tier, rule_items.tool into t_tier, t_mult from rule_items where id = 102;
  elsif held like 'nft%' then
    select u.serial, i.tier, i.tool into useri, t_tier, t_mult from uniques u join rule_items i on i.id = u.item
      where u.user_id = me and u.world = w and u.serial = nullif(substr(held, 4), '')::int;
    t_tier := coalesce(t_tier, 0); t_mult := coalesce(t_mult, 1);
  end if;
  if t_tier < rb.tier then return _no('outil', jsonb_build_object('cell', id0)); end if;
  need := rb.hard / t_mult;
  if pl.mine_at is not null and extract(epoch from clock_timestamp() - pl.mine_at) < need * 0.5 - 0.1 then
    return _no('trop vite', jsonb_build_object('cell', id0));
  end if;
  update players set mine_at = clock_timestamp() where user_id = me and world = w;
  ch := ch || _set(w, px, py, pz, 0, null, null, null);
  if rb.kind = 'door' then
    oy := case when rb.top then py - 1 else py + 1 end; other := _cell(w, px, oy, pz);
    if (select kind from rule_blocks where id = other) = 'door' then ch := ch || _set(w, px, oy, pz, 0, null, null, null); end if;
  end if;
  above := _cell(w, px, py + 1, pz); select * into ab from rule_blocks where id = above;
  if ab.kind = 'cross' then ch := ch || _set(w, px, py + 1, pz, 0, null, null, null);
  elsif ab.kind in ('plate', 'cable', 'lever') then
    ch := ch || _set(w, px, py + 1, pz, 0, null, null, null);
    if ab.drop_item is not null then inv := _give(me, w, ab.drop_item, 1, inv); end if;
  end if;
  n := case rb.drop_item when 101 then 1 + (random() < 0.4)::int when 104 then (random() < 0.4)::int else 1 end;
  if rb.drop_item is not null and n > 0 then inv := _give(me, w, rb.drop_item, n, inv); end if;
  if useri is not null then update uniques set mined = mined + 1 where user_id = me and world = w and serial = useri; end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'got', jsonb_build_object('item', rb.drop_item, 'n', n));
end $$;

-- Poser : l'objet est dans le coffre, la case est libre, le support convient.
create or replace function public.act_place(w text, px int, py int, pz int, it int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; cr rule_blocks; rb rule_blocks; below int; up int; ch jsonb := '[]'; inv jsonb := '{}'; s int;
begin
  pl := _player(me, w);
  if py < 1 or py >= 64 or abs(px) >= 100000 or abs(pz) >= 100000 then return _no('hors du monde'); end if;
  if not exists (select 1 from rule_place where item = it and block = bid) then return _no('objet non posable'); end if;
  if _count(me, w, it) < 1 then return _no('coffre vide', jsonb_build_object('inv', jsonb_build_object(it::text, 0))); end if;
  if not _can_build(me, w, px, pz) then return _no('protégé'); end if;
  cur := _cell(w, px, py, pz); select * into cr from rule_blocks where id = cur;
  if cur <> 0 and cr.kind not in ('water', 'cross') then return _no('case occupée', jsonb_build_object('cell', cur)); end if;
  select * into rb from rule_blocks where id = bid;
  below := _cell(w, px, py - 1, pz);
  if rb.kind = 'cross' and below not in (1, 2) then return _no('support'); end if;
  if rb.kind in ('plate', 'cable', 'lever') and not coalesce((select solid from rule_blocks where id = below), false) then return _no('support'); end if;
  if rb.kind = 'door' then
    if py + 1 >= 64 then return _no('hors du monde'); end if;
    up := _cell(w, px, py + 1, pz);
    if up <> 0 and (select kind from rule_blocks where id = up) not in ('water', 'cross') then return _no('case occupée'); end if;
  end if;
  inv := _give(me, w, it, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, bid, me, pl.name, s);
  if rb.kind = 'door' then ch := ch || _set(w, px, py + 1, pz, bid + 1, me, pl.name, s); end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'serial', s);
end $$;

-- Ouvrir une porte, basculer un levier.
create or replace function public.act_toggle(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cur int; rb rule_blocks; ch jsonb := '[]'; oy int; other int;
begin
  perform _player(me, w);
  cur := _cell(w, px, py, pz); select * into rb from rule_blocks where id = cur;
  if rb.kind not in ('door', 'lever') then return _no('rien à actionner', jsonb_build_object('cell', cur)); end if;
  if not _can_build(me, w, px, pz) then return _no('protégé'); end if;
  if rb.kind = 'lever' then return jsonb_build_object('ok', true, 'changes', ch || _flip(w, px, py, pz, case cur when 64 then 65 else 64 end)); end if;
  ch := ch || _flip(w, px, py, pz, cur # 2);
  oy := case when rb.top then py - 1 else py + 1 end; other := _cell(w, px, oy, pz);
  if (select kind from rule_blocks where id = other) = 'door' then ch := ch || _flip(w, px, oy, pz, other # 2); end if;
  return jsonb_build_object('ok', true, 'changes', ch);
end $$;

-- Fabriquer selon une recette connue du serveur.
create or replace function public.act_craft(w text, out_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r rule_recipes; k text; v jsonb; inv jsonb := '{}'; u jsonb;
begin
  perform _player(me, w);
  select * into r from rule_recipes where out_item = out_id;
  if not found then return _no('recette inconnue'); end if;
  for k, v in select * from jsonb_each(r.need) loop
    if _count(me, w, k::int) < v::int then return _no('ingrédients', jsonb_build_object('item', k::int)); end if;
  end loop;
  for k, v in select * from jsonb_each(r.need) loop inv := _give(me, w, k::int, -(v::int), inv); end loop;
  if r.uniq then u := _mint(me, w, out_id, null); return jsonb_build_object('ok', true, 'inv', inv, 'unique', u); end if;
  inv := _give(me, w, out_id, r.n, inv);
  return jsonb_build_object('ok', true, 'inv', inv);
end $$;

-- Rallumer un validateur ancien avec un cœur de validateur (permis même dans une parcelle).
create or replace function public.act_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb;
begin
  pl := _player(me, w);
  if _cell(w, px, py, pz) <> 73 then return _no('pas un validateur éteint', jsonb_build_object('cell', _cell(w, px, py, pz))); end if;
  if _count(me, w, 105) < 1 then return _no('il faut un cœur de validateur'); end if;
  inv := _give(me, w, 105, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, 74, me, pl.name, s);
  u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'serial', s);
end $$;

-- Cadeau d'un animal caressé : une fois par jour et par animal, quinze par jour au plus.
create or replace function public.act_gift(w text, animal text, kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; today text := to_char(now(), 'YYYY-MM-DD'); g jsonb; it int; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if char_length(animal) > 40 then return _no('animal inconnu'); end if;
  g := coalesce((select jsonb_object_agg(k, v) from jsonb_each(pl.gifts) e(k, v) where v #>> '{}' = today), '{}');
  if g ? animal then return _no('déjà offert aujourd''hui'); end if;
  if (select count(*) from jsonb_object_keys(g)) >= 15 then return _no('assez de cadeaux pour aujourd''hui'); end if;
  it := case kind when 'mouton' then 71 when 'renard' then 17 + floor(random() * 3)::int when 'meduse' then 103 else null end;
  if it is null then return _no('animal sans cadeau'); end if;
  update players set gifts = g || jsonb_build_object(animal, today) where user_id = me and world = w;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;

-- Récompenses des validateurs signés par le joueur : 1 cristal par slot de 12 s (3 pour un validateur ancien),
-- au plus 30 minutes rattrapées d'un coup.
create or replace function public.act_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; weight int; slots int; inv jsonb := '{}';
begin
  pl := _player(me, w);
  select coalesce(sum(case id when 74 then 3 else 1 end), 0) into weight from blocks
    where world = w and placed_by = me::text and id in (13, 74);
  if pl.rewards_at is null or weight = 0 then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', weight);
  end if;
  slots := floor(extract(epoch from now() - pl.rewards_at) / 12)::int;
  if slots < 1 then return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', weight); end if;
  update players set rewards_at = case when slots > 150 then now() else rewards_at + make_interval(secs => slots * 12) end
    where user_id = me and world = w;
  inv := _give(me, w, 101, least(slots, 150) * weight, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'slots', least(slots, 150), 'weight', weight);
end $$;

-- Parcelles : 2 cristaux par tronçon, 16 au plus par joueur, jamais le tronçon du sanctuaire.
create or replace function public.act_claim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if qx = 0 and qz = 0 then return _no('le sanctuaire appartient à tout le monde'); end if;
  if abs(qx) > 6250 or abs(qz) > 6250 then return _no('hors du monde'); end if;
  if exists (select 1 from claims where world = w and cx = qx and cz = qz) then return _no('déjà revendiqué'); end if;
  if (select count(*) from claims where world = w and owner = me) >= 16 then return _no('16 parcelles au plus'); end if;
  if _count(me, w, 101) < 2 then return _no('il faut 2 cristaux d''éther'); end if;
  inv := _give(me, w, 101, -2, inv);
  insert into claims (world, cx, cz, owner, owner_name, members)
    select w, qx, qz, me, pl.name, coalesce((select members from claims where world = w and owner = me limit 1), '{}');
  return jsonb_build_object('ok', true, 'inv', inv);
end $$;

create or replace function public.act_unclaim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from claims where world = w and cx = qx and cz = qz and owner = auth.uid();
  if not found then return _no('ce n''est pas ta parcelle'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Inviter (ou exclure) un joueur, par son pseudo, sur toutes ses parcelles du monde.
create or replace function public.act_member(w text, pseudo text, invite boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); who uuid; wname text;
begin
  select user_id, name into who, wname from players where world = w and lower(name) = lower(trim(pseudo)) and user_id <> me
    order by updated_at desc limit 1;
  if who is null then return _no('joueur inconnu dans ce monde'); end if;
  if invite then update claims set members = array_append(array_remove(members, who), who) where world = w and owner = me;
  else update claims set members = array_remove(members, who) where world = w and owner = me; end if;
  return jsonb_build_object('ok', true, 'name', wname);
end $$;

-- =========================================================================================
-- 6. Codes de sauvegarde
-- =========================================================================================
create or replace function public.set_recovery_code() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare raw text; code text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  raw := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  code := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4) || '-' || substr(raw, 13, 4);
  insert into public.recovery (user_id, code_hash) values (auth.uid(), encode(extensions.digest(code, 'sha256'), 'hex'))
    on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
  return code;
end $$;

-- Rattache au joueur connecté tout ce que possède le compte de ce code : parties, coffres, objets uniques, blocs, parcelles.
create or replace function public.claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare old uuid; me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'non connecté'; end if;
  select user_id into old from public.recovery where code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex');
  if old is null then raise exception 'code inconnu'; end if;
  if old = me then return 0; end if;
  -- le compte de cet appareil laisse la place à celui du code, monde par monde
  delete from public.inventory i where i.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = i.world);
  delete from public.uniques u where u.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = u.world);
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.inventory set user_id = me where user_id = old;
  update public.uniques set user_id = me where user_id = old;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  update public.claims set owner = me where owner = old;
  update public.claims set members = array_replace(members, old, me) where old = any (members);
  delete from public.recovery where user_id = me;
  update public.recovery set user_id = me where user_id = old;
  return n;
end $$;

-- =========================================================================================
-- 7. Droits et diffusion en direct
-- =========================================================================================
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_' or p.proname in ('set_recovery_code', 'claim_recovery')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.blocks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.claims; exception when duplicate_object then null; end;
end $$;

-- ════════════════ 002_securite.sql ════════════════
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

-- ════════════════ 003_moderation.sql ════════════════
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

-- ════════════════ 005_coffres.sql ════════════════
-- 005 : malles (coffres posables). Le contenu de chaque malle est gardé par le serveur.
--   act_chest lit un coffre ; act_chest_move y dépose (n > 0) ou en retire (n < 0) des objets de son sac.
--   Ouvrir un coffre : être à portée de main, et pouvoir construire à cet endroit (dans une parcelle :
--   seulement le propriétaire et ses invités ; ailleurs, tout le monde).
--   Un coffre cassé rend son contenu à celui qui le casse.
-- Rejouable sans erreur. Nécessite 002_securite.sql. Le bloc coffre (98) vient de regles.sql.

create table if not exists public.chests (
  world text  not null,
  x     int   not null,
  y     int   not null,
  z     int   not null,
  items jsonb not null default '{}'::jsonb,   -- { "objet": nombre }
  primary key (world, x, y, z)
);
alter table public.chests enable row level security; -- aucune règle : réservé aux fonctions

create or replace function public._chest_ok(me uuid, w text, px int, py int, pz int, ex real, ey real, ez real) returns text
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  if not _rate(me, 'chest', 6, 12) then return 'trop d''actions'; end if;
  e := _check_pos(me, w, ex, ey, ez, px, py, pz);
  if e is not null then return e; end if;
  if _cell(w, px, py, pz) <> 98 then return 'pas de malle ici'; end if;
  if not _can_build(me, w, px, pz) then return 'protégé'; end if;
  return null;
end $$;

create or replace function public.act_chest(w text, px int, py int, pz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
begin
  if e is not null then return _no(e); end if;
  return jsonb_build_object('ok', true, 'items',
    coalesce((select items from chests where world = w and x = px and y = py and z = pz), '{}'::jsonb));
end $$;

create or replace function public.act_chest_move(w text, px int, py int, pz int, item int, n int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text := _chest_ok(me, w, px, py, pz, ex, ey, ez);
        cur jsonb; have int; inv jsonb := '{}'::jsonb;
begin
  if e is not null then return _no(e); end if;
  if n = 0 or abs(n) > 10000 then return _no('quantité invalide'); end if;
  insert into chests (world, x, y, z) values (w, px, py, pz) on conflict do nothing;
  select items into cur from chests where world = w and x = px and y = py and z = pz for update;
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

-- Coffre cassé ou remplacé : son contenu va dans le sac de celui qui l'a cassé.
create or replace function public._chest_broken() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chests; k text; v text; inv jsonb := '{}'::jsonb;
begin
  if new.id = 98 then return new; end if;
  select * into c from chests where world = new.world and x = new.x and y = new.y and z = new.z;
  if c.world is null then return new; end if;
  if auth.uid() is not null then
    for k, v in select * from jsonb_each_text(c.items) loop
      inv := _give(auth.uid(), new.world, k::int, v::int, inv);
    end loop;
  end if;
  delete from chests where world = new.world and x = new.x and y = new.y and z = new.z;
  return new;
end $$;
drop trigger if exists chest_broken on public.blocks;
create trigger chest_broken after insert or update of id on public.blocks
  for each row execute function public._chest_broken();

-- droits : seules les act_* sont appelables par les joueurs
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- ════════════════ 006_renumerotation.sql ════════════════
-- 006 : portes logiques renumérotées (99–110 → 112–123).
-- Elles avaient d'abord reçu les numéros 99 à 110, alors que 101 à 105 sont des objets (cristal d'éther, pioche en bois,
-- éclat pur, fragment de genèse, cœur de validateur). Cette migration convertit ce qui existe déjà.
-- Rejouable sans erreur (une deuxième passe ne trouve plus rien à convertir). Relancer regles.sql ensuite.

-- portes posées dans le monde
update public.blocks set id = id + 13 where id between 99 and 110;

-- portes dans les sacs : ET (99) → 112, NON (107) → 120.
-- La porte OU portait le numéro de l'éclat pur (103) : impossible à distinguer, elle reste un éclat.
insert into public.inventory (user_id, world, item, n)
  select user_id, world, item + 13, n from public.inventory where item in (99, 107)
  on conflict (user_id, world, item) do update set n = public.inventory.n + excluded.n;
delete from public.inventory where item in (99, 107);

-- portes rangées dans des malles (si 005_coffres.sql a été lancé)
do $$ begin
  if to_regclass('public.chests') is not null then
    update public.chests c set items = (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
        select case e.key when '99' then '112' when '107' then '120' else e.key end as k, sum(e.value::int) as v
        from jsonb_each_text(c.items) e group by 1) t)
    where items ? '99' or items ? '107';
  end if;
end $$;

-- ════════════════ 007_economie.sql ════════════════
-- 007 : récompenses des validateurs rééquilibrées.
-- Avant : 1 cristal par slot de 12 s par validateur posé (300 par heure) et 3 par validateur ancien rallumé (900 par heure),
-- sans limite de nombre : un validateur (8 cristaux) se remboursait en deux minutes et la production s'emballait.
-- Maintenant, en « parts » par slot de 12 s, 25 parts = 1 cristal :
--   validateur posé : 1 part (1 cristal toutes les 5 minutes), 5 validateurs posés comptent au plus ;
--   validateur ancien rallumé : 5 parts (1 cristal par minute).
-- Les parts non converties ne sont pas perdues (le temps restant est reporté). 30 minutes rattrapées au plus.
-- Rejouable sans erreur. Nécessite 002_securite.sql (act_rewards y appelle _core_rewards).

create or replace function public._core_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; poses int; anciens int; parts int; slots int; gain int; pris int;
        depart timestamptz; inv jsonb := '{}';
begin
  pl := _player(me, w);
  select count(*) filter (where id = 13), count(*) filter (where id = 74) into poses, anciens
    from blocks where world = w and placed_by = me::text and id in (13, 74);
  parts := least(poses, 5) + 5 * anciens;
  if pl.rewards_at is null or parts = 0 then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', parts, 'n', 0);
  end if;
  depart := greatest(pl.rewards_at, now() - interval '30 minutes');      -- rattrapage limité
  slots := floor(extract(epoch from now() - depart) / 12)::int;
  gain := floor(slots * parts / 25.0)::int;
  if gain < 1 then
    if depart <> pl.rewards_at then update players set rewards_at = depart where user_id = me and world = w; end if;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', parts, 'n', 0);
  end if;
  pris := ceil(gain * 25.0 / parts)::int;                                -- slots consommés ; le reste attend
  update players set rewards_at = depart + make_interval(secs => pris * 12) where user_id = me and world = w;
  inv := _give(me, w, 101, gain, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'slots', pris, 'weight', parts, 'n', gain);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and left(p.proname, 1) = '_' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- ════════════════ 008_durcissement.sql ════════════════
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

-- ════════════════ 009_zones.sql ════════════════
-- 009 : zones publiques protégées. Personne ne peut y miner, poser ni revendiquer :
--   l'Atrium (rayon 7,9 autour du validateur du sanctuaire, en 8, 8) ;
--   la Cité (rayon 30,5 autour de 8, −56).
-- Mêmes mesures que le générateur (supabase/functions/_shared/world.js : SPAWN, CITE) et que le jeu (06-actions.js).
-- Rejouable sans erreur. Nécessite 001 et 002.

create or replace function public._zone_publique(px int, pz int) returns boolean
language sql immutable as $$
  select sqrt((px - 8) ^ 2 + (pz - 8) ^ 2) <= 7.9 or sqrt((px - 8) ^ 2 + (pz + 56) ^ 2) <= 30.5
$$;

create or replace function public._can_build(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not _zone_publique(px, pz)
     and not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                     and c.owner <> me and not (me = any (c.members)))
$$;

-- pas de parcelle sur un tronçon qui touche une zone publique
create or replace function public.act_claim(w text, qx int, qz int, ex real, ey real, ez real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); e text;
begin
  if not _rate(me, 'claim', 0.5, 3) then return _no('trop d''actions'); end if;
  e := _check_pos(me, w, ex, ey, ez);
  if e is not null then return _no(e); end if;
  if floor(ex)::int >> 4 <> qx or floor(ez)::int >> 4 <> qz then return _no('il faut se trouver dans la parcelle'); end if;
  if exists (select 1 from generate_series(0, 15) a, generate_series(0, 15) b where _zone_publique(qx * 16 + a, qz * 16 + b)) then
    return _no('ce lieu appartient à tout le monde');
  end if;
  return _core_claim(w, qx, qz);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;

-- ════════════════ 010_reseau.sql ════════════════
-- 010 : le réseau, objectif commun du monde.
--   act_reseau compte les validateurs anciens rallumés (bloc 74) par tous les joueurs, et nomme les cinq
--   joueurs qui en ont rallumé le plus. Le jeu l'affiche dans les objectifs et fait réagir le grand diamant.
-- Rejouable sans erreur. Nécessite 001 et 002 (_rate, _me_or_fail).

create index if not exists blocks_reseau on public.blocks (world, placed_by) where id = 74;

create or replace function public.act_reseau(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); total int; top jsonb;
begin
  if not _rate(me, 'reseau', 0.2, 5) then return _no('trop d''actions'); end if;
  select count(*) into total from blocks where world = w and id = 74;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.c) order by t.c desc, t.name), '[]'::jsonb) into top
    from (select coalesce(max(placed_name), 'anonyme') as name, count(*) as c from blocks
           where world = w and id = 74 group by placed_by order by count(*) desc limit 5) t;
  return jsonb_build_object('ok', true, 'n', total, 'top', top);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;

-- ════════════════ regles.sql ════════════════
-- Règles du jeu pour l'arbitrage côté serveur. FICHIER GÉNÉRÉ par tools/regles.mjs : ne pas modifier à la main.
-- À relancer dans Supabase (SQL Editor) après chaque changement de supabase/functions/_shared/rules.js.
begin;
delete from public.rule_blocks; delete from public.rule_place; delete from public.rule_items; delete from public.rule_recipes;
insert into public.rule_blocks (id, name, hard, tier, drop_item, kind, solid, top) values
(1,'Herbe',0.6,0,2,'cube',true,false),
(2,'Terre',0.6,0,2,'cube',true,false),
(3,'Granite',2,1,3,'cube',true,false),
(4,'Sable',0.5,0,4,'cube',true,false),
(5,'Bois',1.4,0,5,'cube',true,false),
(6,'Feuilles',0.25,0,null,'cube',true,false),
(7,'Feuilles roses',0.25,0,null,'cube',true,false),
(8,'Minerai d''éther',2.6,1,101,'cube',true,false),
(9,'Planches',1.1,0,9,'cube',true,false),
(10,'Verre',0.5,0,10,'cube',true,false),
(11,'Eau',null,0,11,'water',false,false),
(12,'Socle',null,0,12,'cube',true,false),
(13,'Validateur',2.5,1,13,'cube',true,false),
(14,'Lanterne',0.5,0,14,'cube',true,false),
(15,'Marbre',2.2,1,15,'cube',true,false),
(16,'Neige',0.5,0,16,'cube',true,false),
(17,'Fleur rose',0.05,0,17,'cross',false,false),
(18,'Fleur dorée',0.05,0,18,'cross',false,false),
(19,'Fleur bleue',0.05,0,19,'cross',false,false),
(20,'Herbes hautes',0.05,0,null,'cross',false,false),
(21,'Béton rose',1.2,1,21,'cube',true,false),
(22,'Béton lavande',1.2,1,22,'cube',true,false),
(23,'Béton menthe',1.2,1,23,'cube',true,false),
(24,'Béton ciel',1.2,1,24,'cube',true,false),
(25,'Béton pêche',1.2,1,25,'cube',true,false),
(26,'Béton citron',1.2,1,26,'cube',true,false),
(27,'Béton corail',1.2,1,27,'cube',true,false),
(28,'Béton blanc',1.2,1,28,'cube',true,false),
(29,'Vitrail rose',0.5,0,29,'cube',true,false),
(30,'Vitrail ciel',0.5,0,30,'cube',true,false),
(31,'Vitrail menthe',0.5,0,31,'cube',true,false),
(32,'Vitrail lavande',0.5,0,32,'cube',true,false),
(33,'Dalle de planches',0.66,0,33,'slab',true,false),
(34,'Dalle de marbre',1.32,1,34,'slab',true,false),
(35,'Dalle de granite',1.2,1,35,'slab',true,false),
(36,'Escalier de planches',1.1,0,36,'stairs',true,false),
(37,'Escalier de planches',1.1,0,36,'stairs',true,false),
(38,'Escalier de planches',1.1,0,36,'stairs',true,false),
(39,'Escalier de planches',1.1,0,36,'stairs',true,false),
(40,'Escalier de marbre',2.2,1,40,'stairs',true,false),
(41,'Escalier de marbre',2.2,1,40,'stairs',true,false),
(42,'Escalier de marbre',2.2,1,40,'stairs',true,false),
(43,'Escalier de marbre',2.2,1,40,'stairs',true,false),
(44,'Escalier de granite',2,1,44,'stairs',true,false),
(45,'Escalier de granite',2,1,44,'stairs',true,false),
(46,'Escalier de granite',2,1,44,'stairs',true,false),
(47,'Escalier de granite',2,1,44,'stairs',true,false),
(48,'Porte',0.9,0,48,'door',true,false),
(49,'Porte',0.9,0,48,'door',true,true),
(50,'Porte',0.9,0,48,'door',true,false),
(51,'Porte',0.9,0,48,'door',true,true),
(52,'Porte',0.9,0,48,'door',true,false),
(53,'Porte',0.9,0,48,'door',true,true),
(54,'Porte',0.9,0,48,'door',true,false),
(55,'Porte',0.9,0,48,'door',true,true),
(56,'Porte',0.9,0,48,'door',true,false),
(57,'Porte',0.9,0,48,'door',true,true),
(58,'Porte',0.9,0,48,'door',true,false),
(59,'Porte',0.9,0,48,'door',true,true),
(60,'Porte',0.9,0,48,'door',true,false),
(61,'Porte',0.9,0,48,'door',true,true),
(62,'Porte',0.9,0,48,'door',true,false),
(63,'Porte',0.9,0,48,'door',true,true),
(64,'Levier',0.3,0,64,'lever',false,false),
(65,'Levier',0.3,0,64,'lever',false,false),
(66,'Plaque de pression',0.5,0,66,'plate',false,false),
(67,'Câble d''éther',0.1,0,67,'cable',false,false),
(68,'Lampe',0.5,0,68,'cube',true,false),
(69,'Géode',3,2,103,'cube',true,false),
(70,'Bloc d''éther pur',2.4,2,70,'cube',true,false),
(71,'Laine d''éther',0.5,0,71,'cube',true,false),
(72,'Roche de genèse',5,3,104,'cube',true,false),
(73,'Validateur éteint',null,0,73,'cube',true,false),
(74,'Validateur ancien',null,0,74,'cube',true,false),
(75,'Champignon d''éther',0.05,0,75,'cross',false,false),
(76,'Roseaux',0.05,0,76,'cross',false,false),
(77,'Nénuphar',0.05,0,77,'plate',false,false),
(78,'Pierre moussue',2,1,78,'cube',true,false),
(79,'Briques d''éther',2,1,79,'cube',true,false),
(80,'Granite poli',2,1,80,'cube',true,false),
(81,'Marbre en damier',2.2,1,81,'cube',true,false),
(82,'Bibliothèque',1.1,0,82,'cube',true,false),
(83,'Bloc de cristal',1.5,0,83,'cube',true,false),
(84,'Lanterne rose',0.5,0,84,'cube',true,false),
(85,'Lanterne champignon',0.5,0,85,'cube',true,false),
(86,'Natte de roseaux',0.6,0,86,'cube',true,false),
(87,'Dalle de briques',1.2,1,87,'slab',true,false),
(88,'Escalier de briques',2,1,88,'stairs',true,false),
(89,'Escalier de briques',2,1,88,'stairs',true,false),
(90,'Escalier de briques',2,1,88,'stairs',true,false),
(91,'Escalier de briques',2,1,88,'stairs',true,false),
(92,'Barrière',1.1,0,92,'fence',true,false),
(93,'Vitre',0.3,0,93,'pane',true,false),
(94,'Échelle',0.5,0,94,'ladder',false,false),
(95,'Échelle',0.5,0,94,'ladder',false,false),
(96,'Échelle',0.5,0,94,'ladder',false,false),
(97,'Échelle',0.5,0,94,'ladder',false,false),
(98,'Malle',1.2,0,98,'cube',true,false),
(111,'Horloge',0.8,0,111,'cube',true,false),
(112,'Porte ET',0.8,0,112,'cube',true,false),
(113,'Porte ET',0.8,0,112,'cube',true,false),
(114,'Porte ET',0.8,0,112,'cube',true,false),
(115,'Porte ET',0.8,0,112,'cube',true,false),
(116,'Porte OU',0.8,0,116,'cube',true,false),
(117,'Porte OU',0.8,0,116,'cube',true,false),
(118,'Porte OU',0.8,0,116,'cube',true,false),
(119,'Porte OU',0.8,0,116,'cube',true,false),
(120,'Porte NON',0.8,0,120,'cube',true,false),
(121,'Porte NON',0.8,0,120,'cube',true,false),
(122,'Porte NON',0.8,0,120,'cube',true,false),
(123,'Porte NON',0.8,0,120,'cube',true,false),
(124,'Tronc de palmier',1,0,5,'cube',true,false),
(125,'Palmes',0.25,0,null,'cube',true,false),
(126,'Amas d''améthyste',0.3,0,126,'cross',false,false),
(127,'Colonne de marbre',2.2,1,127,'cube',true,false),
(128,'Néon cyan',1.2,1,128,'cube',true,false),
(129,'Écran holographique',0.5,0,129,'cube',true,false),
(130,'Bloc diamant',1,0,130,'cube',true,false),
(131,'Brique de jeu lavande',1.2,0,131,'cube',true,false),
(132,'Brique de jeu menthe',1.2,0,132,'cube',true,false),
(133,'Brique de jeu bleue',1.2,0,133,'cube',true,false),
(134,'Brique de jeu pêche',1.2,0,134,'cube',true,false);
insert into public.rule_place (item, block) values
(2,2),
(3,3),
(4,4),
(5,5),
(9,9),
(10,10),
(13,13),
(14,14),
(15,15),
(16,16),
(17,17),
(18,18),
(19,19),
(21,21),
(22,22),
(23,23),
(24,24),
(25,25),
(26,26),
(27,27),
(28,28),
(29,29),
(30,30),
(31,31),
(32,32),
(33,33),
(34,34),
(35,35),
(36,36),
(36,37),
(36,38),
(36,39),
(40,40),
(40,41),
(40,42),
(40,43),
(44,44),
(44,45),
(44,46),
(44,47),
(48,48),
(48,52),
(48,56),
(48,60),
(64,64),
(66,66),
(67,67),
(68,68),
(70,70),
(71,71),
(75,75),
(76,76),
(77,77),
(78,78),
(79,79),
(80,80),
(81,81),
(82,82),
(83,83),
(84,84),
(85,85),
(86,86),
(87,87),
(88,88),
(88,89),
(88,90),
(88,91),
(92,92),
(93,93),
(94,94),
(94,95),
(94,96),
(94,97),
(98,98),
(111,111),
(112,112),
(112,113),
(112,114),
(112,115),
(116,116),
(116,117),
(116,118),
(116,119),
(120,120),
(120,121),
(120,122),
(120,123),
(126,126),
(127,127),
(128,128),
(129,129),
(130,130),
(131,131),
(132,132),
(133,133),
(134,134);
insert into public.rule_items (id, name, tool, tier, uniq) values
(101,'Cristal d''éther',1,0,false),
(102,'Pioche en bois',2.2,1,false),
(103,'Éclat pur',1,0,false),
(104,'Fragment de genèse',1,0,false),
(105,'Cœur de validateur',1,0,false),
(201,'Pioche de cristal',5,2,true),
(202,'Pioche d''éther pur',8,3,true),
(203,'Sceau de validateur',1,0,true);
insert into public.rule_recipes (out_item, n, need, uniq) values
(9,4,'{"5":1}'::jsonb,false),
(102,1,'{"9":3}'::jsonb,false),
(15,1,'{"3":2}'::jsonb,false),
(10,1,'{"4":2}'::jsonb,false),
(14,1,'{"10":1,"101":1}'::jsonb,false),
(201,1,'{"9":2,"101":3}'::jsonb,true),
(13,1,'{"15":4,"101":8}'::jsonb,false),
(70,1,'{"103":4}'::jsonb,false),
(202,1,'{"9":2,"101":4,"103":4}'::jsonb,true),
(105,1,'{"101":4,"103":2,"104":1}'::jsonb,false),
(33,4,'{"9":2}'::jsonb,false),
(36,4,'{"9":3}'::jsonb,false),
(34,4,'{"15":2}'::jsonb,false),
(40,4,'{"15":3}'::jsonb,false),
(35,4,'{"3":2}'::jsonb,false),
(44,4,'{"3":3}'::jsonb,false),
(48,1,'{"9":4}'::jsonb,false),
(92,3,'{"9":3}'::jsonb,false),
(93,8,'{"10":3}'::jsonb,false),
(94,3,'{"9":4}'::jsonb,false),
(98,1,'{"9":8}'::jsonb,false),
(21,4,'{"3":1,"4":2,"17":1}'::jsonb,false),
(22,4,'{"3":1,"4":2,"7":1}'::jsonb,false),
(23,4,'{"3":1,"4":2,"6":1}'::jsonb,false),
(24,4,'{"3":1,"4":2,"19":1}'::jsonb,false),
(25,4,'{"3":1,"4":3}'::jsonb,false),
(26,4,'{"3":1,"4":2,"18":1}'::jsonb,false),
(27,4,'{"3":1,"4":2,"17":1,"18":1}'::jsonb,false),
(28,4,'{"3":1,"4":2,"15":1}'::jsonb,false),
(29,2,'{"10":2,"17":1}'::jsonb,false),
(30,2,'{"10":2,"19":1}'::jsonb,false),
(31,2,'{"6":1,"10":2}'::jsonb,false),
(32,2,'{"7":1,"10":2}'::jsonb,false),
(64,1,'{"3":1,"9":1}'::jsonb,false),
(66,2,'{"15":2}'::jsonb,false),
(67,8,'{"101":1}'::jsonb,false),
(68,1,'{"10":1,"101":2}'::jsonb,false),
(112,1,'{"3":1,"67":2,"101":1}'::jsonb,false),
(116,1,'{"3":1,"67":2,"101":1}'::jsonb,false),
(120,1,'{"3":1,"67":1,"101":1}'::jsonb,false),
(111,1,'{"15":1,"67":2,"101":2}'::jsonb,false),
(79,4,'{"3":2,"4":1}'::jsonb,false),
(87,4,'{"79":2}'::jsonb,false),
(88,4,'{"79":3}'::jsonb,false),
(80,4,'{"3":4}'::jsonb,false),
(81,4,'{"3":2,"15":2}'::jsonb,false),
(78,2,'{"3":2,"76":1}'::jsonb,false),
(86,2,'{"76":4}'::jsonb,false),
(82,1,'{"9":6,"76":3}'::jsonb,false),
(83,1,'{"101":9}'::jsonb,false),
(84,1,'{"14":1,"17":1}'::jsonb,false),
(85,1,'{"10":1,"75":2}'::jsonb,false),
(127,2,'{"15":3}'::jsonb,false),
(128,4,'{"3":2,"10":1,"101":1}'::jsonb,false),
(129,2,'{"10":2,"101":1}'::jsonb,false),
(130,1,'{"10":1,"101":4}'::jsonb,false),
(131,4,'{"22":2}'::jsonb,false),
(132,4,'{"23":2}'::jsonb,false),
(133,4,'{"24":2}'::jsonb,false),
(134,4,'{"25":2}'::jsonb,false);
commit;

