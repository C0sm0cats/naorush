// Which track and ambient bed each stage uses.

import { AMBIENCES } from './ambience.js';
import { SONGS } from './tracks/index.js';

/** @typedef {import('./types.js').TrackName} TrackName */
/** @typedef {import('./ambience.js').Bed} Bed */
/** @typedef {import('./types.js').Floor} Floor */

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
/** Floor under the hero's feet, by level id (falls back to the level's `theme`). @type {Record<string, Floor>} */
const STAGE_FLOOR = {
  parking: 'concrete',
  lcp7: 'carpet',
  ts: 'metal',
  copil: 'carpet',
  rooftop: 'gravel',
  intercontrat: 'tile',
  pause: 'tile',
  seminaire: 'wood',
};
/** @type {Record<string, Floor>} */
const THEME_FLOOR = {
  office: 'carpet',
  datacenter: 'metal',
  parking: 'concrete',
  rooftop: 'gravel',
};
/** Every floor material with its own footsteps. @type {Floor[]} */
export const FLOORS = ['carpet', 'concrete', 'metal', 'gravel', 'tile', 'wood'];
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
/** @param {StageRef} level @returns {Floor} */
export const stageFloor = (level) =>
  STAGE_FLOOR[level.id] ?? THEME_FLOOR[level.theme ?? ''] ?? 'carpet';
