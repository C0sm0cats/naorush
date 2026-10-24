import { CAST } from '../data/cast.js';
import { FRESH, poseCharacter, poseOptions } from '../gfx/characters.js';
import { PATTERNS, WARN } from '../game/boss.js';
import { HERO } from '../game/sim.js';
import { PERIOD, phaseOf } from '../game/traps.js';
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
const DRAWER_GLOW = [1.5, 0.75, 0.15];
const STUN_GLOW = [1.6, 1.4, 0.35];
const RING_GLOW = [0.75, 1.5, 0.4];
const VALVE_SPARK = [0.6, 0.9, 1.6];
const SPRAY_TINT = [0.75, 0.9, 1.25];
const DRIP_GLOW = [0.5, 0.8, 1];
const PRINTER_GLOW = [1, 0.25, 0.2];
const BEAMER_GLOW = [1.4, 1.4, 1.8];
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
const VISIO_RING = { legL: 0, legR: 0, armL: 0.4, armR: 2.6, head: -0.2 };
// Animated poses, rewritten in place every frame (no per-frame objects).
/** @type {Pose} */
const CHEER = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, mood: 'happy' };
/** @type {Pose} */
const MEETING = { legL: 1.4, legR: 1.4, armL: 0, armR: 0, bob: -5, head: 0.25, mood: 'focus' };
/** @type {Pose} */
const RUSH = { legL: 0, legR: 0, armL: 0, armR: 2.5, armSpread: -0.3, bob: 0, head: -0.1 };
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
          CHEER.armL = 2.8 + Math.sin(k) * 0.2;
          CHEER.armR = 2.8 - Math.sin(k) * 0.2;
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
      at(view.props.lift, th.x + (th.w ?? 2) / 2, th.y - 0.25, -0.2, scaling(th.w ?? 2, 1, 1, E1));
      break;
    case 'kpi':
      at(view.props.kpi, th.x, th.y, 0.1, rotationZ(th.t * 9, E1));
      break;
    case 'wave':
      at(
        view.props.wave,
        th.x,
        th.y,
        0,
        scaling(Math.sign(th.vx) || 1, 1 + Math.sin(th.t * 30) * 0.15, 1, E1),
      );
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
      if (rattle && Math.floor(t * 10) % 2 === 0)
        items.push(view.glow(base + dir * 0.06, th.y + 0.98, 0.22, 0.1, DRAWER_GLOW));
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
      // A puddle grows on the floor while it drips and dries up after the spray.
      if (th.state !== 'dry') {
        const k = phaseOf(sim, th, PERIOD.sprinkler);
        const r =
          th.state === 'on'
            ? 0.95 + Math.sin(t * 30) * 0.04
            : th.state === 'drip'
              ? 0.25 + ((k - 1.6) / 0.6) * 0.45
              : 0.95 * Math.max(0, 1 - k / 0.7);
        if (r > 0.05) {
          const it = at(P.puddle, th.x, (th.y0 ?? 0) + 0.005, -0.3, scaling(r, 1, r, E1));
          it.noShadow = true;
        }
      }
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
        if (Math.floor(t * 12) % 2 === 0)
          items.push(view.glow(th.x + dir * 0.35, th.y + 1.02, -0.1, 0.11, PRINTER_GLOW));
      }
      break;
    case 'beamer':
      at(P.monitor, th.x, th.y, -0.3, scaling(1.3, 1.3, 1.3, E1));
      if (th.state === 'flicker') {
        // The KPI slide swells out of the screen before it is thrown.
        const k = Math.min(1, Math.max(0, (phaseOf(sim, th, PERIOD.beamer) - 2.6) / 0.8));
        const sc = 0.35 + k * 0.6;
        at(P.kpi, th.x, th.y + 0.42, -0.24 + k * 0.1, scaling(sc, sc, sc, E1));
        if (Math.floor(t * 16) % 2 === 0)
          items.push(view.glow(th.x, th.y + 0.45, 0, 0.16, BEAMER_GLOW));
      }
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
        at(P.cup, th.x + 0.35, th.y, 0.2);
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
        pose.armR = 1.2 + Math.sin(t * 5) * 0.4;
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
      break;
    case 'rack':
      drawRack(view, th, t);
      break;
    case 'zone':
      drawZone(view, th, t);
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
      drawConsult(view, b, t, floor, id);
      break;
    case 'teleport': {
      // Failover: a column of data rises where he stands, and the spot he will
      // reappear on lights up before he gets there.
      const to = b.x > mid ? x0 + 4 : x1 - 4;
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
 * @param {import('./scene.js').LevelView} view @param {Thing} b @param {number} t
 * @param {number} floor @param {import('../game/world.js').BossId} id
 */
function drawConsult(view, b, t, floor, id) {
  const B = view.things.boss;
  const length = PATTERNS[id].consult[(b.phase ?? 1) - 1] ?? 1;
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
  if (th.state === 'fall') {
    const len = Math.min(1.6, Math.abs(th.vy ?? 0) * 0.07);
    for (let i = -1; i <= 1; i += 2)
      bar(view, th.x + i * 0.32, th.y + 2.1 + len / 2, 0.25, len, 0.025, Math.PI / 2, SHOW_WHITE);
  } else if (th.state === 'landed' && th.t < 0.3) {
    const k = th.t / 0.3;
    shock(view, th.x, floor + 0.02, 0, 1.2 + k * 2.4, k, SHOW_WHITE);
  }
}

/**
 * Floor zones. Cable runs crackle blue as they charge, then arc white-hot; spotlight
 * zones are pools of stage light that swell, then blaze; a dash lane is a runway of
 * arrows rolling the way he will run, with a stop line where he will stop.
 * @param {import('./scene.js').LevelView} view @param {Thing} th @param {number} t
 */
function drawZone(view, th, t) {
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
    const edge = live ? SHOW_WHITE : pool.tint(1.95 * blink, 0.62 * blink, 0.1 * blink);
    for (let side = -1; side <= 1; side += 2)
      lit(
        view.cube,
        th.x + w / 2,
        floor + 0.016,
        side * 1.12,
        edge,
        scaling(w - 0.12, 0.01, 0.06, E1),
      );
    return;
  }
  // Spotlight.
  const p = live
    ? 0.9 + 0.1 * Math.sin(t * 40)
    : (0.3 + 0.55 * k) * (0.85 + 0.15 * Math.sin(t * 14)) * blink;
  lit(
    B.pool,
    th.x + w / 2,
    floor + 0.012,
    0,
    live ? pool.tint(2.2 * p, 1.35 * p, 1.75 * p) : pool.tint(1.95 * p, 0.42 * p, 0.95 * p),
    scaling(w, 1, 2.4, E1),
  );
}
