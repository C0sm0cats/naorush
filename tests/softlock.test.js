import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels/index.js';
import { TILE, createSim, step, tileAt } from '../src/game/sim.js';
import { MOVES } from '../src/game/solver.js';

/**
 * Nobody gets stuck in the scenery. The solver proves a stage can be finished from
 * the start; this proves it can never be lost: every resting place a hero can reach
 * (standing or hanging, bucketed to half a tile) still leads on to the objective, or
 * to a lethal fall (cables, the void) that sends them back to a badge. A safe pit
 * whose only way out is a restart fails.
 *
 * Only what can block for good is kept: walls, archive boxes, slabs and lifts.
 * Colleagues, interns, video calls and traps move on or cycle, so they never trap
 * anyone for good. A robot vacuum counts only when it is shut in its stretch of
 * floor by walls (it turns at walls and edges, so it is always there): then its
 * springboard (src/game/enemies.js) is a way out if it reaches; a vacuum that can roam
 * off is a bonus, never an exit. Badge readers count as read.
 *
 * @typedef {import('../src/game/sim.js').Sim} Sim
 * @typedef {import('../src/data/levels/index.js').Level} Level
 * @typedef {{sim: Sim, next: Set<string>, good: boolean}} Node
 */

const HEROES = /** @type {const} */ (['kevin', 'charline']);
const KEEP = new Set(['lift', 'crate', 'loose', 'key', 'exit', 'boss']);
/** @type {number[]} */
const BLOCKS = [TILE.SOLID, TILE.CRATE, TILE.LOOSE, TILE.DOOR];
const IDLE = { left: false, right: false, up: false, down: false, jump: false, fire: false };
/** Moves tried from each resting place (the solver's, without its fine steps). */
const TRIED = MOVES.filter((m) => !['pause', 'stepL', 'stepR'].includes(m.name));

/** @param {Level} level @param {'kevin'|'charline'} hero */
function bare(level, hero) {
  const s = createSim(level, hero);
  /** @param {number} c @param {number} r */
  const solid = (c, r) => BLOCKS.includes(tileAt(s, c, r));
  /** Walled in on its floor: walls at both ends of the floor it rolls on. @param {import('../src/game/world.js').Thing} t */
  const shutIn = (t) => {
    const r = Math.round(t.y);
    for (const d of [-1, 1]) {
      let c = Math.floor(t.x);
      while (!solid(c + d, r) && solid(c + d, r - 1)) c += d;
      if (!solid(c + d, r)) return false;
    }
    return true;
  };
  s.things = s.things.filter((t) => KEEP.has(t.kind) || (t.kind === 'vacuum' && shutIn(t)));
  s.doorOpen = true;
  s.ammo = 9;
  return s;
}

/** A resting place: where, how, and what nearby has changed (lifts' phase, boxes, slabs). @param {Sim} s */
function key(s) {
  const h = s.hero;
  let k = `${Math.round(h.x * 2)},${Math.round(h.y * 2)},${h.state === 'hang' ? 'h' : 'g'}`;
  for (const t of s.things) {
    if (Math.abs(t.x - h.x) >= 9) continue;
    if (t.kind === 'lift') k += `L${Math.floor(((s.time / (t.home ?? 5)) % 1) * 12)}`;
    else if (t.kind === 'vacuum') k += `V${Math.round(t.x)}${Math.sign(t.vx)}`;
    else if (t.kind === 'crate' || t.kind === 'loose')
      k += t.alive && t.state[0] === 'i' ? '1' : '0';
  }
  return k;
}

/**
 * Plays a move, then lets the hero settle. False when it ends in a lethal fall.
 * @param {Sim} s @param {import('../src/game/solver.js').Move} move
 */
function play(s, move) {
  for (const f of move.frames) {
    step(s, f);
    if (s.hero.state === 'dead') return false;
  }
  for (let i = 0; i < 180; i++) {
    const st = s.hero.state;
    if ((st === 'ground' || st === 'hang') && Math.abs(s.hero.vx) < 0.5) break;
    step(s, IDLE);
    if (s.hero.state === 'dead') return false;
  }
  return true;
}

/**
 * Resting places reachable from `start` that lead neither to `goal` nor to a lethal fall.
 * @param {Sim} start @param {(s: Sim) => boolean} goal
 */
