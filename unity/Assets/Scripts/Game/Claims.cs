// Ether Mines · plots (06-actions.js claims, 048_claim_price.sql): the world's 16 × 16 squares a player can
// claim, so only they and their invites build there. Their borders are drawn (green: yours, pink: someone
// else's); mining and placing in someone else's plot, or in the Atrium and the City, is refused here before
// the server refuses it. /claim shows the plot you stand in (gold: free, green: yours, red: not for you)
// and follows you as you walk; /claim again, or Enter, takes it (500 Gwei for the first, twice as much for
// each next one, 9 at most); X puts it away. /unclaim, /invite and /kick a nickname, /claims.
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Claims : MonoBehaviour
    {
        public sealed class Claim { public int Cx, Cz; public string Owner, OwnerName; public List<string> Members = new List<string>(); }

        public Session Session;
        public PlayerController Player;
        public Chat Chat;

        public static Claims Instance;
        readonly Dictionary<long, Claim> claims = new Dictionary<long, Claim>();
        GameObject lines, pick;
        string linesKey = "", pickKey = "";
        Material lineMat;
        public bool Picking { get; private set; }
        int pqx, pqz;
        bool pickOk;
        string pickWhy = "";

        static long K(int cx, int cz) => ((long)cx << 32) ^ (uint)cz;
        string Me => Session.Net.UserId;

        void Awake() { Instance = this; }

        void Start() { Load(); }

        async void Load()
        {
            try
            {
                var rows = await Session.Net.Select($"claims?select=*&world=eq.{Supabase.Q(Session.World)}");
                foreach (Dictionary<string, object> r in rows) Put(r);
                linesKey = "";
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        void Put(Dictionary<string, object> r)
        {
            var c = new Claim { Cx = MiniJson.ToInt(r["cx"]), Cz = MiniJson.ToInt(r["cz"]), Owner = r.TryGetValue("owner", out var o) ? o as string : null, OwnerName = r.TryGetValue("owner_name", out var n) ? n as string : null };
            if (r.TryGetValue("members", out var m) && m is List<object> l) c.Members = l.Select(x => x as string).ToList();
            claims[K(c.Cx, c.Cz)] = c;
        }

        // from the database's feed
        public void Changed(string type, Dictionary<string, object> now, Dictionary<string, object> old)
        {
            if (type == "DELETE") { if (old != null && old.ContainsKey("cx")) claims.Remove(K(MiniJson.ToInt(old["cx"]), MiniJson.ToInt(old["cz"]))); }
            else if (now != null && now.ContainsKey("cx")) Put(now);
            linesKey = "";
            pickKey = "";
        }

        public Claim At(double x, double z) { claims.TryGetValue(K(World.COf(Math.Floor(x)), World.COf(Math.Floor(z))), out var c); return c; }
        bool Mine(Claim c) => c.Owner == Me || c.Members.Contains(Me);
        // your own plots, and the one you stand in when it's someone else's (to trade them, Trade.cs)
        public IEnumerable<Claim> Owned() => claims.Values.Where(c => c.Owner == Me);
        public Claim HereOther() { var b = Player.Body; var c = b != null ? At(b.X, b.Z) : null; return c != null && c.Owner != Me ? c : null; }

        // why you can't build here (canBuildHere, protectMsg), or null
        public string Refusal(double x, double z, bool toggling = false)
        {
            if (!toggling && Interaction.Sanctuary(x, z)) return World.InCity(x, z, 1) ? "the City belongs to everyone" : "the Atrium belongs to everyone";
            var c = At(x, z);
            return c == null || Mine(c) ? null : (c.OwnerName ?? "someone") + "'s plot";
        }

        void Update()
        {
            var b = Player.Body;
            if (b == null) return;
            int pcx = World.COf(Math.Floor(b.X)), pcz = World.COf(Math.Floor(b.Z));
            var key = pcx + "," + pcz + ":" + claims.Count;
            if (key != linesKey) { linesKey = key; Borders(pcx, pcz); }
            if (Picking)
            {
                DrawPick(pcx, pcz);
                if (!Ui.Blocking)
                {
#if ENABLE_INPUT_SYSTEM
                    var k = Keyboard.current;
                    bool x = k != null && k.xKey.wasPressedThisFrame;
#else
                    bool x = Input.GetKeyDown(KeyCode.X);
#endif
                    if (x) StopPick();
                }
            }
        }

        Material LineMat()
        {
            if (lineMat == null) lineMat = new Material(Shader.Find("Hidden/Internal-Colored"));
            return lineMat;
        }

        static float Ground(int x, int z) => Math.Max(World.HeightAt(x, z), World.SEA) + 1.05f;

        // the plots' borders within 5 squares: corner posts and the square on the ground
        void Borders(int pcx, int pcz)
        {
            if (lines != null) { Destroy(lines.GetComponent<MeshFilter>().sharedMesh); Destroy(lines); }
            var v = new List<Vector3>();
            var col = new List<Color>();
            Color mineC = new Color(0.62f, 0.89f, 0.77f, 0.75f), other = new Color(1f, 0.6f, 0.72f, 0.75f);
            foreach (var c in claims.Values)
            {
                if (Math.Abs(c.Cx - pcx) > 5 || Math.Abs(c.Cz - pcz) > 5) continue;
                var cl = Mine(c) ? mineC : other;
                int x0 = c.Cx * World.CH, z0 = c.Cz * World.CH;
                foreach (var (x, z) in new[] { (x0, z0), (x0 + 16, z0), (x0, z0 + 16), (x0 + 16, z0 + 16) }) { v.Add(new Vector3(x, 0, -z)); v.Add(new Vector3(x, World.SY + 4, -z)); col.Add(cl); col.Add(cl); }
                float y = Ground(x0 + 8, z0 + 8);
                foreach (var (a, bb, c2, d) in new[] { (x0, z0, x0 + 16, z0), (x0 + 16, z0, x0 + 16, z0 + 16), (x0 + 16, z0 + 16, x0, z0 + 16), (x0, z0 + 16, x0, z0) })
                { v.Add(new Vector3(a, y, -bb)); v.Add(new Vector3(c2, y, -d)); col.Add(cl); col.Add(cl); }
            }
            lines = LineObject("plots", v, col);
        }

        GameObject LineObject(string name, List<Vector3> v, List<Color> col)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var m = new Mesh { name = name };
            m.vertices = v.ToArray();
            m.colors = col.ToArray();
            var idx = new int[v.Count];
            for (int i = 0; i < idx.Length; i++) idx[i] = i;
            m.SetIndices(idx, MeshTopology.Lines, 0);
            go.AddComponent<MeshFilter>().sharedMesh = m;
            go.AddComponent<MeshRenderer>().sharedMaterial = LineMat();
            return go;
        }

        // ---------- choosing a plot ----------
        (string st, string why) State(int qx, int qz)
        {
            if (claims.TryGetValue(K(qx, qz), out var c)) return Mine(c) ? ("mine", "already your plot") : ("bad", (c.OwnerName ?? "someone") + "'s plot");
            int x0 = qx * World.CH, z0 = qz * World.CH;
            foreach (var (x, z) in new[] { (x0 + 8, z0 + 8), (x0, z0), (x0 + 15, z0), (x0, z0 + 15), (x0 + 15, z0 + 15) })
                if (Interaction.Sanctuary(x, z) || World.InCircuits(x, z)) return ("bad", "a public zone: it belongs to everyone");
            int held = claims.Values.Count(o => o.Owner == Me);
            if (held >= 9) return ("bad", "9 plots at most: give one up first (/unclaim)");
            double price = 500 * Math.Pow(2, held);
            return ("free", $"{price:0} Gwei" + (Session.Gwei < price ? $" (you have {Session.Gwei:0})" : ""));
        }

        void DrawPick(int qx, int qz)
        {
            var (st, why) = State(qx, qz);
            var key = $"{qx},{qz},{st}";
            if (key == pickKey) return;
            pickKey = key;
            pqx = qx; pqz = qz; pickOk = st == "free"; pickWhy = why;
            if (pick != null) { Destroy(pick.GetComponent<MeshFilter>().sharedMesh); Destroy(pick); }
            var cl = st == "free" ? new Color(1f, 0.82f, 0.4f) : st == "mine" ? new Color(0.62f, 0.89f, 0.77f) : new Color(1f, 0.42f, 0.42f);
            int x0 = qx * World.CH, z0 = qz * World.CH;
            var v = new List<Vector3>();
            var col = new List<Color>();
            void Seg(Vector3 a, Vector3 b) { v.Add(a); v.Add(b); col.Add(cl); col.Add(cl); }
            // the edge, block by block at its ground height, doubled a little higher; a tall post at each corner
            for (int k = 0; k < 16; k++)
                foreach (var up in new[] { 0f, 0.35f })
                {
                    Seg(new Vector3(x0 + k, Ground(x0 + k, z0) + up, -z0), new Vector3(x0 + k + 1, Ground(x0 + k, z0) + up, -z0));
                    Seg(new Vector3(x0 + k, Ground(x0 + k, z0 + 15) + up, -(z0 + 16)), new Vector3(x0 + k + 1, Ground(x0 + k, z0 + 15) + up, -(z0 + 16)));
                    Seg(new Vector3(x0, Ground(x0, z0 + k) + up, -(z0 + k)), new Vector3(x0, Ground(x0, z0 + k) + up, -(z0 + k + 1)));
                    Seg(new Vector3(x0 + 16, Ground(x0 + 15, z0 + k) + up, -(z0 + k)), new Vector3(x0 + 16, Ground(x0 + 15, z0 + k) + up, -(z0 + k + 1)));
                }
            foreach (var (x, z, gx, gz) in new[] { (x0, z0, x0, z0), (x0 + 16, z0, x0 + 15, z0), (x0, z0 + 16, x0, z0 + 15), (x0 + 16, z0 + 16, x0 + 15, z0 + 15) })
                Seg(new Vector3(x, Ground(gx, gz), -z), new Vector3(x, Ground(gx, gz) + 10, -z));
            pick = LineObject("plot to claim", v, col);
        }

        public void StartPick() { Picking = true; pickKey = ""; }
        public void StopPick()
        {
            Picking = false;
            if (pick != null) { Destroy(pick.GetComponent<MeshFilter>().sharedMesh); Destroy(pick); pick = null; }
        }

        public async void ConfirmPick()
        {
            if (!Picking || !pickOk) return;
            var b = Player.Body;
            if (World.COf(Math.Floor(b.X)) != pqx || World.COf(Math.Floor(b.Z)) != pqz) return;
            int qx = pqx, qz = pqz;
            StopPick();
            var r = await Session.Act("claim", new Dictionary<string, object> { ["qx"] = qx, ["qz"] = qz }, 0, 0, 0, "claim");
            if (r == null || r.ContainsKey("refused")) return;
            if (r.TryGetValue("total_gwei", out var tg)) Session.Gwei = MiniJson.ToDouble(tg);
            int next = MiniJson.ToInt(r.TryGetValue("next_price", out var np) ? np : null);
            Chat.Add("World", "#7fe8ff", $"Plot {qx}, {qz} claimed ({MiniJson.ToInt(r.TryGetValue("gwei", out var g) ? g : null)} Gwei). Only you and your invites can build there." +
                                           (next > 0 ? $" Your next plot: {next} Gwei." : " That makes 9: the most you can hold."));
        }

        // /claim, /unclaim, /invite, /kick, /claims
        public async void Command(string c, string arg)
        {
            var b = Player.Body;
            int qx = World.COf(Math.Floor(b.X)), qz = World.COf(Math.Floor(b.Z));
            void Say(string t) => Chat.Add("World", "#7fe8ff", t);
            if (c == "claim") { if (Picking) ConfirmPick(); else StartPick(); return; }
            if (c == "unclaim")
            {
                var r = await Session.Act("unclaim", new Dictionary<string, object> { ["qx"] = qx, ["qz"] = qz }, 0, 0, 0);
                if (r != null && !r.ContainsKey("refused")) Say($"Plot {qx}, {qz} released.");
                return;
            }
            if (c == "invite" || c == "kick")
            {
                if (arg.Length == 0) { Say($"Type /{c} followed by a nickname."); return; }
                var r = await Session.Act("member", new Dictionary<string, object> { ["username"] = arg, ["invite"] = c == "invite" }, 0, 0, 0);
                if (r != null && !r.ContainsKey("refused"))
                {
                    var name = r.TryGetValue("name", out var n) ? n as string : arg;
                    Say(c == "invite" ? $"{name} can now build on all your plots." : $"{name} can no longer build on your plots.");
                }
                return;
            }
            if (c == "claims")
            {
                var mine = claims.Values.Where(v => v.Owner == Me).ToList();
                Say(mine.Count > 0 ? "Your plots: " + string.Join(" · ", mine.Select(v => v.Cx + ", " + v.Cz)) : "You don't have a plot yet. /claim shows the one you're standing in, then takes it.");
            }
        }

        // the bar under the screen while choosing
        void OnGUI()
        {
            Ui.Begin();
            if (!Picking) return;
            float w = 560, x = (Ui.W - w) / 2, y = 60;
            Ui.Fill(new Rect(x, y, w, 40), pickOk ? new Color(0.25f, 0.2f, 0.05f, 0.85f) : new Color(0.3f, 0.08f, 0.12f, 0.85f));
            GUI.Label(new Rect(x + 14, y + 10, w - 28, 24), $"Plot {pqx}, {pqz} · {pickWhy}" + (pickOk ? " · Enter: claim · X: cancel" : " · walk to another plot · X: cancel"), Ui.Label);
        }
    }
}
