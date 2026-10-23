// Ether Mines · the title screen and the menu (index.html #title, 14-startup.js showLogin, showNews, pause,
// bootSay): your nickname and password (or "logged in as" when this device knows you), the world, the
// steps and the bar while the game starts, then the same screen as a menu (Esc, or Menu on a touch screen):
// Resume, What's new (a dot until its newest entry is read), your account (change your password, log out),
// the link to invite friends, the controls, the wiki and the terms. The world goes on behind it.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed partial class Game
    {
        // the start's steps (bootSay): what it's doing, how far along, since when
        bool loading, failed;
        float progress, stepAt = -1;
        void Step(string text, float pct) { status = text; progress = pct; stepAt = Time.time; }

        const string NewsKey = "ether-mines:nouveautes"; // the web's key: the newest entry read
        struct News { public string Date, Title; public List<string> Items; }
        List<News> news;
        bool openNews, openAccount, openKeys, logOutAsked;
        string changePass = "", accountMsg = "";
        bool copied;
        Vector2 scroll;
        float contentH = 600;
        bool wasBlocking;
        GUIStyle sTitle, sText, sSmall, sHead, sLink, sFold, sButton, sField;

        List<News> LoadNews()
        {
            var l = new List<News>();
            var ta = Resources.Load<TextAsset>("news");
            if (ta == null) return l;
            if (MiniJson.Parse(ta.text) is Dictionary<string, object> d && d.TryGetValue("news", out var n) && n is List<object> list)
                foreach (var o in list)
                    if (o is Dictionary<string, object> e)
                    {
                        var items = new List<string>();
                        if (e.TryGetValue("items", out var it) && it is List<object> il) foreach (var s in il) items.Add(s as string ?? "");
                        l.Add(new News { Date = e["date"] as string, Title = e["title"] as string, Items = items });
                    }
            return l;
        }
        bool NewsUnread => news.Count > 0 && string.CompareOrdinal(PlayerPrefs.GetString(NewsKey, ""), news[0].Date) < 0;
        static string NiceDate(string iso) => DateTime.TryParse(iso, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d) ? d.ToString("d MMM yyyy", System.Globalization.CultureInfo.GetCultureInfo("en-GB")) : iso;

        // ---------- the menu: Esc (when nothing else is open) or the touch screen's Menu button ----------
        void LateUpdate()
        {
            if (loading && player.Body != null)
            {
                // the land around you (about 2 chunks out) before you're let in, as the web's boot does
                int n = 0, of = 0, cx = (int)Math.Floor(player.Body.X / World.CH), cz = (int)Math.Floor(player.Body.Z / World.CH);
                for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { of++; if (world.Loaded((cx + i) * World.CH, (cz + j) * World.CH)) n++; }
                if (progress < 25) Step("Loading the land around you…", 25);
                progress = Mathf.Max(progress, 25 + 70f * n / of);
                if (player.Ready)
                {
                    loading = false;
                    Ui.Paused = false;
                    status = "";
                    stepAt = -1;
                    Lock(true);
                }
            }
            if (!started || loading) { wasBlocking = Ui.Blocking; return; }
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool esc = k != null && k.escapeKey.wasPressedThisFrame;
            var g = Gamepad.current;
            esc |= g != null && g.startButton.wasPressedThisFrame;
#else
            bool esc = Input.GetKeyDown(KeyCode.Escape);
#endif
            TouchPad.Poll();
            if (Ui.Paused) { if (esc) Resume(); }
            else if ((esc && !wasBlocking) || TouchPad.Menu) Pause();
            wasBlocking = Ui.Blocking;
        }

        void Pause()
        {
            Ui.Paused = true;
            openAccount = logOutAsked = copied = false;
            accountMsg = "";
            Lock(false);
            if (session != null && player.Body != null) SaveNow(); // as the web's pause: your game goes back now
        }

        void Resume()
        {
            Ui.Paused = false;
            Lock(true);
        }

        static void Lock(bool on)
        {
            if (TouchPad.Active) return;
            Cursor.lockState = on ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !on;
        }

        // a computer: leaving the window (another app in front) opens the menu, as losing the web's pointer lock does
        void OnApplicationFocus(bool focus)
        {
            if (focus) return;
            if (started && session != null && player.Body != null && Application.isMobilePlatform) SaveNow();
            if (started && !loading && !Ui.Paused && !TouchPad.Active && !Application.isEditor) Pause();
        }

        async void LogOut()
        {
            if (busy || session == null) return;
            busy = true;
            try
            {
                await session.LogOut();
                known = false;
                nick = "";
                password = "";
                openAccount = false;
                status = "Logged out of this device. Your game stays safe with your nickname and password.";
            }
            catch (Exception e) { accountMsg = "Failed: " + e.Message; }
            finally { busy = false; logOutAsked = false; }
        }

        async void ChangeMyPassword()
        {
            if (busy || session == null) return;
            busy = true;
            try
            {
                var err = await session.SetPassword(changePass);
                accountMsg = err ?? "Password changed.";
                if (err == null) changePass = "";
            }
            catch (Exception e) { accountMsg = "Failed: " + e.Message; }
            finally { busy = false; }
        }

        // ---------- drawing ----------
        // the web's title screen (style.css .title): a big two-line title with its violet shadow, the text muted and
        // centered, the fields with their label above, the violet "Enter the world" with its edge under it
        GUIStyle sPlay, sLabel;
        void Styles()
        {
            if (sTitle != null) return;
            sTitle = new GUIStyle(GUI.skin.label) { fontSize = 64, alignment = TextAnchor.MiddleCenter, font = Ui.SansBold, wordWrap = false };
            sTitle.normal.textColor = Ui.Text;
            sText = new GUIStyle(GUI.skin.label) { fontSize = 15, wordWrap = true, richText = true };
            sText.normal.textColor = Ui.Paper;
            sSmall = new GUIStyle(sText) { fontSize = 13 };
            sSmall.normal.textColor = Ui.Lavender;
            sHead = new GUIStyle(sText) { fontSize = 15, font = Ui.SansBold };
            sHead.normal.textColor = Ui.Gold;
            sLink = new GUIStyle(sSmall) { font = Ui.Mono, fontSize = 12, alignment = TextAnchor.MiddleCenter };
            sLink.normal.textColor = sLink.hover.textColor = Ui.Cyan;
            sFold = new GUIStyle(GUI.skin.label) { fontSize = 12, font = Ui.Mono, richText = true, alignment = TextAnchor.MiddleCenter };
            sFold.normal.textColor = sFold.hover.textColor = Ui.Cyan;
            sButton = new GUIStyle(GUI.skin.label) { fontSize = 22, alignment = TextAnchor.MiddleCenter, font = Ui.SansMed };
            sButton.normal.textColor = sButton.hover.textColor = Color.white;
            sField = new GUIStyle(GUI.skin.textField) { fontSize = 18, padding = new RectOffset(12, 12, 9, 9) };
            sLabel = new GUIStyle(GUI.skin.label) { fontSize = 15 };
            sLabel.normal.textColor = Ui.Paper;
        }

        // the violet button with its darker edge under it (#play)
        bool Play(Rect r, string label, bool big = true)
        {
            var dark = new Color(0x4f / 255f, 0x40 / 255f, 0xbf / 255f);
            Ui.Round(new Rect(r.x, r.y + 5, r.width, r.height), dark, 12);
            var face = r;
            Ui.Round(face, Ui.Violet, 12);
            var st = big ? sButton : new GUIStyle(sButton) { fontSize = 16 };
            return GUI.Button(face, label, st);
        }

        float Text(float x, float y, float w, string t, GUIStyle st)
        {
            float h = st.CalcHeight(new GUIContent(t), w);
            GUI.Label(new Rect(x, y, w, h), t, st);
            return h;
        }

        bool Link(float x, float y, float w, string t) => GUI.Button(new Rect(x, y, w, 20), t, sLink);

        // a folding part (.morekeys summary): a small rounded cyan chip, centered
        bool FoldChip(float x, float y, float w, string t, ref bool open)
        {
            float tw = sFold.CalcSize(new GUIContent(t)).x + 22;
            var r = new Rect(x + (w - tw) / 2, y, tw, 26);
            Ui.Round(r, Color.clear, 13, Ui.Line, 1);
            if (GUI.Button(r, t, sFold)) open = !open;
            return open;
        }

        void OnGUI()
        {
            if (started && !loading && !Ui.Paused) return; // in the game, the HUD is Guide's and Hud's
            Ui.Begin();
            Styles();
            if (news == null) news = LoadNews();
            GUI.depth = -10; // over the HUD
            // the backdrop (.title): the world dimmed behind
            Ui.Fill(new Rect(0, 0, Ui.W, Ui.H), new Color(20 / 255f, 16 / 255f, 44 / 255f, started ? 0.7f : 0.6f));
            var sa = Ui.Safe;
            float w = Mathf.Min(480, sa.width - 32), x = sa.x + (sa.width - w) / 2;
            float top = sa.y + 12, avail = sa.height - 24, h = Mathf.Min(contentH, avail), y0 = top + Mathf.Max(0, (avail - h) / 2);
            var view = new Rect(x - 10, y0, w + 20, h);
            bool scrolls = contentH > avail;
            scroll = Ui.Scroll(view, scroll, new Rect(0, 0, w - (scrolls ? 16 : 0), contentH - 8), false, false, GUIStyle.none, scrolls ? GUI.skin.verticalScrollbar : GUIStyle.none);
            float iw = w - (scrolls ? 16 : 0), ix = 10, y = 0;
            y = Body(ix, y, iw);
            GUI.EndScrollView();
            if (Event.current.type == EventType.Repaint) contentH = y + 16;
        }

        float Body(float x, float y, float w)
        {
            bool paused = started && !loading;
            var ev = Event.current;
            if (!started && !busy && ev.type == EventType.KeyDown && (ev.keyCode == KeyCode.Return || ev.keyCode == KeyCode.KeypadEnter)) { ev.Use(); Enter(true); } // Enter in a field: in
            // the title, on two lines, its violet shadow under it and a cyan glow around (on one line, smaller, on
            // a screen too short for it: a phone held sideways, where the button must stay within reach)
            bool shortScreen = Ui.H < 560;
            int ts = shortScreen ? 42 : Mathf.RoundToInt(Mathf.Clamp(Ui.W * 0.09f, 44, 72));
            sTitle.fontSize = ts;
            float lh = ts * 0.95f;
            int lines = shortScreen ? 1 : 2;
            var o = GUI.color;
            for (int line = 0; line < lines; line++)
            {
                string t = shortScreen ? "Ether Mines" : line == 0 ? "Ether" : "Mines";
                var r = new Rect(x, y + line * lh, w, lh + 8);
                GUI.color = new Color(Ui.Cyan.r, Ui.Cyan.g, Ui.Cyan.b, 0.18f);
                for (int k = 0; k < 4; k++) GUI.Label(new Rect(r.x + (k % 2 == 0 ? -2 : 2), r.y + (k < 2 ? -2 : 2), r.width, r.height), t, sTitle);
                GUI.color = new Color(0x4f / 255f, 0x40 / 255f, 0xbf / 255f);
                GUI.Label(new Rect(r.x, r.y + 4, r.width, r.height), t, sTitle);
                GUI.color = o;
                GUI.Label(r, t, sTitle);
            }
            y += lh * lines + (shortScreen ? 10 : 18);
            var center = new GUIStyle(sText) { alignment = TextAnchor.UpperCenter, fontSize = shortScreen ? 14 : 16 }; center.normal.textColor = Ui.Lavender;
            if (!started) { y += Text(x, y, w, "A block world in Ethereum's colors, built with friends. Every block remembers who placed it: the world keeps a ledger of everything you build.", center) + 14; }
            else if (paused) { y += Text(x, y, w, (session != null ? $"{session.Login} · " : "") + $"world \"{worldName}\"" + (session == null || session.Net.Offline ? " · offline, saved on this device" : ""), center) + 14; }

            if (!started)
            {
                // your nickname (read-only when this device knows you: Account → Log out to change), password, world
                // (.fields: each label above its field; the nickname and the world side by side, the password under)
                bool asKnown = known && session != null && session.Login != null;
                float half = (w - 10) / 2;
                GUI.Label(new Rect(x, y, half, 20), "Your nickname", sLabel);
                GUI.Label(new Rect(x + half + 10, y, half, 20), "World", sLabel);
                y += 22;
                if (asKnown) GUI.Label(new Rect(x, y, half, 42), session.Login, sField);
                else nick = GUI.TextField(new Rect(x, y, half, 42), nick, 16, sField);
                worldName = GUI.TextField(new Rect(x + half + 10, y, half, 42), worldName, 32, sField);
                y += 52;
                if (!asKnown)
                {
                    GUI.Label(new Rect(x, y, w, 20), "Password", sLabel);
                    y += 22;
                    password = GUI.PasswordField(new Rect(x, y, w, 42), password, '•', 72, sField);
                    y += 50;
                    if (!shortScreen) y += Text(x, y, w, "New here? Pick a nickname and a password: they're your account. Coming back on another device? The same nickname and password bring your game.", new GUIStyle(sSmall) { alignment = TextAnchor.UpperCenter }) + 10;
                }
                if (session != null && session.MustChange)
                {
                    y += Text(x, y, w, "This password was given to you: choose your own to keep your game safe.", sText) + 4;
                    newPassword = GUI.PasswordField(new Rect(x, y, w - 170, 28), newPassword, '•', 72, sField);
                    if (GUI.Button(new Rect(x + w - 160, y, 160, 28), "Save my password")) ChangePassword();
                    y += 38;
                }
            }

            // where the start is at, and the bar
            string say = status;
            if (stepAt >= 0 && (busy || loading) && Time.time - stepAt > 7)
                say += session != null ? " — still going: the first connection of the day can take a few seconds" : " — still going, nothing is stuck";
            if (!string.IsNullOrEmpty(say)) y += Text(x, y, w, say, sText) + 6;
            if (busy || loading)
            {
                Ui.Round(new Rect(x, y, w, 6), new Color(1, 1, 1, 0.12f), 3);
                Ui.Round(new Rect(x, y, Mathf.Max(6, w * Mathf.Clamp01(progress / 100f)), 6), Ui.Mint, 3);
                y += 14;
            }

            // the big button
            if (!loading)
            {
                string label = paused ? "Resume" : busy ? "…" : failed ? "Retry" : "Enter the world";
                float pw = Mathf.Min(w, sButton.CalcSize(new GUIContent(label)).x + 52);
                if (Play(new Rect(x + (w - pw) / 2, y, pw, 50), label)) { if (paused) Resume(); else Enter(true); }
                y += 64;
                if (!started)
                {
                    if (GUI.Button(new Rect(x, y, w, 32), "Play offline (saved on this device, apart from the online worlds)")) Enter(false);
                    y += 40;
                    var terms = new GUIStyle(sSmall) { font = Ui.Mono, fontSize = 11, alignment = TextAnchor.UpperCenter };
                    y += Text(x, y, w, "By entering, you accept the terms of use: be kind, no cheating, and in-game items have no real-world value.", terms);
                    if (Link(x, y, w, "Read the terms of use")) Application.OpenURL(Config.Site + "/legal.html#conditions");
                    y += 26;
                }
            }

            // the controls
            var keysSt = new GUIStyle(sSmall) { alignment = TextAnchor.UpperCenter };
            y += Text(x, y, w, TouchPad.Active
                ? "Left thumb: walk · drag: look · short tap: place, open, pet · long press: mine, strike · the buttons on the right: jump, run, crouch, guard with a blade (hold, just before a blow to parry) · on top: chest, chat, view, menu · tap the objective to see them all"
                : "WASD (ZQSD) · Shift: walk · run · Space: jump · left click: hold to mine · right click: place the selected block; with a blade, hold to guard, just before a blow to parry · 1–9: the bar · E: chest and crafting · Enter: chat", keysSt) + 10;
            if (FoldChip(x, y, w, "All controls", ref openKeys))
            {
                y += 34;
                string keys = TouchPad.Active
                    ? "On top: chest, chat, view, menu · the objective (tap it): all the objectives\nChat: /join · /sanctuary — teleport to a friend · back to the sanctuary\nChat: /claim · /unclaim — protect the chunk you're in · release it\nChat: /invite · /kick · /claims — manage who can build on your plots\nChat: /trade — open the Trade tab\nChat: /ignore · /listen · /report — hide, unhide, or report a player"
                    : "1–9 · wheel — choose from the bar\nE · O · Enter — chest and crafting · objectives · chat\nV · F — view from behind or in front · full screen\nQ — dodge, with the Front-Runner Boots · M — sound\nChat: /join · /sanctuary — teleport to an online friend · back to the sanctuary\nChat: /claim · /unclaim — protect the chunk you're in (500 Gwei, twice as much for each next one, 9 at most) · release it\nChat: /invite · /kick · /claims — allow or disallow a player on your plots · list them\nChat: /trade nickname — open the Trade tab with that player\nChat: /ignore · /listen · /report — hide, unhide, or report a player";
                y += Text(x, y, w, keys, sSmall) + 6;
            }
            else y += 34;

            // What's new, a dot until its newest entry is read
            if (news.Count > 0)
            {
                bool was = openNews;
                FoldChip(x, y, w, "What's new" + (NewsUnread ? "  <color=#9fe3c4>●</color>" : ""), ref openNews);
                if (openNews && !was) { PlayerPrefs.SetString(NewsKey, news[0].Date); PlayerPrefs.Save(); }
                y += 34;
                if (openNews)
                    foreach (var n in news)
                    {
                        y += Text(x, y, w, $"{n.Title}  <size=11><color=#c9c2f2>{NiceDate(n.Date)}</color></size>", sHead) + 2;
                        foreach (var it in n.Items) y += Text(x + 12, y, w - 12, "• " + it, sSmall) + 2;
                        y += 8;
                    }
            }

            // your account: who this device knows, your password, log out (from the title screen only: in the
            // game it would have to start again)
            if (known && session != null && session.Login != null && !session.Net.Offline)
            {
                FoldChip(x, y, w, $"Account · {session.Login}", ref openAccount);
                y += 34;
                if (openAccount)
                {
                    y += Text(x, y, w, "On another device, enter with the same nickname and password to find your game there.", sSmall) + 6;
                    changePass = GUI.PasswordField(new Rect(x, y, w - 190, 28), changePass, '•', 72, sField);
                    if (GUI.Button(new Rect(x + w - 180, y, 180, 28), "Change my password")) ChangeMyPassword();
                    y += 36;
                    if (!started)
                    {
                        if (GUI.Button(new Rect(x, y, w, 28), logOutAsked ? "Log out of this device? Click again to confirm" : "Not you? Log out")) { if (logOutAsked) LogOut(); else logOutAsked = true; }
                        y += 34;
                    }
                    y += Text(x, y, w, "Forgot your password? Write to contact@ethermines.org with your nickname and what you own in the game.", sSmall);
                    if (Link(x, y, w, "Write to contact@ethermines.org")) Application.OpenURL("mailto:contact@ethermines.org");
                    y += 24;
                    if (accountMsg.Length > 0) y += Text(x, y, w, accountMsg, sText) + 4;
                }
            }

            // once in an online world: the link your friends open in their browser to join you there
            if (paused && session != null && !session.Net.Offline)
            {
                string url = Config.Site + "/?monde=" + Uri.EscapeDataString(worldName);
                y += Text(x, y, w, "Invite your friends: " + url, sSmall) + 4;
                if (GUI.Button(new Rect(x, y, 180, 28), copied ? "Link copied" : "Copy the link")) { GUIUtility.systemCopyBuffer = url; copied = true; }
                y += 38;
            }

            if (Link(x, y, w, "📖 Wiki: how to play, crafting, mobs, validators…")) Application.OpenURL(Config.Site + "/wiki.html");
            y += 22;
            if (Link(x, y, w, "Terms, legal notice & privacy · Conditions et mentions légales")) Application.OpenURL(Config.Site + "/legal.html");
            y += 26;
            if (paused && !Application.isMobilePlatform && !Application.isEditor)
            {
                if (GUI.Button(new Rect(x, y, w, 28), "Quit the game")) { if (session != null) SaveNow(); Application.Quit(); }
                y += 34;
            }
            return y;
        }
    }
}
