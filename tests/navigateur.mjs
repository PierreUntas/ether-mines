// Smoke test in a real browser, in solo mode (no Supabase):
// the page loads with no error, we enter the world, mine a block, craft planks.
// Usage: npm i --no-save playwright three@0.128.0 && npx playwright install chromium && node tests/navigateur.mjs
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
// small static server: the workers (background meshing) don't start from file://
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-proxy-server'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /mesh/i.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('ether-mines:profil', JSON.stringify({ id: 'test', name: 'Tester', color: '#8a7bef' })));
await page.route('**/three.min.js', (r) => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', (r) => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/^https:\/\/fonts\./, (r) => r.abort());
const fail = async (msg) => { console.error('FAILED:', msg, errors); await browser.close(); server.close(); process.exit(1); };

await page.goto(base + 'index.html#debug');
await page.waitForTimeout(800);
if (errors.length) await fail('error while loading the page');
await page.evaluate(() => document.getElementById('play').click());
await page.waitForFunction(() => document.getElementById('title').hidden, null, { timeout: 240000 });
// a new player's intro cinematic starts, and Skip ends it (Thea's greeting follows)
const intro = await page.evaluate(async () => {
  const t0 = performance.now();
  while (!CINE.on && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
  const on = CINE.on && !!document.getElementById('cine') && document.body.classList.contains('cine');
  for (let i = 0; i < 30; i++) cineTick(0.1); // the first subtitle
  const sub = (document.querySelector('#cine .sub')?.textContent || '').includes('network went dark');
  document.querySelector('#cine .skip').click();
  cineTick(0.1);
  return { on, sub, off: !CINE.on && !document.getElementById('cine') && !document.body.classList.contains('cine') };
});
if (!intro.on || !intro.sub || !intro.off) await fail('intro: ' + JSON.stringify(intro));
const y = await page.evaluate(() => { for (let y = 63; y > 0; y--) { const v = mines.get(20, y, 20); if (v && ![5, 6, 7, 17, 18, 19, 20].includes(v)) return y; } });
await page.evaluate((y) => mines.breakBlock({ x: 20, y, z: 20, id: mines.get(20, y, 20) }), y);
await page.evaluate(() => { mines.give(5, 1, 'test'); mines.craft({ out: 9, n: 4, need: { 5: 1 } }); });
await page.waitForTimeout(500);
const res = await page.evaluate((y) => ({ block: mines.get(20, y, 20), inv: mines.S.inv }), y);
if (res.block !== 0) await fail('the mined block is still there');
if (res.inv[9] !== 4) await fail('the planks were not crafted: ' + JSON.stringify(res.inv));
if (errors.length) await fail('errors during play');
// story chapters: finishing Genesis has Thea close it, opens The Forge and the Circuits side chapter
const chapters = await page.evaluate(async () => {
  const S = mines.S, until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 200)); };
  mines.playing = true;
  await until(() => S.qd, 10000); // the chapter system has taken stock of this save
  Object.assign(S.got, { 5: 1, 101: 1, 102: 1 });
  Object.assign(S, { petted: 1, visitedCity: 1, slept: 1 });
  await until(() => /Pathfinder/.test(document.getElementById('dialogue').textContent), 25000);
  const said = document.getElementById('dialogue').textContent;
  openTab('quest');
  const shown = document.querySelectorAll('#panel .chapter').length, locked = document.querySelectorAll('#panel .chapter.locked').length;
  togglePanel();
  return { seen: !!S.chSeen?.genesis, forge: !!S.chSeen?.['forge:in'], said, hud: document.getElementById('quest').textContent, shown, locked };
});
if (!chapters.seen || !chapters.forge || !/Pathfinder/.test(chapters.said) || !/^The Forge/.test(chapters.hud) || chapters.shown !== 6 || chapters.locked !== 3)
  await fail('chapters: ' + JSON.stringify(chapters));
