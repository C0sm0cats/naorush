import { DT, GRAVITY, HERO, TILE, emit, fallThing, hurt, make, solid, tileAt } from './world.js';

/**
 * Rick Dangerous–style traps. Each one telegraphs (a shake, a rattle, a drip,
 * a blinking LED) and repeats exactly the same way on the second try.
 *
 * @typedef {import('./sim.js').Sim} Sim
 * @typedef {import('./world.js').Thing} Thing
 */

const LOOSE_DELAY = 0.45;
/** A hidden trapdoor gives only a crack as warning: a little more time to react. */
const HIDDEN_DELAY = 0.55;

/** Periodic traps: cycle length in seconds, offset by position so neighbours differ. */
export const PERIOD = { drawer: 2.8, sprinkler: 3.2, printer: 2.6, beamer: 3.4 };

/** Phase of a periodic trap in seconds. @param {Sim} s @param {Thing} t @param {number} period */
export const phaseOf = (s, t, period) => (s.time + (t.phase ?? 0)) % period;

/** Does the hero's box overlap a rectangle? @param {Sim} s @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
const overlaps = (s, x0, y0, x1, y1) => {
  const h = s.hero;
  return h.state !== 'dead' && h.x < x1 && h.x + HERO.w > x0 && h.y < y1 && h.y + HERO.h > y0;
};

/**
 * Weight on a loose slab (the hero's, a walker's, a rolling chair's) starts its countdown.
 * @param {Sim} s @param {number} c @param {number} r
 */
export function weigh(s, c, r) {
  if (tileAt(s, c, r) !== TILE.LOOSE) return;
  const t = s.things.find((t) => t.kind === 'loose' && t.x === c && Math.round(t.y) === r);
  if (t && t.state === 'idle') {
    t.state = 'shaking';
    t.t = 0;
    emit(s, 'crack', c + 0.5, r + 1);
  }
}

/** @param {Sim} s @param {Thing} t */
export function stepLoose(s, t) {
  if (t.state === 'shaking' && t.t > (t.hidden ? HIDDEN_DELAY : LOOSE_DELAY)) {
    t.state = 'falling';
    s.tiles[t.x + Math.round(t.y) * s.w] = TILE.EMPTY;
    emit(s, t.hidden ? 'trapdoor' : 'collapse', t.x + 0.5, t.y + 1);
  } else if (t.state === 'falling') {
    t.vy -= GRAVITY * DT;
    const ny = t.y + t.vy * DT;
    // A slab is as heavy as a ceiling panel: it shatters on the floor below and
    // hurts whoever it lands on (the hero riding it down stays on top of it).
    if (solid(s, t.x, Math.floor(ny))) {
      t.y = Math.floor(ny) + 1;
      t.state = 'gone';
      // Over solid ground it just crumbles where it was.
      if ((t.y0 ?? t.y) - t.y > 0.5) emit(s, 'smash', t.x + 0.5, t.y);
    } else t.y = ny;
    if (t.y < -3) t.state = 'gone';
    const hero = s.hero;
    if (
      Math.abs(hero.x + HERO.w / 2 - (t.x + 0.5)) < 0.75 &&
      t.y < hero.y + HERO.h &&
      t.y > hero.y + 0.5
    )
      hurt(s, hero, 'panel', t.x + 0.5);
  }
}

