// Ether Mines · what guides you on screen (07-interface.js updateQuest, updateCompass, updatePlace,
// updateAttackBanner, ui; 10-loop.js's label under the crosshair; 14-startup.js updatePosHud): the clock
// with its sun or moon, your position and whose plot you stand in with a compass strip under it (north,
// the Atrium, the nearest Mempool, your objective's place), the players online, the objective at the top
// (chapter, the next step, the network's count, the way to the ruin, tower, sanctum or Titan), the hourly
// attack's banner, your Gwei, your plating and boots, a place's name as you enter it, and under the
// crosshair what you aim at and what you can do with it.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Guide : MonoBehaviour
    {
        public PlayerController Player;
        public Interaction Act;
        public Session Session;   // null offline
        public Sky Sky;
        public Items Items;
        public Animals Animals;
        public WorldView World;
        public Func<string> Online = () => null; // the players online (Multiplayer.Line)
        public Func<Progress> Progress = () => null;
        public Func<Combat> Combat = () => null;

        static readonly string[] TierName = { "your hand", "a wooden pickaxe", "the crystal pickaxe", "the pure ether pickaxe" };
        public static string Tier(int t) => TierName[Mathf.Clamp(t, 0, TierName.Length - 1)];
        static readonly int[] Tiers = { 3, 10, 25, 50, 100 }, RelitGoals = { 3, 7, 12, 20, 30, 50, 75, 100 };

        GUIStyle lbl, small, mono, place, placeSub, arrow, title;
        float t4, placeAt = -99, questFlash = -99;
        string placeName, placeSub2, placeSeen, lastQuest;
        // what's worked out a few times a second (not every frame)
        string questHead, questText, questWay, netLine, posLine, target, targetSub;
        bool targetMine;
        (float x, float z, string label)? goal;
        (float x, float z, float d)? arena;
        float wayAngle;

        void Update()
        {
            var b = Player != null ? Player.Body : null;
            if (b == null) return;
            if ((t4 -= Time.deltaTime) <= 0) { t4 = 0.4f; Think(b); }
            Aim(b);
        }

        // ---------- the objective, the place, the compass's marks ----------
        void Think(PlayerPhysics b)
        {
            // where you are
            var c = Claims.Instance?.At(b.X, b.Z);
            string me = Session?.Net.UserId;
            posLine = $"Position {Math.Floor(b.X)} · {Math.Floor(b.Z)}" + (c != null ? " · " + (c.Owner == me ? "your" : (c.OwnerName ?? "?") + "'s") + " plot" : "");
            // a place's name as you enter it
            var here = PlaceHere(b);
            var name = here?.title;
            if (name != placeSeen)
            {
                placeSeen = name;
                if (here != null) { placeName = here.Value.title; placeSub2 = here.Value.sub; placeAt = Time.time; }
            }
            // the objective
            var p = Progress();
            string qid = null;
            questWay = null; goal = null;
            if (p != null && p.Objective(out var ch, out var done, out var total, out qid, out var text))
            {
                questHead = $"{ch} {done}/{total}";
                questText = text;
            }
            else if (p != null)
            {
                int relit = p.Relit, g = relit + 10;
                foreach (var x in RelitGoals) if (x > relit) { g = x; break; }
                questHead = $"{relit}/{g}";
                questText = "Validators relit";
            }
            else { questHead = null; questText = null; }
            if (questText != null && questText != lastQuest) { if (lastQuest != null) questFlash = Time.time; lastQuest = questText; }
            int n = Animals.NetworkN, next = n;
            foreach (var x in Tiers) if (x > n) { next = x; break; }
            netLine = Session != null ? $"network {n}/{next}" : null;
            if (p != null)
            {
                if (qid == null || qid == "relight" || qid == "relit3")
                {
                    var r = NearestRuin(b);
                    if (r != null) { questWay = $"ruin at {Math.Round(r.Value.d)} m"; goal = (r.Value.x, r.Value.z, "Ruin"); }
                }
                else if (qid == "plasma")
                {
                    var t = Nearest(b, EtherMines.Core.World.TOWER, (i, j) => EtherMines.Core.World.TowerAt(i, j), s => (s.X + 0.5f, s.Z + 0.5f));
                    if (t != null) { questWay = $"tower at {Math.Round(t.Value.d)} m"; goal = (t.Value.x, t.Value.z, "Tower"); }
                }
                else if (qid == "mergeVisit" || qid == "mergeTwins")
                {
                    var m = Nearest(b, EtherMines.Core.World.MERGE, (i, j) => EtherMines.Core.World.MergeAt(i, j), s => (((MergeSite)s).Sx + 0.5f, ((MergeSite)s).Sz + 0.5f));
                    if (m != null) { questWay = $"sanctum at {Math.Round(m.Value.d)} m"; goal = (m.Value.x, m.Value.z, "Sanctum"); }
                }
                if (p.Has(104) && questWay == null)
                {
                    // the Genesis Titan, once you hold a genesis fragment
                    float bx = ((EtherMines.Core.World.SPAWN.X + 160) >> 4) * 16 + 8.5f, bz = ((EtherMines.Core.World.SPAWN.Z + 160) >> 4) * 16 + 8.5f;
                    questWay = $"Genesis Titan at {Math.Round(EtherMines.Core.World.Hypot(bx - b.X, bz - b.Z))} m";
                    wayX = bx; wayZ = bz;
                }
                else if (goal != null) { wayX = goal.Value.x; wayZ = goal.Value.z; }
            }
            arena = Nearest(b, EtherMines.Core.World.ARENA, (i, j) => EtherMines.Core.World.ArenaAt(i, j), s => (s.X + 0.5f, s.Z + 0.5f));
        }
        float wayX, wayZ;

        (float x, float z, float d)? Nearest(PlayerPhysics b, int cell, Func<int, int, Site> at, Func<Site, (float, float)> spot)
        {
            int cx = (int)Math.Floor(b.X / cell), cz = (int)Math.Floor(b.Z / cell);
            (float x, float z, float d)? best = null;
            for (int dz = -2; dz <= 2; dz++)
                for (int dx = -2; dx <= 2; dx++)
                {
                    var s = at(cx + dx, cz + dz);
                    if (s == null) continue;
                    var (x, z) = spot(s);
                    float d = (float)EtherMines.Core.World.Hypot(x - b.X, z - b.Z);
                    if (best == null || d < best.Value.d) best = (x, z, d);
                }
            return best;
        }

        // the nearest ruin whose validator is still dark (nearestRuin)
        (float x, float z, float d)? NearestRuin(PlayerPhysics b)
        {
            int R = EtherMines.Core.World.RUIN, rx = (int)Math.Floor(b.X / R), rz = (int)Math.Floor(b.Z / R);
            var relitAt = Session != null && Session.State.TryGetValue("relitAt", out var ra) ? ra as Dictionary<string, object> : null;
            (float x, float z, float d)? best = null;
            for (int dz = -2; dz <= 2; dz++)
                for (int dx = -2; dx <= 2; dx++)
                {
                    var r = EtherMines.Core.World.RuinAt(rx + dx, rz + dz);
                    if (r == null) continue;
                    if (relitAt != null && relitAt.ContainsKey(r.X + "," + (r.Y + 1) + "," + r.Z)) continue;
                    if (World.Loaded(r.X, r.Z) && World.Get(r.X, r.Y + 1, r.Z) != 73) continue;
                    float d = (float)EtherMines.Core.World.Hypot(r.X + 0.5 - b.X, r.Z + 0.5 - b.Z);
                    if (best == null || d < best.Value.d) best = (r.X + 0.5f, r.Z + 0.5f, d);
                }
            return best;
        }

        // the place you're in, if it has a name (placeHere)
        static (string title, string sub)? PlaceHere(PlayerPhysics b)
        {
            double x = b.X, y = b.Y, z = b.Z;
            if (EtherMines.Core.World.Hypot(x - EtherMines.Core.World.SPAWN.X - 0.5, z - EtherMines.Core.World.SPAWN.Z - 0.5) <= 8) return ("The Atrium", "sanctuary of the first validator");
            if (EtherMines.Core.World.InCity(x, z)) return ("The City", "under the great diamond");
            var mg = EtherMines.Core.World.MergeAt((int)Math.Floor(x / EtherMines.Core.World.MERGE), (int)Math.Floor(z / EtherMines.Core.World.MERGE));
            if (mg != null && EtherMines.Core.World.Hypot(mg.X - x, mg.Z - z) < EtherMines.Core.World.MERGE_R + 1 && y > mg.Y && y < mg.Y + 12) return ("The Merge Sanctum", "where work and stake become one");
            var ar = EtherMines.Core.World.ArenaAt((int)Math.Floor(x / EtherMines.Core.World.ARENA), (int)Math.Floor(z / EtherMines.Core.World.ARENA));
            if (ar != null && EtherMines.Core.World.Hypot(ar.X - x, ar.Z - z) < EtherMines.Core.World.ARENA_W + 1 && y > ar.Y && y < ar.Y + 14) return ("The Mempool", "where pending transactions wait, and the Front-Runner cuts the line");
            if (EtherMines.Core.World.OnPath(Math.Floor(x), Math.Floor(z), 2)) return ("The validators path", "from the Atrium to the City");
            var r = EtherMines.Core.World.RuinAt((int)Math.Floor(x / EtherMines.Core.World.RUIN), (int)Math.Floor(z / EtherMines.Core.World.RUIN));
            if (r != null && EtherMines.Core.World.Hypot(r.X - x, r.Z - z) < 7 && Math.Abs(r.Y - y) < 8) return ("Old ruins", "a validator waits here for its heart");
            var j = EtherMines.Core.World.GardenAt((int)Math.Floor(x / 64), (int)Math.Floor(z / 64));
            if (j != null && EtherMines.Core.World.Hypot(j.X - x, j.Z - z) < 6 && Math.Abs(j.Y - y) < 6) return ("Ether Garden", "a quiet corner");
            if (y > EtherMines.Core.World.SY - 22 && EtherMines.Core.World.IslandTop(Math.Floor(x), Math.Floor(z)) > 0) return ("Sky islands", "land of the jellyfish");
            if (y < EtherMines.Core.World.DEEP - 2) return ("The depths", "geodes and genesis rock");
            return null;
        }

        // ---------- what's under the crosshair (10-loop.js) ----------
        void Aim(PlayerPhysics b)
        {
            target = null; targetSub = null; targetMine = false;
            if (!Ui.Aiming || Ui.Blocking) return;
            double cp = Math.Cos(Player.Pitch);
            var eye = new Vector3((float)b.X, (float)(b.Y + PlayerPhysics.EYE), (float)b.Z);
            var dir = new Vector3((float)(-Math.Sin(Player.Yaw) * cp), (float)Math.Sin(Player.Pitch), (float)(-Math.Cos(Player.Yaw) * cp));
            var t = Act.Target;
            float bd = t != null ? Mobs.RayBox(eye, dir, new Vector3(t.X, t.Y, t.Z), new Vector3(t.X + 1, t.Y + 1, t.Z + 1)) : float.MaxValue;
            if (bd < 0) bd = float.MaxValue;
            bool touch = TouchPad.Active;
            string attack = (touch ? "tap and hold" : "left-click") + ": attack";
            var cb = Combat();
            var mob = cb?.Mobs?.Pick(eye, dir, 5.2f, bd);
            if (mob != null)
            {
                target = mob.Kind.N + (mob.Kind.Hp >= 40 ? $" · {Math.Ceiling(mob.Hp)}/{mob.Kind.Hp}" : "");
                targetSub = attack;
                return;
            }
            if (cb?.Avatars != null && !Interaction.Sanctuary(b.X, b.Z))
            {
                var who = cb.Avatars.Pick(eye, dir, 5.2f, bd);
                if (who != null && cb.Avatars.Driving(who, out _, out _, out var nm)) { target = nm; targetSub = attack; return; }
            }
            var an = Animals != null ? Animals.Pick(eye, dir, 5.2f, bd) : null;
            if (an != null) { target = Animals.Label(an, out targetSub); return; }
            if (t == null) return;
            var bdef = Rules.Block(t.Id);
            if (bdef == null) return;
            target = bdef.N;
            string tap = touch ? "tap" : "right-click";
            bool toggles = bdef.Shape == "door" || bdef.Shape == "lever";
            string locked = null;
            if (!double.IsInfinity(bdef.H))
            {
                if (Claims.Instance != null) locked = Claims.Instance.Refusal(t.X, t.Z, toggles);
                else if (!toggles && Session != null && Interaction.Sanctuary(t.X, t.Z)) locked = "the Atrium and the City belong to everyone";
            }
            var own = World.Store.OwnerOf(t.X, t.Y, t.Z);
            string me = Session?.Net.UserId;
            targetMine = own != null && me != null && own.By == me;
            if (t.Id == 73)
            {
                bool down = false;
                for (int i = 0; i < 3; i++) if (!Mesher.IsSolid(World.Get(t.X + 2, t.Y + i, t.Z + 2))) down = true;
                targetSub = down ? "rebuild the fourth column (its +x, +z corner) first" : tap + " with a validator heart to relight it";
            }
            else if (t.Id == 74) targetSub = "relit · mints a crystal a minute for whoever relit it";
            else if (t.Id == 135) targetSub = tap + " to eat: increased speed for a while";
            else if (bdef.Shape != null && bdef.Shape.StartsWith("bed", StringComparison.Ordinal)) targetSub = tap + " to sleep: rest and set your home";
            else if (locked != null) targetSub = "locked · " + locked;
            else if (!Act.Inv.CanMine(t.Id) && !double.IsInfinity(bdef.H)) targetSub = "you need " + Tier(Rules.ReqTier(t.Id));
            else if (!EtherMines.Core.World.InWorld(t.X, t.Z)) targetSub = "edge of the world";
            else if (own != null && own.Serial > 0) targetSub = $"placed by {(targetMine ? "you" : own.Name ?? "someone")} · block #{own.Serial}";
            else { int tid = bdef.HasDrop ? bdef.Drop : t.Id; targetSub = "natural · drops token #" + (tid == 0 ? "—" : tid.ToString()); }
        }

        // ---------- drawing ----------
        void Styles()
        {
            if (lbl != null) return;
            GUIStyle S(int size, Color c, FontStyle f = FontStyle.Normal, TextAnchor a = TextAnchor.MiddleLeft)
            {
                var s = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = f, alignment = a, richText = true, wordWrap = false, clipping = TextClipping.Clip };
                s.normal.textColor = c;
                return s;
            }
            lbl = S(14, Ui.Paper);
            small = S(11, Ui.Muted);
            mono = S(12, Ui.Paper);
            title = S(13, Ui.Paper, FontStyle.Normal, TextAnchor.MiddleCenter);
            place = S(40, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
            placeSub = S(13, Ui.Cyan, FontStyle.Normal, TextAnchor.MiddleCenter);
            arrow = S(14, Ui.Cyan, FontStyle.Bold, TextAnchor.MiddleCenter);
        }

        static float Width(GUIStyle s, string t) => s.CalcSize(new GUIContent(t)).x;

        void OnGUI()
        {
            var b = Player != null ? Player.Body : null;
            if (b == null) return;
            Ui.Begin();
            Styles();
            var sa = Ui.Safe;
            bool touch = TouchPad.Active;
            float L = sa.x + 16, T = sa.y + 12, W = Ui.W, H = Ui.H;
            if (!Ui.PanelOpen)
            {
                // the clock: the sun or the moon, the day and the hour
                string clock = $"Day {Sky.DayN} · {(int)(Sky.Day * 24):00}:{(int)(Sky.Day * 24 * 60 % 60):00}";
                float cw = Width(lbl, clock) + 44;
                Ui.Chip(new Rect(L, T, cw, 32));
                SunIcon(new Rect(L + 10, T + 7, 18, 18), Sky.Night < 0.5f);
                GUI.Label(new Rect(L + 34, T, cw - 36, 32), clock, lbl);
                // where you are, and the compass strip under it
                float bw = Mathf.Max(170, Width(mono, posLine ?? "") + 20);
                Ui.Chip(new Rect(L, T + 40, bw, 64));
                GUI.Label(new Rect(L, T + 42, bw, 20), posLine, new GUIStyle(mono) { alignment = TextAnchor.MiddleCenter });
                Compass(new Rect(L + (bw - 150) / 2, T + 66, 150, 18), b);
                float y = T + 112;
                // the players online (the game server's word)
                var on = Online();
                if (!string.IsNullOrEmpty(on))
                {
                    float ow = Mathf.Min(W * 0.4f, Width(mono, on) + 30);
                    Ui.Chip(new Rect(L, y, ow, 28));
                    Ui.Fill(new Rect(L + 10, y + 10, 8, 8), Ui.Mint);
                    GUI.Label(new Rect(L + 24, y, ow - 28, 28), on, mono);
                    y += 36;
                }
                if (World.Status != null && World.Status.StartsWith("offline")) { GUI.Label(new Rect(L, y, 400, 20), World.Status, small); y += 22; }
                // your plating and boots
                string armor = ArmorLine();
                if (armor != null)
                {
                    var st = new GUIStyle(mono) { wordWrap = true };
                    st.normal.textColor = Ui.Cyan;
                    float aw = Mathf.Min(W * 0.45f, Width(mono, armor) + 20), ah = touch && armor.Contains("\n") ? 44 : 26;
                    Ui.Chip(new Rect(L, y, aw, ah));
                    GUI.Label(new Rect(L + 10, y, aw - 14, ah), armor, st);
                }
                // your Gwei, top right
                if (Session != null)
                {
                    string g = $"{Session.Gwei:0} Gwei";
                    float gw = Width(lbl, g) + 24, gx = sa.xMax - 16 - gw;
                    Ui.Chip(new Rect(gx, T, gw, 30));
                    var gs = new GUIStyle(lbl) { alignment = TextAnchor.MiddleCenter };
                    gs.normal.textColor = Ui.Gold;
                    GUI.Label(new Rect(gx, T, gw, 30), g, gs);
                }
                // the objective, top center (under the buttons on a touch screen)
                float qy = touch ? sa.y + 56 : T;
                if (questText != null)
                {
                    var parts = new List<(string t, Color c)> { (questHead + "  ", Ui.Gold), (questText, Ui.Paper) };
                    if (netLine != null) parts.Add(("   " + netLine, Ui.Gold));
                    float qw = 24;
                    foreach (var (t, _) in parts) qw += Width(lbl, t);
                    if (questWay != null) qw += Width(lbl, "    " + questWay) + 18;
                    qw = Mathf.Min(qw, W - 380);
                    float qx = (W - qw) / 2;
                    float fl = Mathf.Clamp01(1 - (Time.time - questFlash) / 1.2f);
                    Ui.Chip(new Rect(qx, qy, qw, 32), fl > 0 ? Color.Lerp(Ui.Line, Ui.Gold, fl) : (Color?)null);
                    float cx = qx + 12;
                    foreach (var (t, c) in parts)
                    {
                        var st = new GUIStyle(lbl); st.normal.textColor = c;
                        float w = Width(lbl, t);
                        GUI.Label(new Rect(cx, qy, Mathf.Min(w, qx + qw - cx), 32), t, st);
                        cx += w;
                    }
                    if (questWay != null && cx < qx + qw - 40)
                    {
                        cx += 10;
                        Arrow(new Rect(cx, qy + 7, 18, 18), b, wayX, wayZ);
                        var st = new GUIStyle(lbl); st.normal.textColor = Ui.Cyan;
                        GUI.Label(new Rect(cx + 20, qy, qx + qw - cx - 24, 32), questWay, st);
                    }
                    qy += 40;
                }
                // the hourly attack on the network
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (now % 3600 < 600)
                {
                    long win = now / 3600, left = 600 - now % 3600;
                    int kills = Animals.AttackWindow == win ? Animals.AttackKills : 0;
                    string clk = $"{left / 60:00}:{left % 60:00}";
                    string line = touch ? $"Atrium under attack · {clk} · {kills} node{(kills == 1 ? "" : "s")}" : $"The network is under attack: defend the Atrium · {clk} · {kills} corrupted node{(kills == 1 ? "" : "s")} defeated";
                    float aw = Mathf.Min(W - 32, Width(lbl, line) + 28), ax = (W - aw) / 2;
                    float pulse = 0.5f + 0.5f * Mathf.Sin(Time.time * 4);
                    Ui.Chip(new Rect(ax, qy, aw, 30), Color.Lerp(Ui.Burn, Color.white, pulse * 0.3f));
                    GUI.Label(new Rect(ax, qy, aw, 30), line, new GUIStyle(lbl) { alignment = TextAnchor.MiddleCenter });
                }
                // a place's name, as you enter it: in, held, out (4.2 s)
                float pa = Time.time - placeAt;
                if (pa < 4.2f && placeName != null)
                {
                    float a = pa < 0.5f ? pa / 0.5f : pa > 3.2f ? (4.2f - pa) : 1;
                    var o = GUI.color;
                    GUI.color = new Color(1, 1, 1, a);
                    GUI.Label(new Rect(0, H * 0.22f, W, 52), placeName, place);
                    GUI.Label(new Rect(0, H * 0.22f + 52, W, 20), placeSub2, placeSub);
                    GUI.color = o;
                }
            }
            // what you aim at, under the crosshair
            if (target != null && Ui.Aiming)
            {
                float tw = Mathf.Max(Width(title, target), Width(small, targetSub ?? "")) + 22, tx = (W - tw) / 2, ty = H / 2 + 22;
                Ui.Chip(new Rect(tx, ty, tw, targetSub != null ? 40 : 26), targetMine ? Ui.Violet : (Color?)null);
                GUI.Label(new Rect(tx, ty + 2, tw, 20), target, title);
                if (targetSub != null) GUI.Label(new Rect(tx, ty + 20, tw, 16), targetSub, new GUIStyle(small) { alignment = TextAnchor.MiddleCenter });
            }
        }

        string ArmorLine()
        {
            string a = null;
            if (Session != null && Session.State.TryGetValue("armor", out var av) && av != null)
            {
                int id = av is string s ? (int.TryParse(s, out var v) ? v : 0) : MiniJson.ToInt(av);
                var it = Rules.Item(id);
                if (it != null && it.HasArmor) a = $"Plating · {it.N} · -{Math.Round(it.Armor * 100)}% damage";
            }
            if (Items != null && Items.BootsOn)
            {
                var bt = Rules.Item(211);
                string boots = $"Boots · +{Math.Round((bt != null && bt.HasBoots ? bt.Boots : 0) * 100)}% speed" + (TouchPad.Active ? "" : " · Q: dodge");
                a = a == null ? boots : a + (TouchPad.Active ? "\n" : "  ·  ") + boots;
            }
            return a;
        }

        // the sun (a square with its four rays) or the moon (a crescent), 9 x 9 pixels as on the web
        static void SunIcon(Rect r, bool day)
        {
            float u = r.width / 9;
            void P(int x, int y, int w, int h, Color c) => Ui.Fill(new Rect(r.x + x * u, r.y + y * u, w * u, h * u), c);
            if (day) { var c = Ui.Gold; P(2, 2, 5, 5, c); P(4, 0, 1, 9, c); P(0, 4, 9, 1, c); }
            else { P(2, 1, 4, 7, new Color(0.9f, 0.91f, 1)); P(4, 1, 3, 5, new Color(0.11f, 0.086f, 0.23f)); }
        }

        // an arrow pointing the way to (x, z) as you face (arrowTo, but turned smoothly)
        void Arrow(Rect r, PlayerPhysics b, float x, float z)
        {
            double dx = x - b.X, dz = z - b.Z, yaw = Player.Yaw;
            double f = dx * -Math.Sin(yaw) + dz * -Math.Cos(yaw), rr = dx * Math.Cos(yaw) + dz * -Math.Sin(yaw);
            float ang = (float)(Math.Atan2(rr, f) * Mathf.Rad2Deg);
            // turned about its own middle, inside the interface's scale
            var m = GUI.matrix;
            var c = new Vector3(r.center.x, r.center.y, 0);
            GUI.matrix = m * Matrix4x4.TRS(c, Quaternion.Euler(0, 0, ang), Vector3.one) * Matrix4x4.TRS(-c, Quaternion.identity, Vector3.one);
            GUI.Label(r, "↑", arrow);
            GUI.matrix = m;
        }

        // the compass strip (updateCompass): what lies ahead within 0.9 π of where you face
        void Compass(Rect r, PlayerPhysics b)
        {
            const float fov = Mathf.PI * 0.9f;
            float k = r.width / fov, heading = (float)-Player.Yaw;
            Ui.Fill(new Rect(r.x, r.y, r.width, 1), Ui.Line);
            // the middle mark
            Ui.Fill(new Rect(r.x + r.width / 2 - 1, r.y + 1, 2, 4), Ui.Gold);
            var o = GUI.color;
            // the directions on the strip, the places (one glyph each, as the web's ⌂ ⚔) on a row below it
            void Mark(float bearing, string text, Color c, int size, float dy = 2)
            {
                float rel = Mathf.Atan2(Mathf.Sin(bearing - heading), Mathf.Cos(bearing - heading));
                if (Mathf.Abs(rel) > fov / 2) return;
                float x = r.x + r.width / 2 + rel * k;
                var st = new GUIStyle(mono) { fontSize = size, alignment = TextAnchor.MiddleCenter };
                st.normal.textColor = c;
                float w = Width(st, text);
                GUI.color = new Color(1, 1, 1, 1 - Mathf.Pow(Mathf.Abs(rel) / (fov / 2), 3));
                GUI.Label(new Rect(x - w / 2, r.y + dy, w, r.height - 2), text, st);
            }
            string[] dirs = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            for (int i = 0; i < 8; i++) Mark(i * Mathf.PI / 4, dirs[i], i == 0 ? Ui.Gold : i % 2 == 0 ? Ui.Paper : Ui.Muted, i % 2 == 0 ? 11 : 9);
            float Bear(float x, float z) => Mathf.Atan2((float)(x - b.X), -(float)(z - b.Z));
            int spx = EtherMines.Core.World.SPAWN.X, spz = EtherMines.Core.World.SPAWN.Z;
            if (EtherMines.Core.World.Hypot(spx - b.X, spz - b.Z) >= 6) Mark(Bear(spx + 0.5f, spz + 0.5f), "⌂", Ui.Mint, 12, 15);
            if (arena != null && arena.Value.d <= 400 && arena.Value.d >= EtherMines.Core.World.ARENA_W) Mark(Bear(arena.Value.x, arena.Value.z), "⚔", new Color(1, 0.62f, 0.78f), 12, 15);
            if (goal != null) Mark(Bear(goal.Value.x, goal.Value.z), "◆", Ui.Cyan, 11, 15); // its name and distance are in the objective chip
            GUI.color = o;
        }
    }
}