function stuckPlaces(start, goal) {
  /** @type {Map<string, Node>} */
  const nodes = new Map();
  const k0 = key(start);
  nodes.set(k0, { sim: start, next: new Set(), good: false });
  const todo = [k0];
  while (todo.length) {
    const node = /** @type {Node} */ (nodes.get(/** @type {string} */ (todo.pop())));
    if (goal(node.sim)) {
      node.good = true;
      continue;
    }
    const hanging = node.sim.hero.state === 'hang';
    for (const move of TRIED) {
      if (hanging !== (move.name === 'climb' || move.name === 'drop')) continue;
      const s = structuredClone(node.sim);
      // A lethal fall sends the hero back to a badge: a way out.
      if (!play(s, move) || goal(s)) {
        node.good = true;
        continue;
      }
      const k = key(s);
      node.next.add(k);
      if (!nodes.has(k)) {
        nodes.set(k, { sim: s, next: new Set(), good: false });
        todo.push(k);
      }
    }
  }
  // Back from the good places: whatever leads to one is good too.
  /** @type {Map<string, string[]>} */
  const prev = new Map();
  for (const [k, n] of nodes) for (const to of n.next) prev.set(to, [...(prev.get(to) ?? []), k]);
  const queue = [...nodes].filter(([, n]) => n.good).map(([k]) => k);
  while (queue.length)
    for (const p of prev.get(/** @type {string} */ (queue.pop())) ?? []) {
      const n = /** @type {Node} */ (nodes.get(p));
      if (!n.good) {
        n.good = true;
        queue.push(p);
      }
    }
  const stuck = [...nodes.values()]
    .filter((n) => !n.good)
    .map((n) => `${Math.floor(n.sim.hero.x)},${Math.round(n.sim.hero.y)}`);
  return { places: nodes.size, stuck: [...new Set(stuck)] };
}

describe.each(LEVELS)('$name', (level) => {
  it.each(HEROES)(
    '%s can never get stuck in the scenery',
    (hero) => {
      const arena = level.boss?.arena[0];
      const key = createSim(level, hero).things.find((t) => t.kind === 'key');
      // On the way to the key (or into the arena, or to the exit)…
      const first = stuckPlaces(bare(level, hero), (s) =>
        arena !== undefined ? s.hero.x > arena + 1 : key ? s.hasKey : s.won,
      );
      expect(first.stuck, `${level.id} ${hero}: stuck at (column,row)`).toEqual([]);
      if (arena !== undefined || !key) return;
      // …and with the key, on the way to the exit (back across the stage at the break room).
      const back = bare(level, hero);
      back.hasKey = true;
      back.things = back.things.filter((t) => t.kind !== 'key');
      Object.assign(back.hero, { x: key.x - 0.3, y: Math.floor(key.y) });
      const second = stuckPlaces(back, (s) => s.won);
      expect(second.stuck, `${level.id} ${hero} with the key: stuck at (column,row)`).toEqual([]);
    },
    900_000,
  );
});

describe('the stuck-place search', () => {
  it('finds a safe pit with no way out', () => {
    // Floors at row 8 on both sides of a pit five tiles deep: Kévin cannot climb out.
    const map = Array.from({ length: 12 }, (_, row) => {
      const y = 11 - row;
      return Array.from({ length: 30 }, (_, c) => {
        if (y <= 2 || y === 11 || c === 0 || c === 29) return '#';
        if (y < 8 && (c < 10 || c > 13)) return '#';
        if (y === 8) return c === 2 ? 'S' : c === 26 ? 'E' : ' ';
        return ' ';
      }).join('');
    });
    const level = /** @type {Level} */ (/** @type {unknown} */ ({ map }));
    const start = bare(level, 'kevin');
    start.hasKey = true;
    expect(stuckPlaces(start, (s) => s.won).stuck.length).toBeGreaterThan(0);
    // Charline's double jump gets her out.
    const her = bare(level, 'charline');
    her.hasKey = true;
    expect(stuckPlaces(her, (s) => s.won).stuck).toEqual([]);
  });
});

describe('the tutorial (car park)', () => {
  it('lets both heroes climb out of every safe floor by a step of three tiles at most', () => {
    // Every stretch of floor (not cables) has an easy way on: an open edge to drop
    // from, a wall of 1 to 3 tiles, or a ledge at most 3 tiles above. No lift or
    // springboard needed, no 4-tile grab.
    const s = createSim(LEVELS[0], 'kevin');
    /** @param {number} c @param {number} r */
    const solid = (c, r) => r >= s.h || BLOCKS.includes(tileAt(s, c, r));
    /** @param {number} c @param {number} r */
    const cables = (c, r) => tileAt(s, c, r) === TILE.HAZARD;
    /** @param {number} c @param {number} y */
    const stand = (c, y) =>
      y > 0 && y < s.h - 1 && solid(c, y - 1) && !solid(c, y) && !solid(c, y + 1) && !cables(c, y);
    const hard = [];
    const seen = new Set();
    for (let y = 1; y < s.h - 1; y++)
      for (let c = 1; c < s.w - 1; c++) {
        if (!stand(c, y) || seen.has(`${c},${y}`) || cables(c, y - 1)) continue;
        let b = c;
        while (stand(b + 1, y)) b++;
        for (let k = c; k <= b; k++) seen.add(`${k},${y}`);
        let best = 99;
        for (const e of [c - 1, b + 1]) {
          let h = 0;
          while (y + h < s.h && solid(e, y + h)) h++;
          best = Math.min(best, h);
        }
        for (let k = c - 1; k <= b + 1; k++)
          for (let h = 2; h <= 3; h++) if (stand(k, y + h)) best = Math.min(best, h);
        if (best > 3) hard.push(`${c}-${b} at row ${y}`);
      }
    expect(hard).toEqual([]);
  });
});