/** Ceiling panels and shelf binders: fall when you walk underneath. @param {Sim} s @param {Thing} t */
export function stepPanel(s, t) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  if (t.state === 'armed' && Math.abs(hx - (t.x + 0.5)) < 1.3 && hero.y < t.y && clearBelow(s, t)) {
    t.state = 'shaking';
    t.t = 0;
    emit(s, t.variant === 'binders' ? 'telegraph' : 'crack', t.x + 0.5, t.y);
  } else if (t.state === 'shaking' && t.t > 0.35) {
    t.state = 'falling';
    t.vy = 0;
    if (t.variant === 'binders') emit(s, 'binderFall', t.x + 0.5, t.y);
  } else if (t.state === 'falling') {
    t.vy -= GRAVITY * DT;
    const ny = t.y + t.vy * DT;
    if (solid(s, Math.floor(t.x + 0.5), Math.floor(ny))) {
      t.y = Math.floor(ny) + 1;
      t.state = 'broken';
      emit(s, t.variant === 'binders' ? 'binderFall' : 'smash', t.x + 0.5, t.y);
    } else t.y = ny;
    if (Math.abs(hx - (t.x + 0.5)) < 0.75 && t.y < hero.y + HERO.h && t.y + 0.3 > hero.y)
      hurt(s, hero, 'panel', t.x + 0.5);
  }
}

/**
 * Nothing solid between a panel and the hero's head: it only drops on someone it
 * can actually fall on (not on a hero walking a floor further down).
 * @param {Sim} s @param {Thing} t
 */
function clearBelow(s, t) {
  const top = Math.floor(s.hero.y + HERO.h);
  for (let r = Math.ceil(t.y) - 1; r >= top; r--) if (solid(s, t.x, r)) return false;
  return true;
}

/** What a blow (a CR, a rolling bottle or chair) does to each office worker. */
const DOWN = /** @type {Record<string, [string, string, number]>} */ ({
  colleague: ['meeting', 'meeting', 1.6],
  intern: ['stunned', 'internStun', 1.4],
  visio: ['muted', 'visioMute', 1.6],
});

/**
 * Sends an office worker to a meeting, a coffee break or mute.
 * @param {Sim} s @param {Thing} k
 * @returns {boolean} Whether it took effect (false if already down or not a worker).
 */
export function knockDown(s, k) {
  const down = DOWN[k.kind];
  if (!down || k.state === down[0]) return false;
  Object.assign(k, { state: down[0], t: 0 });
  emit(s, down[1], k.x, k.y + down[2]);
  return true;
}

/** Kinds with a body on the floor that a rolling bottle or chair runs into. */
const BODIES = new Set(['colleague', 'intern', 'visio', 'vacuum', 'chair']);

/**
 * Someone (or a chair) standing on the floor right in front of a thing rolling at x.
 * @param {Sim} s @param {Thing} t @param {number} x @param {number} reach
 */
const bodyAhead = (s, t, x, reach) =>
  s.things.find(
    (k) =>
      k !== t &&
      k.alive &&
      BODIES.has(k.kind) &&
      Math.abs(k.y - t.y) < 0.5 &&
      Math.abs(k.x - x) < reach &&
      Math.sign(k.x - t.x) === Math.sign(t.vx),
  );

/** The water-cooler bottle: rolls once the purchase order is taken. @param {Sim} s @param {Thing} t */
export function stepBottle(s, t) {
  const r = Math.round(t.y) - 1;
  if (t.state === 'waiting' || (t.state === 'rolling' && Math.abs(t.y - r - 1) < 0.01)) {
    // As heavy as anyone: it cracks a loose slab it lies or rolls on, and once its
    // support goes (a slab, a box), it falls like a rolling one does.
    weigh(s, Math.floor(t.x), r);
    if (t.state === 'waiting' && !solid(s, Math.floor(t.x), r)) t.state = 'rolling';
  }
  if (t.state !== 'rolling') return;
  const hero = s.hero;
  t.vx = Math.max(-5.2, t.vx - 9 * DT);
  const nx = t.x + t.vx * DT;
  const below = solid(s, Math.floor(nx), Math.floor(t.y - 0.05));
  // Like the hero, anyone in its way is bowled over and it rolls on; it bursts
  // against a wall, and against a chair or a robot vacuum.
  const body = bodyAhead(s, t, nx, 0.6);
  if (body) knockDown(s, body);
  if (
    solid(s, Math.floor(nx - 0.45), Math.floor(t.y + 0.3)) ||
    (body && (body.kind === 'chair' || body.kind === 'vacuum'))
  ) {
    t.state = 'burst';
    emit(s, 'splash', t.x, t.y + 0.4);
  } else t.x = nx;
  if (!below) {
    t.vy -= GRAVITY * DT;
    t.y += t.vy * DT;
    const g2 = Math.floor(t.y);
    if (solid(s, Math.floor(t.x), g2)) {
      // A full water bottle does not survive a fall: it bursts on landing.
      t.y = g2 + 1;
      t.state = 'burst';
      emit(s, 'splash', t.x, t.y + 0.4);
    }
  }
  // The bottle itself: 0.6 across, lying on its side.
  if (overlaps(s, t.x - 0.3, t.y, t.x + 0.3, t.y + 0.6))
    hurt(s, hero, 'bottle', t.x - Math.sign(t.vx));
  if (t.y < -2) t.state = 'burst';
}

