// Realtime traffic: two players on a fake Supabase broker that counts messages the way Supabase bills
// them (one for the send, one per receiver). Checks that positions only reach nearby players and that
// a player alone in their part of the world sends nothing. node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/net.js', import.meta.url), 'utf8');

function broker() {
  const subs = new Map(); // channel name -> Set of channels
  const b = { billed: 0 };
  const members = name => subs.get(name) || new Set();
  b.client = () => {
    const mk = name => {
      const h = [];
      const c = {
        name,
        state: null,
        on(type, filter, cb) {
          h.push({ type, event: filter.event, cb });
          return c;
        },
        subscribe(cb) {
          if (!subs.has(name)) subs.set(name, new Set());
          subs.get(name).add(c);
          cb && cb('SUBSCRIBED');
          return c;
        },
        send({ event, payload }) {
          b.billed++;
          for (const o of members(name))
            if (o !== c)
              for (const x of o.h)
                if (x.type === 'broadcast' && x.event === event) {
                  b.billed++;
                  x.cb({ payload });
                }
        },
        async track(state) {
          c.state = state;
          for (const o of members(name)) for (const x of o.h) if (x.type === 'presence') x.cb();
        },
        presenceState() {
          const st = {};
          for (const o of members(name)) if (o.state) st[o.key] = [o.state];
          return st;
        },
        h,
      };
      return c;
    };
    let key = null;
    return {
      setKey: k => (key = k),
      channel(name, cfg) {
        const c = mk(name);
        c.key = cfg?.config?.presence?.key || key;
        return c;
      },
      removeChannel(c) {
        members(c.name).delete(c);
      },
      auth: {},
      rpc: async () => ({}),
    };
  };
  return b;
}

function player(b, id) {
  const fake = b.client();
  fake.setKey(id);
  const ctx = { window: { CONFIG: { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'y' }, supabase: { createClient: () => fake } }, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const Net = ctx.window.Net,
    got = [];
  let peers = [];
  Net.on('pos', p => got.push(p));
  Net.on('peers', l => (peers = l));
  return { Net, got, peers: () => peers, id };
}

test('positions only reach players within one region square, and nobody sends alone', async () => {
  const b = broker(),
    A = player(b, 'a'),
    B = player(b, 'b');
  await A.Net.join('w', { id: 'a', name: 'A', color: '#fff' });
  await B.Net.join('w', { id: 'b', name: 'B', color: '#fff' });
  A.Net.setRegion(0, 0);
  B.Net.setRegion(1000, 1000);
  assert.equal(A.Net.anyoneNear(A.peers()), false, 'far apart: A has nobody to send to');
  assert.equal(B.Net.anyoneNear(B.peers()), false);
  // even if A sent anyway, B (far) wouldn't receive it
  A.Net.sendPos({ id: 'a', x: 0, y: 0, z: 0 });
  assert.equal(B.got.length, 0);
  // B comes close: both see each other
  B.Net.setRegion(120, 30);
  assert.equal(A.Net.anyoneNear(A.peers()), true);
  A.Net.sendPos({ id: 'a', x: 1, y: 0, z: 1 });
  assert.equal(B.got.length, 1);
  const before = b.billed;
  B.Net.sendPos({ id: 'b', x: 120, y: 0, z: 30 });
  assert.equal(b.billed - before, 2, 'one send + one receiver');
  assert.equal(A.got.length, 1);
});

test('/join: watching a far square makes the player there start sending', async () => {
  const b = broker(),
    A = player(b, 'a'),
    B = player(b, 'b');
  await A.Net.join('w', { id: 'a', name: 'A', color: '#fff' });
  await B.Net.join('w', { id: 'b', name: 'B', color: '#fff' });
  A.Net.setRegion(0, 0);
  B.Net.setRegion(5000, -3000);
  assert.equal(B.Net.anyoneNear(B.peers()), false);
  const r = A.peers().find(p => p.id === 'b').r;
  A.Net.watchRegion(r);
  assert.equal(B.Net.anyoneNear(B.peers()), true, 'B knows A is watching');
  B.Net.sendPos({ id: 'b', x: 5000, y: 30, z: -3000 });
  assert.equal(A.got.at(-1)?.x, 5000);
});
