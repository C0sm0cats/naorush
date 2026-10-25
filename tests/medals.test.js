import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GOLD,
  Medals,
  REFERENCE,
  SILVER,
  applySansFilet,
  medalFor,
  medalTargets,
  modeOf,
  recordKey,
} from '../src/app/medals.js';
import { chapterRows } from '../src/app/menus.js';
import { CAMPAIGN, LEVELS } from '../src/data/levels/index.js';
import { createSim, step } from '../src/game/sim.js';
import { solve } from '../src/game/solver.js';

/** @type {Record<string, string>} */
let saved = {};
/** In-memory stand-in for the browser's localStorage. */
beforeEach(() => {
  saved = {};
  Object.assign(globalThis, {
    localStorage: {
      getItem: (/** @type {string} */ k) => saved[k] ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => (saved[k] = v),
    },
  });
});

const HEROES = /** @type {const} */ (['kevin', 'charline']);

describe('medals', () => {
  it('reward a time against the solver’s: gold, silver, bronze, and a star without a return', () => {
    const t = /** @type {{gold: number, silver: number}} */ (medalTargets('parking', 'charline'));
    const ref = REFERENCE.parking.charline;
    expect(t).toEqual({ gold: Math.round(ref * GOLD), silver: Math.round(ref * SILVER) });
    expect(medalFor('parking', 'charline', t.gold - 0.01, 0)).toEqual({ tier: 'gold', star: true });
    expect(medalFor('parking', 'charline', t.gold, 1)).toEqual({ tier: 'silver', star: false });
    expect(medalFor('parking', 'charline', t.silver, 0)).toEqual({ tier: 'bronze', star: true });
    expect(medalFor('nowhere', 'kevin', 1, 0)).toEqual({ tier: 'bronze', star: true });
  });

  it('give only a bronze to a run in relaxed mode or slowed down', () => {
    expect(medalFor('parking', 'kevin', 5, 0, true)).toEqual({ tier: 'bronze', star: false });
  });

  it('keep the best medal and the star, from different runs if need be', () => {
    const m = new Medals();
    const silver = /** @type {{silver: number}} */ (medalTargets('lcp7', 'kevin')).silver;
    const first = m.record('lcp7', 'kevin', medalFor('lcp7', 'kevin', silver - 1, 2));
    expect(first).toEqual({ best: { tier: 'silver', star: false }, improved: true });
    const star = medalFor('lcp7', 'kevin', silver + 9, 0);
    expect(m.record('lcp7', 'kevin', star)).toEqual({
      best: { tier: 'silver', star: true },
      improved: true,
    });
    expect(m.record('lcp7', 'kevin', star).improved).toBe(false);
    // Saved, and read back by the next session.
    expect(new Medals().get('lcp7', 'kevin')).toEqual({ tier: 'silver', star: true });
    expect(new Medals().get('lcp7', 'charline')).toBeUndefined();
  });

  it('keep « Sans filet » apart, and count its golds for the full set', () => {
    const m = new Medals();
    const ids = ['parking', 'lcp7'];
    m.record('parking', 'kevin', { tier: 'gold', star: true }, 'sansFilet');
    expect(m.get('parking', 'kevin')).toBeUndefined();
    expect(m.get('parking', 'kevin', 'sansFilet')?.tier).toBe('gold');
    expect(recordKey('parking', 'kevin', 'sansFilet')).toBe('parking:kevin:sansfilet');
    expect(recordKey('parking', 'kevin')).toBe('parking:kevin');
    expect(m.allGold('kevin', ids)).toBe(false);
    m.record('lcp7', 'kevin', { tier: 'gold', star: false });
    expect(m.allGold('kevin', ids)).toBe(true);
    expect(m.allGold('charline', ids)).toBe(false);
  });

  it('start empty on an old save and skip damaged entries', () => {
    saved['naorush.medals'] = JSON.stringify({
      'parking:kevin': { tier: 'gold', star: false },
      'lcp7:kevin': { tier: 'platinum', star: true },
      'ts:kevin': 'gold',
    });
    expect(new Medals().data).toEqual({ 'parking:kevin': { tier: 'gold', star: false } });
    saved['naorush.medals'] = '{oops';
    expect(new Medals().data).toEqual({});
  });
});

describe('« Sans filet »', () => {
  it('leaves one heart and no coffee, with the simulation’s hardcore rules', () => {
    const level = /** @type {import('../src/data/levels/index.js').Level} */ (
      LEVELS.find((l) => l.id === 'rooftop')
    );
    const sim = createSim(level, 'kevin');
    sim.assist = true;
    expect(sim.things.some((t) => t.kind === 'cup' && t.alive)).toBe(true);
    applySansFilet(sim);
    expect(sim.hero.hearts).toBe(1);
    expect(sim.maxHearts).toBe(1);
    expect(sim.assist).toBe(false);
    expect(sim.things.some((t) => t.kind === 'cup' && t.alive)).toBe(false);
    // The simulation's own rules: faster traps, shorter PRIMO windows.
    expect(sim.hardcore).toBe(true);
    expect(modeOf(sim)).toBe('sansFilet');
    expect(modeOf(createSim(level, 'kevin'))).toBe('normal');
  });
});

