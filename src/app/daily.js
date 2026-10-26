import { LEVELS } from '../data/levels/index.js';
import { setHardcore } from '../game/sim.js';
import { MEDAL_EMOJI, medalTargets } from './medals.js';

/**
 * The daily challenge: the same stage, hero and twist for everyone on a given day,
 * so colleagues can compare times. Every stage without a boss is in the draw,
 * bonus stages included (no spoiling Julien or Rodolphe on a fresh save).
 *
 * Stages and twists are dealt like cards: each cycle (as many days as stages, or
 * as twists) shuffles the whole deck, so every stage and every twist comes back
 * within a cycle, and never on two days in a row.
 *
 * @typedef {'none'|'oneHeart'|'noAmmo'|'noCheckpoint'|'sansFilet'|'secret'|'chrono'} TwistId
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
  // The day only counts under the stage's silver medal time.
  { id: 'chrono', label: 'chrono d’argent' },
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
 * The deck of `n` cards dealt on cycle `k`: a shuffle seeded by the cycle, its first
 * card swapped away when it would repeat the previous cycle's last one.
 * @param {string} name @param {number} n @param {number} k
 * @returns {number[]}
 */
function deck(name, n, k) {
  const cards = shuffle(name, n, k);
  if (n > 1 && cards[0] === shuffle(name, n, k - 1).at(-1))
    [cards[0], cards[1]] = [cards[1], cards[0]];
  return cards;
}

/** Fisher–Yates with the cycle's hash. @param {string} name @param {number} n @param {number} k */
function shuffle(name, n, k) {
  const cards = Array.from({ length: n }, (_, i) => i);
  let h = hash(`nao-${name}-${k}`);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const j = h % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** The card of day `d` in a deck of `n` cards. @param {string} name @param {number} n @param {number} d */
function deal(name, n, d) {
  const k = Math.floor(d / n);
  return deck(name, n, k)[d - k * n];
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
  // Days since 1 January 2026 (calendar days, whatever the clock change).
  const day = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) /
      86400000,
  );
  const list = Array.isArray(stages) ? stages : Array.from({ length: stages }, (_, i) => i);
  return {
    key,
    stage: list[deal('stage', list.length, day)],
    hero: hash(`nao-${key}`) % 2 ? 'charline' : 'kevin',
    twist: TWISTS[deal('twist', TWISTS.length, day)],
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
    if (twistFits(level, c.hero, twist.id)) return withTime({ ...c, twist });
  }
  return withTime(c);
}

/**
 * « Chrono d'argent » names its time on the title button, the card and the share.
 * @param {Challenge} c @returns {Challenge}
 */
function withTime(c) {
  const limit = dailyLimit(c);
  return c.twist.id === 'chrono' && Number.isFinite(limit)
    ? { ...c, twist: { ...c.twist, label: `chrono d’argent, sous ${clock(limit)}` } }
    : c;
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
 * The time to beat on « chrono d'argent »: the silver medal time (whole seconds)
 * of the stage and hero, or Infinity on a stage without one.
 * @param {Challenge} c
 */
export const dailyLimit = (c) =>
  medalTargets(LEVELS[c.stage]?.id ?? '', c.hero)?.silver ?? Number.POSITIVE_INFINITY;

/**
 * Was the day's challenge met by this finished run? « Un secret à dénicher » asks
 * for a secret, « chrono d'argent » for a time under the silver medal's; the others
 * for reaching the exit.
 * @param {Challenge} c @param {{secrets: number, time?: number}} sim
 */
export function dailyMet(c, sim) {
  if (c.twist.id === 'secret') return sim.secrets > 0;
  if (c.twist.id === 'chrono') return (sim.time ?? Number.POSITIVE_INFINITY) < dailyLimit(c);
  return true;
}

/**
 * The results card's kicker for a daily run.
 * @param {Challenge} c @param {{secrets: number, time?: number}} sim
 */
export function dailyKicker(c, sim) {
  if (dailyMet(c, sim)) return `Défi du jour · ${c.twist.label} ✓`;
  return c.twist.id === 'chrono'
    ? `Défi du jour · chrono à battre : ${clock(dailyLimit(c))}`
    : 'Défi du jour · secret manquant';
}

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
