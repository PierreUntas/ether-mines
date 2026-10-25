// Ether Mines · Main loop.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- loop ----------
const GENESIS = 1606824023;
let lastSlot = Math.floor((Date.now() / 1000 - GENESIS) / 12);
let tierHintT = 0;
let last = performance.now(),
  bob = 0,
  crouch = 0,
  stepT = 0,
  hitT = 0,
  buffT = 0; // meal eaten at the table: increased speed for this long (seconds)
let fpsN = 0,
  fpsT = 0;
// Frames: at most 60 a second (a 120 Hz screen would otherwise draw twice as many for nothing), and
// about 12 while nothing moves under your eyes (title screen, pause, the chest or shop open), with the
// world still running at its own pace. Keeps laptops cool and batteries alive.
let lastDraw = 0;
// walking backwards goes at this share of the forward speed (PlayerController.cs, BackSpeed)
const BACK_SPEED = 0.6;
const idleNow = () => !CINE.on && (!playing || !$('panel').hidden);
// automatic quality: under 40 frames a second for 5 s of play, one step down (sharpness, then shadows,
// then view distance), saved, and said once; never during the browser tests (headless, slow by nature)
const AUTOQ = { t: 0, n: 0, cool: 0 };
function autoQuality(dt) {
  if (!REG.autoQuality || navigator.webdriver || !playing || idleNow() || dt > 0.25) {
    AUTOQ.t = AUTOQ.n = 0;
    return;
  }
  AUTOQ.cool = Math.max(0, AUTOQ.cool - dt);
  AUTOQ.t += dt;
  AUTOQ.n++;
  if (AUTOQ.t < 5) return;
  const fps = AUTOQ.n / AUTOQ.t;
  AUTOQ.t = AUTOQ.n = 0;
  if (fps >= 40 || AUTOQ.cool > 0) return;
  let what = null;
  if (CLAY && REG.glow) {
    REG.glow = false;
    what = ['glow', 'glow'];
  } else if (REG.sharpness > 1) {
    REG.sharpness = REG.sharpness > 1.5 ? 1.5 : 1;
    what = ['sharpness', 'sharpness'];
  } else if (REG.shadows) {
    REG.shadows = false;
    what = ['shadows', 'shadows'];
  } else if (REG.view > 3) {
    REG.view--;
    what = ['view', 'view distance'];
  }
  if (!what) return;
  AUTOQ.cool = 10;
  saveSettings();
  applySetting(what[0]);
  logEv('burn', `Lower ${what[1]}, to keep the game smooth`, 'chest → Settings to change it back');
}
// the first-person guard and parry (Pierre's sketches, as poseArms draws them from outside): where the
// blade sits in the hand's view and which way it points (BLADE_AXIS, 14-startup.js), and the parry's moment
let parryFpAt = 0; // when your last parry landed (selfFx)
const FP_GUARD_LOW = { at: new THREE.Vector3(0.1, -0.06, -0.56), q: null },
  FP_GUARD_HIGH = { at: new THREE.Vector3(0.3, 0.2, -0.62), q: null };
