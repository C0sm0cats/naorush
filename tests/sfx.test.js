import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SFX, SFX_TYPES, VARIED } from '../src/app/audio/sfx.js';
import { CROWD_WINDOW, resetCrowd } from '../src/app/audio/sfx-kit.js';

/** @typedef {import('../src/app/audio/types.js').Foley} Foley */
/** @typedef {{ kind: 'tone' | 'noise', t: number, d: number, v: number, f?: number, to?: number }} Source */

/** A voice that records what an effect schedules instead of playing it. */
function recorder(now = 0) {
  /** @type {Source[]} */
  const sources = [];
  const node = /** @type {AudioScheduledSourceNode} */ (/** @type {unknown} */ ({}));
  return {
    sources,
    voice: {
      now,
      tone: (/** @type {import('../src/app/audio/types.js').ToneOpts} */ o) => {
        sources.push({ kind: 'tone', t: o.t, d: o.d, v: o.v ?? 0.3, f: o.f, to: o.to });
        return node;
      },
      noise: (/** @type {import('../src/app/audio/types.js').NoiseOpts} */ o) => {
        sources.push({ kind: 'noise', t: o.t, d: o.d, v: o.v ?? 0.3, f: o.f, to: o.to });
        return node;
      },
    },
  };
}

/** @param {Partial<Foley>} [f] @returns {Foley} */
const foley = (f = {}) => ({
  hero: 'kevin',
  floor: 'carpet',
  who: 'kevin',
  foot: 0,
  variant: 0,
  ...f,
});

/** Plays an effect on a recorder and returns what it scheduled. */
function play(/** @type {string} */ type, now = 0, f = foley()) {
  const r = recorder(now);
  SFX[type](r.voice, f);
  return r.sources;
}

const loudest = (/** @type {Source[]} */ s) => Math.max(...s.map((x) => x.v));
const first = (/** @type {Source[]} */ s) => Math.min(...s.map((x) => x.t));

beforeEach(() => resetCrowd());
afterEach(() => vi.restoreAllMocks());

describe('sound effects', () => {
  it('has a sound for each novelty of round 11', () => {
    for (const type of [
      'lockOn',
      'maintenance',
      'encore',
      'clockTick',
      'arrive',
      'titlePush',
      'tightrope',
      'certified',
      'puddle',
      'slip',
    ])
      expect(SFX_TYPES, type).toContain(type);
  });

  it('schedules only sane sources, for every effect, floor and take', () => {
    let now = 0;
    for (const type of SFX_TYPES)
      for (const floor of /** @type {const} */ (['carpet', 'metal', 'gravel']))
        for (let variant = 0; variant < 4; variant++) {
          // Far apart in time, so no play counts as a copy of the one before.
          now += 1;
          const s = play(
            type,
            now,
            foley({ floor, variant, hero: variant & 1 ? 'charline' : 'kevin' }),
          );
          expect(s.length, type).toBeGreaterThan(0);
          for (const x of s) {
            for (const k of /** @type {const} */ (['t', 'd', 'v']))
              expect(Number.isFinite(x[k]), `${type} ${k}`).toBe(true);
            expect(x.d, type).toBeGreaterThan(0);
            expect(x.v, type).toBeGreaterThan(0);
            expect(x.t, type).toBeGreaterThanOrEqual(now);
            if (x.f !== undefined) expect(x.f, type).toBeGreaterThan(0);
          }
        }
  });

  it('gives every take of a varied effect its own sound', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (const type of VARIED) {
      const takes = new Set();
      for (let variant = 0; variant < 4; variant++) {
        resetCrowd();
        takes.add(JSON.stringify(play(type, 1, foley({ variant }))));
      }
      expect(takes.size, type).toBe(4);
    }
    // What comes in bursts: a volley, CR spam, the encores, a string of trophies.
    for (const type of [
      'fire',
      'bossThrow',
      'bossHit',
      'slam',
      'fan',
      'dash',
      'rackLand',
      'trophy',
    ])
      expect(VARIED.has(type), type).toBe(true);
  });

  it('plays copies of one effect in the same instant later, softer and detuned', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const one = play('rackLand', 2);
    const two = play('rackLand', 2);
    const three = play('rackLand', 2 + CROWD_WINDOW / 2);
    expect(first(two)).toBeGreaterThan(first(one) + 0.01);
    expect(first(three)).toBeGreaterThan(first(two));
    expect(loudest(two)).toBeLessThan(loudest(one) * 0.5);
    expect(loudest(three)).toBeLessThan(loudest(two));
    expect(two[0].f).not.toBe(one[0].f);
    // Another effect, or the same one a moment later, plays in full.
    expect(loudest(play('rackDrop', 2))).toBe(loudest(play('rackDrop', 5)));
    expect(loudest(play('rackLand', 2.5))).toBe(loudest(one));
  });

  it('starts afresh on a new audio clock', () => {
    const late = play('trophy', 30);
    const early = play('trophy', 0);
    expect(loudest(early)).toBe(loudest(late));
  });
});
