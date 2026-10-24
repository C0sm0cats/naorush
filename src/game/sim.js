import { BOSS_DEBRIS, resetBoss, stepBoss, stepHazard } from './boss.js';
import {
  stepColleague,
  stepCr,
  stepIntern,
  stepInvite,
  stepKpi,
  stepVacuum,
  stepVisio,
  stepWave,
} from './enemies.js';
import {
  PERIOD,
  stepBeamer,
  stepBottle,
  stepChair,
  stepDrawer,
  stepLoose,
  stepPanel,
  stepPaper,
  stepPrinter,
  stepSprinkler,
} from './traps.js';
import {
  DT,
  GRAVITY,
  HERO,
  HERO_STATS,
  TILE,
  blocked,
  emit,
  hurt,
  make,
  solid,
  tileAt,
  touches,
} from './world.js';

export { DT, HERO, HERO_STATS, TILE, tileAt };

/**
 * Deterministic platforming simulation, Prince of Persia / Rick Dangerous style:
 * weighty runs, ledge grabs and climbs, telegraphed traps, office enemies and
 * boss duels. Traps live in traps.js, enemies and CRs in enemies.js, bosses in boss.js.
 *
 * @typedef {import('./world.js').Hero} Hero
 * @typedef {import('./world.js').Thing} Thing
 * @typedef {import('./world.js').Input} Input
 * @typedef {import('./world.js').SimEvent} SimEvent
 * @typedef {import('./world.js').LevelDef} LevelDef
 * @typedef {import('./world.js').HeroId} HeroId
 */

const MAX_FALL = 22;
const COYOTE = 0.09;
const BUFFER = 0.12;
const HURT_FALL = 6.5;

/** Map characters drawn as solid blocks (with their own look). */
const SOLID_STYLES = '#MBVHQY';

/**
 * @param {LevelDef} def
 * @param {HeroId} heroId
 */
export function createSim(def, heroId) {
  const h = def.map.length;
  const w = def.map[0].length;
  const tiles = new Uint8Array(w * h);
  /** @type {Thing[]} */
  const things = [];
  let start = { x: 2, y: 3 };
  /** @param {Thing['kind']} kind @param {number} x @param {number} y @param {Partial<Thing>} [extra] */
  const thing = (kind, x, y, extra = {}) => things.push(make(kind, x, y, extra));
  /** @param {number} c @param {number} r */
  const at = (c, r) => (c < 0 || c >= w || r < 0 || r >= h ? '#' : def.map[h - 1 - r][c]);
  for (let row = 0; row < h; row++)
    for (let col = 0; col < w; col++) {
      const c = def.map[row][col];
      const y = h - 1 - row;
      const i = col + y * w;
      if (SOLID_STYLES.includes(c)) tiles[i] = TILE.SOLID;
      else if (c === '-' || c === 'L') {
        tiles[i] = TILE.LOOSE;
        thing('loose', col, y, { hidden: c === 'L', y0: y });
      } else if (c === '^') tiles[i] = TILE.HAZARD;
      else if (c === 'D') tiles[i] = TILE.DOOR;
      else if (c === 'G') tiles[i] = TILE.GATE;
      else if (c === 'A') {
        tiles[i] = TILE.CRATE;
        thing('crate', col, y);
      } else if (c === 'X' && def.boss)
        thing('boss', col + 0.5, y, {
          hp: def.boss.hp,
          home: col + 0.5,
          y0: y,
          phase: 1,
          step: -1,
        });
      else if (c === 'S') start = { x: col + 0.2, y };
      else if (c === '*') thing('secret', col + 0.5, y);
      else if (c === 'k') thing('switch', col + 0.5, y);
      else if (c === 'T') thing('concert', col + 0.5, y + 0.5);
      else if (c === 'J')
        thing('beamer', col + 0.5, y, { dir: -1, phase: (col * 0.41) % PERIOD.beamer });
      else if (c === '$') thing('ticket', col + 0.5, y + 0.5);
      else if (c === 'C') thing('checkpoint', col + 0.5, y);
      else if (c === 'p') thing('reader', col + 0.5, y);
      else if (c === 'K') thing('key', col + 0.5, y + 0.5);
      else if (c === 'E') thing('exit', col + 0.5, y);
      else if (c === 'F') thing('panel', col, y, { state: 'armed' });
      else if (c === 'O') thing('panel', col, y, { state: 'armed', variant: 'binders' });
      else if (c === 'R')
        thing('bottle', col + 0.5, y, { state: 'waiting', home: col + 0.5, y0: y });
      else if (c === 'a') thing('ammo', col + 0.5, y + 0.45);
      else if (c === 'h') thing('cup', col + 0.5, y + 0.3);
      else if (c === 'n')
        thing('colleague', col + 0.5, y, { vx: 1.4, state: 'walk', home: col + 0.5 });
      else if (c === 'i')
        thing('intern', col + 0.5, y, { vx: 2.2, state: 'walk', home: col + 0.5 });
      else if (c === 'v') thing('vacuum', col + 0.5, y, { vx: 3, state: 'walk' });
      else if (c === 'z') thing('visio', col + 0.5, y, { dir: -1 });
      else if (c === 'c') thing('chair', col + 0.5, y, { home: col + 0.5 });
      else if (c === 'd') {
        // Slides out of the wall it is built into.
        const dir = SOLID_STYLES.includes(at(col - 1, y)) ? 1 : -1;
        thing('drawer', col + 0.5, y, { dir, phase: (col * 0.37) % PERIOD.drawer });
      } else if (c === 'w') {
        let r = y;
        while (r > 0 && !SOLID_STYLES.includes(at(col, r - 1))) r--;
        thing('sprinkler', col + 0.5, y, {
          y0: r,
          y1: y + 1,
          phase: (col * 0.53) % PERIOD.sprinkler,
        });
      } else if (c === 'P') {
        // Faces the longer stretch of open floor.
        /** @param {number} d */
        const run = (d) => {
          let n = 0;
          while (n < 12 && !SOLID_STYLES.includes(at(col + d * (n + 1), y))) n++;
          return n;
        };
        thing('printer', col + 0.5, y, {
          dir: run(1) >= run(-1) ? 1 : -1,
          phase: (col * 0.29) % PERIOD.printer,
        });
      }
    }
  for (const l of def.lifts ?? [])
    thing('lift', l.x, l.y, { y0: l.y, y1: l.top, w: l.w ?? 2, home: l.period ?? 5, dy: 0 });
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
    open: Boolean(def.open),
    boss: def.boss ?? null,
    bossActive: false,
    bossDone: false,
    /** Lift the hero stands on, if any. */
    onLift: /** @type {Thing | null} */ (null),
    tiles,
    things,
    hero,
    stats,
    checkpoint: { ...start },
    tickets: 0,
    secrets: 0,
    /** Hidden spots: one for each hero's strength. */
    secretTotal: things.filter((t) => t.kind === 'secret').length,
    ammo: stats.ammo,
    fireHeld: false,
    hasKey: false,
    // Levels without a badge reader have nothing to unlock.
    doorOpen: !things.some((t) => t.kind === 'reader'),
    won: false,
    time: 0,
    deaths: 0,
    gameOver: false,
    /** Relaxed mode: obstacles knock you back but cost no heart. */
    assist: false,
    /** Heart capacity (the daily challenge can lower it). */
    maxHearts: stats.hearts,
    jumpHeld: false,
    /** @type {SimEvent[]} */
    events: [],
  };
}

