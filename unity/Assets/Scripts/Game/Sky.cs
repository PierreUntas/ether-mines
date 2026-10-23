// Ether Mines · the day and the night (08-sky.js): one 8-minute day shared by everyone in a world, read
// from the real time like the game server does (mobs-core.js worldClock), with the same key colours:
// sky, horizon, sun, ambient light and fog through the day.
using System;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Sky : MonoBehaviour
    {
        public Light Sun;
        public Material SkyMat;
        public float Day; // 0..1: 0.25 sunrise, 0.5 noon, 0.75 sunset
        public static bool Underwater; // the camera is in water (PlayerController): a close blue-green fog
        public static float Below, EyeY = 40; // how far under the ground the camera is, and its height (PlayerController)
        public static float Cave;      // 0 in the open .. 1 deep in a cave (eased): the fog turns a close, dark violet
        public static Color Hor = Color.white; // the horizon's color now (the clouds take it)
        public static float Night;     // 0 by day .. 1 deep in the night (08-sky.js night: the sun under the horizon)
        public int DayN;
        public float? FixedDay; // a fixed time of day (captures), otherwise the world's clock
        public float FogFar = 108;
        public float Vision; // 0..1: the Owl Draught (18-potions.js visionLight): the dark never gets darker than a soft daylight

        const double DAY_S = 480;
        static readonly double WorldEpoch = (new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc) - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;

        // [hour, sky top, horizon, sun colour, sun intensity, ambient, fog]
        static readonly (float t, string top, string hor, string sun, float si, float amb, string fog)[] KF =
        {
            (0f, "#141048", "#2e2870", "#000000", 0f, 0.2f, "#231d55"),
            (0.22f, "#3a3f8f", "#ffa0a8", "#ff9a6a", 0.15f, 0.36f, "#7a62a8"),
            (0.28f, "#9cc4ff", "#ffd9ec", "#ffcfa6", 0.6f, 0.42f, "#eadcf6"),
            (0.5f, "#8fbaff", "#f2e6ff", "#fff4e0", 0.68f, 0.46f, "#e8e4ff"),
            (0.72f, "#93a8f4", "#ffd6ec", "#ffd6b0", 0.62f, 0.5f, "#f2dcf2"),
            (0.78f, "#5f56c0", "#ffa45e", "#ff8a4c", 0.4f, 0.48f, "#d79a8c"),
            (0.85f, "#1c1a52", "#4a3a7a", "#000000", 0f, 0.2f, "#2a2160"),
            (1f, "#141048", "#2e2870", "#000000", 0f, 0.2f, "#231d55"),
        };

        static readonly float SeaY = EtherMines.Core.World.SEA;
        static float Bell(float t, float c, float w) { float d = (t - c) / w; return (float)Math.Exp(-d * d); }
        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c; }

        void Update()
        {
            if (FixedDay.HasValue) Day = FixedDay.Value;
            else
            {
                double d = ((DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds - WorldEpoch) / DAY_S + 0.3;
                Day = (float)(d - Math.Floor(d));
                DayN = Math.Max(0, (int)Math.Floor(d));
            }
            float t = Day % 1f;
            int i = 0;
            while (t > KF[i + 1].t) i++;
            var a = KF[i];
            var b = KF[i + 1];
            float k = (t - a.t) / (b.t - a.t);
            Color top = Color.Lerp(C(a.top), C(b.top), k), hor = Color.Lerp(C(a.hor), C(b.hor), k), sunC = Color.Lerp(C(a.sun), C(b.sun), k), fog = Color.Lerp(C(a.fog), C(b.fog), k);
            float si = Mathf.Lerp(a.si, b.si, k), amb = Mathf.Lerp(a.amb, b.amb, k);
            // a shower (Weather, Unity only): the sky greys, the light dims, the fog closes in
            float wet = Mathf.Max(Weather.Rain, Weather.Snow * 0.7f);
            if (wet > 0)
            {
                Color grey(Color c, float lift) { float g = c.grayscale * lift; return Color.Lerp(c, new Color(g, g, g * 1.06f), wet * 0.75f); }
                top = grey(top, 0.85f); hor = grey(hor, 0.95f); fog = grey(fog, 0.9f);
                si *= 1 - wet * 0.6f; amb *= 1 - wet * 0.2f;
            }
            float ang = (t - 0.25f) * Mathf.PI * 2;
            // the web's sun direction (x, y, z) in game coordinates; Unity flips z
            var dir = new Vector3(Mathf.Cos(ang), Mathf.Sin(ang), -0.35f).normalized;
            var lightDir = dir.y > 0 ? dir : -dir;
            Night = Mathf.Clamp01(-dir.y * 4);
            // what glows in the blocks glows brighter at night (emisBoost)
            Shader.SetGlobalFloat("_EM_Emis", 0.6f + Night * 0.8f);
            Sun.transform.rotation = Quaternion.LookRotation(-lightDir);
            Sun.intensity = dir.y > 0 ? si * 0.95f : 0.12f; // as the web (three's legacy lights and Unity's Lambert light alike)
            Sun.color = dir.y > 0 ? Color.Lerp(sunC, Color.white, 0.35f) : C("#9fb0ff");
            var ambient = Color.Lerp(hor, Color.white, 0.45f) * amb * 1.15f; // a touch over the web's hemi: Unity's trilight is softer on the sides
            if (Vision > 0) { var day = new Color(1.3f, 1.3f, 1.35f); if (day.grayscale > ambient.grayscale) ambient = Color.Lerp(ambient, day, Vision * 0.8f); }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ambient;
            RenderSettings.ambientEquatorColor = ambient * 0.85f;
            RenderSettings.ambientGroundColor = C("#b9a7e0") * amb;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = fog;
            RenderSettings.fogEndDistance = FogFar;
            RenderSettings.fogStartDistance = FogFar * 0.37f;
            if (wet > 0) { RenderSettings.fogEndDistance = FogFar * (1 - wet * 0.45f); RenderSettings.fogStartDistance = FogFar * 0.37f * (1 - wet * 0.6f); }
            // under the ground: the daylight's fog gives way to the caves' own, closer and darker; violet, then
            // the ether's teal-violet in the deep layers (World.DEEP, the geodes)
            float caveT = Mathf.Clamp01((Below - 3) / 5);
            Cave += (caveT - Cave) * Mathf.Min(1, Time.deltaTime / 1.2f);
            if (Cave > 0.001f)
            {
                var caveC = Color.Lerp(C("#1d1540"), C("#1a2448"), Mathf.Clamp01((20 - EyeY) / 8));
                RenderSettings.fogColor = Color.Lerp(RenderSettings.fogColor, caveC, Cave);
                RenderSettings.fogStartDistance = Mathf.Lerp(RenderSettings.fogStartDistance, 4, Cave);
                RenderSettings.fogEndDistance = Mathf.Lerp(RenderSettings.fogEndDistance, 44, Cave);
            }
            // the low mist (EtherLit.hlsl EtherFog): along the sea and in the valleys, thick at dawn, light by day,
            // thicker in a shower; none in a cave or under water
            float mist = 0.08f + 0.5f * Bell(t, 0.27f, 0.07f) + 0.25f * Bell(t, 0.8f, 0.05f) + 0.12f * Night + wet * 0.35f;
            Shader.SetGlobalVector("_EM_Mist", new Vector4(Underwater ? 0 : mist * (1 - Cave), SeaY + 2, 0, 0));
            if (Underwater)
            {
                // under the surface: the world fades into the water's own color a few blocks away
                RenderSettings.fogColor = Color.Lerp(new Color(0.07f, 0.24f, 0.36f), fog, 0.2f) * Mathf.Max(0.35f, Mathf.Min(1, amb * 1.4f));
                RenderSettings.fogStartDistance = 0.5f;
                RenderSettings.fogEndDistance = 16;
            }
            // the sky's colors, for the water's reflection
            Shader.SetGlobalColor("_EM_SkyTop", top);
            Shader.SetGlobalColor("_EM_SkyHor", hor);
            // the haze's glow toward the sun and its beams (EtherLit.hlsl EtherFog): none at night, none under water,
            // dimmer in a shower
            Shader.SetGlobalVector("_EM_SunDir", dir);
            var glow = Underwater ? Color.black : Cave > 0.99f ? Color.black : sunC * (0.5f + 0.5f * Mathf.Clamp01(si * 1.5f)) * (1 - wet * 0.7f);
            Shader.SetGlobalColor("_EM_SunGlow", glow);
            Hor = hor;
            if (SkyMat != null)
            {
                SkyMat.SetColor("_Top", top);
                SkyMat.SetColor("_Horizon", hor);
                SkyMat.SetColor("_SunColor", sunC);
                SkyMat.SetVector("_SunDir", dir);
                SkyMat.SetFloat("_Night", Night);
            }
        }
    }
}
