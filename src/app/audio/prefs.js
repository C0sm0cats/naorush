// Persisted mute and volume preferences.

import { clamp01 } from './util.js';

export const MUTE_KEY = 'naorush.muted';
export const VOL_KEYS = { music: 'naorush.vol.music', sfx: 'naorush.vol.sfx' };
const VOL_DEFAULT = { music: 0.7, sfx: 0.8 };

/** @typedef {'music'|'sfx'} Bus */

/** @param {string} key */
export function load(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
/** @param {string} key @param {string} value */
export function save(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
/** @param {Bus} bus */
export function loadVolume(bus) {
  const raw = load(VOL_KEYS[bus]);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? clamp01(n) : VOL_DEFAULT[bus];
}
