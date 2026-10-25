import { describe, expect, it } from 'vitest';
import { Camera, cameraTarget, followHeight, viewHeight } from '../src/app/camera.js';

const FOV = (30 * Math.PI) / 180;
const LEVEL = { w: 100, h: 12 };
/** Visible height of the camera once it has settled (tiles). */
const visible = (/** @type {Camera} */ cam) => 2 * cam.dist * Math.tan(FOV / 2);

/**
 * Lets the camera settle on a framing.
 * @param {number} aspect @param {{x: number, y: number, facing: number, visH?: number, low?: number}} focus
 */
function settle(aspect, focus, bounds = LEVEL) {
  const cam = new Camera();
  cam.snap(focus.x, focus.y);
  let out = cam.update(1 / 60, aspect, focus, bounds);
  for (let i = 0; i < 240; i++) out = cam.update(1 / 60, aspect, focus, bounds);
  return { cam, out };
}

describe('follow camera framing', () => {
  it('keeps the landscape framing unchanged', () => {
    expect(followHeight(16 / 9, 12)).toBe(8.2);
    expect(followHeight(863 / 360, 12)).toBe(8.2);
  });

  it('shows about six tiles across on an upright phone (412×915)', () => {
    const aspect = 412 / 915;
    const visH = followHeight(aspect, 12);
    expect(visH).toBeCloseTo(13.6, 5); // clamped to the level height + 1.6
    expect(visH * aspect).toBeGreaterThan(5.8);
    expect(visH * aspect).toBeLessThan(6.6);
    const { cam } = settle(aspect, { x: 40, y: 3, facing: 1 });
    expect(visible(cam) * aspect).toBeCloseTo(visH * aspect, 1);
  });

  it('never frames closer than the old upright framing', () => {
    expect(followHeight(0.95, 12)).toBeGreaterThanOrEqual(7.4);
    expect(followHeight(0.2, 12)).toBeLessThanOrEqual(12 + 1.6);
  });

  it('widens boss shots and close-ups on an upright phone, not on a wide screen', () => {
    const aspect = 412 / 915;
    for (const visH of [5.2, 6.4, 6.6, 7.4]) {
      const h = viewHeight(aspect, 12, { facing: 0, visH });
      expect(h * aspect).toBeGreaterThanOrEqual(5.5);
      expect(h).toBeLessThanOrEqual(12 + 2);
      expect(viewHeight(16 / 9, 12, { facing: 0, visH })).toBe(visH);
    }
    // A shot that already pulls back further is kept.
    expect(viewHeight(aspect, 12, { facing: 0, visH: 13.9 })).toBe(13.9);
    // The gallery close-up (facing 0, no override) stays close.
    expect(viewHeight(aspect, 12, { facing: 0 })).toBe(3.2);
  });

  it('centres a view taller than the level instead of pinning it to the floor', () => {
    const aspect = 412 / 915;
    const visH = 13.6;
    const low = cameraTarget(aspect, visH, { x: 40, y: 1, facing: 1 }, LEVEL);
    const high = cameraTarget(aspect, visH, { x: 40, y: 10, facing: 1 }, LEVEL);
    expect(low[1]).toBeCloseTo(high[1], 5);
    const bottom = low[1] - visH / 2,
      top = low[1] + visH / 2;
    expect(bottom).toBeLessThan(0.6);
    expect(top).toBeGreaterThan(LEVEL.h);
  });

  it('follows the hero vertically when the level is taller than the view', () => {
    const a = cameraTarget(16 / 9, 8.2, { x: 40, y: 2, facing: 1 }, LEVEL);
    const b = cameraTarget(16 / 9, 8.2, { x: 40, y: 7, facing: 1 }, LEVEL);
    expect(b[1]).toBeGreaterThan(a[1]);
  });

  it('leads further ahead on an upright phone, capped at three tiles', () => {
    const aspect = 412 / 915;
    const visH = followHeight(aspect, 12);
    const ahead = cameraTarget(aspect, visH, { x: 40, y: 3, facing: 1 }, LEVEL)[0] - 40;
    expect(ahead).toBeCloseTo(Math.min(3, visH * aspect * 0.25), 5);
    const wide = cameraTarget(16 / 9, 8.2, { x: 40, y: 3, facing: 1 }, LEVEL)[0] - 40;
    expect(wide).toBeCloseTo(Math.min(2.5, 8.2 * (16 / 9) * 0.12), 5);
    expect(cameraTarget(aspect, visH, { x: 40, y: 3, facing: -1 }, LEVEL)[0]).toBeLessThan(40);
  });

  it('never shows outside the building at either end', () => {
    for (const aspect of [412 / 915, 16 / 9, 863 / 360]) {
      const visH = followHeight(aspect, 12);
      const half = (visH * aspect) / 2;
      const [l] = cameraTarget(aspect, visH, { x: 0, y: 3, facing: -1 }, LEVEL);
      const [r] = cameraTarget(aspect, visH, { x: 100, y: 3, facing: 1 }, LEVEL);
      expect(l - half).toBeGreaterThanOrEqual(-0.5 - 1e-9);
      expect(r + half).toBeLessThanOrEqual(100.5 + 1e-9);
    }
  });

  it('settles on the target and returns finite matrices', () => {
    const { cam, out } = settle(412 / 915, { x: 40, y: 3, facing: 1 });
    const [tx, ty] = cameraTarget(412 / 915, visible(cam), { x: 40, y: 3, facing: 1 }, LEVEL);
    expect(cam.x).toBeCloseTo(tx, 2);
    expect(cam.y).toBeCloseTo(ty, 2);
    expect([...out.viewProj].every(Number.isFinite)).toBe(true);
  });
});

describe('low camera angle', () => {
  it('lowers the eye below the target when asked, and back up after', () => {
    const { cam, out } = settle(16 / 9, { x: 40, y: 3, facing: 0, visH: 6.4, low: 1 });
    expect(out.eye[1]).toBeLessThan(cam.y);
    for (let i = 0; i < 240; i++)
      cam.update(1 / 60, 16 / 9, { x: 40, y: 3, facing: 0, visH: 6.4 }, LEVEL);
    expect(cam.out.eye[1]).toBeGreaterThan(cam.y);
  });
});
