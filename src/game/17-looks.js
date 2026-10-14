// ---------- wearables: what the shop's cosmetics look like on a character (rules.js COSMETICS) ----------
// A look is one cosmetic id per slot (S.look, saved with the game). Outfit, head, back, companion and
// trail are seen by the other players too (presence carries lookCode()); the tool and plating trims are
// only on your own held item and armor, like the armor itself. Purely decorative, as the shop says.
const LOOK_SLOTS = ['outfit', 'head', 'back', 'companion', 'trail', 'tool', 'plating'];
const SHARED_SLOTS = ['outfit', 'head', 'back', 'companion', 'trail'];
const DEFAULT_PANTS = 0x6a58e0;
const SLOT_LABEL = {
  outfit: 'Outfit',
  head: 'Headwear',
  back: 'Back',
  companion: 'Companion',
  trail: 'Trail',
  tool: 'Tool trim',
  plating: 'Plating trim',
};

// your look, keeping only what you actually own (a reset or another device can take things away)
function myLook() {
  const out = {};
  for (const s of LOOK_SLOTS) {
    const id = S.look && S.look[s];
    if (id && COSMETICS[id] && COSMETICS[id].slot === s && S.cosmetics.includes(+id)) out[s] = +id;
  }
  return out;
}
const lookCode = look => SHARED_SLOTS.map(s => look[s] || 0).join('.');
function parseLook(code) {
  const out = {};
  if (typeof code !== 'string') return out;
  code.split('.').forEach((v, i) => {
    const id = +v,
      s = SHARED_SLOTS[i];
    if (s && id && COSMETICS[id] && COSMETICS[id].slot === s) out[s] = id;
  });
  return out;
}
function setLookSlot(slot, id) {
  S.look = { ...(S.look || {}) };
  if (id) S.look[slot] = +id;
  else delete S.look[slot];
  if (slot === 'outfit') {
    const c = id && COSMETICS[id];
    if (c) {
      profile.color = ME.color = c.color;
      try {
        localStorage.setItem(PKEY, JSON.stringify(profile));
      } catch (e) {}
    }
  }
  dirty = cloudDirty = true;
  lookChanged();
}
// after any change of look or color: your own avatars and what the others see
function lookChanged() {
  if (SELF && SELF.color !== ME.color) {
    scene.remove(SELF.g);
    SELF = null;
    if (VIEW) {
      VIEW--;
      changeView();
    }
  }
  if (SELF) applyLook(SELF, myLook());
  if (typeof Net !== 'undefined' && Net.setLook) Net.setLook(lookCode(myLook()));
}

