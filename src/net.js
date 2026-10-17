// Network layer: Supabase Realtime (presence + broadcast) for real time,
// "chunks" and "blocks" tables to keep the world, "players" for each player's save.
window.Net = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const handlers = {
    block: [],
    pos: [],
    hit: [],
    chat: [],
    peers: [],
    status: [],
    claim: [],
    frozen: [],
    offer: [],
    sign: [],
    mob: [],
    shot: [],
  };
  let sb = null,
    ch = null,
    world = 'principal',
    me = null,
    online = false,
    userId = null;
  // Positions and PvP hits don't go through the world channel, where every message reaches every
  // player (and Supabase counts one message per receiver): the world is cut into REGION-wide squares,
  // each with its own channel. You send on your square's channel and listen to the 3x3 squares around
  // you, so only players within one square of you receive your moves. Presence carries your square,
  // so a player alone in their part of the world sends nothing at all (14-startup.js).
  const REGION = 96;
  const regions = new Map(); // 'rx,rz' -> channel
  let myRegion = null,
    extraRegion = null; // a far square watched for a few seconds (/join)
  const regionKey = (x, z) => Math.floor(x / REGION) + ',' + Math.floor(z / REGION);
  const near = (a, b) => {
    if (!a || !b) return true; // unknown (an older client): assume near
    const [ax, az] = a.split(',').map(Number),
      [bx, bz] = b.split(',').map(Number);
    return Math.abs(ax - bx) <= 1 && Math.abs(az - bz) <= 1;
  };
  const client = () =>
    sb ||
    (sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 40 } },
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ether-mines:session' },
    }));

  // Account: a guest session is created automatically on first visit, and kept by the browser.
  async function auth() {
    if (!enabled) return null;
    const c = client();
    const { data } = await c.auth.getSession();
    if (data && data.session) {
      // session kept by the browser: check the account still exists (database reset)
      const { data: u, error: ue } = await c.auth.getUser();
      if (!ue && u && u.user) {
        userId = u.user.id;
        return userId;
      }
      await c.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    const { data: d2, error } = await c.auth.signInAnonymously();
    if (error)
      throw new Error(
        /anonymous/i.test(error.message)
          ? 'guest accounts are not enabled in Supabase (Authentication → Sign In / Providers → Allow anonymous sign-ins)'
          : error.message,
      );
    userId = d2.user.id;
    return userId;
  }
  // is this username already taken by another player in this world? (is_username_taken)
  async function isUsernameTaken(w, name) {
    if (!enabled) return false;
    await auth();
    const { data, error } = await client().rpc('is_username_taken', { w, uname: name, uid: userId, previous: null });
    return !error && data === true;
  }
  async function loadPlayer(w) {
    const { data, error } = await client()
      .from('players')
      .select('name,color,state,updated_at,gwei')
      .eq('user_id', userId)
      .eq('world', w)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function savePlayer(w, name, color, state) {
    if (!userId) return false;
    const { error } = await client()
      .from('players')
      .upsert({ user_id: userId, world: w, name, color, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,world' });
    if (error) {
      console.error(error);
      emit('status', /username already taken|players_username/.test(error.message || '') ? 'USERNAME_TAKEN' : 'SAVE_ERROR');
      return false;
    }
    return true;
  }
  // new game: the server clears the save's game state (the record itself stays, with its counters)
  async function deletePlayer(w) {
    const { error } = await client().rpc('act_new_game', { w });
    if (error) throw error;
  }
  async function rpc(fn, args) {
    const { data, error } = await client().rpc(fn, args || {});
    if (error) throw new Error(error.message);
    return data;
  }
  const recoveryCode = () => rpc('set_recovery_code');
  const claimRecovery = code => rpc('claim_recovery', { code });
  // how many nicknames this world has (035_player_count.sql)
  const playerCount = () => rpc('world_player_count', { w: world });
  // one block's story for the block explorer (038_block_history.sql)
  const blockInfo = (px, py, pz) => rpc('block_info', { w: world, px, py, pz });

  const on = (ev, fn) => handlers[ev].push(fn);
  const emit = (ev, ...a) => {
    for (const f of handlers[ev]) {
      try {
        f(...a);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Reads a whole table in pages of 1000 rows.
  async function readAll(table, cols, w, order, filter) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(cols).eq('world', w);
      if (filter) q = filter(q);
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
    world = w;
    me = profile;
    client();
    ch = sb.channel('world:' + w, { config: { broadcast: { self: false }, presence: { key: me.id } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => emit('pos', payload)); // older clients still send here
    // PvP: client-resolved, like mob/animal combat — no loot, no penalty, so nothing to arbitrate server-side
    ch.on('broadcast', { event: 'hit' }, ({ payload }) => emit('hit', payload));
    // blocks and claims: the database is authoritative, every server-validated change arrives here
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: 'world=eq.' + w }, p => {
      const r = p.new;
      if (r && r.x !== undefined)
        emit('block', { x: r.x, y: r.y, z: r.z, id: r.id, by: r.placed_by, name: r.placed_name, serial: r.serial });
    });
    // signs' text (034_signs.sql): written or cleared by their owner, read by everyone
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'signs', filter: 'world=eq.' + w }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new;
      if (r && r.x !== undefined) emit('sign', { x: r.x, y: r.y, z: r.z, text: p.eventType === 'DELETE' ? '' : r.text });
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: 'world=eq.' + w }, p =>
      emit('claim', p.eventType, p.new, p.old),
    );
    // trade offers (008_trades.sql): everyone only receives the ones concerning them
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: 'world=eq.' + w }, p => emit('offer', p.new));
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => emit('chat', payload));
    // chat arbitrated by the server (003_moderation.sql): username and color come from the database
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat', filter: 'world=eq.' + w }, p => {
      const r = p.new;
      if (r && r.user_id !== userId) emit('chat', { id: r.user_id, name: r.name, color: r.color, text: r.text });
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(),
        list = [];
      for (const k in st) {
        // one entry per connection: after a reconnection (or with a second tab) the oldest can be stale,
        // without the square the player is in. Take the newest one that has it.
        const metas = st[k] || [],
          p = [...metas].reverse().find(m => m && m.r) || metas[metas.length - 1];
        if (p) list.push({ id: k, name: p.name, color: p.color, title: p.title || '', look: p.look || '', r: p.r || null, w: p.w || null });
      }
      peersNow = list;
      emit('peers', list);
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the realtime channel is not responding')), 10000);
      ch.subscribe(async status => {
        emit('status', status);
        if (status === 'SUBSCRIBED') {
          online = true;
          clearTimeout(t);
          await track();
          syncRegions();
          resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!online) {
            clearTimeout(t);
            reject(new Error('connection to the channel refused'));
          }
        }
      });
    });
    return true;
  }

  // Frozen terrain and modified blocks for a rectangular area of chunks (bounds included).
  async function loadArea(cx0, cz0, cx1, cz1, size = 16) {
    const [chunks, edits, signs] = await Promise.all([
      readAll('chunks', 'cx,cz,gen,sy,data', world, ['cx', 'cz'], q => q.gte('cx', cx0).lte('cx', cx1).gte('cz', cz0).lte('cz', cz1)),
      readAll('blocks', 'x,y,z,id,placed_by,placed_name,serial', world, ['x', 'y', 'z'], q =>
        q
          .gte('x', cx0 * size)
          .lt('x', (cx1 + 1) * size)
          .gte('z', cz0 * size)
          .lt('z', (cz1 + 1) * size),
      ),
      // signs in the area; an older database without the table just has none
      readAll('signs', 'x,y,z,text', world, ['x', 'y', 'z'], q =>
        q
          .gte('x', cx0 * size)
          .lt('x', (cx1 + 1) * size)
          .gte('z', cz0 * size)
          .lt('z', (cz1 + 1) * size),
      ).catch(() => []),
    ]);
    return { chunks, edits, signs };
  }

  // r: your square; w: a far square you're watching (/join), so the player there starts sending
  const track = () =>
    ch.track({
      name: me.name,
      color: me.color,
      title: me.title || '',
      look: me.look || '',
      r: myRegion,
      w: extraRegion ? extraRegion.k : null,
    });
  function syncRegions() {
    if (!sb || !online) return;
    const want = new Set();
    if (myRegion) {
      const [rx, rz] = myRegion.split(',').map(Number);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) want.add(rx + dx + ',' + (rz + dz));
    }
    if (extraRegion && extraRegion.until > Date.now()) want.add(extraRegion.k);
    for (const [k, c] of regions)
      if (!want.has(k)) {
        sb.removeChannel(c);
        regions.delete(k);
      }
    for (const k of want)
      if (!regions.has(k)) {
        const c = sb.channel('world:' + world + ':r:' + k, { config: { broadcast: { self: false } } });
        c.on('broadcast', { event: 'pos' }, ({ payload }) => emit('pos', payload));
        c.on('broadcast', { event: 'hit' }, ({ payload }) => emit('hit', payload));
        c.on('broadcast', { event: 'mob' }, ({ payload }) => emit('mob', payload)); // a blow on a shared mob (16-mobs.js)
        c.on('broadcast', { event: 'shot' }, ({ payload }) => emit('shot', payload)); // a plasma bolt fired nearby, to draw (16-mobs.js)
        c.subscribe();
        regions.set(k, c);
      }
  }
  // called with your position: returns true when you just entered another square
  function setRegion(x, z) {
    const k = regionKey(x, z);
    if (extraRegion && extraRegion.until <= Date.now()) {
      extraRegion = null;
      syncRegions();
      if (ch && online) track().catch(() => {});
    }
    if (k === myRegion) return false;
    myRegion = k;
    syncRegions();
    if (ch && online) track().catch(() => {});
    return true;
  }
  // listen to a far square for a while (to find a player's exact position before joining them)
  function watchRegion(k, ms = 8000) {
    extraRegion = { k, until: Date.now() + ms };
    syncRegions();
    if (ch && online) track().catch(() => {});
  }
  const sendRegion = (event, payload) => {
    const c = myRegion && regions.get(myRegion);
    if (c && online) c.send({ type: 'broadcast', event, payload });
  };
  const sendPos = p => sendRegion('pos', p);
  const sendHit = p => sendRegion('hit', p);
  // a blow on a mob, for the players nearby; nothing goes out when nobody is (anyoneNear needs peers)
  let peersNow = [];
  const sendMob = p => {
    if (anyoneNear(peersNow)) sendRegion('mob', p);
  };
  // a plasma bolt you fired, so the players nearby see it fly (only drawn there: hits still go through 'hit')
  const sendShot = p => {
    if (anyoneNear(peersNow)) sendRegion('shot', p);
  };
  // is anyone else close enough to receive your moves?
  const anyoneNear = peers => peers.some(p => p.id !== me?.id && (near(p.r, myRegion) || (p.w && near(p.w, myRegion))));
  // Chat: through the server if act_chat exists; otherwise (003 not run yet) direct broadcast like before.
  let serverChat = true;
  async function chat(text) {
    if (!ch || !online) return { ok: false, err: 'offline' };
    if (serverChat && userId) {
      const { data, error } = await sb.rpc('act_chat', { w: world, msg: text });
      if (!error) return data;
      if (!/act_chat|function|schema cache/i.test(error.message || '')) throw new Error(error.message);
      serverChat = false;
    }
    ch.send({ type: 'broadcast', event: 'chat', payload: { id: me.id, name: me.name, color: me.color, text } });
    return { ok: true, text };
  }
  // Game errors sent to the server (client_errors table), never getting in the way of the game.
  async function logError(msg, stack, src) {
    if (!sb || !userId) return;
    try {
      await sb.rpc('log_error', { w: world, msg, stack: stack || null, src: src || null, ua: navigator.userAgent });
    } catch (e) {}
  }

  // Actions arbitrated by the server (the schema's act_* functions). Chunk not frozen yet: freeze it then retry.
  async function act(name, args) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await sb.rpc('act_' + name, { w: world, ...args });
      if (!error) return data;
      const m = /freeze:(-?\d+),(-?\d+)/.exec(error.message || '');
      if (!m || attempt) throw new Error(error.message);
      await freeze(+m[1], +m[2]);
    }
  }
  async function freeze(cx, cz) {
    const { data, error } = await sb.functions.invoke('freeze', { body: { world, cx, cz } });
    if (error) throw new Error('freeze: ' + (error.message || error));
    if (data && data.data) emit('frozen', cx, cz, data);
    return data;
  }
  async function loadInventory() {
    const [inv, uni] = await Promise.all([
      sb.from('inventory').select('item,n').eq('world', world).eq('user_id', userId),
      sb.from('uniques').select('serial,item,place,mined,created_at,validator_id').eq('world', world).eq('user_id', userId).order('serial'),
    ]);
    if (inv.error) throw inv.error;
    if (uni.error) throw uni.error;
    return { inv: inv.data, uniques: uni.data };
  }
  async function loadCosmetics() {
    const { data, error } = await sb.from('cosmetics_owned').select('cosmetic_id').eq('world', world).eq('user_id', userId);
    if (error) throw error;
    return data.map(r => r.cosmetic_id);
  }
  // A player's owned validators, with their current state — fetched on demand (the Validators tab),
  // not streamed in real time like blocks/claims.
  // the AND/OR/NOT gates placed by you that still stand: the Circuits chapter's proof (029_chapters.sql)
  async function loadMyGates() {
    const { data, error } = await sb.from('blocks').select('id').eq('world', world).eq('placed_by', userId).gte('id', 112).lte('id', 123);
    if (error) throw error;
    return data;
  }
  async function loadValidators() {
    const { data, error } = await sb.from('validators').select('*').eq('world', world).eq('owner', userId);
    if (error) throw error;
    return data;
  }
  // the title shown under your name to the other players (presence: re-tracked when it changes)
  function setTitle(t) {
    if (!me || (me.title || '') === (t || '')) return;
    me.title = t || '';
    if (ch && online) track().catch(() => {});
  }
  // what you wear (17-looks.js lookCode), and your outfit color: re-tracked when either changes
  // (me is the game's own ME object, so its color is already the current one)
  let lastLook = '';
  function setLook(code) {
    if (!me) return;
    me.look = code;
    if (lastLook === code + '|' + me.color) return;
    lastLook = code + '|' + me.color;
    if (ch && online) track().catch(() => {});
  }
  const loadClaims = () => readAll('claims', 'cx,cz,owner,owner_name,members', world, ['cx', 'cz']);

  // A chunk's original terrain, if it has already been frozen.
  async function fetchChunk(cx, cz) {
    if (!sb) return null;
    const { data, error } = await sb.from('chunks').select('gen,sy,data').eq('world', world).eq('cx', cx).eq('cz', cz).maybeSingle();
    if (error) throw error;
    return data;
  }
  return {
    enabled,
    auth,
    loadPlayer,
    isUsernameTaken,
    savePlayer,
    deletePlayer,
    recoveryCode,
    playerCount,
    blockInfo,
    claimRecovery,
    get userId() {
      return userId;
    },
    join,
    on,
    sendPos,
    sendHit,
    sendMob,
    sendShot,
    setRegion,
    setLook,
    watchRegion,
    anyoneNear,
    chat,
    logError,
    act,
    freeze,
    loadInventory,
    loadCosmetics,
    loadValidators,
    loadMyGates,
    setTitle,
    loadClaims,
    fetchChunk,
    loadArea,
    get online() {
      return online;
    },
    get world() {
      return world;
    },
  };
})();
