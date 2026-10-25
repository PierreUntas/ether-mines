// Screenshots of the game from any viewpoint, in solo mode (no Supabase), to check a change visually.
// Lets you (or Claude Code) see the world without playing: place the camera, pick the time of day, take a PNG.
//
// Setup (once): npm i --no-save playwright@1.56.0 three@0.128.0 && npx playwright install chromium
//
// One shot (y = feet height, the eyes are 1.6 higher; yaw/pitch in radians, yaw 0 looks north = -z):
//   node tools/capture.mjs --x 8 --y 40 --z 20 --yaw 0 --pitch -0.2 --time morning --out captures/atrium.png
// Look at a point instead of giving yaw/pitch:
//   node tools/capture.mjs --x 30 --y 45 --z -20 --look-at 8,32,-56 --out captures/city.png
// Several angles around a point (here 4 shots, 18 blocks away, 10 blocks above it):
//   node tools/capture.mjs --around 8,32,-56 --radius 18 --above 10 --count 4 --out captures/city.png
//   → captures/city-1.png … captures/city-4.png
// Several shots in one launch (faster): a JSON array of the same options
//   node tools/capture.mjs --shots shots.json
//
// Other options: --time morning|noon|sunset|night|<0..1>, --width 1280 --height 720, --hud (keep the interface),
// --no-mobs (hide hostile mobs), --eval "js" (run in the page just before the shot, e.g. to raise a guard), --query style=clay (added to the page's address), --wait 20000 (max ms to wait for the terrain to load), --offline (block Google Fonts).
// Captures go to captures/ by default (ignored by git).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');

// ---------- options ----------
function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2),
      v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else {
      o[k] = v;
      i++;
    }
  }
  return o;
}
const args = parse(process.argv.slice(2));
const TIMES = { dawn: 0.26, morning: 0.32, noon: 0.45, afternoon: 0.6, sunset: 0.78, dusk: 0.84, night: 0.92 };
const num = (v, d) => (v === undefined || v === true ? d : +v);
const vec = s => String(s).split(',').map(Number);
const lookAngles = (x, y, z, [tx, ty, tz]) => {
  const dx = tx - x,
    dy = ty - (y + 1.6),
    dz = tz - z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
};
// one option object → one or several shots {x, y, z, yaw, pitch, day, out}
function shotsOf(o) {
  const day = typeof o.time === 'number' ? o.time : (TIMES[o.time] ?? (o.time !== undefined && !isNaN(+o.time) ? +o.time : TIMES.noon));
  const out = o.out || 'captures/shot.png';
  if (o.around) {
    const c = vec(o.around),
      n = num(o.count, 4),
      r = num(o.radius, 16),
      h = num(o.above, 8);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2,
        x = c[0] + Math.sin(a) * r,
        z = c[2] + Math.cos(a) * r,
        y = c[1] + h;
      return { x, y, z, ...lookAngles(x, y, z, c), day, eval: o.eval, out: out.replace(/(\.png)?$/, `-${i + 1}.png`) };
    });
  }
  const x = num(o.x, 8.5),
    y = num(o.y, 40),
    z = num(o.z, 24);
  const ang = o['look-at'] ? lookAngles(x, y, z, vec(o['look-at'])) : { yaw: num(o.yaw, 0), pitch: num(o.pitch, -0.15) };
  return [{ x, y, z, ...ang, day, eval: o.eval, out }];
}
const shots = args.shots ? JSON.parse(await readFile(args.shots, 'utf8')).flatMap(shotsOf) : shotsOf(args);

// ---------- the game, served locally ----------
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-proxy-server'],
});
const page = await browser.newPage({ viewport: { width: num(args.width, 1280), height: num(args.height, 720) } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() =>
  localStorage.setItem('ether-mines:profil', JSON.stringify({ id: 'capture', name: 'Camera', color: '#8a7bef' })),
);
await page.route('**/three.min.js', r => r.fulfill({ path: three, contentType: 'application/javascript' }));
await page.route('**/supabase.js', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
await page.route('**/src/config.js', r => r.fulfill({ body: 'window.CONFIG={}', contentType: 'application/javascript' }));
await page.route(/_vercel/, r => r.abort());
if (args.offline) await page.route(/^https:\/\/fonts\./, r => r.abort());

await page.goto(`http://127.0.0.1:${server.address().port}/play.html${args.query ? '?' + args.query : ''}#debug`);
await page.waitForTimeout(800);
// the first-entry intro cinematic (playIntro) would cover every shot: don't play it
await page.evaluate(() => (window.playIntro = () => {}));
await page.evaluate(() => document.getElementById('play').click());
await page.waitForFunction(() => document.getElementById('title').hidden, null, { timeout: 240000 });
// first person: the shot is taken from the given eyes, not from behind an avatar (the clay look's default)
await page.evaluate(() => {
  viewReady = true;
  while (VIEW !== 0) changeView(true);
});
if (args['no-mobs'])
  await page.evaluate(() => {
    window.spawnMobChunk = () => {};
    for (const k of [...mines.MOBS.keys()]) mines.despawnMobChunk(k);
  });
if (!args.hud)
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = 'hidden';
  });

for (const s of shots) {
  await page.evaluate(s => {
    const P = mines.P;
    P.x = s.x;
    P.y = s.y;
    P.z = s.z;
    P.vx = P.vy = P.vz = 0;
    mines.yaw = s.yaw;
    mines.pitch = s.pitch;
    mines.S.day = s.day;
    mines.playing = false; // the camera stays put, no gravity
  }, s);
  // wait until the terrain around the camera has stopped loading (no new chunk for 1.5 s), at most --wait ms
  const t0 = Date.now();
  let last = -1,
    stable = 0;
  while (Date.now() - t0 < num(args.wait, 20000)) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => mines.meshCount);
    stable = n === last ? stable + 500 : 0;
    last = n;
    if (stable >= 1500 && Date.now() - t0 > 2500) break;
  }
  await page.evaluate(s => (mines.S.day = s.day), s);
  if (s.eval) await page.evaluate(s.eval);
  await page.waitForTimeout(300);
  await mkdir(dirname(s.out), { recursive: true });
  await page.screenshot({ path: s.out });
  console.log(
    `${s.out}  (x ${s.x.toFixed(1)}, y ${s.y.toFixed(1)}, z ${s.z.toFixed(1)}, yaw ${s.yaw.toFixed(2)}, pitch ${s.pitch.toFixed(2)}, ${last} chunks)`,
  );
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
