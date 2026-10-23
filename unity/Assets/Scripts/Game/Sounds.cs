// Ether Mines · the sounds (src/audio.js): every one made by Core.Synth from the web version's own recipes,
// no audio file. Footsteps, mining, breaking and placing by material, doors, plates, the pistol, blows,
// the animals' calls, chimes; and the ambiance: a slow D-lydian chord pad and music-box bells through a
// hall, birds by day, crickets by night, drips underground, muffled under water. What happens somewhere
// (a block broken by someone else, an animal calling, a mob, a door) is heard from there: Unity places it
// in the space around you. M (or the window's sound button) turns it all off, as the web's setting.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Sounds : MonoBehaviour
    {
        public static Sounds I;
        public PlayerController Player;
        public Sky Sky;

        const string Key = "ether-mines:son"; // the web's own setting name
        public static bool On { get; private set; } = true;
        static readonly System.Random rnd = new System.Random();
        static float R() => (float)rnd.NextDouble();

        // the sources: the effects (flat, or placed in the world), the ambiance's bells and the pad
        sealed class Voice { public AudioSource S; public AudioClip Clip; public float Until; }
        readonly List<Voice> sfx = new List<Voice>(), amb = new List<Voice>(), pad = new List<Voice>();
        readonly List<AudioLowPassFilter> padLP = new List<AudioLowPassFilter>();
        float ambGain, lpFreq = 1200, birdT = 3, padT, bellT;
        int chordIdx;
        readonly Queue<(float[] data, string name)> padReady = new Queue<(float[], string)>();

        public static void Toggle()
        {
            On = !On;
            PlayerPrefs.SetString(Key, On ? "1" : "0");
            AudioListener.volume = On ? 1 : 0;
        }

        void Awake()
        {
            I = this;
            On = PlayerPrefs.GetString(Key, "1") != "0";
            AudioListener.volume = On ? 1 : 0;
            for (int i = 0; i < 20; i++) sfx.Add(new Voice { S = Source("sfx", false) });
            for (int i = 0; i < 8; i++) amb.Add(new Voice { S = Source("ambiance", true) });
            for (int i = 0; i < 3; i++)
            {
                var v = new Voice { S = Source("pad", true) };
                padLP.Add(v.S.gameObject.AddComponent<AudioLowPassFilter>());
                pad.Add(v);
            }
            padT = 3 + R() * 6; // not the instant you spawn
            bellT = padT + 0.5f;
        }

        AudioSource Source(string name, bool hall)
        {
            var go = new GameObject("sound " + name);
            go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>();
            s.playOnAwake = false;
            s.spatialBlend = 0;
            if (hall)
            {
                // the ambiance's hall (a convolution reverb on the web): long, soft, mostly dry
                var r = go.AddComponent<AudioReverbFilter>();
                r.reverbPreset = AudioReverbPreset.User;
                r.dryLevel = 0;
                r.room = -1300;
                r.decayTime = 3.2f;
                r.reflectionsLevel = -2000;
                r.reverbLevel = -200;
            }
            return s;
        }

        static AudioClip Clip(float[] data, string name)
        {
            var c = AudioClip.Create(name, data.Length, 1, Synth.Rate, false);
            c.SetData(data, 0);
            return c;
        }

        // plays one sound: flat (yours), or from a place in the world (game coordinates)
        static void Play(List<Voice> pool, Synth s, string name, float volume, Vector3? at = null, float range = 26)
        {
            if (I == null || !On) return;
            var data = s.Render(rnd);
            Voice v = null;
            foreach (var p in pool) if (Time.time >= p.Until) { v = p; break; }
            if (v == null) { v = pool[0]; foreach (var p in pool) if (p.Until < v.Until) v = p; }
            v.S.Stop();
            if (v.Clip != null) Destroy(v.Clip);
            v.Clip = Clip(data, name);
            v.Until = Time.time + data.Length / (float)Synth.Rate + 0.1f;
            v.S.clip = v.Clip;
            v.S.volume = volume;
            if (at is Vector3 g)
            {
                v.S.spatialBlend = 1;
                v.S.rolloffMode = AudioRolloffMode.Linear;
                v.S.minDistance = 2;
                v.S.maxDistance = range;
                v.S.dopplerLevel = 0;
                v.S.transform.position = new Vector3(g.x, g.y, -g.z);
            }
            else v.S.spatialBlend = 0;
            v.S.Play();
        }
        static void Fx(Synth s, string name, Vector3? at = null) => Play(I?.sfx, s, name, 0.55f, at);

        // ---------- materials (02-blocks.js MAT_OF): [filter, frequency, Q, decay] ----------
        public static string MatOf(int id)
        {
            if (id == 72 || id == 73 || id == 74) return "stone";
            if (id == 1 || id == 2 || id == 6 || id == 7 || (id >= 17 && id <= 20) || id == 125) return "grass";
            if (id == 4) return "sand";
            if (id == 16 || id == 71) return "snow";
            if (id == 5 || id == 9 || id == 33 || (id >= 36 && id <= 39) || id == 82 || id == 92 || (id >= 94 && id <= 98) || id == 124 || (id >= 48 && id <= 63)) return "wood";
            if (id == 10 || id == 14 || id == 68 || (id >= 29 && id <= 32)) return "glass";
            return "stone";
        }
        static (Synth.Filt f, double freq, double q, double d) M(string k)
        {
            switch (k)
            {
                case "grass": return (Synth.Filt.Bandpass, 900, 0.8, 0.09);
                case "sand": return (Synth.Filt.Highpass, 2400, 0.5, 0.1);
                case "snow": return (Synth.Filt.Highpass, 3200, 0.7, 0.12);
                case "wood": return (Synth.Filt.Bandpass, 520, 3, 0.08);
                case "glass": return (Synth.Filt.Bandpass, 3800, 6, 0.07);
                default: return (Synth.Filt.Bandpass, 1500, 1.6, 0.06);
            }
        }
        static double J(double v) => v * (0.85 + R() * 0.3);
        const Synth.Wave Sine = Synth.Wave.Sine, Square = Synth.Wave.Square, Saw = Synth.Wave.Sawtooth, Tri = Synth.Wave.Triangle;

        public static void Step(string k)
        {
            var (f, fr, q, d) = M(k);
            var s = new Synth().Noise(f, J(fr), q, 0.22, d);
            if (k == "wood") s.Tone(J(130), Sine, 0.08, 0.06);
            Fx(s, "step");
        }
        public static void Hit(string k, Vector3? at = null)
        {
            var (f, fr, q, d) = M(k);
            var s = new Synth().Noise(f, J(fr * 1.3), q + 1, 0.3, d * 0.8);
            if (k == "stone" || k == "glass") s.Tone(J(k == "glass" ? 2200 : 900), Tri, 0.05, 0.05);
            Fx(s, "hit", at);
        }
        public static void Brk(string k, Vector3? at = null)
        {
            var (f, fr, q, d) = M(k);
            var s = new Synth().Noise(f, fr, q, 0.45, d * 2.6).Noise(Synth.Filt.Lowpass, fr * 0.5, 1, 0.3, d * 3, 0.02, 0.7);
            if (k == "glass") for (int i = 0; i < 5; i++) s.Tone(2000 + R() * 2500, Sine, 0.06, 0.18, i * 0.025);
            if (k == "stone") s.Tone(95, Sine, 0.18, 0.15, 0, 0.6);
            Fx(s, "break", at);
        }
        public static void Place(string k, Vector3? at = null)
        {
            var (f, fr, q, d) = M(k);
            Fx(new Synth().Noise(f, fr * 0.8, q, 0.35, d * 1.4).Tone(k == "glass" ? 1400 : k == "wood" ? 180 : 220, Sine, 0.16, 0.1, 0, 0.7), "place", at);
        }
        // pure ether, crystal: a pentatonic arpeggio
        static float chimeAt = -9;
        public static void Chime()
        {
            if (Time.time - chimeAt < 0.3f) return; // several rewards at once: one chime
            chimeAt = Time.time;
            var s = new Synth();
            int[] st = { 0, 4, 7, 11, 14 };
            for (int i = 0; i < st.Length; i++) s.Tone(880 * Math.Pow(2, st[i] / 12.0), Sine, 0.09, 0.9, i * 0.06, 0, 0.01);
            Fx(s, "chime");
        }
        public static void Theme() { var s = new Synth(); Signature(s, 0, 0.16, R() < 0.5 ? 0 : 1); Fx(s, "theme"); }
        public static void Click() => Fx(new Synth().Tone(1800, Square, 0.05, 0.02).Noise(Synth.Filt.Bandpass, 3000, 4, 0.25, 0.03).Tone(420, Tri, 0.08, 0.06, 0.03), "click");
        public static void Blip() => Fx(new Synth().Tone(880 + R() * 180, Tri, 0.17, 0.06), "blip");
        public static void Plate(Vector3? at = null) => Fx(new Synth().Noise(Synth.Filt.Lowpass, 400, 1, 0.4, 0.08).Tone(160, Sine, 0.15, 0.1, 0, 0.8), "plate", at);
        public static void Hurt() => Fx(new Synth().Noise(Synth.Filt.Bandpass, 700, 1.2, 0.4, 0.18).Tone(220, Saw, 0.12, 0.22, 0, 0.5), "hurt");
        public static void Shoot(Vector3? at = null) => Fx(new Synth().Tone(1900, Saw, 0.14, 0.1, 0, 0.28, 0.002).Noise(Synth.Filt.Highpass, 3000, 2, 0.12, 0.05), "shoot", at);
        public static void Door(Vector3? at = null) => Fx(new Synth().Noise(Synth.Filt.Bandpass, 380, 2.5, 0.35, 0.22, 0, 0.8).Tone(110, Saw, 0.03, 0.25, 0, 1.3, 0.03).Noise(Synth.Filt.Lowpass, 250, 1, 0.4, 0.08, 0.22), "door", at);

        // distant thunder (the weather, Unity only): a long low rumble, a crack in it
        public static void Thunder()
        {
            var s = new Synth().Noise(Synth.Filt.Lowpass, 110, 0.5, 0.7, 2.6, 0, 0.5).Noise(Synth.Filt.Lowpass, 320, 0.5, 0.35, 1.1, 0.12, 0.7).Noise(Synth.Filt.Lowpass, 90, 0.5, 0.5, 3.2, 0.6, 0.4);
            Play(I?.amb, s, "thunder", 0.6f);
        }

        // the animals' and mobs' calls (on the web, softer with distance: here, from where they are)
        public static void Animal(string type, Vector3? at = null)
        {
            var s = new Synth();
            double P(int st) => Math.Pow(2, st / 12.0);
            switch (type)
            {
                case "rabbit": s.Tone(1900, Sine, 0.08, 0.07, 0, 1.3).Tone(2300, Sine, 0.05, 0.05, 0.09, 1.2); break;
                case "fox": s.Tone(720, Square, 0.05, 0.1, 0, 1.5).Tone(760, Square, 0.05, 0.1, 0.16, 1.45); break;
                case "fish": for (int i = 0; i < 3; i++) s.Tone(420 + i * 140, Sine, 0.06, 0.06, i * 0.07, 2); break;
                case "cat": s.Tone(620, Tri, 0.05, 0.35, 0, 1.35).Tone(880, Sine, 0.04, 0.25, 0.05, 0.75); break;
                case "shiba": s.Tone(330, Square, 0.02, 0.09, 0, 0.7).Tone(360, Square, 0.02, 0.09, 0.18, 0.7); break;
                case "robot": { int[] st = { 0, 4, 7, 12 }; for (int i = 0; i < 4; i++) s.Tone(520 * P(st[i]), Square, 0.01, 0.06, i * 0.08, 1); break; }
                case "villager": { int[] st = { 0, 3, -2, 5 }; for (int i = 0; i < 4; i++) s.Tone(300 * P(st[i]), Tri, 0.01, 0.07, i * 0.07, 0.6); break; }
                case "jellyfish": { int[] st = { 0, 7, 12 }; for (int i = 0; i < 3; i++) s.Tone(660 * P(st[i]), Sine, 0.05, 1.2, i * 0.12, 1, 0.05); break; }
                case "shadow": s.Tone(180, Sine, 0.06, 0.5, 0, 0.55, 0.08).Noise(Synth.Filt.Bandpass, 260, 2, 0.12, 0.4, 0.05); break;
                case "guardian":
                    { int[] st = { 0, -3, -7 }; for (int i = 0; i < 3; i++) s.Tone(140 * P(st[i]), Square, 0.05, 0.18, i * 0.09, 0.8); s.Noise(Synth.Filt.Lowpass, 500, 1, 0.2, 0.3); break; }
                case "sentinel":
                    { int[] st = { 0, 5, 9 }; for (int i = 0; i < 3; i++) s.Tone(900 * P(st[i]), Sine, 0.04, 0.3, i * 0.05, 1.1, 0.02); s.Noise(Synth.Filt.Highpass, 1800, 1.5, 0.08, 0.2); break; }
                case "wraith":
                    { int[] st = { 0, -5, -9, -12 }; for (int i = 0; i < 4; i++) s.Tone(100 * P(st[i]), Saw, 0.05, 0.3, i * 0.1, 0.7); s.Noise(Synth.Filt.Lowpass, 300, 1, 0.25, 0.5); break; }
                default: return;
            }
            Fx(s, "call " + type, at);
        }

        // ---------- the ambiance (ported from L'Atrium) ----------
        static double Midi(int n) => 440 * Math.Pow(2, (n - 69) / 12.0);
        static readonly int[][] Chords = { new[] { 50, 57, 62, 64, 69 }, new[] { 47, 54, 57, 62, 66 }, new[] { 43, 50, 57, 61, 66 }, new[] { 45, 52, 57, 59, 64 } };
        static readonly int[] Bell = { 74, 76, 78, 81, 83, 85, 86, 88, 90, 93 };
        static readonly (int[] idx, int home)[] Motifs = { (new[] { 0, 2, 4, 6 }, 0), (new[] { 6, 4, 2, 0 }, 2) };
        static void BellTone(Synth s, int n, double t, double gain = 0.065)
        {
            double f = Midi(n);
            s.Tone(f, Sine, gain, 2.4, t);
            s.Tone(f * 2.01, Sine, gain * 0.35, 1.2, t);
        }
        // the game's signature: a fixed flourish, a breath, then the bell that resolves it
        static void Signature(Synth s, double t, double gain, int which)
        {
            var (idx, home) = Motifs[which];
            for (int i = 0; i < idx.Length; i++) BellTone(s, Bell[idx[i]], t + i * 0.2, gain - i * 0.004);
            BellTone(s, Bell[home], t + idx.Length * 0.2 + 0.85, gain * 1.3);
        }
        void Amb(Synth s, string name) => Play(amb, s, name, 0.48f * ambGain);

        void Update()
        {
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool m = k != null && k.mKey.wasPressedThisFrame;
#else
            bool m = Input.GetKeyDown(KeyCode.M);
#endif
            if (m && !Ui.Blocking) Toggle();
            var b = Player != null ? Player.Body : null;
            if (b == null || !On) return;
            float dt = Time.deltaTime;
            ambGain += (1 - ambGain) * Mathf.Min(1, dt / 1.5f);
            float ang = ((Sky != null ? Sky.Day : 0.5f) - 0.25f) * Mathf.PI * 2, night = Mathf.Clamp01(-Mathf.Sin(ang) / 1.0595f * 4);
            int fx = (int)Math.Floor(b.X), fz = (int)Math.Floor(b.Z);
            bool under = b.Y + 1 < World.HeightAt(fx, fz) - 3, water = b.InWater;
            // the pad is muffled under water and underground, brighter by day
            float target = water ? 380 : under ? 600 : 900 + (1 - night) * 900;
            lpFreq += (target - lpFreq) * Mathf.Min(1, dt / 0.8f);
            foreach (var f in padLP) f.cutoffFrequency = lpFreq;
            foreach (var v in pad) v.S.volume = 0.48f * ambGain;
            if ((birdT -= dt) <= 0)
            {
                birdT = 1.5f + R() * 5;
                if (under) Amb(new Synth().Tone(900 + R() * 900, Sine, 0.05, 0.18, 0, 0.55, 0.002), "drip");
                else if (night < 0.4f && R() < 0.8f)
                {
                    var s = new Synth();
                    int n = 2 + rnd.Next(4);
                    double bs = 2200 + R() * 1400;
                    for (int i = 0; i < n; i++) s.Tone(bs * (1 + R() * 0.25), Sine, 0.03, 0.07, i * 0.11, 1.4 + R() * 0.4, 0.01);
                    Amb(s, "bird");
                }
                else if (night > 0.6f)
                {
                    var s = new Synth();
                    double f = 4200 + R() * 600;
                    for (int i = 0; i < 3; i++) for (int j = 0; j < 4; j++) s.Tone(f, Square, 0.006, 0.012, i * 0.18 + j * 0.024);
                    Amb(s, "cricket");
                }
            }
            // the music-box sparkle, the signature woven in now and then
            if ((bellT -= dt) <= 0)
            {
                bellT = 0.9f + R() * 1.8f;
                var s = new Synth();
                if (R() < 0.08f) Signature(s, 0, 0.12, R() < 0.5 ? 0 : 1);
                else
                {
                    if (R() < 0.7f) BellTone(s, Bell[rnd.Next(Bell.Length)], R() * 0.2);
                    if (R() < 0.25f) BellTone(s, Bell[rnd.Next(Bell.Length)] - 12, 0.45, 0.07);
                }
                if (s.Length > 0) Amb(s, "bells");
            }
            // a slow chord swell every 8 s, made away from the game's thread (12 s of five notes, two voices each)
            if ((padT -= dt) <= 0)
            {
                padT = 8;
                var ch = Chords[chordIdx++ % Chords.Length];
                Task.Run(() =>
                {
                    var s = new Synth();
                    for (int i = 0; i < ch.Length; i++)
                        foreach (var det in new[] { -4, 4 })
                            s.Swell(Midi(ch[i]) * Math.Pow(2, det / 1200.0), i == 0 ? Sine : Tri, 0.024, 0, 3, 7, 11.5);
                    var data = s.Render(new System.Random());
                    lock (padReady) padReady.Enqueue((data, "pad"));
                });
            }
            lock (padReady)
                while (padReady.Count > 0)
                {
                    var (data, name) = padReady.Dequeue();
                    Voice v = null;
                    foreach (var p in pad) if (Time.time >= p.Until) { v = p; break; }
                    if (v == null) continue;
                    if (v.Clip != null) Destroy(v.Clip);
                    v.Clip = Clip(data, name);
                    v.Until = Time.time + 12.1f;
                    v.S.clip = v.Clip;
                    v.S.volume = 0.48f * ambGain;
                    v.S.Play();
                }
        }
    }
}
