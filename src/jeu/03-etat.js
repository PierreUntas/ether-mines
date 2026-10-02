// Mines d'Éther · État de la partie, sauvegarde locale et serveur, saisons.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- réglages (propres à cet appareil) ----------
const REG_CLE = 'ether-mines:reglages';
const REG_DEFAUT = {
  vue: touch ? 4 : 5,
  ombres: !touch,
  nettete: touch ? 1.5 : 2,
  lucioles: true,
  animaux: true,
  ips: false,
  sensibilite: 1,
};
let REG = { ...REG_DEFAUT };
try {
  REG = { ...REG_DEFAUT, ...JSON.parse(localStorage.getItem(REG_CLE) || '{}') };
} catch (e) {}
const sauverReglages = () => {
  try {
    localStorage.setItem(REG_CLE, JSON.stringify(REG));
  } catch (e) {}
};
let SHADOWS = REG.ombres;

// ---------- état, sauvegarde ----------
let KEY = 'ether-mines:solo';
const SAVE_V = 2;
const S0 = () => ({
  v: SAVE_V,
  chunks: {},
  edits: {},
  inv: {},
  bar: [null, null, null, null, null, null, null, null, null],
  sel: 0,
  pos: null,
  placed: {},
  serial: 0,
  nfts: [],
  log: [],
  supply: {},
  day: 0.3,
  dayN: 1,
  seen: {},
  got: {},
  relit: 0,
  totalMint: 0,
  totalBurn: 0,
});
let S = S0(),
  ME = { id: 'moi', name: 'moi', color: '#8a7bef' };
const OWN = new Map();
function loadState() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {}
  useState(s);
}
function useState(s) {
  S = Object.assign(S0(), s || {});
  if (s && !s.v) S.v = 1;
  migrateSave(S);
  for (const k of Object.keys(S.inv)) S.got[k] = 1;
  for (const n of S.nfts) S.got[n.id || 201] = 1;
}
// Migrations de la partie (navigateur et serveur) : chaque version sait convertir la précédente.
function migrateSave(s) {
  // v1 : première version. Pour une v2 : if(s.v<2){ …convertir… ; s.v=2 } — ne jamais supprimer une étape.
  if (!s.v) s.v = 1;
  // v2 : portes logiques renumérotées (99–110 → 112–123), car 101–105 sont des objets
  if (s.v < 2) {
    for (const [a, b] of [
      [99, 112],
      [107, 120],
    ])
      if (s.inv?.[a]) {
        s.inv[b] = (s.inv[b] || 0) + s.inv[a];
        delete s.inv[a];
      }
    for (const k of Object.keys(s.edits || {})) if (s.edits[k] >= 99 && s.edits[k] <= 110) s.edits[k] += 13;
    if (s.bar) s.bar = s.bar.map(v => (v === '99' ? '112' : v === '107' ? '120' : v));
    s.v = 2;
  }
}
// Saison : changer SAISON efface les parties gardées dans les navigateurs (à faire avec une remise à zéro de la base).
const SAISON = '5';
try {
  if (localStorage.getItem('ether-mines:saison') !== SAISON) {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('ether-mines:') && !['ether-mines:profil', 'ether-mines:son'].includes(k)) localStorage.removeItem(k);
    localStorage.setItem('ether-mines:saison', SAISON);
  }
} catch (e) {}
let dirty = false,
  cloudDirty = false,
  cloudBusy = false,
  cloudOff = false;
function save() {
  if (!dirty) return;
  dirty = false;
  cloudDirty = true;
  S.pos = [P.x, P.y, P.z, yaw, pitch];
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {}
}
// partie côté serveur (en ligne) : sans le terrain du mode solo, avec un registre raccourci
const cloudState = () => {
  const c = { ...S, log: S.log.slice(0, 40) };
  delete c.chunks;
  delete c.edits;
  delete c.placed;
  delete c.inv;
  delete c.nfts;
  return c;
};
async function cloudSave(force) {
  if (!Net.enabled || !Net.userId || cloudOff || !booted || cloudBusy || !(cloudDirty || force)) return;
  cloudBusy = true;
  cloudDirty = false;
  try {
    if (!(await Net.savePlayer(Net.world, ME.name, ME.color, cloudState()))) cloudDirty = true;
  } finally {
    cloudBusy = false;
  }
}
setInterval(() => {
  save();
  cloudSave();
}, 5000);
addEventListener('pagehide', () => {
  dirty = true;
  save();
  cloudSave(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    dirty = true;
    save();
    cloudSave(true);
  }
});
