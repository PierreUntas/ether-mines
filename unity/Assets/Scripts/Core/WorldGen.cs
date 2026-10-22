// Ether Mines · the world generator, ported block for block from supabase/functions/_shared/world.js
// (CoreTests/WorldParity.cs checks it against the JavaScript). This file: the JS number semantics, the
// noise, the terrain functions and where the structures stand. The chunk itself is built in
// WorldGenChunk.cs. Every arithmetic step uses doubles in the same order as the JS, so results are
// bit-identical; change nothing here without changing world.js (and bumping GEN) the same way.
using System;
using System.Collections.Concurrent;

namespace EtherMines.Core
{
    // a structure's position (ruinAt, gardenAt, towerAt, arenaAt): its center x, z and ground or floor y
    public class Site
    {
        public readonly int X, Z, Y;
        public Site(int x, int z, int y) { X = x; Z = z; Y = y; }
    }

    // mergeAt(): the disc's center (Y = MERGE_Y), the Beacon Stair's foot (Sx, Sz) and its ground G
    public class MergeSite : Site
    {
        public readonly int Sx, Sz, G;
        public MergeSite(int x, int z, int y, int sx, int sz, int g) : base(x, z, y) { Sx = sx; Sz = sz; G = g; }
    }

    // cityPlot(): the building type (T), its height H (null where the JS leaves it undefined), its center
    public class CityPlotInfo
    {
        public readonly string T;
        public readonly int? H;
        public readonly int Cx, Cz;
        public CityPlotInfo(string t, int? h, int cx, int cz) { T = t; H = h; Cx = cx; Cz = cz; }
    }

    public static partial class World
    {
        // ---------- JS number semantics ----------
        // ToInt32 (x | 0): truncation, then wrapping modulo 2^32 (not a saturating cast); NaN and infinities give 0
        public static int ToInt32(double d)
        {
            if (d >= -2147483648.0 && d <= 2147483647.0) return (int)d;
            if (double.IsNaN(d) || double.IsInfinity(d)) return 0;
            double m = Math.Truncate(d) % 4294967296.0;
            if (m < 0) m += 4294967296.0;
            return unchecked((int)(uint)m);
        }
        // Math.round: halves go toward +infinity (V8: round up, then step back if that overshot by more than .5)
        public static double JsRound(double x)
        {
            double r = Math.Ceiling(x);
            return r - 0.5 > x ? r - 1 : r;
        }
        static int Rnd(double x) => (int)JsRound(x);
        static int Fl(double x) => (int)Math.Floor(x);
        static int FloorDiv(int a, int b) => (int)Math.Floor((double)a / b);
        // Math.hypot as V8 computes it: scaled by the largest term, Kahan-compensated sum of squares
        public static double Hypot(double a, double b)
        {
            a = Math.Abs(a); b = Math.Abs(b);
            double max = a > b ? a : b;
            if (double.IsInfinity(max)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            if (max == 0) return 0;
            double sum = 0, comp = 0, n, summand, prelim;
            n = a / max; summand = n * n - comp; prelim = sum + summand; comp = prelim - sum - summand; sum = prelim;
            n = b / max; summand = n * n - comp; prelim = sum + summand; sum = prelim;
            return Math.Sqrt(sum) * max;
        }
        public static double Hypot(double a, double b, double c)
        {
            a = Math.Abs(a); b = Math.Abs(b); c = Math.Abs(c);
            double max = a > b ? a : b;
            if (c > max) max = c;
            if (double.IsInfinity(max)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b) || double.IsNaN(c)) return double.NaN;
            if (max == 0) return 0;
            double sum = 0, comp = 0, n, summand, prelim;
            n = a / max; summand = n * n - comp; prelim = sum + summand; comp = prelim - sum - summand; sum = prelim;
            n = b / max; summand = n * n - comp; prelim = sum + summand; comp = prelim - sum - summand; sum = prelim;
            n = c / max; summand = n * n - comp; prelim = sum + summand; sum = prelim;
            return Math.Sqrt(sum) * max;
        }

