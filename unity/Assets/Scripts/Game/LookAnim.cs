// Ether Mines · a look's small animations (17-looks.js anim): a halo turning, a flag or a cape in the wind,
// wings beating, a companion bobbing, as export-looks.mjs measured them: each moving part's channels follow
// a + l t + s sin(w t) + c cos(w t), the game's coordinates mirrored into Unity's.
using System.Collections.Generic;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class LookAnim : MonoBehaviour
    {
        public readonly List<(Transform t, float[][] ch)> Parts = new List<(Transform, float[][])>();

        static float At(float[] c, float t) => c[0] + c[1] * t + (c[4] != 0 ? c[2] * Mathf.Sin(c[4] * t) + c[3] * Mathf.Cos(c[4] * t) : 0);

        public void Pose(float t)
        {
            foreach (var (tr, ch) in Parts)
            {
                if (tr == null) continue;
                tr.localPosition = new Vector3(At(ch[0], t), At(ch[1], t), -At(ch[2], t));
                tr.localRotation = HeldModels.Mirror(At(ch[3], t), At(ch[4], t), At(ch[5], t));
                tr.localScale = new Vector3(At(ch[6], t), At(ch[7], t), At(ch[8], t));
            }
        }

        void Update() => Pose(Time.time);
    }
}
