// ---------- consumables (rules.js ITEM "use", 033_consumables.sql) ----------
// Right-click with one in hand to spend it. Online the server takes it from your inventory first
// (act_use_item, which also clears the Home Beacon's teleport); the effect itself plays here, like the
// rest of combat. Timers aren't saved: a reload ends them.
const POTION = { vision: 0, ward: 0 };
// mobs the Ward Incense never fools: guardians of ruins and gardens, tower wardens and turrets, bosses,
// the network attack's nodes
const WARD_IMMUNE = new Set([
  'guardian',
  'garden_guardian',
  'warden',
  'turret',
  'titan',
  'plasma_core',
  'pow_twin',
  'pos_twin',
  'front_runner',
  'mev_bot',
  'corrupted_node',
]);
const wardFools = a => POTION.ward > 0 && !WARD_IMMUNE.has(a.type) && !(a.provoked > 0);
function heldConsumable() {
  const it = S.bar[S.sel] ? itemId(S.bar[S.sel]) : null;
  return it && ITEM[it]?.use && (S.inv[it] || 0) > 0 ? it : null;
}
// the bed you last slept in (sleep(), 06-actions.js), checked again when the beacon is lit
function homeBed() {
  const h = S.home;
  if (!h) return null;
  const id = get(h.x, h.y, h.z);
  return id >= 137 && id <= 144 ? h : null;
}
let potionBusy = false;
async function useConsumable(it) {
  if (potionBusy) return;
  const u = ITEM[it].use;
  // refusals that don't spend anything
  if (u === 'heal' && S.hp >= 10) return logEv('burn', 'Already in full health', 'keep the tonic for later');
  const bed = u === 'home' ? homeBed() : null;
  if (u === 'home' && !bed) return logEv('burn', 'No bed to go back to', 'sleep in a bed first: the beacon brings you back to it');
  potionBusy = true;
  try {
    if (SERVER()) {
      const r = await serverAct('use_item', { item: +it, bx: bed ? bed.x : null, by: bed ? bed.y : null, bz: bed ? bed.z : null });
      if (!r) return;
    } else take(+it, 1);
  } finally {
    potionBusy = false;
  }
  swing = 0.6;
  Sound.chime();
  if (u === 'heal') {
    S.hp = Math.min(10, S.hp + 5);
    updateHpUI();
    toastInfo('Ether Tonic: +5 hearts.');
  } else if (u === 'speed') {
    buffT = Math.max(buffT, 120);
    toastInfo('Swift Elixir: you run faster for 2 minutes.');
  } else if (u === 'vision') {
    POTION.vision = 180;
    toastInfo('Owl Draught: you see in the dark for 3 minutes.');
  } else if (u === 'ward') {
    POTION.ward = 120;
    toastInfo('Ward Incense: ordinary mobs ignore you for 2 minutes, unless you strike them.');
  } else if (u === 'home') {
    P.x = bed.x + 0.5;
    P.y = bed.y + 1.05;
    P.z = bed.z + 0.5;
    P.vy = 0;
    toastInfo('Home Beacon: back to your bed.');
  }
  dirty = true;
  ui();
}
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function updatePotions(dt) {
  POTION.vision = Math.max(0, POTION.vision - dt);
  POTION.ward = Math.max(0, POTION.ward - dt);
  const on = [];
  if (buffT > 0) on.push(`⚡ ${mmss(buffT)}`);
  if (POTION.vision > 0) on.push(`👁 ${mmss(POTION.vision)}`);
  if (POTION.ward > 0) on.push(`✦ ward ${mmss(POTION.ward)}`);
  const el = $('buffs'),
    txt = on.join(' · ');
  el.hidden = !on.length || !playing;
  if (el.textContent !== txt) el.textContent = txt;
}
// night vision: the ambient light never falls below a soft daylight (applyDay, 08-sky.js)
function visionLight() {
  if (POTION.vision <= 0) return;
  const k = Math.min(1, POTION.vision / 3); // fades out over its last 3 seconds
  hemi.intensity = Math.max(hemi.intensity, 0.95 * k + hemi.intensity * (1 - k));
  hemi.color.lerp(WHITE, 0.6 * k);
}
