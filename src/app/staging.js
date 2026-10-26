import { bossHeight, teleportTarget } from '../game/boss.js';
import { HERO } from '../game/sim.js';
import { cameraTarget } from './camera.js';

/**
 * Staging: boss-fight lighting and framing, and the dynamic resolution that
 * keeps the frame rate up on modest devices.
 *
 * A duel is staged like a show. The house lights go down and a key light finds
 * the director while he speaks, then the camera pulls back on the whole arena.
 * Every phase change flashes, dips and comes back in the colours of the new
 * phase: Julien's failover to the backup site runs on red alarm light,
 * Rodolphe's grand finale is played by night under a follow spot on the hero.
 * Once convinced, warm light floods the stage for the signing. Every argument
 * that lands pushes the camera in on him; the first PRIMO window of each
 * director slows time down for a beat so nobody misses it. In the dark stages a
 * rim light follows the hero. Everything here is a pure function of the
 * simulation and the clock (bar the PRIMO cue's timer), and allocates nothing
 * per frame: lights and lighting are shared objects, rewritten in place.
 *
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../data/levels/index.js').Level} Level
 * @typedef {import('../gfx/renderer.js').Lighting} Lighting
 * @typedef {{pos: number[], radius: number, color: number[]}} PointLight
 */

/** The renderer takes 8 point lights: a duel keeps some for the stage's own lamps. */
const MAX_LIGHTS = 6;
/** @type {PointLight[]} */
const POOL = Array.from({ length: MAX_LIGHTS }, () => ({
  pos: [0, 0, 0],
  radius: 0,
  color: [0, 0, 0],
}));
/**
 * The first n lights of POOL, for every n: a frame's list is one of these, so it
 * never changes length (emptying an array and refilling it allocates every time).
 * @type {PointLight[][]}
 */
const VIEWS = Array.from({ length: MAX_LIGHTS + 1 }, (_, n) => POOL.slice(0, n));
/** Lights added this frame. */
let count = 0;

/**
 * Adds a light to this frame's list (dropped once the list is full, so add
 * the important ones first).
 * @param {number} x @param {number} y @param {number} z @param {number} radius
 * @param {number} r @param {number} g @param {number} b
 */
function add(x, y, z, radius, r, g, b) {
  if (count >= MAX_LIGHTS) return;
  const l = POOL[count++];
  l.pos[0] = x;
  l.pos[1] = y;
  l.pos[2] = z;
  l.radius = radius;
  l.color[0] = r;
  l.color[1] = g;
  l.color[2] = b;
}

/** @param {number} x */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** @param {number} a @param {number} b @param {number} x */
export const smoothstep = (a, b, x) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** @param {number} a @param {number} b @param {number} k */
const mix = (a, b, k) => a + (b - a) * k;

/**
 * Ends of the arena floor, like arenaFloor() in boss.js but without a new array
 * every frame: from just past the gate to the far wall.
 * @param {Sim} sim @param {Thing} b
 */
export const floorX0 = (sim, b) => (sim.boss?.arena[0] ?? b.x - 8) + 1;
/** @param {Sim} sim @param {Thing} b */
export const floorX1 = (sim, b) => (sim.boss?.arena[1] ?? b.x + 8) + 1;

/** The boss of the stage, if any (no closure: called every frame). @param {Sim} sim */
export function bossOf(sim) {
  const list = sim.things;
  for (let i = 0; i < list.length; i++) if (list[i].kind === 'boss') return list[i];
  return undefined;
}

/**
 * When the colour scheme of the next phase takes over during a phase change (0..1).
 * @param {number} bt Seconds into the 'phase' state.
 */
export const phaseBlend = (bt) => smoothstep(0.5, 1.6, bt);

/**
 * Where the stage stands, as the boss drawing and the lights both read it.
 * `phase` is the colour scheme in use (it switches during a phase change);
 * `beat` is a 0..1 accent that peaks on entrances, phase changes and hits.
 * @param {Sim} sim @param {Thing} b
 */
export function stageMood(sim, b) {
  const bt = b.t ?? 0;
  const phase = b.phase ?? 1;
  const state = b.state;
  let beat = 0;
  if (state === 'phase') beat = bt < 0.15 ? 1 : 1 - smoothstep(0.15, 1.2, bt);
  else if (state === 'hit') beat = 0.6 * (1 - smoothstep(0, 0.3, bt));
  else if (state === 'convinced') beat = 1 - smoothstep(0, 0.8, bt);
  MOOD.phase = state === 'phase' && phaseBlend(bt) < 0.5 ? phase - 1 : phase;
  MOOD.beat = beat;
  MOOD.done = sim.bossDone;
  return MOOD;
}
const MOOD = { phase: 1, beat: 0.5, done: false };

