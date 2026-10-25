// Ether Mines · combat feel (23-combat-fx.js): how a fight looks, on top of what it does. Blows chained
// within a moment run a combo of three swings (a slash from the right, a backhand from the left, an
// overhead chop), each with its arc across the screen; a blow that lands holds the hand still a few
// hundredths of a second and shakes the view a little (more on a critical blow), and its damage rises
// from the mob; a struck mob squashes; a mob that falls tips over as it bursts (Mobs); a blow you take
// knocks your head aside, away from it. Nothing here changes a number of the fight: it is all drawn.
using System.Collections.Generic;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class CombatFx : MonoBehaviour
    {
        public static CombatFx I;
        public PlayerController Player;
        void Awake() => I = this;

        // ---------- the combo ----------
        const float ComboGap = 0.95f; // seconds between two blows that still chain
        static int comboN;
        static float comboAt = -9;
        public static int ComboVar { get; private set; }
        // the arm's swing for each blow, on a character (poseArms): x, z, the body's twist, in the web's radians
        public static readonly float[][] ComboArm = { new[] { 1.55f, -0.28f, -0.3f }, new[] { 1.3f, 0.42f, 0.35f }, new[] { 2.5f, -0.12f, 0f } };
        public static float HitStop;  // seconds the hand stays frozen where the blow landed (Interaction)
        static float arcAt = -9;
        static int arcV;

        // a blow goes (Combat: on a mob, a player, an animal): the next one of the combo, or the first again
        public static void ComboStep(bool blade)
        {
            comboN = Time.time - comboAt < ComboGap ? comboN + 1 : 0;
            comboAt = Time.time;
            ComboVar = comboN % 3;
            if (blade) { arcAt = Time.time; arcV = ComboVar; }
        }
        public static int ComboV(bool blade) => blade && Time.time - comboAt < ComboGap ? ComboVar : 0;

        // a blow landed: the hand holds still a moment, the view shakes
        public static void BlowLanded(bool crit)
        {
            HitStop = crit ? 0.09f : 0.05f;
            Shake(crit ? 0.018f : 0.008f);
        }

        // ---------- the view: a shake when a blow lands, a knock when you take one ----------
        static float shake, roll, lift;
        public static void Shake(float a) => shake = Mathf.Max(shake, a);
        // a blow from (mx, mz), game coordinates: the head knocked aside, away from it, and up a little
        public static void Knock(double px, double pz, double yaw, double mx, double mz, bool blocked)
        {
            double dx = mx - px, dz = mz - pz, d = System.Math.Sqrt(dx * dx + dz * dz);
            if (d < 1e-6) d = 1;
            float side = (float)((dx * System.Math.Cos(yaw) - dz * System.Math.Sin(yaw)) / d), k = blocked ? 0.4f : 1;
            roll = side * 0.1f * k;
            lift = 0.05f * k;
            Shake(0.012f * k);
        }
        // the turn to add to the first-person camera (PlayerController), in Unity's frame: the web's
        // rotation.x (up) and .y are mirrored, its roll (z) stays
        public static Quaternion View()
        {
            if (shake < 0.0005f && Mathf.Abs(roll) < 0.0005f && lift < 0.0005f) return Quaternion.identity;
            float sx = lift + (Random.value - 0.5f) * 2 * shake, sy = (Random.value - 0.5f) * 2 * shake;
            return Quaternion.Euler(-sx * Mathf.Rad2Deg, -sy * Mathf.Rad2Deg, roll * Mathf.Rad2Deg);
        }

        // ---------- the damage rising from a mob ----------
        struct Num { public Vector3 At; public string Text; public bool Crit; public float T, Dx; }
        static readonly List<Num> nums = new List<Num>();
        // at: game coordinates, over the mob's head
        public static void Damage(Vector3 at, double dmg, bool crit)
        {
            if (dmg <= 0) return;
            nums.Add(new Num { At = at, Text = Mathf.Max(1, Mathf.RoundToInt((float)dmg)).ToString(), Crit = crit, Dx = Random.Range(-0.25f, 0.25f) });
        }

        void Update()
        {
            float dt = Time.deltaTime;
            HitStop = Mathf.Max(0, HitStop - dt);
            shake *= Mathf.Exp(-dt * 22);
            roll *= Mathf.Exp(-dt * 7);
            lift *= Mathf.Exp(-dt * 9);
            for (int i = nums.Count - 1; i >= 0; i--)
            {
                var n = nums[i];
                n.T += dt;
                if (n.T >= 0.85f) nums.RemoveAt(i); else nums[i] = n;
            }
        }

        // ---------- drawn over the view: the arc of a swing, the numbers ----------
        static Texture2D arcTex;
        // a crescent (the web's ring from 0.14π to 0.86π, radius 0.2 to 0.232): bright in its middle, fading
        // at its two ends and its two edges
        static Texture2D ArcTex()
        {
            if (arcTex != null) return arcTex;
            const int N = 256;
            arcTex = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color[N * N];
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N * 2 - 1, v = (y + 0.5f) / N * 2 - 1, r = Mathf.Sqrt(u * u + v * v), a = Mathf.Atan2(v, u) / Mathf.PI;
                    float band = 1 - Mathf.Abs(r - 0.93f) / 0.07f, ends = Mathf.Clamp01(Mathf.Min(a - 0.14f, 0.86f - a) / 0.12f);
                    float k = Mathf.Clamp01(band) * ends;
                    px[y * N + x] = new Color(0.85f, 0.96f, 1f, k);
                }
            arcTex.SetPixels(px);
            arcTex.Apply();
            return arcTex;
        }
        GUIStyle numStyle;
        void OnGUI()
        {
            if (Ui.Cine || Player == null || Player.Cam == null) return;
            Ui.Begin();
            float t = (Time.time - arcAt) / 0.18f;
            if (Player.View == 0 && t >= 0 && t < 1)
            {
                // the slash sweeps over the top, the backhand the other way, the chop down the right
                float a = Mathf.Sin(t * Mathf.PI) * 0.42f, size = Ui.H * (0.62f + t * 0.16f);
                var c = new Vector2(Ui.W / 2 + (arcV == 2 ? Ui.H * 0.06f : 0), Ui.H / 2 + Ui.H * 0.12f);
                var m = GUI.matrix;
                GUIUtility.RotateAroundPivot(arcV == 2 ? 90 : arcV == 1 ? -11 : 11, c * Ui.Scale);
                var o = GUI.color;
                GUI.color = new Color(1, 1, 1, a);
                var r = new Rect(c.x - size / 2, c.y - size / 2 * 0.88f, size, size * 0.88f);
                if (arcV == 1) r = new Rect(r.xMax, r.y, -r.width, r.height); // mirrored
                GUI.DrawTexture(r, ArcTex());
                GUI.color = o;
                GUI.matrix = m;
            }
            if (nums.Count == 0) return;
            if (numStyle == null) numStyle = new GUIStyle(GUI.skin.label) { font = Ui.SansBold, alignment = TextAnchor.MiddleCenter };
            foreach (var n in nums)
            {
                float k = n.T / 0.85f, rise = (1 - (1 - k) * (1 - k)) * 0.8f;
                var w = new Vector3(n.At.x + n.Dx, n.At.y + rise, -n.At.z);
                var s = Player.Cam.WorldToScreenPoint(w);
                if (s.z <= 0) continue;
                float x = s.x / Ui.Scale, y = Ui.H - s.y / Ui.Scale, alpha = k < 0.6f ? 1 : 1 - (k - 0.6f) / 0.4f;
                numStyle.fontSize = Mathf.RoundToInt((n.Crit ? 30 : 24) * Mathf.Clamp(6 / s.z, 0.6f, 1.6f));
                var r = new Rect(x - 60, y - 24, 120, 48);
                // a dark outline, then the number (white, gold for a critical blow)
                numStyle.normal.textColor = new Color(0.11f, 0.086f, 0.23f, 0.9f * alpha);
                for (int i = 0; i < 8; i++) GUI.Label(new Rect(r.x + Mathf.Cos(i * Mathf.PI / 4) * 2.5f, r.y + Mathf.Sin(i * Mathf.PI / 4) * 2.5f, r.width, r.height), n.Text, numStyle);
                numStyle.normal.textColor = n.Crit ? new Color(1f, 0.85f, 0.37f, alpha) : new Color(0.96f, 0.95f, 0.98f, alpha);
                GUI.Label(r, n.Text, numStyle);
            }
        }
    }
}
