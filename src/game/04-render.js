// Ether Mines · Three.js rendering: scene, chunk meshing, hand, icons.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- three.js rendering ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
} catch (e) {
  $('play').textContent = 'WebGL unavailable on this device';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, REG.sharpness));
renderer.autoClear = false;
renderer.shadowMap.enabled = REG.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe6e0ff, 34, 92);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0xb9a7e0, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e0, 0.9);
sun.castShadow = REG.shadows;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
// the clay look's glow (Settings → Glow, off by default on phones): bright things (crystals, lanterns, ether
// ore, the beam, the sun on the clouds) bleed a soft light around them. A bloom pass from three's own
// examples (src/vendor/three-bloom.js), made on first use; multisampled where WebGL 2 allows, so edges stay smooth.
let GLOW = null;
function glowComposer() {
  if (GLOW !== null) return GLOW;
  GLOW = false;
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass) return GLOW;
  try {
    const pr = renderer.getPixelRatio(),
      rt =
        renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget
          ? new THREE.WebGLMultisampleRenderTarget(innerWidth * pr, innerHeight * pr, { format: THREE.RGBAFormat })
          : undefined,
      c = new THREE.EffectComposer(renderer, rt);
    c.addPass(new THREE.RenderPass(scene, camera));
    c.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.6, 0.84));
    GLOW = c;
  } catch (e) {
    console.error(e);
  }
  return GLOW;
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  if (GLOW) {
    GLOW.setPixelRatio(renderer.getPixelRatio());
    GLOW.setSize(innerWidth, innerHeight);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  handCam.aspect = camera.aspect;
  handCam.updateProjectionMatrix();
}
// ciel
const skyU = {
  top: { value: new THREE.Color() },
  hor: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3() },
  sunCol: { value: new THREE.Color() },
  night: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyU,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'uniform vec3 top,hor,sunCol,sunDir;uniform float night;varying vec3 vD;void main(){float h=vD.y;vec3 c=mix(hor,top,pow(clamp(h,0.,1.),.55));c=mix(c,hor*.8,clamp(-h*3.,0.,1.));float s=max(dot(vD,sunDir),0.);c+=sunCol*(smoothstep(.9985,.9992,s)*1.4+pow(s,14.)*.35+pow(s,4.)*.3*(1.-abs(sunDir.y))*step(0.,h+.1));float m=max(dot(vD,-sunDir),0.);c+=vec3(.95,.95,1.)*smoothstep(.9990,.9994,m)*night;gl_FragColor=vec4(c,1.);}',
  }),
);
sky.renderOrder = -1;
scene.add(sky);
const starG = new THREE.BufferGeometry(),
  sp = [];
