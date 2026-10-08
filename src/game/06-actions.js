// Ether Mines · Game actions and server arbitration, claims.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- server arbitration (online) ----------
// The game shows the expected result right away, the server validates it; on refusal, it rolls back.
let REC = null;
const SERVER = () => Net.online && !!Net.userId;
function record(fn) {
  REC = [];
  try {
    fn();
  } catch (e) {
    REC = null;
    throw e;
  }
  const r = REC;
  REC = null;
  return r;
}
function revert(rec) {
  for (const [k, id, own] of rec.slice().reverse()) {
    const [x, y, z] = k.split(',').map(Number);
    setW(x, y, z, id);
    editSet(x, y, z, id);
    if (own) OWN.set(k, own);
    else OWN.delete(k);
    if (id === 13 || id === 74) addVal(x, y, z);
    else delVal(k);
    rebuildAt(x, z);
  }
  if (regView) buildRegView();
}
const REFUSAL = {
  'tool too weak': () => `you need ${target ? TIER_NAME[reqTier(target.id)] : 'a better tool'}`,
  protected: () => 'protected area',
  'empty inventory': () => 'none of that item left',
  'needs support': () => 'you need something solid underneath',
  'space occupied': () => 'that spot is occupied',
  'item not placeable': () => "the server doesn't know this block yet (rules need updating: supabase/rules.sql)",
  'too fast': () => null,
  'nothing to mine': () => null,
  'too far': () => 'out of reach',
  'impossible move': () => 'position rejected by the server, wait a moment',
  'too many actions': () => 'too fast, slow down a bit',
  'must be inside the claim': () => 'stand inside the plot you want to claim',
  'this place belongs to everyone': () => 'no plots inside the Atrium or the City',
  'the sanctuary belongs to everyone': () => 'no plots inside the Atrium or the City',
  'not enough in your bag': () => "you don't have enough of that",
  'chest full': () => 'chest full (27 kinds of item at most)',
  'no chest here': () => 'that chest is gone',
};
// Actions that send the player's position: the server checks reach and the plausibility of the move.
const WITH_POSITION = new Set(['mine', 'place', 'toggle', 'relight', 'claim', 'pos', 'chest', 'chest_move', 'loot_mob']);
const position = () => ({ ex: +P.x.toFixed(2), ey: +P.y.toFixed(2), ez: +P.z.toFixed(2) });
const noRules = r => r && r.err === 'nothing to mine' && r.cell > 0 && B[r.cell] && B[r.cell].h !== Infinity;
function setInv(inv, why) {
  if (!inv) return;
  for (const [k, n] of Object.entries(inv)) {
    const old = S.inv[k] || 0;
    if (n > 0) S.inv[k] = n;
    else {
      delete S.inv[k];
      if (!ITEM[k]?.nft) {
        const b = S.bar.indexOf(String(k));
        if (b >= 0) S.bar[b] = null;
      }
    }
    if (n > old) {
      S.got[k] = 1;
      S.supply[k] = (S.supply[k] || 0) + n - old;
      S.totalMint += n - old;
      if (!S.bar.includes(String(k))) {
        const e = S.bar.indexOf(null);
        if (e >= 0) S.bar[e] = String(k);
      }
      if (why) logEv('mint', `${n - old} ${nameOf(+k)}`, why);
    }
  }
  dirty = true;
  ui();
}
function addUnique(u) {
  if (!u || S.nfts.some(n => n.serial === u.serial)) return;
  S.nfts.push({ serial: u.serial, id: u.id, date: u.date, where: u.place || '', mined: u.mined || 0 });
  S.got[u.id] = 1;
  logEv('nft', `${nameOf(u.id)} #${u.serial}`, 'minted, unique');
  if (u.id !== 203) {
    const e = S.bar.indexOf(null);
    S.bar[e >= 0 ? e : S.sel] = 'nft' + u.serial;
  }
  dirty = true;
  ui();
}
function applyServer(r) {
  for (const c of r.changes || []) applyBlock(c);
}
async function serverAct(name, args, rec, why) {
  try {
    const r = await Net.act(name, WITH_POSITION.has(name) ? { ...args, ...position() } : args);
    if (r && r.ok) {
      applyServer(r);
      setInv(r.inv, why);
      return r;
    }
    if (rec) revert(rec);
    if (r && r.inv) setInv(r.inv);
    const m = noRules(r) ? 'game rules missing on the server: run supabase/rules.sql' : r && REFUSAL[r.err] ? REFUSAL[r.err]() : r && r.err;
    if (m) logEv('burn', 'Refused', m);
    if (r && r.cell !== undefined && args.px !== undefined) {
      applyBlock({
        x: args.px,
        y: args.py,
        z: args.pz,
        id: r.cell,
        by: OWN.get(coordKey(args.px, args.py, args.pz))?.by,
        name: OWN.get(coordKey(args.px, args.py, args.pz))?.name,
        serial: OWN.get(coordKey(args.px, args.py, args.pz))?.serial,
      });
    }
    if (rec) syncInventory();
    return null;
  } catch (e) {
    console.error(e);
    if (rec) revert(rec);
    const msg = e.message || '';
    if (window.logError) logError(`server ${name}: ${msg}`, e.stack);
    logEv(
      'burn',
      'Server refused',
      /^freeze/i.test(msg)
        ? 'the "freeze" function isn\'t deployed on Supabase'
        : /act_|function/i.test(msg) && /not find|does not exist|Could not/i.test(msg)
          ? 'SQL schema needs to be run (001_schema.sql)'
          : 'try again in a moment',
    );
    syncInventory();
    return null;
  }
}
let syncing = null;
function syncInventory() {
  if (!SERVER()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = Net.loadInventory()
    .then(({ inv, uniques }) => {
      S.inv = {};
      for (const r of inv) if (r.n > 0) S.inv[r.item] = r.n;
      S.nfts = uniques.map(u => ({
        serial: u.serial,
        id: u.item,
        date: new Date(u.created_at).toLocaleDateString('en-US'),
        where: u.place || '',
        mined: u.mined,
        // structured coordinates and onchain state of the seal (012/013; item 203 only)
        vx: u.vx,
        vy: u.vy,
        vz: u.vz,
        chainTx: u.chain_tx,
        tokenId: u.token_id,
      }));
      for (const k of Object.keys(S.inv)) S.got[k] = 1;
      for (const n of S.nfts) S.got[n.id] = 1;
      const seals = S.nfts.filter(n => n.id === 203);
      S.relit = seals.length;
      S.relitAt = {};
      for (const n of seals) {
        const [x, y, z] = n.where.split(',').map(v => parseInt(v));
        S.relitAt[coordKey(x, y, z)] = 1;
      }
      for (let i = 0; i < 9; i++) {
        const b = S.bar[i];
        if (b && (String(b).startsWith('nft') ? !nftOf(b) : !(S.inv[b] > 0))) S.bar[i] = null;
      }
      dirty = true;
      ui();
    })
    .catch(e => console.error(e))
    .finally(() => (syncing = null));
  return syncing;
}

// ---------- claims ----------
const CLAIMS = new Map();
// protected public zones (same measurements as 006_public_zones.sql): the Atrium and the City
const sanctuary = (x, z) =>
  Math.hypot(Math.floor(x) - SPAWN.x, Math.floor(z) - SPAWN.z) <= 7.9 ||
  Math.hypot(Math.floor(x) - CITY.x, Math.floor(z) - CITY.z) <= CITY.R + 0.5;
const claimAt = (x, z) => CLAIMS.get(ckey(cOf(Math.floor(x)), cOf(Math.floor(z))));
function canBuildHere(x, z) {
  if (!SERVER()) return true;
  if (sanctuary(x, z)) return false;
  const c = claimAt(x, z);
  return !c || c.owner === ME.id || (c.members || []).includes(ME.id);
}
// opening/closing a door or lever is reversible, so it's allowed in public zones (the Atrium, the City)
// unlike mining/placing/claiming; still respects other players' claims
function canToggleHere(x, z) {
  if (!SERVER()) return true;
  const c = claimAt(x, z);
  return !c || c.owner === ME.id || (c.members || []).includes(ME.id);
}
function protectMsg(x, z) {
  if (sanctuary(x, z)) return inCity(x, z, 1) ? 'the City belongs to everyone' : 'the Atrium belongs to everyone';
  const c = claimAt(x, z);
  return `${c?.owner_name || 'someone'}'s plot`;
}
let hintT = 0;
function protectHint(x, z) {
  if (hintT > 0) return;
  hintT = 3;
  logEv('burn', 'Protected area', protectMsg(x, z));
}
const claimMat = [
  new THREE.LineBasicMaterial({ color: 0x9fe3c4, transparent: true, opacity: 0.75 }),
  new THREE.LineBasicMaterial({ color: 0xff9ab8, transparent: true, opacity: 0.75 }),
];
let claimLines = [],
  claimKey = '';
function buildClaimLines(force) {
  const pcx = cOf(Math.floor(P.x)),
    pcz = cOf(Math.floor(P.z)),
    key = pcx + ',' + pcz + ':' + CLAIMS.size;
  if (!force && key === claimKey) return;
  claimKey = key;
  for (const l of claimLines) {
    scene.remove(l);
    l.geometry.dispose();
  }
  claimLines = [];
  const pos = [[], []];
  for (const c of CLAIMS.values()) {
    if (Math.abs(c.cx - pcx) > 5 || Math.abs(c.cz - pcz) > 5) continue;
    const mine = c.owner === ME.id || (c.members || []).includes(ME.id) ? 0 : 1,
      x0 = c.cx * CH,
      z0 = c.cz * CH;
    for (const [x, z] of [
      [x0, z0],
      [x0 + CH, z0],
      [x0, z0 + CH],
      [x0 + CH, z0 + CH],
    ])
      pos[mine].push(x, 0, z, x, SY + 4, z);
    const y = Math.max(heightAt(x0 + 8, z0 + 8) + 1.05, SEA + 1.05);
    for (const [a, b, c2, d] of [
      [x0, z0, x0 + CH, z0],
      [x0 + CH, z0, x0 + CH, z0 + CH],
      [x0 + CH, z0 + CH, x0, z0 + CH],
      [x0, z0 + CH, x0, z0],
    ])
      pos[mine].push(a, y, b, c2, y, d);
  }
  for (let m = 0; m < 2; m++)
    if (pos[m].length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos[m], 3));
      const l = new THREE.LineSegments(g, claimMat[m]);
      scene.add(l);
      claimLines.push(l);
    }
}
Net.on('claim', (ev, n, o) => {
  if (ev === 'DELETE') {
    if (o) CLAIMS.delete(ckey(o.cx, o.cz));
  } else if (n) CLAIMS.set(ckey(n.cx, n.cz), n);
  buildClaimLines(true);
  updatePosHud();
});
async function claimCmd(c, arg) {
  if (!SERVER()) {
    addChat('World', '#7fe8ff', 'Claims need an online game.');
    return;
  }
  const qx = cOf(Math.floor(P.x)),
    qz = cOf(Math.floor(P.z)),
    say = t => addChat('World', '#7fe8ff', t);
  if (c === 'claim') {
    const r = await serverAct('claim', { qx, qz }, null, 'claim');
    if (r) say(`Plot ${qx}, ${qz} claimed (2 crystals). Only you and your invites can build there.`);
    return;
  }
  if (c === 'unclaim') {
    const r = await serverAct('unclaim', { qx, qz });
    if (r) say(`Plot ${qx}, ${qz} released.`);
    return;
  }
  if (c === 'invite' || c === 'kick') {
    if (!arg) {
      say(`Type /${c} followed by a nickname.`);
      return;
    }
    const r = await serverAct('member', { pseudo: arg, invite: c === 'invite' });
    if (r) say(c === 'invite' ? `${r.name} can now build on all your plots.` : `${r.name} can no longer build on your plots.`);
    return;
  }
  if (c === 'claims') {
    const mine = [...CLAIMS.values()].filter(v => v.owner === ME.id);
    say(
      mine.length
        ? `Your plots: ${mine.map(v => v.cx + ', ' + v.cz).join(' · ')}`
        : "You don't have a plot yet. /claim takes the one you're standing in.",
    );
  }
}

