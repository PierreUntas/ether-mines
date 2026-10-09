// Ether Mines · Interface: bar, chest, crafting, ledger, objectives.
// The files in src/game/ load in order and share the same global scope.
'use strict';
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
    t: 'Link a wallet',
    h: 'Below, in this panel: "Link a wallet" mirrors your validators on Sepolia. No funds needed, the game stays playable without it.',
    ok: () => !!S.walletLinked,
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
    h: "Wire an OR gate: one input from a plate, another looped back from its own output, into a lamp. Tap the plate once — it stays lit. A working example stands in the City's workshop.",
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
const NETWORK = { n: 0, top: [], t: 0, seen: -1 },
  TIERS = [3, 10, 25, 50, 100],
  MILESTONE_NAMES = ['a first star', 'two stars', 'three stars', 'four stars', 'the diamond fully awake'];
const networkLevel = () => TIERS.filter(p => NETWORK.n >= p).length;
function networkStatus() {
  const g = TIERS.find(p => p > NETWORK.n);
  return g
    ? `The network has ${NETWORK.n} old validator${NETWORK.n > 1 ? 's' : ''} relit. At ${g}, the great diamond in the sky will awaken a bit more.`
    : 'The network is awake: the great diamond shines with all its light. Thanks to every watcher.';
}
async function updateNetwork() {
  NETWORK.t = 60;
  let n = S.relit || 0,
    top = n ? [{ name: ME.name, n }] : [];
  if (SERVER()) {
    try {
      const r = await Net.act('network', {});
      if (!r || !r.ok) return;
      n = r.n;
      top = r.top || [];
    } catch (e) {
      return;
    }
  }
  const before = networkLevel();
  NETWORK.n = n;
  NETWORK.top = top;
  const niv = networkLevel();
  if (NETWORK.seen >= 0 && niv > before) {
    logEv('nft', `The network awakens: ${n} validators relit`, `the great diamond gains ${MILESTONE_NAMES[niv - 1]}`);
    announce('The network awakens', `${n} old validators relit`);
    Sound.chime();
  }
  NETWORK.seen = niv;
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
// ---------- validators on the chain (Seal + Network, Sepolia) ----------
// Read-only as long as nothing is clicked: no wallet required just to see the onchain state.
const ONCHAIN = { wallet: null, epoch: null, previousReward: 0n, bySeal: new Map(), t: 0, loading: false };
async function updateOnchain() {
  if (!Chain.enabled || !SERVER() || ONCHAIN.loading) return;
  ONCHAIN.t = 20;
  ONCHAIN.loading = true;
  try {
    ONCHAIN.wallet = await Net.loadWallet();
    const epoch = await Chain.currentEpoch();
    ONCHAIN.epoch = epoch;
    const previous = epoch > 0n ? epoch - 1n : null;
    ONCHAIN.previousReward = previous !== null ? await Chain.reward(previous) : 0n;
    for (const n of S.nfts.filter(n => n.id === 203 && n.chainTx && n.tokenId)) {
      const [attestedNow, attestedBefore, alreadyClaimed] = await Promise.all([
        Chain.hasAttested(epoch, n.tokenId),
        previous !== null ? Chain.hasAttested(previous, n.tokenId) : Promise.resolve(false),
        previous !== null ? Chain.hasClaimed(previous, n.tokenId) : Promise.resolve(false),
      ]);
      ONCHAIN.bySeal.set(n.serial, { attestedNow, attestedBefore, alreadyClaimed });
    }
  } catch (e) {
    console.error(e);
  } finally {
    ONCHAIN.loading = false;
    if (tab === 'quest' && !$('panel').hidden) renderPanel();
  }
}
async function linkWallet() {
  try {
    const address = await Chain.connectWallet();
    const n = await Net.walletNonce();
    if (!n || !n.ok) throw new Error((n && n.err) || 'nonce unavailable');
    const signature = await Chain.sign(address, Chain.message(n.nonce));
    await Net.linkWallet(address, signature);
    toastInfo('Wallet linked: ' + Chain.short(address));
    S.walletLinked = 1;
    dirty = true;
    updateOnchain();
  } catch (e) {
    logEv('burn', 'Wallet link refused', e.message || String(e));
  }
}
// A Sepolia transaction easily takes 10 to 30 s to confirm: the button freezes right away (text +
// disabled) so it never looks inert, and a new render (renderPanel/updateOnchain) replaces it
// in every case anyway, so there's no need to re-enable it ourselves on failure.
function freezeBtn(btn, text) {
  btn.disabled = true;
  btn.textContent = text;
}
async function mintSeal(n, btn) {
  freezeBtn(btn, 'Minting on Sepolia…');
  try {
    const r = await Net.chain('mint', { serial: n.serial });
    n.chainTx = r.hash;
    n.tokenId = r.tokenId;
    toastInfo('Seal minted on Sepolia');
    updateOnchain();
  } catch (e) {
    logEv('burn', 'Minting refused', e.message || String(e));
  } finally {
    if (tab === 'quest' && !$('panel').hidden) renderPanel();
  }
}
async function attestSeal(n, btn) {
  freezeBtn(btn, 'Attesting on Sepolia…');
  try {
    await Net.chain('attester', { serial: n.serial });
    toastInfo('Attestation recorded for this epoch');
  } catch (e) {
    logEv('burn', 'Attestation refused', e.message || String(e));
  } finally {
    updateOnchain();
  }
}
async function claimSeal(n, epoch, btn) {
  freezeBtn(btn, 'Claiming on Sepolia…');
  try {
    await Net.chain('reclamer', { serial: n.serial, epoque: Number(epoch) });
    toastInfo('Reward claimed');
  } catch (e) {
    logEv('burn', 'Claim refused', e.message || String(e));
  } finally {
    updateOnchain();
  }
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
    TRADE.msg = /act_offer|function/i.test(e.message || '')
      ? 'trades missing on the server: run supabase/installation.sql'
      : 'the server is not responding';
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
        actOnOffer('offer', { pseudo, give: b.give, want: b.want }, r => {
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
  if (tab === 'quest' && !$('panel').hidden) {
    ONCHAIN.t -= 0.4;
    if (ONCHAIN.t <= 0) majOnchain();
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
  if (Chain.enabled) renderOnchain(body);
}
// ---------- validators on the chain (Sepolia), in the Objectives tab ----------
function renderOnchain(body) {
  const box = document.createElement('div');
  box.className = 'networkBox';
  box.insertAdjacentHTML(
    'beforeend',
    `<h3>Your validators on Sepolia</h3><p>${
      ONCHAIN.wallet
        ? `Wallet linked: <b>${Chain.short(ONCHAIN.wallet)}</b>. The chain is only a mirror: nothing here changes your save.`
        : 'No wallet linked: link one to be able to mint, attest, and claim. The game stays playable without it.'
    }</p>`,
  );
  if (!ONCHAIN.wallet) {
    const b = document.createElement('button');
    b.className = 'b primary';
    b.textContent = 'Link a wallet';
    b.onclick = linkWallet;
    box.appendChild(b);
  }
  const seals = S.nfts.filter(n => n.id === 203);
  if (!seals.length) {
    box.insertAdjacentHTML('beforeend', '<p class="qintro">Relight an old validator to get your first seal.</p>');
  } else if (ONCHAIN.epoch === null) {
    box.insertAdjacentHTML('beforeend', '<p class="qintro">Loading onchain state…</p>');
  } else {
    const epoch = ONCHAIN.epoch;
    const previous = epoch > 0n ? epoch - 1n : null;
    for (const n of seals) {
      const state = ONCHAIN.bySeal.get(n.serial) || {};
      const row = document.createElement('div');
      row.className = 'sealChain';
      let html = `<b>${n.where}</b>`;
      if (!n.chainTx) {
        html += '<span class="muted-pill">not minted onchain yet</span>';
      } else {
        html += `<a href="${Chain.etherscanTx(n.chainTx)}" target="_blank" rel="noopener">view on Etherscan</a>`;
        html += `<span>Epoch ${epoch}: ${state.attestedNow ? 'attested' : 'not attested yet'}</span>`;
        if (previous !== null) {
          html += `<span>Epoch ${previous}: ${
            state.alreadyClaimed
              ? 'reward already claimed'
              : state.attestedBefore
                ? `${Chain.eth(ONCHAIN.previousReward)} to claim`
                : 'not attested that epoch, nothing to claim'
          }</span>`;
        }
      }
      row.innerHTML = html;
      const br = document.createElement('div');
      br.className = 'btnrow';
      if (!n.chainTx) {
        if (ONCHAIN.wallet) {
          const b = document.createElement('button');
          b.className = 'b primary';
          b.textContent = 'Mint this seal';
          b.onclick = () => mintSeal(n, b);
          br.appendChild(b);
        }
      } else if (!state.attestedNow) {
        const b = document.createElement('button');
        b.className = 'b';
        b.textContent = 'Attest this epoch';
        b.onclick = () => attestSeal(n, b);
        br.appendChild(b);
      } else if (previous !== null && state.attestedBefore && !state.alreadyClaimed) {
        const b = document.createElement('button');
        b.className = 'b primary';
        b.textContent = 'Claim';
        b.onclick = () => claimSeal(n, previous, b);
        br.appendChild(b);
      }
      if (br.children.length) row.appendChild(br);
      box.appendChild(row);
    }
  }
  body.appendChild(box);
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
        `<div><h3>${nameOf(id)}${a.nft ? ` #${a.nft.serial}` : ''}</h3><span class="std">${a.nft ? 'ERC-721 · unique' : 'ERC-1155 · fongible'}</span></div>`,
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
      '<p class="note">Local simulation: nothing is recorded on a real blockchain. This is a mock-up of what tokenized blocks would give.</p>',
    );
  } else if (tab === 'chest') renderChest(body);
  else if (tab === 'quest') renderQuests(body);
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