for (let i = 0; i < 700; i++) {
  const u = hash(i, 1, 90) * 2 - 1,
    a = hash(i, 2, 90) * Math.PI * 2,
    r = Math.sqrt(1 - u * u);
  if (u < 0.05) continue;
  sp.push(Math.cos(a) * r * 280, u * 280, Math.sin(a) * r * 280);
}
starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const stars = new THREE.Points(
  starG,
  new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  }),
);
scene.add(stars);
const cloudC = document.createElement('canvas');
cloudC.width = cloudC.height = 64;
{
  const c = cloudC.getContext('2d');
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const v = vn2(x / 6, y / 6, 60) * 0.7 + vn2(x / 3, y / 3, 61) * 0.3;
      if (v > 0.62) {
        c.fillStyle = '#ffffff';
        c.fillRect(x, y, 1, 1);
      }
    }
}
// the clay look: soft round clouds, white on top and a little lavender underneath, edges fading out
if (CLAY) {
  cloudC.width = cloudC.height = 256;
  const c = cloudC.getContext('2d'),
    im = c.createImageData(256, 256),
    d = im.data;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const v = vn2(x / 24, y / 24, 60) * 0.7 + vn2(x / 12, y / 12, 61) * 0.22 + vn2(x / 5, y / 5, 62) * 0.08,
        a = Math.min(1, Math.max(0, (v - 0.56) / 0.14)),
        core = Math.min(1, Math.max(0, (v - 0.62) / 0.12)),
        i = (y * 256 + x) * 4;
      d[i] = 236 + 19 * core;
      d[i + 1] = 230 + 25 * core;
      d[i + 2] = 255;
      d[i + 3] = 255 * a * a * (3 - 2 * a);
    }
  c.putImageData(im, 0, 0);
}
const cloudTex = new THREE.CanvasTexture(cloudC);
cloudTex.magFilter = CLAY ? THREE.LinearFilter : THREE.NearestFilter;
cloudTex.minFilter = CLAY ? THREE.LinearFilter : THREE.NearestFilter;
cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
cloudTex.repeat.set(3, 3);
let cloudDrift = 0;
const clouds = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: THREE.DoubleSide }),
);
clouds.rotation.x = -Math.PI / 2;
clouds.position.y = SY + 26;
scene.add(clouds);
// the clay look's aurora: two long curtains of light low over the horizon, lavender into cyan, slowly
// waving; only at night (auroraU.night, set by 08-sky.js), following the camera like the stars
const auroraU = { time: { value: 0 }, night: { value: 0 } };
const aurora = new THREE.Group();
if (CLAY) {
  const mat = new THREE.ShaderMaterial({
    uniforms: auroraU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, night; varying vec2 vUv;
      void main(){
        float x = vUv.x, y = vUv.y;
        float wave = 0.5 + 0.5 * sin(x * 26.0 + time * 0.45 + 2.2 * sin(x * 7.0 - time * 0.25));
        float rays = 0.55 + 0.45 * sin(x * 210.0 + 3.0 * sin(x * 31.0 + time * 0.6));
        float band = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 2.2) * smoothstep(0.0, 0.1, x) * smoothstep(1.0, 0.9, x);
        vec3 col = mix(vec3(0.4, 1.0, 0.9), vec3(0.75, 0.55, 1.0), smoothstep(0.1, 0.7, y + 0.12 * sin(x * 9.0 + time * 0.2)));
        gl_FragColor = vec4(col, band * pow(wave, 1.6) * rays * night * 0.9);
      }`,
  });
  for (const [start, len, h, r] of [
    [2.2, 1.9, 90, 190],
    [4.6, 1.5, 75, 175],
  ]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true, start, len), mat);
    m.position.y = 58 + h / 2;
    aurora.add(m);
  }
  scene.add(aurora);
}
// grand losange au loin
function ethGeo(r, ht, hb, gap, cols) {
  const pos = [],
    col = [],
    e = [
      [r, 0, 0],
      [0, 0, r],
      [-r, 0, 0],
      [0, 0, -r],
    ];
  const hx = h => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  for (let i = 0; i < 4; i++) {
    const a = e[i],
      c = e[(i + 1) % 4];
    pos.push(0, ht, 0, a[0], gap / 2, a[2], c[0], gap / 2, c[2], 0, -hb, 0, a[0], -gap / 2, a[2], c[0], -gap / 2, c[2]);
    const t = hx(cols[i % 2]),
      b = hx(cols[2 + (i % 2)]);
    for (let j = 0; j < 3; j++) col.push(...t);
    for (let j = 0; j < 3; j++) col.push(...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const ethMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
const bigEth = new THREE.Mesh(ethGeo(9, 15, 10, 2.5, ['#9a8cf5', '#c2b8ff', '#6a58e0', '#8a7bef']), ethMat);
bigEth.position.set(SPAWN.x, SY + 40, SPAWN.z - 110);
scene.add(bigEth);
// the clay look's floating ethers: small diamonds of the same shape hovering and turning over the
// Atrium, not on the block grid — the first thing a newcomer sees that isn't a cube
if (CLAY) {
  const ring = [];
  const gy0 = Math.max(heightAt(SPAWN.x, SPAWN.z), SEA) + 1;
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(bigEth.geometry, ethMat),
      a = (i / 7) * Math.PI * 2;
    m.scale.setScalar(0.07 + (i % 3) * 0.015);
    m.userData = { a, r: 9.5 + (i % 2) * 2.5, h: gy0 + 7 + (i % 3) * 1.4, ph: i * 1.7 };
    scene.add(m);
    ring.push(m);
  }
  const spin = () => {
    const t = performance.now() / 1000;
    for (const m of ring) {
      const u = m.userData,
        a = u.a + t * 0.05;
      m.position.set(SPAWN.x + 0.5 + Math.cos(a) * u.r, u.h + Math.sin(t * 0.9 + u.ph) * 0.35, SPAWN.z + 0.5 + Math.sin(a) * u.r);
      m.rotation.y = t * 0.6 + u.ph;
    }
    requestAnimationFrame(spin);
  };
  spin();
}
// ring of orange blocks orbiting the great diamond (like in ethereum.org's illustrations)
const anneau = new THREE.Group();
anneau.position.copy(bigEth.position);
anneau.rotation.x = 0.35;
{
  const mats = ['#ffb36b', '#ff9a5c', '#ffc98a'].map(c => new THREE.MeshBasicMaterial({ color: c, fog: false })),
    geo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  for (let i = 0; i < 16; i++) {
    const an = (i / 16) * Math.PI * 2,
      m = new THREE.Mesh(geo, mats[i % 3]);
    m.position.set(Math.cos(an) * 17, Math.sin(i * 1.7) * 0.8, Math.sin(an) * 17);
    m.rotation.set(i, i * 0.6, 0);
    m.scale.setScalar(0.7 + (i % 4) * 0.15);
    anneau.add(m);
  }
}
scene.add(anneau);
// disc ships circling above the City, like in the illustration of the city at night
const SHIPS = [];
{
  const coque = new THREE.MeshLambertMaterial({ color: 0xd6ccf6 }),
    lum = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, fog: false }),
    bulle = new THREE.MeshLambertMaterial({ color: 0xa6f4ee, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(),
      t = 1 + i * 0.35;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2 * t, 2.2 * t, 0.7, 20), coque));
    const anneauLum = new THREE.Mesh(new THREE.CylinderGeometry(3.25 * t, 3.25 * t, 0.18, 20, 1, true), lum);
    g.add(anneauLum);
    const d = new THREE.Mesh(new THREE.SphereGeometry(1.2 * t, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bulle);
    d.position.y = 0.3;
    g.add(d);
    g.userData = { r: 22 + i * 12, h: SY + 8 + i * 5, v: (i % 2 ? -1 : 1) * (0.05 + i * 0.02), a: i * 2.1 };
    scene.add(g);
    SHIPS.push(g);
  }
}
// flocks of birds (by day): small "v" shapes crossing the sky in groups
const OISEAUX = [];
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0.25, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.25, 0], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x6a58e0, transparent: true, opacity: 0.8 });
  for (let v = 0; v < 3; v++) {
    const vol = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const o = new THREE.LineSegments(geo, mat);
      o.position.set((k % 3) * 1.6 - 1.6, Math.floor(k / 3) * 0.8 + Math.random() * 0.4, Math.floor(k / 3) * 1.4);
      vol.add(o);
    }
    vol.userData = { a: v * 2, r: 40 + v * 15, h: SY + 2 + v * 4, v: 0.04 + v * 0.01 };
    scene.add(vol);
    OISEAUX.push(vol);
  }
}
if (CLAY) {
  const leaves = new Set();
  for (const b of Object.values(B)) if (b && b.leaf) for (const t of b.t || []) leaves.add(t);
  atlasTex.image = clayAtlas(atlas, 0.68, true, leaves);
  emisTex.image = clayAtlas(emis, 0, false);
  for (const t of [atlasTex, emisTex]) {
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
  }
}
// ---------- chunk meshing ----------
const { FACES, AOF, uvRect } = Mesh; // src/mesh.js
const opMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  emissiveMap: emisTex,
  emissive: 0xffffff,
  vertexColors: true,
  alphaTest: 0.5,
});
// the clay look's bevel: every block face gets a light rim and a thin dark seam, like a toy brick
// (inside the face's own tile coordinates, so it costs nothing in geometry)
if (CLAY)
  opMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec2 tq = fract(vUv * ${AN}.0);
      float ed = min(min(tq.x, 1.0 - tq.x), min(tq.y, 1.0 - tq.y));
      diffuseColor.rgb *= mix(0.84, 1.0, smoothstep(0.0, 0.028, ed)) * mix(1.1, 1.0, smoothstep(0.028, 0.1, ed));`,
    );
  };
const glMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  emissiveMap: emisTex,
  emissive: 0xffffff,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
});
// water: sun reflections (Phong) on waves whose normal follows the ripple
const waMat = new THREE.MeshPhongMaterial({
  map: waterTex,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
  color: 0xdcefff,
  specular: 0x8a8aa0,
  shininess: 70,
});
// the water's surface (vertices at 0.86 of a block) ripples; the bottom and full water stay fixed
const waterU = { value: 0 };
waMat.onBeforeCompile = sh => {
  sh.uniforms.wtime = waterU;
  sh.vertexShader =
    'uniform float wtime;\n' +
    sh.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nif(fract(position.y)>.5&&objectNormal.y>.5){float dx=(1.3*cos(position.x*1.3+wtime*1.7)+.6*cos((position.x+position.z)*.6+wtime*.9))*.022,dz=(1.1*cos(position.z*1.1-wtime*1.3)+.6*cos((position.x+position.z)*.6+wtime*.9))*.022;objectNormal=normalize(vec3(-dx*6.,1.,-dz*6.));}',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nif(fract(position.y)>.5){transformed.y+=(sin(position.x*1.3+wtime*1.7)+sin(position.z*1.1-wtime*1.3)+sin((position.x+position.z)*.6+wtime*.9))*.022-.035;}',
      );
};
const plMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  emissiveMap: emisTex, // champignons lumineux
  emissive: 0xffffff,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
});
// grass and flowers sway in the wind (only the top vertices move, see mesh.js)
plMat.onBeforeCompile = sh => {
  sh.uniforms.wtime = waterU;
  sh.vertexShader =
    'uniform float wtime;\n' +
    sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nif(fract(position.y)>.5){float w=sin(wtime*1.6+position.x*.7+position.z*.5)+.5*sin(wtime*2.7+position.z*1.3);transformed.x+=w*.06;transformed.z+=w*.04;}',
    );
};
const MESH = new Map();
function dropMesh(k) {
  const ch = MESH.get(k);
  if (!ch) return;
  for (const m of ch.meshes) {
    scene.remove(m);
    m.geometry.dispose();
  }
  MESH.delete(k);
}
// Meshing in the background (worker) when the browser allows it, otherwise in place.
// Each request carries a number: a response made obsolete by a more recent change is ignored.
let meshWorker = null,
  meshSeq = 0,
  inFlight = 0;
