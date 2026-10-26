import { CAST } from '../data/cast.js';
import { FRESH, poseCharacter, poseOptions } from '../gfx/characters.js';
import { WARN, consultLength, teleportTarget } from '../game/boss.js';
import { HERO, TILE, tileAt } from '../game/sim.js';
import { pileColumn } from '../game/enemies.js';
import { PERIOD, WET, phaseOf, sinceSpray, wetSpan } from '../game/traps.js';
import { multiply, rotationX, rotationY, rotationZ, scaling, translation } from '../gfx/mat4.js';
import { blinkAt, idlePose } from './poses.js';
import { floorX0, floorX1, smoothstep, stageMood } from './staging.js';

/**
 * How each moving thing of the simulation is drawn: pickups, traps, enemies,
 * boss attacks. The static diorama and the hero are drawn by LevelView itself.
 *
 * @typedef {import('../gfx/renderer.js').DrawItem} DrawItem
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

// Scratch factors: callers build them with the mat4 helpers' `out` parameter.
const T = new Float32Array(16);
const E1 = new Float32Array(16);
const E2 = new Float32Array(16);
const E3 = new Float32Array(16);

// Fixed tints and poses, shared by every frame (never mutated).
const TICKET_GLOW = [1.6, 1.3, 0.5];
const KEY_SPARK = [1.5, 1.45, 1.1];
const STREAK_TINT = [0.9, 0.95, 1.1];
const STUN_GLOW = [1.6, 1.4, 0.35];
const RING_GLOW = [0.75, 1.5, 0.4];
const VALVE_SPARK = [0.6, 0.9, 1.6];
const SPRAY_TINT = [0.75, 0.9, 1.25];
const DRIP_GLOW = [0.5, 0.8, 1];
const GLINT = [1.3, 1.45, 1.6];
const SECRET_GLOW = [1.4, 1.2, 0.5];
const RACK_GLOW = [1, 0.5, 0.15];
/** @type {Pose} */
const INTERN_STUNNED = {
  legL: 1.5,
  legR: 1.5,
  armL: 0.9,
  armR: 1.4,
  bob: -6,
  head: 0.2,
  mood: 'happy',
};
/** @type {Pose} */
const VISIO_MUTED = { legL: 0, legR: 0, armL: 0.1, armR: 0.1, head: 0.35, mood: 'ouch' };
/** @type {Pose} */
const VISIO_RING = {
  legL: 0,
  legR: 0,
  armL: 1.1,
  armR: 1.3,
  armSpread: -0.2,
  head: 0.15,
  mood: 'happy',
};
// Animated poses, rewritten in place every frame (no per-frame objects).
/** @type {Pose} */
const CHEER = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, mood: 'happy' };
/** @type {Pose} */
const MEETING = { legL: 1.4, legR: 1.4, armL: 0, armR: 0, bob: -5, head: 0.25, mood: 'focus' };
/** @type {Pose} */
const RUSH = { legL: 0, legR: 0, armL: 0, armR: 1.35, armSpread: -0.3, bob: 0, head: 0.2 };
/** @type {Pose} */
const INTERN_RUN = { legL: 0, legR: 0, armL: 1.5, armR: 1.5, lean: 0.25, bob: 0 };

/** The boss as his entrance is shown (reused, see onStage()). @type {Thing} */
const SHOWN = /** @type {Thing} */ ({});
/** Clock time his entrance started (-1: not in it). */
let introAt = -1;

/**
 * The boss as drawn. His welcome is spoken while the simulation waits on the
 * dialogue, so his entrance (gesture, curtain, racks lighting up) plays on the
 * clock, and stays ahead of the simulation's timer once the duel resumes.
 * @param {Thing} b @param {number} t Clock (s).
 */
function onStage(b, t) {
  if (b.state !== 'intro') {
    introAt = -1;
    return b;
  }
  if (introAt < 0 || t < introAt) introAt = t;
  Object.assign(SHOWN, b);
  SHOWN.t = Math.max(b.t ?? 0, t - introAt);
  return SHOWN;
}

/** Stands in for the list between frames (never pushed to: drawThing() sets the real one). */
const NO_ITEMS = /** @type {DrawItem[]} */ ([]);
/** Where at() puts items during drawThing(). */
let out = NO_ITEMS;
let pool = FRESH;

/**
 * Appends an item of `mesh` placed by T(x, y, z)·e1·e2·e3 (multiplied left to right, like chain()).
 * @param {import('../gfx/renderer.js').Mesh} mesh @param {number} x @param {number} y @param {number} z
 * @param {Float32Array} [e1] @param {Float32Array} [e2] @param {Float32Array} [e3]
 */
function at(mesh, x, y, z, e1, e2, e3) {
  const it = pool.take(mesh);
  if (!e1) translation(x, y, z, it.model);
  else {
    multiply(translation(x, y, z, T), e1, it.model);
    if (e2) multiply(it.model, e2, it.model);
    if (e3) multiply(it.model, e3, it.model);
  }
  out.push(it);
  return it;
}

/**
 * A four-pointed twinkle: two thin glowing bars crossed, `size` tiles across.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y @param {number} z
 * @param {number} size @param {number} spin @param {number[]} color
 * @param {number} [thick] Bar thickness relative to `size`.
 */
function sparkle(view, x, y, z, size, spin, color, thick = 0.16) {
  for (let k = 0; k < 2; k++) {
    const it = at(
      view.cube,
      x,
      y,
      z,
      rotationZ(spin + k * Math.PI * 0.5, E1),
      scaling(size, size * thick, size * thick, E2),
    );
    it.tint = color;
    it.noShadow = true;
  }
}

// ---- One warning language ---------------------------------------------------------------
// Every trap speaks the same way: amber while it arms (at least 0.6 s, the lights
// filling one by one), red while it can hurt, white while it recovers. With the
// « Repères renforcés » option on, live hazards also get a hatched outline, and
// the countdown lights change size with the state, so shape tells it without colour.

/** Amber (arming), red (live) and white (recovering). */
export const WARN_AMBER = [1.55, 0.62, 0.04];
export const WARN_RED = [1.45, 0.06, 0.04];
export const WARN_WHITE = [1.6, 1.6, 1.58];
const LED_OFF = [0.22, 0.15, 0.07];
const LED_PLATE = [0.03, 0.03, 0.045];

/**
 * When each periodic trap arms, strikes, recovers and settles, in seconds of its
 * cycle (counted past the end of the cycle when it wraps). Arming covers the sim's
 * own tell and starts earlier where that tell is short (the drawer rattles 0.4 s).
 * @type {Record<keyof typeof PERIOD, [number, number, number, number]>}
 */
export const SIGNALS = {
  drawer: [1.2, 1.9, 2.78, 3.2],
  sprinkler: [1.6, 2.2, 3.2, 3.6],
  printer: [1.9, 2.6, 2.95, 3.4],
  beamer: [2.6, 3.4, 3.75, 4.2],
};

/** What a trap is saying right now (one object, rewritten by signalAt()). */
export const SIGNAL = { state: /** @type {'idle'|'arm'|'live'|'recover'} */ ('idle'), k: 0 };

/**
 * The warning state of a periodic trap at phase `k` of its cycle, with the progress
 * through that state (0 to 1).
 * @param {keyof typeof PERIOD} kind @param {number} k
 */
export function signalAt(kind, k) {
  const sig = SIGNALS[kind];
  const arm = sig[0],
    live = sig[1],
    recover = sig[2],
    end = sig[3];
  // Late in the recovery, the phase has wrapped round to the start of the cycle.
  const u = k < end - PERIOD[kind] ? k + PERIOD[kind] : k;
  if (u >= arm && u < live) return setSignal('arm', (u - arm) / (live - arm));
  if (u >= live && u < recover) return setSignal('live', (u - live) / (recover - live));
  if (u >= recover && u < end) return setSignal('recover', (u - recover) / (end - recover));
  return setSignal('idle', 0);
}

/** @param {typeof SIGNAL.state} state @param {number} k */
function setSignal(state, k) {
  SIGNAL.state = state;
  SIGNAL.k = k;
  return SIGNAL;
}

/**
 * Display switches the options set (read defensively: absent means off). `cues` is
 * « Repères renforcés » (prefs.cues): main.js sets `view.cues` on the LevelView, or
 * this object; either one turns the hatched outlines on.
 */
export const drawPrefs = { cues: false };
/** Whether hatched outlines are drawn during the current drawThing() call. */
let cues = false;

/**
 * Countdown lights on a trap, on a dark plate so they read on any wall from across
 * the room: three LEDs fill up amber while it arms (the last one blinking), all
 * three swell red while it is live and shrink to white dots while it recovers.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} z @param {typeof SIGNAL} sig @param {number} t
 */