// ---------- the pieces, built from boxes like everything else ----------
const lookMat = (c, em) => new THREE.MeshLambertMaterial(em ? { color: c, emissive: c, emissiveIntensity: em } : { color: c });
function bx(parent, w, h, d, color, x, y, z, em) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lookMat(color, em));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
// headwear: built around the head's center (the head is 0.5 wide, its face looks toward -z)
function buildHead(c, anim) {
  const g = new THREE.Group();
  switch (c.style) {
    case 'prospector':
      bx(g, 0.8, 0.05, 0.8, 0x6b4423, 0, 0.27, 0);
      bx(g, 0.5, 0.22, 0.5, 0x7a4f2a, 0, 0.39, 0);
      bx(g, 0.51, 0.05, 0.51, 0x3b2a1a, 0, 0.31, 0);
      break;
    case 'straw':
      bx(g, 0.88, 0.04, 0.88, 0xe8c66a, 0, 0.26, 0);
      bx(g, 0.46, 0.2, 0.46, 0xf0d27a, 0, 0.37, 0);
      bx(g, 0.47, 0.05, 0.47, 0xc0392b, 0, 0.3, 0);
      break;
    case 'miner':
      bx(g, 0.56, 0.18, 0.58, 0xffcc33, 0, 0.32, 0);
      bx(g, 0.1, 0.06, 0.58, 0xe0a800, 0, 0.43, 0);
      bx(g, 0.16, 0.12, 0.06, 0xfff6c0, 0, 0.3, -0.31, 1);
      break;
    case 'beanie':
      bx(g, 0.54, 0.2, 0.54, 0xff6b6b, 0, 0.32, 0);
      bx(g, 0.56, 0.08, 0.56, 0xd94f4f, 0, 0.24, 0);
      bx(g, 0.12, 0.12, 0.12, 0xffffff, 0, 0.47, 0);
      break;
    case 'visor': {
      bx(g, 0.56, 0.11, 0.06, 0x00eaff, 0, 0.04, -0.27, 0.9);
      bx(g, 0.06, 0.16, 0.16, 0x1b2a4a, -0.28, 0.04, -0.17);
      bx(g, 0.06, 0.16, 0.16, 0x1b2a4a, 0.28, 0.04, -0.17);
      break;
    }
    case 'panda':
      bx(g, 0.56, 0.08, 0.56, 0xf4f1ff, 0, 0.29, 0);
      bx(g, 0.56, 0.5, 0.06, 0xf4f1ff, 0, 0.04, 0.28);
      bx(g, 0.06, 0.5, 0.5, 0xf4f1ff, -0.28, 0.04, 0.04);
      bx(g, 0.06, 0.5, 0.5, 0xf4f1ff, 0.28, 0.04, 0.04);
      bx(g, 0.15, 0.15, 0.08, 0x1a1a22, -0.2, 0.39, 0);
      bx(g, 0.15, 0.15, 0.08, 0x1a1a22, 0.2, 0.39, 0);
      break;
    case 'halo': {
      const ring = new THREE.Group();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        bx(ring, 0.09, 0.05, 0.09, 0x3fd2c7, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.9);
      }
      ring.position.y = 0.46;
      g.add(ring);
      anim.push(t => {
        ring.rotation.y = t * 1.2;
        ring.position.y = 0.46 + Math.sin(t * 2) * 0.03;
      });
      break;
    }
    case 'crown': {
      bx(g, 0.54, 0.1, 0.54, 0xffd166, 0, 0.3, 0, 0.25);
      for (const [x, z] of [
        [-0.22, -0.22],
        [0.22, -0.22],
        [-0.22, 0.22],
        [0.22, 0.22],
        [0, -0.24],
        [0, 0.24],
        [-0.24, 0],
        [0.24, 0],
      ])
        bx(g, 0.08, 0.14, 0.08, 0xffd166, x, 0.41, z, 0.25);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), lookMat(0x8a7bef, 0.8));
      gem.position.set(0, 0.31, -0.29);
      g.add(gem);
      break;
    }
  }
  return g;
}
// back pieces: on the avatar itself, behind the body (its back faces +z)
function buildBack(c, anim) {
  const g = new THREE.Group();
  switch (c.style) {
    case 'pack':
      bx(g, 0.4, 0.46, 0.2, 0x7a5230, 0, 1.0, 0.25);
      bx(g, 0.42, 0.12, 0.22, 0x5a3a20, 0, 1.2, 0.25);
      bx(g, 0.48, 0.12, 0.12, 0x3f6e4a, 0, 1.3, 0.27);
      break;
    case 'banner': {
      const col = new THREE.Color(c.color).getHex(),
        acc = new THREE.Color(c.accent).getHex();
      bx(g, 0.05, 1.3, 0.05, 0xd9d9e3, 0.16, 1.25, 0.2);
      const flag = new THREE.Group();
      flag.position.set(0.16, 1.82, 0.2);
      bx(flag, 0.4, 0.42, 0.03, col, 0.21, -0.2, 0);
      bx(flag, 0.12, 0.12, 0.04, acc, 0.21, -0.18, 0, 0.8);
      bx(flag, 0.4, 0.05, 0.035, acc, 0.21, -0.4, 0, 0.4);
      g.add(flag);
      anim.push(t => (flag.rotation.y = Math.sin(t * 2.4) * 0.18));
      break;
    }
    case 'cape2': {
      const cape = new THREE.Group();
      cape.position.set(0, 1.3, 0.17);
      bx(cape, 0.23, 0.72, 0.04, 0xff8a3d, -0.115, -0.36, 0);
      bx(cape, 0.23, 0.72, 0.04, 0x8a7bef, 0.115, -0.36, 0);
      bx(cape, 0.46, 0.06, 0.05, 0xffd166, 0, -0.7, 0, 0.6);
      g.add(cape);
      anim.push(t => (cape.rotation.x = 0.08 + Math.sin(t * 1.7) * 0.05));
      break;
    }
    case 'wings': {
      // three feathers per wing, fanned upward, the top one edged in light
      const col = new THREE.Color(c.color),
        acc = new THREE.Color(c.accent).getHex();
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        w.position.set(side * 0.1, 1.28, 0.2);
        [
          [0.78, 0.26, 0.5, 1],
          [0.66, 0.1, 0.28, 0.85],
          [0.52, -0.06, 0.08, 0.7],
        ].forEach(([len, y, tilt, light], i) => {
          const f = new THREE.Group();
          f.position.set(0, y, 0);
          f.rotation.z = side * tilt;
          bx(f, len, 0.15, 0.03, col.clone().multiplyScalar(light).getHex(), side * (len / 2), 0, 0, 0.3);
          if (!i) bx(f, len, 0.04, 0.04, acc, side * (len / 2), 0.09, 0, 0.9);
          w.add(f);
        });
        g.add(w);
        anim.push(t => (w.rotation.y = side * (0.35 + Math.sin(t * 2.2) * 0.15)));
      }
      break;
    }
  }
  return g;
}
// companions: a small creature or object floating by your side
function buildCompanion(c, anim) {
  const g = new THREE.Group(),
    body = new THREE.Group();
  g.add(body);
  switch (c.style) {
    case 'validator':
      bx(body, 0.3, 0.3, 0.3, 0x2a1838, 0, 0, 0);
      bx(body, 0.2, 0.07, 0.02, 0x00eaff, 0, 0.04, -0.16, 1);
      bx(body, 0.03, 0.12, 0.03, 0xd9d9e3, 0, 0.21, 0);
      bx(body, 0.06, 0.06, 0.06, 0x00eaff, 0, 0.29, 0, 1);
      break;
    case 'panda':
      bx(body, 0.3, 0.22, 0.24, 0xf4f1ff, 0, 0, 0.04);
      bx(body, 0.22, 0.2, 0.2, 0xf4f1ff, 0, 0.12, -0.14);
      bx(body, 0.07, 0.07, 0.04, 0x1a1a22, -0.1, 0.25, -0.12);
      bx(body, 0.07, 0.07, 0.04, 0x1a1a22, 0.1, 0.25, -0.12);
      bx(body, 0.06, 0.05, 0.02, 0x1a1a22, -0.05, 0.14, -0.25);
      bx(body, 0.06, 0.05, 0.02, 0x1a1a22, 0.05, 0.14, -0.25);
      for (const [x, z] of [
        [-0.1, -0.06],
        [0.1, -0.06],
        [-0.1, 0.12],
        [0.1, 0.12],
      ])
        bx(body, 0.08, 0.1, 0.08, 0x1a1a22, x, -0.14, z);
      break;
    case 'blob': {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x3fd2c7, emissive: 0x3fd2c7, emissiveIntensity: 0.35, transparent: true, opacity: 0.7 }),
      );
      body.add(m);
      bx(body, 0.05, 0.05, 0.02, 0x0b2b30, -0.06, 0.04, -0.16);
      bx(body, 0.05, 0.05, 0.02, 0x0b2b30, 0.06, 0.04, -0.16);
      anim.push(t => body.scale.set(1 + Math.sin(t * 4) * 0.08, 1 - Math.sin(t * 4) * 0.1, 1 + Math.sin(t * 4) * 0.08));
      break;
    }
    case 'diamond': {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), lookMat(0x8a7bef, 0.7));
      d.scale.y = 1.4;
      body.add(d);
      anim.push(t => (body.rotation.y = t * 1.5));
      break;
    }
  }
  anim.push(t => (body.position.y = Math.sin(t * 2) * 0.08));
  return g;
}

