// The game server (server/src/server.js), with two or three players over real WebSockets: who gets what.
// Needs the server's dependency: npm ci --prefix server. node --test tests/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer, PROTOCOL } from '../server/src/server.js';

let srv, url;
before(async () => {
  srv = createGameServer({ port: 0, authMode: 'test', log: () => {} });
  const port = await srv.listen();
  url = `ws://127.0.0.1:${port}`;
});
after(() => srv.close());

const wait = ms => new Promise(r => setTimeout(r, ms));
async function player(id, name, world = 'w') {
  const ws = new WebSocket(url),
    got = [];
  ws.onmessage = e => got.push(JSON.parse(e.data));
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, world, token: `test:${id}:${name}` }));
  for (let i = 0; i < 50 && !got.some(m => m.t === 'welcome' || m.t === 'bye'); i++) await wait(10);
  const p = { ws, got, send: m => ws.send(JSON.stringify(m)), of: t => got.filter(m => m.t === t), close: () => ws.close() };
  return p;
}

test('a player is welcomed, under the nickname the server knows, and listed', async () => {
  const a = await player('a1', 'Alice');
  const w = a.of('welcome')[0];
  assert.equal(w.id, 'a1');
  assert.equal(w.name, 'Alice');
  await wait(30);
  assert.ok(
    a
      .of('peers')
      .at(-1)
      .list.some(p => p.id === 'a1'),
  );
  a.close();
});

test('a wrong token or an old protocol is turned away', async () => {
  const ws = new WebSocket(url),
    got = [];
  ws.onmessage = e => got.push(JSON.parse(e.data));
  await new Promise(r => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, world: 'w', token: 'nonsense' }));
  await wait(50);
  assert.equal(got[0]?.reason, 'auth');
  const old = new WebSocket(url),
    got2 = [];
  old.onmessage = e => got2.push(JSON.parse(e.data));
  await new Promise(r => (old.onopen = r));
  old.send(JSON.stringify({ t: 'hello', v: PROTOCOL + 99, world: 'w', token: 'test:x:X' }));
  await wait(50);
  assert.equal(got2[0]?.reason, 'version');
});

test('moves reach the players nearby only, with the sender named by the server', async () => {
  const a = await player('a2', 'A'),
    b = await player('b2', 'B'),
    c = await player('c2', 'C');
  b.send({ t: 'pos', x: 10, y: 30, z: 10 });
  c.send({ t: 'pos', x: 5000, y: 30, z: 5000 });
  await wait(30);
  a.send({ t: 'pos', id: 'someone-else', name: 'Faker', x: 12, y: 30, z: 11, yaw: 1, h: 107, gd: 1, rd: 213 });
  await wait(50);
  const seen = b.of('pos').at(-1);
  assert.equal(seen.id, 'a2', 'the id comes from the token, not the message');
  assert.equal(seen.name, 'A');
  assert.equal(seen.h, 107);
  assert.equal(seen.rd, 213);
  assert.equal(c.of('pos').length, 0, 'far away: nothing');
  // a blow they took is passed on (drawn on their avatar), anything else is not
  a.send({ t: 'pos', x: 12, y: 30, z: 11, fx: 'hurt', fq: 7 });
  await wait(50);
  assert.deepEqual([b.of('pos').at(-1).fx, b.of('pos').at(-1).fq], ['hurt', 7]);
  a.send({ t: 'pos', x: 12, y: 30, z: 11, fx: '<b>', fq: 8 });
  await wait(50);
  assert.equal(b.of('pos').at(-1).fx, 0);
  // a gesture (rules.js EMOTES) is passed on with its number, anything else is not
  a.send({ t: 'pos', x: 12, y: 30, z: 11, em: 'wave', eq: 3 });
  await wait(50);
  assert.deepEqual([b.of('pos').at(-1).em, b.of('pos').at(-1).eq], ['wave', 3]);
  a.send({ t: 'pos', x: 12, y: 30, z: 11, em: 'moonwalk', eq: 4 });
  await wait(50);
  assert.equal(b.of('pos').at(-1).em, 0);
  [a, b, c].forEach(p => p.close());
});

