// Mines d'Éther · Rendu Three.js : scène, maillage des tronçons, main, icônes.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- rendu three ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
} catch (e) {
  $('play').textContent = 'WebGL indisponible sur cet appareil';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.autoClear = false;
renderer.shadowMap.enabled = !touch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe6e0ff, 34, 92);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0xb9a7e0, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e0, 0.9);
sun.castShadow = !touch;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
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
      'uniform vec3 top,hor,sunCol,sunDir;uniform float night;varying vec3 vD;void main(){float h=vD.y;vec3 c=mix(hor,top,pow(clamp(h,0.,1.),.55));c=mix(c,hor*.8,clamp(-h*3.,0.,1.));float s=max(dot(vD,sunDir),0.);c+=sunCol*(smoothstep(.9985,.9992,s)*1.4+pow(s,14.)*.35);float m=max(dot(vD,-sunDir),0.);c+=vec3(.95,.95,1.)*smoothstep(.9990,.9994,m)*night;gl_FragColor=vec4(c,1.);}',
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
const cloudTex = new THREE.CanvasTexture(cloudC);
cloudTex.magFilter = THREE.NearestFilter;
cloudTex.minFilter = THREE.NearestFilter;
cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
cloudTex.repeat.set(3, 3);
const clouds = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: THREE.DoubleSide }),
);
clouds.rotation.x = -Math.PI / 2;
clouds.position.y = SY + 26;
scene.add(clouds);
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

