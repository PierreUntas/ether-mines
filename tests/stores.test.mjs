// The in-app purchase checks (supabase/functions/_shared/stores.js): product ids, the signed tokens Apple
// and Google ask for, and what counts as a real purchase or refund, against fake Apple and Google servers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';

const load = f => new Function(readFileSync(new URL('../supabase/functions/_shared/' + f, import.meta.url), 'utf8'))();
load('rules.js');
load('stores.js');
const S = globalThis.AppStores;
const P = globalThis.Rules.STORE_PREFIX;

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = k => k.export({ type: 'pkcs8', format: 'pem' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = claims => b64({ alg: 'ES256' }) + '.' + b64(claims) + '.sig';
const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const apple = { keyId: 'K1', issuerId: 'I1', privateKey: pem(ec.privateKey), bundleId: 'org.ethermines.game' };

test('product ids: the premium pieces and sets, nothing else', () => {
  assert.deepEqual(S.parseProduct(P + 'piece.107'), { cosmetic: 107 });
  assert.deepEqual(S.parseProduct(P + 'set.pow'), { set: 'pow' });
  assert.equal(S.parseProduct(P + 'piece.1'), null, 'a Gwei piece is not sold in the stores');
  assert.equal(S.parseProduct(P + 'set.frontier'), null);
  assert.equal(S.parseProduct('com.other.piece.107'), null);
  const all = S.products();
  assert.equal(all.length, 12);
  assert.ok(all.every(p => p.eur > 0 && p.id.startsWith(P)));
});

test('signed tokens: ES256 for Apple, RS256 for Google, both verifiable', async () => {
  for (const [alg, keys, opts] of [
    ['ES256', ec, { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }],
    ['RS256', rsa, rsa.publicKey],
  ]) {
    const t = await S.signJwt(alg, { kid: 'x' }, { iss: 'me', n: 1 }, pem(keys.privateKey));
    const [h, c, sig] = t.split('.');
    assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, alg);
    assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, 'me');
    assert.ok(createVerify('SHA256').update(h + '.' + c).verify(opts, Buffer.from(sig, 'base64url')), alg + ' verifies');
  }
  // a key pasted with literal \n, as a secret often is
  const flat = pem(ec.privateKey).replace(/\n/g, '\\n');
  assert.ok((await S.signJwt('ES256', {}, {}, flat)).split('.').length === 3);
});

test('Apple: production first, then the sandbox; our app, our product, not refunded', async () => {
  const tx = { bundleId: apple.bundleId, productId: P + 'piece.108', transactionId: '2000', originalTransactionId: '1999', environment: 'Sandbox' };
  const seen = [];
  const fake = (over = {}) => async (url, o) => {
    seen.push(url);
    assert.match(o.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    return url.includes('sandbox') ? resp(200, { signedTransactionInfo: jws({ ...tx, ...over }) }) : resp(404, {});
  };
  const r = S.checkApple(apple, await S.appleTransaction(apple, '2000', fake()));
  assert.deepEqual(r, { product: { cosmetic: 108 }, live: false, tx: '1999', productId: P + 'piece.108' });
  assert.equal(seen.length, 2);
  assert.equal(S.checkApple(apple, await S.appleTransaction(apple, '2000', fake({ revocationDate: 1 }))).error, 'refunded');
  assert.equal(S.checkApple(apple, await S.appleTransaction(apple, '2000', fake({ bundleId: 'x' }))).error, 'another app');
  assert.equal(S.checkApple(apple, await S.appleTransaction(apple, '2000', fake({ productId: 'x' }))).error, 'unknown product');
  assert.equal((await S.appleTransaction(apple, '../x', fake())).error, 'invalid transaction');
});

test('Google: a real purchase is acknowledged; a refunded one is refused', async () => {
  const account = { client_email: 'svc@x.iam.gserviceaccount.com', private_key: pem(rsa.privateKey) };
  const env = { account, packageName: 'org.ethermines.game' };
  const calls = [];
  const fake = purchase => async (url, o = {}) => {
    calls.push([o.method || 'GET', url]);
    if (url.startsWith('https://oauth2')) return resp(200, { access_token: 'tok' });
    if (url.endsWith(':acknowledge')) return resp(204, {});
    return resp(200, purchase);
  };
  const r = await S.googlePurchase(env, P + 'set.pos', 'token-1234567890', fake({ purchaseState: 0, acknowledgementState: 0, orderId: 'GPA.1', purchaseType: 0 }));
  assert.deepEqual(r, { product: { set: 'pos' }, live: false, tx: 'GPA.1', productId: P + 'set.pos' });
  assert.ok(calls.some(([m, u]) => m === 'POST' && u.endsWith(':acknowledge')));
  assert.equal((await S.googlePurchase(env, P + 'set.pos', 'token-1234567890', fake({ purchaseState: 1 }))).error, 'refunded');
  assert.equal((await S.googlePurchase(env, P + 'piece.1', 'token-1234567890', fake({}))).error, 'unknown product');
  assert.equal((await S.googlePurchase(env, P + 'piece.107', 'token-1234567890', fake({ purchaseState: 0, acknowledgementState: 1, orderId: 'GPA.2' }))).live, true);
});

test('refunds: only once the store itself confirms them', async () => {
  const note = type => ({ signedPayload: jws({ notificationType: type, data: { signedTransactionInfo: jws({ transactionId: '2000' }) } }) });
  const fake = revoked => async url =>
    url.includes('sandbox') ? resp(404, {}) : resp(200, { signedTransactionInfo: jws({ bundleId: apple.bundleId, transactionId: '2000', originalTransactionId: '1999', environment: 'Production', ...(revoked ? { revocationDate: 5 } : {}) }) });
  assert.equal(await S.appleRefund(apple, note('REFUND'), fake(true)), '1999');
  assert.equal(await S.appleRefund(apple, note('REFUND'), fake(false)), null, 'a refund Apple does not confirm');
  assert.equal(await S.appleRefund(apple, note('DID_RENEW'), fake(true)), null);
  const account = { client_email: 'svc@x', private_key: pem(rsa.privateKey) };
  const push = orderId => ({ message: { data: Buffer.from(JSON.stringify({ packageName: 'org.ethermines.game', voidedPurchaseNotification: { orderId } })).toString('base64') } });
  const gfake = async url => (url.startsWith('https://oauth2') ? resp(200, { access_token: 't' }) : resp(200, { voidedPurchases: [{ orderId: 'GPA.9' }] }));
  const genv = { account, packageName: 'org.ethermines.game' };
  assert.equal(await S.googleRefund(genv, push('GPA.9'), gfake), 'GPA.9');
  assert.equal(await S.googleRefund(genv, push('GPA.1'), gfake), null);
});
