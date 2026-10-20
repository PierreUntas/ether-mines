// Ether Mines · Position, profile, account, game startup.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- position ----------
function updatePosHud() {
  const c = claimAt(P.x, P.z);
  $('borderTxt').textContent =
    `Position ${Math.floor(P.x)} · ${Math.floor(P.z)}${c ? ` · ${c.owner === ME.id ? 'your' : (c.owner_name || '?') + "'s"} plot` : ''}`;
  buildClaimLines();
  drawClaimPick(); // choosing a plot to claim (06-actions.js): it follows you
}
const others = new Map();
function faceTex(hair) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#f6d3b8';
  x.fillRect(0, 0, 8, 8);
  x.fillStyle = hair;
  x.fillRect(0, 0, 8, 2);
  x.fillRect(0, 2, 1, 2);
  x.fillRect(7, 2, 1, 2);
  x.fillStyle = '#1c163a';
  x.fillRect(2, 4, 1, 1);
  x.fillRect(5, 4, 1, 1);
  x.fillStyle = '#ffb3cf';
  x.fillRect(1, 5, 1, 1);
  x.fillRect(6, 5, 1, 1);
  x.fillStyle = '#c98a74';
  x.fillRect(3, 6, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
// a floating name plate; a chapter title (029_chapters.sql), when there is one, sits on a second line
function nameTag(name, color, title) {
  const c = document.createElement('canvas'),
    hgt = title ? 92 : 64;
  c.width = 256;
  c.height = hgt;
  const x = c.getContext('2d');
  x.font = '600 30px ' + UI_FONT;
  let w = x.measureText(name).width + 44;
  if (title) {
    x.font = '500 20px ' + UI_FONT;
    w = Math.max(w, x.measureText(title).width + 28);
  }
  w = Math.min(240, w);
  x.fillStyle = 'rgba(28,22,58,.72)';
  x.beginPath();
  x.roundRect ? x.roundRect(128 - w / 2, 10, w, hgt - 20, 12) : x.rect(128 - w / 2, 10, w, hgt - 20);
  x.fill();
  x.fillStyle = color;
  x.beginPath();
  x.arc(128 - w / 2 + 18, 32, 6, 0, Math.PI * 2);
  x.fill();
  x.font = '600 30px ' + UI_FONT;
  x.fillStyle = '#f4f1ff';
  x.textBaseline = 'middle';
  x.fillText(name, 128 - w / 2 + 32, 33);
  if (title) {
    x.font = '500 20px ' + UI_FONT;
    x.fillStyle = '#ffd95e';
    x.textAlign = 'center';
    x.fillText(title, 128, 63);
  }
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.8, (0.45 * hgt) / 64, 1);
  s.renderOrder = 10;
  return s;
}
// swap an avatar's name plate when its title changes
function setTagTitle(av, title) {
  if (!av || (av.title || '') === (title || '')) return;
  av.title = title || '';
  const old = av.tag;
  av.tag = nameTag(av.name, av.color, av.title);
  av.tag.position.y = av.title ? 2.2 : 2.1;
  av.g.remove(old);
  old.material.map.dispose();
  old.material.dispose();
  av.g.add(av.tag);
}
// your own title, shared with the other players via presence (your own plate stays hidden)
function updateTitle() {
  Net.setTitle(bestTitle());
}
function makeAvatar(name, color, horsScene) {
  const g = new THREE.Group(),
    M = c => new THREE.MeshLambertMaterial({ color: c }),
    col = new THREE.Color(color),
    dark = col.clone().multiplyScalar(0.7);
  const skin = M(0xf6d3b8),
    hair = M(dark),
    face = new THREE.MeshLambertMaterial({ map: faceTex('#' + dark.getHexString()) });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [hair, hair, hair, skin, hair, face]);
  head.position.y = 1.52;
  head.castShadow = true;
  g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.28), M(col));
  body.position.y = 0.94;
  body.castShadow = true;
  g.add(body);
  // armor plating: dark base + a glowing center seam, matching the item icon's look. Hidden unless worn;
  // the glow color is set by updateArmorVisual(). Faces -z, like the head's face texture. Worn for the
  // Merge Aegis; the other platings have a look of their own (ARMOR_LOOKS, below).
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.32), M(0x2a1838));
  plate.position.y = 1.08;
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.34, 0.02),
    new THREE.MeshLambertMaterial({ color: 0x00eaff, emissive: 0x00eaff, emissiveIntensity: 0.9 }),
  );
  seam.position.set(0, 0, -0.17);
  plate.add(seam);
  for (const x of [-0.2, 0.2]) {
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.02),
      new THREE.MeshLambertMaterial({ color: 0x00eaff, emissive: 0x00eaff, emissiveIntensity: 0.9 }),
    );
    pip.position.set(x, 0.14, -0.17);
    plate.add(pip);
  }
  plate.visible = false;
  plate.castShadow = true;
  g.add(plate);
  // the Genesis Titan Fang's cape: the boss's own basalt-and-ember colors. Hidden unless owned (updateCapeVisual,
  // from S.nfts) — always worn once earned, no equip slot (unlike armor, there's nothing to choose between).
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.04), new THREE.MeshLambertMaterial({ color: 0x3a2d52 }));
  cape.position.set(0, 0.95, 0.17);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.06, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.6 }),
  );
  trim.position.set(0, -0.32, 0);
  cape.add(trim);
  cape.visible = false;
  cape.castShadow = true;
  g.add(cape);
  const limb = (w, h, d, m, x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.y = -h / 2;
    b.castShadow = true;
    p.add(b);
    g.add(p);
    return p;
  };
  const pants = M(0x6a58e0);
  const legs = [limb(0.24, 0.62, 0.26, pants, -0.13, 0.62), limb(0.24, 0.62, 0.26, pants, 0.13, 0.62)],
    arms = [limb(0.18, 0.62, 0.22, M(col), -0.35, 1.26), limb(0.18, 0.62, 0.22, M(col), 0.35, 1.26)];
  const tag = nameTag(name, color);
  tag.position.y = 2.1;
  g.add(tag);
  // the clay look's chibi proportions: a bigger head, a shorter body and legs. Everything above the hips
  // sits in one group lowered by 0.2, so the animation's absolute heights (updateOthers) still apply.
  if (CLAY) {
    const up = new THREE.Group();
    up.position.y = -0.2;
    for (const o of [head, body, plate, cape, ...arms]) {
      g.remove(o);
      up.add(o);
    }
    g.add(up);
    head.scale.setScalar(1.32);
    body.geometry.scale(0.94, 0.82, 1);
    for (const l of legs) {
      const b = l.children[0];
      b.scale.y = 0.76;
      b.position.y = (-0.62 * 0.76) / 2;
      l.position.y = 0.47;
    }
    for (const a of arms) {
      a.children[0].scale.y = 0.8;
      a.children[0].position.y = (-0.62 * 0.8) / 2;
    }
  }
  // the Front-Runner Boots: the boss's dark chassis, a glowing visor stripe across the toe and a small thruster
  // at the heel. Hidden unless worn (updateBootsVisual: yours from S.boots, another player's from `bt`)
  const bootMat = M(0x21161a),
    glow = new THREE.MeshLambertMaterial({ color: 0x3fc8e8, emissive: 0x2aa8d0, emissiveIntensity: 0.55 }),
    boots = legs.map(l => {
      const b = new THREE.Group(),
        len = CLAY ? 0.62 * 0.76 : 0.62,
        shell = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.34), bootMat),
        cuff = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.28), bootMat),
        stripe = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.04, 0.04), glow),
        band = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.03, 0.285), glow),
        heel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), glow);
      shell.castShadow = true;
      cuff.position.set(0, 0.15, 0.02);
      band.position.set(0, 0.19, 0.02);
      stripe.position.set(0, 0.03, -0.16);
      heel.position.set(0, -0.03, 0.175);
      b.add(shell, cuff, band, stripe, heel);
      b.position.set(0, -len + 0.09, -0.02);
      b.visible = false;
      l.add(b);
      return b;
    });
  if (!horsScene) scene.add(g);
  return {
    g,
    head,
    body,
    legs,
    arms,
    tag,
    plate,
    cape,
    boots,
    held: null,
    name,
    color,
    walk: 0,
    t: null,
    seen: false,
    ph: Math.random() * 6,
  };
}
// third-person held item: a small voxel version of the selected tool/weapon on the right arm, reusing
// heldVoxelGeo() (04-render.js) — the same per-pixel cube build used for the first-person hand. Yours by
// default; another player's from the item id their position messages carry (`h`, below).
const heldNow = () => (S.bar[S.sel] ? itemId(S.bar[S.sel]) : null);
function updateAvatarHand(av, it = heldNow()) {
  if (!av) return;
  const hand = av.arms[1];
  if (av.held) {
    hand.remove(av.held);
    av.held = null;
  }
  const ti = it && !B[it] ? ITEM[it]?.icon : null;
  if (ti == null) return;
  const m = (!B[it] && clayModel(it)) || new THREE.Mesh(heldVoxelGeo(ti), heldVoxelMat);
  m.scale.setScalar(0.72);
  m.position.set(0.1, -0.3, -0.22); // -z is the front, matching the head's face texture
  m.rotation.set(0, -0.3, 0.3);
  hand.add(m);
  av.held = m;
}
// ---------- the platings on a character ----------
// Each plating has its own look, built from boxes on the avatar's body and shoulders (front is -z):
// the Genesis Plating, basalt and ember, a gorget, stepped shoulders with a spike and a burning core; the
// Pure Ether Plating, a pale breastplate with a violet crystal and a validator node (a hexagon ring around
// a glowing core) on the chest, crystal shards rising from the shoulders; the Volt Plating, the same in
// blues; the Merge Aegis, the Genesis cut in black and white, with crystals: one burning at the heart, and
// on each shoulder where the spike was. A plating trim (17-looks.js) tints the glow.
const ARMOR_LOOKS = {
  302: { kind: 'genesis', base: 0x3a2d3a, dark: 0x2a1f2a, line: 0xff7a3a, core: 0xffb347 },
  209: { kind: 'genesis', base: 0x1c1c24, dark: 0xf2f2f6, line: 0xffffff, core: 0xdff6ff, crystals: true },
  109: { kind: 'node', plate: 0xe8e2ff, crystal: [0xd8ccff, 0x6a50d8], shard: [0xc9b8ff, 0x8a6cff], ring: 0x6a50d8, core: 0x9fe8ff },
  108: { kind: 'node', plate: 0xdbe9ff, crystal: [0xbfe2ff, 0x2a7ad8], shard: [0x9fd8ff, 0x2a8ad8], ring: 0x2a6fd8, core: 0x7fe8ff },
};
function buildArmorLook(av, id) {
  const L = ARMOR_LOOKS[id],
    W = 0.5,
    H = CLAY ? 0.54 : 0.66,
    D = 0.28,
    FZ = -D / 2 - 0.02,
    root = new THREE.Group(),
    arms = av.arms.map(a => {
      const g = new THREE.Group();
      a.add(g);
      return g;
    }),
    glows = [];
  av.body.add(root);
  const mat = (c, em, extra) =>
    new THREE.MeshLambertMaterial({ color: c, ...(em ? { emissive: em, emissiveIntensity: 0.6 } : {}), ...extra });
  const box = (p, w, h, d, m, x, y, z, rz = 0, glow) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.z = rz;
    o.castShadow = true;
    p.add(o);
    if (glow) glows.push(o);
    return o;
  };
  if (L.kind === 'genesis') {
    const basalt = mat(L.base),
      dark = mat(L.dark),
      ember = () => new THREE.MeshLambertMaterial({ color: L.line, emissive: L.line, emissiveIntensity: L.crystals ? 0.35 : 0.7 }),
      core = new THREE.MeshLambertMaterial({ color: L.core, emissive: L.core, emissiveIntensity: L.crystals ? 0.9 : 1.2 }),
      crystal = () =>
        new THREE.MeshLambertMaterial({ color: 0xeafcff, emissive: 0x9fe8ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 });
    box(root, W + 0.1, H * 0.7, D + 0.1, basalt, 0, H * 0.08, 0);
    box(root, 0.36, 0.1, D + 0.14, dark, 0, H * 0.5, 0); // the gorget
    if (L.crystals) {
      // the heart: a crystal standing on its point, in a white setting
      box(root, 0.18, 0.18, 0.03, dark, 0, H * 0.14, FZ - 0.035);
      box(root, 0.11, 0.11, 0.06, crystal(), 0, H * 0.14, FZ - 0.07, Math.PI / 4, true);
    } else box(root, 0.14, 0.14, 0.04, core, 0, H * 0.14, FZ - 0.05, 0, true); // the core
    for (const x of [-0.16, 0.16]) box(root, 0.04, H * 0.5, 0.03, ember(), x, H * 0.06, FZ - 0.04, 0, true);
    box(root, W + 0.12, 0.08, D + 0.12, dark, 0, -H * 0.27, 0);
    arms.forEach((g, k) => {
      const s = av.arms[k].position.x < 0 ? -1 : 1;
      g.position.set(s * 0.03, 0.03, 0);
      box(g, 0.3, 0.12, 0.3, basalt, 0, 0.02, 0);
      box(g, 0.255, 0.084, 0.27, basalt, s * 0.02, -0.06, 0);
      box(g, 0.31, 0.03, 0.31, ember(), 0, 0.08, 0, 0, true);
      if (L.crystals) {
        // crystals rising from the shoulder, where the Genesis has its spike
        box(g, 0.07, 0.18, 0.07, crystal(), 0, 0.17, 0, s * -0.2, true);
        box(g, 0.05, 0.11, 0.05, crystal(), s * 0.07, 0.13, 0.05, s * -0.55, true);
      } else box(g, 0.05, 0.1, 0.05, dark, 0, 0.13, 0);
    });
  } else {
    const plate = mat(L.plate),
      cr = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
      ring = new THREE.MeshLambertMaterial({ color: L.ring, emissive: L.ring, emissiveIntensity: 0.6 }),
      core = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: L.core, emissiveIntensity: 1.2 }),
      y = H * 0.12,
      z = FZ - 0.06;
    box(root, W + 0.05, H * 0.66, D + 0.05, plate, 0, H * 0.1, 0);
    box(root, 0.3, 0.28, 0.04, cr(...L.crystal), 0, y, FZ - 0.02);
    // the validator node: a hexagon ring around a glowing core
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      box(root, 0.09, 0.025, 0.03, ring, Math.cos(a) * 0.085, y + Math.sin(a) * 0.085, z, a + Math.PI / 2, true);
    }
    box(root, 0.06, 0.06, 0.035, core, 0, y, z - 0.005, Math.PI / 4, true);
    arms.forEach((g, k) => {
      const s = av.arms[k].position.x < 0 ? -1 : 1;
      g.position.set(s * 0.06, 0.03, 0);
      box(g, 0.32, 0.14, 0.32, plate, 0, 0.02, 0);
      box(g, 0.27, 0.1, 0.28, plate, s * 0.05, -0.09, 0);
      box(g, 0.07, 0.24, 0.07, cr(...L.shard), s * -0.03, 0.13, 0, s * -0.3, true);
      box(g, 0.05, 0.16, 0.05, cr(...L.shard), s * 0.04, 0.09, 0.06, s * -0.6, true);
    });
  }
  return { parts: [root, ...arms], glows, base: glows.map(o => o.material.emissive.getHex()) };
}
// shows the plating an avatar wears (yours from S.armor; another player's from `ar`), with your trim
function updateArmorVisual(av, id = S.armor, trim = av === SELF ? platingTrimColor() : null) {
  if (!av) return;
  id = id ? +id : 0;
  const it = ITEM[id];
  // the Merge Aegis, and any plating without a look of its own: the plate and its glowing seam
  av.plate.visible = !!it && !ARMOR_LOOKS[id];
  if (av.plate.visible) {
    const c = trim ?? ({ 108: 0x00eaff, 209: 0xffd166, 302: 0xffb347 }[id] || 0xc9a6ff);
    for (const child of av.plate.children) {
      child.material.color.setHex(c);
      child.material.emissive.setHex(c);
    }
  }
  av.armorLooks ||= {};
  for (const [k, look] of Object.entries(av.armorLooks)) if (+k !== id) for (const p of look.parts) p.visible = false;
  if (!it || !ARMOR_LOOKS[id]) return;
  const look = (av.armorLooks[id] ||= buildArmorLook(av, id));
  for (const p of look.parts) p.visible = true;
  look.glows.forEach((o, i) => o.material.emissive.setHex(trim ?? look.base[i]));
}
// shows/hides the Front-Runner Boots on an avatar's feet
function updateBootsVisual(av, on) {
  if (!av || !av.boots) return;
  for (const b of av.boots) b.visible = !!on;
}
// no equip slot: owning a Genesis Titan Fang is the only condition, there's nothing to choose between
const hasCape = () => S.nfts.some(n => n.id === 205);
// shows/hides the avatar's cape to match Fang ownership (self only, same scope as armor)
function updateCapeVisual(av) {
  if (!av) return;
  av.cape.visible = hasCape() && !av.backWorn; // a worn back piece (17-looks.js) takes its place
}
// ---------- seeing yourself: back view, front view (V key), and the character in the chest ----------
let VIEW = 0, // 0: through your eyes; 1: from behind; 2: from the front
  SELF = null;