/** @typedef {ReturnType<typeof createSim>} Sim */

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
    hearts: s.gameOver ? s.maxHearts : hero.hearts,
    invuln: 1.5,
    fallFrom: s.checkpoint.y,
  });
  // Rearm the traps so a retry plays the same way.
  for (const t of s.things) {
    if (t.kind === 'loose' && t.state !== 'idle') {
      t.state = 'idle';
      t.t = 0;
      // Back to its own row (a fallen tile has dropped out of the map by now).
      t.y = t.y0 ?? Math.round(t.y);
      t.vy = 0;
      s.tiles[t.x + t.y * s.w] = TILE.LOOSE;
    }
    if (t.kind === 'chair') Object.assign(t, { x: t.home ?? t.x, state: 'idle', t: 0, vx: 0 });
    // Bottles go back on their shelf; with the key in hand, the chase starts over.
    if (t.kind === 'bottle')
      Object.assign(t, {
        x: t.home ?? t.x,
        y: t.y0 ?? t.y,
        vx: 0,
        vy: 0,
        state: s.hasKey ? 'rolling' : 'waiting',
      });
  }
  s.gameOver = false;
  s.onLift = null;
  // A lost boss fight starts over from the top.
  if (s.bossActive && !s.bossDone) {
    s.bossActive = false;
    for (const b of s.things) if (b.kind === 'boss') resetBoss(s, b);
  }
  s.things = s.things.filter(
    (t) => !BOSS_DEBRIS.has(t.kind) && t.kind !== 'invite' && t.kind !== 'paper',
  );
  emit(s, 'respawn', hero.x, hero.y);
}

/**
 * Looks for a ledge corner in front of the hands.
 * @param {Sim} s @param {Hero} hero
 */
