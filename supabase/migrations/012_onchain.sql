-- 012 : préparation de la couche web3 (validateurs uniquement — voir README).
--   Un sceau de validateur (203) pourra être frappé par son propriétaire comme un vrai ERC-721 non
--   transférable sur Sepolia, dont l'identifiant est dérivé des coordonnées du validateur rallumé :
--   on les garde donc de façon structurée (vx, vy, vz) plutôt que de reparser le texte libre « place ».
--   Un wallet peut être lié à un compte (un seul par compte, indépendant du monde) par message signé,
--   vérifié côté Edge Function ; aucune clé ni secret ici. Rien d'autre n'est tokenisé.
-- Rejouable sans erreur. Nécessite 001 (uniques, _mint, _player, _no) et 002 (_rate, le renommage de
-- act_relight en _core_relight).

-- ---------- coordonnées et état onchain du sceau ----------
alter table public.uniques add column if not exists vx integer;
alter table public.uniques add column if not exists vy integer;
alter table public.uniques add column if not exists vz integer;
alter table public.uniques add column if not exists chain_tx text; -- hash de frappe, rempli par l'opérateur

create or replace function public._core_relight(w text, px int, py int, pz int) returns jsonb
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
  update uniques set vx = px, vy = py, vz = pz where user_id = me and world = w and serial = (u ->> 'serial')::int;
  return jsonb_build_object('ok', true, 'changes', ch, 'inv', inv, 'unique', u, 'serial', s);
end $$;

-- ---------- liaison de wallet (un par compte, écrite uniquement par l'Edge Function avec service_role) ----------
create table if not exists public.wallets (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  address    text        not null unique,
  linked_at  timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists "lire son wallet" on public.wallets;
create policy "lire son wallet" on public.wallets for select to authenticated using (auth.uid() = user_id);

-- Défi à usage unique pour prouver la possession d'une adresse (le joueur le signe, l'Edge Function
-- vérifie la signature puis écrit dans wallets). Jamais lu par le joueur : aucune policy de lecture.
create table if not exists public.wallet_nonces (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  nonce      text        not null,
  created_at timestamptz not null default now()
);
alter table public.wallet_nonces enable row level security; -- aucune règle : réservé aux fonctions et à l'Edge Function

create or replace function public.act_wallet_nonce() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); n text;
begin
  if me is null then raise exception 'non connecté'; end if;
  if not _rate(me, 'wallet_nonce', 0.1, 4) then return _no('trop d''actions'); end if;
  n := encode(extensions.gen_random_bytes(16), 'hex');
  insert into wallet_nonces (user_id, nonce) values (me, n)
    on conflict (user_id) do update set nonce = excluded.nonce, created_at = now();
  return jsonb_build_object('ok', true, 'nonce', n);
end $$;

-- ---------- droits ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
