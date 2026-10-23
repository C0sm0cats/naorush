import { describe, expect, it } from 'vitest';
import { SLICE } from '../src/data/slice.js';
import { createSim, step } from '../src/game/sim.js';
import { solve } from '../src/game/solver.js';

describe('LCP7 slice', () => {
  it.each(/** @type {const} */ (['kevin', 'charline']))(
    '%s can finish without taking a hit',
    (hero) => {
      const result = solve(createSim(SLICE, hero));
      expect(result.won).toBe(true);
      // Replaying the found inputs on a fresh simulation reaches the exit too.
      const sim = createSim(SLICE, hero);
      for (const input of result.inputs) step(sim, input);
      expect(sim.won).toBe(true);
    },
  );

  it('keeps every row the same width', () => {
    expect(new Set(SLICE.map.map((r) => r.length)).size).toBe(1);
  });
});

describe('the colleague in a call', () => {
  it('cannot be passed without throwing a CR', async () => {
    const sim = createSim(SLICE, 'kevin');
    sim.ammo = 0;
    sim.things = sim.things.filter((t) => t.kind !== 'ammo');
    expect(solve(sim, { maxNodes: 20000 }).won).toBe(false);
  });
});
