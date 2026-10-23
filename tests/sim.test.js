import { describe, expect, it } from 'vitest';
import { LCP7 } from '../src/data/levels/lcp7.js';
import { createSim } from '../src/game/sim.js';
import { hurt } from '../src/game/world.js';

describe('relaxed mode', () => {
  it('keeps hearts on ordinary hits but still sends you back on live cables', () => {
    const sim = createSim(LCP7, 'charline');
    sim.assist = true;
    hurt(sim, sim.hero, 'kpi');
    expect(sim.hero.hearts).toBe(3);
    sim.hero.invuln = 0;
    hurt(sim, sim.hero, 'cables');
    expect(sim.hero.state).toBe('dead');
  });

  it('is off by default', () => {
    const sim = createSim(LCP7, 'kevin');
    hurt(sim, sim.hero, 'kpi');
    expect(sim.hero.hearts).toBe(3);
  });
});
