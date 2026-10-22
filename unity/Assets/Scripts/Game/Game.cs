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

        async void Enter(bool online)
        {
            started = true;
            PlayerPrefs.SetString("ether-mines:world", worldName);
            world.WorldName = worldName;
            if (online)
            {
                status = "Connecting…";
                try
                {
                    var net = new Supabase();
                    await net.SignIn();
                    world.Net = net;
                    status = "";
                }
                catch (Exception e)
                {
                    status = "Offline (" + e.Message + ")";
                    Debug.LogWarning(e);
                }
            }
            player.Init(World.SPAWN.X + 0.5, World.SPAWN.Y + 0.1, World.SPAWN.Z + 2.5);
            player.enabled = true;
        }

        void OnGUI()
        {
            if (box == null)
            {
                box = new GUIStyle(GUI.skin.box) { fontSize = 16, alignment = TextAnchor.UpperLeft, padding = new RectOffset(10, 10, 8, 8) };
                big = new GUIStyle(GUI.skin.label) { fontSize = 40, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            }
            if (!started)
            {
                float w = 420, h = 230, x = (Screen.width - w) / 2, y = (Screen.height - h) / 2;
                GUI.Box(new Rect(x, y, w, h), "");
                GUI.Label(new Rect(x, y + 10, w, 60), "Ether Mines", big);
                GUI.Label(new Rect(x + 20, y + 85, 80, 24), "World");
                worldName = GUI.TextField(new Rect(x + 90, y + 85, w - 110, 26), worldName, 32);
                if (GUI.Button(new Rect(x + 20, y + 130, w - 40, 36), "Enter (online)")) Enter(true);
                if (GUI.Button(new Rect(x + 20, y + 175, w - 40, 30), "Explore offline (the generator only)")) Enter(false);
                return;
            }
            if (player.Body == null) return;
            var b = player.Body;
            string s = $"Position {Math.Floor(b.X)} · {Math.Floor(b.Y)} · {Math.Floor(b.Z)}   Day {sky.DayN} · {(int)(sky.Day * 24):00}:{(int)(sky.Day * 24 * 60 % 60):00}\n" +
                       $"{(world.Status.Length > 0 ? world.Status : status)}   chunks {world.Store.Count}\n" +
                       "WASD walk · Space jump · Shift run · C crouch · V view · F fly · Esc mouse";
            GUI.Box(new Rect(10, 10, 560, 74), s, box);
        }
    }
}
