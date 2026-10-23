// Ether Mines · your game on the server (net.js + 14-startup.js boot + 03-state.js cloudSave): entering
// with your nickname and password, your save (`players.state`, the same JSON the web version keeps, so
// both versions share it: Unity only touches your position and your bar and keeps every other field),
// your inventory, and the actions the server arbitrates (mine, place, toggle), applied on screen at once
// and taken back if the server says no.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Session
    {
        public readonly Supabase Net;
        public string World;
        public string Login;            // your nickname, once entered
        public bool MustChange;         // a temporary password: choose your own before playing
        public string Color = "#8a7bef";
        public Dictionary<string, object> State = new Dictionary<string, object>();
        public readonly Inventory Inv = new Inventory();
        public double Gwei;
        public Func<double[]> Where; // where you stand now: the actions that check it get it when none is given
        // the act_* functions that check where you stand (their ex, ey, ez)
        static readonly HashSet<string> WithPos = new HashSet<string> { "mine", "place", "toggle", "pos", "chest", "chest_move", "relight", "claim", "loot_mob" };
        public bool Dirty; // your save changed (the bar, a plating worn, home...): sent back soon
        public event Action<string, string, string> Log; // kind (mint, burn, nft), text, detail

        static readonly string[] Colors = { "#8a7bef", "#ff9ab8", "#7fe8ff", "#9fe3c4", "#ffd95e", "#ffb37a", "#b6a4ff" };
        static readonly Dictionary<string, string> EnterErrs = new Dictionary<string, string>
        {
            ["wrong password"] = "Wrong password for this nickname. Forgot it? Write to contact@ethermines.org.",
            ["bad nickname"] = "A nickname is 2 to 16 letters, digits, spaces or - _ .",
            ["bad password"] = "The password needs 6 characters or more.",
            ["too many attempts"] = "Too many attempts: wait a few seconds.",
            ["no account"] = "Enter the game first.",
        };

        public Session(Supabase net) { Net = net; }

        public void Say(string kind, string text, string detail = "") => Log?.Invoke(kind, text, detail);

        static Dictionary<string, object> D(object o) => o as Dictionary<string, object>;
        static string Str(Dictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) ? v as string : null;

        // does this device already know you? (net.js myLogin)
        public async Task<bool> Known()
        {
            await Net.SignIn();
            var r = D(await Net.Rpc("act_my_login", "{}"));
            Login = Str(r, "login");
            MustChange = r != null && MiniJson.Truthy(r.TryGetValue("must_change", out var m) ? m : null);
            Moved = Str(r, "moved");
            return Login != null;
        }
        public string Moved; // this device's game left for another one, with this nickname (net.js movedLogin)

        // one nickname per player per world (is_username_taken): someone else's can't enter here
        public async Task<bool> NameTaken(string world, string name)
        {
            var r = await Net.Rpc("is_username_taken", MiniJson.Write(new Dictionary<string, object> { ["w"] = world, ["uname"] = name, ["uid"] = Net.UserId, ["previous"] = null }));
            return r is bool b && b;
        }

        // "Not you? Log out": this device takes a fresh guest session; the game stays with its nickname and password
        public async Task LogOut()
        {
            await Net.FreshSession();
            Login = null;
            MustChange = false;
            Moved = null;
        }

        // your nickname and password (047_nickname_password.sql): null when in, otherwise what went wrong
        public async Task<string> Enter(string nick, string password)
        {
            nick = System.Text.RegularExpressions.Regex.Replace(nick ?? "", "[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]", "").Trim();
            if (nick.Length > 16) nick = nick.Substring(0, 16);
            if (nick.Length == 0) return "Pick a nickname so your friends recognize you.";
            if (string.IsNullOrEmpty(password)) return "Enter your password (new here? choose one: 6 characters or more).";
            var args = MiniJson.Write(new Dictionary<string, object> { ["nick"] = nick, ["password"] = password });
            var r = D(await Net.Rpc("act_enter", args));
            if (Str(r, "err") == "fresh")
            {
                await Net.FreshSession();
                r = D(await Net.Rpc("act_enter", args));
            }
            if (r == null || !MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null))
            {
                var err = Str(r, "err");
                if (err == "locked") return $"Too many wrong passwords: try again in {Math.Ceiling(MiniJson.ToDouble(r["wait"], 600) / 60)} min.";
                if (err == "nickname taken") return $"The nickname \"{nick}\" belongs to a game started before passwords. If it's yours, enter from the device you played on; otherwise, pick another nickname.";
                return err != null && EnterErrs.TryGetValue(err, out var m) ? m : "Failed: " + (err ?? "unknown error");
            }
            Login = Str(r, "login") ?? nick;
            MustChange = MiniJson.Truthy(r.TryGetValue("must_change", out var mc) ? mc : null);
            return null;
        }

        public async Task<string> SetPassword(string password)
        {
            var r = D(await Net.Rpc("act_set_password", MiniJson.Write(new Dictionary<string, object> { ["password"] = password })));
            if (r != null && MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) { MustChange = false; return null; }
            var err = Str(r, "err");
            return err != null && EnterErrs.TryGetValue(err, out var m) ? m : "Failed: " + (err ?? "unknown error");
        }

        // your save in this world, and your inventory (boot in 14-startup.js)
        public async Task Load(string world)
        {
            World = world;
            var rows = await Net.Select($"players?select=name,color,state,updated_at,gwei&user_id=eq.{Net.UserId}&world=eq.{Supabase.Q(world)}");
            if (rows.Count > 0 && rows[0] is Dictionary<string, object> row)
            {
                if (row.TryGetValue("state", out var st) && st is Dictionary<string, object> s) State = s;
                Color = Str(row, "color") ?? Color;
                Gwei = MiniJson.ToDouble(row.TryGetValue("gwei", out var g) ? g : null);
            }
            else Color = Colors[UnityEngine.Random.Range(0, Colors.Length)];
            if (State.TryGetValue("bar", out var bar) && bar is List<object> bl)
                for (int i = 0; i < 9 && i < bl.Count; i++) Inv.Bar[i] = bl[i] as string ?? (bl[i] is double d ? ((int)d).ToString() : null);
            Inv.Sel = Math.Max(0, Math.Min(8, MiniJson.ToInt(State.TryGetValue("sel", out var sel) ? sel : null)));
            await LoadInventory();
        }

        public async Task LoadInventory()
        {
            string w = $"world=eq.{Supabase.Q(World)}&user_id=eq.{Net.UserId}";
            var inv = Net.Select($"inventory?select=item,n&{w}");
            var uni = Net.Select($"uniques?select=serial,item,place,mined&{w}&order=serial");
            await Task.WhenAll(inv, uni);
            Inv.Counts.Clear();
            foreach (Dictionary<string, object> r in inv.Result)
            {
                int n = MiniJson.ToInt(r["n"]);
                if (n > 0) Inv.Counts[MiniJson.ToInt(r["item"])] = n;
            }
            Inv.Uniques.Clear();
            foreach (Dictionary<string, object> r in uni.Result)
                Inv.Uniques.Add(new Unique { Serial = (long)MiniJson.ToDouble(r["serial"]), Id = MiniJson.ToInt(r["item"]), Place = Str(r, "place"), Mined = MiniJson.ToInt(r.TryGetValue("mined", out var m) ? m : null) });
            Inv.Tidy();
        }

        // where you stood last time: [x, y, z, yaw, pitch], or null
        public double[] SavedPos()
        {
            if (!State.TryGetValue("pos", out var p) || !(p is List<object> l) || l.Count < 5) return null;
            var a = new double[5];
            for (int i = 0; i < 5; i++) a[i] = MiniJson.ToDouble(l[i]);
            return a;
        }

        // your save back to the server (cloudSave): every field it had, with your position and bar updated
        public async Task Save(double x, double y, double z, double yaw, double pitch)
        {
            if (Login == null) return;
            State["pos"] = new List<object> { Math.Round(x, 2), Math.Round(y, 2), Math.Round(z, 2), Math.Round(yaw, 3), Math.Round(pitch, 3) };
            State["posAt"] = Math.Floor((DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds);
            State["posBy"] = Net.UserId;
            var bar = new List<object>();
            foreach (var b in Inv.Bar) bar.Add(b);
            State["bar"] = bar;
            State["sel"] = Inv.Sel;
            if (!State.ContainsKey("v")) State["v"] = 2;
            await Net.Upsert("players", "user_id,world", new Dictionary<string, object>
            {
                ["user_id"] = Net.UserId, ["world"] = World, ["name"] = Login, ["color"] = Color, ["state"] = State,
                ["updated_at"] = DateTime.UtcNow.ToString("o"),
            });
        }

        // ---------- actions (06-actions.js serverAct) ----------
        // ok: the server's reply when it agreed, null when it refused (the refusal is said in the log)
        public async Task<Dictionary<string, object>> Act(string name, Dictionary<string, object> args, double ex, double ey, double ez, string why = null)
        {
            if (WithPos.Contains(name))
            {
                if (ex == 0 && ey == 0 && ez == 0 && Where != null) { var w = Where(); ex = w[0]; ey = w[1]; ez = w[2]; }
                args["ex"] = Math.Round(ex, 2);
                args["ey"] = Math.Round(ey, 2);
                args["ez"] = Math.Round(ez, 2);
            }
            Dictionary<string, object> r;
            try { r = await Net.Act(World, name, args); }
            catch (Exception e)
            {
                Debug.LogWarning(e);
                Say("burn", "Server refused", e.Message.StartsWith("freeze") ? "the \"freeze\" function isn't deployed" : "try again in a moment");
                await LoadInventory();
                return null;
            }
            if (r != null && MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null))
            {
                if (r.TryGetValue("inv", out var inv)) Inv.SetCounts(inv as Dictionary<string, object>);
                return r;
            }
            if (r != null && r.TryGetValue("inv", out var inv2)) Inv.SetCounts(inv2 as Dictionary<string, object>);
            var why2 = Refusal(Str(r, "err"));
            if (why2 != null) Say("burn", "Refused", why2);
            return r == null ? null : new Dictionary<string, object> { ["refused"] = true, ["cell"] = r.TryGetValue("cell", out var c) ? c : null };
        }

        // what to tell the player when the server says no (06-actions.js REFUSAL); null: nothing to say
        static string Refusal(string err)
        {
            switch (err)
            {
                case "tool too weak": return "you need a better pickaxe";
                case "protected": return "protected area";
                case "validators are relit, not built": return "validators are relit in the ruins, not built";
                case "empty inventory": return "none of that item left";
                case "needs support": return "you need something solid underneath";
                case "space occupied": return "that spot is occupied";
                case "item not placeable": return "the server doesn't know this block yet";
                case "too fast": case "nothing to mine": return null;
                case "too far": return "out of reach";
                case "impossible move": return "position rejected by the server, wait a moment";
                case "too many actions": return "too fast, slow down a bit";
                default: return err;
            }
        }
    }
}
