// Gear: a helmet, gauntlets and an amulet, beside the plating and the boots (rules.js ITEM 308-316, in the
// platings' three tiers), worn from the Character tab (S.helm, S.gloves, S.amulet: an item id, or null).
// A helmet takes a share off the damage the plating lets through; gauntlets hit harder with a blade and mine
// faster; an amulet brings the hearts back sooner. What you wear shows on your character, for everyone (hm,
// gl, am in your position, 14-startup.js), and the game server settles it on its side (health.js), checking
// that you own it. The Character tab: your character among its slots, and what it all adds up to.
const GEAR = [
  { k: 'helm', n: 'Helm', stat: 'helm', net: 'hm' },
  { k: 'gloves', n: 'Gauntlets', stat: 'power', net: 'gl' },
  { k: 'amulet', n: 'Amulet', stat: 'regen', net: 'am' },
];
// what you wear in a slot, if you still own it (0 otherwise)
function gearOf(k) {
  const g = GEAR.find(x => x.k === k),
    id = S[k] ? +S[k] : 0;
  return id && ITEM[id]?.[g.stat] && S.inv[id] > 0 ? id : 0;
}
const gearStat = k => ITEM[gearOf(k)]?.[GEAR.find(x => x.k === k).stat] || 0;
const gearHelm = () => gearStat('helm'),
  gearPower = () => gearStat('gloves'),
  gearRegen = () => gearStat('amulet');
// what the plating and the helmet let through of a blow (the game server's health.js does the same)
const armorLeft = () => (1 - (ITEM[S.armor]?.armor || 0)) * (1 - gearHelm());
// a piece you no longer own (traded away, put in a chest): off you
function dropGearNotOwned() {
  for (const g of GEAR) if (S[g.k] && !gearOf(g.k)) S[g.k] = null;
}
function wearGear(k, id) {
  S[k] = id ? String(id) : null;
  dirty = true;
  ui();
}

// ---------- on the character ----------
// the three tiers' colors, the platings' own (14-startup.js ARMOR_LOOKS: Volt, Pure Ether, Genesis)
const GEAR_LOOK = [
  { plate: 0xdbe9ff, dark: 0x2a6fd8, glow: 0x7fe8ff },
  { plate: 0xe8e2ff, dark: 0x6a50d8, glow: 0xc9a6ff },
  { plate: 0x3a2d3a, dark: 0x2a1f2a, glow: 0xffb347 },
];
function buildGearLook(av, k, id) {
  const L = GEAR_LOOK[(ITEM[id].tier || 1) - 1],
    plate = new THREE.MeshLambertMaterial({ color: L.plate }),
    dark = new THREE.MeshLambertMaterial({ color: L.dark }),
    glow = () => new THREE.MeshLambertMaterial({ color: L.glow, emissive: L.glow, emissiveIntensity: 0.8 }),
    parts = [],
    box = (p, w, h, d, m, x, y, z, rz = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      o.castShadow = true;
      p.add(o);
      return o;
    },
    group = parent => {
      const g = new THREE.Group();
      parent.add(g);
      parts.push(g);
      return g;
    };
  if (k === 'helm') {
    // in the head's frame (a 0.5 cube, the face toward -z): a shell over the top, the back and the sides,
    // a glowing brow band above the eyes, a crest; the face stays clear
    const g = group(av.head);
    box(g, 0.56, 0.14, 0.56, plate, 0, 0.21, 0.01);
    box(g, 0.56, 0.34, 0.07, plate, 0, 0.05, 0.27);
    for (const x of [-0.28, 0.28]) box(g, 0.07, 0.3, 0.5, plate, x, 0.06, 0.02);
    box(g, 0.58, 0.06, 0.07, dark, 0, 0.12, -0.262);
    box(g, 0.4, 0.025, 0.03, glow(), 0, 0.12, -0.3);
    box(g, 0.07, 0.12, 0.38, glow(), 0, 0.32, 0.04);
    if (ITEM[id].tier === 3) for (const x of [-0.2, 0.2]) box(g, 0.06, 0.16, 0.06, dark, x, 0.32, -0.08, x < 0 ? 0.35 : -0.35);
  } else if (k === 'gloves') {
    // at the end of each arm (its pivot at the shoulder): the hand, a plated back, a glowing cuff
    const len = CLAY ? 0.62 * 0.8 : 0.62;
    for (const a of av.arms) {
      const g = group(a);
      box(g, 0.23, 0.15, 0.27, plate, 0, -len + 0.06, 0);
      box(g, 0.25, 0.07, 0.29, glow(), 0, -len + 0.16, 0);
      box(g, 0.18, 0.06, 0.04, dark, 0, -len + 0.06, -0.145);
    }
  } else {
    // on the chest, over any plating: a chain in a V, the Ethereum diamond for a pendant
    const H = CLAY ? 0.54 : 0.66,
      g = group(av.body),
      chain = new THREE.MeshLambertMaterial({ color: 0xc9b8ff });
    for (const s of [-1, 1]) box(g, 0.025, 0.2, 0.02, chain, s * 0.065, H * 0.38, -0.235, s * 0.55);
    box(g, 0.1, 0.1, 0.04, dark, 0, H * 0.2, -0.245, Math.PI / 4);
    box(g, 0.065, 0.065, 0.05, glow(), 0, H * 0.2, -0.255, Math.PI / 4);
  }
  return { parts };
}
// shows what a character wears in slot k (yours from S, another player's from hm, gl, am)
function updateGearVisual(av, k, id) {
  if (!av) return;
  id = id && ITEM[id]?.[GEAR.find(x => x.k === k).stat] ? +id : 0;
  av.gearLooks ||= {};
  for (const [key, look] of Object.entries(av.gearLooks))
    if (key.startsWith(k + '.') && key !== k + '.' + id) for (const p of look.parts) p.visible = false;
  if (!id) return;
  const look = (av.gearLooks[k + '.' + id] ||= buildGearLook(av, k, id));
  for (const p of look.parts) p.visible = true;
}
function updateMyGear(av) {
  for (const g of GEAR) updateGearVisual(av, g.k, gearOf(g.k));
}

