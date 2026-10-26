// Ether Mines · the gestures (21-emotes.js): Wave, Point, Cheer, Clap, Sit for everyone; Dance and Bow with
// their cosmetic from the Workshop (rules.js EMOTES, COSMETICS 117 and 118). G (or the smiley button on a
// touch screen) opens the row; K a small menu of only the ones you have, the mouse freed to click one;
// 1 to 9 pick one while either is open; /wave, /dance... in the chat do the same.
// Your last gesture goes out with your position (em, numbered by eq so each is played once); every screen
// draws it on your figure (Avatars.EmotePose). One that lasts (Sit) ends when you move; the others on their own.
using System;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Emotes : MonoBehaviour
    {
        public PlayerController Player;
        public Interaction Act;
        public Combat Combat;
        public Hover Hover;
        public Chat Chat;
        public Panel Panel;
        public Func<int, bool> Owns = _ => false;

        public static Emotes I;        // the one in the game (the shop's "Do it")
        void Awake() => I = this;

        public static bool RowOpen;    // the row is up: the digits are for it (Interaction leaves the bar alone)
        public static bool MenuOpen;   // K's menu is up: the mouse and the keys are for it (Ui.Blocking)
        public static int DigitFrame = -1; // the frame a digit picked a gesture (not a slot of the bar)

        public struct Told { public string K; public int Q; }
        public Told Out;               // your last gesture, told to the others
        string myK; float myAt; double mx, mz;
        bool told;

        // the one you're making, for your own figure: (key, since when) or (null, 0)
        public (string k, float at) Mine => myK != null ? (myK, myAt) : (null, 0);

        public bool Owned(Rules.EmoteDef e) => e != null && (e.Cosmetic == 0 || Owns(e.Cosmetic));

        public void Play(string k)
        {
            var e = Rules.Emote(k);
            RowOpen = false;
            if (MenuOpen) Menu(false);
            if (e == null) return;
            if (!Owned(e)) { Hud.Feed("burn", e.N, "in the shop, Workshop aisle"); return; }
            if (Hover != null && (Hover.Riding > 0 || Hover.Boarded != null)) { Hud.Feed("burn", e.N, "not on board a hovercraft"); return; }
            var b = Player != null ? Player.Body : null;
            if (b == null) return;
            myK = k; myAt = Time.time; mx = b.X; mz = b.Z;
            Out = new Told { K = k, Q = (Out.Q + 1) & 0xffff };
            // through your own eyes you don't see yourself: say it once, the others do
            if (Player.View == 0 && !told && !e.Hidden)
            {
                told = true;
                Hud.Feed("nft", e.N, "everyone around sees it · " + (TouchPad.Active ? "the view button" : "V") + " to see yourself");
            }
        }

        void Update()
        {
            // yours: over as soon as you walk off, mine, guard or board (Sit as much as the rest)
            var b = Player != null ? Player.Body : null;
            if (myK != null)
            {
                var e = Rules.Emote(myK);
                bool moved = b == null || Math.Sqrt((b.X - mx) * (b.X - mx) + (b.Z - mz) * (b.Z - mz)) > 0.2;
                if (e == null || (e.Sec > 0 && Time.time - myAt > e.Sec) || moved || (Act != null && Act.Mining) ||
                    (Combat != null && Combat.Guarding) || (Hover != null && (Hover.Riding > 0 || Hover.Boarded != null)))
                    myK = null;
            }
            if (Chat.Typing || Ui.PanelOpen || Ui.Paused || Signs.Open || Ui.Cine) { RowOpen = false; if (MenuOpen) Menu(false, false); return; }
            if (TouchPad.Emote) RowOpen = !RowOpen;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k == null) return;
            if (k.escapeKey.wasPressedThisFrame) { RowOpen = false; if (MenuOpen) Menu(false); }
            if (k.gKey.wasPressedThisFrame) { if (MenuOpen) Menu(false); RowOpen = !RowOpen; }
            if (k.kKey.wasPressedThisFrame && !TouchPad.Active) { RowOpen = false; Menu(!MenuOpen); }
            if (!RowOpen && !MenuOpen) return;
            var digits = new[] { k.digit1Key, k.digit2Key, k.digit3Key, k.digit4Key, k.digit5Key, k.digit6Key, k.digit7Key, k.digit8Key, k.digit9Key };
            var row = MenuOpen ? Have() : Rules.RowEmotes();
            for (int i = 0; i < 9 && i < row.Count; i++)
                if (digits[i].wasPressedThisFrame) { DigitFrame = Time.frameCount; Play(row[i].K); break; }
#endif
        }

        // ---------- K: the menu of your gestures ----------
        System.Collections.Generic.List<Rules.EmoteDef> Have() => Rules.RowEmotes().FindAll(Owned);
        // opened, the mouse is freed to click one; closed, it's taken back for looking around
        void Menu(bool open, bool relock = true)
        {
            MenuOpen = open;
            if (TouchPad.Active) return;
            if (open) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
            else if (relock && !Ui.Blocking) { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
        }

        // the menu (#emoteMenu): in the middle of the screen, the gestures you have, numbered, three a row
        void DrawMenu()
        {
            var list = Have();
            int cols = 3, rows = Mathf.Max(1, (list.Count + cols - 1) / cols);
            float cw = 112, ch = 64, gap = 8, w = cols * cw + (cols - 1) * gap + 32, h = 70 + rows * (ch + gap) + 44;
            var box = new Rect((Ui.W - w) / 2, (Ui.H - h) / 2, w, h);
            Ui.Chip(box);
            var title = new GUIStyle(Ui.Title) { alignment = TextAnchor.MiddleCenter };
            GUI.Label(new Rect(box.x, box.y + 10, box.width, 26), "Emotes", title);
            GUI.Label(new Rect(box.x, box.y + 38, box.width, 20), "Yours: press its number or click it · K to close", new GUIStyle(Ui.Small) { alignment = TextAnchor.MiddleCenter });
            var name = new GUIStyle(Ui.Label) { alignment = TextAnchor.MiddleCenter, fontSize = 14, fontStyle = FontStyle.Bold };
            for (int i = 0; i < list.Count; i++)
            {
                var r = new Rect(box.x + 16 + (i % cols) * (cw + gap), box.y + 66 + (i / cols) * (ch + gap), cw, ch);
                Ui.Round(r, Ui.Glass2, 12, new Color(1, 1, 1, 0.12f), 1);
                GUI.Label(new Rect(r.x + 6, r.y + 4, 20, 16), (i + 1).ToString(), Ui.MonoCenter);
                GUI.Label(new Rect(r.x, r.y + 18, r.width, 28), list[i].N, name);
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) Play(list[i].K);
            }
            if (GUI.Button(new Rect(box.center.x - 80, box.yMax - 40, 160, 30), "More in the shop", Ui.Button)) { Menu(false, false); Panel?.ShowShop("workshop"); }
        }

        // the row (#emotes): a chip per gesture, its number, a lock on the ones still in the shop
        void OnGUI()
        {
            Ui.Begin();
            if (MenuOpen && !Ui.Cine && !Ui.PanelOpen) DrawMenu();
            if (!RowOpen || Ui.Cine || Ui.PanelOpen) return;
            bool touch = TouchPad.Active;
            var row = Rules.RowEmotes();
            int n = row.Count;
            float cw = touch ? 74 : 82, ch = touch ? 64 : 58, gap = 6, w = n * cw + (n - 1) * gap + 16;
            if (w > Ui.W - 24) { cw = (Ui.W - 24 - 16 - (n - 1) * gap) / n; w = Ui.W - 24; }
            float x = (Ui.W - w) / 2, y = Ui.H - Ui.Safe.y - (touch ? 210 : 158) - ch;
            var box = new Rect(x, y, w, ch + 16);
            Ui.Chip(box);
            if (touch && Event.current.type == EventType.Repaint) TouchPad.Reserved.Add(box);
            var name = new GUIStyle(Ui.Label) { alignment = TextAnchor.MiddleCenter, fontSize = 14, fontStyle = FontStyle.Bold };
            for (int i = 0; i < n; i++)
            {
                var e = row[i];
                bool own = Owned(e);
                var r = new Rect(x + 8 + i * (cw + gap), y + 8, cw, ch);
                Ui.Round(r, own ? Ui.Glass2 : new Color(1, 1, 1, 0.04f), 12, own ? new Color(1, 1, 1, 0.12f) : new Color(1, 1, 1, 0.06f), 1);
                var o = GUI.color;
                if (!own) GUI.color = new Color(1, 1, 1, 0.5f);
                GUI.Label(new Rect(r.x, r.y + 6, r.width, 26), e.N, name);
                GUI.Label(new Rect(r.x, r.y + ch - 26, r.width, 20), own ? (touch ? "" : (i + 1).ToString()) : "Shop", Ui.MonoCenter);
                GUI.color = o;
                if (GUI.Button(r, GUIContent.none, GUIStyle.none))
                {
                    if (own) Play(e.K);
                    else { RowOpen = false; Panel?.ShowShop("workshop"); }
                }
            }
        }
    }
}
