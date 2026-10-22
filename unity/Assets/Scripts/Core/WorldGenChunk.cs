// Ether Mines · genChunk() from supabase/functions/_shared/world.js, ported block for block: the terrain,
// caves and ores, then the decor, ruins, towers, the Merge Sanctum, the Mempool, the City, the Circuits
// Complex, the validators' path, the City's palm trees, the Ether gardens and the Atrium, in that order
// (later passes overwrite earlier ones, exactly as in the JS). See WorldGen.cs for the number semantics.
using System;

namespace EtherMines.Core
{
    public static partial class World
    {
        // the Circuits Complex's five rooms: center (local to CIRCUITS), half width, height, door wall
        static readonly int[] CR_CX = { -5, 5, -5, 5, 0 }, CR_CZ = { -12, -12, 0, 0, 14 }, CR_R = { 3, 3, 3, 3, 5 }, CR_H = { 4, 4, 4, 4, 5 };
        static readonly char[] CR_DOOR = { 'e', 'w', 'e', 'w', 'n' };

        static bool CircuitsDoorCell(int room, int dx, int dz)
        {
            char d = CR_DOOR[room];
            int R = CR_R[room];
            return d == 'e' ? dx == R && dz == 0 : d == 'w' ? dx == -R && dz == 0 : d == 'n' ? dz == -R && dx == 0 : dz == R && dx == 0;
        }
        static bool K5(int dx, int dz) => (dx == 0 || dz == 0) && Math.Abs(dx) + Math.Abs(dz) == 5; // middle of a hall facade

        static readonly int[] DIRS4 = { 1, 0, -1, 0, 0, 1, 0, -1 };
        static readonly int[] DIAG4 = { 1, 1, -1, 1, 1, -1, -1, -1 };
        static readonly int[] PATH4 = { -1, 0, 1, 0, 0, -1, 0, 1 };
        static readonly int[] RUIN_CORNERS = { -2, -2, 2, -2, -2, 2, 2, 2 };
        static readonly int[] BOULDER = { 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 2 }; // dx, dz, dy (p below)
        static readonly double[] BOULDER_P = { 1, 0.6, 0.5, 0.4 };
        static readonly int[] TOWER_FLOORS = { 7, 13, 19, 24 };
        static readonly int[] LANTERN_K = { 6, 12, 18 };
        static readonly int[] LANTERNS = { -5, -5, 5, 5, -5, 5 };
        static readonly int[] BEACONS =
        {
            TR, TC - TR, TR, TR - TC, -TR, TC - TR, -TR, TR - TC,
            TC - TR, TR, TR - TC, TR, TC - TR, -TR, TR - TC, -TR,
        };
        static readonly int[] SEATS = { 22, 23, 21, 24 }; // north, east, south, west
        static readonly int[] GATE_DIRS = { 1, 0, -1, 0, 0, 1, 0, -1 };
        static readonly int[] PENDING_COLS = { 29, 30, 31, 32 };
        static readonly int[] MARKET_ITEMS = { 83, 14, 75, 126 };
        static readonly int[] PALM_SG = { 0, 0 }, PALM_SQ = { -4, -4, 4, -4, -4, 4, 4, 4 }, PALM_GD = { -2, -2, 2, 2 }, PALM_NONE = { };
        static readonly int[] ATRIUM_PALMS = { -4, -2, 4, -2, -4, 2, 4, 2 };
        static readonly int[] FORGE_DZ = { 0, 1, -1 };

        public static byte[] GenChunk(int cx, int cz) => new ChunkGen(cx, cz).Run();

        sealed class ChunkGen
        {
            readonly byte[] a = new byte[CV];
            readonly int x0, z0;
            public ChunkGen(int cx, int cz) { x0 = cx * CH; z0 = cz * CH; }

            void Put(int x, int y, int z, int id, bool onlyAir = false)
            {
                int lx = x - x0, lz = z - z0;
                if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || y < 0 || y >= SY) return;
                int i = Li(lx, y, lz);
                if (onlyAir && a[i] != 0) return;
                a[i] = (byte)id;
            }
            int At(int x, int y, int z)
            {
                int lx = x - x0, lz = z - z0;
                if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || y < 0 || y >= SY) return -1;
                return a[Li(lx, y, lz)];
            }
            // a typed array: writes out of range are dropped, reads out of range give undefined (0 here)
            void Set(int i, int id) { if (i >= 0 && i < CV) a[i] = (byte)id; }
            int Get(int i) => i >= 0 && i < CV ? a[i] : 0;

            // palm tree trunk at (x, z) standing on ground h; its fronds fit within the decor's 3-column margin
            void PalmTree(int x, int h, int z, int height)
            {
                int th = height != 0 ? height : 5 + Fl(Hash(x, z, 141) * 3);
                for (int k = 1; k <= th; k++) Put(x, h + k, z, 124);
                int t = h + th;
                Put(x, t + 1, z, 125, true);
                for (int i = 0; i < 8; i += 2)
                {
                    int dx = DIRS4[i], dz = DIRS4[i + 1];
                    Put(x + dx, t + 1, z + dz, 125, true);
                    Put(x + dx * 2, t, z + dz * 2, 125, true);
                    Put(x + dx * 3, t - 1, z + dz * 3, 125, true);
                }
                for (int i = 0; i < 8; i += 2)
                {
                    int dx = DIAG4[i], dz = DIAG4[i + 1];
                    Put(x + dx, t, z + dz, 125, true);
                    Put(x + dx * 2, t - 1, z + dz * 2, 125, true);
                }
            }

            public byte[] Run()
            {
                Terrain();
                Decor();
                IslandDecor();
                Ruins();
                Towers();
                Merges();
                Arenas();
                City();
                Circuits();
                Path();
                CityPalms();
                Gardens();
                Atrium();
                return a;
            }

            void Terrain()
            {
                for (int lz = 0; lz < CH; lz++)
                    for (int lx = 0; lx < CH; lx++)
                    {
                        int x = x0 + lx, z = z0 + lz, h = HeightAt(x, z), bi = BiomeId(x, z);
                        for (int y = 0; y < SY; y++)
                        {
                            int id = 0;
                            if (y == 0) id = 12;
                            else if (y < h - 3) id = 3;
                            else if (y < h) id = bi == DUNES || h <= SEA + 1 ? 4 : 2;
                            else if (y == h) id = TopAt(h, bi);
                            else if (y <= SEA) id = 11;
                            if (id == 3 && y > 1 && y < h - 4 && Vn3(x / 11.0, y / 7.0, z / 11.0, 7) > 0.7) id = 0;
                            if (id == 3 && y > 1 && y < DEEP - 1 && Vn3(x / 18.0, y / 6.0, z / 18.0, 15) > 0.66) id = 0; // large deep caves
                            if (id == 3 && Vn3(x / 3.2, y / 3.2, z / 3.2, 8) > 0.8 - Math.Min(0.1, (h - y) * 0.004)) id = 8;
                            if (id == 3 && y < DEEP && Vn3(x / 2.4, y / 2.4, z / 2.4, 16) > 0.885) id = 69; // pure ether geodes
                            if (id == 3 && (y <= 2 || (y <= 4 && Vn3(x / 5.0, y / 3.0, z / 5.0, 17) > 0.5))) id = 72; // genesis rock
                            if (id != 0) a[Li(lx, y, lz)] = (byte)id;
                        }
                        // ether mushrooms on cave floors (a single column: nothing spills into the neighboring chunk)
                        for (int y = 2; y < h - 4; y++)
                        {
                            int i = Li(lx, y, lz), sol = a[Li(lx, y - 1, lz)];
                            if (a[i] != 0 || !(sol == 3 || sol == 8 || sol == 72)) continue;
                            double r = Hash(x * 7 + y, z, 130);
                            if (r < (y < DEEP ? 0.04 : 0.015)) a[i] = 75;
                            else if (y < DEEP && r < 0.055) a[i] = 126; // amethyst cluster, only in the depths
                        }
                        if (h >= SEA && h <= SEA + 2 && !IslandZone(x, z))
                        {
                            // reeds on the banks: a neighboring column is underwater
                            bool rive = Math.Min(Math.Min(HeightAt(x + 1, z), HeightAt(x - 1, z)), Math.Min(HeightAt(x, z + 1), HeightAt(x, z - 1))) < SEA;
                            if (rive && Hash(x, z, 131) < 0.3) Set(Li(lx, h + 1, lz), 76);
                        }
                        else if (h < SEA && h >= SEA - 4 && Hash(x, z, 132) < 0.035 && Get(Li(lx, SEA + 1, lz)) == 0) Set(Li(lx, SEA + 1, lz), 77); // lily pads
                        if (IslandZone(x, z))
                        {
                            int depth = 0;
                            for (int y = DY + 45; y >= DY + 31; y--)
                            {
                                if (IsIsland(x, y, z))
                                {
                                    depth++;
                                    int id = depth == 1 ? 1 : depth <= 3 ? 2 : 3;
                                    if (id == 3 && Hash(x * 3 + y, z, 17) < 0.07) id = 8;
                                    a[Li(lx, y, lz)] = (byte)id;
                                }
                                else depth = 0;
                            }
                        }
                    }
            }