// ---------- the Character tab ----------
// your character in the middle, its slots on both sides (click one to choose what goes in it), and below
// what it all adds up to
let charSlot = null; // the slot whose choices are open
const CHAR_SLOTS = [
  { k: 'helm', side: 0, n: 'Helm', has: id => ITEM[id]?.helm },
  { k: 'amulet', side: 0, n: 'Amulet', has: id => ITEM[id]?.regen },
  { k: 'armor', side: 0, n: 'Plating', has: id => ITEM[id]?.armor },
  { k: 'hand', side: 1, n: 'In hand' },
  { k: 'gloves', side: 1, n: 'Gauntlets', has: id => ITEM[id]?.power },
  { k: 'boots', side: 1, n: 'Boots', has: id => ITEM[id]?.boots },
];
// what is in a slot now, and what could go in it (the items you own that fit)
function slotNow(k) {
  if (k === 'hand') return S.bar[S.sel] ? itemId(S.bar[S.sel]) : 0;
  if (k === 'armor') return S.armor && ITEM[S.armor] ? +S.armor : 0;
  if (k === 'boots') return bootsOn() ? 211 : 0;
  return gearOf(k);
}
function slotChoices(s) {
  const own = Object.keys(S.inv)
    .filter(id => S.inv[id] > 0)
    .map(Number)
    .concat(S.nfts.map(n => n.id || 201));
  return [...new Set(own)].filter(id => s.has(id)).sort((a, b) => (ITEM[a].tier || 0) - (ITEM[b].tier || 0) || a - b);
}
function putInSlot(k, id) {
  if (k === 'armor') S.armor = id ? String(id) : null;
  else if (k === 'boots') S.boots = id ? String(id) : null;
  else S[k] = id ? String(id) : null;
  charSlot = null;
  dirty = true;
  ui();
}
// one line saying what a piece does
function gearLine(id) {
  const it = ITEM[id];
  if (!it) return '';
  if (it.armor) return `−${Math.round(it.armor * 100)}% damage taken`;
  if (it.helm) return `−${Math.round(it.helm * 100)}% damage taken, on top`;
  if (it.power) return `+${Math.round(it.power * 100)}% blade damage and mining`;
  if (it.regen) return `hearts back ${Math.round(it.regen * 100)}% faster`;
  if (it.boots) return `+${Math.round(it.boots * 100)}% speed · a dodge`;
  if (it.dmg) return `${it.dmg} damage${it.ranged ? ' · ranged' : ''}`;
  if (it.tool) return `mines ×${it.tool}`;
  return '';
}
function renderCharacter(body) {
  const wrap = document.createElement('div');
  wrap.className = 'charwin';
  const col = side => {
    const c = document.createElement('div');
    c.className = 'charcol';
    for (const s of CHAR_SLOTS.filter(x => x.side === side)) {
      const id = slotNow(s.k),
        b = document.createElement('button');
      b.className = 'charslot' + (id ? ' full' : '') + (charSlot === s.k ? ' open' : '') + (ITEM[id]?.tier ? ' t' + ITEM[id].tier : '');
      if (id) b.appendChild(cloneIcon(id));
      else b.insertAdjacentHTML('beforeend', '<i></i>');
      b.insertAdjacentHTML(
        'beforeend',
        `<span><small>${s.n}</small><b>${id ? nameOf(id) : 'Empty'}</b><em>${id ? gearLine(id) : ''}</em></span>`,
      );
      if (s.k === 'hand') b.title = 'What you hold: pick it in your bar';
      b.onclick = () => {
        if (s.k === 'hand') return;
        charSlot = charSlot === s.k ? null : s.k;
        renderPanel();
      };
      c.appendChild(b);
    }
    return c;
  };
  const mid = document.createElement('div');
  mid.className = 'charmid';
  mid.appendChild(previewBox());
  wrap.append(col(0), mid, col(1));
  body.appendChild(wrap);
  // the choices for the open slot
  const s = CHAR_SLOTS.find(x => x.k === charSlot);
  if (s) {
    const pick = document.createElement('div');
    pick.className = 'charpick';
    const list = slotChoices(s),
      now = slotNow(s.k);
    pick.insertAdjacentHTML('beforeend', `<h4>${s.n}</h4>`);
    if (!list.length) {
      const r = RECIPES.find(r => s.has(r.out));
      pick.insertAdjacentHTML(
        'beforeend',
        `<p class="note">Nothing to wear here yet${r ? ': craft one in the Crafting tab (Combat)' : ''}.</p>`,
      );
    }
    for (const id of list) {
      const b = document.createElement('button');
      b.className = 'it charitem' + (id === now ? ' sel' : '');
      b.appendChild(cloneIcon(id));
      b.insertAdjacentHTML('beforeend', `<span><b>${nameOf(id)}</b><em>${gearLine(id)}</em></span>`);
      b.onclick = () => putInSlot(s.k, id === now ? 0 : id);
      pick.appendChild(b);
    }
    if (now) {
      const off = document.createElement('button');
      off.className = 'b';
      off.textContent = 'Take it off';
      off.onclick = () => putInSlot(s.k, 0);
      pick.appendChild(off);
    }
    body.appendChild(pick);
  }
  // what it all adds up to
  const st = document.createElement('div');
  st.className = 'charstats';
  const held = slotNow('hand'),
    blade = held && !B[held] && ITEM[held]?.dmg && !ITEM[held].ranged,
    dmg = (ITEM[held]?.dmg || 1) * (blade ? 1 + gearPower() : 1),
    taken = 1 - armorLeft(),
    regen = 4 * (1 - gearRegen()),
    stat = (icon, k, v, hint) =>
      st.insertAdjacentHTML(
        'beforeend',
        `<div><i>${icon}</i><span><small>${k}</small><b>${v}</b>${hint ? `<em>${hint}</em>` : ''}</span></div>`,
      );
  stat('❤', 'Hearts', `${S.hp} / 10`, `one back every ${+regen.toFixed(1)} s`);
  stat('⚔', 'Damage', `${+dmg.toFixed(1)}`, held ? nameOf(held) : 'bare hands');
  stat('🛡', 'Protection', `−${Math.round(taken * 100)}%`, 'damage taken');
  stat('⛏', 'Mining', `×${+(heldTool() * (1 + gearPower())).toFixed(2)}`, held && ITEM[held]?.tool ? nameOf(held) : 'with what you hold');
  stat('👢', 'Speed', bootsOn() ? `+${Math.round(ITEM[211].boots * 100)}%` : 'normal', bootsOn() ? 'Front-Runner Boots' : '');
  const title = typeof bestTitle === 'function' ? bestTitle() : '';
  if (title) stat('✦', 'Title', title, '');
  body.appendChild(st);
}
