// Ether Mines · walking, jumping, swimming and climbing, as the web version does it (05-player.js
// collides/moveAxis/cornerSlide, 10-loop.js frame): a 0.6 x 1.75 box moved axis by axis in small steps,
// stepping up slabs and stairs, sliding into doorways, floating in water. Pure C#, so it can be tested.
using System;

namespace EtherMines.Core
{
    public sealed class PlayerPhysics
    {
        public const double PW = 0.3, PH = 1.75, EYE = 1.6;
        public double X, Y, Z, Vy, DryT = 9;
        public bool On, InWater, Bumped;
        public double StepUp; // how much the eye still has to catch up after a step (eased by the camera)
        public double SpeedMul = 1;             // a meal or the Swift Elixir, the Front-Runner Boots, the guard (10-loop.js)
        public double DashT, DashVx, DashVz;    // a dodge: this velocity, for this long (16-mobs.js DASH)
        // on board a Diamond Glider (20-hover.js): over the water, over one-block steps, twice as fast (the
        // caller's SpeedMul), with inertia: it drifts in hard turns (rideVelocity)
        public bool Riding;
        // a touch screen (10-loop.js `touch`): walking into a one-block step hops it, swimming into the bank climbs out
        public bool AutoJump;
        double rideVx, rideVz;
        const double HoverAccel = 3.5, HoverGrip = 1.4;
        static readonly double[] Steps = { 0.26, 0.52 }, RideSteps = { 0.26, 0.52, 1.05 };

        readonly Func<int, int, int, int> get;
        readonly Func<int, int, bool> loaded;
        // the collision boxes of a block (empty: you walk through; one full box for plain blocks)
        readonly Func<int, int, int, int, double[][]> boxes;

        public PlayerPhysics(Func<int, int, int, int> get, Func<int, int, bool> loaded, Func<int, int, int, int, double[][]> boxes)
        {
            this.get = get;
            this.loaded = loaded;
            this.boxes = boxes;
        }

        public bool Collides(double x, double y, double z)
        {
            double ax0 = x - PW, ax1 = x + PW, ay1 = y + PH, az0 = z - PW, az1 = z + PW;
            for (int bx = (int)Math.Floor(ax0); bx <= (int)Math.Floor(ax1 - 1e-4); bx++)
                for (int by = (int)Math.Floor(y); by <= (int)Math.Floor(ay1 - 1e-4); by++)
                    for (int bz = (int)Math.Floor(az0); bz <= (int)Math.Floor(az1 - 1e-4); bz++)
                    {
                        if (by < 0 || !loaded(bx, bz) || !World.InWorld(bx, bz)) return true;
                        int id = get(bx, by, bz);
                        if (id == 11 && Riding) return true; // the craft glides over the water instead of sinking into it
                        if (id == 0 || id == 11) continue;
                        var bs = boxes(id, bx, by, bz);
                        if (bs == null) continue;
                        foreach (var b in bs)
                            if (ax1 > bx + b[0] && ax0 < bx + b[3] && ay1 > by + b[1] && y < by + b[4] && az1 > bz + b[2] && az0 < bz + b[5]) return true;
                    }
            return false;
        }

        double Axis(int ax) => ax == 0 ? X : ax == 1 ? Y : Z;
        void SetAxis(int ax, double v) { if (ax == 0) X = v; else if (ax == 1) Y = v; else Z = v; }

        // ax: 0 x, 1 y, 2 z
        public void MoveAxis(int ax, double amt)
        {
            int n = (int)Math.Ceiling(Math.Abs(amt) / 0.2);
            if (n < 1) n = 1;
            double d = amt / n;
            for (int i = 0; i < n; i++)
            {
                SetAxis(ax, Axis(ax) + d);
                if (!Collides(X, Y, Z)) continue;
                if (ax == 1)
                {
                    Y -= d;
                    if (d < 0)
                    {
                        for (int k = 0; k < 12 && !Collides(X, Y - 0.02, Z); k++) Y -= 0.02;
                        On = true;
                    }
                    Vy = 0;
                    return;
                }
                if (On)
                {
                    double up = 0;
                    foreach (var h in Riding ? RideSteps : Steps)
                        if (!Collides(X, Y + h, Z)) { up = h; break; }
                    if (up > 0)
                    {
                        Y += up;
                        StepUp = Math.Min(StepUp + up, 0.6);
                        continue;
                    }
                }
                SetAxis(ax, Axis(ax) - d);
                if (CornerSlide(ax, d)) continue;
                Bumped = true;
                return;
            }
        }

