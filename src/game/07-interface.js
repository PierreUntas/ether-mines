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

// ---------- block explorer (I key, or a tap on the block's label) ----------
// Like a blockchain explorer, for one block of the world: who placed it, when, how many blocks that builder
// has standing, and its last changes (038_block_history.sql). A block nobody ever touched is a "genesis"
// block, there since the world was generated. Solo, only what the save knows: who placed it, its number.
const agoTxt = at => {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
let explorerSeq = 0;
function openExplorer(t) {
  if (!t || !B[t.id]) return;
  let el = $('explorer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'explorer';
    el.className = 'signedit';
    el.innerHTML =
      '<div class="box"><div class="bxHead"></div><dl class="bxRows"></dl><h4>History</h4><ol class="bxLog"></ol><div class="row"><button class="b primary" data-k="close">Close</button></div><p class="note">Every change to a block is written in the world’s ledger.</p></div>';
    document.body.appendChild(el);
  }
  const seq = ++explorerSeq,
    k = coordKey(t.x, t.y, t.z),
    ow = OWN.get(k),
    mine = ow && ow.by === (SERVER() ? Net.userId : ME.id),
    who = ow ? (mine ? 'you' : ow.name || 'someone') : null,
    drop = B[t.id].drop || t.id;
  el.querySelector('.bxHead').innerHTML =
    `<img alt="" src="${icon(t.id).toDataURL()}"><div><b>${esc(B[t.id].n)}</b><span>${t.x}, ${t.y}, ${t.z}</span></div>`;
  const rows = info => {
    const r = [];
    if (ow) {
      r.push(['Placed by', `<b>${esc(who)}</b>${ow.serial ? ` · ${mine ? 'your' : 'their'} ${ord(ow.serial)} block` : ''}`]);
      if (info?.at) r.push(['When', agoTxt(info.at)]);
      if (info?.builder_blocks) r.push(['Builder', `${info.builder_blocks.toLocaleString('en-US')} blocks standing in this world`]);
    } else
      r.push([
        'Status',
        info?.history?.length ? 'Part of the terrain, changed since' : '<b>Genesis block</b> · untouched since the world began',
      ]);
    r.push(['Token', drop ? `drops #${drop}` : '—']);
    el.querySelector('.bxRows').innerHTML = r.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  };
  const log = el.querySelector('.bxLog');
  const showLog = h => {
    if (!h) {
      log.innerHTML = `<li class="muted">${SERVER() ? 'Reading the ledger…' : 'The full history is kept in the online world.'}</li>`;
      return;
    }
    if (!h.length) {
      log.innerHTML = '<li class="muted">Nothing yet: nobody has changed this block.</li>';
      return;
    }
    log.innerHTML = h
      .map(e => {
        const what = e.id ? `placed <b>${esc(B[e.id]?.n || 'a block')}</b>` : `mined <b>${esc(B[e.prev]?.n || 'the terrain')}</b>`;
        return `<li><span>${esc(e.name || 'someone')}</span> ${what}<i>${agoTxt(e.at)}</i></li>`;
      })
      .join('');
  };
  rows(null);
  showLog(null);
  el.hidden = false;
  SIGN_EDIT.open = true;
  mining = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const close = () => {
    removeEventListener('keydown', onKey, true);
    closeSignOverlay(el);
  };
  const onKey = e => {
    if (e.key === 'Escape' || e.code === 'KeyI') {
      e.stopImmediatePropagation(); // not reopened by the game's own I key
      close();
    }
  };
  addEventListener('keydown', onKey, true);
  el.querySelector('[data-k=close]').onclick = close;
  if (!SERVER()) return;
  Net.blockInfo(t.x, t.y, t.z)
    .then(info => {
      if (seq !== explorerSeq || el.hidden) return;
      rows(info);
      showLog(info?.history || []);
    })
    .catch(e => {
      console.error(e);
      if (seq === explorerSeq) log.innerHTML = '<li class="muted">The ledger can’t be reached right now.</li>';
    });
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
  if (bootsOn()) {
    armorEl.hidden = false;
    armorEl.textContent =
      (armorEl.textContent && S.armor ? armorEl.textContent + '  ·  ' : '') + `👢 +${Math.round(ITEM[211].boots * 100)}% speed · Q: dodge`;
  }
  $('tDash').hidden = !bootsOn();
  const gweiEl = $('gwei');
  gweiEl.hidden = !SERVER();
  if (!gweiEl.hidden) gweiEl.innerHTML = `${ethIcon} ${S.gwei || 0} Gwei`;
  applyLook(SELF, myLook());
  updateArmorVisual(SELF);
  updateBootsVisual(SELF, bootsOn());
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
  { id: 'wood', t: 'Harvest wood', h: 'Mine a tree trunk, by hand.', ok: () => S.got[5] },
  { id: 'wpick', t: 'Craft a wooden pickaxe', h: 'Crafting (E): 3 planks. A log gives 4 planks.', ok: () => S.got[102] },
  { id: 'crystal', t: 'Mine an ether crystal', h: 'The blue ore in the rock. Stone is cut with a pickaxe.', ok: () => S.got[101] },
  { id: 'cpick', t: 'Forge the crystal pickaxe', h: '2 planks + 3 crystals. Unique item, ×5 mining.', ok: () => hasNft(201) },
  {
    id: 'geode',
    t: 'Open a geode',
    h: `Below layer ${DEEP}, in the large caves. Only the crystal pickaxe opens them.`,
    ok: () => S.got[103],
  },
  { id: 'ppick', t: 'Forge the pure ether pickaxe', h: '4 pure shards + 4 crystals + 2 planks.', ok: () => hasNft(202) },
  {
    id: 'genesis',
    t: 'Reach the genesis rock',
    h: 'Right at the bottom of the world, just above the bedrock. Only the pure ether pickaxe can break it.',
    ok: () => S.got[104],
  },
  { id: 'heart', t: 'Craft a validator heart', h: '1 genesis fragment + 2 pure shards + 4 crystals.', ok: () => S.got[105] },
  {
    id: 'relight',
    t: 'Relight an old validator',
    h: 'Follow the compass to the ruins, then right-click (or tap) the dark validator.',
    ok: () => ownedValidators() >= 1,
  },
  {
    id: 'mob',
    t: 'Defeat a hostile mob',
    h: 'Shadows lurk in caves, guardians watch dark validators. Fight one off.',
    ok: () => !!S.killedMob,
  },
  {
    id: 'weapon',
    t: 'Forge a weapon',
    h: 'Craft a Volt Blade or a Pure Ether Blade to fight back.',
    ok: () => !!(S.got[106] || S.got[107]),
  },
  {
    id: 'sleep',
    t: 'Sleep in a bed',
    h: 'Place a bed, then use it after dusk: it rests you, and it becomes your home.',
    ok: () => !!S.slept,
  },
  { id: 'trade', t: 'Trade with another player', h: 'Open Trade, offer something, and have them accept.', ok: () => !!S.traded },
  { id: 'city', t: 'Reach the City', h: 'Follow the validators path from the Atrium to the great diamond.', ok: () => !!S.visitedCity },
  { id: 'pet', t: 'Pet an animal', h: 'Right-click (or tap) a friendly creature.', ok: () => !!S.petted },
  { id: 'titan', t: 'Earn a Genesis Titan Fang', h: 'Defeat the Genesis Titan in the depths.', ok: () => hasNft(205) },
  {
    id: 'attest',
    t: 'Attest a validator',
    h: 'Objectives tab → Validators: visit one of your validators and attest it to collect its Gwei and keep it active.',
    ok: () => !!S.attested,
  },
  {
    id: 'gateLamp',
    t: 'Light a lamp through a gate',
    h: 'Craft an AND, OR or NOT gate (Crafting, Circuits), then wire it with cable so its output powers a lamp.',
    ok: () => !!S.gateLit,
  },
  {
    id: 'twoKey',
    t: 'Build a two-key door',
    h: 'Wire two pressure plates into an AND gate, its output into a door: it only opens when both are pressed at once.',
    ok: () => !!S.twoKeyDoor,
  },
  {
    id: 'blinker',
    t: 'Build a self-oscillating blinker',
    h: "Loop a NOT gate's own output back into its own input with cable: no clock needed, it blinks on its own.",
    ok: () => !!S.gateBlinker,
  },
  {
    id: 'latch',
    t: 'Build a latch that remembers',
    h: 'Wire an OR gate: one input from a plate, another looped back from its own output, into a lamp. Tap the plate once — it stays lit. A working example stands in the Circuits Complex.',
    ok: () => !!S.gateLatch,
  },
  {
    id: 'coinFlip',
    t: 'Build a coin flip',
    h: 'Feed a self-oscillating NOT loop and a plate into an AND gate, its output into a latch. A quick tap lands on whichever phase the loop was in — too fast to call.',
    ok: () => !!S.gateCoinFlip,
  },
  {
    id: 'gatesStand',
    t: 'Leave your mark: three gates',
    h: 'Keep an AND, an OR and a NOT gate of your own standing somewhere in the world (on your plot: the Circuits Complex is public, nothing can be built there).',
    ok: () => !SERVER() || MY_GATES.n >= 3,
  },
];
// objectives of the Network chapter (v17), appended after the original list so its order never matters
QUESTS.push(
  {
    id: 'relit3',
    t: 'Relight three validators',
    h: 'One dark validator sleeps in each ruin. The compass in the Objectives tab points to the nearest.',
    ok: () => ownedValidators() >= 3,
  },
  {
    id: 'defend',
    t: 'Defend the Atrium',
    h: 'Every hour, for its first 10 minutes, corrupted nodes converge on the Atrium. Destroy one.',
    ok: () => !!S.defended,
  },
  {
    id: 'plasma',
    t: 'Defeat the Plasma Core',
    h: 'Climb a tower past the wardens on each floor: the Plasma Core waits at the top, next to its treasure.',
    ok: () => hasNft(206),
  },
  // chapter 5, The Merge (030_merge_twins.sql)
  {
    id: 'mergeVisit',
    t: 'Climb to the Merge Sanctum',
    h: 'A floating arena far from the Atrium: the compass points to the nearest. Its Beacon Stair spirals up from the ground.',
    ok: () => !!S.visitedMerge,
  },
  {
    id: 'mergeTwins',
    t: 'Bring down the twins together',
    h: 'Proof-of-Work and Proof-of-Stake guard the sanctum. One struck down rises again after 12 s unless the other falls too.',
    ok: () => hasNft(209),
  },
  {
    id: 'mergeWear',
    t: 'Wear the Merge Aegis',
    h: 'Open your chest, pick the Aegis, and equip it.',
    ok: () => String(S.armor) === '209',
  },
);
const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q]));
// ---------- story chapters (029_chapters.sql) ----------
// The objectives grouped into chapters Thea opens and closes. Main chapters unlock one after another;
// a side chapter unlocks once its "after" chapter is done. Within a chapter, any order. Finishing one
// claims its reward from the server (Gwei + a title), which pays only against proofs it checks itself.
const CHAPTERS = [
  {
    id: 'genesis',
    n: 'Genesis',
    title: 15,
    gwei: 50,
    q: ['wood', 'wpick', 'crystal', 'pet', 'city', 'sleep'],
    outro: 'You found your feet, Pathfinder. But wood won’t cut what lies below. Time to visit the forge.',
  },
  {
    id: 'forge',
    n: 'The Forge',
    title: 16,
    gwei: 100,
    q: ['cpick', 'geode', 'ppick', 'weapon', 'mob'],
    intro: 'Crystal answers to crystal. Forge a pickaxe from it, and the geodes deep below will open for you.',
    outro: 'Pure ether in your hands. Few get this far, Smith. The genesis rock waits at the bottom of the world.',
  },
  {
    id: 'awakening',
    n: 'The Awakening',
    title: 17,
    gwei: 200,
    q: ['genesis', 'heart', 'relight', 'attest'],
    intro: 'Under everything lies the genesis rock. Break it, forge a validator heart, and give a dark validator its light back.',
    outro: 'It’s beating again. One more voice in the network. Keep it attested, Awakener, and it will keep paying you.',
  },
  {
    id: 'network',
    n: 'The Network',
    title: 18,
    gwei: 400,
    q: ['relit3', 'trade', 'defend', 'plasma', 'titan'],
    intro:
      'One validator is a spark. A network is a fire. Relight more, defend the Atrium, and face the guardians of the towers and the depths.',
    outro: 'The network stands, and it stands because of you. Wear it proudly, Network Guardian.',
  },
  {
    id: 'merge',
    n: 'The Merge',
    title: 20,
    gwei: 600,
    q: ['mergeVisit', 'mergeTwins', 'mergeWear'],
    intro:
      'Up in the sky floats a sanctum where work and stake were made one. Its twin guardians never fall alone: strike them down together.',
    outro: 'Work and stake, merged at last. That aegis was forged for you, Merge Keeper.',
  },
  {
    id: 'circuits',
    n: 'Circuits',
    side: 'genesis',
    title: 19,
    gwei: 100,
    q: ['gateLamp', 'twoKey', 'blinker', 'latch', 'coinFlip', 'gatesStand'],
    intro:
      'When you have a moment: the Circuits Complex, east of here, has a working example of every gate trick. Copy them, then make your own.',
    outro: 'AND, OR, NOT… you think in gates now. Circuit Sage suits you.',
  },
];
// the epilogue: once the last main chapter (The Merge) is done, Thea closes the story, the Objectives tab
// opens on an epilogue card (kept at the top of that tab for good), and the villagers get a new line each.
// S.seen.epilogue is set the first time, so a player who finished before this existed still sees it once.
const EPILOGUE = {
  thea: [
    'Listen… the whole network hums in one rhythm now. Work and stake, together, because someone dared to climb up there.',
    'When you arrived, the Atrium’s validator was the only light in this world. Look around now. Whatever you build next, the ledger will remember it was you.',
  ],
  call: 'Merge Keeper… come back to the Atrium. There is something you should see.',
  text: 'The twins fell together, and the sanctum is quiet at last. Far below, the validators you relit blink in the dark like a new constellation. A network is never finished, and neither are the Ether Mines. But today, it holds — and it holds because of you.',
};
// the finale, played once in the world: once the story is done (S.seen.epilogue), Thea calls you back
// to the Atrium; there, a beam of light rises from it, fireworks burst overhead, the great diamond
// spins, Thea speaks, then a full-screen epilogue (S.seen.finale) — impossible to miss, unlike a
// line in the dialogue bubble while you're busy elsewhere
const FINALE = {
    called: false,
    on: false,
    t: 0,
    shown: false,
    done: false,
    nextBurst: 0,
    fx: [],
    beam: null,
    yaw0: 0,
    inGame: 0,
    day0: 0,
    pose0: null,
    cineDone: false,
  },
  FINALE_R = 14; // how close to the Atrium's center the finale starts
