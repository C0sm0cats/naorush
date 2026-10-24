import { describe, expect, it } from 'vitest';
import { BOSS_DEBRIS } from '../src/game/boss.js';
import { HERO } from '../src/game/sim.js';
import { hurt } from '../src/game/world.js';
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