        public static double Clamp(double v, double a, double b) => Math.Max(a, Math.Min(b, v));
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
        public static double Sm(double t) => t * t * (3 - 2 * t);
        public static string CoordKey(int x, int y, int z) => x + "," + y + "," + z;

        // ---------- constants ----------
        // World seed: changing it gives completely different terrain (only together with a database reset)
        public static readonly int SEED = -126345076;
        public const int GEN = 27; // generator version (world.js GEN)
        public const int RUIN = 80;
        public const int TOWER = 96, TR = 10, TC = 15;
        public static readonly int[] TOWER_LADDER = { 7, -7 };
        public static readonly int[] TOWER_CHEST = { -6, -6 };
        public const int MERGE = 192, MERGE_Y = DY + 36, MERGE_R = 18;
        public const int ARENA = 224, ARENA_R = 17, ARENA_W = 27, ARENA_GATE = 38;

        public static class SPAWN
        {
            public const int X = 8, Z = 8;
            public static readonly int Y = HeightAt(X, Z) + 1;
        }
        public static class CITY
        {
            public const int X = SPAWN.X, Z = SPAWN.Z - 64, R = 34, Y = 30, STEP = 12;
        }
        public static class CIRCUITS
        {
            public const int X = SPAWN.X + 60, Z = SPAWN.Z + 90, Y = 33, R = 24;
        }

        // ---------- noise ----------
        public static double Hash(int x, int y, int s = 0)
        {
            unchecked
            {
                int h = x * 374761393 ^ y * 668265263 ^ (97 + s) * 1442695041 ^ SEED;
                h = (h ^ (int)((uint)h >> 13)) * 1274126177;
                h ^= (int)((uint)h >> 16);
                return (uint)h / 4294967296.0;
            }
        }
        public static double Hash(double x, double y, int s = 0) => Hash(ToInt32(x), ToInt32(y), s);
        public static double Hash3(double x, double y, double z, int s = 0) =>
            Hash(ToInt32(x + unchecked(ToInt32(z) * 19349663)), ToInt32(y), s);

        public static double Vn2(double x, double z, int s = 0)
        {
            double xi = Math.Floor(x), zi = Math.Floor(z), xf = Sm(x - xi), zf = Sm(z - zi);
            double a = Hash(xi, zi, s), b = Hash(xi + 1, zi, s), c = Hash(xi, zi + 1, s), d = Hash(xi + 1, zi + 1, s);
            return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
        }
        static double L3(double a, double b, double t) => a + (b - a) * t;
        public static double Vn3(double x, double y, double z, int s = 0)
        {
            double xi = Math.Floor(x), yi = Math.Floor(y), zi = Math.Floor(z), xf = Sm(x - xi), yf = Sm(y - yi), zf = Sm(z - zi);
            return L3(
                L3(L3(Hash3(xi, yi, zi, s), Hash3(xi + 1, yi, zi, s), xf), L3(Hash3(xi, yi + 1, zi, s), Hash3(xi + 1, yi + 1, zi, s), xf), yf),
                L3(L3(Hash3(xi, yi, zi + 1, s), Hash3(xi + 1, yi, zi + 1, s), xf), L3(Hash3(xi, yi + 1, zi + 1, s), Hash3(xi + 1, yi + 1, zi + 1, s), xf), yf),
                zf);
        }

        // ---------- zones ----------
        public static bool InCircuits(double x, double z, double margin = 0) => Hypot(x - CIRCUITS.X, z - CIRCUITS.Z) <= CIRCUITS.R + margin;
        public static bool InCity(double x, double z, double margin = 0) => Hypot(x - CITY.X, z - CITY.Z) <= CITY.R + margin;
        // the validators' path: paved walkway between the Atrium and the City
        public static bool OnPath(double x, double z, double margin = 1) =>
            Math.Abs(x - SPAWN.X) <= margin && z < SPAWN.Z - 7 && z > CITY.Z + CITY.R - 2;

