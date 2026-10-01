// Mines d'Éther · Joueur, physique, entrées clavier, souris et tactile, visée.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- joueur ----------
const P = { x: SPAWN.x + 0.5, y: 0, z: SPAWN.z + 2.5, vy: 0, on: false, inWater: false };
let yaw = 0,
  pitch = -0.12;
const PW = 0.3,
  PH = 1.75,
  EYE = 1.6;
function collides(x, y, z) {
  const ax0 = x - PW,
    ax1 = x + PW,
    ay1 = y + PH,
    az0 = z - PW,
    az1 = z + PW;
  for (let bx = Math.floor(ax0); bx <= Math.floor(ax1 - 1e-4); bx++)
    for (let by = Math.floor(y); by <= Math.floor(ay1 - 1e-4); by++)
      for (let bz = Math.floor(az0); bz <= Math.floor(az1 - 1e-4); bz++) {
        if (by < 0 || !loaded(bx, bz) || !inWorld(bx, bz)) return true;
        const id = get(bx, by, bz);
        if (!isSolid(id)) continue;
        if (!isShaped(id)) return true;
        for (const b of collBoxes(id, coordKey(bx, by, bz)))
          if (ax1 > bx + b[0] && ax0 < bx + b[3] && ay1 > by + b[1] && y < by + b[4] && az1 > bz + b[2] && az0 < bz + b[5]) return true;
      }
  return false;
}
let stepUp = 0;
function moveAxis(ax, amt) {
  const n = Math.ceil(Math.abs(amt) / 0.2) || 1,
    d = amt / n;
  for (let i = 0; i < n; i++) {
    P[ax] += d;
    if (!collides(P.x, P.y, P.z)) continue;
    if (ax === 'y') {
      P.y -= d;
      if (d < 0) {
        for (let k = 0; k < 12 && !collides(P.x, P.y - 0.02, P.z); k++) P.y -= 0.02;
        P.on = true;
      }
      P.vy = 0;
      return;
    }
    if (P.on) {
      let up = 0;
      for (const h of [0.26, 0.52])
        if (!collides(P.x, P.y + h, P.z)) {
          up = h;
          break;
        }
      if (up) {
        P.y += up;
        stepUp += up;
        continue;
      }
    } // marche automatique : dalles, escaliers
    P[ax] -= d;
    bumped = true;
    return;
  }
}
let bumped = false;

// ---------- entrées ----------
const keys = new Set();
let playing = false,
  mining = false,
  locked = false,
  noLock = false,
  dragging = false,
  jumpHeld = false,
  sneakHeld = false,
  sprintOn = false,
  sprintMv = false,
  sprint = false,
  regView = false;