test('everyone gets the others with their positions (the online badge, /join)', async () => {
  const a = await player('a3', 'A', 'w3'),
    b = await player('b3', 'B', 'w3');
  b.send({ t: 'pos', x: 300, y: 40, z: -120 });
  await wait(2200);
  const list = a.of('peers').at(-1).list,
    pb = list.find(p => p.id === 'b3');
  assert.deepEqual([pb.x, pb.y, pb.z], [300, 40, -120]);
  assert.equal(pb.r, '3,-2');
  b.close();
  await wait(50);
  assert.ok(
    !a
      .of('peers')
      .at(-1)
      .list.some(p => p.id === 'b3'),
    'gone when they leave',
  );
  a.close();
});

test('a blow on a player lands only on that player, only within reach, and the server takes the hearts', async () => {
  const a = await player('a4', 'A', 'w4'),
    b = await player('b4', 'B', 'w4'),
    c = await player('c4', 'C', 'w4');
  a.send({ t: 'pos', x: 40, y: 30, z: 40 });
  b.send({ t: 'pos', x: 43, y: 30, z: 40 });
  c.send({ t: 'pos', x: 42, y: 30, z: 41 });
  await wait(30);
  a.send({ t: 'hit', to: 'b4', item: 107 });
  await wait(30);
  const h = b.of('hurt').filter(x => x.from);
  assert.equal(h.length, 1);
  assert.deepEqual([h[0].from, h[0].dmg, h[0].hp], ['a4', 2, 8], 'a Pure Ether Blade: 2 hearts between players');
  assert.equal(c.of('hurt').filter(x => x.from).length, 0);
  b.send({ t: 'pos', x: 70, y: 30, z: 40 });
  await wait(800);
  a.send({ t: 'hit', to: 'b4', item: 107 });
  a.send({ t: 'hit', to: 'b4', item: 206 }); // the pistol reaches further
  await wait(30);
  assert.equal(b.of('hurt').filter(x => x.from).length, 2, 'the sword misses at 30 blocks, the pistol does not');
  [a, b, c].forEach(p => p.close());
});

test('a second connection of the same account replaces the first', async () => {
  const a = await player('a5', 'A', 'w5'),
    a2 = await player('a5', 'A', 'w5');
  await wait(50);
  assert.equal(a.of('bye')[0]?.reason, 'elsewhere');
  assert.equal(
    a2
      .of('peers')
      .at(-1)
      .list.filter(p => p.id === 'a5').length,
    1,
  );
  a2.close();
});

test('mob blows and shots travel to the players nearby', async () => {
  const a = await player('a6', 'A', 'w6'),
    b = await player('b6', 'B', 'w6');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  b.send({ t: 'pos', x: 20, y: 30, z: 0 });
  await wait(30);
  a.send({ t: 'mob', id: '0,0|170|front_runner', dmg: 5, hp: 100, x: 1, y: 30, z: 1, fx: 0, fz: 0 });
  a.send({ t: 'shot', x: 0, y: 31, z: 0, dx: 1, dy: 0, dz: 0 });
  await wait(40);
  assert.equal(b.of('mob')[0]?.hp, 100);
  assert.equal(b.of('shot')[0]?.id, 'a6');
  [a, b].forEach(p => p.close());
});

