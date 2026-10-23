// Ether Mines · the world's little lives (05-player.js): fireflies at night around you near the ground,
// butterflies by day around the flowers, petals falling from the pink trees; and the clay look's break
// (clayBurst): a flash of light that shrinks away, the block's color in a few soft facets, sparks of
// ether drifting up. Settings → "Fireflies & co" turns the first three off, as on the web.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Effects : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;
        public Sky Sky;
        public static Effects I;

        const string Key = "ether-mines:fireflies";
        public static bool Life { get; private set; } = true;
        public static void Toggle() { Life = !Life; PlayerPrefs.SetString(Key, Life ? "1" : "0"); }

        static readonly System.Random rnd = new System.Random();
        static float R() => (float)rnd.NextDouble();

        // ---------- many little quads facing the camera, in one mesh ----------
        public sealed class Specks
        {
            readonly Mesh mesh = new Mesh();
            readonly Vector3[] v; readonly Color[] c; readonly Vector2[] uv;
            public readonly int N;
            public Specks(string name, int n, Texture2D tex, bool additive, Transform parent)
            {
                N = n;
                v = new Vector3[n * 4]; c = new Color[n * 4]; uv = new Vector2[n * 4];
                var tri = new int[n * 6];
                for (int i = 0; i < n; i++) { int q = i * 4, t = i * 6; tri[t] = q; tri[t + 1] = q + 1; tri[t + 2] = q + 2; tri[t + 3] = q; tri[t + 4] = q + 2; tri[t + 5] = q + 3; }
                mesh.MarkDynamic();
                mesh.vertices = v; mesh.colors = c; mesh.uv = uv; mesh.triangles = tri;
                var go = new GameObject(name);
                go.transform.SetParent(parent, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = go.AddComponent<MeshRenderer>();
                r.sharedMaterial = Mat(tex, Color.white, additive);
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                r.receiveShadows = false;
            }
            public void Set(int i, Vector3 at, float w, float h, Color col, Rect tex, Vector3 right, Vector3 up)
            {
                int q = i * 4;
                Vector3 rx = right * (w / 2), uy = up * (h / 2);
                v[q] = at - rx - uy; v[q + 1] = at - rx + uy; v[q + 2] = at + rx + uy; v[q + 3] = at + rx - uy;
                uv[q] = new Vector2(tex.x, tex.y); uv[q + 1] = new Vector2(tex.x, tex.yMax); uv[q + 2] = new Vector2(tex.xMax, tex.yMax); uv[q + 3] = new Vector2(tex.xMax, tex.y);
                c[q] = c[q + 1] = c[q + 2] = c[q + 3] = col;
            }
            public void Hide(int i) { int q = i * 4; v[q] = v[q + 1] = v[q + 2] = v[q + 3] = Vector3.zero; }
            public void Apply()
            {
                mesh.vertices = v; mesh.colors = c; mesh.uv = uv;
                mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 100000);
            }
        }

        public static Material Mat(Texture2D tex, Color col, bool additive)
        {
            var m = new Material(Shader.Find("EtherMines/Billboard"));
            m.mainTexture = tex;
            m.color = col;
            m.SetFloat("_SrcBlend", (float)(additive ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.SrcAlpha));
            m.SetFloat("_DstBlend", (float)(additive ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha));
            m.renderQueue = 3000;
            return m;
        }

        static readonly Rect Whole = new Rect(0, 0, 1, 1);
        Specks flies, paps, petals;
        sealed class Mote { public float X, Y, Z, Ph, Sp, Life; public bool Ok; public int Col; }
        readonly Mote[] ff = new Mote[60], pp = new Mote[12], pt = new Mote[90];
        bool ffReady, papReady;

        void Awake()
        {
            I = this;
            Life = PlayerPrefs.GetString(Key, "1") != "0";
            // the fireflies' soft dot: warm white, yellow green, fading out
            var glow = new Texture2D(32, 32, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 32; x++)
                {
                    float d = Mathf.Min(1, Mathf.Sqrt((x - 15.5f) * (x - 15.5f) + (y - 15.5f) * (y - 15.5f)) / 16);
                    Color a = new Color(1, 1, 0.86f, 1), b = new Color(0.9f, 1, 0.59f, 0.8f), e = new Color(0.63f, 1, 0.47f, 0);
                    var col = d < 0.25f ? Color.Lerp(a, b, d / 0.25f) : Color.Lerp(b, e, (d - 0.25f) / 0.75f);
                    col.r *= col.a; col.g *= col.a; col.b *= col.a; // added light: the fade in the color
                    glow.SetPixel(x, y, col);
                }
            glow.Apply();
            // the butterflies: four wings and a dark body, in five colors side by side
            string[] cols = { "#ffb8d9", "#fff0a0", "#b3dcff", "#c9b8ff", "#ffcfae" };
            var bt = new Texture2D(40, 8, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            bt.SetPixels(new Color[40 * 8]);
            for (int k = 0; k < 5; k++)
            {
                var wc = Avatars.Hex(cols[k], Color.white);
                foreach (var (ax, ay, w, h) in new[] { (0, 1, 3, 3), (5, 1, 3, 3), (1, 4, 2, 3), (5, 4, 2, 3) })
                    for (int x = ax; x < ax + w; x++) for (int y = ay; y < ay + h; y++) bt.SetPixel(k * 8 + x, 7 - y, wc);
                for (int x = 3; x < 5; x++) for (int y = 2; y < 7; y++) bt.SetPixel(k * 8 + x, 7 - y, Avatars.Hex("#3a2f5c", Color.black));
            }
            bt.Apply();
            flies = new Specks("fireflies", ff.Length, glow, true, transform);
            paps = new Specks("butterflies", pp.Length, bt, false, transform);
            petals = new Specks("petals", pt.Length, Texture2D.whiteTexture, false, transform);
            for (int i = 0; i < ff.Length; i++) ff[i] = new Mote();
            for (int i = 0; i < pp.Length; i++) pp[i] = new Mote { Ph = R() * 9, Sp = 0.5f + R() * 0.5f, Col = i % 5 };
            for (int i = 0; i < pt.Length; i++) pt[i] = new Mote { Y = -99, Ph = R() * 9 };
        }

        int Get(double x, double y, double z) => World.Get((int)Math.Floor(x), (int)Math.Floor(y), (int)Math.Floor(z));

        void FlySpawn(Mote d, PlayerPhysics p)
        {
            for (int tr = 0; tr < 6; tr++)
            {
                float a = R() * Mathf.PI * 2, r = 3 + R() * 16;
                d.X = (float)p.X + Mathf.Cos(a) * r;
                d.Z = (float)p.Z + Mathf.Sin(a) * r;
                int y = Math.Min(World_SY - 2, (int)Math.Floor(p.Y) + 6);
                while (y > 1 && !Mesher.IsSolid(Get(d.X, y, d.Z))) y--;
                d.Y = y + 1.3f + R() * 2.2f;
                if (Get(d.X, d.Y, d.Z) == 0) break;
            }
            d.Ph = R() * 9;
            d.Sp = 0.4f + R() * 0.6f;
        }

        // a flower (or grass) at the surface near you
        void PapSpawn(Mote m, PlayerPhysics p)
        {
            for (int tr = 0; tr < 10; tr++)
            {
                float a = R() * Mathf.PI * 2, r = 4 + R() * 14;
                int x = (int)Math.Floor(p.X + Mathf.Cos(a) * r), z = (int)Math.Floor(p.Z + Mathf.Sin(a) * r);
                int y = Math.Min(World_SY - 2, (int)Math.Floor(p.Y) + 8);
                while (y > 1 && World.Get(x, y, z) == 0) y--;
                int id = World.Get(x, y, z);
                if ((id >= 17 && id <= 19) || (tr > 6 && (id == 20 || id == 1))) { m.X = x + 0.5f; m.Y = y + 0.6f + R() * 1.2f; m.Z = z + 0.5f; m.Ok = true; return; }
            }
            m.Ok = false;
        }

        // under a pink tree's leaves, with air below them
        void PetSpawn(Mote d, PlayerPhysics p)
        {
            d.Y = -99;
            for (int tr = 0; tr < 3; tr++)
            {
                int x = (int)Math.Floor(p.X + (R() - 0.5f) * 36), z = (int)Math.Floor(p.Z + (R() - 0.5f) * 36);
                for (int y = Math.Min(World_SY - 2, (int)Math.Floor(p.Y) + 14); y > (int)Math.Floor(p.Y) - 6 && y > 1; y--)
                {
                    int id = World.Get(x, y, z);
                    if (id == 7 && World.Get(x, y - 1, z) == 0) { d.X = x + R(); d.Y = y - 0.05f; d.Z = z + R(); d.Life = 6 + R() * 6; return; }
                    if (id != 0 && id != 7) break;
                }
            }
        }
        static int World_SY => EtherMines.Core.World.SY;

        void Update()
        {
            var p = Player != null ? Player.Body : null;
            var cam = Player != null ? Player.Cam : null;
            if (p == null || cam == null) return;
            float dt = Time.deltaTime, t = Time.time;
            float ang = ((Sky != null ? Sky.Day : 0.5f) - 0.25f) * Mathf.PI * 2, night = Mathf.Clamp01(-Mathf.Sin(ang) / 1.0595f * 4);
            Vector3 right = cam.transform.right, up = cam.transform.up;
            Vector3 V(float x, float y, float z) => new Vector3(x, y, -z);

            // fireflies
            float op = Life ? Mathf.Clamp01(Mathf.Max(0, night - 0.3f) * 1.3f) : 0;
            if (op <= 0.01f) { ffReady = false; for (int i = 0; i < ff.Length; i++) flies.Hide(i); }
            else
            {
                float size = 0.28f + Mathf.Sin(t * 3) * 0.05f;
                for (int i = 0; i < ff.Length; i++)
                {
                    var d = ff[i];
                    if (!ffReady || new Vector2(d.X - (float)p.X, d.Z - (float)p.Z).magnitude > 22) FlySpawn(d, p);
                    d.Ph += dt * d.Sp;
                    flies.Set(i, V(d.X + Mathf.Sin(d.Ph * 1.3f) * 0.8f, d.Y + Mathf.Sin(d.Ph * 2.1f) * 0.35f, d.Z + Mathf.Cos(d.Ph) * 0.8f), size, size, new Color(op, op, op, op), Whole, right, up);
                }
                ffReady = true;
            }
            flies.Apply();

            // butterflies, by day
            bool day = Life && night < 0.4f && Weather.Rain < 0.3f; // no butterflies in the rain
            for (int i = 0; i < pp.Length; i++)
            {
                var m = pp[i];
                if (!day) { paps.Hide(i); continue; }
                if (!papReady || !m.Ok || new Vector2(m.X - (float)p.X, m.Z - (float)p.Z).magnitude > 24) PapSpawn(m, p);
                m.Ph += dt * m.Sp;
                if (!m.Ok) { paps.Hide(i); continue; }
                float w = 0.32f * (0.25f + Mathf.Abs(Mathf.Sin(t * 14 + m.Ph * 5))); // the wings beating
                paps.Set(i, V(m.X + Mathf.Sin(m.Ph * 0.9f) * 1.4f, m.Y + Mathf.Abs(Mathf.Sin(m.Ph * 2.3f)) * 0.4f, m.Z + Mathf.Cos(m.Ph * 0.7f) * 1.4f), w, 0.32f, Color.white, new Rect(m.Col / 5f, 0, 0.2f, 1), right, up);
            }
            papReady = day;
            paps.Apply();

            // petals from the pink trees
            var pc = Avatars.Hex("#ffb8d9", Color.white); pc.a = 0.9f;
            for (int i = 0; i < pt.Length; i++)
            {
                var d = pt[i];
                if (!Life) { petals.Hide(i); continue; }
                d.Life -= dt;
                if (d.Life <= 0 || Mesher.IsSolid(Get(d.X, d.Y, d.Z)) || new Vector2(d.X - (float)p.X, d.Z - (float)p.Z).magnitude > 26)
                {
                    if (R() < dt * 2) PetSpawn(d, p); // spread out over time
                    else d.Y = -99;
                }
                d.Ph += dt;
                d.Y -= dt * 0.55f;
                d.X += Mathf.Sin(d.Ph * 1.7f) * dt * 0.5f + dt * 0.15f;
                d.Z += Mathf.Cos(d.Ph * 1.3f) * dt * 0.4f;
                if (d.Y < -50) petals.Hide(i); else petals.Set(i, V(d.X, d.Y, d.Z), 0.09f, 0.09f, pc, Whole, right, up);
            }
            petals.Apply();

            // the bursts' pieces: gravity (each its own), drift, shrinking
            for (int i = parts.Count - 1; i >= 0; i--)
            {
                var q = parts[i];
                q.T -= dt;
                q.V.y -= q.G * dt;
                q.Tr.position += new Vector3(q.V.x, q.V.y, -q.V.z) * dt;
                q.Tr.localScale = Vector3.one * (q.S * Mathf.Max(0.05f, q.T / q.T0));
                if (q.Spin) q.Tr.Rotate(0, dt * 200, 0);
                if (q.T <= 0) { Destroy(q.Tr.gameObject); parts.RemoveAt(i); }
            }
        }

        // ---------- the break (clayBurst) ----------
        sealed class Piece { public Transform Tr; public Vector3 V; public float T, T0, G = 14, S = 1; public bool Spin; }
        readonly List<Piece> parts = new List<Piece>();
        static Mesh octa;
        static Material flashMat;
        static Material[] sparkMats;

        // the octahedron (OctahedronGeometry(0.07)), flat faces
        static Mesh Octa()
        {
            if (octa != null) return octa;
            var p = new[] { new Vector3(0.07f, 0, 0), new Vector3(-0.07f, 0, 0), new Vector3(0, 0.07f, 0), new Vector3(0, -0.07f, 0), new Vector3(0, 0, 0.07f), new Vector3(0, 0, -0.07f) };
            int[][] f = { new[] { 0, 2, 4 }, new[] { 0, 4, 3 }, new[] { 0, 3, 5 }, new[] { 0, 5, 2 }, new[] { 1, 2, 5 }, new[] { 1, 5, 3 }, new[] { 1, 3, 4 }, new[] { 1, 4, 2 } };
            var v = new List<Vector3>(); var t = new List<int>();
            foreach (var tr in f) { foreach (var k in tr) { t.Add(v.Count); v.Add(p[k]); } }
            octa = new Mesh { vertices = v.ToArray(), triangles = t.ToArray() };
            octa.RecalculateNormals();
            octa.RecalculateBounds();
            return octa;
        }

        Piece Add(Mesh mesh, Material m, Vector3 game, Vector3 vel, float life, float life0, float g, float s, bool spin = false)
        {
            var go = new GameObject("piece");
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            go.transform.position = new Vector3(game.x, game.y, -game.z);
            go.transform.localScale = Vector3.one * s;
            var q = new Piece { Tr = go.transform, V = vel, T = life, T0 = life0, G = g, S = s, Spin = spin };
            parts.Add(q);
            return q;
        }

        static Mesh cube;
        /// <summary>A burst at the cell (x, y, z) (its corner), in color c (null: ether sparks only, a parry, a dodge).</summary>
        public static void Burst(float x, float y, float z, Color? c)
        {
            if (I == null) return;
            if (cube == null) { var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube); cube = tmp.GetComponent<MeshFilter>().sharedMesh; Destroy(tmp); }
            flashMat ??= Mat(Texture2D.whiteTexture, Avatars.Hex("#d8ccff", Color.white) * 0.55f, true);
            sparkMats ??= new[] { "#bdf6ff", "#c2b8ff", "#ffffff" }.Select2(h => Mat(Texture2D.whiteTexture, Avatars.Hex(h, Color.white) * 0.95f, true));
            var o = Octa();
            I.Add(cube, flashMat, new Vector3(x + 0.5f, y + 0.5f, z + 0.5f), Vector3.zero, 0.22f, 0.22f, 0, 1.02f);
            if (c is Color col)
            {
                var m = HeldModels.Lit(col, Color.black);
                for (int i = 0; i < 6; i++)
                    I.Add(o, m, new Vector3(x + 0.2f + R() * 0.6f, y + 0.2f + R() * 0.6f, z + 0.2f + R() * 0.6f), new Vector3((R() - 0.5f) * 2.4f, R() * 2 + 0.5f, (R() - 0.5f) * 2.4f), 0.55f, 0.55f, 14, 1.8f);
            }
            for (int i = 0; i < 9; i++)
            {
                float life = 0.9f + R() * 0.4f;
                I.Add(o, sparkMats[i % 3], new Vector3(x + 0.15f + R() * 0.7f, y + 0.3f + R() * 0.6f, z + 0.15f + R() * 0.7f), new Vector3((R() - 0.5f) * 0.8f, 0.8f + R() * 1.2f, (R() - 0.5f) * 0.8f), life, 1.3f, -1.2f, 1, true);
            }
        }

        /// <summary>A block broken at (x, y, z): its own color.</summary>
        public static void Break(int x, int y, int z, int id) => Burst(x, y, z, Ui.IconColor(id));
    }

    static class ArrayExt
    {
        public static TOut[] Select2<TIn, TOut>(this TIn[] a, Func<TIn, TOut> f) { var r = new TOut[a.Length]; for (int i = 0; i < a.Length; i++) r[i] = f(a[i]); return r; }
    }
}