describe('chapters', () => {
  /** @param {Partial<Parameters<typeof chapterRows>[0]>} o */
  const rows = (o) =>
    chapterRows({
      levels: LEVELS,
      campaign: CAMPAIGN,
      progress: 0,
      finished: false,
      bests: {},
      medals: new Medals(),
      secretsOf: () => 0,
      mode: 'normal',
      ...o,
    });

  it('open the stages cleared so far, and the bonus stages after the credits', () => {
    expect(rows({ progress: 2 }).map((c) => c.open)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(rows({ finished: true }).every((c) => c.open)).toBe(true);
    // A record (an older save) or a medal opens a stage too.
    expect(rows({ bests: { 'pause:charline': 30 } })[6].open).toBe(true);
    const locked = rows({})[3];
    expect(locked).toMatchObject({
      open: false,
      label: 'Étape 4',
      lock: 'Termine l’étape 3 pour l’ouvrir.',
    });
    expect(rows({})[5]).toMatchObject({ label: 'Bonus', name: 'Intercontrat' });
  });

  it('show each hero’s record, medal and secrets for the chosen mode', () => {
    const medals = new Medals();
    medals.record('parking', 'kevin', medalFor('parking', 'kevin', 10, 0));
    medals.record('parking', 'kevin', medalFor('parking', 'kevin', 99, 1), 'sansFilet');
    const o = {
      progress: 1,
      bests: { 'parking:kevin': 10, 'parking:kevin:sansfilet': 99 },
      medals,
      secretsOf: (/** @type {string} */ id, /** @type {string} */ h) =>
        id === 'parking' && h === 'kevin' ? 1 : 0,
    };
    const normal = rows(o)[0];
    expect(normal.secretTotal).toBe(2);
    expect(normal.heroes.kevin).toMatchObject({ best: 10, secrets: 1, medal: { tier: 'gold' } });
    expect(normal.heroes.charline).toMatchObject({ best: undefined, medal: undefined });
    expect(normal.heroes.charline.targets).toEqual(medalTargets('parking', 'charline'));
    const hard = rows({ ...o, mode: 'sansFilet' })[0];
    expect(hard.heroes.kevin).toMatchObject({ best: 99, medal: { tier: 'bronze', star: false } });
  });
});

/**
 * The medal yardstick follows the solver: the same search as the « can finish it »
 * proofs in tests/level.test.js. When a stage or the physics change, the route
 * changes, and this fails with the new table to paste into src/app/medals.js.
 */
describe('reference times', () => {
  /** Drift allowed before the table must be refreshed. */
  const TOLERANCE = 0.1;
  /** @type {Record<string, Record<string, number>>} */
  const now = {};
  let drifted = false;

  it('cover every stage and both heroes', () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(LEVELS.map((l) => l.id).sort());
    for (const id of Object.keys(REFERENCE))
      for (const hero of HEROES) expect(REFERENCE[id][hero]).toBeGreaterThan(0);
  });

  describe.each(LEVELS)('$id', (level) => {
    it.each(HEROES)(
      '%s: the solver’s route takes the reference time',
      (hero) => {
        const result = solve(createSim(level, hero), {
          maxNodes: 200000,
          allowDamage: Boolean(level.boss),
        });
        expect(result.won).toBe(true);
        const sim = createSim(level, hero);
        for (const input of result.inputs) step(sim, input);
        expect(sim.won).toBe(true);
        (now[level.id] ??= {})[hero] = Math.round(sim.time * 10) / 10;
        const ref = REFERENCE[level.id]?.[hero] ?? 0;
        const ok = Math.abs(sim.time - ref) <= ref * TOLERANCE;
        if (!ok) drifted = true;
        const why = `${level.id}/${hero} took ${sim.time.toFixed(1)} s, reference ${ref} s: refresh REFERENCE in src/app/medals.js`;
        expect(ok, why).toBe(true);
      },
      level.boss ? 900_000 : 300_000,
    );
  });

  afterAll(() => {
    if (!drifted) return;
    const table = LEVELS.map((l) => {
      const t = { ...REFERENCE[l.id], ...now[l.id] };
      return `  ${l.id}: { kevin: ${t.kevin}, charline: ${t.charline} },`;
    }).join('\n');
    console.info(`New REFERENCE for src/app/medals.js:\n{\n${table}\n}`);
  });
});
