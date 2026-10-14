// ---------- signs (rules.js ids 160 to 163, 034_signs.sql) ----------
// One line of text on a sign, read by everyone. Online it lives in the signs table (loaded with the area
// in 13-chunks.js, streamed by net.js); solo, in the save (S.signs). Only standing signs within reach of
// the view get their text drawn, on both faces of the board.
const SIGNS = new Map(); // 'x,y,z' -> text
const SIGN_EDIT = { open: false };
const isSign = id => !!B[id]?.sign;
Net.on('sign', r => {
  const k = coordKey(r.x, r.y, r.z);
  if (r.text) SIGNS.set(k, r.text);
  else SIGNS.delete(k);
});
function loadSoloSigns() {
  if (SERVER()) return;
  for (const [k, t] of Object.entries(S.signs || {})) SIGNS.set(k, t);
}
// a sign you placed: yours to write on (online the server checks it again)
function mySign(t) {
  const o = OWN.get(coordKey(t.x, t.y, t.z));
  return !!o && o.by === (SERVER() ? Net.userId : ME.id);
}
// right-click on a sign: write on yours, read anyone else's
function useSign(t) {
  const text = SIGNS.get(coordKey(t.x, t.y, t.z)) || '';
  if (mySign(t)) return openSignEditor(t);
  const by = OWN.get(coordKey(t.x, t.y, t.z))?.name;
  logEv('nft', text ? `“${text}”` : 'An empty sign', by ? `a sign by ${by}` : '');
}
function openSignEditor(t) {
  let el = $('signEdit');
  if (!el) {
    el = document.createElement('div');
    el.id = 'signEdit';
    el.className = 'signedit';
    el.innerHTML =
      '<div class="box"><h3>Write on your sign</h3><input maxlength="60" placeholder="One line, everyone can read it"><div class="row"><button class="b" data-k="cancel">Cancel</button><button class="b primary" data-k="ok">Save</button></div><p class="note">60 characters at most. Insults and personal details are not allowed.</p></div>';
    document.body.appendChild(el);
  }
  const input = el.querySelector('input'),
    k = coordKey(t.x, t.y, t.z);
  input.value = SIGNS.get(k) || '';
  el.hidden = false;
  SIGN_EDIT.open = true;
  mining = false;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => input.focus(), 30);
  const close = () => {
    el.hidden = true;
    SIGN_EDIT.open = false;
    input.onkeydown = null;
    if (playing) tryLock();
  };
  const save = async () => {
    const text = input.value.replace(/\s+/g, ' ').trim().slice(0, 60);
    close();
    if (SERVER()) {
      const r = await serverAct('sign', { px: t.x, py: t.y, pz: t.z, msg: text });
      if (!r) return;
      if (r.text) SIGNS.set(k, r.text);
      else SIGNS.delete(k);
    } else {
      S.signs = { ...(S.signs || {}) };
      if (text) S.signs[k] = SIGNS.set(k, text) && text;
      else {
        delete S.signs[k];
        SIGNS.delete(k);
      }
      dirty = true;
    }
    Sound.click();
  };
  el.querySelector('[data-k=ok]').onclick = save;
  el.querySelector('[data-k=cancel]').onclick = close;
  input.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  };
}

// the text itself: a small canvas per sign, wrapped on up to three lines
function signTexture(text) {
  // 256x128: a power of two, so the text keeps its mipmaps and stays readable from a few blocks away
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  let size = 40,
    lines;
  for (; size >= 20; size -= 4) {
    g.font = `700 ${size}px "Pixelify Sans", monospace`;
    lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > 232 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length * size * 1.1 <= 124 && lines.every(l => g.measureText(l).width <= 240)) break;
  }
  const lh = size * 1.1,
    y0 = 64 - ((lines.length - 1) * lh) / 2;
  // light lettering with a dark outline: readable on the wood, by day and by night
  lines.forEach((l, i) => {
    g.lineWidth = Math.max(4, size / 6);
    g.strokeStyle = '#2a1a10';
    g.strokeText(l, 128, y0 + i * lh);
    g.fillStyle = '#fff3d6';
    g.fillText(l, 128, y0 + i * lh);
  });
  return new THREE.CanvasTexture(c);
}
const SIGN_MESH = new Map(); // 'x,y,z' -> { g, text, id }
const signGeo = new THREE.PlaneGeometry(0.86, 0.5);
let signT = 0;
function updateSigns(dt) {
  signT -= dt;
  if (signT > 0) return;
  signT = 0.4;
  const R = 40;
  for (const [k, m] of SIGN_MESH) {
    const [x, y, z] = k.split(',').map(Number),
      id = get(x, y, z);
    if (SIGNS.get(k) !== m.text || id !== m.id || Math.hypot(x - P.x, z - P.z) > R + 4) {
      scene.remove(m.g);
      m.g.children.forEach(c => c.material.map.dispose());
      SIGN_MESH.delete(k);
    }
  }
  for (const [k, text] of SIGNS) {
    if (SIGN_MESH.has(k)) continue;
    const [x, y, z] = k.split(',').map(Number);
    if (Math.hypot(x - P.x, z - P.z) > R) continue;
    const id = get(x, y, z);
    if (!isSign(id)) continue;
    // the board faces where you looked when placing it (o), on both sides
    let nx = 0,
      nz = 1;
    for (let i = 0; i < B[id].o; i++) [nx, nz] = [nz, -nx];
    const g = new THREE.Group(),
      tex = signTexture(text);
    for (const side of [1, -1]) {
      // pulled toward the camera in depth, so the board never wins the depth test from a distance
      const p = new THREE.Mesh(
        signGeo,
        new THREE.MeshLambertMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        }),
      );
      p.position.set(nx * 0.075 * side, 0, nz * 0.075 * side);
      p.rotation.y = Math.atan2(nx * side, nz * side);
      g.add(p);
    }
    g.position.set(x + 0.5, y + 0.73, z + 0.5);
    scene.add(g);
    SIGN_MESH.set(k, { g, text, id });
  }
}