const viewFrom = new THREE.Vector3(),
  viewDir = new THREE.Vector3(),
  viewPos = new THREE.Vector3();
// the view is remembered per device (new key); the clay look starts from behind, over the shoulder
const VIEW_KEY = 'ether-mines:view';
let viewReady = false;
function initView() {
  viewReady = true;
  let v = CLAY ? 1 : 0;
  try {
    const sv = localStorage.getItem(VIEW_KEY);
    if (sv !== null) v = +sv || 0;
  } catch (e) {}
  while (VIEW !== v % 3) changeView(true);
}
function changeView(quiet) {
  VIEW = (VIEW + 1) % 3;
  if (!quiet)
    try {
      localStorage.setItem(VIEW_KEY, String(VIEW));
    } catch (e) {}
  if (SELF && SELF.color !== ME.color) {
    scene.remove(SELF.g);
    SELF = null;
  }
  if (VIEW && !SELF) {
    SELF = makeAvatar(ME.name, ME.color);
    SELF.tag.visible = false;
    viewPos.set(P.x, P.y, P.z);
    applyLook(SELF, myLook());
    updateArmorVisual(SELF);
    updateCapeVisual(SELF);
    updateAvatarHand(SELF);
  }
  if (SELF) SELF.g.visible = VIEW > 0;
  if (!quiet) logEv('nft', ['Through your eyes', 'View from behind', 'View from the front'][VIEW], touch ? '' : 'press V to change');
}
// the arms of a character (yours seen from outside, another player's), drawing the same gestures as the
// first-person hand (10-loop.js): on guard, the sword arm comes up in front, the blade flat across the face,
// pointing to the left; a blow, a quick thrust toward where the character looks, the blade's tip leaning
// in, the shoulders turning into it; otherwise the arms swing with the walk. g: the guard, 0..1; s: how far
// out the thrust is, 0..1; a: the walk's swing; idle: the breathing; pitch: where the character looks
const GUARD_HELD = [-0.4, 3.14, 1.57]; // the blade's turn in the hand, on guard (x, y, z)
function poseArms(o, g, s, a, idle, pitch) {
  const up = Math.max(-0.6, Math.min(0.8, pitch || 0));
  let rx = a,
    rz = 0.06 + idle,
    lx = -a,
    lz = -0.06 - idle,
    tw = 0;
  // (an arm's +x turn brings it forward: the body faces -z; a -z turn brings the right arm inward)
  if (g > 0.02) {
    rx = (1.55 + up * 0.5) * g + a * (1 - g);
    rz = -0.35 * g + rz * (1 - g);
    lx = lx * (1 - g);
    lz = lz * (1 - g) - 0.04 * g;
    tw = 0.12 * g;
  }
  if (s > 0) {
    // the thrust, on top of the walk or the guard: the arm reaches out level with the eyes
    rx += (1.55 + up - rx) * s;
    rz += (-0.28 - rz) * s;
    tw += (-0.3 - tw) * s;
  }
  o.arms[1].rotation.x = rx;
  o.arms[1].rotation.z = rz;
  o.arms[0].rotation.x = lx;
  o.arms[0].rotation.z = lz;
  o.body.rotation.y = tw;
  if (o.held) {
    const h = o.guardHeld || GUARD_HELD;
    // a thrust turns the blade along the arm, its tip out ahead and a little up
    const k = s * (1 - g);
    o.held.rotation.set(h[0] * g - 2.64 * k, -0.3 + h[1] * g, 0.3 + h[2] * g + 0.48 * k);
  }
}
// a blow's thrust, as the first-person hand draws it (10-loop.js): out at once, then back, from `swing`
const thrustOf = sw => (sw > 0 ? Math.min(1, (Math.sin((1 - sw) * Math.PI) * sw) / 0.57) : 0);
// places the player's avatar and pulls the camera back (without crossing walls); returns a function that resets the camera to the eyes
function viewFromOutside(dt) {
  if (!VIEW || !SELF) return null;
  const o = SELF,
    sp = Math.hypot(P.x - viewPos.x, P.z - viewPos.z) / Math.max(dt, 0.001),
    mv = Math.min(1, sp / 2);
  viewPos.set(P.x, P.y, P.z);
  o.g.position.set(P.x, P.y, P.z);
  o.g.rotation.y = yaw;
  o.head.rotation.x = -pitch * 0.6;
  o.walk += Math.min(sp, 8) * dt * 1.6;
  o.ph += dt;
  const a = mv * Math.sin(o.walk) * 0.7,
    br = Math.sin(o.ph * 2.2),
    hop = Math.abs(Math.sin(o.walk)) * 0.07 * mv;
  o.legs[0].rotation.x = a;
  o.legs[1].rotation.x = -a;
  // on guard (16-mobs.js) or striking: poseArms
  poseArms(o, guardAmt, thrustOf(swing), a, 0, pitch);
  o.body.scale.set(1 + br * 0.02, 1 + br * 0.012, 1 + br * 0.035);
  o.body.position.y = 0.94 + hop;
  o.head.position.y = 1.52 + hop + br * 0.012;
  o.arms[0].position.y = o.arms[1].position.y = 1.26 + hop;
  if (typeof rideSelf === 'function') rideSelf(o); // on board: seated on the craft
  viewFrom.copy(camera.position);
  viewDir.set(0, 0, VIEW === 1 ? 1 : -1).applyQuaternion(camera.quaternion);
  let d = 0;
  while (d < 4) {
    const id = get(
      Math.floor(viewFrom.x + viewDir.x * (d + 0.3)),
      Math.floor(viewFrom.y + viewDir.y * (d + 0.3)),
      Math.floor(viewFrom.z + viewDir.z * (d + 0.3)),
    );
    if (id && id !== 11 && isSolid(id)) break;
    d += 0.1;
  }
  camera.position.addScaledVector(viewDir, Math.max(0.4, d));
  if (VIEW === 2) camera.rotation.set(-pitch, yaw + Math.PI, 0);
  // the clay look: over the right shoulder, turned a touch so the crosshair still meets what you aim at
  else if (CLAY && d > 1.2) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
      fwd = viewDir.clone().negate(),
      aimAt = viewFrom
        .clone()
        .addScaledVector(
          fwd,
          target ? clamp(viewFrom.distanceTo(new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5)), 2, 12) : 8,
        );
    camera.position.addScaledVector(right, 0.55).y += 0.2;
    camera.lookAt(aimAt);
  }
  camera.updateMatrixWorld();
  return () => {
    camera.position.copy(viewFrom);
    camera.rotation.set(pitch, yaw, 0);
    camera.updateMatrixWorld();
  };
}
$('vueBtn').onclick = () => playing && changeView();
// the character, in the chest panel: it spins in place, you can drag it with a finger, and pick its color
let PREVIEW = null;
function previewBox() {
  if (!PREVIEW) {
    const box = document.createElement('div');
    box.className = 'avatar';
    box.innerHTML = '<canvas width="520" height="400"></canvas><div class="pname"></div><div class="pcolor"></div>';
    const c = box.querySelector('canvas');
    let r = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
    } catch (e) {}
    const sc = new THREE.Scene(),
      cam = new THREE.PerspectiveCamera(30, 520 / 400, 0.1, 20);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7bef, 0.95));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55);
    dl.position.set(2, 3, 4);
    sc.add(dl);
    cam.position.set(0, 1.25, 5.4);
    cam.lookAt(0, 1.05, 0);
    PREVIEW = { box, c, r, sc, cam, av: null, rot: 0.5, dragging: false, en: false };
    c.addEventListener('pointerdown', e => {
      PREVIEW.dragging = true;
      PREVIEW.x = e.clientX;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (!PREVIEW.dragging) return;
      PREVIEW.rot += (e.clientX - PREVIEW.x) * 0.012;
      PREVIEW.x = e.clientX;
    });
    c.addEventListener('pointerup', () => (PREVIEW.dragging = false));
    c.addEventListener('pointercancel', () => (PREVIEW.dragging = false));
  }
  const p = PREVIEW;
  const wantColor = p.tryColor || ME.color; // trying on an outfit in the shop
  if (!p.av || p.av.color !== wantColor || p.av.name !== ME.name) {
    if (p.av) p.sc.remove(p.av.g);
    p.av = makeAvatar(ME.name, wantColor, true);
    p.av.tag.visible = false;
    p.sc.add(p.av.g);
  }
  // the shop's "Try" puts a piece on this character without buying it (PREVIEW.tryLook)
  applyLook(p.av, p.tryLook || myLook(), true);
  updateArmorVisual(p.av, S.armor, platingTrimColor());
  updateCapeVisual(p.av);
  updateAvatarHand(p.av);
  p.box.querySelector('.pname').textContent = ME.name;
  const pc = p.box.querySelector('.pcolor');
  pc.innerHTML = '';
  for (const col of COLORS) {
    const b = document.createElement('button');
    b.style.background = col;
    b.setAttribute('aria-label', 'Outfit color');
    if (col === ME.color) b.className = 'sel';
    b.onclick = () => {
      profile.color = ME.color = col;
      if (S.look) delete S.look.outfit; // a plain color: no outfit from the shop anymore
      try {
        localStorage.setItem(PKEY, JSON.stringify(profile));
      } catch (e) {}
      lookChanged();
      if (SELF) {
        scene.remove(SELF.g);
        SELF = null;
        if (VIEW) {
          VIEW--;
          changeView();
        }
      }
      dirty = cloudDirty = true;
      renderPanel();
    };
    pc.appendChild(b);
  }
  if (!p.en && p.r) {
    p.en = true;
    const spin = () => {
      if (!p.c.isConnected || $('panel').hidden) return (p.en = false);
      if (!p.dragging) p.rot += 0.008;
      const t = performance.now() / 1000;
      p.av.g.rotation.y = Math.PI + p.rot;
      p.av.arms[0].rotation.x = Math.sin(t * 1.6) * 0.12;
      p.av.arms[1].rotation.x = -Math.sin(t * 1.6) * 0.12;
      p.av.head.rotation.y = Math.sin(t * 0.8) * 0.25;
      tickLookAnims(p.av, t);
      p.r.render(p.sc, p.cam);
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }
  return p.box;
}
function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  scene.remove(o.g);
  others.delete(id);
  dropFollower(id);
}
function ensureOther(p) {
  let o = others.get(p.id);
  // a new outfit color: rebuild the avatar, keeping where it stands
  if (o && p.color && p.color !== o.color) {
    const keep = { t: o.t, tAt: o.tAt, r: o.r, pos: o.g.position.clone(), rot: o.g.rotation.y };
    scene.remove(o.g);
    o = makeAvatar(p.name || o.name, p.color);
    Object.assign(o, { t: keep.t, tAt: keep.tAt, r: keep.r, seen: !!keep.t });
    o.g.position.copy(keep.pos);
    o.g.rotation.y = keep.rot;
    others.set(p.id, o);
  }
  if (!o && p.id !== ME.id) {
    o = makeAvatar(p.name || 'Player', p.color || '#8a7bef');
    others.set(p.id, o);
  }
  if (o && p.title !== undefined) setTagTitle(o, p.title);
  if (o && p.look !== undefined) applyLook(o, parseLook(p.look));
  return o;
}
// PvP targeting: same aimRay/aniBox/aniV pattern as pickMob/pickAnimal, against the avatar's own silhouette
function pickPlayer(at, blk) {
  const ray = aimRay(at);
  let best = null,
    bestId = null,
    bd = 5.2;
  for (const [id, o] of others) {
    if (!o.t) continue; // out of range: not shown, not hittable
    const p = o.g.position,
      m = 0.3;
    aniBox.min.set(p.x - m, p.y, p.z - m);
    aniBox.max.set(p.x + m, p.y + 1.9, p.z + m);
    if (ray.intersectBox(aniBox, aniV)) {
      const dd = aniV.distanceTo(ray.origin);
      if (dd < bd) {
        bd = dd;
        best = o;
        bestId = id;
      }
    }
  }
  if (!best) return null;
  if (blk) {
    aniBox.min.set(blk.x, blk.y, blk.z);
    aniBox.max.set(blk.x + 1, blk.y + 1, blk.z + 1);
    if (ray.intersectBox(aniBox, aniV) && aniV.distanceTo(ray.origin) < bd) return null;
  }
  return { id: bestId, o: best };
}
// everyone connected to this world (presence), with the region square each one is in (net.js)
let PEERS = [];
Net.on('peers', list => {
  const ids = new Set(list.map(p => p.id)),
    wasNear = Net.anyoneNear(PEERS);
  PEERS = list;
  for (const id of [...others.keys()]) if (!ids.has(id)) removeOther(id);
  for (const p of list) {
    const o = ensureOther(p);
    if (o) {
      o.r = p.r;
      // through the game server, everyone's position comes with the list (/join goes straight there)
      o.at = Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, y: p.y, z: p.z } : null;
    }
  }
  if (!wasNear && Net.anyoneNear(list)) lastPos = null; // someone just came close: show yourself right away
  PEER_NAMES = list.map(p => (p.id === ME.id ? 'you' : p.name));
  $('online').hidden = !Net.online;
  onlineBadge();
  if (!minersStarted) {
    minersStarted = true;
    refreshMiners();
  }
});
// the badge: who is connected right now, and how many nicknames the world has in all.
// Three names at most, then "+N": with 50 people online the line stays short.
let PEER_NAMES = [],
  MINERS = null,
  minersStarted = false,
  minersTimer = 0;