function countdown(view, x, y, z, sig, t) {
  lit(view.cube, x, y, z - 0.03, LED_PLATE, scaling(0.8, 0.3, 0.04, E1));
  for (let i = 0; i < 3; i++) {
    let tint = LED_OFF,
      size = 0.17;
    if (sig.state === 'arm') {
      const on = sig.k >= i / 3;
      const blink = sig.k > 2 / 3 && Math.sin(t * 50) < 0;
      if (on && !(i === 2 && blink)) tint = WARN_AMBER;
    } else if (sig.state === 'live') {
      tint = WARN_RED;
      size = 0.22;
    } else if (sig.state === 'recover') {
      const f = 1 - sig.k * 0.7;
      tint = pool.tint(WARN_WHITE[0] * f, WARN_WHITE[1] * f, WARN_WHITE[2] * f);
      size = 0.1;
    }
    lit(view.cube, x + (i - 1) * 0.24, y, z, tint, scaling(size, size, 0.05, E1));
  }
  if (sig.state === 'live') out.push(view.glow(x, y, z - 0.06, 0.2, WARN_RED));
}

/**
 * A hatched outline in the screen plane around a live hazard (« Repères renforcés »):
 * a red frame with white diagonal ticks along its edges.
 * @param {import('./scene.js').LevelView} view @param {number} x0 @param {number} y0
 * @param {number} x1 @param {number} y1 @param {number} z @param {number} t
 */
function hatchBox(view, x0, y0, x1, y1, z, t) {
  const w = x1 - x0,
    h = y1 - y0;
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  lit(view.cube, cx, y0, z, WARN_RED, scaling(w, 0.04, 0.02, E1));
  lit(view.cube, cx, y1, z, WARN_RED, scaling(w, 0.04, 0.02, E1));
  lit(view.cube, x0, cy, z, WARN_RED, scaling(0.04, h, 0.02, E1));
  lit(view.cube, x1, cy, z, WARN_RED, scaling(0.04, h, 0.02, E1));
  // The ticks crawl along the frame so a still screenshot and a moving one agree.
  const roll = (t * 0.6) % 0.25;
  for (let x = x0 + 0.1 + roll; x < x1 - 0.05; x += 0.25)
    for (let e = 0; e < 2; e++)
      lit(
        view.cube,
        x,
        e ? y1 - 0.07 : y0 + 0.07,
        z,
        WARN_WHITE,
        rotationZ(0.8, E1),
        scaling(0.14, 0.025, 0.02, E2),
      );
  for (let y = y0 + 0.1 + roll; y < y1 - 0.05; y += 0.25)
    for (let e = 0; e < 2; e++)
      lit(
        view.cube,
        e ? x1 - 0.07 : x0 + 0.07,
        y,
        z,
        WARN_WHITE,
        rotationZ(0.8, E1),
        scaling(0.14, 0.025, 0.02, E2),
      );
}

/**
 * The same hatched frame lying on the floor, from x0 to x1 and z0 to z1.
 * @param {import('./scene.js').LevelView} view @param {number} x0 @param {number} x1
 * @param {number} y @param {number} z0 @param {number} z1 @param {number} t
 */
function hatchFloor(view, x0, x1, y, z0, z1, t) {
  const w = x1 - x0;
  for (let e = 0; e < 2; e++)
    lit(view.cube, (x0 + x1) / 2, y, e ? z1 : z0, WARN_RED, scaling(w, 0.012, 0.05, E1));
  const roll = (t * 0.6) % 0.3;
  for (let x = x0 + 0.12 + roll; x < x1 - 0.1; x += 0.3)
    for (let e = 0; e < 2; e++)
      lit(
        view.cube,
        x,
        y + 0.004,
        e ? z1 - 0.1 : z0 + 0.1,
        WARN_WHITE,
        rotationY(0.8, E1),
        scaling(0.2, 0.01, 0.035, E2),
      );
}

// ---- Incoming projectiles -------------------------------------------------------------
// A projectile flying in from beyond the screen edge shows a red chevron on that edge
// for the last 0.6 s before it comes into view. The main loop tells where the camera
// is (watchCamera()); edgeCue hands the sound side to whoever plays it.

/** The part of the z = 0 plane in view (on: watchCamera() has been called). */
export const camView = { on: false, x: 0, y: 0, hw: 0, hh: 0 };

/** Half the camera's vertical field of view (camera.js uses 30°). */
const HALF_FOV = (15 * Math.PI) / 180;

/**
 * Where the camera looks this frame: its focus and distance, and the screen aspect.
 * @param {number} x @param {number} y @param {number} dist @param {number} aspect
 */
export function watchCamera(x, y, dist, aspect) {
  camView.on = true;
  camView.x = x;
  camView.y = y;
  camView.hh = dist * Math.tan(HALF_FOV);
  camView.hw = camView.hh * aspect;
}

/** How long before it comes into view an incoming projectile is announced (s). */
export const INCOMING = 0.6;

/** Projectiles that hurt the hero. */
const PROJECTILES = new Set(['paper', 'invite', 'kpi', 'wave']);

/**
 * Which screen edge a projectile is about to come in from: -1 left, +1 right, 0 when
 * it is in view, flying away, or more than {@link INCOMING} seconds out.
 * @param {Thing} th @param {typeof camView} [cam]
 */
export function incomingSide(th, cam = camView) {
  if (!cam.on || !PROJECTILES.has(th.kind) || !th.vx) return 0;
  const dx = th.x - cam.x;
  const gap = Math.abs(dx) - cam.hw;
  if (gap <= 0 || Math.sign(th.vx) !== -Math.sign(dx)) return 0;
  return gap < Math.abs(th.vx) * INCOMING ? Math.sign(dx) : 0;
}

/**
 * The latest projectile announced at a screen edge, for a panned sound: `fresh` turns
 * true once per projectile (the reader sets it back to false), `side` is -1 / +1,
 * `kind` the projectile and `y` its height.
 */
export const edgeCue = { fresh: false, side: 0, kind: '', y: 0 };
/** Projectiles already announced (each one plays its sound once). */
const announced = new WeakSet();

/**
 * The chevron on the screen edge for an incoming projectile, pointing the way it flies.
 * @param {import('./scene.js').LevelView} view @param {Thing} th @param {number} side
 * @param {number} t
 */
function edgeArrow(view, th, side, t) {
  const cam = camView;
  const gap = Math.abs(th.x - cam.x) - cam.hw;
  const near = 1 - Math.min(1, gap / (Math.abs(th.vx) * INCOMING));
  const x = cam.x + side * (cam.hw - 0.55);
  const y = Math.max(cam.y - cam.hh + 0.6, Math.min(cam.y + cam.hh - 0.9, th.y));
  const pulse = 0.75 + 0.25 * Math.sin(t * 24);
  const size = 0.32 + 0.14 * near;
  const tint = pool.tint(WARN_RED[0] * pulse, WARN_RED[1] * pulse, WARN_RED[2] * pulse);
  // '<' on the right edge, '>' on the left: it points where the projectile goes.
  for (let k = -1; k <= 1; k += 2)
    bar(view, x + side * size * 0.3, y + k * size * 0.32, 0.3, size, 0.07, k * side * 0.85, tint);
  out.push(view.glow(x, y, 0.25, 0.18 + 0.08 * near, tint));
  if (!announced.has(th)) {
    announced.add(th);
    edgeCue.fresh = true;
    edgeCue.side = side;
    edgeCue.kind = th.kind;
    edgeCue.y = th.y;
  }
}

/**
 * What a projectile adds to itself: the edge chevron while it is about to come into
 * view, and its hatched outline (« Repères renforcés »), `r` either side of it and
 * from `y0` to `y1` around its height.
 * @param {import('./scene.js').LevelView} view @param {Thing} th @param {number} r
 * @param {number} y0 @param {number} y1 @param {number} t
 */
function projectileCues(view, th, r, y0, y1, t) {
  const side = incomingSide(th);
  if (side) edgeArrow(view, th, side, t);
  else if (cues) hatchBox(view, th.x - r, th.y + y0, th.x + r, th.y + y1, 0.3, t);
}

/**
 * A sprinkler's puddle on the floor at `y`, `r` times the size of its wet stretch.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} r @param {number} t
 */
function wetFloor(view, x, y, r, t) {
  const it = at(view.props.puddle, x, y + 0.005, -0.3, scaling(r * WET.reach * 2, 1, r * 1.6, E1));
  it.noShadow = true;
  wetGlint(view, x - 0.3 * r, x + 0.3 * r, y, t);
}

/**
 * The light gliding across wet floor from x0 to x1: what says « it slips » at a glance.
 * @param {import('./scene.js').LevelView} view @param {number} x0 @param {number} x1
 * @param {number} y @param {number} t
 */
