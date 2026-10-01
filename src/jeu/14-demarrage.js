// Mines d'Éther · Position, profil, compte, démarrage de la partie.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- position ----------
function updatePosHud() {
  const d = Math.round(Math.hypot(P.x - SPAWN.x, P.z - SPAWN.z)),
    c = claimAt(P.x, P.z);
  $('borderTxt').textContent =
    `Position ${Math.floor(P.x)} · ${Math.floor(P.z)} · ${d < 1000 ? d + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km'} du sanctuaire${c ? ` · parcelle de ${c.owner === ME.id ? 'toi' : c.owner_name || '?'}` : ''}`;
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
function makeAvatar(name, color) {
  const g = new THREE.Group(),
    M = c => new THREE.MeshLambertMaterial({ color: c }),
    col = new THREE.Color(color),
    dark = col.clone().multiplyScalar(0.7);
  const skin = M(0xf6d3b8),
    hair = M(dark),
    face = new THREE.MeshLambertMaterial({ map: faceTex('#' + dark.getHexString()) });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [skin, skin, hair, skin, skin, face]);
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
  scene.add(g);
  return { g, head, body, legs, arms, tag, name, color, walk: 0, t: null, seen: false, ph: Math.random() * 6 };
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
    o = makeAvatar(p.name || 'Joueur', p.color || '#8a7bef');
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
// joueurs ignorés : gardés dans ce navigateur, leurs messages ne s'affichent plus
const IGNORES = new Set(JSON.parse(localStorage.getItem('ether-mines:ignores') || '[]'));
const sauverIgnores = () => localStorage.setItem('ether-mines:ignores', JSON.stringify([...IGNORES]));
Net.on('chat', m => {
  if (!IGNORES.has(String(m.name).toLowerCase())) addChat(m.name, m.color, m.text);
});
Net.on('status', s => {
  if (s === 'SAVE_ERROR') logEv('burn', 'Sauvegarde refusée par le serveur', 'vérifie le schéma Supabase');
  if (s === 'CLOSED' || s === 'CHANNEL_ERROR') $('onlineTxt').textContent = 'Connexion perdue · reconnexion…';
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
  if (SERVER() && booted && playing) serverAct('rewards', {}, null, 'récompense des validateurs');
}, 60000);
// Position : 5 fois par seconde au plus, seulement si on bouge vraiment, et un signe de vie toutes les 4 s.
// Chaque envoi est reçu par tous les autres joueurs : c'est le premier poste de messages temps réel.
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
  // position serveur : un signal toutes les 15 s quand on a bougé (sert à /rejoindre et à la vérification des déplacements)
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
  if (c === 'sanctuaire') {
    P.x = SPAWN.x + 0.5;
    P.y = SPAWN.y + 0.1;
    P.z = SPAWN.z + 2.5;
    P.vy = 0;
    addChat('Monde', '#7fe8ff', 'Retour au sanctuaire.');
    return;
  }
  if (c === 'rejoindre') {
    const o = [...others.values()].find(o => o.name.toLowerCase() === arg || o.name.toLowerCase().startsWith(arg));
    if (!o || !o.t) {
      addChat('Monde', '#7fe8ff', arg ? `Personne ne s'appelle « ${arg} » ici.` : "Écris /rejoindre suivi d'un pseudo.");
      return;
    }
    P.x = o.t.x + 1;
    P.y = o.t.y + 0.5;
    P.z = o.t.z + 1;
    P.vy = 0;
    addChat('Monde', '#7fe8ff', `Tu rejoins ${o.name}.`);
    return;
  }
  if (c === 'ignorer' || c === 'ecouter' || c === 'écouter') {
    if (!arg) {
      addChat('Monde', '#7fe8ff', IGNORES.size ? `Ignorés : ${[...IGNORES].join(', ')}` : 'Tu n’ignores personne.');
      return;
    }
    if (c === 'ignorer') IGNORES.add(arg);
    else IGNORES.delete(arg);
    sauverIgnores();
    addChat('Monde', '#7fe8ff', c === 'ignorer' ? `Tu ne verras plus les messages de ${arg}.` : `Tu revois les messages de ${arg}.`);
    return;
  }
  if (c === 'signaler') {
    if (!arg) return addChat('Monde', '#7fe8ff', "Écris /signaler suivi d'un pseudo.");
    if (!SERVER()) return addChat('Monde', '#7fe8ff', 'Les signalements demandent une partie en ligne.');
    Net.act('report', { pseudo: arg })
      .then(r => {
        const m = !r
          ? 'réessaie plus tard'
          : r.ok
            ? r.muted
              ? `${arg} est rendu muet pour un moment.`
              : `Signalement enregistré. Trois signalements rendent ${arg} muet.`
            : r.err === 'joueur inconnu'
              ? `Personne ne s'appelle « ${arg} » dans ce monde.`
              : r.err === 'il faut avoir joué un peu'
                ? 'Joue un peu avant de pouvoir signaler quelqu’un.'
                : r.err === "trop d'actions"
                  ? 'Un signalement à la fois, patiente un peu.'
                  : r.err;
        addChat('Monde', '#7fe8ff', m);
        if (r && r.ok) {
          IGNORES.add(arg);
          sauverIgnores();
        }
      })
      .catch(() => addChat('Monde', '#7fe8ff', 'Signalement indisponible (schéma 003 à lancer).'));
    return;
  }
  if (['parcelle', 'liberer', 'libérer', 'inviter', 'exclure', 'parcelles'].includes(c)) {
    claimCmd(c === 'libérer' ? 'liberer' : c, rest.join(' ').trim());
    return;
  }
  addChat(
    'Monde',
    '#7fe8ff',
    'Commandes : /rejoindre pseudo · /sanctuaire · /parcelle · /liberer · /inviter pseudo · /exclure pseudo · /parcelles · /ignorer pseudo · /ecouter pseudo · /signaler pseudo',
  );
}
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('chatIn').value.trim().slice(0, 140);
  $('chatIn').value = '';
  if (v.startsWith('/')) command(v);
  else if (v) {
    // pas plus d'un message par seconde en moyenne (rafale de 4)
    const t = performance.now();
    chatJetons = Math.min(4, chatJetons + (t - chatT) / 1000);
    chatT = t;
    if (chatJetons < 1) addChat('Monde', '#7fe8ff', 'Doucement : un message par seconde.');
    else {
      chatJetons -= 1;
      Net.chat(v)
        .then(r => {
          if ((r && r.ok) || (r && r.err === 'hors ligne')) addChat(ME.name, ME.color, (r.ok && r.text) || v);
          else if (r && r.err === 'muet') addChat('Monde', '#7fe8ff', `Tu es muet encore ${r.minutes} min (signalé par d'autres joueurs).`);
          else if (r && r.err === "trop d'actions") addChat('Monde', '#7fe8ff', 'Doucement : un message par seconde.');
          else if (r && r.err) addChat('Monde', '#7fe8ff', 'Message refusé : ' + r.err);
        })
        .catch(() => addChat('Monde', '#7fe8ff', 'Message non envoyé, réessaie.'));
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

// ---------- démarrage ----------
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
        $('acctTxt').textContent = 'sauvegardé en ligne';
        $('acct').hidden = false;
        return id;
      })
      .catch(e => {
        acctErr = e.message || String(e);
        $('acctTxt').textContent = 'indisponible';
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
      "Note ce code : il remplace l'ancien et ne sera plus affiché. Il sert à retrouver ta partie sur un autre appareil.";
  } catch (e) {
    $('acctMsg').textContent = 'Impossible : ' + e.message;
  }
  $('showCode').disabled = false;
};
$('useCode').onclick = async () => {
  const c = $('codeIn').value.trim().toUpperCase();
  if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(c)) {
    $('acctMsg').textContent = 'Le code ressemble à 4FC0-B18D-A98D-75EF.';
    return;
  }
  if (!Net.userId) return;
  $('useCode').disabled = true;
  try {
    const n = await Net.claimRecovery(c);
    if (n < 0) throw new Error('code inconnu');
    $('acctMsg').textContent = `Partie retrouvée (${n} monde${n > 1 ? 's' : ''}). Rechargement…`;
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
    $('acctMsg').textContent = /inconnu/.test(e.message)
      ? 'Code inconnu.'
      : /essais/.test(e.message)
        ? 'Trop d’essais : patiente quelques secondes.'
        : 'Impossible : ' + e.message;
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
  ? 'Multijoueur prêt : invite tes amis avec le lien du monde.'
  : 'Mode solo : ajoute tes clés Supabase dans src/config.js pour jouer en ligne.';
function pause() {
  playing = false;
  mining = false;
  keys.clear();
  setTimeout(() => cloudSave(true), 50);
  if (touch) releaseAll();
  $('title').hidden = false;
  $('play').textContent = 'Reprendre';
  save();
}
let booted = false;
function toggleSnd() {
  Sound.init();
  const on = Sound.toggle();
  $('sndBtn').classList.toggle('off', !on);
  $('sndBtn').title = on ? 'Son (M)' : 'Son coupé (M)';
}
$('sndBtn').classList.toggle('off', !Sound.on);
$('sndBtn').onclick = e => {
  e.stopPropagation();
  toggleSnd();
};
// Plein écran : API du navigateur sur Android et ordinateur ; sur iPhone, seulement depuis l'écran d'accueil.
const autonome = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (touch && iOS && !autonome) $('astuceIos').hidden = false;
function pleinEcran() {
  if (!touch || autonome || document.fullscreenElement) return;
  const el = document.documentElement;
  if (el.requestFullscreen)
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
}
$('play').onclick = async () => {
  pleinEcran();
  Sound.init();
  if (!booted) {
    const name = $('pseudo').value.trim().slice(0, 16);
    if (!name) {
      $('pseudo').focus();
      $('netStatus').textContent = 'Choisis un pseudo pour que tes amis te reconnaissent.';
      return;
    }
    const world =
      ($('monde').value.trim() || 'principal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 32) || 'principal';
    profile.name = name;
    try {
      localStorage.setItem(PKEY, JSON.stringify(profile));
    } catch (e) {}
    ME = { id: profile.id, name, color: profile.color };
    KEY = 'ether-mines:' + world;
    loadState();
    $('play').disabled = true;
    $('play').textContent = Net.enabled ? 'Connexion…' : 'Génération du monde…';
    $('pseudo').disabled = $('monde').disabled = true;
    try {
      history.replaceState(null, '', '?monde=' + world);
    } catch (e) {}
    try {
      await boot(world);
    } catch (e) {
      console.error(e);
      $('netStatus').textContent = 'Connexion impossible : ' + (e.message || e) + '. Vérifie src/config.js et le schéma.';
      $('play').disabled = false;
      $('play').textContent = 'Réessayer';
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
    logEv('nft', 'Bienvenue au sanctuaire du validateur', '');
    setTimeout(() => logEv('mint', 'Mine un bloc', 'il devient un jeton dans ton coffre'), 900);
  }
};
$('copyUrl').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('copyUrl').textContent = 'Lien copié';
  } catch (e) {
    const r = document.createRange();
    r.selectNodeContents($('shareUrl'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
};
let arm = false;
if (Net.enabled) $('reset').textContent = 'Recommencer ma partie dans ce monde';
$('reset').onclick = async () => {
  if (!arm) {
    arm = true;
    $('reset').textContent = 'Tout ton coffre et tes objectifs dans ce monde seront effacés. Clique pour confirmer';
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
      // la partie du serveur fait foi ; sinon on y dépose la partie de ce navigateur
      try {
        const row = await Net.loadPlayer(world);
        if (row && row.state && Object.keys(row.state).length) useState(row.state);
        else cloudDirty = true;
      } catch (e) {
        console.warn(e);
        cloudOff = true;
        setTimeout(() => logEv('burn', 'Sauvegarde en ligne indisponible', 'partie gardée dans ce navigateur (schéma SQL à lancer)'), 1500);
      }
    } else setTimeout(() => logEv('burn', 'Compte indisponible', 'partie gardée dans ce navigateur'), 1500);
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
  // au plus près du joueur d'abord ; en arrière-plan, plusieurs tronçons à la fois
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
// Outils de test : ouvrir index.html#debug expose window.mines dans la console.
if (location.hash === '#debug')
  window.mines = {
    get mailleur() {
      return !!mailleur;
    },
    get nbMaillages() {
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
