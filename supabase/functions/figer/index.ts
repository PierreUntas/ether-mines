// Fonction « figer » : génère côté serveur le terrain d'origine d'un tronçon et l'enregistre une fois pour toutes.
// Les joueurs ne peuvent pas écrire dans la table chunks : le terrain vient toujours du générateur officiel (GEN 5 : la Cité).
import '../_shared/world.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
const World = (globalThis as any).World;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // seuls les joueurs connectés (comptes invités compris) peuvent faire figer du terrain
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'non connecté' }, 401);

    const { world, cx, cz } = await req.json();
    if (typeof world !== 'string' || !/^[a-z0-9-]{1,32}$/.test(world)) return json({ error: 'monde invalide' }, 400);
    // limite de rythme par joueur (008_durcissement.sql ouvre _rate au rôle de service) : contre le remplissage de la base
    const lim = await admin.rpc('_rate', { me: who.user.id, kind_: 'figer', per_s: 3, burst: 80 });
    if (lim.error) return json({ error: 'limite de rythme indisponible (lancer 008_durcissement.sql)' }, 500);
    if (lim.data === false) return json({ error: 'trop de terrain demandé, patiente un instant' }, 429);
    if (!Number.isInteger(cx) || !Number.isInteger(cz) || Math.abs(cx * World.CH) >= World.LIMITE || Math.abs(cz * World.CH) >= World.LIMITE)
      return json({ error: 'tronçon invalide' }, 400);

    const read = () => admin.from('chunks').select('gen,sy,data').eq('world', world).eq('cx', cx).eq('cz', cz).maybeSingle();
    let { data, error } = await read();
    if (error) throw error;
    if (!data) {
      const row = { world, cx, cz, gen: World.GEN, sy: World.SY, data: World.encodeChunk(World.genChunk(cx, cz)) };
      const ins = await admin.from('chunks').upsert(row, { onConflict: 'world,cx,cz', ignoreDuplicates: true });
      if (ins.error) throw ins.error;
      ({ data, error } = await read()); // le premier arrivé gagne
      if (error) throw error;
    }
    return json(data);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
