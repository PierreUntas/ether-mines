// Ether Mines · mining, placing and using blocks (10-loop.js mining, 06-actions.js breakBlock/place/
// toggleDoor): hold the left button to mine what you aim at (harder blocks take longer, a better pickaxe
// goes faster, some rock needs a better one), right-click to place the block in hand, or to open a door
// or pull a lever; 1-9 or the wheel choose from the bar. Changes show at once; the server has the last word.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Interaction : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;
        public Session Session; // null offline
        public readonly Inventory LocalInv = new Inventory(); // offline: what you carry, this time only
        public Hit Target;
        public float MineProgress; // 0..1, for the HUD
        public float Swing;        // the hand's swing (0..1), for the view
        const double Reach = 5.2;

        string mineKey;
        double mineT, hitT, placeCd;
        GameObject outline;
        int lastPos;

        public Inventory Inv => Session != null ? Session.Inv : LocalInv;
        void Say(string k, string t, string d = "") { if (Session != null) Session.Say(k, t, d); else Hud.Feed(k, t, d); }

        void Start()
        {
            outline = MakeOutline();
        }

        void Update()
        {
            if (Player == null || Player.Body == null) return;
            ReadButtons(out bool mining, out bool use, out int slot, out float wheel);
            var inv = Inv;
            if (slot >= 0) inv.Sel = slot;
            if (wheel != 0) inv.Sel = ((inv.Sel + (wheel > 0 ? -1 : 1)) % 9 + 9) % 9;
            Swing = Mathf.Max(0, Swing - Time.deltaTime * 3);

            // what you aim at, from your eyes along your look
            var b = Player.Body;
            double cp = Math.Cos(Player.Pitch);
            double dx = -Math.Sin(Player.Yaw) * cp, dy = Math.Sin(Player.Pitch), dz = -Math.Cos(Player.Yaw) * cp;
            Target = Cursor.lockState == CursorLockMode.Locked ? Raycast.Cast(World.Get, b.X, b.Y + PlayerPhysics.EYE, b.Z, dx, dy, dz, Reach) : null;
            PlaceOutline();

            double dt = Time.deltaTime;
            var bd = Target != null ? Rules.Block(Target.Id) : null;
            if (mining && Target != null && bd != null && !double.IsInfinity(bd.H) && World_InWorld(Target) && !Protected(Target.X, Target.Z))
            {
                Swing = Mathf.Max(Swing, 0.6f);
                if (!inv.CanMine(Target.Id))
                {
                    hitT -= dt;
                    if (hitT <= 0) { hitT = 6; Say("burn", "Too hard for this tool", "you need a better pickaxe"); }
                    MineProgress = 0;
                }
                else
                {
                    var k = Target.X + "," + Target.Y + "," + Target.Z;
                    if (k != mineKey) { mineKey = k; mineT = 0; }
                    mineT += dt * inv.HeldTool;
                    MineProgress = (float)Math.Min(1, mineT / bd.H);
                    if (MineProgress >= 1) { Break(Target); mineKey = null; mineT = 0; MineProgress = 0; }
                }
            }
            else { mineKey = null; mineT = 0; MineProgress = 0; if (mining) Swing = Mathf.Max(Swing, 0.6f); }

            placeCd -= dt;
            if (use && placeCd <= 0 && Target != null) { placeCd = 0.2; Use(Target); }

            // the server's idea of where you are (move validation): a ping every 15 s while you move
            if (Session != null && Time.time - lastPos > 15) { lastPos = (int)Time.time; _ = Session.Act("pos", new Dictionary<string, object>(), b.X, b.Y, b.Z); }
        }

        static bool World_InWorld(Hit t) => EtherMines.Core.World.InWorld(t.X, t.Z);

        // the Atrium and the City belong to everyone (mobs-core.js sanctuary): nobody mines or builds there
        public static bool Sanctuary(double x, double z)
        {
            double fx = Math.Floor(x), fz = Math.Floor(z);
            return EtherMines.Core.World.Hypot(fx - EtherMines.Core.World.SPAWN.X, fz - EtherMines.Core.World.SPAWN.Z) <= 7.9 ||
                   EtherMines.Core.World.Hypot(fx - EtherMines.Core.World.CITY.X, fz - EtherMines.Core.World.CITY.Z) <= EtherMines.Core.World.CITY.R + 0.5;
        }
        float protectT;
        bool Protected(int x, int z)
        {
            if (Session == null || !Sanctuary(x, z)) return false;
            if (Time.time > protectT) { protectT = Time.time + 4; Say("burn", "Protected area", "the Atrium and the City belong to everyone: build elsewhere"); }
            return true;
        }

        void Write(int x, int y, int z, int id, Owner own)
        {
            World.Store.Edit(new BlockEdit { X = x, Y = y, Z = z, Id = id, PlacedBy = own?.By, PlacedName = own?.Name, Serial = own?.Serial ?? 0 });
            World.Rebuild(x, z);
        }

        // changes from the server ({x, y, z, id, by, name, serial}): the truth, written over our guess
        void Apply(Dictionary<string, object> r)
        {
            if (r == null || !r.TryGetValue("changes", out var ch) || !(ch is List<object> list)) return;
            foreach (var o in list)
                if (o is Dictionary<string, object> c)
                    Write(MiniJson.ToInt(c["x"]), MiniJson.ToInt(c["y"]), MiniJson.ToInt(c["z"]), MiniJson.ToInt(c["id"]),
                        c.TryGetValue("by", out var by) && by is string s ? new Owner { By = s, Name = c.TryGetValue("name", out var n) ? n as string : null, Serial = (long)MiniJson.ToDouble(c.TryGetValue("serial", out var se) ? se : null) } : null);
        }

        // what was there before a guess, to put back if the server refuses
        List<(int x, int y, int z, int id, Owner own)> Record(IEnumerable<int[]> cells)
        {
            var rec = new List<(int, int, int, int, Owner)>();
            foreach (var c in cells) rec.Add((c[0], c[1], c[2], World.Get(c[0], c[1], c[2]), World.Store.OwnerOf(c[0], c[1], c[2])));
            return rec;
        }
        void Revert(List<(int x, int y, int z, int id, Owner own)> rec) { foreach (var r in rec) Write(r.x, r.y, r.z, r.id, r.own); }

        async void Break(Hit t)
        {
            int id = World.Get(t.X, t.Y, t.Z);
            var bd = Rules.Block(id);
            if (bd == null || id == 12) return;
            // the block, the other half of a door, and what stood on it (a plant, a plate, a cable, a lever)
            var cells = new List<int[]> { new[] { t.X, t.Y, t.Z, 0 } };
            if (bd.Shape == "door")
            {
                int oy = bd.Top ? t.Y - 1 : t.Y + 1;
                var ob = Rules.Block(World.Get(t.X, oy, t.Z));
                if (ob != null && ob.Shape == "door") cells.Add(new[] { t.X, oy, t.Z, 0 });
            }
            int above = World.Get(t.X, t.Y + 1, t.Z);
            var ab = Rules.Block(above);
            if (Mesher.IsCross(above) || (ab != null && (ab.Shape == "plate" || ab.Shape == "cable" || ab.Shape == "lever"))) cells.Add(new[] { t.X, t.Y + 1, t.Z, 0 });
            var rec = Record(cells);
            foreach (var c in cells) Write(c[0], c[1], c[2], 0, null);
            Swing = 1;
            if (Session == null)
            {
                int drop = bd.HasDrop ? bd.Drop : id;
                if (drop > 0) LocalInv.SetCounts(new Dictionary<string, object> { [drop.ToString()] = (double)(LocalInv.Count(drop) + 1) });
                return;
            }
            var b = Player.Body;
            var r = await Session.Act("mine", new Dictionary<string, object> { ["px"] = t.X, ["py"] = t.Y, ["pz"] = t.Z, ["held"] = Inv.Held }, b.X, b.Y, b.Z);
            if (r == null || r.ContainsKey("refused")) { Revert(rec); if (r != null && r["cell"] is double cell) Write(t.X, t.Y, t.Z, (int)cell, rec[0].own); return; }
            Apply(r);
            if (r.TryGetValue("got", out var g) && g is Dictionary<string, object> got && MiniJson.ToInt(got.TryGetValue("n", out var gn) ? gn : null) > 0)
            {
                int item = MiniJson.ToInt(got["item"]);
                Session.Say("mint", MiniJson.ToInt(gn) + " " + NameOf(item), item == 101 ? "mined from ore" : "token #" + item);
            }
        }

        public static string NameOf(int id) { var b = Rules.Block(id); if (b != null) return b.N; var it = Rules.Item(id); return it != null ? it.N : "#" + id; }

        async void Use(Hit t)
        {
            var bd = Rules.Block(t.Id);
            var b = Player.Body;
            // a door or a lever: open, close, pull
            if (bd != null && (bd.Shape == "door" || bd.Shape == "lever") && !Player.Sneaking)
            {
                var cells = bd.Shape == "door" ? Placement.ToggleDoor(t.X, t.Y, t.Z, t.Id, World.Get) : new List<int[]> { new[] { t.X, t.Y, t.Z, bd.On ? 64 : 65 } };
                if (cells.Count == 0) return;
                var rec = Record(cells);
                foreach (var c in cells) Write(c[0], c[1], c[2], c[3], World.Store.OwnerOf(c[0], c[1], c[2]));
                Swing = 0.6f;
                if (Session == null) return;
                var r = await Session.Act("toggle", new Dictionary<string, object> { ["px"] = t.X, ["py"] = t.Y, ["pz"] = t.Z }, b.X, b.Y, b.Z);
                if (r == null || r.ContainsKey("refused")) Revert(rec); else Apply(r);
                return;
            }
            if (!t.HasPrev) return;
            var inv = Inv;
            var held = inv.Held;
            if (held == null || !int.TryParse(held, out var it) || Rules.Block(it) == null || inv.Count(it) <= 0) return;
            if (Protected(t.PX, t.PZ)) return;
            var plan = Placement.Plan(it, t.PX, t.PY, t.PZ, Player.Yaw, b.X, b.Y, b.Z, World.Get, World.Loaded);
            if (!plan.Ok) { if (plan.Refusal != null) Say("burn", "Can't place " + NameOf(it).ToLowerInvariant(), plan.Refusal); return; }
            var rec2 = Record(plan.Cells);
            var own = new Owner { By = Session?.Net.UserId ?? "me", Name = Session?.Login ?? "me", Serial = 0 };
            foreach (var c in plan.Cells) Write(c[0], c[1], c[2], c[3], own);
            inv.Counts[it] = inv.Count(it) - 1;
            Swing = 1;
            if (Session == null) { if (inv.Counts[it] <= 0) inv.SetCounts(new Dictionary<string, object> { [it.ToString()] = 0.0 }); return; }
            var r2 = await Session.Act("place", new Dictionary<string, object> { ["px"] = t.PX, ["py"] = t.PY, ["pz"] = t.PZ, ["it"] = it, ["bid"] = plan.Id }, b.X, b.Y, b.Z);
            if (r2 == null || r2.ContainsKey("refused")) { Revert(rec2); await Session.LoadInventory(); return; }
            Apply(r2);
            if (r2.TryGetValue("serial", out var ser)) Session.Say("burn", "1 " + NameOf(it), "→ block placed #" + MiniJson.ToInt(ser));
        }

        // ---------- the outline of the aimed block ----------
        GameObject MakeOutline()
        {
            var go = new GameObject("Target outline");
            var m = new Mesh();
            var v = new List<Vector3>();
            float e = 0.002f;
            float[] a = { -e, 1 + e };
            for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++)
                {
                    v.Add(new Vector3(a[i], a[j], -e)); v.Add(new Vector3(a[i], a[j], 1 + e));
                    v.Add(new Vector3(a[i], -e, a[j])); v.Add(new Vector3(a[i], 1 + e, a[j]));
                    v.Add(new Vector3(-e, a[i], a[j])); v.Add(new Vector3(1 + e, a[i], a[j]));
                }
            m.vertices = v.ToArray();
            var idx = new int[v.Count];
            for (int i = 0; i < idx.Length; i++) idx[i] = i;
            m.SetIndices(idx, MeshTopology.Lines, 0);
            go.AddComponent<MeshFilter>().sharedMesh = m;
            var mat = new Material(Shader.Find("Hidden/Internal-Colored")) { color = new Color(0.12f, 0.08f, 0.3f, 0.75f) };
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            go.SetActive(false);
            return go;
        }

        void PlaceOutline()
        {
            if (Target == null) { outline.SetActive(false); return; }
            outline.SetActive(true);
            // game (x, y, z) to Unity: z flipped, so the unit cell spans -z-1 .. -z
            outline.transform.position = new Vector3(Target.X, Target.Y, -Target.Z - 1);
        }

        static void ReadButtons(out bool mining, out bool use, out int slot, out float wheel)
        {
            mining = use = false; slot = -1; wheel = 0;
            if (Cursor.lockState != CursorLockMode.Locked) return;
#if ENABLE_INPUT_SYSTEM
            var m = Mouse.current;
            if (m != null)
            {
                mining = m.leftButton.isPressed;
                use = m.rightButton.wasPressedThisFrame;
                wheel = m.scroll.ReadValue().y;
            }
            var k = Keyboard.current;
            if (k != null)
            {
                var digits = new[] { k.digit1Key, k.digit2Key, k.digit3Key, k.digit4Key, k.digit5Key, k.digit6Key, k.digit7Key, k.digit8Key, k.digit9Key };
                for (int i = 0; i < 9; i++) if (digits[i].wasPressedThisFrame) slot = i;
            }
            var g = Gamepad.current;
            if (g != null) { mining |= g.rightTrigger.isPressed; use |= g.leftTrigger.wasPressedThisFrame; }
#else
            mining = Input.GetMouseButton(0);
            use = Input.GetMouseButtonDown(1);
            wheel = Input.mouseScrollDelta.y;
            for (int i = 0; i < 9; i++) if (Input.GetKeyDown(KeyCode.Alpha1 + i)) slot = i;
#endif
        }
    }
}
