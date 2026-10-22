// Ether Mines · The hostile mobs' logic, shared by the game (src/game/16-mobs.js) and the game server
// (server/src/mobs.js): what each mob is (MK), where they stand in the world (spawnChunk and friends,
// derived from the seed and the terrain, the same everywhere), who they're after (target) and how they
// move and strike (step). Nothing here draws anything: a mob is a plain object, its position `p` and
// rotation `r` (the game passes its Three.js mesh's own position and rotation, the server plain objects).
// The world is reached through W: { get(x, y, z), isSolid(id) }.
// Script with no import or export, like world.js: loaded via <script> in the game, evaluated by the server.
(function (root) {
  'use strict';
  const { CH, SY, DEEP, SPAWN, CITY, RUIN, TOWER, TOWER_LADDER, MERGE, MERGE_R, ARENA, ARENA_R, ARENA_W } = root.World,
    { hash, ckey, cOf, onPath, ruinAt, gardenAt, towerAt, mergeAt, arenaAt, islandTop, heightAt, SEA } = root.World,
    clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // the mobs that fly or swim: they don't walk on the ground, so walls don't stop them
  const FLYERS = new Set(['sky_raider', 'water_lurker', 'bat', 'pos_twin', 'plasma_core']);
  const MOB_R = 2; // radius, in chunks, around each player where mobs live
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
    // the Mempool's boss (arenaAt(), world.js): a MEV bot that reads your next move in the mempool and
    // gets there first. It dashes at you (rush), fires bursts of gas bolts, and every few seconds blinks to
    // the far side of whoever it hunts (frontRun). Below half health it calls in two Sandwich Bots, one
    // each side of you, and everything comes faster. Built for two or three players: lots of hp, a wide floor.
    front_runner: {
      n: 'The Front-Runner',
      hp: 170,
      dmg: 5.5,
      sp: 3.4,
      aggro: 24,
      atk: 2.0,
      cd: 1.0,
      kb: 1.2,
      hit: [1.5, 3.4, 1.5],
      rush: { speed: 10, time: 0.8, every: 4.5, min: 6 },
      ranged: { dmg: 3, speed: 12, charge: 0.55, burst: 3, gap: 0.2, every: 3.2, min: 7, color: 0x7fe8ff, size: 2.4 },
      blink: { every: 8, fast: 5, min: 4 },
    },
    // the Front-Runner's minions: quick, light, they hem you in from both sides (the sandwich)
    mev_bot: { n: 'Sandwich Bot', hp: 16, dmg: 2.5, sp: 3.9, aggro: 30, atk: 1.2, cd: 0.8, kb: 4, hit: [0.8, 1.2, 0.8] },
  };

  const TWIN_DOWN = 12; // s: a Merge twin struck down only sleeps this long, unless its twin falls too
  const LADDER_CLEAR = 2.2;
  // a killed mob stays dead this long (s); every other mob: 2 minutes
  const RESPAWN_S = { corrupted_node: 25 };
  // daytime rest: by day the hostile mobs are out of sight, and they come back at dusk. Only the validators'
  // guards stay on watch (the guardians and crawlers of the ruins, the network attack's nodes, the towers'
  // wardens and turrets: a tower is a dungeon you climb on purpose), and the bosses with the Front-Runner's
  // bots: a boss fight is something you go looking for
  const DAY_WATCH = new Set([
    'guardian',
    'crawler',
    'warden',
    'turret',
    'corrupted_node',
    'titan',
    'plasma_core',
    'pow_twin',
    'pos_twin',
    'front_runner',
    'mev_bot',
  ]);
  // mobs the Ward Incense never fools: guardians of ruins and gardens, tower wardens and turrets, bosses,
  // the network attack's nodes
  const WARD_IMMUNE = new Set([
    'guardian',
    'garden_guardian',
    'warden',
    'turret',
    'titan',
    'plasma_core',
    'pow_twin',
    'pos_twin',
    'front_runner',
    'mev_bot',
    'corrupted_node',
  ]);
  // the Genesis Titan's lair: one fixed chunk, far from spawn, like a hand-placed landmark
  const BOSS_CX = Math.floor((SPAWN.x + 160) / CH),
    BOSS_CZ = Math.floor((SPAWN.z + 160) / CH);

  // ---------- the places nobody is hunted ----------
  // the Atrium and the City (also the build protection, 06-actions.js)
  const sanctuary = (x, z) =>
    Math.hypot(Math.floor(x) - SPAWN.x, Math.floor(z) - SPAWN.z) <= 7.9 ||
    Math.hypot(Math.floor(x) - CITY.x, Math.floor(z) - CITY.z) <= CITY.R + 0.5;
  // mob danger only: also the validators path between them, widened well past its pavement — a
  // first-time player told to "follow the paved path north" mustn't be ambushed on the one route the game
  // points them down
  const mobSafe = (x, z) => sanctuary(x, z) || onPath(x, z, 6);

  // ---------- the shared clock (08-sky.js): one sky, one night, for every player of a world ----------
  const DAY_S = 480,
    WORLD_EPOCH = Date.UTC(2026, 9, 15) / 1000;
  function worldClock(now = Date.now()) {
    const d = (now / 1000 - WORLD_EPOCH) / DAY_S + 0.3; // + 0.3: day 0 starts in the morning
    return { day: d - Math.floor(d), n: Math.max(0, Math.floor(d)) };
  }
  // how dark it is (0 day, 1 night) at a time of day: the sun's height, as the sky draws it
  function nightOf(day) {
    const ang = (day - 0.25) * Math.PI * 2,
      y = Math.sin(ang) / Math.hypot(Math.cos(ang), Math.sin(ang), 0.35);
    return clamp(-y * 4, 0, 1);
  }
  // the network attack (027_network_attack.sql): an hourly window, from the clock alone
  function attackWindow(t = Date.now()) {
    const epoch = Math.floor(t / 1000),
      windowId = Math.floor(epoch / 3600);
    return { windowId, active: epoch % 3600 < 600, endsAt: (windowId * 3600 + 600) * 1000 };
  }

  // ---------- reading the terrain ----------
  // ground under (x, z): the first solid block going down from ref+up (trunks and leaves refused with noTree)
  function groundAt(W, x, z, ref, noTree, up = 4) {
    const xi = Math.floor(x),
      zi = Math.floor(z);
    for (let y = Math.min(SY - 1, Math.floor(ref) + up); y >= Math.max(0, Math.floor(ref) - 8); y--) {
      const id = W.get(xi, y, zi);
      if (id === 11) return { y: y + 1, water: true };
      if (noTree && (id === 5 || id === 7)) return null;
      if (W.isSolid(id)) return { y: y + 1, water: false };
    }
    return null;
  }
  function topSolid(W, x, z) {
    for (let y = SY - 1; y > 0; y--) {
      const id = W.get(x, y, z);
      if (!id || (W.isCross && W.isCross(id))) continue;
      return { id, y };
    }
    return null;
  }
  // is there a clear line from (a) to (b)? half-block steps through the world
  function lineClear(W, ax, ay, az, bx, by, bz) {
    const dist = Math.hypot(bx - ax, by - ay, bz - az),
      n = Math.ceil(dist / 0.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (W.isSolid(W.get(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t)))) return false;
    }
    return true;
  }

  // ---------- where the mobs stand ----------
  // a mob, as data. ruin: {x,y,z} of the validator a guardian guards
  function mob(type, k, i, x, y, z, ruin) {
    const a = {
      type,
      k,
      i,
      hp: MK[type].hp,
      hx: x,
      hy: y,
      hz: z,
      ph: hash(Math.floor(x), Math.floor(z), 223) * 60,
      p: { x, y, z },
      r: { y: 0 },
    };
    if (ruin) {
      a.rx = ruin.x;
      a.ry = ruin.y;
      a.rz = ruin.z;
    }
    return a;
  }
  const mobId = a => `${a.k}|${a.i}|${a.type}`;
  // every mob a chunk holds, from the seed and the terrain (the night prowler and the network attack's
  // nodes come and go with the clock: prowler() and attackNodes() below)
  function spawnChunk(W, cx, cz) {
    const k = ckey(cx, cz),
      list = [];
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
          if (!W.get(hx, y, hz) && W.isSolid(W.get(hx, y - 1, hz)) && !W.get(hx, y + 1, hz)) {
            hy = y;
            break;
          }
        }
        if (hy < 0) continue;
        list.push(mob('shadow', k, 100 + i, hx + 0.5, hy, hz + 0.5, null));
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
          if (!W.get(hx, y, hz) && W.isSolid(W.get(hx, y - 1, hz)) && !W.get(hx, y + 1, hz)) {
            hy = y;
            break;
          }
        }
        if (hy >= 0) list.push(mob('bat', k, 105, hx + 0.5, hy, hz + 0.5, null));
      }
    }
    // guardians: around this region's ruin, as long as its validator isn't relit
    const rg = ruinAt(Math.floor((x0 + 8) / RUIN), Math.floor((z0 + 8) / RUIN));
    if (rg && cOf(rg.x) === cx && cOf(rg.z) === cz && W.get(rg.x, rg.y + 1, rg.z) === 73) {
      // three of them (ids 110, 111, 114: 112-113 are the crawlers'), spread a third of a turn apart
      // so they surround the validator instead of bunching up
      const a0 = hash(rg.x, rg.z, 221) * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const an = a0 + (i * Math.PI * 2) / 3 + (hash(rg.x + i, rg.z, 226) - 0.5) * 0.8,
          rr = 3 + hash(rg.x, rg.z + i, 222) * 2,
          hx = rg.x + 0.5 + Math.cos(an) * rr,
          hz = rg.z + 0.5 + Math.sin(an) * rr,
          gr = groundAt(W, hx, hz, rg.y, true, 3);
        if (!gr || gr.water) continue;
        list.push(mob('guardian', k, i < 2 ? 110 + i : 114, hx, gr.y, hz, rg));
      }
    }
    // rust crawlers: a second ruin guard, not tied to the validator's relit state (no condition on
    // W.get(rg.y+1)===73 here) — a ruin stays dangerous even once you've relit its validator
    if (rg && cOf(rg.x) === cx && cOf(rg.z) === cz && hash(rg.x + 5, rg.z + 7, 223) < 0.6) {
      for (let i = 0; i < 2; i++) {
        const an = hash(rg.x + i * 3, rg.z + i, 224) * Math.PI * 2,
          rr = 4 + hash(rg.x, rg.z + i * 2, 225) * 3,
          hx = rg.x + 0.5 + Math.cos(an) * rr,
          hz = rg.z + 0.5 + Math.sin(an) * rr,
          gr = groundAt(W, hx, hz, rg.y, true, 3);
        if (!gr || gr.water) continue;
        list.push(mob('crawler', k, 112 + i, hx, gr.y, hz, null));
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
          if (W.get(hx, y, hz) === 69) {
            gx = hx;
            gy = y;
            gz = hz;
            break;
          }
        }
      }
      if (gx >= 0 && !sanctuary(gx, gz) && hash(cx * 31 + 7, cz * 23 + 11, 240) < 0.5) {
        const gr = groundAt(W, gx + 0.5, gz + 0.5, gy + 1, true, 3);
        if (gr && !gr.water) list.push(mob('sentinel', k, 120, gx + 0.5, gr.y, gz + 0.5, null));
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
          if (W.get(hx, y, hz) === 69) {
            gx = hx;
            gy = y;
            gz = hz;
            break;
          }
        }
      }
      if (gx >= 0 && !sanctuary(gx, gz) && hash(cx * 37 + 9, cz * 41 + 3, 243) < 0.35) {
        const gr = groundAt(W, gx + 0.5, gz + 0.5, gy + 1, true, 3);
        if (gr && !gr.water) list.push(mob('golem', k, 125, gx + 0.5, gr.y, gz + 0.5, null));
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
          if (W.get(hx, y, hz) === 72) {
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
        const gr = groundAt(W, wx + 0.5, wz + 0.5, wy + 1, true, 3);
        if (gr && !gr.water) list.push(mob('wraith', k, 130, wx + 0.5, gr.y, wz + 0.5, null));
      }
    }
    // tower wardens and the Plasma Core: a whole tower's roster spawns together, tied to the chunk
    // containing its base (towerAt(), world.js) — repeatable, unlike the Titan, so every tower has
    // its own, with the same respawn-on-revisit behavior as every other mob
    {
      const t = towerAt(Math.floor((x0 + 8) / TOWER), Math.floor((z0 + 8) / TOWER));
      if (t && cOf(t.x) === cx && cOf(t.z) === cz) {
        // the climbing ladder's column (world.js TOWER_LADDER): tower mobs keep clear of it and wait
        // for you to step off before striking — no more being hit from above while you can't fight back
        const towerLadder = { x: t.x + TOWER_LADDER[0] + 0.5, z: t.z + TOWER_LADDER[1] + 0.5 };
        [1, 7, 13].forEach((fy, fi) => {
          // one warden on the ground floor, one or two above (playtest: three at once, plus a turret, left
          // no room to fight back); spread over the floor, which is 21 blocks across
          const n = fi === 0 ? 1 : hash(t.x + fi, t.z, 280 + fi) < 0.5 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const an = hash(t.x + fi * 3 + i, t.z, 281 + fi * 2 + i) * Math.PI * 2,
              rr = 2 + hash(t.x, t.z + fi * 3 + i, 282 + fi * 2 + i) * 5,
              hx = t.x + 0.5 + Math.cos(an) * rr,
              hz = t.z + 0.5 + Math.sin(an) * rr;
            const wd = mob('warden', k, 140 + fi * 3 + i, hx, t.y + fy, hz, null);
            wd.ladder = towerLadder;
            list.push(wd);
          }
        });
        const core = mob('plasma_core', k, 150, t.x + 0.5, t.y + 21, t.z + 0.5, null);
        core.ladder = towerLadder;
        core.arena = { x: t.x + 0.5, z: t.z + 0.5, r: 7.5, y: t.y + 20 }; // floats over the loggia (under its roof at t.y + 24), never leaves it
        list.push(core);
        // a turret on the first and second floors, in the corners away from the ladder
        const tu1 = mob('turret', k, 155, t.x - 5.5, t.y + 7, t.z + 6.5, null);
        const tu2 = mob('turret', k, 156, t.x + 6.5, t.y + 13, t.z + 6.5, null);
        tu1.ladder = tu2.ladder = towerLadder;
        list.push(tu1, tu2);
      }
    }
    // the Merge Sanctum's twins (mergeAt(), world.js): proof-of-work on the forge half (west), proof-of-
    // stake over the crystal half (east), linked so each knows when the other falls; both stay on the disc
    {
      const m = mergeAt(Math.floor((x0 + 8) / MERGE), Math.floor((z0 + 8) / MERGE));
      if (m && cOf(m.x) === cx && cOf(m.z) === cz) {
        const arena = { x: m.x + 0.5, z: m.z + 0.5, r: MERGE_R - 1.5, y: m.y + 1 },
          pw = mob('pow_twin', k, 160, m.x - 8.5, m.y + 1, m.z + 0.5, null),
          ps = mob('pos_twin', k, 161, m.x + 9.5, m.y + 2.5, m.z + 0.5, null);
        pw.arena = ps.arena = arena;
        pw.twin = ps;
        ps.twin = pw;
        list.push(pw, ps);
      }
    }
    // the Mempool's Front-Runner (arenaAt(), world.js): at the center of the floor, kept on it; it only
    // really takes damage from someone inside the colosseum (arena.reach), not from the slopes outside
    {
      const A = arenaAt(Math.floor((x0 + 8) / ARENA), Math.floor((z0 + 8) / ARENA));
      if (A && cOf(A.x) === cx && cOf(A.z) === cz) {
        const fr = mob('front_runner', k, 170, A.x + 0.5, A.y + 1, A.z + 0.5, null);
        fr.arena = { x: A.x + 0.5, z: A.z + 0.5, r: ARENA_R - 1.5, y: A.y + 1, reach: ARENA_W + 1 };
        list.push(fr);
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
        if (!W.get(bx, y, bz) && W.isSolid(W.get(bx, y - 1, bz))) {
          by = y;
          break;
        }
      }
      if (by >= 0) {
        const gr = groundAt(W, bx + 0.5, bz + 0.5, by, true, 3);
        if (gr && !gr.water) list.push(mob('titan', k, 0, bx + 0.5, gr.y, bz + 0.5, null));
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
          gr = groundAt(W, hx, hz, gd.y, true, 3);
        if (!gr || gr.water) continue;
        list.push(mob('garden_guardian', k, 160 + i, hx, gr.y, hz, null));
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
        if (t > 0) list.push(mob('sky_raider', k, 170, hx + 0.5, t + 3, hz + 0.5, null));
      }
    }
    // deep lurkers: only in genuinely deep water (at least 5 blocks), not a shallow pond or river —
    // same topSolid(W, )-then-walk-down depth probe the (passive) fish already use (09-animals.js)
    {
      const r4 = hash(cx * 11 + 5, cz * 7 - 2, 300);
      if (!sanctuary(x0 + 8, z0 + 8) && r4 < 0.2) {
        const hx = x0 + 4 + Math.floor(hash(cx, cz, 301) * 12),
          hz = z0 + 4 + Math.floor(hash(cx, cz, 302) * 12),
          top = topSolid(W, hx, hz);
        if (top && top.id === 11) {
          let b = top.y;
          while (b > 0 && W.get(hx, b - 1, hz) === 11) b--;
          if (top.y - b >= 5) {
            const m = mob('water_lurker', k, 180, hx + 0.5, b + (top.y - b) / 2, hz + 0.5, null);
            m.wlo = b;
            list.push(m);
          }
        }
      }
    }
    return list;
  }

  // the night prowler of a chunk, if it has one and it's dark (null otherwise)
  function prowler(W, cx, cz) {
    const k = ckey(cx, cz),
      x0 = cx * CH,
      z0 = cz * CH;
    if (mobSafe(x0 + 8, z0 + 8) || hash(cx * 23 + 9, cz * 31 + 13, 310) > 0.3) return null;
    const hx = x0 + 2 + Math.floor(hash(cx, cz, 311) * 12),
      hz = z0 + 2 + Math.floor(hash(cx, cz, 312) * 12);
    if (heightAt(hx, hz) <= SEA + 1 || islandTop(hx, hz) > 0) return null; // no prowlers over water or islands
    const gr = groundAt(W, hx + 0.5, hz + 0.5, heightAt(hx, hz), true, 2);
    if (!gr || gr.water) return null;
    return mob('prowler', k, 190, hx + 0.5, gr.y, hz + 0.5, null);
  }
  // the network attack's nodes around the Atrium, during its window: one per free slot (taken: the slots
  // already standing or recently killed)
  const ATTACK_SLOTS = 7;
  function attackNodes(W, aw, taken) {
    const k = ckey(cOf(SPAWN.x), cOf(SPAWN.z)),
      out = [];
    for (let slot = 0; slot < ATTACK_SLOTS; slot++) {
      if (taken(slot)) continue;
      const an = hash(aw.windowId, slot, 401) * Math.PI * 2,
        r = 10 + hash(aw.windowId, slot, 402) * 6,
        hx = SPAWN.x + Math.cos(an) * r,
        hz = SPAWN.z + Math.sin(an) * r,
        gr = groundAt(W, hx, hz, heightAt(hx, hz), true, 2);
      if (!gr || gr.water) continue;
      const a = mob('corrupted_node', k, 400 + slot, hx, gr.y, hz, null);
      a.windowId = aw.windowId;
      a.slot = slot;
      out.push(a);
    }
    return out;
  }

  // ---------- who it's after ----------
  // the closest player (cands: {id, x, y, z, ward?}), sticking to the one it already hunts unless another is
  // clearly closer; a player under the Ward Incense isn't seen, unless the mob is immune or was just struck
  function target(a, cands) {
    let best = null,
      bd = Infinity,
      cur = null;
    for (const c of cands) {
      if (c.ward && !WARD_IMMUNE.has(a.type) && !(a.provoked > 0)) continue;
      c.d = Math.hypot(a.p.x - c.x, a.p.y - c.y, a.p.z - c.z);
      if (c.d < bd) {
        bd = c.d;
        best = c;
      }
      if (c.id === a.tgt) cur = c;
    }
    if (cur && cur.d < bd + 1.5) best = cur;
    a.tgt = best ? best.id : null;
    return best;
  }

  // ---------- how it moves and strikes ----------
  // where a mob's shots leave from: a turret's lens, the middle of anything else
  function eye(a) {
    return [a.p.x, a.p.y + MK[a.type].hit[1] * (a.type === 'turret' ? 0.8 : 0.5), a.p.z];
  }
  // the Front-Runner (MK.blink): below half health it calls in two Sandwich Bots, one each side of its target
  // (ev.summon), and every few seconds it blinks through its target to the far side (ev.blink)
  function frontRun(a, K, tg, d, aggro, dt, ev) {
    const p = a.p;
    if (!a.frenzy && a.hp <= K.hp / 2) {
      a.frenzy = true;
      a.blinkCd = 0.6;
      if (tg && ev.summon)
        for (const [i, s] of [
          [171, 1],
          [172, -1],
        ]) {
          const ux = tg.x - p.x,
            uz = tg.z - p.z,
            ul = Math.hypot(ux, uz) || 1,
            bx = clamp(tg.x + (-uz / ul) * 3 * s, a.arena.x - a.arena.r, a.arena.x + a.arena.r),
            bz = clamp(tg.z + (ux / ul) * 3 * s, a.arena.z - a.arena.r, a.arena.z + a.arena.r);
          ev.summon(a, i, bx, a.arena.y, bz, tg);
        }
    }
    a.blinkCd = (a.blinkCd ?? K.blink.every * 0.6) - dt;
    if (!aggro || !tg || d < K.blink.min || a.blinkCd > 0 || a.rushT > 0) return;
    a.blinkCd = a.frenzy ? K.blink.fast : K.blink.every;
    // through its target and 2.5 blocks beyond, kept on the floor
    const ux = tg.x - p.x,
      uz = tg.z - p.z,
      ul = Math.hypot(ux, uz) || 1;
    let nx = tg.x + (ux / ul) * 2.5,
      nz = tg.z + (uz / ul) * 2.5;
    const ox = nx - a.arena.x,
      oz = nz - a.arena.z,
      od = Math.hypot(ox, oz);
    if (od > a.arena.r) {
      nx = a.arena.x + (ox / od) * a.arena.r;
      nz = a.arena.z + (oz / od) * a.arena.r;
    }
    const fx = p.x,
      fz = p.z;
    p.x = nx;
    p.z = nz;
    a.r.y = Math.atan2(tg.x - nx, tg.z - nz);
    a.atkT = Math.max(a.atkT || 0, 0.45); // a beat to react before it strikes
    if (ev.blink) ev.blink(a, fx, fz);
  }
  // turrets, the Plasma Core and the bosses that hit from afar: a charge, then a burst of bolts (ev.fire)
  function rangedAttack(W, a, K, tg, aggro, d, dt, ev) {
    const R = K.ranged;
    if (a.shots > 0) {
      // mid-burst: the next bolt after a short gap
      a.gapT -= dt;
      if (a.gapT <= 0) {
        ev.fire(a, R, tg);
        a.shots--;
        a.gapT = R.gap || 0.2;
      }
      return;
    }
    const [ex, ey, ez] = eye(a),
      canShoot = aggro && d > (R.min || 0) && lineClear(W, ex, ey, ez, tg.x, tg.y + 1.2, tg.z);
    if (a.chargeT > 0) {
      a.chargeT -= dt;
      if (a.chargeT <= 0) {
        if (canShoot) {
          ev.fire(a, R, tg);
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
  // struck by a parry: it reels back from (fx, fz), stunned, open to a riposte
  const STUN_S = 1.3,
    WIND_S = 0.3, // a mob's wind-up before a melee blow
    STAND = 0.9; // blocks: how close a hunting mob comes to its target (less for a short reach)
  function parried(a, fx, fz) {
    a.stunT = STUN_S;
    a.windT = 0;
    const ux = a.p.x - fx,
      uz = a.p.z - fz,
      ul = Math.hypot(ux, uz) || 1;
    a.kbx = (ux / ul) * 7;
    a.kbz = (uz / ul) * 7;
    a.kbT = 0.25;
  }
  // a blow pushes it away from (fx, fz)
  function knock(a, fx, fz) {
    const dx = a.p.x - fx,
      dz = a.p.z - fz,
      dd = Math.hypot(dx, dz) || 1,
      kb = MK[a.type].kb;
    a.kbx = (dx / dd) * kb;
    a.kbz = (dz / dd) * kb;
    a.kbT = 0.25;
  }
  // One step of a living mob: tg is its target (from target(), with tg.d its distance, tg.ladder when that
  // player is climbing a ladder, tg.canHurt === false while they can't be hurt yet), or null. It moves,
  // and strikes through ev: ev.melee(a, tg) (returns 'parry' when the blow was parried), ev.fire(a, R, tg),
  // ev.summon, ev.blink. ev.attacks(tg) says whether this mob may strike that target here (the game: only
  // its own player). Returns { aggro, moving } for the drawing.
  function step(W, a, tg, dt, ev) {
    if (a.provoked > 0) a.provoked -= dt;
    if (a.stunT > 0) {
      // stunned by a parry: it sways on the spot, carried by the knockback, and does nothing else
      a.stunT -= dt;
      if (a.kbT > 0) {
        a.kbT -= dt;
        a.p.x += a.kbx * dt;
        a.p.z += a.kbz * dt;
      }
      return { aggro: false, moving: false, stunned: true };
    }
    const K = MK[a.type],
      p = a.p,
      d = tg ? (tg.d ?? Math.hypot(p.x - tg.x, p.y - tg.y, p.z - tg.z)) : Infinity, // in 3D: a buried mob doesn't bite through rock
      aggro = d < K.aggro && !mobSafe(p.x, p.z),
      ty0 = tg ? tg.y : p.y;
    let tx,
      tz,
      face = null;
    if (aggro) {
      tx = tg.x;
      tz = tg.z;
      // close enough to strike: it stops a step away and faces its target, instead of walking into it (a
      // mob standing inside you struck from any side, past your guard, and its blows couldn't push you off)
      const gx = tg.x - p.x,
        gz = tg.z - p.z;
      if (Math.hypot(gx, gz) < Math.min(STAND, K.atk * 0.7) && !(a.rushT > 0)) {
        tx = p.x;
        tz = p.z;
        face = Math.atan2(gx, gz);
      }
    } else {
      const T = (ev.now ?? Date.now()) / 1000 + a.ph;
      tx = a.hx + Math.sin(T * 0.3) * 2;
      tz = a.hz + Math.cos(T * 0.23) * 2;
    }
    // a rush (the Titan): a few seconds of sprint toward its target when they hang back, then a cooldown
    if (K.rush) {
      a.rushCd = Math.max(0, (a.rushCd || 0) - dt);
      if (a.rushT > 0) a.rushT -= dt;
      else if (aggro && d > K.rush.min && a.rushCd <= 0) {
        a.rushT = K.rush.time;
        a.rushCd = K.rush.every * (a.frenzy ? 0.6 : 1);
      }
    }
    if (K.blink) frontRun(a, K, tg, d, aggro, dt, ev);
    const spd = (aggro ? (a.rushT > 0 ? K.rush.speed : K.sp) * (a.frenzy ? 1.2 : 1) : K.sp * 0.35) * dt,
      dx = tx - p.x,
      dz = tz - p.z,
      dd = Math.hypot(dx, dz);
    let nx = p.x,
      nz = p.z;
    if (dd > 0.05) {
      const s = Math.min(dd, spd);
      nx += (dx / dd) * s;
      nz += (dz / dd) * s;
      let dr = Math.atan2(dx, dz) - a.r.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.r.y += dr * Math.min(1, dt * 6);
    } else if (face !== null) {
      let dr = face - a.r.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.r.y += dr * Math.min(1, dt * 6);
    }
    // a hunting mob stops at the edge of a protected zone (the Atrium, the City, the path) and waits there
    // facing its target, instead of stepping in, losing interest, stepping back out: that flip, every frame,
    // made it tremble against the border
    if (aggro && mobSafe(nx, nz)) {
      nx = p.x;
      nz = p.z;
    }
    if (a.kbT > 0) {
      a.kbT -= dt;
      nx += a.kbx * dt;
      nz += a.kbz * dt;
    }
    if (a.ladder) {
      // tower mobs keep a step away from the ladder's hatch
      const lx = nx - a.ladder.x,
        lz = nz - a.ladder.z,
        ld = Math.hypot(lx, lz);
      if (ld < LADDER_CLEAR) {
        nx = a.ladder.x + (ld ? lx / ld : 1) * LADDER_CLEAR;
        nz = a.ladder.z + (ld ? lz / ld : 0) * LADDER_CLEAR;
      }
    }
    if (a.arena) {
      // the twins and the bosses never leave their floor: pulled back onto it at its edge
      const ox = nx - a.arena.x,
        oz = nz - a.arena.z,
        od = Math.hypot(ox, oz);
      if (od > a.arena.r) {
        nx = a.arena.x + (ox / od) * a.arena.r;
        nz = a.arena.z + (oz / od) * a.arena.r;
      }
    }
    // walkers step up one block at most, like the player: a taller wall stops them (they slide along it)
    // instead of being climbed like a spider's. Fliers and swimmers move freely.
    const walker = !FLYERS.has(a.type);
    if (walker && (nx !== p.x || nz !== p.z)) {
      const fy = Math.floor(p.y + 0.01),
        blocked = (x, z) => {
          const xi = Math.floor(x),
            zi = Math.floor(z);
          if (xi === Math.floor(p.x) && zi === Math.floor(p.z)) return false;
          return W.isSolid(W.get(xi, fy + 1, zi)) || (W.isSolid(W.get(xi, fy, zi)) && W.isSolid(W.get(xi, fy + 2, zi)));
        },
        // look a little ahead of the center, so a mob doesn't sink halfway into a wall before stopping
        ahead = (x, z) => {
          const mx = x - p.x,
            mz = z - p.z,
            m = Math.hypot(mx, mz) || 1;
          return blocked(x + (mx / m) * 0.35, z + (mz / m) * 0.35);
        };
      if (ahead(nx, nz)) {
        if (!ahead(nx, p.z)) nz = p.z;
        else if (!ahead(p.x, nz)) nx = p.x;
        else {
          nx = p.x;
          nz = p.z;
        }
      }
    }
    const moved = Math.hypot(nx - p.x, nz - p.z) > 0.001;
    p.x = nx;
    p.z = nz;
    // flying (sky_raider, bat) and swimming (water_lurker) mobs skip the ground snap entirely and just lerp
    // toward a free vertical target instead: their target's height when giving chase (clamped to the water
    // column for a lurker, which can't leave its water), or a gentle bob near home otherwise
    if (FLYERS.has(a.type)) {
      const T = (ev.now ?? Date.now()) / 1000;
      const ty =
        a.type === 'plasma_core'
          ? clamp(aggro ? ty0 + 0.2 : a.arena.y + 0.5 + Math.sin(T * 0.8 + a.ph) * 0.3, a.arena.y + 0.2, a.arena.y + 1)
          : a.type === 'pos_twin'
            ? Math.max(a.arena.y + 0.3, aggro ? ty0 + 0.4 : a.hy + Math.sin(T * 0.9 + a.ph) * 0.6)
            : a.type === 'water_lurker'
              ? aggro
                ? clamp(ty0, a.wlo + 0.4, a.hy - 0.2)
                : a.hy - 0.5 + Math.sin(T * 0.5 + a.ph) * 0.3
              : a.type === 'bat'
                ? aggro
                  ? ty0 + 0.3
                  : a.hy + Math.sin(T * 1.4 + a.ph) * 0.4
                : aggro
                  ? ty0 + 0.5
                  : a.hy + Math.sin(T * 0.6 + a.ph) * 1.1;
      p.y += (ty - p.y) * Math.min(1, dt * 3);
    } else {
      const gr = groundAt(W, nx, nz, p.y + 0.3, false, 1);
      if (gr && !gr.water) p.y += (gr.y - p.y) * Math.min(1, dt * 10);
    }
    a.atkT = Math.max(0, (a.atkT || 0) - dt);
    const may = !!(aggro && tg && (!ev.attacks || ev.attacks(tg))),
      holdFire = !!(a.ladder && tg && tg.ladder); // a tower mob waits while its target climbs
    if (K.ranged && !holdFire) rangedAttack(W, a, K, tg, may, d, dt, ev);
    // no bite through a wall: the mob must actually reach its target. It winds up first (WIND_S, drawn as
    // a rear back on every screen): the blow lands only if its target is still within reach then (a little
    // more: it lunges), which leaves a beat to raise a guard, step back or dodge
    const canBite = reach => may && !holdFire && d < reach && tg.canHurt !== false && lineClear(W, ...eye(a), tg.x, tg.y + 1, tg.z);
    if (a.windT > 0) {
      a.windT -= dt;
      if (a.windT <= 0) {
        a.windT = 0;
        if (canBite(K.atk + 0.5)) {
          a.atkT = Math.max(0, K.cd - WIND_S); // the same pace of blows as without the wind-up
          if (ev.melee(a, tg) === 'parry') parried(a, tg.x, tg.z);
        } else a.atkT = 0.25; // it missed its moment
      }
    } else if (a.atkT <= 0 && canBite(K.atk)) a.windT = WIND_S;
    return { aggro, moving: dd > 0.1 && moved };
  }

  root.MobsCore = {
    MK,
    FLYERS,
    MOB_R,
    TWIN_DOWN,
    LADDER_CLEAR,
    RESPAWN_S,
    DAY_WATCH,
    WARD_IMMUNE,
    BOSS_CX,
    BOSS_CZ,
    ATTACK_SLOTS,
    STUN_S,
    sanctuary,
    mobSafe,
    worldClock,
    nightOf,
    attackWindow,
    groundAt,
    topSolid,
    lineClear,
    mob,
    mobId,
    spawnChunk,
    prowler,
    attackNodes,
    target,
    eye,
    rangedAttack,
    frontRun,
    step,
    parried,
    knock,
  };
})(globalThis);
