// Golden data for AudioParity.cs: the web version's sound shapes (src/audio.js tone() and noise()) rendered
// by the browser's own Web Audio (an OfflineAudioContext in headless Chromium), to check Core/Synth.cs
// against. Run from anywhere:  node unity/CoreTests/golden-audio.mjs
//   golden/audio.json  per case: its parameters, and the browser's loudness every 10 ms (RMS, averaged over 24
//                      takes for the noises); for pure sine tones the samples themselves (every 4th one)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('./golden/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-proxy-server'] });
const page = await browser.newPage();
const cases = [
  // tone(freq, type, peak, dec, t, slide, a, bend)
  { name: 'chime note', kind: 'tone', args: [880, 'sine', 0.09, 0.9, 0.05, 0, 0.01, 0] },
  { name: 'bell overtone', kind: 'tone', args: [1773.8, 'sine', 0.023, 1.2, 0, 0, 0.005, 0] },
  { name: 'place thud (slide)', kind: 'tone', args: [220, 'sine', 0.16, 0.1, 0, 0.7, 0.005, 0] },
  { name: 'stone break (slide)', kind: 'tone', args: [95, 'sine', 0.18, 0.15, 0.01, 0.6, 0.005, 0] },
  { name: 'koto bend', kind: 'tone', args: [440, 'sine', 0.12, 0.4, 0, 0, 0.005, 1.06] },
  { name: 'bend and slide', kind: 'tone', args: [600, 'sine', 0.1, 0.3, 0, 1.4, 0.005, 0.9] },
  { name: 'triangle blip', kind: 'tone', args: [960, 'triangle', 0.17, 0.06, 0, 0, 0.005, 0] },
  { name: 'square click', kind: 'tone', args: [1800, 'square', 0.05, 0.02, 0, 0, 0.005, 0] },
  { name: 'sawtooth zap', kind: 'tone', args: [1900, 'sawtooth', 0.14, 0.1, 0, 0.28, 0.002, 0] },
  // noise(type, freq, q, peak, dec, t, rate)
  { name: 'grass step', kind: 'noise', args: ['bandpass', 900, 0.8, 0.22, 0.09, 0, 1] },
  { name: 'sand step', kind: 'noise', args: ['highpass', 2400, 0.5, 0.22, 0.1, 0, 1] },
  { name: 'glass hit', kind: 'noise', args: ['bandpass', 4940, 7, 0.3, 0.056, 0, 1] },
  { name: 'stone break', kind: 'noise', args: ['bandpass', 1500, 1.6, 0.45, 0.156, 0, 1] },
  { name: 'break rumble', kind: 'noise', args: ['lowpass', 750, 1, 0.3, 0.18, 0.02, 0.7] },
  { name: 'door creak', kind: 'noise', args: ['bandpass', 380, 2.5, 0.35, 0.22, 0, 0.8] },
  { name: 'plate', kind: 'noise', args: ['lowpass', 400, 1, 0.4, 0.08, 0, 1] },
];
const res = await page.evaluate(async cases => {
  const R = 44100,
    out = [];
  for (const c of cases) {
    const takes = c.kind === 'noise' ? 24 : 1,
      rms = [];
    let data;
    for (let take = 0; take < takes; take++) {
      const len = Math.ceil(R * 1.5),
        ctx = new OfflineAudioContext(1, len, R),
        dest = ctx.destination;
      const env = (g, t, a, peak, dec) => {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(0.0005, t + a + dec);
      };
      if (c.kind === 'tone') {
        const [freq, type, peak, dec, t, slide, a, bend] = c.args,
          o = ctx.createOscillator();
        o.type = type;
        if (bend) {
          o.frequency.setValueAtTime(freq * bend, t);
          o.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.05, dec * 0.3));
        } else o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dec);
        const g = ctx.createGain();
        env(g, t, a, peak, dec);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + a + dec + 0.05);
      } else {
        const [type, freq, q, peak, dec, t, rate] = c.args,
          buf = ctx.createBuffer(1, R * 1.5, R),
          d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = rate;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        env(g, t, 0.004, peak, dec);
        s.connect(f);
        f.connect(g);
        g.connect(dest);
        s.start(t, 0);
        s.stop(t + dec + 0.05);
      }
      data = (await ctx.startRendering()).getChannelData(0);
      const w = R / 100;
      for (let i = 0, n = 0; i + w <= data.length; i += w, n++) {
        let s = 0;
        for (let k = 0; k < w; k++) s += data[i + k] ** 2;
        rms[n] = (rms[n] || 0) + Math.sqrt(s / w) / takes;
      }
    }
    const r = { ...c, rms: rms.map(v => Math.round(v * 1e6) / 1e6) };
    if (c.kind === 'tone' && c.args[1] === 'sine')
      r.samples = Array.from(
        data.filter((_, i) => i % 4 === 0),
        v => Math.round(v * 1e6) / 1e6,
      );
    out.push(r);
  }
  return out;
}, cases);
await browser.close();
writeFileSync(new URL('audio.json', out), JSON.stringify(res));
console.log(res.length + ' sounds rendered by the browser');
