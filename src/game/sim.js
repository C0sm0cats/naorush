/**
 * Deterministic platforming simulation, Prince of Persia / Rick Dangerous style:
 * weighty runs, ledge grabs and climbs, collapsing floors, falling panels,
 * a rolling water-cooler bottle and badge-operated doors.
 *
 * World units are tiles; y points up. One step = 1/60 s.
 */

export const DT = 1 / 60;

export const TILE = Object.freeze({ EMPTY: 0, SOLID: 1, LOOSE: 2, HAZARD: 3, DOOR: 4 });

export const HERO = Object.freeze({
  w: 0.62,
  h: 1.62,
  /** How far above the feet the hands reach when grabbing. */
  reach: 2.15,
});

/** @typedef {'kevin'|'charline'} HeroId */

/** Per-hero tuning: Kévin is steady and grabs higher, Charline is faster and can double jump. */
export const HERO_STATS = {
  kevin: { run: 6.2, accel: 42, jump: 11.6, airJumps: 0, climb: 0.42, hearts: 4 },
  charline: { run: 7.0, accel: 52, jump: 11.0, airJumps: 1, climb: 0.36, hearts: 3 },
};

const GRAVITY = 40;
const MAX_FALL = 22;
const COYOTE = 0.09;
const BUFFER = 0.12;
const HURT_FALL = 6.5;
const LOOSE_DELAY = 0.45;

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
 * @typedef {Object} Thing
 * @property {'ticket'|'checkpoint'|'reader'|'key'|'exit'|'panel'|'bottle'|'colleague'|'loose'} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {string} state
 * @property {number} t
 * @property {boolean} alive
 *
 * @typedef {Object} Input
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} jump
 *
 * @typedef {{type: string, x: number, y: number}} SimEvent
 */

/**
 * @param {{map: string[]}} def
 * @param {HeroId} heroId
 */
export function createSim(def, heroId) {
  const h = def.map.length;
  const w = def.map[0].length;
  const tiles = new Uint8Array(w * h);
  /** @type {Thing[]} */
  const things = [];
  let start = { x: 2, y: 3 };
  const thing = (kind, x, y, extra = {}) =>
    things.push({ kind, x, y, vx: 0, vy: 0, state: 'idle', t: 0, alive: true, ...extra });
  for (let row = 0; row < h; row++)
    for (let col = 0; col < w; col++) {
      const c = def.map[row][col];
      const y = h - 1 - row;
      const i = col + y * w;
      if (c === '#') tiles[i] = TILE.SOLID;
      else if (c === '-') {
        tiles[i] = TILE.LOOSE;
        thing('loose', col, y);
      } else if (c === '^') tiles[i] = TILE.HAZARD;
      else if (c === 'D') tiles[i] = TILE.DOOR;
      else if (c === 'S') start = { x: col + 0.2, y };
      else if (c === '$') thing('ticket', col + 0.5, y + 0.5);
      else if (c === 'C') thing('checkpoint', col + 0.5, y);
      else if (c === 'p') thing('reader', col + 0.5, y);
      else if (c === 'K') thing('key', col + 0.5, y + 0.5);
      else if (c === 'E') thing('exit', col + 0.5, y);
      else if (c === 'F') thing('panel', col, y, { state: 'armed' });
      else if (c === 'R') thing('bottle', col + 0.5, y, { state: 'waiting', vx: 0 });
      else if (c === 'n')
        thing('colleague', col + 0.5, y, { vx: 1.4, state: 'walk', home: col + 0.5 });
    }
  const stats = HERO_STATS[heroId];
  /** @type {Hero} */
  const hero = {
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    facing: 1,
    state: 'ground',
    stateTime: 0,
    coyote: 0,
    buffer: 0,
    airJumps: stats.airJumps,
    fallFrom: start.y,
    hearts: stats.hearts,
    invuln: 0,
    ledge: { x: 0, y: 0 },
    run: 0,
  };
  return {
    heroId,
    w,
    h,
    tiles,
    things,
    hero,
    stats,
    checkpoint: { ...start },
    tickets: 0,
    hasKey: false,
    doorOpen: false,
    won: false,
    time: 0,
    deaths: 0,
    gameOver: false,
    jumpHeld: false,
    /** @type {SimEvent[]} */
    events: [],
  };
}

/** @typedef {ReturnType<typeof createSim>} Sim */

/** @param {Sim} s @param {number} c @param {number} r */
export function tileAt(s, c, r) {
  if (c < 0 || c >= s.w || r < 0) return TILE.SOLID;
  if (r >= s.h) return TILE.EMPTY;
  return s.tiles[c + r * s.w];
}

