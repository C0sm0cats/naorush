import { lookAt, multiply, perspective } from '../gfx/mat4.js';

const FOV = (30 * Math.PI) / 180;

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
   * @param {{x: number, y: number, facing: number, visH?: number}} focus Hero centre and facing (visH: visible height override).
   * @param {{w: number, h: number, sky?: number}} bounds Level size in tiles; `sky`: tiles of
   *   open sky above the level the camera may rise into (open-air stages), so a hero standing
   *   on the highest ledge still jumps in full view below the HUD.
   */
  update(dt, aspect, focus, bounds) {
    const visH = focus.visH ?? (focus.facing === 0 ? 3.2 : aspect >= 1 ? 8.2 : 7.4);
    const visW = visH * aspect;
    const dist = visH / 2 / Math.tan(FOV / 2);
    const lead = focus.facing * Math.min(2.5, visW * 0.12);
    const tx = Math.max(visW / 2 - 0.5, Math.min(bounds.w - visW / 2 + 0.5, focus.x + lead));
    const ty = Math.max(
      visH / 2 + 0.6,
      Math.min(bounds.h - visH / 2 + 0.3 + (bounds.sky ?? 0), focus.y + 2.2),
    );
    const k = 1 - Math.exp(-dt * 6);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.dist += (dist - this.dist) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.4;
    const sy = (Math.random() - 0.5) * this.shake * 0.4;
    const out = this.out;
    const eye = out.eye;
    eye[0] = this.x + 0.6 + sx;
    eye[1] = this.y + 1.4 + sy;
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
