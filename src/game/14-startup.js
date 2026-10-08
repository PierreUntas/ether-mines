// Ether Mines · Position, profile, account, game startup.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- position ----------
function updatePosHud() {
  const d = Math.round(Math.hypot(P.x - SPAWN.x, P.z - SPAWN.z)),
    c = claimAt(P.x, P.z);
  $('borderTxt').textContent =
    `Position ${Math.floor(P.x)} · ${Math.floor(P.z)} · ${d < 1000 ? d + ' m' : (d / 1000).toFixed(1) + ' km'} from the sanctuary${c ? ` · ${c.owner === ME.id ? 'your' : (c.owner_name || '?') + "'s"} plot` : ''}`;
  buildClaimLines();
}
const others = new Map();
function faceTex(hair) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#f6d3b8';
  x.fillRect(0, 0, 8, 8);
  x.fillStyle = hair;
  x.fillRect(0, 0, 8, 2);
  x.fillRect(0, 2, 1, 2);
  x.fillRect(7, 2, 1, 2);
  x.fillStyle = '#1c163a';
  x.fillRect(2, 4, 1, 1);
  x.fillRect(5, 4, 1, 1);
  x.fillStyle = '#ffb3cf';
  x.fillRect(1, 5, 1, 1);
  x.fillRect(6, 5, 1, 1);
  x.fillStyle = '#c98a74';
  x.fillRect(3, 6, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.font = '600 30px "Pixelify Sans", monospace';
  const w = Math.min(240, x.measureText(name).width + 44);
  x.fillStyle = 'rgba(28,22,58,.72)';
  x.beginPath();
  x.roundRect ? x.roundRect(128 - w / 2, 10, w, 44, 12) : x.rect(128 - w / 2, 10, w, 44);
  x.fill();
  x.fillStyle = color;
  x.beginPath();
  x.arc(128 - w / 2 + 18, 32, 6, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#f4f1ff';
  x.textBaseline = 'middle';
  x.fillText(name, 128 - w / 2 + 32, 33);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.8, 0.45, 1);
  s.renderOrder = 10;
  return s;
}
function makeAvatar(name, color, horsScene) {
  const g = new THREE.Group(),
    M = c => new THREE.MeshLambertMaterial({ color: c }),
    col = new THREE.Color(color),
    dark = col.clone().multiplyScalar(0.7);
  const skin = M(0xf6d3b8),
    hair = M(dark),
    face = new THREE.MeshLambertMaterial({ map: faceTex('#' + dark.getHexString()) });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [hair, hair, hair, skin, hair, face]);
  head.position.y = 1.52;
  head.castShadow = true;
  g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.28), M(col));
  body.position.y = 0.94;
  body.castShadow = true;
  g.add(body);
  const limb = (w, h, d, m, x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.y = -h / 2;
    b.castShadow = true;
    p.add(b);
    g.add(p);
    return p;
  };
  const pants = M(0x6a58e0);
  const legs = [limb(0.24, 0.62, 0.26, pants, -0.13, 0.62), limb(0.24, 0.62, 0.26, pants, 0.13, 0.62)],
    arms = [limb(0.18, 0.62, 0.22, M(col), -0.35, 1.26), limb(0.18, 0.62, 0.22, skin, 0.35, 1.26)];
  const tag = nameTag(name, color);
  tag.position.y = 2.1;
  g.add(tag);
  if (!horsScene) scene.add(g);
  return { g, head, body, legs, arms, tag, name, color, walk: 0, t: null, seen: false, ph: Math.random() * 6 };
}
// ---------- seeing yourself: back view, front view (V key), and the character in the chest ----------
let VIEW = 0, // 0: through your eyes; 1: from behind; 2: from the front
  SELF = null;
const viewFrom = new THREE.Vector3(),
  viewDir = new THREE.Vector3(),
  viewPos = new THREE.Vector3();
