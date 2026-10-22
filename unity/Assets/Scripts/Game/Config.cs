// Ether Mines · where the servers are: the same Supabase project and game server as the web version
// (src/config.js). The anon key is public by design: the database is guarded by its own rules
// (supabase/migrations). Never put a service_role key or any secret here.
namespace EtherMines.Game
{
    public static class Config
    {
        public const string SupabaseUrl = "https://euytymfcncakzqzdynbq.supabase.co";
        public const string SupabaseAnonKey =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXR5bWZjbmNha3pxemR5bmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzIwNjksImV4cCI6MjEwNjM0ODA2OX0.fqVxk4YpTVJctgrr7wcf8iAzwduI8JUcm6mxL75kmog";
        public const string GameServer = "wss://ethermines-game.fly.dev";
        // the players' world (never test on it); a test world is any other name, e.g. "test-unity"
        public const string DefaultWorld = "test-unity";
    }
}
