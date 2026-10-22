// Ether Mines · placing a block where you aim (06-actions.js place): which variant (stairs, ladders, beds,
// gates and furniture face where you look; a door is a two-block panel), whether it fits (not inside you,
// plants on grass, plates on something solid...), and the cells it fills. The server checks it all again.
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public sealed class PlaceResult
    {
        public bool Ok;
        public string Refusal;       // why not (shown to the player), or null when there's nothing to say
        public int Id;               // the block id sent to the server (bid)
        public readonly List<int[]> Cells = new List<int[]>(); // [x, y, z, id] to write locally
    }

    public static class Placement
    {
        static readonly int[][] Dir = { new[] { 0, -1 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 1, 0 } };
        // a door's panel inside its cell, by facing (mesh.js DOORB)
        static readonly double[][] DoorB =
        {
            new[] { 0, 0, 0, 1, 1, 0.1875 }, new[] { 0, 0, 0, 0.1875, 1, 1 },
            new[] { 0, 0, 0.8125, 1, 1, 1 }, new[] { 0.8125, 0, 0, 1, 1, 1 },
        };

        static bool Free(int id) => id == 0 || id == 11 || Mesher.IsCross(id);

        // it: the item in hand (a block id); (x, y, z): the cell before the aimed block; yaw: where you look;
        // (px, py, pz): your feet (PlayerPhysics box: half width PW, height PH)
        public static PlaceResult Plan(int it, int x, int y, int z, double yaw, double px, double py, double pz, Func<int, int, int, int> get, Func<int, int, bool> loaded)
        {
            var r = new PlaceResult();
            var b0 = Rules.Block(it);
            if (b0 == null) return r;
            int face = (((int)JsRoundDiv(yaw) % 4) + 4) % 4;
            int id = it;
            if (b0.Shape == "stairs" || b0.Shape == "ladder" || b0.Shape == "bed0f" || b0.Gate != null || b0.Faces) id = it + face;
            if (id == 13) { r.Refusal = "validators are relit in the ruins, not built"; return r; }
            if (y < 0 || y >= World.SY || !loaded(x, z) || !World.InWorld(x, z)) return r;
            if (!Free(get(x, y, z))) return r;
            var b = Rules.Block(id);
            string sh = b.Shape;
            double PW = PlayerPhysics.PW, PH = PlayerPhysics.PH;
            int hx = 0, hz = 0;
            if (sh == "door")
            {
                int up = get(x, y + 1, z);
                if (y + 1 >= World.SY || !Free(up)) { r.Refusal = "you need two free spaces, one above the other"; return r; }
                id = 48 + face * 4;
                var d = DoorB[Rules.Block(id).F];
                if (x + d[3] > px - PW && x + d[0] < px + PW && y + 2 > py && y < py + PH && z + d[5] > pz - PW && z + d[2] < pz + PW)
                { r.Refusal = "you are in the doorway: step back"; return r; }
            }
            else if (sh != null && sh.StartsWith("bed", StringComparison.Ordinal))
            {
                hx = x + Dir[face][0]; hz = z + Dir[face][1];
                if (!World.InWorld(hx, hz) || !Free(get(hx, y, hz))) { r.Refusal = "the bed needs room to stretch out"; return r; }
            }
            else if (Mesher.IsSolid(id) && x + 1 > px - PW && x < px + PW && y + 1 > py && y < py + PH && z + 1 > pz - PW && z < pz + PW)
            { r.Refusal = "you are standing on that spot: step back"; return r; }
            if (Mesher.IsCross(id)) { int below = get(x, y - 1, z); if (below != 1 && below != 2) { r.Refusal = "plants are placed on grass or dirt"; return r; } }
            if ((sh == "plate" || sh == "cable" || sh == "lever") && !Mesher.IsSolid(get(x, y - 1, z))) { r.Refusal = "you need a solid block underneath"; return r; }
            r.Ok = true;
            r.Id = id;
            r.Cells.Add(new[] { x, y, z, id });
            if (sh == "door") r.Cells.Add(new[] { x, y + 1, z, id + 1 });
            else if (sh != null && sh.StartsWith("bed", StringComparison.Ordinal)) r.Cells.Add(new[] { hx, y, hz, id + 4 });
            return r;
        }

        // Math.round(yaw / (PI / 2)), JavaScript's rounding (halves up)
        static double JsRoundDiv(double yaw) => Math.Floor(yaw / (Math.PI / 2) + 0.5);

        // opening or closing a door (06-actions.js toggleDoor): the cells to write, or empty
        public static List<int[]> ToggleDoor(int x, int y, int z, int id, Func<int, int, int, int> get)
        {
            var outp = new List<int[]>();
            var b = Rules.Block(id);
            int by = b.Top ? y - 1 : y, bot = get(x, by, z);
            var nb = Rules.Block(bot);
            if (nb == null || nb.Shape != "door") return outp;
            int nid = 48 + nb.F * 4 + (nb.Open ? 0 : 1) * 2;
            outp.Add(new[] { x, by, z, nid });
            var top = Rules.Block(get(x, by + 1, z));
            if (top != null && top.Shape == "door") outp.Add(new[] { x, by + 1, z, nid + 1 });
            return outp;
        }
    }
}
