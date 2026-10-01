// Mines d'Éther · Cycle jour et nuit.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- cycle jour et nuit ----------
// [heure, ciel en haut, horizon, couleur du soleil, intensité du soleil, lumière ambiante, brouillard]
// Le soleil et l'ambiance additionnés restent proches de 1 en plein jour : les blocs clairs ne saturent plus en blanc.
const KF = [
  [0, '#0f1030', '#2a2458', '#000000', 0.0, 0.2, '#1d1a40'],
  [0.22, '#3a3f8f', '#ff9fb8', '#ff9a7a', 0.15, 0.36, '#6a5a9e'],
  [0.28, '#8fa8ff', '#ffd6e8', '#ffcfa6', 0.6, 0.42, '#e8d6f2'],
  [0.5, '#86aaff', '#e6e6ff', '#fff4e0', 0.68, 0.46, '#e6e2ff'],
  [0.72, '#8fa0f0', '#f3dcff', '#ffd6b0', 0.62, 0.5, '#eadcf6'],
  [0.78, '#6a5fc8', '#ffa98a', '#ff8a6a', 0.4, 0.48, '#c59ab8'],
  [0.85, '#1a1a48', '#3a2f70', '#000000', 0, 0.2, '#26214e'],
  [1, '#0f1030', '#2a2458', '#000000', 0, 0.2, '#1d1a40'],
];
const cA = new THREE.Color(),
  cB = new THREE.Color();
function lerpCol(a, b, t, out) {
  cA.set(a);
  cB.set(b);
  return out.copy(cA).lerp(cB, t);
}
const fogC = new THREE.Color(),
  WHITE = new THREE.Color(0xffffff);
function applyDay() {
  const t = S.day % 1;
  let i = 0;
  while (t > KF[i + 1][0]) i++;
  const a = KF[i],
    b = KF[i + 1],
    k = (t - a[0]) / (b[0] - a[0]);
  lerpCol(a[1], b[1], k, skyU.top.value);
  lerpCol(a[2], b[2], k, skyU.hor.value);
  lerpCol(a[3], b[3], k, skyU.sunCol.value);
  lerpCol(a[6], b[6], k, fogC);
  const si = lerp(a[4], b[4], k),
    hi = lerp(a[5], b[5], k);
  sun.intensity = si * 0.95;
  hemi.intensity = hi;
  sun.color.copy(skyU.sunCol.value).lerp(WHITE, 0.35);
  // l'ambiance prend la teinte du ciel : bleutée le jour, rosée au couchant
  hemi.color.copy(skyU.hor.value).lerp(WHITE, 0.45);
  const ang = (t - 0.25) * Math.PI * 2,
    dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
  skyU.sunDir.value.copy(dir);
  const light = dir.y > 0 ? dir : dir.clone().negate();
  sun.position.set(P.x + light.x * 70, P.y + light.y * 70, P.z + light.z * 70);
  sun.target.position.set(P.x, P.y, P.z);
  if (dir.y <= 0) {
    sun.intensity = 0.12;
    sun.color.set(0x9fb0ff);
  }
  const night = clamp(-dir.y * 4, 0, 1);
  skyU.night.value = night;
  stars.material.opacity = night * 0.9;
  scene.fog.color.copy(fogC);
  clouds.material.color.copy(skyU.hor.value).lerp(new THREE.Color(0xffffff), 0.6 - 0.4 * night);
  clouds.material.opacity = 0.85 - 0.35 * night;
  emisBoost = 0.6 + night * 0.8;
  opMat.emissiveIntensity = emisBoost;
  glMat.emissiveIntensity = emisBoost;
  beamMat.opacity = 0.25 + night * 0.45;
  const h = Math.floor(t * 24),
    m = Math.floor((t * 24 - h) * 60);
  $('clockTxt').innerHTML = `Jour ${S.dayN} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  drawSunIcon(dir.y > 0);
}
let emisBoost = 1,
  lastIconDay = null;
function drawSunIcon(day) {
  if (day === lastIconDay) return;
  lastIconDay = day;
  const c = $('sunIcon').getContext('2d');
  c.clearRect(0, 0, 9, 9);
  c.fillStyle = day ? '#ffd95e' : '#e6e8ff';
  if (day) {
    c.fillRect(2, 2, 5, 5);
    c.fillRect(4, 0, 1, 9);
    c.fillRect(0, 4, 9, 1);
  } else {
    c.fillRect(2, 1, 4, 7);
    c.fillStyle = '#1c163a';
    c.fillRect(4, 1, 3, 5);
  }
}
