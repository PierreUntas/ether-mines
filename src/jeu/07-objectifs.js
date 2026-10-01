// Mines d'Éther · Objectifs secondaires : défis du jour et succès.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
// ---------- compteurs ----------
// stat(clé, n) : appelé par le jeu à chaque action réussie. Fait avancer les succès (gardés dans la partie)
// et l'affichage des défis du jour (en ligne, le serveur tient les vrais compteurs et verse la récompense).
function stat(k, n = 1) {
  S.stats = S.stats || {};
  S.stats[k] = (S.stats[k] || 0) + n;
  avancerDefis(k, n);
  verifierSucces();
}

// ---------- défis du jour ----------
// Mêmes clés que le serveur : mine, got:<objet>, place, place:<bloc>, craft, craft:<objet>, gift, toggle, relight.
let DEFIS_JOUR = null; // { day, defis: [{ id, c, n, t, r, have, claimed }] }
function defisLocaux() {
  const day = jourDefis();
  if (!S.daily || S.daily.day !== day) S.daily = { day, counts: {}, claimed: [] };
  return {
    day,
    defis: defisDuJour(day).map(d => ({ ...d, have: S.daily.counts[d.c] || 0, claimed: S.daily.claimed.includes(d.id) })),
  };
}
async function chargerDefis() {
  if (!SERVER()) {
    DEFIS_JOUR = defisLocaux();
    return;
  }
  try {
    const r = await Net.act('daily', {});
    if (r && r.ok) DEFIS_JOUR = { day: r.day, defis: r.defis };
  } catch (e) {
    // 004_objectifs.sql pas encore lancé : on affiche les défis sans récompense possible
    DEFIS_JOUR = { ...defisLocaux(), horsLigne: true };
  }
}
function avancerDefis(k, n) {
  if (!SERVER()) {
    const day = jourDefis();
    if (!S.daily || S.daily.day !== day) S.daily = { day, counts: {}, claimed: [] };
    S.daily.counts[k] = (S.daily.counts[k] || 0) + n;
  }
  if (!DEFIS_JOUR || DEFIS_JOUR.day !== jourDefis()) return void chargerDefis();
  for (const d of DEFIS_JOUR.defis) {
    if (d.c !== k) continue;
    const avant = d.have;
    d.have += n;
    if (avant < d.n && d.have >= d.n && !d.claimed) {
      logEv('nft', `Défi du jour terminé : ${d.t}`, `touche ${d.r} cristaux dans Objectifs`);
      Sound.chime();
      flashQuest();
    }
  }
}
async function toucherDefi(id) {
  const d = DEFIS_JOUR && DEFIS_JOUR.defis.find(x => x.id === id);
  if (!d || d.claimed || d.have < d.n) return;
  if (SERVER()) {
    const r = await serverAct('daily_claim', { defi: id }, null, 'récompense du défi');
    if (!r) return void chargerDefis().then(renderPanel);
  } else {
    S.daily.claimed.push(id);
    give(101, d.r, 'récompense du défi');
  }
  d.claimed = true;
  stat('defis');
  Sound.chime();
  logEv('nft', `Récompense : ${d.r} cristaux`, d.t);
  if (!$('panel').hidden) renderPanel();
}
function renderDefis(body) {
  if (!DEFIS_JOUR) chargerDefis().then(() => tab === 'quest' && !$('panel').hidden && renderPanel());
  const D = DEFIS_JOUR || defisLocaux();
  const fin = new Date((D.day + 1) * 864e5 + Date.UTC(2026, 0, 1)),
    h = Math.max(0, Math.ceil((fin - Date.now()) / 36e5));
  body.insertAdjacentHTML('beforeend', `<h3 class="qtitre">Défis du jour <small>nouveaux défis dans ${h} h</small></h3>`);
  const box = document.createElement('div');
  box.className = 'defis';
  for (const d of D.defis) {
    const p = Math.min(1, d.have / d.n),
      el = document.createElement('div');
    el.className = 'defi' + (d.claimed ? ' fait' : p >= 1 ? ' pret' : '');
    el.innerHTML = `<div class="dtxt"><strong></strong><span>${Math.min(d.have, d.n)} / ${d.n}</span></div>
      <div class="barre"><i style="width:${Math.round(p * 100)}%"></i></div>`;
    el.querySelector('strong').textContent = d.t;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = d.claimed ? 'Touché' : `${d.r} cristaux`;
    b.disabled = d.claimed || p < 1 || !!D.horsLigne;
    b.onclick = () => toucherDefi(d.id);
    el.appendChild(b);
    box.appendChild(el);
  }
  body.appendChild(box);
  if (D.horsLigne)
    body.insertAdjacentHTML(
      'beforeend',
      '<p class="qintro">Récompenses indisponibles : le serveur n’a pas encore les défis (004_objectifs.sql).</p>',
    );
}

