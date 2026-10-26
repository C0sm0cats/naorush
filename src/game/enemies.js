import * as boss from './boss.js';
import { knockDown, weigh } from './traps.js';
import {
  DT,
  GRAVITY,
  HERO,
  TILE,
  emit,
  fallThing,
  hurt,
  knock,
  make,
  solid,
  standsIn,
  tileAt,
  touches,
} from './world.js';

/**
 * Office life that stands in your way, and the CRs you throw at it.
 * Each enemy reacts to a CR differently: the colleague goes to a meeting, the
 * intern takes a coffee break, the visio manager gets muted, the robot vacuum
 * shrugs it off (jump on it instead).
 *
 * @typedef {import('./sim.js').Sim} Sim
 * @typedef {import('./world.js').Thing} Thing
 */

/**
 * How tall the director is (tiles), so a CR at head height still reaches him:
 * boss.js's bossHeight() once it lands, 1.8 until then.
 * @type {(s: Sim) => number}
 */
const bossHeight = (s) =>
  /** @type {{bossHeight?: (s: Sim) => number}} */ (/** @type {unknown} */ (boss)).bossHeight?.(
    s,
  ) ?? 1.8;

/** How tall each walker is (tiles): walls and overhangs below that turn them back. */
const HEIGHT = { colleague: 1.75, intern: 1.5, vacuum: 0.18, visio: 1.6 };

/**
 * Walks back and forth around `home` (or between walls when range is 0),
 * turning at walls (as tall as the walker) and floor edges.
 * @param {Sim} s @param {Thing} t @param {number} range
 */
function patrol(s, t, range) {
  const nx = t.x + t.vx * DT;
  const ahead = Math.floor(nx + Math.sign(t.vx) * 0.4);
  const top = Math.floor(t.y + (HEIGHT[/** @type {keyof HEIGHT} */ (t.kind)] ?? 1) - 0.01);
  let wall = false;
  for (let r = Math.floor(t.y); r <= top; r++) wall ||= solid(s, ahead, r);
  if (
    wall ||
    !solid(s, ahead, Math.floor(t.y) - 1) ||
    // Out of range only turns back when the step leads further out, so a rush or a
    // knock that carried it beyond the range walks it home instead of freezing it.
    (range > 0 &&
      Math.abs(nx - (t.home ?? t.x)) > range &&
      Math.abs(nx - (t.home ?? t.x)) > Math.abs(t.x - (t.home ?? t.x)))
  )
    t.vx = -t.vx;
  else t.x = nx;
}

/**
 * Like the hero, walkers weigh on loose slabs and fall when the floor goes.
 * @param {Sim} s @param {Thing} t
 * @returns {boolean} Whether it is airborne or lost (no walking this step).
 */
function grounded(s, t) {
  if (fallThing(s, t)) return false;
  weigh(s, Math.floor(t.x), t.y - 1);
  return true;
}

/** Colleague in a call: blocks the way and pushes you back, harmlessly. @param {Sim} s @param {Thing} t */
export function stepColleague(s, t) {
  const hero = s.hero;
  if (!grounded(s, t)) return;
  if (t.state === 'meeting') {
    if (t.t > 4.5) {
      t.state = 'walk';
      t.t = 0;
      emit(s, 'wake', t.x, t.y + 1.6);
    }
    return;
  }
  patrol(s, t, 2.5);
  // Tall enough that only a double jump clears them.
  if (standsIn(hero, t, 0.35, HEIGHT.colleague) && hero.state !== 'dead' && hero.state !== 'hang') {
    hero.vx = Math.sign(hero.x + HERO.w / 2 - t.x || 1) * 7;
    hero.vy = 5;
    hero.state = 'air';
    emit(s, 'bump', t.x, t.y + 1.2);
  }
}

/** Intern pace: strolling, then rushing once they spot you ahead. */
const INTERN_WALK = 2.2;
const INTERN_RUSH = 4.4;
/** Hurtbox height: the intern minus the head, so a fair jump clears them. */
export const INTERN_HURT = 1.2;
/** Same for the video-call manager standing at the laptop. */
export const VISIO_HURT = 1.3;

/** Kinds that keep the pile of files from landing on their tile. */
const NO_PILE = new Set(['lift', 'zone', 'rack']);

/**
 * The tile beside a stunned intern where their pile of files can land, as a step:
 * empty, on a solid floor that stays (no slab, no archive box), with room to stand
 * on top (two free tiles above), clear of the hero, of anyone or anything lying
 * there and of a lift's track.
 * @param {Sim} s @param {Thing} t The intern. @param {number} c @param {number} r
 */
