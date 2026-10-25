// Ether Mines · exports the web version's interface icons (the SVGs of play.html's buttons: chest, chat,
// view, menu, jump, run, crouch, guard, ride, dodge, full screen) to unity/Assets/Resources/Art/ui-icons.bytes
// (a PNG: one 96 x 96 white icon per cell, in a row) and ui-icons-index.json (their names, in order), read by the
// Unity client (Ui.cs Glyph) so its buttons show the same pictures. Drawn by a headless browser.
// Setup once: npm i --no-save playwright@1.56.0
// Run after changing one of those buttons' icons:  node unity/tools/export-ui-icons.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = join(root, 'unity/Assets/Resources/Art');
// the button's id in play.html → the icon's name in Unity
const NAMES = {
  invBtn: 'chest',
  chatBtn: 'chat',
  vueBtn: 'view',
  menuBtn: 'menu',
  tJump: 'jump',
  tSprint: 'run',
  tSneak: 'crouch',
  tGuard: 'guard',
  tRide: 'ride',
  tDash: 'dodge',
  fsBtn: 'fullscreen',
};
const html = await readFile(join(root, 'play.html'), 'utf8');
const icons = [];
for (const [id, name] of Object.entries(NAMES)) {
  const m = html.match(new RegExp(`<button id="${id}"[^>]*>(<svg[\\s\\S]*?</svg>)`));
  if (!m) throw new Error(`no icon for #${id} in play.html`);
  icons.push({ name, svg: m[1] });
}
const S = 96;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const b64 = await page.evaluate(
  async ({ icons, S }) => {
    const c = document.createElement('canvas');
    c.width = S * icons.length;
    c.height = S;
    const g = c.getContext('2d');
    for (let i = 0; i < icons.length; i++) {
      // white, at the cell's size: currentColor is the text's color
      const svg = icons[i].svg
        .replace(/currentColor/g, '#ffffff')
        .replace(/<svg[^>]*?(viewBox="[^"]*")[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" $1>`);
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      g.drawImage(img, i * S, 0, S, S);
    }
    return c.toDataURL('image/png').split(',')[1];
  },
  { icons, S },
);
await browser.close();
await writeFile(join(out, 'ui-icons.bytes'), Buffer.from(b64, 'base64'));
await writeFile(join(out, 'ui-icons-index.json'), JSON.stringify({ size: S, names: icons.map(i => i.name) }) + '\n');
console.log(`ui-icons: ${icons.length} icons (${icons.map(i => i.name).join(', ')})`);
