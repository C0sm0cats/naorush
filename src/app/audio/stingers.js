// Musical stingers: short phrases played by the music itself, on its grid and in its key,
// when something worth a fanfare happens (a key, a door, a checkpoint, a boss's entrance
// or key lift). They ride the current track (its reverb, its fade) but skip the ducking.

import { mtof } from './util.js';
import { PATCHES } from './voice.js';

/** @typedef {import('./types.js').Voice} Voice */
/**
 * The harmony a stinger lands on (scheduler.js harmonyAt).
 * @typedef {{ now: number, t: number, s16: number, root: number, base: number, tones: number[], scale: number[] }} Harmony
 */

/** A chord tone `k` steps up the current chord (0 root, 1 third, 2 fifth, 3 octave…). */
const tone = (/** @type {Harmony} */ h, /** @type {number} */ k) => {
  const triad = h.tones.slice(0, 3);
  return h.base + triad[k % 3] + 12 * Math.floor(k / 3);
};

/** Timpani on a pitch, a soft mallet noise over it. */
const timpani = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ midi,
  g = 0.4,
) => {
  const f = mtof(midi);
  v.tone({ f, to: f * 0.97, t, d: 0.7, v: g, a: 0.004 });
  v.noise({ t, d: 0.07, type: 'bandpass', f: 380, q: 1, v: g * 0.35 });
};

/** Crash cymbal. */
const crash = (/** @type {Voice} */ v, /** @type {number} */ t, g = 0.07) => {
  v.noise({ t, d: 1.3, type: 'highpass', f: 6000, v: g, a: 0.002 });
  v.noise({ t, d: 0.4, type: 'bandpass', f: 3500, q: 0.8, v: g * 0.7 });
};

/**
 * Stinger recipes, by name (the effect that triggers them, or a music moment).
 * @type {Record<string, (v: Voice, h: Harmony) => void>}
 */
export const STINGS = {
  // Key: the chord climbs in bells, sixteenths, and the brass holds the top.
  key: (v, h) => {
    for (let k = 0; k < 4; k++) {
      PATCHES.bell(v, { f: mtof(tone(h, 3 + k) + 12), t: h.t + k * h.s16, d: h.s16 * 2, g: 0.075 });
    }
    PATCHES.brass(v, { f: mtof(tone(h, 3)), t: h.t + 4 * h.s16, d: h.s16 * 6, g: 0.1 });
    PATCHES.brass(v, { f: mtof(tone(h, 4)), t: h.t + 4 * h.s16, d: h.s16 * 6, g: 0.07 });
  },
  // Door: a two-note brass call, fifth then octave, a bell on top.
  door: (v, h) => {
    PATCHES.brass(v, { f: mtof(tone(h, 2)), t: h.t, d: h.s16 * 1.8, g: 0.1 });
    PATCHES.brass(v, { f: mtof(tone(h, 3)), t: h.t + 2 * h.s16, d: h.s16 * 5, g: 0.11 });
    PATCHES.bell(v, { f: mtof(tone(h, 6)), t: h.t + 2 * h.s16, d: h.s16 * 6, g: 0.05 });
  },
  // Checkpoint: the motif's last leap (sol–do) on a soft chip, with a bell shadow.
  checkpoint: (v, h) => {
    PATCHES.chip(v, { f: mtof(tone(h, 5)), t: h.t, d: h.s16 * 1.6, g: 0.09, pan: -0.2 });
    PATCHES.chip(v, { f: mtof(tone(h, 6)), t: h.t + 2 * h.s16, d: h.s16 * 4, g: 0.09, pan: 0.2 });
    PATCHES.bell(v, { f: mtof(tone(h, 7)), t: h.t + 2 * h.s16, d: h.s16 * 6, g: 0.04 });
  },
  // A boss walks in: timpani and low brass on the tonic, a crash, the fifth answering.
  entrance: (v, h) => {
    const r = h.root;
    timpani(v, h.t, r - 12, 0.5);
    timpani(v, h.t + 2 * h.s16, r - 5, 0.35);
    timpani(v, h.t + 4 * h.s16, r - 12, 0.5);
    for (const k of [0, 7, 12]) {
      PATCHES.brass(v, { f: mtof(r + k), t: h.t, d: h.s16 * 7, g: 0.11 });
    }
    PATCHES.strings(v, { f: mtof(r + 24), t: h.t, d: h.s16 * 8, g: 0.06 });
    crash(v, h.t);
  },
  // Key lift (boss phase): a snare roll swells into the new key's downbeat.
  lift: (v, h) => {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const at = h.t - (n - k) * (h.s16 / 2);
      if (at < h.now) continue;
      v.noise({ t: at, d: 0.05, type: 'highpass', f: 2200, v: 0.05 + (k / n) * 0.14 });
    }
    timpani(v, h.t, h.root - 12, 0.45);
    for (const k of [0, 4, 7])
      PATCHES.brass(v, { f: mtof(h.root + 12 + k), t: h.t, d: h.s16 * 6, g: 0.08 });
    crash(v, h.t, 0.06);
  },
};
