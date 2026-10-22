// Golden data for CircuitParity.cs: the web version's circuits (src/game/12-circuits.js, run as is in a
// sandbox) on hand-built circuits (each objective's shape) and random ones, tick after tick with players
// stepping on and off the plates and the clock beating. Run from anywhere:  node unity/CoreTests/golden-circuits.mjs
//   golden/circuits.json  per case: the nodes [x, y, z, id]; per tick: the feet, the clock, then what the
//                         web computed: the powered cells, the active gates, the objective flags
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../supabase/functions/_shared/rules.js');
const B = globalThis.Rules.B;
const out = new URL('./golden/', import.meta.url);
mkdirSync(out, { recursive: true });

const world = new Map();
const ctx = {
  B,
  THREE: { PointLight: class { constructor() { this.position = { set() {} }; this.color = { setHex() {} }; } } },
  scene: { add() {} },
  touch: false,
  ckey: (a, b) => a + ',' + b,
  cOf: v => Math.floor(v / 16),
  coordKey: (x, y, z) => x + ',' + y + ',' + z,
  CHK: new Map(),
  CV: 16 * 16 * 64,
  CH: 16,
  get: (x, y, z) => world.get(x + ',' + y + ',' + z) || 0,
  P: { x: 0, y: 0, z: 0 },
  others: new Map(),
  S: {},
  dirty: false,
  POWERED: new Set(),
  MESH: new Map(),
  buildChunk() {},
  Sound: { door() {}, plate() {} },
  performance: { now: () => 0 },
  skyU: { night: { value: 0 } },
  Math,
  Number,
  Set,
  Map,
};
vm.createContext(ctx);
const src = readFileSync(new URL('../../src/game/12-circuits.js', import.meta.url), 'utf8');
vm.runInContext(src + '\n;this.GATE_ON_ = GATE_ON; this.SPEC_ = SPEC;', ctx);

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const Y = 20;

function run(nodes, ticks) {
  world.clear();
  ctx.SPEC_.clear();
  ctx.GATE_ON_.clear();
  ctx.POWERED.clear();
  ctx.S = {};
  for (const [x, y, z, id] of nodes) {
    world.set(x + ',' + y + ',' + z, id);
    ctx.specSet(x, y, z, id);
  }
  const res = [];
  for (const t of ticks) {
    const [p, ...rest] = t.feet;
    ctx.P = { x: p[0], y: p[1], z: p[2] };
    ctx.others = new Map(rest.map((f, i) => [i, { t: 1, g: { position: { x: f[0], y: f[1], z: f[2] } } }]));
    ctx.performance = { now: () => (t.clock ? 0 : 1000) };
    ctx.computePower(1);
    res.push({
      feet: t.feet,
      clock: t.clock,
      pw: [...ctx.POWERED].sort(),
      on: [...ctx.GATE_ON_].sort(),
      flags: ['gateLit', 'twoKeyDoor', 'gateBlinker', 'gateLatch', 'gateCoinFlip'].filter(k => ctx.S[k]),
    });
  }
  return res;
}

const away = [40, Y, 40];
const on = (x, z) => [x + 0.5, Y, z + 0.5];
const cab = (...cells) => cells.map(([x, z]) => [x, Y, z, 67]);
const cases = [];
const add = (name, nodes, ticks) => cases.push({ name, nodes, ticks: run(nodes, ticks) });
const idle = n => Array.from({ length: n }, (_, i) => ({ feet: [away], clock: i % 2 === 0 }));

