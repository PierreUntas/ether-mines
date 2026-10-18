// The game server's mobs (server/src/mobs.js): the shared logic (src/mobs-core.js) run on the server, on a
// flat test world. node --test tests/*.test.mjs (needs: npm ci --prefix server)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobsCore, World, Mesh } from '../server/src/shared.js';
import { createMobSim } from '../server/src/mobs.js';
import { createTerrain } from '../server/src/terrain.js';

const { MK, nightOf, worldClock, mob } = MobsCore;
// a flat world: stone up to y 29, air above (the generator's structures are still placed from the seed)
const flat = {
  get: (x, y) => (y < 30 ? 3 : 0),
  isSolid: Mesh.isSolid,
  isCross: Mesh.isCross,
  around: (cx, cz, r, budget) => budget,
  has: () => true,
  ready: () => true,
};
// a moment of night, and one of day, by the world's own clock
function findTime(dark) {
  for (let t = Date.now(); ; t += 10000) if (dark ? nightOf(worldClock(t).day) > 0.9 : nightOf(worldClock(t).day) === 0) return t;
}
const far = { x: 3000.5, z: 3000.5 }; // far from the Atrium and its path, where mobs hunt
function setup(players, opts = {}) {
  const sent = [],
    ledger = new Map(),
    sim = createMobSim({
      terrain: opts.terrain || flat,
      ledger: id => ledger.get(id),
      send: (p, m) => sent.push([p.id, typeof m === 'string' ? JSON.parse(m) : m]),
    });
  sim.tick(players, 0.1, opts.now);
  return { sim, sent, ledger };
}
const player = (id, x, z, extra) => ({ id, pos: { x, y: 30, z }, ...extra });
const chunkOf = (x, z) => World.ckey(World.cOf(x), World.cOf(z));

test('a mob hunts the closest player, walks up to them and strikes them, and only them', () => {
  const now = findTime(true),
    a = player('a', far.x, far.z),
    b = player('b', far.x - 12, far.z);
  const { sim, sent } = setup([a, b], { now });
  const m = mob('shadow', chunkOf(far.x, far.z), 900, far.x + 6, 30, far.z, null);
  assert.ok(sim.place(m));
  for (let i = 0; i < 40; i++) sim.tick([a, b], 0.1, now + i * 100);
  const hits = sent.filter(([, msg]) => msg.t === 'mhit' && msg.id === m.id); // (a night prowler may join in)
  assert.ok(Math.hypot(m.p.x - far.x, m.p.z - far.z) < MK.shadow.atk, 'it came up to the closest one');
  assert.ok(hits.length >= 1);
  assert.ok(hits.every(([to, msg]) => to === 'a' && msg.dmg === MK.shadow.dmg));
});

test('a player who turned hostile mobs off is never hunted nor hit, and keeps no mobs alive', () => {
  const now = findTime(true),
    a = player('a', far.x, far.z, { noMobs: true }),
    b = player('b', far.x - 12, far.z);
  const { sim, sent } = setup([a, b], { now });
  const m = mob('shadow', chunkOf(far.x, far.z), 905, far.x + 6, 30, far.z, null);
  assert.ok(sim.place(m));
  for (let i = 0; i < 60; i++) sim.tick([a, b], 0.1, now + i * 100);
  const hits = sent.filter(([, msg]) => msg.t === 'mhit');
  assert.ok(hits.length >= 1, 'it went for b');
  assert.ok(hits.every(([to]) => to === 'b'), 'never a');
  // alone, the mobs around them go away
  for (let i = 0; i < 3; i++) sim.tick([a], 0.1, now + 7000 + i * 100);
  assert.equal(sim.count(), 0);
});