function pileFits(s, t, c, r) {
  if (tileAt(s, c, r) !== TILE.EMPTY || tileAt(s, c, r - 1) !== TILE.SOLID) return false;
  if (solid(s, c, r + 1) || solid(s, c, r + 2) || tileAt(s, c, r + 1) === TILE.HAZARD) return false;
  const h = s.hero;
  if (h.state !== 'dead' && h.x < c + 1 && h.x + HERO.w > c && h.y < r + 1 && h.y + HERO.h > r)
    return false;
  for (const k of s.things) {
    if (!k.alive || k === t) continue;
    if (k.kind === 'lift') {
      const lo = Math.min(k.y0 ?? k.y, k.y1 ?? k.y),
        hi = Math.max(k.y0 ?? k.y, k.y1 ?? k.y);
      if (k.x < c + 1 && k.x + (k.w ?? 2) > c && lo < r + 3 && hi > r - 0.5) return false;
    } else if (
      !NO_PILE.has(k.kind) &&
      k.x >= c - 0.3 &&
      k.x < c + 1.3 &&
      k.y > r - 1 &&
      k.y < r + 1
    )
      return false;
  }
  return true;
}

/**
 * Where a stunned intern's pile of files lies: the column, or -1 when there is none.
 * `dir` keeps its offset from the intern's column (0 or unset: no pile); the intern
 * does not move while stunned, so the pile stays at their row.
 * @param {Thing} t
 */
export const pileColumn = (t) =>
  t.kind === 'intern' && t.state === 'stunned' && t.dir ? Math.floor(t.x) + t.dir : -1;

/**
 * The pile goes (picked up, or scattered): its tile is free again.
 * @param {Sim} s @param {Thing} t @param {number} c Its column. @param {number} r Its row.
 */
function clearPile(s, t, c, r) {
  if (c >= 0 && c < s.w && r >= 0 && r < s.h && tileAt(s, c, r) === TILE.SOLID)
    s.tiles[c + r * s.w] = TILE.EMPTY;
  t.dir = 0;
  emit(s, 'pileGone', c + 0.5, r + 0.5);
}

/**
 * Intern rushing with a pile of files: hurts on contact; a CR earns them a coffee break.
 * Spotting you ahead on their floor, they stop dead (0.4 s, a telegraph), then rush.
 * Stunned, they drop the pile beside them: a solid one-tile step for the length of
 * the break, gathered up when they get back to work.
 * @param {Sim} s @param {Thing} t
 */
export function stepIntern(s, t) {
  const hero = s.hero;
  if (t.dir) {
    // The pile only holds while its intern sits by it on firm ground; it never
    // closes on a hero (a respawn on that very spot scatters it).
    const c = Math.floor(t.x) + t.dir;
    const r = Math.round(t.y);
    const h = hero;
    const inside =
      h.state !== 'dead' &&
      h.x < c + 1 &&
      h.x + HERO.w > c &&
      h.y < r + 1 - 1e-6 &&
      h.y + HERO.h > r;
    if (
      t.state !== 'stunned' ||
      t.t > 4 ||
      t.y !== r ||
      !solid(s, Math.floor(t.x), r - 1) ||
      inside
    )
      clearPile(s, t, c, r);
  }
  if (!grounded(s, t)) return;
  if (t.state === 'stunned') {
    if (t.t > 4) {
      Object.assign(t, { state: 'walk', t: 0, vx: Math.sign(t.vx || 1) * INTERN_WALK });
      emit(s, 'wake', t.x, t.y + 1.6);
    } else if (!t.dir && t.t < DT * 2 && Number.isInteger(t.y)) {
      // Dropped the moment they are hit (a scattered pile stays scattered).
      // Files hit the floor on the side they were heading, or else behind them,
      // in the first column clear of their body.
      const ahead = Math.sign(t.vx) || 1;
      const home = Math.floor(t.x);
      for (let i = 0; i < 2; i++) {
        const side = i ? -ahead : ahead;
        const c = Math.floor(t.x + side * 0.35) + side;
        if (!pileFits(s, t, c, t.y)) continue;
        t.dir = c - home;
        s.tiles[c + t.y * s.w] = TILE.SOLID;
        emit(s, 'pile', c + 0.5, t.y + 0.5);
        break;
      }
    }
    return;
  }
  const dir = Math.sign(t.vx) || 1;
  if (t.state === 'walk') {
    patrol(s, t, 3);
    const dx = hero.x + HERO.w / 2 - t.x;
    if (
      t.t > 1.5 &&
      hero.state === 'ground' &&
      Math.abs(hero.y - t.y) < 0.6 &&
      Math.sign(dx) === Math.sign(t.vx) &&
      Math.abs(dx) < 4.5
    ) {
      Object.assign(t, { state: 'notice', t: 0 });
      emit(s, 'telegraph', t.x, t.y + 1.6);
    }
  } else if (t.state === 'notice') {
    if (t.t > 0.4) Object.assign(t, { state: 'rush', t: 0, vx: dir * INTERN_RUSH });
  } else if (t.state === 'rush') {
    const before = t.vx;
    patrol(s, t, 4.5);
    // The rush ends at a wall, an edge, the end of their beat or out of breath.
    if (t.vx !== before || t.t > 0.9)
      Object.assign(t, { state: 'walk', t: 0, vx: Math.sign(t.vx) * INTERN_WALK });
  }
  // Legs, body and the pile of files: a jump has to clear more than the knees.
  if (standsIn(hero, t, 0.3, INTERN_HURT)) knock(s, hero, t.x, 'intern');
}

