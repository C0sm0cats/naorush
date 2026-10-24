import { describe, expect, it } from 'vitest';
import { TitleStage, findSpot, heroRegion } from '../src/app/title.js';
import { CAST } from '../src/data/cast.js';
import { LEVELS } from '../src/data/levels/index.js';
import { createSim } from '../src/game/sim.js';
import { DrawPool, buildCharacter } from '../src/gfx/characters.js';

/** A WebGL2 stand-in: every method is a no-op, every constant is 0. */
const gl = /** @type {WebGL2RenderingContext} */ (
  /** @type {unknown} */ (
    new Proxy(
      {},
      { get: (_, k) => (typeof k === 'string' && k === k.toUpperCase() ? 0 : () => ({})) },
    )
  )
);

/** @param {number} left @param {number} top @param {number} right @param {number} bottom */
const rect = (left, top, right, bottom) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

/** Screen position (0..1, y down) of a world point. @param {Float32Array} m @param {number[]} p */
function project(m, [x, y, z]) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2,
    (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2,
  ];
}

describe('title staging', () => {
  it('frames the heroes beside the menu on wide screens', () => {
    const r = heroRegion(1280, 720, rect(70, 290, 540, 700), rect(70, 20, 520, 270));
    expect(r.cx).toBeGreaterThan(540 / 1280);
    expect(r.cx).toBeLessThan(1);
    expect(r.h).toBeGreaterThan(0.4);
  });

  it('frames them between the logo and the menu on tall screens', () => {
    const r = heroRegion(390, 844, rect(12, 440, 378, 832), rect(12, 14, 378, 170));
    expect(r.cx).toBe(0.5);
    expect(r.cy).toBeGreaterThan(170 / 844);
    expect(r.cy).toBeLessThan(440 / 844);
    // Both heroes fit across a narrow screen.
    expect(r.h).toBeLessThan(0.4);
  });

  it('puts the pair at the centre of the free area', () => {
    const stage = new TitleStage();
    stage.still = true;
    for (const [aspect, region] of /** @type {const} */ ([
      [16 / 9, { cx: 0.7, cy: 0.5, h: 0.6 }],
      [390 / 844, { cx: 0.5, cy: 0.36, h: 0.3 }],
    ])) {
      stage.region = region;
      stage.lastCam = -1;
      const cam = stage.camera(aspect, 0);
      const [sx, sy] = project(cam.viewProj, [cam.focus[0], cam.focus[1], -0.12]);
      expect(sx).toBeCloseTo(region.cx, 1);
      expect(sy).toBeCloseTo(region.cy, 1);
    }
  });

  it('poses both heroes and swaps them when the other is chosen', () => {
    /** @type {Record<string, ReturnType<typeof buildCharacter>>} */
    const cast = {};
    for (const id of ['kevin', 'charline']) cast[id] = buildCharacter(gl, CAST[id]);
    const stage = new TitleStage();
    const pool = new DrawPool();
    /** @type {import('../src/gfx/renderer.js').DrawItem[]} */
    const items = [];
    stage.draw(cast, 'kevin', 0, items, pool);
    const one = items.length;
    expect(one).toBeGreaterThan(10);
    expect(stage.spot).toEqual({ kevin: 0, charline: 1 });
    for (let t = 0; t < 2; t += 1 / 30) {
      pool.reset();
      items.length = 0;
      stage.draw(cast, 'charline', t, items, pool);
      for (const it of items) expect(Number.isFinite(it.model[12])).toBe(true);
      expect(items.length).toBe(one);
    }
    expect(stage.spot).toEqual({ kevin: 1, charline: 0 });
    // The rim light now takes Charline's pink.
    const rim = stage.lights(2, 'charline')[1].color;
    expect(rim[0]).toBeGreaterThan(rim[1]);
  });

  it('finds every stage a clear spot: floor below, no car, prop or character behind', () => {
    for (const level of LEVELS) {
      const sim = createSim(level, 'kevin');
      const { x, y } = findSpot(level, sim);
      // Both heroes (about 0.8 wide, the second 0.95 to the right) and a margin.
      const lo = x - 0.9;
      const hi = x + 1.85;
      for (const th of sim.things)
        if (th.kind !== 'secret' && th.y > y - 1 && th.y < y + 3)
          expect(Math.abs(th.x - (lo + hi) / 2), `${level.id}: ${th.kind}`).toBeGreaterThan(
            (hi - lo) / 2 + 0.4,
          );
      const row = level.map[sim.h - 1 - y];
      for (let c = Math.floor(lo); c <= Math.floor(hi); c++) {
        expect(' S'.includes(row[c]), `${level.id} column ${c}: ${row[c]}`).toBe(true);
        expect([1, 6], `${level.id} floor ${c}`).toContain(sim.tiles[c + (y - 1) * sim.w]);
      }
    }
  });
});
