// Ether Mines · the hostile mobs' logic, ported line for line from src/mobs-core.js (the game's own, also
// run by the game server, server/src/mobs.js): what each mob is (MK), where they stand in the world
// (SpawnChunk and friends, derived from the seed and the terrain, the same everywhere), who they're after
// (Target) and how they move and strike (Step). Nothing here draws anything: a mob is a plain object.
// The world is reached through IMobWorld (the JS's W: { get(x, y, z), isSolid(id), isCross(id) }).
// CoreTests/MobsParity.cs replays the game server's runs (golden-mobs.mjs) against this and MobSim.cs.
// mobs-core.js draws no random numbers: everything follows from the seed, the terrain and the clock.
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    // the world as the mobs see it (W in mobs-core.js)
    public interface IMobWorld
    {
        int Get(int x, int y, int z);
        bool IsSolid(int id);
        bool IsCross(int id);
    }

    // a block getter with the game's own block shapes (Mesher: which blocks are solid, which are plants)
    public sealed class MeshWorld : IMobWorld
    {
        readonly Func<int, int, int, int> get;
        public MeshWorld(Func<int, int, int, int> get) { this.get = get; }
        public int Get(int x, int y, int z) => get(x, y, z);
        public bool IsSolid(int id) => Mesher.IsSolid(id);
        public bool IsCross(int id) => Mesher.IsCross(id);
    }

    // MK[type].rush: a sprint toward a target that hangs back
    public sealed class MobRush { public double Speed, Time, Every, Min; }
    // MK[type].ranged: a charge, then a burst of bolts. Gap, Every, Min and Size are 0 where the JS leaves
    // them out (read as R.gap || 0.2, R.every || K.cd, R.min || 0, R.size || 1.6)
    public sealed class MobRanged { public double Dmg, Speed, Charge, Gap, Every, Min, Size; public int Burst = 1, Color; }
    // MK[type].blink: the Front-Runner's blink through its target
    public sealed class MobBlink { public double Every, Fast, Min; }

    public sealed class MobKind
    {
        public string Type, N;
        public double Hp, Dmg, Sp, Aggro, Atk, Cd, Kb;
        public double[] Hit;
        public MobRush Rush;
        public MobRanged Ranged;
        public MobBlink Blink;
    }

    // a.arena: the floor the twins and the bosses never leave (Reach: the Front-Runner only really takes
    // damage from inside it; HasReach false where the JS has no reach field)
    public sealed class MobArena
    {
        public double X, Z, R, Y, Reach;
        public bool HasReach;
        public MobArena Copy() => (MobArena)MemberwiseClone();
    }

    // a mob, as data (mob() in mobs-core.js): its kind, its chunk key K and slot I, its home (Hx, Hy, Hz),
    // its position (X, Y, Z: a.p) and heading (Ry: a.r.y), and the timers step() keeps on it
    public sealed class Mob
    {
        public string Type, K, Id;
        public int I;
        public double Hp, Hx, Hy, Hz, Ph;
        public double X, Y, Z, Ry;
        public bool HasRuin; public int RuinX, RuinY, RuinZ; // the validator a guardian guards (a.rx/ry/rz)
        public bool HasLadder; public double LadderX, LadderZ; // a tower's ladder column (a.ladder)
        public MobArena Arena;
        public Mob Twin;
        public bool HasWlo; public double Wlo; // a lurker's water bottom
        public int WindowId, Slot;              // a network attack's node
        public string Tgt;                      // the id of the player it hunts
        public double Provoked, StunT, WindT, KbX, KbZ, KbT, AtkT, RushT, RushCd, GapT, ChargeT, RangedT;
        public double? BlinkCd;
        public int Shots;
        public bool Frenzy, Down, Aggro;
        public MobKind Kind => MobsCore.MK[Type];
    }

    // a player as a mob sees them (the cands of target()): D is filled in by Target
    public sealed class MobTarget
    {
        public string Id;
        public double X, Y, Z;
        public bool Ward, Ladder, CanHurt = true;
        public double? D;
        public object Player; // the caller's own player object (the server's `p`)
    }

    // what step() strikes and fires through (ev in mobs-core.js). Melee returns "parry" when the blow was parried
    public sealed class MobEvents
    {
        public double? Now; // ms
        public Func<Mob, MobTarget, string> Melee;
        public Action<Mob, MobRanged, MobTarget> Fire;
        public Action<Mob, int, double, double, double, MobTarget> Summon;
        public Action<Mob, double, double> Blink;
        public Func<MobTarget, bool> Attacks;
    }

    public struct MobStep { public bool Aggro, Moving, Stunned; }
    public struct WorldClock { public double Day; public double N; }
    public struct AttackWindow { public double WindowId, EndsAt; public bool Active; }
    public struct Ground { public int Y; public bool Water; }

    public static class MobsCore
    {
        static double Clamp(double v, double a, double b) => Math.Max(a, Math.Min(b, v));
        static double Hy(double a, double b) => World.Hypot(a, b);
        static double Hy(double a, double b, double c) => World.Hypot(a, b, c);
        static int Fl(double v) => (int)Math.Floor(v);

        // the mobs that fly or swim: they don't walk on the ground, so walls don't stop them
        public static readonly HashSet<string> FLYERS = new HashSet<string> { "sky_raider", "water_lurker", "bat", "pos_twin", "plasma_core" };
        public const int MOB_R = 2; // radius, in chunks, around each player where mobs live

        static MobKind K(string type, string n, double hp, double dmg, double sp, double aggro, double atk, double cd, double kb, double h0, double h1, double h2,
            MobRush rush = null, MobRanged ranged = null, MobBlink blink = null) =>
            new MobKind { Type = type, N = n, Hp = hp, Dmg = dmg, Sp = sp, Aggro = aggro, Atk = atk, Cd = cd, Kb = kb, Hit = new[] { h0, h1, h2 }, Rush = rush, Ranged = ranged, Blink = blink };

        // every mob's kind (MK): its name, health, blow, speed, sight, reach, pace of blows, knockback, hit box
        public static readonly Dictionary<string, MobKind> MK = Build();
        static Dictionary<string, MobKind> Build()
        {
            var l = new[]
            {
                K("shadow", "Rift Shadow", 10, 2, 2.2, 12, 1.1, 0.85, 4, 0.5, 1.3, 0.5),
                K("guardian", "Corrupted Guardian", 19, 3.2, 2.4, 13, 1.4, 0.9, 3, 0.8, 1.9, 0.7),
                K("sentinel", "Geode Sentinel", 14, 2.6, 2.3, 12, 1.3, 0.9, 4, 0.6, 1.2, 0.6),
                K("wraith", "Genesis Wraith", 22, 3.8, 2.4, 14, 1.5, 1.0, 3, 0.9, 2.1, 0.8),
                // a single, fixed-location boss: slow on its feet, it hurls chunks of genesis rock from afar and charges
                K("titan", "Genesis Titan", 120, 7.5, 2.0, 20, 1.9, 1.1, 2, 1.6, 3.6, 1.4,
                    new MobRush { Speed = 6.5, Time = 1.3, Every = 5, Min = 6 },
                    new MobRanged { Dmg = 4, Speed = 10, Charge = 0.6, Burst = 1, Every = 2.4, Min = 5, Color = 0xffb347, Size = 2.6 }),
                // towers: a warden per floor on the way up, turrets bolted to the floors, a Plasma Core at the top
                K("warden", "Tower Warden", 16, 2.6, 3.0, 11, 1.5, 1.0, 2, 0.8, 2.3, 0.7),
                K("turret", "Tower Turret", 12, 0, 0, 14, 0, 2.8, 0, 0.9, 1.5, 0.9, null,
                    new MobRanged { Dmg = 1.8, Speed = 8, Charge = 0.9, Burst = 1, Color = 0x5fe8ff }),
                K("plasma_core", "Plasma Core", 45, 5.5, 3.0, 15, 1.8, 0.9, 2, 1.4, 2.6, 1.4, null,
                    new MobRanged { Dmg = 3, Speed = 11, Charge = 0.5, Burst = 3, Gap = 0.22, Every = 2.6, Min = 3, Color = 0xff5bff }),
                K("garden_guardian", "Garden Guardian", 15, 2.9, 2.3, 12, 1.3, 0.9, 3, 0.7, 1.6, 0.6),
                // only out on the open surface after dark (Prowler below)
                K("prowler", "Night Prowler", 11, 2.6, 2.6, 13, 1.2, 0.85, 4, 0.55, 0.55, 0.9),
                K("sky_raider", "Sky Raider", 12, 2.9, 2.8, 12, 1.3, 0.85, 3, 0.6, 0.5, 0.6),
                K("water_lurker", "Deep Lurker", 17, 3.5, 2.4, 11, 1.4, 1.0, 3, 0.5, 0.6, 1.1),
                K("bat", "Rift Bat", 9, 2.4, 3.0, 12, 1.2, 0.8, 3, 0.4, 0.4, 0.6),
                K("crawler", "Rust Crawler", 15, 2.8, 2.6, 12, 1.3, 0.85, 3, 0.6, 0.5, 1.0),
                K("golem", "Geode Golem", 26, 4.2, 1.7, 11, 1.6, 1.3, 5, 0.9, 1.7, 0.8),
                // the network attack event: only near the Atrium, only during the hourly window
                K("corrupted_node", "Corrupted Node", 20, 3.4, 2.6, 14, 1.3, 0.9, 3, 0.8, 1.8, 0.7),
                // the Merge Sanctum's twins: both must go down together (server.js mobBlow)
                K("pow_twin", "Proof-of-Work", 60, 6, 2.0, 16, 1.8, 1.2, 2, 1.3, 2.7, 1.1),
                K("pos_twin", "Proof-of-Stake", 40, 4, 3.4, 18, 1.6, 0.8, 3, 1.0, 1.4, 1.0, null,
                    new MobRanged { Dmg = 2.5, Speed = 11, Charge = 0.4, Burst = 2, Gap = 0.25, Every = 2.2, Color = 0xc9b8ff }),
                // the Mempool's boss: it dashes, fires bursts, blinks through you, calls in its Sandwich Bots
                K("front_runner", "The Front-Runner", 170, 5.5, 3.4, 24, 2.0, 1.0, 1.2, 1.5, 3.4, 1.5,
                    new MobRush { Speed = 10, Time = 0.8, Every = 4.5, Min = 6 },
                    new MobRanged { Dmg = 3, Speed = 12, Charge = 0.55, Burst = 3, Gap = 0.2, Every = 3.2, Min = 7, Color = 0x7fe8ff, Size = 2.4 },
                    new MobBlink { Every = 8, Fast = 5, Min = 4 }),
                K("mev_bot", "Sandwich Bot", 16, 2.5, 3.9, 30, 1.2, 0.8, 4, 0.8, 1.2, 0.8),
                // the surface's own mobs, one per biome (spawnChunk): the dunes' scorpion stings from afar with gas,
                // the forests' spider pounces, the plains' slime hops, the peaks' yeti throws you far (and stays out by day)
                K("gas_scorpion", "Gas Scorpion", 13, 2.4, 2.9, 13, 1.2, 0.9, 3, 0.8, 0.5, 1.1, null,
                    new MobRanged { Dmg = 1.6, Speed = 9, Charge = 0.6, Burst = 1, Every = 3, Min = 3.5, Color = 0x9dff6a, Size = 1.4 }),
                K("phish_spider", "Phishing Spider", 12, 2.6, 2.8, 12, 1.2, 0.8, 3, 1.0, 0.5, 1.0,
                    new MobRush { Speed = 7.5, Time = 0.5, Every = 4, Min = 3 }),
                K("pump_slime", "Pump Slime", 14, 2.4, 2.4, 11, 1.2, 1.0, 4, 0.8, 0.75, 0.8),
                K("yeti", "Cold Wallet Yeti", 30, 4.5, 2.0, 12, 1.6, 1.4, 7, 1.0, 2.1, 0.8),
            };
            var d = new Dictionary<string, MobKind>();
            foreach (var k in l) d[k.Type] = k;
            return d;
        }

        public const double TWIN_DOWN = 12; // s: a Merge twin struck down only sleeps this long, unless its twin falls too
        public const double LADDER_CLEAR = 2.2;
        // a killed mob stays dead this long (s); every other mob: 2 minutes
        public static readonly Dictionary<string, double> RESPAWN_S = new Dictionary<string, double> { ["corrupted_node"] = 25 };
        // daytime rest: only the validators' guards, the network attack's nodes, the towers and the bosses stay on watch by day
        public static readonly HashSet<string> DAY_WATCH = new HashSet<string>
        {
            "guardian", "crawler", "warden", "turret", "corrupted_node", "titan", "plasma_core", "pow_twin", "pos_twin", "front_runner", "mev_bot", "yeti",
        };
        // mobs the Ward Incense never fools
        public static readonly HashSet<string> WARD_IMMUNE = new HashSet<string>
        {
            "guardian", "garden_guardian", "warden", "turret", "titan", "plasma_core", "pow_twin", "pos_twin", "front_runner", "mev_bot", "corrupted_node",
        };
        // the Genesis Titan's lair: one fixed chunk, far from spawn
        public static readonly int BOSS_CX = Fl((World.SPAWN.X + 160) / (double)World.CH), BOSS_CZ = Fl((World.SPAWN.Z + 160) / (double)World.CH);

        // ---------- the places nobody is hunted ----------
        // the Atrium and the City (also the build protection)
        public static bool Sanctuary(double x, double z) =>
            Hy(Math.Floor(x) - World.SPAWN.X, Math.Floor(z) - World.SPAWN.Z) <= 7.9 ||
            Hy(Math.Floor(x) - World.CITY.X, Math.Floor(z) - World.CITY.Z) <= World.CITY.R + 0.5;
        // mob danger only: also the validators' path between them, widened well past its pavement
        public static bool MobSafe(double x, double z) => Sanctuary(x, z) || World.OnPath(x, z, 6);
        // the newcomers' calm: around the Atrium, no mob appears (nor in the caves under it) and none hunts,
        // so a first-time player finds their bearings before meeting one; only the network attack's nodes come in
        public const double CALM_R = 40;
        public static bool Calm(double x, double z) => Hy(Math.Floor(x) - World.SPAWN.X, Math.Floor(z) - World.SPAWN.Z) <= CALM_R;
        static bool HuntSafe(Mob a, double x, double z) => MobSafe(x, z) || (a.Type != "corrupted_node" && Calm(x, z));

        // ---------- the shared clock (08-sky.js): one sky, one night, for every player of a world ----------
        public const double DAY_S = 480;
        public static readonly double WORLD_EPOCH = new DateTimeOffset(2026, 10, 15, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds() / 1000.0;
        public static double NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // worldClock(now): the time of day (0..1) and the day's number, now in ms
        public static WorldClock Clock(double now)
        {
            double d = (now / 1000 - WORLD_EPOCH) / DAY_S + 0.3; // + 0.3: day 0 starts in the morning
            return new WorldClock { Day = d - Math.Floor(d), N = Math.Max(0, Math.Floor(d)) };
        }
        // nightOf: how dark it is (0 day, 1 night) at a time of day: the sun's height, as the sky draws it
        public static double NightOf(double day)
        {
            double ang = (day - 0.25) * Math.PI * 2, y = Math.Sin(ang) / Hy(Math.Cos(ang), Math.Sin(ang), 0.35);
            return Clamp(-y * 4, 0, 1);
        }
        // attackWindow: the network attack's hourly window, from the clock alone (t in ms)
        public static AttackWindow AttackWindowAt(double t)
        {
            double epoch = Math.Floor(t / 1000), windowId = Math.Floor(epoch / 3600);
            return new AttackWindow { WindowId = windowId, Active = epoch % 3600 < 600, EndsAt = (windowId * 3600 + 600) * 1000 };
        }

        // ---------- reading the terrain ----------
        // groundAt: the first solid block going down from ref+up (trunks and leaves refused with noTree)
        public static Ground? GroundAt(IMobWorld W, double x, double z, double rf, bool noTree, int up = 4)
        {
            int xi = Fl(x), zi = Fl(z);
            for (int y = Math.Min(World.SY - 1, Fl(rf) + up); y >= Math.Max(0, Fl(rf) - 8); y--)
            {
                int id = W.Get(xi, y, zi);
                if (id == 11) return new Ground { Y = y + 1, Water = true };
                if (noTree && (id == 5 || id == 7)) return null;
                if (W.IsSolid(id)) return new Ground { Y = y + 1, Water = false };
            }
            return null;
        }
        // topSolid: the highest block of a column that isn't air or a plant (id, y), or null
        public static (int id, int y)? TopSolid(IMobWorld W, int x, int z)
        {
            for (int y = World.SY - 1; y > 0; y--)
            {
                int id = W.Get(x, y, z);
                if (id == 0 || W.IsCross(id)) continue;
                return (id, y);
            }
            return null;
        }
        // lineClear: is there a clear line from (a) to (b)? half-block steps through the world
        public static bool LineClear(IMobWorld W, double ax, double ay, double az, double bx, double by, double bz)
        {
            double dist = Hy(bx - ax, by - ay, bz - az);
            int n = (int)Math.Ceiling(dist / 0.5);
            for (int i = 1; i < n; i++)
            {
                double t = (double)i / n;
                if (W.IsSolid(W.Get(Fl(ax + (bx - ax) * t), Fl(ay + (by - ay) * t), Fl(az + (bz - az) * t)))) return false;
            }
            return true;
        }

        // ---------- where the mobs stand ----------
        // mob(): a mob, as data. ruin: the validator a guardian guards
        public static Mob NewMob(string type, string k, int i, double x, double y, double z, Site ruin = null)
        {
            var a = new Mob { Type = type, K = k, I = i, Hp = MK[type].Hp, Hx = x, Hy = y, Hz = z, Ph = World.Hash(Fl(x), Fl(z), 223) * 60, X = x, Y = y, Z = z, Ry = 0 };
            if (ruin != null) { a.HasRuin = true; a.RuinX = ruin.X; a.RuinY = ruin.Y; a.RuinZ = ruin.Z; }
            return a;
        }
        public static string MobId(Mob a) => a.K + "|" + a.I + "|" + a.Type;

        // the cave dwellers' air pocket search: below DEEP, air with solid ground under it and room above
        static int AirPocket(IMobWorld W, int hx, int hz)
        {
            for (int y = Math.Min(World.DEEP - 1, World.SY - 2); y >= 2; y--)
                if (W.Get(hx, y, hz) == 0 && W.IsSolid(W.Get(hx, y - 1, hz)) && W.Get(hx, y + 1, hz) == 0) return y;
            return -1;
        }
        // the geode guards' sampled search for pure ether (69) below DEEP, with their own hash slots
        static bool Geode(IMobWorld W, int cx, int cz, int mx, int mz, int s0, int s1, out int gx, out int gy, out int gz)
        {
            gx = gy = gz = -1;
            int x0 = cx * World.CH, z0 = cz * World.CH;
            for (int i = 0; i < 5 && gx < 0; i++)
            {
                int hx = x0 + Fl(World.Hash(cx + i * mx, cz, s0 + i) * World.CH), hz = z0 + Fl(World.Hash(cx, cz + i * mz, s1 + i) * World.CH);
                for (int y = Math.Min(World.DEEP - 1, World.SY - 2); y >= 2; y--)
                    if (W.Get(hx, y, hz) == 69) { gx = hx; gy = y; gz = hz; break; }
            }
            return gx >= 0;
        }

        // spawnChunk: every mob a chunk holds, from the seed and the terrain (the night prowler and the network
        // attack's nodes come and go with the clock: Prowler() and AttackNodes() below)
        public static List<Mob> SpawnChunk(IMobWorld W, int cx, int cz)
        {
            string k = World.CKey(cx, cz);
            var list = new List<Mob>();
            int x0 = cx * World.CH, z0 = cz * World.CH;
            // shadows: in the air pockets of the deep caves (below DEEP), with solid ground underneath
            double r = World.Hash(cx * 17 + 3, cz * 29 + 5, 210);
            if (!Sanctuary(x0 + 8, z0 + 8) && r < 0.2)
            {
                int n = r < 0.05 ? 2 : 1;
                for (int i = 0; i < n; i++)
                {
                    int hx = x0 + 2 + Fl(World.Hash(cx + i * 31, cz, 211 + i) * 12), hz = z0 + 2 + Fl(World.Hash(cx, cz + i * 17, 219 + i) * 12);
                    int hy = AirPocket(W, hx, hz);
                    if (hy < 0) continue;
                    list.Add(NewMob("shadow", k, 100 + i, hx + 0.5, hy, hz + 0.5));
                }
            }
            // rift bats: a second cave dweller, its own roll and position
            {
                double rb = World.Hash(cx * 23 - 7, cz * 19 + 11, 215);
                if (!Sanctuary(x0 + 8, z0 + 8) && rb < 0.18)
                {
                    int hx = x0 + 2 + Fl(World.Hash(cx, cz, 216) * 12), hz = z0 + 2 + Fl(World.Hash(cx, cz, 217) * 12);
                    int hy = AirPocket(W, hx, hz);
                    if (hy >= 0) list.Add(NewMob("bat", k, 105, hx + 0.5, hy, hz + 0.5));
                }
            }
            // guardians: around this region's ruin, as long as its validator isn't relit (three, a third of a turn apart)
            var rg = World.RuinAt(Fl((x0 + 8) / (double)World.RUIN), Fl((z0 + 8) / (double)World.RUIN));
            if (rg != null && World.COf(rg.X) == cx && World.COf(rg.Z) == cz && W.Get(rg.X, rg.Y + 1, rg.Z) == 73)
            {
                double a0 = World.Hash(rg.X, rg.Z, 221) * Math.PI * 2;
                for (int i = 0; i < 3; i++)
                {
                    double an = a0 + (i * Math.PI * 2) / 3 + (World.Hash(rg.X + i, rg.Z, 226) - 0.5) * 0.8,
                        rr = 3 + World.Hash(rg.X, rg.Z + i, 222) * 2,
                        hx = rg.X + 0.5 + Math.Cos(an) * rr,
                        hz = rg.Z + 0.5 + Math.Sin(an) * rr;
                    var gr = GroundAt(W, hx, hz, rg.Y, true, 3);
                    if (gr == null || gr.Value.Water) continue;
                    list.Add(NewMob("guardian", k, i < 2 ? 110 + i : 114, hx, gr.Value.Y, hz, rg));
                }
            }
            // rust crawlers: a second ruin guard, not tied to the validator's relit state
            if (rg != null && World.COf(rg.X) == cx && World.COf(rg.Z) == cz && World.Hash(rg.X + 5, rg.Z + 7, 223) < 0.6)
            {
                for (int i = 0; i < 2; i++)
                {
                    double an = World.Hash(rg.X + i * 3, rg.Z + i, 224) * Math.PI * 2,
                        rr = 4 + World.Hash(rg.X, rg.Z + i * 2, 225) * 3,
                        hx = rg.X + 0.5 + Math.Cos(an) * rr,
                        hz = rg.Z + 0.5 + Math.Sin(an) * rr;
                    var gr = GroundAt(W, hx, hz, rg.Y, true, 3);
                    if (gr == null || gr.Value.Water) continue;
                    list.Add(NewMob("crawler", k, 112 + i, hx, gr.Value.Y, hz));
                }
            }
            // geode sentinels: guard this chunk's pure ether geodes, below DEEP (sampled columns, not exhaustive)
            {
                if (Geode(W, cx, cz, 13, 19, 230, 231, out int gx, out int gy, out int gz) && !Sanctuary(gx, gz) && World.Hash(cx * 31 + 7, cz * 23 + 11, 240) < 0.5)
                {
                    var gr = GroundAt(W, gx + 0.5, gz + 0.5, gy + 1, true, 3);
                    if (gr != null && !gr.Value.Water) list.Add(NewMob("sentinel", k, 120, gx + 0.5, gr.Value.Y, gz + 0.5));
                }
            }
            // geode golems: a second geode guard, its own independent sampled search
            {
                if (Geode(W, cx, cz, 43, 47, 241, 242, out int gx, out int gy, out int gz) && !Sanctuary(gx, gz) && World.Hash(cx * 37 + 9, cz * 41 + 3, 243) < 0.35)
                {
                    var gr = GroundAt(W, gx + 0.5, gz + 0.5, gy + 1, true, 3);
                    if (gr != null && !gr.Value.Water) list.Add(NewMob("golem", k, 125, gx + 0.5, gr.Value.Y, gz + 0.5));
                }
            }
            // genesis wraiths: guard genesis rock, right at the bottom near bedrock (no sanctuary check: see mobs-core.js)
            {
                int wx = -1, wy = -1, wz = -1;
                for (int i = 0; i < 5 && wx < 0; i++)
                {
                    int hx = x0 + Fl(World.Hash(cx + i * 41, cz, 250 + i) * World.CH), hz = z0 + Fl(World.Hash(cx, cz + i * 37, 251 + i) * World.CH);
                    for (int y = 4; y >= 1; y--)
                        if (W.Get(hx, y, hz) == 72) { wx = hx; wy = y; wz = hz; break; }
                }
                if (wx >= 0 && World.Hash(cx * 19 + 3, cz * 29 + 5, 260) < 0.9)
                {
                    var gr = GroundAt(W, wx + 0.5, wz + 0.5, wy + 1, true, 3);
                    if (gr != null && !gr.Value.Water) list.Add(NewMob("wraith", k, 130, wx + 0.5, gr.Value.Y, wz + 0.5));
                }
            }
            // tower wardens, turrets and the Plasma Core: a whole tower's roster, tied to the chunk of its base
            {
                var t = World.TowerAt(Fl((x0 + 8) / (double)World.TOWER), Fl((z0 + 8) / (double)World.TOWER));
                if (t != null && World.COf(t.X) == cx && World.COf(t.Z) == cz)
                {
                    // the climbing ladder's column: tower mobs keep clear of it and wait for you to step off
                    double lx = t.X + World.TOWER_LADDER[0] + 0.5, lz = t.Z + World.TOWER_LADDER[1] + 0.5;
                    int[] floors = { 1, 7, 13 };
                    for (int fi = 0; fi < 3; fi++)
                    {
                        int fy = floors[fi];
                        int n = fi == 0 ? 1 : World.Hash(t.X + fi, t.Z, 280 + fi) < 0.5 ? 2 : 1;
                        for (int i = 0; i < n; i++)
                        {
                            double an = World.Hash(t.X + fi * 3 + i, t.Z, 281 + fi * 2 + i) * Math.PI * 2,
                                rr = 2 + World.Hash(t.X, t.Z + fi * 3 + i, 282 + fi * 2 + i) * 5,
                                hx = t.X + 0.5 + Math.Cos(an) * rr,
                                hz = t.Z + 0.5 + Math.Sin(an) * rr;
                            var wd = NewMob("warden", k, 140 + fi * 3 + i, hx, t.Y + fy, hz);
                            Ladder(wd, lx, lz);
                            list.Add(wd);
                        }
                    }
                    var core = NewMob("plasma_core", k, 150, t.X + 0.5, t.Y + 21, t.Z + 0.5);
                    Ladder(core, lx, lz);
                    core.Arena = new MobArena { X = t.X + 0.5, Z = t.Z + 0.5, R = 7.5, Y = t.Y + 20 }; // floats over the loggia, never leaves it
                    list.Add(core);
                    // a turret on the first and second floors, in the corners away from the ladder
                    var tu1 = NewMob("turret", k, 155, t.X - 5.5, t.Y + 7, t.Z + 6.5);
                    var tu2 = NewMob("turret", k, 156, t.X + 6.5, t.Y + 13, t.Z + 6.5);
                    Ladder(tu1, lx, lz);
                    Ladder(tu2, lx, lz);
                    list.Add(tu1);
                    list.Add(tu2);
                }
            }
            // the Merge Sanctum's twins: proof-of-work west, proof-of-stake east, linked, both kept on the disc
            {
                var m = World.MergeAt(Fl((x0 + 8) / (double)World.MERGE), Fl((z0 + 8) / (double)World.MERGE));
                if (m != null && World.COf(m.X) == cx && World.COf(m.Z) == cz)
                {
                    var arena = new MobArena { X = m.X + 0.5, Z = m.Z + 0.5, R = World.MERGE_R - 1.5, Y = m.Y + 1 };
                    var pw = NewMob("pow_twin", k, 160, m.X - 8.5, m.Y + 1, m.Z + 0.5);
                    var ps = NewMob("pos_twin", k, 161, m.X + 9.5, m.Y + 2.5, m.Z + 0.5);
                    pw.Arena = ps.Arena = arena;
                    pw.Twin = ps;
                    ps.Twin = pw;
                    list.Add(pw);
                    list.Add(ps);
                }
            }
            // the Mempool's Front-Runner: at the center of the floor, kept on it
            {
                var A = World.ArenaAt(Fl((x0 + 8) / (double)World.ARENA), Fl((z0 + 8) / (double)World.ARENA));
                if (A != null && World.COf(A.X) == cx && World.COf(A.Z) == cz)
                {
                    var fr = NewMob("front_runner", k, 170, A.X + 0.5, A.Y + 1, A.Z + 0.5);
                    fr.Arena = new MobArena { X = A.X + 0.5, Z = A.Z + 0.5, R = World.ARENA_R - 1.5, Y = A.Y + 1, Reach = World.ARENA_W + 1, HasReach = true };
                    list.Add(fr);
                }
            }
            // the Genesis Titan: a single boss in its own fixed lair
            if (cx == BOSS_CX && cz == BOSS_CZ)
            {
                int bx = x0 + 8, bz = z0 + 8, by = -1;
                for (int y = 25; y >= 1; y--)
                    if (W.Get(bx, y, bz) == 0 && W.IsSolid(W.Get(bx, y - 1, bz))) { by = y; break; }
                if (by >= 0)
                {
                    var gr = GroundAt(W, bx + 0.5, bz + 0.5, by, true, 3);
                    if (gr != null && !gr.Value.Water) list.Add(NewMob("titan", k, 0, bx + 0.5, gr.Value.Y, bz + 0.5));
                }
            }
            // garden guardians: around this region's Ether Garden, the same ring placement as a ruin's
            var gd = World.GardenAt(Fl((x0 + 8) / 64.0), Fl((z0 + 8) / 64.0));
            if (gd != null && World.COf(gd.X) == cx && World.COf(gd.Z) == cz)
            {
                for (int i = 0; i < 2; i++)
                {
                    double an = World.Hash(gd.X + i, gd.Z, 265) * Math.PI * 2,
                        rr = 3 + World.Hash(gd.X, gd.Z + i, 266) * 2,
                        hx = gd.X + 0.5 + Math.Cos(an) * rr,
                        hz = gd.Z + 0.5 + Math.Sin(an) * rr;
                    var gr = GroundAt(W, hx, hz, gd.Y, true, 3);
                    if (gr == null || gr.Value.Water) continue;
                    list.Add(NewMob("garden_guardian", k, 160 + i, hx, gr.Value.Y, hz));
                }
            }
            // sky raiders: on the floating islands
            {
                double r3 = World.Hash(cx * 5 - 3, cz * 11 + 7, 290);
                if (r3 < 0.22)
                {
                    int hx = x0 + 4 + Fl(World.Hash(cx, cz, 291) * 12), hz = z0 + 4 + Fl(World.Hash(cx, cz, 292) * 12), t = World.IslandTop(hx, hz);
                    if (t > 0) list.Add(NewMob("sky_raider", k, 170, hx + 0.5, t + 3, hz + 0.5));
                }
            }
            // deep lurkers: only in genuinely deep water (at least 5 blocks)
            {
                double r4 = World.Hash(cx * 11 + 5, cz * 7 - 2, 300);
                if (!Sanctuary(x0 + 8, z0 + 8) && r4 < 0.2)
                {
                    int hx = x0 + 4 + Fl(World.Hash(cx, cz, 301) * 12), hz = z0 + 4 + Fl(World.Hash(cx, cz, 302) * 12);
                    var top = TopSolid(W, hx, hz);
                    if (top != null && top.Value.id == 11)
                    {
                        int b = top.Value.y;
                        while (b > 0 && W.Get(hx, b - 1, hz) == 11) b--;
                        if (top.Value.y - b >= 5)
                        {
                            var m = NewMob("water_lurker", k, 180, hx + 0.5, b + (top.Value.y - b) / 2.0, hz + 0.5);
                            m.HasWlo = true;
                            m.Wlo = b;
                            list.Add(m);
                        }
                    }
                }
            }
            // the surface's own mob, one roll per chunk, by what the ground is: a gas scorpion on the dunes' sand, a
            // phishing spider on the forests' grass, a pump slime on the plains' grass, a cold wallet yeti on the
            // snow of the peaks (a few more columns tried for a peak's small patch of snow, a likelier roll)
            {
                bool found = false;
                int px = 0, pz = 0, py = 0, pt = 0;
                for (int i = 0; i < 6; i++)
                {
                    int hx = x0 + 2 + Fl(World.Hash(cx + i * 7, cz, 321 + i * 2) * 12), hz = z0 + 2 + Fl(World.Hash(cx, cz + i * 11, 322 + i * 2) * 12);
                    int h = World.HeightAt(hx, hz);
                    if (h <= World.SEA + 1 || World.IslandTop(hx, hz) > 0 || MobSafe(hx, hz)) continue;
                    var gr = GroundAt(W, hx + 0.5, hz + 0.5, h, true, 2);
                    if (gr == null || gr.Value.Water) continue;
                    int top = W.Get(hx, gr.Value.Y - 1, hz);
                    if (top == 16 || i == 0) { found = true; px = hx; pz = hz; py = gr.Value.Y; pt = top; }
                    if (top == 16) break;
                }
                if (found)
                {
                    string bi = World.Biome(px, pz);
                    string type = pt == 16 ? "yeti" : pt == 4 && bi == "dunes" ? "gas_scorpion" : pt == 1 && bi == "forest" ? "phish_spider" : pt == 1 && bi == "plain" ? "pump_slime" : null;
                    if (type != null && World.Hash(cx * 13 + 5, cz * 17 - 3, 320) < (type == "yeti" ? 0.7 : 0.3))
                        list.Add(NewMob(type, k, 200, px + 0.5, py, pz + 0.5));
                }
            }
            list.RemoveAll(a => Calm(a.Hx, a.Hz)); // the newcomers' calm: nobody around the Atrium
            return list;
        }
        static void Ladder(Mob a, double x, double z) { a.HasLadder = true; a.LadderX = x; a.LadderZ = z; }

        // prowler: the night prowler of a chunk, if it has one (null otherwise; the caller checks the dark)
        public static Mob Prowler(IMobWorld W, int cx, int cz)
        {
            string k = World.CKey(cx, cz);
            int x0 = cx * World.CH, z0 = cz * World.CH;
            if (MobSafe(x0 + 8, z0 + 8) || Calm(x0 + 8, z0 + 8) || World.Hash(cx * 23 + 9, cz * 31 + 13, 310) > 0.3) return null;
            int hx = x0 + 2 + Fl(World.Hash(cx, cz, 311) * 12), hz = z0 + 2 + Fl(World.Hash(cx, cz, 312) * 12);
            if (World.HeightAt(hx, hz) <= World.SEA + 1 || World.IslandTop(hx, hz) > 0) return null; // no prowlers over water or islands
            var gr = GroundAt(W, hx + 0.5, hz + 0.5, World.HeightAt(hx, hz), true, 2);
            if (gr == null || gr.Value.Water) return null;
            return NewMob("prowler", k, 190, hx + 0.5, gr.Value.Y, hz + 0.5);
        }
        // attackNodes: the network attack's nodes around the Atrium, during its window: one per free slot
        // (taken: the slots already standing or recently killed)
        public const int ATTACK_SLOTS = 7;
        public static List<Mob> AttackNodes(IMobWorld W, AttackWindow aw, Func<int, bool> taken)
        {
            string k = World.CKey(World.COf(World.SPAWN.X), World.COf(World.SPAWN.Z));
            var o = new List<Mob>();
            int wid = World.ToInt32(aw.WindowId);
            for (int slot = 0; slot < ATTACK_SLOTS; slot++)
            {
                if (taken(slot)) continue;
                double an = World.Hash(wid, slot, 401) * Math.PI * 2,
                    r = 10 + World.Hash(wid, slot, 402) * 6,
                    hx = World.SPAWN.X + Math.Cos(an) * r,
                    hz = World.SPAWN.Z + Math.Sin(an) * r;
                var gr = GroundAt(W, hx, hz, World.HeightAt(hx, hz), true, 2);
                if (gr == null || gr.Value.Water) continue;
                var a = NewMob("corrupted_node", k, 400 + slot, hx, gr.Value.Y, hz);
                a.WindowId = wid;
                a.Slot = slot;
                o.Add(a);
            }
            return o;
        }

        // ---------- who it's after ----------
        // target: the closest player, sticking to the one it already hunts unless another is clearly closer; a
        // player under the Ward Incense isn't seen, unless the mob is immune or was just struck
        public static MobTarget Target(Mob a, IList<MobTarget> cands)
        {
            MobTarget best = null, cur = null;
            double bd = double.PositiveInfinity;
            foreach (var c in cands)
            {
                if (c.Ward && !WARD_IMMUNE.Contains(a.Type) && !(a.Provoked > 0)) continue;
                c.D = Hy(a.X - c.X, a.Y - c.Y, a.Z - c.Z);
                if (c.D.Value < bd) { bd = c.D.Value; best = c; }
                if (c.Id == a.Tgt) cur = c;
            }
            if (cur != null && cur.D.Value < bd + 1.5) best = cur;
            a.Tgt = best?.Id;
            return best;
        }

        // ---------- how it moves and strikes ----------
        // eye: where a mob's shots leave from: a turret's lens, the middle of anything else
        public static void Eye(Mob a, out double x, out double y, out double z)
        {
            x = a.X;
            y = a.Y + MK[a.Type].Hit[1] * (a.Type == "turret" ? 0.8 : 0.5);
            z = a.Z;
        }
        // frontRun: below half health the Front-Runner calls in two Sandwich Bots, one each side of its target
        // (ev.Summon), and every few seconds it blinks through its target to the far side (ev.Blink)
        public static void FrontRun(Mob a, MobKind K, MobTarget tg, double d, bool aggro, double dt, MobEvents ev)
        {
            if (!a.Frenzy && a.Hp <= K.Hp / 2)
            {
                a.Frenzy = true;
                a.BlinkCd = 0.6;
                if (tg != null && ev.Summon != null)
                    foreach (var (i, s) in new[] { (171, 1), (172, -1) })
                    {
                        double ux = tg.X - a.X, uz = tg.Z - a.Z, ul = Or1(Hy(ux, uz)),
                            bx = Clamp(tg.X + (-uz / ul) * 3 * s, a.Arena.X - a.Arena.R, a.Arena.X + a.Arena.R),
                            bz = Clamp(tg.Z + (ux / ul) * 3 * s, a.Arena.Z - a.Arena.R, a.Arena.Z + a.Arena.R);
                        ev.Summon(a, i, bx, a.Arena.Y, bz, tg);
                    }
            }
            a.BlinkCd = (a.BlinkCd ?? K.Blink.Every * 0.6) - dt;
            if (!aggro || tg == null || d < K.Blink.Min || a.BlinkCd > 0 || a.RushT > 0) return;
            a.BlinkCd = a.Frenzy ? K.Blink.Fast : K.Blink.Every;
            // through its target and 2.5 blocks beyond, kept on the floor
            double ux2 = tg.X - a.X, uz2 = tg.Z - a.Z, ul2 = Or1(Hy(ux2, uz2));
            double nx = tg.X + (ux2 / ul2) * 2.5, nz = tg.Z + (uz2 / ul2) * 2.5;
            double ox = nx - a.Arena.X, oz = nz - a.Arena.Z, od = Hy(ox, oz);
            if (od > a.Arena.R)
            {
                nx = a.Arena.X + (ox / od) * a.Arena.R;
                nz = a.Arena.Z + (oz / od) * a.Arena.R;
            }
            double fx = a.X, fz = a.Z;
            a.X = nx;
            a.Z = nz;
            a.Ry = Math.Atan2(tg.X - nx, tg.Z - nz);
            a.AtkT = Math.Max(a.AtkT, 0.45); // a beat to react before it strikes
            ev.Blink?.Invoke(a, fx, fz);
        }
        // x || 1, for a length (0 and NaN give 1)
        static double Or1(double v) => v == 0 || double.IsNaN(v) ? 1 : v;

        // rangedAttack: turrets, the Plasma Core and the bosses that hit from afar: a charge, then a burst (ev.Fire)
        public static void RangedAttack(IMobWorld W, Mob a, MobKind K, MobTarget tg, bool aggro, double d, double dt, MobEvents ev)
        {
            var R = K.Ranged;
            double gap = R.Gap != 0 ? R.Gap : 0.2;
            if (a.Shots > 0)
            {
                // mid-burst: the next bolt after a short gap
                a.GapT -= dt;
                if (a.GapT <= 0)
                {
                    // (the JS reads tg.x here even when its target is gone, which throws and ends the server's tick;
                    // here that bolt is simply not fired)
                    if (tg != null) ev.Fire(a, R, tg);
                    a.Shots--;
                    a.GapT = gap;
                }
                return;
            }
            Eye(a, out var ex, out var ey, out var ez);
            bool canShoot = aggro && d > R.Min && LineClear(W, ex, ey, ez, tg.X, tg.Y + 1.2, tg.Z);
            if (a.ChargeT > 0)
            {
                a.ChargeT -= dt;
                if (a.ChargeT <= 0)
                {
                    if (canShoot)
                    {
                        ev.Fire(a, R, tg);
                        a.Shots = R.Burst - 1;
                        a.GapT = gap;
                    }
                    a.RangedT = R.Every != 0 ? R.Every : K.Cd;
                }
                return;
            }
            a.RangedT = Math.Max(0, a.RangedT - dt);
            if (canShoot && a.RangedT <= 0) a.ChargeT = R.Charge;
        }

        public const double STUN_S = 1.3, // struck by a parry: stunned this long, open to a riposte
            WIND_S = 0.3,                 // a mob's wind-up before a melee blow
            STAND = 0.9;                  // blocks: how close a hunting mob comes to its target
        // parried: struck by a parry, it reels back from (fx, fz), stunned
        public static void Parried(Mob a, double fx, double fz)
        {
            a.StunT = STUN_S;
            a.WindT = 0;
            double ux = a.X - fx, uz = a.Z - fz, ul = Or1(Hy(ux, uz));
            a.KbX = (ux / ul) * 7;
            a.KbZ = (uz / ul) * 7;
            a.KbT = 0.25;
        }
        // knock: a blow pushes it away from (fx, fz)
        public static void Knock(Mob a, double fx, double fz)
        {
            double dx = a.X - fx, dz = a.Z - fz, dd = Or1(Hy(dx, dz)), kb = MK[a.Type].Kb;
            a.KbX = (dx / dd) * kb;
            a.KbZ = (dz / dd) * kb;
            a.KbT = 0.25;
        }

        static double Wrap(double dr) => Math.Atan2(Math.Sin(dr), Math.Cos(dr));

        // step: one step of a living mob. tg is its target (from Target(), with tg.D its distance, tg.Ladder when
        // that player is climbing a ladder, tg.CanHurt false while they can't be hurt yet), or null. It moves, and
        // strikes through ev: ev.Melee (returns "parry" when the blow was parried), ev.Fire, ev.Summon, ev.Blink.
        // ev.Attacks(tg) says whether this mob may strike that target here. Returns what the drawing needs.
        public static MobStep Step(IMobWorld W, Mob a, MobTarget tg, double dt, MobEvents ev)
        {
            if (a.Provoked > 0) a.Provoked -= dt;
            if (a.StunT > 0)
            {
                // stunned by a parry: it sways on the spot, carried by the knockback, and does nothing else
                a.StunT -= dt;
                if (a.KbT > 0)
                {
                    a.KbT -= dt;
                    a.X += a.KbX * dt;
                    a.Z += a.KbZ * dt;
                }
                return new MobStep { Aggro = false, Moving = false, Stunned = true };
            }
            var K = MK[a.Type];
            double d = tg != null ? (tg.D ?? Hy(a.X - tg.X, a.Y - tg.Y, a.Z - tg.Z)) : double.PositiveInfinity; // in 3D: a buried mob doesn't bite through rock
            bool aggro = d < K.Aggro && !HuntSafe(a, a.X, a.Z);
            double ty0 = tg != null ? tg.Y : a.Y;
            double now = ev.Now ?? NowMs();
            double tx, tz;
            double? face = null;
            if (aggro)
            {
                tx = tg.X;
                tz = tg.Z;
                // close enough to strike: it stops a step away and faces its target, instead of walking into it
                double gx = tg.X - a.X, gz = tg.Z - a.Z;
                if (Hy(gx, gz) < Math.Min(STAND, K.Atk * 0.7) && !(a.RushT > 0))
                {
                    tx = a.X;
                    tz = a.Z;
                    face = Math.Atan2(gx, gz);
                }
            }
            else
            {
                double T = now / 1000 + a.Ph;
                tx = a.Hx + Math.Sin(T * 0.3) * 2;
                tz = a.Hz + Math.Cos(T * 0.23) * 2;
            }
            // a rush: a few seconds of sprint toward its target when they hang back, then a cooldown
            if (K.Rush != null)
            {
                a.RushCd = Math.Max(0, a.RushCd - dt);
                if (a.RushT > 0) a.RushT -= dt;
                else if (aggro && d > K.Rush.Min && a.RushCd <= 0)
                {
                    a.RushT = K.Rush.Time;
                    a.RushCd = K.Rush.Every * (a.Frenzy ? 0.6 : 1);
                }
            }
            if (K.Blink != null) FrontRun(a, K, tg, d, aggro, dt, ev);
            double spd = (aggro ? (a.RushT > 0 ? K.Rush.Speed : K.Sp) * (a.Frenzy ? 1.2 : 1) : K.Sp * 0.35) * dt,
                dx = tx - a.X,
                dz = tz - a.Z,
                dd = Hy(dx, dz);
            double nx = a.X, nz = a.Z;
            if (dd > 0.05)
            {
                double s = Math.Min(dd, spd);
                nx += (dx / dd) * s;
                nz += (dz / dd) * s;
                double dr = Wrap(Math.Atan2(dx, dz) - a.Ry);
                a.Ry += dr * Math.Min(1, dt * 6);
            }
            else if (face != null)
            {
                double dr = Wrap(face.Value - a.Ry);
                a.Ry += dr * Math.Min(1, dt * 6);
            }
            // a hunting mob stops at the edge of a protected zone (the Atrium and its calm too) and waits there facing its target
            if (aggro && HuntSafe(a, nx, nz))
            {
                nx = a.X;
                nz = a.Z;
            }
            if (a.KbT > 0)
            {
                a.KbT -= dt;
                nx += a.KbX * dt;
                nz += a.KbZ * dt;
            }
            if (a.HasLadder)
            {
                // tower mobs keep a step away from the ladder's hatch
                double lx = nx - a.LadderX, lz = nz - a.LadderZ, ld = Hy(lx, lz);
                if (ld < LADDER_CLEAR)
                {
                    nx = a.LadderX + (ld != 0 ? lx / ld : 1) * LADDER_CLEAR;
                    nz = a.LadderZ + (ld != 0 ? lz / ld : 0) * LADDER_CLEAR;
                }
            }
            if (a.Arena != null)
            {
                // the twins and the bosses never leave their floor: pulled back onto it at its edge
                double ox = nx - a.Arena.X, oz = nz - a.Arena.Z, od = Hy(ox, oz);
                if (od > a.Arena.R)
                {
                    nx = a.Arena.X + (ox / od) * a.Arena.R;
                    nz = a.Arena.Z + (oz / od) * a.Arena.R;
                }
            }
            // walkers step up one block at most, like the player: a taller wall stops them (they slide along it)
            bool walker = !FLYERS.Contains(a.Type);
            if (walker && (nx != a.X || nz != a.Z))
            {
                int fy = Fl(a.Y + 0.01);
                double px = a.X, pz = a.Z;
                bool Blocked(double x, double z)
                {
                    int xi = Fl(x), zi = Fl(z);
                    if (xi == Fl(px) && zi == Fl(pz)) return false;
                    return W.IsSolid(W.Get(xi, fy + 1, zi)) || (W.IsSolid(W.Get(xi, fy, zi)) && W.IsSolid(W.Get(xi, fy + 2, zi)));
                }
                // look a little ahead of the center, so a mob doesn't sink halfway into a wall before stopping
                bool Ahead(double x, double z)
                {
                    double mx = x - px, mz = z - pz, m = Or1(Hy(mx, mz));
                    return Blocked(x + (mx / m) * 0.35, z + (mz / m) * 0.35);
                }
                if (Ahead(nx, nz))
                {
                    if (!Ahead(nx, pz)) nz = pz;
                    else if (!Ahead(px, nz)) nx = px;
                    else
                    {
                        nx = px;
                        nz = pz;
                    }
                }
            }
            bool moved = Hy(nx - a.X, nz - a.Z) > 0.001;
            a.X = nx;
            a.Z = nz;
            // fliers and swimmers skip the ground snap and lerp toward a free height instead
            if (FLYERS.Contains(a.Type))
            {
                double T = now / 1000, ty;
                switch (a.Type)
                {
                    case "plasma_core":
                        ty = Clamp(aggro ? ty0 + 0.2 : a.Arena.Y + 0.5 + Math.Sin(T * 0.8 + a.Ph) * 0.3, a.Arena.Y + 0.2, a.Arena.Y + 1);
                        break;
                    case "pos_twin":
                        ty = Math.Max(a.Arena.Y + 0.3, aggro ? ty0 + 0.4 : a.Hy + Math.Sin(T * 0.9 + a.Ph) * 0.6);
                        break;
                    case "water_lurker":
                        ty = aggro ? Clamp(ty0, a.Wlo + 0.4, a.Hy - 0.2) : a.Hy - 0.5 + Math.Sin(T * 0.5 + a.Ph) * 0.3;
                        break;
                    case "bat":
                        ty = aggro ? ty0 + 0.3 : a.Hy + Math.Sin(T * 1.4 + a.Ph) * 0.4;
                        break;
                    default:
                        ty = aggro ? ty0 + 0.5 : a.Hy + Math.Sin(T * 0.6 + a.Ph) * 1.1;
                        break;
                }
                a.Y += (ty - a.Y) * Math.Min(1, dt * 3);
            }
            else
            {
                var gr = GroundAt(W, nx, nz, a.Y + 0.3, false, 1);
                if (gr != null && !gr.Value.Water) a.Y += (gr.Value.Y - a.Y) * Math.Min(1, dt * 10);
            }
            a.AtkT = Math.Max(0, a.AtkT - dt);
            bool may = aggro && tg != null && (ev.Attacks == null || ev.Attacks(tg)),
                holdFire = a.HasLadder && tg != null && tg.Ladder; // a tower mob waits while its target climbs
            if (K.Ranged != null && !holdFire) RangedAttack(W, a, K, tg, may, d, dt, ev);
            // no bite through a wall: it winds up first (WIND_S); the blow lands only if its target is still within
            // reach then (a little more: it lunges), which leaves a beat to raise a guard, step back or dodge
            bool CanBite(double reach)
            {
                if (!(may && !holdFire && d < reach && tg.CanHurt)) return false;
                Eye(a, out var ex, out var ey, out var ez);
                return LineClear(W, ex, ey, ez, tg.X, tg.Y + 1, tg.Z);
            }
            if (a.WindT > 0)
            {
                a.WindT -= dt;
                if (a.WindT <= 0)
                {
                    a.WindT = 0;
                    if (CanBite(K.Atk + 0.5))
                    {
                        a.AtkT = Math.Max(0, K.Cd - WIND_S); // the same pace of blows as without the wind-up
                        if (ev.Melee(a, tg) == "parry") Parried(a, tg.X, tg.Z);
                    }
                    else a.AtkT = 0.25; // it missed its moment
                }
            }
            else if (a.AtkT <= 0 && CanBite(K.Atk)) a.WindT = WIND_S;
            return new MobStep { Aggro = aggro, Moving = dd > 0.1 && moved };
        }
    }
}
