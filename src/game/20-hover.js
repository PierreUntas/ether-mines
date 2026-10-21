// Ether Mines · Hovercraft: the Diamond Gliders (rules.js ITEM 213-220, crafted in the Travel tab).
// Two models, the Twin Diamond (two slim diamonds under a gold bridge, a seat for a passenger) and the
// Neon Validator (one dark diamond, its edges in neon), each in the colors of the crystal it was built
// from. Hold one and right-click to ride it: twice as fast, it glides over water and over one-block
// steps; right-click again (or put it away) to step off. No fighting on board. A friend can take the
// Twin Diamond's back seat: right-click its driver, jump to get off.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- the models ----------
const HOVER_SCALE = 1.3, // concept units to blocks
  HOVER_GAP = 0.25; // the hull's lowest point above the ground
// the crystals' own colors (their icons, 01-textures.js): Ether Crystal, Pure Shard, Genesis Fragment, Diamond Shard
const HOVER_COLORS = [
  { light: '#9ef0ff', mid: '#3fc6f5', deep: '#1f6f8f', dark: '#16334a', glow: '#7fe8ff', seam: '#c9f7ff' },
  { light: '#d9c2ff', mid: '#9a6bf0', deep: '#5a3cb0', dark: '#2a1848', glow: '#c9a6ff', seam: '#f0e0ff' },
  { light: '#6a5a82', mid: '#4a3a66', deep: '#2b2244', dark: '#1a1226', glow: '#ffb347', seam: '#ffb347' },
  { light: '#fff6d6', mid: '#ffd95e', deep: '#d9a531', dark: '#5a4320', glow: '#ffe9a8', seam: '#ffffff' },
];
const hvMat = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e });
const hvGlow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
const hvMesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};
// a rounded box: an extruded rounded rectangle with a bevel (the clay look)
function hvBox(w, h, d, r = 0.04) {
  const s = new THREE.Shape(),
    x = -w / 2 + r,
    y = -d / 2 + r,
    W = w - 2 * r,
    D = d - 2 * r;
  s.moveTo(x, y);
  s.lineTo(x + W, y);
  s.quadraticCurveTo(x + W + r, y, x + W + r, y + r);
  s.lineTo(x + W + r, y + D);
  s.quadraticCurveTo(x + W + r, y + D + r, x + W, y + D + r);
  s.lineTo(x, y + D + r);
  s.quadraticCurveTo(x - r, y + D + r, x - r, y + D);
  s.lineTo(x - r, y + r);
  s.quadraticCurveTo(x - r, y, x, y);
  const depth = Math.max(0.001, h - 1.6 * r),
    g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: r * 0.8,
      bevelSize: r * 0.8,
      bevelSegments: 3,
      curveSegments: 4,
    });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  g.computeVertexNormals();
  return g;
}
// a diamond hull: a low pyramid on top, a deeper one below, facets outlined, a seam around its equator
function hvHull(w, len, up, down, top, bot, edge, seam) {
  const g = new THREE.Group(),
    E = [
      [w, 0, 0],
      [0, 0, len],
      [-w, 0, 0],
      [0, 0, -len],
    ];
  for (const [apex, c] of [
    [[0, up, 0], top],
    [[0, -down, 0], bot],
  ]) {
    const p = [];
    for (let i = 0; i < 4; i++) {
      const u = E[i],
        v = E[(i + 1) % 4];
      if (apex[1] > 0) p.push(...apex, ...v, ...u);
      else p.push(...apex, ...u, ...v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, hvMat(c, 0.12)));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge })));
  }
  const s = hvMesh(new THREE.TorusGeometry(1, 0.035, 6, 4), hvMat(seam, 0.4));
  s.rotation.x = Math.PI / 2;
  s.scale.set(w, len, 1);
  g.add(s);
  return g;
}
// the air cushion: a soft glowing disc under the craft, two bright rings
function hvCushion(rx, rz, c) {
  const g = new THREE.Group(),
    d = new THREE.Mesh(new THREE.CircleGeometry(1, 32), hvGlow(c, 0.3));
  d.rotation.x = -Math.PI / 2;
  d.scale.set(rx, rz, 1);
  g.add(d);
  for (const [k, o] of [
    [0.75, 0.5],
    [0.45, 0.65],
  ]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), hvGlow(c, o));
    r.rotation.x = -Math.PI / 2;
    r.scale.set(rx * k, rz * k, 1);
    r.position.y = 0.01;
    g.add(r);
  }
  return g;
}
// a little Ether diamond (the Neon Validator's guide, floating in front of it)
function hvGem(s, top, bot, seam) {
  const g = new THREE.Group(),
    a = hvMesh(new THREE.OctahedronGeometry(1, 0), hvMat(top, 0.2));
  a.scale.set(0.62 * s, s, 0.62 * s);
  g.add(a);
  const b = hvMesh(new THREE.TorusGeometry(0.62 * s, 0.05 * s, 6, 4), hvMat(seam, 0.4));
  b.rotation.x = Math.PI / 2;
  g.add(b);
  return g;
}
const hoverOf = id => ITEM[id]?.hover || null;
// the craft for item id, its hull centered on the driver's seat; userData: the seats' local z (in blocks),
// the seat's height above the ground (for the rider's hips), and the cushion (to pulse it)
function buildHover(id) {
  const h = hoverOf(id),
    c = HOVER_COLORS[h.k],
    root = new THREE.Group(),
    g = new THREE.Group();
  root.add(g);
  let seatY, seatZ, back;
  if (h.model === 'twin') {
    for (const x of [-0.45, 0.45]) {
      const hull = hvHull(0.3, 0.95, 0.3, 0.42, c.mid, c.deep, c.dark, c.seam);
      hull.position.set(x, 0.42, 0);
      g.add(hull);
    }
    g.add(hvMesh(hvBox(0.75, 0.08, 1.05, 0.03), hvMat(c.seam, 0.3), 0, 0.62, 0.05));
    // two low seats sunk into the bridge, each with a backrest and a glass windshield in front: you sit in it
    for (const z of [-0.22, 0.38]) {
      g.add(hvMesh(hvBox(0.36, 0.06, 0.34, 0.03), hvMat('#f4f1ff'), 0, 0.68, z));
      g.add(hvMesh(hvBox(0.36, 0.26, 0.06, 0.03), hvMat(c.deep, 0.1), 0, 0.8, z + 0.2));
      const ws = hvMesh(hvBox(0.42, 0.22, 0.03, 0.015), hvGlow('#e8fbff', 0.45), 0, 0.8, z - 0.24);
      ws.rotation.x = -0.45;
      g.add(ws);
    }
    g.add(hvMesh(hvBox(0.5, 0.04, 1.2, 0.02), hvGlow(c.glow, 0.85), 0, 0.26, 0));
    g.add((g.userData.cushion = hvCushion(0.95, 1.15, c.glow)));
    seatY = 0.71;
    seatZ = -0.22;
    back = 0.38;
  } else {
    const hull = hvHull(0.62, 1.05, 0.4, 0.55, c.mid === '#4a3a66' ? c.mid : c.deep, c.dark, c.glow, c.glow);
    hull.position.y = 0.55;
    g.add(hull);
    // a cockpit cut into the diamond's top: the seat sits below the facets, a glowing rim and a windshield around you
    const rim = hvMesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24), hvMat(c.glow, 0.5), 0, 0.88, 0.12);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 1.25, 1);
    g.add(rim);
    g.add(hvMesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 24), hvMat(c.dark), 0, 0.86, 0.12));
    const ws = hvMesh(hvBox(0.46, 0.22, 0.03, 0.015), hvGlow('#e8fbff', 0.45), 0, 0.98, -0.22);
    ws.rotation.x = -0.5;
    g.add(ws);
    const gem = hvGem(0.14, c.light, c.mid, c.seam);
    gem.position.set(0, 1.05, -0.85);
    g.add(gem);
    for (const x of [-0.45, 0.45]) {
      const f = hvMesh(new THREE.ConeGeometry(0.07, 0.5, 4), hvGlow(c.glow), x, 0.55, 0.55);
      f.rotation.x = Math.PI / 2;
      g.add(f);
    }
    g.add((g.userData.cushion = hvCushion(0.8, 1.2, c.glow)));
    seatY = 0.8;
    seatZ = 0.12;
    back = null;
  }
  // the hull's lowest point (the lower diamond's apex) sits HOVER_GAP above the ground, the driver's seat over P
  g.position.z = -seatZ;
  root.scale.setScalar(HOVER_SCALE);
  root.userData = {
    id,
    body: g,
    seat: seatY * HOVER_SCALE,
    back: back === null ? null : (back - seatZ) * HOVER_SCALE,
  };
  g.userData.cushion.position.y = -HOVER_GAP / HOVER_SCALE + 0.02; // the glow lies on the ground
  root.traverse(o => {
    if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial)) o.castShadow = !touch;
  });
  return root;
}
// the craft's glow and bob, as it floats
function animateHover(m, t) {
  const g = m.userData.body;
  g.position.y = Math.sin(t * 2.2) * 0.03;
  const cu = g.userData.cushion;
  if (cu) cu.children[0].material.opacity = 0.25 + Math.sin(t * 5) * 0.06;
}
// ---------- riding ----------
// RIDE: you on your own craft { id, mesh }; BOARD: you in someone's back seat { driver } (05-player.js)
const heldHover = () => {
  const id = S.bar[S.sel] ? itemId(S.bar[S.sel]) : null;
  return hoverOf(id) ? id : null;
};
// how much higher than your feet you sit, on board: the eyes and the avatar go up as much
function rideLift() {
  const m = RIDE ? RIDE.mesh : BOARD ? boardCraft()?.craft : null;
  if (!m) return 0;
  const hips = CLAY ? 0.47 : 0.62;
  return Math.max(0, HOVER_GAP + m.userData.seat - hips + 0.04);
}
function mountHover() {
  const id = heldHover();
  if (!id || RIDE || BOARD) return;
  if (P.inWater || get(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)) === 11)
    return logEv('burn', 'Climb out of the water first', 'then get on board: it glides over the sea');
  const mesh = buildHover(id);
  scene.add(mesh);
  RIDE = { id, mesh };
  mesh.position.set(P.x, P.y + HOVER_GAP, P.z);
  mesh.rotation.y = yaw;
  Sound.chime();
  if (!S.seen.hoverTip) {
    S.seen.hoverTip = 1;
    dirty = true;
    toastInfo(
      `On board the ${ITEM[id].n}: twice as fast, over water too. ${touch ? 'The craft button' : 'Right-click'} to step off${hoverOf(id).model === 'twin' ? ` · a friend can take the back seat by ${touch ? 'tapping' : 'right-clicking'} you` : ''}.`,
    );
  }
}
function dismountHover() {
  if (!RIDE) return;
  scene.remove(RIDE.mesh);
  RIDE = null;
  Sound.click();
}
function toggleRide() {
  if (RIDE) dismountHover();
  else mountHover();
}
// ---------- drifting ----------
// On board, your velocity has inertia (10-loop.js): the part along the craft's nose follows the stick
// quickly, the part across it only slowly lets go. Turn hard at speed and the craft slides sideways, its
// nose already pointing the new way: a drift, with spray off its side and the craft leaning into it.
const HOVER_ACCEL = 3.5, // how fast the speed along the nose follows the stick, per second
  HOVER_GRIP = 1.4; // how fast a sideways slide fades, per second: lower, longer drifts
