// Public keys for the Supabase project (Settings → API).
// The "anon" key is meant to be public: the database is protected by the rules in supabase/migrations/.
// Leave empty = solo mode, no connection.
window.CONFIG = {
  SUPABASE_URL: 'https://euytymfcncakzqzdynbq.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXR5bWZjbmNha3pxemR5bmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzIwNjksImV4cCI6MjEwNjM0ODA2OX0.fqVxk4YpTVJctgrr7wcf8iAzwduI8JUcm6mxL75kmog',
  // Web3 layer (validators only, Sepolia): leave empty until the contracts are deployed
  // (step 6) — the matching screens disable themselves cleanly. SEPOLIA_RPC_URL: a
  // public, read-only endpoint (e.g. https://ethereum-sepolia-rpc.publicnode.com), never a private key here.
  SEPOLIA_RPC_URL: 'https://ethereum-sepolia-rpc.publicnode.com',
  // TODO: fill in after redeploying the renamed contracts (forge script script/Deploy.s.sol --broadcast)
  SEAL_ADDRESS: '',
  NETWORK_ADDRESS: '',
};
