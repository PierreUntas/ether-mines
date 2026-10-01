// Mines d'Éther · Chargement et déchargement des tronçons autour du joueur.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- chargement des tronçons autour du joueur ----------
let VR = REG.vue; // distance de vue, en tronçons (réglable)
const pending = new Set(),
  meshQ = new Set();
let loading = false,
  streamT = 0;
function wanted() {
  const pcx = cOf(P.x),
    pcz = cOf(P.z),
    out = [];
  for (let dz = -VR; dz <= VR; dz++)
    for (let dx = -VR; dx <= VR; dx++) {
      if (dx * dx + dz * dz > VR * VR + 1) continue;
      const cx = pcx + dx,
        cz = pcz + dz;
      if (!inWorld(cx * CH, cz * CH)) continue;
      out.push([cx, cz, dx * dx + dz * dz]);
    }
  return out.sort((a, b) => a[2] - b[2]);
}
async function loadChunks(list) {
  list = list.filter(([cx, cz]) => !CHK.has(ckey(cx, cz)) && !pending.has(ckey(cx, cz)));
  if (!list.length) return;
  for (const [cx, cz] of list) pending.add(ckey(cx, cz));
  let rows = [],
    edits = [];
  try {
    if (Net.online) {
      const xs = list.map(c => c[0]),
        zs = list.map(c => c[1]);
      ({ chunks: rows, edits } = await Net.loadArea(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)));
    } else {
      const want = new Set(list.map(([cx, cz]) => ckey(cx, cz)));
      for (const k of want)
        if (S.chunks[k]) {
          const [cx, cz] = k.split(',').map(Number);
          rows.push({ cx, cz, sy: SY, data: S.chunks[k] });
        }
      for (const k in S.edits) {
        const [x, y, z] = k.split(',').map(Number);
        if (!want.has(ckey(cOf(x), cOf(z)))) continue;
        const ser = S.placed[k];
        edits.push({ x, y, z, id: S.edits[k], placed_by: ser ? ME.id : null, placed_name: ser ? ME.name : null, serial: ser || null });
      }
    }
  } finally {
    for (const [cx, cz] of list) pending.delete(ckey(cx, cz));
  }
  for (const e of edits) {
    editSet(e.x, e.y, e.z, e.id);
    const key = coordKey(e.x, e.y, e.z);
    if (e.id && e.placed_by) OWN.set(key, { by: e.placed_by, name: e.placed_name, serial: e.serial });
    else OWN.delete(key);
  }
  const byKey = new Map(rows.map(r => [ckey(r.cx, r.cz), r]));
  for (const [cx, cz] of list) {
    const k = ckey(cx, cz);
    if (CHK.has(k)) continue;
    const row = byKey.get(k);
    CHK.set(k, row ? decodeChunk(row.data, row.sy) : genChunk(cx, cz));
    if (row) frozen.add(k);
    const m = EDC.get(k);
    if (!row && m && m.size) freeze(cx, cz); // modifié sans terrain figé : on fige le terrain actuel
    applyEditsTo(cx, cz);
    refreshVals(cx, cz);
    indexChunk(cx, cz);
    meshQ.add(k);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = ckey(cx + dx, cz + dz);
      if (MESH.has(n)) meshQ.add(n);
    }
  }
}
function unloadFar() {
  const pcx = cOf(P.x),
    pcz = cOf(P.z),
    lim = (VR + 2) * (VR + 2);
  for (const k of [...CHK.keys()]) {
    const [cx, cz] = k.split(',').map(Number);
    if ((cx - pcx) ** 2 + (cz - pcz) ** 2 <= lim) continue;
    dropMesh(k);
    CHK.delete(k);
    SPEC.delete(k);
    LUM.delete(k);
    meshQ.delete(k);
    for (const v of [...vals.keys()]) {
      const [x, , z] = v.split(',').map(Number);
      if (cOf(x) === cx && cOf(z) === cz) delVal(v);
    }
  }
}
function stream(dt) {
  streamT -= dt;
  if (streamT <= 0) {
    streamT = 0.35;
    updatePosHud();
    if (!loading) {
      const miss = wanted()
        .filter(([cx, cz]) => !CHK.has(ckey(cx, cz)) && !pending.has(ckey(cx, cz)))
        .slice(0, 12);
      if (miss.length) {
        loading = true;
        loadChunks(miss)
          .catch(e => console.error(e))
          .finally(() => (loading = false));
      }
    }
    unloadFar();
  }
  let n = 0;
  // sur place : 2 tronçons par image au plus ; en arrière-plan : tant que le travailleur a de la place
  for (const k of meshQ) {
    if (!maillageLibre()) break;
    meshQ.delete(k);
    const [cx, cz] = k.split(',').map(Number);
    if (CHK.has(k)) buildChunk(cx, cz);
    if (!mailleur && ++n >= 2) break;
  }
}
appliquerReglages('vue'); // brouillard accordé à la distance de vue
