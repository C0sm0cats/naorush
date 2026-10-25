import { lookAt, multiply, perspective } from '../gfx/mat4.js';

const FOV = (30 * Math.PI) / 180;

/** Narrowest view a phone held upright gets (tiles across), close-ups included. */
const PORTRAIT_MIN_W = 5.6;

/**
 * Visible height (tiles) for the follow camera. A phone held upright sees more of
 * the level's height instead of a sliver of its width: about 6.5 tiles across,
 * never closer than the landscape framing, never much taller than the level.
 * @param {number} aspect Screen width / height.
 * @param {number} levelH Level height in tiles (open sky included).
 */
export function followHeight(aspect, levelH) {
  if (aspect >= 1) return 8.2;
  return Math.max(7.4, Math.min(levelH + 1.6, 6.5 / aspect));
}

/**
 * Visible height actually used. On an upright phone, framings chosen elsewhere (boss
 * shots, close-ups) are widened to at least PORTRAIT_MIN_W tiles across, up to the
 * level's height plus a little room, so nobody is framed on a 3-tile sliver.
 * @param {number} aspect @param {number} levelH
 * @param {{facing: number, visH?: number}} focus
 */
export function viewHeight(aspect, levelH, focus) {
  if (focus.visH === undefined) return focus.facing === 0 ? 3.2 : followHeight(aspect, levelH);
  if (aspect >= 1) return focus.visH;
  return Math.max(focus.visH, Math.min(levelH + 2, PORTRAIT_MIN_W / aspect));
}

/**
 * Camera target (centre of the view) for a framing, kept inside the building: a
 * view taller than the level is centred on it rather than pinned to the floor.
 * Upright phones lead further ahead: min(3, a quarter of the view's width).
 * @param {number} aspect @param {number} visH
 * @param {{x: number, y: number, facing: number}} focus
 * @param {{w: number, h: number, sky?: number}} bounds
 * @returns {[number, number]}
 */
export function cameraTarget(aspect, visH, focus, bounds) {
  const visW = visH * aspect;
  const lead = focus.facing * (aspect < 1 ? Math.min(3, visW * 0.25) : Math.min(2.5, visW * 0.12));
  const x0 = visW / 2 - 0.5,
    x1 = bounds.w - visW / 2 + 0.5;
  const tx = x0 > x1 ? bounds.w / 2 : Math.max(x0, Math.min(x1, focus.x + lead));
  const y0 = visH / 2 + 0.6,
    y1 = bounds.h - visH / 2 + 0.3 + (bounds.sky ?? 0);
  const ty = y0 > y1 ? (y0 + y1) / 2 : Math.max(y0, Math.min(y1, focus.y + 2.2));
  return [tx, ty];
}

/**
 * Follow camera: keeps the hero large (about a quarter of the screen height),
 * leads in the direction of travel and never shows outside the building.
 */
export class Camera {
  constructor() {
    this.x = 10;
    this.y = 6;
    this.dist = 20;
    this.shake = 0;
    /** Low-angle amount, eased (0 = usual slightly high eye, 1 = looking up from the floor). */
    this.low = 0;
    // Per-frame storage: update() hands out these same objects every frame.
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.target = [0, 0, 0];
    this.out = { viewProj: new Float32Array(16), eye: [0, 0, 0], focus: [0, 0] };
  }

  /** @param {number} x @param {number} y */
  snap(x, y) {
    this.x = x;
    this.y = y;
    this.dist = 4.1 / Math.tan(FOV / 2);
  }

  /**
   * @param {number} dt
   * @param {number} aspect
   * @param {{x: number, y: number, facing: number, visH?: number, low?: number}} focus Hero centre
   *   and facing (visH: visible height override; low: 0–1, a low camera looking up, for
   *   a director's entrance).
   * @param {{w: number, h: number, sky?: number}} bounds Level size in tiles; `sky`: tiles of
   *   open sky above the level the camera may rise into (open-air stages), so a hero standing
   *   on the highest ledge still jumps in full view below the HUD.
   */
  update(dt, aspect, focus, bounds) {
    const visH = viewHeight(aspect, bounds.h + (bounds.sky ?? 0), focus);
    const dist = visH / 2 / Math.tan(FOV / 2);
    const [tx, ty] = cameraTarget(aspect, visH, focus, bounds);
    const k = 1 - Math.exp(-dt * 6);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.dist += (dist - this.dist) * k;
    this.low += ((focus.low ?? 0) - this.low) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.4;
    const sy = (Math.random() - 0.5) * this.shake * 0.4;
    const out = this.out;
    const eye = out.eye;
    eye[0] = this.x + 0.6 + sx;
    eye[1] = this.y + 1.4 - this.low * 2.6 + sy;
    eye[2] = this.dist;
    const target = this.target;
    target[0] = this.x + sx;
    target[1] = this.y + sy;
    target[2] = -0.8;
    multiply(
      perspective(FOV, aspect, 0.5, 220, this.proj),
      lookAt(eye, target, undefined, this.view),
      out.viewProj,
    );
    out.focus[0] = this.x;
    out.focus[1] = this.y;
    // The same object every frame: read it before the next update().
    return out;
  }
}
