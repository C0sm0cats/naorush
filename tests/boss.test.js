import { describe, expect, it } from 'vitest';
import { PRIMO_SLOW, PrimoCue, bossLighting, bossLights, fightFocus } from '../src/app/staging.js';
import { ROOFTOP } from '../src/data/levels/rooftop.js';
import { TS } from '../src/data/levels/ts.js';
import {
  BOSS_DEBRIS,
  HARDCORE_CONSULT,
  HEADROOM,
  LEAP_HALF,
  PATTERNS,
  RISERS,
  arenaFloor,
  consultLength,
} from '../src/game/boss.js';
import { HERO, createSim, step } from '../src/game/sim.js';
import { DT, TILE, hurt, make, solid } from '../src/game/world.js';
import { IDLE, has, input, room, run, runUntil, sim, throwCr } from './mechanics-kit.js';

/**
 * @typedef {import('./mechanics-kit.js').Sim} Sim
 * @typedef {import('./mechanics-kit.js').SimEvent} SimEvent
 * @typedef {import('../src/game/world.js').Thing} Thing
 */

const HP = 3;
// The hero starts inside the arena, so the fight begins on the first step.
const def = room(
  32,
  [
    ['S', 14, 3],
    ['X', 24, 3],
  ],
  {
    boss: { id: 'techServicesDirector', hp: HP, arena: [6, 30] },
  },
);

/** Kévin, untouchable by ordinary hits so the script can focus on the director. */
function fight() {
  const s = sim(def, 'kevin');
  s.hero.invuln = 1e9;
  const boss = s.things.find((t) => t.kind === 'boss');
  if (!boss) throw new Error('no boss');
  return { s, boss };
}

/** Faces the director, throws one CR and waits for it to land. @param {Sim} s @param {Thing} b */
function shootAt(s, b) {
  s.ammo = 9;
  const want = Math.sign(b.x - (s.hero.x + HERO.w / 2)) || 1;
  /** @type {SimEvent[]} */
  const events = [];
  if (s.hero.facing !== want)
    events.push(...run(s, input(want > 0 ? { right: true } : { left: true }), 1));
  events.push(...throwCr(s));
  events.push(...runUntil(s, IDLE, (x) => !x.things.some((t) => t.kind === 'cr'), 120).events);
  return events;
}

/**
 * Waits for the director to consult PRIMO and lands a CR then.
 * @param {Sim} s @param {Thing} b
 */
function hitDuringConsult(s, b) {
  const hp = b.hp ?? 0;
  /** @type {SimEvent[]} */
  const events = [];
  for (let tries = 0; tries < 6 && b.hp === hp; tries++) {
    const wait = runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    expect(wait.ok, 'director never consults PRIMO').toBe(true);
    events.push(...wait.events);
    while (b.state === 'consult' && b.hp === hp) events.push(...shootAt(s, b));
  }
  expect(b.hp).toBe(hp - 1);
  return events;
}

/** Gate columns of the real arenas: positions in them are written from there. */
const TS0 = TS.boss?.arena[0] ?? 0;
const ROOF0 = ROOFTOP.boss?.arena[0] ?? 0;

/** @param {Sim} s */
const debris = (s) => s.things.filter((t) => BOSS_DEBRIS.has(t.kind));

describe('boss duel', () => {
  it('starts when the hero stands in the arena', () => {
    const { s, boss } = fight();
    const events = run(s, IDLE, 1);
    expect(has(events, 'bossStart')).toBe(true);
    expect(s.bossActive).toBe(true);
    expect(boss.state).not.toBe('idle');
  });

  it('shrugs off CRs outside consult', () => {
    const { s, boss } = fight();
    run(s, IDLE, 1);
    expect(boss.state).not.toBe('consult');
    const events = shootAt(s, boss);
    expect(has(events, 'block')).toBe(true);
    // Tagged so the HUD's « attends qu’il consulte PRIMO » only shows for a boss.
    expect(events.find((e) => e.type === 'block')?.cause).toBe('boss');
    expect(has(events, 'bossHit')).toBe(false);
    expect(boss.hp).toBe(HP);
  });

  it('loses an argument to a CR during consult', () => {
    const { s, boss } = fight();
    const events = hitDuringConsult(s, boss);
    expect(has(events, 'bossHit')).toBe(true);
    expect(s.bossDone).toBe(false);
  });

  it('signs and drops the stage key once convinced', () => {
    const { s, boss } = fight();
    /** @type {SimEvent[]} */
    const events = [];
    for (let i = 0; i < HP; i++) events.push(...hitDuringConsult(s, boss));
    expect(has(events, 'bossDone')).toBe(true);
    expect(s.bossDone).toBe(true);
    expect(boss.state).toBe('convinced');
    expect(debris(s)).toEqual([]);
    const sign = runUntil(s, IDLE, (x) => x.things.some((t) => t.kind === 'key'), 300);
    expect(sign.ok).toBe(true);
    expect(has(sign.events, 'sign')).toBe(true);
    expect(boss.state).toBe('sign');
    const key = s.things.find((t) => t.kind === 'key');
    expect(key?.alive).toBe(true);
    expect(Math.abs((key?.x ?? 0) - boss.x)).toBeLessThan(3);
    expect(s.hasKey).toBe(false);
  });

  it('starts over from the top, debris cleared, when the hero respawns', () => {
    const { s, boss } = fight();
    hitDuringConsult(s, boss);
    const busy = runUntil(s, IDLE, (x) => debris(x).length > 0, 60 * 20);
    expect(busy.ok).toBe(true);
    hurt(s, s.hero, 'void');
    expect(s.hero.state).toBe('dead');
    const back = runUntil(s, IDLE, (x) => has(x.events, 'respawn'), 200);
    expect(back.ok).toBe(true);
    expect(s.bossActive).toBe(false);
    expect(boss.state).toBe('idle');
    expect(boss.hp).toBe(HP);
    expect(boss.phase).toBe(1);
    expect(boss.x).toBe(boss.home);
    expect(debris(s)).toEqual([]);
  });
});

