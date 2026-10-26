/**
 * Body language: poses for the heroes and the bosses, computed from the
 * simulation state. The renderer turns them into joint rotations.
 *
 * Kévin carries more weight (bigger squash, slower settle, broader arms), Charline
 * is lighter and nimbler (bouncier stride, quicker recovery, a tucked front flip
 * on her double jump). Julien moves with technical precision, Rodolphe with grand,
 * generous gestures. Nobody waves or salutes: the arms have no elbows, and no arm
 * goes above the shoulder except both together in a victory V or holding a ledge.
 *
 * Nothing here allocates: every function writes into a pose kept for that caller
 * (one for the hero, one per boss, one for idles) and rewrites all of its fields,
 * so a tweak made by the caller never leaks into the next frame.
 *
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

import { LIVE, WARN } from '../game/boss.js';

/** @param {number} v @param {number} [lo] @param {number} [hi] */
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** @param {number} a @param {number} b @param {number} k */
const mix = (a, b, k) => a + (b - a) * k;
/** @param {number} k */
const smooth = (k) => k * k * (3 - 2 * k);
/** Ease out with a little overshoot, for follow-through. @param {number} k */
const backOut = (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
/** Damped wobble that settles after an impact. @param {number} k Seconds since. */
const settle = (k) => Math.exp(-k * 7) * Math.sin(k * 22);
/** Slower, heavier sway: momentum carried after stopping. @param {number} k @param {number} f */
const rock = (k, f) => Math.exp(-k * 5) * Math.sin(k * f);
/** Rises over `a` seconds from `t0`, falls over `a` seconds to `t1`. @param {number} k @param {number} t0 @param {number} t1 @param {number} a */
const span = (k, t0, t1, a) => smooth(clamp((k - t0) / a)) * (1 - smooth(clamp((k - t1 + a) / a)));
const TAU = Math.PI * 2;
/** Arm swing at shoulder height: above it, a single arm would read as a wave or a salute. */
export const SHOULDER = 1.55;

/** @returns {Required<Pose>} */
const blankPose = () => ({
  legL: 0,
  legR: 0,
  armL: 0,
  armR: 0,
  armSpread: 0,
  lean: 0,
  bob: 0,
  head: 0,
  squash: 0,
  blink: 0,
  mood: 'neutral',
  hair: 0,
  hem: 0,
  flip: 0,
  gaze: 0,
});
const HERO = blankPose();
const AIR = blankPose();
const IDLE = blankPose();
const DANCER = blankPose();
const BOSS = { technical: blankPose(), grand: blankPose() };
/** bossPose()'s result, rewritten on every call. */
const BOSS_OUT = {
  pose: /** @type {Required<Pose>} */ (BOSS.technical),
  y: 0,
  turn: 1,
  /** @type {number[] | undefined} */
  tint: undefined,
  facing: 1,
};
const TINT = [1, 1, 1];
/** Julien's alternating attacks: when the second wave is warned (boss.js SWAP). */
const SWAP = WARN + LIVE + 0.1;
/** When each rack of Julien's supervision is warned (boss.js TRACK). */
const TRACK_BEAT = 0.75;
/** When Rodolphe pulled up at the end of a dash run (his `b.t`), while he stands there. */
const ARRIVED = new WeakMap();

/**
 * Resets every field of `p`: the legs and arms as given, the rest neutral, eyes
 * blinking on their own clock.
 * @param {Required<Pose>} p @param {number} t
 * @param {number} legL @param {number} legR @param {number} armL @param {number} armR
 */
function base(p, t, legL, legR, armL, armR) {
  p.legL = legL;
  p.legR = legR;
  p.armL = armL;
  p.armR = armR;
  p.armSpread = 0;
  p.lean = 0;
  p.bob = 0;
  p.head = 0;
  p.squash = 0;
  p.blink = blinkAt(t);
  p.mood = 'neutral';
  p.hair = 0;
  p.hem = 0;
  p.flip = 0;
  p.gaze = 0;
  return p;
}

/**
 * Keeps both arms at or below the shoulders.
 * @template {Pose} P
 * @param {P} p
 * @returns {P}
 */
function lowArms(p) {
  if (p.armL > SHOULDER) p.armL = SHOULDER;
  if (p.armR > SHOULDER) p.armR = SHOULDER;
  return p;
}

/** Boss temperament: the moves that only one of them makes give him away. */
const SIGNATURE = /** @type {Record<string, 'technical'|'grand'>} */ ({
  volley: 'technical',
  rackDrop: 'technical',
  cables: 'technical',
  teleport: 'technical',
  fan: 'grand',
  leap: 'grand',
  dash: 'grand',
  zones: 'grand',
});
/** @type {WeakMap<Thing, 'technical'|'grand'>} */
const STYLE = new WeakMap();

/**
 * Julien ('technical') or Rodolphe ('grand'). Without an id, the boss's own moves
 * tell; before his first one, Rodolphe is the one who brings five arguments.
 * @param {Thing} b @param {string} [id]
 */
function bossStyle(b, id) {
  if (id) return id === 'regionalDirector' ? 'grand' : 'technical';
  const sig = SIGNATURE[b.state];
  if (sig) STYLE.set(b, sig);
  return STYLE.get(b) ?? ((b.hp ?? 0) >= 5 ? 'grand' : 'technical');
}

/**
 * The boss's pose for its current attack. Each wind-up is held long enough to
 * read as a warning: arm cocked for a volley, a hand held out to lower the racks,
 * crouch before a leap, lean before the dash. Breathing and a glance at the
 * hero run underneath. The result (and its pose) is shared and rewritten by the
 * next call for the same boss.
 * @param {Thing} b @param {number} hx Hero centre x. @param {number} t Seconds.
 * @param {string} [id] Boss id ('techServicesDirector' | 'regionalDirector').
 * @returns {{pose: Pose, y: number, turn: number, tint: number[] | undefined, facing: number}}
 */
export function bossPose(b, hx, t, id) {
  const style = bossStyle(b, id);
  const grand = style === 'grand';
  const p = BOSS[style];
  const done = b.state === 'convinced' || b.state === 'sign';
  const facing =
    b.state === 'dash'
      ? (b.dir ?? 1)
      : b.state === 'walk'
        ? Math.sign(b.vx ?? 0) || 1
        : done
          ? 1
          : Math.sign(hx - b.x) || -1;
  const bt = b.t ?? 0;
  // Which side the hero is on: once convinced, he turns to him (never his back).
  const side = Math.sign(hx - b.x) || 1;
  const breath = Math.sin(t * 2.2);
  // Keeps an eye on the hero: chin down when close, up when far.
  const glance = clamp((5 - Math.abs(hx - b.x)) / 5) * 0.18 - 0.05;
  // Wind-up tremor: tension building before the release.
  const charge = Math.sin(t * 34) * 0.05;
  const bt1 = t + 1.3;
  let y = b.y;
  let turn = 1;
  /** @type {number[] | undefined} */
  let tint;
  switch (b.state) {
    case 'intro': {
      if (grand) {
        // Rodolphe takes the stage: arms open wide, chest out, a rise onto the toes.
        const k = backOut(clamp(bt / 0.7));
        const rise = Math.sin(Math.PI * clamp(bt / 0.7));
        base(
          p,
          bt1,
          0.12,
          -0.12,
          0.8 * k + Math.sin(t * 1.6) * 0.04,
          0.8 * k + Math.sin(t * 1.6 + 1) * 0.04,
        );
        p.armSpread = 1.05 * k;
        p.lean = -0.12 * k + breath * 0.02;
        p.head = -0.18 * k + Math.sin(t * 1.3) * 0.03;
        p.bob = rise * 0.9 + breath * 0.2;
        p.squash = -0.03 * rise;
        p.hem = 0.25 * rise;
      } else {
        // Julien: tablet up, a measured open hand, one crisp nod over the glasses.
        const k = smooth(clamp(bt / 0.4));
        const nod = Math.sin(Math.PI * clamp((bt - 0.35) / 0.4));
        base(p, bt1, 0.04, -0.04, 0.4 * k, 0.95 * k);
        p.armSpread = 0.28 * k;
        p.lean = 0.03 + breath * 0.01;
        p.head = glance + nod * 0.16;
        p.gaze = nod * 0.8;
        p.bob = breath * 0.15;
      }
      p.mood = 'happy';
      turn = 0.5;
      break;
    }
    case 'volley': {
      // A flat sidearm throw, like dealing cards across a table: the arm cocks back
      // low behind him and sweeps through at chest height (never overhead).
      const k = ((bt + 0.05) % 0.55) / 0.55;
      if (bt < 0.5) {
        const w = smooth(clamp(bt / 0.3));
        base(p, bt1, 0.3 * w, -0.35 * w, 0.5 * w, -1.3 * w + charge);
        p.lean = -0.12 * w;
        p.head = glance - 0.05;
        p.squash = 0.04 * w;
      } else if (k < 0.7) {
        // Cocks the arm back, weight on the back foot.
        const w = smooth(k / 0.7);
        base(p, bt1, 0.3, -0.35, mix(-0.3, 0.6, w), -1.3 * mix(0.4, 1, w) + charge);
        p.lean = mix(0.1, -0.15, w);
        p.head = glance - 0.05;
        p.squash = 0.04 * w;
      } else {
        // Throws through, then the arm settles: follow-through.
        const f = (k - 0.7) / 0.3;
        base(p, bt1, 0.4, -0.25, mix(-0.6, -0.3, f), mix(1.5, 1.0, smooth(f)));
        p.armSpread = 0.25 * (1 - f);
        p.lean = mix(0.28, 0.1, f);
        p.head = glance + 0.1;
        p.squash = -0.03 * (1 - f);
        p.hem = 0.3 * (1 - f);
      }
      break;
    }
    case 'fan':
      if (bt < 0.55) {
        // The encore ('again') starts from the open arms of the first fan and swings
        // them straight back for the next one: no snap back to a standing pose.
        const again = b.variant === 'again';
        const w = smooth(clamp(bt / 0.35));
        const arms = mix(again ? 1.4 : 0, -1.4, w);
        base(p, bt1, 0.4 * w, -0.4 * w, arms + charge * w, arms - charge * w);
        p.armSpread = mix(again ? 1.1 : 0, 0.6, w);
        p.lean = -0.15 * w;
        p.squash = 0.07 * w;
        p.head = glance;
      } else {
        const k = clamp((bt - 0.55) / 0.35);
        const o = backOut(k);
        base(p, bt1, 0.2, -0.2, mix(-1.4, 1.4, o), mix(-1.4, 1.4, o));
        p.armSpread = mix(0.6, 1.1, k) + settle(bt - 0.55) * 0.1;
        p.lean = 0.2 * (1 - k * 0.5);
        p.squash = -0.05 * (1 - k);
        p.bob = breath * 0.3;
        p.head = -0.1;
        p.hem = 0.35 * (1 - k);
      }
      break;
    case 'rackDrop': {
      if (b.variant === 'tracking') {
        // Supervision: the pointing arm stays on the hero; on each new rack a crisp
        // tap on the tablet, eyes down to it, then back up over the glasses at him.
        const w = smooth(clamp(bt / 0.25));
        const since = bt % TRACK_BEAT;
        const tap = bt < TRACK_BEAT * 3 ? Math.exp(-since * 9) : 0;
        base(p, bt1, 0.18 * w, -0.18 * w, (1.45 - tap * 0.1) * w, (1.0 + tap * 0.18) * w);
        p.armSpread = (0.04 + tap * 0.08) * w;
        p.head = mix(glance - 0.06, 0.3, tap) * w;
        p.gaze = mix(0.7, -0.4, tap) * w;
        p.lean = 0.04 + tap * 0.05;
        p.bob = breath * 0.15 - tap * 0.3;
        turn = 0.75;
        break;
      }
      // Precise: tablet held out, the other hand points at the racks and lowers them
      // one notch at a time (from shoulder height down: no raised hand).
      const w = smooth(clamp(bt / 0.3));
      const step = bt * 4;
      const notch = (Math.floor(step) % 4) + smooth(clamp((step % 1) / 0.3));
      base(p, bt1, 0.15 * w, -0.15 * w, (1.5 - notch * 0.1) * w, 1.05 * w);
      p.armSpread = 0.05 * w;
      p.head = -0.28 * w + Math.max(0, Math.sin(step * TAU)) * 0.02;
      p.bob = breath * 0.15;
      p.lean = -0.05 * w;
      turn = 0.6;
      break;
    }
    case 'cables': {
      if (b.variant === 'maintenance') {
        // Maintenance window: both hands gather at the chest, then open wide and flat
        // over the whole floor (everything goes live but one window); again for the
        // second window. Symmetric and at waist height: nothing like a wave.
        const w = smooth(clamp(bt / 0.3));
        const k = bt < SWAP ? bt : bt - SWAP;
        const open = smooth(clamp((k - 0.15) / 0.45));
        const gather = bt >= SWAP ? 1 - smooth(clamp(k / 0.15)) : 0;
        const o = Math.max(open, gather);
        base(p, bt1, 0.24 * w, -0.24 * w, (1.0 + 0.2 * o) * w, (1.0 + 0.12 * o) * w);
        p.armSpread = mix(-0.35, 0.8, o) * w;
        p.head = mix(0.22, glance - 0.08, o);
        p.gaze = mix(-0.3, 0.4, o);
        p.lean = mix(0.06, -0.04, o);
        p.squash = 0.04 * (1 - o) * w;
        p.bob = breath * 0.15 + o * 0.25;
        p.hem = 0.15 * o;
        turn = 0.5;
        break;
      }
      // Routes the current from the tablet: steady stance, a pointing hand, crisp taps.
      const w = smooth(clamp(bt / 0.3));
      const tap = Math.max(0, Math.sin(t * 11)) ** 3;
      base(
        p,
        bt1,
        0.22 * w,
        -0.22 * w,
        1.35 * w + Math.max(0, Math.sin(t * 2.5)) * 0.08,
        (1.0 + tap * 0.12) * w,
      );
      p.armSpread = 0.12 * w;
      p.head = mix(glance, 0.3, w) + tap * 0.02;
      p.lean = 0.06 * w;
      p.bob = breath * 0.15;
      turn = 0.6;
      break;
    }
    case 'teleport': {
      // Failover, calm and precise: he stands tall, one hand on his tablet, and the
      // backup site takes over in a cool cyan glow. Feet on the floor, his own
      // colours kept: an architect switching sites, never a ghost.
      const k = clamp(bt / 0.55);
      const tap = Math.max(0, Math.sin(t * 11)) ** 3;
      base(p, bt1, 0.08, -0.08, 0.3, 1.0 + tap * 0.1);
      p.armSpread = 0.15;
      p.head = -0.12;
      p.squash = bt < 0.55 ? -0.04 * k : 0.06 * Math.max(0, 1 - (bt - 0.55) / 0.2);
      p.bob = bt < 0.55 ? 0.12 * k : 0;
      p.mood = 'focus';
      if (bt < 0.55) {
        TINT[0] = 1 + k * 0.25;
        TINT[1] = 1 + k * 0.5;
        TINT[2] = 1 + k * 0.75;
        tint = TINT;
      }
      turn = 0.6;
      break;
    }
    case 'leap': {
      if (bt < 0.5) {
        // Deep crouch, arms swung back: the slam is coming. The second leap of a
        // double ('again') sinks straight on from the first landing's crouch.
        const from = b.variant === 'again' ? 0.3 : 0;
        const w = smooth(clamp(bt / 0.3));
        const legs = mix(from, 1.1, w);
        base(p, bt1, legs, legs, -0.8 * w + charge, -0.8 * w - charge);
        p.squash = 0.2 * w;
        p.lean = 0.35 * w;
        p.head = glance - 0.2 * w;
        p.mood = 'effort';
      } else if (bt < 1.1) {
        // Airborne: knees tucked, both arms swung forward and wide for balance.
        const k = Math.min(1, (bt - 0.5) / 0.6);
        y += Math.sin(Math.PI * k) * 1.8;
        const tuck = Math.sin(Math.PI * k);
        base(p, bt1, 0.4 + tuck * 0.8, 0.2 + tuck * 0.6, mix(1.1, 1.5, tuck), mix(1.1, 1.5, tuck));
        p.armSpread = 0.35 + 0.45 * tuck;
        p.squash = k > 0.95 ? 0.18 : k < 0.15 ? -0.1 : -0.04;
        p.lean = 0.1 - tuck * 0.15;
        p.hem = k < 0.5 ? 0.2 : 0.7 * k;
        // The crowd asked for this one: he enjoys it.
        p.mood = b.variant === 'again' ? 'happy' : 'effort';
      } else {
        // Landing: squash and the arms follow through down.
        const k = clamp((bt - 1.1) / 0.4);
        base(
          p,
          bt1,
          mix(0.9, 0.2, k),
          mix(0.9, -0.2, k),
          mix(-0.6, 0, smooth(k)),
          mix(-0.6, 0, smooth(k)),
        );
        p.armSpread = 0.5 * (1 - k);
        p.squash = 0.2 * (1 - k) + settle(bt - 1.1) * 0.04;
        p.lean = 0.3 * (1 - k);
        p.hem = -0.3 * settle(bt - 1.1) + 0.3 * (1 - k);
        p.mood = 'focus';
      }
      break;
    }
    case 'walk': {
      // A purposeful walk to the next station: Julien keeps his tablet to his chest.
      const ph = t * 9;
      const sw = Math.sin(ph);
      base(p, bt1, sw * 0.65, -sw * 0.65, -sw * 0.35, grand ? sw * 0.35 : 0.75);
      p.lean = 0.08;
      p.bob = Math.abs(Math.cos(ph)) * 0.5;
      p.head = glance * 0.5;
      p.hem = Math.abs(sw) * 0.15;
      break;
    }
    case 'dash': {
      const back = b.variant === 'back';
      const running = bt >= 0.85 && (bt < 0.95 || Math.abs(b.vx ?? 0) > 0.01);
      if (running || bt < 0.85) ARRIVED.delete(b);
      if (bt < 0.85) {
        // Lean before the run. The return leg ('back') turns round from where he
        // pulled up at the end of the first run, then leans the other way.
        const w = smooth(clamp(bt / (back ? 0.3 : 0.4)));
        base(p, bt1, 0.8 * w, -0.6 * w, -0.9 * w + charge, 0.9 * w - charge);
        if (back) {
          const k = 1 - w;
          p.armL = mix(p.armL, 0.6, k);
          p.armR = mix(p.armR, 0.6, k);
          p.armSpread = 0.7 * k;
          const pivot = smooth(clamp(bt / 0.3));
          turn = mix(side * (b.dir ?? 1) * 0.6, 1, pivot);
        }
        p.lean = 0.45 * w;
        p.squash = 0.08 * w;
        p.head = -0.15 * w;
      } else if (running) {
        const ph = t * 22;
        const s = Math.sin(ph);
        base(
          p,
          bt1,
          s * 1.2 + 0.15,
          -s * 1.2 + 0.15,
          -Math.sin(ph - 0.3) * 1.2,
          Math.sin(ph - 0.3) * 1.2,
        );
        p.lean = 0.45;
        p.bob = Math.abs(Math.cos(ph)) * 1.8;
        p.head = -0.2 + Math.cos(ph * 2) * 0.03;
        p.hem = 0.7 + Math.sin(ph * 2) * 0.1;
        p.mood = 'effort';
      } else {
        // Pulled up at the far side: a braking skid, then he straightens up and tugs
        // both jacket fronts straight, chin up, eyes back on the hero (no running on
        // the spot, no bow, no salute).
        let at = ARRIVED.get(b);
        if (at === undefined || at > bt) ARRIVED.set(b, (at = bt));
        const k = clamp((bt - at) / 0.35);
        const e = backOut(k);
        const brake = 1 - smooth(k);
        const g = smooth(clamp((bt - at - 0.25) / 0.3));
        const tug =
          Math.max(0, Math.sin((bt - at - 0.3) * 9)) *
          g *
          (1 - smooth(clamp((bt - at - 1.1) / 0.3)));
        base(p, bt1, mix(0.7, 0.12, e), mix(-0.5, -0.12, e), mix(-0.6, 0.45, e), mix(0.6, 0.45, e));
        p.armSpread = mix(0.3, -0.3, g);
        p.lean = mix(-0.3, -0.05, e) + settle(bt - at) * 0.06;
        p.squash = 0.1 * brake;
        p.head = mix(0.05, -0.15, smooth(k));
        p.gaze = 0.3 * g;
        p.hem = -0.5 * brake + 0.1 + tug * 0.15;
        p.bob = breath * 0.3 + tug * 0.4;
        p.mood = k < 0.4 ? 'effort' : 'happy';
        turn = mix(1, side * (b.dir ?? 1) * 0.6, smooth(k));
      }
      break;
    }
    case 'zones': {
      // Presents the stage like a showman: one arm out level, sweeping slowly over
      // the danger spots, the other open; chin up.
      const w = backOut(clamp(bt / 0.4));
      const sweep = Math.sin(t * 0.9);
      base(p, bt1, 0.3, -0.3, 0.9 * w, 1.45 * w + sweep * 0.08);
      p.armSpread = 0.55 + sweep * 0.25;
      p.head = -0.18 + sweep * 0.04;
      p.lean = -0.06;
      p.bob = breath * 0.4;
      turn = 0.4;
      break;
    }
    case 'consult': {
      // Reads the tablet (Julien taps away) or the folder (Rodolphe turns a page);
      // looks up at the hero now and then, Julien over the top of his glasses.
      const tap = grand ? 0 : Math.max(0, Math.sin(t * 11)) ** 3;
      const page = grand ? smooth(clamp((Math.sin(t * 1.6) - 0.6) * 4)) : 0;
      const peek = smooth(clamp((Math.sin(t * 0.9) - 0.75) * 5));
      base(
        p,
        bt1,
        0,
        Math.max(0, Math.sin(t * 2)) * 0.08,
        0.95 + tap * 0.15 + page * 0.25,
        1.1 + (grand ? 0 : Math.sin(t * 11) * 0.05),
      );
      p.armSpread = -0.25 - page * 0.12;
      p.head = grand ? mix(0.32, glance, peek) : mix(0.45, 0.28, peek);
      p.gaze = grand ? -0.3 * (1 - peek) : mix(-0.4, 1, peek);
      p.lean = (grand ? -0.03 : 0.05) + breath * 0.02;
      p.bob = breath * 0.3;
      turn = 0.35;
      break;
    }
    case 'hit':
      hitPose(p, bt, t, grand);
      tint = bt < 0.2 ? HIT_TINT : undefined;
      break;
    case 'phase': {
      const w = backOut(clamp(bt / 0.4));
      if (grand) {
        // Second wind: a power stance, feet wide, arms flung open at shoulder height,
        // chest out and chin up.
        base(
          p,
          bt1,
          0.5,
          -0.5,
          1.15 * w + Math.sin(t * 18) * 0.02,
          1.15 * w + Math.sin(t * 18) * 0.02,
        );
        p.armSpread = 1.1 * w;
        p.lean = -0.1 * w;
        p.head = -0.3;
        p.squash = mix(0.1, -0.05, w);
        p.bob = breath * 0.4;
        p.hem = 0.3;
        p.mood = 'effort';
      } else {
        // Reboots: stands tall, hands out at the sides, a single focused nod.
        base(p, bt1, 0.18, -0.18, 0.25 * w, 0.8 * w);
        p.armSpread = 0.45 * w;
        p.head = -0.15 + Math.sin(Math.PI * clamp((bt - 0.3) / 0.35)) * 0.18;
        p.squash = mix(0.06, -0.04, w);
        p.bob = breath * 0.2;
        p.mood = 'focus';
      }
      TINT[0] = 1.2 + Math.sin(t * 18) * 0.2;
      TINT[1] = 1.15;
      TINT[2] = 1.3;
      tint = TINT;
      turn = 0.3;
      break;
    }
    case 'convinced': {
      if (grand) {
        // Won over, and generous about it: arms wide open, chin up, a hearty laugh.
        const laugh = Math.max(0, Math.sin(t * 13)) * clamp(1 - ((bt % 2.4) - 1.2) * 2);
        const k = backOut(clamp(bt / 0.5));
        base(p, bt1, 0.15, -0.15, 0.55 * k, 0.55 * k);
        p.armSpread = 1.45 * k;
        p.lean = -0.1 * k;
        p.head = -0.22 + laugh * 0.05;
        p.bob = laugh * 0.5 + breath * 0.3;
        p.squash = -0.02 * laugh;
        p.hem = 0.15;
      } else {
        // Approves: the tablet tucked away, an open hand forward, a satisfied nod.
        const k = smooth(clamp(bt / 0.35));
        const nod = Math.max(0, Math.sin(t * 3)) ** 2;
        base(p, bt1, 0.05, -0.05, 1.25 * k, 0.55);
        p.armSpread = 0.15 * k - 0.1;
        p.lean = 0.04;
        p.head = -0.05 + nod * 0.12;
        p.bob = breath * 0.2 + Math.sin(Math.PI * clamp(bt / 0.4)) * 0.8;
      }
      p.mood = 'happy';
      // Faces the camera, turned a little towards the hero.
      turn = 0.3 * side;
      break;
    }
    case 'sign':
      // Signs the envelope, then offers a handshake with a satisfied nod (no bow).
      if (bt < 1.2) {
        base(p, bt1, 0, 0, 0.9, 1.2 + Math.sin(t * 16) * 0.12);
        p.head = 0.4 + Math.sin(t * 16) * 0.02;
        p.gaze = -0.5;
        p.lean = 0.08;
        p.bob = breath * 0.2;
        p.mood = 'focus';
      } else {
        const k = clamp((bt - 1.2) / 0.5);
        const nod = Math.sin(Math.PI * k) * (grand ? 0.16 : 0.12);
        base(
          p,
          bt1,
          0,
          0,
          grand ? 0.35 * k : 0.1,
          mix(1.2, 1.4, smooth(k)) + Math.sin(t * 5) * 0.06 * k,
        );
        p.armSpread = grand ? 0.3 * k : 0;
        p.head = -0.05 + nod;
        p.lean = 0.04;
        p.bob = Math.sin(t * 2) * 0.3;
        p.mood = 'happy';
      }
      // Signs facing his desk side (where the pen sparkles), then turns to the hero to
      // hand it over and shake on it.
      turn = bt < 1.2 ? 0.4 : mix(0.4, 0.8 * side, smooth(clamp((bt - 1.2) / 0.35)));
      break;
    default:
      // Waiting: each in character (see bossIdle()).
      turn = bossIdle(p, t, grand, glance);
      break;
  }
  const st = b.state;
  if (st === 'rackDrop' || st === 'cables' || st === 'consult' || st === 'volley') p.mood = 'focus';
  if (st === 'zones' || st === 'fan') p.mood = 'happy';
  if (st === 'dash' && bt < 0.85) p.mood = 'focus';
  lowArms(p);
  const out = BOSS_OUT;
  out.pose = p;
  out.y = y;
  out.turn = turn;
  out.tint = tint;
  out.facing = facing;
  return out;
}

const HIT_TINT = [1.6, 1.3, 1.2];

/**
 * Hit by a CR while consulting (0.6 s): a clear recoil, then each takes it in his
 * own way. Julien rocks back clutching the tablet to his chest, then composes
 * himself with a crisp nod; Rodolphe staggers back with his arms thrown open, then
 * lays a hand on his heart and laughs it off like a good sport ("touché!").
 * @param {Required<Pose>} p @param {number} bt Seconds since the hit. @param {number} t
 * @param {boolean} grand
 */
function hitPose(p, bt, t, grand) {
  const w = settle(bt);
  // Recoil peaks fast, then recovers over the rest of the state.
  const jolt = Math.min(1, bt / 0.06) * (1 - smooth(clamp((bt - 0.12) / 0.4)));
  const after = smooth(clamp((bt - 0.2) / 0.25));
  if (grand) {
    base(
      p,
      0,
      mix(-0.3, 0.05, after),
      mix(0.45, -0.05, after),
      mix(0.45, 1.15, after) + w * 0.2,
      mix(0.45, 0.45, after) - w * 0.2,
    );
    p.armSpread = mix(1.4, -0.35, after);
    p.lean = -0.32 * jolt + w * 0.1 - 0.04 * after;
    p.squash = 0.09 * jolt + w * 0.05;
    p.head = -0.22 * jolt + w * 0.15 - 0.15 * after + Math.max(0, Math.sin(t * 13)) * 0.04 * after;
    p.bob = Math.max(0, Math.sin(t * 13)) * 0.4 * after;
    p.hem = 0.45 * jolt + w * 0.2;
    p.mood = bt < 0.22 ? 'ouch' : 'happy';
  } else {
    const nod = Math.sin(Math.PI * clamp((bt - 0.32) / 0.22));
    base(
      p,
      0,
      mix(-0.2, 0.04, after),
      mix(0.3, -0.04, after),
      mix(0.55, 0.35, after),
      mix(0.6, 0.8, after) - w * 0.12,
    );
    p.armSpread = mix(-0.45, -0.1, after);
    p.lean = -0.22 * jolt + w * 0.08;
    p.squash = 0.06 * jolt + w * 0.04;
    p.head = -0.18 * jolt + w * 0.12 + nod * 0.16;
    p.gaze = nod * 0.6;
    p.hem = 0.25 * jolt;
    p.mood = bt < 0.22 ? 'ouch' : 'focus';
  }
  p.blink = 0;
}

/**
 * Bosses waiting (before the duel, during the dialogues): Julien works through his
 * tablet, glancing up at the hero over his glasses, then lowers it for a word;
 * Rodolphe addresses the crowd with both arms open (symmetric, nothing like a wave),
 * looks round the room, stresses a point with both hands, gathers them in. Returns
 * the body turn.
 * @param {Required<Pose>} p @param {number} t @param {boolean} grand @param {number} glance
 */
function bossIdle(p, t, grand, glance) {
  idlePose(t, p);
  p.blink = blinkAt(t + 1.3);
  const breath = Math.sin(t * 2.2);
  if (!grand) {
    const k = t % 9;
    const up = span(k, -1, 6.4, 0.45) + span(k, 8.2, 10, 0.45);
    const tap = Math.max(0, Math.sin(t * 9)) ** 3 * span(k, 0.6, 3.6, 0.3);
    const peek = span(k, 2.2, 3.4, 0.25) + span(k, 4.6, 5.6, 0.25);
    const word = span(k, 6.4, 8.4, 0.4);
    p.armR = mix(0.35, 0.95, up) + Math.sin(t * 1.7) * 0.03;
    p.armL = mix(p.armL + 0.05, 0.8 + tap * 0.14, up * (1 - peek * 0.4));
    p.armSpread = mix(0.03, -0.3, up);
    p.head = mix(glance + Math.sin(t * 0.7) * 0.05, mix(0.42, 0.3, peek), up);
    p.gaze =
      mix(0, mix(-0.35, 1, peek), up) + word * Math.sin(Math.PI * clamp((k - 6.6) / 0.5)) * 0.4;
    p.lean = 0.02 + p.lean + up * 0.03;
    p.head += word * Math.sin(Math.PI * clamp((k - 6.6) / 0.5)) * 0.1;
    p.mood = up > 0.5 ? 'focus' : 'neutral';
    return 1;
  }
  const k = t % 8;
  const open = span(k, -1, 2.8, 0.5) + span(k, 6.4, 9, 0.5);
  const stress = span(k, 2.6, 4.8, 0.3);
  const gather = span(k, 4.6, 6.6, 0.4);
  // Beats of the speech: both hands press forward together on each point.
  const beat = Math.max(0, Math.sin((k - 2.6) * 7)) ** 2 * stress;
  const arms = 0.12 + open * 0.6 + stress * (0.85 + beat * 0.2) + gather * 0.7;
  p.armL = arms;
  p.armR = arms;
  p.armSpread = open * 1.05 + stress * 0.4 - gather * 0.25 + 0.14 * (1 - open - stress - gather);
  p.lean = -0.04 - open * 0.05 + beat * 0.05 + breath * 0.015;
  p.head = -0.12 * open + beat * 0.08 + gather * 0.12 + Math.sin(t * 0.7) * 0.04;
  p.bob = breath * 0.3 + open * Math.sin(t * 1.2) * 0.2;
  p.mood = open + stress > 0.5 ? 'happy' : 'neutral';
  // Faces the audience (the camera), looking round it: one side, then the other.
  return 0.3 + Math.sin(t * 0.8) * 0.22 * (open + stress);
}

/**
 * Airborne body, from vertical speed. Rising: the leading knee drives up, the back
 * leg trails, the arms swing through. Falling: legs reach for the floor, arms rise
 * for balance. Kévin drives harder and spreads wider; Charline stays long and light.
 * @param {Required<Pose>} p @param {number} vy @param {number} jump @param {number} t
 * @param {boolean} kev
 * @returns {Required<Pose>} `p`.
 */
function airPose(p, vy, jump, t, kev) {
  const rise = clamp(vy / jump);
  const fall = clamp(-vy / 14);
  // Apex: a loose arm flail while weightless.
  const apex = clamp(1 - Math.abs(vy) / 3.5);
  const flail = Math.sin(t * 15) * (kev ? 0.3 : 0.4) * apex;
  if (vy > 0) {
    base(
      p,
      t,
      mix(0.55, kev ? 1.2 : 1.1, rise),
      mix(-0.1, kev ? -0.35 : -0.55, rise),
      mix(0.6, kev ? -0.8 : -1.0, rise) + flail,
      mix(1.2, kev ? 1.45 : 1.5, rise) - flail,
    );
    p.armSpread = (kev ? 0.28 : 0.15) + apex * 0.3;
    p.lean = 0.18 * rise + 0.06;
    p.head = -0.12 * rise;
    p.squash = (kev ? -0.07 : -0.09) * rise;
    // Hair and coat tails trail down while rising, float up at the apex.
    p.hair = 0.05 + apex * 0.2;
    p.hem = 0.1 + apex * 0.25;
    // Pushing off: teeth gritted on the way up, relaxed at the top.
    p.mood = rise > 0.55 ? 'effort' : 'neutral';
    return p;
  }
  base(
    p,
    t,
    mix(0.55, 0.25, fall),
    mix(-0.1, 0.05, fall),
    mix(0.6, 1.35, fall) + flail,
    mix(1.2, 1.45, fall) - flail,
  );
  p.armSpread = (kev ? 0.3 : 0.15) + apex * 0.3 + fall * (kev ? 0.8 : 0.65);
  p.lean = mix(0.06, -0.08, fall);
  p.head = mix(0, 0.15, fall);
  p.gaze = -0.6 * fall;
  p.squash = -0.04 * fall;
  p.hair = 0.25 + fall * 0.55;
  p.hem = 0.3 + fall * 0.6;
  p.mood = fall > 0.6 ? 'focus' : 'neutral';
  return p;
}

/**
 * The hero's pose, face included: neutral by default, effort when pushing off,
 * hanging, climbing or skidding, ouch when hurt, joy on success. Shared and
 * rewritten by every call (see heroLayers() for the scene's extra layers).
 * @param {Sim} sim
 * @param {number} t
 * @param {number} still Seconds standing still.
 * @returns {Required<Pose>}
 */
export function heroPose(sim, t, still) {
  cheering = false;
  const p = heroBody(sim, t, still);
  const h = sim.hero;
  if (h.state === 'hang' || h.state === 'climb' || sim.won || cheering) return p;
  return lowArms(p);
}

/** Set by heroBody() when both arms go up in a cheer (allowed above the shoulders). */
let cheering = false;

/** The level boss, while there is a duel or a signing to react to. @param {Sim} sim */
const duelBoss = (sim) =>
  sim.bossActive || sim.bossDone ? sim.things.find((k) => k.kind === 'boss') : undefined;

/** @param {Sim} sim @param {number} t @param {number} still @returns {Required<Pose>} */
function heroBody(sim, t, still) {
  const h = sim.hero;
  const kev = sim.heroId !== 'charline';
  const p = HERO;
  if (h.state === 'hang') {
    // Hanging from the ledge: a pendulum, legs trailing the swing. Kévin's weight
    // stretches him and slows the swing; Charline keeps her knees tucked.
    const f = kev ? 1.8 : 2.6;
    const s = Math.sin(t * f);
    const lag = Math.sin(t * f - 0.6);
    const k = h.stateTime;
    const settleIn = kev
      ? Math.exp(-k * 4) * Math.sin(k * 12)
      : Math.exp(-k * 6) * Math.sin(k * 18);
    base(
      p,
      t,
      (kev ? 0.1 : 0.32) + lag * 0.14 + settleIn * 0.3,
      (kev ? -0.1 : 0.12) + lag * 0.1 + settleIn * 0.2,
      Math.PI * 0.95 + s * 0.03,
      Math.PI * 0.95 - s * 0.03,
    );
    p.lean = 0.08 + s * 0.06;
    p.head = -0.15 + s * 0.03;
    p.gaze = 0.5;
    p.squash = (kev ? -0.06 : -0.03) + settleIn * 0.05;
    p.hair = -0.12 - lag * 0.12 + settleIn * 0.3;
    p.hem = 0.05 + lag * 0.08 + settleIn * 0.4;
    p.mood = 'effort';
    return p;
  }
  if (h.state === 'climb') {
    // Pull-up then push-over: hands go from overhead to pressing down behind,
    // a knee kicks up onto the ledge, the torso folds over it. Kévin hauls himself
    // up; Charline springs over with a high knee and a flick of the back leg.
    const k = Math.min(1, h.stateTime / sim.stats.climb);
    const e = smooth(k);
    const arc = Math.sin(Math.PI * k);
    const arm =
      k < 0.5
        ? mix(Math.PI * 0.95, 0.9, smooth(k / 0.5))
        : mix(0.9, -0.35, smooth((k - 0.5) / 0.5));
    const pull = k < 0.4 ? Math.sin((Math.PI * k) / 0.4) : 0;
    const push = Math.max(0, (k - 0.8) / 0.2);
    base(
      p,
      t,
      arc * (kev ? 1.35 : 1.7),
      Math.sin(Math.PI * Math.min(1, k * 1.4)) * (kev ? 0.5 : 0.7) - (kev ? 0.15 : 0.4) * e,
      arm,
      arm,
    );
    p.armSpread = arc * (kev ? 0.38 : 0.25);
    p.lean = arc * (kev ? 0.82 : 0.7) + 0.1 * e;
    p.head = -0.25 * (1 - e) + arc * 0.2;
    p.squash = (kev ? -0.1 : -0.06) * pull + (kev ? 0.11 : 0.06) * push;
    p.bob = arc * (kev ? 1.0 : 1.5);
    p.hair = 0.15 + arc * 0.35;
    p.hem = arc * 0.5;
    // Strains on the pull, relieved once over the top.
    p.mood = k < 0.8 ? 'effort' : 'neutral';
    return p;
  }
  if (h.state === 'dead') {
    const st = h.stateTime;
    // Surprise: a flinch first (anticipation), then the arms fly out to the sides.
    if (st < 0.35) {
      const flinch = clamp(1 - st / 0.08);
      const k = clamp((st - 0.06) / 0.29);
      const up = backOut(Math.min(1, k * 2.5));
      base(
        p,
        t,
        0.4 * k + 0.25 * flinch,
        -0.4 * k + 0.25 * flinch,
        mix(0.5, 1.45, up) + Math.sin(t * 40) * 0.06 * k,
        mix(0.5, 1.45, up) - Math.sin(t * 40) * 0.06 * k,
      );
      p.armSpread = 1.0 * k;
      p.squash = mix(0.1, -0.12, k);
      p.head = mix(0.2, -0.3, k);
      p.bob = Math.sin(Math.PI * k) * (kev ? 1.6 : 2.4);
      p.hair = 0.6 * k;
      p.hem = 0.5 * k;
    } else {
      // Then a cartoon flop onto the back, arms spread out to the sides: Kévin drops
      // heavily and bounces once, Charline lands lighter, legs kicking up.
      const k = Math.min(1, (st - 0.35) / (kev ? 0.34 : 0.44));
      const w = settle(Math.max(0, st - (kev ? 0.69 : 0.79)));
      base(
        p,
        t,
        (kev ? 1.1 : 1.45) * k + w * 0.3,
        (kev ? 0.55 : 0.85) * k + w * 0.4,
        1.45 - w * 0.2,
        1.3 + w * 0.2,
      );
      p.armSpread = 1.0 + 0.25 * k;
      p.lean = -1.1 * k;
      p.squash = (kev ? 0.24 : 0.16) * k + w * (kev ? 0.08 : 0.04);
      p.bob = -6 * k;
      p.head = -0.2 * k;
      p.hair = 0.5 * (1 - k) + w * 0.4;
      p.hem = 0.6 * (1 - k) - w * 0.4;
    }
    p.mood = 'ouch';
    p.blink = 0;
    return p;
  }
  if (sim.won) {
    // Victory hops with both arms up in a V, pumping in time with the hop (no waving).
    // Raised arms open outwards with a negative spread (a positive one crosses them).
    if (kev) {
      // Kévin: big stomping hops, fists high, a heavy squash on each landing.
      const hop = Math.abs(Math.sin(t * 5.5));
      const land = (1 - hop) ** 4;
      base(p, t, hop * 0.35, hop * 0.2, 2.55 + hop * 0.3, 2.55 + hop * 0.3);
      p.armSpread = -0.3 - hop * 0.08;
      p.bob = hop * 1.7;
      p.head = -0.2 - hop * 0.08;
      p.squash = land * 0.15 - hop * 0.03;
      p.lean = -0.04 + land * 0.06;
      p.hem = 0.15 + hop * 0.5;
    } else {
      // Charline: light, springy hops with a heel kick, arms in a wide V, hair flying.
      const ph = t * 7;
      const hop = Math.abs(Math.sin(ph));
      // Coming down, the hair floats up.
      const down = Math.cos(ph) * Math.sin(ph) < 0;
      base(p, t, -hop * 0.55, -hop * 0.3, 2.65 + hop * 0.2, 2.65 + hop * 0.2);
      p.armSpread = -0.45 - hop * 0.12;
      p.bob = hop * 2.6;
      p.head = -0.22 - hop * 0.08;
      p.squash = (1 - hop) ** 4 * 0.07 - hop * 0.05;
      p.lean = 0.05 * hop;
      p.hair = 0.15 + hop * (down ? 0.35 : 0.15);
      p.hem = 0.2 + hop * 0.4;
    }
    p.mood = 'happy';
    return p;
  }
  if (h.state === 'air') {
    const jump = sim.stats.jump;
    // Knocked back: recoil, arms thrown forward, chin up, then a damped wobble.
    if (h.invuln > 1.1) {
      const k = clamp((h.invuln - 1.1) / 0.3);
      const since = 1.4 - h.invuln;
      const w = settle(since);
      const flail = kev ? 0.06 : 0.12;
      base(
        p,
        t,
        0.7 * k + 0.2 + w * 0.15,
        0.35 * k - w * 0.1,
        1.4 + Math.sin(t * 30) * flail,
        1.25 - Math.sin(t * 30) * flail,
      );
      p.armSpread = kev ? 0.7 : 0.55;
      p.lean = -0.5 * k - w * 0.12;
      p.head = -0.35 * k + w * 0.15;
      p.squash = -0.06 * k + w * 0.04;
      p.hair = 0.7 * k + w * 0.3;
      p.hem = 0.6 * k;
      p.mood = 'ouch';
      p.blink = 0;
      return p;
    }
    // Charline's double jump: a tucked front flip, opening out into the fall. She
    // enjoys this one.
    if (h.airJumps < sim.stats.airJumps && h.vy > -4) {
      const v0 = jump * 0.9;
      const k = clamp((v0 - h.vy) / (v0 + 4));
      const tuck = Math.sin(Math.PI * k);
      const a = airPose(AIR, h.vy, jump, t, kev);
      base(
        p,
        t,
        mix(a.legL, 2.0, tuck),
        mix(a.legR, 1.85, tuck),
        mix(a.armL, 1.1, tuck),
        mix(a.armR, 1.1, tuck),
      );
      p.armSpread = mix(a.armSpread, -0.1, tuck);
      p.lean = mix(a.lean, 0.75, tuck);
      p.head = mix(a.head, 0.45, tuck);
      p.squash = mix(a.squash, 0.06, tuck);
      p.flip = TAU * smooth(k);
      p.hair = mix(a.hair, 0.55, tuck);
      p.hem = mix(a.hem, 0.6, tuck);
      p.mood = tuck > 0.3 ? 'happy' : a.mood;
      return p;
    }
    return airPose(p, h.vy, jump, t, kev);
  }
  const speed = Math.abs(h.vx);
  // Skid: still sliding one way while facing the other, arms windmilling; the coat
  // swings forward with the momentum.
  if (speed > 2 && Math.sign(h.vx) !== h.facing) {
    const j = Math.sin(t * 45) * 0.05;
    base(
      p,
      t,
      (kev ? 0.8 : 0.7) + j,
      -0.5 - j,
      -1 + Math.sin(t * 16) * 0.25,
      1.3 - Math.sin(t * 16) * 0.25,
    );
    p.armSpread = kev ? 0.4 : 0.25;
    p.lean = kev ? -0.42 : -0.32;
    p.head = -0.15;
    p.squash = kev ? 0.09 : 0.05;
    p.hair = -0.25;
    p.hem = -0.35;
    p.mood = 'effort';
    return p;
  }
  if (speed > 0.3) {
    const ph = h.run * 2.3;
    const a = Math.min(1, speed / sim.stats.run);
    // Walk below half speed, run above.
    const r = smooth(clamp((a - 0.35) / 0.45));
    const s = Math.sin(ph);
    // Knee drive: the forward swing goes higher and snappier than the push-off.
    const drive = kev ? 1.1 : 1.2;
    const lift = mix(0.55, drive, r) * a ** 0.4;
    const push = mix(0.5, 0.75, r) * a ** 0.4;
    // Contact (legs apart) is low, passing (legs together) and flight are high.
    const contact = Math.abs(Math.sin(ph + 0.25));
    const arms = mix(0.4, kev ? 0.95 : 0.85, r) * a ** 0.5;
    // Hair and coat tails trail behind, bouncing a beat after each footfall.
    const lagBounce = Math.sin(ph * 2 - 0.9);
    base(
      p,
      t,
      s > 0 ? s * lift : s * push,
      -s > 0 ? -s * lift : -s * push,
      -Math.sin(ph - 0.3) * arms + r * 0.15,
      Math.sin(ph - 0.3) * arms + r * 0.15,
    );
    p.armSpread = (kev ? 0.08 : 0.04) + r * (kev ? 0.07 : 0.03);
    p.lean = mix(0.04, kev ? 0.28 : 0.24, r) * a;
    p.bob = (1 - contact) * mix(0.5, kev ? 1.5 : 2.1, r) * a;
    p.head = mix(0, -0.06, r) + Math.cos(ph * 2) * (kev ? 0.05 : 0.035) * a;
    p.squash = contact ** 6 * (kev ? 0.075 : 0.035) * r;
    p.hair = (0.1 + 0.3 * r + lagBounce * 0.08) * a;
    p.hem = (0.1 + 0.45 * r + lagBounce * 0.12 * r) * a;
    return p;
  }
  // Standing. Just stopped: momentum rocks the body forward and back, and the coat
  // and hair follow through (Kévin's heavier sway lasts a little longer).
  idlePose(t, p);
  if (kev) {
    p.armSpread += 0.03;
    p.bob *= 1.2;
  } else {
    p.legL += Math.sin(t * 0.5) * 0.03;
    p.lean += Math.sin(t * 0.5) * 0.01;
  }
  if (still < 1.2) {
    const m = kev ? rock(still, 11) * 0.14 : rock(still * 1.3, 14) * 0.09;
    p.lean += m;
    p.head -= m * 0.5;
    p.hair = -m * 2.5;
    p.hem = -m * 3;
  }
  const boss = duelBoss(sim);
  if (boss && (boss.state === 'convinced' || (boss.state === 'sign' && (boss.t ?? 0) < 6))) {
    const dx = boss.x - (h.x + 0.3);
    cheering = signingPose(p, t, boss, Math.sign(dx) === h.facing && Math.abs(dx) < 4.5, kev);
    return p;
  }
  // Facing a director: on guard, light on the feet (see duelPose()).
  if (boss && sim.bossActive && !sim.bossDone && still > 0.5) {
    duelPose(p, t, still, boss, kev);
    return p;
  }
  // Waiting around, each in character: Kévin checks his watch (the planning!),
  // straightens his jacket and taps his foot; Charline checks her phone (a client!),
  // looks up thinking, and stretches her back (arms low: no gesture near the face).
  if (still > 4 && !(sim.bossActive && !sim.bossDone)) heroIdle(p, t, (still - 4) % 7, kev);
  return p;
}

/**
 * The director is won over, and the hero shares it: a cheer with both arms up the
 * moment he is convinced, then hands together watching him sign, then the hand held
 * out for his handshake (or applause, when not facing him), all smiles. Layered on
 * the standing pose `p`. Returns whether the arms are up in the cheer.
 * @param {Required<Pose>} p @param {number} t @param {Thing} b
 * @param {boolean} facing Whether the hero faces the director, near enough to shake hands.
 * @param {boolean} kev
 */
function signingPose(p, t, b, facing, kev) {
  const bt = b.t ?? 0;
  p.mood = 'happy';
  if (b.state === 'convinced') {
    // Both arms up in a V, a hop or two, then they come down.
    const up = backOut(clamp(bt / 0.25)) * (1 - smooth(clamp((bt - 0.95) / 0.4)));
    const hop = Math.abs(Math.sin(bt * (kev ? 7 : 8.5))) * up;
    // Nearly straight up and wide open, so both fists read from the side: a cheer.
    p.armL = mix(p.armL, kev ? 2.85 : 2.9, up);
    p.armR = p.armL;
    p.armSpread = mix(p.armSpread, kev ? -0.5 : -0.58, up);
    p.bob += hop * (kev ? 1.5 : 2.2);
    p.head = -0.18 * up;
    p.squash = (1 - hop) ** 4 * 0.06 * up - hop * 0.03;
    p.hem = 0.3 * hop;
    p.hair = 0.2 * hop;
    return up > 0.05;
  }
  if (bt < 1.2) {
    // Hands together in front, a nod down towards the pen.
    const k = smooth(clamp(bt / 0.3));
    p.armL = mix(p.armL, 0.55, k);
    p.armR = mix(p.armR, 0.55, k);
    p.armSpread = mix(p.armSpread, -0.32, k);
    p.head = 0.12 * k;
    p.gaze = -0.3 * k;
    p.lean = 0.03;
    return false;
  }
  const k = smooth(clamp((bt - 1.25) / 0.3)) * (1 - smooth(clamp((bt - 3.4) / 0.5)));
  if (facing) {
    // Takes the handshake: one hand out at chest height, a nod, a happy bounce.
    p.armR = mix(p.armR, 1.3 + Math.sin(t * 5) * 0.06 * k, k);
    p.armL = mix(p.armL, 0.15, k);
    p.head = 0.1 * Math.sin(Math.PI * clamp((bt - 1.3) / 0.6));
  } else {
    // Applause: both hands meet in front of the chest.
    const clap = Math.abs(Math.sin(t * 13));
    p.armL = mix(p.armL, 1.15, k);
    p.armR = p.armL;
    p.armSpread = mix(p.armSpread, -0.45 + clap * 0.22, k);
    p.head = -0.08 * k;
  }
  p.bob += Math.abs(Math.sin(t * 6)) * 0.4 * k;
  return false;
}

/**
 * Standing still in a duel: on guard, weight on the balls of the feet with a light
 * bounce, hands ready, eyes on the director. Focused while he attacks; a confident
 * grin when he stops to consult, the opening to land a CR.
 * @param {Required<Pose>} p @param {number} t @param {number} still @param {Thing} b
 * @param {boolean} kev
 */
function duelPose(p, t, still, b, kev) {
  const k = smooth(clamp((still - 0.5) / 0.4));
  const bounce = Math.abs(Math.sin(t * (kev ? 4.2 : 5.2)));
  p.legL = mix(p.legL, kev ? 0.22 : 0.16, k);
  p.legR = mix(p.legR, kev ? -0.2 : -0.14, k);
  p.armL = mix(p.armL, 0.4, k);
  p.armR = mix(p.armR, 0.5, k);
  p.armSpread = mix(p.armSpread, kev ? 0.16 : 0.1, k);
  p.lean = mix(p.lean, 0.07, k);
  p.bob += bounce * (kev ? 0.35 : 0.55) * k;
  p.squash += (1 - bounce) ** 4 * 0.02 * k;
  p.head = mix(p.head, -0.04, k);
  const opening = b.state === 'consult' || b.state === 'hit';
  if (k > 0.5) p.mood = opening ? 'happy' : b.state === 'intro' ? 'neutral' : 'focus';
}

/**
 * The heroes' idle loops (7 s, after 4 s standing still).
 * @param {Required<Pose>} p @param {number} t @param {number} k Seconds into the loop.
 * @param {boolean} kev
 */
function heroIdle(p, t, k, kev) {
  if (kev) {
    if (k < 2.5) {
      // The watch: wrist up in front of the chest, a glance down at it.
      const up = backOut(clamp(k / 0.35));
      p.armL = 1.5 * up;
      p.armSpread = -0.4 * up;
      p.head = 0.35 * up + Math.sin(t * 4) * 0.02;
      p.gaze = -0.4 * up;
      p.mood = 'focus';
    } else if (k < 4) {
      // Tugs both jacket fronts straight, with a little shrug.
      const g = Math.sin(Math.PI * clamp((k - 2.6) / 1.2));
      const tug = Math.max(0, Math.sin((k - 2.6) * 9)) * g;
      p.armL = 0.45 * g;
      p.armR = 0.45 * g;
      p.armSpread = -0.3 * g;
      p.bob += tug * 0.4;
      p.squash = -0.02 * tug;
      p.head = -0.08 * g;
      p.hem = 0.15 * tug;
    } else {
      const tap = Math.max(0, Math.sin(t * 9));
      p.legR = tap * 0.3;
      p.armL = 0.3;
      p.armR = 0.3;
      p.armSpread = -0.15;
      p.bob = tap * 0.3;
      p.head = -0.08 + tap * 0.03;
      p.gaze = 0.3;
    }
    return;
  }
  if (k < 3) {
    const up = backOut(clamp(k / 0.35));
    const scroll = Math.max(0, Math.sin(t * 6)) ** 3;
    p.armR = 1.4 * up + scroll * 0.06;
    p.head = 0.3 * up;
    p.gaze = -0.4 * up;
    p.lean = 0.04;
    p.legL = Math.max(0, Math.sin(t * 1.5)) * 0.1;
    p.mood = 'happy';
  } else if (k < 4.5) {
    // Looks up, thinking it over, weight on one foot.
    const g = smooth(clamp((k - 3) / 0.4)) * (1 - smooth(clamp((k - 4.1) / 0.4)));
    p.head = mix(p.head, -0.3, g);
    p.gaze = 0.7 * g;
    p.lean = mix(p.lean, -0.05, g);
    p.legL = mix(p.legL, -0.12, g);
    p.armL = mix(p.armL, 0.15, g);
    p.armSpread = mix(p.armSpread, 0.12, g);
  } else {
    const st = smooth(clamp((k - 4.5) / 0.6)) * (1 - smooth(clamp((k - 6.4) / 0.6)));
    // Back stretch with the arms low: hands behind her back, chest out, up on her toes.
    p.armL = mix(p.armL, -0.45, st);
    p.armR = mix(p.armR, -0.45, st);
    p.armSpread = mix(p.armSpread, -0.12, st);
    p.lean = -0.12 * st;
    p.head = -0.2 * st;
    p.squash = -0.04 * st;
    p.bob += st * 0.8;
    if (st > 0.8) p.blink = 1;
  }
}

/**
 * Seconds since the hero's last moves (negative or huge: long ago), as tracked by
 * the scene from the sim events, and how far the last landing dropped.
 * @typedef {Object} HeroBeats
 * @property {number} land Since landing ('land' or 'step').
 * @property {number} jump Since taking off ('jump' or 'airjump').
 * @property {number} throw Since throwing a CR.
 * @property {number} joy Since a small success (ticket, secret, key, checkpoint).
 * @property {number} drop Tiles fallen from the top of the arc to that landing.
 */

/**
 * Layers on top of heroPose() (in place): the throwing arm, a landing squash that
 * grows with the drop (and settles with a small rebound), a stretch on take-off,
 * a grin after a small success.
 * @param {Pose} p @param {Sim} sim @param {HeroBeats} beats
 * @returns {Pose} `p`.
 */
export function heroLayers(p, sim, beats) {
  const h = sim.hero;
  const kev = sim.heroId !== 'charline';
  const free = h.state === 'ground' || h.state === 'air';
  // Throw: a flat sidearm sweep at chest height, the body leaning into it.
  const th = beats.throw;
  if (free && th >= 0 && th < 0.28) {
    const swing = th < 0.08 ? -1.3 * (th / 0.08) : mix(-1.3, SHOULDER, smooth((th - 0.08) / 0.2));
    p.armR = swing;
    p.lean = (p.lean ?? 0) + 0.12;
    if (p.mood === 'neutral' || p.mood === undefined) p.mood = 'effort';
  }
  // Landing: the higher the drop, the deeper and longer the squash; arms dip out,
  // chin down, then a small rebound. Kévin lands heavier.
  const land = beats.land;
  const drop = clamp(beats.drop, 0, 8);
  const dur = 0.11 + drop * 0.025;
  if (h.state === 'ground' && land >= 0 && land < dur + 0.14) {
    const amt = (0.05 + drop * 0.026) * (kev ? 1.15 : 0.85);
    if (land < dur) {
      const k = 1 - land / dur;
      const e = k * k;
      p.squash = (p.squash ?? 0) + amt * e;
      p.armSpread = (p.armSpread ?? 0) + amt * 1.6 * e;
      p.head = (p.head ?? 0) + amt * 1.4 * e;
      p.lean = (p.lean ?? 0) + amt * 0.7 * e;
      p.hem = (p.hem ?? 0) - amt * 2 * e;
      p.hair = (p.hair ?? 0) + amt * 2.5 * e;
      if (drop > 3 && p.mood === 'neutral') p.mood = 'effort';
    } else p.squash = (p.squash ?? 0) - amt * 0.3 * Math.sin((Math.PI * (land - dur)) / 0.14);
  }
  // Take-off: a quick stretch, longest on a full jump.
  const jump = beats.jump;
  if (h.state === 'air' && jump >= 0 && jump < 0.13) {
    const k = 1 - jump / 0.13;
    p.squash = (p.squash ?? 0) - (kev ? 0.1 : 0.12) * k;
  }
  if (h.state !== 'dead' && h.invuln <= 1.1 && beats.joy >= 0 && beats.joy < 0.7)
    if (p.mood !== 'effort' || beats.joy < 0.35) p.mood = 'happy';
  return p;
}

/**
 * The end party: everybody dances, both arms pumping together in a victory V
 * (never one hand up: no waving). Shared pose, rewritten by every call.
 * @param {number} t @param {number} i Dancer index (offsets the beat).
 * @returns {Required<Pose>}
 */
export function dancePose(t, i) {
  const ph = t * 6 + i * 1.3;
  const s = Math.sin(ph);
  const hop = Math.abs(s);
  const p = base(
    DANCER,
    t + i,
    Math.max(0, s) * 0.7,
    Math.max(0, -s) * 0.7,
    2.5 + hop * 0.3,
    2.5 + hop * 0.3,
  );
  p.armSpread = -0.35 - hop * 0.1;
  p.bob = hop * 2;
  p.head = Math.sin(ph * 0.5) * 0.2;
  p.lean = Math.sin(ph * 0.5) * 0.05;
  p.hem = hop * 0.3;
  p.hair = hop * 0.3;
  p.mood = 'happy';
  return p;
}

/** Eyelids: a quick blink every few seconds. @param {number} t */
export function blinkAt(t) {
  const k = t % 3.7;
  return k < 0.14 ? Math.sin((Math.PI * k) / 0.14) : 0;
}

/**
 * Standing: breathing, a slight weight shift, a wandering glance. Writes every
 * field of `out` (the shared IDLE pose by default, so nothing is allocated per
 * frame): callers may tweak the result, but must use it before the next call.
 * @param {number} t @param {Required<Pose>} [out]
 * @returns {Required<Pose>} `out`.
 */
export function idlePose(t, out = IDLE) {
  const breath = Math.sin(t * 2.4);
  const shift = Math.sin(t * 0.5);
  out.blink = blinkAt(t);
  out.mood = 'neutral';
  out.legL = shift * 0.03;
  out.legR = -shift * 0.03;
  out.armL = Math.sin(t * 1.3) * 0.08 + breath * 0.02;
  out.armR = Math.sin(t * 1.7) * 0.08 + breath * 0.02;
  out.armSpread = 0.04 + breath * 0.02;
  out.bob = breath * 0.3;
  out.lean = breath * 0.015;
  out.head = Math.sin(t * 0.7) * 0.06 - breath * 0.01;
  out.squash = breath * 0.008;
  // The hair settles a beat behind the breathing.
  out.hair = Math.sin(t * 2.4 - 0.8) * 0.02;
  out.hem = 0;
  out.flip = 0;
  out.gaze = 0;
  return out;
}
