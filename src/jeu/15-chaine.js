// Mines d'Éther · Couche web3 (validateurs uniquement) : lecture directe de Sceau et Réseau sur Sepolia
// (sans wallet, juste un point d'accès RPC public), et liaison d'un wallet pour frapper/attester/réclamer.
// Rien ici n'envoie de transaction : ça reste le rôle de l'Edge Function « chaine » (l'opérateur paie le gaz).
window.Chaine = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SEPOLIA_RPC_URL && cfg.SCEAU_ADDRESS && cfg.RESEAU_ADDRESS);

  // Message à signer pour lier un wallet — doit rester identique à celui vérifié par l'Edge Function « lier-wallet ».
  const message = nonce => `Mines d'Éther — lier ce wallet à mon compte.\nNonce : ${nonce}`;

  async function connecterWallet() {
    if (!window.ethereum) throw new Error('aucun wallet détecté (installe MetaMask ou un portefeuille compatible)');
    const comptes = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!comptes || !comptes[0]) throw new Error('aucun compte autorisé');
    return comptes[0];
  }
  const signer = (adresse, msg) => window.ethereum.request({ method: 'personal_sign', params: [msg, adresse] });

  // Appel en lecture seule (eth_call), arguments uint256 déjà encodés en hexadécimal (32 octets, sans 0x).
  const pad32 = hex => hex.replace(/^0x/, '').padStart(64, '0');
  const u256 = n => pad32(BigInt(n).toString(16));
  async function call(to, selector, argsHex) {
    const res = await fetch(cfg.SEPOLIA_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data: selector + argsHex.join('') }, 'latest'] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'eth_call refusé');
    return j.result;
  }
  const toBigInt = hex => BigInt(hex || '0x0');
  const toBool = hex => toBigInt(hex) !== 0n;

  // Sélecteurs figés à l'avance (cast sig "…") : pas besoin de keccak256 côté client pour ces lectures simples.
  const epoqueActuelle = async () => toBigInt(await call(cfg.RESEAU_ADDRESS, '0x6c9a559f', []));
  const aAttest = async (epoque, tokenId) => toBool(await call(cfg.RESEAU_ADDRESS, '0xd61ed0ba', [u256(epoque), u256(tokenId)]));
  const reclame = async (epoque, tokenId) => toBool(await call(cfg.RESEAU_ADDRESS, '0x867249f2', [u256(epoque), u256(tokenId)]));
  const recompense = async epoque => toBigInt(await call(cfg.RESEAU_ADDRESS, '0x2ca39e33', [u256(epoque)]));

  const etherscanTx = hash => `https://sepolia.etherscan.io/tx/${hash}`;
  const etherscanToken = tokenId => `https://sepolia.etherscan.io/token/${cfg.SCEAU_ADDRESS}?a=${tokenId}`;
  const eth = wei => (Number(wei) / 1e18).toFixed(6).replace(/\.?0+$/, '') + ' ETH';
  const courte = adresse => (adresse ? adresse.slice(0, 6) + '…' + adresse.slice(-4) : '');

  return {
    enabled,
    message,
    connecterWallet,
    signer,
    epoqueActuelle,
    aAttest,
    reclame,
    recompense,
    etherscanTx,
    etherscanToken,
    eth,
    courte,
  };
})();
