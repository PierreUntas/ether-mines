// Generative sounds: everything is synthesized with Web Audio, no audio file.
// window.Sound: init() on the first click (browser requirement), then sound effects per material
// and an ambiance that follows the day, the night, and depth.
(function () {
  const KEY = 'ether-mines:son';
  let ctx = null,
    master = null,
    sfx = null,
    amb = null,
    noiseBuf = null,
    on = true;
  try {
    on = localStorage.getItem(KEY) !== '0';
  } catch (e) {}

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.55;
    sfx.connect(master);
    amb = ctx.createGain();
    amb.gain.value = 0.0;
    amb.connect(master);
    // white noise reused by all the sound effects
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startPad();
  }

  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0005, t + a + dec);
  }
  // filtered breath: the basis for footsteps, hits and breaks
  function noise(type, freq, q, peak, dec, t = now(), dest = sfx, rate = 1) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
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
    s.start(t, Math.random() * 1.2);
    s.stop(t + dec + 0.05);
  }
  function tone(freq, type, peak, dec, t = now(), dest = sfx, slide = 0, a = 0.005, bend = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    if (bend) {
      // a quick pitch bend into true pitch right at the attack, like a koto string settling after a pluck
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
  }

  // each material has its own noise color: [filter, frequency, Q, decay]
  const MAT = {
    herbe: ['bandpass', 900, 0.8, 0.09],
    sable: ['highpass', 2400, 0.5, 0.1],
    neige: ['highpass', 3200, 0.7, 0.12],
    bois: ['bandpass', 520, 3, 0.08],
    verre: ['bandpass', 3800, 6, 0.07],
    pierre: ['bandpass', 1500, 1.6, 0.06],
  };
  const m = k => MAT[k] || MAT.pierre;
  const jitter = v => v * (0.85 + Math.random() * 0.3);

  const Sound = {
    init,
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      try {
        localStorage.setItem(KEY, on ? '1' : '0');
      } catch (e) {}
      if (master) master.gain.setTargetAtTime(on ? 1 : 0, now(), 0.05);
      return on;
    },
    step(k) {
      if (!ctx) return;
      const [t, f, q, d] = m(k);
      noise(t, jitter(f), q, 0.22, d);
      if (k === 'bois') tone(jitter(130), 'sine', 0.08, 0.06);
    },
    hit(k) {
      if (!ctx) return;
      const [t, f, q, d] = m(k);
      noise(t, jitter(f * 1.3), q + 1, 0.3, d * 0.8);
      if (k === 'pierre' || k === 'verre') tone(jitter(k === 'verre' ? 2200 : 900), 'triangle', 0.05, 0.05);
    },
    brk(k) {
      if (!ctx) return;
      const [t, f, q, d] = m(k),
        T = now();
      noise(t, f, q, 0.45, d * 2.6, T);
      noise('lowpass', f * 0.5, 1, 0.3, d * 3, T + 0.02, sfx, 0.7);
      if (k === 'verre') for (let i = 0; i < 5; i++) tone(2000 + Math.random() * 2500, 'sine', 0.06, 0.18, T + i * 0.025);
      if (k === 'pierre') tone(95, 'sine', 0.18, 0.15, T, sfx, 0.6);
    },
    place(k) {
      if (!ctx) return;
      const [t, f, q, d] = m(k),
        T = now();
      noise(t, f * 0.8, q, 0.35, d * 1.4, T);
      tone(k === 'verre' ? 1400 : k === 'bois' ? 180 : 220, 'sine', 0.16, 0.1, T, sfx, 0.7);
    },
    // pure ether shard, crystal: pentatonic arpeggio
    chime() {
      if (!ctx) return;
      const T = now();
      [0, 4, 7, 11, 14].forEach((s, i) => tone(880 * Math.pow(2, s / 12), 'sine', 0.09, 0.9, T + i * 0.06, sfx, 1, 0.01));
    },
    // the game's signature motif, played plainly and loud enough to notice: the first-ever
    // greeting (src/game/09-animals.js) and a network milestone (06-actions.js) -- the same five
    // notes the ambiance also wanders into on its own now and then (see signature() below), so a
    // player who's heard it drift by in the background recognizes it here on purpose.
    theme() {
      if (!ctx) return;
      signature(now(), sfx, 0, 0.18);
    },
    click() {
      if (!ctx) return;
      const T = now();
      tone(1800, 'square', 0.05, 0.02, T);
      noise('bandpass', 3000, 4, 0.25, 0.03, T);
      tone(420, 'triangle', 0.08, 0.06, T + 0.03);
    },
    plate() {
      if (!ctx) return;
      const T = now();
      noise('lowpass', 400, 1, 0.4, 0.08, T);
      tone(160, 'sine', 0.15, 0.1, T, sfx, 0.8);
    },
    hurt() {
      if (!ctx) return;
      const T = now();
      noise('bandpass', 700, 1.2, 0.4, 0.18, T);
      tone(220, 'sawtooth', 0.12, 0.22, T, sfx, 0.5);
    },
    // the Plasma Pistol: a quick descending zap, a touch of filtered noise for bite
    shoot() {
      if (!ctx) return;
      const T = now();
      tone(1900, 'sawtooth', 0.14, 0.1, T, sfx, 0.28, 0.002);
      noise('highpass', 3000, 2, 0.12, 0.05, T);
    },
    door() {
      if (!ctx) return;
      const T = now();
      noise('bandpass', 380, 2.5, 0.35, 0.22, T, sfx, 0.8);
      tone(110, 'sawtooth', 0.03, 0.25, T, sfx, 1.3, 0.03);
      noise('lowpass', 250, 1, 0.4, 0.08, T + 0.22);
    },
    // animal calls (v: volume based on distance)
    animal(type, v = 1) {
      if (!ctx) return;
      const T = now(),
        o = ctx.createGain();
      o.gain.value = Math.max(0.05, v);
      o.connect(sfx);
      if (type === 'sheep') {
        for (let i = 0; i < 2; i++) {
          const s = ctx.createOscillator(),
            f = ctx.createBiquadFilter(),
            g = ctx.createGain(),
            l = ctx.createOscillator(),
            lg = ctx.createGain();
          s.type = 'sawtooth';
          s.frequency.value = (240 + Math.random() * 40) * (i ? 0.94 : 1);
          l.frequency.value = 7;
          lg.gain.value = 14;
          l.connect(lg);
          lg.connect(s.frequency);
          f.type = 'bandpass';
          f.frequency.value = 1000;
          f.Q.value = 2;
          env(g, T + i * 0.28, 0.03, 0.18, 0.32);
          s.connect(f);
          f.connect(g);
          g.connect(o);
          s.start(T + i * 0.28);
          l.start(T + i * 0.28);
          s.stop(T + i * 0.28 + 0.4);
          l.stop(T + i * 0.28 + 0.4);
        }
      } else if (type === 'rabbit') {
        tone(1900, 'sine', 0.08, 0.07, T, o, 1.3);
        tone(2300, 'sine', 0.05, 0.05, T + 0.09, o, 1.2);
      } else if (type === 'fox') {
        tone(720, 'square', 0.05, 0.1, T, o, 1.5);
        tone(760, 'square', 0.05, 0.1, T + 0.16, o, 1.45);
      } else if (type === 'fish') {
        for (let i = 0; i < 3; i++) tone(420 + i * 140, 'sine', 0.06, 0.06, T + i * 0.07, o, 2);
      } else if (type === 'cat') {
        tone(620, 'triangle', 0.05, 0.35, T, o, 1.35);
        tone(880, 'sine', 0.04, 0.25, T + 0.05, o, 0.75);
      } else if (type === 'shiba') {
        tone(330, 'square', 0.02, 0.09, T, o, 0.7);
        tone(360, 'square', 0.02, 0.09, T + 0.18, o, 0.7);
      } else if (type === 'robot') {
        [0, 4, 7, 12].forEach((s, i) => tone(520 * Math.pow(2, s / 12), 'square', 0.01, 0.06, T + i * 0.08, o, 1));
      } else if (type === 'villager') {
        [0, 3, -2, 5].forEach((d, i) => tone(300 * Math.pow(2, d / 12), 'triangle', 0.01, 0.07, T + i * 0.07, o, 0.6));
      } else if (type === 'jellyfish') {
        [0, 7, 12].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 'sine', 0.05, 1.2, T + i * 0.12, o, 1, 0.05));
      } else if (type === 'shadow') {
        tone(180, 'sine', 0.06, 0.5, T, o, 0.55, 0.08);
        noise('bandpass', 260, 2, 0.12, 0.4, T + 0.05, o);
      } else if (type === 'guardian') {
        [0, -3, -7].forEach((d, i) => tone(140 * Math.pow(2, d / 12), 'square', 0.05, 0.18, T + i * 0.09, o, 0.8));
        noise('lowpass', 500, 1, 0.2, 0.3, T, o);
      } else if (type === 'sentinel') {
        [0, 5, 9].forEach((s, i) => tone(900 * Math.pow(2, s / 12), 'sine', 0.04, 0.3, T + i * 0.05, o, 1.1, 0.02));
        noise('highpass', 1800, 1.5, 0.08, 0.2, T, o);
      } else if (type === 'wraith') {
        [0, -5, -9, -12].forEach((d, i) => tone(100 * Math.pow(2, d / 12), 'sawtooth', 0.05, 0.3, T + i * 0.1, o, 0.7));
        noise('lowpass', 300, 1, 0.25, 0.5, T, o);
      }
    },
    // called every frame: ambiance fade + small events (birds, crickets, drops)
    tick(dt, night, under, water) {
      if (!ctx || !on) return;
      const T = now();
      amb.gain.setTargetAtTime(0.9, T, 1.5);
      padLP.frequency.setTargetAtTime(water ? 380 : under ? 600 : 900 + (1 - night) * 900, T, 0.8);
      birdT -= dt;
      if (birdT <= 0) {
        birdT = 1.5 + Math.random() * 5;
        if (under) drip(T);
        else if (night < 0.4 && Math.random() < 0.8) bird(T);
        else if (night > 0.6) cricket(T);
      }
      // a distant temple bell, rare enough to stay an event rather than a loop -- about once every
      // one to three minutes, never underwater (it reads as an outdoor/open-air sound)
      bellT -= dt;
      if (bellT <= 0) {
        bellT = 70 + Math.random() * 110;
        if (!under) templeBell(T);
      }
    },
  };
  // ambiance: sparse koto-like plucks wandering a hirajoshi scale, through a generous echo, with
  // long quiet rests between phrases — closer to a zen-garden soundtrack (Hirajoshi: the half-steps
  // in it, B-C and E-F here, are what read as distinctly Japanese, versus a plain minor/pentatonic
  // scale) than a continuously sustained pad (replaces the old 4-voice drone, then a first plain
  // A-minor wander).
  let padLP = null,
    birdT = 3,
    bellT = 60 + Math.random() * 60;
  const ROOT = 220, // A3
    SCALE = [0, 2, 3, 7, 8], // A hirajoshi: A, B, C, E, F
    MOTIF = [0, 3, 7, 8]; // the signature's quick rising flourish: A, C, E, F -- lands on the tense
  // half-step above the fifth, then (see signature() below) a breath of silence before resolving
  // home. Fixed on purpose, unlike the random wander, so it's the one phrase a player can learn.
  function pluck(T, deg, oct, peak, dest = padLP) {
    const f = ROOT * Math.pow(2, oct) * Math.pow(2, deg / 12);
    tone(f, 'triangle', peak, 1.8 + Math.random() * 0.8, T, dest, 0, 0.006, 1.045); // a quick koto-like bend into pitch
    tone(f * 1.5, 'sine', peak * 0.18, 1.1, T, dest, 0, 0.008); // a fifth above, bell-like rather than a plain octave
  }
  // the flourish, then "ma" -- a deliberate breath of silence -- before the note that resolves it
  // home, held a touch longer and louder: the landing, not just the last note of a scale run
  function signature(T, dest, oct = 0, peak = 0.22) {
    const step = 0.2;
    MOTIF.forEach((deg, i) => pluck(T + i * step, deg, oct, peak - i * 0.01, dest));
    pluck(T + MOTIF.length * step + 0.85, 0, oct, peak * 1.15, dest);
  }
  function startPad() {
    padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass';
    padLP.frequency.value = 1200;
    padLP.Q.value = 0.3;
    const pg = ctx.createGain();
    pg.gain.value = 0.22;
    padLP.connect(pg);
    pg.connect(amb);
    // a generous echo for space — does a lot of the "feels like a soundtrack" work on its own
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = 0.55;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    pg.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    dl.connect(wet);
    wet.connect(amb);
    function phrase() {
      const T = now();
      // roughly one phrase in three is the signature motif instead of a random wander -- heard
      // often enough across a session to become familiar, never so often it stops being special
      if (Math.random() < 0.35) {
        signature(T, padLP, Math.random() < 0.3 ? 1 : 0);
        setTimeout(phrase, 1700 + 14000 + Math.random() * 18000); // ~ the motif's own flourish + "ma" + landing
        return;
      }
      const len = 4 + Math.floor(Math.random() * 4), // 4 to 7 notes
        oct = Math.random() < 0.3 ? 1 : 0;
      let t = T,
        i = SCALE.indexOf(SCALE[Math.floor(Math.random() * SCALE.length)]);
      for (let n = 0; n < len; n++) {
        pluck(t, SCALE[i], oct, 0.22 - n * 0.01);
        t += 0.9 + Math.random() * 1.1;
        i =
          (i + (Math.random() < 0.15 ? Math.floor(Math.random() * SCALE.length) : Math.random() < 0.5 ? 1 : -1) + SCALE.length) %
          SCALE.length;
      }
      setTimeout(phrase, (t - T) * 1000 + 14000 + Math.random() * 18000); // a long rest before the next phrase
    }
    setTimeout(phrase, 3000 + Math.random() * 6000); // not the instant you spawn
  }
  // a distant struck bell/singing bowl: a low fundamental, a fifth, and a touch of inharmonic
  // shimmer above it -- the kind of rare, open-air event a zen-garden soundtrack leans on for scale
  function templeBell(T) {
    const f = ROOT / 2; // A2, low and resonant
    tone(f, 'sine', 0.14, 3.4, T, amb, 0, 0.015);
    tone(f * 1.5, 'sine', 0.05, 2.8, T, amb, 0, 0.015);
    tone(f * 2.37, 'sine', 0.025, 1.9, T + 0.015, amb, 0, 0.015); // slightly off-harmonic: bowl, not organ
  }
  function bird(T) {
    const n = 2 + Math.floor(Math.random() * 4),
      base = 2200 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      tone(base * (1 + Math.random() * 0.25), 'sine', 0.03, 0.07, T + i * 0.11, amb, 1.4 + Math.random() * 0.4, 0.01);
    }
  }
  function cricket(T) {
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) tone(f, 'square', 0.006, 0.012, T + i * 0.18 + j * 0.024, amb);
  }
  function drip(T) {
    tone(900 + Math.random() * 900, 'sine', 0.05, 0.18, T, amb, 0.55, 0.002);
  }
  window.Sound = Sound;
})();
