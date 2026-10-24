/**
 * Title screen staging. Both heroes pose for the camera: the chosen one in front,
 * under a warm key light, the other a step behind and a little in the shade. Picking
 * the other hero swaps them with a few steps. The camera frames them in whatever part
 * of the screen the menu leaves free, and drifts slowly so the office shows its depth.
 */
import { CAST } from '../data/cast.js';
import { poseCharacter, poseOptions } from '../gfx/characters.js';
import { lookAt, multiply, perspective } from '../gfx/mat4.js';
import { HERO } from '../game/sim.js';
import { idlePose } from './poses.js';

/** @typedef {import('../gfx/characters.js').Pose} Pose */
/** @typedef {import('../gfx/characters.js').ItemSource} ItemSource */
/** @typedef {import('../gfx/renderer.js').DrawItem} DrawItem */
/** @typedef {{left: number, top: number, right: number, bottom: number, width: number, height: number}} Rect */
/** @typedef {'kevin' | 'charline'} HeroId */

/** Where the heroes stand (the run restarts from S anyway). */
export const SHOWCASE = { x: 6.6, y: 3 };
const FOV = (30 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);
/** Feet of the hero in front. */
const FRONT = { x: SHOWCASE.x + HERO.w / 2, y: SHOWCASE.y, z: 0.3 };
/** From the front spot to the one behind. */
const BACK = { x: 1.05, z: -0.85 };
/** Height the pair is framed by (a hero is about 1.75 tall, plus some headroom). */
const FRAME_H = 2.05;
/** World point the camera keeps on the pair: between them, at chest height. */
const PAIR = [FRONT.x + BACK.x * 0.45, FRONT.y + 0.95, FRONT.z + BACK.z * 0.5];
/** Shade on the hero waiting behind, and the rim light colour behind each hero. */
const SHADE = [0.56, 0.6, 0.76];
const ACCENT = { kevin: [0.42, 0.78, 0.2], charline: [0.95, 0.3, 0.62] };
/** @type {HeroId[]} */
const HEROES = ['kevin', 'charline'];

/**
 * Where on screen the heroes should stand, from the menu's layout: the centre of the
 * free area (fractions of the viewport) and the share of its height they may fill.
 * Wide screens keep the menu on the left; tall ones stack logo, heroes, then menu.
 * @param {number} vw @param {number} vh Viewport size.
 * @param {Rect} panel The menu card.
 * @param {Rect} brand The logo block.
 * @returns {{cx: number, cy: number, h: number}}
 */
export function heroRegion(vw, vh, panel, brand) {
  const aspect = vw / vh;
  // The pair needs about 2.6 world units across for every FRAME_H of height.
  const fitWidth = (/** @type {number} */ wFrac) => (wFrac * aspect * FRAME_H) / 2.6;
  if (panel.width > 0 && panel.right < vw * 0.66) {
    const left = Math.max(panel.right, brand.width > 0 ? brand.right : 0) / vw;
    const free = 1 - left;
    return { cx: left + free * 0.5, cy: 0.5, h: Math.min(0.64, fitWidth(free * 0.9)) };
  }
  const top = brand.height > 0 ? brand.bottom / vh : 0.2;
  const bottom = panel.height > 0 ? panel.top / vh : 0.75;
  const free = Math.max(0.12, bottom - top);
  return { cx: 0.5, cy: top + free * 0.47, h: Math.min(free * 0.92, fitWidth(1)) };
}

