// Tests rapides du générateur et des règles partagés : node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const load = (f) => new Function(readFileSync(new URL('../' + f, import.meta.url), 'utf8'))();
load('supabase/functions/_shared/world.js');
load('supabase/functions/_shared/rules.js');
const W = globalThis.World, R = globalThis.Rules;

test('le générateur est déterministe', () => {
  for (const [cx, cz] of [[0, 0], [5, -3], [-40, 17]]) assert.deepEqual(W.genChunk(cx, cz), W.genChunk(cx, cz));
});

test('encodage des tronçons : aller-retour exact', () => {
  for (const [cx, cz] of [[0, 0], [3, 9], [-12, -7]]) {
    const a = W.genChunk(cx, cz);
    assert.deepEqual(W.decodeChunk(W.encodeChunk(a), W.SY), a);
  }
});

test('socle en bas, rien au-dessus du plafond', () => {
  for (const [cx, cz] of [[0, 0], [8, 8], [-20, 3]]) {
    const a = W.genChunk(cx, cz);
    for (let i = 0; i < W.CH * W.CH; i++) assert.equal(a[i], 12, 'couche 0 = socle');
    assert.equal(a.length, W.CV);
  }
});

test('le sanctuaire et la première ruine existent', () => {
  const s = W.genChunk(W.cOf(W.SPAWN.x), W.cOf(W.SPAWN.z));
  assert.equal(s[W.li(W.SPAWN.x & 15, W.SPAWN.y, W.SPAWN.z & 15)], 13, 'validateur du sanctuaire');
  const r = W.ruinAt(0, 0);
  assert.ok(r, 'ruine dans la région du sanctuaire');
  const a = W.genChunk(W.cOf(r.x), W.cOf(r.z));
  assert.equal(a[W.li(r.x & 15, r.y + 1, r.z & 15)], 73, 'validateur éteint au centre de la ruine');
});

test('règles : chaque recette produit un objet connu, une seule recette par objet', () => {
  const outs = R.RECIPES.map((r) => r.out);
  assert.equal(new Set(outs).size, outs.length, 'sorties de recettes uniques (le serveur les identifie ainsi)');
  for (const r of R.RECIPES) {
    assert.ok(R.B[r.out] || R.ITEM[r.out], `sortie inconnue ${r.out}`);
    for (const k of Object.keys(r.need)) assert.ok(R.B[k] || R.ITEM[k], `ingrédient inconnu ${k}`);
  }
});

test('règles : les objets posables donnent des blocs existants', () => {
  for (const k of Object.keys(R.B)) for (const id of R.placeIds(+k)) assert.ok(R.B[id], `bloc ${id} posé depuis ${k}`);
});

test('supabase/regles.sql est à jour avec rules.js', () => {
  const gen = execFileSync('node', [new URL('../tools/regles.mjs', import.meta.url).pathname]).toString();
  const file = readFileSync(new URL('../supabase/regles.sql', import.meta.url), 'utf8');
  assert.equal(gen.trim(), file.trim(), 'relancer : node tools/regles.mjs > supabase/regles.sql');
});
