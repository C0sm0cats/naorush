import { beforeEach, describe, expect, it } from 'vitest';
import { Medals } from '../src/app/medals.js';
import { secretsFound } from '../src/app/results.js';
import { TROPHIES, Trophies } from '../src/app/trophies.js';
import { CAMPAIGN, LEVELS } from '../src/data/levels/index.js';

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
    const fight = () =>
      sim({ bossActive: true, boss: { id: 'regionalDirector', hp: 5, arena: [0, 1] } });
    const s = fight();
    t.event({ type: 'bossStart', x: 0, y: 0 }, s, 'rooftop');
    t.event({ type: 'hurt', x: 0, y: 0 }, s, 'rooftop');
    t.event({ type: 'bossDone', x: 0, y: 0 }, s, 'rooftop');
    expect(got).not.toContain('rodolphe');
    // A new attempt (replaying the stage: a fresh simulation) starts clean.
    const again = fight();
    t.event({ type: 'bossStart', x: 0, y: 0 }, again, 'rooftop');
    t.event({ type: 'bossDone', x: 0, y: 0 }, again, 'rooftop');
    expect(got).toContain('rodolphe');
  });

  it('counts the hits before a respawn in the same duel', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const s = sim({ bossActive: true, boss: { id: 'techServicesDirector', hp: 4, arena: [0, 1] } });
    t.event({ type: 'bossStart', x: 0, y: 0 }, s, 'ts');
    t.event({ type: 'zap', x: 0, y: 0 }, s, 'ts');
    // Back at the badge, back in the arena: a clean rematch is not « without a hit ».
    t.event({ type: 'respawn', x: 0, y: 0 }, s, 'ts');
    t.event({ type: 'bossStart', x: 0, y: 0 }, s, 'ts');
    t.event({ type: 'bossDone', x: 0, y: 0 }, s, 'ts');
    expect(got).not.toContain('julien');
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
  it('number twenty-two, each with its own id', () => {
    const ids = TROPHIES.map((t) => t.id);
    expect(ids).toHaveLength(22);
    expect(new Set(ids).size).toBe(22);
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
      t.stageWon(s, id, id === 'rooftop', undefined, story);
    };
    let story = false;
    // Chapitres: never « in one game ».
    flawless(julien, 'ts');
    t.stageWon(julien, 'copil', false);
    flawless(rodolphe, 'rooftop');
    expect(got).not.toContain('bosses');
    story = true;
    t.newRun();
    flawless(julien, 'ts');
    t.stageWon(julien, 'copil', false, undefined, true);
    flawless(rodolphe, 'rooftop');
    expect(got).toContain('bosses');
  });

  it('need the run unbroken: a hit, another stage or a new game in between ends it', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const duel = (/** @type {string} */ id) =>
      sim({
        heroId: 'kevin',
        bossActive: true,
        deaths: 0,
        boss: {
          id: id === 'ts' ? 'techServicesDirector' : 'regionalDirector',
          hp: 4,
          arena: [0, 1],
        },
      });
    /** @param {Trophies} tr @param {string} id @param {boolean} [hit] */
    const fight = (tr, id, hit = false) => {
      const s = duel(id);
      tr.event({ type: 'bossStart', x: 0, y: 0 }, s, id);
      if (hit) tr.event({ type: 'hurt', x: 0, y: 0 }, s, id);
      tr.event({ type: 'bossDone', x: 0, y: 0 }, s, id);
      tr.stageWon(s, id, false, undefined, true);
    };
    t.newRun();
    fight(t, 'ts');
    t.stageWon(duel('parking'), 'parking', false, undefined, true);
    t.stageWon(duel('copil'), 'copil', false, undefined, true);
    fight(t, 'rooftop');
    expect(got).not.toContain('bosses');
    // Julien flawless, COPIL won, but Rodolphe lands a hit.
    t.newRun();
    fight(t, 'ts');
    t.stageWon(duel('copil'), 'copil', false, undefined, true);
    fight(t, 'rooftop', true);
    expect(got).not.toContain('bosses');
    // Julien and the COPIL in one session; « Continuer » the next day starts a new game.
    t.newRun();
    fight(t, 'ts');
    t.stageWon(duel('copil'), 'copil', false, undefined, true);
    const later = new Trophies((x) => got.push(x.id));
    later.newRun();
    fight(later, 'rooftop');
    expect(got).not.toContain('bosses');
    expect(later.data.run).toBe('');
    // « Sans filet » or the daily on the way ends it too.
    t.newRun();
    fight(t, 'ts');
    t.stageWon(
      sim({ heroId: 'kevin', deaths: 0, hardcore: true }),
      'copil',
      false,
      undefined,
      true,
    );
    fight(t, 'rooftop');
    expect(got).not.toContain('bosses');
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

  it('reward a stage finished « Sans filet »', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    t.stageWon(sim({ heroId: 'kevin', deaths: 1 }), 'lcp7', false);
    expect(got).not.toContain('sansFilet');
    t.stageWon(sim({ heroId: 'kevin', deaths: 1, hardcore: true }), 'lcp7', false);
    expect(got).toContain('sansFilet');
  });

  it('reward the star on every story stage with the same hero, from either mode', () => {
    /** @type {string[]} */
    const got = [];
    const t = new Trophies((x) => got.push(x.id));
    const medals = new Medals();
    const won = sim({ heroId: 'kevin', deaths: 0 });
    const story = LEVELS.slice(0, CAMPAIGN);
    for (const [i, level] of story.entries()) {
      expect(got).not.toContain('stars');
      // Charline's stars don't help Kévin's set.
      medals.record(level.id, 'charline', { tier: 'bronze', star: i < CAMPAIGN - 1 });
      medals.record(level.id, 'kevin', { tier: 'bronze', star: true }, i ? 'normal' : 'sansFilet');
      t.stageWon(won, level.id, false, medals);
    }
    expect(got).toContain('stars');
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
