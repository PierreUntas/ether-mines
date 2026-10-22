// Ether Mines · what you carry (06-actions.js setInv, addUnique; 07-interface.js heldTool/heldTier): counts
// of blocks and items from the server (`inventory`), unique numbered items (`uniques`: tools, weapons,
// hovercrafts...), and the 9-slot bar. A bar slot holds an item id as a string ("9") or a unique as
// "nft<serial>", as the web version's save does, so both versions read the same bar.
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public sealed class Unique
    {
        public long Serial;
        public int Id;
        public string Place;
        public int Mined;
    }

    public sealed class Inventory
    {
        public readonly Dictionary<int, int> Counts = new Dictionary<int, int>();
        public readonly List<Unique> Uniques = new List<Unique>();
        public readonly string[] Bar = new string[9];
        public int Sel;
        public event Action<int, int, int> Gained; // item, how many more, total

        public int Count(int id) => Counts.TryGetValue(id, out var n) ? n : 0;

        public Unique UniqueOf(string key)
        {
            if (key == null || !key.StartsWith("nft", StringComparison.Ordinal)) return null;
            if (!long.TryParse(key.Substring(3), out var s)) return null;
            foreach (var u in Uniques) if (u.Serial == s) return u;
            return null;
        }

        // the item id behind a bar slot (14-startup.js itemId)
        public int ItemId(string key)
        {
            if (string.IsNullOrEmpty(key)) return 0;
            if (key.StartsWith("nft", StringComparison.Ordinal)) { var u = UniqueOf(key); return u != null ? u.Id : 201; }
            return int.TryParse(key, out var id) ? id : 0;
        }

        public string Held => Bar[Sel];
        public int HeldId => ItemId(Held);
        public double HeldTool { get { var it = Rules.Item(HeldId); return it != null && it.HasTool ? it.Tool : 1; } }
        public int HeldTier { get { var it = Rules.Item(HeldId); return it != null && it.HasTier ? it.Tier : 0; } }
        public bool CanMine(int blockId) => HeldTier >= Rules.ReqTier(blockId);

        // the server's word on some counts ({"9": 12, "101": 0}): kept, and what's new lands in a free bar slot
        public void SetCounts(Dictionary<string, object> inv)
        {
            if (inv == null) return;
            foreach (var kv in inv)
            {
                if (!int.TryParse(kv.Key, out var id)) continue;
                int n = MiniJson.ToInt(kv.Value), old = Count(id);
                if (n > 0) Counts[id] = n;
                else
                {
                    Counts.Remove(id);
                    var it = Rules.Item(id);
                    if (it == null || !it.Nft) { int b = Array.IndexOf(Bar, kv.Key); if (b >= 0) Bar[b] = null; }
                }
                if (n > old)
                {
                    if (Array.IndexOf(Bar, kv.Key) < 0) { int e = Array.IndexOf(Bar, null); if (e >= 0) Bar[e] = kv.Key; }
                    Gained?.Invoke(id, n - old, n);
                }
            }
        }

        public void AddUnique(Unique u, bool toBar)
        {
            foreach (var x in Uniques) if (x.Serial == u.Serial) return;
            Uniques.Add(u);
            if (toBar && u.Id != 203)
            {
                int e = Array.IndexOf(Bar, null);
                Bar[e >= 0 ? e : Sel] = "nft" + u.Serial;
            }
        }

        // a bar slot pointing at something you no longer have is emptied
        public void Tidy()
        {
            for (int i = 0; i < Bar.Length; i++)
            {
                var k = Bar[i];
                if (k == null) continue;
                if (k.StartsWith("nft", StringComparison.Ordinal)) { if (UniqueOf(k) == null) Bar[i] = null; }
                else if (!int.TryParse(k, out var id) || Count(id) <= 0) Bar[i] = null;
            }
        }
    }
}
