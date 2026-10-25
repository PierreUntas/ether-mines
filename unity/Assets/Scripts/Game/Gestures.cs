// Ether Mines · everyday gestures (22-gestures.js): a door swings on its hinge, a lever flips, a chest's
// lid lifts while it's open, a placed block grows into place, a mined block flies to you; you lie down in
// a bed, sit on a chair or a sofa, eat at a table (those three are hidden emotes: the others see them).
// While a block moves, its chunk meshes it as air (WorldView.Hidden) and a copy built by the same mesher
// (WorldView.MiniModel) stands in for it; once the move ends and the chunk shows it again, the copy goes.
// The web's three.js turns are mirrored like everything else (z flipped): a game point (x, y, z) is Unity
// (x, y, -z); a turn about y or x by a goes the other way (-a), one about z stays.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Gestures : MonoBehaviour
    {
        public static Gestures I;
        public WorldView World;
        public PlayerController Player;
        public Panel Panel;
        public Emotes Emotes;

        void Awake() => I = this;

        static Vector3 U(float x, float y, float z) => new Vector3(x, y, -z);
        static Quaternion Qy(float a) => Quaternion.AngleAxis(-a * Mathf.Rad2Deg, Vector3.up);
        static Quaternion Qx(float a) => Quaternion.AngleAxis(-a * Mathf.Rad2Deg, Vector3.right);
        static Quaternion Qz(float a) => Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.forward);
        static float Ease(float k) => k < 0.5f ? 2 * k * k : 1 - Mathf.Pow(-2 * k + 2, 2) / 2;

        sealed class Run { public long[] Keys; public int X, Z; public GameObject G; public float T, Dur; public Action<float> Step; }
        readonly List<Run> runs = new List<Run>();
        // copies waiting for their chunks to show the block again: (the chunks, the copy, when it gave up)
        readonly List<(HashSet<long> chunks, GameObject g, float until)> leaving = new List<(HashSet<long>, GameObject, float)>();

        void Start() { if (World != null) World.Meshed += OnMeshed; }
        void OnDestroy() { if (World != null) World.Meshed -= OnMeshed; }
        void OnMeshed(long key)
        {
            for (int i = leaving.Count - 1; i >= 0; i--)
            {
                leaving[i].chunks.Remove(key);
                if (leaving[i].chunks.Count == 0) { Destroy(leaving[i].g); leaving.RemoveAt(i); }
            }
        }

        bool Near(int x, int z, float r = 40)
        {
            var b = Player != null ? Player.Body : null;
            return b != null && Math.Sqrt((x + 0.5 - b.X) * (x + 0.5 - b.X) + (z + 0.5 - b.Z) * (z + 0.5 - b.Z)) < r;
        }

        void Hide(long[] keys, bool on)
        {
            var h = new HashSet<long>(World.Hidden);
            foreach (var k in keys) { if (on) h.Add(k); else h.Remove(k); }
            World.Hidden = h;
        }
        // the chunks WorldView.Rebuild meshes again for a block at (x, z)
        static HashSet<long> ChunksOf(int x, int z)
        {
            int cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
            var s = new HashSet<long> { ChunkStore.Key(cx, cz) };
            if (lx == 0) s.Add(ChunkStore.Key(cx - 1, cz));
            if (lx == 15) s.Add(ChunkStore.Key(cx + 1, cz));
            if (lz == 0) s.Add(ChunkStore.Key(cx, cz - 1));
            if (lz == 15) s.Add(ChunkStore.Key(cx, cz + 1));
            return s;
        }
        void Show(long[] keys, int x, int z, GameObject g)
        {
            Hide(keys, false);
            var cs = ChunksOf(x, z);
            cs.RemoveWhere(k => !World.Store.Has(ChunkStore.KeyX(k), ChunkStore.KeyZ(k)));
            World.Rebuild(x, z);
            if (cs.Count == 0) Destroy(g); else leaving.Add((cs, g, Time.time + 1.5f));
        }

        // a block stands in for itself a moment
        void StandIn(long[] keys, int x, int z, GameObject g, float dur, Action<float> step)
        {
            foreach (var r in runs.FindAll(r => r.Keys[0] == keys[0])) { runs.Remove(r); Destroy(r.G); }
            Hide(keys, true);
            World.Rebuild(x, z);
            g.transform.SetParent(transform, true);
            var run = new Run { Keys = keys, X = x, Z = z, G = g, Dur = dur, Step = step };
            runs.Add(run);
            step(0);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            for (int i = runs.Count - 1; i >= 0; i--)
            {
                var r = runs[i];
                r.T += dt;
                float k = Mathf.Min(1, r.T / r.Dur);
                r.Step(k);
                if (k >= 1) { runs.RemoveAt(i); Show(r.Keys, r.X, r.Z, r.G); }
            }
            for (int i = leaving.Count - 1; i >= 0; i--)
                if (Time.time > leaving[i].until) { Destroy(leaving[i].g); leaving.RemoveAt(i); }
            Flights(dt);
            Lid(dt);
        }

        // ---------- a door: the panel turns a quarter about the hinge it shares with its open self ----------
        static readonly float[][] Hinge = { new[] { 0.094f, 0.094f }, new[] { 0.094f, 0.906f }, new[] { 0.906f, 0.906f }, new[] { 0.906f, 0.094f } };
        public void SwingDoor(int x, int y, int z, int f, bool opening)
        {
            var tb = Rules.Block(World.Get(x, y + 1, z));
            bool top = tb != null && tb.Shape == "door";
            var cells = new List<int[]> { new[] { 0, 0, 0, 48 + f * 4 } };
            if (top) cells.Add(new[] { 0, 1, 0, 49 + f * 4 });
            var keys = top ? new[] { Circuits.K(x, y, z), Circuits.K(x, y + 1, z) } : new[] { Circuits.K(x, y, z) };
            float hx = Hinge[f][0], hz = Hinge[f][1];
            var m = World.MiniModel(cells);
            var piv = new GameObject("door");
            piv.transform.position = U(x + hx, y, z + hz);
            m.transform.SetParent(piv.transform, false);
            m.transform.localPosition = U(-hx, 0, -hz);
            StandIn(keys, x, z, piv, 0.32f, k => piv.transform.rotation = Qy(-Mathf.PI / 2 * (opening ? Ease(k) : 1 - Ease(k))));
        }
        // a door changed (yours, someone else's, a circuit's): it swings if its panel moved
        public void DoorChanged(int x, int y, int z, int before, int after, bool pwBefore, bool pwAfter)
        {
            var a = Rules.Block(before);
            var b = Rules.Block(after);
            if (a == null || b == null || a.Shape != "door" || b.Shape != "door" || a.Top || b.Top || a.F != b.F) return;
            bool was = a.Open || pwBefore, isOpen = b.Open || pwAfter;
            if (was != isOpen && Near(x, z)) SwingDoor(x, y, z, b.F, isOpen);
        }

        // ---------- a lever: the handle tips over ----------
        const float LeverTilt = 0.34f;
        static BlockDef Furn(double[][] boxes, int[] t, int[][] bt = null) => new BlockDef { N = "", T = t, Shape = "furn", HasH = true, H = 1, Boxes = boxes, Bt = bt };
        public void FlipLever(int x, int y, int z, bool on)
        {
            var one = new List<int[]> { new[] { 0, 0, 0, 0 } };
            var g = new GameObject("lever");
            g.transform.position = U(x, y, z);
            var b = World.MiniModel(one, Furn(new[] { new[] { 0.3, 0, 0.3, 0.7, 0.12, 0.7 } }, new[] { 3, 3, 3 }));
            b.transform.SetParent(g.transform, false);
            var piv = new GameObject("handle");
            piv.transform.SetParent(g.transform, false);
            piv.transform.localPosition = U(0.5f, 0.1f, 0.5f);
            var h = World.MiniModel(one, Furn(new[] { new[] { 0.46, 0.1, 0.46, 0.54, 0.58, 0.54 } }, new[] { 3, 3, 3 }));
            h.transform.SetParent(piv.transform, false);
            h.transform.localPosition = U(-0.5f, -0.1f, -0.5f);
            // (the block shows the handle off at -x, on at +x: a +z turn tips its top toward -x)
            StandIn(new[] { Circuits.K(x, y, z) }, x, z, g, 0.22f, k => piv.transform.localRotation = Qz((on ? 1 : -1) * LeverTilt * (1 - 2 * Ease(k))));
        }

        // ---------- a chest: the lid lifts while it's open, from the side away from you ----------
        sealed class LidState { public int X, Y, Z; public long Key; public GameObject G; public Transform Hinge; public float K; }
        LidState lid;
        public void OpenChestLid(int x, int y, int z)
        {
            if (lid != null && lid.X == x && lid.Y == y && lid.Z == z) return;
            if (lid != null) ShutLid();
            var t = Rules.Block(98).T;
            var one = new List<int[]> { new[] { 0, 0, 0, 0 } };
            var g = new GameObject("chest");
            g.transform.position = U(x + 0.5f, y, z + 0.5f);
            var b = Player.Body;
            float ry = (float)Math.Round(Mathf.Atan2(-(float)(b.X - x - 0.5), -(float)(b.Z - z - 0.5)) / (Mathf.PI / 2)) * (Mathf.PI / 2);
            g.transform.rotation = Qy(ry);
            var body = World.MiniModel(one, Furn(new[] { new[] { 0.0, 0, 0, 1, 0.64, 1 }, new[] { 0.07, 0.6, 0.07, 0.93, 0.645, 0.93 } }, t, new[] { t, new[] { 12, 12, 12 } }));
            body.transform.SetParent(g.transform, false);
            body.transform.localPosition = U(-0.5f, 0, -0.5f);
            var hinge = new GameObject("hinge").transform;
            hinge.SetParent(g.transform, false);
            hinge.localPosition = U(0, 0.64f, 0.5f);
            var top = World.MiniModel(one, Furn(new[] { new[] { 0.0, 0.64, 0, 1, 1, 1 } }, t));
            top.transform.SetParent(hinge, false);
            top.transform.localPosition = U(-0.5f, -0.64f, -1);
            g.transform.SetParent(transform, true);
            lid = new LidState { X = x, Y = y, Z = z, Key = Circuits.K(x, y, z), G = g, Hinge = hinge };
            Hide(new[] { lid.Key }, true);
            World.Rebuild(x, z);
        }
        void ShutLid()
        {
            var l = lid;
            lid = null;
            Show(new[] { l.Key }, l.X, l.Z, l.G);
        }
        void Lid(float dt)
        {
            if (lid == null) return;
            var o = Panel != null && Ui.PanelOpen ? Panel.Open : null;
            bool open = o != null && o.X == lid.X && o.Y == lid.Y && o.Z == lid.Z;
            lid.K = Mathf.Clamp01(lid.K + (open ? dt : -dt) / 0.26f);
            lid.Hinge.localRotation = Qx(1.15f * Ease(lid.K));
            if (!open && lid.K <= 0) ShutLid();
        }

        // ---------- a placed block grows into place ----------
        public void Grow(int x, int y, int z, int id)
        {
            var bd = Rules.Block(id);
            if (bd == null || bd.Shape == "door" || bd.IsBed) return;
            var g = new GameObject("grow");
            g.transform.position = U(x + 0.5f, y + 0.5f, z + 0.5f);
            var m = World.MiniModel(new List<int[]> { new[] { 0, 0, 0, id } });
            m.transform.SetParent(g.transform, false);
            m.transform.localPosition = U(-0.5f, -0.5f, -0.5f);
            StandIn(new[] { Circuits.K(x, y, z) }, x, z, g, 0.2f, k =>
            {
                // from 60%, a little past full size, then settles
                float s = k < 0.7f ? 0.6f + 0.47f * k / 0.7f : 1.07f - 0.07f * (k - 0.7f) / 0.3f;
                g.transform.localScale = Vector3.one * s;
            });
        }

        // ---------- a mined block flies to you ----------
        sealed class Flight { public GameObject G; public Vector3 From; public float T, S; }
        readonly List<Flight> flights = new List<Flight>();
        public void PickupFly(int x, int y, int z, int id)
        {
            var bd = Rules.Block(id);
            if (bd == null || (bd.HasDrop && bd.Drop == 0) || !Near(x, z, 12)) return;
            int shown = bd.HasDrop && Rules.Block(bd.Drop) != null ? bd.Drop : id;
            var g = new GameObject("pickup");
            var m = World.MiniModel(new List<int[]> { new[] { 0, 0, 0, shown } });
            m.transform.SetParent(g.transform, false);
            m.transform.localPosition = U(-0.5f, -0.5f, -0.5f);
            g.transform.SetParent(transform, false);
            var from = new Vector3(x + 0.5f, y + 0.5f, z + 0.5f); // game coordinates
            g.transform.position = U(from.x, from.y, from.z);
            g.transform.localScale = Vector3.one * 0.34f;
            flights.Add(new Flight { G = g, From = from, S = 0.34f });
        }
        void Flights(float dt)
        {
            var b = Player != null ? Player.Body : null;
            for (int i = flights.Count - 1; i >= 0; i--)
            {
                var f = flights[i];
                f.T += dt;
                // a short hop up out of the hole, then toward your chest, shrinking as it arrives
                float k = Mathf.Min(1, f.T / 0.45f), e = k * k;
                var to = b != null ? new Vector3((float)b.X, (float)b.Y + 1.05f, (float)b.Z) : f.From;
                var p = Vector3.Lerp(f.From, to, e);
                p.y += Mathf.Sin(k * Mathf.PI) * 0.55f;
                f.G.transform.position = U(p.x, p.y, p.z);
                f.G.transform.rotation = Qy(f.T * 9);
                f.G.transform.localScale = Vector3.one * f.S * (1 - 0.7f * e);
                if (k >= 1) { Destroy(f.G); flights.RemoveAt(i); }
            }
        }

        // ---------- lying in a bed, sitting on a chair or a sofa ----------
        static readonly int[][] BedDir = { new[] { 0, -1 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 1, 0 } };
        // you lie down along the bed (the others see you there), the screen goes dark a moment
        public void LieDown(Hit bed)
        {
            var bd = Rules.Block(bed.Id);
            if (bd == null || !bd.IsBed) return;
            var d = BedDir[bd.BedFacing];
            int fx = bd.BedHead ? bed.X - d[0] : bed.X, fz = bd.BedHead ? bed.Z - d[1] : bed.Z;
            var b = Player.Body;
            // where the two halves meet, on the mattress, looking toward your feet
            b.X = fx + 0.5 + d[0] * 0.5; b.Z = fz + 0.5 + d[1] * 0.5; b.Y = bed.Y + 0.31; b.Vy = 0;
            Player.Yaw = Math.Atan2(d[0], d[1]);
            Emotes?.Play("lie");
            darkAt = Time.time;
        }
        public static float SeatHeight(int id) => id >= 146 && id <= 149 ? 0.55f : id >= 150 && id <= 153 ? 0.42f : 0;
        // a chair (146-149) or a sofa (150-153): sit facing the way it faces (turn 0 faces +z)
        public void SitDown(Hit t)
        {
            var bd = Rules.Block(t.Id);
            int o = bd != null ? bd.O : 0;
            int[][] face = { new[] { 0, 1 }, new[] { 1, 0 }, new[] { 0, -1 }, new[] { -1, 0 } };
            int fx = face[o & 3][0], fz = face[o & 3][1];
            var b = Player.Body;
            b.X = t.X + 0.5 + fx * 0.1; b.Z = t.Z + 0.5 + fz * 0.1; b.Y = t.Y + SeatHeight(t.Id) + 0.001; b.Vy = 0;
            Player.Yaw = Math.Atan2(-fx, -fz);
            Emotes?.Play("seat");
        }

        // the dark moment of lying down (blinkDark: 2.6 s, black from 12% to 55%)
        float darkAt = -99;
        void OnGUI()
        {
            float t = (Time.time - darkAt) / 2.6f;
            if (t < 0 || t > 1) return;
            float a = t < 0.12f ? Mathf.Lerp(0.85f, 1, t / 0.12f) : t < 0.55f ? 1 : 1 - (t - 0.55f) / 0.45f;
            var o = GUI.color;
            GUI.color = new Color(0.043f, 0.031f, 0.125f, a);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = o;
        }
    }
}
