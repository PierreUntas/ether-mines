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
const MOBS = new Map(),
  MOB_R = 2; // radius, in chunks, around the player
// difficulty pass: every mob's hp/dmg raised and speed brought up near (or, for the toughest, past)
// the player's own walk speed of 4.4 (05-player.js, moveAxis 'sp') — before this, only the tower
// mobs could actually close a chase; walking away from everything else worked indefinitely, which
// made "hostile" mobs more decorative than dangerous
const MK = {
  shadow: { n: 'Rift Shadow', hp: 10, dmg: 2, sp: 2.2, aggro: 12, atk: 1.1, cd: 0.85, kb: 4, hit: [0.5, 1.3, 0.5] },
  guardian: { n: 'Corrupted Guardian', hp: 19, dmg: 3.2, sp: 2.4, aggro: 13, atk: 1.4, cd: 0.9, kb: 3, hit: [0.8, 1.9, 0.7] },
  sentinel: { n: 'Geode Sentinel', hp: 14, dmg: 2.6, sp: 2.3, aggro: 12, atk: 1.3, cd: 0.9, kb: 4, hit: [0.6, 1.2, 0.6] },
  wraith: { n: 'Genesis Wraith', hp: 22, dmg: 3.8, sp: 2.4, aggro: 14, atk: 1.5, cd: 1.0, kb: 3, hit: [0.9, 2.1, 0.8] },
  // a single, fixed-location boss (not one-per-chunk like the others): see spawnMobChunk's BOSS_CX/BOSS_CZ check
  // slow on its feet, so (playtest) easy to whittle down from afar: it now hurls chunks of genesis rock
  // when you keep your distance, and charges (rush) to close the gap
  titan: {
    n: 'Genesis Titan',
    hp: 120,
    dmg: 7.5,
    sp: 2.0,
    aggro: 20,
    atk: 1.9,
    cd: 1.1,
    kb: 2,
    hit: [1.6, 3.6, 1.4],
    rush: { speed: 6.5, time: 1.3, every: 5, min: 6 },
    ranged: { dmg: 4, speed: 10, charge: 0.6, burst: 1, every: 2.4, min: 5, color: 0xffb347, size: 2.6 },
  },
  // towers (towerAt(), world.js): a warden per floor on the way up, a Plasma Core at the top —
  // repeatable, unlike the Titan, so every tower has its own — already fast before this pass, so
  // only hp/dmg/cd moved
  warden: { n: 'Tower Warden', hp: 16, dmg: 2.6, sp: 3.0, aggro: 11, atk: 1.5, cd: 1.0, kb: 2, hit: [0.8, 2.3, 0.7] },
  // tower turrets: bolted to a floor (sp 0), they charge then fire a slow bolt you can sidestep or
  // block with a wall — the first enemy that hits from a distance (ranged, see fireMobBolt)
  turret: {
    n: 'Tower Turret',
    hp: 12,
    dmg: 0,
    sp: 0,
    aggro: 14,
    atk: 0,
    cd: 2.8,
    kb: 0,
    hit: [0.9, 1.5, 0.9],
    ranged: { dmg: 1.8, speed: 8, charge: 0.9, burst: 1, color: 0x5fe8ff },
  },
  // floats over its loggia: rams you up close, and from further away fires bursts of plasma bolts
  plasma_core: {
    n: 'Plasma Core',
    hp: 45,
    dmg: 5.5,
    sp: 3.0,
    aggro: 15,
    atk: 1.8,
    cd: 0.9,
    kb: 2,
    hit: [1.4, 2.6, 1.4],
    ranged: { dmg: 3, speed: 11, charge: 0.5, burst: 3, gap: 0.22, every: 2.6, min: 3, color: 0xff5bff },
  },
  // guards the Ether Gardens (gardenAt(), world.js), same ground pathing as every validator/rock guard above
  garden_guardian: { n: 'Garden Guardian', hp: 15, dmg: 2.9, sp: 2.3, aggro: 12, atk: 1.3, cd: 0.9, kb: 3, hit: [0.7, 1.6, 0.6] },
  // only out on the open surface after dark (synced in updateMobs, not a fixed per-chunk spawn like
  // every mob above — see syncNightProwler)
  prowler: { n: 'Night Prowler', hp: 11, dmg: 2.6, sp: 2.6, aggro: 13, atk: 1.2, cd: 0.85, kb: 4, hit: [0.55, 0.55, 0.9] },
  // flies free on the floating islands, no ground snap (updateMobs' flying/swimming branch)
  sky_raider: { n: 'Sky Raider', hp: 12, dmg: 2.9, sp: 2.8, aggro: 12, atk: 1.3, cd: 0.85, kb: 3, hit: [0.6, 0.5, 0.6] },
  // stays within its home water column, no ground snap either (same branch, see a.wlo)
  water_lurker: { n: 'Deep Lurker', hp: 17, dmg: 3.5, sp: 2.4, aggro: 11, atk: 1.4, cd: 1.0, kb: 3, hit: [0.5, 0.6, 1.1] },
  // a second cave dweller alongside the Rift Shadow: flies the same air pockets (updateMobs'
  // flying branch), erratic and fast, so a cave fight is no longer purely ground-based
  bat: { n: 'Rift Bat', hp: 9, dmg: 2.4, sp: 3.0, aggro: 12, atk: 1.2, cd: 0.8, kb: 3, hit: [0.4, 0.4, 0.6] },
  // a second ruin guard alongside the Corrupted Guardian — unlike it, not tied to the validator's
  // relit state, so a ruin stays dangerous even after you've relit it
  crawler: { n: 'Rust Crawler', hp: 15, dmg: 2.8, sp: 2.6, aggro: 12, atk: 1.3, cd: 0.85, kb: 3, hit: [0.6, 0.5, 1.0] },
  // a second geode guard alongside the agile Sentinel: slow but hits hard and shrugs off more —
  // a tank to the Sentinel's skirmisher
  golem: { n: 'Geode Golem', hp: 26, dmg: 4.2, sp: 1.7, aggro: 11, atk: 1.6, cd: 1.3, kb: 5, hit: [0.9, 1.7, 0.8] },
  // the network attack event (027_network_attack.sql, syncNetworkAttack below): only exists near the
  // Atrium, only during the hourly window — group-fight weight, not solo-trivial, not boss-tier
  corrupted_node: { n: 'Corrupted Node', hp: 20, dmg: 3.4, sp: 2.6, aggro: 14, atk: 1.3, cd: 0.9, kb: 3, hit: [0.8, 1.8, 0.7] },
  // the Merge Sanctum's twin bosses (mergeAt(), world.js): a slow, heavy proof-of-work rig and a fast,
  // floating proof-of-stake crystal. Strike one down and it only falls dormant for TWIN_DOWN seconds:
  // unless its twin falls too in that window, it rises again. Both must go down together (damageMob).
  pow_twin: { n: 'Proof-of-Work', hp: 60, dmg: 6, sp: 2.0, aggro: 16, atk: 1.8, cd: 1.2, kb: 2, hit: [1.3, 2.7, 1.1] },
  pos_twin: {
    n: 'Proof-of-Stake',
    hp: 40,
    dmg: 4,
    sp: 3.4,
    aggro: 18,
    atk: 1.6,
    cd: 0.8,
    kb: 3,
    hit: [1.0, 1.4, 1.0],
    ranged: { dmg: 2.5, speed: 11, charge: 0.4, burst: 2, gap: 0.25, every: 2.2, color: 0xc9b8ff },
  },
};
const TWIN_DOWN = 12;
// the Genesis Titan's lair: one fixed chunk, far from spawn, like a hand-placed landmark (ruinAt(0, 0)'s
// special-cased first ruin) rather than resource-distributed like every other mob
const BOSS_CX = Math.floor((SPAWN.x + 160) / CH),
  BOSS_CZ = Math.floor((SPAWN.z + 160) / CH);
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
  }
  if (a.type === 'titan') g.scale.setScalar(1.7);
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
  const a = {
    type,
    k,
    i,
    hp: MK[type].hp,
    hx: x,
    hy: y,
    hz: z,
    ph: hash(Math.floor(x), Math.floor(z), 223) * 60,
  };
  if (ruin) {
    a.rx = ruin.x;
    a.ry = ruin.y;
    a.rz = ruin.z;
  }
  buildMob(a);
  return a;
}
function spawnMobChunk(cx, cz) {
  const k = ckey(cx, cz);
  if (MOBS.has(k)) return;
  const list = [];
  MOBS.set(k, list);
  const x0 = cx * CH,
    z0 = cz * CH;
  // shadows: in the air pockets of the deep caves (below DEEP), with solid ground underneath
  const r = hash(cx * 17 + 3, cz * 29 + 5, 210);
  if (!sanctuary(x0 + 8, z0 + 8) && r < 0.2) {
    const n = r < 0.05 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const hx = x0 + 2 + Math.floor(hash(cx + i * 31, cz, 211 + i) * 12),
        hz = z0 + 2 + Math.floor(hash(cx, cz + i * 17, 219 + i) * 12);
      let hy = -1;
      for (let y = Math.min(DEEP - 1, SY - 2); y >= 2; y--) {
        if (!get(hx, y, hz) && isSolid(get(hx, y - 1, hz)) && !get(hx, y + 1, hz)) {
          hy = y;
          break;
        }
      }
      if (hy < 0) continue;
      list.push(mkMob('shadow', k, 100 + i, hx + 0.5, hy, hz + 0.5, null));
    }
  }
  // rift bats: a second cave dweller, same air-pocket search as the shadows above but its own
  // independent roll and position — a cave can have a shadow, a bat, both, or neither
  {
    const rb = hash(cx * 23 - 7, cz * 19 + 11, 215);
    if (!sanctuary(x0 + 8, z0 + 8) && rb < 0.18) {
      const hx = x0 + 2 + Math.floor(hash(cx, cz, 216) * 12),
        hz = z0 + 2 + Math.floor(hash(cx, cz, 217) * 12);
      let hy = -1;
      for (let y = Math.min(DEEP - 1, SY - 2); y >= 2; y--) {
        if (!get(hx, y, hz) && isSolid(get(hx, y - 1, hz)) && !get(hx, y + 1, hz)) {
          hy = y;
          break;
        }
      }
      if (hy >= 0) list.push(mkMob('bat', k, 105, hx + 0.5, hy, hz + 0.5, null));
    }
  }
  // guardians: around this region's ruin, as long as its validator isn't relit
  const rg = ruinAt(Math.floor((x0 + 8) / RUIN), Math.floor((z0 + 8) / RUIN));
  if (rg && cOf(rg.x) === cx && cOf(rg.z) === cz && get(rg.x, rg.y + 1, rg.z) === 73) {
    for (let i = 0; i < 2; i++) {
      const an = hash(rg.x + i, rg.z, 221) * Math.PI * 2,
        rr = 3 + hash(rg.x, rg.z + i, 222) * 2,
        hx = rg.x + 0.5 + Math.cos(an) * rr,
        hz = rg.z + 0.5 + Math.sin(an) * rr,
        gr = groundAt(hx, hz, rg.y, true, 3);
      if (!gr || gr.water) continue;
      list.push(mkMob('guardian', k, 110 + i, hx, gr.y, hz, rg));
    }
  }
  // rust crawlers: a second ruin guard, not tied to the validator's relit state (no condition on
  // get(rg.y+1)===73 here) — a ruin stays dangerous even once you've relit its validator
  if (rg && cOf(rg.x) === cx && cOf(rg.z) === cz && hash(rg.x + 5, rg.z + 7, 223) < 0.6) {
    for (let i = 0; i < 2; i++) {
      const an = hash(rg.x + i * 3, rg.z + i, 224) * Math.PI * 2,
        rr = 4 + hash(rg.x, rg.z + i * 2, 225) * 3,
        hx = rg.x + 0.5 + Math.cos(an) * rr,
        hz = rg.z + 0.5 + Math.sin(an) * rr,
        gr = groundAt(hx, hz, rg.y, true, 3);
      if (!gr || gr.water) continue;
      list.push(mkMob('crawler', k, 112 + i, hx, gr.y, hz, null));
    }
  }
  // geode sentinels: guard this chunk's pure ether geodes, below DEEP (sampled columns, not exhaustive)
  {
    let gx = -1,
      gy = -1,
      gz = -1;
    for (let i = 0; i < 5 && gx < 0; i++) {
      const hx = x0 + Math.floor(hash(cx + i * 13, cz, 230 + i) * CH),
        hz = z0 + Math.floor(hash(cx, cz + i * 19, 231 + i) * CH);
      for (let y = Math.min(DEEP - 1, SY - 2); y >= 2; y--) {
        if (get(hx, y, hz) === 69) {
          gx = hx;
          gy = y;
          gz = hz;
          break;
        }
      }
    }
    if (gx >= 0 && !sanctuary(gx, gz) && hash(cx * 31 + 7, cz * 23 + 11, 240) < 0.5) {
      const gr = groundAt(gx + 0.5, gz + 0.5, gy + 1, true, 3);
      if (gr && !gr.water) list.push(mkMob('sentinel', k, 120, gx + 0.5, gr.y, gz + 0.5, null));
    }
  }
  // geode golems: a second geode guard, its own independent sampled search so it isn't always
  // paired with the sentinel above — a slow tank where the sentinel is an agile skirmisher
  {
    let gx = -1,
      gy = -1,
      gz = -1;
    for (let i = 0; i < 5 && gx < 0; i++) {
      const hx = x0 + Math.floor(hash(cx + i * 43, cz, 241 + i) * CH),
        hz = z0 + Math.floor(hash(cx, cz + i * 47, 242 + i) * CH);
      for (let y = Math.min(DEEP - 1, SY - 2); y >= 2; y--) {
        if (get(hx, y, hz) === 69) {
          gx = hx;
          gy = y;
          gz = hz;
          break;
        }
      }
    }
    if (gx >= 0 && !sanctuary(gx, gz) && hash(cx * 37 + 9, cz * 41 + 3, 243) < 0.35) {
      const gr = groundAt(gx + 0.5, gz + 0.5, gy + 1, true, 3);
      if (gr && !gr.water) list.push(mkMob('golem', k, 125, gx + 0.5, gr.y, gz + 0.5, null));
    }
  }
  // genesis wraiths: guard genesis rock, right at the bottom near bedrock
  {
    let wx = -1,
      wy = -1,
      wz = -1;
    for (let i = 0; i < 5 && wx < 0; i++) {
      const hx = x0 + Math.floor(hash(cx + i * 41, cz, 250 + i) * CH),
        hz = z0 + Math.floor(hash(cx, cz + i * 37, 251 + i) * CH);
      for (let y = 4; y >= 1; y--) {
        if (get(hx, y, hz) === 72) {
          wx = hx;
          wy = y;
          wz = hz;
          break;
        }
      }
    }
    // measured against the real generator: genesis rock itself only sits in about half of the
    // deep chunks near bedrock, so this roll no longer needs to additionally halve that down to
    // guard it reliably whenever the rock is actually there
    // no sanctuary() check here, unlike the mobs above: the Atrium's own structure never reaches
    // anywhere near y<=4 (it's a thin shell around SPAWN.y, see world.js), so digging straight
    // down from spawn — the single most natural path to the bottom — stayed within the sanctuary's
    // x/z radius the whole way and silently voided every guard, no matter how deep
    if (wx >= 0 && hash(cx * 19 + 3, cz * 29 + 5, 260) < 0.9) {
      const gr = groundAt(wx + 0.5, wz + 0.5, wy + 1, true, 3);
      if (gr && !gr.water) list.push(mkMob('wraith', k, 130, wx + 0.5, gr.y, wz + 0.5, null));
    }
  }
  // tower wardens and the Plasma Core: a whole tower's roster spawns together, tied to the chunk
  // containing its base (towerAt(), world.js) — repeatable, unlike the Titan, so every tower has
  // its own, with the same respawn-on-revisit behavior as every other mob
  {
    const t = towerAt(Math.floor((x0 + 8) / TOWER), Math.floor((z0 + 8) / TOWER));
    if (t && cOf(t.x) === cx && cOf(t.z) === cz) {
      [1, 7, 13].forEach((fy, fi) => {
        // the floors are tight: one warden on the ground floor, one or two above (playtest: three at once in
        // that space, plus a turret, left no room to fight back)
        const n = fi === 0 ? 1 : hash(t.x + fi, t.z, 280 + fi) < 0.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const an = hash(t.x + fi * 3 + i, t.z, 281 + fi * 2 + i) * Math.PI * 2,
            rr = 1.5 + hash(t.x, t.z + fi * 3 + i, 282 + fi * 2 + i) * 3,
            hx = t.x + 0.5 + Math.cos(an) * rr,
            hz = t.z + 0.5 + Math.sin(an) * rr;
          list.push(mkMob('warden', k, 140 + fi * 3 + i, hx, t.y + fy, hz, null));
        }
      });
      const core = mkMob('plasma_core', k, 150, t.x + 0.5, t.y + 21, t.z + 0.5, null);
      core.arena = { x: t.x + 0.5, z: t.z + 0.5, r: 4.5, y: t.y + 20 }; // floats over the loggia (under its roof at t.y + 24), never leaves it
      list.push(core);
      // a turret on the first and second floors, in the corner across from the ladder (world.js LADX/LADZ)
      list.push(mkMob('turret', k, 155, t.x - 3.5, t.y + 7, t.z + 4.5, null));
      list.push(mkMob('turret', k, 156, t.x + 4.5, t.y + 13, t.z + 4.5, null));
    }
  }
  // the Merge Sanctum's twins (mergeAt(), world.js): proof-of-work on the forge half (west), proof-of-
  // stake over the crystal half (east), linked so each knows when the other falls; both stay on the disc
  {
    const m = mergeAt(Math.floor((x0 + 8) / MERGE), Math.floor((z0 + 8) / MERGE));
    if (m && cOf(m.x) === cx && cOf(m.z) === cz) {
      const arena = { x: m.x + 0.5, z: m.z + 0.5, r: MERGE_R - 1.5, y: m.y + 1 },
        pw = mkMob('pow_twin', k, 160, m.x - 5.5, m.y + 1, m.z + 0.5, null),
        ps = mkMob('pos_twin', k, 161, m.x + 6.5, m.y + 2.5, m.z + 0.5, null);
      pw.arena = ps.arena = arena;
      pw.twin = ps;
      ps.twin = pw;
      list.push(pw, ps);
    }
  }
  // the Genesis Titan: a single boss in its own fixed lair (BOSS_CX/BOSS_CZ), not distributed per-chunk
  // like the mobs above — it respawns whenever the chunk is visited again, same as any other mob
  if (cx === BOSS_CX && cz === BOSS_CZ) {
    const bx = x0 + 8,
      bz = z0 + 8;
    let by = -1;
    // a wider range than the wraiths' (which key off an actual genesis rock block): this is a fixed,
    // hand-placed column, so it must reliably find *some* standing spot near the bottom, cave or not
    for (let y = 25; y >= 1; y--) {
      if (!get(bx, y, bz) && isSolid(get(bx, y - 1, bz))) {
        by = y;
        break;
      }
    }
    if (by >= 0) {
      const gr = groundAt(bx + 0.5, bz + 0.5, by, true, 3);
      if (gr && !gr.water) list.push(mkMob('titan', k, 0, bx + 0.5, gr.y, bz + 0.5, null));
    }
  }
  // garden guardians: around this region's Ether Garden (gardenAt(), world.js), same ring placement
  // as the guardians around a ruin — gardens have no "relit" toggle, so these never disappear
  const gd = gardenAt(Math.floor((x0 + 8) / 64), Math.floor((z0 + 8) / 64));
  if (gd && cOf(gd.x) === cx && cOf(gd.z) === cz) {
    for (let i = 0; i < 2; i++) {
      const an = hash(gd.x + i, gd.z, 265) * Math.PI * 2,
        rr = 3 + hash(gd.x, gd.z + i, 266) * 2,
        hx = gd.x + 0.5 + Math.cos(an) * rr,
        hz = gd.z + 0.5 + Math.sin(an) * rr,
        gr = groundAt(hx, hz, gd.y, true, 3);
      if (!gr || gr.water) continue;
      list.push(mkMob('garden_guardian', k, 160 + i, hx, gr.y, hz, null));
    }
  }
  // sky raiders: hostile, on the floating islands — same islandTop() placement as the passive sky
  // jellyfish (09-animals.js), with their own rarity roll
  {
    const r3 = hash(cx * 5 - 3, cz * 11 + 7, 290);
    if (r3 < 0.22) {
      const hx = x0 + 4 + Math.floor(hash(cx, cz, 291) * 12),
        hz = z0 + 4 + Math.floor(hash(cx, cz, 292) * 12),
        t = islandTop(hx, hz);
      if (t > 0) list.push(mkMob('sky_raider', k, 170, hx + 0.5, t + 3, hz + 0.5, null));
    }
  }
  // deep lurkers: only in genuinely deep water (at least 5 blocks), not a shallow pond or river —
  // same topSolid()-then-walk-down depth probe the (passive) fish already use (09-animals.js)
  {
    const r4 = hash(cx * 11 + 5, cz * 7 - 2, 300);
    if (!sanctuary(x0 + 8, z0 + 8) && r4 < 0.2) {
      const hx = x0 + 4 + Math.floor(hash(cx, cz, 301) * 12),
        hz = z0 + 4 + Math.floor(hash(cx, cz, 302) * 12),
        top = topSolid(hx, hz);
      if (top && top.id === 11) {
        let b = top.y;
        while (b > 0 && get(hx, b - 1, hz) === 11) b--;
        if (top.y - b >= 5) {
          const m = mkMob('water_lurker', k, 180, hx + 0.5, b + (top.y - b) / 2, hz + 0.5, null);
          m.wlo = b;
          list.push(m);
        }
      }
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
  if (skyU.night.value < 0.55) return;
  const x0 = cx * CH,
    z0 = cz * CH;
  if (mobSafe(x0 + 8, z0 + 8) || hash(cx * 23 + 9, cz * 31 + 13, 310) > 0.3) return;
  const hx = x0 + 2 + Math.floor(hash(cx, cz, 311) * 12),
    hz = z0 + 2 + Math.floor(hash(cx, cz, 312) * 12);
  if (heightAt(hx, hz) <= SEA + 1 || islandTop(hx, hz) > 0) return; // no prowlers over water or islands
  const gr = groundAt(hx + 0.5, hz + 0.5, heightAt(hx, hz), true, 2);
  if (!gr || gr.water) return;
  list.push(mkMob('prowler', k, 190, hx + 0.5, gr.y, hz + 0.5, null));
}
// the network attack event (027_network_attack.sql): same shape as syncNightProwler — a condition
// (the hourly window, attackWindow() in 07-interface.js) flips rather than a chunk loading once, so it
// runs every tick too. Only the Atrium's own chunk hosts the wave; a stable ring position per window
// slot means a killed node reappears right where it fell instead of drifting around — "converges on
// the Atrium" stays readable as one wave under pressure, not a scatter of one-off spawns.
const ATTACK_SLOTS = 7;
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
  for (let slot = 0; slot < ATTACK_SLOTS; slot++) {
    if (taken.has(slot)) continue;
    const an = hash(aw.windowId, slot, 401) * Math.PI * 2,
      r = 10 + hash(aw.windowId, slot, 402) * 6,
      hx = SPAWN.x + Math.cos(an) * r,
      hz = SPAWN.z + Math.sin(an) * r,
      gr = groundAt(hx, hz, heightAt(hx, hz), true, 2);
    if (!gr || gr.water) continue;
    const a = mkMob('corrupted_node', k, 400 + slot, hx, gr.y, hz, null);
    a.windowId = aw.windowId;
    a.slot = slot;
    list.push(a);
  }
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
  $('hp').hidden = false;
  $('hp').innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="${i < S.hp ? '' : 'empty'}">♥</span>`).join('');
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
function damageMob(a, dmg, fromX, fromZ) {
  if (a.arena && a.twin && Math.hypot(P.x - a.arena.x, P.z - a.arena.z) > a.arena.r + 2.5) {
    dmg *= 0.15;
    if (performance.now() - twinShieldToast > 15000) {
      twinShieldToast = performance.now();
      toastInfo('The sanctum shields the twins from afar: step onto the disc to really hurt them');
    }
  }
  a.hp -= dmg;
  Sound.hit('pierre');
  const K = MK[a.type],
    dx = a.g.position.x - fromX,
    dz = a.g.position.z - fromZ,
    dd = Math.hypot(dx, dz) || 1;
  a.kbx = (dx / dd) * K.kb;
  a.kbz = (dz / dd) * K.kb;
  a.kbT = 0.25;
  if (a.hp <= 0 && a.twin) {
    // the Merge twins: the first to fall only goes dormant; if its twin is already dormant, both are
    // done for good — together, which is the only way they stay down
    a.hp = 0;
    Sound.animal(a.type, 1);
    S.killedMob = 1;
    dirty = true;
    if (a.twin.hp > 0) {
      a.down = TWIN_DOWN;
      toastInfo(`${MK[a.type].n} falls dormant… strike ${MK[a.twin.type].n} down within ${TWIN_DOWN} s, or it rises again`);
    } else {
      a.down = a.twin.down = 0;
      a.dying = a.twin.dying = 0.4;
      lootMob('merge_twins');
    }
    return;
  }
  if (a.hp <= 0) {
    a.hp = 0;
    a.dying = 0.4;
    Sound.animal(a.type, 1);
    lootMob(a.type);
    S.killedMob = 1;
    if (a.type === 'corrupted_node') S.defended = 1;
    dirty = true;
  }
}
function attackMob(a, dt) {
  playerAtkT = Math.max(0, playerAtkT - dt);
  swing = Math.max(swing, 0.6);
  if (playerAtkT > 0) return;
  playerAtkT = 0.45;
  damageMob(a, heldDmg(), P.x, P.z);
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
function fireRanged(dt) {
  rangedT = Math.max(0, rangedT - dt);
  swing = Math.max(swing, 0.5);
  if (rangedT > 0) return;
  rangedT = 0.35;
  // always straight down the crosshair (screen center), never wherever a touch/click happened to
  // land — unlike melee's pickMob/pickPlayer/pickAnimal, a long thin bolt makes any aim/crosshair
  // mismatch obvious, so this intentionally ignores `aim` and always takes aimRay's forward branch
  const ray = aimRay(),
    dir = ray.direction;
  const m = new THREE.Mesh(boltGeo, boltMat);
  m.position.copy(ray.origin);
  scene.add(m);
  BOLTS.push({ m, vx: dir.x * BOLT_SPEED, vy: dir.y * BOLT_SPEED, vz: dir.z * BOLT_SPEED, life: BOLT_LIFE, dmg: heldDmg() });
  Sound.shoot();
}
// ---------- mobs that hit from a distance: turrets and the Plasma Core ----------
// A charge (a turret's lens swells, so you see it coming), then a burst of slow bolts aimed where you
// stand when each leaves — sidestep them, or put a wall between you: a bolt dies on the first solid block.
const MOB_BOLTS = [],
  mobBoltMats = new Map();
const MOB_BOLT_LIFE = 3;
// is there a clear line from (a) to (b)? half-block steps through the world
function lineClear(ax, ay, az, bx, by, bz) {
  const dist = Math.hypot(bx - ax, by - ay, bz - az),
    n = Math.ceil(dist / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolid(get(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t)))) return false;
  }
  return true;
}
// where a mob's shots leave from: a turret's lens, the middle of anything else
function mobEye(a) {
  const p = a.g.position;
  return [p.x, p.y + MK[a.type].hit[1] * (a.type === 'turret' ? 0.8 : 0.5), p.z];
}
function fireMobBolt(a, R) {
  const [x, y, z] = mobEye(a),
    tx = P.x,
    ty = P.y + 1.2,
    tz = P.z,
    dd = Math.hypot(tx - x, ty - y, tz - z) || 1;
  if (!mobBoltMats.has(R.color)) mobBoltMats.set(R.color, new THREE.MeshBasicMaterial({ color: R.color }));
  const m = new THREE.Mesh(boltGeo, mobBoltMats.get(R.color));
  m.scale.setScalar(R.size || 1.6);
  m.position.set(x, y, z);
  scene.add(m);
  MOB_BOLTS.push({
    m,
    vx: ((tx - x) / dd) * R.speed,
    vy: ((ty - y) / dd) * R.speed,
    vz: ((tz - z) / dd) * R.speed,
    life: MOB_BOLT_LIFE,
    dmg: R.dmg,
    ox: x,
    oz: z,
  });
  Sound.hit('pierre');
}
function rangedAttack(a, K, aggro, d, dt) {
  const R = K.ranged;
  if (a.shots > 0) {
    // mid-burst: the next bolt after a short gap
    a.gapT -= dt;
    if (a.gapT <= 0) {
      fireMobBolt(a, R);
      a.shots--;
      a.gapT = R.gap || 0.2;
    }
    return;
  }
  const [ex, ey, ez] = mobEye(a),
    canShoot = aggro && d > (R.min || 0) && lineClear(ex, ey, ez, P.x, P.y + 1.2, P.z);
  if (a.chargeT > 0) {
    a.chargeT -= dt;
    if (a.parts.lens) a.parts.lens.scale.setScalar(1 + (1 - a.chargeT / R.charge) * 1.8);
    if (a.chargeT <= 0) {
      if (a.parts.lens) a.parts.lens.scale.setScalar(1);
      if (canShoot) {
        fireMobBolt(a, R);
        a.shots = (R.burst || 1) - 1;
        a.gapT = R.gap || 0.2;
      }
      a.rangedT = R.every || K.cd;
    }
    return;
  }
  a.rangedT = Math.max(0, (a.rangedT || 0) - dt);
  if (canShoot && a.rangedT <= 0) a.chargeT = R.charge;
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
      if (hurtT <= 0) hurtPlayer(b.dmg, b.ox, b.oz);
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
            damageMob(a, b.dmg, p.x, p.z);
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
};
function lootMob(type) {
  if (SERVER()) {
    serverAct('loot_mob', { mob_type: type }, null, 'mob loot').then(r => {
      if (r && r.item) {
        logEv('burn', `1 ${ITEM[r.item].n}`, `→ dropped by a ${MK[type].n.toLowerCase()}`);
        Sound.chime();
      }
      if (r && r.unique) {
        addUnique(r.unique);
        toastInfo((BOSS_TOAST[r.unique.id] || (() => `${ITEM[r.unique.id].n} earned`))());
        Sound.chime();
      }
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
    });
    return;
  }
  if (type === 'titan' || type === 'plasma_core' || type === 'merge_twins') {
    const id = type === 'titan' ? 205 : type === 'plasma_core' ? 206 : 209;
    mintNft(id, null);
    toastInfo(BOSS_TOAST[id]());
    Sound.chime();
    if (Math.random() < 0.2) {
      const bonusId = type === 'titan' ? 207 : type === 'plasma_core' ? 208 : 210;
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
                            : false;
  if (it) give(it, 1, `dropped by a ${MK[type].n.toLowerCase()}`);
}
// PvP: like attackMob, but the target's hp lives only in the target's own client (same as another
// player's position) — this just reports the swing; the receiving end decides whether to apply it
function attackPlayer(target, dt) {
  playerAtkT = Math.max(0, playerAtkT - dt);
  swing = Math.max(swing, 0.6);
  if (playerAtkT > 0) return;
  playerAtkT = 0.45;
  Sound.hit('pierre');
  Net.sendHit({ from: ME.id, to: target.id, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), item: itemId(S.bar[S.sel]) });
}
function hurtPlayer(dmg, mx, mz) {
  const reduction = ITEM[S.armor]?.armor || 0;
  dmg = Math.max(1, Math.round(dmg * (1 - reduction)));
  S.hp = Math.max(0, S.hp - dmg);
  regenT = 6;
  hurtT = 0.5;
  hpBarOn = true;
  const dx = P.x - mx,
    dz = P.z - mz,
    dd = Math.hypot(dx, dz) || 1;
  moveAxis('x', (dx / dd) * 2.4);
  moveAxis('z', (dz / dd) * 2.4);
  P.vy = Math.max(P.vy, 4);
  Sound.hurt();
  $('vignette').classList.add('hurt');
  setTimeout(() => $('vignette').classList.remove('hurt'), 220);
  dirty = true;
  updateHpUI();
  if (S.hp <= 0) die();
}
function die() {
  logEv('burn', 'You fell in combat', 'back to the sanctuary');
  P.x = SPAWN.x + 0.5;
  P.y = SPAWN.y + 0.1;
  P.z = SPAWN.z + 2.5;
  P.vy = 0;
  S.hp = 10;
  hurtT = 1.2;
  pvpGraceUntil = performance.now() + 2000;
  updateHpUI();
}
let mobT = 0;
function updateMobs(dt) {
  if (!REG.mobs) {
    if (MOBS.size) for (const k of [...MOBS.keys()]) despawnMobChunk(k);
    return;
  }
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
          spawnMobChunk(pcx + dx, pcz + dz);
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
  regenT = Math.max(0, regenT - dt);
  hurtT = Math.max(0, hurtT - dt);
  if (regenT <= 0 && S.hp < 10) {
    regenT = 4;
    S.hp++;
    dirty = true;
    updateHpUI();
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
        a.dying -= dt;
        a.g.scale.setScalar(Math.max(0, a.dying / 0.4));
        if (a.dying <= 0) {
          scene.remove(a.g);
          list.splice(i, 1);
        }
        continue;
      }
      const K = MK[a.type],
        p = a.g.position,
        d = Math.hypot(p.x - P.x, p.y - P.y, p.z - P.z), // in 3D: a buried mob doesn't bite through rock
        aggro = d < K.aggro && !mobSafe(p.x, p.z);
      let tx, tz;
      if (aggro) {
        tx = P.x;
        tz = P.z;
      } else {
        const T = Date.now() / 1000 + a.ph;
        tx = a.hx + Math.sin(T * 0.3) * 2;
        tz = a.hz + Math.cos(T * 0.23) * 2;
      }
      // a rush (the Titan): a few seconds of sprint toward you when you hang back, then a cooldown
      if (K.rush) {
        a.rushCd = Math.max(0, (a.rushCd || 0) - dt);
        if (a.rushT > 0) a.rushT -= dt;
        else if (aggro && d > K.rush.min && a.rushCd <= 0) {
          a.rushT = K.rush.time;
          a.rushCd = K.rush.every;
        }
      }
      const spd = (aggro ? (a.rushT > 0 ? K.rush.speed : K.sp) : K.sp * 0.35) * dt,
        dx = tx - p.x,
        dz = tz - p.z,
        dd = Math.hypot(dx, dz);
      let nx = p.x,
        nz = p.z;
      if (dd > 0.05) {
        const step = Math.min(dd, spd);
        nx += (dx / dd) * step;
        nz += (dz / dd) * step;
        let dr = Math.atan2(dx, dz) - a.g.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        a.g.rotation.y += dr * Math.min(1, dt * 6);
      }
      if (a.kbT > 0) {
        a.kbT -= dt;
        nx += a.kbx * dt;
        nz += a.kbz * dt;
      }
      if (a.arena) {
        // the twins never leave their disc: pulled back onto it at its edge
        const ox = nx - a.arena.x,
          oz = nz - a.arena.z,
          od = Math.hypot(ox, oz);
        if (od > a.arena.r) {
          nx = a.arena.x + (ox / od) * a.arena.r;
          nz = a.arena.z + (oz / od) * a.arena.r;
        }
      }
      p.x = nx;
      p.z = nz;
      // flying (sky_raider, bat) and swimming (water_lurker) mobs skip the ground snap entirely and
      // just lerp toward a free vertical target instead: the player's height when giving chase
      // (clamped to the water column for a lurker, which can't leave its water), or a gentle bob
      // near home otherwise — a bat's cave air pocket is tight, so its bob is much smaller
      if (a.type === 'sky_raider' || a.type === 'water_lurker' || a.type === 'bat' || a.type === 'pos_twin' || a.type === 'plasma_core') {
        const T = Date.now() / 1000;
        const ty =
          a.type === 'plasma_core'
            ? clamp(aggro ? P.y + 0.2 : a.arena.y + 0.5 + Math.sin(T * 0.8 + a.ph) * 0.3, a.arena.y + 0.2, a.arena.y + 1)
            : a.type === 'pos_twin'
              ? Math.max(a.arena.y + 0.3, aggro ? P.y + 0.4 : a.hy + Math.sin(T * 0.9 + a.ph) * 0.6)
              : a.type === 'water_lurker'
                ? aggro
                  ? clamp(P.y, a.wlo + 0.4, a.hy - 0.2)
                  : a.hy - 0.5 + Math.sin(T * 0.5 + a.ph) * 0.3
                : a.type === 'bat'
                  ? aggro
                    ? P.y + 0.3
                    : a.hy + Math.sin(T * 1.4 + a.ph) * 0.4
                  : aggro
                    ? P.y + 0.5
                    : a.hy + Math.sin(T * 0.6 + a.ph) * 1.1;
        p.y += (ty - p.y) * Math.min(1, dt * 3);
      } else {
        const gr = groundAt(nx, nz, p.y + 0.3, false, 2);
        if (gr && !gr.water) p.y += (gr.y - p.y) * Math.min(1, dt * 10);
      }
      a.walk = (a.walk || 0) + dt * (dd > 0.1 ? 8 : 1.5);
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
      a.atkT = Math.max(0, (a.atkT || 0) - dt);
      if (K.ranged) rangedAttack(a, K, aggro, d, dt);
      if (aggro && d < K.atk && hurtT <= 0 && a.atkT <= 0) {
        a.atkT = K.cd;
        hurtPlayer(K.dmg, p.x, p.z);
      }
    }
}