        // the City's 7x7 plot grid (cityPlot(i, j), i and j from 0 to 6, the great hall at 3,3)
        static readonly CityPlotInfo[] PLOTS = BuildPlots();
        static CityPlotInfo[] BuildPlots()
        {
            var p = new CityPlotInfo[25]; // keys -2..2 on each axis
            void P(int i, int j, string t, int? h) => p[(i + 2) + (j + 2) * 5] = new CityPlotInfo(t, h, CITY.X + i * CITY.STEP, CITY.Z + j * CITY.STEP);
            P(0, 0, "large", 10);
            P(0, -1, "temple", 7);
            P(-1, -1, "library", 6);
            P(1, -1, "greenhouse", null);
            P(-1, 0, "rotunda", 6);
            P(1, 0, "stainedGlassHall", 9);
            P(1, 1, "stainedGlassHall", 6);
            P(-1, 1, "market", null);
            P(0, 1, "square", null);
            P(0, 2, "forecourt", null);
            P(0, -2, "square", null);
            P(2, 0, "garden", null);
            P(-2, 0, "garden", null);
            P(2, 1, "shelter", 4);
            return p;
        }
        public static CityPlotInfo CityPlot(int i, int j)
        {
            int a = i - 3, b = j - 3;
            if (a < -2 || a > 2 || b < -2 || b > 2) return null;
            return PLOTS[(a + 2) + (b + 2) * 5];
        }

        // ---------- terrain ----------
        public static double ContAt(double x, double z) => Vn2(x / 170 + 50, z / 170 - 40, 9) * 0.7 + Vn2(x / 60, z / 60, 10) * 0.3; // low = ocean
        public static int HeightAt(double x, double z)
        {
            double c = Vn2(x / 40, z / 40, 1) * 0.6 + Vn2(x / 17, z / 17, 2) * 0.3 + Vn2(x / 7, z / 7, 3) * 0.1;
            double m = Sm(Clamp((Vn2(x / 64 + 10, z / 64 + 10, 4) - 0.52) / 0.25, 0, 1));
            double d = Hypot(x - SPAWN.X, z - SPAWN.Z),
                flat = Sm(Clamp((d - 5) / 22, 0, 1)),
                oc = Sm(Clamp((0.4 - ContAt(x, z)) / 0.1, 0, 1));
            double land = DY + 12 + c * 14 + m * 18 * Vn2(x / 16, z / 16, 5),
                sea = DY + 5 + Vn2(x / 9, z / 9, 11) * 5;
            double dc = Hypot(x - CITY.X, z - CITY.Z),
                city = Sm(Clamp((dc - CITY.R) / 26, 0, 1));
            double dcc = Hypot(x - CIRCUITS.X, z - CIRCUITS.Z),
                circuits = Sm(Clamp((dcc - CIRCUITS.R) / 20, 0, 1));
            double natural = Lerp(DY + 20, Lerp(land, sea, oc), flat),
                withCircuits = Lerp(CIRCUITS.Y + 0.5, natural, circuits);
            return (int)Math.Floor(Lerp(CITY.Y + 0.5, withCircuits, city));
        }

        public const int PLAIN = 0, FOREST = 1, DUNES = 2;
        static readonly string[] BIOMES = { "plain", "forest", "dunes" };
        public static int BiomeId(double x, double z)
        {
            double b = Vn2(x / 50 + 30, z / 50 - 20, 6);
            return b < 0.42 ? PLAIN : b < 0.66 ? FOREST : DUNES;
        }
        public static string Biome(double x, double z) => BIOMES[BiomeId(x, z)];
        public static int TopAt(int h, int bi) => h <= SEA + 1 ? 4 : bi == DUNES ? 4 : h >= DY + 36 ? 16 : h >= DY + 31 ? 3 : 1;
        public static int TopAt(int h, string bi) => TopAt(h, bi == "dunes" ? DUNES : bi == "forest" ? FOREST : PLAIN);

