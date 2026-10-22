// Golden data for WorldParity.cs: the web version's generator (world.js) run on a broad set of chunks and
// sample points, written to golden/ (gitignored). Run from unity/CoreTests:  node golden.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../supabase/functions/_shared/world.js');
const W = globalThis.World;
const out = new URL('./golden/', import.meta.url);
mkdirSync(out, { recursive: true });

// a fixed-seed PRNG (mulberry32), so the "random" samples never change between runs
let st = 0x9e3779b9;
const rnd = () => {
  st = (st + 0x6d2b79f5) | 0;
  let t = Math.imul(st ^ (st >>> 15), 1 | st);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------- chunks ----------
const chunks = new Map();
const add = (cx, cz) => chunks.set(cx + ',' + cz, [cx, cz]);
const addBox = (x0, z0, x1, z1) => {
  for (let cz = W.cOf(z0); cz <= W.cOf(z1); cz++) for (let cx = W.cOf(x0); cx <= W.cOf(x1); cx++) add(cx, cz);
};
for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) add(cx, cz);
const structs = { tower: 0, merge: 0, arena: 0 };
for (let j = -8; j <= 8; j++)
  for (let i = -8; i <= 8; i++) {
    const t = W.towerAt(i, j);
    if (t) {
      structs.tower++;
      addBox(t.x - W.TR - 2, t.z - W.TR - 18, t.x + W.TR + 2, t.z + W.TR + 2);
    }
  }
for (let j = -3; j <= 3; j++)
  for (let i = -3; i <= 3; i++) {
    const m = W.mergeAt(i, j);
    if (m) {
      structs.merge++;
      addBox(m.x - W.MERGE_R - 3, m.z - W.MERGE_R - 3, m.x + W.MERGE_R + 3, m.sz + 4);
    }
    const a = W.arenaAt(i, j);
    if (a) {
      structs.arena++;
      addBox(a.x - 40, a.z - 40, a.x + 40, a.z + 40);
    }
  }
for (let n = 0; n < 300; n++) add(ri(-3000, 3000), ri(-3000, 3000));
const list = [...chunks.values()];
const CV = W.CV;
const buf = Buffer.alloc(4 + list.length * (8 + CV));
buf.writeInt32LE(list.length, 0);
let off = 4;
const t0 = performance.now();
for (const [cx, cz] of list) {
  buf.writeInt32LE(cx, off);
  buf.writeInt32LE(cz, off + 4);
  Buffer.from(W.genChunk(cx, cz).buffer).copy(buf, off + 8);
  off += 8 + CV;
}
const jsMs = (performance.now() - t0) / list.length;
writeFileSync(new URL('world-chunks.bin', out), buf);

// ---------- functions ----------
const pts = [];
for (let z = -40; z <= 40; z += 3) for (let x = -40; x <= 40; x += 3) pts.push([x, z]);
for (let n = 0; n < 1500; n++) pts.push([ri(-1000, 1000), ri(-1000, 1000)]);
for (let n = 0; n < 1000; n++) pts.push([ri(-100000, 100000), ri(-100000, 100000)]);
for (let n = 0; n < 200; n++) pts.push([(rnd() - 0.5) * 2000, (rnd() - 0.5) * 2000]); // fractional coordinates
const fn = { pts: [], hash: [], hash3: [], vn2: [], vn3: [], isIsland: [], topAt: [] };
for (const [x, z] of pts)
  fn.pts.push([x, z, W.heightAt(x, z), W.biome(x, z), W.contAt(x, z), W.islandZone(x, z) ? 1 : 0, W.islandTop(x, z), W.inCity(x, z) ? 1 : 0, W.inCircuits(x, z, 3) ? 1 : 0, W.onPath(x, z) ? 1 : 0]);
