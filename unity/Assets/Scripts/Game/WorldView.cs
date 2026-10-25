// Ether Mines · the world around the player: chunks streamed in by distance (13-chunks.js), read from the
// server (frozen terrain + changed blocks) or generated, meshed on a background thread (as the web
// version's mesh worker does) and drawn with the clay materials; far chunks are dropped.
// Coordinates: the game keeps the web version's (right-handed, -z north); Unity is left-handed, so the
// view flips z (Pos.z -> -z) and turns the triangles around. Logic never sees the flipped coordinates.
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using EtherMines.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace EtherMines.Game
{
    public sealed class WorldView : MonoBehaviour
    {
        public readonly ChunkStore Store = new ChunkStore();
        public Supabase Net; // null: offline (the generator only)
        public string WorldName = Config.DefaultWorld;
        public int ViewRadius = 6; // chunks
        public string Status = "";

        Material opMat, glMat, waMat, plMat;
        public Material OpMat => opMat; public Material GlMat => glMat; public Material WaMat => waMat; public Material PlMat => plMat;
        readonly Dictionary<long, GameObject> views = new Dictionary<long, GameObject>();
        readonly HashSet<long> pending = new HashSet<long>(); // being read from the server
        readonly HashSet<long> meshQueue = new HashSet<long>();
        readonly Dictionary<long, int> meshSeq = new Dictionary<long, int>();
        readonly Queue<(long key, int seq, MeshOut mesh)> ready = new Queue<(long, int, MeshOut)>();
        readonly object readyLock = new object();
        int inFlight, seqN;
        bool loading;
        float streamT;
        [ThreadStatic] static Mesher threadMesher;

        public Func<Vector3> PlayerPos = () => Vector3.zero; // in game coordinates (web: x, y, z)
        public event Action<int, int, int, string> SignRead;
        public event Action<int, int> Changed; // a block changed in this chunk (the circuits index it again)
        // the powered blocks (CircuitsView): replaced, never changed in place, so a mesh being built keeps its copy
        public HashSet<long> Powered = new HashSet<long>(); // a sign's text, read with its area (Signs.cs)
        // the blocks meshed as air while an animation stands in for them (Gestures: a door swinging, a lid
        // lifting); replaced, never changed in place, like Powered
        public HashSet<long> Hidden = new HashSet<long>();
        public event Action<long> Meshed; // a chunk's new mesh shows (its ChunkStore key)

        void Awake()
        {
            var atlas = LoadTex("Art/atlas-clay", FilterMode.Bilinear, TextureWrapMode.Clamp);
            var emis = LoadTex("Art/emissive-clay", FilterMode.Bilinear, TextureWrapMode.Clamp);
            var water = LoadTex("Art/water", FilterMode.Point, TextureWrapMode.Repeat);
            opMat = Mat("EtherMines/Block", atlas, emis);
            glMat = Mat("EtherMines/Glass", atlas, emis);
            waMat = Mat("EtherMines/Water", water, null);
            plMat = Mat("EtherMines/Plant", atlas, emis);
            // which tiles of the atlas are leaves: the wind moves those (Shaders/EtherLit.hlsl)
            var mask = new Texture2D(16, 16, TextureFormat.R8, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            var px = new Color[256];
            foreach (var b in Rules.Blocks)
                if (b != null && b.Leaf && b.T != null)
                    foreach (var ti in b.T) if (ti >= 0 && ti < 256) px[(15 - ti / 16) * 16 + ti % 16] = Color.white;
            mask.SetPixels(px);
            mask.Apply();
            Shader.SetGlobalTexture("_EM_WindMask", mask);
        }

        static Texture2D LoadTex(string path, FilterMode f, TextureWrapMode w)
        {
            var bytes = Resources.Load<TextAsset>(path).bytes;
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            t.LoadImage(bytes);
            t.filterMode = f;
            t.wrapMode = w;
            t.anisoLevel = 4;
            return t;
        }

        static Material Mat(string shader, Texture main, Texture emis)
        {
            var s = Shader.Find(shader);
            if (s == null) throw new Exception("shader missing: " + shader);
            var m = new Material(s) { mainTexture = main };
            if (emis != null) m.SetTexture("_EmissionTex", emis);
            return m;
        }

        public int Get(int x, int y, int z) => Store.Get(x, y, z);
        public bool Loaded(int x, int z) => Store.Loaded(x, z);

        void Update()
        {
            streamT -= Time.deltaTime;
            if (streamT <= 0)
            {
                streamT = 0.35f;
                if (!loading) _ = LoadMissing();
                UnloadFar();
            }
            // meshing: as many in the background as there are cores to spare
            int room = Math.Max(1, SystemInfo.processorCount - 1);
            if (meshQueue.Count > 0 && inFlight < room)
            {
                var p = PlayerPos();
                long best = 0;
                float bd = float.MaxValue;
                foreach (var k in meshQueue)
                {
                    float dx = ChunkStore.KeyX(k) * 16 + 8 - p.x, dz = ChunkStore.KeyZ(k) * 16 + 8 - p.z, d = dx * dx + dz * dz;
                    if (d < bd) { bd = d; best = k; }
                }
                meshQueue.Remove(best);
                StartMesh(best);
            }
            lock (readyLock)
                while (ready.Count > 0)
                {
                    var r = ready.Dequeue();
                    if (meshSeq.TryGetValue(r.key, out var s) && s == r.seq && Store.Has(ChunkStore.KeyX(r.key), ChunkStore.KeyZ(r.key)))
                        Apply(r.key, r.mesh);
                }
        }

        // the chunks within the view radius not loaded yet, nearest first, 12 at a time
        async Task LoadMissing()
        {
            var p = PlayerPos();
            int pcx = World.COf(p.x), pcz = World.COf(p.z), R = ViewRadius;
            var miss = new List<(int cx, int cz, int d)>();
            for (int dz = -R; dz <= R; dz++)
                for (int dx = -R; dx <= R; dx++)
                {
                    if (dx * dx + dz * dz > R * R + 1) continue;
                    int cx = pcx + dx, cz = pcz + dz;
                    if (Store.Has(cx, cz) || pending.Contains(ChunkStore.Key(cx, cz))) continue;
                    miss.Add((cx, cz, dx * dx + dz * dz));
                }
            if (miss.Count == 0) return;
            miss.Sort((a, b) => a.d.CompareTo(b.d));
            if (miss.Count > 12) miss.RemoveRange(12, miss.Count - 12);
            loading = true;
            try { await Load(miss); }
            catch (Exception e)
            {
                Status = "offline: " + e.Message;
                Debug.LogWarning(e);
                Net = null; // the server can't be read: the generator alone from now on
            }
            finally { loading = false; }
        }

        async Task Load(List<(int cx, int cz, int d)> list)
        {
            foreach (var c in list) pending.Add(ChunkStore.Key(c.cx, c.cz));
            var rows = new Dictionary<long, (string data, int sy)>();
            try
            {
                if (Net != null)
                {
                    int x0 = int.MaxValue, x1 = int.MinValue, z0 = int.MaxValue, z1 = int.MinValue;
                    foreach (var c in list) { x0 = Math.Min(x0, c.cx); x1 = Math.Max(x1, c.cx); z0 = Math.Min(z0, c.cz); z1 = Math.Max(z1, c.cz); }
                    string w = "world=eq." + Supabase.Q(WorldName);
                    var chunksT = Net.Select($"chunks?select=cx,cz,sy,data&{w}&cx=gte.{x0}&cx=lte.{x1}&cz=gte.{z0}&cz=lte.{z1}&order=cx,cz");
                    var editsT = Net.Select($"blocks?select=x,y,z,id,placed_by,placed_name,serial&{w}&x=gte.{x0 * 16}&x=lt.{(x1 + 1) * 16}&z=gte.{z0 * 16}&z=lt.{(z1 + 1) * 16}&order=x,y,z");
                    var signsT = Net.Select($"signs?select=x,y,z,text&{w}&x=gte.{x0 * 16}&x=lt.{(x1 + 1) * 16}&z=gte.{z0 * 16}&z=lt.{(z1 + 1) * 16}");
                    await Task.WhenAll(chunksT, editsT);
                    try
                    {
                        foreach (Dictionary<string, object> sg in await signsT)
                            SignRead?.Invoke(MiniJson.ToInt(sg["x"]), MiniJson.ToInt(sg["y"]), MiniJson.ToInt(sg["z"]), sg.TryGetValue("text", out var tx) ? tx as string : "");
                    }
                    catch (Exception e) { Debug.LogWarning(e); } // an older database without signs
                    foreach (Dictionary<string, object> r in chunksT.Result)
                        rows[ChunkStore.Key(MiniJson.ToInt(r["cx"]), MiniJson.ToInt(r["cz"]))] = (r["data"] as string, MiniJson.ToInt(r["sy"], World.SY));
                    foreach (Dictionary<string, object> e in editsT.Result)
                        Store.Edit(new BlockEdit
                        {
                            X = MiniJson.ToInt(e["x"]), Y = MiniJson.ToInt(e["y"]), Z = MiniJson.ToInt(e["z"]), Id = MiniJson.ToInt(e["id"]),
                            PlacedBy = e.TryGetValue("placed_by", out var pb) ? pb as string : null,
                            PlacedName = e.TryGetValue("placed_name", out var pn) ? pn as string : null,
                            Serial = (long)MiniJson.ToDouble(e.TryGetValue("serial", out var s) ? s : null, 0),
                        });
                    Status = "online · " + WorldName;
                }
            }
            finally
            {
                foreach (var c in list) pending.Remove(ChunkStore.Key(c.cx, c.cz));
            }
            // generating is the slow part: done off the main thread, then handed over
            var made = await Task.Run(() =>
            {
                var outp = new List<(int cx, int cz, byte[] a, bool frozen)>();
                foreach (var c in list)
                {
                    var k = ChunkStore.Key(c.cx, c.cz);
                    if (rows.TryGetValue(k, out var row)) outp.Add((c.cx, c.cz, World.DecodeChunk(row.data, row.sy), true));
                    else outp.Add((c.cx, c.cz, World.GenChunk(c.cx, c.cz), false));
                }
                return outp;
            });
            foreach (var m in made)
            {
                if (Store.Has(m.cx, m.cz)) continue;
                Store.PutArray(m.cx, m.cz, m.a, m.frozen);
                QueueMesh(m.cx, m.cz);
                QueueMesh(m.cx + 1, m.cz); QueueMesh(m.cx - 1, m.cz); QueueMesh(m.cx, m.cz + 1); QueueMesh(m.cx, m.cz - 1);
            }
        }

        public void QueueMesh(int cx, int cz)
        {
            if (Store.Has(cx, cz)) meshQueue.Add(ChunkStore.Key(cx, cz));
        }

        // a block changed at (x, z): its chunk, and the neighbour it touches, are meshed again
        public void Rebuild(int x, int z)
        {
            int cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
            Changed?.Invoke(cx, cz);
            QueueMesh(cx, cz);
            if (lx == 0) QueueMesh(cx - 1, cz);
            if (lx == 15) QueueMesh(cx + 1, cz);
            if (lz == 0) QueueMesh(cx, cz - 1);
            if (lz == 15) QueueMesh(cx, cz + 1);
        }

        // a block changed live in a chunk we drew from the generator: the server froze it just now, read its
        // terrain from there (11-multiplayer.js applyBlock), the known changes laid on top again
        public async void Refetch(int cx, int cz)
        {
            if (Net == null || Store.IsFrozen(cx, cz)) return;
            try
            {
                var rows = await Net.Select($"chunks?select=sy,data&world=eq.{Supabase.Q(WorldName)}&cx=eq.{cx}&cz=eq.{cz}");
                if (rows.Count == 0 || !Store.Has(cx, cz) || !(rows[0] is Dictionary<string, object> r)) return;
                var a = World.DecodeChunk(r["data"] as string, MiniJson.ToInt(r["sy"], World.SY));
                Store.PutArray(cx, cz, a, true);
                QueueMesh(cx, cz);
                QueueMesh(cx + 1, cz); QueueMesh(cx - 1, cz); QueueMesh(cx, cz + 1); QueueMesh(cx, cz - 1);
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        // the whole world read again (it was restored as generated, outside the claimed plots)
        public void ReloadAll()
        {
            foreach (var go in views.Values) { foreach (var f in go.GetComponentsInChildren<MeshFilter>()) Destroy(f.sharedMesh); Destroy(go); }
            views.Clear();
            meshQueue.Clear();
            meshSeq.Clear();
            Store.Clear();
        }

        void StartMesh(long key)
        {
            int cx = ChunkStore.KeyX(key), cz = ChunkStore.KeyZ(key);
            int seq = ++seqN;
            meshSeq[key] = seq;
            Interlocked.Increment(ref inFlight);
            // the meshing reads a snapshot of the 3x3 chunks around, so the main thread can keep changing them
            var snap = new byte[9][];
            for (int dz = -1; dz <= 1; dz++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    var c = Store.Chunk(cx + dx, cz + dz);
                    snap[(dz + 1) * 3 + dx + 1] = c == null ? null : (byte[])c.Clone();
                }
            var pw = Powered;
            var hid = Hidden;
            ThreadPool.QueueUserWorkItem(_ =>
            {
                MeshOut m = null;
                try
                {
                    if (threadMesher == null) threadMesher = new Mesher();
                    Func<int, int, int, int> get = (x, y, z) =>
                    {
                        if (y < 0 || y >= World.SY) return 0;
                        if (hid.Count > 0 && hid.Contains(Circuits.K(x, y, z))) return 0;
                        int ccx = x >> 4, ccz = z >> 4, ix = ccx - cx + 1, iz = ccz - cz + 1;
                        if (ix < 0 || ix > 2 || iz < 0 || iz > 2) return 0;
                        var a = snap[iz * 3 + ix];
                        return a == null ? 0 : a[World.Li(x - ccx * 16, y, z - ccz * 16)];
                    };
                    m = threadMesher.MeshChunk(cx, cz, get, (Func<int, int, int, bool>)((x, y, z) => pw.Count > 0 && pw.Contains(Circuits.K(x, y, z))));
                }
                catch (Exception e) { Debug.LogException(e); }
                lock (readyLock) ready.Enqueue((key, seq, m));
                Interlocked.Decrement(ref inFlight);
            });
        }

        void Apply(long key, MeshOut m)
        {
            if (views.TryGetValue(key, out var old)) Destroy(old);
            views.Remove(key);
            if (m == null) return;
            var go = new GameObject("chunk " + ChunkStore.KeyX(key) + "," + ChunkStore.KeyZ(key));
            go.transform.SetParent(transform, false);
            Part(go, m.Op, opMat, true);
            Part(go, m.Gl, glMat, false);
            Part(go, m.Wa, waMat, false);
            Part(go, m.Pl, plMat, false);
            views[key] = go;
            Meshed?.Invoke(key);
        }

        // a few blocks as the world draws them (22-gestures.js miniModel), for an animation to stand in for
        // them: cells (dx, dy, dz, id) in block coordinates; made: a piece of furniture made up for it (its
        // boxes and tiles), drawn in place of every cell. The model's origin is the cell (0, 0, 0)'s corner
        // (game x, y, z: Unity x, y, -z)
        static Mesher miniMesher;
        public GameObject MiniModel(IList<int[]> cells, BlockDef made = null)
        {
            const int Fake = 255;
            var at = new Dictionary<long, int>();
            foreach (var c in cells) at[Circuits.K(c[0] + 1, c[1] + 8, c[2] + 1)] = made != null ? Fake : c[3];
            var keep = Rules.Blocks[Fake];
            MeshOut m;
            try
            {
                if (made != null) { made.Id = Fake; Rules.Blocks[Fake] = made; }
                miniMesher ??= new Mesher();
                m = miniMesher.MeshChunk(0, 0, (x, y, z) => at.TryGetValue(Circuits.K(x, y, z), out var id) ? id : 0, (Func<int, int, int, bool>)((x, y, z) => false));
            }
            finally { Rules.Blocks[Fake] = keep; }
            var root = new GameObject("stand-in");
            var inner = new GameObject("model");
            inner.transform.SetParent(root.transform, false);
            inner.transform.localPosition = new Vector3(-1, -8, 1);
            Part(inner, m.Op, opMat, true);
            Part(inner, m.Gl, glMat, false);
            Part(inner, m.Pl, plMat, false);
            return root;
        }

        // a mesher group as a Unity mesh under parent (z mirrored, triangles turned around); null when empty
        public static GameObject Part(GameObject parent, MeshGroup g, Material mat, bool shadows)
        {
            if (g == null || g.Pos == null || g.Pos.Length == 0) return null;
            int n = g.Pos.Length / 3;
            var pos = new Vector3[n];
            var nor = new Vector3[n];
            var uv = new Vector2[n];
            for (int i = 0; i < n; i++)
            {
                pos[i] = new Vector3(g.Pos[i * 3], g.Pos[i * 3 + 1], -g.Pos[i * 3 + 2]);
                nor[i] = new Vector3(g.Nor[i * 3], g.Nor[i * 3 + 1], -g.Nor[i * 3 + 2]);
                uv[i] = new Vector2(g.Uv[i * 2], g.Uv[i * 2 + 1]);
            }
            var idx = new int[g.Idx.Length];
            for (int i = 0; i + 2 < idx.Length; i += 3)
            {
                idx[i] = g.Idx[i];
                idx[i + 1] = g.Idx[i + 2];
                idx[i + 2] = g.Idx[i + 1];
            }
            var mesh = new Mesh { indexFormat = n > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            mesh.vertices = pos;
            mesh.normals = nor;
            mesh.uv = uv;
            if (g.Col != null)
            {
                var col = new Color[n];
                // the alpha carries the face's outer-edge bits (Mesher Edge, 0..15 over 15): the clay look rounds those edges (Block.shader)
                for (int i = 0; i < n; i++) col[i] = new Color(g.Col[i * 3], g.Col[i * 3 + 1], g.Col[i * 3 + 2], g.Edge != null ? g.Edge[i] / 15f : 0);
                mesh.colors = col;
            }
            else
            {
                var col = new Color[n];
                for (int i = 0; i < n; i++) col[i] = Color.white;
                mesh.colors = col;
            }
            mesh.triangles = idx;
            mesh.RecalculateBounds();
            var go = new GameObject(mat.shader.name);
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            r.receiveShadows = true;
            return go;
        }

        void UnloadFar()
        {
            var p = PlayerPos();
            int pcx = World.COf(p.x), pcz = World.COf(p.z), lim = (ViewRadius + 2) * (ViewRadius + 2);
            var drop = new List<long>();
            foreach (var k in Store.Keys)
            {
                int dx = ChunkStore.KeyX(k) - pcx, dz = ChunkStore.KeyZ(k) - pcz;
                if (dx * dx + dz * dz > lim) drop.Add(k);
            }
            foreach (var k in drop)
            {
                Store.Drop(ChunkStore.KeyX(k), ChunkStore.KeyZ(k));
                meshQueue.Remove(k);
                meshSeq.Remove(k);
                if (views.TryGetValue(k, out var go)) { var mf = go.GetComponentsInChildren<MeshFilter>(); foreach (var f in mf) Destroy(f.sharedMesh); Destroy(go); }
                views.Remove(k);
            }
        }
    }
}