test('every player nearby sees it, a turret fires at them, and its bolt is seen by everyone around', () => {
  const now = findTime(true),
    a = player('a', far.x, far.z),
    b = player('b', far.x + 30, far.z),
    c = player('c', far.x + 400, far.z);
  const { sim, sent } = setup([a, b, c], { now });
  const t = mob('turret', chunkOf(far.x, far.z), 901, far.x, 30, far.z + 6, null);
  sim.place(t);
  for (let i = 0; i < 40; i++) sim.tick([a, b, c], 0.1, now + i * 100);
  const shots = sent.filter(([, msg]) => msg.t === 'mshot' && msg.id === t.id);
  assert.ok(shots.some(([to]) => to === 'a') && shots.some(([to]) => to === 'b'), 'a and b see the bolt');
  assert.ok(!shots.some(([to]) => to === 'c'), 'c is too far');
  assert.equal(shots[0][1].to, 'a', 'aimed at the closest');
  const seen = sim.view(a).find(e => e[0] === t.id);
  assert.ok(seen && seen[5] === MK.turret.hp);
  assert.ok(!sim.view(c).some(e => e[0] === t.id), 'out of sight for c');
});

test('a parry stuns it, a blow knocks it back, a death in the ledger removes it', () => {
  const now = findTime(true),
    a = player('a', far.x, far.z);
  const { sim, ledger } = setup([a], { now });
  const m = mob('golem', chunkOf(far.x, far.z), 902, far.x + 2, 30, far.z, null);
  sim.place(m);
  assert.ok(sim.parry(a, m.id));
  assert.ok(m.stunT > 0);
  assert.ok(!sim.parry(player('x', far.x + 50, far.z), m.id), 'too far to parry it');
  const x0 = m.p.x;
  sim.struck(m.id, far.x, far.z, 20);
  m.stunT = 0;
  sim.tick([a], 0.1, now);
  assert.ok(m.p.x > x0, 'pushed away from the blow');
  assert.equal(m.hp, 20);
  ledger.set(m.id, { hp: 0, deadUntil: now + 120000 });
  sim.tick([a], 0.1, now + 100);
  assert.equal(sim.find(m.id), null);
});

test('by day the mobs rest out of sight, the guards stay; at night they come back', () => {
  const day = findTime(false),
    night = findTime(true),
    a = player('a', far.x, far.z);
  const { sim } = setup([a], { now: day });
  const k = chunkOf(far.x, far.z),
    s = mob('shadow', k, 903, far.x + 30, 30, far.z, null),
    g = mob('crawler', k, 904, far.x + 30, 30, far.z + 2, null);
  sim.place(s);
  sim.place(g);
  sim.tick([a], 0.1, day);
  assert.equal(sim.find(s.id), null, 'the shadow rests by day');
  assert.ok(sim.find(g.id), 'a ruin guard stays on watch');
  sim.tick([a], 0.1, night);
  assert.ok(sim.find(s.id), 'back at night');
});

test('the terrain: generated at once, then what Supabase holds, and edits laid over it', async () => {
  let reads = 0;
  const t = createTerrain(async () => {
    reads++;
    return { chunks: [], edits: [{ x: 5, y: 50, z: 5, id: 3 }] };
  });
  t.around(0, 0, 2, 100);
  assert.equal(t.has(2, 2), true);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(reads, 1, 'one read for the whole area');
  assert.equal(t.get(5, 50, 5), 3);
  assert.ok(t.ready(0, 0));
  t.edit(5, 51, 5, 1);
  assert.equal(t.get(5, 51, 5), 1);
  assert.equal(t.around(10, 10, 3, 2), 0, 'at most 2 new chunks this time');
  t.close();
});

test('mobs on the generated world: the same ones the game places', () => {
  const now = findTime(true);
  // the Mempool's Front-Runner, by its arena's position (world.js arenaAt)
  let A = null;
  for (let ax = -3; ax <= 3 && !A; ax++) for (let az = -3; az <= 3 && !A; az++) A = World.arenaAt(ax, az);
  assert.ok(A, 'an arena nearby');
  const terrain = createTerrain(async () => ({ chunks: [], edits: [] })),
    a = player('a', A.x + 3, A.z);
  a.pos.y = A.y + 1;
  const { sim } = setup([a], { terrain, now });
  return new Promise(res =>
    setTimeout(() => {
      for (let i = 0; i < 40; i++) sim.tick([a], 0.1, now + i * 100);
      assert.ok(sim.find(`${chunkOf(A.x, A.z)}|170|front_runner`), 'the Front-Runner is there');
      terrain.close();
      res();
    }, 300),
  );
});
