// Ether Mines · the glow over the picture (04-render.js glowComposer, Settings → Glow): crystals, lanterns,
// lamps, ether ore, neon, the sun on the clouds bleed a soft light around them, as three's UnrealBloomPass
// does on the web (strength 0.42, radius 0.6, threshold 0.84; a little softer here, since
// Unity's sunlit blocks run brighter than three's). On the camera; on by default, phones too.
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class PostGlow : MonoBehaviour
    {
        const string Key = "ether-mines:glow";
        public static bool On { get; private set; } = true;
        public static void Toggle() { On = !On; PlayerPrefs.SetString(Key, On ? "1" : "0"); }

        public float Threshold = 0.95f, Strength = 0.3f, Radius = 0.6f;
        const int Levels = 5;
        Material mat;
        readonly RenderTexture[] chain = new RenderTexture[Levels];

        void Awake()
        {
            On = PlayerPrefs.GetString(Key, "1") != "0";
            var sh = Shader.Find("Hidden/EtherMines/Bloom");
            if (sh != null && sh.isSupported) mat = new Material(sh);
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (!On || mat == null) { Graphics.Blit(src, dst); return; }
            mat.SetFloat("_Threshold", Threshold);
            mat.SetFloat("_Strength", Strength);
            mat.SetFloat("_Grade", 1);
            // halved, then halved again: each level blurs wider
            int w = src.width / 2, h = src.height / 2, n = 0;
            var fmt = src.format;
            for (; n < Levels && w >= 4 && h >= 4; n++, w /= 2, h /= 2)
            {
                chain[n] = RenderTexture.GetTemporary(w, h, 0, fmt);
                chain[n].filterMode = FilterMode.Bilinear;
                Graphics.Blit(n == 0 ? src : chain[n - 1], chain[n], mat, n == 0 ? 0 : 1);
            }
            // back up, each level added onto the one above it (UnrealBloomPass's bloomFactors, lerped by radius)
            for (int i = n - 1; i > 0; i--)
            {
                float f = 1 - 0.2f * i, weight = Mathf.Lerp(f, 1.2f - f, Radius);
                mat.SetFloat("_Weight", weight);
                Graphics.Blit(chain[i], chain[i - 1], mat, 2);
            }
            mat.SetTexture("_BloomTex", n > 0 ? chain[0] : src);
            Graphics.Blit(src, dst, mat, 3);
            for (int i = 0; i < n; i++) { RenderTexture.ReleaseTemporary(chain[i]); chain[i] = null; }
        }
    }
}
