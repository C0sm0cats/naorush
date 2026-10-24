import { describe, expect, it } from 'vitest';
import { dailyChallenge } from '../src/app/daily.js';

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
});
