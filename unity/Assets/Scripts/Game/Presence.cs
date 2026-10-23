// Ether Mines · who is in the world without the game server (net.js join, track, syncRegions, sendRegion):
// Supabase Realtime's presence on the world's channel, as the web version keeps it, and the moves over
// region channels, 96 blocks a side: you send on your square's channel and listen to the 3x3 around you,
// so only players near you hear your moves, and nothing goes out when nobody is near. The web tracks its
// presence there all the time; when the game server is down (or this world has none), its players fall
// back to these channels, and so does this screen: everyone keeps seeing everyone. Phoenix protocol over
// one WebSocket, like Realtime.cs.
using System;
using System.Collections.Generic;
using EtherMines.Core;

namespace EtherMines.Game
{
    public sealed class Presence
    {
        const int Region = 96;
        public event Action<List<GameLink.Peer>> Peers;
        public event Action<GameLink.Move> Pos;
        public string Status = "";
        public bool Joined { get; private set; }
        public bool Fallback;          // the game server isn't there: the region channels carry the moves
        public string Url = Config.SupabaseUrl.Replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + Config.SupabaseAnonKey + "&vsn=1.0.0";

        readonly string world, topic, me;
        readonly Func<System.Threading.Tasks.Task<string>> token;
        public string Name = "", Color = "#8a7bef", Title = "", Look = "";
        Socket sock;
        bool connecting;
        float beatT, retryT;
        int refN, retries;
        string sentToken, myRegion, trackedKey;
        readonly Dictionary<string, List<Dictionary<string, object>>> state = new Dictionary<string, List<Dictionary<string, object>>>();
        readonly HashSet<string> regions = new HashSet<string>(); // the region topics joined

        public Presence(string world, Func<System.Threading.Tasks.Task<string>> token, string userId)
        {
            this.world = world;
            this.token = token;
            me = userId;
            topic = "realtime:world:" + world;
        }

        string Ref() => (++refN).ToString();
        void Send(string t, string ev, object payload) => sock?.Send(MiniJson.Write(new Dictionary<string, object> { ["topic"] = t, ["event"] = ev, ["payload"] = payload, ["ref"] = Ref() }));

        async void Connect()
        {
            connecting = true;
            try
            {
                var tk = await token();
                sock = await Socket.Connect(Url);
                sentToken = tk;
                var r = Ref();
                sock.Send(MiniJson.Write(new Dictionary<string, object>
                {
                    ["topic"] = topic, ["event"] = "phx_join", ["ref"] = r, ["join_ref"] = r,
                    ["payload"] = new Dictionary<string, object>
                    {
                        ["config"] = new Dictionary<string, object>
                        {
                            ["broadcast"] = new Dictionary<string, object> { ["self"] = false },
                            ["presence"] = new Dictionary<string, object> { ["key"] = me },
                        },
                        ["access_token"] = tk,
                    },
                }));
                beatT = 25;
                Status = "joining";
            }
            catch (Exception e)
            {
                Status = "presence: " + e.Message;
                sock = null;
                retryT = Math.Min(30, 2 << Math.Min(retries++, 4));
            }
            finally { connecting = false; }
        }

