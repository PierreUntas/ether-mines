// The players' hearts on the game server (server/src/health.js), and the loot it pays (srv_loot_mob).
// node --test tests/*.test.mjs (needs: npm ci --prefix server)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHealth } from '../server/src/health.js';
import { createGameServer, PROTOCOL } from '../server/src/server.js';
import { MobsCore } from '../server/src/shared.js';

function setup(owned = [107, 108]) {
  const sent = [],
    h = createHealth({ send: (p, m) => sent.push(m), owns: (p, i) => owned.includes(i) }),
    p = { id: 'p', world: 'w', pos: { x: 0, y: 30, z: 0 }, yaw: 0 };
  h.join(p, 10, 0);
  return { h, p, sent };
}
// yaw 0 looks toward -z: a blow from (0, -2) comes from in front, from (0, 2) from behind
test('a blow takes hearts, then a moment before the next can land; a fall brings you back full', () => {
  const { h, p, sent } = setup();
  assert.equal(h.hurt(p, 3, 0, 2, 'melee', 1000), 'hit');
  assert.equal(p.hp, 7);
  assert.equal(h.hurt(p, 3, 0, 2, 'melee', 1200), null, 'just struck');
  assert.equal(h.hurt(p, 99, 0, 2, 'melee', 2000), 'hit');
  assert.equal(sent.at(-1).dead, 1);
  assert.equal(p.hp, 10, 'back at the sanctuary, full');
  assert.equal(h.hurt(p, 3, 0, 2, 'melee', 3000), null, 'a moment out of reach after a fall');
});
test('the guard: a parry right after it goes up, a block later, nothing from behind; a bolt in front is deflected', () => {
  const { h, p, sent } = setup();
  p.held = 107;
  h.guard(p, true, 1000);
  assert.equal(h.hurt(p, 4, 0, -2, 'melee', 1100), 'parry');
  assert.equal(p.hp, 10);
  assert.equal(h.hurt(p, 4, 0, -2, 'melee', 3000), 'block');
  assert.equal(p.hp, 9, 'a quarter of 4, less the plating... at least what is left');
  assert.equal(h.hurt(p, 4, 0, -2, 'bolt', 5000), 'block');
  assert.equal(p.hp, 9, 'a bolt in front: deflected');
  assert.equal(h.hurt(p, 4, 0, 2, 'melee', 7000), 'hit', 'from behind: the guard does nothing');
  assert.ok(sent.some(m => m.res === 'parry'));
});
test("a blade or a plating you don't own does nothing", () => {
  const { h, p } = setup([]);
  p.held = 107;
  p.armor = 108;
  h.guard(p, true, 1000);
  assert.equal(h.hurt(p, 4, 0, -2, 'melee', 1100), 'hit');
  assert.equal(p.hp, 6, 'full damage: no blade, no plating');
  const o = setup([108]);
  o.p.armor = 108;
  h; // (Volt Plating: -25%)
  o.h.hurt(o.p, 4, 0, 2, 'melee', 1000);
  assert.equal(o.p.hp, 7);
});
test("hearts come back slowly, faster without a blow; a bed at night, a hunt, a reconnection doesn't heal", () => {
  const { h, p } = setup();
  h.hurt(p, 5, 0, 2, 'melee', 0);
  h.regen(p, 5000);
  assert.equal(p.hp, 5, 'not yet: 6 s after a blow');
  h.regen(p, 6100);
  assert.equal(p.hp, 6);
  h.regen(p, 8000);
  assert.equal(p.hp, 6);
  h.regen(p, 10200);
  assert.equal(p.hp, 7);
  assert.ok(!h.heal(p, 'bed', false, 11000), 'no sleeping by day');
  assert.ok(h.heal(p, 'bed', true, 11000));
  assert.equal(p.hp, 10);
  h.hurt(p, 3, 0, 2, 'melee', 20000);
  assert.ok(h.heal(p, 'hunt', false, 21000));
  assert.ok(!h.heal(p, 'hunt', false, 21500), 'one heart at a time');
  assert.equal(p.hp, 8);
  h.leave(p, 22000);
  const again = { id: 'p', world: 'w', pos: p.pos };
  h.join(again, 10, 23000);
  assert.equal(again.hp, 8, 'reconnecting keeps your hearts');
});