const fmtN = n => n.toLocaleString('en-US');
let outdatedTold = false;
function onlineBadge() {
  const n = PEER_NAMES,
    miners = MINERS === null ? 0 : Math.max(MINERS, 1), // you count before your first save reaches the server
    all = miners ? ` · ${fmtN(miners)} ${miners > 1 ? 'miners' : 'miner'}` : '',
    more = n.length > 3 ? ` +${n.length - 3}` : '';
  // ⚡: through the game server (everyone on it sees each other); without it, through Supabase's relays
  const via = CONFIG.GAME_SERVER ? (Net.gameServer ? ' ⚡' : ' · relay') : '';
  $('onlineTxt').textContent = `${fmtN(n.length)} online${via}${all} · ${n.slice(0, 3).join(', ')}${more}`;
}
// asked when you join, then every minute; a failed request is tried again 10 seconds later
async function refreshMiners() {
  clearTimeout(minersTimer);
  let wait = 60000;
  try {
    if (!Net.online) throw new Error('offline');
    MINERS = await Net.playerCount();
    onlineBadge();
  } catch {
    wait = 10000;
  }
  minersTimer = setTimeout(refreshMiners, wait);
}
Net.on('pos', p => {
  const o = ensureOther(p);
  if (!o) return;
  o.t = p;
  o.tAt = performance.now();
  updateBootsVisual(o, !!p.bt); // the boots they wear
  if ((p.ar || 0) !== (o.ar || 0)) updateArmorVisual(o, (o.ar = Number.isInteger(p.ar) && ITEM[p.ar]?.armor ? p.ar : 0)); // their plating
  // what they hold: a tool or weapon id (older clients send nothing), anything unknown shows an empty hand
  const h = Number.isInteger(p.h) && ITEM[p.h] && !B[p.h] ? p.h : 0;
  if (o.heldId !== h) {
    o.heldId = h;
    updateAvatarHand(o, h || null);
  }
  if (!o.seen) {
    o.seen = true;
    o.g.position.set(p.x, p.y, p.z);
  }
});
Net.on('block', b => applyBlock(b));
// the world was put back the way it was generated, outside the claims (042_world_restore.sql): read it again
let restoring = false;
Net.on('restored', () => {
  if (restoring) return;
  restoring = true;
  logEv('burn', 'The map is being restored', 'everything outside the claimed plots is back as it was');
  toastInfo('The map was restored outside the claimed plots: reloading…');
  setTimeout(() => location.reload(), 4000);
});
// on a touch screen, a tap on the label under the crosshair opens the block explorer (07-interface.js)
$('target').addEventListener('click', () => target && openExplorer(target));
// ignored players: kept in this browser, their messages no longer show up (also blocks PvP, below)
const IGNORES = new Set(JSON.parse(localStorage.getItem('ether-mines:ignores') || '[]'));
const saveIgnores = () => localStorage.setItem('ether-mines:ignores', JSON.stringify([...IGNORES]));
Net.on('chat', m => {
  if (!IGNORES.has(String(m.name).toLowerCase())) addChat(m.name, m.color, m.text);
});
// PvP: client-resolved like mob/animal combat (no loot, no penalty — nothing to arbitrate server-side).
// The attacker only reports a weapon id, never a damage number: dmg is computed here, on the receiving end.
const lastHitFrom = new Map();
Net.on('hit', p => {
  if (p.to !== ME.id || !playing || Net.hpServer) return; // (the game server keeps your hearts: it sends `hurt`)
  if (IGNORES.has((others.get(p.from)?.name || '').toLowerCase())) return;
  if (performance.now() < pvpGraceUntil) return; // just respawned
  if (sanctuary(P.x, P.z)) return; // my own true position — can't be spoofed by the attacker
  const last = lastHitFrom.get(p.from) || 0;
  if (performance.now() - last < 700) return; // floor independent of the attacker's own cooldown
  // plausibility, not a trust boundary: melee range, or the Plasma Pistol's bolt range plus slack
  if (Math.hypot(P.x - p.x, P.y - p.y, P.z - p.z) > (ITEM[p.item]?.ranged ? 30 : 6.5)) return;
  lastHitFrom.set(p.from, performance.now());
  // through the game server, the damage is its own (it checked the weapon you really have); otherwise, from the weapon named
  const dmg = Net.gameServer && Number.isFinite(p.dmg) ? clamp(Math.round(p.dmg), 1, 10) : pvpDamage(p.item);
  hurtPlayer(dmg, p.x, p.z, ITEM[p.item]?.ranged ? 'bolt' : 'pvp');
});
// weapons are tuned against mobs (10 to 60 hp): against a player's 10 hearts they'd kill in two blows.
// Between players a hit does 40% of it, at least one heart: a fight takes several clean hits.
const pvpDamage = item => Math.max(1, Math.round((ITEM[item]?.dmg || 1) * 0.4));
let usernameFlagged = false;
Net.on('status', s => {
  if (s === 'SAVE_ERROR') logEv('burn', 'Save refused by the server', 'check the Supabase schema');
  if (s === 'USERNAME_TAKEN' && !usernameFlagged) {
    usernameFlagged = true;
    logEv(
      'burn',
      `The nickname "${ME.name}" is already taken in this world`,
      'pick another one (Escape, then the menu) to save your progress',
    );
  }
  if (s === 'CLOSED' || s === 'CHANNEL_ERROR') $('onlineTxt').textContent = 'Connection lost · reconnecting…';
  // the game server and this page don't speak the same version: say so, players can't see each other otherwise
  if (s === 'GAME_OUTDATED' && !outdatedTold) {
    outdatedTold = true;
    logEv('burn', 'A new version of the game is out', 'reload the page to play with the others');
    toastInfo('A new version of the game is out: reload the page to see the other players.');
  }
  if (s === 'SERVER_OUTDATED' && !outdatedTold) {
    outdatedTold = true;
    logEv('burn', 'The game server is being updated', 'the others may not see you for a moment');
  }
  if (s === 'GAME_SERVER' || s === 'GAME_SERVER_LOST') onlineBadge();
});
function updateOthers(dt) {
  const now = performance.now();
  for (const o of others.values()) {
    // no news for a while (a heartbeat comes every 4 s): out of range, hide them until they're back
    if (o.t && now - o.tAt > 10000) {
      o.t = null;
      o.seen = false;
    }
    o.g.visible = !!o.t;
    if (!o.t) continue;
    const g = o.g,
      k = Math.min(1, dt * 7);
    const dx = o.t.x - g.position.x,
      dz = o.t.z - g.position.z;
    g.position.x += dx * k;
    g.position.y += (o.t.y - g.position.y) * k;
    g.position.z += dz * k;
    let dr = o.t.yaw - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * k;
    o.head.rotation.x = -(o.t.pitch || 0) * 0.6;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    o.walk += Math.min(sp, 8) * dt * 1.6;
    const a = Math.min(1, sp / 2) * Math.sin(o.walk) * 0.7;
    o.legs[0].rotation.x = a;
    o.legs[1].rotation.x = -a;
    o.ph += dt;
    const br = Math.sin(o.ph * 2.2),
      mv = Math.min(1, sp / 2),
      hop = Math.abs(Math.sin(o.walk)) * 0.07 * mv;
    o.body.scale.set(1 + br * 0.02, 1 + br * 0.012, 1 + br * 0.035);
    o.body.position.y = 0.94 + hop;
    o.head.position.y = 1.52 + hop + br * 0.012;
    o.head.rotation.z = Math.sin(o.walk) * 0.06 * mv;
    // the guard eases up and down; swinging (mining, striking): a blow every 0.45 s, as your own clicks go
    o.gdAmt = (o.gdAmt || 0) + ((o.t.gd ? 1 : 0) - (o.gdAmt || 0)) * Math.min(1, dt * 14);
    const sw = o.t.m ? Math.max(0, 0.6 - ((performance.now() / 450) % 1) * 1.35) : 0;
    poseArms(o, o.gdAmt, thrustOf(sw), a, br * 0.03 * (1 - mv), o.t.pitch);
    o.arms[0].position.y = o.arms[1].position.y = 1.26 + hop;
    o.tag.position.y = 2.1 + hop;
    if (typeof rideOther === 'function') rideOther(o); // on board a hovercraft, or in someone's back seat
  }
}
setInterval(() => {
  if (!SERVER() || !booted || !playing) return;
  serverAct('rewards', {}).then(r => {
    if (!r || r.gwei === undefined) return;
    S.gwei = r.gwei;
    if (r.gained > 0) logEv('mint', `${r.gained} Gwei`, 'collected from your validators');
    ui();
  });
}, 60000);
// Position: at most 5 times a second, only if actually moving, and a sign of life every 4 s.
// Every send is received by all other players: this is the first real-time message post.
let lastPos = null,
  lastPosT = 0;
