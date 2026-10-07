// Quick tests for the shared generator and rules: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const load = (f) => new Function(readFileSync(new URL('../' + f, import.meta.url), 'utf8'))();
load('supabase/functions/_shared/world.js');
load('supabase/functions/_shared/rules.js');
load('src/mesh.js');
const W = globalThis.World, R = globalThis.Rules;

test('the generator is deterministic', () => {
  for (const [cx, cz] of [[0, 0], [5, -3], [-40, 17]]) assert.deepEqual(W.genChunk(cx, cz), W.genChunk(cx, cz));
});

test('chunk encoding: exact round trip', () => {
  for (const [cx, cz] of [[0, 0], [3, 9], [-12, -7]]) {
    const a = W.genChunk(cx, cz);
    assert.deepEqual(W.decodeChunk(W.encodeChunk(a), W.SY), a);
  }
});

test('bedrock at the bottom, nothing above the ceiling', () => {
  for (const [cx, cz] of [[0, 0], [8, 8], [-20, 3]]) {
    const a = W.genChunk(cx, cz);
    for (let i = 0; i < W.CH * W.CH; i++) assert.equal(a[i], 12, 'layer 0 = bedrock');
    assert.equal(a.length, W.CV);
  }
});

test('the sanctuary and the first ruin exist', () => {
  const s = W.genChunk(W.cOf(W.SPAWN.x), W.cOf(W.SPAWN.z));
  assert.equal(s[W.li(W.SPAWN.x & 15, W.SPAWN.y, W.SPAWN.z & 15)], 13, 'sanctuary validator');
  const r = W.ruinAt(0, 0);
  assert.ok(r, 'ruin in the sanctuary region');
  const a = W.genChunk(W.cOf(r.x), W.cOf(r.z));
  assert.equal(a[W.li(r.x & 15, r.y + 1, r.z & 15)], 73, 'dark validator at the center of the ruin');
});

test('rules: every recipe produces a known item, one recipe per item', () => {
  const outs = R.RECIPES.map((r) => r.out);
  assert.equal(new Set(outs).size, outs.length, 'unique recipe outputs (the server identifies them this way)');
  for (const r of R.RECIPES) {
    assert.ok(R.B[r.out] || R.ITEM[r.out], `unknown output ${r.out}`);
    for (const k of Object.keys(r.need)) assert.ok(R.B[k] || R.ITEM[k], `unknown ingredient ${k}`);
  }
});

test('rules: placeable items give existing blocks', () => {
  for (const k of Object.keys(R.B)) for (const id of R.placeIds(+k)) assert.ok(R.B[id], `block ${id} placed from ${k}`);
});

test('supabase/rules.sql is up to date with rules.js', () => {
  const gen = execFileSync('node', [new URL('../tools/rules.mjs', import.meta.url).pathname]).toString();
  const file = readFileSync(new URL('../supabase/rules.sql', import.meta.url), 'utf8');
  assert.equal(gen.trim(), file.trim(), 're-run: node tools/rules.mjs > supabase/rules.sql');
});

test('index.html loads every game file, in order', async () => {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../src/game/', import.meta.url)).filter((f) => f.endsWith('.js')).sort();
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const loaded = [...html.matchAll(/src="src\/game\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(loaded, files);
});

test('mesh: valid triangles, identical from one computation to the next', () => {
  const cache = new Map();
  const chunk = (cx, cz) => cache.get(cx + ',' + cz) ?? cache.set(cx + ',' + cz, W.genChunk(cx, cz)).get(cx + ',' + cz);
  const get = (x, y, z) => {
    if (y < 0 || y >= W.SY) return 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    return chunk(cx, cz)[W.li(x - cx * 16, y, z - cz * 16)];
  };
  const M = globalThis.Mesh;
  const a = M.pack(M.meshChunk(0, 0, get, () => false)), b = M.pack(M.meshChunk(0, 0, get, () => false));
  assert.ok(a.op && a.op.idx.length > 0, 'some opaque faces');
  for (const g of Object.values(a).filter(Boolean)) {
    assert.equal(g.pos.length % 3, 0);
    assert.ok(Math.max(...g.idx) < g.pos.length / 3, 'indices within bounds');
  }
  assert.deepEqual(a.op.pos, b.op.pos);
});

test('mesh: every shaped block (plate, stairs, door, cable, lever…) meshes, powered or not', () => {
  const M = globalThis.Mesh, B = globalThis.Rules.B;
  const shapes = Object.keys(B).map(Number).filter(id => B[id] && B[id].shape);
  assert.ok(shapes.includes(66), 'the pressure plate is a shape');
  for (const id of shapes)
    for (const on of [false, true]) {
      // a stone floor and the block placed on it, in the middle of the chunk
      const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 ? (y === 10 ? 3 : y === 11 && x === 8 && z === 8 ? id : 0) : 0);
      const m = M.pack(M.meshChunk(0, 0, get, () => on));
      assert.ok(m.op && m.op.idx.length > 0, `block ${id} (${B[id].n}) meshed`);
    }
});

test('rules: no number is both a block and an item', () => {
  const doubles = Object.keys(R.ITEM).filter(k => R.B[k]);
  assert.deepEqual(doubles, [], `duplicate numbers: ${doubles.join(', ')}`);
  for (const id of Object.keys(R.B)) assert.ok(+id > 0 && +id < 256, `block ${id}: chunks store blocks in one byte`);
});

test('supabase/installation.sql is up to date with the migrations and the rules', () => {
  const gen = execFileSync('node', [new URL('../tools/installation.mjs', import.meta.url).pathname]).toString();
  const file = readFileSync(new URL('../supabase/installation.sql', import.meta.url), 'utf8');
  assert.equal(gen.trim(), file.trim(), 're-run: node tools/installation.mjs > supabase/installation.sql');
});
