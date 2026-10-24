// Golden data for MeshParity.cs: the web version's rules (rules.js) and chunk mesher (src/mesh.js) run on
// test worlds, their exact outputs dumped to golden/. Run from anywhere:  node unity/CoreTests/golden-mesh.mjs
//   golden/rules-golden.json   every rules entry in a canonical form + typed fields, and the functions' outputs
//   golden/mesh-<case>.world   the 3 x 3 chunks around the meshed one (dz -1..1, then dx -1..1; CV bytes each)
//   golden/mesh-<case>.bin     meshChunk + pack output: per group op, gl, wa, pl, the arrays pos, nor, uv,
//                              col (op and gl only), idx, edge (op and gl only); float32 / uint32 little-endian, back to back
//   golden/mesh-<case>.json    cx, cz, powered rule, and each group's vertex and index counts (null: empty)
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../supabase/functions/_shared/world.js');
require('../../supabase/functions/_shared/rules.js');
require('../../src/mesh.js');
const W = globalThis.World,
  R = globalThis.Rules,
  M = globalThis.Mesh;
const { SY, CH, CV, li } = W;
const out = new URL('./golden/', import.meta.url);
mkdirSync(out, { recursive: true });

// ---------- rules ----------
const canon = v => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canon(v[k]))
      .join(',') +
    '}'
  );
};
const num = n => (n === undefined || n === null ? 'none' : String(n));
const flag = v => (v ? 1 : 0);
const typedBlock = b =>
  [
    b.n,
    b.t ? b.t.join(',') : '',
    b.tOn ? b.tOn.join(',') : '',
    b.x ?? -1,
    num(b.h),
    num(b.drop),
    flag(b.stone),
    flag(b.leaf),
    flag(b.glass),
    flag(b.water),
    flag(b.pass),
    flag(b.open),
    flag(b.top),
    flag(b.on),
    flag(b.faces),
    flag(b.sign),
    b.shape || '',
    b.gate || '',
    b.o || 0,
    b.f || 0,
    num(b.tier),
    num(b.icon),
    b.boxes ? JSON.stringify(b.boxes) : '',
    b.bt ? JSON.stringify(b.bt) : '',
  ].join('|');
const typedItem = i =>
  [i.n, i.icon, num(i.tool), num(i.tier), num(i.dmg), num(i.armor), num(i.boots), flag(i.nft), flag(i.ranged), i.use || '', i.hover ? i.hover.model + ':' + i.hover.k : ''].join('|');
const typedCos = c =>
  [
    c.n,
    c.category,
    c.price,
    c.slot || '',
    c.style || '',
    c.set || '',
    c.color || '',
    c.pants || '',
    c.accent || '',
    c.detail || '',
    flag(c.limited),
    flag(c.retired),
    flag(c.prime),
    c.grantItem ? c.grantItem + 'x' + c.grantQty : '',
  ].join('|');
const typedRecipe = r =>
  [r.out, r.n, Object.entries(r.need).map(([k, v]) => k + ':' + v).join(','), r.d, r.cat, flag(r.nft), num(r.req)].join('|');
const map = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
const times = [0, 345599, 345600, 345601, 949999, 950400, 1e9, 1.7e9, 1761134400, 1761134399.5, 2e9, -1e6];
const weeks = [];
for (let w = -4; w <= 120; w++) weeks.push(w);
weeks.push(2900, 2901, 2902, 99999);
const prices = [];
for (const id of Object.keys(R.COSMETICS)) for (const w of [0, 1, 2, 3, 17, 2900, 2901]) prices.push([+id, w, R.shopPrice(id, w)]);
const rg = {
  counts: { B: Object.keys(R.B).length, ITEM: Object.keys(R.ITEM).length, RECIPES: R.RECIPES.length, COSMETICS: Object.keys(R.COSMETICS).length, SETS: Object.keys(R.SETS).length },
  B: map(R.B, b => [canon(b), typedBlock(b)]),
  ITEM: map(R.ITEM, i => [canon(i), typedItem(i)]),
  RECIPES: R.RECIPES.map(r => [canon(r), typedRecipe(r)]),
  COSMETICS: map(R.COSMETICS, c => [canon(c), typedCos(c)]),
  SETS: canon(R.SETS),
  PASTELS: canon(R.PASTELS),
  STAINED: canon(R.STAINED),
  reqTier: Array.from({ length: 301 }, (_, i) => R.reqTier(i)),
  placeIds: Array.from({ length: 301 }, (_, i) => R.placeIds(i)),
  shopWeek: times.map(t => [t, R.shopWeek(t)]),
  featured: weeks.map(w => {
    const f = R.shopFeatured(w);
    return [w, f.sale.map(s => s ?? null), f.limited ?? null];
  }),
  prices,
  forSale: map(R.COSMETICS, c => R.forSale(c)),
};
writeFileSync(new URL('rules-golden.json', out), JSON.stringify(rg));

