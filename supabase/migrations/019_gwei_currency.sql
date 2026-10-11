-- 019: Gwei, the game's own fictional currency (never on-chain). Earned by validators, quests, mobs;
-- spent on repairs, upgrades, and cosmetics. A server-only counter on the player row, like rewards_at.
-- Requires 001_schema.sql. Replayable without error.

alter table public.players add column if not exists gwei bigint not null default 0;

create or replace function public._gwei_balance(me uuid, w text) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select gwei from players where user_id = me and world = w), 0)
$$;

-- Adds (or removes, if d < 0) Gwei from the player's balance; never goes negative. Callers that spend
-- Gwei check _gwei_balance first (same convention as _give/_count for inventory items).
create or replace function public._gwei(me uuid, w text, d bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update players set gwei = gwei + d where user_id = me and world = w returning gwei into v;
  if v is null or v < 0 then raise exception 'not enough gwei'; end if;
  return v;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
