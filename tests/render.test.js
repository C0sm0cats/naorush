import { describe, expect, it } from 'vitest';
import { drawThing } from '../src/app/draw-things.js';
import { bossPose, heroPose, idlePose } from '../src/app/poses.js';
import { CAST } from '../src/data/cast.js';
import { LEVELS } from '../src/data/levels/index.js';
import { buildCharacter, poseCharacter } from '../src/gfx/characters.js';
import { buildProps, propGeometry } from '../src/gfx/props.js';
import { buildThings } from '../src/gfx/things.js';
import { createSim } from '../src/game/sim.js';

/** A WebGL2 stand-in: every method is a no-op, every constant is 0. */
const gl = /** @type {WebGL2RenderingContext} */ (
  /** @type {unknown} */ (
    new Proxy(
      {},
      { get: (_, k) => (typeof k === 'string' && k === k.toUpperCase() ? 0 : () => ({})) },
    )
  )
);

/** Every state a thing can be drawn in. */
const STATES = [
  'idle',
  'walk',
  'meeting',
  'stunned',
  'muted',
  'ring',
  'wobble',
  'rolling',
  'closed',
  'rattle',
  'out',
  'off',
  'drip',
  'on',
  'blink',
  'flicker',
  'warn',
  'fall',
  'landed',
  'live',
  'armed',
  'shaking',
  'falling',
  'broken',
  'gone',
  'found',
  'dry',
  'intro',
  'volley',
  'rackDrop',
  'teleport',
  'cables',
  'fan',
  'leap',
  'dash',
  'zones',
  'consult',
  'hit',
  'phase',
  'convinced',
  'sign',
];