/** Robot vacuum: fast, unstoppable, but its lid is a springboard. @param {Sim} s @param {Thing} t */
export function stepVacuum(s, t) {
  const hero = s.hero;
  if (!grounded(s, t)) return;
  patrol(s, t, 0);
  const hx = hero.x + HERO.w / 2;
  if (hero.state === 'dead' || Math.abs(hx - t.x) > 0.35 + HERO.w / 2) return;
  // A floor between them keeps them apart.
  if (hero.y + HERO.h <= t.y) return;
  if (hero.vy < 0 && hero.y > t.y + 0.02 && hero.y < t.y + 0.4) {
    hero.vy = s.stats.jump * 1.12;
    hero.state = 'air';
    hero.airJumps = s.stats.airJumps;
    hero.fallFrom = hero.y;
    emit(s, 'vacuumBounce', t.x, t.y + 0.3);
  } else if (hero.y < t.y + 0.25) knock(s, hero, t.x, 'vacuum');
}

/** Project manager on a video call: sends meeting invites down the corridor. @param {Sim} s @param {Thing} t */
export function stepVisio(s, t) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  if (!grounded(s, t)) return;
  if (t.state === 'muted') {
    if (t.t > 5) {
      t.state = 'idle';
      t.t = 0;
      emit(s, 'wake', t.x, t.y + 1.6);
    }
    return;
  }
  t.dir = Math.sign(hx - t.x) || -1;
  const inRange = Math.abs(hx - t.x) < 9 && Math.abs(hero.y - t.y) < 2.5 && hero.state !== 'dead';
  if (t.state === 'idle' && inRange && t.t > 2.2) {
    t.state = 'ring';
    t.t = 0;
    emit(s, 'telegraph', t.x, t.y + 1.8);
  } else if (t.state === 'ring' && t.t > 0.45) {
    s.things.push(make('invite', t.x + t.dir * 0.6, t.y + 1.15, { vx: t.dir * 6, state: 'fly' }));
    emit(s, 'invite', t.x, t.y + 1.4);
    t.state = 'idle';
    t.t = 0;
  }
  if (standsIn(hero, t, 0.3, VISIO_HURT)) knock(s, hero, t.x, 'visio');
}

/** Meeting invite and paper projectiles fly flat; KPI slides arc. @param {Sim} s @param {Thing} t */
export function stepInvite(s, t) {
  t.x += t.vx * DT;
  if (t.t > 3 || solid(s, Math.floor(t.x + Math.sign(t.vx) * 0.2), Math.floor(t.y))) {
    t.alive = false;
    emit(s, 'poof', t.x, t.y);
  } else if (s.hero.state !== 'dead' && touches(s.hero, t, 0.2, 0.15)) {
    t.alive = false;
    hurt(s, s.hero, 'invite', t.x - Math.sign(t.vx));
  }
}

/** A KPI slide thrown in an arc: hurts on contact, a CR knocks it out of the air. @param {Sim} s @param {Thing} t */
export function stepKpi(s, t) {
  t.vy -= GRAVITY * 0.55 * DT;
  t.x += t.vx * DT;
  t.y += t.vy * DT;
  if (solid(s, Math.floor(t.x), Math.floor(t.y)) || t.y < -2 || t.t > 4) {
    t.alive = false;
    emit(s, 'poof', t.x, t.y);
  } else if (s.hero.state !== 'dead' && touches(s.hero, t, 0.35, 0.35)) {
    t.alive = false;
    hurt(s, s.hero, 'kpi', t.x - Math.sign(t.vx));
  }
}

