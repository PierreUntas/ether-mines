// Ether Mines · what the interface shares (07-interface.js): the items' icons (Art/icons, the web version's
// own), the clay palette and the web's look (style.css: its fonts, Fredoka and IBM Plex Mono, its rounded
// dark glass, its buttons, tabs and fields, a skin every window draws with), and whether a window is open
// (then the keys and the mouse are for it, not for walking or mining).
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class Ui
    {
        public static bool PanelOpen;   // the inventory, crafting, chest... window
        public static bool Paused;      // the menu (Esc, or the touch screen's Menu button): the game goes on, your hands rest
        public static bool Cine;        // a cinematic has the camera (Story.cs): no HUD, no hands
        public static bool Blocking => PanelOpen || Paused || Cine || Story.ScreenUp || Ledger.Open || Chat.Typing || Signs.Open;
        // aiming at the world: the mouse captured (a computer), or no window open (a touch screen)
        public static bool Aiming => TouchPad.Active ? !Blocking : Cursor.lockState == CursorLockMode.Locked;

        // the interface is laid out in points: on a phone a point is a few pixels, so the bar, the buttons and
        // the windows keep a size a thumb can use (about as tall as the web page on the same phone)
        // a point is the web page's CSS pixel on the same phone: the screen's density over 163 (iOS) or 160 (Android);
        // on a computer, the window's height over 900 (a Retina screen, or a big window, draws it larger)
        public static float Scale => TouchPad.Active
            ? Mathf.Max(1, Screen.dpi > 50 ? Screen.dpi / (Application.platform == RuntimePlatform.IPhonePlayer ? 163f : 160f) : Mathf.Min(Screen.width, Screen.height) / 400f)
            : Mathf.Max(1, Screen.height / 900f);
        public static float W => Screen.width / Scale;
        public static float H => Screen.height / Scale;
        public static void Begin()
        {
            float s = Scale;
            GUI.matrix = Matrix4x4.Scale(new Vector3(s, s, 1));
            if (skin == null) MakeSkin();
            GUI.skin = skin;
        }
        // the notch and the rounded corners (in points): what the buttons keep clear of
        public static Rect Safe { get { var r = Screen.safeArea; float s = Scale; return new Rect(r.x / s, (Screen.height - r.yMax) / s, r.width / s, r.height / s); } }

        public static readonly Color Ink = new Color(0.11f, 0.086f, 0.23f), Paper = new Color(0.96f, 0.95f, 1f),
            Muted = new Color(0.79f, 0.76f, 0.95f), Mint = new Color(0.62f, 0.89f, 0.77f), Burn = new Color(1f, 0.6f, 0.72f),
            Gold = new Color(1f, 0.85f, 0.37f), Cyan = new Color(0.5f, 0.91f, 1f), Violet = new Color(0x8a / 255f, 0x7b / 255f, 0xef / 255f);

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

        // ---------- the web's look ----------
        public static readonly Color Glass = new Color(28 / 255f, 22 / 255f, 58 / 255f, 0.78f), Glass2 = new Color(46 / 255f, 38 / 255f, 92 / 255f, 0.85f),
            Line = new Color(190 / 255f, 178 / 255f, 1, 0.28f), Text = new Color(0xf4 / 255f, 0xf1 / 255f, 1),
            Lavender = new Color(0xb8 / 255f, 0xb0 / 255f, 0xe6 / 255f);
        public static Font Sans, SansMed, SansBold, Mono, MonoBold;
        static GUISkin skin;

        // a rounded rectangle drawn by the GUI itself, crisp at any size: its fill, and its edge if any (the web's
        // border-radius and border); a circle when the radius is half the height
        public static void Round(Rect r, Color fill, float radius, Color edge = default, float width = 0)
        {
            var rad = new Vector4(radius, radius, radius, radius);
            if (fill.a > 0) GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, fill, Vector4.zero, rad);
            if (width > 0 && edge.a > 0) GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, edge, new Vector4(width, width, width, width), rad);
        }

        // a list that scrolls: on a touch screen a finger drags it (IMGUI only scrolls with a wheel or its bar);
        // a drag past a few points is a scroll, not a tap on what it started on
        static bool tracking, dragging;
        static Vector2 dragFrom;
        static Rect dragArea;
        static void Drag(Rect area, ref Vector2 scroll)
        {
            if (!TouchPad.Active) return;
            var e = Event.current;
            if (e.type == EventType.MouseDown && area.Contains(e.mousePosition)) { tracking = true; dragging = false; dragFrom = e.mousePosition; dragArea = area; }
            else if (e.type == EventType.MouseDrag && tracking && dragArea == area)
            {
                if (!dragging && (e.mousePosition - dragFrom).magnitude > 8) dragging = true;
                if (dragging) { scroll.y = Mathf.Max(0, scroll.y - e.delta.y); e.Use(); }
            }
            else if (e.type == EventType.MouseUp && tracking && dragArea == area)
            {
                tracking = false;
                if (dragging) { dragging = false; GUIUtility.hotControl = 0; e.Use(); }
            }
        }
        public static Vector2 Scroll(Rect area, Vector2 scroll, Rect view) { Drag(area, ref scroll); return GUI.BeginScrollView(area, scroll, view); }
        public static Vector2 Scroll(Rect area, Vector2 scroll, Rect view, bool h, bool v, GUIStyle hs, GUIStyle vs) { Drag(area, ref scroll); return GUI.BeginScrollView(area, scroll, view, h, v, hs, vs); }

        // the web's button icons (unity/tools/export-ui-icons.mjs: chest, chat, view, menu, jump, run, crouch,
        // guard, ride, dodge, fullscreen), white, tinted by the color given
        static Texture2D glyphs;
        static readonly Dictionary<string, int> glyphAt = new Dictionary<string, int>();
        public static void Glyph(Rect r, string name, Color c)
        {
            if (glyphs == null)
            {
                glyphs = new Texture2D(2, 2, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear };
                glyphs.LoadImage(Resources.Load<TextAsset>("Art/ui-icons").bytes);
                var idx = MiniJson.Parse(Resources.Load<TextAsset>("Art/ui-icons-index").text) as Dictionary<string, object>;
                int i = 0;
                foreach (var n in (List<object>)idx["names"]) glyphAt[(string)n] = i++;
            }
            if (!glyphAt.TryGetValue(name, out var k)) return;
            float cell = 1f / glyphAt.Count;
            var o = GUI.color;
            GUI.color = c;
            GUI.DrawTextureWithTexCoords(r, glyphs, new Rect(k * cell, 0, cell, 1));
            GUI.color = o;
        }

        // the web's .chip (clay look): a rounded dark glass with a thin light edge (border: the edge's color, if other)
        // a life bar (16-mobs.js: yours, and the mobs' over their heads): a dark inset track, a pale trail
        // (lag) behind the fill, the fill shaded like clay (a light top line, a darker foot), and notches
        public static void LifeBar(Rect bar, float k, float lag, Color fill, Color foot, int notches)
        {
            float rr = bar.height / 2;
            Round(bar, new Color(10 / 255f, 6 / 255f, 30 / 255f, 0.65f), rr, new Color(190 / 255f, 178 / 255f, 1, 0.18f), 1);
            if (lag > k) Round(new Rect(bar.x, bar.y, Mathf.Max(bar.height, bar.width * lag), bar.height), new Color(1, 0.95f, 0.93f, 0.6f), rr);
            if (k > 0)
            {
                float w = Mathf.Max(bar.height, bar.width * k);
                Round(new Rect(bar.x, bar.y, w, bar.height), foot, rr);
                Round(new Rect(bar.x, bar.y, w, bar.height * 0.78f), fill, rr);
                Round(new Rect(bar.x + 4, bar.y + 2, Mathf.Max(3, w - 8), Mathf.Max(2, bar.height * 0.22f)), new Color(1, 1, 1, 0.5f), 1.5f);
            }
            if (notches > 1)
            {
                var o = GUI.color;
                GUI.color = new Color(28 / 255f, 22 / 255f, 58 / 255f, 0.55f);
                for (int i = 1; i < notches; i++)
                    GUI.DrawTexture(new Rect(bar.x + bar.width * i / notches - 0.5f, bar.y + 1, 1, bar.height - 2), Texture2D.whiteTexture);
                GUI.color = o;
            }
        }

        // the Ether crystal (the life's icon): two rhombi, the upper one bigger, each with a darker right half
        public static void Crystal(Rect r, Color light, Color dark)
        {
            void Rhombus(Rect q, Color c)
            {
                var m = GUI.matrix;
                var ctr = new Vector3(q.center.x, q.center.y, 0);
                float side = q.width / 1.4142f;
                GUI.matrix = m * Matrix4x4.TRS(ctr, Quaternion.identity, new Vector3(1, q.height / q.width, 1)) * Matrix4x4.TRS(Vector3.zero, Quaternion.Euler(0, 0, 45), Vector3.one) * Matrix4x4.TRS(-new Vector3(side / 2, side / 2, 0), Quaternion.identity, Vector3.one);
                Round(new Rect(0, 0, side, side), c, 1.5f);
                GUI.matrix = m;
            }
            Rhombus(new Rect(r.x, r.y, r.width, r.height * 0.68f), light);
            Rhombus(new Rect(r.x + r.width * 0.2f, r.y + r.height * 0.6f, r.width * 0.6f, r.height * 0.4f), dark);
        }

        public static void Chip(Rect r, Color? border = null) => Round(r, Glass, 14, border ?? Line, 1);

        public static void Fill(Rect r, Color c) { var o = GUI.color; GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = o; }

        public static void Frame(Rect r, Color c, float w = 2)
        {
            Fill(new Rect(r.x, r.y, r.width, w), c); Fill(new Rect(r.x, r.yMax - w, r.width, w), c);
            Fill(new Rect(r.x, r.y, w, r.height), c); Fill(new Rect(r.xMax - w, r.y, w, r.height), c);
        }

        // a style's rounded background, baked into a little texture the style stretches (its corners kept)
        static Texture2D RoundTex(Color fill, Color edge, float rad, float width = 1)
        {
            int n = Mathf.CeilToInt(rad) * 2 + 4;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float px = x + 0.5f, py = y + 0.5f;
                    float cx = Mathf.Clamp(px, rad, n - rad), cy = Mathf.Clamp(py, rad, n - rad);
                    float d = rad - Mathf.Sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)); // inside: > 0
                    float a = Mathf.Clamp01(d + 0.5f);
                    float e = width > 0 ? Mathf.Clamp01(width - d + 0.5f) : 0; // on the edge
                    var c = Color.Lerp(fill, edge, e * (edge.a > 0 ? 1 : 0));
                    c.a = Mathf.Lerp(fill.a, edge.a, e * (edge.a > 0 ? 1 : 0)) * a;
                    t.SetPixel(x, y, c);
                }
            t.Apply();
            return t;
        }
        static void Bg(GUIStyle st, Color fill, Color edge, float rad, Color? hover = null, Color? active = null, Color? focus = null)
        {
            int b = Mathf.CeilToInt(rad) + 2;
            st.border = new RectOffset(b, b, b, b);
            st.normal.background = RoundTex(fill, edge, rad);
            st.hover.background = RoundTex(hover ?? fill, edge, rad);
            st.active.background = RoundTex(active ?? hover ?? fill, edge, rad);
            st.focused.background = focus.HasValue ? RoundTex(fill, focus.Value, rad) : st.normal.background;
            st.onNormal.background = st.active.background; st.onHover.background = st.active.background; st.onActive.background = st.active.background;
            st.onFocused.background = st.focused.background;
        }
        static void Tint(GUIStyle st, Color c) { st.normal.textColor = st.hover.textColor = st.active.textColor = st.focused.textColor = c; st.onNormal.textColor = st.onHover.textColor = st.onActive.textColor = st.onFocused.textColor = c; }

        // the skin every window draws with: Fredoka, light text, the web's .b buttons, its fields, thin scrollbars
        static void MakeSkin()
        {
            Sans = Resources.Load<Font>("Fonts/Fredoka-Regular");
            SansMed = Resources.Load<Font>("Fonts/Fredoka-Medium");
            SansBold = Resources.Load<Font>("Fonts/Fredoka-SemiBold");
            Mono = Resources.Load<Font>("Fonts/IBMPlexMono-Regular");
            MonoBold = Resources.Load<Font>("Fonts/IBMPlexMono-SemiBold");
            skin = Object.Instantiate(GUI.skin);
            if (Sans != null) skin.font = Sans;
            skin.label.font = Sans; skin.label.fontSize = 15; skin.label.richText = true; Tint(skin.label, Text);
            skin.label.padding = new RectOffset(0, 0, 2, 2);
            var b = skin.button;
            b.font = Sans; b.fontSize = 14; b.richText = true; b.padding = new RectOffset(11, 11, 6, 6); Tint(b, Text);
            Bg(b, new Color(1, 1, 1, 0.08f), Line, 9, new Color(1, 1, 1, 0.14f), new Color(1, 1, 1, 0.2f));
            foreach (var f in new[] { skin.textField, skin.textArea })
            {
                f.font = Sans; f.fontSize = 16; f.padding = new RectOffset(12, 12, 8, 8); Tint(f, Text);
                Bg(f, new Color(1, 1, 1, 0.08f), Line, 10, null, null, Cyan);
            }
            skin.settings.cursorColor = Cyan;
            skin.settings.selectionColor = new Color(Violet.r, Violet.g, Violet.b, 0.5f);
            Bg(skin.box, Glass2, Line, 16);
            Bg(skin.window, Glass2, Line, 16);
            skin.toggle.font = Sans; Tint(skin.toggle, Text);
            // thin scrollbars, a light thumb
            skin.verticalScrollbar.fixedWidth = 8; skin.verticalScrollbar.border = new RectOffset(0, 0, 0, 0);
            skin.verticalScrollbar.normal.background = null;
            skin.verticalScrollbarThumb.fixedWidth = 6;
            Bg(skin.verticalScrollbarThumb, new Color(1, 1, 1, 0.25f), Color.clear, 3);
            skin.horizontalScrollbar.normal.background = null;
            Bg(skin.horizontalScrollbarThumb, new Color(1, 1, 1, 0.25f), Color.clear, 3);
        }

        static GUIStyle label, small, title, button, primary, count, mono, tab, tabOn;
        public static GUIStyle Label => Make(ref label, 15, FontStyle.Normal, Paper, true);
        public static GUIStyle Small => Make(ref small, 13, FontStyle.Normal, Muted, true);
        public static GUIStyle Title => Make(ref title, 20, FontStyle.Bold, Paper, false);
        public static GUIStyle Count => Make(ref count, 13, FontStyle.Bold, Paper, false, TextAnchor.LowerRight);
        // the web's small monospaced notes (var(--mono), muted)
        public static GUIStyle MonoSmall { get { if (mono == null) { Make(ref mono, 11, FontStyle.Normal, Lavender, true); mono.font = Mono; } return mono; } }
        static GUIStyle Make(ref GUIStyle s, int size, FontStyle f, Color c, bool wrap, TextAnchor a = TextAnchor.UpperLeft)
        {
            if (s == null)
            {
                s = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = FontStyle.Normal, wordWrap = wrap, richText = true, alignment = a };
                // the bold styles take Fredoka's heavier face rather than a faked bold
                if (f == FontStyle.Bold && SansBold != null) s.font = SansBold;
                else if (f == FontStyle.Bold) s.fontStyle = FontStyle.Bold;
                s.normal.textColor = c;
            }
            return s;
        }
        public static GUIStyle Button => button ?? (button = new GUIStyle(GUI.skin.button));
        // the web's .b.primary: violet, no edge
        public static GUIStyle Primary
        {
            get
            {
                if (primary == null)
                {
                    primary = new GUIStyle(Button) { font = SansMed };
                    Tint(primary, Color.white);
                    Bg(primary, Violet, Color.clear, 9, new Color(0.6f, 0.54f, 0.97f), new Color(0.47f, 0.41f, 0.86f));
                }
                return primary;
            }
        }
        // the web's .pill: a rounded chip, violet when chosen (.pill.sel)
        static GUIStyle pill, pillOn;
        public static GUIStyle Pill(bool on)
        {
            if (pill == null)
            {
                pill = new GUIStyle(Button) { fontSize = 15, padding = new RectOffset(12, 12, 4, 4), alignment = TextAnchor.MiddleCenter };
                Bg(pill, new Color(1, 1, 1, 0.06f), Line, 15, new Color(1, 1, 1, 0.12f));
                pillOn = new GUIStyle(pill);
                Tint(pillOn, Color.white);
                Bg(pillOn, Violet, Color.clear, 15);
            }
            return on ? pillOn : pill;
        }
        // the panel's section headings (.cat: mono, spaced capitals, muted)
        static GUIStyle cat;
        public static GUIStyle Cat { get { if (cat == null) { cat = new GUIStyle(GUI.skin.label) { font = Mono, fontSize = 12, wordWrap = false }; Tint(cat, Lavender); } return cat; } }

        // the panel's tabs (.tab): the open one on a light glass with an edge, the others muted
        public static GUIStyle Tab(bool on)
        {
            if (tab == null)
            {
                tab = new GUIStyle(GUI.skin.label) { fontSize = 16, alignment = TextAnchor.MiddleCenter, padding = new RectOffset(12, 12, 6, 6) };
                Tint(tab, Lavender);
                tab.hover.textColor = Text;
                tabOn = new GUIStyle(tab);
                Tint(tabOn, Text);
                Bg(tabOn, new Color(1, 1, 1, 0.1f), Line, 8);
            }
            return on ? tabOn : tab;
        }

        public static string NameOf(int id) => Interaction.NameOf(id);
        public static string Hex(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);
    }
}
