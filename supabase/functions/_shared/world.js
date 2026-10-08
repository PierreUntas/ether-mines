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
  const SEED = root.__SEED ?? 2047435448;
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
  const GEN = 9; // generator version (2: mushrooms...; 3: palms, amethysts; 4: atrium, temples, gardens; 5: the City; 6: the City in halls; 8: the shelter, room to eat and sleep; 9: bigger shelter with the 2-block bed) : bump it on every terrain change (already-frozen chunks don't move)
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
  const CITY = { x: SPAWN.x, z: SPAWN.z - 64, R: 30, Y: 30, STEP: 12 };
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
      flat = sm(clamp((d - 5) / 10, 0, 1)),
      oc = sm(clamp((0.4 - contAt(x, z)) / 0.1, 0, 1));
    const land = DY + 12 + c * 14 + m * 18 * vn2(x / 16, z / 16, 5),
      sea = DY + 5 + vn2(x / 9, z / 9, 11) * 5;
    const dc = Math.hypot(x - CITY.x, z - CITY.z),
      city = sm(clamp((dc - CITY.R) / 12, 0, 1)); // the City sits on a plateau that blends into the terrain
    return Math.floor(lerp(CITY.Y + 0.5, lerp(DY + 20, lerp(land, sea, oc), flat), city));
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
              for (let k = 1; k <= H; k++) set(Y + k, door && k <= 2 ? 0 : lantern && k === 2 ? 84 : window && k === 2 ? 93 : 79);
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
    // the validators' path: polished-granite slabs, a neon strip, lampposts
    for (let lz = 0; lz < CH; lz++)
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx,
          z = z0 + lz;
        if (!onPath(x, z, 2)) continue;
        const h = heightAt(x, z),
          e = Math.abs(x - SPAWN.x);
        if (h <= SEA) continue;
        if (e <= 1) {
          a[li(lx, h, lz)] = e === 0 && ((z % 4) + 4) % 4 === 0 ? 128 : 80;
          for (let k = 1; k <= 3; k++) a[li(lx, h + k, lz)] = 0;
        } else if (((z % 8) + 8) % 8 === 0) {
          a[li(lx, h + 1, lz)] = a[li(lx, h + 2, lz)] = 127;
          a[li(lx, h + 3, lz)] = 84;
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
    CITY,
    inCity,
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
