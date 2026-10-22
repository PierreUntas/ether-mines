// Ether Mines · trades between players (07-interface.js renderTrade, 008_trades.sql): an offer says what
// you give and what you ask for (resources, unique pickaxes, plots) to a player of the same world; nothing
// moves until they accept, then everything changes hands at once (the server checks it all again). The
// window's Trade tab lists the offers received and sent, and builds a new one. Offers are read every two
// minutes, sooner while one of yours waits, and at once when the database says one changed.
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Trade : MonoBehaviour
    {
        public Session Session;
        public Avatars Avatars; // the players around: their names, to pick from

        sealed class Side
        {
            public readonly SortedDictionary<int, int> Items = new SortedDictionary<int, int>();
            public readonly List<long> Uniques = new List<long>();       // giving: serials; asking: item types
            public readonly List<int[]> Parcels = new List<int[]>();
            public Dictionary<string, object> Json() => new Dictionary<string, object>
            {
                ["items"] = Items.ToDictionary(kv => kv.Key.ToString(), kv => (object)(double)kv.Value),
                ["uniques"] = Uniques.Select(u => (object)(double)u).ToList(),
                ["parcels"] = Parcels.Select(p => (object)new List<object> { (double)p[0], (double)p[1] }).ToList(),
            };
        }

        List<Dictionary<string, object>> offers = new List<Dictionary<string, object>>();
        float pollT = 1;
        bool busy;
        string msg = "", to = "";
        Side give = new Side(), want = new Side();
        bool askOpen; // the list of everything there is to ask for, shown
        Vector2 scroll;
        float contentH = 600;

        public int Received => offers.Count(o => !Mine(o));
        static bool Mine(Dictionary<string, object> o) => MiniJson.Truthy(o.TryGetValue("mine", out var m) ? m : null);
        static string S(Dictionary<string, object> o, string k) => o.TryGetValue(k, out var v) ? v as string ?? "" : "";

        static readonly Dictionary<string, string> Errors = new Dictionary<string, string>
        {
            ["unknown player in this world"] = "no player has that nickname in this world",
            ["you don't have everything you're offering"] = "you don't have (or no longer have) everything you're giving",
            ["the other player no longer has what they offered"] = "the other player no longer has what they offered",
            ["too many actions"] = "too fast, wait a moment",
        };

        // the database said an offer concerning you changed (the offers table, Realtime)
        public void Changed() { pollT = 0; }

        void Update()
        {
            if (Session == null || (pollT -= Time.deltaTime) > 0) return;
            pollT = 120;
            Load();
        }

        async void Load()
        {
            try
            {
                var r = await Session.Net.Act(Session.World, "offers", new Dictionary<string, object>());
                if (r == null || !MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) return;
                var now = ((r.TryGetValue("offers", out var l) ? l as List<object> : null) ?? new List<object>()).OfType<Dictionary<string, object>>().ToList();
                var seen = new HashSet<string>(offers.Select(o => Id(o).ToString()));
                foreach (var o in now)
                    if (!Mine(o) && !seen.Contains(Id(o).ToString())) Hud.Feed("nft", S(o, "from") + " offers you a trade", "open your bag, Trade tab");
                // one of yours gone: accepted or declined on the other side; read what you carry again
                bool left = offers.Any(o => Mine(o) && !now.Any(x => Id(x) == Id(o)));
                offers = now;
                if (left) await Session.LoadInventory();
                if (offers.Any(Mine)) pollT = 20; // one of yours waits: look again sooner
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }
        static long Id(Dictionary<string, object> o) => (long)MiniJson.ToDouble(o.TryGetValue("id", out var v) ? v : null);

        async void Act(string name, Dictionary<string, object> args, Action<Dictionary<string, object>> done)
        {
            busy = true;
            msg = "";
            try
            {
                var r = await Session.Net.Act(Session.World, name, args);
                if (r != null && MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) { done(r); await Session.LoadInventory(); }
                else
                {
                    var err = r != null && r.TryGetValue("err", out var e) ? e as string : null;
                    msg = err == null ? "refused by the server" : Errors.TryGetValue(err, out var nice) ? nice : err;
                }
            }
            catch (Exception e) { msg = "the server is not responding (" + e.Message + ")"; }
            busy = false;
            Load();
        }

        // ---------- in words ----------
        static string Plot(int cx, int cz) => $"plot at x {cx * 16 + 8}, z {cz * 16 + 8}";
        string SideText(Dictionary<string, object> p, bool asking, Dictionary<string, object> offer)
        {
            var l = new List<string>();
            if (p == null) return "nothing";
            if (p.TryGetValue("items", out var it) && it is Dictionary<string, object> items)
                foreach (var kv in items) l.Add(MiniJson.ToInt(kv.Value) + " × " + Ui.NameOf(int.Parse(kv.Key)));
            if (p.TryGetValue("uniques", out var un) && un is List<object> uniques)
                foreach (var u in uniques)
                {
                    long s = (long)MiniJson.ToDouble(u);
                    if (asking) { l.Add("a " + Ui.NameOf((int)s)); continue; }
                    var d = (offer != null && offer.TryGetValue("uniqueDetails", out var ud) ? ud as List<object> : null)?.OfType<Dictionary<string, object>>().FirstOrDefault(x => (long)MiniJson.ToDouble(x["serial"]) == s);
                    var mine = Session.Inv.Uniques.FirstOrDefault(x => x.Serial == s);
                    if (d != null) l.Add($"{Ui.NameOf(MiniJson.ToInt(d.TryGetValue("item", out var di) ? di : null, 201))} ({MiniJson.ToInt(d.TryGetValue("mined", out var dm) ? dm : null)} blocks mined)");
                    else if (mine != null) l.Add($"{Ui.NameOf(mine.Id)} ({mine.Mined} blocks mined)");
                    else l.Add("a unique item");
                }
            if (p.TryGetValue("parcels", out var pa) && pa is List<object> parcels)
                foreach (var c in parcels.OfType<List<object>>()) l.Add(Plot(MiniJson.ToInt(c[0]), MiniJson.ToInt(c[1])));
            return l.Count > 0 ? string.Join(", ", l) : "nothing";
        }
        static string SideText(Side s, Inventory inv)
        {
            var l = s.Items.Select(kv => kv.Value + " × " + Ui.NameOf(kv.Key)).ToList();
            return l.Count > 0 ? string.Join(", ", l) : "nothing";
        }

        // what can be asked for: every block that drops itself and can be mined, every item but the unique ones
        static List<int> Askable()
        {
            var l = new List<int>();
            for (int i = 1; i < 256; i++)
            {
                var b = Rules.Block(i);
                if (b == null || i == 11 || i == 12 || (b.HasDrop && b.Drop != i) || double.IsInfinity(b.H)) continue;
                l.Add(i);
            }
            foreach (var kv in Rules.Items) if (!kv.Value.Nft) l.Add(kv.Key);
            return l.OrderBy(i => Ui.NameOf(i), StringComparer.Ordinal).ToList();
        }
        List<int> askable;

        // ---------- the tab ----------
        public void Draw(Rect body)
        {
            var inv = Session.Inv;
            GUI.enabled = !busy;
            var view = new Rect(0, 0, body.width - 20, contentH);
            scroll = GUI.BeginScrollView(body, scroll, view);
            float w = view.width, y = 0;
            GUI.Label(new Rect(0, y, w, 40), "Offer a trade to another player: resources, unique pickaxes, plots. Nothing moves until they accept, and everything changes hands at once. Validator seals can't be traded.", Ui.Small);
            y += 42;
            if (msg != "") { GUI.Label(new Rect(0, y, w, 22), "<color=#ff9ab8>" + msg + "</color>", Ui.Label); y += 26; }
            foreach (var (title, list) in new[] { ("Received offers", offers.Where(o => !Mine(o)).ToList()), ("Sent offers", offers.Where(Mine).ToList()) })
            {
                if (list.Count == 0) continue;
                GUI.Label(new Rect(0, y, w, 24), title, Ui.Title); y += 30;
                foreach (var o in list)
                {
                    bool mine = Mine(o);
                    var card = new Rect(0, y, w, 108);
                    Ui.Fill(card, new Color(1, 1, 1, 0.06f));
                    GUI.Label(new Rect(12, y + 6, w - 24, 22), mine ? "To " + S(o, "to") : S(o, "from") + " offers you", Ui.Label);
                    GUI.Label(new Rect(12, y + 28, w - 24, 20), (mine ? "You give: " : "You receive: ") + SideText(o.TryGetValue("give", out var g) ? g as Dictionary<string, object> : null, false, o), Ui.Small);
                    GUI.Label(new Rect(12, y + 48, w - 24, 20), (mine ? "You receive: " : "You give: ") + SideText(o.TryGetValue("want", out var q) ? q as Dictionary<string, object> : null, true, o), Ui.Small);
                    var oid = (double)Id(o);
                    if (mine)
                    {
                        if (GUI.Button(new Rect(12, y + 72, 100, 28), "Cancel", Ui.Button))
                            Act("offer_close", new Dictionary<string, object> { ["oid"] = oid }, r => Hud.Feed("burn", "Offer canceled", "to " + S(o, "to")));
                    }
                    else
                    {
                        if (GUI.Button(new Rect(12, y + 72, 100, 28), "Accept", Ui.Primary))
                            Act("offer_accept", new Dictionary<string, object> { ["oid"] = oid }, r =>
                            {
                                Session.State["traded"] = 1.0;
                                Session.Dirty = true;
                                Hud.Feed("nft", "Trade completed with " + S(o, "from"), SideText(o.TryGetValue("give", out var gg) ? gg as Dictionary<string, object> : null, false, o));
                            });
                        if (GUI.Button(new Rect(120, y + 72, 100, 28), "Decline", Ui.Button))
                            Act("offer_close", new Dictionary<string, object> { ["oid"] = oid }, r => Hud.Feed("burn", "Offer declined", "from " + S(o, "from")));
                    }
                    y += 116;
                }
            }

            // ----- a new offer -----
            GUI.Label(new Rect(0, y, w, 24), "New offer", Ui.Title); y += 30;
            GUI.Label(new Rect(0, y + 3, 30, 22), "To", Ui.Label);
            to = GUI.TextField(new Rect(34, y, 220, 26), to, 20);
            float nx = 266;
            if (Avatars != null)
                foreach (var name in Avatars.OtherNames().Distinct().Take(6))
                {
                    float bw = Mathf.Min(140, 20 + name.Length * 8);
                    if (nx + bw > w) break;
                    if (GUI.Button(new Rect(nx, y, bw, 26), name, to == name ? Ui.Primary : Ui.Button)) to = name;
                    nx += bw + 6;
                }
            y += 36;
            y = SideBox(w, y, "I give", give, true, inv);
            y = SideBox(w, y, "I ask for (nothing: it's a gift)", want, false, inv);
            if (GUI.Button(new Rect(0, y, 140, 32), "Send offer", Ui.Primary))
            {
                var name = to.Trim();
                if (name == "") msg = "enter the player's nickname";
                else
                {
                    var g = give;
                    // act_offer's parameter is named "username" (008_trades.sql)
                    Act("offer", new Dictionary<string, object> { ["username"] = name, ["give"] = give.Json(), ["want"] = want.Json() }, r =>
                    {
                        Hud.Feed("nft", "Offer sent to " + (r.TryGetValue("name", out var n) ? n as string : name), SideText(g, inv));
                        give = new Side(); want = new Side(); to = "";
                    });
                }
            }
            if (GUI.Button(new Rect(150, y, 100, 32), "Clear", Ui.Button)) { give = new Side(); want = new Side(); to = ""; msg = ""; }
            y += 44;
            GUI.EndScrollView();
            contentH = y;
            GUI.enabled = true;
        }

        // one side: what's in it (with − and + to change how many), then what can go in
        float SideBox(float w, float y, string title, Side side, bool giving, Inventory inv)
        {
            GUI.Label(new Rect(0, y, w, 22), title, Ui.Label); y += 26;
            foreach (var kv in side.Items.ToList())
            {
                int id = kv.Key, n = kv.Value, max = giving ? inv.Count(id) : 99999;
                Ui.Icon(new Rect(0, y, 28, 28), id);
                GUI.Label(new Rect(34, y + 4, 220, 22), n + " × " + Ui.NameOf(id), Ui.Label);
                float bx = 260;
                foreach (var (t, d) in new[] { ("−10", -10), ("−", -1), ("+", 1), ("+10", 10) })
                {
                    if (GUI.Button(new Rect(bx, y, 44, 28), t, Ui.Button)) side.Items[id] = Mathf.Max(1, Mathf.Min(max, n + d));
                    bx += 48;
                }
                if (GUI.Button(new Rect(bx, y, 36, 28), "✕", Ui.Button)) side.Items.Remove(id);
                y += 32;
            }
            // unique items: yours by number (giving), by type (asking); plots: yours, or the one you stand in
            float cx = 0;
            void Chip(string text, bool on, Action toggle)
            {
                float bw = Mathf.Min(w, 24 + text.Length * 7.5f);
                if (cx + bw > w) { cx = 0; y += 32; }
                if (GUI.Button(new Rect(cx, y, bw, 28), text, on ? Ui.Primary : Ui.Button)) toggle();
                cx += bw + 6;
            }
            if (giving)
            {
                foreach (var u in inv.Uniques.Where(u => u.Id != 203))
                    Chip($"{Ui.NameOf(u.Id)} #{u.Serial}", side.Uniques.Contains(u.Serial), () => { if (!side.Uniques.Remove(u.Serial)) side.Uniques.Add(u.Serial); });
                if (Claims.Instance != null)
                    foreach (var c in Claims.Instance.Owned())
                    {
                        var p = side.Parcels.FirstOrDefault(q => q[0] == c.Cx && q[1] == c.Cz);
                        Chip(Plot(c.Cx, c.Cz), p != null, () => { if (p != null) side.Parcels.Remove(p); else side.Parcels.Add(new[] { c.Cx, c.Cz }); });
                    }
            }
            else
            {
                foreach (var t in new long[] { 201, 202 })
                    Chip("a " + Ui.NameOf((int)t), side.Uniques.Contains(t), () => { if (!side.Uniques.Remove(t)) side.Uniques.Add(t); });
                foreach (var p in side.Parcels.ToList()) Chip(Plot(p[0], p[1]) + "  ✕", true, () => side.Parcels.Remove(p));
                var here = Claims.Instance?.HereOther();
                if (here != null && !side.Parcels.Any(q => q[0] == here.Cx && q[1] == here.Cz))
                    Chip("+ the plot you're standing in (" + (here.OwnerName ?? "?") + ")", false, () => { side.Parcels.Add(new[] { here.Cx, here.Cz }); if (to == "" && here.OwnerName != null) to = here.OwnerName; });
            }
            if (cx > 0) y += 32;
            // what can go in: a grid of icons, a tap adds one
            var ids = giving ? inv.Counts.Where(kv => kv.Value > 0 && !(Rules.Item(kv.Key)?.Nft ?? false)).Select(kv => kv.Key).OrderBy(i => Ui.NameOf(i), StringComparer.Ordinal).ToList()
                             : (askOpen ? (askable ??= Askable()) : null);
            if (!giving)
            {
                if (GUI.Button(new Rect(0, y, 220, 26), askOpen ? "Hide the list" : "Choose what to ask for…", Ui.Button)) askOpen = !askOpen;
                y += 32;
            }
            if (giving && ids.Count == 0) { GUI.Label(new Rect(0, y, w, 22), "Your bag is empty.", Ui.Small); y += 26; }
            if (ids != null && ids.Count > 0)
            {
                const float s = 44, gap = 4;
                int cols = Mathf.Max(1, (int)((w + gap) / (s + gap))), i = 0;
                foreach (var id in ids)
                {
                    var r = new Rect((i % cols) * (s + gap), y + (i / cols) * (s + gap), s, s);
                    bool inIt = side.Items.ContainsKey(id);
                    Ui.Fill(r, inIt ? new Color(1, 1, 1, 0.28f) : new Color(1, 1, 1, 0.07f));
                    Ui.Icon(new Rect(r.x + 5, r.y + 5, s - 10, s - 10), id);
                    if (giving) GUI.Label(new Rect(r.x, r.y, s - 3, s - 2), inv.Count(id).ToString(), Ui.Count);
                    if (GUI.Button(r, new GUIContent("", Ui.NameOf(id)), GUIStyle.none))
                    {
                        int max = giving ? inv.Count(id) : 99999;
                        side.Items[id] = Mathf.Min(max, (side.Items.TryGetValue(id, out var n) ? n : 0) + 1);
                    }
                    i++;
                }
                y += ((ids.Count + cols - 1) / cols) * (s + gap) + 4;
                if (GUI.tooltip != "") { GUI.Label(new Rect(0, y, w, 22), GUI.tooltip, Ui.Small); }
                y += 24;
            }
            return y + 8;
        }
    }
}
