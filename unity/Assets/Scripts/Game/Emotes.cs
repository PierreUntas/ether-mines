// Ether Mines · the gestures (21-emotes.js): Wave, Point, Cheer, Clap, Sit for everyone; Dance and Bow with
// their cosmetic from the Workshop (rules.js EMOTES, COSMETICS 117 and 118). G (or the smiley button on a
// touch screen) opens the row; 1 to 7 pick one while it's open; /wave, /dance... in the chat do the same.
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
            if (e == null) return;
            if (!Owned(e)) { Hud.Feed("burn", e.N, "in the shop, Workshop aisle"); return; }
            if (Hover != null && (Hover.Riding > 0 || Hover.Boarded != null)) { Hud.Feed("burn", e.N, "not on board a hovercraft"); return; }
            var b = Player != null ? Player.Body : null;
            if (b == null) return;
            myK = k; myAt = Time.time; mx = b.X; mz = b.Z;
            Out = new Told { K = k, Q = (Out.Q + 1) & 0xffff };
            // through your own eyes you don't see yourself: say it once, the others do
            if (Player.View == 0 && !told)
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
                if (e == null || (e.Sec > 0 && Time.time - myAt > e.Sec) || moved || (Act != null && Act.Swing > 0.05f) ||
                    (Combat != null && Combat.Guarding) || (Hover != null && (Hover.Riding > 0 || Hover.Boarded != null)))
                    myK = null;
            }
            if (Chat.Typing || Ui.PanelOpen || Ui.Paused || Signs.Open || Ui.Cine) { RowOpen = false; return; }
            if (TouchPad.Emote) RowOpen = !RowOpen;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k == null) return;
            if (k.escapeKey.wasPressedThisFrame) RowOpen = false;
            if (k.gKey.wasPressedThisFrame) RowOpen = !RowOpen;
            if (!RowOpen) return;
            var digits = new[] { k.digit1Key, k.digit2Key, k.digit3Key, k.digit4Key, k.digit5Key, k.digit6Key, k.digit7Key, k.digit8Key, k.digit9Key };
            for (int i = 0; i < 9 && i < Rules.Emotes.Count; i++)
                if (digits[i].wasPressedThisFrame) { DigitFrame = Time.frameCount; Play(Rules.Emotes[i].K); break; }
#endif
        }

        // the row (#emotes): a chip per gesture, its number, a lock on the ones still in the shop
        void OnGUI()
        {
            Ui.Begin();
            if (!RowOpen || Ui.Cine || Ui.PanelOpen) return;
            bool touch = TouchPad.Active;
            int n = Rules.Emotes.Count;
            float cw = touch ? 74 : 82, ch = touch ? 64 : 58, gap = 6, w = n * cw + (n - 1) * gap + 16;
            if (w > Ui.W - 24) { cw = (Ui.W - 24 - 16 - (n - 1) * gap) / n; w = Ui.W - 24; }
            float x = (Ui.W - w) / 2, y = Ui.H - Ui.Safe.y - (touch ? 210 : 158) - ch;
            var box = new Rect(x, y, w, ch + 16);
            Ui.Chip(box);
            if (touch && Event.current.type == EventType.Repaint) TouchPad.Reserved.Add(box);
            var name = new GUIStyle(Ui.Label) { alignment = TextAnchor.MiddleCenter, fontSize = 14, fontStyle = FontStyle.Bold };
            for (int i = 0; i < n; i++)
            {
                var e = Rules.Emotes[i];
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