function wetGlint(view, x0, x1, y, t) {
  const k = 0.5 + 0.5 * Math.sin(t * 1.7 + x0);
  out.push(view.glow(x0 + (x1 - x0) * k, y + 0.03, 0.05, 0.05, GLINT));
}

/**
 * @param {import('./scene.js').LevelView} view
 * @param {DrawItem[]} items
 * @param {Sim} sim
 * @param {Thing} th
 * @param {number} t Seconds, for idle animation.
 */
export function drawThing(view, items, sim, th, t) {
  const things = view.things;
  const P = view.props;
  out = items;
  // Recycled items during a LevelView frame; new ones otherwise.
  pool = view.pool ?? FRESH;
  cues =
    drawPrefs.cues || Boolean(/** @type {{cues?: boolean}} */ (/** @type {unknown} */ (view)).cues);
  const partner = sim.heroId === 'kevin' ? 'charline' : 'kevin';
  switch (th.kind) {
    case 'concert':
      // Two golden concert tickets, spinning, glowing and twinkling.
      at(
        things.concert,
        th.x,
        th.y + Math.sin(t * 3) * 0.1,
        0.1,
        rotationY(t * 3, E1),
        scaling(1.4, 1.4, 1.4, E2),
      );
      items.push(view.glow(th.x, th.y + 0.55, 0.2, 0.06, TICKET_GLOW));
      sparkle(view, th.x + 0.32, th.y + 0.3, 0.35, 0.12 + Math.sin(t * 6) * 0.06, t, TICKET_GLOW);
      break;
    case 'ticket':
      at(
        things.ticket,
        th.x,
        th.y + Math.sin(t * 3 + th.x) * 0.08,
        0,
        rotationY(t * 2.5 + th.x, E1),
      );
      break;
    case 'ammo':
      if (th.state === 'gone') break;
      at(
        things.ammo,
        th.x,
        th.y + Math.sin(t * 2.6 + th.x) * 0.06,
        0,
        rotationY(Math.sin(t) * 0.5, E1),
      );
      break;
    case 'cr':
      at(things.cr, th.x, th.y, 0.1, rotationZ(t * 18, E1));
      break;
    case 'key': {
      const y = th.y + Math.sin(t * 2.5) * 0.1;
      at(view.keyMesh, th.x, y, 0, rotationY(Math.sin(t * 1.5) * 0.6, E1));
      // A twinkle circles the stage's key item so it stands out from the decor.
      const a = t * 2.2;
      sparkle(
        view,
        th.x + Math.cos(a) * 0.42,
        y + Math.sin(a) * 0.22,
        0.3,
        0.13 + Math.sin(t * 7) * 0.05,
        t * 3,
        KEY_SPARK,
      );
      break;
    }
    case 'loose': {
      // Hidden trapdoors look exactly like the floor until they shake; shaking
      // slabs also rock and sag a little so the warning reads at a glance.
      const shake = th.state === 'shaking';
      const rock = rotationZ(shake ? Math.sin(t * 45) * 0.035 : 0, E1);
      const sag = shake ? -0.03 : 0;
      if (th.hidden && th.state !== 'gone' && th.state !== 'falling')
        at(
          view.theme === 'datacenter'
            ? view.hiddenFloor.dc
            : view.theme === 'rooftop'
              ? view.hiddenFloor.roof
              : view.theme === 'parking'
                ? view.hiddenFloor.parking
                : view.hiddenFloor.office,
          th.x + 0.5 + (shake ? Math.sin(t * 90) * 0.04 : 0),
          th.y + 1 + sag,
          0,
          rock,
        );
      else if (th.state !== 'gone')
        at(
          things.loose,
          th.x + 0.5 + (shake ? Math.sin(t * 90) * 0.04 : 0),
          th.y + 1 + sag,
          -0.53,
          rock,
        );
      break;
    }
    case 'panel':
      if (th.variant === 'binders') {
        // Shaking binders lean out over the edge before they drop.
        if (th.state !== 'broken' || th.t < 0.6)
          at(
            P.binders,
            th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 70) * 0.04 : 0),
            th.y,
            -0.2,
            rotationZ(th.state === 'shaking' ? 0.08 + Math.sin(t * 35) * 0.06 : 0, E1),
          );
        break;
      }
      // A cracking ceiling tile swings down on one side.
      if (th.state !== 'broken')
        at(
          things.panel,
          th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 80) * 0.03 : 0),
          th.y + 0.9,
          -0.6,
          rotationZ(th.state === 'shaking' ? -0.1 + Math.sin(t * 50) * 0.04 : 0, E1),
        );
      break;
    case 'bottle':
      if (th.state !== 'burst')
        at(things.bottle, th.x, th.y + 0.31, 0, rotationZ(-th.x / 0.31, E1));
      break;
    case 'checkpoint':
      at(th.state === 'on' ? things.checkpointOn : things.checkpoint, th.x, th.y, -0.9);
      break;
    case 'reader':
      at(th.state === 'on' ? things.readerOn : things.reader, th.x, th.y + 0.9, -0.8);
      break;
    case 'exit':
      // The lift stays shut until the stage's key item is in hand.
      at(sim.hasKey || sim.won ? things.exit : things.exitLocked, th.x, th.y, -0.9);
      // During a boss duel the partner waits safely inside the lift, out of the line
      // of fire, and steps back out once the director is convinced.
      if (!sim.bossActive || sim.bossDone) {
        // The partner waits at the exit, and cheers when you make it.
        const k = t * 7;
        /** @type {Pose} */
        let pose = CHEER;
        if (sim.won) {
          CHEER.armL = CHEER.armR = 2.65 + Math.abs(Math.sin(k)) * 0.2;
          CHEER.armSpread = -0.4;
          CHEER.bob = Math.abs(Math.sin(k)) * 1.8;
        } else pose = idlePose(t + 1);
        if (!sim.won && sim.hasKey) {
          pose.bob = Math.abs(Math.sin(t * 4)) * 1.2;
          pose.head = -0.12;
          pose.mood = 'happy';
        }
        const o = poseOptions(CAST[partner].scale, sim.won ? 0.4 : 1, 0.4);
        poseCharacter(view.cast[partner], th.x + 0.35, th.y, -0.4, -1, pose, o, items, pool);
      }
      break;
    case 'colleague': {
      const meeting = th.state === 'meeting';
      const ph = t * 6;
      const pose = meeting ? MEETING : RUSH;
      if (meeting) {
        MEETING.armL = 1.2 + Math.sin(t * 14) * 0.08;
        MEETING.armR = 1.2 - Math.sin(t * 14) * 0.08;
        MEETING.blink = blinkAt(t + th.x);
      } else {
        RUSH.legL = Math.sin(ph) * 0.6;
        RUSH.legR = -Math.sin(ph) * 0.6;
        RUSH.armL = -Math.sin(ph) * 0.4;
        RUSH.bob = Math.abs(Math.cos(ph));
      }
      const facing = meeting ? 1 : Math.sign(th.vx) || 1;
      const o = poseOptions(CAST.mathis.scale, meeting ? 0.4 : 1, 0.3);
      poseCharacter(view.cast.mathis, th.x, th.y, -0.2, facing, pose, o, items, pool);
      break;
    }
    case 'lift':
      if (th.variant === 'riser') {
        drawRiser(view, th);
        break;
      }
      at(view.props.lift, th.x + (th.w ?? 2) / 2, th.y - 0.25, -0.2, scaling(th.w ?? 2, 1, 1, E1));
      break;
    case 'kpi':
      at(view.props.kpi, th.x, th.y, 0.1, rotationZ(th.t * 9, E1));
      projectileCues(view, th, 0.36, -0.36, 0.36, t);
      break;
    case 'wave':
      at(
        view.props.wave,
        th.x,
        th.y,
        0,
        scaling(Math.sign(th.vx) || 1, 1 + Math.sin(th.t * 30) * 0.15, 1, E1),
      );
      projectileCues(view, th, 0.45, 0, 0.5, t);
      break;
    case 'boss':
      drawBossShow(view, sim, th, t);
      view.drawBoss(items, sim, onStage(th, t), t);
      break;
    case 'chair': {
      // Wobbling: the chair swivels nervously and rears back before it charges.
      const wob = th.state === 'wobble';
      at(
        P.chair,
        th.x + (wob ? Math.sin(t * 60) * 0.04 : 0),
        th.y,
        -0.15,
        rotationY(
          th.state === 'rolling' ? th.x * 2.2 : wob ? 0.5 + Math.sin(t * 30) * 0.35 : 0.5,
          E1,
        ),
        rotationX(wob ? -0.12 + Math.sin(t * 60) * 0.04 : 0, E2),
      );
      if (wob) items.push(view.glow(th.x, th.y + 1.15, 0, 0.1, WARN_AMBER));
      if (cues && th.state === 'rolling')
        hatchBox(view, th.x - 0.36, th.y, th.x + 0.36, th.y + 0.75, 0.4, t);
      break;
    }
    case 'drawer': {
      const dir = th.dir ?? 1;
      const base = dir > 0 ? th.x - 0.5 : th.x + 0.5;
      // Rattling, the drawer peeks out of the wall and an amber light blinks.
      const rattle = th.state === 'rattle';
      const shake = rattle ? 0.045 + Math.sin(t * 70) * 0.04 : 0;
      at(
        P.drawer,
        base + dir * ((th.w ?? 0) - 0.92 + shake),
        th.y + 0.75,
        -0.2,
        scaling(dir, 1, 1, E1),
      );
      // Countdown lights on the wall above the slot, readable from across the room.
      const sig = signalAt('drawer', phaseOf(sim, th, PERIOD.drawer));
      countdown(view, base + dir * 0.36, th.y + 1.3, -0.05, sig, t);
      if (cues && sig.state === 'live') {
        const tip = base + dir * (th.w ?? 0);
        hatchBox(view, Math.min(base, tip), th.y + 0.5, Math.max(base, tip), th.y + 1.0, 0.35, t);
      }
      break;
    }
    case 'sprinkler': {
      const top = th.y1 ?? th.y + 1;
      at(P.sprinkler, th.x, top, -0.3);
      if (th.state === 'on') {
        const h = top - 0.15 - (th.y0 ?? 0);
        const it = at(
          P.spray,
          th.x,
          top - 0.15,
          -0.3,
          scaling(0.8 + Math.sin(t * 40) * 0.05, h, 0.8, E1),
        );
        it.tint = SPRAY_TINT;
        it.noShadow = true;
      }
      if (th.state === 'drip') {
        const k = ((t * 1.6) % 1) * (top - (th.y0 ?? 0));
        items.push(view.glow(th.x, top - 0.25 - k, -0.3, 0.07, DRIP_GLOW));
      }
      if (th.state !== 'dry') {
        // Countdown lights beside the head, under the ceiling.
        const sig = signalAt('sprinkler', phaseOf(sim, th, PERIOD.sprinkler));
        countdown(view, th.x + 0.62, top - 0.28, -0.3, sig, t);
        if (cues && sig.state === 'live')
          hatchBox(view, th.x - 0.32, th.y0 ?? 0, th.x + 0.32, top - 0.1, 0.3, t);
      }
      // IN1: the spray spreads a puddle on the floor, which stays (slippery) for
      // WET.after seconds and shrinks as it dries; over a gap or cables it drains away.
      if (th.state === 'on') wetFloor(view, th.x, th.y0 ?? 0, 0.95 + Math.sin(t * 30) * 0.04, t);
      else if (wetSpan(sim, th))
        wetFloor(view, th.x, th.y0 ?? 0, 0.95 - 0.25 * (sinceSpray(sim, th) / WET.after), t);
      break;
    }
    case 'puddle': {
      // IN1: standing water under a drip from the ceiling, and the yellow
      // « Attention sol glissant » sign before it, behind the hero's path.
      const w = th.w ?? 1;
      const cx = th.x + w / 2;
      let it = at(P.puddle, cx, th.y + 0.004, -0.15, scaling(w + 0.3, 1, 1.9, E1));
      it.noShadow = true;
      it = at(P.puddle, cx - w * 0.2, th.y + 0.007, 0.2, scaling(w * 0.55, 1, 1.3, E1));
      it.noShadow = true;
      wetGlint(view, th.x + 0.3, th.x + w - 0.3, th.y, t);
      let top = th.y + 1;
      while (top < th.y + 8 && tileAt(sim, Math.floor(cx), top) === TILE.EMPTY) top++;
      const k = (t / 1.3 + th.x * 0.17) % 1;
      if (k < 0.75) {
        const f = k / 0.75;
        items.push(view.glow(cx + 0.35, top - (top - th.y) * f * f, -0.15, 0.06, DRIP_GLOW));
      } else
        items.push(view.glow(cx + 0.35, th.y + 0.02, -0.15, 0.08 + (k - 0.75) * 1.2, DRIP_GLOW));
      at(things.wetSign, (th.dir ?? -1) < 0 ? th.x - 0.5 : th.x + w + 0.5, th.y, -0.75);
      break;
    }
    case 'printer':
      at(P.printer, th.x, th.y, -0.4, scaling(th.dir ?? 1, 1, 1, E1));
      if (th.state === 'blink') {
        // The next sheet pokes out of the side it fires from while the panel blinks red.
        const dir = th.dir ?? 1;
        const k = Math.min(1, Math.max(0, (phaseOf(sim, th, PERIOD.printer) - 2) / 0.6));
        at(
          P.paper,
          th.x + dir * (0.45 + k * 0.22),
          th.y + 0.36,
          -0.2,
          scaling(dir, 1, 1, E1),
          rotationX(0.6, E2),
        );
      }
      countdown(
        view,
        th.x,
        th.y + 1.22,
        -0.2,
        signalAt('printer', phaseOf(sim, th, PERIOD.printer)),
        t,
      );
      break;
    case 'beamer':
      at(P.monitor, th.x, th.y, -0.3, scaling(1.3, 1.3, 1.3, E1));
      if (th.state === 'flicker') {
        // The KPI slide swells out of the screen before it is thrown.
        const k = Math.min(1, Math.max(0, (phaseOf(sim, th, PERIOD.beamer) - 2.6) / 0.8));
        const sc = 0.35 + k * 0.6;
        at(P.kpi, th.x, th.y + 0.42, -0.24 + k * 0.1, scaling(sc, sc, sc, E1));
        if (Math.floor(t * 16) % 2 === 0)
          items.push(view.glow(th.x, th.y + 0.45, 0, 0.16, WARN_AMBER));
      }
      countdown(
        view,
        th.x,
        th.y + 1.55,
        -0.2,
        signalAt('beamer', phaseOf(sim, th, PERIOD.beamer)),
        t,
      );
      break;
    case 'paper': {
      // Tilted towards the camera so the sheet reads, with two speed streaks behind.
      const dir = Math.sign(th.vx) || 1;
      at(
        P.paper,
        th.x,
        th.y,
        0,
        scaling(dir, 1, 1, E1),
        rotationZ(Math.sin(th.t * 20) * 0.25, E2),
        rotationX(0.6, E3),
      );
      for (let k = 0; k < 2; k++) {
        const it = at(
          view.cube,
          th.x - dir * (0.42 + k * 0.08),
          th.y + (k ? -0.07 : 0.05),
          0,
          scaling(0.28 - k * 0.08, 0.014, 0.014, E1),
        );
        it.tint = STREAK_TINT;
        it.noShadow = true;
      }
      projectileCues(view, th, 0.24, -0.12, 0.12, t);
      break;
    }
    case 'crate':
      at(P.archive, th.x + 0.5, th.y, -0.5, scaling(1, 1, 1.9, E1));
      break;
    case 'cup':
      if (th.state !== 'gone')
        at(
          P.cup,
          th.x,
          th.y + Math.sin(t * 2.4 + th.x) * 0.06,
          0,
          rotationY(Math.sin(t) * 0.6, E1),
        );
      break;
    case 'intern': {
      const stunned = th.state === 'stunned';
      const ph = t * 9;
      const pose = stunned ? INTERN_STUNNED : INTERN_RUN;
      if (!stunned) {
        INTERN_RUN.legL = Math.sin(ph) * 0.9;
        INTERN_RUN.legR = -Math.sin(ph) * 0.9;
        INTERN_RUN.bob = Math.abs(Math.cos(ph));
      }
      const facing = stunned ? 1 : Math.sign(th.vx) || 1;
      const o = poseOptions(CAST.intern.scale, stunned ? 0.4 : 1, 0.3);
      poseCharacter(view.cast.intern, th.x, th.y, -0.1, facing, pose, o, items, pool);
      if (!stunned)
        at(
          P.binders,
          th.x + (Math.sign(th.vx) || 1) * 0.28,
          th.y + 0.95,
          0.25,
          scaling(0.6, 0.6, 0.6, E1),
        );
      else {
        // The pile of files lies on its tile, solid as any floor; near the end of the
        // break it trembles and blinks white: they are about to pick it up.
        const c = pileColumn(th);
        if (c >= 0) {
          const ending = th.t > 3.2;
          const jitter = ending ? Math.sin(t * 60) * 0.015 : 0;
          at(things.pile, c + 0.5 + jitter, th.y, -0.5);
          if (ending && Math.sin(t * 18) > 0)
            items.push(view.glow(c + 0.5, th.y + 1.05, 0.3, 0.09, WARN_WHITE));
        }
        at(P.cup, th.x - Math.sign(c >= 0 ? c + 0.5 - th.x : -1) * 0.35, th.y, 0.2);
        // Dizzy stars circle the stunned intern's head.
        for (let k = 0; k < 3; k++) {
          const a = t * 5 + (k * Math.PI * 2) / 3;
          items.push(
            view.glow(
              th.x + Math.cos(a) * 0.3,
              th.y + 1.15,
              -0.1 + Math.sin(a) * 0.22,
              0.07,
              STUN_GLOW,
            ),
          );
        }
      }
      break;
    }
    case 'vacuum':
      at(P.vacuum, th.x, th.y, 0, rotationY(th.t * 3, E1));
      break;
    case 'visio': {
      const dir = th.dir ?? -1;
      const muted = th.state === 'muted';
      let pose = muted ? VISIO_MUTED : th.state === 'ring' ? VISIO_RING : null;
      if (!pose) {
        pose = idlePose(t);
        pose.armR = 1.15 + Math.sin(t * 5) * 0.3;
      }
      const o = poseOptions(CAST.visio.scale, 0.7, 0.3);
      poseCharacter(view.cast.visio, th.x - dir * 0.15, th.y, -0.5, dir, pose, o, items, pool);
      at(P.laptopStand, th.x + dir * 0.35, th.y, -0.3);
      // Incoming call: the laptop pulses lime.
      if (th.state === 'ring' && Math.floor(t * 8) % 2 === 0)
        items.push(view.glow(th.x + dir * 0.35, th.y + 1.42, -0.15, 0.1, RING_GLOW));
      break;
    }
    case 'switch':
      // The water shut-off valve: red wheel while open, green once turned.
      at(th.state === 'on' ? things.valveOn : things.valve, th.x, th.y + 0.9, -0.8);
      if (th.state !== 'on' && Math.sin(t * 2.6 + th.x) > 0.55)
        sparkle(view, th.x + 0.15, th.y + 1.3, -0.55, 0.2, t * 2, VALVE_SPARK);
      break;
    case 'secret':
      // A faint twinkle gives the hiding place away to curious eyes.
      if (th.state === 'idle') {
        const k = Math.sin(t * 2.3 + th.x);
        if (k > 0.55)
          sparkle(
            view,
            th.x,
            th.y + 0.6 + Math.sin(t * 3) * 0.1,
            0.3,
            ((k - 0.55) / 0.45) * 0.26,
            t * 1.5,
            SECRET_GLOW,
          );
      }
      break;
    case 'invite':
      at(P.invite, th.x, th.y, 0, rotationZ(Math.sin(th.t * 12) * 0.2, E1));
      projectileCues(view, th, 0.3, -0.2, 0.2, t);
      break;
    case 'rack':
      drawRack(view, th, t);
      break;
    case 'zone':
      drawZone(view, sim, th, t);
      break;
    default:
      break;
  }
  // Don't keep the last level's lists alive between frames.
  out = NO_ITEMS;
  pool = FRESH;
}

