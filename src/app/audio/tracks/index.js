// Song table, compiled song forms and track metadata.

import { BOSS_SONGS } from './bosses.js';
import { INTERLUDE_SONGS } from './interludes.js';
import { MENU_SONGS } from './menus.js';
import { STAGE_SONGS } from './stages.js';

/** @typedef {import('../types.js').Track} Track */
/** @typedef {import('../types.js').Bar} Bar */
/** @typedef {import('../types.js').TrackName} TrackName */
/** @typedef {import('../types.js').Hero} Hero */

// Every track is built on the main theme's motif, sol–mi–sol–do (see menus.js); looping
// tracks are in song form (A / B / development / return) and loop back to their top.
/** @type {Record<TrackName, Track>} */
export const SONGS = {
  title: MENU_SONGS.title,
  parking: STAGE_SONGS.parking,
  office: STAGE_SONGS.office,
  datacenter: STAGE_SONGS.datacenter,
  copil: STAGE_SONGS.copil,
  rooftop: STAGE_SONGS.rooftop,
  intercontrat: INTERLUDE_SONGS.intercontrat,
  cafe: INTERLUDE_SONGS.cafe,
  seminar: INTERLUDE_SONGS.seminar,
  bossJulien: BOSS_SONGS.bossJulien,
  bossRodolphe: BOSS_SONGS.bossRodolphe,
  win: MENU_SONGS.win,
  winSigned: MENU_SONGS.winSigned,
  gameover: MENU_SONGS.gameover,
  credits: MENU_SONGS.credits,
};

/**
 * Flattens a track's form into one entry per bar, for one hero (sections may give each
 * hero their own variant).
 * @param {Track} def
 * @param {Hero} [hero]
 * @returns {Bar[]}
 */
export function compile(def, hero = 'kevin') {
  /** @type {Bar[]} */
  const out = [];
  (def.form ?? [{}]).forEach((part, si) => {
    const sec = { ...part, ...part[hero] };
    /** @type {Track} */
    const d = { ...def, ...sec };
    const melody = d.melody;
    const ch = d.chords;
    const n = Math.max(melody.length, ch.length);
    const pick = (/** @type {string[] | undefined} */ a, /** @type {number} */ k) =>
      a ? a[k % a.length] : '';
    for (let k = 0; k < n; k++) {
      out.push({
        def: d,
        chords: ch[k % ch.length],
        key: d.key ?? 0,
        mel: melody[k % melody.length],
        counter: pick(sec.counter, k),
        descant: pick(d.descant, k),
        finale: pick(d.finale, k),
        thin: !!sec.thin,
        sec: si,
        start: k === 0,
        fill: k === n - 1,
        intro: !!sec.intro,
        next: 0,
      });
    }
  });
  // The last bar leads back to the top of the loop, not into the intro.
  const loop = loopStart(out);
  out.forEach((b, k) => {
    const nx = out[k + 1] ?? out[loop];
    b.next = nx.chords[0].root + nx.key;
  });
  return out;
}

/** First bar after the intro. @param {Bar[]} bars */
const loopStart = (bars) => {
  const k = bars.findIndex((b) => !b.intro);
  return k < 0 ? 0 : k;
};

/** Every playable track name, in display order. */
export const TRACKS = /** @type {TrackName[]} */ (Object.keys(SONGS));
export const BARS = /** @type {Record<TrackName, Bar[]>} */ (
  Object.fromEntries(TRACKS.map((n) => [n, compile(SONGS[n])]))
);

/** @type {Map<string, Bar[]>} */
const heroBars = new Map();
/**
 * The compiled bars of a track for a hero (the same as BARS unless the track has hero
 * variants), and where its loop starts.
 * @param {TrackName} name @param {Hero} hero
 */
export function barsFor(name, hero) {
  const key = `${name}:${hero}`;
  let bars = heroBars.get(key);
  if (!bars) {
    const def = SONGS[name];
    const varies = def.form?.some((p) => p.kevin || p.charline);
    bars = varies && hero !== 'kevin' ? compile(def, hero) : BARS[name];
    heroBars.set(key, bars);
  }
  return { bars, loop: loopStart(bars) };
}

/** Tempo, length in bars and length in seconds of a track (sound test, tests). */
export const trackInfo = (/** @type {TrackName} */ name) => {
  const { bpm, once } = SONGS[name];
  const n = BARS[name].length;
  return { bpm, bars: n, seconds: (n * 4 * 60) / bpm, loops: !once };
};