/**
 * Office chair: wobbles when you come near on its floor, then rolls at you and
 * stops against the next wall or edge. It re-arms where it stopped. Its weight
 * cracks loose slabs like anyone's, and it drops when the floor goes.
 * @param {Sim} s @param {Thing} t
 */
export function stepChair(s, t) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  if (fallThing(s, t)) return;
  weigh(s, Math.floor(t.x), t.y - 1);
  if (t.state === 'idle') {
    if (t.t > 1.2 && Math.abs(hero.y - t.y) < 0.6 && Math.abs(hx - t.x) < 5.5) {
      t.state = 'wobble';
      t.t = 0;
      t.dir = Math.sign(hx - t.x) || 1;
      emit(s, 'telegraph', t.x, t.y + 1);
    }
  } else if (t.state === 'wobble') {
    if (t.t > 0.45) {
      t.state = 'rolling';
      t.vx = (t.dir ?? 1) * 6.5;
      emit(s, 'chairRoll', t.x, t.y + 0.5);
    }
  } else if (t.state === 'rolling') {
    const nx = t.x + t.vx * DT;
    const front = Math.floor(nx + Math.sign(t.vx) * 0.32);
    // Stops against a wall, an edge, or someone (or another chair) in its way:
    // they take the blow like the hero would.
    const body = bodyAhead(s, t, nx, 0.6);
    if (body) knockDown(s, body);
    if (solid(s, front, Math.floor(t.y + 0.4)) || !solid(s, front, Math.floor(t.y) - 1) || body) {
      t.state = 'idle';
      t.t = 0;
      t.vx = 0;
      emit(s, 'chairBump', t.x, t.y + 0.6);
    } else t.x = nx;
    // Only the seat and the base hurt: a jump that clears the seat clears the chair.
    // Ramming the hero stops it, as ramming anyone does.
    if (t.state === 'rolling' && overlaps(s, t.x - 0.3, t.y, t.x + 0.3, t.y + 0.7)) {
      hurt(s, hero, 'chair', t.x - Math.sign(t.vx));
      Object.assign(t, { state: 'idle', t: 0, vx: 0 });
      emit(s, 'chairBump', t.x, t.y + 0.6);
    }
  }
}

/**
 * Filing-cabinet drawer that slams out of a wall at waist height: rattle, then out.
 * `w` holds the current extension for the renderer.
 * @param {Sim} s @param {Thing} t
 */
export function stepDrawer(s, t) {
  const k = phaseOf(s, t, PERIOD.drawer);
  const prev = t.state;
  let ext = 0;
  if (k < 1.5) t.state = 'closed';
  else if (k < 1.9) t.state = 'rattle';
  else if (k < 2.6) {
    t.state = 'out';
    ext = Math.min(1, (k - 1.9) / 0.08);
  } else {
    t.state = 'closing';
    ext = 1 - (k - 2.6) / 0.2;
  }
  if (t.state !== prev && t.state === 'rattle') emit(s, 'telegraph', t.x, t.y + 0.8);
  if (t.state !== prev && t.state === 'out') emit(s, 'drawerOut', t.x, t.y + 0.8);
  t.w = ext * 1.1;
  const dir = t.dir ?? 1;
  const base = dir > 0 ? t.x - 0.5 : t.x + 0.5;
  const tip = base + dir * (t.w ?? 0);
  if (ext > 0.2 && overlaps(s, Math.min(base, tip), t.y + 0.55, Math.max(base, tip), t.y + 0.95))
    hurt(s, s.hero, 'drawer', base);
}