// ---- Boss duels ------------------------------------------------------------------------
// Everything a duel adds around the directors: the arena's show, a tell on every
// attack, the consult window on the director himself, phase changes and the signing.
// Procedural sprinkles are pure functions of the clock: no state, no allocation.

const SHOW_GOLD = [1.9, 1.35, 0.4];
const SHOW_CYAN = [0.4, 1.45, 1.9];
const SHOW_ORANGE = [1.95, 0.62, 0.1];
const SHOW_PINK = [1.95, 0.45, 1.05];
const SHOW_LIME = [0.85, 1.95, 0.3];
const SHOW_WHITE = [1.8, 1.8, 1.75];
const SHOW_RED = [1.95, 0.25, 0.15];
const SHOW_GREEN = [0.35, 1.9, 0.55];
const SHOW_SLAM = [1.9, 1.6, 1.2];
const LIME_OFF = [0.1, 0.22, 0.06];
const CABLE_PLATE = [0.012, 0.025, 0.06];
const CONFETTI = [SHOW_PINK, SHOW_LIME, [0.35, 0.85, 1.95], SHOW_GOLD, SHOW_WHITE];
/** Pseudo-random in [0, 1) for procedural sprinkles. @param {number} i */
function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Neon ignition: flickers for half a second, then stays lit (0 before `k` = 0).
 * @param {number} k Seconds since the switch was thrown.
 */
