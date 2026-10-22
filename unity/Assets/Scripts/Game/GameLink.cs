// Ether Mines · the game server (server/, net.js gsConnect): the players' real time over one WebSocket.
// Hello with your session token, then your position when you move (at most 5 times a second, a sign of
// life every 4 s), and from the server the list of who is in the world (peers, every 2 s) and the moves
// of the players near you (pos). The server also runs the mobs and keeps your hearts: what it says about
// them (ms, mob, mhit, mshot, hurt, hp, loot, hit, shot) goes to Message, for Combat and Mobs.
using System;
using System.Collections.Generic;
using EtherMines.Core;

namespace EtherMines.Game
{
    public sealed class GameLink
    {
        public const int Protocol = 2; // server.js PROTOCOL, net.js GS_PROTOCOL
        const string Origin = "https://ethermines.org";

        public sealed class Peer { public string Id, Name, Color, Title, Look; public double X, Y, Z; public bool HasPos; }
        public sealed class Move { public string Id, Name, Color; public double X, Y, Z, Yaw, Pitch; public bool Mining, Guard; public int Held; }

        public event Action<List<Peer>> Peers;
        public event Action<Move> Pos;
        public event Action<string, Dictionary<string, object>> Message; // everything else the server says
        public bool MobServer { get; private set; }  // it runs the mobs (the game only draws them)
        public bool HpServer { get; private set; }   // it keeps your hearts
        public bool LootServer { get; private set; } // it pays the loot of a kill
        public Func<Dictionary<string, object>> HelloExtra; // your hearts, your plating... for the hello
        public string Title = "", LookCode = "";             // under your name, what you wear: told to the others
        public bool NoMobs;                          // hostile mobs off here: the server's mobs leave you be
        public string Status = "";
        public bool Ready { get; private set; }
        public string SelfId { get; private set; }

        public string Url = Config.GameServer; // another one for tests (server/: npm run dev)
        readonly string world;
        readonly Func<System.Threading.Tasks.Task<string>> token;
        Socket sock;
        bool connecting, off;
        float retryT, tokenT;
        int retries;
        string sentToken;
        double lx, ly, lz, lyaw, lpitch;
        bool lm, lg, lbt, lnm, lwd, sentOnce;
        int lh, lar, lfq;
        float lastSent;

        public GameLink(string world, Func<System.Threading.Tasks.Task<string>> token)
        {
            this.world = world;
            this.token = token;
        }

        async void Connect()
        {
            connecting = true;
            try
            {
                var tk = await token();
                sock = await Socket.Connect(Url, Origin);
                sentToken = tk;
                var hello = new Dictionary<string, object>
                {
                    ["t"] = "hello", ["v"] = Protocol, ["world"] = world, ["token"] = tk, ["title"] = Title, ["look"] = LookCode, ["nm"] = NoMobs ? 1 : 0,
                };
                if (HelloExtra != null) foreach (var kv in HelloExtra()) hello[kv.Key] = kv.Value;
                sock.Send(MiniJson.Write(hello));
                Status = "hello";
            }
            catch (Exception e)
            {
                Status = "game server: " + e.Message;
                sock = null;
                Later();
            }
            finally { connecting = false; }
        }

        void Later() => retryT = Math.Min(10, 2 << Math.Min(retries++, 3)) + UnityEngine.Random.value;

        public void Tick(float dt)
        {
            if (off) return;
            if (sock == null)
            {
                if (!connecting && (retryT -= dt) <= 0) Connect();
                return;
            }
            while (sock.TryRead(out var raw)) Handle(raw);
            if (sock.Closed)
            {
                Ready = false;
                if (Status.StartsWith("hello", StringComparison.Ordinal) || Status == "online") Status = "game server lost";
                sock.Dispose();
                sock = null;
                if (!off) Later();
                return;
            }
            if (Ready && (tokenT -= dt) <= 0) { tokenT = 60; RenewToken(); }
        }

        async void RenewToken()
        {
            try
            {
                var tk = await token();
                if (tk != sentToken && sock != null) { sentToken = tk; sock.Send(MiniJson.Write(new Dictionary<string, object> { ["t"] = "token", ["token"] = tk })); }
            }
            catch (Exception) { }
        }

