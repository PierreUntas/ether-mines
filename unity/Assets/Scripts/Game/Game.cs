// Ether Mines · the game's entry point. Nothing to set up in the editor: in any scene, pressing Play builds
// the camera, the sun, the sky, the world and you, from code. A small start screen asks which world to
// visit (read from the same server as the web version; offline, the generator alone draws it).
using System;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Game : MonoBehaviour
    {
        WorldView world;
        PlayerController player;
        Sky sky;
        string worldName;
        bool started;
        string status = "";
        GUIStyle box, big;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<Game>() != null) return;
            new GameObject("Ether Mines").AddComponent<Game>();
        }

        void Awake()
        {
            Application.targetFrameRate = 60;
            Rules.Load(Resources.Load<TextAsset>("rules").text);
            Mesher.RulesChanged();
            worldName = PlayerPrefs.GetString("ether-mines:world", Config.DefaultWorld);

            var cam = Camera.main;
            if (cam == null) cam = new GameObject("Camera").AddComponent<Camera>();
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 400;
            cam.fieldOfView = 70;
            cam.clearFlags = CameraClearFlags.Skybox;
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) l.enabled = false; // the scene's default light: ours replaces it

            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.55f;
            QualitySettings.shadowDistance = 60;

            var skyMat = new Material(Shader.Find("EtherMines/Sky"));
            RenderSettings.skybox = skyMat;
            sky = gameObject.AddComponent<Sky>();
            sky.Sun = sun;
            sky.SkyMat = skyMat;

            world = new GameObject("World").AddComponent<WorldView>();
            player = gameObject.AddComponent<PlayerController>();
            player.World = world;
            player.Cam = cam;
            player.enabled = false;
            sky.FogFar = world.ViewRadius * World.CH + 12;
        }

        Session session;
        Interaction interaction;
        Multiplayer mp;
        string nick = "", password = "", newPassword = "";
        bool busy, known;
        float saveT;
        Vector3 lastSaved;

        async void Start()
        {
            // does this device already know you? (your nickname, kept by the session)
            try
            {
                var net = new Supabase();
                session = new Session(net);
                session.Log += Hud.Feed;
                known = await session.Known();
                if (known) nick = session.Login;
            }
            catch (Exception e) { status = "Offline (" + e.Message + ")"; session = null; Debug.LogWarning(e); }
        }

        async void Enter(bool online)
        {
            if (busy) return;
            busy = true;
            try
            {
                worldName = CleanWorld(worldName);
                if (online && session != null)
                {
                    if (!known || session.Login == null || !string.Equals(session.Login, nick.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        status = "Checking your nickname and password…";
                        var err = await session.Enter(nick, password);
                        if (err != null) { status = err; return; }
                        password = "";
                        known = true;
                    }
                    if (session.MustChange) { status = "Choose your own password first."; return; }
                    status = "Loading your game…";
                    await session.Load(worldName);
                    world.Net = session.Net;
                }
                else session = null;
                PlayerPrefs.SetString("ether-mines:world", worldName);
                world.WorldName = worldName;
                var p = session?.SavedPos();
                if (p != null && World.InWorld(p[0], p[2])) { player.Init(p[0], p[1], p[2]); player.Yaw = p[3]; player.Pitch = p[4]; }
                else player.Init(World.SPAWN.X + 0.5, World.SPAWN.Y + 0.1, World.SPAWN.Z + 2.5);
                lastSaved = player.GamePos;
                interaction = gameObject.AddComponent<Interaction>();
                interaction.World = world;
                interaction.Player = player;
                interaction.Session = session;
                gameObject.AddComponent<Hud>().Act = interaction;
                HeldModels.World = world;
                var hand = gameObject.AddComponent<Hand>();
                hand.Player = player;
                hand.Act = interaction;
                var panel = gameObject.AddComponent<Panel>();
                panel.Session = session;
                panel.Act = interaction;
                var items = gameObject.AddComponent<Items>();
                items.Session = session;
                items.Player = player;
                items.Act = interaction;
                items.Panel = panel;
                items.Sky = sky;
                interaction.Items = items;
                if (session != null) session.Where = () => new[] { player.Body.X, player.Body.Y, player.Body.Z };
                if (session != null)
                {
                    // playing together: the others, their blocks, the chat
                    mp = gameObject.AddComponent<Multiplayer>();
                    mp.Session = session;
                    mp.World = world;
                    mp.Player = player;
                    mp.Act = interaction;
                }
                player.enabled = true;
                started = true;
                status = "";
            }
            catch (Exception e) { status = "Connection failed: " + e.Message; Debug.LogWarning(e); }
            finally { busy = false; }
        }

        async void ChangePassword()
        {
            if (busy) return;
            busy = true;
            try
            {
                var err = await session.SetPassword(newPassword);
                status = err ?? "Password saved. Enter the world!";
                if (err == null) newPassword = "";
            }
            catch (Exception e) { status = e.Message; }
            finally { busy = false; }
        }

        // same rule as the web version for world names: lower case, a-z 0-9 and dashes
        static string CleanWorld(string w)
        {
            w = (w ?? "").Trim().ToLowerInvariant();
            var sb = new System.Text.StringBuilder();
            foreach (var c in w.Normalize(System.Text.NormalizationForm.FormD))
            {
                if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.NonSpacingMark) continue;
                sb.Append(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' ? c : '-');
            }
            var r = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), "-+", "-");
            if (r.Length > 32) r = r.Substring(0, 32);
            return r.Length == 0 || r == "-" ? "principal" : r;
        }

        // your game goes back to the server now and then while you walk (cloudSave), and when you leave
        void Update()
        {
            if (!started || session == null || player.Body == null) return;
            saveT += Time.deltaTime;
            var p = player.GamePos;
            if ((saveT > 20 && (p - lastSaved).magnitude > 1) || (session.Dirty && saveT > 2)) { saveT = 0; lastSaved = p; session.Dirty = false; SaveNow(); }
        }

        async void SaveNow()
        {
            try { var b = player.Body; await session.Save(b.X, b.Y, b.Z, player.Yaw, player.Pitch); }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        void OnApplicationQuit() { if (started && session != null) SaveNow(); }

        void OnGUI()
        {
            if (box == null)
            {
                box = new GUIStyle(GUI.skin.box) { fontSize = 16, alignment = TextAnchor.UpperLeft, padding = new RectOffset(10, 10, 8, 8) };
                big = new GUIStyle(GUI.skin.label) { fontSize = 40, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            }
            if (!started)
            {
                float w = 460, h = session != null && session.MustChange ? 400 : 360, x = (Screen.width - w) / 2, y = (Screen.height - h) / 2;
                GUI.Box(new Rect(x, y, w, h), "");
                GUI.Label(new Rect(x, y + 10, w, 60), "Ether Mines", big);
                float ly = y + 85;
                GUI.Label(new Rect(x + 20, ly, 110, 24), "Nickname");
                nick = GUI.TextField(new Rect(x + 130, ly, w - 150, 26), nick, 16);
                ly += 36;
                bool asKnown = known && session != null && session.Login != null && string.Equals(session.Login, nick.Trim(), StringComparison.OrdinalIgnoreCase);
                if (!asKnown)
                {
                    GUI.Label(new Rect(x + 20, ly, 110, 24), "Password");
                    password = GUI.PasswordField(new Rect(x + 130, ly, w - 150, 26), password, '•', 72);
                    ly += 36;
                }
                GUI.Label(new Rect(x + 20, ly, 110, 24), "World");
                worldName = GUI.TextField(new Rect(x + 130, ly, w - 150, 26), worldName, 32);
                ly += 44;
                if (session != null && session.MustChange)
                {
                    GUI.Label(new Rect(x + 20, ly, 110, 24), "New password");
                    newPassword = GUI.PasswordField(new Rect(x + 130, ly, w - 260, 26), newPassword, '•', 72);
                    if (GUI.Button(new Rect(x + w - 120, ly, 100, 26), "Save")) ChangePassword();
                    ly += 40;
                }
                if (GUI.Button(new Rect(x + 20, ly, w - 40, 36), busy ? "…" : "Enter the world")) Enter(true);
                ly += 44;
                if (GUI.Button(new Rect(x + 20, ly, w - 40, 28), "Explore offline (nothing is saved)")) Enter(false);
                ly += 36;
                GUI.Label(new Rect(x + 20, ly, w - 40, 60), status);
                return;
            }
            if (player.Body == null) return;
            var b = player.Body;
            string s = $"{(session != null ? session.Login + " · " : "")}Position {Math.Floor(b.X)} · {Math.Floor(b.Y)} · {Math.Floor(b.Z)}   Day {sky.DayN} · {(int)(sky.Day * 24):00}:{(int)(sky.Day * 24 * 60 % 60):00}\n" +
                       $"{(world.Status.Length > 0 ? world.Status : status)}   chunks {world.Store.Count}{(mp != null ? "\n" + mp.Line : "")}\n" +
                       "Left click: mine, strike · Right click: place, open, use, guard with a blade · 1-9 / wheel: bar · E bag & crafting · Enter chat · V view · F fly · Esc mouse";
            GUI.Box(new Rect(10, 10, 780, mp != null ? 96 : 74), s, box);
        }
    }
}