function findLedge(s, hero) {
  const reach = s.stats.reach;
  const hand = hero.y + reach;
  const col = hero.facing > 0 ? Math.floor(hero.x + HERO.w + 0.2) : Math.floor(hero.x - 0.2);
  const gap = hero.facing > 0 ? col - (hero.x + HERO.w) : hero.x - (col + 1);
  if (gap > 0.35) return null;
  for (let r = Math.floor(hand) - 1; r <= Math.floor(hand) + 1; r++) {
    const top = r + 1;
    if (Math.abs(hand - top) > 0.55) continue;
    if (!solid(s, col, r) || solid(s, col, r + 1) || solid(s, col, r + 2)) continue;
    // Room to hang: the hero's own column must be clear at hang height.
    const hangY = top - reach;
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

  // Throw a CR: limited stock, refilled by ramettes of paper.
  const fire = Boolean(input.fire) && !s.fireHeld;
  s.fireHeld = Boolean(input.fire);
  if (fire && s.ammo > 0) {
    s.ammo--;
    s.things.push({
      kind: 'cr',
      x: hero.x + HERO.w / 2 + hero.facing * 0.4,
      y: hero.y + 1.05,
      vx: hero.facing * st.shot,
      vy: 0,
      state: 'fly',
      t: 0,
      alive: true,
    });
    emit(s, 'throw', hero.x + HERO.w / 2, hero.y + 1.05);
  } else if (fire) emit(s, 'empty', hero.x + HERO.w / 2, hero.y + 1.4);

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

  // Move Y. Lifts are one-way platforms: you land on their top and ride them.
  let ny = hero.y + hero.vy * DT;
  if (s.onLift) {
    const l = s.onLift;
    if (hero.x + HERO.w < l.x || hero.x > l.x + (l.w ?? 2) || hero.vy > 0) {
      s.onLift = null;
      if (hero.vy <= 0) {
        hero.state = 'air';
        hero.fallFrom = hero.y;
      }
    } else {
      hero.y = l.y;
      hero.vy = 0;
      ny = hero.y;
      hero.state = 'ground';
    }
  } else if (hero.vy <= 0) {
    for (const l of s.things) {
      if (l.kind !== 'lift') continue;
      if (
        hero.x + HERO.w > l.x + 0.05 &&
        hero.x < l.x + (l.w ?? 2) - 0.05 &&
        hero.y >= l.y - 0.02 &&
        ny <= l.y
      ) {
        if (hero.state !== 'ground')
          emit(s, hero.fallFrom - l.y > 2 ? 'land' : 'step', hero.x + HERO.w / 2, l.y);
        s.onLift = l;
        hero.y = ny = l.y;
        hero.vy = 0;
        hero.state = 'ground';
        hero.fallFrom = l.y;
        break;
      }
    }
  }
  if (s.onLift) {
    /* riding: vertical position handled by the lift */
  } else if (!blocked(s, hero.x, ny, HERO.w, HERO.h)) {
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
    if (/** @type {string} */ (hero.state) !== 'dead') hero.state = 'ground';
  } else {
    // Corner correction: clipping a ceiling edge by a little slides you past it.
    const nudge = [0.1, -0.1, 0.2, -0.2, 0.3, -0.3].find(
      (dx) => !blocked(s, hero.x + dx, ny, HERO.w, HERO.h),
    );
    if (nudge !== undefined) {
      hero.x += nudge;
      hero.y = ny;
    } else {
      hero.y = Math.ceil(ny + HERO.h) - HERO.h - 1e-4;
      hero.vy = 0;
      emit(s, 'bonk', hero.x + HERO.w / 2, hero.y + HERO.h);
    }
  }
  if (hero.state === 'air') hero.fallFrom = Math.max(hero.fallFrom, hero.y);

  // Ledge grab while airborne and not rising fast.
  if (hero.state === 'air' && hero.vy < 3 && !input.down) {
    const ledge = findLedge(s, hero);
    if (ledge) {
      hero.state = 'hang';
      hero.stateTime = 0;
      hero.ledge = ledge;
      hero.y = ledge.y - s.stats.reach;
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
  // Entering a boss arena closes the gate behind you.
  if (
    s.boss &&
    !s.bossActive &&
    !s.bossDone &&
    hero.x > s.boss.arena[0] &&
    hero.state === 'ground'
  ) {
    s.bossActive = true;
    emit(s, 'bossStart', hero.x, hero.y);
  }

  stepThings(s);
}

/** Pickups, switches and the dispatch to traps, enemies and bosses. @param {Sim} s */
function stepThings(s) {
  const hero = s.hero;
  const alive = hero.state !== 'dead';
  for (const t of s.things) {
    if (!t.alive) continue;
    t.t += DT;
    switch (t.kind) {
      case 'ticket':
        if (alive && touches(hero, t, 0.35, 0.4)) {
          t.alive = false;
          s.tickets++;
          emit(s, 'ticket', t.x, t.y);
        }
        break;
      case 'checkpoint':
        if (t.state !== 'on' && touches(hero, t, 0.4, 1.4)) {
          t.state = 'on';
          s.checkpoint = { x: t.x - HERO.w / 2, y: t.y };
          emit(s, 'checkpoint', t.x, t.y + 1);
        }
        break;
      case 'reader':
        if (t.state !== 'on' && touches(hero, t, 0.5, 1.4)) {
          t.state = 'on';
          s.doorOpen = true;
          emit(s, 'door', t.x, t.y + 1);
        }
        break;
      case 'key':
        if (alive && touches(hero, t, 0.4, 0.6)) {
          t.alive = false;
          s.hasKey = true;
          emit(s, 'key', t.x, t.y);
          for (const b of s.things)
            if (b.kind === 'bottle' && b.state === 'waiting') b.state = 'rolling';
        }
        break;
      case 'exit':
        if (!s.won && s.hasKey && touches(hero, t, 0.5, 1.4)) {
          s.won = true;
          emit(s, 'win', t.x, t.y + 1);
        }
        break;
      case 'ammo':
      case 'cup':
        // Pickups inside a boss arena come back, so a fight can never run dry.
        if (t.state === 'gone') {
          if (t.t > 5) t.state = 'idle';
        } else if (alive && touches(hero, t, 0.4, 0.5)) {
          if (t.kind === 'cup' && hero.hearts >= s.maxHearts) break;
          const arena = s.boss && t.x > s.boss.arena[0];
          if (arena) Object.assign(t, { state: 'gone', t: 0 });
          else t.alive = false;
          if (t.kind === 'ammo') {
            s.ammo = Math.min(9, s.ammo + 3);
            emit(s, 'ammo', t.x, t.y);
          } else {
            hero.hearts++;
            emit(s, 'heart', t.x, t.y);
          }
        }
        break;
      case 'concert':
        // Concert tickets for Céline Dion: a side quest Kévin takes very seriously.
        if (alive && touches(hero, t, 0.4, 0.5)) {
          t.alive = false;
          emit(s, 'concert', t.x, t.y);
        }
        break;
      case 'switch':
        // The water shut-off valve: every sprinkler in the stage stops.
        if (t.state === 'idle' && alive && touches(hero, t, 0.5, 1)) {
          t.state = 'on';
          for (const k of s.things) if (k.kind === 'sprinkler') k.state = 'dry';
          emit(s, 'switch', t.x, t.y + 1);
        }
        break;
      case 'secret':
        if (t.state === 'idle' && alive && touches(hero, t, 0.6, 1)) {
          t.state = 'found';
          s.secrets++;
          emit(s, 'secret', t.x, t.y + 1);
        }
        break;
      case 'lift': {
        // Ping-pong between y0 and y1, easing at both ends.
        const k = 0.5 - 0.5 * Math.cos((s.time * 2 * Math.PI) / (t.home ?? 5));
        const ny = (t.y0 ?? t.y) + ((t.y1 ?? t.y) - (t.y0 ?? t.y)) * k;
        t.dy = ny - t.y;
        t.y = ny;
        if (s.onLift === t) hero.y = t.y;
        break;
      }
      case 'loose':
        stepLoose(s, t);
        break;
      case 'panel':
        stepPanel(s, t);
        break;
      case 'bottle':
        stepBottle(s, t);
        break;
      case 'chair':
        stepChair(s, t);
        break;
      case 'drawer':
        stepDrawer(s, t);
        break;
      case 'sprinkler':
        if (t.state !== 'dry') stepSprinkler(s, t);
        break;
      case 'printer':
        stepPrinter(s, t);
        break;
      case 'beamer':
        stepBeamer(s, t);
        break;
      case 'paper':
        stepPaper(s, t);
        break;
      case 'colleague':
        stepColleague(s, t);
        break;
      case 'intern':
        stepIntern(s, t);
        break;
      case 'vacuum':
        stepVacuum(s, t);
        break;
      case 'visio':
        stepVisio(s, t);
        break;
      case 'invite':
        stepInvite(s, t);
        break;
      case 'kpi':
        stepKpi(s, t);
        break;
      case 'wave':
        stepWave(s, t);
        break;
      case 'cr':
        stepCr(s, t);
        break;
      case 'boss':
        stepBoss(s, t);
        break;
      case 'rack':
      case 'zone':
        stepHazard(s, t);
        break;
      default:
        break;
    }
  }
  if (s.things.some((t) => !t.alive && TRANSIENT.has(t.kind)))
    s.things = s.things.filter((t) => t.alive || !TRANSIENT.has(t.kind));
}

/** Short-lived things removed from the list once spent. */
const TRANSIENT = new Set(['cr', 'kpi', 'wave', 'paper', 'invite', 'rack', 'zone']);