/**
 * Extra lights for a boss fight. Julien: a cool key light, the cold glow of his
 * servers (red alarm beacons once he fails over), cable runs crackling blue.
 * Rodolphe: coloured spotlights sweeping the stage that land on the warned
 * spots, a warm key light, and in his grand finale a follow spot on the hero.
 * Both: the PRIMO tablet lights up the director's face while he consults it.
 * The returned list is rewritten on the next call.
 * @param {Level} level @param {Sim} sim @param {number} t
 * @param {boolean} [flashes] The « Flashs » option: hits and phase changes flash white only with it.
 * @returns {PointLight[]}
 */
export function bossLights(level, sim, t, flashes = true) {
  count = 0;
  const b = level.boss && sim.bossActive ? bossOf(sim) : undefined;
  if (b) {
    cueLight(b);
    stage(level, sim, b, t, flashes);
  }
  rim(level, sim);
  return VIEWS[count];
}

/** Stages lit low enough for the hero to need a rim light. */
const DARK = new Set(['night', 'dawn', 'event']);

/**
 * The hero's rim light in the dark stages: a cool light just behind and above
 * him (on the side he comes from) that outlines his head and shoulders and
 * lifts him off the background.
 * @param {Level} level @param {Sim} sim
 */
function rim(level, sim) {
  if (!level.mood || !DARK.has(level.mood)) return;
  const h = sim.hero;
  if (h.state === 'dead') return;
  add(h.x + HERO.w / 2 - h.facing * 0.7, h.y + 2.3, -0.9, 3.2, 0.75, 0.95, 1.45);
}

/**
 * The first PRIMO window's cue: a lime ring of light spreading from his feet.
 * @param {Thing} b
 */
function cueLight(b) {
  const k = primoCue.ring;
  if (k < 0) return;
  const f = (1 - k) * 2.2;
  add(b.x, (b.y0 ?? b.y) + 0.6, 0.9, 2.5 + k * 6, 0.95 * f, 2.1 * f, 0.45 * f);
}

/**
 * Adds the lights of the duel's current moment (see bossLights()).
 * @param {Level} level @param {Sim} sim @param {Thing} b @param {number} t @param {boolean} flashes
 */