function breakBlock(t) {
  const id = get(t.x, t.y, t.z);
  if (!id || id === 12 || !inWorld(t.x, t.z)) return;
  const k = coordKey(t.x, t.y, t.z);
  if (SERVER()) {
    if (!canBuildHere(t.x, t.z)) {
      protectHint(t.x, t.z);
      return;
    }
    const rec = record(() => {
      commit(k, 0, null);
      if (B[id].shape === 'door') {
        const oy = B[id].top ? t.y - 1 : t.y + 1;
        if (B[get(t.x, oy, t.z)]?.shape === 'door') commit(coordKey(t.x, oy, t.z), 0, null);
      }
      const above = get(t.x, t.y + 1, t.z),
        ab = B[above];
      if (isCross(above) || (ab && (ab.shape === 'plate' || ab.shape === 'cable' || ab.shape === 'lever')))
        commit(coordKey(t.x, t.y + 1, t.z), 0, null);
    });
    burst(t.x, t.y, t.z, id);
    Sound.brk(MAT_OF(id));
    if (id === 13) delVal(k);
    rebuildAt(t.x, t.z);
    if (regView) buildRegView();
    const held = S.bar[S.sel] || null;
    serverAct(
      'mine',
      { px: t.x, py: t.y, pz: t.z, held },
      rec,
      B[id].drop === 101
        ? 'mined from ore'
        : B[id].drop === 103
          ? 'extracted from the geode'
          : B[id].drop === 104
            ? 'wrested from the genesis rock'
            : `token #${B[id].drop ?? id}`,
    ).then(r => {
      if (!r) return;
      if (id === 98) {
        syncInventory();
        closeChest(t);
      }
      const g = r.got || {};
      if ([101, 103, 104].includes(g.item) && g.n) Sound.chime();
      if (g.item === 104 && !g.n) logEv('burn', 'The genesis rock crumbles', 'no fragment this time');
      const u = held && nftOf(held);
      if (u) u.mined = (u.mined || 0) + 1;
    });
    return;
  }
  const owned = OWN.get(k)?.serial;
  commit(k, 0, null);
  burst(t.x, t.y, t.z, id);
  Sound.brk(MAT_OF(id));
  if (B[id].shape === 'door') {
    const oy = B[id].top ? t.y - 1 : t.y + 1;
    if (B[get(t.x, oy, t.z)]?.shape === 'door') commit(coordKey(t.x, oy, t.z), 0, null);
  }
  const above = get(t.x, t.y + 1, t.z),
    ab = B[above];
  if (isCross(above)) {
    commit(coordKey(t.x, t.y + 1, t.z), 0, null);
  } else if (ab && (ab.shape === 'plate' || ab.shape === 'cable' || ab.shape === 'lever')) {
    commit(coordKey(t.x, t.y + 1, t.z), 0, null);
    give(ab.drop || above, 1, 'knocked off');
  }
  if (id === 98) {
    for (const [it, n] of Object.entries(S.chests?.[k] || {})) give(+it, n, 'taken out of the chest');
    if (S.chests) delete S.chests[k];
    closeChest(t);
  }
  const drop = B[id].drop !== undefined ? B[id].drop : id;
  if (drop === 101) {
    const n = 1 + (hash(t.x * 7 + t.y, t.z, 5) < 0.4 ? 1 : 0);
    give(101, n, 'mined from ore');
    Sound.chime();
    if (!S.seen.cry) {
      S.seen.cry = 1;
    }
  } else if (drop === 103) {
    give(103, 1, 'extracted from the geode');
    Sound.chime();
  } else if (drop === 104) {
    if (hash(t.x * 3 + t.y, t.z * 5, 124) < 0.4) {
      give(104, 1, 'wrested from the genesis rock');
      Sound.chime();
    } else logEv('burn', 'The genesis rock crumbles', 'no fragment this time');
  } else if (drop) give(drop, 1, owned ? `block #${owned} picked back up` : `token #${drop}`);
  if (id === 13) delVal(k);
  for (const nft of S.nfts) if (S.bar[S.sel] === 'nft' + nft.serial) nft.mined = (nft.mined || 0) + 1;
  dirty = true;
  rebuildAt(t.x, t.z);
  if (regView) buildRegView();
}
function place() {
  if (playing) {
    const an = pickAnimal(aim, target);
    if (an) {
      petAnimal(an);
      swing = 0.6;
      return;
    }
  }
  if (!playing || !target) return;
  const tb = B[target.id],
    tk = coordKey(target.x, target.y, target.z);
  if (target.id === 73) {
    relight(target);
    return;
  }
  if (tb && (tb.shape === 'door' || tb.shape === 'lever') && SERVER() && !canToggleHere(target.x, target.z)) {
    protectHint(target.x, target.z);
    return;
  }
  const accroupi = sneakHeld || keys.has('KeyC') || keys.has('ControlLeft');
  if (target.id === 98 && !accroupi && inWorld(target.x, target.z)) {
    if (SERVER() && !canBuildHere(target.x, target.z)) return protectHint(target.x, target.z);
    openChest(target);
    return;
  }
  const isBed = tb && (tb.shape || '').startsWith('bed');
  if ((target.id === 135 || isBed) && !accroupi && inWorld(target.x, target.z)) {
    if (target.id === 135) eat();
    else sleep();
    return;
  }
  // crouching: place against a door or lever instead of activating it
  if (tb && tb.shape === 'door' && !accroupi && inWorld(target.x, target.z)) {
    const t = target,
      rec = record(() => toggleDoor(t));
    if (SERVER()) serverAct('toggle', { px: t.x, py: t.y, pz: t.z }, rec);
    return;
  }
  if (tb && tb.shape === 'lever' && !accroupi && inWorld(target.x, target.z)) {
    const t = target,
      rec = record(() => commit(tk, tb.on ? 64 : 65, OWN.get(tk) || null));
    Sound.click();
    swing = 0.6;
    rebuildAt(t.x, t.z);
    if (SERVER()) serverAct('toggle', { px: t.x, py: t.y, pz: t.z }, rec);
    return;
  }
  if (!target.prev) return;
  const it = S.bar[S.sel];
  if (!it || !B[it] || !(S.inv[it] > 0)) return;
  const refuse = m => {
    if (hintT > 0) return;
    hintT = 2;
    logEv('burn', `Can't place ${B[it].n.toLowerCase()}`, m);
    Sound.hit('stone');
  };
  let id = +it;
  const face = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  if (B[id].shape === 'stairs' || B[id].shape === 'ladder' || B[id].shape === 'bed0f' || B[id].gate) id = id + face;
  const [x, y, z] = target.prev;
  if (y < 0 || y >= SY || !loaded(x, z)) return;
  if (!inWorld(x, z)) return;
  const cur = get(x, y, z);
  if (cur && cur !== 11 && !isCross(cur)) return;
  const sh = B[id].shape;
  let hx, hz;
  if (sh === 'door') {
    const up = get(x, y + 1, z);
    if (y + 1 >= SY || (up && up !== 11 && !isCross(up))) return refuse('you need two free spaces, one above the other');
    id = 48 + face * 4;
    // a door is just a panel on one side of the cell: only refuse if that panel touches the player
    const [a, , c, d, , f] = DOORB[B[id].f];
    if (x + d > P.x - PW && x + a < P.x + PW && y + 2 > P.y && y < P.y + PH && z + f > P.z - PW && z + c < P.z + PW)
      return refuse('you are in the doorway: step back');
  } else if (sh && sh.startsWith('bed')) {
    // the foot was already shifted to the right facing variant above; the head is one cell further that way
    const DIR = [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ];
    [hx, hz] = [x + DIR[face][0], z + DIR[face][1]];
    const hc = get(hx, y, hz);
    if (!inWorld(hx, hz) || (hc && hc !== 11 && !isCross(hc))) return refuse('the bed needs room to stretch out');
  } else if (isSolid(id) && x + 1 > P.x - PW && x < P.x + PW && y + 1 > P.y && y < P.y + PH && z + 1 > P.z - PW && z < P.z + PW)
    return refuse('you are standing on that spot: step back');
  if (isCross(id) && ![1, 2].includes(get(x, y - 1, z))) return refuse('plants are placed on grass or dirt');
  if ((sh === 'plate' || sh === 'cable' || sh === 'lever') && !isSolid(get(x, y - 1, z)))
    return refuse('you need a solid block underneath');
  if (SERVER() && !canBuildHere(x, z)) {
    protectHint(x, z);
    return;
  }
  const k = coordKey(x, y, z);
  take(it, 1);
  if (!SERVER()) S.serial++;
  const own = { by: ME.id, name: ME.name, serial: SERVER() ? 0 : S.serial };
  const rec = record(() => {
    commit(k, id, own);
    if (sh === 'door') commit(coordKey(x, y + 1, z), id + 1, own);
    else if (sh && sh.startsWith('bed')) commit(coordKey(hx, y, hz), id + 4, own);
  });
  swing = 1;
  Sound.place(MAT_OF(id));
  popAt(x, y, z, sh === 'door' || (sh && sh.startsWith('bed')) ? 2 : 1);
  if (SERVER()) {
    const name = B[id].n;
    serverAct('place', { px: x, py: y, pz: z, it: +it, bid: id }, rec).then(r => {
      if (r) logEv('burn', `1 ${name}`, `→ block placed #${r.serial}`);
    });
  } else logEv('burn', `1 ${B[id].n}`, `→ block placed #${S.serial}`);
  if (id === 13) {
    addVal(x, y, z);
    if (!S.seen.val) {
      S.seen.val = 1;
      toastInfo('Active validator: it mints a crystal every 5 minutes (5 placed validators count at most).');
    }
  }
  dirty = true;
  rebuildAt(x, z);
  ui();
  if (regView) buildRegView();
}
function toastInfo(t) {
  logEv('nft', t, '');
}
function relight(t) {
  // the ruin's fourth broken column (its +x, +z corner) must be rebuilt before the validator can wake up
  if (![0, 1, 2].every(i => isSolid(get(t.x + 2, t.y + i, t.z + 2)))) {
    logEv('burn', 'Dark validator', 'rebuild the fourth column first');
    Sound.hit('stone');
    return;
  }
  if (!(S.inv[105] > 0)) {
    logEv('burn', 'Dark validator', 'you need a validator heart: check your objectives');
    Sound.hit('stone');
    return;
  }
  if (SERVER()) {
    swing = 1;
    serverAct('relight', { px: t.x, py: t.y, pz: t.z }).then(r => {
      if (!r) return;
      addUnique(r.unique);
      syncInventory();
      logEv('burn', '1 Validator heart', '→ old validator relit');
      toastInfo('Old validator relit: one crystal a minute, under your name.');
      Sound.chime();
      popAt(t.x, t.y, t.z, 1);
      updateNetwork();
    });
    return;
  }
  take(105, 1);
  S.serial++;
  const k = coordKey(t.x, t.y, t.z),
    own = { by: ME.id, name: ME.name, serial: S.serial };
  commit(k, 74, own);
  addVal(t.x, t.y, t.z);
  S.relit = (S.relit || 0) + 1;
  S.relitAt = S.relitAt || {};
  S.relitAt[k] = 1;
  mintNft(203, `${t.x}, ${t.y}, ${t.z}`);
  logEv('burn', '1 Validator heart', `→ old validator relit (${S.relit})`);
  toastInfo('Old validator relit: one crystal a minute, under your name.');
  Sound.chime();
  updateNetwork();
  popAt(t.x, t.y, t.z, 1);
  swing = 1;
  dirty = true;
  rebuildAt(t.x, t.z);
  ui();
  if (regView) buildRegView();
}
// ---------- table and bed: eating and sleeping (simulated client-side, no actual value) ----------
function eat() {
  if (S.repas === S.dayN) {
    logEv('burn', 'Not hungry yet', 'one meal a day is enough');
    return;
  }
  S.repas = S.dayN;
  buffT = 90;
  dirty = true;
  swing = 0.6;
  Sound.chime();
  toastInfo('A good meal: you move faster for 90 seconds.');
}
function sleep() {
  const h = S.day % 1;
  if (h > 0.25 && h < 0.78) {
    logEv('burn', 'Too bright to sleep', 'wait for nightfall');
    return;
  }
  if (h >= 0.78) S.dayN++;
  S.day = 0.27;
  dirty = true;
  swing = 0.6;
  Sound.door();
  toastInfo('A good night of sleep: the day breaks.');
}
function toggleDoor(t) {
  const b = B[t.id],
    by = b.top ? t.y - 1 : t.y,
    bot = get(t.x, by, t.z);
  if (B[bot]?.shape !== 'door') return;
  const nb = B[bot],
    open = nb.open ? 0 : 1,
    nid = 48 + nb.f * 4 + open * 2;
  const kb = coordKey(t.x, by, t.z),
    kt = coordKey(t.x, by + 1, t.z);
  commit(kb, nid, OWN.get(kb) || null);
  if (B[get(t.x, by + 1, t.z)]?.shape === 'door') commit(kt, nid + 1, OWN.get(kt) || null);
  Sound.door();
  swing = 0.6;
  rebuildAt(t.x, t.z);
}

