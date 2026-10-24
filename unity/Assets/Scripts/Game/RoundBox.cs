// Ether Mines · a box with rounded edges and corners, for the characters (the players, the villagers):
// roundBox in 09-animals.js. Each edge is a quarter round of radius r, smooth-shaded, the corners eighths
// of a sphere: every point of a box grid (2 steps around each round, one across the flat middle) is pushed
// out from the inner box, shrunk by r, to distance r. One mesh per size, centred, at scale 1.
using System.Collections.Generic;
using UnityEngine;

namespace EtherMines.Game
{
    public static class RoundBox
    {
        static readonly Dictionary<string, Mesh> cache = new Dictionary<string, Mesh>();
        const int M = 2, Seg = 2 * M + 1;

        // the web's radius: min(0.1, the thinnest side × 0.3)
        public static float Radius(Vector3 s) => Mathf.Min(0.1f, Mathf.Min(s.x, Mathf.Min(s.y, s.z)) * 0.3f);

        public static Mesh Get(Vector3 size, float r = -1)
        {
            if (r < 0) r = Radius(size);
            string k = size.x + "," + size.y + "," + size.z + "," + r;
            if (cache.TryGetValue(k, out var m)) return m;
            return cache[k] = Build(size, r);
        }

        static Mesh Build(Vector3 size, float r)
        {
            float[] half = { size.x / 2, size.y / 2, size.z / 2 };
            float At(int i, int a) => i <= M ? -half[a] + r * i / M : half[a] - r + r * (i - M - 1) / M;
            var verts = new List<Vector3>();
            var norms = new List<Vector3>();
            var uvs = new List<Vector2>();
            var tris = new List<int>();
            var q = new float[3];
            var c = new float[3];
            for (int k = 0; k < 3; k++)
                for (int s = -1; s <= 1; s += 2)
                {
                    int ua = k == 0 ? 2 : 0, va = k == 1 ? 2 : 1, b = verts.Count;
                    for (int j = 0; j <= Seg; j++)
                        for (int i = 0; i <= Seg; i++)
                        {
                            q[k] = s * half[k];
                            q[ua] = At(i, ua);
                            q[va] = At(j, va);
                            float len = 0;
                            for (int a = 0; a < 3; a++)
                            {
                                c[a] = Mathf.Max(-half[a] + r, Mathf.Min(half[a] - r, q[a]));
                                len += (q[a] - c[a]) * (q[a] - c[a]);
                            }
                            len = Mathf.Sqrt(len);
                            var n = new Vector3(k == 0 ? s : 0, k == 1 ? s : 0, k == 2 ? s : 0);
                            if (len > 1e-6f)
                            {
                                for (int a = 0; a < 3; a++) q[a] = c[a] + (q[a] - c[a]) / len * r;
                                n = new Vector3((q[0] - c[0]) / r, (q[1] - c[1]) / r, (q[2] - c[2]) / r);
                            }
                            verts.Add(new Vector3(q[0], q[1], q[2]));
                            norms.Add(n);
                            uvs.Add(new Vector2((float)i / Seg, (float)j / Seg));
                        }
                    // a front face's Cross(b - a, c - a) points outward: (v0, v1, v2) gives u × v, which is +k
                    // when (u, v, k) go round in x, y, z order, so the faces where that isn't outward flip
                    bool cyclic = (ua - k + 3) % 3 == 1;
                    bool flip = (s > 0) != cyclic;
                    for (int j = 0; j < Seg; j++)
                        for (int i = 0; i < Seg; i++)
                        {
                            int v0 = b + j * (Seg + 1) + i, v1 = v0 + 1, v2 = v0 + Seg + 1, v3 = v2 + 1;
                            if (flip) tris.AddRange(new[] { v0, v2, v1, v1, v2, v3 });
                            else tris.AddRange(new[] { v0, v1, v2, v1, v3, v2 });
                        }
                }
            var mesh = new Mesh { name = "round box" };
            mesh.vertices = verts.ToArray();
            mesh.normals = norms.ToArray();
            mesh.uv = uvs.ToArray();
            mesh.triangles = tris.ToArray();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
