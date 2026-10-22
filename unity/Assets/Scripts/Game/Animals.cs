// Ether Mines · animals and villagers (09-animals.js): placed per chunk from the seed and moved by the real
// clock, so every player sees the same ones in the same place without a word on the network. Rabbits,
// foxes, cats, shibas, validator robots on the ground, prism fish in the sea, jellyfish over the floating
// islands (no sheep: Pierre's choice); the villagers in the Atrium and the City. Right-click one: pet it
// (hearts; a fox's flower or a jellyfish's crystal once a day, act_gift) or talk to a villager (their lines, one at a time). Left-click an
// animal with hearts to fight it: a kill gives one of yours back if you're hurt (the game server's `heal`).
// Models from the game itself (Resources/animals.json, tools/export-animals.mjs), drawn by Mobs' builder.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Animals : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;
        public Mobs Mobs;           // the model builder
        public Session Session;     // null offline
        public GameLink Link;       // null offline (or before the game server answers)
        public Combat Combat;

        sealed class Kind { public string Type, N; public double D, Walk, R; public float[] Hit; public int Hp; public bool Gift; public List<object> Models; public int[] Variant; }
        sealed class Villager { public int X, Z; public string Name, Role, After, Color; public List<string> Says; public object Model; }
        public sealed class Animal
        {
            public string Type, K; public int I; public Mobs.Mob Rig;
            public double Hx, Hz, Hy, Bot, R, Ph; public int Seed, Hp;
            public long Wk = long.MinValue; public Vector3 From, To; public float Y, Walk, Pet = -1, Dying = -1, Yaw;
            public Vector3 Pos; public int VillagerIx = -1, Rep = -1;
        }

        readonly Dictionary<string, Kind> kinds = new Dictionary<string, Kind>();
        readonly List<Villager> villagers = new List<Villager>();
        readonly Dictionary<long, List<Animal>> chunks = new Dictionary<long, List<Animal>>();
        float spawnT, netT;
        int network; string topName; int topN;
        // the dialogue bubble
        string dName, dRole, dText, dColor; float dAt = -99, dUntil;
        GUIStyle tagStyle;
        struct Heart { public Transform T; public float Life; }
        readonly List<Heart> hearts = new List<Heart>();
        Material heartMat;

        void Awake()
        {
            var root = (Dictionary<string, object>)MiniJson.Parse(Resources.Load<TextAsset>("animals").text);
            foreach (var kv in (Dictionary<string, object>)root["types"])
            {
                var d = (Dictionary<string, object>)kv.Value;
                var hit = (List<object>)d["hit"];
                var v = (List<object>)d["variant"];
                kinds[kv.Key] = new Kind
                {
                    Type = kv.Key, N = d["n"] as string, D = MiniJson.ToDouble(d["D"]), Walk = MiniJson.ToDouble(d["walk"]), R = MiniJson.ToDouble(d["R"]),
                    Hit = new[] { (float)MiniJson.ToDouble(hit[0]), (float)MiniJson.ToDouble(hit[1]), (float)MiniJson.ToDouble(hit[2]) },
                    Hp = MiniJson.ToInt(d["hp"]), Gift = d["gift"] != null, Models = (List<object>)d["models"], Variant = v.ConvertAll(o => MiniJson.ToInt(o)).ToArray(),
                };
            }
            foreach (Dictionary<string, object> h in (List<object>)root["villagers"])
                villagers.Add(new Villager
                {
                    X = MiniJson.ToInt(h["x"]), Z = MiniJson.ToInt(h["z"]), Name = h["name"] as string, Role = h["role"] as string, After = h["after"] as string,
                    Color = ((List<object>)h["outfit"])[0] as string, Says = ((List<object>)h["says"]).ConvertAll(o => o as string), Model = h["model"],
                });
        }

        static long Key(int cx, int cz) => ((long)cx << 32) ^ (uint)cz;
        static double Hash(double a, double b, int s) => EtherMines.Core.World.Hash(a, b, s);
        int Get(int x, int y, int z) => World.Get(x, y, z);
        static bool Solid(int id) => Mesher.IsSolid(id);
        static bool Cross(int id) => Mesher.IsCross(id);

        // ground under (x, z): the first solid block going down from ref + up (trunks and leaves skipped when noTree)
        bool GroundAt(double x, double z, double reff, bool noTree, int up, out float gy, out bool water)
        {
            int xi = (int)Math.Floor(x), zi = (int)Math.Floor(z);
            gy = 0; water = false;
            for (int y = Math.Min(EtherMines.Core.World.SY - 1, (int)Math.Floor(reff) + up); y >= Math.Max(0, (int)Math.Floor(reff) - 8); y--)
            {
                int id = Get(xi, y, zi);
                if (id == 11) { gy = y + 1; water = true; return true; }
                if (noTree && (id == 5 || id == 7)) return false;
                if (Solid(id)) { gy = y + 1; return true; }
            }
            return false;
        }

        Animal New(string type, string k, int i, double hx, double hz, double r, double ph, int seed)
        {
            var K = kinds[type];
            return new Animal { Type = type, K = k, I = i, Hx = hx, Hz = hz, R = r, Ph = ph, Seed = seed, Hp = K.Hp };
        }

        void Dress(Animal a, object model)
        {
            a.Rig = new Mobs.Mob();
            Mobs.BuildModel(a.Rig, (Dictionary<string, object>)model, transform);
            a.Y = (float)a.Hy;
        }

        static int Seed(double x, double z, int i) =>
            EtherMines.Core.World.ToInt32(x * 73856093.0) ^ EtherMines.Core.World.ToInt32(z * 19349663.0) ^ EtherMines.Core.World.ToInt32(i * 83492791.0);

        // spawnChunk: the same animals as on every screen
        void Spawn(int cx, int cz)
        {
            var key = Key(cx, cz);
            if (chunks.ContainsKey(key)) return;
            var list = new List<Animal>();
            chunks[key] = list;
            string k = cx + "," + cz;
            double r = Hash(cx * 7 + 1, cz * 13 + 2, 61);
            int x0 = cx * 16, z0 = cz * 16;
            void Add(string type, int n)
            {
                for (int i = 0; i < n; i++)
                {
                    int hx = x0 + 2 + (int)Math.Floor(Hash(cx + i * 31, cz, 62 + i) * 12), hz = z0 + 2 + (int)Math.Floor(Hash(cx, cz + i * 17, 70 + i) * 12);
                    var a = New(type, k, i, hx + 0.5, hz + 0.5, Hash(cx * 3 + i, cz * 5, 80), Hash(cx + i, cz - i, 81) * 60, Seed(cx, cz, i));
                    if (type == "jellyfish")
                    {
                        int t = EtherMines.Core.World.IslandTop(hx, hz);
                        if (t < 0) continue;
                        a.Hy = t + 3;
                    }
                    else if (type == "fish")
                    {
                        int sy = -1, sid = 0;
                        for (int y = EtherMines.Core.World.SY - 1; y > 0; y--) { int id = Get(hx, y, hz); if (id == 0 || Cross(id)) continue; sid = id; sy = y; break; }
                        if (sy < 0 || sid != 11) continue;
                        int b = sy;
                        while (b > 0 && Get(hx, b - 1, hz) == 11) b--;
                        if (sy - b < 2) continue;
                        a.Hy = sy; a.Bot = b;
                    }
                    else
                    {
                        int h0 = EtherMines.Core.World.HeightAt(hx, hz), sy = int.MinValue, sid = 0;
                        for (int y = Math.Min(EtherMines.Core.World.SY - 1, h0 + 5); y >= h0 - 3; y--)
                        {
                            int id = Get(hx, y, hz);
                            if (id == 5 || id == 7 || id == 0 || Cross(id)) continue;
                            sid = id; sy = y; break;
                        }
                        if (sy == int.MinValue || sid == 11 || !Solid(sid)) continue;
                        int above = Get(hx, sy + 1, hz);
                        if (above != 0 && !Cross(above)) continue;
                        a.Hy = sy + 1;
                    }
                    var K = kinds[type];
                    Dress(a, K.Models[K.Variant[Math.Min(23, (int)Math.Floor(a.R * 24))]]);
                    list.Add(a);
                }
            }
            // at a fixed spot (villagers, the sanctuary's companions): on the first solid ground under the roofs
            void Fixed(string type, int i, int x, int z, int vix)
            {
                int y0 = (EtherMines.Core.World.InCity(x, z) ? EtherMines.Core.World.CITY.Y : EtherMines.Core.World.HeightAt(x, z)) + 3;
                for (int y = y0; y >= y0 - 6; y--)
                {
                    int id = Get(x, y, z);
                    if (id == 0 || id == 11 || !Solid(id)) continue;
                    var a = New(type, k, i, x + 0.5, z + 0.5, Hash(x, z, 80), Hash(x, z, 81) * 60, Seed(x, z, i));
                    a.Hy = y + 1;
                    a.VillagerIx = vix;
                    if (vix >= 0) Dress(a, villagers[vix].Model);
                    else { var K = kinds[type]; Dress(a, K.Models[K.Variant[Math.Min(23, (int)Math.Floor(a.R * 24))]]); }
                    list.Add(a);
                    return;
                }
            }
            for (int n = 0; n < villagers.Count; n++)
                if (EtherMines.Core.World.COf(villagers[n].X) == cx && EtherMines.Core.World.COf(villagers[n].Z) == cz) Fixed("villager", 40 + n, villagers[n].X, villagers[n].Z, n);
            var S = EtherMines.Core.World.SPAWN.X; var SZ = EtherMines.Core.World.SPAWN.Z;
            if (cx == EtherMines.Core.World.COf(S) && cz == EtherMines.Core.World.COf(SZ))
            {
                Fixed("robot", 30, S - 5, SZ, -1);
                Fixed("shiba", 31, S + 3, SZ - 5, -1);
                return;
            }
            double r2 = Hash(cx * 5 - 3, cz * 11 + 7, 65);
            for (int t = 0; t < 3; t++)
            {
                int x = x0 + 4 + t * 4, z = z0 + 8;
                if (EtherMines.Core.World.IslandTop(x, z) > 0) { if (r2 < 0.18) Add("jellyfish", 1); break; }
            }
            int hc = EtherMines.Core.World.HeightAt(x0 + 8, z0 + 8);
            if (hc < EtherMines.Core.World.SEA) { if (r < 0.25) Add("fish", 2 + (int)Math.Floor(Hash(cx, cz, 66) * 3)); return; }
            if (EtherMines.Core.World.InCity(x0 + 8, z0 + 8))
            {
                if (r < 0.5) Add("robot", 1);
                if (Hash(cx, cz, 68) < 0.4) Add("cat", 1);
                return;
            }
            var bi = EtherMines.Core.World.Biome(x0 + 8, z0 + 8);
            double r3 = Hash(cx * 11 - 5, cz * 3 + 9, 67);
            if (r3 < 0.05) Add("cat", 1 + (r3 < 0.02 ? 1 : 0));
            else if (r3 < 0.07) Add(bi == "dunes" ? "shiba" : "cat", 1);
            else if (r3 < 0.08) Add("robot", 1);
            // (no sheep in the world, as on the web: the kind is kept, nothing places it)
            if (bi == "plain") { if (r < 0.24) Add("rabbit", 1 + (r < 0.2 ? 1 : 0)); }
            else if (bi == "forest")
            {
                if (r < 0.1) Add("fox", 1);
                else if (r < 0.18) Add("rabbit", 1);
            }
            else if (r < 0.14) Add("rabbit", 1 + (int)Math.Floor(Hash(cx, cz, 64) * 2));
        }

        void Despawn(long key)
        {
            foreach (var a in chunks[key]) Destroy(a.Rig.Root);
            chunks.Remove(key);
        }

        // waypoint #k: around home, on ground it can reach (otherwise home)
        Vector3 Waypoint(Animal a, long k)
        {
            var K = kinds[a.Type];
            double an = Hash(a.Seed, k, 90) * Math.PI * 2, rr = Math.Sqrt(Hash(a.Seed, k, 91)) * K.R;
            double x = a.Hx + Math.Cos(an) * rr, z = a.Hz + Math.Sin(an) * rr;
            if (a.Type == "fish")
            {
                bool ok = Get((int)Math.Floor(x), (int)a.Hy - 1, (int)Math.Floor(z)) == 11 && Get((int)Math.Floor(x), (int)a.Bot, (int)Math.Floor(z)) == 11;
                if (!ok) { x = a.Hx; z = a.Hz; }
                return new Vector3((float)x, (float)(ok ? a.Bot + 0.35 + Hash(a.Seed, k, 92) * (a.Hy - a.Bot - 1) : a.Hy - 0.8), (float)z);
            }
            if (a.Type == "jellyfish") return new Vector3((float)x, (float)(a.Hy + Hash(a.Seed, k, 92) * 3), (float)z);
            if (!GroundAt(x, z, a.Hy, true, 3, out var gy, out var water) || water || Math.Abs(gy - a.Hy) > 2 ||
                (Get((int)Math.Floor(x), (int)gy, (int)Math.Floor(z)) != 0 && !Cross(Get((int)Math.Floor(x), (int)gy, (int)Math.Floor(z)))))
            { x = a.Hx; z = a.Hz; }
            return new Vector3((float)x, float.NaN, (float)z);
        }

        void Update()
        {
            var b = Player.Body;
            if (b == null) return;
            float dt = Time.deltaTime;
            if ((spawnT -= dt) <= 0)
            {
                spawnT = 1;
                int pcx = EtherMines.Core.World.COf(b.X), pcz = EtherMines.Core.World.COf(b.Z);
                var want = new HashSet<long>();
                for (int dz = -3; dz <= 3; dz++)
                    for (int dx = -3; dx <= 3; dx++)
                    {
                        if (!World.Store.Has(pcx + dx, pcz + dz)) continue;
                        want.Add(Key(pcx + dx, pcz + dz));
                        Spawn(pcx + dx, pcz + dz);
                    }
                foreach (var k in new List<long>(chunks.Keys)) if (!want.Contains(k)) Despawn(k);
            }
            if (Session != null && (netT -= dt) <= 0) { netT = 60; Network(); }
            double T = (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
            foreach (var list in chunks.Values)
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    var a = list[i];
                    if (a.Dying >= 0)
                    {
                        a.Dying -= dt;
                        a.Rig.Root.transform.localScale = Vector3.one * Mathf.Max(0, a.Dying / 0.4f);
                        if (a.Dying <= 0) { Destroy(a.Rig.Root); list.RemoveAt(i); }
                        continue;
                    }
                    Move(a, T, dt, b);
                }
            for (int i = hearts.Count - 1; i >= 0; i--)
            {
                var h = hearts[i];
                h.Life += dt;
                if (h.Life > 0) h.T.position += Vector3.up * dt * 0.9f;
                h.T.gameObject.SetActive(h.Life > 0);
                h.T.localScale = Vector3.one * 0.14f * Mathf.Clamp01(1 - h.Life / 1.4f);
                hearts[i] = h;
                if (h.Life > 1.4f) { Destroy(h.T.gameObject); hearts.RemoveAt(i); }
            }
        }

        void Move(Animal a, double T, float dt, PlayerPhysics me)
        {
            var K = kinds[a.Type];
            double tt = T + a.Ph;
            long k = (long)Math.Floor(tt / K.D);
            double f = tt / K.D - k;
            if (a.Wk != k) { a.Wk = k; a.From = Waypoint(a, k - 1); a.To = Waypoint(a, k); }
            float s = Mathf.Clamp01((float)(f / K.Walk));
            bool moving = s < 1 && new Vector2(a.To.x - a.From.x, a.To.z - a.From.z).magnitude > 0.3f;
            s = s * s * (3 - 2 * s);
            float x = Mathf.Lerp(a.From.x, a.To.x, s), z = Mathf.Lerp(a.From.z, a.To.z, s);
            if (moving)
            {
                float h = Mathf.Atan2(a.To.x - a.From.x, a.To.z - a.From.z), dr = h - a.Yaw;
                dr = Mathf.Atan2(Mathf.Sin(dr), Mathf.Cos(dr));
                a.Yaw += dr * Mathf.Min(1, dt * 6);
            }
            a.Walk += dt * (moving ? 9 : 0);
            float sw = moving ? Mathf.Sin(a.Walk) : 0, y;
            var rig = a.Rig;
            Vector3 scale = Vector3.one;
            float Tf = (float)(T % 100000), ph = (float)a.Ph;
            if (a.Type == "fish")
            {
                y = Mathf.Lerp(a.From.y, a.To.y, s) + Mathf.Sin(Tf * 2 + ph) * 0.06f;
                Mobs.Pose(rig, "tail", new Vector3(0, Mathf.Sin(Tf * (moving ? 14 : 5) + ph) * 0.5f, 0));
            }
            else if (a.Type == "jellyfish")
            {
                y = Mathf.Lerp(a.From.y, a.To.y, s) + Mathf.Sin(Tf * 0.9f + ph) * 0.35f;
                float pu = Mathf.Sin(Tf * 2 + ph);
                scale = new Vector3(1 + pu * 0.05f, 1 - pu * 0.06f, 1 + pu * 0.05f);
                for (int i = 0; i < 4; i++) Mobs.Pose(rig, "tent:" + i, new Vector3(Mathf.Sin(Tf * 1.7f + i) * 0.3f, 0, Mathf.Cos(Tf * 1.3f + i) * 0.3f));
                a.Yaw += dt * 0.2f;
            }
            else
            {
                if (GroundAt(x, z, a.Y + 0.1f, false, 1, out var gy, out var water) && !water) a.Y += (gy - a.Y) * Mathf.Min(1, dt * 10);
                float hop = a.Type == "rabbit" && moving ? Mathf.Abs(Mathf.Sin(a.Walk * 0.8f)) * 0.35f : 0;
                y = a.Y + hop;
                for (int i = 0; rig.Parts.ContainsKey("legs:" + i); i++) Mobs.Pose(rig, "legs:" + i, new Vector3((i % 2 == 1 ? -1 : 1) * (i < 2 ? 1 : -1) * sw * 0.6f, 0, 0));
                if (rig.Parts.TryGetValue("head", out var head))
                {
                    var e = rig.Euler.TryGetValue(head, out var ee) ? ee : Vector3.zero;
                    bool graze = a.Type == "sheep" && !moving && Mathf.Sin((float)(tt % 100000) * 0.7f) > 0.2f;
                    e.x += ((graze ? 0.7f : Mathf.Sin((float)(tt % 100000) * 0.9f) * 0.08f) - e.x) * Mathf.Min(1, dt * 4);
                    e.y = moving ? 0 : Mathf.Sin((float)(tt % 100000) * 0.5f + ph) * 0.35f;
                    Mobs.Pose(rig, "head", e);
                }
                Mobs.Pose(rig, "tail", new Vector3(0, Mathf.Sin(Tf * 3 + ph) * 0.25f, 0));
            }
            // a villager turns toward you as you come near
            float d = Mathf.Sqrt((x - (float)me.X) * (x - (float)me.X) + (z - (float)me.Z) * (z - (float)me.Z));
            if (a.Type == "villager" && !moving && d < 4.5f)
            {
                float dr = Mathf.Atan2((float)me.X - x, (float)me.Z - z) - a.Yaw;
                dr = Mathf.Atan2(Mathf.Sin(dr), Mathf.Cos(dr));
                a.Yaw += dr * Mathf.Min(1, dt * 5);
                if (rig.Parts.ContainsKey("head")) Mobs.Pose(rig, "head", Vector3.zero);
            }
            float wob = 0;
            if (a.Pet > 0) { a.Pet -= dt; wob = Mathf.Sin(a.Pet * 20) * 0.08f * a.Pet; }
            a.Pos = new Vector3(x, y, z);
            var t = rig.Root.transform;
            t.SetPositionAndRotation(new Vector3(x, y, -z), Mobs.Mirror(new Vector3(0, a.Yaw, wob), true));
            t.localScale = scale;
        }

        // the animal your aim meets first, within reach and before any block (pickAnimal)
        public Animal Pick(Vector3 eye, Vector3 dir, float reach, float blockDist)
        {
            Animal best = null;
            float bd = Mathf.Min(reach, blockDist);
            foreach (var list in chunks.Values)
                foreach (var a in list)
                {
                    if (a.Dying >= 0) continue;
                    var h = kinds[a.Type].Hit;
                    float m = Mathf.Max(h[0], h[2]) / 2;
                    float d = Mobs.RayBox(eye, dir, new Vector3(a.Pos.x - m, a.Pos.y, a.Pos.z - m), new Vector3(a.Pos.x + m, a.Pos.y + h[1], a.Pos.z + m));
                    if (d >= 0 && d < bd) { bd = d; best = a; }
                }
            return best;
        }

        public bool Fightable(Animal a) => kinds[a.Type].Hp > 0;

        // a blow on an animal (attackAnimal): at 0 it falls, and gives you a heart back if you're hurt
        public void Strike(Animal a, double dmg)
        {
            a.Hp -= (int)Math.Ceiling(dmg);
            a.Pet = 0.25f;
            if (a.Hp > 0) return;
            a.Hp = 0;
            a.Dying = 0.4f;
            if (Combat != null && Combat.Hp < 10 && Link != null && Link.HpServer) Link.Send(new Dictionary<string, object> { ["t"] = "heal", ["kind"] = "hunt" });
        }

        // a right-click: pet an animal, talk to a villager (petAnimal, talk)
        public void Pet(Animal a)
        {
            if (a.VillagerIx >= 0) { Talk(a); return; }
            var K = kinds[a.Type];
            a.Pet = 0.6f;
            if (Session != null) { Session.State["petted"] = 1.0; Session.Dirty = true; }
            for (int i = 0; i < (a.Type == "jellyfish" ? 5 : 3); i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(go.GetComponent<Collider>());
                if (heartMat == null) { heartMat = new Material(Shader.Find("EtherMines/Glow")); heartMat.SetColor("_Color", new Color(1f, 0.42f, 0.6f)); }
                go.GetComponent<MeshRenderer>().sharedMaterial = heartMat;
                go.transform.SetParent(transform, false);
                go.transform.position = new Vector3(a.Pos.x + (UnityEngine.Random.value - 0.5f) * 0.6f, a.Pos.y + K.Hit[1] + 0.1f + i * 0.15f, -(a.Pos.z + (UnityEngine.Random.value - 0.5f) * 0.6f));
                go.transform.rotation = Quaternion.Euler(0, 0, 45);
                hearts.Add(new Heart { T = go.transform, Life = -i * 0.12f });
            }
            // a sheep's wool, a fox's flower, a jellyfish's crystal: once a day per animal (act_gift)
            if (!K.Gift || Session == null) return;
            string key = a.K + ":" + a.I, today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            if (!Session.State.TryGetValue("pets", out var po) || !(po is Dictionary<string, object> pets)) Session.State["pets"] = pets = new Dictionary<string, object>();
            if (pets.TryGetValue(key, out var day) && day as string == today) return;
            pets[key] = today;
            Session.Dirty = true;
            _ = Session.Act("gift", new Dictionary<string, object> { ["animal"] = key, ["kind"] = a.Type }, 0, 0, 0,
                            a.Type == "fox" ? "picked by a pink fox" : a.Type == "sheep" ? "wool offered by a sheep" : "crystal left by a sky jellyfish");
        }

        void Talk(Animal a)
        {
            var h = villagers[a.VillagerIx];
            bool epilogue = Session != null && Session.State.TryGetValue("seen", out var sv) && sv is Dictionary<string, object> seen && seen.ContainsKey("epilogue");
            var says = epilogue && h.After != null ? new List<string> { h.After }.Concat2(h.Says) : h.Says;
            a.Rep = (a.Rep + 1) % says.Count;
            var line = says[a.Rep];
            if (line == "@network") line = network > 0 || Session != null ? NetworkLine() : "The network is waiting for its first relit validator.";
            else if (line == "@top") line = topName != null ? $"{topName} watches over {topN} validator{(topN > 1 ? "s" : "")}: no one has relit more." : "No one has relit an old validator yet. The first name carved here could be yours.";
            else if (line == "@ruin") line = RuinLine();
            dName = h.Name; dRole = h.Role; dColor = h.Color; dText = line; dAt = Time.time; dUntil = Time.time + 1 + line.Length * 0.062f;
            a.Pet = 0.25f;
            if (Session != null)
            {
                if (!Session.State.TryGetValue("met", out var mo) || !(mo is Dictionary<string, object> met)) Session.State["met"] = met = new Dictionary<string, object>();
                if (!met.ContainsKey(h.Name)) { met[h.Name] = 1.0; Session.Dirty = true; }
            }
        }

        static readonly int[] Tiers = { 3, 10, 25, 50, 100 };
        string NetworkLine()
        {
            foreach (var g in Tiers) if (g > network) return $"The network has {network} old validator{(network > 1 ? "s" : "")} relit. At {g}, the great diamond in the sky will awaken a bit more.";
            return "The network is awake: the great diamond shines with all its light. Thanks to every watcher.";
        }

        string RuinLine()
        {
            var b = Player.Body;
            int rx = (int)Math.Floor(b.X / EtherMines.Core.World.RUIN), rz = (int)Math.Floor(b.Z / EtherMines.Core.World.RUIN);
            Site best = null;
            double bd = 1e9;
            for (int dz = -2; dz <= 2; dz++)
                for (int dx = -2; dx <= 2; dx++)
                {
                    var r = EtherMines.Core.World.RuinAt(rx + dx, rz + dz);
                    if (r == null) continue;
                    if (World.Loaded(r.X, r.Z) && World.Get(r.X, r.Y + 1, r.Z) != 73) continue;
                    double d = Math.Sqrt((r.X + 0.5 - b.X) * (r.X + 0.5 - b.X) + (r.Z + 0.5 - b.Z) * (r.Z + 0.5 - b.Z));
                    if (d < bd) { bd = d; best = r; }
                }
            if (best == null) return "Every ruin nearby has been relit. You need to go further.";
            // which way, from where you look (arrowTo)
            double ddx = best.X + 0.5 - b.X, ddz = best.Z + 0.5 - b.Z, fwd = ddx * -Math.Sin(Player.Yaw) + ddz * -Math.Cos(Player.Yaw), right = ddx * Math.Cos(Player.Yaw) - ddz * Math.Sin(Player.Yaw);
            string[] arrows = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };
            int i = ((int)Math.Round(Math.Atan2(right, fwd) / (Math.PI / 4)) % 8 + 8) % 8;
            return $"The nearest ruin is {Math.Round(bd)} m that way: {arrows[i]}. A dark validator waits there for its heart.";
        }

        async void Network()
        {
            try
            {
                var r = await Session.Act("network", new Dictionary<string, object>(), 0, 0, 0);
                if (r == null || r.ContainsKey("refused")) return;
                network = MiniJson.ToInt(r.TryGetValue("n", out var n) ? n : null);
                if (r.TryGetValue("top", out var t) && t is List<object> top && top.Count > 0 && top[0] is Dictionary<string, object> f)
                { topName = f["name"] as string; topN = MiniJson.ToInt(f["n"]); }
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        void OnGUI()
        {
            Ui.Begin();
            var cam = Player.Cam;
            if (cam == null || Player.Body == null) return;
            if (tagStyle == null) tagStyle = new GUIStyle(GUI.skin.label) { fontSize = 14, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, richText = true };
            // the villagers' names over their heads
            foreach (var list in chunks.Values)
                foreach (var a in list)
                {
                    if (a.VillagerIx < 0) continue;
                    var s = cam.WorldToScreenPoint(new Vector3(a.Pos.x, a.Pos.y + 2.15f, -a.Pos.z));
                    s = new Vector3(s.x / Ui.Scale, s.y / Ui.Scale, s.z);
                    if (s.z <= 0 || s.z > 40) continue;
                    var h = villagers[a.VillagerIx];
                    float w = tagStyle.CalcSize(new GUIContent(h.Name)).x + 24, x = s.x - w / 2, y = Ui.H - s.y - 12;
                    Ui.Fill(new Rect(x, y, w, 24), new Color(0.11f, 0.086f, 0.23f, 0.72f));
                    GUI.Label(new Rect(x, y, w, 24), $"<color={h.Color}>{h.Name}</color>", tagStyle);
                }
            // the dialogue bubble, typed out
            if (Time.time > dUntil + 1.5f || dText == null) return;
            int shown = Mathf.Min(dText.Length, (int)((Time.time - dAt) / 0.02f));
            float bw = Mathf.Min(640, Ui.W - 40), bx = (Ui.W - bw) / 2, by = Ui.H - 230;
            Ui.Fill(new Rect(bx, by, bw, 96), new Color(0.13f, 0.1f, 0.27f, 0.92f));
            GUI.Label(new Rect(bx + 16, by + 8, bw - 32, 22), $"<b><color={dColor}>{dName}</color></b>  <i><color=#c9c2f2>{dRole}</color></i>", Ui.Label);
            GUI.Label(new Rect(bx + 16, by + 32, bw - 32, 60), dText.Substring(0, shown), Ui.Label);
        }
    }

    static class ListExt
    {
        public static List<string> Concat2(this List<string> a, List<string> b) { var l = new List<string>(a); l.AddRange(b); return l; }
    }
}