function stage(level, sim, b, t, flashes) {
  const x0 = floorX0(sim, b),
    x1 = floorX1(sim, b);
  const mid = (x0 + x1) / 2;
  const floor = b.y0 ?? b.y;
  const bt = b.t ?? 0;
  const hx = sim.hero.x + HERO.w / 2;
  const face = Math.sign(hx - b.x) || -1;
  const state = b.state;
  const mood = stageMood(sim, b);
  const julien = level.boss?.id === 'techServicesDirector';
  /** The top of his head: lights find his face and hang over him whatever his size. */
  const head = b.y + bossHeight(sim);

  // Signed: warm light on both of them, then the stage's own lamps take over.
  if (sim.bossDone) {
    const k = 1 - smoothstep(5, 8, state === 'sign' ? bt : 0);
    if (k <= 0) return;
    add((hx + b.x) / 2, floor + 3.2, 2.4, 9, 2.8 * k, 2.15 * k, 1.15 * k);
    if (julien) {
      // Every rack back to green.
      add(x0 + 3, floor + 2, -1.6, 6, 0.15 * k, 0.8 * k, 0.3 * k);
      add(x1 - 3, floor + 2, -1.6, 6, 0.15 * k, 0.8 * k, 0.3 * k);
    } else {
      // The coloured spots close in on the two of them.
      const c = (hx + b.x) / 2;
      const s = Math.sin(t * 1.6) * 1.2;
      add(c - 1.5 + s, floor + 4, 0.5, 7, 2.2 * k, 0.6 * k, 1.4 * k);
      add(c + 1.5 - s, floor + 4, 0.5, 7, 0.6 * k, 1.2 * k, 2.4 * k);
    }
    return;
  }

  // A hit or a phase change: a white flash on the director first.
  if (mood.beat > 0.3 && flashes) {
    const k = mood.beat;
    add(b.x, head - 0.3, 1.6, state === 'phase' ? 14 : 6, 3.2 * k, 3 * k, 2.8 * k);
  }
  // The consult window: the PRIMO tablet lights up his face, lime like an open door.
  if (state === 'consult') {
    const k = 0.85 + Math.sin(t * 9) * 0.15;
    add(b.x + face * 0.35, head - 0.85, 1, 3.4, 0.95 * k, 2.1 * k, 0.45 * k);
  }
  // Entrance: the key light starts strong (the house lights are down), then settles.
  const intro = state === 'intro' || state === 'idle';
  const key = intro ? mix(1.7, 0.75, smoothstep(0.6, 1.7, bt)) : 0.75;

  if (julien) {
    if (state === 'cables') {
      // Cable runs warned: blue crackle over the floor; live: a bright arc flash.
      let live = false,
        warn = false;
      for (let i = 0; i < sim.things.length; i++) {
        const z = sim.things[i];
        if (z.kind === 'zone' && z.alive) {
          if (z.state === 'live') live = true;
          else warn = true;
        }
      }
      if (live) add(mid, floor + 0.8, 0.8, 11, 1, 1.7, 3.2);
      else if (warn) {
        const k = 0.55 + 0.45 * Math.abs(Math.sin(t * 17));
        add(mid, floor + 0.8, 0.8, 10, 0.25 * k, 0.6 * k, 1.8 * k);
      }
    }
    if (state === 'teleport') {
      // Failover: a cyan glow rises from the floor where he stands (from below and
      // behind, so his face keeps its colours) and gathers where he will appear.
      const k = bt < 0.55 ? smoothstep(0, 0.55, bt) : 1 - smoothstep(0.55, 0.9, bt);
      const to = bt < 0.55 ? teleportTarget(sim, b) : b.x;
      add(b.x, floor + 0.3, -0.6, 3.6, 0.3 * k, 1.1 * k, 1.5 * k);
      if (bt < 0.55) add(to, floor + 1, 0.8, 3.5, 0.3 * k * 2, 1.2 * k * 2, 1.6 * k * 2);
    }
    add(b.x, head + 1.7, 2.4, 7, 1.1 * key, 1.35 * key, 1.8 * key);
    if (mood.phase >= 2) {
      // Backup site: two alarm beacons turning in turn.
      const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6));
      const c = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 + Math.PI));
      add(x0 + 3, floor + 4.5, -1, 8, 2.2 * a, 0.25 * a, 0.15 * a);
      add(x1 - 3, floor + 4.5, -1, 8, 2.2 * c, 0.25 * c, 0.15 * c);
    } else {
      // The cold aisle glow of the servers, booting up with the entrance.
      const k = intro ? smoothstep(0.2, 1.2, bt) * 0.9 : 0.9;
      add(x0 + 3, floor + 2, -1.6, 7, 0.22 * k, 0.9 * k, 0.85 * k);
      add(x1 - 3, floor + 2, -1.6, 7, 0.22 * k, 0.9 * k, 0.85 * k);
    }
    return;
  }

  // Rodolphe. Warned spotlight zones get a pool of light, brighter once live.
  let pools = 0;
  for (let i = sim.things.length - 1; i >= 0 && pools < 2; i--) {
    const z = sim.things[i];
    if (z.kind !== 'zone' || !z.alive || z.variant !== 'spot') continue;
    const w = z.w ?? 1;
    const live = z.state === 'live';
    const k = live ? 1 : 0.35 + 0.35 * smoothstep(0, 1, z.t ?? 0) + Math.sin(t * 14) * 0.1;
    add(z.x + w / 2, (z.y0 ?? z.y) + 2.2, 0.9, w * 0.75 + 1.5, 3 * k, 1.1 * k, 1.8 * k);
    pools++;
  }
  const finale = mood.phase >= 3;
  if (finale) {
    // Grand finale: a warm follow spot keeps the hero centre stage.
    add(hx, sim.hero.y + 3, 2.5, 7, 4, 3.5, 2.8);
  }
  if (state === 'leap' && bt > 1.1 && bt < 1.4) {
    const k = 1 - (bt - 1.1) / 0.3;
    add(b.x, floor + 0.6, 1, 7, 3 * k, 2.6 * k, 1.8 * k);
  }
  add(b.x, head + 1.9, 2.6, 6.5, 2 * key, 1.6 * key, 1.2 * key);
  // Three coloured spots sweep the stage, faster on the regional tour, gold in the finale.
  // During the entrance they gather on him for his opening line.
  const speed = mood.phase >= 2 ? 1.35 : 0.9;
  const half = (x1 - x0) / 2 - 1;
  const gather = intro ? smoothstep(0.5, 1.1, bt) * (1 - smoothstep(1.3, 1.8, bt)) : 0;
  const dim = finale ? 0.55 : 1;
  for (let i = 0; i < 3; i++) {
    const sx = mid + Math.sin(t * speed + i * 2.1) * half;
    const x = mix(sx, b.x + (i - 1) * 0.8, gather);
    const c = SPOT_COLORS[finale ? 3 : i];
    add(x, 7, 0.5, 8, c[0] * dim, c[1] * dim, c[2] * dim);
  }
}