function parryFp() {
  if (!parryFpAt) return 0;
  const t = (performance.now() - parryFpAt) / 600;
  if (t >= 1) return (parryFpAt = 0);
  const k = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
  return k * k * (3 - 2 * k);
}
function frame(now) {
  const gap = idleNow() ? 1000 / 12 : 1000 / 60;
  if (now - lastDraw < gap - 4) {
    requestAnimationFrame(frame);
    return;
  }
  lastDraw = now;
  const dt = Math.min(idleNow() ? 0.1 : 0.05, (now - last) / 1000);
  autoQuality(dt);
  fpsN++;
  fpsT += (now - last) / 1000;
  if (fpsT >= 0.5) {
    const el = $('fps');
    el.hidden = !REG.fps;
    if (REG.fps) el.textContent = Math.round(fpsN / fpsT) + ' fps';
    fpsN = 0;
    fpsT = 0;
  }
  last = now;
  if (playing && $('panel').hidden && !chatOpen) {
    let fx = 0,
      fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz++;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz--;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx++;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx--;
    fx += move.x;
    fz += move.y;
    const l = Math.hypot(fx, fz);
    if (l > 1) {
      fx /= l;
      fz /= l;
    }
    if (fz < 0) fz *= BACK_SPEED; // stepping back is slower than going forward
    const inW = get(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)) === 11;
    P.inWater = inW;
    P.dryT = inW ? 0 : (P.dryT ?? 9) + dt; // how long since you were swimming
    const sneak = sneakHeld || keys.has('KeyC') || keys.has('ControlLeft');
    if (sprintOn) {
      if (l > 0.1) sprintMv = true;
      else if (sprintMv) {
        sprintOn = sprintMv = false;
        $('tSprint').classList.remove('on');
      }
    }
    const run = !sneak && (keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintOn);
    const sp =
        (run ? 6.6 : 4.4) *
        (inW ? 0.55 : 1) *
        (sneak && !inW ? 0.35 : 1) *
        (buffT > 0 ? 1.3 : 1) *
        (bootsOn() ? 1 + ITEM[211].boots : 1) * // the Front-Runner Boots, worn
        (guarding() ? 0.55 : 1) *
        (RIDE ? 2 : 1), // on a hovercraft (20-hover.js): twice as fast
      sn = Math.sin(yaw),
      cs = Math.cos(yaw);
    let vx = (-sn * fz + cs * fx) * sp,
      vz = (-cs * fz - sn * fx) * sp;
    if (RIDE) [vx, vz] = rideVelocity(vx, vz, dt); // a hovercraft has inertia: it drifts in hard turns (20-hover.js)
    moveIn[0] = fx;
    moveIn[1] = fz;
    // a dodge (the Front-Runner Boots, 16-mobs.js): a short dash, faster than any run
    dashCd = Math.max(0, dashCd - dt);
    if (dashT > 0) {
      dashT -= dt;
      vx = dashV[0];
      vz = dashV[1];
    }
    const px0 = P.x,
      pz0 = P.z;
    const was = P.on;
    bumped = false;
    const guard = sneak && was && !inW;
    // on a ladder, its panel side holds you like a wall even where there's no wall behind it (a tower's
    // open loggia, a ladder standing free): pushing forward climbs instead of walking off into the air
    const ladderCell = [0, 1]
      .map(d => [Math.floor(P.x), Math.floor(P.y + 0.2 + d), Math.floor(P.z)])
      .find(([x, y, z]) => B[get(x, y, z)]?.shape === 'ladder');
    const ladderO = ladderCell ? B[get(...ladderCell)].o : -1;
    {
      const ox = P.x,
        oy = P.y;
      moveAxis('x', vx * dt);
      if (guard && !collides(P.x, P.y - 0.1, P.z)) {
        P.x = ox;
        P.y = oy;
      }
    }
    {
      const oz = P.z,
        oy = P.y;
      moveAxis('z', vz * dt);
      if (guard && !collides(P.x, P.y - 0.1, P.z)) {
        P.z = oz;
        P.y = oy;
      }
    }
    if (RIDE && dt > 0) rideMoved((P.x - px0) / dt, (P.z - pz0) / dt);
    if (ladderCell) {
      // the ladder's panel (mesh.js LADDER): o0 on the cell's -z face, o1 -x, o2 +z, o3 +x, 1/8 block thick
      const [cx, , cz] = ladderCell,
        m = 0.125 + PW;
      const lim =
        ladderO === 0 ? ['z', cz + m, 1] : ladderO === 1 ? ['x', cx + m, 1] : ladderO === 2 ? ['z', cz + 1 - m, -1] : ['x', cx + 1 - m, -1];
      const [ax, edge, sgn] = lim;
      if ((P[ax] - edge) * sgn < 0) {
        P[ax] = edge;
        bumped = true;
      }
    }
    const jump = keys.has('Space') || jumpHeld;
    // ladder: climb by jumping or walking into it, hold crouch to stay still, go down slowly
    const onLadder = [0, 1].some(d => B[get(Math.floor(P.x), Math.floor(P.y + 0.2 + d), Math.floor(P.z))]?.shape === 'ladder');
    // getting out of water: swimming toward the bank (by jumping, or walking forward on mobile) gives a boost to climb onto it.
    // Feet can still be wet while the body is already out of the water: also check the feet's cell.
    const feetWet =
      get(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z)) === 11 || get(Math.floor(P.x), Math.floor(P.y - 0.2), Math.floor(P.z)) === 11;
    if ((inW || feetWet) && bumped && l > 0.1 && (jump || touch) && !sneak && P.vy < 6) {
      P.vy = 7.6;
    } else if (inW) {
      // holding jump swims you up until the water is at your waist: there you float, half in the water,
      // bobbing a little (the chest out, sinking back slowly; in again, up again)
      const chestWet = get(Math.floor(P.x), Math.floor(P.y + 1), Math.floor(P.z)) === 11;
      P.vy = jump ? (chestWet ? 2.6 : Math.max(Math.min(P.vy, 0.6) - 9 * dt, -0.6)) : sneak ? -3 : Math.max(P.vy - 9 * dt, -2.2);
    } else if (feetWet && P.dryT < 0.5) {
      // just come up from a swim, the head above the surface: still afloat. Holding jump keeps you bobbing
      // at the surface (no hop off the water: falling onto it from a jump, you go in); to climb out, swim
      // into the bank (above)
      P.vy = Math.max(P.vy - 9 * dt, -2.2);
    } else if (onLadder) {
      P.vy = jump || (bumped && l > 0.1) || (l > 0.1 && fz > 0) ? 3.2 : sneak ? 0 : Math.max(P.vy - 24 * dt, -2.4);
    } else {
      if (jump && was) P.vy = 8.2;
      else if (touch && bumped && was && l > 0.3) P.vy = 8.2;
      // gliding: a Genesis Titan Fang owner holding jump while already falling descends slowly instead,
      // covering real horizontal distance via the normal WASD movement already applied above
      const gliding = (jump || touch) && !was && P.vy < 0 && hasCape();
      P.vy = gliding ? Math.max(P.vy - 3 * dt, -3) : Math.max(P.vy - 24 * dt, -30);
    }
    const fallV = P.vy;
    P.on = false;
    moveAxis('y', P.vy * dt);
    if (P.y < -10) {
      P.x = SPAWN.x + 0.5;
      P.y = SPAWN.y + 0.1;
      P.z = SPAWN.z + 2.5;
      P.vy = 0;
    }
    if (BOARD && typeof boardTick === 'function') boardTick(); // in a friend's back seat: you go where the seat goes
    if (l > 0.1 || !P.on) dirty = true;
    if (l > 0.1 && P.on) bob += dt * (run ? 13 : 9);
    const under = () => MAT_OF(get(Math.floor(P.x), Math.floor(P.y - 0.1), Math.floor(P.z)));
    if (l > 0.1 && P.on && !inW) {
      stepT -= dt;
      if (stepT <= 0) {
        stepT = run ? 0.28 : 0.38;
        Sound.step(under());
      }
    } else stepT = 0.12;
    if (!was && P.on && fallV < -7) Sound.step(under());
    crouch += ((sneak && !inW ? 0.22 : 0) - crouch) * Math.min(1, dt * 12);
    tierHintT = Math.max(0, tierHintT - dt);
    hintT = Math.max(0, hintT - dt);
    buffT = Math.max(0, buffT - dt);
    tickClock(dt);
    updateBolts(dt);
    // combat: aiming a hostile mob, another player (outside protected zones), or a killable animal, with
    // the mining click attacks instead of mining — a ranged weapon (the Plasma Pistol) fires along the
    // aim direction instead, whatever's in its path, not gated by the short melee pick range
    const heldRanged = ITEM[itemId(S.bar[S.sel])]?.ranged;
    tickWeapons(dt);
    if (!mining) pvpStruck = false; // the button was released: the next click can strike a player again
    // a click kept for a moment (queueStrike) counts as holding the button, for fighting only
    const fight = mining || STRIKE.buf > 0,
      fAim = aim || (STRIKE.buf > 0 ? STRIKE.aim : null);
    const mobTarget = !heldRanged && fight ? pickMob(fAim, target) : null;
    const pvpTarget = !heldRanged && !mobTarget && fight && !sanctuary(P.x, P.z) ? pickPlayer(fAim, target) : null;
    const aniTarget = !heldRanged && !mobTarget && !pvpTarget && fight ? pickAnimal(fAim, target) : null;
    const struck = ok => ok && (STRIKE.buf = 0);
    if (heldRanged) {
      if (fight) struck(fireRanged());
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
    } else if (mobTarget) {
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
      struck(attackMob(mobTarget));
    } else if (pvpTarget) {
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
      struck(attackPlayer(pvpTarget));
    } else if (aniTarget && AK[aniTarget.type].hp) {
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
      struck(attackAnimal(aniTarget));
    } else if (mining && target && B[target.id].h !== Infinity && !canBuildHere(target.x, target.z)) {
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
      protectHint(target.x, target.z);
    } else if (mining && target && B[target.id].h !== Infinity && !canMine(target.id)) {
      swing = Math.max(swing, 0.5);
      hitT -= dt;
      if (hitT <= 0) {
        hitT = 0.4;
        Sound.hit('pierre');
        if (!tierHintT) {
          tierHintT = 6;
          logEv('burn', `Too hard for ${TIER_NAME[heldTier()]}`, `you need ${TIER_NAME[reqTier(target.id)]}`);
        }
      }
      crack.visible = false;
    } else if (mining && target && B[target.id].h !== Infinity && inWorld(target.x, target.z)) {
      const k = coordKey(target.x, target.y, target.z);
      if (k !== mineKey) {
        mineKey = k;
        mineT = 0;
      }
      mineT += dt * heldTool() * (B[target.id].stone ? 1 : 1);
      hitT -= dt;
      if (hitT <= 0) {
        hitT = 0.25;
        Sound.hit(MAT_OF(target.id));
      }
      const h = B[target.id].h / (B[target.id].stone ? 1 : Math.max(1, heldTool() * 0.5));
      const pr = mineT / (B[target.id].h / (B[target.id].stone ? 1 : 1) / 1);
      const need = B[target.id].h;
      const prog = Math.min(1, mineT / need);
      crack.visible = true;
      crack.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      crack.material.map = crackTex[Math.min(7, Math.floor(prog * 8))];
      swing = Math.max(swing, 0.6);
      if (prog >= 1) {
        breakBlock(target);
        mineKey = -1;
        mineT = 0;
        crack.visible = false;
      }
    } else {
      mineKey = -1;
      mineT = 0;
      crack.visible = false;
      // nothing in reach: still swing at the empty air on every click, same as mining a block or hitting
      // a mob always does — only the sound is throttled, not the swing itself
      if (mining) {
        swing = Math.max(swing, 0.6);
        hitT -= dt;
        if (hitT <= 0) {
          hitT = 0.4;
          Sound.hit('pierre');
        }
      }
    }
    // validators
    const slot = Math.floor((Date.now() / 1000 - GENESIS) / 12);
    if (!SERVER() && slot > lastSlot) {
      // same scale as the server (002_security.sql): shares per slot, 25 shares = 1 crystal
      let placed = 0,
        old = 0;
      for (const k of vals.keys())
        if (OWN.get(k)?.by === ME.id) {
          const [x, y, z] = k.split(',').map(Number);
          if (get(x, y, z) === 74) old++;
          else placed++;
        }
      S.parts = (S.parts || 0) + (Math.min(placed, 5) + 5 * old) * Math.min(3, slot - lastSlot);
      const n = Math.floor(S.parts / 25);
      S.parts -= n * 25;
      lastSlot = slot;
      if (n) {
        give(101, n, `slot ${slot.toLocaleString('en-US')} reward`);
      }
    }
  }
  camera.rotation.set(pitch, yaw, 0);
  stepUp = Math.max(0, stepUp - dt * 5);
  const lift = (RIDE || BOARD) && typeof rideLift === 'function' ? rideLift() : 0; // on board: seated higher
  camera.position.set(P.x, P.y + EYE + lift - stepUp - crouch + (lift ? 0 : Math.sin(bob) * 0.04), P.z);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  aurora.position.set(camera.position.x, 0, camera.position.z);
  auroraU.time.value = performance.now() / 1000;
  // the clouds follow the camera (the plane never ends) but their pattern stays fixed in the world, and drifts slowly
  clouds.position.x = camera.position.x;
  clouds.position.z = camera.position.z;
  cloudDrift += dt * 0.0015;
  cloudTex.offset.set(camera.position.x / 300 + cloudDrift, -camera.position.z / 300);
  waterTex.offset.x += dt * 0.03;
  waterTex.offset.y += dt * 0.012;
  applyDay();
  if (playing) {
    target = raycast(5.2, aim);
    if (target) {
      sel.visible = true;
      sel.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      const k = coordKey(target.x, target.y, target.z),
        ow = OWN.get(k),
        own = ow ? ow.serial : 0;
      const tg = $('target');
      tg.hidden = false;
      tg.classList.toggle('own', !!(ow && ow.by === ME.id));
      const tid = B[target.id].drop !== undefined && B[target.id].drop ? B[target.id].drop : target.id;
      const tsh = B[target.id].shape,
        locked =
          (tsh === 'door' || tsh === 'lever' ? !canToggleHere(target.x, target.z) : !canBuildHere(target.x, target.z)) &&
          B[target.id].h !== Infinity,
        columnDown = target.id === 73 && ![0, 1, 2].every(i => isSolid(get(target.x + 2, target.y + i, target.z + 2)));
      tg.innerHTML = `${B[target.id].n}<span>${target.id === 73 ? (columnDown ? 'rebuild the fourth column (its +x, +z corner) first' : `${touch ? 'tap' : 'right-click'} with a validator heart to relight it`) : target.id === 74 ? 'relit · mints a crystal a minute for whoever relit it' : target.id === 135 ? `${touch ? 'tap' : 'right-click'} to eat: increased speed for a while` : (B[target.id].shape || '').startsWith('bed') ? `${touch ? 'tap' : 'right-click'} to sleep: ${sharedClock() ? 'rest and set your home' : 'skip to dawn, and set your home'}` : locked ? `🔒 ${protectMsg(target.x, target.z)}` : !canMine(target.id) && B[target.id].h !== Infinity ? `⛏ you need ${TIER_NAME[reqTier(target.id)]}` : !inWorld(target.x, target.z) ? 'edge of the world' : (own ? `placed by ${ow && ow.by !== ME.id ? ow.name : 'you'} · block #${own}` : `natural · drops token #${tid === 0 ? '—' : tid}`) + (touch ? ' · tap: history' : ' · I: history')}</span>`;
    } else {
      sel.visible = false;
      $('target').hidden = true;
    }
    const mb = pickMob(aim, target);
    if (mb) {
      target = null;
      sel.visible = false;
      crack.visible = false;
      const tg = $('target');
      tg.hidden = false;
      tg.classList.remove('own');
      tg.innerHTML = `${MK[mb.type].n}${MK[mb.type].hp >= 40 ? ` · ${Math.ceil(mb.hp)}/${MK[mb.type].hp}` : ''}<span>${touch ? 'tap and hold' : 'left-click'}: attack</span>`; // a boss shows its health
    } else {
      const pv = !sanctuary(P.x, P.z) ? pickPlayer(aim, target) : null;
      if (pv) {
        target = null;
        sel.visible = false;
        crack.visible = false;
        const tg = $('target');
        tg.hidden = false;
        tg.classList.remove('own');
        tg.innerHTML = `${pv.o.name}<span>${touch ? 'tap and hold' : 'left-click'}: attack</span>`;
      } else {
        const an = pickAnimal(aim, target);
        if (an) {
          target = null;
          sel.visible = false;
          crack.visible = false;
          const K = AK[an.type],
            tg = $('target');
          tg.hidden = false;
          tg.classList.remove('own');
          const g = K.gift && (S.pets || {})[an.k + ':' + an.i] !== new Date().toISOString().slice(0, 10);
          tg.innerHTML =
            an.type === 'villager'
              ? `${an.h.name}<span>${an.h.role} · ${touch ? 'tap' : 'right-click'}: talk</span>`
              : `${K.n}<span>${touch ? 'tap' : 'right-click'}: pet${g ? ' · has a gift for you' : ''}${K.hp ? ` · ${touch ? 'tap and hold' : 'left-click'}: fight for a heart` : ''}</span>`;
        }
      }
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t -= dt;
    p.v[1] -= (p.g ?? 14) * dt;
    p.m.position.x += p.v[0] * dt;
    p.m.position.y += p.v[1] * dt;
    p.m.position.z += p.v[2] * dt;
    p.m.scale.setScalar((p.s || 1) * Math.max(0.05, p.t / (p.t0 || 0.7)));
    if (p.t <= 0) {
      scene.remove(p.m);
      parts.splice(i, 1);
    }
  }
  for (const g of vals.values()) {
    g.userData.d.rotation.y += dt * 1.5;
    g.userData.d.position.y = 1.7 + Math.sin(now / 500) * 0.08;
  }
  bigEth.rotation.y += dt * 0.12;
  anneau.rotation.y -= dt * 0.05;
  animateStars(dt);
  for (const g of SHIPS) {
    const u = g.userData;
    u.a += dt * u.v;
    g.position.set(CITY.x + Math.cos(u.a) * u.r, u.h + Math.sin(u.a * 3) * 0.6, CITY.z + Math.sin(u.a) * u.r);
    g.rotation.y += dt * 0.3;
  }
  for (const vol of OISEAUX) {
    const u = vol.userData;
    u.a += dt * u.v;
    vol.visible = skyU.night.value < 0.5;
    vol.position.set(P.x + Math.cos(u.a) * u.r, u.h, P.z + Math.sin(u.a) * u.r);
    vol.rotation.y = -u.a;
    vol.children.forEach((o, k) => (o.scale.y = 0.6 + Math.abs(Math.sin(now / 180 + k))));
  }
  waterU.value = now / 1000;
  updatePops(dt);
  {
    const nt = skyU.night.value;
    if (booted) {
      updateFireflies(dt, nt, now / 1000);
      updatePapillons(dt, nt, now / 1000);
      updatePetales(dt);
    }
    if (playing) {
      const cx = Math.floor(P.x),
        cz = Math.floor(P.z);
      Sound.tick(dt, nt, P.y + 1 < heightAt(cx, cz) - 3, !!P.inWater);
    }
  }
  swing = Math.max(0, swing - dt * 3);
  if (typeof updateGuard === 'function') updateGuard(dt);
  if (typeof updateRide === 'function') updateRide(dt);
  hand.visible = !RIDE && !BOARD; // on board, both hands on the craft
  if (handMesh) {
    // a blow goes toward the crosshair: the item reaches forward and in, its tip leaning into the target,
    // then comes back. A pistol kicks back and up instead, as it fires.
    const s = Math.sin((1 - swing) * Math.PI) * swing,
      bx = Math.sin(bob * 0.5) * 0.015,
      by = Math.abs(Math.cos(bob * 0.5)) * 0.012,
      rest = handMesh.userData.rest;
    if (ITEM[itemId(S.bar[S.sel])]?.ranged) {
      hand.rotation.set(s * 0.12, 0, 0);
      hand.position.set(bx, by + s * 0.015, s * 0.04);
      if (rest) handMesh.rotation.copy(rest.r);
    } else {
      // on guard (16-mobs.js), as Pierre sketched it: the blade upright, tip down, in front of you; a parry,
      // for a moment: the blade raised level across the top of the screen, the view stepping aside with it
      const g = typeof guardAmt === 'number' ? guardAmt : 0,
        blade = g > 0.001 || parryFpAt ? heldBlade() : false,
        p = blade ? parryFp() : 0;
      hand.rotation.set(0, 0, -0.08 * p);
      hand.position.set(bx - s * 0.17 + p * 0.05, by + s * 0.13, -s * 0.3);
      if (rest) {
        handMesh.rotation.set(rest.r.x - s * 0.75, rest.r.y + s * 0.25, rest.r.z + s * 0.35);
        handMesh.position.copy(rest.p);
        if (blade) {
          handMesh.quaternion.slerp(FP_GUARD_LOW.q, g * (1 - s));
          if (p) handMesh.quaternion.slerp(FP_GUARD_HIGH.q, p);
          handMesh.position.lerp(FP_GUARD_LOW.at, g * (1 - s));
          if (p) handMesh.position.lerp(FP_GUARD_HIGH.at, p);
        }
      }
    }
  }
  if (booted) {
    stream(dt);
    computePower(dt);
    lights(dt);
    updateAnimals(dt);
    updateMobs(dt);
    updateMobBars(dt);
    updateFinale(dt);
    cineTick(dt);
    if (playing) updateCompass(dt);
    if (playing) updateQuest(dt);
  }
  updateOthers(dt);
  tickFlashes(dt);
  // 17-looks.js, 18-potions.js, 19-signs.js load after this file: a first frame can come before them
  if (typeof updateSigns === 'function') {
    updateLooks(dt);
    updatePotions(dt);
    updateSigns(dt);
  }
  if (!viewReady && playing && booted) initView();
  const restoreEyes = CINE.on ? cineCamera() : viewFromOutside(dt); // back or front view: the camera pulls back for the duration of the render
  if (CLAY && REG.glow && glowComposer()) GLOW.render(dt);
  else {
    renderer.clear();
    renderer.render(scene, camera);
  }
  if (restoreEyes) restoreEyes();
  else {
    renderer.clearDepth();
    if (playing) renderer.render(handScene, handCam);
  }
  requestAnimationFrame(frame);
}
