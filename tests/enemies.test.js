import { describe, expect, it } from 'vitest';
import { HERO, HERO_STATS, TILE, tileAt } from '../src/game/sim.js';
import { SPRING, SPRING_STOP, pileColumn } from '../src/game/enemies.js';
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
  /** A hero dropped from y = 5.5 right above a parked vacuum. */
  function dropOnVacuum(hero = /** @type {'kevin'|'charline'} */ ('kevin')) {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['v', 8, 3],
      ]),
      hero,
    );
    const vacuum = find(s, 'vacuum');
    vacuum.vx = 0;
    Object.assign(s.hero, { x: vacuum.x - HERO.w / 2, y: 5.5, state: 'air', fallFrom: 5.5 });
    return s;
  }

  it('is a real springboard: about 4.4 tiles up for Kévin, 4.7 for Charline, jump held or not', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline']))
      for (const held of [false, true]) {
        const s = dropOnVacuum(hero);
        const r = runUntil(s, IDLE, (x) => has(x.events, 'vacuumBounce'), 120);
        expect(r.ok).toBe(true);
        expect(s.hero.vy).toBe(SPRING[hero]);
        expect(s.hero.state).toBe('air');
        let top = s.hero.y;
        for (let i = 0; i < 90; i++) {
          run(s, input({ jump: held }), 1);
          top = Math.max(top, s.hero.y);
        }
        // The floor top is y = 3; a standing jump rises about 1.6.
        const rise = top - 3;
        expect(rise, `${hero} ${held}`).toBeGreaterThan(hero === 'kevin' ? 4.2 : 4.55);
        expect(rise, `${hero} ${held}`).toBeLessThan(hero === 'kevin' ? 4.5 : 4.85);
        expect(s.hero.hearts).toBe(HERO_STATS[hero].hearts);
      }
  });

  it('keeps air control and Charline’s double jump on the way up', () => {
    const s = dropOnVacuum('charline');
    runUntil(s, IDLE, (x) => has(x.events, 'vacuumBounce'), 120);
    // A jump pressed on the lid is not spent slowing the launch down.
    run(s, input({ jump: true }), 1);
    expect(s.hero.vy).toBeGreaterThan(HERO_STATS.charline.jump);
    expect(s.hero.airJumps).toBe(1);
    const x0 = s.hero.x;
    run(s, input({ right: true }), 20);
    expect(s.hero.x - x0).toBeGreaterThan(1);
  });

  it('stops dead while its lid springs back, then rolls on: no knock from below', () => {
    const s = dropOnVacuum('kevin');
    const vacuum = find(s, 'vacuum');
    expect(runUntil(s, IDLE, (x) => has(x.events, 'vacuumBounce'), 120).ok).toBe(true);
    // Rolling on as it was: it waits for its lid first.
    vacuum.vx = 3;
    const x = vacuum.x;
    expect(vacuum.state).toBe('spring');
    run(s, IDLE, Math.floor(SPRING_STOP * 60) - 1);
    expect(vacuum.x).toBe(x);
    run(s, IDLE, 10);
    expect(vacuum.state).toBe('walk');
    expect(vacuum.x).not.toBe(x);
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
    expect(events.find((e) => e.type === 'block')?.cause).toBe('crate');
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

describe('bodies match what you see', () => {
  /** Hero pinned `above` tiles over the floor, overlapping the thing at x. @param {Sim} s @param {number} x @param {number} above */
  const probe = (s, x, above) => {
    Object.assign(s.hero, {
      x: x - HERO.w / 2,
      y: 3 + above,
      vx: 0,
      vy: 0,
      state: 'air',
      invuln: 0,
    });
    return has(run(s, IDLE, 1), 'hurt');
  };

  it('an intern is hit at chest height, cleared by a fair jump', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['i', 10, 3],
      ]),
    );
    const intern = find(s, 'intern');
    intern.vx = 0;
    expect(probe(s, intern.x, 1)).toBe(true);
    const t = sim(
      room(16, [
        ['S', 2, 3],
        ['i', 10, 3],
      ]),
    );
    find(t, 'intern').vx = 0;
    expect(probe(t, find(t, 'intern').x, 1.25)).toBe(false);
  });

  it('a video-call manager is hit at chest height too', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['z', 10, 3],
      ]),
    );
    expect(probe(s, 10.5, 1.1)).toBe(true);
  });

  it('nobody reaches through a floor: colleague, intern, vacuum on a shelf above the hero', () => {
    for (const ch of ['n', 'i', 'v']) {
      // A one-tile-thick shelf (y = 5) with the walker on top, the hero walking underneath.
      const s = sim(room(16, [['S', 2, 3], ...fill('#', 5, 12, 5, 5), [ch, 8, 6]]));
      const events = run(s, input({ right: true }), 120);
      expect(s.hero.x, ch).toBeGreaterThan(11);
      expect(has(events, 'bump') || has(events, 'hurt'), ch).toBe(false);
    }
  });
});