/** Rodolphe's spotlights: pink, blue, lime, and gold for the finale. */
const SPOT_COLORS = [
  [2.4, 0.6, 1.5],
  [0.6, 1.2, 2.6],
  [1.6, 2.2, 0.6],
  [2.6, 1.9, 0.8],
];

/**
 * Lighting with extra point lights in front of the stage's own (shared object,
 * rewritten on every call).
 * @param {Lighting} base @param {PointLight[]} extra
 * @returns {Lighting}
 */
export function withLights(base, extra) {
  if (!extra.length) return base;
  copyLighting(base, 1, 1, 1, 1, 1);
  joinLights(extra, base.lights);
  return LIT;
}

/**
 * LIT's lights: `extra` then `own`, written in place. The total only changes when
 * the duel moves on, and never drops to zero, so the array keeps its storage.
 * @param {PointLight[]} extra @param {PointLight[]} own
 */
function joinLights(extra, own) {
  const lights = LIT.lights;
  let n = 0;
  for (let i = 0; i < extra.length; i++) lights[n++] = extra[i];
  for (let i = 0; i < own.length; i++) lights[n++] = own[i];
  if (lights.length !== n) lights.length = n;
}

/** Shared lighting of the staged frame. @type {Lighting} */
const LIT = {
  sunDir: [0, -1, 0],
  sunColor: [0, 0, 0],
  sky: [0, 0, 0],
  ground: [0, 0, 0],
  fog: [0, 0, 0],
  fogRange: [0, 0],
  backdrop: { top: [0, 0, 0], mid: [0, 0, 0], bottom: [0, 0, 0], sun: [0, 0], glow: [0, 0, 0] },
  lights: [],
};

/**
 * @param {number[]} out @param {number[]} src @param {number} k
 * @param {number} r @param {number} g @param {number} b
 */
function scale3(out, src, k, r, g, b) {
  out[0] = src[0] * k * r;
  out[1] = src[1] * k * g;
  out[2] = src[2] * k * b;
}

/**
 * Copies `base` into LIT with the light scaled by `k` and tinted, the sky by `sky`.
 * @param {Lighting} base @param {number} k @param {number} r @param {number} g @param {number} b
 * @param {number} sky
 */
function copyLighting(base, k, r, g, b, sky) {
  LIT.sunDir = base.sunDir;
  LIT.fogRange = base.fogRange;
  scale3(LIT.sunColor, base.sunColor, k, r, g, b);
  scale3(LIT.sky, base.sky, k, r, g, b);
  scale3(LIT.ground, base.ground, k, r, g, b);
  scale3(LIT.fog, base.fog, sky, 1, 1, 1);
  const from = base.backdrop,
    to = LIT.backdrop;
  scale3(to.top, from.top, sky, 1, 1, 1);
  scale3(to.mid, from.mid, sky, 1, 1, 1);
  scale3(to.bottom, from.bottom, sky, 1, 1, 1);
  scale3(to.glow, from.glow, sky, 1, 1, 1);
  to.sun = from.sun;
}

/**
 * Light level, tint and sky of a phase of the duel.
 * @param {boolean} julien @param {number} phase @param {number} t
 * @param {number[]} out [level, r, g, b, sky]
 */
function phaseMood(julien, phase, t, out) {
  if (julien) {
    if (phase >= 2) set5(out, 0.72 + Math.sin(t * 6) * 0.03, 1.14, 0.78, 0.78, 0.85);
    else set5(out, 0.82, 0.95, 1, 1.08, 1);
  } else if (phase >= 3) set5(out, 0.42, 0.88, 0.84, 1.12, 0.42);
  else if (phase === 2) set5(out, 0.74, 1.05, 0.94, 1.06, 0.74);
  else set5(out, 0.86, 1, 1, 1, 0.9);
  return out;
}
/**
 * @param {number[]} o @param {number} a @param {number} b @param {number} c
 * @param {number} d @param {number} e
 */