// dresses an avatar (makeAvatar, 14-startup.js) in a look. preview: the companion is attached to the
// avatar itself (the chest's spinning character) instead of following it around the world.
function applyLook(av, look, preview) {
  if (!av) return;
  look = look || {};
  const key = SHARED_SLOTS.map(s => look[s] || 0).join('.') + '|' + av.color + (preview ? '|p' : '');
  if (av.lookKey === key) return;
  av.lookKey = key;
  av.look = look;
  for (const p of av.lookParts || []) p.parent && p.parent.remove(p);
  av.lookParts = [];
  av.anim = [];
  const o = look.outfit && COSMETICS[look.outfit];
  av.legs[0].children[0].material.color.set(o && o.color === av.color ? o.pants : DEFAULT_PANTS);
  if (look.head) {
    const h = buildHead(COSMETICS[look.head], av.anim);
    av.head.add(h);
    av.lookParts.push(h);
  }
  if (look.back) {
    const b = buildBack(COSMETICS[look.back], av.anim);
    av.g.add(b);
    av.lookParts.push(b);
  }
  av.backWorn = !!look.back;
  if (av.cape) av.cape.visible = av.cape.visible && !av.backWorn;
  if (preview && look.companion) {
    const c = buildCompanion(COSMETICS[look.companion], av.anim);
    c.position.set(0.75, 1.45, 0.25);
    av.g.add(c);
    av.lookParts.push(c);
  }
}
const tickLookAnims = (av, t) => {
  if (av && av.anim) for (const f of av.anim) f(t);
};

