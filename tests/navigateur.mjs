// Test de fumée dans un vrai navigateur, en mode solo (sans Supabase) :
// la page se charge sans erreur, on entre dans le monde, on mine un bloc, on fabrique des planches.
// Usage : npm i --no-save playwright three@0.128.0 && npx playwright install chromium && node tests/navigateur.mjs
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-proxy-server'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.setItem('ether-mines:profil', JSON.stringify({ id: 'test', name: 'Testeur', color: '#8a7bef' })));
await page.route('**/three.min.js', (r) => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', (r) => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/^https:\/\/fonts\./, (r) => r.abort());
const fail = async (msg) => { console.error('ÉCHEC :', msg, errors); await browser.close(); process.exit(1); };

await page.goto('file://' + root + 'index.html#debug');
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
console.log('Navigateur : chargement, entrée dans le monde, minage et fabrication sans erreur.');
await browser.close();
