// Public keys for the Supabase project (Settings → API).
// The "anon" key is meant to be public: the database is protected by the rules in supabase/migrations/.
// Leave empty = solo mode, no connection.
window.CONFIG = {
  SUPABASE_URL: 'https://euytymfcncakzqzdynbq.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXR5bWZjbmNha3pxemR5bmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzIwNjksImV4cCI6MjEwNjM0ODA2OX0.fqVxk4YpTVJctgrr7wcf8iAzwduI8JUcm6mxL75kmog',
  // Web3 layer (validators only, Sepolia). Leaving these three empty disables the matching
  // screens cleanly. SEPOLIA_RPC_URL: a public, read-only endpoint, never a private key here.
  SEPOLIA_RPC_URL: 'https://ethereum-sepolia-rpc.publicnode.com',
  SEAL_ADDRESS: '0x73215D0e62E16a64A0110889867Cd7EF460F1D4B',
  NETWORK_ADDRESS: '0xE70104D3786c2DE304E0635d27BD8c3e4De48e23',
};