function changeView() {
  VIEW = (VIEW + 1) % 3;
  if (SELF && SELF.color !== ME.color) {
    scene.remove(SELF.g);
    SELF = null;
  }
  if (VIEW && !SELF) {
    SELF = makeAvatar(ME.name, ME.color);
    SELF.tag.visible = false;
    viewPos.set(P.x, P.y, P.z);
  }
  if (SELF) SELF.g.visible = VIEW > 0;
  logEv('nft', ['Through your eyes', 'View from behind', 'View from the front'][VIEW], touch ? '' : 'press V to change');
}
// places the player's avatar and pulls the camera back (without crossing walls); returns a function that resets the camera to the eyes
function viewFromOutside(dt) {
  if (!VIEW || !SELF) return null;
  const o = SELF,
    sp = Math.hypot(P.x - viewPos.x, P.z - viewPos.z) / Math.max(dt, 0.001),
    mv = Math.min(1, sp / 2);
  viewPos.set(P.x, P.y, P.z);
  o.g.position.set(P.x, P.y, P.z);
  o.g.rotation.y = yaw;
  o.head.rotation.x = -pitch * 0.6;
  o.walk += Math.min(sp, 8) * dt * 1.6;
  o.ph += dt;
  const a = mv * Math.sin(o.walk) * 0.7,
    br = Math.sin(o.ph * 2.2),
    hop = Math.abs(Math.sin(o.walk)) * 0.07 * mv;
  o.legs[0].rotation.x = a;
  o.legs[1].rotation.x = -a;
  o.arms[0].rotation.x = -a;
  o.arms[1].rotation.x = swing > 0 ? -1.3 + Math.sin(swing * Math.PI) * 0.8 : a;
  o.body.scale.set(1 + br * 0.02, 1 + br * 0.012, 1 + br * 0.035);
  o.body.position.y = 0.94 + hop;
  o.head.position.y = 1.52 + hop + br * 0.012;
  o.arms[0].position.y = o.arms[1].position.y = 1.26 + hop;
  viewFrom.copy(camera.position);
  viewDir.set(0, 0, VIEW === 1 ? 1 : -1).applyQuaternion(camera.quaternion);
  let d = 0;
  while (d < 4) {
    const id = get(
      Math.floor(viewFrom.x + viewDir.x * (d + 0.3)),
      Math.floor(viewFrom.y + viewDir.y * (d + 0.3)),
      Math.floor(viewFrom.z + viewDir.z * (d + 0.3)),
    );
    if (id && id !== 11 && isSolid(id)) break;
    d += 0.1;
  }
  camera.position.addScaledVector(viewDir, Math.max(0.4, d));
  if (VIEW === 2) camera.rotation.set(-pitch, yaw + Math.PI, 0);
  camera.updateMatrixWorld();
  return () => {
    camera.position.copy(viewFrom);
    camera.rotation.set(pitch, yaw, 0);
    camera.updateMatrixWorld();
  };
}
$('vueBtn').onclick = () => playing && changeView();
// the character, in the chest panel: it spins in place, you can drag it with a finger, and pick its color
let PREVIEW = null;
function previewBox() {
  if (!PREVIEW) {
    const box = document.createElement('div');
    box.className = 'avatar';
    box.innerHTML = '<canvas width="520" height="400"></canvas><div class="pname"></div><div class="pcolor"></div>';
    const c = box.querySelector('canvas');
    let r = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
    } catch (e) {}
    const sc = new THREE.Scene(),
      cam = new THREE.PerspectiveCamera(30, 520 / 400, 0.1, 20);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7bef, 0.95));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55);
    dl.position.set(2, 3, 4);
    sc.add(dl);
    cam.position.set(0, 1.25, 5.4);
    cam.lookAt(0, 1.05, 0);
    PREVIEW = { box, c, r, sc, cam, av: null, rot: 0.5, dragging: false, en: false };
    c.addEventListener('pointerdown', e => {
      PREVIEW.dragging = true;
      PREVIEW.x = e.clientX;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (!PREVIEW.dragging) return;
      PREVIEW.rot += (e.clientX - PREVIEW.x) * 0.012;
      PREVIEW.x = e.clientX;
    });
    c.addEventListener('pointerup', () => (PREVIEW.dragging = false));
    c.addEventListener('pointercancel', () => (PREVIEW.dragging = false));
  }
  const p = PREVIEW;
  if (!p.av || p.av.color !== ME.color || p.av.name !== ME.name) {
    if (p.av) p.sc.remove(p.av.g);
    p.av = makeAvatar(ME.name, ME.color, true);
    p.av.tag.visible = false;
    p.sc.add(p.av.g);
  }
  p.box.querySelector('.pname').textContent = ME.name;
  const pc = p.box.querySelector('.pcolor');
  pc.innerHTML = '';
  for (const col of COLORS) {
    const b = document.createElement('button');
    b.style.background = col;
    b.setAttribute('aria-label', 'Outfit color');
    if (col === ME.color) b.className = 'sel';
    b.onclick = () => {
      profile.color = ME.color = col;
      try {
        localStorage.setItem(PKEY, JSON.stringify(profile));
      } catch (e) {}
      if (SELF) {
        scene.remove(SELF.g);
        SELF = null;
        if (VIEW) {
          VIEW--;
          changeView();
        }
      }
      dirty = cloudDirty = true;
      renderPanel();
    };
    pc.appendChild(b);
  }
  if (!p.en && p.r) {
    p.en = true;
    const spin = () => {
      if (!p.c.isConnected || $('panel').hidden) return (p.en = false);
      if (!p.dragging) p.rot += 0.008;
      const t = performance.now() / 1000;
      p.av.g.rotation.y = Math.PI + p.rot;
      p.av.arms[0].rotation.x = Math.sin(t * 1.6) * 0.12;
      p.av.arms[1].rotation.x = -Math.sin(t * 1.6) * 0.12;
      p.av.head.rotation.y = Math.sin(t * 0.8) * 0.25;
      p.r.render(p.sc, p.cam);
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }
  return p.box;
}
function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  scene.remove(o.g);
  others.delete(id);
}
function ensureOther(p) {
  let o = others.get(p.id);
  if (!o && p.id !== ME.id) {
    o = makeAvatar(p.name || 'Player', p.color || '#8a7bef');
    others.set(p.id, o);
  }
  return o;
}
Net.on('peers', list => {
  const ids = new Set(list.map(p => p.id));
  for (const id of [...others.keys()]) if (!ids.has(id)) removeOther(id);
  for (const p of list) ensureOther(p);
  const names = list.map(p => (p.id === ME.id ? 'toi' : p.name));
  $('online').hidden = !Net.online;
  $('onlineTxt').textContent = `${list.length} en ligne · ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`;
});
Net.on('pos', p => {
  const o = ensureOther(p);
  if (!o) return;
  o.t = p;
  if (!o.seen) {
    o.seen = true;
    o.g.position.set(p.x, p.y, p.z);
  }
});
Net.on('block', b => applyBlock(b));
// ignored players: kept in this browser, their messages no longer show up
const IGNORES = new Set(JSON.parse(localStorage.getItem('ether-mines:ignores') || '[]'));
const saveIgnores = () => localStorage.setItem('ether-mines:ignores', JSON.stringify([...IGNORES]));
Net.on('chat', m => {
  if (!IGNORES.has(String(m.name).toLowerCase())) addChat(m.name, m.color, m.text);
});
let usernameFlagged = false;
Net.on('status', s => {
  if (s === 'SAVE_ERROR') logEv('burn', 'Save refused by the server', 'check the Supabase schema');
  if (s === 'USERNAME_TAKEN' && !usernameFlagged) {
    usernameFlagged = true;
    logEv(
      'burn',
      `The nickname "${ME.name}" is already taken in this world`,
      'pick another one (Escape, then the menu) to save your progress',
    );
  }
  if (s === 'CLOSED' || s === 'CHANNEL_ERROR') $('onlineTxt').textContent = 'Connection lost · reconnecting…';
});
function updateOthers(dt) {
  for (const o of others.values()) {
    if (!o.t) continue;
    const g = o.g,
      k = Math.min(1, dt * 7);
    const dx = o.t.x - g.position.x,
      dz = o.t.z - g.position.z;
    g.position.x += dx * k;
    g.position.y += (o.t.y - g.position.y) * k;
    g.position.z += dz * k;
    let dr = o.t.yaw - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * k;
    o.head.rotation.x = -(o.t.pitch || 0) * 0.6;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    o.walk += Math.min(sp, 8) * dt * 1.6;
    const a = Math.min(1, sp / 2) * Math.sin(o.walk) * 0.7;
    o.legs[0].rotation.x = a;
    o.legs[1].rotation.x = -a;
    o.arms[0].rotation.x = -a;
    o.arms[1].rotation.x = o.t.m ? -1.2 + Math.sin(performance.now() / 90) * 0.5 : a;
    o.ph += dt;
    const br = Math.sin(o.ph * 2.2),
      mv = Math.min(1, sp / 2),
      hop = Math.abs(Math.sin(o.walk)) * 0.07 * mv;
    o.body.scale.set(1 + br * 0.02, 1 + br * 0.012, 1 + br * 0.035);
    o.body.position.y = 0.94 + hop;
    o.head.position.y = 1.52 + hop + br * 0.012;
    o.head.rotation.z = Math.sin(o.walk) * 0.06 * mv;
    o.arms[0].rotation.z = -0.06 - br * 0.03 * (1 - mv);
    o.arms[1].rotation.z = 0.06 + br * 0.03 * (1 - mv);
    o.arms[0].position.y = o.arms[1].position.y = 1.26 + hop;
    o.tag.position.y = 2.1 + hop;
  }
}
setInterval(() => {
  if (SERVER() && booted && playing) serverAct('rewards', {}, null, 'validator rewards');
}, 60000);
// Position: at most 5 times a second, only if actually moving, and a sign of life every 4 s.
// Every send is received by all other players: this is the first real-time message post.
let lastPos = null,
  lastPosT = 0;