const finaleDist = () => Math.hypot(P.x - (SPAWN.x + 0.5), P.z - (SPAWN.z + 0.5));
function startFinale() {
  FINALE.on = true;
  FINALE.t = 0;
  FINALE.nextBurst = 0.4;
  THEA_LINES.length = 0;
  $('dialogue').hidden = true;
  FINALE.yaw0 = yaw;
  FINALE.day0 = S.day;
  const [pos, look] = eyesPose();
  FINALE.pose0 = { pos, look };
  FINALE.cineDone = false;
  cinePlay({
    end: CINE_END,
    lines: [
      [16.5, 23, 'Thea', EPILOGUE.thea[0]],
      [23, 29.5, 'Thea', EPILOGUE.thea[1]],
    ],
    pose: cinePose,
    onEnd: () => (FINALE.cineDone = true),
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.8, 70, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd95e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.set(SPAWN.x + 0.5, SPAWN.y + 35, SPAWN.z + 0.5);
  scene.add(beam);
  FINALE.beam = beam;
  Sound.theme();
}
// ---------- cinematics: the game takes the camera ----------
// A scene is { end, lines: [[from, to, speaker, text]], pose(t) -> [position, point looked at], onEnd }.
// Letterboxed, HUD hidden, the player frozen, subtitles, a Skip button (Escape, Space, Enter too).
// Played in the engine, in the player's own world: no video file. Used by the intro (a new player's
// first seconds, 14-startup.js) and the finale.
const CINE = { on: false, t: 0, said: -1, scene: null };
const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
// where the player's eyes are and what they look at, to start a shot from (or land it on)
function eyesPose() {
  return [
    camera.position.clone(),
    camera.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(10)),
  ];
}
function cinePlay(scene) {
  Object.assign(CINE, { on: true, t: 0, said: -1, scene });
  THEA_LINES.length = 0;
  $('dialogue').hidden = true;
  document.body.classList.add('cine');
  if (document.pointerLockElement) document.exitPointerLock();
  const el = document.createElement('div');
  el.id = 'cine';
  el.innerHTML = '<i class="bar top"></i><i class="bar bottom"></i><div class="sub chip" hidden></div><button class="skip">Skip ›</button>';
  el.querySelector('.skip').onclick = cineSkip;
  document.body.appendChild(el);
  addEventListener('keydown', cineKey, true);
}
const cineSkip = () => CINE.on && (CINE.t = Math.max(CINE.t, CINE.scene.end));
function cineKey(e) {
  if (!CINE.on) return;
  if (['Escape', 'Space', 'Enter'].includes(e.code)) cineSkip();
  e.stopPropagation();
  e.preventDefault();
}
function cineTick(dt) {
  if (!CINE.on) return;
  CINE.t += dt;
  const t = CINE.t,
    sc = CINE.scene;
  // the player stands still while the camera is away
  keys.clear();
  move.x = move.y = 0;
  mining = false;
  const i = sc.lines.findIndex(([a, b]) => t >= a && t < b),
    sub = $('cine')?.querySelector('.sub');
  if (sub && i !== CINE.said) {
    CINE.said = i;
    // the same bubble as a villager talking in the game (#dialogue, talk() in 09-animals.js): their name in
    // their outfit's color, their role, the line typed out
    const who = i < 0 ? null : sc.lines[i][2],
      h = who && VILLAGERS.find(v => v.name === who);
    sub.hidden = i < 0;
    sub.innerHTML =
      i < 0 ? '' : who ? `<b style="color:${h ? h.outfit[0] : 'var(--cyan)'}">${who}</b>${h ? `<i>${h.role}</i>` : ''}<p></p>` : '<p></p>';
    // the whole line at once for screen readers, while it types out on screen
    sub.setAttribute('aria-label', i < 0 ? '' : (who ? who + ': ' : '') + sc.lines[i][3]);
    if (i >= 0) {
      typeLine(sub.querySelector('p'), sc.lines[i][3]);
      if (who) Sound.animal('villager', 1);
    }
  }
  if (t >= sc.end) {
    CINE.on = false;
    document.body.classList.remove('cine');
    $('cine')?.remove();
    removeEventListener('keydown', cineKey, true);
    // you're left facing Thea
    const h = VILLAGERS[0];
    yaw = Math.atan2(-(h.x + 0.5 - P.x), -(h.z + 0.5 - P.z));
    pitch = 0;
    sc.onEnd?.();
  }
}
function cineCamera() {
  const [pos, look] = CINE.scene.pose(Math.min(CINE.t, CINE.scene.end));
  camera.position.copy(pos);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  return () => {}; // no hand drawn over a cinematic
}
// Thea's head, where the last shots land
function theaHead() {
  const h = VILLAGERS[0];
  return new THREE.Vector3(h.x + 0.5, (groundAt(h.x + 0.5, h.z + 0.5, SPAWN.y + 2, false, 4)?.y ?? SPAWN.y) + 1.5, h.z + 0.5);
}
// ---------- the intro: a new player's first 14 seconds ----------
// The great diamond, dim; a dark validator in the first ruin; then the Atrium, the one light left,
// landing in the player's own eyes in front of Thea, who then greets them (greetPlayer, 09-animals.js).
const INTRO_LINES = [
  'Long ago, the network went dark. Its old validators sleep in the ruins.',
  'Only the Atrium still shines. It has been waiting for you.',
];
function playIntro(onEnd) {
  const [eye] = eyesPose(),
    T = theaHead(),
    C = new THREE.Vector3(SPAWN.x + 0.5, SPAWN.y, SPAWN.z + 0.5),
    diamond = bigEth.position.clone(),
    toD = new THREE.Vector3(diamond.x - C.x, 0, diamond.z - C.z).normalize(),
    high0 = C.clone()
      .add(toD.clone().multiplyScalar(-14))
      .add(new THREE.Vector3(10, 34, 0)),
    high1 = C.clone()
      .add(toD.clone().multiplyScalar(-4))
      .add(new THREE.Vector3(2, 30, 0)),
    // the first ruin, if its dark validator is already loaded: otherwise straight down to the Atrium
    r = ruinAt(0, 0),
    ruin = r && get(r.x, r.y + 1, r.z) === 73 ? new THREE.Vector3(r.x + 0.5, r.y + 1.5, r.z + 0.5) : null,
    ruinCam =
      ruin &&
      ruin
        .clone()
        .add(new THREE.Vector3(C.x - ruin.x, 0, C.z - ruin.z).normalize().multiplyScalar(10))
        .add(new THREE.Vector3(0, 7, 0)),
    over = C.clone()
      .add(new THREE.Vector3(0, 14, 0))
      .add(new THREE.Vector3(eye.x - C.x, 0, eye.z - C.z).normalize().multiplyScalar(16)),
    atrium = C.clone().add(new THREE.Vector3(0, 3, 0));
  cinePlay({
    end: 14,
    lines: [
      [0.8, 7, 'Thea', INTRO_LINES[0]],
      [8.5, 14, 'Thea', INTRO_LINES[1]],
    ],
    pose(t) {
      // shot 1: high above, the great diamond, dim
      if (t < 4.5) return [high0.clone().lerp(high1, smooth(t / 4.5)), diamond.clone()];
      // shot 2: down to the first ruin's dark validator
      if (ruin && t < 9) {
        const u = smooth((t - 4.5) / 4.5);
        return [high1.clone().lerp(ruinCam, u), diamond.clone().lerp(ruin, u)];
      }
      // shot 3: over to the Atrium, then down into the player's own eyes, facing Thea
      const from = ruin ? ruinCam : high1,
        fromLook = ruin ? ruin : diamond,
        t0 = ruin ? 9 : 4.5,
        u = (t - t0) / (14 - t0);
      if (u < 0.5) {
        const v = smooth(u * 2);
        return [from.clone().lerp(over, v), fromLook.clone().lerp(atrium, v)];
      }
      const v = smooth((u - 0.5) * 2);
      return [over.clone().lerp(eye, v), atrium.clone().lerp(T, v)];
    },
    onEnd,
  });
}
// ---------- the finale's cinematic: about 30 s ----------
// Three shots around the Atrium (an orbit while night falls and the beam rises, a crane up to the great
// diamond through the fireworks, then down to Thea, who speaks face to face).
const CINE_END = 30;
// the camera's pose at time t: [position, point looked at]
function cinePose(t) {
  const C = new THREE.Vector3(SPAWN.x + 0.5, SPAWN.y, SPAWN.z + 0.5),
    h = VILLAGERS[0],
    T = new THREE.Vector3(h.x + 0.5, (groundAt(h.x + 0.5, h.z + 0.5, SPAWN.y + 2, false, 4)?.y ?? SPAWN.y) + 1.5, h.z + 0.5),
    diamond = bigEth.position.clone(),
    // the side of the Atrium facing away from the great diamond: from there, both are in frame
    away = new THREE.Vector3(C.x - diamond.x, 0, C.z - diamond.z).normalize(),
    aAway = Math.atan2(away.z, away.x),
    orbit = u => {
      const a = aAway + 2 - u * 2;
      return new THREE.Vector3(C.x + Math.cos(a) * 21, C.y + 9, C.z + Math.sin(a) * 21);
    },
    up = C.clone().add(new THREE.Vector3(0, 11, 0)),
    crane = C.clone()
      .add(away.clone().multiplyScalar(30))
      .add(new THREE.Vector3(0, 20, 0)),
    vista = C.clone()
      .add(new THREE.Vector3(0, 12, 0))
      .lerp(diamond, 0.3),
    // shot 3: three blocks in front of Thea, on the player's side, at eye height, reached from outside
    d = new THREE.Vector3(P.x - T.x, 0, P.z - T.z);
  if (d.lengthSq() < 0.01) d.copy(away);
  d.normalize();
  const near = T.clone()
      .add(d.clone().multiplyScalar(3))
      .add(new THREE.Vector3(0, 0.1, 0)),
    approach = near
      .clone()
      .add(d.clone().multiplyScalar(9))
      .add(new THREE.Vector3(0, 6, 0));
  let pos, look;
  if (t < 9) {
    // shot 1: around the Atrium while night falls and the beam rises
    pos = orbit(smooth(t / 9));
    look = up.clone();
    const b = smooth(t / 2.5); // out of the player's eyes
    pos.lerpVectors(FINALE.pose0.pos, pos, b);
    look.lerpVectors(FINALE.pose0.look, look, b);
  } else if (t < 16) {
    // shot 2: a crane up and back, the fireworks over the Atrium, the great diamond beyond
    const u = smooth((t - 9) / 7);
    pos = orbit(1).lerp(crane, u);
    look = up.clone().lerp(vista, u);
  } else if (t < 19.5) {
    // shot 3: down to Thea, from outside the Atrium
    const u = smooth((t - 16) / 3.5);
    pos = crane.clone().lerp(approach, u);
    look = vista.clone().lerp(T, u);
  } else {
    const u = smooth((t - 19.5) / 3);
    pos = approach.clone().lerp(near, u);
    look = T.clone();
  }
  return [pos, look];
}
const FW_COLORS = [0xffd95e, 0x7fe8ff, 0xff9ab8, 0x9fe3c4, 0xc2b8ff];
function fireworkBurst() {
  const a = Math.random() * Math.PI * 2,
    r = 6 + Math.random() * 12,
    x = SPAWN.x + 0.5 + Math.cos(a) * r,
    z = SPAWN.z + 0.5 + Math.sin(a) * r,
    y = SPAWN.y + 16 + Math.random() * 10,
    mat = new THREE.MeshBasicMaterial({
      color: FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)],
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    sp = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(sparkGeo, mat),
      u = Math.random() * 2 - 1,
      th = Math.random() * Math.PI * 2,
      s = Math.sqrt(1 - u * u),
      v = 6 + Math.random() * 3;
    m.position.set(x, y, z);
    m.scale.setScalar(4);
    scene.add(m);
    sp.push({ m, v: [s * Math.cos(th) * v, u * v, s * Math.sin(th) * v] });
  }
  FINALE.fx.push({ sp, mat, t: 0 });
  Sound.blip();
}
function showFinaleScreen() {
  FINALE.shown = true;
  S.seen.finale = 1;
  dirty = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const el = document.createElement('div');
  el.id = 'finale';
  el.innerHTML = '<div class="fbox"><p class="fkicker">The end · of the beginning</p></div>';
  const card = epilogueCard();
  el.firstChild.appendChild(card);
  const b = document.createElement('button');
  b.className = 'b';
  b.textContent = 'Back to the world';
  b.onclick = () => {
    el.remove();
    FINALE.done = true;
    if (playing) tryLock();
  };
  el.firstChild.appendChild(b);
  document.body.appendChild(el);
  Sound.chime();
}
function updateFinale(dt) {
  // a few seconds in the world first: logging in right inside the Atrium doesn't start it under the loading fade
  FINALE.inGame = playing ? FINALE.inGame + dt : 0;
  if (!FINALE.on) {
    if (FINALE.inGame < 4) return;
    // not in the middle of a network attack: corrupted nodes swarm the Atrium for those 10 minutes
    if (!S.seen.epilogue || S.seen.finale || !playing || !$('panel').hidden || finaleDist() > FINALE_R || attackWindow().active) return;
    startFinale();
  }
  FINALE.t += dt;
  const t = FINALE.t;
  // night falls over the Atrium for the fireworks (your own sky only, like the rest of the day cycle)
  if (t < 3 && FINALE.day0 > 0.2 && FINALE.day0 < 0.8) {
    S.day = FINALE.day0 + (0.93 - FINALE.day0) * Math.min(1, t / 3) ** 2;
    if (t + dt >= 3) S.day = 0.93;
  }
  // fireworks until you close the epilogue screen
  if (!FINALE.done && t >= FINALE.nextBurst) {
    fireworkBurst();
    FINALE.nextBurst = t + (CINE.on ? 0.25 : 0.45) + Math.random() * 0.4;
  }
  for (let i = FINALE.fx.length - 1; i >= 0; i--) {
    const f = FINALE.fx[i];
    f.t += dt;
    for (const s of f.sp) {
      s.v[1] -= 4 * dt;
      s.v[0] *= 1 - dt * 0.8;
      s.v[2] *= 1 - dt * 0.8;
      s.m.position.x += s.v[0] * dt;
      s.m.position.y += s.v[1] * dt;
      s.m.position.z += s.v[2] * dt;
    }
    f.mat.opacity = Math.max(0, 1 - f.t / 1.8);
    if (f.t > 1.8) {
      for (const s of f.sp) scene.remove(s.m);
      f.mat.dispose();
      FINALE.fx.splice(i, 1);
    }
  }
  // the beam of light, and the great diamond spinning faster
  if (FINALE.beam) {
    const m = FINALE.beam.material;
    m.opacity = FINALE.done ? Math.max(0, m.opacity - dt * 0.4) : Math.min(0.28, t * 0.2) * (0.8 + 0.2 * Math.sin(t * 3));
    FINALE.beam.rotation.y += dt * 0.6;
    if (FINALE.done && m.opacity <= 0) {
      scene.remove(FINALE.beam);
      FINALE.beam.geometry.dispose();
      m.dispose();
      FINALE.beam = null;
    }
  }
  if (!FINALE.done) bigEth.rotation.y += dt * 1.4;
  // the epilogue screen once Thea has spoken
  if (!FINALE.shown && FINALE.cineDone) showFinaleScreen();
  if (FINALE.done && !FINALE.fx.length && !FINALE.beam) FINALE.on = false;
}
const MAIN_CHAPTERS = CHAPTERS.filter(c => !c.side);
// what the server sees, so an objective never shows done while the server would refuse its reward
// (029_chapters.sql's proofs): the validators you own, and your AND/OR/NOT gates still standing
const ownedValidators = () => (SERVER() && VALIDATORS.loaded ? VALIDATORS.list.length : S.relit || 0);
const MY_GATES = { n: 0, t: 0 };
async function updateMyGates() {
  MY_GATES.t = 30;
  if (!SERVER()) return;
  try {
    MY_GATES.n = new Set((await Net.loadMyGates()).map(b => Math.floor((b.id - 112) / 4))).size;
  } catch (e) {
    console.error(e);
  }
}
// a refused chapter reward says exactly what the server is still missing
function chapterMissing(id) {
  const c = CHAPTERS.find(o => o.id === id),
    miss = [];
  if (!c) return 'chapter reward on hold: the server doesn’t see its key milestone yet';
  if (id === 'genesis') miss.push('a pickaxe in your chest');
  if (id === 'forge') miss.push('your pure ether pickaxe');
  if (id === 'awakening') miss.push('a validator under your name');
  if (id === 'network') {
    const n = ownedValidators();
    if (n < 3) miss.push(`3 validators under your name (it sees ${n})`);
    if (!hasNft(205)) miss.push('the Genesis Titan Fang');
    if (!hasNft(206)) miss.push('the Plasma Core trophy');
    if (!miss.length) miss.push('a corrupted node destroyed by you during an attack on the Atrium');
  }
  if (id === 'merge') miss.push('the Merge Aegis');
  if (id === 'circuits') miss.push(`an AND, an OR and a NOT gate of yours standing in the world (it sees ${MY_GATES.n} of the 3)`);
  return `${c.n} reward on hold: the server still needs ${miss.join(', ')}`;
}
const chapterDone = c => c.q.every(id => QBY[id].ok());
const chapterOpen = c =>
  c.side ? chapterDone(CHAPTERS.find(o => o.id === c.side)) : MAIN_CHAPTERS.slice(0, MAIN_CHAPTERS.indexOf(c)).every(chapterDone);
