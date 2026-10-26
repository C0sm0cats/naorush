// Building blocks for sound effects (transients, bodies, bells, chip notes).

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Foley} Foley */
/** @typedef {import('./types.js').Floor} Floor */

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

/**
 * How each hero lands on the floor: `w` scales the body (weight), `k` the pitch.
 * Kévin is the heavier, lower footfall; Charline the lighter, crisper one.
 */
export const GAIT = {
  kevin: { w: 1.25, k: 0.86 },
  charline: { w: 0.88, k: 1.1 },
};
/** Weight and pitch of the walking hero, the pitch nudged per foot (left / right). */
export const gait = (/** @type {Foley} */ f) => {
  const g = GAIT[f.hero] ?? GAIT.kevin;
  return { w: g.w, k: g.k * (f.foot ? 1.025 : 0.975) };
};

/** The same voice, every source `g` times louder. @returns {Voice} */
export const louder = (/** @type {Voice} */ v, /** @type {number} */ g) =>
  g === 1
    ? v
    : {
        now: v.now,
        tone: (o) => v.tone({ ...o, v: (o.v ?? 0.3) * g }),
        noise: (o) => v.noise({ ...o, v: (o.v ?? 0.3) * g }),
      };
/**
 * The same voice, `dt` seconds later, `k` times higher and `g` times louder: a copy of
 * an effect that must not land exactly on top of the first one.
 * @returns {Voice}
 */
export const shifted = (
  /** @type {Voice} */ v,
  /** @type {number} */ dt,
  /** @type {number} */ k,
  /** @type {number} */ g,
) => {
  const hz = (/** @type {number | undefined} */ f) => (f === undefined ? f : f * k);
  return {
    now: v.now + dt,
    tone: (o) => v.tone({ ...o, f: o.f * k, to: hz(o.to), from: hz(o.from), v: (o.v ?? 0.3) * g }),
    noise: (o) => v.noise({ ...o, f: hz(o.f), to: hz(o.to), v: (o.v ?? 0.3) * g }),
  };
};

/** Two plays of one effect closer than this (s) are one sound played several times. */
export const CROWD_WINDOW = 0.04;
/** @type {Map<string, { t: number, n: number }>} */
const lastPlay = new Map();
/**
 * How many plays of `type` already started at about time `t` (0 for the first): five
 * racks landing in the same frame must not add up to one sound five times as loud.
 * @param {string} type @param {number} t
 */
export function crowd(type, t) {
  const last = lastPlay.get(type);
  const n = last && Math.abs(t - last.t) < CROWD_WINDOW ? last.n + 1 : 0;
  lastPlay.set(type, { t: n ? (last?.t ?? t) : t, n });
  return n;
}
/** Forgets the recent plays (a new audio context starts its clock again). */
export const resetCrowd = () => lastPlay.clear();

/** @type {Record<Floor, number>} */
const FLOOR_GAIN = { carpet: 1, concrete: 1.06, metal: 1, gravel: 1.3, tile: 1.45, wood: 0.84 };

/**
 * Takes of a footfall: pitch, body length, and the extra touch that tells them apart
 * (toe roll, scuff, flat foot).
 */
const FOOT_TAKES = [
  { k: 1, d: 1, extra: '' },
  { k: 0.95, d: 0.9, extra: 'toe' },
  { k: 1.05, d: 1, extra: 'scuff' },
  { k: 0.98, d: 1.25, extra: 'flat' },
];

/**
 * One footfall on a floor material: heel body, then the surface's own texture.
 * `w` scales the weight (body level and length), `k` the pitch, `take` picks one of four
 * takes (so a run never repeats the same step).
 */
export const foot = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {Floor} */ floor,
  /** @type {number} */ w,
  /** @type {number} */ k,
  take = 0,
) => {
  const tk = FOOT_TAKES[take & 3];
  k *= tk.k;
  const d = 0.05 * Math.sqrt(w) * tk.d;
  // Level per material, so every floor sits at about the same loudness.
  v = louder(v, FLOOR_GAIN[floor] ?? 1);
  if (tk.extra === 'toe') click(v, t + 0.032, rnd(2600, 3200) * k, 0.03, 2.5, 0.01);
  else if (tk.extra === 'scuff')
    v.noise({
      t,
      d: 0.06,
      type: 'bandpass',
      f: 1500 * k,
      to: 650 * k,
      q: 1.2,
      v: 0.04 * w,
      a: 0.01,
    });
  else if (tk.extra === 'flat') thump(v, t + 0.012, 70 * k, 45 * k, d, 0.05 * w);
  switch (floor) {
    // Car park concrete: hard heel tap, grit, and a slap back off the low ceiling.
    case 'concrete': {
      const f = rnd(2300, 3000) * k;
      thump(v, t, rnd(100, 120) * k, 60 * k, d, 0.11 * w);
      click(v, t, f, 0.07, 2, 0.012);
      v.noise({ t, d: 0.03, type: 'highpass', f: 4500, v: 0.03 * w, a: 0.002 });
      click(v, t + 0.075, f * 0.85, 0.016, 2, 0.014);
      v.noise({ t: t + 0.075, d: 0.05, f: 900, v: 0.02 * w });
      break;
    }
    // Raised data-centre floor: a hollow metal panel that rings a little.
    case 'metal':
      thump(v, t, rnd(115, 130) * k, 70 * k, d, 0.11 * w);
      ring(v, t, rnd(380, 440) * k, 0.12, 0.024 * w, [1, 2.32, 4.1]);
      click(v, t, rnd(2800, 3400) * k, 0.045, 3, 0.01);
      break;
    // Rooftop gravel: a crunch made of tiny grains.
    case 'gravel':
      thump(v, t, rnd(78, 90) * k, 50 * k, d, 0.09 * w);
      v.noise({ t, d: 0.07, f: 1200, to: 500, v: 0.05 * w });
      for (let i = 0, at = t; i < 5; i++, at += rnd(0.006, 0.016)) {
        v.noise({
          t: at,
          d: 0.012,
          type: 'bandpass',
          f: rnd(2500, 5500),
          q: 2,
          v: 0.06 * (1 - i * 0.15) * Math.sqrt(w),
          a: 0.001,
        });
      }
      break;
    // Café tiles: crisp tap with a faint ceramic ping.
    case 'tile':
      thump(v, t, rnd(105, 120) * k, 65 * k, d * 0.8, 0.09 * w);
      click(v, t, rnd(1800, 2400) * k, 0.08, 3, 0.01);
      v.tone({ f: rnd(1900, 2300) * k, t, d: 0.03, v: 0.012 });
      break;
    // Seminar stage boards: hollow wooden knock.
    case 'wood':
      thump(v, t, rnd(150, 170) * k, 90 * k, d * 1.3, 0.11 * w);
      v.noise({ t, d: 0.06, type: 'bandpass', f: 600 * k, q: 4, v: 0.07 * w });
      click(v, t, rnd(2000, 2500) * k, 0.04, 2, 0.01);
      break;
    // Office carpet: soft heel thud and a muffled scuff.
    default:
      thump(v, t, rnd(85, 105) * k, 58 * k, d * 1.1, 0.12 * w);
      v.noise({ t, d: 0.04, f: rnd(330, 450), v: 0.1 * Math.sqrt(w) });
      v.noise({ t, d: 0.05, type: 'bandpass', f: 900, v: 0.025 });
      click(v, t, rnd(1800, 2600) * k, 0.018, 2, 0.01);
  }
};