function rideVelocity(vx, vz, dt) {
  const fx = -Math.sin(yaw),
    fz = -Math.cos(yaw),
    cvx = RIDE.vx || 0,
    cvz = RIDE.vz || 0,
    f = cvx * fx + cvz * fz,
    tf = vx * fx + vz * fz,
    nf = f + (tf - f) * Math.min(1, dt * HOVER_ACCEL),
    k = Math.min(1, dt * HOVER_GRIP),
    lx = cvx - f * fx + (vx - tf * fx - (cvx - f * fx)) * k,
    lz = cvz - f * fz + (vz - tf * fz - (cvz - f * fz)) * k;
  return [nf * fx + lx, nf * fz + lz];
}
// what you really moved this frame (a wall stops the slide too)
function rideMoved(vx, vz) {
  RIDE.vx = vx;
  RIDE.vz = vz;
}
// a craft's sideways slide (m: the craft; its heading, its world velocity from frame to frame): leans
// the hull (and the rider, ro) into it, throws spray off its side
const hvP = new THREE.Vector3();
function driftFx(m, ro, dt, color) {
  m.getWorldPosition(hvP);
  m.getWorldQuaternion(hvQ);
  const ry = hvE.setFromQuaternion(hvQ, 'YXZ').y,
    u = m.userData;
  if (u.px === undefined || dt <= 0) {
    u.px = hvP.x;
    u.pz = hvP.z;
    u.vx = u.vz = 0;
    return;
  }
  const k = Math.min(1, dt * 8);
  u.vx += ((hvP.x - u.px) / dt - u.vx) * k;
  u.vz += ((hvP.z - u.pz) / dt - u.vz) * k;
  u.px = hvP.x;
  u.pz = hvP.z;
  if (Math.hypot(u.vx, u.vz) > 40) u.vx = u.vz = 0; // a jump across the map (a teleport), not a slide
  const rx = Math.cos(ry),
    rz = -Math.sin(ry), // the craft's right side
    lat = u.vx * rx + u.vz * rz,
    roll = clamp(lat * 0.05, -0.32, 0.32);
  u.body.rotation.z += (roll - u.body.rotation.z) * Math.min(1, dt * 6);
  if (ro) ro.rotation.z = u.body.rotation.z;
  // spray off the side it slides away from, behind the seat
  if (Math.abs(lat) > 2.6 && Math.hypot(u.vx, u.vz) > 4) {
    u.sprayT = (u.sprayT || 0) - dt;
    if (u.sprayT <= 0) {
      u.sprayT = 0.03;
      const side = -Math.sign(lat),
        bx = hvP.x + rx * side * 0.7 + Math.sin(ry) * 0.6,
        bz = hvP.z + rz * side * 0.7 + Math.cos(ry) * 0.6,
        pm = new THREE.Mesh(etherGeo, u.sprayMat || (u.sprayMat = hvGlow(color, 0.9)));
      pm.position.set(bx, hvP.y - HOVER_GAP + 0.15, bz);
      scene.add(pm);
      parts.push({
        m: pm,
        v: [
          rx * side * (1.5 + Math.random() * 2) - u.vx * 0.15,
          1.5 + Math.random() * 2,
          rz * side * (1.5 + Math.random() * 2) - u.vz * 0.15,
        ],
        t: 0.5,
        t0: 0.5,
        g: 6,
        s: 1.6,
      });
    }
  }
}
// every frame: your craft follows you (and stays only while you hold it), the others' crafts animate
function updateRide(dt) {
  const t = performance.now() / 1000;
  if (RIDE && playing && heldHover() !== RIDE.id) dismountHover(); // put away: you step off
  // on a touch screen, the button to get on and off, while a craft is in hand (or you're on board)
  const rb = $('tRide'),
    showRide = !!(heldHover() || RIDE || BOARD);
  if (rb && rb.hidden === showRide) rb.hidden = !showRide;
  if (rb) rb.classList.toggle('on', !!(RIDE || BOARD));
  // no dodge on board: its button goes while you ride
  const db = $('tDash'),
    showDash = bootsOn() && !RIDE && !BOARD;
  if (db && db.hidden === showDash) db.hidden = !showDash;
  if (RIDE) {
    const m = RIDE.mesh;
    m.position.set(P.x, P.y + HOVER_GAP, P.z);
    let dr = yaw - m.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    m.rotation.y += dr * Math.min(1, dt * 10);
    animateHover(m, t);
    driftFx(m, VIEW && SELF ? SELF.seat : null, dt, HOVER_COLORS[hoverOf(RIDE.id).k].glow);
  }
  for (const o of others.values())
    if (o.craft) {
      animateHover(o.craft, t + o.ph);
      driftFx(o.craft, o.seat, dt, HOVER_COLORS[hoverOf(o.craft.userData.id).k].glow);
    }
}
// ---------- the avatars on board ----------
// everything an avatar shows goes under one inner group the first time it rides, so lifting it onto the
// seat doesn't fight the per-frame animation (updateOthers, viewFromOutside) that sets each part's height
function seatGroup(o) {
  if (o.seat) return o.seat;
  const s = new THREE.Group();
  for (const c of [...o.g.children]) {
    o.g.remove(c);
    s.add(c);
  }
  o.g.add(s);
  o.seat = s;
  return s;
}
function sitAvatar(o, on) {
  const s = seatGroup(o);
  s.position.y = on ? rideLiftFor(o) : 0;
  if (on) {
    // seated: knees forward, both hands forward on the controls, still (no running swing)
    o.legs[0].rotation.x = o.legs[1].rotation.x = 1.45;
    o.arms[0].rotation.x = o.arms[1].rotation.x = -0.95;
    o.arms[0].rotation.z = 0.12;
    o.arms[1].rotation.z = -0.12;
    o.body.position.y = 0.94;
  } else s.rotation.z = 0;
}
const rideLiftFor = o => {
  const m = o === SELF ? (RIDE ? RIDE.mesh : boardCraft()?.craft) : o.craft || (o.t?.on && driverCraft(o.t.on));
  if (!m) return 0;
  return Math.max(0, HOVER_GAP + m.userData.seat - (CLAY ? 0.47 : 0.62) + 0.04);
};
// you, seen from behind or in front (14-startup.js viewFromOutside, after its own pose)
function rideSelf(o) {
  sitAvatar(o, !!(RIDE || BOARD));
}
// the craft someone drives: another player's (from their pos message), or yours
function driverCraft(id) {
  if (id === ME.id) return RIDE ? RIDE.mesh : null;
  return others.get(id)?.craft || null;
}
// another player (14-startup.js updateOthers, after its own pose): their craft under them, or the back seat
// of the craft they're in
function rideOther(o) {
  const rd = o.t && Number.isInteger(o.t.rd) && hoverOf(o.t.rd) ? o.t.rd : 0;
  if (rd && (!o.craft || o.craft.userData.id !== rd)) {
    if (o.craft) o.g.remove(o.craft);
    o.craft = buildHover(rd);
    o.g.add(o.craft);
  } else if (!rd && o.craft) {
    o.g.remove(o.craft);
    o.craft = null;
  }
  if (o.craft) o.craft.position.y = HOVER_GAP;
  // a passenger: sits in the back seat of its driver's craft, wherever that craft really is on this screen
  const dc = o.t && o.t.on ? driverCraft(o.t.on) : null;
  if (dc && dc.userData.back !== null) {
    dc.getWorldPosition(hvV);
    dc.getWorldQuaternion(hvQ);
    const ry = hvE.setFromQuaternion(hvQ, 'YXZ').y;
    o.g.position.set(hvV.x + Math.sin(ry) * dc.userData.back, hvV.y - HOVER_GAP, hvV.z + Math.cos(ry) * dc.userData.back);
    o.g.rotation.y = ry;
  }
  sitAvatar(o, !!(o.craft || dc));
}
const hvV = new THREE.Vector3(),
  hvQ = new THREE.Quaternion(),
  hvE = new THREE.Euler();
