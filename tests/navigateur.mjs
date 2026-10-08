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
const y = await page.evaluate(() => { for (let y = 63; y > 0; y--) { const v = mines.get(20, y, 20); if (v && ![5, 6, 7, 17, 18, 19, 20].includes(v)) return y; } });
await page.evaluate((y) => mines.breakBlock({ x: 20, y, z: 20, id: mines.get(20, y, 20) }), y);
await page.evaluate(() => { mines.give(5, 1, 'test'); mines.craft({ out: 9, n: 4, need: { 5: 1 } }); });
await page.waitForTimeout(500);
const res = await page.evaluate((y) => ({ block: mines.get(20, y, 20), inv: mines.S.inv }), y);
if (res.block !== 0) await fail('the mined block is still there');
if (res.inv[9] !== 4) await fail('the planks were not crafted: ' + JSON.stringify(res.inv));
if (errors.length) await fail('errors during play');
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
  const t0 = performance.now();
  let l = [];
  while (performance.now() - t0 < 30000) {
    l = [...ANIMALS.values()].flat();
    if (l.some(a => a.type === 'shiba') && l.some(a => a.h?.name === 'Solène')) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const s = l.find(a => a.h?.name === 'Solène');
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
console.log(`Browser: loaded, entered the world, mined and crafted with no error; ${m.n} chunks meshed in the background.`);
await browser.close();
server.close();
