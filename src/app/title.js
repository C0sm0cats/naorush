/**
 * Title screen staging. Both heroes pose for the camera: the chosen one in front,
 * under a warm key light, the other a step behind and a little in the shade. Picking
 * the other hero swaps them with a few steps. The camera frames them in whatever part
 * of the screen the menu leaves free, drifts slowly so the office shows its depth and
 * leans a little after the mouse (parallax). The light follows the real time of day
 * (morning, day, evening, night, borrowed from the stages' own moods), a line under
 * the logo follows the day of the week, and pressing Jouer pushes the camera in on the
 * chosen hero while the other one cheers them on.
 */
import { CAST } from '../data/cast.js';
import { POSTER_H, WHITEBOARD_W, posterWidth } from '../data/inetum.js';
import { LCP7 } from '../data/levels/lcp7.js';
import { PAUSE } from '../data/levels/pause.js';
import { ROOFTOP } from '../data/levels/rooftop.js';
import { TS } from '../data/levels/ts.js';
import { poseCharacter, poseOptions } from '../gfx/characters.js';
import { lookAt, multiply, perspective } from '../gfx/mat4.js';
import { HERO } from '../game/sim.js';
import { idlePose } from './poses.js';
import { withLights } from './staging.js';

/** @typedef {import('../gfx/characters.js').Pose} Pose */
/** @typedef {import('../gfx/characters.js').ItemSource} ItemSource */
/** @typedef {import('../gfx/renderer.js').DrawItem} DrawItem */
/** @typedef {import('../gfx/renderer.js').Lighting} Lighting */
/** @typedef {{left: number, top: number, right: number, bottom: number, width: number, height: number}} Rect */
/** @typedef {'kevin' | 'charline'} HeroId */
/** @typedef {'morning' | 'day' | 'evening' | 'night'} TimeOfDay */
/** @typedef {{x: number, y: number, art?: [number, number, number]}} Spot */
/** @typedef {{cx: number, cy: number, h: number, bottom?: number}} Region Centre and height of the heroes, lowest their feet may go (fractions of the viewport). */

const FOV = (30 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);
/** Depth of the hero in front. */
const FRONT_Z = 0.3;
/** Depth of the artwork on the back wall. */
const WALL_Z = -2.6;
/** From the front spot to the one behind. */
const BACK = { x: 0.95, z: -0.85 };
/** Height the pair is framed by (a hero is about 1.75 tall, plus some headroom). */
const FRAME_H = 2.05;
/**
 * So the poster behind them is not cut at the top, the camera may pull back a little,
 * lower the pair on screen and look up at them from a lower point (a hero shot).
 */
const MAX_FIT = 1.35;
const MAX_DROP = 0.12;
const PITCH = 0.09;
const TILTS = [PITCH, 0.03, -0.03, -0.08, -0.13, -0.18];
/** Shade on the hero waiting behind, and the rim light colour behind each hero. */
const SHADE = [0.68, 0.71, 0.84];
const ACCENT = { kevin: [0.42, 0.78, 0.2], charline: [0.95, 0.3, 0.62] };
/** @type {HeroId[]} */
const HEROES = ['kevin', 'charline'];
/** Seconds the camera takes to push in on the chosen hero when the game starts. */
const LEAVE = 0.32;

// ---- Real time of day -------------------------------------------------------------

/**
 * Part of the day for a date (local time): morning 6–10 h, day 10–17 h 30,
 * evening 17 h 30–21 h 30, night otherwise.
 * @param {Date} date
 * @returns {TimeOfDay}
 */
export function timeOfDay(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17.5) return 'day';
  if (h >= 17.5 && h < 21.5) return 'evening';
  return 'night';
}

/** One line per day of the week, Sunday first. Thursday is the big day. */
export const DAY_LINES = [
  'Dimanche : même les imprimantes font la grasse matinée.',
  'Lundi : le badge est prêt, la machine à café aussi.',
  'Mardi : CRA à jour, moral au beau fixe.',
  'Mercredi : point d’avancement, tous les voyants sont au vert.',
  'Jour des NAO !',
  'Vendredi : CRA saisi, week-end mérité.',
  'Samedi : l’open space se repose, les NAO attendront jeudi.',
];
/**
 * What the title shows at a given moment: the part of the day (for the light) and the
 * line under the logo.
 * @param {Date} date
 * @returns {{time: TimeOfDay, line: string, naoDay: boolean}}
 */
