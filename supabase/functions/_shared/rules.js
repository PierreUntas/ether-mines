// Règles du jeu partagées : blocs, objets, paliers d'outils, recettes.
// Chargé par le jeu (<script>) et par tools/regles.mjs, qui en tire supabase/regles.sql pour l'arbitrage côté serveur.
// Identifiants de blocs et d'objets : seulement en ajouter, ne jamais renuméroter.
(function (root) {
  'use strict';
  const PASTELS = [
    ['rose', '#ffb8d9'],
    ['lavande', '#c9b8ff'],
    ['menthe', '#aeeccb'],
    ['ciel', '#b3dcff'],
    ['pêche', '#ffcfae'],
    ['citron', '#fff0a0'],
    ['corail', '#ff9f9a'],
    ['blanc', '#f4f2fa'],
  ];
  const VITRAUX = [
    ['rose', '#ffb8d9'],
    ['ciel', '#b3dcff'],
    ['menthe', '#aeeccb'],
    ['lavande', '#c9b8ff'],
  ];
  // ---------- blocs et objets (chaque objet = un jeton) ----------
  const B = {
    1: { n: 'Herbe', t: [0, 1, 2], h: 0.6, drop: 2 },
    2: { n: 'Terre', t: [2, 2, 2], h: 0.6 },
    3: { n: 'Granite', t: [3, 3, 3], h: 2, stone: 1 },
    4: { n: 'Sable', t: [4, 4, 4], h: 0.5 },
    5: { n: 'Bois', t: [6, 5, 6], h: 1.4 },
    6: { n: 'Feuilles', t: [7, 7, 7], h: 0.25, leaf: 1, drop: 0 },
    7: { n: 'Feuilles roses', t: [8, 8, 8], h: 0.25, leaf: 1, drop: 0 },
    8: { n: "Minerai d'éther", t: [9, 9, 9], h: 2.6, stone: 1, drop: 101 },
    9: { n: 'Planches', t: [10, 10, 10], h: 1.1 },
    10: { n: 'Verre', t: [11, 11, 11], h: 0.5, glass: 1 },
    11: { n: 'Eau', water: 1 },
    12: { n: 'Socle', t: [12, 12, 12], h: Infinity },
    13: { n: 'Validateur', t: [14, 13, 14], h: 2.5, stone: 1 },
    14: { n: 'Lanterne', t: [15, 15, 15], h: 0.5 },
    15: { n: 'Marbre', t: [16, 16, 16], h: 2.2, stone: 1 },
    16: { n: 'Neige', t: [17, 18, 3], h: 0.5 },
    17: { n: 'Fleur rose', x: 19, h: 0.05 },
    18: { n: 'Fleur dorée', x: 20, h: 0.05 },
    19: { n: 'Fleur bleue', x: 21, h: 0.05 },
    20: { n: 'Herbes hautes', x: 22, h: 0.05, drop: 0 },
  };
  const ITEM = {
    101: { n: "Cristal d'éther", icon: 24 },
    102: { n: 'Pioche en bois', icon: 25, tool: 2.2 },
    201: { n: 'Pioche de cristal', icon: 26, tool: 5, nft: 1 },
  };
  // v2 : blocs ajoutés à la suite (ne jamais renuméroter). Variantes d'orientation et d'état = identifiants consécutifs.
  PASTELS.forEach(([n], i) => (B[21 + i] = { n: 'Béton ' + n, t: [27 + i, 27 + i, 27 + i], h: 1.2, stone: 1 }));
  VITRAUX.forEach(([n], i) => (B[29 + i] = { n: 'Vitrail ' + n, t: [35 + i, 35 + i, 35 + i], h: 0.5, glass: 1 }));
  [
    ['planches', 10, 1.1, 0],
    ['marbre', 16, 2.2, 1],
    ['granite', 3, 2, 1],
  ].forEach(([n, t, h, st], i) => {
    B[33 + i] = { n: 'Dalle de ' + n, t: [t, t, t], h: h * 0.6, stone: st, shape: 'slab' };
    for (let o = 0; o < 4; o++)
      B[36 + i * 4 + o] = { n: 'Escalier de ' + n, t: [t, t, t], h, stone: st, shape: 'stairs', o, drop: 36 + i * 4 };
  });
  for (let f = 0; f < 4; f++)
    for (let op = 0; op < 2; op++)
      for (let top = 0; top < 2; top++)
        B[48 + f * 4 + op * 2 + top] = {
          n: 'Porte',
          t: [10, top ? 40 : 39, 10],
          h: 0.9,
          shape: 'door',
          f,
          open: op,
          top,
          drop: 48,
          icon: 52,
        };
  B[64] = { n: 'Levier', t: [3, 3, 3], h: 0.3, shape: 'lever', on: 0, drop: 64, icon: 50, pass: 1 };
  B[65] = { ...B[64], on: 1 };
  B[66] = { n: 'Plaque de pression', t: [16, 16, 16], h: 0.5, shape: 'plate', icon: 51, pass: 1 };
  B[67] = { n: "Câble d'éther", t: [43, 43, 43], h: 0.1, shape: 'cable', icon: 43, pass: 1 };
  B[68] = { n: 'Lampe', t: [45, 45, 45], h: 0.5 };
  B[69] = { n: 'Géode', t: [47, 47, 47], h: 3, stone: 1, drop: 103 };
  B[70] = { n: "Bloc d'éther pur", t: [49, 49, 49], h: 2.4, stone: 1 };
  B[71] = { n: "Laine d'éther", t: [53, 53, 53], h: 0.5 };
  ITEM[103] = { n: 'Éclat pur', icon: 48 };
  // v3 : progression par paliers d'outils (0 main nue, 1 bois, 2 cristal, 3 éther pur)
  B[72] = { n: 'Roche de genèse', t: [60, 60, 60], h: 5, stone: 1, tier: 3, drop: 104 };
  B[73] = { n: 'Validateur éteint', t: [55, 54, 55], h: Infinity };
  B[74] = { n: 'Validateur ancien', t: [14, 13, 14], h: Infinity };
  B[69].tier = 2;
  B[70].tier = 2;
  ITEM[104] = { n: 'Fragment de genèse', icon: 56 };
  ITEM[105] = { n: 'Cœur de validateur', icon: 57 };
  ITEM[102].tier = 1;
  ITEM[201].tier = 2;
  ITEM[202] = { n: "Pioche d'éther pur", icon: 58, tool: 8, tier: 3, nft: 1 };
  ITEM[203] = { n: 'Sceau de validateur', icon: 59, nft: 1 };
  const reqTier = id => (B[id] ? (B[id].tier ?? (B[id].stone ? 1 : 0)) : 0);
  const RECIPES = [
    { out: 9, n: 4, need: { 5: 1 }, d: 'Débiter une bûche' },
    { out: 102, n: 1, need: { 9: 3 }, d: 'Outil fongible · minage ×2 · taille la pierre' },
    { out: 15, n: 1, need: { 3: 2 }, d: 'Tailler le granite' },
    { out: 10, n: 1, need: { 4: 2 }, d: 'Fondre le sable' },
    { out: 14, n: 1, need: { 10: 1, 101: 1 }, d: 'Lumière pour les galeries' },
    { out: 201, n: 1, need: { 9: 2, 101: 3 }, d: 'Objet unique (ERC-721) · minage ×5 · ouvre les géodes', nft: 1 },
    { out: 13, n: 1, need: { 101: 8, 15: 4 }, d: 'Frappe un cristal toutes les 5 minutes' },
    { out: 70, n: 1, need: { 103: 4 }, d: 'Éther pur des profondeurs, lumineux' },
    { out: 202, n: 1, need: { 103: 4, 101: 4, 9: 2 }, d: 'Objet unique (ERC-721) · minage ×8 · taille la roche de genèse', nft: 1 },
    { out: 105, n: 1, need: { 104: 1, 103: 2, 101: 4 }, d: 'Rallume un validateur ancien (clic droit dessus)' },
  ];
  RECIPES.forEach(r => (r.cat = 'Ressources et outils'));
  // construction
  [
    [9, 'planches'],
    [15, 'marbre'],
    [3, 'granite'],
  ].forEach(([m], i) => {
    RECIPES.push(
      { out: 33 + i, n: 4, need: { [m]: 2 }, d: 'Demi-bloc', cat: 'Construction' },
      { out: 36 + i * 4, n: 4, need: { [m]: 3 }, d: "S'oriente selon ton regard", cat: 'Construction' },
    );
  });
  RECIPES.push(
    { out: 48, n: 1, need: { 9: 4 }, d: 'Clic droit pour ouvrir', cat: 'Construction' },
    { out: 92, n: 3, need: { 9: 3 }, d: 'Se relie aux barrières et aux murs voisins', cat: 'Construction' },
    { out: 93, n: 8, need: { 10: 3 }, d: 'Verre fin, se relie aux vitres voisines', cat: 'Construction' },
    { out: 94, n: 3, need: { 9: 4 }, d: 'Avance contre elle pour grimper', cat: 'Construction' },
    { out: 98, n: 1, need: { 9: 8 }, d: 'Range tes objets (clic droit) ; partagée avec les invités de ta parcelle', cat: 'Construction' },
  );
  // couleurs : sable et granite teintés par une fleur, des feuilles ou du marbre
  [[17], [7], [6], [19], [4], [18], [17, 18], [15]].forEach((col, i) => {
    const need = { 4: 2, 3: 1 };
    for (const c of col) need[c] = (need[c] || 0) + 1;
    RECIPES.push({ out: 21 + i, n: 4, need, d: 'Béton coloré', cat: 'Couleurs' });
  });
  [[17], [19], [6], [7]].forEach(([c], i) =>
    RECIPES.push({ out: 29 + i, n: 2, need: { 10: 2, [c]: 1 }, d: 'Verre teinté', cat: 'Couleurs' }),
  );
  // contrats
  RECIPES.push(
    { out: 64, n: 1, need: { 9: 1, 3: 1 }, d: 'Source : clic droit pour basculer', cat: 'Contrats' },
    { out: 66, n: 2, need: { 15: 2 }, d: 'Source : active quand on marche dessus', cat: 'Contrats' },
    { out: 67, n: 8, need: { 101: 1 }, d: 'Transmet le signal, bloc après bloc', cat: 'Contrats' },
    { out: 68, n: 1, need: { 10: 1, 101: 2 }, d: "S'allume quand elle est alimentée", cat: 'Contrats' },
    { out: 112, n: 1, need: { 67: 2, 3: 1, 101: 1 }, d: 'Active devant elle si ses deux côtés sont alimentés', cat: 'Contrats' },
    { out: 116, n: 1, need: { 67: 2, 3: 1, 101: 1 }, d: 'Active devant elle si un côté ou l’arrière est alimenté', cat: 'Contrats' },
    { out: 120, n: 1, need: { 67: 1, 3: 1, 101: 1 }, d: 'Active devant elle tant que l’arrière ne l’est pas', cat: 'Contrats' },
    { out: 111, n: 1, need: { 67: 2, 15: 1, 101: 2 }, d: 'Source qui bat chaque seconde', cat: 'Contrats' },
  );
  // v4 : nature (générée dans le monde) et décoration. t = [dessus, côtés, dessous]
  B[75] = { n: "Champignon d'éther", x: 61, h: 0.05 }; // tapis des grottes, lumineux
  B[76] = { n: 'Roseaux', x: 62, h: 0.05 }; // au bord de l'eau
  B[77] = { n: 'Nénuphar', t: [63, 63, 63], h: 0.05, shape: 'plate', icon: 63, pass: 1 };
  B[78] = { n: 'Pierre moussue', t: [64, 64, 64], h: 2, stone: 1 };
  B[79] = { n: "Briques d'éther", t: [65, 65, 65], h: 2, stone: 1 };
  B[80] = { n: 'Granite poli', t: [66, 66, 66], h: 2, stone: 1 };
  B[81] = { n: 'Marbre en damier', t: [67, 67, 67], h: 2.2, stone: 1 };
  B[82] = { n: 'Bibliothèque', t: [10, 68, 10], h: 1.1 };
  B[83] = { n: 'Bloc de cristal', t: [69, 69, 69], h: 1.5, glass: 1 };
  B[84] = { n: 'Lanterne rose', t: [70, 70, 70], h: 0.5 };
  B[85] = { n: 'Lanterne champignon', t: [71, 71, 71], h: 0.5 };
  B[86] = { n: 'Natte de roseaux', t: [72, 72, 72], h: 0.6 };
  B[87] = { n: 'Dalle de briques', t: [65, 65, 65], h: 1.2, stone: 1, shape: 'slab' };
  for (let o = 0; o < 4; o++) B[88 + o] = { n: 'Escalier de briques', t: [65, 65, 65], h: 2, stone: 1, shape: 'stairs', o, drop: 88 };
  RECIPES.push(
    { out: 79, n: 4, need: { 3: 2, 4: 1 }, d: 'Granite cuit avec du sable', cat: 'Décoration' },
    { out: 87, n: 4, need: { 79: 2 }, d: 'Demi-bloc', cat: 'Décoration' },
    { out: 88, n: 4, need: { 79: 3 }, d: "S'oriente selon ton regard", cat: 'Décoration' },
    { out: 80, n: 4, need: { 3: 4 }, d: 'Granite taillé et lissé', cat: 'Décoration' },
    { out: 81, n: 4, need: { 15: 2, 3: 2 }, d: 'Dallage noir et blanc', cat: 'Décoration' },
    { out: 78, n: 2, need: { 3: 2, 76: 1 }, d: 'Granite couvert de mousse', cat: 'Décoration' },
    { out: 86, n: 2, need: { 76: 4 }, d: 'Roseaux tressés', cat: 'Décoration' },
    { out: 82, n: 1, need: { 9: 6, 76: 3 }, d: 'Des registres reliés en roseau', cat: 'Décoration' },
    { out: 83, n: 1, need: { 101: 9 }, d: 'Cristal pur, brille doucement', cat: 'Décoration' },
    { out: 84, n: 1, need: { 14: 1, 17: 1 }, d: 'Lumière rose', cat: 'Décoration' },
    { out: 85, n: 1, need: { 10: 1, 75: 2 }, d: 'Lumière bleue des grottes', cat: 'Décoration' },
  );
  // v5 : barrière, vitre, échelle (4 orientations, contre le mur qu'on regarde)
  B[92] = { n: 'Barrière', t: [10, 10, 10], h: 1.1, shape: 'fence', icon: 74 };
  B[93] = { n: 'Vitre', t: [11, 11, 11], h: 0.3, shape: 'pane', icon: 11 };
  for (let o = 0; o < 4; o++) B[94 + o] = { n: 'Échelle', t: [73, 73, 73], h: 0.5, shape: 'ladder', o, drop: 94, icon: 73, pass: 1 };
  B[98] = { n: 'Malle', t: [75, 76, 75], h: 1.2 }; // contenu gardé par le serveur (005_coffres.sql)
  // v6 : portes logiques (4 orientations : la sortie part dans la direction du regard) et horloge.
  // Numéros 112 à 123 (ET, OU, NON × 4 orientations) : 101 à 105 sont des objets (cristal, pioche…), jamais des blocs.
  // Elles ont d'abord porté les numéros 99 à 110 : 006_renumerotation.sql et migrateSave() convertissent.
  // Tuiles du dessus : 80 + porte * 8 + orientation * 2 (+1 allumée) ; côtés 104/105 ; horloge 106/107.
  ['ET', 'OU', 'NON'].forEach((g, gi) => {
    for (let o = 0; o < 4; o++) {
      const top = 80 + gi * 8 + o * 2;
      B[112 + gi * 4 + o] = {
        n: 'Porte ' + g,
        gate: g.toLowerCase(),
        o,
        t: [top, 104, 104],
        tOn: [top + 1, 105, 104],
        h: 0.8,
        drop: 112 + gi * 4,
      };
    }
  });
  B[111] = { n: 'Horloge', t: [106, 104, 104], tOn: [107, 105, 104], h: 0.8 };

  // v7 : inspirés des illustrations d'ethereum.org. Numéros 124 et plus (101–105 et 201–203 sont des objets).
  B[124] = { n: 'Tronc de palmier', t: [108, 109, 108], h: 1, drop: 5 }; // donne du bois ordinaire
  B[125] = { n: 'Palmes', t: [110, 110, 110], h: 0.25, leaf: 1, drop: 0 };
  B[126] = { n: "Amas d'améthyste", x: 111, h: 0.3 }; // grottes profondes, lumineux
  B[127] = { n: 'Colonne de marbre', t: [112, 113, 112], h: 2.2, stone: 1 };
  B[128] = { n: 'Néon cyan', t: [114, 114, 114], h: 1.2, stone: 1 };
  B[129] = { n: 'Écran holographique', t: [115, 115, 115], h: 0.5, glass: 1 };
  B[130] = { n: 'Bloc diamant', t: [116, 116, 116], h: 1, glass: 1 };
  ['lavande', 'menthe', 'bleue', 'pêche'].forEach(
    (c, i) => (B[131 + i] = { n: 'Brique de jeu ' + c, t: [117 + i, 117 + i, 117 + i], h: 1.2 }),
  );
  RECIPES.push(
    { out: 127, n: 2, need: { 15: 3 }, d: 'Pour les halls et les jardins', cat: 'Décoration' },
    { out: 128, n: 4, need: { 3: 2, 10: 1, 101: 1 }, d: 'Bande lumineuse, comme la ville la nuit', cat: 'Décoration' },
    { out: 129, n: 2, need: { 10: 2, 101: 1 }, d: 'Vitre lumineuse qui affiche du code', cat: 'Décoration' },
    { out: 130, n: 1, need: { 10: 1, 101: 4 }, d: "Le diamant d'Éther, en verre lumineux", cat: 'Décoration' },
    ...[22, 23, 24, 25].map((c, i) => ({
      out: 131 + i,
      n: 4,
      need: { [c]: 2 },
      d: 'Brique à picots, pour bâtir le diamant',
      cat: 'Décoration',
    })),
  );
  // v8 : une pièce pour manger et dormir
  B[135] = { n: 'Table', t: [10, 10, 10], h: 1, shape: 'slab' };
  B[136] = { n: 'Lit', t: [53, 10, 10], h: 0.8, shape: 'slab' };
  RECIPES.push(
    { out: 135, n: 1, need: { 9: 4 }, d: 'Clic droit pour manger : vitesse accrue un moment', cat: 'Décoration' },
    { out: 136, n: 1, need: { 9: 2, 71: 2 }, d: 'Clic droit pour dormir et passer à l’aube', cat: 'Décoration' },
  );
  const TOOLS = { 102: 1, 201: 1, 202: 1 };
  // ce que devient un objet posé : bloc de même numéro, sauf escaliers (4 orientations) et portes (4 orientations, 2 moitiés)
  function placeIds(it) {
    it = +it;
    if (!B[it]) return [];
    const b = B[it];
    if (b.shape === 'stairs' || b.shape === 'ladder' || b.gate) {
      const base = b.drop ?? it; // les 4 orientations partent de la première
      return [base, base + 1, base + 2, base + 3];
    }
    if (b.shape === 'door') return [48, 52, 56, 60];
    return [it];
  }
  root.Rules = { PASTELS, VITRAUX, B, ITEM, RECIPES, reqTier, placeIds };
})(globalThis);