        void Handle(string raw)
        {
            if (!(MiniJson.Parse(raw) is Dictionary<string, object> m) || !(m.TryGetValue("t", out var tv) && tv is string t)) return;
            if (t == "welcome")
            {
                SelfId = m["id"] as string;
                MobServer = MiniJson.Truthy(m.TryGetValue("mobs", out var mb) ? mb : null);
                HpServer = m.TryGetValue("hp", out var hp) && hp is double;
                LootServer = MiniJson.Truthy(m.TryGetValue("loot", out var lt) ? lt : null);
                Ready = true;
                Message?.Invoke("welcome", m);
                retries = 0;
                Status = "online";
                sentOnce = false;
            }
            else if (t == "bye")
            {
                var reason = m.TryGetValue("reason", out var r) ? r as string : "";
                if (reason == "version") { off = MiniJson.ToInt(m.TryGetValue("protocol", out var pv) ? pv : null) > Protocol; Status = off ? "game server is newer: update this app" : "game server is being updated"; retries = Math.Max(retries, 3); }
                else if (reason == "elsewhere") { off = true; Status = "you entered on another screen"; }
                else if (reason == "world") { off = true; Status = "game server: this world name isn't accepted"; }
                else Status = "game server: " + reason;
            }
            else if (t == "peers" && m.TryGetValue("list", out var l) && l is List<object> list)
            {
                var ps = new List<Peer>();
                foreach (var o in list)
                    if (o is Dictionary<string, object> p)
                    {
                        var e = new Peer
                        {
                            Id = p["id"] as string, Name = p.TryGetValue("name", out var n) ? n as string : "?", Color = p.TryGetValue("color", out var c) ? c as string : "#8a7bef",
                            Title = p.TryGetValue("title", out var ti) ? ti as string : "", Look = p.TryGetValue("look", out var lk) ? lk as string : "",
                        };
                        if (p.TryGetValue("x", out var x) && x is double) { e.HasPos = true; e.X = (double)x; e.Y = MiniJson.ToDouble(p["y"]); e.Z = MiniJson.ToDouble(p["z"]); }
                        ps.Add(e);
                    }
                Peers?.Invoke(ps);
            }
            else if (t == "pos")
            {
                Pos?.Invoke(new Move
                {
                    Id = m["id"] as string, Name = m.TryGetValue("name", out var n) ? n as string : "?", Color = m.TryGetValue("color", out var c) ? c as string : "#8a7bef",
                    X = MiniJson.ToDouble(m["x"]), Y = MiniJson.ToDouble(m["y"]), Z = MiniJson.ToDouble(m["z"]),
                    Yaw = MiniJson.ToDouble(m.TryGetValue("yaw", out var yw) ? yw : null), Pitch = MiniJson.ToDouble(m.TryGetValue("pitch", out var pt) ? pt : null),
                    Mining = MiniJson.Truthy(m.TryGetValue("m", out var mm) ? mm : null), Held = MiniJson.ToInt(m.TryGetValue("h", out var h) ? h : null),
                    Guard = MiniJson.Truthy(m.TryGetValue("gd", out var gd) ? gd : null),
                });
            }
            else Message?.Invoke(t, m);
        }

        // your position (14-startup.js): only when you moved, at most 5 times a second, a sign of life every 4 s
        // gd: the blade up; ar: the plating you wear; bt: the Front-Runner Boots on; fx/fq: the last blow you
        // took or parried, and its number (the others see it on your figure)
        public void SendPos(double x, double y, double z, double yaw, double pitch, bool mining, int held, float now, bool guard = false, int armor = 0, bool boots = false, string fx = null, int fq = 0, bool ward = false)
        {
            if (!Ready || now - lastSent < 0.2f) return;
            bool moved = !sentOnce || Math.Sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly) + (z - lz) * (z - lz)) > 0.08 ||
                         Math.Abs(yaw - lyaw) > 0.06 || Math.Abs(pitch - lpitch) > 0.08 || mining != lm || held != lh ||
                         guard != lg || armor != lar || boots != lbt || NoMobs != lnm || fq != lfq || ward != lwd;
            if (!moved && now - lastSent < 4) return;
            sentOnce = true;
            lx = x; ly = y; lz = z; lyaw = yaw; lpitch = pitch; lm = mining; lh = held; lg = guard; lar = armor; lbt = boots; lnm = NoMobs; lfq = fq; lwd = ward;
            lastSent = now;
            sock?.Send(MiniJson.Write(new Dictionary<string, object>
            {
                ["t"] = "pos", ["x"] = Math.Round(x, 2), ["y"] = Math.Round(y, 2), ["z"] = Math.Round(z, 2), ["yaw"] = Math.Round(yaw, 2), ["pitch"] = Math.Round(pitch, 2),
                ["m"] = mining, ["h"] = held, ["gd"] = guard ? 1 : 0, ["rd"] = 0, ["on"] = 0, ["ar"] = armor, ["bt"] = boots ? 1 : 0, ["nm"] = NoMobs ? 1 : 0,
                ["fx"] = fx ?? (object)0, ["fq"] = fq, ["wd"] = ward ? 1 : 0,
            }));
        }

        // any other word to the server (mob, hit, shot, guard, parry...): only once it has welcomed you
        public void Send(Dictionary<string, object> m)
        {
            if (Ready) sock?.Send(MiniJson.Write(m));
        }

        // your title or look changed: the others see it at once
        public void SetLook(string title, string look)
        {
            if (title == Title && look == LookCode) return;
            Title = title;
            LookCode = look;
            Send(new Dictionary<string, object> { ["t"] = "look", ["title"] = title, ["look"] = look });
        }

        // a block changed (heard from the database's feed): the server's mobs walk the new terrain
        public void Edit(int x, int y, int z, int id)
        {
            if (Ready) sock?.Send(MiniJson.Write(new Dictionary<string, object> { ["t"] = "edit", ["x"] = x, ["y"] = y, ["z"] = z, ["id"] = id }));
        }

        public void Close() { off = true; sock?.Dispose(); sock = null; }
    }
}
