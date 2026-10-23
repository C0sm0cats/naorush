/**
 * Body language: poses for the heroes and the bosses, computed from the
 * simulation state. The renderer turns them into joint rotations.
 *
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

/**
 * The boss's pose for its current attack. Each wind-up is held long enough to
 * read as a warning: arm cocked for a volley, arms raised to lower the racks,
 * crouch before a leap, lean before the dash.
 * @param {Thing} b @param {number} hx Hero centre x. @param {number} t Seconds.
 * @returns {{pose: Pose, y: number, turn: number, tint: number[] | undefined, facing: number}}
 */
export function bossPose(b, hx, t) {
  const done = b.state === 'convinced' || b.state === 'sign';
  const facing = b.state === 'dash' ? (b.dir ?? 1) : done ? 1 : Math.sign(hx - b.x) || -1;
  let y = b.y;
  /** @type {Pose} */
  let pose = idlePose(t);
  let turn = 1;
  /** @type {number[] | undefined} */
  let tint;
  switch (b.state) {
    case 'intro':
      pose = {
        legL: 0.1,
        legR: -0.1,
        armL: 0.6,
        armR: 0.6,
        armSpread: 0.9,
        lean: -0.1,
        head: -0.15,
      };
      turn = 0.5;
      break;
    case 'volley': {
      const k = ((b.t + 0.05) % 0.55) / 0.55;
      pose =
        b.t < 0.5
          ? { legL: 0.3, legR: -0.3, armL: -0.3, armR: -1.3, lean: -0.1 }
          : { legL: 0.3, legR: -0.3, armL: -0.3, armR: k < 0.7 ? -1.2 * k : 2.6, lean: 0.15 };
      break;
    }
    case 'fan':
      pose =
        b.t < 0.55
          ? { legL: 0.4, legR: -0.4, armL: -1.4, armR: -1.4, armSpread: 0.6, lean: -0.15 }
          : { legL: 0.2, legR: -0.2, armL: 2.4, armR: 2.4, armSpread: 1, lean: 0.2 };
      break;
    case 'rackDrop':
    case 'cables':
      pose = {
        legL: 0.2,
        legR: -0.2,
        armL: 2.8 + Math.sin(t * 10) * 0.1,
        armR: 2.8 - Math.sin(t * 10) * 0.1,
        armSpread: 0.4,
        head: -0.3,
      };
      turn = 0.6;
      break;
    case 'teleport':
      pose = { legL: 0, legR: 0, armL: 1.6, armR: 1.6, armSpread: 1.2, head: -0.2 };
      tint = b.t < 0.55 ? [1 + b.t * 2, 1 + b.t * 2.4, 1 + b.t * 3] : undefined;
      turn = 0.5 + b.t * 4;
      break;
    case 'leap': {
      if (b.t < 0.5)
        pose = { legL: 1.1, legR: 1.1, armL: -0.6, armR: -0.6, squash: 0.18, lean: 0.3 };
      else {
        const k = Math.min(1, (b.t - 0.5) / 0.6);
        y += Math.sin(Math.PI * k) * 1.8;
        pose = { legL: 0.9, legR: 0.6, armL: 2.6, armR: 2.6, squash: k > 0.95 ? 0.18 : -0.06 };
      }
      break;
    }
    case 'dash':
      if (b.t < 0.85)
        pose = { legL: 0.8, legR: -0.6, armL: -0.9, armR: 0.9, lean: 0.45, squash: 0.08 };
      else {
        const ph = t * 22;
        pose = {
          legL: Math.sin(ph) * 1.1,
          legR: -Math.sin(ph) * 1.1,
          armL: -Math.sin(ph) * 1.1,
          armR: Math.sin(ph) * 1.1,
          lean: 0.4,
        };
      }
      break;
    case 'zones':
      pose = { legL: 0.3, legR: -0.3, armL: 1.5, armR: 2.7, armSpread: 1.1, head: -0.25 };
      turn = 0.4;
      break;
    case 'consult':
      pose = { legL: 0, legR: 0, armL: 0.2, armR: 1.1, head: 0.45, bob: Math.sin(t * 2) * 0.3 };
      turn = 0.35;
      break;
    case 'hit':
      pose = { legL: -0.3, legR: 0.4, armL: 2.2, armR: 1.8, lean: -0.35, squash: 0.08 };
      tint = b.t < 0.2 ? [1.6, 1.3, 1.2] : undefined;
      break;
    case 'phase':
      // Second wind: a power pose and a glow.
      pose = {
        legL: 0.5,
        legR: -0.5,
        armL: 2.9,
        armR: 2.9,
        armSpread: 0.9,
        head: -0.35,
        squash: -0.05,
      };
      tint = [1.2 + Math.sin(t * 18) * 0.2, 1.15, 1.3];
      turn = 0.3;
      break;
    case 'convinced':
      pose = {
        legL: 0,
        legR: 0,
        armL: 2.9 + Math.sin(t * 8) * 0.15,
        armR: 2.9 - Math.sin(t * 8) * 0.15,
        armSpread: 0.3,
        bob: Math.abs(Math.sin(t * 6)) * 1.5,
        head: -0.2,
      };
      turn = 0.3;
      break;
    case 'sign':
      // Signs the envelope, then offers a handshake.
      pose =
        b.t < 1.2
          ? { legL: 0, legR: 0, armL: 0.9, armR: 1.2 + Math.sin(t * 16) * 0.12, head: 0.4 }
          : { legL: 0, legR: 0, armL: 0.1, armR: 1.4, head: -0.05, bob: Math.sin(t * 2) * 0.3 };
      turn = b.t < 1.2 ? 0.4 : 0.8;
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
  if (h.state === 'hang')
    return { legL: 0.15, legR: -0.1, armL: Math.PI * 0.95, armR: Math.PI * 0.95, lean: 0.1 };
  if (h.state === 'climb') {
    const k = Math.min(1, h.stateTime / sim.stats.climb);
    return {
      legL: 0.8 * k,
      legR: 0.2,
      armL: Math.PI * (0.95 - k * 0.6),
      armR: Math.PI * (0.95 - k * 0.6),
      lean: 0.4 * k,
    };
  }
  if (h.state === 'dead') {
    // Surprise first, then a cartoon flop.
    if (h.stateTime < 0.35)
      return {
        legL: 0.4,
        legR: -0.4,
        armL: 2.9,
        armR: 2.9,
        armSpread: 0.8,
        squash: -0.12,
        head: -0.3,
      };
    const k = Math.min(1, (h.stateTime - 0.35) / 0.4);
    return {
      legL: 1.2 * k,
      legR: 0.6 * k,
      armL: 2.4,
      armR: 1.8,
      lean: -1.1 * k,
      squash: 0.2 * k,
      bob: -6 * k,
    };
  }
  if (sim.won) {
    const k = t * 7;
    return {
      legL: 0,
      legR: 0,
      armL: 2.9 + Math.sin(k) * 0.15,
      armR: 2.9 - Math.sin(k) * 0.15,
      bob: Math.abs(Math.sin(k)) * 2,
      head: -0.2,
    };
  }
  if (h.state === 'air') {
    const up = h.vy > 0;
    return {
      legL: up ? 0.7 : 0.3,
      legR: up ? -0.4 : -0.2,
      armL: up ? -0.8 : 0.9,
      armR: up ? 1.4 : 1.1,
      lean: 0.12,
      squash: up ? -0.06 : 0,
    };
  }
  const speed = Math.abs(h.vx);
  // Skid: still sliding one way while facing the other.
  if (speed > 2 && Math.sign(h.vx) !== h.facing)
    return { legL: 0.7, legR: -0.5, armL: -1, armR: 1.2, lean: -0.35, squash: 0.06 };
  if (speed > 0.3) {
    const ph = h.run * 2.3;
    const a = Math.min(1, speed / sim.stats.run);
    return {
      legL: Math.sin(ph) * 0.9 * a,
      legR: -Math.sin(ph) * 0.9 * a,
      armL: -Math.sin(ph) * 0.8 * a,
      armR: Math.sin(ph) * 0.8 * a,
      lean: 0.18 * a,
      bob: Math.abs(Math.cos(ph)) * 1.2 * a,
    };
  }
  // Waiting around, each in character: Kévin checks his watch (the planning!) and
  // taps his foot; Charline checks her phone (a client!) and stretches.
  if (still > 4 && !(sim.bossActive && !sim.bossDone)) {
    const k = (still - 4) % 7;
    if (sim.heroId === 'kevin') {
      if (k < 2.5) return { ...idlePose(t), armL: 1.6, armSpread: -0.4, head: 0.35, mood: 'focus' };
      if (k > 4)
        return { ...idlePose(t), legR: Math.max(0, Math.sin(t * 9)) * 0.3, armL: 0.3, armR: 0.3 };
    } else {
      if (k < 3) return { ...idlePose(t), armR: 1.4, head: 0.3, mood: 'happy' };
      if (k > 4.5)
        return { ...idlePose(t), armL: 2.9, armR: 2.9, armSpread: 0.2, lean: -0.15, squash: -0.05 };
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

/** @param {number} t @returns {Pose} */
export function idlePose(t) {
  return {
    blink: blinkAt(t),
    legL: 0,
    legR: 0,
    armL: Math.sin(t * 1.3) * 0.08,
    armR: Math.sin(t * 1.7) * 0.08,
    bob: Math.sin(t * 2.4) * 0.3,
    head: Math.sin(t * 0.7) * 0.06,
  };
}
