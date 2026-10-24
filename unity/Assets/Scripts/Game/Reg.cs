// Ether Mines · the device's settings (03-state.js REG, 07-interface.js SETTINGS_CHOICES), under the web's
// own key and names ('ether-mines:reglages': view, shadows, animals, mobs, sensitivity, fps, hud*): how far the
// world is drawn, cast shadows, the animals, the hostile mobs (always on in the main world, where everyone
// faces the same ones), the camera's sensitivity, the frame rate next to the clock, the pieces of the screen shown. Sound, vibrations, glow,
// the small critters and the weather keep their own keys. Settings → in the window (Panel.cs).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public static class Reg
    {
        const string Key = "ether-mines:reglages";
        public static int View;                 // chunks drawn around you: 3 short .. 6 very long
        public static bool Shadows, Animals, Mobs, Fps;
        public static float Sensitivity;
        // what the screen shows (Settings → On screen, 07-interface.js HUD_PARTS): each piece can be hidden
        public static bool HudPlace = true, HudOnline = true, HudGear = true, HudGwei = true, HudQuest = true, HudTarget = true, HudNames = true;
        public static readonly (string k, string t)[] HudParts =
        {
            ("hudPlace", "Position & compass"), ("hudOnline", "Players online"), ("hudGear", "Plating, boots & potions"),
            ("hudGwei", "Gwei"), ("hudQuest", "Objective"), ("hudTarget", "Block you aim at"), ("hudNames", "Names over heads"),
        };
        public static bool Hud(string k) => k switch
        {
            "hudPlace" => HudPlace, "hudOnline" => HudOnline, "hudGear" => HudGear, "hudGwei" => HudGwei,
            "hudQuest" => HudQuest, "hudTarget" => HudTarget, _ => HudNames,
        };
        public static void SetHud(string k, bool v)
        {
            switch (k)
            {
                case "hudPlace": HudPlace = v; break;
                case "hudOnline": HudOnline = v; break;
                case "hudGear": HudGear = v; break;
                case "hudGwei": HudGwei = v; break;
                case "hudQuest": HudQuest = v; break;
                case "hudTarget": HudTarget = v; break;
                default: HudNames = v; break;
            }
        }
        public static event Action Changed;
        static bool loaded;

        static void Defaults()
        {
            View = TouchPad.Active ? 5 : 6; // a little further than the web's own defaults (4, 5): the engine can afford it
            Shadows = true;
            Animals = true;
            Mobs = true;
            Fps = false;
            Sensitivity = 1;
            foreach (var (k, _) in HudParts) SetHud(k, true);
        }

        public static void Load()
        {
            if (loaded) return;
            loaded = true;
            Defaults();
            if (!(MiniJson.Parse(PlayerPrefs.GetString(Key, "{}")) is Dictionary<string, object> d)) return;
            if (d.TryGetValue("view", out var v) && v is double vd) View = Mathf.Clamp((int)vd, 3, 6);
            if (d.TryGetValue("shadows", out var s) && s is bool sb) Shadows = sb;
            if (d.TryGetValue("animals", out var a) && a is bool ab) Animals = ab;
            if (d.TryGetValue("mobs", out var m) && m is bool mb) Mobs = mb;
            if (d.TryGetValue("fps", out var f) && f is bool fb) Fps = fb;
            if (d.TryGetValue("sensitivity", out var se) && se is double sd) Sensitivity = Mathf.Clamp((float)sd, 0.3f, 3);
            foreach (var (k, _) in HudParts) if (d.TryGetValue(k, out var hv) && hv is bool hb) SetHud(k, hb);
        }

        public static void Save()
        {
            // the web's other settings in the same record are kept as they are
            var d = MiniJson.Parse(PlayerPrefs.GetString(Key, "{}")) as Dictionary<string, object> ?? new Dictionary<string, object>();
            d["view"] = (double)View; d["shadows"] = Shadows; d["animals"] = Animals; d["mobs"] = Mobs; d["fps"] = Fps; d["sensitivity"] = (double)Sensitivity;
            foreach (var (k, _) in HudParts) d[k] = Hud(k);
            PlayerPrefs.SetString(Key, MiniJson.Write(d));
            PlayerPrefs.Save();
            Changed?.Invoke();
        }

        public static void Reset() { Defaults(); Save(); }

        // the main world keeps its hostile mobs on for everyone (mobsForced)
        public static string World = "";
        public static bool MobsForced => World == "principal";
        public static bool MobsOn => Mobs || MobsForced;
    }
}