/**
 * Plays a real stage's duel with an untouchable hero who lands a CR at every
 * consult, checking fairness on every frame.
 * @param {import('../src/data/levels/index.js').Level} level
 */
function referee(level) {
  const s = createSim(level, 'kevin');
  const [gate] = level.boss?.arena ?? [0];
  // Clear of the risers, with a line of sight to every spot the director takes.
  Object.assign(s.hero, { x: gate + 5, y: 3, invuln: 1e9 });
  const b = s.things.find((t) => t.kind === 'boss');
  if (!b) throw new Error('no boss');
  const [x0, x1] = arenaFloor(s, b);
  /** @type {string[]} */
  const unfair = [];
  const played = new Set();
  /** @type {WeakMap<object, number>} */
  const born = new WeakMap();
  let phase = 1;
  let last = '';
  let start = -1;
  /** Where the director stood at the start of each step. @type {Set<number>} */
  const spots = new Set();
  /** @param {number} x @param {number} rows Free tiles over a director standing at x. */
  const room = (x, rows, half = 0.4) => {
    const floor = b.y0 ?? b.y;
    for (let c = Math.floor(x - half); c <= Math.floor(x + half); c++)
      for (let r = floor; r < floor + rows; r++) if (solid(s, c, r)) return false;
    return true;
  };
  for (let frame = 0; frame < 60 * 240 && !s.bossDone; frame++) {
    s.ammo = 9;
    s.hero.invuln = 1e9;
    const hx = s.hero.x + HERO.w / 2;
    const want = Math.sign(b.x - hx) || 1;
    const flying = s.things.some((t) => t.kind === 'cr' && t.alive);
    let inp = IDLE;
    if (b.state === 'consult' && !flying)
      inp =
        s.hero.facing !== want
          ? input(want > 0 ? { right: true } : { left: true })
          : s.fireHeld
            ? IDLE
            : input({ fire: true });
    step(s, inp);
    const now = s.time;
    if (start < 0 && s.bossActive) start = now;
    const name = b.variant ? `${b.state}:${b.variant}` : b.state;
    if (name !== last) {
      played.add(name);
      spots.add(Math.round(b.x * 2) / 2);
    }
    last = name;
    // Room over his head wherever he stands, the whole height of a leap when he leaps.
    if (!room(b.x, 3)) unfair.push(`no headroom at x=${b.x.toFixed(2)} during ${name}`);
    if (b.state === 'leap' && !room(b.x, HEADROOM, LEAP_HALF))
      unfair.push(`leap under a ceiling at x=${b.x.toFixed(2)}`);
    phase = Math.max(phase, b.phase ?? 1);
    const tag = `${name} (phase ${b.phase}, ${b.t.toFixed(2)} s)`;
    for (const t of s.things) {
      if (!t.alive || !BOSS_DEBRIS.has(t.kind)) continue;
      if (!born.has(t)) {
        born.set(t, now);
        if ((t.kind === 'kpi' || t.kind === 'wave') && b.t < 0.6)
          unfair.push(`${t.kind} at ${tag}`);
      }
      const warned = now - (born.get(t) ?? now);
      if (t.kind === 'rack' && t.state === 'fall' && warned < 0.6) unfair.push(`rack at ${tag}`);
      if (t.kind === 'zone' && t.state === 'live' && warned < 0.6) unfair.push(`zone at ${tag}`);
    }
    if (b.state === 'dash' && b.vx !== 0 && b.t < 0.6) unfair.push(`dash at ${tag}`);
    // A consult window is calm: nothing in flight, nothing about to strike.
    if (b.state === 'consult') {
      const busy = s.things.filter(
        (t) => t.alive && BOSS_DEBRIS.has(t.kind) && !(t.kind === 'rack' && t.state === 'landed'),
      );
      if (busy.length) unfair.push(`${busy[0].kind} ${busy[0].state} during ${tag}`);
    }
    // Somewhere on the floor always stays dark.
    const lit = s.things.filter((t) => t.alive && t.kind === 'zone' && t.variant !== 'arrow');
    let dark = false;
    for (let x = x0 + HERO.w / 2; x <= x1 - HERO.w / 2 && !dark; x += 0.05)
      dark = !lit.some((z) => x + HERO.w / 2 > z.x && x - HERO.w / 2 < z.x + (z.w ?? 1));
    if (!dark) unfair.push(`no dark spot at ${tag}`);
  }
  return { s, b, unfair, played, phase, x0, x1, spots, length: s.time - start };
}

