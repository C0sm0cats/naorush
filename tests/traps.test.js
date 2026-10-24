import { describe, expect, it } from 'vitest';
import { HERO, TILE, tileAt } from '../src/game/sim.js';
import { IDLE, fill, has, input, room, run, runUntil, sim, throwCr } from './mechanics-kit.js';

/** @typedef {import('./mechanics-kit.js').Sim} Sim */

/** @param {Sim} s @param {string} kind */
const find = (s, kind) => {
  const t = s.things.find((k) => k.kind === kind);
  if (!t) throw new Error(`no ${kind}`);
  return t;
};

/**
 * Pins the hero at x on the floor with no invulnerability, steps once, and reports
 * whether the step hurt.
 * @param {Sim} s @param {number} x
 */
function standAndStep(s, x) {
  Object.assign(s.hero, { x, y: 3, vx: 0, vy: 0, state: 'ground', invuln: 0, hearts: 4 });
  return has(run(s, IDLE, 1), 'hurt');
}

describe('hidden trapdoor', () => {
  // Trapdoor at column 5 over live cables.
  const def = room(12, [
    ['S', 2, 3],
    ['L', 5, 2],
    ['^', 5, 1],
  ]);

  it('looks like floor, gives way after being stepped on, and re-arms on respawn', () => {
    const s = sim(def);
    const door = find(s, 'loose');
    expect(door.hidden).toBe(true);
    expect(tileAt(s, 5, 2)).toBe(TILE.LOOSE);
    s.hero.x = 5.19;
    const first = run(s, IDLE, 1);
    expect(has(first, 'crack')).toBe(true);
    expect(door.state).toBe('shaking');

    const fall = runUntil(s, IDLE, () => door.state === 'falling', 60);
    expect(fall.ok).toBe(true);
    expect(fall.frames).toBeGreaterThan(20);
    expect(has(fall.events, 'trapdoor')).toBe(true);
    expect(tileAt(s, 5, 2)).toBe(TILE.EMPTY);

    const death = runUntil(s, IDLE, (x) => x.hero.state === 'dead', 120);
    expect(death.ok).toBe(true);
    const back = runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200);
    expect(has(back.events, 'respawn')).toBe(true);
    expect(s.hero.x).toBeCloseTo(2.2, 5);
    expect(door.state).toBe('idle');
    expect(door.y).toBe(2);
    expect(tileAt(s, 5, 2)).toBe(TILE.LOOSE);
  });
});

describe('office chair', () => {
  // Chair at column 6, a shelf (top y = 7) to get out of its way.
  const def = room(20, [['S', 14, 3], ['c', 6, 3], ...fill('#', 13, 16, 6, 6)]);

  it('wobbles first, then rolls towards the hero and stops against the wall', () => {
    const s = sim(def);
    const chair = find(s, 'chair');
    const near = runUntil(s, input({ left: true }), () => chair.state === 'wobble', 240);
    expect(near.ok).toBe(true);
    expect(has(near.events, 'telegraph')).toBe(true);
    // Out of the way on the shelf.
    Object.assign(s.hero, { x: 14.2, y: 7, vx: 0, vy: 0, state: 'ground' });

    const wobble = runUntil(s, IDLE, () => chair.state !== 'wobble', 60);
    expect(wobble.frames).toBeGreaterThan(20);
    expect(chair.x).toBe(6.5);
    expect(chair.state).toBe('rolling');
    expect(chair.vx).toBeGreaterThan(0);

    const roll = runUntil(s, IDLE, () => chair.state !== 'rolling', 240);
    expect(roll.ok).toBe(true);
    expect(has(roll.events, 'chairBump')).toBe(true);
    expect(chair.state).toBe('idle');
    expect(chair.vx).toBe(0);
    // Against the right wall (column 19), never inside it.
    expect(chair.x).toBeGreaterThan(18.4);
    expect(chair.x + 0.3).toBeLessThanOrEqual(19);
    expect(s.hero.hearts).toBe(4);
  });
});

