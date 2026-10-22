// Ether Mines · the circuits around you, live (12-circuits.js computePower, lights): every 0.15 s the
// circuit blocks of the 5 x 5 chunks around you go through Core.Circuits, with your feet and the others' on
// the plates and the clock beating every second; what changed is drawn again (lamps lit, doors open, plates
// down, cables glowing) and an open door lets you through. The objectives' shapes are saved when first
// built. The nearest lanterns, lamps and glowing blocks also light their surroundings, more so at night.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class CircuitsView : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;
        public Avatars Avatars;   // null offline
        public Session Session;   // null offline
        public Sky Sky;

        readonly Circuits cir = new Circuits();
        // per chunk: the array indexed, and its circuit blocks and light sources
        sealed class Index { public byte[] Arr; public readonly List<long> Spec = new List<long>(), Lum = new List<long>(); }
        readonly Dictionary<long, Index> index = new Dictionary<long, Index>();
        readonly HashSet<long> stale = new HashSet<long>();
        readonly Dictionary<long, int> nodes = new Dictionary<long, int>();
        readonly List<double[]> feet = new List<double[]>();
        float powT, lumT;

        // light sources and their colour (LUM_COL): lanterns, pure ether, the lamp (when lit), crystals...
        static readonly Dictionary<int, int> LumCol = new Dictionary<int, int>
        {
            [14] = 0xffc27a, [70] = 0x9fd8ff, [68] = 0xffe08a, [13] = 0xb7a6ff, [75] = 0x5fd8ff, [83] = 0x7fe8ff,
            [84] = 0xff8fc8, [85] = 0x5fb8ff, [126] = 0xb98aff, [128] = 0x7fe8ff, [130] = 0xc9b8ff,
        };
        Light[] lamps;

        void Start()
        {
            World.Changed += (cx, cz) => stale.Add(ChunkStore.Key(cx, cz));
            lamps = new Light[TouchPad.Active ? 2 : 4];
            for (int i = 0; i < lamps.Length; i++)
            {
                var l = new GameObject("Lamp light " + i).AddComponent<Light>();
                l.type = LightType.Point;
                l.range = 9;
                l.intensity = 0;
                l.shadows = LightShadows.None;
                lamps[i] = l;
            }
        }

        Index IndexOf(int cx, int cz)
        {
            long k = ChunkStore.Key(cx, cz);
            var arr = World.Store.Chunk(cx, cz);
            if (arr == null) { index.Remove(k); return null; }
            if (index.TryGetValue(k, out var ix) && ix.Arr == arr && !stale.Contains(k)) return ix;
            stale.Remove(k);
            ix = new Index { Arr = arr };
            for (int i = 0; i < arr.Length; i++)
            {
                int v = arr[i];
                bool sp = Circuits.IsSpecial(v), lu = LumCol.ContainsKey(v);
                if (!sp && !lu) continue;
                // Li = x + z * 16 + y * 256
                long key = Circuits.K(cx * 16 + (i & 15), i >> 8, cz * 16 + ((i >> 4) & 15));
                if (sp) ix.Spec.Add(key);
                if (lu) ix.Lum.Add(key);
            }
            index[k] = ix;
            return ix;
        }

        void Update()
        {
            var b = Player.Body;
            if (b == null) return;
            float dt = Time.deltaTime;
            int pcx = (int)Math.Floor(b.X) >> 4, pcz = (int)Math.Floor(b.Z) >> 4;
            if ((powT -= dt) <= 0)
            {
                powT = 0.15f;
                Power(pcx, pcz, b);
            }
            if ((lumT -= dt) <= 0)
            {
                lumT = 0.25f;
                Lights(pcx, pcz, b);
            }
        }

        void Power(int pcx, int pcz, PlayerPhysics b)
        {
            nodes.Clear();
            for (int dz = -2; dz <= 2; dz++)
                for (int dx = -2; dx <= 2; dx++)
                {
                    var ix = IndexOf(pcx + dx, pcz + dz);
                    if (ix == null) continue;
                    foreach (var k in ix.Spec)
                    {
                        Circuits.D(k, out var x, out var y, out var z);
                        nodes[k] = World.Get(x, y, z);
                    }
                }
            feet.Clear();
            feet.Add(new[] { b.X, b.Y, b.Z });
            if (Avatars != null) foreach (var p in Avatars.Others()) feet.Add(new double[] { p.x, p.y, p.z });
            bool clockOn = (int)Math.Floor(Time.time) % 2 == 0;
            var changed = cir.Step(nodes, feet, clockOn);
            Objectives();
            if (changed.Count == 0) return;
            World.Powered = new HashSet<long>(cir.Powered);
            var chunks = new HashSet<long>();
            foreach (var k in changed)
            {
                Circuits.D(k, out var x, out _, out var z);
                if (chunks.Add(ChunkStore.Key(x >> 4, z >> 4))) World.QueueMesh(x >> 4, z >> 4);
            }
        }

        void Objectives()
        {
            if (Session == null) return;
            void Set(string flag, bool seen)
            {
                if (!seen || (Session.State.TryGetValue(flag, out var v) && MiniJson.Truthy(v))) return;
                Session.State[flag] = 1.0;
                Session.Dirty = true;
            }
            Set("gateLit", cir.GateLit);
            Set("twoKeyDoor", cir.TwoKeyDoor);
            Set("gateBlinker", cir.Blinker);
            Set("gateLatch", cir.Latch);
            Set("gateCoinFlip", cir.CoinFlip);
        }

        // the nearest sources (within 20 blocks, in the 3 x 3 chunks around) get a real light; an unlit lamp none
        readonly List<(float d, long k, int id)> near = new List<(float, long, int)>();
        void Lights(int pcx, int pcz, PlayerPhysics b)
        {
            near.Clear();
            for (int dz = -1; dz <= 1; dz++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    var ix = IndexOf(pcx + dx, pcz + dz);
                    if (ix == null) continue;
                    foreach (var k in ix.Lum)
                    {
                        Circuits.D(k, out var x, out var y, out var z);
                        int id = World.Get(x, y, z);
                        if (!LumCol.ContainsKey(id) || (id == 68 && !cir.Powered.Contains(k))) continue;
                        float d = (float)((x + 0.5 - b.X) * (x + 0.5 - b.X) + (y + 0.5 - b.Y) * (y + 0.5 - b.Y) + (z + 0.5 - b.Z) * (z + 0.5 - b.Z));
                        if (d < 400) near.Add((d, k, id));
                    }
                }
            near.Sort((p, q) => p.d.CompareTo(q.d));
            // more visible at night; during the day, just a soft halo (the sun below the horizon: 08-sky.js night)
            float ang = ((Sky != null ? Sky.Day : 0.5f) - 0.25f) * Mathf.PI * 2, dirY = Mathf.Sin(ang) / 1.0595f;
            float force = 0.25f + 0.85f * Mathf.Clamp01(-dirY * 4);
            for (int i = 0; i < lamps.Length; i++)
            {
                if (i >= near.Count) { lamps[i].intensity = 0; continue; }
                Circuits.D(near[i].k, out var x, out var y, out var z);
                lamps[i].transform.position = new Vector3(x + 0.5f, y + 0.5f, -(z + 0.5f));
                int c = LumCol[near[i].id];
                lamps[i].color = new Color(((c >> 16) & 255) / 255f, ((c >> 8) & 255) / 255f, (c & 255) / 255f);
                lamps[i].intensity = force * 1.6f;
            }
        }
    }
}
