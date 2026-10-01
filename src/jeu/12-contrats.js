// Mines d'Éther · Contrats en blocs : courant électrique.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- contrats en blocs : leviers, plaques, câbles, lampes, portes ----------
// Rien n'est enregistré : chaque client recalcule le courant à partir des blocs et de la position des joueurs.
const SPEC = new Map(),
  isSpecial = id => id >= 48 && id <= 68;
function specSet(x, y, z, id) {
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
  const s = new Set();
  for (let i = 0; i < CV; i++) {
    const v = arr[i];
    if (v >= 48 && v <= 68) s.add(coordKey(cx * CH + (i % CH), Math.floor(i / (CH * CH)), cz * CH + (Math.floor(i / CH) % CH)));
  }
  SPEC.set(ckey(cx, cz), s);
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