describe('office chair consistency', () => {
  /** A chair charging a hero standing at column 11. @param {'kevin'|'charline'} hero */
  function charging(hero) {
    const s = sim(
      room(24, [
        ['S', 11, 3],
        ['c', 6, 3],
      ]),
      hero,
    );
    const chair = find(s, 'chair');
    runUntil(s, IDLE, () => chair.state === 'rolling', 400);
    return { s, chair };
  }

  for (const hero of /** @type {const} */ (['kevin', 'charline']))
    it(`can be jumped over by ${hero} with a comfortable timing window`, () => {
      let safe = 0;
      for (let wait = 0; wait < 45; wait++) {
        const { s } = charging(hero);
        run(s, IDLE, wait);
        const hearts = s.hero.hearts;
        for (let i = 0; i < 90; i++) run(s, input({ jump: i < 12 }), 1);
        if (s.hero.hearts === hearts) safe++;
      }
      expect(safe).toBeGreaterThanOrEqual(12);
    });

  it('is stopped by a CR', () => {
    const { s, chair } = charging('kevin');
    s.hero.facing = -1;
    run(s, input({ fire: true }), 1);
    runUntil(s, IDLE, () => chair.state !== 'rolling', 60);
    expect(chair.state).toBe('idle');
    expect(chair.x).toBeLessThan(s.hero.x - 0.5);
    expect(s.hero.hearts).toBe(4);
  });
});

describe('filing-cabinet drawer', () => {
  it('only hurts while it is out of the wall', () => {
    const s = sim(
      room(12, [
        ['S', 6, 3],
        ['d', 1, 3],
      ]),
    );
    const drawer = find(s, 'drawer');
    expect(drawer.dir).toBe(1);
    /** @type {Set<string>} */
    const hurtIn = new Set();
    /** @type {Set<string>} */
    const seen = new Set();
    for (let i = 0; i < 2 * 60 * 2.8; i++) {
      const hurt = standAndStep(s, 1.3);
      seen.add(drawer.state);
      if (hurt) {
        hurtIn.add(drawer.state);
        expect(drawer.w ?? 0).toBeGreaterThan(0.2);
      }
    }
    expect([...seen].sort()).toEqual(['closed', 'closing', 'out', 'rattle']);
    expect(hurtIn.has('out')).toBe(true);
    expect(hurtIn.has('closed')).toBe(false);
    expect(hurtIn.has('rattle')).toBe(false);
  });
});

describe('sprinkler', () => {
  const def = room(12, [
    ['S', 9, 3],
    ['w', 6, 10],
    ['k', 2, 3],
  ]);

  it('only hurts while spraying', () => {
    const s = sim(def);
    const sprinkler = find(s, 'sprinkler');
    expect(sprinkler.y0).toBe(3);
    /** @type {Set<string>} */
    const hurtIn = new Set();
    for (let i = 0; i < 2 * 60 * 3.2; i++) if (standAndStep(s, 6.19)) hurtIn.add(sprinkler.state);
    expect([...hurtIn]).toEqual(['on']);
  });

  it('stops for good once the water is shut off', () => {
    const s = sim(def);
    const sprinkler = find(s, 'sprinkler');
    Object.assign(s.hero, { x: 2.2 });
    const events = run(s, IDLE, 1);
    expect(has(events, 'switch')).toBe(true);
    expect(sprinkler.state).toBe('dry');
    for (let i = 0; i < 2 * 60 * 3.2; i++) expect(standAndStep(s, 6.19)).toBe(false);
    expect(sprinkler.state).toBe('dry');
  });
});

describe('projectiles a CR can parry', () => {
  it('knocks printer paper out of the air (hero one step below the printer)', () => {
    // The printer sits on a one-tile platform and fires left at the hero.
    const s = sim(room(20, [['S', 2, 3], ...fill('#', 10, 18, 3, 3), ['P', 12, 4]]));
    expect(find(s, 'printer').dir).toBe(-1);
    const shot = runUntil(s, IDLE, (x) => x.things.some((t) => t.kind === 'paper'), 400);
    expect(shot.ok).toBe(true);
    const events = throwCr(s).concat(
      runUntil(s, IDLE, (x) => !x.things.some((t) => t.kind === 'paper'), 200).events,
    );
    expect(has(events, 'parry')).toBe(true);
    expect(has(events, 'hurt')).toBe(false);
    expect(s.hero.hearts).toBe(4);
  });

  it('hits the hero with printer paper when nothing stops it', () => {
    const s = sim(room(20, [['S', 2, 3], ...fill('#', 10, 18, 3, 3), ['P', 12, 4]]));
    const r = runUntil(s, IDLE, (x) => x.hero.hearts < 4, 400);
    expect(r.ok).toBe(true);
  });

  it('knocks a projector KPI slide out of its arc with a well-timed CR', () => {
    const s = sim(
      room(20, [
        ['S', 2, 3],
        ['J', 14, 3],
      ]),
    );
    const shot = runUntil(s, IDLE, (x) => x.things.some((t) => t.kind === 'kpi'), 400);
    expect(shot.ok).toBe(true);
    let parried = 0;
    for (let wait = 0; wait < 60; wait++) {
      const c = structuredClone(s);
      run(c, IDLE, wait);
      const events = throwCr(c).concat(
        runUntil(c, IDLE, (x) => !x.things.some((t) => t.kind === 'kpi'), 300).events,
      );
      if (has(events, 'parry')) {
        parried++;
        expect(c.things.some((t) => t.kind === 'cr')).toBe(false);
        expect(c.hero.hearts).toBe(4);
      }
    }
    expect(parried).toBeGreaterThan(0);
  });
});

