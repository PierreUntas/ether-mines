// Couche réseau : Supabase Realtime (présence + diffusion) pour le temps réel,
// tables « chunks » et « blocks » pour garder le monde, « players » pour la partie de chaque joueur.
window.Net = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const handlers = { block: [], pos: [], chat: [], peers: [], status: [], claim: [], frozen: [], offer: [] };
  let sb = null,
    ch = null,
    world = 'principal',
    me = null,
    online = false,
    userId = null;
  const client = () =>
    sb ||
    (sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 40 } },
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ether-mines:session' },
    }));

  // Compte : une session invitée est créée automatiquement au premier passage, et gardée par le navigateur.
  async function auth() {
    if (!enabled) return null;
    const c = client();
    const { data } = await c.auth.getSession();
    if (data && data.session) {
      // session gardée par le navigateur : on vérifie que le compte existe encore (remise à zéro de la base)
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
          ? 'les comptes invités ne sont pas activés dans Supabase (Authentication → Sign In / Providers → Allow anonymous sign-ins)'
          : error.message,
      );
    userId = d2.user.id;
    return userId;
  }
  // le pseudo est-il déjà celui d'un autre joueur de ce monde ? (pseudo_pris, 008_durcissement.sql)
  async function pseudoPris(w, n) {
    if (!enabled) return false;
    await auth();
    const { data, error } = await client().rpc('pseudo_pris', { w, n, uid: userId, ancien: null });
    return !error && data === true;
  }
  async function loadPlayer(w) {
    const { data, error } = await client()
      .from('players')
      .select('name,color,state,updated_at')
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
      emit('status', /pseudo déjà pris|players_pseudo/.test(error.message || '') ? 'PSEUDO_PRIS' : 'SAVE_ERROR');
      return false;
    }
    return true;
  }
  // nouvelle partie : le serveur efface l'état de jeu de la fiche (la fiche elle-même reste, avec ses compteurs)
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

  // Lit une table entière par pages de 1000 lignes.
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
    ch = sb.channel('monde:' + w, { config: { broadcast: { self: false }, presence: { key: me.id } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => emit('pos', payload));
    // blocs et parcelles : la base fait foi, chaque changement validé par le serveur arrive ici
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: 'world=eq.' + w }, p => {
      const r = p.new;
      if (r && r.x !== undefined)
        emit('block', { x: r.x, y: r.y, z: r.z, id: r.id, by: r.placed_by, name: r.placed_name, serial: r.serial });
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: 'world=eq.' + w }, p =>
      emit('claim', p.eventType, p.new, p.old),
    );
    // offres d'échange (011_echanges.sql) : chacun ne reçoit que celles qui le concernent
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: 'world=eq.' + w }, p => emit('offer', p.new));
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => emit('chat', payload));
    // chat arbitré par le serveur (003_moderation.sql) : pseudo et couleur viennent de la base
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat', filter: 'world=eq.' + w }, p => {
      const r = p.new;
      if (r && r.user_id !== userId) emit('chat', { id: r.user_id, name: r.name, color: r.color, text: r.text });
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(),
        list = [];
      for (const k in st) {
        const p = st[k][0];
        if (p) list.push({ id: k, name: p.name, color: p.color });
      }
      emit('peers', list);
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('le salon temps réel ne répond pas')), 10000);
      ch.subscribe(async status => {
        emit('status', status);
        if (status === 'SUBSCRIBED') {
          online = true;
          clearTimeout(t);
          await ch.track({ name: me.name, color: me.color });
          resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!online) {
            clearTimeout(t);
            reject(new Error('connexion au salon refusée'));
          }
        }
      });
    });
    return true;
  }

  // Terrain figé et blocs modifiés d'une zone rectangulaire de tronçons (bornes incluses).
  async function loadArea(cx0, cz0, cx1, cz1, size = 16) {
    const [chunks, edits] = await Promise.all([
      readAll('chunks', 'cx,cz,gen,sy,data', world, ['cx', 'cz'], q => q.gte('cx', cx0).lte('cx', cx1).gte('cz', cz0).lte('cz', cz1)),
      readAll('blocks', 'x,y,z,id,placed_by,placed_name,serial', world, ['x', 'y', 'z'], q =>
        q
          .gte('x', cx0 * size)
          .lt('x', (cx1 + 1) * size)
          .gte('z', cz0 * size)
          .lt('z', (cz1 + 1) * size),
      ),
    ]);
    return { chunks, edits };
  }

  const sendPos = p => {
    if (ch && online) ch.send({ type: 'broadcast', event: 'pos', payload: p });
  };
  // Chat : par le serveur si act_chat existe ; sinon (003 pas encore lancé) diffusion directe comme avant.
  let chatServeur = true;
  async function chat(text) {
    if (!ch || !online) return { ok: false, err: 'hors ligne' };
    if (chatServeur && userId) {
      const { data, error } = await sb.rpc('act_chat', { w: world, msg: text });
      if (!error) return data;
      if (!/act_chat|function|schema cache/i.test(error.message || '')) throw new Error(error.message);
      chatServeur = false;
    }
    ch.send({ type: 'broadcast', event: 'chat', payload: { id: me.id, name: me.name, color: me.color, text } });
    return { ok: true, text };
  }
  // Erreurs du jeu envoyées au serveur (table client_errors), sans jamais gêner la partie.
  async function logError(msg, stack, src) {
    if (!sb || !userId) return;
    try {
      await sb.rpc('log_error', { w: world, msg, stack: stack || null, src: src || null, ua: navigator.userAgent });
    } catch (e) {}
  }

  // Actions arbitrées par le serveur (fonctions act_* du schéma). Tronçon pas encore figé : on le fait figer puis on réessaie.
  async function act(name, args) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await sb.rpc('act_' + name, { w: world, ...args });
      if (!error) return data;
      const m = /figer:(-?\d+),(-?\d+)/.exec(error.message || '');
      if (!m || attempt) throw new Error(error.message);
      await freeze(+m[1], +m[2]);
    }
  }
  async function freeze(cx, cz) {
    const { data, error } = await sb.functions.invoke('figer', { body: { world, cx, cz } });
    if (error) throw new Error('figer : ' + (error.message || error));
    if (data && data.data) emit('frozen', cx, cz, data);
    return data;
  }
  async function loadInventory() {
    const [inv, uni] = await Promise.all([
      sb.from('inventory').select('item,n').eq('world', world).eq('user_id', userId),
      sb.from('uniques').select('serial,item,place,mined,created_at').eq('world', world).eq('user_id', userId).order('serial'),
    ]);
    if (inv.error) throw inv.error;
    if (uni.error) throw uni.error;
    return { inv: inv.data, uniques: uni.data };
  }
  const loadClaims = () => readAll('claims', 'cx,cz,owner,owner_name,members', world, ['cx', 'cz']);

  // Terrain d'origine d'un tronçon, s'il a déjà été figé.
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
    pseudoPris,
    savePlayer,
    deletePlayer,
    recoveryCode,
    claimRecovery,
    get userId() {
      return userId;
    },
    join,
    on,
    sendPos,
    chat,
    logError,
    act,
    freeze,
    loadInventory,
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
