import { CAST } from '../data/cast.js';
import { FRESH, poseCharacter, poseOptions } from '../gfx/characters.js';
import { PERIOD, phaseOf } from '../game/traps.js';
import { multiply, rotationX, rotationY, rotationZ, scaling, translation } from '../gfx/mat4.js';
import { blinkAt, idlePose } from './poses.js';

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

/** Where at() puts items during drawThing(). */
let out = /** @type {DrawItem[]} */ ([]);
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
 */
function sparkle(view, x, y, z, size, spin, color) {
  for (let k = 0; k < 2; k++) {
    const it = at(
      view.cube,
      x,
      y,
      z,
      rotationZ(spin + k * Math.PI * 0.5, E1),
      scaling(size, size * 0.16, size * 0.16, E2),
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
      {
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
      view.drawBoss(items, sim, th, t);
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
    case 'rack': {
      const floor = th.y0 ?? th.y;
      if (th.state === 'warn') {
        const k = Math.min(1, th.t / 0.9);
        at(P.shadow, th.x, floor + 0.02, 0, scaling(0.4 + k * 0.8, 1, 0.4 + k * 0.8, E1));
        items.push(view.glow(th.x, floor + 0.05, 0.6, 0.12, RACK_GLOW));
      } else at(P.rackFall, th.x, th.y, -0.1);
      break;
    }
    case 'zone': {
      const floor = th.y0 ?? th.y;
      const w = th.w ?? 1;
      if (th.variant === 'arrow') {
        const dir = th.dir ?? 1;
        // Every arrow of the zone blinks in step: one colour for all.
        const tint = pool.tint(1, 0.6 + Math.sin(t * 12) * 0.3, 0.3);
        for (let x = th.x + 0.8; x < th.x + w; x += 2) {
          const it = at(P.arrow, x, floor + 0.01, 0.2, scaling(dir, 1, 1, E1));
          it.tint = tint;
          it.noShadow = true;
        }
        break;
      }
      const live = th.state === 'live';
      const pulse = 0.6 + Math.sin(t * (live ? 40 : 14)) * 0.4;
      const it = at(P.warn, th.x + w / 2, floor + 0.01, -0.4, scaling(w, 1, 2.4, E1));
      it.tint = live
        ? th.variant === 'cable'
          ? pool.tint(0.6 * pulse + 0.6, 0.9, 1.6)
          : pool.tint(1.6, 0.5, 0.6 * pulse)
        : pool.tint(1.2 * pulse, 0.55 * pulse, 0.15);
      it.noShadow = true;
      break;
    }
    default:
      break;
  }
  // Don't keep the last level's lists alive between frames.
  out = [];
  pool = FRESH;
}