addEventListener('keydown', e => {
  if (chatOpen || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
  if (e.code === 'Enter' && playing) {
    e.preventDefault();
    openChat();
    return;
  }
  if (e.code === 'KeyE' && (playing || !$('panel').hidden)) {
    togglePanel();
    return;
  }
  if (!playing) return;
  keys.add(e.code);
  if (/^Digit[1-9]$/.test(e.code)) select(+e.code.slice(5) - 1);
  if (e.code === 'KeyM') toggleSnd();
  if (e.code === 'KeyO') openTab('quest');
  if (e.code === 'KeyT') {
    regView = !regView;
    $('modeTag').hidden = !regView;
    buildRegView();
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
const cv = renderer.domElement;
function tryLock() {
  if (touch) return;
  try {
    const r = cv.requestPointerLock();
    if (r && r.catch)
      r.catch(() => {
        noLock = true;
      });
  } catch (e) {
    noLock = true;
  }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === cv;
  if (!locked && playing && !noLock && $('panel').hidden && !chatOpen) pause();
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!playing || touch) return;
  if (!locked && !noLock) {
    tryLock();
    return;
  }
  if (e.button === 0) {
    mining = true;
    dragging = true;
  }
  if (e.button === 2) place();
});
addEventListener('mouseup', e => {
  if (e.button === 0) {
    mining = false;
    dragging = false;
  }
});
addEventListener('mousemove', e => {
  if (!playing || touch) return;
  if (locked || (noLock && dragging)) look(e.movementX, e.movementY, 0.0022);
});
addEventListener(
  'wheel',
  e => {
    if (!playing) return;
    select((S.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
  },
  { passive: true },
);
function look(dx, dy, s) {
  s *= REG.sensibilite;
  yaw -= dx * s;
  pitch = clamp(pitch - dy * s, -1.55, 1.55);
}
const stick = $('stick'),
  knob = $('knob'),
  move = { x: 0, y: 0 };
let joyId = null,
  joyO = null,
  lookId = null,
  lookL = null;
// Tactile : pouce gauche (bas gauche) = marcher. Ailleurs : glisser = regarder,
// toucher bref = poser (ou actionner porte, levier) là où on touche, toucher long = miner là où on touche.
const HOLD_MS = 300,
  SLOP = 12,
  ring = $('press');
let aim = null,
  press = null;
const ndcOf = (x, y) => ({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 });
function ringAt(x, y, cls) {
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  ring.className = cls;
  ring.hidden = false;
}
const stickHome = () => [Math.max(24, innerWidth * 0.13) + 64, innerHeight * 0.56];
function placeStick(x, y) {
  stick.style.left = x + 'px';
  stick.style.top = y + 'px';
}
function resetStick() {
  const [x, y] = stickHome();
  placeStick(x, y);
  knob.style.transform = '';
  stick.classList.remove('on');
}
if (touch) {
  resetStick();
  addEventListener('resize', () => {
    if (joyId === null) resetStick();
  });
}
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || !playing) return;
  try {
    cv.setPointerCapture(e.pointerId);
  } catch (_) {}
  if (e.clientX < innerWidth * 0.4 && e.clientY > innerHeight * 0.25 && joyId === null) {
    joyId = e.pointerId;
    const [hx, hy] = stickHome();
    joyO = Math.hypot(e.clientX - hx, e.clientY - hy) < 90 ? [hx, hy] : [e.clientX, e.clientY];
    placeStick(joyO[0], joyO[1]);
    stick.classList.add('on');
    let dx = e.clientX - joyO[0],
      dy = e.clientY - joyO[1];
    const l = Math.hypot(dx, dy),
      m = 46;
    if (l > m) {
      dx *= m / l;
      dy *= m / l;
    }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    move.x = dx / m;
    move.y = -dy / m;
  } else if (lookId === null) {
    lookId = e.pointerId;
    lookL = [e.clientX, e.clientY];
    aim = ndcOf(e.clientX, e.clientY);
    ringAt(e.clientX, e.clientY, 'charge');
    const pr = (press = { x0: e.clientX, y0: e.clientY, drag: false, mine: false });
    pr.timer = setTimeout(() => {
      if (press !== pr || pr.drag) return;
      pr.mine = true;
      mining = true;
      ring.className = 'mine';
      try {
        navigator.vibrate && navigator.vibrate(15);
      } catch (_) {}
    }, HOLD_MS);
  }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joyO[0],
      dy = e.clientY - joyO[1];
    const l = Math.hypot(dx, dy),
      m = 46;
    if (l > m) {
      dx *= m / l;
      dy *= m / l;
    }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    move.x = dx / m;
    move.y = -dy / m;
  } else if (e.pointerId === lookId) {
    const pr = press;
    if (pr && !pr.drag && !pr.mine && Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) > SLOP) {
      pr.drag = true;
      aim = null;
      ring.hidden = true;
    }
    if (pr && pr.mine) {
      aim = ndcOf(e.clientX, e.clientY);
      ring.style.left = e.clientX + 'px';
      ring.style.top = e.clientY + 'px';
      return;
    } // en minant, le doigt vise
    if (pr && !pr.drag) return;
    look(e.clientX - lookL[0], e.clientY - lookL[1], 0.005);
    lookL = [e.clientX, e.clientY];
  }
});
function endP(e) {
  if (e.pointerId === joyId) {
    joyId = null;
    move.x = move.y = 0;
    resetStick();
  }
  if (e.pointerId === lookId) {
    lookId = null;
    const pr = press;
    press = null;
    ring.hidden = true;
    if (pr) {
      clearTimeout(pr.timer);
      if (pr.mine) mining = false;
      else if (!pr.drag && e.type === 'pointerup') {
        target = raycast(5.2, aim);
        place();
      }
    }
    aim = null;
  }
}
// Relâchement écouté sur toute la page (le doigt peut finir sur un bouton ou hors de l'écran),
// et remise à zéro complète dès qu'aucun doigt ne touche plus l'écran : le joystick ne peut plus rester bloqué.
addEventListener('pointerup', endP);
addEventListener('pointercancel', endP);
cv.addEventListener('lostpointercapture', endP);
function releaseAll() {
  if (joyId !== null) endP({ pointerId: joyId, type: 'pointercancel' });
  if (lookId !== null) endP({ pointerId: lookId, type: 'pointercancel' });
  move.x = move.y = 0;
  jumpHeld = sneakHeld = false;
  resetStick();
}
let noTouch = 0;
const touchGone = e => {
  if (e.touches.length) return;
  const t = ++noTouch;
  setTimeout(() => {
    if (t === noTouch) releaseAll();
  }, 60);
};
addEventListener('touchstart', () => noTouch++, { passive: true });
addEventListener('touchend', touchGone);
addEventListener('touchcancel', touchGone);
addEventListener('blur', () => {
  if (touch) releaseAll();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && touch) releaseAll();
});
function hold(el, on, off) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.classList.add('on');
    on();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
    el.addEventListener(t, () => {
      el.classList.remove('on');
      off();
    }),
  );
}
hold(
  $('tJump'),
  () => (jumpHeld = true),
  () => (jumpHeld = false),
);
hold(
  $('tSneak'),
  () => (sneakHeld = true),
  () => (sneakHeld = false),
);
$('tSprint').addEventListener('pointerdown', e => {
  e.preventDefault();
  sprintOn = !sprintOn;
  $('tSprint').classList.toggle('on', sprintOn);
});
$('menuBtn').onclick = () => {
  if (!$('panel').hidden) togglePanel();
  if (chatOpen) closeChat();
  pause();
};
$('invBtn').onclick = () => togglePanel();

