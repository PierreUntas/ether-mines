-- 001 : schéma complet de Mines d'Éther (monde partagé, comptes, parties).
-- Prérequis : Authentication → Sign In / Providers → « Allow anonymous sign-ins » activé.
-- Migrations suivantes : uniquement additives (nouvelles tables, nouvelles colonnes avec valeur par défaut).

create extension if not exists pgcrypto with schema extensions;

-- 1. Terrain d'origine figé, par tronçon de 16 × 16 colonnes -------------------------------------
-- Écrit une seule fois, au premier bloc modifié dans le tronçon : il ne dépend plus jamais du générateur.
create table if not exists public.chunks (
  world      text        not null,
  cx         integer     not null,
  cz         integer     not null,
  gen        integer     not null,   -- version du générateur qui a produit ce terrain
  sy         integer     not null,   -- hauteur du monde à ce moment
  data       text        not null,   -- blocs encodés (RLE puis base64)
  created_at timestamptz not null default now(),
  primary key (world, cx, cz)
);
alter table public.chunks enable row level security;
drop policy if exists "lire les tronçons" on public.chunks;
create policy "lire les tronçons" on public.chunks for select using (true);
drop policy if exists "figer un tronçon" on public.chunks;
create policy "figer un tronçon" on public.chunks for insert to authenticated with check (
  char_length(world) between 1 and 32 and sy between 1 and 256 and char_length(data) <= 60000
);
-- Aucune règle update ou delete : un tronçon figé ne change plus.

-- 2. Blocs modifiés par les joueurs ----------------------------------------------------------------
create table if not exists public.blocks (
  world        text        not null,
  x            integer     not null,
  y            integer     not null,
  z            integer     not null,
  id           smallint    not null,
  placed_by    text,       -- compte de l'auteur (auth.uid), null pour un bloc miné
  placed_name  text,
  serial       integer,
  updated_at   timestamptz not null default now(),
  primary key (world, x, y, z)
);
create index if not exists blocks_zone on public.blocks (world, x, z);
alter table public.blocks enable row level security;
drop policy if exists "lire les blocs" on public.blocks;
create policy "lire les blocs" on public.blocks for select using (true);
drop policy if exists "poser un bloc" on public.blocks;
create policy "poser un bloc" on public.blocks for insert to authenticated with check (
  char_length(world) between 1 and 32
  and x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
  and id between 0 and 255
  and (placed_name is null or char_length(placed_name) <= 16)
  and (placed_by is null or placed_by = auth.uid()::text)
);
drop policy if exists "modifier un bloc" on public.blocks;
create policy "modifier un bloc" on public.blocks for update to authenticated using (true) with check (
  x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
  and id between 0 and 255
  and (placed_name is null or char_length(placed_name) <= 16)
  and (placed_by is null or placed_by = auth.uid()::text)
);

-- 3. La partie de chaque joueur, par monde ----------------------------------------------------------
create table if not exists public.players (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world      text        not null,
  name       text,
  color      text,
  state      jsonb       not null default '{}'::jsonb,  -- coffre, objets uniques, objectifs, position
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

-- 4. Codes de sauvegarde : retrouver sa partie sur un autre appareil (seule l'empreinte est gardée) ----
create table if not exists public.recovery (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  code_hash  text        not null unique,
  created_at timestamptz not null default now()
);
alter table public.recovery enable row level security; -- aucune règle : accès par les fonctions ci-dessous

-- Crée (ou remplace) le code du joueur connecté et le renvoie, une seule fois.
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

-- Rattache au joueur connecté les parties et les blocs du compte qui possède ce code.
create or replace function public.claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare old uuid; me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'non connecté'; end if;
  select user_id into old from public.recovery where code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex');
  if old is null then raise exception 'code inconnu'; end if;
  if old = me then return 0; end if;
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  delete from public.recovery where user_id = me;
  update public.recovery set user_id = me where user_id = old;
  return n;
end $$;

revoke all on function public.set_recovery_code() from public, anon;
revoke all on function public.claim_recovery(text) from public, anon;
grant execute on function public.set_recovery_code() to authenticated;
grant execute on function public.claim_recovery(text) to authenticated;
