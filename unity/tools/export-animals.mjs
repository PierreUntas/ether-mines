// Ether Mines · exports the animals and villagers (src/game/09-animals.js) to unity/Assets/Resources/animals.json,
// read by the Unity client (Animals.cs). Their stats come from AK, the villagers from VILLAGERS (their lines;
// a line the game computes is named: "@network", "@ruin", "@top"), and the models from buildAnimal() run
// here on a small stand-in for Three.js (abox, pivot), as tools/export-mobs.mjs does for the mobs. A
// model's colors depend on the animal's own number r (0..1): r is cut in 24 slices, each pointing to one
// of the type's distinct models (variant[floor(r * 24)]).
// Run after changing 09-animals.js:  node unity/tools/export-animals.mjs   (--check: fail if stale)
//
// Format: types.<type> = { n, D, walk, R, hit, hp, gift, models: [model], variant: [24 indexes] }, villagers: [{ x, z, name,
// role, outfit, headwear, says, after, model }]. A model is a node as in mobs.json: { p, r, s, part, b, c,
// g, o, k }. Game coordinates (right-handed, an animal's front is +z): the client mirrors z.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../supabase/functions/_shared/world.js');
const { SPAWN, CITY } = globalThis.World;
const fail = m => {
  throw new Error('export-animals: ' + m);
};
const src = readFileSync(new URL('../../src/game/09-animals.js', import.meta.url), 'utf8');
const cut = (from, to) => {
  const a = src.indexOf(from),
    b = src.indexOf(to, a);
  if (a < 0 || b < 0) fail('09-animals.js changed shape near ' + from);
  return src.slice(a, b);
};
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
  multiplyScalar(s) {
    return this.set(this.x * s, this.y * s, this.z * s);
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
  Object.assign(m, { box: [w, h, d], color: hex(c), glow: !!basic, op: op || 1 });
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
const nameTag = () => Object.assign(new Obj(), { tag: true }); // drawn by the client itself
const THREE = {
  Group: Obj,
  // as Three.js r128 does it: the channels as they are, scaled, back to hex
  Color: class {
    constructor(c) {
      const h = parseInt(hex(c).slice(1), 16);
      this.rgb = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(v => v / 255);
    }
    multiplyScalar(k) {
      this.rgb = this.rgb.map(v => v * k);
      return this;
    }
    getHexString() {
      return this.rgb.map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
    }
  },
};
const scene = { add() {} };
// AK and VILLAGERS, evaluated with the world's constants and stand-ins for what their lines compute
const marks = { networkStatus: () => '@network', nearestRuin: () => null, arrowTo: () => '', NETWORK: { top: [] } };
const AK = new Function('return ' + cut('const AK = {', '\n};\n').replace('const AK = ', '') + '}')();
const VILLAGERS = new Function('SPAWN', 'CITY', 'return ' + cut('const VILLAGERS = [', '\n];\n').replace('const VILLAGERS = ', '') + ']')(SPAWN, CITY);
const build = new Function('THREE', 'abox', 'pivot', 'nameTag', 'scene', 'groundAt', cut('function buildAnimal(a) {', '\n}\n') + '\n}\nreturn buildAnimal;')(
  THREE,
  abox,
  pivot,
  nameTag,
  scene,
  () => null,
);
void marks;

const r4 = v => Math.round(v * 1e4) / 1e4;
function node(o, tags) {
  const n = { p: [r4(o.position.x), r4(o.position.y), r4(o.position.z)] };
  if (o.rotation.x || o.rotation.y || o.rotation.z) n.r = [r4(o.rotation.x), r4(o.rotation.y), r4(o.rotation.z)];
  if (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) n.s = r4(o.scale.x);
  if (tags.has(o)) n.part = tags.get(o);
  if (o.box) {
    n.b = o.box.map(r4);
    n.c = o.color;
    if (o.glow) n.g = 1;
    if (o.op !== 1) n.o = o.op;
  }
  const kids = o.children.filter(c => !c.tag);
  if (kids.length) n.k = kids.map(c => node(c, tags));
  return n;
}
function model(a) {
  build(a);
  const tags = new Map();
  for (const [k, v] of Object.entries(a.parts)) {
    if (Array.isArray(v)) v.forEach((o, i) => tags.set(o, k + ':' + i));
    else if (v) tags.set(v, k);
  }
  a.g.position.set(0, 0, 0);
  return node(a.g, tags);
}
const types = {};
for (const [type, K] of Object.entries(AK)) {
  if (type === 'villager') {
    types[type] = { n: K.n, D: K.D, walk: K.walk, R: K.R, hit: K.hit, hp: K.hp ?? 0, gift: null, models: [], variant: [] };
    continue;
  }
  // the distinct models, and which one each of the 24 slices of r gets
  const models = [],
    variant = [];
  for (let i = 0; i < 24; i++) {
    const m = JSON.stringify(model({ type, r: (i + 0.5) / 24, hx: 0, hy: 0, hz: 0 }));
    if (!models.includes(m)) models.push(m);
    variant.push(models.indexOf(m));
  }
  types[type] = { n: K.n, D: K.D, walk: K.walk, R: K.R, hit: K.hit, hp: K.hp ?? 0, gift: K.gift ?? null, models: models.map(m => JSON.parse(m)), variant };
}
const line = s => {
  if (typeof s !== 'function') return s;
  const t = s.toString();
  return t.includes('networkStatus') ? '@network' : t.includes('nearestRuin') ? '@ruin' : t.includes('NETWORK.top') ? '@top' : fail('a line the client cannot compute');
};
const villagers = VILLAGERS.map(h => ({
  x: h.x,
  z: h.z,
  name: h.name,
  role: h.role,
  outfit: h.outfit,
  headwear: h.headwear || null,
  says: h.says.map(line),
  after: h.after || null,
  model: model({ type: 'villager', r: 0.5, h, hx: 0, hy: 0, hz: 0 }),
}));
const out =
  JSON.stringify({ _format: 'see unity/tools/export-animals.mjs; generated, do not edit', types, villagers }).replace(/,"(\w+)":\{"n"/g, ',\n"$1":{"n"') +
  '\n';
const file = new URL('../Assets/Resources/animals.json', import.meta.url);
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(file, 'utf8');
  } catch {}
  if (now !== out) fail('unity/Assets/Resources/animals.json is out of date: run node unity/tools/export-animals.mjs');
  console.log('animals.json up to date');
} else {
  writeFileSync(file, out);
  console.log(`animals.json: ${Object.keys(types).length} kinds, ${villagers.length} villagers, ${(out.length / 1024).toFixed(0)} KB`);
}
