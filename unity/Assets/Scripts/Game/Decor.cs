// Ether Mines · the sky's and the world's decor (04-render.js, 10-loop.js): the great Ethereum diamond over
// the Atrium's horizon with its ring of orange blocks, the small floating ethers over the Atrium, the
// disc ships circling above the City, flocks of birds by day, the stars and the aurora at night, the
// clouds, and the validators' beams of light with their little gems. Built here as the web builds them
// (its coordinates, Unity's z mirrored), animated at the web's speeds.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Decor : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;

        static Vector3 V(float x, float y, float z) => new Vector3(x, y, -z);
        static Color Hex(string h) => Avatars.Hex(h, Color.white);

        // a mesh written in the game's coordinates (z mirrored, the triangles turned back around)
        static Mesh GameMesh(List<Vector3> v, List<Color> c, List<int> t, List<Vector2> uv = null)
        {
            var m = new Mesh();
            var p = new Vector3[v.Count];
            for (int i = 0; i < v.Count; i++) p[i] = new Vector3(v[i].x, v[i].y, -v[i].z);
            var tri = new int[t.Count];
            for (int i = 0; i + 2 < t.Count; i += 3) { tri[i] = t[i]; tri[i + 1] = t[i + 2]; tri[i + 2] = t[i + 1]; }
            m.vertices = p;
            m.colors = c.ToArray();
            if (uv != null) m.uv = uv.ToArray();
            m.triangles = tri;
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        // ethGeo: the Ethereum diamond, four faces up and four down, a gap between, two tones each way
        static Mesh EthGeo(float r, float ht, float hb, float gap, string[] cols)
        {
            var v = new List<Vector3>(); var c = new List<Color>(); var t = new List<int>();
            var e = new[] { new Vector3(r, 0, 0), new Vector3(0, 0, r), new Vector3(-r, 0, 0), new Vector3(0, 0, -r) };
            for (int i = 0; i < 4; i++)
            {
                Vector3 a = e[i], b = e[(i + 1) % 4];
                Color top = Hex(cols[i % 2]), bot = Hex(cols[2 + i % 2]);
                foreach (var p in new[] { new Vector3(0, ht, 0), new Vector3(a.x, gap / 2, a.z), new Vector3(b.x, gap / 2, b.z) }) { t.Add(v.Count); v.Add(p); c.Add(top); }
                foreach (var p in new[] { new Vector3(0, -hb, 0), new Vector3(a.x, -gap / 2, a.z), new Vector3(b.x, -gap / 2, b.z) }) { t.Add(v.Count); v.Add(p); c.Add(bot); }
            }
            return GameMesh(v, c, t);
        }

        // a box (BoxGeometry), white vertices: its material gives the color
        static Mesh Box(float s)
        {
            var v = new List<Vector3>(); var c = new List<Color>(); var t = new List<int>();
            float h = s / 2;
            Vector3[] n = { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
            foreach (var f in n)
            {
                Vector3 u = Mathf.Abs(f.y) > 0.5f ? Vector3.right : Vector3.up, w = Vector3.Cross(f, u);
                int b = v.Count;
                foreach (var (x, y) in new[] { (-1, -1), (1, -1), (1, 1), (-1, 1) }) { v.Add((f + u * x + w * y) * h); c.Add(Color.white); }
                t.AddRange(new[] { b, b + 1, b + 2, b, b + 2, b + 3 });
            }
            return GameMesh(v, c, t);
        }

        // CylinderGeometry: from angle start, len around (x = r sin a, z = r cos a), open ends; uv along and up
        static Mesh Cylinder(float rTop, float rBot, float h, int seg, float start = 0, float len = Mathf.PI * 2, bool caps = false)
        {
            var v = new List<Vector3>(); var c = new List<Color>(); var t = new List<int>(); var uv = new List<Vector2>();
            for (int i = 0; i <= seg; i++)
            {
                float u = i / (float)seg, a = start + u * len;
                v.Add(new Vector3(rTop * Mathf.Sin(a), h / 2, rTop * Mathf.Cos(a))); uv.Add(new Vector2(u, 1));
                v.Add(new Vector3(rBot * Mathf.Sin(a), -h / 2, rBot * Mathf.Cos(a))); uv.Add(new Vector2(u, 0));
                c.Add(Color.white); c.Add(Color.white);
            }
            for (int i = 0; i < seg; i++) { int q = i * 2; t.AddRange(new[] { q, q + 1, q + 3, q, q + 3, q + 2 }); }
            if (caps)
                foreach (var (y, r, up) in new[] { (h / 2, rTop, true), (-h / 2, rBot, false) })
                {
                    int ctr = v.Count;
                    v.Add(new Vector3(0, y, 0)); uv.Add(new Vector2(0.5f, 0.5f)); c.Add(Color.white);
                    for (int i = 0; i <= seg; i++) { float a = start + i / (float)seg * len; v.Add(new Vector3(r * Mathf.Sin(a), y, r * Mathf.Cos(a))); uv.Add(Vector2.zero); c.Add(Color.white); }
                    for (int i = 0; i < seg; i++) { if (up) t.AddRange(new[] { ctr, ctr + 1 + i, ctr + 2 + i }); else t.AddRange(new[] { ctr, ctr + 2 + i, ctr + 1 + i }); }
                }
            return GameMesh(v, c, t, uv);
        }

        static Material Unlit(Color c) { var m = new Material(Shader.Find("EtherMines/Unlit")); m.color = c; return m; }

        GameObject Obj(string name, Mesh mesh, Material mat, Transform parent = null, bool shadows = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent != null ? parent : transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }

        Transform bigEth, ring, starsT, auroraT, cloudsT;
        readonly List<(Transform t, float a, float r, float h, float ph)> ethers = new List<(Transform, float, float, float, float)>();
        readonly List<(Transform t, float r, float h, float v)> ships = new List<(Transform, float, float, float)>();
        readonly float[] shipA = new float[3];
        readonly List<(Transform t, float r, float h, float v, Transform[] birds)> flocks = new List<(Transform, float, float, float, Transform[])>();
        readonly float[] flockA = new float[3];
        Material starMat, auroraMat, cloudMat, beamMat;
        Mesh gemMesh, beamMesh;
        float cloudDrift;

        static readonly string[] EthCols = { "#9a8cf5", "#c2b8ff", "#6a58e0", "#8a7bef" };

        void Start()
        {
            var ethMesh = EthGeo(9, 15, 10, 2.5f, EthCols);
            var ethMat = Unlit(Color.white);
            int SY = EtherMines.Core.World.SY;
            var sp = EtherMines.Core.World.SPAWN.X; var spz = EtherMines.Core.World.SPAWN.Z;
            // the great diamond, far beyond the Atrium
            bigEth = Obj("great diamond", ethMesh, ethMat).transform;
            bigEth.position = V(sp, SY + 40, spz - 110);
            // its ring of orange blocks (like ethereum.org's illustrations), tilted, turning the other way
            ring = new GameObject("orange ring").transform;
            ring.SetParent(transform, false);
            ring.position = bigEth.position;
            var box = Box(3.2f);
            var oranges = new[] { "#ffb36b", "#ff9a5c", "#ffc98a" };
            for (int i = 0; i < 16; i++)
            {
                float an = i / 16f * Mathf.PI * 2;
                var b = Obj("block", box, Unlit(Hex(oranges[i % 3])), ring).transform;
                b.localPosition = V(Mathf.Cos(an) * 17, Mathf.Sin(i * 1.7f) * 0.8f, Mathf.Sin(an) * 17);
                b.localRotation = HeldModels.Mirror(i, i * 0.6f, 0);
                b.localScale = Vector3.one * (0.7f + (i % 4) * 0.15f);
            }
            // the floating ethers over the Atrium: the first thing a newcomer sees that isn't a cube
            float gy0 = Mathf.Max(EtherMines.Core.World.HeightAt(sp, spz), EtherMines.Core.World.SEA) + 1;
            for (int i = 0; i < 7; i++)
            {
                var m = Obj("floating ether", ethMesh, ethMat).transform;
                m.localScale = Vector3.one * (0.07f + (i % 3) * 0.015f);
                ethers.Add((m, i / 7f * Mathf.PI * 2, 9.5f + (i % 2) * 2.5f, gy0 + 7 + (i % 3) * 1.4f, i * 1.7f));
            }
            // the disc ships over the City
            var hull = HeldModels.Lit(Hex("#d6ccf6"), Color.black);
            var lum = Unlit(Hex("#7fe8ff"));
            var dome = HeldModels.Lit(Hex("#a6f4ee"), Color.black);
            var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            var sphereMesh = sphere.GetComponent<MeshFilter>().sharedMesh;
            Destroy(sphere);
            for (int i = 0; i < 3; i++)
            {
                float t = 1 + i * 0.35f;
                var g = new GameObject("disc ship").transform;
                g.SetParent(transform, false);
                Obj("hull", Cylinder(3.2f * t, 2.2f * t, 0.7f, 20, 0, Mathf.PI * 2, true), hull, g, true);
                Obj("lights", Cylinder(3.25f * t, 3.25f * t, 0.18f, 20), lum, g);
                var d = Obj("dome", sphereMesh, dome, g).transform;
                d.localPosition = new Vector3(0, 0.3f, 0);
                d.localScale = Vector3.one * 2.4f * t;
                ships.Add((g, 22 + i * 12, SY + 8 + i * 5, (i % 2 == 1 ? -1 : 1) * (0.05f + i * 0.02f)));
                shipA[i] = i * 2.1f;
            }
            // flocks of birds: little "v"s
            var birdMat = Unlit(Hex("#6a58e0"));
            var vMesh = BirdMesh();
            var rnd = new System.Random(7);
            for (int f = 0; f < 3; f++)
            {
                var g = new GameObject("flock").transform;
                g.SetParent(transform, false);
                var birds = new Transform[6];
                for (int k = 0; k < 6; k++)
                {
                    birds[k] = Obj("bird", vMesh, birdMat, g).transform;
                    birds[k].localPosition = V((k % 3) * 1.6f - 1.6f, (k / 3) * 0.8f + (float)rnd.NextDouble() * 0.4f, (k / 3) * 1.4f);
                }
                flocks.Add((g, 40 + f * 15, SY + 2 + f * 4, 0.04f + f * 0.01f, birds));
                flockA[f] = f * 2;
            }
            // the stars: 700 points on the upper half of a great sphere around you
            starsT = Obj("stars", StarMesh(), starMat = Effects.Mat(Texture2D.whiteTexture, new Color(1, 1, 1, 0), true)).transform;
            // the aurora: two long curtains low over the horizon
            auroraMat = new Material(Shader.Find("EtherMines/Aurora"));
            auroraT = new GameObject("aurora").transform;
            auroraT.SetParent(transform, false);
            foreach (var (st, len, h, r) in new[] { (2.2f, 1.9f, 90f, 190f), (4.6f, 1.5f, 75f, 175f) })
                Obj("curtain", Cylinder(r, r, h, 48, st, len), auroraMat, auroraT).transform.localPosition = new Vector3(0, 58 + h / 2, 0);
            // the clouds
            cloudMat = new Material(Shader.Find("EtherMines/Clouds")) { mainTexture = CloudTexture() };
            var plane = new List<Vector3> { new Vector3(-450, 0, -450), new Vector3(450, 0, -450), new Vector3(450, 0, 450), new Vector3(-450, 0, 450) };
            cloudsT = Obj("clouds", GameMesh(plane, new List<Color> { Color.white, Color.white, Color.white, Color.white }, new List<int> { 0, 2, 1, 0, 3, 2 }), cloudMat).transform;
            // the validators' beams and gems
            beamMat = Effects.Mat(Texture2D.whiteTexture, Hex("#ffe68a") * 0.4f, true);
            beamMesh = Cylinder(0.12f, 0.12f, 40, 10);
            gemMesh = EthGeo(0.22f, 0.4f, 0.26f, 0.06f, new[] { "#fff2b0", "#ffd95e", "#8a7bef", "#6a58e0" });
            gemMat = ethMat;
            World.Changed += (cx, cz) => stale.Add(ChunkStore.Key(cx, cz));
        }

        static Mesh BirdMesh()
        {
            // two thin strokes: (-0.6, 0.25) to (0, 0) to (0.6, 0.25)
            var v = new List<Vector3>(); var c = new List<Color>(); var t = new List<int>();
            void Stroke(Vector2 a, Vector2 b)
            {
                var d = (b - a).normalized; var n = new Vector2(-d.y, d.x) * 0.035f;
                int q = v.Count;
                v.Add(new Vector3(a.x - n.x, a.y - n.y, 0)); v.Add(new Vector3(a.x + n.x, a.y + n.y, 0)); v.Add(new Vector3(b.x + n.x, b.y + n.y, 0)); v.Add(new Vector3(b.x - n.x, b.y - n.y, 0));
                for (int i = 0; i < 4; i++) c.Add(Color.white);
                t.AddRange(new[] { q, q + 1, q + 2, q, q + 2, q + 3 });
            }
            Stroke(new Vector2(-0.6f, 0.25f), Vector2.zero);
            Stroke(Vector2.zero, new Vector2(0.6f, 0.25f));
            return GameMesh(v, c, t);
        }

        static Mesh StarMesh()
        {
            var v = new List<Vector3>(); var c = new List<Color>(); var t = new List<int>();
            var rnd = new System.Random(90);
            // about 1.6 pixels at 280 blocks on a 1080-pixel-high screen with the 70° view
            float s = 280 * 2 * Mathf.Tan(35 * Mathf.Deg2Rad) / Mathf.Max(480, Screen.height) * 1.6f;
            for (int i = 0; i < 700; i++)
            {
                float u = (float)rnd.NextDouble() * 2 - 1, a = (float)rnd.NextDouble() * Mathf.PI * 2, r = Mathf.Sqrt(1 - u * u);
                if (u < 0.05f) continue;
                var p = new Vector3(Mathf.Cos(a) * r * 280, u * 280, Mathf.Sin(a) * r * 280);
                var n = p.normalized;
                var side = Vector3.Cross(n, Vector3.up);
                var e1 = (side.sqrMagnitude < 1e-4f ? Vector3.right : side.normalized) * (s / 2);
                var e2 = Vector3.Cross(n, e1).normalized * (s / 2);
                int q = v.Count;
                v.Add(p - e1 - e2); v.Add(p + e1 - e2); v.Add(p + e1 + e2); v.Add(p - e1 + e2);
                for (int k = 0; k < 4; k++) c.Add(Color.white);
                t.AddRange(new[] { q, q + 1, q + 2, q, q + 2, q + 3 });
            }
            return GameMesh(v, c, t);
        }

        // soft round clouds, white on top and a little lavender underneath, edges fading out
        static Texture2D CloudTexture()
        {
            var tx = new Texture2D(256, 256, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat };
            float N(float x, float y, float sc) => Mathf.PerlinNoise(x / sc + 31.7f, y / sc + 12.3f); // tiles every 256: blended at the edges below
            for (int y = 0; y < 256; y++)
                for (int x = 0; x < 256; x++)
                {
                    // seamless: the four corners' noise blended so the pattern repeats
                    float fx = x / 256f, fy = y / 256f;
                    float Tile(float sc) => N(x, y, sc) * (1 - fx) * (1 - fy) + N(x + 256, y, sc) * fx * (1 - fy) + N(x, y + 256, sc) * (1 - fx) * fy + N(x + 256, y + 256, sc) * fx * fy;
                    float v = Tile(24) * 0.7f + Tile(12) * 0.22f + Tile(5) * 0.08f;
                    float a = Mathf.Clamp01((v - 0.52f) / 0.14f), core = Mathf.Clamp01((v - 0.58f) / 0.12f);
                    tx.SetPixel(x, y, new Color((236 + 19 * core) / 255f, (230 + 25 * core) / 255f, 1, a * a * (3 - 2 * a)));
                }
            tx.Apply();
            return tx;
        }

        // ---------- the validators' beams (addVal: Pure Ether and relit validators, ids 13 and 74) ----------
        Material gemMat;
        readonly HashSet<long> stale = new HashSet<long>();
        readonly Dictionary<long, (byte[] arr, List<long> cells)> index = new Dictionary<long, (byte[], List<long>)>();
        readonly Dictionary<long, (Transform g, Transform gem)> beams = new Dictionary<long, (Transform, Transform)>();
        float beamScanT;

        void ScanBeams(PlayerPhysics p)
        {
            int pcx = (int)Math.Floor(p.X) >> 4, pcz = (int)Math.Floor(p.Z) >> 4, R = World.ViewRadius;
            var seen = new HashSet<long>();
            for (int dz = -R; dz <= R; dz++)
                for (int dx = -R; dx <= R; dx++)
                {
                    int cx = pcx + dx, cz = pcz + dz;
                    long k = ChunkStore.Key(cx, cz);
                    var arr = World.Store.Chunk(cx, cz);
                    if (arr == null) { index.Remove(k); continue; }
                    if (!index.TryGetValue(k, out var ix) || ix.arr != arr || stale.Contains(k))
                    {
                        stale.Remove(k);
                        var cells = new List<long>();
                        for (int i = 0; i < arr.Length; i++)
                            if (arr[i] == 13 || arr[i] == 74) cells.Add(Circuits.K(cx * 16 + (i & 15), i >> 8, cz * 16 + ((i >> 4) & 15)));
                        index[k] = ix = (arr, cells);
                    }
                    foreach (var c in ix.cells) seen.Add(c);
                }
            foreach (var c in seen)
                if (!beams.ContainsKey(c))
                {
                    Circuits.D(c, out var x, out var y, out var z);
                    var g = new GameObject("validator beam").transform;
                    g.SetParent(transform, false);
                    g.position = V(x + 0.5f, y, z + 0.5f);
                    Obj("beam", beamMesh, beamMat, g).transform.localPosition = new Vector3(0, 21, 0);
                    var gem = Obj("gem", gemMesh, gemMat, g).transform;
                    gem.localPosition = new Vector3(0, 1.7f, 0);
                    beams[c] = (g, gem);
                }
            var gone = new List<long>();
            foreach (var kv in beams) if (!seen.Contains(kv.Key)) gone.Add(kv.Key);
            foreach (var k in gone) { Destroy(beams[k].g.gameObject); beams.Remove(k); }
        }

        void Update()
        {
            var p = Player != null ? Player.Body : null;
            var cam = Player != null ? Player.Cam : null;
            if (p == null || cam == null || bigEth == null) return;
            float dt = Time.deltaTime, t = Time.time, night = Sky.Night;
            var cp = cam.transform.position;
            bigEth.rotation *= Quaternion.Euler(0, -dt * 0.12f * Mathf.Rad2Deg, 0);
            ringY -= dt * 0.05f;
            ring.rotation = HeldModels.Mirror(0.35f, ringY, 0);
            foreach (var (m, a0, r, h, ph) in ethers)
            {
                float a = a0 + t * 0.05f;
                m.position = V(EtherMines.Core.World.SPAWN.X + 0.5f + Mathf.Cos(a) * r, h + Mathf.Sin(t * 0.9f + ph) * 0.35f, EtherMines.Core.World.SPAWN.Z + 0.5f + Mathf.Sin(a) * r);
                m.rotation = Quaternion.Euler(0, -(t * 0.6f + ph) * Mathf.Rad2Deg, 0);
            }
            for (int i = 0; i < ships.Count; i++)
            {
                var (g, r, h, v) = ships[i];
                shipA[i] += dt * v;
                float a = shipA[i];
                g.position = V(EtherMines.Core.World.CITY.X + Mathf.Cos(a) * r, h + Mathf.Sin(a * 3) * 0.6f, EtherMines.Core.World.CITY.Z + Mathf.Sin(a) * r);
                g.rotation *= Quaternion.Euler(0, -dt * 0.3f * Mathf.Rad2Deg, 0);
            }
            for (int f = 0; f < flocks.Count; f++)
            {
                var (g, r, h, v, birds) = flocks[f];
                flockA[f] += dt * v;
                float a = flockA[f];
                g.gameObject.SetActive(night < 0.5f && Weather.Rain < 0.3f);
                g.position = V((float)p.X + Mathf.Cos(a) * r, h, (float)p.Z + Mathf.Sin(a) * r);
                g.rotation = Quaternion.Euler(0, a * Mathf.Rad2Deg, 0); // rotation.y = -a, mirrored
                for (int k = 0; k < birds.Length; k++) birds[k].localScale = new Vector3(1, 0.6f + Mathf.Abs(Mathf.Sin(t * 1000 / 180 + k)), 1);
            }
            starsT.position = cp;
            starMat.color = new Color(1, 1, 1, 1) * (night * 0.9f * (1 - Weather.Rain));
            auroraT.position = new Vector3(cp.x, 0, cp.z);
            auroraMat.SetFloat("_Night", night * (1 - Weather.Rain));
            cloudsT.position = new Vector3(cp.x, EtherMines.Core.World.SY + 26, cp.z);
            cloudDrift += dt * 0.0015f;
            cloudMat.SetFloat("_Drift", cloudDrift);
            var cc = Color.Lerp(Sky.Hor, Color.white, 0.6f - 0.4f * night);
            cc.a = Mathf.Min(1, 0.85f - 0.35f * night + Weather.Rain * 0.15f);
            cloudMat.color = cc;
            // the beams: brighter at night; the gems turning and bobbing
            beamMat.color = Hex("#ffe68a") * (0.25f + night * 0.45f);
            if ((beamScanT -= dt) <= 0) { beamScanT = 1; ScanBeams(p); }
            foreach (var (g, gem) in beams.Values)
            {
                gem.localRotation = Quaternion.Euler(0, -t * 1.5f * Mathf.Rad2Deg, 0);
                gem.localPosition = new Vector3(0, 1.7f + Mathf.Sin(t * 2) * 0.08f, 0);
            }
        }
        float ringY;
    }
}
