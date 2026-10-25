import { setHardcore } from '../game/sim.js';
import { load, store } from './storage.js';

/**
 * Medals and the « Sans filet » mode: reasons to play a stage again.
 *
 * Each stage has a time medal per hero, measured against the route the solver
 * finds (src/game/solver.js, the same search that proves every stage in the
 * tests): gold under 1.6× its time, silver under 2.5×, bronze for any finish.
 * A star crowns a run without a single return to the badge. Relaxed mode or a
 * slower game speed still finish the stage, for a bronze: the medals measure
 * the game as designed. The best medal and the star can come from different runs.
 *
 * « Sans filet », unlocked after the credits, replays a stage with one heart, no
 * coffee, faster traps and shorter PRIMO windows (`setHardcore` in the simulation),
 * with its own records and medals. Saves from before the medals start with none.
 *
 * @typedef {'kevin'|'charline'} HeroId
 * @typedef {'gold'|'silver'|'bronze'} Tier
 * @typedef {{tier: Tier, star: boolean}} Medal
 * @typedef {'normal'|'sansFilet'} Mode
 */

/**
 * Time (s) of the solver's route through each stage, per hero: the medal yardstick.
 * Computed offline with the same search as tests/level.test.js; tests/medals.test.js
 * re-runs it and fails, printing the new table, when a stage or the physics drift.
 * @type {Record<string, Record<HeroId, number>>}
 */
export const REFERENCE = {
  parking: { kevin: 14.2, charline: 12.4 },
  lcp7: { kevin: 20.4, charline: 15.9 },
  ts: { kevin: 49.5, charline: 47.6 },
  copil: { kevin: 29.6, charline: 25.2 },
  rooftop: { kevin: 60.1, charline: 53.2 },
  intercontrat: { kevin: 21, charline: 20 },
  pause: { kevin: 28.2, charline: 24.2 },
  seminaire: { kevin: 22.4, charline: 17.1 },
};

/** Gold and silver: within these multiples of the reference time. */
export const GOLD = 1.6;
export const SILVER = 2.5;

/** Worst to best. @type {Tier[]} */
export const TIERS = ['bronze', 'silver', 'gold'];

/** @type {Record<Tier, string>} */
export const TIER_NAME = { gold: 'Or', silver: 'Argent', bronze: 'Bronze' };
/** For the shared score card. @type {Record<Tier, string>} */
export const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' };

/**
 * A stage's medal times for a hero, in whole seconds: a time strictly under the
 * limit earns the medal (so « Or sous 0 min 20 s » reads true on any clock).
 * Null for a stage without a reference time.
 * @param {string} stageId @param {HeroId} hero
 * @returns {{gold: number, silver: number} | null}
 */
export function medalTargets(stageId, hero) {
  const ref = REFERENCE[stageId]?.[hero];
  if (!ref) return null;
  return { gold: Math.round(ref * GOLD), silver: Math.round(ref * SILVER) };
}

/**
 * The medal a finished run earns.
 * @param {string} stageId @param {HeroId} hero
 * @param {number} time Stage time (s). @param {number} deaths Returns to the badge.
 * @param {boolean} [assisted] Played in relaxed mode or below normal speed.
 * @returns {Medal}
 */
export function medalFor(stageId, hero, time, deaths, assisted = false) {
  if (assisted) return { tier: 'bronze', star: false };
  const t = medalTargets(stageId, hero);
  /** @type {Tier} */
  const tier = !t ? 'bronze' : time < t.gold ? 'gold' : time < t.silver ? 'silver' : 'bronze';
  return { tier, star: deaths === 0 };
}

/** The records a run counts for. @param {{hardcore?: boolean}} sim @returns {Mode} */
export const modeOf = (sim) => (sim.hardcore ? 'sansFilet' : 'normal');

/**
 * Save key of a stage and hero, for medals and records alike: « Sans filet » keeps
 * its own (`parking:kevin`, `parking:kevin:sansfilet`).
 * @param {string} stageId @param {HeroId} hero @param {Mode} [mode]
 */
export const recordKey = (stageId, hero, mode = 'normal') =>
  `${stageId}:${hero}${mode === 'sansFilet' ? ':sansfilet' : ''}`;

const KEY = 'naorush.medals';

/** @param {unknown} m @returns {m is Medal} */
const isMedal = (m) =>
  Boolean(m) &&
  typeof m === 'object' &&
  TIERS.includes(/** @type {Medal} */ (m).tier) &&
  typeof (/** @type {Medal} */ (m).star) === 'boolean';

export class Medals {
  constructor() {
    /** Best medal and star per {@link recordKey}. @type {Record<string, Medal>} */
    this.data = {};
    const saved = /** @type {Record<string, unknown>} */ (load(KEY, {}));
    // Keep only well-formed entries of a damaged save.
    for (const [k, m] of Object.entries(saved))
      if (isMedal(m)) this.data[k] = { tier: m.tier, star: m.star };
  }

  /** @param {string} stageId @param {HeroId} hero @param {Mode} [mode] @returns {Medal | undefined} */
  get(stageId, hero, mode = 'normal') {
    return this.data[recordKey(stageId, hero, mode)];
  }

  /**
   * Keeps a run's medal if it beats the stage's best (tier and star separately).
   * @param {string} stageId @param {HeroId} hero @param {Medal} medal @param {Mode} [mode]
   * @returns {{best: Medal, improved: boolean}}
   */
  record(stageId, hero, medal, mode = 'normal') {
    const key = recordKey(stageId, hero, mode);
    const before = this.data[key];
    /** @type {Medal} */
    const best = {
      tier:
        before && TIERS.indexOf(before.tier) > TIERS.indexOf(medal.tier) ? before.tier : medal.tier,
      star: Boolean(before?.star) || medal.star,
    };
    const improved = !before || best.tier !== before.tier || best.star !== before.star;
    if (improved) {
      this.data[key] = best;
      store(KEY, this.data);
    }
    return { best, improved };
  }

  /**
   * Gold on every one of these stages with this hero (« Sans filet » golds count too).
   * @param {HeroId} hero @param {string[]} stageIds
   */
  allGold(hero, stageIds) {
    return (
      stageIds.length > 0 &&
      stageIds.every(
        (id) =>
          this.get(id, hero)?.tier === 'gold' || this.get(id, hero, 'sansFilet')?.tier === 'gold',
      )
    );
  }
}

/**
 * Turns a fresh simulation into a « Sans filet » run: the simulation's hardcore
 * rules (one heart, no coffee, faster traps, shorter PRIMO windows), and no
 * relaxed mode.
 * @param {import('../game/sim.js').Sim} sim
 */
export function applySansFilet(sim) {
  setHardcore(sim);
  sim.assist = false;
}
