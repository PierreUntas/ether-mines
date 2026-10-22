// Ether Mines · circuits made of blocks (12-circuits.js): levers, pressure plates and clocks feed the
// current through Ether Cable into lamps and doors; AND, OR and NOT gates (output in front, inputs on the
// sides and the back) turn on from what reaches them. Nothing is saved: each screen recomputes it from the
// blocks and where the players stand. Also spots the objectives' shapes (a gate lighting a lamp, a two-key
// door, a blinker, a latch, a coin flip). Pure C#, checked against the JavaScript (CoreTests).
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public sealed class Circuits
    {
        // circuits: doors, levers, plates, cables, lamps, logic gates, clock
        public static bool IsSpecial(int id) => (id >= 48 && id <= 68) || (id >= 111 && id <= 123);

        const int Off = 1 << 20;
        public static long K(int x, int y, int z) => ((long)(x + Off) << 30) | ((long)(z + Off) << 8) | (long)y;
        public static void D(long k, out int x, out int y, out int z) { y = (int)(k & 255); z = (int)((k >> 8) & 0x3FFFFF) - Off; x = (int)(k >> 30) - Off; }

        public readonly HashSet<long> GateOn = new HashSet<long>();
        public readonly HashSet<long> Powered = new HashSet<long>();
        // the objectives' shapes, once seen (S.gateLit, S.twoKeyDoor, S.gateBlinker, S.gateLatch, S.gateCoinFlip)
        public bool GateLit, TwoKeyDoor, Blinker, Latch, CoinFlip;
        public bool DoorChanged, PlateChanged; // the last step: for the sounds

        static readonly int[][] N6 = { new[] { 1, 0, 0 }, new[] { -1, 0, 0 }, new[] { 0, 1, 0 }, new[] { 0, -1, 0 }, new[] { 0, 0, 1 }, new[] { 0, 0, -1 } };
        static readonly int[][] Front = { new[] { 0, -1 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 1, 0 } }; // (x, z) by orientation

        static string GateOf(int id) => Rules.Block(id)?.Gate;
        static int[] FrontOf(int id) => Front[Rules.Block(id).O];
        static int Id(Dictionary<long, int> nodes, long k) => nodes.TryGetValue(k, out var v) ? v : -1;

        // does a neighbouring cell feed the gate at k? (cable, lever, plate or clock under power, or a gate turned toward it)
        bool HasInput(long k, int dx, int dz, Dictionary<long, int> nodes, HashSet<long> pw)
        {
            D(k, out var x, out var y, out var z);
            long nk = K(x + dx, y, z + dz);
            if (!nodes.TryGetValue(nk, out var nid)) return false;
            if (GateOf(nid) != null)
            {
                var f = FrontOf(nid);
                return GateOn.Contains(nk) && f[0] == -dx && f[1] == -dz;
            }
            return pw.Contains(nk) && (nid == 67 || nid == 65 || nid == 66 || nid == 111);
        }

        bool GateActive(long k, int id, Dictionary<long, int> nodes, HashSet<long> pw)
        {
            var f = FrontOf(id);
            int bx = -f[0], bz = -f[1], lx = f[1], lz = -f[0], rx = -f[1], rz = f[0];
            var g = GateOf(id);
            if (g == "and") return HasInput(k, lx, lz, nodes, pw) && HasInput(k, rx, rz, nodes, pw);
            if (g == "or") return HasInput(k, lx, lz, nodes, pw) || HasInput(k, rx, rz, nodes, pw) || HasInput(k, bx, bz, nodes, pw);
            return !HasInput(k, bx, bz, nodes, pw); // not
        }

        // every powered cable or gate cell reachable from one cell, plus the blocks at the ends (objectives only)
        static HashSet<long> PoweredReach(Dictionary<long, int> nodes, HashSet<long> pw, int sx, int sy, int sz)
        {
            var seen = new HashSet<long>();
            var q = new Queue<long>();
            void Visit(int x, int y, int z)
            {
                long k = K(x, y, z);
                if (!nodes.TryGetValue(k, out var id) || seen.Contains(k) || !pw.Contains(k)) return;
                seen.Add(k);
                if (id == 67 || GateOf(id) != null) q.Enqueue(k);
            }
            Visit(sx, sy, sz);
            for (int n = 0; q.Count > 0 && n < 2000; n++)
            {
                D(q.Dequeue(), out var x, out var y, out var z);
                foreach (var d in N6) Visit(x + d[0], y + d[1], z + d[2]);
            }
            return seen;
        }

        // the first time a lamp lights up fed by an active gate's own output
        bool GateLitLamp(Dictionary<long, int> nodes, HashSet<long> pw)
        {
            foreach (var kv in nodes)
                if (GateOf(kv.Value) != null && GateOn.Contains(kv.Key))
                {
                    D(kv.Key, out var x, out var y, out var z);
                    var f = FrontOf(kv.Value);
                    foreach (var rk in PoweredReach(nodes, pw, x + f[0], y, z + f[1])) if (Id(nodes, rk) == 68) return true;
                }
            return false;
        }

        // a door opened by an active AND whose two inputs each come from a pressure plate (not the same one)
        bool TwoKey(Dictionary<long, int> nodes, HashSet<long> pw)
        {
            foreach (var kv in nodes)
            {
                if (!(GateOf(kv.Value) == "and" && GateOn.Contains(kv.Key))) continue;
                D(kv.Key, out var x, out var y, out var z);
                var f = FrontOf(kv.Value);
                var lp = new HashSet<long>();
                var rp = new HashSet<long>();
                foreach (var rk in PoweredReach(nodes, pw, x + f[1], y, z - f[0])) if (Id(nodes, rk) == 66) lp.Add(rk);
                foreach (var rk in PoweredReach(nodes, pw, x - f[1], y, z + f[0])) if (Id(nodes, rk) == 66) rp.Add(rk);
                if (lp.Count == 0 || rp.Count == 0) continue;
                if (lp.Count == 1 && rp.Count == 1 && First(lp) == First(rp)) continue;
                foreach (var rk in PoweredReach(nodes, pw, x + f[0], y, z + f[1]))
                {
                    int rid = Id(nodes, rk);
                    if (rid >= 48 && rid <= 63) return true;
                }
            }
            return false;
        }
        static long First(HashSet<long> s) { foreach (var v in s) return v; return 0; }

        // every cell reachable from one cell along cable only, plus the first other cell at each end
        static HashSet<long> CableReach(Dictionary<long, int> nodes, int sx, int sy, int sz)
        {
            var seen = new HashSet<long>();
            var q = new Queue<long>();
            q.Enqueue(K(sx, sy, sz));
            for (int n = 0; q.Count > 0 && n < 2000; n++)
            {
                long k = q.Dequeue();
                if (seen.Contains(k)) continue;
                seen.Add(k);
                if (Id(nodes, k) != 67) continue;
                D(k, out var x, out var y, out var z);
                foreach (var d in N6) q.Enqueue(K(x + d[0], y + d[1], z + d[2]));
            }
            return seen;
        }

        // every NOT gate whose output, along cable only, loops back into its own back: their cable networks
        static List<HashSet<long>> OscillatorLoops(Dictionary<long, int> nodes)
        {
            var o = new List<HashSet<long>>();
            foreach (var kv in nodes)
            {
                if (GateOf(kv.Value) != "not") continue;
                D(kv.Key, out var x, out var y, out var z);
                var f = FrontOf(kv.Value);
                long back = K(x - f[0], y, z - f[1]);
                var net = CableReach(nodes, x + f[0], y, z + f[1]);
                if (net.Contains(back) && Id(nodes, back) == 67) o.Add(net);
            }
            return o;
        }

        // an OR with one input satisfying fed and another looped back from its own output, reaching a lamp
        static bool LatchFed(Dictionary<long, int> nodes, Func<HashSet<long>, bool> isFed)
        {
            foreach (var kv in nodes)
            {
                if (GateOf(kv.Value) != "or") continue;
                D(kv.Key, out var x, out var y, out var z);
                var f = FrontOf(kv.Value);
                long own = K(x + f[0], y, z + f[1]);
                bool fed = false, feedback = false;
                foreach (var d in new[] { new[] { -f[0], -f[1] }, new[] { f[1], -f[0] }, new[] { -f[1], f[0] } })
                {
                    var reach = CableReach(nodes, x + d[0], y, z + d[1]);
                    if (!fed && isFed(reach)) fed = true;
                    if (reach.Contains(own) && Id(nodes, own) == 67) feedback = true;
                }
                if (fed && feedback)
                    foreach (var rk in CableReach(nodes, x + f[0], y, z + f[1])) if (Id(nodes, rk) == 68) return true;
            }
            return false;
        }

        static bool IsLatch(Dictionary<long, int> nodes) => LatchFed(nodes, r => { foreach (var k in r) if (Id(nodes, k) == 66) return true; return false; });

        static bool IsCoinFlip(Dictionary<long, int> nodes)
        {
            var loops = OscillatorLoops(nodes);
            if (loops.Count == 0) return false;
            foreach (var kv in nodes)
            {
                if (GateOf(kv.Value) != "and") continue;
                D(kv.Key, out var x, out var y, out var z);
                var f = FrontOf(kv.Value);
                var s0 = CableReach(nodes, x + f[1], y, z - f[0]);
                var s1 = CableReach(nodes, x - f[1], y, z + f[0]);
                bool TapsLoop(HashSet<long> r) { foreach (var net in loops) foreach (var k in r) if (net.Contains(k) && Id(nodes, k) == 67) return true; return false; }
                bool HasPlate(HashSet<long> r) { foreach (var k in r) if (Id(nodes, k) == 66) return true; return false; }
                if (!((TapsLoop(s0) && HasPlate(s1)) || (TapsLoop(s1) && HasPlate(s0)))) continue;
                long own = K(x + f[0], y, z + f[1]);
                if (LatchFed(nodes, r => r.Contains(own))) return true;
            }
            return false;
        }

        // the current from the sources (levers, pressed plates, the clock, active gates) through the cables
        HashSet<long> Propagate(Dictionary<long, int> nodes, IList<double[]> feet, bool clockOn)
        {
            var pw = new HashSet<long>();
            var q = new Queue<long>();
            void Feed(int x, int y, int z)
            {
                long nk = K(x, y, z);
                if (pw.Contains(nk) || !nodes.TryGetValue(nk, out var nid)) return;
                if (nid == 67) { pw.Add(nk); q.Enqueue(nk); }
                else if (nid == 68) pw.Add(nk);
                else if (nid >= 48 && nid <= 63)
                {
                    pw.Add(nk);
                    pw.Add(K(x, y + (Rules.Block(nid).Top ? -1 : 1), z));
                }
            }
            foreach (var kv in nodes)
            {
                D(kv.Key, out var x, out var y, out var z);
                int id = kv.Value;
                bool src = id == 65 || (id == 111 && clockOn);
                if (id == 66)
                {
                    src = false;
                    foreach (var p in feet)
                        if ((int)Math.Floor(p[0]) == x && (int)Math.Floor(p[2]) == z && p[1] >= y - 0.2 && p[1] < y + 0.7) { src = true; break; }
                }
                if (src) { pw.Add(kv.Key); q.Enqueue(kv.Key); }
                else if (GateOf(id) != null && GateOn.Contains(kv.Key))
                {
                    pw.Add(kv.Key); // lit (texture)
                    var f = FrontOf(id);
                    Feed(x + f[0], y, z + f[1]);
                }
            }
            for (int n = 0; q.Count > 0 && n < 5000; n++)
            {
                D(q.Dequeue(), out var x, out var y, out var z);
                foreach (var d in N6) Feed(x + d[0], y + d[1], z + d[2]);
            }
            return pw;
        }

        /// <summary>One step (every 0.15 s on the web): nodes are the circuit blocks around the player,
        /// feet everyone's position (yours first). Returns the cells whose power changed.</summary>
        public List<long> Step(Dictionary<long, int> nodes, IList<double[]> feet, bool clockOn)
        {
            // gates depend on the current, which depends on them: again until stable (3 passes at most; an
            // oscillating loop, like a NOT gate wired to itself, then just beats on its own)
            var pw = Propagate(nodes, feet, clockOn);
            for (int pass = 0; pass < 3; pass++)
            {
                var on = new HashSet<long>();
                foreach (var kv in nodes) if (GateOf(kv.Value) != null && GateActive(kv.Key, kv.Value, nodes, pw)) on.Add(kv.Key);
                int had = 0;
                foreach (var k in GateOn) if (nodes.ContainsKey(k)) had++;
                bool same = on.Count == had;
                if (same) foreach (var k in on) if (!GateOn.Contains(k)) { same = false; break; }
                GateOn.RemoveWhere(nodes.ContainsKey);
                foreach (var k in on) GateOn.Add(k);
                if (same) break;
                pw = Propagate(nodes, feet, clockOn);
            }
            if (!GateLit && GateLitLamp(nodes, pw)) GateLit = true;
            if (!TwoKeyDoor && TwoKey(nodes, pw)) TwoKeyDoor = true;
            if (!Blinker && OscillatorLoops(nodes).Count > 0) Blinker = true;
            if (!Latch && IsLatch(nodes)) Latch = true;
            if (!CoinFlip && IsCoinFlip(nodes)) CoinFlip = true;
            var changed = new List<long>();
            foreach (var k in pw) if (!Powered.Contains(k)) changed.Add(k);
            foreach (var k in Powered) if (!pw.Contains(k) && nodes.ContainsKey(k)) changed.Add(k);
            DoorChanged = PlateChanged = false;
            foreach (var k in changed)
            {
                int id = Id(nodes, k);
                if (id >= 48 && id <= 63) DoorChanged = true;
                if (id == 66) PlateChanged = true;
                if (pw.Contains(k)) Powered.Add(k); else Powered.Remove(k);
            }
            return changed;
        }
    }
}
