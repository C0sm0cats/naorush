/**
 * Body language: poses for the heroes and the bosses, computed from the
 * simulation state. The renderer turns them into joint rotations.
 *
 * Kévin carries more weight (bigger squash, slower settle, broader arms), Charline
 * is lighter and nimbler (bouncier stride, quicker recovery, a tucked front flip
 * on her double jump). Julien moves with technical precision, Rodolphe with grand,
 * generous gestures. Nobody waves or salutes: the arms have no elbows.
 *
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

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
const TAU = Math.PI * 2;

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
 * read as a warning: arm cocked for a volley, a hand raised to lower the racks,
 * crouch before a leap, lean before the dash. Breathing and a glance at the
 * hero run underneath.
 * @param {Thing} b @param {number} hx Hero centre x. @param {number} t Seconds.
 * @param {string} [id] Boss id ('techServicesDirector' | 'regionalDirector').
 * @returns {{pose: Pose, y: number, turn: number, tint: number[] | undefined, facing: number}}
 */
export function bossPose(b, hx, t, id) {
  const grand = bossStyle(b, id) === 'grand';
  const done = b.state === 'convinced' || b.state === 'sign';
  const facing = b.state === 'dash' ? (b.dir ?? 1) : done ? 1 : Math.sign(hx - b.x) || -1;
  const bt = b.t ?? 0;
  const breath = Math.sin(t * 2.2);
  // Keeps an eye on the hero: chin down when close, up when far.
  const glance = clamp((5 - Math.abs(hx - b.x)) / 5) * 0.18 - 0.05;
  // Wind-up tremor: tension building before the release.
  const charge = Math.sin(t * 34) * 0.05;
  let y = b.y;
  /** @type {Pose} */
  let pose;
  let turn = 1;
  /** @type {number[] | undefined} */
  let tint;
  switch (b.state) {
    case 'intro': {
      if (grand) {
        // Rodolphe takes the stage: arms open wide, chest out, a rise onto the toes.
        const k = backOut(clamp(bt / 0.7));
        const rise = Math.sin(Math.PI * clamp(bt / 0.7));
        pose = {
          legL: 0.12,
          legR: -0.12,
          armL: 0.8 * k + Math.sin(t * 1.6) * 0.04,
          armR: 0.8 * k + Math.sin(t * 1.6 + 1) * 0.04,
          armSpread: 1.05 * k,
          lean: -0.12 * k + breath * 0.02,
          head: -0.18 * k + Math.sin(t * 1.3) * 0.03,
          bob: rise * 0.9 + breath * 0.2,
          squash: -0.03 * rise,
          hem: 0.25 * rise,
        };
      } else {
        // Julien: tablet up, a measured open hand, one crisp nod.
        const k = smooth(clamp(bt / 0.4));
        const nod = Math.sin(Math.PI * clamp((bt - 0.35) / 0.4));
        pose = {
          legL: 0.04,
          legR: -0.04,
          armL: 0.4 * k,
          armR: 0.95 * k,
          armSpread: 0.28 * k,
          lean: 0.03 + breath * 0.01,
          head: glance + nod * 0.16,
          bob: breath * 0.15,
        };
      }
      turn = 0.5;
      break;
    }
    case 'volley': {
      const k = ((bt + 0.05) % 0.55) / 0.55;
      if (bt < 0.5) {
        const w = smooth(clamp(bt / 0.3));
        pose = {
          legL: 0.3 * w,
          legR: -0.35 * w,
          armL: 0.5 * w,
          armR: -1.3 * w + charge,
          lean: -0.12 * w,
          head: glance - 0.05,
          squash: 0.04 * w,
        };
      } else if (k < 0.7) {
        // Cocks the arm back, weight on the back foot.
        const w = smooth(k / 0.7);
        pose = {
          legL: 0.3,
          legR: -0.35,
          armL: mix(-0.3, 0.6, w),
          armR: -1.3 * mix(0.4, 1, w) + charge,
          lean: mix(0.1, -0.15, w),
          head: glance - 0.05,
          squash: 0.04 * w,
        };
      } else {
        // Throws through, then the arm settles: follow-through.
        const f = (k - 0.7) / 0.3;
        pose = {
          legL: 0.4,
          legR: -0.25,
          armL: mix(-0.6, -0.3, f),
          armR: mix(2.7, 1.4, smooth(f)),
          lean: mix(0.28, 0.1, f),
          head: glance + 0.1,
          squash: -0.03 * (1 - f),
          hem: 0.3 * (1 - f),
        };
      }
      break;
    }
    case 'fan':
      if (bt < 0.55) {
        const w = smooth(clamp(bt / 0.35));
        pose = {
          legL: 0.4 * w,
          legR: -0.4 * w,
          armL: -1.4 * w + charge,
          armR: -1.4 * w - charge,
          armSpread: 0.6 * w,
          lean: -0.15 * w,
          squash: 0.07 * w,
          head: glance,
        };
      } else {
        const k = clamp((bt - 0.55) / 0.35);
        const o = backOut(k);
        pose = {
          legL: 0.2,
          legR: -0.2,
          armL: mix(-1.4, 1.4, o),
          armR: mix(-1.4, 1.4, o),
          armSpread: mix(0.6, 1.1, k) + settle(bt - 0.55) * 0.1,
          lean: 0.2 * (1 - k * 0.5),
          squash: -0.05 * (1 - k),
          bob: breath * 0.3,
          head: -0.1,
          hem: 0.35 * (1 - k),
        };
      }
      break;
    case 'rackDrop': {
      // Precise: tablet held out, the other hand points at the racks and lowers them one
      // notch at a time (kept below the head: no raised hand).
      const w = smooth(clamp(bt / 0.3));
      const step = bt * 4;
      const notch = (Math.floor(step) % 4) + smooth(clamp((step % 1) / 0.3));
      pose = {
        legL: 0.15 * w,
        legR: -0.15 * w,
        armL: (1.85 - notch * 0.1) * w,
        armR: 1.05 * w,
        armSpread: 0.05 * w,
        head: -0.28 * w + Math.max(0, Math.sin(step * TAU)) * 0.02,
        bob: breath * 0.15,
        lean: -0.05 * w,
      };
      turn = 0.6;
      break;
    }
    case 'cables': {
      // Routes the current from the tablet: steady stance, a pointing hand, crisp taps.
      const w = smooth(clamp(bt / 0.3));
      const tap = Math.max(0, Math.sin(t * 11)) ** 3;
      pose = {
        legL: 0.22 * w,
        legR: -0.22 * w,
        armL: 1.35 * w + Math.max(0, Math.sin(t * 2.5)) * 0.08,
        armR: (1.0 + tap * 0.12) * w,
        armSpread: 0.12 * w,
        head: mix(glance, 0.3, w) + tap * 0.02,
        lean: 0.06 * w,
        bob: breath * 0.15,
      };
      turn = 0.6;
      break;
    }
    case 'teleport': {
      const k = clamp(bt / 0.55);
      pose = {
        legL: 0,
        legR: 0,
        armL: 1.45,
        armR: 1.45,
        armSpread: 0.9 + k * 0.35,
        head: -0.2,
        squash: bt < 0.55 ? -0.1 * k : 0.12 * Math.max(0, 1 - (bt - 0.55) / 0.2),
        bob: bt < 0.55 ? k * 1.5 : 0,
        hem: bt < 0.55 ? 0.5 * k : 0,
      };
      tint = bt < 0.55 ? [1 + bt * 2, 1 + bt * 2.4, 1 + bt * 3] : undefined;
      turn = 0.5 + bt * 4;
      break;
    }
    case 'leap': {
      if (bt < 0.5) {
        // Deep crouch, arms swung back: the slam is coming.
        const w = smooth(clamp(bt / 0.3));
        pose = {
          legL: 1.1 * w,
          legR: 1.1 * w,
          armL: -0.8 * w + charge,
          armR: -0.8 * w - charge,
          squash: 0.2 * w,
          lean: 0.35 * w,
          head: glance - 0.2 * w,
        };
      } else if (bt < 1.1) {
        const k = Math.min(1, (bt - 0.5) / 0.6);
        y += Math.sin(Math.PI * k) * 1.8;
        const tuck = Math.sin(Math.PI * k);
        pose = {
          legL: 0.4 + tuck * 0.8,
          legR: 0.2 + tuck * 0.6,
          armL: mix(1.8, 2.8, tuck),
          armR: mix(1.8, 2.8, tuck),
          armSpread: -0.35 * tuck,
          squash: k > 0.95 ? 0.18 : k < 0.15 ? -0.1 : -0.04,
          lean: 0.1 - tuck * 0.15,
          hem: k < 0.5 ? 0.2 : 0.7 * k,
        };
      } else {
        // Landing: squash and the arms follow through down.
        const k = clamp((bt - 1.1) / 0.4);
        pose = {
          legL: mix(0.9, 0.2, k),
          legR: mix(0.9, -0.2, k),
          armL: mix(-0.6, 0, smooth(k)),
          armR: mix(-0.6, 0, smooth(k)),
          armSpread: 0.5 * (1 - k),
          squash: 0.2 * (1 - k) + settle(bt - 1.1) * 0.04,
          lean: 0.3 * (1 - k),
          hem: -0.3 * settle(bt - 1.1) + 0.3 * (1 - k),
        };
      }
      break;
    }
    case 'dash':
      if (bt < 0.85) {
        const w = smooth(clamp(bt / 0.4));
        pose = {
          legL: 0.8 * w,
          legR: -0.6 * w,
          armL: -0.9 * w + charge,
          armR: 0.9 * w - charge,
          lean: 0.45 * w,
          squash: 0.08 * w,
          head: -0.15 * w,
        };
      } else {
        const ph = t * 22;
        const s = Math.sin(ph);
        pose = {
          legL: s * 1.2 + 0.15,
          legR: -s * 1.2 + 0.15,
          armL: -Math.sin(ph - 0.3) * 1.2,
          armR: Math.sin(ph - 0.3) * 1.2,
          lean: 0.45,
          bob: Math.abs(Math.cos(ph)) * 1.8,
          head: -0.2 + Math.cos(ph * 2) * 0.03,
          hem: 0.7 + Math.sin(ph * 2) * 0.1,
        };
      }
      break;
    case 'zones': {
      // Presents the stage like a showman: one arm out level, sweeping slowly over
      // the danger spots, the other open; chin up.
      const w = backOut(clamp(bt / 0.4));
      const sweep = Math.sin(t * 0.9);
      pose = {
        legL: 0.3,
        legR: -0.3,
        armL: 0.9 * w,
        armR: 1.55 * w + sweep * 0.12,
        armSpread: 0.55 + sweep * 0.25,
        head: -0.18 + sweep * 0.04,
        lean: -0.06,
        bob: breath * 0.4,
      };
      turn = 0.4;
      break;
    }
    case 'consult': {
      // Reads the tablet (Julien taps away) or the folder (Rodolphe turns a page);
      // looks up at the hero now and then.
      const tap = grand ? 0 : Math.max(0, Math.sin(t * 11)) ** 3;
      const page = grand ? smooth(clamp((Math.sin(t * 1.6) - 0.6) * 4)) : 0;
      const peek = smooth(clamp((Math.sin(t * 0.9) - 0.75) * 5));
      pose = {
        legL: 0,
        legR: Math.max(0, Math.sin(t * 2)) * 0.08,
        armL: 0.95 + tap * 0.15 + page * 0.25,
        armSpread: -0.25 - page * 0.12,
        armR: 1.1 + (grand ? 0 : Math.sin(t * 11) * 0.05),
        head: mix(grand ? 0.32 : 0.45, glance, peek),
        lean: (grand ? -0.03 : 0.05) + breath * 0.02,
        bob: breath * 0.3,
      };
      turn = 0.35;
      break;
    }
    case 'hit': {
      // Recoil with a damped wobble: Julien stays compact, Rodolphe staggers back.
      const w = settle(bt);
      pose = grand
        ? {
            legL: -0.3,
            legR: 0.4,
            armL: 1.5 + w * 0.25,
            armR: 1.25 - w * 0.25,
            armSpread: 0.45,
            lean: -0.35 + w * 0.1,
            squash: 0.08 + w * 0.05,
            head: -0.25 + w * 0.15,
            hem: 0.4 + w * 0.2,
          }
        : {
            legL: -0.15,
            legR: 0.25,
            armL: 0.5 + w * 0.2,
            armR: 1.2 - w * 0.15,
            armSpread: 0.15,
            lean: -0.22 + w * 0.08,
            squash: 0.05 + w * 0.04,
            head: -0.18 + w * 0.12,
            hem: 0.2,
          };
      tint = bt < 0.2 ? [1.6, 1.3, 1.2] : undefined;
      break;
    }
    case 'phase': {
      const w = backOut(clamp(bt / 0.4));
      pose = grand
        ? {
            // Second wind: a power pose, arms raised wide.
            legL: 0.5,
            legR: -0.5,
            armL: 2.85 * w + Math.sin(t * 18) * 0.03,
            armR: 2.85 * w + Math.sin(t * 18) * 0.03,
            armSpread: -0.55,
            head: -0.35,
            squash: mix(0.1, -0.05, w),
            bob: breath * 0.4,
            hem: 0.3,
          }
        : {
            // Reboots: stands tall, hands out at the sides, a single focused nod.
            legL: 0.18,
            legR: -0.18,
            armL: 0.25 * w,
            armR: 0.8 * w,
            armSpread: 0.45 * w,
            head: -0.15 + Math.sin(Math.PI * clamp((bt - 0.3) / 0.35)) * 0.18,
            squash: mix(0.06, -0.04, w),
            bob: breath * 0.2,
          };
      tint = [1.2 + Math.sin(t * 18) * 0.2, 1.15, 1.3];
      turn = 0.3;
      break;
    }
    case 'convinced': {
      if (grand) {
        // Won over, and generous about it: arms wide open, chin up, a hearty laugh.
        const laugh = Math.max(0, Math.sin(t * 13)) * clamp(1 - ((bt % 2.4) - 1.2) * 2);
        const k = backOut(clamp(bt / 0.5));
        pose = {
          legL: 0.15,
          legR: -0.15,
          armL: 0.55 * k,
          armR: 0.55 * k,
          armSpread: 1.45 * k,
          lean: -0.1 * k,
          head: -0.22 + laugh * 0.05,
          bob: laugh * 0.5 + breath * 0.3,
          squash: -0.02 * laugh,
          hem: 0.15,
        };
      } else {
        // Approves: the tablet tucked away, an open hand forward, a satisfied nod.
        const k = smooth(clamp(bt / 0.35));
        const nod = Math.max(0, Math.sin(t * 3)) ** 2;
        pose = {
          legL: 0.05,
          legR: -0.05,
          armL: 1.25 * k,
          armR: 0.55,
          armSpread: 0.15 * k - 0.1,
          lean: 0.04,
          head: -0.05 + nod * 0.12,
          bob: breath * 0.2 + Math.sin(Math.PI * clamp(bt / 0.4)) * 0.8,
        };
      }
      turn = 0.3;
      break;
    }
    case 'sign':
      // Signs the envelope, then offers a handshake with a polite bow.
      if (bt < 1.2)
        pose = {
          legL: 0,
          legR: 0,
          armL: 0.9,
          armR: 1.2 + Math.sin(t * 16) * 0.12,
          head: 0.4 + Math.sin(t * 16) * 0.02,
          lean: 0.08,
          bob: breath * 0.2,
        };
      else {
        const k = clamp((bt - 1.2) / 0.5);
        const bow = Math.sin(Math.PI * k) * (grand ? 0.24 : 0.14);
        pose = {
          legL: 0,
          legR: 0,
          armL: grand ? 0.35 * k : 0.1,
          armR: mix(1.2, 1.4, smooth(k)) + Math.sin(t * 5) * 0.06 * k,
          armSpread: grand ? 0.3 * k : 0,
          head: -0.05 + bow,
          lean: bow,
          bob: Math.sin(t * 2) * 0.3,
        };
      }
      turn = bt < 1.2 ? 0.4 : 0.8;
      break;
    default: {
      // Waiting: Julien upright with his tablet, Rodolphe chest out, hands open.
      const p = idlePose(t);
      pose = {
        ...p,
        head: glance + Math.sin(t * 0.7) * 0.05,
        lean: grand ? -0.04 + p.lean : 0.02 + p.lean,
        armSpread: grand ? 0.14 : 0.03,
        armR: grand ? p.armR : 0.75,
      };
      break;
    }
  }
  pose.mood = BOSS_MOOD[b.state];
  pose.blink = blinkAt(t + 1.3);
  return { pose, y, turn, tint, facing };
}

