// Mines d'Éther · Actions de jeu et arbitrage par le serveur, parcelles.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- arbitrage par le serveur (en ligne) ----------
// Le jeu montre tout de suite le résultat attendu, le serveur valide ; en cas de refus on revient en arrière.
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
const REFUS = {
  outil: () => `il faut ${target ? TIER_NAME[reqTier(target.id)] : 'un meilleur outil'}`,
  protégé: () => 'zone protégée',
  'coffre vide': () => 'plus rien de cet objet',
  support: () => 'il faut un support',
  'case occupée': () => 'la case est occupée',
  'objet non posable': () => 'le serveur ne connaît pas encore ce bloc (règles à mettre à jour : supabase/regles.sql)',
  'trop vite': () => null,
  'rien à miner': () => null,
  'trop loin': () => 'hors de portée de main',
  'déplacement impossible': () => 'position refusée par le serveur, attends un instant',
  "trop d'actions": () => 'trop rapide, ralentis un peu',
  'il faut se trouver dans la parcelle': () => 'place-toi dans la parcelle à revendiquer',
  'pas assez dans ton sac': () => 'tu n’en as pas assez',
  'malle pleine': () => 'malle pleine (27 sortes d’objets au plus)',
  'pas de malle ici': () => 'cette malle a disparu',
};
// Actions qui envoient la position du joueur : le serveur vérifie la portée et la vraisemblance du déplacement.
const AVEC_POSITION = new Set(['mine', 'place', 'toggle', 'relight', 'claim', 'pos', 'chest', 'chest_move']);
const position = () => ({ ex: +P.x.toFixed(2), ey: +P.y.toFixed(2), ez: +P.z.toFixed(2) });
const noRules = r => r && r.err === 'rien à miner' && r.cell > 0 && B[r.cell] && B[r.cell].h !== Infinity;
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
  logEv('nft', `${nameOf(u.id)} #${u.serial}`, 'frappé, unique');
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
    const r = await Net.act(name, AVEC_POSITION.has(name) ? { ...args, ...position() } : args);
    if (r && r.ok) {
      applyServer(r);
      setInv(r.inv, why);
      return r;
    }
    if (rec) revert(rec);
    if (r && r.inv) setInv(r.inv);
    const m = noRules(r)
      ? 'règles du jeu absentes du serveur : lance supabase/regles.sql'
      : r && REFUS[r.err]
        ? REFUS[r.err]()
        : r && r.err;
    if (m) logEv('burn', 'Refusé', m);
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
    if (window.noterErreur) noterErreur(`serveur ${name} : ${msg}`, e.stack);
    logEv(
      'burn',
      'Le serveur refuse',
      /^figer/i.test(msg)
        ? "la fonction « figer » n'est pas déployée sur Supabase"
        : /act_|function/i.test(msg) && /not find|does not exist|Could not/i.test(msg)
          ? 'schéma SQL à lancer (001_schema.sql)'
          : 'réessaie dans un instant',
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
        date: new Date(u.created_at).toLocaleDateString('fr-FR'),
        where: u.place || '',
        mined: u.mined,
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

// ---------- parcelles ----------
const CLAIMS = new Map();
const sanctuary = (x, z) => x >= 4 && x <= 12 && z >= 4 && z <= 12;
const claimAt = (x, z) => CLAIMS.get(ckey(cOf(Math.floor(x)), cOf(Math.floor(z))));
function canBuildHere(x, z) {
  if (!SERVER()) return true;
  if (sanctuary(x, z)) return false;
  const c = claimAt(x, z);
  return !c || c.owner === ME.id || (c.members || []).includes(ME.id);
}
function protectMsg(x, z) {
  if (sanctuary(x, z)) return 'le sanctuaire est protégé';
  const c = claimAt(x, z);
  return `parcelle de ${c?.owner_name || "quelqu'un"}`;
}
let hintT = 0;
function protectHint(x, z) {
  if (hintT > 0) return;
  hintT = 3;
  logEv('burn', 'Zone protégée', protectMsg(x, z));
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
    addChat('Monde', '#7fe8ff', 'Les parcelles demandent une partie en ligne.');
    return;
  }
  const qx = cOf(Math.floor(P.x)),
    qz = cOf(Math.floor(P.z)),
    say = t => addChat('Monde', '#7fe8ff', t);
  if (c === 'parcelle') {
    const r = await serverAct('claim', { qx, qz }, null, 'parcelle');
    if (r) say(`Parcelle ${qx}, ${qz} revendiquée (2 cristaux). Toi et tes invités seuls pouvez y construire.`);
    return;
  }
  if (c === 'liberer') {
    const r = await serverAct('unclaim', { qx, qz });
    if (r) say(`Parcelle ${qx}, ${qz} libérée.`);
    return;
  }
  if (c === 'inviter' || c === 'exclure') {
    if (!arg) {
      say(`Écris /${c} suivi d'un pseudo.`);
      return;
    }
    const r = await serverAct('member', { pseudo: arg, invite: c === 'inviter' });
    if (r)
      say(c === 'inviter' ? `${r.name} peut construire sur toutes tes parcelles.` : `${r.name} ne peut plus construire sur tes parcelles.`);
    return;
  }
  if (c === 'parcelles') {
    const mine = [...CLAIMS.values()].filter(v => v.owner === ME.id);
    say(
      mine.length
        ? `Tes parcelles : ${mine.map(v => v.cx + ', ' + v.cz).join(' · ')}`
        : "Tu n'as pas encore de parcelle. /parcelle revendique celle où tu te trouves.",
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
        ? 'extrait du minerai'
        : B[id].drop === 103
          ? 'extrait de la géode'
          : B[id].drop === 104
            ? 'arraché à la roche de genèse'
            : `jeton #${B[id].drop ?? id}`,
    ).then(r => {
      if (!r) return;
      if (id === 98) {
        syncInventory();
        fermerMalle(t);
      }
      const g = r.got || {};
      if ([101, 103, 104].includes(g.item) && g.n) Sound.chime();
      if (g.item === 104 && !g.n) logEv('burn', "La roche de genèse s'effrite", 'pas de fragment cette fois');
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
    give(ab.drop || above, 1, 'décroché');
  }
  if (id === 98) {
    for (const [it, n] of Object.entries(S.malles?.[k] || {})) give(+it, n, 'sorti de la malle');
    if (S.malles) delete S.malles[k];
    fermerMalle(t);
  }
  const drop = B[id].drop !== undefined ? B[id].drop : id;
  if (drop === 101) {
    const n = 1 + (hash(t.x * 7 + t.y, t.z, 5) < 0.4 ? 1 : 0);
    give(101, n, 'extrait du minerai');
    Sound.chime();
    if (!S.seen.cry) {
      S.seen.cry = 1;
    }
  } else if (drop === 103) {
    give(103, 1, 'extrait de la géode');
    Sound.chime();
  } else if (drop === 104) {
    if (hash(t.x * 3 + t.y, t.z * 5, 124) < 0.4) {
      give(104, 1, 'arraché à la roche de genèse');
      Sound.chime();
    } else logEv('burn', "La roche de genèse s'effrite", 'pas de fragment cette fois');
  } else if (drop) give(drop, 1, owned ? `bloc #${owned} repris` : `jeton #${drop}`);
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
  if (tb && (tb.shape === 'door' || tb.shape === 'lever') && SERVER() && !canBuildHere(target.x, target.z)) {
    protectHint(target.x, target.z);
    return;
  }
  const accroupi = sneakHeld || keys.has('KeyC') || keys.has('ControlLeft');
  if (target.id === 98 && !accroupi && inWorld(target.x, target.z)) {
    if (SERVER() && !canBuildHere(target.x, target.z)) return protectHint(target.x, target.z);
    ouvrirMalle(target);
    return;
  }
  // accroupi : on pose contre une porte ou un levier au lieu de l'actionner
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
  const refus = m => {
    if (hintT > 0) return;
    hintT = 2;
    logEv('burn', `Impossible de poser ${B[it].n.toLowerCase()}`, m);
    Sound.hit('pierre');
  };
  let id = +it;
  const face = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  if (B[id].shape === 'stairs' || B[id].shape === 'ladder' || B[id].gate) id = id + face;
  const [x, y, z] = target.prev;
  if (y < 0 || y >= SY || !loaded(x, z)) return;
  if (!inWorld(x, z)) return;
  const cur = get(x, y, z);
  if (cur && cur !== 11 && !isCross(cur)) return;
  const sh = B[id].shape;
  if (sh === 'door') {
    const up = get(x, y + 1, z);
    if (y + 1 >= SY || (up && up !== 11 && !isCross(up))) return refus('il faut deux cases libres l’une au-dessus de l’autre');
    id = 48 + face * 4;
    // une porte n'est qu'un panneau sur un côté de la case : on ne refuse que si ce panneau touche le joueur
    const [a, , c, d, , f] = DOORB[B[id].f];
    if (x + d > P.x - PW && x + a < P.x + PW && y + 2 > P.y && y < P.y + PH && z + f > P.z - PW && z + c < P.z + PW)
      return refus('tu es dans le passage : recule d’un pas');
  } else if (isSolid(id) && x + 1 > P.x - PW && x < P.x + PW && y + 1 > P.y && y < P.y + PH && z + 1 > P.z - PW && z < P.z + PW)
    return refus('tu es sur cette case : recule d’un pas');
  if (isCross(id) && ![1, 2].includes(get(x, y - 1, z))) return refus('les plantes se posent sur l’herbe ou la terre');
  if ((sh === 'plate' || sh === 'cable' || sh === 'lever') && !isSolid(get(x, y - 1, z))) return refus('il faut un bloc plein dessous');
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
  });
  swing = 1;
  Sound.place(MAT_OF(id));
  popAt(x, y, z, sh === 'door' ? 2 : 1);
  if (SERVER()) {
    const name = B[id].n;
    serverAct('place', { px: x, py: y, pz: z, it: +it, bid: id }, rec).then(r => {
      if (r) logEv('burn', `1 ${name}`, `→ bloc posé #${r.serial}`);
    });
  } else logEv('burn', `1 ${B[id].n}`, `→ bloc posé #${S.serial}`);
  if (id === 13) {
    addVal(x, y, z);
    if (!S.seen.val) {
      S.seen.val = 1;
      toastInfo('Validateur actif : il frappe un cristal à chaque slot de 12 secondes.');
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
  if (!(S.inv[105] > 0)) {
    logEv('burn', 'Validateur éteint', 'il faut un cœur de validateur : regarde tes objectifs');
    Sound.hit('pierre');
    return;
  }
  if (SERVER()) {
    swing = 1;
    serverAct('relight', { px: t.x, py: t.y, pz: t.z }).then(r => {
      if (!r) return;
      addUnique(r.unique);
      syncInventory();
      logEv('burn', '1 Cœur de validateur', '→ validateur ancien rallumé');
      toastInfo('Validateur ancien rallumé : 3 cristaux par slot, à ton nom.');
      Sound.chime();
      popAt(t.x, t.y, t.z, 1);
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
  logEv('burn', '1 Cœur de validateur', `→ validateur ancien rallumé (${S.relit})`);
  toastInfo('Validateur ancien rallumé : 3 cristaux par slot, à ton nom.');
  Sound.chime();
  popAt(t.x, t.y, t.z, 1);
  swing = 1;
  dirty = true;
  rebuildAt(t.x, t.z);
  ui();
  if (regView) buildRegView();
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

// ---------- malles : coffres posés dans le monde ----------
// En ligne, le contenu est gardé par le serveur (005_coffres.sql) ; en solo, dans la partie (S.malles).
let MALLE = null; // { x, y, z, items }
async function ouvrirMalle(t) {
  const k = coordKey(t.x, t.y, t.z);
  if (SERVER()) {
    const r = await serverAct('chest', { px: t.x, py: t.y, pz: t.z });
    if (!r) return;
    MALLE = { x: t.x, y: t.y, z: t.z, items: r.items || {} };
  } else MALLE = { x: t.x, y: t.y, z: t.z, items: { ...(S.malles?.[k] || {}) } };
  Sound.door();
  openTab('malle');
}
function fermerMalle(t) {
  if (MALLE && MALLE.x === t.x && MALLE.y === t.y && MALLE.z === t.z) {
    MALLE = null;
    if (tab === 'malle' && !$('panel').hidden) togglePanel();
  }
}
// n > 0 : déposer depuis le sac ; n < 0 : reprendre
async function deplacerMalle(it, n) {
  if (!MALLE || !n) return;
  const m = MALLE;
  if (Math.hypot(m.x + 0.5 - P.x, m.z + 0.5 - P.z) > 6) {
    logEv('burn', 'Malle trop loin', 'rapproche-toi');
    return;
  }
  if (SERVER()) {
    const r = await serverAct(
      'chest_move',
      { px: m.x, py: m.y, pz: m.z, item: +it, n },
      null,
      n > 0 ? 'déposé dans la malle' : 'repris de la malle',
    );
    if (!r) return;
    m.items = r.items || {};
  } else {
    const k = coordKey(m.x, m.y, m.z),
      have = m.items[it] || 0;
    if (n > 0) {
      n = Math.min(n, S.inv[it] || 0);
      if (!n) return;
      if (!have && Object.keys(m.items).length >= 27) return logEv('burn', 'Malle pleine', '27 sortes d’objets au plus');
      take(+it, n);
    } else {
      n = -Math.min(-n, have);
      if (!n) return;
      give(+it, -n, 'repris de la malle');
    }
    if (have + n > 0) m.items[it] = have + n;
    else delete m.items[it];
    S.malles = S.malles || {};
    S.malles[k] = { ...m.items };
    dirty = true;
  }
  Sound.click();
  ui();
  if (tab === 'malle' && !$('panel').hidden) renderPanel();
}
