// Ether Mines · the Diamond Gliders (20-hover.js): hold one and right-click to ride it, twice as fast, over
// water and over one-block steps, drifting in hard turns; right-click again, or put it away, to step off.
// No fighting on board. The craft floats under you, bobbing, leaning into a slide; you sit in it, higher.
// The others see it under you (their `rd`), and theirs under them. (The Twin Diamond's back seat comes later.)
using System;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Hover : MonoBehaviour
    {
        public const float Gap = 0.25f; // the hull's lowest point above the ground
        public PlayerController Player;
        public Interaction Act;

        public int Riding { get; private set; } // the craft's item id, 0 on foot
        public float Lift { get; private set; } // how much higher than your feet you sit
        GameObject craft;
        float yaw, roll, vx, vz;
        Vector3 last;
        bool seen;
        static bool told; // the tip, once a session

        public static bool IsHover(int id) { var it = Rules.Item(id); return it != null && it.HoverModel != null; }
        int Held => Act.Inv.Held != null ? Act.Inv.HeldId : 0;

        // the right button with a craft in hand, or on board: on or off (toggleRide)
        public bool Toggle()
        {
            if (Riding != 0) { Off(); return true; }
            if (!IsHover(Held)) return false;
            var b = Player.Body;
            if (b.InWater || Act.World.Get((int)Math.Floor(b.X), (int)Math.Floor(b.Y + 0.5), (int)Math.Floor(b.Z)) == 11)
            {
                Hud.Feed("burn", "Climb out of the water first", "then get on board: it glides over the sea");
                return true;
            }
            craft = HeldModels.Hover(Held, out var seat, out _);
            if (craft == null) return false;
            craft.transform.SetParent(transform, false);
            Riding = Held;
            Lift = Math.Max(0, Gap + seat - 0.47f + 0.04f);
            yaw = (float)Player.Yaw;
            seen = false;
            b.Riding = true;
            if (!told && (told = true)) Hud.Feed("nft", "On board the " + Ui.NameOf(Riding), "twice as fast, over water too · right-click to step off");
            return true;
        }

        public void Off()
        {
            if (craft != null) Destroy(craft);
            craft = null;
            Riding = 0;
            Lift = 0;
            if (Player.Body != null) Player.Body.Riding = false;
        }

        void Update()
        {
            var b = Player.Body;
            if (b == null) return;
            if (Riding != 0 && Held != Riding) Off(); // put away: you step off
            if (Riding == 0 || craft == null) return;
            float dt = Time.deltaTime;
            float dr = (float)Player.Yaw - yaw;
            dr = Mathf.Atan2(Mathf.Sin(dr), Mathf.Cos(dr));
            yaw += dr * Mathf.Min(1, dt * 10);
            // its slide: the speed across its nose leans it over (driftFx)
            var p = new Vector3((float)b.X, (float)b.Y, (float)b.Z);
            if (seen && dt > 0)
            {
                float k = Mathf.Min(1, dt * 8);
                vx += ((p.x - last.x) / dt - vx) * k;
                vz += ((p.z - last.z) / dt - vz) * k;
                if (new Vector2(vx, vz).magnitude > 40) vx = vz = 0;
            }
            seen = true;
            last = p;
            float rx = Mathf.Cos(yaw), rz = -Mathf.Sin(yaw), lat = vx * rx + vz * rz;
            roll += (Mathf.Clamp(lat * 0.05f, -0.32f, 0.32f) - roll) * Mathf.Min(1, dt * 6);
            float bob = Mathf.Sin(Time.time * 2.2f) * 0.03f * 1.3f;
            craft.transform.SetPositionAndRotation(new Vector3(p.x, p.y + Gap + bob, -p.z), Mobs.Mirror(new Vector3(0, yaw, roll), true));
        }
    }
}