export function clockFor(date) {
  const time = timeOfDay(date);
  const day = date.getDay();
  return { time, line: DAY_LINES[day], naoDay: day === 4 };
}

/**
 * Light of each part of the day, borrowed from a stage of the same mood: the LCP7
 * open space in the morning sun, the bright break room by day, the rooftop at dusk,
 * the T&S server room at night. `key` and `wash` tint the title's own lights.
 * @type {Record<TimeOfDay, {from: Lighting | {sunColor: number[], sky: number[], ground: number[], fog: number[], backdrop: Lighting['backdrop']}, mix: number, key: number[], wash: number[], pool: number[]}>}
 */
export const AMBIENCE = {
  morning: {
    from: LCP7.lighting,
    mix: 0.32,
    key: [1, 0.86, 0.68],
    wash: [1.45, 0.98, 0.5],
    pool: [0.6, 0.5, 0.34],
  },
  day: {
    from: PAUSE.lighting,
    mix: 0.3,
    key: [1, 0.96, 0.88],
    wash: [1.05, 1, 0.86],
    pool: [0.5, 0.48, 0.42],
  },
  evening: {
    from: ROOFTOP.lighting,
    mix: 0.4,
    key: [1.08, 0.74, 0.48],
    wash: [1.75, 0.66, 0.3],
    pool: [0.7, 0.42, 0.24],
  },
  night: {
    from: TS.lighting,
    mix: 0.45,
    key: [0.66, 0.76, 1.05],
    wash: [0.32, 0.52, 1.15],
    pool: [0.85, 0.62, 0.34],
  },
};

// ---- Layout -------------------------------------------------------------------------

/**
 * Where on screen the heroes should stand, from the menu's layout: the centre of the
 * free area (fractions of the viewport) and the share of its height they may fill.
 * Wide screens keep the menu on the left; tall ones stack logo, heroes, then menu.
 * @param {number} vw @param {number} vh Viewport size.
 * @param {Rect} panel The menu card.
 * @param {Rect} brand The logo block.
 * @returns {Region}
 */
export function heroRegion(vw, vh, panel, brand) {
  const aspect = vw / vh;
  // The pair needs about 2.6 world units across for every FRAME_H of height.
  const fitWidth = (/** @type {number} */ wFrac) => (wFrac * aspect * FRAME_H) / 2.6;
  if (panel.width > 0 && panel.right < vw * 0.66) {
    const left = Math.max(panel.right, brand.width > 0 ? brand.right : 0) / vw;
    const free = 1 - left;
    return {
      cx: left + free * 0.5,
      cy: 0.52,
      h: Math.min(0.62, fitWidth(free * 0.9)),
      bottom: 0.97,
    };
  }
  const top = brand.height > 0 ? brand.bottom / vh : 0.2;
  const bottom = panel.height > 0 ? panel.top / vh : 0.75;
  const free = Math.max(0.12, bottom - top);
  return {
    cx: 0.5,
    cy: top + free * 0.47,
    h: Math.min(free * 0.92, fitWidth(1)),
    bottom: top + free,
  };
}

/**
 * How far props reach on each side of their decor x, so nothing stands behind the heroes.
 * @type {Record<string, [number, number]>}
 */
const REACH = {
  barrier: [-0.4, 3.2],
  desk: [-2.4, 4.6],
  parasol: [-1.4, 1.4],
  truss: [-2.2, 2.2],
  bistro: [-0.9, 0.9],
  hvac: [-1.1, 1.1],
  rack: [-0.9, 0.9],
};
/** Pickups: small, they only need a little room. */
const SMALL = new Set(['ticket', 'ammo', 'cup', 'key', 'checkpoint']);
/** Highest top of wall art above the floor that the title camera can keep whole. */
const ART_TOP = 5;
/** Characters that would stand cut in half at the edge of a wider title shot. */
const EXTRAS = new Set(['colleague', 'intern', 'vacuum', 'visio']);
/** Wall art: welcome behind the heroes, it frames them. */
const WALL_ART = new Set(['poster', 'whiteboard']);

/**
 * A clear stretch of floor for the title pose: solid ground under both heroes, room
 * above them, and no car, prop or character standing within reach (behind them included),
 * so nobody overlaps the scenery. Prefers a poster or whiteboard on the wall behind (an
 * Inetum backdrop) and spots near the start. `art` is that backdrop (left, right, top
 * edges), so the camera can keep it whole.
 * @param {{map: string[], decor: Array<{type: string, x: number, y: number, id?: string, front?: boolean}>}} level
 * @param {{w: number, h: number, tiles: Uint8Array, things: Array<{kind: string, x: number, y: number}>, hero: {x: number, y: number}}} sim
 * @returns {Spot} Feet of the hero in front.
 */
