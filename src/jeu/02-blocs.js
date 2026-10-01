// Mines d'Éther · Blocs, formes non cubiques, accès au monde chargé.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- blocs et objets : supabase/functions/_shared/rules.js ----------
const TIER_NAME = ['la main', 'une pioche en bois', 'la pioche de cristal', "la pioche d'éther pur"];
const MAT_OF = id =>
  id === 72 || id === 73 || id === 74
    ? 'pierre'
    : [1, 2, 6, 7, 17, 18, 19, 20].includes(id)
      ? 'herbe'
      : id === 4
        ? 'sable'
        : id === 16 || id === 71
          ? 'neige'
          : [5, 9, 33, 36, 37, 38, 39].includes(id) || (id >= 48 && id <= 63)
            ? 'bois'
            : [10, 14, 68].includes(id) || (id >= 29 && id <= 32)
              ? 'verre'
              : 'pierre';
const nameOf = id => (B[id] ? B[id].n : ITEM[id] ? ITEM[id].n : 'Objet inconnu');
const isCross = id => B[id] && B[id].x != null;
const isTransp = id => id === 0 || id === 11 || isCross(id) || !B[id] || !!(B[id].leaf || B[id].glass || B[id].shape);
const isSolid = id => !!(id && id !== 11 && B[id] && !isCross(id) && !B[id].pass);
const isOpaque = id => id && !isTransp(id);

// ---------- formes non cubiques (dalles, escaliers, portes, contrats) ----------
const isShaped = id => !!(B[id] && B[id].shape);
const STAIR_HI = [
  [0, 0.5, 0, 1, 1, 0.5],
  [0, 0.5, 0, 0.5, 1, 1],
  [0, 0.5, 0.5, 1, 1, 1],
  [0.5, 0.5, 0, 1, 1, 1],
]; // partie haute côté du regard : 0 → -z, 1 → -x, 2 → +z, 3 → +x
const DOORB = [
  [0, 0, 0, 1, 1, 0.1875],
  [0, 0, 0, 0.1875, 1, 1],
  [0, 0, 0.8125, 1, 1, 1],
  [0.8125, 0, 0, 1, 1, 1],
];
const POWERED = new Set(); // blocs alimentés (calculés, jamais enregistrés)
const doorOpen = (id, key) => !!(B[id].open || POWERED.has(key));
function shapeBoxes(id, key) {
  const b = B[id];
  switch (b.shape) {
    case 'slab':
      return [[0, 0, 0, 1, 0.5, 1]];
    case 'stairs':
      return [[0, 0, 0, 1, 0.5, 1], STAIR_HI[b.o]];
    case 'door':
      return [DOORB[doorOpen(id, key) ? (b.f + 1) % 4 : b.f]];
    case 'plate':
      return [[0.06, 0, 0.06, 0.94, POWERED.has(key) ? 0.03 : 0.06, 0.94]];
    case 'cable':
      return [[0, 0, 0, 1, 0.03, 1]];
    case 'lever':
      return [[0.3, 0, 0.3, 0.7, 0.12, 0.7], b.on ? [0.54, 0.1, 0.46, 0.62, 0.58, 0.54] : [0.38, 0.1, 0.46, 0.46, 0.58, 0.54]];
    default:
      return [[0, 0, 0, 1, 1, 1]];
  }
}
function collBoxes(id, key) {
  if (!isSolid(id)) return [];
  return isShaped(id) ? shapeBoxes(id, key) : [[0, 0, 0, 1, 1, 1]];
}

// ---------- monde par tronçons (générateur partagé : supabase/functions/_shared/world.js) ----------
const CHK = new Map(); // "cx,cz" -> Uint8Array des blocs du tronçon
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
