// Ether Mines · what the shop's cosmetics look like on a character (17-looks.js), from the game's own
// models (Resources/looks.json, exported by tools/export-looks.mjs): headwear, back pieces, companions,
// outfits (the trousers' color and the details on the body, arms and legs), trails. A look is one
// cosmetic per slot; the shared slots travel to the other players as a code ("outfit.head.back.companion.trail").
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class Looks
    {
        public static readonly string[] Slots = { "outfit", "head", "back", "companion", "trail", "tool", "plating" };
        public static readonly string[] Shared = { "outfit", "head", "back", "companion", "trail" };
        public static readonly Dictionary<string, string> SlotLabel = new Dictionary<string, string>
        {
            ["outfit"] = "Outfit", ["head"] = "Headwear", ["back"] = "Back", ["companion"] = "Companion", ["trail"] = "Trail", ["tool"] = "Tool trim", ["plating"] = "Plating trim",
        };
        public static readonly Color DefaultPants = new Color(0x6a / 255f, 0x58 / 255f, 0xe0 / 255f);

        static Dictionary<string, object> data;
        static Dictionary<string, object> Slot(string s)
        {
            if (data == null) data = (Dictionary<string, object>)MiniJson.Parse(Resources.Load<TextAsset>("looks").text);
            return data.TryGetValue(s, out var o) ? o as Dictionary<string, object> : null;
        }

        // a headwear, back piece or companion's model, or null
        public static GameObject Piece(string slot, int id)
        {
            var m = Slot(slot);
            if (m == null || !m.TryGetValue(id.ToString(), out var parts) || !(parts is List<object> l) || l.Count == 0) return null;
            return HeldModels.FromParts(slot + " " + id, l);
        }

        public sealed class Outfit { public Color Color, Pants; public Dictionary<string, List<object>> On = new Dictionary<string, List<object>>(); }
        static readonly Dictionary<int, Outfit> outfits = new Dictionary<int, Outfit>();
        public static Outfit OutfitOf(int id)
        {
            if (outfits.TryGetValue(id, out var o)) return o;
            var m = Slot("outfit");
            if (m == null || !m.TryGetValue(id.ToString(), out var v) || !(v is Dictionary<string, object> d)) return outfits[id] = null;
            o = new Outfit { Color = Avatars.Hex(d["color"] as string, Color.white), Pants = Avatars.Hex(d["pants"] as string, DefaultPants) };
            if (d.TryGetValue("on", out var on) && on is Dictionary<string, object> parts)
                foreach (var kv in parts) o.On[kv.Key] = kv.Value as List<object>;
            return outfits[id] = o;
        }
        public static string OutfitHex(int id) => Rules.Cosmetics.TryGetValue(id, out var c) ? c.Color : null;

        // what a plating (armor.<item>), the Front-Runner Boots (boots.211) or the Titan's cape (cape.205) adds
        // to a character, by the part it hangs on (body, arm0, arm1, leg0, leg1, head, up, root); null if nothing
        public static Dictionary<string, List<object>> Worn(string kind, int id)
        {
            var m = Slot(kind);
            if (m == null || !m.TryGetValue(id.ToString(), out var v) || !(v is Dictionary<string, object> d)) return null;
            var o = new Dictionary<string, List<object>>();
            foreach (var kv in d) if (kv.Value is List<object> l && l.Count > 0) o[kv.Key] = l;
            return o;
        }

        public static string TrailStyle(int id) { var m = Slot("trail"); return m != null && m.TryGetValue(id.ToString(), out var s) ? s as string : null; }

        // the trail's little cubes: their colors (17-looks.js TRAIL_COLORS)
        static readonly Dictionary<string, string[]> TrailColors = new Dictionary<string, string[]>
        {
            ["ember"] = new[] { "#ff6b3d", "#ffb347" }, ["frost"] = new[] { "#9fe8ff", "#ffffff", "#5fb8ff" }, ["shadow"] = new[] { "#3a2a5a", "#8a6cff", "#1a1a22" },
            ["gwei"] = new[] { "#ffd95e", "#ffd95e", "#fff3c0" }, ["silver"] = new[] { "#e8eef6", "#b8c4d6", "#ffffff" }, ["coins"] = new[] { "#ffd166", "#c89a2e" },
            ["neon"] = new[] { "#ff2bd6", "#00eaff", "#b6ff00" }, ["bubbles"] = new[] { "#3fd2c7" }, ["pinkbubbles"] = new[] { "#ff9ec7", "#ffd6e7" },
            ["deepbubbles"] = new[] { "#2a6fd8", "#7fd0ff", "#1d5c63" },
        };
        public static bool Bubbles(string style) => style == "bubbles" || style == "pinkbubbles" || style == "deepbubbles";
        public static Color TrailColor(string style, float t)
        {
            if (style == "spectrum") return Color.HSVToRGB(t * 0.4f % 1, 0.75f, 1);
            if (style == "pastel") return Color.HSVToRGB(t * 0.4f % 1, 0.35f, 1);
            var l = TrailColors.TryGetValue(style ?? "", out var a) ? a : TrailColors["bubbles"];
            return Avatars.Hex(l[Random.Range(0, l.Length)], Color.white);
        }

        // "outfit.head.back.companion.trail" (lookCode, parseLook)
        public static string Code(Dictionary<string, int> look)
        {
            var p = new string[Shared.Length];
            for (int i = 0; i < Shared.Length; i++) p[i] = look != null && look.TryGetValue(Shared[i], out var id) ? id.ToString() : "0";
            return string.Join(".", p);
        }
        public static Dictionary<string, int> Parse(string code)
        {
            var o = new Dictionary<string, int>();
            if (string.IsNullOrEmpty(code)) return o;
            var p = code.Split('.');
            for (int i = 0; i < p.Length && i < Shared.Length; i++)
                if (int.TryParse(p[i], out var id) && id > 0 && Rules.Cosmetics.TryGetValue(id, out var c) && c.Slot == Shared[i]) o[Shared[i]] = id;
            return o;
        }

        // your look (myLook): only what you really own
        public static Dictionary<string, int> Mine(Session s, ICollection<int> owned)
        {
            var o = new Dictionary<string, int>();
            if (s == null || !s.State.TryGetValue("look", out var l) || !(l is Dictionary<string, object> d)) return o;
            foreach (var slot in Slots)
                if (d.TryGetValue(slot, out var v) && v != null)
                {
                    int id = v is double x ? (int)x : int.TryParse(v.ToString(), out var y) ? y : 0;
                    if (id > 0 && Rules.Cosmetics.TryGetValue(id, out var c) && c.Slot == slot && owned.Contains(id)) o[slot] = id;
                }
            return o;
        }

        // the furthest title you hold (bestTitle)
        static readonly int[] TitleRank = { 20, 18, 17, 16, 19, 15 };
        public static string BestTitle(ICollection<int> owned)
        {
            foreach (var id in TitleRank) if (owned.Contains(id) && Rules.Cosmetics.TryGetValue(id, out var c)) return c.N;
            return "";
        }
    }
}
