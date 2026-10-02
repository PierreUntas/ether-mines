// Fonction « lier-wallet » : relie une adresse Ethereum au compte connecté, après vérification d'une
// signature (EIP-191, personal_sign) sur le nonce à usage unique délivré par act_wallet_nonce().
// Message signé par le joueur, à reproduire exactement côté jeu :
//   "Mines d'Éther — lier ce wallet à mon compte.\nNonce : <nonce>"
// Aucun secret ici : seule la clé publique anon suffit à authentifier l'appelant (comme figer()).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAddress, isAddress, verifyMessage } from 'npm:viem@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const message = (nonce: string) => `Mines d'Éther — lier ce wallet à mon compte.\nNonce : ${nonce}`;
const DIX_MINUTES = 10 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'non connecté' }, 401);

    const { address, signature } = await req.json();
    if (typeof address !== 'string' || !isAddress(address)) return json({ error: 'adresse invalide' }, 400);
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return json({ error: 'signature invalide' }, 400);
    }

    const { data: n, error: nonceErr } = await admin
      .from('wallet_nonces')
      .select('nonce, created_at')
      .eq('user_id', who.user.id)
      .maybeSingle();
    if (nonceErr) throw nonceErr;
    if (!n) return json({ error: "demande d'abord un nonce (act_wallet_nonce)" }, 400);
    if (Date.now() - new Date(n.created_at).getTime() > DIX_MINUTES) {
      return json({ error: 'nonce expiré, redemande-en un' }, 400);
    }

    const valide = await verifyMessage({
      address: address as `0x${string}`,
      message: message(n.nonce),
      signature: signature as `0x${string}`,
    });
    if (!valide) return json({ error: 'signature invalide pour cette adresse' }, 400);

    const propre = getAddress(address); // forme à casse mixte (checksum), une seule fois pour toujours
    const up = await admin.from('wallets').upsert({ user_id: who.user.id, address: propre }, { onConflict: 'user_id' });
    if (up.error) {
      if (up.error.code === '23505') return json({ error: 'cette adresse est déjà liée à un autre compte' }, 409);
      throw up.error;
    }
    await admin.from('wallet_nonces').delete().eq('user_id', who.user.id); // à usage unique
    return json({ address: propre });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