/**
 * Airborne body, from vertical speed. Rising: the leading knee drives up, the back
 * leg trails, the arms swing through. Falling: legs reach for the floor, arms rise
 * for balance. Kévin drives harder and spreads wider; Charline stays long and light.
 * @param {number} vy @param {number} jump @param {number} t @param {boolean} kev
 * @returns {Pose}
 */
function airPose(vy, jump, t, kev) {
  const rise = clamp(vy / jump);
  const fall = clamp(-vy / 14);
  // Apex: a loose arm flail while weightless.
  const apex = clamp(1 - Math.abs(vy) / 3.5);
  const flail = Math.sin(t * 15) * (kev ? 0.3 : 0.4) * apex;
  if (vy > 0)
    return {
      legL: mix(0.55, kev ? 1.2 : 1.1, rise),
      legR: mix(-0.1, kev ? -0.35 : -0.55, rise),
      armL: mix(0.6, kev ? -0.8 : -1.0, rise) + flail,
      armR: mix(1.2, kev ? 1.6 : 1.7, rise) - flail,
      armSpread: (kev ? 0.28 : 0.15) + apex * 0.3,
      lean: 0.18 * rise + 0.06,
      head: -0.12 * rise,
      squash: (kev ? -0.07 : -0.09) * rise,
      // Hair and coat tails trail down while rising, float up at the apex.
      hair: 0.05 + apex * 0.2,
      hem: 0.1 + apex * 0.25,
    };
  return {
    legL: mix(0.55, 0.25, fall),
    legR: mix(-0.1, 0.05, fall),
    armL: mix(0.6, 1.35, fall) + flail,
    armR: mix(1.2, 1.5, fall) - flail,
    armSpread: (kev ? 0.3 : 0.15) + apex * 0.3 + fall * (kev ? 0.8 : 0.65),
    lean: mix(0.06, -0.08, fall),
    head: mix(0, 0.15, fall),
    squash: -0.04 * fall,
    hair: 0.25 + fall * 0.55,
    hem: 0.3 + fall * 0.6,
  };
}