setInterval(() => {
  if (!Net.online || !playing) return;
  if (Net.setRegion(P.x, P.z)) lastPos = null; // a new square: the players there see you at once
  const now = performance.now(),
    p = {
      id: ME.id,
      name: ME.name,
      color: ME.color,
      x: +P.x.toFixed(2),
      y: +P.y.toFixed(2),
      z: +P.z.toFixed(2),
      yaw: +yaw.toFixed(2),
      pitch: +pitch.toFixed(2),
      m: mining, // swinging, at a block, a mob or the air: the others see the arm move
      h: ITEM[heldNow()] && !B[heldNow()] ? +heldNow() : 0,
      gd: guarding() ? 1 : 0, // the blade up, on guard
      rd: RIDE ? RIDE.id : 0, // on board a hovercraft (20-hover.js): which one
      on: BOARD ? BOARD.driver : 0, // in the back seat of that player's craft
      wd: POTION.ward > 0 ? 1 : 0, // under the Ward Incense: the game server's mobs don't see you
      ld: playerOnLadder() ? 1 : 0, // on a ladder: the game server's tower mobs hold their blows
      ar: S.armor ? +S.armor : 0, // the plating you wear (the game server checks you own it)
      bt: bootsOn() ? 1 : 0, // the Front-Runner Boots on your feet: the others see them
      nm: mobsHere() ? 0 : 1, // hostile mobs turned off in this world: the game server's mobs leave you be
    };
  const L = lastPos,
    moved =
      !L ||
      Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z) > 0.08 ||
      Math.abs(p.yaw - L.yaw) > 0.06 ||
      Math.abs(p.pitch - L.pitch) > 0.08 ||
      p.m !== L.m ||
      p.h !== L.h ||
      p.gd !== L.gd ||
      p.rd !== L.rd ||
      p.on !== L.on ||
      p.wd !== L.wd ||
      p.ld !== L.ld ||
      p.ar !== L.ar ||
      p.bt !== L.bt ||
      p.nm !== L.nm;
  if (!moved && now - lastPosT < 4000) return;
  lastPos = p;
  lastPosT = now;
  // nobody within one square of you: nothing to send (Supabase counts every message)
  // (when the game server runs the mobs, it needs your position even alone: they hunt you there)
  if (Net.anyoneNear(PEERS) || Net.mobServer) Net.sendPos(p);
  // server position: a ping every 15 s while moving (used by /join and by move validation)
  if (
    SERVER() &&
    booted &&
    (!lastSrvPos || (now - lastSrvPos.t > (RIDE || BOARD ? 3000 : 15000) && Math.hypot(p.x - lastSrvPos.x, p.z - lastSrvPos.z) > 2))
  ) {
    lastSrvPos = { t: now, x: p.x, z: p.z };
    Net.act('pos', position()).catch(() => {});
  }
}, 200);
let lastSrvPos = null;
let chatOpen = false,
  chatJetons = 4,
  chatT = 0;
