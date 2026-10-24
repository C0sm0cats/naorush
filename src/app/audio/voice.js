// Tone and noise voices: every synthesised note goes through one of these, plus the
// instrument recipes (patches) the music plays with them.

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').ToneOpts} ToneOpts */
/** @typedef {import('./types.js').NoteOpts} NoteOpts */

/** Fourier series of a pulse wave of the given duty cycle (cosine terms). */
const pulse = (/** @type {number} */ duty) =>
  Array.from({ length: 40 }, (_, n) =>
    n ? (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty) : 0,
  );

/** Harmonic amplitudes of the custom oscillator waves, by name. */
const WAVES = {
  // The NES lead (25 % pulse) and its thinner sibling (12.5 %).
  pulse25: pulse(0.25),
  pulse12: pulse(0.125),
  // Flute: a strong fundamental with a breath of second and third harmonics.
  flute: [0, 1, 0.24, 0.08, 0.03],
  // Reed / bagpipe chanter: bright and nasal, a hump around the fourth to sixth harmonics.
  reed: [0, 1, 0.5, 0.45, 0.55, 0.55, 0.45, 0.32, 0.22, 0.16, 0.11, 0.07, 0.05, 0.03],
  // Drawbar organ: 8', 4', 2 2/3', 2' and a touch of 1 3/5'.
  organ: [0, 1, 0.75, 0.5, 0.55, 0.12, 0.35, 0, 0.25],
};
/** @typedef {keyof typeof WAVES} WaveName */

/** @type {WeakMap<BaseAudioContext, Map<string, PeriodicWave>>} */
const waveCache = new WeakMap();
/** @param {BaseAudioContext} ctx @param {WaveName} name */
function periodic(ctx, name) {
  let map = waveCache.get(ctx);
  if (!map) waveCache.set(ctx, (map = new Map()));
  let wave = map.get(name);
  if (!wave) {
    const real = Float32Array.from(WAVES[name]);
    wave = ctx.createPeriodicWave(real, new Float32Array(real.length));
    map.set(name, wave);
  }
  return wave;
}

// Shared nodes per voice are capped: past this, notes fall back to their own nodes.
const MAX_SHARED = 64;

/**
 * Gain envelope: a percussive decay over `d`, or with `sus` an attack, a decay to the
 * sustain level, a hold and a release that ends at `t + d`.
 * @param {AudioParam} p @param {number} t @param {number} d @param {number} v
 * @param {number} a @param {number} [sus] @param {number} [rel] @param {number} [dec]
 */
function envelope(p, t, d, v, a, sus, rel = 0.08, dec = 0.12) {
  const atk = Math.min(a, d / 2);
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(v, t + atk);
  const r = Math.min(rel, d / 2);
  if (sus === undefined || d < atk + r + 0.02) {
    p.exponentialRampToValueAtTime(0.0001, t + d);
    return;
  }
  const hold = Math.max(v * sus, 0.0002);
  const end = t + d;
  const decEnd = Math.min(t + atk + dec, end - r);
  p.exponentialRampToValueAtTime(hold, decEnd);
  if (end - r > decEnd) p.setValueAtTime(hold, end - r);
  p.exponentialRampToValueAtTime(0.0001, end);
}

/**
 * Voice whose sources play into `dest`.
 * @param {BaseAudioContext} ctx @param {AudioBuffer} buf noise source
 * @param {AudioNode} dest @param {number} [pitch] frequency multiplier
 * @param {AudioNode[]} [keep] when given (music), notes share their panners and fixed
 *   filters (one node per setting, listed here so the owner can disconnect them)
 * @param {AudioScheduledSourceNode[]} [lfos] when given (music), vibrato comes from one
 *   running LFO per rate, listed here so the owner can stop them
 * @returns {Voice}
 */
