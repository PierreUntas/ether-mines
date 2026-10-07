-- 001: Ether Mines full schema.
-- The server is authoritative: players cannot write directly to the world or to their inventory.
-- Every action (mine, place, craft...) goes through an act_* function that checks the rules then applies them.
-- Prerequisite: Authentication → Sign In / Providers → "Allow anonymous sign-ins" enabled.
-- Then: run supabase/rules.sql (game rules generated from the code) and deploy the "freeze" function.
-- Later migrations: additive only.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================================
-- 1. The world
-- =========================================================================================

-- Frozen original terrain, per 16x16-column chunk. Written only by the "freeze" function,
-- which generates it server-side with the same generator as the game: a player can't invent terrain.
create table if not exists public.chunks (
  world      text        not null,
  cx         integer     not null,
  cz         integer     not null,
  gen        integer     not null,   -- generator version
  sy         integer     not null,   -- world height (64)
  data       text        not null,   -- blocks encoded as runs (length, block) then base64
  created_at timestamptz not null default now(),
  primary key (world, cx, cz)
);
alter table public.chunks enable row level security;
drop policy if exists "read chunks" on public.chunks;
create policy "read chunks" on public.chunks for select using (true);

-- Modified blocks. Written only by the act_* functions.
create table if not exists public.blocks (
  world        text        not null,
  x            integer     not null,
  y            integer     not null,
  z            integer     not null,
  id           smallint    not null,
  placed_by    text,       -- author's account, null for a mined block
  placed_name  text,
  serial       integer,
  updated_at   timestamptz not null default now(),
  primary key (world, x, y, z)
);
create index if not exists blocks_zone on public.blocks (world, x, z);
create index if not exists blocks_author on public.blocks (world, placed_by) where placed_by is not null;
alter table public.blocks enable row level security;
drop policy if exists "read blocks" on public.blocks;
create policy "read blocks" on public.blocks for select using (true);

-- Claims: a claimed chunk can only be modified by its owner and their guests.
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
drop policy if exists "read claims" on public.claims;
create policy "read claims" on public.claims for select using (true);

-- =========================================================================================
-- 2. Players
-- =========================================================================================

-- Each player's game, per world. The client can only write its own preferences (state: hotbar, position,
-- seen quests, log); arbitration counters are server-only.
create table if not exists public.players (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world      text        not null,
  name       text,
  color      text,
  state      jsonb       not null default '{}'::jsonb,
  serial     integer     not null default 0,      -- number of the last block placed
  mine_at    timestamptz,                         -- last block mined (mining speed)
  rewards_at timestamptz,                         -- last validator reward
  gifts      jsonb       not null default '{}'::jsonb, -- today's animal gifts
  muted_until timestamptz,
  mutes      integer     not null default 0,
  pos_x      real,
  pos_y      real,
  pos_z      real,
  pos_at     timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, world)
);
alter table public.players enable row level security;
drop policy if exists "read own game" on public.players;
create policy "read own game" on public.players for select to authenticated using (auth.uid() = user_id);
drop policy if exists "create own game" on public.players;
create policy "create own game" on public.players for insert to authenticated
  with check (auth.uid() = user_id and char_length(world) between 1 and 32 and pg_column_size(state) < 300000);
drop policy if exists "save own game" on public.players;
create policy "save own game" on public.players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id and pg_column_size(state) < 300000);
revoke insert, update, delete on public.players from anon, authenticated;
grant insert (user_id, world, name, color, state, updated_at) on public.players to authenticated;
grant update (user_id, world, name, color, state, updated_at) on public.players to authenticated; -- user_id and world: needed for upsert, bounded by the "save own game" rule

-- Inventory: quantities per item. Read-only for the player.
create table if not exists public.inventory (
  user_id  uuid     not null references auth.users (id) on delete cascade,
  world    text     not null,
  item     smallint not null,
  n        integer  not null check (n >= 0),
  primary key (user_id, world, item)
);
alter table public.inventory enable row level security;
drop policy if exists "read own inventory" on public.inventory;
create policy "read own inventory" on public.inventory for select to authenticated using (auth.uid() = user_id);

-- Unique items (future NFTs): numbered per player, with their history.
create table if not exists public.uniques (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world      text        not null,
  serial     integer     not null,
  item       smallint    not null,
  place      text,
  mined      integer     not null default 0,
  vx         integer,
  vy         integer,
  vz         integer,
  chain_tx   text,       -- mint tx hash, filled in by the operator
  token_id   text,       -- on-chain token id once minted (kept as text to avoid JS precision loss)
  created_at timestamptz not null default now(),
  primary key (user_id, world, serial)
);
alter table public.uniques enable row level security;
drop policy if exists "read own uniques" on public.uniques;
create policy "read own uniques" on public.uniques for select to authenticated using (auth.uid() = user_id);