        // every frame: what arrived, the heartbeat, the squares to listen to
        public void Tick(float dt, double x, double z)
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
                Status = "presence lost: " + sock.CloseReason;
                sock.Dispose();
                sock = null;
                regions.Clear();
                state.Clear();
                trackedKey = null;
                retryT = Math.Min(30, 2 << Math.Min(retries++, 4));
                return;
            }
            if ((beatT -= dt) <= 0)
            {
                beatT = 25;
                Send("phoenix", "heartbeat", new Dictionary<string, object>());
                RenewToken();
            }
            if (!Joined) return;
            myRegion = Math.Floor(x / Region) + "," + Math.Floor(z / Region);
            SyncRegions();
            // what the others read of you: re-tracked when it changes (your square, your title, your look)
            var key = $"{Name}|{Color}|{Title}|{Look}|{myRegion}";
            if (key != trackedKey)
            {
                trackedKey = key;
                Send(topic, "presence", new Dictionary<string, object>
                {
                    ["type"] = "presence", ["event"] = "track",
                    ["payload"] = new Dictionary<string, object> { ["name"] = Name, ["color"] = Color, ["title"] = Title, ["look"] = Look, ["r"] = myRegion, ["w"] = null },
                });
            }
        }

        string RegionTopic(string k) => topic + ":r:" + k;

        void SyncRegions()
        {
            var want = new HashSet<string>();
            if (Fallback && myRegion != null)
            {
                var p = myRegion.Split(',');
                int rx = int.Parse(p[0]), rz = int.Parse(p[1]);
                for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) want.Add((rx + dx) + "," + (rz + dz));
            }
            foreach (var k in new List<string>(regions))
                if (!want.Contains(k)) { Send(RegionTopic(k), "phx_leave", new Dictionary<string, object>()); regions.Remove(k); }
            foreach (var k in want)
                if (regions.Add(k))
                {
                    var r = Ref();
                    sock.Send(MiniJson.Write(new Dictionary<string, object>
                    {
                        ["topic"] = RegionTopic(k), ["event"] = "phx_join", ["ref"] = r, ["join_ref"] = r,
                        ["payload"] = new Dictionary<string, object>
                        {
                            ["config"] = new Dictionary<string, object> { ["broadcast"] = new Dictionary<string, object> { ["self"] = false }, ["presence"] = new Dictionary<string, object> { ["key"] = "" } },
                            ["access_token"] = sentToken,
                        },
                    }));
                }
        }

        async void RenewToken()
        {
            try
            {
                var tk = await token();
                if (tk == sentToken || sock == null) return;
                sentToken = tk;
                Send(topic, "access_token", new Dictionary<string, object> { ["access_token"] = tk });
                foreach (var k in regions) Send(RegionTopic(k), "access_token", new Dictionary<string, object> { ["access_token"] = tk });
            }
            catch (Exception) { }
        }

        void Handle(string raw)
        {
            if (!(MiniJson.Parse(raw) is Dictionary<string, object> m)) return;
            var t = m.TryGetValue("topic", out var tv) ? tv as string : null;
            var ev = m.TryGetValue("event", out var e) ? e as string : null;
            var payload = m.TryGetValue("payload", out var p) ? p as Dictionary<string, object> : null;
            if (t == topic && ev == "phx_reply" && payload != null)
            {
                if ((payload["status"] as string) != "ok") Status = "presence refused";
                else if (!Joined) { Joined = true; retries = 0; Status = "live"; }
            }
            else if (t == topic && ev == "presence_state" && payload != null)
            {
                state.Clear();
                foreach (var kv in payload) state[kv.Key] = Metas(kv.Value);
                Emit();
            }
            else if (t == topic && ev == "presence_diff" && payload != null)
            {
                // leaves first, then joins: a player who re-tracked comes out with only their newest entry
                if (payload.TryGetValue("leaves", out var lv) && lv is Dictionary<string, object> leaves)
                    foreach (var kv in leaves)
                    {
                        if (!state.TryGetValue(kv.Key, out var list)) continue;
                        foreach (var gone in Metas(kv.Value)) list.RemoveAll(x => Ref(x) == Ref(gone));
                        if (list.Count == 0) state.Remove(kv.Key);
                    }
                if (payload.TryGetValue("joins", out var jv) && jv is Dictionary<string, object> joins)
                    foreach (var kv in joins)
                    {
                        if (!state.TryGetValue(kv.Key, out var list)) state[kv.Key] = list = new List<Dictionary<string, object>>();
                        list.AddRange(Metas(kv.Value));
                    }
                Emit();
            }
            else if (ev == "broadcast" && payload != null && t != null && t.StartsWith(topic + ":r:", StringComparison.Ordinal))
            {
                var what = payload.TryGetValue("event", out var w) ? w as string : null;
                if (what == "pos" && payload.TryGetValue("payload", out var pp) && pp is Dictionary<string, object> pos) Pos?.Invoke(GameLink.ParseMove(pos));
            }
        }

        static string Ref(Dictionary<string, object> meta) => meta.TryGetValue("phx_ref", out var r) ? r as string : null;
        static List<Dictionary<string, object>> Metas(object o)
        {
            var l = new List<Dictionary<string, object>>();
            if (o is Dictionary<string, object> d && d.TryGetValue("metas", out var ms) && ms is List<object> list)
                foreach (var x in list) if (x is Dictionary<string, object> meta) l.Add(meta);
            return l;
        }

        // the players in the world (presenceSync): per player, the newest entry that has its square
        readonly Dictionary<string, string> squares = new Dictionary<string, string>();
        void Emit()
        {
            var ps = new List<GameLink.Peer>();
            squares.Clear();
            foreach (var kv in state)
            {
                Dictionary<string, object> p = null;
                for (int i = kv.Value.Count - 1; i >= 0 && p == null; i--) if (kv.Value[i].TryGetValue("r", out var r) && r is string) p = kv.Value[i];
                if (p == null && kv.Value.Count > 0) p = kv.Value[kv.Value.Count - 1];
                if (p == null) continue;
                string S(string k, string d) => p.TryGetValue(k, out var v) && v is string s ? s : d;
                ps.Add(new GameLink.Peer { Id = kv.Key, Name = S("name", "?"), Color = S("color", "#8a7bef"), Title = S("title", ""), Look = S("look", "") });
                squares[kv.Key] = S("r", null) ?? S("w", null);
            }
            Peers?.Invoke(ps);
        }

        // someone else within one square of you (anyoneNear): otherwise nothing is sent
        public bool AnyoneNear()
        {
            if (myRegion == null) return false;
            var a = myRegion.Split(',');
            int ax = int.Parse(a[0]), az = int.Parse(a[1]);
            foreach (var kv in squares)
            {
                if (kv.Key == me) continue;
                if (kv.Value == null) return true; // an older client: assume near
                var b = kv.Value.Split(',');
                if (b.Length == 2 && int.TryParse(b[0], out var bx) && int.TryParse(b[1], out var bz) && Math.Abs(ax - bx) <= 1 && Math.Abs(az - bz) <= 1) return true;
            }
            return false;
        }

        // your move on your square's channel (sendRegion 'pos'): when you moved, at most 5 times a second, a
        // sign of life every 4 s, and only with someone near
        float lastSent = -99;
        string lastKey;
        public void SendPos(Dictionary<string, object> p, float now)
        {
            if (!Joined || !Fallback || myRegion == null || !regions.Contains(myRegion) || now - lastSent < 0.2f || !AnyoneNear()) return;
            var key = MiniJson.Write(p);
            if (key == lastKey && now - lastSent < 4) return;
            lastKey = key;
            lastSent = now;
            Send(RegionTopic(myRegion), "broadcast", new Dictionary<string, object> { ["type"] = "broadcast", ["event"] = "pos", ["payload"] = p });
        }

        public void Resync() { if (Joined) Emit(); } // the game server just went away: back to this list

        public void Close() { sock?.Dispose(); sock = null; }
    }
}
