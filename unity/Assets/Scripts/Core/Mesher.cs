// Ether Mines · chunk meshing: turns a chunk's blocks into triangles (positions, normals, UV, shading).
// A port of the web version's src/mesh.js (meshChunk + pack), vertex for vertex: same order, same
// positions, normals, UVs, shading and indices, in the same four groups (opaque, glass, water, plants).
// CoreTests checks it against src/mesh.js. Pure C# (no UnityEngine, no LINQ). Block properties come
// from Rules (load rules.json first). One Mesher per thread: it reuses its buffers from chunk to chunk.
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    // one group of triangles (pack() in mesh.js); Col and Edge are null for water and plants. Edge: per
    // vertex, which of its face's sides are an outer edge of the land (bits u = 0, u = 1, v = 0, v = 1)
    public sealed class MeshGroup
    {
        public float[] Pos, Nor, Uv, Col, Edge;
        public int[] Idx;
        public int VertexCount => Pos.Length / 3;
    }

    // a group is null when it has no triangle, as in mesh.js
    public sealed class MeshOut
    {
        public MeshGroup Op, Gl, Wa, Pl; // opaque, glass (translucent), water, plants (cross sprites, sway)
    }

    public sealed class Mesher
    {
        const int AN = 16; // tiles per side of the atlas
        const int SY = World.SY, CH = World.CH;

        // ---------- block classes (mesh.js isCross, isTransp, isSolid, isOpaque), by id ----------
        static readonly bool[] cross = new bool[256], transp = new bool[256], solid = new bool[256], opaque = new bool[256];
        static BlockDef[] tableFor; // the Rules.Blocks these tables were built from
        static int tableCount = -1;

        static void Classify()
        {
            var B = Rules.Blocks;
            for (int id = 0; id < 256; id++)
            {
                var b = B[id];
                cross[id] = b != null && b.X >= 0;
                transp[id] = id == 0 || id == 11 || cross[id] || b == null || b.Leaf || b.Glass || b.Shape != null;
                solid[id] = id != 0 && id != 11 && b != null && !cross[id] && !b.Pass;
                opaque[id] = id != 0 && !transp[id];
            }
            tableFor = B;
            tableCount = Rules.BlockCount;
        }

        static void EnsureTables()
        {
            if (!Rules.Loaded) throw new InvalidOperationException("Mesher: Rules.Load(rules.json) first");
            if (tableFor != Rules.Blocks || tableCount != Rules.BlockCount) Classify();
        }

        /// <summary>Call after reloading Rules (the tables are otherwise rebuilt only when the block count changes).</summary>
        public static void RulesChanged() => Classify();

        public static bool IsCross(int id) => (uint)id < 256u && cross[id];
        public static bool IsTransp(int id) => (uint)id >= 256u || transp[id];
        public static bool IsSolid(int id) => (uint)id < 256u && solid[id];
        public static bool IsOpaque(int id) => (uint)id < 256u && opaque[id];
        public static bool IsShaped(int id) => (uint)id < 256u && Rules.Blocks[id] != null && Rules.Blocks[id].Shape != null;

        // ---------- the six faces (mesh.js FACES): normal, axis, corners, tile slot (0 top, 1 side, 2 bottom) ----------
        static readonly int[] FN = { 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1 };
        static readonly int[] FA = { 0, 0, 1, 1, 2, 2 };
        static readonly int[] FS = { 1, 1, 0, 2, 1, 1 };
        static readonly int[] FC =
        {
            1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1,
            0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0,
            0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0,
            0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1,
            1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 1,
            0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0,
        };
        static readonly double[] AOF = { 0.36, 0.58, 0.8, 1 };
        // the clay look's rounded outer edges (mesh.js ROUND, ROUND_STEPS): how far in the round starts, and the
        // steps of each quarter round (one, its normals smooth across it)
        const double ROUND = 0.18;

        static double FaceShade(int f)
        {
            int ny = FN[f * 3 + 1];
            return ny > 0 ? 1 : ny < 0 ? 0.6 : FN[f * 3] != 0 ? 0.8 : 0.9;
        }

        // the atlas rectangle of tile ti: u0, u1, v0, v1 (mesh.js uvRect)
        public static void UvRect(int ti, out double u0, out double u1, out double v0, out double v1)
        {
            int tx = ti % AN, ty = (int)Math.Floor(ti / (double)AN);
            const double e = 0.0008;
            u0 = (double)tx / AN + e;
            u1 = (double)(tx + 1) / AN - e;
            v0 = 1 - (double)(ty + 1) / AN + e;
            v1 = 1 - (double)ty / AN - e;
        }

        // ---------- shape boxes (mesh.js shapeBoxes) ----------
        static readonly double[][] STAIR_HI = { new[] { 0, 0.5, 0, 1, 1, 0.5 }, new[] { 0, 0.5, 0, 0.5, 1, 1 }, new[] { 0, 0.5, 0.5, 1, 1, 1 }, new[] { 0.5, 0.5, 0, 1, 1, 1 } };
        static readonly double[][] DOORB = { new[] { 0, 0, 0, 1, 1, 0.1875 }, new[] { 0, 0, 0, 0.1875, 1, 1 }, new[] { 0, 0, 0.8125, 1, 1, 1 }, new[] { 0.8125, 0, 0, 1, 1, 1 } };
        static readonly double[][] LADDER = { new[] { 0, 0, 0, 1, 1, 0.125 }, new[] { 0, 0, 0, 0.125, 1, 1 }, new[] { 0, 0, 0.875, 1, 1, 1 }, new[] { 0.875, 0, 0, 1, 1, 1 } };
        static readonly double[] MATTRESS = { 0.04, 0, 0.04, 0.96, 0.3, 0.96 };
        static readonly double[][] FOOTBOARD = { new[] { 0, 0, 0.86, 1, 0.32, 1 }, new[] { 0.86, 0, 0, 1, 0.32, 1 }, new[] { 0, 0, 0, 1, 0.32, 0.14 }, new[] { 0, 0, 0, 0.14, 0.32, 1 } };
        static readonly double[][] HEADBOARD = { new[] { 0, 0, 0, 1, 0.65, 0.14 }, new[] { 0, 0, 0, 0.14, 0.65, 1 }, new[] { 0, 0, 0.86, 1, 0.65, 1 }, new[] { 0.86, 0, 0, 1, 0.65, 1 } };
        static readonly double[][] PILLOW = { new[] { 0.28, 0.3, 0.16, 0.72, 0.44, 0.42 }, new[] { 0.16, 0.3, 0.28, 0.42, 0.44, 0.72 }, new[] { 0.28, 0.3, 0.58, 0.72, 0.44, 0.84 }, new[] { 0.58, 0.3, 0.28, 0.84, 0.44, 0.72 } };
        static readonly double[] TABLE0 = { 0, 0, 0, 1, 0.5, 1 }, TABLE1 = { 0.52, 0.5, 0.52, 0.82, 0.57, 0.82 }, TABLE2 = { 0.2, 0.5, 0.2, 0.32, 0.82, 0.32 };
        static readonly double[] FENCE_POST = { 0.375, 0, 0.375, 0.625, 1, 0.625 }, PANE_POST = { 0.4375, 0, 0.4375, 0.5625, 1, 0.5625 };
        static readonly double[] SLAB = { 0, 0, 0, 1, 0.5, 1 }, CABLE = { 0, 0, 0, 1, 0.03, 1 }, FULL = { 0, 0, 0, 1, 1, 1 };
        static readonly double[] LEVER_BASE = { 0.3, 0, 0.3, 0.7, 0.12, 0.7 }, LEVER_ON = { 0.54, 0.1, 0.46, 0.62, 0.58, 0.54 }, LEVER_OFF = { 0.38, 0.1, 0.46, 0.46, 0.58, 0.54 };
        static readonly double[] LEVER_GLOW = { 0.54, 0.52, 0.46, 0.62, 0.6, 0.54 };
        static readonly int[] SDX = { 1, -1, 0, 0 }, SDZ = { 0, 0, 1, -1 }; // fence/pane neighbors: +x, -x, +z, -z
        public const int MaxBoxes = 16;

        static int Put(double[] o, int n, double[] bb)
        {
            Array.Copy(bb, 0, o, n * 6, 6);
            return n + 1;
        }

        // an arm from a to b (from 0.5 toward the edge) on side c
        static int Arm(double[] o, int n, int c, double a, double b, double y0, double y1)
        {
            int k = n * 6;
            if (c == 0) { o[k] = 0.5 + a; o[k + 1] = y0; o[k + 2] = 0.5 - b; o[k + 3] = 1; o[k + 4] = y1; o[k + 5] = 0.5 + b; }
            else if (c == 1) { o[k] = 0; o[k + 1] = y0; o[k + 2] = 0.5 - b; o[k + 3] = 0.5 - a; o[k + 4] = y1; o[k + 5] = 0.5 + b; }
            else if (c == 2) { o[k] = 0.5 - b; o[k + 1] = y0; o[k + 2] = 0.5 + a; o[k + 3] = 0.5 + b; o[k + 4] = y1; o[k + 5] = 1; }
            else { o[k] = 0.5 - b; o[k + 1] = y0; o[k + 2] = 0; o[k + 3] = 0.5 + b; o[k + 4] = y1; o[k + 5] = 0.5 - a; }
            return n + 1;
        }

        /// <summary>
        /// The boxes of a shaped block at (x, y, z), written to boxes as [x0, y0, z0, x1, y1, z1] per box (block
        /// coordinates 0..1); returns how many. powered: the powered blocks (doors, plates); get (may be null):
        /// the world's blocks, to connect fences and panes. boxes needs MaxBoxes * 6 doubles.
        /// </summary>
        public static int ShapeBoxes(int id, int x, int y, int z, Func<int, int, int, bool> powered, Func<int, int, int, int> get, double[] boxes)
        {
            var b = Rules.Blocks[id];
            int n = 0;
            if (b.IsBed)
            {
                int f = b.BedFacing;
                n = Put(boxes, n, MATTRESS);
                if (!b.BedHead) return Put(boxes, n, FOOTBOARD[f]);
                n = Put(boxes, n, HEADBOARD[f]);
                return Put(boxes, n, PILLOW[f]);
            }
            switch (b.Shape)
            {
                case "table":
                    n = Put(boxes, n, TABLE0);
                    n = Put(boxes, n, TABLE1);
                    return Put(boxes, n, TABLE2);
                case "fence":
                    n = Put(boxes, n, FENCE_POST);
                    if (get != null)
                        for (int c = 0; c < 4; c++)
                        {
                            int nb = get(x + SDX[c], y, z + SDZ[c]);
                            var nbd = Rules.Block(nb);
                            if (IsOpaque(nb) || (nbd != null && nbd.Shape == "fence"))
                            {
                                n = Arm(boxes, n, c, 0.125, 0.0625, 0.375, 0.5625);
                                n = Arm(boxes, n, c, 0.125, 0.0625, 0.75, 0.9375);
                            }
                        }
                    return n;
                case "pane":
                {
                    n = Put(boxes, n, PANE_POST);
                    if (get != null)
                        for (int c = 0; c < 4; c++)
                        {
                            int nb = get(x + SDX[c], y, z + SDZ[c]);
                            var nbd = Rules.Block(nb);
                            if (IsOpaque(nb) || (nbd != null && (nbd.Shape == "pane" || nbd.Glass))) n = Arm(boxes, n, c, 0.0625, 0.0625, 0, 1);
                        }
                    if (n == 1) // alone: a straight pane
                    {
                        n = Arm(boxes, n, 0, 0.0625, 0.0625, 0, 1);
                        n = Arm(boxes, n, 1, 0.0625, 0.0625, 0, 1);
                    }
                    return n;
                }
                case "ladder":
                    return Put(boxes, n, LADDER[b.O]);
                case "slab":
                    return Put(boxes, n, SLAB);
                case "stairs":
                    n = Put(boxes, n, SLAB);
                    return Put(boxes, n, STAIR_HI[b.O]);
                case "door":
                {
                    bool open = b.Open || powered(x, y, z);
                    return Put(boxes, n, DOORB[open ? (b.F + 1) % 4 : b.F]);
                }
                case "plate":
                {
                    // a pressure plate (66) stands proud of the floor; a lily pad (77) stays a flat film
                    double hi = id == 66 ? 0.16 : 0.06;
                    int k = 0;
                    boxes[k] = 0.06; boxes[k + 1] = 0; boxes[k + 2] = 0.06; boxes[k + 3] = 0.94; boxes[k + 4] = powered(x, y, z) ? hi * 0.5 : hi; boxes[k + 5] = 0.94;
                    return 1;
                }
                case "cable":
                    return Put(boxes, n, CABLE);
                case "furn":
                    for (int k = 0; k < b.Boxes.Length; k++) n = Put(boxes, n, b.Boxes[k]);
                    return n;
                case "lever":
                    n = Put(boxes, n, LEVER_BASE);
                    return Put(boxes, n, b.On ? LEVER_ON : LEVER_OFF);
                default:
                    return Put(boxes, n, FULL);
            }
        }

        // ---------- growable output buffers ----------
        sealed class Buf
        {
            public float[] pos = new float[3 * 1024], nor = new float[3 * 1024], uv = new float[2 * 1024], col, edge;
            public int[] idx = new int[6 * 256];
            public int nv, ni;
            readonly bool hasCol;
            public Buf(bool hasCol)
            {
                this.hasCol = hasCol;
                if (hasCol) { col = new float[3 * 1024]; edge = new float[1024]; }
            }
            public void Clear() { nv = 0; ni = 0; }
            public void Reserve4()
            {
                if ((nv + 4) * 3 > pos.Length)
                {
                    int cap = pos.Length * 2;
                    Array.Resize(ref pos, cap);
                    Array.Resize(ref nor, cap);
                    Array.Resize(ref uv, cap / 3 * 2);
                    if (hasCol) { Array.Resize(ref col, cap); Array.Resize(ref edge, cap / 3); }
                }
                if (ni + 6 > idx.Length) Array.Resize(ref idx, idx.Length * 2);
            }
            public MeshGroup Pack()
            {
                if (nv == 0) return null;
                var g = new MeshGroup { Pos = new float[nv * 3], Nor = new float[nv * 3], Uv = new float[nv * 2], Idx = new int[ni] };
                Array.Copy(pos, g.Pos, nv * 3);
                Array.Copy(nor, g.Nor, nv * 3);
                Array.Copy(uv, g.Uv, nv * 2);
                Array.Copy(idx, g.Idx, ni);
                if (hasCol)
                {
                    g.Col = new float[nv * 3];
                    Array.Copy(col, g.Col, nv * 3);
                    g.Edge = new float[nv];
                    Array.Copy(edge, g.Edge, nv);
                }
                return g;
            }
        }

        readonly Buf op = new Buf(true), gl = new Buf(true), wa = new Buf(false), pl = new Buf(false);
        readonly byte[] arr = new byte[World.CV];
        readonly double[] boxes = new double[MaxBoxes * 6];
        // one quad being built: 4 corners
        readonly double[] qp = new double[12], quv = new double[8], qc = new double[4];

        // pushQ: appends a quad (qp, quv, qc) with face f's normal (or nx, ny, nz) to G
        void PushQ(Buf G, double nx, double ny, double nz, double sh, bool cols, bool flip, int edge = 0)
        {
            G.Reserve4();
            int b = G.nv;
            for (int k = 0; k < 4; k++)
            {
                int v = G.nv++;
                G.pos[v * 3] = (float)qp[k * 3];
                G.pos[v * 3 + 1] = (float)qp[k * 3 + 1];
                G.pos[v * 3 + 2] = (float)qp[k * 3 + 2];
                G.nor[v * 3] = (float)nx;
                G.nor[v * 3 + 1] = (float)ny;
                G.nor[v * 3 + 2] = (float)nz;
                G.uv[v * 2] = (float)quv[k * 2];
                G.uv[v * 2 + 1] = (float)quv[k * 2 + 1];
                if (cols)
                {
                    float c = (float)(qc[k] * sh);
                    G.col[v * 3] = c;
                    G.col[v * 3 + 1] = c;
                    G.col[v * 3 + 2] = c;
                    G.edge[v] = edge;
                }
            }
            var ix = G.idx;
            int i = G.ni;
            if (flip) { ix[i] = b + 1; ix[i + 1] = b + 2; ix[i + 2] = b + 3; ix[i + 3] = b + 1; ix[i + 4] = b + 3; ix[i + 5] = b; }
            else { ix[i] = b; ix[i + 1] = b + 1; ix[i + 2] = b + 2; ix[i + 3] = b; ix[i + 4] = b + 2; ix[i + 5] = b + 3; }
            G.ni += 6;
        }

        // an arbitrary box within a block (slab, stair, door…): faces hidden only against an opaque block
        void EmitBox(Buf G, int x, int y, int z, double[] bx, int bo, int[] tt, int big, Func<int, int, int, int> get)
        {
            double x0 = bx[bo], y0 = bx[bo + 1], z0 = bx[bo + 2], x1 = bx[bo + 3], y1 = bx[bo + 4], z1 = bx[bo + 5];
            int thin = x1 - x0 < 0.3 ? 0 : z1 - z0 < 0.3 ? 2 : -1;
            for (int f = 0; f < 6; f++)
            {
                int fx = FN[f * 3], fy = FN[f * 3 + 1], fz = FN[f * 3 + 2], fa = FA[f];
                bool edge = (fx > 0 && x1 == 1) || (fx < 0 && x0 == 0) || (fy > 0 && y1 == 1) || (fy < 0 && y0 == 0) || (fz > 0 && z1 == 1) || (fz < 0 && z0 == 0);
                if (edge && IsOpaque(get(x + fx, y + fy, z + fz))) continue;
                UvRect(big >= 0 && fa == thin ? big : tt[FS[f]], out double u0, out double u1, out double v0, out double v1);
                for (int k = 0; k < 4; k++)
                {
                    int ci = f * 12 + k * 3;
                    double px = FC[ci] != 0 ? x1 : x0, py = FC[ci + 1] != 0 ? y1 : y0, pz = FC[ci + 2] != 0 ? z1 : z0;
                    qp[k * 3] = x + px;
                    qp[k * 3 + 1] = y + py;
                    qp[k * 3 + 2] = z + pz;
                    double uu, vv;
                    if (fa == 1) { uu = px; vv = pz; }
                    else if (fa == 0) { uu = fx > 0 ? 1 - pz : pz; vv = py; }
                    else { uu = fz > 0 ? px : 1 - px; vv = py; }
                    quv[k * 2] = u0 + (u1 - u0) * uu;
                    quv[k * 2 + 1] = v0 + (v1 - v0) * vv;
                    qc[k] = 1;
                }
                PushQ(G, fx, fy, fz, FaceShade(f), true, false);
            }
        }

        static readonly int[] TILE10 = { 10, 10, 10 }, TILE125 = { 125, 125, 125 }, TILE126 = { 126, 126, 126 }, TILE127 = { 127, 127, 127 };
        static readonly int[] TILE43 = { 43, 43, 43 }, TILE44 = { 44, 44, 44 }, TILE46 = { 46, 46, 46 };

        /// <summary>
        /// Meshes chunk (cx, cz). get(x, y, z): the world's block at world coordinates (0 where unknown);
        /// powered(x, y, z): whether that block is powered (doors, plates, cables, lamps, gates).
        /// </summary>
        public MeshOut MeshChunk(int cx, int cz, Func<int, int, int, int> get, Func<int, int, int, bool> powered)
        {
            EnsureTables();
            var B = Rules.Blocks;
            int ox = cx * CH, oz = cz * CH;
            for (int y = 0; y < SY; y++)
                for (int z = 0; z < CH; z++)
                    for (int x = 0; x < CH; x++) arr[World.Li(x, y, z)] = (byte)get(ox + x, y, oz + z);
            op.Clear();
            gl.Clear();
            wa.Clear();
            pl.Clear();
            for (int y = 0; y < SY; y++)
                for (int z = oz; z < oz + CH; z++)
                    for (int x = ox; x < ox + CH; x++)
                    {
                        int id = arr[World.Li(x - ox, y, z - oz)];
                        if (id == 0) continue;
                        var b = B[id];
                        if (b == null) continue;
                        if (b.X >= 0) { Cross(x, y, z, b.X); continue; }
                        if (b.Water) { Water(x, y, z, get); continue; }
                        if (b.Shape != null) { Shaped(id, b, x, y, z, get, powered); continue; }
                        Cube(id, b, x, y, z, get, powered);
                    }
            return new MeshOut { Op = op.Pack(), Gl = gl.Pack(), Wa = wa.Pack(), Pl = pl.Pack() };
        }

        /// <summary>Same, with powered given by block key "x,y,z" (POWERED.has(key) in the web version).</summary>
        public MeshOut MeshChunk(int cx, int cz, Func<int, int, int, int> get, Func<string, bool> powered) =>
            MeshChunk(cx, cz, get, (x, y, z) => powered(x + "," + y + "," + z));

        // two crossed quads (flowers, grass), into the plants group
        void Cross(int x, int y, int z, int tile)
        {
            UvRect(tile, out double u0, out double u1, out double v0, out double v1);
            const double o = 0.15;
            for (int q = 0; q < 2; q++)
            {
                double p0 = q == 0 ? x + o : x + 1 - o, p1 = z + o, q0 = q == 0 ? x + 1 - o : x + o, q1 = z + 1 - o;
                qp[0] = p0; qp[1] = y; qp[2] = p1;
                qp[3] = p0; qp[4] = y + 0.999; qp[5] = p1; // top vertices barely lower: the shader sways them
                qp[6] = q0; qp[7] = y + 0.999; qp[8] = q1;
                qp[9] = q0; qp[10] = y; qp[11] = q1;
                quv[0] = u0; quv[1] = v0; quv[2] = u0; quv[3] = v1; quv[4] = u1; quv[5] = v1; quv[6] = u1; quv[7] = v0;
                PushQ(pl, 0, 1, 0, 1, false, false);
            }
        }

        void Water(int x, int y, int z, Func<int, int, int, int> get)
        {
            for (int f = 0; f < 6; f++)
            {
                int fx = FN[f * 3], fy = FN[f * 3 + 1], fz = FN[f * 3 + 2], fa = FA[f];
                int nb = get(x + fx, y + fy, z + fz);
                if (nb == 11 || (IsSolid(nb) && !Rules.Blocks[nb].Leaf && !Rules.Blocks[nb].Glass)) continue;
                if (fy < 0) continue;
                double top = get(x, y + 1, z) != 11 ? 0.86 : 1;
                for (int k = 0; k < 4; k++)
                {
                    int ci = f * 12 + k * 3;
                    double px = x + FC[ci], py = y + (FC[ci + 1] != 0 ? top : 0), pz = z + FC[ci + 2];
                    qp[k * 3] = px;
                    qp[k * 3 + 1] = py;
                    qp[k * 3 + 2] = pz;
                    if (fa == 1) { quv[k * 2] = px * 0.25; quv[k * 2 + 1] = pz * 0.25; }
                    else if (fa == 0) { quv[k * 2] = pz * 0.25; quv[k * 2 + 1] = py * 0.25; }
                    else { quv[k * 2] = px * 0.25; quv[k * 2 + 1] = py * 0.25; }
                }
                PushQ(wa, fx, fy, fz, 1, false, false);
            }
        }

        void Shaped(int id, BlockDef b, int x, int y, int z, Func<int, int, int, int> get, Func<int, int, int, bool> powered)
        {
            bool cable = b.Shape == "cable", lever = b.Shape == "lever", table = b.Shape == "table", bed = b.IsBed;
            bool on = cable && powered(x, y, z);
            int n = ShapeBoxes(id, x, y, z, powered, get, boxes);
            var G = b.Shape == "pane" ? gl : op; // pane: translucent glass
            int big = b.Shape == "door" ? (b.Top ? 40 : 39) : -1;
            for (int bi = 0; bi < n; bi++)
            {
                int[] tt;
                if (cable) tt = on ? TILE44 : TILE43;
                else if (lever && bi == 1) tt = TILE10;
                else if (table && bi == 1) tt = TILE127;
                else if (table && bi == 2) tt = TILE126;
                else if (bed && bi == 1) tt = TILE10;
                else if (bed && bi == 2) tt = TILE125;
                else tt = b.Bt != null && bi < b.Bt.Length && b.Bt[bi] != null ? b.Bt[bi] : b.T;
                EmitBox(G, x, y, z, boxes, bi * 6, tt, big, get);
            }
            if (lever && b.On) EmitBox(op, x, y, z, LEVER_GLOW, 0, TILE46, -1, get);
        }

        void Cube(int id, BlockDef b, int x, int y, int z, Func<int, int, int, int> get, Func<int, int, int, bool> powered)
        {
            var G = b.Glass ? gl : op;
            bool lit = (id == 68 || b.TOn != null) && powered(x, y, z); // lamp lit, logic gate active
            for (int f = 0; f < 6; f++)
            {
                int fx = FN[f * 3], fy = FN[f * 3 + 1], fz = FN[f * 3 + 2], fa = FA[f];
                int nx = x + fx, ny = y + fy, nz = z + fz;
                int nb = get(nx, ny, nz);
                if (ny < 0) continue;
                if (IsOpaque(nb)) continue;
                if (nb == id && (b.Leaf || b.Glass)) continue;
                int tile = lit ? (b.TOn != null ? b.TOn[FS[f]] : 46) : b.T[FS[f]];
                UvRect(tile, out double u0, out double u1, out double v0, out double v1);
                int u = (fa + 1) % 3, w = (fa + 2) % 3;
                int a0 = 0, a1 = 0, a2 = 0, a3 = 0;
                for (int k = 0; k < 4; k++)
                {
                    int ci = f * 12 + k * 3;
                    int c0 = FC[ci], c1 = FC[ci + 1], c2 = FC[ci + 2];
                    int du = (u == 0 ? c0 : u == 1 ? c1 : c2) != 0 ? 1 : -1;
                    int dw = (w == 0 ? c0 : w == 1 ? c1 : c2) != 0 ? 1 : -1;
                    // p1 = p + du along u, p2 = p + dw along w, p3 = p1 + dw along w
                    int p1x = nx + (u == 0 ? du : 0), p1y = ny + (u == 1 ? du : 0), p1z = nz + (u == 2 ? du : 0);
                    int p2x = nx + (w == 0 ? dw : 0), p2y = ny + (w == 1 ? dw : 0), p2z = nz + (w == 2 ? dw : 0);
                    int p3x = p1x + (w == 0 ? dw : 0), p3y = p1y + (w == 1 ? dw : 0), p3z = p1z + (w == 2 ? dw : 0);
                    int s1 = IsOpaque(get(p1x, p1y, p1z)) ? 1 : 0, s2 = IsOpaque(get(p2x, p2y, p2z)) ? 1 : 0, s3 = IsOpaque(get(p3x, p3y, p3z)) ? 1 : 0;
                    int ao = s1 != 0 && s2 != 0 ? 0 : 3 - (s1 + s2 + s3);
                    if (k == 0) a0 = ao; else if (k == 1) a1 = ao; else if (k == 2) a2 = ao; else a3 = ao;
                    qc[k] = AOF[ao];
                    qp[k * 3] = x + c0;
                    qp[k * 3 + 1] = y + c1;
                    qp[k * 3 + 2] = z + c2;
                    double uu, vv;
                    if (fa == 1) { uu = c0; vv = c2; }
                    else if (fa == 0) { uu = fx > 0 ? 1 - c2 : c2; vv = c1; }
                    else { uu = fz > 0 ? c0 : 1 - c0; vv = c1; }
                    quv[k * 2] = u0 + (u1 - u0) * uu;
                    quv[k * 2 + 1] = v0 + (v1 - v0) * vv;
                    fuu[k] = uu; fvv[k] = vv;
                }
                // the face's sides that are an outer edge (mesh.js): where the block beside it along that side lets
                // the face end in the open; leaves go on into leaves
                // (exactly where the block's face on that side is drawn too: the two meet around the edge)
                // only where the land ends in the open air (nothing, or a plant), and the block beyond it in front
                // of the face is open too (mesh.js side)
                rx = x; ry = y; rz = z; rGet = get;
                bool front = OpenAt(x + fx, y + fy, z + fz); // the face itself in the open (not behind glass, water, leaves)
                int Side(int dx, int dy, int dz) => front && OpenAt(x + dx, y + dy, z + dz) && OpenAt(x + dx + fx, y + dy + fy, z + dz + fz) ? 1 : 0;
                int edge;
                if (fa == 1) edge = Side(-1, 0, 0) | (Side(1, 0, 0) << 1) | (Side(0, 0, -1) << 2) | (Side(0, 0, 1) << 3);
                else if (fa == 0) edge = (fx > 0 ? Side(0, 0, 1) | (Side(0, 0, -1) << 1) : Side(0, 0, -1) | (Side(0, 0, 1) << 1)) | (Side(0, -1, 0) << 2) | (Side(0, 1, 0) << 3);
                else edge = (fz > 0 ? Side(-1, 0, 0) | (Side(1, 0, 0) << 1) : Side(1, 0, 0) | (Side(-1, 0, 0) << 1)) | (Side(0, -1, 0) << 2) | (Side(0, 1, 0) << 3);
                // the inner corners (mesh.js): both blocks beside it along a corner's sides round their edge toward
                // the open block across the corner
                int inner = 0;
                if (front && G == op && !b.Leaf)
                {
                    int k00 = 0, k10 = 0, k01 = 0;
                    for (int k = 0; k < 4; k++) { if (fuu[k] == 0 && fvv[k] == 0) k00 = k; if (fuu[k] == 1 && fvv[k] == 0) k10 = k; if (fuu[k] == 0 && fvv[k] == 1) k01 = k; }
                    int U0 = I(qp[k10 * 3] - qp[k00 * 3]), U1 = I(qp[k10 * 3 + 1] - qp[k00 * 3 + 1]), U2 = I(qp[k10 * 3 + 2] - qp[k00 * 3 + 2]);
                    int V0 = I(qp[k01 * 3] - qp[k00 * 3]), V1 = I(qp[k01 * 3 + 1] - qp[k00 * 3 + 1]), V2 = I(qp[k01 * 3 + 2] - qp[k00 * 3 + 2]);
                    bool O(int dx, int dy, int dz) => OpenAt(x + dx, y + dy, z + dz);
                    bool Rn(int dx, int dy, int dz) => Rounds(get(x + dx, y + dy, z + dz));
                    int InnerAt(int su, int sv)
                    {
                        int a0x = su * U0, a0y = su * U1, a0z = su * U2, c0x = sv * V0, c0y = sv * V1, c0z = sv * V2;
                        int X0 = a0x + c0x, X1 = a0y + c0y, X2 = a0z + c0z;
                        return Rn(a0x, a0y, a0z) && Rn(c0x, c0y, c0z) && O(X0, X1, X2) && O(X0 + fx, X1 + fy, X2 + fz) && O(a0x + fx, a0y + fy, a0z + fz) && O(c0x + fx, c0y + fy, c0z + fz) ? 1 : 0;
                    }
                    inner = InnerAt(-1, -1) | (InnerAt(1, -1) << 1) | (InnerAt(1, 1) << 2) | (InnerAt(-1, 1) << 3);
                }
                rWrap = (id == 1 || id == 16) && fy == 0;
                if (rWrap) UvRect(b.T[0], out rW0, out rW1, out rW2, out rW3);
                if ((edge != 0 || inner != 0) && G == op && !b.Leaf) Rounded(G, fx, fy, fz, edge, u0, u1, v0, v1, a0 + a2 < a1 + a3, inner);
                else PushQ(G, fx, fy, fz, FaceShade(f), true, a0 + a2 < a1 + a3, 0); // not rounded (leaves, glass): no edge bits
            }
        }

        // ---------- a full block's face with rounded outer edges (mesh.js rounded, the same steps exactly) ----------
        // the face shrinks by ROUND on each outer side; a quarter round reaches from there to the half-way line
        // around the edge, where the next face's own meets it; a corner of a sphere where two outer sides meet.
        // Points: the round's centre (ROUND inside) plus ROUND along normalize(n + a·u + b·v), a and b going
        // 0 → 1. Normals follow the round, the baked shade follows the normal, the AO the corners.
        // Reads the quad in qp / quv's face coordinates (fuu, fvv) and the corners' AO in qc.
        readonly double[] fuu = new double[4], fvv = new double[4];
        static readonly double[] A3 = { 0, 1 };
        int rx, ry, rz;
        Func<int, int, int, int> rGet;
        // open air for the rounds (mesh.js openAt): nothing there, or a plant
        bool OpenAt(int qx, int qy, int qz) { if (qy < 0) return false; int o = rGet(qx, qy, qz); return o == 0 || IsCross(o); }
        // a full block the clay look rounds (mesh.js rounds): not glass, water, plants, shapes nor leaves
        static bool Rounds(int id)
        {
            if (id == 0 || id == 11 || IsCross(id)) return false;
            var d = Rules.Block(id);
            return d != null && d.Shape == null && !d.Glass && !d.Leaf;
        }
        static int I(double v) => (int)Math.Round(v);
        // where a round ends against the block beside (D), a cap closes it, unless that block rounds the same edge (W) (mesh.js needCap)
        bool NeedCap(int w0, int w1, int w2, int d0, int d1, int d2)
        {
            int bx = rx + d0, by = ry + d1, bz = rz + d2;
            if (by < 0 || OpenAt(bx, by, bz)) return false;
            int bid = rGet(bx, by, bz);
            int n0 = I(rN0), n1 = I(rN1), n2 = I(rN2);
            bool goesOn = Rounds(bid) && OpenAt(bx + n0, by + n1, bz + n2) && OpenAt(bx + w0, by + w1, bz + w2) && OpenAt(bx + w0 + n0, by + w1 + n1, bz + w2 + n2);
            return !goesOn;
        }
        void Tri(int b0, double dx, double dy, double dz)
        {
            double e10 = rp[3] - rp[0], e11 = rp[4] - rp[1], e12 = rp[5] - rp[2];
            double e20 = rp[6] - rp[0], e21 = rp[7] - rp[1], e22 = rp[8] - rp[2];
            double cx = e11 * e22 - e12 * e21, cy = e12 * e20 - e10 * e22, cz = e10 * e21 - e11 * e20;
            var G = rG;
            if (G.ni + 3 > G.idx.Length) Array.Resize(ref G.idx, G.idx.Length * 2);
            var ix = G.idx; int i = G.ni;
            if (cx * dx + cy * dy + cz * dz >= 0) { ix[i] = b0; ix[i + 1] = b0 + 1; ix[i + 2] = b0 + 2; }
            else { ix[i] = b0; ix[i + 1] = b0 + 2; ix[i + 2] = b0 + 1; }
            G.ni += 3;
        }
        double rO0, rO1, rO2, rU0, rU1, rU2, rV0, rV1, rV2, rN0, rN1, rN2, rT0, rT1, rT2, rT3;
        int rEdge;
        Buf rG;
        readonly double[] rp = new double[12];
        int rk;

        void At(double uu, double vv, out double px, out double py, out double pz)
        {
            px = rO0 + rU0 * uu + rV0 * vv; py = rO1 + rU1 * uu + rV1 * vv; pz = rO2 + rU2 * uu + rV2 * vv;
        }
        double AoAt(double uu, double vv)
        {
            double s = 0;
            for (int k = 0; k < 4; k++) s += qc[k] * (fuu[k] != 0 ? uu : 1 - uu) * (fvv[k] != 0 ? vv : 1 - vv);
            return s;
        }
        static void Norm(double x, double y, double z, out double ox, out double oy, out double oz)
        {
            double l = Math.Sqrt(x * x + y * y + z * z);
            ox = x / l; oy = y / l; oz = z / l;
        }
        // the tile a vertex takes (the face's, or the top's grass carried over the edge: mesh.js tl, ctl)
        double vT0, vT1, vT2, vT3;
        bool rWrap;
        double rW0, rW1, rW2, rW3;
        void UseTile(bool wrap) { if (wrap) { vT0 = rW0; vT1 = rW1; vT2 = rW2; vT3 = rW3; } else { vT0 = rT0; vT1 = rT1; vT2 = rT2; vT3 = rT3; } }
        static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;
        void Vert(double px, double py, double pz, double dx, double dy, double dz, double uu, double vv)
        {
            uu = Clamp01(uu); vv = Clamp01(vv);
            var G = rG;
            G.Reserve4();
            int v = G.nv++;
            G.pos[v * 3] = (float)px; G.pos[v * 3 + 1] = (float)py; G.pos[v * 3 + 2] = (float)pz;
            G.nor[v * 3] = (float)dx; G.nor[v * 3 + 1] = (float)dy; G.nor[v * 3 + 2] = (float)dz;
            G.uv[v * 2] = (float)(vT0 + (vT1 - vT0) * uu);
            G.uv[v * 2 + 1] = (float)(vT2 + (vT3 - vT2) * vv);
            float c = (float)(AoAt(uu, vv) * (dx * dx * 0.8 + dz * dz * 0.9 + dy * dy * (dy > 0 ? 1 : 0.6)));
            G.col[v * 3] = c; G.col[v * 3 + 1] = c; G.col[v * 3 + 2] = c;
            G.edge[v] = rEdge;
            rp[rk * 3] = px; rp[rk * 3 + 1] = py; rp[rk * 3 + 2] = pz;
            rk++;
        }
        // the four vertices just made, as a quad turned to face outward along d
        void Quad(int b0, double dx, double dy, double dz)
        {
            double e10 = rp[3] - rp[0], e11 = rp[4] - rp[1], e12 = rp[5] - rp[2];
            double e20 = rp[6] - rp[0], e21 = rp[7] - rp[1], e22 = rp[8] - rp[2];
            double cx = e11 * e22 - e12 * e21, cy = e12 * e20 - e10 * e22, cz = e10 * e21 - e11 * e20;
            var G = rG;
            if (G.ni + 6 > G.idx.Length) Array.Resize(ref G.idx, G.idx.Length * 2);
            var ix = G.idx; int i = G.ni;
            if (cx * dx + cy * dy + cz * dz >= 0) { ix[i] = b0; ix[i + 1] = b0 + 1; ix[i + 2] = b0 + 2; ix[i + 3] = b0; ix[i + 4] = b0 + 2; ix[i + 5] = b0 + 3; }
            else { ix[i] = b0; ix[i + 1] = b0 + 2; ix[i + 2] = b0 + 1; ix[i + 3] = b0; ix[i + 4] = b0 + 3; ix[i + 5] = b0 + 2; }
            G.ni += 6;
        }

        void Rounded(Buf G, double n0, double n1, double n2, int edge, double u0, double u1, double v0, double v1, bool flip, int inner)
        {
            const double r = ROUND;
            rG = G; rEdge = edge; rN0 = n0; rN1 = n1; rN2 = n2; rT0 = u0; rT1 = u1; rT2 = v0; rT3 = v1;
            UseTile(false);
            double pu0 = 0, pu1 = 0, pu2 = 0, pv0 = 0, pv1 = 0, pv2 = 0;
            for (int k = 0; k < 4; k++)
            {
                if (fuu[k] == 0 && fvv[k] == 0) { rO0 = qp[k * 3]; rO1 = qp[k * 3 + 1]; rO2 = qp[k * 3 + 2]; }
                else if (fuu[k] == 1 && fvv[k] == 0) { pu0 = qp[k * 3]; pu1 = qp[k * 3 + 1]; pu2 = qp[k * 3 + 2]; }
                else if (fuu[k] == 0 && fvv[k] == 1) { pv0 = qp[k * 3]; pv1 = qp[k * 3 + 1]; pv2 = qp[k * 3 + 2]; }
            }
            rU0 = pu0 - rO0; rU1 = pu1 - rO1; rU2 = pu2 - rO2;
            rV0 = pv0 - rO0; rV1 = pv1 - rO1; rV2 = pv2 - rO2;
            int ou0 = edge & 1, ou1 = (edge >> 1) & 1, ov0 = (edge >> 2) & 1, ov1 = (edge >> 3) & 1;
            double iu0 = ou0 != 0 ? r : 0, iu1 = ou1 != 0 ? 1 - r : 1, iv0 = ov0 != 0 ? r : 0, iv1 = ov1 != 0 ? 1 - r : 1;
            // the flat middle, its corners in the face's own order (its AO split stays the face's); with inner corners
            // (mesh.js), the grid of its pieces without those corners' squares
            int n00 = inner & 1, n10 = (inner >> 1) & 1, n11 = (inner >> 2) & 1, n01 = (inner >> 3) & 1;
            if (inner == 0) CoreQuad(iu0, iu1, iv0, iv1, flip, false);
            else
            {
                var ub = new List<double> { iu0 }; var vb = new List<double> { iv0 };
                if (n00 != 0 || n01 != 0) ub.Add(r);
                if (n10 != 0 || n11 != 0) ub.Add(1 - r);
                ub.Add(iu1);
                if (n00 != 0 || n10 != 0) vb.Add(r);
                if (n01 != 0 || n11 != 0) vb.Add(1 - r);
                vb.Add(iv1);
                for (int i = 0; i < ub.Count - 1; i++)
                    for (int j = 0; j < vb.Count - 1; j++)
                    {
                        double cu0 = ub[i], cu1 = ub[i + 1], cv0 = vb[j], cv1 = vb[j + 1];
                        if ((n00 != 0 && cu1 <= r && cv1 <= r) || (n10 != 0 && cu0 >= 1 - r && cv1 <= r) || (n11 != 0 && cu0 >= 1 - r && cv0 >= 1 - r) || (n01 != 0 && cu1 <= r && cv0 >= 1 - r)) continue;
                        CoreQuad(cu0, cu1, cv0, cv1, false, true);
                    }
            }
            // a corner rounded only if the block across it is open too; else the two rounds run on to the end
            bool COpen(int su, int sv) => OpenAt(rx + I(su * rU0 + sv * rV0), ry + I(su * rU1 + sv * rV1), rz + I(su * rU2 + sv * rV2));
            bool c00 = ou0 != 0 && ov0 != 0 && COpen(-1, -1), c10 = ou1 != 0 && ov0 != 0 && COpen(1, -1),
                 c11 = ou1 != 0 && ov1 != 0 && COpen(1, 1), c01 = ou0 != 0 && ov1 != 0 && COpen(-1, 1);
            if (ou0 != 0) Strip(true, -1, ov0 != 0, ov1 != 0, c00, c01);
            if (ou1 != 0) Strip(true, 1, ov0 != 0, ov1 != 0, c10, c11);
            if (ov0 != 0) Strip(false, -1, ou0 != 0, ou1 != 0, c00, c10);
            if (ov1 != 0) Strip(false, 1, ou0 != 0, ou1 != 0, c01, c11);
            if (c00) Corner(-1, -1);
            if (c10) Corner(1, -1);
            if (c11) Corner(1, 1);
            if (c01) Corner(-1, 1);
        }

        // one flat piece of the face: its corners in the face's order; the AO split the face's, or its own AO's
        void CoreQuad(double cu0, double cu1, double cv0, double cv1, bool flip, bool ownSplit)
        {
            var G = rG;
            int b0 = G.nv;
            rk = 0;
            double q0 = 0, q1 = 0, q2 = 0, q3 = 0;
            for (int k = 0; k < 4; k++)
            {
                double uu = fuu[k] != 0 ? cu1 : cu0, vv = fvv[k] != 0 ? cv1 : cv0;
                At(uu, vv, out double px, out double py, out double pz);
                Vert(px, py, pz, rN0, rN1, rN2, uu, vv);
                double a = AoAt(uu, vv);
                if (k == 0) q0 = a; else if (k == 1) q1 = a; else if (k == 2) q2 = a; else q3 = a;
            }
            if (ownSplit) flip = q0 + q2 < q1 + q3;
            if (G.ni + 6 > G.idx.Length) Array.Resize(ref G.idx, G.idx.Length * 2);
            var ix = G.idx; int i = G.ni;
            if (flip) { ix[i] = b0 + 1; ix[i + 1] = b0 + 2; ix[i + 2] = b0 + 3; ix[i + 3] = b0 + 1; ix[i + 4] = b0 + 3; ix[i + 5] = b0; }
            else { ix[i] = b0; ix[i + 1] = b0 + 1; ix[i + 2] = b0 + 2; ix[i + 3] = b0; ix[i + 4] = b0 + 2; ix[i + 5] = b0 + 3; }
            G.ni += 6;
        }

        // a round along one side (mesh.js strip): s = ±1 the side's direction along W (U or V), running along T;
        // each end the corner of a sphere (0), a mitre with this face's other round (1), a mitre with the face
        // around the edge's round (2), or the face's end, capped where the block beside doesn't round on (3)
        double sW0, sW1, sW2, sT0, sT1, sT2;
        int Kind(int k, bool oEnd, bool cEnd)
        {
            if (cEnd) return 0;
            if (oEnd) return 1;
            int D0 = I(k * sT0), D1 = I(k * sT1), D2 = I(k * sT2);
            if (OpenAt(rx + D0, ry + D1, rz + D2)) return OpenAt(rx + D0 + I(sW0), ry + D1 + I(sW1), rz + D2 + I(sW2)) ? 2 : 3;
            // the block beside is there: the land may turn inward, the round going on around the inner corner, on
            // the next block over in the face's plane (4) or on the block standing in front (5)
            int c10 = D0 + I(sW0), c11 = D1 + I(sW1), c12 = D2 + I(sW2);
            int c20 = D0 + I(rN0), c21 = D1 + I(rN1), c22 = D2 + I(rN2);
            if (Rounds(rGet(rx + c10, ry + c11, rz + c12)) && OpenAt(rx + c10 + I(rN0), ry + c11 + I(rN1), rz + c12 + I(rN2))) return 4;
            if (Rounds(rGet(rx + c20, ry + c21, rz + c22)) && OpenAt(rx + c20 + I(sW0), ry + c21 + I(sW1), rz + c22 + I(sW2))) return 5;
            return 3;
        }
        double EndT(int k, int kd, double d0, double d1, double d2)
        {
            const double r = ROUND;
            double m = kd == 0 ? r : kd == 1 ? r - r * (d0 * sW0 + d1 * sW1 + d2 * sW2)
                : kd == 2 || kd == 5 ? r - r * (d0 * rN0 + d1 * rN1 + d2 * rN2) : kd == 4 ? r - r * (d0 * sW0 + d1 * sW1 + d2 * sW2) : 0;
            if (kd >= 4) return k < 0 ? -m : 1 + m; // an inner corner's mitre lies beyond the face's end
            return k < 0 ? m : 1 - m;
        }
        void StripPoint(bool alongU, int s, double a, double t, double w0, double w1, double w2, out double p0, out double p1, out double p2)
        {
            const double r = ROUND;
            double ci0, ci1, ci2;
            if (alongU) At(s > 0 ? 1 - r : r, t, out ci0, out ci1, out ci2);
            else At(t, s > 0 ? 1 - r : r, out ci0, out ci1, out ci2);
            Norm(rN0 + s * a * w0, rN1 + s * a * w1, rN2 + s * a * w2, out double d0, out double d1, out double d2);
            p0 = ci0 - rN0 * r + d0 * r; p1 = ci1 - rN1 * r + d1 * r; p2 = ci2 - rN2 * r + d2 * r;
        }
        void Strip(bool alongU, int s, bool oEnd0, bool oEnd1, bool cEnd0, bool cEnd1)
        {
            const double r = ROUND;
            double w0 = alongU ? rU0 : rV0, w1 = alongU ? rU1 : rV1, w2 = alongU ? rU2 : rV2;
            sT0 = alongU ? rV0 : rU0; sT1 = alongU ? rV1 : rU1; sT2 = alongU ? rV2 : rU2;
            sW0 = s * w0; sW1 = s * w1; sW2 = s * w2;
            int k0 = Kind(-1, oEnd0, cEnd0), k1 = Kind(1, oEnd1, cEnd1);
            UseTile(rWrap && sW1 > 0); // the top's grass carried over the edge, on the side faces' rounds toward the sky
            for (int i = 0; i < A3.Length - 1; i++)
            {
                double a0 = A3[i], a1 = A3[i + 1];
                int b0 = rG.nv;
                rk = 0;
                for (int q = 0; q < 4; q++)
                {
                    double a = q == 0 || q == 3 ? a0 : a1;
                    int k = q < 2 ? -1 : 1, kd = q < 2 ? k0 : k1;
                    Norm(rN0 + s * a * w0, rN1 + s * a * w1, rN2 + s * a * w2, out double d0, out double d1, out double d2);
                    double t = EndT(k, kd, d0, d1, d2);
                    double e = s > 0 ? 1 - r + r * a : r - r * a;
                    StripPoint(alongU, s, a, t, w0, w1, w2, out double p0, out double p1, out double p2);
                    Vert(p0, p1, p2, d0, d1, d2, alongU ? e : t, alongU ? t : e);
                }
                Norm(rN0 + s * w0, rN1 + s * w1, rN2 + s * w2, out double m0, out double m1, out double m2);
                Quad(b0, m0, m1, m2);
            }
            // a plain end against a block that doesn't round the edge on: a cap from the sharp edge to the round
            for (int end = 0; end < 2; end++)
            {
                int k = end == 0 ? -1 : 1, kd = end == 0 ? k0 : k1;
                if (kd != 3 || !NeedCap(I(sW0), I(sW1), I(sW2), I(k * sT0), I(k * sT1), I(k * sT2))) continue;
                double t = k < 0 ? 0 : 1;
                double dn0 = -k * sT0, dn1 = -k * sT1, dn2 = -k * sT2;
                int tb = rG.nv;
                rk = 0;
                for (int q = 0; q < 3; q++)
                {
                    double a = q == 0 ? 0 : q == 1 ? 1 : -1; // -1: the sharp edge itself, on the face's plane
                    double e = a < 0 ? (s > 0 ? 1 : 0) : s > 0 ? 1 - r + r * a : r - r * a;
                    double p0, p1, p2;
                    if (a < 0) { if (alongU) At(e, t, out p0, out p1, out p2); else At(t, e, out p0, out p1, out p2); }
                    else StripPoint(alongU, s, a, t, w0, w1, w2, out p0, out p1, out p2);
                    Vert(p0, p1, p2, dn0, dn1, dn2, alongU ? e : t, alongU ? t : e);
                }
                Tri(tb, dn0, dn1, dn2);
            }
            UseTile(false);
        }

        // a corner of a sphere where two outer sides meet
        void Corner(int su, int sv)
        {
            const double r = ROUND;
            UseTile(rWrap && (su * rU1 > 0 || sv * rV1 > 0));
            At(su > 0 ? 1 - r : r, sv > 0 ? 1 - r : r, out double ci0, out double ci1, out double ci2);
            for (int i = 0; i < A3.Length - 1; i++)
                for (int j = 0; j < A3.Length - 1; j++)
                {
                    int b0 = rG.nv;
                    rk = 0;
                    for (int q = 0; q < 4; q++)
                    {
                        double a = q == 0 || q == 3 ? A3[i] : A3[i + 1], c = q < 2 ? A3[j] : A3[j + 1];
                        Norm(rN0 + su * a * rU0 + sv * c * rV0, rN1 + su * a * rU1 + sv * c * rV1, rN2 + su * a * rU2 + sv * c * rV2, out double d0, out double d1, out double d2);
                        double uu = su > 0 ? 1 - r + r * a : r - r * a, vv = sv > 0 ? 1 - r + r * c : r - r * c;
                        Vert(ci0 - rN0 * r + d0 * r, ci1 - rN1 * r + d1 * r, ci2 - rN2 * r + d2 * r, d0, d1, d2, uu, vv);
                    }
                    Norm(rN0 + su * rU0 + sv * rV0, rN1 + su * rU1 + sv * rV1, rN2 + su * rU2 + sv * rV2, out double m0, out double m1, out double m2);
                    Quad(b0, m0, m1, m2);
                }
            UseTile(false);
        }
    }
}
