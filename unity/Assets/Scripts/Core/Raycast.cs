// Ether Mines · what you're aiming at (05-player.js raycast): a voxel walk along the look direction, the
// first non-air, non-water block within reach, and the empty cell just before it (where a block goes).
using System;

namespace EtherMines.Core
{
    public sealed class Hit
    {
        public int X, Y, Z, Id;
        public bool HasPrev;
        public int PX, PY, PZ; // the cell before (a placed block lands there)
    }

    public static class Raycast
    {
        // origin and direction in game coordinates (the web version's)
        public static Hit Cast(Func<int, int, int, int> get, double ox, double oy, double oz, double dx, double dy, double dz, double max)
        {
            double l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            if (l == 0) return null;
            dx /= l; dy /= l; dz /= l;
            if (Math.Abs(dx) < 1e-9) dx = 0;
            if (Math.Abs(dy) < 1e-9) dy = 0;
            if (Math.Abs(dz) < 1e-9) dz = 0;
            int x = (int)Math.Floor(ox), y = (int)Math.Floor(oy), z = (int)Math.Floor(oz);
            int sx = Math.Sign(dx), sy = Math.Sign(dy), sz = Math.Sign(dz);
            double tdx = Math.Abs(1 / dx), tdy = Math.Abs(1 / dy), tdz = Math.Abs(1 / dz);
            double tx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
            double ty = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
            double tz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
            if (double.IsNaN(tx)) tx = double.PositiveInfinity;
            if (double.IsNaN(ty)) ty = double.PositiveInfinity;
            if (double.IsNaN(tz)) tz = double.PositiveInfinity;
            bool hasPrev = false;
            int px = 0, py = 0, pz = 0;
            double t = 0;
            while (t <= max)
            {
                int id = get(x, y, z);
                if (id != 0 && id != 11) return new Hit { X = x, Y = y, Z = z, Id = id, HasPrev = hasPrev, PX = px, PY = py, PZ = pz };
                hasPrev = true; px = x; py = y; pz = z;
                if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; }
                else if (ty < tz) { y += sy; t = ty; ty += tdy; }
                else { z += sz; t = tz; tz += tdz; }
            }
            return null;
        }
    }
}
