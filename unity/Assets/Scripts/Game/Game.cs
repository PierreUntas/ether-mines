// Ether Mines · the game's entry point. Nothing to set up in the editor: in any scene, pressing Play builds
// the camera, the sun, the sky, the world and you, from code. A small start screen asks which world to
// visit (read from the same server as the web version; offline, the generator alone draws it). The title
// screen and the menu are GameTitle.cs.
using System;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed partial class Game : MonoBehaviour
    {
        WorldView world;
        PlayerController player;
        Sky sky;
        string worldName;
        bool started;
        string status = "";

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
            // the camera's depth, for the water's shallows and its foam (not on a phone: it costs a pass)
            bool depth = !TouchPad.Active;
            if (depth) cam.depthTextureMode |= DepthTextureMode.Depth;
            Shader.SetGlobalFloat("_EM_Depth", depth ? 1 : 0);
            if (cam.GetComponent<AudioListener>() == null) cam.gameObject.AddComponent<AudioListener>(); // the ears: where the camera is
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) l.enabled = false; // the scene's default light: ours replaces it

            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.55f;
            // the picture, beyond the web's: smooth edges, sharper shadows that reach further in four steps,
            // textures crisp at a slant, the lamps' lights all lit
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            QualitySettings.shadowCascades = 4;
            QualitySettings.shadowProjection = ShadowProjection.StableFit;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
            QualitySettings.pixelLightCount = 4;
            sun.shadowBias = 0.04f;
            sun.shadowNormalBias = 0.3f;
            QualitySettings.shadowDistance = 80;

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
            if (TouchPad.Active)
            {
                // a phone: a little less far, crisper shadows nearer, and the screen stays on while you play
                sun.shadows = LightShadows.Hard;
                QualitySettings.shadowDistance = 40;
                QualitySettings.antiAliasing = 2;
                QualitySettings.shadowCascades = 2;
                QualitySettings.shadowResolution = ShadowResolution.Medium;
                QualitySettings.pixelLightCount = 2;
                Screen.sleepTimeout = SleepTimeout.NeverSleep;
            }
            sunLight = sun;
            // the device's settings (Settings in the window): how far, shadows, animals, sensitivity
            Reg.Load();
            ApplyReg();
            Reg.Changed += ApplyReg;
        }

        Light sunLight;
        void ApplyReg()
        {
            world.ViewRadius = Reg.View;
            sky.FogFar = world.ViewRadius * World.CH + 12;
            sunLight.shadows = !Reg.Shadows ? LightShadows.None : TouchPad.Active ? LightShadows.Hard : LightShadows.Soft;
            player.Sensitivity = Reg.Sensitivity;
            Animals.On = Reg.Animals;
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
                else if (session.Moved != null)
                {
                    // this device's game was opened on another one: it's there now
                    nick = session.Moved;
                    status = "Your game was opened on another device: enter your password to bring it back here.";
                }
            }
            catch (Exception e) { status = "No connection right now: Retry, or play offline below. (" + e.Message + ")"; session = null; Debug.LogWarning(e); }
        }

        async void Enter(bool online)
        {
            if (busy || started) return;
            busy = true;
            failed = false;
            try
            {
                worldName = CleanWorld(worldName);
                if (online && session == null)
                {
                    // the first try failed (no network then?): once more now, rather than slipping into offline
                    Step("Connecting to your account…", 2);
                    var s = new Session(new Supabase());
                    s.Log += Hud.Feed;
                    known = await s.Known();
                    session = s;
                    if (known) nick = session.Login;
                }
                if (online && session != null)
                {
                    if (!known || session.Login == null || !string.Equals(session.Login, nick.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        Step("Checking your nickname and password…", 3);
                        var err = await session.Enter(nick, password);
                        if (err != null) { status = err; return; }
                        password = "";
                        known = true;
                    }
                    if (session.MustChange) { status = "Choose your own password first."; return; }
                    // one nickname per player per world: you can't enter with someone else's
                    Step("Checking nickname…", 6);
                    if (await session.NameTaken(worldName, session.Login))
                    {
                        status = $"The nickname \"{session.Login}\" is already taken in this world by another account. Write to contact@ethermines.org to sort it out.";
                        return;
                    }
                    Step("Loading your save and your chest…", 10);
                    await session.Load(worldName);
                    world.Net = session.Net;
                }
                else
                {
                    // offline: the game on this device (LocalServer), its own save per world, nothing online touched
                    var local = new LocalServer();
                    var s = new Session(new Supabase(local));
                    s.Log += Hud.Feed;
                    if (!await s.Known())
                    {
                        var err = await s.Enter(nick, "offline");
                        if (err != null) { status = err; return; }
                    }
                    nick = s.Login;
                    session = s;
                    Step("Loading your game on this device…", 10);
                    await session.Load(worldName);
                    world.Net = session.Net;
                }
                PlayerPrefs.SetString("ether-mines:world", worldName);
                Reg.World = worldName;
                world.WorldName = worldName;
                var p = session?.SavedPos();
                if (p != null && World.InWorld(p[0], p[2])) { player.Init(p[0], p[1], p[2]); player.Yaw = p[3]; player.Pitch = p[4]; }
                else player.Init(World.SPAWN.X + 0.5, World.SPAWN.Y + 0.1, World.SPAWN.Z + 2.5);
                lastSaved = player.GamePos;
                interaction = gameObject.AddComponent<Interaction>();
                interaction.World = world;
                interaction.Player = player;
                interaction.Session = session;
                player.HasCape = () => session != null && session.Inv.Uniques.Exists(u => u.Id == 205);
                player.AimDist = () =>
                {
                    var t = interaction.Target;
                    if (t == null || player.Body == null) return 8;
                    float dx = t.X + 0.5f - (float)player.Body.X, dy = t.Y + 0.5f - (float)(player.Body.Y + PlayerPhysics.EYE), dz = t.Z + 0.5f - (float)player.Body.Z;
                    return Mathf.Clamp(Mathf.Sqrt(dx * dx + dy * dy + dz * dz), 2, 12);
                };
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
                // animals and villagers, online or not (each screen places them from the seed)
                var mobs = gameObject.AddComponent<Mobs>();
                mobs.Player = player;
                var animals = gameObject.AddComponent<Animals>();
                animals.World = world;
                animals.Player = player;
                animals.Mobs = mobs;
                animals.Session = session;
                interaction.Animals = animals;
                var hover = gameObject.AddComponent<Hover>();
                hover.Player = player;
                hover.Act = interaction;
                interaction.Hover = hover;
                items.Hover = hover;
                hand.Hover = hover;
                player.Lift = () => hover.Lift;
                player.AfterStep = hover.BoardTick;
                // the sounds (made, not recorded), and the ambiance that follows the day and the depth
                gameObject.AddComponent<Haptics>();
                // fireflies, butterflies, petals, the breaks' bursts; and the glow over the picture
                var fx = gameObject.AddComponent<Effects>();
                fx.World = world;
                fx.Player = player;
                fx.Sky = sky;
                var decor = gameObject.AddComponent<Decor>();
                decor.World = world;
                decor.Player = player;
                var weather = gameObject.AddComponent<Weather>();
                weather.World = world;
                weather.Player = player;
                weather.Sky = sky;
                if (player.Cam.GetComponent<PostGlow>() == null) player.Cam.gameObject.AddComponent<PostGlow>();
                gameObject.AddComponent<Notify>().Session = session; // a word for later, when you leave (a phone)
                var sounds = gameObject.AddComponent<Sounds>();
                sounds.Player = player;
                sounds.Sky = sky;
                // the circuits around you (lamps, doors, gates), and the lanterns' light
                var circuits = gameObject.AddComponent<CircuitsView>();
                circuits.World = world;
                circuits.Player = player;
                circuits.Session = session;
                circuits.Sky = sky;
                // the touch controls: which buttons show depends on what you hold and wear
                gameObject.AddComponent<TouchPad>();
                TouchPad.SlotRect = Hud.SlotRect;
                TouchPad.Riding = () => hover.Aboard;
                TouchPad.ShowRide = () => hover.Aboard || Hover.IsHover(interaction.Inv.HeldId);
                TouchPad.ShowGuard = () => interaction.Combat != null && !hover.Aboard && Combat.IsBlade(interaction.Inv.HeldId);
                TouchPad.ShowDash = () => items.BootsOn && !hover.Aboard;
                TouchPad.Ranged = () => Combat.IsRanged(interaction.Inv.HeldId);
                if (session != null)
                {
                    var progress = gameObject.AddComponent<Progress>();
                    progress.Session = session;
                    progress.Player = player;
                    panel.Progress = progress;
                }
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
                // the HUD that guides you: clock, position and compass, objective, attack, place names, the target
                var guide = gameObject.AddComponent<Guide>();
                guide.Player = player;
                guide.Act = interaction;
                guide.Session = session;
                guide.Sky = sky;
                guide.Items = items;
                guide.Animals = animals;
                guide.World = world;
                var mpRef = mp;
                guide.Online = () => mpRef != null ? mpRef.Line : null;
                guide.Progress = () => GetComponent<Progress>();
                guide.Combat = () => GetComponent<Combat>();
                // the ledger, seen: T outlines your blocks, I opens the block explorer
                var ledger = gameObject.AddComponent<Ledger>();
                ledger.Session = session;
                ledger.World = world;
                ledger.Player = player;
                ledger.Act = interaction;
                // the story on screen: Thea's lines, the intro and the finale, the network's milestones, the leaderboard
                var story = gameObject.AddComponent<Story>();
                story.Session = session;
                story.Player = player;
                story.World = world;
                story.Sky = sky;
                story.Animals = animals;
                story.Panel = panel;
                story.Progress = () => GetComponent<Progress>();
                player.enabled = true;
                started = true;
                Step(online ? "Joining the world and the other players…" : "Generating the world…", 14);
                loading = true; // the title stays up until the ground under you has come in (GameTitle.cs)
                Ui.Paused = true; // and the keys wait for it
            }
            catch (Exception e) { status = "Connection failed: " + e.Message; failed = true; Debug.LogWarning(e); }
            finally { busy = false; if (!started) stepAt = -1; }
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
            session.Net.Local?.Tick(Time.deltaTime);
            saveT += Time.deltaTime;
            var p = player.GamePos;
            if ((saveT > 20 && (p - lastSaved).magnitude > 1) || (session.Dirty && saveT > 2)) { saveT = 0; lastSaved = p; session.Dirty = false; SaveNow(); }
        }

        // the save (savePlayer): a refusal is said in the log (once a while), and tried again soon
        float saveToldAt = -999;
        bool nameTold;
        async void SaveNow()
        {
            try { var b = player.Body; await session.Save(b.X, b.Y, b.Z, player.Yaw, player.Pitch); }
            catch (Exception e)
            {
                Debug.LogWarning(e);
                session.Dirty = true; // again in a moment
                var m = e.Message ?? "";
                if (!nameTold && (m.Contains("username already taken") || m.Contains("players_username")))
                {
                    nameTold = true;
                    Hud.Feed("burn", $"The nickname \"{session.Login}\" is already taken in this world", "pick another one to save your progress");
                }
                else if (Time.time - saveToldAt > 60)
                {
                    saveToldAt = Time.time;
                    bool down = m.Contains(": 0 ") || m.Contains(": 5");
                    Hud.Feed("burn", down ? "Online save unavailable" : "Save refused by the server", down ? "no connection: trying again in a moment" : "trying again in a moment");
                }
            }
        }

        void OnApplicationQuit() { if (started && session != null) { SaveNow(); session.Net.Local?.Flush(); } }
        // a phone sends the game to the background (and may close it there without a word): save now
        void OnApplicationPause(bool paused) { if (paused && started && session != null && player.Body != null) { SaveNow(); session.Net.Local?.Flush(); } }

    }
}
