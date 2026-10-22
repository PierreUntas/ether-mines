// Ether Mines · exports the hostile mobs' models and stats to unity/Assets/Resources/mobs.json, read by the
// Unity client (Mobs.cs). The models are built by the game itself: buildMob() in src/game/16-mobs.js is
// run here on a small stand-in for Three.js that records every box (abox) and pivot, and the parts the
// animation moves (head, legs, wings, tail, ring, rings, drill, crown, lens, scan). The stats (name, hp,
// hit box, ranged bolts' color and size) come from MK in src/mobs-core.js.
// Run after changing either:  node unity/tools/export-mobs.mjs   (--check: fail if the file is stale)
//
// Format (also in the file as "_format"): types.<type> = { n, hp, hit: [w, h, d], ranged: { color, size }
// or null, model }. model is a node: { p: [x, y, z], r: [x, y, z] (radians, Three.js order XYZ), s: scale,
// part: "legs:0"..., b: [w, h, d] for a box with c: "#rrggbb", g: 1 for a glowing (unlit) box, o: opacity,
// k: [children] }. Coordinates are the game's (right-handed, the mob's front is +z): the client mirrors z.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../supabase/functions/_shared/world.js');
require('../../src/mobs-core.js');
const { MK } = globalThis.MobsCore;
const fail = m => {
  throw new Error('export-mobs: ' + m);
};
const src = readFileSync(new URL('../../src/game/16-mobs.js', import.meta.url), 'utf8');
const start = src.indexOf('function buildMob(a) {'),
  end = src.indexOf('\n}\n', start);
if (start < 0 || end < 0) fail('buildMob not found');
const body = src.slice(start, end + 2);

// the stand-in for Three.js: groups and meshes with a position, a rotation, a scale and children
const v3 = (x = 0, y = 0, z = 0) => ({
  x,
  y,
  z,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
    return this;
  },
  setScalar(s) {
    return this.set(s, s, s);
  },
});
class Obj {
  constructor() {
    this.position = v3();
    this.rotation = v3();
    this.scale = v3(1, 1, 1);
    this.children = [];
  }
  add(o) {
    this.children.push(o);
    return this;
  }
}
const hex = c => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c).toLowerCase());
function abox(par, w, h, d, c, x, y, z, basic, op) {
  const m = new Obj();
  m.box = [w, h, d];
  m.color = hex(c);
  m.glow = !!basic;
  m.op = op || 1;
  m.position.set(x, y, z);
  par.add(m);
  return m;
}
function pivot(par, x, y, z) {
  const g = new Obj();
  g.position.set(x, y, z);
  par.add(g);
  return g;
}
const THREE = { Group: Obj };
const scene = { add() {} };
const build = new Function('THREE', 'abox', 'pivot', 'scene', body + '\nreturn buildMob;')(THREE, abox, pivot, scene);

const r4 = v => Math.round(v * 1e4) / 1e4;
function node(o, tags) {
  const n = { p: [r4(o.position.x), r4(o.position.y), r4(o.position.z)] };
  if (o.rotation.x || o.rotation.y || o.rotation.z) n.r = [r4(o.rotation.x), r4(o.rotation.y), r4(o.rotation.z)];
  if (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) {
    if (o.scale.x !== o.scale.y || o.scale.y !== o.scale.z) fail('uneven scale');
    n.s = r4(o.scale.x);
  }
  if (tags.has(o)) n.part = tags.get(o);
  if (o.box) {
    n.b = o.box.map(r4);
    n.c = o.color;
    if (o.glow) n.g = 1;
    if (o.op !== 1) n.o = o.op;
  }
  if (o.children.length) n.k = o.children.map(c => node(c, tags));
  return n;
}
const types = {};
for (const type of Object.keys(MK)) {
  const a = { type, hx: 0, hy: 0, hz: 0 };
  build(a);
  const tags = new Map();
  for (const [k, v] of Object.entries(a.parts)) {
    if (Array.isArray(v)) v.forEach((o, i) => tags.set(o, k + ':' + i));
    else if (v) tags.set(v, k);
  }
  a.g.position.set(0, 0, 0);
  const K = MK[type];
  types[type] = {
    n: K.n,
    hp: K.hp,
    hit: K.hit,
    ranged: K.ranged ? { color: hex(K.ranged.color), size: K.ranged.size || 1.6 } : null,
    model: node(a.g, tags),
  };
}
const out =
  JSON.stringify(
    { _format: 'see unity/tools/export-mobs.mjs; generated, do not edit', types },
    null,
    0,
  ).replace(/,"(\w+)":\{"n"/g, ',\n"$1":{"n"') + '\n';
const file = new URL('../Assets/Resources/mobs.json', import.meta.url);
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(file, 'utf8');
  } catch {}
  if (now !== out) fail('unity/Assets/Resources/mobs.json is out of date: run node unity/tools/export-mobs.mjs');
  console.log('mobs.json up to date');
} else {
  writeFileSync(file, out);
  console.log(`mobs.json: ${Object.keys(types).length} mobs`);
}
