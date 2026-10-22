// Ether Mines · the hostile mobs as you see them, run by the game server (16-mobs.js serverMob,
// drawServerMobs, animateMob): it says ten times a second where each one near you stands (`ms`), and this
// draws them with the web version's own models (Resources/mobs.json, exported from buildMob by
// tools/export-mobs.mjs), smoothed toward where they were last seen, walking, flapping, spinning, winding
// up a blow, reeling from a parry, flashing when struck, bursting into cubes when they fall.
// The models are in the game's coordinates (their front is +z): mirrored here like the world (z -> -z,
// the turns about x and y reversed).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Mobs : MonoBehaviour
    {
        public sealed class Kind { public string Type, N; public double Hp; public float[] Hit; public Color Bolt; public float BoltSize; public object Model; public float Scale = 1; }
        public sealed class Mob
        {
            public string Id, Type, K;
            public Kind Kind;
            public GameObject Root;
            public Vector3 Pos, Target;  // game coordinates
            public float Yaw, TYaw, SeenAt, Walk, Ph, StunT, WindK, LungeT, DyingT = -1, FlashT, ChargeK;
            public bool Aggro, Frenzy, Wind, WasWind, Down;
            public double Hp;
            public float HitAt;              // you struck it (a moment's grace before the server's word)
            public float ArenaX, ArenaZ, ArenaReach; // the twins and the Front-Runner: hurt for real only from inside
            public readonly Dictionary<string, Transform> Parts = new Dictionary<string, Transform>();
            public readonly Dictionary<Transform, Vector3> Euler = new Dictionary<Transform, Vector3>(); // three.js angles
            public readonly List<(Renderer r, Material m)> Mats = new List<(Renderer, Material)>();
            public float Scale;
        }

        public PlayerController Player;
        public readonly Dictionary<string, Kind> Kinds = new Dictionary<string, Kind>();
        public readonly Dictionary<string, Mob> All = new Dictionary<string, Mob>();
        static Mesh cube;
        readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();
        Material flash;
        GUIStyle barStyle;

        struct Bit { public Transform T; public Vector3 V; public float Life; }
        readonly List<Bit> bits = new List<Bit>();

        void Awake()
        {
            var root = (Dictionary<string, object>)MiniJson.Parse(Resources.Load<TextAsset>("mobs").text);
            foreach (var kv in (Dictionary<string, object>)root["types"])
            {
                var d = (Dictionary<string, object>)kv.Value;
                var hit = (List<object>)d["hit"];
                var k = new Kind { Type = kv.Key, N = d["n"] as string, Hp = MiniJson.ToDouble(d["hp"]), Hit = new[] { (float)MiniJson.ToDouble(hit[0]), (float)MiniJson.ToDouble(hit[1]), (float)MiniJson.ToDouble(hit[2]) }, Model = d["model"] };
                if (d["ranged"] is Dictionary<string, object> r) { k.Bolt = Avatars.Hex(r["color"] as string, Color.white); k.BoltSize = (float)MiniJson.ToDouble(r["size"], 1.6); }
                if (k.Model is Dictionary<string, object> m && m.TryGetValue("s", out var s)) k.Scale = (float)MiniJson.ToDouble(s, 1);
                Kinds[kv.Key] = k;
            }
            var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube = tmp.GetComponent<MeshFilter>().sharedMesh;
            Destroy(tmp);
            flash = Glow(Color.white, 1);
        }

        public Material Lit(Color c)
        {
            var key = "l" + ColorUtility.ToHtmlStringRGB(c);
            if (mats.TryGetValue(key, out var m)) return m;
            m = new Material(Shader.Find("EtherMines/Avatar"));
            m.SetColor("_Color", c);
            m.SetColor("_Glow", Color.black);
            return mats[key] = m;
        }

        public Material Glow(Color c, float op)
        {
            var key = "g" + ColorUtility.ToHtmlStringRGB(c) + op;
            if (mats.TryGetValue(key, out var m)) return m;
            m = new Material(Shader.Find("EtherMines/Glow"));
            c.a = op;
            m.SetColor("_Color", c);
            if (op < 1)
            {
                m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0);
                m.renderQueue = 3000;
            }
            return mats[key] = m;
        }

        // three.js Euler angles (order XYZ by default, YXZ for a mob's root) seen in the mirror (z -> -z): the
        // turns about x and y change direction, the turn about z stays
        public static Quaternion Mirror(Vector3 e, bool yxz = false)
        {
            var qx = Quaternion.AngleAxis(-e.x * Mathf.Rad2Deg, Vector3.right);
            var qy = Quaternion.AngleAxis(-e.y * Mathf.Rad2Deg, Vector3.up);
            var qz = Quaternion.AngleAxis(e.z * Mathf.Rad2Deg, Vector3.forward); // in the mirror's plane: unchanged
            return yxz ? qy * qx * qz : qx * qy * qz;
        }
        static Vector3 V(List<object> l) => new Vector3((float)MiniJson.ToDouble(l[0]), (float)MiniJson.ToDouble(l[1]), (float)MiniJson.ToDouble(l[2]));
        public static Vector3 View(Vector3 g) => new Vector3(g.x, g.y, -g.z);

        void Build(Mob a, Dictionary<string, object> n, Transform parent, bool root)
        {
            var go = new GameObject(n.TryGetValue("part", out var part) ? part as string : "node");
            var t = go.transform;
            t.SetParent(parent, false);
            var p = V((List<object>)n["p"]);
            if (!root) t.localPosition = new Vector3(p.x, p.y, -p.z);
            var e = n.TryGetValue("r", out var r) ? V((List<object>)r) : Vector3.zero;
            if (!root) { t.localRotation = Mirror(e); a.Euler[t] = e; }
            if (!root && n.TryGetValue("s", out var s)) t.localScale = Vector3.one * (float)MiniJson.ToDouble(s, 1);
            if (part is string ps) a.Parts[ps] = t;
            if (n.TryGetValue("b", out var b))
            {
                var box = V((List<object>)b);
                var c = Avatars.Hex(n["c"] as string, Color.magenta);
                bool glow = n.ContainsKey("g");
                float op = n.TryGetValue("o", out var o) ? (float)MiniJson.ToDouble(o, 1) : 1;
                var mesh = new GameObject("box");
                mesh.transform.SetParent(t, false);
                mesh.transform.localScale = box;
                mesh.AddComponent<MeshFilter>().sharedMesh = cube;
                var mr = mesh.AddComponent<MeshRenderer>();
                mr.sharedMaterial = glow ? Glow(c, op) : Lit(c);
                mr.shadowCastingMode = glow ? UnityEngine.Rendering.ShadowCastingMode.Off : UnityEngine.Rendering.ShadowCastingMode.On;
                a.Mats.Add((mr, mr.sharedMaterial));
            }
            if (n.TryGetValue("k", out var k))
                foreach (var ch in (List<object>)k) Build(a, (Dictionary<string, object>)ch, t, false);
            if (root) a.Root = go;
        }

        Mob Make(string id, string type)
        {
            var k = Kinds[type];
            var parts = id.Split('|');
            var a = new Mob { Id = id, Type = type, K = parts[0], Kind = k, Hp = k.Hp, Scale = k.Scale, Ph = UnityEngine.Random.value * 6 };
            Build(a, (Dictionary<string, object>)k.Model, transform, true);
            a.Root.name = k.N;
            // the arenas: the Merge twins only really feel a blow from someone on their disc, the Front-Runner
            // from someone inside the colosseum (16-mobs.js damageMob, mobs-core.js spawnChunk)
            var ck = parts[0].Split(',');
            int cx = int.Parse(ck[0]), cz = int.Parse(ck[1]), x0 = cx * World.CH, z0 = cz * World.CH;
            if (type == "pow_twin" || type == "pos_twin")
            {
                var m = World.MergeAt((int)Math.Floor((x0 + 8.0) / World.MERGE), (int)Math.Floor((z0 + 8.0) / World.MERGE));
                if (m != null) { a.ArenaX = m.X + 0.5f; a.ArenaZ = m.Z + 0.5f; a.ArenaReach = World.MERGE_R - 1.5f + 2.5f; }
            }
            else if (type == "front_runner")
            {
                var m = World.ArenaAt((int)Math.Floor((x0 + 8.0) / World.ARENA), (int)Math.Floor((z0 + 8.0) / World.ARENA));
                if (m != null) { a.ArenaX = m.X + 0.5f; a.ArenaZ = m.Z + 0.5f; a.ArenaReach = World.ARENA_W + 1; }
            }
            return a;
        }

        // a model from a JSON node (mobs.json, animals.json) into a holder's parts, under parent
        public void BuildModel(Mob holder, Dictionary<string, object> model, Transform parent)
        {
            Build(holder, model, transform, true);
            holder.Root.transform.SetParent(parent, false);
        }

        // a part turned to these three.js angles (mirrored)
        public static void Pose(Mob a, string part, Vector3 e)
        {
            if (!a.Parts.TryGetValue(part, out var t)) return;
            a.Euler[t] = e;
            t.localRotation = Mirror(e);
        }

        public Mob Find(string id) { All.TryGetValue(id, out var a); return a; }

        // the server's word: [id, x, y, z, ry, hp, flags, charge] for each mob near you
        public void Seen(List<object> list)
        {
            foreach (var o in list)
            {
                if (!(o is List<object> e) || e.Count < 8 || !(e[0] is string id)) continue;
                var type = id.Substring(id.LastIndexOf('|') + 1);
                if (!Kinds.ContainsKey(type)) continue;
                float x = (float)MiniJson.ToDouble(e[1]), y = (float)MiniJson.ToDouble(e[2]), z = (float)MiniJson.ToDouble(e[3]), ry = (float)MiniJson.ToDouble(e[4]);
                double hp = MiniJson.ToDouble(e[5]);
                int f = MiniJson.ToInt(e[6]);
                float charge = (float)MiniJson.ToDouble(e[7]);
                if (!All.TryGetValue(id, out var a))
                {
                    if (hp <= 0 && (f & 16) == 0) continue;
                    a = Make(id, type);
                    a.Pos = a.Target = new Vector3(x, y, z);
                    a.Yaw = a.TYaw = ry;
                    All[id] = a;
                }
                if (a.DyingT >= 0) continue;
                a.Target = new Vector3(x, y, z);
                a.TYaw = ry;
                a.SeenAt = Time.time;
                a.Frenzy = (f & 2) != 0;
                a.Aggro = (f & 8) != 0;
                a.Wind = (f & 32) != 0;
                if ((f & 4) != 0) a.StunT = Mathf.Max(a.StunT, 0.2f);
                a.ChargeK = charge;
                if ((f & 16) != 0) { a.Hp = 0; a.Down = true; }
                else if (a.Down) { a.Down = false; a.Hp = hp; Hud.Feed("burn", a.Kind.N + " rises again", "they must fall together"); }
                else if (Time.time - a.HitAt > 0.4f) a.Hp = hp;
            }
        }

        // a blow landed on it (yours or another player's, as the server settled it)
        public void Struck(Mob a, float dmg, double hpLeft, bool dead, bool down)
        {
            if (dmg > 0) a.FlashT = 0.12f;
            a.Hp = hpLeft;
            if (down) { a.Down = true; a.Hp = 0; }
            else if (dead || hpLeft <= 0) Die(a);
        }

        public void Die(Mob a)
        {
            if (a.DyingT >= 0) return;
            Sounds.Animal(a.Type, a.Pos);
            a.Hp = 0;
            a.Down = false;
            a.DyingT = 0.4f;
            // it bursts into cubes of its own colors
            var c = a.Mats.Count > 0 ? a.Mats[a.Mats.Count / 2].m : flash;
            var h = a.Kind.Hit[1] * 0.5f;
            for (int i = 0; i < 10; i++)
            {
                var go = new GameObject("bit");
                go.transform.SetParent(transform, false);
                go.transform.position = View(a.Pos) + new Vector3(UnityEngine.Random.Range(-0.3f, 0.3f), h + UnityEngine.Random.Range(-0.3f, 0.3f), UnityEngine.Random.Range(-0.3f, 0.3f));
                go.transform.localScale = Vector3.one * UnityEngine.Random.Range(0.12f, 0.24f);
                go.AddComponent<MeshFilter>().sharedMesh = cube;
                go.AddComponent<MeshRenderer>().sharedMaterial = i % 3 == 0 ? a.Mats[0].m : c;
                bits.Add(new Bit { T = go.transform, V = new Vector3(UnityEngine.Random.Range(-3f, 3f), UnityEngine.Random.Range(2f, 5f), UnityEngine.Random.Range(-3f, 3f)), Life = 0.7f });
            }
        }

        void Update()
        {
            float dt = Time.deltaTime, now = Time.time;
            var gone = new List<string>();
            foreach (var a in All.Values)
            {
                if (a.DyingT >= 0)
                {
                    a.DyingT -= dt;
                    a.Root.transform.localScale = Vector3.one * a.Scale * Mathf.Max(0, a.DyingT / 0.4f);
                    if (a.DyingT <= 0) gone.Add(a.Id);
                    continue;
                }
                if (now - a.SeenAt > 1.5f) { gone.Add(a.Id); continue; } // out of the server's word: out of sight
                var t = a.Root.transform;
                if (a.Down)
                {
                    // a dormant Merge twin: shrunk and spinning, until it rises or both fall
                    a.Yaw += dt * 3;
                    t.SetPositionAndRotation(View(a.Pos), Mirror(new Vector3(0, a.Yaw, 0), true));
                    t.localScale = Vector3.one * 0.5f;
                    continue;
                }
                t.localScale = Vector3.one * a.Scale;
                float f = Mathf.Min(1, dt * (a.Aggro ? 12 : 3));
                var old = a.Pos;
                if ((a.Target - a.Pos).magnitude > 4) a.Pos = a.Target; // a blink: straight there
                else a.Pos += (a.Target - a.Pos) * f;
                float dr = a.TYaw - a.Yaw;
                dr = Mathf.Atan2(Mathf.Sin(dr), Mathf.Cos(dr));
                a.Yaw += dr * f;
                // the wind-up: tipped back, then the lunge (windPose)
                bool w = a.Wind;
                if (a.WasWind && !w) a.LungeT = 0.2f;
                a.WasWind = w;
                a.WindK += ((w ? 1 : 0) - a.WindK) * Mathf.Min(1, dt * 16);
                a.LungeT = Mathf.Max(0, a.LungeT - dt);
                float tip = -0.38f * a.WindK + 0.4f * Mathf.Sin(a.LungeT / 0.2f * Mathf.PI), wob = 0;
                if (a.StunT > 0) { a.StunT -= dt; wob = Mathf.Sin(now * 18) * 0.15f; }
                bool moving = new Vector2(a.Pos.x - old.x, a.Pos.z - old.z).magnitude > dt * 0.3f;
                Animate(a, dt, moving, now);
                t.SetPositionAndRotation(View(a.Pos), Mirror(new Vector3(tip, a.Yaw, wob), true));
                // struck: a white flash
                if (a.FlashT > 0)
                {
                    a.FlashT -= dt;
                    foreach (var (r, m) in a.Mats) r.sharedMaterial = a.FlashT > 0 ? flash : m;
                }
            }
            foreach (var id in gone) { Destroy(All[id].Root); All.Remove(id); }
            for (int i = bits.Count - 1; i >= 0; i--)
            {
                var b = bits[i];
                b.Life -= dt;
                b.V.y -= 14 * dt;
                b.T.position += b.V * dt;
                b.T.localScale *= 1 - dt * 1.5f;
                bits[i] = b;
                if (b.Life <= 0) { Destroy(b.T.gameObject); bits.RemoveAt(i); }
            }
        }

        void Turn(Mob a, string part, int axis, float angle, bool add = false)
        {
            if (!a.Parts.TryGetValue(part, out var t)) return;
            var e = a.Euler.TryGetValue(t, out var v) ? v : Vector3.zero;
            if (add) e[axis] += angle; else e[axis] = angle;
            a.Euler[t] = e;
            t.localRotation = Mirror(e);
        }

        // animateMob: legs, wings, a tail, the rings and the drill, the crown, a turret's lens, a visor's sweep
        void Animate(Mob a, float dt, bool moving, float now)
        {
            a.Walk += dt * (moving ? 8 : 1.5f);
            if (a.Parts.ContainsKey("legs:0"))
                for (int i = 0; a.Parts.ContainsKey("legs:" + i); i++) Turn(a, "legs:" + i, 0, (i % 2 == 1 ? -1 : 1) * Mathf.Sin(a.Walk) * 0.5f);
            else if (a.Parts.ContainsKey("wings:0"))
                for (int i = 0; a.Parts.ContainsKey("wings:" + i); i++) Turn(a, "wings:" + i, 2, (i > 0 ? 1 : -1) * (0.3f + Mathf.Sin(now * 8 + a.Ph) * 0.5f));
            else if (a.Parts.ContainsKey("tail")) Turn(a, "tail", 1, Mathf.Sin(now * 4 + a.Ph) * 0.4f);
            else if (a.Parts.ContainsKey("ring")) Turn(a, "ring", 1, dt * 2.2f, true);
            else if (a.Parts.ContainsKey("rings:0"))
                for (int i = 0; a.Parts.ContainsKey("rings:" + i); i++) Turn(a, "rings:" + i, 1, dt * (1.2f + i * 0.7f), true);
            else a.Pos.y += Mathf.Sin(a.Walk) * 0.01f; // the shadow floats
            Turn(a, "drill", 1, dt * (a.Aggro ? 14 : 3), true);
            Turn(a, "crown", 1, dt * (a.Frenzy ? 5 : 2), true);
            if (a.Parts.TryGetValue("lens", out var lens)) lens.localScale = Vector3.one * (a.ChargeK > 0 ? 1 + a.ChargeK * 1.8f : 1);
            if (a.Parts.TryGetValue("scan", out var scan)) { var p = scan.localPosition; p.x = Mathf.Sin(now * (a.Aggro ? 7 : 2.5f) + a.Ph) * 0.22f; scan.localPosition = p; }
        }

        // the mob your aim meets first, within reach and before any block (pickMob): its hit box around its feet
        public Mob Pick(Vector3 eye, Vector3 dir, float reach, float blockDist)
        {
            Mob best = null;
            float bd = Mathf.Min(reach, blockDist);
            foreach (var a in All.Values)
            {
                if (a.Hp <= 0 || a.DyingT >= 0) continue;
                float m = Mathf.Max(a.Kind.Hit[0], a.Kind.Hit[2]) / 2;
                var min = new Vector3(a.Pos.x - m, a.Pos.y, a.Pos.z - m);
                var max = new Vector3(a.Pos.x + m, a.Pos.y + a.Kind.Hit[1], a.Pos.z + m);
                float d = RayBox(eye, dir, min, max);
                if (d >= 0 && d < bd) { bd = d; best = a; }
            }
            return best;
        }

        public static float RayBox(Vector3 o, Vector3 d, Vector3 min, Vector3 max)
        {
            float t0 = 0, t1 = float.MaxValue;
            for (int i = 0; i < 3; i++)
            {
                if (Mathf.Abs(d[i]) < 1e-6f) { if (o[i] < min[i] || o[i] > max[i]) return -1; continue; }
                float a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
                if (a > b) { var s = a; a = b; b = s; }
                t0 = Mathf.Max(t0, a);
                t1 = Mathf.Min(t1, b);
                if (t0 > t1) return -1;
            }
            return t0;
        }

        // a health bar over the ones that took a blow, with their name
        void OnGUI()
        {
            Ui.Begin();
            var cam = Player != null ? Player.Cam : null;
            if (cam == null) return;
            if (barStyle == null) barStyle = new GUIStyle(GUI.skin.label) { fontSize = 12, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            foreach (var a in All.Values)
            {
                if (a.DyingT >= 0 || a.Down || a.Hp >= a.Kind.Hp || a.Hp <= 0) continue;
                var s = cam.WorldToScreenPoint(View(a.Pos) + Vector3.up * (a.Kind.Hit[1] + 0.35f));
                s = new Vector3(s.x / Ui.Scale, s.y / Ui.Scale, s.z);
                if (s.z <= 0 || s.z > 40) continue;
                float w = 70, x = s.x - w / 2, y = Ui.H - s.y;
                var o = GUI.color;
                GUI.color = new Color(0.11f, 0.086f, 0.23f, 0.75f);
                GUI.DrawTexture(new Rect(x - 1, y - 1, w + 2, 8), Texture2D.whiteTexture);
                GUI.color = new Color(1f, 0.42f, 0.5f);
                GUI.DrawTexture(new Rect(x, y, w * (float)(a.Hp / a.Kind.Hp), 6), Texture2D.whiteTexture);
                GUI.color = o;
                GUI.Label(new Rect(x - 40, y - 18, w + 80, 16), a.Kind.N, barStyle);
            }
        }
    }
}