/** Shockwave running along the floor: jump over it. @param {Sim} s @param {Thing} t */
export function stepWave(s, t) {
  const hero = s.hero;
  t.x += t.vx * DT;
  if (t.t > 2.4 || solid(s, Math.floor(t.x + Math.sign(t.vx) * 0.3), Math.floor(t.y + 0.3)))
    t.alive = false;
  else if (
    hero.state !== 'dead' &&
    Math.abs(t.x - (hero.x + HERO.w / 2)) < 0.45 &&
    hero.y < t.y + 0.5
  )
    hurt(s, hero, 'wave', t.x - Math.sign(t.vx));
}

const PARRIED = new Set(['kpi', 'invite', 'paper']);

/** A thrown CR. @param {Sim} s @param {Thing} t */
export function stepCr(s, t) {
  t.x += t.vx * DT;
  const c = Math.floor(t.x),
    r = Math.floor(t.y);
  if (t.t > 1.2) {
    t.alive = false;
    emit(s, 'poof', t.x, t.y);
    return;
  }
  if (solid(s, c, r)) {
    t.alive = false;
    // Kévin's heavy CRs knock archive boxes over.
    if (tileAt(s, c, r) === TILE.CRATE && s.stats.heavy) {
      // The whole stack of archive boxes in that column comes down.
      let bottom = r;
      while (tileAt(s, c, bottom - 1) === TILE.CRATE) bottom--;
      for (let y = bottom; tileAt(s, c, y) === TILE.CRATE; y++) {
        s.tiles[c + y * s.w] = TILE.EMPTY;
        const box = s.things.find((b) => b.kind === 'crate' && b.alive && b.x === c && b.y === y);
        if (box) box.alive = false;
      }
      emit(s, 'archive', c + 0.5, r + 0.5);
    } else if (tileAt(s, c, r) === TILE.CRATE) emit(s, 'block', t.x, t.y, 'crate');
    else emit(s, 'poof', t.x, t.y);
    return;
  }
  for (const k of s.things) {
    if (!k.alive || k === t) continue;
    const dx = Math.abs(k.x - t.x);
    if (PARRIED.has(k.kind) && dx < 0.5 && Math.abs(k.y - t.y) < 0.5) {
      t.alive = k.alive = false;
      emit(s, 'parry', t.x, t.y);
      return;
    }
    // A lift's deck is solid metal: a CR flying into it stops there.
    if (
      k.kind === 'lift' &&
      t.x > k.x &&
      t.x < k.x + (k.w ?? 2) &&
      t.y > k.y - 0.3 &&
      t.y < k.y + 0.05
    ) {
      t.alive = false;
      emit(s, 'poof', t.x, t.y);
      return;
    }
    const body = dx < 0.5 && t.y > k.y && t.y < k.y + (k.kind === 'boss' ? bossHeight(s) : 1.8);
    if (!body) continue;
    if (k.kind === 'boss') {
      t.alive = false;
      // Before the duel and once convinced, a CR just bounces off his jacket.
      if (k.state !== 'idle' && k.state !== 'convinced' && k.state !== 'sign') boss.hitBoss(s, k);
      else emit(s, 'block', t.x, t.y);
      return;
    }
    if (k.kind === 'colleague' || k.kind === 'intern' || k.kind === 'visio') {
      t.alive = false;
      // Already down, an extra CR just lands on the pile.
      if (!knockDown(s, k)) emit(s, 'block', t.x, t.y);
      return;
    }
    // A CR in the way stops a charging chair.
    if (k.kind === 'chair' && t.y < k.y + 1.2) {
      t.alive = false;
      if (k.state === 'rolling' || k.state === 'wobble')
        Object.assign(k, { state: 'idle', t: 0, vx: 0 });
      emit(s, 'chairBump', k.x, k.y + 0.6);
      return;
    }
    // Rolling or still on its shelf, a full bottle bursts under a CR.
    if (
      k.kind === 'bottle' &&
      (k.state === 'rolling' || k.state === 'waiting') &&
      t.y < k.y + 1.2
    ) {
      t.alive = false;
      k.state = 'burst';
      emit(s, 'splash', k.x, k.y + 0.4);
      return;
    }
    if (k.kind === 'vacuum' && t.y < k.y + 0.5) {
      t.alive = false;
      emit(s, 'block', k.x, k.y + 0.3, 'vacuum');
      return;
    }
  }
}
