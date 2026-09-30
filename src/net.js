// Couche réseau : Supabase Realtime (présence + diffusion) pour le temps réel,
// table « blocks » pour garder le monde entre deux parties.
window.Net = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const handlers = { block: [], pos: [], chat: [], peers: [], status: [] };
  let sb = null, ch = null, world = 'principal', me = null, online = false;

  const on = (ev, fn) => handlers[ev].push(fn);
  const emit = (ev, ...a) => { for (const f of handlers[ev]) { try { f(...a); } catch (e) { console.error(e); } } };

  async function loadEdits(w) {
    const edits = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('blocks')
        .select('idx,id,placed_by,placed_name,serial')
        .eq('world', w).order('idx').range(from, from + 999);
      if (error) throw error;
      edits.push(...data);
      if (data.length < 1000) break;
    }
    return edits;
  }

  async function join(w, profile) {
    if (!enabled) return { edits: [] };
    world = w; me = profile;
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
    const edits = await loadEdits(w);
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
    return { edits };
  }

  const sendPos = (p) => { if (ch && online) ch.send({ type: 'broadcast', event: 'pos', payload: p }); };
  const chat = (text) => { if (ch && online) ch.send({ type: 'broadcast', event: 'chat', payload: { id: me.id, name: me.name, color: me.color, text } }); };

  async function setBlock(b) {
    if (!ch || !online) return;
    ch.send({ type: 'broadcast', event: 'block', payload: b });
    const { error } = await sb.from('blocks').upsert({
      world, idx: b.idx, id: b.id,
      placed_by: b.by || null, placed_name: b.name || null, serial: b.serial || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'world,idx' });
    if (error) { console.error(error); emit('status', 'SAVE_ERROR'); }
  }

  return { enabled, join, on, sendPos, chat, setBlock, get online() { return online; }, get world() { return world; } };
})();
