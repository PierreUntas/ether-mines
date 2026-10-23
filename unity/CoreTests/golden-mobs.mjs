// Golden data for MobsParity.cs: the game server itself (server/src/server.js, with mobs.js, health.js and
// src/mobs-core.js, run as is) over real WebSockets, on the generator's own terrain, with a fake clock and
// fake timers so every run is the same. Scripted players (they react to what the server tells them: they
// follow a mob, raise their guard when it winds up, strike it...) play a few scenes; every message they
// send and receive is recorded, with where each mob stands after each tick.
// Run from anywhere:  node unity/CoreTests/golden-mobs.mjs   (needs: npm ci --prefix server)
//   golden/mobs.json  per scene: the start time, the players' hellos and what they own; per tick: what each
//                     player sent, what each received (up to that point), the srv_loot_mob calls, and the
//                     mobs stepped in that tick [id, x, y, z, ry, hp, target]
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- a fake clock, a seeded Math.random ----------
let NOW = 0;
Date.now = () => NOW;
let st = 0x2545f491;
Math.random = () => {
  st = (st + 0x6d2b79f5) | 0;
  let t = Math.imul(st ^ (st >>> 15), 1 | st);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// ---------- fake timers, for the server's own code only (ws and node keep the real ones) ----------
const real = { setTimeout, setInterval, clearTimeout, clearInterval };
let fakes = [],
  fid = 0;
const caller = () => (new Error().stack || '').split('\n')[4] || '';
const ours = () => caller().includes('/server/src/');
globalThis.setTimeout = (fn, ms, ...a) => {
  if (!ours()) return real.setTimeout(fn, ms, ...a);
  const t = { fake: true, fn, due: NOW + (ms || 0), every: 0, n: fid++, unref() {}, ref() {} };
  fakes.push(t);
  return t;
};
globalThis.setInterval = (fn, ms, ...a) => {
  if (!ours()) return real.setInterval(fn, ms, ...a);
  const t = { fake: true, fn, due: NOW + ms, every: ms, n: fid++, unref() {}, ref() {} };
  fakes.push(t);
  return t;
};
globalThis.clearTimeout = t => (t && t.fake ? (fakes = fakes.filter(f => f !== t)) : real.clearTimeout(t));
globalThis.clearInterval = t => (t && t.fake ? (fakes = fakes.filter(f => f !== t)) : real.clearInterval(t));
const drain = async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
};
// the clock moves on: the terrain's reads first (setTimeout), then the server's 100 ms beat and its 2 s tick
// (the other intervals, the heartbeat, the restores, the pings, are left out)
async function advance(ms) {
  NOW += ms;
  for (const t of fakes.filter(f => !f.every && f.due <= NOW).sort((a, b) => a.due - b.due || a.n - b.n)) {
    fakes = fakes.filter(f => f !== t);
    t.fn();
  }
  await drain();
  for (const t of fakes.filter(f => (f.every === 100 || f.every === 2000) && f.due <= NOW).sort((a, b) => a.every - b.every)) {
    t.due += t.every;
    t.fn();
  }
}

const { createGameServer, PROTOCOL, WEAPONS } = await import('../../server/src/server.js');
const { MobsCore, World } = globalThis;
// every mob stepped, as it stands after its step
let stepped = null;
const step0 = MobsCore.step;
MobsCore.step = (W, a, tg, dt, ev) => {
  const r = step0(W, a, tg, dt, ev);
  if (stepped) stepped.push([a.id, a.p.x, a.p.y, a.p.z, a.r.y, a.hp, a.tgt ?? null]);
  return r;
};
// what the test mode gives every player (server.js owned): every weapon, blade, plating and unique
const OWNED = [...new Set([...Object.keys(WEAPONS).map(Number), 106, 107, 301, 108, 109, 302, 206, 209, 211])];
const LOOT_R = { ok: true, gwei: 3, total_gwei: 10 };
const r2 = v => Math.round(v * 100) / 100;
const H = (x, z) => World.heightAt(Math.floor(x), Math.floor(z)) + 1;

async function until(f, what) {
  for (let i = 0; i < 2000; i++) {
    if (f()) return;
    await new Promise(r => real.setTimeout(r, 1));
  }
  throw new Error('timed out: ' + what);
}