setInterval(() => {
  if (!Net.online || !playing) return;
  const now = performance.now(),
    p = {
      id: ME.id,
      name: ME.name,
      color: ME.color,
      x: +P.x.toFixed(2),
      y: +P.y.toFixed(2),
      z: +P.z.toFixed(2),
      yaw: +yaw.toFixed(2),
      pitch: +pitch.toFixed(2),
      m: mining && !!target,
    };
  const L = lastPos,
    moved =
      !L ||
      Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z) > 0.08 ||
      Math.abs(p.yaw - L.yaw) > 0.06 ||
      Math.abs(p.pitch - L.pitch) > 0.08 ||
      p.m !== L.m;
  if (!moved && now - lastPosT < 4000) return;
  lastPos = p;
  lastPosT = now;
  Net.sendPos(p);
  // server position: a ping every 15 s while moving (used by /join and by move validation)
  if (SERVER() && booted && (!lastSrvPos || (now - lastSrvPos.t > 15000 && Math.hypot(p.x - lastSrvPos.x, p.z - lastSrvPos.z) > 2))) {
    lastSrvPos = { t: now, x: p.x, z: p.z };
    Net.act('pos', position()).catch(() => {});
  }
}, 200);
let lastSrvPos = null;
let chatOpen = false,
  chatJetons = 4,
  chatT = 0;
