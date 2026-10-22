// The sound shapes (Core/Synth.cs) against the browser's Web Audio: golden/audio.json (node
// golden-audio.mjs). Pure sine tones sample by sample; the rest (band-limited waves, random noise) by
// their loudness every 10 ms, which is what the ear hears of a filter or an envelope.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class AudioParity
    {
        static Synth.Wave W(string s) => s == "square" ? Synth.Wave.Square : s == "sawtooth" ? Synth.Wave.Sawtooth : s == "triangle" ? Synth.Wave.Triangle : Synth.Wave.Sine;
        static Synth.Filt F(string s) => s == "lowpass" ? Synth.Filt.Lowpass : s == "highpass" ? Synth.Filt.Highpass : Synth.Filt.Bandpass;

        public static void Run()
        {
            var dir = MeshParity.Dir();
            var cases = (List<object>)MiniJson.Parse(File.ReadAllText(Path.Combine(dir, "golden", "audio.json")));
            foreach (Dictionary<string, object> c in cases)
            {
                var a = (List<object>)c["args"];
                double D(int i) => MiniJson.ToDouble(a[i]);
                var s = new Synth();
                if ((string)c["kind"] == "tone") s.Tone(D(0), W((string)a[1]), D(2), D(3), D(4), D(5), D(6), D(7));
                else s.Noise(F((string)a[0]), D(1), D(2), D(3), D(4), D(5), D(6));
                // the loudness over the same windows, averaged over several noises for the random ones
                bool noise = (string)c["kind"] == "noise";
                int runs = noise ? 24 : 1;
                var rnd = new Random(5);
                var web = ((List<object>)c["rms"]).Select(v => MiniJson.ToDouble(v)).ToArray();
                var mine = new double[web.Length];
                float[] last = null;
                for (int r = 0; r < runs; r++)
                {
                    var buf = s.Render(rnd);
                    last = buf;
                    for (int w = 0; w < web.Length; w++)
                    {
                        double sum = 0;
                        for (int k = 0; k < 441; k++) { int i = w * 441 + k; double v = i < buf.Length ? buf[i] : 0; sum += v * v; }
                        mine[w] += Math.Sqrt(sum / 441) / runs;
                    }
                }
                // compare where the sound is: the windows louder than a tenth of its peak
                double peak = web.Max(), worst = 0;
                int peakW = Array.IndexOf(web, peak);
                for (int w = 0; w < web.Length; w++)
                {
                    if (web[w] < peak * 0.1) continue;
                    worst = Math.Max(worst, Math.Abs(mine[w] - web[w]) / web[w]);
                }
                // both sides average 24 noises; the band-limited square and sawtooth differ from plain ones a little
                double room = noise ? 0.15 : 0.08;
                string note = $"loudness within {worst * 100:0}% ({(mine[peakW] > web[peakW] ? "louder" : "softer")} at the peak)";
                bool ok = worst <= room;
                // sample by sample only from the start (Chrome plays a first block at its default 440 Hz otherwise)
                if (D(4) == 0 && c.TryGetValue("samples", out var so) && so is List<object> sl)
                {
                    double err = 0;
                    for (int i = 0; i < sl.Count; i++) { double v = i * 4 < last.Length ? last[i * 4] : 0; err = Math.Max(err, Math.Abs(v - MiniJson.ToDouble(sl[i]))); }
                    double tol = MiniJson.ToDouble(a[2]) * 0.03;
                    note += $", samples within {err:0.0000} (peak {MiniJson.ToDouble(a[2])})";
                    ok &= err <= tol;
                }
                Program.Check(ok, $"sound {c["name"]}: {note}");
            }
        }
    }
}
