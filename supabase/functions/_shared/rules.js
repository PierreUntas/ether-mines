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
    1: { n: 'Grass', t: [0, 1, 2], h: 0.6, drop: 2 },
    2: { n: 'Dirt', t: [2, 2, 2], h: 0.6 },
    3: { n: 'Granite', t: [3, 3, 3], h: 2, stone: 1 },
    4: { n: 'Sand', t: [4, 4, 4], h: 0.5 },
    5: { n: 'Wood', t: [6, 5, 6], h: 1.4 },
    6: { n: 'Leaves', t: [7, 7, 7], h: 0.25, leaf: 1, drop: 0 },
    7: { n: 'Pink Leaves', t: [8, 8, 8], h: 0.25, leaf: 1, drop: 0 },
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
  const reqTier = id => (B[id] ? (B[id].tier ?? (B[id].stone ? 1 : 0)) : 0);
  const RECIPES = [
    { out: 9, n: 4, need: { 5: 1 }, d: 'Cut up a log' },
    { out: 102, n: 1, need: { 9: 3 }, d: 'Fungible tool · mining x2 · cuts stone' },
    { out: 15, n: 1, need: { 3: 2 }, d: 'Cut granite' },
    { out: 10, n: 1, need: { 4: 2 }, d: 'Melt sand' },
    { out: 14, n: 1, need: { 10: 1, 101: 1 }, d: 'Light for the tunnels' },
    { out: 201, n: 1, need: { 9: 2, 101: 3 }, d: 'Unique item (ERC-721) · mining x5 · opens geodes', nft: 1 },
    { out: 13, n: 1, need: { 101: 8, 15: 4 }, d: 'Mints a crystal every 5 minutes' },
    { out: 70, n: 1, need: { 103: 4 }, d: 'Pure ether from the depths, glowing' },
    { out: 202, n: 1, need: { 103: 4, 101: 4, 9: 2 }, d: 'Unique item (ERC-721) · mining x8 · cuts genesis rock', nft: 1 },
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
  B[125] = { n: 'Palm Fronds', t: [110, 110, 110], h: 0.25, leaf: 1, drop: 0 };
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
  const TOOLS = { 102: 1, 201: 1, 202: 1 };
  // what a placed item becomes: block with the same id, except stairs (4 orientations) and doors (4 orientations, 2 halves)
  function placeIds(it) {
    it = +it;
    if (!B[it]) return [];
    const b = B[it];
    if (b.shape === 'stairs' || b.shape === 'ladder' || b.gate) {
      const base = b.drop ?? it; // the 4 orientations start from the first one
      return [base, base + 1, base + 2, base + 3];
    }
    if (b.shape === 'door') return [48, 52, 56, 60];
    if (b.shape === 'bed0f') return [137, 138, 139, 140]; // only the foot is directly placeable; the head follows server-side
    return [it];
  }
  root.Rules = { PASTELS, STAINED, B, ITEM, RECIPES, reqTier, placeIds };
})(globalThis);
