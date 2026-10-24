// Song table, compiled song forms and track metadata.

import { BOSS_SONGS } from './bosses.js';
import { INTERLUDE_SONGS } from './interludes.js';
import { MENU_SONGS } from './menus.js';
import { STAGE_SONGS } from './stages.js';

/** @typedef {import('../types.js').Track} Track */
/** @typedef {import('../types.js').Bar} Bar */
/** @typedef {import('../types.js').TrackName} TrackName */

// Looping tracks follow an A (8 bars) / B (8 bars) / A' (countermelody) / bridge (4 bars) form;
// every bridge ends on a dominant-ish chord that resolves into bar 1 at the loop point.
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
  gameover: MENU_SONGS.gameover,
  credits: MENU_SONGS.credits,
};

/**
 * Flattens a track's form into one entry per bar.
 * @param {Track} def
 * @returns {Bar[]}
 */
function compile(def) {
  /** @type {Bar[]} */
  const out = [];
  (def.form ?? [{}]).forEach((sec, si) => {
    const melody = sec.melody ?? def.melody;
    const ch = sec.chords ?? def.chords;
    const n = Math.max(melody.length, ch.length);
    for (let k = 0; k < n; k++) {
      out.push({
        chord: ch[k % ch.length],
        mel: melody[k % melody.length],
        counter: sec.counter ? sec.counter[k % sec.counter.length] : '',
        bass: sec.bass ?? def.bass,
        kick: sec.kick ?? def.kick,
        snare: sec.snare ?? def.snare,
        hat: sec.hat ?? def.hat,
        clap: sec.clap ?? def.clap ?? '',
        stab: sec.stab ?? def.stab ?? '',
        rim: sec.rim ?? def.rim ?? '',
        thin: !!sec.thin,
        sec: si,
        start: k === 0,
        fill: k === n - 1,
        next: 0,
      });
    }
  });
  out.forEach((b, k) => (b.next = out[(k + 1) % out.length].chord[0]));
  return out;
}

/** Every playable track name, in display order. */
export const TRACKS = /** @type {TrackName[]} */ (Object.keys(SONGS));
export const BARS = /** @type {Record<TrackName, Bar[]>} */ (
  Object.fromEntries(TRACKS.map((n) => [n, compile(SONGS[n])]))
);

/** Tempo, length in bars and loop length in seconds of a track (sound test, tests). */
export const trackInfo = (/** @type {TrackName} */ name) => {
  const { bpm, once } = SONGS[name];
  const n = BARS[name].length;
  return { bpm, bars: n, seconds: (n * 4 * 60) / bpm, loops: !once };
};
