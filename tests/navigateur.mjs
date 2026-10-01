// Test de fumée dans un vrai navigateur, en mode solo (sans Supabase) :
// la page se charge sans erreur, on entre dans le monde, on mine un bloc, on fabrique des planches.
// Usage : npm i --no-save playwright three@0.128.0 && npx playwright install chromium && node tests/navigateur.mjs
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
// petit serveur statique : les travailleurs (maillage en arrière-plan) ne démarrent pas depuis file://
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
page.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /maillage/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('ether-mines:profil', JSON.stringify({ id: 'test', name: 'Testeur', color: '#8a7bef' })));
await page.route('**/three.min.js', (r) => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', (r) => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/^https:\/\/fonts\./, (r) => r.abort());
const fail = async (msg) => { console.error('ÉCHEC :', msg, errors); await browser.close(); server.close(); process.exit(1); };

await page.goto(base + 'index.html#debug');
await page.waitForTimeout(800);
if (errors.length) await fail('erreur au chargement de la page');
await page.evaluate(() => document.getElementById('play').click());
await page.waitForFunction(() => document.getElementById('title').hidden, null, { timeout: 240000 });
const y = await page.evaluate(() => { for (let y = 63; y > 0; y--) { const v = mines.get(20, y, 20); if (v && ![5, 6, 7, 17, 18, 19, 20].includes(v)) return y; } });
await page.evaluate((y) => mines.breakBlock({ x: 20, y, z: 20, id: mines.get(20, y, 20) }), y);
await page.evaluate(() => { mines.give(5, 1, 'test'); mines.craft({ out: 9, n: 4, need: { 5: 1 } }); });
await page.waitForTimeout(500);
const res = await page.evaluate((y) => ({ bloc: mines.get(20, y, 20), inv: mines.S.inv }), y);
if (res.bloc !== 0) await fail('le bloc miné est toujours là');
if (res.inv[9] !== 4) await fail('les planches n\'ont pas été fabriquées : ' + JSON.stringify(res.inv));
if (errors.length) await fail('erreurs pendant la partie');
// blocs de forme : une plaque de pression sur laquelle on marche, un escalier, un câble
const plaque = await page.evaluate(() => {
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
await page.evaluate(({ x, y, z }) => { const P = mines.P; P.x = x + 0.5; P.z = z + 0.5; P.y = y + 0.1; }, plaque);
await page.waitForTimeout(1200);
const vivant = await Promise.race([page.evaluate(() => performance.now()), new Promise(r => setTimeout(() => r(null), 5000))]);
if (vivant === null) await fail('le jeu ne répond plus après avoir marché sur une plaque de pression');
if (errors.length) await fail('erreurs avec les blocs de forme');
// malle : déposer puis reprendre des planches
const malle = await page.evaluate(async () => {
  const P = mines.P, x = Math.floor(P.x) - 3, z = Math.floor(P.z) + 2;
  let y = 63; while (y > 0 && !mines.get(x, y, z)) y--;
  mines.commit(`${x},${y + 1},${z}`, 98, null);
  await mines.ouvrirMalle({ x, y: y + 1, z, id: 98 });
  await mines.deplacerMalle('9', 3);
  const dedans = mines.S.malles?.[`${x},${y + 1},${z}`]?.[9];
  await mines.deplacerMalle('9', -1);
  return { dedans, sac: mines.S.inv[9], onglet: !!document.querySelector('.grid.malle') };
});
if (malle.dedans !== 3 || malle.sac !== 2 || !malle.onglet) await fail('malle : ' + JSON.stringify(malle));
await page.screenshot({ path: process.env.CAPTURE_MALLE || '/dev/null' }).catch(() => {});
await page.evaluate(() => document.getElementById('closeP').click());
// portes logiques : un ET entre deux leviers allume une lampe seulement quand les deux sont levés
const circuit = async (levier2) =>
  page.evaluate(async (l2) => {
    const Y = 47, y = Y + 1, c = (x, yy, z, id) => mines.commit(x + ',' + yy + ',' + z, id, null);
    for (let x = 16; x <= 22; x++) for (let z = 2; z <= 6; z++) c(x, Y, z, 80);
    c(16, y, 5, 65); c(17, y, 5, 67); c(18, y, 5, 112); c(19, y, 5, 67); c(20, y, 5, l2); c(18, y, 4, 67); c(18, y, 3, 68);
    await new Promise(r => setTimeout(r, 2500));
    return mines.POWERED.has('18,' + y + ',3');
  }, levier2);
const [eteinte, allumee] = [await circuit(64), await circuit(65)];
if (eteinte || !allumee) await fail(`porte ET : lampe ${eteinte} avec un levier, ${allumee} avec deux`);
const m = await page.evaluate(() => ({ actif: mines.mailleur, n: mines.nbMaillages }));
if (!m.actif) await fail('le maillage en arrière-plan ne s\'est pas lancé');
if (m.n < 20) await fail('trop peu de tronçons affichés : ' + m.n);
console.log(`Navigateur : chargement, entrée dans le monde, minage et fabrication sans erreur ; ${m.n} tronçons maillés en arrière-plan.`);
await browser.close();
server.close();
