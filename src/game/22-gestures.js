// Everyday gestures: what moves when you use the world. A door swings on its hinge, a lever flips, a
// chest's lid lifts while it's open, a placed block grows into place, a mined block flies to you; you lie
// down in a bed, sit on a chair or a sofa, eat at a table. While a block moves, the chunk meshes it as air
// (HIDE, 04-render.js) and a copy built by the same mesher (miniModel) stands in for it, so the copy looks
// exactly like the block; when the move ends the chunk shows the block again and the copy goes.
// Lying, sitting and eating are gestures like the emotes (21-emotes.js, rules.js EMOTES with hidden: 1):
// the others see them on your figure.
const GESTS = []; // running: { key, t, dur, step(k), end() }
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// the copy of a few blocks, in block coordinates (cells: [dx, dy, dz, id]), meshed as the world would.
// boxes (optional): a made-up piece of furniture, as rules.js describes one (boxes, t, bt)
function miniModel(cells, made) {
  const FAKE = 255;
  if (made) B[FAKE] = { n: '', shape: 'furn', h: 1, ...made };
  const at = new Map(cells.map(([x, y, z, id]) => [x + 1 + ',' + (y + 8) + ',' + (z + 1), made ? FAKE : id]));
  let M = null;
  try {
    M = Mesh.pack(
      Mesh.meshChunk(
        0,
        0,
        (x, y, z) => at.get(x + ',' + y + ',' + z) || 0,
        () => false,
      ),
    );
  } catch (e) {
    console.warn(e);
  } finally {
    if (made) delete B[FAKE];
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
    geo.translate(-1, -8, -1);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
function dropModel(g) {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  g.traverse(m => m.geometry && m.geometry.dispose());
}
// mesh the chunks around (x, z) again; resolves once they show
function remesh(x, z) {
  const cx = cOf(x),
    cz = cOf(z),
    all = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const k = ckey(cx + dx, cz + dz);
      // only the chunks that touch the block
      const lx = x - (cx + dx) * CH,
        lz = z - (cz + dz) * CH;
      if (lx < -1 || lx > CH || lz < -1 || lz > CH) continue;
      if (MESH.has(k)) all.push(buildChunk(cx + dx, cz + dz));
    }
  return Promise.all(all);
}
// a block stands in for itself a moment: hidden in its chunk until end() shows it again
function standIn(keys, x, z, g, dur, step, after) {
  for (const o of GESTS.filter(o => keys.includes(o.key))) cutGesture(o);
  for (const k of keys) HIDE.add(k);
  scene.add(g);
  remesh(x, z);
  const o = {
    key: keys[0],
    keys,
    g,
    t: 0,
    dur,
    step,
    end() {
      for (const k of keys) HIDE.delete(k);
      remesh(x, z).then(() => dropModel(g));
      if (after) after();
    },
  };
  GESTS.push(o);
  step(0);
  return o;
}
// stopped before its end (the same block moves again): the copy goes at once, the block stays hidden
function cutGesture(o) {
  const i = GESTS.indexOf(o);
  if (i >= 0) GESTS.splice(i, 1);
  dropModel(o.g);
  for (const k of o.keys || []) HIDE.delete(k);
}
function tickGestures(dt) {
  for (let i = GESTS.length - 1; i >= 0; i--) {
    const o = GESTS[i];
    o.t += dt;
    const k = Math.min(1, o.t / o.dur);
    o.step(k);
    if (k >= 1) {
      GESTS.splice(i, 1);
      o.end();
    }
  }
  tickFlights(dt);
  tickChestLid(dt);
}

// ---------- a door: the panel turns on its hinge ----------
// closed, a door of facing f is the panel DOORB[f]; open, DOORB[f + 1]: the same panel turned a quarter
// (-90° around y) about the corner they share, the hinge
const DOOR_HINGE = [
  [0.094, 0.094],
  [0.094, 0.906],
  [0.906, 0.906],
  [0.906, 0.094],
];
function swingDoor(x, y, z, f, opening) {
  const top = B[get(x, y + 1, z)]?.shape === 'door',
    keys = [coordKey(x, y, z)].concat(top ? [coordKey(x, y + 1, z)] : []),
    m = miniModel([[0, 0, 0, 48 + f * 4]].concat(top ? [[0, 1, 0, 49 + f * 4]] : [])),
    [hx, hz] = DOOR_HINGE[f],
    piv = new THREE.Group();
  m.position.set(-hx, 0, -hz);
  piv.add(m);
  piv.position.set(x + hx, y, z + hz);
  standIn(keys, x, z, piv, 0.32, k => {
    const e = ease(k);
    piv.rotation.y = (-Math.PI / 2) * (opening ? e : 1 - e);
  });
}
// a door block changed (yours, someone else's, a circuit's): swing it if its panel moved
function doorChanged(x, y, z, before, after, pwBefore, pwAfter) {
  const a = B[before],
    b = B[after];
  if (a?.shape !== 'door' || b?.shape !== 'door' || a.top || b.top || a.f !== b.f) return;
  const was = !!(a.open || pwBefore),
    is = !!(b.open || pwAfter);
  if (was !== is && near(x, z)) swingDoor(x, y, z, b.f, is);
}
const near = (x, z, r = 40) => Math.hypot(x + 0.5 - P.x, z + 0.5 - P.z) < r;

// ---------- a lever: the handle tips over to the other side ----------
const LEVER_TILT = 0.34;
function flipLever(x, y, z, on) {
  const base = miniModel([[0, 0, 0]], { t: [3, 3, 3], boxes: [[0.3, 0, 0.3, 0.7, 0.12, 0.7]] }),
    handle = miniModel([[0, 0, 0]], { t: [3, 3, 3], boxes: [[0.46, 0.1, 0.46, 0.54, 0.58, 0.54]] }),
    g = new THREE.Group(),
    piv = new THREE.Group();
  handle.position.set(-0.5, -0.1, -0.5);
  piv.add(handle);
  piv.position.set(0.5, 0.1, 0.5);
  g.add(base, piv);
  g.position.set(x, y, z);
  // (the block shows the handle off at -x, on at +x: a +z turn tips its top toward -x)
  standIn([coordKey(x, y, z)], x, z, g, 0.22, k => {
    const e = ease(k);
    piv.rotation.z = on ? LEVER_TILT * (1 - 2 * e) : -LEVER_TILT * (1 - 2 * e);
  });
}

// ---------- a chest: the lid lifts while it's open, from the side away from you ----------
let LID = null; // { x, y, z, g, hinge, k }
function openChestLid(x, y, z) {
  if (LID && LID.x === x && LID.y === y && LID.z === z) return;
  if (LID) shutLid(LID);
  const g = new THREE.Group(),
    body = miniModel([[0, 0, 0]], {
      boxes: [
        [0, 0, 0, 1, 0.64, 1],
        [0.07, 0.6, 0.07, 0.93, 0.645, 0.93],
      ],
      bt: [B[98].t, [12, 12, 12]],
      t: B[98].t,
    }),
    lid = miniModel([[0, 0, 0]], { t: B[98].t, boxes: [[0, 0.64, 0, 1, 1, 1]] }),
    hinge = new THREE.Group();
  // built facing -z (you), hinged along its back top edge (z = 1): a +x turn lifts the front
  body.position.set(-0.5, 0, -0.5);
  lid.position.set(-0.5, -0.64, -1);
  hinge.add(lid);
  hinge.position.set(0, 0.64, 0.5);
  g.add(body, hinge);
  g.position.set(x + 0.5, y, z + 0.5);
  g.rotation.y = Math.round(Math.atan2(-(P.x - x - 0.5), -(P.z - z - 0.5)) / (Math.PI / 2)) * (Math.PI / 2);
  const key = coordKey(x, y, z);
  HIDE.add(key);
  scene.add(g);
  remesh(x, z);
  LID = { x, y, z, g, hinge, key, k: 0 };
}
function shutLid(l) {
  HIDE.delete(l.key);
  remesh(l.x, l.z).then(() => dropModel(l.g));
  if (LID === l) LID = null;
}
// open as long as the chest is (CHEST, 06-actions.js), a quarter of a second each way
function tickChestLid(dt) {
  const l = LID;
  if (!l) return;
  const open = typeof CHEST !== 'undefined' && CHEST && CHEST.x === l.x && CHEST.y === l.y && CHEST.z === l.z;
  l.k = Math.max(0, Math.min(1, l.k + (open ? dt : -dt) / 0.26));
  l.hinge.rotation.x = 1.15 * ease(l.k);
  if (!open && l.k <= 0) shutLid(l);
}

// ---------- a placed block grows into place ----------
function growBlock(x, y, z, id) {
  if (!id || !B[id] || B[id].shape === 'door' || (B[id].shape || '').startsWith('bed')) return;
  const m = miniModel([[0, 0, 0, id]]),
    g = new THREE.Group();
  m.position.set(-0.5, -0.5, -0.5);
  g.add(m);
  g.position.set(x + 0.5, y + 0.5, z + 0.5);
  standIn([coordKey(x, y, z)], x, z, g, 0.2, k => {
    // from 60%, a little past full size, then settles
    const s = k < 0.7 ? 0.6 + (0.47 * k) / 0.7 : 1.07 - (0.07 * (k - 0.7)) / 0.3;
    g.scale.setScalar(s);
  });
}

// ---------- a mined block flies to you ----------
const FLIGHTS = [];
function pickupFly(x, y, z, id) {
  if (!B[id] || B[id].drop === 0 || !near(x, z, 12)) return;
  const m = blockModel(B[id].drop && B[B[id].drop] ? B[id].drop : id);
  if (!m) return;
  const s = (m.userData.fit || 1) * 0.34;
  m.scale.setScalar(s);
  m.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(m);
  FLIGHTS.push({ m, s, t: 0, from: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5) });
}
function tickFlights(dt) {
  for (let i = FLIGHTS.length - 1; i >= 0; i--) {
    const f = FLIGHTS[i];
    f.t += dt;
    // a short hop up out of the hole, then toward your chest, shrinking as it arrives
    const k = Math.min(1, f.t / 0.45),
      e = k * k,
      to = new THREE.Vector3(P.x, P.y + 1.05, P.z);
    f.m.position.lerpVectors(f.from, to, e);
    f.m.position.y += Math.sin(k * Math.PI) * 0.55;
    f.m.rotation.y += dt * 9;
    f.m.scale.setScalar(f.s * (1 - 0.7 * e));
    if (k >= 1) {
      FLIGHTS.splice(i, 1);
      scene.remove(f.m);
    }
  }
}

