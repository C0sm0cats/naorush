import { describe, expect, it } from 'vitest';
import { DT, HARDCORE_TRAPS, HERO_STATS, setHardcore, step } from '../src/game/sim.js';
import { IDLE, fill, has, input, room, run, runUntil, sim } from './mechanics-kit.js';

/** @typedef {import('./mechanics-kit.js').Sim} Sim */

describe('coyote time', () => {
  // A raised block (top at y = 6) to run off, Kévin has no air jump to hide behind.
  const def = room(16, [...fill('#', 1, 6, 3, 5), ['S', 4, 6]]);

  /** Runs right until the feet leave the block. */
  function offTheEdge() {
    const s = sim(def, 'kevin');
    expect(runUntil(s, input({ right: true }), (x) => x.hero.state === 'air', 120).ok).toBe(true);
    return s;
  }

  it('still jumps a few frames after running off a ledge', () => {
    const s = offTheEdge();
    run(s, input({ right: true }), 2);
    const events = run(s, input({ right: true, jump: true }), 1);
    expect(has(events, 'jump')).toBe(true);
    expect(s.hero.vy).toBeGreaterThan(0);
  });

  it('does not jump once the grace period is over', () => {
    const s = offTheEdge();
    run(s, input({ right: true }), 8);
    const events = run(s, input({ right: true, jump: true }), 1);
    expect(has(events, 'jump')).toBe(false);
    expect(s.hero.vy).toBeLessThan(0);
  });
});

describe('jump buffer', () => {
  /** Kévin falling from y = 7 onto flat floor. */
  function falling() {
    const s = sim(room(16, [['S', 8, 3]]), 'kevin');
    Object.assign(s.hero, { y: 7, state: 'air', coyote: 0, fallFrom: 7 });
    return s;
  }
  const probe = falling();
  const landing = runUntil(probe, IDLE, (x) => x.hero.state === 'ground', 120).frames;

  /** @param {number} early Frames before landing the jump is pressed. */
  function pressBeforeLanding(early) {
    const s = falling();
    run(s, IDLE, landing - early - 1);
    return run(s, input({ jump: true }), 1).concat(run(s, IDLE, early + 10));
  }

  it('remembers a press made just before landing', () => {
    expect(landing).toBeGreaterThan(15);
    expect(has(pressBeforeLanding(3), 'jump')).toBe(true);
  });

  it('forgets a press made too early', () => {
    expect(has(pressBeforeLanding(12), 'jump')).toBe(false);
  });
});

describe('ledge grabs', () => {
  /**
   * Stands against a wall `height` tiles tall and jumps straight at it, holding jump.
   * With `double`, releases near the apex and presses again (Charline's air jump).
   * @param {'kevin'|'charline'} hero @param {number} height @param {boolean} [double]
   */
  function jumpAt(hero, height, double = false) {
    const s = sim(room(16, [['S', 5, 3], ...fill('#', 6, 14, 3, 2 + height)]), hero);
    s.hero.x = 6 - 0.63;
    let frame = 0;
    const r = runUntil(
      s,
      () => input({ right: true, jump: !(double && ++frame === 18) }),
      (x) => x.hero.state === 'hang',
      120,
    );
    return { grabbed: r.ok, s };
  }

  it('lets both heroes grab a wall four tiles tall from a standing jump', () => {
    expect(jumpAt('kevin', 4).grabbed).toBe(true);
    expect(jumpAt('charline', 4).grabbed).toBe(true);
  });

  it('hangs each hero by their own reach: Kévin’s longer arms leave him lower', () => {
    const kevin = jumpAt('kevin', 4).s.hero;
    const charline = jumpAt('charline', 4).s.hero;
    expect(kevin.ledge.y).toBe(7);
    expect(charline.ledge.y).toBe(7);
    expect(kevin.y).toBeCloseTo(7 - HERO_STATS.kevin.reach, 5);
    expect(charline.y).toBeCloseTo(7 - HERO_STATS.charline.reach, 5);
  });

  it('keeps a five-tile wall out of reach of a standing jump', () => {
    expect(jumpAt('kevin', 5).grabbed).toBe(false);
    expect(jumpAt('charline', 5).grabbed).toBe(false);
  });

  it('lets Charline reach the five-tile ledge with her double jump, not Kévin', () => {
    expect(jumpAt('charline', 5, true).grabbed).toBe(true);
    expect(jumpAt('kevin', 5, true).grabbed).toBe(false);
    expect(jumpAt('charline', 6, true).grabbed).toBe(false);
  });

  it('climbs when jump is pressed again just as the hands close', () => {
    const { s } = jumpAt('kevin', 4);
    run(s, IDLE, 1);
    run(s, input({ jump: true }), 1);
    const r = runUntil(s, IDLE, (x) => x.hero.state === 'ground', 120);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'climb')).toBe(true);
  });

  it('climbs onto the ledge after a grab', () => {
    const { s } = jumpAt('kevin', 4);
    const r = runUntil(s, input({ up: true }), (x) => x.hero.state === 'ground', 120);
    expect(r.ok).toBe(true);
    expect(s.hero.y).toBe(7);
    expect(has(r.events, 'climb')).toBe(true);
  });
});

