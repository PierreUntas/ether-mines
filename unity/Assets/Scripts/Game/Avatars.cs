// Ether Mines · the other players as you see them (14-startup.js makeAvatar, updateOthers): a clay figure
// in their color with their name over the head, walking toward where they were last heard of, turned to
// where they look, the arm swinging while they mine. Seen from behind (V), you get yours too.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Avatars : MonoBehaviour
    {
        public PlayerController Player;
        public Interaction Act;
        public string MyName = "", MyColor = "#8a7bef";

        sealed class Fig
        {
            public string Id, Name, Color;
            public GameObject Root;
            public Transform Head, Body, LegL, LegR, ArmL, ArmR;
            public Vector3 Target; // game coordinates
            public double Yaw, TYaw, Pitch;
            public bool Mining, Seen;
            public float HeardAt, Walk, Phase;
            public Vector3 Pos; // game coordinates, eased
        }

        readonly Dictionary<string, Fig> figs = new Dictionary<string, Fig>();
        Fig me;
        static Mesh cube;
        readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();
        GUIStyle tagStyle;

        public static Color Hex(string hex, Color fallback)
        {
            return ColorUtility.TryParseHtmlString(hex ?? "", out var c) ? c : fallback;
        }

        Material Mat(Color c, Color glow = default)
        {
            var k = ColorUtility.ToHtmlStringRGB(c) + ColorUtility.ToHtmlStringRGB(glow);
            if (mats.TryGetValue(k, out var m)) return m;
            m = new Material(Shader.Find("EtherMines/Avatar"));
            m.SetColor("_Color", c);
            m.SetColor("_Glow", glow);
            return mats[k] = m;
        }

        Transform Box(Transform parent, Vector3 size, Vector3 at, Material m)
        {
            if (cube == null)
            {
                var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube = tmp.GetComponent<MeshFilter>().sharedMesh;
                Destroy(tmp);
            }
            var go = new GameObject("part");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localScale = size;
            go.AddComponent<MeshFilter>().sharedMesh = cube;
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go.transform;
        }

        // a limb hangs from its pivot (shoulder, hip), so it swings from there
        Transform Limb(Transform parent, Vector3 size, Vector3 pivot, Material m)
        {
            var p = new GameObject("limb").transform;
            p.SetParent(parent, false);
            p.localPosition = pivot;
            Box(p, size, new Vector3(0, -size.y / 2, 0), m);
            return p;
        }

        // the clay look's chibi proportions (makeAvatar with CLAY): a big head, a short body and legs.
        // The face looks toward the game's -z, which is Unity's +z once the view flips z.
        Fig Make(string id, string name, string color)
        {
            var col = Hex(color, new Color(0.54f, 0.48f, 0.94f));
            var dark = col * 0.7f; dark.a = 1;
            var f = new Fig { Id = id, Name = name, Color = color };
            f.Root = new GameObject("player " + name);
            f.Root.transform.SetParent(transform, false);
            var r = f.Root.transform;
            f.LegL = Limb(r, new Vector3(0.24f, 0.47f, 0.26f), new Vector3(-0.13f, 0.47f, 0), Mat(new Color(0.42f, 0.35f, 0.88f)));
            f.LegR = Limb(r, new Vector3(0.24f, 0.47f, 0.26f), new Vector3(0.13f, 0.47f, 0), Mat(new Color(0.42f, 0.35f, 0.88f)));
            f.Body = Box(r, new Vector3(0.47f, 0.54f, 0.28f), new Vector3(0, 0.74f, 0), Mat(col));
            f.ArmL = Limb(r, new Vector3(0.18f, 0.5f, 0.22f), new Vector3(-0.35f, 1.06f, 0), Mat(col));
            f.ArmR = Limb(r, new Vector3(0.18f, 0.5f, 0.22f), new Vector3(0.35f, 1.06f, 0), Mat(col));
            f.Head = new GameObject("head").transform;
            f.Head.SetParent(r, false);
            f.Head.localPosition = new Vector3(0, 1.32f, 0);
            Box(f.Head, new Vector3(0.66f, 0.66f, 0.66f), Vector3.zero, Mat(dark));
            Box(f.Head, new Vector3(0.56f, 0.44f, 0.02f), new Vector3(0, -0.06f, 0.33f), Mat(new Color(0.96f, 0.83f, 0.72f)));
            var eye = Mat(new Color(0.16f, 0.12f, 0.3f));
            Box(f.Head, new Vector3(0.08f, 0.11f, 0.02f), new Vector3(-0.13f, -0.02f, 0.345f), eye);
            Box(f.Head, new Vector3(0.08f, 0.11f, 0.02f), new Vector3(0.13f, -0.02f, 0.345f), eye);
            return f;
        }

        static Vector3 View(Vector3 game) => new Vector3(game.x, game.y, -game.z);

        // the list of who is in the world: the ones gone are taken away, the new ones appear where they stand
        public void SetPeers(List<GameLink.Peer> list, string selfId)
        {
            var ids = new HashSet<string>();
            foreach (var p in list)
            {
                if (p.Id == selfId) continue;
                ids.Add(p.Id);
                if (!figs.ContainsKey(p.Id) && p.HasPos) Heard(p.Id, p.Name, p.Color, p.X, p.Y, p.Z, 0, 0, false, false);
            }
            var gone = new List<string>();
            foreach (var k in figs.Keys) if (!ids.Contains(k)) gone.Add(k);
            foreach (var k in gone) { Destroy(figs[k].Root); figs.Remove(k); }
        }

        public void Heard(string id, string name, string color, double x, double y, double z, double yaw, double pitch, bool mining, bool live = true)
        {
            if (!figs.TryGetValue(id, out var f) || f.Color != color || f.Name != name)
            {
                if (f != null) Destroy(f.Root);
                figs[id] = f = Make(id, name, color);
            }
            f.Target = new Vector3((float)x, (float)y, (float)z);
            if (live) { f.TYaw = yaw; f.Pitch = pitch; f.Mining = mining; f.HeardAt = Time.time; }
            if (!f.Seen) { f.Seen = true; f.Pos = f.Target; f.Yaw = f.TYaw; f.HeardAt = Time.time; }
        }

        public int Count => figs.Count;

        // the others you can see, where they stand (game coordinates)
        public IEnumerable<(string id, Vector3 pos)> Visible()
        {
            foreach (var f in figs.Values) if (f.Root.activeSelf) yield return (f.Id, f.Pos);
        }

        // the player your aim meets first, within reach and before any block (pickPlayer)
        public string Pick(Vector3 eye, Vector3 dir, float reach, float blockDist)
        {
            string best = null;
            float bd = Mathf.Min(reach, blockDist);
            foreach (var f in figs.Values)
            {
                if (!f.Root.activeSelf) continue;
                float d = Mobs.RayBox(eye, dir, new Vector3(f.Pos.x - 0.35f, f.Pos.y, f.Pos.z - 0.35f), new Vector3(f.Pos.x + 0.35f, f.Pos.y + 1.85f, f.Pos.z + 0.35f));
                if (d >= 0 && d < bd) { bd = d; best = f.Id; }
            }
            return best;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            foreach (var f in figs.Values)
            {
                // no news for a while (a sign of life comes every 4 s): out of range, hidden until they're back
                bool on = Time.time - f.HeardAt < 10;
                f.Root.SetActive(on);
                if (!on) { f.Seen = false; continue; }
                Animate(f, dt, Mathf.Min(1, dt * 7));
            }
            // yours, seen from behind or from the front
            bool mine = Player != null && Player.Body != null && Player.View != 0;
            if (mine && me == null) { me = Make("me", MyName, MyColor); }
            if (me != null)
            {
                me.Root.SetActive(mine);
                if (mine)
                {
                    me.Target = Player.GamePos;
                    me.TYaw = Player.Yaw; me.Pitch = Player.Pitch;
                    me.Mining = Act != null && Act.Swing > 0;
                    if (!me.Seen) { me.Seen = true; me.Pos = me.Target; me.Yaw = me.TYaw; }
                    Animate(me, dt, 1);
                }
                else me.Seen = false;
            }
        }

        static void Animate(Fig f, float dt, float k)
        {
            var d = f.Target - f.Pos;
            f.Pos += d * k;
            double dr = f.TYaw - f.Yaw;
            dr = Math.Atan2(Math.Sin(dr), Math.Cos(dr));
            f.Yaw += dr * Math.Min(1, dt * 7);
            f.Root.transform.SetPositionAndRotation(View(f.Pos), Quaternion.Euler(0, (float)(-f.Yaw * Mathf.Rad2Deg), 0));
            float sp = new Vector2(d.x, d.z).magnitude * k / Mathf.Max(dt, 0.001f);
            f.Walk += Mathf.Min(sp, 8) * dt * 1.6f;
            float mv = Mathf.Min(1, sp / 2), a = mv * Mathf.Sin(f.Walk) * 0.7f * Mathf.Rad2Deg;
            f.LegL.localRotation = Quaternion.Euler(-a, 0, 0);
            f.LegR.localRotation = Quaternion.Euler(a, 0, 0);
            f.ArmL.localRotation = Quaternion.Euler(a * 0.8f, 0, 0);
            // swinging (mining, striking): a blow every 0.45 s, the right arm raised forward and brought down
            float sw = f.Mining ? Mathf.Max(0, 0.6f - (Time.time / 0.45f % 1) * 1.35f) : 0;
            f.ArmR.localRotation = Quaternion.Euler(f.Mining ? -(70 + sw * 80) : -a * 0.8f, 0, 0);
            f.Phase += dt;
            float br = Mathf.Sin(f.Phase * 2.2f), hop = Mathf.Abs(Mathf.Sin(f.Walk)) * 0.07f * mv;
            f.Body.localPosition = new Vector3(0, 0.74f + hop, 0);
            f.Head.localPosition = new Vector3(0, 1.32f + hop + br * 0.012f, 0);
            f.Head.localRotation = Quaternion.Euler((float)(-f.Pitch * 0.6 * Mathf.Rad2Deg), 0, Mathf.Sin(f.Walk) * 0.06f * mv * Mathf.Rad2Deg);
        }

        // the name over each head (nameTag): a dark rounded label with a dot of their color
        void OnGUI()
        {
            var cam = Player != null ? Player.Cam : null;
            if (cam == null) return;
            if (tagStyle == null) tagStyle = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleLeft, normal = { textColor = new Color(0.96f, 0.95f, 1) } };
            foreach (var f in figs.Values)
            {
                if (!f.Root.activeSelf) continue;
                var w = View(f.Pos) + Vector3.up * 2.1f;
                var s = cam.WorldToScreenPoint(w);
                if (s.z <= 0 || s.z > 80) continue;
                var size = tagStyle.CalcSize(new GUIContent(f.Name));
                float bw = size.x + 34, bh = 26, x = s.x - bw / 2, y = Screen.height - s.y - bh / 2;
                var o = GUI.color;
                GUI.color = new Color(0.11f, 0.086f, 0.23f, 0.72f);
                GUI.DrawTexture(new Rect(x, y, bw, bh), Texture2D.whiteTexture);
                GUI.color = Hex(f.Color, Color.white);
                GUI.DrawTexture(new Rect(x + 9, y + 9, 8, 8), Texture2D.whiteTexture);
                GUI.color = o;
                GUI.Label(new Rect(x + 24, y, bw - 24, bh), f.Name, tagStyle);
            }
        }
    }
}
