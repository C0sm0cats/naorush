import { describe, expect, it } from 'vitest';
import { ROOFTOP } from '../src/data/levels/rooftop.js';
import { TS } from '../src/data/levels/ts.js';
import { BOSS_DEBRIS, PATTERNS, arenaFloor } from '../src/game/boss.js';
import { HERO, createSim, step } from '../src/game/sim.js';
import { hurt, make } from '../src/game/world.js';
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
  Object.assign(s.hero, { x: gate + 3, y: 3, invuln: 1e9 });
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
    const name = b.variant ? `${b.state}:${b.variant}` : b.state;
    if (name !== last) played.add(name);
    last = name;
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
  return { s, b, unfair, played, phase, x0, x1 };
}

describe.each([TS, ROOFTOP])('$name duel', (level) => {
  const id = level.boss?.id ?? 'techServicesDirector';
  const fight = referee(level);

  it('ends with the director signing', () => {
    expect(fight.s.bossDone).toBe(true);
    expect(fight.phase).toBe(PATTERNS[id].seq.length);
  });

  it('plays every attack of every phase', () => {
    const all = new Set(PATTERNS[id].seq.flat());
    expect([...all].filter((a) => !fight.played.has(a))).toEqual([]);
  });

  it('telegraphs every attack 0.6 s ahead, keeps consults calm and a dark spot free', () => {
    expect(fight.unfair).toEqual([]);
  });
});

describe('Rodolphe’s grand finale', () => {
  it('starts at his last argument, clears the stage and opens with the spotlight', () => {
    const s = createSim(ROOFTOP, 'charline');
    const b = s.things.find((t) => t.kind === 'boss');
    if (!b) throw new Error('no boss');
    Object.assign(s.hero, { x: 85, y: 3, invuln: 1e9 });
    runUntil(s, IDLE, () => b.state === 'consult', 60 * 30);
    Object.assign(b, { hp: 2, phase: 2 });
    s.things.push(make('wave', 90, 3, { state: 'run' }));
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
    Object.assign(s.hero, { x: 86, y: 3, invuln: 1e9 });
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
