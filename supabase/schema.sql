-- Mines d'Éther : le monde partagé.
-- À coller dans Supabase → SQL Editor → Run.
-- Chaque ligne = un bloc modifié par rapport au monde généré (la graine est la même pour tous).

create table if not exists public.blocks (
  world        text        not null,
  idx          integer     not null,
  id           smallint    not null,
  placed_by    text,
  placed_name  text,
  serial       integer,
  updated_at   timestamptz not null default now(),
  primary key (world, idx)
);

alter table public.blocks enable row level security;

-- Tout le monde peut lire le monde.
drop policy if exists "lire les blocs" on public.blocks;
create policy "lire les blocs" on public.blocks
  for select using (true);

-- Écriture ouverte aux joueurs, dans les limites du monde (96 × 48 × 96 = 442 368 cases).
drop policy if exists "poser un bloc" on public.blocks;
create policy "poser un bloc" on public.blocks
  for insert with check (
    char_length(world) between 1 and 32
    and idx >= 0 and idx < 442368
    and id >= 0 and id <= 40
    and (placed_name is null or char_length(placed_name) <= 16)
  );

drop policy if exists "modifier un bloc" on public.blocks;
create policy "modifier un bloc" on public.blocks
  for update using (true) with check (
    idx >= 0 and idx < 442368
    and id >= 0 and id <= 40
    and (placed_name is null or char_length(placed_name) <= 16)
  );