        // floating islands: rock clouds between DY+31 and DY+45, far from the sanctuary, never above the mountains
        public static bool IslandZone(double x, double z) =>
            Vn2(x / 90 + 7, z / 90 - 3, 14) > 0.56 &&
            Hypot(x - SPAWN.X, z - SPAWN.Z) > 36 &&
            HeightAt(x, z) < DY + 29 &&
            ContAt(x, z) > 0.42 &&
            !InCity(x, z, 14);
        public static bool IsIsland(double x, double y, double z)
        {
            if (y < DY + 31 || y > DY + 45) return false;
            double band = 1 - Math.Abs(y - DY - 38) / 7;
            return (Vn3(x / 26, y / 9, z / 26, 12) * 0.75 + Vn3(x / 9, y / 5, z / 9, 13) * 0.25) * Sm(Clamp(band * 1.6, 0, 1)) > 0.47;
        }
        public static int IslandTop(double x, double z)
        {
            if (!IslandZone(x, z)) return -1;
            for (int y = DY + 45; y >= DY + 31; y--) if (IsIsland(x, y, z)) return y;
            return -1;
        }

        // ---------- structures (pure functions of their region: memoized, thread-safe) ----------
        static long RKey(int i, int j) => ((long)i << 32) ^ (uint)j;
        static readonly ConcurrentDictionary<long, Site> ruinCache = new ConcurrentDictionary<long, Site>(),
            gardenCache = new ConcurrentDictionary<long, Site>(),
            towerCache = new ConcurrentDictionary<long, Site>(),
            arenaCache = new ConcurrentDictionary<long, Site>();
        static readonly ConcurrentDictionary<long, MergeSite> mergeCache = new ConcurrentDictionary<long, MergeSite>();
        const int CACHE_MAX = 1 << 16;
        static T Memo<T>(ConcurrentDictionary<long, T> cache, int i, int j, Func<int, int, T> f) where T : class
        {
            long k = RKey(i, j);
            if (cache.TryGetValue(k, out var v)) return v;
            v = f(i, j);
            if (cache.Count >= CACHE_MAX) cache.Clear();
            cache[k] = v;
            return v;
        }
        static readonly Func<int, int, Site> ruinF = RuinCompute, gardenF = GardenCompute, towerF = TowerCompute, arenaF = ArenaCompute;
        static readonly Func<int, int, MergeSite> mergeF = MergeCompute;

        // position of a region's ruin (or null: ocean, peak); the sanctuary's region has one within sight
        public static Site RuinAt(int rx, int rz) => Memo(ruinCache, rx, rz, ruinF);
        static Site RuinCompute(int rx, int rz)
        {
            bool notOrigin = rx != 0 || rz != 0;
            for (int k = 0; k < 4; k++)
            {
                int x, z;
                if (rx == 0 && rz == 0 && k == 0)
                {
                    x = SPAWN.X + 38;
                    z = SPAWN.Z - 22;
                }
                else
                {
                    x = rx * RUIN + 10 + Fl(Hash(rx, rz, 120 + k) * 60);
                    z = rz * RUIN + 10 + Fl(Hash(rz, rx, 130 + k) * 60);
                }
                if (InCity(x, z, 12) ||
                    Hypot(x - SPAWN.X, z - SPAWN.Z) < (notOrigin ? 50 : 20) ||
                    (notOrigin && Hypot(x - SPAWN.X - 38, z - SPAWN.Z + 22) < 40))
                    continue;
                int lo = 99, hi = 0;
                for (int dx = -2; dx <= 2; dx += 2)
                    for (int dz = -2; dz <= 2; dz += 2)
                    {
                        int h = HeightAt(x + dx, z + dz);
                        lo = Math.Min(lo, h);
                        hi = Math.Max(hi, h);
                    }
                if (lo <= SEA + 1 || hi > 34 + DY || hi - lo > 4) continue;
                return new Site(x, z, HeightAt(x, z));
            }
            return null;
        }

        static readonly int[] CROSS5 = { -4, -4, 4, -4, -4, 4, 4, 4, 0, 0 };

