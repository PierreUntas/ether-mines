// Générateur du monde, partagé par le navigateur et par la fonction serveur « figer ».
// Script sans import ni export : chargé tel quel par <script> dans le jeu, importé par Deno côté serveur.
// Tout changement du terrain produit ici doit s'accompagner d'une hausse de GEN.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, t) => a + (b - a) * t,
    sm = t => t * t * (3 - 2 * t);
  function hash(x, y, s = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(97 + s, 1442695041);
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
    DEEP = 20; // DEEP : sous cette couche, géodes et grandes grottes
  const GEN = 1; // version du générateur : l'augmenter à chaque changement de terrain (les tronçons déjà figés ne bougent plus)
  const SPAWN = { x: 8, z: 8, y: 0 };
  const ckey = (cx, cz) => cx + ',' + cz,
    coordKey = (x, y, z) => x + ',' + y + ',' + z,
    cOf = v => Math.floor(v / CH);
  const li = (lx, y, lz) => lx + lz * CH + y * CH * CH;
  // Monde infini, borné seulement par les règles de la base (±100 000 blocs depuis le centre).
  const LIMITE = 100000;
  const inWorld = (x, z) => Math.abs(x) < LIMITE && Math.abs(z) < LIMITE;
  const RUIN = 80;
  // position de la ruine d'une région (ou null : océan, sommet) ; la région du sanctuaire en a une à portée de vue
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
  const contAt = (x, z) => vn2(x / 170 + 50, z / 170 - 40, 9) * 0.7 + vn2(x / 60, z / 60, 10) * 0.3; // bas = océan
  function heightAt(x, z) {
    const c = vn2(x / 40, z / 40, 1) * 0.6 + vn2(x / 17, z / 17, 2) * 0.3 + vn2(x / 7, z / 7, 3) * 0.1;
    const m = sm(clamp((vn2(x / 64 + 10, z / 64 + 10, 4) - 0.52) / 0.25, 0, 1));
    const d = Math.hypot(x - SPAWN.x, z - SPAWN.z),
      flat = sm(clamp((d - 5) / 10, 0, 1)),
      oc = sm(clamp((0.4 - contAt(x, z)) / 0.1, 0, 1));
    const land = DY + 12 + c * 14 + m * 18 * vn2(x / 16, z / 16, 5),
      sea = DY + 5 + vn2(x / 9, z / 9, 11) * 5;
    return Math.floor(lerp(DY + 20, lerp(land, sea, oc), flat));
  }
  // îles flottantes : nuages de roche entre DY+31 et DY+45, loin du sanctuaire, jamais au-dessus des montagnes
  const islandZone = (x, z) =>
    vn2(x / 90 + 7, z / 90 - 3, 14) > 0.56 && Math.hypot(x - SPAWN.x, z - SPAWN.z) > 36 && heightAt(x, z) < DY + 29 && contAt(x, z) > 0.42;
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
    return b < 0.42 ? 'plaine' : b < 0.66 ? 'foret' : 'dunes';
  }
  const topAt = (h, bi) => (h <= SEA + 1 ? 4 : bi === 'dunes' ? 4 : h >= DY + 36 ? 16 : h >= DY + 31 ? 3 : 1);
  SPAWN.y = heightAt(SPAWN.x, SPAWN.z) + 1;
  function genChunk(cx, cz) {
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
          if (id === 3 && y > 1 && y < DEEP - 1 && vn3(x / 18, y / 6, z / 18, 15) > 0.66) id = 0; // grandes grottes profondes
          if (id === 3 && vn3(x / 3.2, y / 3.2, z / 3.2, 8) > 0.8 - Math.min(0.1, (h - y) * 0.004)) id = 8;
          if (id === 3 && y < DEEP && vn3(x / 2.4, y / 2.4, z / 2.4, 16) > 0.885) id = 69; // géodes d'éther pur
          if (id === 3 && (y <= 2 || (y <= 4 && vn3(x / 5, y / 3, z / 5, 17) > 0.5))) id = 72; // roche de genèse, tout au fond
          if (id) a[li(lx, y, lz)] = id;
        }
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
    // décor : racines prises dans une marge de 3 colonnes, pour qu'un arbre à cheval sur deux tronçons soit identique des deux côtés
    for (let z = z0 - 3; z < z0 + CH + 3; z++)
      for (let x = x0 - 3; x < x0 + CH + 3; x++) {
        const h = heightAt(x, z),
          bi = biome(x, z);
        if (topAt(h, bi) !== 1 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue;
        const r = hash(x, z, 40);
        if (bi === 'foret' && r < 0.004) {
          const t = 2 + Math.floor(hash(x, z, 41) * 3);
          for (let k = 1; k <= t; k++) put(x, h + k, z, 8);
          continue;
        }
        if (r < (bi === 'foret' ? 0.028 : 0.01)) {
          const th = 4 + Math.floor(hash(x, z, 42) * 3),
            leaf = bi === 'foret' ? 7 : 6;
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
        if (at(x, h + 1, z) === 0) {
          if (r < 0.09) put(x, h + 1, z, 20);
          else if (r < 0.11) put(x, h + 1, z, 17 + Math.floor(hash(x, z, 43) * 3));
        }
      }
    // décor des îles flottantes (même marge : identique des deux côtés d'un bord)
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
    // ruines : un validateur éteint par région de 80 × 80
    for (let rz = Math.floor((z0 - 4) / RUIN); rz <= Math.floor((z0 + CH + 4) / RUIN); rz++)
      for (let rx = Math.floor((x0 - 4) / RUIN); rx <= Math.floor((x0 + CH + 4) / RUIN); rx++) {
        const r = ruinAt(rx, rz);
        if (!r) continue;
        const { x: rx0, z: rz0, y: ry } = r;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            const hh = hash(rx0 + dx, rz0 + dz, 121);
            put(rx0 + dx, ry, rz0 + dz, hh < 0.2 ? 3 : 15);
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
          for (let k = 1; k <= hp; k++) put(rx0 + dx, ry + k, rz0 + dz, hash(rx0 + dx, k, 123) < 0.25 ? 3 : 15);
          if (hp === 3) put(rx0 + dx, ry + 4, rz0 + dz, 14);
        }
        put(rx0, ry + 1, rz0, 73);
      }
    // le sanctuaire du validateur, au point d'apparition
    const sx = SPAWN.x,
      sz = SPAWN.z,
      sy = SPAWN.y - 1;
    if (x0 <= sx + 3 && x0 + CH > sx - 3 && z0 <= sz + 3 && z0 + CH > sz - 3) {
      for (let dx = -3; dx <= 3; dx++)
        for (let dz = -3; dz <= 3; dz++) {
          put(sx + dx, sy, sz + dz, 15);
          for (let k = 1; k < 7; k++) put(sx + dx, sy + k, sz + dz, 0);
        }
      for (const [dx, dz] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ])
        for (let k = 1; k <= 4; k++) put(sx + dx, sy + k, sz + dz, 15);
      for (let dx = -3; dx <= 3; dx++)
        for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) === 3 || Math.abs(dz) === 3) put(sx + dx, sy + 5, sz + dz, 15);
      put(sx, sy + 1, sz, 13);
      for (const [dx, dz] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
      ])
        put(sx + dx, sy + 4, sz + dz, 14);
    }
    return a;
  }

  // Terrain d'un tronçon, encodé par plages (longueur, bloc) puis en base64.
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
    LIMITE,
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
