import { describe, expect, it } from 'vitest';
import {
  TWISTS,
  UNFIT,
  applyTwist,
  dailyChallenge,
  dailyFor,
  dailyKicker,
  dailyLimit,
  dailyMet,
  dailyStages,
  shareCard,
  twistFits,
} from '../src/app/daily.js';
import { medalTargets } from '../src/app/medals.js';
import { LEVELS } from '../src/data/levels/index.js';
import { createSim, step } from '../src/game/sim.js';
import { solve } from '../src/game/solver.js';

const HEROES = /** @type {const} */ (['kevin', 'charline']);
/** @param {string} id */
const level = (id) =>
  /** @type {import('../src/data/levels/index.js').Level} */ (LEVELS.find((l) => l.id === id));
/** @param {import('../src/app/daily.js').TwistId} id @returns {import('../src/app/daily.js').Challenge} */
const challenge = (id) => ({
  key: '2026-10-25',
  stage: 0,
  hero: 'kevin',
  twist: /** @type {import('../src/app/daily.js').Twist} */ (TWISTS.find((t) => t.id === id)),
});

describe('daily challenge', () => {
  it('is the same for everyone on a given day and changes from day to day', () => {
    const a = dailyChallenge(5, new Date(2026, 9, 24, 8));
    expect(dailyChallenge(5, new Date(2026, 9, 24, 20))).toEqual(a);
    const week = Array.from({ length: 7 }, (_, i) =>
      JSON.stringify(dailyChallenge(5, new Date(2026, 9, 24 + i, 12))),
    );
    expect(new Set(week).size).toBeGreaterThan(3);
    expect(a.stage).toBeGreaterThanOrEqual(0);
    expect(a.stage).toBeLessThan(5);
  });

  it('only draws from the allowed stages', () => {
    for (let i = 0; i < 30; i++)
      expect([0, 1, 3]).toContain(dailyChallenge([0, 1, 3], new Date(2026, 9, 1 + i, 12)).stage);
  });

  it('deals every stage and every twist once per cycle, never twice in a row', () => {
    const stages = [0, 1, 3, 5, 6, 7];
    const days = Array.from({ length: 84 }, (_, i) =>
      dailyChallenge(stages, new Date(2026, 9, 1 + i, 12)),
    );
    for (let i = 1; i < days.length; i++) {
      expect(days[i].stage).not.toBe(days[i - 1].stage);
      expect(days[i].twist).not.toBe(days[i - 1].twist);
    }
    // Days since 1 January 2026: 273 is 1 October, a cycle start for six stages and seven twists.
    for (let k = 0; k < 12; k++)
      expect(new Set(days.slice(k * 7, k * 7 + 7).map((c) => c.twist.id)).size).toBe(7);
    for (let k = 0; k < 13; k++)
      expect(new Set(days.slice(k * 6 + 3, k * 6 + 9).map((c) => c.stage)).size).toBe(6);
    // A date before the epoch deals too.
    expect(stages).toContain(dailyChallenge(stages, new Date(2025, 5, 1, 12)).stage);
  });

  it('draws every stage without a boss, bonus stages included, with seven twists', () => {
    expect(TWISTS).toHaveLength(7);
    expect(new Set(TWISTS.map((t) => t.id)).size).toBe(7);
    const stages = dailyStages(LEVELS);
    expect(stages.map((i) => LEVELS[i].id)).toEqual([
      'parking',
      'lcp7',
      'copil',
      'intercontrat',
      'pause',
      'seminaire',
    ]);
    const year = Array.from({ length: 366 }, (_, i) =>
      dailyFor(LEVELS, new Date(2026, 0, 1 + i, 12)),
    );
    expect(new Set(year.map((c) => c.stage))).toEqual(new Set(stages));
    expect(new Set(year.map((c) => c.hero)).size).toBe(2);
    expect(new Set(year.map((c) => c.twist.id))).toEqual(new Set(TWISTS.map((t) => t.id)));
    // Never a draw that can't be done, or a twist with nothing to act on.
    for (const c of year) expect(twistFits(LEVELS[c.stage], c.hero, c.twist.id)).toBe(true);
  });

  it('moves on to the next twist when a draw is listed as unfit', () => {
    const date = new Date(2026, 9, 26, 12);
    const c = dailyFor(LEVELS, date);
    const key = `${LEVELS[c.stage].id}:${c.hero}:${c.twist.id}`;
    UNFIT.add(key);
    try {
      expect(twistFits(LEVELS[c.stage], c.hero, c.twist.id)).toBe(false);
      const next = dailyFor(LEVELS, date);
      expect([next.stage, next.hero]).toEqual([c.stage, c.hero]);
      const at = TWISTS.findIndex((t) => t.id === c.twist.id);
      expect(next.twist.id).toBe(TWISTS[(at + 1) % TWISTS.length].id);
    } finally {
      UNFIT.delete(key);
    }
  });

  it('applies each twist to a fresh simulation', () => {
    const fresh = () => createSim(level('lcp7'), 'kevin');
    const one = fresh();
    applyTwist(one, challenge('oneHeart'));
    expect([one.hero.hearts, one.maxHearts]).toEqual([1, 1]);
    const dry = fresh();
    applyTwist(dry, challenge('noAmmo'));
    expect(dry.ammo).toBe(0);
    const far = fresh();
    applyTwist(far, challenge('noCheckpoint'));
    expect(far.things.filter((t) => t.kind === 'checkpoint' && t.alive)).toEqual([]);
    const hard = fresh();
    applyTwist(hard, challenge('sansFilet'));
    expect([hard.hardcore, hard.hero.hearts]).toEqual([true, 1]);
    expect(hard.things.filter((t) => t.kind === 'cup' && t.alive)).toEqual([]);
    for (const id of /** @type {const} */ (['secret', 'chrono'])) {
      const plain = fresh();
      applyTwist(plain, challenge(id));
      expect(plain).toEqual(fresh());
    }
  });

  it('asks for the silver time on « chrono d’argent », and names it', () => {
    const c = challenge('chrono');
    const silver = /** @type {{silver: number}} */ (medalTargets('parking', 'kevin')).silver;
    expect(dailyLimit(c)).toBe(silver);
    expect(dailyMet(c, { secrets: 0, time: silver - 0.1 })).toBe(true);
    expect(dailyMet(c, { secrets: 0, time: silver })).toBe(false);
    expect(dailyKicker(c, { secrets: 0, time: silver + 5 })).toMatch(
      /^Défi du jour · chrono à battre : 0 min \d\d s$/,
    );
    // The title button, the card and the share say the time.
    const year = Array.from({ length: 21 }, (_, i) =>
      dailyFor(LEVELS, new Date(2026, 9, 1 + i, 12)),
    );
    const day = /** @type {import('../src/app/daily.js').Challenge} */ (
      year.find((d) => d.twist.id === 'chrono')
    );
    expect(day.twist.label).toMatch(/^chrono d’argent, sous \d+ min \d\d s$/);
    expect(dailyMet(day, { secrets: 0, time: dailyLimit(day) - 1 })).toBe(true);
  });

  it('asks for a secret on « un secret à dénicher » only', () => {
    expect(dailyMet(challenge('secret'), { secrets: 0 })).toBe(false);
    expect(dailyMet(challenge('secret'), { secrets: 1 })).toBe(true);
    expect(dailyMet(challenge('oneHeart'), { secrets: 0 })).toBe(true);
    expect(dailyKicker(challenge('secret'), { secrets: 0 })).toBe('Défi du jour · secret manquant');
    expect(dailyKicker(challenge('oneHeart'), { secrets: 0 })).toBe(
      'Défi du jour · un seul cœur ✓',
    );
  });

  it('shares an emoji card with the medal', () => {
    const r = { hearts: 2, maxHearts: 3, secrets: 1, secretTotal: 2, time: 75.4 };
    expect(shareCard({ ...r, medal: 'gold' })).toBe('🥇 ❤️❤️🖤  ⭐▫️  ⏱️ 1 min 15 s');
    expect(shareCard({ ...r, medal: null })).toBe('❤️❤️🖤  ⭐▫️  ⏱️ 1 min 15 s');
  });
});

/**
 * The twists that change the simulation stay solvable on every daily stage, for
 * both heroes, without taking a hit (« Sans filet » leaves one heart). One heart, no
 * checkpoint and the secret are covered by the damage-free and secret proofs of
 * tests/level.test.js.
 */
describe.each(dailyStages(LEVELS).map((i) => LEVELS[i]))('daily on $id', (l) => {
  it.each(HEROES)(
    '%s: every twist that fits is solvable',
    (hero) => {
      for (const id of /** @type {const} */ (['noAmmo', 'sansFilet'])) {
        // The draws left out (UNFIT) are never dealt.
        if (!twistFits(l, hero, id)) continue;
        const c = { ...challenge(id), hero };
        const sim = createSim(l, hero);
        applyTwist(sim, c);
        const result = solve(sim, { maxNodes: 200000 });
        expect(result.won, `${id}: add it to UNFIT in src/app/daily.js if it can't be done`).toBe(
          true,
        );
        const replay = createSim(l, hero);
        applyTwist(replay, c);
        for (const input of result.inputs) step(replay, input);
        expect(replay.won, `${id} replay`).toBe(true);
      }
    },
    300_000,
  );
});
