// "freeze" function: generates a chunk's original terrain server-side and saves it once and for all.
// Players can't write to the chunks table: terrain always comes from the official generator (GEN 5: the City).
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
    // only signed-in players (guest accounts included) can freeze terrain
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return json({ error: 'not signed in' }, 401);

    const { world, cx, cz } = await req.json();
    if (typeof world !== 'string' || !/^[a-z0-9-]{1,32}$/.test(world)) return json({ error: 'invalid world' }, 400);
    // per-player rate limit (002_security.sql opens _rate to the service role): against database filling
    const lim = await admin.rpc('_rate', { me: who.user.id, kind_: 'freeze', per_s: 3, burst: 80 });
    if (lim.error) return json({ error: 'rate limit unavailable (is the database installed?)' }, 500);
    if (lim.data === false) return json({ error: 'too much terrain requested, wait a moment' }, 429);
    if (!Number.isInteger(cx) || !Number.isInteger(cz) || Math.abs(cx * World.CH) >= World.LIMIT || Math.abs(cz * World.CH) >= World.LIMIT)
      return json({ error: 'invalid chunk' }, 400);

    const read = () => admin.from('chunks').select('gen,sy,data').eq('world', world).eq('cx', cx).eq('cz', cz).maybeSingle();
    let { data, error } = await read();
    if (error) throw error;
    if (!data) {
      const row = { world, cx, cz, gen: World.GEN, sy: World.SY, data: World.encodeChunk(World.genChunk(cx, cz)) };
      const ins = await admin.from('chunks').upsert(row, { onConflict: 'world,cx,cz', ignoreDuplicates: true });
      if (ins.error) throw ins.error;
      ({ data, error } = await read()); // first one in wins
      if (error) throw error;
    }
    return json(data);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
