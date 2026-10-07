// Ether Mines · Game state, local and server save, seasons.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- settings (specific to this device) ----------
// Note: the localStorage key keeps its old name ('ether-mines:reglages') so existing saved
// settings keep loading; only the in-game property names below were translated.
const REG_KEY = 'ether-mines:reglages';
const OLD_REG_KEYS = {
  vue: 'view',
  ombres: 'shadows',
  nettete: 'sharpness',
  lucioles: 'fireflies',
  animaux: 'animals',
  ips: 'fps',
  sensibilite: 'sensitivity',
};
const REG_DEFAULT = {
  view: touch ? 4 : 5,
  shadows: !touch,
  sharpness: touch ? 1.5 : 2,
  fireflies: true,
  animals: true,
  fps: false,
  sensitivity: 1,
};
let REG = { ...REG_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem(REG_KEY) || '{}');
  for (const [oldK, newK] of Object.entries(OLD_REG_KEYS))
    if (saved[oldK] !== undefined && saved[newK] === undefined) saved[newK] = saved[oldK];
  REG = { ...REG_DEFAULT, ...saved };
} catch (e) {}
const saveSettings = () => {
  try {
    localStorage.setItem(REG_KEY, JSON.stringify(REG));
  } catch (e) {}
};
let SHADOWS = REG.shadows;

// ---------- state, save ----------
let KEY = 'ether-mines:solo';
const SAVE_V = 3;
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
  ME = { id: 'me', name: 'me', color: '#8a7bef' };
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
// Save migrations (browser and server): each version knows how to convert the previous one.
function migrateSave(s) {
  // v1: first version. For a v2: if(s.v<2){ …convert… ; s.v=2 } — never remove a step.
  if (!s.v) s.v = 1;
  // v2: logic doors renumbered (99–110 → 112–123), because 101–105 are items
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
  // v3: chests renamed from "malles" to "chests"
  if (s.v < 3) {
    if (s.malles) {
      s.chests = s.malles;
      delete s.malles;
    }
    s.v = 3;
  }
}
// Season: changing SEASON wipes the saves kept in browsers (do this together with a database reset).
const SEASON = '6';
try {
  if (localStorage.getItem('ether-mines:saison') !== SEASON) {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('ether-mines:') && !['ether-mines:profil', 'ether-mines:son'].includes(k)) localStorage.removeItem(k);
    localStorage.setItem('ether-mines:saison', SEASON);
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
// server-side save (online): without the solo-mode terrain, with a shortened log
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
