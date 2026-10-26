import { describe, expect, it } from 'vitest';
import {
  POOL_HALF_DEPTH,
  SIGNALS,
  camView,
  incomingSide,
  signalAt,
  watchCamera,
  zoneSpan,
} from '../src/app/draw-things.js';
import { LEVELS } from '../src/data/levels/index.js';
import { HERO, TILE, createSim, step, tileAt } from '../src/game/sim.js';
import {
  PERIOD,
  SPRINKLER,
  WET,
  phaseOf,
  safeFloor,
  sinceSpray,
  wetSpan,
  wetUnder,
} from '../src/game/traps.js';
import { FONT, SIGN_ROWS, SIGN_TEXT } from '../src/gfx/things.js';
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

describe('one warning language: amber arming, red live, white recovering', () => {
  /**
   * Steps a periodic trap's room through two cycles, recording at each step the
   * drawn signal and whether the trap could hurt (drawer out, spray on) or fired.
   * @param {import('./mechanics-kit.js').Mark[]} marks @param {'drawer'|'sprinkler'|'printer'|'beamer'} kind
   * @param {(s: Sim, t: import('../src/game/sim.js').Thing) => boolean} danger
   */
  function trace(marks, kind, danger) {
    const s = sim(room(20, marks));
    const trap = find(s, kind);
    /** @type {{state: string, danger: boolean}[]} */
    const out = [];
    for (let i = 0; i < 2 * 60 * PERIOD[kind]; i++) {
      run(s, IDLE, 1);
      const sig = signalAt(kind, phaseOf(s, trap, PERIOD[kind]));
      out.push({ state: sig.state, danger: danger(s, trap) });
    }
    return out;
  }

  /** @param {{state: string, danger: boolean}[]} steps */
  function check(steps) {
    // Every dangerous step is drawn red, and the step before danger starts is amber
    // after at least 0.6 s of amber.
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].danger) expect(steps[i].state).toBe('live');
      if (steps[i].state === 'live' && steps[i - 1].state !== 'live') {
        let amber = 0;
        for (let j = i - 1; j >= 0 && steps[j].state === 'arm'; j--) amber++;
        if (i > 60) expect(amber / 60).toBeGreaterThanOrEqual(0.6 - 1e-9);
      }
    }
    // After live comes white, then rest: never straight from red to nothing.
    const order = steps.map((x) => x.state).filter((x, i, a) => x !== a[i - 1]);
    for (let i = 0; i + 1 < order.length; i++) {
      if (order[i] === 'live') expect(order[i + 1]).toBe('recover');
      if (order[i] === 'arm') expect(order[i + 1]).toBe('live');
    }
    expect(new Set(order)).toEqual(new Set(['idle', 'arm', 'live', 'recover']));
  }

  it('drawer: amber well before it rattles out, red while it is out', () => {
    check(
      trace(
        [
          ['S', 8, 3],
          ['d', 1, 3],
        ],
        'drawer',
        (_, t) => (t.w ?? 0) > 0.2 && t.state !== 'rattle',
      ),
    );
  });

  it('sprinkler: amber while it drips, red while it sprays', () => {
    check(
      trace(
        [
          ['S', 12, 3],
          ['w', 6, 10],
        ],
        'sprinkler',
        (_, t) => t.state === 'on',
      ),
    );
  });

  it('printer and projector: amber before the shot, red as it leaves', () => {
    const fired = (/** @type {string} */ kind) => (/** @type {Sim} */ s) =>
      s.events.some((e) => e.type === kind);
    check(
      trace(
        [
          ['S', 2, 3],
          ['P', 14, 3],
        ],
        'printer',
        fired('paperShot'),
      ),
    );
    check(
      trace(
        [
          ['S', 2, 3],
          ['J', 14, 3],
        ],
        'beamer',
        fired('bossThrow'),
      ),
    );
  });

  it('countdown signals cover every periodic trap and never overlap round the cycle', () => {
    for (const kind of /** @type {(keyof typeof PERIOD)[]} */ (Object.keys(PERIOD))) {
      const [arm, live, recover, end] = SIGNALS[kind];
      expect(live - arm).toBeGreaterThanOrEqual(0.6);
      expect(arm < live && live < recover && recover < end).toBe(true);
      expect(end - PERIOD[kind]).toBeLessThan(arm);
    }
  });
});

