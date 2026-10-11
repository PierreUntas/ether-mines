-- 022: cosmetics, purchasable with Gwei. Purely decorative: never a combat, speed, harvest, or access
-- effect. Catalog filled in by supabase/rules.sql (rules.js's COSMETICS, see tools/rules.mjs), same
-- pattern as rule_blocks/rule_items/rule_recipes. A "block" category cosmetic also grants some units of
-- an existing decorative-only block (grant_item/grant_qty) instead of just flipping an ownership flag.
-- Requires 001_schema.sql, 019_gwei_currency.sql. Replayable without error.

create table if not exists public.rule_cosmetics (
  id         smallint primary key,
  name       text     not null,
  price      integer  not null,
  category   text     not null,
  grant_item smallint,
  grant_qty  integer
);
alter table public.rule_cosmetics enable row level security;
drop policy if exists "read rule_cosmetics" on public.rule_cosmetics;
create policy "read rule_cosmetics" on public.rule_cosmetics for select using (true);

create table if not exists public.cosmetics_owned (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  world       text        not null,
  cosmetic_id smallint    not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, world, cosmetic_id)
);
alter table public.cosmetics_owned enable row level security;
drop policy if exists "read own cosmetics" on public.cosmetics_owned;
create policy "read own cosmetics" on public.cosmetics_owned for select to authenticated using (auth.uid() = user_id);

create or replace function public._core_buy_cosmetic(w text, cid int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc rule_cosmetics; inv jsonb := '{}';
begin
  perform _player(me, w);
  select * into rc from rule_cosmetics where id = cid;
  if not found then return _no('unknown cosmetic'); end if;
  if exists (select 1 from cosmetics_owned where user_id = me and world = w and cosmetic_id = rc.id) then
    return _no('already owned');
  end if;
  if _gwei_balance(me, w) < rc.price then return _no('not enough gwei', jsonb_build_object('need', rc.price)); end if;
  perform _gwei(me, w, -rc.price);
  insert into cosmetics_owned (user_id, world, cosmetic_id) values (me, w, rc.id);
  if rc.grant_item is not null then inv := _give(me, w, rc.grant_item, coalesce(rc.grant_qty, 1), inv); end if;
  return jsonb_build_object('ok', true, 'cosmetic', rc.id, 'inv', inv, 'gwei', _gwei_balance(me, w));
end $$;

create or replace function public.act_buy_cosmetic(w text, cosmetic_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'buy_cosmetic', 0.3, 5) then return _no('too many actions'); end if;
  return _core_buy_cosmetic(w, cosmetic_id);
end $$;

-- Recovery (001_schema.sql, extended in 020_validators.sql) must also hand over owned cosmetics.
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
  delete from public.cosmetics_owned c where c.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = c.world);
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.inventory set user_id = me where user_id = old;
  update public.uniques set user_id = me where user_id = old;
  update public.cosmetics_owned set user_id = me where user_id = old;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  update public.claims set owner = me where owner = old;
  update public.claims set members = array_replace(members, old, me) where old = any (members);
  update public.validators set owner = me where owner = old;
  delete from public.recovery where user_id = me;
  update public.recovery set user_id = me where user_id = old;
  return n;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