// ---------- chests placed in the world ----------
// Online, the content is kept by the server (004_chests.sql); solo, in the save (S.chests).
let CHEST = null; // { x, y, z, items }
async function openChest(t) {
  const k = coordKey(t.x, t.y, t.z);
  if (SERVER()) {
    const r = await serverAct('chest', { px: t.x, py: t.y, pz: t.z });
    if (!r) return;
    CHEST = { x: t.x, y: t.y, z: t.z, items: r.items || {} };
  } else CHEST = { x: t.x, y: t.y, z: t.z, items: { ...(S.chests?.[k] || {}) } };
  Sound.door();
  openTab('chest');
}
function closeChest(t) {
  if (CHEST && CHEST.x === t.x && CHEST.y === t.y && CHEST.z === t.z) {
    CHEST = null;
    if (tab === 'chest' && !$('panel').hidden) togglePanel();
  }
}
// n > 0: deposit from the bag; n < 0: take back
async function moveChest(it, n) {
  if (!CHEST || !n) return;
  const m = CHEST;
  if (Math.hypot(m.x + 0.5 - P.x, m.z + 0.5 - P.z) > 6) {
    logEv('burn', 'Chest too far', 'get closer');
    return;
  }
  if (SERVER()) {
    const r = await serverAct('chest_move', { px: m.x, py: m.y, pz: m.z, item: +it, n }, null, n > 0 ? 'put in chest' : 'taken from chest');
    if (!r) return;
    m.items = r.items || {};
  } else {
    const k = coordKey(m.x, m.y, m.z),
      have = m.items[it] || 0;
    if (n > 0) {
      n = Math.min(n, S.inv[it] || 0);
      if (!n) return;
      if (!have && Object.keys(m.items).length >= 27) return logEv('burn', 'Chest full', '27 kinds of item at most');
      take(+it, n);
    } else {
      n = -Math.min(-n, have);
      if (!n) return;
      give(+it, -n, 'taken from chest');
    }
    if (have + n > 0) m.items[it] = have + n;
    else delete m.items[it];
    S.chests = S.chests || {};
    S.chests[k] = { ...m.items };
    dirty = true;
  }
  Sound.click();
  ui();
  if (tab === 'chest' && !$('panel').hidden) renderPanel();
}