describe('walkers on loose floor', () => {
  it('crack it like the hero, fall when it goes, and are back at their post on respawn', () => {
    for (const ch of ['n', 'i', 'v']) {
      const s = sim(
        room(16, [
          ['S', 2, 3],
          ['-', 10, 2],
          ['^', 10, 1],
          [ch, 10, 3],
        ]),
      );
      const walker = s.things.find((t) => t.kind !== 'loose' && t.kind !== 'lift' && t.x === 10.5);
      if (!walker) throw new Error(ch);
      walker.vx = 0;
      const r = runUntil(s, IDLE, () => !walker.alive, 120);
      expect(r.ok, ch).toBe(true);
      expect(has(r.events, 'crack'), ch).toBe(true);
      s.hero.state = 'dead';
      s.hero.stateTime = 0;
      runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200);
      expect([walker.alive, walker.y], ch).toEqual([true, 3]);
    }
  });
});

describe('walkers and cracked slabs', () => {
  it('turn back before a loose slab or a trapdoor while strolling: it is still there for the hero', () => {
    for (const [ch, slab] of /** @type {const} */ ([
      ['n', '-'],
      ['i', 'L'],
      ['v', '-'],
    ])) {
      // Hero far away and out of sight: the walker strolls on its own for 30 s.
      const s = sim(
        room(30, [['S', 26, 3], ...fill('#', 22, 23, 3, 6), [slab, 13, 2], [ch, 10, 3]]),
      );
      const walker = s.things.find((t) => t.kind !== 'loose' && t.kind !== 'lift' && t.x === 10.5);
      if (!walker) throw new Error(ch);
      const r = run(s, IDLE, 60 * 30);
      expect(has(r, 'crack') || has(r, 'trapdoor'), ch).toBe(false);
      expect(tileAt(s, 13, 2), ch).toBe(TILE.LOOSE);
      expect([walker.alive, walker.y], ch).toEqual([true, 3]);
      expect(walker.x, ch).toBeLessThan(13);
    }
  });

  it('but a rushing intern runs onto it, the same way on every try', () => {
    const s = sim(
      room(20, [['S', 13, 3], ['i', 8, 3], ...fill('-', 10, 12, 2, 2), ...fill('^', 10, 12, 1, 1)]),
    );
    const intern = find(s, 'intern');
    Object.assign(intern, { vx: 2.2, t: 2 });
    const r = runUntil(s, IDLE, () => !intern.alive, 240);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'crack')).toBe(true);
  });
});

