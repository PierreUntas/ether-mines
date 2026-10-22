// Ether Mines · exports the models of the items you hold (clayModel in src/game/04-render.js: the pickaxes,
// the blades, the Plasma Pistol, the platings, the potions...) to unity/Assets/Resources/held.json, read
// by the Unity client (HeldItem.cs). The game itself builds them: the page is opened in a headless
// browser (solo mode, as tests/navigateur.mjs does) and every mesh of every model is written out as
// triangles, in the model's own space, with its material's color and glow. An item with no clay model is
// drawn from its icon's pixels (the client does that itself: "voxel" gives the icon's tile). Blocks are
// meshed by the client from the rules (Mesher.cs), as the game does.
// Setup once: npm i --no-save playwright@1.56.0 three@0.128.0
// Run after changing a held model or an item:  node unity/tools/export-held.mjs   (--check: fail if stale)
//
// Format: items.<id> = { upright: 1 (held standing in the palm), parts: [{ c: "#rrggbb", e: "#rrggbb" glow
// color, b: 1 for an unlit (basic) material, o: its opacity when see-through, v: [x, y, z, ...] triangles, n: [nx, ny, nz, ...] one normal
// per triangle (the models are faceted) }] } or
// { voxel: tile }; hovers.<id> = { seat, back, parts }: a Diamond Glider (20-hover.js buildHover) at its
// own scale, its hull centered on the driver's seat. Game coordinates (right-handed, -z away from you): the client mirrors z.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/three.min.js', r => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', r => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/^https:\/\/fonts\./, r => r.abort());
await page.goto(base + 'index.html');
await page.waitForFunction(() => typeof clayModel === 'function' && typeof ITEM === 'object', null, { timeout: 60000 });
const { out: items, hovers } = await page.evaluate(() => {
  const r4 = v => Math.round(v * 1e3) / 1e3;
  const hex = c => '#' + c.getHexString();
  // every mesh of a model, as triangles in its root's space, one part per material look
  function partsOf(m) {
    m.updateMatrixWorld(true);
    const parts = new Map(); // one part per material look
    m.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry,
        pos = g.attributes.position,
        mats = Array.isArray(o.material) ? o.material : [o.material],
        groups = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }],
        nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld),
        v = new THREE.Vector3(),
        a = new THREE.Vector3(),
        b = new THREE.Vector3();
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0];
        const basic = mat.type === 'MeshBasicMaterial',
          c = hex(mat.color),
          e = !basic && mat.emissive ? hex(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity ?? 1)) : '#000000',
          op = mat.transparent && mat.opacity < 1 ? r4(mat.opacity) : 1,
          key = c + e + basic + op;
        if (!parts.has(key)) parts.set(key, { c, e, b: basic ? 1 : 0, ...(op < 1 ? { o: op } : {}), v: [], n: [] });
        const p = parts.get(key);
        for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
          // flat normals from the triangle itself, whatever the geometry says (the clay models are faceted)
          const t = [0, 1, 2].map(k => v.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld).clone());
          a.subVectors(t[1], t[0]);
          b.subVectors(t[2], t[0]);
          const n = a.cross(b).normalize();
          if (!Number.isFinite(n.x)) continue;
          for (const q of t) p.v.push(r4(q.x), r4(q.y), r4(q.z));
          p.n.push(r4(n.x), r4(n.y), r4(n.z));
        }
      }
    });
    return [...parts.values()].filter(p => p.v.length);
  }
  const out = {};
  for (const id of Object.keys(ITEM).map(Number).sort((a, b) => a - b)) {
    if (B[id]) continue;
    const m = clayModel(id);
    if (!m) {
      out[id] = { voxel: ITEM[id].icon };
      continue;
    }
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    out[id] = { ...(m.userData.upright ? { upright: 1 } : {}), parts: partsOf(m) };
  }
  // the Diamond Gliders (20-hover.js buildHover): the craft at its scale, its hull centered on the driver's
  // seat; seat: the seat's height above the craft's origin, back: the back seat's z (null for none)
  const hovers = {};
  for (const id of Object.keys(ITEM).map(Number).sort((a, b) => a - b)) {
    if (!ITEM[id].hover) continue;
    const root = buildHover(id);
    hovers[id] = { seat: r4(root.userData.seat), back: root.userData.back === null ? null : r4(root.userData.back), parts: partsOf(root) };
  }
  return { out, hovers };
});
await browser.close();
server.close();
if (errors.length) throw new Error('export-held: the page failed: ' + errors.join('; '));
const text =
  '{"_format":"see unity/tools/export-held.mjs; generated, do not edit","items":{\n' +
  Object.entries(items)
    .map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v))
    .join(',\n') +
  '\n},"hovers":{\n' +
  Object.entries(hovers)
    .map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v))
    .join(',\n') +
  '\n}}\n';
const file = new URL('../Assets/Resources/held.json', import.meta.url);
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(file, 'utf8');
  } catch {}
  if (now !== text) throw new Error('export-held: unity/Assets/Resources/held.json is out of date: run node unity/tools/export-held.mjs');
  console.log('held.json up to date');
} else {
  await writeFile(file, text);
  const n = Object.values(items);
  console.log(`held.json: ${n.length} items, ${n.filter(x => x.parts).length} clay models, ${(text.length / 1024).toFixed(0)} KB`);
}
