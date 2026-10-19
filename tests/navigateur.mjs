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
// CPU_SLOW=3 node tests/navigateur.mjs: a CPU three times slower, to reproduce a small CI machine
if (process.env.CPU_SLOW) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU_SLOW });
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
// look with the mouse dragged, as a browser without pointer lock does: some headless machines (GitLab's)
// grant the lock, and losing it then pauses the game in the middle of the tests
await page.evaluate(() => { noLock = true; });
// a new player's intro cinematic starts, and Skip ends it (Thea's greeting follows)
const intro = await page.evaluate(async () => {
  const t0 = performance.now();
  while (!CINE.on && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
  const on = CINE.on && !!document.getElementById('cine') && document.body.classList.contains('cine');
  for (let i = 0; i < 30; i++) cineTick(0.1); // the first subtitle
  const sub = (document.querySelector('#cine .sub')?.getAttribute('aria-label') || '').includes('network went dark');
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
// a real hang never answers; 30 s leaves room for a slow CI machine (2 cores, software WebGL) still meshing
const alive = await Promise.race([page.evaluate(() => performance.now()), new Promise(r => setTimeout(() => r(null), 30000))]);
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
    // the current spreads over frames: a slow CI machine needs longer to light the lamp, so wait for it (up to
    // 30 s) when it should light, and a fixed 2.5 s when it shouldn't
    const t0 = performance.now();
    while (performance.now() - t0 < (l2 === 65 ? 30000 : 2500) && !(l2 === 65 && mines.POWERED.has('18,' + y + ',3')))
      await new Promise(r => setTimeout(r, 250));
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
  // 15 s of game time, however long the machine takes to play them (the solo clock counts the game's own
  // seconds: S.day moves by dt / 480 each frame), within 5 real minutes
  const S = mines.S, game = () => (S.dayN + S.day) * 480, g0 = game(), t0 = performance.now();
  while (game() - g0 < 15 && performance.now() - t0 < 300000 && !(P.z < 19.7 && P.y >= Y + 2.9)) await new Promise(r => setTimeout(r, 200));
  mines.keys.clear();
  return P.z < 19.7 && P.y >= Y + 2.9;
});
if (!water) await fail('unable to get out of the water on a one-block bank');
// a one-block doorway entered a little off its axis: the player slides into it instead of sticking to the corner
const doorway = await page.evaluate(async () => {
  const Y = 47, c = (x, y, z, id) => mines.commit(x + ',' + y + ',' + z, id, null);
  for (let x = 38; x <= 48; x++) for (let z = 12; z <= 24; z++) { c(x, Y, z, 80); for (let k = 1; k < 5; k++) c(x, Y + k, z, 0); }
  for (let x = 38; x <= 48; x++) if (x !== 43) for (let k = 1; k <= 3; k++) c(x, Y + k, 18, 79);
  for (const x of [38, 46]) for (const z of [12, 20]) mines.rebuildAt(x, z);
  const P = mines.P;
  P.x = 43.5 + 0.33; P.z = 21.5; P.y = Y + 1.02; P.vy = 0;
  mines.yaw = 0; mines.pitch = 0; mines.playing = true;
  mines.keys.add('KeyW');
  const S = mines.S, game = () => (S.dayN + S.day) * 480, g0 = game(), t0 = performance.now();
  while (game() - g0 < 3 && performance.now() - t0 < 120000 && P.z > 17) await new Promise(r => setTimeout(r, 100));
  mines.keys.clear();
  return { through: P.z < 17.5, jumped: P.y > Y + 1.3, x: +P.x.toFixed(2), z: +P.z.toFixed(2) };
});
if (!doorway.through) await fail('doorway off axis: ' + JSON.stringify(doorway));
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
  while (VIEW !== 0) changeView(true); // the clay look starts from behind: begin through the eyes
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
  for (let i = 0; i < mines.MK.shadow.hp && mob.hp > 0; i++) {
    tickWeapons(1);
    mines.attackMob(mob);
  }
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
// through the game server, a mob's health is the server's: the killing blow waits for its word, its answer
// puts the health right, another player's blow sets it, and with no answer this screen settles it
const served = await page.evaluate(async () => {
  const P = mines.P,
    key = ckey(cOf(P.x), cOf(P.z)),
    keep = mines.MOBS.get(key) || [],
    mk = i => mines.mkMob('shadow', key, 950 + i, P.x + 1.5, P.y, P.z, null),
    [m1, m2, m3] = [mk(0), mk(1), mk(2)],
    sent = [],
    send = Net.sendMob,
    real = Object.getOwnPropertyDescriptor(Net, 'gameServer');
  mines.MOBS.set(key, [...keep, m1, m2, m3]);
  Object.defineProperty(Net, 'gameServer', { get: () => true, configurable: true });
  Net.sendMob = p => sent.push(p);
  const id = a => `${a.k}|${a.i}|${a.type}`;
  damageMob(m1, 999, P.x, P.z, 107);
  const waits = m1.hp > 0 && !m1.dying && sent[0]?.item === 107;
  remoteMobHit({ id: id(m1), from: ME.id, dmg: 7.5, hp: 0, dead: 1, by: [ME.id], x: m1.g.position.x, y: P.y, z: P.z, fx: P.x, fz: P.z });
  const died = m1.dying > 0;
  damageMob(m2, 3, P.x, P.z);
  remoteMobHit({ id: id(m2), from: ME.id, dmg: 2, hp: 8, x: m2.g.position.x, y: P.y, z: P.z, fx: P.x, fz: P.z });
  const corrected = m2.hp === 8;
  remoteMobHit({ id: id(m2), from: 'someone', dmg: 6, hp: 2, x: m2.g.position.x, y: P.y, z: P.z, fx: P.x, fz: P.z });
  const theirs = m2.hp === 2;
  damageMob(m3, 999, P.x, P.z);
  await new Promise(r => setTimeout(r, 1000));
  const settled = m3.dying > 0 || !mines.MOBS.get(key)?.includes(m3);
  Object.defineProperty(Net, 'gameServer', real);
  Net.sendMob = send;
  mines.MOBS.set(key, keep);
  return { waits, died, corrected, theirs, settled };
});
if (Object.values(served).some(v => !v)) await fail('mobs through the game server: ' + JSON.stringify(served));
// one mob, one place: the screen it's after leads it and says where it is; another player's word makes
// this screen follow instead, until that word stops coming
const led = await page.evaluate(async () => {
  const P = mines.P,
    home = { x: P.x, y: P.y, z: P.z };
  // out of the sanctuary (where no mob hunts), still among the loaded chunks
  for (let r = 10; r < 60 && mobSafe(P.x, P.z); r += 2)
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]])
      if (mobSafe(P.x, P.z) && !mobSafe(home.x + ox, home.z + oz) && MESH.has(ckey(cOf(home.x + ox), cOf(home.z + oz)))) {
        P.x = home.x + ox;
        P.z = home.z + oz;
      }
  const key = ckey(cOf(P.x), cOf(P.z)),
    keep = mines.MOBS.get(key) || [],
    a = mines.mkMob('shadow', key, 960, P.x + 3, P.y, P.z, null),
    sent = [],
    send = Net.sendMobs,
    real = Object.getOwnPropertyDescriptor(Net, 'gameServer'),
    fake = { t: 1, g: new THREE.Group() };
  fake.g.position.set(P.x + 200, P.y, P.z);
  others.set('far-friend', fake);
  mines.MOBS.set(key, [...keep, a]);
  Object.defineProperty(Net, 'gameServer', { get: () => true, configurable: true });
  Net.sendMobs = p => sent.push(p);
  updateMobs(0.2);
  const leads = a.lead && sent.at(-1)?.list.some(e => e.id === `${key}|960|shadow`);
  // a friend closer to it says it's after them, and where it stands: this screen follows
  const id = `${key}|960|shadow`,
    there = { x: P.x + 3, y: P.y, z: P.z + 2 };
  mobsWord({ from: 'far-friend', list: [{ id, ...there, r: 1, d: 0.5, f: 0 }] });
  for (let i = 0; i < 20; i++) updateMobs(0.05);
  const p = a.g.position,
    follows = !a.lead && Math.hypot(p.x - there.x, p.z - there.z) < 0.1;
  // farther than this screen's own player: ignored
  a.remote = null;
  updateMobs(0.05);
  mobsWord({ from: 'far-friend', list: [{ id, x: P.x + 9, y: P.y, z: P.z, r: 0, d: 50, f: 0 }] });
  const kept = a.lead && !a.remote;
  // the word stops: this screen takes it back
  mobsWord({ from: 'far-friend', list: [{ id, ...there, r: 1, d: 0.5, f: 0 }] });
  a.remote.t -= 1000;
  updateMobs(0.05);
  const back = !a.remote && a.lead;
  Object.defineProperty(Net, 'gameServer', real);
  Net.sendMobs = send;
  others.delete('far-friend');
  mines.MOBS.set(key, keep);
  Object.assign(P, home);
  return { leads, follows, kept, back };
});
if (Object.values(led).some(v => !v)) await fail('one mob, one place: ' + JSON.stringify(led));
// the game server runs the mobs: this screen spawns none, draws the ones it's told of, takes their blows
// (and tells the server of a parry), their bolts, and drops a mob the server stops mentioning
const srvMobs = await page.evaluate(async () => {
  const P = mines.P,
    real = Object.getOwnPropertyDescriptor(Net, 'mobServer'),
    send = Net.sendParry,
    parries = [];
  Object.defineProperty(Net, 'mobServer', { get: () => true, configurable: true });
  Net.sendParry = id => parries.push(id);
  updateMobs(0.05); // the switch: this screen's own mobs go
  const cleared = [...mines.MOBS.values()].every(l => !l.length);
  const k = ckey(cOf(P.x) + 9, cOf(P.z) + 9),
    id = `${k}|100|shadow`;
  serverMob([id, P.x + 5, P.y, P.z, 0, 7, 8, 0]);
  const a = findMob(id),
    drawn = !!a && a.hp === 7 && a.g.parent === scene;
  serverMob([id, P.x + 4, P.y, P.z, 1, 7, 8, 0]);
  for (let i = 0; i < 20; i++) updateMobs(0.05);
  const moved = Math.abs(a.g.position.x - (P.x + 4)) < 0.05;
  hurtT = 0;
  const hp0 = mines.S.hp;
  serverMobHit({ id, dmg: 2, x: P.x + 1, z: P.z, kind: 'melee' });
  const hit = mines.S.hp < hp0;
  hurtT = 0;
  serverMobShot({ id, x: P.x + 3, y: P.y + 1.2, z: P.z, vx: -8, vy: 0, vz: 0, dmg: 1.8, c: 0x5fe8ff, s: 1.6 });
  const bolt = MOB_BOLTS.length > 0;
  for (let i = 0; i < 40 && MOB_BOLTS.length; i++) updateMobBolts(0.05);
  // the server's word stops: gone
  a.srv.t -= 5000;
  updateMobs(0.05);
  const gone = !findMob(id);
  Object.defineProperty(Net, 'mobServer', real);
  Net.sendParry = send;
  updateMobs(0.05); // and back to this screen's own mobs
  mines.S.hp = 10;
  return { cleared, drawn, moved, hit, bolt, gone };
});
if (Object.values(srvMobs).some(v => !v)) await fail('the game server runs the mobs: ' + JSON.stringify(srvMobs));
// your hearts on the game server: this screen shows the blows it's told of, a fall, the hearts it gives
// back, and asks it for a bed; the loot of a kill comes from it, not from this screen
const srvHp = await page.evaluate(async () => {
  const P = mines.P,
    S = mines.S,
    real = Object.getOwnPropertyDescriptor(Net, 'hpServer'),
    realLoot = Object.getOwnPropertyDescriptor(Net, 'lootServer'),
    heal = Net.sendHeal,
    asked = [],
    home = { x: P.x, y: P.y, z: P.z };
  Object.defineProperty(Net, 'hpServer', { get: () => true, configurable: true });
  Object.defineProperty(Net, 'lootServer', { get: () => true, configurable: true });
  Net.sendHeal = k => asked.push(k);
  S.hp = 10;
  serverHurt({ dmg: 3, hp: 7, x: P.x + 1, z: P.z, kind: 'melee', res: 'hit' });
  const shown = S.hp === 7;
  tickPlayerHealth(10); // no hearts back here: the server gives them
  const noRegen = S.hp === 7;
  serverHurt({ dmg: 9, hp: 0, x: P.x + 1, z: P.z, kind: 'melee', res: 'hit', dead: 1 });
  const fell = S.hp === 10 && Math.hypot(P.x - SPAWN.x - 0.5, P.z - SPAWN.z - 2.5) < 0.1;
  const inv0 = S.inv[101] || 0;
  lootMob('shadow'); // nothing asked of Supabase here
  const before = S.inv[101] || 0;
  const loot = { type: 'shadow', r: { ok: true, inv: { 101: inv0 + 1 }, item: 101 } };
  applyServer(loot.r);
  setInv(loot.r.inv, 'mob loot');
  showLoot(loot.type, loot.r);
  const paid = before === inv0 && (S.inv[101] || 0) === inv0 + 1;
  // hostile mobs turned off: a mob's blow is ignored, another player's still lands
  const regMobs = REG.mobs;
  REG.mobs = false;
  S.hp = 10;
  serverHurt({ dmg: 3, hp: 7, x: P.x + 1, z: P.z, kind: 'melee', res: 'hit' });
  hurtT = 0;
  serverHurt({ dmg: 2, hp: 8, x: P.x + 1, z: P.z, kind: 'pvp', res: 'hit', from: 'someone' });
  const noMobs = S.hp === 8 && !mobsHere();
  REG.mobs = regMobs;
  Object.defineProperty(Net, 'hpServer', real);
  Object.defineProperty(Net, 'lootServer', realLoot);
  Net.sendHeal = heal;
  S.hp = 10;
  Object.assign(P, home);
  hurtT = 0;
  return { shown, noRegen, fell, paid, noMobs };
});
if (Object.values(srvHp).some(v => !v)) await fail('your hearts on the game server: ' + JSON.stringify(srvHp));
// outfits: the plain ones are free for everyone, their variants are sold and come with details sewn on
const outfits = await page.evaluate(() => {
  const av = makeAvatar('T', COSMETICS[46].color, true);
  applyLook(av, { outfit: 46 }, true);
  const sewn = av.lookParts.length;
  applyLook(av, { outfit: 1 }, true);
  return { free: ownsCosmetic(1) && !forSale(COSMETICS[1]), sold: forSale(COSMETICS[46]) && !COSMETICS[46].free, sewn, plain: av.lookParts.length === 0 };
});
if (!outfits.free || !outfits.sold || !(outfits.sewn > 3) || !outfits.plain) await fail('outfits: ' + JSON.stringify(outfits));
// a plating traded away: the next read of the inventory takes it off your back
const tradedArmor = await page.evaluate(async () => {
  const S = mines.S,
    keep = { inv: { ...S.inv }, nfts: [...S.nfts], armor: S.armor, bar: [...S.bar], cos: S.cosmetics },
    on = Object.getOwnPropertyDescriptor(Net, 'online'),
    uid = Object.getOwnPropertyDescriptor(Net, 'userId'),
    li = Net.loadInventory,
    lc = Net.loadCosmetics;
  Object.defineProperty(Net, 'online', { get: () => true, configurable: true });
  Object.defineProperty(Net, 'userId', { get: () => 'test', configurable: true });
  let owned = [{ serial: 9902, item: 209, place: '', mined: 0, created_at: new Date().toISOString() }];
  Net.loadInventory = async () => ({ inv: [], uniques: owned });
  Net.loadCosmetics = async () => null;
  S.armor = '209';
  await syncInventory();
  const keptWhileOwned = S.armor === '209';
  owned = [];
  await syncInventory();
  const off = !S.armor;
  Net.loadInventory = li;
  Net.loadCosmetics = lc;
  Object.defineProperty(Net, 'online', on);
  Object.defineProperty(Net, 'userId', uid);
  Object.assign(S, { inv: keep.inv, nfts: keep.nfts, armor: keep.armor, bar: keep.bar, cosmetics: keep.cos });
  ui();
  return { keptWhileOwned, off };
});
if (!tradedArmor.keptWhileOwned || !tradedArmor.off) await fail('plating traded away: ' + JSON.stringify(tradedArmor));
// the Front-Runner Boots: worn from the chest, they show on your feet, make you faster, and Q dodges
const boots = await page.evaluate(async () => {
  const P = mines.P,
    S = mines.S,
    had = S.nfts.slice(),
    home = { x: P.x, y: P.y, z: P.z },
    was = mines.playing;
  mines.playing = true;
  if (!S.nfts.some(n => n.id === 211)) S.nfts.push({ id: 211, k: 'test-boots', serial: 1 });
  S.boots = null;
  ui();
  const offFirst = !bootsOn() && !SELF.boots[0].visible && $('tDash').hidden;
  const noDash = !dodge();
  S.boots = '211';
  ui();
  const worn = bootsOn() && SELF.boots.every(b => b.visible) && !$('tDash').hidden;
  dashCd = 0;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
  const dashed = dashT > 0 && hurtT > 0;
  const again = !dodge(); // recharging
  S.boots = null;
  S.nfts.length = 0;
  S.nfts.push(...had);
  ui();
  Object.assign(P, home);
  mines.playing = was;
  dashT = 0;
  hurtT = 0;
  return { offFirst, noDash, worn, dashed, again };
});
if (Object.values(boots).some(v => !v)) await fail('the Front-Runner Boots: ' + JSON.stringify(boots));
// claiming a plot: first see it — gold when free, red in a public zone or on someone else's — following you
const pick = await page.evaluate(() => {
  const P = mines.P,
    home = { x: P.x, y: P.y, z: P.z };
  startClaimPick();
  const shown = !!PICK.g && !$('claimBar').hidden;
  const publicZone = !PICK.ok && /public zone/.test($('claimTxt').textContent);
  P.x += 64;
  updatePosHud();
  const free = PICK.ok && /2 crystals/.test($('claimTxt').textContent),
    q = [PICK.qx, PICK.qz];
  CLAIMS.set(ckey(q[0], q[1]), { cx: q[0], cz: q[1], owner: 'someone', owner_name: 'Alice' });
  updatePosHud();
  const taken = !PICK.ok && /Alice/.test($('claimTxt').textContent);
  CLAIMS.delete(ckey(q[0], q[1]));
  clearClaimPick();
  const gone = !PICK.g && $('claimBar').hidden && !PICK.on;
  Object.assign(P, home);
  updatePosHud();
  return { shown, publicZone, free, taken, gone };
});
if (Object.values(pick).some(v => !v)) await fail('choosing a plot: ' + JSON.stringify(pick));
// the Front-Runner: shielded from outside its colosseum, blinks past you, calls two Sandwich Bots at half
// health, and its fall mints the boots (which make you faster)
const runner = await page.evaluate(async () => {
  const P = mines.P,
    tkey = ckey(cOf(P.x), cOf(P.z)),
    tkeep = mines.MOBS.get(tkey) || [],
    fr = mines.mkMob('front_runner', tkey, 170, P.x + 6, P.y, P.z, null);
  fr.arena = { x: P.x + 50, z: P.z, r: 15.5, y: P.y, reach: 28 };
  mines.MOBS.set(tkey, [...tkeep, fr]);
  damageMob(fr, 10, P.x, P.z);
  const shielded = Math.abs(fr.hp - (MK.front_runner.hp - 1.5)) < 0.01;
  fr.hp = MK.front_runner.hp;
  fr.arena = { x: P.x, z: P.z, r: 15.5, y: P.y, reach: 28 };
  const tg = { id: 'me', x: P.x, y: P.y, z: P.z, me: true };
  fr.blinkCd = 0;
  const before = fr.g.position.x - P.x;
  frontRun(fr, MK.front_runner, tg, 6, true, 0.1);
  const blinked = Math.sign(fr.g.position.x - P.x) !== Math.sign(before);
  damageMob(fr, 90, P.x, P.z);
  frontRun(fr, MK.front_runner, tg, 6, true, 0.1);
  const bots = mines.MOBS.get(tkey).filter(m => m.type === 'mev_bot').length;
  damageMob(fr, 999, P.x, P.z);
  await new Promise(r => setTimeout(r, 300));
  for (const m of mines.MOBS.get(tkey).filter(m => m.type === 'mev_bot')) scene.remove(m.g);
  mines.MOBS.set(tkey, tkeep);
  return { shielded, blinked, bots, frenzy: !!fr.frenzy, boots: mines.S.nfts.some(n => n.id === 211) };
});
if (!runner.shielded || !runner.blinked || runner.bots !== 2 || !runner.frenzy || !runner.boots) await fail('front-runner: ' + JSON.stringify(runner));
// guarding with a blade: a blow from in front just after the guard goes up is parried (no damage), later
// it's blocked (a quarter), a bolt from in front is deflected, a blow from behind lands in full; a mob
// reeling from a parry takes +50%
const guard = await page.evaluate(() => {
  const P = mines.P, S = mines.S, keep = S.bar[S.sel], wasPlaying = mines.playing;
  mines.playing = true; // guarding only counts while you're in the game
  S.bar[S.sel] = 107; // a Pure Ether Blade
  const fx = P.x - Math.sin(yaw) * 1.5, fz = P.z - Math.cos(yaw) * 1.5,
    bx = P.x + Math.sin(yaw) * 1.5, bz = P.z + Math.cos(yaw) * 1.5;
  S.armor = null;
  S.hp = 10;
  setGuard(true);
  updateGuard(0.05);
  const parry = hurtPlayer(8, fx, fz, 'melee') === 'parry' && S.hp === 10;
  guardT = 2;
  const block = hurtPlayer(8, fx, fz, 'melee') === 'block' && S.hp === 8;
  const bolt = hurtPlayer(3, fx, fz, 'bolt') === 'block' && S.hp === 8;
  const behind = hurtPlayer(3, bx, bz, 'melee') === undefined && S.hp === 5;
  const noStrike = attackMob({ hp: 5 }) === false;
  setGuard(false);
  updateGuard(1);
  const a = mines.mkMob('shadow', 'test-guard', 0, fx, P.y, fz, null);
  a.stunT = 1;
  damageMob(a, 4, P.x, P.z);
  const riposte = Math.abs(a.hp - (MK.shadow.hp - 6)) < 0.01;
  scene.remove(a.g);
  S.bar[S.sel] = keep;
  S.hp = 10;
  hurtT = 0;
  mines.playing = wasPlaying;
  return { parry, block, bolt, behind, noStrike, riposte, button: document.getElementById('tGuard').hidden };
});
if (Object.entries(guard).some(([k, v]) => k !== 'button' && !v)) await fail('guard and parry: ' + JSON.stringify(guard));
// hovercraft: on board you glide over water, putting it away steps you off; a friend's Twin Diamond shows
// under them and takes you in its back seat, behind them
const hover = await page.evaluate(() => {
  const P = mines.P, S = mines.S, keep = S.bar[S.sel], wasPlaying = mines.playing;
  mines.playing = true;
  S.nfts.push({ serial: 9901, id: 217, place: null, date: '', mined: 0 });
  S.bar[S.sel] = 'nft9901';
  const x = Math.floor(P.x), y = Math.floor(P.y), z = Math.floor(P.z);
  mines.commit(`${x},${y - 3},${z}`, 11, null);
  const sinksOnFoot = !collides(P.x, y - 3, P.z);
  mountHover();
  const riding = !!RIDE && RIDE.mesh.parent === scene;
  const glides = collides(P.x, y - 3, P.z);
  const lifted = rideLift() > 0.3;
  // up a steep slope at speed: a step every move, the eye never sinks into the hill
  // (a staircase of its own, with the air above each step cleared: whatever stands around the spawn)
  const home = { x: P.x, y: P.y, z: P.z }, was = new Map();
  const put = (cx, cy, cz, id) => {
    const k = `${cx},${cy},${cz}`;
    if (!was.has(k)) was.set(k, get(cx, cy, cz));
    mines.commit(k, id, null);
  };
  stepUp = 0;
  let maxLag = 0;
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(P.x) + 1, sy = Math.floor(P.y), sz = Math.floor(P.z);
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx <= 1; dx++) put(sx + dx, sy + dy, sz + dz, 0);
    put(sx, sy, sz, 3);
    P.on = true;
    moveAxis('x', 0.6);
    maxLag = Math.max(maxLag, stepUp);
  }
  const climbs = P.y > home.y + 4 && maxLag <= 0.6;
  if (!climbs) console.log('climb', P.y - home.y, maxLag);
  for (const [k, id] of [...was].reverse()) mines.commit(k, id, null);
  Object.assign(P, home);
  stepUp = 0;
  // a hard turn at speed: the old speed carries on sideways for a while (a drift), then fades
  const y0 = yaw;
  yaw = 0;
  RIDE.vx = 0;
  RIDE.vz = -13;
  yaw = -Math.PI / 2; // now facing east (+x), still sliding north
  let [vx1, vz1] = rideVelocity(13, 0, 0.05);
  const drifts = vz1 < -10 && vx1 > 0;
  for (let i = 0; i < 60; i++) [RIDE.vx, RIDE.vz] = rideVelocity(13, 0, 0.05);
  const grips = Math.abs(RIDE.vz) < 1.5 && RIDE.vx > 12;
  yaw = y0;
  S.bar[S.sel] = keep;
  updateRide(0.05);
  const offWhenPutAway = !RIDE;
  mines.commit(`${x},${y - 3},${z}`, 0, null);
  // another player on a Twin Diamond, right next to you
  const o = ensureOther({ id: 'hover-test', name: 'Friend', color: '#ff9ec7' });
  o.t = { id: 'hover-test', x: P.x + 1.5, y: P.y, z: P.z, yaw: 0, pitch: 0, rd: 213, on: 0 };
  o.tAt = performance.now();
  o.g.position.set(P.x + 1.5, P.y, P.z);
  o.g.rotation.y = 0;
  rideOther(o);
  const craft = !!o.craft && o.craft.userData.back > 0;
  const boarded = tryBoard({ id: 'hover-test', o }) && !!BOARD;
  boardTick();
  const behind = Math.abs(P.x - (o.g.position.x)) < 0.01 && Math.abs(P.z - (o.g.position.z + o.craft.userData.back)) < 0.01;
  unboard();
  const off = !BOARD;
  others.delete('hover-test');
  scene.remove(o.g);
  S.nfts = S.nfts.filter(n => n.serial !== 9901);
  mines.playing = wasPlaying;
  return { sinksOnFoot, riding, glides, lifted, climbs, drifts, grips, offWhenPutAway, craft, boarded, behind, off };
});
if (Object.values(hover).some(v => !v)) await fail('hovercraft: ' + JSON.stringify(hover));
// a plasma bolt fired by another player shows up here too (drawn only), and yours is sent to the others
const shots = await page.evaluate(() => {
  const P = mines.P, S = mines.S, keep = S.bar[S.sel], sent = [], real = Net.sendShot, wasPlaying = mines.playing;
  ghostShot({ id: 'someone-else', x: P.x + 5, y: P.y + 1.4, z: P.z, dx: 0, dy: 0, dz: -1 });
  const drawn = GHOST_BOLTS.length === 1 && GHOST_BOLTS[0].m.parent === scene;
  for (let i = 0; i < 40; i++) updateGhostBolts(0.05);
  const gone = GHOST_BOLTS.length === 0;
  mines.playing = true;
  Net.sendShot = p => sent.push(p);
  S.nfts.push({ serial: 9911, id: 206, place: null, date: '', mined: 0 });
  S.bar[S.sel] = 'nft9911';
  rangedT = 0;
  fireRanged();
  Net.sendShot = real;
  S.bar[S.sel] = keep;
  S.nfts = S.nfts.filter(n => n.serial !== 9911);
  mines.playing = wasPlaying;
  return { drawn, gone, sent: sent.length === 1 && Number.isFinite(sent[0].dx) };
});
if (Object.values(shots).some(v => !v)) await fail('plasma bolts shown to the others: ' + JSON.stringify(shots));
// daytime rest: by day a sky raider slips out of sight once you're far, a ruin guardian never does
// (validators keep their full guard), and the raider is back at night
const rest = await page.evaluate(() => {
  const P = mines.P, key = ckey(cOf(P.x), cOf(P.z)), keep = mines.MOBS.get(key) || [];
  const dz = 0;
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
const dayRule = await page.evaluate(() =>
  ['shadow', 'bat', 'sentinel', 'golem', 'wraith', 'garden_guardian', 'water_lurker'].every(t => restsByDay({ type: t })) &&
  ['guardian', 'crawler', 'warden', 'turret', 'corrupted_node', 'front_runner', 'plasma_core'].every(t => !restsByDay({ type: t })));
if (!dayRule) await fail('daytime rest: only the validators guards, the towers and the bosses stay by day');
// the full screen button: shown where the browser supports it, toggles full screen, lit while on
const fsShown = await page.evaluate(() => !document.getElementById('fsBtn').hidden);
const fsState = () => page.evaluate(() => ({ title: !document.getElementById('title').hidden, panel: !document.getElementById('panel').hidden, locked: !!document.pointerLockElement, noLock, fs: !!document.fullscreenElement, playing }));
const fsBefore = await fsState();
if (fsBefore.title || fsBefore.panel) await fail('full screen: a menu covers the game before the test: ' + JSON.stringify(fsBefore));
await page.click('#fsBtn');
await page.waitForTimeout(400);
const fsOn = await page.evaluate(() => !!document.fullscreenElement && document.getElementById('fsBtn').classList.contains('on'));
const fsMid = await fsState();
if (fsMid.title) await fail('full screen: entering it opened the pause menu: ' + JSON.stringify(fsMid));
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
    // what you wear, in the catalog (one of them may also be among the week's picks, depending on the week)
    worn = document.querySelectorAll('#pbody .shoprow.worn').length - document.querySelectorAll('#pbody .weekly .shoprow.worn').length;
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
// consumables (18-potions.js), in solo: each is spent once and does its thing; the ward fools an ordinary
// mob but not a guardian, and not a mob you've struck; the beacon needs a bed you slept in
const potions = await page.evaluate(async () => {
  const keep = { inv: { ...S.inv }, bar: [...S.bar], sel: S.sel, hp: S.hp, home: S.home };
  const hold = it => {
    S.inv[it] = (S.inv[it] || 0) + 1;
    S.bar[S.sel] = String(it);
  };
  S.hp = 4;
  hold(303);
  await useConsumable(303);
  const healed = S.hp === 9 && !S.inv[303];
  hold(304);
  await useConsumable(304);
  const fast = buffT >= 119;
  hold(305);
  await useConsumable(305);
  const vision = POTION.vision > 179;
  hold(306);
  await useConsumable(306);
  const shadow = { type: 'shadow' },
    guard = { type: 'guardian' };
  const ward = wardFools(shadow) && !wardFools(guard);
  shadow.provoked = 5;
  const provoked = !wardFools(shadow);
  // the beacon: refused (and kept) without a bed, then home to the bed you slept in
  delete S.home;
  hold(307);
  await useConsumable(307);
  const keptWithoutBed = S.inv[307] === 1;
  const bx = Math.floor(P.x) + 6,
    by = Math.floor(P.y),
    bz = Math.floor(P.z);
  mines.commit(`${bx},${by},${bz}`, 137, null);
  sleep({ x: bx, y: by, z: bz });
  P.x += 20;
  await useConsumable(307);
  const home = Math.abs(P.x - (bx + 0.5)) < 0.01 && Math.abs(P.z - (bz + 0.5)) < 0.01 && !S.inv[307];
  mines.commit(`${bx},${by},${bz}`, 0, null);
  POTION.vision = POTION.ward = 0;
  buffT = 0;
  Object.assign(S, keep);
  S.inv = keep.inv;
  return { healed, fast, vision, ward, provoked, keptWithoutBed, home };
});
if (Object.values(potions).some(v => !v)) await fail('consumables: ' + JSON.stringify(potions));
// PvP: holding the button on a player strikes once per click, and a hit does 40% of the weapon's
// mob damage (at least one heart), so a fight takes several blows
const pvp = (() => page.evaluate(() => {
  const sent = [],
    send = Net.sendHit;
  Net.sendHit = p => sent.push(p);
  pvpStruck = false;
  playerAtkT = 0;
  for (let i = 0; i < 60; i++) {
    tickWeapons(0.05);
    attackPlayer({ id: 'other' });
  } // 3 s with the button held
  const held = sent.length;
  pvpStruck = false; // released, then a new click
  playerAtkT = 0;
  attackPlayer({ id: 'other' });
  Net.sendHit = send;
  return { held, again: sent.length - held, blade: pvpDamage(107), genesis: pvpDamage(301), hand: pvpDamage(null) };
}))();
const pvpR = await pvp;
// a mob hunting you while you stand in the Atrium waits at its edge, still: it doesn't tremble in and out
const edge = await page.evaluate(() => {
  const P = mines.P,
    keep = { x: P.x, z: P.z },
    gy = P.y;
  P.x = SPAWN.x + 4.5;
  P.z = SPAWN.z + 0.5;
  const key = ckey(cOf(SPAWN.x + 8.6), cOf(SPAWN.z + 0.5)),
    m = mines.mkMob('corrupted_node', key, 990, SPAWN.x + 8.6, gy, SPAWN.z + 0.5, null),
    keepMobs = mines.MOBS.get(key) || [];
  mines.MOBS.set(key, [...keepMobs, m]);
  const xs = [];
  let inside = false;
  for (let i = 0; i < 60; i++) {
    updateMobs(0.05);
    xs.push(m.g.position.x);
    if (mobSafe(m.g.position.x, m.g.position.z)) inside = true;
  }
  const last = xs.slice(-30);
  mines.MOBS.set(key, keepMobs);
  scene.remove(m.g);
  P.x = keep.x;
  P.z = keep.z;
  return { inside, still: Math.max(...last) - Math.min(...last) < 0.02, moved: Math.abs(xs[0] - xs.at(-1)) > 0.3 || inside };
});
if (edge.inside || !edge.still || !edge.moved) await fail('mob at the Atrium edge: ' + JSON.stringify(edge));
// someone else's sign: read, with a Report button; Escape closes it
const reader = await page.evaluate(() => {
  openSignReader({ x: 0, y: 0, z: 0 }, 'Hello there', 'Satoshi');
  const el = document.getElementById('signRead'),
    shown = !el.hidden && /Satoshi/.test(el.textContent) && /Hello there/.test(el.textContent) && !!el.querySelector('[data-k=report]');
  dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return { shown, closed: el.hidden && !SIGN_EDIT.open };
});
if (!reader.shown || !reader.closed) await fail('sign reader: ' + JSON.stringify(reader));
// a killed mob stays dead for a while: reloading its chunk doesn't bring it straight back
const respawn = await page.evaluate(() => {
  const P = mines.P,
    k = ckey(cOf(P.x), cOf(P.z)),
    keep = mines.MOBS.get(k) || [],
    m = mines.mkMob('shadow', k, 991, P.x + 3, P.y, P.z, null);
  mines.MOBS.set(k, [...keep, m]);
  m.hp = 0;
  m.dying = 0.01;
  updateMobs(0.05);
  const gone = !mines.MOBS.get(k).includes(m);
  const again = mines.mkMob('shadow', k, 991, P.x + 3, P.y, P.z, null);
  mines.MOBS.get(k).push(again);
  pruneKilled(k);
  const stillDead = !mines.MOBS.get(k).includes(again);
  KILLED.set(k + '|991', performance.now() - 121000); // two minutes later
  const back = !recentlyKilled(k, 991, 'shadow');
  KILLED.delete(k + '|991');
  mines.MOBS.set(k, keep);
  return { gone, stillDead, back };
});
if (!respawn.gone || !respawn.stillDead || !respawn.back) await fail('respawn delay: ' + JSON.stringify(respawn));
// the shared world clock: a day lasts 8 minutes, two players asking at the same moment read the same
// hour, and solo keeps its own clock
const clock = await page.evaluate(() => {
  const t0 = Date.UTC(2026, 9, 20, 12),
    a = worldClock(t0),
    b = worldClock(t0 + 480000);
  return { same: a.day.toFixed(6) === b.day.toFixed(6), nextDay: b.n === a.n + 1, launch: worldClock(Date.UTC(2026, 9, 15)).day, solo: !sharedClock() };
});
if (!clock.same || !clock.nextDay || Math.abs(clock.launch - 0.3) > 1e-9 || !clock.solo) await fail('world clock: ' + JSON.stringify(clock));
// a single click after a pause strikes at once: the weapon recovers even while the button is up
const quick = await page.evaluate(() => {
  playerAtkT = 0;
  const mob = mines.mkMob('shadow', 'test-quick', 0, mines.P.x + 1.5, mines.P.y, mines.P.z, null);
  const first = attackMob(mob),
    tooSoon = attackMob(mob);
  tickWeapons(0.5); // half a second without touching the button
  const later = attackMob(mob);
  queueStrike(null);
  const kept = STRIKE.buf > 0;
  tickWeapons(0.5);
  return { first, tooSoon, later, kept, expired: STRIKE.buf === 0 };
});
if (!quick.first || quick.tooSoon || !quick.later || !quick.kept || !quick.expired) await fail('quick click: ' + JSON.stringify(quick));
if (pvpR.held !== 1 || pvpR.again !== 1 || pvpR.blade !== 2 || pvpR.genesis !== 3 || pvpR.hand !== 1) await fail('pvp: ' + JSON.stringify(pvpR));
// furniture and signs (19-signs.js), in solo: a chair turns to face you, a carpet is walked over, a
// sign you place opens its editor, the text is kept and drawn on the board
const furn = await page.evaluate(async () => {
  const keep = { inv: { ...S.inv }, bar: [...S.bar], sel: S.sel, yaw, pitch, signs: S.signs },
    x = Math.floor(P.x) + 2,
    z = Math.floor(P.z),
    y = Math.floor(P.y);
  const facing = [0, 1, 2, 3].every(f => Rules.placeIds(146)[f] === 146 + f && B[146 + f].o === f);
  const carpetPass = !isSolid(154) && isSolid(146);
  mines.commit(`${x},${y},${z}`, 160, { by: ME.id, name: ME.name, serial: 1 });
  openSignEditor({ x, y, z });
  const ed = document.getElementById('signEdit'),
    opened = !ed.hidden;
  ed.querySelector('input').value = '  Hello   neighbours ';
  ed.querySelector('[data-k=ok]').click();
  await new Promise(r => setTimeout(r, 50));
  const k = `${x},${y},${z}`,
    saved = SIGNS.get(k) === 'Hello neighbours' && S.signs[k] === 'Hello neighbours' && ed.hidden;
  updateSigns(1);
  const drawn = SIGN_MESH.has(k) && SIGN_MESH.get(k).g.children.length === 2;
  mines.commit(k, 0, null);
  updateSigns(1);
  const gone = !SIGN_MESH.has(k);
  SIGNS.delete(k);
  Object.assign(S, { inv: keep.inv, bar: keep.bar, sel: keep.sel, signs: keep.signs });
  return { facing, carpetPass, opened, saved, drawn, gone };
});
if (Object.values(furn).some(v => !v)) await fail('furniture and signs: ' + JSON.stringify(furn));
// shared combat (16-mobs.js): a blow is told to the players nearby, a remote blow costs the same hp
// here, a mob dies for everyone but pays only whoever took part, and a mob goes after whoever is closest
const shared = await page.evaluate(() => {
  const P = mines.P,
    key = ckey(cOf(P.x), cOf(P.z)),
    keep = mines.MOBS.get(key) || [],
    sent = [],
    looted = [],
    send = Net.sendMob,
    loot = window.lootMob;
  Net.sendMob = m => sent.push(m);
  lootMob = t => looted.push(t);
  const a = mines.mkMob('shadow', key, 777, P.x + 3, P.y, P.z, null),
    b = mines.mkMob('shadow', key, 778, P.x - 3, P.y, P.z, null);
  mines.MOBS.set(key, [...keep, a, b]);
  // my blow: told to the others with the mob's id and hp left
  damageMob(a, 4, P.x, P.z);
  const told = sent.length === 1 && sent[0].id === mobId(a) && sent[0].hp === a.hp && a.hp === MK.shadow.hp - 4;
  // their blow: same damage here; a late screen (full health) catches up on their hp
  remoteMobHit({ id: mobId(a), dmg: 3, hp: a.hp - 3, x: a.g.position.x, y: a.g.position.y, z: a.g.position.z, fx: P.x, fz: P.z });
  const remote = a.hp === MK.shadow.hp - 7;
  remoteMobHit({ id: mobId(b), dmg: 2, hp: 1, x: b.g.position.x, y: b.g.position.y, z: b.g.position.z, fx: P.x, fz: P.z });
  const caughtUp = b.hp === 1;
  // b dies by their hand only: no loot for me; a dies after my blow: my own loot
  remoteMobHit({ id: mobId(b), dmg: 5, hp: 0, x: b.g.position.x, y: b.g.position.y, z: b.g.position.z, fx: P.x, fz: P.z });
  remoteMobHit({ id: mobId(a), dmg: 99, hp: 0, x: a.g.position.x, y: a.g.position.y, z: a.g.position.z, fx: P.x, fz: P.z });
  const deaths = a.dying > 0 && b.dying > 0,
    lootMine = looted.length === 1;
  // targeting: another player closer to the mob than you gets chased, and you're not bitten
  const c = mines.mkMob('shadow', key, 779, P.x + 6, P.y, P.z, null);
  mines.MOBS.set(key, [...keep, c]);
  const o = ensureOther({ id: 'buddy', name: 'Buddy', color: '#ff9ab8' });
  o.t = { x: P.x + 7, y: P.y, z: P.z, yaw: 0, pitch: 0 };
  o.tAt = performance.now();
  o.g.position.set(P.x + 7, P.y, P.z);
  o.g.visible = true;
  const theirs = mobTarget(c, c.g.position);
  o.g.position.set(P.x + 20, P.y, P.z);
  const mine = mobTarget(c, c.g.position);
  removeOther('buddy');
  mines.MOBS.set(key, keep);
  for (const m of [a, b, c]) scene.remove(m.g);
  Net.sendMob = send;
  lootMob = loot;
  return { told, remote, caughtUp, deaths, lootMine, chasesThem: theirs && !theirs.me, chasesMe: mine && mine.me };
});
if (Object.values(shared).some(v => !v)) await fail('shared combat: ' + JSON.stringify(shared));
// automatic quality (10-loop.js): 5 s under 40 frames a second while playing lowers one setting, the
// sharpness first, then the shadows; a pause or an open chest doesn't count; off in the browser tests
const autoq = await page.evaluate(() => {
  const keep = { ...REG },
    wd = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver'),
    wasPlaying = playing;
  const off = (autoQuality(0.2), REG.sharpness === keep.sharpness); // webdriver: never touches anything
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  Object.assign(REG, { autoQuality: true, sharpness: 2, shadows: true, view: 5, glow: true });
  playing = true;
  AUTOQ.t = AUTOQ.n = AUTOQ.cool = 0;
  for (let i = 0; i < 30; i++) autoQuality(0.2); // 6 s at 5 frames a second
  const glowFirst = !CLAY || (REG.glow === false && REG.sharpness === 2); // the clay look's glow goes first
  REG.glow = false;
  AUTOQ.cool = 0;
  for (let i = 0; i < 30; i++) autoQuality(0.2);
  const first = REG.sharpness === 1.5 && REG.shadows === true;
  AUTOQ.cool = 0;
  REG.sharpness = 1;
  for (let i = 0; i < 30; i++) autoQuality(0.2);
  const second = REG.shadows === false;
  const view0 = REG.view;
  AUTOQ.cool = 0;
  for (let i = 0; i < 30; i++) autoQuality(1 / 60); // smooth: nothing changes
  const smooth = REG.view === view0;
  delete navigator.webdriver;
  if (wd) Object.defineProperty(Navigator.prototype, 'webdriver', wd);
  playing = wasPlaying;
  Object.assign(REG, keep);
  saveSettings();
  for (const k of ['sharpness', 'shadows', 'view']) applySetting(k);
  return { off, glowFirst, first, second, smooth };
});
if (Object.values(autoq).some(v => !v)) await fail('auto quality: ' + JSON.stringify(autoq));
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
  const subtitle = (document.querySelector('#cine .sub')?.getAttribute('aria-label') || '').includes(EPILOGUE.thea[0].slice(0, 20));
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
    tickWeapons(1);
    mines.attackMob(mob);
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
