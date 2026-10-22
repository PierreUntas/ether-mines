// Ether Mines · the window (E): your bag, crafting, and the chest you opened (07-interface.js renderPanel,
// renderChest). Your bag: every item you hold, a sheet for the one you pick, put it in the bar's selected
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
            if (Chat.Typing) return;
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
            Ui.Fill(new Rect(0, 0, Ui.W, Ui.H), new Color(0.05f, 0.04f, 0.12f, 0.45f));
            Ui.Fill(new Rect(x, y, W, H), new Color(0.13f, 0.1f, 0.27f, 0.96f));
            Ui.Frame(new Rect(x, y, W, H), new Color(1, 1, 1, 0.12f));
            // the tabs
            float tx = x + 16, tw = Mathf.Min(120, (W - (W < 1000 ? 230 : 380)) / (Open != null ? 7 : 6) - 8); // narrower on a small screen
            foreach (var (k, t) in new[] { ("bag", "Your bag"), ("craft", "Crafting"), ("quest", "Objectives"), ("validators", "Validators"), ("shop", "Shop"), ("trade", Trade != null && Trade.Received > 0 ? $"Trade ({Trade.Received})" : "Trade"), ("chest", "Chest") })
            {
                if (k == "chest" && Open == null) continue;
                if ((k == "quest" || k == "validators" || k == "shop") && Progress == null) continue;
                if (k == "trade" && Trade == null) continue;
                if (GUI.Button(new Rect(tx, y + 12, tw, 30), t, Tab == k ? Ui.Primary : Ui.Button)) { Tab = k; scroll = Vector2.zero; }
                tx += tw + 8;
            }
            bool narrow = W < 1000; // a phone: the Gwei go to the bottom corner, the tabs keep the room
            GUI.Label(narrow ? new Rect(x + W - 170, y + H - 28, 150, 24) : new Rect(x + W - 350, y + 16, 150, 24), Session != null ? $"{Session.Gwei:0} Gwei" : "offline", Ui.Label);
            if (GUI.Button(new Rect(x + W - 70, y + 12, 54, 30), "✕", Ui.Button)) { Hide(); return; }
            // the sound, on or off (M)
            if (GUI.Button(new Rect(x + W - 134, y + 12, 58, 30), Sounds.On ? "♪ on" : "♪ off", Ui.Button)) Sounds.Toggle();
            // the vibrations (a phone, a gamepad), on or off
            if (GUI.Button(new Rect(x + W - 198, y + 12, 58, 30), Haptics.On ? "≋ on" : "≋ off", Ui.Button)) Haptics.Toggle();
            var body = new Rect(x + 16, y + 54, W - 32, H - 70);
            if (Tab == "bag") Bag(body);
            else if (Tab == "craft") CraftTab(body);
            else if (Tab == "chest" && Open != null) ChestTab(body);
            else if (Tab == "quest" && Progress != null) Progress.DrawObjectives(body);
            else if (Tab == "validators" && Progress != null) Progress.DrawValidators(body);
            else if (Tab == "trade" && Trade != null) Trade.Draw(body);
            else if (Tab == "shop" && Progress != null) (shop ??= new Shop { Session = Session, Progress = Progress, Avatars = Avatars }).Draw(body);
            if (Tab != "shop" && Avatars != null) { Avatars.TryLook = null; Avatars.TryColor = null; }
        }

        // ---------- your bag ----------
        struct Entry { public string Key; public int Id, N; public Unique U; }
        List<Entry> Entries()
        {
            var l = new List<Entry>();
            foreach (var kv in Inv.Counts.OrderBy(k => k.Key)) if (kv.Value > 0) l.Add(new Entry { Key = kv.Key.ToString(), Id = kv.Key, N = kv.Value });
            foreach (var u in Inv.Uniques) l.Add(new Entry { Key = "nft" + u.Serial, Id = u.Id, N = 1, U = u });
            return l;
        }

        void Cell(Rect r, int id, string count, bool sel, bool nft)
        {
            Ui.Fill(r, sel ? new Color(1, 1, 1, 0.28f) : new Color(1, 1, 1, 0.07f));
            if (nft) Ui.Frame(r, new Color(Ui.Cyan.r, Ui.Cyan.g, Ui.Cyan.b, 0.6f));
            if (sel) Ui.Frame(r, Color.white);
            Ui.Icon(new Rect(r.x + 6, r.y + 6, r.width - 12, r.height - 12), id);
            if (count != null) GUI.Label(new Rect(r.x, r.y, r.width - 4, r.height - 2), count, Ui.Count);
        }

        void Bag(Rect body)
        {
            var all = Entries();
            if (selKey == null || !all.Any(a => a.Key == selKey)) selKey = all.Count > 0 ? all[0].Key : null;
            float gw = body.width - 330, cs = 58;
            int cols = Mathf.Max(1, (int)(gw / (cs + 6)));
            var view = new Rect(0, 0, gw - 20, Mathf.Ceil(all.Count / (float)cols) * (cs + 6) + 10);
            gridRect = new Rect(body.x, body.y, gw, body.height);
            gridOverflows = view.height > body.height;
            scroll = GUI.BeginScrollView(new Rect(body.x, body.y, gw, body.height), scroll, view);
            if (all.Count == 0) GUI.Label(new Rect(0, 0, gw - 20, 40), "Your bag is empty. Mine a few blocks.", Ui.Small);
            for (int i = 0; i < all.Count; i++)
            {
                var a = all[i];
                var r = new Rect((i % cols) * (cs + 6), (i / cols) * (cs + 6), cs, cs);
                Cell(r, a.Id, a.U == null ? a.N.ToString() : null, a.Key == selKey, a.U != null);
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) selKey = a.Key;
            }
            GUI.EndScrollView();
            // the sheet of the item picked
            var c = new Rect(body.xMax - 310, body.y, 310, body.height);
            Ui.Fill(c, new Color(1, 1, 1, 0.06f));
            if (Avatars != null)
            {
                float ph = Mathf.Min(260, body.height * 0.45f);
                DrawPreview(Avatars, new Rect(c.x, c.y, c.width, ph));
                c = new Rect(c.x, c.y + ph, c.width, c.height - ph);
            }
            if (selKey == null) return;
            var e = all.First(z => z.Key == selKey);
            Ui.Icon(new Rect(c.x + 14, c.y + 14, 64, 64), e.Id);
            GUI.Label(new Rect(c.x + 90, c.y + 18, 210, 50), Ui.NameOf(e.Id) + (e.U != null ? " #" + e.U.Serial : ""), Ui.Title);
            GUI.Label(new Rect(c.x + 90, c.y + 56, 210, 22), e.U != null ? "Sealed · unique" : "Minted · fungible", Ui.Small);
            float ly = c.y + 96;
            void Row(string k, string v) { GUI.Label(new Rect(c.x + 14, ly, 140, 22), k, Ui.Small); GUI.Label(new Rect(c.x + 150, ly, 150, 22), v, Ui.Label); ly += 24; }
            if (e.U != null)
            {
                Row("Token", "#" + e.Id + "-" + e.U.Serial.ToString("0000"));
                if (!string.IsNullOrEmpty(e.U.Place)) Row(e.Id == 203 ? "Validator" : "Forge location", e.U.Place);
                var it = Rules.Item(e.Id);
                if (it != null && it.HasTool) Row("Blocks mined with", e.U.Mined.ToString());
            }
            else { Row("ID", "#" + e.Id); Row("In your bag", e.N.ToString()); }
            ly += 8;
            if (GUI.Button(new Rect(c.x + 14, ly, 282, 32), "Place in slot " + (Inv.Sel + 1), Ui.Primary))
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
                if (GUI.Button(new Rect(c.x + 14, ly, 282, 30), on ? "Unequip" : "Equip", Ui.Button)) { Session.State["armor"] = on ? null : e.Id.ToString(); Session.Dirty = true; }
                ly += 38;
            }
            if (Session != null && def != null && def.HasBoots)
            {
                bool on = State("boots") == e.Id.ToString();
                if (GUI.Button(new Rect(c.x + 14, ly, 282, 30), on ? "Take off" : "Wear", Ui.Button)) { Session.State["boots"] = on ? null : e.Id.ToString(); Session.Dirty = true; }
                ly += 38;
            }
            GUI.Label(new Rect(c.x + 14, ly, 282, 120), e.U != null
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
            float cx = body.x;
            if (GUI.Button(new Rect(cx, body.y, 70, 26), "All", craftCat == "" ? Ui.Primary : Ui.Button)) { craftCat = ""; scroll = Vector2.zero; }
            cx += 76;
            foreach (var c in cats)
            {
                float w = Ui.Button.CalcSize(new GUIContent(c)).x + 8;
                if (cx + w > body.xMax) break;
                if (GUI.Button(new Rect(cx, body.y, w, 26), c, craftCat == c ? Ui.Primary : Ui.Button)) { craftCat = c; scroll = Vector2.zero; }
                cx += w + 6;
            }
            var list = Rules.Recipes.Where(r => craftCat == "" || r.Cat == craftCat).ToList();
            float rh = 74;
            var view = new Rect(0, 0, body.width - 20, list.Count * rh + 40 * cats.Count);
            scroll = GUI.BeginScrollView(new Rect(body.x, body.y + 36, body.width, body.height - 36), scroll, view);
            float y = 0;
            string cat = null;
            foreach (var r in list)
            {
                if (r.Cat != cat) { cat = r.Cat; GUI.Label(new Rect(0, y + 6, 400, 26), cat, Ui.Title); y += 34; }
                bool hasReq = !r.HasReq || Owns(r.Req);
                bool ok = hasReq;
                var need = new List<string>();
                for (int i = 0; i < r.NeedIds.Length; i++)
                {
                    int have = Inv.Count(r.NeedIds[i]);
                    bool enough = have >= r.NeedCounts[i];
                    ok &= enough;
                    need.Add($"<color={(enough ? "#9fe3c4" : "#ff9ab8")}>{r.NeedCounts[i]} {Ui.NameOf(r.NeedIds[i])} ({have})</color>");
                }
                if (r.HasReq) need.Add($"<color={(hasReq ? "#9fe3c4" : "#ff9ab8")}>owning the {Ui.NameOf(r.Req)} (kept)</color>");
                Ui.Fill(new Rect(0, y, view.width, rh - 6), new Color(1, 1, 1, 0.05f));
                Ui.Icon(new Rect(8, y + 8, 52, 52), r.Out);
                GUI.Label(new Rect(70, y + 4, view.width - 200, 22), $"<b>{(r.N > 1 ? r.N + " × " : "")}{Ui.NameOf(r.Out)}</b>  <color=#c9c2f2>{r.D}</color>", Ui.Label);
                GUI.Label(new Rect(70, y + 28, view.width - 200, 40), string.Join("   ", need), Ui.Small);
                GUI.enabled = ok && !busy;
                if (GUI.Button(new Rect(view.width - 110, y + 18, 100, 32), "Craft", ok ? Ui.Primary : Ui.Button)) Craft(r);
                GUI.enabled = true;
                y += rh;
            }
            GUI.EndScrollView();
        }

        // ---------- a chest ----------
        void ChestTab(Rect body)
        {
            GUI.Label(new Rect(body.x, body.y, body.width, 22), $"Chest at {Open.X}, {Open.Y}, {Open.Z}. Click an item to move it. Inside a plot, only its owner and their invites can open it.", Ui.Small);
            float qx = body.x;
            GUI.Label(new Rect(qx, body.y + 28, 70, 26), "Quantity", Ui.Label);
            qx += 76;
            foreach (var (v, t) in new[] { (1, "1"), (10, "10"), (0, "All") })
            {
                if (GUI.Button(new Rect(qx, body.y + 26, 54, 26), t, chestQty == v ? Ui.Primary : Ui.Button)) chestQty = v;
                qx += 60;
            }
            float half = (body.height - 70) / 2;
            Zone(new Rect(body.x, body.y + 62, body.width, half), "In the chest", Open.Items, -1);
            Zone(new Rect(body.x, body.y + 70 + half, body.width, half), "In your bag", Inv.Counts, 1);
        }

        void Zone(Rect r, string title, Dictionary<int, int> items, int dir)
        {
            GUI.Label(new Rect(r.x, r.y, 300, 24), title, Ui.Title);
            var list = items.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key).ToList();
            if (list.Count == 0) GUI.Label(new Rect(r.x, r.y + 30, 400, 22), dir < 0 ? "The chest is empty." : "Nothing to deposit.", Ui.Small);
            float cs = 52;
            int cols = Mathf.Max(1, (int)(r.width / (cs + 6)));
            for (int i = 0; i < list.Count; i++)
            {
                var cell = new Rect(r.x + (i % cols) * (cs + 6), r.y + 30 + (i / cols) * (cs + 6), cs, cs);
                if (cell.yMax > r.yMax) break;
                Cell(cell, list[i].Key, list[i].Value.ToString(), false, false);
                if (GUI.Button(cell, GUIContent.none, GUIStyle.none) && !busy)
                    MoveChest(list[i].Key, dir * (chestQty > 0 ? Math.Min(chestQty, list[i].Value) : list[i].Value));
            }
        }
    }
}
