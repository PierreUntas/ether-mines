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

test('a blow on a player reaches only that player, and only within reach', async () => {
  const a = await player('a4', 'A', 'w4'),
    b = await player('b4', 'B', 'w4'),
    c = await player('c4', 'C', 'w4');
  a.send({ t: 'pos', x: 0, y: 30, z: 0 });
  b.send({ t: 'pos', x: 3, y: 30, z: 0 });
  c.send({ t: 'pos', x: 2, y: 30, z: 1 });
  await wait(30);
  a.send({ t: 'hit', to: 'b4', item: 107 });
  await wait(30);
  assert.equal(b.of('hit').length, 1);
  assert.equal(b.of('hit')[0].from, 'a4');
  assert.equal(c.of('hit').length, 0);
  b.send({ t: 'pos', x: 30, y: 30, z: 0 });
  await wait(500);
  a.send({ t: 'hit', to: 'b4', item: 107 });
  a.send({ t: 'hit', to: 'b4', item: 206 }); // the pistol reaches further
  await wait(30);
  assert.equal(b.of('hit').length, 2, 'the sword misses at 30 blocks, the pistol does not');
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
  B.Net.on('hit', h => hits.push(h));
  try {
    await A.Net.join('w', { id: 'la', name: 'A', color: '#fff' });
    await B.Net.join('w', { id: 'lb', name: 'B', color: '#fff' });
    assert.equal(A.Net.gameServer, true);
    assert.equal(B.Net.gameServer, true);
    await wait(50);
    // each sees the other, and itself under its own id
    assert.ok(A.peers().some(p => p.id === 'la') && A.peers().some(p => p.id === 'acc-b'));
    B.Net.sendPos({ id: 'lb', x: 8, y: 30, z: 6 });
    await wait(30);
    A.Net.sendPos({ id: 'la', x: 5, y: 30, z: 5 });
    await wait(50);
    assert.equal(B.got.at(-1)?.id, 'acc-a');
    assert.equal(b.billed, 0, 'nothing went through Supabase');
    // a hit on B arrives addressed to B's own id
    A.Net.sendHit({ from: 'la', to: 'acc-b', item: 107 });
    await wait(50);
    assert.equal(hits[0]?.to, 'lb');
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
    await wait(50);
    b.send({ t: 'hit', to: 'vic', item: 301 }); // claims a Genesis Blade it doesn't have: bare hands
    b.send({ t: 'shot', x: 1, y: 31, z: 0, dx: 1, dy: 0, dz: 0 }); // no pistol: no bolt shown
    await wait(50);
    const hits = c.of('hit');
    assert.equal(hits.length, 2);
    assert.deepEqual([hits[0].from, hits[0].item, hits[0].dmg], ['arm', 301, pvpDamage(301)]);
    assert.deepEqual([hits[1].from, hits[1].item, hits[1].dmg], ['bare', 0, 1]);
    assert.equal(c.of('shot').length, 0);
    [a, b, c].forEach(p => p.close());
  } finally {
    url = saved;
    await own.close();
  }
});