export function findSpot(level, sim) {
  const start = Math.round(sim.hero.y);
  const tile = (/** @type {number} */ c, /** @type {number} */ r) =>
    c < 0 || c >= sim.w || r < 0 || r >= sim.h ? 1 : sim.tiles[c + r * sim.w];
  /** @type {Spot} */
  let best = { x: sim.hero.x + HERO.w / 2, y: start };
  let score = -Infinity;
  for (let y = 1; y < sim.h - 3; y++) {
    /** Blocked x ranges on this floor. @type {Array<[number, number]>} */
    const blocked = [];
    /** @type {number[]} */
    const extras = [];
    for (const th of sim.things) {
      if (EXTRAS.has(th.kind) && th.y >= y - 1 && th.y <= y + 3) extras.push(th.x);
      if (th.kind === 'secret' || th.y < y - 1 || th.y > y + 3) continue;
      const r = SMALL.has(th.kind) ? 0.45 : 0.6;
      blocked.push([th.x - r, th.x + r]);
    }
    /** @type {Array<[number, number, number]>} */
    const art = [];
    for (const d of level.decor) {
      if (d.y < y - 1 || d.y > y + 3) continue;
      if (WALL_ART.has(d.type) && !d.front) {
        const board = d.type === 'whiteboard';
        const w = board ? WHITEBOARD_W : d.id ? posterWidth(d.id) : 2;
        // Top of the frame, and the little spotlight above it.
        const top = d.y + (board ? 0.75 + WHITEBOARD_W * 0.75 : 0.9 + POSTER_H) + 0.35;
        art.push([d.x, d.x + w, top]);
      } else {
        const [a, b] = REACH[d.type] ?? [-0.8, 0.8];
        blocked.push([d.x + a, d.x + b]);
      }
    }
    // Parked cars and tables drawn over their tiles reach a little past them.
    for (const r of [y, y - 1]) {
      const row = level.map[sim.h - 1 - r] ?? '';
      for (let c = 0; c < row.length; c++)
        if (row[c] === 'Q' || row[c] === 'Y') blocked.push([c - 0.7, c + 1.7]);
    }
    const clearAt = (/** @type {number} */ x) => {
      const lo = x - 0.9;
      const hi = x + BACK.x + 0.9;
      for (let c = Math.floor(lo); c <= Math.floor(hi); c++)
        for (let r = y; r < y + 3; r++) if (tile(c, r) !== 0) return false;
      for (let c = Math.floor(lo); c <= Math.floor(hi); c++) {
        const t = tile(c, y - 1);
        if (t !== 1 && t !== 6) return false;
      }
      return !blocked.some(([a, b]) => b > lo && a < hi);
    };
    for (let i = 15; i < (sim.w - 2.5) * 10; i++) {
      const x = i / 10;
      if (!clearAt(x)) continue;
      const mid = x + BACK.x * 0.45;
      const behind = art.find(([a, b]) => mid > a - 0.2 && mid < b + 0.2);
      // Nobody else at the edge of the shot.
      const crowd = extras.filter((e) => Math.abs(e - mid) < 6).length;
      // Art the camera can keep whole (see fitArt) beats art hung too high.
      // Art hung too high to keep whole (see fitArt) is best left out of the shot.
      const backdrop = behind && behind[2] - y < ART_TOP ? 1.5 : 0;
      const tall = art.filter(([a, b, top]) => top - y >= ART_TOP && b > mid - 4 && a < mid + 4);
      const sc = backdrop + (y === start ? 0.6 : 0) - (crowd + tall.length) * 1.6 - x * 0.02;
      if (sc > score) {
        score = sc;
        best = behind ? { x, y, art: behind } : { x, y };
      }
    }
  }
  return best;
}

// ---- Idle beats ---------------------------------------------------------------------

