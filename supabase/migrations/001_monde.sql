-- 001 : le monde partagé.
-- Trois tables : les mondes (taille de la frontière), le terrain figé par tronçon, les blocs modifiés.
-- Migrations suivantes : uniquement additives (nouvelles tables, nouvelles colonnes avec valeur par défaut).

-- 1. Les mondes et leur frontière -----------------------------------------------------------
create table if not exists public.worlds (
  world         text        primary key,
  placed_total  integer     not null default 0,  -- blocs posés par les joueurs depuis le début
  radius        integer     not null default 3,  -- rayon de la frontière, en tronçons autour du tronçon 0,0
  created_at    timestamptz not null default now()
);
alter table public.worlds enable row level security;
drop policy if exists "lire les mondes" on public.worlds;
create policy "lire les mondes" on public.worlds for select using (true);
-- Aucune écriture directe : seul le déclencheur ci-dessous fait avancer la frontière.

-- 2. Terrain d'origine figé, par tronçon de 16 × 16 colonnes --------------------------------
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
create policy "figer un tronçon" on public.chunks for insert with check (
  char_length(world) between 1 and 32 and sy between 1 and 256 and char_length(data) <= 60000
);
-- Volontairement aucune règle update ou delete : un tronçon figé ne change plus.

-- 3. Blocs modifiés par les joueurs ---------------------------------------------------------
create table if not exists public.blocks (
  world        text        not null,
  x            integer     not null,
  y            integer     not null,
  z            integer     not null,
  id           smallint    not null,
  placed_by    text,
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
create policy "poser un bloc" on public.blocks for insert with check (
  char_length(world) between 1 and 32
  and x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
  and id between 0 and 255
  and (placed_name is null or char_length(placed_name) <= 16)
);
drop policy if exists "modifier un bloc" on public.blocks;
create policy "modifier un bloc" on public.blocks for update using (true) with check (
  x between -100000 and 100000 and z between -100000 and 100000 and y between 0 and 255
  and id between 0 and 255
  and (placed_name is null or char_length(placed_name) <= 16)
);

-- 4. La frontière recule quand la communauté construit --------------------------------------
-- Anneau n débloqué à 150 × n × (n + 1) blocs posés : 300, 900, 1 800, 3 000…
create or replace function public.on_block_placed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id > 0 and new.placed_by is not null then
    insert into public.worlds (world) values (new.world) on conflict (world) do nothing;
    update public.worlds
       set placed_total = placed_total + 1,
           radius = least(60, 3 + floor((sqrt(1 + 4 * (placed_total + 1) / 150.0) - 1) / 2)::int)
     where world = new.world;
  end if;
  return new;
end $$;

drop trigger if exists block_placed on public.blocks;
create trigger block_placed after insert or update on public.blocks
  for each row execute function public.on_block_placed();

-- 5. Diffusion en direct des changements de frontière -----------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.worlds;
exception when duplicate_object then null;
end $$;
