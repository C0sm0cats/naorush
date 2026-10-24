import { HERO } from '../game/sim.js';

/**
 * Staging: boss-fight lighting and framing, and the dynamic resolution that
 * keeps the frame rate up on modest devices.
 *
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {{pos: number[], radius: number, color: number[]}} PointLight
 */

/**
 * Extra lights for a boss fight: Julien's red alarm beacon in phase two,
 * Rodolphe's coloured spotlights sweeping the stage.
 * @param {import('../data/levels/index.js').Level} level @param {Sim} sim @param {number} t
 * @returns {PointLight[]}
 */
export function bossLights(level, sim, t) {
  if (!level.boss || !sim.bossActive || sim.bossDone) return [];
  const boss = sim.things.find((b) => b.kind === 'boss');
  if (level.boss.id === 'techServicesDirector') {
    if ((boss?.phase ?? 1) < 2) return [];
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    return [{ pos: [boss?.x ?? 0, 8, 0], radius: 10, color: [2.2 * pulse, 0.2, 0.2] }];
  }
  const [x0, x1] = level.boss.arena;
  const mid = (x0 + x1) / 2;
  const half = (x1 - x0) / 2 - 1;
  return [
    { pos: [mid + Math.sin(t * 0.9) * half, 7, 0.5], radius: 8, color: [2.4, 0.6, 1.5] },
    { pos: [mid + Math.sin(t * 0.9 + 2.2) * half, 7, 0.5], radius: 8, color: [0.6, 1.2, 2.6] },
    { pos: [mid + Math.sin(t * 0.9 + 4.4) * half, 7, 0.5], radius: 8, color: [1.6, 2.2, 0.6] },
  ];
}

/**
 * During a boss fight the camera frames both fighters.
 * @param {Sim} sim @param {number} lift Extra room at the bottom (touch pads).
 */
export function fightFocus(sim, lift) {
  if (!sim.bossActive || sim.bossDone) return null;
  const b = sim.things.find((t) => t.kind === 'boss');
  if (!b) return null;
  const hx = sim.hero.x + HERO.w / 2;
  return { x: (hx * 2 + b.x) / 3, y: sim.hero.y - lift, facing: Math.sign(b.x - hx) * 0.4 };
}

/** Drops the render scale when frames run long, raises it back when there is headroom. */
export class DynamicResolution {
  constructor() {
    this.avg = 1 / 60;
    this.slow = 0;
    this.fast = 0;
  }

  /** @param {number} dt @param {{scale: number}} renderer */
  update(dt, renderer) {
    // Automated captures run on a software renderer: keep full resolution there.
    if (navigator.webdriver || dt <= 0 || dt >= 0.1) return;
    this.avg += (dt - this.avg) * 0.05;
    this.slow = this.avg > 1 / 50 ? this.slow + dt : 0;
    this.fast = this.avg < 1 / 58 ? this.fast + dt : 0;
    if (this.slow > 2 && renderer.scale > 0.55) {
      renderer.scale = Math.max(0.55, renderer.scale * 0.85);
      this.slow = 0;
    } else if (this.fast > 6 && renderer.scale < 1) {
      renderer.scale = Math.min(1, renderer.scale * 1.08);
      this.fast = 0;
    }
  }
}
