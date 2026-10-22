// Ether Mines · the world's shape: sizes, chunk coordinates, and the chunk codec shared with the server.
// Pure C# (no UnityEngine): compiled by Unity and by CoreTests, which checks it against the web version's
// supabase/functions/_shared/world.js. The generator itself lives in WorldGen.cs (same partial class).
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public static partial class World
    {
        public const int SY = 64, DY = 12, SEA = 15 + DY, CH = 16, CV = CH * CH * SY, DEEP = 20;
        public const int LIMIT = 100000;

        public static int COf(double v) => (int)Math.Floor(v / CH);
        public static int Li(int lx, int y, int lz) => lx + lz * CH + y * CH * CH;
        public static string CKey(int cx, int cz) => cx + "," + cz;
        public static bool InWorld(double x, double z) => Math.Abs(x) < LIMIT && Math.Abs(z) < LIMIT;

        // run-length pairs (count, id), base64: the `chunks.data` column (encodeChunk / decodeChunk in world.js)
        public static string EncodeChunk(byte[] a)
        {
            var o = new List<byte>(4096);
            int last = -1, run = 0;
            for (int i = 0; i < CV; i++)
            {
                int v = a[i];
                if (v == last && run < 255) run++;
                else
                {
                    if (run > 0) { o.Add((byte)run); o.Add((byte)last); }
                    last = v;
                    run = 1;
                }
            }
            if (run > 0) { o.Add((byte)run); o.Add((byte)last); }
            return Convert.ToBase64String(o.ToArray());
        }

        public static byte[] DecodeChunk(string data, int sy)
        {
            var bin = Convert.FromBase64String(data);
            var a = new byte[CV];
            int max = CH * CH * Math.Min(sy, SY), n = 0;
            for (int i = 0; i + 1 < bin.Length && n < max; i += 2)
            {
                int r = bin[i];
                byte v = bin[i + 1];
                for (int k = 0; k < r && n < max; k++) a[n++] = v;
            }
            return a;
        }
    }
}