export function makeVoice(ctx, buf, dest, pitch = 1, keep, lfos) {
  /** @type {Map<string, AudioNode>} */
  const shared = new Map();
  /** @type {Map<number, OscillatorNode>} */
  const vibratos = new Map();
  /** @param {string} key @param {() => AudioNode} make */
  const share = (key, make) => {
    let node = shared.get(key);
    if (!node && keep && shared.size < MAX_SHARED) {
      node = make();
      shared.set(key, node);
      keep.push(node);
    }
    return node;
  };
  /** Panned destination (shared per pan value when the voice keeps nodes). */
  const outlet = (/** @type {number | undefined} */ pan) => {
    if (!pan || !ctx.createStereoPanner) return dest;
    const make = () => {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(dest);
      return p;
    };
    return share(`p${pan}`, make) ?? make();
  };
  /** A fixed filter into the panned outlet, shared when possible. */
  const fixedFilter = (
    /** @type {BiquadFilterType} */ type,
    /** @type {number} */ f,
    /** @type {number} */ q,
    /** @type {number | undefined} */ pan,
  ) =>
    share(`f${type}${f}:${q}:${pan ?? 0}`, () => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      filter.connect(outlet(pan));
      return filter;
    });

  return {
    now: ctx.currentTime,
    tone: (o) => {
      const { f, t, d, type = 'sine', v = 0.3, to, a = 0.005, lp, lpTo, ft, q, det, pan } = o;
      const g = ctx.createGain();
      envelope(g.gain, t, d, v, a, o.sus, o.rel, o.dec);
      const oscs = [ctx.createOscillator()];
      if (det) oscs.push(ctx.createOscillator());
      oscs.forEach((osc, i) => {
        if (o.wave) osc.setPeriodicWave(periodic(ctx, o.wave));
        else osc.type = type;
        if (o.from) {
          osc.frequency.setValueAtTime(o.from * pitch, t);
          osc.frequency.exponentialRampToValueAtTime(f * pitch, t + (o.glide ?? 0.06));
        } else osc.frequency.setValueAtTime(f * pitch, t);
        if (to) osc.frequency.exponentialRampToValueAtTime(to * pitch, t + d);
        if (i === 1 && det) osc.detune.value = det;
        osc.connect(g);
        osc.start(t);
        osc.stop(t + d + 0.05);
      });
      if (o.vib) {
        // Vibrato, optionally fading in after a delay (sung and bowed notes).
        const [rate, cents, delay = 0] = o.vib;
        const depth = ctx.createGain();
        if (delay > 0 && delay < d) {
          depth.gain.setValueAtTime(0, t);
          depth.gain.setValueAtTime(0, t + delay);
          depth.gain.linearRampToValueAtTime(cents, Math.min(t + d, t + delay + 0.25));
        } else depth.gain.value = cents;
        const known = vibratos.get(rate);
        const lfo = known ?? ctx.createOscillator();
        lfo.frequency.value = rate;
        lfo.connect(depth);
        for (const osc of oscs) depth.connect(osc.detune);
        if (lfos && keep) {
          // Music: one running LFO per rate; let go of this note's depth when it ends.
          if (!known) {
            lfo.start(ctx.currentTime);
            vibratos.set(rate, lfo);
            keep.push(lfo);
            lfos.push(lfo);
          }
          oscs[0].onended = () => {
            try {
              lfo.disconnect(depth);
            } catch {
              /* already let go when the track stopped */
            }
          };
        } else {
          lfo.start(t);
          lfo.stop(t + d + 0.05);
        }
      }
      if (o.fm) {
        // Simple FM: a sine modulator at `ratio` × f whose index falls to `end` over the note.
        const [ratio, index, end = index] = o.fm;
        const mod = ctx.createOscillator();
        const depth = ctx.createGain();
        const fmod = f * pitch * ratio;
        mod.frequency.value = fmod;
        depth.gain.setValueAtTime(index * fmod, t);
        if (end !== index)
          depth.gain.exponentialRampToValueAtTime(Math.max(end, 0.001) * fmod, t + d);
        mod.connect(depth);
        for (const osc of oscs) depth.connect(osc.frequency);
        mod.start(t);
        mod.stop(t + d + 0.05);
      }
      if (lp) {
        const kind = ft ?? 'lowpass';
        const fixed = !lpTo && fixedFilter(kind, lp, q ?? 1, pan);
        if (fixed) g.connect(fixed);
        else {
          const filter = ctx.createBiquadFilter();
          filter.type = kind;
          filter.frequency.setValueAtTime(lp, t);
          if (lpTo) filter.frequency.exponentialRampToValueAtTime(lpTo, t + (o.lpT ?? d));
          if (q) filter.Q.value = q;
          g.connect(filter).connect(outlet(pan));
        }
      } else g.connect(outlet(pan));
      return oscs[0];
    },
    noise: ({ t, d, type = 'lowpass', f = 2000, to, q = 1, v = 0.3, a = 0.005, pan }) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + Math.min(a, d / 2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const fixed = !to && fixedFilter(type, f * pitch, q, pan);
      if (fixed) src.connect(g).connect(fixed);
      else {
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(f * pitch, t);
        if (to) filter.frequency.exponentialRampToValueAtTime(to * pitch, t + d);
        src.connect(filter).connect(g).connect(outlet(pan));
      }
      src.start(t, Math.random() * 0.5);
      src.stop(t + d + 0.05);
      return src;
    },
  };
}

