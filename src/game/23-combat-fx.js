// Combat feel: how a fight looks, on top of what it does (16-mobs.js). Blows chained within a moment run
// a combo of three swings (a slash from the right, a backhand from the left, an overhead chop), each with
// its arc across the screen; a blow that lands freezes the hand a few hundredths of a second and shakes
// the view a little (more on a critical blow), and its damage rises from the mob; a struck mob squashes;
// a mob that falls tips over as it bursts; a blow you take knocks your head aside, away from it.
// Nothing here changes a number of the fight: it is all drawn.
const COMBO = { n: 0, at: -9, v: 0 },
  COMBO_GAP = 0.95, // seconds between two blows that still chain
  // the arm's swing for each blow of the combo, on a character (poseArms): x, z, the body's twist
  COMBO_ARM = [
    [1.55, -0.28, -0.3], // the slash: the arm reaches out level, across from the right
    [1.3, 0.42, 0.35], // the backhand: out to the side, the body turned the other way
    [2.5, -0.12, 0], // the chop: raised high, coming down
  ];
let HITSTOP = 0; // seconds the hand stays frozen where the blow landed
// a blow goes (attackMob, attackPlayer): the next one of the combo, or the first again after a pause
function comboStep() {
  const now = performance.now() / 1000;
  COMBO.n = now - COMBO.at < COMBO_GAP ? COMBO.n + 1 : 0;
  COMBO.at = now;
  COMBO.v = COMBO.n % 3;
  if (heldBlade()) slashArc(COMBO.v);
}
const comboV = () => (heldBlade() && performance.now() / 1000 - COMBO.at < COMBO_GAP ? COMBO.v : 0);
// a blow landed: the hand holds still a moment, the view shakes
function blowLanded(crit) {
  HITSTOP = crit ? 0.09 : 0.05;
  shakeView(crit ? 0.018 : 0.008);
}

// ---------- the arc of a swing, across the first-person view ----------
const ARCS = [],
  arcMat = new THREE.MeshBasicMaterial({
    color: 0xd8f6ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }),
  arcGeo = new THREE.RingGeometry(0.2, 0.232, 28, 1, Math.PI * 0.14, Math.PI * 0.72);
function slashArc(v) {
  const m = new THREE.Mesh(arcGeo, arcMat.clone());
  // the slash sweeps right to left over the top, the backhand the other way, the chop top to bottom
  m.position.set(v === 2 ? 0.05 : 0, -0.1, -0.62);
  m.rotation.set(-0.5, v === 1 ? Math.PI : 0, v === 2 ? -Math.PI / 2 : v === 1 ? 0.2 : -0.2);
  handScene.add(m);
  ARCS.push({ m, t: 0 });
}
function tickArcs(dt) {
  for (let i = ARCS.length - 1; i >= 0; i--) {
    const a = ARCS[i];
    a.t += dt;
    const k = a.t / 0.18;
    a.m.material.opacity = Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * 0.42;
    a.m.scale.setScalar(0.9 + k * 0.25);
    if (k >= 1) {
      handScene.remove(a.m);
      a.m.material.dispose();
      ARCS.splice(i, 1);
    }
  }
}

// ---------- the view: a shake when a blow lands, a knock when you take one ----------
const VIEWFX = { shake: 0, roll: 0, lift: 0 };
function shakeView(a) {
  VIEWFX.shake = Math.max(VIEWFX.shake, a);
}
// a blow from (mx, mz): the head knocked aside, away from it, and up a little
function knockView(mx, mz, blocked) {
  const dx = mx - P.x,
    dz = mz - P.z,
    d = Math.hypot(dx, dz) || 1,
    side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d; // +1: the blow came from your right
  const k = blocked ? 0.4 : 1;
  VIEWFX.roll = side * 0.1 * k;
  VIEWFX.lift = 0.05 * k;
  shakeView(0.012 * k);
}
// after the camera is set (10-loop.js), through your own eyes only
function viewFx(dt) {
  const v = VIEWFX;
  if (v.shake < 0.0005 && Math.abs(v.roll) < 0.0005 && v.lift < 0.0005) return;
  camera.rotation.x += v.lift + (Math.random() - 0.5) * 2 * v.shake;
  camera.rotation.y += (Math.random() - 0.5) * 2 * v.shake;
  camera.rotation.z += v.roll;
  camera.updateMatrixWorld();
  v.shake *= Math.exp(-dt * 22);
  v.roll *= Math.exp(-dt * 7);
  v.lift *= Math.exp(-dt * 9);
}

