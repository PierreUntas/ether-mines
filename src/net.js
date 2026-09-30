// Couche réseau : Supabase Realtime (présence + diffusion) pour le temps réel,
// table « blocks » pour garder le monde entre deux parties.
window.Net = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const handlers = { block: [], pos: [], chat: [], peers: [], status: [] };
  let sb = null, ch = null, world = 'principal', me = null, online = false;

  const on = (ev, fn) => handlers[ev].push(fn);
  const emit = (ev, ...a) => { for (const f of handlers[ev]) { try { f(...a); } catch (e) { console.error(e); } } };

  // Lit une table entière par pages de 1000 lignes.
  async function readAll(table, cols, w, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(cols).eq('world', w);
      for (const o of order) q = q.order(o);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }

  async function join(w, profile) {
    if (!enabled) return { edits: [] };
    world = w; me = profile;
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
    const [edits, chunks] = await Promise.all([
      readAll('blocks', 'x,y,z,id,placed_by,placed_name,serial', w, ['x', 'y', 'z']),
      readAll('chunks', 'cx,cz,gen,sy,data', w, ['cx', 'cz']),
    ]);
    ch = sb.channel('monde:' + w, { config: { broadcast: { self: false }, presence: { key: me.id } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => emit('pos', payload));
    ch.on('broadcast', { event: 'block' }, ({ payload }) => emit('block', payload));
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => emit('chat', payload));
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(), list = [];
      for (const k in st) { const p = st[k][0]; if (p) list.push({ id: k, name: p.name, color: p.color }); }
      emit('peers', list);
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('le salon temps réel ne répond pas')), 10000);
      ch.subscribe(async (status) => {
        emit('status', status);
        if (status === 'SUBSCRIBED') { online = true; clearTimeout(t); await ch.track({ name: me.name, color: me.color }); resolve(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (!online) { clearTimeout(t); reject(new Error('connexion au salon refusée')); } }
      });
    });
    return { edits, chunks };
  }

  const sendPos = (p) => { if (ch && online) ch.send({ type: 'broadcast', event: 'pos', payload: p }); };
  const chat = (text) => { if (ch && online) ch.send({ type: 'broadcast', event: 'chat', payload: { id: me.id, name: me.name, color: me.color, text } }); };

  async function setBlock(b) {
    if (!ch || !online) return;
    ch.send({ type: 'broadcast', event: 'block', payload: b });
    const { error } = await sb.from('blocks').upsert({
      world, x: b.x, y: b.y, z: b.z, id: b.id,
      placed_by: b.by || null, placed_name: b.name || null, serial: b.serial || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'world,x,y,z' });
    if (error) { console.error(error); emit('status', 'SAVE_ERROR'); }
  }

  // Terrain d'origine d'un tronçon : écrit une seule fois (le premier arrivé gagne), jamais modifié ensuite.
  async function fetchChunk(cx, cz) {
    if (!sb) return null;
    const { data, error } = await sb.from('chunks').select('gen,sy,data').eq('world', world).eq('cx', cx).eq('cz', cz).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function freezeChunk(c) {
    if (!sb) return null;
    const { error } = await sb.from('chunks').upsert({ world, ...c }, { onConflict: 'world,cx,cz', ignoreDuplicates: true });
    if (error) { console.error(error); emit('status', 'SAVE_ERROR'); }
    return fetchChunk(c.cx, c.cz);
  }

  return { enabled, join, on, sendPos, chat, setBlock, freezeChunk, fetchChunk, get online() { return online; }, get world() { return world; } };
})();