function set5(o, a, b, c, d, e) {
  o[0] = a;
  o[1] = b;
  o[2] = c;
  o[3] = d;
  o[4] = e;
}
const M1 = [0, 0, 0, 0, 0];
const M2 = [0, 0, 0, 0, 0];
/** The signing's golden light: Julien's cold server room needs more warmth than the sunset. */
const WARM = [1.1, 1.3, 1.05, 0.75, 1];
const WARM_DUSK = [1.05, 1.1, 1, 0.9, 1];
const HOUSE_DOWN = [0.45, 0.95, 0.95, 1.05, 0.6];

/**
 * The stage's lighting during a boss fight, boss lights included: house lights
 * down for the entrance, a flash and a dip on every phase change, then the
 * colours of the phase; warm light for the signing. Returns `base` itself
 * outside boss fights, otherwise a shared object rewritten on every call.
 * @param {Level} level @param {Sim} sim @param {number} t @param {Lighting} base
 * @param {boolean} [flashes] The « Flashs » option: without it a phase change only
 *   blends into its new colours, and a hit does not brighten the stage.
 * @returns {Lighting}
 */
export function bossLighting(level, sim, t, base, flashes = true) {
  const extra = bossLights(level, sim, t, flashes);
  const b = level.boss && sim.bossActive ? bossOf(sim) : undefined;
  if (!b || !level.boss) return withLights(base, extra);
  const julien = level.boss.id === 'techServicesDirector';
  const bt = b.t ?? 0;
  const state = b.state;
  /** @type {number[]} */
  let m = phaseMood(julien, b.phase ?? 1, t, M1);
  if (state === 'idle' || state === 'intro') {
    // House lights down while he speaks, up again as the duel begins.
    const k = state === 'idle' ? 0 : smoothstep(0.6, 1.7, bt);
    for (let i = 0; i < 5; i++) M2[i] = mix(HOUSE_DOWN[i], m[i], k);
    m = M2;
  } else if (state === 'phase') {
    // Flash, dip, then the new phase's colours.
    const from = phaseMood(julien, (b.phase ?? 2) - 1, t, M2);
    const k = phaseBlend(bt);
    for (let i = 0; i < 5; i++) M2[i] = mix(from[i], M1[i], k);
    if (flashes) {
      const flash = bt < 0.12 ? 1.6 : mix(1.6, 0.55, smoothstep(0.12, 0.45, bt));
      M2[0] *= bt < 0.45 ? flash : mix(0.55, 1, smoothstep(0.45, 1.6, bt));
    }
    m = M2;
  } else if (state === 'hit' && bt < 0.15 && flashes) {
    for (let i = 0; i < 5; i++) M2[i] = M1[i];
    M2[0] *= 1.25;
    m = M2;
  } else if (state === 'convinced') {
    // Convinced: warm light floods in at once (his outro is spoken right away)...
    m = julien ? WARM : WARM_DUSK;
  } else if (state === 'sign') {
    // ...and fades back to the stage's own a while after the signing.
    const k = smoothstep(5, 8, bt);
    const warm = julien ? WARM : WARM_DUSK;
    for (let i = 0; i < 5; i++) M2[i] = mix(warm[i], ONE[i], k);
    m = M2;
  }
  copyLighting(base, m[0], m[1], m[2], m[3], m[4]);
  joinLights(extra, base.lights);
  return LIT;
}
const ONE = [1, 1, 1, 1, 1];

/**
 * Reused camera focus (numbers only, so its fields are stored unboxed). `low`
 * (0 to 1): how far the camera drops for a low angle (the directors' entrances).
 * @type {{x: number, y: number, facing: number, visH?: number, low: number}}
 */
const FOCUS = { x: 0.5, y: 0.5, facing: 0.5, visH: 8.5, low: 0.5 };
/**
 * @param {number} x @param {number} y @param {number} facing @param {number} visH
 */
function focus(x, y, facing, visH) {
  FOCUS.x = x;
  FOCUS.y = y;
  FOCUS.facing = facing;
  FOCUS.visH = visH;
  FOCUS.low = 0;
  return FOCUS;
}

