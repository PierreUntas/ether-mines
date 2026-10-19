// World generator, shared by the browser and by the "freeze" server function.
// Script with no import or export: loaded as-is by <script> in the game, imported by Deno server-side.
// Any change to the terrain produced here must come with a bump of GEN.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, t) => a + (b - a) * t,
    sm = t => t * t * (3 - 2 * t);
  // World seed: changing it gives completely different terrain (only do this together with a database reset).
  // root.__SEED lets tools try other seeds (tools/seeds.mjs).
  const SEED = root.__SEED ?? -126345076;
  function hash(x, y, s = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(97 + s, 1442695041) ^ SEED;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s = 0) {
    return hash(x + Math.imul(z | 0, 19349663), y, s);
  }
  function vn2(x, z, s = 0) {
    const xi = Math.floor(x),
      zi = Math.floor(z),
      xf = sm(x - xi),
      zf = sm(z - zi);
    const a = hash(xi, zi, s),
      b = hash(xi + 1, zi, s),
      c = hash(xi, zi + 1, s),
      d = hash(xi + 1, zi + 1, s);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  }
  function vn3(x, y, z, s = 0) {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      zi = Math.floor(z),
      xf = sm(x - xi),
      yf = sm(y - yi),
      zf = sm(z - zi);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
    return L(
      L(L(c(0, 0, 0), c(1, 0, 0), xf), L(c(0, 1, 0), c(1, 1, 0), xf), yf),
      L(L(c(0, 0, 1), c(1, 0, 1), xf), L(c(0, 1, 1), c(1, 1, 1), xf), yf),
      zf,
    );
  }
  const SY = 64,
    DY = 12,
    SEA = 15 + DY,
    CH = 16,
    CV = CH * CH * SY,
    DEEP = 20; // DEEP: below this layer, geodes and large caves
  const GEN = 27; // generator version: bump it on every terrain change (already-frozen chunks don't move); history in docs/generator-history.md
  const SPAWN = { x: 8, z: 8, y: 0 };
  const ckey = (cx, cz) => cx + ',' + cz,
    coordKey = (x, y, z) => x + ',' + y + ',' + z,
    cOf = v => Math.floor(v / CH);
  const li = (lx, y, lz) => lx + lz * CH + y * CH * CH;
  // Infinite world, bounded only by the base's rules (±100,000 blocks from the center).
  const LIMIT = 100000;
  const inWorld = (x, z) => Math.abs(x) < LIMIT && Math.abs(z) < LIMIT;
  const RUIN = 80;
  // position of a region's ruin (or null: ocean, peak); the sanctuary's region has one within sight
  // ---------- the City: futuristic district under the great diamond, north of the sanctuary ----------
  const CITY = { x: SPAWN.x, z: SPAWN.z - 64, R: 34, Y: 30, STEP: 12 }; // R 34: the shelter (the farthest plot out) needs room for its corners
  // ---------- the Circuits Complex: five separate rooms, one gate-based objective each ----------
  // Its own standalone landmark (like Ether Gardens or a ruin), not part of the City's plot grid —
  // a multi-room complex doesn't fit a single 12-unit plot cell, and stretching CITY.R to cover one
  // would inflate the whole City's footprint for something that isn't a City building.
  const CIRCUITS = { x: SPAWN.x + 60, z: SPAWN.z + 90, Y: 33, R: 24 };
  const inCircuits = (x, z, margin = 0) => Math.hypot(x - CIRCUITS.x, z - CIRCUITS.z) <= CIRCUITS.R + margin;
  // five chambers off a central corridor, one gate-based Objective each (see src/game/12-circuits.js:
  // gateLitLamp, twoKeyDoor, selfOscillating, isLatch, isCoinFlip) — each room's circuit uses the
  // exact wiring already verified against the live engine, just in its own walled, legible room.
  // cx/cz: local coords relative to CIRCUITS; door: which wall carries the 1-cell-wide entrance.
  const CIRCUITS_ROOMS = [
    {
      cx: -5,
      cz: -12,
      R: 3,
      H: 4,
      door: 'e',
      build: (dx, dz, set) => {
        // light a lamp: a NOT gate facing the door, nothing behind it (always active)
        if (dx === -1 && dz === 0) set(1, 123); // NOT gate, o=3 (facing +x)
        if (dx === 0 && dz === 0) set(1, 67);
        if (dx === 1 && dz === 0) set(1, 68);
      },
    },
    {
      cx: 5,
      cz: -12,
      R: 3,
      H: 4,
      door: 'w',
      build: (dx, dz, set) => {
        // two-key door: an AND gate fed by two distinct plates opens a real door
        if (dx === 1 && dz === 0) set(1, 115); // AND gate, o=3 (facing +x, toward the demo door)
        if (dx === 1 && dz === -1) set(1, 66); // plate: left input
        if (dx === 1 && dz === 1) set(1, 66); // plate: right input
        if (dx === 2 && dz === 0) {
          set(1, 48); // the demonstrated door: foot
          set(2, 49); // head
        }
        if (dx === 2 && (dz === -1 || dz === 1)) {
          set(1, 79); // short partition framing the demo door
          set(2, 79);
        }
      },
    },
    {
      cx: -5,
      cz: 0,
      R: 3,
      H: 4,
      door: 'e',
      build: (dx, dz, set) => {
        // self-oscillating blinker: a NOT loop closed through cable, a lamp branched off
        if (dx === -1 && dz === 0) set(1, 120); // NOT gate, o=0
        if (dx === -1 && dz === -1) set(1, 67); // front: the gate's own output
        if (dx === 0 && dz === -1) set(1, 67);
        if (dx === 0 && dz === 0) set(1, 67);
        if (dx === 0 && dz === 1) set(1, 67);
        if (dx === -1 && dz === 1) set(1, 67); // closes the loop into the gate's back input
        if (dx === 1 && dz === 0) set(1, 68); // lamp, branched off the loop
      },
    },
    {
      cx: 5,
      cz: 0,
      R: 3,
      H: 4,
      door: 'w',
      build: (dx, dz, set) => {
        // a latch that remembers: tap the plate once, the lamp stays lit for good
        if (dx === 0 && dz === 0) set(1, 66); // plate: the gate's back input
        if (dx === 0 && dz === -1) set(1, 116); // OR gate, o=0
        if (dx === 0 && dz === -2) set(1, 67); // front: the gate's own output
        if (dx === 1 && dz === -2) set(1, 67); // junction
        if (dx === 1 && dz === -1) set(1, 67); // closes the loop into the gate's right input
        if (dx === 2 && dz === -2) set(1, 68); // lamp: lights up, and stays lit
      },
    },
    {
      cx: 0,
      cz: 14,
      R: 5,
      H: 5,
      door: 'n',
      build: (dx, dz, set) => {
        // coin flip: an oscillator tapped by an AND gate alongside a plate, feeding a latch. Kept two rows
        // back from the door (dz -5), so the cell just inside it stays free to walk in
        if (dx === -4 && dz === 1) set(1, 120); // NOT gate, o=0: the oscillator
        if (dx === -4 && dz === 0) set(1, 67); // front: the oscillator's own output
        if (dx === -3 && dz === 0) set(1, 67);
        if (dx === -3 && dz === 1) set(1, 67);
        if (dx === -3 && dz === 2) set(1, 67);
        if (dx === -4 && dz === 2) set(1, 67); // closes the oscillator's own loop
        if (dx === -2 && dz === 1) set(1, 67); // tap: feeds the AND gate's left input
        if (dx === -1 && dz === 1) set(1, 112); // AND gate, o=0: left = the tap, right = the plate
        if (dx === 0 && dz === 1) set(1, 66); // plate: the AND gate's right input
        if (dx === -1 && dz === 0) set(1, 67); // AND's output == the OR latch's back input
        if (dx === -1 && dz === -1) set(1, 116); // OR gate, o=0: the latch
        if (dx === -1 && dz === -2) set(1, 67); // front: the latch's own output
        if (dx === -2 && dz === -1) set(1, 67); // left input: closes the latch's feedback loop
        if (dx === -2 && dz === -2) set(1, 67); // junction toward the lamp
        if (dx === 0 && dz === -2) set(1, 68); // lamp: the coin lands
      },
    },
  ];
  const circuitsDoorCell = (room, dx, dz) =>
    room.door === 'e'
      ? dx === room.R && dz === 0
      : room.door === 'w'
        ? dx === -room.R && dz === 0
        : room.door === 'n'
          ? dz === -room.R && dx === 0
          : dz === room.R && dx === 0; // 's'
  const k5 = (dx, dz) => (dx === 0 || dz === 0) && Math.abs(dx) + Math.abs(dz) === 5; // middle of a hall facade
  const inCity = (x, z, margin = 0) => Math.hypot(x - CITY.x, z - CITY.z) <= CITY.R + margin;
  // the validators' path: paved walkway between the Atrium and the City
  const onPath = (x, z, margin = 1) => Math.abs(x - SPAWN.x) <= margin && z < SPAWN.z - 7 && z > CITY.z + CITY.R - 2;
  // grid plot (12 x 12): every building in the City has its spot and its look
  const PLOTS = {
    '0,0': { t: 'large', H: 10 }, // the great hall, under its glass pyramid
    '0,-1': { t: 'temple', H: 7 }, // the ledger temple, with a pediment
    '-1,-1': { t: 'library', H: 6 }, // the library
    '1,-1': { t: 'greenhouse' }, // the greenhouse
    '-1,0': { t: 'rotunda', H: 6 }, // the rotunda and its dome
    '1,0': { t: 'stainedGlassHall', H: 9 }, // colonnaded halls under stained glass
    '1,1': { t: 'stainedGlassHall', H: 6 },
    '-1,1': { t: 'market' }, // the market
    '0,1': { t: 'square' },
    '0,2': { t: 'forecourt' }, // the entrance, at the end of the path coming from the sanctuary
    '0,-2': { t: 'square' },
    '2,0': { t: 'garden' },
    '-2,0': { t: 'garden' },
    '2,1': { t: 'shelter', H: 4 }, // the shelter: a room to eat and sleep in
  };
  function cityPlot(i, j) {
    const L = PLOTS[i - 3 + ',' + (j - 3)];
    return L ? { ...L, cx: CITY.x + (i - 3) * CITY.STEP, cz: CITY.z + (j - 3) * CITY.STEP } : null;
  }
  function ruinAt(rx, rz) {
    for (let k = 0; k < 4; k++) {
      let x, z;
      if (rx === 0 && rz === 0 && k === 0) {
        x = SPAWN.x + 38;
        z = SPAWN.z - 22;
      } else {
        x = rx * RUIN + 10 + Math.floor(hash(rx, rz, 120 + k) * 60);
        z = rz * RUIN + 10 + Math.floor(hash(rz, rx, 130 + k) * 60);
      }
      if (
        inCity(x, z, 12) ||
        Math.hypot(x - SPAWN.x, z - SPAWN.z) < (rx || rz ? 50 : 20) ||
        ((rx || rz) && Math.hypot(x - SPAWN.x - 38, z - SPAWN.z + 22) < 40)
      )
        continue;
      let lo = 99,
        hi = 0;
      for (let dx = -2; dx <= 2; dx += 2)
        for (let dz = -2; dz <= 2; dz += 2) {
          const h = heightAt(x + dx, z + dz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      if (lo <= SEA + 1 || hi > 34 + DY || hi - lo > 4) continue;
      return { x, z, y: heightAt(x, z) };
    }
    return null;
  }
  const contAt = (x, z) => vn2(x / 170 + 50, z / 170 - 40, 9) * 0.7 + vn2(x / 60, z / 60, 10) * 0.3; // low = ocean
  function heightAt(x, z) {
    const c = vn2(x / 40, z / 40, 1) * 0.6 + vn2(x / 17, z / 17, 2) * 0.3 + vn2(x / 7, z / 7, 3) * 0.1;
    const m = sm(clamp((vn2(x / 64 + 10, z / 64 + 10, 4) - 0.52) / 0.25, 0, 1));
    const d = Math.hypot(x - SPAWN.x, z - SPAWN.z),
      // widened from /10: the natural terrain's own mountain term below can swing height by ~30
      // blocks, so a 10-block falloff could still land a steep little cliff or hill right at the
      // edge of the Atrium's flat plateau — exactly where the validators path starts. A wider
      // falloff keeps the ground closer to flat for longer before natural noise takes over.
      flat = sm(clamp((d - 5) / 22, 0, 1)),
      oc = sm(clamp((0.4 - contAt(x, z)) / 0.1, 0, 1));
    const land = DY + 12 + c * 14 + m * 18 * vn2(x / 16, z / 16, 5),
      sea = DY + 5 + vn2(x / 9, z / 9, 11) * 5;
    const dc = Math.hypot(x - CITY.x, z - CITY.z),
      city = sm(clamp((dc - CITY.R) / 26, 0, 1)); // the City sits on a plateau that blends into the terrain — same widened falloff, same reason
    const dcc = Math.hypot(x - CIRCUITS.x, z - CIRCUITS.z),
      circuits = sm(clamp((dcc - CIRCUITS.R) / 20, 0, 1)); // the Circuits Complex, its own small plateau
    const natural = lerp(DY + 20, lerp(land, sea, oc), flat),
      withCircuits = lerp(CIRCUITS.Y + 0.5, natural, circuits);
    return Math.floor(lerp(CITY.Y + 0.5, withCircuits, city));
  }
  // garden of a 64x64 region (or null): on reasonably flat grassy ground, far from the sanctuary and the ruins
  function gardenAt(gx, gz) {
    if (hash(gx * 3 + 1, gz * 5 + 2, 155) > 0.45) return null;
    const x = gx * 64 + 12 + Math.floor(hash(gx, gz, 156) * 40),
      z = gz * 64 + 12 + Math.floor(hash(gx, gz, 157) * 40),
      y = heightAt(x, z);
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 40 || y <= SEA + 1 || y >= DY + 31 || biome(x, z) === 'dunes') return null;
    for (const [dx, dz] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
      [0, 0],
    ])
      if (Math.abs(heightAt(x + dx, z + dz) - y) > 2) return null;
    const rg = ruinAt(Math.floor(x / RUIN), Math.floor(z / RUIN));
    if (rg && Math.hypot(rg.x - x, rg.z - z) < 14) return null;
    if (islandZone(x, z) || inCity(x, z, 16)) return null;
    // clear of the towers (GEN 27: they grew to 21x21, and a garden drawn over one would cut into it)
    for (let tz = Math.floor((z - 24) / TOWER); tz <= Math.floor((z + 24) / TOWER); tz++)
      for (let tx = Math.floor((x - 24) / TOWER); tx <= Math.floor((x + 24) / TOWER); tx++) {
        const t = towerAt(tx, tz);
        if (t && Math.hypot(t.x - x, t.z - z) < TR + 10) return null;
      }
    return { x, z, y };
  }
  const TOWER = 96,
    TR = 10, // a tower's half width (21x21)
    TC = 15, // its chamfered corners: |dx| + |dz| <= TC
    TOWER_LADDER = [7, -7], // the ladder's column, against the north-east chamfer (mobs-core.js keeps clear of it)
    TOWER_CHEST = [-6, -6]; // the treasure chest on the boss's platform (ty + 20)
  // tower of a 96x96 region (or null): guarded by hostile mobs, a boss at the top — rarer than a
  // garden or a ruin, so sparser spacing and a tighter hash gate
  function towerAt(tx, tz) {
    if (hash(tx * 7 + 3, tz * 11 + 5, 270) > 0.4) return null;
    const x = tx * TOWER + 20 + Math.floor(hash(tx, tz, 271) * (TOWER - 40)),
      z = tz * TOWER + 20 + Math.floor(hash(tx, tz, 272) * (TOWER - 40)),
      y = heightAt(x, z);
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 70 || y <= SEA + 1 || y >= DY + 40) return null;
    for (const [dx, dz] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
      [0, 0],
    ])
      if (Math.abs(heightAt(x + dx, z + dz) - y) > 5) return null;
    const rg = ruinAt(Math.floor(x / RUIN), Math.floor(z / RUIN));
    if (rg && Math.hypot(rg.x - x, rg.z - z) < 20) return null;
    // (GEN 27, 21x21) no ruin under the tower's corners or its entrance stair, whichever region it's in
    for (let rz = Math.floor((z - 40) / RUIN); rz <= Math.floor((z + 40) / RUIN); rz++)
      for (let rx = Math.floor((x - 40) / RUIN); rx <= Math.floor((x + 40) / RUIN); rx++) {
        const r = ruinAt(rx, rz);
        if (!r) continue;
        const ax = Math.abs(r.x - x),
          dz = r.z - z;
        if ((ax <= TR + 4 && Math.abs(dz) <= TR + 4) || (ax <= 4 && dz <= 3 - TR && dz >= -TR - 11)) return null;
      }
    if (islandZone(x, z) || inCity(x, z, 20) || inCircuits(x, z, 20)) return null;
    return { x, z, y };
  }
  // the Merge Sanctum (one per 192x192 region, or none): a floating arena in the sky, half
  // proof-of-work forge, half proof-of-stake crystal, where the twin bosses wait (16-mobs.js), reached
  // by the Beacon Stair, a spiral of floating steps on its south side. Its platform's walking surface
  // stands at MERGE_Y + 1; the stair's foot at the returned (sx, sz).
  const MERGE = 192,
    MERGE_Y = DY + 36,
    MERGE_R = 18; // the disc's radius (was 12: too tight to fight two bosses at once)
  function mergeAt(mx, mz) {
    if (hash(mx * 13 + 5, mz * 17 + 9, 300) > 0.8) return null;
    const x = mx * MERGE + 40 + Math.floor(hash(mx, mz, 301) * (MERGE - 80)),
      z = mz * MERGE + 40 + Math.floor(hash(mx, mz, 302) * (MERGE - 80));
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 110 || heightAt(x, z) > MERGE_Y - 8) return null;
    if (inCity(x, z, 40) || inCircuits(x, z, 40)) return null;
    for (let tz = Math.floor((z - 40) / TOWER); tz <= Math.floor((z + 40) / TOWER); tz++)
      for (let tx = Math.floor((x - 40) / TOWER); tx <= Math.floor((x + 40) / TOWER); tx++) {
        const t = towerAt(tx, tz);
        if (t && Math.hypot(t.x - x, t.z - z) < 34) return null;
      }
    const sx = x,
      sz = z + MERGE_R + 5,
      g = heightAt(sx, sz);
    if (g >= MERGE_Y - 3) return null;
    // the Beacon Stair's landing clear of any tower
    for (let tz = Math.floor((sz - 24) / TOWER); tz <= Math.floor((sz + 24) / TOWER); tz++)
      for (let tx = Math.floor((sx - 24) / TOWER); tx <= Math.floor((sx + 24) / TOWER); tx++) {
        const t = towerAt(tx, tz);
        if (t && Math.hypot(t.x - sx, t.z - sz) < TR + 8) return null;
      }
    return { x, z, y: MERGE_Y, sx, sz, g: Math.max(g, SEA) };
  }
  // the Mempool (one per 224x224 region, or none): an open-air colosseum where pending transactions
  // wait their turn, ruled by the Front-Runner, a MEV bot boss (16-mobs.js). A wide flat floor of radius
  // ARENA_R to fight on, six tiers of stands and a promenade around it, four gates at the cardinal points,
  // each with an approach that steps down (or up) to the natural ground. Floor at y, walking surface y + 1.
  const ARENA = 224,
    ARENA_R = 17,
    ARENA_W = 27, // the outer facade's radius
    ARENA_GATE = 38; // how far out a gate's approach runs
  // a few spots are tried in each region (like ruinAt()): the first fairly level one, clear of the other landmarks
  function arenaAt(ax, az) {
    if (hash(ax * 19 + 7, az * 23 + 3, 320) > 0.8) return null;
    for (let k = 0; k < 6; k++) {
      const a = arenaTry(ax, az, k);
      if (a) return a;
    }
    return null;
  }
  function arenaTry(ax, az, k) {
    const x = ax * ARENA + 50 + Math.floor(hash(ax + k * 31, az, 321) * (ARENA - 100)),
      z = az * ARENA + 50 + Math.floor(hash(ax, az + k * 37, 322) * (ARENA - 100)),
      y = heightAt(x, z);
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 100 || y <= SEA + 1 || y > DY + 28) return null;
    // fairly level ground all around, and no sea under its walls
    for (let i = 0; i < 16; i++) {
      const an = (i * Math.PI) / 8,
        h = heightAt(x + Math.round(Math.cos(an) * ARENA_W), z + Math.round(Math.sin(an) * ARENA_W));
      if (h < SEA - 2 || Math.abs(h - y) > 9) return null;
    }
    if (inCity(x, z, 50) || inCircuits(x, z, 50)) return null;
    const near = (R, fn, d) => {
      for (let j = Math.floor((z - d) / R); j <= Math.floor((z + d) / R); j++)
        for (let i = Math.floor((x - d) / R); i <= Math.floor((x + d) / R); i++) {
          const s = fn(i, j);
          if (s && Math.hypot(s.x - x, s.z - z) < d) return true;
          if (s && s.sx !== undefined && Math.hypot(s.sx - x, s.sz - z) < d) return true; // the Merge's stair foot
        }
      return false;
    };
    if (near(TOWER, towerAt, ARENA_GATE + 10) || near(MERGE, mergeAt, ARENA_GATE + 16)) return null;
    if (near(RUIN, ruinAt, ARENA_GATE + 4) || near(64, gardenAt, ARENA_GATE + 4)) return null;
    return { x, z, y };
  }
  // floating islands: rock clouds between DY+31 and DY+45, far from the sanctuary, never above the mountains
  const islandZone = (x, z) =>
    vn2(x / 90 + 7, z / 90 - 3, 14) > 0.56 &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > 36 &&
    heightAt(x, z) < DY + 29 &&
    contAt(x, z) > 0.42 &&
    !inCity(x, z, 14);
  const isIsland = (x, y, z) => {
    if (y < DY + 31 || y > DY + 45) return false;
    const band = 1 - Math.abs(y - DY - 38) / 7;
    return (vn3(x / 26, y / 9, z / 26, 12) * 0.75 + vn3(x / 9, y / 5, z / 9, 13) * 0.25) * sm(clamp(band * 1.6, 0, 1)) > 0.47;
  };
  function islandTop(x, z) {
    if (!islandZone(x, z)) return -1;
    for (let y = DY + 45; y >= DY + 31; y--) if (isIsland(x, y, z)) return y;
    return -1;
  }
  function biome(x, z) {
    const b = vn2(x / 50 + 30, z / 50 - 20, 6);
    return b < 0.42 ? 'plain' : b < 0.66 ? 'forest' : 'dunes';
  }
  const topAt = (h, bi) => (h <= SEA + 1 ? 4 : bi === 'dunes' ? 4 : h >= DY + 36 ? 16 : h >= DY + 31 ? 3 : 1);
  SPAWN.y = heightAt(SPAWN.x, SPAWN.z) + 1;
  function genChunk(cx, cz) {
    // palm tree trunk at (x, z) standing on ground h; its fronds fit within the decor's 3-column margin
    const palmTree = (x, h, z, height) => {
      const th = height || 5 + Math.floor(hash(x, z, 141) * 3);
      for (let k = 1; k <= th; k++) put(x, h + k, z, 124);
      const t = h + th;
      put(x, t + 1, z, 125, true);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        put(x + dx, t + 1, z + dz, 125, true);
        put(x + dx * 2, t, z + dz * 2, 125, true);
        put(x + dx * 3, t - 1, z + dz * 3, 125, true);
      }
      for (const [dx, dz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        put(x + dx, t, z + dz, 125, true);
        put(x + dx * 2, t - 1, z + dz * 2, 125, true);
      }
    };
    const a = new Uint8Array(CV),
      x0 = cx * CH,
      z0 = cz * CH;
    const put = (x, y, z, id, onlyAir) => {
      const lx = x - x0,
        lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || y < 0 || y >= SY) return;
      const i = li(lx, y, lz);
      if (onlyAir && a[i]) return;
      a[i] = id;
    };
    const at = (x, y, z) => {
      const lx = x - x0,
        lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || y < 0 || y >= SY) return -1;
      return a[li(lx, y, lz)];
    };
    for (let lz = 0; lz < CH; lz++)
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx,
          z = z0 + lz,
          h = heightAt(x, z),
          bi = biome(x, z);
        for (let y = 0; y < SY; y++) {
          let id = 0;
          if (y === 0) id = 12;
          else if (y < h - 3) id = 3;
          else if (y < h) id = bi === 'dunes' || h <= SEA + 1 ? 4 : 2;
          else if (y === h) id = topAt(h, bi);
          else if (y <= SEA) id = 11;
          if (id === 3 && y > 1 && y < h - 4 && vn3(x / 11, y / 7, z / 11, 7) > 0.7) id = 0;
          if (id === 3 && y > 1 && y < DEEP - 1 && vn3(x / 18, y / 6, z / 18, 15) > 0.66) id = 0; // large deep caves
          if (id === 3 && vn3(x / 3.2, y / 3.2, z / 3.2, 8) > 0.8 - Math.min(0.1, (h - y) * 0.004)) id = 8;
          if (id === 3 && y < DEEP && vn3(x / 2.4, y / 2.4, z / 2.4, 16) > 0.885) id = 69; // pure ether geodes
          if (id === 3 && (y <= 2 || (y <= 4 && vn3(x / 5, y / 3, z / 5, 17) > 0.5))) id = 72; // genesis rock, right at the bottom
          if (id) a[li(lx, y, lz)] = id;
        }
        // ether mushrooms on cave floors (a single column: nothing spills into the neighboring chunk)
        for (let y = 2; y < h - 4; y++) {
          const i = li(lx, y, lz),
            sol = a[li(lx, y - 1, lz)];
          if (a[i] || !(sol === 3 || sol === 8 || sol === 72)) continue;
          const r = hash(x * 7 + y, z, 130);
          if (r < (y < DEEP ? 0.04 : 0.015)) a[i] = 75;
          else if (y < DEEP && r < 0.055) a[i] = 126; // amethyst cluster, only in the depths
        }
        if (h >= SEA && h <= SEA + 2 && !islandZone(x, z)) {
          // reeds on the banks: a neighboring column is underwater
          const rive = Math.min(heightAt(x + 1, z), heightAt(x - 1, z), heightAt(x, z + 1), heightAt(x, z - 1)) < SEA;
          if (rive && hash(x, z, 131) < 0.3) a[li(lx, h + 1, lz)] = 76;
        } else if (h < SEA && h >= SEA - 4 && hash(x, z, 132) < 0.035 && !a[li(lx, SEA + 1, lz)]) a[li(lx, SEA + 1, lz)] = 77; // lily pads in shallow water
        if (islandZone(x, z)) {
          let depth = 0;
          for (let y = DY + 45; y >= DY + 31; y--) {
            if (isIsland(x, y, z)) {
              depth++;
              let id = depth === 1 ? 1 : depth <= 3 ? 2 : 3;
              if (id === 3 && hash(x * 3 + y, z, 17) < 0.07) id = 8;
              a[li(lx, y, lz)] = id;
            } else depth = 0;
          }
        }
      }
    // decor: roots taken from a 3-column margin, so a tree straddling two chunks looks identical from both sides
    for (let z = z0 - 3; z < z0 + CH + 3; z++)
      for (let x = x0 - 3; x < x0 + CH + 3; x++) {
        const h = heightAt(x, z),
          bi = biome(x, z);
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16 || inCity(x, z, 4) || onPath(x, z, 3)) continue; // Atrium esplanade, the City, the path
        // palm trees on beaches and in the dunes
        if (topAt(h, bi) === 4 && h > SEA && h < DY + 31 && hash(x, z, 140) < (bi === 'dunes' ? 0.006 : 0.014)) {
          palmTree(x, h, z);
          continue;
        }
        if (topAt(h, bi) !== 1) continue;
        const r = hash(x, z, 40);
        if (bi === 'forest' && r < 0.004) {
          const t = 2 + Math.floor(hash(x, z, 41) * 3);
          for (let k = 1; k <= t; k++) put(x, h + k, z, 8);
          continue;
        }
        if (bi !== 'forest' && r < 0.01 && hash(x, z, 150) < 0.55) {
          // cypress: thin and tall, like in the Ether garden
          const th = 5 + Math.floor(hash(x, z, 151) * 3);
          put(x, h + 1, z, 5);
          put(x, h + 2, z, 5);
          for (let k = 3; k <= th + 2; k++) {
            put(x, h + k, z, 6, true);
            if (k > 3 && k < th + 1)
              for (const [dx, dz] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ])
                put(x + dx, h + k, z + dz, 6, true);
          }
          continue;
        }
        if (r < (bi === 'forest' ? 0.028 : 0.01)) {
          const th = 4 + Math.floor(hash(x, z, 42) * 3),
            leaf = bi === 'forest' && hash(x, z, 44) < 0.65 ? 7 : 6; // pink forests mixed with lavender-blue trees
          for (let k = 1; k <= th; k++) put(x, h + k, z, 5);
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              for (let dz = -2; dz <= 2; dz++) {
                const rr = Math.hypot(dx, dy * 1.2, dz);
                if (rr <= 2.5 - (hash(x + dx, z + dz, dy + 50) < 0.3 ? 0.6 : 0)) put(x + dx, h + th + dy, z + dz, leaf, true);
              }
          put(x, h + th + 2, z, leaf, true);
          continue;
        }
        if (bi !== 'forest' && r >= 0.01 && r < 0.0125) {
          // mossy boulder of 1 to 4 blocks, resting on the terrain of each column
          for (const [dx, dz, dy, p] of [
            [0, 0, 1, 1],
            [1, 0, 1, 0.6],
            [0, 1, 1, 0.5],
            [0, 0, 2, 0.4],
          ])
            if (hash(x + dx * 3, z + dz * 5 + dy, 133) < p)
              put(x + dx, heightAt(x + dx, z + dz) + dy, z + dz, hash(x + dx, z + dz, 134) < 0.7 ? 78 : 3, true);
          continue;
        }
        if (at(x, h + 1, z) === 0) {
          if (r < 0.09) put(x, h + 1, z, 20);
          else if (r < 0.11) put(x, h + 1, z, 17 + Math.floor(hash(x, z, 43) * 3));
        }
      }
    // floating island decor (same margin: identical on both sides of an edge)
    for (let z = z0 - 3; z < z0 + CH + 3; z++)
      for (let x = x0 - 3; x < x0 + CH + 3; x++) {
        const t = islandTop(x, z);
        if (t < 0 || t >= DY + 43) continue;
        const r = hash(x, z, 45);
        if (r < 0.012) {
          for (let k = 1; k <= 2 + Math.floor(hash(x, z, 46) * 2); k++) put(x, t + k, z, 8, true);
          continue;
        }
        if (r < 0.05 && t <= DY + 40) {
          const th = 3 + Math.floor(hash(x, z, 47) * 2);
          for (let k = 1; k <= th; k++) put(x, t + k, z, 5, true);
          for (let dy = -1; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              for (let dz = -2; dz <= 2; dz++) if (Math.hypot(dx, dy * 1.3, dz) <= 2.3) put(x + dx, t + th + dy, z + dz, 7, true);
          continue;
        }
        if (at(x, t + 1, z) === 0 && r < 0.16) put(x, t + 1, z, r < 0.1 ? 20 : 17 + Math.floor(hash(x, z, 48) * 3));
      }
    // ruins: one dark validator per 80x80 region
    for (let rz = Math.floor((z0 - 4) / RUIN); rz <= Math.floor((z0 + CH + 4) / RUIN); rz++)
      for (let rx = Math.floor((x0 - 4) / RUIN); rx <= Math.floor((x0 + CH + 4) / RUIN); rx++) {
        const r = ruinAt(rx, rz);
        if (!r) continue;
        const { x: rx0, z: rz0, y: ry } = r;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            const hh = hash(rx0 + dx, rz0 + dz, 121);
            put(rx0 + dx, ry, rz0 + dz, hh < 0.15 ? 78 : (dx + dz) % 2 ? 15 : 81); // worn flooring
            for (let k = 1; k <= 6; k++) put(rx0 + dx, ry + k, rz0 + dz, 0);
            put(rx0 + dx, ry - 1, rz0 + dz, 3);
          }
        for (const [dx, dz] of [
          [-2, -2],
          [2, -2],
          [-2, 2],
          [2, 2],
        ]) {
          const hp = 1 + Math.floor(hash(rx0 + dx, rz0 + dz, 122) * 3);
          for (let k = 1; k <= hp; k++) put(rx0 + dx, ry + k, rz0 + dz, hash(rx0 + dx, k, 123) < 0.2 ? 78 : 127); // broken columns
          if (hp === 3) put(rx0 + dx, ry + 4, rz0 + dz, 14);
        }
        put(rx0, ry + 1, rz0, 73);
      }
    // towers: a 96x96 region each, guarded by hostile mobs with a boss at the top; the boss always
    // drops a Plasma Pistol (supabase/migrations/016_tower_boss_loot.sql). Mob placement mirrors
    // this loop in src/mobs-core.js's spawnChunk, keyed off the same towerAt() position.
    // 21x21 footprint, 6-tall floors (was 13x13, 9x9/5-tall, then 7x7/4-tall originally — still too tight
    // to fight in). TR: the half width; TC: where the chamfers cut the corners (|dx| + |dz|).
    for (let tz = Math.floor((z0 - TR - 12) / TOWER); tz <= Math.floor((z0 + CH + TR + 12) / TOWER); tz++)
      for (let tx = Math.floor((x0 - TR - 12) / TOWER); tx <= Math.floor((x0 + CH + TR + 12) / TOWER); tx++) {
        const t = towerAt(tx, tz);
        if (!t) continue;
        const { x: tx0, z: tz0, y: ty } = t,
          LADX = TOWER_LADDER[0],
          LADZ = TOWER_LADDER[1]; // the climbing ladder's fixed interior column, against the north-east chamfer
        // The validator beacon: an octagonal lighthouse in the City's palette — a checkered-marble base,
        // a lavender body ringed with cyan neon at each floor, stained-glass slits, an open loggia at the
        // top where the Plasma Core waits, and the Ether diamond crowning the roof as a beacon seen from afar.
        // Footprint: the square with chamfered corners (an octagon), the corners left as a low plinth.
        const inOct = (dx, dz) => Math.max(Math.abs(dx), Math.abs(dz)) <= TR && Math.abs(dx) + Math.abs(dz) <= TC;
        for (let dx = -TR; dx <= TR; dx++)
          for (let dz = -TR; dz <= TR; dz++) {
            const ax = Math.abs(dx),
              az = Math.abs(dz);
            for (let k = 1; k <= 30; k++) put(tx0 + dx, ty + k, tz0 + dz, 0);
            // a foundation down to the ground: on a slope, the wider floor never hangs in the air
            for (let y = ty - 1, g = heightAt(tx0 + dx, tz0 + dz); y > g && y > ty - 12; y--) put(tx0 + dx, y, tz0 + dz, 81);
            if (!inOct(dx, dz)) {
              // the corners outside the octagon: a two-step marble plinth
              put(tx0 + dx, ty, tz0 + dz, 15);
              if (ax + az <= TC + 1) put(tx0 + dx, ty + 1, tz0 + dz, 34);
              continue;
            }
            put(tx0 + dx, ty, tz0 + dz, dx % 3 === 0 || dz % 3 === 0 ? 128 : 80); // neon grid floor
            const ring = ax === TR || az === TR || ax + az === TC;
            if (!ring) continue;
            const vertex = (ax === TR && az === TC - TR) || (ax === TC - TR && az === TR),
              faceMid = (ax === TR && dz === 0) || (az === TR && dx === 0),
              face = (ax === TR && az < TC - TR) || (az === TR && ax < TC - TR), // the four flat faces, between their corner columns
              along = ax === TR ? dz : dx,
              chamfer = ax + az === TC && ax !== TR && az !== TR,
              front = dz === -TR; // the entrance faces north, toward the way players arrive from the sanctuary
            for (let k = 1; k <= 24; k++) {
              let id;
              if (front && dx === 0 && k <= 2)
                id = k === 1 ? 48 : 49; // the closed door, like the shelter's
              else if (front && ax === 1 && k <= 3)
                id = 127; // door jambs
              else if (front && ax <= 1 && k === 3) id = 128;
              else if (k === 24 || k === 23)
                id = 15; // cornice and loggia lintel
              else if (vertex)
                id = 127; // marble columns at the octagon's corners, base to roof
              else if (k >= 19)
                id = k === 19 ? 15 : k === 20 ? 34 : 0; // the open loggia: a floor edge, a low marble rail, open above
              else if (k === 6 || k === 12 || k === 18)
                id = 128; // a neon ring at each floor line
              else if (k <= 5)
                id = faceMid && (k === 3 || k === 4) ? 30 : 81; // checkered-marble base
              else if (face && Math.abs(along) / 4 + Math.abs(k - 12) / 5.5 <= 1)
                id = 22; // the Ether diamond on each face, split by the neon ring like the logo
              else if (chamfer && k % 6 === 3)
                id = 29; // pink glass on the chamfers
              else id = 15; // a white marble body
              put(tx0 + dx, ty + k, tz0 + dz, id);
            }
          }
        // the entrance stair: a marble doorstep level with the floor, then marble steps down to the natural
        // ground (or up, if the ground in front is higher), so the door can always be reached by walking
        {
          const step = (z, top, id) => {
            for (let dx = -1; dx <= 1; dx++) {
              const x = tx0 + dx;
              for (let y = Math.min(top - 1, heightAt(x, z)); y < top; y++) put(x, y, z, 15); // fill under the step
              put(x, top, z, id);
              for (let k = 1; k <= 3; k++) put(x, top + k, z, 0); // head room through trees or a slope
            }
          };
          step(tz0 - TR - 1, ty, 15);
          // a stair at level L climbs from standing height L to L + 1: going out from the door, each next stair is a
          // block lower (ground falling away) or higher (ground rising), until the ground beyond can be walked
          // onto; a slope too steep for six steps gets a level passage cut into it instead
          const stand = z => heightAt(tx0, z) + 1,
            dir = Math.sign(stand(tz0 - TR - 2) - (ty + 1));
          if (Math.abs(stand(tz0 - TR - 7) - (ty + 1)) > 6 && dir > 0)
            for (let i = TR + 2; i <= TR + 7; i++) step(tz0 - i, ty, 15); // a level passage into the hillside
          else if (dir)
            for (let j = 0; j < 6; j++) {
              const z = tz0 - TR - 2 - j,
                L = dir < 0 ? ty - j : ty + 1 + j;
              step(z, L, dir < 0 ? 42 : 40);
              const beyond = stand(z - 1);
              if (dir < 0 ? beyond >= L : beyond <= L + 1) break; // the ground beyond meets the stair
            }
        }
        // floor platforms (floors 1-3) and the boss's platform, a gap left for the ladder; the roof above
        for (const k of [7, 13, 19, 24])
          for (let dx = -TR + 1; dx <= TR - 1; dx++)
            for (let dz = -TR + 1; dz <= TR - 1; dz++) {
              if (!inOct(dx, dz) || Math.abs(dx) + Math.abs(dz) === TC || (dx === LADX && dz === LADZ)) continue;
              put(tx0 + dx, ty + k, tz0 + dz, k === 24 ? 15 : dx === 0 || dz === 0 ? 128 : 80);
            }
        for (let k = 1; k <= 24; k++) put(tx0 + LADX, ty + k, tz0 + LADZ, 94);
        // pink lanterns hanging under each ceiling, at the diagonals
        for (const k of [6, 12, 18])
          for (const [dx, dz] of [
            [-5, -5],
            [5, 5],
            [-5, 5],
          ])
            put(tx0 + dx, ty + k, tz0 + dz, 84);
        // the crown: a stepped lavender pyramid on the roof, a golden Radiant Diamond at its tip
        // (kept low: the world stops at 64 blocks, and a tower can stand high on a hill)
        for (let k = 25; k <= 27; k++) {
          const r = 5 - 2 * (k - 25); // 5, 3, 1
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r) put(tx0 + dx, ty + k, tz0 + dz, k === 27 ? 145 : 22);
        }
        // beacon lights: a pink lantern atop each of the eight corner columns
        for (const [dx, dz] of [
          [TR, TC - TR],
          [TR, TR - TC],
          [-TR, TC - TR],
          [-TR, TR - TC],
          [TC - TR, TR],
          [TR - TC, TR],
          [TC - TR, -TR],
          [TR - TC, -TR],
        ])
          put(tx0 + dx, ty + 25, tz0 + dz, 84);
        // a treasure chest on the boss's platform, clear of both the ladder and the Plasma Core's arena
        // at the tower's center (src/mobs-core.js) — seeded with better-than-average loot the first time
        // it's opened (025_tower_treasure.sql)
        put(tx0 + TOWER_CHEST[0], ty + 20, tz0 + TOWER_CHEST[1], 98);
      }
    // the Merge Sanctum (mergeAt()): a floating disc split down the middle, proof-of-work forge to the
    // west (granite, coral, lanterns), proof-of-stake crystal to the east (marble, lavender, crystal),
    // a cyan neon seam where they meet, and over its center a two-tone diamond merging into one.
    // The twin bosses' spots (mobs-core.js) are 9 blocks west and east of the center, on the floor.
    for (let mz = Math.floor((z0 - MERGE_R - 14) / MERGE); mz <= Math.floor((z0 + CH + MERGE_R + 14) / MERGE); mz++)
      for (let mx = Math.floor((x0 - MERGE_R - 14) / MERGE); mx <= Math.floor((x0 + CH + MERGE_R + 14) / MERGE); mx++) {
        const m = mergeAt(mx, mz);
        if (!m) continue;
        const { x: X, z: Z, y: Y } = m;
        for (let dx = -MERGE_R - 2; dx <= MERGE_R + 2; dx++)
          for (let dz = -MERGE_R - 2; dz <= MERGE_R + 2; dz++) {
            const r = Math.hypot(dx, dz),
              x = X + dx,
              z = Z + dz,
              pow = dx < 0;
            if (r > MERGE_R + 1.5) continue;
            for (let y = Y + 1; y < SY; y++) put(x, y, z, 0);
            if (r > MERGE_R + 0.4) continue;
            // the floor: two halves, a cyan seam, two accent rings, a rim
            const rim = r > MERGE_R - 0.6,
              accent = (r >= 6.5 && r < 7.5) || (r >= 12.5 && r < 13.5);
            put(x, Y, z, dx === 0 ? 128 : rim ? (pow ? 80 : 15) : accent ? (pow ? 27 : 22) : r < 3 && !pow ? 81 : pow ? 80 : 15);
            // the underside: a rock cone with ether veins and a crystal tip
            const depth = Math.floor((MERGE_R + 0.4 - r) * 0.45) + 1;
            for (let k = 1; k <= depth; k++) put(x, Y - k, z, k === depth && r < 1 ? 83 : hash(x * 3 + k, z, 303) < 0.08 ? 8 : 3);
            // a low rail around the rim, open to the south where the bridge arrives
            if (rim && !(dz > 0 && Math.abs(dx) <= 1)) put(x, Y + 1, z, pow ? 35 : 34);
          }
        // twelve columns, lanterns on top: plain lanterns on the forge side, pink ones on the crystal side
        for (let k = 0; k < 12; k++) {
          const an = ((k + 0.5) * Math.PI) / 6,
            dx = Math.round(Math.cos(an) * (MERGE_R - 3)),
            dz = Math.round(Math.sin(an) * (MERGE_R - 3));
          for (let h = 1; h <= 6; h++) put(X + dx, Y + h, Z + dz, h === 3 ? (dx < 0 ? 27 : 22) : dx < 0 ? 80 : 127);
          put(X + dx, Y + 7, Z + dz, dx < 0 ? 14 : 84);
        }
        // the forge (west) and the crystal obelisk (east), behind each twin's spot
        for (const [ddx, ddz] of [
          [0, 0],
          [0, 1],
          [0, -1],
        ]) {
          put(X - 13 + ddx, Y + 1, Z + ddz, 27);
          put(X - 13 + ddx, Y + 2, Z + ddz, ddz ? 80 : 14);
          put(X + 13 + ddx, Y + 1, Z + ddz, 22);
        }
        for (let h = 2; h <= 5; h++) put(X + 13, Y + h, Z, 83);
        // the merging diamond, floating above the center: peach west, lavender east, a diamond-block seam
        // and a radiant heart where the two halves meet (its tip at Y + 14 = 62, under the world's ceiling)
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++)
            for (let dz = -3; dz <= 3; dz++)
              if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 3)
                put(X + dx, Y + 11 + dy, Z + dz, dx < 0 ? 25 : dx > 0 ? 22 : dy === 0 && dz === 0 ? 145 : 130);
        // the Beacon Stair: a marble core ringed by floating steps, half a block higher each, from the
        // ground (or the sea) up to the bridge; the last step is the ring's north-middle cell
        const { sx, sz } = m,
          G = m.g + 1,
          N = 2 * (Y + 1 - G),
          ring = [];
        for (let i = -2; i <= 2; i++) ring.push([i, -2]);
        for (let i = -1; i <= 2; i++) ring.push([2, i]);
        for (let i = 1; i >= -2; i--) ring.push([i, 2]);
        for (let i = 1; i >= -1; i--) ring.push([-2, i]);
        // ring now runs clockwise from the north-west corner; start it at the north-middle cell
        const start = ring.findIndex(([a, b]) => a === 0 && b === -2);
        // a marble landing around the stair's foot, so the first step is always half a block up
        // whatever the ground does there (a slope, a dip, the sea): filled down to the ground, cleared above
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++) {
            put(sx + dx, G - 1, sz + dz, Math.max(Math.abs(dx), Math.abs(dz)) === 3 ? 22 : 15);
            for (let y = G - 2; y >= G - 8; y--) {
              const c = at(sx + dx, y, sz + dz);
              if (c > 0 && c !== 11) break;
              put(sx + dx, y, sz + dz, 3);
            }
            for (let y = G; y <= G + 3; y++) put(sx + dx, y, sz + dz, 0);
          }
        for (let y = m.g - 2; y <= Y; y++)
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(sx + dx, y, sz + dz, (y - G) % 8 === 7 ? 22 : 15);
        for (let i = 0; i < N; i++) {
          const [dx, dz] = ring[(((start - (N - 1 - i)) % 16) + 16) % 16],
            s2 = 2 * G + i + 1, // twice the standing height on this step
            x = sx + dx,
            z = sz + dz,
            y = s2 % 2 ? (s2 - 1) / 2 : s2 / 2 - 1;
          put(x, y, z, s2 % 2 ? 34 : 15);
          for (let k = 1; k <= 3; k++) put(x, y + k, z, 0);
        }
        // the bridge from the last step to the platform's open rim
        for (let dz = MERGE_R + 1; dz <= MERGE_R + 2; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            put(X + dx, Y, Z + dz, dx ? 15 : 128);
            for (let k = 1; k <= 3; k++) put(X + dx, Y + k, Z + dz, 0);
          }
      }
    // the Mempool (arenaAt()): column by column. The fighting floor, a radial checkerboard of marble and
    // granite around an Ether diamond, rings of cyan neon; a low podium wall; six tiers of stands, their
    // seats in the four quarters' colors (lavender north, mint east, pink south, sky west); a promenade
    // above the last tier; the arcaded outer facade; four gates and their approaches. Above it all, the
    // pending transactions float in the air, around the next block waiting to be built. The Front-Runner
    // spawns at the center (16-mobs.js), its minions 6 blocks west and east.
    for (let az = Math.floor((z0 - ARENA_GATE - 2) / ARENA); az <= Math.floor((z0 + CH + ARENA_GATE + 2) / ARENA); az++)
      for (let ax = Math.floor((x0 - ARENA_GATE - 2) / ARENA); ax <= Math.floor((x0 + CH + ARENA_GATE + 2) / ARENA); ax++) {
        const A = arenaAt(ax, az);
        if (!A) continue;
        const { x: X, z: Z, y: Y } = A;
        if (X + ARENA_GATE + 1 < x0 || X - ARENA_GATE - 1 >= x0 + CH || Z + ARENA_GATE + 1 < z0 || Z - ARENA_GATE - 1 >= z0 + CH) continue;
        const SEATS = [22, 23, 21, 24]; // north, east, south, west
        for (let lz = 0; lz < CH; lz++)
          for (let lx = 0; lx < CH; lx++) {
            const x = x0 + lx,
              z = z0 + lz,
              dx = x - X,
              dz = z - Z,
              r = Math.hypot(dx, dz),
              an = Math.atan2(dz, dx), // 0 east, PI/2 south
              // which gate's axis this column sits on (if any): its distance across the axis and along it
              gate = Math.abs(dz) <= 2 ? Math.abs(dz) : Math.abs(dx) <= 2 ? Math.abs(dx) : -1,
              along = Math.abs(dz) <= 2 ? Math.abs(dx) : Math.abs(dz),
              quarter = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0,
              arc = Math.round((an + Math.PI) * ARENA_W); // position around the facade, in blocks
            // a gate's approach, outside the facade: level with the floor at the gate, then one block of
            // height per block outward until it meets the natural ground; dug into a hill, built up over a dip
            if (r > ARENA_W + 0.5) {
              if (gate < 0 || gate > 2 || along > ARENA_GATE) continue;
              const out = along - ARENA_W,
                g = heightAt(x, z),
                L = Y + clamp(g - Y, -out, out);
              for (let y = L - 1; y >= Math.max(1, L - 14); y--) {
                const c = at(x, y, z);
                if (c > 0 && c !== 11) break;
                put(x, y, z, 3);
              }
              put(x, L, z, gate === 0 ? 128 : gate === 2 ? 81 : 15);
              for (let k = 1; k <= 4; k++) put(x, L + k, z, 0);
              continue;
            }
            for (let y = Y + 1; y < SY; y++) put(x, y, z, 0);
            for (let y = Y - 1; y >= Math.max(1, Y - 16); y--) {
              const c = at(x, y, z);
              if (c > 0 && c !== 11 && c !== 6 && c !== 7 && c !== 5) break;
              put(x, y, z, 3);
            }
            if (r <= ARENA_R + 0.5) {
              // the floor: the Ether diamond at the center (lavender north, sky south, a neon seam, a diamond
              // heart), two neon rings, a checkered ring, and a radial checkerboard between them
              const sector = Math.floor(((an + Math.PI) * 8) / Math.PI), // 16 slices
                band = Math.floor(r / 3);
              let id = (sector + band) % 2 ? 15 : 80;
              if (Math.abs(dx) / 3 + Math.abs(dz) / 5 <= 1) id = dx === 0 && dz === 0 ? 130 : dz === 0 ? 128 : dz < 0 ? 22 : 24;
              else if (r >= 6 && r < 7) id = 128;
              else if (r >= 11.5 && r < 12.5) id = 81;
              else if (r > ARENA_R - 0.5) id = arc % 4 ? 80 : 128;
              put(x, Y, z, id);
              continue;
            }
            if (gate >= 0 && gate <= 2) {
              // a gate: the floor runs straight through the stands and the facade, under a neon lintel
              put(x, Y, z, gate === 0 ? 128 : 15);
              if (r > ARENA_W - 1.5) {
                put(x, Y + 6, z, 128);
                for (let k = 7; k <= 9; k++) put(x, Y + k, z, k === 9 ? 34 : 15);
              } else if (r > ARENA_W - 2.5) put(x, Y + 8, z, 15); // the promenade's bridge over the gate
              continue;
            }
            put(x, Y, z, 80);
            if (r <= ARENA_R + 1.5) {
              // the podium wall: one checkered step, a lantern every few blocks
              put(x, Y + 1, z, 81);
              if (arc % 6 === 0) put(x, Y + 2, z, 14);
            } else if (r <= ARENA_R + 7.5) {
              // the stands: tier t tops out at Y + 2 + t, colored seats on every other tier
              const t = Math.min(5, Math.floor(r - ARENA_R - 1.5));
              for (let k = 1; k <= 1 + t; k++) put(x, Y + k, z, 80);
              put(x, Y + 2 + t, z, t % 2 ? SEATS[quarter] : 15);
            } else if (r <= ARENA_W - 1.5) {
              // the promenade, a step above the last tier
              for (let k = 1; k <= 7; k++) put(x, Y + k, z, 80);
              put(x, Y + 8, z, 81);
            } else {
              // the arcaded facade: marble columns, stained-glass arches, a neon band, a parapet
              const pillar = arc % 4 === 0;
              for (let k = 1; k <= 9; k++) {
                let id;
                if (pillar) id = k === 6 ? 128 : 127;
                else if (k === 1) id = 81;
                else if (k <= 4) id = quarter % 2 ? 32 : 29;
                else if (k === 5) id = 15;
                else if (k === 6) id = 128;
                else if (k === 7) id = (arc + 2) % 8 === 0 ? 30 : 15;
                else if (k === 8) id = 15;
                else id = 34;
                put(x, Y + k, z, id);
              }
              if (arc % 8 === 0) put(x, Y + 10, z, 84); // a pink lantern on every other column
            }
          }
        // gate pillars: a marble column each side of every gate, a pink lantern on top
        for (const [ux, uz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          for (const s of [-3, 3]) {
            const px = X + ux * ARENA_W + (uz ? s : 0),
              pz = Z + uz * ARENA_W + (ux ? s : 0);
            for (let k = 1; k <= 11; k++) put(px, Y + k, pz, k === 11 ? 84 : 127);
          }
        // four beacon pylons on the diagonals, seen from afar
        for (let k = 0; k < 4; k++) {
          const a2 = ((k + 0.5) * Math.PI) / 2,
            px = X + Math.round(Math.cos(a2) * (ARENA_W - 1)),
            pz = Z + Math.round(Math.sin(a2) * (ARENA_W - 1));
          for (let h = 1; h <= 14; h++) put(px, Y + h, pz, h === 14 ? 145 : h % 4 === 2 ? 128 : 127);
        }
        // the pending transactions: glass cubes floating over the floor at different heights
        for (let k = 0; k < 10; k++) {
          const a2 = (k / 10) * Math.PI * 2 + hash(X, Z + k, 323) * 0.4,
            rr = 9 + Math.floor(hash(X + k, Z, 324) * 6),
            cx2 = X + Math.round(Math.cos(a2) * rr),
            cz2 = Z + Math.round(Math.sin(a2) * rr),
            cy2 = Y + 12 + Math.floor(hash(X, Z, 325 + k) * 5),
            col = [29, 30, 31, 32][k % 4];
          for (let ddx = 0; ddx <= 1; ddx++)
            for (let ddy = 0; ddy <= 1; ddy++) for (let ddz = 0; ddz <= 1; ddz++) put(cx2 + ddx, cy2 + ddy, cz2 + ddz, col);
        }
        // the next block, waiting to be built: a neon cube frame high over the center, a diamond inside
        for (let ddx = -2; ddx <= 2; ddx++)
          for (let ddy = -2; ddy <= 2; ddy++)
            for (let ddz = -2; ddz <= 2; ddz++)
              if ((Math.abs(ddx) === 2) + (Math.abs(ddy) === 2) + (Math.abs(ddz) === 2) >= 2) put(X + ddx, Y + 20 + ddy, Z + ddz, 128);
        put(X, Y + 20, Z, 145);
      }
    // the City, column by column (each column depends only on x and z)
    if (inCity(x0 + 8, z0 + 8, 12)) {
      const Y = CITY.Y,
        ox = CITY.x - 42, // 7x7 plot grid centered on the City (the great tower in the middle)
        oz = CITY.z - 42;
      for (let lz = 0; lz < CH; lz++)
        for (let lx = 0; lx < CH; lx++) {
          const x = x0 + lx,
            z = z0 + lz,
            dc = Math.hypot(x - CITY.x, z - CITY.z);
          if (dc > CITY.R) continue;
          const set = (y, id) => (a[li(lx, y, lz)] = id);
          for (let y = Y + 1; y < SY; y++) set(y, 0);
          for (let y = Y - 4; y < Y; y++) if (!a[li(lx, y, lz)] || a[li(lx, y, lz)] === 11) set(y, 3);
          const gx = (((x - ox) % CITY.STEP) + CITY.STEP) % CITY.STEP,
            gz = (((z - oz) % CITY.STEP) + CITY.STEP) % CITY.STEP,
            street = gx === 0 || gz === 0 || gx === 11 || gz === 11;
          // ground: polished-granite streets, neon strips down the middle of streets, marble tiles elsewhere
          set(Y, dc > CITY.R - 1 ? 81 : street ? ((gx === 0 || gz === 0) && (x + z) % 3 === 0 ? 128 : 80) : (gx + gz) % 2 ? 15 : 81);
          // the plot's building
          const L = cityPlot(Math.floor((x - ox) / CITY.STEP), Math.floor((z - oz) / CITY.STEP));
          if (!L) continue;
          const dx = x - L.cx,
            dz = z - L.cz,
            ax = Math.abs(dx),
            az = Math.abs(dz),
            rd = Math.hypot(dx, dz),
            m = Math.max(ax, az),
            H = L.H,
            dam = (dx + dz) % 2 ? 15 : 81,
            col = n => {
              for (let k = 1; k <= n; k++) set(Y + k, 127);
            },
            colonnade = () => {
              // columns every other row, marble entablature, neon trim along the middle of the facades
              if ((dx + dz) % 2 === 0 || ax === az) col(H);
              set(Y + H + 1, k5(dx, dz) ? 128 : 15);
            };
          if (L.t === 'large') {
            // the great hall: double colonnade, mezzanine, glass pyramid, the Ether diamond hanging at the center
            if (m > 5) continue;
            set(Y, dam);
            if (m === 5) {
              colonnade();
              continue;
            }
            set(Y + H + 1 + (4 - m), m === 4 || dx === 0 || dz === 0 || ax === az ? 15 : 10);
            if (m === 4) set(Y + 5, 34);
            if (dx === -4 && dz === 0) for (let k = 1; k <= 5; k++) set(Y + k, 95); // ladder to the mezzanine
            if (ax === 3 && az === 3) col(H);
            if (ax + az === 2 && m === 2) {
              set(Y + 1, 80);
              set(Y + 2, 129); // ledger screens
            }
            if (m === 0) {
              set(Y + 1, 127);
              set(Y + 2, 84);
              set(Y + 7, 130);
            }
          } else if (L.t === 'temple') {
            // pedimented temple: two-slope roof, ledger screen at the center, benches and lamps
            if (m > 5) continue;
            set(Y, dam);
            if (m === 5) colonnade();
            else set(Y + H + 1, 15);
            if (ax <= 3) set(Y + H + 2, az === 5 && dx === 0 ? 128 : 15);
            else if (ax === 4) set(Y + H + 2, 34);
            if (ax <= 1) set(Y + H + 3, 15);
            else if (ax === 2) set(Y + H + 3, 34);
            if (m === 0) {
              set(Y + 1, 80);
              set(Y + 2, 129);
              set(Y + 3, 129);
            }
            if (ax === 3 && az === 3) {
              set(Y + 1, 127);
              set(Y + 2, 84);
            }
            if (az === 2 && ax <= 1) set(Y + 1, 34);
          } else if (L.t === 'stainedGlassHall') {
            // colonnaded hall under stained glass, palm tree in its pool, mezzanine in the tall halls
            if (m > 5) continue;
            set(Y, dam);
            if (m === 5) {
              colonnade();
              continue;
            }
            set(Y + H + 1, dx % 3 === 0 || dz % 3 === 0 ? 15 : 10);
            if (H >= 9 && m === 4) set(Y + 5, 34);
            if (H >= 9 && dx === -4 && dz === 0) for (let k = 1; k <= 5; k++) set(Y + k, 95);
            if (ax === 3 && az === 3) set(Y + H, 85); // hanging lanterns
            if (m <= 1 && (dx || dz)) set(Y, 11);
          } else if (L.t === 'rotunda') {
            // rotunda: twelve columns in a circle, glass dome, ring-shaped pool around a crystal
            if (rd > 5.5) continue;
            set(Y, dam);
            if (rd === 5) col(H);
            if (rd >= 4.4) set(Y + H + 1, k5(dx, dz) ? 128 : 15);
            else set(Y + H + 2 + Math.floor((4.4 - rd) / 1.1), dx === 0 || dz === 0 ? 15 : 10);
            if (rd >= 2 && rd < 3.2 && dx && dz) set(Y, 11);
            if (m === 0) {
              set(Y + 1, 127);
              set(Y + 2, 83);
              set(Y + 3, 84);
            }
          } else if (L.t === 'library') {
            // library: marble walls on a brick base, tall stained-glass windows, shelving all around
            if (m > 5) continue;
            if (m === 5) {
              set(Y + H + 1, k5(dx, dz) ? 128 : 15);
              if (ax === 5 && az === 5) col(H);
              else {
                const le = az === 5 ? dx : dz,
                  door = az === 5 && ax <= 1;
                for (let k = 1; k <= H; k++) set(Y + k, door && k <= 3 ? 0 : k === 1 ? 79 : (k === 4 || k === 5) && le % 2 === 0 ? 32 : 15);
              }
              continue;
            }
            set(Y, m <= 2 ? 86 : 9);
            set(Y + H + 1, m <= 1 ? 10 : 15);
            if (m === 4 && !(az === 4 && ax <= 1)) for (let k = 1; k <= 3; k++) set(Y + k, 82);
            if (ax === 2 && az === 2) {
              set(Y + 1, 82);
              set(Y + 2, 82);
              set(Y + 3, 85);
            }
            if (m === 0) {
              set(Y + 1, 9);
              set(Y + 2, 14);
            }
          } else if (L.t === 'greenhouse') {
            // greenhouse: glass walls and roof, central aisle, flowers, mushrooms and pink shrubs
            if (m > 5) continue;
            if (m === 5) {
              if (ax === 5 && az === 5) col(5);
              else {
                const door = az === 5 && dx === 0;
                for (let k = 1; k <= 5; k++) set(Y + k, door && k <= 2 ? 0 : k === 5 ? 15 : k === 1 ? 79 : 10);
              }
              continue;
            }
            set(Y + 5 + (m === 4 ? 1 : m >= 2 ? 2 : m === 1 ? 3 : 4), dx === 0 || dz === 0 ? 15 : 10);
            if (dx === 0) set(Y, 80);
            else if (ax === 2 && dz === 0) set(Y, 11);
            else {
              set(Y, 1);
              const r = hash(x, z, 178);
              if (ax === 3 && az === 3) {
                set(Y + 1, 5);
                set(Y + 2, 7);
                set(Y + 3, 7);
              } else if (r < 0.25) set(Y + 1, 17 + Math.floor(hash(x, z, 179) * 3));
              else if (r < 0.4) set(Y + 1, 20);
              else if (r < 0.48) set(Y + 1, 75);
            }
          } else if (L.t === 'market') {
            // market: four stalls under colored awnings, a lamppost in the middle
            const ux = ax - 3,
              uz = az - 3,
              q = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
            if (Math.abs(ux) <= 1 && Math.abs(uz) <= 1) {
              set(Y + 3, 131 + q);
              if (ux && uz) {
                set(Y + 1, 92);
                set(Y + 2, 92);
              } else if (!ux && !uz) {
                set(Y + 1, 9);
                set(Y + 2, [83, 14, 75, 126][q]);
              }
            }
            if (m === 0) {
              col(2);
              set(Y + 3, 84);
            }
          } else if (L.t === 'forecourt') {
            // the entrance: a row of lantern-topped columns
            if (ax === 3 && az <= 5 && (dz + 5) % 3 === 0) {
              col(3);
              set(Y + 4, 84);
            }
          } else if (L.t === 'square') {
            if (rd <= 2) set(Y, 11);
            else if (rd <= 2.9) set(Y + 1, 34);
            if (dx === 0 && dz === 0) {
              set(Y, 15);
              set(Y + 1, 127);
              set(Y + 2, 127);
              set(Y + 3, 84);
            }
          } else if (L.t === 'garden') {
            if (m <= 4) set(Y, 1);
            if (m <= 4 && m >= 3 && (dx + dz) % 2 && hash(x, z, 176) < 0.6) set(Y + 1, 17 + Math.floor(hash(x, z, 177) * 3));
          } else if (L.t === 'shelter') {
            // the shelter: ether-brick walls with a window on each side, pyramid roof, lantern, a proper bed and a table
            const R = 3;
            if (m > R) continue;
            if (m === R) {
              const door = dz === R && ax === 0,
                lantern = dz === -R && ax === 0,
                window = (dx === R || dx === -R) && az === 0;
              for (let k = 1; k <= H; k++)
                set(Y + k, door && k === 1 ? 48 : door && k === 2 ? 49 : lantern && k === 2 ? 84 : window && k === 2 ? 93 : 79); // closed door, not an open gap: mobs roam outside
              continue;
            }
            set(Y, dam);
            set(Y + H + 1 + (R - 1 - m), 9); // pyramid roof, apex over the center
            if (dx === 0 && dz >= -1) set(Y, 86); // reed mat along the entryway
            if (dx === -2 && dz === -1) set(Y + 1, 135); // table
            if (dx === 2 && dz === 1) set(Y + 1, 137); // bed: foot (facing north, toward dz 0)
            if (dx === 2 && dz === 0) set(Y + 1, 141); // bed: head
          }
        }
    }
    // the Circuits Complex, column by column — five walled rooms off a central corridor
    if (inCircuits(x0 + 8, z0 + 8, 20)) {
      const Y = CIRCUITS.Y;
      for (let lz = 0; lz < CH; lz++)
        for (let lx = 0; lx < CH; lx++) {
          const x = x0 + lx,
            z = z0 + lz,
            rx = x - CIRCUITS.x,
            rz = z - CIRCUITS.z;
          let room = null,
            dx = 0,
            dz = 0,
            m = 0;
          for (const r of CIRCUITS_ROOMS) {
            const ddx = rx - r.cx,
              ddz = rz - r.cz,
              mm = Math.max(Math.abs(ddx), Math.abs(ddz));
            if (mm <= r.R) {
              room = r;
              dx = ddx;
              dz = ddz;
              m = mm;
              break;
            }
          }
          const set = (y, id) => (a[li(lx, y, lz)] = id);
          if (room) {
            const R = room.R,
              H = room.H;
            for (let y = Y + 1; y < SY; y++) set(y, 0);
            for (let y = Y - 4; y < Y; y++) if (!a[li(lx, y, lz)] || a[li(lx, y, lz)] === 11) set(y, 3);
            if (m === R) {
              const door = circuitsDoorCell(room, dx, dz);
              for (let k = 1; k <= H; k++) set(Y + k, door && k === 1 ? 48 : door && k === 2 ? 49 : 79);
              continue;
            }
            set(Y, (dx + dz) % 2 ? 15 : 81);
            set(Y + H + 1 + (R - 1 - m), 9); // pyramid roof, apex over the room's center
            room.build(dx, dz, (dy, id) => set(Y + dy, id));
            continue;
          }
          if (rx >= -2 && rx <= 2 && rz >= -20 && rz <= 10) {
            // the corridor connecting the entrance to all five rooms
            for (let y = Y + 1; y < SY; y++) set(y, 0);
            for (let y = Y - 4; y < Y; y++) if (!a[li(lx, y, lz)] || a[li(lx, y, lz)] === 11) set(y, 3);
            set(Y, (rx + rz) % 2 ? 15 : 81);
            set(Y + 5, 9); // flat roof
            if (rz === -20) {
              const door = rx === 0;
              for (let k = 1; k <= 4; k++) set(Y + k, door && k === 1 ? 48 : door && k === 2 ? 49 : 79);
            } else if (rx === -2 || rx === 2) {
              for (let k = 1; k <= 4; k++) set(Y + k, 79);
            }
          }
        }
    }
    // the validators' path: polished-granite slabs, a neon strip, lampposts. Three attempts at
    // smoothing this against the raw per-column terrain each made things worse, the last one bad
    // enough to throw up multi-block towers near the Atrium's own steep blend zone — some average
    // sampled a few blocks out came back wildly different from the column directly underfoot, and nothing
    // bounded how large a fill or cut that mismatch could produce. This one can't do that by
    // construction: h is never anything but the column's own true height, optionally nudged by exactly
    // one block toward its immediate neighbors' majority, so the biggest possible fill or cut is one
    // block, on purpose, every time — no average, no reach beyond next-door, no room for a steep blend
    // zone to produce a tower however the noise happens to line up.
    for (let lz = 0; lz < CH; lz++) {
      const z = z0 + lz;
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx;
        if (!onPath(x, z, 2)) continue;
        const natural = heightAt(x, z);
        let up = 0,
          down = 0;
        for (const [dx, dz] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const d = heightAt(x + dx, z + dz) - natural;
          if (d === 1) up++;
          else if (d === -1) down++;
        }
        const h = up >= 3 ? natural + 1 : down >= 3 ? natural - 1 : natural, // only follow the neighbors when they clearly agree
          e = Math.abs(x - SPAWN.x);
        if (h <= SEA) continue;
        if (h < natural) for (let y = h + 1; y <= natural; y++) a[li(lx, y, lz)] = 0; // cut: at most one block
        a[li(lx, h, lz)] = e === 0 && ((z % 4) + 4) % 4 === 0 ? 128 : 80; // the lane's own surface, full width
        if (e <= 1) {
          for (let k = 1; k <= 3; k++) a[li(lx, h + k, lz)] = 0;
        } else if (((z % 8) + 8) % 8 === 0) {
          a[li(lx, h + 1, lz)] = a[li(lx, h + 2, lz)] = 127;
          a[li(lx, h + 3, lz)] = 84;
        }
      }
    }
    // the City's palm trees (under the domes and on the squares), within the 3-column margin
    if (inCity(x0 + 8, z0 + 8, 16))
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 7; i++) {
          const L = cityPlot(i, j);
          if (!L) continue;
          const pts =
            L.t === 'stainedGlassHall'
              ? [[0, 0]]
              : L.t === 'square'
                ? [
                    [-4, -4],
                    [4, -4],
                    [-4, 4],
                    [4, 4],
                  ]
                : L.t === 'garden'
                  ? [
                      [-2, -2],
                      [2, 2],
                    ]
                  : [];
          for (const [dx, dz] of pts) {
            const x = L.cx + dx,
              z = L.cz + dz;
            if (x < x0 - 3 || x >= x0 + CH + 3 || z < z0 - 3 || z >= z0 + CH + 3) continue;
            put(x, CITY.Y, z, 1);
            palmTree(x, CITY.Y, z, L.t === 'stainedGlassHall' ? Math.min(5, L.H - 3) : 5);
          }
        }
    // Ether gardens: marble terrace, fountain and lantern column, cypresses at the corners (at most one per 64x64 region)
    for (let gz = Math.floor((z0 - 6) / 64); gz <= Math.floor((z0 + CH + 6) / 64); gz++)
      for (let gx = Math.floor((x0 - 6) / 64); gx <= Math.floor((x0 + CH + 6) / 64); gx++) {
        const j = gardenAt(gx, gz);
        if (!j) continue;
        const { x: jx, z: jz, y: jy } = j;
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++) {
            const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
            for (let k = 1; k <= 7; k++) put(jx + dx, jy + k, jz + dz, 0);
            for (let k = 1; k <= 3; k++) put(jx + dx, jy - k, jz + dz, 3);
            put(jx + dx, jy, jz + dz, edge ? 1 : Math.max(Math.abs(dx), Math.abs(dz)) === 1 ? 11 : (dx + dz) % 2 ? 15 : 80);
            if (edge && (dx + dz) % 2 === 0 && !(Math.abs(dx) === 4 && Math.abs(dz) === 4)) put(jx + dx, jy + 1, jz + dz, 7); // pink hedge
            if (edge && (dx + dz) % 2 && hash(jx + dx, jz + dz, 160) < 0.7)
              put(jx + dx, jy + 1, jz + dz, 17 + Math.floor(hash(jx + dx, jz + dz, 161) * 3));
          }
        for (let k = 1; k <= 3; k++) put(jx, jy + k, jz, 127);
        put(jx, jy + 4, jz, 84);
        for (const [dx, dz] of [
          [-4, -4],
          [4, -4],
          [-4, 4],
          [4, 4],
        ]) {
          put(jx + dx, jy + 1, jz + dz, 5);
          for (let k = 2; k <= 6; k++) put(jx + dx, jy + k, jz + dz, 6);
        }
      }
    // the validator's sanctuary, at the spawn point
    const sx = SPAWN.x,
      sz = SPAWN.z,
      sy = SPAWN.y - 1;
    // the Atrium: marble floor, fountain, columns, dome pierced with neon, potted palm trees.
    // It all fits within the sanctuary chunk (x and z from 1 to 15).
    if (x0 <= sx + 8 && x0 + CH > sx - 8 && z0 <= sz + 8 && z0 + CH > sz - 8) {
      for (let dx = -7; dx <= 7; dx++)
        for (let dz = -7; dz <= 7; dz++) {
          const d = Math.hypot(dx, dz);
          if (d > 7.5) continue;
          const x = sx + dx,
            z = sz + dz;
          for (let k = 1; k <= 12; k++) put(x, sy + k, z, 0);
          for (let k = 1; k <= 3; k++) if (!at(x, sy - k, z) || at(x, sy - k, z) === 11) put(x, sy - k, z, 3); // foundations
          put(x, sy, z, d > 5.5 ? 81 : (Math.abs(dx) + Math.abs(dz)) % 2 ? 15 : 80);
          if (d >= 2.9 && d <= 3.7 && dx && dz) put(x, sy, z, 11); // pool, crossed by four walkways
        }
      // columns and roof ring
      for (let k = 0; k < 8; k++) {
        const an = ((k + 0.5) / 8) * Math.PI * 2, // offset by half a step: the four walkways stay open
          x = sx + Math.round(Math.cos(an) * 6),
          z = sz + Math.round(Math.sin(an) * 6);
        for (let h = 1; h <= 5; h++) put(x, sy + h, z, 127);
        if (k % 2) put(x, sy + 6, z, 84); // pink lantern on top
      }
      for (let dx = -7; dx <= 7; dx++)
        for (let dz = -7; dz <= 7; dz++) {
          const d = Math.hypot(dx, dz);
          if (d >= 5.6 && d <= 6.6) put(sx + dx, sy + 6, sz + dz, at(sx + dx, sy + 6, sz + dz) === 84 ? 84 : 34);
        }
      // dome: four white-marble arches crossing above the validator, a diamond block at the top
      for (let t = -6; t <= 6; t++) {
        const hy = sy + 6 + Math.round(Math.sqrt(Math.max(0, 36 - t * t)) * 0.55);
        put(sx + t, hy, sz, 15);
        put(sx, hy, sz + t, 15);
        const dd = Math.round(t * 0.7071);
        put(sx + dd, hy, sz + dd, 15);
        put(sx + dd, hy, sz - dd, 15);
      }
      put(sx, sy + 10, sz, 130);
      // potted palm trees
      for (const [dx, dz] of [
        [-4, -2],
        [4, -2],
        [-4, 2],
        [4, 2],
      ]) {
        put(sx + dx, sy, sz + dz, 1);
        palmTree(sx + dx, sy, sz + dz, 5);
      }
      put(sx, sy + 1, sz, 13);
    }
    return a;
  }

  // A chunk's terrain, encoded as runs (length, block) then base64.
  function encodeChunk(arr) {
    const out = [];
    let last = -1,
      run = 0;
    const push = () => {
      if (run) out.push(run, last);
    };
    for (let i = 0; i < CV; i++) {
      const v = arr[i];
      if (v === last && run < 255) run++;
      else {
        push();
        last = v;
        run = 1;
      }
    }
    push();
    let b = '';
    for (let i = 0; i < out.length; i += 8192) b += String.fromCharCode.apply(null, out.slice(i, i + 8192));
    return btoa(b);
  }
  function decodeChunk(data, sy) {
    const bin = atob(data),
      a = new Uint8Array(CV),
      max = CH * CH * Math.min(sy, SY);
    let n = 0;
    for (let i = 0; i + 1 < bin.length && n < max; i += 2) {
      const r = bin.charCodeAt(i),
        v = bin.charCodeAt(i + 1);
      for (let k = 0; k < r && n < max; k++) a[n++] = v;
    }
    return a;
  }
  const btoa = root.btoa,
    atob = root.atob;
  root.World = {
    SY,
    DY,
    SEA,
    CH,
    CV,
    DEEP,
    GEN,
    SPAWN,
    SEED,
    LIMIT,
    RUIN,
    clamp,
    lerp,
    sm,
    hash,
    hash3,
    vn2,
    vn3,
    ckey,
    coordKey,
    cOf,
    li,
    inWorld,
    ruinAt,
    gardenAt,
    towerAt,
    TOWER,
    TR,
    TOWER_LADDER,
    TOWER_CHEST,
    mergeAt,
    MERGE,
    MERGE_R,
    arenaAt,
    ARENA,
    ARENA_R,
    ARENA_W,
    CITY,
    inCity,
    CIRCUITS,
    inCircuits,
    onPath,
    cityPlot,
    contAt,
    heightAt,
    islandZone,
    isIsland,
    islandTop,
    biome,
    topAt,
    genChunk,
    encodeChunk,
    decodeChunk,
  };
})(globalThis);