// shaped blocks: a pressure plate you walk on, a staircase, a cable
const plate = await page.evaluate(() => {
  const P = mines.P, x = Math.floor(P.x) + 6, z = Math.floor(P.z) + 6;
  let y = 63; while (y > 0 && !mines.get(x, y, z)) y--;
  mines.commit(`${x},${y + 1},${z}`, 66, null);
  mines.commit(`${x + 1},${y + 1},${z}`, 67, null);
  mines.commit(`${x},${y + 1},${z + 1}`, 36, null);
  mines.commit(`${x - 1},${y + 1},${z}`, 92, null);
  mines.commit(`${x - 2},${y + 1},${z}`, 92, null);
  mines.commit(`${x - 1},${y + 1},${z + 1}`, 93, null);
  mines.commit(`${x + 2},${y + 1},${z}`, 94, null);
  return { x, y: y + 1, z };
});
await page.waitForTimeout(400);
await page.evaluate(({ x, y, z }) => { const P = mines.P; P.x = x + 0.5; P.z = z + 0.5; P.y = y + 0.1; }, plate);
await page.waitForTimeout(1200);
const alive = await Promise.race([page.evaluate(() => performance.now()), new Promise(r => setTimeout(() => r(null), 5000))]);
if (alive === null) await fail('the game stopped responding after stepping on a pressure plate');
if (errors.length) await fail('errors with shaped blocks');
// chest: deposit then take back planks
const chest = await page.evaluate(async () => {
  const P = mines.P, x = Math.floor(P.x) - 3, z = Math.floor(P.z) + 2;
  let y = 63; while (y > 0 && !mines.get(x, y, z)) y--;
  mines.commit(`${x},${y + 1},${z}`, 98, null);
  await mines.openChest({ x, y: y + 1, z, id: 98 });
  await mines.moveChest('9', 3);
  const inside = mines.S.chests?.[`${x},${y + 1},${z}`]?.[9];
  await mines.moveChest('9', -1);
  return { inside, bag: mines.S.inv[9], tab: !!document.querySelector('.grid.chest') };
});
if (chest.inside !== 3 || chest.bag !== 2 || !chest.tab) await fail('chest: ' + JSON.stringify(chest));
await page.screenshot({ path: process.env.CAPTURE_CHEST || '/dev/null' }).catch(() => {});
await page.evaluate(() => document.getElementById('closeP').click());
// logic gates: an AND between two levers lights a lamp only when both are up
const circuit = async (lever2) =>
  page.evaluate(async (l2) => {
    const Y = 47, y = Y + 1, c = (x, yy, z, id) => mines.commit(x + ',' + yy + ',' + z, id, null);
    for (let x = 16; x <= 22; x++) for (let z = 2; z <= 6; z++) c(x, Y, z, 80);
    c(16, y, 5, 65); c(17, y, 5, 67); c(18, y, 5, 112); c(19, y, 5, 67); c(20, y, 5, l2); c(18, y, 4, 67); c(18, y, 3, 68);
    await new Promise(r => setTimeout(r, 2500));
    return mines.POWERED.has('18,' + y + ',3');
  }, lever2);