const lastMeshId = new Map(),
  pendingMesh = new Map();
try {
  meshWorker = new Worker('src/mesh-worker.js');
  meshWorker.onmessage = e => {
    const { id, cx, cz, mesh, err } = e.data,
      k = ckey(cx, cz);
    inFlight--;
    const done = pendingMesh.get(id);
    pendingMesh.delete(id);
    if (lastMeshId.get(k) === id && CHK.has(k)) {
      if (err) {
        if (window.logError) logError('mesh ' + k + ': ' + err);
        meshInPlace(cx, cz);
      } else applyMesh(cx, cz, mesh);
    }
    if (done) done();
  };
  meshWorker.onerror = e => {
    console.warn('background meshing unavailable, falling back to in-place meshing', e.message);
    if (window.logError && location.protocol !== 'file:') logError('mesh worker: ' + (e.message || 'error'));
    meshWorker = null;
    for (const f of pendingMesh.values()) f();
    pendingMesh.clear();
    for (const k of lastMeshId.keys()) if (CHK.has(k)) meshQ.add(k);
  };
} catch (e) {
  meshWorker = null;
}
const workerFree = () => !meshWorker || inFlight < 4;
// Meshing on the main thread. A chunk that fails keeps its old display instead of blocking the game.
function meshInPlace(cx, cz, pw) {
  if (!pw) {
    pw = [];
    for (const key of POWERED) pw.push(key);
  }
  const ps = new Set(pw);
  try {
    applyMesh(cx, cz, Mesh.pack(Mesh.meshChunk(cx, cz, get, key => ps.has(key))));
  } catch (e) {
    console.error(e);
    if (window.logError) logError('in-place mesh ' + ckey(cx, cz) + ': ' + e.message, e.stack);
  }
}
function buildChunk(cx, cz) {
  const k = ckey(cx, cz);
  if (!CHK.has(k)) return Promise.resolve();
  const pw = [];
  for (const key of POWERED) {
    const [x, , z] = key.split(',').map(Number);
    if (Math.abs(cOf(x) - cx) <= 1 && Math.abs(cOf(z) - cz) <= 1) pw.push(key);
  }
  if (!meshWorker) {
    meshInPlace(cx, cz, pw);
    return Promise.resolve();
  }
  const id = ++meshSeq,
    chunks = {};
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const n = ckey(cx + dx, cz + dz),
        a = CHK.get(n);
      if (a) chunks[n] = a;
    }
  lastMeshId.set(k, id);
  inFlight++;
  meshWorker.postMessage({ id, cx, cz, chunks, powered: pw });
  return new Promise(res => pendingMesh.set(id, res));
}
function applyMesh(cx, cz, M) {
  const mkG = G => {
    if (!G) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(G.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(G.uv, 2));
    if (G.col) g.setAttribute('color', new THREE.BufferAttribute(G.col, 3));
    g.setIndex(new THREE.BufferAttribute(G.idx, 1));
    g.computeBoundingSphere();
    return g;
  };
  const mk = ckey(cx, cz);
  let ch = MESH.get(mk);
  if (!ch) MESH.set(mk, (ch = { meshes: [] }));
  for (const m of ch.meshes) {
    scene.remove(m);
    m.geometry.dispose();
  }
  ch.meshes = [];
  const add = (g, mat, cast) => {
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast && !!SHADOWS;
    m.receiveShadow = true;
    scene.add(m);
    ch.meshes.push(m);
  };
  add(mkG(M.op), opMat, true);
  add(mkG(M.gl), glMat, false);
  add(mkG(M.wa), waMat, false);
  add(mkG(M.pl), plMat, false);
}
function rebuildAt(x, z) {
  const cx = Math.floor(x / CH),
    cz = Math.floor(z / CH);
  const set = new Set([cx + ',' + cz]);
  const lx = ((x % CH) + CH) % CH,
    lz = ((z % CH) + CH) % CH; // correct for negative coordinates too
  if (lx === 0) set.add(cx - 1 + ',' + cz);
  if (lx === CH - 1) set.add(cx + 1 + ',' + cz);
  if (lz === 0) set.add(cx + ',' + (cz - 1));
  if (lz === CH - 1) set.add(cx + ',' + (cz + 1));
  for (const k of set) {
    const [a, b] = k.split(',').map(Number);
    if (MESH.has(k)) buildChunk(a, b);
  }
}