/** Room kept between a framed character and the edge of the screen (tiles). */
const MARGIN = 1;
/**
 * How far the duel's wide shot sits above the floor (tiles): the boss bar of the
 * HUD covers the top of the screen, so the arena's top (its signs and posters)
 * comes down under it, and the stage's front edge gives the room.
 */
const RAISE = 0.8;
/**
 * NA-1 / GP-4: what the signing shot must show besides the two of them, as points
 * (height above the floor, depth) that must stay on screen: the top of Julien's
 * display (« JULIEN » up to floor + 5.6, hung at the back) down to the feet; for
 * Rodolphe, his head down to the marquee on the front of his stage (under the
 * floor and near the camera). `half`: half the sign's width, from the arena's middle.
 */
const SIGN_SHOT = {
  techServicesDirector: { half: 3.2, top: [5.65, -2.25], bottom: [-0.25, 0] },
  regionalDirector: { half: 4.6, top: [3.1, 0], bottom: [-0.95, 1.39] },
};
/** The HUD's height in CSS pixels (style.css: 56 px under the safe area), and some air. */
const HUD_PX = 64;
/** Screen heights the HUD share is taken for: a short landscape phone, a PC. */
const SHORT_SCREEN = 360;
const TALL_SCREEN = 720;

/** Camera geometry as in camera.js: field of view, eye above the target, target depth. */
const TAN_HALF = Math.tan((15 * Math.PI) / 180);
const EYE_UP = 1.4;
const TARGET_Z = -0.8;

/**
 * Where a point lands on screen, from the top (0) to the bottom (1), for the camera
 * camera.js builds on a target at height `ty` with `visH` tiles of visible height.
 * @param {number} ty @param {number} visH @param {number} y @param {number} z
 */
export function screenRow(ty, visH, y, z) {
  const dist = visH / 2 / TAN_HALF;
  // Looking from (ty + EYE_UP, dist) at (ty, TARGET_Z): forward and up, in the y–z plane.
  const fy = -EYE_UP,
    fz = TARGET_Z - dist;
  const n = Math.hypot(fy, fz);
  const [dy, dz] = [fy / n, fz / n];
  const [uy, uz] = [-dz, dy];
  const vy = y - (ty + EYE_UP),
    vz = z - dist;
  const ndc = (vy * uy + vz * uz) / (vy * dy + vz * dz) / TAN_HALF;
  return (1 - ndc) / 2;
}

/**
 * The signing: the director, the hero and the sign that says it, whole and clear
 * of the HUD (and of the touch pads at the bottom); null when the screen is too
 * narrow for all three (an upright phone), where the shot keeps the two of them.
 * @param {Sim} sim @param {Thing} b @param {number} hx @param {number} baseH
 * @param {number} aspect @param {number} lift Tiles the touch pads cover at the bottom.
 */
function signShot(sim, b, hx, baseH, aspect, lift) {
  const s =
    SIGN_SHOT[sim.boss?.id === 'regionalDirector' ? 'regionalDirector' : 'techServicesDirector'];
  const mid = (floorX0(sim, b) + floorX1(sim, b)) / 2;
  const floor = b.y0 ?? b.y;
  const left = Math.min(hx, b.x, mid - s.half) - MARGIN;
  const right = Math.max(hx, b.x, mid + s.half) + MARGIN;
  const x = (left + right) / 2;
  const maxH = aspect >= 1 ? 10.5 : Math.max(12.5, sim.h + 2);
  // The HUD keeps its size in pixels: a bigger share of a short (wide) phone screen.
  const hudTop = HUD_PX / (aspect > 2 ? SHORT_SCREEN : TALL_SCREEN);
  const bounds = { w: sim.w, h: sim.h };
  for (let visH = Math.max(baseH, (right - left) / aspect); visH <= maxH; visH += 0.25) {
    // The target height that puts the top point just under the HUD: raising the
    // camera moves every point down the screen.
    let lo = floor - 6,
      hi = floor + 16;
    for (let i = 0; i < 40; i++) {
      const ty = (lo + hi) / 2;
      if (screenRow(ty, visH, floor + s.top[0], s.top[1]) < hudTop) lo = ty;
      else hi = ty;
    }
    // What the camera really does with it (its floor and ceiling stops).
    const [, ty] = cameraTarget(aspect, visH, { x, y: lo - 2.2, facing: 0 }, bounds);
    const top = screenRow(ty, visH, floor + s.top[0], s.top[1]);
    const bottom = screenRow(ty, visH, floor + s.bottom[0] - lift, s.bottom[1]);
    if (top >= hudTop - 0.005 && bottom <= 0.98) return focus(x, ty - 2.2, 0, visH);
  }
  return null;
}