const currentChapter = () => MAIN_CHAPTERS.find(c => !chapterDone(c)) || null;
// the title shown under your name: the furthest one you hold
const TITLE_RANK = [20, 18, 17, 16, 19, 15];
const bestTitle = () => {
  const id = TITLE_RANK.find(t => S.cosmetics.includes(t));
  return id ? COSMETICS[id].n : '';
};
const CHAPTER_CLAIM = { busy: {}, failedAt: {} };
async function claimChapter(c) {
  if (CHAPTER_CLAIM.busy[c.id]) return;
  CHAPTER_CLAIM.busy[c.id] = 1;
  CHAPTER_CLAIM.asking = c.id;
  const r = await serverAct('claim_chapter', { chapter: c.id }, null, 'chapter reward');
  CHAPTER_CLAIM.busy[c.id] = 0;
  if (!r) {
    CHAPTER_CLAIM.failedAt[c.id] = Date.now();
    return;
  }
  if (!S.cosmetics.includes(+r.cosmetic)) S.cosmetics.push(+r.cosmetic);
  if (r.total_gwei !== undefined) S.gwei = r.total_gwei;
  toastInfo(`${c.n} complete: +${r.gwei} Gwei and the title “${COSMETICS[r.cosmetic].n}”`);
  Sound.chime();
  updateTitle();
  dirty = true;
  ui();
  if (tab === 'quest' && !$('panel').hidden) renderPanel();
}
// Thea's chapter lines, one at a time: an intro and an outro can arrive in the same tick
const THEA_LINES = [];
function theaNext() {
  if (CINE.on) return; // not under a cinematic: the HUD (and its dialogue bubble) is hidden
  if (!THEA_LINES.length || !$('dialogue').hidden) return;
  sayAs(VILLAGERS[0], THEA_LINES.shift());
}
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
// src/mobs-core.js, shared with the game server
function attackWindow(t = Date.now()) {
  return MobsCore.attackWindow(t);
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
  const clock = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  // on a phone the banner sits in the left column, out of the middle of the view: a shorter line
  el.textContent = matchMedia('(pointer:coarse)').matches
    ? `⚡ Atrium under attack · ${clock} · ${kills} node${kills === 1 ? '' : 's'}`
    : `⚡ The network is under attack — defend the Atrium · ${clock} · ${kills} corrupted node${kills === 1 ? '' : 's'} defeated`;
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
      ? Object.keys(S.inv).filter(k => S.inv[k] > 0 && !ITEM[k]?.nft)
      : [
          ...Object.keys(B).filter(
            k => +k > 0 && +k !== 11 && +k !== 12 && (B[k].drop === undefined || B[k].drop === +k) && B[k].h !== Infinity,
          ),
          ...Object.keys(ITEM).filter(k => !ITEM[k].nft),
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
  const mg = mergeAt(Math.floor(P.x / MERGE), Math.floor(P.z / MERGE));
  if (mg && Math.hypot(mg.x - P.x, mg.z - P.z) < MERGE_R + 1 && P.y > mg.y && P.y < mg.y + 12)
    return ['The Merge Sanctum', 'where work and stake become one'];
  const ar = arenaAt(Math.floor(P.x / ARENA), Math.floor(P.z / ARENA));
  if (ar && Math.hypot(ar.x - P.x, ar.z - P.z) < ARENA_W + 1 && P.y > ar.y && P.y < ar.y + 14)
    return ['The Mempool', 'where pending transactions wait — and the Front-Runner cuts the line'];
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
  if (name === 'The Merge Sanctum' && !S.visitedMerge) {
    S.visitedMerge = 1;
    dirty = true;
  }
  if (name === placeSeen) return;
  placeSeen = name;
  if (l) announce(l[0], l[1]);
}
// the objective shown at the top of the screen: the first one left in the current chapter
function questIndex() {
  const c = currentChapter(),
    id = c && c.q.find(q => !QBY[q].ok());
  return id ? QUESTS.indexOf(QBY[id]) : QUESTS.length;
}
function nearestMerge() {
  const mx = Math.floor(P.x / MERGE),
    mz = Math.floor(P.z / MERGE);
  let best = null;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const m = mergeAt(mx + dx, mz + dz);
      if (!m) continue;
      const d = Math.hypot(m.sx + 0.5 - P.x, m.sz + 0.5 - P.z);
      if (!best || d < best.d) best = { ...m, d };
    }
  return best;
}
function nearestArena() {
  const ax = Math.floor(P.x / ARENA),
    az = Math.floor(P.z / ARENA);
  let best = null;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const a = arenaAt(ax + dx, az + dz);
      if (!a) continue;
      const d = Math.hypot(a.x + 0.5 - P.x, a.z + 0.5 - P.z);
      if (!best || d < best.d) best = { ...a, d };
    }
  return best;
}
function nearestTower() {
  const tx = Math.floor(P.x / TOWER),
    tz = Math.floor(P.z / TOWER);
  let best = null;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const t = towerAt(tx + dx, tz + dz);
      if (!t) continue;
      const d = Math.hypot(t.x + 0.5 - P.x, t.z + 0.5 - P.z);
      if (!best || d < best.d) best = { ...t, d };
    }
  return best;
}
// objectives and chapters reached since the last tick: announced once, rewards claimed from the server
function progressChapters() {
  if (!S.qd) {
    // first run of the chapter system on this save: what's already done is taken as seen, silently
    // (Thea's own greeting, 14-startup.js, opens Genesis for a brand-new player)
    S.qd = {};
    S.chSeen = {};
    for (const q of QUESTS) if (q.ok()) S.qd[q.id] = 1;
    for (const c of CHAPTERS) {
      if (chapterOpen(c)) S.chSeen[c.id + ':in'] = 1;
      if (chapterDone(c)) S.chSeen[c.id] = 1;
    }
    dirty = true;
  }
  for (const c of CHAPTERS) {
    const open = chapterOpen(c);
    for (const id of c.q) {
      const q = QBY[id];
      if (S.qd[id] || !q.ok()) continue;
      S.qd[id] = 1;
      dirty = true;
      if (!open) continue;
      const left = c.q.filter(o => !QBY[o].ok()).length;
      logEv('nft', `Objective reached: ${q.t}`, left ? `${c.n}: ${left} left` : `${c.n} complete`);
      Sound.chime();
      flashQuest();
    }
    if (open && !S.chSeen[c.id + ':in']) {
      S.chSeen[c.id + ':in'] = 1;
      dirty = true;
      if (c.intro) THEA_LINES.push(c.intro);
      logEv('nft', `New chapter: ${c.n}`, `${c.q.length} objectives · reward ${c.gwei} Gwei and a title`);
    }
    if (open && chapterDone(c) && !S.chSeen[c.id]) {
      S.chSeen[c.id] = 1;
      dirty = true;
      if (c.outro) THEA_LINES.push(c.outro);
      if (!SERVER()) toastInfo(`${c.n} complete! (rewards are paid in an online game)`);
    }
    // the reward: claimed once the server's view of your cosmetics is loaded, retried ten minutes after a refusal
    if (
      SERVER() &&
      COSMETICS_LOADED &&
      chapterDone(c) &&
      !S.cosmetics.includes(c.title) &&
      Date.now() - (CHAPTER_CLAIM.failedAt[c.id] || 0) > 600000
    )
      claimChapter(c);
  }
  const last = MAIN_CHAPTERS[MAIN_CHAPTERS.length - 1];
  if (chapterOpen(last) && chapterDone(last) && !S.seen.epilogue) {
    S.seen.epilogue = 1;
    dirty = true;
  }
  // the story is done but the finale hasn't played: Thea calls you back to the Atrium (once a session)
  if (S.seen.epilogue && !S.seen.finale && !FINALE.called && !FINALE.on) {
    FINALE.called = true;
    if (finaleDist() > FINALE_R) THEA_LINES.push(EPILOGUE.call);
  }
  theaNext();
}
function epilogueCard() {
  const d = document.createElement('div'),
    mains = MAIN_CHAPTERS.filter(chapterDone).length,
    circuits = CHAPTERS.find(c => c.id === 'circuits'),
    g = TIERS.find(p => p > NETWORK.n),
    next = [];
  if (!chapterDone(circuits))
    next.push('Finish the Circuits side chapter: the Circuits Complex, east of the Atrium, shows every gate trick.');
  if (g) next.push(`Help the whole world relight ${g} old validators, so the great diamond in the sky wakes a little more.`);
  if (SERVER()) next.push('Defend the Atrium when corrupted nodes attack, every hour on the hour.');
  next.push('The towers, the Genesis Titan and the Merge twins wait for a rematch.');
  next.push('Build something that lasts: /claim a plot, and every block you place carries your name.');
  d.className = 'chapter epilogue';
  d.innerHTML = `<h3>Epilogue · The network holds</h3><p class="etext"></p><div class="stats"><div><b>${mains}/${MAIN_CHAPTERS.length}</b><span>chapters</span></div><div><b>${ownedValidators()}</b><span>validators relit</span></div><div><b>${[205, 206, 209].filter(hasNft).length}/3</b><span>guardians defeated</span></div><div><b>${(S.dayN || 0) + 1}</b><span>days in this world</span></div></div><h4>What now?</h4><ul class="next"></ul>`;
  d.querySelector('.etext').textContent = EPILOGUE.text;
  const ul = d.querySelector('.next');
  for (const t of next) {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  }
  // once played, the finale can be watched again
  if (S.seen.finale && !FINALE.on) {
    const b = document.createElement('button');
    b.className = 'b';
    b.textContent = 'Replay the finale at the Atrium';
    b.onclick = () => {
      delete S.seen.finale;
      Object.assign(FINALE, { called: true, shown: false, done: false });
      dirty = true;
      if (!$('panel').hidden) togglePanel();
      toastInfo(
        attackWindow().active
          ? 'The finale will play at the Atrium once the attack is over (10 minutes past the hour).'
          : finaleDist() > FINALE_R
            ? 'Head back to the Atrium: the finale plays there.'
            : 'The finale is about to begin…',
      );
    };
    d.appendChild(b);
  }
  return d;
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
  // the validator list: every 20 s on its own tab, every minute otherwise (the objectives count it)
  VALIDATORS.t -= tab === 'validators' && !$('panel').hidden ? 0.4 : 0.4 / 3;
  if (VALIDATORS.t <= 0) updateValidators();
  if (!S.cosmetics.includes(19)) {
    MY_GATES.t -= 0.4;
    if (MY_GATES.t <= 0) updateMyGates();
  }
  progressChapters();
  const el = $('quest'),
    c = currentChapter(),
    q = QUESTS[questIndex()];
  let html;
  if (q) {
    const done = c.q.filter(id => QBY[id].ok()).length;
    html = `<b>${c.n} ${done}/${c.q.length}</b> ${q.t}`;
  } else if (S.seen.epilogue && !S.seen.finale) {
    const aw = attackWindow();
    html = aw.active
      ? `<b>Finale</b> once the attack is over · ${Math.ceil((aw.endsAt - Date.now()) / 60000)} min`
      : `<b>Finale</b> Return to the Atrium <span class="compass">${arrowTo(SPAWN.x + 0.5, SPAWN.z + 0.5)} ${Math.round(finaleDist())} m</span>`;
  } else {
    const goal = RELIT_GOALS.find(g => g > (S.relit || 0)) || S.relit + 10;
    html = `<b>${S.relit}/${goal}</b> Validators relit`;
  }
  html += `<span class="network" title="Old validators relit by all players">◈ ${NETWORK.n}/${TIERS.find(p => p > NETWORK.n) || NETWORK.n}</span>`;
  if (!q || q.id === 'relight' || q.id === 'relit3') {
    const r = nearestRuin();
    if (r) html += `<span class="compass">${arrowTo(r.x + 0.5, r.z + 0.5)} ruin at ${Math.round(r.d)} m</span>`;
  }
  if (q && q.id === 'plasma') {
    const t = nearestTower();
    if (t) html += `<span class="compass">${arrowTo(t.x + 0.5, t.z + 0.5)} tower at ${Math.round(t.d)} m</span>`;
  }
  if (q && (q.id === 'mergeVisit' || q.id === 'mergeTwins')) {
    const m = nearestMerge();
    if (m) html += `<span class="compass">${arrowTo(m.sx + 0.5, m.sz + 0.5)} sanctum at ${Math.round(m.d)} m</span>`;
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
  if (S.seen.epilogue) body.appendChild(epilogueCard());
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
  const cur = currentChapter();
  for (const c of CHAPTERS) {
    const open = chapterOpen(c),
      done = c.q.filter(id => QBY[id].ok()).length,
      claimed = S.cosmetics.includes(c.title),
      d = document.createElement('div');
    d.className = 'chapter' + (open ? '' : ' locked') + (c === cur ? ' now' : '');
    const status = !open
      ? `Unlocks after ${CHAPTERS.find(o => o.id === (c.side || MAIN_CHAPTERS[MAIN_CHAPTERS.indexOf(c) - 1].id)).n}`
      : claimed
        ? `Complete · title “${COSMETICS[c.title].n}” earned`
        : done === c.q.length
          ? SERVER()
            ? 'Complete · claiming the reward…'
            : 'Complete · rewards are paid in an online game'
          : `Reward: ${c.gwei} Gwei and the title “${COSMETICS[c.title].n}”`;
    d.innerHTML = `<h3>${c.side ? 'Side chapter' : `Chapter ${MAIN_CHAPTERS.indexOf(c) + 1}`} · ${c.n}<b>${done}/${c.q.length}</b></h3><div class="gauge"><i style="width:${(done / c.q.length) * 100}%"></i></div><p class="note">${status}</p>`;
    if (open && done < c.q.length) {
      const ol = document.createElement('ol');
      ol.className = 'quests';
      let first = true;
      for (const id of c.q) {
        const q = QBY[id],
          ok = q.ok(),
          now = !ok && first;
        if (now) first = false;
        ol.insertAdjacentHTML('beforeend', `<li class="${ok ? 'done' : now ? 'now' : ''}"><strong>${q.t}</strong><span>${q.h}</span></li>`);
      }
      d.appendChild(ol);
    }
    body.appendChild(d);
  }
  if (!cur || ['relight', 'relit3'].includes(QUESTS[i]?.id)) {
    const r = nearestRuin();
    body.insertAdjacentHTML(
      'beforeend',
      `<p class="qintro">${r ? `Nearest ruin: ${Math.round(r.d)} m, heading ${arrowTo(r.x + 0.5, r.z + 0.5)} (x ${r.x}, z ${r.z}).` : 'No dark ruin nearby.'} Each relit validator earns you Gwei and a unique seal.</p>`,
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
// ---------- shop: cosmetics bought with Gwei (022_cosmetics.sql, 032_shop.sql). Purely decorative. ----------
async function buyCosmetic(c, btn) {
  if (btn) freezeBtn(btn, 'Buying…');
  const r = await serverAct('buy_cosmetic', { cosmetic_id: +c.id }, null, 'cosmetic bought');
  if (r) {
    if (!S.cosmetics.includes(+c.id)) S.cosmetics.push(+c.id);
    if (r.gwei !== undefined) S.gwei = r.gwei;
    toastInfo(c.grantItem ? `${c.n} bought: ${c.grantQty} × ${nameOf(c.grantItem)} in your chest.` : `${c.n} bought.`);
    Sound.chime();
    // a wearable goes on right away (you just paid for it), and stops being a mere try-on
    if (c.slot && !c.grantItem) {
      if (PREVIEW) PREVIEW.tryLook = PREVIEW.tryColor = null;
      setLookSlot(c.slot, +c.id);
    }
  }
  // re-render even on refusal (e.g. not enough Gwei): otherwise the button stays frozen on "Buying…"
  ui();
}
// what a shop row shows when there's no item icon: the piece's own color, or one per slot
const SLOT_TINT = { head: '#ffd166', back: '#7fe8ff', companion: '#ff9ab8', trail: '#b6a4ff', tool: '#c9a6ff', plating: '#b48cff' };
// a small painted hint of each piece, by its style (17-looks.js draws the real thing)
const SWATCH = {
  prospector: 'linear-gradient(#7a4f2a 62%, #3b2a1a 62%, #3b2a1a 72%, #6b4423 72%)',
  straw: 'linear-gradient(#f0d27a 60%, #c0392b 60%, #c0392b 70%, #e8c66a 70%)',
  miner: 'radial-gradient(circle at 50% 62%, #fff6c0 14%, #ffcc33 15%)',
  beanie: 'radial-gradient(circle at 50% 18%, #fff 12%, transparent 13%), linear-gradient(#ff6b6b 72%, #d94f4f 72%)',
  visor: 'linear-gradient(#1b2a4a 42%, #00eaff 42%, #00eaff 60%, #1b2a4a 60%)',
  panda:
    'radial-gradient(circle at 25% 22%, #1a1a22 14%, transparent 15%), radial-gradient(circle at 75% 22%, #1a1a22 14%, transparent 15%), #f4f1ff',
  halo: 'radial-gradient(circle, #0b2b30 30%, #3fd2c7 31%, #3fd2c7 46%, #0b2b30 47%)',
  crown: 'radial-gradient(circle at 50% 70%, #8a7bef 12%, transparent 13%), linear-gradient(#0000 30%, #ffd166 30%)',
  pack: 'linear-gradient(#3f6e4a 20%, #5a3a20 20%, #5a3a20 34%, #7a5230 34%)',
  cape2: 'linear-gradient(90deg, #ff8a3d 50%, #8a7bef 50%)',
  validator: 'linear-gradient(#2a1838 40%, #00eaff 40%, #00eaff 54%, #2a1838 54%)',
  blob: 'radial-gradient(circle at 35% 30%, #bff4ff, #3fd2c7 60%)',
  diamond: 'conic-gradient(from 45deg, #8a7bef, #b6a4ff, #6a58e0, #c9a6ff, #8a7bef)',
  spectrum: 'linear-gradient(90deg, #ff6b6b, #ffd95e, #9fe3c4, #7fe8ff, #b6a4ff)',
  ember: 'linear-gradient(#ffb347, #ff6b3d)',
  gwei: 'radial-gradient(circle at 30% 30%, #fff3c0 18%, #ffd95e 19%, #ffd95e 40%, #b08a2e 41%)',
  bubbles: 'radial-gradient(circle at 30% 30%, #bff4ff 15%, #3fd2c7 16%, #3fd2c7 30%, #1d5c63 31%)',
  prism: 'linear-gradient(135deg, #ff9ab8, #c9a6ff, #7fe8ff)',
  gold: 'linear-gradient(135deg, #fff3c0, #ffd166, #b08a2e)',
};
const swatchOf = c =>
  SWATCH[c.style] ||
  (c.style === 'wings' || c.style === 'banner'
    ? `linear-gradient(${c.accent} 18%, ${c.color} 18%)`
    : c.pants
      ? `linear-gradient(${c.color} 58%, ${c.pants} 58%)`
      : c.color);
// "Try": puts the piece on the character in the shop, without buying it
function tryOn(id) {
  const c = COSMETICS[id],
    p = PREVIEW;
  if (!p || !c.slot) return;
  const same = p.tryLook && p.tryLook[c.slot] === +id;
  p.tryLook = same ? null : { ...myLook(), ...(p.tryLook || {}), [c.slot]: +id };
  p.tryColor = !same && c.slot === 'outfit' ? c.color : same ? null : p.tryColor;
  renderPanel();
}
function shopCountdown() {
  const left = (shopWeek() + 1) * 604800 + 345600 - Date.now() / 1000,
    d = Math.floor(left / 86400),
    h = Math.floor((left % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h ${Math.floor((left % 3600) / 60)} min`;
}
function shopRow(id, ctx) {
  const c = COSMETICS[id],
    owned = S.cosmetics.includes(+id),
    worn = c.slot && myLook()[c.slot] === +id,
    sellable = forSale(c),
    week = shopWeek(),
    f = ctx.featured,
    onSale = f.sale.includes(+id),
    price = shopPrice(id, week),
    limitedAway = c.limited && f.limited !== +id,
    trying = PREVIEW && PREVIEW.tryLook && c.slot && PREVIEW.tryLook[c.slot] === +id;
  const d = document.createElement('div');
  d.className = 'rec shoprow' + (worn ? ' worn' : '');
  if (c.grantItem) d.appendChild(cloneIcon(c.grantItem));
  else {
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = swatchOf(c) || SLOT_TINT[c.slot] || (sellable ? 'var(--violet)' : 'var(--gold)');
    d.appendChild(sw);
  }
  let sub;
  if (c.grantItem) sub = `grants ${c.grantQty} × ${nameOf(c.grantItem)} · buy as often as you like`;
  else if (owned) sub = `${SLOT_LABEL[c.slot] || 'Owned'} · ${worn ? 'worn' : 'owned'}`;
  else if (!sellable) sub = c.category === 'title' ? 'Chapter reward' : c.category === 'event' ? 'Network attack reward' : 'Drop only';
  else if (limitedAway) {
    const lim = Object.keys(COSMETICS)
        .map(Number)
        .filter(k => COSMETICS[k].limited)
        .sort((a, b) => a - b),
      n = lim.length,
      wait = (((lim.indexOf(+id) - (week % n)) % n) + n) % n;
    sub = `${SLOT_LABEL[c.slot]} · limited · back in the shop in ${wait} week${wait > 1 ? 's' : ''}`;
  } else sub = `${SLOT_LABEL[c.slot] || c.category}`;
  const priceTxt =
    !sellable || (owned && !c.grantItem) ? '' : onSale ? `<s>${c.price}</s> <b class="sale">${price} Gwei</b>` : `${price} Gwei`;
  d.insertAdjacentHTML('beforeend', `<div><strong>${c.n}</strong><span>${sub}${priceTxt ? ' · ' + priceTxt : ''}</span></div>`);
  const btns = document.createElement('div');
  btns.className = 'btns';
  const add = (txt, cls, fn, disabled) => {
    const b = document.createElement('button');
    b.className = 'b' + (cls ? ' ' + cls : '');
    b.textContent = txt;
    b.disabled = !!disabled;
    if (fn) b.onclick = () => fn(b);
    btns.appendChild(b);
    return b;
  };
  if (c.slot && owned) {
    add(worn ? 'Remove' : 'Wear', worn ? '' : 'primary', () => {
      if (PREVIEW) PREVIEW.tryLook = PREVIEW.tryColor = null;
      setLookSlot(c.slot, worn ? null : +id);
      ui();
    });
  } else if (!sellable) add('Not for sale', '', null, true);
  else {
    if (c.slot && !c.grantItem) add(trying ? 'Stop trying' : 'Try', '', () => tryOn(id));
    if (limitedAway) add('Not this week', '', null, true);
    else if ((S.gwei || 0) < price) add(`${price} Gwei`, '', null, true).title = 'Not enough Gwei yet';
    else add(c.grantItem ? 'Buy' : 'Buy', 'primary', b => buyCosmetic({ id, ...c }, b));
  }
  d.appendChild(btns);
  return d;
}
function renderShop(body) {
  if (!SERVER()) {
    body.innerHTML = '<p class="qintro">The shop needs an online game: cosmetics are bought with your server-side Gwei balance.</p>';
    return;
  }
  const featured = shopFeatured(),
    ctx = { featured },
    wrap = document.createElement('div'),
    list = document.createElement('div'),
    side = document.createElement('div');
  wrap.className = 'inv shop';
  side.className = 'side shopside';
  side.appendChild(previewBox());
  const p = PREVIEW;
  if (p && p.tryLook) {
    const tried = Object.entries(p.tryLook)
      .filter(([s, id]) => myLook()[s] !== id)
      .map(([, id]) => COSMETICS[id].n);
    side.insertAdjacentHTML('beforeend', `<p class="note">Trying on: ${tried.join(', ') || 'nothing new'}</p>`);
    const stop = document.createElement('button');
    stop.className = 'b';
    stop.textContent = 'Back to my look';
    stop.onclick = () => {
      p.tryLook = p.tryColor = null;
      renderPanel();
    };
    side.appendChild(stop);
  } else side.insertAdjacentHTML('beforeend', '<p class="note">Press Try on any piece to see it on your character first.</p>');
  list.insertAdjacentHTML(
    'beforeend',
    `<p class="qintro">Cosmetics only: no combat, speed, harvesting or access advantage. You have <b>${S.gwei || 0} Gwei</b>, earned by your validators, mobs and chapters.</p>`,
  );
  const section = (title, note) => {
    list.insertAdjacentHTML('beforeend', `<h3 class="cat">${title}</h3>`);
    if (note) list.insertAdjacentHTML('beforeend', `<p class="note">${note}</p>`);
  };
  // this week: three pieces 25% off and one limited piece, until Monday
  const box = document.createElement('div');
  box.className = 'weekly';
  box.insertAdjacentHTML(
    'beforeend',
    `<h3 class="cat">This week</h3><p class="note">New offers in ${shopCountdown()}: three pieces 25% off, and one limited piece you can only buy this week.</p>`,
  );
  for (const id of featured.limited ? [...featured.sale, featured.limited] : featured.sale) box.appendChild(shopRow(id, ctx));
  list.appendChild(box);
  // the collections, then everything else by slot, then the trophies nobody can buy
  const ids = Object.keys(COSMETICS)
    .map(Number)
    .sort((a, b) => a - b);
  for (const [set, [name, line]] of Object.entries(SETS)) {
    const mine = ids.filter(id => COSMETICS[id].set === set),
      have = mine.filter(id => S.cosmetics.includes(id)).length;
    section(`${name} collection · ${have}/${mine.length}`, line);
    for (const id of mine) list.appendChild(shopRow(id, ctx));
  }
  const loose = ids.filter(id => !COSMETICS[id].set && forSale(COSMETICS[id]));
  for (const slot of [...LOOK_SLOTS, null]) {
    const mine = loose.filter(id => (COSMETICS[id].slot || null) === slot && !COSMETICS[id].grantItem);
    if (!mine.length) continue;
    section(SLOT_LABEL[slot] || 'Other');
    for (const id of mine) list.appendChild(shopRow(id, ctx));
  }
  const packs = loose.filter(id => COSMETICS[id].grantItem);
  if (packs.length) {
    section('Block packs', 'Decorative blocks straight into your chest. Buy them as often as you like.');
    for (const id of packs) list.appendChild(shopRow(id, ctx));
  }
  const trophies = ids.filter(id => !forSale(COSMETICS[id]) && COSMETICS[id].category !== 'title');
  section(
    `Trophies · ${trophies.filter(id => S.cosmetics.includes(id)).length}/${trophies.length}`,
    'Never sold: dropped by tough mobs, rarely, or earned by fighting off the network attack. Worn like the rest once you have them.',
  );
  for (const id of trophies) list.appendChild(shopRow(id, ctx));
  const titles = ids.filter(id => COSMETICS[id].category === 'title');
  section(
    `Titles · ${titles.filter(id => S.cosmetics.includes(id)).length}/${titles.length}`,
    'Never sold: each one is earned by finishing a story chapter (Objectives tab), and the furthest shows under your name.',
  );
  for (const id of titles) list.appendChild(shopRow(id, ctx));
  wrap.appendChild(list);
  wrap.appendChild(side);
  body.appendChild(wrap);
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
// re-rendering the same tab keeps where you had scrolled to (a purchase, a craft, a "Try" in the shop)
let lastPanelTab = null;
function renderPanel() {
  const pb = $('pbody'),
    keep = lastPanelTab === tab ? pb.scrollTop : 0;
  lastPanelTab = tab;
  if (tab !== 'shop' && PREVIEW) PREVIEW.tryLook = PREVIEW.tryColor = null; // try-ons stay in the shop
  renderPanelBody();
  pb.scrollTop = keep;
}
function renderPanelBody() {
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
      if (ITEM[id]?.boots) {
        // the boots: their own slot, beside the plating
        const key = String(id),
          eq = document.createElement('button');
        eq.className = 'b';
        eq.textContent = String(S.boots) === key ? 'Take off' : 'Wear';
        eq.onclick = () => {
          S.boots = String(S.boots) === key ? null : key;
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
      const hasReq = !r.req || S.nfts.some(n => n.id === r.req),
        ok = hasReq && Object.entries(r.need).every(([k, n]) => (S.inv[k] || 0) >= n);
      const d = document.createElement('div');
      d.className = 'rec';
      d.appendChild(cloneIcon(r.out));
      d.insertAdjacentHTML(
        'beforeend',
        `<div><strong>${r.n > 1 ? r.n + ' × ' : ''}${nameOf(r.out)}</strong><span>${r.d}</span><div class="need">${Object.entries(r.need)
          .map(([k, n]) => `<em class="${(S.inv[k] || 0) >= n ? '' : 'ko'}">${n} ${nameOf(+k)} (${S.inv[k] || 0})</em>`)
          .join(
            '',
          )}${r.req ? `<em class="${hasReq ? '' : 'ko'}">owning the ${nameOf(r.req)} (kept)</em>` : ''}</div></div><button class="b ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'}>Craft</button>`,
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
// the main world keeps its hostile mobs on for everyone (see SETTINGS_CHOICES' mobs entry)
const mobsForced = () => Net.enabled && (Net.world || 'principal') === 'principal';
REG.style = STYLE; // 01-textures.js: kept under its own key, read before everything else is drawn
const SETTINGS_CHOICES = [
  {
    k: 'style',
    t: 'Look',
    d: 'Clay: smooth, toy-like blocks. Pixel: the original pixel art. The game reloads to switch.',
    o: [
      ['clay', 'Clay'],
      ['pixel', 'Pixel'],
    ],
  },
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
    k: 'glow',
    t: 'Glow',
    d: 'A soft light around crystals, lanterns and the sky (clay look). Costly on a phone.',
    clay: true,
    o: [
      [false, 'No'],
      [true, 'Yes'],
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
    // in the main world everyone faces the same mobs: turning them off would make the ruins, geodes and
    // genesis rock free to take, and relighting validators pays Gwei and counts on the leaderboard. A
    // private world (?monde=…) has its own Gwei, leaderboard and validators: there, it's the player's call
    // (a peaceful world for a child, say)
    solo: 'Not in the main world: everyone there faces the same mobs. In a private world of your own, it’s your choice.',
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
    k: 'autoQuality',
    t: 'Adjust quality automatically',
    d: 'If the game slows down, lowers sharpness, then shadows, then view distance, to stay smooth and cool.',
    o: [
      [false, 'No'],
      [true, 'Yes'],
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
    if (c.clay && !CLAY) continue;
    const row = document.createElement('div');
    row.className = 'setting';
    const locked = c.solo && mobsForced();
    row.innerHTML = `<div><strong>${c.t}</strong>${locked ? `<span>${c.solo}</span>` : c.d ? `<span>${c.d}</span>` : ''}</div><div class="opts"></div>`;
    for (const [v, lab] of c.o) {
      const b = document.createElement('button');
      b.className = 'b' + ((locked ? v === true : REG[c.k] === v) ? ' primary' : '');
      b.disabled = !!locked;
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
  // the look is baked into the textures at start: switching it reloads the page (the save goes out on pagehide)
  if (k === 'style') {
    REG.style = REG.style || 'clay';
    if (REG.style !== STYLE) {
      try {
        localStorage.setItem('ether-mines:style', REG.style);
      } catch (e) {}
      const u = new URL(location.href);
      u.searchParams.delete('style');
      location.replace(u.href);
    }
    return;
  }
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

// ---------- compass: a strip at the top that scrolls as you turn ----------
// N, E, S, W (and the diagonals) where they are relative to your view, plus the Atrium and your current
// objective's target. North is -z (the great diamond and the City), east is +x (the sea).
const COMPASS = { el: null, marks: [], fov: Math.PI * 0.9, yaw: null, t: 0 };
const COMPASS_DIRS = [
  ['N', 0, 'cardinal'],
  ['NE', Math.PI / 4, ''],
  ['E', Math.PI / 2, 'cardinal'],
  ['SE', (3 * Math.PI) / 4, ''],
  ['S', Math.PI, 'cardinal'],
  ['SW', (-3 * Math.PI) / 4, ''],
  ['W', -Math.PI / 2, 'cardinal'],
  ['NW', -Math.PI / 4, ''],
];
// the objective's place, the same targets the objectives bar points to
function compassTarget() {
  if (S.seen.epilogue && !S.seen.finale) return { x: SPAWN.x + 0.5, z: SPAWN.z + 0.5, label: 'Finale' };
  const q = QUESTS[questIndex()];
  if (!q || q.id === 'relight' || q.id === 'relit3') {
    const r = nearestRuin();
    return r && { x: r.x + 0.5, z: r.z + 0.5, label: 'Ruin' };
  }
  if (q.id === 'plasma') {
    const t = nearestTower();
    return t && { x: t.x + 0.5, z: t.z + 0.5, label: 'Tower' };
  }
  if (q.id === 'mergeVisit' || q.id === 'mergeTwins') {
    const m = nearestMerge();
    return m && { x: m.sx + 0.5, z: m.sz + 0.5, label: 'Sanctum' };
  }
  return null;
}
function updateCompass(dt) {
  if (!COMPASS.el) {
    COMPASS.el = $('compass');
    const strip = COMPASS.el.querySelector('.strip');
    for (const [t, b, c] of COMPASS_DIRS) {
      const m = document.createElement('b');
      m.textContent = t;
      m.className = c;
      strip.appendChild(m);
      COMPASS.marks.push({ el: m, b: () => b });
    }
    const home = document.createElement('b');
    home.className = 'poi home';
    home.textContent = '⌂';
    home.title = 'Atrium';
    strip.appendChild(home);
    COMPASS.marks.push({
      el: home,
      b: () => (Math.hypot(SPAWN.x - P.x, SPAWN.z - P.z) < 6 ? null : Math.atan2(SPAWN.x + 0.5 - P.x, -(SPAWN.z + 0.5 - P.z))),
    });
    // the nearest Mempool, always on the strip once it's within 400 m: the place to meet for a boss fight
    const arena = document.createElement('b');
    arena.className = 'poi arena';
    arena.textContent = '⚔';
    arena.title = 'The Mempool';
    strip.appendChild(arena);
    COMPASS.marks.push({
      el: arena,
      b: () => {
        const a = COMPASS.arena;
        return !a || a.d > 400 || a.d < ARENA_W ? null : Math.atan2(a.x + 0.5 - P.x, -(a.z + 0.5 - P.z));
      },
    });
    const goal = document.createElement('b');
    goal.className = 'poi goal';
    strip.appendChild(goal);
    COMPASS.goal = goal;
    COMPASS.marks.push({ el: goal, b: () => (COMPASS.target ? Math.atan2(COMPASS.target.x - P.x, -(COMPASS.target.z - P.z)) : null) });
  }
  COMPASS.t -= dt;
  if (COMPASS.t <= 0) {
    // the objective's target changes slowly: looked up a few times a second, not every frame
    COMPASS.t = 0.5;
    COMPASS.target = compassTarget();
    COMPASS.arena = nearestArena();
    if (COMPASS.arena) COMPASS.marks.find(m => m.el.classList.contains('arena')).el.textContent = `⚔ ${Math.round(COMPASS.arena.d)} m`;
    COMPASS.goal.textContent = COMPASS.target
      ? `◆ ${COMPASS.target.label} ${Math.round(Math.hypot(COMPASS.target.x - P.x, COMPASS.target.z - P.z))} m`
      : '';
  }
  const w = COMPASS.el.clientWidth,
    k = w / COMPASS.fov,
    heading = -yaw; // bearing you face, clockwise from north
  for (const m of COMPASS.marks) {
    const b = m.b();
    if (b === null || (m.el === COMPASS.goal && !COMPASS.target)) {
      m.el.style.display = 'none';
      continue;
    }
    const rel = Math.atan2(Math.sin(b - heading), Math.cos(b - heading));
    if (Math.abs(rel) > COMPASS.fov / 2) {
      m.el.style.display = 'none';
      continue;
    }
    m.el.style.display = '';
    m.el.style.transform = `translateX(${(w / 2 + rel * k).toFixed(1)}px) translateX(-50%)`;
    m.el.style.opacity = (1 - (Math.abs(rel) / (COMPASS.fov / 2)) ** 3).toFixed(2);
  }
}
