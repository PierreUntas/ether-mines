// The payment functions' Stripe helpers (supabase/functions/_shared/stripe.js): the webhook signature,
// the form encoding, the return addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

new Function(readFileSync(new URL('../supabase/functions/_shared/stripe.js', import.meta.url), 'utf8'))();
const Kit = globalThis.StripeKit;
const secret = 'whsec_test_secret';
const sign = (body, t, key = secret) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;

test('the webhook signature: only our secret, only recent', async () => {
  const body = '{"type":"checkout.session.completed"}';
  const now = 1_800_000_000;
  assert.equal(await Kit.verify(body, sign(body, now), secret, now), true);
  assert.equal(await Kit.verify(body, `${sign(body, now, 'other')},v1=00`, secret, now), false, 'another secret');
  assert.equal(await Kit.verify(body + ' ', sign(body, now), secret, now), false, 'a changed body');
  assert.equal(await Kit.verify(body, sign(body, now - 600), secret, now), false, 'too old: a replay');
  assert.equal(await Kit.verify(body, `${sign(body, now)},v1=abc`, secret, now), true, 'one good v1 among several');
  assert.equal(await Kit.verify(body, null, secret, now), false);
  assert.equal(await Kit.verify(body, sign(body, now), '', now), false, 'no secret set: refuse everything');
});

test("Stripe's form fields, nested with brackets", () => {
  const f = Kit.form({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: 499 } }], skip: null });
  assert.equal(decodeURIComponent(f), 'mode=payment&line_items[0][quantity]=1&line_items[0][price_data][currency]=eur&line_items[0][price_data][unit_amount]=499');
});

test("Stripe only sends the player back to the game's own sites", () => {
  assert.equal(Kit.safeReturn('https://ethermines.org/?monde=x'), 'https://ethermines.org/');
  assert.equal(Kit.safeReturn('https://ether-mines-git-shop-pierre.vercel.app/index.html'), 'https://ether-mines-git-shop-pierre.vercel.app/index.html');
  assert.equal(Kit.safeReturn('http://localhost:8000/'), 'http://localhost:8000/');
  assert.equal(Kit.safeReturn('https://ethermines.org.evil.com/'), null);
  assert.equal(Kit.safeReturn('http://ethermines.org/'), null);
  assert.equal(Kit.safeReturn('javascript:alert(1)'), null);
  assert.equal(Kit.safeReturn('nonsense'), null);
});

test('a premium set: its price, and the share left when some pieces are owned (same as 051_premium_sets.sql)', () => {
  new Function(readFileSync(new URL('../supabase/functions/_shared/rules.js', import.meta.url), 'utf8'))();
  const { setPrice, setPieces, SET_EUR, COSMETICS } = globalThis.Rules;
  for (const set of Object.keys(SET_EUR)) {
    const full = setPieces(set).reduce((t, id) => t + COSMETICS[id].eur, 0);
    assert.ok(SET_EUR[set] < full, `${set}: the set costs less than its pieces`);
    assert.equal(setPrice(set), SET_EUR[set]);
    assert.equal(setPrice(set, () => true), 0);
  }
  assert.equal(setPrice('pow', id => id === 108), Math.round((1299 * (1795 - 299)) / 1795));
});