const [off, on] = [await circuit(64), await circuit(65)];
if (off || !on) await fail(`AND gate: lamp ${off} with one lever, ${on} with two`);
// getting out of water: swimming against a one-block bank while jumping is enough
const water = await page.evaluate(async () => {
  const Y = 47, c = (x, y, z, id) => mines.commit(x + ',' + y + ',' + z, id, null);
  for (let x = 24; x <= 34; x++) for (let z = 14; z <= 24; z++) { c(x, Y, z, 80); for (let k = 1; k <= 2; k++) c(x, Y + k, z, z < 20 ? 15 : 11); for (let k = 3; k < 6; k++) c(x, Y + k, z, 0); }
  for (const x of [24, 32]) for (const z of [14, 22]) mines.rebuildAt(x, z);
  await new Promise(r => setTimeout(r, 1500));
  const P = mines.P; P.x = 29.5; P.z = 21.5; P.y = Y + 1.5; P.vy = 0;
  mines.yaw = 0; mines.pitch = 0; mines.playing = true;
  mines.keys.add('KeyW'); mines.keys.add('Space');
  const t0 = performance.now();
  while (performance.now() - t0 < 15000 && !(P.z < 19.7 && P.y >= Y + 2.9)) await new Promise(r => setTimeout(r, 200));
  mines.keys.clear();
  return P.z < 19.7 && P.y >= Y + 2.9;
});
if (!water) await fail('unable to get out of the water on a one-block bank');
// villagers and companions of the Atrium, dialogue bubble, view from behind then from the front, character in the chest
const life = await page.evaluate(async () => {
  const P = mines.P; P.x = 8.5; P.z = 15.5; P.y = 33.05; P.vy = 0;
  // physics off from here on: this position sits near the edge of the Atrium's protected radius, and
  // the water test above left mines.playing on -- a single janky frame (a slow tab, a loaded machine)
  // can produce a bigger-than-usual physics step that drifts the player just outside the sanctuary
  // during the next ~30s of waiting, exposing them to a wandering hostile mob and flaking the combat
  // assertions below, which don't need real physics anyway (they call hurtPlayer/mkMob directly)
  mines.playing = false;
  const t0 = performance.now();
  let l = [];
  while (performance.now() - t0 < 30000) {
    l = [...ANIMALS.values()].flat();
    if (l.some(a => a.type === 'shiba') && l.some(a => a.h?.name === 'Thea')) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const s = l.find(a => a.h?.name === 'Thea');
  if (s) petAnimal(s);
  const bubble = !document.getElementById('dialogue').hidden && document.getElementById('dialogue').textContent;
  changeView();
  await new Promise(r => setTimeout(r, 1200));
  const behind = VIEW === 1 && SELF.g.visible;
  changeView(); changeView();
  openTab('inv');
  const preview = !!document.querySelector('.avatar canvas');
  togglePanel();
  return { shiba: l.some(a => a.type === 'shiba'), bubble, behind, eyes: VIEW === 0 && !SELF.g.visible, preview };
});
if (!life.shiba || !life.bubble || !life.behind || !life.eyes || !life.preview) await fail('villagers, view from behind, or character: ' + JSON.stringify(life));
// combat: a synthetic mob takes damage and dies, the player takes damage and regens
const combat = await page.evaluate(async () => {
  const P = mines.P;
  const mob = mines.mkMob('shadow', 'test-combat', 0, P.x + 1.5, P.y, P.z, null);
  mines.MOBS.set('test-combat', [mob]);
  for (let i = 0; i < mines.MK.shadow.hp && mob.hp > 0; i++) mines.attackMob(mob, 1);
  const deadHp = mob.hp;
  const t0 = performance.now();
  while (performance.now() - t0 < 10000 && mines.MOBS.get('test-combat')?.includes(mob)) await new Promise(r => setTimeout(r, 200));
  const gone = !mines.MOBS.get('test-combat')?.includes(mob);
  const regMobs = REG.mobs;
  const hpBefore = mines.S.hp;
  mines.hurtPlayer(3, P.x + 1, P.z);
  const hpAfter = mines.S.hp;
  mines.hurtPlayer(999, P.x + 1, P.z); // fatal: respawns at the sanctuary with full health (no death penalty, by design)
  const hpAfterDeath = mines.S.hp;
  const atSanctuary = Math.hypot(P.x - SPAWN.x, P.z - SPAWN.z) < 3;
  return { deadHp, gone, hpBefore, hpAfter, hpAfterDeath, atSanctuary, regMobs };
});
if (combat.deadHp !== 0) await fail('mob did not die: ' + JSON.stringify(combat));
if (!combat.gone) await fail('dead mob was not removed from MOBS: ' + JSON.stringify(combat));
if (combat.hpAfter !== combat.hpBefore - 3) await fail('hurtPlayer did not reduce hp correctly: ' + JSON.stringify(combat));
if (combat.hpAfterDeath !== 10 || !combat.atSanctuary) await fail('death did not respawn at the sanctuary with full health: ' + JSON.stringify(combat));
if (errors.length) await fail('errors during combat');
// a tower turret charges, fires a bolt along a clear line, and the bolt hurts the player
const turret = await page.evaluate(() => {
  const P = mines.P, x = Math.floor(P.x), y = Math.floor(P.y), z = Math.floor(P.z);
  for (let dz = 1; dz <= 6; dz++) for (let dy = 0; dy <= 2; dy++) mines.commit(`${x},${y + dy},${z + dz}`, 0, null);
  const t = mines.mkMob('turret', 'test-turret', 0, x + 0.5, y, z + 5.5, null);
  mines.MOBS.set('test-turret', [t]);
  hurtT = 0; // no grace left over from the combat test above
  const hp0 = mines.S.hp;
  rangedAttack(t, MK.turret, true, 5, 0.1); // starts charging
  rangedAttack(t, MK.turret, true, 5, 1.0); // charge done: fires
  const fired = MOB_BOLTS.length;
  for (let i = 0; i < 40 && MOB_BOLTS.length; i++) updateMobBolts(0.05);
  mines.MOBS.delete('test-turret');
  scene.remove(t.g);
  return { fired, hpLost: hp0 - mines.S.hp };
});
if (turret.fired !== 1 || !(turret.hpLost > 0)) await fail('turret: ' + JSON.stringify(turret));
// tower mobs keep clear of the ladder and hold their attacks while you're on it
const ladder = await page.evaluate(() => {
  const P = mines.P, x = Math.floor(P.x), y = Math.floor(P.y), z = Math.floor(P.z);
  mines.commit(`${x},${y},${z}`, 94, null);
  mines.commit(`${x},${y + 1},${z}`, 94, null);
  const key = ckey(cOf(P.x), cOf(P.z)),
    w = mines.mkMob('warden', key, 900, P.x + 0.6, P.y, P.z, null);
  w.ladder = { x: P.x, z: P.z };
  const keep = mines.MOBS.get(key) || [];
  mines.MOBS.set(key, [...keep, w]);
  hurtT = 0;
  const hp0 = mines.S.hp;
  for (let i = 0; i < 10; i++) updateMobs(0.1);
  const out = { pushedOut: Math.hypot(w.g.position.x - P.x, w.g.position.z - P.z) >= 2.1, held: mines.S.hp === hp0 };
  mines.MOBS.set(key, keep);
  scene.remove(w.g);
  mines.commit(`${x},${y},${z}`, 0, null);
  mines.commit(`${x},${y + 1},${z}`, 0, null);
  return out;
});
if (!ladder.pushedOut || !ladder.held) await fail('ladder: ' + JSON.stringify(ladder));
// walking mobs step up one block, like you: a closed hut keeps them out (no climbing the walls,
// no biting through them), a gap lets them in, and a single step is still climbed. Built on a stone
// slab in the air, away from the Atrium (where mobs never attack), so the terrain doesn't interfere.
const hut = await page.evaluate(() => {
  const P = mines.P,
    P0 = [P.x, P.y, P.z],
    cy = 52,
    cells = [],
    slab = [];
  let cx = null,
    cz = null;
  for (let r = 8; r < 40 && cx === null; r += 2)
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = Math.floor(P.x) + ox,
        z = Math.floor(P.z) + oz;
      let ok = true;
      for (let dx = -4; dx <= 8 && ok; dx++)
        for (let dz = -4; dz <= 4 && ok; dz++) ok = CHK.has(ckey(cOf(x + dx), cOf(z + dz))) && !mobSafe(x + dx + 0.5, z + dz + 0.5);
      if (ok) {
        cx = x;
        cz = z;
        break;
      }
    }
  if (cx === null) return { noSpot: true };
  for (let dx = -4; dx <= 8; dx++) for (let dz = -4; dz <= 4; dz++) slab.push([cx + dx, cy - 1, cz + dz]);
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let k = 0; k <= 3; k++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        if ((edge && k < 3) || k === 3) cells.push([cx + dx, cy + k, cz + dz]);
      }
  for (const [x, y, z] of [...slab, ...cells]) mines.commit(`${x},${y},${z}`, 1, null);
  P.x = cx + 0.5;
  P.y = cy;
  P.z = cz + 0.5;
  const key = ckey(cOf(P.x), cOf(P.z)),
    keep = mines.MOBS.get(key) || [],
    m = mines.mkMob('shadow', key, 901, cx + 6.5, cy, cz + 0.5, null);
  m.g.position.y = cy;
  mines.MOBS.set(key, [...keep, m]);
  hurtT = 0;
  const hp0 = mines.S.hp,
    run = () => {
      for (let i = 0; i < 80; i++) {
        P.x = cx + 0.5;
        P.y = cy;
        P.z = cz + 0.5;
        updateMobs(0.05);
        hurtT = 0;
      }
    },
    dist = () => Math.hypot(m.g.position.x - P.x, m.g.position.z - P.z);
  run();
  const out = { outside: dist() > 2, low: m.g.position.y < cy + 1.5, unhurt: mines.S.hp === hp0 };
  // open a door-sized gap on its side: now it comes in
  mines.commit(`${cx + 2},${cy},${cz}`, 0, null);
  mines.commit(`${cx + 2},${cy + 1},${cz}`, 0, null);
  run();
  out.cameIn = dist() < 2;
  for (const [x, y, z] of cells) mines.commit(`${x},${y},${z}`, 0, null);
  // a one-block step on its way: climbed
  m.g.position.set(cx + 6.5, cy, cz + 0.5);
  for (let dz = -3; dz <= 3; dz++) mines.commit(`${cx + 3},${cy},${cz + dz}`, 1, null);
  let top = cy;
  for (let i = 0; i < 80; i++) {
    P.x = cx + 0.5;
    P.y = cy;
    P.z = cz + 0.5;
    updateMobs(0.05);
    hurtT = 0;
    if (Math.floor(m.g.position.x) === cx + 3) top = Math.max(top, m.g.position.y);
  }
  out.stepped = top > cy + 0.7;
  for (let dz = -3; dz <= 3; dz++) mines.commit(`${cx + 3},${cy},${cz + dz}`, 0, null);
  for (const [x, y, z] of slab) mines.commit(`${x},${y},${z}`, 0, null);
  mines.MOBS.set(key, keep);
  scene.remove(m.g);
  [P.x, P.y, P.z] = P0;
  mines.S.hp = hp0;
  return out;
});
if (!hut.outside || !hut.low || !hut.unhurt || !hut.cameIn || !hut.stepped) await fail('mobs and walls: ' + JSON.stringify(hut));
// a free-standing ladder (nothing behind its panel, like a tower's open loggia): pushing forward into
// it climbs, it doesn't walk you off the back
const climb = await page.evaluate(async () => {
  const P = mines.P, x = Math.floor(P.x) + 3, z = Math.floor(P.z), y = Math.floor(P.y);
  for (let k = 0; k < 6; k++) mines.commit(`${x},${y + k},${z}`, 94, null);
  for (let k = 0; k < 6; k++) mines.commit(`${x},${y + k},${z - 1}`, 0, null);
  P.x = x + 0.5; P.z = z + 0.5; P.y = y + 0.05; P.vy = 0;
  mines.yaw = 0; mines.pitch = 0; mines.playing = true;
  mines.keys.add('KeyW'); mines.keys.add('Space');
  const t0 = performance.now();
  while (P.y < y + 2 && Math.floor(P.z) === z && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 200));
  mines.keys.clear();
  mines.playing = false;
  const out = { rose: +(P.y - y).toFixed(1), stayed: Math.floor(P.z) === z && Math.floor(P.x) === x };
  for (let k = 0; k < 6; k++) mines.commit(`${x},${y + k},${z}`, 0, null);
  return out;
});
if (!(climb.rose >= 2) || !climb.stayed) await fail('free-standing ladder: ' + JSON.stringify(climb));
// the Merge twins: the first one down only goes dormant; both down together ends it and mints the Aegis
const twins = await page.evaluate(async () => {
  const P = mines.P,
    arena = { x: P.x, z: P.z, r: 10, y: P.y },
    pw = mines.mkMob('pow_twin', ckey(cOf(P.x), cOf(P.z)), 0, P.x + 2, P.y, P.z, null),
    ps = mines.mkMob('pos_twin', ckey(cOf(P.x), cOf(P.z)), 1, P.x - 2, P.y + 1, P.z, null);
  pw.arena = ps.arena = arena;
  pw.twin = ps;
  ps.twin = pw;
  // in the player's own chunk: a mob tick (updateMobs) despawns any list keyed outside the loaded chunks
  const tkey = ckey(cOf(P.x), cOf(P.z)), tkeep = mines.MOBS.get(tkey) || [];
  mines.MOBS.set(tkey, [...tkeep, pw, ps]);
  // shielded from afar: with the disc 50 blocks away, a 10-damage hit only does 1.5
  const far = { x: P.x + 50, z: P.z, r: 10, y: P.y };
  pw.arena = ps.arena = far;
  const hp0 = pw.hp;
  damageMob(pw, 10, P.x, P.z);
  const shielded = Math.abs(hp0 - pw.hp - 1.5) < 0.01;
  pw.hp = hp0;
  pw.arena = ps.arena = arena;
  damageMob(pw, 999, P.x, P.z);
  const dormant = pw.hp === 0 && pw.down > 0 && !pw.dying && ps.hp > 0;
  pw.down = 0.3; // let it rise again quickly (one mob tick, without the game loop running)
  updateMobs(0.5);
  const rose = pw.hp > 0;
  damageMob(pw, 999, P.x, P.z);
  damageMob(ps, 999, P.x, P.z);
  const both = pw.dying > 0 && ps.dying > 0;
  await new Promise(r => setTimeout(r, 300));
  mines.MOBS.set(tkey, tkeep);
  return { shielded, dormant, rose, both, aegis: mines.S.nfts.some(n => n.id === 209) };
});
if (!twins.shielded || !twins.dormant || !twins.rose || !twins.both || !twins.aegis) await fail('merge twins: ' + JSON.stringify(twins));
// daytime rest: by day a sky raider slips out of sight once you're far, a ruin guardian never does
// (validators keep their full guard), and the raider is back at night
const rest = await page.evaluate(() => {
  const P = mines.P, key = ckey(cOf(P.x), cOf(P.z)), keep = mines.MOBS.get(key) || [];
  let dz = 0;
  while (!restsByDay({ type: 'sky_raider', hx: P.x + 2, hz: P.z + dz })) dz++; // one of the raiders that rest by day
  const cr = mines.mkMob('sky_raider', key, 170, P.x + 2, P.y, P.z + dz, null),
    wd = mines.mkMob('guardian', key, 111, P.x - 2, P.y, P.z, null),
    list = [cr, wd];
  mines.MOBS.set(key, list);
  const n0 = skyU.night.value;
  skyU.night.value = 0;
  syncDayRest(key, false);
  const nearStays = list.includes(cr);
  cr.g.position.x = P.x + 40;
  wd.g.position.x = P.x - 40;
  syncDayRest(key, false);
  const rests = !list.includes(cr) && list.includes(wd);
  skyU.night.value = 1;
  syncDayRest(key, false);
  const back = list.includes(cr) && cr.g.parent === scene;
  skyU.night.value = n0;
  for (const a of list) scene.remove(a.g);
  mines.MOBS.set(key, keep);
  return { nearStays, rests, back };
});
if (!rest.nearStays || !rest.rests || !rest.back) await fail('daytime rest: ' + JSON.stringify(rest));
// the full screen button: shown where the browser supports it, toggles full screen, lit while on
const fsShown = await page.evaluate(() => !document.getElementById('fsBtn').hidden);
await page.click('#fsBtn');
await page.waitForTimeout(400);
const fsOn = await page.evaluate(() => !!document.fullscreenElement && document.getElementById('fsBtn').classList.contains('on'));
await page.click('#fsBtn');
await page.waitForTimeout(400);
const fsOff = await page.evaluate(() => !document.fullscreenElement && !document.getElementById('fsBtn').classList.contains('on') && document.getElementById('title').hidden);
if (!fsShown || !fsOn || !fsOff) await fail('full screen: ' + JSON.stringify({ fsShown, fsOn, fsOff }));
// on an iPhone (no full screen for pages), the button explains the home screen route instead
const iphone = await page.evaluate(() => {
  const ok = fsOk;
  fsOk = () => false;
  document.getElementById('fsBtn').click();
  fsOk = ok;
  const d = document.getElementById('dialogue'), out = !d.hidden && /Add to Home Screen/.test(d.textContent) && !document.fullscreenElement;
  d.hidden = true;
  return out;
});
if (!iphone) await fail('full screen help on iPhone');
// the compass: facing north puts N in the middle, facing east puts E there
const compass = await page.evaluate(async () => {
  const mid = () => {
    const box = document.getElementById('compass').getBoundingClientRect(), c = box.left + box.width / 2;
    let best = null, bd = 1e9;
    for (const b of document.querySelectorAll('#compass .strip b.cardinal')) {
      if (b.style.display === 'none') continue;
      const r = b.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - c);
      if (d < bd) { bd = d; best = b.textContent; }
    }
    return best;
  };
  const y0 = mines.yaw;
  mines.yaw = 0; updateCompass(0.1);
  const n = mid();
  mines.yaw = -Math.PI / 2; updateCompass(0.1);
  const e = mid();
  mines.yaw = y0;
  return { n, e };
});
if (compass.n !== 'N' || compass.e !== 'E') await fail('compass: ' + JSON.stringify(compass));
// wearables (17-looks.js): only what you own is worn, the shared code round-trips, the pieces are built
// and taken off again; the shop lists the catalog with this week's offer (rendered with a faked online
// session, synchronously, so no server call can go out in between)
const looks = await page.evaluate(() => {
  const keep = { c: S.cosmetics, l: S.look, g: S.gwei };
  S.cosmetics = [22, 29, 34];
  S.look = { head: 22, back: 29, companion: 34, trail: 10 }; // the trail isn't owned
  const mine = myLook(),
    code = lookCode(mine),
    back = parseLook(code),
    av = makeAvatar('T', '#8a7bef', true);
  applyLook(av, back, true);
  const parts = av.lookParts.length;
  applyLook(av, {}, true);
  const after = av.lookParts.length;
  const on = Object.getOwnPropertyDescriptor(Net, 'online'),
    uid = Object.getOwnPropertyDescriptor(Net, 'userId');
  Object.defineProperty(Net, 'online', { get: () => true, configurable: true });
  Object.defineProperty(Net, 'userId', { get: () => 'test', configurable: true });
  S.gwei = 5000;
  tab = 'shop';
  renderPanelBody();
  const rows = document.querySelectorAll('#pbody .shoprow').length,
    weekly = document.querySelectorAll('#pbody .weekly .shoprow').length,
    sale = document.querySelectorAll('#pbody .weekly b.sale').length,
    worn = document.querySelectorAll('#pbody .shoprow.worn').length;
  Object.defineProperty(Net, 'online', on);
  Object.defineProperty(Net, 'userId', uid);
  tab = 'inv';
  document.getElementById('pbody').innerHTML = '';
  Object.assign(S, { cosmetics: keep.c, look: keep.l, gwei: keep.g });
  return { trailDropped: !mine.trail, code, parts, after, rows, weekly, sale, worn, total: Object.keys(COSMETICS).length };
});
if (!looks.trailDropped || looks.code !== '0.22.29.34.0' || looks.parts !== 3 || looks.after !== 0)
  await fail('wearables: ' + JSON.stringify(looks));