// ---------- visée, minage, pose ----------
function raycast(max, at) {
  const o = camera.position,
    d = at
      ? new THREE.Vector3(at.x, at.y, 0.5).unproject(camera).sub(o).normalize()
      : new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  let x = Math.floor(o.x),
    y = Math.floor(o.y),
    z = Math.floor(o.z);
  const sx = Math.sign(d.x),
    sy = Math.sign(d.y),
    sz = Math.sign(d.z),
    tdx = Math.abs(1 / d.x),
    tdy = Math.abs(1 / d.y),
    tdz = Math.abs(1 / d.z);
  let tx = d.x > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx,
    ty = d.y > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy,
    tz = d.z > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz,
    prev = null,
    t = 0;
  while (t <= max) {
    const id = get(x, y, z);
    if (id && id !== 11) return { x, y, z, id, prev };
    prev = [x, y, z];
    if (tx < ty && tx < tz) {
      x += sx;
      t = tx;
      tx += tdx;
    } else if (ty < tz) {
      y += sy;
      t = ty;
      ty += tdy;
    } else {
      z += sz;
      t = tz;
      tz += tdz;
    }
  }
  return null;
}
const sel = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x1c163a, transparent: true, opacity: 0.7 }),
);
sel.visible = false;
scene.add(sel);
const crackTex = [];
for (let s = 0; s < 8; s++) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(28,22,58,.75)';
  let px = 8,
    py = 8;
  for (let k = 0; k < (s + 1) * 5; k++) {
    const a = hash(k, s, 99) * 6.28;
    px = clamp(px + Math.round(Math.cos(a) * 1.4), 0, 15);
    py = clamp(py + Math.round(Math.sin(a) * 1.4), 0, 15);
    x.fillRect(px, py, 1, 1);
    if (k % 5 === 4) {
      px = Math.floor(hash(k, 1, 98) * 16);
      py = Math.floor(hash(k, 2, 98) * 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  crackTex.push(t);
}
const crack = new THREE.Mesh(
  new THREE.BoxGeometry(1.006, 1.006, 1.006),
  new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
);
crack.visible = false;
scene.add(crack);
let target = null,
  mineKey = -1,
  mineT = 0,
  swing = 0;
function toolMult(id) {
  const it = S.bar[S.sel];
  const t = it && ITEM[it] && ITEM[it].tool;
  if (!t) return 1;
  return B[id].stone ? t : 1 + (t - 1) * 0.5;
}
const parts = [],
  pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12),
  pMats = {};
function avgColor(ti) {
  const [sx, sy] = [(ti % AN) * AT, Math.floor(ti / AN) * AT];
  const d = ag.getImageData(sx, sy, 16, 16).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3] > 100) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
  return n ? `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})` : '#fff';
}
const pops = [],
  popGeo = new THREE.BoxGeometry(1, 1, 1),
  popEdge = new THREE.EdgesGeometry(popGeo),
  sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