describe.each([TS, ROOFTOP])('$name duel', (level) => {
  const id = level.boss?.id ?? 'techServicesDirector';
  const fight = referee(level);

  it('ends with the director signing', () => {
    expect(fight.s.bossDone).toBe(true);
    expect(fight.phase).toBe(PATTERNS[id].seq.length);
  });

  it('lasts a minute or more even for a flawless player, on the same conviction', () => {
    // Richer phases, not more arguments to win: a CR lands on the first frame of every consult.
    expect(fight.length).toBeGreaterThanOrEqual(60);
    expect(fight.length).toBeLessThanOrEqual(90);
    expect(level.boss?.hp).toBe(id === 'techServicesDirector' ? 4 : 5);
  });

  it('plays every attack of every phase', () => {
    const all = new Set(PATTERNS[id].seq.flat());
    expect([...all].filter((a) => !fight.played.has(a))).toEqual([]);
  });

  it('telegraphs every attack 0.6 s ahead, keeps consults calm and a dark spot free', () => {
    expect(fight.unfair).toEqual([]);
  });

  it('moves around the arena', () => {
    // Julien between his console and his racks, Rodolphe across the stage.
    expect(fight.spots.size).toBeGreaterThanOrEqual(2);
    if (id === 'techServicesDirector') {
      const home = fight.b.home ?? 0;
      expect([...fight.spots].some((x) => Math.abs(x - home) < 0.6)).toBe(true);
      expect([...fight.spots].some((x) => Math.abs(x - home) > 3)).toBe(true);
    }
  });
});

/**
 * A real stage's duel brought to the consult that ends phase 1, hero at `x`.
 * @param {import('../src/data/levels/index.js').Level} level @param {number} x
 */
function toPhase2(level, x) {
  const s = createSim(level, 'kevin');
  const b = s.things.find((t) => t.kind === 'boss');
  if (!b) throw new Error('no boss');
  Object.assign(s.hero, { x, y: 3, invuln: 1e9 });
  runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
  const next = PATTERNS[s.boss?.id ?? 'techServicesDirector'].phases[0];
  b.hp = next + 1;
  while (b.state !== 'consult') step(s, IDLE);
  while (b.hp > next) shootAt(s, b);
  expect(b.state).toBe('phase');
  return { s, b };
}

/** @param {Sim} s */
const risers = (s) => s.things.filter((t) => t.kind === 'lift' && t.variant === 'riser');

