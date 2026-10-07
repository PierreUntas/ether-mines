// "link-wallet" function: links an Ethereum address to the signed-in account, after verifying a
// signature (EIP-191, personal_sign) over the one-time nonce issued by act_wallet_nonce().
// Message signed by the player, to be reproduced exactly on the game side:
//   "Ether Mines — link this wallet to my account.\nNonce: <nonce>"
// No secret here: the public anon key alone is enough to authenticate the caller (same as freeze()).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAddress, isAddress, verifyMessage } from 'npm:viem@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const message = (nonce: string) => `Ether Mines — link this wallet to my account.\nNonce: ${nonce}`;
const TEN_MINUTES = 10 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'not signed in' }, 401);

    const { address, signature } = await req.json();
    if (typeof address !== 'string' || !isAddress(address)) return json({ error: 'invalid address' }, 400);
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return json({ error: 'invalid signature' }, 400);
    }

    const { data: n, error: nonceErr } = await admin
      .from('wallet_nonces')
      .select('nonce, created_at')
      .eq('user_id', who.user.id)
      .maybeSingle();
    if (nonceErr) throw nonceErr;
    if (!n) return json({ error: 'request a nonce first (act_wallet_nonce)' }, 400);
    if (Date.now() - new Date(n.created_at).getTime() > TEN_MINUTES) {
      return json({ error: 'nonce expired, request a new one' }, 400);
    }

    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message: message(n.nonce),
      signature: signature as `0x${string}`,
    });
    if (!valid) return json({ error: 'invalid signature for this address' }, 400);

    const clean = getAddress(address); // mixed-case (checksum) form, once and for all
    const up = await admin.from('wallets').upsert({ user_id: who.user.id, address: clean }, { onConflict: 'user_id' });
    if (up.error) {
      if (up.error.code === '23505') return json({ error: 'this address is already linked to another account' }, 409);
      throw up.error;
    }
    await admin.from('wallet_nonces').delete().eq('user_id', who.user.id); // single use
    return json({ address: clean });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