function addChat(name, color, text) {
  const d = document.createElement('div');
  d.className = 'msg';
  const n = document.createElement('b');
  n.textContent = name;
  n.style.color = color;
  const t = document.createElement('span');
  t.textContent = ' ' + text;
  d.append(n, t);
  $('chatLog').appendChild(d);
  while ($('chatLog').children.length > 8) $('chatLog').firstChild.remove();
  setTimeout(() => d.classList.add('old'), 9000);
}
function openChat() {
  chatOpen = true;
  keys.clear();
  mining = false;
  $('chatForm').hidden = false;
  $('chatLog').classList.add('open');
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => $('chatIn').focus(), 0);
}
function closeChat() {
  chatOpen = false;
  $('chatForm').hidden = true;
  $('chatLog').classList.remove('open');
  $('chatIn').blur();
  if (playing) tryLock();
}
function command(v) {
  const [c, ...rest] = v.slice(1).split(' ');
  const arg = rest.join(' ').trim().toLowerCase();
  if (c === 'sanctuary') {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
    P.vy = 0;
    addChat('World', '#7fe8ff', 'Back to the sanctuary.');
    return;
  }
  if (c === 'join') {
    const o = [...others.values()].find(o => o.name.toLowerCase() === arg || o.name.toLowerCase().startsWith(arg));
    if (!o || !o.t) {
      addChat('World', '#7fe8ff', arg ? `No one here is called "${arg}".` : 'Type /join followed by a nickname.');
      return;
    }
    P.x = o.t.x + 1;
    P.y = o.t.y + 0.5;
    P.z = o.t.z + 1;
    P.vy = 0;
    addChat('World', '#7fe8ff', `You join ${o.name}.`);
    return;
  }
  if (c === 'ignore' || c === 'listen') {
    if (!arg) {
      addChat('World', '#7fe8ff', IGNORES.size ? `Ignored: ${[...IGNORES].join(', ')}` : "You're not ignoring anyone.");
      return;
    }
    if (c === 'ignore') IGNORES.add(arg);
    else IGNORES.delete(arg);
    saveIgnores();
    addChat('World', '#7fe8ff', c === 'ignore' ? `You will no longer see messages from ${arg}.` : `You see messages from ${arg} again.`);
    return;
  }
  if (c === 'report') {
    if (!arg) return addChat('World', '#7fe8ff', 'Type /report followed by a nickname.');
    if (!SERVER()) return addChat('World', '#7fe8ff', 'Reports need an online game.');
    Net.act('report', { pseudo: arg })
      .then(r => {
        const m = !r
          ? 'try again later'
          : r.ok
            ? r.muted
              ? `${arg} has been muted for a while.`
              : `Report recorded. Three reports mute ${arg}.`
            : r.err === 'unknown player'
              ? `No one here is called "${arg}".`
              : r.err === 'must have played a little'
                ? 'Play a little before you can report someone.'
                : r.err === 'too many actions'
                  ? 'One report at a time, slow down a bit.'
                  : r.err;
        addChat('World', '#7fe8ff', m);
        if (r && r.ok) {
          IGNORES.add(arg);
          saveIgnores();
        }
      })
      .catch(() => addChat('World', '#7fe8ff', 'Reporting unavailable (schema 003 needs to be run).'));
    return;
  }
  if (c === 'trade') {
    if (rest.length) TRADE.b.pseudo = rest.join(' ').trim();
    closeChat();
    openTab('trade');
    return;
  }
  if (['claim', 'unclaim', 'invite', 'kick', 'claims'].includes(c)) {
    claimCmd(c, rest.join(' ').trim());
    return;
  }
  if (c === 'race') {
    startRace();
    return;
  }
  addChat(
    'World',
    '#7fe8ff',
    'Commands: /join nickname · /sanctuary · /claim · /unclaim · /invite nickname · /kick nickname · /claims · /trade nickname · /ignore nickname · /listen nickname · /report nickname · /race',
  );
}
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('chatIn').value.trim().slice(0, 140);
  $('chatIn').value = '';
  if (v.startsWith('/')) command(v);
  else if (v) {
    // no more than one message a second on average (bursts of 4)
    const t = performance.now();
    chatJetons = Math.min(4, chatJetons + (t - chatT) / 1000);
    chatT = t;
    if (chatJetons < 1) addChat('World', '#7fe8ff', 'Slow down: one message per second.');
    else {
      chatJetons -= 1;
      Net.chat(v)
        .then(r => {
          if ((r && r.ok) || (r && r.err === 'offline')) addChat(ME.name, ME.color, (r.ok && r.text) || v);
          else if (r && r.err === 'muted')
            addChat('World', '#7fe8ff', `You're still muted for ${r.minutes} min (reported by other players).`);
          else if (r && r.err === 'too many actions') addChat('World', '#7fe8ff', 'Slow down: one message per second.');
          else if (r && r.err) addChat('World', '#7fe8ff', 'Message refused: ' + r.err);
        })
        .catch(() => addChat('World', '#7fe8ff', 'Message not sent, try again.'));
    }
  }
  closeChat();
});
$('chatIn').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeChat();
  }
});
$('chatBtn').onclick = () => (chatOpen ? closeChat() : openChat());
$('chatBtnDesk').onclick = () => (chatOpen ? closeChat() : openChat());