// ---------- validateurs : faisceaux ----------
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xffe68a,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 40, 10, 1, true),
  gemGeo = ethGeo(0.22, 0.4, 0.26, 0.06, ['#fff2b0', '#ffd95e', '#8a7bef', '#6a58e0']);
const vals = new Map();
function addVal(x, y, z) {
  if (vals.has(coordKey(x, y, z))) return;
  const g = new THREE.Group();
  const b = new THREE.Mesh(beamGeo, beamMat);
  b.position.y = 21;
  g.add(b);
  const d = new THREE.Mesh(gemGeo, ethMat);
  d.position.y = 1.7;
  g.add(d);
  g.userData.d = d;
  g.position.set(x + 0.5, y, z + 0.5);
  scene.add(g);
  vals.set(coordKey(x, y, z), g);
}
function delVal(i) {
  const g = vals.get(i);
  if (g) {
    scene.remove(g);
    vals.delete(i);
  }
}

// ---------- main (objet tenu) ----------
const handScene = new THREE.Scene(),
  handCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
handScene.add(new THREE.AmbientLight(0xffffff, 0.55));
const hl = new THREE.DirectionalLight(0xffffff, 0.7);
hl.position.set(1, 2, 1);
handScene.add(hl);
const hand = new THREE.Group();
handScene.add(hand);
let handMesh = null,
  handKey = null;
function blockBox(id, s) {
  const g = new THREE.BoxGeometry(s, s, s),
    uv = g.attributes.uv,
    b = B[id];
  const map = [b.t[1], b.t[1], b.t[0], b.t[2], b.t[1], b.t[1]];
  for (let f = 0; f < 6; f++) {
    const [u0, u1, v0, v1] = uvRect(map[f]);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    }
  }
  uv.needsUpdate = true;
  return g;
}
// held tools and items: voxelize the icon's pixels into small lit cubes instead of a flat, blown-up sprite —
// every block in this game is a cube, so a held tool reads as a tiny cube sculpture of its own icon.
const heldVoxelCache = {},
  heldVoxelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const HELD_SS = 3; // sub-cubes per source pixel: smaller cubes, closer to the texel size seen on a placed block
