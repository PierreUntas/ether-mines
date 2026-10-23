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
        void Styles()
        {
            if (sTitle != null) return;
            sTitle = new GUIStyle(GUI.skin.label) { fontSize = 44, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            sTitle.normal.textColor = Ui.Paper;
            sText = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true, richText = true };
            sText.normal.textColor = Ui.Paper;
            sSmall = new GUIStyle(sText) { fontSize = 12 };
            sSmall.normal.textColor = Ui.Muted;
            sHead = new GUIStyle(sText) { fontSize = 15, fontStyle = FontStyle.Bold };
            sHead.normal.textColor = Ui.Gold;
            sLink = new GUIStyle(sSmall);
            sLink.normal.textColor = sLink.hover.textColor = Ui.Cyan;
            sFold = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold, richText = true };
            sFold.normal.textColor = sFold.hover.textColor = Ui.Paper;
            sButton = new GUIStyle(GUI.skin.button) { fontSize = 16, fontStyle = FontStyle.Bold };
            sField = new GUIStyle(GUI.skin.textField) { fontSize = 15, padding = new RectOffset(8, 8, 5, 5) };
        }

        float Text(float x, float y, float w, string t, GUIStyle st)
        {
            float h = st.CalcHeight(new GUIContent(t), w);
            GUI.Label(new Rect(x, y, w, h), t, st);
            return h;
        }

        bool Link(float x, float y, float w, string t) => GUI.Button(new Rect(x, y, w, 20), t, sLink);

        bool Fold(float x, float y, float w, string t, ref bool open)
        {
            Ui.Fill(new Rect(x, y + 27, w, 1), Ui.Line);
            if (GUI.Button(new Rect(x, y, w, 26), (open ? "▾  " : "▸  ") + t, sFold)) open = !open;
            return open;
        }

        void OnGUI()
        {
            if (started && !loading && !Ui.Paused) return; // in the game, the HUD is Guide's and Hud's
            Ui.Begin();
            Styles();
            if (news == null) news = LoadNews();
            GUI.depth = -10; // over the HUD
            if (started) Ui.Fill(new Rect(0, 0, Ui.W, Ui.H), new Color(0.06f, 0.05f, 0.14f, 0.55f));
            var sa = Ui.Safe;
            float w = Mathf.Min(500, sa.width - 24), x = sa.x + (sa.width - w) / 2;
            float top = sa.y + 12, avail = sa.height - 24, h = Mathf.Min(contentH, avail), y0 = top + Mathf.Max(0, (avail - h) / 2);
            Ui.Chip(new Rect(x, y0, w, h));
            var view = new Rect(x, y0 + 4, w, h - 8);
            bool scrolls = contentH > avail;
            scroll = GUI.BeginScrollView(view, scroll, new Rect(0, 0, w - (scrolls ? 16 : 0), contentH - 8), false, false, GUIStyle.none, scrolls ? GUI.skin.verticalScrollbar : GUIStyle.none);
            float iw = w - 40 - (scrolls ? 16 : 0), ix = 20, y = 8;
            y = Body(ix, y, iw);
            GUI.EndScrollView();
            if (Event.current.type == EventType.Repaint) contentH = y + 16;
        }

        float Body(float x, float y, float w)
        {
            bool paused = started && !loading;
            var ev = Event.current;
            if (!started && !busy && ev.type == EventType.KeyDown && (ev.keyCode == KeyCode.Return || ev.keyCode == KeyCode.KeypadEnter)) { ev.Use(); Enter(true); } // Enter in a field: in
            GUI.Label(new Rect(x, y, w, 56), "Ether Mines", sTitle);
            y += 58;
            if (!started) { y += Text(x, y, w, "A block world in Ethereum's colors, built with friends. Every block remembers who placed it: the world keeps a ledger of everything you build.", sSmall) + 12; }
            else if (paused) { y += Text(x, y, w, (session != null ? $"{session.Login} · " : "Offline · ") + $"world \"{worldName}\"", new GUIStyle(sSmall) { alignment = TextAnchor.MiddleCenter }) + 12; }

            if (!started)
            {
                // your nickname (read-only when this device knows you: Account → Log out to change), password, world
                bool asKnown = known && session != null && session.Login != null;
                float lw = 110, fw = w - lw;
                GUI.Label(new Rect(x, y + 3, lw, 24), "Nickname", sText);
                if (asKnown) GUI.Label(new Rect(x + lw, y, fw, 28), session.Login, sField);
                else nick = GUI.TextField(new Rect(x + lw, y, fw, 28), nick, 16, sField);
                y += 36;
                if (!asKnown)
                {
                    GUI.Label(new Rect(x, y + 3, lw, 24), "Password", sText);
                    password = GUI.PasswordField(new Rect(x + lw, y, fw, 28), password, '•', 72, sField);
                    y += 34;
                    y += Text(x, y, w, "New here? Pick a nickname and a password: they're your account. Coming back on another device? The same nickname and password bring your game.", sSmall) + 8;
                }
                GUI.Label(new Rect(x, y + 3, lw, 24), "World", sText);
                worldName = GUI.TextField(new Rect(x + lw, y, fw, 28), worldName, 32, sField);
                y += 40;
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
                Ui.Fill(new Rect(x, y, w, 6), new Color(1, 1, 1, 0.12f));
                Ui.Fill(new Rect(x, y, w * Mathf.Clamp01(progress / 100f), 6), Ui.Mint);
                y += 14;
            }

            // the big button
            if (!loading)
            {
                string label = paused ? "Resume" : busy ? "…" : failed ? "Retry" : "Enter the world";
                if (GUI.Button(new Rect(x, y, w, 40), label, sButton)) { if (paused) Resume(); else Enter(true); }
                y += 48;
                if (!started)
                {
                    if (GUI.Button(new Rect(x, y, w, 28), "Explore offline (nothing is saved)")) Enter(false);
                    y += 34;
                    y += Text(x, y, w, "By entering, you accept the terms of use: be kind, no cheating, and in-game items have no real-world value.", sSmall);
                    if (Link(x, y, w, "Read the terms of use")) Application.OpenURL(Config.Site + "/legal.html#conditions");
                    y += 26;
                }
            }

            // the controls
            y += Text(x, y, w, TouchPad.Active
                ? "Left thumb: walk · drag: look · short tap: place, open, pet · long press: mine, strike · the buttons on the right: jump, run, crouch, guard with a blade (hold, just before a blow to parry) · on top: bag, chat, view, objectives, menu"
                : "WASD (ZQSD) · Shift: walk · run · Space: jump · left click: hold to mine · right click: place the selected block; with a blade, hold to guard, just before a blow to parry · 1–9: the bar · E: chest and crafting · Enter: chat", sSmall) + 8;
            if (Fold(x, y, w, "All controls", ref openKeys))
            {
                y += 34;
                string keys = TouchPad.Active
                    ? "On top: bag, chat, view, objectives, menu\nChat: /join · /sanctuary — teleport to a friend · back to the sanctuary\nChat: /claim · /unclaim — protect the chunk you're in · release it\nChat: /invite · /kick · /claims — manage who can build on your plots\nChat: /trade — open the Trade tab\nChat: /ignore · /listen · /report — hide, unhide, or report a player"
                    : "1–9 · wheel — choose from the bar\nE · O · Enter — chest and crafting · objectives · chat\nV · F — view from behind or in front · fly (where allowed)\nQ — dodge, with the Front-Runner Boots · M — sound\nChat: /join · /sanctuary — teleport to an online friend · back to the sanctuary\nChat: /claim · /unclaim — protect the chunk you're in (500 Gwei, twice as much for each next one, 9 at most) · release it\nChat: /invite · /kick · /claims — allow or disallow a player on your plots · list them\nChat: /trade nickname — open the Trade tab with that player\nChat: /ignore · /listen · /report — hide, unhide, or report a player";
                y += Text(x, y, w, keys, sSmall) + 6;
            }
            else y += 34;

            // What's new, a dot until its newest entry is read
            if (news.Count > 0)
            {
                bool was = openNews;
                Fold(x, y, w, "What's new" + (NewsUnread ? "  <color=#9fe3c4>●</color>" : ""), ref openNews);
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
            if (known && session != null && session.Login != null)
            {
                Fold(x, y, w, $"Account · logged in as {session.Login}", ref openAccount);
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
            if (paused && session != null)
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
