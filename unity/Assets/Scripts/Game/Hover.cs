// Ether Mines · the Diamond Gliders (20-hover.js): hold one and right-click to ride it, twice as fast, over
// water and over one-block steps, drifting in hard turns; right-click again, or put it away, to step off.
// No fighting on board. The craft floats under you, bobbing, leaning into a slide; you sit in it, higher.
// The others see it under you (their `rd`), and theirs under them. The Twin Diamond has a back seat: right-click
// a friend driving one to sit behind them and go where they go (your `on`); jump to get off.
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

        public Avatars Avatars; // the others (their crafts, their back seats); null offline
        public int Riding { get; private set; } // the craft's item id, 0 on foot
        public string Boarded { get; private set; } // in this driver's back seat (their user id), or null
        public bool Aboard => Riding != 0 || Boarded != null; // no fighting, no dodging, no hand
        float lift;
        public float Lift => Boarded != null ? boardLift : lift; // how much higher than your feet you sit
        float boardLift, back = float.NaN;
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
            if (Boarded != null) { Unboard(); return true; }
            if (Riding != 0) { Off(); return true; }
            if (!IsHover(Held)) return false;
            var b = Player.Body;
            if (b.InWater || Act.World.Get((int)Math.Floor(b.X), (int)Math.Floor(b.Y + 0.5), (int)Math.Floor(b.Z)) == 11)
            {
                Hud.Feed("burn", "Climb out of the water first", "then get on board: it glides over the sea");
                return true;
            }
            craft = HeldModels.Hover(Held, out var seat, out back);
            if (craft == null) return false;
            craft.transform.SetParent(transform, false);
            Riding = Held;
            lift = Math.Max(0, Gap + seat - 0.47f + 0.04f);
            yaw = (float)Player.Yaw;
            seen = false;
            b.Riding = true;
            Sounds.Chime();
            Haptics.Play(Haptics.Kind.Medium);
            if (!told && (told = true)) Hud.Feed("nft", "On board the " + Ui.NameOf(Riding), "twice as fast, over water too · " + (TouchPad.Active ? "the Ride button" : "right-click") + " to step off" +
                (Avatars.IsTwin(Riding) ? " · a friend can take the back seat by " + (TouchPad.Active ? "tapping" : "right-clicking") + " you" : ""));
            return true;
        }

        public void Off()
        {
            if (craft != null) { Destroy(craft); Sounds.Click(); }
            craft = null;
            Riding = 0;
            lift = 0;
            back = float.NaN;
            if (Player.Body != null) Player.Body.Riding = false;
        }

        // your craft's back seat, for a friend in it (Avatars.DriverSeat): the craft's place and heading
        public bool BackSeat(out Vector3 pos, out float heading, out float backDist, out float seatLift)
        {
            var b = Player.Body;
            pos = b != null ? new Vector3((float)b.X, (float)b.Y, (float)b.Z) : default;
            heading = yaw; backDist = back; seatLift = lift;
            return Riding != 0 && craft != null && !float.IsNaN(back) && Avatars.IsTwin(Riding);
        }

        // a right-click on a player (tryBoard): their Twin Diamond's back seat, if it's free and near
        public bool TryBoard(string id)
        {
            if (id == null || Aboard || Avatars == null || !Avatars.Driving(id, out var rd, out var p, out var name) || !Avatars.IsTwin(rd)) return false;
            var b = Player.Body;
            if (new Vector2((float)(p.x - b.X), (float)(p.z - b.Z)).magnitude > 4.5f) return false;
            var taken = Avatars.SeatTaken(id);
            if (taken != null) { Hud.Feed("burn", "The back seat is taken", taken + " is already riding with " + name); return true; }
            Boarded = id;
            Hud.Feed("nft", "You ride behind " + name, TouchPad.Active ? "jump or the Ride button to get off" : "jump to get off");
            return true;
        }

        // stepped off to the side of the craft, on a free spot
        public void Unboard()
        {
            if (Boarded == null) return;
            var b = Player.Body;
            bool had = Avatars.DriverSeat(Boarded, out _, out var y, out _);
            Boarded = null;
            if (had && b != null)
            {
                double a = y + Math.PI / 2;
                foreach (var s in new[] { 1.6, -1.6, 0 })
                {
                    double x = b.X + Math.Cos(a) * s, z = b.Z - Math.Sin(a) * s;
                    if (!b.Collides(x, b.Y + 0.6, z)) { b.X = x; b.Z = z; b.Y += 0.6; break; }
                }
            }
            if (b != null) b.Vy = 0;
        }

        // after the physics, every frame (boardTick): in the back seat, you are where the seat is
        public void BoardTick(bool jump)
        {
            if (Boarded == null) return;
            var b = Player.Body;
            if (b == null || Avatars == null || !Avatars.DriverSeat(Boarded, out var p, out _, out var l)) { Unboard(); return; }
            b.X = p.x; b.Y = p.y; b.Z = p.z; b.Vy = 0; b.On = true;
            boardLift = l;
            if (jump) Unboard();
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
