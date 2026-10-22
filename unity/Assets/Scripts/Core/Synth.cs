// Ether Mines · the game's sounds are made, not recorded (src/audio.js): oscillators and filtered noise
// with the Web Audio shapes the web version uses (a linear attack, an exponential fall to 0.0005, pitch
// slides and bends, RBJ biquad filters with Web Audio's Q), rendered here into samples for a clip. Pure C#,
// checked against the browser's own rendering (CoreTests).
using System;
using System.Collections.Generic;

namespace EtherMines.Core
{
    public sealed class Synth
    {
        public const int Rate = 44100;
        public enum Wave { Sine, Square, Sawtooth, Triangle }
        public enum Filt { Lowpass, Highpass, Bandpass }

        abstract class Voice { public double T0, End; public abstract void Add(float[] buf, Random rnd); }

        readonly List<Voice> voices = new List<Voice>();
        public double Length { get; private set; }

        static int S(double t) => (int)Math.Round(t * Rate);

        // env(): 0 at t, peak at t + a, then 0.0005 at t + a + dec, and held there
        static double Env(double tau, double a, double peak, double dec)
        {
            if (tau < 0) return 0;
            if (tau < a) return peak * tau / a;
            double k = Math.Min(1, (tau - a) / dec);
            return peak * Math.Pow(0.0005 / peak, k);
        }

        sealed class ToneV : Voice
        {
            public double Freq, Peak, Dec, A, Slide, Bend, Gain;
            public Wave W;
            public override void Add(float[] buf, Random rnd)
            {
                int i0 = S(T0), i1 = Math.Min(buf.Length, S(End));
                double ph = 0, bendEnd = T0 + Math.Min(0.05, Dec * 0.3);
                for (int i = i0; i < i1; i++)
                {
                    double t = (double)i / Rate, tau = t - T0, f;
                    // the frequency's events (tone()): bend into the pitch, then slide from there to the end
                    if (Bend != 0 && t < bendEnd) f = Freq * Bend * Math.Pow(1 / Bend, tau / (bendEnd - T0));
                    else if (Slide != 0)
                    {
                        double s0 = Bend != 0 ? bendEnd : T0, s1 = T0 + Dec;
                        f = t >= s1 ? Freq * Slide : Freq * Math.Pow(Slide, (t - s0) / (s1 - s0));
                    }
                    else f = Freq;
                    double v;
                    switch (W)
                    {
                        // Web Audio's band-limited square and sawtooth are scaled down to peak at 1 (their
                        // ripple overshoots): as loud as theirs, these plain ones are 0.826 of full height
                        case Wave.Square: v = (ph < 0.5 ? 1 : -1) * 0.826; break;
                        case Wave.Sawtooth: v = (ph < 0.5 ? 2 * ph : 2 * ph - 2) * 0.826; break;
                        case Wave.Triangle: v = ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4; break;
                        default: v = Math.Sin(2 * Math.PI * ph); break;
                    }
                    buf[i] += (float)(v * Env(tau, A, Peak, Dec) * Gain);
                    ph += f / Rate;
                    ph -= Math.Floor(ph);
                }
            }
        }

        sealed class NoiseV : Voice
        {
            public double Freq, Q, Peak, Dec, Rate1, Gain;
            public Filt F;
            public override void Add(float[] buf, Random rnd)
            {
                int i0 = S(T0), i1 = Math.Min(buf.Length, S(End));
                // the biquad (Web Audio's: lowpass and highpass take Q in dB, bandpass as is)
                double f = Math.Min(Freq, Rate / 2.0 - 10), w0 = 2 * Math.PI * f / Rate, cw = Math.Cos(w0), sw = Math.Sin(w0);
                double alpha = F == Filt.Bandpass ? sw / (2 * Math.Max(1e-4, Q)) : sw / (2 * Math.Pow(10, Q / 20));
                double b0, b1, b2, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
                if (F == Filt.Lowpass) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
                else if (F == Filt.Highpass) { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
                else { b0 = alpha; b1 = 0; b2 = -alpha; }
                b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
                double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
                // white noise played at rate (Web Audio's playbackRate): read between its samples
                double pos = 0, n0 = rnd.NextDouble() * 2 - 1, n1 = rnd.NextDouble() * 2 - 1;
                for (int i = i0; i < i1; i++)
                {
                    double x = n0 + (n1 - n0) * pos;
                    pos += Rate1;
                    while (pos >= 1) { pos -= 1; n0 = n1; n1 = rnd.NextDouble() * 2 - 1; }
                    double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
                    x2 = x1; x1 = x; y2 = y1; y1 = y;
                    buf[i] += (float)(y * Env((double)i / Rate - T0, 0.004, Peak, Dec) * Gain);
                }
            }
        }

        // a slow swell (padChord): up linearly to peak, held, down to nothing
        sealed class SwellV : Voice
        {
            public double Freq, Peak, Up, Hold, Down;
            public Wave W;
            public override void Add(float[] buf, Random rnd)
            {
                int i0 = S(T0), i1 = Math.Min(buf.Length, S(End));
                double ph = 0;
                for (int i = i0; i < i1; i++)
                {
                    double tau = (double)i / Rate - T0;
                    double g = tau < Up ? Peak * tau / Up : tau < Hold ? Peak : tau < Down ? Peak * (1 - (tau - Hold) / (Down - Hold)) : 0;
                    double v = W == Wave.Sine ? Math.Sin(2 * Math.PI * ph) : ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4;
                    buf[i] += (float)(v * g);
                    ph += Freq / Rate;
                    ph -= Math.Floor(ph);
                }
            }
        }

        void Add(Voice v) { voices.Add(v); Length = Math.Max(Length, v.End); }

        /// <summary>tone(freq, type, peak, dec, t, dest, slide, a, bend), its gain multiplied by gain.</summary>
        public Synth Tone(double freq, Wave w, double peak, double dec, double t = 0, double slide = 0, double a = 0.005, double bend = 0, double gain = 1)
        {
            Add(new ToneV { Freq = freq, W = w, Peak = peak, Dec = dec, T0 = t, End = t + a + dec + 0.05, Slide = slide, A = a, Bend = bend, Gain = gain });
            return this;
        }

        /// <summary>noise(type, freq, q, peak, dec, t, dest, rate), its gain multiplied by gain.</summary>
        public Synth Noise(Filt f, double freq, double q, double peak, double dec, double t = 0, double rate = 1, double gain = 1)
        {
            Add(new NoiseV { F = f, Freq = freq, Q = q, Peak = peak, Dec = dec, T0 = t, End = t + dec + 0.05, Rate1 = rate, Gain = gain });
            return this;
        }

        public Synth Swell(double freq, Wave w, double peak, double t, double up, double hold, double down)
        {
            Add(new SwellV { Freq = freq, W = w, Peak = peak, T0 = t, Up = up, Hold = hold, Down = down, End = t + down + 0.05 });
            return this;
        }

        public float[] Render(Random rnd)
        {
            var buf = new float[Math.Max(1, S(Length))];
            foreach (var v in voices) v.Add(buf, rnd);
            return buf;
        }
    }
}
