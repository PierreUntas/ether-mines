// MeshParity: Rules.cs (from Assets/Resources/rules.json) against rules.js, and Mesher.cs against src/mesh.js,
// on the golden data written by `node golden-mesh.mjs` (golden/rules-golden.json, golden/mesh-*).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class MeshParity
    {
        static string Dir()
        {
            // the CoreTests folder: walk up from the binary until golden-mesh.mjs is found
            var d = new DirectoryInfo(AppContext.BaseDirectory);
            while (d != null && !File.Exists(Path.Combine(d.FullName, "golden-mesh.mjs"))) d = d.Parent;
            return d != null ? d.FullName : Directory.GetCurrentDirectory();
        }

        public static void Run()
        {
            var dir = Dir();
            Rules.Load(File.ReadAllText(Path.Combine(dir, "..", "Assets", "Resources", "rules.json")));
            RulesParity(dir);
            var cases = (List<object>)MiniJson.Parse(File.ReadAllText(Path.Combine(dir, "golden", "mesh-cases.json")));
            foreach (var c in cases) MeshCase(dir, (string)c);
        }

        // ---------- rules ----------
        static void RulesParity(string dir)
        {
            var g = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(Path.Combine(dir, "golden", "rules-golden.json")));
            var counts = (Dictionary<string, object>)g["counts"];
            Program.Check(Rules.BlockCount == MiniJson.ToInt(counts["B"]), "rules: block count " + Rules.BlockCount);
            Program.Check(Rules.Items.Count == MiniJson.ToInt(counts["ITEM"]), "rules: item count " + Rules.Items.Count);
            Program.Check(Rules.Recipes.Count == MiniJson.ToInt(counts["RECIPES"]), "rules: recipe count " + Rules.Recipes.Count);
            Program.Check(Rules.Cosmetics.Count == MiniJson.ToInt(counts["COSMETICS"]), "rules: cosmetic count " + Rules.Cosmetics.Count);
            Program.Check(Rules.Sets.Count == MiniJson.ToInt(counts["SETS"]), "rules: set count " + Rules.Sets.Count);

            int bad = 0, n = 0;
            foreach (var kv in (Dictionary<string, object>)g["B"])
            {
                var b = Rules.Block(int.Parse(kv.Key));
                n++;
                bad += Entry("block " + kv.Key, (List<object>)kv.Value, b == null ? null : Canon(b.Raw), b == null ? null : TypedBlock(b));
            }
            Program.Check(bad == 0, "rules: " + n + " blocks (raw entry and typed fields)");
            bad = n = 0;
            foreach (var kv in (Dictionary<string, object>)g["ITEM"])
            {
                var it = Rules.Item(int.Parse(kv.Key));
                n++;
                bad += Entry("item " + kv.Key, (List<object>)kv.Value, it == null ? null : Canon(it.Raw), it == null ? null : TypedItem(it));
            }
            Program.Check(bad == 0, "rules: " + n + " items");
            bad = n = 0;
            var rs = (List<object>)g["RECIPES"];
            for (int k = 0; k < rs.Count; k++)
            {
                var r = k < Rules.Recipes.Count ? Rules.Recipes[k] : null;
                n++;
                bad += Entry("recipe #" + k, (List<object>)rs[k], r == null ? null : Canon(r.Raw), r == null ? null : TypedRecipe(r));
            }
            Program.Check(bad == 0, "rules: " + n + " recipes");
            bad = n = 0;
            foreach (var kv in (Dictionary<string, object>)g["COSMETICS"])
            {
                Rules.Cosmetics.TryGetValue(int.Parse(kv.Key), out var c);
                n++;
                bad += Entry("cosmetic " + kv.Key, (List<object>)kv.Value, c == null ? null : Canon(c.Raw), c == null ? null : TypedCos(c));
            }
            Program.Check(bad == 0, "rules: " + n + " cosmetics");
            var root = Rules.Root;
            Program.Check(Canon(root["SETS"]) == (string)g["SETS"], "rules: SETS");
            Program.Check(Canon(root["PASTELS"]) == (string)g["PASTELS"] && Rules.Pastels.Count == 8, "rules: PASTELS");
            Program.Check(Canon(root["STAINED"]) == (string)g["STAINED"] && Rules.Stained.Count == 4, "rules: STAINED");
            var sb = new StringBuilder();
            foreach (var s in Rules.Sets) sb.Append(s[0]).Append(',');
            Program.Check(sb.ToString() == "frontier,homestead,staker,merge,dencun,ether,", "rules: set order");
            Program.Check(double.IsPositiveInfinity(Rules.Blocks[12].H), "rules: bedrock is unbreakable (h = Infinity)");

            // functions
            var rt = (List<object>)g["reqTier"];
            bad = 0;
            for (int id = 0; id < rt.Count; id++)
                if (Rules.ReqTier(id) != MiniJson.ToInt(rt[id])) { if (bad++ < 5) Console.WriteLine("  reqTier(" + id + ") " + Rules.ReqTier(id) + " vs " + rt[id]); }
            Program.Check(bad == 0, "rules: reqTier on " + rt.Count + " ids");
            var pi = (List<object>)g["placeIds"];
            bad = 0;
            for (int id = 0; id < pi.Count; id++)
            {
                var want = (List<object>)pi[id];
                var got = Rules.PlaceIds(id);
                bool ok = want.Count == got.Length;
                for (int k = 0; ok && k < got.Length; k++) ok = got[k] == MiniJson.ToInt(want[k]);
                if (!ok && bad++ < 5) Console.WriteLine("  placeIds(" + id + ") " + string.Join(",", got) + " vs " + Canon(want));
            }
            Program.Check(bad == 0, "rules: placeIds on " + pi.Count + " ids");
            bad = 0;
            var sw = (List<object>)g["shopWeek"];
            foreach (List<object> e in sw)
                if (Rules.ShopWeek(MiniJson.ToDouble(e[0])) != MiniJson.ToDouble(e[1])) { if (bad++ < 5) Console.WriteLine("  shopWeek(" + e[0] + ")"); }
            Program.Check(bad == 0, "rules: shopWeek on " + sw.Count + " times");
            bad = 0;
            var fe = (List<object>)g["featured"];
            foreach (List<object> e in fe)
            {
                double w = MiniJson.ToDouble(e[0]);
                var p = Rules.ShopFeatured(w);
                var sale = (List<object>)e[1];
                bool ok = sale.Count == p.Sale.Length && p.Limited == (e[2] == null ? -1 : MiniJson.ToInt(e[2]));
                for (int k = 0; ok && k < sale.Count; k++) ok = p.Sale[k] == (sale[k] == null ? -1 : MiniJson.ToInt(sale[k]));
                if (!ok && bad++ < 5) Console.WriteLine("  shopFeatured(" + w + ") " + string.Join(",", p.Sale) + " / " + p.Limited + " vs " + Canon(e));
            }
            Program.Check(bad == 0, "rules: shopFeatured on " + fe.Count + " weeks");
            bad = 0;
            var pr = (List<object>)g["prices"];
            foreach (List<object> e in pr)
            {
                int got = Rules.ShopPrice(MiniJson.ToInt(e[0]), MiniJson.ToDouble(e[1]));
                if (got != MiniJson.ToInt(e[2]) && bad++ < 5) Console.WriteLine("  shopPrice(" + e[0] + ", " + e[1] + ") " + got + " vs " + e[2]);
            }
            Program.Check(bad == 0, "rules: shopPrice on " + pr.Count + " (cosmetic, week) pairs");
            bad = 0;
            var fs = (Dictionary<string, object>)g["forSale"];
            foreach (var kv in fs)
                if (Rules.ForSale(Rules.Cosmetics[int.Parse(kv.Key)]) != (bool)kv.Value) bad++;
            Program.Check(bad == 0, "rules: forSale on " + fs.Count + " cosmetics");
        }

        static int Entry(string what, List<object> want, string canon, string typed)
        {
            int bad = 0;
            if (canon != (string)want[0]) { bad = 1; Console.WriteLine("  " + what + " raw:\n    C#: " + canon + "\n    JS: " + want[0]); }
            if (typed != (string)want[1]) { bad = 1; Console.WriteLine("  " + what + " typed:\n    C#: " + typed + "\n    JS: " + want[1]); }
            return bad;
        }

        // JavaScript's String(number)
        static string Num(double d)
        {
            if (double.IsPositiveInfinity(d)) return "Infinity";
            if (double.IsNegativeInfinity(d)) return "-Infinity";
            if (double.IsNaN(d)) return "NaN";
            var s = d.ToString("R", CultureInfo.InvariantCulture);
            if (s.IndexOf('E') >= 0) throw new NotSupportedException("number formatting: " + s);
            return s;
        }

        static string Opt(bool has, double v) => has ? Num(v) : "none";
        static string F(bool v) => v ? "1" : "0";

        // JSON.stringify(string)
        static string Q(string s)
        {
            var sb = new StringBuilder("\"");
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\') sb.Append("\\\\");
                else if (c == '\b') sb.Append("\\b");
                else if (c == '\f') sb.Append("\\f");
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') sb.Append("\\r");
                else if (c == '\t') sb.Append("\\t");
                else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else if (char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { sb.Append(c).Append(s[i + 1]); i++; }
                else if (char.IsSurrogate(c)) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        // canonical form of a parsed JSON value: sorted keys, JavaScript number formatting
        static string Canon(object v)
        {
            if (v == null) return "null";
            if (v is double d) return Num(d);
            if (v is string s) return Q(s);
            if (v is bool b) return b ? "true" : "false";
            if (v is List<object> l)
            {
                var sb = new StringBuilder("[");
                for (int k = 0; k < l.Count; k++) sb.Append(k > 0 ? "," : "").Append(Canon(l[k]));
                return sb.Append(']').ToString();
            }
            var o = (Dictionary<string, object>)v;
            var keys = new List<string>(o.Keys);
            keys.Sort(string.CompareOrdinal);
            var sbo = new StringBuilder("{");
            for (int k = 0; k < keys.Count; k++) sbo.Append(k > 0 ? "," : "").Append(Q(keys[k])).Append(':').Append(Canon(o[keys[k]]));
            return sbo.Append('}').ToString();
        }

        static string Ints(int[] a) => a == null ? "" : string.Join(",", a);

        static string TypedBlock(BlockDef b)
        {
            string boxes = "";
            if (b.Boxes != null)
            {
                var sb = new StringBuilder("[");
                for (int k = 0; k < b.Boxes.Length; k++)
                {
                    sb.Append(k > 0 ? ",[" : "[");
                    for (int j = 0; j < b.Boxes[k].Length; j++) sb.Append(j > 0 ? "," : "").Append(Num(b.Boxes[k][j]));
                    sb.Append(']');
                }
                boxes = sb.Append(']').ToString();
            }
            string bt = "";
            if (b.Bt != null)
            {
                var sb = new StringBuilder("[");
                for (int k = 0; k < b.Bt.Length; k++) sb.Append(k > 0 ? ",[" : "[").Append(Ints(b.Bt[k])).Append(']');
                bt = sb.Append(']').ToString();
            }
            return string.Join("|", new[]
            {
                b.N, Ints(b.T), Ints(b.TOn), b.X.ToString(CultureInfo.InvariantCulture), Opt(b.HasH, b.H), Opt(b.HasDrop, b.Drop),
                F(b.Stone), F(b.Leaf), F(b.Glass), F(b.Water), F(b.Pass), F(b.Open), F(b.Top), F(b.On), F(b.Faces), F(b.Sign),
                b.Shape ?? "", b.Gate ?? "", Num(b.O), Num(b.F), Opt(b.HasTier, b.Tier), Opt(b.HasIcon, b.Icon), boxes, bt,
            });
        }

        static string TypedItem(ItemDef i) => string.Join("|", new[]
        {
            i.N, Num(i.Icon), Opt(i.HasTool, i.Tool), Opt(i.HasTier, i.Tier), Opt(i.HasDmg, i.Dmg), Opt(i.HasArmor, i.Armor), Opt(i.HasBoots, i.Boots),
            F(i.Nft), F(i.Ranged), i.Use ?? "", i.HoverModel != null ? i.HoverModel + ":" + i.HoverK : "",
        });

        static string TypedCos(Cosmetic c) => string.Join("|", new[]
        {
            c.N, c.Category, Num(c.Price), c.Slot ?? "", c.Style ?? "", c.Set ?? "", c.Color ?? "", c.Pants ?? "", c.Accent ?? "", c.Detail ?? "",
            F(c.Limited), F(c.Retired), F(c.Prime), c.HasGrant ? c.GrantItem + "x" + c.GrantQty : "",
        });

        static string TypedRecipe(Recipe r)
        {
            var need = new StringBuilder();
            for (int k = 0; k < r.NeedIds.Length; k++) need.Append(k > 0 ? "," : "").Append(r.NeedIds[k]).Append(':').Append(r.NeedCounts[k]);
            return string.Join("|", new[] { Num(r.Out), Num(r.N), need.ToString(), r.D, r.Cat, F(r.Nft), Opt(r.HasReq, r.Req) });
        }

        // ---------- mesh ----------
        static void MeshCase(string dir, string name)
        {
            var meta = (Dictionary<string, object>)MiniJson.Parse(File.ReadAllText(Path.Combine(dir, "golden", "mesh-" + name + ".json")));
            int cx = MiniJson.ToInt(meta["cx"]), cz = MiniJson.ToInt(meta["cz"]);
            string pw = (string)meta["pw"];
            var world = File.ReadAllBytes(Path.Combine(dir, "golden", "mesh-" + name + ".world"));
            var bin = File.ReadAllBytes(Path.Combine(dir, "golden", "mesh-" + name + ".bin"));
            const int CH = World.CH, SY = World.SY, CV = World.CV;
            Func<int, int, int, int> get = (x, y, z) =>
            {
                if (y < 0 || y >= SY) return 0;
                int ccx = (int)Math.Floor(x / (double)CH), ccz = (int)Math.Floor(z / (double)CH), dx = ccx - cx, dz = ccz - cz;
                if (dx < -1 || dx > 1 || dz < -1 || dz > 1) return 0;
                return world[((dz + 1) * 3 + dx + 1) * CV + World.Li(x - ccx * CH, y, z - ccz * CH)];
            };
            // the same rule as golden-mesh.mjs
            Func<int, int, int, bool> powered = pw == "hash" ? (x, y, z) => ((x * 31 + y * 17 + z * 7) & 3) == 0 : (Func<int, int, int, bool>)((x, y, z) => false);

            var mesher = new Mesher();
            var M = mesher.MeshChunk(cx, cz, get, powered);
            var groups = (Dictionary<string, object>)meta["groups"];
            int off = 0, verts = 0;
            bool all = true;
            string[] gn = { "op", "gl", "wa", "pl" };
            MeshGroup[] gs = { M.Op, M.Gl, M.Wa, M.Pl };
            for (int k = 0; k < 4; k++)
            {
                var want = groups[gn[k]] as Dictionary<string, object>;
                var got = gs[k];
                string what = "mesh " + name + " " + gn[k];
                if (want == null)
                {
                    bool ok = got == null;
                    if (!ok) { Program.Check(false, what + ": expected empty, got " + got.VertexCount + " vertices"); all = false; }
                    continue;
                }
                if (got == null) { Program.Check(false, what + ": empty in C#"); all = false; return; }
                int nv = MiniJson.ToInt(want["nv"]), ni = MiniJson.ToInt(want["ni"]);
                bool col = (bool)want["col"];
                verts += nv;
                bool okg = CmpF(what + ".pos", got.Pos, bin, ref off, nv * 3)
                    & CmpF(what + ".nor", got.Nor, bin, ref off, nv * 3)
                    & CmpF(what + ".uv", got.Uv, bin, ref off, nv * 2);
                if (col) okg &= CmpF(what + ".col", got.Col, bin, ref off, nv * 3);
                else okg &= got.Col == null;
                okg &= CmpI(what + ".idx", got.Idx, bin, ref off, ni);
                if (!okg) all = false;
            }
            all &= off == bin.Length;
            if (inexact > 0) Console.WriteLine("  " + name + ": " + inexact + " floats within tolerance but not bit-identical");
            inexact = 0;

            // timing: mesh it again a few times
            var sw = Stopwatch.StartNew();
            int reps = 20;
            for (int r = 0; r < reps; r++) mesher.MeshChunk(cx, cz, get, powered);
            double ms = sw.Elapsed.TotalMilliseconds / reps;
            Program.Check(all, "mesh " + name + " (" + cx + ", " + cz + ", powered " + pw + "): " + verts + " vertices identical · " + ms.ToString("0.00", CultureInfo.InvariantCulture) + " ms/chunk");
        }

        static bool CmpF(string what, float[] got, byte[] bin, ref int off, int n)
        {
            int start = off;
            off += n * 4;
            if (got == null || got.Length != n) { Console.WriteLine("  " + what + ": length " + (got == null ? -1 : got.Length) + " vs " + n); return false; }
            int bad = 0;
            for (int i = 0; i < n; i++)
            {
                float w = BitConverter.ToSingle(bin, start + i * 4);
                if (Math.Abs(got[i] - w) > 1e-5f || float.IsNaN(got[i]) != float.IsNaN(w))
                {
                    if (bad++ < 5) Console.WriteLine("  " + what + "[" + i + "]: " + got[i].ToString("R") + " vs " + w.ToString("R"));
                }
            }
            if (bad > 0) Console.WriteLine("  " + what + ": " + bad + " mismatches");
            for (int i = 0; i < n; i++)
                if (BitConverter.SingleToInt32Bits(got[i]) != BitConverter.ToInt32(bin, start + i * 4)) inexact++;
            return bad == 0;
        }

        static int inexact;

        static bool CmpI(string what, int[] got, byte[] bin, ref int off, int n)
        {
            int start = off;
            off += n * 4;
            if (got == null || got.Length != n) { Console.WriteLine("  " + what + ": length " + (got == null ? -1 : got.Length) + " vs " + n); return false; }
            int bad = 0;
            for (int i = 0; i < n; i++)
            {
                int w = (int)BitConverter.ToUInt32(bin, start + i * 4);
                if (got[i] != w && bad++ < 5) Console.WriteLine("  " + what + "[" + i + "]: " + got[i] + " vs " + w);
            }
            if (bad > 0) Console.WriteLine("  " + what + ": " + bad + " mismatches");
            return bad == 0;
        }
    }
}