        // walking into the edge of a one-block opening a little off its axis: slide toward the opening
        bool CornerSlide(int ax, double d)
        {
            int pa = ax == 0 ? 2 : 0;
            for (double off = 0.04; off <= 0.36; off += 0.04)
                foreach (var sg in new[] { 1, -1 })
                {
                    SetAxis(pa, Axis(pa) + sg * off);
                    SetAxis(ax, Axis(ax) + d);
                    bool free = !Collides(X, Y, Z);
                    SetAxis(ax, Axis(ax) - d);
                    SetAxis(pa, Axis(pa) - sg * off);
                    if (!free) continue;
                    double step = Math.Min(off, 0.06);
                    SetAxis(pa, Axis(pa) + sg * step);
                    if (!Collides(X, Y, Z)) return true;
                    SetAxis(pa, Axis(pa) - sg * step);
                    return false;
                }
            return false;
        }

        // one frame. fx, fz: the move input (strafe, forward) in -1..1; yaw in radians (0 looks toward -z)
        public void Step(double dt, double fx, double fz, double yaw, bool jump, bool run, bool sneak, Func<int, bool> isLadder)
        {
            double l = Math.Sqrt(fx * fx + fz * fz);
            if (l > 1) { fx /= l; fz /= l; }
            bool inW = get((int)Math.Floor(X), (int)Math.Floor(Y + 0.5), (int)Math.Floor(Z)) == 11;
            InWater = inW;
            DryT = inW ? 0 : DryT + dt;
            double sp = (run && !sneak ? 6.6 : 4.4) * (inW ? 0.55 : 1) * (sneak && !inW ? 0.35 : 1);
            double sn = Math.Sin(yaw), cs = Math.Cos(yaw);
            sp *= SpeedMul;
            double vx = (-sn * fz + cs * fx) * sp, vz = (-cs * fz - sn * fx) * sp;
            if (Riding)
            {
                // the part along the nose follows the stick quickly, the part across it only slowly lets go
                double nx = -sn, nz = -cs, f = rideVx * nx + rideVz * nz, tf = vx * nx + vz * nz,
                    nf = f + (tf - f) * Math.Min(1, dt * HoverAccel), k = Math.Min(1, dt * HoverGrip),
                    lx = rideVx - f * nx + (vx - tf * nx - (rideVx - f * nx)) * k,
                    lz = rideVz - f * nz + (vz - tf * nz - (rideVz - f * nz)) * k;
                vx = nf * nx + lx;
                vz = nf * nz + lz;
            }
            else rideVx = rideVz = 0;
            if (DashT > 0) { vx = DashVx; vz = DashVz; }
            double px0 = X, pz0 = Z;
            bool was = On;
            Bumped = false;
            bool guard = sneak && was && !inW;
            {
                double ox = X, oy = Y;
                MoveAxis(0, vx * dt);
                if (guard && !Collides(X, Y - 0.1, Z)) { X = ox; Y = oy; }
            }
            {
                double oz = Z, oy = Y;
                MoveAxis(2, vz * dt);
                if (guard && !Collides(X, Y - 0.1, Z)) { Z = oz; Y = oy; }
            }
            bool onLadder = isLadder(get((int)Math.Floor(X), (int)Math.Floor(Y + 0.2), (int)Math.Floor(Z))) ||
                            isLadder(get((int)Math.Floor(X), (int)Math.Floor(Y + 1.2), (int)Math.Floor(Z)));
            bool feetWet = get((int)Math.Floor(X), (int)Math.Floor(Y), (int)Math.Floor(Z)) == 11 ||
                           get((int)Math.Floor(X), (int)Math.Floor(Y - 0.2), (int)Math.Floor(Z)) == 11;
            if ((inW || feetWet) && Bumped && l > 0.1 && (jump || AutoJump) && !sneak && Vy < 6) Vy = 7.6;
            else if (inW)
            {
                bool chestWet = get((int)Math.Floor(X), (int)Math.Floor(Y + 1), (int)Math.Floor(Z)) == 11;
                Vy = jump ? (chestWet ? 2.6 : Math.Max(Math.Min(Vy, 0.6) - 9 * dt, -0.6)) : sneak ? -3 : Math.Max(Vy - 9 * dt, -2.2);
            }
            else if (feetWet && DryT < 0.5) Vy = Math.Max(Vy - 9 * dt, -2.2);
            else if (onLadder) Vy = jump || (Bumped && l > 0.1) || (l > 0.1 && fz > 0) ? 3.2 : sneak ? 0 : Math.Max(Vy - 24 * dt, -2.4);
            else
            {
                if (jump && was) Vy = 8.2;
                else if (AutoJump && Bumped && was && l > 0.3) Vy = 8.2;
                Vy = Math.Max(Vy - 24 * dt, -30);
            }
            On = false;
            MoveAxis(1, Vy * dt);
            // what you really moved this frame (a wall stops the slide too)
            if (Riding && dt > 0) { rideVx = (X - px0) / dt; rideVz = (Z - pz0) / dt; }
        }
    }
}
