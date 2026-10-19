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
    if (id && COSMETICS[id] && COSMETICS[id].slot === s && ownsCosmetic(id)) out[s] = +id;
  }
  return out;
}
// what you can wear: what you bought or earned
const ownsCosmetic = id => S.cosmetics.includes(+id);
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
    case 'sheriff':
    case 'gambler': {
      const [brim, crown, band, w] = {
        prospector: [0x6b4423, 0x7a4f2a, 0x3b2a1a, 0.8],
        sheriff: [0x8a6a40, 0x9c7a4a, 0x4a3420, 0.8],
        gambler: [0x1a1a22, 0x22222c, 0xc0392b, 0.84],
      }[c.style];
      bx(g, w, 0.05, w, brim, 0, 0.27, 0);
      bx(g, 0.5, 0.22, 0.5, crown, 0, 0.39, 0);
      bx(g, 0.51, 0.05, 0.51, band, 0, 0.31, 0);
      if (c.style === 'sheriff')
        for (let i = 0; i < 2; i++) bx(g, 0.1, 0.1, 0.02, 0xffd166, 0, 0.4, -0.26, 0.5).rotation.z = (i * Math.PI) / 4; // the star
      if (c.style === 'gambler') bx(g, 0.04, 0.26, 0.04, 0xf4f1ff, 0.22, 0.44, 0.05).rotation.z = -0.4; // the feather
      break;
    }
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
    case 'crystalminer': {
      bx(g, 0.56, 0.18, 0.58, 0x8a6cff, 0, 0.32, 0);
      bx(g, 0.1, 0.06, 0.58, 0x6a50d8, 0, 0.43, 0);
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), lookMat(0x9fe8ff, 1.2));
      lamp.position.set(0, 0.32, -0.32);
      lamp.scale.y = 1.3;
      g.add(lamp);
      break;
    }
    case 'beanie':
      bx(g, 0.54, 0.2, 0.54, 0xff6b6b, 0, 0.32, 0);
      bx(g, 0.56, 0.08, 0.56, 0xd94f4f, 0, 0.24, 0);
      bx(g, 0.12, 0.12, 0.12, 0xffffff, 0, 0.47, 0);
      break;
    case 'etherbeanie': {
      bx(g, 0.54, 0.2, 0.54, 0x4a6fa5, 0, 0.32, 0);
      bx(g, 0.56, 0.08, 0.56, 0x2c3e66, 0, 0.24, 0);
      const patch = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), lookMat(0xc9b8ff, 0.5));
      patch.position.set(0, 0.32, -0.28);
      patch.scale.y = 1.4;
      g.add(patch);
      break;
    }
    case 'pombeanie':
      for (let i = 0; i < 3; i++) bx(g, 0.54 - i * 0.04, 0.08, 0.54 - i * 0.04, i % 2 ? 0xffffff : 0x7fe8a0, 0, 0.26 + i * 0.08, 0);
      bx(g, 0.2, 0.22, 0.2, 0x7fe8a0, 0.08, 0.5, 0.12).rotation.z = -0.5; // the floppy tip
      bx(g, 0.12, 0.12, 0.12, 0xffffff, 0.2, 0.58, 0.18);
      break;
    case 'visor':
    case 'goldvisor': {
      // at eye level, held by two side pieces
      const gold = c.style === 'goldvisor';
      bx(g, 0.56, 0.11, 0.06, gold ? 0xffb347 : 0x00eaff, 0, -0.04, -0.27, 0.9);
      for (const x of [-0.28, 0.28]) {
        bx(g, 0.06, 0.16, 0.16, gold ? 0x6b4a1a : 0x1b2a4a, x, -0.04, -0.17);
        if (gold) bx(g, 0.07, 0.1, 0.1, 0xffd166, x, -0.04, 0, 0.4);
      }
      break;
    }
    case 'panda':
    case 'redpanda':
    case 'polar': {
      const [fur, ear, inner] = {
        panda: [0xf4f1ff, 0x1a1a22],
        redpanda: [0xd9622b, 0x7a2f1a, 0xf4f1ff],
        polar: [0xf4f8ff, 0xf4f8ff, 0x9aa4b0],
      }[c.style];
      bx(g, 0.56, 0.08, 0.56, fur, 0, 0.29, 0);
      bx(g, 0.56, 0.5, 0.06, fur, 0, 0.04, 0.28);
      bx(g, 0.06, 0.5, 0.5, fur, -0.28, 0.04, 0.04);
      bx(g, 0.06, 0.5, 0.5, fur, 0.28, 0.04, 0.04);
      for (const x of [-0.2, 0.2]) {
        bx(g, 0.15, 0.15, 0.08, ear, x, 0.39, 0);
        if (inner) bx(g, 0.07, 0.07, 0.09, inner, x, 0.39, 0);
      }
      break;
    }
    case 'halo':
    case 'prismhalo': {
      const cols = c.style === 'prismhalo' ? [0xff6b6b, 0xffd166, 0x7fe8a0, 0x7fd0ff, 0xb48cff] : [0x3fd2c7],
        ring = new THREE.Group();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        bx(ring, 0.09, 0.05, 0.09, cols[i % cols.length], Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.9);
      }
      ring.position.y = 0.46;
      g.add(ring);
      anim.push(t => {
        ring.rotation.y = t * 1.2;
        ring.position.y = 0.46 + Math.sin(t * 2) * 0.03;
      });
      break;
    }
    case 'crown':
    case 'silvercrown': {
      const silver = c.style === 'silvercrown',
        metal = silver ? 0xd9e2ee : 0xffd166;
      bx(g, 0.54, 0.1, 0.54, metal, 0, 0.3, 0, 0.25);
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
        bx(g, 0.08, 0.14, 0.08, metal, x, 0.41, z, 0.25);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), lookMat(silver ? 0x00eaff : 0x8a7bef, 0.8));
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
    case 'cape2':
    case 'royalcape':
    case 'circuitcape': {
      const [l, r, trim] = {
          cape2: [0xff8a3d, 0x8a7bef, 0xffd166],
          royalcape: [0x3a2266, 0x3a2266, 0xffd166],
          circuitcape: [0x101418, 0x101418, 0x00eaff],
        }[c.style],
        cape = new THREE.Group();
      cape.position.set(0, 1.3, 0.17);
      bx(cape, 0.23, 0.72, 0.04, l, -0.115, -0.36, 0);
      bx(cape, 0.23, 0.72, 0.04, r, 0.115, -0.36, 0);
      bx(cape, 0.46, 0.06, 0.05, trim, 0, -0.7, 0, 0.6);
      if (c.style === 'royalcape') {
        const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), lookMat(0xffd166, 0.5));
        d.position.set(0, -0.3, 0.03);
        d.scale.y = 1.4;
        cape.add(d);
      }
      if (c.style === 'circuitcape')
        for (const [x, y, w, h] of [
          [-0.1, -0.2, 0.02, 0.3],
          [-0.05, -0.35, 0.12, 0.02],
          [0.08, -0.45, 0.02, 0.22],
          [0.12, -0.15, 0.1, 0.02],
        ])
          bx(cape, w, h, 0.02, 0x00eaff, x, y, 0.025, 1);
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
        w.position.set(side * 0.1, 0.98, 0.22); // low between the shoulder blades, clear of the head
        [
          [0.78, 0.16, 0.36, 1],
          [0.66, 0.02, 0.18, 0.85],
          [0.52, -0.12, 0.02, 0.7],
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
    case 'goldvalidator':
    case 'legendvalidator': {
      const [shell, light] = {
        validator: [0x2a1838, 0x00eaff],
        goldvalidator: [0xb08a2e, 0xffd166],
        legendvalidator: [0xf4f1ff, 0xb48cff],
      }[c.style];
      bx(body, 0.3, 0.3, 0.3, shell, 0, 0, 0);
      bx(body, 0.2, 0.07, 0.02, light, 0, 0.04, -0.16, 1);
      bx(body, 0.03, 0.12, 0.03, 0xd9d9e3, 0, 0.21, 0);
      bx(body, 0.06, 0.06, 0.06, light, 0, 0.29, 0, 1);
      break;
    }
    case 'panda':
    case 'redpanda':
    case 'bamboopanda': {
      const [fur, dark] = c.style === 'redpanda' ? [0xd9622b, 0x3a1c14] : [0xf4f1ff, 0x1a1a22];
      bx(body, 0.3, 0.22, 0.24, fur, 0, 0, 0.04);
      bx(body, 0.22, 0.2, 0.2, fur, 0, 0.12, -0.14);
      bx(body, 0.07, 0.07, 0.04, dark, -0.1, 0.25, -0.12);
      bx(body, 0.07, 0.07, 0.04, dark, 0.1, 0.25, -0.12);
      bx(body, 0.06, 0.05, 0.02, dark, -0.05, 0.14, -0.25);
      bx(body, 0.06, 0.05, 0.02, dark, 0.05, 0.14, -0.25);
      for (const [x, z] of [
        [-0.1, -0.06],
        [0.1, -0.06],
        [-0.1, 0.12],
        [0.1, 0.12],
      ])
        bx(body, 0.08, 0.1, 0.08, dark, x, -0.14, z);
      if (c.style === 'redpanda') bx(body, 0.06, 0.06, 0.28, fur, 0, 0.02, 0.26); // the tail
      if (c.style === 'bamboopanda') {
        bx(body, 0.03, 0.4, 0.03, 0x7fbf5a, 0.16, 0.08, -0.16);
        bx(body, 0.1, 0.03, 0.05, 0x9fdf7a, 0.2, 0.2, -0.16);
      }
      break;
    }
    case 'blob':
    case 'pinkblob':
    case 'galaxyblob': {
      const [col, eye] = { blob: [0x3fd2c7, 0x0b2b30], pinkblob: [0xff9ec7, 0x5a1a3a], galaxyblob: [0x3a2a6a, 0xffffff] }[c.style];
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.7 }),
      );
      body.add(m);
      bx(body, 0.05, 0.05, 0.02, eye, -0.06, 0.04, -0.16);
      bx(body, 0.05, 0.05, 0.02, eye, 0.06, 0.04, -0.16);
      if (c.style === 'galaxyblob')
        for (const [x, y, z] of [
          [-0.08, -0.06, -0.153],
          [0.09, 0.1, -0.153],
          [0.155, -0.05, 0.02],
        ])
          bx(body, 0.03, 0.03, 0.01, 0xffffff, x, y, z, 1.2);
      anim.push(t => body.scale.set(1 + Math.sin(t * 4) * 0.08, 1 - Math.sin(t * 4) * 0.1, 1 + Math.sin(t * 4) * 0.08));
      break;
    }
    case 'diamond':
    case 'golddiamond':
    case 'twindiamond': {
      const gems =
        c.style === 'twindiamond'
          ? [
              [0x8a7bef, -0.14, 0.12],
              [0x3fd2c7, 0.14, 0.12],
            ]
          : [[c.style === 'golddiamond' ? 0xffd166 : 0x8a7bef, 0, 0.18]];
      for (const [col, x, r] of gems) {
        const d = new THREE.Mesh(new THREE.OctahedronGeometry(r), lookMat(col, 0.7));
        d.position.x = x;
        d.scale.y = 1.4;
        body.add(d);
      }
      anim.push(t => (body.rotation.y = t * 1.5));
      break;
    }
  }
  anim.push(t => (body.position.y = Math.sin(t * 2) * 0.08));
  return g;
}

