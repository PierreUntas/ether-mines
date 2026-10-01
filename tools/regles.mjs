// Génère supabase/regles.sql à partir de supabase/functions/_shared/rules.js.
// Usage : node tools/regles.mjs > supabase/regles.sql, puis lancer ce fichier dans Supabase après chaque changement de règles.
import { readFileSync } from 'node:fs';
new Function(readFileSync(new URL('../supabase/functions/_shared/rules.js', import.meta.url), 'utf8'))();
const { B, ITEM, RECIPES, reqTier, placeIds, DEFIS } = globalThis.Rules;
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));
const kindOf = (b) => (b.water ? 'water' : b.x != null ? 'cross' : b.shape || 'cube');
const blocks = [], place = [], items = [], recipes = [];
for (const [k, b] of Object.entries(B)) {
  const id = +k, drop = b.drop === undefined ? id : b.drop;
  const solid = !b.water && b.x == null && !b.pass;
  blocks.push(`(${id},${q(b.n)},${b.h === Infinity || b.h === undefined ? 'null' : b.h},${reqTier(id)},${drop ? drop : 'null'},${q(kindOf(b))},${solid},${!!b.top})`);
}
const unobtainable = new Set([11, 12, 73, 74]);
for (const k of Object.keys(B)) { const id = +k, b = B[id]; if (unobtainable.has(id)) continue; if (b.drop !== undefined && b.drop !== id) continue; for (const p of placeIds(id)) place.push(`(${id},${p})`); }
for (const [k, it] of Object.entries(ITEM)) items.push(`(${+k},${q(it.n)},${it.tool || 1},${it.tier || 0},${!!it.nft})`);
for (const r of RECIPES) recipes.push(`(${r.out},${r.n},${q(JSON.stringify(r.need))}::jsonb,${!!r.nft})`);
console.log(`-- Règles du jeu pour l'arbitrage côté serveur. FICHIER GÉNÉRÉ par tools/regles.mjs : ne pas modifier à la main.
-- À relancer dans Supabase (SQL Editor) après chaque changement de supabase/functions/_shared/rules.js.
begin;
delete from public.rule_blocks; delete from public.rule_place; delete from public.rule_items; delete from public.rule_recipes;
insert into public.rule_blocks (id, name, hard, tier, drop_item, kind, solid, top) values
${blocks.join(',\n')};
insert into public.rule_place (item, block) values
${place.join(',\n')};
insert into public.rule_items (id, name, tool, tier, uniq) values
${items.join(',\n')};
insert into public.rule_recipes (out_item, n, need, uniq) values
${recipes.join(',\n')};
-- défis du jour (table créée par 004_objectifs.sql)
delete from public.rule_defis;
insert into public.rule_defis (id, counter, n, title, reward) values
${DEFIS.map(d => `(${d.id},${q(d.c)},${d.n},${q(d.t)},${d.r})`).join(',\n')};
commit;`);
