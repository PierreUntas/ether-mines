// Générateur du monde, partagé par le navigateur et par la fonction serveur « figer ».
// Script sans import ni export : chargé tel quel par <script> dans le jeu, importé par Deno côté serveur.
// Tout changement du terrain produit ici doit s'accompagner d'une hausse de GEN.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, t) => a + (b - a) * t,
    sm = t => t * t * (3 - 2 * t);
  // Graine du monde : la changer donne un tout autre relief (à faire seulement avec une remise à zéro de la base).
  // root.__GRAINE permet aux outils d'essayer d'autres graines (tools/graines.mjs).
  const GRAINE = root.__GRAINE ?? 167212110;
  function hash(x, y, s = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(97 + s, 1442695041) ^ GRAINE;
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
  const GEN = 8; // version du générateur (2 : champignons… ; 3 : palmiers, améthystes ; 4 : atrium, temples, jardins ; 5 : la Cité ; 6 : la Cité en halls ; 8 : le refuge, salle pour manger et dormir) : l'augmenter à chaque changement de terrain (les tronçons déjà figés ne bougent plus)
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
  // ---------- la Cité : quartier futuriste sous le grand diamant, au nord du sanctuaire ----------
  const CITE = { x: SPAWN.x, z: SPAWN.z - 64, R: 30, Y: 30, PAS: 12 };
  const k5 = (dx, dz) => (dx === 0 || dz === 0) && Math.abs(dx) + Math.abs(dz) === 5; // milieu d'une façade de hall
  const dansCite = (x, z, marge = 0) => Math.hypot(x - CITE.x, z - CITE.z) <= CITE.R + marge;
  // la voie des validateurs : allée dallée entre l'Atrium et la Cité
  const surVoie = (x, z, marge = 1) => Math.abs(x - SPAWN.x) <= marge && z < SPAWN.z - 7 && z > CITE.z + CITE.R - 2;
  // parcelle de la grille (12 × 12) : chaque bâtiment de la Cité a sa place et son allure
  const LOTS = {
    '0,0': { t: 'grand', H: 10 }, // le grand hall, sous sa pyramide de verre
    '0,-1': { t: 'temple', H: 7 }, // le temple du registre, à fronton
    '-1,-1': { t: 'biblio', H: 6 }, // la bibliothèque
    '1,-1': { t: 'serre' }, // la serre
    '-1,0': { t: 'rotonde', H: 6 }, // la rotonde et sa coupole
    '1,0': { t: 'verriere', H: 9 }, // halls à colonnades sous verrière
    '1,1': { t: 'verriere', H: 6 },
    '-1,1': { t: 'marche' }, // le marché
    '0,1': { t: 'place' },
    '0,2': { t: 'parvis' }, // l'entrée, au bout de la voie qui vient du sanctuaire
    '0,-2': { t: 'place' },
    '2,0': { t: 'jardin' },
    '-2,0': { t: 'jardin' },
    '2,1': { t: 'refuge', H: 3 }, // le refuge : une pièce pour manger et dormir
  };
  function citeLot(i, j) {
    const L = LOTS[i - 3 + ',' + (j - 3)];
    return L ? { ...L, cx: CITE.x + (i - 3) * CITE.PAS, cz: CITE.z + (j - 3) * CITE.PAS } : null;
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
        dansCite(x, z, 12) ||
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
    const dc = Math.hypot(x - CITE.x, z - CITE.z),
      cite = sm(clamp((dc - CITE.R) / 12, 0, 1)); // la Cité repose sur un plateau qui se fond dans le relief
    return Math.floor(lerp(CITE.Y + 0.5, lerp(DY + 20, lerp(land, sea, oc), flat), cite));
  }
  // jardin d'une région de 64 × 64 (ou null) : sur un sol d'herbe assez plat, loin du sanctuaire et des ruines
  function jardinAt(gx, gz) {
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
    if (islandZone(x, z) || dansCite(x, z, 16)) return null;
    return { x, z, y };
  }
  // îles flottantes : nuages de roche entre DY+31 et DY+45, loin du sanctuaire, jamais au-dessus des montagnes
  const islandZone = (x, z) =>
    vn2(x / 90 + 7, z / 90 - 3, 14) > 0.56 &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > 36 &&
    heightAt(x, z) < DY + 29 &&
    contAt(x, z) > 0.42 &&
    !dansCite(x, z, 14);
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
    // palmier de tronc en (x, z) posé sur le sol h ; ses palmes tiennent dans la marge de 3 colonnes du décor
    const palmier = (x, h, z, hauteur) => {
      const th = hauteur || 5 + Math.floor(hash(x, z, 141) * 3);
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
          if (id === 3 && y > 1 && y < DEEP - 1 && vn3(x / 18, y / 6, z / 18, 15) > 0.66) id = 0; // grandes grottes profondes
          if (id === 3 && vn3(x / 3.2, y / 3.2, z / 3.2, 8) > 0.8 - Math.min(0.1, (h - y) * 0.004)) id = 8;
          if (id === 3 && y < DEEP && vn3(x / 2.4, y / 2.4, z / 2.4, 16) > 0.885) id = 69; // géodes d'éther pur
          if (id === 3 && (y <= 2 || (y <= 4 && vn3(x / 5, y / 3, z / 5, 17) > 0.5))) id = 72; // roche de genèse, tout au fond
          if (id) a[li(lx, y, lz)] = id;
        }
        // champignons d'éther sur le sol des grottes (une seule colonne : rien ne déborde sur le tronçon voisin)
        for (let y = 2; y < h - 4; y++) {
          const i = li(lx, y, lz),
            sol = a[li(lx, y - 1, lz)];
          if (a[i] || !(sol === 3 || sol === 8 || sol === 72)) continue;
          const r = hash(x * 7 + y, z, 130);
          if (r < (y < DEEP ? 0.04 : 0.015)) a[i] = 75;
          else if (y < DEEP && r < 0.055) a[i] = 126; // amas d'améthyste, seulement dans les profondeurs
        }
        if (h >= SEA && h <= SEA + 2 && !islandZone(x, z)) {
          // roseaux sur les rives : une colonne voisine est sous l'eau
          const rive = Math.min(heightAt(x + 1, z), heightAt(x - 1, z), heightAt(x, z + 1), heightAt(x, z - 1)) < SEA;
          if (rive && hash(x, z, 131) < 0.3) a[li(lx, h + 1, lz)] = 76;
        } else if (h < SEA && h >= SEA - 4 && hash(x, z, 132) < 0.035 && !a[li(lx, SEA + 1, lz)]) a[li(lx, SEA + 1, lz)] = 77; // nénuphars en eau peu profonde
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
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16 || dansCite(x, z, 4) || surVoie(x, z, 3)) continue; // esplanade de l'Atrium, la Cité, la voie
        // palmiers sur les plages et dans les dunes
        if (topAt(h, bi) === 4 && h > SEA && h < DY + 31 && hash(x, z, 140) < (bi === 'dunes' ? 0.006 : 0.014)) {
          palmier(x, h, z);
          continue;
        }
        if (topAt(h, bi) !== 1) continue;
        const r = hash(x, z, 40);
        if (bi === 'foret' && r < 0.004) {
          const t = 2 + Math.floor(hash(x, z, 41) * 3);
          for (let k = 1; k <= t; k++) put(x, h + k, z, 8);
          continue;
        }
        if (bi !== 'foret' && r < 0.01 && hash(x, z, 150) < 0.55) {
          // cyprès : fin et haut, comme dans le jardin d'Éther
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
        if (r < (bi === 'foret' ? 0.028 : 0.01)) {
          const th = 4 + Math.floor(hash(x, z, 42) * 3),
            leaf = bi === 'foret' && hash(x, z, 44) < 0.65 ? 7 : 6; // forêts roses mêlées d'arbres bleu lavande
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
        if (bi !== 'foret' && r >= 0.01 && r < 0.0125) {
          // rocher moussu de 1 à 4 blocs, posé sur le relief de chaque colonne
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
            put(rx0 + dx, ry, rz0 + dz, hh < 0.15 ? 78 : (dx + dz) % 2 ? 15 : 81); // dallage usé
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
          for (let k = 1; k <= hp; k++) put(rx0 + dx, ry + k, rz0 + dz, hash(rx0 + dx, k, 123) < 0.2 ? 78 : 127); // colonnes brisées
          if (hp === 3) put(rx0 + dx, ry + 4, rz0 + dz, 14);
        }
        put(rx0, ry + 1, rz0, 73);
      }
    // la Cité, colonne par colonne (chaque colonne ne dépend que de x et z)
    if (dansCite(x0 + 8, z0 + 8, 12)) {
      const Y = CITE.Y,
        ox = CITE.x - 42, // grille de 7 × 7 parcelles centrée sur la Cité (la grande tour au milieu)
        oz = CITE.z - 42;
      for (let lz = 0; lz < CH; lz++)
        for (let lx = 0; lx < CH; lx++) {
          const x = x0 + lx,
            z = z0 + lz,
            dc = Math.hypot(x - CITE.x, z - CITE.z);
          if (dc > CITE.R) continue;
          const set = (y, id) => (a[li(lx, y, lz)] = id);
          for (let y = Y + 1; y < SY; y++) set(y, 0);
          for (let y = Y - 4; y < Y; y++) if (!a[li(lx, y, lz)] || a[li(lx, y, lz)] === 11) set(y, 3);
          const gx = (((x - ox) % CITE.PAS) + CITE.PAS) % CITE.PAS,
            gz = (((z - oz) % CITE.PAS) + CITE.PAS) % CITE.PAS,
            rue = gx === 0 || gz === 0 || gx === 11 || gz === 11;
          // sol : rues de granite poli, lignes de néon au milieu des rues, dalles de marbre ailleurs
          set(Y, dc > CITE.R - 1 ? 81 : rue ? ((gx === 0 || gz === 0) && (x + z) % 3 === 0 ? 128 : 80) : (gx + gz) % 2 ? 15 : 81);
          // bâtiment de la parcelle
          const L = citeLot(Math.floor((x - ox) / CITE.PAS), Math.floor((z - oz) / CITE.PAS));
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
              // colonnes un rang sur deux, entablement de marbre, liseré de néon au milieu des façades
              if ((dx + dz) % 2 === 0 || ax === az) col(H);
              set(Y + H + 1, k5(dx, dz) ? 128 : 15);
            };
          if (L.t === 'grand') {
            // le grand hall : double colonnade, mezzanine, pyramide de verre, le diamant d'Éther suspendu au centre
            if (m > 5) continue;
            set(Y, dam);
            if (m === 5) {
              colonnade();
              continue;
            }
            set(Y + H + 1 + (4 - m), m === 4 || dx === 0 || dz === 0 || ax === az ? 15 : 10);
            if (m === 4) set(Y + 5, 34);
            if (dx === -4 && dz === 0) for (let k = 1; k <= 5; k++) set(Y + k, 95); // échelle vers la mezzanine
            if (ax === 3 && az === 3) col(H);
            if (ax + az === 2 && m === 2) {
              set(Y + 1, 80);
              set(Y + 2, 129); // écrans du registre
            }
            if (m === 0) {
              set(Y + 1, 127);
              set(Y + 2, 84);
              set(Y + 7, 130);
            }
          } else if (L.t === 'temple') {
            // temple à fronton : toit à deux pentes, écran du registre au centre, bancs et lampes
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
          } else if (L.t === 'verriere') {
            // hall à colonnades sous verrière, palmier dans son bassin, mezzanine dans les halls hauts
            if (m > 5) continue;
            set(Y, dam);
            if (m === 5) {
              colonnade();
              continue;
            }
            set(Y + H + 1, dx % 3 === 0 || dz % 3 === 0 ? 15 : 10);
            if (H >= 9 && m === 4) set(Y + 5, 34);
            if (H >= 9 && dx === -4 && dz === 0) for (let k = 1; k <= 5; k++) set(Y + k, 95);
            if (ax === 3 && az === 3) set(Y + H, 85); // lanternes suspendues
            if (m <= 1 && (dx || dz)) set(Y, 11);
          } else if (L.t === 'rotonde') {
            // rotonde : douze colonnes en cercle, coupole de verre, bassin en anneau autour d'un cristal
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
          } else if (L.t === 'biblio') {
            // bibliothèque : murs de marbre sur un soubassement de briques, vitraux hauts, rayonnages tout autour
            if (m > 5) continue;
            if (m === 5) {
              set(Y + H + 1, k5(dx, dz) ? 128 : 15);
              if (ax === 5 && az === 5) col(H);
              else {
                const le = az === 5 ? dx : dz,
                  porte = az === 5 && ax <= 1;
                for (let k = 1; k <= H; k++)
                  set(Y + k, porte && k <= 3 ? 0 : k === 1 ? 79 : (k === 4 || k === 5) && le % 2 === 0 ? 32 : 15);
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
          } else if (L.t === 'serre') {
            // serre : murs et toit de verre, allée centrale, fleurs, champignons et arbustes roses
            if (m > 5) continue;
            if (m === 5) {
              if (ax === 5 && az === 5) col(5);
              else {
                const porte = az === 5 && dx === 0;
                for (let k = 1; k <= 5; k++) set(Y + k, porte && k <= 2 ? 0 : k === 5 ? 15 : k === 1 ? 79 : 10);
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
          } else if (L.t === 'marche') {
            // marché : quatre étals sous des toiles de couleur, un réverbère au milieu
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
          } else if (L.t === 'parvis') {
            // l'entrée : une allée de colonnes à lanterne
            if (ax === 3 && az <= 5 && (dz + 5) % 3 === 0) {
              col(3);
              set(Y + 4, 84);
            }
          } else if (L.t === 'place') {
            if (rd <= 2) set(Y, 11);
            else if (rd <= 2.9) set(Y + 1, 34);
            if (dx === 0 && dz === 0) {
              set(Y, 15);
              set(Y + 1, 127);
              set(Y + 2, 127);
              set(Y + 3, 84);
            }
          } else if (L.t === 'jardin') {
            if (m <= 4) set(Y, 1);
            if (m <= 4 && m >= 3 && (dx + dz) % 2 && hash(x, z, 176) < 0.6) set(Y + 1, 17 + Math.floor(hash(x, z, 177) * 3));
          } else if (L.t === 'refuge') {
            // le refuge : murs de briques d'éther, porte au sud, lanterne au nord, table et lit à l'intérieur
            if (m > 2) continue;
            if (m === 2) {
              const porte = dz === 2 && ax === 0,
                lanterne = dz === -2 && ax === 0;
              for (let k = 1; k <= H; k++) set(Y + k, porte && k <= 2 ? 0 : lanterne && k === 2 ? 84 : 79);
              continue;
            }
            set(Y, dam);
            set(Y + H + 1, 9);
            if (dx === -1 && dz === 0) set(Y + 1, 135);
            if (dx === 1 && dz === 0) set(Y + 1, 136);
          }
        }
    }
    // la voie des validateurs : dalles de granite poli, filet de néon, réverbères
    for (let lz = 0; lz < CH; lz++)
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx,
          z = z0 + lz;
        if (!surVoie(x, z, 2)) continue;
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
    // palmiers de la Cité (sous les dômes et sur les places), dans la marge de 3 colonnes
    if (dansCite(x0 + 8, z0 + 8, 16))
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 7; i++) {
          const L = citeLot(i, j);
          if (!L) continue;
          const pts =
            L.t === 'verriere'
              ? [[0, 0]]
              : L.t === 'place'
                ? [
                    [-4, -4],
                    [4, -4],
                    [-4, 4],
                    [4, 4],
                  ]
                : L.t === 'jardin'
                  ? [
                      [-2, -2],
                      [2, 2],
                    ]
                  : [];
          for (const [dx, dz] of pts) {
            const x = L.cx + dx,
              z = L.cz + dz;
            if (x < x0 - 3 || x >= x0 + CH + 3 || z < z0 - 3 || z >= z0 + CH + 3) continue;
            put(x, CITE.Y, z, 1);
            palmier(x, CITE.Y, z, L.t === 'verriere' ? Math.min(5, L.H - 3) : 5);
          }
        }
    // jardins d'Éther : terrasse de marbre, fontaine et colonne à lanterne, cyprès aux coins (un par région de 64 × 64 au plus)
    for (let gz = Math.floor((z0 - 6) / 64); gz <= Math.floor((z0 + CH + 6) / 64); gz++)
      for (let gx = Math.floor((x0 - 6) / 64); gx <= Math.floor((x0 + CH + 6) / 64); gx++) {
        const j = jardinAt(gx, gz);
        if (!j) continue;
        const { x: jx, z: jz, y: jy } = j;
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++) {
            const bord = Math.abs(dx) === 4 || Math.abs(dz) === 4;
            for (let k = 1; k <= 7; k++) put(jx + dx, jy + k, jz + dz, 0);
            for (let k = 1; k <= 3; k++) put(jx + dx, jy - k, jz + dz, 3);
            put(jx + dx, jy, jz + dz, bord ? 1 : Math.max(Math.abs(dx), Math.abs(dz)) === 1 ? 11 : (dx + dz) % 2 ? 15 : 80);
            if (bord && (dx + dz) % 2 === 0 && !(Math.abs(dx) === 4 && Math.abs(dz) === 4)) put(jx + dx, jy + 1, jz + dz, 7); // haie rose
            if (bord && (dx + dz) % 2 && hash(jx + dx, jz + dz, 160) < 0.7)
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
    // le sanctuaire du validateur, au point d'apparition
    const sx = SPAWN.x,
      sz = SPAWN.z,
      sy = SPAWN.y - 1;
    // l'Atrium : sol de marbre, fontaine, colonnes, dôme ajouré de néons, palmiers en jardinières.
    // Tout tient dans le tronçon du sanctuaire (x et z de 1 à 15).
    if (x0 <= sx + 8 && x0 + CH > sx - 8 && z0 <= sz + 8 && z0 + CH > sz - 8) {
      for (let dx = -7; dx <= 7; dx++)
        for (let dz = -7; dz <= 7; dz++) {
          const d = Math.hypot(dx, dz);
          if (d > 7.5) continue;
          const x = sx + dx,
            z = sz + dz;
          for (let k = 1; k <= 12; k++) put(x, sy + k, z, 0);
          for (let k = 1; k <= 3; k++) if (!at(x, sy - k, z) || at(x, sy - k, z) === 11) put(x, sy - k, z, 3); // fondations
          put(x, sy, z, d > 5.5 ? 81 : (Math.abs(dx) + Math.abs(dz)) % 2 ? 15 : 80);
          if (d >= 2.9 && d <= 3.7 && dx && dz) put(x, sy, z, 11); // bassin, coupé par quatre allées
        }
      // colonnes et anneau du toit
      for (let k = 0; k < 8; k++) {
        const an = ((k + 0.5) / 8) * Math.PI * 2, // décalées d'un demi-pas : les quatre allées restent ouvertes
          x = sx + Math.round(Math.cos(an) * 6),
          z = sz + Math.round(Math.sin(an) * 6);
        for (let h = 1; h <= 5; h++) put(x, sy + h, z, 127);
        if (k % 2) put(x, sy + 6, z, 84); // lanterne rose au sommet
      }
      for (let dx = -7; dx <= 7; dx++)
        for (let dz = -7; dz <= 7; dz++) {
          const d = Math.hypot(dx, dz);
          if (d >= 5.6 && d <= 6.6) put(sx + dx, sy + 6, sz + dz, at(sx + dx, sy + 6, sz + dz) === 84 ? 84 : 34);
        }
      // dôme : quatre arcs de marbre blanc qui se croisent au-dessus du validateur, un bloc diamant au sommet
      for (let t = -6; t <= 6; t++) {
        const hy = sy + 6 + Math.round(Math.sqrt(Math.max(0, 36 - t * t)) * 0.55);
        put(sx + t, hy, sz, 15);
        put(sx, hy, sz + t, 15);
        const dd = Math.round(t * 0.7071);
        put(sx + dd, hy, sz + dd, 15);
        put(sx + dd, hy, sz - dd, 15);
      }
      put(sx, sy + 10, sz, 130);
      // palmiers en jardinières
      for (const [dx, dz] of [
        [-4, -2],
        [4, -2],
        [-4, 2],
        [4, 2],
      ]) {
        put(sx + dx, sy, sz + dz, 1);
        palmier(sx + dx, sy, sz + dz, 5);
      }
      put(sx, sy + 1, sz, 13);
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
    GRAINE,
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
    jardinAt,
    CITE,
    dansCite,
    surVoie,
    citeLot,
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
