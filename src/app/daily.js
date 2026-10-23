/**
 * The daily challenge: the same stage, hero and twist for everyone on a given day,
 * so colleagues can compare times.
 *
 * @typedef {{id: 'none'|'oneHeart'|'noAmmo', label: string}} Twist
 * @typedef {{key: string, stage: number, hero: 'kevin'|'charline', twist: Twist}} Challenge
 */

/** @type {Twist[]} */
const TWISTS = [
  { id: 'none', label: 'contre la montre' },
  { id: 'oneHeart', label: 'un seul cœur' },
  { id: 'noAmmo', label: 'sans CR au départ' },
];

/** Small deterministic string hash. @param {string} text */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * @param {number} stages Number of stages to pick from.
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
    stage: h % stages,
    hero: (h >>> 8) % 2 ? 'charline' : 'kevin',
    twist: TWISTS[(h >>> 12) % TWISTS.length],
  };
}

/**
 * Applies the day's twist to a fresh simulation.
 * @param {import('../game/sim.js').Sim} sim @param {Challenge} c
 */
export function applyTwist(sim, c) {
  if (c.twist.id === 'oneHeart') sim.hero.hearts = sim.maxHearts = 1;
  if (c.twist.id === 'noAmmo') sim.ammo = 0;
}
