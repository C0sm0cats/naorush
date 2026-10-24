/**
 * Body language: poses for the heroes and the bosses, computed from the
 * simulation state. The renderer turns them into joint rotations.
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

/**
 * The boss's pose for its current attack. Each wind-up is held long enough to
 * read as a warning: arm cocked for a volley, arms raised to lower the racks,
 * crouch before a leap, lean before the dash. Breathing and a glance at the
 * hero run underneath.
 * @param {Thing} b @param {number} hx Hero centre x. @param {number} t Seconds.
 * @returns {{pose: Pose, y: number, turn: number, tint: number[] | undefined, facing: number}}
 */
export function bossPose(b, hx, t) {
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
  let pose = { ...idlePose(t), head: glance + Math.sin(t * 0.7) * 0.05 };
  let turn = 1;
  /** @type {number[] | undefined} */
  let tint;
  switch (b.state) {
    case 'intro': {
      // Opens his arms in welcome, a little bounce on the toes.
      const k = backOut(clamp(bt / 0.5));
      pose = {
        legL: 0.1,
        legR: -0.1,
        armL: 0.6 * k + Math.sin(t * 3) * 0.06,
        armR: 0.6 * k - Math.sin(t * 3) * 0.06,
        armSpread: 0.9 * k,
        lean: -0.1 * k + breath * 0.02,
        head: -0.15 + Math.sin(t * 3) * 0.04,
        bob: Math.abs(Math.sin(t * 3)) * 0.6,
      };
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
          armL: mix(-1.4, 2.4, o),
          armR: mix(-1.4, 2.4, o),
          armSpread: mix(0.6, 1, k) + settle(bt - 0.55) * 0.1,
          lean: 0.2 * (1 - k * 0.5),
          squash: -0.05 * (1 - k),
          bob: breath * 0.3,
          head: -0.1,
        };
      }
      break;
    case 'rackDrop':
    case 'cables': {
      // Arms up, lowering the racks or conducting the current, rocking side to side.
      const s = Math.sin(t * 10);
      const w = backOut(clamp(bt / 0.35));
      pose = {
        legL: 0.2 + s * 0.06,
        legR: -0.2 + s * 0.06,
        armL: 2.8 * w + s * 0.12,
        armR: 2.8 * w - s * 0.12,
        armSpread: 0.4,
        head: -0.3 + Math.cos(t * 10) * 0.04,
        bob: Math.abs(s) * 0.6,
        lean: -0.05,
      };
      turn = 0.6;
      break;
    }
    case 'teleport': {
      const k = clamp(bt / 0.55);
      pose = {
        legL: 0,
        legR: 0,
        armL: 1.6 + k * 0.6,
        armR: 1.6 + k * 0.6,
        armSpread: 1.2,
        head: -0.2,
        squash: bt < 0.55 ? -0.1 * k : 0.12 * Math.max(0, 1 - (bt - 0.55) / 0.2),
        bob: bt < 0.55 ? k * 1.5 : 0,
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
          armSpread: 0.3 * tuck,
          squash: k > 0.95 ? 0.18 : k < 0.15 ? -0.1 : -0.04,
          lean: 0.1 - tuck * 0.15,
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
        };
      }
      break;
    case 'zones': {
      // Points out the danger spots, sweeping the arm.
      const w = backOut(clamp(bt / 0.4));
      pose = {
        legL: 0.3,
        legR: -0.3,
        armL: 1.5 * w + Math.sin(t * 3) * 0.1,
        armR: 2.7 * w + Math.sin(t * 5) * 0.12,
        armSpread: 1.1 + Math.sin(t * 2.5) * 0.15,
        head: -0.25 + Math.sin(t * 2.5) * 0.05,
        bob: breath * 0.4,
      };
      turn = 0.4;
      break;
    }
    case 'consult': {
      // Reads the tablet, tapping away; looks up at the hero now and then.
      const tap = Math.max(0, Math.sin(t * 11)) ** 3;
      const peek = smooth(clamp((Math.sin(t * 0.9) - 0.75) * 5));
      pose = {
        legL: 0,
        legR: Math.max(0, Math.sin(t * 2)) * 0.08,
        armL: 0.95 + tap * 0.15,
        armSpread: -0.25,
        armR: 1.1 + Math.sin(t * 11) * 0.05,
        head: mix(0.45, glance, peek),
        lean: 0.05 + breath * 0.02,
        bob: breath * 0.3,
        blink: blinkAt(t + 1.3),
      };
      turn = 0.35;
      break;
    }
    case 'hit': {
      // Recoil with a damped wobble.
      const w = settle(bt);
      pose = {
        legL: -0.3,
        legR: 0.4,
        armL: 2.2 + w * 0.3,
        armR: 1.8 - w * 0.3,
        armSpread: 0.3,
        lean: -0.35 + w * 0.1,
        squash: 0.08 + w * 0.05,
        head: -0.25 + w * 0.15,
      };
      tint = bt < 0.2 ? [1.6, 1.3, 1.2] : undefined;
      break;
    }
    case 'phase': {
      // Second wind: a power pose and a glow.
      const w = backOut(clamp(bt / 0.4));
      pose = {
        legL: 0.5,
        legR: -0.5,
        armL: 2.9 * w + Math.sin(t * 18) * 0.04,
        armR: 2.9 * w - Math.sin(t * 18) * 0.04,
        armSpread: 0.9,
        head: -0.35,
        squash: mix(0.1, -0.05, w),
        bob: breath * 0.4,
      };
      tint = [1.2 + Math.sin(t * 18) * 0.2, 1.15, 1.3];
      turn = 0.3;
      break;
    }
    case 'convinced': {
      // Joy: hops with both arms up, chin up.
      const s = Math.sin(t * 8);
      const hop = Math.abs(Math.sin(t * 6));
      pose = {
        legL: hop * 0.25,
        legR: hop * 0.25,
        armL: 2.9 + s * 0.15,
        armR: 2.9 - s * 0.15,
        armSpread: 0.3 + hop * 0.15,
        bob: hop * 1.6,
        head: -0.2 - hop * 0.05,
        squash: (1 - hop) ** 4 * 0.08 - hop * 0.03,
      };
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
        const bow = Math.sin(Math.PI * k) * 0.18;
        pose = {
          legL: 0,
          legR: 0,
          armL: 0.1,
          armR: mix(1.2, 1.4, smooth(k)) + Math.sin(t * 5) * 0.06 * k,
          head: -0.05 + bow,
          lean: bow,
          bob: Math.sin(t * 2) * 0.3,
        };
      }
      turn = bt < 1.2 ? 0.4 : 0.8;
      break;
    default:
      break;
  }
  return {
    pose: { ...pose, mood: BOSS_MOOD[b.state], blink: blinkAt(t + 1.3) },
    y,
    turn,
    tint,
    facing,
  };
}

