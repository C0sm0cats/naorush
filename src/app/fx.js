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
 * `ring`: spreads flat along the floor (x–z) in an even circle instead of a burst.
 * `with`: another effect fired alongside (same place and power).
 * @typedef {{n: number, colors: number[][], speed?: number, up?: number, size?: number, life?: number, gravity?: number, ring?: boolean, with?: string}} Burst
 * @type {Record<string, Burst>}
 */
const EFFECTS = {
  jump: { n: 6, colors: [WHITE], speed: 1.5, up: 0.5, life: 0.35, gravity: 2 },
  airjump: { n: 10, colors: [PINK, WHITE], speed: 2.5, up: 0, life: 0.4, gravity: 0 },
  land: { n: 10, colors: [WHITE], speed: 2.2, up: 0.4, life: 0.4, gravity: 3, with: 'landRing' },
  hardland: { n: 16, colors: [WHITE], speed: 3, up: 0.6, life: 0.5, gravity: 3, with: 'hardRing' },
  // Dust kicked out flat all round the feet on a real landing.
  landRing: {
    n: 14,
    colors: [[0.86, 0.86, 0.9], WHITE],
    speed: 2.6,
    up: 0.25,
    life: 0.32,
    gravity: 1.5,
    size: 0.08,
    ring: true,
  },
  hardRing: {
    n: 22,
    colors: [[0.86, 0.86, 0.9], WHITE],
    speed: 3.8,
    up: 0.35,
    life: 0.42,
    gravity: 1.5,
    size: 0.1,
    ring: true,
  },
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
  // IN1, wet floor: a few droplets as the feet touch it, a spray of them behind a slide.
  puddle: { n: 10, colors: [BLUE, [0.8, 0.95, 1]], speed: 2, up: 1.5, life: 0.45, size: 0.06 },
  slip: {
    n: 16,
    colors: [BLUE, [0.8, 0.95, 1], WHITE],
    speed: 2.6,
    up: 0.4,
    life: 0.4,
    gravity: 6,
    size: 0.06,
    ring: true,
  },
  key: { n: 24, colors: [GOLD, WHITE], speed: 4, up: 3, life: 0.9 },
  switch: { n: 18, colors: [BLUE, WHITE], speed: 3, up: 2, life: 0.7 },
  concert: { n: 50, colors: [GOLD, PINK, WHITE], speed: 5, up: 4, life: 1.2 },
  door: { n: 16, colors: [LIME], speed: 3, up: 2, life: 0.7 },
  meeting: { n: 18, colors: [WHITE, BLUE], speed: 3, up: 2, life: 0.7 },
  // Ambience, one kind per stage theme.
  'air-office': {
    n: 1,
    colors: [[1, 0.95, 0.8]],
    speed: 0.15,
    up: 0.05,
    life: 5,
    gravity: -0.01,
    size: 0.035,
  },
  'air-datacenter': {
    n: 1,
    colors: [
      [0.3, 1, 0.7],
      [0.4, 0.8, 1],
    ],
    speed: 0.1,
    up: 0.25,
    life: 3,
    gravity: -0.02,
    size: 0.03,
  },
  'air-parking': {
    n: 1,
    colors: [[0.6, 0.75, 1]],
    speed: 0.05,
    up: -1.5,
    life: 1.6,
    gravity: 3,
    size: 0.03,
  },
  'air-rooftop': {
    n: 1,
    colors: [PINK, LIME, GOLD, BLUE],
    speed: 0.4,
    up: -0.4,
    life: 5,
    gravity: 0.05,
    size: 0.05,
  },
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
  // The springboard: lime sparks up and a ring of dust kicked flat off the floor.
  vacuumBounce: { n: 18, colors: [LIME, WHITE], speed: 3.5, up: 3, life: 0.5, with: 'hardRing' },
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

/**
 * Particle power for a landing event: a 2-tile drop is 1, a long fall up to 1.6.
 * @param {{fall?: number}} e
 */
export const landPower = (e) =>
  e.fall === undefined ? 1 : Math.min(1.6, Math.max(0.6, 0.5 + e.fall / 4));

export class Particles {
  constructor() {
    /** @type {Particle[]} */
    this.list = [];
    /** Spent particles, reused by emit() so bursts allocate nothing once warm. @type {Particle[]} */
    this.free = [];
  }

  /**
   * @param {string} type @param {number} x @param {number} y
   * @param {number} [power] Scales count and speed (a landing passes its drop, see {@link landPower}).
   */
  emit(type, x, y, power = 1) {
    const o = EFFECTS[type];
    if (!o) return;
    const n = Math.max(1, Math.round(o.n * power));
    for (let i = 0; i < n; i++) {
      const ring = Boolean(o.ring);
      // A ring is evenly spaced (with a little jitter) so it reads as a circle.
      const a = ring ? ((i + Math.random() * 0.4) / n) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (ring ? 0.85 + Math.random() * 0.15 : 0.4 + Math.random() * 0.6);
      const speed = sp * Math.sqrt(power);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.4);
      const z = ring ? 0 : (Math.random() - 0.5) * 0.6;
      const vz = ring ? Math.sin(a) * speed : (Math.random() - 0.5) * speed;
      const size = (o.size ?? 0.09) * (0.6 + Math.random() * 0.8);
      const p = this.free.pop();
      const vx = Math.cos(a) * speed,
        vy = ring
          ? (o.up ?? 0) * (0.6 + Math.random() * 0.8)
          : Math.abs(Math.sin(a)) * speed + (o.up ?? 2);
      const color = o.colors[i % o.colors.length],
        gravity = o.gravity ?? 14;
      if (p) {
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.life = life;
        p.max = life;
        p.size = size;
        p.color = color;
        p.gravity = gravity;
        this.list.push(p);
      } else this.list.push({ x, y, z, vx, vy, vz, life, max: life, size, color, gravity });
    }
    if (o.with) this.emit(o.with, x, y + 0.04, power);
  }

  /** @param {number} dt */
  update(dt) {
    const list = this.list;
    // Spent particles go back to the free list; the rest keep their order.
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) this.free.push(p);
      else list[n++] = p;
    }
    list.length = n;
  }

  clear() {
    for (const p of this.list) this.free.push(p);
    this.list.length = 0;
  }
}