describe('apex hang', () => {
  /** Peak height and frames spent near the apex (|vy| < 1.6) of a standing jump. @param {'kevin'|'charline'} hero @param {boolean} hold */
  function arc(hero, hold) {
    const s = sim(room(16, [['S', 7, 3]]), hero);
    let top = 0;
    let floating = 0;
    for (let i = 0; i < 90; i++) {
      // Holding: the whole arc. Not holding: a full-height rise, released only once past the apex band.
      step(s, input({ jump: hold ? true : s.hero.vy > 1.6 || i === 0 }));
      top = Math.max(top, s.hero.y - 3);
      if (s.hero.state === 'air' && Math.abs(s.hero.vy) < 1.6) floating++;
    }
    return { top, floating };
  }

  it('floats the top of a held jump for a few extra frames', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      const held = arc(hero, true);
      const let_go = arc(hero, false);
      expect(held.floating - let_go.floating, hero).toBeGreaterThanOrEqual(3);
    }
  });

  it('barely changes the jump height (grab reach stays the same)', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      const v = HERO_STATS[hero].jump;
      const plain = (v * v) / 80;
      const { top } = arc(hero, true);
      expect(top, hero).toBeGreaterThan(plain - 0.15);
      expect(top, hero).toBeLessThan(plain + 0.08);
    }
  });
});

describe('climbing', () => {
  /** Kévin (or Charline) hanging from a four-tile wall. @param {'kevin'|'charline'} hero */
  function hanging(hero) {
    const s = sim(room(16, [['S', 5, 3], ...fill('#', 6, 14, 3, 6)]), hero);
    s.hero.x = 6 - 0.63;
    runUntil(s, input({ right: true, jump: true }), (x) => x.hero.state === 'hang', 120);
    run(s, IDLE, 10);
    return s;
  }

  it('pulls up in the hero’s own time (Kévin 0.34 s, Charline 0.30 s)', () => {
    expect(HERO_STATS.kevin.climb).toBe(0.34);
    expect(HERO_STATS.charline.climb).toBe(0.3);
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      const s = hanging(hero);
      run(s, input({ up: true }), 1);
      expect(s.hero.state, hero).toBe('climb');
      const r = runUntil(s, IDLE, (x) => x.hero.state === 'ground', 60);
      expect(r.frames * DT, hero).toBeCloseTo(HERO_STATS[hero].climb, 1);
    }
  });

  it('keeps a jump pressed during the pull-up and fires it on the ledge', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      const s = hanging(hero);
      run(s, input({ up: true }), 2);
      // Tapped early in the climb, long before the buffer would normally forget it.
      run(s, input({ jump: true }), 1);
      const events = run(s, IDLE, 40);
      const jump = events.findIndex((e) => e.type === 'jump');
      expect(jump, hero).toBeGreaterThanOrEqual(0);
      expect(s.hero.y, hero).toBeGreaterThanOrEqual(7);
    }
  });

  it('does not jump after the climb without a press', () => {
    const s = hanging('kevin');
    run(s, input({ up: true }), 2);
    expect(has(run(s, IDLE, 40), 'jump')).toBe(false);
  });
});

