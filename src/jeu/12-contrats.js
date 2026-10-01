// Mines d'Éther · Contrats en blocs : courant électrique.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- contrats en blocs : leviers, plaques, câbles, lampes, portes ----------
// Rien n'est enregistré : chaque client recalcule le courant à partir des blocs et de la position des joueurs.
const SPEC = new Map(),
  isSpecial = id => id >= 48 && id <= 68;
// ---------- lumières : lanternes, éther pur, lampes ----------
// Index des sources par tronçon ; les plus proches du joueur reçoivent une vraie lumière (voir lumieres()).
const LUM = new Map(),
  LUM_COL = { 14: 0xffc27a, 70: 0x9fd8ff, 68: 0xffe08a, 13: 0xb7a6ff },
  isLum = id => id === 14 || id === 70 || id === 68 || id === 13;
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
  LAMPES = [];
for (let i = 0; i < NB_LUM; i++) {
  const l = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
  scene.add(l);
  LAMPES.push(l);
}
let lumT = 0;
function lumieres(dt) {
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
          if (id === 68 && !POWERED.has(k)) continue; // lampe éteinte
          const d = (x + 0.5 - P.x) ** 2 + (y + 0.5 - P.y) ** 2 + (z + 0.5 - P.z) ** 2;
          if (d < 400) near.push([d, x, y, z, id]);
        }
    }
  near.sort((a, b) => a[0] - b[0]);
  // plus visible la nuit ; le jour, un simple halo
  const force = 0.25 + 0.85 * skyU.night.value;
  LAMPES.forEach((l, i) => {
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
    if ((v >= 48 && v <= 68) || isLum(v)) {
      const k = coordKey(cx * CH + (i % CH), Math.floor(i / (CH * CH)), cz * CH + (Math.floor(i / CH) % CH));
      if (v >= 48 && v <= 68) s.add(k);
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
  const pw = new Set(),
    q = [];
  for (const [k, id] of nodes) {
    let src = id === 65;
    if (id === 66) {
      const [x, y, z] = k.split(',').map(Number);
      src = feet.some(([a, b, c]) => Math.floor(a) === x && Math.floor(c) === z && b >= y - 0.2 && b < y + 0.7);
    }
    if (src) {
      pw.add(k);
      q.push(k);
    }
  }
  for (let n = 0; q.length && n < 5000; n++) {
    const k = q.shift(),
      [x, y, z] = k.split(',').map(Number),
      fromCable = nodes.get(k) === 67 || nodes.get(k) === 65 || nodes.get(k) === 66;
    if (!fromCable) continue;
    for (const [a, b, c] of N6) {
      const nk = coordKey(x + a, y + b, z + c);
      if (pw.has(nk)) continue;
      const nid = nodes.get(nk);
      if (nid === undefined) continue;
      if (nid === 67) {
        pw.add(nk);
        q.push(nk);
      } else if (nid === 68) pw.add(nk);
      else if (nid >= 48 && nid <= 63) {
        pw.add(nk);
        pw.add(coordKey(x + a, y + b + (B[nid].top ? -1 : 1), z + c));
      }
    }
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
