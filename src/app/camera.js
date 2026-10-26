import { lookAt, multiply, perspective } from '../gfx/mat4.js';

const FOV = (30 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);

/** Narrowest view a phone held upright gets (tiles across), close-ups included. */
const PORTRAIT_MIN_W = 5.6;
/**
 * Tiles across for the follow camera on an upright phone: the hero stands as tall
 * on a Pixel 7 held upright as on a PC (about a sixth of the screen), the view still
 * reads three tiles and a half ahead.
 */
const PORTRAIT_W = 4.7;

/** The eye sits this high above the point it looks at (a slightly high camera)... */
const EYE_UP = 1.4;
/** ...and drops this far below it for a low angle (the directors' entrances). */
const EYE_LOW = 2.6;
/** Depth of the point the camera looks at, and of the front of the building (world-builder Z_FRONT). */
const TARGET_Z = -0.8;
const FRONT_Z = 1.4;
/**
 * How much of the ceiling slab's dark front face (one tile thick, row h - 1 to h)
 * the top of the screen may show: a sliver under the HUD, never the sky above it.
 */
const CEILING_SHOW = 0.45;
/** Falls faster than any jump's own landing (tiles/s) make the camera look down. */
const FALL_LOOK = 12;
/**
 * Holding up or down, standing still: the camera pulls back by PEEK_ZOOM (so even
 * pinned under the ceiling or on the ground floor, more of the room shows) and looks
 * PEEK_UP tiles up or PEEK_DOWN tiles down (down to the bottom of a shaft).
 */
const PEEK_ZOOM = 1.25;
const PEEK_UP = 2.4;
const PEEK_DOWN = 4.5;

/**
 * Visible height (tiles) for the follow camera. A phone held upright gets its own
 * framing: PORTRAIT_W tiles across, so the hero is as big as on a wide screen,
 * never closer than the landscape framing, never taller than the level.
 * @param {number} aspect Screen width / height.
 * @param {number} levelH Level height in tiles (open sky included).
 */
