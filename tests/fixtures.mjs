// Données de test pour tests/sql/scenarios.sql : tronçons générés par le vrai générateur, cases témoins, repères.
import { readFileSync } from 'node:fs';
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
new Function(readFileSync(new URL('../supabase/functions/_shared/world.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../supabase/functions/_shared/rules.js', import.meta.url), 'utf8'))();
const W = globalThis.World;
const out = [];
for (const [cx, cz] of [[0, 0], [1, 0], [2, -1], [-1, 0]])
  out.push(`insert into chunks (world, cx, cz, gen, sy, data) values ('w', ${cx}, ${cz}, ${W.GEN}, ${W.SY}, '${W.encodeChunk(W.genChunk(cx, cz))}');`);
// cases témoins : le décodage SQL doit donner exactement le générateur
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const samples = [];
for (let k = 0; k < 300; k++) {
  const x = Math.floor(rnd() * 48) - 16, z = Math.floor(rnd() * 16), y = Math.floor(rnd() * W.SY);
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  samples.push(`(${x},${y},${z},${W.genChunk(cx, cz)[W.li(x - cx * 16, y, z - cz * 16)]})`);
}
out.push(`create table samples (x int, y int, z int, v int); insert into samples values ${samples.join(',')};`);
// repères : sol herbeux en (20, 3), granite dessous, validateur éteint de la première ruine
const col = (x, z) => { const cx = Math.floor(x / 16), cz = Math.floor(z / 16), a = W.genChunk(cx, cz); return (y) => a[W.li(x - cx * 16, y, z - cz * 16)]; };
const c = col(20, 3); let gy = 0; for (let y = W.SY - 1; y > 0; y--) { const v = c(y); if (v && v !== 20 && !(v >= 17 && v <= 19) && ![5, 6, 7].includes(v)) { gy = y; break; } }
const stones = []; for (let y = gy - 1; y > 0 && stones.length < 6; y--) if (c(y) === 3) stones.push(y);
const r = W.ruinAt(0, 0);
out.push(`create table fixtures (k text primary key, v int); insert into fixtures values ('gy', ${gy}), ('gid', ${c(gy)}), ('s1', ${stones[0]}), ('s2', ${stones[1]}), ('s3', ${stones[2]}), ('rx', ${r.x}), ('ry', ${r.y + 1}), ('rz', ${r.z});`);
// défis du jour attendus selon rules.js, à comparer au tirage du serveur
const R = globalThis.Rules;
out.push(`insert into fixtures values ${R.defisDuJour().map((d, j) => `('defi${j}', ${d.id})`).join(', ')};`);
console.log(out.join('\n'));