// ---------- outfit variants: the details sewn on a plain outfit (rules.js COSMETICS `detail`) ----------
// Built from boxes on the body, the arms and the legs, like everything else; all of them are look parts,
// taken off with the outfit. The body's front is -z.
function buildOutfit(av, key) {
  const parts = [],
    box = (p, w, h, d, c, x, y, z, em) => {
      const m = bx(p, w, h, d, c, x, y, z, em);
      parts.push(m);
      return m;
    };
  const W = CLAY ? 0.47 : 0.5,
    H = CLAY ? 0.54 : 0.66,
    D = 0.28,
    AL = CLAY ? 0.62 * 0.8 : 0.62, // an arm's length, from the shoulder down
    LL = CLAY ? 0.62 * 0.76 : 0.62, // a leg's
    FZ = -D / 2 - 0.012, // just in front of the body
    BZ = D / 2 + 0.012; // just behind it
  // a band all around the body, an arm or a leg; a whole sleeve or trouser leg in another color
  const ring = (p, w, d, h, c, y, em) => box(p, w + 0.02, h, d + 0.02, c, 0, y, 0, em);
  const armRing = (a, h, c, y, em) => box(a, 0.2, h, 0.24, c, 0, y, 0, em);
  const legRing = (l, h, c, y, em) => box(l, 0.26, h, 0.28, c, 0, y, 0, em);
  const sleeve = (a, c) => box(a, 0.19, AL + 0.005, 0.23, c, 0, -AL / 2, 0);
  const trouser = (l, c) => box(l, 0.25, LL + 0.005, 0.27, c, 0, -LL / 2, 0);
  const front = (b, w, h, c, x, y, em) => box(b, w, h, 0.02, c, x, y, FZ, em);
  const back = (b, w, h, c, x, y, em) => box(b, w, h, 0.02, c, x, y, BZ, em);
  // an Ethereum diamond from stacked slabs, flat on the front
  const diamond = (p, s, c, x, y, z, em) => {
    for (let i = 0; i < 5; i++) box(p, s * (1 - Math.abs(i - 2) / 2.6), s / 5, 0.02, c, x, y + (i - 2) * (s / 5), z, em);
  };
  const top = H / 2,
    bot = -H / 2;
  const OUTFIT_DETAIL = {};

  // ---------- Ember Outfit ----------
  // A: the Forge Apron — a leather apron, ember-glowing hem, rolled sleeves over bare forearms
  OUTFIT_DETAIL['1A'] = av => {
    const b = av.body;
    front(b, W * 0.8, H * 0.95, 0x5a2e22, 0, -H * 0.02);
    box(b, W * 0.8, 0.03, 0.03, 0xff8a3d, 0, bot + 0.03, FZ - 0.01, 0.9);
    front(b, 0.14, 0.08, 0x3a1c14, 0, -H * 0.12); // the pocket
    box(b, W + 0.03, 0.04, D + 0.03, 0x3a1c14, 0, top - H * 0.42, 0); // the apron's tie
    av.arms.forEach(a => {
      armRing(a, 0.07, 0xc84a4a, -AL * 0.45);
      box(a, 0.185, AL * 0.4, 0.225, 0xf6d3b8, 0, -AL * 0.78, 0); // bare forearms
    });
    av.legs.forEach(l => legRing(l, 0.06, 0x3a1c14, -LL + 0.05));
  };
  // B: the Ember Coat — red above, dark below, glowing cracks rising from the hem like coals
  OUTFIT_DETAIL['1B'] = av => {
    const b = av.body;
    ring(b, W, D, H * 0.45, 0x3a1416, bot + H * 0.22);
    for (const [x, h] of [
      [-0.17, 0.2],
      [-0.06, 0.12],
      [0.05, 0.24],
      [0.16, 0.14],
    ])
      box(b, 0.025, h, 0.025, 0xff7a2e, x, bot + h / 2, FZ - 0.01, 1);
    box(b, W + 0.03, 0.03, D + 0.03, 0xffb347, 0, bot + H * 0.45, 0, 0.8);
    av.arms.forEach(a => {
      armRing(a, AL * 0.3, 0x3a1416, -AL * 0.85);
      armRing(a, 0.025, 0xffb347, -AL * 0.7, 0.8);
    });
  };

  // ---------- Void Outfit ----------
  // A: Starfield — tiny stars scattered over the dark cloth
  OUTFIT_DETAIL['2A'] = av => {
    const star = (p, x, y, z, big) => box(p, big ? 0.035 : 0.022, big ? 0.035 : 0.022, 0.012, big ? 0xffffff : 0xc9b8ff, x, y, z, 1.2);
    const pts = [
      [-0.18, 0.2],
      [-0.05, 0.12],
      [0.12, 0.22],
      [0.19, -0.02],
      [-0.12, -0.08],
      [0.03, -0.2],
      [-0.2, -0.22],
      [0.15, -0.15],
      [0.02, 0.02],
    ];
    pts.forEach(([x, y], i) => star(av.body, x * W * 2, y * H * 1.6, FZ - 0.006, i % 3 === 0));
    pts.slice(0, 5).forEach(([x, y]) => star(av.body, -x * W * 2, y * H * 1.6, BZ + 0.006));
    av.arms.forEach((a, k) => [-0.15, -0.4, -0.7].forEach((y, i) => star(a, (i + k) % 2 ? 0.04 : -0.04, y * AL, -0.118, i === 1)));
    av.legs.forEach((l, k) => [-0.2, -0.55].forEach((y, i) => star(l, (i + k) % 2 ? 0.05 : -0.05, y * LL, -0.138, i === 0)));
  };
  // B: the Void Mantle — a high collar, a violet V trim, a glowing rune on the belt
  OUTFIT_DETAIL['2B'] = av => {
    const b = av.body;
    box(b, W + 0.06, 0.1, D + 0.06, 0x120a1c, 0, top - 0.02, 0); // the collar
    for (let i = 0; i < 5; i++) {
      const y = top - 0.06 - i * 0.045;
      box(b, 0.03, 0.05, 0.02, 0xb48cff, -0.035 - i * 0.022, y, FZ - 0.005, 0.9);
      box(b, 0.03, 0.05, 0.02, 0xb48cff, 0.035 + i * 0.022, y, FZ - 0.005, 0.9);
    }
    ring(b, W, D, 0.06, 0x120a1c, bot + H * 0.28);
    diamond(b, 0.08, 0xb48cff, 0, bot + H * 0.28, FZ - 0.02, 1.2);
    back(b, W * 0.9, H * 1.15, 0x120a1c, 0, -0.05); // a short mantle at the back
    av.arms.forEach(a => armRing(a, 0.03, 0xb48cff, -AL * 0.88, 0.9));
  };

  // ---------- Aurum Outfit ----------
  // A: the Royal — deep gold borders at the collar, the hem and the cuffs, the Ether diamond on the chest
  OUTFIT_DETAIL['3A'] = av => {
    const b = av.body;
    ring(b, W, D, 0.05, 0xc89a2e, top - 0.025);
    ring(b, W, D, 0.06, 0xc89a2e, bot + 0.03);
    box(b, 0.05, H * 0.85, 0.02, 0xc89a2e, 0, 0, FZ);
    diamond(b, 0.16, 0x8a5cff, -0.12, H * 0.12, FZ - 0.012, 0.4);
    av.arms.forEach(a => armRing(a, 0.06, 0xc89a2e, -AL + 0.04));
    av.legs.forEach(l => box(l, 0.03, LL * 0.9, 0.27, 0xffe9a8, 0.12, -LL / 2, 0)); // a gold stripe down each leg
  };
  // B: Gilded Plate — gold shoulders, a belt with a violet gem
  OUTFIT_DETAIL['3B'] = av => {
    const b = av.body;
    ring(b, W, D, 0.07, 0x9c7424, bot + H * 0.3);
    box(b, 0.08, 0.08, 0.03, 0x8a5cff, 0, bot + H * 0.3, FZ - 0.015, 0.6);
    av.arms.forEach(a => {
      const s = a.position.x < 0 ? -1 : 1;
      box(a, 0.26, 0.1, 0.28, 0xd4a83a, s * 0.03, 0.0, 0);
      box(a, 0.24, 0.06, 0.26, 0xb08a2e, s * 0.04, -0.07, 0);
    });
    front(b, W * 0.55, H * 0.3, 0xfff5d6, 0, top - H * 0.2);
  };

  // ---------- Frontier Duster ----------
  // A: the long coat — tails hanging down over the legs, a wide belt, a turned-up collar
  OUTFIT_DETAIL['21A'] = av => {
    const b = av.body;
    box(b, W + 0.04, 0.08, D + 0.06, 0x5c3a1c, 0, top, 0); // the collar
    ring(b, W, D, 0.06, 0x2a1a0e, bot + H * 0.3);
    box(b, 0.07, 0.06, 0.03, 0xd4a83a, 0, bot + H * 0.3, FZ - 0.015);
    // the tails, front and back, parted in the middle
    for (const x of [-0.13, 0.13]) {
      box(b, 0.22, LL * 0.7, 0.02, 0x8b5a2b, x, bot - LL * 0.35, FZ);
      box(b, 0.24, LL * 0.75, 0.02, 0x8b5a2b, x, bot - LL * 0.37, BZ);
    }
    av.arms.forEach(a => armRing(a, 0.08, 0x5c3a1c, -AL + 0.06));
  };
  // B: the Poncho — a striped blanket over the shoulders, fringe at the bottom
  OUTFIT_DETAIL['21B'] = av => {
    const b = av.body;
    const stripes = [0xc8562e, 0xe8c27a, 0x2e6b8a, 0xe8c27a, 0xc8562e];
    stripes.forEach((c, i) => box(b, W + 0.12, 0.07, D + 0.08, c, 0, top - 0.04 - i * 0.07, 0));
    for (let i = -4; i <= 4; i++) box(b, 0.02, 0.05, 0.02, 0xe8c27a, i * 0.06, top - 0.4, FZ - 0.03);
    av.arms.forEach(a => box(a, 0.24, 0.16, 0.27, 0xc8562e, 0, -0.06, 0));
  };

  // ---------- Homestead Overalls ----------
  // A: plaid shirt under denim — the bib and straps, brass buttons, checkered sleeves
  OUTFIT_DETAIL['24A'] = av => {
    const b = av.body,
      plaid = (p, w, h, x0, y0, z) => {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++)
            if ((i + j) % 2) box(p, w / 4, h / 4, 0.012, 0xb83a3a, x0 - w / 2 + (i + 0.5) * (w / 4), y0 - h / 2 + (j + 0.5) * (h / 4), z);
      };
    front(b, W, H * 0.5, 0xe8dcc0, 0, top - H * 0.25); // the shirt's top
    plaid(b, W, H * 0.5, 0, top - H * 0.25, FZ - 0.008);
    front(b, W * 0.56, H * 0.42, 0x4a6fa5, 0, -H * 0.02); // the bib
    for (const x of [-0.17, 0.17]) {
      box(b, 0.05, H * 0.5, 0.02, 0x2c3e66, x, top - H * 0.25, FZ - 0.012); // the straps
      box(b, 0.035, 0.035, 0.02, 0xd4a83a, x, top - H * 0.42, FZ - 0.025);
    }
    av.arms.forEach(a => {
      box(a, 0.19, AL, 0.23, 0xe8dcc0, 0, -AL / 2, 0);
      for (let j = 0; j < 4; j++) box(a, 0.192, AL / 8, 0.232, 0xb83a3a, 0, -AL * (j / 4 + 0.06), 0);
    });
  };
  // B: white tee and denim, a patch pocket and a wrench
  OUTFIT_DETAIL['24B'] = av => {
    const b = av.body;
    front(b, W, H * 0.4, 0xf4f1e8, 0, top - H * 0.2);
    front(b, W * 0.6, H * 0.45, 0x4a6fa5, 0, -H * 0.05);
    front(b, 0.14, 0.1, 0x3a5a8a, 0.05, -H * 0.02);
    box(b, 0.03, 0.14, 0.03, 0x9aa4b0, -0.09, -H * 0.02, FZ - 0.02); // the wrench in the pocket
    box(b, 0.06, 0.035, 0.03, 0x9aa4b0, -0.09, -H * 0.02 + 0.08, FZ - 0.02);
    for (const x of [-0.18, 0.18]) box(b, 0.05, H * 0.45, 0.02, 0x2c3e66, x, top - H * 0.22, FZ - 0.008);
    av.arms.forEach(a => {
      box(a, 0.19, AL * 0.35, 0.23, 0xf4f1e8, 0, -AL * 0.17, 0);
      box(a, 0.185, AL * 0.65, 0.225, 0xf6d3b8, 0, -AL * 0.67, 0);
    });
  };

  // ---------- Staker Jacket ----------
  // A: the validator's suit — lapels, a white shirt, a cyan tie, a 32 ETH pin
  OUTFIT_DETAIL['27A'] = av => {
    const b = av.body;
    for (let i = 0; i < 6; i++) front(b, 0.2 - i * 0.03, 0.05, 0xf4f1ff, 0, top - 0.025 - i * 0.05);
    box(b, 0.045, H * 0.5, 0.02, 0x00c8e0, 0, top - H * 0.28, FZ - 0.008, 0.4);
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) box(b, 0.04, 0.06, 0.02, 0x2c3f6a, s * (0.08 + i * 0.03), top - 0.04 - i * 0.06, FZ - 0.012);
    diamond(b, 0.07, 0xd4a83a, -0.15, H * 0.12, FZ - 0.016, 0.5);
    av.arms.forEach(a => armRing(a, 0.04, 0xf4f1ff, -AL + 0.03));
  };
  // B: the bomber — glowing stripes down the sleeves, a ribbed hem and collar, a beacon on the back
  OUTFIT_DETAIL['27B'] = av => {
    const b = av.body;
    ring(b, W, D, 0.07, 0x0e1626, top - 0.03);
    ring(b, W, D, 0.08, 0x0e1626, bot + 0.04);
    box(b, 0.025, H * 0.85, 0.02, 0x9aa4b0, 0, 0, FZ); // the zip
    diamond(b, 0.22, 0x00eaff, 0, 0.02, BZ + 0.012, 1);
    av.arms.forEach(a => {
      const s = a.position.x < 0 ? -1 : 1;
      box(a, 0.03, AL * 0.9, 0.235, 0x00eaff, s * 0.09, -AL * 0.47, 0, 0.9);
      armRing(a, 0.06, 0x0e1626, -AL + 0.04);
    });
  };

  // ---------- Merge Suit ----------
  // A: the Merge — work on one side, stake on the other: half black, half white, a cyan seam
  OUTFIT_DETAIL['31A'] = av => {
    const b = av.body;
    box(b, W / 2 + 0.01, H + 0.01, D + 0.02, 0x1a1a22, -W / 4, 0, 0);
    box(b, 0.03, H + 0.02, D + 0.03, 0x00eaff, 0, 0, 0, 0.9);
    sleeve(av.arms[0], 0x1a1a22);
    trouser(av.legs[1], 0xf4f1ff);
    diamond(b, 0.12, 0x00eaff, 0.11, H * 0.12, FZ - 0.006, 1);
  };
  // B: the Panda — black arms and shoulders, a white chest, a round black patch
  OUTFIT_DETAIL['31B'] = av => {
    const b = av.body;
    av.arms.forEach(a => sleeve(a, 0x1a1a22));
    box(b, W + 0.02, 0.12, D + 0.02, 0x1a1a22, 0, top - 0.06, 0);
    front(b, 0.14, 0.14, 0x1a1a22, 0, -H * 0.05);
    front(b, 0.08, 0.08, 0xf4f1ff, 0, -H * 0.05);
  };

  // ---------- Blobspace Suit ----------
  // A: bubbles — light round blobs floating up the suit
  OUTFIT_DETAIL['35A'] = av => {
    const bub = (p, s, x, y, z) => {
      box(p, s, s * 0.6, 0.012, 0xa8fff6, x, y, z, 0.3);
      box(p, s * 0.6, s, 0.012, 0xa8fff6, x, y, z, 0.3);
    };
    [
      [-0.14, -0.18, 0.08],
      [0.1, -0.06, 0.06],
      [-0.04, 0.1, 0.05],
      [0.15, 0.18, 0.04],
      [-0.17, 0.2, 0.035],
    ].forEach(([x, y, s]) => bub(av.body, s, x * W * 2, y * H * 1.6, FZ - 0.004));
    av.arms.forEach(a => bub(a, 0.05, 0, -AL * 0.5, -0.118));
    av.legs.forEach((l, k) => bub(l, 0.06, k ? 0.04 : -0.04, -LL * 0.4, -0.138));
  };
  // B: the dive suit — glowing seams, a collar ring, a blob tank on the back
  OUTFIT_DETAIL['35B'] = av => {
    const b = av.body;
    ring(b, W, D, 0.05, 0x1d5c63, top - 0.02);
    box(b, 0.025, H, 0.02, 0x7ffff0, -0.1, 0, FZ, 0.9);
    box(b, 0.025, H, 0.02, 0x7ffff0, 0.1, 0, FZ, 0.9);
    box(b, 0.16, H * 0.8, 0.12, 0x1d5c63, 0, 0, BZ + 0.06); // the tank
    box(b, 0.12, 0.05, 0.13, 0x7ffff0, 0, H * 0.25, BZ + 0.06, 0.9);
    av.arms.forEach(a => box(a, 0.025, AL * 0.9, 0.235, 0x7ffff0, 0, -AL * 0.47, 0, 0.9));
    av.legs.forEach(l => box(l, 0.025, LL * 0.9, 0.275, 0x7ffff0, 0, -LL * 0.47, 0, 0.9));
  };

  // ---------- Lavender Outfit ----------
  // A: the hoodie — the hood down on the back, a front pocket, drawstrings
  OUTFIT_DETAIL['45A'] = av => {
    const b = av.body;
    box(b, W * 0.8, 0.14, 0.12, 0x9a86ee, 0, top - 0.02, BZ + 0.03); // the hood, down
    front(b, W * 0.62, H * 0.28, 0x9a86ee, 0, bot + H * 0.22);
    for (const x of [-0.05, 0.05]) box(b, 0.015, 0.14, 0.015, 0xffffff, x, top - 0.1, FZ - 0.01);
    ring(b, W, D, 0.05, 0x8a76de, bot + 0.025);
    av.arms.forEach(a => armRing(a, 0.06, 0x8a76de, -AL + 0.04));
  };
  // B: the knit — a diamond pattern across the chest, a ribbed collar
  OUTFIT_DETAIL['45B'] = av => {
    const b = av.body;
    ring(b, W, D, 0.05, 0x8a76de, top - 0.025);
    for (const x of [-0.15, 0, 0.15]) diamond(b, 0.12, 0xffffff, x, H * 0.05, FZ - 0.004, 0.1);
    box(b, W, 0.025, 0.02, 0x6a58c0, 0, H * 0.18, FZ - 0.004);
    box(b, W, 0.025, 0.02, 0x6a58c0, 0, -H * 0.08, FZ - 0.004);
    av.arms.forEach(a => [0.3, 0.6].forEach(f => armRing(a, 0.025, 0xffffff, -AL * f)));
  };
  if (OUTFIT_DETAIL[key]) OUTFIT_DETAIL[key](av);
  return parts;
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
  if (o && o.detail && o.color === av.color) av.lookParts.push(...buildOutfit(av, o.detail));
  if (look.head) {
    const h = buildHead(COSMETICS[look.head], av.anim);
    av.head.add(h);
    av.lookParts.push(h);
  }
  if (look.back) {
    const b = buildBack(COSMETICS[look.back], av.anim);
    // on the body's own parent: with the clay look's shorter body, back pieces come down with it
    (av.body.parent || av.g).add(b);
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
