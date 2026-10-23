// Ether Mines · the world's ledger, seen (07-interface.js buildRegView, openExplorer): T outlines the blocks
// you placed within 40 blocks, through walls ("Ledger view"); I (or a tap on the aimed block's label)
// opens the block explorer, like a blockchain explorer for one block: who placed it and when, how many
// blocks that builder has standing, its token, and its last changes (block_info, 038_block_history.sql).
// A block nobody ever touched is a genesis block, there since the world was generated.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class Ledger : MonoBehaviour
    {
        public Session Session;
        public WorldView World;
        public PlayerController Player;
        public Interaction Act;

        public static bool Open; // the explorer's window: the keys and the mouse are for it
        static Ledger I;
        void Awake() { I = this; }

        string Me => Session != null ? Session.Net.UserId : "me";

        // ---------- the ledger view (T) ----------
        bool view;
        GameObject lines;
        Material lineMat;
        float rebuildT;

        void BuildView()
        {
            if (lines != null) { Destroy(lines.GetComponent<MeshFilter>().sharedMesh); Destroy(lines); lines = null; }
            if (!view || Player.Body == null) return;
            var b = Player.Body;
            var v = new List<Vector3>();
            int n = 0;
            foreach (var (x, y, z, o) in World.Store.Owners())
            {
                if (o.By != Me || Math.Sqrt((x + 0.5 - b.X) * (x + 0.5 - b.X) + (z + 0.5 - b.Z) * (z + 0.5 - b.Z)) > 40) continue;
                if (++n > 600) break;
                // a cube's twelve edges, 1.01 wide, in Unity's space (z mirrored)
                float x0 = x - 0.005f, y0 = y - 0.005f, z0 = -(z + 1.005f), s = 1.01f;
                foreach (var (a, c) in Edges) { v.Add(new Vector3(x0 + a.x * s, y0 + a.y * s, z0 + a.z * s)); v.Add(new Vector3(x0 + c.x * s, y0 + c.y * s, z0 + c.z * s)); }
            }
            if (v.Count == 0) return;
            if (lineMat == null)
            {
                lineMat = new Material(Shader.Find("EtherMines/Line")) { color = new Color(0xb4 / 255f, 0xa8 / 255f, 1, 0.9f) };
                lineMat.SetFloat("_ZTest", (float)UnityEngine.Rendering.CompareFunction.Always); // through walls, as the web's depthTest: false
                lineMat.SetFloat("_ZWrite", 0);
                lineMat.renderQueue = 3100;
            }
            lines = new GameObject("ledger view");
            lines.transform.SetParent(transform, false);
            var m = new Mesh { name = "ledger view", indexFormat = v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.vertices = v.ToArray();
            var idx = new int[v.Count];
            for (int i = 0; i < idx.Length; i++) idx[i] = i;
            m.SetIndices(idx, MeshTopology.Lines, 0);
            lines.AddComponent<MeshFilter>().sharedMesh = m;
            lines.AddComponent<MeshRenderer>().sharedMaterial = lineMat;
        }
        static readonly (Vector3, Vector3)[] Edges = MakeEdges();
        static (Vector3, Vector3)[] MakeEdges()
        {
            var e = new List<(Vector3, Vector3)>();
            for (int i = 0; i < 2; i++)
                for (int j = 0; j < 2; j++)
                {
                    e.Add((new Vector3(i, j, 0), new Vector3(i, j, 1)));
                    e.Add((new Vector3(i, 0, j), new Vector3(i, 1, j)));
                    e.Add((new Vector3(0, i, j), new Vector3(1, i, j)));
                }
            return e.ToArray();
        }

        // ---------- the block explorer (I) ----------
        Hit shown;
        Owner shownOwner;
        Dictionary<string, object> info;
        string logNote;
        int seq;
        Vector2 scroll;

        public static void Show(Hit t) { if (I != null) I.OpenFor(t); }

        async void OpenFor(Hit t)
        {
            var bd = t != null ? Rules.Block(t.Id) : null;
            if (bd == null) return;
            shown = new Hit { X = t.X, Y = t.Y, Z = t.Z, Id = t.Id };
            shownOwner = World.Store.OwnerOf(t.X, t.Y, t.Z);
            info = null;
            logNote = Session != null ? "Reading the ledger…" : "The full history is kept in the online world.";
            Open = true;
            scroll = Vector2.zero;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            if (Session == null) return;
            int my = ++seq;
            try
            {
                var r = await Session.Net.Rpc("block_info", MiniJson.Write(new Dictionary<string, object> { ["w"] = Session.World, ["px"] = t.X, ["py"] = t.Y, ["pz"] = t.Z }));
                if (my != seq || !Open) return;
                info = r as Dictionary<string, object> ?? new Dictionary<string, object>();
                logNote = null;
            }
            catch (Exception e) { Debug.LogWarning(e); if (my == seq) logNote = "The ledger can’t be reached right now."; }
        }

        void Close()
        {
            Open = false;
            shown = null;
            if (!TouchPad.Active && !Ui.Blocking) { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
        }

        static string Ago(object at)
        {
            if (!(at is string s) || !DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out var d)) return "";
            double sec = Math.Max(0, (DateTime.UtcNow - d).TotalSeconds);
            if (sec < 60) return "just now";
            if (sec < 3600) return $"{Math.Floor(sec / 60)} min ago";
            if (sec < 86400) return $"{Math.Floor(sec / 3600)} h ago";
            int days = (int)Math.Floor(sec / 86400);
            return days == 1 ? "yesterday" : $"{days} days ago";
        }
        static string Ord(int n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 == 1 ? "st" : n % 10 == 2 ? "nd" : n % 10 == 3 ? "rd" : "th");
        static string Esc(string s) => (s ?? "").Replace("<", "‹").Replace(">", "›");

        // ---------- every frame ----------
        void Update()
        {
            if (Player == null || Player.Body == null) return;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            bool t = k != null && k.tKey.wasPressedThisFrame, i = k != null && k.iKey.wasPressedThisFrame, esc = k != null && k.escapeKey.wasPressedThisFrame;
#else
            bool t = Input.GetKeyDown(KeyCode.T), i = Input.GetKeyDown(KeyCode.I), esc = Input.GetKeyDown(KeyCode.Escape);
#endif
            if (Open) { if (i || esc) Close(); }
            else if (!Ui.Blocking)
            {
                if (t) { view = !view; BuildView(); }
                else if (i && Act != null && Act.Target != null) OpenFor(Act.Target);
            }
            // the outlines follow what you build and where you walk
            if (view && (rebuildT -= Time.deltaTime) <= 0) { rebuildT = 1; BuildView(); }
        }

        GUIStyle head, row, key;

        void OnGUI()
        {
            Ui.Begin();
            if (Ui.Cine) return;
            if (head == null)
            {
                head = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold, richText = true };
                head.normal.textColor = Ui.Paper;
                row = new GUIStyle(GUI.skin.label) { fontSize = 14, richText = true, wordWrap = true };
                row.normal.textColor = Ui.Paper;
                key = new GUIStyle(row);
                key.normal.textColor = Ui.Muted;
            }
            float W = Ui.W, H = Ui.H;
            if (view && !Open && !Ui.PanelOpen)
            {
                const string tag = "Ledger view · your placed blocks are highlighted";
                float tw = row.CalcSize(new GUIContent(tag)).x + 24, tx = (W - tw) / 2, ty = Ui.Safe.y + (TouchPad.Active ? 140 : 96);
                Ui.Chip(new Rect(tx, ty, tw, 26), Ui.Violet);
                var st = new GUIStyle(row) { fontSize = 12, alignment = TextAnchor.MiddleCenter };
                st.normal.textColor = Ui.Cyan;
                GUI.Label(new Rect(tx, ty, tw, 26), tag, st);
            }
            if (!Open || shown == null) return;
            GUI.depth = -12;
            Ui.Fill(new Rect(0, 0, W, H), new Color(0.04f, 0.03f, 0.1f, 0.45f));
            float w = Mathf.Min(460, W - 32), h = Mathf.Min(H - 32, 460), x = (W - w) / 2, y = (H - h) / 2;
            Ui.Chip(new Rect(x, y, w, h));
            var bd = Rules.Block(shown.Id);
            Ui.Icon(new Rect(x + 18, y + 16, 40, 40), shown.Id);
            GUI.Label(new Rect(x + 68, y + 14, w - 86, 24), Esc(bd != null ? bd.N : "?"), head);
            GUI.Label(new Rect(x + 68, y + 38, w - 86, 20), $"{shown.X}, {shown.Y}, {shown.Z}", key);
            float yy = y + 68, kw = 90, vw = w - 36 - kw;
            void Row(string a, string b)
            {
                float rh = Mathf.Max(20, row.CalcHeight(new GUIContent(b), vw));
                GUI.Label(new Rect(x + 18, yy, kw, rh), a, key);
                GUI.Label(new Rect(x + 18 + kw, yy, vw, rh), b, row);
                yy += rh + 4;
            }
            var ow = shownOwner;
            bool mine = ow != null && ow.By == Me;
            List<object> hist = info != null && info.TryGetValue("history", out var hv) ? hv as List<object> : null;
            if (ow != null)
            {
                Row("Placed by", $"<b>{Esc(mine ? "you" : ow.Name ?? "someone")}</b>{(ow.Serial > 0 ? $" · {(mine ? "your" : "their")} {Ord((int)ow.Serial)} block" : "")}");
                if (info != null && info.TryGetValue("at", out var at) && at != null) Row("When", Ago(at));
                int bb = info != null ? MiniJson.ToInt(info.TryGetValue("builder_blocks", out var bv) ? bv : null) : 0;
                if (bb > 0) Row("Builder", $"{bb:N0} blocks standing in this world");
            }
            else Row("Status", hist != null && hist.Count > 0 ? "Part of the terrain, changed since" : "<b>Genesis block</b> · untouched since the world began");
            int drop = bd != null && bd.HasDrop ? bd.Drop : shown.Id;
            Row("Token", drop != 0 ? $"drops #{drop}" : "—");
            yy += 4;
            GUI.Label(new Rect(x + 18, yy, w - 36, 22), "<b>History</b>", row);
            yy += 24;
            float listH = y + h - 92 - yy;
            var lines2 = new List<string>();
            if (logNote != null) lines2.Add($"<color=#c9c2f2>{logNote}</color>");
            else if (hist == null || hist.Count == 0) lines2.Add("<color=#c9c2f2>Nothing yet: nobody has changed this block.</color>");
            else
                foreach (var e in hist)
                    if (e is Dictionary<string, object> d)
                    {
                        int id = MiniJson.ToInt(d.TryGetValue("id", out var iv) ? iv : null), prev = MiniJson.ToInt(d.TryGetValue("prev", out var pv) ? pv : null);
                        string what = id != 0 ? $"placed <b>{Esc(Rules.Block(id)?.N ?? "a block")}</b>" : $"mined <b>{Esc(Rules.Block(prev)?.N ?? "the terrain")}</b>";
                        lines2.Add($"{Esc(d.TryGetValue("name", out var nv) ? nv as string ?? "someone" : "someone")} {what}  <i><color=#c9c2f2>{Ago(d.TryGetValue("at", out var av2) ? av2 : null)}</color></i>");
                    }
            float ch = 0;
            foreach (var l in lines2) ch += row.CalcHeight(new GUIContent(l), w - 56) + 4;
            scroll = GUI.BeginScrollView(new Rect(x + 18, yy, w - 36, listH), scroll, new Rect(0, 0, w - 56, ch));
            float ly = 0;
            foreach (var l in lines2) { float lh = row.CalcHeight(new GUIContent(l), w - 56); GUI.Label(new Rect(0, ly, w - 56, lh), l, row); ly += lh + 4; }
            GUI.EndScrollView();
            if (GUI.Button(new Rect(x + 18, y + h - 84, 120, 32), "Close", Ui.Primary)) Close();
            GUI.Label(new Rect(x + 18, y + h - 46, w - 36, 36), "Every change to a block is written in the world’s ledger.", key);
        }
    }
}
