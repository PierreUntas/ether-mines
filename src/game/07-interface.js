// Ether Mines · Interface: bar, chest, crafting, ledger, objectives.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// Gwei's icon: the same faceted diamond silhouette as the great diamond's orbiting stars (ethGeo,
// 04-render.js), flattened to 2D, in its own gold tones — Ethereum's diamond mark, reinterpreted.
const ethIcon =
  '<svg class="ethIcon" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M8 1 L1 8 L8 8 Z" fill="#fff3c2"/>' +
  '<path d="M8 1 L8 8 L15 8 Z" fill="#ffd95e"/>' +
  '<path d="M8 8 L1 8 L8 15 Z" fill="#ffb36b"/>' +
  '<path d="M8 8 L15 8 L8 15 Z" fill="#ffe9a8"/>' +
  '</svg>';
// ---------- ledger view (owned blocks) ----------
let regLines = null;
function buildRegView() {
  if (regLines) {
    scene.remove(regLines);
    regLines.geometry.dispose();
    regLines = null;
  }
  if (!regView) return;
  const pos = [];
  const E = [
    [0, 0, 0, 1, 0, 0],
    [1, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 1],
    [0, 0, 1, 0, 0, 0],
    [0, 1, 0, 1, 1, 0],
    [1, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 1],
    [0, 1, 1, 0, 1, 0],
    [0, 0, 0, 0, 1, 0],
    [1, 0, 0, 1, 1, 0],
    [1, 0, 1, 1, 1, 1],
    [0, 0, 1, 0, 1, 1],
  ];
  let n = 0;
  for (const [i, o] of OWN) {
    if (o.by !== ME.id) continue;
    const [x, y, z] = i.split(',').map(Number);
    if (Math.hypot(x - P.x, y - P.y, z - P.z) > 40) continue;
    if (++n > 600) break;
    for (const e of E)
      pos.push(
        x + e[0] * 1.01 - 0.005,
        y + e[1] * 1.01 - 0.005,
        z + e[2] * 1.01 - 0.005,
        x + e[3] * 1.01 - 0.005,
        y + e[4] * 1.01 - 0.005,
        z + e[5] * 1.01 - 0.005,
      );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  regLines = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xb4a8ff, fog: false, transparent: true, opacity: 0.9, depthTest: false }),
  );
  regLines.renderOrder = 5;
  scene.add(regLines);
}

// ---------- bar and panel ----------
function select(i) {
  S.sel = i;
  ui();
  const it = S.bar[i];
  const n = $('selname');
  n.textContent = it ? nameOf(itemId(it)) : 'Bare hand';
  n.style.opacity = 1;
  clearTimeout(select.t);
  select.t = setTimeout(() => (n.style.opacity = 0), 1600);
}
function ui() {
  const bar = $('bar');
  if (!bar.children.length)
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.innerHTML = `<i>${i + 1}</i><b></b>`;
      b.onclick = () => select(i);
      bar.appendChild(b);
    }
  if (!bar.querySelector('.more')) {
    const m = document.createElement('button');
    m.className = 'slot more';
    m.textContent = '…';
    m.setAttribute('aria-label', 'Chest');
    m.onclick = () => togglePanel();
    bar.appendChild(m);
  }
  [...bar.querySelectorAll('.slot:not(.more)')].forEach((b, i) => {
    const it = S.bar[i];
    b.classList.toggle('sel', i === S.sel);
    const old = b.querySelector('canvas');
    if (old) old.remove();
    b.querySelector('b').textContent = '';
    if (it) {
      const isN = String(it).startsWith('nft');
      b.prepend(cloneIcon(itemId(it)));
      if (!isN) b.querySelector('b').textContent = S.inv[it] || 0;
    }
  });
  setHand();
  const armorEl = $('armor');
  armorEl.hidden = !S.armor || !ITEM[S.armor];
  if (!armorEl.hidden) armorEl.textContent = `🛡 ${ITEM[S.armor].n} · -${Math.round(ITEM[S.armor].armor * 100)}% dmg`;
  const gweiEl = $('gwei');
  gweiEl.hidden = !SERVER();
  if (!gweiEl.hidden) gweiEl.innerHTML = `${ethIcon} ${S.gwei || 0} Gwei`;
  updateArmorVisual(SELF);
  updateCapeVisual(SELF);
  updateAvatarHand(SELF);
  if (!$('panel').hidden) renderPanel();
}
let tab = 'inv',
  selItem = null,
  craftCat = '';
document.querySelectorAll('.tab').forEach(
  t =>
    (t.onclick = () => {
      tab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x === t));
      renderPanel();
    }),
);
$('closeP').onclick = togglePanel;
function openTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === t));
  if ($('panel').hidden) togglePanel();
  else renderPanel();
}
$('quest').onclick = e => {
  e.stopPropagation();
  if (playing) openTab('quest');
};
function togglePanel() {
  const p = $('panel');
  p.hidden = !p.hidden;
  if (!p.hidden) {
    if (document.pointerLockElement) document.exitPointerLock();
    mining = false;
    renderPanel();
  } else if (playing) tryLock();
}
// ---------- objectives: progress ----------
const hasNft = id => S.nfts.some(n => (n.id || 201) === id);
const QUESTS = [
  { t: 'Harvest wood', h: 'Mine a tree trunk, by hand.', ok: () => S.got[5] },
  { t: 'Craft a wooden pickaxe', h: 'Crafting (E): 3 planks. A log gives 4 planks.', ok: () => S.got[102] },
  { t: 'Mine an ether crystal', h: 'The blue ore in the rock. Stone is cut with a pickaxe.', ok: () => S.got[101] },
  { t: 'Forge the crystal pickaxe', h: '2 planks + 3 crystals. Unique item, ×5 mining.', ok: () => hasNft(201) },
  {
    t: 'Open a geode',
    h: `Below layer ${DEEP}, in the large caves. Only the crystal pickaxe opens them.`,
    ok: () => S.got[103],
  },
  { t: 'Forge the pure ether pickaxe', h: '4 pure shards + 4 crystals + 2 planks.', ok: () => hasNft(202) },
  {
    t: 'Reach the genesis rock',
    h: 'Right at the bottom of the world, just above the bedrock. Only the pure ether pickaxe can break it.',
    ok: () => S.got[104],
  },
  { t: 'Craft a validator heart', h: '1 genesis fragment + 2 pure shards + 4 crystals.', ok: () => S.got[105] },
  {
    t: 'Relight an old validator',
    h: 'Follow the compass to the ruins, then right-click (or tap) the dark validator.',
    ok: () => (S.relit || 0) >= 1,
  },
  { t: 'Defeat a hostile mob', h: 'Shadows lurk in caves, guardians watch dark validators. Fight one off.', ok: () => !!S.killedMob },
  { t: 'Forge a weapon', h: 'Craft a Volt Blade or a Pure Ether Blade to fight back.', ok: () => !!(S.got[106] || S.got[107]) },
  { t: 'Sleep through the night', h: 'Place a bed, then use it after dusk to skip to dawn.', ok: () => !!S.slept },
  { t: 'Trade with another player', h: 'Open Trade, offer something, and have them accept.', ok: () => !!S.traded },
  { t: 'Reach the City', h: 'Follow the validators path from the Atrium to the great diamond.', ok: () => !!S.visitedCity },
  { t: 'Pet an animal', h: 'Right-click (or tap) a friendly creature.', ok: () => !!S.petted },
  { t: 'Earn a Genesis Titan Fang', h: 'Defeat the Genesis Titan in the depths.', ok: () => hasNft(205) },
  {
    t: 'Attest a validator',
    h: 'Objectives tab → Validators: visit one of your validators and attest it to collect its Gwei and keep it active.',
    ok: () => !!S.attested,
  },
  {
    t: 'Light a lamp through a gate',
    h: 'Craft an AND, OR or NOT gate (Crafting, Circuits), then wire it with cable so its output powers a lamp.',
    ok: () => !!S.gateLit,
  },
  {
    t: 'Build a two-key door',
    h: 'Wire two pressure plates into an AND gate, its output into a door: it only opens when both are pressed at once.',
    ok: () => !!S.twoKeyDoor,
  },
  {
    t: 'Build a self-oscillating blinker',
    h: "Loop a NOT gate's own output back into its own input with cable: no clock needed, it blinks on its own.",
    ok: () => !!S.gateBlinker,
  },
  {
    t: 'Build a latch that remembers',
    h: 'Wire an OR gate: one input from a plate, another looped back from its own output, into a lamp. Tap the plate once — it stays lit. A working example stands in the Circuits Complex.',
    ok: () => !!S.gateLatch,
  },
  {
    t: 'Build a coin flip',
    h: 'Feed a self-oscillating NOT loop and a plate into an AND gate, its output into a latch. A quick tap lands on whichever phase the loop was in — too fast to call.',
    ok: () => !!S.gateCoinFlip,
  },
];
const RELIT_GOALS = [3, 7, 12, 20, 30, 50, 75, 100];
// ---------- the network: the shared goal ----------
// All the players in the world relight old validators together. At each tier, the great diamond in the sky awakens a bit more.
const NETWORK = { n: 0, top: [], t: 0, seen: -1, score: 0, scoreSeen: -1, attack: null },
  TIERS = [3, 10, 25, 50, 100],
  MILESTONE_NAMES = ['a first star', 'two stars', 'three stars', 'four stars', 'the diamond fully awake'];
