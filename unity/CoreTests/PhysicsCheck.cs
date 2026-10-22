// The walking physics on the real generated world: you land at spawn, walk, and jump.
using System;
using System.IO;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class PhysicsCheck
    {
        public static void Run()
        {
            if (!Rules.Loaded) Rules.Load(File.ReadAllText("../Assets/Resources/rules.json"));
            Mesher.RulesChanged();
            var store = new ChunkStore();
            int scx = World.SPAWN.X >> 4, scz = World.SPAWN.Z >> 4;
            for (int dz = -3; dz <= 3; dz++)
                for (int dx = -3; dx <= 3; dx++) store.PutArray(scx + dx, scz + dz, World.GenChunk(scx + dx, scz + dz), false);
            var buf = new double[64 * 6];
            Func<int, int, int, int, double[][]> boxes = (id, x, y, z) =>
            {
                if (!Mesher.IsSolid(id)) return null;
                if (!Mesher.IsShaped(id)) return new[] { new double[] { 0, 0, 0, 1, 1, 1 } };
                int n = Mesher.ShapeBoxes(id, x, y, z, (a, b, c) => false, null, buf);
                var r = new double[n][];
                for (int i = 0; i < n; i++) r[i] = new[] { buf[i * 6], buf[i * 6 + 1], buf[i * 6 + 2], buf[i * 6 + 3], buf[i * 6 + 4], buf[i * 6 + 5] };
                return r;
            };
            var p = new PlayerPhysics(store.Get, store.Loaded, boxes) { X = World.SPAWN.X + 0.5, Y = World.SPAWN.Y + 3, Z = World.SPAWN.Z + 2.5 };
            Func<int, bool> ladder = id => Rules.Block(id) != null && Rules.Block(id).Shape == "ladder";
            for (int i = 0; i < 120; i++) p.Step(1 / 60.0, 0, 0, 0, false, false, false, ladder);
            Program.Check(p.On && Math.Abs(p.Y - World.SPAWN.Y) < 0.05, $"physics: lands at spawn (y {p.Y:F2}, ground {World.SPAWN.Y})");
            double z0 = p.Z;
            for (int i = 0; i < 60; i++) p.Step(1 / 60.0, 0, -1, 0, false, false, false, ladder); // backward: south, out of the Atrium
            Program.Check(p.Z - z0 > 3.5 && p.Z - z0 < 4.6, $"physics: walks south 1 s at 4.4 blocks/s ({p.Z - z0:F2})");
            double y0 = p.Y, top = p.Y;
            p.Step(1 / 60.0, 0, 0, 0, true, false, false, ladder);
            for (int i = 0; i < 60; i++) { p.Step(1 / 60.0, 0, 0, 0, false, false, false, ladder); top = Math.Max(top, p.Y); }
            Program.Check(top - y0 > 1.2 && top - y0 < 1.6 && p.On, $"physics: a jump rises {top - y0:F2} and lands");
        }
    }
}
