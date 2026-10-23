// Ether Mines · the weather (Unity only; the web has none): some days a shower comes and goes, the same for
// every Unity player of a world since it follows the world's own clock (Sky.DayN). Rain in the plains and
// forests, snow up high or on snow, none over the dunes. The sky greys, the fog closes in, the sun dims;
// drops stop on the first roof above them; a soft hiss, and now and then distant thunder. Nothing about
// the game changes. Settings → Weather turns it off.
using System;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Weather : MonoBehaviour
    {
        public WorldView World;
        public PlayerController Player;
        public Sky Sky;

        const string Key = "ether-mines:weather";
        public static bool On { get; private set; } = true;
        public static void Toggle() { On = !On; PlayerPrefs.SetString(Key, On ? "1" : "0"); }

        // how much it rains (or snows) here, now: 0..1 (Sky and Effects read it)
        public static float Rain, Snow;
        static readonly System.Random rnd = new System.Random();
        static float R() => (float)rnd.NextDouble();

        Effects.Specks drops;
        sealed class Drop { public float X, Y, Z, Floor, Vx; public bool Live; }
        Drop[] all;
        AudioSource hiss;
        float thunderT = 20, k;

        void Awake()
        {
            On = PlayerPrefs.GetString(Key, "1") != "0";
            int n = TouchPad.Active ? 160 : 360;
            all = new Drop[n];
            for (int i = 0; i < n; i++) all[i] = new Drop();
            drops = new Effects.Specks("weather", n, Texture2D.whiteTexture, false, transform);
            var data = Hiss(2);
            var clip = AudioClip.Create("rain", data.Length, 1, Synth.Rate, false);
            clip.SetData(data, 0);
            hiss = gameObject.AddComponent<AudioSource>();
            hiss.clip = clip;
            hiss.loop = true;
            hiss.volume = 0;
            hiss.playOnAwake = false;
        }

        // the rain's hiss: soft noise, its highs and lows taken off, a loop whose end fades into its start
        static float[] Hiss(float seconds)
        {
            int n = (int)(seconds * Synth.Rate), fade = Synth.Rate / 5;
            var full = new float[n + fade];
            double lo = 0, hi = 0;
            for (int i = 0; i < full.Length; i++)
            {
                double x = rnd.NextDouble() * 2 - 1;
                lo += (x - lo) * 0.18;        // a gentle lowpass (about 1.4 kHz)
                hi += (lo - hi) * 0.02;       // minus its own lows (a highpass at about 140 Hz)
                full[i] = (float)((lo - hi) * 0.5);
            }
            var o = new float[n];
            Array.Copy(full, o, n);
            for (int i = 0; i < fade; i++) { float a = i / (float)fade; o[i] = o[i] * a + full[n + i] * (1 - a); }
            return o;
        }

        // the day's shower, from the day's number: about one day in four, somewhere in its daytime or night
        public static float Shower(int dayN, float t)
        {
            uint h = (uint)dayN * 2654435761u ^ 0x9e3779b9u;
            h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
            if ((h & 255) > 64) return 0;
            float start = 0.05f + ((h >> 8) & 255) / 255f * 0.6f, len = 0.12f + ((h >> 16) & 255) / 255f * 0.25f;
            float x = (t - start) / len;
            if (x <= 0 || x >= 1) return 0;
            return Mathf.Clamp01(Mathf.Min(x, 1 - x) * 6); // in and out softly
        }

        int Top(int x, int z)
        {
            for (int y = EtherMines.Core.World.SY - 1; y > 0; y--) { int id = World.Get(x, y, z); if (id != 0 && Mesher.IsSolid(id) || id == 11) return y + 1; }
            return 0;
        }

        void Update()
        {
            var p = Player != null ? Player.Body : null;
            var cam = Player != null ? Player.Cam : null;
            if (p == null || cam == null || Sky == null) return;
            float dt = Time.deltaTime;
            float target = On ? Shower(Sky.DayN, Sky.Day) : 0;
            // none over the dunes; snow up high or where it's snowy underfoot
            bool dunes = EtherMines.Core.World.BiomeId(p.X, p.Z) == EtherMines.Core.World.DUNES;
            int under = World.Get((int)Math.Floor(p.X), (int)Math.Floor(p.Y - 0.1), (int)Math.Floor(p.Z));
            bool cold = p.Y > 46 || under == 16 || under == 71;
            if (dunes) target = 0;
            k += (target - k) * Mathf.Min(1, dt / 3);
            Rain = cold ? 0 : k;
            Snow = cold ? k : 0;
            Shader.SetGlobalFloat("_EM_WindK", 1 + k * 0.9f); // a shower blows harder in the trees (EtherLit.hlsl)
            hiss.volume = Rain * 0.35f * (Sounds.On ? 1 : 0);
            if (Rain > 0.02f && !hiss.isPlaying) hiss.Play();
            else if (Rain <= 0.02f && hiss.isPlaying) hiss.Stop();
            // distant thunder in a heavy shower
            if (Rain > 0.8f && (thunderT -= dt) <= 0)
            {
                thunderT = 14 + R() * 30;
                Sounds.Thunder();
            }

            // the drops (or flakes) around the camera, each stopping on the first roof or ground below it
            int live = (int)(all.Length * k);
            var cp = cam.transform.position;
            Vector3 right = cam.transform.right, up = Vector3.up;
            var col = cold ? new Color(1, 1, 1, 0.85f) : new Color(0.75f, 0.8f, 0.95f, 0.45f);
            for (int i = 0; i < all.Length; i++)
            {
                var d = all[i];
                if (i >= live) { d.Live = false; drops.Hide(i); continue; }
                if (!d.Live || d.Y < d.Floor || Mathf.Abs(d.X - cp.x) > 18 || Mathf.Abs(d.Z + cp.z) > 18)
                {
                    float a = R() * Mathf.PI * 2, r = Mathf.Sqrt(R()) * 16;
                    d.X = cp.x + Mathf.Cos(a) * r;
                    d.Z = -cp.z + Mathf.Sin(a) * r;
                    d.Floor = Top((int)Math.Floor(d.X), (int)Math.Floor(d.Z));
                    d.Y = Mathf.Max(d.Floor, cp.y + 4 + R() * 10);
                    d.Vx = (R() - 0.5f) * 0.6f;
                    d.Live = true;
                    if (d.Floor > cp.y + 12) { d.Live = false; drops.Hide(i); continue; } // under a deep roof: none here
                }
                if (cold) { d.Y -= dt * 1.6f; d.X += (Mathf.Sin(Time.time * 1.3f + i) * 0.4f + d.Vx) * dt; }
                else d.Y -= dt * 16;
                var at = new Vector3(d.X, d.Y, -d.Z);
                if (cold) drops.Set(i, at, 0.07f, 0.07f, col, new Rect(0, 0, 1, 1), right, cam.transform.up);
                else drops.Set(i, at, 0.018f, 0.55f, col, new Rect(0, 0, 1, 1), right, up);
            }
            drops.Apply();
        }
    }
}
