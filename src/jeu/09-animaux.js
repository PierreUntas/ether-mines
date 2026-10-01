// Mines d'Éther · Animaux : placement, déplacements, caresses.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- animaux ----------
// Placés par tronçon à partir de la graine, et déplacés en fonction de l'heure réelle :
// tous les joueurs voient les mêmes animaux au même endroit, sans rien envoyer sur le réseau.
const ANIMALS = new Map(),
  ANI_R = 3; // rayon, en tronçons, autour du joueur
const AK = {
  mouton: { n: "Mouton d'éther", D: 9, walk: 0.42, R: 6, sp: 1, hit: [0.9, 1.1, 1.25], gift: [71, 1, 'laine offerte par un mouton'] },
  lapin: { n: 'Lapin des dunes', D: 5, walk: 0.38, R: 5, sp: 1, hit: [0.45, 0.55, 0.55] },
  renard: { n: 'Renard rose', D: 6.5, walk: 0.5, R: 8, sp: 1, hit: [0.55, 0.75, 1], gift: 'fleur' },
  poisson: { n: 'Poisson prisme', D: 6, walk: 0.85, R: 5, sp: 1, hit: [0.3, 0.35, 0.55] },
  meduse: {
    n: 'Méduse céleste',
    D: 12,
    walk: 1,
    R: 6,
    sp: 1,
    hit: [0.8, 1.2, 0.8],
    gift: [101, 1, 'cristal laissé par une méduse céleste'],
  },
  // inspirés des illustrations d'ethereum.org (pas de cadeau : rien à arbitrer côté serveur)
  chat: { n: 'Chat', D: 7, walk: 0.42, R: 6, sp: 1, hit: [0.4, 0.6, 0.75] },
  shiba: { n: "Shiba de l'espace", D: 6, walk: 0.55, R: 9, sp: 1, hit: [0.6, 1.05, 0.9] },
  robot: { n: 'Robot validateur', D: 11, walk: 0.32, R: 6, sp: 1, hit: [0.8, 1.9, 0.7] },
};
const aniMat = {};
const AM = (c, basic, op) => {
  const k = c + (basic ? 'b' : '') + (op || '');
  return (
    aniMat[k] ||
    (aniMat[k] = basic
      ? new THREE.MeshBasicMaterial({ color: c, transparent: !!op, opacity: op || 1, depthWrite: !op })
      : new THREE.MeshLambertMaterial({ color: c }))
  );
};
const aniGeo = {};
const AG = (w, h, d) => {
  const k = w + ',' + h + ',' + d;
  return aniGeo[k] || (aniGeo[k] = new THREE.BoxGeometry(w, h, d));
};
function abox(par, w, h, d, c, x, y, z, basic, op) {
  const m = new THREE.Mesh(AG(w, h, d), AM(c, basic, op));
  m.position.set(x, y, z);
  m.castShadow = !basic && !touch;
  par.add(m);
  return m;
}
function pivot(par, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  par.add(g);
  return g;
}
function buildAnimal(a) {
  const g = new THREE.Group(),
    r = a.r,
    parts = { legs: [] };
  if (a.type === 'mouton') {
    const wool = ['#e6ddff', '#f4f1ff', '#d6cbff', '#ffe1f0'][Math.floor(r * 4)],
      skin = '#4a3d7a';
    abox(g, 0.86, 0.62, 1.1, wool, 0, 0.78, 0);
    abox(g, 0.9, 0.2, 0.9, wool, 0, 1.1, 0);
    const hd = (parts.head = pivot(g, 0, 0.95, 0.55));
    abox(hd, 0.42, 0.42, 0.42, skin, 0, 0, 0.2);
    abox(hd, 0.5, 0.2, 0.3, wool, 0, 0.22, 0.12);
    abox(hd, 0.08, 0.08, 0.02, '#ffffff', -0.12, 0.04, 0.415, true);
    abox(hd, 0.08, 0.08, 0.02, '#ffffff', 0.12, 0.04, 0.415, true);
    for (const [x, z] of [
      [-0.25, 0.35],
      [0.25, 0.35],
      [-0.25, -0.35],
      [0.25, -0.35],
    ]) {
      const l = pivot(g, x, 0.48, z);
      abox(l, 0.18, 0.48, 0.18, skin, 0, -0.24, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'lapin') {
    const fur = ['#f3e6d4', '#e8d8ff', '#d9c3a8'][Math.floor(r * 3)];
    abox(g, 0.34, 0.3, 0.46, fur, 0, 0.25, 0);
    const hd = (parts.head = pivot(g, 0, 0.42, 0.22));
    abox(hd, 0.28, 0.26, 0.26, fur, 0, 0, 0.06);
    abox(hd, 0.07, 0.26, 0.05, fur, -0.07, 0.24, 0);
    abox(hd, 0.07, 0.26, 0.05, fur, 0.07, 0.24, 0);
    abox(hd, 0.04, 0.18, 0.02, '#ffb8d9', -0.07, 0.24, 0.03, true);
    abox(hd, 0.04, 0.18, 0.02, '#ffb8d9', 0.07, 0.24, 0.03, true);
    abox(hd, 0.05, 0.05, 0.02, '#1c163a', -0.08, 0.03, 0.2, true);
    abox(hd, 0.05, 0.05, 0.02, '#1c163a', 0.08, 0.03, 0.2, true);
    abox(g, 0.14, 0.14, 0.12, '#ffffff', 0, 0.3, -0.26);
    for (const [x, z] of [
      [-0.1, 0.14],
      [0.1, 0.14],
      [-0.12, -0.14],
      [0.12, -0.14],
    ]) {
      const l = pivot(g, x, 0.12, z);
      abox(l, 0.09, 0.12, 0.14, fur, 0, -0.06, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'renard') {
    const fur = r < 0.5 ? '#ff9a6b' : '#ff8fb4',
      dark = '#3b2c55';
    abox(g, 0.38, 0.34, 0.8, fur, 0, 0.55, 0);
    const hd = (parts.head = pivot(g, 0, 0.66, 0.42));
    abox(hd, 0.36, 0.32, 0.3, fur, 0, 0, 0.08);
    abox(hd, 0.18, 0.14, 0.18, '#fff3ea', 0, -0.07, 0.3);
    abox(hd, 0.06, 0.06, 0.04, dark, 0, -0.03, 0.4, true);
    abox(hd, 0.1, 0.14, 0.06, fur, -0.12, 0.22, 0.02);
    abox(hd, 0.1, 0.14, 0.06, fur, 0.12, 0.22, 0.02);
    abox(hd, 0.05, 0.05, 0.02, dark, -0.09, 0.05, 0.235, true);
    abox(hd, 0.05, 0.05, 0.02, dark, 0.09, 0.05, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.6, -0.4));
    abox(tl, 0.2, 0.2, 0.46, fur, 0, 0, -0.22);
    abox(tl, 0.21, 0.21, 0.14, '#fff3ea', 0, 0, -0.46);
    for (const [x, z] of [
      [-0.12, 0.28],
      [0.12, 0.28],
      [-0.12, -0.28],
      [0.12, -0.28],
    ]) {
      const l = pivot(g, x, 0.38, z);
      abox(l, 0.12, 0.38, 0.12, dark, 0, -0.19, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'poisson') {
    const c = ['#7fe8ff', '#ffb8d9', '#ffd95e', '#b6a4ff'][Math.floor(r * 4)];
    abox(g, 0.14, 0.24, 0.4, c, 0, 0, 0, true);
    abox(g, 0.02, 0.08, 0.12, '#ffffff', 0, 0.14, 0, true);
    const tl = (parts.tail = pivot(g, 0, 0, -0.2));
    abox(tl, 0.04, 0.22, 0.16, c, 0, 0, -0.08, true);
    abox(g, 0.15, 0.05, 0.05, '#1c163a', 0, 0.04, 0.14, true);
  } else if (a.type === 'chat') {
    const [fur, ventre] = [
      ['#f4a36b', '#ffe8d6'],
      ['#a9adcf', '#eef0ff'],
      ['#f3e6d4', '#ffffff'],
      ['#5b4f8c', '#c9b8ff'],
    ][Math.floor(r * 4)];
    abox(g, 0.3, 0.26, 0.62, fur, 0, 0.36, 0);
    abox(g, 0.24, 0.06, 0.4, ventre, 0, 0.23, 0.02);
    const hd = (parts.head = pivot(g, 0, 0.5, 0.3));
    abox(hd, 0.3, 0.26, 0.26, fur, 0, 0, 0.06);
    abox(hd, 0.18, 0.1, 0.06, ventre, 0, -0.06, 0.2);
    abox(hd, 0.08, 0.1, 0.06, fur, -0.09, 0.17, 0.02);
    abox(hd, 0.08, 0.1, 0.06, fur, 0.09, 0.17, 0.02);
    abox(hd, 0.05, 0.05, 0.02, '#2b8a6e', -0.07, 0.03, 0.195, true);
    abox(hd, 0.05, 0.05, 0.02, '#2b8a6e', 0.07, 0.03, 0.195, true);
    abox(hd, 0.04, 0.03, 0.02, '#ff8fb4', 0, -0.03, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.45, -0.3));
    abox(tl, 0.07, 0.07, 0.42, fur, 0, 0.12, -0.16).rotation.x = -0.9;
    for (const [x, z] of [
      [-0.09, 0.2],
      [0.09, 0.2],
      [-0.09, -0.2],
      [0.09, -0.2],
    ]) {
      const l = pivot(g, x, 0.24, z);
      abox(l, 0.08, 0.24, 0.08, fur, 0, -0.12, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'shiba') {
    // le Shiba des illustrations : combinaison spatiale lavande, tête rousse, museau blanc, truffe bleue
    const suit = '#c9b8ff',
      suit2 = '#9a8cf5',
      fur = '#f4b183',
      creme = '#fff4ea';
    abox(g, 0.42, 0.4, 0.78, suit, 0, 0.6, 0);
    abox(g, 0.3, 0.26, 0.2, '#b3dcff', 0, 0.86, -0.22); // sac à dos
    abox(g, 0.44, 0.08, 0.3, suit2, 0, 0.82, 0.24); // col du scaphandre
    const hd = (parts.head = pivot(g, 0, 0.9, 0.42));
    abox(hd, 0.4, 0.36, 0.34, fur, 0, 0.04, 0.06);
    abox(hd, 0.26, 0.16, 0.2, creme, 0, -0.05, 0.26);
    abox(hd, 0.08, 0.06, 0.04, '#5b7fff', 0, 0.02, 0.37, true); // truffe bleue
    abox(hd, 0.1, 0.05, 0.02, '#7fa8ff', 0, -0.1, 0.36, true); // langue
    abox(hd, 0.11, 0.16, 0.08, fur, -0.12, 0.28, 0.02);
    abox(hd, 0.11, 0.16, 0.08, fur, 0.12, 0.28, 0.02);
    abox(hd, 0.08, 0.025, 0.02, '#3b2c55', -0.09, 0.1, 0.235, true); // yeux rieurs
    abox(hd, 0.08, 0.025, 0.02, '#3b2c55', 0.09, 0.1, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.82, -0.4));
    abox(tl, 0.16, 0.16, 0.24, fur, 0, 0.08, -0.06);
    for (const [x, z] of [
      [-0.13, 0.26],
      [0.13, 0.26],
      [-0.13, -0.26],
      [0.13, -0.26],
    ]) {
      const l = pivot(g, x, 0.4, z);
      abox(l, 0.14, 0.4, 0.14, suit2, 0, -0.2, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'robot') {
    // robot des illustrations : grand corps rond bleu, articulations menthe, chapeau pointu lavande, yeux orange
    const bleu = '#6f88e8',
      menthe = '#a6f4ee',
      lav = '#c9a8ff';
    abox(g, 0.72, 0.62, 0.5, bleu, 0, 1.12, 0);
    abox(g, 0.5, 0.42, 0.06, '#5b6fd6', 0, 1.12, 0.26);
    abox(g, 0.2, 0.14, 0.04, menthe, 0.12, 1.0, 0.3, true);
    abox(g, 0.86, 0.1, 0.2, lav, 0, 1.44, 0);
    const hd = (parts.head = pivot(g, 0, 1.52, 0));
    abox(hd, 0.32, 0.22, 0.28, menthe, 0, 0.1, 0);
    abox(hd, 0.09, 0.09, 0.04, '#ffb36b', -0.08, 0.12, 0.15, true);
    abox(hd, 0.09, 0.09, 0.04, '#ffb36b', 0.08, 0.12, 0.15, true);
    const ch1 = abox(hd, 0.44, 0.06, 0.4, lav, -0.11, 0.33, 0);
    ch1.rotation.z = 0.75;
    const ch2 = abox(hd, 0.44, 0.06, 0.4, lav, 0.11, 0.33, 0);
    ch2.rotation.z = -0.75;
    for (const x of [-0.44, 0.44]) {
      const bras = pivot(g, x, 1.3, 0);
      abox(bras, 0.14, 0.5, 0.14, menthe, 0, -0.25, 0);
      abox(bras, 0.16, 0.14, 0.16, bleu, 0, -0.52, 0);
    }
    for (const x of [-0.16, 0.16]) {
      const l = pivot(g, x, 0.82, 0);
      abox(l, 0.16, 0.5, 0.16, menthe, 0, -0.25, 0);
      abox(l, 0.2, 0.3, 0.22, bleu, 0, -0.6, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'meduse') {
    const c = r < 0.5 ? '#b6a4ff' : '#7fe8ff';
    abox(g, 0.7, 0.42, 0.7, c, 0, 0.55, 0, true, 0.55);
    abox(g, 0.46, 0.2, 0.46, '#ffffff', 0, 0.58, 0, true, 0.5);
    abox(g, 0.74, 0.06, 0.74, c, 0, 0.34, 0, true, 0.8);
    parts.tent = [];
    for (let i = 0; i < 4; i++) {
      const an = (i / 4) * Math.PI * 2 + 0.4,
        t = pivot(g, Math.cos(an) * 0.2, 0.32, Math.sin(an) * 0.2);
      abox(t, 0.05, 0.6, 0.05, c, 0, -0.3, 0, true, 0.7);
      parts.tent.push(t);
    }
  }
  a.g = g;
  a.parts = parts;
  g.position.set(a.hx, a.hy, a.hz);
  scene.add(g);
}
// sol sous (x, z) : premier bloc plein en descendant depuis ref+4 (troncs et feuillages exclus au premier placement)
function groundAt(x, z, ref, noTree, up = 4) {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  for (let y = Math.min(SY - 1, Math.floor(ref) + up); y >= Math.max(0, Math.floor(ref) - 8); y--) {
    const id = get(xi, y, zi);
    if (id === 11) return { y: y + 1, water: true };
    if (noTree && (id === 5 || id === 7)) return null;
    if (isSolid(id)) return { y: y + 1, water: false };
  }
  return null;
}
function topSolid(x, z) {
  for (let y = SY - 1; y > 0; y--) {
    const id = get(x, y, z);
    if (!id || isCross(id)) continue;
    return { id, y };
  }
  return null;
}
function spawnChunk(cx, cz) {
  const k = ckey(cx, cz);
  if (ANIMALS.has(k)) return;
  const list = [];
  ANIMALS.set(k, list);
  const r = hash(cx * 7 + 1, cz * 13 + 2, 61),
    x0 = cx * CH,
    z0 = cz * CH,
    near = Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
  const add = (type, n, rad) => {
    for (let i = 0; i < n; i++) {
      const hx = x0 + 2 + Math.floor(hash(cx + i * 31, cz, 62 + i) * 12),
        hz = z0 + 2 + Math.floor(hash(cx, cz + i * 17, 70 + i) * 12);
      const a = {
        type,
        k,
        i,
        hx: hx + 0.5,
        hz: hz + 0.5,
        r: hash(cx * 3 + i, cz * 5, 80),
        ph: hash(cx + i, cz - i, 81) * 60,
        seed: ((cx * 73856093) ^ (cz * 19349663) ^ (i * 83492791)) | 0,
      };
      if (type === 'meduse') {
        const t = islandTop(hx, hz);
        if (t < 0) continue;
        a.hy = t + 3;
      } else if (type === 'poisson') {
        const s = topSolid(hx, hz);
        if (!s || s.id !== 11) continue;
        let b = s.y;
        while (b > 0 && get(hx, b - 1, hz) === 11) b--;
        if (s.y - b < 2) continue;
        a.hy = s.y;
        a.bot = b;
      } else {
        const h0 = heightAt(hx, hz);
        let s = null;
        for (let y = Math.min(SY - 1, h0 + 5); y >= h0 - 3; y--) {
          const id = get(hx, y, hz);
          if (id === 5 || id === 7 || !id || isCross(id)) continue;
          s = { id, y };
          break;
        } // sol naturel, pas les îles ni les toits
        if (!s || s.id === 11 || !isSolid(s.id) || (get(hx, s.y + 1, hz) && !isCross(get(hx, s.y + 1, hz)))) continue;
        a.hy = s.y + 1;
      }
      a.y = a.hy;
      buildAnimal(a);
      list.push(a);
    }
  };
  // îles flottantes : méduses célestes
  const r2 = hash(cx * 5 - 3, cz * 11 + 7, 65);
  for (let t = 0; t < 3; t++) {
    const x = x0 + 4 + t * 4,
      z = z0 + 8;
    if (islandTop(x, z) > 0) {
      if (r2 < 0.18) add('meduse', 1);
      break;
    }
  }
  const hc = heightAt(x0 + 8, z0 + 8);
  if (hc < SEA) {
    if (r < 0.25) add('poisson', 2 + Math.floor(hash(cx, cz, 66) * 3));
    return;
  }
  // au sanctuaire : un robot validateur et le Shiba de l'espace
  if (cx === 0 && cz === 0) {
    add('robot', 1);
    add('shiba', 1);
    return;
  }
  const bi = biome(x0 + 8, z0 + 8);
  const r3 = hash(cx * 11 - 5, cz * 3 + 9, 67);
  if (r3 < 0.05) add('chat', 1 + (r3 < 0.02 ? 1 : 0));
  else if (r3 < 0.07) add(bi === 'dunes' ? 'shiba' : 'chat', 1);
  else if (r3 < 0.08) add('robot', 1);
  if (bi === 'plaine') {
    if (r < 0.16 || (near && r < 0.5)) add('mouton', 2 + Math.floor(hash(cx, cz, 63) * 2));
    else if (r < 0.24) add('lapin', 1 + (r < 0.2 ? 1 : 0));
  } else if (bi === 'foret') {
    if (r < 0.1) add('renard', 1);
    else if (r < 0.18) add('lapin', 1);
    else if (near && r < 0.45) add('mouton', 2);
  } else {
    if (r < 0.14) add('lapin', 1 + Math.floor(hash(cx, cz, 64) * 2));
  }
}
function despawnChunk(k) {
  const l = ANIMALS.get(k);
  if (!l) return;
  for (const a of l) scene.remove(a.g);
  ANIMALS.delete(k);
}
// point de passage n°k : autour du foyer, sur un sol accessible (sinon le foyer)
function waypoint(a, k) {
  const K = AK[a.type],
    an = hash(a.seed, k, 90) * Math.PI * 2,
    rr = Math.sqrt(hash(a.seed, k, 91)) * K.R;
  let x = a.hx + Math.cos(an) * rr,
    z = a.hz + Math.sin(an) * rr;
  if (a.type === 'poisson') {
    const ok = get(Math.floor(x), a.hy - 1, Math.floor(z)) === 11 && get(Math.floor(x), a.bot, Math.floor(z)) === 11;
    if (!ok) {
      x = a.hx;
      z = a.hz;
    }
    return { x, z, y: ok ? a.bot + 0.35 + hash(a.seed, k, 92) * (a.hy - a.bot - 1) : a.hy - 0.8 };
  }
  if (a.type === 'meduse') return { x, z, y: a.hy + hash(a.seed, k, 92) * 3 };
  const gr = groundAt(x, z, a.hy, true, 3);
  if (
    !gr ||
    gr.water ||
    Math.abs(gr.y - a.hy) > 2 ||
    (get(Math.floor(x), gr.y, Math.floor(z)) && !isCross(get(Math.floor(x), gr.y, Math.floor(z))))
  ) {
    x = a.hx;
    z = a.hz;
  }
  return { x, z };
}
let aniT = 0,
  aniSound = 8;
function updateAnimals(dt) {
  if (!REG.animaux) {
    for (const k of [...ANIMALS.keys()]) despawnChunk(k);
    return;
  }
  aniT -= dt;
  if (aniT <= 0) {
    aniT = 1;
    const pcx = cOf(P.x),
      pcz = cOf(P.z),
      want = new Set();
    for (let dz = -ANI_R; dz <= ANI_R; dz++)
      for (let dx = -ANI_R; dx <= ANI_R; dx++) {
        const k = ckey(pcx + dx, pcz + dz);
        if (CHK.has(k) && MESH.has(k)) {
          want.add(k);
          spawnChunk(pcx + dx, pcz + dz);
        }
      }
    for (const k of [...ANIMALS.keys()]) if (!want.has(k)) despawnChunk(k);
  }
  const T = Date.now() / 1000;
  let near = null,
    nd = 18;
  for (const l of ANIMALS.values())
    for (const a of l) {
      const K = AK[a.type],
        tt = T + a.ph,
        k = Math.floor(tt / K.D),
        f = tt / K.D - k;
      if (a.wk !== k) {
        a.wk = k;
        a.from = waypoint(a, k - 1);
        a.to = waypoint(a, k);
      }
      let s = clamp(f / K.walk, 0, 1);
      const moving = s < 1 && Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z) > 0.3;
      s = s * s * (3 - 2 * s);
      const x = lerp(a.from.x, a.to.x, s),
        z = lerp(a.from.z, a.to.z, s),
        g = a.g,
        p = a.parts;
      g.position.x = x;
      g.position.z = z;
      if (moving) {
        const h = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
        let dr = h - g.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        g.rotation.y += dr * Math.min(1, dt * 6);
      }
      a.walk = (a.walk || 0) + dt * (moving ? 9 : 0);
      const sw = moving ? Math.sin(a.walk) : 0;
      if (a.type === 'poisson') {
        g.position.y = lerp(a.from.y, a.to.y, s) + Math.sin(T * 2 + a.ph) * 0.06;
        p.tail.rotation.y = Math.sin(T * (moving ? 14 : 5) + a.ph) * 0.5;
      } else if (a.type === 'meduse') {
        g.position.y = lerp(a.from.y, a.to.y, s) + Math.sin(T * 0.9 + a.ph) * 0.35;
        const pu = Math.sin(T * 2 + a.ph);
        g.scale.set(1 + pu * 0.05, 1 - pu * 0.06, 1 + pu * 0.05);
        p.tent.forEach((t, i) => {
          t.rotation.x = Math.sin(T * 1.7 + i) * 0.3;
          t.rotation.z = Math.cos(T * 1.3 + i) * 0.3;
        });
        g.rotation.y += dt * 0.2;
      } else {
        const gr = groundAt(x, z, a.y + 0.1, false, 1);
        if (gr && !gr.water) a.y += (gr.y - a.y) * Math.min(1, dt * 10);
        let hop = 0;
        if (a.type === 'lapin' && moving) hop = Math.abs(Math.sin(a.walk * 0.8)) * 0.35;
        g.position.y = a.y + hop;
        p.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -1 : 1) * (i < 2 ? 1 : -1) * sw * 0.6));
        if (p.head) {
          const graze = a.type === 'mouton' && !moving && Math.sin(tt * 0.7) > 0.2;
          p.head.rotation.x += ((graze ? 0.7 : Math.sin(tt * 0.9) * 0.08) - p.head.rotation.x) * Math.min(1, dt * 4);
          p.head.rotation.y = moving ? 0 : Math.sin(tt * 0.5 + a.ph) * 0.35;
        }
        if (p.tail) p.tail.rotation.y = Math.sin(T * 3 + a.ph) * 0.25;
      }
      const d = Math.hypot(x - P.x, z - P.z);
      if (d < nd) {
        nd = d;
        near = a;
      }
      if (a.pet > 0) {
        a.pet -= dt;
        g.rotation.z = Math.sin(a.pet * 20) * 0.08 * a.pet;
      }
    }
  aniSound -= dt;
  if (aniSound <= 0) {
    aniSound = 7 + Math.random() * 12;
    if (near && near.type !== 'poisson') Sound.animal(near.type, 1 - nd / 18);
  }
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.t += dt;
    h.s.position.y += dt * 0.9;
    h.s.position.x += Math.sin(h.t * 6 + i) * 0.004;
    h.s.material.opacity = 1 - h.t / 1.4;
    if (h.t > 1.4) {
      scene.remove(h.s);
      h.s.material.dispose();
      hearts.splice(i, 1);
    }
  }
}
// visée : l'animal sous le viseur (ou sous le doigt) s'il est plus proche que le bloc visé
const aniRay = new THREE.Ray(),
  aniBox = new THREE.Box3(),
  aniV = new THREE.Vector3();
function aimRay(at) {
  aniRay.origin.copy(camera.position);
  if (at) aniRay.direction.set(at.x, at.y, 0.5).unproject(camera).sub(camera.position).normalize();
  else aniRay.direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return aniRay;
}
function pickAnimal(at, blk) {
  const ray = aimRay(at);
  let best = null,
    bd = 5.2;
  for (const l of ANIMALS.values())
    for (const a of l) {
      const [w, h, d] = AK[a.type].hit,
        p = a.g.position,
        m = Math.max(w, d) / 2;
      aniBox.min.set(p.x - m, p.y, p.z - m);
      aniBox.max.set(p.x + m, p.y + h, p.z + m);
      if (a.type === 'poisson') {
        aniBox.min.y -= 0.2;
        aniBox.max.y -= 0.2;
      }
      if (ray.intersectBox(aniBox, aniV)) {
        const dd = aniV.distanceTo(ray.origin);
        if (dd < bd) {
          bd = dd;
          best = a;
        }
      }
    }
  if (!best) return null;
  if (blk) {
    aniBox.min.set(blk.x, blk.y, blk.z);
    aniBox.max.set(blk.x + 1, blk.y + 1, blk.z + 1);
    if (ray.intersectBox(aniBox, aniV) && aniV.distanceTo(ray.origin) < bd) return null;
  }
  return best;
}
const heartTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const x = c.getContext('2d');
  x.fillStyle = '#ff7fb0';
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'].forEach((r, y) =>
    [...r].forEach((ch, i) => {
      if (ch === '#') x.fillRect(i + 1, y + 2, 1, 1);
    }),
  );
  x.fillStyle = '#ffd1e4';
  x.fillRect(2, 3, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
})();
const hearts = [];
function petAnimal(a) {
  const K = AK[a.type],
    p = a.g.position;
  a.pet = 0.6;
  Sound.animal(a.type, 1);
  for (let i = 0; i < (a.type === 'meduse' ? 5 : 3); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.32);
    s.position.set(p.x + (Math.random() - 0.5) * 0.6, p.y + K.hit[1] + 0.1 + i * 0.15, p.z + (Math.random() - 0.5) * 0.6);
    scene.add(s);
    hearts.push({ s, t: -i * 0.12 });
  }
  const key = a.k + ':' + a.i,
    today = new Date().toISOString().slice(0, 10);
  S.pets = S.pets || {};
  if (K.gift && S.pets[key] !== today && SERVER()) {
    S.pets[key] = today;
    serverAct('gift', { animal: key, kind: a.type }, null, K.gift === 'fleur' ? 'cueillie par un renard rose' : K.gift[2]).then(r => {
      if (r) Sound.chime();
    });
    return;
  }
  if (K.gift && S.pets[key] !== today) {
    S.pets[key] = today;
    if (K.gift === 'fleur') give(17 + Math.floor(Math.random() * 3), 1, 'cueillie par un renard rose');
    else give(K.gift[0], K.gift[1], K.gift[2]);
    Sound.chime();
  }
}