describe.each([TS, ROOFTOP])('$name arena', (level) => {
  const id = level.boss?.id ?? 'techServicesDirector';
  const plan = RISERS[id];

  it('brings two risers in with the second phase, solid once in place', () => {
    const { s, b } = toPhase2(level, (level.boss?.arena[0] ?? 0) + 5);
    const floor = b.y0 ?? b.y;
    expect(risers(s).length).toBe(plan.cols.length);
    for (const r of risers(s)) expect(solid(s, r.x, floor)).toBe(false);
    const set = runUntil(s, IDLE, () => risers(s).every((r) => r.state === 'set'), 200);
    expect(set.ok).toBe(true);
    // In place before the director moves on: the next attack plays on the new arena.
    expect(b.state).toBe('phase');
    for (const r of risers(s)) {
      expect(r.y).toBeCloseTo(floor + 1);
      for (let c = r.x; c < r.x + (r.w ?? 2); c++) {
        expect(solid(s, c, floor)).toBe(true);
        expect(solid(s, c, floor + 1)).toBe(false);
      }
    }
  });

  it(
    plan.rise ? 'lifts a hero standing on a rising rack' : 'waits above a hero under a truss',
    () => {
      const [x0] = arenaFloor(
        s0(level),
        s0(level).things.find((t) => t.kind === 'boss') ?? make('boss', 0, 0),
      );
      const col = x0 + plan.cols[0];
      const { s, b } = toPhase2(level, col + 0.6);
      const floor = b.y0 ?? b.y;
      const r = risers(s)[0];
      run(s, IDLE, 90);
      if (plan.rise) {
        expect(s.hero.y).toBeCloseTo(floor + 1, 1);
        expect(r.state).toBe('set');
      } else {
        // Held just over his head, and down in place once he steps away.
        expect(r.state).toBe('moving');
        expect(r.y - 1).toBeGreaterThan(s.hero.y + HERO.h);
        run(s, input({ right: true }), 30);
        run(s, IDLE, 30);
        expect(r.state).toBe('set');
      }
      expect(s.hero.hearts).toBe(s.stats.hearts);
    },
  );

  it('lights the risers’ tops (and any step up) with the floor', () => {
    const { s, b } = toPhase2(level, (level.boss?.arena[0] ?? 0) + 5);
    const floor = b.y0 ?? b.y;
    /** @param {Thing} z */
    const onRiser = (z) =>
      risers(s).some((r) => r.state === 'set' && z.x < r.x + (r.w ?? 2) && z.x + (z.w ?? 1) > r.x);
    runUntil(
      s,
      IDLE,
      () => s.things.some((t) => t.kind === 'zone' && t.variant !== 'arrow' && onRiser(t)),
      60 * 30,
    );
    const zones = s.things.filter((t) => t.kind === 'zone' && t.variant !== 'arrow');
    let raisedLit = false;
    for (const z of zones) {
      const c = Math.floor(z.x + 0.01);
      const raised = risers(s).some((r) => c >= r.x && c < r.x + (r.w ?? 2));
      raisedLit ||= raised;
      if (raised) expect(z.y).toBe(floor + 1);
      // Wherever it lies, on the floor's top: never inside a block, never in the air.
      for (let x = Math.floor(z.x + 0.01); x < z.x + (z.w ?? 1) - 0.01; x++) {
        expect(solid(s, x, z.y)).toBe(false);
        expect(solid(s, x, z.y - 1)).toBe(true);
      }
    }
    expect(raisedLit).toBe(true);
  });

  it('takes the risers away once he signs, and at once when the duel starts over', () => {
    const { s, b } = toPhase2(level, (level.boss?.arena[0] ?? 0) + 5);
    const floor = b.y0 ?? b.y;
    runUntil(s, IDLE, () => risers(s).every((r) => r.state === 'set'), 200);
    const cols = risers(s).map((r) => r.x);
    hurt(s, s.hero, 'void');
    runUntil(s, IDLE, (x) => has(x.events, 'respawn'), 200);
    expect(risers(s)).toEqual([]);
    for (const c of cols) expect(solid(s, c, floor)).toBe(false);

    const again = toPhase2(level, (level.boss?.arena[0] ?? 0) + 5);
    runUntil(again.s, IDLE, () => risers(again.s).every((r) => r.state === 'set'), 200);
    while (!again.s.bossDone) hitDuringConsult(again.s, again.b);
    const gone = runUntil(again.s, IDLE, () => risers(again.s).length === 0, 60 * 4);
    expect(gone.ok).toBe(true);
    for (const c of cols) expect(solid(again.s, c, floor)).toBe(false);
  });
});

/** @param {import('../src/data/levels/index.js').Level} level */
const s0 = (level) => createSim(level, 'kevin');

