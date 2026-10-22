// Exports the web game's procedural textures for Unity, so both versions share the very same art:
// the clay atlas (world blocks), its emissive map, the water texture, and the crisp 16 px atlas (icons).
// Saved as .bytes (PNG data): Unity loads them as TextAssets and decodes them itself, so no import settings
// (compression, mipmaps) can blur or bleed the atlas. Run from the repository root after changing src/game/01-textures.js:
//   node unity/tools/export-art.mjs        (needs playwright and three@0.128.0, as tools/capture.mjs)
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = process.cwd(),
  out = join(root, 'unity/Assets/Resources/Art');
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const b = await readFile(join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
await page.route('**/three.min.js', r => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', r => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/^https:\/\/fonts\./, r => r.abort());
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForFunction(() => typeof atlasTex !== 'undefined' && atlasTex.image && atlasTex.image.width === 1024, null, { timeout: 60000 });
const png = await page.evaluate(() => ({
  'atlas-clay.png': atlasTex.image.toDataURL('image/png'),
  'emissive-clay.png': emisTex.image.toDataURL('image/png'),
  'water.png': waterC.toDataURL('image/png'),
  'atlas-pixel.png': atlas.toDataURL('image/png'),
  'emissive-pixel.png': emis.toDataURL('image/png'),
}));
// every block's and item's icon (04-render.js icon(): the isometric cube, or the item's own drawing), 48 px,
// on one sheet of 16 columns; icons-index.json says which cell holds which id
const icons = await page.evaluate(() => {
  const ids = [...Object.keys(B), ...Object.keys(ITEM)].map(Number).filter(id => (B[id] && B[id].t) || B[id]?.x != null || B[id]?.icon != null || ITEM[id]);
  const cols = 16,
    rows = Math.ceil(ids.length / cols),
    c = document.createElement('canvas');
  c.width = cols * 48;
  c.height = rows * 48;
  const g = c.getContext('2d'),
    index = {};
  ids.forEach((id, i) => {
    g.drawImage(icon(id), (i % cols) * 48, Math.floor(i / cols) * 48);
    index[id] = i;
  });
  return { url: c.toDataURL('image/png'), index: JSON.stringify({ size: 48, cols, index }) };
});
png['icons.png'] = icons.url;
await writeFile(join(out, 'icons-index.json'), icons.index + '\n');
console.log('unity/Assets/Resources/Art/icons-index.json');
for (const [name, url] of Object.entries(png)) {
  await writeFile(join(out, name.replace('.png', '.bytes')), Buffer.from(url.split(',')[1], 'base64'));
  console.log('unity/Assets/Resources/Art/' + name.replace('.png', '.bytes'));
}
await browser.close();
server.close();
