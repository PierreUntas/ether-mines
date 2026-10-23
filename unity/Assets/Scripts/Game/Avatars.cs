// Ether Mines · the other players as you see them (14-startup.js makeAvatar, updateOthers): a clay figure
// in their color with their name over the head, walking toward where they were last heard of, turned to
// where they look, the arm swinging while they mine, dressed in their look (17-looks.js applyLook: an
// outfit, headwear, a back piece, a companion following them, a trail), their title under their name.
// Seen from behind (V), you get yours too; your companion and trail follow you in first person as well.
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
        public Func<Dictionary<string, int>> MyLook = () => new Dictionary<string, int>();
        public Func<string> MyTitle = () => "";
        public Func<int> MyArmor = () => 0;      // the plating you wear
        public Func<bool> MyBoots = () => false, MyCape = () => false; // the Front-Runner Boots on, the Titan's cape owned
        public Func<int> MyRide = () => 0;       // the craft you ride (Hover draws it)
        public Func<string> MyOn = () => null;   // the driver whose back seat you're in
        public Hover Hover;                      // your craft, its back seat (null offline)
        public string MyId;

        sealed class Fig
        {
            public string Id, Name, Color;
            public GameObject Root;
            public Transform Head, Body, LegL, LegR, ArmL, ArmR;
            public Vector3 Target; // game coordinates
            public double Yaw, TYaw, Pitch;
            public bool Mining, Seen;
            public int Held, ShownHeld = -1; // the tool or weapon in their right hand (`h`), and the one drawn
            public GameObject HeldObj;
            public float HeardAt, Walk, Phase;
            public Vector3 Pos; // game coordinates, eased
            public Renderer[] Legs;      // their trousers take the outfit's color
            public string LookKey = "", Title = "";
            public int Armor; public bool Boots, Cape; // a plating, the boots, the cape (yours only, as on the web)
            public int Ride, CraftId; public GameObject Craft; public float Lift; public bool OwnCraft; // on board a Diamond Glider
            public float CraftBack = float.NaN;                   // its back seat, behind the driver (the Twin Diamond)
            public string On; public bool Behind; public float BehindLift; // in a driver's back seat
            public Dictionary<string, int> Look = new Dictionary<string, int>();
            public readonly List<GameObject> LookParts = new List<GameObject>();
            public readonly List<GameObject> ArmorParts = new List<GameObject>(); // what a plating trim tints
            public GameObject Companion;
            public int CompanionId;
            public string Trail;
            public float TrailAcc, CompPh;
            public Vector3 LastPos;
        }

        struct Bit { public Transform T; public float Life, Max, Size, Vy; public bool Flat; public Material M; }
        readonly List<Bit> trail = new List<Bit>();

        readonly Dictionary<string, Fig> figs = new Dictionary<string, Fig>();
        Fig me;
        // where the others stand (game coordinates): their feet press the plates too (12-circuits.js)
        public IEnumerable<string> OtherNames() { foreach (var f in figs.Values) if (!string.IsNullOrEmpty(f.Name)) yield return f.Name; }
        public IEnumerable<Vector3> Others() { foreach (var f in figs.Values) if (f.Root.activeSelf) yield return f.Pos; }
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
            f.LegL = Limb(r, new Vector3(0.24f, 0.47f, 0.26f), new Vector3(-0.13f, 0.47f, 0), Mat(Looks.DefaultPants));
            f.LegR = Limb(r, new Vector3(0.24f, 0.47f, 0.26f), new Vector3(0.13f, 0.47f, 0), Mat(Looks.DefaultPants));
            f.Legs = new Renderer[] { f.LegL.GetComponentInChildren<MeshRenderer>(), f.LegR.GetComponentInChildren<MeshRenderer>() };
            f.Body = new GameObject("body").transform;
            f.Body.SetParent(r, false);
            f.Body.localPosition = new Vector3(0, 0.74f, 0);
            Box(f.Body, new Vector3(0.47f, 0.54f, 0.28f), Vector3.zero, Mat(col));
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
                if (figs.TryGetValue(p.Id, out var f)) { f.Look = Looks.Parse(p.Look); f.Title = p.Title ?? ""; }
            }
            var gone = new List<string>();
            foreach (var k in figs.Keys) if (!ids.Contains(k)) gone.Add(k);
            foreach (var k in gone) { Drop(figs[k]); figs.Remove(k); }
        }

        public void Heard(string id, string name, string color, double x, double y, double z, double yaw, double pitch, bool mining, bool live = true, int held = 0, int armor = 0, bool boots = false, int ride = 0, string on = null)
        {
            if (!figs.TryGetValue(id, out var f) || f.Color != color || f.Name != name)
            {
                var keep = f;
                if (f != null) Drop(f);
                figs[id] = f = Make(id, name, color);
                if (keep != null) { f.Look = keep.Look; f.Title = keep.Title; }
            }
            f.Target = new Vector3((float)x, (float)y, (float)z);
            if (live) { f.TYaw = yaw; f.Pitch = pitch; f.Mining = mining; f.HeardAt = Time.time; f.Held = held; f.Armor = armor; f.Boots = boots; f.Ride = ride; f.On = on; }
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
                if (f.Companion != null) f.Companion.SetActive(on);
                if (!on) { f.Seen = false; continue; }
                Dress(f, f.Look);
                Passenger(f);
                Animate(f, dt, Mathf.Min(1, dt * 7));
                Follow(f, f.Pos, f.Yaw, dt);
            }
            // yours, seen from behind or from the front
            bool mine = Player != null && Player.Body != null && Player.View != 0;
            if (Player != null && Player.Body != null && (me == null || me.Color != MyColor)) { if (me != null) Drop(me); me = Make("me", MyName, MyColor); me.Pos = me.LastPos = Player.GamePos; me.Root.SetActive(false); }
            if (me != null)
            {
                me.Title = MyTitle();
                me.Armor = MyArmor(); me.Boots = MyBoots(); me.Cape = MyCape(); me.Ride = MyRide(); me.OwnCraft = true; me.On = MyOn();
                Dress(me, MyLook());
                me.Root.SetActive(mine);
                // your companion and trail follow you, whatever the view
                Follow(me, Player.GamePos, (float)Player.Yaw, dt);
                if (mine)
                {
                    me.Target = Player.GamePos;
                    me.TYaw = Player.Yaw; me.Pitch = Player.Pitch;
                    me.Mining = Act != null && Act.Swing > 0;
                    int h = Act != null && Act.Inv.Held != null ? Act.Inv.HeldId : 0;
                    me.Held = h > 0 && EtherMines.Core.Rules.Block(h) == null ? h : 0;
                    if (!me.Seen) { me.Seen = true; me.Pos = me.Target; me.Yaw = me.TYaw; }
                    Passenger(me);
                    Animate(me, dt, 1);
                    Trims(me, MyLook());
                }
                else me.Seen = false;
            }
            UpdateTrail(dt);
        }

        void Drop(Fig f)
        {
            if (f.Companion != null) Destroy(f.Companion);
            if (f.Craft != null) Destroy(f.Craft);
            Destroy(f.Root);
        }

        // ---------- the look (applyLook) ----------
        void Dress(Fig f, Dictionary<string, int> look)
        {
            var key = Looks.Code(look) + "|" + f.Color + "|" + f.Armor + (f.Boots ? "b" : "") + (f.Cape ? "c" : "");
            if (key == f.LookKey) return;
            f.LookKey = key;
            foreach (var p in f.LookParts) if (p != null) Destroy(p);
            f.LookParts.Clear();
            f.ArmorParts.Clear();
            // an outfit: its trousers and its details, when the player wears its color (choosing it sets it)
            Color pants = Looks.DefaultPants;
            if (look.TryGetValue("outfit", out var oid))
            {
                var o = Looks.OutfitOf(oid);
                var hex = Looks.OutfitHex(oid);
                if (o != null && hex != null && string.Equals(hex, f.Color, StringComparison.OrdinalIgnoreCase))
                {
                    pants = o.Pants;
                    foreach (var kv in o.On)
                    {
                        Transform at = kv.Key == "body" ? f.Body : kv.Key == "arm0" ? f.ArmL : kv.Key == "arm1" ? f.ArmR : kv.Key == "leg0" ? f.LegL : kv.Key == "leg1" ? f.LegR : kv.Key == "head" ? f.Head : null;
                        if (at == null || kv.Value == null) continue;
                        var g = HeldModels.FromParts("outfit " + oid + " " + kv.Key, kv.Value);
                        g.transform.SetParent(at, false);
                        if (kv.Key == "head") g.transform.localScale = Vector3.one * 1.32f;
                        f.LookParts.Add(g);
                    }
                }
            }
            foreach (var r in f.Legs) r.sharedMaterial = Mat(pants);
            if (look.TryGetValue("head", out var hid))
            {
                var g = Looks.Piece("head", hid);
                if (g != null) { g.transform.SetParent(f.Head, false); g.transform.localScale = Vector3.one * 1.32f; f.LookParts.Add(g); }
            }
            if (look.TryGetValue("back", out var bid))
            {
                var g = Looks.Piece("back", bid);
                if (g != null) { g.transform.SetParent(f.Root.transform, false); g.transform.localPosition = new Vector3(0, -0.2f, 0); f.LookParts.Add(g); }
            }
            // the plating, the boots, and the cape (unless a back piece takes its place)
            if (f.Armor > 0) Hang(f, Looks.Worn("armor", f.Armor), "armor " + f.Armor);
            if (f.Boots) Hang(f, Looks.Worn("boots", 211), "boots");
            if (f.Cape && !look.ContainsKey("back")) Hang(f, Looks.Worn("cape", 205), "cape");
            int cid = look.TryGetValue("companion", out var c) ? c : 0;
            if (cid != f.CompanionId)
            {
                if (f.Companion != null) Destroy(f.Companion);
                f.CompanionId = cid;
                f.Companion = cid > 0 ? Looks.Piece("companion", cid) : null;
                if (f.Companion != null) { f.Companion.transform.SetParent(transform, false); f.CompPh = UnityEngine.Random.value * 6; f.Companion.transform.position = View(f.Pos) + Vector3.up * 1.3f; }
            }
            f.Trail = look.TryGetValue("trail", out var t) ? Looks.TrailStyle(t) : null;
        }

        void Hang(Fig f, Dictionary<string, List<object>> parts, string key)
        {
            if (parts == null) return;
            foreach (var kv in parts)
            {
                Transform at = kv.Key == "body" ? f.Body : kv.Key == "arm0" ? f.ArmL : kv.Key == "arm1" ? f.ArmR : kv.Key == "leg0" ? f.LegL : kv.Key == "leg1" ? f.LegR : kv.Key == "head" ? f.Head : f.Root.transform;
                var g = HeldModels.FromParts(key + " " + kv.Key, kv.Value);
                g.transform.SetParent(at, false);
                if (kv.Key == "head") g.transform.localScale = Vector3.one * 1.32f;
                if (kv.Key == "up") g.transform.localPosition = new Vector3(0, -0.2f, 0);
                f.LookParts.Add(g);
                if (key.StartsWith("armor", StringComparison.Ordinal)) f.ArmorParts.Add(g);
            }
        }

        // the companion beside its owner, a little behind, turning as they turn; the trail while they move
        // your trims (only yours, as on the web): the pickaxe in hand and the plating's glow
        static void Trims(Fig f, Dictionary<string, int> look)
        {
            HeldModels.Tint(f.HeldObj, Looks.ToolTrim(look, Time.time));
            var pc = Looks.PlatingTrim(look);
            foreach (var p in f.ArmorParts) HeldModels.Tint(p, pc, true);
        }

        void Follow(Fig f, Vector3 pos, double yaw, float dt)
        {
            if (f.Companion != null)
            {
                float ox = 0.85f, oz = 0.7f, cy = Mathf.Cos((float)yaw), sy = Mathf.Sin((float)yaw);
                var target = new Vector3(pos.x + ox * cy + oz * sy, pos.y + 1.35f, pos.z - ox * sy + oz * cy);
                var t = f.Companion.transform;
                t.position = Vector3.Lerp(t.position, View(target), Mathf.Min(1, dt * 4));
                t.rotation = Quaternion.Euler(0, (float)(-yaw * Mathf.Rad2Deg), 0);
            }
            float sp = new Vector2(pos.x - f.LastPos.x, pos.z - f.LastPos.z).magnitude / Mathf.Max(dt, 0.001f);
            f.LastPos = pos;
            if (f.Trail == null || sp < 1.2f || sp > 40) return;
            f.TrailAcc += dt;
            while (f.TrailAcc > 0.05f) { f.TrailAcc -= 0.05f; Emit(f.Trail, pos); }
        }

        void Emit(string style, Vector3 pos)
        {
            bool big = Looks.Bubbles(style), flat = style == "coins";
            var c = Looks.TrailColor(style, Time.time);
            var m = new Material(Shader.Find("EtherMines/Glow"));
            m.SetColor("_Color", new Color(c.r, c.g, c.b, big ? 0.45f : 0.9f));
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.renderQueue = 3000;
            var go = new GameObject("trail");
            go.transform.SetParent(transform, false);
            go.transform.position = View(new Vector3(pos.x + (UnityEngine.Random.value - 0.5f) * 0.4f, pos.y + 0.15f + UnityEngine.Random.value * 0.3f, pos.z + (UnityEngine.Random.value - 0.5f) * 0.4f));
            go.AddComponent<MeshFilter>().sharedMesh = cube;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            float size = big ? 0.13f : 0.09f;
            go.transform.localScale = flat ? new Vector3(size, 0.025f, size) : Vector3.one * size;
            trail.Add(new Bit { T = go.transform, Life = big ? 1.4f : 0.9f, Max = big ? 1.4f : 0.9f, Size = size, Vy = big ? 0.7f : 0.35f, Flat = flat, M = m });
            if (trail.Count > 160) { Destroy(trail[0].T.gameObject); Destroy(trail[0].M); trail.RemoveAt(0); }
        }

        void UpdateTrail(float dt)
        {
            for (int i = trail.Count - 1; i >= 0; i--)
            {
                var b = trail[i];
                b.Life -= dt;
                if (b.Life <= 0) { Destroy(b.T.gameObject); Destroy(b.M); trail.RemoveAt(i); continue; }
                float k = b.Life / b.Max, s = b.Size * (0.4f + 0.6f * k) * (b.Flat ? 1.6f : 1);
                b.T.position += Vector3.up * b.Vy * dt;
                b.T.localScale = b.Flat ? new Vector3(s, 0.025f, s) : Vector3.one * s;
                var c = b.M.GetColor("_Color"); c.a = k * 0.9f; b.M.SetColor("_Color", c);
                trail[i] = b;
            }
        }

        // ---------- your character in the window (previewBox): turning slowly, in your look or a try-on ----------
        public const int PreviewLayer = 30; // seen only by the preview's own camera
        Fig preview;
        Camera pcam;
        RenderTexture prt;
        float pspin = 0.5f, pwantedAt = -1;
        public Dictionary<string, int> TryLook; // pieces tried on in the shop, by slot
        public string TryColor;                // an outfit tried on comes in its own color

        // asked every frame the window shows it; the camera only runs meanwhile
        public Texture Preview()
        {
            pwantedAt = Time.time;
            return prt;
        }

        void LateUpdate()
        {
            bool want = Time.time - pwantedAt < 0.2f && Player != null && Player.Body != null;
            if (!want)
            {
                if (pcam != null) pcam.enabled = false;
                if (preview != null) preview.Root.SetActive(false);
                return;
            }
            if (pcam == null)
            {
                prt = new RenderTexture(512, 640, 24) { name = "preview" };
                pcam = new GameObject("Preview camera").AddComponent<Camera>();
                pcam.transform.SetParent(transform, false);
                pcam.targetTexture = prt;
                pcam.clearFlags = CameraClearFlags.SolidColor;
                pcam.backgroundColor = new Color(0, 0, 0, 0);
                pcam.cullingMask = 1 << PreviewLayer;
                pcam.fieldOfView = 30;
                pcam.nearClipPlane = 0.1f;
                pcam.farClipPlane = 20;
                pcam.transform.position = new Vector3(0, -1000 + 1.05f, 5.4f);
                pcam.transform.rotation = Quaternion.Euler(4, 180, 0);
                if (Player.Cam != null) Player.Cam.cullingMask &= ~(1 << PreviewLayer);
            }
            pcam.enabled = true;
            var color = TryColor ?? MyColor;
            if (preview == null || preview.Color != color)
            {
                if (preview != null) Drop(preview);
                preview = Make("preview", MyName, color);
            }
            preview.Root.SetActive(true);
            preview.Armor = MyArmor(); preview.Boots = MyBoots(); preview.Cape = MyCape();
            var look = new Dictionary<string, int>(MyLook());
            if (TryLook != null) foreach (var kv in TryLook) look[kv.Key] = kv.Value;
            Dress(preview, look);
            if (preview.Companion != null && preview.Companion.transform.parent != preview.Root.transform)
            {
                // in the window, the companion floats beside you instead of following you around
                preview.Companion.transform.SetParent(preview.Root.transform, false);
                preview.Companion.transform.localPosition = new Vector3(0.75f, 1.45f, -0.25f);
                preview.Companion.transform.localRotation = Quaternion.identity;
            }
            int h = Act != null && Act.Inv.Held != null ? Act.Inv.HeldId : 0;
            preview.Held = h > 0 && EtherMines.Core.Rules.Block(h) == null ? h : 0;
            pspin += Time.unscaledDeltaTime * 0.6f;
            preview.Pos = preview.Target = new Vector3(0, -1000, 0);
            preview.Yaw = preview.TYaw = pspin; // facing the camera at 0, turning
            preview.Mining = false;
            Animate(preview, Time.unscaledDeltaTime, 1);
            Trims(preview, look);
            Layer(preview.Root.transform, PreviewLayer);
        }

        static void Layer(Transform t, int layer)
        {
            t.gameObject.layer = layer;
            for (int i = 0; i < t.childCount; i++) Layer(t.GetChild(i), layer);
        }

        // the tool or weapon in the right hand (updateAvatarHand): items only, as the game draws them
        static void HoldIn(Fig f)
        {
            if (f.ShownHeld == f.Held) return;
            f.ShownHeld = f.Held;
            if (f.HeldObj != null) Destroy(f.HeldObj);
            f.HeldObj = f.Held > 0 && EtherMines.Core.Rules.Block(f.Held) == null ? HeldModels.Make(f.Held, 0, true) : null;
            if (f.HeldObj == null) return;
            var t = f.HeldObj.transform;
            t.SetParent(f.ArmR, false);
            t.localScale = Vector3.one * 0.72f;
            t.localPosition = new Vector3(0.1f, -0.3f, 0.22f);
            t.localRotation = HeldModels.Mirror(0, -0.3f, 0.3f);
        }

        // on board: the craft under them (another player's; yours is Hover's), seated higher, knees and hands forward
        static void Seat(Fig f)
        {
            if (!f.OwnCraft && f.Ride != f.CraftId)
            {
                if (f.Craft != null) Destroy(f.Craft);
                f.Craft = null;
                f.CraftId = f.Ride;
                f.Lift = 0;
                if (f.Ride > 0)
                {
                    f.Craft = HeldModels.Hover(f.Ride, out var seat, out f.CraftBack);
                    if (f.Craft != null) { f.Craft.transform.SetParent(f.Root.transform, false); f.Lift = Mathf.Max(0, Hover.Gap + seat - 0.47f + 0.04f); }
                }
            }
            if (f.OwnCraft) f.Lift = f.Ride > 0 ? HeldLift(f.Ride) : 0;
            if (f.Craft != null) f.Craft.transform.localPosition = new Vector3(0, Hover.Gap - f.Lift + Mathf.Sin(Time.time * 2.2f) * 0.04f, 0);
        }
        // the back seat of a driver's Twin Diamond (20-hover.js rideOther, boardTick): where it is (game
        // coordinates), which way the craft faces, how high it seats you. Yours, or another player's.
        public bool DriverSeat(string driver, out Vector3 pos, out float yaw, out float lift)
        {
            pos = default; yaw = 0; lift = 0;
            if (driver == null) return false;
            float back;
            if (driver == MyId)
            {
                if (Hover == null || !Hover.BackSeat(out pos, out yaw, out back, out lift)) return false;
            }
            else
            {
                if (!figs.TryGetValue(driver, out var d) || !d.Root.activeSelf || d.Craft == null || float.IsNaN(d.CraftBack) || !IsTwin(d.Ride)) return false;
                pos = d.Pos; yaw = (float)d.Yaw; back = d.CraftBack; lift = d.Lift;
            }
            pos += new Vector3(Mathf.Sin(yaw) * back, 0, Mathf.Cos(yaw) * back);
            return true;
        }
        public static bool IsTwin(int id) => EtherMines.Core.Rules.Item(id)?.HoverModel == "twin";
        // is someone already in that driver's back seat?
        public string SeatTaken(string driver) { foreach (var f in figs.Values) if (f.On == driver && f.Root.activeSelf) return f.Name; return null; }
        public bool Driving(string id, out int ride, out Vector3 pos, out string name)
        {
            ride = 0; pos = default; name = null;
            if (!figs.TryGetValue(id, out var f) || !f.Root.activeSelf) return false;
            ride = f.Ride; pos = f.Pos; name = f.Name;
            return true;
        }
        // a passenger: sits where the seat is on this screen, facing the way the craft goes
        void Passenger(Fig f)
        {
            f.Behind = false;
            if (f.Ride != 0 || !DriverSeat(f.On, out var p, out var y, out var l)) return;
            f.Behind = true;
            f.Target = f.Pos = p;
            f.TYaw = f.Yaw = y;
            f.BehindLift = l;
        }

        static readonly Dictionary<int, float> lifts = new Dictionary<int, float>();
        static float HeldLift(int id)
        {
            if (lifts.TryGetValue(id, out var l)) return l;
            var g = HeldModels.Hover(id, out var seat, out _);
            if (g != null) Destroy(g);
            return lifts[id] = Mathf.Max(0, Hover.Gap + seat - 0.47f + 0.04f);
        }

        static void Animate(Fig f, float dt, float k)
        {
            HoldIn(f);
            Seat(f);
            var d = f.Target - f.Pos;
            f.Pos += d * k;
            double dr = f.TYaw - f.Yaw;
            dr = Math.Atan2(Math.Sin(dr), Math.Cos(dr));
            f.Yaw += dr * Math.Min(1, dt * 7);
            f.Root.transform.SetPositionAndRotation(View(f.Pos) + Vector3.up * (f.Ride > 0 ? f.Lift : f.Behind ? f.BehindLift : 0), Quaternion.Euler(0, (float)(-f.Yaw * Mathf.Rad2Deg), 0));
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
            if (f.Ride > 0 || f.Behind)
            {
                // seated (sitAvatar): knees forward, both hands forward on the controls, still
                f.LegL.localRotation = f.LegR.localRotation = Quaternion.Euler(-1.45f * Mathf.Rad2Deg, 0, 0);
                f.ArmL.localRotation = Quaternion.Euler(-0.95f * Mathf.Rad2Deg, 0, 0.12f * Mathf.Rad2Deg);
                f.ArmR.localRotation = Quaternion.Euler(-0.95f * Mathf.Rad2Deg, 0, -0.12f * Mathf.Rad2Deg);
                f.Body.localPosition = new Vector3(0, 0.74f, 0);
            }
        }

        // the name over each head (nameTag): a dark rounded label with a dot of their color
        void OnGUI()
        {
            Ui.Begin();
            if (Ui.Cine) return; // a cinematic: the screen is the film's
            var cam = Player != null ? Player.Cam : null;
            if (cam == null) return;
            if (tagStyle == null) tagStyle = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleLeft, richText = true, normal = { textColor = new Color(0.96f, 0.95f, 1) } };
            foreach (var f in figs.Values)
            {
                if (!f.Root.activeSelf) continue;
                var w = View(f.Pos) + Vector3.up * 2.1f;
                var s = cam.WorldToScreenPoint(w);
                s = new Vector3(s.x / Ui.Scale, s.y / Ui.Scale, s.z);
                if (s.z <= 0 || s.z > 80) continue;
                var size = tagStyle.CalcSize(new GUIContent(f.Name));
                bool titled = !string.IsNullOrEmpty(f.Title);
                if (titled) size.x = Mathf.Max(size.x, tagStyle.CalcSize(new GUIContent(f.Title)).x * 0.8f);
                float bw = size.x + 34, bh = titled ? 40 : 26, x = s.x - bw / 2, y = Ui.H - s.y - bh / 2;
                var o = GUI.color;
                GUI.color = new Color(0.11f, 0.086f, 0.23f, 0.72f);
                GUI.DrawTexture(new Rect(x, y, bw, bh), Texture2D.whiteTexture);
                GUI.color = Hex(f.Color, Color.white);
                GUI.DrawTexture(new Rect(x + 9, y + 9, 8, 8), Texture2D.whiteTexture);
                GUI.color = o;
                GUI.Label(new Rect(x + 24, y, bw - 24, 26), f.Name, tagStyle);
                if (titled) GUI.Label(new Rect(x + 24, y + 20, bw - 24, 18), "<size=12><color=#ffd95e>" + f.Title + "</color></size>", tagStyle);
            }
        }
    }
}