const networkLevel = () => TIERS.filter(p => NETWORK.n >= p).length;
// ---------- the network attack event (027_network_attack.sql): an hourly window, computed from the
// clock alone (no server round-trip, same reasoning as the day/night cycle) so the HUD banner can react
// the instant it opens; only the kill count/score need the existing 60s network poll. ----------
function attackWindow(t = Date.now()) {
  const epoch = Math.floor(t / 1000),
    windowId = Math.floor(epoch / 3600);
  return { windowId, active: epoch % 3600 < 600, endsAt: (windowId * 3600 + 600) * 1000 };
}
const SCORE_TIERS = [5, 15, 30, 50, 80],
  SCORE_PALETTES = [
    ['#9a8cf5', '#c2b8ff', '#6a58e0', '#8a7bef'], // base, unchanged
    ['#ffb36b', '#ffd95e', '#e08a3a', '#ff9a5c'],
    ['#7fe8ff', '#bdf6ff', '#3ab8d8', '#5cc9e8'],
    ['#ff9ab8', '#ffd0e0', '#d8508a', '#ff6fa0'],
    ['#9fe3c4', '#d4f5e6', '#3fae7e', '#6fd4a8'],
    ['#fff3c2', '#ffe9a8', '#ffb347', '#ffd95e'], // every tier held: the network triumphant, full gold
  ];
const scoreTier = () => SCORE_TIERS.filter(p => (NETWORK.score || 0) >= p).length;
function updateDiamondTier(before, after) {
  if (before === after) return;
  bigEth.geometry.dispose();
  bigEth.geometry = ethGeo(9, 15, 10, 2.5, SCORE_PALETTES[Math.min(after, SCORE_PALETTES.length - 1)]);
}
function updateAttackBanner() {
  const el = $('attack'),
    aw = attackWindow();
  el.hidden = !aw.active;
  if (!aw.active) return;
  const left = Math.max(0, Math.round((aw.endsAt - Date.now()) / 1000)),
    kills = NETWORK.attack && NETWORK.attack.window_id === aw.windowId ? NETWORK.attack.kills : 0;
  el.textContent = `⚡ The network is under attack — defend the Atrium · ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')} · ${kills} corrupted node${kills === 1 ? '' : 's'} defeated`;
}
// ---------- the leaderboard monument (028_leaderboard.sql): what other players are doing, standing in
// the City instead of buried in a tab — a canvas-texture sign, the same pattern already used for every
// procedural icon (01-textures.js) and the butterflies' sprites (05-player.js), just redrawn on poll
// instead of drawn once. No new rendering infrastructure. ----------
const LEADERBOARD = { gwei: [], validators: [], defenses: [], t: 0 },
  lbCanvas = document.createElement('canvas');
lbCanvas.width = 512;
lbCanvas.height = 768;
const lbCtx = lbCanvas.getContext('2d'),
  lbTex = new THREE.CanvasTexture(lbCanvas),
  lbMat = new THREE.MeshBasicMaterial({ map: lbTex, transparent: true, fog: false, side: THREE.DoubleSide }),
  LB_W = 1.6,
  LB_H = 2.4, // same 2:3 ratio as the 512x768 canvas — a small side plaque, not a monument: read up
  // close by anyone curious, never the dominant thing in view
  lbSign = new THREE.Mesh(new THREE.PlaneGeometry(LB_W, LB_H), lbMat);
