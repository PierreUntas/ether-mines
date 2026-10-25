// Ether Mines · the hostile mobs of one world, run here exactly as the game server runs them, for when there
// is no game server (offline play, or the server down). Ported from:
//   server/src/mobs.js   createMobSim: the chunks loaded around the players, the clock's rules, the ticks,
//                        the bolts, what each player sees (`ms`)
//   server/src/server.js the mobs' ledger (hp, down, deadUntil), mobBlow (a player's blow on a mob: its damage,
//                        a death, the respawn timers, the Merge twins' rule, who takes part in the loot), PvP
//                        blows, and the client messages the server reads (pos, mob, hit, guard, parry, heal,
//                        use, dodge, edit)
//   server/src/health.js the players' hearts: a blow with its guard, parry and armor, regen, healing, a death
// The messages it sends are the server's own (ms, mob, mshot, hurt, hp, used, welcome), as MiniJson values
// (doubles, strings, bools, List<object>, Dictionary<string, object>): the client feeds them to the same
// handlers as the server's (Combat.cs, Mobs.cs). The loot of a kill can't be paid from here (the server
// pays it with srv_loot_mob): the decision goes out through Loot, and the caller pays it (then SendLoot).
// CoreTests/MobsParity.cs replays the game server's own runs (golden-mobs.mjs) against this.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace EtherMines.Core
{
    // the terrain the mobs walk (terrain.js on the server): the blocks, and which chunks are there to load
    public interface IMobTerrain : IMobWorld
    {
        bool Has(int cx, int cz);    // the chunk's blocks are known
        bool Ready(int cx, int cz);  // ...and final (the server: read from Supabase): mobs may spawn on it
        // the chunks around (cx, cz), r chunks out, nearest first, at most `budget` new ones made; returns
        // what's left of the budget
        int Around(int cx, int cz, int r, int budget);
        // a block a player changed (the client's `edit`)
        void Edit(int x, int y, int z, int id);
    }

    // the game's own loaded chunks (ChunkStore) as the mobs' terrain: a chunk is ready once it is loaded
    // (the client streams them in itself, so Around makes none, and its edits already land in the store)
    public sealed class StoreTerrain : IMobTerrain
    {
        readonly ChunkStore store;
        public StoreTerrain(ChunkStore store) { this.store = store; }
        public int Get(int x, int y, int z) => store.Get(x, y, z);
        public bool IsSolid(int id) => Mesher.IsSolid(id);
        public bool IsCross(int id) => Mesher.IsCross(id);
        public bool Has(int cx, int cz) => store.Has(cx, cz);
        public bool Ready(int cx, int cz) => store.Has(cx, cz);
        public int Around(int cx, int cz, int r, int budget) => budget;
        public void Edit(int x, int y, int z, int id) { }
    }

    // a connected player, as the server keeps them: where they stand and what they hold (from `pos`), their
    // hearts (health.js), their pace of blows. Owned: the weapons, platings and uniques they really have (the
    // server reads them from Supabase; here the caller fills it in): a weapon not in it strikes as bare hands.
    public sealed class MobPlayer
    {
        public string Id, Name = "";
        public bool HasPos;
        public double X, Y, Z, Yaw;
        public bool Ward, Ladder, NoMobs, Guard;
        public int Held, Armor, Boots;
        public int Helm, Gloves, Amulet; // a helmet, gauntlets, an amulet worn (24-gear.js), as their screen says
        public readonly HashSet<int> Owned = new HashSet<int>();
        public object Tag; // the caller's own
        // health.js
        public double Hp, RegenAt, InvulnUntil, GraceUntil, GuardAt;
        public double? DodgeAt;
        public readonly Dictionary<string, double> HealAt = new Dictionary<string, double>();
        // server.js
        public double LastHit, LastMobHit;
        public readonly Dictionary<string, double> LastHitOn = new Dictionary<string, double>();
        // mobs.js view(): when each mob was last sent; and whether the last `ms` was empty
        internal readonly Dictionary<string, double> MobSent = new Dictionary<string, double>();
        internal bool LastEmpty;
    }

    // a mob's entry in the ledger (server.js mobsOf): its health, who struck it and when, a twin's sleep, a death
    public sealed class MobLedger
    {
        public double Hp, At, Down, DeadUntil;
        public readonly List<string> ByOrder = new List<string>();
        public readonly Dictionary<string, double> By = new Dictionary<string, double>();
        public void Struck(string id, double now) { if (!By.ContainsKey(id)) ByOrder.Add(id); By[id] = now; }
    }

    // the loot of a kill, for one player who took part (payLoot's srv_loot_mob call): the mob's type
    // ('merge_twins' when both twins fell together) and where it is paid (the player, or the mob)
    public sealed class MobLoot
    {
        public string PlayerId, Type;
        public double X, Y, Z;
    }

    public sealed class MobSim
    {
        // ---------- mobs.js ----------
        public const double TICK_MS = 100;
        const double SEE = 48, // blocks: how far around you the mobs are sent
            BOLT_SEE = 96,
            REST_FAR = 24,    // a mob never goes to rest with a player this close
            PARRY_REACH = 6,
            IDLE_MS = 500,    // a wandering mob's place goes out twice a second
            BOLT_LIFE = 3,    // s
            BOLT_HIT = 0.4;   // half a player's width
        const int BOLT_STEPS = 4; // per tick
        // what a player's screen needs to draw a mob: its flags
        const int F_RUSH = 1, F_FRENZY = 2, F_STUN = 4, F_AGGRO = 8, F_DOWN = 16, F_WIND = 32;

        // ---------- server.js ----------
        public const int PROTOCOL = 2;
        const double RANGE_MOB = 64, RANGE_HIT_MELEE = 8, RANGE_HIT_RANGED = 40;
        // PvP and mob blows: the weapons' damage (WEAPONS in server.js, ITEM[id].dmg in rules.js)
        public static readonly Dictionary<int, double> WEAPONS = new Dictionary<int, double> { [106] = 2.5, [107] = 5, [301] = 7.5, [206] = 4 };
        // power: the gauntlets the striker wears (a blade only: server.js pvpDamage)
        public static double PvpDamage(int item, double power = 0) => Math.Max(1, World.JsRound((WEAPONS.TryGetValue(item, out var w) ? w : 1) * 0.4 * (1 + (BLADES.Contains(item) ? power : 0))));
        const int PISTOL = 206;
        const double COOLDOWN_MELEE = 450, COOLDOWN_RANGED = 300; // ms between two blows
        const double PVP_FLOOR_MS = 700;
        static readonly Regex MOB_ID_RE = new Regex(@"^(-?\d{1,6},-?\d{1,6})\|(\d{1,4})\|([a-z_]{1,20})$", RegexOptions.CultureInvariant);
        static readonly Dictionary<string, double> MOB_RESPAWN = new Dictionary<string, double> { ["corrupted_node"] = 25000 }; // ms
        const double MOB_RESPAWN_MS = 120000,
            MOB_FORGET = 300000, // a mob nobody struck for 5 minutes is forgotten (back to full health)
            SHARE_MS = 30000,    // whoever struck it in the last 30 s gets their own loot
            TWIN_DOWN_MS = 12000,
            MOB_SLACK = 0.8,
            RIPOSTE = 2.25,      // the most a blow can be raised: a critical blow (×1.5) on a riposte after a parry (×1.5)
            SWEEP_MS = 2000;     // the ledger is swept with the server's 2 s tick

        // ---------- health.js ----------
        public const double MAX_HP = 10;
        const double PARRY_MS = 350 + 150,
            REGEN_MS = 4000, REGEN_AFTER_HURT_MS = 6000, GRACE_MS = 2500, REMEMBER_MS = 10 * 60000,
            DODGE_SAFE_MS = 350 + 100, DODGE_EVERY_MS = 1400;
        static readonly double GUARD_ARC = Math.Cos((80 * Math.PI) / 180); // in front: within 80 degrees of where you look
        public static readonly HashSet<int> BLADES = new HashSet<int> { 106, 107, 301 };

        sealed class Chunk { public int Cx, Cz; public string K; public readonly List<Mob> List = new List<Mob>(), Resting = new List<Mob>(); }
        sealed class Bolt { public double X, Y, Z, Vx, Vy, Vz, Life, Dmg, Ox, Oz; }

        readonly IMobTerrain W;
        readonly List<Chunk> chunkList = new List<Chunk>(); // in the order they were loaded (the JS Map's order)
        readonly Dictionary<string, Chunk> chunks = new Dictionary<string, Chunk>();
        readonly Dictionary<string, Mob> byId = new Dictionary<string, Mob>();
        readonly List<Bolt> bolts = new List<Bolt>();
        readonly List<MobPlayer> players = new List<MobPlayer>(); // the room, in the order they joined
        readonly Dictionary<string, MobLedger> ledger = new Dictionary<string, MobLedger>();
        readonly Dictionary<string, (double hp, double at)> memory = new Dictionary<string, (double, double)>();
        double nextSweep;

        // whether the caller pays the loot of a kill (the server's `pays`: then `paid` goes out with the kill,
        // the screens don't ask, and the tonic is only taken through UseItem)
        public bool PaysLoot;
        // what goes out to one player (the server's send)
        public event Action<MobPlayer, Dictionary<string, object>> Send;
        // the loot of a kill, one call per player who took part (when PaysLoot): pay it, then SendLoot
        public event Action<MobLoot> Loot;
        // an Ether Tonic used (`use`, item 303, when PaysLoot): take it from the inventory and return the result
        // ({ ok: true } heals), as srv_use_item does
        public Func<MobPlayer, int, Dictionary<string, object>> UseItem;
        // every mob stepped in a tick, in order (tests, debugging)
        public event Action<Mob> Stepped;
        public Action<string> Log = _ => { };
        static readonly Dictionary<int, double> ARMOR = new Dictionary<int, double>();
        static readonly Dictionary<int, double> HELM = new Dictionary<int, double>(), POWER = new Dictionary<int, double>(), REGEN = new Dictionary<int, double>();
        // what a player wears and owns in a slot: its stat, or 0 (health.js worn)
        static double Worn(MobPlayer p, int item, Dictionary<int, double> stats) => item != 0 && stats.TryGetValue(item, out var v) && Owns(p, item) ? v : 0;

        // now: the time the server started (ms): its ledger sweep beats from it
        public MobSim(IMobTerrain terrain, double now)
        {
            W = terrain;
            nextSweep = now + SWEEP_MS;
            if (ARMOR.Count == 0 && Rules.Loaded)
                foreach (var it in Rules.Items.Values)
                {
                    if (it.HasArmor && it.Armor != 0) ARMOR[it.Id] = it.Armor;
                    if (it.Helm != 0) HELM[it.Id] = it.Helm;
                    if (it.Power != 0) POWER[it.Id] = it.Power;
                    if (it.Regen != 0) REGEN[it.Id] = it.Regen;
                }
        }

        public IReadOnlyList<MobPlayer> Players => players;
        public int Count => byId.Count;
        public int BoltCount => bolts.Count;
        public Mob Find(string id) { byId.TryGetValue(id, out var a); return a; }
        public IEnumerable<Mob> Mobs { get { foreach (var c in chunkList) foreach (var a in c.List) yield return a; } }
        public MobLedger LedgerOf(string id) { ledger.TryGetValue(id, out var s); return s; }
        public MobPlayer Player(string id) { foreach (var p in players) if (p.Id == id) return p; return null; }

        void Tell(MobPlayer p, Dictionary<string, object> m) => Send?.Invoke(p, m);
        static double R2(double v) => World.JsRound(v * 100) / 100;

        // ========== the room (server.js hello / close) ==========
        // a player connects with their hello ({ hp, ar, bt, nm }): welcomed (`welcome`), their hearts as they
        // last had them here or as their screen says. The same id again replaces the old one in place.
        public MobPlayer Join(string id, Dictionary<string, object> hello, double now, string name = null)
        {
            hello = Numbers(hello) ?? new Dictionary<string, object>();
            var p = new MobPlayer
            {
                Id = id,
                Name = name ?? id,
                Armor = IsInt(Get(hello, "ar"), out var ar) ? ar : 0,
                Boots = Truthy(Get(hello, "bt")) ? 211 : 0,
                Helm = IsInt(Get(hello, "hm"), out var hm) ? hm : 0,
                Gloves = IsInt(Get(hello, "gl"), out var gl) ? gl : 0,
                Amulet = IsInt(Get(hello, "am"), out var am) ? am : 0,
                NoMobs = Truthy(Get(hello, "nm")),
            };
            HealthJoin(p, Get(hello, "hp"), now);
            int i = players.FindIndex(q => q.Id == id);
            if (i >= 0) players[i] = p;
            else players.Add(p);
            Tell(p, new Dictionary<string, object>
            {
                ["t"] = "welcome", ["id"] = p.Id, ["name"] = p.Name, ["protocol"] = (double)PROTOCOL, ["mobs"] = 1.0, ["hp"] = p.Hp, ["loot"] = PaysLoot ? 1.0 : 0.0,
            });
            return p;
        }

        public void Leave(MobPlayer p, double now)
        {
            HealthLeave(p, now);
            int i = players.IndexOf(p);
            if (i >= 0) players.RemoveAt(i);
        }

        // ========== the server's 100 ms beat (server.js simTick, and its 2 s tick for the ledger) ==========
        public void Tick(double now)
        {
            if (players.Count == 0)
            {
                // nobody left: the world's mobs stop (the server drops the simulation, made again on the next hello)
                chunkList.Clear();
                chunks.Clear();
                byId.Clear();
                bolts.Clear();
            }
            else
            {
                foreach (var p in players) Regen(p, now);
                try { SimTick(players, TICK_MS / 1000, now); }
                catch (Exception e) { Log("mobs: " + e); }
                foreach (var p in players)
                {
                    if (!p.HasPos || p.NoMobs) continue;
                    var l = View(p, now);
                    // an empty view goes out once (the last mobs around you are gone), then not again
                    if (l.Count == 0 && p.LastEmpty) continue;
                    p.LastEmpty = l.Count == 0;
                    Tell(p, new Dictionary<string, object> { ["t"] = "ms", ["l"] = l });
                }
            }
            if (now >= nextSweep)
            {
                nextSweep += SWEEP_MS;
                var gone = new List<string>();
                foreach (var kv in ledger)
                    if (kv.Value.DeadUntil != 0 ? now >= kv.Value.DeadUntil : now - kv.Value.At > MOB_FORGET) gone.Add(kv.Key);
                foreach (var id in gone) ledger.Remove(id);
            }
        }

        // ========== mobs.js ==========
        bool Dead(string id, double now) => ledger.TryGetValue(id, out var s) && s.DeadUntil != 0 && now < s.DeadUntil;
        void Add(Chunk c, Mob a)
        {
            a.Id = MobsCore.MobId(a);
            c.List.Add(a);
            byId[a.Id] = a;
        }
        void Remove(Chunk c, Mob a)
        {
            c.List.Remove(a);
            if (byId.TryGetValue(a.Id, out var b) && b == a) byId.Remove(a.Id);
        }
        void Load(int cx, int cz, double now)
        {
            var k = World.CKey(cx, cz);
            if (chunks.ContainsKey(k) || !W.Ready(cx, cz)) return;
            var c = new Chunk { Cx = cx, Cz = cz, K = k };
            chunks[k] = c;
            chunkList.Add(c);
            foreach (var a in MobsCore.SpawnChunk(W, cx, cz)) if (!Dead(MobsCore.MobId(a), now)) Add(c, a);
            // the twins know each other again (one may have been left out as dead)
            foreach (var a in c.List) if (a.Twin != null && !c.List.Contains(a.Twin)) a.Twin = null;
        }
        void Unload(Chunk c)
        {
            foreach (var a in c.List) if (byId.TryGetValue(a.Id, out var b) && b == a) byId.Remove(a.Id);
            foreach (var a in c.Resting) if (a.Id != null && byId.TryGetValue(a.Id, out var b) && b == a) byId.Remove(a.Id);
            chunks.Remove(c.K);
            chunkList.Remove(c);
        }
        static double D3(MobPlayer p, Mob a) => World.Hypot(p.X - a.X, p.Y - a.Y, p.Z - a.Z);

        // rules: resting by day, the night prowler, the network attack, a relit validator's guardians
        void Rules_(Chunk c, double night, AttackWindow aw, List<MobPlayer> here, double now)
        {
            var k = c.K;
            if (night < 0.35)
            {
                foreach (var a in c.List.ToArray())
                {
                    if (MobsCore.DAY_WATCH.Contains(a.Type) || a.Hp != MobsCore.MK[a.Type].Hp) continue;
                    if (here.Exists(p => D3(p, a) < REST_FAR)) continue;
                    Remove(c, a);
                    c.Resting.Add(a);
                }
            }
            else if (night > 0.55 && c.Resting.Count > 0)
            {
                var back = c.Resting.ToArray();
                c.Resting.Clear();
                foreach (var a in back)
                {
                    a.X = a.Hx; a.Y = a.Hy; a.Z = a.Hz;
                    Add(c, a);
                }
            }
            // the night prowler comes and goes with the dark
            var pr = c.List.Find(a => a.Type == "prowler");
            if (pr != null && night < 0.35) Remove(c, pr);
            else if (pr == null && night >= 0.55 && !Dead(k + "|190|prowler", now))
            {
                var a = MobsCore.Prowler(W, c.Cx, c.Cz);
                if (a != null) Add(c, a);
            }
            // the network attack's wave, around the Atrium, during its window
            if (World.COf(World.SPAWN.X) == c.Cx && World.COf(World.SPAWN.Z) == c.Cz)
            {
                var nodes = c.List.FindAll(a => a.Type == "corrupted_node");
                if (!aw.Active || (nodes.Count > 0 && nodes[0].WindowId != World.ToInt32(aw.WindowId))) foreach (var a in nodes) Remove(c, a);
                if (aw.Active)
                {
                    var taken = new HashSet<int>();
                    foreach (var a in c.List) if (a.Type == "corrupted_node") taken.Add(a.Slot);
                    foreach (var a in MobsCore.AttackNodes(W, aw, s => taken.Contains(s) || Dead(k + "|" + (400 + s) + "|corrupted_node", now))) Add(c, a);
                }
            }
            // a guardian whose validator was relit (by anyone) is gone for good
            foreach (var a in c.List.ToArray()) if (a.Type == "guardian" && W.Get(a.RuinX, a.RuinY + 1, a.RuinZ) != 73) Remove(c, a);
        }

        void SimTick(List<MobPlayer> all, double dt, double now)
        {
            // a player who turned hostile mobs off is not hunted, not hit, and keeps no mobs alive around them
            var here = all.FindAll(p => p.HasPos && !p.NoMobs);
            // the chunks around the players: loaded (when their terrain is ready), the others dropped
            var want = new HashSet<string>();
            int budget = 3; // new chunks made per tick, for all the players together
            foreach (var p in here)
            {
                int pcx = World.COf(p.X), pcz = World.COf(p.Z);
                budget = W.Around(pcx, pcz, MobsCore.MOB_R + 1, budget);
                for (int dz = -MobsCore.MOB_R; dz <= MobsCore.MOB_R; dz++)
                    for (int dx = -MobsCore.MOB_R; dx <= MobsCore.MOB_R; dx++)
                    {
                        want.Add(World.CKey(pcx + dx, pcz + dz));
                        if (W.Has(pcx + dx, pcz + dz)) Load(pcx + dx, pcz + dz, now);
                    }
            }
            foreach (var c in chunkList.ToArray()) if (!want.Contains(c.K)) Unload(c);
            double night = MobsCore.NightOf(MobsCore.Clock(now).Day);
            var aw = MobsCore.AttackWindowAt(now);
            foreach (var c in chunkList.ToArray()) Rules_(c, night, aw, here, now);
            var ev = new MobEvents
            {
                Now = now,
                Melee = (a, tg) => Hurt((MobPlayer)tg.Player, MobsCore.MK[a.Type].Dmg, a.X, a.Z, "melee", now, null),
                Fire = (a, R, tg) => Fire(a, R, tg, here),
                Summon = (a, i, x, y, z, tg) =>
                {
                    chunks.TryGetValue(a.K, out var c);
                    string id = a.K + "|" + i + "|mev_bot";
                    if (c == null || byId.ContainsKey(id) || Dead(id, now)) return;
                    var m = MobsCore.NewMob("mev_bot", a.K, i, x, y, z);
                    m.Arena = a.Arena.Copy();
                    m.Arena.Reach = 0;
                    m.Arena.HasReach = true;
                    m.Provoked = 15;
                    Add(c, m);
                },
            };
            FlyBolts(here, dt, now);
            foreach (var c in chunkList.ToArray())
                foreach (var a in c.List.ToArray())
                {
                    if (ledger.TryGetValue(a.Id, out var s))
                    {
                        if (s.DeadUntil != 0 && now < s.DeadUntil)
                        {
                            Remove(c, a); // killed: gone until it comes back (a chunk loaded again after that)
                            continue;
                        }
                        if (s.Down != 0 && now < s.Down)
                        {
                            a.Hp = 0;
                            a.Down = true; // a Merge twin, dormant: it waits
                            continue;
                        }
                        if (a.Down)
                        {
                            // the twin rises again, at 60%
                            a.Down = false;
                            s.Down = 0;
                            s.Hp = World.JsRound(MobsCore.MK[a.Type].Hp * 0.6);
                        }
                        a.Hp = s.Hp;
                    }
                    if (a.Hp <= 0) continue;
                    var list = new List<MobTarget>(here.Count);
                    foreach (var p in here)
                        list.Add(new MobTarget { Id = p.Id, X = p.X, Y = p.Y, Z = p.Z, Ward = p.Ward, Ladder = p.Ladder, CanHurt = Open(p, now), Player = p });
                    var tg = MobsCore.Target(a, list);
                    var st = MobsCore.Step(W, a, tg, dt, ev);
                    a.Aggro = st.Aggro;
                    Stepped?.Invoke(a);
                }
        }

        // ev.fire: a bolt flown here (it hurts whoever it reaches) and shown to everyone nearby (`mshot`)
        void Fire(Mob a, MobRanged R, MobTarget tg, List<MobPlayer> here)
        {
            MobsCore.Eye(a, out var x, out var y, out var z);
            double tx = tg.X, ty = tg.Y + 1.2, tz = tg.Z, dd = World.Hypot(tx - x, ty - y, tz - z);
            if (dd == 0 || double.IsNaN(dd)) dd = 1;
            bolts.Add(new Bolt
            {
                X = x, Y = y, Z = z,
                Vx = ((tx - x) / dd) * R.Speed, Vy = ((ty - y) / dd) * R.Speed, Vz = ((tz - z) / dd) * R.Speed,
                Life = BOLT_LIFE, Dmg = R.Dmg, Ox = x, Oz = z,
            });
            var msg = new Dictionary<string, object>
            {
                ["t"] = "mshot", ["id"] = a.Id, ["to"] = tg.Id,
                ["x"] = R2(x), ["y"] = R2(y), ["z"] = R2(z),
                ["vx"] = R2(((tx - x) / dd) * R.Speed), ["vy"] = R2(((ty - y) / dd) * R.Speed), ["vz"] = R2(((tz - z) / dd) * R.Speed),
                ["dmg"] = R.Dmg, ["c"] = (double)R.Color, ["s"] = R.Size != 0 ? R.Size : 1.6,
                ["hl"] = 1.0, // harmless on the screens: this says who it hits
            };
            foreach (var p in here) if (World.Hypot(p.X - x, p.Z - z) <= BOLT_SEE) Tell(p, msg);
        }

        // flyBolts: the bolts fly on, in small steps: the first solid block stops one, the first player it reaches is hit
        void FlyBolts(List<MobPlayer> here, double dt, double now)
        {
            for (int i = bolts.Count - 1; i >= 0; i--)
            {
                var b = bolts[i];
                bool dead = false;
                for (int k = 0; k < BOLT_STEPS && !dead; k++)
                {
                    double t = dt / BOLT_STEPS;
                    b.X += b.Vx * t;
                    b.Y += b.Vy * t;
                    b.Z += b.Vz * t;
                    b.Life -= t;
                    if (b.Life <= 0 || W.IsSolid(W.Get((int)Math.Floor(b.X), (int)Math.Floor(b.Y), (int)Math.Floor(b.Z)))) dead = true;
                    else
                        foreach (var p in here)
                            if (Math.Abs(b.X - p.X) < BOLT_HIT && Math.Abs(b.Z - p.Z) < BOLT_HIT && b.Y > p.Y && b.Y < p.Y + 1.85)
                            {
                                Hurt(p, b.Dmg, b.Ox, b.Oz, "bolt", now, null);
                                dead = true;
                                break;
                            }
                }
                if (dead) bolts.RemoveAt(i);
            }
        }

        // view: what a player sees: the mobs within SEE blocks, [id, x, y, z, ry, hp, flags, charge]. A mob on the
        // hunt goes out every time; one quietly wandering only twice a second
        List<object> View(MobPlayer p, double now)
        {
            var l = new List<object>();
            var sent = p.MobSent;
            foreach (var c in chunkList)
                foreach (var a in c.List)
                {
                    if (World.Hypot(a.X - p.X, a.Z - p.Z) > SEE) continue;
                    if (!a.Aggro && !(a.StunT > 0) && !(a.ChargeT > 0) && now - (sent.TryGetValue(a.Id, out var t) ? t : 0) < IDLE_MS) continue;
                    sent[a.Id] = now;
                    int f = (a.RushT > 0 ? F_RUSH : 0) | (a.Frenzy ? F_FRENZY : 0) | (a.StunT > 0 ? F_STUN : 0) | (a.Aggro ? F_AGGRO : 0) | (a.Down ? F_DOWN : 0) | (a.WindT > 0 ? F_WIND : 0);
                    var K = MobsCore.MK[a.Type];
                    double charge = a.ChargeT > 0 && K.Ranged != null ? R2(1 - a.ChargeT / K.Ranged.Charge) : 0;
                    l.Add(new List<object> { a.Id, R2(a.X), R2(a.Y), R2(a.Z), R2(a.Ry), R2(a.Hp), (double)f, charge });
                }
            if (sent.Count > 400)
            {
                var old = new List<string>();
                foreach (var kv in sent) if (now - kv.Value > 5000) old.Add(kv.Key);
                foreach (var id in old) sent.Remove(id);
            }
            return l;
        }

        // struck: a blow landed (the ledger already took the health off): it's knocked back and provoked
        void Struck(string id, double fx, double fz, double hp)
        {
            if (!byId.TryGetValue(id, out var a)) return;
            a.Provoked = 15;
            a.Hp = hp;
            MobsCore.Knock(a, fx, fz);
        }
        // parry: a player parried this mob's blow: it reels back from them
        bool Parry(MobPlayer p, string id)
        {
            if (!byId.TryGetValue(id, out var a) || !p.HasPos || World.Hypot(a.X - p.X, a.Z - p.Z) > PARRY_REACH) return false;
            MobsCore.Parried(a, p.X, p.Z);
            return true;
        }

        // ========== server.js: what a client says ==========
        // (the message as the client builds it, or as MiniJson parsed it: ints, floats and longs are read as the
        // JSON's doubles would be)
        public void Receive(MobPlayer me, Dictionary<string, object> m, double now)
        {
            m = Numbers(m);
            if (me == null || m == null || !(Get(m, "t") is string t)) return;
            switch (t)
            {
                case "pos":
                    {
                        double? x = Num(Get(m, "x"), 1e5), y = Num(Get(m, "y"), 1e3), z = Num(Get(m, "z"), 1e5);
                        if (x == null || y == null || z == null) return;
                        me.HasPos = true;
                        me.X = x.Value; me.Y = y.Value; me.Z = z.Value;
                        me.Ward = Truthy(Get(m, "wd")); // under the Ward Incense: most mobs don't see you
                        me.Yaw = Num(Get(m, "yaw"), 100) ?? me.Yaw; // where you look: a guard only covers what's in front
                        me.Held = IsInt(Get(m, "h"), out var h) ? h : 0;
                        if (m.TryGetValue("ar", out var arv) && (arv == null || IsInt(arv, out _))) me.Armor = IsInt(arv, out var ar) ? ar : 0;
                        me.Boots = Truthy(Get(m, "bt")) ? 211 : 0;
                        me.Helm = IsInt(Get(m, "hm"), out var hm) ? hm : 0;
                        me.Gloves = IsInt(Get(m, "gl"), out var gl) ? gl : 0;
                        me.Amulet = IsInt(Get(m, "am"), out var am) ? am : 0;
                        me.NoMobs = Truthy(Get(m, "nm"));
                        GuardOn(me, Truthy(Get(m, "gd")), now);
                        me.Ladder = Truthy(Get(m, "ld")); // on a ladder: tower mobs hold their blows
                        break;
                    }
                case "hit": PvpHit(me, m, now); break;
                case "mob": if (m.ContainsKey("item")) MobBlow(me, m, now); break;
                case "dodge": Dodge(me, now); break;
                case "guard": GuardOn(me, Truthy(Get(m, "on")), now); break;
                case "heal":
                    {
                        // a bed at night, a hunted animal; a tonic only when nobody can take it from the inventory
                        double day = MobsCore.Clock(now).Day;
                        string kind = Str(Get(m, "kind"), 8);
                        if (kind == "tonic")
                        {
                            if (PaysLoot || now - (me.HealAt.TryGetValue("tonicTrust", out var tt) ? tt : 0) < 20000) return;
                            me.HealAt["tonicTrust"] = now;
                            Heal(me, "tonic", false, now);
                        }
                        else Heal(me, kind, day <= 0.25 || day >= 0.78, now);
                        break;
                    }
                case "use":
                    {
                        // an Ether Tonic: taken from the inventory (UseItem, the server's srv_use_item), then it heals
                        var item = Get(m, "item");
                        if (!PaysLoot || !(item is double d && d == 303) || UseItem == null)
                        {
                            var no = new Dictionary<string, object> { ["t"] = "used" };
                            if (item != null) no["item"] = item;
                            no["r"] = new Dictionary<string, object> { ["ok"] = false, ["err"] = "not usable here" };
                            Tell(me, no);
                            return;
                        }
                        var r = UseItem(me, 303);
                        if (r == null) r = new Dictionary<string, object> { ["ok"] = false, ["err"] = "try again in a moment" };
                        else if (r.TryGetValue("ok", out var ok) && Truthy(ok)) Heal(me, "tonic", false, now);
                        Tell(me, new Dictionary<string, object> { ["t"] = "used", ["item"] = 303.0, ["r"] = r });
                        break;
                    }
                case "parry": Parry(me, Str(Get(m, "id"), 80)); break;
                case "edit":
                    {
                        // a block changed: the mobs walk the new terrain
                        if (IsInt(Get(m, "x"), out var x) && IsInt(Get(m, "y"), out var y) && IsInt(Get(m, "z"), out var z) && IsInt(Get(m, "id"), out var id) && y >= 0 && y < World.SY)
                            W.Edit(x, y, z, id);
                        break;
                    }
            }
        }

        // the weapon a blow is really struck with: the one claimed if this player has it, bare hands otherwise
        static int WeaponOf(MobPlayer p, object item) => IsInt(item, out var i) && WEAPONS.ContainsKey(i) && p.Owned.Contains(i) ? i : 0;
        static bool Owns(MobPlayer p, int item) => p.Owned.Contains(item);

        // a PvP blow: only on a player really within reach, at the weapon's pace, never in the sanctuary
        void PvpHit(MobPlayer me, Dictionary<string, object> m, double now)
        {
            var to = Str(Get(m, "to"), 64);
            var tgt = Player(to);
            if (tgt == null || tgt == me || !tgt.HasPos || !me.HasPos) return;
            int item = WeaponOf(me, Get(m, "item"));
            bool ranged = item == PISTOL;
            if (now - me.LastHit < (ranged ? COOLDOWN_RANGED : COOLDOWN_MELEE)) return;
            if (World.Hypot(tgt.X - me.X, tgt.Z - me.Z) > (ranged ? RANGE_HIT_RANGED : RANGE_HIT_MELEE)) return;
            me.LastHit = now;
            if (MobsCore.Sanctuary(tgt.X, tgt.Z) || now - (me.LastHitOn.TryGetValue(tgt.Id, out var lh) ? lh : 0) < PVP_FLOOR_MS) return;
            me.LastHitOn[tgt.Id] = now;
            Hurt(tgt, PvpDamage(item, Worn(me, me.Gloves, POWER)), me.X, me.Z, ranged ? "bolt" : "pvp", now, me.Id);
        }

        static string TwinOf(string k, int i, string type) =>
            type == "pow_twin" ? k + "|" + (i + 1) + "|pos_twin" : type == "pos_twin" ? k + "|" + (i - 1) + "|pow_twin" : null;
        // mobState: the mob's ledger entry, made when it's first struck (a twin that slept long enough rises at 60%)
        MobLedger MobState(string id, string type, double now, double? init)
        {
            ledger.TryGetValue(id, out var s);
            if (s != null && s.DeadUntil != 0 && now >= s.DeadUntil) s = null; // back again
            if (s != null && s.Down != 0 && now >= s.Down) { s.Down = 0; s.Hp = World.JsRound(MobsCore.MK[type].Hp * 0.6); }
            if (s == null) ledger[id] = s = new MobLedger { Hp = init ?? MobsCore.MK[type].Hp, At = now };
            return s;
        }
        List<string> StruckBy(MobLedger s, double now)
        {
            var l = new List<string>();
            foreach (var id in s.ByOrder) if (now - s.By[id] < SHARE_MS) l.Add(id);
            return l;
        }

        // mobBlow: a blow on a mob: checked, settled, and told to everyone nearby (the striker included)
        void MobBlow(MobPlayer me, Dictionary<string, object> m, double now)
        {
            string id = Str(Get(m, "id"), 80);
            var r = MOB_ID_RE.Match(id);
            double? x = Num(Get(m, "x"), 1e5), y = Num(Get(m, "y"), 1e3), z = Num(Get(m, "z"), 1e5);
            if (!r.Success || !MobsCore.MK.ContainsKey(r.Groups[3].Value) || !me.HasPos || x == null || y == null || z == null) return;
            string k = r.Groups[1].Value, type = r.Groups[3].Value;
            int slot = int.Parse(r.Groups[2].Value, CultureInfo.InvariantCulture);
            var sim = Find(id); // run here: its own position, its own health
            var s = MobState(id, type, now, sim != null ? sim.Hp : (double?)null);
            int item = WeaponOf(me, Get(m, "item"));
            bool ranged = item == PISTOL;
            double ax = sim != null ? sim.X : x.Value, ay = sim != null ? sim.Y : y.Value, az = sim != null ? sim.Z : z.Value;
            var msg = new Dictionary<string, object>
            {
                ["t"] = "mob", ["id"] = id, ["from"] = me.Id, ["dmg"] = 0.0, ["hp"] = s.Hp, ["x"] = ax, ["y"] = ay, ["z"] = az,
                ["fx"] = Num(Get(m, "fx"), 1e5) ?? x.Value, ["fz"] = Num(Get(m, "fz"), 1e5) ?? z.Value,
            };
            bool pace = now - me.LastMobHit >= (ranged ? COOLDOWN_RANGED : COOLDOWN_MELEE) * MOB_SLACK,
                // the reach from where the mob really is (a little slack: what you saw was a moment ago)
                reach = World.Hypot(ax - me.X, az - me.Z) <= (ranged ? RANGE_HIT_RANGED : RANGE_HIT_MELEE) + (sim != null ? 1.5 : 0);
            if (s.Hp <= 0 || !pace || !reach)
            {
                // nothing taken off: the striker's screen is put right (a mob already dead, a blow too soon)
                if (s.DeadUntil != 0) msg["dead"] = 1.0;
                else if (s.Down != 0) msg["down"] = 1.0;
                Tell(me, msg);
                return;
            }
            me.LastMobHit = now;
            double bs = WEAPONS.TryGetValue(item, out var w) ? w : 1,
                // gauntlets you own raise a blade's blows: the cap rises with them
                power = BLADES.Contains(item) ? Worn(me, me.Gloves, POWER) : 0,
                dmg = Math.Max(0, Math.Min(Num(Get(m, "dmg"), 1e4) ?? bs, bs * RIPOSTE * (1 + power)));
            s.Hp = Math.Max(0, ToFixed2(s.Hp - dmg));
            s.At = now;
            s.Struck(me.Id, now);
            msg["dmg"] = ToFixed2(dmg);
            msg["hp"] = s.Hp;
            List<MobLoot> pay = null;
            if (s.Hp <= 0)
            {
                string tw = TwinOf(k, slot, type);
                MobLedger o = null;
                if (tw != null) ledger.TryGetValue(tw, out o);
                if (tw != null && !(o != null && o.Hp <= 0 && o.Down > now))
                {
                    s.Down = now + TWIN_DOWN_MS; // the first twin to fall only sleeps
                    msg["down"] = 1.0;
                }
                else
                {
                    double back = now + (MOB_RESPAWN.TryGetValue(type, out var rs) ? rs : MOB_RESPAWN_MS);
                    var by = StruckBy(s, now);
                    s.DeadUntil = back;
                    if (o != null)
                    {
                        // both twins down together: both done for, and both paid whoever fought either
                        o.Down = 0;
                        o.DeadUntil = back;
                        foreach (var p in StruckBy(o, now)) if (!by.Contains(p)) by.Add(p);
                        msg["both"] = 1.0;
                    }
                    msg["dead"] = 1.0;
                    var byl = new List<object>();
                    foreach (var p in by) byl.Add(p);
                    msg["by"] = byl;
                    if (PaysLoot)
                    {
                        msg["paid"] = 1.0; // the caller pays each of them (their screens don't ask)
                        string lt = msg.ContainsKey("both") ? "merge_twins" : type;
                        pay = new List<MobLoot>();
                        foreach (var pid in by)
                        {
                            var q = Player(pid);
                            bool hasPos = q != null && q.HasPos;
                            pay.Add(new MobLoot { PlayerId = pid, Type = lt, X = hasPos ? q.X : ax, Y = hasPos ? q.Y : ay, Z = hasPos ? q.Z : az });
                        }
                    }
                }
            }
            if (sim != null) Struck(id, (double)msg["fx"], (double)msg["fz"], s.Hp);
            foreach (var key in new[] { "x", "y", "z" }) msg[key] = World.JsRound((double)msg[key] * 100) / 100;
            Tell(me, msg);
            // to everyone in the world within reach of the striker
            foreach (var p in players)
                if (p != me && p.HasPos && World.Hypot(p.X - me.X, p.Z - me.Z) <= RANGE_MOB) Tell(p, msg);
            // the loot goes out after the blow's word (the server's srv_loot_mob answers later)
            if (pay != null) foreach (var l in pay) Loot?.Invoke(l);
        }

        // what a kill paid a player (the caller's answer to Loot): told to them as the server tells it
        public void SendLoot(string playerId, string type, object r)
        {
            var p = Player(playerId);
            if (p != null) Tell(p, new Dictionary<string, object> { ["t"] = "loot", ["type"] = type, ["r"] = r });
        }

        // ========== health.js ==========
        void HealthJoin(MobPlayer p, object claimed, double now)
        {
            if (memory.TryGetValue(p.Id, out var mm) && now - mm.at < REMEMBER_MS) p.Hp = mm.hp;
            else
            {
                double c = ToNumber(claimed);
                if (double.IsNaN(c) || c == 0) c = MAX_HP;
                p.Hp = Math.Max(1, Math.Min(MAX_HP, World.JsRound(c)));
            }
            p.RegenAt = now + REGEN_MS;
            p.InvulnUntil = 0;
            p.GraceUntil = 0;
            p.HealAt.Clear();
        }
        void HealthLeave(MobPlayer p, double now)
        {
            memory[p.Id] = (p.Hp, now);
            if (memory.Count > 5000)
            {
                var old = new List<string>();
                foreach (var kv in memory) if (now - kv.Value.at > REMEMBER_MS) old.Add(kv.Key);
                foreach (var k in old) memory.Remove(k);
            }
        }
        // open: can a blow land on them right now (not just struck, not just respawned)?
        public static bool Open(MobPlayer p, double now) => p.Hp > 0 && now >= p.InvulnUntil && now >= p.GraceUntil;
        static bool Facing(MobPlayer p, double mx, double mz)
        {
            double dx = mx - p.X, dz = mz - p.Z, d = World.Hypot(dx, dz);
            return d < 0.05 || (-Math.Sin(p.Yaw) * dx - Math.Cos(p.Yaw) * dz) / d > GUARD_ARC;
        }
        static bool Guarding(MobPlayer p) => p.Guard && BLADES.Contains(p.Held) && Owns(p, p.Held);

        // hurt: a blow from (mx, mz): "parry" (none of it, and the striker reels), "block", "hit", or null (it can't land)
        public string Hurt(MobPlayer p, double dmg, double mx, double mz, string kind, double now, string from)
        {
            if (!p.HasPos || !(p.Hp > 0) || now < p.InvulnUntil || now < p.GraceUntil) return null;
            bool blocked = false;
            Dictionary<string, object> Msg(double d, string res)
            {
                var o = new Dictionary<string, object> { ["t"] = "hurt", ["dmg"] = d, ["hp"] = p.Hp, ["x"] = mx, ["z"] = mz, ["kind"] = kind, ["res"] = res };
                if (from != null) o["from"] = from;
                return o;
            }
            if (Guarding(p) && Facing(p, mx, mz))
            {
                bool parry = now - p.GuardAt < PARRY_MS;
                if (parry || kind == "bolt")
                {
                    p.InvulnUntil = now + 350;
                    Tell(p, Msg(0, parry ? "parry" : "block"));
                    return parry ? "parry" : "block";
                }
                dmg *= 0.25;
                blocked = true;
            }
            // the plating takes its share, then the helmet its share of what's left
            double armor = p.Armor != 0 && Owns(p, p.Armor) && ARMOR.TryGetValue(p.Armor, out var av) ? av : 0, helm = Worn(p, p.Helm, HELM);
            dmg = Math.Max(blocked ? 0 : 1, World.JsRound(dmg * (1 - armor) * (1 - helm)));
            if (dmg == 0)
            {
                p.InvulnUntil = now + 350;
                Tell(p, Msg(0, "block"));
                return "block";
            }
            p.Hp = Math.Max(0, p.Hp - dmg);
            p.RegenAt = now + REGEN_AFTER_HURT_MS;
            p.InvulnUntil = now + 500;
            var msg = Msg(dmg, blocked ? "block" : "hit");
            if (p.Hp <= 0)
            {
                // fallen: back at the sanctuary, full hearts, a moment out of reach
                msg["dead"] = 1.0;
                p.Hp = MAX_HP;
                p.GraceUntil = now + GRACE_MS;
                p.RegenAt = now + REGEN_MS;
            }
            Tell(p, msg);
            return blocked ? "block" : "hit";
        }
        // regen: a heart back now and then
        void Regen(MobPlayer p, double now)
        {
            if (p.Hp >= MAX_HP || now < p.RegenAt) return;
            p.Hp++;
            p.RegenAt = now + REGEN_MS * (1 - Worn(p, p.Amulet, REGEN)); // an amulet: sooner
            Tell(p, new Dictionary<string, object> { ["t"] = "hp", ["hp"] = p.Hp });
        }
        // heal: a bed at night (full), a hunted animal (+1), a tonic taken (+5)
        bool Heal(MobPlayer p, string kind, bool night, double now)
        {
            double every;
            switch (kind) { case "bed": every = 30000; break; case "hunt": every = 1500; break; case "tonic": every = 0; break; default: return false; }
            if (p.Hp <= 0) return false;
            if (now - (p.HealAt.TryGetValue(kind, out var at) ? at : double.NegativeInfinity) < every) return false;
            if (kind == "bed" && !night) return false;
            p.HealAt[kind] = now;
            p.Hp = kind == "bed" ? MAX_HP : Math.Min(MAX_HP, p.Hp + (kind == "tonic" ? 5 : 1));
            Tell(p, new Dictionary<string, object> { ["t"] = "hp", ["hp"] = p.Hp });
            return true;
        }
        // dodge: with the Front-Runner Boots (worn and owned): out of reach for a moment, then a recharge
        bool Dodge(MobPlayer p, double now)
        {
            if (p.Boots != 211 || !Owns(p, 211) || now - (p.DodgeAt ?? double.NegativeInfinity) < DODGE_EVERY_MS) return false;
            p.DodgeAt = now;
            p.InvulnUntil = Math.Max(p.InvulnUntil, now + DODGE_SAFE_MS);
            return true;
        }
        // guard: up or down (the moment it happens: a parry is about timing)
        static void GuardOn(MobPlayer p, bool on, double now)
        {
            if (on && !p.Guard) p.GuardAt = now;
            p.Guard = on;
        }

        // ========== the JS's ways with values ==========
        // a message's top-level numbers as doubles (what they'd be after a trip through JSON)
        static Dictionary<string, object> Numbers(Dictionary<string, object> m)
        {
            if (m == null) return null;
            bool any = false;
            foreach (var v in m.Values) if (v is int || v is long || v is float || v is short || v is byte || v is decimal) { any = true; break; }
            if (!any) return m;
            var o = new Dictionary<string, object>(m.Count);
            foreach (var kv in m)
                o[kv.Key] = kv.Value is int || kv.Value is long || kv.Value is float || kv.Value is short || kv.Value is byte || kv.Value is decimal
                    ? Convert.ToDouble(kv.Value, CultureInfo.InvariantCulture) : kv.Value;
            return o;
        }
        static object Get(Dictionary<string, object> m, string k) => m.TryGetValue(k, out var v) ? v : null;
        // num(): a finite number within lim, or null
        static double? Num(object v, double lim) => v is double d && !double.IsNaN(d) && !double.IsInfinity(d) && Math.Abs(d) <= lim ? d : (double?)null;
        // str(): a string cut to max, or ''
        static string Str(object v, int max) => v is string s ? (s.Length > max ? s.Substring(0, max) : s) : "";
        // Number.isInteger
        static bool IsInt(object v, out int i)
        {
            i = 0;
            if (!(v is double d) || double.IsNaN(d) || double.IsInfinity(d) || d != Math.Floor(d) || Math.Abs(d) > int.MaxValue) return false;
            i = (int)d;
            return true;
        }
        static bool Truthy(object v) => MiniJson.Truthy(v);
        // Number(v)
        static double ToNumber(object v)
        {
            if (v == null) return double.NaN; // undefined (a null would be 0: the same here, both give MAX_HP)
            if (v is double d) return d;
            if (v is bool b) return b ? 1 : 0;
            if (v is string s) { s = s.Trim(); if (s.Length == 0) return 0; return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) ? r : double.NaN; }
            return double.NaN;
        }
        // +v.toFixed(2): the double's exact decimal value, rounded to two places
        static double ToFixed2(double v) => double.Parse(v.ToString("F2", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
    }
}
