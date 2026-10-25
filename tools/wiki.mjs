// The players' wiki (wiki.html), built from the game's own data so it never drifts from it: the recipes,
// items and cosmetics (rules.js), the mobs (mobs-core.js), the objectives and chapters (07-interface.js), the update log (src/news.js).
// The rest is written here, by hand. Run after a change to any of them:  node tools/wiki.mjs > wiki.html
// (a test checks that wiki.html is up to date).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../supabase/functions/_shared/world.js');
require('../supabase/functions/_shared/rules.js');
require('../src/mobs-core.js');
require('../src/news.js');
const { B, ITEM, RECIPES, COSMETICS } = globalThis.Rules;
const { MK } = globalThis.MobsCore;
const { DEEP } = globalThis.World;

// the objectives and chapters, read from the game's own code (their checks are never run here)
const src = readFileSync(new URL('../src/game/07-interface.js', import.meta.url), 'utf8');
const cut = (from, to) => {
  const a = src.indexOf(from),
    b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('wiki: cannot find ' + from);
  return src.slice(a, b);
};
const ctx = vm.createContext({ DEEP, S: {}, hasNft: () => 0, ownedValidators: () => 0, SERVER: () => 0, MY_GATES: {} });
vm.runInContext(cut('const QUESTS = [', 'const QBY') + '; this.QUESTS = QUESTS;', ctx);
vm.runInContext(cut('const CHAPTERS = [', '// the epilogue') + '; this.CHAPTERS = CHAPTERS;', ctx);
const { QUESTS, CHAPTERS } = ctx;
const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q]));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nameOf = id => (B[id] && B[id].n) || (ITEM[id] && ITEM[id].n) || '#' + id;
const fmt = n => Number(n).toLocaleString('en-US');

// ---------- chapters ----------
const chapters = CHAPTERS.map(
  c => `<div class="card"><h3>${esc(c.n)}${c.side ? ' <span class="tag">side chapter</span>' : ''} <span class="reward">+${fmt(c.gwei)} Gwei · a title</span></h3>
${c.intro ? `<p class="muted">${esc(c.intro)}</p>` : ''}
<ol>${c.q
    .map(id => QBY[id])
    .filter(Boolean)
    .map(q => `<li><b>${esc(q.t)}</b> — ${esc(q.h)}</li>`)
    .join('')}</ol></div>`,
).join('\n');

// ---------- crafting ----------
const byCat = {};
for (const r of Object.values(RECIPES)) (byCat[r.cat] ||= []).push(r);
const crafting = Object.entries(byCat)
  .map(
    ([cat, rs]) =>
      `<h3>${esc(cat)}</h3><table><tr><th>Makes</th><th>From</th><th></th></tr>${rs
        .map(
          r =>
            `<tr><td><b>${esc(nameOf(r.out))}</b>${r.n > 1 ? ' ×' + r.n : ''}</td><td>${Object.entries(r.need)
              .map(([id, n]) => `${n} ${esc(nameOf(+id))}`)
              .join(', ')}</td><td class="muted">${esc(r.d || '')}</td></tr>`,
        )
        .join('')}</table>`,
  )
  .join('\n');

// ---------- tools, weapons, platings ----------
const gear = Object.entries(ITEM)
  .filter(([, it]) => it.tool || it.dmg || it.armor || it.boots)
  .map(([id, it]) => {
    const what = it.tool
      ? `Pickaxe · mines ×${it.tool}`
      : it.dmg
        ? `${it.ranged ? 'Ranged weapon' : 'Blade'} · ${it.dmg} damage`
        : it.armor
          ? `Plating · −${Math.round(it.armor * 100)}% damage taken`
          : `Boots · +${Math.round(it.boots * 100)}% speed, a dodge`;
    return `<tr><td><b>${esc(it.n)}</b></td><td>${what}</td><td class="muted">${it.nft ? 'unique' : ''}</td></tr>`;
  })
  .join('');

