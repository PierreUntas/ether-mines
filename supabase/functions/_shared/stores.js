// The App Store and Google Play, without their libraries: what the "iap-verify" function needs to check an
// in-app purchase with Apple's or Google's own servers (052_store_purchases.sql). Plain script like
// stripe.js: it sets globalThis.AppStores, and runs the same in Deno (the Edge Function) and Node
// (tests/stores.test.mjs). Needs rules.js loaded first (STORE_PREFIX, COSMETICS, SETS).
(function () {
  const R = () => globalThis.Rules;
  // a product id from the stores, as rules.js names them: { cosmetic: 107 } or { set: 'pow' }, or null
  function parseProduct(id) {
    const P = R().STORE_PREFIX;
    if (typeof id !== 'string' || !id.startsWith(P)) return null;
    const rest = id.slice(P.length);
    let m = /^piece\.(\d{1,5})$/.exec(rest);
    if (m) {
      const c = R().COSMETICS[+m[1]];
      return c && c.category === 'premium' && c.eur > 0 ? { cosmetic: +m[1] } : null;
    }
    m = /^set\.([a-z0-9_-]{1,24})$/.exec(rest);
    if (m && R().SET_EUR[m[1]]) return { set: m[1] };
    return null;
  }
  // every product the apps sell: the premium pieces, then the premium sets, with their euro price in cents
  function products() {
    const P = R().STORE_PREFIX,
      C = R().COSMETICS,
      out = [];
    for (const id of Object.keys(C)
      .map(Number)
      .sort((a, b) => a - b))
      if (C[id].category === 'premium' && C[id].eur > 0) out.push({ id: P + 'piece.' + id, cosmetic: id, eur: C[id].eur, name: C[id].n });
    for (const [set, eur] of Object.entries(R().SET_EUR)) out.push({ id: P + 'set.' + set, set, eur, name: R().SETS[set][0] + ' set' });
    return out;
  }

  const enc = new TextEncoder();
  const b64url = bytes => {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64urlText = t => b64url(enc.encode(t));
  function fromB64url(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s),
      out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // the claims of a JWS (Apple's signedTransactionInfo), read without checking its signature: only for a
  // JWS fetched from Apple's own server over TLS, with our key, never for one a player sent
  function jwsPayload(jws) {
    const parts = String(jws || '').split('.');
    if (parts.length !== 3) return null;
    try {
      return JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
    } catch {
      return null;
    }
  }
  // a PEM private key (PKCS #8: Apple's .p8, a Google service account's private_key) for WebCrypto
  function pemBytes(pem) {
    const body = String(pem)
      .replace(/\\n/g, '\n')
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s+/g, '');
    return fromB64url(body.replace(/\+/g, '-').replace(/\//g, '_'));
  }
  // a signed JWT: ES256 (Apple's App Store Server API) or RS256 (Google's OAuth for service accounts)
  async function signJwt(alg, header, claims, pem) {
    const params = alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('pkcs8', pemBytes(pem), params, false, ['sign']);
    const input = b64urlText(JSON.stringify({ alg, typ: 'JWT', ...header })) + '.' + b64urlText(JSON.stringify(claims));
    const sig = await crypto.subtle.sign(
      alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' },
      key,
      enc.encode(input),
    );
    return input + '.' + b64url(sig); // WebCrypto's ECDSA signature is already JWS's r || s
  }

  // ---------- Apple: the App Store Server API ----------
  const APPLE = { live: 'https://api.storekit.itunes.apple.com', sandbox: 'https://api.storekit-sandbox.itunes.apple.com' };
  const appleToken = (env, now = Math.floor(Date.now() / 1000)) =>
    signJwt(
      'ES256',
      { kid: env.keyId },
      { iss: env.issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1', bid: env.bundleId },
      env.privateKey,
    );
  // one transaction, as Apple's server knows it: the production server first, the sandbox's when it isn't
  // there (TestFlight and test accounts). { tx, live } or { error }
  async function appleTransaction(env, transactionId, fetchFn = fetch) {
    if (!/^\d{1,20}$/.test(String(transactionId))) return { error: 'invalid transaction' };
    const token = await appleToken(env);
    for (const [which, base] of [
      ['live', APPLE.live],
      ['sandbox', APPLE.sandbox],
    ]) {
      const res = await fetchFn(`${base}/inApps/v1/transactions/${transactionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) continue;
      if (!res.ok) return { error: `apple ${res.status}` };
      const tx = jwsPayload((await res.json()).signedTransactionInfo);
      if (!tx) return { error: 'apple: unreadable transaction' };
      return { tx, live: which === 'live' && tx.environment === 'Production' };
    }
    return { error: 'unknown transaction' };
  }
  // is this Apple transaction a real, unrefunded purchase of ours? { product, live, tx } or { error }
  function checkApple(env, r) {
    if (r.error) return r;
    const t = r.tx;
    if (t.bundleId !== env.bundleId) return { error: 'another app' };
    if (t.revocationDate) return { error: 'refunded' };
    const product = parseProduct(t.productId);
    if (!product) return { error: 'unknown product' };
    return { product, live: r.live, tx: String(t.originalTransactionId || t.transactionId), productId: t.productId };
  }

  // ---------- Google: the Play Developer API ----------
  async function googleToken(account, fetchFn = fetch, now = Math.floor(Date.now() / 1000)) {
    const jwt = await signJwt(
      'RS256',
      {},
      {
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 600,
      },
      account.private_key,
    );
    const res = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
    });
    if (!res.ok) throw new Error('google token ' + res.status);
    return (await res.json()).access_token;
  }
  const playUrl = (pkg, productId, token) =>
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  // one purchase, as Google's server knows it, acknowledged on the way (Google refunds a purchase left
  // unacknowledged for three days). { product, live, tx } or { error }
  async function googlePurchase(env, productId, purchaseToken, fetchFn = fetch) {
    const product = parseProduct(productId);
    if (!product) return { error: 'unknown product' };
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 10 || purchaseToken.length > 4096) return { error: 'invalid purchase' };
    const access = await googleToken(env.account, fetchFn);
    const url = playUrl(env.packageName, productId, purchaseToken);
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 404 || res.status === 410) return { error: 'unknown purchase' };
    if (!res.ok) return { error: `google ${res.status}` };
    const p = await res.json();
    if (p.purchaseState !== 0) return { error: p.purchaseState === 1 ? 'refunded' : 'pending' };
    if (p.acknowledgementState !== 1) {
      const ack = await fetchFn(url + ':acknowledge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!ack.ok) return { error: `google acknowledge ${ack.status}` };
    }
    // purchaseType 0: a licensed tester's purchase (no money): it only counts outside the players' world
    return { product, live: p.purchaseType == null, tx: String(p.orderId || purchaseToken), productId };
  }

  // ---------- refunds the stores tell us about ----------
  // Apple's App Store Server Notifications (v2): a REFUND or REVOKE names a transaction. The notification
  // itself isn't trusted: the transaction is asked again from Apple's server, and only a revocation Apple
  // confirms there counts. The originalTransactionId to take back, or null.
  async function appleRefund(env, body, fetchFn = fetch) {
    const n = jwsPayload(body && body.signedPayload);
    if (!n || !['REFUND', 'REVOKE'].includes(n.notificationType)) return null;
    const t = jwsPayload(n.data && n.data.signedTransactionInfo);
    if (!t || !t.transactionId) return null;
    const r = await appleTransaction(env, t.transactionId, fetchFn);
    if (r.error || !r.tx.revocationDate || r.tx.bundleId !== env.bundleId) return null;
    return String(r.tx.originalTransactionId || r.tx.transactionId);
  }
  // Google's Real-time developer notifications (a Pub/Sub push): a voided purchase names an order. It is
  // looked up in Google's own list of voided purchases before anything is taken back. The orderId, or null.
  async function googleRefund(env, body, fetchFn = fetch) {
    let n;
    try {
      n = JSON.parse(new TextDecoder().decode(fromB64url(body.message.data.replace(/\+/g, '-').replace(/\//g, '_'))));
    } catch {
      return null;
    }
    const v = n && n.voidedPurchaseNotification;
    if (!v || !v.orderId || (n.packageName && n.packageName !== env.packageName)) return null;
    const access = await googleToken(env.account, fetchFn);
    const res = await fetchFn(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.packageName)}/purchases/voidedpurchases?type=0`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    if (!res.ok) return null;
    const list = (await res.json()).voidedPurchases || [];
    return list.some(p => p.orderId === v.orderId) ? String(v.orderId) : null;
  }

  globalThis.AppStores = {
    parseProduct,
    products,
    jwsPayload,
    signJwt,
    appleTransaction,
    checkApple,
    googlePurchase,
    appleRefund,
    googleRefund,
    b64url,
    fromB64url,
  };
})();
