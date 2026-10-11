// Ether Mines · Web3 layer (validators only): direct read of Seal and Network on Sepolia
// (no wallet, just a public RPC endpoint), and linking a wallet to mint/attest/claim.
// Nothing here sends a transaction: that stays the job of the "chain" Edge Function (the operator pays the gas).
window.Chain = (() => {
  const cfg = window.CONFIG || {};
  const enabled = !!(cfg.SEPOLIA_RPC_URL && cfg.SEAL_ADDRESS && cfg.NETWORK_ADDRESS);

  // Message to sign to link a wallet — must stay identical to the one checked by the "link-wallet" Edge Function.
  const message = nonce => `Ether Mines — link this wallet to my account.\nNonce: ${nonce}`;

  async function connectWallet() {
    if (!window.ethereum) throw new Error('no wallet detected (install MetaMask or a compatible wallet)');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) throw new Error('no account authorized');
    return accounts[0];
  }
  const sign = (address, msg) => window.ethereum.request({ method: 'personal_sign', params: [msg, address] });

  // Read-only call (eth_call), uint256 arguments already hex-encoded (32 bytes, no 0x).
  const pad32 = hex => hex.replace(/^0x/, '').padStart(64, '0');
  const u256 = n => pad32(BigInt(n).toString(16));
  async function call(to, selector, argsHex) {
    const res = await fetch(cfg.SEPOLIA_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data: selector + argsHex.join('') }, 'latest'] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'eth_call refused');
    return j.result;
  }
  const toBigInt = hex => BigInt(hex || '0x0');
  const toBool = hex => toBigInt(hex) !== 0n;

  // Selectors precomputed (cast sig "…"): no need for keccak256 client-side for these simple reads.
  const currentEpoch = async () => toBigInt(await call(cfg.NETWORK_ADDRESS, '0x6c9a559f', []));
  const hasAttested = async (epoch, tokenId) => toBool(await call(cfg.NETWORK_ADDRESS, '0xd61ed0ba', [u256(epoch), u256(tokenId)]));
  const hasClaimed = async (epoch, tokenId) => toBool(await call(cfg.NETWORK_ADDRESS, '0x867249f2', [u256(epoch), u256(tokenId)]));
  const reward = async epoch => toBigInt(await call(cfg.NETWORK_ADDRESS, '0x2ca39e33', [u256(epoch)]));

  const etherscanTx = hash => `https://sepolia.etherscan.io/tx/${hash}`;
  const etherscanToken = tokenId => `https://sepolia.etherscan.io/token/${cfg.SEAL_ADDRESS}?a=${tokenId}`;
  const eth = wei => (Number(wei) / 1e18).toFixed(6).replace(/\.?0+$/, '') + ' ETH';
  const short = address => (address ? address.slice(0, 6) + '…' + address.slice(-4) : '');

  return {
    enabled,
    message,
    connectWallet,
    sign,
    currentEpoch,
    hasAttested,
    hasClaimed,
    reward,
    etherscanTx,
    etherscanToken,
    eth,
    short,
  };
})();
