// Public keys for the Supabase project (Settings → API).
// The "anon" key is meant to be public: the database is protected by the rules in supabase/migrations/.
// Leave empty = solo mode, no connection.
window.CONFIG = {
  SUPABASE_URL: 'https://euytymfcncakzqzdynbq.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXR5bWZjbmNha3pxemR5bmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzIwNjksImV4cCI6MjEwNjM0ODA2OX0.fqVxk4YpTVJctgrr7wcf8iAzwduI8JUcm6mxL75kmog',
  // the game server (server/): real time through it once it's deployed, e.g. 'wss://ethermines-game.fly.dev'.
  // Empty: real time through Supabase's channels, as before.
  GAME_SERVER: 'wss://ethermines-game.fly.dev',
  // buying the premium pieces with euros (Stripe, 050_purchases.sql): 'test' opens it in test worlds only
  // (Stripe's test mode, fake cards), 'live' everywhere, '' nowhere. Stripe's secret keys never go here:
  // they're Supabase secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
  PAYMENTS: 'test',
  // the home page's and the title screen's links (empty: "coming soon" on the home page, not shown in the
  // game): the apps once they're in the stores, the trailer, the Discord, Steam
  APP_STORE_URL: '',
  PLAY_STORE_URL: '',
  TRAILER_URL: '',
  DISCORD_URL: '',
  STEAM_URL: '', // the Mac and PC version, later
};
