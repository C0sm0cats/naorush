import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels/index.js';
import { LCP7 } from '../src/data/levels/lcp7.js';
import { createSim, step } from '../src/game/sim.js';
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
