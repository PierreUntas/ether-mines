// Ether Mines · the game rules (blocks, items, recipes, cosmetics, the shop's week), read from
// Assets/Resources/rules.json, which unity/tools/export-rules.mjs writes from the web version's
// supabase/functions/_shared/rules.js (the single source of truth). The few functions of rules.js
// (reqTier, placeIds, shopWeek, shopFeatured, shopPrice, forSale) are ported here; CoreTests checks
// them, and every entry, against rules.js. Pure C# (no UnityEngine): in Unity,
//   Rules.Load(Resources.Load<TextAsset>("rules").text);
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public sealed class BlockDef
    {
        public int Id;
        public string N;              // name
        public int[] T;               // tiles [top, sides, bottom] (atlas index, 16 x 16 tiles); null for water
        public int[] TOn;             // lit tiles (logic gates, clock), or null
        public int X = -1;            // cross-plant tile, or -1 (JS: x == null)
        public bool HasH;             // water has none
        public double H;              // hardness; +Infinity = unbreakable ("Infinity" in rules.json)
        public bool HasDrop;          // drop present (0 = drops nothing)
        public int Drop;
        public bool Stone, Leaf, Glass, Water, Pass, Open, Top, On, Faces, Sign;
        public string Shape;          // null, slab, stairs, door, lever, plate, cable, fence, pane, ladder, table, furn, bed0f..bed3h
        public string Gate;           // and, or, not, or null
        public int O, F;              // orientation (stairs, ladder, furn, gates), door facing
        public bool HasTier;
        public int Tier;
        public bool HasIcon;
        public int Icon;
        public double[][] Boxes;      // furn: its boxes [x0, y0, z0, x1, y1, z1]
        public int[][] Bt;            // furn: one tile triple per box, or null
        public Dictionary<string, object> Raw; // every field as read (unknown ones included)

        public bool IsCross => X >= 0;
        public bool IsBed => Shape != null && Shape.StartsWith("bed", StringComparison.Ordinal);
        public int BedFacing => IsBed ? Shape[3] - '0' : 0;
        public bool BedHead => IsBed && Shape[4] != 'f';
    }

    public sealed class ItemDef
    {
        public int Id;
        public string N;
        public int Icon;
        public bool HasTool, HasTier, HasDmg, HasArmor, HasBoots;
        public double Tool, Dmg, Armor, Boots;
        public int Tier;
        public bool Nft, Ranged;
        public string Use;            // consumables: heal, speed, vision, ward, home
        public string HoverModel;     // hovercraft: twin, neon (null otherwise)
        public int HoverK;
        public Dictionary<string, object> Raw;
    }

    public sealed class Recipe
    {
        public int Out, N;
        public int[] NeedIds, NeedCounts; // in rules.js order (ascending id)
        public string D, Cat;
        public bool Nft;
        public bool HasReq;
        public int Req;
        public Dictionary<string, object> Raw;
    }

    public sealed class Cosmetic
    {
        public int Id;
        public string N, Category, Slot, Style, Set, Color, Pants, Accent, Detail;
        public string Emote;      // an emote's gesture (EMOTES), sold in the Workshop
        public int Price;
        public int Eur;           // premium: sold for euros, in cents (never for Gwei)
        public bool Premium => Category == "premium";
        public bool Limited, Retired, Prime;
        public bool HasGrant;
        public int GrantItem, GrantQty;
        public Dictionary<string, object> Raw;
    }

    public struct ShopPicks
    {
        public int[] Sale;   // the cosmetics 25% off this week (-1 where rules.js would give undefined)
        public int Limited;  // the limited piece for sale, or -1
    }

    public static class Rules
    {
        public static readonly BlockDef[] Blocks = new BlockDef[256];
        public static readonly Dictionary<int, ItemDef> Items = new Dictionary<int, ItemDef>();
        public static readonly List<Recipe> Recipes = new List<Recipe>();
        public static readonly Dictionary<int, Cosmetic> Cosmetics = new Dictionary<int, Cosmetic>();
        public static int[] CosmeticIds = new int[0]; // ascending
        public static readonly List<string[]> Sets = new List<string[]>(); // [key, name, line], shop order
        // the gestures (EMOTES), in the order of the row: key, name, how long (0: until you move), the cosmetic
        // that unlocks it (0: free)
        public sealed class EmoteDef { public string K, N; public float Sec; public int Cosmetic; }
        public static readonly List<EmoteDef> Emotes = new List<EmoteDef>();
        public static EmoteDef Emote(string k) { foreach (var e in Emotes) if (e.K == k) return e; return null; }
        public static readonly Dictionary<string, int> SetEur = new Dictionary<string, int>(); // a whole premium set, euro cents (SET_EUR)
        public static string StorePrefix = "org.ethermines.game."; // the App Store / Google Play product ids (STORE_PREFIX)
        public static readonly List<string[]> Pastels = new List<string[]>(), Stained = new List<string[]>();
        public static int BlockCount { get; private set; }
        public static bool Loaded { get; private set; }
        public static Dictionary<string, object> Root { get; private set; }

        // the shop's constants (rules.json "shop")
        public static double ShopEpoch = 345600, ShopWeekSeconds = 604800;
        public static int SaleCount = 3, SaleNum = 3, SaleDen = 4;
        public static string[] NotForSale = { "combat", "event", "title" };

        static int[] regular = new int[0], limited = new int[0];

        public static BlockDef Block(int id) => (uint)id < 256u ? Blocks[id] : null;
        public static ItemDef Item(int id) => Items.TryGetValue(id, out var it) ? it : null;

        // rules.js setPieces / setPrice: a premium set's pieces, and what the missing ones cost bought together
        // (the set's price times their share of the pieces' euros, rounded half up; 0 once complete)
        public static List<int> SetPieces(string set)
        {
            var l = new List<int>();
            foreach (var id in CosmeticIds) if (Cosmetics[id].Set == set && Cosmetics[id].Premium) l.Add(id);
            return l;
        }
        public static int SetPrice(string set, Func<int, bool> owns)
        {
            if (!SetEur.TryGetValue(set, out var eur)) return 0;
            int all = 0, missing = 0;
            foreach (var id in SetPieces(set)) { all += Cosmetics[id].Eur; if (owns == null || !owns(id)) missing += Cosmetics[id].Eur; }
            if (missing == 0 || all == 0) return 0;
            return (int)Math.Floor((double)eur * missing / all + 0.5);
        }

        public static void Load(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("rules.json: not an object");
            Array.Clear(Blocks, 0, Blocks.Length);
            Items.Clear();
            Recipes.Clear();
            Cosmetics.Clear();
            Sets.Clear();
            SetEur.Clear();
            Pastels.Clear();
            Stained.Clear();
            BlockCount = 0;

            foreach (var kv in Obj(root, "B"))
            {
                int id = int.Parse(kv.Key);
                if ((uint)id >= 256u) throw new FormatException("rules.json: block id out of range " + id);
                Blocks[id] = ReadBlock(id, (Dictionary<string, object>)kv.Value);
                BlockCount++;
            }
            foreach (var kv in Obj(root, "ITEM"))
            {
                int id = int.Parse(kv.Key);
                Items[id] = ReadItem(id, (Dictionary<string, object>)kv.Value);
            }
            if (root.TryGetValue("RECIPES", out var rl) && rl is List<object> rs)
                foreach (var r in rs) Recipes.Add(ReadRecipe((Dictionary<string, object>)r));
            var ids = new List<int>();
            foreach (var kv in Obj(root, "COSMETICS"))
            {
                int id = int.Parse(kv.Key);
                Cosmetics[id] = ReadCosmetic(id, (Dictionary<string, object>)kv.Value);
                ids.Add(id);
            }
            ids.Sort();
            CosmeticIds = ids.ToArray();
            foreach (var kv in Obj(root, "SETS"))
            {
                var a = (List<object>)kv.Value;
                Sets.Add(new[] { kv.Key, (string)a[0], (string)a[1] });
            }
            Emotes.Clear();
            if (root.TryGetValue("EMOTES", out var em) && em is Dictionary<string, object> emd)
                foreach (var kv in emd)
                {
                    var d = (Dictionary<string, object>)kv.Value;
                    Emotes.Add(new EmoteDef { K = kv.Key, N = Str(d, "n"), Sec = (float)MiniJson.ToDouble(Get(d, "sec"), 0), Cosmetic = MiniJson.ToInt(Get(d, "cosmetic")) });
                }
            if (root.TryGetValue("STORE_PREFIX", out var sp) && sp is string sps) StorePrefix = sps;
            if (root.TryGetValue("SET_EUR", out var se) && se is Dictionary<string, object> sed)
                foreach (var kv in sed) SetEur[kv.Key] = MiniJson.ToInt(kv.Value);
            ReadPairs(root, "PASTELS", Pastels);
            ReadPairs(root, "STAINED", Stained);
            if (root.TryGetValue("shop", out var so) && so is Dictionary<string, object> shop)
            {
                ShopEpoch = MiniJson.ToDouble(Get(shop, "epoch"), ShopEpoch);
                ShopWeekSeconds = MiniJson.ToDouble(Get(shop, "week"), ShopWeekSeconds);
                SaleCount = MiniJson.ToInt(Get(shop, "saleCount"), SaleCount);
                SaleNum = MiniJson.ToInt(Get(shop, "saleNum"), SaleNum);
                SaleDen = MiniJson.ToInt(Get(shop, "saleDen"), SaleDen);
                if (Get(shop, "notForSale") is List<object> nf)
                {
                    NotForSale = new string[nf.Count];
                    for (int k = 0; k < nf.Count; k++) NotForSale[k] = (string)nf[k];
                }
            }
            // shopFeatured's two lists: regular wearables for sale, and limited pieces (ascending id)
            var reg = new List<int>();
            var lim = new List<int>();
            foreach (int id in CosmeticIds)
            {
                var c = Cosmetics[id];
                if (ForSale(c) && !c.Limited && !c.HasGrant) reg.Add(id);
                if (c.Limited) lim.Add(id);
            }
            regular = reg.ToArray();
            limited = lim.ToArray();
            Root = root;
            Loaded = true;
        }

        // ---------- rules.js's functions ----------
        // the tool tier a block needs: its own, else 1 for stone, else 0
        public static int ReqTier(int id)
        {
            var b = Block(id);
            if (b == null) return 0;
            return b.HasTier ? b.Tier : b.Stone ? 1 : 0;
        }

        // what a placed item becomes: the block itself, or its 4 orientations (stairs, ladders, gates,
        // furniture), the 4 door facings, the 4 bed feet. Empty when it isn't a block.
        public static int[] PlaceIds(int it)
        {
            var b = Block(it);
            if (b == null) return new int[0];
            if (b.Shape == "stairs" || b.Shape == "ladder" || b.Gate != null || b.Faces)
            {
                int bs = b.HasDrop ? b.Drop : it;
                return new[] { bs, bs + 1, bs + 2, bs + 3 };
            }
            if (b.Shape == "door") return new[] { 48, 52, 56, 60 };
            if (b.Shape == "bed0f") return new[] { 137, 138, 139, 140 };
            return new[] { it };
        }

        public static double ShopWeek(double unixSeconds) => Math.Floor((unixSeconds - ShopEpoch) / ShopWeekSeconds);
        public static double ShopWeek() => ShopWeek(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0);

        public static bool ForSale(Cosmetic c) => Array.IndexOf(NotForSale, c.Category) < 0 && c.Price > 0;

        public static ShopPicks ShopFeatured(double week)
        {
            int n = regular.Length;
            var p = new ShopPicks { Sale = new int[n > 0 ? SaleCount : 0], Limited = -1 };
            for (int k = 0; k < p.Sale.Length; k++) p.Sale[k] = Pick(regular, week * SaleCount + k);
            if (limited.Length > 0) p.Limited = Pick(limited, week);
            return p;
        }

        public static int ShopPrice(int id, double week)
        {
            var c = Cosmetics[id];
            var s = ShopFeatured(week).Sale;
            return Array.IndexOf(s, id) >= 0 ? (int)Math.Floor((double)c.Price * SaleNum / SaleDen) : c.Price;
        }

        // a[i % n] with JavaScript's remainder (sign of the dividend): a negative index is undefined (-1)
        static int Pick(int[] a, double i)
        {
            double r = i % a.Length;
            if (r < 0 || double.IsNaN(r)) return -1;
            return a[(int)r];
        }

        // ---------- reading ----------
        static Dictionary<string, object> Obj(Dictionary<string, object> root, string k) =>
            root.TryGetValue(k, out var v) && v is Dictionary<string, object> d ? d : new Dictionary<string, object>();

        static object Get(Dictionary<string, object> d, string k) => d.TryGetValue(k, out var v) ? v : null;
        static string Str(Dictionary<string, object> d, string k) => Get(d, k) as string;
        static bool Has(Dictionary<string, object> d, string k) => d.TryGetValue(k, out var v) && v != null;

        static int[] Ints(object v)
        {
            if (!(v is List<object> l)) return null;
            var a = new int[l.Count];
            for (int k = 0; k < a.Length; k++) a[k] = MiniJson.ToInt(l[k]);
            return a;
        }

        static double[] Doubles(object v)
        {
            if (!(v is List<object> l)) return null;
            var a = new double[l.Count];
            for (int k = 0; k < a.Length; k++) a[k] = MiniJson.ToDouble(l[k]);
            return a;
        }

        static void ReadPairs(Dictionary<string, object> root, string k, List<string[]> into)
        {
            if (!(Get(root, k) is List<object> l)) return;
            foreach (var e in l)
            {
                var p = (List<object>)e;
                into.Add(new[] { (string)p[0], (string)p[1] });
            }
        }

        static BlockDef ReadBlock(int id, Dictionary<string, object> d)
        {
            var b = new BlockDef { Id = id, Raw = d, N = Str(d, "n"), T = Ints(Get(d, "t")), TOn = Ints(Get(d, "tOn")) };
            if (Has(d, "x")) b.X = MiniJson.ToInt(d["x"]);
            b.HasH = Has(d, "h");
            b.H = b.HasH ? MiniJson.ToDouble(d["h"]) : double.NaN; // NaN like JavaScript's undefined in arithmetic
            if (Has(d, "drop")) { b.HasDrop = true; b.Drop = MiniJson.ToInt(d["drop"]); }
            b.Stone = MiniJson.Truthy(Get(d, "stone"));
            b.Leaf = MiniJson.Truthy(Get(d, "leaf"));
            b.Glass = MiniJson.Truthy(Get(d, "glass"));
            b.Water = MiniJson.Truthy(Get(d, "water"));
            b.Pass = MiniJson.Truthy(Get(d, "pass"));
            b.Open = MiniJson.Truthy(Get(d, "open"));
            b.Top = MiniJson.Truthy(Get(d, "top"));
            b.On = MiniJson.Truthy(Get(d, "on"));
            b.Faces = MiniJson.Truthy(Get(d, "faces"));
            b.Sign = MiniJson.Truthy(Get(d, "sign"));
            b.Shape = Str(d, "shape");
            if (b.Shape == "") b.Shape = null; // falsy in rules.js
            b.Gate = Str(d, "gate");
            b.O = MiniJson.ToInt(Get(d, "o"));
            b.F = MiniJson.ToInt(Get(d, "f"));
            if (Has(d, "tier")) { b.HasTier = true; b.Tier = MiniJson.ToInt(d["tier"]); }
            if (Has(d, "icon")) { b.HasIcon = true; b.Icon = MiniJson.ToInt(d["icon"]); }
            if (Get(d, "boxes") is List<object> bx)
            {
                b.Boxes = new double[bx.Count][];
                for (int k = 0; k < bx.Count; k++) b.Boxes[k] = Doubles(bx[k]);
            }
            if (Get(d, "bt") is List<object> bt)
            {
                b.Bt = new int[bt.Count][];
                for (int k = 0; k < bt.Count; k++) b.Bt[k] = Ints(bt[k]);
            }
            return b;
        }

        static ItemDef ReadItem(int id, Dictionary<string, object> d)
        {
            var it = new ItemDef { Id = id, Raw = d, N = Str(d, "n"), Icon = MiniJson.ToInt(Get(d, "icon")), Use = Str(d, "use") };
            if (Has(d, "tool")) { it.HasTool = true; it.Tool = MiniJson.ToDouble(d["tool"]); }
            if (Has(d, "tier")) { it.HasTier = true; it.Tier = MiniJson.ToInt(d["tier"]); }
            if (Has(d, "dmg")) { it.HasDmg = true; it.Dmg = MiniJson.ToDouble(d["dmg"]); }
            if (Has(d, "armor")) { it.HasArmor = true; it.Armor = MiniJson.ToDouble(d["armor"]); }
            if (Has(d, "boots")) { it.HasBoots = true; it.Boots = MiniJson.ToDouble(d["boots"]); }
            it.Nft = MiniJson.Truthy(Get(d, "nft"));
            it.Ranged = MiniJson.Truthy(Get(d, "ranged"));
            if (Get(d, "hover") is Dictionary<string, object> h)
            {
                it.HoverModel = Str(h, "model");
                it.HoverK = MiniJson.ToInt(Get(h, "k"));
            }
            return it;
        }

        static Recipe ReadRecipe(Dictionary<string, object> d)
        {
            var r = new Recipe { Raw = d, Out = MiniJson.ToInt(Get(d, "out")), N = MiniJson.ToInt(Get(d, "n")), D = Str(d, "d"), Cat = Str(d, "cat") };
            r.Nft = MiniJson.Truthy(Get(d, "nft"));
            if (Has(d, "req")) { r.HasReq = true; r.Req = MiniJson.ToInt(d["req"]); }
            var need = Get(d, "need") as Dictionary<string, object> ?? new Dictionary<string, object>();
            r.NeedIds = new int[need.Count];
            r.NeedCounts = new int[need.Count];
            int k = 0;
            foreach (var kv in need)
            {
                r.NeedIds[k] = int.Parse(kv.Key);
                r.NeedCounts[k++] = MiniJson.ToInt(kv.Value);
            }
            return r;
        }

        static Cosmetic ReadCosmetic(int id, Dictionary<string, object> d)
        {
            var c = new Cosmetic
            {
                Id = id,
                Raw = d,
                N = Str(d, "n"),
                Category = Str(d, "category"),
                Slot = Str(d, "slot"),
                Style = Str(d, "style"),
                Set = Str(d, "set"),
                Color = Str(d, "color"),
                Pants = Str(d, "pants"),
                Accent = Str(d, "accent"),
                Detail = Str(d, "detail"),
                Emote = Str(d, "emote"),
                Price = MiniJson.ToInt(Get(d, "price")),
                Eur = MiniJson.ToInt(Get(d, "eur")),
                Limited = MiniJson.Truthy(Get(d, "limited")),
                Retired = MiniJson.Truthy(Get(d, "retired")),
                Prime = MiniJson.Truthy(Get(d, "prime")),
            };
            // rules.js tests c.grantItem's truthiness
            if (MiniJson.Truthy(Get(d, "grantItem")))
            {
                c.HasGrant = true;
                c.GrantItem = MiniJson.ToInt(d["grantItem"]);
                c.GrantQty = MiniJson.ToInt(Get(d, "grantQty"));
            }
            return c;
        }
    }
}
