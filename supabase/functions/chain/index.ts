// "chain" function: the game's three onchain actions, all restricted to the operator on Seal and
// Network (OPERATOR_ROLE) — mint a seal, attest an epoch, claim its reward. The player never pays
// gas: this function sends the transaction, using the operator key (a Supabase secret, never in the
// repo). Every call is first simulated (read-only) so we never pay gas for a transaction that would
// fail, and so the contract's error can be translated into a clear message.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type Address, createPublicClient, createWalletClient, http, parseAbi } from 'npm:viem@2';
import { privateKeyToAccount } from 'npm:viem@2/accounts';
import { sepolia } from 'npm:viem@2/chains';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Custom errors must be in the ABI so viem can decode a revert into a clear name (errorName) rather
// than a plain hex signature — without this, errorMessage() never translates anything.
const sealAbi = parseAbi([
  'function mint(address to, string world, int32 x, int32 y, int32 z, uint64 forgedAt) returns (uint256)',
  'error TokenLocked()',
]);
const networkAbi = parseAbi([
  'function attest(uint256 tokenId)',
  'function claim(uint256 tokenId, uint256 epoch)',
  'error EpochNotClosed()',
  'error AlreadyAttestedThisEpoch()',
  'error NotAttestedThisEpoch()',
  'error AlreadyClaimed()',
  'error PayoutFailed()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
]);

// Custom error names from the contracts (Seal.sol, Network.sol), translated for the player.
const ERRORS: Record<string, string> = {
  TokenLocked: 'this seal cannot change hands',
  AlreadyAttestedThisEpoch: 'already attested for this epoch',
  NotAttestedThisEpoch: 'this seal has not attested this epoch',
  AlreadyClaimed: 'already claimed',
  EpochNotClosed: 'this epoch is not closed yet',
  PayoutFailed: "the Network's balance is too low right now, try again later",
  AccessControlUnauthorizedAccount: 'the operator no longer has the right to act (check the roles)',
};
function errorMessage(e: unknown): string {
  // deno-lint-ignore no-explicit-any
  const name = (e as any)?.cause?.data?.errorName as string | undefined;
  if (name && ERRORS[name]) return ERRORS[name];
  // deno-lint-ignore no-explicit-any
  return (e as any)?.shortMessage || String((e as Error)?.message || e);
}

type Action = 'mint' | 'attest' | 'claim';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'not signed in' }, 401);
    const me = who.user.id;

    const { action, world, serial, epoch } = await req.json();
    if (!['mint', 'attest', 'claim'].includes(action)) return json({ error: 'unknown action' }, 400);
    const act = action as Action;
    if (typeof world !== 'string' || !Number.isInteger(serial)) return json({ error: 'invalid request' }, 400);

    const lim = await admin.rpc('_rate', { me, kind_: 'chain_' + act, per_s: 0.05, burst: 3 });
    if (lim.error) throw lim.error;
    if (lim.data === false) return json({ error: 'too many requests, wait a moment' }, 429);

    const { data: u, error: uErr } = await admin
      .from('uniques')
      .select('item, vx, vy, vz, created_at, chain_tx, token_id')
      .eq('user_id', me)
      .eq('world', world)
      .eq('serial', serial)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!u || u.item !== 203) return json({ error: 'seal not found' }, 404);
    if (u.vx === null || u.vy === null || u.vz === null) return json({ error: 'missing coordinates' }, 500);

    const SEAL = Deno.env.get('SEAL_ADDRESS')! as Address;
    const NETWORK = Deno.env.get('NETWORK_ADDRESS')! as Address;
    const operator = privateKeyToAccount(Deno.env.get('OPERATOR_PRIVATE_KEY')! as `0x${string}`);
    const transport = http(Deno.env.get('SEPOLIA_RPC_URL')!);
    const reader = createPublicClient({ chain: sepolia, transport });
    const writer = createWalletClient({ chain: sepolia, transport, account: operator });

    const send = async (sim: { request: Parameters<typeof writer.writeContract>[0] }) => {
      const hash = await writer.writeContract(sim.request);
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('the transaction failed');
      return hash;
    };

    if (act === 'mint') {
      if (u.chain_tx) return json({ error: 'already minted', hash: u.chain_tx }, 409);
      const { data: w, error: wErr } = await admin.from('wallets').select('address').eq('user_id', me).maybeSingle();
      if (wErr) throw wErr;
      if (!w?.address) return json({ error: 'link a wallet first' }, 400);
      const forgedAt = BigInt(Math.floor(new Date(u.created_at).getTime() / 1000));
      let sim;
      try {
        sim = await reader.simulateContract({
          address: SEAL,
          abi: sealAbi,
          functionName: 'mint',
          args: [w.address as Address, world, u.vx, u.vy, u.vz, forgedAt],
          account: operator,
        });
      } catch (e) {
        return json({ error: errorMessage(e) }, 400);
      }
      const hash = await send(sim);
      const up = await admin
        .from('uniques')
        .update({ chain_tx: hash, token_id: sim.result.toString() })
        .eq('user_id', me)
        .eq('world', world)
        .eq('serial', serial);
      if (up.error) throw up.error;
      return json({ hash, tokenId: sim.result.toString() });
    }

    if (!u.chain_tx || !u.token_id) return json({ error: 'not minted yet' }, 400);
    const tokenId = BigInt(u.token_id);

    if (act === 'attest') {
      let sim;
      try {
        sim = await reader.simulateContract({
          address: NETWORK,
          abi: networkAbi,
          functionName: 'attest',
          args: [tokenId],
          account: operator,
        });
      } catch (e) {
        return json({ error: errorMessage(e) }, 400);
      }
      return json({ hash: await send(sim) });
    }

    // claim
    if (!Number.isInteger(epoch) || epoch < 0) return json({ error: 'invalid epoch' }, 400);
    let sim;
    try {
      sim = await reader.simulateContract({
        address: NETWORK,
        abi: networkAbi,
        functionName: 'claim',
        args: [tokenId, BigInt(epoch)],
        account: operator,
      });
    } catch (e) {
      return json({ error: errorMessage(e) }, 400);
    }
    return json({ hash: await send(sim) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
