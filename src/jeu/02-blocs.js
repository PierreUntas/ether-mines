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
const { isCross, isTransp, isSolid, isOpaque, isShaped, STAIR_HI, DOORB } = Maillage; // src/maillage.js
const POWERED = new Set(); // blocs alimentés (calculés, jamais enregistrés)
const shapeBoxes = (id, key) => Maillage.shapeBoxes(id, key, k => POWERED.has(k));
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