-- Recovery codes (only the hash is kept).
create table if not exists public.recovery (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  code_hash  text        not null unique,
  created_at timestamptz not null default now()
);
alter table public.recovery enable row level security;

-- =========================================================================================
-- 3. Rules (filled in by supabase/rules.sql, generated from the game code)
-- =========================================================================================
create table if not exists public.rule_blocks (
  id        smallint primary key,
  name      text,
  hard      real,       -- seconds by hand; null = unbreakable
  tier      smallint not null default 0,  -- required tool tier
  drop_item smallint,   -- what it drops (null = nothing)
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
-- 4. Internal tools (not callable by players)
-- =========================================================================================

-- Current block at (x, y, z): known edit if any, otherwise frozen terrain. Chunk not frozen yet: "freeze" error.
create or replace function public._cell(w text, px int, py int, pz int) returns smallint
language plpgsql stable security definer set search_path = public as $$
declare v smallint; c record; b bytea; idx int; acc int := 0; i int := 0; r int; n int;
begin
  if py < 0 or py >= 64 then return 0; end if;
  select id into v from blocks where world = w and x = px and y = py and z = pz;
  if found then return v; end if;
  select sy, data into c from chunks where world = w and cx = px >> 4 and cz = pz >> 4;
  if not found then raise exception 'freeze:%,%', px >> 4, pz >> 4; end if;
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

-- Change the block without touching its signature (doors, levers).
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
  if me is null then raise exception 'not signed in'; end if;
  if char_length(w) not between 1 and 32 then raise exception 'invalid world'; end if;
  insert into players (user_id, world) values (me, w) on conflict do nothing;
  select * into p from players where user_id = me and world = w for update;
  return p;
end $$;

create or replace function public._count(me uuid, w text, it int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select n from inventory where user_id = me and world = w and item = it), 0)
$$;

