// Mines d'Éther · Interface : barre, coffre, atelier, registre, objectifs.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- vue registre (blocs possédés) ----------
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

// ---------- barre et panneau ----------
function select(i) {
  S.sel = i;
  ui();
  const it = S.bar[i];
  const n = $('selname');
  n.textContent = it ? nameOf(itemId(it)) : 'Main nue';
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
    m.setAttribute('aria-label', 'Coffre');
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
  if (!$('panel').hidden) renderPanel();
}
let tab = 'inv',
  selItem = null;
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
// ---------- objectifs : la progression ----------
const hasNft = id => S.nfts.some(n => (n.id || 201) === id);
const QUESTS = [
  { t: 'Récolte du bois', h: "Mine un tronc d'arbre, à la main.", ok: () => S.got[5] },
  { t: 'Fabrique une pioche en bois', h: 'Atelier (E) : 3 planches. Une bûche donne 4 planches.', ok: () => S.got[102] },
  { t: "Extrais un cristal d'éther", h: 'Le minerai bleu dans la roche. La pierre se taille avec une pioche.', ok: () => S.got[101] },
  { t: 'Forge la pioche de cristal', h: '2 planches + 3 cristaux. Objet unique, minage ×5.', ok: () => hasNft(201) },
  {
    t: 'Ouvre une géode',
    h: `Sous la couche ${DEEP}, dans les grandes grottes. Seule la pioche de cristal les ouvre.`,
    ok: () => S.got[103],
  },
  { t: "Forge la pioche d'éther pur", h: '4 éclats purs + 4 cristaux + 2 planches.', ok: () => hasNft(202) },
  {
    t: 'Atteins la roche de genèse',
    h: "Tout au fond du monde, juste au-dessus du socle. Elle ne cède qu'à la pioche d'éther pur.",
    ok: () => S.got[104],
  },
  { t: 'Fabrique un cœur de validateur', h: '1 fragment de genèse + 2 éclats purs + 4 cristaux.', ok: () => S.got[105] },
  {
    t: 'Rallume un validateur ancien',
    h: "Suis la boussole jusqu'aux ruines, puis clic droit (ou toucher) sur le validateur éteint.",
    ok: () => (S.relit || 0) >= 1,
  },
];
const RELIT_GOALS = [3, 7, 12, 20, 30, 50, 75, 100];
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
  const i = questIndex();
  if (S.qi === undefined) S.qi = i;
  while (S.qi < i) {
    const q = QUESTS[S.qi];
    S.qi++;
    logEv(
      'nft',
      `Objectif atteint : ${q.t}`,
      S.qi < QUESTS.length ? `suivant : ${QUESTS[S.qi].t}` : "la suite : rallumer d'autres validateurs",
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
    html = `<b>${S.relit}/${goal}</b> Validateurs rallumés`;
  }
  if (i >= QUESTS.length - 2) {
    const r = nearestRuin();
    if (r) html += `<span class="compass">${arrowTo(r.x + 0.5, r.z + 0.5)} ruine à ${Math.round(r.d)} m</span>`;
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
    `<p class="qintro">Les anciens validateurs de ce monde se sont éteints. Deviens assez fort pour descendre jusqu'à la roche de genèse, forge un cœur de validateur et rallume-les, un par un.</p>`,
  );
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
      `<p class="qintro">${r ? `Ruine la plus proche : ${Math.round(r.d)} m, direction ${arrowTo(r.x + 0.5, r.z + 0.5)} (x ${r.x}, z ${r.z}).` : 'Aucune ruine éteinte dans les environs.'} Chaque validateur rallumé te rapporte un cristal par minute et un sceau unique.</p>`,
    );
  }
  body.insertAdjacentHTML(
    'beforeend',
    `<div class="stats"><div><b>${S.relit || 0}</b><span>validateurs rallumés</span></div><div><b>${TIER_NAME[Math.max(0, ...S.nfts.map(n => ITEM[n.id || 201]?.tier || 0), S.got[102] ? 1 : 0)].replace(/^(la |une )/, '')}</b><span>meilleur outil</span></div></div>`,
  );
}
// ---------- malle ouverte ----------
let quantiteMalle = 1; // 1, 10 ou 0 (= tout)
function renderMalle(body) {
  if (!MALLE) {
    body.innerHTML = '<p class="qintro">Aucune malle ouverte : clic droit (ou toucher) sur une malle posée.</p>';
    return;
  }
  const m = MALLE;
  body.insertAdjacentHTML(
    'beforeend',
    `<p class="qintro">Malle en ${m.x}, ${m.y}, ${m.z}. Touche un objet pour le déplacer. Dans une parcelle, seuls toi et tes invités peuvent l'ouvrir ; ailleurs, tout le monde.</p>`,
  );
  const q = document.createElement('div');
  q.className = 'qte';
  q.insertAdjacentHTML('beforeend', '<span>Quantité</span>');
  for (const [v, t] of [
    [1, '1'],
    [10, '10'],
    [0, 'Tout'],
  ]) {
    const b = document.createElement('button');
    b.textContent = t;
    b.className = 'b' + (quantiteMalle === v ? ' primary' : '');
    b.onclick = () => {
      quantiteMalle = v;
      renderPanel();
    };
    q.appendChild(b);
  }
  body.appendChild(q);
  const zone = (titre, items, sens) => {
    body.insertAdjacentHTML('beforeend', `<h3 class="rcat">${titre}</h3>`);
    const grid = document.createElement('div');
    grid.className = 'grid malle';
    const liste = Object.entries(items).filter(([, n]) => n > 0);
    if (!liste.length)
      grid.innerHTML = `<p style="color:var(--muted);font-size:14px">${sens < 0 ? 'La malle est vide.' : 'Rien à déposer.'}</p>`;
    for (const [it, n] of liste) {
      const b = document.createElement('button');
      b.className = 'it';
      b.title = nameOf(+it);
      b.appendChild(cloneIcon(+it));
      b.insertAdjacentHTML('beforeend', `<b>${n}</b>`);
      b.onclick = () => deplacerMalle(it, sens * (quantiteMalle ? Math.min(quantiteMalle, n) : n));
      grid.appendChild(b);
    }
    body.appendChild(grid);
  };
  zone('Dans la malle', m.items, -1);
  zone('Dans ton sac', S.inv, 1);
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
    if (!all.length) grid.innerHTML = '<p style="color:var(--muted);font-size:14px">Ton coffre est vide. Mine quelques blocs.</p>';
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
        row('Jeton', `#${id}-${String(a.nft.serial).padStart(4, '0')}`);
        row(id === 203 ? 'Scellé le' : 'Forgée le', a.nft.date);
        row(id === 203 ? 'Validateur' : 'Lieu de forge', a.nft.where);
        if (ITEM[id].tool) row('Blocs minés avec', a.nft.mined || 0);
        row('Propriétaire', 'toi');
      } else {
        row('Identifiant', `#${id}`);
        row('Dans ton coffre', a.n);
        row('En circulation', S.supply[id] || a.n);
        if (isBlock) {
          row('Blocs posés à ton nom', myBlocks());
        }
      }
      const br = card.querySelector('.btnrow');
      const put = document.createElement('button');
      put.className = 'b primary';
      put.textContent = `Placer dans l'emplacement ${S.sel + 1}`;
      put.onclick = () => {
        const key = a.nft ? a.k : String(id);
        const ex = S.bar.indexOf(key);
        if (ex >= 0) S.bar[ex] = null;
        S.bar[S.sel] = key;
        dirty = true;
        ui();
      };
      br.appendChild(put);
      card.querySelector('p').textContent = a.nft
        ? "Un objet unique a son propre numéro et garde son histoire : qui l'a forgé, où, et ce qu'il a accompli."
        : isBlock
          ? 'Miner ce bloc frappe un jeton. Le poser le brûle, et le bloc posé porte ton numéro de série dans le registre.'
          : "Une ressource fongible : chaque unité vaut exactement la même chose qu'une autre.";
    } else card.innerHTML = '<p>Choisis un objet pour voir sa fiche de jeton.</p>';
    wrap.appendChild(card);
    body.appendChild(wrap);
    body.insertAdjacentHTML(
      'beforeend',
      '<p class="note">Simulation locale : rien n\'est inscrit sur une vraie blockchain. C\'est une maquette de ce que donneraient des blocs tokenisés.</p>',
    );
  } else if (tab === 'malle') renderMalle(body);
  else if (tab === 'quest') renderQuests(body);
  else if (tab === 'reglages') renderReglages(body);
  else if (tab === 'craft') {
    let cat = '';
    for (const r of RECIPES) {
      if (r.cat !== cat) {
        cat = r.cat;
        body.insertAdjacentHTML('beforeend', `<h3 class="rcat">${cat}</h3>`);
      }
      const ok = Object.entries(r.need).every(([k, n]) => (S.inv[k] || 0) >= n);
      const d = document.createElement('div');
      d.className = 'rec';
      d.appendChild(cloneIcon(r.out));
      d.insertAdjacentHTML(
        'beforeend',
        `<div><strong>${r.n > 1 ? r.n + ' × ' : ''}${nameOf(r.out)}</strong><span>${r.d}</span><div class="need">${Object.entries(r.need)
          .map(([k, n]) => `<em class="${(S.inv[k] || 0) >= n ? '' : 'ko'}">${n} ${nameOf(+k)} (${S.inv[k] || 0})</em>`)
          .join('')}</div></div><button class="b ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'}>Fabriquer</button>`,
      );
      d.querySelector('button').onclick = () => craft(r);
      body.appendChild(d);
    }
  } else {
    const pl = myBlocks();
    body.insertAdjacentHTML(
      'beforeend',
      `<div class="stats"><div><b>${S.totalMint}</b><span>jetons frappés</span></div><div><b>${S.totalBurn}</b><span>jetons brûlés</span></div><div><b>${pl}</b><span>blocs posés à ton nom</span></div><div><b>${S.nfts.length}</b><span>objets uniques</span></div></div>`,
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
        .join('') || '<p style="color:var(--muted)">Rien d\'inscrit pour l\'instant.</p>';
    body.appendChild(log);
  }
}
function mintNft(id, where) {
  const serial = S.nfts.length + 1;
  const n = { serial, id, date: new Date().toLocaleDateString('fr-FR'), where, mined: 0 };
  S.nfts.push(n);
  S.supply[id] = (S.supply[id] || 0) + 1;
  S.got[id] = 1;
  logEv('nft', `${nameOf(id)} #${serial}`, 'frappé, unique');
  return n;
}
function craft(r) {
  if (SERVER()) {
    serverAct('craft', { out_id: r.out }, null, 'fabriqué').then(res => {
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
  } else give(r.out, r.n, 'fabriqué');
}
// objets tenus : outils
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

// ---------- réglages ----------
const REG_CHOIX = [
  {
    k: 'vue',
    t: 'Distance de vue',
    d: 'Tronçons de 16 blocs chargés autour de toi. Moins = plus fluide.',
    o: [
      [3, 'Courte'],
      [4, 'Moyenne'],
      [5, 'Longue'],
      [6, 'Très longue'],
    ],
  },
  {
    k: 'nettete',
    t: 'Netteté',
    d: "Résolution de l'image. Plus bas = moins de chauffe sur téléphone.",
    o: [
      [1, 'Économe'],
      [1.5, 'Normale'],
      [2, 'Haute'],
    ],
  },
  {
    k: 'ombres',
    t: 'Ombres portées',
    d: 'Jolies mais coûteuses, surtout sur téléphone.',
    o: [
      [false, 'Non'],
      [true, 'Oui'],
    ],
  },
  {
    k: 'lucioles',
    t: 'Petites bêtes (lucioles, papillons, pétales)',
    o: [
      [false, 'Non'],
      [true, 'Oui'],
    ],
  },
  {
    k: 'animaux',
    t: 'Animaux',
    o: [
      [false, 'Non'],
      [true, 'Oui'],
    ],
  },
  {
    k: 'sensibilite',
    t: 'Sensibilité de la caméra',
    o: [
      [0.6, 'Douce'],
      [1, 'Normale'],
      [1.5, 'Vive'],
    ],
  },
  {
    k: 'ips',
    t: 'Images par seconde',
    d: "Affiche la fluidité à côté de l'horloge (60 = parfait, moins de 30 = saccadé).",
    o: [
      [false, 'Masquer'],
      [true, 'Afficher'],
    ],
  },
];
function renderReglages(body) {
  body.insertAdjacentHTML('beforeend', '<p class="qintro">Réglages propres à cet appareil. Ils s\'appliquent tout de suite.</p>');
  const box = document.createElement('div');
  box.className = 'reglages';
  for (const c of REG_CHOIX) {
    const row = document.createElement('div');
    row.className = 'reg';
    row.innerHTML = `<div><strong>${c.t}</strong>${c.d ? `<span>${c.d}</span>` : ''}</div><div class="opts"></div>`;
    for (const [v, lab] of c.o) {
      const b = document.createElement('button');
      b.className = 'b' + (REG[c.k] === v ? ' primary' : '');
      b.textContent = lab;
      b.onclick = () => {
        REG[c.k] = v;
        sauverReglages();
        appliquerReglages(c.k);
        renderPanel();
      };
      row.querySelector('.opts').appendChild(b);
    }
    box.appendChild(row);
  }
  body.appendChild(box);
  const raz = document.createElement('button');
  raz.className = 'b';
  raz.textContent = 'Revenir aux réglages conseillés';
  raz.onclick = () => {
    REG = { ...REG_DEFAUT };
    sauverReglages();
    for (const c of REG_CHOIX) appliquerReglages(c.k);
    renderPanel();
  };
  body.appendChild(raz);
}
function appliquerReglages(k) {
  if (k === 'vue') {
    VR = REG.vue;
    scene.fog.far = VR * CH + 12;
    scene.fog.near = scene.fog.far * 0.37;
  }
  if (k === 'nettete') {
    renderer.setPixelRatio(Math.min(devicePixelRatio, REG.nettete));
    resize();
  }
  if (k === 'ombres') {
    SHADOWS = REG.ombres;
    renderer.shadowMap.enabled = REG.ombres;
    sun.castShadow = REG.ombres;
    scene.traverse(o => {
      if (o.isMesh) {
        if (o.material === opMat) o.castShadow = REG.ombres;
        [].concat(o.material).forEach(m => (m.needsUpdate = true));
      }
    });
  }
  if (k === 'ips') $('ips').hidden = !REG.ips;
}
