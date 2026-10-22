// Ether Mines · exports what the shop's cosmetics look like on a character (src/game/17-looks.js: buildHead,
// buildBack, buildCompanion, buildOutfit) to unity/Assets/Resources/looks.json, read by the Unity client
// (Looks.cs). The game itself builds them, in a headless browser (solo mode, as tests/navigateur.mjs does):
// every mesh written out as triangles in the frame of the avatar part it hangs on, with its material's
// color and glow. Their small animations (a flag, a cape, wings) are left out; the client bobs companions.
// Setup once: npm i --no-save playwright@1.56.0 three@0.128.0
// Run after changing a look or adding a cosmetic:  node unity/tools/export-looks.mjs   (--check: fail if stale)
//
// Format: head.<id>, back.<id>, companion.<id>: [mesh]; outfit.<id>: { color, pants, on: { body | arm0 |
// arm1 | leg0 | leg1 | head: [mesh] } }; trail.<id>: style. A mesh: { c: "#rrggbb", e: "#rrggbb" glow,
// b: 1 unlit, v: [x, y, z, ...] triangles, n: [nx, ny, nz, ...] one per triangle }. Frames: a head piece
// around the head's center; a back piece in the avatar's upper frame (the clay avatar's body group, 0.2
// below its root); a companion around its own center (it follows its owner); an outfit piece in its
// part's own frame (the clay avatar's body, arms, legs: makeAvatar); armor.<item>, boots.211, cape.205:
// { body | arm0 | arm1 | leg0 | leg1 | head | up | root: [mesh] }, what a plating, the Front-Runner Boots
// or the Titan's cape adds, by the part it hangs on (up: the avatar's upper frame). Game coordinates (right-handed, the
// face looks toward -z): the client mirrors z.
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
await page.waitForFunction(() => typeof buildHead === 'function' && typeof makeAvatar === 'function' && typeof COSMETICS === 'object', null, { timeout: 60000 });
const looks = await page.evaluate(() => {
  const r4 = v => Math.round(v * 1e3) / 1e3;
  const hex = c => '#' + c.getHexString();
  // every mesh under `root`, as triangles in `frame`'s own space
  function meshes(root, frame) {
    frame.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(),
      parts = new Map();
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry,
        pos = g.attributes.position,
        m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld),
        mats = Array.isArray(o.material) ? o.material : [o.material],
        groups = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }],
        v = new THREE.Vector3(),
        a = new THREE.Vector3(),
        b = new THREE.Vector3();
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0],
          basic = mat.type === 'MeshBasicMaterial',
          c = hex(mat.color),
          e = !basic && mat.emissive ? hex(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity ?? 1)) : '#000000',
          key = c + e + basic;
        if (!parts.has(key)) parts.set(key, { c, e, b: basic ? 1 : 0, v: [], n: [] });
        const p = parts.get(key);
        for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
          const t = [0, 1, 2].map(k => v.fromBufferAttribute(pos, i + k).applyMatrix4(m).clone());
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
  const out = { head: {}, back: {}, companion: {}, outfit: {}, trail: {} };
  const ids = Object.keys(COSMETICS).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const c = COSMETICS[id];
    if (c.slot === 'head') out.head[id] = meshes(buildHead(c, []), new THREE.Group());
    else if (c.slot === 'back') out.back[id] = meshes(buildBack(c, []), new THREE.Group());
    else if (c.slot === 'companion') out.companion[id] = meshes(buildCompanion(c, []), new THREE.Group());
    else if (c.slot === 'trail') out.trail[id] = c.style;
    else if (c.slot === 'outfit') {
      const av = makeAvatar('x', c.color, true),
        o = { color: c.color, pants: '#' + new THREE.Color(c.pants ?? DEFAULT_PANTS).getHexString(), on: {} };
      if (c.detail) {
        const parts = buildOutfit(av, c.detail),
          frames = { body: av.body, arm0: av.arms[0], arm1: av.arms[1], leg0: av.legs[0], leg1: av.legs[1], head: av.head };
        for (const [name, f] of Object.entries(frames)) {
          const mine = parts.filter(p => p.parent === f);
          if (!mine.length) continue;
          const holder = new THREE.Group();
          // measured in the part's frame: the pieces are moved under a stand-in at the part's place
          f.updateMatrixWorld(true);
          holder.matrixAutoUpdate = false;
          holder.matrix.copy(f.matrixWorld);
          for (const p of mine) holder.add(p.clone());
          holder.updateMatrixWorld(true);
          const frame = new THREE.Group();
          frame.matrixAutoUpdate = false;
          frame.matrix.copy(f.matrixWorld);
          o.on[name] = meshes(holder, frame);
        }
      }
      out.outfit[id] = o;
    }
  }
  // the platings, the Front-Runner Boots and the Titan's cape (14-startup.js updateArmorVisual,
  // updateBootsVisual, updateCapeVisual): what each makes appear on a fresh avatar, by the part it hangs on
  function worn(dress) {
    const av = makeAvatar('x', '#8a7bef', true),
      seen = new Set(),
      shown = o => {
        for (let q = o; q; q = q.parent) if (!q.visible) return false;
        return true;
      };
    av.g.traverse(o => o.isMesh && shown(o) && seen.add(o));
    dress(av);
    av.g.updateMatrixWorld(true);
    const frames = { body: av.body, arm0: av.arms[0], arm1: av.arms[1], leg0: av.legs[0], leg1: av.legs[1], head: av.head, up: av.body.parent, root: av.g },
      byFrame = {};
    av.g.traverse(o => {
      if (!o.isMesh || seen.has(o) || !shown(o)) return; // new, and visible all the way up
      let f = o.parent;
      while (f && !Object.values(frames).includes(f)) f = f.parent;
      const name = Object.keys(frames).find(k => frames[k] === f) || 'root';
      (byFrame[name] ||= []).push(o);
    });
    const res = {};
    for (const [name, list] of Object.entries(byFrame)) {
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(frames[name].matrixWorld);
      for (const o of list) {
        const c = o.clone();
        c.matrixAutoUpdate = false;
        c.matrix.copy(new THREE.Matrix4().copy(frames[name].matrixWorld).invert().multiply(o.matrixWorld));
        holder.add(c);
      }
      holder.updateMatrixWorld(true);
      const frame = new THREE.Group();
      frame.matrixAutoUpdate = false;
      frame.matrix.copy(frames[name].matrixWorld);
      res[name] = meshes(holder, frame);
    }
    return res;
  }
  out.armor = {};
  for (const id of Object.keys(ITEM).map(Number).sort((a, b) => a - b)) if (ITEM[id].armor) out.armor[id] = worn(av => updateArmorVisual(av, id, null));
  out.boots = { 211: worn(av => updateBootsVisual(av, true)) };
  out.cape = { 205: worn(av => (av.cape.visible = true)) };
  return out;
});
await browser.close();
server.close();
if (errors.length) throw new Error('export-looks: the page failed: ' + errors.join('; '));
const lines = [];
for (const [slot, m] of Object.entries(looks)) lines.push(JSON.stringify(slot) + ':{\n' + Object.entries(m).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}');
const text = '{"_format":"see unity/tools/export-looks.mjs; generated, do not edit",\n' + lines.join(',\n') + '}\n';
const file = new URL('../Assets/Resources/looks.json', import.meta.url);
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(file, 'utf8');
  } catch {}
  if (now !== text) throw new Error('export-looks: unity/Assets/Resources/looks.json is out of date: run node unity/tools/export-looks.mjs');
  console.log('looks.json up to date');
} else {
  await writeFile(file, text);
  console.log(`looks.json: ${Object.entries(looks).map(([k, v]) => Object.keys(v).length + ' ' + k).join(', ')}, ${(text.length / 1024).toFixed(0)} KB`);
}
