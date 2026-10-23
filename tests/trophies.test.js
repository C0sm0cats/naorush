import { beforeEach, describe, expect, it } from 'vitest';
import { Trophies } from '../src/app/trophies.js';

/** In-memory stand-in for the browser's localStorage. */
beforeEach(() => {
  /** @type {Record<string, string>} */
  const store = {};
  Object.assign(globalThis, {
    localStorage: {
      getItem: (/** @type {string} */ k) => store[k] ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => (store[k] = v),
    },
  });
});

/** @param {Partial<import('../src/game/sim.js').Sim>} o */
const sim = (o) => /** @type {import('../src/game/sim.js').Sim} */ (/** @type {unknown} */ (o));

describe('trophies', () => {
  it('unlocks a boss trophy only for a flawless fight', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const s = sim({ bossActive: true, boss: { id: 'regionalDirector', hp: 5, arena: [0, 1] } });
    t.event({ type: 'bossStart', x: 0, y: 0 }, s, 'rooftop');
    t.event({ type: 'hurt', x: 0, y: 0 }, s, 'rooftop');
    t.event({ type: 'bossDone', x: 0, y: 0 }, s, 'rooftop');
    expect(got).not.toContain('rodolphe');
    t.event({ type: 'bossStart', x: 0, y: 0 }, s, 'rooftop');
    t.event({ type: 'bossDone', x: 0, y: 0 }, s, 'rooftop');
    expect(got).toContain('rodolphe');
  });

  it('counts across sessions and unlocks once', () => {
    /** @type {string[]} */
    const got = [];
    for (let i = 0; i < 15; i++)
      new Trophies((x) => got.push(x.id)).event({ type: 'parry', x: 0, y: 0 }, sim({}), 'ts');
    expect(got).toEqual(['parry']);
  });

  it('rewards finishing the game with each hero', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    t.stageWon(sim({ heroId: 'charline', deaths: 2 }), 'rooftop', true);
    expect(got).toEqual(['nao', 'charline']);
  });
});
