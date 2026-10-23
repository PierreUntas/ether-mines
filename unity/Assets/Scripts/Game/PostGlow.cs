// Ether Mines · the picture's finish under URP (04-render.js glowComposer, Settings → Glow): crystals,
// lanterns, lamps, ether ore, neon, the sun on the clouds bleed a soft light around them, as three's
// UnrealBloomPass does on the web (threshold, strength, radius); the colors a touch richer and the corners a
// touch darker, as the old grade did. A global URP volume made here, with its Bloom, Color Adjustments and
// Vignette; the camera renders it. Settings → Ambient occlusion turns URP's SSAO (UrpSetup.cs) on or off.
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace EtherMines.Game
{
    public sealed class PostGlow : MonoBehaviour
    {
        const string Key = "ether-mines:glow", AoKey = "ether-mines:ao";
        public static bool On { get; private set; } = true;
        public static bool Ao { get; private set; } = true;
        static PostGlow I;
        public static void Toggle() { On = !On; PlayerPrefs.SetString(Key, On ? "1" : "0"); I?.Apply(); }
        public static void ToggleAo() { Ao = !Ao; PlayerPrefs.SetString(AoKey, Ao ? "1" : "0"); I?.Apply(); }

        public float Threshold = 0.95f, Strength = 0.45f, Scatter = 0.6f;
        Volume volume;
        Bloom bloom;

        void Awake()
        {
            I = this;
            On = PlayerPrefs.GetString(Key, "1") != "0";
            Ao = PlayerPrefs.GetString(AoKey, TouchPad.Active ? "0" : "1") != "0"; // costly on a phone: off there unless chosen
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(Threshold);
            bloom.intensity.Override(Strength);
            bloom.scatter.Override(Scatter);
            var grade = profile.Add<ColorAdjustments>(true);
            grade.saturation.Override(8);
            var vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.22f);
            vig.smoothness.Override(0.45f);
            var go = new GameObject("Picture volume");
            go.transform.SetParent(transform, false);
            volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = profile;
            var cam = GetComponent<Camera>();
            if (cam != null) cam.GetUniversalAdditionalCameraData().renderPostProcessing = true;
            Apply();
        }

        void Apply()
        {
            if (bloom != null) bloom.active = On;
            // URP's ambient occlusion, a feature of the renderer (UrpSetup.cs added it)
            foreach (var f in Resources.FindObjectsOfTypeAll<ScriptableRendererFeature>())
                if (f != null && f.GetType().Name == "ScreenSpaceAmbientOcclusion") f.SetActive(Ao);
        }
    }
}