const big = [0, 1, -1, 7, -123456, 2147483647, 2147483648, -2147483649, 4294967296 + 17, 3e9, -5e9, 1e15 + 3, 1.5, -2.7, 0.49999];
for (const x of big) for (const y of big) for (const s of [0, 7, -3]) fn.hash.push([x, y, s, W.hash(x, y, s)]);
for (let n = 0; n < 500; n++) {
  const x = ri(-200000, 200000),
    y = ri(-100, 200),
    z = ri(-200000, 200000),
    s = ri(0, 400);
  fn.hash.push([x, y, s, W.hash(x, y, s)]);
  fn.hash3.push([x, y, z, s, W.hash3(x, y, z, s)]);
  const fx = (rnd() - 0.5) * 5000,
    fy = rnd() * 64,
    fz = (rnd() - 0.5) * 5000;
  fn.vn2.push([fx, fz, s % 20, W.vn2(fx, fz, s % 20)]);
  fn.vn3.push([fx, fy, fz, s % 20, W.vn3(fx, fy, fz, s % 20)]);
}
for (let n = 0; n < 2000; n++) {
  const x = ri(-3000, 3000),
    y = ri(40, 60),
    z = ri(-3000, 3000);
  fn.isIsland.push([x, y, z, W.isIsland(x, y, z) ? 1 : 0]);
}
for (let h = 0; h < 64; h++) for (const b of ['plain', 'forest', 'dunes']) fn.topAt.push([h, b, W.topAt(h, b)]);
const S = (o, ...k) => (o ? k.map(n => o[n]) : null);
const grid = (r, f) => {
  const o = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) o.push([i, j, f(i, j)]);
  return o;
};
fn.ruin = grid(15, (i, j) => S(W.ruinAt(i, j), 'x', 'z', 'y'));
fn.garden = grid(20, (i, j) => S(W.gardenAt(i, j), 'x', 'z', 'y'));
fn.tower = grid(15, (i, j) => S(W.towerAt(i, j), 'x', 'z', 'y'));
fn.merge = grid(8, (i, j) => S(W.mergeAt(i, j), 'x', 'z', 'y', 'sx', 'sz', 'g'));
fn.arena = grid(6, (i, j) => S(W.arenaAt(i, j), 'x', 'z', 'y'));
for (let n = 0; n < 40; n++) {
  const i = ri(-1000, 1000),
    j = ri(-1000, 1000);
  fn.ruin.push([i, j, S(W.ruinAt(i, j), 'x', 'z', 'y')]);
  fn.garden.push([i, j, S(W.gardenAt(i, j), 'x', 'z', 'y')]);
  fn.tower.push([i, j, S(W.towerAt(i, j), 'x', 'z', 'y')]);
  fn.merge.push([i, j, S(W.mergeAt(i, j), 'x', 'z', 'y', 'sx', 'sz', 'g')]);
  fn.arena.push([i, j, S(W.arenaAt(i, j), 'x', 'z', 'y')]);
}
fn.cityPlot = [];
for (let j = -2; j <= 9; j++) for (let i = -2; i <= 9; i++) fn.cityPlot.push([i, j, S(W.cityPlot(i, j), 't', 'H', 'cx', 'cz')]);
fn.consts = { GEN: W.GEN, SEED: W.SEED, SPAWN: [W.SPAWN.x, W.SPAWN.z, W.SPAWN.y], SEA: W.SEA };
fn.encode = [];
for (const [cx, cz] of [
  [0, 0],
  [0, -4],
  [-1, -5],
  [4, 6],
  [5, 6],
  [-7, 3],
  [1234, -987],
])
  fn.encode.push([cx, cz, W.encodeChunk(W.genChunk(cx, cz))]);
writeFileSync(new URL('world-fn.json', out), JSON.stringify(fn));
console.log(`golden: ${list.length} chunks (${structs.tower} towers, ${structs.merge} merges, ${structs.arena} arenas), ${pts.length} points, JS ${jsMs.toFixed(2)} ms/chunk`);
