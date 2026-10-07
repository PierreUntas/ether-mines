// Ether Mines · Animals: placement, movement, petting.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- animals ----------
// Placed per chunk from the seed, and moved based on real-world time:
// every player sees the same animals in the same place, without sending anything over the network.
const ANIMALS = new Map(),
  ANI_R = 3; // radius, in chunks, around the player
const AK = {
  sheep: { n: 'Ether sheep', D: 9, walk: 0.42, R: 6, sp: 1, hit: [0.9, 1.1, 1.25], gift: [71, 1, 'wool offered by a sheep'] },
  rabbit: { n: 'Dune rabbit', D: 5, walk: 0.38, R: 5, sp: 1, hit: [0.45, 0.55, 0.55] },
  fox: { n: 'Pink fox', D: 6.5, walk: 0.5, R: 8, sp: 1, hit: [0.55, 0.75, 1], gift: 'flower' },
  fish: { n: 'Prism fish', D: 6, walk: 0.85, R: 5, sp: 1, hit: [0.3, 0.35, 0.55] },
  jellyfish: {
    n: 'Sky jellyfish',
    D: 12,
    walk: 1,
    R: 6,
    sp: 1,
    hit: [0.8, 1.2, 0.8],
    gift: [101, 1, 'crystal left by a sky jellyfish'],
  },
  // inspired by ethereum.org's illustrations (no gift: nothing to arbitrate server-side)
  cat: { n: 'Cat', D: 7, walk: 0.42, R: 6, sp: 1, hit: [0.4, 0.6, 0.75] },
  shiba: { n: 'Space shiba', D: 6, walk: 0.55, R: 9, sp: 1, hit: [0.6, 1.05, 0.9] },
  robot: { n: 'Validator robot', D: 11, walk: 0.32, R: 6, sp: 1, hit: [0.8, 1.9, 0.7] },
  villager: { n: 'Villager', D: 9, walk: 0.3, R: 2.2, sp: 1, hit: [0.6, 1.95, 0.6] },
};
// ---------- villagers ----------
// They live in the Atrium and the City, always in the same place for everyone. You talk to them like you pet an animal.
// tenue : [habit, accent, cheveux, peau] ; coiffe : 'chapeau', 'diademe', 'capuche' ou rien.
const VILLAGERS = [
  {
    x: SPAWN.x,
    z: SPAWN.z + 5,
    name: 'Solène',
    role: 'guardian of the Atrium',
    outfit: ['#8a7bef', '#ffd95e', '#3a3480', '#f6d3b8'],
    headwear: 'tiara',
    says: [
      "Welcome to the Atrium. This validator is the network's first: as long as it shines, no one can break anything here.",
      () => networkStatus(),
      'Follow the paved path north: it leads to the City, under the great diamond.',
    ],
  },
  {
    x: SPAWN.x - 3,
    z: SPAWN.z + 4,
    name: 'Noé',
    role: 'builder',
    outfit: ['#ffb37a', '#6a58e0', '#7a4a2a', '#e8b890'],
    headwear: 'hat',
    says: [
      'Start with wood: a log gives four planks, and three planks make a pickaxe.',
      'Step away from the Atrium a bit and type /claim in the chat: the land will be yours, no one else will touch it.',
      'A chest keeps your treasures. In your plot, only your invites can open it.',
    ],
  },
  {
    x: SPAWN.x,
    z: SPAWN.z - 11,
    name: 'Iris',
    role: 'cartographer',
    outfit: ['#9fe3c4', '#ff9ab8', '#2a2550', '#c98a64'],
    says: [
      () => {
        const r = nearestRuin();
        return r
          ? `The nearest ruin is ${Math.round(r.d)} m that way: ${arrowTo(r.x + 0.5, r.z + 0.5)}. A dark validator waits there for its heart.`
          : 'Every ruin nearby has been relit. You need to go further.';
      },
      'The sea is to the east, the mountains to the northeast. Sometimes islands float in the sky: sky jellyfish drift up there.',
      'Every region hides a ruin. Your objectives compass will guide you once you have a validator heart.',
    ],
  },
  {
    x: CITY.x + 1,
    z: CITY.z + 24,
    name: 'Robin',
    role: 'traveler',
    outfit: ['#7fe8ff', '#ffb37a', '#c96a3a', '#f6d3b8'],
    headwear: 'hood',
    says: [
      'You see the ships above the halls? They have circled the diamond since forever.',
      "The City and the Atrium belong to everyone: you can't mine or build there.",
      'Press V to see yourself from behind, and again to see yourself from the front.',
    ],
  },
  {
    x: CITY.x - 12,
    z: CITY.z + 13,
    name: 'Lune',
    role: 'merchant',
    outfit: ['#ff9ab8', '#ffd95e', '#5a3a80', '#e8b890'],
    headwear: 'hat',
    says: [
      "Here everything gets crafted and traded: your chest's Trade tab is for offering a deal to another player.",
      'Flowers, crystals, reeds: almost everything you pick up goes into a decoration recipe.',
      'Pet the sheep: they offer their wool once a day.',
    ],
  },
  {
    x: CITY.x - 11,
    z: CITY.z - 11,
    name: 'Maëlle',
    role: 'librarian',
    outfit: ['#b6a4ff', '#7fe8ff', '#8a5a3a', '#f6d3b8'],
    says: [
      "Every placed block carries the name of whoever placed it. The world's ledger keeps it all.",
      'A lever, an ether cable, a lamp: that is your first circuit.',
      'The AND, OR and NOT gates, and the clock: with them, you build real machines.',
    ],
  },
  {
    x: CITY.x + 12,
    z: CITY.z - 10,
    name: 'Basile',
    role: 'gardener',
    outfit: ['#9fe3c4', '#ffb37a', '#4a4a4a', '#c98a64'],
    headwear: 'hat',
    says: [
      'Ether mushrooms grow in the caves, amethysts deep at the bottom.',
      'Pink foxes pick flowers for those who pet them.',
      'Reeds line the banks, water lilies float on calm waters.',
    ],
  },
  {
    x: CITY.x + 2,
    z: CITY.z + 1,
    name: 'Céleste',
    role: 'oracle of the diamond',
    outfit: ['#f4f1ff', '#8a7bef', '#ffd95e', '#f6d3b8'],
    headwear: 'tiara',
    says: [
      () => networkStatus(),
      'To relight an old validator, you need a heart: one genesis fragment, two pure shards, four crystals.',
      'The genesis rock sleeps right at the bottom of the world. Only the pure ether pickaxe can break into it.',
    ],
  },
  {
    x: CITY.x + 2,
    z: CITY.z - 11,
    name: 'Hector',
    role: 'ledger scribe',
    outfit: ['#6a58e0', '#ffd95e', '#d8d8e8', '#e8b890'],
    says: [
      () =>
        NETWORK.top[0]
          ? `${NETWORK.top[0].name} watches over ${NETWORK.top[0].n} validator${NETWORK.top[0].n > 1 ? 's' : ''}: no one has relit more.`
          : 'No one has relit an old validator yet. The first name carved here could be yours.',
      'A placed validator mints a crystal every five minutes. An old validator relit, one a minute.',
      'Unique items keep their history: who forged them, where, and what they have accomplished.',
    ],
  },
];
const aniMat = {};
const AM = (c, basic, op) => {
  const k = c + (basic ? 'b' : '') + (op || '');
  return (
    aniMat[k] ||
    (aniMat[k] = basic
      ? new THREE.MeshBasicMaterial({ color: c, transparent: !!op, opacity: op || 1, depthWrite: !op })
      : new THREE.MeshLambertMaterial({ color: c }))
  );
};
const aniGeo = {};
const AG = (w, h, d) => {
  const k = w + ',' + h + ',' + d;
  return aniGeo[k] || (aniGeo[k] = new THREE.BoxGeometry(w, h, d));
};
function abox(par, w, h, d, c, x, y, z, basic, op) {
  const m = new THREE.Mesh(AG(w, h, d), AM(c, basic, op));
  m.position.set(x, y, z);
  m.castShadow = !basic && !touch;
  par.add(m);
  return m;
}
function pivot(par, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  par.add(g);
  return g;
}
function buildAnimal(a) {
  const g = new THREE.Group(),
    r = a.r,
    parts = { legs: [] };
  if (a.type === 'sheep') {
    const wool = ['#e6ddff', '#f4f1ff', '#d6cbff', '#ffe1f0'][Math.floor(r * 4)],
      skin = '#4a3d7a';
    abox(g, 0.86, 0.62, 1.1, wool, 0, 0.78, 0);
    abox(g, 0.9, 0.2, 0.9, wool, 0, 1.1, 0);
    const hd = (parts.head = pivot(g, 0, 0.95, 0.55));
    abox(hd, 0.42, 0.42, 0.42, skin, 0, 0, 0.2);
    abox(hd, 0.5, 0.2, 0.3, wool, 0, 0.22, 0.12);
    abox(hd, 0.08, 0.08, 0.02, '#ffffff', -0.12, 0.04, 0.415, true);
    abox(hd, 0.08, 0.08, 0.02, '#ffffff', 0.12, 0.04, 0.415, true);
    for (const [x, z] of [
      [-0.25, 0.35],
      [0.25, 0.35],
      [-0.25, -0.35],
      [0.25, -0.35],
    ]) {
      const l = pivot(g, x, 0.48, z);
      abox(l, 0.18, 0.48, 0.18, skin, 0, -0.24, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'rabbit') {
    const fur = ['#f3e6d4', '#e8d8ff', '#d9c3a8'][Math.floor(r * 3)];
    abox(g, 0.34, 0.3, 0.46, fur, 0, 0.25, 0);
    const hd = (parts.head = pivot(g, 0, 0.42, 0.22));
    abox(hd, 0.28, 0.26, 0.26, fur, 0, 0, 0.06);
    abox(hd, 0.07, 0.26, 0.05, fur, -0.07, 0.24, 0);
    abox(hd, 0.07, 0.26, 0.05, fur, 0.07, 0.24, 0);
    abox(hd, 0.04, 0.18, 0.02, '#ffb8d9', -0.07, 0.24, 0.03, true);
    abox(hd, 0.04, 0.18, 0.02, '#ffb8d9', 0.07, 0.24, 0.03, true);
    abox(hd, 0.05, 0.05, 0.02, '#1c163a', -0.08, 0.03, 0.2, true);
    abox(hd, 0.05, 0.05, 0.02, '#1c163a', 0.08, 0.03, 0.2, true);
    abox(g, 0.14, 0.14, 0.12, '#ffffff', 0, 0.3, -0.26);
    for (const [x, z] of [
      [-0.1, 0.14],
      [0.1, 0.14],
      [-0.12, -0.14],
      [0.12, -0.14],
    ]) {
      const l = pivot(g, x, 0.12, z);
      abox(l, 0.09, 0.12, 0.14, fur, 0, -0.06, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'fox') {
    const fur = r < 0.5 ? '#ff9a6b' : '#ff8fb4',
      dark = '#3b2c55';
    abox(g, 0.38, 0.34, 0.8, fur, 0, 0.55, 0);
    const hd = (parts.head = pivot(g, 0, 0.66, 0.42));
    abox(hd, 0.36, 0.32, 0.3, fur, 0, 0, 0.08);
    abox(hd, 0.18, 0.14, 0.18, '#fff3ea', 0, -0.07, 0.3);
    abox(hd, 0.06, 0.06, 0.04, dark, 0, -0.03, 0.4, true);
    abox(hd, 0.1, 0.14, 0.06, fur, -0.12, 0.22, 0.02);
    abox(hd, 0.1, 0.14, 0.06, fur, 0.12, 0.22, 0.02);
    abox(hd, 0.05, 0.05, 0.02, dark, -0.09, 0.05, 0.235, true);
    abox(hd, 0.05, 0.05, 0.02, dark, 0.09, 0.05, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.6, -0.4));
    abox(tl, 0.2, 0.2, 0.46, fur, 0, 0, -0.22);
    abox(tl, 0.21, 0.21, 0.14, '#fff3ea', 0, 0, -0.46);
    for (const [x, z] of [
      [-0.12, 0.28],
      [0.12, 0.28],
      [-0.12, -0.28],
      [0.12, -0.28],
    ]) {
      const l = pivot(g, x, 0.38, z);
      abox(l, 0.12, 0.38, 0.12, dark, 0, -0.19, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'fish') {
    const c = ['#7fe8ff', '#ffb8d9', '#ffd95e', '#b6a4ff'][Math.floor(r * 4)];
    abox(g, 0.14, 0.24, 0.4, c, 0, 0, 0, true);
    abox(g, 0.02, 0.08, 0.12, '#ffffff', 0, 0.14, 0, true);
    const tl = (parts.tail = pivot(g, 0, 0, -0.2));
    abox(tl, 0.04, 0.22, 0.16, c, 0, 0, -0.08, true);
    abox(g, 0.15, 0.05, 0.05, '#1c163a', 0, 0.04, 0.14, true);
  } else if (a.type === 'cat') {
    const [fur, ventre] = [
      ['#f4a36b', '#ffe8d6'],
      ['#a9adcf', '#eef0ff'],
      ['#f3e6d4', '#ffffff'],
      ['#5b4f8c', '#c9b8ff'],
    ][Math.floor(r * 4)];
    abox(g, 0.3, 0.26, 0.62, fur, 0, 0.36, 0);
    abox(g, 0.24, 0.06, 0.4, ventre, 0, 0.23, 0.02);
    const hd = (parts.head = pivot(g, 0, 0.5, 0.3));
    abox(hd, 0.3, 0.26, 0.26, fur, 0, 0, 0.06);
    abox(hd, 0.18, 0.1, 0.06, ventre, 0, -0.06, 0.2);
    abox(hd, 0.08, 0.1, 0.06, fur, -0.09, 0.17, 0.02);
    abox(hd, 0.08, 0.1, 0.06, fur, 0.09, 0.17, 0.02);
    abox(hd, 0.05, 0.05, 0.02, '#2b8a6e', -0.07, 0.03, 0.195, true);
    abox(hd, 0.05, 0.05, 0.02, '#2b8a6e', 0.07, 0.03, 0.195, true);
    abox(hd, 0.04, 0.03, 0.02, '#ff8fb4', 0, -0.03, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.45, -0.3));
    abox(tl, 0.07, 0.07, 0.42, fur, 0, 0.12, -0.16).rotation.x = -0.9;
    for (const [x, z] of [
      [-0.09, 0.2],
      [0.09, 0.2],
      [-0.09, -0.2],
      [0.09, -0.2],
    ]) {
      const l = pivot(g, x, 0.24, z);
      abox(l, 0.08, 0.24, 0.08, fur, 0, -0.12, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'shiba') {
    // the shiba: lavender spacesuit, russet head, white muzzle, blue nose
    const suit = '#c9b8ff',
      suit2 = '#9a8cf5',
      fur = '#f4b183',
      creme = '#fff4ea';
    abox(g, 0.42, 0.4, 0.78, suit, 0, 0.6, 0);
    abox(g, 0.3, 0.26, 0.2, '#b3dcff', 0, 0.86, -0.22); // backpack
    abox(g, 0.44, 0.08, 0.3, suit2, 0, 0.82, 0.24); // spacesuit collar
    const hd = (parts.head = pivot(g, 0, 0.9, 0.42));
    abox(hd, 0.4, 0.36, 0.34, fur, 0, 0.04, 0.06);
    abox(hd, 0.26, 0.16, 0.2, creme, 0, -0.05, 0.26);
    abox(hd, 0.08, 0.06, 0.04, '#5b7fff', 0, 0.02, 0.37, true); // blue nose
    abox(hd, 0.1, 0.05, 0.02, '#7fa8ff', 0, -0.1, 0.36, true); // tongue
    abox(hd, 0.11, 0.16, 0.08, fur, -0.12, 0.28, 0.02);
    abox(hd, 0.11, 0.16, 0.08, fur, 0.12, 0.28, 0.02);
    abox(hd, 0.08, 0.025, 0.02, '#3b2c55', -0.09, 0.1, 0.235, true); // laughing eyes
    abox(hd, 0.08, 0.025, 0.02, '#3b2c55', 0.09, 0.1, 0.235, true);
    const tl = (parts.tail = pivot(g, 0, 0.82, -0.4));
    abox(tl, 0.16, 0.16, 0.24, fur, 0, 0.08, -0.06);
    for (const [x, z] of [
      [-0.13, 0.26],
      [0.13, 0.26],
      [-0.13, -0.26],
      [0.13, -0.26],
    ]) {
      const l = pivot(g, x, 0.4, z);
      abox(l, 0.14, 0.4, 0.14, suit2, 0, -0.2, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'robot') {
    // the illustrations' robot: big round blue body, mint joints, pointy lavender hat, orange eyes
    const bleu = '#6f88e8',
      menthe = '#a6f4ee',
      lav = '#c9a8ff';
    abox(g, 0.72, 0.62, 0.5, bleu, 0, 1.12, 0);
    abox(g, 0.5, 0.42, 0.06, '#5b6fd6', 0, 1.12, 0.26);
    abox(g, 0.2, 0.14, 0.04, menthe, 0.12, 1.0, 0.3, true);
    abox(g, 0.86, 0.1, 0.2, lav, 0, 1.44, 0);
    const hd = (parts.head = pivot(g, 0, 1.52, 0));
    abox(hd, 0.32, 0.22, 0.28, menthe, 0, 0.1, 0);
    abox(hd, 0.09, 0.09, 0.04, '#ffb36b', -0.08, 0.12, 0.15, true);
    abox(hd, 0.09, 0.09, 0.04, '#ffb36b', 0.08, 0.12, 0.15, true);
    const ch1 = abox(hd, 0.44, 0.06, 0.4, lav, -0.11, 0.33, 0);
    ch1.rotation.z = 0.75;
    const ch2 = abox(hd, 0.44, 0.06, 0.4, lav, 0.11, 0.33, 0);
    ch2.rotation.z = -0.75;
    for (const x of [-0.44, 0.44]) {
      const bras = pivot(g, x, 1.3, 0);
      abox(bras, 0.14, 0.5, 0.14, menthe, 0, -0.25, 0);
      abox(bras, 0.16, 0.14, 0.16, bleu, 0, -0.52, 0);
    }
    for (const x of [-0.16, 0.16]) {
      const l = pivot(g, x, 0.82, 0);
      abox(l, 0.16, 0.5, 0.16, menthe, 0, -0.25, 0);
      abox(l, 0.2, 0.3, 0.22, bleu, 0, -0.6, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'villager') {
    const [habit, accent, cheveux, peau] = a.h.outfit,
      sombre = '#' + new THREE.Color(habit).multiplyScalar(0.72).getHexString();
    abox(g, 0.5, 0.62, 0.3, habit, 0, 0.98, 0);
    abox(g, 0.54, 0.3, 0.34, habit, 0, 0.6, 0); // bottom of the tunic
    abox(g, 0.52, 0.08, 0.32, accent, 0, 0.76, 0); // belt
    abox(g, 0.2, 0.2, 0.04, accent, 0, 1.12, 0.16); // brooch
    for (const x of [-0.13, 0.13]) {
      const l = pivot(g, x, 0.5, 0);
      abox(l, 0.2, 0.5, 0.22, sombre, 0, -0.25, 0);
      parts.legs.push(l);
    }
    for (const x of [-0.34, 0.34]) {
      const b = pivot(g, x, 1.26, 0);
      abox(b, 0.16, 0.5, 0.2, habit, 0, -0.25, 0);
      abox(b, 0.14, 0.12, 0.18, peau, 0, -0.56, 0);
      parts.legs.push(b);
    }
    const hd = (parts.head = pivot(g, 0, 1.3, 0));
    abox(hd, 0.44, 0.44, 0.44, peau, 0, 0.24, 0);
    abox(hd, 0.48, 0.14, 0.48, cheveux, 0, 0.42, 0);
    abox(hd, 0.48, 0.3, 0.1, cheveux, 0, 0.24, -0.2);
    abox(hd, 0.07, 0.09, 0.02, '#2a2550', -0.1, 0.26, 0.225, true);
    abox(hd, 0.07, 0.09, 0.02, '#2a2550', 0.1, 0.26, 0.225, true);
    abox(hd, 0.14, 0.03, 0.02, '#c96a6a', 0, 0.12, 0.225, true);
    if (a.h.headwear === 'hat') {
      abox(hd, 0.74, 0.05, 0.74, accent, 0, 0.5, 0);
      abox(hd, 0.4, 0.16, 0.4, accent, 0, 0.6, 0);
    } else if (a.h.headwear === 'tiara') {
      abox(hd, 0.5, 0.06, 0.5, accent, 0, 0.44, 0);
      abox(hd, 0.1, 0.12, 0.04, '#7fe8ff', 0, 0.48, 0.24, true);
    } else if (a.h.headwear === 'hood') {
      abox(hd, 0.52, 0.5, 0.4, habit, 0, 0.26, -0.08);
    }
    const tag = nameTag(a.h.name, habit);
    tag.position.y = 2.15;
    tag.scale.multiplyScalar(0.8);
    g.add(tag);
  } else if (a.type === 'jellyfish') {
    const c = r < 0.5 ? '#b6a4ff' : '#7fe8ff';
    abox(g, 0.7, 0.42, 0.7, c, 0, 0.55, 0, true, 0.55);
    abox(g, 0.46, 0.2, 0.46, '#ffffff', 0, 0.58, 0, true, 0.5);
    abox(g, 0.74, 0.06, 0.74, c, 0, 0.34, 0, true, 0.8);
    parts.tent = [];
    for (let i = 0; i < 4; i++) {
      const an = (i / 4) * Math.PI * 2 + 0.4,
        t = pivot(g, Math.cos(an) * 0.2, 0.32, Math.sin(an) * 0.2);
      abox(t, 0.05, 0.6, 0.05, c, 0, -0.3, 0, true, 0.7);
      parts.tent.push(t);
    }
  }
  a.g = g;
  a.parts = parts;
  g.position.set(a.hx, a.hy, a.hz);
  scene.add(g);
}
// sol sous (x, z) : premier bloc plein en descendant depuis ref+4 (troncs et feuillages exclus au premier placement)
function groundAt(x, z, ref, noTree, up = 4) {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  for (let y = Math.min(SY - 1, Math.floor(ref) + up); y >= Math.max(0, Math.floor(ref) - 8); y--) {
    const id = get(xi, y, zi);
    if (id === 11) return { y: y + 1, water: true };
    if (noTree && (id === 5 || id === 7)) return null;
    if (isSolid(id)) return { y: y + 1, water: false };
  }
  return null;
}
function topSolid(x, z) {
  for (let y = SY - 1; y > 0; y--) {
    const id = get(x, y, z);
    if (!id || isCross(id)) continue;
    return { id, y };
  }
  return null;
}
function spawnChunk(cx, cz) {
  const k = ckey(cx, cz);
  if (ANIMALS.has(k)) return;
  const list = [];
  ANIMALS.set(k, list);
  const r = hash(cx * 7 + 1, cz * 13 + 2, 61),
    x0 = cx * CH,
    z0 = cz * CH,
    near = Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
  const add = (type, n, rad) => {
    for (let i = 0; i < n; i++) {
      const hx = x0 + 2 + Math.floor(hash(cx + i * 31, cz, 62 + i) * 12),
        hz = z0 + 2 + Math.floor(hash(cx, cz + i * 17, 70 + i) * 12);
      const a = {
        type,
        k,
        i,
        hx: hx + 0.5,
        hz: hz + 0.5,
        r: hash(cx * 3 + i, cz * 5, 80),
        ph: hash(cx + i, cz - i, 81) * 60,
        seed: ((cx * 73856093) ^ (cz * 19349663) ^ (i * 83492791)) | 0,
      };
      if (type === 'jellyfish') {
        const t = islandTop(hx, hz);
        if (t < 0) continue;
        a.hy = t + 3;
      } else if (type === 'fish') {
        const s = topSolid(hx, hz);
        if (!s || s.id !== 11) continue;
        let b = s.y;
        while (b > 0 && get(hx, b - 1, hz) === 11) b--;
        if (s.y - b < 2) continue;
        a.hy = s.y;
        a.bot = b;
      } else {
        const h0 = heightAt(hx, hz);
        let s = null;
        for (let y = Math.min(SY - 1, h0 + 5); y >= h0 - 3; y--) {
          const id = get(hx, y, hz);
          if (id === 5 || id === 7 || !id || isCross(id)) continue;
          s = { id, y };
          break;
        } // natural ground, not islands or roofs
        if (!s || s.id === 11 || !isSolid(s.id) || (get(hx, s.y + 1, hz) && !isCross(get(hx, s.y + 1, hz)))) continue;
        a.hy = s.y + 1;
      }
      a.y = a.hy;
      buildAnimal(a);
      list.push(a);
    }
  };
  // at a fixed spot (villagers, sanctuary companions): on the first solid ground under the roofs
  const fixed = (type, i, x, z, h) => {
    const y0 = (inCity(x, z) ? CITY.Y : heightAt(x, z)) + 3;
    for (let y = y0; y >= y0 - 6; y--) {
      const id = get(x, y, z);
      if (!id || id === 11 || !isSolid(id)) continue;
      const a = {
        type,
        k,
        i,
        h,
        hx: x + 0.5,
        hz: z + 0.5,
        hy: y + 1,
        y: y + 1,
        r: hash(x, z, 80),
        ph: hash(x, z, 81) * 60,
        seed: ((x * 73856093) ^ (z * 19349663) ^ (i * 83492791)) | 0,
      };
      buildAnimal(a);
      list.push(a);
      return;
    }
  };
  VILLAGERS.forEach((h, n) => {
    if (cOf(h.x) === cx && cOf(h.z) === cz) fixed('villager', 40 + n, h.x, h.z, h);
  });
  // at the sanctuary: a validator robot and the space shiba, on the Atrium's slabs
  if (cx === cOf(SPAWN.x) && cz === cOf(SPAWN.z)) {
    fixed('robot', 30, SPAWN.x - 5, SPAWN.z);
    fixed('shiba', 31, SPAWN.x + 3, SPAWN.z - 5);
    return;
  }
  // floating islands: sky jellyfish
  const r2 = hash(cx * 5 - 3, cz * 11 + 7, 65);
  for (let t = 0; t < 3; t++) {
    const x = x0 + 4 + t * 4,
      z = z0 + 8;
    if (islandTop(x, z) > 0) {
      if (r2 < 0.18) add('jellyfish', 1);
      break;
    }
  }
  const hc = heightAt(x0 + 8, z0 + 8);
  if (hc < SEA) {
    if (r < 0.25) add('fish', 2 + Math.floor(hash(cx, cz, 66) * 3));
    return;
  }
  // the City: validator robots and cats in the streets
  if (inCity(x0 + 8, z0 + 8)) {
    if (r < 0.5) add('robot', 1);
    if (hash(cx, cz, 68) < 0.4) add('cat', 1);
    return;
  }
  const bi = biome(x0 + 8, z0 + 8);
  const r3 = hash(cx * 11 - 5, cz * 3 + 9, 67);
  if (r3 < 0.05) add('cat', 1 + (r3 < 0.02 ? 1 : 0));
  else if (r3 < 0.07) add(bi === 'dunes' ? 'shiba' : 'cat', 1);
  else if (r3 < 0.08) add('robot', 1);
  if (bi === 'plaine') {
    if (r < 0.16 || (near && r < 0.5)) add('sheep', 2 + Math.floor(hash(cx, cz, 63) * 2));
    else if (r < 0.24) add('rabbit', 1 + (r < 0.2 ? 1 : 0));
  } else if (bi === 'foret') {
    if (r < 0.1) add('fox', 1);
    else if (r < 0.18) add('rabbit', 1);
    else if (near && r < 0.45) add('sheep', 2);
  } else {
    if (r < 0.14) add('rabbit', 1 + Math.floor(hash(cx, cz, 64) * 2));
  }
}
function despawnChunk(k) {
  const l = ANIMALS.get(k);
  if (!l) return;
  for (const a of l) scene.remove(a.g);
  ANIMALS.delete(k);
}
// waypoint #k: around home, on accessible ground (otherwise home)
function waypoint(a, k) {
  const K = AK[a.type],
    an = hash(a.seed, k, 90) * Math.PI * 2,
    rr = Math.sqrt(hash(a.seed, k, 91)) * K.R;
  let x = a.hx + Math.cos(an) * rr,
    z = a.hz + Math.sin(an) * rr;
  if (a.type === 'fish') {
    const ok = get(Math.floor(x), a.hy - 1, Math.floor(z)) === 11 && get(Math.floor(x), a.bot, Math.floor(z)) === 11;
    if (!ok) {
      x = a.hx;
      z = a.hz;
    }
    return { x, z, y: ok ? a.bot + 0.35 + hash(a.seed, k, 92) * (a.hy - a.bot - 1) : a.hy - 0.8 };
  }
  if (a.type === 'jellyfish') return { x, z, y: a.hy + hash(a.seed, k, 92) * 3 };
  const gr = groundAt(x, z, a.hy, true, 3);
  if (
    !gr ||
    gr.water ||
    Math.abs(gr.y - a.hy) > 2 ||
    (get(Math.floor(x), gr.y, Math.floor(z)) && !isCross(get(Math.floor(x), gr.y, Math.floor(z))))
  ) {
    x = a.hx;
    z = a.hz;
  }
  return { x, z };
}
let aniT = 0,
  aniSound = 8;
function updateAnimals(dt) {
  if (!REG.animals) {
    for (const k of [...ANIMALS.keys()]) despawnChunk(k);
    return;
  }
  aniT -= dt;
  if (aniT <= 0) {
    aniT = 1;
    const pcx = cOf(P.x),
      pcz = cOf(P.z),
      want = new Set();
    for (let dz = -ANI_R; dz <= ANI_R; dz++)
      for (let dx = -ANI_R; dx <= ANI_R; dx++) {
        const k = ckey(pcx + dx, pcz + dz);
        if (CHK.has(k) && MESH.has(k)) {
          want.add(k);
          spawnChunk(pcx + dx, pcz + dz);
        }
      }
    for (const k of [...ANIMALS.keys()]) if (!want.has(k)) despawnChunk(k);
  }
  const T = Date.now() / 1000;
  let near = null,
    nd = 18;
  for (const l of ANIMALS.values())
    for (const a of l) {
      const K = AK[a.type],
        tt = T + a.ph,
        k = Math.floor(tt / K.D),
        f = tt / K.D - k;
      if (a.wk !== k) {
        a.wk = k;
        a.from = waypoint(a, k - 1);
        a.to = waypoint(a, k);
      }
      let s = clamp(f / K.walk, 0, 1);
      const moving = s < 1 && Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z) > 0.3;
      s = s * s * (3 - 2 * s);
      const x = lerp(a.from.x, a.to.x, s),
        z = lerp(a.from.z, a.to.z, s),
        g = a.g,
        p = a.parts;
      g.position.x = x;
      g.position.z = z;
      if (moving) {
        const h = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
        let dr = h - g.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        g.rotation.y += dr * Math.min(1, dt * 6);
      }
      a.walk = (a.walk || 0) + dt * (moving ? 9 : 0);
      const sw = moving ? Math.sin(a.walk) : 0;
      if (a.type === 'fish') {
        g.position.y = lerp(a.from.y, a.to.y, s) + Math.sin(T * 2 + a.ph) * 0.06;
        p.tail.rotation.y = Math.sin(T * (moving ? 14 : 5) + a.ph) * 0.5;
      } else if (a.type === 'jellyfish') {
        g.position.y = lerp(a.from.y, a.to.y, s) + Math.sin(T * 0.9 + a.ph) * 0.35;
        const pu = Math.sin(T * 2 + a.ph);
        g.scale.set(1 + pu * 0.05, 1 - pu * 0.06, 1 + pu * 0.05);
        p.tent.forEach((t, i) => {
          t.rotation.x = Math.sin(T * 1.7 + i) * 0.3;
          t.rotation.z = Math.cos(T * 1.3 + i) * 0.3;
        });
        g.rotation.y += dt * 0.2;
      } else {
        const gr = groundAt(x, z, a.y + 0.1, false, 1);
        if (gr && !gr.water) a.y += (gr.y - a.y) * Math.min(1, dt * 10);
        let hop = 0;
        if (a.type === 'rabbit' && moving) hop = Math.abs(Math.sin(a.walk * 0.8)) * 0.35;
        g.position.y = a.y + hop;
        p.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -1 : 1) * (i < 2 ? 1 : -1) * sw * 0.6));
        if (p.head) {
          const graze = a.type === 'sheep' && !moving && Math.sin(tt * 0.7) > 0.2;
          p.head.rotation.x += ((graze ? 0.7 : Math.sin(tt * 0.9) * 0.08) - p.head.rotation.x) * Math.min(1, dt * 4);
          p.head.rotation.y = moving ? 0 : Math.sin(tt * 0.5 + a.ph) * 0.35;
        }
        if (p.tail) p.tail.rotation.y = Math.sin(T * 3 + a.ph) * 0.25;
      }
      const d = Math.hypot(x - P.x, z - P.z);
      if (a.type === 'villager' && !moving && d < 4.5) {
        // a villager turns toward the approaching player
        let dr = Math.atan2(P.x - x, P.z - z) - g.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        g.rotation.y += dr * Math.min(1, dt * 5);
        p.head.rotation.y = 0;
      }
      if (d < nd && a.type !== 'villager') {
        nd = d;
        near = a;
      }
      if (a.pet > 0) {
        a.pet -= dt;
        g.rotation.z = Math.sin(a.pet * 20) * 0.08 * a.pet;
      }
    }
  aniSound -= dt;
  if (aniSound <= 0) {
    aniSound = 7 + Math.random() * 12;
    if (near && near.type !== 'fish') Sound.animal(near.type, 1 - nd / 18);
  }
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.t += dt;
    h.s.position.y += dt * 0.9;
    h.s.position.x += Math.sin(h.t * 6 + i) * 0.004;
    h.s.material.opacity = 1 - h.t / 1.4;
    if (h.t > 1.4) {
      scene.remove(h.s);
      h.s.material.dispose();
      hearts.splice(i, 1);
    }
  }
}
// aiming: the animal under the crosshair (or under the finger) if it's closer than the targeted block
const aniRay = new THREE.Ray(),
  aniBox = new THREE.Box3(),
  aniV = new THREE.Vector3();
function aimRay(at) {
  aniRay.origin.copy(camera.position);
  if (at) aniRay.direction.set(at.x, at.y, 0.5).unproject(camera).sub(camera.position).normalize();
  else aniRay.direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return aniRay;
}
function pickAnimal(at, blk) {
  const ray = aimRay(at);
  let best = null,
    bd = 5.2;
  for (const l of ANIMALS.values())
    for (const a of l) {
      const [w, h, d] = AK[a.type].hit,
        p = a.g.position,
        m = Math.max(w, d) / 2;
      aniBox.min.set(p.x - m, p.y, p.z - m);
      aniBox.max.set(p.x + m, p.y + h, p.z + m);
      if (a.type === 'fish') {
        aniBox.min.y -= 0.2;
        aniBox.max.y -= 0.2;
      }
      if (ray.intersectBox(aniBox, aniV)) {
        const dd = aniV.distanceTo(ray.origin);
        if (dd < bd) {
          bd = dd;
          best = a;
        }
      }
    }
  if (!best) return null;
  if (blk) {
    aniBox.min.set(blk.x, blk.y, blk.z);
    aniBox.max.set(blk.x + 1, blk.y + 1, blk.z + 1);
    if (ray.intersectBox(aniBox, aniV) && aniV.distanceTo(ray.origin) < bd) return null;
  }
  return best;
}
const heartTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const x = c.getContext('2d');
  x.fillStyle = '#ff7fb0';
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'].forEach((r, y) =>
    [...r].forEach((ch, i) => {
      if (ch === '#') x.fillRect(i + 1, y + 2, 1, 1);
    }),
  );
  x.fillStyle = '#ffd1e4';
  x.fillRect(2, 3, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
})();
const hearts = [];
// talk to a villager: their lines play one at a time, in a bubble at the bottom of the screen
let saysT = 0;
function talk(a) {
  const h = a.h;
  a.rep = ((a.rep ?? -1) + 1) % h.says.length;
  const t = typeof h.says[a.rep] === 'function' ? h.says[a.rep]() : h.says[a.rep],
    el = $('dialogue');
  el.innerHTML = `<b style="color:${h.outfit[0]}">${h.name}</b><i>${h.role}</i><p></p>`;
  el.querySelector('p').textContent = t;
  el.hidden = false;
  clearTimeout(saysT);
  saysT = setTimeout(() => (el.hidden = true), 3500 + t.length * 45);
  a.pet = 0.25;
  Sound.animal('villager', 1);
  S.met = S.met || {};
  if (!S.met[h.name]) {
    S.met[h.name] = 1;
    dirty = true;
  }
}
function petAnimal(a) {
  const K = AK[a.type],
    p = a.g.position;
  if (a.type === 'villager') return talk(a);
  a.pet = 0.6;
  Sound.animal(a.type, 1);
  for (let i = 0; i < (a.type === 'jellyfish' ? 5 : 3); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.32);
    s.position.set(p.x + (Math.random() - 0.5) * 0.6, p.y + K.hit[1] + 0.1 + i * 0.15, p.z + (Math.random() - 0.5) * 0.6);
    scene.add(s);
    hearts.push({ s, t: -i * 0.12 });
  }
  const key = a.k + ':' + a.i,
    today = new Date().toISOString().slice(0, 10);
  S.pets = S.pets || {};
  if (K.gift && S.pets[key] !== today && SERVER()) {
    S.pets[key] = today;
    serverAct('gift', { animal: key, kind: a.type }, null, K.gift === 'fleur' ? 'cueillie par un fox rose' : K.gift[2]).then(r => {
      if (r) Sound.chime();
    });
    return;
  }
  if (K.gift && S.pets[key] !== today) {
    S.pets[key] = today;
    if (K.gift === 'fleur') give(17 + Math.floor(Math.random() * 3), 1, 'cueillie par un fox rose');
    else give(K.gift[0], K.gift[1], K.gift[2]);
    Sound.chime();
  }
}

// ---------- race: beacons to touch in order, purely cosmetic (like the animals, no in-game value) ----------
const COURSE = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2,
    x = SPAWN.x + Math.round(Math.cos(a) * 20),
    z = SPAWN.z + Math.round(Math.sin(a) * 20);
  return { x: x + 0.5, y: heightAt(x, z) + 1, z: z + 0.5 };
});
const courseGeo = new THREE.TorusGeometry(0.7, 0.08, 8, 20),
  courseMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.55, depthWrite: false }),
  courseMatOn = new THREE.MeshBasicMaterial({ color: 0xffd95e, transparent: true, opacity: 0.85, depthWrite: false }),
  courseRings = COURSE.map(c => {
    const m = new THREE.Mesh(courseGeo, courseMat);
    m.position.set(c.x, c.y + 0.9, c.z);
    scene.add(m);
    return m;
  });
let RACE = null; // { i, t0 }: beacon to reach, start time (performance.now())
function raceMsg(text) {
  Net.chat(text)
    .then(r => {
      if ((r && r.ok) || (r && r.err === 'offline')) addChat(ME.name, ME.color, text);
    })
    .catch(() => addChat('World', '#7fe8ff', text));
}
function startRace() {
  RACE = { i: 0, t0: performance.now() };
  raceMsg('sets off on the race track!');
}
function courseAnimate(now) {
  for (let i = 0; i < courseRings.length; i++) {
    const m = courseRings[i],
      on = !!RACE && RACE.i === i;
    m.material = on ? courseMatOn : courseMat;
    m.rotation.y = now / 900 + i;
    m.scale.setScalar(on ? 1 + Math.sin(now / 160) * 0.08 : 1);
  }
}
function courseCheck() {
  if (!RACE) return;
  const c = COURSE[RACE.i];
  if (Math.hypot(P.x - c.x, P.y - c.y, P.z - c.z) > 1.6) return;
  Sound.chime();
  RACE.i++;
  if (RACE.i >= COURSE.length) {
    raceMsg(`finishes the race in ${((performance.now() - RACE.t0) / 1000).toFixed(1)} s!`);
    RACE = null;
  }
}
