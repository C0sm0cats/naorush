// Music theory and small math helpers shared by tracks, effects and the engine.

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];
export const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
export const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

/** @param {number} m */
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
/** @param {string} s e.g. '0 9m 5 7' */
export const chords = (s) =>
  /** @type {[number, boolean][]} */ (s.split(' ').map((x) => [parseInt(x), x.endsWith('m')]));
/** @param {string} s */
export const bars = (s) => s.split(' ');
/** @param {number} db */
export const dbToGain = (db) => 10 ** (db / 20);
/** @param {number} x */
export const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/** @param {string[]} a @param {Record<number, string>} edits bar index -> replacement */
export const vary = (a, edits) => a.map((x, k) => edits[k] ?? x);
