import { createSim, step } from '../src/game/sim.js';

/**
 * Tiny hand-written stages for mechanics tests.
 *
 * @typedef {import('../src/game/sim.js').Sim} Sim
 * @typedef {import('../src/game/sim.js').Input} Input
 * @typedef {import('../src/game/sim.js').SimEvent} SimEvent
 * @typedef {import('../src/game/sim.js').HeroId} HeroId
 * @typedef {import('../src/game/world.js').LevelDef} LevelDef
 * @typedef {[string, number, number]} Mark Map character at (column, y), y up.
 */

/**
 * A 12-row room: ceiling on top, walls at both ends, floor rows y = 0..2 (heroes stand at y = 3).
 * @param {number} w Width in tiles.
 * @param {Mark[]} [marks]
 * @param {Partial<LevelDef>} [extra]
 * @returns {LevelDef}
 */
export function room(w, marks = [], extra = {}) {
  /** @type {string[][]} */
  const grid = Array.from({ length: 12 }, (_, row) =>
    Array.from({ length: w }, (_, c) => {
      const y = 11 - row;
      return y <= 2 || y === 11 || c === 0 || c === w - 1 ? '#' : ' ';
    }),
  );
  for (const [ch, c, y] of marks) grid[11 - y][c] = ch;
  return { map: grid.map((r) => r.join('')), ...extra };
}

/**
 * Marks filling a rectangle (inclusive bounds).
 * @param {string} ch @param {number} c0 @param {number} c1 @param {number} y0 @param {number} y1
 * @returns {Mark[]}
 */
export function fill(ch, c0, c1, y0, y1) {
  /** @type {Mark[]} */
  const out = [];
  for (let c = c0; c <= c1; c++) for (let y = y0; y <= y1; y++) out.push([ch, c, y]);
  return out;
}

/** @param {Partial<Input>} [o] @returns {Input} */
export const input = (o = {}) => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
  ...o,
});

export const IDLE = input();

/** @param {LevelDef} def @param {HeroId} [hero] */
export const sim = (def, hero = 'kevin') => createSim(def, hero);

/**
 * Steps `frames` times with the same input and returns every event emitted.
 * @param {Sim} s @param {Input} inp @param {number} frames
 * @returns {SimEvent[]}
 */
export function run(s, inp, frames) {
  /** @type {SimEvent[]} */
  const events = [];
  for (let i = 0; i < frames; i++) {
    step(s, inp);
    events.push(...s.events);
  }
  return events;
}

/**
 * Steps until `done` holds (checked after each step) or `max` frames pass.
 * @param {Sim} s @param {Input | ((s: Sim) => Input)} inp @param {(s: Sim) => boolean} done
 * @param {number} [max]
 * @returns {{ok: boolean, frames: number, events: SimEvent[]}}
 */
export function runUntil(s, inp, done, max = 600) {
  /** @type {SimEvent[]} */
  const events = [];
  for (let i = 1; i <= max; i++) {
    step(s, typeof inp === 'function' ? inp(s) : inp);
    events.push(...s.events);
    if (done(s)) return { ok: true, frames: i, events };
  }
  return { ok: false, frames: max, events };
}

/** @param {SimEvent[]} events @param {string} type */
export const has = (events, type) => events.some((e) => e.type === type);

/** One fresh CR throw: press fire for a frame, then release. @param {Sim} s */
export function throwCr(s) {
  const events = run(s, input({ fire: true }), 1);
  return events.concat(run(s, IDLE, 1));
}
