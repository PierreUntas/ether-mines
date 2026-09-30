-- 002 : terrain figé par tronçon + coordonnées x, y, z.
-- Migration additive : aucune donnée supprimée, les blocs existants sont convertis.
-- À lancer une seule fois dans Supabase → SQL Editor, AVANT de publier la version du jeu qui l'utilise.

-- 1. Les blocs passent d'un numéro de case (lié à la taille du monde) à des coordonnées.
alter table public.blocks
  add column if not exists x integer,
  add column if not exists y integer,
  add column if not exists z integer;

update public.blocks
   set x = idx % 96,
       z = (idx / 96) % 96,
       y = idx / (96 * 96)
 where x is null and idx is not null;

alter table public.blocks drop constraint if exists blocks_pkey;
alter table public.blocks alter column idx drop not null;
alter table public.blocks alter column x set not null;
alter table public.blocks alter column y set not null;
alter table public.blocks alter column z set not null;
alter table public.blocks add constraint blocks_pkey primary key (world, x, y, z);

drop policy if exists "poser un bloc" on public.blocks;
create policy "poser un bloc" on public.blocks
  for insert with check (
    char_length(world) between 1 and 32
    and x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
    and id between 0 and 255
    and (placed_name is null or char_length(placed_name) <= 16)
  );

drop policy if exists "modifier un bloc" on public.blocks;
create policy "modifier un bloc" on public.blocks
  for update using (true) with check (
    x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
    and id between 0 and 255
    and (placed_name is null or char_length(placed_name) <= 16)
  );

-- 2. Terrain d'origine figé : écrit au premier bloc modifié dans un tronçon de 16 × 16 colonnes, jamais réécrit.
--    Le générateur peut ensuite évoluer : seuls les tronçons encore vierges changent.
create table if not exists public.chunks (
  world      text        not null,
  cx         integer     not null,
  cz         integer     not null,
  gen        integer     not null,
  sy         integer     not null,
  data       text        not null,
  created_at timestamptz not null default now(),
  primary key (world, cx, cz)
);

alter table public.chunks enable row level security;

drop policy if exists "lire les tronçons" on public.chunks;
create policy "lire les tronçons" on public.chunks
  for select using (true);

drop policy if exists "figer un tronçon" on public.chunks;
create policy "figer un tronçon" on public.chunks
  for insert with check (
    char_length(world) between 1 and 32
    and sy between 1 and 256
    and char_length(data) <= 60000
  );

-- Volontairement aucune règle update ou delete sur chunks : un tronçon figé ne change plus.
