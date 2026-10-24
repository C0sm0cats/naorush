import { describe, expect, it } from 'vitest';
import { ShuffleBag } from '../src/app/dialogue.js';

/** A small deterministic generator so the test does not depend on luck. @param {number} seed */
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

describe('Speech bubble shuffle bag', () => {
  it('deals every line once per round', () => {
    const bag = new ShuffleBag(lcg(7));
    for (let round = 0; round < 20; round++) {
      const dealt = Array.from({ length: 4 }, () => bag.next('kevin:block', 4));
      expect(dealt.sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('never says the same line twice in a row, even across rounds', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const bag = new ShuffleBag(lcg(seed));
      let last = -1;
      for (let k = 0; k < 200; k++) {
        const i = bag.next('charline:hurt', 3);
        expect(i).not.toBe(last);
        last = i;
      }
    }
  });

  it('keeps one bag per speaker and moment, and copes with a single line', () => {
    const bag = new ShuffleBag(lcg(5));
    expect(bag.next('a:x', 1)).toBe(0);
    const a = Array.from({ length: 3 }, () => bag.next('a:y', 3));
    const b = Array.from({ length: 3 }, () => bag.next('b:y', 3));
    expect([...a].sort()).toEqual([0, 1, 2]);
    expect([...b].sort()).toEqual([0, 1, 2]);
  });
});
