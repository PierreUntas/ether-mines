// Ether Mines · the models of what you hold (04-render.js setHand, clayModel, blockModel): the items' own
// clay models (Resources/held.json, exported from the game by tools/export-held.mjs), and the blocks as
// they stand in the world (one block meshed by the core's Mesher, with the world's own materials). Shared
// by your hand in first person (Hand.cs) and the figures' right hands (Avatars.cs).
// The models are in the game's coordinates: mirrored here like the world (z -> -z, triangles turned around).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class HeldModels
    {
        public sealed class Info { public bool Upright, Ranged, Block, Cube; public float Fit = 1; }

        static Dictionary<string, object> items;
        static readonly Dictionary<int, Mesh[]> meshes = new Dictionary<int, Mesh[]>();
        static readonly Dictionary<int, Material[]> partMats = new Dictionary<int, Material[]>();
        static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();
        static readonly Dictionary<int, (MeshOut m, float fit)> blocks = new Dictionary<int, (MeshOut, float)>();
        public static WorldView World; // the world's materials, for blocks
        static Mesher mesher;

        static Material Lit(Color c, Color glow)
        {
            var k = "l" + ColorUtility.ToHtmlStringRGB(c) + ColorUtility.ToHtmlStringRGB(glow);
            if (mats.TryGetValue(k, out var m)) return m;
            m = new Material(Shader.Find("EtherMines/Avatar"));
            m.SetColor("_Color", c);
            m.SetColor("_Glow", glow);
            return mats[k] = m;
        }
        static Material Basic(Color c)
        {
            var k = "b" + ColorUtility.ToHtmlStringRGB(c);
            if (mats.TryGetValue(k, out var m)) return m;
            m = new Material(Shader.Find("EtherMines/Glow"));
            m.SetColor("_Color", c);
            return mats[k] = m;
        }

        static Dictionary<string, object> Item(int id)
        {
            if (items == null) items = (Dictionary<string, object>)((Dictionary<string, object>)MiniJson.Parse(Resources.Load<TextAsset>("held").text))["items"];
            return items.TryGetValue(id.ToString(), out var o) ? o as Dictionary<string, object> : null;
        }

        public static Info InfoOf(int id)
        {
            var b = Rules.Block(id);
            if (b != null) { var bm = BlockMesh(id); return new Info { Block = true, Cube = b.Shape == null && b.X < 0 && !b.Water, Fit = bm.fit }; }
            var d = Item(id);
            var it = Rules.Item(id);
            return new Info { Upright = d != null && d.ContainsKey("upright"), Ranged = it != null && it.Ranged };
        }

        // a new object holding the model of this item or block, centered as the game has it; null if none
        public static GameObject Make(int id, int layer, bool shadows)
        {
            GameObject go;
            if (Rules.Block(id) != null) go = MakeBlock(id);
            else go = MakeItem(id);
            if (go == null) return null;
            foreach (var r in go.GetComponentsInChildren<MeshRenderer>())
            {
                r.gameObject.layer = layer;
                r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                r.receiveShadows = shadows;
            }
            go.layer = layer;
            return go;
        }

        static GameObject MakeItem(int id)
        {
            var d = Item(id);
            if (d == null || !d.TryGetValue("parts", out var po)) return null;
            var parts = (List<object>)po;
            if (!meshes.TryGetValue(id, out var ms))
            {
                ms = new Mesh[parts.Count];
                var pm = new Material[parts.Count];
                for (int i = 0; i < parts.Count; i++)
                {
                    var p = (Dictionary<string, object>)parts[i];
                    var v = (List<object>)p["v"];
                    var n = (List<object>)p["n"];
                    int vc = v.Count / 3;
                    var pos = new Vector3[vc];
                    var nor = new Vector3[vc];
                    var idx = new int[vc];
                    for (int t = 0; t < vc; t++)
                    {
                        pos[t] = new Vector3((float)(double)v[t * 3], (float)(double)v[t * 3 + 1], -(float)(double)v[t * 3 + 2]);
                        int tri = t / 3;
                        nor[t] = new Vector3((float)(double)n[tri * 3], (float)(double)n[tri * 3 + 1], -(float)(double)n[tri * 3 + 2]);
                    }
                    for (int t = 0; t + 2 < vc; t += 3) { idx[t] = t; idx[t + 1] = t + 2; idx[t + 2] = t + 1; }
                    var mesh = new Mesh { name = "held " + id };
                    if (vc > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                    mesh.vertices = pos;
                    mesh.normals = nor;
                    mesh.triangles = idx;
                    mesh.RecalculateBounds();
                    ms[i] = mesh;
                    var c = Avatars.Hex(p["c"] as string, Color.white);
                    pm[i] = p.ContainsKey("b") && MiniJson.Truthy(p["b"]) ? Basic(c) : Lit(c, Avatars.Hex(p["e"] as string, Color.black));
                }
                meshes[id] = ms;
                partMats[id] = pm;
            }
            var go = new GameObject("held " + id);
            var mats2 = partMats[id];
            for (int i = 0; i < ms.Length; i++)
            {
                var ch = new GameObject("part");
                ch.transform.SetParent(go.transform, false);
                ch.AddComponent<MeshFilter>().sharedMesh = ms[i];
                ch.AddComponent<MeshRenderer>().sharedMaterial = mats2[i];
            }
            return go;
        }

        // one block, meshed alone in an empty chunk, centered on itself
        static (MeshOut m, float fit) BlockMesh(int id)
        {
            if (blocks.TryGetValue(id, out var bm)) return bm;
            if (mesher == null) mesher = new Mesher();
            var m = mesher.MeshChunk(0, 0, (x, y, z) => x == 8 && y == 32 && z == 8 ? id : 0, (Func<int, int, int, bool>)((x, y, z) => false));
            // its bounds, to center it and fit it in the palm (blockModel's fit)
            float x0 = 99, y0 = 99, z0 = 99, x1 = -99, y1 = -99, z1 = -99;
            foreach (var g in new[] { m.Op, m.Gl, m.Wa, m.Pl })
            {
                if (g == null || g.Pos == null) continue;
                for (int i = 0; i + 2 < g.Pos.Length; i += 3)
                {
                    x0 = Math.Min(x0, g.Pos[i]); x1 = Math.Max(x1, g.Pos[i]);
                    y0 = Math.Min(y0, g.Pos[i + 1]); y1 = Math.Max(y1, g.Pos[i + 1]);
                    z0 = Math.Min(z0, g.Pos[i + 2]); z1 = Math.Max(z1, g.Pos[i + 2]);
                }
            }
            float cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
            foreach (var g in new[] { m.Op, m.Gl, m.Wa, m.Pl })
            {
                if (g == null || g.Pos == null) continue;
                for (int i = 0; i + 2 < g.Pos.Length; i += 3) { g.Pos[i] -= cx; g.Pos[i + 1] -= cy; g.Pos[i + 2] -= cz; }
            }
            float fit = 1 / Math.Max(Math.Max(x1 - x0, y1 - y0), Math.Max(z1 - z0, 0.3f));
            return blocks[id] = (m, fit);
        }

        static GameObject MakeBlock(int id)
        {
            if (World == null) return null;
            var (m, _) = BlockMesh(id);
            var go = new GameObject("held block " + id);
            WorldView.Part(go, m.Op, World.OpMat, false);
            WorldView.Part(go, m.Gl, World.GlMat, false);
            WorldView.Part(go, m.Wa, World.WaMat, false);
            WorldView.Part(go, m.Pl, World.PlMat, false);
            return go.transform.childCount > 0 ? go : null;
        }

        // three.js Euler angles (XYZ) seen in the mirror (z -> -z): the turns about x and y change direction,
        // the turn about z (in the mirror's own plane) stays as it is
        public static Quaternion Mirror(float x, float y, float z) =>
            Quaternion.AngleAxis(-x * Mathf.Rad2Deg, Vector3.right) * Quaternion.AngleAxis(-y * Mathf.Rad2Deg, Vector3.up) * Quaternion.AngleAxis(z * Mathf.Rad2Deg, Vector3.forward);
    }
}
