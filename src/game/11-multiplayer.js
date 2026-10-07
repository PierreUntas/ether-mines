// Ether Mines · Online players, avatars, chat.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- online players, chat ----------
const frozen = new Set(),
  EDC = new Map(); // frozen chunks; known modifications, sorted by chunk
function editSet(x, y, z, id) {
  const k = ckey(cOf(x), cOf(z));
  let m = EDC.get(k);
  if (!m) EDC.set(k, (m = new Map()));
  m.set(coordKey(x, y, z), id);
}
function applyEditsTo(cx, cz) {
  const arr = CHK.get(ckey(cx, cz)),
    m = EDC.get(ckey(cx, cz));
  if (!arr || !m) return;
  for (const [k, id] of m) {
    const [x, y, z] = k.split(',').map(Number);
    if (y >= 0 && y < SY) arr[li(x - cx * CH, y, z - cz * CH)] = id;
  }
}
function refreshVals(cx, cz) {
  for (const k of [...vals.keys()]) {
    const [x, , z] = k.split(',').map(Number);
    if (cOf(x) === cx && cOf(z) === cz) delVal(k);
  }
  const arr = CHK.get(ckey(cx, cz));
  if (!arr) return;
  for (let i = 0; i < CV; i++)
    if (arr[i] === 13 || arr[i] === 74) {
      const lx = i % CH,
        lz = Math.floor(i / CH) % CH,
        y = Math.floor(i / (CH * CH));
      addVal(cx * CH + lx, y, cz * CH + lz);
    }
}
// Freezes a chunk's original terrain on first contact: it will never depend on the generator again.
// Solo mode only: online, it's the server's "freeze" function that generates and records the terrain.
function freeze(cx, cz) {
  const k = ckey(cx, cz);
  if (frozen.has(k) || !CHK.has(k)) return;
  frozen.add(k);
  S.chunks[k] = encodeChunk(cx, cz);
  dirty = true;
}
Net.on('frozen', (cx, cz, row) => {
  const k = ckey(cx, cz);
  frozen.add(k);
  if (!CHK.has(k)) return;
  CHK.set(k, decodeChunk(row.data, row.sy));
  applyEditsTo(cx, cz);
  refreshVals(cx, cz);
  indexChunk(cx, cz);
  if (MESH.has(k)) buildChunk(cx, cz);
});
function commit(k, id, own) {
  const [x, y, z] = k.split(',').map(Number);
  if (REC) REC.push([k, get(x, y, z), OWN.get(k) || null]);
  setW(x, y, z, id);
  editSet(x, y, z, id);
  if (own) OWN.set(k, own);
  else OWN.delete(k);
  if (!SERVER()) {
    freeze(cOf(x), cOf(z));
    S.edits[k] = id;
    if (own) S.placed[k] = own.serial;
    else delete S.placed[k];
  }
  dirty = true;
}
function myBlocks() {
  let n = 0;
  for (const o of OWN.values()) if (o.by === ME.id) n++;
  return n;
}
function applyBlock(b) {
  if (![b.x, b.y, b.z].every(Number.isInteger) || b.y < 0 || b.y >= SY) return;
  const cx = cOf(b.x),
    cz = cOf(b.z),
    k = ckey(cx, cz),
    key = coordKey(b.x, b.y, b.z);
  editSet(b.x, b.y, b.z, b.id);
  if (b.id && b.by) OWN.set(key, { by: b.by, name: b.name, serial: b.serial });
  else OWN.delete(key);
  if (!CHK.has(k)) return; // not loaded here: it will arrive with the save when the chunk loads
  if (!frozen.has(k)) {
    frozen.add(k);
    Net.fetchChunk(cx, cz)
      .then(row => {
        if (row && CHK.has(k)) {
          CHK.set(k, decodeChunk(row.data, row.sy));
          applyEditsTo(cx, cz);
          refreshVals(cx, cz);
          indexChunk(cx, cz);
          rebuildAt(b.x, b.z);
        }
      })
      .catch(e => console.error(e));
  }
  setW(b.x, b.y, b.z, b.id);
  if (b.id === 13 || b.id === 74) addVal(b.x, b.y, b.z);
  else delVal(key);
  rebuildAt(b.x, b.z);
  if (regView) buildRegView();
  if (isSolid(b.id) && collides(P.x, P.y, P.z)) {
    for (let q = 0; q < 4 && collides(P.x, P.y, P.z); q++) P.y += 1;
  }
}
