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
