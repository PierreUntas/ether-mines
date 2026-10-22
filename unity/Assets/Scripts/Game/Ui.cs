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

        public static void Icon(Rect r, int id)
        {
            LoadIcons();
            if (!iconIndex.TryGetValue(id, out var i)) return;
            float u = (i % iconCols) * iconSize / (float)icons.width, v = 1 - ((i / iconCols) + 1) * iconSize / (float)icons.height;
            GUI.DrawTextureWithTexCoords(r, icons, new Rect(u, v, iconSize / (float)icons.width, iconSize / (float)icons.height));
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