// ---------- the back seat ----------
// right-click a friend driving a Twin Diamond (06-actions.js place): you sit behind them and go where they go
function tryBoard(pv) {
  if (!pv || RIDE || BOARD) return false;
  const o = pv.o,
    rd = o.t && o.t.rd;
  if (!rd || hoverOf(rd)?.model !== 'twin') return false;
  if (Math.hypot(o.g.position.x - P.x, o.g.position.z - P.z) > 4.5) return false;
  for (const [id, x] of others)
    if (id !== pv.id && x.t && x.t.on === pv.id) {
      logEv('burn', 'The back seat is taken', `${x.name} is already riding with ${o.name}`);
      return true;
    }
  BOARD = { driver: pv.id };
  Sound.chime();
  toastInfo(`You ride behind ${o.name}. Jump to get off.`);
  return true;
}
function boardCraft() {
  if (!BOARD) return null;
  const o = others.get(BOARD.driver);
  return o && o.t && o.craft ? { o, craft: o.craft } : null;
}
function unboard() {
  if (!BOARD) return;
  const b = boardCraft();
  BOARD = null;
  if (b) {
    // stepped off to the side of the craft, on a free spot
    const a = b.o.g.rotation.y + Math.PI / 2;
    for (const s of [1.6, -1.6, 0]) {
      const x = P.x + Math.cos(a) * s,
        z = P.z - Math.sin(a) * s;
      if (!collides(x, P.y + 0.6, z)) {
        P.x = x;
        P.z = z;
        P.y += 0.6;
        break;
      }
    }
  }
  P.vy = 0;
  Sound.click();
}
// every frame, after the physics (10-loop.js): in the back seat, you are where the seat is
function boardTick() {
  if (!BOARD) return;
  const b = boardCraft();
  if (!b || hoverOf(b.o.t.rd)?.model !== 'twin') return unboard();
  const back = b.craft.userData.back,
    gp = b.o.g.position,
    ry = b.o.g.rotation.y;
  P.x = gp.x + Math.sin(ry) * back;
  P.z = gp.z + Math.cos(ry) * back;
  P.y = gp.y;
  P.vy = 0;
  P.on = true;
  if (keys.has('Space') || jumpHeld) unboard();
}
