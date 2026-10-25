import { describe, expect, it } from 'vitest';
import {
  TWISTS,
  UNFIT,
  applyTwist,
  dailyChallenge,
  dailyFor,
  dailyKicker,
  dailyMet,
  dailyStages,
  shareCard,
  twistFits,
} from '../src/app/daily.js';
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

  it('draws every stage without a boss, bonus stages included, with six twists', () => {
    expect(TWISTS).toHaveLength(6);
    expect(new Set(TWISTS.map((t) => t.id)).size).toBe(6);
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
      expect(next.twist).toBe(TWISTS[(TWISTS.indexOf(c.twist) + 1) % TWISTS.length]);
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
    const plain = fresh();
    applyTwist(plain, challenge('secret'));
    expect(plain).toEqual(fresh());
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
