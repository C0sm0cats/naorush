import { describe, expect, it } from 'vitest';
import { HERO, HERO_STATS, TILE, tileAt } from '../src/game/sim.js';
import { IDLE, fill, has, input, room, run, runUntil, sim, throwCr } from './mechanics-kit.js';

/** @typedef {import('./mechanics-kit.js').Sim} Sim */

/** @param {Sim} s @param {string} kind */
const find = (s, kind) => {
  const t = s.things.find((k) => k.kind === kind);
  if (!t) throw new Error(`no ${kind}`);
  return t;
};

/** Steps until no CR is in flight. @param {Sim} s */
const untilCrGone = (s) =>
  runUntil(s, IDLE, (x) => !x.things.some((t) => t.kind === 'cr'), 120).events;

describe('intern', () => {
  it('takes a coffee break when hit by a CR and is harmless meanwhile', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['i', 10, 3],
      ]),
    );
    const intern = find(s, 'intern');
    const events = throwCr(s).concat(untilCrGone(s));
    expect(has(events, 'internStun')).toBe(true);
    expect(intern.state).toBe('stunned');
    const x = intern.x;
    // Standing right on top of a stunned intern costs nothing.
    s.hero.x = intern.x - HERO.w / 2;
    expect(has(run(s, IDLE, 60), 'hurt')).toBe(false);
    expect(intern.x).toBe(x);
    expect(runUntil(s, IDLE, () => intern.state === 'walk', 300).ok).toBe(true);
  });

  it('knocks the hero back on contact otherwise', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['i', 10, 3],
      ]),
    );
    const r = runUntil(s, input({ right: true }), (x) => x.hero.hearts < 4, 240);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'hurt')).toBe(true);
  });
  it('stops dead when spotting the hero ahead, then rushes and calms down', () => {
    const s = sim(
      room(20, [
        ['S', 5, 3],
        ['i', 11, 3],
      ]),
    );
    const intern = find(s, 'intern');
    const spot = runUntil(s, IDLE, () => intern.state === 'notice', 600);
    expect(spot.ok).toBe(true);
    expect(has(spot.events, 'telegraph')).toBe(true);
    // The telegraph: frozen on the spot for a moment.
    const x = intern.x;
    run(s, IDLE, 20);
    expect(intern.x).toBe(x);
    expect(runUntil(s, IDLE, () => intern.state === 'rush', 30).ok).toBe(true);
    expect(Math.abs(intern.vx)).toBeGreaterThan(4);
    expect(runUntil(s, IDLE, () => intern.state === 'walk', 120).ok).toBe(true);
    expect(Math.abs(intern.vx)).toBeCloseTo(2.2, 5);
    // The rush stays on the intern's beat: a hero standing back is never reached.
    expect(s.hero.hearts).toBe(HERO_STATS.kevin.hearts);
  });

  it('walks home after a rush carried it beyond its patrol range', () => {
    const s = sim(
      room(20, [
        ['S', 5, 3],
        ['i', 11, 3],
      ]),
    );
    const intern = find(s, 'intern');
    const home = intern.home ?? intern.x;
    // Pushed out of range (as a long rush does) with the hero gone.
    intern.x = home - 4.2;
    s.hero.x = 18;
    run(s, IDLE, 120);
    expect(Math.abs(intern.x - home)).toBeLessThan(3.2);
  });

  it('can be stunned mid-telegraph', () => {
    const s = sim(
      room(20, [
        ['S', 5, 3],
        ['i', 11, 3],
      ]),
    );
    const intern = find(s, 'intern');
    expect(runUntil(s, IDLE, () => intern.state === 'notice', 600).ok).toBe(true);
    s.hero.facing = 1;
    run(s, input({ fire: true }), 1);
    untilCrGone(s);
    expect(intern.state).toBe('stunned');
  });
});

describe('robot vacuum', () => {
  /** Kévin dropped from y = 5.5 right above a parked vacuum. */
  function dropOnVacuum() {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['v', 8, 3],
      ]),
    );
    const vacuum = find(s, 'vacuum');
    vacuum.vx = 0;
    Object.assign(s.hero, { x: vacuum.x - HERO.w / 2, y: 5.5, state: 'air', fallFrom: 5.5 });
    return s;
  }

  it('bounces a hero landing on its lid higher than a jump', () => {
    const s = dropOnVacuum();
    const r = runUntil(s, IDLE, (x) => has(x.events, 'vacuumBounce'), 120);
    expect(r.ok).toBe(true);
    expect(s.hero.vy).toBeCloseTo(HERO_STATS.kevin.jump * 1.12, 5);
    expect(s.hero.state).toBe('air');
    let top = s.hero.y;
    for (let i = 0; i < 40; i++) {
      run(s, input({ jump: true }), 1);
      top = Math.max(top, s.hero.y);
    }
    // A standing jump peaks around y = 4.6.
    expect(top).toBeGreaterThan(5);
    expect(s.hero.hearts).toBe(4);
  });

  it('hurts a hero running into it', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['v', 8, 3],
      ]),
    );
    find(s, 'vacuum').vx = 0;
    const r = runUntil(s, input({ right: true }), (x) => x.hero.hearts < 4, 240);
    expect(r.ok).toBe(true);
  });
});

