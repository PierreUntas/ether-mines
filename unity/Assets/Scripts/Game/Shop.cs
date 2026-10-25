// Ether Mines · the shop (07-interface.js renderShop, shopRow): cosmetics bought with Gwei, purely
// decorative, and the Premium pieces sold for euros (tried on now, sold with the payments). This week's three pieces 25% off and its limited piece, the collections, everything else by
// slot, the block packs, then the trophies and titles nobody can buy. What you own you can wear (an
// outfit also sets your color); you see it on your figure (V) and the others see it on theirs.
// Bought through act_buy_cosmetic: the server checks your Gwei and the week's prices.
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

        public void Draw(Rect body)
        {
            double week = Rules.ShopWeek();
            var f = Rules.ShopFeatured(week);
            var ids = Rules.CosmeticIds;
            // the rows, by section
            var rows = new List<(string head, string note, int id)>();
            var weekly = f.Sale.Where(i => i >= 0).ToList();
            if (f.Limited >= 0) weekly.Add(f.Limited);
            var wait = TimeSpan.FromSeconds((week + 1) * Rules.ShopWeekSeconds + Rules.ShopEpoch - DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            string Head(string h) => h;
            bool firstW = true;
            // Premium: the pieces sold for euros (never for Gwei), by collection; tried on now, sold with the payments
            bool firstP = true;
            foreach (var set in Rules.Sets)
            {
                var mine = ids.Where(i => Rules.Cosmetics[i].Set == set[0] && Rules.Cosmetics[i].Premium).ToList();
                bool first = true;
                foreach (var i in mine)
                {
                    rows.Add((first ? (firstP ? "Premium · " : "") + set[1] : null, first ? (firstP ? "The most striking pieces, sold for euros: light, embers and moving parts. Try them on now; they go on sale soon." : set[2].Replace(". Premium", "")) : null, i));
                    first = false; firstP = false;
                }
            }
            foreach (var i in weekly) { rows.Add((firstW ? "This week" : null, firstW ? $"New offers in {(int)wait.TotalDays} d {wait.Hours} h: three pieces 25% off, and one limited piece you can only buy this week." : null, i)); firstW = false; }
            foreach (var set in Rules.Sets)
            {
                var mine = ids.Where(i => Rules.Cosmetics[i].Set == set[0] && !Rules.Cosmetics[i].Premium && (!Rules.Cosmetics[i].Retired || Owns(i))).ToList();
                bool first = true;
                foreach (var i in mine) { rows.Add((first ? $"{set[1]} collection · {mine.Count(Owns)}/{mine.Count}" : null, first ? set[2] : null, i)); first = false; }
            }
            var loose = ids.Where(i => Rules.Cosmetics[i].Set == null && Rules.ForSale(Rules.Cosmetics[i])).ToList();
            foreach (var slot in Looks.Slots.Concat(new string[] { null }))
            {
                var mine = loose.Where(i => Rules.Cosmetics[i].Slot == slot && !Rules.Cosmetics[i].HasGrant).ToList();
                bool first = true;
                foreach (var i in mine) { rows.Add((first ? (slot != null ? Looks.SlotLabel[slot] : "Other") : null, null, i)); first = false; }
            }
            var packs = loose.Where(i => Rules.Cosmetics[i].HasGrant).ToList();
            for (int k = 0; k < packs.Count; k++) rows.Add((k == 0 ? "Block packs" : null, k == 0 ? "Decorative blocks straight into your bag. Buy them as often as you like." : null, packs[k]));
            var trophies = ids.Where(i => !Rules.ForSale(Rules.Cosmetics[i]) && !Rules.Cosmetics[i].Retired && Rules.Cosmetics[i].Category != "title" && !Rules.Cosmetics[i].Premium).ToList();
            for (int k = 0; k < trophies.Count; k++) rows.Add((k == 0 ? $"Trophies · {trophies.Count(Owns)}/{trophies.Count}" : null, k == 0 ? "Never sold: dropped by tough mobs, rarely, or earned by fighting off the network attack." : null, trophies[k]));
            var titles = ids.Where(i => Rules.Cosmetics[i].Category == "title").ToList();
            for (int k = 0; k < titles.Count; k++) rows.Add((k == 0 ? $"Titles · {titles.Count(Owns)}/{titles.Count}" : null, k == 0 ? "Never sold: each one is earned by finishing a story chapter; the furthest shows under your name." : null, titles[k]));

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
                    GUI.Label(new Rect(pr.x + 12, ty, pr.width - 24, 40), "Trying on: " + string.Join(", ", Avatars.TryLook.Values.Select(i => Rules.Cosmetics[i].N)), Ui.Small);
                    if (GUI.Button(new Rect(pr.x + 12, ty + 40, pr.width - 24, 30), "Back to my look", Ui.Button)) { Avatars.TryLook = null; Avatars.TryColor = null; }
                }
                else GUI.Label(new Rect(pr.x + 12, ty, pr.width - 24, 40), "Press Try on any piece to see it on your character first.", Ui.Small);
            }
            var lb = new Rect(body.x, body.y, body.width - side - (side > 0 ? 12 : 0), body.height);
            GUI.Label(new Rect(lb.x, lb.y, lb.width, 36), $"Cosmetics only: no combat, speed, harvesting or access advantage. You have <b>{Session.Gwei:0} Gwei</b>, earned by your validators, mobs and chapters.", Ui.Small);
            float h = rows.Sum(r => 58 + (r.head != null ? 34 : 0) + (r.note != null ? 22 : 0));
            var view = new Rect(0, 0, lb.width - 20, h);
            scroll = Ui.Scroll(new Rect(lb.x, lb.y + 40, lb.width, lb.height - 40), scroll, view);
            float y = 0;
            foreach (var (head, note, id) in rows)
            {
                if (head != null) { GUI.Label(new Rect(0, y + 6, view.width, 26), head, Ui.Title); y += 34; }
                if (note != null) { GUI.Label(new Rect(0, y, view.width, 22), note, Ui.Small); y += 22; }
                Row(new Rect(0, y, view.width, 52), Rules.Cosmetics[id], f, week);
                y += 58;
            }
            GUI.EndScrollView();
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
            else if (c.Premium) { GUI.enabled = false; GUI.Button(b, eur + " · soon", Ui.Button); }
            else if (!sellable) { GUI.enabled = false; GUI.Button(b, "Not for sale", Ui.Button); }
            else if (limitedAway) { GUI.enabled = false; GUI.Button(b, "Not this week", Ui.Button); }
            else if (Session.Gwei < price) { GUI.enabled = false; GUI.Button(b, price + " Gwei", Ui.Button); }
            else if (GUI.Button(b, "Buy · " + price + " Gwei", Ui.Primary)) Buy(c);
            GUI.enabled = true;
        }
    }
}
