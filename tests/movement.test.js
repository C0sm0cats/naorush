import { describe, expect, it } from 'vitest';
import { HERO_STATS } from '../src/game/sim.js';
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
