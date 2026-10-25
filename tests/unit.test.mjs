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

test('play.html loads every game file, in order', async () => {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../src/game/', import.meta.url)).filter((f) => f.endsWith('.js')).sort();
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
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

test('mesh: the rounded land is closed (no hole at any junction)', () => {
  // every triangle edge's points lie on another triangle's edge or inside another triangle: a closed surface,
  // on a lumpy land with holes, steps, overhangs, leaves and glass (water and slabs aren't closed shapes)
  const M = globalThis.Mesh, B = globalThis.Rules.B;
  const LEAF = +Object.keys(B).find(k => B[k] && B[k].leaf),
    GLASS = +Object.keys(B).find(k => B[k] && B[k].glass && !B[k].shape);
  for (let seed0 = 1; seed0 <= 2; seed0++) {
    let seed = seed0;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const cells = new Map(),
      K = (x, y, z) => x + ',' + y + ',' + z;
    for (let x = -2; x < 18; x++)
      for (let z = -2; z < 18; z++) {
        const h = 4 + Math.floor(rnd() * 4);
        for (let y = 0; y < h; y++) cells.set(K(x, y, z), rnd() < 0.08 ? 0 : 3);
        if (rnd() < 0.15) cells.set(K(x, h + 1, z), 3);
        if (rnd() < 0.1) cells.set(K(x, h, z), LEAF);
        if (rnd() < 0.06) cells.set(K(x, h, z), GLASS);
      }
    const get = (x, y, z) => cells.get(K(x, y, z)) || 0;
    const m = M.pack(M.meshChunk(0, 0, get, () => false));
    const P = [], T = [];
    for (const g of ['op', 'gl']) {
      const X = m[g];
      if (!X) continue;
      const b = P.length / 3;
      P.push(...X.pos);
      for (const i of X.idx) T.push(i + b);
    }
    const pt = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const tris = [];
    for (let i = 0; i < T.length; i += 3) tris.push([pt(T[i]), pt(T[i + 1]), pt(T[i + 2])]);
    // the triangles by the unit cells they touch
    const grid = new Map();
    tris.forEach((t, ti) => {
      const lo = [0, 1, 2].map(k => Math.floor(Math.min(t[0][k], t[1][k], t[2][k]) - 1e-4)),
        hi = [0, 1, 2].map(k => Math.floor(Math.max(t[0][k], t[1][k], t[2][k]) + 1e-4));
      for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
          for (let z = lo[2]; z <= hi[2]; z++) {
            const k = K(x, y, z);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(ti);
          }
    });
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
      dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
      cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // p on the triangle (its edges included), within 1e-4
    const onTri = (p, [a, b, c]) => {
      const e1 = sub(b, a), e2 = sub(c, a), q = sub(p, a), nn = cross(e1, e2), L = Math.hypot(...nn);
      if (L < 1e-12 || Math.abs(dot(q, nn) / L) > 1e-4) return false;
      const d00 = dot(e1, e1), d01 = dot(e1, e2), d11 = dot(e2, e2), d20 = dot(q, e1), d21 = dot(q, e2), den = d00 * d11 - d01 * d01;
      const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, tol = 1e-4 / Math.sqrt(Math.min(d00, d11));
      return v > -tol && w > -tol && v + w < 1 + tol;
    };
    let open = 0, first = null;
    tris.forEach((t, ti) => {
      for (let k = 0; k < 3; k++)
        for (const f of [0.25, 0.5, 0.75]) {
          const a = t[k], b = t[(k + 1) % 3], p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
          if (p[0] < 1 || p[0] > 15 || p[2] < 1 || p[2] > 15 || p[1] < 0.01) continue; // the chunk's own border
          const near = new Set();
          for (const dx of [-1e-4, 1e-4]) for (const dy of [-1e-4, 1e-4]) for (const dz of [-1e-4, 1e-4]) for (const o of grid.get(K(Math.floor(p[0] + dx), Math.floor(p[1] + dy), Math.floor(p[2] + dz))) || []) near.add(o);
          let ok = false;
          for (const o of near) if (o !== ti && onTri(p, tris[o])) { ok = true; break; }
          if (!ok && open++ === 0) first = p.map(v => v.toFixed(3));
        }
    });
    assert.equal(open, 0, `seed ${seed0}: ${open} open edge points, the first at ${first}`);
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

// the Mempool (arenaAt): one within reach of the spawn, a flat open floor, and four gates you can walk
// through from the floor down (or up) to the natural ground, one block at most per step
test('the Mempool: a flat floor, open sky above it, and four walkable gates', () => {
  const found = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const a = W.arenaAt(i, j); if (a) found.push(a); }
  found.sort((a, b) => Math.hypot(a.x - W.SPAWN.x, a.z - W.SPAWN.z) - Math.hypot(b.x - W.SPAWN.x, b.z - W.SPAWN.z));
  assert.ok(found.length && Math.hypot(found[0].x - W.SPAWN.x, found[0].z - W.SPAWN.z) < 300, 'a Mempool within 300 blocks of the spawn');
  const cache = new Map();
  const get = (x, y, z) => {
    const k = W.cOf(x) + ',' + W.cOf(z);
    if (!cache.has(k)) cache.set(k, W.genChunk(W.cOf(x), W.cOf(z)));
    return y < 0 || y >= W.SY ? 0 : cache.get(k)[W.li(x - W.cOf(x) * W.CH, y, z - W.cOf(z) * W.CH)];
  };
  const solid = (id) => id > 0 && id !== 11 && !(R.B[id]?.x != null);
  for (const A of found.slice(0, 3)) {
    for (let dx = -W.ARENA_R; dx <= W.ARENA_R; dx++)
      for (let dz = -W.ARENA_R; dz <= W.ARENA_R; dz++) {
        if (Math.hypot(dx, dz) > W.ARENA_R - 0.5) continue;
        assert.ok(solid(get(A.x + dx, A.y, A.z + dz)), `floor at ${dx},${dz}`);
        for (let k = 1; k <= 10; k++) assert.equal(get(A.x + dx, A.y + k, A.z + dz), 0, `open above the floor at ${dx},${dz},+${k}`);
      }
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let lvl = A.y + 1; // standing height
      for (let s = 1; s <= W.ARENA_W + 11; s++) {
        const x = A.x + ux * s, z = A.z + uz * s;
        let best = null;
        for (let y = lvl - 1; y <= lvl + 1; y++) if (solid(get(x, y - 1, z)) && !solid(get(x, y, z)) && !solid(get(x, y + 1, z))) { best = y; break; }
        assert.ok(best !== null, `gate ${ux},${uz} of the Mempool at ${A.x},${A.z}: no step at ${s} (from ${lvl})`);
        lvl = best;
      }
    }
  }
});