describe('project manager on a visio', () => {
  const def = room(16, [
    ['S', 2, 3],
    ['z', 9, 3],
  ]);

  it('sends meeting invites down the corridor', () => {
    const s = sim(def);
    expect(has(run(s, IDLE, 240), 'invite')).toBe(true);
  });

  it('is muted by a CR and sends nothing until unmuted', () => {
    const s = sim(def);
    const visio = find(s, 'visio');
    const events = throwCr(s).concat(untilCrGone(s));
    expect(has(events, 'visioMute')).toBe(true);
    expect(visio.state).toBe('muted');
    const quiet = run(s, IDLE, 4 * 60);
    expect(has(quiet, 'invite')).toBe(false);
    expect(s.things.some((t) => t.kind === 'invite')).toBe(false);
    expect(runUntil(s, IDLE, () => visio.state !== 'muted', 120).ok).toBe(true);
  });
});

describe('archive boxes', () => {
  // A stack of three boxes in column 8, a lone box beside it in column 9.
  const def = room(16, [['S', 2, 3], ...fill('A', 8, 8, 3, 5), ['A', 9, 3]]);

  it('come down as a whole stack under one of Kévin’s CRs', () => {
    const s = sim(def, 'kevin');
    const events = throwCr(s).concat(untilCrGone(s));
    expect(has(events, 'archive')).toBe(true);
    for (const y of [3, 4, 5]) expect(tileAt(s, 8, y)).toBe(TILE.EMPTY);
    const boxes = s.things.filter((t) => t.kind === 'crate');
    expect(boxes.filter((b) => b.x === 8).every((b) => !b.alive)).toBe(true);
    expect(tileAt(s, 9, 3)).toBe(TILE.CRATE);
    expect(boxes.find((b) => b.x === 9)?.alive).toBe(true);
  });

  it('stop Charline’s lighter CRs', () => {
    const s = sim(def, 'charline');
    const events = throwCr(s).concat(untilCrGone(s));
    expect(has(events, 'block')).toBe(true);
    expect(events.find((e) => e.type === 'block')?.cause).toBeUndefined();
    expect(has(events, 'archive')).toBe(false);
    for (const y of [3, 4, 5]) expect(tileAt(s, 8, y)).toBe(TILE.CRATE);
  });
});

describe('coffee cup', () => {
  it('gives back a heart but never above the maximum', () => {
    const s = sim(
      room(14, [
        ['S', 2, 3],
        ['h', 5, 3],
        ['h', 8, 3],
      ]),
      'kevin',
    );
    s.hero.hearts = s.maxHearts - 1;
    const first = runUntil(s, input({ right: true }), (x) => x.hero.x > 6, 120);
    expect(has(first.events, 'heart')).toBe(true);
    expect(s.hero.hearts).toBe(s.maxHearts);
    const second = runUntil(s, input({ right: true }), (x) => x.hero.x > 9.5, 120);
    expect(second.ok).toBe(true);
    expect(has(second.events, 'heart')).toBe(false);
    expect(s.hero.hearts).toBe(s.maxHearts);
    const cups = s.things.filter((t) => t.kind === 'cup');
    expect(cups.map((c) => c.alive)).toEqual([false, true]);
  });
});

describe('relaxed mode', () => {
  it('keeps hearts on knocks but live cables still send you back', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['i', 6, 3],
        ['^', 12, 2],
      ]),
      'kevin',
    );
    s.assist = true;
    const knock = runUntil(s, input({ right: true }), (x) => has(x.events, 'hurt'), 240);
    expect(knock.ok).toBe(true);
    expect(s.hero.hearts).toBe(4);
    Object.assign(s.hero, { x: 12.2, y: 3, vx: 0, vy: 0, state: 'ground' });
    const zap = run(s, IDLE, 2);
    expect(has(zap, 'death')).toBe(true);
    expect(s.hero.state).toBe('dead');
    expect(s.deaths).toBe(1);
  });
});

describe('pickups', () => {
  it('emits a concert event for a Céline Dion ticket, once', () => {
    const s = sim(
      room(12, [
        ['S', 2, 3],
        ['T', 5, 3],
      ]),
    );
    const r = runUntil(s, input({ right: true }), (x) => x.hero.x > 8, 120);
    expect(r.events.filter((e) => e.type === 'concert')).toHaveLength(1);
    expect(find(s, 'concert').alive).toBe(false);
  });

  it('counts each secret once', () => {
    const s = sim(room(16, [['S', 2, 3], ['*', 5, 3], ...fill('#', 11, 13, 6, 6), ['*', 12, 7]]));
    expect(s.secretTotal).toBe(2);
    const r = runUntil(s, input({ right: true }), (x) => x.hero.x > 9, 120);
    expect(r.events.filter((e) => e.type === 'secret')).toHaveLength(1);
    expect(s.secrets).toBe(1);
    run(s, input({ left: true }), 60);
    expect(s.secrets).toBe(1);
  });
});