// ---------- startup ----------
function nftOf(key) {
  return S.nfts.find(n => 'nft' + n.serial === key);
}
function itemId(key) {
  if (!key) return 0;
  if (String(key).startsWith('nft')) return nftOf(key)?.id || 201;
  return +key;
}
const PKEY = 'ether-mines:profil',
  COLORS = ['#8a7bef', '#ff9ab8', '#7fe8ff', '#9fe3c4', '#ffd95e', '#ffb37a', '#b6a4ff'];
let profile;
try {
  profile = JSON.parse(localStorage.getItem(PKEY) || 'null');
} catch (e) {}
if (!profile || !profile.id)
  profile = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
    name: '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
const qs = new URLSearchParams(location.search);
$('pseudo').value = profile.name || '';
$('monde').value = qs.get('monde') || 'principal';
let acctErr = '';
const accountReady = Net.enabled
  ? Net.auth()
      .then(id => {
        $('acctTxt').textContent = 'saved online';
        $('acct').hidden = false;
        return id;
      })
      .catch(e => {
        acctErr = e.message || String(e);
        $('acctTxt').textContent = 'unavailable';
        $('acctMsg').textContent = acctErr;
        $('acct').hidden = false;
      })
  : Promise.resolve(null);
$('showCode').onclick = async () => {
  if (!Net.userId) return;
  $('showCode').disabled = true;
  try {
    const c = await Net.recoveryCode();
    $('myCode').textContent = c;
    $('myCode').hidden = false;
    $('acctMsg').textContent =
      'Write down this code: it replaces the old one and will not be shown again. It is used to find your progress on another device.';
  } catch (e) {
    $('acctMsg').textContent = 'Failed: ' + e.message;
  }
  $('showCode').disabled = false;
};
$('useCode').onclick = async () => {
  const c = $('codeIn').value.trim().toUpperCase();
  if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(c)) {
    $('acctMsg').textContent = 'The code looks like 4FC0-B18D-A98D-75EF.';
    return;
  }
  if (!Net.userId) return;
  $('useCode').disabled = true;
  try {
    const n = await Net.claimRecovery(c);
    if (n < 0) throw new Error('unknown code');
    $('acctMsg').textContent = `Progress recovered (${n} world${n > 1 ? 's' : ''}). Reloading…`;
    for (const k of Object.keys(localStorage))
      if (
        k.startsWith('ether-mines:') &&
        k !== PKEY &&
        k !== 'ether-mines:son' &&
        k !== 'ether-mines:session' &&
        k !== 'ether-mines:saison'
      )
        localStorage.removeItem(k);
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    $('acctMsg').textContent = /unknown/.test(e.message)
      ? 'Unknown code.'
      : /attempts/.test(e.message)
        ? 'Too many attempts: wait a few seconds.'
        : 'Failed: ' + e.message;
    $('useCode').disabled = false;
  }
};
$('codeIn').addEventListener('input', e => {
  let v = e.target.value
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '')
    .slice(0, 16);
  e.target.value = v.replace(/(.{4})(?=.)/g, '$1-');
});
$('netStatus').textContent = Net.enabled
  ? 'Multiplayer ready: invite your friends with the world link.'
  : 'Solo mode: add your Supabase keys in src/config.js to play online.';
