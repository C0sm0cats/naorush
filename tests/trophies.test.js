import { beforeEach, describe, expect, it } from 'vitest';
import { Medals } from '../src/app/medals.js';
import { secretsFound } from '../src/app/results.js';
import { TROPHIES, Trophies } from '../src/app/trophies.js';
import { LEVELS } from '../src/data/levels/index.js';

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

describe('the round-ten trophies', () => {
  it('number twenty, each with its own id', () => {
    const ids = TROPHIES.map((t) => t.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it('reward a secret on every stage with one hero', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const kevin = sim({ heroId: 'kevin', secrets: 1, secretTotal: 2 });
    for (const [i, level] of LEVELS.entries()) {
      expect(got).not.toContain('kevinSecrets');
      t.event({ type: 'secret', x: 10.5 + i, y: 0 }, kevin, level.id);
    }
    expect(got).toContain('kevinSecrets');
    expect(got).not.toContain('charlineSecrets');
    // Each hero's notebook (the one the results card reads) fills as secrets are found.
    expect(secretsFound('parking', 'kevin')).toBe(1);
    expect(secretsFound('parking', 'charline')).toBe(0);
    t.event({ type: 'secret', x: 10.5, y: 0 }, kevin, 'parking');
    expect(secretsFound('parking', 'kevin')).toBe(1);
  });

  it('crown both directors convinced without a hit in one run', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const julien = sim({
      heroId: 'kevin',
      bossActive: true,
      deaths: 0,
      boss: { id: 'techServicesDirector', hp: 4, arena: [0, 1] },
    });
    const rodolphe = sim({
      heroId: 'kevin',
      bossActive: true,
      deaths: 0,
      boss: { id: 'regionalDirector', hp: 5, arena: [0, 1] },
    });
    const flawless = (/** @type {typeof julien} */ s, /** @type {string} */ id) => {
      t.event({ type: 'bossStart', x: 0, y: 0 }, s, id);
      t.event({ type: 'bossDone', x: 0, y: 0 }, s, id);
      t.stageWon(s, id, id === 'rooftop');
    };
    flawless(julien, 'ts');
    t.stageWon(julien, 'copil', false);
    flawless(rodolphe, 'rooftop');
    expect(got).toContain('bosses');
  });

  it('need the run unbroken: a hit or another stage in between ends it', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const julien = sim({
      heroId: 'kevin',
      bossActive: true,
      deaths: 0,
      boss: { id: 'techServicesDirector', hp: 4, arena: [0, 1] },
    });
    const rodolphe = sim({
      heroId: 'kevin',
      bossActive: true,
      deaths: 0,
      boss: { id: 'regionalDirector', hp: 5, arena: [0, 1] },
    });
    t.event({ type: 'bossStart', x: 0, y: 0 }, julien, 'ts');
    t.event({ type: 'bossDone', x: 0, y: 0 }, julien, 'ts');
    t.stageWon(julien, 'parking', false);
    t.stageWon(julien, 'copil', false);
    t.event({ type: 'bossStart', x: 0, y: 0 }, rodolphe, 'rooftop');
    t.event({ type: 'bossDone', x: 0, y: 0 }, rodolphe, 'rooftop');
    expect(got).not.toContain('bosses');
    // Julien flawless, COPIL won, but Rodolphe lands a hit.
    t.event({ type: 'bossStart', x: 0, y: 0 }, julien, 'ts');
    t.event({ type: 'bossDone', x: 0, y: 0 }, julien, 'ts');
    t.stageWon(julien, 'copil', false);
    // The run is saved: a reload in the middle keeps it.
    const later = new Trophies((x) => got.push(x.id));
    later.event({ type: 'bossStart', x: 0, y: 0 }, rodolphe, 'rooftop');
    later.event({ type: 'hurt', x: 0, y: 0 }, rodolphe, 'rooftop');
    later.event({ type: 'bossDone', x: 0, y: 0 }, rodolphe, 'rooftop');
    expect(got).not.toContain('bosses');
    expect(later.data.run).toBe('');
  });

  it('reward gold on every stage with the same hero', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const medals = new Medals();
    const won = sim({ heroId: 'charline', deaths: 0 });
    for (const level of LEVELS) {
      expect(got).not.toContain('golds');
      medals.record(level.id, 'charline', { tier: 'gold', star: false });
      t.stageWon(won, level.id, false, medals);
    }
    expect(got).toContain('golds');
  });

  it('load an older save without the new parts', () => {
    localStorage.setItem(
      'naorush.trophies',
      JSON.stringify({ got: { badge: true }, secrets: ['parking:12'], run: 'oops' }),
    );
    const t = new Trophies(() => {});
    expect(t.data.secrets).toEqual(['parking:12']);
    expect(t.data.run).toBe('');
    expect(
      t
        .list()
        .filter((x) => x.got)
        .map((x) => x.id),
    ).toEqual(['badge']);
  });
});