function popAt(x, y, z, h = 1) {
  const g = new THREE.Group();
  g.position.set(x + 0.5, y + h / 2, z + 0.5);
  const box = new THREE.Mesh(
    popGeo,
    new THREE.MeshBasicMaterial({ color: 0xc2b8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  box.scale.set(1.02, h + 0.02, 1.02);
  g.add(box);
  const edge = new THREE.LineSegments(popEdge, new THREE.LineBasicMaterial({ color: 0xe9e4ff, transparent: true, opacity: 0.9 }));
  edge.scale.set(1.04, h + 0.04, 1.04);
  g.add(edge);
  scene.add(g);
  const sp = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      sparkGeo,
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x7fe8ff : 0xffd95e,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const a = Math.random() * Math.PI * 2;
    m.position.set(x + 0.5 + Math.cos(a) * 0.6, y + Math.random() * h, z + 0.5 + Math.sin(a) * 0.6);
    scene.add(m);
    sp.push({ m, v: [Math.cos(a) * 0.8, 1.2 + Math.random() * 1.4, Math.sin(a) * 0.8] });
  }
  pops.push({ g, box, edge, sp, h, t: 0 });
}
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt;
    const k = p.t / 0.45,
      e = 1 + Math.sin(Math.min(1, k) * Math.PI) * 0.12;
    p.box.scale.set(1.02 * e, (p.h + 0.02) * e, 1.02 * e);
    p.edge.scale.set(1.04 * e, (p.h + 0.04) * e, 1.04 * e);
    p.box.material.opacity = 0.35 * (1 - k);
    p.edge.material.opacity = 0.9 * (1 - k);
    for (const s of p.sp) {
      s.v[1] -= 3 * dt;
      s.m.position.x += s.v[0] * dt;
      s.m.position.y += s.v[1] * dt;
      s.m.position.z += s.v[2] * dt;
      s.m.material.opacity = 1 - k;
      s.m.rotation.y += dt * 6;
    }
    if (k >= 1) {
      scene.remove(p.g);
      p.box.material.dispose();
      p.edge.material.dispose();
      for (const s of p.sp) {
        scene.remove(s.m);
        s.m.material.dispose();
      }
      pops.splice(i, 1);
    }
  }
}
// lucioles : visibles la nuit, autour du joueur, près du sol
const FF = 60,
  ffPos = new Float32Array(FF * 3),
  ffData = [];
const ffTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d'),
    g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.25, 'rgba(230,255,150,.8)');
  g.addColorStop(1, 'rgba(160,255,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const ffGeo = new THREE.BufferGeometry();
ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
const ffMat = new THREE.PointsMaterial({
  map: ffTex,
  size: 0.35,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
const fireflies = new THREE.Points(ffGeo, ffMat);
fireflies.frustumCulled = false;
scene.add(fireflies);
function ffSpawn(d) {
  for (let tr = 0; tr < 6; tr++) {
    const a = Math.random() * Math.PI * 2,
      r = 3 + Math.random() * 16;
    d.x = P.x + Math.cos(a) * r;
    d.z = P.z + Math.sin(a) * r;
    let y = Math.min(SY - 2, Math.floor(P.y) + 6);
    while (y > 1 && !isSolid(get(Math.floor(d.x), y, Math.floor(d.z)))) y--;
    d.y = y + 1.3 + Math.random() * 2.2;
    if (get(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) === 0) break;
  }
  d.ph = Math.random() * 9;
  d.sp = 0.4 + Math.random() * 0.6;
}
for (let i = 0; i < FF; i++) {
  const d = {};
  ffData.push(d);
}
let ffReady = false;
function updateFireflies(dt, night, t) {
  ffMat.opacity = REG.lucioles ? Math.max(0, night - 0.3) * 1.3 : 0;
  fireflies.visible = ffMat.opacity > 0.01;
  if (!fireflies.visible) {
    ffReady = false;
    return;
  }
  for (let i = 0; i < FF; i++) {
    const d = ffData[i];
    if (!ffReady || Math.hypot(d.x - P.x, d.z - P.z) > 22) ffSpawn(d);
    d.ph += dt * d.sp;
    ffPos[i * 3] = d.x + Math.sin(d.ph * 1.3) * 0.8;
    ffPos[i * 3 + 1] = d.y + Math.sin(d.ph * 2.1) * 0.35;
    ffPos[i * 3 + 2] = d.z + Math.cos(d.ph) * 0.8;
  }
  ffReady = true;
  ffMat.size = 0.28 + Math.sin(t * 3) * 0.05;
  ffGeo.attributes.position.needsUpdate = true;
}
function burst(x, y, z, id) {
  const ti = B[id].x != null ? B[id].x : B[id].t[1];
  const c = pMats[ti] || (pMats[ti] = new THREE.MeshLambertMaterial({ color: avgColor(ti) }));
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(pGeo, c);
    m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
    scene.add(m);
    parts.push({ m, v: [(Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3], t: 0.7 });
  }
}