function addChat(name, color, text) {
  const d = document.createElement('div');
  d.className = 'msg';
  const n = document.createElement('b');
  n.textContent = name;
  n.style.color = color;
  const t = document.createElement('span');
  t.textContent = ' ' + text;
  d.append(n, t);
  $('chatLog').appendChild(d);
  while ($('chatLog').children.length > 8) $('chatLog').firstChild.remove();
  setTimeout(() => d.classList.add('old'), 9000);
}
function openChat() {
  chatOpen = true;
  keys.clear();
  mining = false;
  $('chatForm').hidden = false;
  $('chatLog').classList.add('open');
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => $('chatIn').focus(), 0);
}
function closeChat() {
  chatOpen = false;
  $('chatForm').hidden = true;
  $('chatLog').classList.remove('open');
  $('chatIn').blur();
  if (playing) tryLock();
}
function command(v) {
  const [c, ...rest] = v.slice(1).split(' ');
  const arg = rest.join(' ').trim().toLowerCase();
  if (c === 'sanctuary') {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
    P.vy = 0;
    addChat('World', '#7fe8ff', 'Back to the sanctuary.');
    return;
  }
  if (c === 'join') {
    const o = [...others.values()].find(o => o.name.toLowerCase() === arg || o.name.toLowerCase().startsWith(arg));
    if (!o) {
      addChat('World', '#7fe8ff', arg ? `No one here is called "${arg}".` : 'Type /join followed by a nickname.');
      return;
    }
    if (!o.t && o.at) {
      P.x = o.at.x + 1;
      P.y = o.at.y + 0.5;
      P.z = o.at.z + 1;
      P.vy = 0;
      addChat('World', '#7fe8ff', `You join ${o.name}.`);
      return;
    }
    if (!o.t && !o.r) {
      // online, but their game hasn't said where they are yet (on the title screen or paused, or just reconnected)
      addChat(
        'World',
        '#7fe8ff',
        `${o.name} is online but not in the game right now: ask them to resume and move a little, then try again.`,
      );
      return;
    }
    const go = () => {
      P.x = o.t.x + 1;
      P.y = o.t.y + 0.5;
      P.z = o.t.z + 1;
      P.vy = 0;
      addChat('World', '#7fe8ff', `You join ${o.name}.`);
    };
    if (o.t) return go();
    // far away: listen to their square until their next position comes in (every 4 s at most)
    Net.watchRegion(o.r);
    addChat('World', '#7fe8ff', `Looking for ${o.name}…`);
    const t0 = performance.now(),
      wait = setInterval(() => {
        if (o.t) {
          clearInterval(wait);
          go();
        } else if (performance.now() - t0 > 7000) {
          clearInterval(wait);
          addChat('World', '#7fe8ff', `${o.name} can't be reached right now.`);
        }
      }, 250);
    return;
  }
  if (c === 'ignore' || c === 'listen') {
    if (!arg) {
      addChat('World', '#7fe8ff', IGNORES.size ? `Ignored: ${[...IGNORES].join(', ')}` : "You're not ignoring anyone.");
      return;
    }
    if (c === 'ignore') IGNORES.add(arg);
    else IGNORES.delete(arg);
    saveIgnores();
    addChat('World', '#7fe8ff', c === 'ignore' ? `You will no longer see messages from ${arg}.` : `You see messages from ${arg} again.`);
    return;
  }
  if (c === 'report') {
    if (!arg) return addChat('World', '#7fe8ff', 'Type /report followed by a nickname.');
    if (!SERVER()) return addChat('World', '#7fe8ff', 'Reports need an online game.');
    Net.act('report', { username: arg })
      .then(r => {
        const m = !r
          ? 'try again later'
          : r.ok
            ? r.muted
              ? `${arg} has been muted for a while.`
              : `Report recorded. Three reports mute ${arg}.`
            : r.err === 'unknown player'
              ? `No one here is called "${arg}".`
              : r.err === 'must have played a little'
                ? 'Play a little before you can report someone.'
                : r.err === 'too many actions'
                  ? 'One report at a time, slow down a bit.'
                  : r.err;
        addChat('World', '#7fe8ff', m);
        if (r && r.ok) {
          IGNORES.add(arg);
          saveIgnores();
        }
      })
      .catch(() => addChat('World', '#7fe8ff', 'Reporting unavailable (schema 003 needs to be run).'));
    return;
  }
  if (c === 'trade') {
    if (rest.length) TRADE.b.pseudo = rest.join(' ').trim();
    closeChat();
    openTab('trade');
    return;
  }
  if (['claim', 'unclaim', 'invite', 'kick', 'claims'].includes(c)) {
    claimCmd(c, rest.join(' ').trim());
    return;
  }
  addChat(
    'World',
    '#7fe8ff',
    'Commands: /join nickname · /sanctuary · /claim · /unclaim · /invite nickname · /kick nickname · /claims · /trade nickname · /ignore nickname · /listen nickname · /report nickname',
  );
}
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('chatIn').value.trim().slice(0, 140);
  $('chatIn').value = '';
  if (v.startsWith('/')) command(v);
  else if (v) {
    // no more than one message a second on average (bursts of 4)
    const t = performance.now();
    chatJetons = Math.min(4, chatJetons + (t - chatT) / 1000);
    chatT = t;
    if (chatJetons < 1) addChat('World', '#7fe8ff', 'Slow down: one message per second.');
    else {
      chatJetons -= 1;
      Net.chat(v)
        .then(r => {
          if ((r && r.ok) || (r && r.err === 'offline')) addChat(ME.name, ME.color, (r.ok && r.text) || v);
          else if (r && r.err === 'muted')
            addChat('World', '#7fe8ff', `You're still muted for ${r.minutes} min (reported by other players).`);
          else if (r && r.err === 'too many actions') addChat('World', '#7fe8ff', 'Slow down: one message per second.');
          else if (r && r.err) addChat('World', '#7fe8ff', 'Message refused: ' + r.err);
        })
        .catch(() => addChat('World', '#7fe8ff', 'Message not sent, try again.'));
    }
  }
  closeChat();
});
$('chatIn').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeChat();
  }
});
$('chatBtn').onclick = () => (chatOpen ? closeChat() : openChat());
$('chatBtnDesk').onclick = () => (chatOpen ? closeChat() : openChat());

