// Ether Mines · the window (E): your bag, crafting, and the chest you opened (07-interface.js renderPanel,
// renderChest), drawn as the web's .win (a rounded dark glass, its tabs on top, "Close" at the end).
// Your chest: every item you hold, a sheet for the one you pick, put it in the bar's selected
// slot, wear a plating or the boots. Crafting: the recipes by category, what each needs and what you have,
// made by the server (act_craft). A chest: what's in it and in your bag, a click moves 1, 10 or all.
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
    public sealed class Panel : MonoBehaviour
    {
        public Session Session; // null offline
        public Interaction Act;
        public Progress Progress; // null offline
        public Trade Trade;       // null offline
        public Avatars Avatars;   // your character, shown in the bag and the shop (null offline)
        Shop shop;
        public string Tab = "bag";
        Vector2 scroll;
        string selKey, craftCat = "";
        int chestQty = 1;
        bool busy;

        public sealed class Chest { public int X, Y, Z; public Dictionary<int, int> Items = new Dictionary<int, int>(); }
        public Chest Open;

        Inventory Inv => Act.Inv;

        public void Show(string tab)
        {
            Tab = tab;
            scroll = Vector2.zero;
            if (!Ui.PanelOpen)
            {
                Ui.PanelOpen = true;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        public void Hide()
        {
            Ui.PanelOpen = false;
            Open = null;
            if (Avatars != null) { Avatars.TryLook = null; Avatars.TryColor = null; }
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        void Update()
        {
            if (Chat.Typing || Ui.Paused) return;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool e = k != null && k.eKey.wasPressedThisFrame, esc = k != null && k.escapeKey.wasPressedThisFrame, o = k != null && k.oKey.wasPressedThisFrame;
#else
            bool e = Input.GetKeyDown(KeyCode.E), esc = Input.GetKeyDown(KeyCode.Escape), o = Input.GetKeyDown(KeyCode.O);
#endif
            TouchPad.Poll();
            e |= TouchPad.Bag; o |= TouchPad.Goals; // the buttons on top (the window closes with its ✕)
            // 1-9 choose the bar's slot with the window open too (the bag's "Place in slot" uses it)
            if (Ui.PanelOpen)
            {
#if ENABLE_INPUT_SYSTEM
                if (k != null)
                {
                    var digits = new[] { k.digit1Key, k.digit2Key, k.digit3Key, k.digit4Key, k.digit5Key, k.digit6Key, k.digit7Key, k.digit8Key, k.digit9Key };
                    for (int i = 0; i < 9; i++) if (digits[i].wasPressedThisFrame) Inv.Sel = i;
                }
#else
                for (int i = 0; i < 9; i++) if (Input.GetKeyDown(KeyCode.Alpha1 + i)) Inv.Sel = i;
#endif
            }
            if (e) { if (Ui.PanelOpen) Hide(); else Show(Tab == "chest" ? "bag" : Tab); }
            else if (o && Progress != null) { if (Ui.PanelOpen && Tab == "quest") Hide(); else Show("quest"); }
            else if (esc && Ui.PanelOpen) Hide();
        }

        // a chest under your hand (openChest): what's in it comes from the server
        public async void OpenChest(int x, int y, int z)
        {
            if (Session == null || busy) return;
            busy = true;
            Sounds.Door(new Vector3(x + 0.5f, y + 0.5f, z + 0.5f));
            try
            {
                var r = await Session.Act("chest", new Dictionary<string, object> { ["px"] = x, ["py"] = y, ["pz"] = z }, 0, 0, 0);
                if (r == null || r.ContainsKey("refused")) return;
                Open = new Chest { X = x, Y = y, Z = z, Items = Counts(r) };
                Show("chest");
            }
            finally { busy = false; }
        }

        static Dictionary<int, int> Counts(Dictionary<string, object> r)
        {
            var d = new Dictionary<int, int>();
            if (r.TryGetValue("items", out var it) && it is Dictionary<string, object> items)
                foreach (var kv in items) if (int.TryParse(kv.Key, out var id) && MiniJson.ToInt(kv.Value) > 0) d[id] = MiniJson.ToInt(kv.Value);
            return d;
        }

        async void MoveChest(int item, int n)
        {
            if (busy || Open == null || n == 0) return;
            busy = true;
            Sounds.Click();
            try
            {
                var r = await Session.Act("chest_move", new Dictionary<string, object> { ["px"] = Open.X, ["py"] = Open.Y, ["pz"] = Open.Z, ["item"] = item, ["n"] = n }, 0, 0, 0,
                                          n > 0 ? "put in chest" : "taken from chest");
                if (r != null && !r.ContainsKey("refused") && Open != null) Open.Items = Counts(r);
            }
            finally { busy = false; }
        }

        async void Craft(Recipe rc)
        {
            if (busy) return;
            busy = true;
            try
            {
                if (Session == null) { Hud.Feed("burn", "Crafting needs the server", "enter the world online"); return; }
                var r = await Session.Act("craft", new Dictionary<string, object> { ["out_id"] = rc.Out }, 0, 0, 0, "crafted");
                if (r == null || r.ContainsKey("refused")) return;
                var need = string.Join(" + ", rc.NeedIds.Select((id, i) => rc.NeedCounts[i] + " " + Ui.NameOf(id)));
                Hud.Feed("craft", need, "→ " + rc.N + " " + Ui.NameOf(rc.Out));
                if (r.ContainsKey("unique")) await Session.LoadInventory();
            }
            finally { busy = false; }
        }

        Rect gridRect;
        bool gridOverflows;

        bool Owns(int id) => Inv.Uniques.Any(u => u.Id == id);

        void OnGUI()
        {
            Ui.Begin();
            if (!Ui.PanelOpen) return;
            GUI.depth = -10;
            float W = Mathf.Min(980, Ui.W - 40), H = Mathf.Min(640, Ui.H - 120), x = (Ui.W - W) / 2, y = 40;
            if (TouchPad.Active) { var sa = Ui.Safe; W = Mathf.Min(980, sa.width - 16); H = sa.height - 16; x = sa.x + (sa.width - W) / 2; y = sa.y + 8; } // a phone: the whole screen
            // the wheel turns the bar's slot: in your bag (unless it scrolls a long list under the mouse),
            // or anywhere outside the window (over the bar)
            var ev = Event.current;
            if (ev.type == EventType.ScrollWheel)
            {
                bool outside = !new Rect(x, y, W, H).Contains(ev.mousePosition);
                if (outside || (Tab == "bag" && !(gridOverflows && gridRect.Contains(ev.mousePosition))))
                {
                    Inv.Sel = ((Inv.Sel + (ev.delta.y > 0 ? 1 : -1)) % 9 + 9) % 9;
                    ev.Use();
                }
            }
            // the backdrop, the window (.panel, .win)
            Ui.Fill(new Rect(0, 0, Ui.W, Ui.H), new Color(10 / 255f, 8 / 255f, 24 / 255f, 0.45f));
            Ui.Round(new Rect(x, y, W, H), Ui.Glass2, 16, Ui.Line, 1);
            // the tabs (.tab), as many lines as they need, "Close" at the end of the first
            bool touch = TouchPad.Active;
            string close = touch ? "Close" : "Close · E";
            var cs = new GUIStyle(Ui.Button) { fontSize = 14, padding = new RectOffset(10, 10, 5, 5) };
            float closeW = cs.CalcSize(new GUIContent(close)).x + 4;
            var closeR = new Rect(x + W - 14 - closeW, y + 12, closeW, 32);
            if (GUI.Button(closeR, close, cs)) { Hide(); return; }
            float tx = x + 14, ty = y + 12, right = closeR.x - 8;
            foreach (var (k, t) in new[] { ("bag", "Chest"), ("craft", "Crafting"), ("quest", "Objectives"), ("validators", "Validators"), ("shop", "Shop"), ("trade", Trade != null && Trade.Received > 0 ? $"Trade ({Trade.Received})" : "Trade"), ("chest", "This chest"), ("settings", "Settings") })
            {
                if (k == "chest" && Open == null) continue;
                if ((k == "quest" || k == "validators" || k == "shop") && Progress == null) continue;
                if (k == "trade" && Trade == null) continue;
                var st = Ui.Tab(Tab == k);
                float w = st.CalcSize(new GUIContent(t)).x + 2;
                if (tx + w > right && tx > x + 14) { tx = x + 14; ty += 38; right = x + W - 14; }
                if (GUI.Button(new Rect(tx, ty, w, 32), t, st)) { Tab = k; scroll = Vector2.zero; settingsScroll = Vector2.zero; }
                tx += w + 6;
            }
            float headH = ty + 32 + 12 - y;
            Ui.Fill(new Rect(x + 1, y + headH, W - 2, 1), Ui.Line);
            // your Gwei, in the window's lower corner
            var gs = new GUIStyle(Ui.MonoSmall) { fontSize = 12, alignment = TextAnchor.MiddleRight, wordWrap = false };
            gs.normal.textColor = Ui.Gold;
            GUI.Label(new Rect(x + W - 220, y + H - 24, 206, 20), Session != null ? $"{Session.Gwei:0} Gwei" : "offline", gs);
            var body = new Rect(x + 14, y + headH + 14, W - 28, H - headH - 14 - 26);
            if (Tab == "settings") { settingsRect = body; Settings(); }
            else if (Tab == "bag") Bag(body);
            else if (Tab == "craft") CraftTab(body);
            else if (Tab == "chest" && Open != null) ChestTab(body);
            else if (Tab == "quest" && Progress != null) Progress.DrawObjectives(body);
            else if (Tab == "validators" && Progress != null) Progress.DrawValidators(body);
            else if (Tab == "trade" && Trade != null) Trade.Draw(body);
            else if (Tab == "shop" && Progress != null) (shop ??= new Shop { Session = Session, Progress = Progress, Avatars = Avatars }).Draw(body);
            if (Tab != "shop" && Avatars != null) { Avatars.TryLook = null; Avatars.TryColor = null; }
        }

        void Settings()
        {
            {
                var r = settingsRect;
                // a phone's screen is short: the list scrolls (its content at the same coordinates as the box)
                bool scrolls = settingsH > r.height + 1;
                settingsScroll = GUI.BeginScrollView(r, settingsScroll, new Rect(r.x, r.y, r.width - (scrolls ? 18 : 0), settingsH));
                if (scrolls) r.width -= 18;
                float ly = r.y + 8;
                void Row(string label, bool on, Action toggle)
                {
                    GUI.Label(new Rect(r.x + 12, ly + 5, 170, 24), label, Ui.Label);
                    if (GUI.Button(new Rect(r.xMax - 82, ly, 70, 30), on ? "On" : "Off", on ? Ui.Primary : Ui.Button)) toggle();
                    ly += 36;
                }
                // a setting with several choices (SETTINGS_CHOICES), its line of explanation under it
                void Choice<T>(string label, string note, (T v, string t)[] opts, T cur, Action<T> set, bool locked = false)
                {
                    GUI.Label(new Rect(r.x + 12, ly, r.width - 24, 20), label, Ui.Label);
                    ly += 20;
                    float nh = Ui.Small.CalcHeight(new GUIContent(note), r.width - 24);
                    GUI.Label(new Rect(r.x + 12, ly, r.width - 24, nh), note, Ui.Small);
                    ly += nh + 2;
                    float bw = (r.width - 24 - (opts.Length - 1) * 4) / opts.Length;
                    GUI.enabled = !locked;
                    for (int i = 0; i < opts.Length; i++)
                    {
                        bool sel = EqualityComparer<T>.Default.Equals(opts[i].v, cur);
                        if (GUI.Button(new Rect(r.x + 12 + i * (bw + 4), ly, bw, 28), opts[i].t, sel ? Ui.Primary : Ui.Button) && !sel) { set(opts[i].v); Reg.Save(); }
                    }
                    GUI.enabled = true;
                    ly += 38;
                }
                Row("Sound (M)", Sounds.On, Sounds.Toggle);
                Row("Vibrations", Haptics.On, Haptics.Toggle);
                Row("Glow", PostGlow.On, PostGlow.Toggle);
                Row("Ambient occlusion", PostGlow.Ao, PostGlow.ToggleAo);
                Row("Sun rays", PostGlow.Rays, PostGlow.ToggleRays);
                Row("Motion blur", PostGlow.Blur, PostGlow.ToggleBlur);
                Row("Fireflies & co", Effects.Life, Effects.Toggle);
                Row("Weather", Weather.On, Weather.Toggle);
                ly += 4;
                Choice("View distance", "Chunks of 16 blocks drawn around you. Less = smoother.", new[] { (3, "Short"), (4, "Medium"), (5, "Long"), (6, "Very long") }, Reg.View, v => Reg.View = v);
                Choice("Cast shadows", "Nice but costly, especially on a phone.", new[] { (false, "No"), (true, "Yes") }, Reg.Shadows, v => Reg.Shadows = v);
                Choice("Animals", "Sheep, foxes, jellyfish… and the villagers.", new[] { (false, "No"), (true, "Yes") }, Reg.Animals, v => Reg.Animals = v);
                Choice("Hostile mobs", Reg.MobsForced ? "Not in the main world: everyone there faces the same mobs. In a private world of your own, it’s your choice." : "Shadows, guardians and the rest. Off: they leave you be.",
                       new[] { (false, "No"), (true, "Yes") }, Reg.MobsOn, v => Reg.Mobs = v, Reg.MobsForced);
                Choice("Camera sensitivity", "How fast the view turns.", new[] { (0.6f, "Gentle"), (1f, "Normal"), (1.5f, "Brisk") }, Reg.Sensitivity, v => Reg.Sensitivity = v);
                Choice("Show FPS", "Smoothness next to the clock (60 = perfect, under 30 = choppy).", new[] { (false, "Hide"), (true, "Show") }, Reg.Fps, v => Reg.Fps = v);
                if (GUI.Button(new Rect(r.x + 12, ly, r.width - 24, 30), "Back to recommended settings", Ui.Button)) Reg.Reset();
                ly += 38;
                settingsH = ly - r.y;
                GUI.EndScrollView();

            }
        }
        float settingsH = 600;
        Vector2 settingsScroll;
        Rect settingsRect;

        // ---------- your bag ----------
        struct Entry { public string Key; public int Id, N; public Unique U; }
        List<Entry> Entries()
        {
            var l = new List<Entry>();
            foreach (var kv in Inv.Counts.OrderBy(k => k.Key)) if (kv.Value > 0) l.Add(new Entry { Key = kv.Key.ToString(), Id = kv.Key, N = kv.Value });
            foreach (var u in Inv.Uniques) l.Add(new Entry { Key = "nft" + u.Serial, Id = u.Id, N = 1, U = u });
            return l;
        }

        // an item's square (.it): rounded, a light edge (cyan when picked, iridescent for a unique one), its
        // icon at 70%, the count in its lower right
        static GUIStyle itCount;
        public static void Cell(Rect r, int id, string count, bool sel, bool nft)
        {
            Ui.Round(r, new Color(1, 1, 1, sel ? 0.1f : 0.05f), 10, sel ? Ui.Cyan : nft ? new Color(0.62f, 0.62f, 1f, 0.9f) : Ui.Line, sel ? 2 : 1);
            float i = r.width * 0.7f;
            Ui.Icon(new Rect(r.center.x - i / 2, r.center.y - i / 2, i, i), id);
            if (count == null) return;
            if (itCount == null) itCount = new GUIStyle(Ui.Count) { fontSize = 14, alignment = TextAnchor.LowerRight };
            var cr = new Rect(r.x, r.y, r.width - 5, r.height - 2);
            var o = GUI.color;
            GUI.color = new Color(0, 0, 0, 0.8f);
            GUI.Label(new Rect(cr.x + 1, cr.y + 1, cr.width, cr.height), count, itCount);
            GUI.color = o;
            GUI.Label(cr, count, itCount);
        }

        void Bag(Rect body)
        {
            var all = Entries();
            if (selKey == null || !all.Any(a => a.Key == selKey)) selKey = all.Count > 0 ? all[0].Key : null;
            // (.inv: the grid, and the item's card 280 wide beside it; on a phone, one column: the card under the grid)
            bool under = TouchPad.Active;
            float gw = under ? body.width : body.width - 294;
            int cols = Mathf.Max(1, (int)((gw - 14 + 6) / (64 + 6)));
            float cs = (gw - 14 - (cols - 1) * 6) / cols;
            float gridH = Mathf.Ceil(all.Count / (float)cols) * (cs + 6);
            float cardH = (Avatars != null ? 220 : 0) + 430;
            var view = new Rect(0, 0, gw - 14, gridH + (under ? cardH + 14 : 0));
            gridRect = new Rect(body.x, body.y, gw, body.height);
            gridOverflows = view.height > body.height;
            scroll = GUI.BeginScrollView(new Rect(body.x, body.y, gw, body.height), scroll, view);
            if (all.Count == 0) GUI.Label(new Rect(0, 0, gw - 20, 40), "Your chest is empty. Mine a few blocks.", Ui.Small);
            for (int i = 0; i < all.Count; i++)
            {
                var a = all[i];
                var r = new Rect((i % cols) * (cs + 6), (i / cols) * (cs + 6), cs, cs);
                Cell(r, a.Id, a.U == null ? a.N.ToString() : null, a.Key == selKey, a.U != null);
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) selKey = a.Key;
            }
            // the sheet of the item picked (.card): beside the grid, or under it in the same scroll on a phone
            var c = under ? new Rect(0, gridH + 8, Mathf.Min(view.width, 420), cardH) : new Rect(body.xMax - 280, body.y, 280, body.height);
            if (!under) GUI.EndScrollView();
            Card(c, all);
            if (under) GUI.EndScrollView();
        }

        void Card(Rect c, List<Entry> all)
        {
            Ui.Round(c, new Color(0.55f, 0.55f, 0.95f, 0.14f), 14, Ui.Line, 1);
            if (Avatars != null)
            {
                float ph = Mathf.Min(220, c.height * 0.4f);
                DrawPreview(Avatars, new Rect(c.x, c.y, c.width, ph));
                c = new Rect(c.x, c.y + ph, c.width, c.height - ph);
            }
            if (selKey == null) return;
            var e = all.First(z => z.Key == selKey);
            float cw = c.width - 28;
            Ui.Icon(new Rect(c.x + 14, c.y + 14, 64, 64), e.Id);
            var h3 = new GUIStyle(Ui.Title) { fontSize = 22, wordWrap = true };
            GUI.Label(new Rect(c.x + 90, c.y + 14, cw - 76, 50), Ui.NameOf(e.Id) + (e.U != null ? " #" + e.U.Serial : ""), h3);
            var std = new GUIStyle(Ui.MonoSmall); std.normal.textColor = Ui.Cyan;
            GUI.Label(new Rect(c.x + 90, c.y + 60, cw - 76, 18), e.U != null ? "Sealed · unique" : "Minted · fungible", std);
            float ly = c.y + 92;
            // its facts (.card dl): the name muted on the left, the value in mono on the right, a dashed line under
            var dd = new GUIStyle(Ui.MonoSmall) { fontSize = 12, alignment = TextAnchor.UpperRight, wordWrap = false }; dd.normal.textColor = Ui.Paper;
            var dt = new GUIStyle(Ui.Label) { fontSize = 13, wordWrap = false }; dt.normal.textColor = Ui.Muted;
            void Row(string k, string v)
            {
                GUI.Label(new Rect(c.x + 14, ly, cw * 0.55f, 20), k, dt);
                GUI.Label(new Rect(c.x + 14, ly + 1, cw, 20), v, dd);
                for (float dx = 0; dx < cw; dx += 6) Ui.Fill(new Rect(c.x + 14 + dx, ly + 23, 3, 1), Ui.Line);
                ly += 29;
            }
            if (e.U != null)
            {
                Row("Token", "#" + e.Id + "-" + e.U.Serial.ToString("0000"));
                if (!string.IsNullOrEmpty(e.U.Place)) Row(e.Id == 203 ? "Validator" : "Forge location", e.U.Place);
                var it = Rules.Item(e.Id);
                if (it != null && it.HasTool) Row("Blocks mined with", e.U.Mined.ToString());
            }
            else { Row("ID", "#" + e.Id); Row("In your chest", e.N.ToString()); }
            ly += 8;
            if (GUI.Button(new Rect(c.x + 14, ly, cw, 34), "Place in slot " + (Inv.Sel + 1), Ui.Primary))
            {
                int ex = Array.IndexOf(Inv.Bar, e.Key);
                if (ex >= 0) Inv.Bar[ex] = null;
                Inv.Bar[Inv.Sel] = e.Key;
                if (Session != null) Session.Dirty = true;
            }
            ly += 40;
            var def = Rules.Item(e.Id);
            if (Session != null && def != null && def.HasArmor)
            {
                bool on = State("armor") == e.Id.ToString();
                if (GUI.Button(new Rect(c.x + 14, ly, cw, 32), on ? "Unequip" : "Equip", Ui.Button)) { Session.State["armor"] = on ? null : e.Id.ToString(); Session.Dirty = true; }
                ly += 38;
            }
            if (Session != null && def != null && def.HasBoots)
            {
                bool on = State("boots") == e.Id.ToString();
                if (GUI.Button(new Rect(c.x + 14, ly, cw, 32), on ? "Take off" : "Wear", Ui.Button)) { Session.State["boots"] = on ? null : e.Id.ToString(); Session.Dirty = true; }
                ly += 38;
            }
            GUI.Label(new Rect(c.x + 14, ly, cw, 120), e.U != null
                ? "A unique item has its own number and keeps its history: who forged it, where, and what it has accomplished."
                : Rules.Block(e.Id) != null ? "Mining this block mints a token. Placing it burns it, and the placed block carries your serial number in the ledger."
                : "A fungible resource: every unit is worth exactly the same as another.", Ui.Small);
        }

        // your character, turning, as the window's preview camera sees it
        public static void DrawPreview(Avatars av, Rect r)
        {
            var tex = av.Preview();
            if (tex == null) return;
            float w = r.height * 512f / 640f;
            GUI.DrawTexture(new Rect(r.x + (r.width - w) / 2, r.y, w, r.height), tex, ScaleMode.ScaleToFit, true);
        }

        string State(string k) => Session != null && Session.State.TryGetValue(k, out var v) && v != null ? (v is double d ? ((int)d).ToString() : v.ToString()) : null;

        // ---------- crafting ----------
        void CraftTab(Rect body)
        {
            var cats = Rules.Recipes.Select(r => r.Cat).Distinct().ToList();
            float cx = body.x, cy = body.y;
            float aw = Ui.Pill(false).CalcSize(new GUIContent("All")).x + 2;
            if (GUI.Button(new Rect(cx, cy, aw, 30), "All", Ui.Pill(craftCat == ""))) { craftCat = ""; scroll = Vector2.zero; }
            cx += aw + 8;
            // the categories, on as many lines as they need
            foreach (var c in cats)
            {
                float w = Ui.Pill(false).CalcSize(new GUIContent(c)).x + 2;
                if (cx + w > body.xMax) { cx = body.x; cy += 36; }
                if (GUI.Button(new Rect(cx, cy, w, 30), c, Ui.Pill(craftCat == c))) { craftCat = c; scroll = Vector2.zero; }
                cx += w + 8;
            }
            float top = cy + 40 - body.y;
            var list = Rules.Recipes.Where(r => craftCat == "" || r.Cat == craftCat).ToList();
            float rh = 92;
            var view = new Rect(0, 0, body.width - 14, list.Count * rh + 40 * cats.Count);
            scroll = GUI.BeginScrollView(new Rect(body.x, body.y + top, body.width, body.height - top), scroll, view);
            float y = 0;
            string cat = null;
            foreach (var r in list)
            {
                if (r.Cat != cat) { cat = r.Cat; GUI.Label(new Rect(0, y + 8, 400, 22), cat.ToUpperInvariant(), Ui.Cat); y += 34; }
                bool hasReq = !r.HasReq || Owns(r.Req);
                bool ok = hasReq;
                var need = new List<(bool, string)>();
                for (int i = 0; i < r.NeedIds.Length; i++)
                {
                    int have = Inv.Count(r.NeedIds[i]);
                    bool enough = have >= r.NeedCounts[i];
                    ok &= enough;
                    need.Add((enough, $"{r.NeedCounts[i]} {Ui.NameOf(r.NeedIds[i])} ({have})"));
                }
                if (r.HasReq) need.Add((hasReq, $"owning the {Ui.NameOf(r.Req)} (kept)"));
                // the recipe's card (.rec): its icon, "4 × Planks", what it is (mono, muted), what it needs (chips)
                var card = new Rect(0, y, view.width, rh - 8);
                Ui.Round(card, new Color(1, 1, 1, 0.04f), 12, Ui.Line, 1);
                Ui.Icon(new Rect(10, y + (rh - 8 - 48) / 2, 48, 48), r.Out);
                var strong = new GUIStyle(Ui.Title) { fontSize = 17, wordWrap = false };
                GUI.Label(new Rect(70, y + 8, view.width - 190, 24), (r.N > 1 ? r.N + " × " : "") + Ui.NameOf(r.Out), strong);
                GUI.Label(new Rect(70, y + 32, view.width - 190, 18), r.D, new GUIStyle(Ui.MonoSmall) { wordWrap = false });
                float nx = 70;
                foreach (var (enough, t) in need)
                {
                    var ns = new GUIStyle(Ui.MonoSmall) { wordWrap = false, alignment = TextAnchor.MiddleCenter };
                    ns.normal.textColor = enough ? Ui.Paper : Ui.Burn;
                    float nw = ns.CalcSize(new GUIContent(t)).x + 12;
                    if (nx + nw > view.width - 120) break;
                    Ui.Round(new Rect(nx, y + 54, nw, 20), new Color(1, 1, 1, 0.08f), 5);
                    GUI.Label(new Rect(nx, y + 54, nw, 20), t, ns);
                    nx += nw + 8;
                }
                GUI.enabled = ok && !busy;
                if (GUI.Button(new Rect(view.width - 120, y + (rh - 8 - 40) / 2, 108, 40), "Craft", ok ? Ui.Primary : Ui.Button)) Craft(r);
                GUI.enabled = true;
                y += rh;
            }
            GUI.EndScrollView();
        }

        // ---------- a chest ----------
        void ChestTab(Rect body)
        {
            GUI.Label(new Rect(body.x, body.y, body.width, 22), $"Chest at {Open.X}, {Open.Y}, {Open.Z}. Click an item to move it. Inside a plot, only its owner and their invites can open it; elsewhere, everyone can.", Ui.Small);
            float qx = body.x;
            GUI.Label(new Rect(qx, body.y + 28, 70, 26), "Quantity", Ui.Label);
            qx += 76;
            foreach (var (v, t) in new[] { (1, "1"), (10, "10"), (0, "All") })
            {
                if (GUI.Button(new Rect(qx, body.y + 26, 54, 26), t, chestQty == v ? Ui.Primary : Ui.Button)) chestQty = v;
                qx += 60;
            }
            float half = (body.height - 70) / 2;
            chestScroll = Zone(new Rect(body.x, body.y + 62, body.width, half), "In the chest", Open.Items, -1, chestScroll);
            bagScroll = Zone(new Rect(body.x, body.y + 70 + half, body.width, half), "In your bag", Inv.Counts, 1, bagScroll);
        }
        Vector2 chestScroll, bagScroll;

        // one side of the chest window, its cells scrolling when there are more than fit
        Vector2 Zone(Rect r, string title, Dictionary<int, int> items, int dir, Vector2 sc)
        {
            GUI.Label(new Rect(r.x, r.y, 300, 24), title, Ui.Title);
            var list = items.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key).ToList();
            if (list.Count == 0) GUI.Label(new Rect(r.x, r.y + 30, 400, 22), dir < 0 ? "The chest is empty." : "Nothing to deposit.", Ui.Small);
            float cs = 52;
            int cols = Mathf.Max(1, (int)((r.width - 20) / (cs + 6)));
            var area = new Rect(r.x, r.y + 30, r.width, r.height - 30);
            var view = new Rect(0, 0, r.width - 20, Mathf.Ceil(list.Count / (float)cols) * (cs + 6));
            sc = GUI.BeginScrollView(area, sc, view);
            for (int i = 0; i < list.Count; i++)
            {
                var cell = new Rect((i % cols) * (cs + 6), (i / cols) * (cs + 6), cs, cs);
                Cell(cell, list[i].Key, list[i].Value.ToString(), false, false);
                if (GUI.Button(cell, GUIContent.none, GUIStyle.none) && !busy)
                    MoveChest(list[i].Key, dir * (chestQty > 0 ? Math.Min(chestQty, list[i].Value) : list[i].Value));
            }
            GUI.EndScrollView();
            return sc;
        }
    }
}
