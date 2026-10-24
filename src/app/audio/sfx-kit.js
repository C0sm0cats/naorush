// Building blocks for sound effects (transients, bodies, bells, chip notes).

/** @typedef {import('./types.js').Voice} Voice */

/** Uniform random number in [lo, hi), for per-play variation. */
export const rnd = (/** @type {number} */ lo, /** @type {number} */ hi) =>
  lo + Math.random() * (hi - lo);
/** @template T @param {T[]} list @returns {T} */
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** Very short filtered-noise transient (the "attack" of an effect). */
export const click = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ vol,
  q = 1.5,
  d = 0.012,
) => v.noise({ t, d, type: 'bandpass', f, q, v: vol, a: 0.001 });
/** Pitched body: a sine that drops quickly, like a drum or a heavy object. */
export const thump = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ to,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => v.tone({ f, to, t, d, v: vol });
/** Struck metal: inharmonic sine partials, higher ones dying first. */
export const ring = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
  ratios = [1, 2.76, 5.4],
) => {
  ratios.forEach((r, i) => v.tone({ f: f * r, t, d: d / (1 + i * 0.8), v: vol / (1 + i * 1.6) }));
};
/** Soft bell: fundamental, octave and twelfth with staggered decays. */
export const chime = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.tone({ f, t, d, v: vol });
  v.tone({ f: f * 2, t, d: d * 0.5, v: vol * 0.3 });
  v.tone({ f: f * 3, t, d: d * 0.3, v: vol * 0.1 });
};
/** Chiptune note with a closing lowpass (no fizz) and a triangle sub for body. */
export const note = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.tone({ f, t, d, type: 'square', v: vol, lp: Math.min(4500, f * 5), lpTo: f * 2, a: 0.004 });
  v.tone({ f: f / 2, t, d: d * 0.8, type: 'triangle', v: vol * 0.7 });
};
/** Brass-like stab: detuned saws through a closing lowpass. */
export const brass = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => v.tone({ f, t, d, type: 'sawtooth', v: vol, lp: 3200, lpTo: 900, a: 0.015, det: 9 });
/** Cymbal-ish sizzle tail. */
export const sizzle = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.noise({ t, d, type: 'highpass', f: 6500, v: vol, a: 0.002 });
  v.noise({ t, d: d * 0.6, type: 'bandpass', f: 9000, q: 1.5, v: vol * 0.6, a: 0.002 });
};

/**
 * The game's signature: the title-theme hook (sol mi sol do) played as chip notes from
 * `root` (Hz of the top "do"), spaced by `gap` seconds; returns when the last note starts.
 */
export const signature = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ root,
  /** @type {number} */ gap,
  /** @type {number} */ vol,
  last = 0.3,
) => {
  [0.75, 0.63, 0.75, 1].forEach((r, i) =>
    note(v, t + i * gap, root * r, i === 3 ? last : gap * 0.9, vol),
  );
  return t + 3 * gap;
};
