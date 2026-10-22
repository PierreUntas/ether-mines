// Ether Mines · the database's own feed (Supabase Realtime, as net.js join() hears it through supabase-js):
// every block a player mines or places in this world, and the chat. The database is the authority: what
// arrives here was accepted by an act_* function. Phoenix protocol over one WebSocket: a join on the
// world's topic with its postgres_changes, a heartbeat every 25 s, the session token when it's renewed.
using System;
using System.Collections.Generic;
using EtherMines.Core;

namespace EtherMines.Game
{
    public sealed class Realtime
    {
        public event Action<BlockEdit> Block;
        public event Action<string, string, string, string> Chat; // user id, name, color, text
        public event Action Restored;                             // the world was put back as generated
        public event Action<string, Dictionary<string, object>, Dictionary<string, object>> Claim; // INSERT/UPDATE/DELETE, new row, old row
        public event Action<int, int, int, string> Sign;           // a sign's text ("" when cleared)
        public string Status = "";
        public bool Joined { get; private set; }
        public string Url = Config.SupabaseUrl.Replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + Config.SupabaseAnonKey + "&vsn=1.0.0";

        readonly string world, topic;
        readonly Func<System.Threading.Tasks.Task<string>> token;
        Socket sock;
        bool connecting;
        float beatT, retryT;
        int refN, retries;
        string sentToken;

        public Realtime(string world, Func<System.Threading.Tasks.Task<string>> token)
        {
            this.world = world;
            this.token = token;
            topic = "realtime:world:" + world + ":unity";
        }

        string Ref() => (++refN).ToString();

        async void Connect()
        {
            connecting = true;
            try
            {
                var tk = await token();
                sock = await Socket.Connect(Url);
                var filter = "world=eq." + world;
                var changes = new List<object>
                {
                    new Dictionary<string, object> { ["event"] = "*", ["schema"] = "public", ["table"] = "blocks", ["filter"] = filter },
                    new Dictionary<string, object> { ["event"] = "INSERT", ["schema"] = "public", ["table"] = "chat", ["filter"] = filter },
                    new Dictionary<string, object> { ["event"] = "*", ["schema"] = "public", ["table"] = "world_restores", ["filter"] = filter },
                    new Dictionary<string, object> { ["event"] = "*", ["schema"] = "public", ["table"] = "claims", ["filter"] = filter },
                    new Dictionary<string, object> { ["event"] = "*", ["schema"] = "public", ["table"] = "signs", ["filter"] = filter },
                };
                var r = Ref();
                sentToken = tk;
                sock.Send(MiniJson.Write(new Dictionary<string, object>
                {
                    ["topic"] = topic, ["event"] = "phx_join", ["ref"] = r, ["join_ref"] = r,
                    ["payload"] = new Dictionary<string, object>
                    {
                        ["config"] = new Dictionary<string, object>
                        {
                            ["broadcast"] = new Dictionary<string, object> { ["self"] = false },
                            ["presence"] = new Dictionary<string, object> { ["key"] = "" },
                            ["postgres_changes"] = changes,
                        },
                        ["access_token"] = tk,
                    },
                }));
                beatT = 25;
                Status = "joining";
            }
            catch (Exception e)
            {
                Status = "realtime: " + e.Message;
                sock = null;
                retryT = Math.Min(30, 2 << Math.Min(retries++, 4));
            }
            finally { connecting = false; }
        }

        // called every frame by the game: reads what arrived, keeps the connection alive
        public void Tick(float dt)
        {
            if (sock == null)
            {
                if (!connecting && (retryT -= dt) <= 0) Connect();
                return;
            }
            while (sock.TryRead(out var raw)) Handle(raw);
            if (sock.Closed)
            {
                Joined = false;
                Status = "realtime lost: " + sock.CloseReason;
                sock.Dispose();
                sock = null;
                retryT = Math.Min(30, 2 << Math.Min(retries++, 4));
                return;
            }
            if ((beatT -= dt) <= 0)
            {
                beatT = 25;
                sock.Send(MiniJson.Write(new Dictionary<string, object> { ["topic"] = "phoenix", ["event"] = "heartbeat", ["payload"] = new Dictionary<string, object>(), ["ref"] = Ref() }));
                RenewToken();
            }
        }

