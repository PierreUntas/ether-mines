// Ether Mines · the touch controls (05-player.js on a phone): the left thumb walks with a stick (bottom
// left), a finger anywhere else turns the view by dragging, a short tap places (or opens a door, pets,
// strikes a mob or a player) where it touches, a long press mines where it touches; buttons on the right
// to jump, run, crouch, guard, dodge and ride, and on top to open the chest, the chat, change the view and the
// menu (the objectives: a tap on the objective's chip). A tap on the bar picks the slot. Drawn as the web's
// (style.css .stick, .tbtn, .abtn, #press, with its icons). The other scripts read what it says each frame.
using System;
using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class TouchPad : MonoBehaviour
    {
        static bool seen;
        // a phone or a tablet, or a screen that has been touched
        public static bool Active => seen || Application.isMobilePlatform;

        // read by the others each frame (positions in interface points, y down)
        public static Vector2 Move;               // the stick: x strafe, y forward, -1..1
        public static Vector2 Look;               // how far the view finger moved this frame
        public static bool Jump, Sneak, Guard, Sprint;
        public static bool Mining;                // a long press, held
        public static bool Tap;                   // a short tap ended this frame (at Aim)
        public static bool Dash, Ride, Bag, Chat, Emote, View, Goals, Menu; // a button pressed this frame
        public static int Slot = -1;              // a slot of the bar tapped this frame
        public static Vector2? Aim;               // where the finger aims (null: the crosshair)

        // which buttons show (set by Game): the guard with a blade, the ride with a craft, the dodge with the boots
        public static Func<bool> ShowGuard = () => false, ShowRide = () => false, ShowDash = () => false, Riding = () => false, Ranged = () => false;
        public static Func<int, Rect> SlotRect;   // the bar's slots (Hud)
        public static bool GoalsTapped;           // the objective's chip was tapped (Guide): Goals next frame

        const float HoldS = 0.3f, Slop = 12, StickR = 46;

        enum Own { Ignored, Stick, Look, Jump, Sneak, Guard }
        readonly struct Finger { public readonly int Id; public readonly Vector2 Pos; public Finger(int id, Vector2 p) { Id = id; Pos = p; } }
        static readonly Dictionary<int, Own> owners = new Dictionary<int, Own>();
        static readonly Dictionary<int, Vector2> last = new Dictionary<int, Vector2>();
        static readonly List<Finger> now = new List<Finger>();
        static readonly List<int> gone = new List<int>();
        static Vector2 stickO, knob, lookL;
        static bool stickOn;
        // the press of the view finger: where it started, when, whether it became a drag or a mining
        static bool pressing, drag, mine;
        static Vector2 press0, pressAt, tapAt;
        static float pressT;
        static int polled = -1;

        void Awake()
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            Input.simulateMouseWithTouches = false; // a touch is not a click: the mouse paths stay quiet
#endif
        }

        void Update() => Poll();

        // once a frame, whoever asks first (PlayerController, Interaction, Items, Panel, Chat...)
        public static void Poll()
        {
            if (polled == Time.frameCount) return;
            polled = Time.frameCount;
            Look = Vector2.zero;
            Tap = Dash = Ride = Bag = Chat = Emote = View = Menu = false;
            Goals = GoalsTapped; GoalsTapped = false;
            Slot = -1;
            reservedNow.Clear(); reservedNow.AddRange(Reserved); Reserved.Clear();
            Read(now);
            if (now.Count > 0) seen = true;
            if (!Active) return;
            // a window open, or the chat: its own controls take the fingers; let go of everything here
            if (Ui.Blocking)
            {
                ReleaseAll();
                foreach (var f in now) owners[f.Id] = Own.Ignored;
                Remember();
                return;
            }
            gone.Clear();
            foreach (var id in owners.Keys) { bool still = false; foreach (var f in now) if (f.Id == id) { still = true; break; } if (!still) gone.Add(id); }
            foreach (var id in gone) End(id);
            foreach (var f in now)
            {
                if (!owners.ContainsKey(f.Id)) Begin(f.Id, f.Pos);
                else Moved(f.Id, f.Pos);
            }
            Remember();
            // a press held still long enough: it mines (or fires the pistol) where it touches
            if (pressing && !drag && !mine && Time.unscaledTime - pressT >= HoldS) { mine = true; Mining = true; Haptics.Play(Haptics.Kind.Light); }
            Aim = pressing && !drag && !(mine && Ranged()) ? pressAt : Tap ? tapAt : (Vector2?)null;
            Jump = Holding(Own.Jump);
            Sneak = Holding(Own.Sneak);
            Guard = Holding(Own.Guard) && ShowGuard();
        }

        static void Remember() { last.Clear(); foreach (var f in now) last[f.Id] = f.Pos; }
        static bool Holding(Own o) { foreach (var v in owners.Values) if (v == o) return true; return false; }

        static void Read(List<Finger> into)
        {
            into.Clear();
            float s = Ui.Scale, h = Screen.height;
#if ENABLE_INPUT_SYSTEM
            var ts = Touchscreen.current;
            if (ts == null) return;
            foreach (var t in ts.touches)
            {
                if (!t.press.isPressed) continue;
                var p = t.position.ReadValue();
                into.Add(new Finger(t.touchId.ReadValue(), new Vector2(p.x / s, (h - p.y) / s)));
            }
#else
            for (int i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled) continue;
                into.Add(new Finger(t.fingerId, new Vector2(t.position.x / s, (h - t.position.y) / s)));
            }