function heldVoxelGeo(ti) {
  if (heldVoxelCache[ti]) return heldVoxelCache[ti];
  const ox = (ti % AN) * AT,
    oy = Math.floor(ti / AN) * AT,
    img = ag.getImageData(ox, oy, AT, AT).data,
    glow = eg.getImageData(ox, oy, AT, AT).data,
    cs = 1 / AT / HELD_SS,
    template = new THREE.BoxGeometry(cs * 0.92, cs * 0.92, cs * 0.8),
    tp = template.attributes.position.array,
    idx = template.index.array,
    pos = [],
    col = [];
  for (let y = 0; y < AT; y++)
    for (let x = 0; x < AT; x++) {
      const i = (y * AT + x) * 4;
      if (img[i + 3] < 128) continue;
      let r = img[i] / 255,
        g = img[i + 1] / 255,
        b = img[i + 2] / 255;
      if (glow[i] + glow[i + 1] + glow[i + 2] > 30) {
        r = r * 0.55 + 0.45;
        g = g * 0.55 + 0.45;
        b = b * 0.55 + 0.45;
      }
      for (let sy = 0; sy < HELD_SS; sy++)
        for (let sx = 0; sx < HELD_SS; sx++) {
          const cx = (x + (sx + 0.5) / HELD_SS) / AT - 0.5,
            cy = (AT - 1 - y + (sy + 0.5) / HELD_SS) / AT - 0.5;
          for (let k = 0; k < idx.length; k++) {
            const vi = idx[k] * 3;
            pos.push(tp[vi] + cx, tp[vi + 1] + cy, tp[vi + 2]);
            col.push(r, g, b);
          }
        }
    }
  template.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  heldVoxelCache[ti] = geo;
  return geo;
}
// ---------- the clay look's tools and weapons: smooth little 3D models instead of pixel sprites ----------
// Built along +y (handle down), then laid on the same diagonal as the 16 px icons, so the hand poses
// (setHand below, updateAvatarHand in 14-startup.js) hold them exactly as they held the voxel versions.
// Pickaxes and blades only (and the pistol); every other item keeps its voxel model.
const clayModels = {};
function clayModel(it) {
  it = +it;
  if (!CLAY) return null;
  if (clayModels[it] !== undefined) return clayModels[it] && clayModels[it].clone();
  const gem = (c, e, k = 0.35) =>
      new THREE.MeshPhongMaterial({ color: c, emissive: e, emissiveIntensity: k, flatShading: true, shininess: 80 }),
    matte = c => new THREE.MeshLambertMaterial({ color: c }),
    g = new THREE.Group(),
    add = (geo, mat, x, y, z, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      g.add(m);
      return m;
    };
  const PICK = { 102: ['#b07a52', '#e2c39b', '#000000'], 201: ['#4a3b7a', '#a99cff', '#3a2d8a'], 202: ['#3b4f7a', '#8ff0ff', '#1f7f90'] },
    // blades: [steel, glowing edge, guard and pommel, grip]
    BLADE = {
      106: ['#fff4cc', '#ffd166', '#c98a20', '#4a3b7a'],
      107: ['#e8fffd', '#7fe8ff', '#2aa8b8', '#3a2d52'],
      301: ['#eef3ff', '#9ff0ff', '#ffd166', '#6a2d52'],
    };
  if (PICK[it]) {
    const [h, c, e] = PICK[it];
    add(new THREE.CylinderGeometry(0.035, 0.045, 1, 8), matte(h), 0, -0.05, 0);
    const head = gem(c, e, it === 102 ? 0 : 0.4);
    add(new THREE.OctahedronGeometry(0.11), head, 0, 0.45, 0);
    add(new THREE.ConeGeometry(0.075, 0.44, 6), head, -0.26, 0.42, 0, Math.PI / 2 + 0.18);
    add(new THREE.ConeGeometry(0.075, 0.44, 6), head, 0.26, 0.42, 0, -Math.PI / 2 - 0.18);
  } else if (BLADE[it]) {
    // a slim curved blade, katana-like, its cutting edge glowing; a round guard
    const [c, e, guard, grip] = BLADE[it],
      steel = new THREE.MeshPhongMaterial({ color: c, shininess: 40 }),
      edge = new THREE.MeshBasicMaterial({ color: e }),
      gold = new THREE.MeshPhongMaterial({ color: guard, shininess: 40 }),
      n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1),
        w = 0.075 * (1 - t * 0.55),
        x = 0.12 * t * t,
        a = -Math.atan2(0.24 * t, 0.95);
      add(new THREE.BoxGeometry(w, 0.13, 0.03), steel, x, -0.02 + t * 0.95, 0, a);
      add(new THREE.BoxGeometry(0.014, 0.13, 0.034), edge, x + w / 2, -0.02 + t * 0.95, 0, a);
    }
    add(new THREE.ConeGeometry(0.04, 0.12, 4), steel, 0.13, 0.99, 0, -0.35).scale.z = 0.4;
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 20), gold, 0, -0.1, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), matte(grip), 0, -0.27, 0);
    add(new THREE.SphereGeometry(0.045, 12, 8), gold, 0, -0.44, 0);
  } else if (it === 206) {
    // the pistol: barrel toward +x like its icon, a glowing core in the middle
    add(new THREE.BoxGeometry(0.5, 0.17, 0.14), matte('#4a3b7a'), 0.02, 0.06, 0);
    const b = add(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10), matte('#6a58e0'), 0.38, 0.08, 0, Math.PI / 2);
    b.rotation.z = -Math.PI / 2;
    add(new THREE.BoxGeometry(0.13, 0.28, 0.12), matte('#2a1838'), -0.12, -0.14, 0, 0.25);
    add(new THREE.OctahedronGeometry(0.075), gem('#7fe8ff', '#7fe8ff', 0.9), 0.06, 0.06, 0.07);
    clayModels[it] = g;
    return g.clone();
  }
  if (!g.children.length) {
    clayModels[it] = null;
    return null;
  }
  // on the icons' diagonal: handle bottom left, head top right
  const d = new THREE.Group();
  g.rotation.z = -Math.PI / 4;
  d.add(g);
  clayModels[it] = d;
  return d.clone();
}
function setHand() {
  const key = S.bar[S.sel] || 'main',
    it = S.bar[S.sel] ? itemId(S.bar[S.sel]) : null;
  if (key === handKey) return;
  handKey = key;
  if (handMesh) {
    hand.remove(handMesh);
    if (!handMesh.userData.shared) handMesh.geometry.dispose();
  }
  if (!it) {
    handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0xf6d3b8 }));
    handMesh.position.set(0.34, -0.32, -0.55);
    handMesh.rotation.set(0.2, -0.2, 0);
  } else if (B[it] && !isCross(+it) && !B[it].icon) {
    handMesh = new THREE.Mesh(
      blockBox(+it, 0.3),
      new THREE.MeshLambertMaterial({
        map: atlasTex,
        emissiveMap: emisTex,
        emissive: 0xffffff,
        transparent: !!B[it].glass,
        alphaTest: B[it].leaf ? 0.5 : 0,
      }),
    );
    handMesh.position.set(0.4, -0.36, -0.62);
    handMesh.rotation.set(0.25, 0.6, 0);
    if (B[it].shape === 'slab' || B[it].shape === 'stairs') handMesh.scale.y = 0.5;
  } else if (!B[it] && clayModel(it)) {
    handMesh = clayModel(it);
    handMesh.userData.shared = true; // a group: nothing to dispose
    handMesh.scale.setScalar(0.42); // the models fill their square more than the sprites did
    handMesh.position.set(0.24, -0.3, -0.68);
    handMesh.rotation.set(0, -0.5, 0.2);
    if (ITEM[it]?.ranged) {
      handMesh.scale.setScalar(0.34);
      handMesh.position.set(0.275, -0.275, -0.7);
      handMesh.rotation.set(0.02, 1.76, 0.11);
    }
  } else {
    const ti = B[it] ? (B[it].icon ?? B[it].x) : ITEM[it].icon;
    handMesh = new THREE.Mesh(heldVoxelGeo(ti), heldVoxelMat);
    handMesh.userData.shared = true;
    handMesh.scale.setScalar(0.54);
    handMesh.position.set(0.24, -0.3, -0.68);
    handMesh.rotation.set(0, -0.5, 0.2);
    // a pistol is held barrel forward, seen a little from its side, its muzzle toward the crosshair
    if (ITEM[it]?.ranged) {
      handMesh.scale.setScalar(0.39);
      handMesh.position.set(0.275, -0.275, -0.7);
      handMesh.rotation.set(0.02, 1.76, 0.11);
    }
  }
  handMesh.userData.rest = { p: handMesh.position.clone(), r: handMesh.rotation.clone() };
  hand.add(handMesh);
}
resize();
addEventListener('resize', resize);

