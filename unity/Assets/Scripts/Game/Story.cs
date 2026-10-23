// Ether Mines · the story told on screen (07-interface.js cinePlay, playIntro, the finale, THEA_LINES,
// updateNetwork, the leaderboard; 09-animals.js greetPlayer): Thea's lines one at a time in the dialogue
// bubble (a chapter's intro and outro, the call back to the Atrium once the story is done); the cinematics,
// played in the engine in your own world (letterboxed, no HUD, subtitles, Skip: Esc, Space, Enter): a new
// player's first 14 seconds, then Thea's greeting; the finale (night falls over the Atrium, a beam rises,
// fireworks, the great diamond spins, Thea speaks, then the epilogue screen); the network's milestones
// (a star around the great diamond per tier, its colors for the defense score, announced in big letters);
// and the leaderboard's sign in the City, read every minute (act_leaderboard).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Story : MonoBehaviour
    {
        public Session Session;
        public PlayerController Player;
        public WorldView World;
        public Sky Sky;
        public Animals Animals;
        public Panel Panel;
        public Func<Progress> Progress;

        static Story I;
        void Awake() { I = this; }

        static Vector3 U(Vector3 g) => new Vector3(g.x, g.y, -g.z); // the game's coordinates to Unity's
        static float Smooth(float u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
        static Vector3 Spawn => new Vector3(EtherMines.Core.World.SPAWN.X + 0.5f, EtherMines.Core.World.SPAWN.Y, EtherMines.Core.World.SPAWN.Z + 0.5f);

        // ---------- your save's "seen" marks (S.seen) ----------
        Dictionary<string, object> SeenObj()
        {
            if (!Session.State.TryGetValue("seen", out var o) || !(o is Dictionary<string, object> d)) Session.State["seen"] = d = new Dictionary<string, object>();
            return d;
        }
        bool Seen(string k) => Session != null && SeenObj().ContainsKey(k);
        void Mark(string k) { if (Session == null) return; SeenObj()[k] = 1.0; Session.Dirty = true; }

        // ---------- Thea's lines, one at a time (THEA_LINES, theaNext) ----------
        static readonly Queue<string> theaLines = new Queue<string>();
        public static void Thea(string line) { if (!string.IsNullOrEmpty(line)) theaLines.Enqueue(line); }
        void TheaNext()
        {
            if (Ui.Cine || theaLines.Count == 0 || Animals == null || Animals.Speaking) return;
            var t = theaLines.Dequeue();
            Animals.SayAs(Animals.Thea, t, 4.5f + t.Length * 0.045f);
        }

        // where the ground is under a point near the Atrium (groundAt), and Thea's head
        float GroundY(float x, float z)
        {
            int fx = (int)Math.Floor(x), fz = (int)Math.Floor(z), y0 = EtherMines.Core.World.SPAWN.Y;
            for (int y = y0 + 6; y >= y0 - 8; y--) if (Mesher.IsSolid(World.Get(fx, y, fz))) return y + 1;
            return y0;
        }
        Vector3 TheaHead()
        {
            var h = Animals != null ? Animals.Thea : null;
            if (h == null) return Spawn + new Vector3(0, 1.5f, 0);
            return new Vector3(h.X + 0.5f, GroundY(h.X + 0.5f, h.Z + 0.5f) + 1.5f, h.Z + 0.5f);
        }
        // where the player's eyes are and what they look at (eyesPose), in the game's coordinates
        (Vector3 pos, Vector3 look) Eyes()
        {
            var t = Player.Cam.transform;
            var p = U(t.position);
            return (p, p + U(t.forward) * 10);
        }

        // ---------- cinematics: the game takes the camera ----------
        sealed class Scene { public float End; public (float a, float b, string who, string text)[] Lines; public Func<float, (Vector3, Vector3)> Pose; public Action OnEnd; }
        Scene cine;
        float cineT, saidAt;
        int said = -1;

        void CinePlay(Scene s)
        {
            cine = s; cineT = 0; said = -1;
            theaLines.Clear();
            Ui.Cine = true;
            Player.CinePose = () => cine != null ? cine.Pose(Mathf.Min(cineT, cine.End)) : Eyes();
            Lock(false); // the mouse, for the Skip button
        }
        void CineSkip() { if (cine != null) cineT = Mathf.Max(cineT, cine.End); }

        void CineTick(float dt)
        {
            if (cine == null) return;
            cineT += dt;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current; var g = Gamepad.current;
            if (k != null && (k.escapeKey.wasPressedThisFrame || k.spaceKey.wasPressedThisFrame || k.enterKey.wasPressedThisFrame)) CineSkip();
            if (g != null && (g.startButton.wasPressedThisFrame || g.buttonEast.wasPressedThisFrame)) CineSkip();
#else
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return)) CineSkip();
#endif
            int i = Array.FindIndex(cine.Lines, l => cineT >= l.a && cineT < l.b);
            if (i != said)
            {
                said = i;
                saidAt = Time.time;
                if (i >= 0 && cine.Lines[i].who != null) Sounds.Animal("villager");
            }
            if (cineT < cine.End) return;
            var s = cine;
            cine = null;
            Ui.Cine = false;
            Player.CinePose = null;
            // you're left facing Thea
            var h = Animals != null ? Animals.Thea : null;
            var b = Player.Body;
            if (h != null && b != null) { Player.Yaw = Math.Atan2(-(h.X + 0.5 - b.X), -(h.Z + 0.5 - b.Z)); Player.Pitch = 0; }
            if (!Ui.Paused && !Ui.PanelOpen) Lock(true);
            s.OnEnd?.Invoke();
        }

        static void Lock(bool on)
        {
            if (TouchPad.Active) return;
            Cursor.lockState = on ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !on;
        }

        // ---------- the intro: a new player's first 14 seconds (playIntro) ----------
        static readonly string[] IntroLines =
        {
            "Long ago, the network went dark. Its old validators sleep in the ruins.",
            "Only the Atrium still shines. It has been waiting for you.",
        };
        void PlayIntro(Action onEnd)
        {
            var (eye, _) = Eyes();
            Vector3 T = TheaHead(), C = Spawn, diamond = Decor.Diamond;
            var toD = new Vector3(diamond.x - C.x, 0, diamond.z - C.z).normalized;
            Vector3 high0 = C - toD * 14 + new Vector3(10, 34, 0), high1 = C - toD * 4 + new Vector3(2, 30, 0);
            // the first ruin, if its dark validator is already loaded: otherwise straight down to the Atrium
            var r = EtherMines.Core.World.RuinAt(0, 0);
            Vector3? ruin = r != null && World.Loaded(r.X, r.Z) && World.Get(r.X, r.Y + 1, r.Z) == 73 ? new Vector3(r.X + 0.5f, r.Y + 1.5f, r.Z + 0.5f) : (Vector3?)null;
            Vector3 ruinCam = ruin.HasValue ? ruin.Value + new Vector3(C.x - ruin.Value.x, 0, C.z - ruin.Value.z).normalized * 10 + new Vector3(0, 7, 0) : high1;
            Vector3 over = C + new Vector3(0, 14, 0) + new Vector3(eye.x - C.x, 0, eye.z - C.z).normalized * 16, atrium = C + new Vector3(0, 3, 0);
            CinePlay(new Scene
            {
                End = 14,
                Lines = new[] { (0.8f, 7f, "Thea", IntroLines[0]), (8.5f, 14f, "Thea", IntroLines[1]) },
                Pose = t =>
                {
                    // shot 1: high above, the great diamond, dim
                    if (t < 4.5f) return (Vector3.Lerp(high0, high1, Smooth(t / 4.5f)), diamond);
                    // shot 2: down to the first ruin's dark validator
                    if (ruin.HasValue && t < 9) { float u2 = Smooth((t - 4.5f) / 4.5f); return (Vector3.Lerp(high1, ruinCam, u2), Vector3.Lerp(diamond, ruin.Value, u2)); }
                    // shot 3: over to the Atrium, then down into the player's own eyes, facing Thea
                    Vector3 from = ruin.HasValue ? ruinCam : high1, fromLook = ruin.HasValue ? ruin.Value : diamond;
                    float t0 = ruin.HasValue ? 9 : 4.5f, u = (t - t0) / (14 - t0);
                    if (u < 0.5f) { float v = Smooth(u * 2); return (Vector3.Lerp(from, over, v), Vector3.Lerp(fromLook, atrium, v)); }
                    float w = Smooth((u - 0.5f) * 2);
                    return (Vector3.Lerp(over, eye, w), Vector3.Lerp(atrium, T, w));
                },
                OnEnd = onEnd,
            });
        }

        // a brand-new arrival's first moment: Thea speaks before they have to go find anyone (greetPlayer)
        float tipAt = -1;
        void Greet()
        {
            var h = Animals != null ? Animals.Thea : null;
            if (h != null && h.Says.Count > 0) Animals.SayAs(h, h.Says[0], 1.4f + h.Says[0].Length * 0.042f + 1.5f);
            Sounds.Theme();
            if (Session != null && h != null)
            {
                if (!Session.State.TryGetValue("met", out var mo) || !(mo is Dictionary<string, object> met)) Session.State["met"] = met = new Dictionary<string, object>();
                met[h.Name] = 1.0;
                Session.Dirty = true;
            }
            tipAt = Time.time + 10;
        }

        // ---------- the finale, played once in the world ----------
        const float FinaleR = 14, CineEnd = 30;
        static readonly string[] EpilogueThea =
        {
            "Listen… the whole network hums in one rhythm now. Work and stake, together, because someone dared to climb up there.",
            "When you arrived, the Atrium’s validator was the only light in this world. Look around now. Whatever you build next, the ledger will remember it was you.",
        };
        const string EpilogueCall = "Merge Keeper… come back to the Atrium. There is something you should see.";
        const string EpilogueText = "The twins fell together, and the sanctum is quiet at last. Far below, the validators you relit blink in the dark like a new constellation. A network is never finished, and neither are the Ether Mines. But today, it holds — and it holds because of you.";

        bool fCalled, fOn, fShown, fDone, fCineDone;
        float fT, fNext, fInGame, fDay0;
        (Vector3 pos, Vector3 look) fPose0;
        GameObject beam;
        Material beamMat;
        float beamOp;
        static bool AttackNow => DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 3600 < 600;
        float FinaleDist() { var b = Player.Body; return (float)EtherMines.Core.World.Hypot(b.X - Spawn.x, b.Z - Spawn.z); }
        // the story is done, the finale not played yet (the objective at the top says where to go)
        public static bool ScreenUp => I != null && I.fShown && !I.fDone; // the epilogue screen wants the mouse
        public static bool FinaleWaiting => I != null && I.Seen("epilogue") && !I.Seen("finale") && !I.fOn;

        void StartFinale()
        {
            fOn = true; fT = 0; fNext = 0.4f; fShown = fDone = fCineDone = false;
            theaLines.Clear();
            fDay0 = Sky.Day;
            fPose0 = Eyes();
            CinePlay(new Scene
            {
                End = CineEnd,
                Lines = new[] { (16.5f, 23f, "Thea", EpilogueThea[0]), (23f, 29.5f, "Thea", EpilogueThea[1]) },
                Pose = FinalePose,
                OnEnd = () => fCineDone = true,
            });
            beamMat = Effects.Mat(Texture2D.whiteTexture, Color.black, true);
            beam = new GameObject("finale beam");
            beam.transform.SetParent(transform, false);
            beam.AddComponent<MeshFilter>().sharedMesh = Decor.Cylinder(0.35f, 0.8f, 70, 12);
            var mr = beam.AddComponent<MeshRenderer>();
            mr.sharedMaterial = beamMat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            beam.transform.position = U(Spawn + new Vector3(0, 35, 0));
            beamOp = 0;
            Sounds.Theme();
        }

        // three shots around the Atrium (cinePose): an orbit while night falls and the beam rises, a crane up to
        // the great diamond through the fireworks, then down to Thea, who speaks face to face
        (Vector3, Vector3) FinalePose(float t)
        {
            Vector3 C = Spawn, T = TheaHead(), diamond = Decor.Diamond;
            var away = new Vector3(C.x - diamond.x, 0, C.z - diamond.z).normalized;
            float aAway = Mathf.Atan2(away.z, away.x);
            Vector3 Orbit(float u) { float a = aAway + 2 - u * 2; return new Vector3(C.x + Mathf.Cos(a) * 21, C.y + 9, C.z + Mathf.Sin(a) * 21); }
            Vector3 up = C + new Vector3(0, 11, 0), crane = C + away * 30 + new Vector3(0, 20, 0), vista = Vector3.Lerp(C + new Vector3(0, 12, 0), diamond, 0.3f);
            var b = Player.Body;
            var d = new Vector3((float)b.X - T.x, 0, (float)b.Z - T.z);
            if (d.sqrMagnitude < 0.01f) d = away;
            d.Normalize();
            Vector3 near = T + d * 3 + new Vector3(0, 0.1f, 0), approach = near + d * 9 + new Vector3(0, 6, 0);
            if (t < 9)
            {
                var pos = Orbit(Smooth(t / 9));
                float bl = Smooth(t / 2.5f); // out of the player's eyes
                return (Vector3.Lerp(fPose0.pos, pos, bl), Vector3.Lerp(fPose0.look, up, bl));
            }
            if (t < 16) { float u = Smooth((t - 9) / 7); return (Vector3.Lerp(Orbit(1), crane, u), Vector3.Lerp(up, vista, u)); }
            if (t < 19.5f) { float u = Smooth((t - 16) / 3.5f); return (Vector3.Lerp(crane, approach, u), Vector3.Lerp(vista, T, u)); }
            return (Vector3.Lerp(approach, near, Smooth((t - 19.5f) / 3)), T);
        }

        // fireworks: bursts of 48 sparks in the Atrium's sky (fireworkBurst)
        static readonly Color[] FwColors = { Hex("#ffd95e"), Hex("#7fe8ff"), Hex("#ff9ab8"), Hex("#9fe3c4"), Hex("#c2b8ff") };
        static Color Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }
        const int Sparks = 48, Bursts = 12;
        sealed class Burst { public Vector3[] P = new Vector3[Sparks], V = new Vector3[Sparks]; public Color C; public float T; public bool Live; }
        readonly Burst[] bursts = new Burst[Bursts];
        int nextSlot;
        Effects.Specks sparks;
        static Texture2D dot;

        static Texture2D Dot()
        {
            if (dot != null) return dot;
            dot = new Texture2D(16, 16, TextureFormat.RGBA32, false);
            for (int y = 0; y < 16; y++)
                for (int x = 0; x < 16; x++)
                {
                    float r = Mathf.Sqrt((x - 7.5f) * (x - 7.5f) + (y - 7.5f) * (y - 7.5f)) / 7.5f, a = Mathf.Clamp01(1 - r);
                    dot.SetPixel(x, y, new Color(1, 1, 1, a * a));
                }
            dot.Apply();
            return dot;
        }

        void FireworkBurst()
        {
            if (sparks == null) { sparks = new Effects.Specks("fireworks", Sparks * Bursts, Dot(), true, transform); for (int i = 0; i < Bursts; i++) bursts[i] = new Burst(); }
            var f = bursts[nextSlot];
            nextSlot = (nextSlot + 1) % Bursts;
            float a = UnityEngine.Random.value * Mathf.PI * 2, r = 6 + UnityEngine.Random.value * 12;
            var at = new Vector3(Spawn.x + Mathf.Cos(a) * r, Spawn.y + 16 + UnityEngine.Random.value * 10, Spawn.z + Mathf.Sin(a) * r);
            for (int i = 0; i < Sparks; i++)
            {
                float u = UnityEngine.Random.value * 2 - 1, th = UnityEngine.Random.value * Mathf.PI * 2, s = Mathf.Sqrt(1 - u * u), v = 6 + UnityEngine.Random.value * 3;
                f.P[i] = at;
                f.V[i] = new Vector3(s * Mathf.Cos(th) * v, u * v, s * Mathf.Sin(th) * v);
            }
            f.C = FwColors[UnityEngine.Random.Range(0, FwColors.Length)];
            f.T = 0;
            f.Live = true;
            Sounds.Blip();
        }

        void FinaleTick(float dt)
        {
            bool playing = !Ui.Paused && Player.Body != null;
            fInGame = playing ? fInGame + dt : 0;
            if (!fOn)
            {
                // a few seconds in the world first; not in the middle of a network attack (nodes swarm the Atrium)
                if (fInGame < 4 || Session == null || cine != null) return;
                if (!Seen("epilogue") || Seen("finale") || Ui.PanelOpen || Signs.Open || FinaleDist() > FinaleR || AttackNow) return;
                StartFinale();
            }
            fT += dt;
            float t = fT;
            // night falls over the Atrium for the fireworks (your own sky only)
            if (t < 3 && fDay0 > 0.2f && fDay0 < 0.8f) Sky.FixedDay = fDay0 + (0.93f - fDay0) * Mathf.Pow(Mathf.Min(1, t / 3), 2);
            else if (!fDone && fDay0 > 0.2f && fDay0 < 0.8f) Sky.FixedDay = 0.93f;
            // fireworks until you close the epilogue screen
            if (!fDone && t >= fNext) { FireworkBurst(); fNext = t + (cine != null ? 0.25f : 0.45f) + UnityEngine.Random.value * 0.4f; }
            bool any = false;
            if (sparks != null)
            {
                var cam = Player.Cam.transform;
                for (int k = 0; k < Bursts; k++)
                {
                    var f = bursts[k];
                    for (int i = 0; i < Sparks; i++)
                    {
                        int ix = k * Sparks + i;
                        if (!f.Live) { sparks.Hide(ix); continue; }
                        f.V[i].y -= 4 * dt;
                        f.V[i].x *= 1 - dt * 0.8f;
                        f.V[i].z *= 1 - dt * 0.8f;
                        f.P[i] += f.V[i] * dt;
                        sparks.Set(ix, U(f.P[i]), 0.28f, 0.28f, f.C * Mathf.Max(0, 1 - f.T / 1.8f), new Rect(0, 0, 1, 1), cam.right, cam.up);
                    }
                    if (!f.Live) continue;
                    any = true;
                    f.T += dt;
                    if (f.T > 1.8f) f.Live = false;
                }
                sparks.Apply();
            }
            // the beam of light, and the great diamond spinning faster
            if (beam != null)
            {
                beamOp = fDone ? Mathf.Max(0, beamOp - dt * 0.4f) : Mathf.Min(0.28f, t * 0.2f) * (0.8f + 0.2f * Mathf.Sin(t * 3));
                beamMat.color = Hex("#ffd95e") * beamOp;
                beam.transform.rotation *= Quaternion.Euler(0, -dt * 0.6f * Mathf.Rad2Deg, 0);
                if (fDone && beamOp <= 0) { Destroy(beam); beam = null; }
            }
            Decor.Spin = fDone ? 0 : 1.4f;
            // the epilogue screen once Thea has spoken
            if (!fShown && fCineDone) { fShown = true; Mark("finale"); Lock(false); Sounds.Chime(); }
            if (fDone && !any && beam == null) { fOn = false; Sky.FixedDay = null; }
        }

        void CloseFinale()
        {
            fDone = true;
            Sky.FixedDay = null;
            if (!Ui.Paused) Lock(true);
        }

        // "Replay the finale at the Atrium" (the epilogue card, once it has played)
        void Replay()
        {
            var p = Progress != null ? Progress() : null;
            p?.SetSeen("finale", false);
            fCalled = true; fShown = false; fDone = false;
            if (Ui.PanelOpen && Panel != null) Panel.Hide();
            Hud.Feed("nft", AttackNow ? "The finale will play at the Atrium once the attack is over" : FinaleDist() > FinaleR ? "Head back to the Atrium" : "The finale is about to begin…",
                     AttackNow ? "10 minutes past the hour" : FinaleDist() > FinaleR ? "the finale plays there" : "");
        }

        // ---------- the network: its milestones on the great diamond ----------
        static readonly int[] Tiers = { 3, 10, 25, 50, 100 }, ScoreTiers = { 5, 15, 30, 50, 80 };
        static readonly string[] MilestoneNames = { "a first star", "two stars", "three stars", "four stars", "the diamond fully awake" };
        int netSeen = -1, scoreSeen = -1, readsSeen;
        static int Level(int n) { int l = 0; foreach (var p in Tiers) if (n >= p) l++; return l; }
        static int ScoreTier(int s) { int l = 0; foreach (var p in ScoreTiers) if (s >= p) l++; return l; }

        void NetworkTick()
        {
            if (Animals.NetworkReads == readsSeen) return;
            readsSeen = Animals.NetworkReads;
            int n = Animals.NetworkN, niv = Level(n), st = ScoreTier(Animals.AttackScore);
            if (netSeen >= 0 && niv > netSeen)
            {
                Hud.Feed("nft", $"The network awakens: {n} validators relit", $"the great diamond gains {MilestoneNames[niv - 1]}");
                Guide.Announce("The network awakens", $"{n} old validators relit");
                Sounds.Chime();
            }
            netSeen = niv;
            if (scoreSeen >= 0 && st > scoreSeen)
            {
                Hud.Feed("nft", $"The network held: defense score {Animals.AttackScore}", "the great diamond shifts color");
                Guide.Announce("The network held", $"defense score {Animals.AttackScore}");
                Sounds.Chime();
            }
            scoreSeen = st;
            Decor.StarsShown = niv;
            Decor.PaletteTier = st;
        }

        // ---------- the leaderboard's sign in the City (028_leaderboard.sql) ----------
        TextMesh lbLeft, lbRight;
        Material lbMat;
        float lbT = 3;
        static readonly (string key, string label, string color)[] LbSections = { ("gwei", "⚡ Gwei earned", "#ffd95e"), ("validators", "🛡 Validators kept active", "#7fe8ff"), ("defenses", "⚔ Attacks repelled", "#ff9ab8") };
        readonly Dictionary<string, List<(string name, int n)>> lb = new Dictionary<string, List<(string, int)>>();

        void BuildLeaderboard()
        {
            const float W = 1.6f, H = 2.4f;
            var C = new Vector3(EtherMines.Core.World.CITY.X - 7, EtherMines.Core.World.CITY.Y + 1 + H / 2, EtherMines.Core.World.CITY.Z + EtherMines.Core.World.CITY.R - 4);
            var root = new GameObject("leaderboard").transform;
            root.SetParent(transform, false);
            root.position = U(C);
            // a quad of white vertices (the shaders multiply the vertex color), facing Unity's -z
            var quad = new Mesh();
            quad.vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(-0.5f, 0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(0.5f, -0.5f, 0) };
            quad.colors = new[] { Color.white, Color.white, Color.white, Color.white };
            quad.triangles = new[] { 0, 1, 2, 0, 2, 3 };
            quad.RecalculateBounds();
            Transform Quad(string name, float w, float h, float z, Material m)
            {
                var go = new GameObject(name);
                go.AddComponent<MeshFilter>().sharedMesh = quad;
                go.AddComponent<MeshRenderer>();
                go.transform.SetParent(root, false);
                go.transform.localPosition = new Vector3(0, 0, z);
                go.transform.localScale = new Vector3(w, h, 1);
                var r = go.GetComponent<MeshRenderer>();
                r.sharedMaterial = m;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                return go.transform;
            }
            // tinted glass in a cyan frame on a cyan post, the HUD's own panel look (the game's +z faces Unity's -z)
            Quad("frame", W + 0.3f, H + 0.3f, 0.15f, Effects.Mat(Texture2D.whiteTexture, new Color(0.23f, 0.18f, 0.43f, 0.5f), false));
            Quad("edge", W + 0.06f, H + 0.06f, 0.02f, Effects.Mat(Texture2D.whiteTexture, Ui.Cyan, false));
            Quad("glass", W, H, 0, Effects.Mat(Texture2D.whiteTexture, new Color(0.2f, 0.15f, 0.4f, 0.92f), false));
            var post = new GameObject("post");
            post.AddComponent<MeshFilter>().sharedMesh = Decor.Box(1);
            post.AddComponent<MeshRenderer>();
            post.transform.SetParent(root, false);
            post.transform.localScale = new Vector3(0.5f, EtherMines.Core.World.CITY.Y + 1, 0.5f);
            post.transform.position = U(new Vector3(C.x, (EtherMines.Core.World.CITY.Y + 1) / 2f, C.z - 0.15f));
            var pm = new Material(Shader.Find("EtherMines/Unlit")); pm.color = Ui.Cyan;
            post.GetComponent<MeshRenderer>().sharedMaterial = pm;
            // the text: names on the left, numbers on the right, in the game's own font
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            lbMat = new Material(Shader.Find("EtherMines/Text"));
            lbMat.mainTexture = font.material.mainTexture;
            Font.textureRebuilt += f => { if (f == font && lbMat != null) lbMat.mainTexture = f.material.mainTexture; };
            TextMesh Text(string name, float x, float y, TextAnchor anchor, float size)
            {
                var go = new GameObject(name);
                go.transform.SetParent(root, false);
                go.transform.localPosition = new Vector3(x, y, -0.01f);
                var tm = go.AddComponent<TextMesh>();
                tm.font = font;
                tm.fontSize = 64;
                tm.characterSize = size;
                tm.anchor = anchor;
                tm.richText = true;
                tm.lineSpacing = 1.25f;
                tm.color = Ui.Paper;
                go.GetComponent<MeshRenderer>().sharedMaterial = lbMat;
                return tm;
            }
            var title = Text("title", 0, H / 2 - 0.12f, TextAnchor.UpperCenter, 0.016f);
            title.text = "NETWORK LEADERBOARD";
            title.color = Hex("#ffd95e");
            lbLeft = Text("names", -W / 2 + 0.12f, H / 2 - 0.36f, TextAnchor.UpperLeft, 0.0105f);
            lbRight = Text("numbers", W / 2 - 0.12f, H / 2 - 0.36f, TextAnchor.UpperRight, 0.0105f);
            DrawLeaderboard();
        }

        void DrawLeaderboard()
        {
            if (lbLeft == null) return;
            var l = new System.Text.StringBuilder(); var r = new System.Text.StringBuilder();
            foreach (var (key, label, color) in LbSections)
            {
                l.Append($"<b><color={color}>{label}</color></b>\n"); r.Append('\n');
                var rows = lb.TryGetValue(key, out var x) ? x : null;
                if (rows == null || rows.Count == 0) { l.Append("<color=#ffffff66>  — nobody yet —</color>\n"); r.Append('\n'); }
                else
                    for (int i = 0; i < rows.Count && i < 5; i++)
                    {
                        string c = i == 0 ? "#fff3c2" : "#f4f1ffd9";
                        l.Append($"<color={c}>  {i + 1}. {rows[i].name}</color>\n");
                        r.Append($"<color={c}>{rows[i].n}</color>\n");
                    }
                l.Append('\n'); r.Append('\n');
            }
            lbLeft.text = l.ToString();
            lbRight.text = r.ToString();
        }

        async void UpdateLeaderboard()
        {
            lbT = 60;
            if (Session == null) return;
            try
            {
                var res = await Session.Act("leaderboard", new Dictionary<string, object>(), 0, 0, 0);
                if (res == null || res.ContainsKey("refused")) return;
                foreach (var (key, _, _) in LbSections)
                {
                    var rows = new List<(string, int)>();
                    if (res.TryGetValue(key, out var o) && o is List<object> list)
                        foreach (var e in list) if (e is Dictionary<string, object> d) rows.Add((d.TryGetValue("name", out var nm) ? nm as string ?? "?" : "?", MiniJson.ToInt(d.TryGetValue("n", out var nn) ? nn : null)));
                    lb[key] = rows;
                }
                DrawLeaderboard();
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        // ---------- every frame ----------
        bool introChecked;
        float introAt = -1;

        void Start() { BuildLeaderboard(); }

        void Update()
        {
            if (Player == null || Player.Body == null) return;
            float dt = Time.deltaTime;
            // the intro, once ever, a moment after the world is in (seen.intro)
            if (!introChecked && !Ui.Paused && Player.Ready)
            {
                introChecked = true;
                if (Session != null && !Seen("intro")) { Mark("intro"); introAt = Time.time + 0.6f; }
            }
            if (introAt >= 0 && Time.time >= introAt) { introAt = -1; PlayIntro(Greet); }
            if (tipAt >= 0 && Time.time >= tipAt) { tipAt = -1; Hud.Feed("mint", "Mine a block", "it becomes a token in your chest"); }
            CineTick(dt);
            FinaleTick(dt);
            // the story is done, the finale not played: Thea calls you back to the Atrium (once a session)
            if (Session != null && Seen("epilogue") && !Seen("finale") && !fCalled && !fOn)
            {
                fCalled = true;
                if (FinaleDist() > FinaleR) Thea(EpilogueCall);
            }
            TheaNext();
            if (Animals != null) NetworkTick();
            if ((lbT -= dt) <= 0) UpdateLeaderboard();
        }

        // ---------- drawing: the cinematic's frame, the epilogue screen ----------
        GUIStyle sub, skip, kicker;

        void OnGUI()
        {
            Ui.Begin();
            if (sub == null)
            {
                sub = new GUIStyle(GUI.skin.label) { fontSize = 17, wordWrap = true, richText = true };
                sub.normal.textColor = Ui.Paper;
                skip = new GUIStyle(GUI.skin.button) { fontSize = 15, fontStyle = FontStyle.Bold };
                kicker = new GUIStyle(GUI.skin.label) { fontSize = 14, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
                kicker.normal.textColor = Ui.Gold;
            }
            GUI.depth = -20;
            float W = Ui.W, H = Ui.H;
            if (cine != null)
            {
                // letterboxed, the subtitles in the dialogue bubble's look, Skip
                float bar = H * 0.11f;
                Ui.Fill(new Rect(0, 0, W, bar), Color.black);
                Ui.Fill(new Rect(0, H - bar, W, bar), Color.black);
                if (said >= 0)
                {
                    var (_, _, who, text) = cine.Lines[said];
                    var h = Animals != null ? Animals.Thea : null;
                    int shown = Mathf.Min(text.Length, (int)((Time.time - saidAt) / 0.02f));
                    string head = who != null ? $"<b><color={(h != null && h.Name == who ? h.Color : "#7fe8ff")}>{who}</color></b>  <i><color=#c9c2f2>{(h != null && h.Name == who ? h.Role : "")}</color></i>\n" : "";
                    float bw = Mathf.Min(680, W - 40), bx = (W - bw) / 2;
                    float th = sub.CalcHeight(new GUIContent(head + text), bw - 32) + 16, by = H - bar - th - 14;
                    Ui.Chip(new Rect(bx, by, bw, th));
                    GUI.Label(new Rect(bx + 16, by + 8, bw - 32, th - 16), head + text.Substring(0, shown), sub);
                }
                var sa = Ui.Safe;
                if (GUI.Button(new Rect(sa.xMax - 120, sa.y + Mathf.Max(12, bar / 2 - 18), 100, 36), "Skip ›", skip)) CineSkip();
                return;
            }
            if (fShown && !fDone)
            {
                // the epilogue screen: impossible to miss
                Ui.Fill(new Rect(0, 0, W, H), new Color(0.04f, 0.03f, 0.1f, 0.78f));
                var p = Progress != null ? Progress() : null;
                float w = Mathf.Min(600, W - 32), x = (W - w) / 2, ch = Mathf.Min(H - 32, 520), y = (H - ch) / 2;
                Ui.Chip(new Rect(x, y, w, ch), Ui.Gold);
                GUI.BeginGroup(new Rect(x + 20, y + 14, w - 40, ch - 28));
                GUI.Label(new Rect(0, 0, w - 40, 22), "THE END · OF THE BEGINNING", kicker);
                float yy = p != null ? DrawEpilogue(p, w - 40, 30, false) : 30;
                if (GUI.Button(new Rect((w - 40) / 2 - 110, Mathf.Min(yy + 12, ch - 28 - 44), 220, 40), "Back to the world", skip)) CloseFinale();
                GUI.EndGroup();
            }
        }

        // the epilogue card (epilogueCard): in the Objectives tab for good, and on the finale's screen
        public static float DrawEpilogue(Progress p, float w, float y, bool replay = true)
        {
            var me = I;
            int g = 0; foreach (var t in Tiers) if (t > Animals.NetworkN) { g = t; break; }
            var next = new List<string>();
            if (!p.CircuitsDone) next.Add("Finish the Circuits side chapter: the Circuits Complex, east of the Atrium, shows every gate trick.");
            if (g > 0) next.Add($"Help the whole world relight {g} old validators, so the great diamond in the sky wakes a little more.");
            next.Add("Defend the Atrium when corrupted nodes attack, every hour on the hour.");
            next.Add("The towers, the Genesis Titan and the Merge twins wait for a rematch.");
            next.Add("Build something that lasts: /claim a plot, and every block you place carries your name.");
            float iw = w - 24;
            float ht = Ui.Small.CalcHeight(new GUIContent(EpilogueText), iw), hn = 0;
            foreach (var n in next) hn += Ui.Small.CalcHeight(new GUIContent("• " + n), iw - 8) + 2;
            bool canReplay = replay && me != null && me.Seen("finale") && !me.fOn;
            float h = 34 + ht + 10 + 54 + 10 + 24 + hn + (canReplay ? 42 : 0) + 10;
            Ui.Fill(new Rect(0, y, w, h), new Color(1f, 0.85f, 0.37f, 0.08f));
            Ui.Fill(new Rect(0, y, 4, h), Ui.Gold);
            float yy = y + 6;
            GUI.Label(new Rect(12, yy, iw, 26), "Epilogue · The network holds", Ui.Title);
            yy += 30;
            GUI.Label(new Rect(12, yy, iw, ht), EpilogueText, Ui.Small);
            yy += ht + 10;
            var stats = new[] { ($"{p.MainsDone}/{p.MainsCount}", "chapters"), ($"{p.Relit}", "validators relit"), ($"{p.Guardians}/3", "guardians defeated"), ($"{p.DaysHere}", "days in this world") };
            float sw = (iw - 18) / 4;
            for (int i = 0; i < 4; i++)
            {
                var r = new Rect(12 + i * (sw + 6), yy, sw, 50);
                Ui.Fill(r, new Color(1, 1, 1, 0.07f));
                GUI.Label(new Rect(r.x, r.y + 4, r.width, 24), $"<b><color=#ffd95e>{stats[i].Item1}</color></b>", new GUIStyle(Ui.Label) { alignment = TextAnchor.MiddleCenter, fontSize = 18 });
                GUI.Label(new Rect(r.x, r.y + 28, r.width, 18), stats[i].Item2, new GUIStyle(Ui.Small) { alignment = TextAnchor.MiddleCenter, fontSize = 11 });
            }
            yy += 60;
            GUI.Label(new Rect(12, yy, iw, 22), "<b>What now?</b>", Ui.Label);
            yy += 24;
            foreach (var n in next)
            {
                float lh = Ui.Small.CalcHeight(new GUIContent("• " + n), iw - 8);
                GUI.Label(new Rect(20, yy, iw - 8, lh), "• " + n, Ui.Small);
                yy += lh + 2;
            }
            if (canReplay && GUI.Button(new Rect(12, yy + 6, 280, 32), "Replay the finale at the Atrium", Ui.Button)) me.Replay();
            return y + h;
        }
    }
}