            // decor: roots taken from a 3-column margin, so a tree straddling two chunks looks identical from both sides
            void Decor()
            {
                for (int z = z0 - 3; z < z0 + CH + 3; z++)
                    for (int x = x0 - 3; x < x0 + CH + 3; x++)
                    {
                        int h = HeightAt(x, z), bi = BiomeId(x, z);
                        if (Hypot(x - SPAWN.X, z - SPAWN.Z) < 16 || InCity(x, z, 4) || OnPath(x, z, 3)) continue;
                        int top = TopAt(h, bi);
                        // palm trees on beaches and in the dunes
                        if (top == 4 && h > SEA && h < DY + 31 && Hash(x, z, 140) < (bi == DUNES ? 0.006 : 0.014))
                        {
                            PalmTree(x, h, z, 0);
                            continue;
                        }
                        if (top != 1) continue;
                        double r = Hash(x, z, 40);
                        if (bi == FOREST && r < 0.004)
                        {
                            int t = 2 + Fl(Hash(x, z, 41) * 3);
                            for (int k = 1; k <= t; k++) Put(x, h + k, z, 8);
                            continue;
                        }
                        if (bi != FOREST && r < 0.01 && Hash(x, z, 150) < 0.55)
                        {
                            // cypress: thin and tall, like in the Ether garden
                            int th = 5 + Fl(Hash(x, z, 151) * 3);
                            Put(x, h + 1, z, 5);
                            Put(x, h + 2, z, 5);
                            for (int k = 3; k <= th + 2; k++)
                            {
                                Put(x, h + k, z, 6, true);
                                if (k > 3 && k < th + 1)
                                    for (int i = 0; i < 8; i += 2) Put(x + DIRS4[i], h + k, z + DIRS4[i + 1], 6, true);
                            }
                            continue;
                        }
                        if (r < (bi == FOREST ? 0.028 : 0.01))
                        {
                            int th = 4 + Fl(Hash(x, z, 42) * 3),
                                leaf = bi == FOREST && Hash(x, z, 44) < 0.65 ? 7 : 6;
                            for (int k = 1; k <= th; k++) Put(x, h + k, z, 5);
                            for (int dy = -2; dy <= 2; dy++)
                                for (int dx = -2; dx <= 2; dx++)
                                    for (int dz = -2; dz <= 2; dz++)
                                    {
                                        double rr = Hypot(dx, dy * 1.2, dz);
                                        if (rr <= 2.5 - (Hash(x + dx, z + dz, dy + 50) < 0.3 ? 0.6 : 0)) Put(x + dx, h + th + dy, z + dz, leaf, true);
                                    }
                            Put(x, h + th + 2, z, leaf, true);
                            continue;
                        }
                        if (bi != FOREST && r >= 0.01 && r < 0.0125)
                        {
                            // mossy boulder of 1 to 4 blocks, resting on the terrain of each column
                            for (int i = 0; i < 4; i++)
                            {
                                int dx = BOULDER[i * 3], dz = BOULDER[i * 3 + 1], dy = BOULDER[i * 3 + 2];
                                if (Hash(x + dx * 3, z + dz * 5 + dy, 133) < BOULDER_P[i])
                                    Put(x + dx, HeightAt(x + dx, z + dz) + dy, z + dz, Hash(x + dx, z + dz, 134) < 0.7 ? 78 : 3, true);
                            }
                            continue;
                        }
                        if (At(x, h + 1, z) == 0)
                        {
                            if (r < 0.09) Put(x, h + 1, z, 20);
                            else if (r < 0.11) Put(x, h + 1, z, 17 + Fl(Hash(x, z, 43) * 3));
                        }
                    }
            }

            // floating island decor (same margin: identical on both sides of an edge)
            void IslandDecor()
            {
                for (int z = z0 - 3; z < z0 + CH + 3; z++)
                    for (int x = x0 - 3; x < x0 + CH + 3; x++)
                    {
                        int t = IslandTop(x, z);
                        if (t < 0 || t >= DY + 43) continue;
                        double r = Hash(x, z, 45);
                        if (r < 0.012)
                        {
                            for (int k = 1; k <= 2 + Fl(Hash(x, z, 46) * 2); k++) Put(x, t + k, z, 8, true);
                            continue;
                        }
                        if (r < 0.05 && t <= DY + 40)
                        {
                            int th = 3 + Fl(Hash(x, z, 47) * 2);
                            for (int k = 1; k <= th; k++) Put(x, t + k, z, 5, true);
                            for (int dy = -1; dy <= 2; dy++)
                                for (int dx = -2; dx <= 2; dx++)
                                    for (int dz = -2; dz <= 2; dz++) if (Hypot(dx, dy * 1.3, dz) <= 2.3) Put(x + dx, t + th + dy, z + dz, 7, true);
                            continue;
                        }
                        if (At(x, t + 1, z) == 0 && r < 0.16) Put(x, t + 1, z, r < 0.1 ? 20 : 17 + Fl(Hash(x, z, 48) * 3));
                    }
            }

            // ruins: one dark validator per 80x80 region
            void Ruins()
            {
                for (int rz = FloorDiv(z0 - 4, RUIN); rz <= FloorDiv(z0 + CH + 4, RUIN); rz++)
                    for (int rx = FloorDiv(x0 - 4, RUIN); rx <= FloorDiv(x0 + CH + 4, RUIN); rx++)
                    {
                        var r = RuinAt(rx, rz);
                        if (r == null) continue;
                        int rx0 = r.X, rz0 = r.Z, ry = r.Y;
                        for (int dx = -2; dx <= 2; dx++)
                            for (int dz = -2; dz <= 2; dz++)
                            {
                                double hh = Hash(rx0 + dx, rz0 + dz, 121);
                                Put(rx0 + dx, ry, rz0 + dz, hh < 0.15 ? 78 : (dx + dz) % 2 != 0 ? 15 : 81); // worn flooring
                                for (int k = 1; k <= 6; k++) Put(rx0 + dx, ry + k, rz0 + dz, 0);
                                Put(rx0 + dx, ry - 1, rz0 + dz, 3);
                            }
                        for (int i = 0; i < 8; i += 2)
                        {
                            int dx = RUIN_CORNERS[i], dz = RUIN_CORNERS[i + 1];
                            int hp = 1 + Fl(Hash(rx0 + dx, rz0 + dz, 122) * 3);
                            for (int k = 1; k <= hp; k++) Put(rx0 + dx, ry + k, rz0 + dz, Hash(rx0 + dx, k, 123) < 0.2 ? 78 : 127); // broken columns
                            if (hp == 3) Put(rx0 + dx, ry + 4, rz0 + dz, 14);
                        }
                        Put(rx0, ry + 1, rz0, 73);
                    }
            }