/** The directors' height the close-ups were first framed for (tiles). */
const FRAMED_FOR = 2.05;

/**
 * Frames `keep` (always in the shot, MARGIN from the edge) and `other` as well when
 * both fit, pulling back from `baseH` tiles of visible height as far as the screen
 * shape allows: on a narrow screen as far as the level's height and 2 more.
 * @param {number} keep @param {number} other @param {number} y @param {number} baseH
 * @param {number} aspect @param {number} levelH
 */
function frame(keep, other, y, baseH, aspect, levelH) {
  const maxH = aspect >= 1 ? 10.5 : Math.max(12.5, levelH + 2);
  const need = Math.abs(other - keep) + 2 * MARGIN;
  const visH = Math.min(maxH, Math.max(baseH, need / aspect));
  const half = (visH * aspect) / 2;
  const x =
    need <= half * 2 ? (keep + other) / 2 : keep + Math.sign(other - keep) * (half - MARGIN);
  return focus(x, y, 0, visH);
}

/**
 * Every argument that lands: the camera pushes in for a beat (towards the
 * director on a wide screen; straight in on a narrow one, where the hero must
 * stay in the shot), then eases back out.
 * @param {typeof FOCUS} f @param {Thing} b @param {number} hx @param {boolean} wide
 */
function pushIn(f, b, hx, wide) {
  if (b.state !== 'hit') return f;
  const bt = b.t ?? 0;
  const k = bt < 0.1 ? bt / 0.1 : 1 - smoothstep(0.1, 0.6, bt);
  if (wide) f.x = mix(f.x, (hx + b.x * 2) / 3, 0.6 * k);
  f.visH = (f.visH ?? 8.2) * (1 - (wide ? 0.22 : 0.12) * k);
  return f;
}

/**
 * During a boss fight the camera frames both fighters. The entrance starts close
 * on the director while he speaks, then pulls back on the whole arena; a phase
 * change leans in on him; the signing frames him and the hero together. A wide
 * screen holds the whole arena in view; a narrower one (a phone held upright)
 * keeps the hero in the shot, pulls back to fit the director too when it can,
 * and frames the director for his entrance. The returned object is rewritten on
 * the next call.
 * @param {Sim} sim @param {number} lift Extra room at the bottom (touch pads).
 * @param {number} [aspect] Screen width / height.
 */
