// Ether Mines · Circuits made of blocks: electrical current.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- circuits made of blocks: levers, plates, cables, lamps, doors ----------
// Nothing is saved: each client recomputes the current from the blocks and the players' positions.
const SPEC = new Map(),
  isSpecial = id => (id >= 48 && id <= 68) || (id >= 111 && id <= 123); // circuits: doors, levers, plates, cables, lamps, logic gates, clock
// ---------- lights: lanterns, pure ether, lamps ----------
// Index of sources per chunk; the ones closest to the player get a real light (see lights()).
const LUM = new Map(),
  LUM_COL = {
    14: 0xffc27a,
    70: 0x9fd8ff,
    68: 0xffe08a,
    13: 0xb7a6ff,
    75: 0x5fd8ff,
    83: 0x7fe8ff,
    84: 0xff8fc8,
    85: 0x5fb8ff,
    126: 0xb98aff,
    128: 0x7fe8ff,
    130: 0xc9b8ff,
  },
  isLum = id => LUM_COL[id] !== undefined;
function lumSet(x, y, z, id) {
  const k = ckey(cOf(x), cOf(z));
  let s = LUM.get(k);
  const key = coordKey(x, y, z);
  if (isLum(id)) {
    if (!s) LUM.set(k, (s = new Set()));
    s.add(key);
  } else if (s) s.delete(key);
}
const NB_LUM = touch ? 2 : 4,
  LAMPS = [];
for (let i = 0; i < NB_LUM; i++) {
  const l = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
  scene.add(l);
  LAMPS.push(l);
}
let lumT = 0;
function lights(dt) {
  lumT -= dt;
  if (lumT > 0) return;
  lumT = 0.25;
  const pcx = cOf(P.x),
    pcz = cOf(P.z),
    near = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const s = LUM.get(ckey(pcx + dx, pcz + dz));
      if (s)
        for (const k of s) {
          const [x, y, z] = k.split(',').map(Number),
            id = get(x, y, z);
          if (id === 68 && !POWERED.has(k)) continue; // lamp off
          const d = (x + 0.5 - P.x) ** 2 + (y + 0.5 - P.y) ** 2 + (z + 0.5 - P.z) ** 2;
          if (d < 400) near.push([d, x, y, z, id]);
        }
    }
  near.sort((a, b) => a[0] - b[0]);
  // more visible at night; during the day, just a soft halo
  const force = 0.25 + 0.85 * skyU.night.value;
  LAMPS.forEach((l, i) => {
    const n = near[i];
    if (!n) return void (l.intensity = 0);
    l.position.set(n[1] + 0.5, n[2] + 0.5, n[3] + 0.5);
    l.color.setHex(LUM_COL[n[4]]);
    l.intensity = force;
  });
}
function specSet(x, y, z, id) {
  lumSet(x, y, z, id);
  const k = ckey(cOf(x), cOf(z));
  let s = SPEC.get(k);
  const key = coordKey(x, y, z);
  if (isSpecial(id)) {
    if (!s) SPEC.set(k, (s = new Set()));
    s.add(key);
  } else if (s) s.delete(key);
}
function indexChunk(cx, cz) {
  const arr = CHK.get(ckey(cx, cz));
  if (!arr) return;
  const s = new Set(),
    l = new Set();
  for (let i = 0; i < CV; i++) {
    const v = arr[i];
    if (isSpecial(v) || isLum(v)) {
      const k = coordKey(cx * CH + (i % CH), Math.floor(i / (CH * CH)), cz * CH + (Math.floor(i / CH) % CH));
      if (isSpecial(v)) s.add(k);
      if (isLum(v)) l.add(k);
    }
  }
  SPEC.set(ckey(cx, cz), s);
  LUM.set(ckey(cx, cz), l);
}
const N6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
let powT = 0;
// ---------- logic gates ----------
// The output is in front (the direction you were facing when placing it); the inputs: left and right sides, and the back.
const GATE_ON = new Set(),
  FRONT = [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
  ];
