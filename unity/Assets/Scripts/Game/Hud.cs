// Ether Mines · what's drawn over the world (index.html #hud, 07-interface.js ui/logEv): the crosshair,
// the 9-slot bar with the web version's own icons (exported to Art/icons), how far the mining has gone,
// and the feed of what you mint and burn. Plain immediate-mode GUI for now; a styled UI comes later.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Hud : MonoBehaviour
    {
        public Interaction Act;
        Texture2D icons, white;
        int iconSize = 48, iconCols = 16;
        readonly Dictionary<int, int> iconIndex = new Dictionary<int, int>();
        GUIStyle count, feedStyle, tag;

        struct Line { public string Kind, Text, Detail; public float At; }
        static readonly List<Line> feed = new List<Line>();
        // the bar's slots (points), bottom center: drawn here, tapped on a touch screen (TouchPad)
        public static Rect SlotRect(int i) { float s = 54, gap = 6, bw = 9 * s + 8 * gap, x0 = (Ui.W - bw) / 2, y0 = Ui.H - s - 16 - (TouchPad.Active ? Ui.H - Ui.Safe.yMax : 0); return new Rect(x0 + i * (s + gap), y0, s, s); }
        public static void Feed(string kind, string text, string detail)
        {
            feed.Insert(0, new Line { Kind = kind, Text = text, Detail = detail ?? "", At = Time.time });
            if (kind == "mint" || kind == "craft" || kind == "nft") Sounds.Chime(); // something gained: the crystal chime
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
            if (Act == null || Act.Player == null || Act.Player.Body == null) return;
            if (count == null)
            {
                count = new GUIStyle(GUI.skin.label) { fontSize = 13, alignment = TextAnchor.LowerRight, fontStyle = FontStyle.Bold };
                feedStyle = new GUIStyle(GUI.skin.label) { fontSize = 15, richText = true };
                tag = new GUIStyle(GUI.skin.label) { fontSize = 15, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            }
            float W = Ui.W, H = Ui.H;
            // crosshair
            Fill(new Rect(W / 2 - 9, H / 2 - 1, 18, 2), new Color(1, 1, 1, 0.85f));
            Fill(new Rect(W / 2 - 1, H / 2 - 9, 2, 18), new Color(1, 1, 1, 0.85f));
            // mining progress
            if (Act.MineProgress > 0)
            {
                Fill(new Rect(W / 2 - 30, H / 2 + 18, 60, 6), new Color(0.1f, 0.08f, 0.25f, 0.7f));
                Fill(new Rect(W / 2 - 30, H / 2 + 18, 60 * Act.MineProgress, 6), new Color(0.62f, 0.89f, 0.77f, 1));
            }
            // the bar
            var inv = Act.Inv;
            float s = 54, gap = 6, bw = 9 * s + 8 * gap, x0 = SlotRect(0).x, y0 = SlotRect(0).y;
            Fill(new Rect(x0 - 8, y0 - 8, bw + 16, s + 16), new Color(0.11f, 0.09f, 0.23f, 0.55f));
            for (int i = 0; i < 9; i++)
            {
                var r = SlotRect(i);
                Fill(r, i == inv.Sel ? new Color(1, 1, 1, 0.35f) : new Color(1, 1, 1, 0.08f));
                if (i == inv.Sel) { Fill(new Rect(r.x, r.y, s, 2), Color.white); Fill(new Rect(r.x, r.yMax - 2, s, 2), Color.white); Fill(new Rect(r.x, r.y, 2, s), Color.white); Fill(new Rect(r.xMax - 2, r.y, 2, s), Color.white); }
                var key = inv.Bar[i];
                if (key == null) continue;
                int id = inv.ItemId(key);
                DrawIcon(new Rect(r.x + 4, r.y + 4, s - 8, s - 8), id);
                if (!key.StartsWith("nft", StringComparison.Ordinal)) GUI.Label(new Rect(r.x, r.y, s - 4, s - 2), inv.Count(id).ToString(), count);
            }
            var held = inv.Held;
            if (held != null) GUI.Label(new Rect(0, y0 - 34, W, 24), Interaction.NameOf(inv.ItemId(held)), tag);
            // the feed
            float fy = H - s - 70;
            for (int i = 0; i < feed.Count; i++)
            {
                var l = feed[i];
                float age = Time.time - l.At;
                if (age > 7) continue;
                var c = GUI.color;
                GUI.color = new Color(1, 1, 1, Mathf.Clamp01(7 - age));
                string k = l.Kind == "mint" ? "<color=#9fe3c4><b>MINT</b></color>" : l.Kind == "nft" ? "<color=#7fe8ff><b>NFT</b></color>" : l.Kind == "craft" ? "<color=#ffd95e><b>CRAFT</b></color>" : "<color=#ff9ab8><b>BURN</b></color>";
                // on a touch screen, top left: the stick has the bottom left
                GUI.Label(TouchPad.Active ? new Rect(16 + Ui.Safe.x, Ui.Safe.y + 56 + i * 24, Mathf.Min(520, Ui.W * 0.4f), 24) : new Rect(16, fy - i * 24, 700, 24), $"{k} {l.Text} <color=#c9c2f2>{l.Detail}</color>", feedStyle);
                GUI.color = c;
            }
        }
    }
}