function pause() {
  playing = false;
  mining = false;
  keys.clear();
  setTimeout(() => cloudSave(true), 50);
  if (touch) releaseAll();
  $('title').hidden = false;
  $('play').textContent = 'Resume';
  save();
}
let booted = false;
function toggleSnd() {
  Sound.init();
  const on = Sound.toggle();
  $('sndBtn').classList.toggle('off', !on);
  $('sndBtn').title = on ? 'Sound (M)' : 'Sound muted (M)';
}
$('sndBtn').classList.toggle('off', !Sound.on);
$('sndBtn').onclick = e => {
  e.stopPropagation();
  toggleSnd();
};
// Fullscreen: browser API on Android and desktop; on iPhone, only from the home screen icon.
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (touch && iOS && !standalone) $('hintIos').hidden = false;
function goFullscreen() {
  if (!touch || standalone || document.fullscreenElement) return;
  const el = document.documentElement;
  if (el.requestFullscreen)
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
}
$('play').onclick = async () => {
  goFullscreen();
  Sound.init();
  if (!booted) {
    // same characters as the server (005_usernames.sql): letters, digits, space, _ . -
    const name = $('pseudo')
      .value.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]/g, '')
      .trim()
      .slice(0, 16);
    if (!name) {
      $('pseudo').focus();
      $('netStatus').textContent = 'Pick a nickname so your friends recognize you.';
      return;
    }
    const world =
      ($('monde').value.trim() || 'principal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 32) || 'principal';
    // one nickname per player per world: you can't enter with someone else's
    if (Net.enabled) {
      $('play').disabled = true;
      $('netStatus').textContent = 'Checking nickname…';
      let taken = false,
        failure = null;
      try {
        taken = await Net.isUsernameTaken(world, name);
      } catch (e) {
        failure = e;
      }
      $('play').disabled = false;
      $('netStatus').textContent = '';
      if (taken || failure) {
        $('netStatus').textContent = taken
          ? `The nickname "${name}" is already taken in this world. Pick another one. If it's yours on another device, use your recovery code.`
          : 'Connection failed: ' + (failure.message || failure) + '. Check src/config.js and the schema.';
        $('pseudo').focus();
        return;
      }
    }
    profile.name = name;
    try {
      localStorage.setItem(PKEY, JSON.stringify(profile));
    } catch (e) {}
    ME = { id: profile.id, name, color: profile.color };
    KEY = 'ether-mines:' + world;
    loadState();
    $('play').disabled = true;
    $('play').textContent = Net.enabled ? 'Connecting…' : 'Generating the world…';
    $('pseudo').disabled = $('monde').disabled = true;
    try {
      history.replaceState(null, '', '?monde=' + world);
    } catch (e) {}
    try {
      await boot(world);
    } catch (e) {
      console.error(e);
      $('netStatus').textContent = 'Connection failed: ' + (e.message || e) + '. Check src/config.js and the schema.';
      $('play').disabled = false;
      $('play').textContent = 'Retry';
      $('pseudo').disabled = $('monde').disabled = false;
      return;
    }
    booted = true;
    cloudSave(true);
    $('play').disabled = false;
    $('shareRow').hidden = !Net.online;
    $('shareUrl').textContent = location.href;
  }
  $('title').hidden = true;
  playing = true;
  tryLock();
  if (!S.seen.intro) {
    S.seen.intro = 1;
    logEv('nft', 'Welcome to the validator sanctuary', '');
    setTimeout(() => logEv('mint', 'Mine a block', 'it becomes a token in your chest'), 900);
  }
};
$('copyUrl').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('copyUrl').textContent = 'Link copied';
  } catch (e) {
    const r = document.createRange();
    r.selectNodeContents($('shareUrl'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
};
let arm = false;
if (Net.enabled) $('reset').textContent = 'Start my progress over in this world';
$('reset').onclick = async () => {
  if (!arm) {
    arm = true;
    $('reset').textContent = 'Your whole chest and objectives in this world will be erased. Click to confirm';
    return;
  }
  const w = booted
    ? Net.world
    : ($('monde').value.trim() || 'principal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 32) || 'principal';
  try {
    localStorage.removeItem('ether-mines:' + w);
  } catch (e) {}
  if (Net.enabled) {
    try {
      await accountReady;
      if (Net.userId) await Net.deletePlayer(w);
    } catch (e) {
      console.error(e);
    }
  }
  booted = false;
  location.reload();
};
async function boot(world) {
  if (Net.enabled) {
    if (!Net.userId) await accountReady;
    if (Net.userId) {
      ME.id = Net.userId;
      // the server's save is authoritative; otherwise we push this browser's save to it
      try {
        const row = await Net.loadPlayer(world);
        if (row && row.state && Object.keys(row.state).length) useState(row.state);
        else cloudDirty = true;
      } catch (e) {
        console.warn(e);
        cloudOff = true;
        setTimeout(() => logEv('burn', 'Online save unavailable', 'progress kept in this browser (SQL schema needs to be run)'), 1500);
      }
    } else setTimeout(() => logEv('burn', 'Account unavailable', 'progress kept in this browser'), 1500);
    await Net.join(world, ME);
    if (Net.userId) {
      await syncInventory();
      try {
        for (const c of await Net.loadClaims()) CLAIMS.set(ckey(c.cx, c.cz), c);
      } catch (e) {
        console.warn(e);
      }
      serverAct('rewards', {});
    }
  }
  if (S.pos) {
    [P.x, P.y, P.z, yaw, pitch] = S.pos;
  } else {
    P.x = SPAWN.x + 0.5 + (Math.random() - 0.5) * 2;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  if (!inWorld(P.x, P.z)) {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  const list = wanted(),
    total = list.length;
  for (let i = 0; i < total; i += 12) {
    await loadChunks(list.slice(i, i + 12));
    $('progBar').style.width = (Math.min(total, i + 12) / total) * 60 + '%';
  }
  const q = [...meshQ];
  meshQ.clear();
  let m = 0;
  // closest to the player first; in the background, several chunks at once
  q.sort((a, b) => {
    const [ax, az] = a.split(',').map(Number),
      [bx, bz] = b.split(',').map(Number),
      pcx = cOf(P.x),
      pcz = cOf(P.z);
    return Math.hypot(ax - pcx, az - pcz) - Math.hypot(bx - pcx, bz - pcz);
  });
  for (let i = 0; i < q.length; i += 4) {
    await Promise.all(
      q.slice(i, i + 4).map(k => {
        const [cx, cz] = k.split(',').map(Number);
        return CHK.has(k) ? buildChunk(cx, cz) : null;
      }),
    );
    m = Math.min(q.length, i + 4);
    $('progBar').style.width = 60 + (m / q.length) * 40 + '%';
    await new Promise(r => setTimeout(r, 0));
  }
  updatePosHud();
  if (collides(P.x, P.y, P.z)) {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
  }
  ui();
}
requestAnimationFrame(frame);
// Test tools: opening index.html#debug exposes window.mines in the console.
if (location.hash === '#debug')
  window.mines = {
    get meshWorker() {
      return !!meshWorker;
    },
    get meshCount() {
      return MESH.size;
    },
    place,
    get target() {
      return target;
    },
    breakBlock,
    craft,
    claimCmd,
    serverAct,
    syncInventory,
    get CLAIMS() {
      return CLAIMS;
    },
    get ME() {
      return ME;
    },
    get,
    CHK,
    frozen,
    EDC,
    commit,
    encodeChunk,
    decodeChunk,
    genChunk,
    loadChunks,
    rebuildAt,
    forcePower() {
      powT = 0;
      computePower(0);
    },
    POWERED,
    openChest,
    moveChest,
    keys,
    get playing() {
      return playing;
    },
    set playing(v) {
      playing = v;
    },
    get P() {
      return P;
    },
    GEN,
    QUESTS,
    questIndex,
    ruinAt,
    nearestRuin,
    give,
    canMine,
    relight,
    openTab,
    POWERED,
    SPEC,
    ANIMALS,
    petAnimal,
    spawnChunk,
    despawnChunk,
    popAt,
    B,
    get S() {
      return S;
    },
    heightAt,
    islandTop,
    set yaw(v) {
      yaw = v;
    },
    set pitch(v) {
      pitch = v;
    },
  };