/** @param {number} k */
const ease = (k) => k * k * (3 - 2 * k);
/** @param {number} v */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** Rises over the first `a` of 0..1, falls over the last `a`. @param {number} k @param {number} a */
const swell = (k, a = 0.22) => ease(clamp01(k / a)) * (1 - ease(clamp01((k - 1 + a) / a)));
/** @param {number[]} a @param {number[]} b @param {number} k @param {number[]} out */
function mix(a, b, k, out) {
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

/**
 * Little things each hero does while waiting, one every few seconds, on their own
 * clock: rocking on their heels, a chuckle, a glance at the other one, hands clasped
 * behind the back, a toss of the hair, a happy bounce. Nobody waves: arms stay low.
 * @typedef {'rock' | 'chuckle' | 'glance' | 'behind' | 'hair' | 'bounce'} Beat
 * @type {Record<HeroId, {period: number, length: number, beats: Beat[], offset: number}>}
 */
export const BEATS = {
  kevin: { period: 6.4, length: 2.6, beats: ['rock', 'glance', 'behind', 'chuckle'], offset: 1.2 },
  charline: {
    period: 5.6,
    length: 2.2,
    beats: ['hair', 'bounce', 'glance', 'chuckle'],
    offset: 3.9,
  },
};
/** Every so often they turn to each other and share a laugh. */
const SHARED = { period: 23, length: 2.8, at: 15 };

/**
 * The beat a hero is in at time t, and how far into it (0..1), or undefined while
 * they simply stand.
 * @param {HeroId} id @param {number} t
 * @returns {{beat: Beat, k: number} | undefined}
 */
export function beatAt(id, t) {
  const s = (t - SHARED.at) % SHARED.period;
  if (s >= 0 && s < SHARED.length) return { beat: 'chuckle', k: s / SHARED.length };
  const b = BEATS[id];
  const u = t + b.offset;
  const into = u % b.period;
  if (into < 0 || into >= b.length) return undefined;
  const n = Math.floor(u / b.period) % b.beats.length;
  return { beat: b.beats[n], k: into / b.length };
}

/**
 * Applies a beat to a pose; returns the extra body turn (towards the other hero > 0).
 * @param {Required<Pose>} pose @param {Beat} beat @param {number} k 0..1
 */
function applyBeat(pose, beat, k) {
  const w = swell(k);
  switch (beat) {
    case 'rock': {
      // Up on the toes and back on the heels, arms easing behind.
      const r = Math.sin(k * Math.PI * 4);
      pose.bob += Math.max(0, r) * 0.7 * w;
      pose.lean += -r * 0.035 * w;
      pose.armL = pose.armL * (1 - w) - 0.16 * w;
      pose.armR = pose.armR * (1 - w) - 0.16 * w;
      return 0;
    }
    case 'chuckle': {
      // A laugh: eyes creased, shoulders bouncing, the head tipping back a touch.
      const h = Math.abs(Math.sin(k * Math.PI * 7));
      pose.mood = 'happy';
      pose.blink = Math.max(pose.blink, 0.55 * w);
      pose.bob += h * 0.55 * w;
      pose.squash += h * 0.012 * w;
      pose.head += -0.1 * w;
      pose.lean += -0.03 * w;
      pose.armL = pose.armL * (1 - w) + 0.12 * w;
      pose.armR = pose.armR * (1 - w) + 0.12 * w;
      return 0.5 * w;
    }
    case 'glance':
      pose.head += 0.06 * w;
      pose.gaze = 0.2 * w;
      return 0.75 * w;
    case 'behind':
      // Hands clasped behind the back, chest out: relaxed and confident.
      pose.armL = pose.armL * (1 - w) - 0.32 * w;
      pose.armR = pose.armR * (1 - w) - 0.32 * w;
      pose.armSpread = pose.armSpread * (1 - w) - 0.05 * w;
      pose.lean += -0.045 * w;
      pose.head += -0.04 * w;
      return 0;
    case 'hair': {
      // A quick turn of the head that sends the hair swinging.
      const s = Math.sin(k * Math.PI * 2);
      pose.hair += s * 0.4 * w;
      pose.head += -0.06 * w;
      return s * 0.3 * w;
    }
    case 'bounce': {
      const h = Math.abs(Math.sin(k * Math.PI * 4));
      pose.bob += h * 1.1 * w;
      pose.squash += -h * 0.02 * w;
      pose.hem += h * 0.18 * w;
      pose.hair += h * 0.12 * w;
      pose.mood = 'happy';
      return 0;
    }
    default:
      return 0;
  }
}

// ---- The stage ----------------------------------------------------------------------

export class TitleStage {
  constructor() {
    /** 0 = in front, 1 = behind (eased while they swap). @type {Record<HeroId, number>} */
    this.spot = { kevin: 0, charline: 1 };
    /** Which side each hero passes on while swapping, so they never walk through each other. */
    this.side = { kevin: 1, charline: -1 };
    /** Seconds since the front hero arrived (a little bounce when they do). */
    this.arrived = 9;
    /** Free part of the screen for the heroes (see heroRegion). @type {Region} */
    this.region = { cx: 0.68, cy: 0.5, h: 0.62 };
    /** No drift, parallax, beats or swap animation when the system asks for less motion. */
    this.still = false;
    /** Part of the day the light follows (see stamp). @type {TimeOfDay} */
    this.time = 'day';
    /** Pointer position, −1..1 from the centre (parallax), and its smoothed value. */
    this.aim = [0, 0];
    this.look = [0, 0];
    /** Seconds since Jouer was pressed, or −1 while the title waits. */
    this.leaving = -1;
    /** Smoothed camera. */
    this.eye = [0, 0, 0];
    this.target = [0, 0, 0];
    this.lastCam = -1;
    /** Feet of the hero in front, and the point the camera keeps on the pair. */
    this.front = { x: 7, y: 3, z: FRONT_Z };
    this.pair = [0, 0, 0];
    /** Wall art behind the pair (left, right, top), kept whole in the frame. @type {[number, number, number] | undefined} */
    this.art = undefined;
    /** Pull-back that keeps the art whole, cached for a region and aspect. */
    this.fit = 1;
    this.drop = 0;
    this.tilt = PITCH;
    this.fitKey = '';
    this.place({ x: 7, y: 3 });
    // Per-frame storage: camera() hands out the same objects every frame.
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.probe = new Float32Array(16);
    this.out = { viewProj: new Float32Array(16), eye: this.eye, focus: [0, 0] };
    this.shot = { eye: [0, 0, 0], target: [0, 0, 0] };
    this.lastDraw = -1;
    this.lightList = [
      { pos: [0, 0, 0], radius: 6, color: [0.95, 0.84, 0.7] },
      { pos: [0, 0, 0], radius: 3.4, color: [0, 0, 0] },
      { pos: [0, 0, 0], radius: 4.6, color: [0.2, 0.27, 0.46] },
      { pos: [0, 0, 0], radius: 1.9, color: [0.55, 0.46, 0.32] },
      { pos: [0, 0, 0], radius: 4.2, color: [1.35, 0.78, 0.32] },
    ];
  }

  /**
   * Moves the pair to a spot (see findSpot); the camera cuts there and the title waits.
   * @param {Spot} spot
   */
  place(spot) {
    this.front.x = spot.x;
    this.front.y = spot.y;
    // Between them, at chest height.
    this.pair[0] = spot.x + BACK.x * 0.45;
    this.pair[1] = spot.y + 0.95;
    this.pair[2] = FRONT_Z + BACK.z * 0.5;
    this.art = spot.art;
    this.fitKey = '';
    this.lastCam = -1;
    this.leaving = -1;
  }

  /** Jouer was pressed: the camera pushes in on the chosen hero, the other cheers. */
  leave() {
    if (!this.still) this.leaving = 0;
  }

  /**
   * Follows the clock: the light of the part of the day, the line under the logo
   * (`#titleDay`) and `data-time` on the title screen for its CSS.
   * @param {HTMLElement | null} root The title screen.
   * @param {Date} [date] Now, unless a test says otherwise.
   */
  stamp(root, date = new Date()) {
    const c = clockFor(date);
    this.time = c.time;
    if (!root) return c;
    root.dataset.time = c.time;
    root.dataset.naoDay = String(c.naoDay);
    const line = root.querySelector('#titleDay');
    if (line) line.textContent = c.line;
    return c;
  }

  /**
   * Wires the title screen once: the clock (checked every minute) and, with a mouse
   * and full motion, a gentle parallax that follows the pointer (`--px`, `--py`).
   * @param {HTMLElement} root The title screen.
   * @param {Date} [date] Fixed time for tests; the real clock otherwise.
   */
  mount(root, date) {
    this.stamp(root, date);
    if (!date) setInterval(() => this.stamp(root), 60000);
    if (this.still) return;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || document.body.dataset.screen !== 'title') return;
        this.aim[0] = Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1));
        this.aim[1] = Math.max(-1, Math.min(1, (e.clientY / innerHeight) * 2 - 1));
        root.style.setProperty('--px', this.aim[0].toFixed(3));
        root.style.setProperty('--py', this.aim[1].toFixed(3));
      },
      { passive: true },
    );
  }

  /**
   * Eye and look-at point that put the pair at the centre of `region`, `visH` tall.
   * @param {number} aspect @param {number} visH @param {number} yaw @param {number} pitch
   * @param {{eye: number[], target: number[]}} out
   */
  aimAt(aspect, visH, yaw, pitch, out) {
    const r = this.region;
    const cy = r.cy + this.drop;
    const dist = visH / 2 / TAN;
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
    const ny = (1 - 2 * cy) * halfH;
    const p = this.pair;
    out.target[0] = p[0] - rx * nx - ux * ny;
    out.target[1] = p[1] - uy * ny;
    out.target[2] = p[2] - rz * nx - uz * ny;
    out.eye[0] = out.target[0] + bx * dist;
    out.eye[1] = out.target[1] + by * dist;
    out.eye[2] = out.target[2] + bz * dist;
    return out;
  }

  /**
   * The gentlest pull-back (1..MAX_FIT), drop of the pair on screen (0..MAX_DROP) and
   * camera pitch (TILTS) that keep the top of the wall art behind the pair inside the
   * frame, when it is on screen at all. Sets `fit`, `drop` and `tilt`.
   * @param {number} aspect
   */
  fitArt(aspect) {
    const art = this.art;
    const r = this.region;
    const key = `${aspect.toFixed(3)} ${r.cx} ${r.cy} ${r.h} ${r.bottom}`;
    if (key === this.fitKey) return this.fit;
    this.fitKey = key;
    this.fit = 1;
    this.drop = 0;
    this.tilt = PITCH;
    if (!art) return 1;
    const base = FRAME_H / Math.max(0.2, r.h);
    const m = this.probe;
    let best = Infinity;
    let fit = 1;
    let drop = 0;
    let tilt = PITCH;
    for (const p of TILTS)
      for (let f = 1; f <= MAX_FIT + 1e-6; f += 0.05)
        for (let d = 0; d <= MAX_DROP + 1e-6; d += 0.02) {
          // Lowering the pair or the camera costs less than shrinking the heroes.
          const cost = f - 1 + d * 1.5 + (PITCH - p) * 1.2;
          // The feet stay above the menu.
          if (cost >= best || r.cy + d + (r.h / f) * 0.5 > (r.bottom ?? 0.97)) continue;
          this.drop = d;
          const s = this.aimAt(aspect, base * f, -0.15, p, this.shot);
          multiply(
            perspective(FOV, aspect, 0.5, 220, this.proj),
            lookAt(s.eye, s.target, undefined, this.view),
            m,
          );
          let ok = true;
          for (const x of [art[0], art[1]]) {
            const w = m[3] * x + m[7] * art[2] + m[11] * WALL_Z + m[15];
            const sx = ((m[0] * x + m[4] * art[2] + m[8] * WALL_Z + m[12]) / w + 1) / 2;
            const sy = (1 - (m[1] * x + m[5] * art[2] + m[9] * WALL_Z + m[13]) / w) / 2;
            // Room for the slow drift and the parallax.
            if (sx > 0.02 && sx < 0.98 && sy < 0.03) ok = false;
          }
          if (ok) {
            best = cost;
            fit = f;
            drop = d;
            tilt = p;
          }
        }
    // Too tall to keep whole: rather cut it than shrink the heroes further.
    this.drop = drop;
    this.tilt = tilt;
    return (this.fit = fit);
  }

  /**
   * Camera for the title: a slightly low, slowly drifting three-quarter view that puts
   * the pair at the centre of `region`, leaning after the pointer, pushing in on the
   * chosen hero when the game starts.
   * @param {number} aspect @param {number} t Seconds.
   * @returns {{viewProj: Float32Array, eye: number[], focus: number[]}}
   */
  camera(aspect, t) {
    const dt = this.lastCam < 0 || t - this.lastCam > 0.5 ? -1 : t - this.lastCam;
    this.lastCam = t;
    const s = this.still ? 0 : 1;
    const r = this.region;
    // Parallax: the camera leans a little after the pointer.
    const kl = dt < 0 ? 1 : 1 - Math.exp(-dt * 2.5);
    this.look[0] += (this.aim[0] * s - this.look[0]) * kl;
    this.look[1] += (this.aim[1] * s - this.look[1]) * kl;
    const out = ease(clamp01(this.leaving / LEAVE));
    // Visible height at the pair, from the share of the screen they may fill.
    const visH =
      (FRAME_H / Math.max(0.2, r.h)) *
      this.fitArt(aspect) *
      (1 + s * 0.012 * Math.sin(t * 0.23)) *
      (1 - out * 0.22);
    const yaw = -0.15 + s * (0.05 * Math.sin(t * 0.11) - 0.045 * this.look[0]);
    const pitch = this.tilt + s * (0.02 * Math.sin(t * 0.17 + 1) + 0.025 * this.look[1]);
    const shot = this.aimAt(aspect, visH, yaw, pitch, this.shot);
    const k = dt < 0 ? 1 : 1 - Math.exp(-dt * (this.leaving >= 0 ? 14 : 5));
    const e = this.eye;
    const g = this.target;
    for (let i = 0; i < 3; i++) {
      e[i] += (shot.eye[i] - e[i]) * k;
      g[i] += (shot.target[i] - g[i]) * k;
    }
    const o = this.out;
    o.focus[0] = this.pair[0];
    o.focus[1] = this.pair[1];
    multiply(
      perspective(FOV, aspect, 0.5, 220, this.proj),
      lookAt(e, g, undefined, this.view),
      o.viewProj,
    );
    return o;
  }

  /**
   * Feet position of a hero for a spot value (with a sidestep while swapping).
   * @param {HeroId} id
   */
  where(id) {
    const k = ease(this.spot[id]);
    const arc = Math.sin(Math.PI * k) * 0.42 * this.side[id];
    return {
      x: this.front.x + BACK.x * k + arc * 0.63,
      z: FRONT_Z + BACK.z * k + arc * 0.78,
    };
  }

  /**
   * Key light on the hero in front, a coloured rim behind them, a cool fill from the menu
   * side, a warm pool at their feet and a wash on the wall behind, all tinted by the
   * part of the day.
   * @param {number} t @param {HeroId} heroId
   */
  lights(t, heroId) {
    const [key, rim, fill, pool, wash] = this.lightList;
    const amb = AMBIENCE[this.time];
    const front = this.where(heroId);
    const breathe = this.still ? 1 : 1 + Math.sin(t * 0.9) * 0.05;
    key.pos[0] = front.x + 1.3;
    key.pos[1] = this.front.y + 2.9;
    key.pos[2] = front.z + 2.4;
    key.color[0] = amb.key[0];
    key.color[1] = amb.key[1];
    key.color[2] = amb.key[2];
    rim.pos[0] = front.x - 0.15;
    rim.pos[1] = this.front.y + 2.2;
    rim.pos[2] = front.z - 1.25;
    // The rim colour follows whoever is in front, blending as they swap.
    mix(ACCENT.charline, ACCENT.kevin, 1 - this.spot.kevin, rim.color);
    for (let i = 0; i < 3; i++) rim.color[i] *= breathe;
    fill.pos[0] = this.front.x - 2.8;
    fill.pos[1] = this.front.y + 1.6;
    fill.pos[2] = 2.2;
    // A warm pool on the floor where the chosen hero stands.
    pool.pos[0] = front.x + 0.1;
    pool.pos[1] = this.front.y + 0.7;
    pool.pos[2] = front.z + 0.5;
    for (let i = 0; i < 3; i++) pool.color[i] = amb.pool[i];
    // The wash on the wall behind them: low sun, daylight, sunset or the servers' glow.
    wash.pos[0] = this.pair[0] + 0.4;
    wash.pos[1] = this.front.y + 2.3;
    wash.pos[2] = -2.1;
    for (let i = 0; i < 3; i++) wash.color[i] = amb.wash[i] * breathe;
    return this.lightList;
  }

  /**
   * The stage's lighting with the title's lights, shifted towards the mood of the
   * part of the day (shared object, rewritten on every call).
   * @param {Lighting} base @param {number} t @param {HeroId} heroId
   * @returns {Lighting}
   */
  lighting(base, t, heroId) {
    const lit = withLights(base, this.lights(t, heroId));
    const amb = AMBIENCE[this.time];
    const k = amb.mix;
    const from = amb.from;
    mix(lit.sunColor, from.sunColor, k, lit.sunColor);
    mix(lit.sky, from.sky, k, lit.sky);
    mix(lit.ground, from.ground, k, lit.ground);
    mix(lit.fog, from.fog, k, lit.fog);
    const b = lit.backdrop;
    mix(b.top, from.backdrop.top, k, b.top);
    mix(b.mid, from.backdrop.mid, k, b.mid);
    mix(b.bottom, from.backdrop.bottom, k, b.bottom);
    mix(b.glow, from.backdrop.glow, k, b.glow);
    return lit;
  }

  /**
   * Poses both heroes. Relaxed, smiling idles with a little beat now and then.
   * @param {Record<string, any>} cast Built characters by id.
   * @param {HeroId} heroId The chosen hero.
   * @param {number} t @param {DrawItem[]} items @param {ItemSource} pool
   */
  draw(cast, heroId, t, items, pool) {
    const dt = this.lastDraw < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastDraw));
    this.lastDraw = t;
    if (this.leaving >= 0) this.leaving += dt;
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
    const { pose, turn } = this.posture(id, chosen, t);
    const tint = k > 0.01 ? mix([1, 1, 1], SHADE, k, pool.tint(1, 1, 1)) : undefined;
    const o = poseOptions(CAST[id].scale, turn, 0.55 - k * 0.38, tint);
    poseCharacter(cast[id], at.x, this.front.y, at.z, 1, pose, o, items, pool);
  }

  /**
   * How a hero stands at time t: the pose (shared, valid until the next call) and the
   * body turn (0 = facing the camera, + = towards the stage on the right).
   * @param {HeroId} id @param {boolean} chosen @param {number} t
   * @returns {{pose: Required<Pose>, turn: number}}
   */
  posture(id, chosen, t) {
    const k = this.spot[id];
    // Each hero breathes on their own rhythm.
    const ph = t + (id === 'kevin' ? 0 : 2.3);
    const pose = /** @type {Required<Pose>} */ (idlePose(ph));
    const sway = Math.sin(ph * 1.1);
    pose.legL = sway * 0.05;
    pose.legR = -sway * 0.05;
    pose.armL = 0.08 + Math.sin(ph * 1.1 + 0.6) * 0.06;
    pose.armR = 0.08 - Math.sin(ph * 1.1 + 0.6) * 0.06;
    pose.bob = Math.abs(sway) * 0.4;
    pose.lean = -0.03;
    pose.head = Math.sin(ph * 0.7) * 0.08;
    // Both smile: they are glad to be here.
    pose.mood = 'happy';
    const moving = k > 0 && k < 1;
    let extra = 0;
    if (moving) {
      // Swapping: a few easy steps.
      const step = Math.sin(k * Math.PI * 5);
      pose.legL = step * 0.45;
      pose.legR = -step * 0.45;
      pose.armL = -step * 0.3;
      pose.armR = step * 0.3;
      pose.bob = Math.abs(step) * 1.2;
      pose.lean = 0.05;
    } else if (this.leaving >= 0) {
      extra = this.leavePose(pose, chosen, this.leaving);
    } else if (!this.still) {
      const b = beatAt(id, t);
      if (b) extra = applyBeat(pose, b.beat, b.k);
    }
    // Arriving in front: a small happy bounce, nothing more.
    if (chosen && this.arrived < 0.35 && !this.still) {
      const b = Math.sin((this.arrived / 0.35) * Math.PI);
      pose.bob += b * 1.6;
      pose.squash = -b * 0.05;
    }
    // The one in front faces the player; the other mostly watches them, now and then the camera.
    const glance = this.still ? 0 : ease(Math.max(0, Math.sin(t * 0.33 + 1.2)) ** 3);
    // A positive extra turns towards the other hero: right in front, left behind.
    const turn = chosen
      ? -0.2 + (this.still ? 0 : Math.sin(t * 0.4) * 0.05) + extra
      : -0.62 + glance * 0.4 + (moving ? 0.3 : 0) - extra * 0.6;
    return { pose, turn };
  }

  /**
   * Off they go: the chosen hero turns towards the stage and crouches to run; the other
   * cheers, both arms up together. Returns the extra turn.
   * @param {Required<Pose>} pose @param {boolean} chosen @param {number} s Seconds.
   */
  leavePose(pose, chosen, s) {
    const k = ease(clamp01(s / LEAVE));
    if (chosen) {
      pose.lean = 0.12 * k;
      pose.squash = 0.05 * k;
      pose.bob -= 0.8 * k;
      pose.legL = 0.35 * k;
      pose.legR = -0.25 * k;
      pose.armL = -0.45 * k;
      pose.armR = 0.4 * k;
      pose.hair = 0.2 * k;
      return 1.1 * k;
    }
    const hop = Math.abs(Math.sin(s * 14));
    pose.armL = 2.55 * k + hop * 0.15 * k;
    pose.armR = pose.armL;
    pose.armSpread = -0.35 * k;
    pose.bob += hop * 1.4 * k;
    pose.head = -0.08 * k;
    pose.blink = 0.5 * k;
    return 0.6 * k;
  }
}

/** The one title stage (main.js frames and lights it, scene.js draws the heroes). */
export const title = new TitleStage();