if (looks.weekly !== 4 || looks.sale < 1 || looks.worn !== 3 || looks.rows < looks.total) await fail('shop: ' + JSON.stringify(looks));
// hostile mobs can be turned off in solo or a private world, never in the main world
const mobsSetting = await page.evaluate(() => {
  const en = Object.getOwnPropertyDescriptor(Net, 'enabled'), reg = REG.mobs;
  const rowLocked = () => {
    openTab('settings');
    const row = [...document.querySelectorAll('#pbody .setting')].find(r => r.textContent.includes('Hostile mobs')),
      out = !!row && [...row.querySelectorAll('button')].every(b => b.disabled) && /Not in the main world/.test(row.textContent);
    togglePanel();
    return out;
  };
  const solo = !rowLocked();
  const wd = Object.getOwnPropertyDescriptor(Net, 'world');
  Object.defineProperty(Net, 'enabled', { configurable: true, get: () => true });
  Object.defineProperty(Net, 'world', { configurable: true, get: () => 'famille-test' });
  const privateWorld = !rowLocked(); // a private online world: the choice is the player's
  Object.defineProperty(Net, 'world', { configurable: true, get: () => 'principal' });
  REG.mobs = false;
  const online = rowLocked();
  const key = ckey(cOf(mines.P.x), cOf(mines.P.z)), keep = mines.MOBS.get(key) || [], w = mines.mkMob('shadow', key, 990, mines.P.x + 3, mines.P.y, mines.P.z, null);
  mines.MOBS.set(key, [...keep, w]);
  updateMobs(0.01);
  const stays = (mines.MOBS.get(key) || []).includes(w);
  scene.remove(w.g);
  mines.MOBS.set(key, keep);
  Object.defineProperty(Net, 'world', wd);
  if (en) Object.defineProperty(Net, 'enabled', en);
  else delete Net.enabled;
  REG.mobs = reg;
  return { solo, privateWorld, online, stays };
});
if (!mobsSetting.solo || !mobsSetting.privateWorld || !mobsSetting.online || !mobsSetting.stays) await fail('mobs setting: ' + JSON.stringify(mobsSetting));
// a refused pointer lock (Chrome refuses one for about a second after a release) doesn't switch the mouse
// to drag-to-look for good: only several refusals in a row do
const lock = await page.evaluate(async () => {
  const req = cv.requestPointerLock, nl = noLock;
  cv.requestPointerLock = () => Promise.reject(new Error('cooldown'));
  noLock = false;
  lockFails = 0;
  tryLock();
  await new Promise(r => setTimeout(r, 50));
  const once = noLock;
  tryLock();
  tryLock();
  await new Promise(r => setTimeout(r, 50));
  const thrice = noLock;
  cv.requestPointerLock = req;
  noLock = nl;
  lockFails = 0;
  return { once, thrice };
});
if (lock.once || !lock.thrice) await fail('pointer lock fallback: ' + JSON.stringify(lock));
// the epilogue: finishing the last main chapter marks the story done and Thea calls you back; at the
// Atrium the finale plays (beam, fireworks), then the full-screen epilogue; villagers get a new line
const epi = await page.evaluate(async () => {
  const saved = QUESTS.map(q => q.ok), P = mines.P, pos = [P.x, P.y, P.z];
  const aw = attackWindow;
  attackWindow = () => ({ active: false }); // the finale waits out a network attack: not this test's concern
  for (const q of QUESTS) q.ok = () => true;
  delete mines.S.seen.epilogue;
  delete mines.S.seen.finale;
  FINALE.called = false;
  P.x = SPAWN.x + 40; // far from the Atrium: Thea calls you back
  progressChapters();
  const flagged = !!mines.S.seen.epilogue, called = THEA_LINES.includes(EPILOGUE.call);
  THEA_LINES.length = 0;
  $('dialogue').hidden = true;
  const wasPlaying = mines.playing;
  mines.playing = true;
  FINALE.inGame = 5; // past the few seconds it waits after entering the world
  (updateFinale(0.1), cineTick(0.1));
  const waits = !FINALE.on;
  P.x = SPAWN.x + 2; P.z = SPAWN.z + 1; // back at the Atrium
  (updateFinale(0.1), cineTick(0.1));
  const started = FINALE.on && !!FINALE.beam && CINE.on && !!document.getElementById('cine');
  const nl = noLock;
  noLock = false; // as on a desktop browser, where losing the pointer lock opens the pause menu
  document.dispatchEvent(new Event('pointerlockchange')); // the mouse is freed for Skip: no pause menu over the cinematic
  const noMenu = document.getElementById('title').hidden;
  noLock = nl;
  for (let i = 0; i < 20; i++) (updateFinale(0.1), cineTick(0.1));
  const fireworks = FINALE.fx.length > 0;
  for (let i = 0; i < 150; i++) (updateFinale(0.1), cineTick(0.1)); // into shot 3: Thea's first subtitle
  const subtitle = (document.querySelector('#cine .sub')?.textContent || '').includes(EPILOGUE.thea[0].slice(0, 20));
  document.querySelector('#cine .skip').click(); // Skip
  for (let i = 0; i < 3; i++) (updateFinale(0.1), cineTick(0.1));
  const screen = !!document.querySelector('#finale .epilogue') && !!mines.S.seen.finale && !CINE.on && !document.getElementById('cine');
  document.querySelector('#finale button').click();
  const closed = !document.querySelector('#finale');
  for (let i = 0; i < 60; i++) (updateFinale(0.1), cineTick(0.1));
  const cleaned = !FINALE.on && !FINALE.beam && !FINALE.fx.length;
  // the epilogue card offers to replay it
  const card = epilogueCard(), rb = [...card.querySelectorAll('button')].find(b => b.textContent.includes('Replay'));
  rb && rb.click();
  const replay = !!rb && !mines.S.seen.finale;
  mines.S.seen.finale = 1;
  QUESTS.forEach((q, i) => (q.ok = saved[i]));
  mines.playing = wasPlaying;
  attackWindow = aw;
  [P.x, P.y, P.z] = pos;
  const thea = { h: VILLAGERS[0] };
  talk(thea);
  await new Promise(r => setTimeout(r, 600)); // the typewriter has started
  const typed = $('dialogue').querySelector('p').textContent,
    line = typed.length > 0 && VILLAGERS[0].after.startsWith(typed);
  $('dialogue').hidden = true;
  return { flagged, called, waits, started, noMenu, fireworks, subtitle, screen, closed, cleaned, replay, line };
});
if (Object.values(epi).some(v => !v)) await fail('epilogue: ' + JSON.stringify(epi));
// combat v2: the two new mob types build and take damage, armor reduces incoming damage
const combat2 = await page.evaluate(() => {
  const P = mines.P,
    out = {};
  for (const type of ['sentinel', 'wraith']) {
    const mob = mines.mkMob(type, 'test-combat2', 0, P.x + 1.5, P.y, P.z, null);
    mines.MOBS.set('test-combat2', [mob]);
    mines.attackMob(mob, 1);
    out[type] = mob.hp < mines.MK[type].hp;
  }
  mines.S.armor = null;
  mines.S.hp = 10;
  mines.hurtPlayer(4, P.x + 1, P.z); // non-lethal, so no death-respawn-to-full confound
  const noArmor = mines.S.hp;
  mines.S.armor = '108'; // Volt Plating, 25% reduction
  mines.S.hp = 10;
  mines.hurtPlayer(4, P.x + 1, P.z);
  const withArmor = mines.S.hp;
  mines.S.armor = null;
  return { ...out, noArmor, withArmor };
});
if (!combat2.sentinel || !combat2.wraith) await fail('new mob types did not take damage: ' + JSON.stringify(combat2));
if (combat2.withArmor <= combat2.noArmor) await fail('armor did not reduce incoming damage: ' + JSON.stringify(combat2));
if (errors.length) await fail('errors with the new mobs/armor');
const m = await page.evaluate(() => ({ active: mines.meshWorker, n: mines.meshCount }));
if (!m.active) await fail('background meshing did not start');
if (m.n < 20) await fail('too few chunks displayed: ' + m.n);
// off-chain pivot: the Validators and Shop tabs render in solo mode too (just with an "online game
// needed" message, since Gwei and validator production live on the server)
const panels = await page.evaluate(() => {
  mines.openTab('validators');
  const validators = document.getElementById('pbody').textContent;
  mines.openTab('shop');
  const shop = document.getElementById('pbody').textContent;
  mines.openTab('inv');
  document.getElementById('closeP').click();
  return { validators, shop, gweiChipExists: !!document.getElementById('gwei') };
});
if (!/online game/.test(panels.validators)) await fail('Validators tab did not render: ' + panels.validators);
if (!/online game/.test(panels.shop)) await fail('Shop tab did not render: ' + panels.shop);
if (!panels.gweiChipExists) await fail('Gwei HUD chip missing from index.html');
if (errors.length) await fail('errors opening the Validators/Shop tabs');
console.log(`Browser: loaded, entered the world, mined and crafted with no error; ${m.n} chunks meshed in the background.`);
await browser.close();
server.close();
