// Ether Mines · Hostile mobs: rift shadows and rift bats in the deep caves, corrupted guardians and
// rust crawlers at the ruins, geode sentinels and geode golems guarding pure ether geodes, genesis
// wraiths guarding genesis rock, the Genesis Titan — a single boss with a fixed home, far from
// spawn, near bedrock — tower wardens and the Plasma Core, garden guardians watching over the Ether
// Gardens, sky raiders on the floating islands, water lurkers in deep ocean, and night prowlers
// that only come out on the open surface after dark.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- hostile mobs ----------
// Simulated client-side, like the animals (09-animals.js): position derived from the seed, so every
// player sees the same mobs in the same place without any network traffic. Combat is resolved locally
// by each client: no loot, no penalty on death — nothing to arbitrate server-side, like the quest
// objectives. Each mob guards something: a guardian disappears for good once the validator it guards
// is relit; sentinels and wraiths simply mark their deposit as dangerous to mine.
// what each mob is (MK), where they stand, who they're after and how they move: src/mobs-core.js, shared
// with the game server, which runs them itself when it can (see "the game server's mobs" below)
const { MK, FLYERS, MOB_R, TWIN_DOWN, LADDER_CLEAR, DAY_WATCH, RESPAWN_S, BOSS_CX, BOSS_CZ } = MobsCore;
// the world as the shared mob logic reads it
const MOB_W = { get: (x, y, z) => get(x, y, z), isSolid: id => isSolid(id), isCross: id => isCross(id) };
const MOBS = new Map();
// the same test as the climbing physics (10-loop.js): a ladder at the feet or at the head
const playerOnLadder = () => [0, 1].some(d => B[get(Math.floor(P.x), Math.floor(P.y + 0.2 + d), Math.floor(P.z))]?.shape === 'ladder');
function buildMob(a) {
  const g = new THREE.Group(),
    parts = { legs: [] };
  if (a.type === 'shadow') {
    const dark = '#241c42',
      glow = '#ff6a81';
    abox(g, 0.5, 0.9, 0.5, dark, 0, 0.6, 0, true, 0.82);
    abox(g, 0.56, 0.3, 0.56, dark, 0, 1.05, 0, true, 0.7);
    const hd = (parts.head = pivot(g, 0, 1.15, 0));
    abox(hd, 0.05, 0.05, 0.02, glow, -0.1, 0, 0.26, true);
    abox(hd, 0.05, 0.05, 0.02, glow, 0.1, 0, 0.26, true);
  } else if (a.type === 'guardian' || a.type === 'garden_guardian' || a.type === 'corrupted_node') {
    // reuses the validator robot's silhouette (09-animals.js): corrupted tones (rust and red cracks)
    // for a guardian, a cyan tech palette for a tower warden, a mossy green one for a garden
    // guardian, an alarm-red one for a corrupted node (027_network_attack.sql) — same geometry
    // throughout, different material
    const body =
        a.type === 'warden' ? '#1c3a4a' : a.type === 'garden_guardian' ? '#2f4a28' : a.type === 'corrupted_node' ? '#4a1a28' : '#5a4a5e',
      head =
        a.type === 'warden' ? '#13242e' : a.type === 'garden_guardian' ? '#1d2f18' : a.type === 'corrupted_node' ? '#2e0f18' : '#3d3448',
      crack =
        a.type === 'warden' ? '#5fe8ff' : a.type === 'garden_guardian' ? '#8bff6a' : a.type === 'corrupted_node' ? '#ff3b4a' : '#ff5a6a';
    abox(g, 0.72, 0.62, 0.5, body, 0, 1.12, 0);
    abox(g, 0.5, 0.42, 0.06, '#453a52', 0, 1.12, 0.26);
    abox(g, 0.2, 0.14, 0.04, crack, 0.12, 1.0, 0.3, true);
    const hd = (parts.head = pivot(g, 0, 1.52, 0));
    abox(hd, 0.32, 0.22, 0.28, head, 0, 0.1, 0);
    abox(hd, 0.09, 0.09, 0.04, crack, -0.08, 0.12, 0.15, true);
    abox(hd, 0.09, 0.09, 0.04, crack, 0.08, 0.12, 0.15, true);
    for (const x of [-0.44, 0.44]) {
      const arm = pivot(g, x, 1.3, 0);
      abox(arm, 0.14, 0.5, 0.14, head, 0, -0.25, 0);
      abox(arm, 0.16, 0.14, 0.16, body, 0, -0.52, 0);
    }
    for (const x of [-0.16, 0.16]) {
      const l = pivot(g, x, 0.82, 0);
      abox(l, 0.16, 0.5, 0.16, head, 0, -0.25, 0);
      abox(l, 0.2, 0.3, 0.22, body, 0, -0.6, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'sentinel') {
    // cluster of jagged crystal shards around a dark core, floats like a shadow (no legs)
    const dark = '#2a1248',
      crystal = '#9a7bef',
      light = '#efe2ff';
    abox(g, 0.4, 0.4, 0.4, dark, 0, 0.9, 0, true, 0.85);
    for (const [dx, dz, h, w] of [
      [0, 0, 0.9, 0.16],
      [0.26, 0.1, 0.55, 0.12],
      [-0.24, -0.08, 0.6, 0.12],
      [0.1, -0.26, 0.45, 0.1],
      [-0.14, 0.24, 0.5, 0.1],
    ]) {
      abox(g, w, h, w, crystal, dx, 0.9 + h / 2, dz, true, 0.78);
      abox(g, w * 0.5, h * 0.25, w * 0.5, light, dx, 0.9 + h, dz, true);
    }
  } else if (a.type === 'warden') {
    // tower warden: a tall, slender sentry knight in the tower's own palette (marble white armor, cyan
    // neon), a crested helm with a glowing visor slit, a tower shield on one arm and a halberd in the
    // other — nothing like the squat ruin robots
    const plate = '#e9e4f5',
      dark = '#2a2448',
      neon = '#5fe8ff';
    abox(g, 0.56, 0.7, 0.36, plate, 0, 1.35, 0);
    abox(g, 0.06, 0.6, 0.04, neon, 0, 1.35, 0.19, true);
    abox(g, 0.62, 0.14, 0.4, dark, 0, 1.0, 0);
    const hd = (parts.head = pivot(g, 0, 1.78, 0));
    abox(hd, 0.32, 0.36, 0.32, plate, 0, 0.12, 0);
    abox(hd, 0.26, 0.05, 0.04, neon, 0, 0.14, 0.17, true);
    abox(hd, 0.06, 0.16, 0.36, neon, 0, 0.38, 0, true);
    const shieldArm = pivot(g, -0.38, 1.6, 0);
    abox(shieldArm, 0.14, 0.5, 0.16, dark, 0, -0.25, 0);
    abox(shieldArm, 0.08, 0.9, 0.56, plate, -0.12, -0.45, 0.12);
    abox(shieldArm, 0.04, 0.6, 0.06, neon, -0.17, -0.45, 0.12, true);
    const halberdArm = pivot(g, 0.38, 1.6, 0);
    abox(halberdArm, 0.14, 0.5, 0.16, dark, 0, -0.25, 0);
    abox(halberdArm, 0.06, 2.0, 0.06, dark, 0.06, 0.1, 0.18);
    abox(halberdArm, 0.04, 0.34, 0.26, neon, 0.06, 1.05, 0.28, true);
    for (const x of [-0.14, 0.14]) {
      const l = pivot(g, x, 1.0, 0);
      abox(l, 0.16, 0.6, 0.18, dark, 0, -0.3, 0);
      abox(l, 0.2, 0.32, 0.24, plate, 0, -0.78, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'titan') {
    // the Genesis Titan: a hunched colossus of genesis rock — a massive back and shoulders, its head
    // sunk between them with two gold eyes, a gold core burning in its chest, a crown of rock spikes,
    // long arms ending in fists that almost drag on the ground
    const rock = '#5e4f80',
      deep = '#3a2d52',
      gold = '#ffe066';
    abox(g, 1.3, 1.0, 0.9, rock, 0, 1.55, -0.05);
    abox(g, 1.0, 0.6, 0.8, deep, 0, 0.95, 0);
    abox(g, 0.36, 0.36, 0.08, gold, 0, 1.5, 0.43, true);
    abox(g, 0.12, 0.5, 0.06, gold, 0.36, 1.7, 0.42, true);
    for (const [x, h] of [
      [-0.45, 0.4],
      [-0.15, 0.55],
      [0.15, 0.5],
      [0.45, 0.38],
    ])
      abox(g, 0.18, h, 0.18, rock, x, 2.05 + h / 2, -0.25);
    const hd = (parts.head = pivot(g, 0, 1.85, 0.42));
    abox(hd, 0.42, 0.3, 0.3, deep, 0, 0, 0);
    abox(hd, 0.1, 0.07, 0.04, gold, -0.11, 0.02, 0.16, true);
    abox(hd, 0.1, 0.07, 0.04, gold, 0.11, 0.02, 0.16, true);
    for (const x of [-0.8, 0.8]) {
      const arm = pivot(g, x, 1.85, 0);
      abox(arm, 0.32, 1.1, 0.32, rock, 0, -0.55, 0);
      abox(arm, 0.44, 0.4, 0.44, deep, 0, -1.25, 0.04);
      abox(arm, 0.08, 0.5, 0.3, gold, x > 0 ? 0.13 : -0.13, -0.6, 0, true);
    }
    for (const x of [-0.3, 0.3]) {
      const l = pivot(g, x, 0.7, 0);
      abox(l, 0.36, 0.7, 0.4, deep, 0, -0.35, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'plasma_core') {
    // the Plasma Core: not a creature but a machine heart floating over the tower's loggia — a rounded
    // core of magenta plasma inside a dark armored cage, three rings of plates spinning around it
    const plasma = '#ff5bff',
      hot = '#ffc2ff',
      shell = '#241a44';
    for (const [w, h] of [
      [0.9, 0.5],
      [0.7, 0.9],
      [0.5, 1.1],
    ])
      abox(g, w, h, w, plasma, 0, 1.2, 0, true, 0.9);
    abox(g, 0.36, 0.36, 0.36, hot, 0, 1.2, 0, true);
    for (const [x, z] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ])
      abox(g, 0.12, 1.3, 0.12, shell, x, 1.2, z);
    abox(g, 1.1, 0.12, 1.1, shell, 0, 0.55, 0);
    abox(g, 1.1, 0.12, 1.1, shell, 0, 1.85, 0);
    parts.head = pivot(g, 0, 1.2, 0);
    parts.rings = [];
    for (let k = 0; k < 3; k++) {
      const ring = pivot(g, 0, 1.2, 0);
      ring.rotation.x = (k * Math.PI) / 3;
      for (let i = 0; i < 6; i++) {
        const an = (i * Math.PI) / 3;
        abox(ring, 0.2, 0.08, 0.2, i % 2 ? plasma : shell, Math.cos(an) * 1.0, 0, Math.sin(an) * 1.0, i % 2 === 1);
      }
      parts.rings.push(ring);
    }
  } else if (a.type === 'turret') {
    // tower turret: a squat pylon bolted to the floor, a head that turns to track you, a cyan lens that
    // swells as it charges a shot (updateMobs) — the first enemy that hits from a distance
    const base = '#2a2448',
      plate = '#e9e4f5',
      neon = '#5fe8ff';
    abox(g, 0.7, 0.2, 0.7, base, 0, 0.1, 0);
    abox(g, 0.34, 0.6, 0.34, plate, 0, 0.5, 0);
    abox(g, 0.4, 0.06, 0.4, neon, 0, 0.62, 0, true);
    const hd = (parts.head = pivot(g, 0, 0.95, 0));
    abox(hd, 0.5, 0.32, 0.5, base, 0, 0, 0);
    abox(hd, 0.16, 0.16, 0.4, plate, 0, 0, 0.36);
    parts.lens = abox(hd, 0.12, 0.12, 0.06, neon, 0, 0, 0.58, true);
  } else if (a.type === 'wraith') {
    // bigger, ancient version of the corrupted guardian, made of the rock it guards: basalt with ember cracks
    const body = '#3a2d52',
      head = '#4a3b68',
      panel = '#241a3c',
      crack = '#ffb347';
    abox(g, 0.86, 0.74, 0.6, body, 0, 1.3, 0);
    abox(g, 0.6, 0.5, 0.07, panel, 0, 1.3, 0.31);
    abox(g, 0.3, 0.2, 0.06, crack, 0.13, 1.18, 0.35, true);
    abox(g, 0.14, 0.3, 0.06, crack, -0.2, 1.1, 0.35, true);
    const hd = (parts.head = pivot(g, 0, 1.78, 0));
    abox(hd, 0.38, 0.26, 0.33, head, 0, 0.1, 0);
    abox(hd, 0.12, 0.12, 0.06, crack, -0.1, 0.12, 0.17, true);
    abox(hd, 0.12, 0.12, 0.06, crack, 0.1, 0.12, 0.17, true);
    for (const x of [-0.52, 0.52]) {
      const arm = pivot(g, x, 1.52, 0);
      abox(arm, 0.17, 0.6, 0.17, head, 0, -0.3, 0);
      abox(arm, 0.19, 0.17, 0.19, body, 0, -0.62, 0);
      abox(arm, 0.06, 0.2, 0.18, crack, 0, -0.25, 0, true);
    }
    for (const x of [-0.19, 0.19]) {
      const l = pivot(g, x, 0.96, 0);
      abox(l, 0.19, 0.6, 0.19, head, 0, -0.3, 0);
      abox(l, 0.24, 0.36, 0.26, body, 0, -0.72, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'prowler') {
    // a low, four-legged stalker — only out at night (syncNightProwler), so it needs real legs and
    // a walk cycle, unlike the floating shadow it otherwise shares a vibe with
    const hide = '#2e1f38',
      dark = '#1a1024',
      glow = '#ff8a3d';
    abox(g, 0.5, 0.34, 0.86, hide, 0, 0.42, 0);
    abox(g, 0.3, 0.26, 0.3, dark, 0, 0.5, 0.42);
    const hd = (parts.head = pivot(g, 0, 0.56, 0.68));
    abox(hd, 0.26, 0.2, 0.3, dark, 0, 0, 0.1);
    abox(hd, 0.05, 0.05, 0.02, glow, -0.08, 0.02, 0.26, true);
    abox(hd, 0.05, 0.05, 0.02, glow, 0.08, 0.02, 0.26, true);
    for (const [x, z] of [
      [-0.2, 0.3],
      [0.2, 0.3],
      [-0.2, -0.3],
      [0.2, -0.3],
    ]) {
      const l = pivot(g, x, 0.34, z);
      abox(l, 0.1, 0.34, 0.1, dark, 0, -0.17, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'sky_raider') {
    // a flying creature over the islands: body + a pair of wings, no legs — flaps instead (updateMobs)
    const body = '#3a0f2e',
      wing = '#6a1540',
      glow = '#ff4d8a';
    abox(g, 0.4, 0.3, 0.6, body, 0, 0, 0, true, 0.7);
    const hd = (parts.head = pivot(g, 0, 0.05, 0.32));
    abox(hd, 0.22, 0.2, 0.22, body, 0, 0, 0, true);
    abox(hd, 0.05, 0.05, 0.02, glow, -0.07, 0, 0.1, true);
    abox(hd, 0.05, 0.05, 0.02, glow, 0.07, 0, 0.1, true);
    parts.wings = [];
    for (const side of [-1, 1]) {
      const w = pivot(g, side * 0.22, 0.05, -0.05);
      abox(w, 0.5, 0.06, 0.3, wing, side * 0.25, 0, 0, true, 0.75);
      parts.wings.push(w);
    }
  } else if (a.type === 'bat') {
    // small and quick: a body, a pair of veiny wings (flaps like the sky raider, updateMobs), glowing eyes
    const body = '#1c1420',
      wing = '#3a2440',
      glow = '#ff3b3b';
    abox(g, 0.22, 0.2, 0.3, body, 0, 0, 0, true, 0.7);
    const hd = (parts.head = pivot(g, 0, 0.02, 0.17));
    abox(hd, 0.14, 0.12, 0.14, body, 0, 0, 0, true);
    abox(hd, 0.03, 0.03, 0.02, glow, -0.05, 0, 0.06, true);
    abox(hd, 0.03, 0.03, 0.02, glow, 0.05, 0, 0.06, true);
    parts.wings = [];
    for (const side of [-1, 1]) {
      const w = pivot(g, side * 0.12, 0.03, 0);
      abox(w, 0.34, 0.03, 0.22, wing, side * 0.17, 0, 0, true, 0.7);
      parts.wings.push(w);
    }
  } else if (a.type === 'crawler') {
    // low six-legged construct, patrols ruins — legs animate for free via the generic walk cycle
    const shell = '#3a1414',
      joint = '#1c0a0a',
      glow = '#ff8a3d';
    abox(g, 0.4, 0.22, 0.7, shell, 0, 0.26, 0, true, 0.75);
    const hd = (parts.head = pivot(g, 0, 0.3, 0.4));
    abox(hd, 0.2, 0.16, 0.2, shell, 0, 0, 0, true);
    abox(hd, 0.04, 0.04, 0.02, glow, -0.07, 0, 0.1, true);
    abox(hd, 0.04, 0.04, 0.02, glow, 0.07, 0, 0.1, true);
    for (const [x, z] of [
      [-0.26, 0.26],
      [0.26, 0.26],
      [-0.3, 0],
      [0.3, 0],
      [-0.26, -0.26],
      [0.26, -0.26],
    ]) {
      const l = pivot(g, x, 0.26, z);
      abox(l, 0.08, 0.26, 0.08, joint, 0, -0.13, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'golem') {
    // a bulky, slow tank guarding geodes alongside the sentinel: one thick stone block of a body,
    // a crystal core glowing through a crack, stubby legs
    const stone = '#2e2a38',
      core = '#9a7bef',
      light = '#efe2ff';
    abox(g, 0.9, 1.0, 0.7, stone, 0, 1.1, 0);
    abox(g, 0.3, 0.5, 0.1, core, 0, 1.15, 0.36, true, 0.85);
    abox(g, 0.14, 0.2, 0.06, light, 0, 1.3, 0.4, true);
    const hd = (parts.head = pivot(g, 0, 1.75, 0));
    abox(hd, 0.4, 0.3, 0.38, stone, 0, 0.1, 0);
    abox(hd, 0.08, 0.08, 0.05, core, -0.1, 0.12, 0.2, true);
    abox(hd, 0.08, 0.08, 0.05, core, 0.1, 0.12, 0.2, true);
    for (const x of [-0.56, 0.56]) {
      const arm = pivot(g, x, 1.4, 0);
      abox(arm, 0.22, 0.7, 0.22, stone, 0, -0.35, 0);
    }
    for (const x of [-0.26, 0.26]) {
      const l = pivot(g, x, 0.6, 0);
      abox(l, 0.3, 0.6, 0.3, stone, 0, -0.3, 0);
      parts.legs.push(l);
    }
  } else if (a.type === 'water_lurker') {
    // a serpentine swimmer: long body, a jointed tail that wags instead of legs (updateMobs)
    const dark = '#0c2630',
      scale = '#123948',
      glow = '#2dffea';
    abox(g, 0.42, 0.42, 1.3, dark, 0, 0.4, 0, true, 0.75);
    const hd = (parts.head = pivot(g, 0, 0.42, 0.68));
    abox(hd, 0.3, 0.3, 0.34, dark, 0, 0, 0, true);
    abox(hd, 0.05, 0.05, 0.02, glow, -0.09, 0.03, 0.17, true);
    abox(hd, 0.05, 0.05, 0.02, glow, 0.09, 0.03, 0.17, true);
    parts.tail = pivot(g, 0, 0.4, -0.75);
    abox(parts.tail, 0.22, 0.22, 0.5, scale, 0, 0, -0.2, true, 0.7);
  } else if (a.type === 'pow_twin') {
    // a hulking mining rig: an iron furnace body with a glowing grate, a smokestack, a drill for an arm
    const iron = '#3a2a2a',
      dark = '#21161a',
      fire = '#ff8a3d',
      ember = '#ffd166';
    abox(g, 0.9, 0.8, 0.7, iron, 0, 1.3, 0);
    abox(g, 0.56, 0.4, 0.06, dark, 0, 1.25, 0.36);
    for (const y of [1.14, 1.26, 1.38]) abox(g, 0.48, 0.05, 0.07, fire, 0, y, 0.37, true);
    abox(g, 0.16, 0.5, 0.16, dark, 0.28, 1.95, -0.2);
    abox(g, 0.1, 0.06, 0.1, ember, 0.28, 2.22, -0.2, true);
    const hd = (parts.head = pivot(g, 0, 1.78, 0.05));
    abox(hd, 0.36, 0.22, 0.3, dark, 0, 0.08, 0);
    abox(hd, 0.26, 0.06, 0.04, fire, 0, 0.1, 0.16, true);
    const drill = pivot(g, 0.58, 1.5, 0);
    abox(drill, 0.2, 0.5, 0.2, iron, 0, -0.25, 0);
    for (let i = 0; i < 4; i++) abox(drill, 0.22 - i * 0.05, 0.1, 0.22 - i * 0.05, i % 2 ? ember : '#8a7f86', 0, -0.55 - i * 0.1, 0);
    const claw = pivot(g, -0.58, 1.5, 0);
    abox(claw, 0.2, 0.6, 0.2, iron, 0, -0.3, 0);
    parts.drill = drill;
    for (const x of [-0.22, 0.22]) {
      const l = pivot(g, x, 0.92, 0);
      abox(l, 0.24, 0.6, 0.26, dark, 0, -0.3, 0);
      abox(l, 0.28, 0.3, 0.32, iron, 0, -0.66, 0.02);
      parts.legs.push(l);
    }
  } else if (a.type === 'pos_twin') {
    // a floating proof-of-stake crystal: a tall lavender shard, a white core, four staked cubes orbiting it
    const lav = '#c9b8ff',
      deep = '#8a7bef',
      core = '#f4f1ff';
    abox(g, 0.5, 1.1, 0.5, lav, 0, 0.9, 0, true, 0.85);
    abox(g, 0.34, 0.4, 0.34, deep, 0, 1.6, 0, true, 0.9);
    abox(g, 0.2, 0.3, 0.2, core, 0, 1.92, 0, true);
    abox(g, 0.3, 0.3, 0.3, deep, 0, 0.25, 0, true, 0.9);
    abox(g, 0.18, 0.18, 0.06, core, 0, 1.0, 0.27, true);
    parts.head = pivot(g, 0, 1.6, 0);
    const ring = (parts.ring = pivot(g, 0, 1.0, 0));
    for (let i = 0; i < 4; i++) {
      const an = (i * Math.PI) / 2;
      abox(ring, 0.18, 0.18, 0.18, i % 2 ? lav : core, Math.cos(an) * 0.75, 0, Math.sin(an) * 0.75, true);
    }
  } else if (a.type === 'front_runner') {
    // a MEV bot: a dark chassis with a visor that sweeps the mempool, gold "sandwich" plates for hands,
    // a pending transaction squeezed between two gold plates on its chest, priority-fee coins orbiting
    // over its head
    const dark = '#1c1029',
      body = '#2a1838',
      trim = '#4a3b7a',
      gold = '#ffd166',
      cyan = '#7fe8ff';
    for (const x of [-0.24, 0.24]) {
      const l = pivot(g, x, 0.95, 0);
      abox(l, 0.28, 0.62, 0.3, dark, 0, -0.31, 0);
      abox(l, 0.34, 0.3, 0.42, body, 0, -0.78, 0.05);
      abox(l, 0.36, 0.05, 0.44, cyan, 0, -0.95, 0.05, true);
      parts.legs.push(l);
    }
    abox(g, 0.62, 0.22, 0.46, trim, 0, 1.02, 0);
    abox(g, 0.96, 0.86, 0.62, body, 0, 1.52, 0);
    abox(g, 0.5, 0.08, 0.06, gold, 0, 1.72, 0.33, true);
    abox(g, 0.36, 0.22, 0.06, cyan, 0, 1.55, 0.33, true);
    abox(g, 0.5, 0.08, 0.06, gold, 0, 1.38, 0.33, true);
    for (const x of [-0.6, 0.6]) {
      abox(g, 0.34, 0.24, 0.5, gold, x, 1.9, 0);
      const arm = pivot(g, x * 1.05, 1.82, 0);
      abox(arm, 0.22, 0.7, 0.24, dark, 0, -0.38, 0);
      abox(arm, 0.46, 0.1, 0.46, gold, 0, -0.78, 0.05, true);
      abox(arm, 0.3, 0.12, 0.3, cyan, 0, -0.88, 0.05, true);
      abox(arm, 0.46, 0.1, 0.46, gold, 0, -0.98, 0.05, true);
    }
    const hd = (parts.head = pivot(g, 0, 2.18, 0));
    abox(hd, 0.72, 0.44, 0.56, trim, 0, 0, 0);
    abox(hd, 0.62, 0.14, 0.04, dark, 0, 0.02, 0.29);
    parts.scan = abox(hd, 0.14, 0.1, 0.03, cyan, 0, 0.02, 0.31, true);
    for (const x of [-0.26, 0.26]) {
      abox(hd, 0.04, 0.32, 0.04, dark, x, 0.36, -0.1);
      abox(hd, 0.08, 0.08, 0.08, '#ff6bd5', x, 0.54, -0.1, true);
    }
    const crown = (parts.crown = pivot(g, 0, 2.9, 0));
    for (let i = 0; i < 6; i++) {
      const an = (i * Math.PI) / 3;
      abox(crown, 0.16, 0.16, 0.04, gold, Math.cos(an) * 0.55, 0, Math.sin(an) * 0.55, true);
    }
  } else if (a.type === 'mev_bot') {
    // a Sandwich Bot: a pending transaction caught between two gold plates, on two stubby legs
    const gold = '#ffd166',
      cyan = '#7fe8ff',
      dark = '#2a1838';
    for (const x of [-0.16, 0.16]) {
      const l = pivot(g, x, 0.36, 0);
      abox(l, 0.14, 0.36, 0.16, dark, 0, -0.18, 0);
      parts.legs.push(l);
    }
    abox(g, 0.7, 0.12, 0.6, gold, 0, 0.42, 0);
    abox(g, 0.5, 0.3, 0.42, cyan, 0, 0.63, 0, true, 0.85);
    abox(g, 0.7, 0.12, 0.6, gold, 0, 0.84, 0);
    const hd = (parts.head = pivot(g, 0, 0.84, 0.2));
    abox(hd, 0.08, 0.08, 0.04, dark, -0.14, 0.02, 0.11, true);
    abox(hd, 0.08, 0.08, 0.04, dark, 0.14, 0.02, 0.11, true);
  }
  if (a.type === 'titan') g.scale.setScalar(1.7);
  else if (a.type === 'front_runner') g.scale.setScalar(1.6);
  else if (a.type === 'warden') g.scale.setScalar(1.1);
  else if (a.type === 'pow_twin') g.scale.setScalar(1.5);
  else if (a.type === 'pos_twin') g.scale.setScalar(1.4);
  else if (a.type === 'plasma_core') g.scale.setScalar(1.15);
  else if (a.type === 'turret') g.scale.setScalar(1.25);
  a.g = g;
  a.parts = parts;
  g.position.set(a.hx, a.hy, a.hz);
  scene.add(g);
}
// ruin: {x,y,z} of the guarded validator (guardian only), otherwise null
function mkMob(type, k, i, x, y, z, ruin) {
  return adoptMob(MobsCore.mob(type, k, i, x, y, z, ruin));
}
// a mob from the shared logic gets its mesh: from then on its position and rotation are the mesh's own
function adoptMob(a) {
  buildMob(a);
  a.g.position.set(a.p.x, a.p.y, a.p.z);
  a.g.rotation.y = a.r.y;
  a.p = a.g.position;
  a.r = a.g.rotation;
  return a;
}
function spawnMobChunk(cx, cz) {
  const k = ckey(cx, cz);
  if (MOBS.has(k)) return;
  MOBS.set(k, MobsCore.spawnChunk(MOB_W, cx, cz).map(adoptMob));
}
// daytime rest: by day the hostile mobs are out of sight (Pierre: no mobs in daylight), and they come
// back at dusk. Only the validators' guards stay on watch: the guardians and crawlers of the ruins, and the
// network attack's nodes going for the Atrium's validator, the towers' wardens and turrets. The bosses (and the Front-Runner's bots) stay
// too: a boss fight is something you go looking for. A resting mob leaves its chunk's list for
// list.resting: every loop over MOBS (updates, aiming, bolts) skips it without knowing about the rule.
const REST_FAR = 24; // never vanishes under your eyes: only once you are this far away, and unhurt
function restsByDay(a) {
  return !DAY_WATCH.has(a.type);
}
// A killed mob stays dead for a while: a chunk loaded again (you walked away and back), a night
// prowler or a network attack node don't bring it straight back, which left no time to switch weapons
// or put a block down. Kept on this screen only, like the mobs themselves.
const KILLED = new Map(); // 'chunk key|mob index' -> performance.now() at death
function recentlyKilled(k, i, type) {
  const t = KILLED.get(k + '|' + i);
  return t !== undefined && performance.now() - t < (RESPAWN_S[type] ?? 120) * 1000;
}
function pruneKilled(k) {
  const list = MOBS.get(k);
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--)
    if (recentlyKilled(k, list[i].i, list[i].type)) {
      scene.remove(list[i].g);
      list.splice(i, 1);
    }
}
function syncDayRest(k, far) {
  const list = MOBS.get(k);
  if (!list) return;
  const night = skyU.night.value;
  if (night < 0.35) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i],
        p = a.g.position;
      if (!restsByDay(a) || a.hp !== MK[a.type].hp) continue;
      if (!far && Math.hypot(p.x - P.x, p.y - P.y, p.z - P.z) < REST_FAR) continue;
      scene.remove(a.g);
      list.splice(i, 1);
      (list.resting ||= []).push(a);
    }
  } else if (night > 0.55 && list.resting?.length) {
    for (const a of list.resting.splice(0)) {
      a.g.position.set(a.hx, a.hy, a.hz);
      scene.add(a.g);
      list.push(a);
    }
  }
}
// night prowlers don't fit the once-per-chunk model above: they must appear and disappear as the
// day/night cycle turns, so this runs every tick (updateMobs) instead of once when a chunk loads
function syncNightProwler(cx, cz) {
  const k = ckey(cx, cz),
    list = MOBS.get(k);
  if (!list) return;
  const idx = list.findIndex(a => a.type === 'prowler');
  if (idx >= 0) {
    if (skyU.night.value < 0.35) {
      scene.remove(list[idx].g);
      list.splice(idx, 1);
    }
    return;
  }
  if (skyU.night.value < 0.55 || recentlyKilled(k, 190, 'prowler')) return;
  const a = MobsCore.prowler(MOB_W, cx, cz);
  if (a) list.push(adoptMob(a));
}
// the network attack event (027_network_attack.sql): same shape as syncNightProwler — a condition
// (the hourly window, attackWindow() in 07-interface.js) flips rather than a chunk loading once, so it
// runs every tick too. Only the Atrium's own chunk hosts the wave; a stable ring position per window
// slot means a killed node reappears right where it fell instead of drifting around — "converges on
// the Atrium" stays readable as one wave under pressure, not a scatter of one-off spawns.
function syncNetworkAttack(cx, cz) {
  if (cOf(SPAWN.x) !== cx || cOf(SPAWN.z) !== cz) return;
  const k = ckey(cx, cz),
    list = MOBS.get(k);
  if (!list) return;
  const aw = attackWindow(),
    mine = list.filter(a => a.type === 'corrupted_node');
  if (!aw.active || (mine.length && mine[0].windowId !== aw.windowId)) {
    for (const a of mine) {
      scene.remove(a.g);
      list.splice(list.indexOf(a), 1);
    }
    if (!aw.active) return;
  }
  const taken = new Set(list.filter(a => a.type === 'corrupted_node').map(a => a.slot));
  for (const a of MobsCore.attackNodes(MOB_W, aw, slot => taken.has(slot) || recentlyKilled(k, 400 + slot, 'corrupted_node')))
    list.push(adoptMob(a));
}
function despawnMobChunk(k) {
  const l = MOBS.get(k);
  if (!l) return;
  for (const a of l) scene.remove(a.g);
  MOBS.delete(k);
}
// mob targeted by the crosshair (or the finger), like pickAnimal (09-animals.js) — same aimRay/aniBox/aniV
function pickMob(at, blk) {
  const ray = aimRay(at);
  let best = null,
    bd = 5.2;
  for (const list of MOBS.values())
    for (const a of list) {
      if (a.hp <= 0) continue;
      const [w, h, d] = MK[a.type].hit,
        p = a.g.position,
        m = Math.max(w, d) / 2;
      aniBox.min.set(p.x - m, p.y, p.z - m);
      aniBox.max.set(p.x + m, p.y + h, p.z + m);
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
// ---------- combat ----------
let playerAtkT = 0,
  hurtT = 0,
  regenT = 0,
  hpBarOn = false,
  hpShown = -1,
  pvpGraceUntil = 0; // brief spawn-camping grace period after dying, checked on the receiving end of a 'hit'
function updateHpUI() {
  if (S.hp === hpShown && hpBarOn) return;
  hpShown = S.hp;
  if (!hpBarOn) {
    $('hp').hidden = true;
    return;
  }
  const el = $('hp');
  el.hidden = false;
  // ten slanted cells: red with a lighter red edge while alive, dark grey with a lighter grey edge
  // once lost; a cell just lost flashes pale before it goes dark
  if (!el.firstChild) el.innerHTML = '<i></i>'.repeat(10);
  const hp = clamp(S.hp, 0, 10);
  [...el.children].forEach((c, i) => {
    const on = i < hp,
      was = c.classList.contains('on');
    c.classList.toggle('on', on);
    if (was && !on) {
      c.classList.remove('lost');
      void c.offsetWidth; // restart the flash
      c.classList.add('lost');
    }
  });
  el.classList.toggle('low', S.hp <= 3);
}
// ---------- the mobs' life bars ----------
// A blow shows the mob's health over its head for a few seconds: the same bar as yours, in the mobs'
// ember colors, the fill dropping at once and a pale trail following. Drawn on a small canvas sprite,
// redrawn only while it changes, and taken away when it fades.
const MOB_BAR_S = 4;
function showMobBar(a) {
  if (!a.g) return;
  a.barT = MOB_BAR_S;
  if (a.bar) return;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 58;
  const t = new THREE.CanvasTexture(c),
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.renderOrder = 11;
  // over the head: the model's top, in its own (scaled) space
  const box = new THREE.Box3().setFromObject(a.g),
    k = a.g.scale.x || 1;
  s.position.y = (box.max.y - a.g.position.y) / k + 0.35 / k;
  s.scale.set(1.1 / k, (1.1 * 58) / 160 / k, 1);
  a.g.add(s);
  a.bar = { s, c, t, lag: a.hp, wait: 0, drawn: '' };
}
function drawMobBar(a) {
  const B = a.bar,
    max = MK[a.type].hp || 1,
    k = clamp(a.hp / max, 0, 1),
    lag = clamp(B.lag / max, 0, 1),
    key = k.toFixed(3) + lag.toFixed(3);
  if (key === B.drawn) return;
  B.drawn = key;
  const x = B.c.getContext('2d'),
    W = B.c.width,
    H = B.c.height,
    r = (x0, y0, w, h, rr) => {
      x.beginPath();
      x.roundRect ? x.roundRect(x0, y0, w, h, rr) : x.rect(x0, y0, w, h);
    };
  x.clearRect(0, 0, W, H);
  // its name, then the bar in a glass pill
  x.font = '600 21px ' + UI_FONT;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 5;
  x.strokeStyle = 'rgba(28,22,58,.85)';
  x.strokeText(MK[a.type].n, W / 2, 13);
  x.fillStyle = '#f4f1ff';
  x.fillText(MK[a.type].n, W / 2, 13);
  const py = 28;
  x.fillStyle = 'rgba(28,22,58,.82)';
  r(0, py, W, H - py, 14);
  x.fill();
  x.strokeStyle = 'rgba(190,178,255,.35)';
  x.lineWidth = 2;
  r(1, py + 1, W - 2, H - py - 2, 13);
  x.stroke();
  const ix = 7,
    iy = py + 7,
    iw = W - 14,
    ih = H - py - 14;
  x.fillStyle = 'rgba(10,6,30,.75)';
  r(ix, iy, iw, ih, ih / 2);
  x.fill();
  if (lag > k) {
    x.fillStyle = 'rgba(255,240,220,.7)';
    r(ix, iy, Math.max(ih, iw * lag), ih, ih / 2);
    x.fill();
  }
  if (k > 0) {
    const g = x.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, '#ffd27a');
    g.addColorStop(0.5, '#ff8a5c');
    g.addColorStop(1, '#d8486a');
    x.fillStyle = g;
    r(ix, iy, Math.max(ih, iw * k), ih, ih / 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)';
    r(ix + 4, iy + 2, Math.max(4, iw * k - 8), 3, 1.5);
    x.fill();
  }
  B.t.needsUpdate = true;
}
function dropMobBar(a) {
  if (!a.bar) return;
  a.bar.s.parent?.remove(a.bar.s);
  a.bar.t.dispose();
  a.bar.s.material.dispose();
  a.bar = null;
}
function updateMobBars(dt) {
  for (const list of MOBS.values())
    for (const a of list) {
      if (!a.bar) continue;
      const B = a.bar;
      a.barT -= dt;
      if (a.barT <= 0 || a.hp <= 0 || a.dying != null) {
        dropMobBar(a);
        continue;
      }
      if (B.lag < a.hp) B.lag = a.hp;
      else if (B.lag > a.hp) {
        if ((B.wait += dt) > 0.35) B.lag = Math.max(a.hp, B.lag - (MK[a.type].hp || 1) * dt * 1.6);
      } else B.wait = 0;
      drawMobBar(a);
      B.s.material.opacity = Math.min(1, a.barT / 0.4);
    }
}
function heldDmg() {
  const id = itemId(S.bar[S.sel]);
  return ITEM[id]?.dmg || 1;
}
// shared by melee (attackMob) and the plasma pistol's bolts (hitBolt): hp, knockback away from
// whatever dealt the hit, death/dying/loot — the only difference is where the hit came from
// the Merge twins are only vulnerable to someone standing on their disc: shooting them from the stair or
// the sky (playtest: they can't follow you off it) barely scratches them, and says so once
let twinShieldToast = 0;
// ---------- shared combat: a mob is the same mob on every nearby screen ----------
// Each screen still moves its own copy of a mob, but every blow is told to the players nearby: its damage,
// the mob's hp left, where it stands. So a mob loses the same hp everywhere and dies for everyone, and
// whoever struck it in the last 30 seconds gets their own loot (Supabase still decides what drops). With
// the game server (server/src/server.js), the mob's health lives there: it checks each blow, says when
// the mob dies and who gets paid, and keeps it dead until it comes back. Without it, on the region
// channels, each screen judges for itself as before. A mob's id is the same everywhere: its chunk, its
// slot there and its kind, all derived from the world itself (spawnMobChunk and friends).
const mobId = a => `${a.k}|${a.i}|${a.type}`;
const SHARE_LOOT_MS = 30000;
Net.on('mob', m => remoteMobHit(m));
function findMob(id) {
  const [k, i, type] = id.split('|');
  return (MOBS.get(k) || []).find(a => String(a.i) === i && a.type === type) || null;
}
// you hit it: the twins' shield, then the blow itself, then the word to everyone nearby.
// Through the game server, the mob's health is the server's: the blow shows here at once, but the mob
// only dies when the server says so (the answer comes back in a few hundredths of a second), and the
// loot goes to whoever it names. With no answer (the server just went away), this screen settles it.
const MOB_WAIT_MS = 800;
function damageMob(a, dmg, fromX, fromZ, item = itemId(S.bar[S.sel])) {
  a.provoked = 15; // struck: the Ward Incense no longer fools it for a while
  if (a.stunT > 0) dmg *= 1.5; // a riposte, while it reels from a parry
  if (a.arena && (a.twin || a.arena.reach) && Math.hypot(P.x - a.arena.x, P.z - a.arena.z) > (a.arena.reach || a.arena.r + 2.5)) {
    dmg *= 0.15;
    if (performance.now() - twinShieldToast > 15000) {
      twinShieldToast = performance.now();
      toastInfo(
        a.twin
          ? 'The sanctum shields the twins from afar: step onto the disc to really hurt them'
          : 'The Mempool shields its master from afar: step inside the colosseum to really hurt it',
      );
    }
  }
  if (a.hp <= 0) return;
  a.hitAt = performance.now(); // you took part: you'll get your own loot if it falls soon
  const hpLeft = a.hp - dmg,
    served = typeof Net !== 'undefined' && Net.gameServer;
  if (served && hpLeft <= 0) {
    // the killing blow waits for the server's word; if none comes, this screen settles it as before
    const wait = (a.wait = {});
    setTimeout(() => {
      if (a.wait === wait && a.hp > 0) {
        a.wait = null;
        setMobHp(a, hpLeft);
      }
    }, MOB_WAIT_MS);
  }
  applyMobDamage(a, dmg, served ? Math.max(hpLeft, 0.01) : hpLeft, fromX, fromZ);
  if (typeof Net !== 'undefined' && Net.sendMob)
    Net.sendMob({
      id: mobId(a),
      item,
      dmg: +dmg.toFixed(2),
      hp: +Math.max(0, hpLeft).toFixed(2),
      x: +a.g.position.x.toFixed(2),
      y: +a.g.position.y.toFixed(2),
      z: +a.g.position.z.toFixed(2),
      fx: +fromX.toFixed(2),
      fz: +fromZ.toFixed(2),
    });
}
// a blow on a mob nearby, told by the others or by the game server. From the server (m.from is set), its
// health is the truth: your own blow comes back with what's left, the others' with their knockback too.
function remoteMobHit(m) {
  const a = findMob(m.id);
  if (!a) return;
  if (m.from === undefined) {
    // straight from another player (no game server): their blow on top of ours, but never above what
    // they see (a screen that arrived late, with the mob still at full health, catches up at once)
    if (a.hp <= 0) return;
    nudgeMob(a, m);
    applyMobDamage(a, m.dmg, Math.min(a.hp - m.dmg, m.hp), m.fx, m.fz);
    return;
  }
  const paid = m.dead ? () => Array.isArray(m.by) && m.by.includes(ME.id) : undefined,
    end = m.both ? 'both' : m.dead ? 'dead' : m.down ? 'down' : null;
  if (m.from === ME.id) {
    a.wait = null;
    if (a.hp <= 0 && !a.down) return; // already gone here
    setMobHp(a, m.hp, paid, end);
    return;
  }
  if (a.hp <= 0 && !(end === 'both' && a.down)) return;
  nudgeMob(a, m);
  applyMobDamage(a, m.dmg, m.hp, m.fx, m.fz, paid, end);
}
// the mob is put back where the striker sees it
function nudgeMob(a, m) {
  if (a.lead) return; // your screen leads this one: the others follow you, not the other way round
  const p = a.g.position;
  if (Math.hypot(p.x - m.x, p.z - m.z) > 1.5) p.set(m.x, m.y, m.z);
  else {
    p.x += (m.x - p.x) * 0.5;
    p.z += (m.z - p.z) * 0.5;
  }
}
// a mob loses hp, wherever the blow came from: the knockback and the sound, then its health
function applyMobDamage(a, dmg, hpLeft, fromX, fromZ, paid, end) {
  a.provoked = 15;
  if (dmg > 0) {
    Sound.hit('pierre');
    flashModel(a.g, 'hit', 0.12); // a white flash: the blow landed
    showMobBar(a);
    const K = MK[a.type],
      dx = a.g.position.x - fromX,
      dz = a.g.position.z - fromZ,
      dd = Math.hypot(dx, dz) || 1;
    a.kbx = (dx / dd) * K.kb;
    a.kbz = (dz / dd) * K.kb;
    a.kbT = 0.25;
  }
  setMobHp(a, hpLeft, paid, end);
}
// its health; at 0 it dies here too, and pays whoever took part. paid(mob) says who did (by default,
// whoever struck it here in the last 30 s); end is the game server's word: 'down' (a twin falls
// dormant), 'dead', 'both' (the two twins together), or nothing for this screen to judge
function setMobHp(a, hpLeft, paid, end) {
  a.hp = hpLeft;
  const tookPart = paid || (x => x && x.hitAt && performance.now() - x.hitAt < SHARE_LOOT_MS);
  if (end && hpLeft > 0) return;
  if (a.hp <= 0 && a.twin) {
    // the Merge twins: the first to fall only goes dormant; if its twin is already dormant, both are
    // done for good — together, which is the only way they stay down
    a.hp = 0;
    Sound.animal(a.type, 1);
    if (end === 'down' || (!end && a.twin.hp > 0)) {
      a.down = TWIN_DOWN;
      if (tookPart(a))
        toastInfo(`${MK[a.type].n} falls dormant… strike ${MK[a.twin.type].n} down within ${TWIN_DOWN} s, or it rises again`);
    } else {
      a.twin.hp = 0;
      a.down = a.twin.down = 0;
      a.dying = a.twin.dying = 0.4;
      if (tookPart(a) || tookPart(a.twin)) {
        lootMob('merge_twins');
        S.killedMob = 1;
        dirty = true;
      }
    }
    return;
  }
  if (a.hp <= 0) {
    a.hp = 0;
    a.dying = 0.4;
    Sound.animal(a.type, 1);
    if (tookPart(a)) {
      lootMob(a.type);
      S.killedMob = 1;
      if (a.type === 'corrupted_node') S.defended = 1;
      dirty = true;
    }
  }
}
// a mob falls: it bursts into cubes of its own colors as it shrinks away (once)
function mobBurst(a) {
  if (a.burst) return;
  a.burst = true;
  const mats = [];
  for (const [, mat] of a.g.userData.flashKeep || []) if (mat.color && !Array.isArray(mat)) mats.push(mat); // flashing as it fell
  if (!mats.length) a.g.traverse(m => m.isMesh && m.material && m.material.color && !Array.isArray(m.material) && mats.push(m.material));
  if (!mats.length) return;
  mats.sort((x, y) => (y.emissiveIntensity || 0) - (x.emissiveIntensity || 0)); // its glow first, then its body
  const p = a.g.position,
    h = (MK[a.type].hit || [0.5, 1, 0.5])[1];
  clayBurst(p.x - 0.5, p.y + h * 0.35, p.z - 0.5, mats[mats.length - 1]);
  clayBurst(p.x - 0.5, p.y + h * 0.65, p.z - 0.5, mats[0]);
}
function attackMob(a) {
  if (guarding() || RIDE || BOARD) return false; // the blade is up, or you're on board a hovercraft: no strike
  swing = Math.max(swing, 0.6);
  if (playerAtkT > 0) return false;
  playerAtkT = 0.45;
  damageMob(a, heldDmg(), P.x, P.z);
  return true;
}
// ---------- ranged weapons: plasma bolts (the Plasma Pistol, ITEM[206].ranged) ----------
// A small array of live bolts, updated once a frame — the same shape already used for the falling
// petal particles (05-player.js): plain objects with position/velocity/life, started and stopped as
// they go, nothing kept running when there's nothing to animate.
const BOLTS = [];
let rangedT = 0;
const boltGeo = new THREE.SphereGeometry(0.12, 8, 8),
  boltMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff });
const BOLT_SPEED = 28,
  BOLT_LIFE = 1.2;
function fireRanged() {
  if (BOARD) return false; // in a back seat, no shooting either
  swing = Math.max(swing, 0.5);
  if (rangedT > 0) return false;
  rangedT = 0.35;
  // always straight down the crosshair (screen center), never wherever a touch/click happened to
  // land — unlike melee's pickMob/pickPlayer/pickAnimal, a long thin bolt makes any aim/crosshair
  // mismatch obvious, so this intentionally ignores `aim` and always takes aimRay's forward branch
  const ray = aimRay(),
    dir = ray.direction;
  const m = new THREE.Mesh(boltGeo, boltMat);
  m.position.copy(ray.origin);
  scene.add(m);
  BOLTS.push({
    m,
    vx: dir.x * BOLT_SPEED,
    vy: dir.y * BOLT_SPEED,
    vz: dir.z * BOLT_SPEED,
    life: BOLT_LIFE,
    dmg: heldDmg(),
    item: itemId(S.bar[S.sel]),
  });
  Sound.shoot();
  // the players nearby see it fly too (drawn only: the damage still comes from this screen's own bolt)
  if (typeof Net !== 'undefined' && Net.sendShot)
    Net.sendShot({
      id: ME.id,
      x: +ray.origin.x.toFixed(2),
      y: +ray.origin.y.toFixed(2),
      z: +ray.origin.z.toFixed(2),
      dx: +dir.x.toFixed(3),
      dy: +dir.y.toFixed(3),
      dz: +dir.z.toFixed(3),
    });
  return true;
}
// someone else's plasma bolt: the same bolt, flying the same way, but harmless here (GHOST_BOLTS: it stops
// on the first solid block or on a player, and never touches a mob or you — their own screen settles that)
const GHOST_BOLTS = [];
Net.on('shot', s => ghostShot(s));
function ghostShot(s) {
  if (!s || s.id === ME.id || IGNORES.has((others.get(s.id)?.name || '').toLowerCase())) return;
  if (![s.x, s.y, s.z, s.dx, s.dy, s.dz].every(Number.isFinite) || Math.hypot(s.x - P.x, s.y - P.y, s.z - P.z) > 80) return;
  const l = Math.hypot(s.dx, s.dy, s.dz) || 1,
    m = new THREE.Mesh(boltGeo, boltMat);
  m.position.set(s.x, s.y, s.z);
  scene.add(m);
  GHOST_BOLTS.push({ m, vx: (s.dx / l) * BOLT_SPEED, vy: (s.dy / l) * BOLT_SPEED, vz: (s.dz / l) * BOLT_SPEED, life: BOLT_LIFE });
  if (Math.hypot(s.x - P.x, s.z - P.z) < 30) Sound.shoot();
}
function updateGhostBolts(dt) {
  for (let i = GHOST_BOLTS.length - 1; i >= 0; i--) {
    const b = GHOST_BOLTS[i],
      p = b.m.position;
    b.life -= dt;
    p.x += b.vx * dt;
    p.y += b.vy * dt;
    p.z += b.vz * dt;
    const onYou = Math.abs(p.x - P.x) < 0.45 && Math.abs(p.z - P.z) < 0.45 && p.y > P.y && p.y < P.y + 1.85;
    if (b.life <= 0 || onYou || isSolid(get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) {
      scene.remove(b.m);
      GHOST_BOLTS.splice(i, 1);
    }
  }
}
// ---------- mobs that hit from a distance: turrets and the Plasma Core ----------
// A charge (a turret's lens swells, so you see it coming), then a burst of slow bolts aimed where you
// stand when each leaves — sidestep them, or put a wall between you: a bolt dies on the first solid block.
const MOB_BOLTS = [],
  mobBoltMats = new Map();
const MOB_BOLT_LIFE = 3;
// is there a clear line from (a) to (b)? half-block steps through the world
function lineClear(ax, ay, az, bx, by, bz) {
  return MobsCore.lineClear(MOB_W, ax, ay, az, bx, by, bz);
}
// where a mob's shots leave from: a turret's lens, the middle of anything else
function mobEye(a) {
  return MobsCore.eye(a);
}
// a mob's bolt, flying from (x, y, z): it hurts you if it reaches you
function spawnMobBolt(x, y, z, vx, vy, vz, dmg, color, size) {
  if (!mobBoltMats.has(color)) mobBoltMats.set(color, new THREE.MeshBasicMaterial({ color }));
  const m = new THREE.Mesh(boltGeo, mobBoltMats.get(color));
  m.scale.setScalar(size);
  m.position.set(x, y, z);
  scene.add(m);
  MOB_BOLTS.push({ m, vx, vy, vz, life: MOB_BOLT_LIFE, dmg, ox: x, oz: z });
  Sound.hit('pierre');
}
function fireMobBolt(a, R) {
  const [x, y, z] = mobEye(a),
    tx = P.x,
    ty = P.y + 1.2,
    tz = P.z,
    dd = Math.hypot(tx - x, ty - y, tz - z) || 1;
  spawnMobBolt(x, y, z, ((tx - x) / dd) * R.speed, ((ty - y) / dd) * R.speed, ((tz - z) / dd) * R.speed, R.dmg, R.color, R.size || 1.6);
  // the players nearby see it fly too (harmless on their screens: it's aimed at you)
  if (a.lead && typeof Net !== 'undefined' && Net.gameServer && Net.sendMobShot)
    Net.sendMobShot({
      id: mobId(a),
      x: +x.toFixed(2),
      y: +y.toFixed(2),
      z: +z.toFixed(2),
      vx: +(((tx - x) / dd) * R.speed).toFixed(2),
      vy: +(((ty - y) / dd) * R.speed).toFixed(2),
      vz: +(((tz - z) / dd) * R.speed).toFixed(2),
      c: R.color,
      s: R.size || 1.6,
    });
}
// a mob's bolt fired at another player: drawn here, harmless (GHOST_BOLTS)
Net.on('mobshot', s => {
  if (!s || ![s.x, s.y, s.z, s.vx, s.vy, s.vz, s.c, s.s].every(Number.isFinite)) return;
  if (Math.hypot(s.x - P.x, s.y - P.y, s.z - P.z) > 80) return;
  const color = s.c & 0xffffff;
  if (!mobBoltMats.has(color)) mobBoltMats.set(color, new THREE.MeshBasicMaterial({ color }));
  const m = new THREE.Mesh(boltGeo, mobBoltMats.get(color));
  m.scale.setScalar(clamp(s.s, 0.5, 3));
  m.position.set(s.x, s.y, s.z);
  scene.add(m);
  GHOST_BOLTS.push({ m, vx: s.vx, vy: s.vy, vz: s.vz, life: MOB_BOLT_LIFE });
  if (Math.hypot(s.x - P.x, s.z - P.z) < 30) Sound.hit('pierre');
});
function rangedAttack(a, K, aggro, d, dt) {
  MobsCore.rangedAttack(MOB_W, a, K, { id: 'me', x: P.x, y: P.y, z: P.z, me: true }, aggro, d, dt, MOB_EV);
}
function updateMobBolts(dt) {
  for (let i = MOB_BOLTS.length - 1; i >= 0; i--) {
    const b = MOB_BOLTS[i],
      p = b.m.position;
    b.life -= dt;
    p.x += b.vx * dt;
    p.y += b.vy * dt;
    p.z += b.vz * dt;
    let dead = b.life <= 0 || isSolid(get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    if (!dead && Math.abs(p.x - P.x) < 0.45 && Math.abs(p.z - P.z) < 0.45 && p.y > P.y && p.y < P.y + 1.85) {
      if (hurtT <= 0) hurtPlayer(b.dmg, b.ox, b.oz, 'bolt');
      dead = true;
    }
    if (dead) {
      scene.remove(b.m);
      MOB_BOLTS.splice(i, 1);
    }
  }
}
function updateBolts(dt) {
  updateMobBolts(dt);
  updateGhostBolts(dt);
  for (let i = BOLTS.length - 1; i >= 0; i--) {
    const b = BOLTS[i];
    b.life -= dt;
    b.m.position.x += b.vx * dt;
    b.m.position.y += b.vy * dt;
    b.m.position.z += b.vz * dt;
    const p = b.m.position;
    let dead = b.life <= 0 || isSolid(get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    if (!dead) {
      outer: for (const list of MOBS.values())
        for (const a of list) {
          if (a.hp <= 0) continue;
          const K = MK[a.type],
            ap = a.g.position;
          if (Math.hypot(p.x - ap.x, p.y - (ap.y + K.hit[1] / 2), p.z - ap.z) < 0.55 + K.hit[0] / 2) {
            damageMob(a, b.dmg, p.x, p.z, b.item);
            dead = true;
            break outer;
          }
        }
    }
    if (!dead && !sanctuary(p.x, p.z))
      for (const [id, o] of others) {
        if (!o.t) continue;
        const op = o.g.position;
        if (Math.hypot(p.x - op.x, p.y - (op.y + 0.9), p.z - op.z) < 0.55) {
          Net.sendHit({ from: ME.id, to: id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), item: itemId(S.bar[S.sel]) });
          dead = true;
          break;
        }
      }
    if (dead) {
      scene.remove(b.m);
      BOLTS.splice(i, 1);
    }
  }
}
// a thematic, chance-based resource on a mob's death — granting an item is value-moving, so (unlike the
// fight itself) this goes through the server; it trusts the client-reported mob type, like _core_mine
// already trusts "held" for tool tier, bounded by _rate + _check_pos instead of re-derived server-side
// toast shown whenever a boss-tier unique mints, keyed by the item id (_mint's id, same one
// addUnique/S.nfts entries carry) — not every boss drop is the Titan Fang anymore
const BOSS_TOAST = {
  205: () => `The Genesis Titan falls! ${ITEM[205].n} earned — a cape of its own hide. Hold jump while falling to glide.`,
  206: () => `The Plasma Core shatters! ${ITEM[206].n} earned — hold it and click to fire.`,
  209: () => `The Merge is complete! ${ITEM[209].n} earned — equip it from your chest to shrug off most of a hit.`,
  211: () => `The Front-Runner is outrun! ${ITEM[211].n} earned — wear them from your chest: faster on your feet, and Q to dodge.`,
};
// what a kill paid you (Supabase rolled it: asked by this screen, or by the game server)
function showLoot(type, r) {
  if (r && r.item) {
    logEv('burn', `1 ${ITEM[r.item].n}`, `→ dropped by a ${MK[type].n.toLowerCase()}`);
    Sound.chime();
  }
  if (r && r.unique) {
    addUnique(r.unique);
    toastInfo((BOSS_TOAST[r.unique.id] || (() => `${ITEM[r.unique.id].n} earned`))());
    Sound.chime();
  }
  if (r && r.shards) logEv('mint', `${r.shards} Diamond Shard${r.shards > 1 ? 's' : ''}`, 'cut from the boss: the Genesis gear needs 4');
  if (r && r.bonus) {
    addUnique(r.bonus);
    toastInfo(`Bonus drop: ${ITEM[r.bonus.id].n}!`);
    Sound.chime();
  }
  if (r && r.gwei) {
    S.gwei = r.total_gwei;
    toastInfo(`+${r.gwei} Gwei — dropped by a ${MK[type].n.toLowerCase()}`);
    Sound.chime();
    ui();
  }
  if (r && r.cosmetic) {
    S.cosmetics.push(+r.cosmetic);
    toastInfo(`${COSMETICS[r.cosmetic].n} earned — a combat trophy, check the Shop tab`);
    Sound.chime();
  }
}
// the game server paid you for a kill you took part in
Net.on('loot', m => {
  if (!m || !m.r || !m.r.ok || (!MK[m.type] && m.type !== 'merge_twins')) return;
  applyServer(m.r);
  setInv(m.r.inv, 'mob loot');
  showLoot(m.type === 'merge_twins' ? 'pow_twin' : m.type, m.r);
});
function lootMob(type) {
  if (typeof Net !== 'undefined' && Net.lootServer) return; // the game server pays it (`loot`, below)
  if (SERVER()) {
    serverAct('loot_mob', { mob_type: type }, null, 'mob loot').then(r => showLoot(type, r));
    return;
  }
  if (type === 'titan' || type === 'plasma_core' || type === 'merge_twins' || type === 'front_runner') {
    const id = type === 'titan' ? 205 : type === 'plasma_core' ? 206 : type === 'merge_twins' ? 209 : 211;
    mintNft(id, null);
    toastInfo(BOSS_TOAST[id]());
    Sound.chime();
    // Diamond Shards, as online (037_diamond_shards.sql): 1 or 2 per boss, 2 for the Merge twins
    give(110, type === 'merge_twins' || type === 'front_runner' ? 2 : 1 + Math.floor(Math.random() * 2), 'cut from the boss');
    if (Math.random() < 0.2) {
      const bonusId = type === 'titan' ? 207 : type === 'plasma_core' ? 208 : type === 'merge_twins' ? 210 : 212;
      mintNft(bonusId, null);
      toastInfo(`Bonus drop: ${ITEM[bonusId].n}!`);
      Sound.chime();
    }
    return;
  }
  const r = Math.random();
  const it =
    type === 'shadow'
      ? r < 0.5 && 101
      : type === 'guardian'
        ? (r < 0.35 && 101) || (r < 0.5 && 103)
        : type === 'sentinel'
          ? r < 0.4 && 103
          : type === 'wraith'
            ? (r < 0.25 && 104) || (r < 0.65 && 103)
            : type === 'warden'
              ? (r < 0.3 && 101) || (r < 0.45 && 103)
              : type === 'garden_guardian'
                ? (r < 0.35 && 101) || (r < 0.5 && 103)
                : type === 'prowler'
                  ? r < 0.5 && 101
                  : type === 'sky_raider'
                    ? (r < 0.3 && 101) || (r < 0.45 && 103)
                    : type === 'water_lurker'
                      ? (r < 0.25 && 103) || (r < 0.5 && 104)
                      : type === 'bat'
                        ? r < 0.45 && 101
                        : type === 'crawler'
                          ? (r < 0.3 && 101) || (r < 0.45 && 103)
                          : type === 'golem'
                            ? (r < 0.3 && 103) || (r < 0.55 && 104)
                            : type === 'mev_bot'
                              ? r < 0.5 && 101
                              : false;
  if (it) give(it, 1, `dropped by a ${MK[type].n.toLowerCase()}`);
}
// PvP: like attackMob, but the target's hp lives only in the target's own client (same as another
// player's position) — this just reports the swing; the receiving end decides whether to apply it
// one click, one blow: unlike mobs, holding the button down doesn't keep striking a player
let pvpStruck = false;
function attackPlayer(target) {
  if (guarding() || RIDE || BOARD) return false;
  swing = Math.max(swing, 0.6);
  if (playerAtkT > 0 || pvpStruck) return false;
  pvpStruck = true;
  playerAtkT = 0.45;
  Sound.hit('pierre');
  Net.sendHit({ from: ME.id, to: target.id, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), item: itemId(S.bar[S.sel]) });
  return true;
}
// A click (or a tap on a phone) shorter than a frame, or made while the weapon is still recovering,
// isn't lost: it's kept for a moment and strikes as soon as the weapon is ready. The recovery itself
// runs all the time, not only while the button is held: a fresh click after a pause hits at once.
const STRIKE = { buf: 0, aim: null };
function queueStrike(at) {
  STRIKE.buf = 0.3;
  STRIKE.aim = at || null;
}
function tickWeapons(dt) {
  playerAtkT = Math.max(0, playerAtkT - dt);
  rangedT = Math.max(0, rangedT - dt);
  STRIKE.buf = Math.max(0, STRIKE.buf - dt);
}
// ---------- guarding and parrying with a blade ----------
// Hold the right button (or the shield button on a touch screen) with a blade in hand: the blade comes up
// across you. A blow from in front then only does a quarter of its damage, and a bolt from in front is
// deflected. Raise the guard just before the blow lands (PARRY_WINDOW) and it's a parry: no damage at all,
// and the mob that struck reels back, stunned for STUN_S seconds, open to a riposte (+50% damage).
// Guarding slows you down, and you can't strike at the same time.
const PARRY_WINDOW = 0.35,
  STUN_S = 1.3,
  GUARD_ARC = Math.cos((80 * Math.PI) / 180); // in front: within 80 degrees of where you look
let guardHeld = false,
  guardT = 0, // seconds since the guard went up
  guardAmt = 0, // 0..1, the blade's way up (the hand's animation, 10-loop.js)
  parryTold = 0;
function heldBlade() {
  const id = S.bar[S.sel] ? itemId(S.bar[S.sel]) : null;
  return !!(id && !B[id] && ITEM[id]?.dmg && !ITEM[id].ranged);
}
const guarding = () => guardHeld && playing && heldBlade();
function setGuard(on) {
  if (on && !guardHeld) guardT = 0;
  // your hearts on the game server: it needs to know the moment the guard goes up (a parry is timing)
  if (!!on !== guardHeld && typeof Net !== 'undefined' && Net.hpServer) Net.sendGuard(on && !!heldBlade());
  guardHeld = on;
}
function updateGuard(dt) {
  const blade = heldBlade();
  if (guardHeld && !blade) guardHeld = false;
  guardT += dt;
  guardAmt += ((guarding() ? 1 : 0) - guardAmt) * Math.min(1, dt * 14);
  const v = $('vignette'),
    tb = $('tGuard');
  if (v) v.classList.toggle('guard', guarding());
  if (tb && tb.hidden === blade) tb.hidden = !blade;
}
// ---------- the Front-Runner Boots: a quick dodge ----------
// Worn (S.boots, from the chest), they make you 12% faster (10-loop.js) and give a dodge: Q, or the dash
// button on a touch screen. A short dash the way you're moving (forward when you stand still), out of
// reach of blows for a moment, then a short recharge. The game server knows (`dodge`): your hearts live there.
const DASH = { speed: 20, time: 0.2, cd: 1.6, safe: 0.35 };
let dashT = 0,
  dashCd = 0;
const dashV = [0, 0],
  moveIn = [0, 0]; // the way you're pushing (10-loop.js)
const bootsOn = () => String(S.boots) === '211' && hasNft(211);
function dodge() {
  if (!bootsOn() || RIDE || BOARD || dashCd > 0 || dashT > 0) return false;
  let fx = moveIn[0],
    fz = moveIn[1];
  const l = Math.hypot(fx, fz);
  if (l < 0.1) {
    fx = 0;
    fz = 1;
  } else {
    fx /= l;
    fz /= l;
  }
  const sn = Math.sin(yaw),
    cs = Math.cos(yaw);
  dashV[0] = (-sn * fz + cs * fx) * DASH.speed;
  dashV[1] = (-cs * fz - sn * fx) * DASH.speed;
  dashT = DASH.time;
  dashCd = DASH.cd;
  hurtT = Math.max(hurtT, DASH.safe);
  if (typeof Net !== 'undefined' && Net.hpServer) Net.sendDodge();
  clayBurst(P.x - 0.5, P.y + 0.2, P.z - 0.5, etherMats[1]);
  Sound.shoot();
  return true;
}
// is (mx, mz) in front of you?
function facing(mx, mz) {
  const dx = mx - P.x,
    dz = mz - P.z,
    d = Math.hypot(dx, dz);
  return d < 0.05 || (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > GUARD_ARC;
}
// sparks off the blade, in front of you
function guardSpark(parry) {
  const fx = P.x - Math.sin(yaw) * 0.8,
    fz = P.z - Math.cos(yaw) * 0.8;
  clayBurst(fx - 0.5, P.y + 0.8, fz - 0.5, etherMats[parry ? 0 : 1]);
  Sound.hit('pierre');
  if (parry) Sound.click();
  selfFx(parry ? 'parry' : 'block'); // the others see the sparks
}
// a blow that reaches you: 'parry' (none of it, the striker reels), 'block' (none or a quarter of it), or
// undefined (a plain hit). kind: 'melee', 'bolt' or 'pvp'.
function hurtPlayer(dmg, mx, mz, kind = 'melee') {
  let blocked = false;
  if (guarding() && facing(mx, mz)) {
    const parry = guardT < PARRY_WINDOW;
    guardSpark(parry);
    if (parry || kind === 'bolt') {
      hurtT = 0.35;
      return parry ? 'parry' : 'block';
    }
    dmg *= 0.25;
    blocked = true;
  }
  const reduction = ITEM[S.armor]?.armor || 0;
  dmg = Math.max(blocked ? 0 : 1, Math.round(dmg * (1 - reduction)));
  if (!dmg) {
    hurtT = 0.35;
    return 'block';
  }
  hurtShown(Math.max(0, S.hp - dmg), mx, mz, blocked);
  if (S.hp <= 0) die();
  return blocked ? 'block' : undefined;
}
// a blow landed: your hearts, the knock back, the red flash
function hurtShown(hp, mx, mz, blocked) {
  S.hp = hp;
  regenT = 6;
  hurtT = 0.5;
  hpBarOn = true;
  const dx = P.x - mx,
    dz = P.z - mz,
    dd = Math.hypot(dx, dz) || 1;
  moveAxis('x', (dx / dd) * (blocked ? 1.2 : 2.4));
  moveAxis('z', (dz / dd) * (blocked ? 1.2 : 2.4));
  if (!blocked) P.vy = Math.max(P.vy, 4);
  if (!blocked) selfFx('hurt'); // your avatar flashes red: in a view from outside, and for the others
  Sound.hurt();
  $('vignette').classList.add('hurt');
  setTimeout(() => $('vignette').classList.remove('hurt'), 220);
  dirty = true;
  updateHpUI();
}
// ---------- your hearts on the game server ----------
// When it keeps them (Net.hpServer: it runs the mobs too), every blow is settled there — the guard, the
// parry, your plating, the mobs' bolts — and this screen only shows it (`hurt`), the hearts it says you
// have (`hp`: coming back slowly, a bed, a tonic), and a fall. Nothing here can make you harder to kill.
Net.on('hurt', m => serverHurt(m));
function serverHurt(m) {
  if (!m || !Number.isFinite(m.hp) || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
  // a mob's blow (no player behind it) while hostile mobs are off here: not yours to take
  if (!m.from && !mobsHere()) return;
  if (m.res === 'parry' || (m.res === 'block' && !m.dmg)) {
    guardSpark(m.res === 'parry');
    hurtT = 0.35;
    if (m.res === 'parry') {
      // the mob that struck reels (the server stunned it): which one, the closest to where the blow came from
      let best = null,
        bd = 4;
      for (const l of MOBS.values())
        for (const a of l) {
          const d = Math.hypot(a.g.position.x - m.x, a.g.position.z - m.z);
          if (a.hp > 0 && d < bd) {
            bd = d;
            best = a;
          }
        }
      if (best) {
        best.stunT = 1.3;
        parryToast(best);
      }
    }
    return;
  }
  if (m.res === 'block') guardSpark(false);
  hurtShown(clamp(Math.round(m.hp), 0, 10), m.x, m.z, m.res === 'block');
  if (m.dead) die();
}
Net.on('hp', m => {
  if (!m || !Number.isFinite(m.hp)) return;
  S.hp = clamp(Math.round(m.hp), 0, 10);
  dirty = true;
  updateHpUI();
});
function die() {
  logEv('burn', 'You fell in combat', 'back to the sanctuary');
  if (typeof dismountHover === 'function') {
    dismountHover();
    unboard();
  }
  P.x = SPAWN.x + 0.5;
  P.y = SPAWN.y + 0.1;
  P.z = SPAWN.z + 2.5;
  P.vy = 0;
  S.hp = 10;
  hurtT = 1.2;
  pvpGraceUntil = performance.now() + 2000;
  updateHpUI();
}
// the Front-Runner's tricks (MK.front_runner): it sees your move coming and gets there first. Every few
// seconds it vanishes in a flash and reappears on the far side of whoever it hunts, facing them. Below
// half health it turns frantic (faster, blinks more often, its rush recharges sooner) and calls in two
// Sandwich Bots, once, one on each side of its target. Every screen runs the same rules: the bots get the
// same ids everywhere (slots 171 and 172 of the boss's chunk), so their hp is shared like any mob's.
function frontRun(a, K, tg, d, aggro, dt) {
  MobsCore.frontRun(a, K, tg, d, aggro, dt, MOB_EV);
}
function parryToast(a) {
  if (parryTold >= 2) return;
  parryTold++;
  toastInfo(`Parried! The ${MK[a.type].n.replace(/^The /, '')} reels — strike now for extra damage`);
}
// what the shared mob logic does on this screen when a mob strikes, fires, calls in help or blinks: only
// at you (another player's screen takes the blows aimed at them)
const MOB_EV = {
  attacks: tg => tg.me,
  melee(a) {
    const r = hurtPlayer(MK[a.type].dmg, a.p.x, a.p.z, 'melee');
    if (r === 'parry') parryToast(a);
    return r;
  },
  fire: (a, R) => fireMobBolt(a, R),
  summon(a, i, x, y, z, tg) {
    const list = MOBS.get(a.k);
    if (!list || list.some(m => m.i === i) || recentlyKilled(a.k, i, 'mev_bot')) return;
    const m = mkMob('mev_bot', a.k, i, x, y, z, null);
    m.arena = { ...a.arena, reach: 0 };
    m.provoked = 15;
    list.push(m);
    clayBurst(x - 0.5, y, z - 0.5, etherMats[1]);
    if (tg && tg.me && i === 171) toastInfo('The Front-Runner calls in its Sandwich Bots!');
  },
  blink(a, fx, fz) {
    clayBurst(fx - 0.5, a.p.y + 1, fz - 0.5, etherMats[1]);
    clayBurst(a.p.x - 0.5, a.p.y + 1, a.p.z - 0.5, etherMats[1]);
    Sound.shoot();
  },
};
// legs, wings, rings and the rest: how a mob looks alive, whoever moves it
// before a melee blow it rears back (the shared logic's wind-up, windT here, or the flag the game server
// or the leading screen sends), then lunges forward as the blow comes
function windPose(a, dt) {
  const w = a.windT > 0 || !!a.windF;
  if (a.wasWind && !w) a.lungeT = 0.2;
  a.wasWind = w;
  a.windK = (a.windK || 0) + ((w ? 1 : 0) - (a.windK || 0)) * Math.min(1, dt * 16);
  a.lungeT = Math.max(0, (a.lungeT || 0) - dt);
  a.g.rotation.order = 'YXZ'; // tipped about its own axis, whichever way it faces (+z is its front)
  a.g.rotation.x = -0.38 * a.windK + 0.4 * Math.sin((a.lungeT / 0.2) * Math.PI);
}
function animateMob(a, dt, moving, aggro) {
  const p = a.g.position;
  windPose(a, dt);
  a.walk = (a.walk || 0) + dt * (moving ? 8 : 1.5);
  if (a.parts.legs.length) a.parts.legs.forEach((l, i2) => (l.rotation.x = (i2 % 2 ? -1 : 1) * Math.sin(a.walk) * 0.5));
  else if (a.parts.wings) {
    const T = Date.now() / 1000;
    a.parts.wings.forEach((w, i2) => (w.rotation.z = (i2 ? 1 : -1) * (0.3 + Math.sin(T * 8 + a.ph) * 0.5)));
  } else if (a.parts.tail) a.parts.tail.rotation.y = Math.sin((Date.now() / 1000) * 4 + a.ph) * 0.4;
  else if (a.parts.ring)
    a.parts.ring.rotation.y += dt * 2.2; // the staked cubes orbit the crystal
  else if (a.parts.rings)
    a.parts.rings.forEach((r, i2) => (r.rotation.y += dt * (1.2 + i2 * 0.7))); // the Plasma Core's cage spins
  else p.y += Math.sin(a.walk) * 0.01; // the shadow floats, no legs
  if (a.parts.drill) a.parts.drill.rotation.y += dt * (aggro ? 14 : 3); // the rig's drill never stops
  if (a.parts.crown) a.parts.crown.rotation.y += dt * (a.frenzy ? 5 : 2); // the priority-fee coins
  if (a.parts.lens) a.parts.lens.scale.setScalar(a.chargeT > 0 ? 1 + (1 - a.chargeT / MK[a.type].ranged.charge) * 1.8 : 1); // a turret's charge
  if (a.parts.scan) a.parts.scan.position.x = Math.sin((Date.now() / 1000) * (aggro ? 7 : 2.5) + a.ph) * 0.22; // the visor sweeps
}
let mobT = 0;
// your health comes back slowly; a blow leaves a moment before the next can land
function tickPlayerHealth(dt) {
  regenT = Math.max(0, regenT - dt);
  hurtT = Math.max(0, hurtT - dt);
  if (typeof Net !== 'undefined' && Net.hpServer) return; // the game server gives them back
  if (regenT <= 0 && S.hp < 10) {
    regenT = 4;
    S.hp++;
    dirty = true;
    updateHpUI();
  }
}
// ---------- the game server's mobs ----------
// When the game server runs the world's mobs (Net.mobServer, server/src/mobs.js, the same logic as here),
// this screen spawns and moves none: it draws the ones the server says are around you (`ms`, ten times a
// second), a little behind, takes the blows they strike you (`mhit`) and the bolts they fire (`mshot`), and
// tells the server when you parry. Your blows, their health, deaths and loot go on as above.
let mobMode = 'local';
const SRV_GONE_MS = 1500; // not in the server's word for this long: out of sight
const specCache = new Map(); // chunk key -> that chunk's mobs as the shared logic places them
// what this screen knows of a mob from the world itself: its floor, its ladder, its home
function specOf(k, i, type) {
  if (!specCache.has(k)) {
    if (!CHK.has(k)) return null;
    const [cx, cz] = k.split(',').map(Number);
    specCache.set(k, MobsCore.spawnChunk(MOB_W, cx, cz));
    if (specCache.size > 64) specCache.delete(specCache.keys().next().value);
  }
  return specCache.get(k).find(a => a.i === i && a.type === type) || null;
}
function serverMob(e) {
  const [id, x, y, z, r, hp, f, c] = e,
    [k, si, type] = id.split('|'),
    i = +si,
    K = MK[type];
  if (!K || !Number.isInteger(i)) return;
  let a = findMob(id);
  if (!a) {
    if (hp <= 0 && !(f & 16)) return;
    const spec = specOf(k, i, type),
      m = MobsCore.mob(type, k, i, x, y, z, spec && spec.rx !== undefined ? { x: spec.rx, y: spec.ry, z: spec.rz } : null);
    if (spec) {
      Object.assign(m, { hx: spec.hx, hy: spec.hy, hz: spec.hz });
      for (const p of ['arena', 'ladder', 'wlo']) if (spec[p] !== undefined) m[p] = spec[p];
    }
    if (type === 'mev_bot') {
      const boss = (MOBS.get(k) || []).find(b => b.type === 'front_runner');
      if (boss && boss.arena) m.arena = { ...boss.arena, reach: 0 };
      clayBurst(x - 0.5, y, z - 0.5, etherMats[1]);
    }
    a = adoptMob(m);
    if (!MOBS.has(k)) MOBS.set(k, []);
    MOBS.get(k).push(a);
    if (type === 'pow_twin' || type === 'pos_twin') {
      const tw = findMob(type === 'pow_twin' ? `${k}|${i + 1}|pos_twin` : `${k}|${i - 1}|pow_twin`);
      if (tw) {
        a.twin = tw;
        tw.twin = a;
      }
    }
  }
  if (a.hp <= 0 && !a.down && a.dying !== undefined) return; // dying here
  a.srv = { x, y, z, r, t: performance.now() };
  a.frenzy = !!(f & 2);
  a.aggro = !!(f & 8);
  a.windF = !!(f & 32); // winding up a blow
  a.stunT = f & 4 ? Math.max(a.stunT || 0, 0.2) : 0; // reeling from a parry: a riposte counts
  a.chargeT = c > 0 && K.ranged ? (1 - c) * K.ranged.charge : 0;
  if (f & 16) {
    // a Merge twin, dormant on the server
    a.hp = 0;
    a.down = a.down || TWIN_DOWN;
  } else if (a.down > 0) {
    // ...risen again
    a.down = 0;
    a.hp = hp;
    a.g.scale.setScalar(type === 'pow_twin' ? 1.5 : 1.4);
    toastInfo(`${K.n} rises again — they must fall together`);
    Sound.animal(type, 1);
  } else if (a.hp > 0 && !a.wait && performance.now() - (a.hitAt || 0) > 400) a.hp = hp; // (just struck: the answer comes)
}
Net.on('ms', m => {
  if (!Net.mobServer || !m || !Array.isArray(m.l)) return;
  for (const e of m.l) if (Array.isArray(e) && typeof e[0] === 'string' && e.slice(1, 8).every(Number.isFinite)) serverMob(e);
});
// one of them strikes you: your screen takes the blow (and may parry it)
Net.on('mhit', h => serverMobHit(h));
// (mobs turned off on this screen, in a world where that's allowed: nothing reaches you either)
const mobsHere = () => REG.mobs || mobsForced();
function serverMobHit(h) {
  if (!mobsHere() || !Net.mobServer || !h || !Number.isFinite(h.dmg) || !Number.isFinite(h.x) || !Number.isFinite(h.z) || hurtT > 0) return;
  const a = typeof h.id === 'string' ? findMob(h.id) : null;
  if (hurtPlayer(clamp(h.dmg, 0, 20), h.x, h.z, 'melee') === 'parry') {
    Net.sendParry(h.id);
    if (a) {
      a.stunT = 1.3;
      parryToast(a);
    }
  }
}
// one of them fires: the bolt flies here too, and hurts you if it reaches you
Net.on('mshot', s => serverMobShot(s));
function serverMobShot(s) {
  if (!mobsHere() || !Net.mobServer || !s || ![s.x, s.y, s.z, s.vx, s.vy, s.vz, s.dmg, s.c, s.s].every(Number.isFinite)) return;
  if (Math.hypot(s.x - P.x, s.y - P.y, s.z - P.z) > 80) return;
  if (s.hl) {
    // harmless here: the game server flies it and says whom it hits
    const color = s.c & 0xffffff;
    if (!mobBoltMats.has(color)) mobBoltMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const m = new THREE.Mesh(boltGeo, mobBoltMats.get(color));
    m.scale.setScalar(clamp(s.s, 0.5, 3));
    m.position.set(s.x, s.y, s.z);
    scene.add(m);
    GHOST_BOLTS.push({ m, vx: s.vx, vy: s.vy, vz: s.vz, life: MOB_BOLT_LIFE });
    Sound.hit('pierre');
    return;
  }
  spawnMobBolt(s.x, s.y, s.z, s.vx, s.vy, s.vz, clamp(s.dmg, 0, 20), s.c & 0xffffff, clamp(s.s, 0.5, 3));
}
function drawServerMobs(dt) {
  const now = performance.now();
  for (const [k, list] of MOBS) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.hp <= 0 && a.down > 0) {
        // a dormant Merge twin: shrunk and spinning, until the server says it rises or falls for good
        a.g.scale.setScalar(0.5);
        a.g.rotation.y += dt * 3;
        continue;
      }
      if (a.hp <= 0) {
        mobBurst(a);
        a.dying = (a.dying ?? 0.4) - dt;
        a.g.scale.setScalar(Math.max(0, a.dying / 0.4));
        if (a.dying <= 0) {
          scene.remove(a.g);
          list.splice(i, 1);
        }
        continue;
      }
      if (!a.srv || now - a.srv.t > SRV_GONE_MS) {
        scene.remove(a.g);
        list.splice(i, 1);
        continue;
      }
      const p = a.g.position,
        R = a.srv,
        f = Math.min(1, dt * (a.aggro ? 12 : 3)), // a wandering one is told of twice a second: smoothed more
        ox = p.x,
        oz = p.z;
      if (Math.hypot(R.x - p.x, R.y - p.y, R.z - p.z) > 4)
        p.set(R.x, R.y, R.z); // a blink: straight there
      else {
        p.x += (R.x - p.x) * f;
        p.y += (R.y - p.y) * f;
        p.z += (R.z - p.z) * f;
      }
      let dr = R.r - a.g.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.g.rotation.y += dr * f;
      if (a.stunT > 0) {
        a.stunT -= dt;
        a.g.rotation.z = Math.sin((now / 1000) * 18) * 0.15;
      } else a.g.rotation.z = 0;
      animateMob(a, dt, Math.hypot(p.x - ox, p.z - oz) > dt * 0.3, a.aggro);
    }
    if (!list.length) MOBS.delete(k);
  }
}
// who a mob goes after: the closest player within its reach, you or one of the others nearby (their
// avatars, 14-startup.js). Every screen runs the same choice, so a mob chases the same person
// everywhere. A little stickiness (1.5 blocks) keeps it from flipping between two players side by side.
// The Ward Incense hides only you, and only from the mobs it fools.
// ---------- one mob, one place: whoever it's after leads it ----------
// Through the game server, the screen of the player a mob is after moves it (its own simulation, as
// before) and sends where it stands about 8 times a second; the other screens nearby stop moving their
// copy and follow it, a little behind. Its blows land on its target's screen, as before; its bolts are
// shown to the others (harmless there). If two screens both think the mob is after them, the one whose
// player stands closer keeps it. No word for FOLLOW_MS: this screen takes it back.
const FOLLOW_MS = 700,
  MOB_SYNC_S = 0.12;
let mobSyncT = 0;
function sendLedMobs(dt) {
  mobSyncT -= dt;
  if (mobSyncT > 0) return;
  mobSyncT = MOB_SYNC_S;
  if (typeof Net === 'undefined' || !Net.gameServer || Net.mobServer || !Net.sendMobs || !others.size) return;
  const list = [];
  for (const l of MOBS.values())
    for (const a of l)
      if (a.lead && a.hp > 0 && list.length < 24) {
        const p = a.g.position;
        list.push({
          id: mobId(a),
          x: +p.x.toFixed(2),
          y: +p.y.toFixed(2),
          z: +p.z.toFixed(2),
          r: +a.g.rotation.y.toFixed(2),
          d: +a.leadD.toFixed(2),
          f: (a.rushT > 0 ? 1 : 0) | (a.frenzy ? 2 : 0) | (a.windT > 0 ? 32 : 0),
        });
      }
  if (list.length) Net.sendMobs({ list });
}
Net.on('mobs', m => mobsWord(m));
function mobsWord(m) {
  if (!m || !Array.isArray(m.list) || m.from === ME.id) return;
  for (const e of m.list) {
    const a = e && typeof e.id === 'string' && findMob(e.id);
    if (!a || a.hp <= 0 || ![e.x, e.y, e.z, e.r].every(Number.isFinite)) continue;
    if (a.lead && a.leadD < (e.d ?? Infinity) - 0.5) continue; // you stand closer: you keep it
    a.lead = false;
    a.remote = { x: e.x, y: e.y, z: e.z, r: e.r, t: performance.now() };
    if (e.f & 2) a.frenzy = true;
    a.windF = !!(e.f & 32);
  }
}
function followMob(a, dt) {
  const p = a.g.position,
    R = a.remote,
    k = Math.min(1, dt * 10),
    ox = p.x,
    oz = p.z;
  if (Math.hypot(R.x - p.x, R.y - p.y, R.z - p.z) > 4)
    p.set(R.x, R.y, R.z); // a blink, a long gap: straight there
  else {
    p.x += (R.x - p.x) * k;
    p.y += (R.y - p.y) * k;
    p.z += (R.z - p.z) * k;
  }
  let dr = R.r - a.g.rotation.y;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  a.g.rotation.y += dr * k;
  a.atkT = Math.max(0, (a.atkT || 0) - dt);
  animateMob(a, dt, Math.hypot(p.x - ox, p.z - oz) > dt * 0.3, true);
}
let meOnLadder = false; // updated once a frame (updateMobs)
function mobTarget(a) {
  const cands = [{ id: 'me', x: P.x, y: P.y, z: P.z, me: true, ward: POTION.ward > 0, ladder: meOnLadder, canHurt: hurtT <= 0 }];
  for (const [id, o] of others)
    if (o.t && o.g.visible) cands.push({ id, x: o.g.position.x, y: o.g.position.y, z: o.g.position.z, me: false });
  return MobsCore.target(a, cands);
}
function updateMobs(dt) {
  if (!REG.mobs && !mobsForced()) {
    // never off in the main world, where everyone faces the same mobs (07-interface.js, SETTINGS_CHOICES)
    if (MOBS.size) for (const k of [...MOBS.keys()]) despawnMobChunk(k);
    return;
  }
  // the game server runs the mobs, or this screen does: a switch starts the other way afresh
  const mode = typeof Net !== 'undefined' && Net.mobServer ? 'server' : 'local';
  if (mode !== mobMode) {
    for (const k of [...MOBS.keys()]) despawnMobChunk(k);
    specCache.clear();
    mobMode = mode;
  }
  meOnLadder = playerOnLadder();
  tickPlayerHealth(dt);
  if (mode === 'server') return drawServerMobs(dt);
  mobT -= dt;
  if (mobT <= 0) {
    mobT = 1;
    const pcx = cOf(P.x),
      pcz = cOf(P.z),
      want = new Set();
    for (let dz = -MOB_R; dz <= MOB_R; dz++)
      for (let dx = -MOB_R; dx <= MOB_R; dx++) {
        const k = ckey(pcx + dx, pcz + dz);
        if (CHK.has(k) && MESH.has(k)) {
          want.add(k);
          const fresh = !MOBS.has(k);
          spawnMobChunk(pcx + dx, pcz + dz);
          if (fresh) pruneKilled(k);
          syncDayRest(k, fresh); // a chunk loaded by day starts with its sleepers already out of sight
          syncNightProwler(pcx + dx, pcz + dz);
          syncNetworkAttack(pcx + dx, pcz + dz);
        }
      }
    for (const k of [...MOBS.keys()]) if (!want.has(k)) despawnMobChunk(k);
    // a guardian whose validator was just relit (by anyone) disappears for good
    for (const list of MOBS.values())
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i];
        if (a.type === 'guardian' && get(a.rx, a.ry + 1, a.rz) !== 73) {
          scene.remove(a.g);
          list.splice(i, 1);
        }
      }
  }
  for (const list of MOBS.values())
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.hp <= 0 && a.down > 0) {
        // a dormant Merge twin: shrunk and spinning on the spot, until its window runs out
        a.down -= dt;
        a.g.scale.setScalar(0.5);
        a.g.rotation.y += dt * 3;
        if (a.down <= 0) {
          a.down = 0;
          a.hp = Math.round(MK[a.type].hp * 0.6);
          a.g.scale.setScalar(a.type === 'pow_twin' ? 1.5 : 1.4);
          toastInfo(`${MK[a.type].n} rises again — they must fall together`);
          Sound.animal(a.type, 1);
        }
        continue;
      }
      if (a.hp <= 0) {
        mobBurst(a);
        a.dying -= dt;
        a.g.scale.setScalar(Math.max(0, a.dying / 0.4));
        if (a.dying <= 0) {
          scene.remove(a.g);
          list.splice(i, 1);
          KILLED.set(a.k + '|' + a.i, performance.now());
        }
        continue;
      }
      const K = MK[a.type],
        p = a.g.position,
        tg = mobTarget(a), // you, or another player nearby: whoever is closest, the same on every screen
        d = tg ? tg.d : Infinity, // in 3D: a buried mob doesn't bite through rock
        aggro = d < K.aggro && !mobSafe(p.x, p.z);
      // another player leads it (it's after them): this screen only follows where their screen puts it
      if (a.remote && performance.now() - a.remote.t < FOLLOW_MS) {
        a.lead = false;
        if (a.provoked > 0) a.provoked -= dt;
        if (K.blink) frontRun(a, K, tg, d, false, dt); // its Sandwich Bots still come at half health
        followMob(a, dt);
        continue;
      }
      a.remote = null;
      a.windF = false; // this screen runs it again: its own wind-up (windT) counts
      a.lead = !!(aggro && tg && tg.me); // it's after you: your screen leads it, the others follow
      a.leadD = d;
      // the shared logic moves it, and strikes or fires at you through MOB_EV
      const st = MobsCore.step(MOB_W, a, tg, dt, MOB_EV);
      if (st.stunned) {
        // stunned by a parry: it sways on the spot
        a.g.rotation.z = a.stunT > 0 ? Math.sin(a.stunT * 18) * 0.15 : 0;
        continue;
      }
      a.g.rotation.z = 0;
      animateMob(a, dt, st.moving, st.aggro);
    }
  sendLedMobs(dt);
}
