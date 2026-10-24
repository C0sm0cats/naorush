/**
 * Shared simulation vocabulary: units, tiles, hero tuning, types and the small
 * helpers every module needs (collision, events, damage).
 *
 * World units are tiles; y points up. One step = 1/60 s.
 */

export const DT = 1 / 60;
export const GRAVITY = 40;

export const TILE = Object.freeze({
  EMPTY: 0,
  SOLID: 1,
  LOOSE: 2,
  HAZARD: 3,
  DOOR: 4,
  GATE: 5,
  /** Archive boxes: solid, and Kévin's heavy CRs knock them out. */
  CRATE: 6,
});

export const HERO = Object.freeze({
  w: 0.62,
  h: 1.62,
});

/** @typedef {'kevin'|'charline'} HeroId */

/**
 * Per-hero tuning. Kévin is steady, grabs higher and his CRs break archive boxes;
 * Charline is faster, double jumps and throws further.
 */
export const HERO_STATS = {
  kevin: {
    run: 6.2,
    accel: 42,
    jump: 11.6,
    airJumps: 0,
    /** How far above the feet the hands reach when grabbing. */
    reach: 2.4,
    climb: 0.42,
    hearts: 4,
    ammo: 6,
    shot: 13,
    /** CRs break archive boxes. */
    heavy: true,
  },
  charline: {
    run: 7.0,
    accel: 52,
    jump: 11.0,
    airJumps: 1,
    reach: 2.1,
    climb: 0.36,
    hearts: 3,
    ammo: 5,
    shot: 15,
    heavy: false,
  },
};

/**
 * @typedef {Object} Hero
 * @property {number} x Left edge.
 * @property {number} y Feet.
 * @property {number} vx
 * @property {number} vy
 * @property {number} facing
 * @property {'ground'|'air'|'hang'|'climb'|'dead'} state
 * @property {number} stateTime
 * @property {number} coyote
 * @property {number} buffer
 * @property {number} airJumps
 * @property {number} fallFrom
 * @property {number} hearts
 * @property {number} invuln
 * @property {{x: number, y: number}} ledge Hang point (ledge corner).
 * @property {number} run Distance run (for the walk cycle).
 *
 * @typedef {'ticket'|'checkpoint'|'reader'|'key'|'exit'|'panel'|'bottle'|'colleague'|'loose'
 *   |'ammo'|'cup'|'cr'|'lift'|'boss'|'kpi'|'wave'|'chair'|'drawer'|'sprinkler'|'printer'
 *   |'paper'|'crate'|'secret'|'switch'|'beamer'|'concert'|'intern'|'vacuum'|'visio'|'invite'|'rack'|'zone'} ThingKind
 *
 * @typedef {Object} Thing
 * @property {ThingKind} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {string} state
 * @property {number} t
 * @property {boolean} alive
 * @property {number} [home] Patrol centre.
 * @property {number} [y0] Lift bottom.
 * @property {number} [y1] Lift top.
 * @property {number} [w] Width in tiles (lifts, zones).
 * @property {number} [hp] Boss arguments left.
 * @property {number} [dy] Lift motion this step.
 * @property {number} [dir] Facing of fixed traps (+1 right, -1 left).
 * @property {number} [phase] Boss phase (1 to 3), trap phase offset.
 * @property {number} [step] Boss attack index.
 * @property {boolean} [hidden] Looks like ordinary floor until it gives way.
 * @property {string} [variant] Visual variant ('binders' for falling panels…).
 *
 * @typedef {Object} Input
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} jump
 * @property {boolean} [fire] Throw a meeting report (CR).
 *
 * @typedef {{type: string, x: number, y: number, cause?: string}} SimEvent
 *   `cause` tells apart events that share a type (a boss on guard vs. a crate).
 *
 * @typedef {'techServicesDirector'|'regionalDirector'} BossId
 *
 * @typedef {Object} LevelDef
 * @property {string[]} map
 * @property {boolean} [open] No ceiling: the level is open to the sky (rooftops).
 * @property {Array<{x: number, y: number, top: number, w?: number, period?: number}>} [lifts]
 * @property {{id: BossId, hp: number, arena: [number, number]}} [boss]
 */