        async void RenewToken()
        {
            try
            {
                var tk = await token();
                if (tk == sentToken || sock == null) return;
                sentToken = tk;
                sock.Send(MiniJson.Write(new Dictionary<string, object> { ["topic"] = topic, ["event"] = "access_token", ["payload"] = new Dictionary<string, object> { ["access_token"] = tk }, ["ref"] = Ref() }));
            }
            catch (Exception) { }
        }

        void Handle(string raw)
        {
            if (!(MiniJson.Parse(raw) is Dictionary<string, object> m)) return;
            var ev = m.TryGetValue("event", out var e) ? e as string : null;
            var payload = m.TryGetValue("payload", out var p) ? p as Dictionary<string, object> : null;
            if (ev == "phx_reply" && (m["topic"] as string) == topic && payload != null && (payload["status"] as string) != "ok")
                Status = "realtime refused: " + MiniJson.Write(payload.TryGetValue("response", out var resp) ? resp : null);
            else if (ev == "phx_reply" && (m["topic"] as string) == topic && !Joined) { Joined = true; retries = 0; Status = "live"; }
            else if (ev == "phx_error" || ev == "phx_close") { Status = "realtime closed"; sock?.Dispose(); }
            else if (ev == "system" && payload != null && (payload.TryGetValue("status", out var st) ? st as string : "") == "error")
                Status = "realtime: " + (payload.TryGetValue("message", out var msg) ? msg as string : "error");
            else if (ev == "postgres_changes" && payload != null && payload.TryGetValue("data", out var d) && d is Dictionary<string, object> data)
                Change(data);
        }

        void Change(Dictionary<string, object> data)
        {
            var table = data.TryGetValue("table", out var t) ? t as string : null;
            var type = data.TryGetValue("type", out var ty) ? ty as string : null;
            var rec = data.TryGetValue("record", out var r) ? r as Dictionary<string, object> : null;
            var old = data.TryGetValue("old_record", out var orr) ? orr as Dictionary<string, object> : null;
            if (table == "claims") { Claim?.Invoke(type, rec, old); return; }
            if (table == "signs")
            {
                var s = type == "DELETE" ? old : rec;
                if (s != null && s.ContainsKey("x")) Sign?.Invoke(MiniJson.ToInt(s["x"]), MiniJson.ToInt(s["y"]), MiniJson.ToInt(s["z"]), type == "DELETE" ? "" : (s.TryGetValue("text", out var tx) ? tx as string : "") ?? "");
                return;
            }
            if (rec == null || type == "DELETE") return;
            if (table == "blocks" && rec.ContainsKey("x"))
                Block?.Invoke(new BlockEdit
                {
                    X = MiniJson.ToInt(rec["x"]), Y = MiniJson.ToInt(rec["y"]), Z = MiniJson.ToInt(rec["z"]), Id = MiniJson.ToInt(rec["id"]),
                    PlacedBy = rec.TryGetValue("placed_by", out var pb) ? pb as string : null,
                    PlacedName = rec.TryGetValue("placed_name", out var pn) ? pn as string : null,
                    Serial = (long)MiniJson.ToDouble(rec.TryGetValue("serial", out var s) ? s : null, 0),
                });
            else if (table == "chat")
                Chat?.Invoke(rec.TryGetValue("user_id", out var u) ? u as string : null, rec.TryGetValue("name", out var n) ? n as string : "?",
                             rec.TryGetValue("color", out var c) ? c as string : "#8a7bef", rec.TryGetValue("text", out var x) ? x as string : "");
            else if (table == "world_restores" && rec.ContainsKey("at")) Restored?.Invoke();
        }

        public void Close() { sock?.Dispose(); sock = null; }
    }
}
