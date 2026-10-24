// Synthesised ambient beds under the music.

import { dbToGain } from './util.js';

export const AMB_FADE = 1;
/** @typedef {'office' | 'datacenter' | 'parking' | 'rooftop' | 'copil' | 'cafe' | 'seminar'} Bed */
/** @type {Bed[]} */
export const AMBIENCES = ['office', 'datacenter', 'parking', 'rooftop', 'copil', 'cafe', 'seminar'];
// Per-bed output trim (dB), tuned so each bed sits around -40 dBFS RMS at default volumes.
const AMB_TRIM_DB = {
  office: -12,
  datacenter: -26,
  parking: -19,
  rooftop: -22,
  copil: -16,
  cafe: -12,
  seminar: -17,
};

/**
 * Builds one ambient bed into `dest`. Random events use their own timeouts, all cleared by `stop`.
 * @param {AudioContext} ctx @param {AudioBuffer} buf @param {AudioNode} dest @param {string} name
 */
export function buildBed(ctx, buf, dest, name) {
  /** @type {AudioNode[]} */
  const nodes = [];
  /** @type {AudioScheduledSourceNode[]} */
  const sources = [];
  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];
  let alive = true;
  /** @param {AudioNode} n */
  const keep = (n) => {
    nodes.push(n);
    return n;
  };
  /** @param {number} v */
  const gain = (v) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return /** @type {GainNode} */ (keep(g));
  };
  /** @param {BiquadFilterType} type @param {number} f @param {number} [q] */
  const filt = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return /** @type {BiquadFilterNode} */ (keep(b));
  };
  /** @param {OscillatorType} type @param {number} f */
  const osc = (type, f) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    sources.push(o);
    return o;
  };
  /** Looping noise from a random offset, optionally through a chain, then a gain into `to`. */
  const noise = (/** @type {AudioNode[]} */ chain, /** @type {number} */ g, to = out) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * buf.duration);
    sources.push(src);
    let n = /** @type {AudioNode} */ (src);
    for (const c of chain) n = n.connect(c);
    n.connect(gain(g)).connect(to);
  };
  /** Slow sine LFO modulating `param` by +-depth. */
  const lfo = (
    /** @type {AudioParam} */ param,
    /** @type {number} */ hz,
    /** @type {number} */ depth,
  ) => {
    const l = osc('sine', hz);
    const d = gain(depth);
    l.connect(d).connect(param);
  };
  /** @param {number} minMs @param {number} maxMs @param {() => void} fn */
  const every = (minMs, maxMs, fn) => {
    const tick = () => {
      if (!alive) return;
      try {
        fn();
      } catch {
        /* a failed event must never stop the bed */
      }
      timers.push(setTimeout(tick, minMs + Math.random() * (maxMs - minMs)));
      if (timers.length > 8) timers.shift();
    };
    timers.push(setTimeout(tick, minMs * Math.random() + 300));
  };
  /** One-shot enveloped voice that disconnects itself when done. */
  const blip = (
    /** @type {OscillatorType} */ type,
    /** @type {number} */ f,
    /** @type {number} */ peak,
    /** @type {number} */ dur,
    /** @type {AudioNode} */ to = out,
    /** @type {number} */ delay = 0,
  ) => {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  };
  /** Short filtered noise tick (keyboard click). */
  const tick = (
    /** @type {number} */ f,
    /** @type {number} */ peak,
    /** @type {number} */ dur,
    delay = 0,
  ) => {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  };
  const out = gain(dbToGain(AMB_TRIM_DB[/** @type {keyof typeof AMB_TRIM_DB} */ (name)] ?? 0));
  out.connect(dest);

  if (name === 'office') {
    noise([filt('lowpass', 500, 0.5), filt('lowpass', 900, 0.4)], 0.5);
    noise([filt('bandpass', 3200, 0.8)], 0.012);
    every(250, 1400, () => {
      const burst = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < burst; i++) {
        setTimeout(
          () => {
            if (alive) tick(1800 + Math.random() * 2200, 0.05 + Math.random() * 0.05, 0.03);
          },
          i * (70 + Math.random() * 90),
        );
      }
    });
    every(14000, 30000, () => {
      // A short-lived filter, released once the ring is over (not kept with the bed).
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.Q.value = 0.5;
      lp.connect(out);
      for (let k = 0; k < 4; k++) {
        blip('sine', 1330, 0.012, 0.09, lp, k * 0.12);
        blip('sine', 1000, 0.012, 0.09, lp, k * 0.12 + 0.06);
      }
      setTimeout(() => lp.disconnect(), 900);
    });
  } else if (name === 'cafe') {
    // Break room: room tone, a light murmur, spoons on cups, the espresso machine now and then.
    noise([filt('lowpass', 500, 0.5), filt('lowpass', 900, 0.4)], 0.4);
    [
      [420, 0.27],
      [760, 0.37],
    ].forEach(([f, hz]) => {
      const am = gain(0.4);
      lfo(am.gain, hz, 0.35);
      lfo(am.gain, hz * 2.3, 0.12);
      noise([filt('bandpass', f, 3)], 0.8, am);
      am.connect(out);
    });
    every(2500, 7000, () => {
      const f = 2400 + Math.random() * 1200;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        blip('sine', f, 0.02, 0.18, out, k * 0.09);
        blip('sine', f * 2.71, 0.006, 0.08, out, k * 0.09);
      }
    });
    every(20000, 40000, () => {
      // Espresso: a pump buzz under a steamy hiss that swells and fades.
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.setValueAtTime(0.05, t + 2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + 3.1);
      blip('sawtooth', 100, 0.004, 2.6, out);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      };
    });
  } else if (name === 'seminar') {
    // Congress hall: low room rumble, a big crowd murmur, and polite applause now and then.
    noise([filt('lowpass', 180, 0.7)], 1.2);
    [
      [300, 0.21],
      [480, 0.33],
      [650, 0.17],
      [880, 0.29],
    ].forEach(([f, hz], i) => {
      const am = gain(0.5);
      lfo(am.gain, hz, 0.35);
      lfo(am.gain, hz * 3.1, 0.12);
      noise([filt('bandpass', f, 2 + i * 0.5)], 0.9, am);
      am.connect(out);
    });
    every(25000, 50000, () => {
      for (let k = 0; k < 45; k++) {
        const at = (k / 45) * 2.4 + Math.random() * 0.05;
        const swell = Math.sin((Math.PI * k) / 45);
        tick(1500 + Math.random() * 2000, 0.01 + swell * 0.03, 0.025, at);
      }
    });
  } else if (name === 'datacenter') {
    const hum = gain(0.6);
    hum.connect(out);
    [50, 100.4, 150.7].forEach((f, i) => {
      const o = osc('sine', f);
      const g = gain([0.5, 0.3, 0.12][i]);
      o.connect(g).connect(hum);
      lfo(g.gain, 0.11 + i * 0.07, [0.15, 0.1, 0.05][i]);
    });
    const beat = osc('sine', 50.7);
    beat.connect(gain(0.25)).connect(hum);
    noise([filt('bandpass', 1400, 0.5), filt('lowpass', 3500, 0.5)], 0.35);
  } else if (name === 'parking') {
    noise([filt('lowpass', 120, 0.7), filt('lowpass', 160, 0.5)], 2.2);
    noise([filt('bandpass', 400, 0.6)], 0.1);
    const delay = /** @type {DelayNode} */ (keep(ctx.createDelay(1)));
    delay.delayTime.value = 0.23;
    const fb = gain(0.5);
    const damp = filt('lowpass', 2200, 0.5);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(out);
    every(3500, 9000, () => {
      const f = 900 + Math.random() * 500;
      blip('sine', f, 0.12, 0.07, delay);
      blip('sine', f * 1.5, 0.05, 0.04, delay);
      blip('sine', f, 0.05, 0.07, out);
    });
  } else if (name === 'rooftop') {
    const bp = filt('bandpass', 500, 0.9);
    noise([bp], 1.4);
    lfo(bp.frequency, 0.13, 260);
    const bp2 = filt('bandpass', 900, 1.2);
    noise([bp2], 0.5);
    lfo(bp2.frequency, 0.07, 350);
    const am = gain(1);
    lfo(am.gain, 0.09, 0.25);
    noise([filt('lowpass', 350, 0.6), filt('lowpass', 500, 0.5)], 0.7, am);
    am.connect(out);
  } else if (name === 'copil') {
    noise([filt('lowpass', 450, 0.5), filt('lowpass', 800, 0.4)], 0.45);
    [
      [380, 0.31],
      [620, 0.23],
      [900, 0.41],
    ].forEach(([f, hz], i) => {
      const am = gain(0.5);
      lfo(am.gain, hz, 0.45);
      lfo(am.gain, hz * 2.7, 0.15);
      noise([filt('bandpass', f, 2.5 + i)], 1.2, am);
      am.connect(out);
    });
  }

  return {
    name,
    out,
    stop() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
    dispose() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const n of nodes) n.disconnect();
    },
  };
}