// ---------- mobs ----------
const WHERE = {
  shadow: 'the caves',
  guardian: 'around the dark validators in the ruins',
  sentinel: 'the geodes, deep below',
  wraith: 'beside the genesis rock, at the bottom of the world',
  titan: 'a boss in the depths (the compass points to it)',
  warden: 'every floor of the towers',
  turret: 'tower floors: it fires bolts',
  plasma_core: 'the top of each tower: a boss',
  garden_guardian: 'the Ether Gardens',
  prowler: 'the open surface, after dark',
  sky_raider: 'the floating islands',
  water_lurker: 'the water',
  bat: 'the caves',
  crawler: 'the ruins',
  golem: 'the geodes, deep below',
  corrupted_node: 'around the Atrium during a network attack',
  pow_twin: 'the Merge Sanctum: a boss, with its twin',
  pos_twin: 'the Merge Sanctum: a boss, with its twin',
  front_runner: 'the Mempool arena: a boss for two or three players',
  mev_bot: 'the Front-Runner calls them in',
  gas_scorpion: 'the dunes, after dark: it stings from afar',
  phish_spider: 'the forests, after dark: it pounces',
  pump_slime: 'the plains, after dark',
  yeti: 'the snowy peaks, day and night: its blows throw you far',
};
const mobs = Object.entries(MK)
  .map(
    ([k, m]) =>
      `<tr><td><b>${esc(m.n)}</b></td><td>${m.hp}</td><td>${m.dmg}${m.ranged ? ' (bolts)' : ''}</td><td class="muted">${esc(WHERE[k] || '')}</td></tr>`,
  )
  .join('');

// ---------- hovercrafts, cosmetics ----------
const crafts = Object.values(ITEM)
  .filter(it => it.hover)
  .map(it => esc(it.n))
  .join(', ');
const cosm = Object.values(COSMETICS).filter(c => !c.retired);
const prices = cosm.map(c => c.price).filter(p => p > 0);
const CAT = {
  character: 'outfits',
  head: 'hats and helmets',
  back: 'capes, wings and packs',
  companion: 'companions',
  effect: 'trails',
  tool: 'tool trims',
  block: 'block packs',
  title: 'titles',
  combat: 'combat trophies',
  event: 'event trophies',
  validator: 'validator skins',
  premium: 'premium pieces (sold for euros)',
  emote: 'emotes',
};
const cats = {};
for (const c of cosm) cats[c.category] = (cats[c.category] || 0) + 1;
const cosmList = Object.entries(cats)
  .map(([k, n]) => `${n} ${CAT[k] || k}`)
  .join(', ');