// ---------- icons (isometric cube from the atlas) ----------
const iconCache = {};
function icon(it) {
  if (iconCache[it]) return iconCache[it];
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const tileImg = ti => [(ti % AN) * AT, Math.floor(ti / AN) * AT];
  if (B[it] && !isCross(+it) && !B[it].water && !B[it].icon) {
    const b = B[it],
      k = 1 / 16,
      half = b.shape === 'slab' || b.shape === 'stairs' || b.shape === 'furn'; // furn without its own icon: a carpet
    const face = (ti, m, shade) => {
      const [sx, sy] = tileImg(ti);
      x.setTransform(...m);
      x.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
      if (shade) {
        x.fillStyle = `rgba(20,14,50,${shade})`;
        x.fillRect(0, 0, 16, 16);
      }
    };
    const cube = (dy, hh) => {
      face(b.t[0], [20 * k, -10 * k, 20 * k, 10 * k, 4, 14 + dy], 0);
      face(b.t[1], [20 * k, 10 * k, 0, hh * k, 4, 14 + dy], 0.18);
      face(b.t[1], [20 * k, -10 * k, 0, hh * k, 24, 24 + dy], 0.34);
    };
    if (half) cube(11, 11);
    else cube(0, 22);
    if (b.shape === 'stairs') {
      face(b.t[0], [10 * k, -5 * k, 20 * k, 10 * k, 4, 14], 0);
      face(b.t[1], [10 * k, 5 * k, 0, 11 * k, 4, 14], 0.18);
      face(b.t[1], [20 * k, -10 * k, 0, 11 * k, 14, 19], 0.3);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    const ti = B[it] ? (B[it].icon ?? B[it].x) : ITEM[it].icon;
    const [sx, sy] = tileImg(ti);
    x.drawImage(atlas, sx, sy, 16, 16, 4, 4, 40, 40);
  }
  return (iconCache[it] = c);
}
function cloneIcon(it) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.getContext('2d').drawImage(icon(it), 0, 0);
  return c;
}