            static bool InOct(int dx, int dz) => Math.Max(Math.Abs(dx), Math.Abs(dz)) <= TR && Math.Abs(dx) + Math.Abs(dz) <= TC;

            // the tower's entrance stair: one step, three wide, filled underneath, head room cleared
            void Step(int tx0, int z, int top, int id)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    int x = tx0 + dx;
                    for (int y = Math.Min(top - 1, HeightAt(x, z)); y < top; y++) Put(x, y, z, 15);
                    Put(x, top, z, id);
                    for (int k = 1; k <= 3; k++) Put(x, top + k, z, 0);
                }
            }

            // towers: a 96x96 region each, 21x21 octagonal beacons (TR, TC)
            void Towers()
            {
                for (int tz = FloorDiv(z0 - TR - 12, TOWER); tz <= FloorDiv(z0 + CH + TR + 12, TOWER); tz++)
                    for (int tx = FloorDiv(x0 - TR - 12, TOWER); tx <= FloorDiv(x0 + CH + TR + 12, TOWER); tx++)
                    {
                        var t = TowerAt(tx, tz);
                        if (t == null) continue;
                        int tx0 = t.X, tz0 = t.Z, ty = t.Y, LADX = TOWER_LADDER[0], LADZ = TOWER_LADDER[1];
                        for (int dx = -TR; dx <= TR; dx++)
                            for (int dz = -TR; dz <= TR; dz++)
                            {
                                int ax = Math.Abs(dx), az = Math.Abs(dz);
                                for (int k = 1; k <= 30; k++) Put(tx0 + dx, ty + k, tz0 + dz, 0);
                                for (int y = ty - 1, g = HeightAt(tx0 + dx, tz0 + dz); y > g && y > ty - 12; y--) Put(tx0 + dx, y, tz0 + dz, 81);
                                if (!InOct(dx, dz))
                                {
                                    Put(tx0 + dx, ty, tz0 + dz, 15);
                                    if (ax + az <= TC + 1) Put(tx0 + dx, ty + 1, tz0 + dz, 34);
                                    continue;
                                }
                                Put(tx0 + dx, ty, tz0 + dz, dx % 3 == 0 || dz % 3 == 0 ? 128 : 80); // neon grid floor
                                bool ring = ax == TR || az == TR || ax + az == TC;
                                if (!ring) continue;
                                bool vertex = (ax == TR && az == TC - TR) || (ax == TC - TR && az == TR),
                                    faceMid = (ax == TR && dz == 0) || (az == TR && dx == 0),
                                    face = (ax == TR && az < TC - TR) || (az == TR && ax < TC - TR),
                                    chamfer = ax + az == TC && ax != TR && az != TR,
                                    front = dz == -TR;
                                int along = ax == TR ? dz : dx;
                                for (int k = 1; k <= 24; k++)
                                {
                                    int id;
                                    if (front && dx == 0 && k <= 2) id = k == 1 ? 48 : 49;
                                    else if (front && ax == 1 && k <= 3) id = 127;
                                    else if (front && ax <= 1 && k == 3) id = 128;
                                    else if (k == 24 || k == 23) id = 15;
                                    else if (vertex) id = 127;
                                    else if (k >= 19) id = k == 19 ? 15 : k == 20 ? 34 : 0;
                                    else if (k == 6 || k == 12 || k == 18) id = 128;
                                    else if (k <= 5) id = faceMid && (k == 3 || k == 4) ? 30 : 81;
                                    else if (face && Math.Abs(along) / 4.0 + Math.Abs(k - 12) / 5.5 <= 1) id = 22;
                                    else if (chamfer && k % 6 == 3) id = 29;
                                    else id = 15;
                                    Put(tx0 + dx, ty + k, tz0 + dz, id);
                                }
                            }
                        // the entrance stair
                        Step(tx0, tz0 - TR - 1, ty, 15);
                        int dir = Math.Sign(HeightAt(tx0, tz0 - TR - 2) + 1 - (ty + 1));
                        if (Math.Abs(HeightAt(tx0, tz0 - TR - 7) + 1 - (ty + 1)) > 6 && dir > 0)
                            for (int i = TR + 2; i <= TR + 7; i++) Step(tx0, tz0 - i, ty, 15);
                        else if (dir != 0)
                            for (int j = 0; j < 6; j++)
                            {
                                int z = tz0 - TR - 2 - j, L = dir < 0 ? ty - j : ty + 1 + j;
                                Step(tx0, z, L, dir < 0 ? 42 : 40);
                                int beyond = HeightAt(tx0, z - 1) + 1;
                                if (dir < 0 ? beyond >= L : beyond <= L + 1) break;
                            }
                        // floor platforms and the boss's platform, a gap left for the ladder; the roof above
                        foreach (int k in TOWER_FLOORS)
                            for (int dx = -TR + 1; dx <= TR - 1; dx++)
                                for (int dz = -TR + 1; dz <= TR - 1; dz++)
                                {
                                    if (!InOct(dx, dz) || Math.Abs(dx) + Math.Abs(dz) == TC || (dx == LADX && dz == LADZ)) continue;
                                    Put(tx0 + dx, ty + k, tz0 + dz, k == 24 ? 15 : dx == 0 || dz == 0 ? 128 : 80);
                                }
                        for (int k = 1; k <= 24; k++) Put(tx0 + LADX, ty + k, tz0 + LADZ, 94);
                        foreach (int k in LANTERN_K)
                            for (int i = 0; i < 6; i += 2) Put(tx0 + LANTERNS[i], ty + k, tz0 + LANTERNS[i + 1], 84);
                        for (int k = 25; k <= 27; k++)
                        {
                            int r = 5 - 2 * (k - 25);
                            for (int dx = -r; dx <= r; dx++)
                                for (int dz = -r; dz <= r; dz++) if (Math.Abs(dx) + Math.Abs(dz) <= r) Put(tx0 + dx, ty + k, tz0 + dz, k == 27 ? 145 : 22);
                        }
                        for (int i = 0; i < 16; i += 2) Put(tx0 + BEACONS[i], ty + 25, tz0 + BEACONS[i + 1], 84);
                        Put(tx0 + TOWER_CHEST[0], ty + 20, tz0 + TOWER_CHEST[1], 98);
                    }
            }

            // the Merge Sanctum (mergeAt())
            void Merges()
            {
                for (int mz = FloorDiv(z0 - MERGE_R - 14, MERGE); mz <= FloorDiv(z0 + CH + MERGE_R + 14, MERGE); mz++)
                    for (int mx = FloorDiv(x0 - MERGE_R - 14, MERGE); mx <= FloorDiv(x0 + CH + MERGE_R + 14, MERGE); mx++)
                    {
                        var m = MergeAt(mx, mz);
                        if (m == null) continue;
                        int X = m.X, Z = m.Z, Y = m.Y;
                        for (int dx = -MERGE_R - 2; dx <= MERGE_R + 2; dx++)
                            for (int dz = -MERGE_R - 2; dz <= MERGE_R + 2; dz++)
                            {
                                double r = Hypot(dx, dz);
                                int x = X + dx, z = Z + dz;
                                bool pow = dx < 0;
                                if (r > MERGE_R + 1.5) continue;
                                for (int y = Y + 1; y < SY; y++) Put(x, y, z, 0);
                                if (r > MERGE_R + 0.4) continue;
                                bool rim = r > MERGE_R - 0.6,
                                    accent = (r >= 6.5 && r < 7.5) || (r >= 12.5 && r < 13.5);
                                Put(x, Y, z, dx == 0 ? 128 : rim ? (pow ? 80 : 15) : accent ? (pow ? 27 : 22) : r < 3 && !pow ? 81 : pow ? 80 : 15);
                                int depth = Fl((MERGE_R + 0.4 - r) * 0.45) + 1;
                                for (int k = 1; k <= depth; k++) Put(x, Y - k, z, k == depth && r < 1 ? 83 : Hash(x * 3 + k, z, 303) < 0.08 ? 8 : 3);
                                if (rim && !(dz > 0 && Math.Abs(dx) <= 1)) Put(x, Y + 1, z, pow ? 35 : 34);
                            }
                        for (int k = 0; k < 12; k++)
                        {
                            double an = ((k + 0.5) * Math.PI) / 6;
                            int dx = Rnd(Math.Cos(an) * (MERGE_R - 3)), dz = Rnd(Math.Sin(an) * (MERGE_R - 3));
                            for (int h = 1; h <= 6; h++) Put(X + dx, Y + h, Z + dz, h == 3 ? (dx < 0 ? 27 : 22) : dx < 0 ? 80 : 127);
                            Put(X + dx, Y + 7, Z + dz, dx < 0 ? 14 : 84);
                        }
                        // the forge (west) and the crystal obelisk (east), behind each twin's spot
                        foreach (int ddz in FORGE_DZ)
                        {
                            Put(X - 13, Y + 1, Z + ddz, 27);
                            Put(X - 13, Y + 2, Z + ddz, ddz != 0 ? 80 : 14);
                            Put(X + 13, Y + 1, Z + ddz, 22);
                        }
                        for (int h = 2; h <= 5; h++) Put(X + 13, Y + h, Z, 83);
                        for (int dy = -3; dy <= 3; dy++)
                            for (int dx = -3; dx <= 3; dx++)
                                for (int dz = -3; dz <= 3; dz++)
                                    if (Math.Abs(dx) + Math.Abs(dy) + Math.Abs(dz) <= 3)
                                        Put(X + dx, Y + 11 + dy, Z + dz, dx < 0 ? 25 : dx > 0 ? 22 : dy == 0 && dz == 0 ? 145 : 130);
                        // the Beacon Stair
                        int sx = m.Sx, sz = m.Sz, G = m.G + 1, N = 2 * (Y + 1 - G);
                        // ring of 16 cells, clockwise from the north-west corner; start = the north-middle cell
                        var ring = new int[32];
                        int n = 0;
                        for (int i = -2; i <= 2; i++) { ring[n++] = i; ring[n++] = -2; }
                        for (int i = -1; i <= 2; i++) { ring[n++] = 2; ring[n++] = i; }
                        for (int i = 1; i >= -2; i--) { ring[n++] = i; ring[n++] = 2; }
                        for (int i = 1; i >= -1; i--) { ring[n++] = -2; ring[n++] = i; }
                        int start = -1;
                        for (int i = 0; i < 16; i++) if (ring[i * 2] == 0 && ring[i * 2 + 1] == -2) { start = i; break; }
                        for (int dx = -3; dx <= 3; dx++)
                            for (int dz = -3; dz <= 3; dz++)
                            {
                                Put(sx + dx, G - 1, sz + dz, Math.Max(Math.Abs(dx), Math.Abs(dz)) == 3 ? 22 : 15);
                                for (int y = G - 2; y >= G - 8; y--)
                                {
                                    int c = At(sx + dx, y, sz + dz);
                                    if (c > 0 && c != 11) break;
                                    Put(sx + dx, y, sz + dz, 3);
                                }
                                for (int y = G; y <= G + 3; y++) Put(sx + dx, y, sz + dz, 0);
                            }
                        for (int y = m.G - 2; y <= Y; y++)
                            for (int dx = -1; dx <= 1; dx++)
                                for (int dz = -1; dz <= 1; dz++) Put(sx + dx, y, sz + dz, (y - G) % 8 == 7 ? 22 : 15);
                        for (int i = 0; i < N; i++)
                        {
                            int ri = (((start - (N - 1 - i)) % 16) + 16) % 16;
                            int dx = ring[ri * 2], dz = ring[ri * 2 + 1],
                                s2 = 2 * G + i + 1,
                                x = sx + dx, z = sz + dz,
                                y = s2 % 2 != 0 ? (s2 - 1) / 2 : s2 / 2 - 1;
                            Put(x, y, z, s2 % 2 != 0 ? 34 : 15);
                            for (int k = 1; k <= 3; k++) Put(x, y + k, z, 0);
                        }
                        for (int dz = MERGE_R + 1; dz <= MERGE_R + 2; dz++)
                            for (int dx = -1; dx <= 1; dx++)
                            {
                                Put(X + dx, Y, Z + dz, dx != 0 ? 15 : 128);
                                for (int k = 1; k <= 3; k++) Put(X + dx, Y + k, Z + dz, 0);
                            }
                    }
            }

            // the Mempool (arenaAt()), column by column
            void Arenas()
            {
                for (int az = FloorDiv(z0 - ARENA_GATE - 2, ARENA); az <= FloorDiv(z0 + CH + ARENA_GATE + 2, ARENA); az++)
                    for (int ax = FloorDiv(x0 - ARENA_GATE - 2, ARENA); ax <= FloorDiv(x0 + CH + ARENA_GATE + 2, ARENA); ax++)
                    {
                        var A = ArenaAt(ax, az);
                        if (A == null) continue;
                        int X = A.X, Z = A.Z, Y = A.Y;
                        if (X + ARENA_GATE + 1 < x0 || X - ARENA_GATE - 1 >= x0 + CH || Z + ARENA_GATE + 1 < z0 || Z - ARENA_GATE - 1 >= z0 + CH) continue;
                        for (int lz = 0; lz < CH; lz++)
                            for (int lx = 0; lx < CH; lx++)
                            {
                                int x = x0 + lx, z = z0 + lz, dx = x - X, dz = z - Z;
                                double r = Hypot(dx, dz), an = Math.Atan2(dz, dx);
                                int gate = Math.Abs(dz) <= 2 ? Math.Abs(dz) : Math.Abs(dx) <= 2 ? Math.Abs(dx) : -1,
                                    along = Math.Abs(dz) <= 2 ? Math.Abs(dx) : Math.Abs(dz),
                                    quarter = Math.Abs(dx) >= Math.Abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0,
                                    arc = Rnd((an + Math.PI) * ARENA_W);
                                if (r > ARENA_W + 0.5)
                                {
                                    if (gate < 0 || gate > 2 || along > ARENA_GATE) continue;
                                    int outw = along - ARENA_W, g = HeightAt(x, z),
                                        L = Y + (int)Clamp(g - Y, -outw, outw);
                                    for (int y = L - 1; y >= Math.Max(1, L - 14); y--)
                                    {
                                        int c = At(x, y, z);
                                        if (c > 0 && c != 11) break;
                                        Put(x, y, z, 3);
                                    }
                                    Put(x, L, z, gate == 0 ? 128 : gate == 2 ? 81 : 15);
                                    for (int k = 1; k <= 4; k++) Put(x, L + k, z, 0);
                                    continue;
                                }
                                for (int y = Y + 1; y < SY; y++) Put(x, y, z, 0);
                                for (int y = Y - 1; y >= Math.Max(1, Y - 16); y--)
                                {
                                    int c = At(x, y, z);
                                    if (c > 0 && c != 11 && c != 6 && c != 7 && c != 5) break;
                                    Put(x, y, z, 3);
                                }
                                if (r <= ARENA_R + 0.5)
                                {
                                    int sector = Fl(((an + Math.PI) * 8) / Math.PI), band = Fl(r / 3);
                                    int id = (sector + band) % 2 != 0 ? 15 : 80;
                                    if (Math.Abs(dx) / 3.0 + Math.Abs(dz) / 5.0 <= 1) id = dx == 0 && dz == 0 ? 130 : dz == 0 ? 128 : dz < 0 ? 22 : 24;
                                    else if (r >= 6 && r < 7) id = 128;
                                    else if (r >= 11.5 && r < 12.5) id = 81;
                                    else if (r > ARENA_R - 0.5) id = arc % 4 != 0 ? 80 : 128;
                                    Put(x, Y, z, id);
                                    continue;
                                }
                                if (gate >= 0 && gate <= 2)
                                {
                                    Put(x, Y, z, gate == 0 ? 128 : 15);
                                    if (r > ARENA_W - 1.5)
                                    {
                                        Put(x, Y + 6, z, 128);
                                        for (int k = 7; k <= 9; k++) Put(x, Y + k, z, k == 9 ? 34 : 15);
                                    }
                                    else if (r > ARENA_W - 2.5) Put(x, Y + 8, z, 15);
                                    continue;
                                }
                                Put(x, Y, z, 80);
                                if (r <= ARENA_R + 1.5)
                                {
                                    Put(x, Y + 1, z, 81);
                                    if (arc % 6 == 0) Put(x, Y + 2, z, 14);
                                }
                                else if (r <= ARENA_R + 7.5)
                                {
                                    int t = Math.Min(5, Fl(r - ARENA_R - 1.5));
                                    for (int k = 1; k <= 1 + t; k++) Put(x, Y + k, z, 80);
                                    Put(x, Y + 2 + t, z, t % 2 != 0 ? SEATS[quarter] : 15);
                                }
                                else if (r <= ARENA_W - 1.5)
                                {
                                    for (int k = 1; k <= 7; k++) Put(x, Y + k, z, 80);
                                    Put(x, Y + 8, z, 81);
                                }
                                else
                                {
                                    bool pillar = arc % 4 == 0;
                                    for (int k = 1; k <= 9; k++)
                                    {
                                        int id;
                                        if (pillar) id = k == 6 ? 128 : 127;
                                        else if (k == 1) id = 81;
                                        else if (k <= 4) id = quarter % 2 != 0 ? 32 : 29;
                                        else if (k == 5) id = 15;
                                        else if (k == 6) id = 128;
                                        else if (k == 7) id = (arc + 2) % 8 == 0 ? 30 : 15;
                                        else if (k == 8) id = 15;
                                        else id = 34;
                                        Put(x, Y + k, z, id);
                                    }
                                    if (arc % 8 == 0) Put(x, Y + 10, z, 84);
                                }
                            }
                        // gate pillars
                        for (int i = 0; i < 8; i += 2)
                        {
                            int ux = GATE_DIRS[i], uz = GATE_DIRS[i + 1];
                            for (int s = -3; s <= 3; s += 6)
                            {
                                int px = X + ux * ARENA_W + (uz != 0 ? s : 0), pz = Z + uz * ARENA_W + (ux != 0 ? s : 0);
                                for (int k = 1; k <= 11; k++) Put(px, Y + k, pz, k == 11 ? 84 : 127);
                            }
                        }
                        // four beacon pylons on the diagonals
                        for (int k = 0; k < 4; k++)
                        {
                            double a2 = ((k + 0.5) * Math.PI) / 2;
                            int px = X + Rnd(Math.Cos(a2) * (ARENA_W - 1)), pz = Z + Rnd(Math.Sin(a2) * (ARENA_W - 1));
                            for (int h = 1; h <= 14; h++) Put(px, Y + h, pz, h == 14 ? 145 : h % 4 == 2 ? 128 : 127);
                        }
                        // the pending transactions
                        for (int k = 0; k < 10; k++)
                        {
                            double a2 = (k / 10.0) * Math.PI * 2 + Hash(X, Z + k, 323) * 0.4;
                            int rr = 9 + Fl(Hash(X + k, Z, 324) * 6),
                                cx2 = X + Rnd(Math.Cos(a2) * rr),
                                cz2 = Z + Rnd(Math.Sin(a2) * rr),
                                cy2 = Y + 12 + Fl(Hash(X, Z, 325 + k) * 5),
                                col = PENDING_COLS[k % 4];
                            for (int ddx = 0; ddx <= 1; ddx++)
                                for (int ddy = 0; ddy <= 1; ddy++)
                                    for (int ddz = 0; ddz <= 1; ddz++) Put(cx2 + ddx, cy2 + ddy, cz2 + ddz, col);
                        }
                        // the next block, waiting to be built
                        for (int ddx = -2; ddx <= 2; ddx++)
                            for (int ddy = -2; ddy <= 2; ddy++)
                                for (int ddz = -2; ddz <= 2; ddz++)
                                    if ((Math.Abs(ddx) == 2 ? 1 : 0) + (Math.Abs(ddy) == 2 ? 1 : 0) + (Math.Abs(ddz) == 2 ? 1 : 0) >= 2)
                                        Put(X + ddx, Y + 20 + ddy, Z + ddz, 128);
                        Put(X, Y + 20, Z, 145);
                    }
            }

            // the City, column by column (each column depends only on x and z)
            int cLx, cLz;
            void CSet(int y, int id) => Set(Li(cLx, y, cLz), id);
            void Col(int Y, int n) { for (int k = 1; k <= n; k++) CSet(Y + k, 127); }

            void City()
            {
                if (!InCity(x0 + 8, z0 + 8, 12)) return;
                const int Y = CITY.Y, ox = CITY.X - 42, oz = CITY.Z - 42;
                for (int lz = 0; lz < CH; lz++)
                    for (int lx = 0; lx < CH; lx++)
                    {
                        int x = x0 + lx, z = z0 + lz;
                        double dc = Hypot(x - CITY.X, z - CITY.Z);
                        if (dc > CITY.R) continue;
                        cLx = lx; cLz = lz;
                        for (int y = Y + 1; y < SY; y++) CSet(y, 0);
                        for (int y = Y - 4; y < Y; y++) { int c = a[Li(lx, y, lz)]; if (c == 0 || c == 11) CSet(y, 3); }
                        int gx = (((x - ox) % CITY.STEP) + CITY.STEP) % CITY.STEP,
                            gz = (((z - oz) % CITY.STEP) + CITY.STEP) % CITY.STEP;
                        bool street = gx == 0 || gz == 0 || gx == 11 || gz == 11;
                        CSet(Y, dc > CITY.R - 1 ? 81 : street ? ((gx == 0 || gz == 0) && (x + z) % 3 == 0 ? 128 : 80) : (gx + gz) % 2 != 0 ? 15 : 81);
                        var L = CityPlot(FloorDiv(x - ox, CITY.STEP), FloorDiv(z - oz, CITY.STEP));
                        if (L == null) continue;
                        int dx = x - L.Cx, dz = z - L.Cz, ax = Math.Abs(dx), az = Math.Abs(dz), m = Math.Max(ax, az),
                            H = L.H ?? 0, dam = (dx + dz) % 2 != 0 ? 15 : 81;
                        double rd = Hypot(dx, dz);
                        switch (L.T)
                        {
                            case "large":
                                if (m > 5) continue;
                                CSet(Y, dam);
                                if (m == 5)
                                {
                                    Colonnade(Y, H, dx, dz, ax, az);
                                    continue;
                                }
                                CSet(Y + H + 1 + (4 - m), m == 4 || dx == 0 || dz == 0 || ax == az ? 15 : 10);
                                if (m == 4) CSet(Y + 5, 34);
                                if (dx == -4 && dz == 0) for (int k = 1; k <= 5; k++) CSet(Y + k, 95);
                                if (ax == 3 && az == 3) Col(Y, H);
                                if (ax + az == 2 && m == 2)
                                {
                                    CSet(Y + 1, 80);
                                    CSet(Y + 2, 129);
                                }
                                if (m == 0)
                                {
                                    CSet(Y + 1, 127);
                                    CSet(Y + 2, 84);
                                    CSet(Y + 7, 130);
                                }
                                break;
                            case "temple":
                                if (m > 5) continue;
                                CSet(Y, dam);
                                if (m == 5) Colonnade(Y, H, dx, dz, ax, az);
                                else CSet(Y + H + 1, 15);
                                if (ax <= 3) CSet(Y + H + 2, az == 5 && dx == 0 ? 128 : 15);
                                else if (ax == 4) CSet(Y + H + 2, 34);
                                if (ax <= 1) CSet(Y + H + 3, 15);
                                else if (ax == 2) CSet(Y + H + 3, 34);
                                if (m == 0)
                                {
                                    CSet(Y + 1, 80);
                                    CSet(Y + 2, 129);
                                    CSet(Y + 3, 129);
                                }
                                if (ax == 3 && az == 3)
                                {
                                    CSet(Y + 1, 127);
                                    CSet(Y + 2, 84);
                                }
                                if (az == 2 && ax <= 1) CSet(Y + 1, 34);
                                break;
                            case "stainedGlassHall":
                                if (m > 5) continue;
                                CSet(Y, dam);
                                if (m == 5)
                                {
                                    Colonnade(Y, H, dx, dz, ax, az);
                                    continue;
                                }
                                CSet(Y + H + 1, dx % 3 == 0 || dz % 3 == 0 ? 15 : 10);
                                if (H >= 9 && m == 4) CSet(Y + 5, 34);
                                if (H >= 9 && dx == -4 && dz == 0) for (int k = 1; k <= 5; k++) CSet(Y + k, 95);
                                if (ax == 3 && az == 3) CSet(Y + H, 85);
                                if (m <= 1 && (dx != 0 || dz != 0)) CSet(Y, 11);
                                break;
                            case "rotunda":
                                if (rd > 5.5) continue;
                                CSet(Y, dam);
                                if (rd == 5) Col(Y, H);
                                if (rd >= 4.4) CSet(Y + H + 1, K5(dx, dz) ? 128 : 15);
                                else CSet(Y + H + 2 + Fl((4.4 - rd) / 1.1), dx == 0 || dz == 0 ? 15 : 10);
                                if (rd >= 2 && rd < 3.2 && dx != 0 && dz != 0) CSet(Y, 11);
                                if (m == 0)
                                {
                                    CSet(Y + 1, 127);
                                    CSet(Y + 2, 83);
                                    CSet(Y + 3, 84);
                                }
                                break;
                            case "library":
                                if (m > 5) continue;
                                if (m == 5)
                                {
                                    CSet(Y + H + 1, K5(dx, dz) ? 128 : 15);
                                    if (ax == 5 && az == 5) Col(Y, H);
                                    else
                                    {
                                        int le = az == 5 ? dx : dz;
                                        bool door = az == 5 && ax <= 1;
                                        for (int k = 1; k <= H; k++) CSet(Y + k, door && k <= 3 ? 0 : k == 1 ? 79 : (k == 4 || k == 5) && le % 2 == 0 ? 32 : 15);
                                    }
                                    continue;
                                }
                                CSet(Y, m <= 2 ? 86 : 9);
                                CSet(Y + H + 1, m <= 1 ? 10 : 15);
                                if (m == 4 && !(az == 4 && ax <= 1)) for (int k = 1; k <= 3; k++) CSet(Y + k, 82);
                                if (ax == 2 && az == 2)
                                {
                                    CSet(Y + 1, 82);
                                    CSet(Y + 2, 82);
                                    CSet(Y + 3, 85);
                                }
                                if (m == 0)
                                {
                                    CSet(Y + 1, 9);
                                    CSet(Y + 2, 14);
                                }
                                break;
                            case "greenhouse":
                                if (m > 5) continue;
                                if (m == 5)
                                {
                                    if (ax == 5 && az == 5) Col(Y, 5);
                                    else
                                    {
                                        bool door = az == 5 && dx == 0;
                                        for (int k = 1; k <= 5; k++) CSet(Y + k, door && k <= 2 ? 0 : k == 5 ? 15 : k == 1 ? 79 : 10);
                                    }
                                    continue;
                                }
                                CSet(Y + 5 + (m == 4 ? 1 : m >= 2 ? 2 : m == 1 ? 3 : 4), dx == 0 || dz == 0 ? 15 : 10);
                                if (dx == 0) CSet(Y, 80);
                                else if (ax == 2 && dz == 0) CSet(Y, 11);
                                else
                                {
                                    CSet(Y, 1);
                                    double r = Hash(x, z, 178);
                                    if (ax == 3 && az == 3)
                                    {
                                        CSet(Y + 1, 5);
                                        CSet(Y + 2, 7);
                                        CSet(Y + 3, 7);
                                    }
                                    else if (r < 0.25) CSet(Y + 1, 17 + Fl(Hash(x, z, 179) * 3));
                                    else if (r < 0.4) CSet(Y + 1, 20);
                                    else if (r < 0.48) CSet(Y + 1, 75);
                                }
                                break;
                            case "market":
                            {
                                int ux = ax - 3, uz = az - 3, q = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
                                if (Math.Abs(ux) <= 1 && Math.Abs(uz) <= 1)
                                {
                                    CSet(Y + 3, 131 + q);
                                    if (ux != 0 && uz != 0)
                                    {
                                        CSet(Y + 1, 92);
                                        CSet(Y + 2, 92);
                                    }
                                    else if (ux == 0 && uz == 0)
                                    {
                                        CSet(Y + 1, 9);
                                        CSet(Y + 2, MARKET_ITEMS[q]);
                                    }
                                }
                                if (m == 0)
                                {
                                    Col(Y, 2);
                                    CSet(Y + 3, 84);
                                }
                                break;
                            }
                            case "forecourt":
                                if (ax == 3 && az <= 5 && (dz + 5) % 3 == 0)
                                {
                                    Col(Y, 3);
                                    CSet(Y + 4, 84);
                                }
                                break;
                            case "square":
                                if (rd <= 2) CSet(Y, 11);
                                else if (rd <= 2.9) CSet(Y + 1, 34);
                                if (dx == 0 && dz == 0)
                                {
                                    CSet(Y, 15);
                                    CSet(Y + 1, 127);
                                    CSet(Y + 2, 127);
                                    CSet(Y + 3, 84);
                                }
                                break;
                            case "garden":
                                if (m <= 4) CSet(Y, 1);
                                if (m <= 4 && m >= 3 && (dx + dz) % 2 != 0 && Hash(x, z, 176) < 0.6) CSet(Y + 1, 17 + Fl(Hash(x, z, 177) * 3));
                                break;
                            case "shelter":
                            {
                                const int R = 3;
                                if (m > R) continue;
                                if (m == R)
                                {
                                    bool door = dz == R && ax == 0, lantern = dz == -R && ax == 0, window = (dx == R || dx == -R) && az == 0;
                                    for (int k = 1; k <= H; k++)
                                        CSet(Y + k, door && k == 1 ? 48 : door && k == 2 ? 49 : lantern && k == 2 ? 84 : window && k == 2 ? 93 : 79);
                                    continue;
                                }
                                CSet(Y, dam);
                                CSet(Y + H + 1 + (R - 1 - m), 9);
                                if (dx == 0 && dz >= -1) CSet(Y, 86);
                                if (dx == -2 && dz == -1) CSet(Y + 1, 135);
                                if (dx == 2 && dz == 1) CSet(Y + 1, 137);
                                if (dx == 2 && dz == 0) CSet(Y + 1, 141);
                                break;
                            }
                        }
                    }
            }
            // columns every other row, marble entablature, neon trim along the middle of the facades
            void Colonnade(int Y, int H, int dx, int dz, int ax, int az)
            {
                if ((dx + dz) % 2 == 0 || ax == az) Col(Y, H);
                CSet(Y + H + 1, K5(dx, dz) ? 128 : 15);
            }

            // the Circuits Complex, column by column: five walled rooms off a central corridor
            void Circuits()
            {
                if (!InCircuits(x0 + 8, z0 + 8, 20)) return;
                const int Y = CIRCUITS.Y;
                for (int lz = 0; lz < CH; lz++)
                    for (int lx = 0; lx < CH; lx++)
                    {
                        int x = x0 + lx, z = z0 + lz, rx = x - CIRCUITS.X, rz = z - CIRCUITS.Z;
                        int room = -1, dx = 0, dz = 0, m = 0;
                        for (int ri = 0; ri < 5; ri++)
                        {
                            int ddx = rx - CR_CX[ri], ddz = rz - CR_CZ[ri], mm = Math.Max(Math.Abs(ddx), Math.Abs(ddz));
                            if (mm <= CR_R[ri])
                            {
                                room = ri;
                                dx = ddx;
                                dz = ddz;
                                m = mm;
                                break;
                            }
                        }
                        cLx = lx; cLz = lz;
                        if (room >= 0)
                        {
                            int R = CR_R[room], H = CR_H[room];
                            for (int y = Y + 1; y < SY; y++) CSet(y, 0);
                            for (int y = Y - 4; y < Y; y++) { int c = a[Li(lx, y, lz)]; if (c == 0 || c == 11) CSet(y, 3); }
                            if (m == R)
                            {
                                bool door = CircuitsDoorCell(room, dx, dz);
                                for (int k = 1; k <= H; k++) CSet(Y + k, door && k == 1 ? 48 : door && k == 2 ? 49 : 79);
                                continue;
                            }
                            CSet(Y, (dx + dz) % 2 != 0 ? 15 : 81);
                            CSet(Y + H + 1 + (R - 1 - m), 9);
                            BuildRoom(room, dx, dz, Y);
                            continue;
                        }
                        if (rx >= -2 && rx <= 2 && rz >= -20 && rz <= 10)
                        {
                            for (int y = Y + 1; y < SY; y++) CSet(y, 0);
                            for (int y = Y - 4; y < Y; y++) { int c = a[Li(lx, y, lz)]; if (c == 0 || c == 11) CSet(y, 3); }
                            CSet(Y, (rx + rz) % 2 != 0 ? 15 : 81);
                            CSet(Y + 5, 9);
                            if (rz == -20)
                            {
                                bool door = rx == 0;
                                for (int k = 1; k <= 4; k++) CSet(Y + k, door && k == 1 ? 48 : door && k == 2 ? 49 : 79);
                            }
                            else if (rx == -2 || rx == 2)
                            {
                                for (int k = 1; k <= 4; k++) CSet(Y + k, 79);
                            }
                        }
                    }
            }
            // each room's circuit (CIRCUITS_ROOMS[].build in world.js)
            void BuildRoom(int room, int dx, int dz, int Y)
            {
                switch (room)
                {
                    case 0: // light a lamp: a NOT gate facing the door
                        if (dx == -1 && dz == 0) CSet(Y + 1, 123);
                        if (dx == 0 && dz == 0) CSet(Y + 1, 67);
                        if (dx == 1 && dz == 0) CSet(Y + 1, 68);
                        break;
                    case 1: // two-key door
                        if (dx == 1 && dz == 0) CSet(Y + 1, 115);
                        if (dx == 1 && dz == -1) CSet(Y + 1, 66);
                        if (dx == 1 && dz == 1) CSet(Y + 1, 66);
                        if (dx == 2 && dz == 0)
                        {
                            CSet(Y + 1, 48);
                            CSet(Y + 2, 49);
                        }
                        if (dx == 2 && (dz == -1 || dz == 1))
                        {
                            CSet(Y + 1, 79);
                            CSet(Y + 2, 79);
                        }
                        break;
                    case 2: // self-oscillating blinker
                        if (dx == -1 && dz == 0) CSet(Y + 1, 120);
                        if (dx == -1 && dz == -1) CSet(Y + 1, 67);
                        if (dx == 0 && dz == -1) CSet(Y + 1, 67);
                        if (dx == 0 && dz == 0) CSet(Y + 1, 67);
                        if (dx == 0 && dz == 1) CSet(Y + 1, 67);
                        if (dx == -1 && dz == 1) CSet(Y + 1, 67);
                        if (dx == 1 && dz == 0) CSet(Y + 1, 68);
                        break;
                    case 3: // a latch that remembers
                        if (dx == 0 && dz == 0) CSet(Y + 1, 66);
                        if (dx == 0 && dz == -1) CSet(Y + 1, 116);
                        if (dx == 0 && dz == -2) CSet(Y + 1, 67);
                        if (dx == 1 && dz == -2) CSet(Y + 1, 67);
                        if (dx == 1 && dz == -1) CSet(Y + 1, 67);
                        if (dx == 2 && dz == -2) CSet(Y + 1, 68);
                        break;
                    case 4: // coin flip
                        if (dx == -4 && dz == 1) CSet(Y + 1, 120);
                        if (dx == -4 && dz == 0) CSet(Y + 1, 67);
                        if (dx == -3 && dz == 0) CSet(Y + 1, 67);
                        if (dx == -3 && dz == 1) CSet(Y + 1, 67);
                        if (dx == -3 && dz == 2) CSet(Y + 1, 67);
                        if (dx == -4 && dz == 2) CSet(Y + 1, 67);
                        if (dx == -2 && dz == 1) CSet(Y + 1, 67);
                        if (dx == -1 && dz == 1) CSet(Y + 1, 112);
                        if (dx == 0 && dz == 1) CSet(Y + 1, 66);
                        if (dx == -1 && dz == 0) CSet(Y + 1, 67);
                        if (dx == -1 && dz == -1) CSet(Y + 1, 116);
                        if (dx == -1 && dz == -2) CSet(Y + 1, 67);
                        if (dx == -2 && dz == -1) CSet(Y + 1, 67);
                        if (dx == -2 && dz == -2) CSet(Y + 1, 67);
                        if (dx == 0 && dz == -2) CSet(Y + 1, 68);
                        break;
                }
            }

            // the validators' path: polished-granite slabs, a neon strip, lampposts (at most one block of fill or cut)
            void Path()
            {
                for (int lz = 0; lz < CH; lz++)
                {
                    int z = z0 + lz;
                    for (int lx = 0; lx < CH; lx++)
                    {
                        int x = x0 + lx;
                        if (!OnPath(x, z, 2)) continue;
                        int natural = HeightAt(x, z), up = 0, down = 0;
                        for (int i = 0; i < 8; i += 2)
                        {
                            int d = HeightAt(x + PATH4[i], z + PATH4[i + 1]) - natural;
                            if (d == 1) up++;
                            else if (d == -1) down++;
                        }
                        int h = up >= 3 ? natural + 1 : down >= 3 ? natural - 1 : natural, e = Math.Abs(x - SPAWN.X);
                        if (h <= SEA) continue;
                        if (h < natural) for (int y = h + 1; y <= natural; y++) Set(Li(lx, y, lz), 0);
                        Set(Li(lx, h, lz), e == 0 && ((z % 4) + 4) % 4 == 0 ? 128 : 80);
                        if (e <= 1)
                        {
                            for (int k = 1; k <= 3; k++) Set(Li(lx, h + k, lz), 0);
                        }
                        else if (((z % 8) + 8) % 8 == 0)
                        {
                            Set(Li(lx, h + 1, lz), 127);
                            Set(Li(lx, h + 2, lz), 127);
                            Set(Li(lx, h + 3, lz), 84);
                        }
                    }
                }
            }

            // the City's palm trees (under the domes and on the squares), within the 3-column margin
            void CityPalms()
            {
                if (!InCity(x0 + 8, z0 + 8, 16)) return;
                for (int j = 0; j < 7; j++)
                    for (int i = 0; i < 7; i++)
                    {
                        var L = CityPlot(i, j);
                        if (L == null) continue;
                        int[] pts = L.T == "stainedGlassHall" ? PALM_SG : L.T == "square" ? PALM_SQ : L.T == "garden" ? PALM_GD : PALM_NONE;
                        for (int p = 0; p < pts.Length; p += 2)
                        {
                            int x = L.Cx + pts[p], z = L.Cz + pts[p + 1];
                            if (x < x0 - 3 || x >= x0 + CH + 3 || z < z0 - 3 || z >= z0 + CH + 3) continue;
                            Put(x, CITY.Y, z, 1);
                            PalmTree(x, CITY.Y, z, L.T == "stainedGlassHall" ? Math.Min(5, (L.H ?? 0) - 3) : 5);
                        }
                    }
            }

            // Ether gardens: marble terrace, fountain and lantern column, cypresses at the corners
            void Gardens()
            {
                for (int gz = FloorDiv(z0 - 6, 64); gz <= FloorDiv(z0 + CH + 6, 64); gz++)
                    for (int gx = FloorDiv(x0 - 6, 64); gx <= FloorDiv(x0 + CH + 6, 64); gx++)
                    {
                        var j = GardenAt(gx, gz);
                        if (j == null) continue;
                        int jx = j.X, jz = j.Z, jy = j.Y;
                        for (int dx = -4; dx <= 4; dx++)
                            for (int dz = -4; dz <= 4; dz++)
                            {
                                bool edge = Math.Abs(dx) == 4 || Math.Abs(dz) == 4;
                                for (int k = 1; k <= 7; k++) Put(jx + dx, jy + k, jz + dz, 0);
                                for (int k = 1; k <= 3; k++) Put(jx + dx, jy - k, jz + dz, 3);
                                Put(jx + dx, jy, jz + dz, edge ? 1 : Math.Max(Math.Abs(dx), Math.Abs(dz)) == 1 ? 11 : (dx + dz) % 2 != 0 ? 15 : 80);
                                if (edge && (dx + dz) % 2 == 0 && !(Math.Abs(dx) == 4 && Math.Abs(dz) == 4)) Put(jx + dx, jy + 1, jz + dz, 7);
                                if (edge && (dx + dz) % 2 != 0 && Hash(jx + dx, jz + dz, 160) < 0.7)
                                    Put(jx + dx, jy + 1, jz + dz, 17 + Fl(Hash(jx + dx, jz + dz, 161) * 3));
                            }
                        for (int k = 1; k <= 3; k++) Put(jx, jy + k, jz, 127);
                        Put(jx, jy + 4, jz, 84);
                        for (int i = 0; i < 8; i += 2)
                        {
                            int dx = PALM_SQ[i], dz = PALM_SQ[i + 1]; // the four corners (+-4, +-4)
                            Put(jx + dx, jy + 1, jz + dz, 5);
                            for (int k = 2; k <= 6; k++) Put(jx + dx, jy + k, jz + dz, 6);
                        }
                    }
            }

            // the validator's sanctuary at the spawn point: the Atrium
            void Atrium()
            {
                int sx = SPAWN.X, sz = SPAWN.Z, sy = SPAWN.Y - 1;
                if (!(x0 <= sx + 8 && x0 + CH > sx - 8 && z0 <= sz + 8 && z0 + CH > sz - 8)) return;
                for (int dx = -7; dx <= 7; dx++)
                    for (int dz = -7; dz <= 7; dz++)
                    {
                        double d = Hypot(dx, dz);
                        if (d > 7.5) continue;
                        int x = sx + dx, z = sz + dz;
                        for (int k = 1; k <= 12; k++) Put(x, sy + k, z, 0);
                        for (int k = 1; k <= 3; k++) { int c = At(x, sy - k, z); if (c == 0 || c == 11) Put(x, sy - k, z, 3); }
                        Put(x, sy, z, d > 5.5 ? 81 : (Math.Abs(dx) + Math.Abs(dz)) % 2 != 0 ? 15 : 80);
                        if (d >= 2.9 && d <= 3.7 && dx != 0 && dz != 0) Put(x, sy, z, 11);
                    }
                for (int k = 0; k < 8; k++)
                {
                    double an = ((k + 0.5) / 8) * Math.PI * 2;
                    int x = sx + Rnd(Math.Cos(an) * 6), z = sz + Rnd(Math.Sin(an) * 6);
                    for (int h = 1; h <= 5; h++) Put(x, sy + h, z, 127);
                    if (k % 2 != 0) Put(x, sy + 6, z, 84);
                }
                for (int dx = -7; dx <= 7; dx++)
                    for (int dz = -7; dz <= 7; dz++)
                    {
                        double d = Hypot(dx, dz);
                        if (d >= 5.6 && d <= 6.6) Put(sx + dx, sy + 6, sz + dz, At(sx + dx, sy + 6, sz + dz) == 84 ? 84 : 34);
                    }
                for (int t = -6; t <= 6; t++)
                {
                    int hy = sy + 6 + Rnd(Math.Sqrt(Math.Max(0, 36 - t * t)) * 0.55);
                    Put(sx + t, hy, sz, 15);
                    Put(sx, hy, sz + t, 15);
                    int dd = Rnd(t * 0.7071);
                    Put(sx + dd, hy, sz + dd, 15);
                    Put(sx + dd, hy, sz - dd, 15);
                }
                Put(sx, sy + 10, sz, 130);
                for (int i = 0; i < 8; i += 2)
                {
                    int dx = ATRIUM_PALMS[i], dz = ATRIUM_PALMS[i + 1];
                    Put(sx + dx, sy, sz + dz, 1);
                    PalmTree(sx + dx, sy, sz + dz, 5);
                }
                Put(sx, sy + 1, sz, 13);
            }
        }
    }
}