        // garden of a 64x64 region (or null): on reasonably flat grassy ground, far from the sanctuary and the ruins
        public static Site GardenAt(int gx, int gz) => Memo(gardenCache, gx, gz, gardenF);
        static Site GardenCompute(int gx, int gz)
        {
            if (Hash(gx * 3 + 1, gz * 5 + 2, 155) > 0.45) return null;
            int x = gx * 64 + 12 + Fl(Hash(gx, gz, 156) * 40),
                z = gz * 64 + 12 + Fl(Hash(gx, gz, 157) * 40),
                y = HeightAt(x, z);
            if (Hypot(x - SPAWN.X, z - SPAWN.Z) < 40 || y <= SEA + 1 || y >= DY + 31 || BiomeId(x, z) == DUNES) return null;
            for (int i = 0; i < 10; i += 2)
                if (Math.Abs(HeightAt(x + CROSS5[i], z + CROSS5[i + 1]) - y) > 2) return null;
            var rg = RuinAt(FloorDiv(x, RUIN), FloorDiv(z, RUIN));
            if (rg != null && Hypot(rg.X - x, rg.Z - z) < 14) return null;
            if (IslandZone(x, z) || InCity(x, z, 16)) return null;
            // clear of the towers (GEN 27: they grew to 21x21, and a garden drawn over one would cut into it)
            for (int tz = FloorDiv(z - 24, TOWER); tz <= FloorDiv(z + 24, TOWER); tz++)
                for (int tx = FloorDiv(x - 24, TOWER); tx <= FloorDiv(x + 24, TOWER); tx++)
                {
                    var t = TowerAt(tx, tz);
                    if (t != null && Hypot(t.X - x, t.Z - z) < TR + 10) return null;
                }
            return new Site(x, z, y);
        }

        // tower of a 96x96 region (or null): guarded by hostile mobs, a boss at the top
        public static Site TowerAt(int tx, int tz) => Memo(towerCache, tx, tz, towerF);
        static Site TowerCompute(int tx, int tz)
        {
            if (Hash(tx * 7 + 3, tz * 11 + 5, 270) > 0.4) return null;
            int x = tx * TOWER + 20 + Fl(Hash(tx, tz, 271) * (TOWER - 40)),
                z = tz * TOWER + 20 + Fl(Hash(tx, tz, 272) * (TOWER - 40)),
                y = HeightAt(x, z);
            if (Hypot(x - SPAWN.X, z - SPAWN.Z) < 70 || y <= SEA + 1 || y >= DY + 40) return null;
            for (int i = 0; i < 10; i += 2)
                if (Math.Abs(HeightAt(x + CROSS5[i], z + CROSS5[i + 1]) - y) > 5) return null;
            var rg = RuinAt(FloorDiv(x, RUIN), FloorDiv(z, RUIN));
            if (rg != null && Hypot(rg.X - x, rg.Z - z) < 20) return null;
            for (int rz = FloorDiv(z - 40, RUIN); rz <= FloorDiv(z + 40, RUIN); rz++)
                for (int rx = FloorDiv(x - 40, RUIN); rx <= FloorDiv(x + 40, RUIN); rx++)
                {
                    var r = RuinAt(rx, rz);
                    if (r == null) continue;
                    int ax = Math.Abs(r.X - x), dz = r.Z - z;
                    if ((ax <= TR + 4 && Math.Abs(dz) <= TR + 4) || (ax <= 4 && dz <= 3 - TR && dz >= -TR - 11)) return null;
                }
            if (IslandZone(x, z) || InCity(x, z, 20) || InCircuits(x, z, 20)) return null;
            return new Site(x, z, y);
        }