// the game, through src/net.js: with CONFIG.GAME_SERVER the real time goes through the server, under
// each player's own id, and when the server goes away everything falls back to Supabase's channels
import { broker, player as netPlayer } from './fake-supabase.mjs';
test('net.js: through the game server, then back to Supabase when it goes away', async () => {
  const own = createGameServer({ port: 0, authMode: 'test', log: () => {} }),
    port = await own.listen(),
    cfg = { GAME_SERVER: `ws://127.0.0.1:${port}` },
    b = broker(),
    // the retries after the server is gone mustn't keep the test process alive
    setTimeout = (f, ms) => {
      const t = globalThis.setTimeout(f, ms);
      t.unref();
      return t;
    },
    A = netPlayer(b, 'la', cfg, { WebSocket, token: 'test:acc-a:A', setTimeout }),
    B = netPlayer(b, 'lb', cfg, { WebSocket, token: 'test:acc-b:B', setTimeout });
  const hits = [];
  B.Net.on('hurt', h => hits.push(h));
  try {
    await A.Net.join('w', { id: 'la', name: 'A', color: '#fff' });
    await B.Net.join('w', { id: 'lb', name: 'B', color: '#fff' });
    assert.equal(A.Net.gameServer, true);
    assert.equal(B.Net.gameServer, true);
    await wait(50);
    // each sees the other, and itself under its own id
    assert.ok(A.peers().some(p => p.id === 'la') && A.peers().some(p => p.id === 'acc-b'));
    B.Net.sendPos({ id: 'lb', x: 48, y: 30, z: 46 });
    await wait(30);
    A.Net.sendPos({ id: 'la', x: 45, y: 30, z: 45 });
    await wait(50);
    assert.equal(B.got.at(-1)?.id, 'acc-a');
    assert.equal(b.billed, 0, 'nothing went through Supabase');
    // a hit on B: the server takes B's hearts, and tells B who struck
    A.Net.sendHit({ from: 'la', to: 'acc-b', item: 107 });
    await wait(50);
    const pvp = hits.find(h => h.from);
    assert.deepEqual([pvp?.from, pvp?.dmg], ['acc-a', 2]);
    assert.equal(B.Net.hpServer, true);
    // the server goes away: back to Supabase's region channels
    await own.close();
    await wait(100);
    assert.equal(A.Net.gameServer, false);
    A.Net.setRegion(5, 5);
    B.Net.setRegion(8, 6);
    const n = B.got.length;
    A.Net.sendPos({ id: 'la', x: 6, y: 30, z: 5 });
    assert.equal(B.got.length, n + 1, 'the move arrives through Supabase now');
  } finally {
    await own.close();
  }
});

import { originOk } from '../server/src/server.js';
test('only the game pages may connect', () => {
  const list = ['https://ethermines.org', '*.vercel.app', 'http://localhost:*'];
  assert.ok(originOk(list, 'https://ethermines.org'));
  assert.ok(originOk(list, 'https://ether-mines-git-branch.vercel.app'));
  assert.ok(originOk(list, 'http://localhost:8000'));
  assert.ok(!originOk(list, 'https://evil.example'));
  assert.ok(!originOk(list, 'https://ethermines.org.evil.example'));
  assert.ok(!originOk(list, undefined));
  assert.ok(originOk([], 'anything'), 'no list: open (local tests)');
});

// step 2: PvP settled by the server: the weapon you really have, its pace, the damage
import { WEAPONS, pvpDamage } from '../server/src/server.js';
import { readFileSync } from 'node:fs';
test("the server's weapons match the rules", () => {
  new Function(readFileSync(new URL('../supabase/functions/_shared/rules.js', import.meta.url), 'utf8'))();
  const { ITEM } = globalThis.Rules;
  for (const [id, dmg] of Object.entries(WEAPONS)) assert.equal(ITEM[id].dmg, dmg, ITEM[id].n);
  const known = Object.entries(ITEM)
    .filter(([, it]) => it.dmg)
    .map(([id]) => +id);
  assert.deepEqual(known.sort(), Object.keys(WEAPONS).map(Number).sort(), 'every weapon of the rules is known here');
});
test('a blow does the damage of the real weapon, at its own pace', async () => {
  const own = createGameServer({
      port: 0,
      authMode: 'test',
      log: () => {},
      owned: p => Promise.resolve(new Set(p.id === 'arm' ? [301] : [])),
    }),
    port = await own.listen();
  const saved = url;
  url = `ws://127.0.0.1:${port}`;
  try {
    const a = await player('arm', 'Armed', 'w7'),
      b = await player('bare', 'Bare', 'w7'),
      c = await player('vic', 'Victim', 'w7');
    for (const [p, x] of [
      [a, 0],
      [b, 1],
      [c, 2],
    ])
      p.send({ t: 'pos', x, y: 30, z: 0 });
    await wait(50);
    a.send({ t: 'hit', to: 'vic', item: 301 });
    a.send({ t: 'hit', to: 'vic', item: 301 }); // too soon: dropped
    await wait(700); // (a blow leaves its target a moment before the next can land)
    b.send({ t: 'hit', to: 'vic', item: 301 }); // claims a Genesis Blade it doesn't have: bare hands
    b.send({ t: 'shot', x: 1, y: 31, z: 0, dx: 1, dy: 0, dz: 0 }); // no pistol: no bolt shown
    await wait(50);
    const hits = c.of('hurt').filter(h => h.from); // (a night prowler may join in)
    assert.equal(hits.length, 2);
    assert.deepEqual([hits[0].from, hits[0].dmg], ['arm', pvpDamage(301)]);
    assert.deepEqual([hits[1].from, hits[1].dmg], ['bare', 1]);
    assert.equal(c.of('shot').length, 0);
    [a, b, c].forEach(p => p.close());
  } finally {
    url = saved;
    await own.close();
  }
});

