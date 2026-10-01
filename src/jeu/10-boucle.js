// Mines d'Éther · Boucle principale.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- boucle ----------
const GENESIS = 1606824023;
let lastSlot = Math.floor((Date.now() / 1000 - GENESIS) / 12);
let tierHintT = 0;
let last = performance.now(),
  bob = 0,
  crouch = 0,
  stepT = 0,
  hitT = 0;
let ipsN = 0,
  ipsT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  ipsN++;
  ipsT += (now - last) / 1000;
  if (ipsT >= 0.5) {
    const el = $('ips');
    el.hidden = !REG.ips;
    if (REG.ips) el.textContent = Math.round(ipsN / ipsT) + ' i/s';
    ipsN = 0;
    ipsT = 0;
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
    const inW = get(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)) === 11;
    P.inWater = inW;
    const sneak = sneakHeld || keys.has('KeyC') || keys.has('ControlLeft');
    if (sprintOn) {
      if (l > 0.1) sprintMv = true;
      else if (sprintMv) {
        sprintOn = sprintMv = false;
        $('tSprint').classList.remove('on');
      }
    }
    const run = !sneak && (keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintOn);
    const sp = (run ? 6.6 : 4.4) * (inW ? 0.55 : 1) * (sneak && !inW ? 0.35 : 1),
      sn = Math.sin(yaw),
      cs = Math.cos(yaw);
    const vx = (-sn * fz + cs * fx) * sp,
      vz = (-cs * fz - sn * fx) * sp;
    const was = P.on;
    bumped = false;
    const guard = sneak && was && !inW;
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
    const jump = keys.has('Space') || jumpHeld;
    if (inW) {
      P.vy = jump ? 2.6 : sneak ? -3 : Math.max(P.vy - 9 * dt, -2.2);
    } else {
      if (jump && was) P.vy = 8.2;
      else if (touch && bumped && was && l > 0.3) P.vy = 8.2;
      P.vy = Math.max(P.vy - 24 * dt, -30);
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
    S.day += dt / 480;
    if (S.day >= 1) {
      S.day -= 1;
      S.dayN++;
    }
    // minage
    if (mining && target && B[target.id].h !== Infinity && !canBuildHere(target.x, target.z)) {
      crack.visible = false;
      mineKey = -1;
      mineT = 0;
      protectHint(target.x, target.z);
    } else if (mining && target && B[target.id].h !== Infinity && !canMine(target.id)) {
      hitT -= dt;
      if (hitT <= 0) {
        hitT = 0.4;
        Sound.hit('pierre');
        swing = 0.5;
        if (!tierHintT) {
          tierHintT = 6;
          logEv('burn', `Trop dur pour ${TIER_NAME[heldTier()]}`, `il faut ${TIER_NAME[reqTier(target.id)]}`);
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
    }
    // validateurs
    const slot = Math.floor((Date.now() / 1000 - GENESIS) / 12);
    if (!SERVER() && slot > lastSlot) {
      let own = 0;
      for (const k of vals.keys())
        if (OWN.get(k)?.by === ME.id) {
          const [x, y, z] = k.split(',').map(Number);
          own += get(x, y, z) === 74 ? 3 : 1;
        }
      const n = own * Math.min(3, slot - lastSlot);
      lastSlot = slot;
      if (n) {
        give(101, n, `récompense du slot ${slot.toLocaleString('fr-FR')}`);
      }
    }
  }
  camera.rotation.set(pitch, yaw, 0);
  stepUp = Math.max(0, stepUp - dt * 5);
  camera.position.set(P.x, P.y + EYE - stepUp - crouch + Math.sin(bob) * 0.04, P.z);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  // les nuages suivent la caméra (le plan ne finit jamais) mais leur motif reste fixe dans le monde, et dérive doucement
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
      tg.innerHTML = `${B[target.id].n}<span>${target.id === 73 ? `${touch ? 'toucher' : 'clic droit'} avec un cœur de validateur pour le rallumer` : target.id === 74 ? "rallumé · frappe 3 cristaux par slot pour qui l'a rallumé" : !canBuildHere(target.x, target.z) && B[target.id].h !== Infinity ? `🔒 ${protectMsg(target.x, target.z)}` : !canMine(target.id) && B[target.id].h !== Infinity ? `⛏ il faut ${TIER_NAME[reqTier(target.id)]}` : !inWorld(target.x, target.z) ? 'bord du monde' : own ? `posé par ${ow && ow.by !== ME.id ? ow.name : 'toi'} · bloc #${own}` : `naturel · donne le jeton #${tid === 0 ? '—' : tid}`}</span>`;
    } else {
      sel.visible = false;
      $('target').hidden = true;
    }
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
      tg.innerHTML = `${K.n}<span>${touch ? 'toucher' : 'clic droit'} : caresser${g ? ' · a un cadeau pour toi' : ''}</span>`;
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t -= dt;
    p.v[1] -= 14 * dt;
    p.m.position.x += p.v[0] * dt;
    p.m.position.y += p.v[1] * dt;
    p.m.position.z += p.v[2] * dt;
    p.m.scale.setScalar(Math.max(0.05, p.t / 0.7));
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
  waterU.value = now / 1000;
  updatePops(dt);
  {
    const nt = skyU.night.value;
    if (booted) updateFireflies(dt, nt, now / 1000);
    if (playing) {
      const cx = Math.floor(P.x),
        cz = Math.floor(P.z);
      Sound.tick(dt, nt, P.y + 1 < heightAt(cx, cz) - 3, !!P.inWater);
    }
  }
  swing = Math.max(0, swing - dt * 3);
  if (handMesh) {
    const s = Math.sin((1 - swing) * Math.PI) * swing;
    hand.rotation.set(-s * 0.9, 0, 0);
    hand.position.set(Math.sin(bob * 0.5) * 0.015, Math.abs(Math.cos(bob * 0.5)) * 0.012 - s * 0.08, 0);
  }
  if (booted) {
    stream(dt);
    computePower(dt);
    lumieres(dt);
    updateAnimals(dt);
    if (playing) updateQuest(dt);
  }
  updateOthers(dt);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  if (playing) renderer.render(handScene, handCam);
  requestAnimationFrame(frame);
}