/**
 * Ceiling sprinkler: drips, then sprays down to the floor below.
 * y0 is the floor top, y1 the ceiling.
 * @param {Sim} s @param {Thing} t
 */
export function stepSprinkler(s, t) {
  // The water falls to the first solid thing below (boxes and slabs too, until they go).
  let floor = Math.ceil(t.y1 ?? t.y + 1) - 1;
  while (floor > 0 && !solid(s, Math.floor(t.x), floor - 1)) floor--;
  t.y0 = floor;
  const k = phaseOf(s, t, PERIOD.sprinkler);
  const prev = t.state;
  t.state = k < 1.6 ? 'off' : k < 2.2 ? 'drip' : 'on';
  if (t.state !== prev && t.state === 'drip') emit(s, 'telegraph', t.x, (t.y1 ?? t.y) - 0.3);
  if (t.state !== prev && t.state === 'on') emit(s, 'sprayOn', t.x, (t.y1 ?? t.y) - 0.3);
  if (t.state === 'on' && overlaps(s, t.x - 0.28, t.y0 ?? 0, t.x + 0.28, t.y1 ?? t.y))
    hurt(s, s.hero, 'water', t.x);
}

/** Printer that fires paper sheets along the floor: blink, then shoot. @param {Sim} s @param {Thing} t */
export function stepPrinter(s, t) {
  const k = phaseOf(s, t, PERIOD.printer);
  const prev = t.state;
  t.state = k < 2.0 ? 'idle' : 'blink';
  if (t.state !== prev && t.state === 'blink') emit(s, 'telegraph', t.x, t.y + 1);
  if (prev === 'blink' && t.state === 'idle') {
    const dir = t.dir ?? 1;
    s.things.push(make('paper', t.x + dir * 0.7, t.y + 0.35, { vx: dir * 7, state: 'fly' }));
    emit(s, 'paperShot', t.x + dir * 0.6, t.y + 0.4);
  }
}

/** @param {Sim} s @param {Thing} t */
export function stepPaper(s, t) {
  t.x += t.vx * DT;
  if (t.t > 3 || solid(s, Math.floor(t.x + Math.sign(t.vx) * 0.18), Math.floor(t.y))) {
    t.alive = false;
    emit(s, 'poof', t.x, t.y);
  } else if (overlaps(s, t.x - 0.2, t.y - 0.08, t.x + 0.2, t.y + 0.08)) {
    t.alive = false;
    hurt(s, s.hero, 'paper', t.x - Math.sign(t.vx));
  }
}

/**
 * Meeting-room projector: the screen flickers, then a KPI slide sails out in an arc.
 * @param {Sim} s @param {Thing} t
 */
export function stepBeamer(s, t) {
  const k = phaseOf(s, t, PERIOD.beamer);
  const prev = t.state;
  t.state = k < 2.6 ? 'idle' : 'flicker';
  if (t.state !== prev && t.state === 'flicker') emit(s, 'telegraph', t.x, t.y + 1.2);
  if (prev === 'flicker' && t.state === 'idle') {
    const dir = t.dir ?? -1;
    s.things.push(
      make('kpi', t.x + dir * 0.6, t.y + 1.1, { vx: dir * 5.5, vy: 6.5, state: 'fly' }),
    );
    emit(s, 'bossThrow', t.x, t.y + 1.1);
  }
}
