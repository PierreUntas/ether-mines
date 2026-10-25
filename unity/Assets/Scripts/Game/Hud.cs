// Ether Mines · what's drawn over the world (play.html #hud, 07-interface.js ui/logEv): the crosshair,
// the 9-slot bar with the web version's own icons (exported to Art/icons), how far the mining has gone,
// and the feed of what you mint and burn; drawn as the web's clay look (style.css #bar, .slot, .ev, #selname).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Hud : MonoBehaviour
    {
        public Interaction Act;
        string selKey;
        float selAt = -99;
        Texture2D icons, white;
        int iconSize = 48, iconCols = 16;
        readonly Dictionary<int, int> iconIndex = new Dictionary<int, int>();
        GUIStyle count, feedStyle, tag;

        struct Line { public string Kind, Text, Detail; public float At; }
        static readonly List<Line> feed = new List<Line>();
        // the bar's slots (points), bottom center: drawn here, tapped on a touch screen (TouchPad)
        // (the web's: round slots 48 across, 40 on a phone, 6 apart, in a glass pill 12 above the bottom; on a phone a
        // tenth slot, "…", opens the chest)
        static float SlotS => TouchPad.Active ? 40 : 48;
        static int Slots => TouchPad.Active ? 10 : 9;
        public static Rect SlotRect(int i)
        {
            float s = SlotS, gap = 6, bw = Slots * s + (Slots - 1) * gap, x0 = (Ui.W - bw) / 2;
            float y0 = Ui.H - s - 12 - 6 - (Ui.H - Ui.Safe.yMax);
            return new Rect(x0 + i * (s + gap), y0, s, s);
        }
        public static Rect MoreRect => SlotRect(9);
        public static void Feed(string kind, string text, string detail)
        {
            feed.Insert(0, new Line { Kind = kind, Text = text, Detail = detail ?? "", At = Time.time });
            if (kind == "mint" || kind == "craft" || kind == "nft") Sounds.Chime(); // something gained: the crystal chime
            if (kind == "mint" || kind == "craft") Haptics.Play(Haptics.Kind.Success);
            if (feed.Count > 6) feed.RemoveAt(feed.Count - 1);
        }

        void Awake()
        {
            var bytes = Resources.Load<TextAsset>("Art/icons").bytes;
            icons = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            icons.LoadImage(bytes);
            icons.filterMode = FilterMode.Point;
            var idx = MiniJson.Parse(Resources.Load<TextAsset>("Art/icons-index").text) as Dictionary<string, object>;
            iconSize = MiniJson.ToInt(idx["size"], 48);
            iconCols = MiniJson.ToInt(idx["cols"], 16);
            foreach (var kv in (Dictionary<string, object>)idx["index"]) iconIndex[int.Parse(kv.Key)] = MiniJson.ToInt(kv.Value);
            white = Texture2D.whiteTexture;
        }

        void DrawIcon(Rect r, int id)
        {
            if (!iconIndex.TryGetValue(id, out var i)) return;
            int rows = icons.height / iconSize;
            float u = (i % iconCols) * iconSize / (float)icons.width, v = 1 - ((i / iconCols) + 1) * iconSize / (float)icons.height;
            GUI.DrawTextureWithTexCoords(r, icons, new Rect(u, v, iconSize / (float)icons.width, iconSize / (float)icons.height));
        }

        static void Fill(Rect r, Color c) { var o = GUI.color; GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = o; }

        void OnGUI()
        {
            Ui.Begin();
            if (Ui.Cine) return; // a cinematic: the screen is the film's
            if (Act == null || Act.Player == null || Act.Player.Body == null) return;
            if (count == null)
            {
                count = new GUIStyle(GUI.skin.label) { fontSize = 11, alignment = TextAnchor.MiddleCenter, font = Ui.SansBold, padding = new RectOffset(0, 0, 0, 0) };
                feedStyle = new GUIStyle(GUI.skin.label) { fontSize = 13, richText = true, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(0, 0, 0, 0) };
                tag = new GUIStyle(GUI.skin.label) { fontSize = 16, alignment = TextAnchor.MiddleCenter };
            }
            float W = Ui.W, H = Ui.H;
            // the crosshair (#cross: two white bars, 18 across)
            Fill(new Rect(W / 2 - 9, H / 2 - 1, 18, 2), new Color(1, 1, 1, 0.9f));
            Fill(new Rect(W / 2 - 1, H / 2 - 9, 2, 18), new Color(1, 1, 1, 0.9f));
            // mining progress
            if (Act.MineProgress > 0)
            {
                Ui.Round(new Rect(W / 2 - 30, H / 2 + 18, 60, 6), new Color(0.1f, 0.08f, 0.25f, 0.7f), 3);
                Ui.Round(new Rect(W / 2 - 30, H / 2 + 18, Mathf.Max(6, 60 * Act.MineProgress), 6), Ui.Mint, 3);
            }
            // the bar: a glass pill (a light edge, a lighter top), round slots, the chosen one lifted, glowing
            var inv = Act.Inv;
            float s = SlotS;
            var first = SlotRect(0); var lastR = SlotRect(Slots - 1);
            var pill = new Rect(first.x - 14, first.y - 6, lastR.xMax - first.x + 28, s + 12);
            Ui.Round(pill, new Color(0.62f, 0.57f, 0.92f, 0.22f), pill.height / 2, new Color(1, 1, 1, 0.38f), 1);
            Ui.Round(new Rect(pill.x + 2, pill.y + 1, pill.width - 4, pill.height * 0.5f), new Color(1, 1, 1, 0.07f), pill.height * 0.25f);
            for (int i = 0; i < 9; i++)
            {
                var r = SlotRect(i);
                bool sel = i == inv.Sel;
                if (sel)
                {
                    // lifted 5 and 12% larger, a cyan glow and a white ring around it
                    var c = r.center; float h = s * 1.12f / 2;
                    r = new Rect(c.x - h, c.y - 5 - h, h * 2, h * 2);
                    for (int k = 3; k >= 1; k--) Ui.Round(new Rect(r.x - k * 4, r.y - k * 4, r.width + k * 8, r.height + k * 8), new Color(Ui.Cyan.r, Ui.Cyan.g, Ui.Cyan.b, 0.12f), r.width / 2 + k * 4);
                    Ui.Round(r, new Color(0.8f, 0.92f, 1f, 0.42f), r.width / 2, new Color(1, 1, 1, 0.9f), 2);
                }
                else Ui.Round(r, new Color(1, 1, 1, 0.12f), r.width / 2);
                var key = inv.Bar[i];
                if (key == null) continue;
                int id = inv.ItemId(key);
                float isz = r.width * 0.75f;
                DrawIcon(new Rect(r.center.x - isz / 2, r.center.y - isz / 2, isz, isz), id);
                if (!key.StartsWith("nft", StringComparison.Ordinal))
                {
                    // the count, in a dark pill at the slot's lower right
                    string n = inv.Count(id).ToString();
                    float bw = Mathf.Max(16, count.CalcSize(new GUIContent(n)).x + 10);
                    var br = new Rect(r.xMax + 3 - bw, r.yMax + 3 - 16, bw, 16);
                    Ui.Round(br, new Color(40 / 255f, 30 / 255f, 90 / 255f, 0.88f), 8);
                    GUI.Label(br, n, count);
                }
            }
            if (TouchPad.Active)
            {
                // "…": the whole chest
                var m = MoreRect;
                Ui.Round(m, Ui.Glass, m.width / 2, new Color(1, 1, 1, 0.28f), 2);
                var ms = new GUIStyle(tag) { fontSize = 16 }; ms.normal.textColor = Ui.Muted;
                GUI.Label(new Rect(m.x, m.y - 4, m.width, m.height), "…", ms);
            }
            // the item's name for a moment after you change slot ("Bare hand" when it's empty), then it fades (#selname)
            var held = inv.Held;
            string slotKey = inv.Sel + ":" + held;
            if (slotKey != selKey) { if (selKey != null) selAt = Time.time; selKey = slotKey; }
            float sa = Mathf.Clamp01(1 - (Time.time - selAt - 1.6f) / 0.5f);
            if (sa > 0)
            {
                var o = GUI.color;
                string nm = held != null ? Interaction.NameOf(inv.ItemId(held)) : "Bare hand";
                var nr = new Rect(0, pill.y - 34, W, 24);
                GUI.color = new Color(0, 0, 0, 0.6f * sa);
                GUI.Label(new Rect(nr.x + 2, nr.y + 2, nr.width, nr.height), nm, tag);
                GUI.color = new Color(1, 1, 1, sa);
                GUI.Label(nr, nm, tag);
                GUI.color = o;
            }
            // the feed (.ev): chips at the top right, each with its colored tag, the line, and a muted detail
            float fw = Mathf.Min(TouchPad.Active ? 260 : 300, W * (TouchPad.Active ? 0.4f : 0.55f));
            float fy = Ui.Safe.y + (TouchPad.Active ? 96 : 50), fx = Ui.Safe.xMax - 16;
            for (int i = 0; i < feed.Count; i++)
            {
                var l = feed[i];
                float age = Time.time - l.At;
                if (age > 7) continue;
                var c = GUI.color;
                float a = Mathf.Clamp01(7 - age) * Mathf.Clamp01(age / 0.3f);
                GUI.color = new Color(1, 1, 1, a);
                string k = l.Kind == "mint" ? "MINT" : l.Kind == "nft" ? "NFT" : l.Kind == "craft" ? "CRAFT" : "BURN";
                Color kc = l.Kind == "mint" ? Ui.Mint : l.Kind == "nft" ? Ui.Cyan : l.Kind == "craft" ? Ui.Gold : Ui.Burn;
                string line = l.Text + (string.IsNullOrEmpty(l.Detail) ? "" : $"  <color=#b8b0e6><size=11>{l.Detail}</size></color>");
                float kw = Ui.MonoSmall.CalcSize(new GUIContent(k)).x + 10;
                float tw = Mathf.Min(fw - kw - 26, feedStyle.CalcSize(new GUIContent(line)).x);
                float cw = kw + tw + 26;
                var cr = new Rect(fx - cw, fy, cw, 26);
                Ui.Chip(cr);
                var kr = new Rect(cr.x + 9, cr.y + 6, kw, 14);
                Ui.Round(kr, kc, 4);
                var ks = new GUIStyle(Ui.MonoSmall) { fontSize = 10, alignment = TextAnchor.MiddleCenter, font = Ui.MonoBold, wordWrap = false };
                ks.normal.textColor = Ui.Ink;
                GUI.Label(kr, k, ks);
                GUI.Label(new Rect(kr.xMax + 8, cr.y, tw, 26), line, feedStyle);
                GUI.color = c;
                fy += 32;
            }
        }
    }
}