// ---------- the damage rising from a mob ----------
const DMG_NUMS = [],
  dmgTex = new Map();
function dmgTexture(text, crit) {
  const key = text + (crit ? '!' : '');
  if (dmgTex.has(key)) return dmgTex.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d');
  x.font = `800 ${crit ? 46 : 38}px Fredoka, system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(28, 22, 58, 0.9)';
  x.strokeText(text, 64, 34);
  x.fillStyle = crit ? '#ffd95e' : '#f4f2fa';
  x.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  dmgTex.set(key, t);
  return t;
}
function dmgNumber(a, dmg, crit) {
  if (!a || !a.g || !(dmg > 0)) return;
  const n = Math.max(1, Math.round(dmg)),
    s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: dmgTexture(String(n), crit), transparent: true, depthWrite: false, depthTest: false }),
    ),
    h = (MK[a.type].hit || [0.5, 1, 0.5])[1] * (a.g.scale.y || 1);
  s.scale.set(crit ? 0.9 : 0.7, crit ? 0.45 : 0.35, 1);
  s.renderOrder = 10;
  s.position.set(a.g.position.x + (Math.random() - 0.5) * 0.5, a.g.position.y + h + 0.2, a.g.position.z + (Math.random() - 0.5) * 0.5);
  scene.add(s);
  DMG_NUMS.push({ s, t: 0, y0: s.position.y });
}
function tickDmgNums(dt) {
  for (let i = DMG_NUMS.length - 1; i >= 0; i--) {
    const d = DMG_NUMS[i];
    d.t += dt;
    const k = d.t / 0.85;
    d.s.position.y = d.y0 + (1 - Math.pow(1 - Math.min(1, k), 2)) * 0.8;
    d.s.material.opacity = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
    if (k >= 1) {
      scene.remove(d.s);
      d.s.material.dispose();
      DMG_NUMS.splice(i, 1);
    }
  }
}

// ---------- the mobs: a squash when struck, a fall when they die ----------
// struck (applyMobDamage): wider and lower for a moment, then back to its own size
function mobStruck(a) {
  if (!(a.hitK > 0)) a.baseS = a.g.scale.x || 1;
  a.hitK = 1;
}
function tickMobSquash(dt) {
  for (const list of MOBS.values())
    for (const a of list) {
      if (!(a.hitK > 0) || a.hp <= 0) continue;
      a.hitK = Math.max(0, a.hitK - dt / 0.16);
      const h = Math.sin(a.hitK * Math.PI),
        b = a.baseS || 1;
      a.g.scale.set(b * (1 + 0.14 * h), b * (1 - 0.12 * h), b * (1 + 0.14 * h));
    }
}
// dying (a.dying: 0.4 s down to 0): it tips over to one side, then shrinks into its burst
function dyingPose(a) {
  const d = Math.max(0, a.dying / 0.4);
  if (a.fallSide === undefined) {
    a.fallSide = Math.random() < 0.5 ? -1 : 1;
    a.baseS = a.hitK > 0 ? a.baseS || 1 : a.g.scale.x || 1;
    a.hitK = 0;
  }
  a.g.rotation.z = (1 - d) * 1.2 * a.fallSide;
  a.g.scale.setScalar((a.baseS || 1) * Math.min(1, d * 1.7));
}

function tickCombatFx(dt) {
  HITSTOP = Math.max(0, HITSTOP - dt);
  tickArcs(dt);
  tickDmgNums(dt);
  tickMobSquash(dt);
}