function ignite(k) {
  if (k <= 0) return 0;
  if (k >= 0.5) return 1;
  return hash(Math.floor(k * 30)) > 0.45 ? 1 : 0.12;
}

/**
 * An emissive overlay item: tinted, no shadow.
 * @param {import('../gfx/renderer.js').Mesh} mesh @param {number} x @param {number} y
 * @param {number} z @param {number[]} tint @param {Float32Array} [e1] @param {Float32Array} [e2]
 * @param {Float32Array} [e3]
 */
function lit(mesh, x, y, z, tint, e1, e2, e3) {
  const it = at(mesh, x, y, z, e1, e2, e3);
  it.tint = tint;
  it.noShadow = true;
  return it;
}

/**
 * A thin glowing bar of length `len` centred on (x, y, z), turned by `angle` in the
 * screen plane: rays, streaks, drop lines.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} z @param {number} len @param {number} thick @param {number} angle
 * @param {number[]} tint
 */
function bar(view, x, y, z, len, thick, angle, tint) {
  return lit(view.cube, x, y, z, tint, rotationZ(angle, E1), scaling(len, thick, thick, E2));
}

/**
 * A ring on the floor, `d` tiles across.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} z @param {number} d @param {number[]} tint
 */
function ring(view, x, y, z, d, tint) {
  return lit(view.things.boss.halo, x, y, z, tint, scaling(d, 1, d, E1));
}

/**
 * A shock ring sweeping the floor, `d` tiles across: thin while small, wider and
 * fainter as it spreads (`k` from 0 to 1 over its life).
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} z @param {number} d @param {number} k @param {number[]} c
 */
function shock(view, x, y, z, d, k, c) {
  const f = (1 - k) * (1 - k);
  return lit(
    view.things.boss.shock,
    x,
    y,
    z,
    pool.tint(c[0] * f, c[1] * f, c[2] * f),
    scaling(d, 1, d, E1),
  );
}

/**
 * Sparks of a stage fountain (pyro gerb) at (x, y), `k` from 0 (off) to 1.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} y
 * @param {number} z @param {number} k @param {number} t
 */
function fountain(view, x, y, z, k, t) {
  if (k <= 0) return;
  for (let i = 0; i < 14; i++) {
    const p = (t * 1.5 + i / 14) % 1;
    const life = p * 0.9;
    const vx = (hash(i) - 0.5) * 1.6;
    const vy = 5.2 + hash(i + 20) * 1.6;
    const py = y + 0.2 + vy * life - 9 * life * life;
    if (py < y) continue;
    const size = (0.075 - p * 0.05) * k;
    out.push(
      view.glow(
        x + vx * life,
        py,
        z + (hash(i + 40) - 0.5) * 0.4,
        size,
        i % 3 ? SHOW_GOLD : SHOW_WHITE,
      ),
    );
  }
}

/**
 * The boss's surroundings and his tells, drawn before the director himself.
 * @param {import('./scene.js').LevelView} view
 * @param {Sim} sim
 * @param {Thing} b
 * @param {number} t
 */
