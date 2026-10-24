// Which track and ambient bed each stage uses.

import { AMBIENCES } from './ambience.js';
import { SONGS } from './tracks/index.js';

/** @typedef {import('./types.js').TrackName} TrackName */
/** @typedef {import('./ambience.js').Bed} Bed */

/** Music of each stage, by level id (falls back to the level's own `music`). @type {Record<string, TrackName>} */
const STAGE_MUSIC = {
  parking: 'parking',
  lcp7: 'office',
  ts: 'datacenter',
  copil: 'copil',
  rooftop: 'rooftop',
  intercontrat: 'intercontrat',
  pause: 'cafe',
  seminaire: 'seminar',
};
/** Ambient bed of each stage, by level id (falls back to the level's `theme`). @type {Record<string, Bed>} */
const STAGE_BED = {
  parking: 'parking',
  lcp7: 'office',
  ts: 'datacenter',
  copil: 'copil',
  rooftop: 'rooftop',
  intercontrat: 'office',
  pause: 'cafe',
  seminaire: 'seminar',
};
/** Every stage id known to the audio, in play order. */
export const STAGES = Object.keys(STAGE_MUSIC);
/** @typedef {{ id: string, music?: string, theme?: string }} StageRef */
/** @param {StageRef} level @returns {TrackName | null} */
export const stageTrack = (level) =>
  STAGE_MUSIC[level.id] ??
  (level.music && Object.hasOwn(SONGS, level.music)
    ? /** @type {TrackName} */ (level.music)
    : null);
/** @param {StageRef} level @returns {Bed | null} */
export const stageBed = (level) =>
  STAGE_BED[level.id] ??
  (AMBIENCES.includes(/** @type {Bed} */ (level.theme)) ? /** @type {Bed} */ (level.theme) : null);
