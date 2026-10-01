// Mines d'Éther · Contrats en blocs : courant électrique.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- contrats en blocs : leviers, plaques, câbles, lampes, portes ----------
// Rien n'est enregistré : chaque client recalcule le courant à partir des blocs et de la position des joueurs.
const SPEC = new Map(),
  isSpecial = id => (id >= 48 && id <= 68) || (id >= 99 && id <= 111); // contrats : portes, leviers, plaques, câbles, lampes, portes logiques, horloge
// ---------- lumières : lanternes, éther pur, lampes ----------
// Index des sources par tronçon ; les plus proches du joueur reçoivent une vraie lumière (voir lumieres()).
const LUM = new Map(),
  LUM_COL = { 14: 0xffc27a, 70: 0x9fd8ff, 68: 0xffe08a, 13: 0xb7a6ff, 75: 0x5fd8ff, 83: 0x7fe8ff, 84: 0xff8fc8, 85: 0x5fb8ff },
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
// ---------- portes logiques ----------
// La sortie est devant (direction du regard à la pose) ; les entrées : côtés gauche et droit, et l'arrière.
const GATE_ON = new Set(),
  DEVANT = [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
  ];
// une case voisine alimente-t-elle la porte en k ? (câble, levier, plaque ou horloge sous tension, ou porte tournée vers elle)
function entree(k, d, nodes, pw) {
  const [x, y, z] = k.split(',').map(Number),
    nk = coordKey(x + d[0], y, z + d[2]),
    nid = nodes.get(nk);
  if (nid === undefined) return false;
  if (B[nid]?.gate) {
    const f = DEVANT[B[nid].o];
    return GATE_ON.has(nk) && f[0] === -d[0] && f[2] === -d[2];
  }
  return pw.has(nk) && (nid === 67 || nid === 65 || nid === 66 || nid === 111);
}
function porteActive(k, id, nodes, pw) {
  const f = DEVANT[B[id].o],
    arriere = [-f[0], 0, -f[2]],
    gauche = [f[2], 0, -f[0]],
    droite = [-f[2], 0, f[0]];
  const g = B[id].gate;
  if (g === 'et') return entree(k, gauche, nodes, pw) && entree(k, droite, nodes, pw);
  if (g === 'ou') return entree(k, gauche, nodes, pw) || entree(k, droite, nodes, pw) || entree(k, arriere, nodes, pw);
  return !entree(k, arriere, nodes, pw); // non
}
// Propage le courant depuis les sources (leviers, plaques pressées, horloges, portes logiques actives) à travers les câbles.
function propager(nodes, feet, horloge) {
  const pw = new Set(),
    q = [];
  const alimenter = (x, y, z) => {
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
    let src = id === 65 || (id === 111 && horloge);
    if (id === 66) src = feet.some(([a, b, c]) => Math.floor(a) === x && Math.floor(c) === z && b >= y - 0.2 && b < y + 0.7);
    if (src) {
      pw.add(k);
      q.push(k);
    } else if (B[id]?.gate && GATE_ON.has(k)) {
      pw.add(k); // allumée (texture)
      const f = DEVANT[B[id].o];
      alimenter(x + f[0], y, z + f[2]);
    }
  }
  for (let n = 0; q.length && n < 5000; n++) {
    const k = q.shift(),
      [x, y, z] = k.split(',').map(Number);
    for (const [a, b, c] of N6) alimenter(x + a, y + b, z + c);
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
  const horloge = Math.floor(performance.now() / 1000) % 2 === 0;
  // Les portes logiques dépendent du courant, qui dépend d'elles : on recalcule jusqu'à stabilité (3 passes au plus ;
  // une boucle qui oscille, comme une porte NON reliée à elle-même, bat alors d'elle-même).
  let pw = propager(nodes, feet, horloge);
  for (let pass = 0; pass < 3; pass++) {
    const on = new Set();
    for (const [k, id] of nodes) if (B[id]?.gate && porteActive(k, id, nodes, pw)) on.add(k);
    let pareil = on.size === [...GATE_ON].filter(k => nodes.has(k)).length;
    if (pareil) for (const k of on) if (!GATE_ON.has(k)) pareil = false;
    for (const k of [...GATE_ON]) if (nodes.has(k)) GATE_ON.delete(k);
    for (const k of on) GATE_ON.add(k);
    if (pareil) break;
    pw = propager(nodes, feet, horloge);
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