// ---------- registre ----------
function logEv(kind, text, detail) {
  const t = new Date();
  S.log.unshift({ k: kind, t: t.toTimeString().slice(0, 5), x: text, d: detail || '' });
  if (S.log.length > 200) S.log.length = 200;
  dirty = true;
  const ev = document.createElement('div');
  ev.className = 'ev chip';
  ev.innerHTML = `<b class="${kind}">${{ mint: 'MINT', burn: 'BURN', craft: 'CRAFT', nft: 'NFT' }[kind]}</b>${text}${detail ? ` <span>${detail}</span>` : ''}`;
  $('feed').prepend(ev);
  while ($('feed').children.length > 4) $('feed').lastChild.remove();
  setTimeout(() => {
    ev.style.opacity = 0;
    setTimeout(() => ev.remove(), 600);
  }, 4200);
}
function give(it, n, why) {
  S.inv[it] = (S.inv[it] || 0) + n;
  S.got[it] = 1;
  S.supply[it] = (S.supply[it] || 0) + n;
  S.totalMint += n;
  if (!S.bar.includes(String(it)) && !S.bar.includes(it)) {
    const e = S.bar.indexOf(null);
    if (e >= 0) S.bar[e] = String(it);
  }
  logEv('mint', `${n} ${nameOf(+it)}`, why || `jeton #${it}`);
  dirty = true;
  ui();
}
function take(it, n) {
  S.inv[it] -= n;
  S.supply[it] = Math.max(0, (S.supply[it] || 0) - n);
  S.totalBurn += n;
  if (S.inv[it] <= 0) {
    delete S.inv[it];
    if (!ITEM[it]?.nft) {
      const k = S.bar.indexOf(String(it));
      if (k >= 0) S.bar[k] = null;
    }
  }
  dirty = true;
}
// Debug-only convenience (index.html#debug, window.mines.giveAll()): a stack of every block and
// fungible item, one of each unique item, and the handful of quest flags that track an action
// rather than a possession (killed a mob, slept, traded...) — so late-game building, combat, and
// crafting can be tested without grinding every early objective for materials first. Unique items
// go through mintNft (serial-tracked, not a stackable count), never give(). Solo/local state only:
// nothing here ever reaches Supabase.
function giveAll(stack = 64) {
  const skip = new Set([11, 12, 65, 73, 74]); // water, bedrock, lit lever, dark/old validator: not meant to be held
  for (const id in B) {
    const b = B[id];
    if (skip.has(+id) || b.h === Infinity) continue;
    if (b.o > 0) continue; // only the base orientation of a rotated family (stairs, ladder, gates)
    if (b.shape === 'door' && !(b.f === 0 && !b.open && !b.top)) continue; // only the closed, facing-0 foot half
    give(+id, stack, 'admin');
  }
  for (const id in ITEM) {
    if (ITEM[id].nft) mintNft(+id, 'admin');
    else give(+id, stack, 'admin');
  }
  Object.assign(S, {
    relit: Math.max(S.relit || 0, 1),
    killedMob: 1,
    slept: 1,
    traded: 1,
    visitedCity: 1,
    petted: 1,
    attested: 1,
    gateLit: 1,
    twoKeyDoor: 1,
    gateBlinker: 1,
    gateLatch: 1,
    gateCoinFlip: 1,
  });
  dirty = true;
  ui();
  logEv('mint', 'Admin kit', 'every block, every item, every quest flag');
}
