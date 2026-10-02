// Fonction « chaine » : les trois actions onchain du jeu, toutes réservées à l'opérateur sur Sceau et
// Réseau (OPERATOR_ROLE) — frapper un sceau, attester une époque, réclamer sa récompense. Le joueur ne
// paie jamais de gaz : c'est cette fonction qui envoie la transaction, avec la clé opérateur (secret
// Supabase, jamais dans le dépôt). Chaque appel est d'abord simulé (lecture seule) pour ne jamais payer
// de gaz pour une transaction qui échouerait, et pour traduire l'erreur du contrat en message clair.
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

// Les erreurs personnalisées doivent figurer dans l'ABI pour que viem puisse décoder un revert en nom clair
// (errorName) plutôt qu'en simple signature hexadécimale — sans ça, messageErreur() ne traduit jamais rien.
const sceauAbi = parseAbi([
  'function mint(address to, string monde, int32 x, int32 y, int32 z, uint64 forgedAt) returns (uint256)',
  'error TokenLocked()',
]);
const reseauAbi = parseAbi([
  'function attester(uint256 tokenId)',
  'function reclamer(uint256 tokenId, uint256 epoque)',
  'error EpoqueNonCloturee()',
  'error DejaAttesteCetteEpoque()',
  'error PasAttesteCetteEpoque()',
  'error DejaReclame()',
  'error VersementEchoue()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
]);

// Noms des erreurs personnalisées des contrats (Sceau.sol, Reseau.sol), traduits pour le joueur.
const ERREURS: Record<string, string> = {
  TokenLocked: 'ce sceau ne peut pas changer de main',
  DejaAttesteCetteEpoque: 'déjà attesté pour cette époque',
  PasAttesteCetteEpoque: "ce sceau n'a pas attesté cette époque",
  DejaReclame: 'déjà réclamée',
  EpoqueNonCloturee: "cette époque n'est pas encore close",
  VersementEchoue: 'le solde de Réseau est insuffisant pour le moment, réessaie plus tard',
  AccessControlUnauthorizedAccount: "l'opérateur n'a plus le droit d'agir (vérifier les rôles)",
};
function messageErreur(e: unknown): string {
  // deno-lint-ignore no-explicit-any
  const nom = (e as any)?.cause?.data?.errorName as string | undefined;
  if (nom && ERREURS[nom]) return ERREURS[nom];
  // deno-lint-ignore no-explicit-any
  return (e as any)?.shortMessage || String((e as Error)?.message || e);
}

type Action = 'mint' | 'attester' | 'reclamer';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'non connecté' }, 401);
    const me = who.user.id;

    const { action, world, serial, epoque } = await req.json();
    if (!['mint', 'attester', 'reclamer'].includes(action)) return json({ error: 'action inconnue' }, 400);
    const act = action as Action;
    if (typeof world !== 'string' || !Number.isInteger(serial)) return json({ error: 'requête invalide' }, 400);

    const lim = await admin.rpc('_rate', { me, kind_: 'chaine_' + act, per_s: 0.05, burst: 3 });
    if (lim.error) throw lim.error;
    if (lim.data === false) return json({ error: 'trop de demandes, patiente un instant' }, 429);

    const { data: u, error: uErr } = await admin
      .from('uniques')
      .select('item, vx, vy, vz, created_at, chain_tx, token_id')
      .eq('user_id', me)
      .eq('world', world)
      .eq('serial', serial)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!u || u.item !== 203) return json({ error: 'sceau introuvable' }, 404);
    if (u.vx === null || u.vy === null || u.vz === null) return json({ error: 'coordonnées manquantes' }, 500);

    const SCEAU = Deno.env.get('SCEAU_ADDRESS')! as Address;
    const RESEAU = Deno.env.get('RESEAU_ADDRESS')! as Address;
    const operateur = privateKeyToAccount(Deno.env.get('OPERATOR_PRIVATE_KEY')! as `0x${string}`);
    const transport = http(Deno.env.get('SEPOLIA_RPC_URL')!);
    const lecture = createPublicClient({ chain: sepolia, transport });
    const ecriture = createWalletClient({ chain: sepolia, transport, account: operateur });

    const envoyer = async (sim: { request: Parameters<typeof ecriture.writeContract>[0] }) => {
      const hash = await ecriture.writeContract(sim.request);
      const recu = await lecture.waitForTransactionReceipt({ hash });
      if (recu.status !== 'success') throw new Error('la transaction a échoué');
      return hash;
    };

    if (act === 'mint') {
      if (u.chain_tx) return json({ error: 'déjà frappé', hash: u.chain_tx }, 409);
      const { data: w, error: wErr } = await admin.from('wallets').select('address').eq('user_id', me).maybeSingle();
      if (wErr) throw wErr;
      if (!w?.address) return json({ error: "lie d'abord un wallet" }, 400);
      const forgedAt = BigInt(Math.floor(new Date(u.created_at).getTime() / 1000));
      let sim;
      try {
        sim = await lecture.simulateContract({
          address: SCEAU,
          abi: sceauAbi,
          functionName: 'mint',
          args: [w.address as Address, world, u.vx, u.vy, u.vz, forgedAt],
          account: operateur,
        });
      } catch (e) {
        return json({ error: messageErreur(e) }, 400);
      }
      const hash = await envoyer(sim);
      const up = await admin
        .from('uniques')
        .update({ chain_tx: hash, token_id: sim.result.toString() })
        .eq('user_id', me)
        .eq('world', world)
        .eq('serial', serial);
      if (up.error) throw up.error;
      return json({ hash, tokenId: sim.result.toString() });
    }

    if (!u.chain_tx || !u.token_id) return json({ error: 'pas encore frappé' }, 400);
    const tokenId = BigInt(u.token_id);

    if (act === 'attester') {
      let sim;
      try {
        sim = await lecture.simulateContract({
          address: RESEAU,
          abi: reseauAbi,
          functionName: 'attester',
          args: [tokenId],
          account: operateur,
        });
      } catch (e) {
        return json({ error: messageErreur(e) }, 400);
      }
      return json({ hash: await envoyer(sim) });
    }

    // reclamer
    if (!Number.isInteger(epoque) || epoque < 0) return json({ error: 'époque invalide' }, 400);
    let sim;
    try {
      sim = await lecture.simulateContract({
        address: RESEAU,
        abi: reseauAbi,
        functionName: 'reclamer',
        args: [tokenId, BigInt(epoque)],
        account: operateur,
      });
    } catch (e) {
      return json({ error: messageErreur(e) }, 400);
    }
    return json({ hash: await envoyer(sim) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
