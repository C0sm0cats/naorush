// Notation of the song tables: scales, roman-numeral chords, bar strings and motifs.

/** @typedef {import('../types.js').Chord} Chord */

export { DORIAN, HARMONIC, MAJOR, MINOR, MIXOLYDIAN, bars, vary } from '../util.js';

const NUMERALS = /** @type {Record<string, number>} */ ({
  i: 0,
  ii: 2,
  iii: 4,
  iv: 5,
  v: 7,
  vi: 9,
  vii: 11,
});
/** Intervals added over the root by a quality suffix (the third comes from the case). */
const SUFFIX = /** @type {Record<string, number[]>} */ ({
  '': [7],
  7: [7, 10],
  M7: [7, 11],
  9: [7, 10, 14],
  M9: [7, 11, 14],
  6: [7, 9],
  add9: [7, 14],
  s: [7],
  s7: [7, 10],
  o: [6],
  o7: [6, 9],
  h: [6, 10],
  '+': [8],
});

/**
 * One chord symbol: a roman numeral on the track's tonic (upper case major, lower case
 * minor, optional b / # before it) and a quality suffix: 7, M7, 9, M9, 6, add9, s (sus4),
 * s7, o (diminished), o7, h (half-diminished), + (augmented).
 * @param {string} sym e.g. 'IV', 'vi7', 'bVII', 'V7', 'viio', 'IIIs'
 * @returns {Chord}
 */
export function chord(sym) {
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(sym);
  const deg = m ? NUMERALS[m[2].toLowerCase()] : undefined;
  const rest = m ? SUFFIX[m[3]] : undefined;
  if (!m || deg === undefined || !rest) throw new Error(`bad chord ${sym}`);
  const minor = m[2] === m[2].toLowerCase();
  const sus = m[3].startsWith('s');
  const third = sus ? 5 : minor || m[3].startsWith('o') || m[3] === 'h' ? 3 : 4;
  const root = (deg + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  return { root, minor: third === 3, tones: [0, third, ...rest] };
}

/**
 * One chord per bar, '|' splits a bar into two half-bar chords.
 * @param {string} s e.g. 'I vi IV|V I'
 * @returns {Chord[][]}
 */
export const chords = (s) => s.split(' ').map((bar) => bar.split('|').map(chord));

// Melody characters: a scale degree in base 36 ('0'–'9', 'a'–'z', 7 per octave). The same
// key with Shift raises it a semitone: ')!@#$%^&*(' for 0–9, upper case for a–z.
const SHIFTED = ')!@#$%^&*(';

/**
 * Scale degree and chromatic raise of a melody character.
 * @param {string} c @returns {[number, number]}
 */
export function degreeOf(c) {
  const k = SHIFTED.indexOf(c);
  if (k >= 0) return [k, 1];
  if (c >= 'A' && c <= 'Z') return [parseInt(c, 36), 1];
  return [parseInt(c, 36), 0];
}
