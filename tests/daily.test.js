import { describe, expect, it } from 'vitest';
import { dailyChallenge } from '../src/app/daily.js';

describe('daily challenge', () => {
  it('is the same for everyone on a given day and changes from day to day', () => {
    const a = dailyChallenge(5, new Date('2026-10-24T08:00:00Z'));
    expect(dailyChallenge(5, new Date('2026-10-24T20:00:00Z'))).toEqual(a);
    const week = Array.from({ length: 7 }, (_, i) =>
      JSON.stringify(dailyChallenge(5, new Date(Date.UTC(2026, 9, 24 + i)))),
    );
    expect(new Set(week).size).toBeGreaterThan(3);
    expect(a.stage).toBeGreaterThanOrEqual(0);
    expect(a.stage).toBeLessThan(5);
  });
});