// step 3: the mobs' health lives on the server
import { MOB_HP } from '../server/src/server.js';
test("the server's mob health is the game's own", () => {
  // both read MK from src/mobs-core.js
  assert.equal(MOB_HP.front_runner, 170);
  assert.deepEqual(Object.keys(MOB_HP).sort(), Object.keys(globalThis.MobsCore.MK).sort());
});
test('a blow on a mob is settled by the server: health, pace, reach, death, loot', async () => {
  const a = await player('ma', 'A', 'w8'),
    b = await player('mb', 'B', 'w8');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  b.send({ t: 'pos', x: 4, y: 30, z: 0 });
  await wait(30);
  const blow = (p, extra) => p.send({ t: 'mob', id: '0,0|3|shadow', item: 107, dmg: 5, x: 2, y: 30, z: 0, fx: 0, fz: 0, ...extra });
  blow(a);
  await wait(40);
  assert.deepEqual([a.of('mob')[0].hp, a.of('mob')[0].from], [5, 'ma'], 'the striker hears back');
  assert.equal(b.of('mob')[0].hp, 5, 'and the players nearby');
  blow(a); // too soon
  await wait(40);
  assert.equal(a.of('mob')[1].hp, 5, 'a blow too soon takes nothing off');
  blow(b, { item: 0, dmg: 99 }); // bare hands can't do 99: at most a critical riposte, 2.25
  await wait(40);
  assert.equal(b.of('mob').at(-1).hp, 2.75);
  await wait(400);
  blow(a, { x: 40 }); // a mob 40 blocks away is out of a sword's reach
  await wait(40);
  assert.equal(a.of('mob').at(-1).hp, 2.75);
  await wait(400);
  blow(a);
  await wait(40);
  const death = b.of('mob').at(-1);
  assert.deepEqual([death.hp, death.dead, [...death.by].sort()], [0, 1, ['ma', 'mb']], 'both took part: both get their loot');
  await wait(400);
  const n = b.of('mob').length;
  blow(a);
  await wait(40);
  assert.equal(a.of('mob').at(-1).dead, 1, 'still dead');
  assert.equal(b.of('mob').length, n, 'and nothing to tell the others');
  [a, b].forEach(p => p.close());
});
test('Pure Ether gear you wear raises the cap on a blade blow (24-gear.js)', async () => {
  const a = await player('ga', 'A', 'w8g');
  a.send({ t: 'pos', x: 0, y: 30, z: 0, hm: 309, gl: 312, lg: 318, am: 315 }); // +5 +10 +5 +8 = +28%
  await wait(30);
  a.send({ t: 'mob', id: '0,0|4|guardian', item: 107, dmg: 999, x: 1, y: 30, z: 0 });
  await wait(40);
  assert.equal(a.of('mob').at(-1).hp, 4.6, '19 - 5 x 2.25 x 1.28');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  await wait(400); // the pace of blows
  a.send({ t: 'mob', id: '0,0|5|guardian', item: 107, dmg: 999, x: 1, y: 30, z: 0 });
  await wait(40);
  assert.equal(a.of('mob').at(-1).hp, 7.75, 'without it: 19 - 5 x 2.25');
  a.close();
});
test('the Merge twins only stay down together', async () => {
  const a = await player('ta', 'A', 'w9');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  await wait(30);
  const blow = (i, type) => a.send({ t: 'mob', id: `5,5|${i}|${type}`, item: 301, dmg: 999, x: 1, y: 30, z: 0 });
  // 60 hp at 16.88 (7.5 × 2.25, the cap) a blow
  for (let n = 0; n < 6; n++) {
    blow(160, 'pow_twin');
    await wait(400);
  }
  const down = a.of('mob').at(-1);
  assert.deepEqual([down.hp, down.down, down.dead], [0, 1, undefined], 'the first only falls dormant');
  // 40 hp: three blows
  for (let n = 0; n < 3; n++) {
    blow(161, 'pos_twin');
    await wait(400);
  }
  const end = a.of('mob').at(-1);
  assert.deepEqual([end.hp, end.dead, end.both, end.by], [0, 1, 1, ['ta']]);
  a.close();
});