// off to the side of the main entrance path (not centered on it, where it'd be the first and only
// thing in view) and clear of any nearby structure, checked against the real block data.
lbSign.position.set(CITY.x - 7, CITY.Y + 1 + LB_H / 2, CITY.z + CITY.R - 4);
scene.add(lbSign);
{
  // a cyan-framed, tinted-glass pedestal — the HUD's own translucent-indigo panel language (.card,
  // style.css), not a flat opaque slab — the Holo Screen block's "glowing pane" vocabulary (129, rules.js)
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x3a2d6e, transparent: true, opacity: 0.5, fog: false }),
    edgeMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, fog: false });
  const back = new THREE.Mesh(new THREE.BoxGeometry(LB_W + 0.3, LB_H + 0.3, 0.2), frameMat);
  back.position.set(lbSign.position.x, lbSign.position.y, lbSign.position.z - 0.15);
  scene.add(back);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, CITY.Y + 1, 0.5), edgeMat);
  post.position.set(lbSign.position.x, (CITY.Y + 1) / 2, lbSign.position.z - 0.15);
  scene.add(post);
}
function drawLeaderboard() {
  const c = lbCtx;
  c.clearRect(0, 0, 512, 768);
  // tinted glass, the HUD's own .card gradient (style.css) translated to canvas, not a flat slab
  const grad = c.createLinearGradient(0, 0, 512, 768);
  grad.addColorStop(0, 'rgba(66,52,128,.74)');
  grad.addColorStop(0.5, 'rgba(44,32,92,.7)');
  grad.addColorStop(1, 'rgba(30,22,64,.74)');
  c.fillStyle = grad;
  c.fillRect(0, 0, 512, 768);
  c.strokeStyle = '#7fe8ff';
  c.lineWidth = 6;
  c.strokeRect(6, 6, 500, 756);
  c.textAlign = 'center';
  c.fillStyle = '#ffd95e';
  c.font = '600 34px "IBM Plex Mono", monospace';
  c.fillText('NETWORK LEADERBOARD', 256, 62);
  c.strokeStyle = 'rgba(127,232,255,.4)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(40, 84);
  c.lineTo(472, 84);
  c.stroke();
  const sections = [
    ['⚡ Gwei earned', LEADERBOARD.gwei, '#ffd95e'],
    ['🛡 Validators kept active', LEADERBOARD.validators, '#7fe8ff'],
    ['⚔ Attacks repelled', LEADERBOARD.defenses, '#ff9ab8'],
  ];
  let y = 150;
  for (const [label, rows, color] of sections) {
    c.textAlign = 'left';
    c.fillStyle = color;
    c.font = '600 26px "IBM Plex Mono", monospace';
    c.fillText(label, 40, y);
    y += 40;
    c.font = '22px "IBM Plex Mono", monospace';
    if (!rows.length) {
      c.fillStyle = 'rgba(255,255,255,.4)';
      c.fillText('— nobody yet —', 56, y);
      y += 34;
    } else {
      rows.slice(0, 5).forEach((r, i) => {
        c.fillStyle = i === 0 ? '#fff3c2' : 'rgba(244,241,255,.85)';
        c.fillText(`${i + 1}. ${r.name}`, 56, y);
        c.textAlign = 'right';
        c.fillText(String(r.n), 472, y);
        c.textAlign = 'left';
        y += 32;
      });
    }
    y += 36;
  }
  lbTex.needsUpdate = true;
}
async function updateLeaderboard() {
  LEADERBOARD.t = 60;
  if (!SERVER()) return;
  try {
    const r = await Net.act('leaderboard', {});
    if (!r || !r.ok) return;
    LEADERBOARD.gwei = r.gwei || [];
    LEADERBOARD.validators = r.validators || [];
    LEADERBOARD.defenses = r.defenses || [];
  } catch (e) {
    return;
  }
  drawLeaderboard();
}
drawLeaderboard(); // the frame reads sensibly ("— nobody yet —") even solo or before the first poll
function networkStatus() {
  const g = TIERS.find(p => p > NETWORK.n);
  return g
    ? `The network has ${NETWORK.n} old validator${NETWORK.n > 1 ? 's' : ''} relit. At ${g}, the great diamond in the sky will awaken a bit more.`
    : 'The network is awake: the great diamond shines with all its light. Thanks to every watcher.';
}
async function updateNetwork() {
  NETWORK.t = 60;
  let n = S.relit || 0,
    top = n ? [{ name: ME.name, n }] : [],
    attack = null;
  if (SERVER()) {
    try {
      const r = await Net.act('network', {});
      if (!r || !r.ok) return;
      n = r.n;
      top = r.top || [];
      attack = r.attack || null;
    } catch (e) {
      return;
    }
  }
  const before = networkLevel(),
    scoreBefore = scoreTier();
  NETWORK.n = n;
  NETWORK.top = top;
  NETWORK.attack = attack;
  if (attack) NETWORK.score = attack.score;
  const niv = networkLevel(),
    scoreAfter = scoreTier();
  if (NETWORK.seen >= 0 && niv > before) {
    logEv('nft', `The network awakens: ${n} validators relit`, `the great diamond gains ${MILESTONE_NAMES[niv - 1]}`);
    announce('The network awakens', `${n} old validators relit`);
    Sound.chime();
  }
  NETWORK.seen = niv;
  updateDiamondTier(scoreBefore, scoreAfter);
  if (NETWORK.scoreSeen >= 0 && scoreAfter > scoreBefore) {
    logEv('nft', `The network held: defense score ${NETWORK.score}`, 'the great diamond shifts color');
    announce('The network held', `defense score ${NETWORK.score}`);
    Sound.chime();
  }
  NETWORK.scoreSeen = scoreAfter;
  STARS.forEach((e, i) => (e.visible = i < niv));
  if (tab === 'quest' && !$('panel').hidden) renderPanel();
}
// stars orbiting the great diamond: one per tier reached
const STARS = TIERS.map((p, i) => {
  const e = new THREE.Mesh(ethGeo(2.2, 3.4, 2.4, 0.5, ['#fff3c2', '#ffd95e', '#ffb36b', '#ffe9a8']), ethMat);
  e.visible = false;
  e.userData = { a: (i / TIERS.length) * Math.PI * 2, r: 26 + (i % 2) * 5, h: (i - 2) * 4 };
  scene.add(e);
  return e;
});
function animateStars(dt) {
  for (const e of STARS) {
    if (!e.visible) continue;
    const u = e.userData;
    u.a += dt * 0.16;
    e.position.set(
      bigEth.position.x + Math.cos(u.a) * u.r,
      bigEth.position.y + u.h + Math.sin(u.a * 2) * 1.5,
      bigEth.position.z + Math.sin(u.a) * u.r,
    );
    e.rotation.y += dt * 0.8;
  }
}
// A server action's button freezes right away (text + disabled) so it never looks inert; a new render
// (renderPanel, triggered by the action's own refresh) replaces it in every case anyway, so there's no
// need to re-enable it ourselves on failure.
function freezeBtn(btn, text) {
  btn.disabled = true;
  btn.textContent = text;
}
// ---------- trades between players (008_trades.sql) ----------
// An offer: "I give" and "I want" (resources, unique items, plots). The server rechecks everything on acceptance.
const emptySide = () => ({ items: {}, uniques: [], parcels: [] });
const TRADE = { offers: [], loaded: false, t: 0, msg: '', b: { pseudo: '', give: emptySide(), want: emptySide() } };
const TRADE_ERR = {
  'unknown player in this world': 'no player has that nickname in this world',
  "you don't have everything you're giving": "you don't have (or no longer have) everything you're giving",
  "that player doesn't have what you're asking for": "that player doesn't have what you're asking for",
  'the other player no longer has what they offered': 'the other player no longer has what they offered',
  "you don't have what's being asked for": "you don't have what's being asked for",
  'too many actions': 'too fast, wait a moment',
};
async function updateOffers() {
  TRADE.t = 120;
  if (!SERVER()) return;
  try {
    const r = await Net.act('offers', {});
    if (!r || !r.ok) return;
    const seen = new Set(TRADE.offers.map(o => o.id));
    for (const o of r.offers)
      if (!o.mine && !seen.has(o.id)) {
        logEv('nft', `${o.from} offers you a trade`, 'open your chest, Trade tab');
        Sound.chime();
      }
    TRADE.offers = r.offers;
    TRADE.loaded = true;
  } catch (e) {
    console.error(e);
  }
  const n = TRADE.offers.filter(o => !o.mine).length,
    tabBtn = document.querySelector('.tab[data-tab="trade"]');
  if (tabBtn) tabBtn.textContent = n ? `Trade (${n})` : 'Trade';
  if (tab === 'trade' && !$('panel').hidden && document.activeElement?.tagName !== 'INPUT') renderPanel();
}
Net.on('offer', () => {
  updateOffers();
  syncInventory();
});
const plotText = ([cx, cz]) => `plot at x ${cx * CH + 8}, z ${cz * CH + 8}`;
// one side of an offer, in plain text; unique items: description given by the server
function sideText(p, isAsk, items) {
  const l = [];
  for (const [k, n] of Object.entries(p.items || {})) l.push(`${n} × ${nameOf(+k)}`);
  for (const u of p.uniques || []) {
    if (isAsk) l.push(`a ${nameOf(u)}`);
    else {
      const o = (items || []).find(x => x.serial === u) || S.nfts.find(x => x.serial === u);
      l.push(o ? `${nameOf(o.item || o.id || 201)} (${o.mined || 0} blocks mined)` : 'a unique item');
    }
  }
  for (const c of p.parcels || []) l.push(plotText(c));
  return l.length ? l.join(', ') : 'nothing';
}
async function actOnOffer(name, args, ok) {
  TRADE.msg = '';
  try {
    const r = await Net.act(name, args);
    if (r && r.ok) {
      ok(r);
      Sound.chime();
      await syncInventory();
    } else TRADE.msg = (r && (TRADE_ERR[r.err] || r.err)) || 'refused by the server';
  } catch (e) {
    // the "missing schema" guess below is just that — a guess from the error text; always show the
    // raw message too, since a genuine runtime error can also happen to mention "function"
    const msg = e.message || '';
    TRADE.msg = /act_offer|function/i.test(msg)
      ? `trades missing on the server? run supabase/installation.sql — (${msg})`
      : `the server is not responding (${msg})`;
  }
  await updateOffers();
  if (tab === 'trade' && !$('panel').hidden) renderPanel();
}
function renderTrade(body) {
  if (!SERVER()) {
    body.innerHTML =
      '<p class="qintro">Trades happen between players of the same world, online. In solo mode, there is no one to trade with.</p>';
    return;
  }
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const button = (txt, fn, cls) => {
    const b = el('button', 'b' + (cls ? ' ' + cls : ''), txt);
    b.onclick = fn;
    return b;
  };
  body.appendChild(
    el(
      'p',
      'qintro',
      "Offer a trade to another player: resources, unique pickaxes, plots. Nothing moves until they accept, and everything changes hands at once. Validator seals can't be traded.",
    ),
  );
  if (TRADE.msg) body.appendChild(el('p', 'tradeMsg', TRADE.msg));
  const received = TRADE.offers.filter(o => !o.mine),
    sent = TRADE.offers.filter(o => o.mine);
  const card = o => {
    const c = el('div', 'offer');
    c.appendChild(el('h4', '', o.mine ? `To ${o.to}` : `${o.from} offers you`));
    c.appendChild(el('p', '', `${o.mine ? 'You give' : 'You receive'}: ${sideText(o.give, false, o.uniqueDetails)}`));
    c.appendChild(el('p', '', `${o.mine ? 'You receive' : 'You give'}: ${sideText(o.want, true)}`));
    const br = el('div', 'btnrow');
    if (o.mine)
      br.appendChild(button('Cancel', () => actOnOffer('offer_close', { oid: o.id }, () => logEv('burn', 'Offer canceled', `to ${o.to}`))));
    else {
      br.appendChild(
        button(
          'Accept',
          () =>
            actOnOffer('offer_accept', { oid: o.id }, () => {
              S.traded = 1;
              dirty = true;
              logEv('nft', `Trade completed with ${o.from}`, sideText(o.give, false, o.uniqueDetails));
            }),
          'primary',
        ),
      );
      br.appendChild(
        button('Decline', () => actOnOffer('offer_close', { oid: o.id }, () => logEv('burn', 'Offer declined', `from ${o.from}`))),
      );
    }
    c.appendChild(br);
    return c;
  };
  if (received.length) {
    body.appendChild(el('h3', 'cat', 'Received offers'));
    received.forEach(o => body.appendChild(card(o)));
  }
  if (sent.length) {
    body.appendChild(el('h3', 'cat', 'Sent offers'));
    sent.forEach(o => body.appendChild(card(o)));
  }
  // ----- new offer -----
  const b = TRADE.b;
  body.appendChild(el('h3', 'cat', 'New offer'));
  const form = el('div', 'offer');
  const row = el('label', 'tradeRow', 'To ');
  const ps = el('input');
  ps.placeholder = "player's nickname";
  ps.maxLength = 20;
  ps.value = b.pseudo;
  ps.setAttribute('list', 'echJoueurs');
  ps.oninput = () => (b.pseudo = ps.value);
  row.appendChild(ps);
  const dl = el('datalist');
  dl.id = 'echJoueurs';
  for (const o of others.values()) dl.appendChild(new Option(o.name));
  row.appendChild(dl);
  form.appendChild(row);
  const chip = (txt, active, fn) => {
    const p = el('button', 'pill' + (active ? ' sel' : ''), txt);
    p.onclick = () => {
      fn();
      renderPanel();
    };
    return p;
  };
  const toggle = (list, v) => {
    const i = list.findIndex(x => String(x) === String(v));
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
  };
  const section = (title, side, giving) => {
    form.appendChild(el('h4', '', title));
    const zone = el('div', 'pills');
    for (const [k, n] of Object.entries(side.items)) zone.appendChild(chip(`${n} × ${nameOf(+k)}  ✕`, true, () => delete side.items[k]));
    // resources: what I have (I give) or everything that exists (I ask for)
    const ids = giving
      ? Object.keys(S.inv).filter(k => S.inv[k] > 0 && +k < 200)
      : [
          ...Object.keys(B).filter(
            k => +k > 0 && +k !== 11 && +k !== 12 && (B[k].drop === undefined || B[k].drop === +k) && B[k].h !== Infinity,
          ),
          ...Object.keys(ITEM).filter(k => +k < 200),
        ];
    const sel = el('select');
    ids
      .sort((x, y) => nameOf(+x).localeCompare(nameOf(+y), 'en'))
      .forEach(k => sel.appendChild(new Option(giving ? `${nameOf(+k)} (${S.inv[k]})` : nameOf(+k), k)));
    const qty = el('input');
    qty.type = 'number';
    qty.min = 1;
    qty.value = 1;
    qty.className = 'tradeQty';
    const addRow = el('div', 'tradeAdd');
    if (ids.length) {
      addRow.appendChild(sel);
      addRow.appendChild(qty);
      addRow.appendChild(
        button('Add', () => {
          const n = Math.max(1, Math.min(giving ? S.inv[sel.value] || 1 : 99999, Math.floor(+qty.value || 1)));
          side.items[sel.value] = n;
          renderPanel();
        }),
      );
    } else addRow.appendChild(el('span', 'muted-pill', 'Your chest is empty.'));
    // unique items: mine by number (I give), by type (I ask for)
    if (giving)
      for (const n of S.nfts.filter(n => (n.id || 201) !== 203))
        zone.appendChild(
          chip(`${nameOf(n.id || 201)} #${n.serial}`, side.uniques.includes(n.serial), () => toggle(side.uniques, n.serial)),
        );
    else for (const t of [201, 202]) zone.appendChild(chip(`a ${nameOf(t)}`, side.uniques.includes(t), () => toggle(side.uniques, t)));
    // plots: mine (I give); the one I'm standing in, if it's someone else's (I ask for)
    if (giving) {
      for (const c of [...CLAIMS.values()].filter(c => c.owner === ME.id))
        zone.appendChild(
          chip(
            plotText([c.cx, c.cz]),
            side.parcels.some(p => p[0] === c.cx && p[1] === c.cz),
            () => {
              const i = side.parcels.findIndex(p => p[0] === c.cx && p[1] === c.cz);
              if (i >= 0) side.parcels.splice(i, 1);
              else side.parcels.push([c.cx, c.cz]);
            },
          ),
        );
    } else {
      for (const c of side.parcels)
        zone.appendChild(chip(`${plotText(c)}  ✕`, true, () => side.parcels.splice(side.parcels.indexOf(c), 1)));
      const here = claimAt(P.x, P.z);
      if (here && here.owner !== ME.id && !side.parcels.some(p => p[0] === here.cx && p[1] === here.cz))
        zone.appendChild(
          chip(`+ the plot you're standing in (${here.owner_name || '?'})`, false, () => {
            side.parcels.push([here.cx, here.cz]);
            if (!b.pseudo && here.owner_name) b.pseudo = here.owner_name;
          }),
        );
    }
    form.appendChild(zone);
    form.appendChild(addRow);
  };
  section('I give', b.give, true);
  section("I ask for (nothing: it's a gift)", b.want, false);
  const br = el('div', 'btnrow');
  br.appendChild(
    button(
      'Send offer',
      () => {
        const pseudo = b.pseudo.trim();
        if (!pseudo) {
          TRADE.msg = "enter the player's nickname";
          return renderPanel();
        }
        // act_offer's own parameter is named "username" (008_trades.sql) — a leftover from the
        // original French client, where this local field itself was also "pseudo", sent the RPC
        // call with a key the server-side function doesn't have, and PostgREST rejected it outright
        actOnOffer('offer', { username: pseudo, give: b.give, want: b.want }, r => {
          logEv('nft', `Offer sent to ${r.name}`, sideText(b.give, false));
          TRADE.b = { pseudo: '', give: emptySide(), want: emptySide() };
        });
      },
      'primary',
    ),
  );
  br.appendChild(
    button('Clear', () => {
      TRADE.b = { pseudo: '', give: emptySide(), want: emptySide() };
      TRADE.msg = '';
      renderPanel();
    }),
  );
  form.appendChild(br);
  body.appendChild(form);
}
// ---------- places: the place name shows up when you enter it ----------
let placeSeen = null;
function announce(title, sub) {
  const el = $('place');
  el.innerHTML = `<b></b><span></span>`;
  el.firstChild.textContent = title;
  el.lastChild.textContent = sub || '';
  el.classList.remove('seen');
  void el.offsetWidth;
  el.classList.add('seen');
}
function placeHere() {
  if (Math.hypot(P.x - SPAWN.x - 0.5, P.z - SPAWN.z - 0.5) <= 8) return ['The Atrium', 'sanctuary of the first validator'];
  if (inCity(P.x, P.z)) return ['The City', 'under the great diamond'];
  if (onPath(Math.floor(P.x), Math.floor(P.z), 2)) return ['The validators path', 'from the Atrium to the City'];
  const r = ruinAt(Math.floor(P.x / RUIN), Math.floor(P.z / RUIN));
  if (r && Math.hypot(r.x - P.x, r.z - P.z) < 7 && Math.abs(r.y - P.y) < 8) return ['Old ruins', 'a validator waits here for its heart'];
  const j = gardenAt(Math.floor(P.x / 64), Math.floor(P.z / 64));
  if (j && Math.hypot(j.x - P.x, j.z - P.z) < 6 && Math.abs(j.y - P.y) < 6) return ['Ether Garden', 'a quiet corner'];
  if (P.y > SY - 22 && islandTop(Math.floor(P.x), Math.floor(P.z)) > 0) return ['Sky islands', 'land of the jellyfish'];
  if (P.y < DEEP - 2) return ['The depths', 'geodes and genesis rock'];
  return null;
}
function updatePlace() {
  const l = placeHere(),
    name = l ? l[0] : null;
  if (name === 'The City' && !S.visitedCity) {
    S.visitedCity = 1;
    dirty = true;
  }
  if (name === placeSeen) return;
  placeSeen = name;
  if (l) announce(l[0], l[1]);
}
function questIndex() {
  for (let i = 0; i < QUESTS.length; i++) if (!QUESTS[i].ok()) return i;
  return QUESTS.length;
}
function nearestRuin() {
  const rx = Math.floor(P.x / RUIN),
    rz = Math.floor(P.z / RUIN);
  let best = null,
    bd = 1e9;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const r = ruinAt(rx + dx, rz + dz);
      if (!r) continue;
      const k = coordKey(r.x, r.y + 1, r.z);
      if (S.relitAt?.[k]) continue;
      if (CHK.has(ckey(cOf(r.x), cOf(r.z))) && get(r.x, r.y + 1, r.z) !== 73) continue;
      const d = Math.hypot(r.x + 0.5 - P.x, r.z + 0.5 - P.z);
      if (d < bd) {
        bd = d;
        best = { ...r, d };
      }
    }
  return best;
}
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function arrowTo(x, z) {
  const dx = x - P.x,
    dz = z - P.z,
    f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw),
    r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  return ARROWS[((Math.round(Math.atan2(r, f) / (Math.PI / 4)) % 8) + 8) % 8];
}
let questT = 0;
function updateQuest(dt) {
  questT -= dt;
  if (questT > 0) return;
  questT = 0.4;
  updatePlace();
  TRADE.t -= 0.4;
  if (TRADE.t <= 0) updateOffers();
  NETWORK.t -= 0.4;
  if (NETWORK.t <= 0) updateNetwork();
  updateAttackBanner();
  LEADERBOARD.t -= 0.4;
  if (LEADERBOARD.t <= 0) updateLeaderboard();
  if (tab === 'validators' && !$('panel').hidden) {
    VALIDATORS.t -= 0.4;
    if (VALIDATORS.t <= 0) updateValidators();
  }
  const i = questIndex();
  if (S.qi === undefined) S.qi = i;
  while (S.qi < i) {
    const q = QUESTS[S.qi];
    S.qi++;
    logEv(
      'nft',
      `Objective reached: ${q.t}`,
      S.qi < QUESTS.length ? `next: ${QUESTS[S.qi].t}` : 'what comes next: relight more validators',
    );
    Sound.chime();
    dirty = true;
    flashQuest();
  }
  const el = $('quest');
  let html;
  if (i < QUESTS.length) {
    const q = QUESTS[i];
    html = `<b>${i + 1}/${QUESTS.length}</b> ${q.t}`;
  } else {
    const goal = RELIT_GOALS.find(g => g > (S.relit || 0)) || S.relit + 10;
    html = `<b>${S.relit}/${goal}</b> Validators relit`;
  }
  html += `<span class="network" title="Old validators relit by all players">◈ ${NETWORK.n}/${TIERS.find(p => p > NETWORK.n) || NETWORK.n}</span>`;
  if (i >= QUESTS.length - 2) {
    const r = nearestRuin();
    if (r) html += `<span class="compass">${arrowTo(r.x + 0.5, r.z + 0.5)} ruin at ${Math.round(r.d)} m</span>`;
  }
  if (S.got[104]) {
    const bx = BOSS_CX * CH + 8.5,
      bz = BOSS_CZ * CH + 8.5,
      bd = Math.hypot(bx - P.x, bz - P.z);
    html += `<span class="compass">${arrowTo(bx, bz)} Genesis Titan at ${Math.round(bd)} m</span>`;
  }
  if (el.innerHTML !== html) el.innerHTML = html;
}
function flashQuest() {
  const el = $('quest');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function renderQuests(body) {
  const i = questIndex();
  body.insertAdjacentHTML(
    'beforeend',
    `<p class="qintro">The old validators of this world have gone dark. Grow strong enough to reach the genesis rock, forge a validator heart, and relight them, one by one.</p>`,
  );
  {
    const g = TIERS.find(p => p > NETWORK.n),
      niv = networkLevel(),
      d = document.createElement('div');
    d.className = 'networkBox';
    d.innerHTML = `<h3>The network · shared goal</h3><p>${g ? `All together, relight <b>${g}</b> old validators to give the great diamond in the sky ${MILESTONE_NAMES[niv]}.` : 'The network is awake. The great diamond shines with all its light.'}</p><div class="gauge"><i style="width:${Math.min(100, (NETWORK.n / (g || NETWORK.n || 1)) * 100)}%"></i></div><div class="tiers">${TIERS.map(p => `<span class="${NETWORK.n >= p ? 'ok' : ''}">◆ ${p}</span>`).join('')}<b>${NETWORK.n} relit</b></div>`;
    if (SERVER()) {
      const aw = attackWindow();
      d.insertAdjacentHTML(
        'beforeend',
        `<h4>Under attack, every hour</h4><p>Every hour, for its first 10 minutes, corrupted nodes converge on the Atrium — fight them off for better loot and Gwei. ${aw.active ? 'It’s happening right now.' : `Next attack at :00, in ${Math.round((3600 - ((Date.now() / 1000) % 3600)) / 60)} min.`} Defense score so far: <b>${NETWORK.score || 0}</b>.</p>`,
      );
    }
    if (NETWORK.top.length) {
      const ol2 = document.createElement('ol');
      ol2.className = 'guardians';
      for (const t of NETWORK.top) {
        const li2 = document.createElement('li');
        li2.textContent = `${t.name} · ${t.n}`;
        ol2.appendChild(li2);
      }
      d.insertAdjacentHTML('beforeend', '<h4>Guardians</h4>');
      d.appendChild(ol2);
    }
    body.appendChild(d);
    body.insertAdjacentHTML('beforeend', '<h3 class="cat">Your journey</h3>');
  }
  const ol = document.createElement('ol');
  ol.className = 'quests';
  QUESTS.forEach((q, k) => {
    ol.insertAdjacentHTML(
      'beforeend',
      `<li class="${k < i ? 'done' : k === i ? 'now' : ''}"><strong>${q.t}</strong><span>${k <= i ? q.h : '…'}</span></li>`,
    );
  });
  body.appendChild(ol);
  if (i >= QUESTS.length - 2) {
    const r = nearestRuin();
    body.insertAdjacentHTML(
      'beforeend',
      `<p class="qintro">${r ? `Nearest ruin: ${Math.round(r.d)} m, heading ${arrowTo(r.x + 0.5, r.z + 0.5)} (x ${r.x}, z ${r.z}).` : 'No dark ruin nearby.'} Each relit validator earns you one crystal a minute and a unique seal.</p>`,
    );
  }
  body.insertAdjacentHTML(
    'beforeend',
    `<div class="stats"><div><b>${S.relit || 0}</b><span>validators relit</span></div><div><b>${TIER_NAME[Math.max(0, ...S.nfts.map(n => ITEM[n.id || 201]?.tier || 0), S.got[102] ? 1 : 0)].replace(/^(your |a |the )/, '')}</b><span>best tool</span></div></div>`,
  );
}
// ---------- validators: off-chain production and maintenance (020/021 migrations) ----------
const VALIDATOR_STATE_LABEL = { dormant: 'dormant', active: 'active', damaged: 'damaged', corrupted: 'corrupted' };
const VALIDATORS = { list: [], loaded: false, t: 0 };
async function updateValidators() {
  VALIDATORS.t = 20;
  if (!SERVER()) return;
  try {
    VALIDATORS.list = await Net.loadValidators();
    VALIDATORS.loaded = true;
  } catch (e) {
    console.error(e);
    return;
  }
  if (tab === 'validators' && !$('panel').hidden) renderPanel();
}
async function maintainValidator(v, btn) {
  if (btn) freezeBtn(btn, 'Attesting…');
  const r = await serverAct('maintain_validator', { validator_id: v.id }, null, 'validator attested');
  if (r) {
    S.attested = 1;
    dirty = true;
    if (r.gwei !== undefined) S.gwei = r.gwei;
    toastInfo(r.validator.state === 'active' ? 'Validator attested: Gwei collected, upkeep paid.' : 'Validator attested.');
    Sound.chime();
  }
  // re-render even on refusal (e.g. out of reach): otherwise the button stays frozen on "Attesting…"
  updateValidators();
  ui();
}
async function upgradeValidator(v, btn) {
  if (btn) freezeBtn(btn, 'Upgrading…');
  const r = await serverAct('upgrade_validator', { validator_id: v.id }, null, 'validator upgraded');
  if (r) {
    if (r.gwei !== undefined) S.gwei = r.gwei;
    toastInfo(`Validator upgraded to level ${r.validator.level}.`);
    Sound.chime();
  }
  updateValidators();
  ui();
}
function renderValidators(body) {
  if (!SERVER()) {
    body.innerHTML = '<p class="qintro">Validators need an online game: their production and upkeep live on the server.</p>';
    return;
  }
  body.insertAdjacentHTML(
    'beforeend',
    '<p class="qintro">Each validator earns Gwei every cycle (5 minutes), whether you’re watching or not — attest anytime (from anywhere — no need to stand next to it) to collect it. But it also needs a check-in at least once a day: go longer without attesting and it degrades — damaged first, then corrupted (needs a Validator Heart to repair).</p>',
  );
  if (!VALIDATORS.loaded) {
    body.insertAdjacentHTML('beforeend', '<p class="qintro">Loading your validators…</p>');
    return;
  }
  if (!VALIDATORS.list.length) {
    body.insertAdjacentHTML(
      'beforeend',
      '<p class="qintro">No validator yet. Relight a dark one in the ruins, or craft and place one.</p>',
    );
    return;
  }
  for (const v of VALIDATORS.list) {
    const box = document.createElement('div');
    box.className = 'networkBox validatorCard';
    const net = Math.max(v.gwei_per_cycle - v.maintenance_cost, 0);
    box.insertAdjacentHTML(
      'beforeend',
      `<h3>${v.rarity[0].toUpperCase() + v.rarity.slice(1)} validator · level ${v.level}</h3>
       <p>${v.x}, ${v.y}, ${v.z} · <span class="pill">${VALIDATOR_STATE_LABEL[v.state]}</span></p>
       <p>${ethIcon} ${net} Gwei net per cycle (${v.gwei_per_cycle} produced − ${v.maintenance_cost} upkeep)${v.missed_cycles ? ` · ${v.missed_cycles} cycle${v.missed_cycles > 1 ? 's' : ''} missed` : ''}</p>`,
    );
    const br = document.createElement('div');
    br.className = 'btnrow';
    const attest = document.createElement('button');
    attest.className = 'b primary';
    attest.textContent = v.state === 'corrupted' ? 'Repair and attest (1 validator heart)' : 'Attest';
    attest.onclick = () => maintainValidator(v, attest);
    br.appendChild(attest);
    if (v.state !== 'corrupted' && v.level < 10) {
      const up = document.createElement('button');
      up.className = 'b';
      up.textContent = `Upgrade (${50 * v.level} Gwei)`;
      up.onclick = () => upgradeValidator(v, up);
      br.appendChild(up);
    }
    box.appendChild(br);
    body.appendChild(box);
  }
}
// ---------- shop: cosmetics bought with Gwei (022_cosmetics.sql). Purely decorative. ----------
async function buyCosmetic(c, btn) {
  if (btn) freezeBtn(btn, 'Buying…');
  const r = await serverAct('buy_cosmetic', { cosmetic_id: +c.id }, null, 'cosmetic bought');
  if (r) {
    S.cosmetics.push(+c.id);
    if (r.gwei !== undefined) S.gwei = r.gwei;
    toastInfo(`${c.n} bought.`);
    Sound.chime();
  }
  // re-render even on refusal (e.g. not enough Gwei): otherwise the button stays frozen on "Buying…"
  ui();
}
function renderShop(body) {
  if (!SERVER()) {
    body.innerHTML = '<p class="qintro">The shop needs an online game: cosmetics are bought with your server-side Gwei balance.</p>';
    return;
  }
  body.insertAdjacentHTML(
    'beforeend',
    '<p class="qintro">Cosmetics only: no combat, speed, harvesting, or access advantage. Outfit colors apply right away; block packs go straight into your chest.</p>',
  );
  // "combat" and "event" cosmetics are never for sale (024_loot_tiers.sql's epic tier, 027's attack
  // window) — shown last, as a trophy case, not among the buyable categories.
  const NOT_FOR_SALE = {
    combat: ['Combat trophies', 'Never sold: dropped by tough mobs, rarely.'],
    event: ['Defenders’ trophies', 'Never sold: earned by fighting off the network attack.'],
  };
  const cats = [...new Set(Object.values(COSMETICS).map(c => c.category))].sort((a, b) => (a in NOT_FOR_SALE) - (b in NOT_FOR_SALE));
  for (const cat of cats) {
    body.insertAdjacentHTML(
      'beforeend',
      `<h3 class="cat">${NOT_FOR_SALE[cat] ? NOT_FOR_SALE[cat][0] : cat[0].toUpperCase() + cat.slice(1)}</h3>`,
    );
    if (NOT_FOR_SALE[cat]) body.insertAdjacentHTML('beforeend', `<p class="note">${NOT_FOR_SALE[cat][1]}</p>`);
    for (const [id, c] of Object.entries(COSMETICS)) {
      if (c.category !== cat) continue;
      const owned = S.cosmetics.includes(+id);
      const d = document.createElement('div');
      d.className = 'rec';
      if (c.grantItem) d.appendChild(cloneIcon(c.grantItem));
      else {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = c.color || (NOT_FOR_SALE[cat] ? 'var(--gold)' : 'var(--violet)');
        d.appendChild(sw);
      }
      d.insertAdjacentHTML(
        'beforeend',
        `<div><strong>${c.n}</strong><span>${owned ? 'Owned' : NOT_FOR_SALE[cat] ? 'Drop only' : `${c.price} Gwei`}${c.grantItem ? ` · grants ${c.grantQty} × ${nameOf(c.grantItem)}` : ''}</span></div>`,
      );
      const btn = document.createElement('button');
      btn.className = 'b' + (owned ? '' : ' primary');
      if (owned && c.category === 'character') {
        btn.textContent = ME.color === c.color ? 'Equipped' : 'Wear';
        btn.disabled = ME.color === c.color;
        btn.onclick = () => {
          profile.color = ME.color = c.color;
          try {
            localStorage.setItem(PKEY, JSON.stringify(profile));
          } catch (e) {}
          dirty = cloudDirty = true;
          renderPanel();
        };
      } else if (NOT_FOR_SALE[cat]) {
        btn.textContent = owned ? 'Owned' : 'Not for sale';
        btn.disabled = true;
        btn.className = 'b';
      } else {
        btn.textContent = owned ? 'Owned' : 'Buy';
        btn.disabled = owned;
        btn.onclick = () => buyCosmetic({ id, ...c }, btn);
      }
      d.appendChild(btn);
      body.appendChild(d);
    }
  }
}
// ---------- open chest ----------
let chestQty = 1; // 1, 10 or 0 (= all)
function renderChest(body) {
  if (!CHEST) {
    body.innerHTML = '<p class="qintro">No chest open: right-click (or tap) a placed chest.</p>';
    return;
  }
  const m = CHEST;
  body.insertAdjacentHTML(
    'beforeend',
    `<p class="qintro">Chest at ${m.x}, ${m.y}, ${m.z}. Tap an item to move it. Inside a plot, only you and your invites can open it; elsewhere, everyone can.</p>`,
  );
  const q = document.createElement('div');
  q.className = 'qty';
  q.insertAdjacentHTML('beforeend', '<span>Quantity</span>');
  for (const [v, t] of [
    [1, '1'],
    [10, '10'],
    [0, 'All'],
  ]) {
    const b = document.createElement('button');
    b.textContent = t;
    b.className = 'b' + (chestQty === v ? ' primary' : '');
    b.onclick = () => {
      chestQty = v;
      renderPanel();
    };
    q.appendChild(b);
  }
  body.appendChild(q);
  const zone = (title, items, dir) => {
    body.insertAdjacentHTML('beforeend', `<h3 class="cat">${title}</h3>`);
    const grid = document.createElement('div');
    grid.className = 'grid chest';
    const list = Object.entries(items).filter(([, n]) => n > 0);
    if (!list.length)
      grid.innerHTML = `<p style="color:var(--muted);font-size:14px">${dir < 0 ? 'The chest is empty.' : 'Nothing to deposit.'}</p>`;
    for (const [it, n] of list) {
      const b = document.createElement('button');
      b.className = 'it';
      b.title = nameOf(+it);
      b.appendChild(cloneIcon(+it));
      b.insertAdjacentHTML('beforeend', `<b>${n}</b>`);
      b.onclick = () => moveChest(it, dir * (chestQty ? Math.min(chestQty, n) : n));
      grid.appendChild(b);
    }
    body.appendChild(grid);
  };
  zone('In the chest', m.items, -1);
  zone('In your bag', S.inv, 1);
}
function renderPanel() {
  const body = $('pbody');
  body.innerHTML = '';
  if (tab === 'inv') {
    const items = Object.keys(S.inv).filter(k => S.inv[k] > 0);
    const all = items.map(k => ({ k, n: S.inv[k] })).concat(S.nfts.map(n => ({ k: 'nft' + n.serial, n: 1, nft: n })));
    const wrap = document.createElement('div');
    wrap.className = 'inv';
    const grid = document.createElement('div');
    grid.className = 'grid';
    if (!all.length) grid.innerHTML = '<p style="color:var(--muted);font-size:14px">Your chest is empty. Mine a few blocks.</p>';
    if (!selItem || !all.find(a => a.k === selItem)) selItem = all[0]?.k || null;
    for (const a of all) {
      const b = document.createElement('button');
      b.className = 'it' + (a.k === selItem ? ' sel' : '') + (a.nft ? ' nftc' : '');
      b.appendChild(cloneIcon(a.nft ? a.nft.id || 201 : +a.k));
      if (!a.nft) b.insertAdjacentHTML('beforeend', `<b>${a.n}</b>`);
      b.onclick = () => {
        selItem = a.k;
        renderPanel();
      };
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    const card = document.createElement('div');
    card.className = 'card';
    if (selItem) {
      const a = all.find(x => x.k === selItem);
      const id = a.nft ? a.nft.id || 201 : +a.k;
      const isBlock = !!B[id];
      card.innerHTML = `<div class="top"></div><dl></dl><div class="btnrow"></div><p></p>`;
      const top = card.querySelector('.top');
      top.appendChild(cloneIcon(id));
      top.insertAdjacentHTML(
        'beforeend',
        `<div><h3>${nameOf(id)}${a.nft ? ` #${a.nft.serial}` : ''}</h3><span class="std">${a.nft ? 'Sealed · unique' : 'Minted · fungible'}</span></div>`,
      );
      const dl = card.querySelector('dl');
      const row = (k, v) => dl.insertAdjacentHTML('beforeend', `<div><dt>${k}</dt><dd>${v}</dd></div>`);
      if (a.nft) {
        row('Token', `#${id}-${String(a.nft.serial).padStart(4, '0')}`);
        row(id === 203 ? 'Sealed on' : 'Forged on', a.nft.date);
        row(id === 203 ? 'Validator' : 'Forge location', a.nft.where);
        if (ITEM[id].tool) row('Blocks mined with', a.nft.mined || 0);
        row('Owner', 'you');
      } else {
        row('ID', `#${id}`);
        row('In your chest', a.n);
        row('In circulation', S.supply[id] || a.n);
        if (isBlock) {
          row('Blocks placed under your name', myBlocks());
        }
      }
      const br = card.querySelector('.btnrow');
      const put = document.createElement('button');
      put.className = 'b primary';
      put.textContent = `Place in slot ${S.sel + 1}`;
      put.onclick = () => {
        const key = a.nft ? a.k : String(id);
        const ex = S.bar.indexOf(key);
        if (ex >= 0) S.bar[ex] = null;
        S.bar[S.sel] = key;
        dirty = true;
        ui();
      };
      br.appendChild(put);
      if (ITEM[id]?.armor) {
        const key = String(id),
          eq = document.createElement('button');
        eq.className = 'b';
        eq.textContent = S.armor === key ? 'Unequip' : 'Equip';
        eq.onclick = () => {
          S.armor = S.armor === key ? null : key;
          dirty = true;
          ui();
        };
        br.appendChild(eq);
      }
      card.querySelector('p').textContent = a.nft
        ? 'A unique item has its own number and keeps its history: who forged it, where, and what it has accomplished.'
        : isBlock
          ? 'Mining this block mints a token. Placing it burns it, and the placed block carries your serial number in the ledger.'
          : 'A fungible resource: every unit is worth exactly the same as another.';
    } else card.innerHTML = '<p>Pick an item to see its token sheet.</p>';
    const side = document.createElement('div');
    side.className = 'side';
    side.appendChild(previewBox());
    side.appendChild(card);
    wrap.appendChild(side);
    body.appendChild(wrap);
    body.insertAdjacentHTML(
      'beforeend',
      '<p class="note">Everything here is kept on the game’s own server — Ethereum’s vocabulary, not Ethereum itself. No wallet, no real chain.</p>',
    );
  } else if (tab === 'chest') renderChest(body);
  else if (tab === 'quest') renderQuests(body);
  else if (tab === 'validators') renderValidators(body);
  else if (tab === 'shop') renderShop(body);
  else if (tab === 'trade') renderTrade(body);
  else if (tab === 'settings') renderSettings(body);
  else if (tab === 'craft') {
    const cats = [...new Set(RECIPES.map(r => r.cat))];
    const filters = document.createElement('div');
    filters.className = 'pills craftFilters';
    const chip = (txt, active) => {
      const p = document.createElement('button');
      p.className = 'pill' + (active ? ' sel' : '');
      p.textContent = txt;
      return p;
    };
    const allChip = chip('All', craftCat === '');
    allChip.onclick = () => {
      craftCat = '';
      renderPanel();
    };
    filters.appendChild(allChip);
    for (const c of cats) {
      const b = chip(c, craftCat === c);
      b.onclick = () => {
        craftCat = c;
        renderPanel();
      };
      filters.appendChild(b);
    }
    body.appendChild(filters);
    let cat = '';
    for (const r of RECIPES) {
      if (craftCat && r.cat !== craftCat) continue;
      if (r.cat !== cat) {
        cat = r.cat;
        body.insertAdjacentHTML('beforeend', `<h3 class="cat">${cat}</h3>`);
      }
      const ok = Object.entries(r.need).every(([k, n]) => (S.inv[k] || 0) >= n);
      const d = document.createElement('div');
      d.className = 'rec';
      d.appendChild(cloneIcon(r.out));
      d.insertAdjacentHTML(
        'beforeend',
        `<div><strong>${r.n > 1 ? r.n + ' × ' : ''}${nameOf(r.out)}</strong><span>${r.d}</span><div class="need">${Object.entries(r.need)
          .map(([k, n]) => `<em class="${(S.inv[k] || 0) >= n ? '' : 'ko'}">${n} ${nameOf(+k)} (${S.inv[k] || 0})</em>`)
          .join('')}</div></div><button class="b ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'}>Craft</button>`,
      );
      d.querySelector('button').onclick = () => craft(r);
      body.appendChild(d);
    }
  } else {
    const pl = myBlocks();
    body.insertAdjacentHTML(
      'beforeend',
      `<div class="stats"><div><b>${S.totalMint}</b><span>tokens minted</span></div><div><b>${S.totalBurn}</b><span>tokens burned</span></div><div><b>${pl}</b><span>blocks placed under your name</span></div><div><b>${S.nfts.length}</b><span>unique items</span></div></div>`,
    );
    const log = document.createElement('div');
    log.className = 'log';
    const col = { mint: 'var(--mint)', burn: 'var(--burn)', craft: 'var(--gold)', nft: 'var(--cyan)' };
    log.innerHTML =
      S.log
        .map(
          l =>
            `<div><time>${l.t}</time><b style="background:${col[l.k]}">${l.k.toUpperCase()}</b><span>${l.x} <span style="color:var(--muted)">${l.d}</span></span></div>`,
        )
        .join('') || '<p style="color:var(--muted)">Nothing recorded yet.</p>';
    body.appendChild(log);
  }
}
function mintNft(id, where) {
  const serial = S.nfts.length + 1;
  const n = { serial, id, date: new Date().toLocaleDateString('en-US'), where, mined: 0 };
  S.nfts.push(n);
  S.supply[id] = (S.supply[id] || 0) + 1;
  S.got[id] = 1;
  logEv('nft', `${nameOf(id)} #${serial}`, 'minted, unique');
  return n;
}
function craft(r) {
  if (SERVER()) {
    serverAct('craft', { out_id: r.out }, null, 'crafted').then(res => {
      if (!res) return;
      logEv(
        'craft',
        `${Object.entries(r.need)
          .map(([k, n]) => n + ' ' + nameOf(+k))
          .join(' + ')}`,
        `→ ${r.n} ${nameOf(r.out)}`,
      );
      if (res.unique) addUnique(res.unique);
    });
    return;
  }
  for (const [k, n] of Object.entries(r.need)) take(+k, n);
  logEv(
    'craft',
    `${Object.entries(r.need)
      .map(([k, n]) => n + ' ' + nameOf(+k))
      .join(' + ')}`,
    `→ ${r.n} ${nameOf(r.out)}`,
  );
  if (r.nft) {
    const n = mintNft(r.out, `${Math.floor(P.x)}, ${Math.floor(P.y)}, ${Math.floor(P.z)}`);
    const serial = n.serial;
    const e = S.bar.indexOf(null);
    S.bar[e >= 0 ? e : S.sel] = 'nft' + serial;
    dirty = true;
    ui();
  } else give(r.out, r.n, 'crafted');
}
// held items: tools
const origToolMult = toolMult;
function heldTool() {
  const id = itemId(S.bar[S.sel]);
  return ITEM[id]?.tool || 1;
}
function heldTier() {
  const id = itemId(S.bar[S.sel]);
  return ITEM[id]?.tier || 0;
}
const canMine = id => heldTier() >= reqTier(id);

// ---------- settings ----------
const SETTINGS_CHOICES = [
  {
    k: 'view',
    t: 'View distance',
    d: 'Chunks of 16 blocks loaded around you. Less = smoother.',
    o: [
      [3, 'Short'],
      [4, 'Medium'],
      [5, 'Long'],
      [6, 'Very long'],
    ],
  },
  {
    k: 'sharpness',
    t: 'Sharpness',
    d: 'Image resolution. Lower = less heat on a phone.',
    o: [
      [1, 'Thrifty'],
      [1.5, 'Normal'],
      [2, 'High'],
    ],
  },
  {
    k: 'shadows',
    t: 'Cast shadows',
    d: 'Nice but costly, especially on a phone.',
    o: [
      [false, 'No'],
      [true, 'Yes'],
    ],
  },
  {
    k: 'fireflies',
    t: 'Small critters (fireflies, butterflies, petals)',
    o: [
      [false, 'No'],
      [true, 'Yes'],
    ],
  },
  {
    k: 'animals',
    t: 'Animals',
    o: [
      [false, 'No'],
      [true, 'Yes'],
    ],
  },
  {
    k: 'mobs',
    t: 'Hostile mobs',
    o: [
      [false, 'No'],
      [true, 'Yes'],
    ],
  },
  {
    k: 'sensitivity',
    t: 'Camera sensitivity',
    o: [
      [0.6, 'Gentle'],
      [1, 'Normal'],
      [1.5, 'Brisk'],
    ],
  },
  {
    k: 'fps',
    t: 'Frames per second',
    d: 'Shows smoothness next to the clock (60 = perfect, under 30 = choppy).',
    o: [
      [false, 'Hide'],
      [true, 'Show'],
    ],
  },
];
function renderSettings(body) {
  body.insertAdjacentHTML('beforeend', '<p class="qintro">Settings specific to this device. They apply right away.</p>');
  const box = document.createElement('div');
  box.className = 'settings';
  for (const c of SETTINGS_CHOICES) {
    const row = document.createElement('div');
    row.className = 'setting';
    row.innerHTML = `<div><strong>${c.t}</strong>${c.d ? `<span>${c.d}</span>` : ''}</div><div class="opts"></div>`;
    for (const [v, lab] of c.o) {
      const b = document.createElement('button');
      b.className = 'b' + (REG[c.k] === v ? ' primary' : '');
      b.textContent = lab;
      b.onclick = () => {
        REG[c.k] = v;
        saveSettings();
        applySetting(c.k);
        renderPanel();
      };
      row.querySelector('.opts').appendChild(b);
    }
    box.appendChild(row);
  }
  body.appendChild(box);
  const raz = document.createElement('button');
  raz.className = 'b';
  raz.textContent = 'Back to recommended settings';
  raz.onclick = () => {
    REG = { ...REG_DEFAULT };
    saveSettings();
    for (const c of SETTINGS_CHOICES) applySetting(c.k);
    renderPanel();
  };
  body.appendChild(raz);
}
function applySetting(k) {
  if (k === 'view') {
    VR = REG.view;
    scene.fog.far = VR * CH + 12;
    scene.fog.near = scene.fog.far * 0.37;
  }
  if (k === 'sharpness') {
    renderer.setPixelRatio(Math.min(devicePixelRatio, REG.sharpness));
    resize();
  }
  if (k === 'shadows') {
    SHADOWS = REG.shadows;
    renderer.shadowMap.enabled = REG.shadows;
    sun.castShadow = REG.shadows;
    scene.traverse(o => {
      if (o.isMesh) {
        if (o.material === opMat) o.castShadow = REG.shadows;
        [].concat(o.material).forEach(m => (m.needsUpdate = true));
      }
    });
  }
  if (k === 'fps') $('fps').hidden = !REG.fps;
}
