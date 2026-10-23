/**
 * Voxel particles for game feel: dust, sparks, splashes, confetti.
 *
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} vx
 * @property {number} vy
 * @property {number} vz
 * @property {number} life
 * @property {number} max
 * @property {number} size
 * @property {number[]} color
 * @property {number} gravity
 */

const WHITE = [0.92, 0.92, 0.96];
const PINK = [1, 0.3, 0.6];
const LIME = [0.78, 0.96, 0.2];
const BLUE = [0.45, 0.8, 1];
const GOLD = [1, 0.82, 0.3];

/**
 * @typedef {{n: number, colors: number[][], speed?: number, up?: number, size?: number, life?: number, gravity?: number}} Burst
 * @type {Record<string, Burst>}
 */
const EFFECTS = {
  jump: { n: 6, colors: [WHITE], speed: 1.5, up: 0.5, life: 0.35, gravity: 2 },
  airjump: { n: 10, colors: [PINK, WHITE], speed: 2.5, up: 0, life: 0.4, gravity: 0 },
  land: { n: 10, colors: [WHITE], speed: 2.2, up: 0.4, life: 0.4, gravity: 3 },
  hardland: { n: 16, colors: [WHITE], speed: 3, up: 0.6, life: 0.5, gravity: 3 },
  ticket: { n: 14, colors: [PINK, WHITE], speed: 3, up: 2, life: 0.6 },
  ammo: { n: 14, colors: [WHITE, BLUE], speed: 3, up: 2, life: 0.6 },
  checkpoint: { n: 18, colors: [[0.35, 1, 0.6], WHITE], speed: 3, up: 3, life: 0.8 },
  zap: { n: 30, colors: [GOLD, BLUE, WHITE], speed: 6, up: 3, life: 0.5, size: 0.07 },
  hurt: { n: 16, colors: [[1, 0.35, 0.35], WHITE], speed: 3.5, up: 2, life: 0.5 },
  collapse: {
    n: 16,
    colors: [
      [0.5, 0.55, 0.65],
      [0.3, 0.33, 0.4],
    ],
    speed: 2.5,
    up: 1,
    life: 0.9,
    size: 0.14,
  },
  smash: { n: 20, colors: [[0.95, 0.94, 0.9]], speed: 4, up: 2, life: 0.8, size: 0.12 },
  splash: { n: 40, colors: [BLUE, [0.8, 0.95, 1]], speed: 5, up: 3, life: 0.9, size: 0.08 },
  key: { n: 24, colors: [GOLD, WHITE], speed: 4, up: 3, life: 0.9 },
  door: { n: 16, colors: [LIME], speed: 3, up: 2, life: 0.7 },
  meeting: { n: 18, colors: [WHITE, BLUE], speed: 3, up: 2, life: 0.7 },
  dust: {
    n: 2,
    colors: [[0.85, 0.85, 0.9]],
    speed: 0.8,
    up: 0.4,
    life: 0.35,
    gravity: 1,
    size: 0.07,
  },
  trail: { n: 1, colors: [WHITE], speed: 0.3, up: 0, life: 0.22, gravity: 0, size: 0.05 },
  step: { n: 4, colors: [WHITE], speed: 1.2, up: 0.3, life: 0.3, gravity: 2 },
  poof: { n: 6, colors: [WHITE], speed: 1.5, up: 0.5, life: 0.3, gravity: 2 },
  win: { n: 90, colors: [PINK, LIME, BLUE, GOLD], speed: 7, up: 5, life: 1.6 },
  telegraph: {
    n: 8,
    colors: [[1, 0.6, 0.15], GOLD],
    speed: 1.5,
    up: 1.5,
    life: 0.4,
    gravity: 0,
    size: 0.06,
  },
  chairRoll: { n: 8, colors: [WHITE], speed: 2, up: 0.3, life: 0.4, gravity: 3 },
  drawerOut: { n: 6, colors: [[0.75, 0.8, 0.85]], speed: 2.5, up: 0.5, life: 0.3 },
  sprayOn: { n: 14, colors: [BLUE, [0.8, 0.95, 1]], speed: 2, up: -1, life: 0.6, size: 0.06 },
  paperShot: { n: 5, colors: [WHITE], speed: 2, up: 0.5, life: 0.3, gravity: 2 },
  trapdoor: {
    n: 18,
    colors: [
      [0.3, 0.35, 0.5],
      [0.24, 0.32, 0.44],
    ],
    speed: 2.5,
    up: 1,
    life: 0.8,
    size: 0.12,
  },
  binderFall: {
    n: 14,
    colors: [PINK, LIME, [0.2, 0.3, 0.6]],
    speed: 3,
    up: 2,
    life: 0.6,
    size: 0.1,
  },
  internStun: { n: 18, colors: [WHITE], speed: 3, up: 3, life: 0.9, gravity: 6, size: 0.1 },
  vacuumBounce: { n: 12, colors: [LIME, WHITE], speed: 3, up: 1, life: 0.4 },
  invite: { n: 6, colors: [[0.7, 0.5, 1], WHITE], speed: 1.5, up: 1.5, life: 0.4, gravity: 0 },
  visioMute: { n: 14, colors: [[0.7, 0.5, 1], WHITE], speed: 2.5, up: 2, life: 0.6 },
  heart: { n: 18, colors: [[1, 0.35, 0.45], WHITE], speed: 2.5, up: 3, life: 0.8 },
  archive: {
    n: 22,
    colors: [[0.75, 0.6, 0.4], [0.9, 0.8, 0.6], WHITE],
    speed: 3.5,
    up: 2.5,
    life: 0.8,
    size: 0.12,
  },
  crack: {
    n: 14,
    colors: [
      [0.75, 0.6, 0.4],
      [0.9, 0.8, 0.6],
    ],
    speed: 3,
    up: 2,
    life: 0.7,
    size: 0.11,
  },
  secret: { n: 40, colors: [GOLD, LIME, WHITE], speed: 4, up: 4, life: 1.2 },
  grab: { n: 5, colors: [WHITE], speed: 1, up: 0.5, life: 0.25, gravity: 1 },
  death: { n: 30, colors: [[1, 0.8, 0.3], WHITE, PINK], speed: 4, up: 4, life: 1 },
  respawn: { n: 24, colors: [[0.35, 1, 0.6], WHITE], speed: 2, up: 3, life: 0.8, gravity: 0 },
  bossHit: { n: 30, colors: [WHITE, GOLD, PINK], speed: 5, up: 3, life: 0.7 },
  bossPhase: { n: 60, colors: [GOLD, PINK, BLUE], speed: 6, up: 4, life: 1.1 },
  teleport: { n: 40, colors: [BLUE, WHITE, [0.4, 1, 0.9]], speed: 4, up: 2, life: 0.6, gravity: 0 },
  rackDrop: { n: 6, colors: [[0.6, 0.65, 0.75]], speed: 1, up: -2, life: 0.4, gravity: 0 },
  rackLand: { n: 28, colors: [[0.5, 0.55, 0.65], WHITE], speed: 5, up: 1.5, life: 0.6, size: 0.12 },
  cableZap: { n: 26, colors: [BLUE, WHITE, GOLD], speed: 5, up: 2, life: 0.4, size: 0.06 },
  fan: { n: 16, colors: [WHITE, BLUE], speed: 3, up: 2, life: 0.5 },
  dash: { n: 20, colors: [WHITE, GOLD], speed: 3, up: 0.5, life: 0.5, gravity: 1 },
  zoneHit: { n: 30, colors: [[1, 0.4, 0.5], GOLD], speed: 4, up: 3, life: 0.6 },
  slam: { n: 30, colors: [WHITE, GOLD], speed: 6, up: 1, life: 0.6, size: 0.11 },
  sign: { n: 120, colors: [PINK, LIME, BLUE, GOLD, WHITE], speed: 8, up: 7, life: 2 },
};

export class Particles {
  constructor() {
    /** @type {Particle[]} */
    this.list = [];
  }

  /** @param {string} type @param {number} x @param {number} y */
  emit(type, x, y) {
    const o = EFFECTS[type];
    if (!o) return;
    for (let i = 0; i < o.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.6);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.4);
      this.list.push({
        x,
        y,
        z: (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a)) * sp + (o.up ?? 2),
        vz: (Math.random() - 0.5) * sp,
        life,
        max: life,
        size: (o.size ?? 0.09) * (0.6 + Math.random() * 0.8),
        color: o.colors[i % o.colors.length],
        gravity: o.gravity ?? 14,
      });
    }
  }

  /** @param {number} dt */
  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) list.splice(i, 1);
    }
  }

  clear() {
    this.list.length = 0;
  }
}