function drawBossShow(view, sim, b, t) {
  const id = sim.boss?.id ?? 'techServicesDirector';
  const julien = id === 'techServicesDirector';
  const hx = sim.hero.x + HERO.w / 2;
  const x0 = floorX0(sim, b),
    x1 = floorX1(sim, b);
  const mid = (x0 + x1) / 2;
  const floor = b.y0 ?? b.y;
  const bt = b.t ?? 0;
  const state = b.state;
  if (sim.bossActive) {
    if (julien) drawServerRoom(view, sim, b, t, mid, floor);
    else drawStage(view, sim, b, t, x0, x1, floor);
  }
  switch (state) {
    case 'intro': {
      // The name-card moment: a ring sweeps the arena as the duel opens.
      if (bt > 1.2 && bt < 1.8) {
        const k = (bt - 1.2) / 0.6;
        const c = julien ? SHOW_CYAN : SHOW_GOLD;
        shock(view, b.x, floor + 0.02, -0.1, 1 + k * 18, k, c);
      }
      break;
    }
    case 'consult':
      drawConsult(view, sim, b, t, floor);
      break;
    case 'teleport': {
      // Failover: a column of data rises where he stands, and the spot he will
      // reappear on lights up before he gets there.
      const to = teleportTarget(sim, b);
      if (bt < 0.55) {
        const k = bt / 0.55;
        dataColumn(view, b.x, floor, t, k);
        if (Math.abs(hx - to) > 2) {
          dataColumn(view, to, floor, t, k * 0.8);
          ring(
            view,
            to,
            floor + 0.02,
            -0.1,
            1.6 - k * 0.4,
            pool.tint(0.4 * k * 2, 1.45 * k, 1.9 * k),
          );
        }
      } else if (bt < 0.85) {
        const k = (bt - 0.55) / 0.3;
        shock(view, b.x, floor + 0.02, -0.1, 1 + k * 4, k, SHOW_CYAN);
      }
      break;
    }
    case 'leap': {
      if (bt < 0.5) {
        // Crouch: an orange ring tightens around his feet.
        const k = bt / 0.5;
        ring(view, b.x, floor + 0.02, -0.1, 2.6 - k * 1.3, pool.tint(1.95 * k, 0.62 * k, 0.1 * k));
      } else if (bt < 1.1) {
        // In the air: his shadow shrinks, the landing spot blinks.
        const k = (bt - 0.5) / 0.6;
        const s = 1 - Math.sin(Math.PI * k) * 0.45;
        at(view.props.shadow, b.x, floor + 0.015, -0.1, scaling(1.1 * s, 1, 0.9 * s, E1));
        const blink = Math.sin(t * 30) > 0 ? 1 : 0.4;
        ring(
          view,
          b.x,
          floor + 0.02,
          -0.1,
          1.4,
          pool.tint(1.95 * blink, 0.62 * blink, 0.1 * blink),
        );
      } else if (bt < 1.5) {
        // The slam: a shock ring keeps up with the waves running out.
        const k = (bt - 1.1) / 0.4;
        const d = 1.2 + (bt - 1.1) * 12;
        shock(view, b.x, floor + 0.02, -0.1, d, k, SHOW_SLAM);
      }
      break;
    }
    case 'dash':
      if (bt > 0.85 && bt < 2.4 && Math.abs(b.vx ?? 0) > 0) {
        // Speed streaks behind him.
        const dir = b.dir ?? 1;
        for (let i = 0; i < 4; i++) {
          const len = 0.7 + hash(i + Math.floor(t * 20)) * 0.6;
          bar(
            view,
            b.x - dir * (0.6 + len / 2),
            b.y + 0.35 + i * 0.42,
            0.2,
            len,
            0.025,
            0,
            SHOW_WHITE,
          );
        }
      }
      break;
    case 'hit':
      if (bt < 0.3) {
        const k = bt / 0.3;
        shock(view, b.x, floor + 0.02, -0.1, 1.2 + k * 2.5, k, SHOW_WHITE);
      }
      break;
    case 'phase':
      drawPhase(view, sim, b, t, floor, julien);
      break;
    case 'convinced':
    case 'sign':
      drawSigning(view, b, t, x0, x1, floor, hx);
      break;
    default:
      break;
  }
}

/**
 * A boss riser: `th.y` is its top, the 2×1 block below it is solid once
 * `th.state` is 'set'. Julien's (dir +1) is a server rack lying on its side,
 * rising out of the raised floor; Rodolphe's (dir -1) a box truss lowered from
 * the rig on two cables.
 * @param {import('./scene.js').LevelView} view @param {Thing} th
 */
function drawRiser(view, th) {
  const w = th.w ?? 2;
  const cx = th.x + w / 2;
  if ((th.dir ?? 1) > 0) {
    at(
      view.props.rack,
      th.x + w,
      th.y - 0.5,
      -0.1,
      rotationZ(Math.PI / 2, E1),
      scaling(1, w / 2, 1, E2),
    );
    return;
  }
  at(view.props.truss, cx, th.y + 0.05, -0.1, scaling(w / 2, 3.7, 3, E1));
  const cable = pool.tint(0.12, 0.12, 0.14);
  for (let side = -1; side <= 1; side += 2)
    bar(view, cx + side * 0.8, th.y + 6, -0.1, 12, 0.02, Math.PI / 2, cable);
}

/**
 * Data rising in a column: a handful of cyan bits climbing, `k` from 0 to 1.
 * @param {import('./scene.js').LevelView} view @param {number} x @param {number} floor
 * @param {number} t @param {number} k
 */
function dataColumn(view, x, floor, t, k) {
  for (let i = 0; i < 8; i++) {
    const p = (t * 1.4 + i / 8) % 1;
    const a = i * 2.1;
    out.push(
      view.glow(
        x + Math.cos(a) * 0.35,
        floor + p * 2.6,
        -0.1 + Math.sin(a) * 0.25,
        (0.03 + (1 - p) * 0.05) * k,
        SHOW_CYAN,
      ),
    );
  }
}

/**
 * The consult window, unmistakable on the director himself: a lime ring at his
 * feet whose twelve segments go out with the time left, lime motes rising, and a
 * marker over his head.
 * @param {import('./scene.js').LevelView} view @param {Sim} sim @param {Thing} b @param {number} t
 * @param {number} floor
 */
function drawConsult(view, sim, b, t, floor) {
  const B = view.things.boss;
  const length = consultLength(sim, b);
  const left = Math.max(0, 1 - (b.t ?? 0) / length);
  const on = Math.ceil(left * 12);
  const pulse = 0.75 + 0.25 * Math.sin(t * 10);
  ring(
    view,
    b.x,
    floor + 0.02,
    -0.1,
    1.25,
    pool.tint(SHOW_LIME[0] * pulse, SHOW_LIME[1] * pulse, SHOW_LIME[2] * pulse),
  );
  for (let i = 0; i < 12; i++) {
    // Clockwise from the back, as seen by the camera; the last lit segment blinks.
    const blink = i === on - 1 && left < 0.35 && Math.sin(t * 26) < 0;
    lit(
      B.arc,
      b.x,
      floor + 0.025,
      -0.1,
      i < on && !blink ? SHOW_LIME : LIME_OFF,
      rotationY(-(Math.PI * 1.5 + (i * Math.PI) / 6), E1),
      scaling(2.4, 1, 2.4, E2),
    );
  }
  for (let i = 0; i < 8; i++) {
    const p = (t * 0.75 + i / 8) % 1;
    const a = i * 2.4 + t * 1.3;
    out.push(
      view.glow(
        b.x + Math.cos(a) * 0.62,
        floor + 0.15 + p * 2.3,
        -0.1 + Math.sin(a) * 0.38,
        0.025 + (1 - p) * 0.05,
        SHOW_LIME,
      ),
    );
  }
  // Target brackets around him, breathing; they blink as the window closes.
  const closing = left < 0.35 && Math.sin(t * 26) < 0;
  const s = 1 + Math.sin(t * 6) * 0.04;
  lit(B.brackets, b.x, b.y + 1.2, 0.4, closing ? LIME_OFF : SHOW_LIME, scaling(s, s, 1, E1));
  // A lime diamond bobbing over his head: the door is open.
  const y = b.y + 2.42 + Math.sin(t * 5) * 0.07;
  lit(
    view.cube,
    b.x,
    y,
    0.1,
    SHOW_LIME,
    rotationY(t * 2, E1),
    rotationZ(Math.PI / 4, E2),
    scaling(0.16, 0.16, 0.16, E3),
  );
}

/**
 * A new phase: light rays burst from the director and two shock rings sweep the
 * floor, in the colours of the phase to come.
 * @param {import('./scene.js').LevelView} view @param {Sim} sim @param {Thing} b
 * @param {number} t @param {number} floor @param {boolean} julien
 */
function drawPhase(view, sim, b, t, floor, julien) {
  const bt = b.t ?? 0;
  const next = b.phase ?? 2;
  const c = julien ? SHOW_RED : next >= 3 ? SHOW_GOLD : SHOW_PINK;
  const beat = stageMood(sim, b).beat;
  if (beat > 0.02) {
    const cy = b.y + 1.3;
    const tint = pool.tint(
      (c[0] * 0.6 + 0.8) * beat,
      (c[1] * 0.6 + 0.8) * beat,
      (c[2] * 0.6 + 0.8) * beat,
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12 + t * 0.5;
      const len = (1 + 2.2 * beat) * (0.6 + 0.4 * hash(i));
      const r = 0.55 + len / 2;
      bar(
        view,
        b.x + Math.cos(a) * r,
        cy + Math.sin(a) * r,
        -0.35,
        len,
        0.035 + 0.035 * beat,
        a,
        tint,
      );
    }
  }
  for (let j = 0; j < 2; j++) {
    const k = (bt - j * 0.22) / 0.7;
    if (k > 0 && k < 1) shock(view, b.x, floor + 0.02, -0.1, 1.2 + k * 16, k, c);
  }
  // Rodolphe's grand finale opens with fountains on both sides of the stage.
  if (!julien && next >= 3) {
    const x0 = floorX0(sim, b),
      x1 = floorX1(sim, b);
    const k = smoothstep(0, 0.2, bt) * (1 - smoothstep(1.4, 1.8, bt));
    fountain(view, x0 + 0.7, floor, -0.6, k, t);
    fountain(view, x1 - 0.7, floor, -0.6, k, t);
  }
}