export function followHeight(aspect, levelH) {
  if (aspect >= 1) return 8.2;
  return Math.max(7.4, Math.min(levelH, PORTRAIT_W / aspect));
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
 * How far above the camera target the top edge of the screen meets the front of
 * the building, for a camera `dist` tiles away (the eye is above the target and
 * looks slightly down, or below it for a low angle).
 * @param {number} dist @param {number} [low] Low-angle amount (0–1).
 */
export function topReach(dist, low = 0) {
  const e = EYE_UP - low * EYE_LOW;
  const pitch = Math.atan2(e, dist - TARGET_Z);
  return e + (dist - FRONT_Z) * Math.tan(FOV / 2 - pitch);
}

/**
 * Highest camera target that keeps the sky above the ceiling out of the shot, or
 * Infinity on an open-air stage (no ceiling: the camera may rise into the sky).
 * @param {number} dist @param {number} low @param {{h: number, sky?: number}} bounds
 */
function ceilingCap(dist, low, bounds) {
  return bounds.sky ? Infinity : bounds.h - CEILING_SHOW - topReach(dist, low);
}

/**
 * Camera target (centre of the view) for a framing, kept inside the building: the
 * top of the screen never rises above the ceiling (indoors), and a view taller than
 * the room is pinned under the ceiling (the extra goes below the floor, under the
 * touch pads); outdoors such a view is centred on the level. Upright phones lead
 * further ahead: min(1.5, 30 % of the view's width).
 * @param {number} aspect @param {number} visH
 * @param {{x: number, y: number, facing: number, low?: number}} focus
 * @param {{w: number, h: number, sky?: number}} bounds
 * @param {number} [look] Extra vertical offset (tiles): negative looks down (falls).
 * @returns {[number, number]}
 */
export function cameraTarget(aspect, visH, focus, bounds, look = 0) {
  const visW = visH * aspect;
  const lead = focus.facing * (aspect < 1 ? Math.min(1.5, visW * 0.3) : Math.min(2.5, visW * 0.12));
  const x0 = visW / 2 - 0.5,
    x1 = bounds.w - visW / 2 + 0.5;
  const tx = x0 > x1 ? bounds.w / 2 : Math.max(x0, Math.min(x1, focus.x + lead));
  const cap = ceilingCap(visH / 2 / TAN, focus.low ?? 0, bounds);
  const y0 = visH / 2 + 0.6,
    y1 = Math.min(cap, bounds.h - visH / 2 + 0.3 + (bounds.sky ?? 0));
  const ty =
    y0 > y1
      ? cap < Infinity
        ? y1
        : (y0 + y1) / 2
      : Math.max(y0, Math.min(y1, focus.y + 2.2 + look));
  return [tx, ty];
}

/**
 * How far down the camera looks for a hero falling at `vy` tiles/s (smoothed):
 * nothing for jumps, up to 2.2 tiles on a long drop, so the landing is in view.
 * @param {number} vy
 */
export function fallLook(vy) {
  return vy < -FALL_LOOK ? Math.max(-2.2, (vy + FALL_LOOK) * 0.25) : 0;
}

/**
 * Follow camera: keeps the hero large (about a sixth of the screen height), leads
 * in the direction of travel, looks down on long falls and never shows outside
 * the building.
 */
export class Camera {
  constructor() {
    this.x = 10;
    this.y = 6;
    this.dist = 20;
    this.shake = 0;
    /** Low-angle amount, eased (0 = usual slightly high eye, 1 = looking up from the floor). */
    this.low = 0;
    /** Smoothed vertical speed of the followed hero (tiles/s), for the look-down on falls. */
    this.vy = 0;
    /** Last followed height (NaN: none yet). */
    this.fy = NaN;
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
    this.dist = 4.1 / TAN;
    this.vy = 0;
    this.fy = NaN;
  }

  /**
   * @param {number} dt
   * @param {number} aspect
   * @param {{x: number, y: number, facing: number, visH?: number, low?: number, peek?: number}} focus
   *   Hero centre and facing (visH: visible height override; low: 0–1, a low camera looking
   *   up, for a director's entrance; peek: 1 / -1 to look up / down, see sim.js lookAround).
   * @param {{w: number, h: number, sky?: number}} bounds Level size in tiles; `sky`: tiles of
   *   open sky above the level the camera may rise into (open-air stages, no ceiling), so a
   *   hero standing on the highest ledge still jumps in full view below the HUD.
   */
  update(dt, aspect, focus, bounds) {
    // Falls are measured on the followed hero only; a cut (respawn, a new framing) resets it.
    const follow = focus.visH === undefined && focus.facing !== 0;
    const peek = follow ? Math.sign(focus.peek ?? 0) : 0;
    const levelH = bounds.h + (bounds.sky ?? 0);
    const baseH = viewHeight(aspect, levelH, focus);
    const visH = peek ? Math.max(baseH, Math.min(baseH * PEEK_ZOOM, levelH + 1)) : baseH;
    const dist = visH / 2 / TAN;
    if (dt > 0) {
      const dy = focus.y - this.fy;
      if (!follow || !(Math.abs(dy) < 1.5)) this.vy = 0;
      else this.vy += (dy / dt - this.vy) * (1 - Math.exp(-dt / 0.3));
      this.fy = follow ? focus.y : NaN;
    }
    const look = fallLook(this.vy) + (peek > 0 ? PEEK_UP : peek < 0 ? -PEEK_DOWN : 0);
    const [tx, ty] = cameraTarget(aspect, visH, focus, bounds, look);
    const k = 1 - Math.exp(-dt * 6);
    // On a long fall the camera also catches up faster, so the hero never sinks off the bottom.
    const ky = 1 - Math.exp(-dt * (6 + Math.min(4, Math.max(0, -this.vy - FALL_LOOK) * 0.5)));
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * ky;
    this.dist += (dist - this.dist) * k;
    this.low += ((focus.low ?? 0) - this.low) * k;
    // While the framing eases (zooming out, rising from a low angle), keep the sky out.
    this.y = Math.min(this.y, ceilingCap(this.dist, this.low, bounds));
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.4;
    const sy = (Math.random() - 0.5) * this.shake * 0.4;
    const out = this.out;
    const eye = out.eye;
    eye[0] = this.x + 0.6 + sx;
    eye[1] = this.y + EYE_UP - this.low * EYE_LOW + sy;
    eye[2] = this.dist;
    const target = this.target;
    target[0] = this.x + sx;
    target[1] = this.y + sy;
    target[2] = TARGET_Z;
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
