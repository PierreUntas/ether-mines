// Ether Mines · what you feel (a phone's vibrations, a gamepad's rumble): a light tap when a block breaks
// or lands, when a long press starts mining, when the pistol fires; a firmer one when your blow lands or a
// guard holds; a heavy one when you're hurt; a little pattern when a parry, a kill or a reward comes. The
// iPhone's Taptic Engine (Plugins/iOS/EtherHaptics.mm), Android's vibrator with its strength, a gamepad's two
// motors. On by default on a phone or with a gamepad; the window's button turns it off.
using System;
using System.Runtime.InteropServices;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Haptics : MonoBehaviour
    {
        public enum Kind { Light, Medium, Heavy, Success, Warning }
        const string Key = "ether-mines:haptics";
        public static bool On { get; private set; } = true;
        static Haptics I;
        static float last = -9;
        float rumbleUntil;

        public static void Toggle() { On = !On; PlayerPrefs.SetString(Key, On ? "1" : "0"); if (On) Play(Kind.Medium); }

        void Awake()
        {
            I = this;
            On = PlayerPrefs.GetString(Key, "1") != "0";
        }

#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void EtherHaptic(int kind);
#endif
        // never true: the call below is only there so that Unity gives the Android build the right to vibrate
        static bool neverTrue;

        public static void Play(Kind k)
        {
            if (!On) return;
            // a burst of events (a whole row mined, several rewards): one tap at most every 60 ms
            if (Time.unscaledTime - last < 0.06f && k != Kind.Heavy) return;
            last = Time.unscaledTime;
            if (neverTrue) Handheld.Vibrate();
#if UNITY_IOS && !UNITY_EDITOR
            EtherHaptic((int)k);
#elif UNITY_ANDROID && !UNITY_EDITOR
            Android(k);
#endif
            Rumble(k);
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        static AndroidJavaObject vibrator;
        static int sdk;
        static void Android(Kind k)
        {
            try
            {
                if (vibrator == null)
                {
                    using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                    using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                        vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                    using (var v = new AndroidJavaClass("android.os.Build$VERSION")) sdk = v.GetStatic<int>("SDK_INT");
                }
                if (vibrator == null) return;
                // how long (ms) and how strong (1..255) each kind is; the patterns: two or three pulses
                long[] times; int[] amps;
                switch (k)
                {
                    case Kind.Light: times = new long[] { 0, 12 }; amps = new[] { 0, 70 }; break;
                    case Kind.Medium: times = new long[] { 0, 20 }; amps = new[] { 0, 150 }; break;
                    case Kind.Heavy: times = new long[] { 0, 45 }; amps = new[] { 0, 255 }; break;
                    case Kind.Success: times = new long[] { 0, 18, 70, 28 }; amps = new[] { 0, 120, 0, 200 }; break;
                    default: times = new long[] { 0, 30, 60, 30, 60, 30 }; amps = new[] { 0, 200, 0, 200, 0, 200 }; break;
                }
                if (sdk >= 26)
                {
                    using (var fx = new AndroidJavaClass("android.os.VibrationEffect"))
                    using (var e = fx.CallStatic<AndroidJavaObject>("createWaveform", times, amps, -1))
                        vibrator.Call("vibrate", e);
                }
                else vibrator.Call("vibrate", times, -1);
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }
#endif

        // a gamepad's two motors: the big one for a blow taken, the small one for the rest
        static void Rumble(Kind k)
        {
#if ENABLE_INPUT_SYSTEM
            var g = Gamepad.current;
            if (g == null || I == null) return;
            float lo = k == Kind.Heavy ? 0.8f : k == Kind.Warning ? 0.5f : 0.1f, hi = k == Kind.Light ? 0.25f : k == Kind.Medium ? 0.45f : 0.7f;
            g.SetMotorSpeeds(lo, hi);
            I.rumbleUntil = Time.unscaledTime + (k == Kind.Light ? 0.05f : k == Kind.Heavy ? 0.18f : 0.1f);
#endif
        }

        void Update()
        {
#if ENABLE_INPUT_SYSTEM
            if (rumbleUntil > 0 && Time.unscaledTime >= rumbleUntil) { rumbleUntil = 0; Gamepad.current?.SetMotorSpeeds(0, 0); }
#endif
        }

        void OnDisable()
        {
#if ENABLE_INPUT_SYSTEM
            Gamepad.current?.SetMotorSpeeds(0, 0);
#endif
        }
    }
}
