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
// (inside the face's own tile coordinates, so it costs nothing in geometry), only where it meets another
// block's face: the land's outer edges are rounded by the mesher instead (mesh.js rounded, its edge bits)
if (CLAY)
  opMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute float edge;\nvarying float vEdge;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = edge;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `varying float vEdge;
        #include <common>`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 tq = fract(vUv * ${AN}.0);
      float eb = floor(vEdge + 0.5);
      // the face's outer sides (mesh.js edge bits: u = 0, u = 1, v = 0, v = 1)
      vec4 outer = vec4(mod(eb, 2.0), mod(floor(eb / 2.0), 2.0), mod(floor(eb / 4.0), 2.0), mod(floor(eb / 8.0), 2.0));
      vec4 dist = vec4(tq.x, 1.0 - tq.x, tq.y, 1.0 - tq.y);
      // the toy brick's seam, only where the face meets another block's (an outer edge is rounded instead)
      vec4 seamD = mix(dist, vec4(1.0), outer);
      float ed = min(min(seamD.x, seamD.y), min(seamD.z, seamD.w));
      diffuseColor.rgb *= mix(0.84, 1.0, smoothstep(0.0, 0.028, ed)) * mix(1.1, 1.0, smoothstep(0.028, 0.1, ed));
`,
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
    if (G.edge) g.setAttribute('edge', new THREE.BufferAttribute(G.edge, 1));
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
// a long thin blade along +y as one extruded shape: its width narrows toward a real point (a katana's back
// stays straight to the end, its edge sweeps up into it), with a glowing strip along the cutting edge(s)
function bladeGeos({ len = 1, bend = 0.12, w0 = 0.075, narrow = 0.45, tip = 0.16, single = true, edgeW = 0.016, fuller = false }) {
  const N = 40,
    L = [],
    R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N,
      y = -0.02 + t * len,
      xc = bend * t * t,
      w = w0 * (1 - narrow * t);
    let kL = 1,
      kR = 1;
    if (t > 1 - tip) {
      const u = (t - (1 - tip)) / tip;
      kR = Math.sqrt(Math.max(0, 1 - u * u));
      kL = single ? 1 - u * u * u : kR;
    }
    L.push([xc - (w / 2) * kL, y]);
    R.push([xc + (w / 2) * kR, y]);
  }
  const outline = (a, b) => {
    const sh = new THREE.Shape();
    sh.moveTo(...a[0]);
    for (const q of a.slice(1)) sh.lineTo(...q);
    for (const q of b.slice().reverse()) sh.lineTo(...q);
    return sh;
  };
  const body = new THREE.ExtrudeGeometry(outline(L, R), {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  body.translate(0, 0, -0.011);
  const strip = side => {
    const out = [],
      inn = [];
    for (let i = 1; i <= N; i++) {
      const [x, y] = side[i],
        cx = (L[i][0] + R[i][0]) / 2,
        d = Math.sign(x - cx) || 1;
      out.push([x + d * 0.002, y]);
      inn.push([x - d * Math.min(edgeW, Math.abs(x - cx) * 0.9), y]);
    }
    const geo = new THREE.ExtrudeGeometry(outline(out, inn), { depth: 0.04, bevelEnabled: false });
    geo.translate(0, 0, -0.02);
    return geo;
  };
  const edges = single ? [strip(R)] : [strip(R), strip(L)];
  // a glowing groove down the middle of the blade (the fuller)
  if (fuller) {
    const a = [],
      b = [];
    for (let i = 2; i <= N - 8; i++) {
      const cx = (L[i][0] + R[i][0]) / 2;
      a.push([cx - 0.006, L[i][1]]);
      b.push([cx + 0.006, L[i][1]]);
    }
    const geo = new THREE.ExtrudeGeometry(outline(a, b), { depth: 0.042, bevelEnabled: false });
    geo.translate(0, 0, -0.021);
    edges.push(geo);
  }
  return { body, edges };
}
// the pickaxe's parts (clayModel): built once, shared by every pickaxe (only the materials differ)
const pickHandleGeo = new THREE.CylinderGeometry(0.03, 0.038, 0.9, 8),
  pickHalfGeo = (() => {
    // half an octahedron (a square pyramid pointing up), its corners on the axes like the Ether diamond's
    const g = new THREE.ConeGeometry(0.075, 0.1, 4, 1);
    g.translate(0, 0.05, 0);
    g.scale(1, 1, 0.6);
    return g;
  })(),
  pickCapGeo = (() => {
    const g = new THREE.ConeGeometry(0.05, 0.03, 4, 1);
    g.scale(1, 1, 0.6);
    return g;
  })(),
  pickArmGeo = (() => {
    // one blade, to the right (+x): a square-cut root near the diamond, a curve out and down, a point
    const N = 24,
      top = [],
      bot = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N,
        x = 0.1 + 0.44 * t,
        y = 0.5 + 0.03 * t - 0.24 * t * t,
        w = 0.068 * Math.pow(1 - t, 0.75) + 0.004, // thick at the root, thin at the tip
        dx = 0.44,
        dy = 0.03 - 0.48 * t,
        l = Math.hypot(dx, dy),
        nx = -dy / l,
        ny = dx / l;
      top.push([x + nx * w * 0.6, y + ny * w * 0.6]);
      bot.push([x - nx * w * 0.4, y - ny * w * 0.4]);
    }
    const sh = new THREE.Shape();
    sh.moveTo(...top[0]);
    for (const p of top.slice(1)) sh.lineTo(...p);
    for (const p of bot.reverse()) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2 });
    g.translate(0, 0, -0.025);
    return g;
  })();
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
  // the Crystal Pickaxe in the Ether Crystals' cyan, the Pure Ether one in the Pure Shards' violet (their icons)
  const PICK = { 102: ['#b07a52', '#e2c39b', '#000000'], 201: ['#3b4f7a', '#8ff0ff', '#1f7f90'], 202: ['#4a3b7a', '#a99cff', '#3a2d8a'] },
    // blades: [steel, glowing edge, guard and pommel, grip]
    BLADE = {
      106: ['#fff4cc', '#ffd166', '#c98a20', '#4a3b7a'],
      107: ['#e8fffd', '#7fe8ff', '#2aa8b8', '#3a2d52'],
      301: ['#dcd6ff', '#7fe8ff', '#8a7bef', '#2a1838'],
    };
  if (PICK[it]) {
    // Pierre's sketch: a long straight handle, the Ethereum diamond at the top of it (a small cap, a
    // pyramid pointing up, one pointing down, a hair apart), and on each side, set slightly apart from the
    // diamond, a curved blade: square-cut where it starts, sweeping out and down into a point
    const [h, c, e] = PICK[it],
      head = gem(c, e, it === 102 ? 0 : 0.4),
      light = gem(new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35), e, it === 102 ? 0 : 0.5);
    add(pickHandleGeo, matte(h), 0, -0.13, 0);
    add(pickHalfGeo, light, 0, 0.47, 0);
    add(pickHalfGeo, head, 0, 0.43, 0).rotation.x = Math.PI;
    add(pickCapGeo, light, 0, 0.59, 0);
    for (const sx of [-1, 1]) add(pickArmGeo, head, 0, 0, 0).scale.x = sx;
  } else if (BLADE[it]) {
    // the ether blade: long, straight and thin, both edges and the fuller glowing, a guard in the shape of
    // the Ethereum diamond and a small glowing gem for a pommel
    const [c, e, guard, grip] = BLADE[it],
      { body, edges } = bladeGeos({ len: 1.05, bend: 0, w0: 0.07, narrow: 0.3, tip: 0.14, single: false, edgeW: 0.01, fuller: true }),
      glow = new THREE.MeshBasicMaterial({ color: e }),
      jewel = col => new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, flatShading: true });
    g.add(new THREE.Mesh(body, new THREE.MeshPhongMaterial({ color: c, shininess: 70 })));
    for (const eg of edges) g.add(new THREE.Mesh(eg, glow));
    add(new THREE.OctahedronGeometry(0.07), jewel(guard), 0, -0.05, 0).scale.set(1.6, 0.6, 0.6);
    add(new THREE.CylinderGeometry(0.03, 0.033, 0.3, 10), matte(grip), 0, -0.22, 0);
    add(new THREE.OctahedronGeometry(0.045), jewel(e), 0, -0.4, 0).scale.y = 1.4;
  } else if (it === 206) {
    // the pistol: barrel toward +x like its icon, a glowing core in the middle
    add(new THREE.BoxGeometry(0.5, 0.17, 0.14), matte('#4a3b7a'), 0.02, 0.06, 0);
    const b = add(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10), matte('#6a58e0'), 0.38, 0.08, 0, Math.PI / 2);
    b.rotation.z = -Math.PI / 2;
    add(new THREE.BoxGeometry(0.13, 0.28, 0.12), matte('#2a1838'), -0.12, -0.14, 0, 0.25);
    add(new THREE.OctahedronGeometry(0.075), gem('#7fe8ff', '#7fe8ff', 0.9), 0.06, 0.06, 0.07);
    clayModels[it] = g;
    return g.clone();
  } else if (clayItem(it, g, add, gem, matte)) {
    // the other items (materials, platings, keepsakes, the hovercraft keys, potions): held upright
    g.userData.upright = true;
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
// ---------- the clay look's items: each one a small model in the pickaxe's style ----------
// Faceted gems that glow a little, matte metal and stone, built from the item's own icon colors. Built
// standing up around the origin, about 0.6 to 1 tall (setHand and updateAvatarHand scale them). Returns
// false for an item with no model here (it keeps the voxels of its icon).
const ethDiamond = (() => {
  // the Ethereum diamond: a tall pyramid up, a shorter one down, a hair apart (like the pickaxe's head)
  const up = new THREE.ConeGeometry(0.5, 0.62, 4, 1),
    down = new THREE.ConeGeometry(0.5, 0.42, 4, 1);
  up.translate(0, 0.31 + 0.02, 0);
  down.rotateX(Math.PI);
  down.translate(0, -0.21, 0);
  return { up, down };
})();
function clayItem(it, g, add, gem, matte) {
  const glow = c => new THREE.MeshBasicMaterial({ color: c }),
    glass = new THREE.MeshPhongMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.32, shininess: 120, depthWrite: false }),
    oct = (r, mat, x, y, z, sy = 1, sz = 0.7) => {
      const m = add(new THREE.OctahedronGeometry(r), mat, x, y, z);
      m.scale.set(1, sy, sz);
      return m;
    },
    diamond = (s, top, bottom, x = 0, y = 0, z = 0) => {
      const a = add(ethDiamond.up, top, x, y, z),
        b = add(ethDiamond.down, bottom, x, y, z);
      for (const m of [a, b]) m.scale.set(s, s, s * 0.62);
      return [a, b];
    };
  // a cluster of crystals on a little rock: the Ether Crystal, the Pure Shard
  const CRYSTAL = { 101: ['#8ff0ff', '#1f9fb0', '#3b4f7a'], 103: ['#c4b5ff', '#5a3fd0', '#3a2d52'] };
  // a breastplate: [plate, glow, trim]
  const PLATE = {
    108: ['#2a1838', '#00eaff', '#4a3b7a'],
    109: ['#2a1838', '#c2b8ff', '#e8e2ff'],
    302: ['#1d1418', '#ffb347', '#3a2228'],
    209: ['#2a2236', '#ffd166', '#f4f0ff'],
  };
  // the hovercraft keys: two diamonds on a gold bridge, a base in the craft's color [diamond, glow, base]
  const TWIN = {
    213: ['#8ff0ff', '#1f9fb0', '#8ff0ff'],
    214: ['#c4b5ff', '#6a58e0', '#b9a8ff'],
    215: ['#4a3b5a', '#ffb347', '#ffb347'],
    216: ['#ffe9a8', '#ffb347', '#ffe9a8'],
  };
  // the neon gliders: a flat diamond wing, dark in the middle, a glowing rim [rim, glow]
  const GLIDER = { 217: ['#8ff0ff', '#3fc8e8'], 218: ['#c4b5ff', '#8a7bef'], 219: ['#ffb347', '#ff8a3d'], 220: ['#ffe9a8', '#ffd166'] };
  // potions: [liquid, glow]
  const POTION = { 303: ['#ff6f9c', '#ff3d7f'], 304: ['#ffd84a', '#ffb000'], 305: ['#8fb4ff', '#4f7fff'] };
  if (CRYSTAL[it]) {
    const [c, e, rock] = CRYSTAL[it],
      m = gem(c, e, 0.45),
      lt = gem(new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.4), e, 0.5);
    add(new THREE.DodecahedronGeometry(0.2), matte(rock), 0, -0.28, 0).scale.set(1.3, 0.55, 1);
    oct(0.16, m, 0, 0.08, 0, 2.4, 0.8);
    oct(0.1, lt, -0.15, -0.08, 0.04, 1.9, 0.8).rotation.z = 0.45;
    oct(0.09, m, 0.14, -0.1, -0.03, 1.7, 0.8).rotation.z = -0.5;
  } else if (it === 104) {
    // the Genesis Fragment: a jagged lump of basalt split open by an ember seam
    const rock = matte('#2a1a22');
    add(new THREE.DodecahedronGeometry(0.24), rock, -0.05, 0, 0).scale.set(0.8, 1.15, 0.7);
    add(new THREE.DodecahedronGeometry(0.17), rock, 0.12, 0.1, 0.02).scale.set(0.8, 1.2, 0.7);
    oct(0.12, gem('#ffb347', '#ff7a1a', 1), 0.03, 0.04, 0.1, 2.4, 0.6).rotation.z = -0.25;
    oct(0.07, gem('#ffd166', '#ff9a3d', 1), -0.13, -0.12, 0.1, 1.6, 0.6).rotation.z = 0.5;
    add(new THREE.BoxGeometry(0.14, 0.025, 0.03), glow('#ff8a3d'), -0.07, 0.14, 0.15, 0.9);
    add(new THREE.BoxGeometry(0.14, 0.025, 0.03), glow('#ff8a3d'), 0.12, -0.1, 0.15, -0.7);
  } else if (it === 105) {
    // the Validator Heart: a golden diamond floating over a glowing rose cradle
    diamond(0.4, gem('#ffe9a8', '#ffb347', 0.6), gem('#ffd166', '#c98a20', 0.5), 0, 0.12, 0);
    add(new THREE.TorusGeometry(0.15, 0.035, 6, 16), gem('#ff7aa8', '#ff3d7f', 0.7), 0, -0.2, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.1, 0.14, 0.12, 8), matte('#4a2a3a'), 0, -0.29, 0);
  } else if (it === 110) {
    // the Diamond Shard: a slender Ethereum diamond, pale gold
    const [a, b] = diamond(0.42, gem('#fff4cc', '#ffd166', 0.7), gem('#ffd166', '#c98a20', 0.5));
    a.scale.y = b.scale.y = 0.62;
    a.scale.x = b.scale.x = 0.36;
  } else if (PLATE[it]) {
    // a breastplate, its shoulders, and the glowing seam (as worn: ARMOR_LOOKS, 14-startup.js)
    const [plate, e, trim] = PLATE[it],
      pm = new THREE.MeshPhongMaterial({ color: plate, shininess: 50, flatShading: true }),
      tm = matte(trim),
      gm = glow(e);
    add(new THREE.BoxGeometry(0.5, 0.52, 0.16), pm, 0, 0, 0);
    add(new THREE.BoxGeometry(0.36, 0.16, 0.18), pm, 0, -0.26, 0);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.2, 0.08, 0.24), tm, s * 0.3, 0.27, 0).rotation.z = s * -0.25;
      add(new THREE.BoxGeometry(0.04, 0.3, 0.02), gm, s * 0.15, 0.02, 0.085);
    }
    add(new THREE.BoxGeometry(0.06, 0.44, 0.02), gm, 0, -0.02, 0.085);
    oct(0.07, gem(e, e, 0.9), 0, 0.08, 0.1, 1.3, 0.6);
    if (it === 209) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.36, 0.02), matte('#f4f0ff'), s * 0.21, -0.02, 0.083);
  } else if (it === 203) {
    // the Validator Seal: a gold medallion, the Ethereum diamond in violet on both faces
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24), gem('#ffd166', '#c98a20', 0.35), 0, 0, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.3, 0.025, 6, 24), gem('#ffe9a8', '#c98a20', 0.4), 0, 0, 0);
    for (const s of [-1, 1]) diamond(0.24, gem('#a99cff', '#6a58e0', 0.6), gem('#8a7bef', '#4a3bd0', 0.5), 0, 0.02, s * 0.04);
  } else if (it === 204) {
    // the Validator Star: four golden points around a bright heart
    const m = gem('#ffd166', '#ffb347', 0.6);
    for (const r of [0, Math.PI / 2]) oct(0.42, m, 0, 0, 0, 0.18, 0.18).rotation.z = r;
    oct(0.12, gem('#fff4cc', '#ffe9a8', 1), 0, 0, 0, 1, 1);
  } else if (it === 205) {
    // the Genesis Titan Fang: a long curved fang, basalt with an ember edge, set in a dark root
    const { body, edges } = bladeGeos({ len: 0.8, bend: -0.3, w0: 0.3, narrow: 0.7, tip: 0.45, single: true, edgeW: 0.02 });
    const f = new THREE.Group();
    f.add(new THREE.Mesh(body, new THREE.MeshPhongMaterial({ color: '#4a3b5a', shininess: 40, flatShading: true })));
    for (const eg of edges) f.add(new THREE.Mesh(eg, glow('#ffb347')));
    f.position.set(0.05, -0.38, 0);
    f.scale.z = 3;
    g.add(f);
    add(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 6), matte('#2a1a22'), 0.05, -0.42, 0);
  } else if (it === 207) {
    // the Titan Core Shard: a tall stone shard, an ember vein running up it
    oct(0.2, new THREE.MeshPhongMaterial({ color: '#7a6b8a', flatShading: true, shininess: 30 }), 0, 0, 0, 2.3, 0.55);
    add(new THREE.BoxGeometry(0.035, 0.7, 0.02), glow('#ffb347'), 0, 0, 0.1);
  } else if (it === 208) {
    // the Plasma Conduit Core: a burning magenta orb in a dark cage of two rings
    add(new THREE.IcosahedronGeometry(0.17, 1), gem('#ff7ae8', '#ff3dd0', 1), 0, 0, 0);
    const cage = matte('#3a2252');
    add(new THREE.TorusGeometry(0.26, 0.03, 6, 20), cage, 0, 0, 0);
    add(new THREE.TorusGeometry(0.26, 0.03, 6, 20), cage, 0, 0, 0).rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), cage, 0, s * 0.3, 0);
  } else if (it === 210) {
    // the Difficulty Bomb Fragment: a dark cracked shell, embers showing through, a fuse with a spark
    add(new THREE.DodecahedronGeometry(0.24, 0), new THREE.MeshPhongMaterial({ color: '#1d1626', flatShading: true }), 0, -0.04, 0);
    for (const [x, y, r] of [
      [-0.06, 0.02, 0.8],
      [0.06, -0.08, 0.9],
      [0.0, -0.13, -0.6],
    ])
      add(new THREE.BoxGeometry(0.16, 0.025, 0.03), glow('#ff8a3d'), x, y, 0.2, r);
    add(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 6), matte('#8a6a52'), 0.06, 0.24, 0, -0.4);
    oct(0.04, gem('#ffe9a8', '#ffb347', 1), 0.1, 0.32, 0, 1, 1);
  } else if (it === 211) {
    // the Front-Runner Boots: the pair, dark shells, a glowing stripe across the toe and a little thruster
    const shell = matte('#21161a'),
      gl = new THREE.MeshLambertMaterial({ color: 0x3fc8e8, emissive: 0x2aa8d0, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) {
      const x = s * 0.15;
      add(new THREE.BoxGeometry(0.2, 0.32, 0.2), shell, x, 0.04, -0.05);
      add(new THREE.BoxGeometry(0.22, 0.14, 0.38), shell, x, -0.14, 0.02);
      add(new THREE.BoxGeometry(0.23, 0.035, 0.035), gl, x, -0.12, 0.21);
      add(new THREE.BoxGeometry(0.22, 0.03, 0.22), gl, x, 0.15, -0.05);
      add(new THREE.BoxGeometry(0.08, 0.05, 0.03), gl, x, -0.17, -0.18);
    }
  } else if (it === 212) {
    // the Flashbots Bundle: three glowing bars, lilac, peach and cyan, strapped together in gold
    [
      ['#c4b5ff', '#8a7bef'],
      ['#ffc8a8', '#ff9a6a'],
      ['#8ff0ff', '#3fc8e8'],
    ].forEach(([c, e], i) => add(new THREE.BoxGeometry(0.46, 0.12, 0.14), gem(c, e, 0.6), 0, 0.15 - i * 0.15, 0));
    add(new THREE.BoxGeometry(0.07, 0.5, 0.17), gem('#ffd166', '#c98a20', 0.4), 0, 0, 0);
  } else if (TWIN[it]) {
    // the hovercraft keys: two Ethereum diamonds on a gold bridge, over a base of the craft's color
    const [c, e, base] = TWIN[it],
      top = gem(new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.3), e, 0.6),
      bot = gem(c, e, 0.5);
    for (const s of [-1, 1]) diamond(0.36, top, bot, s * 0.2, 0.08, 0);
    add(new THREE.BoxGeometry(0.22, 0.045, 0.045), gem('#ffd166', '#c98a20', 0.4), 0, 0.16, 0);
    add(new THREE.BoxGeometry(0.66, 0.05, 0.16), gem(base, e, 0.5), 0, -0.16, 0);
  } else if (GLIDER[it]) {
    // the neon gliders: a flat diamond wing, dark at its heart, its rim glowing, over a glowing keel
    const [c, e] = GLIDER[it];
    oct(0.36, gem(c, e, 0.8), 0, 0.04, 0, 1, 0.12);
    oct(0.27, new THREE.MeshPhongMaterial({ color: '#1d1626', flatShading: true }), 0, 0.04, 0.012, 1, 0.12);
    oct(0.27, new THREE.MeshPhongMaterial({ color: '#1d1626', flatShading: true }), 0, 0.04, -0.012, 1, 0.12);
    add(new THREE.BoxGeometry(0.44, 0.035, 0.05), glow(e), 0, -0.1, 0);
  } else if (POTION[it]) {
    // a potion: a round glass flask, the glowing liquid inside, a neck and a cork
    const [c, e] = POTION[it];
    add(new THREE.SphereGeometry(0.16, 12, 10), gem(c, e, 0.7), 0, -0.14, 0).scale.y = 0.95;
    add(new THREE.SphereGeometry(0.2, 14, 12), glass, 0, -0.12, 0);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 10), glass, 0, 0.13, 0);
    add(new THREE.CylinderGeometry(0.065, 0.06, 0.08, 10), matte('#8a6a52'), 0, 0.24, 0);
  } else if (it === 306) {
    // the Ward Incense: a stick in a little dish, its tip glowing, a lilac curl of smoke
    add(new THREE.CylinderGeometry(0.2, 0.14, 0.09, 12), matte('#4a3b5a'), 0, -0.28, 0);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6), matte('#6a4a36'), 0, -0.04, 0);
    oct(0.035, gem('#ffb347', '#ff7a1a', 1), 0, 0.18, 0, 1, 1);
    const smoke = new THREE.MeshLambertMaterial({
      color: '#c4b5ff',
      transparent: true,
      opacity: 0.55,
      emissive: '#6a58e0',
      emissiveIntensity: 0.4,
    });
    [
      [0.02, 0.26, 0.05],
      [-0.04, 0.34, 0.045],
      [0.03, 0.41, 0.04],
    ].forEach(([x, y, r]) => add(new THREE.IcosahedronGeometry(r, 0), smoke, x, y, 0));
  } else if (it === 307) {
    // the Home Beacon: a little lantern, a warm light behind four dark posts
    const frame = matte('#3a2d52');
    add(new THREE.BoxGeometry(0.2, 0.3, 0.2), gem('#ffb347', '#ff8a3d', 1), 0, 0, 0);
    for (const y of [-0.19, 0.19]) add(new THREE.BoxGeometry(0.3, 0.06, 0.3), frame, 0, y, 0);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      add(new THREE.BoxGeometry(0.04, 0.34, 0.04), frame, x * 0.12, 0, z * 0.12);
    add(new THREE.TorusGeometry(0.07, 0.015, 6, 12), frame, 0, 0.27, 0);
  } else return false;
  return true;
}
// A block that isn't a plain cube (a door, a ladder, a fence, a pane, furniture, a lever, a plate, a plant,
// a lily pad...), held in the clay look: drawn as it stands in the world, with the world's own materials
// (the chunk mesher, Mesh.meshChunk, on a world holding only it). The door stands on its two halves, the
// fence as a short run of two posts. Centered on the origin, scaled to fit a unit (userData.fit).
const blockModels = {},
  HELD_BLOCKS = {
    48: [
      [0, 0, 48],
      [0, 1, 49],
    ],
    92: [
      [0, 0, 92],
      [1, 0, 92],
    ],
  };
function blockModel(id) {
  id = +id;
  if (!CLAY) return null;
  if (blockModels[id] !== undefined) return blockModels[id] && blockModels[id].clone();
  const cells = new Map((HELD_BLOCKS[id] || [[0, 0, id]]).map(([x, y, b]) => [x + ',' + (y + 1), b])),
    get = (x, y, z) => (z !== 0 ? 0 : cells.get(x + ',' + y) || 0);
  let M = null;
  try {
    M = Mesh.pack(Mesh.meshChunk(0, 0, get, () => false));
  } catch (e) {
    console.warn(e);
  }
  const g = new THREE.Group();
  for (const [k, mat] of [
    ['op', opMat],
    ['gl', glMat],
    ['pl', plMat],
  ]) {
    const G = M && M[k];
    if (!G || !G.idx || !G.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(G.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(G.nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(G.uv, 2));
    if (G.col) geo.setAttribute('color', new THREE.BufferAttribute(G.col, 3));
    if (G.edge) geo.setAttribute('edge', new THREE.BufferAttribute(G.edge, 1));
    geo.setIndex(new THREE.BufferAttribute(G.idx, 1));
    g.add(new THREE.Mesh(geo, mat));
  }
  if (!g.children.length) {
    blockModels[id] = null;
    return null;
  }
  const box = new THREE.Box3().setFromObject(g),
    c = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3());
  for (const m of g.children) {
    m.geometry.translate(-c.x, -c.y, -c.z);
    m.geometry.computeBoundingSphere();
  }
  g.userData.fit = 1 / Math.max(size.x, size.y, size.z, 0.3);
  blockModels[id] = g;
  return g.clone();
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
    if (handMesh.userData.upright) {
      // standing in the palm, a little to the right and up, turned to show its face
      handMesh.scale.setScalar(0.3);
      handMesh.position.set(0.32, -0.2, -0.66);
      handMesh.rotation.set(0.12, -0.45, 0.06);
    }
    if (ITEM[it]?.ranged) {
      handMesh.scale.setScalar(0.34);
      handMesh.position.set(0.275, -0.275, -0.7);
      handMesh.rotation.set(0.02, 1.76, 0.11);
    }
  } else if (B[it] && blockModel(it)) {
    // a door, a ladder, furniture, a plant...: as it stands in the world, in the palm, turned to show it
    handMesh = blockModel(it);
    handMesh.userData.shared = true;
    handMesh.scale.setScalar(0.36 * handMesh.userData.fit);
    handMesh.position.set(0.32, -0.22, -0.66);
    handMesh.rotation.set(0.25, 0.65, 0);
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