// ---------- trails: little glowing cubes left behind while moving ----------
const TRAIL = { pool: [], next: 0, max: 160 };
function trailColor(style, t) {
  if (style === 'spectrum') return new THREE.Color().setHSL((t * 0.4) % 1, 0.85, 0.65);
  if (style === 'ember') return new THREE.Color(Math.random() < 0.5 ? 0xff6b3d : 0xffb347);
  if (style === 'gwei') return new THREE.Color(Math.random() < 0.7 ? 0xffd95e : 0xfff3c0);
  return new THREE.Color(0x3fd2c7); // bubbles
}
function emitTrail(style, x, y, z, t) {
  let p = TRAIL.pool[TRAIL.next];
  if (!p) {
    p = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    TRAIL.pool[TRAIL.next] = p;
    scene.add(p);
  }
  TRAIL.next = (TRAIL.next + 1) % TRAIL.max;
  const big = style === 'bubbles';
  p.material.color.copy(trailColor(style, t));
  p.material.opacity = big ? 0.45 : 0.9;
  p.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.15 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4);
  p.size = big ? 0.13 : 0.09;
  p.scale.setScalar(p.size);
  p.life = p.max = big ? 1.4 : 0.9;
  p.vy = big ? 0.7 : 0.35;
  p.visible = true;
}
function updateTrail(dt) {
  for (const p of TRAIL.pool) {
    if (!p || !p.visible) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.visible = false;
      continue;
    }
    const k = p.life / p.max;
    p.position.y += p.vy * dt;
    p.scale.setScalar(p.size * (0.4 + 0.6 * k));
    p.material.opacity = k * 0.9;
  }
}

// ---------- every frame: companions follow their owner, trails are laid, trims glow ----------
const followers = new Map(); // owner ('me' or a player id) -> { g, id, anim, x, y, z, lx, lz, acc }
function follow(ownerKey, look, x, y, z, rotY, dt, t) {
  let f = followers.get(ownerKey);
  const cid = look && look.companion;
  if (f && f.id !== cid) {
    scene.remove(f.g);
    followers.delete(ownerKey);
    f = null;
  }
  if (!f) {
    f = { id: cid, g: null, anim: [], lx: x, lz: z, acc: 0 };
    if (cid) {
      f.g = buildCompanion(COSMETICS[cid], f.anim);
      f.g.position.set(x, y + 1.3, z);
      scene.add(f.g);
    }
    followers.set(ownerKey, f);
  }
  // the companion: beside you, a little behind, turning as you turn
  if (f.g) {
    const ox = 0.85,
      oz = 0.7,
      tx = x + ox * Math.cos(rotY) + oz * Math.sin(rotY),
      tz = z - ox * Math.sin(rotY) + oz * Math.cos(rotY),
      k = Math.min(1, dt * 4);
    f.g.position.x += (tx - f.g.position.x) * k;
    f.g.position.y += (y + 1.35 - f.g.position.y) * k;
    f.g.position.z += (tz - f.g.position.z) * k;
    f.g.rotation.y = rotY;
    for (const a of f.anim) a(t);
  }
  // the trail: only while actually moving
  const sp = Math.hypot(x - f.lx, z - f.lz) / Math.max(dt, 0.001);
  f.lx = x;
  f.lz = z;
  if (look && look.trail && sp > 1.2 && sp < 40) {
    f.acc += dt;
    while (f.acc > 0.05) {
      f.acc -= 0.05;
      emitTrail(COSMETICS[look.trail].style, x, y, z, t);
    }
  }
}
function dropFollower(ownerKey) {
  const f = followers.get(ownerKey);
  if (f && f.g) scene.remove(f.g);
  followers.delete(ownerKey);
}
// the held item's glow (first person and your own avatar): a trim tints it
function toolTrim(look, t) {
  if (typeof heldVoxelMat === 'undefined' || !heldVoxelMat) return;
  const c = look.tool && COSMETICS[look.tool];
  if (!c) {
    heldVoxelMat.emissive.setHex(0);
    return;
  }
  if (c.style === 'prism') heldVoxelMat.emissive.setHSL((t * 0.25) % 1, 0.9, 0.35);
  else heldVoxelMat.emissive.setHex(0x7a5a00);
}
// the armor's glow, when a plating trim is worn (updateArmorVisual, 14-startup.js)
const platingTrimColor = () => {
  const c = COSMETICS[myLook().plating];
  return c ? new THREE.Color(c.color).getHex() : null;
};
function updateLooks(dt) {
  const t = performance.now() / 1000,
    look = myLook();
  if (playing || CINE.on) follow('me', look, P.x, P.y, P.z, yaw, dt, t);
  tickLookAnims(SELF, t);
  toolTrim(look, t);
  for (const [id, o] of others) {
    if (!o.t || !o.g.visible) {
      if (followers.has(id)) dropFollower(id);
      continue;
    }
    follow(id, o.look, o.g.position.x, o.g.position.y, o.g.position.z, o.g.rotation.y, dt, t);
    tickLookAnims(o, t);
  }
  for (const k of [...followers.keys()]) if (k !== 'me' && !others.has(k)) dropFollower(k);
  updateTrail(dt);
}
