// Clés publiques du projet Supabase (Settings → API).
// La clé « anon » est faite pour être publique : la base est protégée par les règles de supabase/migrations/.
// Laisser vide = mode solo, sans connexion.
window.CONFIG = {
  SUPABASE_URL: 'https://euytymfcncakzqzdynbq.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXR5bWZjbmNha3pxemR5bmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzIwNjksImV4cCI6MjEwNjM0ODA2OX0.fqVxk4YpTVJctgrr7wcf8iAzwduI8JUcm6mxL75kmog',
  // Couche web3 (validateurs uniquement, Sepolia) : laisser vide tant que les contrats ne sont pas déployés
  // (étape 6) — les écrans correspondants se désactivent proprement. SEPOLIA_RPC_URL : un point d'accès
  // public (ex. https://ethereum-sepolia-rpc.publicnode.com), en lecture seule, jamais de clé privée ici.
  SEPOLIA_RPC_URL: '',
  SCEAU_ADDRESS: '',
  RESEAU_ADDRESS: '',
};