/** @param {Sim} s @param {number} c @param {number} r */
const solid = (s, c, r) => {
  const t = tileAt(s, c, r);
  return t === TILE.SOLID || t === TILE.LOOSE || (t === TILE.DOOR && !s.doorOpen);
};

/** Does the box overlap a solid tile? */
function blocked(s, x, y, w, h) {
  for (let c = Math.floor(x); c <= Math.floor(x + w - 1e-6); c++)
    for (let r = Math.floor(y); r <= Math.floor(y + h - 1e-6); r++) if (solid(s, c, r)) return true;
  return false;
}

/** @param {Sim} s @param {string} type @param {number} x @param {number} y */
const emit = (s, type, x, y) => s.events.push({ type, x, y });

/** Lethal traps (cables, the void) cost a heart and send you back to the last badge. */
const LETHAL = new Set(['cables', 'void']);

/** @param {Sim} s @param {Hero} hero @param {string} cause */
function hurt(s, hero, cause) {
  if (hero.state === 'dead') return;
  if (hero.invuln > 0 && !LETHAL.has(cause)) return;
  hero.hearts--;
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

/** @param {Sim} s */
function respawn(s) {
  const hero = s.hero;
  Object.assign(hero, {
    x: s.checkpoint.x,
    y: s.checkpoint.y,
    vx: 0,
    vy: 0,
    state: 'ground',
    stateTime: 0,
    hearts: s.gameOver ? s.stats.hearts : hero.hearts,
    invuln: 1.5,
    fallFrom: s.checkpoint.y,
  });
  // Rearm the traps so a retry plays the same way.
  for (const t of s.things) {
    if (t.kind === 'loose' && t.state !== 'idle') {
      t.state = 'idle';
      t.t = 0;
      t.y = Math.round(t.y);
      t.vy = 0;
      s.tiles[t.x + Math.round(t.y) * s.w] = TILE.LOOSE;
    }
    if (t.kind === 'bottle' && t.state !== 'waiting' && !s.hasKey)
      Object.assign(t, { state: 'waiting', vx: 0 });
  }
  s.gameOver = false;
  emit(s, 'respawn', hero.x, hero.y);
}

/**
 * Looks for a ledge corner in front of the hands.
 * @param {Sim} s @param {Hero} hero
 */
function findLedge(s, hero) {
  const hand = hero.y + HERO.reach;
  const col = hero.facing > 0 ? Math.floor(hero.x + HERO.w + 0.12) : Math.floor(hero.x - 0.12);
  const gap = hero.facing > 0 ? col - (hero.x + HERO.w) : hero.x - (col + 1);
  if (gap > 0.25) return null;
  for (let r = Math.floor(hand) - 1; r <= Math.floor(hand) + 1; r++) {
    const top = r + 1;
    if (Math.abs(hand - top) > 0.45) continue;
    if (!solid(s, col, r) || solid(s, col, r + 1) || solid(s, col, r + 2)) continue;
    // Room to hang: the hero's own column must be clear at hang height.
    const hangY = top - HERO.reach;
    if (blocked(s, hero.x, hangY, HERO.w, HERO.h)) continue;
    return { x: hero.facing > 0 ? col : col + 1, y: top };
  }
  return null;
}

/**
 * @param {Sim} s
 * @param {Input} input
 */
export function step(s, input) {
  s.events.length = 0;
  s.time += DT;
  const hero = s.hero;
  const st = s.stats;
  hero.stateTime += DT;
  hero.invuln = Math.max(0, hero.invuln - DT);
  const pressed = input.jump && !s.jumpHeld;
  s.jumpHeld = input.jump;
  if (pressed) hero.buffer = BUFFER;
  else hero.buffer = Math.max(0, hero.buffer - DT);

  if (hero.state === 'dead') {
    if (hero.stateTime > 1.3) respawn(s);
    stepThings(s);
    return;
  }

  if (hero.state === 'hang') {
    hero.vx = hero.vy = 0;
    if (input.down) {
      hero.state = 'air';
      hero.fallFrom = hero.y;
      hero.x -= hero.facing * 0.08;
    } else if ((pressed || input.up) && hero.stateTime > 0.12) {
      hero.state = 'climb';
      hero.stateTime = 0;
      emit(s, 'climb', hero.ledge.x, hero.ledge.y);
    }
    stepThings(s);
    return;
  }

  if (hero.state === 'climb') {
    const k = Math.min(1, hero.stateTime / st.climb);
    if (k >= 1) {
      hero.x = hero.facing > 0 ? hero.ledge.x + 0.05 : hero.ledge.x - HERO.w - 0.05;
      hero.y = hero.ledge.y;
      hero.state = 'ground';
      hero.stateTime = 0;
      hero.fallFrom = hero.y;
    }
    stepThings(s);
    return;
  }

  // Horizontal control with momentum.
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) hero.facing = dir;
  const target = dir * st.run;
  const accel = hero.state === 'ground' ? st.accel : st.accel * 0.6;
  if (hero.vx < target) hero.vx = Math.min(target, hero.vx + accel * DT);
  else if (hero.vx > target) hero.vx = Math.max(target, hero.vx - accel * DT);

  if (hero.state === 'ground') {
    hero.coyote = COYOTE;
    hero.airJumps = st.airJumps;
  } else hero.coyote = Math.max(0, hero.coyote - DT);

  if (hero.buffer > 0) {
    if (hero.coyote > 0) {
      hero.vy = st.jump;
      hero.state = 'air';
      hero.coyote = 0;
      hero.buffer = 0;
      hero.fallFrom = hero.y;
      emit(s, 'jump', hero.x + HERO.w / 2, hero.y);
    } else if (hero.airJumps > 0 && hero.state === 'air') {
      hero.vy = st.jump * 0.9;
      hero.airJumps--;
      hero.buffer = 0;
      hero.fallFrom = hero.y;
      emit(s, 'airjump', hero.x + HERO.w / 2, hero.y);
    }
  }
  // Variable height: releasing early cuts the rise.
  const g = hero.vy > 0 && !input.jump ? GRAVITY * 2.1 : GRAVITY;
  hero.vy = Math.max(-MAX_FALL, hero.vy - g * DT);

  // Move X.
  const nx = hero.x + hero.vx * DT;
  if (!blocked(s, nx, hero.y, HERO.w, HERO.h)) {
    hero.x = nx;
    if (hero.state === 'ground') hero.run += Math.abs(hero.vx) * DT;
  } else hero.vx = 0;

  // Move Y.
  const ny = hero.y + hero.vy * DT;
  if (!blocked(s, hero.x, ny, HERO.w, HERO.h)) {
    hero.y = ny;
    if (hero.state === 'ground' && hero.vy < 0) {
      hero.state = 'air';
      hero.fallFrom = hero.y;
    }
  } else if (hero.vy < 0) {
    hero.y = Math.floor(ny) + 1;
    const fell = hero.fallFrom - hero.y;
    if (hero.state !== 'ground') {
      emit(s, fell > 2 ? 'land' : 'step', hero.x + HERO.w / 2, hero.y);
      if (fell > HURT_FALL) hurt(s, hero, 'fall');
    }
    hero.vy = 0;
    if (hero.state !== 'dead') hero.state = 'ground';
  } else {
    hero.y = Math.ceil(ny + HERO.h) - HERO.h - 1e-4;
    hero.vy = 0;
    emit(s, 'bonk', hero.x + HERO.w / 2, hero.y + HERO.h);
  }
  if (hero.state === 'air') hero.fallFrom = Math.max(hero.fallFrom, hero.y);

  // Ledge grab while airborne and not rising fast.
  if (hero.state === 'air' && hero.vy < 3 && !input.down) {
    const ledge = findLedge(s, hero);
    if (ledge) {
      hero.state = 'hang';
      hero.stateTime = 0;
      hero.ledge = ledge;
      hero.y = ledge.y - HERO.reach;
      hero.x = hero.facing > 0 ? ledge.x - HERO.w - 0.02 : ledge.x + 0.02;
      hero.vx = hero.vy = 0;
      hero.airJumps = st.airJumps;
      emit(s, 'grab', ledge.x, ledge.y);
    }
  }

  // Standing on loose tiles starts their countdown.
  if (hero.state === 'ground') {
    const r = Math.round(hero.y) - 1;
    for (let c = Math.floor(hero.x); c <= Math.floor(hero.x + HERO.w); c++) {
      if (tileAt(s, c, r) !== TILE.LOOSE) continue;
      const t = s.things.find((t) => t.kind === 'loose' && t.x === c && Math.round(t.y) === r);
      if (t && t.state === 'idle') {
        t.state = 'shaking';
        t.t = 0;
        emit(s, 'crack', c + 0.5, r + 1);
      }
    }
  }

  // Hazard tiles under or inside the hero.
  for (let c = Math.floor(hero.x); c <= Math.floor(hero.x + HERO.w); c++)
    if (
      tileAt(s, c, Math.floor(hero.y - 0.05)) === TILE.HAZARD ||
      tileAt(s, c, Math.floor(hero.y + 0.2)) === TILE.HAZARD
    )
      hurt(s, hero, 'cables');
  if (hero.y < -2) hurt(s, hero, 'void');

  stepThings(s);
}

