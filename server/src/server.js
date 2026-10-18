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
// accepts tokens of the form "test:<id>:<name>" without asking Supabase. SUPABASE_SERVICE_KEY (a Fly
// secret, never in the repository): with it, the server pays the mobs' loot and the tonic itself (the
// srv_* functions, 041_game_server.sql), and tells Supabase it's up so the browsers can't claim loot.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { MobsCore } from './shared.js';
import { createTerrain, supabaseArea } from './terrain.js';
import { createMobSim, TICK_MS } from './mobs.js';
import { createHealth, BLADES, ARMOR } from './health.js';

// 2: the players' hearts live here (health.js): a browser that doesn't know it is turned away
export const PROTOCOL = 2;
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
// what the server looks for in a player's inventory: the blades and the platings, and among their
// uniques, the Plasma Pistol, the Merge Aegis and the Front-Runner Boots
const OWNED_INV = [...BLADES, ...Object.keys(ARMOR).map(Number)].filter(i => i !== 209),
  OWNED_UNIQ = [206, 209, 211];
const PVP_FLOOR_MS = 700; // between two blows of the same player on the same target, whatever the weapon
// Mobs (step 3): their health lives here. Each screen still moves its own copy of a mob, but a blow is
// sent here, checked (the weapon you have, its pace, its reach) and taken off the mob's health, and
// everyone nearby, the striker included, gets the health left. The server alone says when a mob dies,
// who took part (the loot), and keeps it dead until it comes back (2 minutes, 25 s for a network attack's
// node). The mobs' full health is MK[type].hp in src/mobs-core.js, the logic the game and this server share.
export const MOB_HP = Object.fromEntries(Object.entries(MobsCore.MK).map(([k, v]) => [k, v.hp]));
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
    fetch(`${base}/inventory?select=item,n&${who}&item=in.(${OWNED_INV.join(',')})`, { headers: h }),
    fetch(`${base}/uniques?select=item&${who}&item=in.(${OWNED_UNIQ.join(',')})`, { headers: h }),
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
    serviceKey: opts.serviceKey ?? process.env.SUPABASE_SERVICE_KEY ?? '',
  };
  // the game server's own Supabase functions (srv_*), with the service key
  const srv =
    opts.srv ??
    (async (fn, body) => {
      const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        // a legacy service_role key is a JWT, sent both ways; a new secret key (sb_secret_…) only as apikey
        headers: {
          apikey: cfg.serviceKey,
          ...(cfg.serviceKey.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + cfg.serviceKey }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    });
  const pays = !!(cfg.serviceKey || opts.srv);
  const verify = cfg.authMode === 'test' ? (t, w) => Promise.resolve(verifyTest(t, w)) : (t, w) => verifySupabase(cfg, t, w);
  // tests: opts.owned(id) gives a player's weapons; by default in test mode, every weapon
  const owned =
    opts.owned ??
    (cfg.authMode === 'test'
      ? () => Promise.resolve(new Set([...Object.keys(WEAPONS).map(Number), ...OWNED_INV, ...OWNED_UNIQ]))
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
  // does this player really have it (a blade they guard with, the plating they wear)?
  function owns(p, item) {
    if (p.owned && p.owned.has(item)) return true;
    if (Date.now() - (p.ownedAt || 0) > OWNED_RETRY) refreshOwned(p);
    return false;
  }
  const health = createHealth({ send: (p, m) => send(p, m), owns });
  const worlds = new Map(); // world -> Map(id -> player)
  const mobsOf = new Map(); // world -> Map(mob id -> { hp, by: Map(player id -> ms), at, down, deadUntil })
  function mobState(world, id, type, now, init) {
    if (!mobsOf.has(world)) mobsOf.set(world, new Map());
    const mobs = mobsOf.get(world);
    let s = mobs.get(id);
    if (s && s.deadUntil && now >= s.deadUntil) s = null; // back again
    if (s && s.down && now >= s.down) Object.assign(s, { down: 0, hp: Math.round(MOB_HP[type] * 0.6) }); // a twin that rose again, at 60%
    if (!s) mobs.set(id, (s = { hp: init ?? MOB_HP[type], by: new Map(), at: now, down: 0, deadUntil: 0 }));
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
      sim = sims.get(me.world)?.sim.find(id), // run here: its own position, its own health
      s = mobState(me.world, id, type, now, sim ? sim.hp : undefined),
      item = weaponOf(me, m.item),
      ranged = item === PISTOL,
      at = sim ? sim.p : { x, y, z },
      msg = { t: 'mob', id, from: me.id, dmg: 0, hp: s.hp, x: at.x, y: at.y, z: at.z, fx: num(m.fx, 1e5) ?? x, fz: num(m.fz, 1e5) ?? z };
    const pace = now - (me.lastMobHit || 0) >= (ranged ? COOLDOWN.ranged : COOLDOWN.melee) * MOB_SLACK,
      // the reach from where the mob really is, when it's run here (a little slack: what you saw was a moment ago)
      reach = Math.hypot(at.x - me.pos.x, at.z - me.pos.z) <= (ranged ? RANGE.hitRanged : RANGE.hitMelee) + (sim ? 1.5 : 0);
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
        if (pays) {
          msg.paid = 1; // the server pays each of them itself (their screens don't ask)
          payLoot(me.world, [...by], msg.both ? 'merge_twins' : type, at);
        }
      }
    }
    if (sim) sims.get(me.world).sim.struck(id, msg.fx, msg.fz, s.hp);
    for (const k of ['x', 'y', 'z']) msg[k] = Math.round(msg[k] * 100) / 100;
    send(me, msg);
    relay(me, RANGE.mob, msg);
  }
  // the loot of a kill, for everyone who took part: Supabase rolls it (srv_loot_mob), each player is told
  function payLoot(world, ids, type, at) {
    const room = worlds.get(world);
    for (const id of ids) {
      const p = room && room.get(id),
        where = p && p.pos ? p.pos : at;
      srv('srv_loot_mob', { p_user: id, w: world, mob_type: type, ex: where.x, ey: where.y, ez: where.z })
        .then(r => {
          const q = worlds.get(world)?.get(id);
          if (q) send(q, { t: 'loot', type, r });
        })
        .catch(e => cfg.log(`loot ${type} for ${id}: ${e.message}`));
    }
  }
  // the worlds whose mobs run here: their terrain and their simulation, while someone plays there
  const sims = new Map(); // world -> { terrain, sim, last: Map(player id -> was empty) }
  const simOn = opts.sim ?? process.env.MOB_SIM !== '0';
  function simOf(world) {
    if (!simOn) return null;
    let w = sims.get(world);
    if (!w) {
      // the terrain is read with a connected player's own token, like the browser reads it
      const fetchArea =
        opts.fetchArea ??
        (cfg.authMode === 'test'
          ? async () => ({ chunks: [], edits: [] })
          : (cx0, cz0, cx1, cz1) => {
              const p = [...(worlds.get(world)?.values() || [])].find(q => q.token);
              return p ? supabaseArea(cfg, p.token, world, cx0, cz0, cx1, cz1) : Promise.resolve(null);
            });
      const terrain = createTerrain(
        (...a) => fetchArea(...a, world),
        m => cfg.log(world + ': ' + m),
      );
      const sim = createMobSim({
        terrain,
        ledger: id => mobsOf.get(world)?.get(id),
        send,
        hurt: (p, dmg, x, z, kind) => health.hurt(p, dmg, x, z, kind),
        open: (p, now) => health.open(p, now),
        log: cfg.log,
      });
      sims.set(world, (w = { terrain, sim, last: new Map() }));
    }
    return w;
  }
  // Supabase is told the server is up for these worlds: while it is, the browsers can't claim loot
  const beat = pays
    ? setInterval(() => {
        if (worlds.size) srv('srv_heartbeat', { worlds: [...worlds.keys()] }).catch(e => cfg.log('heartbeat: ' + e.message));
      }, 60000)
    : null;
  const simTick = setInterval(() => {
    const now = Date.now();
    for (const [world, w] of sims) {
      const room = worlds.get(world);
      if (!room || !room.size) {
        w.terrain.close();
        sims.delete(world);
        continue;
      }
      const players = [...room.values()];
      for (const p of players) health.regen(p, now);
      try {
        w.sim.tick(players, TICK_MS / 1000, now);
      } catch (e) {
        cfg.log(`mobs of ${world}: ${e.stack || e.message}`);
      }
      for (const p of players) {
        if (!p.pos || p.noMobs) continue;
        const l = w.sim.view(p, now);
        // an empty view goes out once (the last mobs around you are gone), then not again
        if (!l.length && w.last.get(p.id)) continue;
        w.last.set(p.id, !l.length);
        send(p, { t: 'ms', l });
      }
      if (Math.random() < 0.01) w.terrain.prune();
    }
  }, TICK_MS);
  const stats = { connections: 0, messages: 0 };

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      const players = [...worlds.values()].reduce((n, m) => n + m.size, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const mobs = [...sims.values()].reduce((n, w) => n + w.sim.count(), 0);
      // machine: which Fly machine answered (there must be only one: every player has to be on the same)
      res.end(
        JSON.stringify({
          ok: true,
          protocol: PROTOCOL,
          machine: process.env.FLY_MACHINE_ID || null,
          players,
          worlds: worlds.size,
          mobs,
          ...stats,
        }),
      );
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
        ws.send(JSON.stringify({ t: 'bye', reason, protocol: PROTOCOL }));
      } catch {}
      ws.close(4000, reason);
    };
    const leave = () => {
      if (!me) return;
      health.leave(me);
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
          lastHitOn: new Map(),
          armor: Number.isInteger(m.ar) ? m.ar : 0,
          boots: m.bt ? 211 : 0,
          noMobs: !!m.nm, // hostile mobs turned off on their screen: the mobs here leave them be
          held: 0,
          yaw: 0,
        };
        health.join(me, m.hp);
        room.set(me.id, me);
        refreshOwned(me);
        // mobs: 1 — this server runs the world's mobs itself (the game then only draws them)
        // mobs: 1 — this server runs the world's mobs itself (the game then only draws them); hp: your hearts
        // live here; loot: it pays the loot (the game doesn't ask Supabase)
        const sim = !!simOf(world);
        send(me, {
          t: 'welcome',
          id: me.id,
          name: me.name,
          color: me.color,
          protocol: PROTOCOL,
          mobs: sim ? 1 : 0,
          hp: sim ? me.hp : undefined,
          loot: pays ? 1 : 0,
        });
        if (pays) srv('srv_heartbeat', { worlds: [world] }).catch(e => cfg.log('heartbeat: ' + e.message));
        sendPeers(world);
        return;
      }
      if (m.t === 'pos') {
        const x = num(m.x, 1e5),
          y = num(m.y, 1e3),
          z = num(m.z, 1e5);
        if (x === null || y === null || z === null) return;
        me.pos = { x, y, z };
        me.ward = !!m.wd; // under the Ward Incense: most mobs don't see you
        me.yaw = num(m.yaw, 100) ?? me.yaw; // where you look: a guard only covers what's in front
        me.held = Number.isInteger(m.h) ? m.h : 0;
        if (Number.isInteger(m.ar) || m.ar === null) me.armor = m.ar || 0;
        me.boots = m.bt ? 211 : 0;
        me.noMobs = !!m.nm;
        health.guard(me, !!m.gd);
        me.ladder = !!m.ld; // on a ladder: tower mobs hold their blows
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
          bt: m.bt ? 1 : 0, // the Front-Runner Boots on their feet
          ar: Number.isInteger(m.ar) ? m.ar : 0, // the plating they wear (only drawn: its protection is settled here)
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
        if (!sims.has(me.world)) {
          // the hearts live on the screens (the server doesn't run this world's mobs): theirs settles it
          send(tgt, { t: 'hit', from: me.id, to: tgt.id, x: me.pos.x, y: me.pos.y, z: me.pos.z, item, dmg: pvpDamage(item) });
          return;
        }
        // no fighting in the sanctuary, and not twice in a row on the same player, whatever the weapon
        if (MobsCore.sanctuary(tgt.pos.x, tgt.pos.z) || now - (me.lastHitOn.get(tgt.id) || 0) < PVP_FLOOR_MS) return;
        me.lastHitOn.set(tgt.id, now);
        health.hurt(tgt, pvpDamage(item), me.pos.x, me.pos.z, ranged ? 'bolt' : 'pvp', now, me.id);
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
      } else if (m.t === 'mobs') {
        // where the mobs your screen leads stand (the ones after you): the players nearby follow them
        if (!Array.isArray(m.list)) return;
        const list = [];
        for (const e of m.list.slice(0, 24)) {
          if (!e || !MOB_ID_RE.test(str(e.id, 80))) continue;
          const v = ['x', 'y', 'z', 'r', 'd'].map(k => num(e[k], 1e5));
          if (v.some(n => n === null)) continue;
          const [x, y, z, r, d] = v;
          list.push({ id: e.id, x, y, z, r, d, f: Number.isInteger(e.f) ? e.f & 255 : 0 });
        }
        if (list.length) relay(me, RANGE.mob, { t: 'mobs', from: me.id, list });
      } else if (m.t === 'mobshot') {
        // a bolt one of those mobs fired at you: shown to the others
        const s = { t: 'mobshot', from: me.id, id: str(m.id, 80) };
        for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'c', 's']) s[k] = num(m[k], 1e8) ?? 0;
        relay(me, RANGE.shot, s);
      } else if (m.t === 'shot') {
        if (weaponOf(me, PISTOL) !== PISTOL) return; // no pistol, no bolt to show
        const s = { t: 'shot', id: me.id };
        for (const k of ['x', 'y', 'z', 'dx', 'dy', 'dz']) s[k] = num(m[k], 1e5) ?? 0;
        relay(me, RANGE.shot, s);
      } else if (m.t === 'dodge') {
        // a dodge with the Front-Runner Boots: out of reach of blows for a moment
        health.dodge(me);
      } else if (m.t === 'guard') {
        // the guard up or down, the moment it happens (a parry is about timing)
        health.guard(me, !!m.on);
      } else if (m.t === 'heal') {
        // a bed at night, a hunted animal; a tonic only when the server can't take it itself (no key)
        const day = MobsCore.worldClock().day,
          kind = str(m.kind, 8);
        if (kind === 'tonic') {
          if (pays || Date.now() - (me.healAt.tonicTrust || 0) < 20000) return;
          me.healAt.tonicTrust = Date.now();
          health.heal(me, 'tonic', false);
        } else health.heal(me, kind, day <= 0.25 || day >= 0.78);
      } else if (m.t === 'use') {
        // an Ether Tonic: taken from the inventory by Supabase (srv_use_item), then it heals
        if (!pays || m.item !== 303) return send(me, { t: 'used', item: m.item, r: { ok: false, err: 'not usable here' } });
        srv('srv_use_item', { p_user: me.id, w: me.world, item: 303 })
          .then(r => {
            if (r && r.ok) health.heal(me, 'tonic', false);
            send(me, { t: 'used', item: 303, r });
          })
          .catch(e => {
            cfg.log('tonic: ' + e.message);
            send(me, { t: 'used', item: 303, r: { ok: false, err: 'try again in a moment' } });
          });
      } else if (m.t === 'parry') {
        // you parried a mob's blow: it reels back, stunned
        sims.get(me.world)?.sim.parry(me, str(m.id, 80));
      } else if (m.t === 'edit') {
        // a block changed (the browser saw it in Supabase's own feed): the mobs walk the new terrain
        sims.get(me.world)?.terrain.edit(m.x, m.y, m.z, m.id);
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
        clearInterval(simTick);
        clearInterval(beat);
        for (const w of sims.values()) w.terrain.close();
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
