-- 009: onchain wallet linking.
--   A wallet can be linked to an account (one per account, independent of world) via a signed message,
--   verified by the Edge Function; no key or secret here. Nothing else is tokenized.
--   The validator seal (203)'s onchain fields (vx, vy, vz, chain_tx, token_id) live directly on the
--   base "uniques" table (see 001_schema.sql) since there's no legacy data to migrate separately.
-- Requires 001_schema.sql (uniques), 002_security.sql (_rate). Replayable without error.

create table if not exists public.wallets (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  address    text        not null unique,
  linked_at  timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select to authenticated using (auth.uid() = user_id);

-- One-time challenge to prove ownership of an address (the player signs it, the Edge Function verifies
-- the signature then writes to wallets). Never read by the player: no select policy.
create table if not exists public.wallet_nonces (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  nonce      text        not null,
  created_at timestamptz not null default now()
);
alter table public.wallet_nonces enable row level security; -- no policy: functions and the Edge Function only

create or replace function public.act_wallet_nonce() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); n text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not _rate(me, 'wallet_nonce', 0.1, 4) then return _no('too many actions'); end if;
  n := encode(extensions.gen_random_bytes(16), 'hex');
  insert into wallet_nonces (user_id, nonce) values (me, n)
    on conflict (user_id) do update set nonce = excluded.nonce, created_at = now();
  return jsonb_build_object('ok', true, 'nonce', n);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
