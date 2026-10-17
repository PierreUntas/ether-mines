// Realtime traffic: two players on a fake Supabase broker that counts messages the way Supabase bills
// them (one for the send, one per receiver). Checks that positions only reach nearby players and that
// a player alone in their part of the world sends nothing. node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { broker, player } from './fake-supabase.mjs';

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

test('a blow on a mob reaches the players nearby, and nobody when you fight alone', async () => {
  const b = broker(),
    A = player(b, 'a'),
    B = player(b, 'b');
  const blows = [];
  B.Net.on('mob', m => blows.push(m));
  await A.Net.join('w', { id: 'a', name: 'A', color: '#fff' });
  await B.Net.join('w', { id: 'b', name: 'B', color: '#fff' });
  A.Net.setRegion(0, 0);
  B.Net.setRegion(3000, 3000);
  const before = b.billed;
  A.Net.sendMob({ id: '0,0|100|shadow', dmg: 4, hp: 6 });
  assert.equal(b.billed - before, 0, 'alone in your part of the world: nothing sent');
  B.Net.setRegion(40, 10);
  A.Net.sendMob({ id: '0,0|100|shadow', dmg: 4, hp: 2 });
  assert.equal(blows.length, 1);
  assert.equal(blows[0].hp, 2);
});