// a NOT gate (nothing behind it) lights a lamp through a cable
add('gate lamp', [[5, Y, 5, 120], ...cab([5, 4]), [5, Y, 3, 68]], idle(3));
// a NOT gate's output looped into its own back: it blinks
add('blinker', [[5, Y, 5, 120], ...cab([5, 4], [6, 4], [6, 5], [6, 6], [5, 6]), [5, Y, 3, 68]], idle(8));
// an OR fed by a plate, its output looped into its other side, a lamp: stepping on once keeps it lit
add('latch', [[5, Y, 5, 116], ...cab([5, 4], [4, 4], [4, 5], [6, 5]), [7, Y, 5, 66], [5, Y, 3, 68]], [
  { feet: [away], clock: true },
  { feet: [on(7, 5)], clock: true },
  { feet: [on(7, 5)], clock: false },
  { feet: [away], clock: true },
  { feet: [away], clock: false },
]);
// two plates into an AND, its output into a door: open only while both are pressed
add('two keys', [[5, Y, 5, 112], ...cab([4, 5], [6, 5], [5, 4]), [3, Y, 5, 66], [7, Y, 5, 66], [5, Y, 3, 48], [5, Y + 1, 3, 49]], [
  { feet: [on(3, 5)], clock: true },
  { feet: [on(3, 5), on(7, 5)], clock: true },
  { feet: [away, on(7, 5)], clock: false },
  { feet: [on(7, 5), on(3, 5)], clock: true },
]);
// a blinker sampled by an AND when a plate is pressed, the result latched by an OR into a lamp
add(
  'coin flip',
  [
    [5, Y, 5, 120],
    ...cab([5, 4], [6, 4], [6, 5], [6, 6], [5, 6], [7, 5], [8, 5], [10, 5], [9, 4], [9, 3], [9, 1], [8, 2], [8, 1]),
    [9, Y, 5, 112],
    [11, Y, 5, 66],
    [9, Y, 2, 116],
    [9, Y, 0, 68],
  ],
  [...idle(3), { feet: [on(11, 5)], clock: true }, { feet: [on(11, 5)], clock: false }, ...idle(4)],
);
// a lever, a clock and cables up a step, into lamps and a door
add(
  'lever and clock',
  [[2, Y, 2, 65], ...cab([3, 2], [4, 2]), [4, Y + 1, 2, 67], [4, Y + 2, 2, 68], [2, Y, 6, 111], ...cab([3, 6]), [4, Y, 6, 50], [4, Y + 1, 6, 51], [2, Y, 9, 64], ...cab([3, 9]), [4, Y, 9, 68]],
  idle(4),
);
// random circuits: cables, levers, plates, lamps, gates of every way, clocks, doors
const pool = [67, 67, 67, 67, 67, 67, 65, 64, 66, 68, 68, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123];
for (let c = 0; c < 40; c++) {
  const nodes = [],
    taken = new Set(),
    plates = [];
  for (let x = 0; x < 9; x++)
    for (let z = 0; z < 9; z++)
      for (let y = Y; y <= Y + 1; y++) {
        if (rnd() > (y === Y ? 0.55 : 0.15) || taken.has(x + ',' + y + ',' + z)) continue;
        let id = pool[Math.floor(rnd() * pool.length)];
        if (y === Y && rnd() < 0.04) {
          // a door: its top half above
          nodes.push([x, y, z, 48 + 2 * Math.floor(rnd() * 8)], [x, y + 1, z, 49 + 2 * Math.floor(rnd() * 8)]);
          taken.add(x + ',' + (y + 1) + ',' + z);
          continue;
        }
        if (id === 66) plates.push([x, y, z]);
        taken.add(x + ',' + y + ',' + z);
        nodes.push([x, y, z, id]);
      }
  const ticks = [];
  for (let t = 0; t < 7; t++) {
    const feet = [away];
    for (const p of plates) if (rnd() < 0.4) feet.push([p[0] + 0.3 + rnd() * 0.4, p[1] + rnd() * 0.5, p[2] + 0.3 + rnd() * 0.4]);
    if (rnd() < 0.5) feet.reverse();
    ticks.push({ feet, clock: rnd() < 0.5 });
  }
  add('random ' + c, nodes, ticks);
}
writeFileSync(new URL('circuits.json', out), JSON.stringify(cases));
const flags = new Set(cases.flatMap(c => c.ticks.flatMap(t => t.flags)));
console.log(cases.length + ' circuits, flags seen: ' + [...flags].join(' '));
