// Stripe, without its library: the two things the payment functions need (supabase/functions/checkout and
// stripe-webhook). Plain script like world.js and rules.js: it sets globalThis.StripeKit, and runs the same
// in Deno (the Edge Functions) and Node (tests/stripe.test.mjs).
(function () {
  // Stripe's API takes form fields, nested with brackets: line_items[0][price_data][currency]=eur
  function form(obj, prefix, out) {
    out = out || [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if (typeof v === 'object') form(v, key, out);
      else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
    }
    return out.join('&');
  }

  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function hmac(secret, text) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  }
  function same(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // The Stripe-Signature header: "t=<unix time>,v1=<hex HMAC of 't.body'>" (several v1 while a secret rolls).
  // True only for a body signed with our secret less than `tolerance` seconds ago.
  async function verify(body, header, secret, nowSec, tolerance) {
    if (!header || !secret) return false;
    let t = null;
    const sigs = [];
    for (const part of String(header).split(',')) {
      const i = part.indexOf('=');
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k === 't') t = Number(v);
      else if (k === 'v1') sigs.push(v);
    }
    if (!Number.isFinite(t) || !sigs.length) return false;
    if (Math.abs(nowSec - t) > (tolerance || 300)) return false;
    const want = await hmac(secret, `${t}.${body}`);
    return sigs.some(s => same(s, want));
  }

  // where Stripe may send the player back: the game's own sites only (no open redirect)
  function safeReturn(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const h = u.hostname;
    const ok =
      (u.protocol === 'https:' &&
        (h === 'ethermines.org' || h === 'www.ethermines.org' || /^ether-mines[a-z0-9-]*\.vercel\.app$/.test(h))) ||
      ((u.protocol === 'http:' || u.protocol === 'https:') && (h === 'localhost' || h === '127.0.0.1'));
    return ok ? u.origin + u.pathname : null;
  }

  globalThis.StripeKit = { form, verify, hmac, safeReturn };
})();