const news = globalThis.NEWS.map(
  n =>
    `<div class="card"><h3>${esc(n.title)} <span class="tag">${esc(n.date)}</span></h3><ul>${n.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`,
).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ether Mines · Wiki</title>
<meta name="description" content="How to play Ether Mines: controls, chapters, crafting, tools, mobs, validators, plots, hovercrafts, the shop.">
<meta name="theme-color" content="#1c163a">
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
  :root{--bg:#1c163a;--card:rgba(46,38,92,.6);--line:rgba(190,178,255,.28);--text:#f4f1ff;--muted:#b8b0e6;--violet:#a99cff;--mint:#9fe3c4;--gold:#ffd95e;--cyan:#7fe8ff}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Fredoka,system-ui,sans-serif}
  main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
  a{color:var(--mint)}
  h1,h2,h3{font-weight:600;line-height:1.2}
  h1{font-size:40px;margin:0}
  h2{font-size:26px;margin:44px 0 12px;color:var(--gold);scroll-margin-top:12px}
  h3{font-size:19px;margin:22px 0 8px;color:var(--violet)}
  .muted{color:var(--muted);font-size:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 16px;margin:12px 0}
  .card h3{margin:8px 0}
  .reward{font-size:13px;color:var(--gold);font-weight:400;margin-left:6px}
  .tag{font-size:12px;color:var(--cyan);border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-weight:400}
  ol,ul{padding-left:22px}
  li{margin:5px 0}
  nav{display:flex;gap:8px 14px;flex-wrap:wrap;margin:18px 0 0;font-size:15px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td,th{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left;vertical-align:top}
  th{color:var(--muted);font-weight:500}
  kbd{font-family:"IBM Plex Mono",monospace;font-size:12px;border:1px solid var(--line);border-radius:5px;padding:1px 6px;white-space:nowrap}
  .back{display:inline-block;margin-top:18px;font-size:15px}
  .wrap{overflow-x:auto}
</style>
</head>
<body>
<main>
<a class="back" href="play.html">← Back to the game</a>
<h1>Ether Mines · Wiki</h1>
<p class="muted">A block world in Ethereum's colors, built with friends. Everything you need to know, in one page.</p>
<nav>
  <a href="#start">Getting started</a><a href="#controls">Controls</a><a href="#chapters">Chapters</a><a href="#crafting">Crafting</a>
  <a href="#gear">Tools &amp; weapons</a><a href="#mobs">Mobs</a><a href="#validators">Validators &amp; Gwei</a><a href="#plots">Plots</a>
  <a href="#chests">Chests &amp; trading</a><a href="#hover">Hovercrafts</a><a href="#shop">Shop</a><a href="#account">Your account</a><a href="#news">What's new</a>
</nav>

<h2 id="start">Getting started</h2>
<ul>
  <li>You arrive at the <b>Atrium</b>, the sanctuary around the first validator. Nobody can build or fight there. Thea, its guardian, gives you your first objectives.</li>
  <li>Mine a tree trunk by hand, turn the logs into planks, then craft a <b>wooden pickaxe</b>: stone can only be cut with a pickaxe.</li>
  <li>Every block you mine becomes a token in your chest; every block you place remembers who placed it (tap it, or press <kbd>I</kbd>, to see its history).</li>
  <li>The <b>objective bar</b> at the top of the screen shows what to do next, and the compass beside it points the way.</li>
  <li>The world turns from day to night in 8 minutes. Nights are darker and more dangerous: a bed lets you sleep through them and heals you.</li>
</ul>

<h2 id="controls">Controls</h2>
<div class="wrap"><table>
<tr><th>Computer</th><th>Phone or tablet</th><th></th></tr>
<tr><td><kbd>W A S D</kbd> · <kbd>Shift</kbd> · <kbd>Space</kbd></td><td>Stick on the left · buttons on the right</td><td>Walk · run · jump</td></tr>
<tr><td>Mouse</td><td>Drag</td><td>Look around</td></tr>
<tr><td>Left click (hold)</td><td>Long press</td><td>Mine, strike</td></tr>
<tr><td>Right click</td><td>Short tap</td><td>Place a block, open, use, get on a hovercraft</td></tr>
<tr><td>Right click held, with a blade</td><td>Shield button</td><td>Guard; raised just before a blow: a parry</td></tr>
<tr><td><kbd>Q</kbd></td><td>Lightning button</td><td>Dodge (with the Front-Runner Boots)</td></tr>
<tr><td><kbd>1</kbd>–<kbd>9</kbd> · scroll</td><td>The bar at the bottom</td><td>Choose what you hold</td></tr>
<tr><td><kbd>E</kbd></td><td>Chest button</td><td>Chest, crafting, objectives, validators, shop, trade, settings</td></tr>
<tr><td><kbd>Enter</kbd></td><td>Chat button</td><td>Chat</td></tr>
<tr><td><kbd>V</kbd> · <kbd>F</kbd> · <kbd>T</kbd> · <kbd>I</kbd></td><td></td><td>View from behind or in front · full screen · ledger view · block explorer</td></tr>
</table></div>
<h3>Chat commands</h3>
<ul>
  <li><kbd>/join nickname</kbd> — teleport to an online friend · <kbd>/sanctuary</kbd> — back to the Atrium</li>
  <li><kbd>/claim</kbd> · <kbd>/unclaim</kbd> · <kbd>/claims</kbd> — take, release, list your plots</li>
  <li><kbd>/invite nickname</kbd> · <kbd>/kick nickname</kbd> — let a friend build on your plots, or not</li>
  <li><kbd>/trade nickname</kbd> — open a trade with a player</li>
  <li><kbd>/ignore</kbd> · <kbd>/listen</kbd> · <kbd>/report nickname</kbd> — hide, unhide or report a player</li>
</ul>

<h2 id="chapters">Chapters</h2>
<p>The story comes in chapters: finish every objective of one to earn its Gwei and a title, and open the next. The objectives of a chapter can be done in any order.</p>
${chapters}

<h2 id="crafting">Crafting</h2>
<p>Open your chest (<kbd>E</kbd>), then the Crafting tab.</p>
${crafting}

<h2 id="gear">Tools, weapons and platings</h2>
<p>A better pickaxe mines faster and opens harder rock: the crystal pickaxe opens the geodes below layer ${DEEP}, the pure ether pickaxe breaks the genesis rock at the bottom of the world. Unique items are numbered: each one is a single token with its own serial.</p>
<div class="wrap"><table><tr><th>Item</th><th>What it does</th><th></th></tr>${gear}</table></div>

<h2 id="mobs">Mobs</h2>
<p>Hostile mobs wind up before they strike: raise your guard right then to parry, and the mob reels, open to a riposte. Some worlds can turn hostile mobs off (Settings), not the main one.</p>
<div class="wrap"><table><tr><th>Mob</th><th>Health</th><th>Damage</th><th>Where</th></tr>${mobs}</table></div>

<h2 id="validators">Validators and Gwei</h2>
<ul>
  <li><b>Gwei</b> is the game's currency, kept by the server. You earn it from chapters, mobs, the defense of the Atrium and, above all, your validators.</li>
  <li>Dark validators sleep in the ruins (the compass points to the nearest). Craft a validator heart and relight one: it becomes yours and produces Gwei every 5 minutes, even when you're offline.</li>
  <li>A common validator earns about 120 Gwei an hour; rare, epic and legendary ones earn 2 to 8 times more. Upgrading adds 15% per level, up to level 10 (Validators tab).</li>
  <li><b>Attest</b> your validators at least once every 8 days (Validators tab): past that, they turn corrupted and stop producing until you attest again.</li>
  <li>Every hour, for its first 10 minutes, corrupted nodes attack the Atrium: destroy them for Gwei, and a bonus when the network holds.</li>
</ul>

<h2 id="plots">Plots</h2>
<ul>
  <li>The world is cut into plots of 16 × 16 blocks. <kbd>/claim</kbd> shows the one you stand in: gold when free, green when yours, red when someone else's or public.</li>
  <li>Your first plot costs 500 Gwei, then twice as much for each one you hold (1,000, 2,000, 4,000…), 9 at most per world. Giving one up lowers the next price; nothing is refunded.</li>
  <li>On your plots, only you and the friends you invite can mine, build, open doors and chests.</li>
  <li>The Atrium, the City and the Circuits Complex belong to everyone: nobody can claim them.</li>
</ul>

<h2 id="chests">Chests and trading</h2>
<ul>
  <li>A chest you place keeps its items on the server. On your plot, only you and your invites can open it; anywhere else, anyone can.</li>
  <li>Each tower holds a treasure chest near its top, guarded by the wardens and the Plasma Core.</li>
  <li>To trade, open the Trade tab (or <kbd>/trade nickname</kbd>): choose what you give and what you want; the other player accepts or not.</li>
</ul>

<h2 id="hover">Hovercrafts</h2>
<p>${crafts}. Hold one and right-click (on a phone: the hovercraft button) to get on board: twice as fast, over water too. A Twin Diamond has a back seat for a friend.</p>

<h2 id="shop">Shop and cosmetics</h2>
<p>${cosm.length} cosmetics: ${cosmList}. Prices go from ${fmt(Math.min(...prices))} to ${fmt(Math.max(...prices))} Gwei, and a few picks are on sale each week. Press Try on any piece to see it on your character before you buy it. Trophies can't be bought: they're won in combat and during events.</p>
<h3>Emotes</h3>
<p>Gestures everyone around you sees: press G (or the smiley button on a phone), then pick one, or type its name in the chat. ${Object.entries(globalThis.Rules.EMOTES)
  .map(([k, e]) => `<code>/${k}</code> ${esc(e.n)}${e.cosmetic ? ' (Workshop)' : ''}`)
  .join(' · ')}. Sitting lasts until you move.</p>

<h2 id="account">Your account</h2>
<ul>
  <li>You enter with your nickname and a password. A free nickname makes your account; on another device, the same nickname and password bring your game there.</li>
  <li>On your usual device the game remembers you. Account (in the menu) lets you change your password or log out.</li>
  <li>Forgot your password? Write to <a href="mailto:contact@ethermines.org">contact@ethermines.org</a> with your nickname and what you own in the game.</li>
</ul>

<h2 id="news">What's new</h2>
${news}

<p class="muted" style="margin-top:48px"><a href="legal.html">Terms, legal notice &amp; privacy</a> · <a href="play.html">Back to the game</a></p>
</main>
</body>
</html>
`;
process.stdout.write(html);
