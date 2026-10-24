// Ether Mines · the game with no network: a server on the device. It answers everything the client asks
// Supabase (Supabase.cs routes its Select, Rpc and Upsert here when playing offline) the way the act_*
// functions do (supabase/migrations: _core_mine, _core_place, _core_craft, _core_relight, the chests, the
// validators and their Gwei, the chapters, the shop, signs...), on the generated world plus what you
// changed, kept in a save file per world on the device. What needs other players (plots, trades, reports)
// says so, as the web's solo mode does. Nothing here reaches the online worlds.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class LocalServer
    {
        const string LoginKey = "ether-mines:offline-login", IdKey = "ether-mines:offline-id";
        public readonly string UserId;
        string Login { get => PlayerPrefs.GetString(LoginKey, ""); set { PlayerPrefs.SetString(LoginKey, value ?? ""); PlayerPrefs.Save(); } }
        readonly System.Random rnd = new System.Random();
        double R() => rnd.NextDouble();
        static string NowIso => DateTime.UtcNow.ToString("o");
        static double NowS => (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;

        public LocalServer()
        {
            UserId = PlayerPrefs.GetString(IdKey, "");
            if (UserId.Length == 0) { UserId = "local-" + Guid.NewGuid().ToString("N").Substring(0, 12); PlayerPrefs.SetString(IdKey, UserId); PlayerPrefs.Save(); }
        }

        // ---------- one save per world ----------
        sealed class W
        {
            public string Name, File;
            public Dictionary<string, object> D;
            public ChunkStore Store = new ChunkStore();
            public bool Dirty;
            public Dictionary<string, object> Obj(string k) { if (!(D.TryGetValue(k, out var o) && o is Dictionary<string, object> d)) D[k] = d = new Dictionary<string, object>(); return d; }
            public List<object> List(string k) { if (!(D.TryGetValue(k, out var o) && o is List<object> l)) D[k] = l = new List<object>(); return l; }
            public double Num(string k) => MiniJson.ToDouble(D.TryGetValue(k, out var v) ? v : null);
            public void Set(string k, double v) { D[k] = v; Dirty = true; }
        }
        readonly Dictionary<string, W> worlds = new Dictionary<string, W>();
        float flushT;

        W World(string name)
        {
            name = string.IsNullOrEmpty(name) ? "offline" : name;
            if (worlds.TryGetValue(name, out var w)) return w;
            w = new W { Name = name, File = Path.Combine(Application.persistentDataPath, "offline-" + name + ".json") };
            try { w.D = File.Exists(w.File) ? MiniJson.Parse(File.ReadAllText(w.File)) as Dictionary<string, object> : null; }
            catch (Exception e) { Debug.LogWarning(e); }
            w.D ??= new Dictionary<string, object> { ["v"] = 1.0 };
            // the changes you made, laid over the generated world
            foreach (var kv in w.Obj("edits"))
            {
                var p = kv.Key.Split(',');
                var e = kv.Value as Dictionary<string, object>;
                if (p.Length != 3 || e == null) continue;
                w.Store.Edit(new BlockEdit { X = int.Parse(p[0]), Y = int.Parse(p[1]), Z = int.Parse(p[2]), Id = MiniJson.ToInt(e["id"]), PlacedBy = e.TryGetValue("placed_by", out var b) ? b as string : null, PlacedName = e.TryGetValue("placed_name", out var n) ? n as string : null, Serial = (long)MiniJson.ToDouble(e.TryGetValue("serial", out var s) ? s : null) });
            }
            worlds[name] = w;
            return w;
        }

        // the saves go to disk a moment after they change, and right away when the game leaves (Flush)
        public void Tick(float dt) { if ((flushT -= dt) <= 0) { flushT = 2; Flush(); } }
        public void Flush()
        {
            foreach (var w in worlds.Values)
            {
                if (!w.Dirty) continue;
                w.Dirty = false;
                try { File.WriteAllText(w.File + ".tmp", MiniJson.Write(w.D)); if (File.Exists(w.File)) File.Delete(w.File); File.Move(w.File + ".tmp", w.File); }
                catch (Exception e) { Debug.LogWarning(e); w.Dirty = true; }
            }
        }

        // ---------- the world as the server reads it (_cell) ----------
        int Cell(W w, int x, int y, int z)
        {
            if (y < 0 || y >= EtherMines.Core.World.SY) return 0;
            int cx = x >> 4, cz = z >> 4;
            if (!w.Store.Has(cx, cz)) w.Store.Put(cx, cz, null, EtherMines.Core.World.SY);
            return w.Store.Get(x, y, z);
        }
        static string K(int x, int y, int z) => x + "," + y + "," + z;
        static string Kind(int id) { var b = Rules.Block(id); return b == null ? "cube" : b.Water ? "water" : b.IsCross ? "cross" : b.Shape ?? "cube"; }
        static bool Solid(int id) { var b = Rules.Block(id); return b != null && id != 0 && !b.Water && !b.IsCross && !b.Pass; }
        static bool PublicZone(int x, int z) => Math.Sqrt((x - 8) * (x - 8) + (z - 8) * (z - 8)) <= 7.9 || Math.Sqrt((x - 8) * (x - 8) + (z + 56) * (z + 56)) <= 30.5;

        // a cell written (_set): the edit kept, its history logged, the change told back
        Dictionary<string, object> Set(W w, int x, int y, int z, int id, string by, string name, long serial, bool log = true)
        {
            int prev = Cell(w, x, y, z);
            var e = new Dictionary<string, object> { ["id"] = (double)id, ["placed_by"] = by, ["placed_name"] = name, ["serial"] = by != null ? (object)(double)serial : null, ["updated_at"] = NowIso };
            w.Obj("edits")[K(x, y, z)] = e;
            w.Store.Edit(new BlockEdit { X = x, Y = y, Z = z, Id = id, PlacedBy = by, PlacedName = name, Serial = serial });
            if (log)
            {
                var h = w.Obj("history");
                if (!(h.TryGetValue(K(x, y, z), out var lo) && lo is List<object> l)) h[K(x, y, z)] = l = new List<object>();
                l.Insert(0, new Dictionary<string, object> { ["at"] = NowIso, ["id"] = (double)id, ["prev"] = (double)prev, ["name"] = Login });
                while (l.Count > 12) l.RemoveAt(l.Count - 1);
            }
            w.Dirty = true;
            return new Dictionary<string, object> { ["x"] = (double)x, ["y"] = (double)y, ["z"] = (double)z, ["id"] = (double)id, ["by"] = by, ["name"] = name, ["serial"] = by != null ? (object)(double)serial : null };
        }
        Dictionary<string, object> Edit(W w, int x, int y, int z) => w.Obj("edits").TryGetValue(K(x, y, z), out var e) ? e as Dictionary<string, object> : null;

        // ---------- your bag ----------
        int Count(W w, int id) => MiniJson.ToInt(w.Obj("inventory").TryGetValue(id.ToString(), out var v) ? v : null);
        void Give(W w, Dictionary<string, object> inv, int id, int n)
        {
            int c = Math.Max(0, Count(w, id) + n);
            w.Obj("inventory")[id.ToString()] = (double)c;
            inv[id.ToString()] = (double)c;
            w.Dirty = true;
        }
        List<Dictionary<string, object>> Uniques(W w) => w.List("uniques").OfType<Dictionary<string, object>>().ToList();
        bool HasUnique(W w, int item) => Uniques(w).Any(u => MiniJson.ToInt(u["item"]) == item);
        Dictionary<string, object> Mint(W w, int item, string place = null, object validator = null)
        {
            double serial = w.List("uniques").OfType<Dictionary<string, object>>().Select(u => MiniJson.ToDouble(u["serial"])).DefaultIfEmpty(0).Max() + 1;
            var u = new Dictionary<string, object> { ["serial"] = serial, ["item"] = (double)item, ["place"] = place, ["mined"] = 0.0, ["validator_id"] = validator, ["created_at"] = NowIso };
            w.List("uniques").Add(u);
            w.Dirty = true;
            return new Dictionary<string, object> { ["serial"] = serial, ["id"] = (double)item, ["place"] = place, ["date"] = DateTime.UtcNow.ToString("dd/MM/yyyy"), ["mined"] = 0.0 };
        }

        static Dictionary<string, object> No(string err, Dictionary<string, object> extra = null)
        {
            var r = new Dictionary<string, object> { ["ok"] = false, ["err"] = err };
            if (extra != null) foreach (var kv in extra) r[kv.Key] = kv.Value;
            return r;
        }
        static Dictionary<string, object> CellOf(int id) => new Dictionary<string, object> { ["cell"] = (double)id };
        static int I(Dictionary<string, object> a, string k) => MiniJson.ToInt(a.TryGetValue(k, out var v) ? v : null);
        static double D(Dictionary<string, object> a, string k) => MiniJson.ToDouble(a.TryGetValue(k, out var v) ? v : null);
        static string S(Dictionary<string, object> a, string k) => a.TryGetValue(k, out var v) ? v as string : null;

        // within reach (_check_pos): from your eyes to the block's center, 6.5 at most
        static bool Reach(Dictionary<string, object> a, int x, int y, int z)
        {
            double ex = D(a, "ex"), ey = D(a, "ey") + 1.6, ez = D(a, "ez");
            return Math.Sqrt((x + 0.5 - ex) * (x + 0.5 - ex) + (y + 0.5 - ey) * (y + 0.5 - ey) + (z + 0.5 - ez) * (z + 0.5 - ez)) <= 6.5;
        }

        // ---------- what Supabase.cs routes here ----------
        public object Rpc(string name, Dictionary<string, object> a)
        {
            a ??= new Dictionary<string, object>();
            switch (name)
            {
                case "act_my_login": return new Dictionary<string, object> { ["ok"] = true, ["login"] = Login.Length > 0 ? Login : null, ["must_change"] = false, ["moved"] = null };
                case "act_enter":
                {
                    var nick = (S(a, "nick") ?? "").Trim();
                    if (nick.Length < 2 || nick.Length > 16) return No("bad nickname");
                    Login = nick;
                    return new Dictionary<string, object> { ["ok"] = true, ["login"] = nick, ["must_change"] = false, ["created"] = true };
                }
                case "act_set_password": return new Dictionary<string, object> { ["ok"] = true };
                case "is_username_taken": return false;
                case "act_chat":
                {
                    var t = System.Text.RegularExpressions.Regex.Replace(S(a, "msg") ?? "", @"\s+", " ").Trim();
                    return new Dictionary<string, object> { ["ok"] = true, ["text"] = t.Length > 140 ? t.Substring(0, 140) : t };
                }
                case "act_report": case "act_report_sign": return No("reports need an online game");
                case "block_info": return BlockInfo(World(S(a, "w")), I(a, "px"), I(a, "py"), I(a, "pz"));
            }
            if (!name.StartsWith("act_", StringComparison.Ordinal)) return No("offline");
            var w = World(S(a, "w"));
            var r = Act(w, name.Substring(4), a);
            return r;
        }

        Dictionary<string, object> Act(W w, string name, Dictionary<string, object> a)
        {
            switch (name)
            {
                case "mine": return Mine(w, a);
                case "place": return Place(w, a);
                case "toggle": return Toggle(w, a);
                case "pos": return new Dictionary<string, object> { ["ok"] = true };
                case "chest": return Chest(w, a, false);
                case "chest_move": return Chest(w, a, true);
                case "craft": return Craft(w, a);
                case "relight": return Relight(w, a);
                case "use_item": return UseItem(w, a);
                case "gift": return Gift(w, a);
                case "rewards": return Rewards(w);
                case "maintain_validator": return Maintain(w, a);
                case "upgrade_validator": return Upgrade(w, a);
                case "claim_chapter": return ClaimChapter(w, a);
                case "buy_cosmetic": return Buy(w, a);
                case "network": return Network(w);
                case "leaderboard": return Leaderboard(w);
                case "sign": return Sign(w, a);
                case "offers": return new Dictionary<string, object> { ["ok"] = true, ["offers"] = new List<object>() };
                case "offer": case "offer_accept": case "offer_close": return No("trades need an online game");
                case "claim": case "unclaim": case "member": return No("claims need an online game");
            }
            return No("not available offline");
        }

        // ---------- mining (_core_mine) ----------
        Dictionary<string, object> Mine(W w, Dictionary<string, object> a)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz");
            int id = Cell(w, px, py, pz);
            if (!Reach(a, px, py, pz)) return No("too far", CellOf(id));
            var b = Rules.Block(id);
            if (id == 0 || b == null || !b.HasH || double.IsInfinity(b.H)) return No("nothing to mine", CellOf(id));
            if (PublicZone(px, pz)) return No("protected", CellOf(id));
            // the tool: the wooden pickaxe from the bag, or a unique held (a blade gives no tier)
            string held = S(a, "held");
            int tier = 0;
            Dictionary<string, object> heldU = null;
            if (held == "102" && Count(w, 102) > 0) tier = Rules.Item(102)?.Tier ?? 1;
            else if (held != null && held.StartsWith("nft", StringComparison.Ordinal) && double.TryParse(held.Substring(3), out var ser))
            {
                heldU = Uniques(w).FirstOrDefault(u => MiniJson.ToDouble(u["serial"]) == ser);
                var it = heldU != null ? Rules.Item(MiniJson.ToInt(heldU["item"])) : null;
                if (it != null && it.HasTier) tier = it.Tier;
            }
            if (tier < Rules.ReqTier(id)) return No("tool too weak", CellOf(id));
            var changes = new List<object>();
            var inv = new Dictionary<string, object>();
            changes.Add(Set(w, px, py, pz, 0, null, null, 0));
            // a door's other half, a bed's other half
            if (b.Shape == "door")
            {
                int oy = b.Top ? py - 1 : py + 1;
                if (Kind(Cell(w, px, oy, pz)) == "door") changes.Add(Set(w, px, oy, pz, 0, null, null, 0));
            }
            else if (b.IsBed)
            {
                var o = BedOther(b.Shape);
                if (Rules.Block(Cell(w, px + o.dx, py, pz + o.dz))?.IsBed == true) changes.Add(Set(w, px + o.dx, py, pz + o.dz, 0, null, null, 0));
            }
            // what stood on it: a plant goes, a plate, a cable or a lever comes back to the bag
            int up = Cell(w, px, py + 1, pz);
            string uk = Kind(up);
            if (uk == "cross") changes.Add(Set(w, px, py + 1, pz, 0, null, null, 0));
            else if (uk == "plate" || uk == "cable" || uk == "lever")
            {
                changes.Add(Set(w, px, py + 1, pz, 0, null, null, 0));
                var ub = Rules.Block(up);
                int ud = ub != null && ub.HasDrop ? ub.Drop : up;
                if (ud != 0) Give(w, inv, ud, 1);
            }
            int drop = b.HasDrop ? b.Drop : id, n = drop == 101 ? 1 + (R() < 0.4 ? 1 : 0) : drop == 104 ? (R() < 0.4 ? 1 : 0) : 1;
            if (drop != 0 && n > 0) Give(w, inv, drop, n);
            if (heldU != null) { heldU["mined"] = MiniJson.ToDouble(heldU["mined"]) + 1; w.Dirty = true; }
            // a chest mined: what was inside comes to you
            if (id == 98 && w.Obj("chests").TryGetValue(K(px, py, pz), out var co) && co is Dictionary<string, object> chest)
            {
                foreach (var kv in chest) Give(w, inv, int.Parse(kv.Key), MiniJson.ToInt(kv.Value));
                w.Obj("chests").Remove(K(px, py, pz));
            }
            return new Dictionary<string, object> { ["ok"] = true, ["changes"] = changes, ["inv"] = inv, ["got"] = new Dictionary<string, object> { ["item"] = drop != 0 ? (object)(double)drop : null, ["n"] = (double)n } };
        }

        // a bed's other half (bed0f..bed3h): the foot's head, the head's foot
        static (int dx, int dz) BedOther(string shape)
        {
            int f = shape[3] - '0';
            bool foot = shape[4] == 'f';
            var o = f == 0 ? (0, -1) : f == 1 ? (-1, 0) : f == 2 ? (0, 1) : (1, 0);
            return foot ? o : (-o.Item1, -o.Item2);
        }

        // ---------- placing (_core_place) ----------
        Dictionary<string, object> Place(W w, Dictionary<string, object> a)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz"), it = I(a, "it"), bid = I(a, "bid");
            if (!Reach(a, px, py, pz)) return No("too far", CellOf(Cell(w, px, py, pz)));
            var bb = Rules.Block(bid);
            if (bb != null && Solid(bid) && bb.Shape != "door")
            {
                double ex = D(a, "ex"), ey = D(a, "ey"), ez = D(a, "ez");
                if (px < ex + 0.3 && px + 1 > ex - 0.3 && pz < ez + 0.3 && pz + 1 > ez - 0.3 && py < ey + 1.75 && py + 1 > ey) return No("space occupied");
            }
            if (py < 1 || py >= EtherMines.Core.World.SY || Math.Abs(px) >= 100000 || Math.Abs(pz) >= 100000) return No("out of the world");
            var ib = Rules.Block(it);
            if (it == 11 || it == 12 || it == 73 || it == 74 || ib == null || (ib.HasDrop && ib.Drop != it) || Array.IndexOf(Rules.PlaceIds(it), bid) < 0) return No("item not placeable");
            if (bid == 13) return No("validators are relit, not built");
            if (Count(w, it) < 1) return No("empty inventory", new Dictionary<string, object> { ["inv"] = new Dictionary<string, object> { [it.ToString()] = 0.0 } });
            if (PublicZone(px, pz)) return No("protected");
            int cur = Cell(w, px, py, pz);
            if (cur != 0 && Kind(cur) != "water" && Kind(cur) != "cross") return No("space occupied", CellOf(cur));
            string k = Kind(bid);
            int below = Cell(w, px, py - 1, pz);
            if (k == "cross" && below != 1 && below != 2) return No("needs support");
            if ((k == "plate" || k == "cable" || k == "lever") && !Solid(below)) return No("needs support");
            if (k == "door")
            {
                if (py + 1 >= EtherMines.Core.World.SY) return No("out of the world");
                int above = Cell(w, px, py + 1, pz);
                if (above != 0 && Kind(above) != "water" && Kind(above) != "cross") return No("space occupied");
            }
            (int dx, int dz) bo = (0, 0);
            if (bb != null && bb.IsBed && bb.Shape.EndsWith("f", StringComparison.Ordinal))
            {
                bo = BedOther(bb.Shape);
                int other = Cell(w, px + bo.dx, py, pz + bo.dz);
                if (other != 0 && Kind(other) != "water" && Kind(other) != "cross") return No("space occupied", CellOf(other));
            }
            var inv = new Dictionary<string, object>();
            Give(w, inv, it, -1);
            long serial = (long)w.Num("serial") + 1;
            w.Set("serial", serial);
            var changes = new List<object> { Set(w, px, py, pz, bid, UserId, Login, serial) };
            if (k == "door") changes.Add(Set(w, px, py + 1, pz, bid + 1, UserId, Login, serial));
            if (bb != null && bb.IsBed && bb.Shape.EndsWith("f", StringComparison.Ordinal)) changes.Add(Set(w, px + bo.dx, py, pz + bo.dz, bid + 4, UserId, Login, serial));
            return new Dictionary<string, object> { ["ok"] = true, ["changes"] = changes, ["inv"] = inv, ["serial"] = (double)serial };
        }

        // ---------- doors and levers ----------
        Dictionary<string, object> Toggle(W w, Dictionary<string, object> a)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz");
            int id = Cell(w, px, py, pz);
            if (!Reach(a, px, py, pz)) return No("too far", CellOf(id));
            string k = Kind(id);
            if (k != "door" && k != "lever") return No("nothing to toggle", CellOf(id));
            var changes = new List<object>();
            Dictionary<string, object> Flip(int x, int y, int z, int nid)
            {
                var e = Edit(w, x, y, z);
                string by = e != null ? S(e, "placed_by") : null, nm = e != null ? S(e, "placed_name") : null;
                long ser = e != null ? (long)D(e, "serial") : 0;
                return Set(w, x, y, z, nid, by, nm, ser, false);
            }
            if (k == "lever") changes.Add(Flip(px, py, pz, id == 64 ? 65 : 64));
            else
            {
                changes.Add(Flip(px, py, pz, id ^ 2));
                int oy = Rules.Block(id).Top ? py - 1 : py + 1, other = Cell(w, px, oy, pz);
                if (Kind(other) == "door") changes.Add(Flip(px, oy, pz, other ^ 2));
            }
            return new Dictionary<string, object> { ["ok"] = true, ["changes"] = changes };
        }

        // ---------- chests ----------
        Dictionary<string, object> Chest(W w, Dictionary<string, object> a, bool move)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz");
            if (!Reach(a, px, py, pz)) return No("too far");
            if (Cell(w, px, py, pz) != 98) return No("no chest here");
            if (PublicZone(px, pz)) return No("protected");
            var chests = w.Obj("chests");
            string key = K(px, py, pz);
            if (!(chests.TryGetValue(key, out var co) && co is Dictionary<string, object> items))
            {
                items = new Dictionary<string, object>();
                // a tower's treasure, placed by the generator: filled the first time it's opened
                bool untouched = Edit(w, px, py, pz) == null && !w.Obj("history").ContainsKey(key);
                if (untouched)
                {
                    items["101"] = (double)(15 + rnd.Next(11));
                    items["103"] = (double)(4 + rnd.Next(5));
                    items["110"] = 1.0;
                    if (R() < 0.5) items["104"] = 1.0;
                }
                chests[key] = items;
                w.Dirty = true;
            }
            if (!move) return new Dictionary<string, object> { ["ok"] = true, ["items"] = items };
            int item = I(a, "item"), n = I(a, "n");
            if (n == 0 || Math.Abs(n) > 10000) return No("invalid quantity");
            var inv = new Dictionary<string, object>();
            string ik = item.ToString();
            int have = MiniJson.ToInt(items.TryGetValue(ik, out var hv) ? hv : null);
            if (n > 0)
            {
                if (Count(w, item) < n) return No("not enough in your bag");
                if (have == 0 && items.Count >= 27) return No("chest full");
                Give(w, inv, item, -n);
                items[ik] = (double)(have + n);
            }
            else
            {
                n = Math.Max(n, -have);
                if (n == 0) return No("none of that item in the chest");
                Give(w, inv, item, -n);
                if (have + n <= 0) items.Remove(ik); else items[ik] = (double)(have + n);
            }
            w.Dirty = true;
            return new Dictionary<string, object> { ["ok"] = true, ["items"] = items, ["inv"] = inv };
        }

        // ---------- crafting (_core_craft) ----------
        Dictionary<string, object> Craft(W w, Dictionary<string, object> a)
        {
            int outId = I(a, "out_id");
            var rc = Rules.Recipes.FirstOrDefault(r => r.Out == outId);
            if (rc == null) return No("unknown recipe");
            if (rc.HasReq && !HasUnique(w, rc.Req)) return No("needs a trophy", new Dictionary<string, object> { ["item"] = (double)rc.Req });
            for (int i = 0; i < rc.NeedIds.Length; i++) if (Count(w, rc.NeedIds[i]) < rc.NeedCounts[i]) return No("missing ingredients", new Dictionary<string, object> { ["item"] = (double)rc.NeedIds[i] });
            var inv = new Dictionary<string, object>();
            for (int i = 0; i < rc.NeedIds.Length; i++) Give(w, inv, rc.NeedIds[i], -rc.NeedCounts[i]);
            if (rc.Nft) return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["unique"] = Mint(w, outId) };
            Give(w, inv, outId, Math.Max(1, rc.N));
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv };
        }

        // ---------- validators (_core_relight, _tick_validator, maintain, upgrade) ----------
        static readonly Dictionary<string, (int prod, int cost)> Bases = new Dictionary<string, (int, int)> { ["common"] = (12, 2), ["rare"] = (25, 5), ["epic"] = (50, 10), ["legendary"] = (100, 20) };
        static void Stats(Dictionary<string, object> v)
        {
            var (bp, bc) = Bases.TryGetValue(S(v, "rarity") ?? "common", out var b) ? b : Bases["common"];
            int level = Math.Max(1, I(v, "level"));
            v["gwei_per_cycle"] = Math.Floor(bp * (1 + 0.15 * (level - 1)));
            v["maintenance_cost"] = Math.Floor(bc * (1 + 0.15 * (level - 1)));
        }
        List<Dictionary<string, object>> Validators(W w) => w.List("validators").OfType<Dictionary<string, object>>().ToList();
        int Relit(W w) => w.Obj("edits").Values.OfType<Dictionary<string, object>>().Count(e => MiniJson.ToInt(e["id"]) == 74);

        Dictionary<string, object> Relight(W w, Dictionary<string, object> a)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz");
            int id = Cell(w, px, py, pz);
            if (!Reach(a, px, py, pz)) return No("too far", CellOf(id));
            if (id != 73) return No("not a dark validator", CellOf(id));
            for (int i = 0; i < 3; i++) if (!Solid(Cell(w, px + 2, py + i, pz + 2))) return No("rebuild the fourth column first");
            if (Count(w, 105) < 1) return No("needs a validator heart");
            var inv = new Dictionary<string, object>();
            Give(w, inv, 105, -1);
            long serial = (long)w.Num("serial") + 1;
            w.Set("serial", serial);
            var changes = new List<object> { Set(w, px, py, pz, 74, UserId, Login, serial) };
            double r = R();
            string rarity = r < 0.6 ? "common" : r < 0.85 ? "rare" : r < 0.97 ? "epic" : "legendary";
            double vid = w.Num("nextValidatorId") + 1;
            w.Set("nextValidatorId", vid);
            var v = new Dictionary<string, object>
            {
                ["id"] = vid, ["world"] = w.Name, ["x"] = (double)px, ["y"] = (double)py, ["z"] = (double)pz, ["owner"] = UserId, ["owner_name"] = Login, ["state"] = "active",
                ["rarity"] = rarity, ["level"] = 1.0, ["specialty"] = null, ["missed_cycles"] = 0.0,
                // attested at relight: the online one turns corrupted at its first cycle unless attested at once
                ["last_cycle_at"] = NowIso, ["last_attested_at"] = NowIso, ["reanimated_at"] = NowIso, ["created_at"] = NowIso,
            };
            Stats(v);
            w.List("validators").Add(v);
            var res = new Dictionary<string, object> { ["ok"] = true, ["changes"] = changes, ["inv"] = inv, ["serial"] = (double)serial, ["validator"] = vid };
            res["unique"] = Mint(w, 203, $"{px}, {py}, {pz}", vid);
            int n = Relit(w);
            if (new[] { 3, 10, 25, 50, 100 }.Contains(n)) res["star"] = Mint(w, 204, $"crossed the {n}-relit threshold");
            bool shard = n >= 100 && R() < 0.15;
            if (shard) Give(w, inv, 110, 1);
            res["shard"] = shard;
            return res;
        }

        static DateTime Parse(object iso) => iso is string s && DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out var d) ? d.ToUniversalTime() : DateTime.UtcNow;

        void TickValidator(W w, Dictionary<string, object> v)
        {
            if (S(v, "state") == "dormant") return;
            var last = Parse(v["last_cycle_at"]);
            int cycles = (int)Math.Floor(Math.Min((DateTime.UtcNow - last).TotalSeconds, 86400) / 300);
            if (cycles <= 0) return;
            double gain = Math.Max(D(v, "gwei_per_cycle") - D(v, "maintenance_cost"), 0) * cycles;
            w.Set("gwei", w.Num("gwei") + gain);
            w.Set("gweiEarned", w.Num("gweiEarned") + gain);
            v["last_cycle_at"] = last.AddSeconds(cycles * 300).ToString("o");
            bool attested = v.TryGetValue("last_attested_at", out var la) && la != null && (DateTime.UtcNow - Parse(la)).TotalDays < 8;
            if (attested) { v["missed_cycles"] = 0.0; if (S(v, "state") != "corrupted") v["state"] = "active"; }
            else { v["missed_cycles"] = D(v, "missed_cycles") + cycles; v["state"] = "corrupted"; }
            w.Dirty = true;
        }

        Dictionary<string, object> Rewards(W w)
        {
            double before = w.Num("gwei");
            int n = 0;
            foreach (var v in Validators(w)) if (S(v, "state") != "dormant") { TickValidator(w, v); n++; }
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = new Dictionary<string, object>(), ["gwei"] = w.Num("gwei"), ["gained"] = w.Num("gwei") - before, ["n"] = (double)n };
        }

        Dictionary<string, object> FindValidator(W w, Dictionary<string, object> a, out Dictionary<string, object> err)
        {
            var v = Validators(w).FirstOrDefault(o => D(o, "id") == D(a, "validator_id"));
            err = v == null ? No("unknown validator") : S(v, "state") == "dormant" ? No("this validator is dormant: reanimate it first") : null;
            return v;
        }

        Dictionary<string, object> Maintain(W w, Dictionary<string, object> a)
        {
            var v = FindValidator(w, a, out var err);
            if (err != null) return err;
            TickValidator(w, v);
            var inv = new Dictionary<string, object>();
            if (S(v, "state") == "corrupted")
            {
                if (Count(w, 105) < 1) return No("corrupted: needs a validator heart to repair");
                Give(w, inv, 105, -1);
            }
            v["state"] = "active"; v["missed_cycles"] = 0.0; v["last_attested_at"] = NowIso;
            w.Dirty = true;
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["validator"] = v, ["gwei"] = w.Num("gwei") };
        }

        Dictionary<string, object> Upgrade(W w, Dictionary<string, object> a)
        {
            var v = FindValidator(w, a, out var err);
            if (err != null) return err;
            if (S(v, "state") == "corrupted") return No("repair it first");
            int level = I(v, "level");
            if (level >= 10) return No("already at maximum level");
            int cost = 50 * level;
            if (w.Num("gwei") < cost) return No("not enough gwei", new Dictionary<string, object> { ["need"] = (double)cost });
            w.Set("gwei", w.Num("gwei") - cost);
            v["level"] = (double)(level + 1);
            Stats(v);
            w.Dirty = true;
            return new Dictionary<string, object> { ["ok"] = true, ["validator"] = v, ["gwei"] = w.Num("gwei"), ["cost"] = (double)cost };
        }

        // ---------- the chapters' rewards, the shop (030_merge_twins.sql, 032_shop.sql) ----------
        List<object> Cosmetics(W w) => w.List("cosmetics");
        bool Owns(W w, int id) => Cosmetics(w).Any(c => MiniJson.ToInt(c) == id);
        Dictionary<string, object> State(W w) => w.D.TryGetValue("state", out var s) ? s as Dictionary<string, object> : null;

        Dictionary<string, object> ClaimChapter(W w, Dictionary<string, object> a)
        {
            var ch = S(a, "chapter");
            var chapters = new Dictionary<string, (int cos, int gwei)> { ["genesis"] = (15, 50), ["forge"] = (16, 100), ["awakening"] = (17, 200), ["network"] = (18, 400), ["circuits"] = (19, 100), ["merge"] = (20, 600) };
            if (ch == null || !chapters.TryGetValue(ch, out var c)) return No("unknown chapter");
            if (Owns(w, c.cos)) return No("already claimed");
            int vals = Validators(w).Count;
            var st = State(w);
            bool defended = st != null && st.TryGetValue("defended", out var df) && MiniJson.Truthy(df);
            int gates = w.Obj("edits").Values.OfType<Dictionary<string, object>>().Where(e => S(e, "placed_by") == UserId).Select(e => MiniJson.ToInt(e["id"])).Where(i => i >= 112 && i <= 123).Select(i => (i - 112) / 4).Distinct().Count();
            bool proof = ch switch
            {
                "genesis" => Count(w, 102) > 0 || HasUnique(w, 201) || HasUnique(w, 202),
                "forge" => HasUnique(w, 202),
                "awakening" => vals >= 1,
                "network" => vals >= 3 && HasUnique(w, 205) && HasUnique(w, 206) && defended,
                "circuits" => gates == 3,
                "merge" => HasUnique(w, 209),
                _ => false,
            };
            if (!proof) return No("chapter not finished");
            Cosmetics(w).Add((double)c.cos);
            w.Set("gwei", w.Num("gwei") + c.gwei);
            return new Dictionary<string, object> { ["ok"] = true, ["cosmetic"] = (double)c.cos, ["gwei"] = (double)c.gwei, ["total_gwei"] = w.Num("gwei") };
        }

        Dictionary<string, object> Buy(W w, Dictionary<string, object> a)
        {
            int id = I(a, "cosmetic_id");
            if (!Rules.Cosmetics.TryGetValue(id, out var c)) return No("unknown cosmetic");
            if (!Rules.ForSale(c)) return No("not for sale");
            if (!c.HasGrant && Owns(w, id)) return No("already owned");
            double week = Rules.ShopWeek();
            if (c.Limited && Rules.ShopFeatured(week).Limited != id) return No("not in the shop this week");
            int cost = Rules.ShopPrice(id, week);
            if (w.Num("gwei") < cost) return No("not enough gwei", new Dictionary<string, object> { ["need"] = (double)cost });
            w.Set("gwei", w.Num("gwei") - cost);
            if (!Owns(w, id)) Cosmetics(w).Add((double)id);
            var inv = new Dictionary<string, object>();
            if (c.HasGrant) Give(w, inv, c.GrantItem, Math.Max(1, c.GrantQty));
            return new Dictionary<string, object> { ["ok"] = true, ["cosmetic"] = (double)id, ["inv"] = inv, ["paid"] = (double)cost, ["gwei"] = w.Num("gwei") };
        }

        // ---------- the rest: consumables, the animals' gifts, signs, the network on your own ----------
        Dictionary<string, object> UseItem(W w, Dictionary<string, object> a)
        {
            int item = I(a, "item");
            var it = Rules.Item(item);
            if (it == null || it.Use == null) return No("not usable");
            if (Count(w, item) < 1) return No("none left");
            if (item == 307)
            {
                if (!a.TryGetValue("bx", out var bxv) || bxv == null) return No("no bed to go back to");
                int bx = I(a, "bx"), by = I(a, "by"), bz = I(a, "bz"), bed = Cell(w, bx, by, bz);
                if (bed < 137 || bed > 144) return No("that bed is gone", CellOf(bed));
            }
            var inv = new Dictionary<string, object>();
            Give(w, inv, item, -1);
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["item"] = (double)item };
        }

        Dictionary<string, object> Gift(W w, Dictionary<string, object> a)
        {
            var animal = S(a, "animal");
            if (string.IsNullOrEmpty(animal) || animal.Length > 40) return No("unknown animal");
            string today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var gifts = w.Obj("gifts");
            if (gifts.TryGetValue(animal, out var d) && d as string == today) return No("already gifted today");
            if (gifts.Values.Count(v => v as string == today) >= 15) return No("enough gifts for today");
            int item = S(a, "kind") switch { "sheep" => 71, "fox" => 17 + rnd.Next(3), "jellyfish" => 101, _ => 0 };
            if (item == 0) return No("this animal has no gift");
            gifts[animal] = today;
            var inv = new Dictionary<string, object>();
            Give(w, inv, item, 1);
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["item"] = (double)item };
        }

        Dictionary<string, object> Sign(W w, Dictionary<string, object> a)
        {
            int px = I(a, "px"), py = I(a, "py"), pz = I(a, "pz");
            var msg = S(a, "msg") ?? "";
            if (msg.Length > 1000) return No("text too long");
            int id = Cell(w, px, py, pz);
            if (id < 160 || id > 163) return No("not a sign", CellOf(id));
            var e = Edit(w, px, py, pz);
            if (e == null || S(e, "placed_by") != UserId) return No("not your sign");
            var t = System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(msg, @"\p{C}", " "), @"\s+", " ").Trim();
            if (t.Length > 60) t = t.Substring(0, 60);
            if (t.Length == 0) w.Obj("signs").Remove(K(px, py, pz)); else w.Obj("signs")[K(px, py, pz)] = t;
            w.Dirty = true;
            return new Dictionary<string, object> { ["ok"] = true, ["text"] = t };
        }

        Dictionary<string, object> Network(W w)
        {
            int n = Relit(w);
            long now = (long)NowS;
            var st = State(w);
            return new Dictionary<string, object>
            {
                ["ok"] = true, ["n"] = (double)n,
                ["top"] = n > 0 ? new List<object> { new Dictionary<string, object> { ["name"] = Login, ["n"] = (double)n } } : new List<object>(),
                ["attack"] = new Dictionary<string, object> { ["window_id"] = (double)(now / 3600), ["active"] = now % 3600 < 600, ["ends_at"] = DateTimeOffset.FromUnixTimeSeconds(now / 3600 * 3600 + 600).UtcDateTime.ToString("o"), ["kills"] = w.Num("attackWindow") == now / 3600 ? w.Num("attackKills") : 0.0, ["score"] = w.Num("attackScore") },
            };
        }

        Dictionary<string, object> Leaderboard(W w)
        {
            var g = w.Num("gweiEarned");
            int active = Validators(w).Count(v => S(v, "state") == "active");
            var r = new Dictionary<string, object> { ["ok"] = true, ["gwei"] = new List<object>(), ["validators"] = new List<object>(), ["defenses"] = new List<object>() };
            if (g > 0) ((List<object>)r["gwei"]).Add(new Dictionary<string, object> { ["name"] = Login, ["n"] = Math.Floor(g) });
            if (active > 0) ((List<object>)r["validators"]).Add(new Dictionary<string, object> { ["name"] = Login, ["n"] = (double)active });
            if (w.Num("defenses") > 0) ((List<object>)r["defenses"]).Add(new Dictionary<string, object> { ["name"] = Login, ["n"] = w.Num("defenses") });
            return r;
        }

        object BlockInfo(W w, int x, int y, int z)
        {
            var e = Edit(w, x, y, z);
            var hist = w.Obj("history").TryGetValue(K(x, y, z), out var h) ? h as List<object> : null;
            int mine = w.Obj("edits").Values.OfType<Dictionary<string, object>>().Count(o => S(o, "placed_by") == UserId && MiniJson.ToInt(o["id"]) != 0);
            return new Dictionary<string, object>
            {
                ["id"] = (double)Cell(w, x, y, z), ["name"] = e != null ? S(e, "placed_name") : null, ["serial"] = e != null && e.TryGetValue("serial", out var s) ? s : null,
                ["at"] = e != null && S(e, "placed_by") != null ? e["updated_at"] : null, ["builder_blocks"] = (double)mine, ["history"] = hist ?? new List<object>(),
            };
        }

        // ---------- the loot of a mob killed on this device (_loot_mob, 041_game_server.sql) ----------
        public Dictionary<string, object> LootMob(string world, string type)
        {
            var w = World(world);
            var inv = new Dictionary<string, object>();
            Dictionary<string, object> Boss(int trophy, int bonusId, int shards)
            {
                var r = new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["unique"] = Mint(w, trophy) };
                r["bonus"] = R() < 0.2 ? Mint(w, bonusId) : null;
                Give(w, inv, 110, shards);
                r["shards"] = (double)shards;
                return r;
            }
            if (type == "merge_twins") return Boss(209, 210, 2);
            if (type == "front_runner") return Boss(211, 212, 2);
            if (type == "titan") return Boss(205, 207, 1 + rnd.Next(2));
            if (type == "plasma_core") return Boss(206, 208, 1 + rnd.Next(2));
            // a cosmetic of this kind not owned yet, picked at random
            Dictionary<string, object> Cosmetic(string cat)
            {
                var free = Rules.Cosmetics.Values.Where(c => c.Category == cat && !Owns(w, c.Id)).Select(c => c.Id).ToList();
                if (free.Count == 0) return null;
                int cid = free[rnd.Next(free.Count)];
                Cosmetics(w).Add((double)cid);
                w.Dirty = true;
                return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["cosmetic"] = (double)cid };
            }
            Dictionary<string, object> Gwei()
            {
                int g = 10 + rnd.Next(41);
                w.Set("gwei", w.Num("gwei") + g);
                w.Set("gweiEarned", w.Num("gweiEarned") + g);
                return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["gwei"] = (double)g, ["total_gwei"] = w.Num("gwei") };
            }
            double r0 = R();
            if (type == "corrupted_node")
            {
                // the hourly attack on the Atrium: counted for the network's defense, then its loot
                w.Set("attackKills", (w.Num("attackWindow") == Math.Floor(NowS / 3600) ? w.Num("attackKills") : 0) + 1);
                w.Set("attackWindow", Math.Floor(NowS / 3600));
                w.Set("attackScore", w.Num("attackScore") + 1);
                w.Set("defenses", w.Num("defenses") + 1);
                if (r0 < 0.08) { var c = Cosmetic("event"); if (c != null) return c; }
                else if (r0 < 0.33) return Gwei();
                Give(w, inv, 101, 1 + rnd.Next(2));
                return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv };
            }
            if (r0 < 0.03) { var c = Cosmetic("combat"); if (c != null) return c; }
            else if (r0 < 0.15) return Gwei();
            double r = R();
            int it = type switch
            {
                "shadow" => r < 0.5 ? 101 : 0,
                "guardian" => r < 0.35 ? 101 : r < 0.5 ? 103 : 0,
                "sentinel" => r < 0.4 ? 103 : 0,
                "wraith" => r < 0.25 ? 104 : r < 0.65 ? 103 : 0,
                "warden" => r < 0.3 ? 101 : r < 0.45 ? 103 : 0,
                "garden_guardian" => r < 0.35 ? 101 : r < 0.5 ? 103 : 0,
                "prowler" => r < 0.5 ? 101 : 0,
                "sky_raider" => r < 0.3 ? 101 : r < 0.45 ? 103 : 0,
                "water_lurker" => r < 0.25 ? 103 : r < 0.5 ? 104 : 0,
                "bat" => r < 0.45 ? 101 : 0,
                "crawler" => r < 0.3 ? 101 : r < 0.45 ? 103 : 0,
                "golem" => r < 0.3 ? 103 : r < 0.55 ? 104 : 0,
                "mev_bot" => r < 0.5 ? 101 : 0,
                "gas_scorpion" => r < 0.35 ? 101 : r < 0.5 ? 103 : 0,
                "phish_spider" => r < 0.45 ? 101 : 0,
                "pump_slime" => r < 0.55 ? 101 : 0,
                "yeti" => r < 0.3 ? 103 : r < 0.55 ? 104 : 0,
                _ => 0,
            };
            if (it == 0) return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv };
            Give(w, inv, it, 1);
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["item"] = (double)it };
        }

        // an Ether Tonic drunk (srv_use_item): taken from the bag before it heals
        public Dictionary<string, object> UseTonic(string world)
        {
            var w = World(world);
            if (Count(w, 303) < 1) return No("none left");
            var inv = new Dictionary<string, object>();
            Give(w, inv, 303, -1);
            return new Dictionary<string, object> { ["ok"] = true, ["inv"] = inv, ["item"] = 303.0 };
        }

        // ---------- the tables (Select) ----------
        public List<object> Select(string query)
        {
            var q = query.Split('?');
            string table = q[0];
            var f = new List<(string col, string op, string val)>();
            if (q.Length > 1)
                foreach (var part in q[1].Split('&'))
                {
                    var kv = part.Split(new[] { '=' }, 2);
                    if (kv.Length < 2 || kv[0] == "select" || kv[0] == "order" || kv[0] == "limit" || kv[0] == "offset") continue;
                    var ov = kv[1].Split(new[] { '.' }, 2);
                    if (ov.Length == 2) f.Add((kv[0], ov[0], Uri.UnescapeDataString(ov[1])));
                }
            string Eq(string col) => f.FirstOrDefault(x => x.col == col && x.op == "eq").val;
            var w = World(Eq("world"));
            bool In(Dictionary<string, object> row)
            {
                foreach (var (col, op, val) in f)
                {
                    if (col == "world" || col == "user_id" || col == "owner") continue;
                    if (!row.TryGetValue(col, out var v)) return false;
                    if (v is double dv && double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n))
                    {
                        if (op == "eq" && dv != n || op == "gte" && dv < n || op == "lte" && dv > n || op == "lt" && dv >= n || op == "gt" && dv <= n) return false;
                    }
                    else if (op == "eq" && (v as string) != val) return false;
                }
                return true;
            }
            var rows = new List<object>();
            switch (table)
            {
                case "players":
                    if (w.D.ContainsKey("state")) rows.Add(new Dictionary<string, object> { ["name"] = Login, ["color"] = w.D.TryGetValue("color", out var c) ? c : null, ["state"] = w.D["state"], ["updated_at"] = w.D.TryGetValue("updated_at", out var u) ? u : NowIso, ["gwei"] = w.Num("gwei") });
                    break;
                case "inventory":
                    foreach (var kv in w.Obj("inventory")) if (MiniJson.ToInt(kv.Value) > 0) rows.Add(new Dictionary<string, object> { ["item"] = double.Parse(kv.Key), ["n"] = kv.Value });
                    break;
                case "uniques":
                    rows.AddRange(Uniques(w).OrderBy(x => MiniJson.ToDouble(x["serial"])));
                    break;
                case "cosmetics_owned":
                    foreach (var c2 in Cosmetics(w)) rows.Add(new Dictionary<string, object> { ["cosmetic_id"] = c2 });
                    break;
                case "validators":
                    rows.AddRange(Validators(w).OrderBy(v => D(v, "id")));
                    break;
                case "blocks":
                    foreach (var kv in w.Obj("edits"))
                    {
                        var p = kv.Key.Split(',');
                        var e = (Dictionary<string, object>)kv.Value;
                        var row = new Dictionary<string, object> { ["x"] = double.Parse(p[0]), ["y"] = double.Parse(p[1]), ["z"] = double.Parse(p[2]), ["id"] = e["id"], ["placed_by"] = S(e, "placed_by"), ["placed_name"] = S(e, "placed_name"), ["serial"] = e.TryGetValue("serial", out var s) ? s : null };
                        var pb = Eq("placed_by");
                        if (pb != null && S(e, "placed_by") != pb) continue;
                        if (In(row)) rows.Add(row);
                    }
                    break;
                case "signs":
                    foreach (var kv in w.Obj("signs"))
                    {
                        var p = kv.Key.Split(',');
                        var row = new Dictionary<string, object> { ["x"] = double.Parse(p[0]), ["y"] = double.Parse(p[1]), ["z"] = double.Parse(p[2]), ["text"] = kv.Value };
                        if (In(row)) rows.Add(row);
                    }
                    break;
                // chunks: none frozen, the generator draws them; claims: no other players offline
            }
            return rows;
        }

        // your save (players, keyed by user and world): the state as the client keeps it
        public void Upsert(string table, Dictionary<string, object> row)
        {
            if (table != "players") return;
            var w = World(row.TryGetValue("world", out var wv) ? wv as string : null);
            w.D["state"] = row.TryGetValue("state", out var st) ? st : new Dictionary<string, object>();
            if (row.TryGetValue("color", out var c)) w.D["color"] = c;
            w.D["updated_at"] = NowIso;
            w.Dirty = true;
        }

        public void LogOut() { Login = ""; }
    }
}
