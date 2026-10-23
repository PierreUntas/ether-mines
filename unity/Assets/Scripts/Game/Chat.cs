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
        public readonly HashSet<string> Ignores = new HashSet<string>(LoadIgnores());
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
            if (Typing || Session == null || Ui.PanelOpen || Signs.Open) return;
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
            if (lines == null) lines = new List<Msg>();
            if (draft == null) draft = "";
            if (style == null || input == null)
            {
                style = new GUIStyle(GUI.skin.label) { fontSize = 15, richText = true, wordWrap = true };
                input = new GUIStyle(GUI.skin.textField) { fontSize = 16, padding = new RectOffset(8, 8, 6, 6) };
            }
            float W = 520, x = 16, y = Ui.H * 0.62f;
            // the last messages, newest at the bottom; they fade after a while unless the line is open
            int shown = 0;
            for (int i = lines.Count - 1; i >= 0 && shown < 8; i--)
            {
                var l = lines[i];
                float age = Time.time - l.At;
                if (!Typing && age > 15) break;
                var text = $"<b><color={(l.Color != null && l.Color.StartsWith("#") ? l.Color : "#c9c2f2")}>{Esc(l.Name)}</color></b>  {Esc(l.Text)}";
                float h = style.CalcHeight(new GUIContent(text), W - 16);
                y -= h + 6;
                var o = GUI.color;
                GUI.color = new Color(1, 1, 1, Typing ? 1 : Mathf.Clamp01(15 - age));
                var bg = GUI.color; GUI.color = new Color(0.11f, 0.086f, 0.23f, 0.55f * bg.a);
                GUI.DrawTexture(new Rect(x, y, W, h + 4), Texture2D.whiteTexture);
                GUI.color = bg;
                GUI.Label(new Rect(x + 8, y + 2, W - 16, h), text, style);
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
            if (kb != null) { GUI.Box(new Rect(x, Ui.H * 0.62f + 8, W, 32), draft, input); return; } // the system keyboard writes it
            GUI.SetNextControlName("chat");
            draft = GUI.TextField(new Rect(x, Ui.H * 0.62f + 8, W, 32), draft, 200, input);
            GUI.FocusControl("chat");
        }
    }
}