/** Long enough for vibrato to bloom. */
const long = (/** @type {NoteOpts} */ n) => n.d > 0.34;

/**
 * Instrument recipes: each plays one note `n` (frequency, start, length, level) on a voice.
 * Levels are matched so patches can be swapped without remixing.
 * @type {Record<string, (v: Voice, n: NoteOpts) => void>}
 */
export const PATCHES = {
  // NES-style 25 % pulse: bright, nasal, with a little delayed vibrato on held notes.
  chip: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      wave: 'pulse25',
      v: n.g * 0.7,
      a: 0.004,
      sus: 0.7,
      rel: 0.05,
      lp: 6000,
      vib: long(n) ? [5.6, 11, 0.18] : undefined,
      from: n.from,
      glide: 0.04,
      pan: n.pan,
    });
  },
  // Thin 12.5 % pulse: arpeggios and counter lines.
  thin: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      wave: 'pulse12',
      v: n.g * 0.85,
      a: 0.003,
      sus: 0.5,
      rel: 0.04,
      pan: n.pan,
    });
  },
  // Soft triangle: the gentle line under a melody.
  soft: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      type: 'triangle',
      v: n.g * 0.7,
      a: 0.025,
      sus: 0.8,
      rel: 0.1,
      pan: n.pan,
    });
  },
  // Wooden flute: breathy chiff, then a warm tone that blooms into vibrato.
  flute: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      wave: 'flute',
      v: n.g * 0.8,
      a: 0.045,
      sus: 0.85,
      rel: 0.1,
      vib: long(n) ? [5.2, 14, 0.2] : undefined,
      from: n.from,
      pan: n.pan,
    });
    v.noise({
      t: n.t,
      d: 0.08,
      type: 'bandpass',
      f: 2600,
      q: 1.5,
      v: n.g * 0.18,
      a: 0.01,
      pan: n.pan,
    });
  },
  // Whistling: a pure tone that scoops into each note and wavers on the long ones.
  whistle: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      v: n.g * 0.57,
      a: 0.03,
      sus: 0.85,
      rel: 0.07,
      from: n.from ?? n.f * 0.955,
      glide: n.from ? 0.07 : 0.045,
      vib: [6.2, long(n) ? 22 : 9, long(n) ? 0.12 : 0],
      pan: n.pan,
    });
  },
  // Plucked string: a bright transient over a mellow body that rings out.
  pluck: (v, n) => {
    const d = Math.max(n.d, 0.35);
    v.tone({ f: n.f, t: n.t, d, type: 'triangle', v: n.g * 1.25, a: 0.003, pan: n.pan });
    v.tone({
      f: n.f,
      t: n.t,
      d: 0.07,
      type: 'sawtooth',
      v: n.g * 0.55,
      a: 0.002,
      lp: 3600,
      pan: n.pan,
    });
  },
  // Marimba: sine body, a quick octave partial and a woody inharmonic click.
  mallet: (v, n) => {
    const d = Math.min(n.d + 0.15, 0.6);
    v.tone({ f: n.f, t: n.t, d, v: n.g * 1.25, a: 0.002, pan: n.pan });
    v.tone({ f: n.f * 2, t: n.t, d: d * 0.35, v: n.g * 0.3, a: 0.002, pan: n.pan });
    v.tone({ f: n.f * 3.9, t: n.t, d: 0.05, v: n.g * 0.18, a: 0.001, pan: n.pan });
  },
  // FM electric piano: the tine's bark fades into a round sine.
  epiano: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d + 0.35,
      v: n.g * 1.08,
      a: 0.003,
      fm: [1, 1.5, 0.12],
      pan: n.pan,
    });
  },
  // Glockenspiel: inharmonic FM shimmer that dies fast over a pure ring.
  bell: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: Math.max(0.7, n.d),
      v: n.g * 0.8,
      a: 0.002,
      fm: [3.5, 1.8, 0.05],
      pan: n.pan,
    });
  },
  // Brass: a round body that brightens as the saw section swells in, vibrato when held.
  brass: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      type: 'sawtooth',
      det: 7,
      v: n.g * 0.56,
      a: 0.05,
      sus: 0.85,
      rel: 0.12,
      lp: 650,
      lpTo: 2400,
      lpT: Math.min(0.09, n.d / 2),
      vib: long(n) ? [5, 9, 0.25] : undefined,
      from: n.from,
      pan: n.pan,
    });
  },
  // Bagpipe chanter: a high grace note cuts into a steady, nasal reed (no vibrato).
  pipe: (v, n) => {
    const cut = Math.min(0.035, n.d / 4);
    v.tone({
      f: n.f * 2,
      t: n.t,
      d: cut + 0.01,
      wave: 'reed',
      v: n.g * 0.75,
      a: 0.002,
      lp: 4200,
      pan: n.pan,
    });
    v.tone({
      f: n.f,
      t: n.t + cut,
      d: n.d - cut,
      wave: 'reed',
      v: n.g,
      a: 0.006,
      sus: 0.95,
      rel: 0.04,
      lp: 4200,
      pan: n.pan,
    });
  },
  // Synth lead: two detuned saws, gliding between legato notes.
  saw: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      type: 'sawtooth',
      det: 12,
      v: n.g * 0.5,
      a: 0.008,
      sus: 0.7,
      rel: 0.08,
      lp: n.lp ?? 2600,
      vib: long(n) ? [5.5, 12, 0.2] : undefined,
      from: n.from,
      glide: 0.05,
      pan: n.pan,
    });
  },
  // String section: detuned saws with a bowed attack.
  strings: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      type: 'sawtooth',
      det: 10,
      v: n.g * 0.54,
      a: Math.min(0.14, n.d / 3),
      sus: 0.9,
      rel: 0.22,
      lp: 2400,
      vib: long(n) ? [5, 10, 0.3] : undefined,
      from: n.from,
      pan: n.pan,
    });
  },
  // Drawbar organ.
  organ: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      wave: 'organ',
      v: n.g * 0.75,
      a: 0.008,
      sus: 1,
      rel: 0.05,
      pan: n.pan,
    });
  },
  // Square chip (the original lead), for tracks that keep their 8-bit edge.
  square: (v, n) => {
    v.tone({
      f: n.f,
      t: n.t,
      d: n.d,
      type: 'square',
      v: n.g * 0.43,
      a: 0.006,
      sus: 0.7,
      rel: 0.05,
      lp: 3200,
      from: n.from,
      pan: n.pan,
    });
  },
};
/** @typedef {keyof typeof PATCHES} PatchName */
