import { describe, expect, it } from 'vitest';
import { LCP7 } from '../src/data/levels/lcp7.js';
import { createSim } from '../src/game/sim.js';
import { hurt } from '../src/game/world.js';
import { IDLE, fill, input, room, run, runUntil, sim } from './mechanics-kit.js';

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

describe('things on another floor', () => {
  it('a badge, a reader, a valve or a secret above the ceiling are not triggered from below', () => {
    for (const ch of ['C', 'p', 'k', '*']) {
      // A one-tile-thick floor (y = 5) with the thing on it, the hero walking underneath.
      const s = sim(room(16, [['S', 2, 3], ...fill('#', 5, 12, 5, 5), [ch, 8, 6]]));
      const events = run(s, input({ right: true }), 120);
      expect(s.hero.x, ch).toBeGreaterThan(11);
      expect(
        events.filter((e) => ['checkpoint', 'door', 'switch', 'secret'].includes(e.type)),
        ch,
      ).toEqual([]);
    }
  });
});

describe('the void', () => {
  it('a gap in an open stage’s floor is a drop into the void, not a hidden floor', () => {
    // Rooftop-style stage: no floor under column 6, open to the sky.
    const def = room(
      12,
      [
        ['S', 2, 3],
        ['#', 0, 11],
      ],
      { open: true },
    );
    def.map = def.map.map((row, i) => (i >= 9 ? `${row.slice(0, 6)} ${row.slice(7)}` : row));
    const s = sim(def);
    Object.assign(s.hero, { x: 6.19, y: 3.2, state: 'air' });
    // Holding down: no grabbing the sides of the shaft on the way.
    const r = runUntil(s, input({ down: true }), (x) => x.hero.state === 'dead', 120);
    expect(r.ok).toBe(true);
    expect(s.deaths).toBe(1);
  });
});

describe('respawn', () => {
  it('always gives back at least one CR, so nobody is stuck behind a colleague in a call', () => {
    const s = sim(room(12, [['S', 2, 3]]));
    s.ammo = 0;
    s.hero.state = 'dead';
    s.hero.stateTime = 0;
    runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200);
    expect(s.ammo).toBe(1);
  });
});

describe('relaxed mode and lethal hazards', () => {
  it('sends you back to the badge without costing a heart, so never a game over', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['^', 8, 2],
      ]),
    );
    s.assist = true;
    const hearts = s.hero.hearts;
    for (let i = 0; i < 5; i++) {
      Object.assign(s.hero, { x: 8.19, y: 3, vx: 0, vy: 0, state: 'ground', invuln: 0 });
      expect(runUntil(s, IDLE, (x) => x.hero.state === 'dead', 10).ok).toBe(true);
      expect(runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200).ok).toBe(true);
      expect(s.hero.x).toBeCloseTo(2.2, 5);
    }
    expect(s.deaths).toBe(5);
    expect(s.gameOver).toBe(false);
    expect(s.hero.hearts).toBe(hearts);
  });
});
