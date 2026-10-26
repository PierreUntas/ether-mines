// Ether Mines · what the shop's cosmetics look like on a character (17-looks.js), from the game's own
// models (Resources/looks.json, exported by tools/export-looks.mjs): headwear, back pieces, companions,
// outfits (the trousers' color and the details on the body, arms and legs), trails. A look is one
// cosmetic per slot; the shared slots travel to the other players as a code ("outfit.head.back.companion.trail.face.eyes.mouth").
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class Looks
    {
        public static readonly string[] Slots = { "outfit", "head", "face", "eyes", "mouth", "back", "companion", "trail", "tool", "plating" };
        // the face (a beard), the eyes and the mouth come last: an older game reads the code as before
        public static readonly string[] Shared = { "outfit", "head", "back", "companion", "trail", "face", "eyes", "mouth" };
        public static readonly Dictionary<string, string> SlotLabel = new Dictionary<string, string>
        {
            ["outfit"] = "Outfit", ["head"] = "Headwear", ["face"] = "Face", ["eyes"] = "Eyes", ["mouth"] = "Mouth", ["back"] = "Back", ["companion"] = "Companion", ["trail"] = "Trail", ["tool"] = "Tool trim", ["plating"] = "Plating trim",
        };

        // ---------- the face (14-startup.js drawFace): 8×8 pixels, row 0 at the top ----------
        // The skin, the hair's edge, the blush, the eyes and the mouth: the usual ones, or the ones worn (their
        // px rows: e an eye's dark, w its white, m the mouth). Returns each pixel that isn't skin, hair = null
        // for the hair's color.
        public static readonly Color Skin = new Color(0xf6 / 255f, 0xd3 / 255f, 0xb8 / 255f);
        static readonly Color Ink = new Color(0x1c / 255f, 0x16 / 255f, 0x3a / 255f), White = Color.white,
            MouthInk = new Color(0x7a / 255f, 0x3b / 255f, 0x4a / 255f), Blush = new Color(1f, 0xb3 / 255f, 0xcf / 255f), Lip = new Color(0xc9 / 255f, 0x8a / 255f, 0x74 / 255f);
        public static List<(int x, int y, Color? c)> FacePixels(int eyes, int mouth)
        {
            var px = new Dictionary<int, (int, int, Color?)>();
            void Put(int x, int y, Color? c) => px[y * 8 + x] = (x, y, c);
            foreach (var y in new[] { 2, 3 }) { Put(0, y, null); Put(7, y, null); }
            Put(1, 5, Blush); Put(6, 5, Blush);
            bool Worn(int id)
            {
                if (id <= 0 || !Rules.Cosmetics.TryGetValue(id, out var c) || !(c.Raw != null && c.Raw.TryGetValue("px", out var o) && o is List<object> rows)) return false;
                for (int y = 0; y < rows.Count && y < 8; y++)
                {
                    var row = rows[y] as string ?? "";
                    for (int x = 0; x < row.Length && x < 8; x++)
                        if (row[x] == 'e') Put(x, y, Ink); else if (row[x] == 'w') Put(x, y, White); else if (row[x] == 'm') Put(x, y, MouthInk);
                }
                return true;
            }
            if (!Worn(eyes)) { Put(2, 4, Ink); Put(5, 4, Ink); }
            if (!Worn(mouth)) { Put(3, 6, Lip); Put(4, 6, Lip); }
            return new List<(int, int, Color?)>(px.Values);
        }
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
            if (m == null || !m.TryGetValue(id.ToString(), out var parts) || !(parts is List<object> l)) return null;
            var anims = Slot("anim");
            var moving = anims != null && anims.TryGetValue(slot + "." + id, out var am) ? am as List<object> : null;
            if (l.Count == 0 && (moving == null || moving.Count == 0)) return null;
            var g = HeldModels.FromParts(slot + " " + id, l);
            if (moving == null || moving.Count == 0) return g;
            // the moving parts: under their parent's frame, posed every frame (LookAnim)
            var la = g.AddComponent<LookAnim>();
            int i = 0;
            foreach (Dictionary<string, object> a in moving)
            {
                var frame = new GameObject("moving frame").transform;
                frame.SetParent(g.transform, false);
                var pp = F(a["pp"]); var pq = F(a["pq"]); var ps = F(a["ps"]);
                frame.localPosition = new Vector3(pp[0], pp[1], -pp[2]);
                frame.localRotation = new Quaternion(-pq[0], -pq[1], pq[2], pq[3]); // mirrored across z
                frame.localScale = new Vector3(ps[0], ps[1], ps[2]);
                var part = HeldModels.FromParts(slot + " " + id + " moving " + i++, (List<object>)a["parts"]);
                part.transform.SetParent(frame, false);
                var ch = new float[9][];
                var cl = (List<object>)a["ch"];
                for (int k = 0; k < 9; k++) ch[k] = F(cl[k]);
                la.Parts.Add((part.transform, ch));
            }
            la.Pose(Time.time);
            return g;
        }
        static float[] F(object o) { var l = (List<object>)o; var r = new float[l.Count]; for (int i = 0; i < l.Count; i++) r[i] = (float)MiniJson.ToDouble(l[i]); return r; }

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

        // a pickaxe trim's glow (toolTrim): a color by its style, the prism's turning through the hues; a plating
        // trim's (platingTrimColor): its own color. null without one
        static readonly Dictionary<string, int> TrimGlow = new Dictionary<string, int> { ["gold"] = 0xffb000, ["rose"] = 0xff7a8a, ["obsidian"] = 0x6a3cff, ["frost"] = 0x7fe0ff, ["emerald"] = 0x2ad07a };
        public static Color? ToolTrim(Dictionary<string, int> look, float t)
        {
            if (look == null || !look.TryGetValue("tool", out var id) || !Rules.Cosmetics.TryGetValue(id, out var c)) return null;
            if (c.Style == "prism") return Hsl(t * 0.25f % 1, 0.9f, 0.45f);
            // the premium trims breathe: the forge's embers flare and fade, the stake's light shifts violet to cyan
            if (c.Style == "forge") return Color.Lerp(new Color(1f, 0.42f, 0.24f), new Color(1f, 0.82f, 0.4f), 0.5f + 0.5f * Mathf.Sin(t * 5));
            if (c.Style == "stake") return Color.Lerp(new Color(0.71f, 0.55f, 1f), new Color(0.62f, 0.91f, 1f), 0.5f + 0.5f * Mathf.Sin(t * 2));
            int h = TrimGlow.TryGetValue(c.Style ?? "", out var v) ? v : TrimGlow["gold"];
            return new Color(((h >> 16) & 255) / 255f, ((h >> 8) & 255) / 255f, (h & 255) / 255f);
        }
        public static Color? PlatingTrim(Dictionary<string, int> look) =>
            look != null && look.TryGetValue("plating", out var id) && Rules.Cosmetics.TryGetValue(id, out var c) && c.Color != null ? Avatars.Hex(c.Color, Color.white) : (Color?)null;
        // THREE.Color.setHSL
        static Color Hsl(float h, float s, float l)
        {
            float q = l < 0.5f ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
            float Hue(float t) { t = (t % 1 + 1) % 1; return t < 1 / 6f ? p + (q - p) * 6 * t : t < 0.5f ? q : t < 2 / 3f ? p + (q - p) * (2 / 3f - t) * 6 : p; }
            return new Color(Hue(h + 1 / 3f), Hue(h), Hue(h - 1 / 3f));
        }

        public static string TrailStyle(int id) { var m = Slot("trail"); return m != null && m.TryGetValue(id.ToString(), out var s) ? s as string : null; }

        // the trail's little cubes: their colors (17-looks.js TRAIL_COLORS)
        static readonly Dictionary<string, string[]> TrailColors = new Dictionary<string, string[]>
        {
            ["ember"] = new[] { "#ff6b3d", "#ffb347" }, ["frost"] = new[] { "#9fe8ff", "#ffffff", "#5fb8ff" }, ["shadow"] = new[] { "#3a2a5a", "#8a6cff", "#1a1a22" },
            ["gwei"] = new[] { "#ffd95e", "#ffd95e", "#fff3c0" }, ["silver"] = new[] { "#e8eef6", "#b8c4d6", "#ffffff" }, ["coins"] = new[] { "#ffd166", "#c89a2e" },
            ["neon"] = new[] { "#ff2bd6", "#00eaff", "#b6ff00" }, ["bubbles"] = new[] { "#3fd2c7" }, ["pinkbubbles"] = new[] { "#ff9ec7", "#ffd6e7" },
            ["deepbubbles"] = new[] { "#2a6fd8", "#7fd0ff", "#1d5c63" },
            ["forge"] = new[] { "#ff6b3d", "#ffb347", "#ffd166", "#3a3440" }, ["stake"] = new[] { "#f4f1ff", "#b48cff", "#9fe8ff" },
        };
        public static bool Bubbles(string style) => style == "bubbles" || style == "pinkbubbles" || style == "deepbubbles";
        public static Color TrailColor(string style, float t)
        {
            if (style == "spectrum") return Color.HSVToRGB(t * 0.4f % 1, 0.63f, 0.95f); // the web's HSL(h, 0.85, 0.65)
            if (style == "pastel") return Color.HSVToRGB(t * 0.4f % 1, 0.21f, 0.96f);   // HSL(h, 0.7, 0.86)
            var l = TrailColors.TryGetValue(style ?? "", out var a) ? a : TrailColors["bubbles"];
            return Avatars.Hex(l[Random.Range(0, l.Length)], Color.white);
        }

        // "outfit.head.back.companion.trail.face.eyes.mouth" (lookCode, parseLook)
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
