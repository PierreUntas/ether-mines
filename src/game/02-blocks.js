// Ether Mines · Blocks, non-cube shapes, access to the loaded world.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- blocks and items: supabase/functions/_shared/rules.js ----------
const TIER_NAME = ['your hand', 'a wooden pickaxe', 'the crystal pickaxe', 'the pure ether pickaxe'];
const MAT_OF = id =>
  id === 72 || id === 73 || id === 74
    ? 'stone'
    : [1, 2, 6, 7, 17, 18, 19, 20, 125].includes(id)
      ? 'grass'
      : id === 4
        ? 'sand'
        : id === 16 || id === 71
          ? 'snow'
          : [5, 9, 33, 36, 37, 38, 39, 82, 92, 94, 95, 96, 97, 98, 124].includes(id) || (id >= 48 && id <= 63)
            ? 'wood'
            : [10, 14, 68].includes(id) || (id >= 29 && id <= 32)
              ? 'glass'
              : 'stone';
const nameOf = id => (B[id] ? B[id].n : ITEM[id] ? ITEM[id].n : 'Unknown item');
const { isCross, isTransp, isSolid, isOpaque, isShaped, STAIR_HI, DOORB } = Mesh; // src/mesh.js
const POWERED = new Set(); // powered blocks (computed, never saved)
const shapeBoxes = (id, key) => Mesh.shapeBoxes(id, key, k => POWERED.has(k), get);
function collBoxes(id, key) {
  if (!isSolid(id)) return [];
  return isShaped(id) ? shapeBoxes(id, key) : [[0, 0, 0, 1, 1, 1]];
}

// ---------- world by chunks (shared generator: supabase/functions/_shared/world.js) ----------
const CHK = new Map(); // "cx,cz" -> Uint8Array of the chunk's blocks
function get(x, y, z) {
  if (y < 0 || y >= SY) return 0;
  const cx = cOf(x),
    cz = cOf(z),
    c = CHK.get(cx + ',' + cz);
  return c ? c[li(x - cx * CH, y, z - cz * CH)] : 0;
}
function setW(x, y, z, id) {
  if (y < 0 || y >= SY) return;
  const cx = cOf(x),
    cz = cOf(z),
    c = CHK.get(cx + ',' + cz);
  if (c) {
    c[li(x - cx * CH, y, z - cz * CH)] = id;
    specSet(x, y, z, id);
  }
}
const loaded = (x, z) => CHK.has(cOf(x) + ',' + cOf(z));
