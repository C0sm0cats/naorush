import { describe, expect, it } from 'vitest';
import {
  Camera,
  cameraTarget,
  fallLook,
  followHeight,
  topReach,
  viewHeight,
} from '../src/app/camera.js';

const FOV = (30 * Math.PI) / 180;
const LEVEL = { w: 100, h: 12 };
/** Visible height of the camera once it has settled (tiles). */
const visible = (/** @type {Camera} */ cam) => 2 * cam.dist * Math.tan(FOV / 2);

/**
 * Lets the camera settle on a framing.
 * @param {number} aspect
 * @param {{x: number, y: number, facing: number, visH?: number, low?: number, peek?: number}} focus
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

  it('frames the hero as big on an upright phone (412×915) as on a wide screen', () => {
    const aspect = 412 / 915;
    const visH = followHeight(aspect, 12);
    expect(visH * aspect).toBeCloseTo(4.7, 5);
    // The hero's share of the screen height matches the wide framing's (within 25 %).
    expect(8.2 / visH).toBeGreaterThan(0.75);
    const { cam } = settle(aspect, { x: 40, y: 3, facing: 1 });
    expect(visible(cam) * aspect).toBeCloseTo(visH * aspect, 1);
  });

  it('never frames closer than the old upright framing, nor taller than the level', () => {
    expect(followHeight(0.95, 12)).toBeGreaterThanOrEqual(7.4);
    expect(followHeight(0.2, 12)).toBeLessThanOrEqual(12);
    expect(followHeight(0.2, 30)).toBeCloseTo(4.7 / 0.2, 5);
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

  it('pins a view taller than the room under the ceiling, centres it outdoors', () => {
    const aspect = 412 / 915;
    const visH = 13.6;
    const low = cameraTarget(aspect, visH, { x: 40, y: 1, facing: 1 }, LEVEL);
    const high = cameraTarget(aspect, visH, { x: 40, y: 10, facing: 1 }, LEVEL);
    expect(low[1]).toBeCloseTo(high[1], 5);
    expect(low[1] + topReach(visH / 2 / Math.tan(FOV / 2))).toBeLessThanOrEqual(LEVEL.h);
    const open = { ...LEVEL, sky: 4 };
    const a = cameraTarget(aspect, 18, { x: 40, y: 1, facing: 1 }, open);
    const b = cameraTarget(aspect, 18, { x: 40, y: 10, facing: 1 }, open);
    expect(a[1]).toBeCloseTo(b[1], 5);
    expect(a[1] + 9).toBeGreaterThan(open.h);
  });

  it('never shows the sky above the ceiling indoors (GP-3)', () => {
    for (const aspect of [412 / 915, 16 / 9, 863 / 360]) {
      for (const levelH of [12, 24]) {
        const bounds = { w: 100, h: levelH };
        const { cam, out } = settle(aspect, { x: 40, y: levelH - 3, facing: 1 }, bounds);
        // Top edge of the screen on the front of the building.
        expect(cam.y + topReach(cam.dist)).toBeLessThanOrEqual(levelH - 0.3);
        expect(out.eye[1]).toBeLessThan(levelH);
      }
    }
    // A director's low-angle entrance looks up: still under the ceiling.
    const { cam } = settle(16 / 9, { x: 40, y: 9, facing: 0, visH: 5.2, low: 1 });
    expect(cam.y + topReach(cam.dist, cam.low)).toBeLessThanOrEqual(LEVEL.h - 0.3);
  });

  it('may rise into the open sky on an open-air stage', () => {
    const bounds = { w: 100, h: 12, sky: 4 };
    const { cam } = settle(16 / 9, { x: 40, y: 10, facing: 1 }, bounds);
    expect(cam.y + topReach(cam.dist)).toBeGreaterThan(12);
  });

  it('keeps the sky out while zooming out from a snap', () => {
    const cam = new Camera();
    cam.snap(40, 12);
    for (let i = 0; i < 60; i++) {
      cam.update(1 / 60, 412 / 915, { x: 40, y: 9, facing: 1 }, LEVEL);
      expect(cam.y + topReach(cam.dist)).toBeLessThanOrEqual(LEVEL.h - 0.3);
    }
  });

  it('follows the hero vertically when the level is taller than the view', () => {
    const a = cameraTarget(16 / 9, 8.2, { x: 40, y: 2, facing: 1 }, LEVEL);
    const b = cameraTarget(16 / 9, 8.2, { x: 40, y: 7, facing: 1 }, LEVEL);
    expect(b[1]).toBeGreaterThan(a[1]);
  });

  it('leads further ahead on an upright phone, three tiles and more in view ahead', () => {
    const aspect = 412 / 915;
    const visH = followHeight(aspect, 12);
    const ahead = cameraTarget(aspect, visH, { x: 40, y: 3, facing: 1 }, LEVEL)[0] - 40;
    expect(ahead).toBeCloseTo(Math.min(1.5, visH * aspect * 0.3), 5);
    expect(ahead + (visH * aspect) / 2 - 0.31).toBeGreaterThan(3.3);
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

describe('vertical anticipation', () => {
  it('does not look down for jumps, does for long falls', () => {
    expect(fallLook(-11)).toBe(0);
    expect(fallLook(5)).toBe(0);
    expect(fallLook(-16)).toBeLessThan(-0.9);
    expect(fallLook(-22)).toBeCloseTo(-2.2, 5);
  });

  it('looks down while the hero falls down a tall shaft, back once landed', () => {
    const bounds = { w: 100, h: 40 };
    const aspect = 412 / 915;
    const cam = new Camera();
    cam.snap(40, 32);
    let y = 30;
    for (let i = 0; i < 30; i++) cam.update(1 / 60, aspect, { x: 40, y, facing: 1 }, bounds);
    for (let i = 0; i < 45; i++) {
      y -= 20 / 60;
      cam.update(1 / 60, aspect, { x: 40, y, facing: 1 }, bounds);
    }
    expect(cam.vy).toBeLessThan(-15);
    // The hero, falling at 20 tiles/s, stays well clear of the bottom edge.
    const visH = followHeight(aspect, 40);
    expect(y - (cam.y - visH / 2)).toBeGreaterThan(2);
    for (let i = 0; i < 120; i++) cam.update(1 / 60, aspect, { x: 40, y, facing: 1 }, bounds);
    expect(fallLook(cam.vy)).toBe(0);
    expect(Math.abs(cam.vy)).toBeLessThan(0.1);
  });

  it('looks up or down when the hero asks, inside the building', () => {
    const bounds = { w: 100, h: 30 };
    const plain = settle(16 / 9, { x: 40, y: 12, facing: 1 }, bounds).cam.y;
    const up = settle(16 / 9, { x: 40, y: 12, facing: 1, peek: 1 }, bounds).cam.y;
    const down = settle(16 / 9, { x: 40, y: 12, facing: 1, peek: -1 }, bounds).cam.y;
    expect(up - plain).toBeGreaterThan(2);
    expect(plain - down).toBeGreaterThan(2);
    const { cam } = settle(16 / 9, { x: 40, y: 25, facing: 1, peek: 1 }, bounds);
    expect(cam.y + topReach(cam.dist)).toBeLessThanOrEqual(bounds.h - 0.3);
  });

  it('still shows more when pinned under the ceiling, and down to the bottom of a shaft (QA)', () => {
    // Parking top floor (x 72, y 8): the view already touches the ceiling.
    const plain = settle(16 / 9, { x: 40, y: 8, facing: 1 }).cam;
    const up = settle(16 / 9, { x: 40, y: 8, facing: 1, peek: 1 }).cam;
    expect(visible(up)).toBeGreaterThan(visible(plain) * 1.2);
    expect(up.y + topReach(up.dist)).toBeLessThanOrEqual(LEVEL.h - 0.3);
    // A shaft: standing at y 15 of a tall level, the floor 6 tiles down comes into view.
    const tall = { w: 100, h: 30 };
    for (const aspect of [16 / 9, 863 / 360, 412 / 915]) {
      const { cam } = settle(aspect, { x: 40, y: 15, facing: 1, peek: -1 }, tall);
      expect(cam.y - visible(cam) / 2).toBeLessThan(15 - 6);
    }
  });

  it('ignores cuts (respawn, teleport)', () => {
    const cam = new Camera();
    cam.snap(40, 20);
    cam.update(1 / 60, 16 / 9, { x: 40, y: 20, facing: 1 }, { w: 100, h: 40 });
    cam.update(1 / 60, 16 / 9, { x: 40, y: 3, facing: 1 }, { w: 100, h: 40 });
    expect(cam.vy).toBe(0);
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
