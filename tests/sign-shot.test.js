import { describe, expect, it } from 'vitest';
import { Camera } from '../src/app/camera.js';
import { fightFocus, floorX0, floorX1, screenRow } from '../src/app/staging.js';
import { ROOFTOP } from '../src/data/levels/rooftop.js';
import { TS } from '../src/data/levels/ts.js';
import { createSim } from '../src/game/sim.js';

/** The HUD's height in CSS pixels (style.css). */
const HUD = 56;

/**
 * The signing as the player sees it once the camera has settled: screen pixels of
 * a world point. @param {import('../src/data/levels/index.js').Level} level
 * @param {number} aspect @param {number} px Screen height. @param {number} lift
 */
function signing(level, aspect, px, lift) {
  const s = createSim(level, 'kevin');
  const b = /** @type {import('../src/game/world.js').Thing} */ (
    s.things.find((t) => t.kind === 'boss')
  );
  s.bossActive = true;
  s.bossDone = true;
  Object.assign(b, { state: 'sign', t: 1, hp: 0 });
  s.hero.x = b.x - 3.5;
  const shot = fightFocus(s, lift, aspect);
  if (!shot) throw new Error('no signing shot');
  const f = { ...shot };
  const cam = new Camera();
  cam.snap(f.x, f.y);
  const bounds = { w: s.w, h: s.h, sky: level.theme === 'rooftop' ? 4 : 0 };
  let out = cam.update(1 / 60, aspect, f, bounds);
  for (let i = 0; i < 400; i++) out = cam.update(1 / 60, aspect, f, bounds);
  const m = out.viewProj;
  /** @param {number} x @param {number} y @param {number} z */
  const at = (x, y, z) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    return [((1 + cx) / 2) * px * aspect, ((1 - cy) / 2) * px];
  };
  return { at, b, floor: b.y0 ?? b.y, mid: (floorX0(s, b) + floorX1(s, b)) / 2, s };
}

describe('the signing shot (NA-1, GP-4)', () => {
  it('projects like the camera does', () => {
    // Settled PC shot measured in the game: 52 px and 543 px down a 720 px screen.
    expect(screenRow(4.94, 7.8, 8.61, -2.25) * 720).toBeCloseTo(52, 0);
    expect(screenRow(4.94, 7.8, 3, 0) * 720).toBeCloseTo(542, 0);
  });

  for (const [name, aspect, px, lift] of /** @type {const} */ ([
    ['PC', 1280 / 720, 720, 0],
    ['landscape phone', 863 / 360, 360, 1.1],
  ])) {
    it(`shows Julien's « ENVELOPPE SIGNÉE » display whole under the HUD (${name})`, () => {
      const { at, b, floor, mid } = signing(TS, aspect, px, lift);
      expect(at(mid, floor + 5.61, -2.25)[1]).toBeGreaterThanOrEqual(HUD);
      expect(at(b.x, floor, 0)[1]).toBeLessThanOrEqual(px);
      expect(at(mid - 3, floor + 4.4, -2.25)[0]).toBeGreaterThanOrEqual(0);
      expect(at(mid + 3, floor + 4.4, -2.25)[0]).toBeLessThanOrEqual(px * aspect);
    });

    it(`shows Rodolphe's marquee whole, and his head under the HUD (${name})`, () => {
      const { at, b, floor, mid } = signing(ROOFTOP, aspect, px, lift);
      expect(at(b.x, floor + 2.9, 0)[1]).toBeGreaterThanOrEqual(HUD);
      expect(at(mid, floor - 0.9, 1.39)[1]).toBeLessThanOrEqual(px);
      expect(at(mid - 3.8, floor - 0.5, 1.39)[0]).toBeGreaterThanOrEqual(0);
      expect(at(mid + 3.8, floor - 0.5, 1.39)[0]).toBeLessThanOrEqual(px * aspect);
    });
  }

  it('keeps the hero and the director in the shot on an upright phone', () => {
    const aspect = 412 / 915;
    const { at, b, floor, s } = signing(TS, aspect, 915, 1.1);
    for (const x of [s.hero.x, b.x]) {
      const [sx, sy] = at(x, floor, 0);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(412);
      expect(sy).toBeLessThanOrEqual(915);
    }
  });
});
