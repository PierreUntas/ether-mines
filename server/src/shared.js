// The game's own scripts, shared with the browser: the world generator, the rules (blocks, items), the
// block shapes (mesh.js: which blocks are solid) and the mobs' logic. They are classic scripts that set
// globalThis.World, Rules, Mesh and MobsCore. In the repository they are read where they live; in the
// server's image (Dockerfile), the deploy copies them into server/shared/ first (.gitlab-ci.yml).
import { readFileSync, existsSync } from 'node:fs';

const FILES = [
  ['world.js', '../../supabase/functions/_shared/world.js'],
  ['rules.js', '../../supabase/functions/_shared/rules.js'],
  ['mesh.js', '../../src/mesh.js'],
  ['mobs-core.js', '../../src/mobs-core.js'],
];
for (const [name, repo] of FILES) {
  if (globalThis.MobsCore && name === 'mobs-core.js') break; // already loaded (the tests load them too)
  const local = new URL('../shared/' + name, import.meta.url),
    file = existsSync(local) ? local : new URL(repo, import.meta.url);
  if (name === 'world.js' && globalThis.World) continue;
  if (name === 'rules.js' && globalThis.Rules) continue;
  if (name === 'mesh.js' && globalThis.Mesh) continue;
  new Function(readFileSync(file, 'utf8'))();
}
export const { World, Rules, Mesh, MobsCore } = globalThis;
