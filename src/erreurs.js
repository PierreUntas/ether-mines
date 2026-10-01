// Remontée des erreurs : chaque erreur JavaScript d'un joueur en ligne est envoyée au serveur (table client_errors),
// une seule fois par message et 15 au plus par session. En solo, rien ne part.
(() => {
  'use strict';
  const vues = new Set(),
    file = [];
  let envoyees = 0;
  function noter(msg, stack, src) {
    msg = String(msg || '?').slice(0, 500);
    // erreurs d'extensions du navigateur ou de scripts tiers : sans intérêt
    if (src && !src.startsWith(location.origin) && !src.includes('/src/') && !src.includes('/supabase/')) return;
    if (vues.has(msg) || envoyees + file.length >= 15) return;
    vues.add(msg);
    file.push([msg, stack ? String(stack).slice(0, 2000) : null, src || location.pathname]);
  }
  addEventListener('error', e => noter(e.message, e.error && e.error.stack, e.filename));
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    noter('promesse rejetée : ' + ((r && r.message) || r), r && r.stack);
  });
  setInterval(() => {
    if (!file.length || !window.Net || !Net.userId) return;
    const [msg, stack, src] = file.shift();
    envoyees++;
    Net.logError(msg, stack, src);
  }, 3000);
  window.noterErreur = noter;
})();