describe('landings', () => {
  it('report how far the hero fell (for squash and dust)', () => {
    const s = sim(room(16, [['S', 8, 3]]), 'kevin');
    Object.assign(s.hero, { y: 7.5, state: 'air', fallFrom: 7.5 });
    const land = run(s, IDLE, 60).find((e) => e.type === 'land');
    expect(land?.fall).toBeCloseTo(4.5, 1);
    const hop = sim(room(16, [['S', 8, 3]]), 'kevin');
    const events = run(hop, input({ jump: true }), 4).concat(run(hop, IDLE, 60));
    const small = events.find((e) => e.type === 'step');
    expect(small?.fall).toBeGreaterThan(0);
    expect(small?.fall).toBeLessThanOrEqual(2);
  });
});

describe('« Sans filet »', () => {
  const def = room(24, [
    ['S', 2, 3],
    ['h', 5, 3],
    ['d', 22, 4],
    ['-', 12, 2],
  ]);

  it('is off by default', () => {
    const s = sim(def, 'kevin');
    expect(s.hardcore).toBe(false);
    expect(s.maxHearts).toBe(HERO_STATS.kevin.hearts);
  });

  it('leaves one heart and takes the coffee away', () => {
    const s = sim(def, 'charline');
    setHardcore(s);
    expect(s.hero.hearts).toBe(1);
    expect(s.maxHearts).toBe(1);
    expect(s.things.some((t) => t.kind === 'cup' && t.alive)).toBe(false);
  });

  it('runs traps 15 % faster, the same way every time', () => {
    const a = sim(def, 'kevin');
    const b = sim(def, 'kevin');
    setHardcore(b);
    const drawer = (/** @type {Sim} */ s) => s.things.find((t) => t.kind === 'drawer');
    const p0 = drawer(b)?.phase ?? 0;
    run(a, IDLE, 60);
    run(b, IDLE, 60);
    // A second of play moves the cycle on by 1.15 s instead of 1 s.
    const extra = ((drawer(b)?.phase ?? 0) - p0 + 2.8) % 2.8;
    expect(extra).toBeCloseTo(60 * DT * (HARDCORE_TRAPS - 1), 5);
    expect(drawer(a)?.phase).toBeCloseTo(p0, 5);
    // A loose slab gives way sooner.
    const fuse = (/** @type {boolean} */ hard) => {
      const s = sim(def, 'kevin');
      if (hard) setHardcore(s);
      Object.assign(s.hero, { x: 11.7 });
      return runUntil(
        s,
        IDLE,
        (x) => x.things.some((t) => t.kind === 'loose' && t.state === 'falling'),
        120,
      ).frames;
    };
    expect(fuse(true)).toBeLessThan(fuse(false));
    const c = sim(def, 'kevin');
    setHardcore(c);
    run(c, IDLE, 60);
    expect(drawer(c)?.phase).toBe(drawer(b)?.phase);
  });
});

describe('ledge forgiveness', () => {
  // A block whose top is at y = 5, two tiles above the floor.
  const def = room(16, [['S', 3, 3], ...fill('#', 7, 14, 3, 4)]);

  it('steps up onto a ledge clipped by a hair with the feet', () => {
    const s = sim(def, 'kevin');
    Object.assign(s.hero, { x: 6.3, y: 4.82, vx: 3, vy: -0.5, state: 'air', fallFrom: 5 });
    const r = runUntil(s, input({ right: true }), (x) => x.hero.state === 'ground', 30);
    expect(r.ok).toBe(true);
    expect(s.hero.y).toBe(5);
  });

  it('does not lift anyone over a two-tile wall', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      const s = sim(def, hero);
      s.hero.x = 7 - 0.63;
      // A single held jump against the wall.
      run(s, input({ right: true, jump: true }), 40);
      run(s, input({ right: true }), 40);
      expect(s.hero.y, hero).toBe(3);
    }
  });
});

