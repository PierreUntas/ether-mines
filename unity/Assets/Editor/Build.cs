// Ether Mines · the builds for the stores (menu "Ether Mines" in the editor, or from a terminal:
//   Unity -batchmode -quit -projectPath unity -executeMethod EtherMines.Builds.Build.Android
// ) — iPhone (an Xcode project to archive), Android (an .aab for Google Play), Mac and Windows. Prepare() sets
// the player settings every build needs (name, id, landscape, IL2CPP, the icon, the fog kept in the shaders)
// and the one scene the game starts from (everything else is built by Game.cs at run time).
// The Android upload key is never in the repo: its path and passwords come from the environment
// (ETHERMINES_KEYSTORE, ETHERMINES_KEYSTORE_PASS, ETHERMINES_KEY_ALIAS, ETHERMINES_KEY_PASS).
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace EtherMines.Builds
{
    public static class Build
    {
        const string Id = "org.ethermines.game";     // the store id: change it here if you register another one
        const string Version = "0.1.0";              // shown in the stores
        const string Scene = "Assets/Scenes/Main.unity";

        [MenuItem("Ether Mines/Prepare player settings")]
        public static void Prepare()
        {
            PlayerSettings.companyName = "Ether Mines";
            PlayerSettings.productName = "Ether Mines";
            PlayerSettings.bundleVersion = Version;
            // a build number that only goes up: the date and hour of the build (yyMMddHH)
            int code = int.Parse(DateTime.UtcNow.ToString("yyMMddHH"));
            PlayerSettings.Android.bundleVersionCode = code;
            PlayerSettings.iOS.buildNumber = code.ToString();
            PlayerSettings.macOS.buildNumber = code.ToString();
            foreach (var t in new[] { NamedBuildTarget.iOS, NamedBuildTarget.Android, NamedBuildTarget.Standalone })
                PlayerSettings.SetApplicationIdentifier(t, Id);

            // held sideways, either way round, like the web version on a phone
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.statusBarHidden = true;

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.forceInternetPermission = true; // the game talks to Supabase and the game server
            PlayerSettings.iOS.targetOSVersionString = "15.0";
            PlayerSettings.iOS.appleEnableAutomaticSigning = true;

            // the web version's icon (icons/icon-512.png, doubled to the 1024 the App Store asks for)
            AssetDatabase.ImportAsset("Assets/Icon/icon.png");
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Icon/icon.png");
            if (icon != null) PlayerSettings.SetIcons(NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);

            KeepShaders();
            MakeScene();
            AssetDatabase.SaveAssets();
            Debug.Log("Ether Mines: player settings ready (" + Id + " " + Version + " build " + code + ")");
        }

        // the sky sets a linear fog at run time: a build must keep it (by default Unity strips the fog the scene
        // doesn't use). Unity's Hidden/Internal-Colored can't go in a build (it fails it): the game draws its
        // lines with its own EtherMines/Line, and an older Prepare's entry for it is taken out again.
        static void KeepShaders()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var strip = so.FindProperty("m_FogStripping");
            if (strip != null) strip.intValue = 1; // custom
            var lin = so.FindProperty("m_FogKeepLinear");
            if (lin != null) lin.boolValue = true;
            var list = so.FindProperty("m_AlwaysIncludedShaders");
            var colored = Shader.Find("Hidden/Internal-Colored");
            if (list != null && colored != null)
                for (int i = list.arraySize - 1; i >= 0; i--)
                    if (list.GetArrayElementAtIndex(i).objectReferenceValue == colored)
                    {
                        list.GetArrayElementAtIndex(i).objectReferenceValue = null;
                        list.DeleteArrayElementAtIndex(i);
                    }
            so.ApplyModifiedProperties();
        }

        // an empty scene with a camera: Game boots itself into it (RuntimeInitializeOnLoadMethod)
        static void MakeScene()
        {
            if (!File.Exists(Scene))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Scene));
                var s = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(s, Scene);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };
        }

        [MenuItem("Ether Mines/Build/iPhone (Xcode project)")]
        public static void IPhone() => Make(BuildTarget.iOS, "Builds/iOS");

        [MenuItem("Ether Mines/Build/Android (Google Play .aab)")]
        public static void Android()
        {
            EditorUserBuildSettings.buildAppBundle = true;
            string ks = Environment.GetEnvironmentVariable("ETHERMINES_KEYSTORE");
            if (!string.IsNullOrEmpty(ks) && File.Exists(ks))
            {
                PlayerSettings.Android.useCustomKeystore = true;
                PlayerSettings.Android.keystoreName = ks;
                PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("ETHERMINES_KEYSTORE_PASS") ?? "";
                PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("ETHERMINES_KEY_ALIAS") ?? "";
                PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("ETHERMINES_KEY_PASS") ?? "";
            }
            else
            {
                PlayerSettings.Android.useCustomKeystore = false;
                Debug.LogWarning("Ether Mines: no upload key (ETHERMINES_KEYSTORE): signed with Unity's debug key, fine on your phone, refused by Google Play");
            }
            Make(BuildTarget.Android, "Builds/Android/EtherMines.aab");
        }

        [MenuItem("Ether Mines/Build/Android (.apk to try on a phone)")]
        public static void AndroidApk()
        {
            EditorUserBuildSettings.buildAppBundle = false;
            Make(BuildTarget.Android, "Builds/Android/EtherMines.apk");
        }

        [MenuItem("Ether Mines/Build/Mac")]
        public static void Mac() => Make(BuildTarget.StandaloneOSX, "Builds/Mac/Ether Mines.app");

        [MenuItem("Ether Mines/Build/Windows")]
        public static void Windows() => Make(BuildTarget.StandaloneWindows64, "Builds/Windows/EtherMines.exe");

        static void Make(BuildTarget target, string path)
        {
            Prepare();
            var r = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { Scene },
                locationPathName = path,
                target = target,
                options = BuildOptions.None,
            });
            var sum = r.summary;
            if (sum.result == BuildResult.Succeeded) Debug.Log($"Ether Mines: {target} built in {path} ({sum.totalSize / 1048576} MB)");
            else
            {
                Debug.LogError($"Ether Mines: the {target} build failed ({sum.totalErrors} errors)");
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }
    }
}
