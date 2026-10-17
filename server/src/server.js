// Ether Mines · game server: the players' real-time traffic in one place.
//
// The browsers connect over a WebSocket (src/net.js, CONFIG.GAME_SERVER). Each one proves who it is with
// its Supabase session token: the server asks Supabase whose token it is, and reads that player's
// nickname and color from the database with the same token (players can only read their own row). From
// then on the server knows, for every world, who is connected and where they stand, and it decides who
// receives what: your moves go to the players around you, a blow on a player only to that player (if
// they really are in reach), a blow on a mob and a plasma shot to the players nearby. Every player gets
// the list of the others, with their position, every two seconds (the "online" badge, /join).
//
// Nothing here is saved: the world, inventories and accounts stay in Supabase, behind its act_*
// functions, exactly as before. This server only replaces Supabase Realtime's presence and region
// channels, which could leave two players side by side without seeing each other.
//
// Configuration (environment variables): PORT (8080), SUPABASE_URL, SUPABASE_ANON_KEY (the public key,
// the same as src/config.js), ALLOWED_ORIGINS (comma-separated; empty = any). AUTH_MODE=test (tests only)
// accepts tokens of the form "test:<id>:<name>" without asking Supabase.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

export const PROTOCOL = 1;
// how far (horizontally, in blocks) each kind of message travels
const RANGE = { pos: 160, mob: 64, shot: 96, hitMelee: 8, hitRanged: 40 };
const REGION = 96; // the old region squares (src/net.js), still sent so older code paths keep working
const PEERS_EVERY = 2000; // ms between two lists of players with their positions
const MAX_MSG = 2048; // bytes
const RATE = { perSec: 40, burst: 80 }; // messages a connection may send
const WORLD_RE = /^[a-z0-9-]{1,32}$/;

