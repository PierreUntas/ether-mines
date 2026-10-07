// Error reporting: every JS error hit by a player who's online is sent to the server (client_errors table),
// once per message and at most 15 per session. In solo mode, nothing is sent.
(() => {
  'use strict';
  const seen = new Set(),
    queue = [];
  let sent = 0;
  function log(msg, stack, src) {
    msg = String(msg || '?').slice(0, 500);
    // browser-extension or third-party script errors: not worth reporting
    if (src && !src.startsWith(location.origin) && !src.includes('/src/') && !src.includes('/supabase/')) return;
    if (seen.has(msg) || sent + queue.length >= 15) return;
    seen.add(msg);
    queue.push([msg, stack ? String(stack).slice(0, 2000) : null, src || location.pathname]);
  }
  addEventListener('error', e => log(e.message, e.error && e.error.stack, e.filename));
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    log('rejected promise: ' + ((r && r.message) || r), r && r.stack);
  });
  setInterval(() => {
    if (!queue.length || !window.Net || !Net.userId) return;
    const [msg, stack, src] = queue.shift();
    sent++;
    Net.logError(msg, stack, src);
  }, 3000);
  window.logError = log;
})();