// step 4: the screen a mob is after leads it, the others follow
test('the mobs a screen leads, and their bolts, reach the players nearby', async () => {
  const a = await player('la1', 'A', 'w10'),
    b = await player('lb1', 'B', 'w10'),
    c = await player('lc1', 'C', 'w10');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  b.send({ t: 'pos', x: 10, y: 30, z: 0 });
  c.send({ t: 'pos', x: 900, y: 30, z: 0 });
  await wait(30);
  const list = [
    { id: '0,0|3|shadow', x: 1, y: 30, z: 0, r: 0.5, d: 1.2, f: 2 },
    { id: 'nonsense', x: 1, y: 30, z: 0, r: 0, d: 1 },
    { id: '0,0|4|bat', x: 'far', y: 30, z: 0, r: 0, d: 1 },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `0,0|${10 + i}|bat`, x: 1, y: 30, z: 0, r: 0, d: 1 })),
  ];
  a.send({ t: 'mobs', list });
  a.send({ t: 'mobshot', id: '0,0|3|shadow', x: 1, y: 31, z: 0, vx: 8, vy: 0, vz: 0, c: 0x5fe8ff, s: 1.6 });
  await wait(40);
  const got = b.of('mobs')[0];
  assert.equal(got.from, 'la1');
  assert.deepEqual(got.list[0], { id: '0,0|3|shadow', x: 1, y: 30, z: 0, r: 0.5, d: 1.2, f: 2 });
  assert.equal(got.list.length, 22, 'bad entries dropped, 24 at most looked at');
  assert.equal(b.of('mobshot')[0]?.c, 0x5fe8ff);
  assert.equal(c.of('mobs').length + c.of('mobshot').length, 0, 'too far: nothing');
  assert.equal(a.of('mobs').length, 0, 'not back to the sender');
  [a, b, c].forEach(p => p.close());
});

// step 5: the server runs the mobs itself
test("the server runs the world's mobs: it says so, and tells each player where they stand", async () => {
  const a = await player('sm1', 'A', 'w11');
  assert.equal(a.of('welcome')[0].mobs, 1);
  a.send({ t: 'pos', x: 150, y: 30, z: -80 });
  await wait(1500); // the terrain around is generated a few chunks a tick
  const seen = a.of('ms').flatMap(m => m.l);
  assert.ok(seen.length > 0, 'mobs around');
  const [id, x, , z] = seen[0];
  assert.match(id, /^-?\d+,-?\d+\|\d+\|[a-z_]+$/);
  assert.ok(Math.hypot(x - 150, z + 80) <= 48);
  a.close();
});

test('a restored world: the server reads its terrain again', async () => {
  let at = '2026-01-01',
    reads = 0;
  const logs = [];
  const s2 = createGameServer({
    port: 0,
    authMode: 'test',
    log: m => logs.push(m),
    restoreMs: 50,
    restoresOf: async list => list.map(world => ({ world, at })),
    fetchArea: async () => {
      reads++;
      return { chunks: [], edits: [] };
    },
  });
  const port = await s2.listen(),
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise(r => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, world: 'rw', token: 'test:r1:R' }));
  await wait(100);
  ws.send(JSON.stringify({ t: 'pos', x: 150, y: 30, z: -80 }));
  await wait(400);
  const before = reads;
  assert.ok(before > 0, 'the terrain was read');
  assert.ok(!logs.some(m => /restored/.test(m)), 'nothing restored yet');
  at = '2026-02-02';
  await wait(400);
  assert.ok(logs.some(m => /rw: restored/.test(m)));
  assert.ok(reads > before, 'read again');
  ws.close();
  s2.close();
});