describe('falling things land like anything heavy', () => {
  it('a loose slab shatters on the floor below instead of sinking through it', () => {
    // A slab at y = 6 over open space down to the floor (top y = 3).
    const s = sim(
      room(12, [['S', 2, 3], ...fill('#', 4, 4, 6, 6), ['-', 5, 6], ...fill('#', 6, 7, 6, 6)]),
    );
    const slab = find(s, 'loose');
    slab.state = 'shaking';
    const r = runUntil(s, IDLE, () => slab.state === 'gone', 120);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'smash')).toBe(true);
    expect(slab.y).toBe(3);
  });

  it('a loose slab falling on the hero hurts like a ceiling panel', () => {
    const s = sim(
      room(12, [['S', 5, 3], ...fill('#', 4, 4, 6, 6), ['-', 5, 6], ...fill('#', 6, 7, 6, 6)]),
    );
    s.hero.x = 5.19;
    find(s, 'loose').state = 'shaking';
    const r = runUntil(s, IDLE, (x) => x.hero.hearts < 4, 90);
    expect(r.ok).toBe(true);
  });

  it('a ceiling panel does not drop on a hero walking a floor further down', () => {
    // Panel at y = 10 above a shelf (top y = 7); the hero walks beneath the shelf.
    const s = sim(room(14, [['S', 2, 3], ['F', 7, 10], ...fill('#', 5, 9, 6, 6)]));
    const panel = find(s, 'panel');
    run(s, input({ right: true }), 90);
    expect(s.hero.x).toBeGreaterThan(9);
    expect(panel.state).toBe('armed');
    // On the shelf, right beneath it, it does.
    Object.assign(s.hero, { x: 7.2, y: 7, vx: 0, vy: 0, state: 'ground' });
    expect(has(run(s, IDLE, 1), 'crack')).toBe(true);
  });

  it('panels and binders hang back in place when the hero respawns', () => {
    const s = sim(
      room(14, [
        ['S', 2, 3],
        ['F', 7, 10],
        ['O', 9, 8],
      ]),
    );
    run(s, input({ right: true }), 100);
    const [panel, binders] = s.things.filter((t) => t.kind === 'panel');
    runUntil(s, IDLE, () => panel.state === 'broken' && binders.state === 'broken', 200);
    expect(panel.state).toBe('broken');
    s.hero.state = 'dead';
    s.hero.stateTime = 0;
    runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200);
    expect([panel.state, panel.y, binders.state, binders.y]).toEqual(['armed', 10, 'armed', 8]);
  });
});

describe('office chair and loose floor', () => {
  it('cracks a loose slab it rolls over and drops when it gives way; back home on respawn', () => {
    const s = sim(
      room(20, [
        ['S', 12, 3],
        ['c', 8, 3],
        ['-', 9, 2],
        ['^', 9, 1],
      ]),
    );
    const chair = find(s, 'chair');
    const slab = find(s, 'loose');
    // Parked on the slab, as after a charge.
    chair.x = 9.5;
    s.hero.x = 18;
    const r = runUntil(s, IDLE, () => !chair.alive, 120);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'crack')).toBe(true);
    expect(slab.state).not.toBe('idle');
    s.hero.state = 'dead';
    s.hero.stateTime = 0;
    runUntil(s, IDLE, (x) => x.hero.state !== 'dead', 200);
    expect([chair.alive, chair.x, chair.y, chair.state]).toEqual([true, 8.5, 3, 'idle']);
  });
});

describe('knockback', () => {
  it('throws the hero away from the trap, whichever way the hero faces', () => {
    for (const facing of [1, -1]) {
      const s = sim(
        room(12, [
          ['S', 6, 3],
          ['d', 1, 3],
        ]),
      );
      runUntil(s, IDLE, () => (find(s, 'drawer').w ?? 0) > 0.8, 400);
      Object.assign(s.hero, { x: 1.3, facing, invuln: 0 });
      run(s, IDLE, 1);
      expect(s.hero.hearts).toBe(3);
      // The drawer comes out of the left wall: the hero flies right.
      expect(s.hero.vx).toBeGreaterThan(0);
    }
  });
});

