// The Unity client (unity/) reads the game rules from unity/Assets/Resources/rules.json, exported from
// rules.js: it must be rebuilt when the rules change (node unity/tools/export-rules.mjs).
// The C# core's own checks against the JavaScript run with dotnet: cd unity/CoreTests && dotnet run -c Release
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('unity rules.json is up to date (node unity/tools/export-rules.mjs)', () => {
  const tool = new URL('../unity/tools/export-rules.mjs', import.meta.url).pathname;
  assert.doesNotThrow(() => execFileSync(process.execPath, [tool, '--check'], { encoding: 'utf8', stdio: 'pipe' }));
});

test('unity mobs.json is up to date (node unity/tools/export-mobs.mjs)', () => {
  const tool = new URL('../unity/tools/export-mobs.mjs', import.meta.url).pathname;
  assert.doesNotThrow(() => execFileSync(process.execPath, [tool, '--check'], { encoding: 'utf8', stdio: 'pipe' }));
});

test('unity news.json is up to date (node unity/tools/export-news.mjs)', () => {
  const tool = new URL('../unity/tools/export-news.mjs', import.meta.url).pathname;
  assert.doesNotThrow(() => execFileSync(process.execPath, [tool, '--check'], { encoding: 'utf8', stdio: 'pipe' }));
});

test('unity animals.json is up to date (node unity/tools/export-animals.mjs)', () => {
  const tool = new URL('../unity/tools/export-animals.mjs', import.meta.url).pathname;
  assert.doesNotThrow(() => execFileSync(process.execPath, [tool, '--check'], { encoding: 'utf8', stdio: 'pipe' }));
});
