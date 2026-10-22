// Step 2's core: aiming, placing, the bar, and writing JSON for the server.
using System;
using System.Collections.Generic;
using System.IO;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class Step2Check
    {
        public static void Run()
        {
            if (!Rules.Loaded) Rules.Load(File.ReadAllText("../Assets/Resources/rules.json"));
            Mesher.RulesChanged();
            var store = new ChunkStore();
            int scx = World.SPAWN.X >> 4, scz = World.SPAWN.Z >> 4;
            for (int dz = -2; dz <= 2; dz++)
                for (int dx = -2; dx <= 2; dx++) store.PutArray(scx + dx, scz + dz, World.GenChunk(scx + dx, scz + dz), false);
            // looking straight down from 1.6 above the spawn's ground: the block under your feet
            double ex = World.SPAWN.X + 0.5, ey = World.SPAWN.Y + 1.6, ez = World.SPAWN.Z + 2.5;
            var hit = Raycast.Cast(store.Get, ex, ey, ez, 0, -1, 0, 5.2);
            Program.Check(hit != null && hit.Y == World.SPAWN.Y - 1 && hit.HasPrev && hit.PY == World.SPAWN.Y, $"raycast: straight down hits the ground (y {hit?.Y}, before {hit?.PY})");
            // a plank placed in front of you, out of your body; refused inside it
            int fx = (int)Math.Floor(ex), fz = (int)Math.Floor(ez) + 3;
            var p = Placement.Plan(9, fx, World.SPAWN.Y, fz, 0, ex, World.SPAWN.Y, ez, store.Get, store.Loaded);
            Program.Check(p.Ok && p.Cells.Count == 1 && p.Id == 9, "placement: a plank in front of you");
            var q = Placement.Plan(9, (int)Math.Floor(ex), World.SPAWN.Y, (int)Math.Floor(ez), 0, ex, World.SPAWN.Y, ez, store.Get, store.Loaded);
            Program.Check(!q.Ok && q.Refusal != null && q.Refusal.Contains("standing"), "placement: refused where you stand");
            var d = Placement.Plan(48, fx, World.SPAWN.Y, fz, Math.PI / 2, ex, World.SPAWN.Y, ez, store.Get, store.Loaded);
            Program.Check(d.Ok && d.Cells.Count == 2 && d.Id == 52 && d.Cells[1][3] == 53, $"placement: a door facing west is 52/53 ({d.Id})");
            // the bar fills itself with what you gain, and lets go of what you run out of
            var inv = new Inventory();
            inv.SetCounts(new Dictionary<string, object> { ["9"] = 4.0, ["101"] = 2.0 });
            Program.Check(inv.Bar[0] == "9" && inv.Bar[1] == "101" && inv.Count(9) == 4, "inventory: new items take free bar slots");
            inv.SetCounts(new Dictionary<string, object> { ["9"] = 0.0 });
            Program.Check(inv.Bar[0] == null && inv.Count(9) == 0, "inventory: an empty stack leaves the bar");
            // JSON written for the server reads back the same
            var o = new Dictionary<string, object> { ["w"] = "test-unity", ["px"] = 12, ["ex"] = 8.25, ["held"] = null, ["s"] = "a\"b\\c\nd", ["l"] = new List<object> { 1.5, "x", true } };
            var back = MiniJson.Parse(MiniJson.Write(o)) as Dictionary<string, object>;
            Program.Check(back != null && (string)back["s"] == "a\"b\\c\nd" && (double)back["px"] == 12 && (double)back["ex"] == 8.25 && back["held"] == null && ((List<object>)back["l"]).Count == 3, "json: written and read back");
        }
    }
}