const num = (v, lim = 1e6) => (Number.isFinite(v) && Math.abs(v) <= lim ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const regionKey = (x, z) => Math.floor(x / REGION) + ',' + Math.floor(z / REGION);

// who owns this token, and their nickname and color in this world
async function verifySupabase(cfg, token, world) {
  const h = { apikey: cfg.anonKey, Authorization: 'Bearer ' + token };
  const u = await fetch(cfg.supabaseUrl + '/auth/v1/user', { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user || !user.id) return null;
  const q = `${cfg.supabaseUrl}/rest/v1/players?select=name,color&user_id=eq.${encodeURIComponent(user.id)}&world=eq.${encodeURIComponent(world)}`;
  const r = await fetch(q, { headers: h });
  if (!r.ok) return null;
  const rows = await r.json();
  const row = rows && rows[0];
  if (!row || !row.name) return null;
  return { id: user.id, name: row.name, color: row.color || '#8a7bef' };
}
function verifyTest(token) {
  const m = /^test:([\w-]{1,64}):(.{1,20})$/.exec(token || '');
  return m ? { id: m[1], name: m[2], color: '#8a7bef' } : null;
}

// the pages allowed to connect: exact origins, "*.vercel.app" (any preview), "http://localhost:*" (any port)
export function originOk(list, origin) {
  if (!list.length) return true;
  if (!origin) return false;
  return list.some(o =>
    o.startsWith('*.') ? origin.startsWith('https://') && origin.endsWith(o.slice(1)) : o.endsWith(':*') ? origin.startsWith(o.slice(0, -1)) : origin === o,
  );
}
export function createGameServer(opts = {}) {
  const cfg = {
    port: opts.port ?? +(process.env.PORT || 8080),
    supabaseUrl: (opts.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    anonKey: opts.anonKey ?? process.env.SUPABASE_ANON_KEY ?? '',
    authMode: opts.authMode ?? process.env.AUTH_MODE ?? 'supabase',
    origins: (opts.origins ?? process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    log: opts.log ?? (m => console.log(new Date().toISOString(), m)),
  };
  const verify = cfg.authMode === 'test' ? (t, w) => Promise.resolve(verifyTest(t, w)) : (t, w) => verifySupabase(cfg, t, w);
  const worlds = new Map(); // world -> Map(id -> player)
  const stats = { connections: 0, messages: 0 };

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      const players = [...worlds.values()].reduce((n, m) => n + m.size, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, players, worlds: worlds.size, ...stats }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MSG,
    verifyClient: ({ origin }) => originOk(cfg.origins, origin),
  });

  const send = (p, msg) => {
    if (p.ws.readyState === 1) p.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  };
  const peerOf = p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    title: p.title,
    look: p.look,
    x: p.pos ? Math.round(p.pos.x) : null,
    y: p.pos ? Math.round(p.pos.y) : null,
    z: p.pos ? Math.round(p.pos.z) : null,
    r: p.pos ? regionKey(p.pos.x, p.pos.z) : null,
  });
  function sendPeers(world) {
    const m = worlds.get(world);
    if (!m) return;
    const msg = JSON.stringify({ t: 'peers', list: [...m.values()].map(peerOf) });
    for (const p of m.values()) send(p, msg);
  }
  // to everyone in the same world within `range` blocks of `from` (not `from` itself)
  function relay(from, range, msg) {
    const m = worlds.get(from.world);
    if (!m || !from.pos) return;
    const s = JSON.stringify(msg);
    for (const p of m.values()) {
      if (p === from || !p.pos) continue;
      if (Math.hypot(p.pos.x - from.pos.x, p.pos.z - from.pos.z) <= range) send(p, s);
    }
  }
  const tick = setInterval(() => {
    for (const w of worlds.keys()) sendPeers(w);
  }, PEERS_EVERY);
  // a dead connection (a closed laptop) is dropped after a missed ping
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.alive === false) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 15000);

  wss.on('connection', ws => {
    stats.connections++;
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    let me = null,
      pending = false,
      tokens = RATE.burst,
      last = Date.now();
    const bye = reason => {
      try {
        ws.send(JSON.stringify({ t: 'bye', reason }));
      } catch {}
      ws.close(4000, reason);
    };
    const leave = () => {
      if (!me) return;
      const m = worlds.get(me.world);
      if (m && m.get(me.id) === me) {
        m.delete(me.id);
        if (!m.size) worlds.delete(me.world);
        else sendPeers(me.world);
      }
      me = null;
    };
    ws.on('close', leave);
    ws.on('message', async raw => {
      stats.messages++;
      // a token bucket: a burst is fine, a flood is cut off
      const now = Date.now();
      tokens = Math.min(RATE.burst, tokens + ((now - last) / 1000) * RATE.perSec);
      last = now;
      if (tokens < 1) return;
      tokens--;
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (!me) {
        if (m.t !== 'hello' || pending) return;
        if (m.v !== PROTOCOL) return bye('version');
        const world = str(m.world, 32);
        if (!WORLD_RE.test(world)) return bye('world');
        pending = true;
        let who = null;
        try {
          who = await verify(str(m.token, 4096), world);
        } catch (e) {
          cfg.log('auth error: ' + e.message);
        }
        pending = false;
        if (!who) return bye('auth');
        if (ws.readyState !== 1) return;
        if (!worlds.has(world)) worlds.set(world, new Map());
        const room = worlds.get(world);
        // the same account connected twice (a second tab, a reconnection): the newest one wins
        const old = room.get(who.id);
        if (old) {
          old.replaced = true;
          send(old, { t: 'bye', reason: 'elsewhere' });
          old.ws.close(4001, 'elsewhere');
        }
        me = { ...who, world, ws, title: str(m.title, 40), look: str(m.look, 200), pos: null };
        room.set(me.id, me);
        send(me, { t: 'welcome', id: me.id, name: me.name, color: me.color, protocol: PROTOCOL });
        sendPeers(world);
        return;
      }
      if (m.t === 'pos') {
        const x = num(m.x, 1e5),
          y = num(m.y, 1e3),
          z = num(m.z, 1e5);
        if (x === null || y === null || z === null) return;
        me.pos = { x, y, z };
        // what the others need to draw you: position and look, what you hold, mining, guard, hovercraft
        relay(me, RANGE.pos, {
          t: 'pos',
          id: me.id,
          name: me.name,
          color: me.color,
          x,
          y,
          z,
          yaw: num(m.yaw, 100) ?? 0,
          pitch: num(m.pitch, 100) ?? 0,
          m: !!m.m,
          h: Number.isInteger(m.h) ? m.h : 0,
          gd: m.gd ? 1 : 0,
          rd: Number.isInteger(m.rd) ? m.rd : 0,
          on: typeof m.on === 'string' ? m.on.slice(0, 64) : 0,
        });
      } else if (m.t === 'hit') {
        // only to its target, and only if the target really stands within reach of you here
        const room = worlds.get(me.world),
          tgt = room && room.get(str(m.to, 64));
        if (!tgt || !tgt.pos || !me.pos) return;
        const reach = m.item === 206 ? RANGE.hitRanged : RANGE.hitMelee;
        if (Math.hypot(tgt.pos.x - me.pos.x, tgt.pos.z - me.pos.z) > reach) return;
        send(tgt, { t: 'hit', from: me.id, to: tgt.id, x: me.pos.x, y: me.pos.y, z: me.pos.z, item: Number.isInteger(m.item) ? m.item : 0 });
      } else if (m.t === 'mob') {
        relay(me, RANGE.mob, {
          t: 'mob',
          id: str(m.id, 80),
          dmg: num(m.dmg, 1e4) ?? 0,
          hp: num(m.hp, 1e5) ?? 0,
          x: num(m.x, 1e5) ?? 0,
          y: num(m.y, 1e3) ?? 0,
          z: num(m.z, 1e5) ?? 0,
          fx: num(m.fx, 1e5) ?? 0,
          fz: num(m.fz, 1e5) ?? 0,
        });
      } else if (m.t === 'shot') {
        const s = { t: 'shot', id: me.id };
        for (const k of ['x', 'y', 'z', 'dx', 'dy', 'dz']) s[k] = num(m[k], 1e5) ?? 0;
        relay(me, RANGE.shot, s);
      } else if (m.t === 'look') {
        me.title = str(m.title, 40);
        me.look = str(m.look, 200);
        sendPeers(me.world);
      }
    });
  });

  let closed = false;
  return {
    http,
    worlds,
    stats,
    listen: () =>
      new Promise(res =>
        http.listen(cfg.port, () => {
          cfg.log(`game server on :${http.address().port} (protocol ${PROTOCOL}, auth ${cfg.authMode})`);
          res(http.address().port);
        }),
      ),
    close: () =>
      new Promise(res => {
        if (closed) return res();
        closed = true;
        clearInterval(tick);
        clearInterval(pinger);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        http.close(() => res());
      }),
  };
}

// run directly: node src/server.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = createGameServer();
  s.listen();
  const stop = () => s.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
