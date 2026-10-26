// Ether Mines · exports what the shop's cosmetics look like on a character (src/game/17-looks.js: buildHead,
// buildBack, buildCompanion, buildOutfit) to unity/Assets/Resources/looks.json, read by the Unity client
// (Looks.cs). The game itself builds them, in a headless browser (solo mode, as tests/navigateur.mjs does):
// every mesh written out as triangles in the frame of the avatar part it hangs on, with its material's
// color and glow. Their small animations (a halo turning, a flag, a cape, wings, a companion bobbing) are
// measured by running them: each moving part is written apart, with a fitted curve for each of its channels.
// Setup once: npm i --no-save playwright@1.56.0 three@0.128.0
// Run after changing a look or adding a cosmetic:  node unity/tools/export-looks.mjs   (--check: fail if stale)
//
// Format: head.<id>, face.<id> (a beard: on the head too), back.<id>, companion.<id>: [mesh]; outfit.<id>: { color, pants, on: { body | arm0 |
// arm1 | leg0 | leg1 | head: [mesh] } }; trail.<id>: style; anim."<slot>.<id>": [{ pp, pq, ps: the moving
// part's parent frame in the piece (position, quaternion x y z w, scale), ch: 9 channels (position x y z,
// rotation x y z in Three's XYZ order, scale x y z), each [a, l, s, c, w]: a + l t + s sin(w t) + c cos(w t)
// with t in seconds, parts: [mesh] in the moving part's own frame } ] (not in the piece's own meshes). A mesh: { c: "#rrggbb", e: "#rrggbb" glow,
// b: 1 unlit, v: [x, y, z, ...] triangles, n: [nx, ny, nz, ...] one per triangle }. Frames: a head piece
// around the head's center; a back piece in the avatar's upper frame (the clay avatar's body group, 0.2
// below its root); a companion around its own center (it follows its owner); an outfit piece in its
// part's own frame (the clay avatar's body, arms, legs: makeAvatar); armor.<item>, boots.211, cape.205:
// { body | arm0 | arm1 | leg0 | leg1 | head | up | root: [mesh] }, what a plating, the Front-Runner Boots
// or the Titan's cape adds (helm.<item>, gloves.<item>, legs.<item>, amulet.<item> the same, 24-gear.js), by the part it hangs on (up: the avatar's upper frame). Game coordinates (right-handed, the
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
    const body = await readFile(join(root, p === '/' ? 'play.html' : p));
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
await page.goto(base + 'play.html');
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
  // ---------- the small animations ----------
  // least squares: the coefficients of columns cols (functions of t) that best give vs
  function lsq(ts, vs, cols) {
    const k = cols.length,
      A = Array.from({ length: k }, () => new Array(k).fill(0)),
      y = new Array(k).fill(0);
    ts.forEach((t, i) => {
      const r = cols.map(f => f(t));
      for (let a = 0; a < k; a++) {
        y[a] += r[a] * vs[i];
        for (let b = 0; b < k; b++) A[a][b] += r[a] * r[b];
      }
    });
    for (let c = 0; c < k; c++) {
      let p = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      [y[c], y[p]] = [y[p], y[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let q = c; q < k; q++) A[r][q] -= f * A[c][q];
        y[r] -= f * y[c];
      }
    }
    const x = y.map((v, i) => v / A[i][i]),
      err = ts.reduce((e, t, i) => e + (cols.reduce((s, f, j) => s + x[j] * f(t), 0) - vs[i]) ** 2, 0) / ts.length;
    return { x, err };
  }
  const r5 = v => Math.round(v * 1e5) / 1e5;
  // a channel's curve: constant, a steady turn, or a swing (a + s sin wt + c cos wt)
  function fit(ts, vs) {
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    if (vs.every(v => Math.abs(v - mean) < 1e-7)) return [r5(mean), 0, 0, 0, 0];
    const lin = lsq(ts, vs, [() => 1, t => t]);
    if (lin && lin.err < 1e-9) return [r5(lin.x[0]), r5(lin.x[1]), 0, 0, 0];
    let best = null;
    for (let w = 0.05; w <= 10; w += 0.005) {
      const f = lsq(ts, vs, [() => 1, t => Math.sin(w * t), t => Math.cos(w * t)]);
      if (f && (!best || f.err < best.err)) best = { ...f, w };
    }
    if (!best || best.err > 1e-6) throw new Error('a look animation does not fit a turn or a swing');
    return [r5(best.x[0]), 0, r5(best.x[1]), r5(best.x[2]), r5(best.w)];
  }
  const anims = {};
  // a piece built with its animations: the still meshes, and each moving part apart (anims[key])
  function piece(key, build) {
    const anim = [],
      g = build(anim);
    if (!anim.length) return meshes(g, new THREE.Group());
    const all = [];
    g.traverse(o => all.push(o));
    const chans = o => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z];
    const moved = new Map();
    for (const f of anim) {
      f(0);
      const s0 = all.map(chans);
      f(1.234);
      const s1 = all.map(chans);
      f(0);
      all.forEach((o, i) => {
        if (s0[i].some((v, k) => Math.abs(v - s1[i][k]) > 1e-7)) (moved.get(o) || moved.set(o, []).get(o)).push(f);
      });
    }
    // a moving part inside another moving part moves with it: only the outer ones
    const outer = [...moved.keys()].filter(o => {
      for (let q = o.parent; q; q = q.parent) if (moved.has(q)) return false;
      return true;
    });
    const list = [];
    for (const o of outer) {
      const ts = [],
        cs = Array.from({ length: 9 }, () => []);
      for (let t = 0; t < 12.6; t += 0.04) {
        for (const f of moved.get(o)) f(t);
        ts.push(t);
        chans(o).forEach((v, k) => cs[k].push(v));
      }
      for (const f of moved.get(o)) f(0);
      g.updateMatrixWorld(true);
      const pp = new THREE.Vector3(),
        pq = new THREE.Quaternion(),
        ps = new THREE.Vector3();
      o.parent.matrixWorld.decompose(pp, pq, ps);
      list.push({ pp: [pp.x, pp.y, pp.z].map(r5), pq: [pq.x, pq.y, pq.z, pq.w].map(r5), ps: [ps.x, ps.y, ps.z].map(r5), ch: cs.map(v => fit(ts, v)), parts: meshes(o, o) });
    }
    anims[key] = list;
    // the still meshes: everything but the moving parts
    const hidden = [];
    for (const o of outer) o.traverse(m => m.isMesh && m.visible && (hidden.push(m), (m.visible = false)));
    const still = meshes(g, new THREE.Group());
    for (const m of hidden) m.visible = true;
    return still;
  }
  const out = { head: {}, face: {}, back: {}, companion: {}, outfit: {}, trail: {}, anim: anims };
  const ids = Object.keys(COSMETICS).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const c = COSMETICS[id];
    if (c.slot === 'head') out.head[id] = piece('head.' + id, a => buildHead(c, a));
    else if (c.slot === 'face') out.face[id] = piece('face.' + id, a => buildHead(c, a));
    else if (c.slot === 'back') out.back[id] = piece('back.' + id, a => buildBack(c, a));
    else if (c.slot === 'companion') out.companion[id] = piece('companion.' + id, a => buildCompanion(c, a));
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
  // the helmets, gauntlets, leggings and amulets (24-gear.js updateGearVisual)
  for (const g of GEAR) {
    out[g.k] = {};
    for (const id of Object.keys(ITEM).map(Number).sort((a, b) => a - b)) if (ITEM[id].wear === g.k) out[g.k][id] = worn(av => updateGearVisual(av, g.k, id));
  }
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
