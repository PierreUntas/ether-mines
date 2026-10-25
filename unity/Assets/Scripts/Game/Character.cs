// Ether Mines · the Character tab (24-gear.js renderCharacter): your character in the middle, its slots on
// both sides (the helmet, the amulet, the plating; what you hold, the gauntlets, the boots), click one to
// choose what goes in it among what you own, and below what it all adds up to: hearts and how fast they come
// back, damage, protection, mining, speed, your title.
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Character
    {
        public Session Session;
        public Interaction Act;
        public Avatars Avatars;
        public Func<string> Title = () => "";
        string open; // the slot whose choices are shown

        sealed class Slot { public string K, N; public bool Right; public Func<ItemDef, bool> Has; }
        static readonly Slot[] Slots =
        {
            new Slot { K = "helm", N = "Helm", Has = it => it.Helm > 0 },
            new Slot { K = "amulet", N = "Amulet", Has = it => it.Regen > 0 },
            new Slot { K = "armor", N = "Plating", Has = it => it.HasArmor },
            new Slot { K = "hand", N = "In hand", Right = true },
            new Slot { K = "gloves", N = "Gauntlets", Right = true, Has = it => it.Power > 0 },
            new Slot { K = "boots", N = "Boots", Right = true, Has = it => it.HasBoots },
        };
        static readonly Color[] TierColor = { Avatars.Hex("#00eaff", Color.white), Avatars.Hex("#c9a6ff", Color.white), Avatars.Hex("#ffb347", Color.white) };

        Combat Combat => Act.Combat;
        Inventory Inv => Act.Inv;

        // what is in a slot now
        int Now(string k)
        {
            if (k == "hand") return Inv.HeldId > 0 ? Inv.HeldId : 0;
            if (k == "armor") return Combat != null ? Combat.Armor : 0;
            if (k == "boots") return Combat != null && Combat.Boots && Inv.Uniques.Exists(u => u.Id == 211) ? 211 : 0;
            return Combat != null ? Combat.Gear(k) : 0;
        }
        // what you own that fits a slot, weakest first
        List<int> Choices(Slot s)
        {
            var own = new HashSet<int>(Inv.Counts.Where(kv => kv.Value > 0).Select(kv => kv.Key));
            foreach (var u in Inv.Uniques) own.Add(u.Id);
            return own.Where(id => Rules.Item(id) != null && Rules.Block(id) == null && s.Has(Rules.Item(id))).OrderBy(id => Rules.Item(id).Tier).ThenBy(id => id).ToList();
        }
        void Put(string k, int id)
        {
            Session.State[k] = id > 0 ? (object)id.ToString() : null;
            Session.Dirty = true;
            open = null;
        }
        // one line saying what a piece does (gearLine)
        static string Line(int id)
        {
            var it = Rules.Item(id);
            if (it == null) return "";
            string P(double v) => Math.Round(v * 100).ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (it.HasArmor) return $"−{P(it.Armor)}% damage taken";
            if (it.Helm > 0) return $"−{P(it.Helm)}% damage taken, on top";
            if (it.Power > 0) return $"+{P(it.Power)}% blade damage and mining";
            if (it.Regen > 0) return $"hearts back {P(it.Regen)}% faster";
            if (it.HasBoots) return $"+{P(it.Boots)}% speed · a dodge";
            if (it.HasDmg) return $"{it.Dmg} damage" + (it.Ranged ? " · ranged" : "");
            if (it.HasTool) return $"mines ×{it.Tool}";
            return "";
        }

        public void Draw(Rect body)
        {
            if (Session == null || Combat == null) { GUI.Label(body, "Your character needs the game's server (online, or offline on this device).", Ui.Small); return; }
            float colW = Mathf.Min(300, (body.width - 24) * 0.36f), midW = body.width - 2 * colW - 24, slotH = 66, gap = 8;
            float topH = Mathf.Max(3 * slotH + 2 * gap, 230);
            var left = new Rect(body.x, body.y, colW, topH);
            var mid = new Rect(body.x + colW + 12, body.y, midW, topH);
            var right = new Rect(mid.xMax + 12, body.y, colW, topH);
            float sy = body.y + (topH - (3 * slotH + 2 * gap)) / 2;
            int li = 0, ri = 0;
            foreach (var s in Slots)
            {
                var col = s.Right ? right : left;
                int row = s.Right ? ri++ : li++;
                DrawSlot(s, new Rect(col.x, sy + row * (slotH + gap), col.width, slotH));
            }
            // your character, turning
            Ui.Round(mid, new Color(1, 1, 1, 0.05f), 14, Ui.Line, 1);
            if (Avatars != null) Panel.DrawPreview(Avatars, new Rect(mid.x + 6, mid.y + 6, mid.width - 12, mid.height - 12));
            float y = body.y + topH + 12;
            // the choices for the open slot
            var os = Slots.FirstOrDefault(x => x.K == open);
            if (os != null)
            {
                var list = Choices(os);
                int now = Now(os.K);
                float h = 64;
                var box = new Rect(body.x, y, body.width, h);
                Ui.Round(box, new Color(1, 1, 1, 0.04f), 12, Ui.Line, 1);
                GUI.Label(new Rect(box.x + 12, box.y + 4, 200, 20), "<b>" + os.N + "</b>", Ui.Label);
                float bx = box.x + 10, by = box.y + 26;
                if (list.Count == 0) GUI.Label(new Rect(bx, by, box.width - 20, 30), "Nothing to wear here yet: craft one in the Crafting tab (Combat).", Ui.Small);
                foreach (var id in list)
                {
                    float w = 200;
                    if (bx + w > box.xMax - 10) break;
                    var r = new Rect(bx, by, w, 32);
                    Ui.Round(r, id == now ? new Color(1, 0.85f, 0.37f, 0.14f) : new Color(1, 1, 1, 0.05f), 9, id == now ? Ui.Gold : Ui.Line, 1);
                    Ui.Icon(new Rect(r.x + 4, r.y + 4, 24, 24), id);
                    GUI.Label(new Rect(r.x + 32, r.y + 1, w - 34, 18), "<b>" + Ui.NameOf(id) + "</b>", new GUIStyle(Ui.Small) { fontSize = 12, wordWrap = false, normal = { textColor = Ui.Paper } });
                    GUI.Label(new Rect(r.x + 32, r.y + 15, w - 34, 16), Line(id), new GUIStyle(Ui.Small) { fontSize = 10, wordWrap = false });
                    if (GUI.Button(r, GUIContent.none, GUIStyle.none)) Put(os.K, id == now ? 0 : id);
                    bx += w + 8;
                }
                if (now > 0 && GUI.Button(new Rect(box.xMax - 120, box.y + 4, 110, 22), "Take it off", Ui.Button)) Put(os.K, 0);
                y += h + 12;
            }
            // what it all adds up to
            int held = Now("hand");
            var hi = Rules.Item(held);
            bool blade = Combat.IsBlade(held);
            double dmg = (Rules.Block(held) == null && hi != null && hi.HasDmg ? hi.Dmg : 1) * (blade ? 1 + Combat.GearStat("gloves") : 1);
            double regen = 4 * (1 - Combat.GearStat("amulet")), taken = 1 - Combat.ArmorLeft;
            double tool = Rules.Block(held) == null && hi != null && hi.HasTool ? hi.Tool : 1;
            var bt = Rules.Item(211);
            var stats = new List<(string k, string v, string hint)>
            {
                ("Hearts", $"{Combat.Hp} / 10", $"one back every {Math.Round(regen, 1)} s"),
                ("Damage", $"{Math.Round(dmg, 1)}", held > 0 ? Ui.NameOf(held) : "bare hands"),
                ("Protection", $"−{Math.Round(taken * 100)}%", "damage taken"),
                ("Mining", $"×{Math.Round(tool * (1 + Combat.GearStat("gloves")), 2)}", hi != null && hi.HasTool ? Ui.NameOf(held) : "with what you hold"),
                ("Speed", Combat.Boots && bt != null ? $"+{Math.Round(bt.Boots * 100)}%" : "normal", Combat.Boots ? "Front-Runner Boots" : ""),
            };
            var title = Title();
            if (!string.IsNullOrEmpty(title)) stats.Add(("Title", title, ""));
            int n = stats.Count, perRow = body.width > 760 ? n : 3;
            float sw = (body.width - (perRow - 1) * 8) / perRow;
            for (int i = 0; i < n; i++)
            {
                var r = new Rect(body.x + (i % perRow) * (sw + 8), y + (i / perRow) * 70, sw, 62);
                Ui.Round(r, new Color(1, 1, 1, 0.05f), 12, Ui.Line, 1);
                GUI.Label(new Rect(r.x + 12, r.y + 6, r.width - 20, 16), stats[i].k.ToUpperInvariant(), new GUIStyle(Ui.Small) { fontSize = 11 });
                GUI.Label(new Rect(r.x + 12, r.y + 20, r.width - 20, 22), "<b>" + stats[i].v + "</b>", new GUIStyle(Ui.Label) { fontSize = 17, wordWrap = false });
                GUI.Label(new Rect(r.x + 12, r.y + 41, r.width - 20, 18), stats[i].hint, new GUIStyle(Ui.Small) { fontSize = 11, wordWrap = false });
            }
        }

        void DrawSlot(Slot s, Rect r)
        {
            int id = Now(s.K);
            var it = Rules.Item(id);
            bool isOpen = open == s.K;
            Ui.Round(r, new Color(1, 1, 1, isOpen ? 0.1f : 0.04f), 12, isOpen ? new Color(0.75f, 0.7f, 1, 0.6f) : Ui.Line, 1);
            if (it != null && it.Tier >= 1 && it.Tier <= 3) Ui.Fill(new Rect(r.x + 1, r.y + 8, 3, r.height - 16), TierColor[it.Tier - 1]);
            var ic = new Rect(r.x + 12, r.y + (r.height - 40) / 2, 40, 40);
            if (id > 0) Ui.Icon(ic, id); else Ui.Round(ic, new Color(1, 1, 1, 0.03f), 9, Ui.Line, 1);
            float tx = ic.xMax + 10, tw = r.xMax - tx - 8;
            GUI.Label(new Rect(tx, r.y + 6, tw, 16), s.N.ToUpperInvariant(), new GUIStyle(Ui.Small) { fontSize = 11, wordWrap = false });
            GUI.Label(new Rect(tx, r.y + 21, tw, 22), "<b>" + (id > 0 ? Ui.NameOf(id) : "Empty") + "</b>", new GUIStyle(Ui.Label) { wordWrap = false, clipping = TextClipping.Clip });
            if (id > 0) GUI.Label(new Rect(tx, r.y + 42, tw, 18), Line(id), new GUIStyle(Ui.Small) { fontSize = 11, wordWrap = false, clipping = TextClipping.Clip });
            if (s.K != "hand" && GUI.Button(r, GUIContent.none, GUIStyle.none)) open = isOpen ? null : s.K;
        }
    }
}
