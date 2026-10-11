# Legacy: the real-blockchain layer

Ether Mines used to optionally mirror validators on Sepolia testnet. As of the off-chain pivot, the
game no longer uses a real blockchain anywhere: no wallet, no RPC call, no mint/attest/claim on a real
chain. The mechanic lives on entirely off-chain — see `README.md`'s "Validators and Gwei" section and
`supabase/migrations/019_gwei_currency.sql` through `023_remove_onchain.sql`.

This folder keeps the old implementation for reference and historical record. None of it is deployed,
built, or imported by the active game.

- `contracts/` — the Foundry project: `Seal.sol` (locked ERC-721/ERC-5192 "Validator Seal"), `Network.sol`
  (the reward pool, paying real Sepolia ETH per epoch), their tests, deploy script, and the
  `broadcast/` logs of the actual Sepolia deployments.
- `supabase-functions-chain/` — the Edge Function that held the operator key and sent the mint/attest/claim
  transactions (formerly `supabase/functions/chain`).
- `supabase-functions-link-wallet/` — the Edge Function that verified a signed message to link a wallet
  (formerly `supabase/functions/link-wallet`).
- `src-game-15-chain.js` — the client module that read Seal/Network state via a public Sepolia RPC
  endpoint (formerly `src/game/15-chain.js`).
- `WEB3_SETUP.md` — the operational checklist for standing up the chain layer (was already untracked,
  moved here for completeness).
