import { hitBoss } from './boss.js';
import {
  DT,
  GRAVITY,
  HERO,
  TILE,
  emit,
  hurt,
  knock,
  make,
  solid,
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
 * Walks back and forth around `home` (or between walls when range is 0),
 * turning at walls and floor edges.
 * @param {Sim} s @param {Thing} t @param {number} range
 */
function patrol(s, t, range) {
  const nx = t.x + t.vx * DT;
  const ahead = Math.floor(nx + Math.sign(t.vx) * 0.4);
  if (
    solid(s, ahead, Math.floor(t.y + 0.5)) ||
    !solid(s, ahead, Math.floor(t.y) - 1) ||
    (range > 0 && Math.abs(nx - (t.home ?? t.x)) > range)
  )
    t.vx = -t.vx;
  else t.x = nx;
}

/** Colleague in a call: blocks the way and pushes you back, harmlessly. @param {Sim} s @param {Thing} t */
export function stepColleague(s, t) {
  const hero = s.hero;
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
  if (touches(hero, t, 0.35, 1.75) && hero.state !== 'dead' && hero.state !== 'hang') {
    hero.vx = Math.sign(hero.x + HERO.w / 2 - t.x || 1) * 7;
    hero.vy = 5;
    hero.state = 'air';
    emit(s, 'bump', t.x, t.y + 1.2);
  }
}

/** Intern pace: strolling, then rushing once they spot you ahead. */
const INTERN_WALK = 2.2;
const INTERN_RUSH = 4.4;

/**
 * Intern rushing with a pile of files: hurts on contact; a CR earns them a coffee break.
 * Spotting you ahead on their floor, they stop dead (0.4 s, a telegraph), then rush.
 * @param {Sim} s @param {Thing} t
 */
export function stepIntern(s, t) {
  const hero = s.hero;
  if (t.state === 'stunned') {
    if (t.t > 4) {
      Object.assign(t, { state: 'walk', t: 0, vx: Math.sign(t.vx || 1) * INTERN_WALK });
      emit(s, 'wake', t.x, t.y + 1.6);
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
  if (touches(hero, t, 0.3, 0.8)) knock(s, hero, t.x, 'intern');
}

/** Robot vacuum: fast, unstoppable, but its lid is a springboard. @param {Sim} s @param {Thing} t */
export function stepVacuum(s, t) {
  const hero = s.hero;
  patrol(s, t, 0);
  const hx = hero.x + HERO.w / 2;
  if (hero.state === 'dead' || Math.abs(hx - t.x) > 0.35 + HERO.w / 2) return;
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
  if (touches(hero, t, 0.3, 0.8)) knock(s, hero, t.x, 'visio');
}

/** Meeting invite and paper projectiles fly flat; KPI slides arc. @param {Sim} s @param {Thing} t */
export function stepInvite(s, t) {
  t.x += t.vx * DT;
  if (t.t > 3 || solid(s, Math.floor(t.x + Math.sign(t.vx) * 0.2), Math.floor(t.y))) {
    t.alive = false;
    emit(s, 'poof', t.x, t.y);
  } else if (s.hero.state !== 'dead' && touches(s.hero, t, 0.2, 0.15)) {
    t.alive = false;
    hurt(s, s.hero, 'invite');
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
    hurt(s, s.hero, 'kpi');
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
    hurt(s, hero, 'wave');
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
    } else emit(s, tileAt(s, c, r) === TILE.CRATE ? 'block' : 'poof', t.x, t.y);
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
    const body = dx < 0.5 && t.y > k.y && t.y < k.y + 1.8;
    if (!body) continue;
    if (k.kind === 'boss' && k.state !== 'idle' && k.state !== 'convinced' && k.state !== 'sign') {
      t.alive = false;
      hitBoss(s, k);
      return;
    }
    if (k.kind === 'colleague' && k.state === 'walk') {
      t.alive = false;
      Object.assign(k, { state: 'meeting', t: 0 });
      emit(s, 'meeting', k.x, k.y + 1.6);
      return;
    }
    if (k.kind === 'intern' && k.state !== 'stunned') {
      t.alive = false;
      Object.assign(k, { state: 'stunned', t: 0 });
      emit(s, 'internStun', k.x, k.y + 1.4);
      return;
    }
    if (k.kind === 'visio' && k.state !== 'muted') {
      t.alive = false;
      Object.assign(k, { state: 'muted', t: 0 });
      emit(s, 'visioMute', k.x, k.y + 1.6);
      return;
    }
    if (k.kind === 'vacuum' && t.y < k.y + 0.5) {
      t.alive = false;
      emit(s, 'block', k.x, k.y + 0.3);
      return;
    }
  }
}
