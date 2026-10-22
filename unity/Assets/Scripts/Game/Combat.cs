// Ether Mines · fighting (16-mobs.js, 10-loop.js): with the mining click, aiming a mob strikes it, aiming
// another player strikes them (outside the sanctuaries), the Plasma Pistol fires along your aim; the right
// button with a blade in hand raises your guard (a quarter of a blow from in front; raised just before
// the blow, a parry: none of it, and the mob reels, open to a riposte). The game server settles all of it:
// the mobs' health and death, your hearts (`hurt`, `hp`), the loot of a kill (`loot`). This screen shows it.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Combat : MonoBehaviour
    {
        public Session Session;
        public PlayerController Player;
        public Interaction Act;
        public Mobs Mobs;
        public Avatars Avatars;
        public GameLink Link;
        public Animals Animals;
        public Hover Hover; // on board: no fighting

        public int Hp = 10;
        const float Reach = 5.2f, BoltSpeed = 28, BoltLife = 1.6f;
        float atkT, rangedT, hurtFlash, shieldTold = -99, parryTold, guardFlash;
        string guardWord;
        bool pvpStruck, guard;
        int fq; string fx;
        public bool Guarding => guard;

        struct Bolt { public Transform T; public Vector3 P, V; public float Life; public bool Mine; public int Item; public double Dmg; }
        readonly List<Bolt> bolts = new List<Bolt>();
        Mesh sphere;
        GUIStyle heart;

        void Start()
        {
            var tmp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphere = tmp.GetComponent<MeshFilter>().sharedMesh;
            Destroy(tmp);
            Link.Message += OnMessage;
        }

        void OnDestroy() { if (Link != null) Link.Message -= OnMessage; }

        int Held => Act.Inv.HeldId;
        public static bool IsBlade(int id) { var it = Rules.Item(id); return Rules.Block(id) == null && it != null && it.HasDmg && !it.Ranged; }
        public static bool IsRanged(int id) { var it = Rules.Item(id); return Rules.Block(id) == null && it != null && it.Ranged; }
        double HeldDmg { get { var it = Rules.Item(Held); return Rules.Block(Held) == null && it != null && it.HasDmg ? it.Dmg : 1; } }
        int HeldWeapon => Rules.Block(Held) == null && Rules.Item(Held) != null ? Held : 0;

        // the plating you wear and the boots on your feet (your save: S.armor, S.boots), told to the server
        public int Armor
        {
            get
            {
                if (Session == null || !Session.State.TryGetValue("armor", out var a) || a == null) return 0;
                int id = a is string s ? (int.TryParse(s, out var v) ? v : 0) : MiniJson.ToInt(a);
                var it = Rules.Item(id);
                return it != null && it.HasArmor ? id : 0;
            }
        }
        public bool Boots => Session != null && Session.State.TryGetValue("boots", out var b) && b != null && (b is string s ? s == "211" : MiniJson.ToInt(b) == 211);
        public string Fx => fx;
        public int Fq => fq;

        static Vector3 V(Vector3 g) => new Vector3(g.x, g.y, -g.z);

        // called by Interaction each frame before mining: true when the click is for fighting (or the blade is
        // up), not for the block under the crosshair. The right button's own use (pet, open, place) comes first.
        public bool Fight(bool clicking, bool rightHeld, Vector3 eye, Vector3 dir, float blockDist, float reach = Reach)
        {
            if (!clicking) pvpStruck = false;
            bool blade = IsBlade(Held) && !(Hover != null && Hover.Aboard);
            bool g = rightHeld && blade;
            if (g != guard)
            {
                guard = g;
                Link.Send(new Dictionary<string, object> { ["t"] = "guard", ["on"] = g });
            }
            if (guard) return true;
            if (IsRanged(Held))
            {
                if (clicking && rangedT <= 0) Fire(eye, dir);
                return clicking; // the pistol fires instead of mining
            }
            if (Hover != null && Hover.Aboard) return false; // both hands on the craft
            // a mob, a player or an animal under the crosshair takes the click (10-loop.js: only while you
            // click; otherwise the right button still pets, places, opens as usual)
            if (!clicking) return false;
            var mob = Mobs.Pick(eye, dir, reach, blockDist);
            if (mob != null)
            {
                if (atkT <= 0) Strike(mob, HeldDmg, Player.Body.X, Player.Body.Z, HeldWeapon);
                return true;
            }
            if (!Interaction.Sanctuary(Player.Body.X, Player.Body.Z))
            {
                var who = Avatars.Pick(eye, dir, reach, blockDist);
                if (who != null)
                {
                    if (atkT <= 0 && !pvpStruck)
                    {
                        pvpStruck = true;
                        atkT = 0.45f;
                        Act.Swing = Mathf.Max(Act.Swing, 0.6f);
                        Link.Send(new Dictionary<string, object> { ["t"] = "hit", ["to"] = who, ["item"] = HeldWeapon });
                    }
                    return true;
                }
            }
            // an animal with hearts (attackAnimal): the villagers have none, the click mines past them
            var an = Animals != null ? Animals.Pick(eye, dir, reach, blockDist) : null;
            if (an != null && Animals.Fightable(an))
            {
                if (atkT <= 0)
                {
                    atkT = 0.45f;
                    Act.Swing = Mathf.Max(Act.Swing, 0.6f);
                    Animals.Strike(an, HeldDmg);
                }
                return true;
            }
            return false;
        }

        // a blow on a mob (damageMob): shown here at once, settled by the server, told to everyone near
        void Strike(Mobs.Mob a, double dmg, double fromX, double fromZ, int item)
        {
            Sounds.Hit("stone", a.Pos);
            Haptics.Play(Haptics.Kind.Medium);
            atkT = 0.45f;
            Act.Swing = Mathf.Max(Act.Swing, 0.6f);
            if (a.StunT > 0) dmg *= 1.5; // a riposte, while it reels from a parry
            if (a.ArenaReach > 0 && Math.Sqrt(Sq(Player.Body.X - a.ArenaX) + Sq(Player.Body.Z - a.ArenaZ)) > a.ArenaReach)
            {
                dmg *= 0.15;
                if (Time.time - shieldTold > 15)
                {
                    shieldTold = Time.time;
                    Hud.Feed("burn", "Shielded from afar", a.Type == "front_runner" ? "step inside the colosseum to really hurt it" : "step onto the disc to really hurt the twins");
                }
            }
            a.HitAt = Time.time;
            a.FlashT = 0.12f;
            double left = a.Hp - dmg;
            a.Hp = Math.Max(0.01, left); // the killing blow waits for the server's word
            Link.Send(new Dictionary<string, object>
            {
                ["t"] = "mob", ["id"] = a.Id, ["item"] = item, ["dmg"] = Math.Round(dmg, 2), ["hp"] = Math.Round(Math.Max(0, left), 2),
                ["x"] = Math.Round(a.Pos.x, 2), ["y"] = Math.Round(a.Pos.y, 2), ["z"] = Math.Round(a.Pos.z, 2), ["fx"] = Math.Round(fromX, 2), ["fz"] = Math.Round(fromZ, 2),
            });
        }
        static double Sq(double v) => v * v;

        // the Plasma Pistol: a bolt straight down the crosshair (fireRanged); the others see it fly
        void Fire(Vector3 eye, Vector3 dir)
        {
            rangedT = 0.35f;
            Sounds.Shoot();
            Haptics.Play(Haptics.Kind.Light);
            Act.Swing = Mathf.Max(Act.Swing, 0.5f);
            Spawn(eye, dir * BoltSpeed, new Color(0.37f, 0.91f, 1f), 1, true, HeldWeapon, HeldDmg);
            Link.Send(new Dictionary<string, object>
            {
                ["t"] = "shot", ["x"] = Math.Round(eye.x, 2), ["y"] = Math.Round(eye.y, 2), ["z"] = Math.Round(eye.z, 2),
                ["dx"] = Math.Round(dir.x, 3), ["dy"] = Math.Round(dir.y, 3), ["dz"] = Math.Round(dir.z, 3),
            });
        }

        void Spawn(Vector3 p, Vector3 v, Color c, float size, bool mine, int item = 0, double dmg = 0)
        {
            var go = new GameObject("bolt");
            go.transform.SetParent(transform, false);
            go.transform.localScale = Vector3.one * 0.24f * size;
            go.transform.position = V(p);
            go.AddComponent<MeshFilter>().sharedMesh = sphere;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = Mobs.Glow(c, 1);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            bolts.Add(new Bolt { T = go.transform, P = p, V = v, Life = mine ? BoltLife : 3, Mine = mine, Item = item, Dmg = dmg });
        }

        void Update()
        {
            float dt = Time.deltaTime;
            atkT = Mathf.Max(0, atkT - dt);
            rangedT = Mathf.Max(0, rangedT - dt);
            hurtFlash = Mathf.Max(0, hurtFlash - dt);
            guardFlash = Mathf.Max(0, guardFlash - dt);
            for (int i = bolts.Count - 1; i >= 0; i--)
            {
                var b = bolts[i];
                b.Life -= dt;
                b.P += b.V * dt;
                b.T.position = V(b.P);
                bool dead = b.Life <= 0 || Mesher.IsSolid(Act.World.Get(Mathf.FloorToInt(b.P.x), Mathf.FloorToInt(b.P.y), Mathf.FloorToInt(b.P.z)));
                if (!dead && b.Mine)
                {
                    // your bolt: the first mob it reaches takes the blow, or another player outside the sanctuaries
                    foreach (var a in Mobs.All.Values)
                    {
                        if (a.Hp <= 0 || a.DyingT >= 0) continue;
                        var h = a.Kind.Hit;
                        if (Vector3.Distance(b.P, a.Pos + Vector3.up * h[1] / 2) < 0.55f + h[0] / 2) { Strike(a, b.Dmg, b.P.x, b.P.z, b.Item); dead = true; break; }
                    }
                    if (!dead && !Interaction.Sanctuary(b.P.x, b.P.z))
                        foreach (var (id, pos) in Avatars.Visible())
                            if (Vector3.Distance(b.P, pos + Vector3.up * 0.9f) < 0.55f)
                            {
                                Link.Send(new Dictionary<string, object> { ["t"] = "hit", ["to"] = id, ["item"] = b.Item });
                                dead = true;
                                break;
                            }
                }
                bolts[i] = b;
                if (dead) { Destroy(b.T.gameObject); bolts.RemoveAt(i); }
            }
        }

        void OnMessage(string t, Dictionary<string, object> m)
        {
            switch (t)
            {
                case "welcome":
                    if (m.TryGetValue("hp", out var hp0) && hp0 is double) Hp = Mathf.Clamp(MiniJson.ToInt(hp0), 0, 10);
                    break;
                case "ms":
                    if (m.TryGetValue("l", out var l) && l is List<object> list) Mobs.Seen(list);
                    break;
                case "mob": MobWord(m); break;
                case "mshot":
                    {
                        var o = new Vector3(F(m, "x"), F(m, "y"), F(m, "z"));
                        var me = Player.Body;
                        if (me != null && new Vector2((float)(o.x - me.X), (float)(o.z - me.Z)).magnitude < 30) Sounds.Shoot(o);
                    }
                    // a mob's bolt: flown by the server, which says whom it hits; drawn here
                    Spawn(new Vector3(F(m, "x"), F(m, "y"), F(m, "z")), new Vector3(F(m, "vx"), F(m, "vy"), F(m, "vz")),
                          HexOf(m.TryGetValue("c", out var c) ? c : null), Mathf.Clamp(F(m, "s"), 0.5f, 3), false);
                    break;
                case "shot":
                    {
                        var d = new Vector3(F(m, "dx"), F(m, "dy"), F(m, "dz"));
                        if (d.sqrMagnitude > 0) Spawn(new Vector3(F(m, "x"), F(m, "y"), F(m, "z")), d.normalized * BoltSpeed, new Color(0.37f, 0.91f, 1f), 1, false);
                        break;
                    }
                case "hurt": Hurt(m); break;
                case "hp":
                    Hp = Mathf.Clamp(MiniJson.ToInt(m.TryGetValue("hp", out var hp) ? hp : null, Hp), 0, 10);
                    break;
                case "loot": Loot(m); break;
            }
        }

        static float F(Dictionary<string, object> m, string k) => (float)MiniJson.ToDouble(m.TryGetValue(k, out var v) ? v : null);
        static Color HexOf(object v)
        {
            int c = v is double d ? (int)d : 0xffffff;
            return new Color(((c >> 16) & 255) / 255f, ((c >> 8) & 255) / 255f, (c & 255) / 255f);
        }

        // a blow on a mob, settled by the server: yours comes back with what's left, the others' with their flash
        void MobWord(Dictionary<string, object> m)
        {
            var a = Mobs.Find(m.TryGetValue("id", out var id) ? id as string : "");
            if (a == null) return;
            bool dead = m.ContainsKey("dead"), down = m.ContainsKey("down"), both = m.ContainsKey("both");
            bool mine = (m.TryGetValue("from", out var f) ? f as string : null) == Link.SelfId;
            float dmg = mine ? 0 : F(m, "dmg");
            if (!mine && (a.Hp <= 0 && !(both && a.Down))) return;
            if (!mine && dmg > 0) a.Pos = Vector3.Lerp(a.Pos, new Vector3(F(m, "x"), F(m, "y"), F(m, "z")), 0.5f);
            Mobs.Struck(a, dmg, MiniJson.ToDouble(m["hp"]), dead, down && !dead);
            if (both)
            {
                // the Merge twins fell together: the other one goes too
                var parts = a.Id.Split('|');
                int slot = int.Parse(parts[1]);
                var tw = Mobs.Find(a.Type == "pow_twin" ? $"{parts[0]}|{slot + 1}|pos_twin" : $"{parts[0]}|{slot - 1}|pow_twin");
                if (tw != null) Mobs.Die(tw);
            }
            // a kill you took part in: the objectives remember it (a corrupted node: the Atrium defended)
            if (dead && Session != null && m.TryGetValue("by", out var byv) && byv is List<object> by && by.Contains(Link.SelfId))
            {
                Session.State["killedMob"] = 1.0;
                if (a.Type == "corrupted_node") Session.State["defended"] = 1.0;
                Session.Dirty = true;
            }
            if (down && !dead && mine) Hud.Feed("burn", a.Kind.N + " falls dormant…", "strike its twin down within 12 s, or it rises again");
        }

        // a blow reached you (health.js on the server): parried, blocked, or a hit; at 0, back to the sanctuary
        void Hurt(Dictionary<string, object> m)
        {
            var res = m.TryGetValue("res", out var r) ? r as string : "hit";
            if (res == "parry" || res == "block") Sounds.Hit("stone"); else Sounds.Hurt();
            Haptics.Play(res == "parry" ? Haptics.Kind.Success : res == "block" ? Haptics.Kind.Medium : Haptics.Kind.Heavy);
            float dmg = F(m, "dmg");
            if (res == "parry" || res == "block") { guardWord = res == "parry" ? "Parried!" : "Blocked"; guardFlash = 0.7f; }
            if (res == "parry" || (res == "block" && dmg == 0))
            {
                fx = res; fq = (fq + 1) & 0xffff;
                if (res == "parry")
                {
                    // the mob that struck reels (the server stunned it): the closest to where the blow came from
                    Mobs.Mob best = null;
                    float bd = 4;
                    foreach (var a in Mobs.All.Values)
                    {
                        float d = new Vector2(a.Pos.x - F(m, "x"), a.Pos.z - F(m, "z")).magnitude;
                        if (a.Hp > 0 && d < bd) { bd = d; best = a; }
                    }
                    if (best != null)
                    {
                        best.StunT = 1.3f;
                        if (parryTold < 2) { parryTold++; Hud.Feed("mint", "Parried!", "the " + best.Kind.N.Replace("The ", "") + " reels: strike now for extra damage"); }
                    }
                }
                return;
            }
            Hp = Mathf.Clamp(MiniJson.ToInt(m["hp"]), 0, 10);
            bool blocked = res == "block";
            fx = blocked ? "block" : "hurt"; fq = (fq + 1) & 0xffff;
            hurtFlash = 0.25f;
            // knocked back, away from the blow
            var b = Player.Body;
            double dx = b.X - F(m, "x"), dz = b.Z - F(m, "z"), dd = Math.Sqrt(dx * dx + dz * dz);
            // struck from right where you stand: pushed back, away from where you look
            if (dd < 0.05) { dx = Math.Sin(Player.Yaw); dz = Math.Cos(Player.Yaw); dd = 1; }
            b.MoveAxis(0, dx / dd * (blocked ? 1.2 : 2.4));
            b.MoveAxis(2, dz / dd * (blocked ? 1.2 : 2.4));
            if (!blocked) b.Vy = Math.Max(b.Vy, 4);
            if (m.ContainsKey("dead"))
            {
                Hud.Feed("burn", "You fell in combat", "back to the sanctuary");
                b.X = World.SPAWN.X + 0.5; b.Y = World.SPAWN.Y + 0.1; b.Z = World.SPAWN.Z + 2.5; b.Vy = 0;
                Hp = 10;
            }
        }

        // what a kill paid you (showLoot): an item, a unique, Diamond Shards, Gwei
        void Loot(Dictionary<string, object> m)
        {
            if (!(m.TryGetValue("r", out var rv) && rv is Dictionary<string, object> r) || !MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null)) return;
            var type = m.TryGetValue("type", out var ty) ? ty as string : "";
            var name = type == "merge_twins" ? "the Merge twins" : Mobs.Kinds.TryGetValue(type, out var k) ? "a " + k.N.ToLowerInvariant() : "a mob";
            if (r.TryGetValue("inv", out var inv) && inv is Dictionary<string, object> d) Act.Inv.SetCounts(d);
            if (r.TryGetValue("item", out var it) && it is double) Hud.Feed("burn", "1 " + Interaction.NameOf((int)(double)it), "→ dropped by " + name);
            if (r.TryGetValue("shards", out var sh) && sh is double) Hud.Feed("mint", (int)(double)sh + " Diamond Shard" + ((double)sh > 1 ? "s" : ""), "cut from the boss: the Genesis gear needs 4");
            if (r.TryGetValue("gwei", out var gw) && gw is double)
            {
                Hud.Feed("mint", "+" + (int)(double)gw + " Gwei", "dropped by " + name);
                if (r.TryGetValue("total_gwei", out var tg)) Session.Gwei = MiniJson.ToDouble(tg);
            }
            foreach (var key in new[] { "unique", "bonus" })
                if (r.TryGetValue(key, out var u) && u is Dictionary<string, object> uq)
                {
                    int uid = MiniJson.ToInt(uq.TryGetValue("id", out var ui) ? ui : null);
                    Hud.Feed("nft", Interaction.NameOf(uid) + " earned", key == "bonus" ? "bonus drop!" : "a boss's trophy");
                    _ = Session.LoadInventory();
                }
        }

        // your hearts, over the bar; a red flash when a blow lands
        void OnGUI()
        {
            Ui.Begin();
            if (!Link.HpServer) return;
            if (heart == null) heart = new GUIStyle(GUI.skin.label) { fontSize = 22, alignment = TextAnchor.MiddleCenter };
            float W = Ui.W, H = Ui.H, s = 24, x0 = W / 2 - 5 * s, y = H - 54 - 16 - 40;
            for (int i = 0; i < 10; i++)
            {
                var o = GUI.color;
                GUI.color = i < Hp ? new Color(1f, 0.36f, 0.48f) : new Color(1, 1, 1, 0.25f);
                GUI.Label(new Rect(x0 + i * s, y, s, s), "♥", heart);
                GUI.color = o;
            }
            // a blow met by your blade: said under the crosshair
            if (guardFlash > 0)
            {
                var o = GUI.color;
                GUI.color = guardWord == "Parried!" ? new Color(0.62f, 0.89f, 1f, Mathf.Clamp01(guardFlash * 2)) : new Color(1, 1, 1, Mathf.Clamp01(guardFlash * 2));
                var st = new GUIStyle(heart) { fontSize = 20, fontStyle = FontStyle.Bold };
                GUI.Label(new Rect(W / 2 - 100, H / 2 + 28, 200, 28), guardWord, st);
                GUI.color = o;
            }
            if (hurtFlash > 0)
            {
                var o = GUI.color;
                GUI.color = new Color(1, 0.1f, 0.2f, hurtFlash);
                GUI.DrawTexture(new Rect(0, 0, W, H), Texture2D.whiteTexture);
                GUI.color = o;
            }
        }
    }
}
