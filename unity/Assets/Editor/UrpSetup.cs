// Ether Mines · the Universal Render Pipeline, set up once (menu "Ether Mines/Set up URP", and on its own the
// first time the project opens with URP installed and no pipeline chosen): a URP asset and its Universal
// renderer in Assets/Settings, made the project's pipeline for every quality level, tuned for the game: the
// camera's depth (the water's shallows), soft shadows in four cascades out to 80 blocks, the lamps and
// lanterns lit per pixel, HDR, 4x MSAA, and the screen-space ambient occlusion. Game.cs lightens it on a phone.
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace EtherMines.Builds
{
    [InitializeOnLoad]
    public static class UrpSetup
    {
        const string Dir = "Assets/Settings", AssetPath = Dir + "/EtherMines-URP.asset", RendererPath = Dir + "/EtherMines-URP-Renderer.asset";

        static UrpSetup()
        {
            // once the editor is ready, and only when no pipeline is chosen yet
            EditorApplication.delayCall += () => { if (GraphicsSettings.defaultRenderPipeline == null) Setup(); };
        }

        [MenuItem("Ether Mines/Set up URP")]
        public static void Setup()
        {
            try
            {
                if (!Directory.Exists(Dir)) Directory.CreateDirectory(Dir);
                var data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
                if (data == null)
                {
                    data = ScriptableObject.CreateInstance<UniversalRendererData>();
                    AssetDatabase.CreateAsset(data, RendererPath);
                }
                var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(AssetPath);
                if (asset == null)
                {
                    asset = UniversalRenderPipelineAsset.Create(data);
                    AssetDatabase.CreateAsset(asset, AssetPath);
                }
                Tune(asset, data);
                GraphicsSettings.defaultRenderPipeline = asset;
                // every quality level uses it (none of them overrides the default)
                int cur = QualitySettings.GetQualityLevel();
                for (int i = 0; i < QualitySettings.names.Length; i++) { QualitySettings.SetQualityLevel(i, false); QualitySettings.renderPipeline = null; }
                QualitySettings.SetQualityLevel(cur, false);
                AssetDatabase.SaveAssets();
                Debug.Log("Ether Mines: URP is set up (" + AssetPath + ").");
            }
            catch (Exception e)
            {
                Debug.LogError("Ether Mines: URP setup failed (" + e.Message + "). Use Window → Rendering → Render Pipeline Converter (Built-in to URP, Rendering Settings), then the menu Ether Mines → Set up URP again.");
            }
        }

        // the asset's own settings, by their serialized names (not every one has a public setter)
        static void Tune(UniversalRenderPipelineAsset asset, UniversalRendererData data)
        {
            var so = new SerializedObject(asset);
            void Set(string name, Action<SerializedProperty> f) { var p = so.FindProperty(name); if (p != null) f(p); else Debug.LogWarning("Ether Mines: URP asset has no " + name); }
            Set("m_RequireDepthTexture", p => p.boolValue = true);
            Set("m_SupportsHDR", p => p.boolValue = true);
            Set("m_MSAA", p => p.intValue = 4);
            Set("m_RenderScale", p => p.floatValue = 1);
            Set("m_MainLightRenderingMode", p => p.intValue = 1);        // per pixel
            Set("m_MainLightShadowsSupported", p => p.boolValue = true);
            Set("m_MainLightShadowmapResolution", p => p.intValue = 4096);
            Set("m_AdditionalLightsRenderingMode", p => p.intValue = 1); // per pixel
            Set("m_AdditionalLightsPerObjectLimit", p => p.intValue = 8);
            Set("m_ShadowDistance", p => p.floatValue = 80);
            Set("m_ShadowCascadeCount", p => p.intValue = 4);
            Set("m_SoftShadowsSupported", p => p.boolValue = true);
            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(asset);

            // the renderer: forward (every lit shader of the game loops over the lights itself), and the
            // ambient occlusion in the corners and under things (URP's own feature)
            var ro = new SerializedObject(data);
            var mode = ro.FindProperty("m_RenderingMode");
            if (mode != null) { mode.intValue = 0; ro.ApplyModifiedProperties(); }
            bool hasAo = false;
            foreach (var f in data.rendererFeatures) if (f != null && f.GetType().Name == "ScreenSpaceAmbientOcclusion") hasAo = true;
            var aoType = typeof(UniversalRendererData).Assembly.GetType("UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion");
            if (!hasAo && aoType != null)
            {
                var ao = (ScriptableRendererFeature)ScriptableObject.CreateInstance(aoType);
                ao.name = "SSAO";
                AssetDatabase.AddObjectToAsset(ao, data);
                data.rendererFeatures.Add(ao);
                // the feature list and its map are kept together by the renderer data
                var map = ro.FindProperty("m_RendererFeatureMap");
                if (map != null && AssetDatabase.TryGetGUIDAndLocalFileIdentifier(ao, out _, out long id))
                {
                    ro.Update();
                    map.arraySize++;
                    map.GetArrayElementAtIndex(map.arraySize - 1).longValue = id;
                    ro.ApplyModifiedProperties();
                }
                data.SetDirty();
            }
            EditorUtility.SetDirty(data);
        }
    }
}
