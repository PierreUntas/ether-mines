// Emotes (rules.js EMOTES): gestures a character makes for everyone around to see. G (or the smiley
// button) opens the row of gestures; /wave, /dance... in the chat do the same. Most are free; a few come
// with their cosmetic from the Workshop (Dance, Bow). Your last gesture goes out with your position
// (`em`, numbered by `eq` so each is played once, like `fx`: 14-startup.js sendPos, the game server relays
// it), and every screen draws it on your avatar (emotePose, after the walk and the guard). A gesture that
// lasts (Sit) ends when you move; the others end on their own.
let EMOTE_OUT = { k: 0, q: 0 }, // your last gesture, told to the others
  MY_EMOTE = null, // the one you're making: { k, t0, x, z }
  emoteTold = false;
const emoteOwned = k => !!EMOTES[k] && (!EMOTES[k].cosmetic || ownsCosmetic(EMOTES[k].cosmetic));
function playEmote(k) {
  const e = EMOTES[k];
  if (!e) return false;
  closeEmotes();
  if (!emoteOwned(k)) {
    logEv('burn', e.n, 'in the shop, Workshop aisle');
    return true;
  }
  if (RIDE || BOARD) {
    logEv('burn', e.n, 'not on board a hovercraft');
    return true;
  }
  if (typeof setGuard === 'function') setGuard(false);
  MY_EMOTE = { k, t0: performance.now(), x: P.x, z: P.z };
  EMOTE_OUT = { k, q: (EMOTE_OUT.q + 1) & 0xffff };
  lastPos = null; // sent at once
  // through your own eyes you don't see yourself: say it once, the others do
  if (!VIEW && !emoteTold && !e.hidden) {
    emoteTold = true;
    logEv('nft', e.n, `everyone around sees it · ${touch ? 'the view button' : 'V'} to see yourself`);
  }
  return true;
}
// /wave, /dance...: true when the chat line was a gesture
const emoteCommand = c => !!EMOTES[c] && !EMOTES[c].hidden && playEmote(c);
// another player's gesture, heard with their position (each number once)
function emoteHeard(o, p) {
  if (p.eq !== o.eq) {
    if (o.eq !== undefined && EMOTES[p.em]) o.emote = { k: p.em, t0: performance.now() };
    o.eq = p.eq;
  }
}
// your own: over as soon as you walk off, mine, guard or board (Sit as much as the rest)
function tickMyEmote() {
  const m = MY_EMOTE;
  if (!m) return null;
  const e = EMOTES[m.k],
    t = (performance.now() - m.t0) / 1000;
  if (
    (e.sec && t > e.sec) ||
    Math.hypot(P.x - m.x, P.z - m.z) > 0.2 ||
    mining ||
    RIDE ||
    BOARD ||
    (typeof guarding === 'function' && guarding())
  )
    return (MY_EMOTE = null);
  return m;
}