const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect(url, id, world, extra = {}) {
  const ws = new WebSocket(url),
    got = [];
  ws.onmessage = e => got.push(JSON.parse(e.data));
  await new Promise(r => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, world, token: `test:${id}:${id}`, ...extra }));
  for (let i = 0; i < 50 && !got.some(m => m.t === 'welcome' || m.t === 'bye'); i++) await wait(10);
  return { got, send: m => ws.send(JSON.stringify(m)), of: t => got.filter(m => m.t === t), close: () => ws.close() };
}
test('the game server pays the loot of a kill to everyone who struck it, and takes the tonic itself', async () => {
  const calls = [],
    srv = async (fn, body) => {
      calls.push([fn, body]);
      if (fn === 'srv_loot_mob') return { ok: true, inv: { 101: 1 }, item: 101 };
      if (fn === 'srv_use_item') return { ok: true, inv: { 303: -1 }, item: 303 };
      return null;
    },
    s = createGameServer({ port: 0, authMode: 'test', log: () => {}, srv }),
    url = `ws://127.0.0.1:${await s.listen()}`;
  try {
    const a = await connect(url, 'la', 'wl', { hp: 6 }),
      b = await connect(url, 'lb', 'wl');
    assert.deepEqual([a.of('welcome')[0].loot, a.of('welcome')[0].hp], [1, 6]);
    assert.ok(
      calls.some(([fn, body]) => fn === 'srv_heartbeat' && body.worlds.includes('wl')),
      'Supabase is told the server is up',
    );
    a.send({ t: 'pos', x: 300, y: 30, z: 300 });
    b.send({ t: 'pos', x: 302, y: 30, z: 300 });
    await wait(50);
    const blow = (p, extra) => p.send({ t: 'mob', id: '18,18|3|shadow', item: 107, dmg: 5, x: 301, y: 30, z: 300, ...extra });
    blow(a);
    await wait(500);
    blow(b);
    await wait(100);
    const loots = calls.filter(([fn]) => fn === 'srv_loot_mob').map(([, b]) => [b.p_user, b.mob_type]);
    assert.deepEqual(loots.sort(), [
      ['la', 'shadow'],
      ['lb', 'shadow'],
    ]);
    assert.equal(a.of('loot')[0]?.r.item, 101);
    assert.equal(b.of('mob').at(-1).paid, 1, 'the screens know not to ask');
    a.send({ t: 'use', item: 303 });
    await wait(50);
    assert.equal(a.of('used')[0]?.r.ok, true);
    assert.equal(a.of('hp').at(-1).hp, 10, '6 + 5, no more than full');
    a.send({ t: 'heal', kind: 'tonic' }); // a tonic that didn't go through the server: nothing
    await wait(30);
    assert.equal(a.of('hp').length, 1);
    [a, b].forEach(p => p.close());
  } finally {
    await s.close();
  }
});
test('an older game (its hearts on its own screen) is turned away', async () => {
  const s = createGameServer({ port: 0, authMode: 'test', log: () => {} }),
    url = `ws://127.0.0.1:${await s.listen()}`;
  try {
    const ws = new WebSocket(url),
      got = [];
    ws.onmessage = e => got.push(JSON.parse(e.data));
    await new Promise(r => (ws.onopen = r));
    ws.send(JSON.stringify({ t: 'hello', v: 1, world: 'w', token: 'test:x:X' }));
    await wait(50);
    assert.equal(got[0]?.reason, 'version');
    ws.close();
  } finally {
    await s.close();
  }
});
test("a mob's bolt flies on the server and hurts the player it reaches", async () => {
  const { createMobSim } = await import('../server/src/mobs.js');
  const flat = {
    get: (x, y) => (y < 30 ? 3 : 0),
    isSolid: globalThis.Mesh.isSolid,
    around: (a, b, c, d) => d,
    has: () => true,
    ready: () => true,
  };
  const hurts = [],
    sim = createMobSim({
      terrain: flat,
      ledger: () => null,
      send: () => {},
      hurt: (p, dmg, x, z, kind) => (hurts.push([p.id, dmg, kind]), 'hit'),
    }),
    p = { id: 'p', pos: { x: 3000.5, y: 30, z: 3000.5 } };
  let t = Date.now();
  for (; MobsCore.nightOf(MobsCore.worldClock(t).day) < 0.9; t += 10000);
  sim.tick([p], 0.1, t);
  const tu = MobsCore.mob('turret', '187,187', 901, 3000.5, 30, 3006.5, null);
  sim.place(tu);
  for (let i = 0; i < 60; i++) sim.tick([p], 0.1, t + i * 100);
  assert.ok(hurts.some(([id, dmg, kind]) => id === 'p' && kind === 'bolt' && dmg === MobsCore.MK.turret.ranged.dmg));
});