export function fightFocus(sim, lift, aspect) {
  if (!sim.bossActive) return null;
  const b = bossOf(sim);
  if (!b) return null;
  const hx = sim.hero.x + HERO.w / 2;
  const hy = sim.hero.y;
  const floor = b.y0 ?? b.y;
  const bt = b.t ?? 0;
  const known = aspect !== undefined && aspect > 0;
  const a = aspect ?? 1;
  const wide = known && a >= 1;
  // The follow camera's own framing (see camera.js): a little closer when upright.
  const baseH = known && a < 1 ? 7.4 : 8.2;
  // Close-ups widen with the director's size, so an imposing director still fits.
  const tall = bossHeight(sim) / FRAMED_FOR;
  if (sim.bossDone) {
    // The signing: the two of them in one shot, until the envelope is in hand.
    if (sim.hasKey || Math.abs(hx - b.x) > 7 || (b.state === 'sign' && bt > 6)) return null;
    const y = floor - 0.7 + (tall - 1) * 2 - lift;
    const h = 6.4 * tall;
    if (!known) return focus((hx + b.x) / 2, y, 0, h);
    return signShot(sim, b, hx, h, a, lift) ?? frame(b.x, hx, y, h, a, sim.h);
  }
  const x0 = floorX0(sim, b),
    x1 = floorX1(sim, b);
  const mid = (x0 + x1) / 2;
  // Visible height that shows the whole arena, when the screen is wide enough for it.
  const arenaH = wide ? Math.max(8.8, (x1 - x0 - 0.5) / a) : Infinity;
  if (b.state === 'idle' || (b.state === 'intro' && bt < 0.7)) {
    // The entrance: close on the director, a little to the hero's side on a wide
    // screen. Rodolphe's shot is wider and lower, down to his name on the stage.
    // A low angle: the camera looks up at him, his head clear of the boss bar
    // (a little more room on a very wide screen, where the bar takes more of it).
    const side = wide ? Math.sign(hx - b.x) * 0.5 : 0;
    const up = (tall - 1) * 2.4 + (a > 2 ? 0.5 : 0);
    const f =
      sim.boss?.id === 'regionalDirector'
        ? focus(b.x + side, floor - 1.4 + up - lift, 0, 6.4 * tall)
        : focus(b.x + side, b.y - 1 + up - lift, 0, 5.2 * tall);
    f.low = 1;
    return f;
  }
  if (b.state === 'intro') {
    // The reveal: the whole arena, or the director and as much of the way to the hero as fits.
    if (arenaH <= 10.5) return focus(mid, floor + 0.4 + RAISE - lift, 0, Math.max(9.2, arenaH));
    return known
      ? frame(b.x, hx, floor - lift, baseH, a, sim.h)
      : focus(b.x, floor - lift, 0, baseH);
  }
  if (b.state === 'phase' && bt < 1.3 && Math.abs(hx - b.x) < 6) {
    // A new phase: lean in on him, with the hero still in the shot.
    const y = floor - 0.5 + (tall - 1) * 2 - lift;
    if (wide) return focus((hx + b.x * 2) / 3, y, 0, 6.6 * tall);
    if (known) return frame(hx, b.x, y, 6.6 * tall, a, sim.h);
  }
  if (arenaH <= 10.5) {
    // The duel on a wide screen: the whole arena, rising a little with the hero.
    const y = floor + RAISE + Math.max(0, hy - floor) * 0.5;
    return pushIn(focus(mid, y - lift, 0, arenaH), b, hx, true);
  }
  // Narrower screens: the hero always in the shot, the director too when he fits.
  if (known) return pushIn(frame(hx, b.x, hy - lift, baseH, a, sim.h), b, hx, false);
  // Screen shape unknown: the follow camera's own framing, on the hero.
  return focus(hx, hy - lift, Math.sign(b.x - hx) * 0.4, 8.2);
}

/** How long the first PRIMO window of a director plays in slow motion (real seconds), and how slow. */
export const PRIMO_SLOW = 0.8;
const PRIMO_SCALE = 0.35;
/** What the HUD says as it starts, in the player's own controls (fillKeys). */
export const PRIMO_PROMPT = '{fire} : maintenant !';

/**
 * The first time each director consults PRIMO, time slows down for 0.8 s, a
 * lime ring spreads from his feet and the HUD says what to do. Shown once per
 * director (pass the ones already seen to skip them).
 */
export class PrimoCue {
  /** @param {Iterable<string>} [seen] Directors whose first consult was already cued. */
  constructor(seen = []) {
    this.seen = new Set(seen);
    /** Real seconds into the cue, -1 when none plays. */
    this.t = -1;
    /** True on the frame a cue starts: show {@link PRIMO_PROMPT} then. */
    this.started = false;
  }

  /**
   * Call once per frame during play, before stepping the simulation.
   * @param {Sim} sim @param {number} dt Real seconds since the last frame.
   * @returns {number} Time scale for this frame (1 outside the cue).
   */
  update(sim, dt) {
    this.started = false;
    const b = sim.bossActive && !sim.bossDone ? bossOf(sim) : undefined;
    const id = sim.boss?.id;
    if (this.t < 0) {
      if (b?.state === 'consult' && id && !this.seen.has(id)) {
        this.seen.add(id);
        this.t = 0;
        this.started = true;
      }
    } else if ((this.t += dt) >= PRIMO_SLOW || b?.state !== 'consult') this.t = -1;
    return this.scale;
  }

  /** Time scale now: slow, easing back to full speed over the last quarter second. */
  get scale() {
    if (this.t < 0) return 1;
    return mix(PRIMO_SCALE, 1, smoothstep(PRIMO_SLOW - 0.25, PRIMO_SLOW, this.t));
  }

  /** Progress of the ring (0 to 1), -1 when no cue plays. */
  get ring() {
    return this.t < 0 ? -1 : this.t / PRIMO_SLOW;
  }

  /** Forgets the directors seen (a new game). */
  reset() {
    this.seen.clear();
    this.t = -1;
  }
}

/** The game's PRIMO cue (read by the drawing for its ring). */
export const primoCue = new PrimoCue();

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
