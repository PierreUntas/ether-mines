// Ether Mines · the shop (07-interface.js renderShop), in three aisles like the web: the Store (the premium
// pieces and sets, for euros, with this week's showcase set), the Workshop (everything bought with Gwei: this
// week's three pieces 25% off and its limited piece, the collections, everything else by slot, the block
// packs) and the Wardrobe (your saved outfits, what you own, the trophies and titles nobody can buy). What
// you own you can wear (an outfit also sets your color); you see it on your figure (V) and the others on theirs.
// Bought through act_buy_cosmetic: the server checks your Gwei and the week's prices. The premium pieces are
// bought with the App Store or Google Play (Iap.cs), checked by the server before they're yours.
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Shop
    {
        public Session Session;
        public Progress Progress;
        public Avatars Avatars; // your character, in the window, with what you try on
        Vector2 scroll;
        bool busy;

        static readonly Dictionary<string, string> SlotTint = new Dictionary<string, string>
        {
            ["head"] = "#ffd166", ["back"] = "#7fe8ff", ["companion"] = "#ff9ab8", ["trail"] = "#b6a4ff", ["tool"] = "#c9a6ff", ["plating"] = "#b48cff",
        };

        bool Owns(int id) => Progress.Cosmetics.Contains(id);
        Dictionary<string, object> LookObj()
        {
            if (!Session.State.TryGetValue("look", out var l) || !(l is Dictionary<string, object> d)) Session.State["look"] = d = new Dictionary<string, object>();
            return d;
        }
        bool Worn(Cosmetic c) => c.Slot != null && Looks.Mine(Session, Progress.Cosmetics).TryGetValue(c.Slot, out var id) && id == c.Id;

        void Wear(Cosmetic c, bool on)
        {
            var d = LookObj();
            if (on)
            {
                d[c.Slot] = (double)c.Id;
                if (c.Slot == "outfit" && !string.IsNullOrEmpty(c.Color)) Session.Color = c.Color; // an outfit is worn in its own color
            }
            else d.Remove(c.Slot);
            Session.Dirty = true;
        }

        async void Buy(Cosmetic c)
        {
            if (busy) return;
            busy = true;
            try
            {
                var r = await Session.Act("buy_cosmetic", new Dictionary<string, object> { ["cosmetic_id"] = c.Id }, 0, 0, 0, "cosmetic bought");
                if (r == null || r.ContainsKey("refused")) return;
                if (!Progress.Cosmetics.Contains(c.Id)) Progress.Cosmetics.Add(c.Id);
                if (r.TryGetValue("gwei", out var g)) Session.Gwei = MiniJson.ToDouble(g);
                if (c.HasGrant) { Hud.Feed("mint", $"{c.GrantQty} × {Ui.NameOf(c.GrantItem)}", c.N + " bought: in your bag"); await Session.LoadInventory(); }
                else { Hud.Feed("nft", c.N, "bought"); if (c.Slot != null) Wear(c, true); }
            }
            finally { busy = false; }
        }

        string tab = "store";
        static readonly string[][] Tabs = { new[] { "store", "Store · €" }, new[] { "workshop", "Workshop · Gwei" }, new[] { "wardrobe", "Wardrobe" } };
        const int OutfitSlots = 4; // saved outfits, in your save (State["outfits"], as on the web)

        static string Eur(int cents) => "€" + (cents / 100.0).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
        static IEnumerable<string> PremiumSets() => Rules.Sets.Select(s => s[0]).Where(k => Rules.SetPieces(k).Count > 0);
        static string ShowcaseSet(double week)
        {
            var l = PremiumSets().ToList();
            return l.Count == 0 ? null : l[(int)(((long)week % l.Count + l.Count) % l.Count)];
        }
        static string SetName(string set) => Rules.Sets.FirstOrDefault(s => s[0] == set)?[1] ?? set;
        static string SetLine(string set) => (Rules.Sets.FirstOrDefault(s => s[0] == set)?[2] ?? "").Replace(". Premium", "");

        // "Try the set": every piece on your character, the outfit in its own color
        void TryOnSet(string set)
        {
            if (Avatars == null) return;
            Avatars.TryLook = new Dictionary<string, int>(Looks.Mine(Session, Progress.Cosmetics));
            Avatars.TryColor = null;
            foreach (var id in Rules.SetPieces(set))
            {
                var c = Rules.Cosmetics[id];
                Avatars.TryLook[c.Slot] = id;
                if (c.Slot == "outfit") Avatars.TryColor = c.Color;
            }
        }

        List<object> Outfits()
        {
            if (!Session.State.TryGetValue("outfits", out var o) || !(o is List<object> l)) Session.State["outfits"] = l = new List<object>();
            while (l.Count < OutfitSlots) l.Add(null);
            return l;
        }
        void SaveOutfit(int i)
        {
            var look = new Dictionary<string, object>();
            foreach (var kv in Looks.Mine(Session, Progress.Cosmetics)) look[kv.Key] = (double)kv.Value;
            Outfits()[i] = new Dictionary<string, object> { ["look"] = look, ["color"] = Session.Color };
            Session.Dirty = true;
            Hud.Feed("nft", $"Outfit {i + 1}", "saved");
        }
        void WearOutfit(int i)
        {
            if (!(Outfits()[i] is Dictionary<string, object> o)) return;
            var want = o.TryGetValue("look", out var lk) && lk is Dictionary<string, object> ld ? ld : new Dictionary<string, object>();
            var d = LookObj();
            int missing = 0;
            foreach (var slot in Looks.Slots)
            {
                int id = want.TryGetValue(slot, out var v) ? MiniJson.ToInt(v) : 0;
                if (id != 0 && !Owns(id)) missing++;
                if (id != 0 && Owns(id)) d[slot] = (double)id; else d.Remove(slot);
            }
            if (d.TryGetValue("outfit", out var oid) && Rules.Cosmetics.TryGetValue(MiniJson.ToInt(oid), out var oc) && !string.IsNullOrEmpty(oc.Color)) Session.Color = oc.Color;
            else if (o.TryGetValue("color", out var col) && col is string cs) Session.Color = cs;
            if (Avatars != null) { Avatars.TryLook = null; Avatars.TryColor = null; }
            Session.Dirty = true;
            Hud.Feed("nft", $"Outfit {i + 1}", missing > 0 ? $"on, without {missing} piece{(missing > 1 ? "s" : "")} you no longer own" : "on");
        }

        // one thing in the list: a heading, a note, a piece, a set card, the outfits
        struct Item { public float H; public Action<Rect> Draw; }

        public void Draw(Rect body)
        {
            double week = Rules.ShopWeek();
            var f = Rules.ShopFeatured(week);
            var ids = Rules.CosmeticIds;
            var items = new List<Item>();
            void Head(string h) => items.Add(new Item { H = 34, Draw = r => GUI.Label(new Rect(r.x, r.y + 6, r.width, 26), h, Ui.Title) });
            void Note(string n) => items.Add(new Item { H = 24, Draw = r => GUI.Label(r, n, Ui.Small) });
            void Piece(int id) => items.Add(new Item { H = 58, Draw = r => Row(new Rect(r.x, r.y, r.width, 52), Rules.Cosmetics[id], f, week) });

            if (tab == "store")
            {
                var iap = Iap.Supported ? Iap.Start(Session, Progress) : null;
                Note(iap != null && iap.Ready
                    ? "The most striking pieces: light, embers and moving parts. Cosmetics only, never an advantage. Try them on first; once bought, a piece is yours in every world, on the web too."
                    : "The most striking pieces, sold for euros: light, embers and moving parts. Cosmetics only, never an advantage. " + (iap != null && iap.Status != "" ? iap.Status + "." : "Try them on now; they go on sale soon."));
                // Apple asks for a way to get past purchases back, and the terms of sale are a tap away
                if (iap != null && iap.Ready) items.Add(new Item { H = 40, Draw = r =>
                {
                    if (GUI.Button(new Rect(r.x, r.y + 2, 190, 30), "Restore purchases", Ui.Button)) iap.Restore();
                    if (GUI.Button(new Rect(r.x + 200, r.y + 2, 150, 30), "Terms of sale", Ui.Button)) Application.OpenURL("https://ethermines.org/legal.html#vente");
                } });
                var hero = ShowcaseSet(week);
                if (hero != null) items.Add(new Item { H = 150, Draw = r => SetCard(r, hero, true) });
                foreach (var set in PremiumSets())
                {
                    Head(SetName(set));
                    if (set != hero) items.Add(new Item { H = 128, Draw = r => SetCard(r, set, false) });
                    foreach (var id in Rules.SetPieces(set)) Piece(id);
                }
            }
            else if (tab == "workshop")
            {
                Note($"Bought with Gwei, earned by your validators, mobs and chapters. You have <b>{Session.Gwei:0} Gwei</b>.");
                var weekly = f.Sale.Where(i => i >= 0).ToList();
                if (f.Limited >= 0) weekly.Add(f.Limited);
                var wait = TimeSpan.FromSeconds((week + 1) * Rules.ShopWeekSeconds + Rules.ShopEpoch - DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                Head("This week");
                Note($"New offers in {(int)wait.TotalDays} d {wait.Hours} h: three pieces 25% off, and one limited piece you can only buy this week.");
                foreach (var i in weekly) Piece(i);
                foreach (var set in Rules.Sets)
                {
                    var mine = ids.Where(i => Rules.Cosmetics[i].Set == set[0] && !Rules.Cosmetics[i].Premium && (!Rules.Cosmetics[i].Retired || Owns(i))).ToList();
                    if (mine.Count == 0) continue;
                    Head($"{set[1]} collection · {mine.Count(Owns)}/{mine.Count}");
                    Note(set[2]);
                    foreach (var i in mine) Piece(i);
                }
                var loose = ids.Where(i => Rules.Cosmetics[i].Set == null && Rules.ForSale(Rules.Cosmetics[i])).ToList();
                foreach (var slot in Looks.Slots.Concat(new string[] { null }))
                {
                    var mine = loose.Where(i => Rules.Cosmetics[i].Slot == slot && !Rules.Cosmetics[i].HasGrant).ToList();
                    if (mine.Count == 0) continue;
                    Head(slot != null ? Looks.SlotLabel[slot] : "Other");
                    foreach (var i in mine) Piece(i);
                }
                var packs = loose.Where(i => Rules.Cosmetics[i].HasGrant).ToList();
                if (packs.Count > 0) { Head("Block packs"); Note("Decorative blocks straight into your bag. Buy them as often as you like."); foreach (var i in packs) Piece(i); }
            }
            else
            {
                Head("My outfits");
                Note("Save what you wear now in a slot, and put it all back on in one tap.");
                items.Add(new Item { H = 2 * 96 + 8, Draw = OutfitGrid });
                var owned = ids.Where(i => Owns(i) && Rules.Cosmetics[i].Slot != null && !Rules.Cosmetics[i].HasGrant).ToList();
                if (owned.Count == 0) { Head("My pieces"); Note("Nothing yet: try pieces on in the Store or the Workshop."); }
                foreach (var slot in Looks.Slots)
                {
                    var mine = owned.Where(i => Rules.Cosmetics[i].Slot == slot).ToList();
                    if (mine.Count == 0) continue;
                    Head(Looks.SlotLabel[slot]);
                    foreach (var i in mine) Piece(i);
                }
                var trophies = ids.Where(i => !Rules.ForSale(Rules.Cosmetics[i]) && !Rules.Cosmetics[i].Retired && Rules.Cosmetics[i].Category != "title" && !Rules.Cosmetics[i].Premium).ToList();
                Head($"Trophies · {trophies.Count(Owns)}/{trophies.Count}");
                Note("Never sold: dropped by tough mobs, rarely, or earned by fighting off the network attack.");
                foreach (var i in trophies.Where(i => !Owns(i))) Piece(i);
                var titles = ids.Where(i => Rules.Cosmetics[i].Category == "title").ToList();
                Head($"Titles · {titles.Count(Owns)}/{titles.Count}");
                Note("Never sold: each one is earned by finishing a story chapter; the furthest shows under your name.");
                foreach (var i in titles) Piece(i);
            }

            // your character beside the list, with what you try on
            float side = Avatars != null ? 290 : 0;
            if (Avatars != null)
            {
                var pr = new Rect(body.xMax - side, body.y, side, body.height);
                Ui.Fill(pr, new Color(1, 1, 1, 0.06f));
                Panel.DrawPreview(Avatars, new Rect(pr.x, pr.y + 6, pr.width, Mathf.Min(360, pr.height - 90)));
                float ty = pr.y + Mathf.Min(360, pr.height - 90) + 12;
                if (Avatars.TryLook != null && Avatars.TryLook.Count > 0)
                {
                    var mine = Looks.Mine(Session, Progress.Cosmetics);
                    var tried = Avatars.TryLook.Where(kv => !mine.TryGetValue(kv.Key, out var m) || m != kv.Value).Select(kv => Rules.Cosmetics[kv.Value].N).ToList();
                    GUI.Label(new Rect(pr.x + 12, ty, pr.width - 24, 40), "Trying on: " + (tried.Count > 0 ? string.Join(", ", tried) : "nothing new"), Ui.Small);
                    if (GUI.Button(new Rect(pr.x + 12, ty + 40, pr.width - 24, 30), "Back to my look", Ui.Button)) { Avatars.TryLook = null; Avatars.TryColor = null; }
                }
                else GUI.Label(new Rect(pr.x + 12, ty, pr.width - 24, 40), "Press Try on any piece to see it on your character first.", Ui.Small);
            }
            var lb = new Rect(body.x, body.y, body.width - side - (side > 0 ? 12 : 0), body.height);
            // the three aisles
            float tx = lb.x;
            foreach (var t in Tabs)
            {
                float w = Ui.Pill(tab == t[0]).CalcSize(new GUIContent(t[1])).x + 28;
                if (GUI.Button(new Rect(tx, lb.y, w, 32), t[1], tab == t[0] ? Ui.Primary : Ui.Button)) { tab = t[0]; scroll = Vector2.zero; }
                tx += w + 8;
            }
            float h = items.Sum(it => it.H);
            var view = new Rect(0, 0, lb.width - 20, h);
            scroll = Ui.Scroll(new Rect(lb.x, lb.y + 42, lb.width, lb.height - 42), scroll, view);
            float y = 0;
            foreach (var it in items) { it.Draw(new Rect(0, y, view.width, it.H)); y += it.H; }
            GUI.EndScrollView();
        }

        // a premium set: its pieces, its price against theirs, try it, buy it (or what's left of it)
        void SetCard(Rect r, string set, bool hero)
        {
            var pieces = Rules.SetPieces(set);
            int have = pieces.Count(Owns), price = Rules.SetPrice(set, Owns), full = pieces.Sum(i => Rules.Cosmetics[i].Eur);
            int rest = pieces.Where(i => !Owns(i)).Sum(i => Rules.Cosmetics[i].Eur);
            var box = new Rect(r.x, r.y + 4, r.width, r.height - 10);
            Ui.Fill(box, hero ? new Color(1f, 0.85f, 0.37f, 0.16f) : new Color(1f, 0.85f, 0.37f, 0.07f));
            float y = box.y + 8;
            if (hero) { GUI.Label(new Rect(box.x + 12, y, box.width - 24, 18), "<color=#ffd95e>THIS WEEK'S SHOWCASE</color>", Ui.Small); y += 20; }
            GUI.Label(new Rect(box.x + 12, y, box.width - 24, 26), hero ? $"<color=#ffd95e>{SetName(set)} set</color>" : $"<b>{SetName(set)} set</b>", hero ? Ui.Title : Ui.Label);
            y += 26;
            GUI.Label(new Rect(box.x + 12, y, box.width - 24, 20), SetLine(set), Ui.Small);
            y += 24;
            float sx = box.x + 12, sz = hero ? 34 : 28;
            foreach (var id in pieces) { Ui.Fill(new Rect(sx, y, sz, sz), Avatars.Hex(set == "pow" ? "#ff8a3d" : "#b48cff", Ui.Violet)); if (Owns(id)) Ui.Fill(new Rect(sx, y + sz - 4, sz, 4), Ui.Cyan); sx += sz + 6; }
            int save = full > 0 && Rules.SetEur.TryGetValue(set, out var se) ? (int)Math.Round((1 - (double)se / full) * 100) : 0;
            string txt = price == 0 ? "Complete: every piece is yours"
                : have > 0 ? $"{have}/{pieces.Count} owned · the rest for <b><color=#ffd95e>{Eur(price)}</color></b> <color=#9a92c8>{Eur(rest)}</color>"
                : $"All {pieces.Count} pieces for <b><color=#ffd95e>{Eur(price)}</color></b> <color=#9a92c8>{Eur(full)}</color> · save {save}%";
            GUI.Label(new Rect(sx + 10, y + (sz - 22) / 2, box.xMax - sx - 400, 22), txt, Ui.Small);
            var b = new Rect(box.xMax - 200, y, 190, 32);
            if (GUI.Button(new Rect(b.x - 130, b.y, 120, 32), "Try the set", Ui.Button)) TryOnSet(set);
            if (price > 0)
            {
                // in the apps a set is sold whole (a store product has one price): owning some of it, buy the rest piece by piece
                var iap = Iap.Instance;
                string pid = Iap.SetId(set), sp = iap != null && iap.Ready && have == 0 ? iap.Price(pid) : null;
                if (iap != null && iap.Ready && have > 0) GUI.Label(new Rect(b.x - 130, b.y + 36, 320, 20), "Buy the missing pieces one by one, below", Ui.Small);
                else if (sp == null) { GUI.enabled = false; GUI.Button(b, Eur(price) + " · soon", Ui.Button); GUI.enabled = true; }
                else if (iap.Busy == pid) { GUI.enabled = false; GUI.Button(b, "Buying…", Ui.Button); GUI.enabled = true; }
                else if (GUI.Button(b, "Buy the set · " + sp, Ui.Primary)) iap.Buy(pid);
            }
        }

        void OutfitGrid(Rect r)
        {
            var list = Outfits();
            float w = (r.width - 8) / 2;
            for (int i = 0; i < OutfitSlots; i++)
            {
                var c = new Rect(r.x + (i % 2) * (w + 8), r.y + (i / 2) * 96, w, 88);
                var o = list[i] as Dictionary<string, object>;
                Ui.Fill(c, new Color(0.5f, 0.91f, 1f, o != null ? 0.08f : 0.03f));
                GUI.Label(new Rect(c.x + 10, c.y + 6, c.width - 20, 22), $"<b>Outfit {i + 1}</b>", Ui.Label);
                if (o != null)
                {
                    float sx = c.x + 10;
                    if (o.TryGetValue("color", out var col) && col is string cs) { Ui.Fill(new Rect(sx, c.y + 30, 18, 18), Avatars.Hex(cs, Ui.Violet)); sx += 24; }
                    if (o.TryGetValue("look", out var lk) && lk is Dictionary<string, object> ld)
                        foreach (var slot in Looks.Slots)
                            if (ld.TryGetValue(slot, out var v) && Rules.Cosmetics.TryGetValue(MiniJson.ToInt(v), out var pc))
                            { Ui.Fill(new Rect(sx, c.y + 30, 18, 18), Avatars.Hex(!string.IsNullOrEmpty(pc.Color) ? pc.Color : SlotTint.TryGetValue(slot, out var t) ? t : "#ffd95e", Ui.Violet)); sx += 24; }
                }
                else GUI.Label(new Rect(c.x + 10, c.y + 30, c.width - 20, 20), "Empty", Ui.Small);
                float bx = c.x + 10, by = c.y + 54;
                if (o != null) { if (GUI.Button(new Rect(bx, by, 70, 28), "Wear", Ui.Primary)) WearOutfit(i); bx += 78; }
                if (GUI.Button(new Rect(bx, by, o != null ? 84 : 130, 28), o != null ? "Replace" : "Save my look", o != null ? Ui.Button : Ui.Primary)) SaveOutfit(i);
                bx += (o != null ? 84 : 130) + 8;
                if (o != null && GUI.Button(new Rect(bx, by, 66, 28), "Clear", Ui.Button)) { list[i] = null; Session.Dirty = true; }
            }
        }

        void Row(Rect r, Cosmetic c, ShopPicks f, double week)
        {
            bool owned = Owns(c.Id), worn = Worn(c), sellable = Rules.ForSale(c), onSale = f.Sale.Contains(c.Id);
            int price = Rules.ShopPrice(c.Id, week);
            bool limitedAway = c.Limited && f.Limited != c.Id;
            Ui.Fill(r, new Color(1, 1, 1, worn ? 0.12f : 0.05f));
            var sw = new Rect(r.x + 8, r.y + 8, 36, 36);
            if (c.HasGrant) Ui.Icon(sw, c.GrantItem);
            else if (c.Premium) Ui.Fill(sw, Avatars.Hex(c.Set == "pow" ? "#ff8a3d" : "#b48cff", Ui.Violet));
            else Ui.Fill(sw, Avatars.Hex(!string.IsNullOrEmpty(c.Color) ? c.Color : c.Slot != null && SlotTint.TryGetValue(c.Slot, out var t) ? t : sellable ? "#8a7bef" : "#ffd95e", Ui.Violet));
            string slot = c.Slot != null && Looks.SlotLabel.TryGetValue(c.Slot, out var sl) ? sl : c.Category;
            string eur = "€" + (c.Eur / 100.0).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
            string sub = c.Premium ? (owned ? $"{(c.Slot != null && Looks.SlotLabel.TryGetValue(c.Slot, out var ps) ? ps : c.Category)} · premium · {(worn ? "worn" : "owned")}" : $"{(c.Slot != null && Looks.SlotLabel.TryGetValue(c.Slot, out var ps2) ? ps2 : c.Category)} · premium · <b><color=#ffd95e>{eur}</color></b>")
                : c.HasGrant ? $"grants {c.GrantQty} × {Ui.NameOf(c.GrantItem)} · buy as often as you like"
                : owned ? $"{slot} · {(worn ? "worn" : "owned")}"
                : !sellable && c.Retired ? "No longer sold"
                : !sellable ? (c.Category == "title" ? "Chapter reward" : c.Category == "event" ? "Network attack reward" : "Drop only")
                : limitedAway ? $"{slot} · limited · back another week"
                : slot;
            string priceTxt = c.Premium || !sellable || (owned && !c.HasGrant) ? "" : onSale ? $" · <color=#9a92c8>{c.Price}</color> <b><color=#ffd95e>{price} Gwei</color></b>" : $" · {price} Gwei";
            GUI.Label(new Rect(r.x + 54, r.y + 4, r.width - 370, 24), "<b>" + c.N + "</b>", Ui.Label);
            GUI.Label(new Rect(r.x + 54, r.y + 26, r.width - 370, 22), sub + priceTxt, Ui.Small);
            var b = new Rect(r.xMax - 190, r.y + 10, 180, 32);
            // try it on first (tryOn): on your character, beside the list
            if (Avatars != null && c.Slot != null && !c.HasGrant && !owned && (sellable || c.Premium))
            {
                bool trying = Avatars.TryLook != null && Avatars.TryLook.TryGetValue(c.Slot, out var tid) && tid == c.Id;
                if (GUI.Button(new Rect(b.x - 110, b.y, 100, 32), trying ? "Stop" : "Try", Ui.Button))
                {
                    if (Avatars.TryLook == null) Avatars.TryLook = new Dictionary<string, int>();
                    if (trying) { Avatars.TryLook.Remove(c.Slot); if (c.Slot == "outfit") Avatars.TryColor = null; }
                    else { Avatars.TryLook[c.Slot] = c.Id; if (c.Slot == "outfit") Avatars.TryColor = c.Color; }
                }
            }
            GUI.enabled = !busy;
            if (c.Slot != null && owned) { if (GUI.Button(b, worn ? "Remove" : "Wear", worn ? Ui.Button : Ui.Primary)) Wear(c, !worn); }
            else if (c.Premium)
            {
                // the store's own price, in the player's currency; until the store answers, the euro price, "soon"
                var iap = Iap.Instance;
                string pid = Iap.PieceId(c.Id), sp = iap != null && iap.Ready ? iap.Price(pid) : null;
                if (sp == null) { GUI.enabled = false; GUI.Button(b, eur + " · soon", Ui.Button); }
                else if (iap.Busy == pid) { GUI.enabled = false; GUI.Button(b, "Buying…", Ui.Button); }
                else if (GUI.Button(b, "Buy · " + sp, Ui.Primary)) iap.Buy(pid);
            }
            else if (!sellable) { GUI.enabled = false; GUI.Button(b, "Not for sale", Ui.Button); }
            else if (limitedAway) { GUI.enabled = false; GUI.Button(b, "Not this week", Ui.Button); }
            else if (Session.Gwei < price) { GUI.enabled = false; GUI.Button(b, price + " Gwei", Ui.Button); }
            else if (GUI.Button(b, "Buy · " + price + " Gwei", Ui.Primary)) Buy(c);
            GUI.enabled = true;
        }
    }
}