// ---------- the gestures, drawn over the walk ----------
// em: { k, t0 }. Eases in and out; returns false once it's over (the caller forgets it). Called after
// poseArms and movePose, so it takes over the arms, legs and lean it needs and leaves the rest as it was.
function emotePose(o, em) {
  const e = em && EMOTES[em.k];
  if (!e) return false;
  const t = (performance.now() - em.t0) / 1000;
  if (e.sec && t > e.sec) return false;
  const k = Math.min(1, t / 0.18) * (e.sec ? Math.min(1, (e.sec - t) / 0.25) : 1),
    to = (obj, prop, v) => (obj[prop] += (v - obj[prop]) * k),
    R = o.arms[1].rotation,
    L = o.arms[0].rotation;
  switch (em.k) {
    case 'wave': // the right hand up, waving
      to(R, 'x', 2.9);
      to(R, 'z', 0.45 + Math.sin(t * 9) * 0.35); // (+z swings the right arm out to the side)
      to(o.head.rotation, 'z', 0.12);
      break;
    case 'point': // the right arm straight out, ahead
      to(R, 'x', 1.62);
      to(R, 'z', 0.02);
      to(o.body.rotation, 'y', -0.22);
      break;
    case 'cheer': // both arms up, hopping
      to(R, 'x', 2.95);
      to(L, 'x', 2.95);
      to(R, 'z', 0.5 + Math.sin(t * 8) * 0.15);
      to(L, 'z', -0.5 - Math.sin(t * 8) * 0.15);
      o.g.position.y += Math.abs(Math.sin(t * 6)) * 0.22 * k;
      break;
    case 'clap': // both hands in front, meeting again and again
      to(R, 'x', 1.25);
      to(L, 'x', 1.25);
      to(R, 'z', -0.42 - Math.max(0, Math.sin(t * 14)) * 0.28);
      to(L, 'z', 0.42 + Math.max(0, Math.sin(t * 14)) * 0.28);
      break;
    case 'sit': // on the ground, legs out in front, hands on the knees
      to(o.legs[0].rotation, 'x', 1.45);
      to(o.legs[1].rotation, 'x', 1.45);
      to(R, 'x', 0.75);
      to(L, 'x', 0.75);
      to(R, 'z', 0.05);
      to(L, 'z', -0.05);
      o.g.position.y -= 0.4 * k;
      break;
    case 'seat': // on a chair or a sofa (22-gestures.js put you on its seat): the same, on the seat
      to(o.legs[0].rotation, 'x', 1.45);
      to(o.legs[1].rotation, 'x', 1.45);
      to(R, 'x', 0.55);
      to(L, 'x', 0.55);
      o.g.position.y -= 0.4 * k;
      break;
    case 'lie': {
      // on the back along the bed (22-gestures.js: you stand where its halves meet, looking at your feet):
      // turned back from the feet, slid toward them so the body lies centered, arms along it
      const ry = o.g.rotation.y;
      o.g.rotation.x += (Math.PI / 2) * k;
      o.g.position.x -= Math.sin(ry) * 0.95 * k;
      o.g.position.z -= Math.cos(ry) * 0.95 * k;
      o.g.position.y += 0.16 * k;
      for (const a of [R, L]) to(a, 'x', 0.05);
      to(R, 'z', 0.08);
      to(L, 'z', -0.08);
      to(o.legs[0].rotation, 'x', 0);
      to(o.legs[1].rotation, 'x', 0);
      to(o.head.rotation, 'x', 0);
      break;
    }
    case 'eat': // the right hand to the mouth, a few bites
      to(R, 'x', 2.1 + Math.max(0, Math.sin(t * 9)) * 0.35);
      to(R, 'z', -0.55);
      to(o.head.rotation, 'x', 0.12);
      break;
    case 'dance': {
      // arms up in turn, hips swaying, little steps, a hop on the beat
      const b = t * 6;
      to(R, 'x', 1.4 + Math.sin(b) * 1.3);
      to(L, 'x', 1.4 - Math.sin(b) * 1.3);
      to(R, 'z', 0.35);
      to(L, 'z', -0.35);
      to(o.body.rotation, 'y', Math.sin(b / 2) * 0.45);
      to(o.legs[0].rotation, 'x', Math.sin(b) * 0.45);
      to(o.legs[1].rotation, 'x', -Math.sin(b) * 0.45);
      o.g.rotation.z += Math.sin(b) * 0.08 * k;
      o.g.position.y += Math.abs(Math.sin(b)) * 0.1 * k;
      break;
    }
    case 'bow': {
      // a bow from the waist, one hand on the chest, the other behind the back, then back up
      const d = Math.sin(Math.min(1, t / e.sec) * Math.PI);
      o.g.rotation.x -= 0.55 * d * k; // (a negative turn leans toward where they face)
      to(R, 'x', 0.9);
      to(R, 'z', -0.75);
      to(L, 'x', -0.55);
      to(L, 'z', 0.1);
      break;
    }
  }
  return true;
}
// yours, seen from outside (viewFromOutside), and the others' (updateOthers)
function emoteSelf(o) {
  const m = tickMyEmote();
  if (m) emotePose(o, m);
}
function emoteOther(o) {
  if (o.emote && !emotePose(o, o.emote)) o.emote = null;
}

// ---------- the row of gestures ----------
function closeEmotes() {
  const box = $('emotes');
  if (box) box.hidden = true;
}
function toggleEmotes() {
  const box = $('emotes');
  if (!box) return;
  if (!box.hidden) return closeEmotes();
  box.innerHTML = '';
  for (const [k, e] of ROW_EMOTES()) {
    const b = document.createElement('button'),
      own = emoteOwned(k);
    b.className = 'emote' + (own ? '' : ' locked');
    b.innerHTML = `<i>${EMOTE_ICON[k] || '•'}</i><span>${e.n}</span>${own ? '' : '<b>🔒</b>'}${touch ? '' : `<kbd>${ROW_EMOTES().findIndex(r => r[0] === k) + 1}</kbd>`}`;
    b.title = own ? `${e.n} · /${k} in the chat` : `${e.n} · in the shop, Workshop aisle`;
    b.onclick = ev => {
      ev.stopPropagation();
      if (own) playEmote(k);
      else {
        closeEmotes();
        SHOP_TAB = 'workshop';
        openTab('shop');
      }
    };
    box.appendChild(b);
  }
  box.hidden = false;
}
// the row: the gestures you pick (not the ones the world makes, hidden)
const ROW_EMOTES = () => Object.entries(EMOTES).filter(([, e]) => !e.hidden);
const EMOTE_ICON = { wave: '👋', point: '👉', cheer: '🙌', clap: '👏', sit: '🪑', dance: '💃', bow: '🙇' };
// G opens the row; while it's open, 1 to 7 pick a gesture instead of a slot of the bar (caught first, in
// the capture phase), Escape or G again closes it
addEventListener(
  'keydown',
  e => {
    const box = $('emotes'),
      open = box && !box.hidden;
    if (e.code === 'Escape') return closeEmotes();
    if (!playing || chatOpen || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (e.code === 'KeyG') return toggleEmotes();
    const n = open && /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : 0,
      k = n && ROW_EMOTES()[n - 1]?.[0];
    if (!k) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (emoteOwned(k)) playEmote(k);
    else logEv('burn', EMOTES[k].n, 'in the shop, Workshop aisle');
    closeEmotes();
  },
  true,
);
for (const id of ['emoteBtn', 'emoteBtnDesk'])
  if ($(id))
    $(id).onclick = e => {
      e.stopPropagation();
      toggleEmotes();
    };