/**
 * The parts of the simulation state the helpers rely on (see createSim for the rest).
 * @typedef {Object} World
 * @property {number} w
 * @property {number} h
 * @property {boolean} open
 * @property {Uint8Array} tiles
 * @property {boolean} doorOpen
 * @property {boolean} bossActive
 * @property {boolean} bossDone
 * @property {SimEvent[]} events
 */

/** @param {World} s @param {number} c @param {number} r */
export function tileAt(s, c, r) {
  if (c < 0 || c >= s.w) return TILE.SOLID;
  // Open stages (rooftops) have no ceiling and a gap in the floor is a drop into
  // the void; elsewhere the building's structure closes the map all round.
  if (r < 0 || r >= s.h) return s.open ? TILE.EMPTY : TILE.SOLID;
  return s.tiles[c + r * s.w];
}

/** @param {World} s @param {number} c @param {number} r */
export function solid(s, c, r) {
  const t = tileAt(s, c, r);
  return (
    t === TILE.SOLID ||
    t === TILE.LOOSE ||
    t === TILE.CRATE ||
    (t === TILE.DOOR && !s.doorOpen) ||
    (t === TILE.GATE && s.bossActive && !s.bossDone)
  );
}

/**
 * Does the box overlap a solid tile?
 * @param {World} s @param {number} x @param {number} y @param {number} w @param {number} h
 */
export function blocked(s, x, y, w, h) {
  for (let c = Math.floor(x); c <= Math.floor(x + w - 1e-6); c++)
    for (let r = Math.floor(y); r <= Math.floor(y + h - 1e-6); r++) if (solid(s, c, r)) return true;
  return false;
}

/** @param {World} s @param {string} type @param {number} x @param {number} y @param {string} [cause] */
export const emit = (s, type, x, y, cause) =>
  s.events.push(cause ? { type, x, y, cause } : { type, x, y });

/**
 * A new moving thing.
 * @param {ThingKind} kind @param {number} x @param {number} y @param {Partial<Thing>} [extra]
 * @returns {Thing}
 */
export const make = (kind, x, y, extra = {}) => ({
  kind,
  x,
  y,
  vx: 0,
  vy: 0,
  state: 'idle',
  t: 0,
  alive: true,
  ...extra,
});

/** Causes that send you straight back to the last badge. */
export const LETHAL = new Set(['cables', 'void']);

/**
 * @param {World & {deaths: number, gameOver: boolean, assist?: boolean}} s
 * @param {Hero} hero
 * @param {string} cause
 */
export function hurt(s, hero, cause) {
  if (hero.state === 'dead') return;
  if (hero.invuln > 0 && !LETHAL.has(cause)) return;
  // Relaxed mode: knocks still happen, hearts are never lost.
  if (!s.assist || LETHAL.has(cause)) hero.hearts--;
  emit(
    s,
    cause === 'fall' ? 'hardland' : LETHAL.has(cause) ? 'zap' : 'hurt',
    hero.x + HERO.w / 2,
    hero.y + 0.8,
  );
  if (hero.hearts <= 0 || LETHAL.has(cause)) {
    hero.state = 'dead';
    hero.stateTime = 0;
    hero.vx = 0;
    hero.vy = 0;
    s.deaths++;
    s.gameOver = hero.hearts <= 0;
    emit(s, 'death', hero.x + HERO.w / 2, hero.y + 0.8);
    return;
  }
  hero.invuln = 1.4;
  if (cause !== 'fall') {
    hero.vy = 7;
    hero.vx = -hero.facing * 4;
    hero.state = 'air';
  }
}

/**
 * Does a thing (centre x, base y, half extents rx / ry around y) touch the hero?
 * @param {Hero} hero @param {Thing} t @param {number} rx @param {number} ry
 */
export function touches(hero, t, rx, ry) {
  const hx = hero.x + HERO.w / 2;
  return Math.abs(t.x - hx) < rx + HERO.w / 2 && t.y + ry > hero.y && t.y - ry < hero.y + HERO.h;
}

/** Pushes the hero away from x and hurts. @param {Parameters<typeof hurt>[0]} s @param {Hero} hero @param {number} x @param {string} cause */
export function knock(s, hero, x, cause) {
  if (hero.state === 'dead' || hero.invuln > 0) return;
  hurt(s, hero, cause);
  if (/** @type {string} */ (hero.state) === 'dead') return;
  hero.vx = Math.sign(hero.x + HERO.w / 2 - x || 1) * 7;
  hero.vy = 6;
  hero.state = 'air';
}
