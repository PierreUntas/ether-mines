// Ether Mines · signs (19-signs.js, 034_signs.sql): one line of text on a sign, read by everyone. The
// texts come with the area (WorldView) and live from the database's feed (Realtime); the ones standing
// within 40 blocks get their text drawn on both faces of the board. Right-click a sign: write on yours
// (act_sign), read anyone else's, with a way to report it (act_report_sign: three reports take it down).
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Signs : MonoBehaviour
    {
        public static bool Open; // the reader or the writer is up: the keys are for it
        public Session Session;
        public WorldView World;
        public PlayerController Player;

        readonly Dictionary<long, string> texts = new Dictionary<long, string>();
        readonly Dictionary<long, (GameObject g, string text, int id)> shown = new Dictionary<long, (GameObject, string, int)>();
        readonly HashSet<string> reported = new HashSet<string>();
        float t;
        Font font;
        // the window
        int ex, ey, ez; bool editing; string draft = "", readText, readBy; bool busy; int openedFrame;

        static long Key(int x, int y, int z) => ((long)(x + 0x200000) << 36) | ((long)(z + 0x200000) << 14) | (long)(uint)y;

        public void Set(int x, int y, int z, string text)
        {
            if (string.IsNullOrEmpty(text)) texts.Remove(Key(x, y, z)); else texts[Key(x, y, z)] = text;
        }

        void Update()
        {
            Keys();
            if ((t -= Time.deltaTime) > 0 || Player.Body == null) return;
            t = 0.4f;
            var b = Player.Body;
            const float R = 40;
            var drop = new List<long>();
            foreach (var kv in shown)
            {
                Decode(kv.Key, out var x, out var y, out var z);
                texts.TryGetValue(kv.Key, out var now);
                if (now != kv.Value.text || World.Get(x, y, z) != kv.Value.id || reported.Contains(kv.Key + "|" + now) || World_Dist(b, x, z) > R + 4) drop.Add(kv.Key);
            }
            foreach (var k in drop) { Destroy(shown[k].g); shown.Remove(k); }
            foreach (var kv in texts)
            {
                if (shown.ContainsKey(kv.Key) || reported.Contains(kv.Key + "|" + kv.Value)) continue;
                Decode(kv.Key, out var x, out var y, out var z);
                if (World_Dist(b, x, z) > R) continue;
                int id = World.Get(x, y, z);
                var bd = Rules.Block(id);
                if (bd == null || !bd.Sign) continue;
                shown[kv.Key] = (Board(x, y, z, bd.O, kv.Value), kv.Value, id);
            }
        }

        static double World_Dist(PlayerPhysics b, int x, int z) => Math.Sqrt((x - b.X) * (x - b.X) + (z - b.Z) * (z - b.Z));
        static void Decode(long k, out int x, out int y, out int z)
        {
            y = (int)(k & 0x3fff);
            z = (int)((k >> 14) & 0x3fffff) - 0x200000;
            x = (int)(k >> 36) - 0x200000;
        }

        // the text on both faces of the board, facing where it was placed from (B[id].o)
        GameObject Board(int x, int y, int z, int o, string text)
        {
            if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            float nx = 0, nz = 1;
            for (int i = 0; i < o; i++) { var tmp = nx; nx = nz; nz = -tmp; }
            var g = new GameObject("sign");
            g.transform.SetParent(transform, false);
            g.transform.position = new Vector3(x + 0.5f, y + 0.73f, -(z + 0.5f));
            foreach (var side in new[] { 1, -1 })
            {
                // the face's normal, in Unity's space (z mirrored)
                var n = new Vector3(nx * side, 0, -nz * side);
                var tgo = new GameObject("text");
                tgo.transform.SetParent(g.transform, false);
                tgo.transform.localPosition = n * 0.08f;
                tgo.transform.rotation = Quaternion.LookRotation(-n); // readable from the side it faces
                // the web's lettering (signTexture): the biggest size from 40 down to 20 that fits the board,
                // cream letters outlined in dark wood; behind what stands in front of them (EtherMines/Text)
                var (lines, size) = Fit(text);
                if (textMat == null)
                {
                    textMat = new Material(Shader.Find("EtherMines/Text")) { mainTexture = font.material.mainTexture };
                    Font.textureRebuilt += f => { if (f == font && textMat != null) textMat.mainTexture = f.material.mainTexture; };
                }
                float cs = size * 0.0007f, o2 = size * 0.00336f * Mathf.Max(4, size / 6f) / 2 / 3; // the outline, about a third of the web's stroke on each side
                for (int k = 0; k < 9; k++)
                {
                    var lg = k == 8 ? tgo : new GameObject("outline");
                    if (k < 8)
                    {
                        lg.transform.SetParent(tgo.transform, false);
                        float a = k * Mathf.PI / 4;
                        lg.transform.localPosition = new Vector3(Mathf.Cos(a) * o2, Mathf.Sin(a) * o2, 0.002f);
                    }
                    var tm = lg.AddComponent<TextMesh>();
                    tm.font = font;
                    tm.text = lines;
                    tm.anchor = TextAnchor.MiddleCenter;
                    tm.alignment = TextAlignment.Center;
                    tm.fontSize = 48;
                    tm.characterSize = cs;
                    tm.color = k == 8 ? new Color(1f, 0.953f, 0.84f) : new Color(0.165f, 0.1f, 0.063f);
                    lg.GetComponent<MeshRenderer>().sharedMaterial = textMat;
                }
            }
            return g;
        }

        static Material textMat;

        // the board is 256 x 128 on the web: from size 40 down to 20 by 4, words wrapped at 232 wide, until the
        // lines fit in 124 high (a letter about 0.55 of its size wide); at 20 what's left is cut with "…"
        static (string, int) Fit(string text)
        {
            List<string> lines = null;
            int size = 40;
            for (; size >= 20; size -= 4)
            {
                lines = Wrap(text, (int)(232 / (0.55f * size)));
                if (lines.Count * size * 1.1f <= 124 && lines.TrueForAll(l => l.Length <= (int)(240 / (0.55f * size)))) return (string.Join("\n", lines), size);
            }
            size = 20;
            int max = (int)(124 / (size * 1.1f));
            if (lines.Count > max) { lines = lines.GetRange(0, max); lines[max - 1] += "…"; }
            return (string.Join("\n", lines), size);
        }

        static List<string> Wrap(string text, int perLine)
        {
            var lines = new List<string>();
            var cur = "";
            foreach (var w in text.Split(' '))
            {
                var t = cur.Length > 0 ? cur + " " + w : w;
                if (t.Length > perLine && cur.Length > 0) { lines.Add(cur); cur = w; } else cur = t;
            }
            if (cur.Length > 0) lines.Add(cur);
            return lines;
        }

        // ---------- a right-click on a sign ----------
        public void Use(Hit h)
        {
            var own = World.Store.OwnerOf(h.X, h.Y, h.Z);
            texts.TryGetValue(Key(h.X, h.Y, h.Z), out var text);
            ex = h.X; ey = h.Y; ez = h.Z;
            if (own != null && Session != null && own.By == Session.Net.UserId) { editing = true; draft = text ?? ""; }
            else if (string.IsNullOrEmpty(text) || Session == null) { Hud.Feed("nft", string.IsNullOrEmpty(text) ? "An empty sign" : "“" + text + "”", own?.Name != null ? "a sign by " + own.Name : ""); return; }
            else { editing = false; readText = text; readBy = own?.Name; }
            Open = true;
            Sounds.Click();
            openedFrame = Time.frameCount;
            if (editing && TouchPad.Active) kb = TouchScreenKeyboard.Open(draft, TouchScreenKeyboardType.Default, false, false, false, false, "Write on your sign", 60);
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        TouchScreenKeyboard kb; // a phone: the system keyboard writes the sign

        void Keys()
        {
            if (!Open || kb == null) return;
            draft = kb.text;
            if (kb.status == TouchScreenKeyboard.Status.Done) { kb = null; Save(); }
            else if (kb.status != TouchScreenKeyboard.Status.Visible) kb = null; // closed: Save and Cancel are still there
        }

        void Close()
        {
            Open = false;
            if (kb != null) { kb.active = false; kb = null; }
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        async void Save()
        {
            busy = true;
            var text = System.Text.RegularExpressions.Regex.Replace(draft, @"\s+", " ").Trim();
            if (text.Length > 60) text = text.Substring(0, 60);
            try
            {
                var r = await Session.Act("sign", new Dictionary<string, object> { ["px"] = ex, ["py"] = ey, ["pz"] = ez, ["msg"] = text }, 0, 0, 0);
                if (r != null && !r.ContainsKey("refused")) Set(ex, ey, ez, r.TryGetValue("text", out var tx) ? tx as string : "");
            }
            finally { busy = false; Close(); }
        }

        async void Report()
        {
            busy = true;
            try
            {
                var r = await Session.Net.Rpc("act_report_sign", MiniJson.Write(new Dictionary<string, object> { ["w"] = Session.World, ["px"] = ex, ["py"] = ey, ["pz"] = ez })) as Dictionary<string, object>;
                if (r != null && MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null))
                {
                    reported.Add(Key(ex, ey, ez) + "|" + readText);
                    Hud.Feed("burn", "Sign reported", MiniJson.Truthy(r.TryGetValue("removed", out var rm) ? rm : null) ? "it has been taken down" : "thank you: three reports take it down");
                }
                else
                {
                    var err = r != null && r.TryGetValue("err", out var e) ? e as string : null;
                    Hud.Feed("burn", "Report not sent", err == "must have played a little" ? "play a little before you can report a sign" : err == "your own sign" ? "this is your own sign" : err ?? "try again later");
                }
            }
            catch (Exception e) { Hud.Feed("burn", "Report not sent", e.Message); }
            finally { busy = false; Close(); }
        }

        void OnGUI()
        {
            Ui.Begin();
            if (!Open) return;
            var ev = Event.current;
            if (ev.type == EventType.KeyDown && ev.keyCode == KeyCode.Escape) { Close(); ev.Use(); return; }
            float w = 460, h = editing ? 190 : 210, x = (Ui.W - w) / 2, y = (Ui.H - h) / 2;
            Ui.Fill(new Rect(x, y, w, h), new Color(0.13f, 0.1f, 0.27f, 0.97f));
            Ui.Frame(new Rect(x, y, w, h), new Color(1, 1, 1, 0.15f));
            GUI.enabled = !busy;
            if (editing)
            {
                GUI.Label(new Rect(x + 20, y + 14, w - 40, 28), "Write on your sign", Ui.Title);
                if (ev.type == EventType.KeyDown && (ev.keyCode == KeyCode.Return || ev.keyCode == KeyCode.KeypadEnter) && Time.frameCount != openedFrame) { Save(); ev.Use(); }
                if (kb != null) GUI.Box(new Rect(x + 20, y + 52, w - 40, 30), draft); // the system keyboard writes it
                else
                {
                    GUI.SetNextControlName("sign");
                    draft = GUI.TextField(new Rect(x + 20, y + 52, w - 40, 30), draft, 60);
                    GUI.FocusControl("sign");
                }
                GUI.Label(new Rect(x + 20, y + 88, w - 40, 40), "60 characters at most. Insults and personal details are not allowed.", Ui.Small);
                if (GUI.Button(new Rect(x + w - 240, y + h - 46, 100, 32), "Cancel", Ui.Button)) Close();
                if (GUI.Button(new Rect(x + w - 130, y + h - 46, 110, 32), "Save", Ui.Primary)) Save();
            }
            else
            {
                GUI.Label(new Rect(x + 20, y + 14, w - 40, 28), readBy != null ? "A sign by " + readBy : "A sign", Ui.Title);
                GUI.Label(new Rect(x + 20, y + 50, w - 40, 50), "“" + readText + "”", Ui.Label);
                GUI.Label(new Rect(x + 20, y + 100, w - 40, 50), "Report a sign that insults someone, gives personal details or is otherwise against the rules. Three reports take it down.", Ui.Small);
                if (GUI.Button(new Rect(x + w - 240, y + h - 46, 100, 32), "Report", Ui.Button)) Report();
                if (GUI.Button(new Rect(x + w - 130, y + h - 46, 110, 32), "Close", Ui.Primary)) Close();
            }
            GUI.enabled = true;
        }
    }
}
