// Stand-ins for the editor API that Assets/Editor uses (signatures only, as UnityStubs.cs).
using System;
namespace UnityEditor
{
    using UnityEngine;
    public class MenuItemAttribute : Attribute { public MenuItemAttribute(string p) { } }
    public enum UIOrientation { Portrait, PortraitUpsideDown, LandscapeRight, LandscapeLeft, AutoRotation }
    public enum ScriptingImplementation { Mono2x, IL2CPP }
    [Flags] public enum AndroidArchitecture { None = 0, ARMv7 = 1, ARM64 = 2 }
    public enum AndroidSdkVersions { AndroidApiLevelAuto = 0, AndroidApiLevel26 = 26 }
    public enum IconKind { Any = -1 }
    public enum BuildTarget { iOS, Android, StandaloneOSX, StandaloneWindows64 }
    [Flags] public enum BuildOptions { None = 0 }
    public struct BuildPlayerOptions { public string[] scenes; public string locationPathName; public BuildTarget target; public BuildOptions options; }
    public static class BuildPipeline { public static Build.Reporting.BuildReport BuildPlayer(BuildPlayerOptions o) => null; }
    public static class EditorUserBuildSettings { public static bool buildAppBundle; }
    public class EditorBuildSettingsScene { public EditorBuildSettingsScene(string p, bool e) { } }
    public static class EditorBuildSettings { public static EditorBuildSettingsScene[] scenes; }
    public static class EditorApplication { public static void Exit(int c) { } public static Action delayCall; }
    public static class AssetDatabase
    {
        public static void ImportAsset(string p) { }
        public static T LoadAssetAtPath<T>(string p) where T : Object => null;
        public static Object[] LoadAllAssetsAtPath(string p) => null;
        public static void SaveAssets() { }
        public static void CreateAsset(Object o, string p) { }
        public static void AddObjectToAsset(Object o, Object a) { }
        public static bool TryGetGUIDAndLocalFileIdentifier(Object o, out string g, out long id) { g = null; id = 0; return false; }
    }
    public class SerializedProperty { public int intValue, arraySize; public long longValue; public float floatValue; public bool boolValue; public Object objectReferenceValue; public SerializedProperty GetArrayElementAtIndex(int i) => null; public void InsertArrayElementAtIndex(int i) { } public void DeleteArrayElementAtIndex(int i) { } }
    public class SerializedObject { public SerializedObject(Object o) { } public SerializedProperty FindProperty(string n) => null; public bool ApplyModifiedProperties() => true; public void Update() { } }
    public class InitializeOnLoadAttribute : Attribute { }
    public static class EditorUtility { public static void SetDirty(Object o) { } }
    public static class PlayerSettings
    {
        public static string companyName, productName, bundleVersion;
        public static UIOrientation defaultInterfaceOrientation;
        public static bool allowedAutorotateToPortrait, allowedAutorotateToPortraitUpsideDown, allowedAutorotateToLandscapeLeft, allowedAutorotateToLandscapeRight, statusBarHidden;
        public static void SetApplicationIdentifier(Build.NamedBuildTarget t, string id) { }
        public static void SetScriptingBackend(Build.NamedBuildTarget t, ScriptingImplementation s) { }
        public static void SetIcons(Build.NamedBuildTarget t, Texture2D[] icons, IconKind k) { }
        public static class Android
        {
            public static int bundleVersionCode; public static AndroidArchitecture targetArchitectures; public static AndroidSdkVersions minSdkVersion, targetSdkVersion;
            public static bool forceInternetPermission, useCustomKeystore; public static string keystoreName, keystorePass, keyaliasName, keyaliasPass;
        }
        public static class iOS { public static string buildNumber, targetOSVersionString; public static bool appleEnableAutomaticSigning; }
        public static class macOS { public static string buildNumber; }
    }
}
namespace UnityEditor.Build
{
    public struct NamedBuildTarget { public static NamedBuildTarget iOS, Android, Standalone, Unknown; }
}
namespace UnityEditor.Build.Reporting
{
    public enum BuildResult { Unknown, Succeeded, Failed, Cancelled }
    public struct BuildSummary { public BuildResult result; public ulong totalSize; public int totalErrors; }
    public class BuildReport { public BuildSummary summary; }
}
namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene, DefaultGameObjects }
    public enum NewSceneMode { Single, Additive }
    public static class EditorSceneManager
    {
        public static UnityEngine.SceneManagement.Scene NewScene(NewSceneSetup s, NewSceneMode m) => default;
        public static bool SaveScene(UnityEngine.SceneManagement.Scene s, string p) => true;
    }
}
namespace UnityEngine.SceneManagement { public struct Scene { } }
