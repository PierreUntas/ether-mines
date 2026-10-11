-- 023: removes the real-blockchain layer from the database (supersedes 009_onchain_wallet.sql's tables
-- and function — never edit a published migration, add a new one). Sequenced after 020_validators.sql,
-- whose seal (item 203) now points at a validators row via uniques.validator_id instead of vx/vy/vz:
-- nothing reads the chain-era columns anymore, so they can go. Ether Mines no longer links a wallet,
-- calls an RPC, or mints/attests/claims on a real chain; see legacy/ for the archived contracts and
-- Edge Functions. Requires 001_schema.sql, 009_onchain_wallet.sql, 020_validators.sql.

drop function if exists public.act_wallet_nonce();
drop table if exists public.wallet_nonces;
drop table if exists public.wallets;

alter table public.uniques
  drop column if exists vx,
  drop column if exists vy,
  drop column if exists vz,
  drop column if exists chain_tx,
  drop column if exists token_id;
