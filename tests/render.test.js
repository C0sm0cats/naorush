import { describe, expect, it } from 'vitest';
import { drawThing } from '../src/app/draw-things.js';
import { bossPose, heroPose, idlePose } from '../src/app/poses.js';
import { CAST } from '../src/data/cast.js';
import { LEVELS } from '../src/data/levels/index.js';
import { buildCharacter, poseCharacter } from '../src/gfx/characters.js';
import { buildProps } from '../src/gfx/props.js';
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
    theme: 'office',
    hiddenFloor: { office: things.key, dc: things.key },
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
});
