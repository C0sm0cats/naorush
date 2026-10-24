import { step } from './sim.js';
import { PERIOD, phaseOf } from './traps.js';

/**
 * Breadth-first search over short input "moves" on the real simulation.
 * Used by the tests to prove a level can be finished without taking damage,
 * and by the attract-mode demo. Positions are bucketed to half a tile.
 *
 * @typedef {import('./sim.js').Input} Input
 * @typedef {{name: string, frames: Input[]}} Move
 */

/** @param {Partial<Input>} [o] @returns {Input} */
const I = (o = {}) => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
  ...o,
});
/** @param {number} n @param {Partial<Input>} input */
const repeat = (n, input) => Array.from({ length: n }, () => I(input));

/** @type {Move[]} */
export const MOVES = [
  { name: 'walkR', frames: repeat(10, { right: true }) },
  { name: 'walkL', frames: repeat(10, { left: true }) },
  { name: 'stepR', frames: repeat(4, { right: true }) },
  { name: 'stepL', frames: repeat(4, { left: true }) },
  {
    name: 'jumpR',
    frames: [...repeat(22, { right: true, jump: true }), ...repeat(20, { right: true })],
  },
  {
    name: 'jumpL',
    frames: [...repeat(22, { left: true, jump: true }), ...repeat(20, { left: true })],
  },
  {
    name: 'hopR',
    frames: [...repeat(6, { right: true, jump: true }), ...repeat(18, { right: true })],
  },
  {
    name: 'hopL',
    frames: [...repeat(6, { left: true, jump: true }), ...repeat(18, { left: true })],
  },
  {
    name: 'jumpUpR',
    frames: [...repeat(2, { right: true }), ...repeat(26, { jump: true }), ...repeat(10, {})],
  },
  {
    name: 'jumpUpL',
    frames: [...repeat(2, { left: true }), ...repeat(26, { jump: true }), ...repeat(10, {})],
  },
  {
    name: 'doubleR',
    frames: [
      ...repeat(16, { right: true, jump: true }),
      ...repeat(2, { right: true }),
      ...repeat(18, { right: true, jump: true }),
      ...repeat(20, { right: true }),
    ],
  },
  {
    name: 'doubleUp',
    frames: [
      ...repeat(16, { jump: true }),
      ...repeat(2, {}),
      ...repeat(20, { jump: true }),
      ...repeat(12, {}),
    ],
  },
  { name: 'climb', frames: [...repeat(4, {}), ...repeat(36, { up: true })] },
  { name: 'drop', frames: [...repeat(8, { down: true }), ...repeat(30, {})] },
  { name: 'fireR', frames: [I({ right: true }), I({ fire: true }), ...repeat(6, {})] },
  { name: 'fireL', frames: [I({ left: true }), I({ fire: true }), ...repeat(6, {})] },
  { name: 'wait', frames: repeat(30, {}) },
  { name: 'pause', frames: repeat(8, {}) },
];

const FLAGGED = new Set([
  'colleague',
  'loose',
  'bottle',
  'intern',
  'visio',
  'crate',
  'panel',
  'switch',
]);
const PERIODIC = /** @type {Record<string, number>} */ (PERIOD);

/** @param {import('./sim.js').Sim} s */
function key(s) {
  const h = s.hero;
  const flags = s.things
    .filter((t) => FLAGGED.has(t.kind))
    .map((t) => (t.alive ? t.state[0] : 'x'))
    .join('');
  // Things that move on their own matter only once they are near (or in play).
  const near = (/** @type {{x: number}} */ t) => Math.abs(t.x - h.x) < 7;
  const moving = s.things
    .map((t) => {
      if (t.kind === 'lift' && near(t)) return Math.round(t.y * 2);
      if (t.kind === 'boss' && s.bossActive) return `${t.state}${t.hp}${Math.floor(t.t * 4)}`;
      if (t.kind in PERIODIC && near(t))
        return Math.floor((phaseOf(s, t, PERIODIC[t.kind]) / PERIODIC[t.kind]) * 8);
      if ((t.kind === 'chair' || t.kind === 'vacuum') && near(t))
        return `${t.state[0]}${Math.round(t.x)}`;
      return '';
    })
    .join('');
  return `${Math.round(h.x * 2)},${Math.round(h.y * 2)},${h.state},${h.hearts},${s.hasKey ? 1 : 0},${s.doorOpen ? 1 : 0},${Math.min(s.ammo, 3)},${flags},${moving}`;
}

/**
 * Distance to the next objective: the badge reader, the boss, the key, then the exit.
 * @param {import('./sim.js').Sim} s
 */
function remaining(s) {
  /** @param {string} kind */
  const find = (kind) => s.things.find((t) => t.kind === kind && t.alive);
  const boss = s.boss && !s.bossDone ? find('boss') : undefined;
  const target = !s.doorOpen
    ? find('reader')
    : boss
      ? boss
      : !s.hasKey
        ? find('key')
        : find('exit');
  const stage =
    (s.doorOpen ? 0 : 300) + (boss ? 100 + (boss.hp ?? 0) * 60 : 0) + (s.hasKey ? 0 : 100);
  if (!target) return stage;
  // Face the boss from a throwing distance rather than walking into it.
  const tx = boss ? target.x - 4 : target.x;
  return stage + Math.abs(tx - s.hero.x) + Math.abs(target.y - s.hero.y) * 1.5;
}

/**
 * Best-first search guided by {@link remaining}; ties go to shorter paths.
 * @param {import('./sim.js').Sim} start
 * @param {{maxNodes?: number, allowDamage?: boolean, goal?: {x: number, y: number, done: (s: import('./sim.js').Sim) => boolean}}} [o]
 *   `goal` replaces the exit as the target (used to prove secrets are reachable).
 * @returns {{won: boolean, inputs: Input[], explored: number, closest?: import('./sim.js').Sim}}
 */
export function solve(start, o = {}) {
  const maxNodes = o.maxNodes ?? 80000;
  const hearts = start.hero.hearts;
  /** @type {Array<{sim: import('./sim.js').Sim, path: Move[], score: number}>} */
  const open = [{ sim: structuredClone(start), path: [], score: 0 }];
  const seen = new Set([key(start)]);
  let explored = 0;
  let best = { left: Infinity, sim: start };
  while (open.length && explored < maxNodes) {
    // Pop the most promising node (small arrays: a linear scan is fine).
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].score < open[bi].score) bi = i;
    const node = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    for (const move of MOVES) {
      const hanging = node.sim.hero.state === 'hang';
      if (hanging !== (move.name === 'climb' || move.name === 'drop')) continue;
      const s = structuredClone(node.sim);
      let bad = false;
      for (const input of move.frames) {
        step(s, input);
        if (s.won || o.goal?.done(s)) break;
        if (s.hero.state === 'dead' || (!o.allowDamage && s.hero.hearts < hearts)) {
          bad = true;
          break;
        }
      }
      explored++;
      if (bad) continue;
      const path = [...node.path, move];
      if (o.goal ? o.goal.done(s) : s.won)
        return { won: true, inputs: path.flatMap((m) => m.frames), explored };
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      const left = o.goal
        ? Math.abs(o.goal.x - s.hero.x) + Math.abs(o.goal.y - s.hero.y) * 1.5
        : remaining(s);
      if (left < best.left) best = { left, sim: s };
      open.push({ sim: s, path, score: left + path.length * 0.35 });
    }
  }
  return { won: false, inputs: [], explored, closest: best.sim };
}