/**
 * Convinced, then signing: warm sparkles around him, golden rings under him and the
 * hero (a shared victory), ink sparkling from the pen, confetti over the stage.
 * @param {import('./scene.js').LevelView} view @param {Thing} b @param {number} t
 * @param {number} x0 @param {number} x1 @param {number} floor @param {number} hx
 */
function drawSigning(view, b, t, x0, x1, floor, hx) {
  const bt = b.t ?? 0;
  const signing = b.state === 'sign';
  // The outro is spoken the moment he is convinced: the glow is there from the start.
  const fade = signing ? 1 - smoothstep(6, 8, bt) : 1;
  if (fade <= 0) return;
  const g = pool.tint(SHOW_GOLD[0] * fade, SHOW_GOLD[1] * fade, SHOW_GOLD[2] * fade);
  ring(view, b.x, floor + 0.02, -0.1, 1.4 + Math.sin(t * 3) * 0.08, g);
  if (signing && Math.abs(hx - b.x) < 8)
    ring(view, hx, floor + 0.02, 0, 1.2 + Math.sin(t * 3 + 1) * 0.08, g);
  // Sparkles circling him.
  for (let i = 0; i < 5; i++) {
    const a = t * 1.8 + (i * Math.PI * 2) / 5;
    const s = (0.1 + 0.08 * Math.sin(t * 6 + i)) * fade;
    sparkle(
      view,
      b.x + Math.cos(a) * 0.75,
      b.y + 1.2 + Math.sin(a * 2) * 0.35,
      -0.1 + Math.sin(a) * 0.45,
      s,
      t * 3 + i,
      SHOW_GOLD,
    );
  }
  if (!signing) return;
  if (bt < 1.2) {
    // The pen at work.
    const k = Math.abs(Math.sin(t * 16));
    sparkle(view, b.x + 0.32, b.y + 1.12 + k * 0.04, 0.35, 0.08 + k * 0.08, t * 8, SHOW_GOLD);
  } else if (bt < 1.7) {
    const k = (bt - 1.2) / 0.5;
    shock(view, b.x, floor + 0.02, -0.1, 1.4 + k * 10, k, SHOW_GOLD);
  }
  // Confetti over the whole arena, from just above what the camera frames.
  const top = floor + 5.6;
  const span = x1 - x0;
  for (let i = 0; i < 40; i++) {
    const v = 1.1 + hash(i + 50) * 0.9;
    const fall = (bt - hash(i + 100) * 1.2) * v;
    if (fall < 0) continue;
    const y = top - (fall % (top - floor));
    const c = CONFETTI[i % CONFETTI.length];
    const tint = fade < 1 ? pool.tint(c[0] * fade, c[1] * fade, c[2] * fade) : c;
    lit(
      view.cube,
      x0 + hash(i) * span + Math.sin(t * 2 + i) * 0.25,
      y,
      -1.4 + hash(i + 7) * 2.4,
      tint,
      rotationZ(t * (2 + hash(i + 3) * 3) + i, E1),
      rotationX(t * 3 + i, E2),
      scaling(0.13, 0.025, 0.09, E3),
    );
  }
}

/**
 * Julien's server room: his supervision display comes down from the ceiling and
 * lights up for the duel; its status LEDs and caption follow the fight, red on the
 * backup site, green once the file is validated.
 * @param {import('./scene.js').LevelView} view @param {Sim} sim @param {Thing} b
 * @param {number} t @param {number} mid @param {number} floor
 */
function drawServerRoom(view, sim, b, t, mid, floor) {
  const B = view.things.boss;
  const bt = b.t ?? 0;
  const intro = b.state === 'idle' || b.state === 'intro';
  const k = intro ? smoothstep(0.1, 0.9, bt) : 1;
  // A little overshoot as it locks in place.
  // Hung above the director's plaque, below the boss bar of the HUD.
  const y = floor + 4.17 + (1 - k) * 3.6 - Math.sin(k * Math.PI) * 0.12;
  const z = -2.25;
  const S = scaling(0.8, 0.8, 1, E3);
  at(B.nocSign, mid, y, z, S);
  const on = intro ? ignite(bt - 0.85) : 1;
  const mood = stageMood(sim, b);
  const done = mood.done;
  const backup = !done && mood.phase >= 2;
  const n = 0.6 + 0.4 * on;
  lit(
    B.nocName,
    mid,
    y,
    z,
    on ? pool.tint(0.75 * on * n, 1.55 * on * n, 1.9 * on * n) : LIME_OFF,
    S,
  );
  const caption = done
    ? b.state === 'sign'
      ? B.caption.signed
      : B.caption.valid
    : backup
      ? B.caption.backup
      : B.caption.ts;
  const blink = backup && Math.sin(t * 6) < -0.2 ? 0.45 : 1;
  const c = done ? SHOW_GREEN : backup ? SHOW_RED : SHOW_CYAN;
  const ck = (intro ? ignite(bt - 1.05) : 1) * blink;
  lit(caption, mid, y, z, pool.tint(c[0] * ck, c[1] * ck, c[2] * ck), S);
  // Status LEDs: a green shimmer, red and amber on the backup site, steady green once won.
  const s = 0.55 + 0.45 * Math.sin(t * (backup ? 9 : 3.5));
  const led = intro ? smoothstep(0.9, 1.4, bt) : 1;
  const lc = done
    ? SHOW_GREEN
    : backup
      ? Math.sin(t * 6) > 0
        ? SHOW_RED
        : SHOW_ORANGE
      : SHOW_GREEN;
  const lk = (done ? 1 : s) * led;
  lit(B.nocLeds, mid, y, z, pool.tint(lc[0] * lk, lc[1] * lk, lc[2] * lk), S);
  if (backup) {
    // Alarm beacons on the display's corners, turning in turn with the red lights.
    for (let i = 0; i < 2; i++) {
      const a = Math.max(0, Math.sin(t * 6 + i * Math.PI));
      const bx = mid + (i ? 2.85 : -2.85);
      lit(
        view.cube,
        bx,
        y + 1.55,
        z + 0.1,
        pool.tint(0.5 + 1.5 * a, 0.08 + 0.2 * a, 0.05),
        rotationY(t * 8, E1),
        scaling(0.16, 0.14, 0.16, E2),
      );
    }
  }
}

/**
 * Rodolphe's stage: an LED fascia along the front of the stage spells his name,
 * then announces each act; footlights chase along the edge, faster and golden in
 * the grand finale, and fountains go up for his entrance and the signing.
 * @param {import('./scene.js').LevelView} view @param {Sim} sim @param {Thing} b
 * @param {number} t @param {number} x0 @param {number} x1 @param {number} floor
 */
function drawStage(view, sim, b, t, x0, x1, floor) {
  const B = view.things.boss;
  const bt = b.t ?? 0;
  const intro = b.state === 'idle' || b.state === 'intro';
  const mood = stageMood(sim, b);
  const span = (x1 - x0) / 16;
  at(B.fascia, x0, floor, 1.39, scaling(span, 1, 1, E1));
  const caption = mood.done
    ? b.state === 'sign'
      ? B.caption.signedShow
      : B.caption.energy
    : intro
      ? B.caption.rodolphe
      : mood.phase >= 3
        ? B.caption.finale
        : mood.phase === 2
          ? B.caption.tour
          : B.caption.west;
  const on = intro ? 0.35 + 0.65 * ignite(bt - 0.3) : 1;
  const shimmer = 0.85 + 0.15 * Math.sin(t * 7);
  const finale = !mood.done && mood.phase >= 3;
  const c = finale ? SHOW_GOLD : mood.done ? SHOW_WHITE : SHOW_GOLD;
  const k = on * shimmer;
  // His name stands right under him for the entrance; the acts are centred.
  const cx = intro ? Math.max(x0 + 2.6, Math.min(x1 - 2.6, b.x)) : (x0 + x1) / 2;
  lit(caption, cx, floor, 1.39, pool.tint(c[0] * k, c[1] * k * (finale ? 1 : 0.95), c[2] * k));
  // Footlights: half the bulbs at a time, chasing to the beat.
  const beat = Math.floor(t * (finale ? 8 : mood.phase === 2 ? 5 : 3.5)) % 2;
  const fl = intro ? smoothstep(0.2, 0.9, bt) : 1;
  const warm = finale ? SHOW_GOLD : SHOW_WHITE;
  const hi = pool.tint(warm[0] * fl, warm[1] * fl * 0.92, warm[2] * fl * 0.7);
  const lo = mood.done ? hi : pool.tint(0.35 * fl, 0.28 * fl, 0.18 * fl);
  lit(B.footA, x0, floor, 1.18, beat ? hi : lo, scaling(span, 1, 1, E1));
  lit(B.footB, x0, floor, 1.18, beat ? lo : hi, scaling(span, 1, 1, E1));
  // Fountains: the entrance, and the signing.
  const show = intro
    ? smoothstep(0.95, 1.1, bt) * (1 - smoothstep(1.6, 1.8, bt))
    : b.state === 'sign'
      ? 1 - smoothstep(2.5, 3.2, bt)
      : 0;
  fountain(view, x0 + 0.7, floor, -0.6, show, t);
  fountain(view, x1 - 0.7, floor, -0.6, show, t);
  if (finale && b.state !== 'phase') {
    // The follow spot: a beam comes down from the rig and rings the hero in light.
    const hx = sim.hero.x + HERO.w / 2;
    const hy = Math.max(floor, sim.hero.y);
    const top = floor + 7.2;
    const tint = pool.tint(1.2, 1.05, 0.75);
    for (let side = -1; side <= 1; side += 2) {
      const dx = side * 0.75;
      const len = Math.hypot(dx, top - hy);
      const angle = Math.atan2(top - hy, -dx);
      bar(view, hx + dx / 2, (top + hy) / 2, 0.6, len, 0.022, angle, tint);
    }
    ring(view, hx, hy + 0.025, 0.1, 1.6, tint);
  }
}