// ---------- mesh ----------
const mulberry = a => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const IDS = Object.keys(R.B).map(Number);
const PW = {
  none: () => false,
  // the same rule in MeshParity.cs
  hash: k => {
    const [x, y, z] = k.split(',').map(Number);
    return ((x * 31 + y * 17 + z * 7) & 3) === 0;
  },
};
const cases = [];
function runCase(name, cx, cz, chunks, pw) {
  const get = (x, y, z) => {
    if (y < 0 || y >= SY) return 0;
    const ccx = Math.floor(x / CH),
      ccz = Math.floor(z / CH),
      dx = ccx - cx,
      dz = ccz - cz;
    if (dx < -1 || dx > 1 || dz < -1 || dz > 1) return 0;
    return chunks[(dz + 1) * 3 + dx + 1][li(x - ccx * CH, y, z - ccz * CH)];
  };
  const t0 = performance.now();
  const P = M.pack(M.meshChunk(cx, cz, get, PW[pw]));
  const ms = performance.now() - t0;
  const world = Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  writeFileSync(new URL(`mesh-${name}.world`, out), world);
  const bufs = [],
    meta = { cx, cz, pw, groups: {} };
  for (const g of ['op', 'gl', 'wa', 'pl']) {
    const G = P[g];
    if (!G) {
      meta.groups[g] = null;
      continue;
    }
    meta.groups[g] = { nv: G.pos.length / 3, ni: G.idx.length, col: !!G.col };
    for (const a of [G.pos, G.nor, G.uv, G.col, G.idx, G.edge]) if (a) bufs.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  writeFileSync(new URL(`mesh-${name}.bin`, out), Buffer.concat(bufs));
  writeFileSync(new URL(`mesh-${name}.json`, out), JSON.stringify(meta));
  cases.push(name);
  console.log(name, cx, cz, pw, Object.entries(meta.groups).map(([k, v]) => k + ':' + (v ? v.nv : 0)).join(' '), ms.toFixed(1) + ' ms');
}
const around = (cx, cz, gen) => {
  const cs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(gen(cx + dx, cz + dz, dx, dz));
  return cs;
};

// (a) real chunks from the generator, with their 8 neighbors
const real = [
  ['spawn', W.cOf(W.SPAWN.x), W.cOf(W.SPAWN.z)],
  ['city', W.cOf(W.CITY.x), W.cOf(W.CITY.z)],
  ['circuits', W.cOf(W.CIRCUITS.x), W.cOf(W.CIRCUITS.z)],
];
// plus the most varied and the wettest chunk of a small area
let best = null,
  wet = null;
for (let cz = -6; cz <= 6; cz++)
  for (let cx = -6; cx <= 6; cx++) {
    const c = W.genChunk(cx, cz),
      seen = new Set(c);
    let water = 0;
    for (const v of c) if (v === 11) water++;
    if (!best || seen.size > best[0]) best = [seen.size, cx, cz];
    if (!wet || water > wet[0]) wet = [water, cx, cz];
  }
real.push(['varied', best[1], best[2]], ['water', wet[1], wet[2]]);
for (const [n, cx, cz] of real) runCase('real-' + n, cx, cz, around(cx, cz, (x, z) => W.genChunk(x, z)), n === 'spawn' ? 'none' : 'hash');

// (b) a synthetic chunk with every block, alone and against each other, with a powered rule
{
  const rnd = mulberry(1234567);
  const pool = [0, 0, 0, ...IDS, 11, 11, 99, 100, 200, 255];
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  const cx = -1,
    cz = 2;
  const chunks = around(cx, cz, (x, z, dx, dz) => {
    const c = new Uint8Array(CV);
    if (dx || dz) {
      for (let i = 0; i < CV; i++) if (rnd() < 0.4) c[i] = pick();
      return c;
    }
    const set = (x, y, z, v) => (c[li(x, y, z)] = v);
    for (let y = 0; y < 8; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) set(x, y, z, pick()); // dense mix
    IDS.forEach((id, i) => set((i % 8) * 2, 10 + Math.floor(i / 64) * 2, (Math.floor(i / 8) % 8) * 2, id)); // each one alone
    for (let y = 18; y < 40; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) if (rnd() < 0.35) set(x, y, z, pick()); // sparse mix
    IDS.forEach((id, i) => {
      // each one as a 2 x 2 x 2 cube of itself
      const bx = (i % 8) * 2,
        bz = (Math.floor(i / 8) % 8) * 2,
        by = 41 + Math.floor(i / 64) * 2;
      for (let k = 0; k < 8; k++) set(bx + (k & 1), by + ((k >> 1) & 1), bz + (k >> 2), id);
    });
    // a pool reaching the top of the world, with things in it
    for (let y = 50; y < SY; y++) for (let z = 2; z < 14; z++) for (let x = 2; x < 14; x++) set(x, y, z, rnd() < 0.8 || y === SY - 1 ? 11 : pick());
    return c;
  });
  runCase('synthetic', cx, cz, chunks, 'hash');
}
writeFileSync(new URL('mesh-cases.json', out), JSON.stringify(cases));