// ---------- succès ----------
// Purement honorifiques : rien à gagner en trichant. ok() lit S.stats et le reste de la partie.
const st = k => (S.stats && S.stats[k]) || 0;
const SUCCES = [
  { id: 'mine1', t: 'Premiers coups', d: 'Mine 10 blocs', v: () => st('mine'), n: 10 },
  { id: 'mine2', t: 'Mineur', d: 'Mine 500 blocs', v: () => st('mine'), n: 500 },
  { id: 'mine3', t: 'Infatigable', d: 'Mine 5 000 blocs', v: () => st('mine'), n: 5000 },
  { id: 'pose1', t: 'Bâtisseur', d: 'Pose 100 blocs', v: () => st('place'), n: 100 },
  { id: 'pose2', t: 'Architecte', d: 'Pose 1 000 blocs', v: () => st('place'), n: 1000 },
  { id: 'atelier', t: 'Artisan', d: 'Fabrique 25 fois à l’atelier', v: () => st('craft'), n: 25 },
  { id: 'lanternes', t: 'Allumeur de réverbères', d: 'Pose 10 lanternes', v: () => st('place:14'), n: 10 },
  { id: 'cristaux', t: 'Riche en éther', d: 'Extrais 100 cristaux', v: () => st('got:101'), n: 100 },
  { id: 'geodes', t: 'Chasseur de géodes', d: 'Extrais 10 éclats purs', v: () => st('got:103'), n: 10 },
  { id: 'grottes', t: 'Spéléologue', d: `Descends sous la couche ${DEEP}`, v: () => (S.stats?.bas ?? 99) <= DEEP, n: 1 },
  { id: 'fond', t: 'Au fond du monde', d: 'Touche presque le socle (couche 3)', v: () => (S.stats?.bas ?? 99) <= 3, n: 1 },
  { id: 'marche1', t: 'Promeneur', d: 'Parcours 1 km', v: () => Math.floor(st('dist')), n: 1000 },
  { id: 'marche2', t: 'Grand voyageur', d: 'Parcours 10 km', v: () => Math.floor(st('dist')), n: 10000 },
  { id: 'caresses', t: 'Ami des bêtes', d: 'Caresse 20 animaux', v: () => st('caresse'), n: 20 },
  { id: 'cadeaux', t: 'Chouchou des renards', d: 'Reçois 10 cadeaux d’animaux', v: () => st('gift'), n: 10 },
  { id: 'contrats', t: 'Électricien', d: 'Actionne 50 fois portes et leviers', v: () => st('toggle'), n: 50 },
  { id: 'parcelle', t: 'Propriétaire', d: 'Revendique une parcelle', v: () => st('parcelle'), n: 1 },
  { id: 'relit1', t: 'Gardien', d: 'Rallume 3 validateurs anciens', v: () => S.relit || 0, n: 3 },
  { id: 'relit2', t: 'Ressusciteur', d: 'Rallume 12 validateurs anciens', v: () => S.relit || 0, n: 12 },
  { id: 'nuits', t: 'Noctambule', d: 'Passe 5 nuits dehors', v: () => st('nuit'), n: 5 },
  { id: 'defis1', t: 'Assidu', d: 'Termine 10 défis du jour', v: () => st('defis'), n: 10 },
  { id: 'defis2', t: 'Pilier du réseau', d: 'Termine 60 défis du jour', v: () => st('defis'), n: 60 },
  { id: 'bavard', t: 'Bavard', d: 'Envoie 20 messages', v: () => st('chat'), n: 20 },
  { id: 'histoire', t: 'La flamme rallumée', d: 'Termine l’histoire principale', v: () => questIndex() >= QUESTS.length, n: 1 },
];
const valeur = s => +s.v();
let succesT = 0;
function verifierSucces() {
  S.succes = S.succes || {};
  for (const s of SUCCES) {
    if (S.succes[s.id] || valeur(s) < s.n) continue;
    S.succes[s.id] = new Date().toISOString().slice(0, 10);
    logEv('nft', `Succès : ${s.t}`, s.d);
    Sound.chime();
    flashQuest();
    dirty = true;
  }
}
// compteurs continus (distance, profondeur, nuits) : relevés quelques fois par seconde par la boucle
let dernierPas = null,
  etaitNuit = false;
function suivreObjectifs(dt) {
  succesT -= dt;
  S.stats = S.stats || {};
  if (dernierPas) {
    const d = Math.hypot(P.x - dernierPas[0], P.z - dernierPas[1]);
    if (d < 2) S.stats.dist = (S.stats.dist || 0) + d; // pas de téléportation dans le compteur
  }
  dernierPas = [P.x, P.z];
  if (succesT > 0) return;
  succesT = 1;
  S.stats.bas = Math.min(S.stats.bas ?? 99, Math.floor(P.y));
  const nuit = skyU.night.value > 0.8;
  if (nuit && !etaitNuit) S.stats.nuit = (S.stats.nuit || 0) + 1;
  etaitNuit = nuit;
  verifierSucces();
}
function renderSucces(body) {
  S.succes = S.succes || {};
  const nb = SUCCES.filter(s => S.succes[s.id]).length;
  body.insertAdjacentHTML('beforeend', `<h3 class="qtitre">Succès <small>${nb} / ${SUCCES.length}</small></h3>`);
  const g = document.createElement('div');
  g.className = 'succes';
  for (const s of SUCCES) {
    const fait = !!S.succes[s.id],
      p = Math.min(1, valeur(s) / s.n),
      el = document.createElement('div');
    el.className = 'badge' + (fait ? ' fait' : '');
    el.innerHTML = `<b></b><span></span>${fait ? '' : `<div class="barre"><i style="width:${Math.round(p * 100)}%"></i></div>`}`;
    el.querySelector('b').textContent = (fait ? '◆ ' : '◇ ') + s.t;
    el.querySelector('span').textContent = s.d;
    if (fait) el.title = 'obtenu le ' + S.succes[s.id];
    g.appendChild(el);
  }
  body.appendChild(g);
}