// does a neighboring cell feed the gate at k? (cable, lever, plate or clock under power, or a gate turned toward it)
function hasInput(k, d, nodes, pw) {
  const [x, y, z] = k.split(',').map(Number),
    nk = coordKey(x + d[0], y, z + d[2]),
    nid = nodes.get(nk);
  if (nid === undefined) return false;
  if (B[nid]?.gate) {
    const f = FRONT[B[nid].o];
    return GATE_ON.has(nk) && f[0] === -d[0] && f[2] === -d[2];
  }
  return pw.has(nk) && (nid === 67 || nid === 65 || nid === 66 || nid === 111);
}
function gateActive(k, id, nodes, pw) {
  const f = FRONT[B[id].o],
    back = [-f[0], 0, -f[2]],
    left = [f[2], 0, -f[0]],
    right = [-f[2], 0, f[0]];
  const g = B[id].gate;
  if (g === 'and') return hasInput(k, left, nodes, pw) && hasInput(k, right, nodes, pw);
  if (g === 'or') return hasInput(k, left, nodes, pw) || hasInput(k, right, nodes, pw) || hasInput(k, back, nodes, pw);
  return !hasInput(k, back, nodes, pw); // not
}
// Every already-powered cable/gate cell reachable from one starting cell, plus whatever terminal
// block (lamp, door, plate…) sits at the far end of each branch — used to figure out, after the fact,
// what a given input or output is actually connected to. Objectives tracking only; nothing gameplay
// related reads this (the real circuit, computed by propagate()/gateActive() above, never needs it).
function poweredReach(nodes, pw, sx, sy, sz) {
  const seen = new Set(),
    q = [];
  const visit = (x, y, z) => {
    const k = coordKey(x, y, z),
      id = nodes.get(k);
    if (id === undefined || seen.has(k) || !pw.has(k)) return;
    seen.add(k);
    if (id === 67 || B[id]?.gate) q.push(k);
  };
  visit(sx, sy, sz);
  for (let n = 0; q.length && n < 2000; n++) {
    const k = q.shift(),
      [x, y, z] = k.split(',').map(Number);
    for (const [a, b, c] of N6) visit(x + a, y + b, z + c);
  }
  return seen;
}
// First time a lamp lights up fed, even indirectly through cables, by an active gate's own output
// (not just a lever/plate/clock elsewhere on the same network).
function gateLitLamp(nodes, pw) {
  for (const [k, id] of nodes)
    if (B[id]?.gate && GATE_ON.has(k)) {
      const [x, y, z] = k.split(',').map(Number),
        f = FRONT[B[id].o];
      for (const rk of poweredReach(nodes, pw, x + f[0], y, z + f[2])) if (nodes.get(rk) === 68) return true;
    }
  return false;
}
// A door opened by an active AND gate whose two inputs each trace back to a pressure plate, and not
// the same single plate feeding both sides — a real two-key lock, not just a gate that happens to be on.
function twoKeyDoor(nodes, pw) {
  for (const [k, id] of nodes) {
    if (!(B[id]?.gate === 'and' && GATE_ON.has(k))) continue;
    const [x, y, z] = k.split(',').map(Number),
      f = FRONT[B[id].o],
      left = [f[2], 0, -f[0]],
      right = [-f[2], 0, f[0]];
    const leftPlates = new Set(),
      rightPlates = new Set();
    for (const rk of poweredReach(nodes, pw, x + left[0], y, z + left[2])) if (nodes.get(rk) === 66) leftPlates.add(rk);
    for (const rk of poweredReach(nodes, pw, x + right[0], y, z + right[2])) if (nodes.get(rk) === 66) rightPlates.add(rk);
    if (!leftPlates.size || !rightPlates.size) continue;
    if (leftPlates.size === 1 && rightPlates.size === 1 && [...leftPlates][0] === [...rightPlates][0]) continue;
    for (const rk of poweredReach(nodes, pw, x + f[0], y, z + f[2])) {
      const rid = nodes.get(rk);
      if (rid >= 48 && rid <= 63) return true;
    }
  }
  return false;
}
// Every cell reachable from one starting cell by following cable only (id 67), plus the first
// non-cable cell at the end of each branch — a purely structural trace, blind to the current power
// state (used when the point is wiring topology itself, not what's lit right now).
function cableReach(nodes, sx, sy, sz) {
  const seen = new Set(),
    q = [coordKey(sx, sy, sz)];
  for (let n = 0; q.length && n < 2000; n++) {
    const k = q.shift();
    if (seen.has(k)) continue;
    seen.add(k);
    if (nodes.get(k) !== 67) continue;
    const [x, y, z] = k.split(',').map(Number);
    for (const [a, b, c] of N6) q.push(coordKey(x + a, y + b, z + c));
  }
  return seen;
}
// A NOT gate whose own output, followed only through cable (not through any other gate — the
// simple, expected build), loops all the way back into its own back input. Structural: looked for
// regardless of the current power state, since the whole point of this wiring is that it never
// settles — the comment in computePower() below already calls this out as a known, deliberate quirk.
function selfOscillating(nodes) {
  for (const [k, id] of nodes) {
    if (B[id]?.gate !== 'not') continue;
    const [x, y, z] = k.split(',').map(Number),
      f = FRONT[B[id].o],
      back = coordKey(x - f[0], y, z - f[2]);
    if (cableReach(nodes, x + f[0], y, z + f[2]).has(back)) return true;
  }
  return false;
}
// An OR gate wired so one input is a pressure plate and another input loops back, through cable
// only, from its own output — the simplest way to remember a state: step on the plate once and it
// stays set, because propagate() re-feeds any already-active gate from its own output every tick,
// no matter what originally turned it on. Unlike the NOT loop above, OR feedback is self-reinforcing
// rather than self-canceling, so this settles instead of oscillating. Structural, same reasoning as
// selfOscillating; also requires the output to reach a lamp, for a visible payoff.
function isLatch(nodes) {
  for (const [k, id] of nodes) {
    if (B[id]?.gate !== 'or') continue;
    const [x, y, z] = k.split(',').map(Number),
      f = FRONT[B[id].o],
      own = coordKey(x + f[0], y, z + f[2]),
      sides = [
        [-f[0], 0, -f[2]],
        [f[2], 0, -f[0]],
        [-f[2], 0, f[0]],
      ];
    let plate = false,
      feedback = false;
    for (const d of sides) {
      const reach = cableReach(nodes, x + d[0], y, z + d[2]);
      if (!plate) for (const rk of reach) if (nodes.get(rk) === 66) plate = true;
      if (reach.has(own)) feedback = true;
    }
    if (plate && feedback && [...cableReach(nodes, x + f[0], y, z + f[2])].some(rk => nodes.get(rk) === 68)) return true;
  }
  return false;
}
// Propagates the current from the sources (levers, pressed plates, clocks, active logic gates) through the cables.
function propagate(nodes, feet, clockOn) {
  const pw = new Set(),
    q = [];
  const feed = (x, y, z) => {
    const nk = coordKey(x, y, z);
    if (pw.has(nk)) return;
    const nid = nodes.get(nk);
    if (nid === undefined) return;
    if (nid === 67) {
      pw.add(nk);
      q.push(nk);
    } else if (nid === 68) pw.add(nk);
    else if (nid >= 48 && nid <= 63) {
      pw.add(nk);
      pw.add(coordKey(x, y + (B[nid].top ? -1 : 1), z));
    }
  };
  for (const [k, id] of nodes) {
    const [x, y, z] = k.split(',').map(Number);
    let src = id === 65 || (id === 111 && clockOn);
    if (id === 66) src = feet.some(([a, b, c]) => Math.floor(a) === x && Math.floor(c) === z && b >= y - 0.2 && b < y + 0.7);
    if (src) {
      pw.add(k);
      q.push(k);
    } else if (B[id]?.gate && GATE_ON.has(k)) {
      pw.add(k); // lit (texture)
      const f = FRONT[B[id].o];
      feed(x + f[0], y, z + f[2]);
    }
  }
  for (let n = 0; q.length && n < 5000; n++) {
    const k = q.shift(),
      [x, y, z] = k.split(',').map(Number);
    for (const [a, b, c] of N6) feed(x + a, y + b, z + c);
  }
  return pw;
}
function computePower(dt) {
  powT -= dt;
  if (powT > 0) return;
  powT = 0.15;
  const pcx = cOf(P.x),
    pcz = cOf(P.z),
    nodes = new Map();
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const s = SPEC.get(ckey(pcx + dx, pcz + dz));
      if (s)
        for (const k of s) {
          const [x, y, z] = k.split(',').map(Number);
          nodes.set(k, get(x, y, z));
        }
    }
  const feet = [[P.x, P.y, P.z]];
  for (const o of others.values()) if (o.t) feet.push([o.g.position.x, o.g.position.y, o.g.position.z]);
  const clockOn = Math.floor(performance.now() / 1000) % 2 === 0;
  // Logic gates depend on the current, which depends on them: recompute until stable (3 passes at most;
  // an oscillating loop, like a NOT gate wired to itself, then just beats on its own).
  let pw = propagate(nodes, feet, clockOn);
  for (let pass = 0; pass < 3; pass++) {
    const on = new Set();
    for (const [k, id] of nodes) if (B[id]?.gate && gateActive(k, id, nodes, pw)) on.add(k);
    let same = on.size === [...GATE_ON].filter(k => nodes.has(k)).length;
    if (same) for (const k of on) if (!GATE_ON.has(k)) same = false;
    for (const k of [...GATE_ON]) if (nodes.has(k)) GATE_ON.delete(k);
    for (const k of on) GATE_ON.add(k);
    if (same) break;
    pw = propagate(nodes, feet, clockOn);
  }
  if (!S.gateLit && gateLitLamp(nodes, pw)) {
    S.gateLit = 1;
    dirty = true;
  }
  if (!S.twoKeyDoor && twoKeyDoor(nodes, pw)) {
    S.twoKeyDoor = 1;
    dirty = true;
  }
  if (!S.gateBlinker && selfOscillating(nodes)) {
    S.gateBlinker = 1;
    dirty = true;
  }
  if (!S.gateLatch && isLatch(nodes)) {
    S.gateLatch = 1;
    dirty = true;
  }
  const changed = [];
  for (const k of pw) if (!POWERED.has(k)) changed.push(k);
  for (const k of POWERED) if (!pw.has(k) && nodes.has(k)) changed.push(k);
  if (!changed.length) return;
  let door = false,
    plate = false;
  for (const k of changed) {
    const id = nodes.get(k);
    if (id >= 48 && id <= 63) door = true;
    if (id === 66) plate = true;
    if (pw.has(k)) POWERED.add(k);
    else POWERED.delete(k);
  }
  const cks = new Set(
    changed.map(k => {
      const [x, , z] = k.split(',').map(Number);
      return ckey(cOf(x), cOf(z));
    }),
  );
  for (const ck of cks)
    if (MESH.has(ck)) {
      const [cx, cz] = ck.split(',').map(Number);
      buildChunk(cx, cz);
    }
  if (door) Sound.door();
  if (plate) Sound.plate();
}