describe('incoming projectiles', () => {
  const cam = { on: true, x: 10, y: 5, hw: 7, hh: 4 };
  /** @param {Partial<import('../src/game/sim.js').Thing>} o */
  const thing = (o) =>
    /** @type {import('../src/game/sim.js').Thing} */ ({
      kind: 'paper',
      x: 0,
      y: 4,
      vx: 0,
      vy: 0,
      state: 'fly',
      t: 0,
      alive: true,
      ...o,
    });

  it('flags the edge a projectile comes in from in its last 0.6 s off screen', () => {
    // Right edge at x = 17: at 7 tiles/s, 0.6 s is 4.2 tiles out.
    expect(incomingSide(thing({ x: 20, vx: -7 }), cam)).toBe(1);
    expect(incomingSide(thing({ x: 22, vx: -7 }), cam)).toBe(0);
    expect(incomingSide(thing({ x: 0, vx: 6 }), cam)).toBe(-1);
    // Flying away, already in view, or not a projectile: nothing.
    expect(incomingSide(thing({ x: 20, vx: 7 }), cam)).toBe(0);
    expect(incomingSide(thing({ x: 12, vx: -7 }), cam)).toBe(0);
    expect(incomingSide(thing({ kind: 'cr', x: 20, vx: -7 }), cam)).toBe(0);
    expect(incomingSide(thing({ x: 20, vx: -7 }), { ...cam, on: false })).toBe(0);
  });

  it('works from the camera the main loop reports', () => {
    watchCamera(10, 5, 4 / Math.tan((15 * Math.PI) / 180), 7 / 4);
    expect(camView.hh).toBeCloseTo(4, 6);
    expect(camView.hw).toBeCloseTo(7, 6);
    expect(incomingSide(thing({ kind: 'invite', x: 19, vx: -6 }))).toBe(1);
    camView.on = false;
  });
});

describe("Rodolphe's spotlight pools stay on the stage", () => {
  it('are clipped to the arena floor and kept behind the footlights', () => {
    const s = sim(
      room(
        30,
        [
          ['S', 3, 3],
          ['X', 20, 3],
        ],
        { boss: { id: 'regionalDirector', hp: 5, arena: [12, 28] } },
      ),
    );
    // A zone reaching past both ends of the floor (13 to 29).
    const z = /** @type {import('../src/game/sim.js').Thing} */ ({
      kind: 'zone',
      x: 11,
      y: 3,
      w: 20,
      vx: 0,
      vy: 0,
      state: 'warn',
      t: 0,
      alive: true,
    });
    const [x0, x1] = zoneSpan(s, z);
    expect(x0).toBeGreaterThanOrEqual(13);
    expect(x1).toBeLessThanOrEqual(29);
    // Thirds side by side never overlap.
    const a = zoneSpan(s, { ...z, x: 13, w: 16 / 3 })[1];
    const b = zoneSpan(s, { ...z, x: 13 + 16 / 3, w: 16 / 3 })[0];
    expect(a).toBeLessThan(b);
    // The footlights stand at z = 1.18 in front of the stage floor.
    expect(POOL_HALF_DEPTH).toBeLessThan(1.18 - 0.1);
  });
});

describe('arena sign font', () => {
  it('draws É as a full-height capital E with the accent above the line', () => {
    const e = FONT['É'];
    expect(e.length).toBe(SIGN_ROWS);
    // The bottom seven rows are exactly the E: same height as every capital.
    expect(e.slice(-7)).toEqual(FONT.E);
    // An accent, then a free row before the top bar.
    expect(e[0].includes('#') && e[1].includes('#')).toBe(true);
    expect(e[2]).toBe('.....');
    for (const [ch, g] of Object.entries(FONT)) if (ch !== 'É') expect(g.length, ch).toBe(7);
    // Every caption can be lit.
    for (const text of Object.values(SIGN_TEXT))
      for (const ch of text) if (ch !== ' ') expect(FONT[ch], ch).toBeDefined();
  });
});