describe('water-cooler bottle', () => {
  const def = room(16, [
    ['S', 2, 3],
    ['R', 10, 3],
    ['K', 3, 3],
  ]);

  it('only hurts where the bottle is (0.6 across)', () => {
    const s = sim(def);
    const bottle = find(s, 'bottle');
    bottle.state = 'rolling';
    bottle.vx = 0;
    s.things = s.things.filter((t) => t.kind !== 'key');
    // 0.36 from its centre (one step rolls it a hair closer): clear of it.
    Object.assign(s.hero, { x: bottle.x - 0.36 - HERO.w, invuln: 0 });
    run(s, IDLE, 1);
    expect(s.hero.hearts).toBe(4);
    // Right against it: hurt.
    Object.assign(s.hero, { x: bottle.x - 0.25 - HERO.w, invuln: 0 });
    run(s, IDLE, 1);
    expect(s.hero.hearts).toBe(3);
  });

  it('bursts under a CR while still on its shelf', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['R', 10, 3],
      ]),
    );
    const events = throwCr(s).concat(run(s, IDLE, 60));
    expect(has(events, 'splash')).toBe(true);
    expect(find(s, 'bottle').state).toBe('burst');
  });
});

describe('rolling things run into people', () => {
  it('a rolling bottle bowls over someone in its way, like the hero, and bursts on a chair', () => {
    const s = sim(
      room(20, [
        ['S', 2, 3],
        ['c', 5, 3],
        ['n', 9, 3],
        ['R', 14, 3],
      ]),
    );
    const colleague = find(s, 'colleague');
    colleague.vx = 0;
    s.hero.x = 17;
    const bottle = find(s, 'bottle');
    bottle.state = 'rolling';
    const r = runUntil(s, IDLE, () => bottle.state === 'burst', 180);
    expect(r.ok).toBe(true);
    expect(has(r.events, 'meeting')).toBe(true);
    expect(colleague.state).toBe('meeting');
    // Past the colleague, stopped by the chair.
    expect(bottle.x).toBeLessThan(colleague.x);
    expect(bottle.x).toBeGreaterThan(find(s, 'chair').x);
  });

  it('a charging chair stops against someone in its way', () => {
    const s = sim(
      room(24, [
        ['S', 18, 3],
        ['c', 6, 3],
        ['i', 12, 3],
      ]),
    );
    const chair = find(s, 'chair');
    const intern = find(s, 'intern');
    Object.assign(intern, { vx: 0, state: 'stunned', t: -100 });
    Object.assign(chair, { state: 'rolling', vx: 6.5 });
    const r = runUntil(s, IDLE, () => chair.state !== 'rolling', 120);
    expect(r.ok).toBe(true);
    expect(chair.x).toBeLessThan(intern.x);
    expect(has(r.events, 'chairBump')).toBe(true);
  });

  it('a charging chair that rams the hero stops there', () => {
    const s = sim(
      room(24, [
        ['S', 12, 3],
        ['c', 6, 3],
      ]),
    );
    const chair = find(s, 'chair');
    Object.assign(chair, { state: 'rolling', vx: 6.5 });
    const r = runUntil(s, IDLE, () => chair.state !== 'rolling', 120);
    expect(r.ok).toBe(true);
    expect(s.hero.hearts).toBe(3);
    expect(chair.x).toBeLessThan(13);
  });
});

describe('sprinkler water', () => {
  it('splashes on top of archive boxes, and down to the floor once they are knocked out', () => {
    const s = sim(room(12, [['S', 2, 3], ['w', 6, 10], ...fill('A', 6, 6, 3, 4)]), 'kevin');
    const sprinkler = find(s, 'sprinkler');
    run(s, IDLE, 1);
    expect(sprinkler.y0).toBe(5);
    throwCr(s);
    run(s, IDLE, 60);
    expect(sprinkler.y0).toBe(3);
  });
});

describe('water-cooler bottle support', () => {
  it('falls and bursts when the archive boxes under it are knocked out', () => {
    const s = sim(room(16, [['S', 2, 3], ...fill('A', 8, 8, 3, 4), ['R', 8, 5]]), 'kevin');
    const bottle = find(s, 'bottle');
    const events = throwCr(s).concat(runUntil(s, IDLE, () => bottle.state === 'burst', 120).events);
    expect(has(events, 'archive')).toBe(true);
    expect(has(events, 'splash')).toBe(true);
  });
});