describe('Rodolphe’s leaps', () => {
  it('walks out from under a low ceiling before he leaps', () => {
    const s = createSim(ROOFTOP, 'kevin');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    const floor = b.y0 ?? b.y;
    Object.assign(s.hero, { x: ROOF0 + 3, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    // Right under a block two tiles over the stage, about to leap.
    const low = arenaFloor(s, b)[0] + 5;
    for (const c of [low, low + 1]) s.tiles[c + (floor + 2) * s.w] = TILE.SOLID;
    Object.assign(b, { x: (low ?? 0) + 0.5, state: 'hit', t: 0.6, step: 0 });
    const leap = runUntil(s, IDLE, () => b.state === 'leap', 60 * 3);
    expect(leap.ok).toBe(true);
    for (let c = Math.floor(b.x - LEAP_HALF); c <= Math.floor(b.x + LEAP_HALF); c++)
      for (let r = floor; r < floor + HEADROOM; r++) expect(solid(s, c, r)).toBe(false);
  });
});

describe('« Sans filet »', () => {
  it('shortens every PRIMO consult by 0.4 s', () => {
    const { s, boss } = fight();
    const normal = consultLength(s, boss);
    s.hardcore = true;
    expect(consultLength(s, boss)).toBeCloseTo(normal - HARDCORE_CONSULT);
    expect(HARDCORE_CONSULT).toBe(0.4);
    runUntil(s, IDLE, () => boss.state === 'consult', 60 * 30);
    const end = runUntil(s, IDLE, () => boss.state !== 'consult', 60 * 5);
    expect(end.ok).toBe(true);
    expect(boss.t).toBeLessThan(normal - HARDCORE_CONSULT + 0.6 + 2 * DT);
  });
});

/**
 * A real stage's director about to play step `name` of `phase`, hero at `x`
 * (untouchable unless `hit` is set); returns once the step has begun.
 * @param {import('../src/data/levels/index.js').Level} level @param {number} phase
 * @param {string} name @param {number} x @param {boolean} [hit]
 */
function playing(level, phase, name, x, hit = false) {
  const s = createSim(level, 'kevin');
  const b = s.things.find((t) => t.kind === 'boss');
  if (!b) throw new Error('no boss');
  Object.assign(s.hero, { x, y: 3, invuln: 1e9 });
  runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
  const at = PATTERNS[s.boss?.id ?? 'techServicesDirector'].seq[phase - 1].indexOf(name);
  expect(at).toBeGreaterThanOrEqual(0);
  Object.assign(b, { phase, step: at - 1, state: 'hit', t: 0.6 });
  s.things = s.things.filter((t) => !BOSS_DEBRIS.has(t.kind));
  const go = runUntil(s, IDLE, () => `${b.state}:${b.variant}` === name, 60 * 5);
  expect(go.ok).toBe(true);
  if (hit) s.hero.invuln = 0;
  // Its first frame: whatever it lays out on the floor at once is there.
  return { s, b, events: [...go.events, ...run(s, IDLE, 1)] };
}

/** Stretches of the arena floor no warned or live zone covers. @param {Sim} s @param {Thing} b */
function darkSpans(s, b) {
  const [x0, x1] = arenaFloor(s, b);
  const lit = s.things.filter((t) => t.alive && t.kind === 'zone' && t.variant !== 'arrow');
  /** @type {[number, number][]} */
  const spans = [];
  for (let i = 0; i < Math.round((x1 - x0) / 0.05); i++) {
    const x = x0 + i * 0.05;
    const dark = !lit.some((z) => x + 0.025 > z.x && x + 0.025 < z.x + (z.w ?? 1));
    const last = spans[spans.length - 1];
    if (!dark) continue;
    if (last && Math.abs(last[1] - x) < 0.06) last[1] = x + 0.05;
    else spans.push([x, x + 0.05]);
  }
  return spans;
}

describe.each([TS, ROOFTOP])('$name: nowhere to hide', (level) => {
  const id = level.boss?.id ?? 'techServicesDirector';
  it('hits a hero who stands still, wherever he stands, in every phase', () => {
    const probe = createSim(level, 'kevin');
    const pb = probe.things.find((t) => t.kind === 'boss') ?? make('boss', 0, 0);
    const [x0, x1] = arenaFloor(probe, pb);
    /** @type {string[]} */
    const safe = [];
    for (let phase = 1; phase <= PATTERNS[id].seq.length; phase++)
      for (let x = x0 + 0.5; x < x1; x += 1) {
        const { s, b } =
          phase === 1
            ? (() => {
                const s = createSim(level, 'kevin');
                const b = s.things.find((t) => t.kind === 'boss') ?? make('boss', 0, 0);
                Object.assign(s.hero, { x: x0 + 2, y: 3 });
                runUntil(s, IDLE, () => s.bossActive, 60);
                return { s, b };
              })()
            : toPhase2(level, x0 + 2);
        if (phase === 3) Object.assign(b, { phase: 3, hp: 1, state: 'phase', t: 0 });
        // Out of the way of the director's first walk: placed once the phase starts.
        runUntil(s, IDLE, () => b.state !== 'phase' && b.state !== 'intro', 60 * 3);
        s.things = s.things.filter((t) => !BOSS_DEBRIS.has(t.kind));
        const c = Math.floor(x);
        let y = b.y0 ?? b.y;
        while (solid(s, c, y)) y++;
        Object.assign(s.hero, { x: x - HERO.w / 2, y, vx: 0, vy: 0, invuln: 0 });
        s.assist = true;
        // One whole round of the phase: from here to the end of its last consult.
        const rounds = PATTERNS[id].seq[phase - 1].filter((a) => a === 'consult').length;
        let consults = 0;
        let hits = 0;
        let was = b.state;
        runUntil(
          s,
          IDLE,
          (x) => {
            if (has(x.events, 'hurt')) hits++;
            if (was === 'consult' && b.state !== 'consult') consults++;
            was = b.state;
            return consults > rounds || hits > 0;
          },
          60 * 120,
        );
        if (!hits) safe.push(`x=${x} phase ${phase}`);
      }
    expect(safe).toEqual([]);
  });
});

describe('Julien’s new moves', () => {
  it('supervision: three racks, each on the spot the hero stood on as it was warned', () => {
    const x = (TS.boss?.arena[0] ?? 0) + 4;
    const { s, b } = playing(TS, 1, 'rackDrop:tracking', x);
    /** @type {number[]} */
    const want = [];
    const seen = new Set();
    const done = runUntil(
      s,
      input({ right: true }),
      () => {
        for (const r of s.things)
          if (r.kind === 'rack' && !seen.has(r)) {
            seen.add(r);
            // Where he stood a frame ago.
            expect(Math.abs(r.x - (s.hero.x + HERO.w / 2))).toBeLessThan(0.15);
            want.push(r.x);
          }
        return b.state !== 'rackDrop';
      },
      60 * 6,
    );
    expect(done.ok).toBe(true);
    expect(want.length).toBe(3);
    // He kept walking: three different spots.
    expect(want[1] - want[0]).toBeGreaterThan(2);
  });

  it('supervision hurts whoever stands still, never whoever keeps moving', () => {
    const x = (TS.boss?.arena[0] ?? 0) + 4;
    const still = playing(TS, 1, 'rackDrop:tracking', x, true);
    runUntil(still.s, IDLE, () => still.b.state !== 'rackDrop', 60 * 6);
    expect(still.s.hero.hearts).toBeLessThan(still.s.stats.hearts);
    const moving = playing(TS, 1, 'rackDrop:tracking', x, true);
    // A step aside after every shadow.
    /** @type {Set<Thing>} */
    const seen = new Set();
    runUntil(
      moving.s,
      IDLE,
      () => {
        const fresh = moving.s.things.find((r) => r.kind === 'rack' && !seen.has(r));
        if (fresh) {
          seen.add(fresh);
          run(moving.s, input({ right: true }), 18);
        }
        return moving.b.state !== 'rackDrop';
      },
      60 * 6,
    );
    expect(moving.s.hero.hearts).toBe(moving.s.stats.hearts);
  });

  it('maintenance window: the floor goes live but for a window on each side of him, the hero’s a few steps away', () => {
    for (const x of [TS0 + 2, TS0 + 14]) {
      const { s, b } = playing(TS, 1, 'cables:maintenance', x);
      /** The window on the hero's side, and the hero's distance to it. */
      const mine = () => {
        const hx = s.hero.x + HERO.w / 2;
        const spans = darkSpans(s, b);
        expect(spans.length).toBe(2);
        for (const [a0, a1] of spans) expect(a1 - a0).toBeGreaterThanOrEqual(2.9);
        // One on each side of the director: nobody has to get past him.
        expect(spans.filter(([, a1]) => a1 < b.x).length).toBe(1);
        const [a0, a1] = spans.find(([w0]) => w0 < b.x === hx < b.x) ?? [0, 0];
        return { c: (a0 + a1) / 2, d: Math.abs((a0 + a1) / 2 - hx) };
      };
      const first = mine();
      // A few quick steps away (well within the 1 s warning), not where he stands.
      expect(first.d).toBeGreaterThan(2);
      expect(first.d).toBeLessThan(5);
      // He takes it, and the second window opens elsewhere.
      Object.assign(s.hero, { x: first.c - HERO.w / 2 });
      const old = new Set(s.things);
      const next = runUntil(
        s,
        IDLE,
        () => s.things.some((t) => t.kind === 'zone' && !old.has(t)),
        150,
      );
      expect(next.ok).toBe(true);
      expect(mine().d).toBeGreaterThan(2);
    }
  });

  it('maintenance window: dodged flawlessly by walking into each window', () => {
    const { s, b } = playing(TS, 1, 'cables:maintenance', TS0 + 6, true);
    /** @type {Set<Thing>} */
    const seen = new Set();
    runUntil(
      s,
      IDLE,
      () => {
        const fresh = s.things.filter((z) => z.kind === 'zone' && !seen.has(z));
        if (fresh.length) {
          for (const z of fresh) seen.add(z);
          const hx0 = s.hero.x + HERO.w / 2;
          const [w0, w1] =
            darkSpans(s, b).find(([a0]) => a0 < b.x === hx0 < b.x) ?? darkSpans(s, b)[0];
          // Walk there.
          for (let i = 0; i < 50; i++) {
            const hx = s.hero.x + HERO.w / 2;
            if (Math.abs(hx - (w0 + w1) / 2) < 0.3) break;
            step(s, input(hx < (w0 + w1) / 2 ? { right: true } : { left: true }));
          }
        }
        return b.state !== 'cables';
      },
      60 * 6,
    );
    expect(s.hero.hearts).toBe(s.stats.hearts);
  });
});

describe('Rodolphe’s new moves', () => {
  it('leaps twice in a row when the crowd asks for more, each leap wound up again', () => {
    const { s, b } = playing(ROOFTOP, 1, 'leap:double', ROOF0 + 4);
    /** @type {number[]} */
    const slams = [];
    let crouches = 0;
    runUntil(
      s,
      IDLE,
      (x) => {
        if (has(x.events, 'slam')) slams.push(x.time);
        // His own warnings only (the stage's traps have theirs).
        const own = x.events.filter(
          (e) => e.type === 'telegraph' && Math.abs(e.x - b.x) < 0.5 && e.y > b.y + 1,
        );
        if (own.length && b.state === 'leap') crouches++;
        return b.state !== 'leap';
      },
      60 * 6,
    );
    expect(slams.length).toBe(2);
    expect(slams[1] - slams[0]).toBeGreaterThan(1.2);
    expect(crouches).toBe(1);
  });

  it('fans out an encore whose slides land in the gaps of the first', () => {
    const { s, b } = playing(ROOFTOP, 1, 'fan:encore', ROOF0 + 4);
    /** @type {number[][]} */
    const fans = [];
    /** @type {Set<Thing>} */
    const seen = new Set();
    /** @type {number[]} */
    let throwXs = [];
    runUntil(
      s,
      IDLE,
      () => {
        const fresh = s.things.filter((k) => k.kind === 'kpi' && !seen.has(k));
        if (fresh.length) {
          for (const k of fresh) seen.add(k);
          throwXs = fresh.map((k) => Math.abs(k.vx));
          fans.push(throwXs);
        }
        return b.state !== 'fan';
      },
      60 * 6,
    );
    expect(fans.length).toBe(2);
    expect(fans[0].length).toBe(5);
    expect(fans[1].length).toBe(5);
    // Every encore slide flies between two of the first.
    for (let i = 0; i < 4; i++) {
      expect(fans[1][i]).toBeGreaterThan(fans[0][i]);
      expect(fans[1][i]).toBeLessThan(fans[0][i + 1]);
    }
  });

  it('runs the regional tour there and back, with new arrows before the return', () => {
    const { s, b } = playing(ROOFTOP, 2, 'dash:return', ROOF0 + 4);
    /** Where each leg started, and its arrows' direction. @type {{x: number, dir: number}[]} */
    const legs = [];
    /** @type {Set<Thing>} */
    const seen = new Set([]);
    const check = () => {
      for (const z of s.things)
        if (z.kind === 'zone' && z.variant === 'arrow' && !seen.has(z)) {
          seen.add(z);
          legs.push({ x: b.x, dir: z.dir ?? 0 });
        }
      return b.state !== 'dash';
    };
    check();
    runUntil(s, IDLE, check, 60 * 8);
    expect(legs.length).toBe(2);
    expect(legs[1].dir).toBe(-legs[0].dir);
    // Each leg runs a good way across the stage, the way its arrows point.
    expect((legs[1].x - legs[0].x) * legs[0].dir).toBeGreaterThan(3);
    expect((b.x - legs[1].x) * legs[1].dir).toBeGreaterThan(3);
  });
});

describe('Julien’s phase change and signing (QA)', () => {
  /** Julien at his last phase-1 consult, standing at `bx`, the hero at `hx`. @param {number} bx @param {number} hx */
  const atConsult = (bx, hx) => {
    const s = createSim(TS, 'kevin');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    Object.assign(s.hero, { x: hx, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    Object.assign(b, { x: bx, hp: PATTERNS.techServicesDirector.phases[0] + 1, t: 0 });
    return { s, b };
  };

  it('steps off a server rack rising under him, which waits until he has', () => {
    const [x0] = arenaFloor(
      s0(TS),
      s0(TS).things.find((t) => t.kind === 'boss') ?? make('boss', 0, 0),
    );
    for (const bx of [x0 + 8.5, x0 + 9.2, x0 + 2.6]) {
      const { s, b } = atConsult(bx, TS0 + 4);
      const floor = b.y0 ?? b.y;
      while (b.state === 'consult' && b.phase === 1) shootAt(s, b);
      expect(b.state).toBe('phase');
      for (let f = 0; f < 60 * 4; f++) {
        step(s, IDLE);
        // Never inside a rack: his footprint stays clear of solid tiles and rising racks.
        for (const c of [Math.floor(b.x - 0.4), Math.floor(b.x + 0.4)]) {
          expect(solid(s, c, floor), `x=${b.x.toFixed(2)}`).toBe(false);
          for (const r of risers(s))
            if (c >= r.x && c < r.x + (r.w ?? 2))
              expect(r.y, `rack at ${c}`).toBeLessThan(floor + 0.05);
        }
      }
      expect(risers(s).every((r) => r.state === 'set')).toBe(true);
    }
  });

  it('drops the signed envelope on a free tile of the floor, never in the rack stairs', () => {
    const [x0, x1] = arenaFloor(
      s0(TS),
      s0(TS).things.find((t) => t.kind === 'boss') ?? make('boss', 0, 0),
    );
    for (const [bx, hx] of [
      [x1 - 4.5, x0 + 3],
      [x1 - 3.6, x0 + 3],
      [x0 + 1.5, x1 - 6],
      [x0 + 8, x0 + 3],
    ]) {
      const { s, b } = atConsult(bx, hx);
      b.hp = 1;
      while (!s.bossDone) shootAt(s, b);
      const sign = runUntil(s, IDLE, (x) => x.things.some((t) => t.kind === 'key'), 300);
      expect(sign.ok).toBe(true);
      const key = s.things.find((t) => t.kind === 'key');
      const floor = b.y0 ?? b.y;
      const c = Math.floor(key?.x ?? 0);
      expect(solid(s, c, floor), `envelope at ${key?.x}`).toBe(false);
      expect(solid(s, c, floor - 1)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(x0);
      expect(c).toBeLessThan(x1);
      expect(Math.abs((key?.x ?? 0) - b.x)).toBeLessThan(4);
    }
  });
});

describe('Rodolphe’s grand finale', () => {
  it('starts at his last argument, clears the stage and opens with the spotlight', () => {
    const s = createSim(ROOFTOP, 'charline');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    Object.assign(s.hero, { x: ROOF0 + 3, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    Object.assign(b, { hp: 2, phase: 2 });
    s.things.push(make('wave', ROOF0 + 8, 3, { state: 'run' }));
    /** @type {SimEvent[]} */
    const events = [];
    while (b.state === 'consult' && b.hp === 2) events.push(...shootAt(s, b));
    expect(b.hp).toBe(1);
    expect(b.phase).toBe(3);
    expect(b.state).toBe('phase');
    expect(has(events, 'bossPhase')).toBe(true);
    expect(debris(s)).toEqual([]);
    const show = runUntil(s, IDLE, () => b.state !== 'phase', 200);
    expect(show.ok).toBe(true);
    expect(`${b.state}:${b.variant}`).toBe('zones:follow');
  });

  it('puts the spotlight on the hero, wherever he stands', () => {
    const s = createSim(ROOFTOP, 'kevin');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    Object.assign(s.hero, { x: ROOF0 + 4, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    Object.assign(b, { hp: 1, phase: 3, step: -1, state: 'hit', t: 0.6 });
    runUntil(s, IDLE, () => s.things.some((t) => t.kind === 'zone'), 60);
    const spot = s.things.find((t) => t.kind === 'zone');
    const hx = s.hero.x + HERO.w / 2;
    expect(spot?.variant).toBe('spot');
    expect(hx).toBeGreaterThan(spot?.x ?? 0);
    expect(hx).toBeLessThan((spot?.x ?? 0) + (spot?.w ?? 0));
  });
});

describe('fight staging', () => {
  /** A duel in progress on a real stage, hero at `x`. @param {number} x */
  const duel = (x) => {
    const s = createSim(TS, 'kevin');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    Object.assign(s.hero, { x, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'volley', 60 * 5);
    return { s, b };
  };

  it('pulls back as far as the level’s height + 2 on a phone held upright', () => {
    const { s, b } = duel(TS0 + 2);
    const f = fightFocus(s, 0, 412 / 915);
    expect(f?.visH).toBeCloseTo(s.h + 2);
    // Both fighters framed when they are close enough for that width.
    s.hero.x = b.x - 4.2;
    const g = fightFocus(s, 0, 412 / 915);
    const half = ((g?.visH ?? 0) * 412) / 915 / 2;
    for (const x of [s.hero.x + HERO.w / 2, b.x])
      expect(Math.abs(x - (g?.x ?? 0))).toBeLessThanOrEqual(half);
  });

  it('pushes in on the director when an argument lands', () => {
    for (const aspect of [16 / 9, 412 / 915]) {
      const { s, b } = duel(TS0 + 4);
      const before = fightFocus(s, 0, aspect)?.visH ?? 0;
      Object.assign(b, { state: 'hit', t: 0.1 });
      const hit = fightFocus(s, 0, aspect)?.visH ?? 0;
      expect(hit).toBeLessThan(before * 0.9);
      b.t = 0.6;
      expect(fightFocus(s, 0, aspect)?.visH).toBeCloseTo(before);
    }
  });

  it('slows the first PRIMO window of each director down for 0.8 s, once', () => {
    const { s, b } = duel(TS0 + 4);
    const cue = new PrimoCue();
    expect(cue.update(s, 1 / 60)).toBe(1);
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 20);
    expect(cue.update(s, 1 / 60)).toBeLessThan(0.5);
    expect(cue.started).toBe(true);
    expect(cue.ring).toBeGreaterThanOrEqual(0);
    let real = 0;
    while (cue.update(s, 1 / 60) < 1) real += 1 / 60;
    expect(real).toBeCloseTo(PRIMO_SLOW - 1 / 60, 1);
    expect(cue.ring).toBe(-1);
    // Not again for the same director.
    b.state = 'volley';
    cue.update(s, 1 / 60);
    b.state = 'consult';
    expect(cue.update(s, 1 / 60)).toBe(1);
    expect(new PrimoCue(['techServicesDirector']).update(s, 1 / 60)).toBe(1);
  });

  it('flashes white on a phase change only with « Flashs » on', () => {
    const { s, b } = duel(TS0 + 4);
    Object.assign(b, { state: 'phase', phase: 2, t: 0.05 });
    const base = { ...TS.lighting, lights: [] };
    const on = bossLighting(TS, s, 1, base, true).sunColor[0];
    const off = bossLighting(TS, s, 1, base, false).sunColor[0];
    expect(on).toBeGreaterThan(base.sunColor[0] * 1.2);
    expect(off).toBeLessThanOrEqual(base.sunColor[0] * 1.15);
    // No white light on the director either.
    const white = (/** @type {{color: number[]}[]} */ l) =>
      l.some((x) => x.color[0] > 2.5 && x.color[2] > 2.5);
    expect(white(bossLights(TS, s, 1, true))).toBe(true);
    expect(white(bossLights(TS, s, 1, false))).toBe(false);
  });

  it('follows the hero with a rim light in the dark stages only', () => {
    const near = (/** @type {{pos: number[]}[]} */ list, /** @type {Sim} */ s) =>
      list.some((l) => Math.abs(l.pos[0] - s.hero.x) < 1.5 && l.pos[1] > s.hero.y + 1.5);
    const dark = createSim(TS, 'charline');
    expect(near(bossLights(TS, dark, 0), dark)).toBe(true);
    const lit = createSim(ROOFTOP, 'charline');
    expect(near(bossLights(ROOFTOP, lit, 0), lit)).toBe(false);
  });
});