/**
 * @param {Sim} sim
 * @param {number} t
 * @param {number} still Seconds standing still.
 * @returns {Pose} A fresh pose, or the shared idle pose (see idlePose()).
 */
export function heroPose(sim, t, still) {
  const h = sim.hero;
  const kev = sim.heroId !== 'charline';
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
    return {
      legL: (kev ? 0.1 : 0.32) + lag * 0.14 + settleIn * 0.3,
      legR: (kev ? -0.1 : 0.12) + lag * 0.1 + settleIn * 0.2,
      armL: Math.PI * 0.95 + s * 0.03,
      armR: Math.PI * 0.95 - s * 0.03,
      lean: 0.08 + s * 0.06,
      head: -0.15 + s * 0.03,
      squash: (kev ? -0.06 : -0.03) + settleIn * 0.05,
      hair: -0.12 - lag * 0.12 + settleIn * 0.3,
      hem: 0.05 + lag * 0.08 + settleIn * 0.4,
    };
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
    return {
      legL: arc * (kev ? 1.35 : 1.7),
      legR: Math.sin(Math.PI * Math.min(1, k * 1.4)) * (kev ? 0.5 : 0.7) - (kev ? 0.15 : 0.4) * e,
      armL: arm,
      armR: arm,
      armSpread: arc * (kev ? 0.38 : 0.25),
      lean: arc * (kev ? 0.82 : 0.7) + 0.1 * e,
      head: -0.25 * (1 - e) + arc * 0.2,
      squash: (kev ? -0.1 : -0.06) * pull + (kev ? 0.11 : 0.06) * push,
      bob: arc * (kev ? 1.0 : 1.5),
      hair: 0.15 + arc * 0.35,
      hem: arc * 0.5,
    };
  }
  if (h.state === 'dead') {
    const st = h.stateTime;
    // Surprise: a flinch first (anticipation), then the arms fly out to the sides.
    if (st < 0.35) {
      const flinch = clamp(1 - st / 0.08);
      const k = clamp((st - 0.06) / 0.29);
      const up = backOut(Math.min(1, k * 2.5));
      return {
        legL: 0.4 * k + 0.25 * flinch,
        legR: -0.4 * k + 0.25 * flinch,
        armL: mix(0.5, 1.45, up) + Math.sin(t * 40) * 0.06 * k,
        armR: mix(0.5, 1.45, up) - Math.sin(t * 40) * 0.06 * k,
        armSpread: 1.0 * k,
        squash: mix(0.1, -0.12, k),
        head: mix(0.2, -0.3, k),
        bob: Math.sin(Math.PI * k) * (kev ? 1.6 : 2.4),
        hair: 0.6 * k,
        hem: 0.5 * k,
      };
    }
    // Then a cartoon flop: Kévin drops heavily and bounces once, Charline lands
    // lighter, legs kicking up.
    const k = Math.min(1, (st - 0.35) / (kev ? 0.34 : 0.44));
    const w = settle(Math.max(0, st - (kev ? 0.69 : 0.79)));
    return {
      legL: (kev ? 1.1 : 1.45) * k + w * 0.3,
      legR: (kev ? 0.55 : 0.85) * k + w * 0.4,
      armL: 2.4 - w * 0.3,
      armR: 1.8 + w * 0.3,
      armSpread: 0.3 * k,
      lean: -1.1 * k,
      squash: (kev ? 0.24 : 0.16) * k + w * (kev ? 0.08 : 0.04),
      bob: -6 * k,
      head: -0.2 * k,
      hair: 0.5 * (1 - k) + w * 0.4,
      hem: 0.6 * (1 - k) - w * 0.4,
    };
  }
  if (sim.won) {
    // Victory hops with both arms up in a V, pumping in time with the hop (no waving).
    // Raised arms open outwards with a negative spread (a positive one crosses them).
    if (kev) {
      // Kévin: big stomping hops, fists high, a heavy squash on each landing.
      const hop = Math.abs(Math.sin(t * 5.5));
      const land = (1 - hop) ** 4;
      return {
        legL: hop * 0.35,
        legR: hop * 0.2,
        armL: 2.55 + hop * 0.3,
        armR: 2.55 + hop * 0.3,
        armSpread: -0.3 - hop * 0.08,
        bob: hop * 1.7,
        head: -0.2 - hop * 0.08,
        squash: land * 0.15 - hop * 0.03,
        lean: -0.04 + land * 0.06,
        hem: 0.15 + hop * 0.5,
      };
    }
    // Charline: light, springy hops with a heel kick, arms in a wide V, hair flying.
    const ph = t * 7;
    const hop = Math.abs(Math.sin(ph));
    // Coming down, the hair floats up.
    const down = Math.cos(ph) * Math.sin(ph) < 0;
    return {
      legL: -hop * 0.55,
      legR: -hop * 0.3,
      armL: 2.65 + hop * 0.2,
      armR: 2.65 + hop * 0.2,
      armSpread: -0.45 - hop * 0.12,
      bob: hop * 2.6,
      head: -0.22 - hop * 0.08,
      squash: (1 - hop) ** 4 * 0.07 - hop * 0.05,
      lean: 0.05 * hop,
      hair: 0.15 + hop * (down ? 0.35 : 0.15),
      hem: 0.2 + hop * 0.4,
    };
  }
  if (h.state === 'air') {
    const jump = sim.stats.jump;
    // Knocked back: recoil, arms thrown forward, chin up, then a damped wobble.
    if (h.invuln > 1.1) {
      const k = clamp((h.invuln - 1.1) / 0.3);
      const since = 1.4 - h.invuln;
      const w = settle(since);
      const flail = kev ? 0.06 : 0.12;
      return {
        legL: 0.7 * k + 0.2 + w * 0.15,
        legR: 0.35 * k - w * 0.1,
        armL: 1.55 + Math.sin(t * 30) * flail,
        armR: 1.3 - Math.sin(t * 30) * flail,
        armSpread: kev ? 0.7 : 0.55,
        lean: -0.5 * k - w * 0.12,
        head: -0.35 * k + w * 0.15,
        squash: -0.06 * k + w * 0.04,
        hair: 0.7 * k + w * 0.3,
        hem: 0.6 * k,
      };
    }
    // Charline's double jump: a tucked front flip, opening out into the fall.
    if (h.airJumps < sim.stats.airJumps && h.vy > -4) {
      const v0 = jump * 0.9;
      const p = clamp((v0 - h.vy) / (v0 + 4));
      const tuck = Math.sin(Math.PI * p);
      const base = airPose(h.vy, jump, t, kev);
      return {
        legL: mix(base.legL, 2.0, tuck),
        legR: mix(base.legR, 1.85, tuck),
        armL: mix(base.armL, 1.1, tuck),
        armR: mix(base.armR, 1.1, tuck),
        armSpread: mix(base.armSpread ?? 0, -0.1, tuck),
        lean: mix(base.lean ?? 0, 0.75, tuck),
        head: mix(base.head ?? 0, 0.45, tuck),
        squash: mix(base.squash ?? 0, 0.06, tuck),
        flip: TAU * smooth(p),
        hair: mix(base.hair ?? 0, 0.55, tuck),
        hem: mix(base.hem ?? 0, 0.6, tuck),
      };
    }
    return airPose(h.vy, jump, t, kev);
  }
  const speed = Math.abs(h.vx);
  // Skid: still sliding one way while facing the other, arms windmilling; the coat
  // swings forward with the momentum.
  if (speed > 2 && Math.sign(h.vx) !== h.facing) {
    const j = Math.sin(t * 45) * 0.05;
    return {
      legL: (kev ? 0.8 : 0.7) + j,
      legR: -0.5 - j,
      armL: -1 + Math.sin(t * 16) * 0.25,
      armR: 1.3 - Math.sin(t * 16) * 0.25,
      armSpread: kev ? 0.4 : 0.25,
      lean: kev ? -0.42 : -0.32,
      head: -0.15,
      squash: kev ? 0.09 : 0.05,
      hair: -0.25,
      hem: -0.35,
    };
  }
  if (speed > 0.3) {
    const ph = h.run * 2.3;
    const a = Math.min(1, speed / sim.stats.run);
    // Walk below half speed, run above.
    const r = smooth(clamp((a - 0.35) / 0.45));
    const s = Math.sin(ph);
    // Knee drive: the forward swing goes higher and snappier than the push-off.
    const drive = kev ? 1.1 : 1.2;
    /** @param {number} v */
    const leg = (v) => (v > 0 ? v * mix(0.55, drive, r) : v * mix(0.5, 0.75, r)) * a ** 0.4;
    // Contact (legs apart) is low, passing (legs together) and flight are high.
    const contact = Math.abs(Math.sin(ph + 0.25));
    const arms = mix(0.4, kev ? 0.95 : 0.85, r) * a ** 0.5;
    // Hair and coat tails trail behind, bouncing a beat after each footfall.
    const lagBounce = Math.sin(ph * 2 - 0.9);
    return {
      legL: leg(s),
      legR: leg(-s),
      armL: -Math.sin(ph - 0.3) * arms + r * 0.15,
      armR: Math.sin(ph - 0.3) * arms + r * 0.15,
      armSpread: (kev ? 0.08 : 0.04) + r * (kev ? 0.07 : 0.03),
      lean: mix(0.04, kev ? 0.28 : 0.24, r) * a,
      bob: (1 - contact) * mix(0.5, kev ? 1.5 : 2.1, r) * a,
      head: mix(0, -0.06, r) + Math.cos(ph * 2) * (kev ? 0.05 : 0.035) * a,
      squash: contact ** 6 * (kev ? 0.075 : 0.035) * r,
      hair: (0.1 + 0.3 * r + lagBounce * 0.08) * a,
      hem: (0.1 + 0.45 * r + lagBounce * 0.12 * r) * a,
    };
  }
  // Standing. Just stopped: momentum rocks the body forward and back, and the coat
  // and hair follow through (Kévin's heavier sway lasts a little longer).
  const p = idlePose(t);
  if (kev) {
    p.armSpread = (p.armSpread ?? 0) + 0.03;
    p.bob = (p.bob ?? 0) * 1.2;
  } else {
    p.legL += Math.sin(t * 0.5) * 0.03;
    p.lean = (p.lean ?? 0) + Math.sin(t * 0.5) * 0.01;
  }
  if (still < 1.2) {
    const m = kev ? rock(still, 11) * 0.14 : rock(still * 1.3, 14) * 0.09;
    p.lean = (p.lean ?? 0) + m;
    p.head = (p.head ?? 0) - m * 0.5;
    p.hair = -m * 2.5;
    p.hem = -m * 3;
  }
  // Waiting around, each in character: Kévin checks his watch (the planning!),
  // straightens his jacket and taps his foot; Charline checks her phone (a client!),
  // looks up thinking, and stretches her back (arms low: no gesture near the face).
  if (still > 4 && !(sim.bossActive && !sim.bossDone)) {
    const k = (still - 4) % 7;
    if (kev) {
      if (k < 2.5) {
        const up = backOut(clamp(k / 0.35));
        p.armL = 1.6 * up;
        p.armSpread = -0.4 * up;
        p.head = 0.35 * up + Math.sin(t * 4) * 0.02;
        p.mood = 'focus';
      } else if (k < 4) {
        // Tugs both jacket fronts straight, with a little shrug.
        const g = Math.sin(Math.PI * clamp((k - 2.6) / 1.2));
        const tug = Math.max(0, Math.sin((k - 2.6) * 9)) * g;
        p.armL = 0.45 * g;
        p.armR = 0.45 * g;
        p.armSpread = -0.3 * g;
        p.bob = (p.bob ?? 0) + tug * 0.4;
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
      }
    } else {
      if (k < 3) {
        const up = backOut(clamp(k / 0.35));
        const scroll = Math.max(0, Math.sin(t * 6)) ** 3;
        p.armR = 1.4 * up + scroll * 0.06;
        p.head = 0.3 * up;
        p.lean = 0.04;
        p.legL = Math.max(0, Math.sin(t * 1.5)) * 0.1;
        p.mood = 'happy';
      } else if (k < 4.5) {
        // Looks up, thinking it over, weight on one foot.
        const g = smooth(clamp((k - 3) / 0.4)) * (1 - smooth(clamp((k - 4.1) / 0.4)));
        p.head = mix(p.head ?? 0, -0.3, g);
        p.lean = mix(p.lean ?? 0, -0.05, g);
        p.legL = mix(p.legL, -0.12, g);
        p.armL = mix(p.armL, 0.15, g);
        p.armSpread = mix(p.armSpread ?? 0, 0.12, g);
      } else {
        const st = smooth(clamp((k - 4.5) / 0.6)) * (1 - smooth(clamp((k - 6.4) / 0.6)));
        // Back stretch with the arms low: hands behind her back, chest out, up on her toes.
        p.armL = mix(p.armL, -0.45, st);
        p.armR = mix(p.armR, -0.45, st);
        p.armSpread = mix(p.armSpread ?? 0, -0.12, st);
        p.lean = -0.12 * st;
        p.head = -0.2 * st;
        p.squash = -0.04 * st;
        p.bob = (p.bob ?? 0) + st * 0.8;
        if (st > 0.8) p.blink = 1;
      }
    }
  }
  return p;
}

/** Eyelids: a quick blink every few seconds. @param {number} t */
export function blinkAt(t) {
  const k = t % 3.7;
  return k < 0.14 ? Math.sin((Math.PI * k) / 0.14) : 0;
}

/** Facial expression of a boss for each phase of the duel. @type {Record<string, Pose['mood']>} */
const BOSS_MOOD = {
  intro: 'happy',
  consult: 'focus',
  hit: 'ouch',
  phase: 'focus',
  convinced: 'happy',
  sign: 'happy',
  rackDrop: 'focus',
  cables: 'focus',
  dash: 'focus',
  zones: 'happy',
  fan: 'happy',
};

/** The shared idle pose, rewritten by every idlePose() call. @type {Required<Pose>} */
const IDLE = {
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
};

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
  return out;
}
