// Ether Mines · what the interface shares (07-interface.js): the items' icons (Art/icons, the web version's
// own), the clay palette, a few styles, and whether a window is open (then the keys and the mouse are
// for it, not for walking or mining). Plain immediate-mode GUI for now.
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class Ui
    {
        public static bool PanelOpen;   // the inventory, crafting, chest... window
        public static bool Blocking => PanelOpen || Chat.Typing || Signs.Open;
        // aiming at the world: the mouse captured (a computer), or no window open (a touch screen)
        public static bool Aiming => TouchPad.Active ? !Blocking : Cursor.lockState == CursorLockMode.Locked;

        // the interface is laid out in points: on a phone a point is a few pixels, so the bar, the buttons and
        // the windows keep a size a thumb can use (about as tall as the web page on the same phone)
        public static float Scale => TouchPad.Active ? Mathf.Max(1, Mathf.Min(Screen.width, Screen.height) / 430f) : 1;
        public static float W => Screen.width / Scale;
        public static float H => Screen.height / Scale;
        public static void Begin() { float s = Scale; GUI.matrix = Matrix4x4.Scale(new Vector3(s, s, 1)); }
        // the notch and the rounded corners (in points): what the buttons keep clear of
        public static Rect Safe { get { var r = Screen.safeArea; float s = Scale; return new Rect(r.x / s, (Screen.height - r.yMax) / s, r.width / s, r.height / s); } }

        public static readonly Color Ink = new Color(0.11f, 0.086f, 0.23f), Paper = new Color(0.96f, 0.95f, 1f),
            Muted = new Color(0.79f, 0.76f, 0.95f), Mint = new Color(0.62f, 0.89f, 0.77f), Burn = new Color(1f, 0.6f, 0.72f),
            Gold = new Color(1f, 0.85f, 0.37f), Cyan = new Color(0.5f, 0.91f, 1f), Violet = new Color(0.54f, 0.48f, 0.94f);

        static Texture2D icons;
        static int iconSize = 48, iconCols = 16;
        static readonly Dictionary<int, int> iconIndex = new Dictionary<int, int>();

        static void LoadIcons()
        {
            if (icons != null) return;
            icons = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            icons.LoadImage(Resources.Load<TextAsset>("Art/icons").bytes);
            icons.filterMode = FilterMode.Point;
            var idx = MiniJson.Parse(Resources.Load<TextAsset>("Art/icons-index").text) as Dictionary<string, object>;
            iconSize = MiniJson.ToInt(idx["size"], 48);
            iconCols = MiniJson.ToInt(idx["cols"], 16);
            foreach (var kv in (Dictionary<string, object>)idx["index"]) iconIndex[int.Parse(kv.Key)] = MiniJson.ToInt(kv.Value);
        }

        // a block's or an item's color, on average (05-player.js avgColor): its icon's opaque pixels
        static readonly Dictionary<int, Color> avg = new Dictionary<int, Color>();
        public static Color IconColor(int id)
        {
            if (avg.TryGetValue(id, out var c)) return c;
            LoadIcons();
            c = Color.white;
            if (iconIndex.TryGetValue(id, out var i))
            {
                // the texture's rows go up: the icon's square from its bottom-left corner
                int x0 = (i % iconCols) * iconSize, y0 = icons.height - ((i / iconCols) + 1) * iconSize;
                var px = icons.GetPixels(x0, y0, iconSize, iconSize);
                float r = 0, g = 0, b = 0; int n = 0;
                foreach (var p in px) if (p.a > 0.4f) { r += p.r; g += p.g; b += p.b; n++; }
                if (n > 0) c = new Color(r / n, g / n, b / n);
            }
            return avg[id] = c;
        }

        public static void Icon(Rect r, int id)
        {
            LoadIcons();
            if (!iconIndex.TryGetValue(id, out var i)) return;
            float u = (i % iconCols) * iconSize / (float)icons.width, v = 1 - ((i / iconCols) + 1) * iconSize / (float)icons.height;
            GUI.DrawTextureWithTexCoords(r, icons, new Rect(u, v, iconSize / (float)icons.width, iconSize / (float)icons.height));
        }

        // the web's .chip: a rounded dark glass with a thin light edge (border: the edge's color, if other)
        static Texture2D chipTex;
        static GUIStyle chipStyle;
        public static readonly Color Glass = new Color(28 / 255f, 22 / 255f, 58 / 255f, 0.78f), Line = new Color(190 / 255f, 178 / 255f, 1, 0.28f);
        public static void Chip(Rect r, Color? border = null)
        {
            if (chipTex == null)
            {
                const int n = 32; const float rad = 10;
                chipTex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        // the distance to the rounded rectangle's edge: a soft corner
                        float cx = Mathf.Clamp(x + 0.5f, rad, n - rad), cy = Mathf.Clamp(y + 0.5f, rad, n - rad);
                        float d = rad - Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy));
                        chipTex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(d + 0.5f)));
                    }
                chipTex.Apply();
                chipStyle = new GUIStyle { border = new RectOffset(12, 12, 12, 12) };
                chipStyle.normal.background = chipTex;
            }
            var o = GUI.color;
            // the rim, then the glass one pixel inside it
            GUI.color = border ?? Line;
            GUI.Box(r, GUIContent.none, chipStyle);
            GUI.color = Glass;
            GUI.Box(new Rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2), GUIContent.none, chipStyle);
            GUI.color = o;
        }

        public static void Fill(Rect r, Color c) { var o = GUI.color; GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = o; }

        public static void Frame(Rect r, Color c, float w = 2)
        {
            Fill(new Rect(r.x, r.y, r.width, w), c); Fill(new Rect(r.x, r.yMax - w, r.width, w), c);
            Fill(new Rect(r.x, r.y, w, r.height), c); Fill(new Rect(r.xMax - w, r.y, w, r.height), c);
        }

        static GUIStyle label, small, title, button, primary, count;
        public static GUIStyle Label => Make(ref label, 15, FontStyle.Normal, Paper, true);
        public static GUIStyle Small => Make(ref small, 13, FontStyle.Normal, Muted, true);
        public static GUIStyle Title => Make(ref title, 20, FontStyle.Bold, Paper, false);
        public static GUIStyle Count => Make(ref count, 13, FontStyle.Bold, Paper, false, TextAnchor.LowerRight);
        static GUIStyle Make(ref GUIStyle s, int size, FontStyle f, Color c, bool wrap, TextAnchor a = TextAnchor.UpperLeft)
        {
            if (s == null) { s = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = f, wordWrap = wrap, richText = true, alignment = a }; s.normal.textColor = c; }
            return s;
        }
        public static GUIStyle Button => button ?? (button = new GUIStyle(GUI.skin.button) { fontSize = 14, padding = new RectOffset(10, 10, 5, 5) });
        public static GUIStyle Primary
        {
            get
            {
                if (primary == null) { primary = new GUIStyle(Button) { fontStyle = FontStyle.Bold }; primary.normal.textColor = Gold; primary.hover.textColor = Color.white; }
                return primary;
            }
        }

        public static string NameOf(int id) => Interaction.NameOf(id);
        public static string Hex(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);
    }
}