// ---------- startup ----------
function nftOf(key) {
  return S.nfts.find(n => 'nft' + n.serial === key);
}
function itemId(key) {
  if (!key) return 0;
  if (String(key).startsWith('nft')) return nftOf(key)?.id || 201;
  return +key;
}
const PKEY = 'ether-mines:profil',
  COLORS = ['#8a7bef', '#ff9ab8', '#7fe8ff', '#9fe3c4', '#ffd95e', '#ffb37a', '#b6a4ff'];
let profile;
try {
  profile = JSON.parse(localStorage.getItem(PKEY) || 'null');
} catch (e) {}
if (!profile || !profile.id)
  profile = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
    name: '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
const qs = new URLSearchParams(location.search);
$('pseudo').value = profile.name || '';
$('monde').value = qs.get('monde') || 'principal';
let acctErr = '';
const accountReady = Net.enabled
  ? Net.auth()
      .then(id => {
        $('acctTxt').textContent = 'saved online';
        $('acct').hidden = false;
        return id;
      })
      .catch(e => {
        acctErr = e.message || String(e);
        $('acctTxt').textContent = 'unavailable';
        $('acctMsg').textContent = acctErr;
        $('acct').hidden = false;
      })
  : Promise.resolve(null);
$('showCode').onclick = async () => {
  if (!Net.userId) return;
  $('showCode').disabled = true;
  try {
    const c = await Net.recoveryCode();
    $('myCode').textContent = c;
    $('myCode').hidden = false;
    $('acctMsg').textContent =
      'Write down this code: it replaces the old one and will not be shown again. It is used to find your progress on another device.';
  } catch (e) {
    $('acctMsg').textContent = 'Failed: ' + e.message;
  }
  $('showCode').disabled = false;
};
$('useCode').onclick = async () => {
  const c = $('codeIn').value.trim().toUpperCase();
  if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(c)) {
    $('acctMsg').textContent = 'The code looks like 4FC0-B18D-A98D-75EF.';
    return;
  }
  if (!Net.userId) return;
  $('useCode').disabled = true;
  try {
    const n = await Net.claimRecovery(c);
    if (n < 0) throw new Error('unknown code');
    $('acctMsg').textContent = `Progress recovered (${n} world${n > 1 ? 's' : ''}). Reloading…`;
    for (const k of Object.keys(localStorage))
      if (
        k.startsWith('ether-mines:') &&
        k !== PKEY &&
        k !== 'ether-mines:son' &&
        k !== 'ether-mines:session' &&
        k !== 'ether-mines:saison'
      )
        localStorage.removeItem(k);
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    $('acctMsg').textContent = /unknown/.test(e.message)
      ? 'Unknown code.'
      : /attempts/.test(e.message)
        ? 'Too many attempts: wait a few seconds.'
        : 'Failed: ' + e.message;
    $('useCode').disabled = false;
  }
};
$('codeIn').addEventListener('input', e => {
  let v = e.target.value
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '')
    .slice(0, 16);
  e.target.value = v.replace(/(.{4})(?=.)/g, '$1-');
});
$('netStatus').textContent = Net.enabled
  ? 'Multiplayer ready: invite your friends with the world link.'
  : 'Solo mode: add your Supabase keys in src/config.js to play online.';
