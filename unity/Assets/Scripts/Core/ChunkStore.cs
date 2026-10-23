// Ether Mines · the loaded part of the world: chunks by coordinates, and the blocks players changed.
// A chunk is the server's frozen terrain when there is one (the `chunks` table), the generator's
// otherwise (World.GenChunk); the changed blocks (`blocks` table) are laid over it, as 13-chunks.js does.
// Pure C#: the Unity side asks it for blocks, streams chunks in and out, and remeshes what changed.
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public struct BlockEdit
    {
        public int X, Y, Z, Id;
        public string PlacedBy, PlacedName;
        public long Serial;
    }

    public sealed class Owner
    {
        public string By, Name;
        public long Serial;
    }

    public sealed class ChunkStore
    {
        readonly Dictionary<long, byte[]> chunks = new Dictionary<long, byte[]>();
        readonly HashSet<long> frozen = new HashSet<long>();
        // every changed block we know of, by chunk: laid again over a chunk loaded later
        readonly Dictionary<long, Dictionary<int, int>> edits = new Dictionary<long, Dictionary<int, int>>();
        readonly Dictionary<long, Owner> owners = new Dictionary<long, Owner>();

        public static long Key(int cx, int cz) => ((long)cx << 32) ^ (uint)cz;
        public static int KeyX(long k) => (int)(k >> 32);
        public static int KeyZ(long k) => (int)(uint)k;
        static long CellKey(int x, int y, int z) => ((long)(x + 0x200000) << 36) | ((long)(z + 0x200000) << 14) | (long)(uint)y;

        public int Count => chunks.Count;
        public bool Has(int cx, int cz) => chunks.ContainsKey(Key(cx, cz));
        public bool IsFrozen(int cx, int cz) => frozen.Contains(Key(cx, cz));
        public IEnumerable<long> Keys => chunks.Keys;
        public byte[] Chunk(int cx, int cz) { chunks.TryGetValue(Key(cx, cz), out var c); return c; }

        // the block at world coordinates (0: air, or a chunk not loaded)
        public int Get(int x, int y, int z)
        {
            if (y < 0 || y >= World.SY) return 0;
            int cx = x >> 4, cz = z >> 4;
            if (!chunks.TryGetValue(Key(cx, cz), out var c)) return 0;
            return c[World.Li(x - cx * World.CH, y, z - cz * World.CH)];
        }

        public bool Loaded(int x, int z) => chunks.ContainsKey(Key(x >> 4, z >> 4));

        // a chunk arrives: the frozen terrain (data, sy) or null to generate it, then the known edits on top
        public void Put(int cx, int cz, string data, int sy)
        {
            var k = Key(cx, cz);
            byte[] a = data != null ? World.DecodeChunk(data, sy) : World.GenChunk(cx, cz);
            if (data != null) frozen.Add(k);
            chunks[k] = a;
            if (edits.TryGetValue(k, out var m))
                foreach (var e in m) a[e.Key] = (byte)e.Value;
        }

        // a chunk already decoded or generated (off the main thread), then the known edits on top
        public void PutArray(int cx, int cz, byte[] a, bool isFrozen)
        {
            var k = Key(cx, cz);
            if (isFrozen) frozen.Add(k);
            chunks[k] = a;
            if (edits.TryGetValue(k, out var m))
                foreach (var e in m) a[e.Key] = (byte)e.Value;
        }

        // a changed block (from the area read, or live): kept, and written into its chunk if loaded
        public void Edit(BlockEdit e)
        {
            if (e.Y < 0 || e.Y >= World.SY) return;
            int cx = e.X >> 4, cz = e.Z >> 4;
            var k = Key(cx, cz);
            int li = World.Li(e.X - cx * World.CH, e.Y, e.Z - cz * World.CH);
            if (!edits.TryGetValue(k, out var m)) edits[k] = m = new Dictionary<int, int>();
            m[li] = e.Id;
            if (chunks.TryGetValue(k, out var c)) c[li] = (byte)e.Id;
            var ck = CellKey(e.X, e.Y, e.Z);
            if (e.Id != 0 && e.PlacedBy != null) owners[ck] = new Owner { By = e.PlacedBy, Name = e.PlacedName, Serial = e.Serial };
            else owners.Remove(ck);
        }

        public Owner OwnerOf(int x, int y, int z) { owners.TryGetValue(CellKey(x, y, z), out var o); return o; }
        // every placed block known here, with who placed it (the ledger view)
        public IEnumerable<(int x, int y, int z, Owner o)> Owners()
        {
            foreach (var kv in owners)
            {
                long k = kv.Key;
                yield return ((int)(k >> 36) - 0x200000, (int)(k & 0x3fff), (int)((k >> 14) & 0x3fffff) - 0x200000, kv.Value);
            }
        }

        // everything forgotten (the world was restored as generated): read again from the server
        public void Clear()
        {
            chunks.Clear();
            frozen.Clear();
            edits.Clear();
            owners.Clear();
        }

        public void Drop(int cx, int cz)
        {
            var k = Key(cx, cz);
            chunks.Remove(k);
            frozen.Remove(k);
        }
    }
}