async function runScene(sc) {
  NOW = sc.t0;
  fakes = [];
  const lootCalls = [];
  const srv = createGameServer({
    port: 0,
    authMode: 'test',
    log: m => console.error('  server: ' + m),
    srv: async (fn, body) => {
      if (fn === 'srv_loot_mob') {
        lootCalls.push([body.p_user, body.mob_type, body.ex, body.ey, body.ez]);
        return LOOT_R;
      }
      if (fn === 'srv_use_item') return { ok: true };
      return null;
    },
  });
  const port = await srv.listen();
  let marker = 1e6;
  const P = new Map();
  const segment = c => {
    const out = c.got.splice(0).filter(m => !(m.t === 'used' && m.item >= 1e6) && m.t !== 'peers' && m.t !== 'pos');
    for (const m of out) c.see(m);
    return out;
  };
  async function ping(c) {
    const id = marker++;
    c.ws.send(JSON.stringify({ t: 'use', item: id }));
    await until(() => c.got.some(m => m.t === 'used' && m.item === id), 'ping ' + c.id);
    return segment(c);
  }
  const hello = {};
  for (const p of sc.players) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`),
      c = { id: p.id, ws, got: [], mobs: new Map(), hp: p.hello.hp ?? 10, k: 0, ...p.st };
    c.see = m => {
      if (m.t === 'ms')
        for (const [id, x, y, z, ry, hp, f] of m.l) c.mobs.set(id, { id, x, y, z, ry, hp, f, seen: c.k });
      else if (m.t === 'mob' && m.dead) c.mobs.delete(m.id);
      else if ((m.t === 'hurt' || m.t === 'hp') && m.hp !== undefined) c.hp = m.hp;
    };
    ws.onmessage = e => c.got.push(JSON.parse(e.data));
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, world: 'golden', token: `test:${p.id}:${p.id}`, ...p.hello }));
    await until(() => c.got.some(m => m.t === 'welcome'), 'welcome');
    await drain();
    hello[p.id] = await ping(c);
    P.set(p.id, c);
  }
  const ticks = [];
  for (let k = 0; k < sc.ticks; k++) {
    const inputs = [],
      seg = {};
    for (const c of P.values()) {
      c.k = k;
      for (const [id, m] of c.mobs) if (k - m.seen > 15) c.mobs.delete(id);
    }
    const acts = new Map([...P.keys()].map(id => [id, []]));
    sc.step(k, { P, act: (id, m) => acts.get(id).push(m) });
    lootCalls.length = 0;
    for (const c of P.values()) {
      const msgs = [posMsg(c), ...acts.get(c.id)];
      for (const m of msgs) {
        c.ws.send(JSON.stringify(m));
        inputs.push([c.id, m]);
      }
      seg[c.id] = await ping(c);
    }
    const loot = lootCalls.slice();
    stepped = [];
    await advance(100);
    ticks.push({ inputs, seg, loot, stepped });
    stepped = null;
  }
  const final = {};
  for (const c of P.values()) final[c.id] = await ping(c);
  for (const c of P.values()) c.ws.close();
  await srv.close();
  const counts = {};
  for (const t of ticks) for (const s of Object.values(t.seg)) for (const m of s) counts[m.t] = (counts[m.t] || 0) + 1;
  const kinds = new Set(ticks.flatMap(t => t.stepped.map(s => s[0].split('|')[2])));
  console.log(`${sc.name}: ${sc.ticks} ticks, messages ${JSON.stringify(counts)}, mobs ${[...kinds].join(' ')}`);
  return { name: sc.name, t0: sc.t0, owned: OWNED, players: sc.players.map(p => ({ id: p.id, hello: p.hello })), hello, ticks, final };
}

// a player's `pos`, as the client sends it
function posMsg(c) {
  const m = { t: 'pos', x: r2(c.x), y: r2(c.y), z: r2(c.z), yaw: r2(c.yaw || 0), pitch: 0, m: false, h: c.h || 0, gd: c.gd ? 1 : 0, rd: 0, on: 0 };
  if (c.bt) m.bt = 1;
  if (c.ar !== undefined) m.ar = c.ar;
  if (c.wd) m.wd = 1;
  if (c.ld) m.ld = 1;
  if (c.nm) m.nm = 1;
  return m;
}
// the closest mob this player has seen, within d blocks (and passing f)
function nearest(c, d, f = () => true) {
  let best = null,
    bd = d;
  for (const m of c.mobs.values()) {
    if (m.hp <= 0 || m.f & 16 || !f(m)) continue;
    const dd = Math.hypot(m.x - c.x, m.z - c.z);
    if (dd < bd) {
      bd = dd;
      best = m;
    }
  }
  return best;
}
const face = (c, m) => (c.yaw = Math.atan2(-(m.x - c.x), -(m.z - c.z)));
// a blow on a mob, as Combat.cs sends it (a riposte while it reels from a parry)
function blow(c, m, item = 301, base = 7.5) {
  const dmg = m.f & 4 ? base * 1.5 : base;
  return { t: 'mob', id: m.id, item, dmg: r2(dmg), hp: r2(Math.max(0, m.hp - dmg)), x: r2(m.x), y: r2(m.y), z: r2(m.z), fx: r2(c.x), fz: r2(c.z) };
}
// walk toward (x, z), sp blocks a tick
function walk(c, x, z, sp, stop = 0) {
  const dx = x - c.x,
    dz = z - c.z,
    d = Math.hypot(dx, dz);
  if (d <= stop + 1e-9) return;
  const s = Math.min(sp, d - stop);
  c.x += (dx / d) * s;
  c.z += (dz / d) * s;
}
// raise the guard when a mob close by winds up (a parry), lower it a few ticks later
function parryReflex(c, k, reach = 3.5) {
  const w = nearest(c, reach, m => m.f & 32 && m.seen === k - 1);
  if (w && !c.gd) {
    c.gd = true;
    c.gdAt = k;
    face(c, w);
  } else if (c.gd && k - c.gdAt > 4) c.gd = false;
}

const NIGHT = 1792713840000, // deep night by the world's clock (nightOf > 0.95)
  DAY = 1792713650000, // broad day, and the network attack's window (it opened at ...600000)
  DUSK = 1792713812000; // day, 15 s before the dark (nightOf >= 0.55 at ...827200)
const scenes = [];

// a player walks up to a ruin at night, parries its guardians and strikes back, then relights its validator
{
  const R = { x: 91, z: -23, y: 35 };
  scenes.push({
    name: 'ruin at night',
    t0: NIGHT,
    ticks: 220,
    players: [{ id: 'a', hello: { hp: 10 }, st: { x: R.x + 20.5, y: H(R.x + 20, R.z), z: R.z + 0.5, h: 301 } }],
    step(k, { P, act }) {
      const c = P.get('a');
      walk(c, R.x + 4.5, R.z + 0.5, 0.3);
      c.y = H(c.x, c.z);
      parryReflex(c, k);
      const m = nearest(c, 6);
      if (m && !c.gd) face(c, m);
      if (m && k % 4 === 0 && !c.gd) act('a', blow(c, m));
      if (k === 160) act('a', { t: 'edit', x: R.x, y: R.y + 1, z: R.z, id: 74 });
    },
  });
}
// a player comes up to a tower by day, under the turrets' fire, climbs its ladder and steps off on the first floor
{
  const T = { x: -66, z: 46, y: 36 };
  scenes.push({
    name: 'tower',
    t0: DAY,
    ticks: 260,
    players: [{ id: 'a', hello: {}, st: { x: T.x - 0.5, y: H(T.x, T.z + 30), z: T.z + 30.5, h: 106 } }],
    step(k, { P, act }) {
      const c = P.get('a');
      if (k < 110) {
        walk(c, T.x - 0.5, T.z + 4.5, 0.3);
        c.y = k < 60 ? H(c.x, c.z) : T.y + 1;
      } else if (k < 140) {
        // up the ladder
        c.x = T.x + 7.5;
        c.z = T.z - 6.5;
        c.y = T.y + 1 + ((k - 110) / 30) * 6;
        c.ld = true;
      } else {
        c.ld = false;
        c.y = T.y + 7;
        walk(c, T.x + 2.5, T.z - 2.5, 0.2);
      }
      // the guard held up for a while: a bolt from in front is blocked
      c.gd = (k >= 40 && k < 70) || (k >= 180 && k < 200);
      const m = nearest(c, 4);
      if (m) face(c, m);
      if (m && k % 5 === 0 && !c.gd) act('a', blow(c, m, 106, 2.5));
    },
  });
}
// the Genesis Titan in its lair: a player closes in and keeps striking it
{
  const X = 168.5,
    Y = 13,
    Z = 168.5;
  scenes.push({
    name: 'titan',
    t0: NIGHT,
    ticks: 200,
    players: [{ id: 'a', hello: { hp: 10, ar: 302 }, st: { x: X + 14, y: Y, z: Z, h: 301, ar: 302 } }],
    step(k, { P, act }) {
      const c = P.get('a');
      const t = nearest(c, 30, m => m.id.endsWith('|titan'));
      if (t) {
        walk(c, t.x, t.z, 0.35, 2.4);
        c.y = t.y;
        face(c, t);
        if (k % 4 === 0) act('a', blow(c, t));
      } else walk(c, X, Z, 0.35, 2.4);
    },
  });
}
// the network attack around the Atrium: two players fight its nodes, one strikes the other now and then
{
  scenes.push({
    name: 'network attack',
    t0: DAY + 20000,
    ticks: 250,
    players: [
      { id: 'a', hello: { hp: 10 }, st: { x: 20.5, y: H(20, 8), z: 8.5, h: 301 } },
      { id: 'b', hello: { hp: 8, ar: 109 }, st: { x: 18.5, y: H(18, 12), z: 12.5, h: 106, ar: 109 } },
    ],
    step(k, { P, act }) {
      for (const c of P.values()) {
        const m = nearest(c, 40, x => x.id.endsWith('|corrupted_node'));
        if (m) {
          walk(c, m.x, m.z, 0.3, 1.6);
          c.y = H(c.x, c.z);
          face(c, m);
          if (k % 4 === (c.id === 'a' ? 0 : 2)) act(c.id, c.id === 'a' ? blow(c, m) : blow(c, m, 106, 2.5));
        }
      }
      if (k >= 30 && k < 90 && k % 8 === 0) act('a', { t: 'hit', to: 'b', item: 301 });
      if (k === 100) act('b', { t: 'heal', kind: 'hunt' });
    },
  });
}
// a ruin's guardians by day: parries and ripostes, then the guard held (blocks), then none: hit until fallen
{
  const R = { x: -62, z: -43, y: 31 };
  scenes.push({
    name: 'parry and fall',
    t0: DAY,
    ticks: 300,
    players: [{ id: 'a', hello: { hp: 10, bt: 1 }, st: { x: R.x + 2.5, y: H(R.x + 2, R.z), z: R.z + 0.5, h: 107, bt: true } }],
    step(k, { P, act }) {
      const c = P.get('a');
      const m = nearest(c, 6);
      if (k < 90) {
        parryReflex(c, k);
        if (m && !c.gd && k % 4 === 0) act('a', blow(c, m, 107, 5));
      } else if (k < 170) {
        c.gd = true;
        if (m) face(c, m);
        if (k === 120) act('a', { t: 'guard', on: false });
        if (k === 121) act('a', { t: 'guard', on: true });
      } else {
        c.gd = false;
        if (k % 25 === 0) act('a', { t: 'dodge' });
      }
    },
  });
}
// the Merge twins: one struck down alone rises again; then both fall together
{
  const M = { x: -151, z: 59, y: 48 };
  scenes.push({
    name: 'merge twins',
    t0: DAY,
    ticks: 300,
    players: [
      { id: 'a', hello: {}, st: { x: M.x - 4.5, y: M.y + 1, z: M.z + 0.5, h: 301 } },
      { id: 'b', hello: {}, st: { x: M.x + 5.5, y: M.y + 1, z: M.z + 0.5, h: 301 } },
    ],
    step(k, { P, act }) {
      const a = P.get('a'),
        b = P.get('b');
      const pw = nearest(a, 30, m => m.id.endsWith('|pow_twin')),
        ps = nearest(b, 30, m => m.id.endsWith('|pos_twin'));
      if (pw) {
        walk(a, pw.x, pw.z, 0.4, 2);
        face(a, pw);
        if ((k < 60 || k >= 175) && k % 4 === 0) act('a', blow(a, pw, 301, 11.25));
      }
      if (ps) {
        walk(b, ps.x, ps.z, 0.4, 2);
        face(b, ps);
        if (k >= 160 && k % 4 === 2) act('b', blow(b, ps, 301, 11.25));
      }
    },
  });
}
// the Front-Runner: struck below half health it calls its Sandwich Bots and blinks; then it's finished off
{
  const A = { x: 149, z: -81, y: 29 };
  scenes.push({
    name: 'front-runner',
    t0: NIGHT,
    ticks: 260,
    players: [{ id: 'a', hello: { bt: 1 }, st: { x: A.x + 3.5, y: A.y + 1, z: A.z + 0.5, h: 301, bt: true } }],
    step(k, { P, act }) {
      const c = P.get('a');
      const f = nearest(c, 40, m => m.id.endsWith('|front_runner'));
      if (f) {
        walk(c, f.x, f.z, 0.5, 2);
        face(c, f);
        if ((k < 40 || k >= 180) && k % 4 === 0) act('a', blow(c, f, 301, 11.25));
      }
      const bot = nearest(c, 3, m => m.id.endsWith('|mev_bot'));
      if (bot && k >= 120 && k < 180 && k % 4 === 0) act('a', blow(c, bot));
      if (k % 30 === 15) act('a', { t: 'dodge' });
    },
  });
}
// dusk out in the open: the resting mobs come back and the prowlers come out; heals of every kind; mobs off a while
{
  const X = 300.5,
    Z = 300.5;
  scenes.push({
    name: 'dusk and heals',
    t0: DUSK,
    ticks: 260,
    players: [{ id: 'a', hello: { hp: 4 }, st: { x: X, y: H(X, Z), z: Z, h: 107 } }],
    step(k, { P, act }) {
      const c = P.get('a');
      c.nm = k >= 200 && k < 220;
      c.wd = k >= 230;
      if (k === 10 || k === 12 || k === 40) act('a', { t: 'heal', kind: 'hunt' });
      if (k === 20) act('a', { t: 'use', item: 303 });
      if (k === 25) act('a', { t: 'heal', kind: 'tonic' });
      if (k === 30 || k === 190) act('a', { t: 'heal', kind: 'bed' });
      parryReflex(c, k);
      const m = nearest(c, 3);
      if (m && k % 6 === 0 && !c.gd) act('a', blow(c, m, 107, 5));
    },
  });
}
// odds and ends at night by a ruin: the Ward Incense, blows out of turn, too far, on a mob not run here or
// already dead, a parry told by the client, a strike back from the sanctuary
{
  const R = { x: -62, z: -43, y: 31 };
  scenes.push({
    name: 'ward and odd blows',
    t0: NIGHT,
    ticks: 200,
    players: [
      { id: 'a', hello: { hp: 10, nm: 0 }, st: { x: R.x + 9.5, y: H(R.x + 9, R.z), z: R.z + 0.5, h: 107, wd: true } },
      { id: 'b', hello: { hp: 10 }, st: { x: 8.5, y: 33, z: 10.5, h: 301 } },
    ],
    step(k, { P, act }) {
      const a = P.get('a'),
        b = P.get('b');
      a.wd = k < 80;
      if (k >= 40) walk(a, R.x + 2.5, R.z + 0.5, 0.2);
      a.y = H(a.x, a.z);
      const m = nearest(a, 8);
      if (m) face(a, m);
      if (m && k >= 90 && k < 100) act('a', blow(a, m, 107, 5)); // every tick: most come too soon
      if (m && k === 105) act('a', { ...blow(a, m, 107, 5), dmg: 99 }); // more than the blade can do
      if (m && k === 110) act('a', blow(a, m, 106, 2.5)); // a weapon claimed... and owned
      if (m && k === 115) act('a', { ...blow(a, m, 999, 9), x: m.x, z: m.z }); // not a weapon: bare hands
      if (k === 120) act('a', { t: 'mob', id: '9,9|0|titan', item: 107, dmg: 5, x: a.x, y: a.y, z: a.z, fx: a.x, fz: a.z }); // not run here
      if (k === 125) act('a', { t: 'mob', id: 'nonsense', item: 107, dmg: 5, x: 0, y: 0, z: 0 });
      if (m && k === 130) act('a', { ...blow(a, m, 107, 5), x: m.x + 30 }); // where the client saw it doesn't matter: the sim's does
      if (k >= 140 && k % 10 === 0) act('a', { t: 'parry', id: m ? m.id : 'x' });
      const dead = [...a.mobs.values()].find(x => x.hp <= 0);
      if (dead && k % 7 === 0) act('a', blow(a, dead, 107, 5));
      // b, in the Atrium, strikes a: refused (too far), then a strikes b back in the sanctuary
      if (k === 60) act('b', { t: 'hit', to: 'a', item: 301 });
      if (k === 150) {
        a.x = b.x + 2;
        a.z = b.z;
      }
      if (k === 152) act('a', { t: 'hit', to: 'b', item: 107 });
      if (k === 160) act('b', { t: 'heal', kind: 'nap' });
      if (k === 170) act('b', { t: 'use', item: 5 });
    },
  });
}

const out = new URL('./golden/', import.meta.url);
mkdirSync(out, { recursive: true });
const res = [];
for (const sc of scenes) res.push(await runScene(sc));
writeFileSync(new URL('mobs.json', out), JSON.stringify(res));
console.log(res.length + ' scenes written');
process.exit(0);
