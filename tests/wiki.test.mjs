// The players' wiki (wiki.html) is built from the game's data: it must be rebuilt when that data changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('wiki.html is up to date (node tools/wiki.mjs > wiki.html)', () => {
  const built = execFileSync(process.execPath, [new URL('../tools/wiki.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(readFileSync(new URL('../wiki.html', import.meta.url), 'utf8'), built);
  assert.match(built, /Genesis/);
  assert.match(built, /Proof-of-Work/);
});
