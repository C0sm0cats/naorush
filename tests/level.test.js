import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels/index.js';
import { LCP7 } from '../src/data/levels/lcp7.js';
import { TILE, createSim, step, tileAt } from '../src/game/sim.js';
import { solve } from '../src/game/solver.js';

const HEROES = /** @type {const} */ (['kevin', 'charline']);

describe.each(LEVELS)('$name', (level) => {
  it.each(HEROES)('%s can finish it', (hero) => {
    const result = solve(createSim(level, hero), {
      maxNodes: 200000,
      allowDamage: Boolean(level.boss),
    });
    expect(result.won).toBe(true);
    // Replaying the found inputs on a fresh simulation reaches the exit too.
    const sim = createSim(level, hero);
    for (const input of result.inputs) step(sim, input);
    expect(sim.won).toBe(true);
  });

  it('has no two-tile walls (too high to jump, too low to hang from)', () => {
    const sim = createSim(level, 'kevin');
    /** @param {number} c @param {number} r */
    const solid = (c, r) => tileAt(sim, c, r) === TILE.SOLID;
    const walls = [];
    for (let c = 1; c < sim.w - 1; c++)
      for (let r = 2; r < sim.h - 2; r++) {
        // A ledge top at r + 1 with headroom…
        if (!solid(c, r) || solid(c, r + 1) || solid(c, r + 2)) continue;
        // …next to a floor exactly two tiles lower, with room to stand.
        for (const side of [-1, 1])
          if (
            solid(c + side, r - 2) &&
            tileAt(sim, c + side, r - 1) === TILE.EMPTY &&
            !solid(c + side, r)
          )
            walls.push(`${c},${r}`);
      }
    expect(walls).toEqual([]);
  });

  it('keeps every row the same width', () => {
    expect(level.map.length).toBe(12);
    expect(new Set(level.map.map((r) => r.length)).size).toBe(1);
  });
});

describe('the colleague in a call', () => {
  it('cannot be passed without throwing a CR', async () => {
    const sim = createSim(LCP7, 'kevin');
    sim.ammo = 0;
    sim.things = sim.things.filter((t) => t.kind !== 'ammo');
    expect(solve(sim, { maxNodes: 20000 }).won).toBe(false);
  });
});
