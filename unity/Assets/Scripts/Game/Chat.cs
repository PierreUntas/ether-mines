// Ether Mines · the chat (05-player.js openChat, 07-interface.js addChat): Enter opens the line, Enter
// sends, Esc closes. A message goes through act_chat (003_moderation.sql: the server checks, masks and
// signs it with your nickname and color); everyone's arrive from the database's feed (Realtime).
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Chat : MonoBehaviour
    {
        public static bool Typing; // the line is open: the keys write instead of moving you
        public Session Session;
        public string MyName = "", MyColor = "#8a7bef";
        public Action<string> Command;      // a line starting with "/" (Multiplayer: /claim, /join...)
        public Func<bool> EnterTaken;       // Enter is for something else right now (confirming a plot)
        // ignored players (by nickname, kept on this device): their messages no longer show up
        // (read in Awake: Unity refuses PlayerPrefs in a field initializer, and the whole component then breaks)
        public readonly HashSet<string> Ignores = new HashSet<string>();
        void Awake() { foreach (var n in LoadIgnores()) Ignores.Add(n); }
        static IEnumerable<string> LoadIgnores()
        {
            var l = MiniJson.Parse(PlayerPrefs.GetString("ether-mines:ignores", "[]")) as List<object>;
            return l == null ? new string[0] : l.Select(o => (o as string ?? "").ToLowerInvariant());
        }
        public void SaveIgnores() { PlayerPrefs.SetString("ether-mines:ignores", MiniJson.Write(Ignores.Cast<object>().ToList())); PlayerPrefs.Save(); }

        struct Msg { public string Name, Color, Text; public float At; }
        // not readonly: a script reload during Play leaves unserialized fields null, so they're rebuilt when needed
        List<Msg> lines = new List<Msg>();
        string draft = "";
        int openedFrame;
        bool sending;
        GUIStyle style, input;

        public void Add(string name, string color, string text)
        {
            if (name != null && Ignores.Contains(name.ToLowerInvariant())) return;
            if (lines == null) lines = new List<Msg>();
            lines.Add(new Msg { Name = name, Color = color, Text = text, At = Time.time });
            if (lines.Count > 30) lines.RemoveAt(0);
        }

        TouchScreenKeyboard kb; // a phone: the system keyboard writes the line

        void Update()
        {
            if (Typing && kb != null)
            {
                draft = kb.text;
                if (kb.status == TouchScreenKeyboard.Status.Done) { kb = null; Typing = false; Send(draft); }
                else if (kb.status != TouchScreenKeyboard.Status.Visible) { kb = null; Typing = false; }
                return;
            }
            if (Typing || Session == null || Ui.PanelOpen || Ui.Paused || Signs.Open) return;
            TouchPad.Poll();
            if (TouchPad.Chat)
            {
                Typing = true; draft = ""; openedFrame = Time.frameCount;
                kb = TouchScreenKeyboard.Open("", TouchScreenKeyboardType.Default, false, false, false, false, "Message, or / for commands", 140);
                return;
            }
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool open = k != null && (k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame);
#else
            bool open = Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter);
#endif
            if (open && EnterTaken != null && EnterTaken()) return;
            if (open) { Typing = true; draft = ""; openedFrame = Time.frameCount; }
        }

        async void Send(string text)
        {
            text = text.Trim();
            if (text.Length == 0 || sending) return;
            if (text.StartsWith("/")) { Command?.Invoke(text); return; }
            sending = true;
            try
            {
                var r = await Session.Net.Rpc("act_chat", MiniJson.Write(new Dictionary<string, object> { ["w"] = Session.World, ["msg"] = text })) as Dictionary<string, object>;
                if (r != null && MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) Add(MyName, MyColor, r.TryGetValue("text", out var t) ? t as string : text);
                else
                {
                    var err = r != null && r.TryGetValue("err", out var e) ? e as string : "not sent";
                    if (err == "muted" && r.TryGetValue("minutes", out var mn)) err = "you're muted for " + MiniJson.ToInt(mn) + " min";
                    Hud.Feed("burn", "Message not sent", err);
                }
            }
            catch (Exception e) { Hud.Feed("burn", "Message not sent", e.Message); }
            finally { sending = false; }
        }

        static string Esc(string s) => (s ?? "").Replace("<", "‹").Replace(">", "›");

        void OnGUI()
        {
            Ui.Begin();
            if (Ui.Cine) return; // a cinematic: the screen is the film's
            if (lines == null) lines = new List<Msg>();
            if (draft == null) draft = "";
            if (style == null || input == null)
            {
                style = new GUIStyle(GUI.skin.label) { fontSize = 15, richText = true, wordWrap = true };
                // drawn over the rounded field (OnGUI): no box of its own
                input = new GUIStyle(GUI.skin.textField) { fontSize = 16, padding = new RectOffset(12, 12, 9, 9) };
                input.normal.background = input.focused.background = input.hover.background = input.active.background = null;
                input.normal.textColor = input.focused.textColor = Ui.Text;
            }
            // the web's #chat (style.css): bottom left, 420 wide (300 on a touch screen, higher up, clear of the
            // stick), each message a rounded bubble as wide as its text, the line to type in a cyan-edged glass field
            bool touch = TouchPad.Active;
            float W = touch ? 300 : 420, x = 16, fieldH = 38;
            float bottom = Ui.H - (touch ? 240 : 84), fieldY = bottom - fieldH;
            float y = Typing ? fieldY - 6 : bottom;
            // the last messages, newest at the bottom; they fade after a while unless the line is open
            int shown = 0;
            for (int i = lines.Count - 1; i >= 0 && shown < 8; i--)
            {
                var l = lines[i];
                float age = Time.time - l.At;
                if (!Typing && age > 15) break;
                var text = $"<b><color={(l.Color != null && l.Color.StartsWith("#") ? l.Color : "#c9c2f2")}>{Esc(l.Name)}</color></b>  {Esc(l.Text)}";
                var gc = new GUIContent(text);
                float tw = Mathf.Min(W - 18, style.CalcSize(gc).x), h = style.CalcHeight(gc, tw);
                y -= h + 6 + 3;
                var o = GUI.color;
                float a = Typing ? 1 : Mathf.Clamp01((15 - age) / 0.8f);
                Ui.Round(new Rect(x, y, tw + 18, h + 6), new Color(28 / 255f, 22 / 255f, 58 / 255f, 0.55f * a), 8);
                GUI.color = new Color(1, 1, 1, a);
                GUI.Label(new Rect(x + 9, y + 3, tw, h), text, style);
                GUI.color = o;
                shown++;
            }
            if (!Typing) return;
            var ev = Event.current;
            if (ev.type == EventType.KeyDown && Time.frameCount != openedFrame)
            {
                if (ev.keyCode == KeyCode.Return || ev.keyCode == KeyCode.KeypadEnter) { Send(draft); Typing = false; ev.Use(); return; }
                if (ev.keyCode == KeyCode.Escape) { Typing = false; ev.Use(); return; }
            }
            var field = new Rect(x, fieldY, W, fieldH);
            Ui.Round(field, Ui.Glass2, 10, Ui.Cyan, 1);
            if (kb != null) { GUI.Box(field, draft, input); return; } // the system keyboard writes it
            GUI.SetNextControlName("chat");
            draft = GUI.TextField(field, draft, 200, input);
            GUI.FocusControl("chat");
        }
    }
}