/** @param {Sim} s */
function stepThings(s) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  const touches = (t, rx, ry) =>
    Math.abs(t.x - hx) < rx + HERO.w / 2 && t.y + ry > hero.y && t.y - ry < hero.y + HERO.h;
  for (const t of s.things) {
    if (!t.alive) continue;
    t.t += DT;
    switch (t.kind) {
      case 'ticket':
        if (hero.state !== 'dead' && touches(t, 0.35, 0.4)) {
          t.alive = false;
          s.tickets++;
          emit(s, 'ticket', t.x, t.y);
        }
        break;
      case 'checkpoint':
        if (t.state !== 'on' && touches(t, 0.4, 1.4)) {
          t.state = 'on';
          s.checkpoint = { x: t.x - HERO.w / 2, y: t.y };
          emit(s, 'checkpoint', t.x, t.y + 1);
        }
        break;
      case 'reader':
        if (t.state !== 'on' && touches(t, 0.5, 1.4)) {
          t.state = 'on';
          s.doorOpen = true;
          emit(s, 'door', t.x, t.y + 1);
        }
        break;
      case 'key':
        if (touches(t, 0.4, 0.6)) {
          t.alive = false;
          s.hasKey = true;
          emit(s, 'key', t.x, t.y);
          for (const b of s.things)
            if (b.kind === 'bottle' && b.state === 'waiting') b.state = 'rolling';
        }
        break;
      case 'exit':
        if (!s.won && s.hasKey && touches(t, 0.5, 1.4)) {
          s.won = true;
          emit(s, 'win', t.x, t.y + 1);
        }
        break;
      case 'loose':
        if (t.state === 'shaking' && t.t > LOOSE_DELAY) {
          t.state = 'falling';
          s.tiles[t.x + Math.round(t.y) * s.w] = TILE.EMPTY;
          emit(s, 'collapse', t.x + 0.5, t.y + 1);
        } else if (t.state === 'falling') {
          t.vy -= GRAVITY * DT;
          t.y += t.vy * DT;
          if (t.y < -3) t.state = 'gone';
        }
        break;
      case 'panel':
        if (t.state === 'armed' && Math.abs(hx - (t.x + 0.5)) < 1.3 && hero.y < t.y) {
          t.state = 'shaking';
          t.t = 0;
          emit(s, 'crack', t.x + 0.5, t.y);
        } else if (t.state === 'shaking' && t.t > 0.35) {
          t.state = 'falling';
          t.vy = 0;
        } else if (t.state === 'falling') {
          t.vy -= GRAVITY * DT;
          const ny = t.y + t.vy * DT;
          if (solid(s, Math.floor(t.x + 0.5), Math.floor(ny))) {
            t.y = Math.floor(ny) + 1;
            t.state = 'broken';
            emit(s, 'smash', t.x + 0.5, t.y);
          } else t.y = ny;
          if (Math.abs(hx - (t.x + 0.5)) < 0.75 && t.y < hero.y + HERO.h && t.y + 0.3 > hero.y)
            hurt(s, hero, 'panel');
        }
        break;
      case 'bottle':
        if (t.state === 'rolling') {
          t.vx = Math.max(-5.2, t.vx - 9 * DT);
          const nx = t.x + t.vx * DT;
          const below = solid(s, Math.floor(nx), Math.floor(t.y - 0.05));
          if (solid(s, Math.floor(nx - 0.45), Math.floor(t.y + 0.3))) {
            t.state = 'burst';
            emit(s, 'splash', t.x, t.y + 0.4);
          } else t.x = nx;
          if (!below) {
            t.vy -= GRAVITY * DT;
            t.y += t.vy * DT;
            const g2 = Math.floor(t.y);
            if (solid(s, Math.floor(t.x), g2)) {
              t.y = g2 + 1;
              t.vy = 0;
            }
          }
          if (touches(t, 0.45, 0.45) && hero.y < t.y + 0.7) hurt(s, hero, 'bottle');
          if (t.y < -2) t.state = 'burst';
        }
        break;
      case 'colleague': {
        if (t.state === 'walk') {
          const nx = t.x + t.vx * DT;
          const ahead = Math.floor(nx + Math.sign(t.vx) * 0.4);
          if (
            solid(s, ahead, Math.floor(t.y + 0.5)) ||
            !solid(s, ahead, Math.floor(t.y) - 1) ||
            Math.abs(nx - t.home) > 2.5
          )
            t.vx = -t.vx;
          else t.x = nx;
          // Bumping into a colleague mid-meeting knocks you back (no damage in the slice).
          if (touches(t, 0.35, 0.8) && hero.state === 'ground' && hero.invuln <= 0) {
            hero.vx = Math.sign(hx - t.x || 1) * 7;
            hero.vy = 6;
            hero.state = 'air';
            hero.invuln = 0.4;
            emit(s, 'bump', t.x, t.y + 1.2);
          }
        }
        break;
      }
      default:
        break;
    }
  }
}