#endif
        }

        // ---------- the layout (points) ----------
        static Vector2 StickHome() => new Vector2(Mathf.Max(24, Ui.W * 0.13f) + 64 + Ui.Safe.x, Ui.H * 0.56f);
        static Rect ActBox() { var sa = Ui.Safe; float right = Ui.W - sa.xMax; return new Rect(Ui.W - right - 22 - 152, Ui.H / 2 - 101, 152, 202); }
        static Rect Btn(float x, float y) { var b = ActBox(); return new Rect(b.x + x, b.y + y, 62, 62); }
        static Rect JumpR => Btn(90, 0);
        static Rect SneakR => Btn(90, 140);
        static Rect SprintR => Btn(0, 70);
        static Rect GuardR => Btn(0, 140); // the ride button takes the same place (never both)
        static Rect DashR => Btn(0, 0);
        // the five on top (#topBtns: 44 x 44, 6 apart), their icons
        static readonly string[] tops = { "chest", "chat", "emote", "view", "menu" };
        static Rect Top(int i) { float w = tops.Length * 44 + (tops.Length - 1) * 6; return new Rect((Ui.W - w) / 2 + i * 50, Ui.Safe.y + 8, 44, 44); }

        // what takes its own taps (the aimed block's label, the claim bar's buttons): drawn last frame, read here once
        public static readonly List<Rect> Reserved = new List<Rect>();
        static readonly List<Rect> reservedNow = new List<Rect>();

        static void Begin(int id, Vector2 p)
        {
            owners[id] = Own.Ignored;
            foreach (var rr in reservedNow) if (rr.Contains(p)) return;
            for (int i = 0; i < tops.Length; i++)
                if (Top(i).Contains(p))
                {
                    if (i == 0) Bag = true; else if (i == 1) Chat = true; else if (i == 2) Emote = true; else if (i == 3) View = true; else Menu = true;
                    return;
                }
            if (JumpR.Contains(p)) { owners[id] = Own.Jump; return; }
            if (SneakR.Contains(p)) { owners[id] = Own.Sneak; return; }
            if (SprintR.Contains(p)) { Sprint = !Sprint; return; }
            if (GuardR.Contains(p))
            {
                if (ShowRide()) { Ride = true; return; }
                if (ShowGuard()) { owners[id] = Own.Guard; return; }
            }
            if (DashR.Contains(p) && ShowDash()) { Dash = true; return; }
            if (SlotRect != null)
            {
                for (int i = 0; i < 9; i++)
                    if (SlotRect(i).Contains(p)) { Slot = i; return; }
                if (SlotRect(9).Contains(p)) { Bag = true; return; } // "…": the whole chest
            }
            if (p.x < Ui.W * 0.4f && p.y > Ui.H * 0.25f && !Holding(Own.Stick))
            {
                owners[id] = Own.Stick;
                var home = StickHome();
                stickO = (p - home).magnitude < 90 ? home : p;
                stickOn = true;
                SetKnob(p);
                return;
            }
            if (Holding(Own.Look)) return;
            owners[id] = Own.Look;
            lookL = p;
            pressing = true; drag = false; mine = false;
            press0 = pressAt = p;
            pressT = Time.unscaledTime;
        }

        static void SetKnob(Vector2 p)
        {
            var d = p - stickO;
            float l = d.magnitude;
            if (l > StickR) d *= StickR / l;
            knob = d;
            Move = new Vector2(d.x / StickR, -d.y / StickR);
        }

        static void Moved(int id, Vector2 p)
        {
            var o = owners[id];
            if (o == Own.Stick) { SetKnob(p); return; }
            if (o != Own.Look) return;
            if (pressing && !drag && !mine && (p - press0).magnitude > Slop) drag = true;
            if (pressing && mine && !Ranged()) { pressAt = p; lookL = p; return; } // mining: the finger aims
            if (pressing && !drag && !mine) return;
            // dragging (or firing the pistol, whose bolts go down the crosshair): the finger turns the view
            Look += p - lookL;
            lookL = p;
            pressAt = p;
        }

        static void End(int id)
        {
            var o = owners[id];
            owners.Remove(id);
            if (o == Own.Stick) { stickOn = false; knob = Vector2.zero; Move = Vector2.zero; }
            if (o != Own.Look) return;
            if (pressing && !mine && !drag) { Tap = true; tapAt = pressAt; }
            pressing = false;
            if (mine) { mine = false; Mining = false; }
        }

        static void ReleaseAll()
        {
            owners.Clear();
            stickOn = false; knob = Vector2.zero; Move = Vector2.zero;
            pressing = drag = mine = Mining = false;
            Jump = Sneak = Guard = false;
            Aim = null;
        }

        // the app sent to the background: nothing stays held
        void OnApplicationPause(bool paused) { if (paused) ReleaseAll(); }

        // ---------- drawing (style.css: .stick, .tbtn, .abtn, #press) ----------
        static readonly Color edge = new Color(1, 1, 1, 0.28f), edgeOn = new Color(1, 1, 1, 0.6f);

        // a rounded glass button with its icon (violet when on, as .abtn.on)
        static void Button(Rect r, string icon, bool on, float iconSize)
        {
            Ui.Round(r, on ? Ui.Violet : Ui.Glass, 10, on ? edgeOn : edge, 2);
            Ui.Glyph(new Rect(r.center.x - iconSize / 2, r.center.y - iconSize / 2, iconSize, iconSize), icon, Ui.Text);
        }

        void OnGUI()
        {
            if (!Active || Ui.Blocking) return;
            Ui.Begin();
            GUI.depth = 5;
            // the stick (128 x 128, rounded, its knob 52 x 52), where the thumb put it (or at home), dimmer at rest
            var o = stickOn ? stickO : StickHome();
            var c = GUI.color;
            GUI.color = new Color(1, 1, 1, stickOn ? 1 : 0.75f);
            Ui.Round(new Rect(o.x - 64, o.y - 64, 128, 128), new Color(1, 1, 1, 0.1f), 14, edge, 2);
            Ui.Round(new Rect(o.x + knob.x - 26, o.y + knob.y - 26, 52, 52), new Color(1, 1, 1, 0.35f), 10, new Color(1, 1, 1, 0.5f), 2);
            GUI.color = c;
            Button(JumpR, "jump", Jump, 28);
            Button(SneakR, "crouch", Sneak, 28);
            Button(SprintR, "run", Sprint, 28);
            if (ShowRide()) Button(GuardR, "ride", Riding(), 28);
            else if (ShowGuard()) Button(GuardR, "guard", Guard, 28);
            if (ShowDash()) Button(DashR, "dodge", false, 28);
            for (int i = 0; i < tops.Length; i++) Button(Top(i), tops[i], false, 22);
            // the ring under the finger (#press, 104 across): it closes in while charging, then glows cyan and
            // pulses while mining
            if (pressing && !drag)
            {
                float k = Mathf.Clamp01((Time.unscaledTime - pressT) / HoldS);
                if (mine)
                {
                    float pulse = 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * Mathf.PI * 4);
                    float rr = 52 + pulse * 3;
                    Ui.Round(new Rect(pressAt.x - rr - 6, pressAt.y - rr - 6, rr * 2 + 12, rr * 2 + 12), Color.clear, rr + 6, new Color(Ui.Cyan.r, Ui.Cyan.g, Ui.Cyan.b, 0.25f), 6);
                    Ui.Round(new Rect(pressAt.x - rr, pressAt.y - rr, rr * 2, rr * 2), Color.clear, rr, Ui.Cyan, 4);
                }
                else
                {
                    float rr = Mathf.Lerp(80, 52, k);
                    Ui.Round(new Rect(pressAt.x - rr, pressAt.y - rr, rr * 2, rr * 2), Color.clear, rr, new Color(1, 1, 1, 0.85f * k), 3);
                }
            }
        }
    }
}