function pause() {
  playing = false;
  mining = false;
  keys.clear();
  setTimeout(() => cloudSave(true), 50);
  if (touch) releaseAll();
  $('title').hidden = false;
  $('play').textContent = 'Resume';
  save();
}
let booted = false;
function toggleSnd() {
  Sound.init();
  const on = Sound.toggle();
  $('sndBtn').classList.toggle('off', !on);
  $('sndBtn').title = on ? 'Sound (M)' : 'Sound muted (M)';
}
$('sndBtn').classList.toggle('off', !Sound.on);
// shown where full screen works, and on an iPhone (where it explains the home screen route), never
// when already launched from the home screen
$('fsBtn').hidden = fromHomeScreen() || !(fsOk() || isIPhone());
$('fsBtn').onclick = e => {
  e.stopPropagation();
  if (fsOk()) toggleFullscreen();
  else fsHelp();
};
$('sndBtn').onclick = e => {
  e.stopPropagation();
  toggleSnd();
};
// Fullscreen: browser API on Android and desktop; on iPhone, only from the home screen icon.
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (touch && iOS && !standalone) $('hintIos').hidden = false;
function goFullscreen() {
  if (!touch || standalone || document.fullscreenElement) return;
  const el = document.documentElement;
  if (el.requestFullscreen)
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
}
$('play').onclick = async () => {
  goFullscreen();
  Sound.init();
  if (!booted) {
    // same characters as the server (005_usernames.sql): letters, digits, space, _ . -
    const name = $('pseudo')
      .value.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]/g, '')
      .trim()
      .slice(0, 16);
    if (!name) {
      $('pseudo').focus();
      $('netStatus').textContent = 'Pick a nickname so your friends recognize you.';
      return;
    }
    const world =
      ($('monde').value.trim() || 'principal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 32) || 'principal';
    // one nickname per player per world: you can't enter with someone else's
    if (Net.enabled) {
      $('play').disabled = true;
      $('netStatus').textContent = 'Checking nickname…';
      let taken = false,
        failure = null;
      try {
        taken = await Net.isUsernameTaken(world, name);
      } catch (e) {
        failure = e;
      }
      $('play').disabled = false;
      $('netStatus').textContent = '';
      if (taken || failure) {
        $('netStatus').textContent = taken
          ? `The nickname "${name}" is already taken in this world. Pick another one. If it's yours on another device, use your recovery code.`
          : 'Connection failed: ' + (failure.message || failure) + '. Check src/config.js and the schema.';
        $('pseudo').focus();
        return;
      }
    }
    profile.name = name;
    try {
      localStorage.setItem(PKEY, JSON.stringify(profile));
    } catch (e) {}
    ME = { id: profile.id, name, color: profile.color };
    KEY = 'ether-mines:' + world;
    loadState();
    $('play').disabled = true;
    $('play').textContent = Net.enabled ? 'Connecting…' : 'Generating the world…';
    $('pseudo').disabled = $('monde').disabled = true;
    try {
      history.replaceState(null, '', '?monde=' + world);
    } catch (e) {}
    try {
      await boot(world);
    } catch (e) {
      console.error(e);
      $('netStatus').textContent = 'Connection failed: ' + (e.message || e) + '. Check src/config.js and the schema.';
      $('play').disabled = false;
      $('play').textContent = 'Retry';
      $('pseudo').disabled = $('monde').disabled = false;
      return;
    }
    booted = true;
    loadSoloSigns(); // solo: the signs' text kept in the save (19-signs.js)
    cloudSave(true);
    $('play').disabled = false;
    $('shareRow').hidden = !Net.online;
    $('shareUrl').textContent = location.href;
  }
  $('title').hidden = true;
  playing = true;
  tryLock();
  if (!S.seen.intro) {
    S.seen.intro = 1;
    // a stronger first moment than a feed toast: Thea, the Atrium's own guardian, greets a brand-new
    // arrival before they have to go find and click anyone — a short delay so the world has rendered
    // first, instead of popping up over a still-loading view
    // first a short cinematic of the world (playIntro, 07-interface.js), skippable, once ever
    setTimeout(
      () =>
        playIntro(() => {
          greetPlayer();
          setTimeout(() => logEv('mint', 'Mine a block', 'it becomes a token in your chest'), 10000);
        }),
      600,
    );
  }
};
$('copyUrl').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('copyUrl').textContent = 'Link copied';
  } catch (e) {
    const r = document.createRange();
    r.selectNodeContents($('shareUrl'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
};
let arm = false;
if (Net.enabled) $('reset').textContent = 'Start my progress over in this world';
$('reset').onclick = async () => {
  if (!arm) {
    arm = true;
    $('reset').textContent = 'Your whole chest and objectives in this world will be erased. Click to confirm';
    return;
  }
  const w = booted
    ? Net.world
    : ($('monde').value.trim() || 'principal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 32) || 'principal';
  try {
    localStorage.removeItem('ether-mines:' + w);
  } catch (e) {}
  if (Net.enabled) {
    try {
      await accountReady;
      if (Net.userId) await Net.deletePlayer(w);
    } catch (e) {
      console.error(e);
    }
  }
  booted = false;
  location.reload();
};
async function boot(world) {
  if (Net.enabled) {
    if (!Net.userId) await accountReady;
    if (Net.userId) {
      ME.id = Net.userId;
      // the server's save is authoritative; otherwise we push this browser's save to it
      try {
        const row = await Net.loadPlayer(world);
        if (row && row.state && Object.keys(row.state).length) useState(row.state);
        else cloudDirty = true;
        if (row) S.gwei = row.gwei || 0; // server-authoritative, never part of state jsonb
      } catch (e) {
        console.warn(e);
        cloudOff = true;
        setTimeout(() => logEv('burn', 'Online save unavailable', 'progress kept in this browser (SQL schema needs to be run)'), 1500);
      }
    } else setTimeout(() => logEv('burn', 'Account unavailable', 'progress kept in this browser'), 1500);
    // your hearts and plating, for the game server (it keeps the hearts from then on)
    Net.setHello(() => ({ hp: S.hp, ar: S.armor ? +S.armor : 0, bt: bootsOn() ? 1 : 0, nm: mobsHere() ? 0 : 1 }));
    await Net.join(world, ME);
    if (Net.userId) {
      await syncInventory();
      try {
        for (const c of await Net.loadClaims()) CLAIMS.set(ckey(c.cx, c.cz), c);
      } catch (e) {
        console.warn(e);
      }
      serverAct('rewards', {}).then(r => {
        if (r && r.gwei !== undefined) S.gwei = r.gwei;
      });
    }
  }
  if (S.pos) {
    [P.x, P.y, P.z, yaw, pitch] = S.pos;
  } else {
    P.x = SPAWN.x + 0.5 + (Math.random() - 0.5) * 2;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  if (!inWorld(P.x, P.z)) {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  const list = wanted(),
    total = list.length;
  for (let i = 0; i < total; i += 12) {
    await loadChunks(list.slice(i, i + 12));
    $('progBar').style.width = (Math.min(total, i + 12) / total) * 60 + '%';
  }
  const q = [...meshQ];
  meshQ.clear();
  let m = 0;
  // closest to the player first; in the background, several chunks at once
  q.sort((a, b) => {
    const [ax, az] = a.split(',').map(Number),
      [bx, bz] = b.split(',').map(Number),
      pcx = cOf(P.x),
      pcz = cOf(P.z);
    return Math.hypot(ax - pcx, az - pcz) - Math.hypot(bx - pcx, bz - pcz);
  });
  for (let i = 0; i < q.length; i += 4) {
    await Promise.all(
      q.slice(i, i + 4).map(k => {
        const [cx, cz] = k.split(',').map(Number);
        return CHK.has(k) ? buildChunk(cx, cz) : null;
      }),
    );
    m = Math.min(q.length, i + 4);
    $('progBar').style.width = 60 + (m / q.length) * 40 + '%';
    await new Promise(r => setTimeout(r, 0));
  }
  updatePosHud();
  // inside the rock (a gallery filled again by a restore, a block placed where you stood): up to the surface
  if (collides(P.x, P.y, P.z)) {
    let y = Math.floor(P.y) + 1;
    while (y < SY && collides(P.x, y + 0.01, P.z)) y++;
    P.y = y + 0.01;
  }
  if (collides(P.x, P.y, P.z)) {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  ui();
}
requestAnimationFrame(frame);
// Test tools: opening index.html#debug exposes window.mines in the console.
if (location.hash === '#debug')
  window.mines = {
    get meshWorker() {
      return !!meshWorker;
    },
    get meshCount() {
      return MESH.size;
    },
    place,
    get target() {
      return target;
    },
    breakBlock,
    craft,
    claimCmd,
    serverAct,
    syncInventory,
    get CLAIMS() {
      return CLAIMS;
    },
    get ME() {
      return ME;
    },
    get,
    CHK,
    frozen,
    EDC,
    commit,
    encodeChunk,
    decodeChunk,
    genChunk,
    loadChunks,
    rebuildAt,
    forcePower() {
      powT = 0;
      computePower(0);
    },
    POWERED,
    openChest,
    moveChest,
    keys,
    get playing() {
      return playing;
    },
    set playing(v) {
      playing = v;
    },
    get P() {
      return P;
    },
    GEN,
    QUESTS,
    CHAPTERS,
    questIndex,
    ruinAt,
    nearestRuin,
    give,
    giveAll,
    canMine,
    relight,
    openTab,
    POWERED,
    SPEC,
    ANIMALS,
    petAnimal,
    spawnChunk,
    despawnChunk,
    // getters: src/game/16-mobs.js loads after this file, so these bindings don't exist yet at startup
    get MOBS() {
      return MOBS;
    },
    get MK() {
      return MK;
    },
    get mkMob() {
      return mkMob;
    },
    get pickMob() {
      return pickMob;
    },
    get attackMob() {
      return attackMob;
    },
    get hurtPlayer() {
      return hurtPlayer;
    },
    get spawnMobChunk() {
      return spawnMobChunk;
    },
    get despawnMobChunk() {
      return despawnMobChunk;
    },
    popAt,
    B,
    get S() {
      return S;
    },
    heightAt,
    islandTop,
    set yaw(v) {
      yaw = v;
    },
    set pitch(v) {
      pitch = v;
    },
  };