/**
 * Server racks lowered from the ceiling: lock-on brackets close in on the spot and a
 * guide line drops from the ceiling while the shadow grows; speed lines as it falls.
 * @param {import('./scene.js').LevelView} view @param {Thing} th @param {number} t
 */
function drawRack(view, th, t) {
  const P = view.props;
  const floor = th.y0 ?? th.y;
  if (th.state === 'warn') {
    const k = Math.min(1, th.t / 0.9);
    at(P.shadow, th.x, floor + 0.02, 0, scaling(0.4 + k * 0.8, 1, 0.4 + k * 0.8, E1));
    out.push(view.glow(th.x, floor + 0.05, 0.6, 0.12, RACK_GLOW));
    const blink = Math.sin(t * (12 + k * 30)) > -0.4 ? 1 : 0.3;
    const s = 2.3 - k * 1.25;
    lit(
      view.things.boss.reticle,
      th.x,
      floor + 0.03,
      0,
      pool.tint(1.95 * blink, (0.75 - k * 0.5) * blink, 0.12 * blink),
      rotationY((1 - k) * 0.9, E1),
      scaling(s, 1, s, E2),
    );
    const g = 0.25 + 0.35 * k;
    lit(
      view.cube,
      th.x,
      floor + 4,
      -0.05,
      pool.tint(1.9 * g * blink, 0.5 * g * blink, 0.1 * g),
      scaling(0.035, 8, 0.035, E1),
    );
    return;
  }
  at(P.rackFall, th.x, th.y, -0.1);
  if (th.state === 'fall' && cues)
    hatchBox(view, th.x - 0.55, floor, th.x + 0.55, th.y + 2.1, 0.45, t);
  if (th.state === 'fall') {
    const len = Math.min(1.6, Math.abs(th.vy ?? 0) * 0.07);
    for (let i = -1; i <= 1; i += 2)
      bar(view, th.x + i * 0.32, th.y + 2.1 + len / 2, 0.25, len, 0.025, Math.PI / 2, SHOW_WHITE);
  } else if (th.state === 'landed' && th.t < 0.3) {
    const k = th.t / 0.3;
    shock(view, th.x, floor + 0.02, 0, 1.2 + k * 2.4, k, SHOW_WHITE);
  }
}

/** Half the depth of a spotlight pool: it stays behind the footlights at the stage front. */
export const POOL_HALF_DEPTH = 1;

/**
 * The stretch of floor a zone covers as drawn: the zone, kept on the arena floor
 * (from just past the gate to the far wall) and inset a hair so neighbouring pools
 * and the stage edge never overlap. Written into ZONE_SPAN.
 * @param {Sim} sim @param {Thing} th
 */
export function zoneSpan(sim, th) {
  const arena = sim.boss?.arena;
  const lo = arena ? arena[0] + 1 : -Infinity,
    hi = arena ? arena[1] + 1 : Infinity;
  ZONE_SPAN[0] = Math.max(lo, th.x) + 0.06;
  ZONE_SPAN[1] = Math.min(hi, th.x + (th.w ?? 1)) - 0.06;
  return ZONE_SPAN;
}
const ZONE_SPAN = [0, 0];

/**
 * Floor zones. Cable runs crackle blue as they charge, then arc white-hot; spotlight
 * zones are pools of stage light that swell amber, then blaze red; a dash lane is a
 * runway of arrows rolling the way he will run, with a stop line where he will stop.
 * Both kinds of strip speak the traps' language: amber while armed, red while live.
 * @param {import('./scene.js').LevelView} view @param {Sim} sim @param {Thing} th
 * @param {number} t
 */
function drawZone(view, sim, th, t) {
  const B = view.things.boss;
  const floor = th.y0 ?? th.y;
  const w = th.w ?? 1;
  if (th.variant === 'arrow') {
    const dir = th.dir ?? 1;
    // Every arrow of the zone blinks in step: one colour for all.
    const tint = pool.tint(1.9, 0.6 + Math.sin(t * 12) * 0.3, 0.2);
    const roll = (t * 2.5) % 2;
    for (let p = 0.7 + roll; p < w - 0.5; p += 2) {
      const x = dir > 0 ? th.x + p : th.x + w - p;
      lit(view.props.arrow, x, floor + 0.01, 0.2, tint, scaling(dir, 1, 1, E1));
    }
    // The stop line: past it, he can't reach you.
    const end = dir > 0 ? th.x + w - 0.1 : th.x + 0.1;
    lit(view.cube, end, floor + 0.02, 0.2, tint, scaling(0.06, 0.02, 1.1, E1));
    return;
  }
  const live = th.state === 'live';
  const k = live ? 1 : Math.min(1, (th.t ?? 0) / WARN);
  // The last quarter of the warning blinks fast: it is about to strike.
  const blink = !live && k > 0.75 && Math.sin(t * 40) < 0 ? 0.35 : 1;
  if (th.variant === 'cable') {
    // A dark strip framed by amber hazard lines, so the crackle reads on any floor.
    lit(
      view.cube,
      th.x + w / 2,
      floor + 0.006,
      0,
      live ? pool.tint(0.25, 0.55, 1.1) : CABLE_PLATE,
      scaling(w - 0.08, 0.012, 2.3, E1),
    );
    const f = live
      ? 0.8 + 0.2 * Math.sin(t * 60)
      : (0.45 + 0.55 * k) * (0.7 + 0.3 * Math.sin(t * 37 + th.x)) * blink;
    const jitter = live ? Math.sin(t * 90 + th.x) * 0.03 : 0;
    lit(
      B.bolts,
      th.x + w / 2 + jitter,
      floor + 0.014,
      0,
      live ? pool.tint(1.5 * f, 1.9 * f, 2.2 * f) : pool.tint(0.55 * f, 1.6 * f, 2.2 * f),
      scaling(w - 0.1, 1, 1, E1),
    );
    const edge = live
      ? WARN_RED
      : pool.tint(WARN_AMBER[0] * blink, WARN_AMBER[1] * blink, WARN_AMBER[2] * blink);
    for (let side = -1; side <= 1; side += 2)
      lit(
        view.cube,
        th.x + w / 2,
        floor + 0.016,
        side * 1.12,
        edge,
        scaling(w - 0.12, 0.01, 0.06, E1),
      );
    if (live && cues) hatchFloor(view, th.x, th.x + w, floor + 0.02, -1.25, 1.25, t);
    return;
  }
  // Spotlight: a pool on the stage floor, never past its ends or over the footlights.
  const span = zoneSpan(sim, th);
  const x0 = span[0],
    x1 = span[1];
  if (x1 <= x0) return;
  const p = live
    ? 0.9 + 0.1 * Math.sin(t * 40)
    : (0.3 + 0.55 * k) * (0.85 + 0.15 * Math.sin(t * 14)) * blink;
  const c = live ? WARN_RED : WARN_AMBER;
  lit(
    B.pool,
    (x0 + x1) / 2,
    floor + 0.012,
    0,
    pool.tint(c[0] * p, c[1] * p + (live ? 0.25 : 0), c[2] * p + (live ? 0.2 : 0)),
    scaling(x1 - x0, 1, POOL_HALF_DEPTH * 2, E1),
  );
  if (live && cues) hatchFloor(view, x0, x1, floor + 0.02, -POOL_HALF_DEPTH, POOL_HALF_DEPTH, t);
}
