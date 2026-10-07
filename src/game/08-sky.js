// Ether Mines · Day/night cycle.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- day/night cycle ----------
// [hour, sky top, horizon, sun color, sun intensity, ambient light, fog]
// Sun + ambient added together stay close to 1 at full daylight: light blocks no longer blow out to white.
const KF = [
  [0, '#141048', '#2e2870', '#000000', 0.0, 0.2, '#231d55'],
  [0.22, '#3a3f8f', '#ffa0a8', '#ff9a6a', 0.15, 0.36, '#7a62a8'],
  [0.28, '#9cc4ff', '#ffd9ec', '#ffcfa6', 0.6, 0.42, '#eadcf6'],
  [0.5, '#8fbaff', '#f2e6ff', '#fff4e0', 0.68, 0.46, '#e8e4ff'],
  [0.72, '#93a8f4', '#ffd6ec', '#ffd6b0', 0.62, 0.5, '#f2dcf2'],
  [0.78, '#5f56c0', '#ffa45e', '#ff8a4c', 0.4, 0.48, '#d79a8c'],
  [0.85, '#1c1a52', '#4a3a7a', '#000000', 0, 0.2, '#2a2160'],
  [1, '#141048', '#2e2870', '#000000', 0, 0.2, '#231d55'],
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
  // the ambient light takes on the sky's hue: bluish by day, pink at sunset
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
  plMat.emissiveIntensity = emisBoost;
  beamMat.opacity = 0.25 + night * 0.45;
  const h = Math.floor(t * 24),
    m = Math.floor((t * 24 - h) * 60);
  $('clockTxt').innerHTML = `Day ${S.dayN} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