        // the Merge Sanctum (one per 192x192 region, or none): a floating arena in the sky
        public static MergeSite MergeAt(int mx, int mz) => Memo(mergeCache, mx, mz, mergeF);
        static MergeSite MergeCompute(int mx, int mz)
        {
            if (Hash(mx * 13 + 5, mz * 17 + 9, 300) > 0.8) return null;
            int x = mx * MERGE + 40 + Fl(Hash(mx, mz, 301) * (MERGE - 80)),
                z = mz * MERGE + 40 + Fl(Hash(mx, mz, 302) * (MERGE - 80));
            if (Hypot(x - SPAWN.X, z - SPAWN.Z) < 110 || HeightAt(x, z) > MERGE_Y - 8) return null;
            if (InCity(x, z, 40) || InCircuits(x, z, 40)) return null;
            for (int tz = FloorDiv(z - 40, TOWER); tz <= FloorDiv(z + 40, TOWER); tz++)
                for (int tx = FloorDiv(x - 40, TOWER); tx <= FloorDiv(x + 40, TOWER); tx++)
                {
                    var t = TowerAt(tx, tz);
                    if (t != null && Hypot(t.X - x, t.Z - z) < 34) return null;
                }
            int sx = x, sz = z + MERGE_R + 5, g = HeightAt(sx, sz);
            if (g >= MERGE_Y - 3) return null;
            for (int tz = FloorDiv(sz - 24, TOWER); tz <= FloorDiv(sz + 24, TOWER); tz++)
                for (int tx = FloorDiv(sx - 24, TOWER); tx <= FloorDiv(sx + 24, TOWER); tx++)
                {
                    var t = TowerAt(tx, tz);
                    if (t != null && Hypot(t.X - sx, t.Z - sz) < TR + 8) return null;
                }
            return new MergeSite(x, z, MERGE_Y, sx, sz, Math.Max(g, SEA));
        }

        // the Mempool (one per 224x224 region, or none): a few spots are tried, the first fairly level one wins
        public static Site ArenaAt(int ax, int az) => Memo(arenaCache, ax, az, arenaF);
        static Site ArenaCompute(int ax, int az)
        {
            if (Hash(ax * 19 + 7, az * 23 + 3, 320) > 0.8) return null;
            for (int k = 0; k < 6; k++)
            {
                var a = ArenaTry(ax, az, k);
                if (a != null) return a;
            }
            return null;
        }
        static Site ArenaTry(int ax, int az, int k)
        {
            int x = ax * ARENA + 50 + Fl(Hash(ax + k * 31, az, 321) * (ARENA - 100)),
                z = az * ARENA + 50 + Fl(Hash(ax, az + k * 37, 322) * (ARENA - 100)),
                y = HeightAt(x, z);
            if (Hypot(x - SPAWN.X, z - SPAWN.Z) < 100 || y <= SEA + 1 || y > DY + 28) return null;
            for (int i = 0; i < 16; i++)
            {
                double an = (i * Math.PI) / 8;
                int h = HeightAt(x + Rnd(Math.Cos(an) * ARENA_W), z + Rnd(Math.Sin(an) * ARENA_W));
                if (h < SEA - 2 || Math.Abs(h - y) > 9) return null;
            }
            if (InCity(x, z, 50) || InCircuits(x, z, 50)) return null;
            if (Near(x, z, TOWER, 0, ARENA_GATE + 10) || Near(x, z, MERGE, 1, ARENA_GATE + 16)) return null;
            if (Near(x, z, RUIN, 2, ARENA_GATE + 4) || Near(x, z, 64, 3, ARENA_GATE + 4)) return null;
            return new Site(x, z, y);
        }
        // arenaTry's near(): is a structure of the kind (0 tower, 1 merge, 2 ruin, 3 garden) within d of (x, z)
        static bool Near(int x, int z, int R, int kind, int d)
        {
            for (int j = FloorDiv(z - d, R); j <= FloorDiv(z + d, R); j++)
                for (int i = FloorDiv(x - d, R); i <= FloorDiv(x + d, R); i++)
                {
                    Site s = kind == 0 ? TowerAt(i, j) : kind == 1 ? MergeAt(i, j) : kind == 2 ? RuinAt(i, j) : GardenAt(i, j);
                    if (s != null && Hypot(s.X - x, s.Z - z) < d) return true;
                    if (s is MergeSite ms && Hypot(ms.Sx - x, ms.Sz - z) < d) return true; // the Merge's stair foot
                }
            return false;
        }
    }
}
