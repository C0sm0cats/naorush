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
 * the game as designed. Such a medal says what held it back and what the run
 * would have earned without the help (`held`), so the results card can tell the
 * player kindly. The best medal and the star can come from different runs.
 *
 * « Sans filet », unlocked after the credits, replays a stage with one heart, no
 * coffee, faster traps and shorter PRIMO windows (`setHardcore` in the simulation),
 * with its own records and medals. Saves from before the medals start with none.
 *
 * @typedef {'kevin'|'charline'} HeroId
 * @typedef {'gold'|'silver'|'bronze'} Tier
 * @typedef {'relaxed'|'slow'|'both'|'any'} Help What held a medal at bronze: relaxed
 *   mode, a slower game speed, both, or one of them (unsaid).
 * @typedef {{by: Help, tier: Tier, star: boolean}} Held The help, and the medal the
 *   same time and returns would have earned without it.
 * @typedef {{tier: Tier, star: boolean, held?: Held}} Medal
 * @typedef {boolean | {relaxed?: boolean, slow?: boolean}} Assist Relaxed mode or a
 *   slower speed at any point of the run (`true`: one or the other, unsaid).
 * @typedef {'normal'|'sansFilet'} Mode
 */

/**
 * Time (s) of the solver's route through each stage, per hero: the medal yardstick.
 * On a boss stage, the route to the arena, a flawless duel and the way out.
 * Computed offline with the same search as tests/level.test.js; tests/medals.test.js
 * re-runs it and fails, printing the new table, when a stage or the physics drift.
 * @type {Record<string, Record<HeroId, number>>}
 */
export const REFERENCE = {
  parking: { kevin: 51.7, charline: 44.1 },
  lcp7: { kevin: 54.4, charline: 46.4 },
  ts: { kevin: 117, charline: 107.4 },
  copil: { kevin: 51.2, charline: 45 },
  rooftop: { kevin: 120.3, charline: 114.8 },
  intercontrat: { kevin: 53.1, charline: 43.2 },
  pause: { kevin: 54.4, charline: 48.4 },
  seminaire: { kevin: 52.5, charline: 43.4 },
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
 * What held a run back, from the assist flags. Null for a run without help.
 * @param {Assist} assisted @returns {Help | null}
 */
export function helpOf(assisted) {
  if (!assisted) return null;
  if (assisted === true) return 'any';
  if (assisted.relaxed && assisted.slow) return 'both';
  return assisted.relaxed ? 'relaxed' : assisted.slow ? 'slow' : null;
}

/**
 * The medal a finished run earns. A helped run gets a bronze without a star, and
 * keeps in `held` what it would have earned: the card's « ton temps vaut l'or ».
 * @param {string} stageId @param {HeroId} hero
 * @param {number} time Stage time (s). @param {number} deaths Returns to the badge.
 * @param {Assist} [assisted] Played in relaxed mode or below normal speed.
 * @returns {Medal}
 */
export function medalFor(stageId, hero, time, deaths, assisted = false) {
  const t = medalTargets(stageId, hero);
  /** @type {Tier} */
  const tier = !t ? 'bronze' : time < t.gold ? 'gold' : time < t.silver ? 'silver' : 'bronze';
  const by = helpOf(assisted);
  if (by) return { tier: 'bronze', star: false, held: { by, tier, star: deaths === 0 } };
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
