import { describe, expect, it } from 'vitest';
import { SHOULDER } from '../src/app/poses.js';
import {
  AMBIENCE,
  BEATS,
  DAY_LINES,
  TitleStage,
  beatAt,
  clockFor,
  findSpot,
  heroRegion,
  timeOfDay,
} from '../src/app/title.js';
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
      // Same parts throughout (jacket tails may flare out during a happy bounce).
      expect(items.length).toBeGreaterThanOrEqual(one);
      expect(items.length).toBeLessThanOrEqual(one + 2);
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

  it('keeps the poster behind the pair whole at the top of the frame', () => {
    const stage = new TitleStage();
    stage.still = true;
    stage.place({ x: 7, y: 3, art: [6.2, 8.4, 6.4] });
    stage.region = { cx: 0.7, cy: 0.52, h: 0.62 };
    const cam = stage.camera(16 / 9, 0);
    expect(stage.fit + stage.drop).toBeGreaterThan(1);
    const [, sy] = project(cam.viewProj, [7.3, 6.4, -2.6]);
    expect(sy).toBeGreaterThanOrEqual(0.015);
    // The pair stays where the menu leaves room, a little lower at most.
    const [sx, py] = project(cam.viewProj, [cam.focus[0], cam.focus[1], -0.12]);
    expect(sx).toBeCloseTo(0.7, 1);
    expect(py).toBeGreaterThan(0.5);
    expect(py).toBeLessThan(0.62);
    // Nothing behind them: no pull-back.
    stage.place({ x: 7, y: 3 });
    stage.camera(16 / 9, 0);
    expect(stage.fit).toBe(1);
    expect(stage.drop).toBe(0);
  });

  it('follows the real time of day and the day of the week', () => {
    // 29 October 2026 is a Thursday.
    const at = (/** @type {string} */ s) => new Date(`2026-10-${s}`);
    expect(timeOfDay(at('29T07:30'))).toBe('morning');
    expect(timeOfDay(at('29T12:00'))).toBe('day');
    expect(timeOfDay(at('29T19:00'))).toBe('evening');
    expect(timeOfDay(at('29T23:30'))).toBe('night');
    expect(timeOfDay(at('29T04:00'))).toBe('night');
    expect(clockFor(at('29T09:00'))).toMatchObject({ line: 'Jour des NAO !', naoDay: true });
    const week = [25, 26, 27, 28, 30, 31].map((d) => clockFor(at(`${d}T12:00`)));
    for (const c of week) {
      expect(c.naoDay).toBe(false);
      expect(c.line).not.toBe('Jour des NAO !');
    }
    expect(new Set(DAY_LINES).size).toBe(7);
    // The title screen gets the line and a data-time for its CSS.
    const line = { textContent: '' };
    const root = /** @type {HTMLElement} */ (
      /** @type {unknown} */ ({ dataset: {}, querySelector: () => line })
    );
    const stage = new TitleStage();
    stage.stamp(root, at('29T20:00'));
    expect(root.dataset).toEqual({ time: 'evening', naoDay: 'true' });
    expect(line.textContent).toBe('Jour des NAO !');
    expect(stage.time).toBe('evening');
  });

  it('lights the title like the stage of that time of day', () => {
    const stage = new TitleStage();
    const base = {
      sunDir: [0, -1, 0],
      sunColor: [0.5, 0.5, 0.5],
      sky: [0.3, 0.3, 0.3],
      ground: [0.1, 0.1, 0.1],
      fog: [0.1, 0.1, 0.1],
      fogRange: /** @type {[number, number]} */ ([20, 80]),
      backdrop: {
        top: [0, 0, 0],
        mid: [0, 0, 0],
        bottom: [0, 0, 0],
        sun: /** @type {[number, number]} */ ([0.5, 0.5]),
        glow: [0, 0, 0],
      },
      lights: [],
    };
    /** @type {Record<string, {key: number[], wash: number[], sky: number[]}>} */
    const seen = {};
    for (const time of /** @type {const} */ (['morning', 'day', 'evening', 'night'])) {
      stage.time = time;
      const lit = stage.lighting(base, 0, 'kevin');
      expect(lit.lights.length).toBe(5);
      const from = AMBIENCE[time].from;
      // Part of the way from the stage's own sky towards that mood's.
      for (let i = 0; i < 3; i++)
        expect(Math.abs(lit.sky[i] - from.sky[i])).toBeLessThan(Math.abs(0.3 - from.sky[i]) + 1e-9);
      seen[time] = {
        key: [...lit.lights[0].color],
        wash: [...lit.lights[4].color],
        sky: [...lit.sky],
      };
    }
    // Sunset glows orange, night is blue.
    expect(seen.evening.wash[0]).toBeGreaterThan(seen.evening.wash[2] * 2);
    expect(seen.night.key[2]).toBeGreaterThan(seen.night.key[0]);
    expect(seen.night.wash[2]).toBeGreaterThan(seen.night.wash[0]);
  });

  it('keeps both heroes busy while they wait, smiling, never waving', () => {
    const stage = new TitleStage();
    for (const id of /** @type {const} */ (['kevin', 'charline'])) {
      /** @type {Set<string>} */
      const beats = new Set();
      for (let t = 0; t < 60; t += 1 / 20) {
        const b = beatAt(id, t);
        if (b) beats.add(b.beat);
        for (const chosen of [true, false]) {
          const { pose, turn } = stage.posture(id, chosen, t);
          expect(pose.mood).toBe('happy');
          // One arm alone never rises above the shoulder.
          expect(pose.armL).toBeLessThanOrEqual(SHOULDER);
          expect(pose.armR).toBeLessThanOrEqual(SHOULDER);
          expect(Number.isFinite(turn)).toBe(true);
        }
      }
      for (const b of BEATS[id].beats) expect(beats, `${id}: ${b}`).toContain(b);
    }
    // Less motion: they simply stand.
    stage.still = true;
    expect(beatAt('kevin', 0.5)).toBeDefined();
    const a = stage.posture('kevin', true, 0.5).turn;
    expect(a).toBeCloseTo(-0.2, 5);
  });

  it('starts the game with a push-in: the chosen hero sets off, the other cheers', () => {
    const stage = new TitleStage();
    stage.region = { cx: 0.7, cy: 0.52, h: 0.62 };
    const before = stage.camera(16 / 9, 0);
    const far = Math.hypot(...before.eye.map((e, i) => e - stage.target[i]));
    stage.leave();
    stage.leaving = 0.5;
    const { pose: run, turn } = stage.posture('kevin', true, 1);
    expect(turn).toBeGreaterThan(0.5);
    expect(run.armL).toBeLessThan(SHOULDER);
    expect(run.armR).toBeLessThan(SHOULDER);
    const { pose: cheer } = stage.posture('charline', false, 1);
    // Both arms up together: a cheer, never a wave.
    expect(cheer.armL).toBeGreaterThan(SHOULDER);
    expect(cheer.armR).toBe(cheer.armL);
    for (let t = 0.02; t < 1; t += 0.02) stage.camera(16 / 9, t);
    const near = Math.hypot(...stage.eye.map((e, i) => e - stage.target[i]));
    expect(near).toBeLessThan(far * 0.85);
    // Back on the title: the camera waits again.
    stage.place({ x: 7, y: 3 });
    expect(stage.leaving).toBe(-1);
    // Less motion: no push-in.
    stage.still = true;
    stage.leave();
    expect(stage.leaving).toBe(-1);
  });
});
