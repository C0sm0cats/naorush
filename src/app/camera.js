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
  }

  /** @param {number} x @param {number} y */
  snap(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * @param {number} dt
   * @param {number} aspect
   * @param {{x: number, y: number, facing: number}} focus Hero centre and facing.
   * @param {{w: number, h: number}} bounds Level size in tiles.
   */
  update(dt, aspect, focus, bounds) {
    const visH = aspect >= 1 ? 8.2 : 7.4;
    const visW = visH * aspect;
    const dist = visH / 2 / Math.tan(FOV / 2);
    const lead = focus.facing * Math.min(2.5, visW * 0.12);
    const tx = Math.max(visW / 2 - 0.5, Math.min(bounds.w - visW / 2 + 0.5, focus.x + lead));
    const ty = Math.max(visH / 2 + 0.6, Math.min(bounds.h - visH / 2 + 0.3, focus.y + 2.2));
    const k = 1 - Math.exp(-dt * 6);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.dist += (dist - this.dist) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.4;
    const sy = (Math.random() - 0.5) * this.shake * 0.4;
    const eye = [this.x + 0.6 + sx, this.y + 1.4 + sy, this.dist];
    const viewProj = multiply(
      perspective(FOV, aspect, 0.5, 220),
      lookAt(eye, [this.x + sx, this.y + sy, -0.8]),
    );
    return { viewProj, eye, focus: [this.x, this.y] };
  }
}