describe('wet floor (IN1)', () => {
  /**
   * Runs right from the start until x, lets go, and measures how far the hero slides.
   * @param {import('./mechanics-kit.js').Mark[]} marks @param {'kevin'|'charline'} hero
   */
  function stopping(marks, hero) {
    const s = sim(room(40, [['S', 2, 3], ...marks]), hero);
    runUntil(s, input({ right: true }), (k) => k.hero.x > 18);
    const x0 = s.hero.x;
    const { events } = runUntil(s, IDLE, (k) => k.hero.vx === 0, 300);
    return { s, slide: s.hero.x - x0, events };
  }

  it('reads a run of ~ as one puddle on the floor below it', () => {
    const s = sim(room(20, [['S', 2, 3], ...fill('~', 6, 9, 3, 3)]));
    const puddles = s.things.filter((t) => t.kind === 'puddle');
    expect(puddles.map((p) => [p.x, p.y, p.w])).toEqual([[6, 3, 4]]);
    // Not solid, not a hazard: just water.
    expect(tileAt(s, 7, 3)).toBe(TILE.EMPTY);
  });

  it.each(/** @type {const} */ (['kevin', 'charline']))(
    '%s slides about three times further on it, without losing the run',
    (hero) => {
      const dry = stopping([], hero);
      const wet = stopping(fill('~', 10, 30, 3, 3), hero);
      expect(dry.slide).toBeLessThan(0.5);
      expect(wet.slide).toBeGreaterThan(dry.slide * 3);
      // Readable and fair: well under two tiles, and the top speed is the same.
      expect(wet.slide).toBeLessThan(1.8);
      // Feet in the water once, then one slip as the hero lets go.
      expect(wet.events.filter((e) => e.type === 'slip').length).toBe(1);
      expect(wet.s.hero.slip).toBe(false);
    },
  );

  it('splashes as the feet first touch it, slips only when braking or turning', () => {
    const s = sim(room(40, [['S', 2, 3], ...fill('~', 8, 30, 3, 3)]));
    const run1 = runUntil(s, input({ right: true }), (k) => k.hero.x > 20);
    expect(run1.events.filter((e) => e.type === 'puddle').length).toBe(1);
    expect(has(run1.events, 'slip')).toBe(false);
    expect(s.hero.wet).toBe(true);
    // Turning around bites no harder than braking: the hero slides on.
    const turn = run(s, input({ left: true }), 6);
    expect(has(turn, 'slip')).toBe(true);
    expect(s.hero.slip).toBe(true);
    expect(s.hero.vx).toBeGreaterThan(4);
  });

  it('is slow to get going on, and jumps off it as high and as far', () => {
    const s = sim(room(40, fill('~', 6, 30, 3, 3)));
    const d = sim(room(40));
    for (const k of [s, d]) k.hero.x = 10.2;
    run(s, input({ right: true }), 6);
    run(d, input({ right: true }), 6);
    expect(s.hero.vx).toBeLessThan(d.hero.vx * 0.5);
    // At full speed, a jump is the same jump.
    run(s, input({ right: true }), 60);
    run(d, input({ right: true }), 60);
    const xs = s.hero.x,
      xd = d.hero.x;
    run(s, input({ right: true, jump: true }), 20);
    run(d, input({ right: true, jump: true }), 20);
    expect(s.hero.y).toBeCloseTo(d.hero.y, 5);
    expect(s.hero.x - xs).toBeCloseTo(d.hero.x - xd, 5);
  });

  it('is dry on a lift', () => {
    const s = sim(
      room(20, [['S', 2, 3], ...fill('~', 1, 18, 3, 3)], { lifts: [{ x: 1, y: 3, top: 6 }] }),
    );
    run(s, IDLE, 30);
    expect(s.onLift).not.toBe(null);
    expect(wetUnder(s)).toBe(null);
  });

  it('stays wet under a sprinkler for a moment after each spray', () => {
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['w', 8, 10],
      ]),
    );
    const sp = s.things.find((t) => t.kind === 'sprinkler');
    if (!sp) throw new Error('no sprinkler');
    /** @type {Set<string>} */
    const states = new Set();
    for (let i = 0; i < 60 * PERIOD.sprinkler; i++) {
      step(s, IDLE);
      const k = phaseOf(s, sp, PERIOD.sprinkler);
      const wet = wetSpan(s, sp) !== null;
      expect(wet, `phase ${k.toFixed(2)}`).toBe(k >= SPRINKLER.spray || k < WET.after);
      if (wet) states.add(sp.state);
    }
    // Wet while it sprays and while it is off after it; never while it drips (dry by then).
    expect([...states].sort()).toEqual(['off', 'on']);
    expect(WET.after).toBeLessThan(SPRINKLER.drip);
    // Standing in its puddle (the water hitting the feet aside), the floor slips.
    Object.assign(s.hero, { x: 8.5 - HERO.w / 2, y: 3, vx: 0, state: 'ground' });
    s.time += PERIOD.sprinkler - phaseOf(s, sp, PERIOD.sprinkler) + 0.2;
    expect(wetUnder(s)).toBe(sp);
  });

  it('dries up for good a moment after the water is shut off', () => {
    const s = sim(
      room(16, [
        ['w', 8, 10],
        ['k', 4, 3],
      ]),
    );
    const sp = s.things.find((t) => t.kind === 'sprinkler');
    if (!sp) throw new Error('no sprinkler');
    // Standing on the valve.
    s.hero.x = 4.2;
    // Shut off while it sprays: wet for WET.after more seconds.
    s.time = PERIOD.sprinkler * 3 - (sp.phase ?? 0) + SPRINKLER.spray + 0.3 - 1 / 60;
    step(s, IDLE);
    expect(sp.state).toBe('dry');
    expect(sinceSpray(s, sp)).toBeLessThan(0.05);
    const wetFor = runUntil(s, IDLE, () => wetSpan(s, sp) === null, 200).frames / 60;
    expect(wetFor).toBeCloseTo(WET.after, 1);
    run(s, IDLE, 600);
    expect(wetSpan(s, sp)).toBe(null);
  });

  it('drains away beside a gap, live cables or a loose slab: no puddle there', () => {
    const base = /** @type {import('./mechanics-kit.js').Mark[]} */ ([['S', 2, 3]]);
    const safe = sim(room(20, base));
    expect(safeFloor(safe, 8, 10, 3)).toBe(true);
    for (const [ch, c] of /** @type {const} */ ([
      [' ', 12],
      ['^', 6],
      ['-', 11],
    ])) {
      const s = sim(room(20, [...base, [ch, c, 2]]));
      expect(safeFloor(s, 8, 10, 3), `${ch} at ${c}`).toBe(false);
    }
    // A wall in between holds the slide: the gap behind it does not matter.
    expect(safeFloor(sim(room(20, [...base, [' ', 12, 2], ['#', 11, 3]])), 8, 10, 3)).toBe(true);
    // A sprinkler over a gap's edge leaves no wet floor.
    const s = sim(
      room(16, [
        ['S', 2, 3],
        ['w', 8, 10],
        [' ', 10, 2],
        [' ', 10, 1],
        [' ', 10, 0],
      ]),
    );
    const sp = s.things.find((t) => t.kind === 'sprinkler');
    if (!sp) throw new Error('no sprinkler');
    for (let i = 0; i < 60 * PERIOD.sprinkler; i++) {
      step(s, IDLE);
      expect(wetSpan(s, sp)).toBe(null);
    }
  });

  it('plays the same way twice (deterministic)', () => {
    const def = room(40, [['S', 2, 3], ['w', 20, 10], ...fill('~', 8, 14, 3, 3)]);
    /** @param {number} i */
    const plan = (i) => input({ right: i % 90 < 70, left: i % 90 > 80, jump: i % 120 === 60 });
    const a = sim(def, 'charline'),
      b = sim(def, 'charline');
    for (let i = 0; i < 600; i++) {
      step(a, plan(i));
      step(b, plan(i));
    }
    expect(b.hero).toEqual(a.hero);
  });

  it('is never laid by a gap, live cables or a loose slab in any stage', () => {
    for (const level of LEVELS) {
      const s = createSim(level, 'kevin');
      for (const p of s.things.filter((t) => t.kind === 'puddle'))
        expect(safeFloor(s, p.x, p.x + (p.w ?? 1), p.y), `${level.id} ${p.x}`).toBe(true);
    }
    // The tutorial shows one, away from any danger.
    const parking = LEVELS.find((l) => l.id === 'parking');
    if (!parking) throw new Error('no parking');
    expect(createSim(parking, 'kevin').things.some((t) => t.kind === 'puddle')).toBe(true);
  });
});
