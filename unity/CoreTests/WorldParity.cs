// The world generator (Assets/Scripts/Core/WorldGen*.cs) against world.js, from golden/world-*.{bin,json}
// written by `node golden.mjs`: every chunk byte for byte, plus the terrain functions and the structures'
// positions over index grids, so a mismatch can be localized.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class WorldParity
    {
        sealed class Tally
        {
            public int N, Bad;
            public readonly List<string> First = new List<string>();
            public void Add(bool ok, Func<string> what)
            {
                N++;
                if (ok) return;
                Bad++;
                if (First.Count < 6) First.Add(what());
            }
            public void Report(string name)
            {
                Program.Check(Bad == 0, $"world: {name} ({N - Bad}/{N} match)");
                foreach (var s in First) Console.WriteLine("    " + s);
            }
        }

        static string Fmt(Site s) => s == null ? "null" : s is MergeSite m ? $"[{m.X},{m.Z},{m.Y},{m.Sx},{m.Sz},{m.G}]" : $"[{s.X},{s.Z},{s.Y}]";
        static string FmtJ(JsonElement e) => e.ValueKind == JsonValueKind.Null ? "null" : e.GetRawText();
        static bool SiteEq(Site s, JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Null) return s == null;
            if (s == null) return false;
            if (e[0].GetInt32() != s.X || e[1].GetInt32() != s.Z || e[2].GetInt32() != s.Y) return false;
            if (e.GetArrayLength() > 3)
            {
                var m = s as MergeSite;
                return m != null && e[3].GetInt32() == m.Sx && e[4].GetInt32() == m.Sz && e[5].GetInt32() == m.G;
            }
            return true;
        }
        static bool B(JsonElement e) => e.GetInt32() != 0;

        public static void Run()
        {
            var dir = Path.Combine(Directory.GetCurrentDirectory(), "golden");
            var fnPath = Path.Combine(dir, "world-fn.json");
            var chPath = Path.Combine(dir, "world-chunks.bin");
            if (!File.Exists(fnPath) || !File.Exists(chPath))
            {
                Program.Check(false, "world: golden files missing (run `node golden.mjs` in unity/CoreTests)");
                return;
            }
            using var doc = JsonDocument.Parse(File.ReadAllBytes(fnPath));
            var root = doc.RootElement;

            // constants
            var c = root.GetProperty("consts");
            var sp = c.GetProperty("SPAWN");
            Program.Check(c.GetProperty("GEN").GetInt32() == World.GEN && c.GetProperty("SEED").GetInt32() == World.SEED && c.GetProperty("SEA").GetInt32() == World.SEA
                && sp[0].GetInt32() == World.SPAWN.X && sp[1].GetInt32() == World.SPAWN.Z && sp[2].GetInt32() == World.SPAWN.Y,
                $"world: constants (GEN {World.GEN}, SEED {World.SEED}, SPAWN {World.SPAWN.X},{World.SPAWN.Z},{World.SPAWN.Y})");

            // noise
            var t = new Tally();
            foreach (var e in root.GetProperty("hash").EnumerateArray())
            {
                double x = e[0].GetDouble(), y = e[1].GetDouble(), want = e[3].GetDouble();
                int s = e[2].GetInt32();
                double got = World.Hash(x, y, s);
                t.Add(got == want, () => $"hash({x},{y},{s}) = {got:R}, JS {want:R}");
            }
            t.Report("hash");
            t = new Tally();
            foreach (var e in root.GetProperty("hash3").EnumerateArray())
            {
                double x = e[0].GetDouble(), y = e[1].GetDouble(), z = e[2].GetDouble(), want = e[4].GetDouble();
                int s = e[3].GetInt32();
                double got = World.Hash3(x, y, z, s);
                t.Add(got == want, () => $"hash3({x},{y},{z},{s}) = {got:R}, JS {want:R}");
            }
            t.Report("hash3");
            t = new Tally();
            foreach (var e in root.GetProperty("vn2").EnumerateArray())
            {
                double x = e[0].GetDouble(), z = e[1].GetDouble(), want = e[3].GetDouble();
                int s = e[2].GetInt32();
                double got = World.Vn2(x, z, s);
                t.Add(got == want, () => $"vn2({x:R},{z:R},{s}) = {got:R}, JS {want:R}");
            }
            t.Report("vn2");
            t = new Tally();
            foreach (var e in root.GetProperty("vn3").EnumerateArray())
            {
                double x = e[0].GetDouble(), y = e[1].GetDouble(), z = e[2].GetDouble(), want = e[4].GetDouble();
                int s = e[3].GetInt32();
                double got = World.Vn3(x, y, z, s);
                t.Add(got == want, () => $"vn3({x:R},{y:R},{z:R},{s}) = {got:R}, JS {want:R}");
            }
            t.Report("vn3");

            // terrain functions at sample points
            Tally th = new Tally(), tb = new Tally(), tc = new Tally(), tz = new Tally(), tt = new Tally(), tzone = new Tally();
            foreach (var e in root.GetProperty("pts").EnumerateArray())
            {
                double x = e[0].GetDouble(), z = e[1].GetDouble();
                int h = World.HeightAt(x, z);
                th.Add(h == e[2].GetInt32(), () => $"heightAt({x:R},{z:R}) = {h}, JS {e[2]}");
                string bi = World.Biome(x, z);
                tb.Add(bi == e[3].GetString(), () => $"biome({x:R},{z:R}) = {bi}, JS {e[3]}");
                double ca = World.ContAt(x, z);
                tc.Add(ca == e[4].GetDouble(), () => $"contAt({x:R},{z:R}) = {ca:R}, JS {e[4]}");
                bool iz = World.IslandZone(x, z);
                tz.Add(iz == B(e[5]), () => $"islandZone({x:R},{z:R}) = {iz}, JS {e[5]}");
                int it = World.IslandTop(x, z);
                tt.Add(it == e[6].GetInt32(), () => $"islandTop({x:R},{z:R}) = {it}, JS {e[6]}");
                bool ic = World.InCity(x, z), ici = World.InCircuits(x, z, 3), op = World.OnPath(x, z);
                tzone.Add(ic == B(e[7]) && ici == B(e[8]) && op == B(e[9]), () => $"inCity/inCircuits/onPath({x:R},{z:R}) = {ic}/{ici}/{op}, JS {e[7]}/{e[8]}/{e[9]}");
            }
            th.Report("heightAt");
            tb.Report("biome");
            tc.Report("contAt");
            tz.Report("islandZone");
            tt.Report("islandTop");
            tzone.Report("inCity, inCircuits, onPath");
            t = new Tally();
            foreach (var e in root.GetProperty("isIsland").EnumerateArray())
            {
                int x = e[0].GetInt32(), y = e[1].GetInt32(), z = e[2].GetInt32();
                bool got = World.IsIsland(x, y, z);
                t.Add(got == B(e[3]), () => $"isIsland({x},{y},{z}) = {got}, JS {e[3]}");
            }
            t.Report("isIsland");
            t = new Tally();
            foreach (var e in root.GetProperty("topAt").EnumerateArray())
            {
                int h = e[0].GetInt32();
                string bi = e[1].GetString();
                int got = World.TopAt(h, bi);
                t.Add(got == e[2].GetInt32(), () => $"topAt({h},{bi}) = {got}, JS {e[2]}");
            }
            t.Report("topAt");

            // structures over index grids
            void Grid(string name, Func<int, int, Site> f)
            {
                var g = new Tally();
                int found = 0;
                foreach (var e in root.GetProperty(name).EnumerateArray())
                {
                    int i = e[0].GetInt32(), j = e[1].GetInt32();
                    var s = f(i, j);
                    if (s != null) found++;
                    g.Add(SiteEq(s, e[2]), () => $"{name}At({i},{j}) = {Fmt(s)}, JS {FmtJ(e[2])}");
                }
                g.Report($"{name}At ({found} present)");
            }
            Grid("ruin", World.RuinAt);
            Grid("garden", World.GardenAt);
            Grid("tower", World.TowerAt);
            Grid("merge", (i, j) => World.MergeAt(i, j));
            Grid("arena", World.ArenaAt);
            t = new Tally();
            foreach (var e in root.GetProperty("cityPlot").EnumerateArray())
            {
                int i = e[0].GetInt32(), j = e[1].GetInt32();
                var p = World.CityPlot(i, j);
                var w = e[2];
                bool ok = w.ValueKind == JsonValueKind.Null ? p == null
                    : p != null && p.T == w[0].GetString() && (w[1].ValueKind == JsonValueKind.Null ? p.H == null : p.H == w[1].GetInt32())
                      && p.Cx == w[2].GetInt32() && p.Cz == w[3].GetInt32();
                t.Add(ok, () => $"cityPlot({i},{j}) = {(p == null ? "null" : $"{p.T} {p.H} {p.Cx},{p.Cz}")}, JS {FmtJ(w)}");
            }
            t.Report("cityPlot");

            // chunks, byte for byte (timed: each chunk generated once, structure caches warm up as they go)
            var bin = File.ReadAllBytes(chPath);
            int n = BitConverter.ToInt32(bin, 0), off = 4, badChunks = 0, badBytes = 0;
            var firsts = new List<string>();
            var sw = new Stopwatch();
            for (int k = 0; k < n; k++)
            {
                int cx = BitConverter.ToInt32(bin, off), cz = BitConverter.ToInt32(bin, off + 4);
                off += 8;
                sw.Start();
                var a = World.GenChunk(cx, cz);
                sw.Stop();
                int diff = 0;
                for (int i = 0; i < World.CV; i++)
                    if (a[i] != bin[off + i])
                    {
                        if (diff == 0 && firsts.Count < 8)
                        {
                            int lx = i % World.CH, lz = (i / World.CH) % World.CH, y = i / (World.CH * World.CH);
                            firsts.Add($"chunk {cx},{cz}: first diff at x {cx * World.CH + lx}, y {y}, z {cz * World.CH + lz}: C# {a[i]}, JS {bin[off + i]}");
                        }
                        diff++;
                    }
                if (diff > 0)
                {
                    badChunks++;
                    badBytes += diff;
                }
                off += World.CV;
            }
            Program.Check(badChunks == 0, $"world: genChunk byte for byte ({n - badChunks}/{n} chunks match, {badBytes} bytes differ)");
            foreach (var s in firsts) Console.WriteLine("    " + s);
            Console.WriteLine($"    C# genChunk: {sw.Elapsed.TotalMilliseconds / n:F2} ms/chunk over {n} chunks (cold structure caches)");

            // the chunk codec on generated chunks
            t = new Tally();
            foreach (var e in root.GetProperty("encode").EnumerateArray())
            {
                int cx = e[0].GetInt32(), cz = e[1].GetInt32();
                string want = e[2].GetString(), got = World.EncodeChunk(World.GenChunk(cx, cz));
                t.Add(got == want, () => $"encodeChunk(genChunk({cx},{cz})) differs (length {got.Length} vs JS {want.Length})");
            }
            t.Report("encodeChunk(genChunk)");

            // timing, warm: a fresh 20x20 area far from anything generated so far, then the same area again
            sw.Restart();
            for (int cz = 0; cz < 20; cz++) for (int cx = 0; cx < 20; cx++) World.GenChunk(5000 + cx, -5000 + cz);
            double cold = sw.Elapsed.TotalMilliseconds / 400;
            sw.Restart();
            for (int cz = 0; cz < 20; cz++) for (int cx = 0; cx < 20; cx++) World.GenChunk(5000 + cx, -5000 + cz);
            double warm = sw.Elapsed.TotalMilliseconds / 400;
            Console.WriteLine($"    C# genChunk, contiguous 20x20 area: {cold:F2} ms/chunk first pass, {warm:F2} ms/chunk with structure caches warm");
        }
    }
}