// ---------- maillage par tronçons ----------
const FACES = [
  {
    n: [1, 0, 0],
    a: 0,
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    s: 1,
  },
  {
    n: [-1, 0, 0],
    a: 0,
    c: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
    s: 1,
  },
  {
    n: [0, 1, 0],
    a: 1,
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    s: 0,
  },
  {
    n: [0, -1, 0],
    a: 1,
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    s: 2,
  },
  {
    n: [0, 0, 1],
    a: 2,
    c: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
    s: 1,
  },
  {
    n: [0, 0, -1],
    a: 2,
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    s: 1,
  },
];
const AOF = [0.42, 0.62, 0.82, 1];
const opMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  emissiveMap: emisTex,
  emissive: 0xffffff,
  vertexColors: true,
  alphaTest: 0.5,
});
const glMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  emissiveMap: emisTex,
  emissive: 0xffffff,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
});
const waMat = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.78, depthWrite: false, color: 0xdcefff });
// la surface de l'eau (sommets à 0,86 d'un bloc) ondule ; le fond et l'eau pleine restent fixes
const waterU = { value: 0 };
waMat.onBeforeCompile = sh => {
  sh.uniforms.wtime = waterU;
  sh.vertexShader =
    'uniform float wtime;\n' +
    sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nif(fract(position.y)>.5){transformed.y+=(sin(position.x*1.3+wtime*1.7)+sin(position.z*1.1-wtime*1.3)+sin((position.x+position.z)*.6+wtime*.9))*.022-.035;}',
    );
};
const plMat = new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.5, side: THREE.DoubleSide });
function uvRect(ti) {
  const tx = ti % AN,
    ty = Math.floor(ti / AN),
    e = 0.0008;
  return [tx / AN + e, (tx + 1) / AN - e, 1 - (ty + 1) / AN + e, 1 - ty / AN - e];
}
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
function buildChunk(cx, cz) {
  const arr = CHK.get(ckey(cx, cz));
  if (!arr) return;
  const A = { op: [[], [], [], [], []], gl: [[], [], [], [], []], wa: [[], [], [], []], pl: [[], [], [], []] }; // pos,nor,uv,col,idx
  const pushQ = (G, pts, nor, uvs, cols, flipTri) => {
    const base = G[0].length / 3;
    for (let k = 0; k < 4; k++) {
      G[0].push(...pts[k]);
      G[1].push(...nor);
      G[2].push(...uvs[k]);
      if (cols) G[3].push(cols[k], cols[k], cols[k]);
    }
    const ix = cols ? G[4] : G[3];
    if (flipTri) ix.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // boîte quelconque dans un bloc (dalle, marche, porte…) : faces cachées seulement contre un bloc plein opaque
  const emitBox = (G, x, y, z, bb, tt, big) => {
    const [x0, y0, z0, x1, y1, z1] = bb,
      thin = x1 - x0 < 0.3 ? 0 : z1 - z0 < 0.3 ? 2 : -1;
    for (const f of FACES) {
      const edge =
        (f.n[0] > 0 && x1 === 1) ||
        (f.n[0] < 0 && x0 === 0) ||
        (f.n[1] > 0 && y1 === 1) ||
        (f.n[1] < 0 && y0 === 0) ||
        (f.n[2] > 0 && z1 === 1) ||
        (f.n[2] < 0 && z0 === 0);
      if (edge && isOpaque(get(x + f.n[0], y + f.n[1], z + f.n[2]))) continue;
      const [u0, u1, v0, v1] = uvRect(big != null && f.a === thin ? big : tt[f.s]),
        pts = [],
        uvs = [];
      for (const c of f.c) {
        const px = c[0] ? x1 : x0,
          py = c[1] ? y1 : y0,
          pz = c[2] ? z1 : z0;
        pts.push([x + px, y + py, z + pz]);
        let uu, vv;
        if (f.a === 1) {
          uu = px;
          vv = pz;
        } else if (f.a === 0) {
          uu = f.n[0] > 0 ? 1 - pz : pz;
          vv = py;
        } else {
          uu = f.n[2] > 0 ? px : 1 - px;
          vv = py;
        }
        uvs.push([lerp(u0, u1, uu), lerp(v0, v1, vv)]);
      }
      pushQ(G, pts, f.n, uvs, [1, 1, 1, 1], false);
    }
  };
  for (let y = 0; y < SY; y++)
    for (let z = cz * CH; z < cz * CH + CH; z++)
      for (let x = cx * CH; x < cx * CH + CH; x++) {
        const id = arr[li(x - cx * CH, y, z - cz * CH)];
        if (!id) continue;
        const b = B[id];
        if (!b) continue;
        if (b.x != null) {
          const [u0, u1, v0, v1] = uvRect(b.x),
            o = 0.15;
          for (const [p, q] of [
            [
              [x + o, z + o],
              [x + 1 - o, z + 1 - o],
            ],
            [
              [x + 1 - o, z + o],
              [x + o, z + 1 - o],
            ],
          ])
            pushQ(
              A.pl,
              [
                [p[0], y, p[1]],
                [p[0], y + 1, p[1]],
                [q[0], y + 1, q[1]],
                [q[0], y, q[1]],
              ],
              [0, 1, 0],
              [
                [u0, v0],
                [u0, v1],
                [u1, v1],
                [u1, v0],
              ],
              null,
              false,
            );
          continue;
        }
        if (b.water) {
          for (const f of FACES) {
            const nb = get(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (nb === 11 || (isSolid(nb) && !B[nb].leaf && !B[nb].glass)) continue;
            if (f.n[1] < 0) continue;
            const top = get(x, y + 1, z) !== 11 ? 0.86 : 1;
            const pts = f.c.map(c => [x + c[0], y + (c[1] ? top : 0), z + c[2]]);
            const uvs = pts.map(p =>
              f.a === 1 ? [p[0] * 0.25, p[2] * 0.25] : f.a === 0 ? [p[2] * 0.25, p[1] * 0.25] : [p[0] * 0.25, p[1] * 0.25],
            );
            pushQ(A.wa, pts, f.n, uvs, null, false);
          }
          continue;
        }
        if (b.shape) {
          const key = coordKey(x, y, z),
            pw = POWERED.has(key);
          shapeBoxes(id, key).forEach((bb, bi) =>
            emitBox(
              A.op,
              x,
              y,
              z,
              bb,
              b.shape === 'cable' ? (pw ? [44, 44, 44] : [43, 43, 43]) : b.shape === 'lever' && bi === 1 ? [10, 10, 10] : b.t,
              b.shape === 'door' ? (b.top ? 40 : 39) : null,
            ),
          );
          if (b.shape === 'lever' && b.on) emitBox(A.op, x, y, z, [0.54, 0.52, 0.46, 0.62, 0.6, 0.54], [46, 46, 46], null);
          continue;
        }
        const G = b.glass ? A.gl : A.op,
          lit = id === 68 && POWERED.has(coordKey(x, y, z));
        for (const f of FACES) {
          const nx = x + f.n[0],
            ny = y + f.n[1],
            nz = z + f.n[2],
            nb = get(nx, ny, nz);
          if (ny < 0) continue;
          if (isOpaque(nb)) continue;
          if (nb === id && (b.leaf || b.glass)) continue;
          const [u0, u1, v0, v1] = uvRect(lit ? 46 : b.t[f.s]);
          const u = (f.a + 1) % 3,
            w = (f.a + 2) % 3,
            ao = [],
            pts = [],
            uvs = [];
          for (const c of f.c) {
            const p = [nx, ny, nz],
              du = c[u] ? 1 : -1,
              dw = c[w] ? 1 : -1;
            const p1 = p.slice();
            p1[u] += du;
            const p2 = p.slice();
            p2[w] += dw;
            const p3 = p1.slice();
            p3[w] += dw;
            const s1 = isOpaque(get(...p1)) ? 1 : 0,
              s2 = isOpaque(get(...p2)) ? 1 : 0,
              s3 = isOpaque(get(...p3)) ? 1 : 0;
            ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + s3));
            pts.push([x + c[0], y + c[1], z + c[2]]);
            let uu, vv;
            if (f.a === 1) {
              uu = c[0];
              vv = c[2];
            } else if (f.a === 0) {
              uu = f.n[0] > 0 ? 1 - c[2] : c[2];
              vv = c[1];
            } else {
              uu = f.n[2] > 0 ? c[0] : 1 - c[0];
              vv = c[1];
            }
            uvs.push([lerp(u0, u1, uu), lerp(v0, v1, vv)]);
          }
          pushQ(
            G,
            pts,
            f.n,
            uvs,
            ao.map(a => AOF[a]),
            ao[0] + ao[2] < ao[1] + ao[3],
          );
        }
      }
  const mkG = (G, col) => {
    if (!G[0].length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G[0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G[1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(G[2], 2));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(G[3], 3));
    g.setIndex(new THREE.Uint32BufferAttribute(col ? G[4] : G[3], 1));
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
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    ch.meshes.push(m);
  };
  add(mkG(A.op, true), opMat, true);
  add(mkG(A.gl, true), glMat, false);
  add(mkG(A.wa, false), waMat, false);
  add(mkG(A.pl, false), plMat, false);
}
function rebuildAt(x, z) {
  const cx = Math.floor(x / CH),
    cz = Math.floor(z / CH);
  const set = new Set([cx + ',' + cz]);
  if (x % CH === 0) set.add(cx - 1 + ',' + cz);
  if (x % CH === CH - 1) set.add(cx + 1 + ',' + cz);
  if (z % CH === 0) set.add(cx + ',' + (cz - 1));
  if (z % CH === CH - 1) set.add(cx + ',' + (cz + 1));
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
function flatSprite(ti, s) {
  const g = new THREE.PlaneGeometry(s, s),
    uv = g.attributes.uv,
    [u0, u1, v0, v1] = uvRect(ti);
  for (let i = 0; i < 4; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  uv.needsUpdate = true;
  return g;
}
function setHand() {
  const key = S.bar[S.sel] || 'main',
    it = S.bar[S.sel] ? itemId(S.bar[S.sel]) : null;
  if (key === handKey) return;
  handKey = key;
  if (handMesh) {
    hand.remove(handMesh);
    handMesh.geometry.dispose();
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
  } else {
    const ti = B[it] ? (B[it].icon ?? B[it].x) : ITEM[it].icon;
    handMesh = new THREE.Mesh(
      flatSprite(ti, 0.5),
      new THREE.MeshLambertMaterial({ map: atlasTex, emissiveMap: emisTex, emissive: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide }),
    );
    handMesh.position.set(0.42, -0.28, -0.62);
    handMesh.rotation.set(0, -0.5, 0.2);
  }
  hand.add(handMesh);
}
resize();
addEventListener('resize', resize);

// ---------- icônes (cube isométrique à partir de l'atlas) ----------
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
      half = b.shape === 'slab' || b.shape === 'stairs';
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
