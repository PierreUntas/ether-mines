// Ether Mines · game server: the players' real-time traffic in one place.
//
// The browsers connect over a WebSocket (src/net.js, CONFIG.GAME_SERVER). Each one proves who it is with
// its Supabase session token: the server asks Supabase whose token it is, and reads that player's
// nickname and color from the database with the same token (players can only read their own row). From
// then on the server knows, for every world, who is connected and where they stand, and it decides who
// receives what: your moves go to the players around you, a blow on a player only to that player (if
// they really are in reach), a blow on a mob and a plasma shot to the players nearby. Every player gets
// the list of the others, with their position, every two seconds (the "online" badge, /join). PvP blows
// and the mobs' health are settled here (see WEAPONS and MOB_HP below).
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
// PvP, settled here (step 2): the weapons' damage (ITEM[id].dmg in supabase/functions/_shared/rules.js; a
// test checks they match), 40% of it between players and at least one heart, like the game always did
export const WEAPONS = { 106: 2.5, 107: 5, 301: 7.5, 206: 4 };
export const pvpDamage = item => Math.max(1, Math.round((WEAPONS[item] || 1) * 0.4));
const PISTOL = 206;
const COOLDOWN = { melee: 450, ranged: 300 }; // ms between two blows (the game's own: 0.45 s, 0.35 s)
const OWNED_EVERY = 60000; // ms between two looks at a player's weapons
const OWNED_RETRY = 10000; // ...or sooner when they use one we didn't know about (just crafted)
// Mobs (step 3): their health lives here. Each screen still moves its own copy of a mob, but a blow is
// sent here, checked (the weapon you have, its pace, its reach) and taken off the mob's health, and
// everyone nearby, the striker included, gets the health left. The server alone says when a mob dies,
// who took part (the loot), and keeps it dead until it comes back (2 minutes, 25 s for a network attack's
// node). The mobs' full health is MK[type].hp in src/game/16-mobs.js (a test checks they match).
export const MOB_HP = {
  shadow: 10,
  guardian: 19,
  sentinel: 14,
  wraith: 22,
  titan: 120,
  warden: 16,
  turret: 12,
  plasma_core: 45,
  garden_guardian: 15,
  prowler: 11,
  sky_raider: 12,
  water_lurker: 17,
  bat: 9,
  crawler: 15,
  golem: 26,
  corrupted_node: 20,
  pow_twin: 60,
  pos_twin: 40,
  front_runner: 170,
  mev_bot: 16,
};
const MOB_ID_RE = /^(-?\d{1,6},-?\d{1,6})\|(\d{1,4})\|([a-z_]{1,20})$/; // chunk | slot | kind (16-mobs.js mobId)
const MOB_RESPAWN = { corrupted_node: 25000 }; // ms; every other mob: 2 minutes
const MOB_RESPAWN_MS = 120000;
const MOB_FORGET = 300000; // a mob nobody struck for 5 minutes is forgotten (back to full health)
const SHARE_MS = 30000; // whoever struck it in the last 30 s gets their own loot
const TWIN_DOWN_MS = 12000; // a Merge twin struck down only sleeps this long, unless its twin falls too
const MOB_SLACK = 0.8; // the pace of blows on a mob, with room for the network's jitter
const RIPOSTE = 1.5; // the most a blow can be raised (a riposte after a parry)
// the Merge twins come as a pair, side by side in their chunk (16-mobs.js: slots 160 and 161)
const twinOf = (k, i, type) => (type === 'pow_twin' ? `${k}|${i + 1}|pos_twin` : type === 'pos_twin' ? `${k}|${i - 1}|pow_twin` : null);

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
// which weapons this player really has: blades in the inventory, the Plasma Pistol among the uniques
async function ownedSupabase(cfg, token, id, world) {
  const h = { apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
    base = `${cfg.supabaseUrl}/rest/v1`,
    who = `user_id=eq.${encodeURIComponent(id)}&world=eq.${encodeURIComponent(world)}`;
  const [inv, uni] = await Promise.all([
    fetch(`${base}/inventory?select=item,n&${who}&item=in.(106,107,301)`, { headers: h }),
    fetch(`${base}/uniques?select=item&${who}&item=eq.${PISTOL}`, { headers: h }),
  ]);
  if (!inv.ok || !uni.ok) return null;
  const set = new Set();
  for (const r of await inv.json()) if (r.n > 0) set.add(r.item);
  for (const r of await uni.json()) set.add(r.item);
  return set;
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
    o.startsWith('*.')
      ? origin.startsWith('https://') && origin.endsWith(o.slice(1))
      : o.endsWith(':*')
        ? origin.startsWith(o.slice(0, -1))
        : origin === o,
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
  // tests: opts.owned(id) gives a player's weapons; by default in test mode, every weapon
  const owned =
    opts.owned ??
    (cfg.authMode === 'test'
      ? () => Promise.resolve(new Set(Object.keys(WEAPONS).map(Number)))
      : p => ownedSupabase(cfg, p.token, p.id, p.world));
  async function refreshOwned(p) {
    if (p.ownedBusy) return;
    p.ownedBusy = true;
    p.ownedAt = Date.now();
    try {
      const set = await owned(p);
      if (set) p.owned = set;
    } catch (e) {
      cfg.log('weapons of ' + p.id + ': ' + e.message);
    }
    p.ownedBusy = false;
  }
  // the weapon a blow is really struck with: the one claimed if this player has it, bare hands otherwise
  function weaponOf(p, item) {
    if (!Number.isInteger(item) || !WEAPONS[item]) return 0;
    if (p.owned && p.owned.has(item)) return item;
    if (Date.now() - (p.ownedAt || 0) > OWNED_RETRY) refreshOwned(p);
    return 0;
  }
  const worlds = new Map(); // world -> Map(id -> player)
  const mobsOf = new Map(); // world -> Map(mob id -> { hp, by: Map(player id -> ms), at, down, deadUntil })
  function mobState(world, id, type, now) {
    if (!mobsOf.has(world)) mobsOf.set(world, new Map());
    const mobs = mobsOf.get(world);
    let s = mobs.get(id);
    if (s && s.deadUntil && now >= s.deadUntil) s = null; // back again
    if (s && s.down && now >= s.down) Object.assign(s, { down: 0, hp: MOB_HP[type] }); // a twin that rose again
    if (!s) mobs.set(id, (s = { hp: MOB_HP[type], by: new Map(), at: now, down: 0, deadUntil: 0 }));
    return s;
  }
  const struckBy = (s, now) => [...s.by].filter(([, t]) => now - t < SHARE_MS).map(([id]) => id);
  // a blow on a mob: checked, settled, and told to everyone nearby (the striker included)
  function mobBlow(me, m) {
    const id = str(m.id, 80),
      r = MOB_ID_RE.exec(id),
      x = num(m.x, 1e5),
      y = num(m.y, 1e3),
      z = num(m.z, 1e5);
    if (!r || !MOB_HP[r[3]] || !me.pos || x === null || y === null || z === null) return;
    const [, k, slot, type] = r,
      now = Date.now(),
      s = mobState(me.world, id, type, now),
      item = weaponOf(me, m.item),
      ranged = item === PISTOL,
      msg = { t: 'mob', id, from: me.id, dmg: 0, hp: s.hp, x, y, z, fx: num(m.fx, 1e5) ?? x, fz: num(m.fz, 1e5) ?? z };
    const pace = now - (me.lastMobHit || 0) >= (ranged ? COOLDOWN.ranged : COOLDOWN.melee) * MOB_SLACK,
      reach = Math.hypot(x - me.pos.x, z - me.pos.z) <= (ranged ? RANGE.hitRanged : RANGE.hitMelee);
    if (s.hp <= 0 || !pace || !reach) {
      // nothing taken off: the striker's screen is put right (a mob already dead, a blow too soon)
      if (s.deadUntil) msg.dead = 1;
      else if (s.down) msg.down = 1;
      return send(me, msg);
    }
    me.lastMobHit = now;
    const base = WEAPONS[item] || 1,
      dmg = Math.max(0, Math.min(num(m.dmg, 1e4) ?? base, base * RIPOSTE));
    s.hp = Math.max(0, +(s.hp - dmg).toFixed(2));
    s.at = now;
    s.by.set(me.id, now);
    Object.assign(msg, { dmg: +dmg.toFixed(2), hp: s.hp });
    if (s.hp <= 0) {
      const tw = twinOf(k, +slot, type),
        o = tw && mobsOf.get(me.world).get(tw);
      if (tw && !(o && o.hp <= 0 && o.down > now)) {
        s.down = now + TWIN_DOWN_MS; // the first twin to fall only sleeps
        msg.down = 1;
      } else {
        const back = now + (MOB_RESPAWN[type] ?? MOB_RESPAWN_MS),
          by = new Set(struckBy(s, now));
        s.deadUntil = back;
        if (o) {
          // both twins down together: both done for, and both paid whoever fought either
          Object.assign(o, { down: 0, deadUntil: back });
          for (const p of struckBy(o, now)) by.add(p);
          msg.both = 1;
        }
        msg.dead = 1;
        msg.by = [...by];
      }
    }
    send(me, msg);
    relay(me, RANGE.mob, msg);
  }
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
    const now = Date.now();
    for (const [w, room] of worlds) {
      sendPeers(w);
      for (const p of room.values()) if (now - (p.ownedAt || 0) > OWNED_EVERY) refreshOwned(p);
    }
    for (const [w, mobs] of mobsOf) {
      for (const [id, s] of mobs) if (s.deadUntil ? now >= s.deadUntil : now - s.at > MOB_FORGET) mobs.delete(id);
      if (!mobs.size) mobsOf.delete(w);
    }
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
        me = {
          ...who,
          world,
          ws,
          token: str(m.token, 4096),
          title: str(m.title, 40),
          look: str(m.look, 200),
          pos: null,
          owned: null,
          lastHit: 0,
          lastMobHit: 0,
        };
        room.set(me.id, me);
        refreshOwned(me);
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
        if (!tgt || tgt === me || !tgt.pos || !me.pos) return;
        // the weapon you really have, its pace, its reach: then the damage, decided here
        const item = weaponOf(me, m.item),
          ranged = item === PISTOL,
          now = Date.now();
        if (now - me.lastHit < (ranged ? COOLDOWN.ranged : COOLDOWN.melee)) return;
        if (Math.hypot(tgt.pos.x - me.pos.x, tgt.pos.z - me.pos.z) > (ranged ? RANGE.hitRanged : RANGE.hitMelee)) return;
        me.lastHit = now;
        send(tgt, { t: 'hit', from: me.id, to: tgt.id, x: me.pos.x, y: me.pos.y, z: me.pos.z, item, dmg: pvpDamage(item) });
      } else if (m.t === 'mob') {
        if ('item' in m) return mobBlow(me, m);
        // an older page (before step 3): its blow is only passed on, as before
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
        if (weaponOf(me, PISTOL) !== PISTOL) return; // no pistol, no bolt to show
        const s = { t: 'shot', id: me.id };
        for (const k of ['x', 'y', 'z', 'dx', 'dy', 'dz']) s[k] = num(m[k], 1e5) ?? 0;
        relay(me, RANGE.shot, s);
      } else if (m.t === 'token') {
        // the browser's session token, renewed every hour: kept to look at the weapons again later
        me.token = str(m.token, 4096) || me.token;
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
    mobs: mobsOf,
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
