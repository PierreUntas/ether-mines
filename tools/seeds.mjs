// Looks for world seeds with a pleasant starting area: plains at the sanctuary, gentle terrain, sea nearby,
// healthy ground under the City. Usage: node tools/seeds.mjs [count]
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../supabase/functions/_shared/world.js', import.meta.url), 'utf8');
const res = [];
for (let g = 1; g <= +(process.argv[2] || 400); g++) {
  globalThis.__SEED = Math.imul(g, 2654435761) | 0;
  new Function(src)();
  const W = globalThis.World,
    { SPAWN: S, SEA, DY, CITY } = W;
  let ok = true,
    plain = 0,
    n = 0,
    hmin = 99,
    hmax = 0;
  for (let dx = -28; dx <= 28 && ok; dx += 4)
    for (let dz = -28; dz <= 28; dz += 4) {
      const h = W.heightAt(S.x + dx, S.z + dz);
      n++;
      if (W.biome(S.x + dx, S.z + dz) === 'plain') plain++;
      hmin = Math.min(hmin, h);
      hmax = Math.max(hmax, h);
      if (h <= SEA + 1 && Math.hypot(dx, dz) < 26) {
        ok = false;
        break;
      }
    }
  if (!ok || hmax - hmin > 10 || plain / n < 0.6 || W.biome(S.x, S.z) !== 'plain') continue;
  let cmin = 99,
    cmax = 0;
  for (let dx = -30; dx <= 30; dx += 5)
    for (let dz = -30; dz <= 30; dz += 5) {
      const h = W.heightAt(CITY.x + dx, CITY.z + dz);
      cmin = Math.min(cmin, h);
      cmax = Math.max(cmax, h);
    }
  if (cmin <= SEA + 1 || cmax - cmin > 11 || cmax > DY + 28) continue;
  let sea = 999;
  for (let a = 0; a < 32; a++)
    for (let r = 40; r <= 110; r += 10) {
      const x = S.x + Math.cos((a / 32) * 6.283) * r,
        z = S.z + Math.sin((a / 32) * 6.283) * r;
      if (W.heightAt(Math.round(x), Math.round(z)) < SEA) sea = Math.min(sea, r);
    }
  if (sea > 90) continue;
  const h203 = W.heightAt(20, 3);
  if (W.biome(20, 3) === 'dunes' || h203 <= SEA + 1) continue;
  if (!W.ruinAt(0, 0)) continue;
  res.push({ seed: globalThis.__SEED, relief: hmax - hmin, city: cmax - cmin, sea, plain: +(plain / n).toFixed(2) });
}
console.log(res.sort((a, b) => a.relief + a.city - (b.relief + b.city)).slice(0, 12));
