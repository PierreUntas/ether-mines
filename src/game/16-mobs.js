// Ether Mines · Hostile mobs: rift shadows in the deep caves, corrupted guardians at unlit validators.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- hostile mobs ----------
// Simulated client-side, like the animals (09-animals.js): position derived from the seed, so every
// player sees the same mobs in the same place without any network traffic. Combat is resolved locally
// by each client: no loot, no penalty on death (v1 deliberately light) — nothing to arbitrate server-side,
// like the quest objectives. A guardian disappears for good once the validator it guards is relit.
const MOBS = new Map(),
  MOB_R = 2; // radius, in chunks, around the player
const MK = {
  shadow: { n: 'Rift Shadow', hp: 6, dmg: 1, sp: 1.6, aggro: 9, atk: 1.1, cd: 1.1, kb: 4, hit: [0.5, 1.3, 0.5] },
  guardian: { n: 'Corrupted Guardian', hp: 12, dmg: 2, sp: 1.3, aggro: 11, atk: 1.4, cd: 1.3, kb: 3, hit: [0.8, 1.9, 0.7] },
};
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
  } else if (a.type === 'guardian') {
    // reuses the validator robot's silhouette (09-animals.js), corrupted tones: rust and red cracks
    const body = '#5a4a5e',
      head = '#3d3448',
      crack = '#ff5a6a';
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
  }
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
  if (!sanctuary(x0 + 8, z0 + 8) && r < 0.16) {
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
  hpShown = -1;
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
function attackMob(a, dt) {
  playerAtkT = Math.max(0, playerAtkT - dt);
  swing = Math.max(swing, 0.6);
  if (playerAtkT > 0) return;
  playerAtkT = 0.45;
  a.hp -= heldDmg();
  Sound.hit('pierre');
  const K = MK[a.type],
    dx = a.g.position.x - P.x,
    dz = a.g.position.z - P.z,
    dd = Math.hypot(dx, dz) || 1;
  a.kbx = (dx / dd) * K.kb;
  a.kbz = (dz / dd) * K.kb;
  a.kbT = 0.25;
  if (a.hp <= 0) {
    a.hp = 0;
    a.dying = 0.4;
    Sound.animal(a.type, 1);
  }
}
function hurtPlayer(dmg, mx, mz) {
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
        aggro = d < K.aggro && !sanctuary(p.x, p.z);
      let tx, tz;
      if (aggro) {
        tx = P.x;
        tz = P.z;
      } else {
        const T = Date.now() / 1000 + a.ph;
        tx = a.hx + Math.sin(T * 0.3) * 2;
        tz = a.hz + Math.cos(T * 0.23) * 2;
      }
      const spd = (aggro ? K.sp : K.sp * 0.35) * dt,
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
      const gr = groundAt(nx, nz, p.y + 0.3, false, 2);
      p.x = nx;
      p.z = nz;
      if (gr && !gr.water) p.y += (gr.y - p.y) * Math.min(1, dt * 10);
      a.walk = (a.walk || 0) + dt * (dd > 0.1 ? 8 : 1.5);
      if (a.parts.legs.length) a.parts.legs.forEach((l, i2) => (l.rotation.x = (i2 % 2 ? -1 : 1) * Math.sin(a.walk) * 0.5));
      else p.y += Math.sin(a.walk) * 0.01; // the shadow floats, no legs
      a.atkT = Math.max(0, (a.atkT || 0) - dt);
      if (aggro && d < K.atk && hurtT <= 0 && a.atkT <= 0) {
        a.atkT = K.cd;
        hurtPlayer(K.dmg, p.x, p.z);
      }
    }
}
