// Ether Mines · what you hold, in first person (04-render.js setHand, 10-loop.js): drawn by a camera of its
// own over the world (so it never sinks into a wall), bottom right, as the game places each kind: a block
// in the palm, a tool or blade held forward, a material standing in the palm, the pistol barrel forward.
// A blow reaches toward the crosshair and comes back, the pistol kicks; on guard, the blade comes up flat
// across the middle of the screen. Your bare hand when the slot is empty.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Hand : MonoBehaviour
    {
        public const int Layer = 31; // drawn only by the hand's camera
        public PlayerController Player;
        public Interaction Act;
        public Combat Combat; // null offline
        public Hover Hover;
        public Func<Dictionary<string, int>> Look; // your look: a pickaxe trim makes what you hold glow   // on board, both hands on the craft

        Camera cam;
        Transform pivot;
        GameObject model;
        string key;
        bool ranged, blockModel;
        Vector3 restP, restR;
        float guardAmt, bob;

        void Start()
        {
            var main = Player.Cam;
            main.cullingMask &= ~(1 << Layer);
            cam = new GameObject("Hand camera").AddComponent<Camera>();
            cam.transform.SetParent(main.transform, false);
            cam.clearFlags = CameraClearFlags.Depth;
            cam.cullingMask = 1 << Layer;
            cam.depth = main.depth + 1;
            cam.fieldOfView = 60;
            cam.nearClipPlane = 0.01f;
            cam.farClipPlane = 10;
            pivot = new GameObject("hand").transform;
            pivot.SetParent(cam.transform, false);
            pivot.gameObject.layer = Layer;
        }

        void Set()
        {
            var inv = Act.Inv;
            var k = inv.Held ?? "main";
            if (k == key) return;
            key = k;
            if (model != null)
            {
                if (blockModel) foreach (var f in model.GetComponentsInChildren<MeshFilter>()) Destroy(f.sharedMesh);
                Destroy(model);
            }
            model = null;
            ranged = blockModel = false;
            int id = inv.Held != null ? inv.HeldId : 0;
            float scale;
            if (id > 0) model = HeldModels.Make(id, Layer, false);
            if (model == null)
            {
                // the bare hand
                model = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(model.GetComponent<Collider>());
                model.GetComponent<MeshRenderer>().sharedMaterial = SkinMat();
                model.layer = Layer;
                model.transform.SetParent(pivot, false);
                model.transform.localScale = new Vector3(0.16f, 0.16f, 0.5f);
                Rest(0.34f, -0.32f, -0.55f, 0.2f, -0.2f, 0);
                return;
            }
            model.transform.SetParent(pivot, false);
            var info = HeldModels.InfoOf(id);
            if (info.Block)
            {
                blockModel = true;
                if (info.Cube) { scale = 0.3f; Rest(0.4f, -0.36f, -0.62f, 0.25f, 0.6f, 0); }
                else { scale = 0.36f * info.Fit; Rest(0.32f, -0.22f, -0.66f, 0.25f, 0.65f, 0); }
            }
            else if (info.Ranged) { ranged = true; scale = 0.34f; Rest(0.275f, -0.275f, -0.7f, 0.02f, 1.76f, 0.11f); }
            else if (info.Upright) { scale = 0.3f; Rest(0.32f, -0.2f, -0.66f, 0.12f, -0.45f, 0.06f); }
            else { scale = 0.42f; Rest(0.24f, -0.3f, -0.68f, 0, -0.5f, 0.2f); }
            model.transform.localScale = Vector3.one * scale;
        }

        static Material skin;
        static Material SkinMat()
        {
            if (skin == null) { skin = new Material(Shader.Find("EtherMines/Avatar")); skin.SetColor("_Color", new Color(0.965f, 0.827f, 0.722f)); skin.SetColor("_Glow", Color.black); }
            return skin;
        }

        void Rest(float x, float y, float z, float rx, float ry, float rz)
        {
            restP = new Vector3(x, y, z);
            restR = new Vector3(rx, ry, rz);
            model.transform.localPosition = new Vector3(x, y, -z);
            model.transform.localRotation = HeldModels.Mirror(rx, ry, rz);
        }

        void LateUpdate()
        {
            if (Player.Body == null || cam == null) return;
            bool show = Player.View == 0 && !(Hover != null && Hover.Aboard) && !Ui.Cine; // no hand drawn over a cinematic
            cam.enabled = show;
            if (!show) return;
            Set();
            if (Look != null && !blockModel) HeldModels.Tint(model, Looks.ToolTrim(Look(), Time.time));
            float dt = Time.deltaTime, swing = Act.Swing;
            // a blow: forward and in, the tip leaning into the target, then back
            float s = Mathf.Sin((1 - swing) * Mathf.PI) * swing;
            bob = Player.Bob; // the walk's own sway (13 running, on the ground only)
            float bx = Mathf.Sin(bob * 0.5f) * 0.015f, by = Mathf.Abs(Mathf.Cos(bob * 0.5f)) * 0.012f;
            guardAmt += ((Combat != null && Combat.Guarding ? 1 : 0) - guardAmt) * Mathf.Min(1, dt * 14);
            float g = guardAmt;
            if (ranged)
            {
                pivot.localRotation = HeldModels.Mirror(s * 0.12f, 0, 0);
                pivot.localPosition = new Vector3(bx, by + s * 0.015f, -(s * 0.04f));
                model.transform.localRotation = HeldModels.Mirror(restR.x, restR.y, restR.z);
            }
            else
            {
                pivot.localRotation = Quaternion.identity;
                pivot.localPosition = new Vector3(bx - s * 0.17f - g * 0.1f, by + s * 0.13f + g * 0.16f, -(-s * 0.3f - g * 0.04f));
                model.transform.localRotation = HeldModels.Mirror(restR.x - s * 0.75f - g * 0.2f, restR.y + s * 0.25f + g * 0.3f, restR.z + s * 0.35f + g * 1.9f);
            }
        }
    }
}
