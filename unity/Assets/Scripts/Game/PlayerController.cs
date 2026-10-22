// Ether Mines · you: keyboard and mouse (or a gamepad), walking with the web version's own physics
// (core PlayerPhysics), seen in first person or from behind (V), as in 05-player.js and 14-startup.js.
// On a touch screen, TouchPad's stick, finger and buttons.
using System;
using EtherMines.Core;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace EtherMines.Game
{
    public sealed class PlayerController : MonoBehaviour
    {
        public WorldView World;
        public Camera Cam;
        public PlayerPhysics Body;
        public double Yaw, Pitch = -0.12; // radians, as the web version: yaw 0 looks toward -z, pitch > 0 looks up
        public bool Fly; // F: flying freely (exploring, debugging)
        public int View; // 0 first person, 1 from behind, 2 from the front
        public float Sensitivity = 1f;
        public bool Sneaking; // crouching: place against a door instead of opening it
        public bool Moving;   // walking (the hand bobs)
        public float MoveX, MoveZ; // the way you push (strafe, forward), for the dodge
        public Func<float> Lift = () => 0; // on board a craft: seated higher, the eyes go up as much
        public Action<bool> AfterStep;     // after the physics (the back seat puts you where it is), given the jump key
        readonly double[] boxBuf = new double[64 * 6];
        double eyeLag;
        bool ready;

        public Vector3 GamePos => new Vector3((float)Body.X, (float)Body.Y, (float)Body.Z);

        public void Init(double x, double y, double z)
        {
            Body = new PlayerPhysics(World.Get, World.Loaded, Boxes) { X = x, Y = y, Z = z };
            World.PlayerPos = () => GamePos;
        }

        double[][] Boxes(int id, int x, int y, int z)
        {
            if (!Mesher.IsSolid(id)) return null;
            if (!Mesher.IsShaped(id)) return Full;
            var pw = World.Powered; // an open door (powered) lets you through
            int n = Mesher.ShapeBoxes(id, x, y, z, (a, b, c) => pw.Count > 0 && pw.Contains(Circuits.K(a, b, c)), null, boxBuf);
            var r = new double[n][];
            for (int i = 0; i < n; i++) r[i] = new[] { boxBuf[i * 6], boxBuf[i * 6 + 1], boxBuf[i * 6 + 2], boxBuf[i * 6 + 3], boxBuf[i * 6 + 4], boxBuf[i * 6 + 5] };
            return r;
        }
        static readonly double[][] Full = { new double[] { 0, 0, 0, 1, 1, 1 } };

        static bool IsLadder(int id) { var b = Rules.Block(id); return b != null && b.Shape == "ladder"; }

        void Start()
        {
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        void Update()
        {
            if (Body == null) return;
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            ReadInput(out float fx, out float fz, out float lookX, out float lookY, out bool jump, out bool run, out bool sneak, out bool toggleView, out bool toggleFly, out bool unlock);
            Body.AutoJump = TouchPad.Active; // no jump key under the thumb: walking into a step hops it (10-loop.js)
            Sneaking = sneak;
            Moving = fx != 0 || fz != 0;
            MoveX = fx; MoveZ = fz;
            if (unlock) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
            if (!TouchPad.Active && Cursor.lockState != CursorLockMode.Locked && !Ui.PanelOpen && !Signs.Open && ClickedIn()) { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
            Yaw -= lookX * 0.0025 * Sensitivity;
            Pitch = Math.Max(-1.55, Math.Min(1.55, Pitch - lookY * 0.0025 * Sensitivity * -1));
            if (toggleView) View = (View + 1) % 3;
            if (toggleFly) { Fly = !Fly; Body.Vy = 0; }
            // wait for the ground under you before falling
            if (!ready) ready = World.Loaded((int)Math.Floor(Body.X), (int)Math.Floor(Body.Z)) && World.Store.Count > 20;
            if (Fly)
            {
                double sp = run ? 24 : 10, sn = Math.Sin(Yaw), cs = Math.Cos(Yaw);
                Body.X += (-sn * fz + cs * fx) * sp * dt;
                Body.Z += (-cs * fz - sn * fx) * sp * dt;
                Body.Y += ((jump ? 1 : 0) - (sneak ? 1 : 0)) * sp * dt;
            }
            else if (ready)
            {
                bool was = Body.On;
                double vy0 = Body.Vy;
                Body.Step(dt, fx, fz, Yaw, jump, run, sneak, IsLadder);
                Footsteps(dt, Math.Sqrt(fx * fx + fz * fz), run, was, vy0);
                if (Body.Y < -10) { Body.X = World_SpawnX; Body.Y = EtherMines.Core.World.SPAWN.Y + 0.1; Body.Z = World_SpawnZ; Body.Vy = 0; }
            }
            AfterStep?.Invoke(jump);
            // the eye catches up smoothly after a step up
            eyeLag = Math.Max(0, eyeLag + Body.StepUp - dt * 4);
            Body.StepUp = 0;
            PlaceCamera();
        }

        // a step every 0.38 s walking (0.28 running) on the ground, and one landing from a fall (10-loop.js)
        double stepT;
        void Footsteps(double dt, double l, bool run, bool was, double fallV)
        {
            string Under() => Sounds.MatOf(World.Get((int)Math.Floor(Body.X), (int)Math.Floor(Body.Y - 0.1), (int)Math.Floor(Body.Z)));
            if (l > 0.1 && Body.On && !Body.InWater)
            {
                if ((stepT -= dt) <= 0) { stepT = run ? 0.28 : 0.38; Sounds.Step(Under()); }
            }
            else stepT = 0.12;
            if (!was && Body.On && fallV < -7) { Sounds.Step(Under()); Haptics.Play(fallV < -14 ? Haptics.Kind.Heavy : Haptics.Kind.Medium); }
        }

        static double World_SpawnX => EtherMines.Core.World.SPAWN.X + 0.5;
        static double World_SpawnZ => EtherMines.Core.World.SPAWN.Z + 2.5;

        void PlaceCamera()
        {
            var eye = new Vector3((float)Body.X, (float)(Body.Y + PlayerPhysics.EYE - Math.Min(eyeLag, 0.6)) + Lift(), -(float)Body.Z);
            var rot = Quaternion.Euler((float)(-Pitch * Mathf.Rad2Deg), (float)(-Yaw * Mathf.Rad2Deg), 0);
            if (View == 0) Cam.transform.SetPositionAndRotation(eye, rot);
            else
            {
                var back = View == 1 ? rot : rot * Quaternion.Euler(0, 180, 0);
                var target = eye + back * new Vector3(0.6f, 0.2f, -3.6f);
                Cam.transform.SetPositionAndRotation(target, back);
            }
        }

        static bool ClickedIn()
        {
#if ENABLE_INPUT_SYSTEM
            return Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
#else
            return Input.GetMouseButtonDown(0);
#endif
        }

        static void ReadInput(out float fx, out float fz, out float lookX, out float lookY, out bool jump, out bool run, out bool sneak, out bool toggleView, out bool toggleFly, out bool unlock)
        {
            fx = fz = lookX = lookY = 0;
            jump = run = sneak = toggleView = toggleFly = unlock = false;
            bool locked = !TouchPad.Active && Cursor.lockState == CursorLockMode.Locked;
            if (Ui.Blocking) return; // writing a message, a window open: the keys are for it
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k != null)
            {
                // keys by their place on the keyboard (Input System): W A S D here are Z Q S D on a French one
                if (k.wKey.isPressed || k.upArrowKey.isPressed) fz++;
                if (k.sKey.isPressed || k.downArrowKey.isPressed) fz--;
                if (k.dKey.isPressed || k.rightArrowKey.isPressed) fx++;
                if (k.aKey.isPressed || k.leftArrowKey.isPressed) fx--;
                jump = k.spaceKey.isPressed;
                run = k.leftShiftKey.isPressed || k.rightShiftKey.isPressed;
                sneak = k.cKey.isPressed || k.leftCtrlKey.isPressed;
                toggleView = k.vKey.wasPressedThisFrame;
                toggleFly = k.fKey.wasPressedThisFrame;
                unlock = k.escapeKey.wasPressedThisFrame;
            }
            var m = Mouse.current;
            if (m != null && locked) { var d = m.delta.ReadValue(); lookX = d.x; lookY = d.y; }
            var g = Gamepad.current;
            if (g != null)
            {
                var ls = g.leftStick.ReadValue(); fx += ls.x; fz += ls.y;
                var rs = g.rightStick.ReadValue(); lookX += rs.x * 12; lookY += rs.y * 12;
                jump |= g.buttonSouth.isPressed;
                run |= g.leftStickButton.isPressed;
            }
#else
            fx = Input.GetAxisRaw("Horizontal");
            fz = Input.GetAxisRaw("Vertical");
            if (locked) { lookX = Input.GetAxisRaw("Mouse X") * 20; lookY = Input.GetAxisRaw("Mouse Y") * 20; }
            jump = Input.GetKey(KeyCode.Space);
            run = Input.GetKey(KeyCode.LeftShift);
            sneak = Input.GetKey(KeyCode.C) || Input.GetKey(KeyCode.LeftControl);
            toggleView = Input.GetKeyDown(KeyCode.V);
            toggleFly = Input.GetKeyDown(KeyCode.F);
            unlock = Input.GetKeyDown(KeyCode.Escape);
#endif
            TouchPad.Poll();
            if (TouchPad.Active)
            {
                // the finger's drag turns you as on the web (0.005 rad a point), the stick walks
                fx += TouchPad.Move.x; fz += TouchPad.Move.y;
                lookX += TouchPad.Look.x * 2; lookY -= TouchPad.Look.y * 2;
                jump |= TouchPad.Jump; sneak |= TouchPad.Sneak; run |= TouchPad.Sprint; toggleView |= TouchPad.View;
            }
        }
    }
}
