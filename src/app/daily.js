import { setHardcore } from '../game/sim.js';
import { MEDAL_EMOJI } from './medals.js';

/**
 * The daily challenge: the same stage, hero and twist for everyone on a given day,
 * so colleagues can compare times. Every stage without a boss is in the draw,
 * bonus stages included (no spoiling Julien or Rodolphe on a fresh save).
 *
 * @typedef {'none'|'oneHeart'|'noAmmo'|'noCheckpoint'|'sansFilet'|'secret'} TwistId
 * @typedef {{id: TwistId, label: string}} Twist
 * @typedef {{key: string, stage: number, hero: 'kevin'|'charline', twist: Twist}} Challenge
 * @typedef {{id: string, boss?: unknown}} StageInfo
 */

/** @type {Twist[]} */
export const TWISTS = [
  { id: 'none', label: 'contre la montre' },
  { id: 'oneHeart', label: 'un seul cœur' },
  { id: 'noAmmo', label: 'sans CR au départ' },
  // Every return goes back to the start of the stage.
  { id: 'noCheckpoint', label: 'sans badge Chronotime' },
  // A taste of the mode unlocked after the credits: one heart, no coffee, faster traps.
  { id: 'sansFilet', label: 'mode Sans filet' },
  // The day only counts with a secret found on the way.
  { id: 'secret', label: 'un secret à dénicher' },
];

/**
 * Draws the solver can't finish, as `stage:hero:twist` (tests/daily.test.js proves
 * every other one): the day moves on to the next twist instead. None today.
 * @type {Set<string>}
 */
export const UNFIT = new Set();

/** Small deterministic string hash. @param {string} text */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * @param {number | number[]} stages Number of stages to pick from, or the stage indices allowed.
 * @param {Date} [date]
 * @returns {Challenge}
 */
export function dailyChallenge(stages, date = new Date()) {
  // Local calendar day: the challenge changes at midnight where the player is.
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const h = hash(`nao-${key}`);
  return {
    key,
    stage: Array.isArray(stages) ? stages[h % stages.length] : h % stages,
    hero: (h >>> 8) % 2 ? 'charline' : 'kevin',
    twist: TWISTS[(h >>> 12) % TWISTS.length],
  };
}

/** Indices of the stages in the daily draw. @param {StageInfo[]} levels */
export const dailyStages = (levels) => levels.flatMap((l, i) => (l.boss ? [] : [i]));

/**
 * Can a twist be done on a stage with a hero?
 * @param {StageInfo} level @param {'kevin'|'charline'} hero @param {TwistId} twist
 */
export const twistFits = (level, hero, twist) => !UNFIT.has(`${level.id}:${hero}:${twist}`);

/**
 * Today's challenge among all the stages: the draw, with the twist moved on to the
 * next one that fits when it doesn't.
 * @param {StageInfo[]} levels @param {Date} [date]
 * @returns {Challenge}
 */
export function dailyFor(levels, date = new Date()) {
  const c = dailyChallenge(dailyStages(levels), date);
  const level = levels[c.stage];
  const at = TWISTS.indexOf(c.twist);
  for (let k = 0; k < TWISTS.length; k++) {
    const twist = TWISTS[(at + k) % TWISTS.length];
    if (twistFits(level, c.hero, twist.id)) return { ...c, twist };
  }
  return c;
}

/**
 * Applies the day's twist to a fresh simulation.
 * @param {import('../game/sim.js').Sim} sim @param {Challenge} c
 */
export function applyTwist(sim, c) {
  switch (c.twist.id) {
    case 'oneHeart':
      sim.hero.hearts = sim.maxHearts = 1;
      break;
    case 'noAmmo':
      sim.ammo = 0;
      break;
    case 'noCheckpoint':
      // The Chronotime terminals are off for the day (and out of sight).
      for (const t of sim.things) if (t.kind === 'checkpoint') t.alive = false;
      break;
    case 'sansFilet':
      setHardcore(sim);
      break;
    default:
      break;
  }
}

/**
 * Was the day's challenge met by this finished run? Only « un secret à dénicher »
 * asks for more than reaching the exit.
 * @param {Challenge} c @param {{secrets: number}} sim
 */
export const dailyMet = (c, sim) => c.twist.id !== 'secret' || sim.secrets > 0;

/**
 * The results card's kicker for a daily run.
 * @param {Challenge} c @param {{secrets: number}} sim
 */
export const dailyKicker = (c, sim) =>
  dailyMet(c, sim) ? `Défi du jour · ${c.twist.label} ✓` : 'Défi du jour · secret manquant';

/** @param {number} s */
const clock = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

/**
 * The emoji line of a shared score, like the word games: medal, hearts kept,
 * secrets found, time.
 * @param {{medal?: import('./medals.js').Tier | null, hearts: number, maxHearts: number,
 *   secrets: number, secretTotal: number, time: number}} r
 */
export function shareCard(r) {
  const hearts =
    '❤️'.repeat(Math.max(0, r.hearts)) + '🖤'.repeat(Math.max(0, r.maxHearts - r.hearts));
  const secrets = '⭐'.repeat(r.secrets) + '▫️'.repeat(Math.max(0, r.secretTotal - r.secrets));
  return `${r.medal ? `${MEDAL_EMOJI[r.medal]} ` : ''}${hearts}  ${secrets}  ⏱️ ${clock(r.time)}`;
}
