// Ether Mines · exports What's new (src/news.js) to unity/Assets/Resources/news.json, read by the Unity
// client's title screen (GameTitle.cs) as the web's title screen reads window.NEWS.
// Run after changing src/news.js:  node unity/tools/export-news.mjs   (--check: fail if stale)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../../src/news.js');
const news = globalThis.NEWS;
if (!Array.isArray(news) || !news.length) throw new Error('export-news: src/news.js has no NEWS');
const out =
  JSON.stringify({
    _format: 'see unity/tools/export-news.mjs; generated, do not edit',
    news: news.map(n => ({ date: n.date, title: n.title, items: n.items })),
  }) + '\n';
const file = new URL('../Assets/Resources/news.json', import.meta.url);
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(file, 'utf8');
  } catch {}
  if (now !== out) throw new Error('export-news: unity/Assets/Resources/news.json is out of date: run node unity/tools/export-news.mjs');
  console.log('news.json up to date');
} else {
  writeFileSync(file, out);
  console.log(`news.json: ${news.length} entries`);
}