/**
 * @param {Sim} sim
 * @param {number} t
 * @param {number} still Seconds standing still.
 * @returns {Pose}
 */
export function heroPose(sim, t, still) {
  const h = sim.hero;
  if (h.state === 'hang') {
    // Hanging from the ledge: a gentle pendulum, legs trailing the swing.
    const s = Math.sin(t * 2.2);
    const lag = Math.sin(t * 2.2 - 0.6);
    const settleIn = Math.exp(-h.stateTime * 5) * Math.sin(h.stateTime * 16);
    return {
      legL: 0.15 + lag * 0.14 + settleIn * 0.3,
      legR: -0.08 + lag * 0.1 + settleIn * 0.2,
      armL: Math.PI * 0.95 + s * 0.03,
      armR: Math.PI * 0.95 - s * 0.03,
      lean: 0.08 + s * 0.06,
      head: -0.15 + s * 0.03,
      squash: -0.04 + settleIn * 0.04,
    };
  }
  if (h.state === 'climb') {
    // Pull-up then push-over: hands go from overhead to pressing down behind,
    // a knee kicks up onto the ledge, the torso folds over it.
    const k = Math.min(1, h.stateTime / sim.stats.climb);
    const e = smooth(k);
    const arc = Math.sin(Math.PI * k);
    const arm =
      k < 0.5
        ? mix(Math.PI * 0.95, 0.9, smooth(k / 0.5))
        : mix(0.9, -0.35, smooth((k - 0.5) / 0.5));
    return {
      legL: arc * 1.5,
      legR: Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.6 - 0.15 * e,
      armL: arm,
      armR: arm,
      armSpread: arc * 0.3,
      lean: arc * 0.75 + 0.1 * e,
      head: -0.25 * (1 - e) + arc * 0.2,
      squash: k < 0.4 ? -0.08 * Math.sin((Math.PI * k) / 0.4) : 0.08 * Math.max(0, (k - 0.8) / 0.2),
      bob: arc * 1.2,
    };
  }
  if (h.state === 'dead') {
    // Surprise first, then a cartoon flop.
    if (h.stateTime < 0.35) {
      const k = h.stateTime / 0.35;
      return {
        legL: 0.4,
        legR: -0.4,
        armL: 2.9 * backOut(Math.min(1, k * 2.5)) + Math.sin(t * 40) * 0.06,
        armR: 2.9 * backOut(Math.min(1, k * 2.5)) - Math.sin(t * 40) * 0.06,
        armSpread: 0.8,
        squash: -0.12,
        head: -0.3,
        bob: Math.sin(Math.PI * k) * 2,
      };
    }
    const k = Math.min(1, (h.stateTime - 0.35) / 0.4);
    const w = settle(Math.max(0, h.stateTime - 0.75));
    return {
      legL: 1.2 * k + w * 0.3,
      legR: 0.6 * k + w * 0.4,
      armL: 2.4 - w * 0.3,
      armR: 1.8 + w * 0.3,
      armSpread: 0.3 * k,
      lean: -1.1 * k,
      squash: 0.2 * k + w * 0.05,
      bob: -6 * k,
      head: -0.2 * k,
    };
  }
  if (sim.won) {
    // Victory hops with fist pumps.
    const k = t * 7;
    const hop = Math.abs(Math.sin(k));
    return {
      legL: hop * 0.35,
      legR: hop * 0.15,
      armL: 2.9 + Math.sin(k) * 0.2,
      armR: 2.9 - Math.sin(k) * 0.2,
      armSpread: 0.25 + hop * 0.1,
      bob: hop * 2.2,
      head: -0.2 - hop * 0.08,
      squash: (1 - hop) ** 4 * 0.1 - hop * 0.04,
    };
  }
  if (h.state === 'air') {
    // Knocked back: recoil, arms thrown forward, chin up.
    if (h.invuln > 1.1) {
      const k = clamp((h.invuln - 1.1) / 0.3);
      return {
        legL: 0.7 * k + 0.2,
        legR: 0.35 * k,
        armL: 1.9 + Math.sin(t * 30) * 0.1,
        armR: 1.5 - Math.sin(t * 30) * 0.1,
        armSpread: 0.6,
        lean: -0.5 * k,
        head: -0.35 * k,
        squash: -0.06 * k,
      };
    }
    const jump = sim.stats.jump;
    // Charline's double jump: a flip-ish tuck while rising.
    if (h.airJumps < sim.stats.airJumps && h.vy > 0) {
      const p = clamp(1 - h.vy / (jump * 0.9));
      const tuck = Math.sin(Math.PI * Math.min(1, p * 1.25));
      return {
        legL: mix(0.6, 1.9, tuck),
        legR: mix(0.2, 1.7, tuck),
        armL: mix(2.6, 1.0, tuck),
        armR: mix(2.6, 1.0, tuck),
        armSpread: 0.5 * (1 - tuck),
        lean: tuck * 0.9,
        head: tuck * 0.4,
        squash: 0.1 * tuck - 0.06 * (1 - tuck),
        bob: tuck * 2,
      };
    }
    const rise = clamp(h.vy / jump);
    const fall = clamp(-h.vy / 14);
    // Apex: a loose arm flail while weightless.
    const apex = clamp(1 - Math.abs(h.vy) / 3.5);
    const flail = Math.sin(t * 15) * 0.35 * apex;
    if (h.vy > 0)
      // Rising: leading knee drives up, back leg trails, arms swing through.
      return {
        legL: mix(0.55, 1.15, rise),
        legR: mix(-0.1, -0.45, rise),
        armL: mix(0.6, -0.9, rise) + flail,
        armR: mix(1.2, 2.1, rise) - flail,
        armSpread: 0.2 + apex * 0.3,
        lean: 0.18 * rise + 0.06,
        head: -0.12 * rise,
        squash: -0.08 * rise,
      };
    // Falling: legs straighten and reach for the floor, arms rise for balance.
    return {
      legL: mix(0.55, 0.25, fall),
      legR: mix(-0.1, 0.05, fall),
      armL: mix(0.6, 2.0, fall) + flail,
      armR: mix(1.2, 2.3, fall) - flail,
      armSpread: 0.2 + apex * 0.3 + fall * 0.4,
      lean: mix(0.06, -0.08, fall),
      head: mix(0, 0.15, fall),
      squash: -0.04 * fall,
    };
  }
  const speed = Math.abs(h.vx);
  // Skid: still sliding one way while facing the other, arms windmilling.
  if (speed > 2 && Math.sign(h.vx) !== h.facing) {
    const j = Math.sin(t * 45) * 0.05;
    return {
      legL: 0.75 + j,
      legR: -0.5 - j,
      armL: -1 + Math.sin(t * 16) * 0.25,
      armR: 1.3 - Math.sin(t * 16) * 0.25,
      armSpread: 0.3,
      lean: -0.38,
      head: -0.15,
      squash: 0.07,
    };
  }
  if (speed > 0.3) {
    const ph = h.run * 2.3;
    const a = Math.min(1, speed / sim.stats.run);
    // Walk below half speed, run above.
    const r = smooth(clamp((a - 0.35) / 0.45));
    const s = Math.sin(ph);
    // Knee drive: the forward swing goes higher and snappier than the push-off.
    /** @param {number} v */
    const leg = (v) => (v > 0 ? v * mix(0.55, 1.15, r) : v * mix(0.5, 0.75, r)) * a ** 0.4;
    // Contact (legs apart) is low, passing (legs together) and flight are high.
    const contact = Math.abs(Math.sin(ph + 0.25));
    const arms = mix(0.4, 0.95, r) * a ** 0.5;
    return {
      legL: leg(s),
      legR: leg(-s),
      armL: -Math.sin(ph - 0.3) * arms + r * 0.15,
      armR: Math.sin(ph - 0.3) * arms + r * 0.15,
      armSpread: 0.05 + r * 0.05,
      lean: mix(0.04, 0.26, r) * a,
      bob: (1 - contact) * mix(0.5, 1.8, r) * a,
      head: mix(0, -0.06, r) + Math.cos(ph * 2) * 0.04 * a,
      squash: contact ** 6 * 0.05 * r,
    };
  }
  // Waiting around, each in character: Kévin checks his watch (the planning!) and
  // taps his foot; Charline checks her phone (a client!) and stretches.
  if (still > 4 && !(sim.bossActive && !sim.bossDone)) {
    const k = (still - 4) % 7;
    if (sim.heroId === 'kevin') {
      if (k < 2.5) {
        const up = backOut(clamp(k / 0.35));
        return {
          ...idlePose(t),
          armL: 1.6 * up,
          armSpread: -0.4 * up,
          head: 0.35 * up + Math.sin(t * 4) * 0.02,
          mood: 'focus',
        };
      }
      if (k > 4) {
        const tap = Math.max(0, Math.sin(t * 9));
        return {
          ...idlePose(t),
          legR: tap * 0.3,
          armL: 0.3,
          armR: 0.3,
          armSpread: -0.15,
          bob: tap * 0.3,
          head: -0.08 + tap * 0.03,
        };
      }
    } else {
      if (k < 3) {
        const up = backOut(clamp(k / 0.35));
        const scroll = Math.max(0, Math.sin(t * 6)) ** 3;
        return {
          ...idlePose(t),
          armR: 1.4 * up + scroll * 0.06,
          head: 0.3 * up,
          lean: 0.04,
          legL: Math.max(0, Math.sin(t * 1.5)) * 0.1,
          mood: 'happy',
        };
      }
      if (k > 4.5) {
        const st = smooth(clamp((k - 4.5) / 0.6)) * (1 - smooth(clamp((k - 6.4) / 0.6)));
        return {
          ...idlePose(t),
          armL: mix(0, 2.9, st),
          armR: mix(0, 2.9, st),
          armSpread: 0.2 * st,
          lean: -0.15 * st,
          head: -0.2 * st,
          squash: -0.05 * st,
          blink: st > 0.8 ? 1 : blinkAt(t),
        };
      }
    }
  }
  return idlePose(t);
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

/** Standing: breathing, a slight weight shift, a wandering glance. @param {number} t @returns {Pose} */
export function idlePose(t) {
  const breath = Math.sin(t * 2.4);
  const shift = Math.sin(t * 0.5);
  return {
    blink: blinkAt(t),
    legL: shift * 0.03,
    legR: -shift * 0.03,
    armL: Math.sin(t * 1.3) * 0.08 + breath * 0.02,
    armR: Math.sin(t * 1.7) * 0.08 + breath * 0.02,
    armSpread: 0.04 + breath * 0.02,
    bob: breath * 0.3,
    lean: breath * 0.015,
    head: Math.sin(t * 0.7) * 0.06 - breath * 0.01,
    squash: breath * 0.008,
  };
}