/** @param {number} k */
const ease = (k) => k * k * (3 - 2 * k);
/** @param {number[]} a @param {number[]} b @param {number} k @param {number[]} out */
function mix(a, b, k, out) {
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

export class TitleStage {
  constructor() {
    /** 0 = in front, 1 = behind (eased while they swap). @type {Record<HeroId, number>} */
    this.spot = { kevin: 0, charline: 1 };
    /** Which side each hero passes on while swapping, so they never walk through each other. */
    this.side = { kevin: 1, charline: -1 };
    /** Seconds since the front hero arrived (a little bounce when they do). */
    this.arrived = 9;
    /** Free part of the screen for the heroes (see heroRegion). */
    this.region = { cx: 0.68, cy: 0.5, h: 0.62 };
    /** No drift or swap animation when the system asks for less motion. */
    this.still = false;
    /** Smoothed camera. */
    this.eye = [0, 0, 0];
    this.target = [0, 0, 0];
    this.lastCam = -1;
    // Per-frame storage: camera() hands out the same objects every frame.
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.out = { viewProj: new Float32Array(16), eye: this.eye, focus: [PAIR[0], PAIR[1]] };
    this.lastDraw = -1;
    this.lightList = [
      { pos: [0, 0, 0], radius: 6, color: [0.95, 0.84, 0.7] },
      { pos: [0, 0, 0], radius: 3.4, color: [0, 0, 0] },
      { pos: [0, 0, 0], radius: 4.6, color: [0.2, 0.27, 0.46] },
      { pos: [0, 0, 0], radius: 1.9, color: [0.55, 0.46, 0.32] },
    ];
  }

  /**
   * Camera for the title: a slightly low, slowly drifting three-quarter view that puts
   * the pair at the centre of `region`.
   * @param {number} aspect @param {number} t Seconds.
   * @returns {{viewProj: Float32Array, eye: number[], focus: number[]}}
   */
  camera(aspect, t) {
    const dt = this.lastCam < 0 || t - this.lastCam > 0.5 ? -1 : t - this.lastCam;
    this.lastCam = t;
    const s = this.still ? 0 : 1;
    const r = this.region;
    // Visible height at the pair, from the share of the screen they may fill.
    const visH = (FRAME_H / Math.max(0.2, r.h)) * (1 + s * 0.012 * Math.sin(t * 0.23));
    const dist = visH / 2 / TAN;
    const yaw = -0.15 + s * 0.05 * Math.sin(t * 0.11);
    const pitch = 0.09 + s * 0.02 * Math.sin(t * 0.17 + 1);
    // Unit vector from the target back to the eye, then the camera's right and up.
    const bx = Math.sin(yaw) * Math.cos(pitch);
    const by = Math.sin(pitch);
    const bz = Math.cos(yaw) * Math.cos(pitch);
    const rl = Math.hypot(bx, bz);
    const rx = bz / rl;
    const rz = -bx / rl;
    const ux = by * rz;
    const uy = bz * rx - bx * rz;
    const uz = -by * rx;
    // Shift the look-at point so the pair lands at (cx, cy) on screen.
    const halfH = dist * TAN;
    const nx = (2 * r.cx - 1) * halfH * aspect;
    const ny = (1 - 2 * r.cy) * halfH;
    const tx = PAIR[0] - rx * nx - ux * ny;
    const ty = PAIR[1] - uy * ny;
    const tz = PAIR[2] - rz * nx - uz * ny;
    const k = dt < 0 ? 1 : 1 - Math.exp(-dt * 5);
    const e = this.eye;
    const g = this.target;
    e[0] += (tx + bx * dist - e[0]) * k;
    e[1] += (ty + by * dist - e[1]) * k;
    e[2] += (tz + bz * dist - e[2]) * k;
    g[0] += (tx - g[0]) * k;
    g[1] += (ty - g[1]) * k;
    g[2] += (tz - g[2]) * k;
    const out = this.out;
    multiply(
      perspective(FOV, aspect, 0.5, 220, this.proj),
      lookAt(e, g, undefined, this.view),
      out.viewProj,
    );
    return out;
  }

  /**
   * Feet position of a hero for a spot value (with a sidestep while swapping).
   * @param {HeroId} id
   */
  where(id) {
    const k = ease(this.spot[id]);
    const arc = Math.sin(Math.PI * k) * 0.42 * this.side[id];
    return {
      x: FRONT.x + BACK.x * k + arc * 0.63,
      z: FRONT.z + BACK.z * k + arc * 0.78,
    };
  }

  /**
   * Key light on the hero in front, a coloured rim behind them, a cool fill from the menu
   * side and a warm pool at their feet.
   * @param {number} t @param {HeroId} heroId
   */
  lights(t, heroId) {
    const [key, rim, fill, pool] = this.lightList;
    const front = this.where(heroId);
    const breathe = this.still ? 1 : 1 + Math.sin(t * 0.9) * 0.05;
    key.pos[0] = front.x + 1.3;
    key.pos[1] = FRONT.y + 2.9;
    key.pos[2] = front.z + 2.4;
    rim.pos[0] = front.x - 0.15;
    rim.pos[1] = FRONT.y + 2.2;
    rim.pos[2] = front.z - 1.25;
    // The rim colour follows whoever is in front, blending as they swap.
    mix(ACCENT.charline, ACCENT.kevin, 1 - this.spot.kevin, rim.color);
    for (let i = 0; i < 3; i++) rim.color[i] *= breathe;
    fill.pos[0] = FRONT.x - 2.8;
    fill.pos[1] = FRONT.y + 1.6;
    fill.pos[2] = 2.2;
    // A warm pool on the floor where the chosen hero stands.
    pool.pos[0] = front.x + 0.1;
    pool.pos[1] = FRONT.y + 0.7;
    pool.pos[2] = front.z + 0.5;
    return this.lightList;
  }

  /**
   * Poses both heroes. Relaxed idles only: weight shifting, breathing, a glance.
   * @param {Record<string, any>} cast Built characters by id.
   * @param {HeroId} heroId The chosen hero.
   * @param {number} t @param {DrawItem[]} items @param {ItemSource} pool
   */
  draw(cast, heroId, t, items, pool) {
    const dt = this.lastDraw < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastDraw));
    this.lastDraw = t;
    for (const id of HEROES) {
      const want = id === heroId ? 0 : 1;
      const k = this.spot[id];
      if (k === want) continue;
      if (this.still) this.spot[id] = want;
      else {
        if (Math.abs(k - (1 - want)) < 1e-6) this.side[id] = want ? 1 : -1;
        this.spot[id] = want > k ? Math.min(want, k + dt * 1.7) : Math.max(want, k - dt * 1.7);
      }
      if (id === heroId && this.spot[id] === 0) this.arrived = 0;
    }
    this.arrived += dt;
    // Back to front, so the shaded hero is drawn first.
    const order = this.spot.kevin >= this.spot.charline ? HEROES : [HEROES[1], HEROES[0]];
    for (const id of order) this.pose(cast, id, id === heroId, t, items, pool);
  }

  /**
   * @param {Record<string, any>} cast @param {HeroId} id @param {boolean} chosen
   * @param {number} t @param {DrawItem[]} items @param {ItemSource} pool
   */
  pose(cast, id, chosen, t, items, pool) {
    const k = this.spot[id];
    const at = this.where(id);
    // Each hero breathes on their own rhythm.
    const ph = t + (id === 'kevin' ? 0 : 2.3);
    const pose = /** @type {Pose} */ (idlePose(ph));
    const sway = Math.sin(ph * 1.1);
    pose.legL = sway * 0.05;
    pose.legR = -sway * 0.05;
    pose.armL = 0.08 + Math.sin(ph * 1.1 + 0.6) * 0.06;
    pose.armR = 0.08 - Math.sin(ph * 1.1 + 0.6) * 0.06;
    pose.bob = Math.abs(sway) * 0.4;
    pose.lean = -0.03;
    pose.head = Math.sin(ph * 0.7) * 0.08;
    // Swapping: a few easy steps.
    const moving = k > 0 && k < 1;
    if (moving) {
      const step = Math.sin(k * Math.PI * 5);
      pose.legL = step * 0.45;
      pose.legR = -step * 0.45;
      pose.armL = -step * 0.3;
      pose.armR = step * 0.3;
      pose.bob = Math.abs(step) * 1.2;
      pose.lean = 0.05;
    }
    // Arriving in front: a small happy bounce, nothing more.
    if (chosen && this.arrived < 0.35 && !this.still) {
      const b = Math.sin((this.arrived / 0.35) * Math.PI);
      pose.bob = (pose.bob ?? 0) + b * 1.6;
      pose.squash = -b * 0.05;
    }
    pose.mood = chosen ? 'happy' : pose.mood;
    // The one in front faces the player; the other mostly watches them, now and then the camera.
    const glance = this.still ? 0 : ease(Math.max(0, Math.sin(t * 0.33 + 1.2)) ** 3);
    const turn = chosen
      ? -0.2 + Math.sin(t * 0.4) * 0.05
      : -0.62 + glance * 0.4 + (moving ? 0.3 : 0);
    const tint = k > 0.01 ? mix([1, 1, 1], SHADE, k, pool.tint(1, 1, 1)) : undefined;
    const o = poseOptions(CAST[id].scale, turn, 0.55 - k * 0.38, tint);
    poseCharacter(cast[id], at.x, FRONT.y, at.z, 1, pose, o, items, pool);
  }
}

/** The one title stage (main.js frames and lights it, scene.js draws the heroes). */
export const title = new TitleStage();