describe('ledges that give way', () => {
  it('a loose slab cracks under a hanging hero and drops them when it goes', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      // A four-tile wall whose top tile (y = 6, column 6) is a loose slab.
      const s = sim(
        room(16, [['S', 5, 3], ...fill('#', 6, 14, 3, 5), ['-', 6, 6], ...fill('#', 7, 14, 6, 6)]),
        hero,
      );
      s.hero.x = 6 - 0.63;
      const grab = runUntil(
        s,
        input({ right: true, jump: true }),
        (x) => x.hero.state === 'hang',
        120,
      );
      expect(grab.ok, hero).toBe(true);
      // Hold on without climbing.
      const r = runUntil(s, IDLE, (x) => x.hero.state !== 'hang', 120);
      expect(r.ok, hero).toBe(true);
      expect(has(r.events, 'crack'), hero).toBe(true);
      expect(s.hero.state, hero).toBe('air');
      // Never back on the vanished ledge (the wall below may be caught again).
      run(s, IDLE, 60);
      expect(s.hero.state === 'hang' && s.hero.ledge.y === 7, hero).toBe(false);
      expect(s.hero.y, hero).toBeLessThan(7 - HERO_STATS[hero].reach);
    }
  });
});

describe('live cables', () => {
  it('hurt from the side as well as underfoot', () => {
    // A wall with bare cables at chest height (y = 4) facing the hero.
    const s = sim(room(16, [['S', 2, 3], ...fill('#', 9, 9, 3, 6), ['^', 8, 4]]));
    const r = runUntil(s, input({ right: true }), (x) => x.hero.state === 'dead', 120);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'zap')).toBe(true);
  });
});

describe('ceilings', () => {
  it('a jump under a one-tile-thick shelf bonks the head and never comes up through it', () => {
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      // Shelf at y = 5 right above the hero: the head hits it on the way up.
      const s = sim(room(16, [['S', 7, 3], ...fill('#', 5, 10, 5, 5)]), hero);
      let top = 0;
      const events = [];
      for (let i = 0; i < 90; i++) {
        events.push(...run(s, input({ jump: i % 30 < 20 }), 1));
        top = Math.max(top, s.hero.y + 1.62);
      }
      expect(has(events, 'bonk'), hero).toBe(true);
      expect(top, hero).toBeLessThanOrEqual(5);
      expect(s.hero.y, hero).toBe(3);
    }
  });
});

describe('lifts', () => {
  it('catch a hero landing on a rising deck, whatever the timing', () => {
    let through = 0;
    let tries = 0;
    for (let wait = 0; wait < 240; wait++) {
      // A quick lift (one way in a second) and the hero dropped just above it mid-stroke.
      const s = sim(room(16, [['S', 2, 3]], { lifts: [{ x: 6, y: 3, top: 8, w: 2, period: 2 }] }));
      const lift = s.things.find((t) => t.kind === 'lift');
      if (!lift) throw new Error('no lift');
      run(s, IDLE, wait);
      if (lift.y > 5.5 || (lift.dy ?? 0) <= 0) continue;
      tries++;
      Object.assign(s.hero, { x: 6.7, y: lift.y + 0.6, vx: 0, vy: 0, state: 'air', invuln: 1e9 });
      for (let i = 0; i < 60 && !s.onLift; i++) {
        run(s, input({ down: true }), 1);
        if (s.hero.y < lift.y - 0.3) {
          through++;
          break;
        }
      }
    }
    expect(tries).toBeGreaterThan(20);
    expect(through).toBe(0);
  });
});
