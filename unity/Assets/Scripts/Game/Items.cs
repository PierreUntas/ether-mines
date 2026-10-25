// Ether Mines · using things (06-actions.js place, 18-potions.js, 16-mobs.js dodge): right-click a chest to
// open it, an old validator's heart to relight it, a bed to make it home and rest at night, the table's
// food for a meal (faster for a while); right-click with a consumable in hand to spend it (the Ether
// Tonic's hearts, the Swift Elixir's speed, the Owl Draught's night sight, the Ward Incense, the Home
// Beacon). Q with the Front-Runner Boots worn: a quick dodge, out of reach for a moment.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Items : MonoBehaviour
    {
        public Session Session; // null offline
        public PlayerController Player;
        public Interaction Act;
        public Panel Panel;
        public Sky Sky;
        public GameLink Link;   // null offline
        public Combat Combat;   // null offline
        public Signs Signs;     // null offline
        public Hover Hover;

        public float Buff, Vision, Ward; // seconds left
        float dashT, dashCd, dashVx, dashVz;
        bool busy;
        GUIStyle buffStyle;

        public bool Warded => Ward > 0;

        static readonly HashSet<int> Reacting = new HashSet<int> { 73, 98, 135 };

        void Start() { if (Link != null) Link.Message += OnMessage; }
        void OnDestroy() { if (Link != null) Link.Message -= OnMessage; }

        int HeldConsumable()
        {
            int it = Act.Inv.Held != null ? Act.Inv.HeldId : 0;
            var d = Rules.Item(it);
            return d != null && d.Use != null && Act.Inv.Count(it) > 0 ? it : 0;
        }

        // a right-click: true when it was for one of these (Interaction then does nothing else)
        public bool Use(Hit t)
        {
            var tb = t != null ? Rules.Block(t.Id) : null;
            string sh = tb?.Shape ?? "";
            bool reacts = t != null && (Reacting.Contains(t.Id) || sh == "door" || sh == "lever" || sh == "table" || sh.StartsWith("bed", StringComparison.Ordinal) || (tb != null && tb.Sign) || Gestures.SeatHeight(t.Id) > 0);
            int potion = HeldConsumable();
            if (potion > 0 && !reacts) { Consume(potion); return true; }
            if (t == null) return false;
            bool sneak = Player.Sneaking;
            if (t.Id == 73) { Relight(t); return true; }
            if (t.Id == 98 && !sneak) { Panel.OpenChest(t.X, t.Y, t.Z); return true; }
            if (t.Id == 135 && !sneak) { Eat(); return true; }
            if (Gestures.SeatHeight(t.Id) > 0 && !sneak) { Gestures.I?.SitDown(t); return true; } // a chair, a sofa
            if (sh.StartsWith("bed", StringComparison.Ordinal) && !sneak) { Sleep(t); return true; }
            if (tb != null && tb.Sign && !sneak && Signs != null) { Signs.Use(t); return true; }
            return false;
        }

        bool Night { get { float h = Sky.Day % 1; return h <= 0.25f || h >= 0.78f; } }

        async void Relight(Hit t)
        {
            if (Session == null || busy) return;
            // three validators at most (054_three_validators.sql): a seal per validator you run
            if (Act.Inv.Uniques.FindAll(u => u.Id == 203).Count >= 3) { Hud.Feed("burn", "Dark validator", "three validators at most: you already run three"); Sounds.Hit("stone"); return; }
            busy = true;
            Act.Swing = 1;
            try
            {
                var b = Player.Body;
                var r = await Session.Act("relight", new Dictionary<string, object> { ["px"] = t.X, ["py"] = t.Y, ["pz"] = t.Z }, b.X, b.Y, b.Z);
                if (r == null || r.ContainsKey("refused")) { Sounds.Hit("stone"); return; }
                Sounds.Chime();
                Hud.Feed("burn", "1 Validator heart", "→ old validator relit: one crystal a minute, under your name");
                Effects.PopAt(t.X, t.Y, t.Z);
                if (r.ContainsKey("star")) { Hud.Feed("nft", Ui.NameOf(204), "a network milestone!"); Sounds.Theme(); }
                await Session.LoadInventory();
            }
            finally { busy = false; }
        }

        void Eat()
        {
            if (Session == null) { Buff = 90; return; }
            var day = Sky.DayN.ToString();
            if (Session.State.TryGetValue("repas", out var r) && r != null && (r is double d ? ((int)d).ToString() : r.ToString()) == day) { Hud.Feed("burn", "Not hungry yet", "one meal a day is enough"); return; }
            Session.State["repas"] = (double)Sky.DayN;
            Session.Dirty = true;
            Emotes.I?.Play("eat");
            Buff = 90;
            Act.Swing = 0.6f;
            Hud.Feed("mint", "A good meal", "you move faster for 90 seconds");
        }

        void Sleep(Hit t)
        {
            if (Session != null)
            {
                // this bed becomes home, for the Home Beacon, even by day
                var h = Home();
                if (h == null || h[0] != t.X || h[1] != t.Y || h[2] != t.Z)
                {
                    Session.State["home"] = new Dictionary<string, object> { ["x"] = (double)t.X, ["y"] = (double)t.Y, ["z"] = (double)t.Z };
                    Session.Dirty = true;
                    Hud.Feed("nft", "Home set", "a Home Beacon brings you back to this bed");
                }
            }
            if (!Night) { Hud.Feed("burn", "Too bright to sleep", "wait for nightfall"); return; }
            Gestures.I?.LieDown(t); // the others see you in it
            if (Link != null && Link.HpServer) Link.Send(new Dictionary<string, object> { ["t"] = "heal", ["kind"] = "bed" });
            if (Session != null && !(Session.State.TryGetValue("slept", out var sl) && MiniJson.Truthy(sl))) { Session.State["slept"] = 1.0; Session.Dirty = true; }
            Act.Swing = 0.6f;
            Sounds.Door();
            Hud.Feed("mint", "You rest", "full hearts. The night goes on for everyone in this world");
        }

        int[] Home()
        {
            if (Session == null || !Session.State.TryGetValue("home", out var h) || !(h is Dictionary<string, object> d)) return null;
            int x = MiniJson.ToInt(d["x"]), y = MiniJson.ToInt(d["y"]), z = MiniJson.ToInt(d["z"]);
            int id = Act.World.Get(x, y, z);
            return id >= 137 && id <= 144 ? new[] { x, y, z } : null;
        }

        async void Consume(int it)
        {
            if (busy) return;
            var u = Rules.Item(it).Use;
            if (u == "heal" && Combat != null && Combat.Hp >= 10) { Hud.Feed("burn", "Already in full health", "keep the tonic for later"); return; }
            var bed = u == "home" ? Home() : null;
            if (u == "home" && bed == null) { Hud.Feed("burn", "No bed to go back to", "sleep in a bed first: the beacon brings you back to it"); return; }
            // your hearts on the game server: it takes the tonic from your bag itself, then heals you
            if (u == "heal" && Link != null && Link.HpServer && Link.LootServer)
            {
                busy = true;
                tonicAt = Time.time;
                Link.Send(new Dictionary<string, object> { ["t"] = "use", ["item"] = 303 });
                return;
            }
            busy = true;
            try
            {
                if (Session != null)
                {
                    var r = await Session.Act("use_item", new Dictionary<string, object> { ["item"] = it, ["bx"] = bed?[0], ["by"] = bed?[1], ["bz"] = bed?[2] }, 0, 0, 0);
                    if (r == null || r.ContainsKey("refused")) return;
                }
                else Act.Inv.SetCounts(new Dictionary<string, object> { [it.ToString()] = (double)(Act.Inv.Count(it) - 1) });
            }
            finally { busy = false; }
            Act.Swing = 0.6f;
            switch (u)
            {
                case "heal":
                    if (Link != null && Link.HpServer) Link.Send(new Dictionary<string, object> { ["t"] = "heal", ["kind"] = "tonic" });
                    Hud.Feed("mint", "Ether Tonic", "+5 hearts"); break;
                case "speed": Buff = Mathf.Max(Buff, 120); Hud.Feed("mint", "Swift Elixir", "you run faster for 2 minutes"); break;
                case "vision": Vision = 180; Hud.Feed("mint", "Owl Draught", "you see in the dark for 3 minutes"); break;
                case "ward": Ward = 120; Hud.Feed("mint", "Ward Incense", "ordinary mobs ignore you for 2 minutes, unless you strike them"); break;
                case "home":
                    var b = Player.Body;
                    b.X = bed[0] + 0.5; b.Y = bed[1] + 1.05; b.Z = bed[2] + 0.5; b.Vy = 0;
                    Hud.Feed("mint", "Home Beacon", "back to your bed"); break;
            }
        }

        float tonicAt = -99;
        void OnMessage(string t, Dictionary<string, object> m)
        {
            if (t != "used" || tonicAt < 0) return;
            tonicAt = -99;
            busy = false;
            var r = m.TryGetValue("r", out var rv) ? rv as Dictionary<string, object> : null;
            if (r == null || !MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) { Hud.Feed("burn", "Refused", r != null && r.TryGetValue("err", out var e) ? e as string : "try again in a moment"); return; }
            if (r.TryGetValue("inv", out var inv)) Act.Inv.SetCounts(inv as Dictionary<string, object>);
            Act.Swing = 0.6f;
            Hud.Feed("mint", "Ether Tonic", "+5 hearts");
        }

        public bool BootsOn
        {
            get
            {
                if (Session == null || !Session.State.TryGetValue("boots", out var v) || v == null) return false;
                if ((v is double d ? ((int)d).ToString() : v.ToString()) != "211") return false;
                foreach (var u in Act.Inv.Uniques) if (u.Id == 211) return true;
                return false;
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            Buff = Mathf.Max(0, Buff - dt);
            Vision = Mathf.Max(0, Vision - dt);
            Ward = Mathf.Max(0, Ward - dt);
            dashCd = Mathf.Max(0, dashCd - dt);
            if (tonicAt > 0 && Time.time - tonicAt > 5) { tonicAt = -99; busy = false; Hud.Feed("burn", "No answer", "try again in a moment"); }
            Sky.Vision = Mathf.Min(1, Vision / 3);
            var b = Player.Body;
            if (b == null) return;
            bool boots = BootsOn;
            var bootsDef = Rules.Item(211);
            b.SpeedMul = (Buff > 0 ? 1.3 : 1) * (boots && bootsDef != null && bootsDef.HasBoots ? 1 + bootsDef.Boots : 1) * (Combat != null && Combat.Guarding ? 0.55 : 1) * (Hover != null && Hover.Riding != 0 ? 2 : 1);
            // the dodge: a short dash the way you're pushing (forward when you stand still)
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool q = k != null && k.qKey.wasPressedThisFrame; // the key at Q's place: A on a French keyboard
#else
            bool q = Input.GetKeyDown(KeyCode.Q);
#endif
            TouchPad.Poll();
            q |= TouchPad.Dash;
            float fx = Player.MoveX, fz = Player.MoveZ;            if (q && boots && !Ui.Blocking && dashCd <= 0 && dashT <= 0 && !(Hover != null && Hover.Aboard))
            {
                float l = Mathf.Sqrt(fx * fx + fz * fz);
                if (l < 0.1f) { fx = 0; fz = 1; } else { fx /= l; fz /= l; }
                double sn = Math.Sin(Player.Yaw), cs = Math.Cos(Player.Yaw);
                dashVx = (float)((-sn * fz + cs * fx) * 20);
                dashVz = (float)((-cs * fz - sn * fx) * 20);
                dashT = 0.2f;
                Effects.Burst((float)b.X - 0.5f, (float)b.Y + 0.2f, (float)b.Z - 0.5f, Avatars.Hex("#c2b8ff", Color.white)); // a puff of ether where you were
                dashCd = 1.6f;
                Link?.Send(new Dictionary<string, object> { ["t"] = "dodge" });
            }
            if (dashT > 0)
            {
                dashT -= dt;
                b.DashT = dashT; b.DashVx = dashVx; b.DashVz = dashVz;
            }
            else b.DashT = 0;
        }

        static string Mmss(float t) => $"{(int)(t / 60)}:{(int)(t % 60):00}";

        void OnGUI()
        {
            Ui.Begin();
            if (Ui.Cine) return; // a cinematic: the screen is the film's
            if (Player.Body == null) return;
            var on = new List<string>();
            if (Buff > 0) on.Add("⚡ " + Mmss(Buff));
            if (Vision > 0) on.Add("👁 " + Mmss(Vision));
            if (Ward > 0) on.Add("✦ ward " + Mmss(Ward));
            if (on.Count == 0) return;
            if (buffStyle == null) { buffStyle = new GUIStyle(GUI.skin.box) { fontSize = 15, alignment = TextAnchor.MiddleCenter }; }
            var s = string.Join(" · ", on);
            float w = buffStyle.CalcSize(new GUIContent(s)).x + 20;
            GUI.Box(new Rect(Ui.Safe.xMax - w - 16, Ui.Safe.y + 50, w, 30), s, buffStyle); // under the Gwei
        }
    }
}
