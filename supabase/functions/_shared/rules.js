// Shared game rules: blocks, items, tool tiers, recipes.
// Loaded by the game (<script>) and by tools/rules.mjs, which derives supabase/rules.sql from it for server-side arbitration.
// Block and item ids: only ever add, never renumber.
(function (root) {
  'use strict';
  const PASTELS = [
    ['pink', '#ffb8d9'],
    ['lavender', '#c9b8ff'],
    ['mint', '#aeeccb'],
    ['sky', '#b3dcff'],
    ['peach', '#ffcfae'],
    ['lemon', '#fff0a0'],
    ['coral', '#ff9f9a'],
    ['white', '#f4f2fa'],
  ];
  const STAINED = [
    ['pink', '#ffb8d9'],
    ['sky', '#b3dcff'],
    ['mint', '#aeeccb'],
    ['lavender', '#c9b8ff'],
  ];
  // ---------- blocks and items (every item is a token) ----------
  const B = {
    1: { n: 'Grass', t: [0, 1, 2], h: 0.6 }, // picked up as grass, to be placed again (it used to drop dirt)
    2: { n: 'Dirt', t: [2, 2, 2], h: 0.6 },
    3: { n: 'Granite', t: [3, 3, 3], h: 2, stone: 1 },
    4: { n: 'Sand', t: [4, 4, 4], h: 0.5 },
    5: { n: 'Wood', t: [6, 5, 6], h: 1.4 },
    6: { n: 'Leaves', t: [7, 7, 7], h: 0.25, leaf: 1 }, // leaves are picked up and placed again (they used to vanish)
    7: { n: 'Pink Leaves', t: [8, 8, 8], h: 0.25, leaf: 1 },
    8: { n: 'Ether Ore', t: [9, 9, 9], h: 2.6, stone: 1, drop: 101 },
    9: { n: 'Planks', t: [10, 10, 10], h: 1.1 },
    10: { n: 'Glass', t: [11, 11, 11], h: 0.5, glass: 1 },
    11: { n: 'Water', water: 1 },
    12: { n: 'Bedrock', t: [12, 12, 12], h: Infinity },
    13: { n: 'Validator', t: [14, 13, 14], h: 2.5, stone: 1 },
    14: { n: 'Lantern', t: [15, 15, 15], h: 0.5 },
    15: { n: 'Marble', t: [16, 16, 16], h: 2.2, stone: 1 },
    16: { n: 'Snow', t: [17, 18, 3], h: 0.5 },
    17: { n: 'Pink Flower', x: 19, h: 0.05 },
    18: { n: 'Golden Flower', x: 20, h: 0.05 },
    19: { n: 'Blue Flower', x: 21, h: 0.05 },
    20: { n: 'Tall Grass', x: 22, h: 0.05, drop: 0 },
  };
  const ITEM = {
    101: { n: 'Ether Crystal', icon: 24 },
    102: { n: 'Wooden Pickaxe', icon: 25, tool: 2.2 },
    201: { n: 'Crystal Pickaxe', icon: 26, tool: 5, nft: 1 },
  };
  // v2: blocks added onward (never renumber). Orientation/state variants = consecutive ids.
  PASTELS.forEach(
    ([n], i) => (B[21 + i] = { n: n[0].toUpperCase() + n.slice(1) + ' Concrete', t: [27 + i, 27 + i, 27 + i], h: 1.2, stone: 1 }),
  );
  STAINED.forEach(
    ([n], i) => (B[29 + i] = { n: n[0].toUpperCase() + n.slice(1) + ' Stained Glass', t: [35 + i, 35 + i, 35 + i], h: 0.5, glass: 1 }),
  );
  [
    ['Plank', 10, 1.1, 0],
    ['Marble', 16, 2.2, 1],
    ['Granite', 3, 2, 1],
  ].forEach(([n, t, h, st], i) => {
    B[33 + i] = { n: n + ' Slab', t: [t, t, t], h: h * 0.6, stone: st, shape: 'slab' };
    for (let o = 0; o < 4; o++) B[36 + i * 4 + o] = { n: n + ' Stairs', t: [t, t, t], h, stone: st, shape: 'stairs', o, drop: 36 + i * 4 };
  });
  for (let f = 0; f < 4; f++)
    for (let op = 0; op < 2; op++)
      for (let top = 0; top < 2; top++)
        B[48 + f * 4 + op * 2 + top] = {
          n: 'Door',
          t: [10, top ? 40 : 39, 10],
          h: 0.9,
          shape: 'door',
          f,
          open: op,
          top,
          drop: 48,
          icon: 52,
        };
  B[64] = { n: 'Lever', t: [3, 3, 3], h: 0.3, shape: 'lever', on: 0, drop: 64, icon: 50, pass: 1 };
  B[65] = { ...B[64], on: 1 };
  B[66] = { n: 'Pressure Plate', t: [16, 16, 16], h: 0.5, shape: 'plate', icon: 51, pass: 1 };
  B[67] = { n: 'Ether Cable', t: [43, 43, 43], h: 0.1, shape: 'cable', icon: 43, pass: 1 };
  B[68] = { n: 'Lamp', t: [45, 45, 45], h: 0.5 };
  B[69] = { n: 'Geode', t: [47, 47, 47], h: 3, stone: 1, drop: 103 };
  B[70] = { n: 'Pure Ether Block', t: [49, 49, 49], h: 2.4, stone: 1 };
  B[71] = { n: 'Ether Wool', t: [53, 53, 53], h: 0.5 };
  ITEM[103] = { n: 'Pure Shard', icon: 48 };
  // v3: tool-tier progression (0 bare hand, 1 wood, 2 crystal, 3 pure ether)
  B[72] = { n: 'Genesis Rock', t: [60, 60, 60], h: 5, stone: 1, tier: 3, drop: 104 };
  B[73] = { n: 'Dark Validator', t: [55, 54, 55], h: Infinity };
  B[74] = { n: 'Old Validator', t: [14, 13, 14], h: Infinity };
  B[69].tier = 2;
  B[70].tier = 2;
  ITEM[104] = { n: 'Genesis Fragment', icon: 56 };
  ITEM[105] = { n: 'Validator Heart', icon: 57 };
  ITEM[102].tier = 1;
  ITEM[201].tier = 2;
  ITEM[202] = { n: 'Pure Ether Pickaxe', icon: 58, tool: 8, tier: 3, nft: 1 };
  ITEM[203] = { n: 'Validator Seal', icon: 59, nft: 1 };
  // v9: weapons (ids 106-107; 101-105 and 201-203 are the other items)
  ITEM[106] = { n: 'Volt Blade', icon: 121, dmg: 2.5, tier: 1 };
  ITEM[107] = { n: 'Pure Ether Blade', icon: 122, dmg: 5, tier: 2 };
  // v10: armor (ids 108-109), worn independently of the held item
  ITEM[108] = { n: 'Volt Plating', icon: 123, armor: 0.25, tier: 1 };
  ITEM[109] = { n: 'Pure Ether Plating', icon: 124, armor: 0.45, tier: 2 };
  // v11: the network's capstone — a trophy for crossing a relit-validator milestone (never crafted, only
  // minted by _core_relight), and a shard that starts dropping from relights once the network is fully awake
  ITEM[204] = { n: 'Validator Star', icon: 129, nft: 1 };
  ITEM[110] = { n: 'Diamond Shard', icon: 128 };
  B[145] = { n: 'Radiant Diamond', t: [130, 130, 130], h: 1, glass: 1 };
  // v21: furniture and signs (034_signs.sql). Shape "furn": the block is drawn and collides as its own
  // little boxes (src/mesh.js), "bt" gives each box its own texture. Facing pieces ("faces") come in four
  // consecutive ids like stairs, picked from where you look, so a chair's seat or a sign's face turns to
  // you. Block ids stop at 200: items use 201 and up.
  // a box turned a quarter to the left, as many times as o (o: 0 = you looked north, toward -z)
  const turn = (bb, o) => {
    let [x0, y0, z0, x1, y1, z1] = bb;
    for (let k = 0; k < o; k++) [x0, z0, x1, z1] = [z0, 1 - x1, z1, 1 - x0];
    return [x0, y0, z0, x1, y1, z1];
  };
  const PLANK = [10, 10, 10];
  const CHAIR = [
    [0.16, 0, 0.16, 0.26, 0.45, 0.26],
    [0.74, 0, 0.16, 0.84, 0.45, 0.26],
    [0.16, 0, 0.74, 0.26, 0.45, 0.84],
    [0.74, 0, 0.74, 0.84, 0.45, 0.84],
    [0.12, 0.45, 0.12, 0.88, 0.55, 0.88],
    [0.12, 0.55, 0.12, 0.88, 1, 0.22],
  ];
  const SOFA = [
    [0, 0, 0.08, 1, 0.42, 0.92],
    [0, 0.42, 0.08, 1, 0.95, 0.3],
    [0, 0.42, 0.3, 0.14, 0.68, 0.92],
    [0.86, 0.42, 0.3, 1, 0.68, 0.92],
  ];
  const SIGN = [
    [0.45, 0, 0.45, 0.55, 0.5, 0.55],
    [0.04, 0.46, 0.44, 0.96, 1, 0.56],
  ];
  for (let o = 0; o < 4; o++) {
    B[146 + o] = { n: 'Chair', t: PLANK, h: 0.6, shape: 'furn', faces: 1, o, drop: 146, icon: 147, boxes: CHAIR.map(b => turn(b, o)) };
    B[150 + o] = {
      n: 'Lavender Sofa',
      t: [28, 28, 28],
      h: 0.6,
      shape: 'furn',
      faces: 1,
      o,
      drop: 150,
      icon: 148,
      boxes: SOFA.map(b => turn(b, o)),
      bt: [[28, 28, 28], [28, 28, 28], PLANK, PLANK],
    };
    B[160 + o] = {
      n: 'Sign',
      t: PLANK,
      h: 0.5,
      shape: 'furn',
      faces: 1,
      sign: 1,
      o,
      drop: 160,
      icon: 152,
      boxes: SIGN.map(b => turn(b, o)),
    };
  }
  // carpets: a thin layer you walk over, in four of the concrete colors (27 pink, 28 lavender, 29 mint, 30 sky)
  ['Pink', 'Lavender', 'Mint', 'Sky'].forEach((c, i) => {
    B[154 + i] = { n: c + ' Carpet', t: [27 + i, 27 + i, 27 + i], h: 0.1, shape: 'furn', pass: 1, boxes: [[0, 0, 0, 1, 0.06, 1]] };
  });
  // potted plants: a terracotta pot (tile 153) with a leafy bush, or a flower on a stem
  const POT = [0.28, 0, 0.28, 0.72, 0.36, 0.72];
  B[158] = {
    n: 'Potted Plant',
    t: [153, 153, 153],
    h: 0.3,
    shape: 'furn',
    icon: 150,
    boxes: [POT, [0.22, 0.36, 0.22, 0.78, 0.92, 0.78]],
    bt: [
      [153, 153, 153],
      [7, 7, 7],
    ],
  };
  B[159] = {
    n: 'Potted Flower',
    t: [153, 153, 153],
    h: 0.3,
    shape: 'furn',
    icon: 151,
    boxes: [POT, [0.46, 0.36, 0.46, 0.54, 0.72, 0.54], [0.34, 0.68, 0.34, 0.66, 0.9, 0.66]],
    bt: [
      [153, 153, 153],
      [7, 7, 7],
      [27, 27, 27],
    ],
  };
  // paths: blocks to lay a way through the land (recipes in Construction, below): packed earth for a country
  // lane, gravel for a garden walk, cut granite setts for a town street
  B[164] = { n: 'Dirt Path', t: [162, 2, 2], h: 0.6 };
  B[165] = { n: 'Gravel Path', t: [163, 163, 163], h: 0.7 };
  B[166] = { n: 'Paving Stones', t: [164, 164, 164], h: 1.6, stone: 1 };
  // v12: the Genesis Titan's trophy (never crafted, only minted by act_loot_mob on a guaranteed boss kill)
  ITEM[205] = { n: 'Genesis Titan Fang', icon: 131, nft: 1 };
  // v13: towers — a repeatable mid-tier boss (the Plasma Core) guards each one, dropping this on every
  // kill (never crafted, only minted by act_loot_mob, same guaranteed-boss-drop pattern as the Titan
  // Fang). The first ranged weapon: `ranged: 1` is read by src/game/16-mobs.js's fireRanged/updateBolts.
  ITEM[206] = { n: 'Plasma Pistol', icon: 132, dmg: 4, tier: 2, nft: 1, ranged: 1 };
  // v16: a second, rarer bonus trophy per existing boss (026_boss_bonus_trophies.sql), on top of the
  // guaranteed main one — purely a keepsake, same never-traded nft:1 convention, a reason to keep
  // farming a boss beyond the first kill.
  ITEM[207] = { n: 'Titan Core Shard', icon: 133, nft: 1 };
  ITEM[208] = { n: 'Plasma Conduit Core', icon: 134, nft: 1 };
  // v17: the Merge Sanctum's twin bosses (030_merge_twins.sql): the best armor in the game, minted on
  // every win over both twins together, and a rarer keepsake on top (same ~20% bonus as 026)
  ITEM[209] = { n: 'Merge Aegis', icon: 135, armor: 0.6, tier: 3, nft: 1 };
  ITEM[210] = { n: 'Difficulty Bomb Fragment', icon: 136, nft: 1 };
  // v21: the Mempool's boss, the Front-Runner (039_front_runner.sql): boots minted on every win — owned,
  // they make you walk and run a little faster for good (10-loop.js) — and a rarer keepsake on top
  // worn like a plating, in their own slot (S.boots): 12% faster on your feet, and a quick dodge (Q)
  ITEM[211] = { n: 'Front-Runner Boots', icon: 137, nft: 1, boots: 0.12 };
  ITEM[212] = { n: 'Flashbots Bundle', icon: 138, nft: 1 };
  // v22: hovercraft, the Diamond Gliders (src/game/20-hover.js; 040_hovercraft.sql lets their riders go
  // twice as fast). Two models, each built from one kind of crystal, which gives it its colors; the rarer
  // the crystal, the fewer it takes. The Twin Diamond seats a passenger and costs half as much again.
  // Unique items, crafted like the special pickaxes (_core_craft mints them).
  const HOVER_CRYSTALS = [
    [101, 'Ether', 12],
    [103, 'Pure', 6],
    [104, 'Genesis', 4],
    [110, 'Radiant', 3],
  ];
  HOVER_CRYSTALS.forEach(([, name], k) => {
    ITEM[213 + k] = { n: `${name} Twin Diamond`, icon: 154 + k, nft: 1, hover: { model: 'twin', k } };
    ITEM[217 + k] = { n: `${name} Neon Glider`, icon: 158 + k, nft: 1, hover: { model: 'neon', k } };
  });
  const reqTier = id => (B[id] ? (B[id].tier ?? (B[id].stone ? 1 : 0)) : 0);
  const RECIPES = [
    { out: 9, n: 4, need: { 5: 1 }, d: 'Cut up a log' },
    { out: 102, n: 1, need: { 9: 3 }, d: 'Fungible tool · mining x2 · cuts stone' },
    { out: 15, n: 1, need: { 3: 2 }, d: 'Cut granite' },
    { out: 10, n: 1, need: { 4: 2 }, d: 'Melt sand' },
    { out: 14, n: 1, need: { 10: 1, 101: 1 }, d: 'Light for the tunnels' },
    { out: 201, n: 1, need: { 9: 2, 101: 3 }, d: 'Unique item, never traded · mining x5 · opens geodes', nft: 1 },
    { out: 70, n: 1, need: { 103: 4 }, d: 'Pure ether from the depths, glowing' },
    { out: 202, n: 1, need: { 103: 4, 101: 4, 9: 2 }, d: 'Unique item, never traded · mining x8 · cuts genesis rock', nft: 1 },
    { out: 105, n: 1, need: { 104: 1, 103: 2, 101: 4 }, d: 'Relights an old validator (right-click it)' },
  ];
  RECIPES.forEach(r => (r.cat = 'Resources and tools'));
  // construction
  [
    [9, 'Plank'],
    [15, 'Marble'],
    [3, 'Granite'],
  ].forEach(([m], i) => {
    RECIPES.push(
      { out: 33 + i, n: 4, need: { [m]: 2 }, d: 'Half-block', cat: 'Construction' },
      { out: 36 + i * 4, n: 4, need: { [m]: 3 }, d: 'Orients to where you look', cat: 'Construction' },
    );
  });
  RECIPES.push(
    { out: 48, n: 1, need: { 9: 4 }, d: 'Right-click to open', cat: 'Construction' },
    { out: 92, n: 3, need: { 9: 3 }, d: 'Connects to neighboring fences and walls', cat: 'Construction' },
    { out: 93, n: 8, need: { 10: 3 }, d: 'Thin glass, connects to neighboring panes', cat: 'Construction' },
    { out: 94, n: 3, need: { 9: 4 }, d: 'Walk into it to climb', cat: 'Construction' },
    { out: 98, n: 1, need: { 9: 8 }, d: 'Stores your items (right-click) ; shared with your claim guests', cat: 'Construction' },
  );
  // colors: sand and granite tinted by a flower, leaves, or marble
  [[17], [7], [6], [19], [4], [18], [17, 18], [15]].forEach((col, i) => {
    const need = { 4: 2, 3: 1 };
    for (const c of col) need[c] = (need[c] || 0) + 1;
    RECIPES.push({ out: 21 + i, n: 4, need, d: 'Colored concrete', cat: 'Colors' });
  });
  [[17], [19], [6], [7]].forEach(([c], i) =>
    RECIPES.push({ out: 29 + i, n: 2, need: { 10: 2, [c]: 1 }, d: 'Tinted glass', cat: 'Colors' }),
  );
  // circuits
  RECIPES.push(
    { out: 64, n: 1, need: { 9: 1, 3: 1 }, d: 'Source: right-click to flip', cat: 'Circuits' },
    { out: 66, n: 2, need: { 15: 2 }, d: 'Source: activates when stepped on', cat: 'Circuits' },
    { out: 67, n: 8, need: { 101: 1 }, d: 'Carries the signal, block by block', cat: 'Circuits' },
    { out: 68, n: 1, need: { 10: 1, 101: 2 }, d: 'Lights up when powered', cat: 'Circuits' },
    { out: 112, n: 1, need: { 67: 2, 3: 1, 101: 1 }, d: 'Activates ahead of it if both sides are powered', cat: 'Circuits' },
    { out: 116, n: 1, need: { 67: 2, 3: 1, 101: 1 }, d: 'Activates ahead of it if one side or the back is powered', cat: 'Circuits' },
    { out: 120, n: 1, need: { 67: 1, 3: 1, 101: 1 }, d: 'Activates ahead of it as long as the back isn’t', cat: 'Circuits' },
    { out: 111, n: 1, need: { 67: 2, 15: 1, 101: 2 }, d: 'Source that pulses every second', cat: 'Circuits' },
  );
  // weapons
  RECIPES.push(
    { out: 106, n: 1, need: { 9: 3, 101: 2 }, d: 'Energy blade · fight back the mobs', cat: 'Combat' },
    { out: 107, n: 1, need: { 9: 2, 103: 3, 101: 3 }, d: 'Sharper, from pure ether', cat: 'Combat' },
  );
  // armor
  RECIPES.push(
    { out: 108, n: 1, need: { 9: 4, 101: 3 }, d: 'Wear it from your inventory · reduces damage taken', cat: 'Combat' },
    { out: 109, n: 1, need: { 9: 3, 103: 4, 101: 4 }, d: 'Stronger resistance, from pure ether', cat: 'Combat' },
  );
  // v4: nature (generated in the world) and decoration. t = [top, sides, bottom]
  B[75] = { n: 'Ether Mushroom', x: 61, h: 0.05 }; // cave carpet, glowing
  B[76] = { n: 'Reeds', x: 62, h: 0.05 }; // at the water's edge
  B[77] = { n: 'Lily Pad', t: [63, 63, 63], h: 0.05, shape: 'plate', icon: 63, pass: 1 };
  B[78] = { n: 'Mossy Stone', t: [64, 64, 64], h: 2, stone: 1 };
  B[79] = { n: 'Ether Bricks', t: [65, 65, 65], h: 2, stone: 1 };
  B[80] = { n: 'Polished Granite', t: [66, 66, 66], h: 2, stone: 1 };
  B[81] = { n: 'Checkered Marble', t: [67, 67, 67], h: 2.2, stone: 1 };
  B[82] = { n: 'Bookshelf', t: [10, 68, 10], h: 1.1 };
  B[83] = { n: 'Crystal Block', t: [69, 69, 69], h: 1.5, glass: 1 };
  B[84] = { n: 'Pink Lantern', t: [70, 70, 70], h: 0.5 };
  B[85] = { n: 'Mushroom Lantern', t: [71, 71, 71], h: 0.5 };
  B[86] = { n: 'Reed Mat', t: [72, 72, 72], h: 0.6 };
  B[87] = { n: 'Brick Slab', t: [65, 65, 65], h: 1.2, stone: 1, shape: 'slab' };
  for (let o = 0; o < 4; o++) B[88 + o] = { n: 'Brick Stairs', t: [65, 65, 65], h: 2, stone: 1, shape: 'stairs', o, drop: 88 };
  RECIPES.push(
    { out: 79, n: 4, need: { 3: 2, 4: 1 }, d: 'Granite fired with sand', cat: 'Decoration' },
    { out: 87, n: 4, need: { 79: 2 }, d: 'Half-block', cat: 'Decoration' },
    { out: 88, n: 4, need: { 79: 3 }, d: 'Orients to where you look', cat: 'Decoration' },
    { out: 80, n: 4, need: { 3: 4 }, d: 'Cut and smoothed granite', cat: 'Decoration' },
    { out: 81, n: 4, need: { 15: 2, 3: 2 }, d: 'Black-and-white flooring', cat: 'Decoration' },
    { out: 78, n: 2, need: { 3: 2, 76: 1 }, d: 'Granite covered in moss', cat: 'Decoration' },
    { out: 86, n: 2, need: { 76: 4 }, d: 'Woven reeds', cat: 'Decoration' },
    { out: 82, n: 1, need: { 9: 6, 76: 3 }, d: 'Logs bound with reed', cat: 'Decoration' },
    { out: 83, n: 1, need: { 101: 9 }, d: 'Pure crystal, glows softly', cat: 'Decoration' },
    { out: 84, n: 1, need: { 14: 1, 17: 1 }, d: 'Pink light', cat: 'Decoration' },
    { out: 85, n: 1, need: { 10: 1, 75: 2 }, d: 'Blue light of the caves', cat: 'Decoration' },
  );
  // v5: fence, pane, ladder (4 orientations, against the wall you're looking at)
  B[92] = { n: 'Fence', t: [10, 10, 10], h: 1.1, shape: 'fence', icon: 74 };
  B[93] = { n: 'Pane', t: [11, 11, 11], h: 0.3, shape: 'pane', icon: 11 };
  for (let o = 0; o < 4; o++) B[94 + o] = { n: 'Ladder', t: [73, 73, 73], h: 0.5, shape: 'ladder', o, drop: 94, icon: 73, pass: 1 };
  B[98] = { n: 'Chest', t: [75, 76, 75], h: 1.2 }; // contents kept by the server (004_chests.sql)
  // v6: logic gates (4 orientations: output points the way you were facing) and clock.
  // Ids 112 to 123 (AND, OR, NOT x 4 orientations): 101 to 105 are items (crystal, pickaxe...), never blocks.
  // Top tiles: 80 + gate * 8 + orientation * 2 (+1 lit); sides 104/105; clock 106/107.
  ['AND', 'OR', 'NOT'].forEach((g, gi) => {
    for (let o = 0; o < 4; o++) {
      const top = 80 + gi * 8 + o * 2;
      B[112 + gi * 4 + o] = {
        n: g + ' Gate',
        gate: g.toLowerCase(),
        o,
        t: [top, 104, 104],
        tOn: [top + 1, 105, 104],
        h: 0.8,
        drop: 112 + gi * 4,
      };
    }
  });
  B[111] = { n: 'Clock', t: [106, 104, 104], tOn: [107, 105, 104], h: 0.8 };

  // v7: inspired by ethereum.org illustrations. Ids 124 and up (101-105 and 201-203 are items).
  B[124] = { n: 'Palm Trunk', t: [108, 109, 108], h: 1, drop: 5 }; // drops ordinary wood
  B[125] = { n: 'Palm Fronds', t: [110, 110, 110], h: 0.25, leaf: 1 };
  B[126] = { n: 'Amethyst Cluster', x: 111, h: 0.3 }; // deep caves, glowing
  B[127] = { n: 'Marble Column', t: [112, 113, 112], h: 2.2, stone: 1 };
  B[128] = { n: 'Cyan Neon', t: [114, 114, 114], h: 1.2, stone: 1 };
  B[129] = { n: 'Holo Screen', t: [115, 115, 115], h: 0.5, glass: 1 };
  B[130] = { n: 'Diamond Block', t: [116, 116, 116], h: 1, glass: 1 };
  ['Lavender', 'Mint', 'Blue', 'Peach'].forEach((c, i) => (B[131 + i] = { n: c + ' Game Brick', t: [117 + i, 117 + i, 117 + i], h: 1.2 }));
  RECIPES.push(
    { out: 127, n: 2, need: { 15: 3 }, d: 'For halls and gardens', cat: 'Decoration' },
    { out: 128, n: 4, need: { 3: 2, 10: 1, 101: 1 }, d: 'Light strip, like the city at night', cat: 'Decoration' },
    { out: 129, n: 2, need: { 10: 2, 101: 1 }, d: 'Glowing pane that displays code', cat: 'Decoration' },
    { out: 130, n: 1, need: { 10: 1, 101: 4 }, d: 'The Ether Diamond, in glowing glass', cat: 'Decoration' },
    ...[22, 23, 24, 25].map((c, i) => ({
      out: 131 + i,
      n: 4,
      need: { [c]: 2 },
      d: 'Studded brick, for building the diamond',
      cat: 'Decoration',
    })),
  );
  // v8: a room to eat and sleep in
  B[135] = { n: 'Table', t: [10, 10, 10], h: 1, shape: 'table' };
  B[136] = { n: 'Bed', t: [53, 10, 10], h: 0.8, shape: 'slab' }; // superseded by the 2-block bed below (137-144); kept, never reused
  RECIPES.push({ out: 135, n: 1, need: { 9: 4 }, d: 'Right-click to eat: a brief speed boost', cat: 'Decoration' });
  // v10: a proper 2-block bed (foot + head), same multi-block pattern as Door (shape/kind encodes the facing,
  // since rule_blocks has no facing column; head id is always foot id + 4, mirroring door's "+1")
  ['bed0f', 'bed1f', 'bed2f', 'bed3f'].forEach((shape, f) => (B[137 + f] = { n: 'Bed', t: [53, 10, 10], h: 0.8, shape, drop: 137 }));
  ['bed0h', 'bed1h', 'bed2h', 'bed3h'].forEach((shape, f) => (B[141 + f] = { n: 'Bed', t: [53, 10, 10], h: 0.8, shape, drop: 137 }));
  RECIPES.push({ out: 137, n: 1, need: { 9: 2, 71: 2 }, d: 'Right-click to sleep and skip to dawn', cat: 'Decoration' });
  // v11: the network's capstone — a trophy minted by _core_relight for crossing a relit-validator
  // milestone (never crafted), and a shard that starts dropping from relights once fully awake
  RECIPES.push({
    out: 145,
    n: 1,
    need: { 110: 4, 101: 2 },
    d: 'A piece of the great diamond, once the network is fully awake',
    cat: 'Decoration',
  });
  // v20: consumables and the Genesis tier (033_consumables.sql). Item ids 301+: below 200 every number is
  // taken or reserved for blocks (they're appended there), and 201+ are the unique items. A consumable
  // ("use") is spent by right-clicking it in hand (act_use_item); its effect is played client-side.
  // The Genesis gear needs a boss trophy you own ("req", kept, never consumed) on top of its ingredients.
  ITEM[301] = { n: 'Genesis Blade', icon: 140, dmg: 7.5, tier: 2 };
  ITEM[302] = { n: 'Genesis Plating', icon: 141, armor: 0.55, tier: 3 };
  ITEM[303] = { n: 'Ether Tonic', icon: 142, use: 'heal' };
  ITEM[304] = { n: 'Swift Elixir', icon: 143, use: 'speed' };
  ITEM[305] = { n: 'Owl Draught', icon: 144, use: 'vision' };
  ITEM[306] = { n: 'Ward Incense', icon: 145, use: 'ward' };
  ITEM[307] = { n: 'Home Beacon', icon: 146, use: 'home' };
  RECIPES.push(
    { out: 303, n: 2, need: { 75: 2, 101: 1 }, d: 'Drink it: restores 5 hearts', cat: 'Potions' },
    { out: 304, n: 2, need: { 18: 2, 101: 1 }, d: 'Drink it: you run faster for 2 minutes', cat: 'Potions' },
    { out: 305, n: 2, need: { 19: 2, 75: 1 }, d: 'Drink it: you see in the dark for 3 minutes', cat: 'Potions' },
    {
      out: 306,
      n: 1,
      need: { 76: 3, 103: 1 },
      d: 'Burn it: ordinary mobs ignore you for 2 minutes, unless you strike them. Guardians and bosses aren’t fooled',
      cat: 'Potions',
    },
    { out: 307, n: 1, need: { 14: 1, 101: 2 }, d: 'Light it: back to the last bed you slept in', cat: 'Potions' },
    {
      out: 301,
      n: 1,
      need: { 104: 3, 110: 4, 103: 2, 9: 2 },
      req: 205,
      d: 'Forged with the Titan’s own fang: the strongest blade',
      cat: 'Combat',
    },
    {
      out: 302,
      n: 1,
      need: { 104: 4, 110: 4, 103: 4 },
      req: 206,
      d: 'Shaped around the Plasma Core’s pistol: strong genesis-rock plating',
      cat: 'Combat',
    },
  );
  // v21: furniture and signs (see the blocks above)
  RECIPES.push(
    { out: 146, n: 2, need: { 9: 3 }, d: 'Turns to face you as you place it', cat: 'Furniture' },
    { out: 150, n: 1, need: { 9: 2, 71: 3 }, d: 'Soft and lavender, faces you as you place it', cat: 'Furniture' },
    { out: 154, n: 4, need: { 71: 2, 17: 1 }, d: 'A thin rug you walk over', cat: 'Furniture' },
    { out: 155, n: 4, need: { 71: 2, 7: 1 }, d: 'A thin rug you walk over', cat: 'Furniture' },
    { out: 156, n: 4, need: { 71: 2, 6: 1 }, d: 'A thin rug you walk over', cat: 'Furniture' },
    { out: 157, n: 4, need: { 71: 2, 19: 1 }, d: 'A thin rug you walk over', cat: 'Furniture' },
    { out: 158, n: 1, need: { 4: 1, 3: 1, 6: 2 }, d: 'A bush in a terracotta pot', cat: 'Furniture' },
    { out: 159, n: 1, need: { 4: 1, 3: 1, 17: 1 }, d: 'A flower in a terracotta pot', cat: 'Furniture' },
    { out: 160, n: 2, need: { 9: 3 }, d: 'Right-click it to write a line that everyone can read', cat: 'Furniture' },
  );
  // v22: the Diamond Gliders (see ITEM 213-220): the crystal picks the colors, a little neon and marble for the frame
  HOVER_CRYSTALS.forEach(([crystal, , n], k) => {
    RECIPES.push(
      {
        out: 213 + k,
        n: 1,
        need: { [crystal]: Math.ceil(n * 1.5), 128: 4, 15: 2 },
        d: 'Unique hovercraft · right-click to ride: twice as fast, glides over water · a back seat for a friend',
        nft: 1,
        cat: 'Travel',
      },
      {
        out: 217 + k,
        n: 1,
        need: { [crystal]: n, 128: 4, 15: 2 },
        d: 'Unique hovercraft · right-click to ride: twice as fast, glides over water',
        nft: 1,
        cat: 'Travel',
      },
    );
  });
  const TOOLS = { 102: 1, 201: 1, 202: 1 };
  // v14: off-chain pivot. Purely decorative, bought with Gwei (act_buy_cosmetic): never a combat, speed,
  // harvest, or access effect. A separate id space from B/ITEM, so no collision with the append-only
  // block/item numbering. "color" entries just add to the outfit color picker (src/game/14-startup.js);
  // "grantItem"/"grantQty" entries hand over existing decorative-only blocks instead of a bare ownership
  // flag; "character"/"tool"/"validator"/"effect" entries with neither are shown as owned/equippable,
  // ready for a richer visual payoff later (rarity, limited editions, collections).
  // Cosmetics (022_cosmetics.sql, 032_shop.sql for slots, sets and the weekly offer): purely decorative, never
  // a combat, speed, harvest or access effect. "slot" says where a wearable goes (17-looks.js draws it):
  // outfit (body color + pants), head, back, companion (follows you), trail (behind you while moving),
  // tool (glow on the held item), plating (glow on the armor). "set" groups a collection in the shop.
  // "limited" pieces are only sold during their week in the shop's rotation (shopFeatured below).
  // Block packs (grantItem) can be bought again and again; everything else once.
  const COSMETICS = {
    1: { n: 'Ember Outfit', category: 'character', price: 300, slot: 'outfit', color: '#ff6b6b', pants: '#7a2f3a' },
    2: { n: 'Void Outfit', category: 'character', price: 300, slot: 'outfit', color: '#2a1838', pants: '#120a1c' },
    3: { n: 'Aurum Outfit', category: 'character', price: 1200, slot: 'outfit', color: '#ffe9a8', pants: '#b08a2e' },
    4: { n: 'Prism Blockpack', category: 'block', price: 300, grantItem: 130, grantQty: 4 }, // Diamond Block
    5: { n: 'Neon Strip Pack', category: 'block', price: 200, grantItem: 128, grantQty: 8 }, // Cyan Neon
    6: { n: 'Holo Screen Pack', category: 'block', price: 250, grantItem: 129, grantQty: 4 }, // Holo Screen
    7: { n: 'Marble Column Pack', category: 'block', price: 180, grantItem: 127, grantQty: 4 }, // Marble Column
    8: { n: 'Prism Pickaxe Trim', category: 'tool', price: 800, slot: 'tool', style: 'prism' },
    9: {
      n: 'Cobalt Validator Banner',
      category: 'validator',
      price: 600,
      slot: 'back',
      style: 'banner',
      color: '#2f5bff',
      accent: '#9fd0ff',
    },
    10: { n: 'Spectrum Trail', category: 'effect', price: 2500, slot: 'trail', style: 'spectrum' },
    // v15: loot tiers (024_loot_tiers.sql). "combat" cosmetics are never sold (price 0, act_buy_cosmetic
    // refuses them): the epic tier of act_loot_mob grants one directly, so the only way in is a kill.
    11: { n: 'Wraith Ember Trail', category: 'combat', price: 0, slot: 'trail', style: 'ember' },
    12: { n: 'Sentinel Core Banner', category: 'combat', price: 0, slot: 'back', style: 'banner', color: '#1f6b5a', accent: '#9fe3c4' },
    13: { n: 'Deep Golem Plating Trim', category: 'combat', price: 0, slot: 'plating', color: '#b48cff' },
    // v16: the network attack event (027_network_attack.sql). Same never-sold shape as "combat":
    // granted only by defending the Atrium during the hourly window, never bought.
    14: { n: 'Network Defender Banner', category: 'event', price: 0, slot: 'back', style: 'banner', color: '#3a2d52', accent: '#ffd166' },
    // v17: story chapters (029_chapters.sql). Titles are never sold: finishing a chapter grants one
    // (act_claim_chapter), and owning it is what marks the chapter's reward as claimed.
    15: { n: 'Pathfinder', category: 'title', price: 0 },
    16: { n: 'Smith', category: 'title', price: 0 },
    17: { n: 'Awakener', category: 'title', price: 0 },
    18: { n: 'Network Guardian', category: 'title', price: 0 },
    19: { n: 'Circuit Sage', category: 'title', price: 0 },
    20: { n: 'Merge Keeper', category: 'title', price: 0 }, // v18: chapter 5, the Merge (030_merge_twins.sql)
    // v19: wearables (032_shop.sql). Collections follow Ethereum's own history, one per era.
    21: { n: 'Frontier Duster', category: 'character', price: 600, slot: 'outfit', set: 'frontier', color: '#8b5a2b', pants: '#3b2a1a' },
    22: { n: 'Prospector Hat', category: 'head', price: 800, slot: 'head', set: 'frontier', style: 'prospector' },
    // retired (v21): no longer sold; whoever has it keeps it, and sees it in the shop
    23: { n: 'Pioneer Pack', category: 'back', price: 0, retired: 1, slot: 'back', set: 'frontier', style: 'pack' },
    24: {
      n: 'Homestead Overalls',
      category: 'character',
      price: 600,
      slot: 'outfit',
      set: 'homestead',
      color: '#4a6fa5',
      pants: '#2c3e66',
    },
    25: { n: 'Straw Hat', category: 'head', price: 700, slot: 'head', set: 'homestead', style: 'straw' },
    26: { n: 'Miner Helmet', category: 'head', price: 900, slot: 'head', set: 'homestead', style: 'miner' },
    27: { n: 'Staker Jacket', category: 'character', price: 1500, slot: 'outfit', set: 'staker', color: '#1b2a4a', pants: '#0e1626' },
    28: { n: 'Validator Visor', category: 'head', price: 2000, slot: 'head', set: 'staker', style: 'visor' },
    29: {
      n: 'Beacon Wings',
      category: 'back',
      price: 12000,
      slot: 'back',
      set: 'staker',
      style: 'wings',
      color: '#bff4ff',
      accent: '#00eaff',
    },
    30: { n: 'Mini Validator', category: 'companion', price: 6000, slot: 'companion', set: 'staker', style: 'validator' },
    31: { n: 'Merge Suit', category: 'character', price: 2500, slot: 'outfit', set: 'merge', color: '#f4f1ff', pants: '#1a1a22' },
    32: { n: 'Panda Hood', category: 'head', price: 3000, slot: 'head', set: 'merge', style: 'panda' },
    33: { n: 'Proof Cape', category: 'back', price: 4000, slot: 'back', set: 'merge', style: 'cape2' },
    34: { n: 'Merge Panda', category: 'companion', price: 9000, slot: 'companion', set: 'merge', style: 'panda' },
    35: {
      n: 'Blobspace Suit',
      category: 'character',
      price: 3000,
      slot: 'outfit',
      set: 'dencun',
      limited: 1,
      color: '#3fd2c7',
      pants: '#1d5c63',
    },
    36: { n: 'Blob Halo', category: 'head', price: 5000, slot: 'head', set: 'dencun', limited: 1, style: 'halo' },
    37: { n: 'Blob Buddy', category: 'companion', price: 8000, slot: 'companion', set: 'dencun', limited: 1, style: 'blob' },
    38: { n: 'Blob Bubbles', category: 'effect', price: 4000, slot: 'trail', set: 'dencun', limited: 1, style: 'bubbles' },
    39: { n: 'Ether Crown', category: 'head', price: 25000, slot: 'head', set: 'ether', style: 'crown' },
    40: { n: 'Ether Diamond Familiar', category: 'companion', price: 15000, slot: 'companion', set: 'ether', style: 'diamond' },
    41: {
      n: 'Aurora Wings',
      category: 'back',
      price: 20000,
      slot: 'back',
      set: 'ether',
      style: 'wings',
      color: '#ff9ab8',
      accent: '#7fe8ff',
    },
    42: { n: 'Builder Beanie', category: 'head', price: 250, slot: 'head', style: 'beanie' },
    43: { n: 'Gwei Sparks', category: 'effect', price: 1500, slot: 'trail', style: 'gwei' },
    44: { n: 'Golden Pickaxe Trim', category: 'tool', price: 3000, slot: 'tool', style: 'gold' },
    45: { n: 'Lavender Outfit', category: 'character', price: 300, slot: 'outfit', color: '#b6a4ff', pants: '#4a3a8a' },
    // v20: two variants of each plain outfit, with details sewn on (detail: 17-looks.js OUTFIT_DETAIL), sold
    // in the shop beside it. Same colors as the plain one.
    46: { n: 'Forge Apron', category: 'character', price: 600, slot: 'outfit', color: '#ff6b6b', pants: '#7a2f3a', detail: '1A' },
    47: { n: 'Ember Coat', category: 'character', price: 600, slot: 'outfit', color: '#ff6b6b', pants: '#2a1012', detail: '1B' },
    48: { n: 'Starfield Outfit', category: 'character', price: 600, slot: 'outfit', color: '#2a1838', pants: '#120a1c', detail: '2A' },
    49: { n: 'Void Mantle', category: 'character', price: 600, slot: 'outfit', color: '#2a1838', pants: '#120a1c', detail: '2B' },
    50: { n: 'Royal Aurum', category: 'character', price: 2400, slot: 'outfit', color: '#ffe9a8', pants: '#b08a2e', detail: '3A' },
    51: { n: 'Gilded Plate', category: 'character', price: 2400, slot: 'outfit', color: '#ffe9a8', pants: '#b08a2e', detail: '3B' },
    52: {
      n: 'Long Duster',
      category: 'character',
      price: 1200,
      slot: 'outfit',
      set: 'frontier',
      color: '#8b5a2b',
      pants: '#3b2a1a',
      detail: '21A',
    },
    53: {
      n: 'Frontier Poncho',
      category: 'character',
      price: 1200,
      slot: 'outfit',
      set: 'frontier',
      color: '#8b5a2b',
      pants: '#3b2a1a',
      detail: '21B',
    },
    54: {
      n: 'Plaid Overalls',
      category: 'character',
      price: 1200,
      slot: 'outfit',
      set: 'homestead',
      color: '#4a6fa5',
      pants: '#2c3e66',
      detail: '24A',
    },
    55: {
      n: 'Mechanic Overalls',
      category: 'character',
      price: 1200,
      slot: 'outfit',
      set: 'homestead',
      color: '#4a6fa5',
      pants: '#2c3e66',
      detail: '24B',
    },
    56: {
      n: 'Validator Suit',
      category: 'character',
      price: 3000,
      slot: 'outfit',
      set: 'staker',
      color: '#1b2a4a',
      pants: '#0e1626',
      detail: '27A',
    },
    57: {
      n: 'Staker Bomber',
      category: 'character',
      price: 3000,
      slot: 'outfit',
      set: 'staker',
      color: '#1b2a4a',
      pants: '#0e1626',
      detail: '27B',
    },
    58: {
      n: 'Merge Halves',
      category: 'character',
      price: 5000,
      slot: 'outfit',
      set: 'merge',
      color: '#f4f1ff',
      pants: '#1a1a22',
      detail: '31A',
    },
    59: {
      n: 'Panda Suit',
      category: 'character',
      price: 5000,
      slot: 'outfit',
      set: 'merge',
      color: '#f4f1ff',
      pants: '#1a1a22',
      detail: '31B',
    },
    60: {
      n: 'Bubble Suit',
      category: 'character',
      price: 6000,
      slot: 'outfit',
      set: 'dencun',
      limited: 1,
      color: '#3fd2c7',
      pants: '#1d5c63',
      detail: '35A',
    },
    61: {
      n: 'Blob Dive Suit',
      category: 'character',
      price: 6000,
      slot: 'outfit',
      set: 'dencun',
      limited: 1,
      color: '#3fd2c7',
      pants: '#1d5c63',
      detail: '35B',
    },
    62: { n: 'Lavender Hoodie', category: 'character', price: 600, slot: 'outfit', color: '#b6a4ff', pants: '#4a3a8a', detail: '45A' },
    63: { n: 'Lavender Knit', category: 'character', price: 600, slot: 'outfit', color: '#b6a4ff', pants: '#4a3a8a', detail: '45B' },
    // v21: variants of the headwear, the Proof Cape and the companions, sold beside the original
    64: { n: 'Sheriff Hat', category: 'head', price: 800, slot: 'head', set: 'frontier', style: 'sheriff' },
    65: { n: 'Gambler Hat', category: 'head', price: 800, slot: 'head', set: 'frontier', style: 'gambler' },
    66: { n: 'Crystal Miner Helmet', category: 'head', price: 900, slot: 'head', set: 'homestead', style: 'crystalminer' },
    67: { n: 'Gold Visor', category: 'head', price: 2000, slot: 'head', set: 'staker', style: 'goldvisor' },
    68: { n: 'Red Panda Hood', category: 'head', price: 3000, slot: 'head', set: 'merge', style: 'redpanda' },
    69: { n: 'Polar Hood', category: 'head', price: 3000, slot: 'head', set: 'merge', style: 'polar' },
    70: { n: 'Prism Halo', category: 'head', price: 5000, slot: 'head', set: 'dencun', limited: 1, style: 'prismhalo' },
    71: { n: 'Silver Crown', category: 'head', price: 25000, slot: 'head', set: 'ether', style: 'silvercrown' },
    72: { n: 'Ether Beanie', category: 'head', price: 250, slot: 'head', style: 'etherbeanie' },
    73: { n: 'Long Pom Beanie', category: 'head', price: 250, slot: 'head', style: 'pombeanie' },
    74: { n: 'Royal Cape', category: 'back', price: 4000, slot: 'back', set: 'merge', style: 'royalcape' },
    75: { n: 'Circuit Cape', category: 'back', price: 4000, slot: 'back', set: 'merge', style: 'circuitcape' },
    76: { n: 'Golden Validator', category: 'companion', price: 6000, slot: 'companion', set: 'staker', style: 'goldvalidator' },
    77: { n: 'Legendary Validator', category: 'companion', price: 6000, slot: 'companion', set: 'staker', style: 'legendvalidator' },
    78: { n: 'Red Panda Buddy', category: 'companion', price: 9000, slot: 'companion', set: 'merge', style: 'redpanda' },
    79: { n: 'Bamboo Panda', category: 'companion', price: 9000, slot: 'companion', set: 'merge', style: 'bamboopanda' },
    80: { n: 'Pink Blob', category: 'companion', price: 8000, slot: 'companion', set: 'dencun', limited: 1, style: 'pinkblob' },
    81: { n: 'Galaxy Blob', category: 'companion', price: 8000, slot: 'companion', set: 'dencun', limited: 1, style: 'galaxyblob' },
    82: { n: 'Golden Familiar', category: 'companion', price: 15000, slot: 'companion', set: 'ether', style: 'golddiamond' },
    83: { n: 'Twin Familiars', category: 'companion', price: 15000, slot: 'companion', set: 'ether', style: 'twindiamond' },
    // v21: the Pioneer Pack's successors
    84: { n: 'Validator Rig', category: 'back', price: 1000, slot: 'back', set: 'frontier', style: 'rig' },
    85: { n: 'Crystal Satchel', category: 'back', price: 1000, slot: 'back', set: 'frontier', style: 'satchel' },
    86: { n: 'Rocket Pack', category: 'back', price: 1000, slot: 'back', set: 'frontier', style: 'rocket' },
    87: { n: 'Treasure Pack', category: 'back', price: 1000, slot: 'back', set: 'frontier', style: 'treasure' },
    // v21: the last variants. Wings, trails and pickaxe trims in the shop; trophies only won by playing:
    // combat ones join the mobs' epic drops (024_loot_tiers.sql), the event one the network attack's
    88: {
      n: 'Ember Wings',
      category: 'back',
      price: 12000,
      slot: 'back',
      set: 'staker',
      style: 'wings',
      color: '#ffc070',
      accent: '#ffef9a',
    },
    89: { n: 'Crystal Wings', category: 'back', price: 12000, slot: 'back', set: 'staker', style: 'crystalwings' },
    90: {
      n: 'Solar Wings',
      category: 'back',
      price: 20000,
      slot: 'back',
      set: 'ether',
      style: 'wings',
      color: '#fff4c2',
      accent: '#ffd166',
    },
    91: { n: 'Pastel Spectrum Trail', category: 'effect', price: 2500, slot: 'trail', style: 'pastel' },
    92: { n: 'Neon Spectrum Trail', category: 'effect', price: 2500, slot: 'trail', style: 'neon' },
    93: { n: 'Silver Sparks', category: 'effect', price: 1500, slot: 'trail', style: 'silver' },
    94: { n: 'Coin Rain', category: 'effect', price: 1500, slot: 'trail', style: 'coins' },
    95: { n: 'Pink Bubbles', category: 'effect', price: 4000, slot: 'trail', set: 'dencun', limited: 1, style: 'pinkbubbles' },
    96: { n: 'Deep Sea Bubbles', category: 'effect', price: 4000, slot: 'trail', set: 'dencun', limited: 1, style: 'deepbubbles' },
    97: { n: 'Rose Gold Pickaxe Trim', category: 'tool', price: 1500, slot: 'tool', style: 'rose' },
    98: { n: 'Obsidian Pickaxe Trim', category: 'tool', price: 1500, slot: 'tool', style: 'obsidian' },
    99: { n: 'Frost Pickaxe Trim', category: 'tool', price: 1500, slot: 'tool', style: 'frost' },
    100: { n: 'Emerald Pickaxe Trim', category: 'tool', price: 1500, slot: 'tool', style: 'emerald' },
    101: {
      n: 'Sentinel Prime Banner',
      category: 'combat',
      price: 0,
      slot: 'back',
      style: 'banner',
      prime: 1,
      color: '#0f4a3e',
      accent: '#7fffd0',
    },
    102: {
      n: 'Atrium Guardian Banner',
      category: 'event',
      price: 0,
      slot: 'back',
      style: 'banner',
      prime: 1,
      color: '#6a1f2e',
      accent: '#ffd166',
    },
    103: { n: 'Wraith Frost Trail', category: 'combat', price: 0, slot: 'trail', style: 'frost' },
    104: { n: 'Wraith Shadow Trail', category: 'combat', price: 0, slot: 'trail', style: 'shadow' },
    105: { n: 'Magma Plating Trim', category: 'combat', price: 0, slot: 'plating', color: '#ff7a2e' },
    106: { n: 'Moss Plating Trim', category: 'combat', price: 0, slot: 'plating', color: '#7fe08a' },
    // Premium: the pieces sold for euros (eur, in cents), never for Gwei (price 0: act_buy_cosmetic refuses
    // them). Each sold in one currency only. The first collection answers the Merge twins: Proof-of-Work, the
    // miners' forge (iron, embers, fire), and Proof-of-Stake, the validators' crystal (white, violet, light)
    107: {
      n: 'Forge Rig',
      category: 'premium',
      price: 0,
      eur: 499,
      slot: 'outfit',
      set: 'pow',
      color: '#3a2a2a',
      pants: '#1c1414',
      detail: '107A',
    },
    108: { n: 'Hashrate Helm', category: 'premium', price: 0, eur: 299, slot: 'head', set: 'pow', style: 'hashhelm' },
    109: { n: 'Ember Wings', category: 'premium', price: 0, eur: 499, slot: 'back', set: 'pow', style: 'emberwings' },
    110: { n: 'Forge Sparks', category: 'premium', price: 0, eur: 199, slot: 'trail', set: 'pow', style: 'forge' },
    111: { n: 'Forge Blade Trim', category: 'premium', price: 0, eur: 299, slot: 'tool', set: 'pow', style: 'forge' },
    112: {
      n: 'Validator Robe',
      category: 'premium',
      price: 0,
      eur: 499,
      slot: 'outfit',
      set: 'pos',
      color: '#f4f1ff',
      pants: '#6a50d8',
      detail: '112A',
    },
    113: { n: 'Staking Halo', category: 'premium', price: 0, eur: 299, slot: 'head', set: 'pos', style: 'stakehalo' },
    114: { n: 'Beacon Wings', category: 'premium', price: 0, eur: 499, slot: 'back', set: 'pos', style: 'beaconwings' },
    115: { n: 'Stake Light', category: 'premium', price: 0, eur: 199, slot: 'trail', set: 'pos', style: 'stake' },
    116: { n: 'Stake Blade Trim', category: 'premium', price: 0, eur: 299, slot: 'tool', set: 'pos', style: 'stake' },
  };
  // the collections, in shop order: name and a line of history
  const SETS = {
    frontier: ['Frontier', 'July 2015: the first release, a network for the brave'],
    homestead: ['Homestead', '2016: the first stable release, home on the chain'],
    staker: ['Staker', 'The Beacon Chain: validators keep the network honest'],
    merge: ['The Merge', 'September 2022: proof of work hands over to proof of stake'],
    dencun: ['Dencun', 'March 2024: blobs arrive. Limited: one piece a week in the shop'],
    ether: ['Ether', 'The rarest pieces, for the most patient'],
    pow: ['Proof-of-Work', "The miners' forge: iron, embers and fire. Premium"],
    pos: ['Proof-of-Stake', "The validators' crystal: white, violet and light. Premium"],
  };
  // The shop's week: Monday 00:00 UTC to the next. Each week, 3 regular wearables are 25% off and one
  // limited piece is for sale. 032_shop.sql computes exactly the same picks: change both together.
  const SHOP_EPOCH = 345600; // 1970-01-05, a Monday
  const shopWeek = (t = Date.now() / 1000) => Math.floor((t - SHOP_EPOCH) / 604800);
  const forSale = c => !['combat', 'event', 'title'].includes(c.category) && c.price > 0;
  function shopFeatured(week = shopWeek()) {
    const ids = Object.keys(COSMETICS)
        .map(Number)
        .sort((a, b) => a - b),
      reg = ids.filter(id => forSale(COSMETICS[id]) && !COSMETICS[id].limited && !COSMETICS[id].grantItem),
      lim = ids.filter(id => COSMETICS[id].limited),
      n = reg.length;
    return {
      sale: n ? [0, 1, 2].map(k => reg[(week * 3 + k) % n]) : [],
      limited: lim.length ? lim[week % lim.length] : null,
    };
  }
  // the paths (B 164-166)
  RECIPES.push(
    { out: 164, n: 2, need: { 2: 2 }, d: 'Packed earth, for a country lane', cat: 'Construction' },
    { out: 165, n: 4, need: { 3: 1, 4: 2 }, d: 'Crushed granite and sand, for a garden walk', cat: 'Construction' },
    { out: 166, n: 4, need: { 3: 3 }, d: 'Cut granite setts, for a town street', cat: 'Construction' },
  );
  // what a cosmetic costs this week (25% off when on sale; integer division, like the SQL)
  const shopPrice = (id, week = shopWeek()) => {
    const c = COSMETICS[id];
    return shopFeatured(week).sale.includes(+id) ? Math.floor((c.price * 3) / 4) : c.price;
  };
  // what a placed item becomes: block with the same id, except stairs (4 orientations) and doors (4 orientations, 2 halves)
  function placeIds(it) {
    it = +it;
    if (!B[it]) return [];
    const b = B[it];
    if (b.shape === 'stairs' || b.shape === 'ladder' || b.gate || b.faces) {
      const base = b.drop ?? it; // the 4 orientations start from the first one
      return [base, base + 1, base + 2, base + 3];
    }
    if (b.shape === 'door') return [48, 52, 56, 60];
    if (b.shape === 'bed0f') return [137, 138, 139, 140]; // only the foot is directly placeable; the head follows server-side
    return [it];
  }
  root.Rules = { PASTELS, STAINED, B, ITEM, RECIPES, reqTier, placeIds, COSMETICS, SETS, shopWeek, shopFeatured, shopPrice, forSale };
})(globalThis);