// ---------- lying in a bed, sitting on a chair or a sofa, eating at a table ----------
const BED_DIR = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];
// you lie down along the bed (the others see you there), the screen goes dark a moment
function lieDown(bed) {
  const b = B[bed.id],
    f = +b.shape[3],
    [dx, dz] = BED_DIR[f],
    head = b.shape[4] === 'h',
    fx = head ? bed.x - dx : bed.x,
    fz = head ? bed.z - dz : bed.z;
  // where the two halves meet, on the mattress, looking toward your feet
  P.x = fx + 0.5 + dx * 0.5;
  P.z = fz + 0.5 + dz * 0.5;
  P.y = bed.y + 0.31;
  P.vy = 0;
  yaw = Math.atan2(dx, dz);
  playEmote('lie');
  blinkDark();
}
function blinkDark() {
  const d = $('sleepFade');
  if (!d) return;
  d.classList.remove('on');
  void d.offsetWidth; // restart the animation
  d.classList.add('on');
}
// a chair (146-149) or a sofa (150-153): sit facing the way it faces
const SEAT = id => (id >= 146 && id <= 149 ? 0.55 : id >= 150 && id <= 153 ? 0.42 : 0);
function sitDown(t) {
  const o = B[t.id].o || 0,
    // a seat of turn 0 faces +z; each turn takes (dx, dz) to (dz, -dx)
    [fx, fz] = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ][o];
  P.x = t.x + 0.5 + fx * 0.1;
  P.z = t.z + 0.5 + fz * 0.1;
  P.y = t.y + SEAT(t.id) + 0.001;
  P.vy = 0;
  yaw = Math.atan2(-fx, -fz);
  playEmote('seat');
}