-- Adds (or removes, if d < 0) items from the inventory; returns the changed inventory slice in inv.
create or replace function public._give(me uuid, w text, it int, d int, inv jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if d < 0 then
    update inventory set n = n + d where user_id = me and world = w and item = it returning n into v;
    if v is null or v < 0 then raise exception 'not enough in inventory'; end if;
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

-- The sanctuary is untouchable; a claim can only be modified by its owner and their guests.
create or replace function public._can_build(me uuid, w text, px int, pz int) returns boolean
language sql stable security definer set search_path = public as $$
  select not (px between 4 and 12 and pz between 4 and 12)
     and not exists (select 1 from claims c where c.world = w and c.cx = px >> 4 and c.cz = pz >> 4
                     and c.owner <> me and not (me = any (c.members)))
$$;

create or replace function public._no(msg text, extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'err', msg) || extra $$;

-- =========================================================================================
-- 5. Player actions (business logic — wrapped by rate/position checks in 002_security.sql)
-- =========================================================================================

-- Mine: tool strong enough, plausible pace, loot picked by the server.
create or replace function public._core_mine(w text, px int, py int, pz int, held text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; id0 int; rb rule_blocks; t_tier int := 0; t_mult real := 1; useri int;
  need real; ch jsonb := '[]'; inv jsonb := '{}'; oy int; other int; above int; ab rule_blocks; n int;
begin
  pl := _player(me, w);
  id0 := _cell(w, px, py, pz);
  select * into rb from rule_blocks where id = id0;
  if id0 = 0 or rb.id is null or rb.hard is null then return _no('nothing to mine', jsonb_build_object('cell', id0)); end if;
  if not _can_build(me, w, px, pz) then return _no('protected', jsonb_build_object('cell', id0)); end if;
  if held = '102' and _count(me, w, 102) > 0 then
    select tier, rule_items.tool into t_tier, t_mult from rule_items where id = 102;
  elsif held like 'nft%' then
    select u.serial, i.tier, i.tool into useri, t_tier, t_mult from uniques u join rule_items i on i.id = u.item
      where u.user_id = me and u.world = w and u.serial = nullif(substr(held, 4), '')::int;
    t_tier := coalesce(t_tier, 0); t_mult := coalesce(t_mult, 1);
  end if;
  if t_tier < rb.tier then return _no('tool too weak', jsonb_build_object('cell', id0)); end if;
  need := rb.hard / t_mult;
  if pl.mine_at is not null and extract(epoch from clock_timestamp() - pl.mine_at) < need * 0.5 - 0.1 then
    return _no('too fast', jsonb_build_object('cell', id0));
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

-- Place: the item is in the inventory, the cell is free, the support is right.
create or replace function public._core_place(w text, px int, py int, pz int, it int, bid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; cur int; cr rule_blocks; rb rule_blocks; below int; up int; ch jsonb := '[]'; inv jsonb := '{}'; s int;
begin
  pl := _player(me, w);
  if py < 1 or py >= 64 or abs(px) >= 100000 or abs(pz) >= 100000 then return _no('out of the world'); end if;
  if not exists (select 1 from rule_place where item = it and block = bid) then return _no('item not placeable'); end if;
  if _count(me, w, it) < 1 then return _no('empty inventory', jsonb_build_object('inv', jsonb_build_object(it::text, 0))); end if;
  if not _can_build(me, w, px, pz) then return _no('protected'); end if;
  cur := _cell(w, px, py, pz); select * into cr from rule_blocks where id = cur;
  if cur <> 0 and cr.kind not in ('water', 'cross') then return _no('space occupied', jsonb_build_object('cell', cur)); end if;
  select * into rb from rule_blocks where id = bid;
  below := _cell(w, px, py - 1, pz);
  if rb.kind = 'cross' and below not in (1, 2) then return _no('needs support'); end if;
  if rb.kind in ('plate', 'cable', 'lever') and not coalesce((select solid from rule_blocks where id = below), false) then return _no('needs support'); end if;
  if rb.kind = 'door' then
    if py + 1 >= 64 then return _no('out of the world'); end if;
    up := _cell(w, px, py + 1, pz);
    if up <> 0 and (select kind from rule_blocks where id = up) not in ('water', 'cross') then return _no('space occupied'); end if;
  end if;
  inv := _give(me, w, it, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, bid, me, pl.name, s);
  if rb.kind = 'door' then ch := ch || _set(w, px, py + 1, pz, bid + 1, me, pl.name, s); end if;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'serial', s);
end $$;

-- Open a door, flip a lever.
create or replace function public._core_toggle(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cur int; rb rule_blocks; ch jsonb := '[]'; oy int; other int;
begin
  perform _player(me, w);
  cur := _cell(w, px, py, pz); select * into rb from rule_blocks where id = cur;
  if rb.kind not in ('door', 'lever') then return _no('nothing to toggle', jsonb_build_object('cell', cur)); end if;
  if not _can_build(me, w, px, pz) then return _no('protected'); end if;
  if rb.kind = 'lever' then return jsonb_build_object('ok', true, 'changes', ch || _flip(w, px, py, pz, case cur when 64 then 65 else 64 end)); end if;
  ch := ch || _flip(w, px, py, pz, cur # 2);
  oy := case when rb.top then py - 1 else py + 1 end; other := _cell(w, px, oy, pz);
  if (select kind from rule_blocks where id = other) = 'door' then ch := ch || _flip(w, px, oy, pz, other # 2); end if;
  return jsonb_build_object('ok', true, 'changes', ch);
end $$;

-- Craft according to a recipe known to the server.
create or replace function public._core_craft(w text, out_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r rule_recipes; k text; v jsonb; inv jsonb := '{}'; u jsonb;
begin
  perform _player(me, w);
  select * into r from rule_recipes where out_item = out_id;
  if not found then return _no('unknown recipe'); end if;
  for k, v in select * from jsonb_each(r.need) loop
    if _count(me, w, k::int) < v::int then return _no('missing ingredients', jsonb_build_object('item', k::int)); end if;
  end loop;
  for k, v in select * from jsonb_each(r.need) loop inv := _give(me, w, k::int, -(v::int), inv); end loop;
  if r.uniq then u := _mint(me, w, out_id, null); return jsonb_build_object('ok', true, 'inv', inv, 'unique', u); end if;
  inv := _give(me, w, out_id, r.n, inv);
  return jsonb_build_object('ok', true, 'inv', inv);
end $$;

-- Relight a dark validator with a validator heart (allowed even inside a claim).
create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}'; s int; ch jsonb := '[]'; u jsonb;
begin
  pl := _player(me, w);
  if _cell(w, px, py, pz) <> 73 then return _no('not a dark validator', jsonb_build_object('cell', _cell(w, px, py, pz))); end if;
  if _count(me, w, 105) < 1 then return _no('needs a validator heart'); end if;
  inv := _give(me, w, 105, -1, inv);
  update players set serial = serial + 1 where user_id = me and world = w returning serial into s;
  ch := ch || _set(w, px, py, pz, 74, me, pl.name, s);
  u := _mint(me, w, 203, px || ', ' || py || ', ' || pz);
  update uniques set vx = px, vy = py, vz = pz where user_id = me and world = w and serial = (u ->> 'serial')::int;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'serial', s);
end $$;

-- Gift from a petted animal: once a day per animal, fifteen a day at most.
create or replace function public._core_gift(w text, animal text, kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; today text := to_char(now(), 'YYYY-MM-DD'); g jsonb; it int; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if animal is null or char_length(animal) > 40 then return _no('unknown animal'); end if;
  if pl.created_at > now() - interval '30 minutes' then return _no('the animals do not know you yet'); end if;
  g := coalesce((select jsonb_object_agg(k, v) from jsonb_each(pl.gifts) e(k, v) where v #>> '{}' = today), '{}');
  if g ? animal then return _no('already gifted today'); end if;
  if (select count(*) from jsonb_object_keys(g)) >= 15 then return _no('enough gifts for today'); end if;
  it := case kind when 'sheep' then 71 when 'fox' then 17 + floor(random() * 3)::int when 'jellyfish' then 101 else null end;
  if it is null then return _no('this animal has no gift'); end if;
  update players set gifts = g || jsonb_build_object(animal, today) where user_id = me and world = w;
  inv := _give(me, w, it, 1, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'item', it);
end $$;

-- Validator rewards for blocks the player has signed: in "shares" per 12s slot, 25 shares = 1 crystal.
--   placed validator: 1 share (1 crystal every 5 minutes), at most 5 placed validators count;
--   relit dark validator: 5 shares (1 crystal per minute).
-- Only validators already placed at the start of the paid period count. Unconverted shares aren't lost
-- (remaining time carries over). At most 30 minutes caught up at once.
create or replace function public._core_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; placed int; relit int; shares int; slots int; gain int; used int;
        start_at timestamptz; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if pl.rewards_at is null then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', 0, 'n', 0);
  end if;
  start_at := greatest(pl.rewards_at, now() - interval '30 minutes');      -- limited catch-up
  select count(*) filter (where id = 13), count(*) filter (where id = 74) into placed, relit
    from blocks where world = w and placed_by = me::text and id in (13, 74) and updated_at <= start_at;
  shares := least(placed, 5) + 5 * relit;
  if shares = 0 then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', 0, 'n', 0);
  end if;
  slots := floor(extract(epoch from now() - start_at) / 12)::int;
  gain := floor(slots * shares / 25.0)::int;
  if gain < 1 then
    if start_at <> pl.rewards_at then update players set rewards_at = start_at where user_id = me and world = w; end if;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', shares, 'n', 0);
  end if;
  used := ceil(gain * 25.0 / shares)::int;                                -- slots consumed; the rest waits
  update players set rewards_at = start_at + make_interval(secs => used * 12) where user_id = me and world = w;
  inv := _give(me, w, 101, gain, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'slots', used, 'weight', shares, 'n', gain);
end $$;

-- Claims: 2 crystals per chunk, 16 at most per player, never the sanctuary chunk.
create or replace function public._core_claim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; inv jsonb := '{}';
begin
  pl := _player(me, w);
  if qx = 0 and qz = 0 then return _no('the sanctuary belongs to everyone'); end if;
  if abs(qx) > 6250 or abs(qz) > 6250 then return _no('out of the world'); end if;
  if exists (select 1 from claims where world = w and cx = qx and cz = qz) then return _no('already claimed'); end if;
  if (select count(*) from claims where world = w and owner = me) >= 16 then return _no('16 claims at most'); end if;
  if _count(me, w, 101) < 2 then return _no('needs 2 ether crystals'); end if;
  inv := _give(me, w, 101, -2, inv);
  insert into claims (world, cx, cz, owner, owner_name, members)
    select w, qx, qz, me, pl.name, coalesce((select members from claims where world = w and owner = me limit 1), '{}');
  return jsonb_build_object('ok', true, 'inv', inv);
end $$;

create or replace function public._core_unclaim(w text, qx int, qz int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from claims where world = w and cx = qx and cz = qz and owner = auth.uid();
  if not found then return _no('not your claim'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Invite (or kick) a player, by their username, on all of their claims in the world.
create or replace function public._core_member(w text, username text, invite boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); who uuid; wname text;
begin
  select user_id, name into who, wname from players where world = w and lower(name) = lower(trim(username)) and user_id <> me
    order by updated_at desc limit 1;
  if who is null then return _no('unknown player in this world'); end if;
  if invite then update claims set members = array_append(array_remove(members, who), who) where world = w and owner = me;
  else update claims set members = array_remove(members, who) where world = w and owner = me; end if;
  return jsonb_build_object('ok', true, 'name', wname);
end $$;

-- =========================================================================================
-- 6. Recovery codes
-- =========================================================================================
create or replace function public.set_recovery_code() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare raw text; code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  raw := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  code := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4) || '-' || substr(raw, 13, 4);
  insert into public.recovery (user_id, code_hash) values (auth.uid(), encode(extensions.digest(code, 'sha256'), 'hex'))
    on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
  return code;
end $$;

-- Reattaches to the connected player everything owned by that code's account: games, inventories,
-- unique items, blocks, claims.
create or replace function public._core_claim_recovery(code text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare old uuid; me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into old from public.recovery where code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex');
  if old is null then raise exception 'unknown code'; end if;
  if old = me then return 0; end if;
  -- this device's account steps aside for the code's account, world by world
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
-- 7. Rights and live broadcast
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