describe('rendering', () => {
  const things = buildThings(gl);
  const props = buildProps(gl);
  /** @type {Record<string, ReturnType<typeof buildCharacter>>} */
  const cast = {};
  for (const id of Object.keys(CAST)) cast[id] = buildCharacter(gl, CAST[id]);
  const view = /** @type {any} */ ({
    things,
    props,
    cast,
    keyMesh: things.key,
    cube: things.key,
    theme: 'office',
    hiddenFloor: { office: things.key, dc: things.key, roof: things.key, parking: things.key },
    glow: () => ({ mesh: things.key, model: new Float32Array(16) }),
    drawBoss: () => {},
  });

  it.each(LEVELS.map((l) => [l.id, l]))('draws every thing of %s in every state', (_, level) => {
    const sim = createSim(level, 'kevin');
    for (const th of sim.things)
      for (const state of STATES) {
        /** @type {any[]} */
        const items = [];
        expect(() => drawThing(view, items, sim, { ...th, state }, 1.5)).not.toThrow();
      }
  });

  it('shows state changes on the exit lift and the shut-off valve', () => {
    const level = LEVELS.find((l) => l.id === 'copil') ?? LEVELS[0];
    const sim = createSim(level, 'kevin');
    /** @param {any} th */
    const meshes = (th) => {
      /** @type {any[]} */
      const items = [];
      drawThing(view, items, sim, th, 1.5);
      return items.map((it) => it.mesh);
    };
    const exit = /** @type {any} */ ({ kind: 'exit', x: 5, y: 3, state: 'idle', t: 0 });
    sim.hasKey = false;
    expect(meshes(exit)).toContain(things.exitLocked);
    sim.hasKey = true;
    expect(meshes(exit)).toContain(things.exit);
    const valve = /** @type {any} */ ({ kind: 'switch', x: 5, y: 3, state: 'idle', t: 0 });
    expect(meshes(valve)).toContain(things.valve);
    expect(meshes({ ...valve, state: 'on' })).toContain(things.valveOn);
    expect(propGeometry('puddle').count).toBeGreaterThan(0);
  });

  it('poses every character without errors', () => {
    const sim = createSim(LEVELS[2], 'charline');
    const boss = sim.things.find((t) => t.kind === 'boss');
    for (const id of Object.keys(CAST)) {
      expect(() => poseCharacter(cast[id], 0, 0, 0, 1, idlePose(1), {})).not.toThrow();
      expect(() => poseCharacter(cast[id], 0, 0, 0, 1, heroPose(sim, 1, 6), {})).not.toThrow();
      for (const state of STATES)
        if (boss)
          expect(() =>
            poseCharacter(cast[id], 0, 0, 0, 1, bossPose({ ...boss, state }, 0, 1).pose, {}),
          ).not.toThrow();
    }
  });

  it('reuses one idle pose instead of allocating every frame', () => {
    const a = idlePose(1);
    a.mood = 'happy';
    a.armR = 2;
    const b = idlePose(2);
    expect(b).toBe(a);
    // Every field is rewritten, so a caller's tweak never leaks into the next one.
    expect(b.mood).toBe('neutral');
    expect(Math.abs(b.armR)).toBeLessThan(0.2);
    const out = /** @type {any} */ ({});
    expect(idlePose(1, out)).toBe(out);
    expect(out.flip).toBe(0);
  });

  it('keeps every hero pose finite and grounded in character', () => {
    /** @param {any} p */
    const finite = (p) =>
      Object.values(p).every((v) => typeof v === 'string' || v === undefined || Number.isFinite(v));
    for (const id of /** @type {const} */ (['kevin', 'charline'])) {
      const sim = createSim(LEVELS[0], id);
      const h = sim.hero;
      /** @type {[string, Partial<typeof h>, number][]} */
      const cases = [
        ['ground', { vx: 0 }, 0.2],
        ['ground', { vx: 0 }, 9],
        ['ground', { vx: 0 }, 13],
        ['ground', { vx: 6, run: 1.3 }, 0],
        ['ground', { vx: -5, facing: 1 }, 0],
        ['air', { vy: 10 }, 0],
        ['air', { vy: -12 }, 0],
        ['air', { vy: 3, invuln: 1.3 }, 0],
        ['air', { vy: 4, airJumps: 0 }, 0],
        ['hang', { stateTime: 0.3 }, 0],
        ['climb', { stateTime: 0.2 }, 0],
        ['dead', { stateTime: 0.1 }, 0],
        ['dead', { stateTime: 0.9 }, 0],
      ];
      for (const [state, set, still] of cases) {
        Object.assign(h, { state, vx: 0, vy: 0, invuln: 0, airJumps: sim.stats.airJumps }, set);
        expect(finite(heroPose(sim, 1.7, still))).toBe(true);
      }
      // Idles, hurt and death keep the arms at or below the shoulders: nothing that could
      // read as a salute, a hand at the forehead or a wave.
      for (const [state, set] of /** @type {[string, Partial<typeof h>][]} */ ([
        ['ground', {}],
        ['air', { vy: 3, invuln: 1.3 }],
        ['dead', { stateTime: 0.2 }],
        ['dead', { stateTime: 0.3 }],
      ]))
        for (let still = 0; still < 13; still += 0.25) {
          Object.assign(h, { state, vx: 0, vy: 0, invuln: 0, stateTime: 0 }, set);
          const p = heroPose(sim, still * 1.7, still);
          expect(Math.max(p.armL, p.armR)).toBeLessThan(1.75);
        }
      h.state = 'ground';
      sim.won = true;
      // Victory: both arms up (no wave, no salute).
      for (const t of [0, 0.3, 0.7]) {
        const p = heroPose(sim, t, 0);
        expect(Math.min(p.armL, p.armR)).toBeGreaterThan(2.3);
        expect(Math.abs(p.armL - p.armR)).toBeLessThan(0.05);
      }
    }
  });

  it('flips Charline once on her double jump and lands the flip upright', () => {
    const sim = createSim(LEVELS[0], 'charline');
    const h = sim.hero;
    Object.assign(h, { state: 'air', airJumps: 0 });
    const v0 = sim.stats.jump * 0.9;
    h.vy = v0;
    expect(heroPose(sim, 0, 0).flip ?? 0).toBeCloseTo(0);
    h.vy = 0;
    expect(heroPose(sim, 0, 0).flip ?? 0).toBeGreaterThan(Math.PI);
    h.vy = -4.01;
    expect(heroPose(sim, 0, 0).flip ?? 0).toBe(0);
    // Kévin has no double jump: never flips.
    const k = createSim(LEVELS[0], 'kevin');
    Object.assign(k.hero, { state: 'air', airJumps: 0, vy: 2 });
    expect(heroPose(k, 0, 0).flip ?? 0).toBe(0);
  });

  it('gives each boss his own body language', () => {
    const sim = createSim(LEVELS[2], 'kevin');
    const boss = /** @type {any} */ (sim.things.find((t) => t.kind === 'boss'));
    for (const state of ['intro', 'convinced', 'hit', 'phase']) {
      const b = { ...boss, state, t: 0.8 };
      const julien = bossPose(b, 0, 1, 'techServicesDirector').pose;
      const rodolphe = bossPose(b, 0, 1, 'regionalDirector').pose;
      expect(julien).not.toEqual(rodolphe);
    }
    // Without an id, a signature move gives the boss away for the rest of the duel.
    const b = { ...boss, state: 'fan', t: 0.2, hp: 4 };
    bossPose(b, 0, 1);
    b.state = 'convinced';
    expect(bossPose(b, 0, 1).pose).toEqual(bossPose(b, 0, 1, 'regionalDirector').pose);
  });
});
