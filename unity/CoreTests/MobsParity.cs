// The mobs (Core/MobsCore.cs, Core/MobSim.cs) against the game server itself: golden/mobs.json (node
// golden-mobs.mjs) holds scenes the server played with scripted players over WebSockets: what each player
// sent and received, tick after tick, and where every mob stood. Here the same inputs are fed to MobSim at the
// same moments, and everything it says, and every mob it steps, must match (numbers within a small tolerance).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class MobsParity
    {
        // the server's terrain (terrain.js) in the golden runs: a chunk is generated the moment anything asks for
        // it, and ready (its read from Supabase, empty in the tests, is back) at the next tick; edits are laid at
        // once and again over the chunk when its read comes back
        sealed class TestTerrain : IMobTerrain
        {
            readonly Dictionary<long, byte[]> chunks = new Dictionary<long, byte[]>();
            readonly HashSet<long> pending = new HashSet<long>();
            readonly Dictionary<(int, int, int), int> recent = new Dictionary<(int, int, int), int>();
            static long Key(int cx, int cz) => ChunkStore.Key(cx, cz);
            byte[] Chunk(int cx, int cz)
            {
                var k = Key(cx, cz);
                if (!chunks.TryGetValue(k, out var a))
                {
                    chunks[k] = a = World.GenChunk(cx, cz);
                    pending.Add(k);
                }
                return a;
            }
            public int Get(int x, int y, int z)
            {
                if (y < 0 || y >= World.SY) return 0;
                int cx = (int)Math.Floor(x / 16.0), cz = (int)Math.Floor(z / 16.0);
                return Chunk(cx, cz)[World.Li(x - cx * 16, y, z - cz * 16)];
            }
            public bool IsSolid(int id) => Mesher.IsSolid(id);
            public bool IsCross(int id) => Mesher.IsCross(id);
            public bool Has(int cx, int cz) => chunks.ContainsKey(Key(cx, cz));
            public bool Ready(int cx, int cz) => chunks.ContainsKey(Key(cx, cz)) && !pending.Contains(Key(cx, cz));
            public int Around(int cx, int cz, int r, int budget)
            {
                for (int ring = 0; ring <= r; ring++)
                    for (int dz = -ring; dz <= ring; dz++)
                        for (int dx = -ring; dx <= ring; dx++)
                        {
                            if (Math.Max(Math.Abs(dx), Math.Abs(dz)) != ring) continue;
                            if (!Has(cx + dx, cz + dz))
                            {
                                if (budget <= 0) continue;
                                budget--;
                            }
                            Chunk(cx + dx, cz + dz);
                        }
                return budget;
            }
            public void Edit(int x, int y, int z, int id)
            {
                int cx = (int)Math.Floor(x / 16.0), cz = (int)Math.Floor(z / 16.0);
                if (chunks.TryGetValue(Key(cx, cz), out var a)) a[World.Li(x - cx * 16, y, z - cz * 16)] = (byte)id;
                recent[(x, y, z)] = id;
            }
            // the reads come back: the pending chunks are final, with the recent edits laid over them
            public void Flush()
            {
                foreach (var k in pending)
                {
                    int cx = ChunkStore.KeyX(k), cz = ChunkStore.KeyZ(k);
                    var a = World.GenChunk(cx, cz);
                    foreach (var e in recent)
                    {
                        var (x, y, z) = e.Key;
                        if ((int)Math.Floor(x / 16.0) == cx && (int)Math.Floor(z / 16.0) == cz) a[World.Li(x - cx * 16, y, z - cz * 16)] = (byte)e.Value;
                    }
                    chunks[k] = a;
                }
                pending.Clear();
            }
        }

        // messages: a rounded value may be one hundredth off (a last-bit difference on a rounding edge); the mobs'
        // own positions and timers, unrounded, must agree far more closely
        const double TOL = 0.0101, TOL_RAW = 1e-7;
        static string Diff(object a, object b, string path, double tol = TOL)
        {
            if (a is double da && b is double db)
                return Math.Abs(da - db) <= tol || (double.IsNaN(da) && double.IsNaN(db)) ? null : $"{path}: {db} vs {da}";
            if (a is List<object> la && b is List<object> lb)
            {
                if (la.Count != lb.Count) return $"{path}: {lb.Count} items vs {la.Count} ({MiniJson.Write(b)} vs {MiniJson.Write(a)})";
                for (int i = 0; i < la.Count; i++) { var d = Diff(la[i], lb[i], path + "[" + i + "]", tol); if (d != null) return d; }
                return null;
            }
            if (a is Dictionary<string, object> ma && b is Dictionary<string, object> mb)
            {
                foreach (var k in ma.Keys.Union(mb.Keys))
                {
                    if (k == "color") continue; // the welcome's: the server's own, not the sim's
                    if (!ma.TryGetValue(k, out var va)) return $"{path}.{k}: missing in the web's";
                    if (!mb.TryGetValue(k, out var vb)) return $"{path}.{k}: missing ({MiniJson.Write(va)})";
                    var d = Diff(va, vb, path + "." + k, tol);
                    if (d != null) return d;
                }
                return null;
            }
            if (a == null && b == null) return null;
            return Equals(a, b) ? null : $"{path}: {MiniJson.Write(b)} vs {MiniJson.Write(a)}";
        }
        // a C# message as the JSON the server would send (doubles, lists, dictionaries)
        static object Json(object v) => MiniJson.Parse(MiniJson.Write(v));

        public static void Run()
        {
            var dir = MeshParity.Dir();
            if (!Rules.Loaded) Rules.Load(File.ReadAllText(Path.Combine(dir, "..", "Assets", "Resources", "rules.json")));
            Mesher.RulesChanged();
            var file = Path.Combine(dir, "golden", "mobs.json");
            if (!File.Exists(file)) { Program.Check(false, "mobs: golden/mobs.json missing (node golden-mobs.mjs)"); return; }
            var scenes = (List<object>)MiniJson.Parse(File.ReadAllText(file));
            foreach (Dictionary<string, object> sc in scenes) Scene(sc);
        }

        static void Scene(Dictionary<string, object> sc)
        {
            string name = (string)sc["name"];
            double t0 = MiniJson.ToDouble(sc["t0"]);
            var terrain = new TestTerrain();
            var sim = new MobSim(terrain, t0) { PaysLoot = true };
            var box = new Dictionary<string, List<object>>();
            var lootQ = new List<MobLoot>();
            var stepped = new List<object>();
            sim.Send += (p, m) => box[p.Id].Add(Json(m));
            sim.Loot += l => lootQ.Add(l);
            sim.Stepped += a => stepped.Add(new List<object> { a.Id, a.X, a.Y, a.Z, a.Ry, a.Hp, a.Tgt });
            sim.UseItem = (p, item) => new Dictionary<string, object> { ["ok"] = true };
            var lootR = new Dictionary<string, object> { ["ok"] = true, ["gwei"] = 3.0, ["total_gwei"] = 10.0 };
            var owned = ((List<object>)sc["owned"]).Select(o => MiniJson.ToInt(o)).ToList();
            var players = new Dictionary<string, MobPlayer>();
            int segs = 0, msgs = 0, steps = 0;
            string first = null;
            void Fail(string what) { first ??= what; }
            void Compare(string where, string pid, List<object> want)
            {
                var got = box[pid];
                box[pid] = new List<object>();
                segs++;
                msgs += want.Count;
                var d = Diff(want, got, where + " " + pid);
                if (d != null) Fail(d);
            }
            var hello = (Dictionary<string, object>)sc["hello"];
            foreach (Dictionary<string, object> pl in (List<object>)sc["players"])
            {
                string id = (string)pl["id"];
                box[id] = new List<object>();
                var p = sim.Join(id, (Dictionary<string, object>)pl["hello"], t0, id);
                foreach (var o in owned) p.Owned.Add(o);
                players[id] = p;
                Compare("hello", id, (List<object>)hello[id]);
            }
            var ticks = (List<object>)sc["ticks"];
            for (int k = 0; k < ticks.Count; k++)
            {
                var tk = (Dictionary<string, object>)ticks[k];
                double now = t0 + k * MobSim.TICK_MS;
                var seg = (Dictionary<string, object>)tk["seg"];
                var inputs = (List<object>)tk["inputs"];
                var lootGot = new List<object>();
                // each player's inputs, then its ping (the end of its segment), in the order the players are
                foreach (var pid in players.Keys)
                {
                    foreach (List<object> inp in inputs)
                    {
                        if ((string)inp[0] != pid) continue;
                        sim.Receive(players[pid], (Dictionary<string, object>)inp[1], now);
                        foreach (var l in lootQ)
                        {
                            lootGot.Add(new List<object> { l.PlayerId, l.Type, l.X, l.Y, l.Z });
                            sim.SendLoot(l.PlayerId, l.Type, lootR);
                        }
                        lootQ.Clear();
                    }
                    Compare($"{name} tick {k}", pid, (List<object>)seg[pid]);
                }
                var dl = Diff(tk["loot"], Json(lootGot), $"{name} tick {k} loot");
                if (dl != null) Fail(dl);
                terrain.Flush();
                stepped.Clear();
                sim.Tick(now + MobSim.TICK_MS);
                steps += stepped.Count;
                var ds = Diff(tk["stepped"], Json(stepped), $"{name} tick {k} stepped", TOL_RAW);
                if (ds != null) Fail(ds);
                if (first != null) break;
            }
            if (first == null)
            {
                var fin = (Dictionary<string, object>)sc["final"];
                foreach (var pid in players.Keys) Compare(name + " final", pid, (List<object>)fin[pid]);
            }
            Program.Check(first == null, $"mobs: {name}: {ticks.Count} ticks, {steps} mob steps, {msgs} messages in {segs} segments as the game server" + (first != null ? " — first difference: " + first : ""));
        }
    }
}
