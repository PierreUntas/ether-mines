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
  glow: !touch, // the clay look's soft light around bright things (04-render.js)
  sharpness: 1.5, // a Retina screen at full resolution (2) costs twice the pixels: kept as a choice, not the default
  fireflies: true,
  animals: true,
  mobs: true,
  fps: false,
  sensitivity: 1,
  autoQuality: true, // lower the graphics on its own when the game can't keep up (10-loop.js)
  // what the screen shows (Settings → On screen, applyHud in 07-interface.js): each can be hidden
  hudPlace: true, // your position and the compass
  hudOnline: true, // the players online
  hudGear: true, // your plating, boots and potions
  hudGwei: true,
  hudQuest: true, // the objective, top center
  hudTarget: true, // what you aim at, under the crosshair
  hudNames: true, // the names over the players' and villagers' heads
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
const SAVE_V = 4;
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
  hp: 10,
  armor: null,
  boots: null, // the boots worn (the Front-Runner Boots, 211): their own slot, beside the plating
  helm: null, // the helmet, the gauntlets and the amulet worn (24-gear.js): an item id, or null
  gloves: null,
  amulet: null,
  gwei: 0, // the game's own fictional currency, server-authoritative (see 019_gwei_currency.sql)
  cosmetics: [], // owned cosmetic ids (022_cosmetics.sql), server-authoritative
  look: {}, // the cosmetic worn in each slot (17-looks.js), checked against cosmetics when drawn
  outfits: [], // the Wardrobe's saved outfits: { look, color } or null, per slot (07-interface.js)
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
  // the Front-Runner Boots used to work just by being owned: a save from then wears them already
  if (s && !('boots' in s) && S.nfts.some(n => n.id === 211)) S.boots = '211';
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
  // v4: off-chain pivot. gwei/cosmetics are new fields, no data to convert: S0()'s defaults already
  // cover a save that predates them (Object.assign in useState). Also drops the now-unused walletLinked
  // flag and any onchain fields a seal used to carry (vx/vy/vz/chainTx/tokenId — see 023_remove_onchain.sql).
  if (s.v < 4) {
    delete s.walletLinked;
    for (const n of s.nfts || []) {
      delete n.vx;
      delete n.vy;
      delete n.vz;
      delete n.chainTx;
      delete n.tokenId;
    }
    s.v = 4;
  }
}
// Season: changing SEASON wipes the saves kept in browsers (do this together with a database reset).
const SEASON = '10'; // public beta launch: reset.sql + installation.sql run together with this bump
try {
  if (localStorage.getItem('ether-mines:saison') !== SEASON) {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('ether-mines:') && !['ether-mines:profil', 'ether-mines:son', 'ether-mines:nouveautes'].includes(k))
        localStorage.removeItem(k);
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
  keepPos();
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {}
}
// where you stand, with when (so the newest of this browser's save and the server's wins, boot in
// 14-startup.js) and whose (this browser may have held another account's save)
function keepPos() {
  S.pos = [P.x, P.y, P.z, yaw, pitch];
  S.posAt = Date.now();
  S.posBy = Net.userId || ME.id;
}
// Walking alone changes nothing else in the save: where you stand is still kept, in this browser every
// 5 s, on the server every 20 s at most (the whole save goes up each time: no more often than that)
let posKept = null,
  posCloud = false,
  cloudAt = 0;
function keepWalk() {
  if (typeof playing === 'undefined' || !playing || !booted) return;
  if (posKept && Math.hypot(P.x - posKept[0], P.y - posKept[1], P.z - posKept[2]) < 1) return;
  posKept = [P.x, P.y, P.z];
  keepPos();
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {}
  posCloud = true;
}
// server-side save (online): without the solo-mode terrain, with a shortened log
const cloudState = () => {
  const c = { ...S, log: S.log.slice(0, 40) };
  delete c.chunks;
  delete c.edits;
  delete c.placed;
  delete c.inv;
  delete c.nfts;
  delete c.gwei;
  delete c.cosmetics;
  return c;
};
async function cloudSave(force) {
  if (!Net.enabled || !Net.userId || cloudOff || !booted || cloudBusy || !(cloudDirty || force)) return;
  cloudBusy = true;
  cloudDirty = false;
  try {
    if (!(await Net.savePlayer(Net.world, ME.name, ME.color, cloudState()))) cloudDirty = true;
    else {
      cloudAt = Date.now();
      posCloud = false;
    }
  } finally {
    cloudBusy = false;
  }
}
setInterval(() => {
  save();
  keepWalk();
  if (posCloud && Date.now() - cloudAt > 20000) cloudDirty = true;
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