describe("a stunned intern's pile of files", () => {
  /** A stunned intern at column 10 (x = 10.5), floor top at y = 3, facing right. */
  const setup = (/** @type {import('./mechanics-kit.js').Mark[]} */ marks = [], hero = 3) => {
    const s = sim(room(20, [['S', hero, 3], ['i', 10, 3], ...marks]));
    const intern = find(s, 'intern');
    Object.assign(intern, { vx: 2.2, state: 'stunned', t: 0 });
    run(s, IDLE, 1);
    return { s, intern };
  };

  it('lands beside them as a solid one-tile step, for the length of the break', () => {
    const { s, intern } = setup();
    expect(pileColumn(intern)).toBe(11);
    expect(tileAt(s, 11, 3)).toBe(TILE.SOLID);
    // Clear of the intern's body: the pile never overlaps them.
    expect(11 - (intern.x + 0.3)).toBeGreaterThanOrEqual(0);
    // Standable: dropped on top, the hero stands on it.
    Object.assign(s.hero, { x: 11.2, y: 4.5, vy: 0, state: 'air' });
    run(s, IDLE, 40);
    expect(s.hero.state).toBe('ground');
    expect(s.hero.y).toBe(4);
    // Solid from the side: walking into it stops at its face.
    Object.assign(s.hero, { x: 13, y: 3, vx: 0, vy: 0, state: 'ground' });
    run(s, input({ left: true }), 40);
    expect(s.hero.x).toBeGreaterThanOrEqual(12 - 1e-6);
    // Gathered up when the break is over: the tile is free again.
    const back = runUntil(s, IDLE, () => intern.state === 'walk', 300);
    expect(back.ok).toBe(true);
    expect(has(back.events, 'pileGone')).toBe(true);
    expect(s.time).toBeGreaterThan(3.9);
    expect(tileAt(s, 11, 3)).toBe(TILE.EMPTY);
    expect(pileColumn(intern)).toBe(-1);
  });

  it('never closes on the hero: it falls behind them, or not at all', () => {
    const behind = setup([], 11);
    expect(pileColumn(behind.intern)).toBe(9);
    expect(tileAt(behind.s, 11, 3)).toBe(TILE.EMPTY);
    // Boxed in on the other side too (a wall), no pile.
    const none = setup(
      [
        ['#', 8, 3],
        ['#', 9, 3],
      ],
      11,
    );
    expect(pileColumn(none.intern)).toBe(-1);
    expect(tileAt(none.s, 11, 3)).toBe(TILE.EMPTY);
  });

  it('only lands where one can stand on it, on firm floor', () => {
    // A low ceiling over both sides: a pile there would block the corridor.
    const low = setup([...fill('#', 8, 13, 5, 5)]);
    expect(pileColumn(low.intern)).toBe(-1);
    // A loose slab under the spot: the pile would hang in the air once it goes.
    const slab = setup([['-', 11, 2]]);
    expect(pileColumn(slab.intern)).toBe(9);
  });

  it('scatters when a hero ends up inside it (a respawn on the spot)', () => {
    const { s, intern } = setup();
    Object.assign(s.hero, { x: 11.2, y: 3, vy: 0, state: 'ground' });
    const events = run(s, IDLE, 1);
    expect(has(events, 'pileGone')).toBe(true);
    expect(tileAt(s, 11, 3)).toBe(TILE.EMPTY);
    expect(pileColumn(intern)).toBe(-1);
  });
});

describe('CRs stop at whatever they hit', () => {
  it('a stunned intern soaks up a CR instead of letting it through', () => {
    const s = sim(
      room(20, [
        ['S', 2, 3],
        ['i', 8, 3],
        ['i', 12, 3],
      ]),
    );
    const [first, second] = s.things.filter((t) => t.kind === 'intern');
    first.vx = second.vx = 0;
    Object.assign(first, { state: 'stunned', t: 0 });
    const events = throwCr(s).concat(untilCrGone(s));
    expect(has(events, 'block')).toBe(true);
    expect(second.state).not.toBe('stunned');
  });

  it('a lift deck stops a CR', () => {
    const s = sim(room(20, [['S', 2, 3]], { lifts: [{ x: 8, y: 4.2, top: 4.2, w: 2 }] }));
    throwCr(s);
    const cr = s.things.find((t) => t.kind === 'cr');
    untilCrGone(s);
    expect(cr?.x).toBeLessThan(10);
  });

  it('a director standing by before the duel blocks a CR', () => {
    const s = sim(
      room(
        30,
        [
          ['S', 6, 3],
          ['X', 18, 3],
        ],
        {
          boss: { id: 'techServicesDirector', hp: 3, arena: [14, 28] },
        },
      ),
    );
    throwCr(s);
    const cr = s.things.find((t) => t.kind === 'cr');
    const events = untilCrGone(s);
    expect(has(events, 'block')).toBe(true);
    expect(cr?.x).toBeLessThan(19);
  });
});
