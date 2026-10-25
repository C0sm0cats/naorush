import { DT, GRAVITY, HERO, TILE, emit, hurt, knock, make, solid } from './world.js';

/**
 * Boss duels. Both directors run a scripted sequence of telegraphed attacks,
 * then stop to consult PRIMO: the only moment a CR gets through. As their
 * conviction drops they move on to new phases with new attacks. Once
 * convinced they sign the NAO envelope: everyone wins.
 *
 * Julien (Technologies & Services) runs his infrastructure: KPI volleys,
 * server racks dropped on the hero's shadow, live cable runs; once he fails
 * over to the backup site, a teleport, a load balancer that lowers racks on
 * every other slot then on the others, and a cable failover where the backup
 * circuit goes live right after the main one.
 * Rodolphe (Région Ouest) puts on a show: fans of slides, stage-shaking leaps
 * and spotlight zones; then the regional tour dash across the stage and an
 * encore where the spotlight comes back to the spot it had spared; and for
 * his last argument a grand finale: the spotlight follows the hero three
 * times, then one last stage-shaking leap.
 *
 * Fair by construction: every attack is announced at least 0.6 s before it can
 * hurt, and an attack only ends once everything it threw is spent, so a consult
 * window is always calm; its length is `consult[phase - 1]`. Each sequence
 * holds rounds that end on a consult: after a successful CR the director moves
 * on to the next round, so the fight never repeats itself. A step written
 * 'state:variant' plays the state's pose with a twist (kept in `b.variant`).
 *
 * The arena changes with the fight: from the second phase two risers come in
 * (Julien's server racks rise out of the raised floor, Rodolphe's trusses come
 * down from the rig) and make a step up out of the floor attacks, which then
 * light their tops too. A director only ever stands where he has room over his
 * head: Julien walks between his console and his racks, and Rodolphe only
 * leaps where four free tiles open above him, walking there first if needed.
 *
 * @typedef {import('./sim.js').Sim} Sim
 * @typedef {import('./world.js').Thing} Thing
 * @typedef {import('./world.js').BossId} BossId
 */

/**
 * `phases[i]`: conviction left when phase i + 2 starts. `seq[i]` and
 * `consult[i]`: the attack sequence and consult length (s) of phase i + 1.
 * @type {Record<BossId, {phases: number[], seq: string[][], consult: number[]}>}
 */
export const PATTERNS = {
  techServicesDirector: {
    phases: [2],
    seq: [
      ['volley', 'rackDrop', 'consult', 'volley', 'cables', 'consult'],
      [
        'teleport',
        'volley',
        'rackDrop:balancer',
        'consult',
        'teleport',
        'cables:failover',
        'consult',
      ],
    ],
    consult: [2.8, 2.5],
  },
  regionalDirector: {
    phases: [3, 1],
    seq: [
      ['fan', 'leap', 'consult', 'zones', 'fan', 'consult'],
      ['dash', 'zones', 'leap', 'consult', 'dash', 'fan', 'zones:encore', 'consult'],
      ['zones:follow', 'leap', 'consult'],
    ],
    consult: [2.6, 2.4, 3],
  },
};

/** How long a floor zone warns before it strikes, and how long it stays live (s). */
export const WARN = 1;
export const LIVE = 0.65;
/** When the second wave of an alternating attack is warned: once the first has died down. */
const SWAP = WARN + LIVE + 0.1;

/** How tall each director stands (tiles): what walking into him and his CR target measure. */
export const BOSS_HEIGHT = { techServicesDirector: 2.0, regionalDirector: 2.1 };
/** @param {Sim} s */
export const bossHeight = (s) => BOSS_HEIGHT[s.boss?.id ?? 'techServicesDirector'];

/** Half the width of a director's footprint (tiles). */
const BODY = 0.4;
/** Half the width a leap sweeps (arms out): what must stay clear above him (tiles). */
export const LEAP_HALF = 0.75;
/** Free tiles a director keeps above his head where he stands: a leap needs all four. */
export const HEADROOM = 4;
/** Free tiles he needs to walk somewhere (his height). */
const PASS = 3;
/** Walking pace between stations (tiles/s). */
const WALK = 3.5;
/** Julien's server racks, from the arena floor's start (his console is his home spot). */
const RACKS = 6.5;
/** « Sans filet »: PRIMO consults this much shorter (s). */
export const HARDCORE_CONSULT = 0.4;

/**
 * Phase platforms (risers). `cols`: first column of each, from the arena floor's
 * start; `from`: the phase they come in. Once in place each is a 2×1 solid block
 * (and a lift deck on top, so it carries whoever stands on it while it moves).
 * Julien's racks rise out of the floor; Rodolphe's trusses come down from the rig.
 * @type {Record<BossId, {from: number, cols: number[], w: number, rise: boolean}>}
 */
export const RISERS = {
  techServicesDirector: { from: 2, cols: [2, 13], w: 2, rise: true },
  regionalDirector: { from: 2, cols: [2, 13], w: 2, rise: false },
};
/** Rise and drop speeds of the risers (tiles/s), and the rig height trusses come from. */
const RISE = 0.9;
const DROP = 6;
const RIG = 8;

/** Things a boss leaves around, cleared on respawn and phase change. */
export const BOSS_DEBRIS = new Set(['kpi', 'wave', 'rack', 'zone']);

/** @param {Sim} s @param {Thing} b */
const pattern = (s, b) => PATTERNS[s.boss?.id ?? 'techServicesDirector'].seq[(b.phase ?? 1) - 1];

/**
 * Walkable floor of the arena: `arena` holds the gate column and the last free
 * column, so the floor runs from just past the gate to the far wall.
 * @param {Sim} s @param {Thing} b @returns {[number, number]}
 */
export function arenaFloor(s, b) {
  const [x0, x1] = s.boss?.arena ?? [b.x - 8, b.x + 8];
  return [x0 + 1, x1 + 1];
}

/**
 * How long the director consults PRIMO in his current phase (s): 0.4 s less in « Sans filet ».
 * @param {Sim} s @param {Thing} b
 */
export function consultLength(s, b) {
  const base = PATTERNS[s.boss?.id ?? 'techServicesDirector'].consult[(b.phase ?? 1) - 1] ?? 1;
  return s.hardcore ? base - HARDCORE_CONSULT : base;
}

/** @param {Thing} t */
const isRiser = (t) => t.kind === 'lift' && t.variant === 'riser';

/** Does a riser (in place or on its way) stand over column c? @param {Sim} s @param {number} c */
function riserOver(s, c) {
  for (const t of s.things)
    if (isRiser(t) && t.alive && c >= t.x && c < t.x + (t.w ?? 2)) return true;
  return false;
}

/**
 * Room for a director at x: `rows` free tiles above the floor across his
 * footprint (`half` each side), and no riser over it.
 * @param {Sim} s @param {number} x @param {number} floor @param {number} rows @param {number} [half]
 */
function roomAt(s, x, floor, rows, half = BODY) {
  for (let c = Math.floor(x - half); c <= Math.floor(x + half); c++) {
    if (riserOver(s, c)) return false;
    for (let r = floor; r < floor + rows; r++) if (solid(s, c, r)) return false;
  }
  return true;
}

/** Room for a leap from x: four free tiles overhead, arms' width. @param {Sim} s @param {number} x @param {number} floor */
const leapRoom = (s, x, floor) => roomAt(s, x, floor, HEADROOM, LEAP_HALF);

/**
 * Can he walk from a to b along the floor (head clear all the way, and, with
 * `hero`, without walking into the hero)?
 * @param {Sim} s @param {number} a @param {number} b @param {number} floor @param {boolean} hero
 */
function walkable(s, a, b, floor, hero) {
  if (hero && s.hero.state !== 'dead' && s.hero.y < floor + 2.5) {
    const hx = s.hero.x + HERO.w / 2;
    if (hx > Math.min(a, b) - 1.3 && hx < Math.max(a, b) + 1.3 && Math.abs(a - b) > 0.01)
      return false;
  }
  const d = Math.sign(b - a);
  if (!d) return true;
  // Out of a cramped spot he stoops until his head is clear again; never through a wall or a riser.
  let stooping = !roomAt(s, a, floor, PASS);
  for (let x = a + d * 0.25; d * (b - x) > -0.25; x += d * 0.25) {
    const p = d > 0 ? Math.min(x, b) : Math.max(x, b);
    if (roomAt(s, p, floor, PASS)) stooping = false;
    else if (!stooping || !roomAt(s, p, floor, 1)) return false;
  }
  return true;
}

/**
 * The spot nearest to x where a director has his full headroom, within the
 * arena; with `from`, one he can walk to from there (around the hero when
 * `hero` is set). Ties go towards the middle of the arena. `half`: the width
 * kept clear overhead on each side ({@link LEAP_HALF} for a leap).
 * @param {Sim} s @param {Thing} b @param {number} x @param {number} [from] @param {boolean} [hero]
 * @param {number} [half]
 * @returns {number | undefined}
 */
export function spotNear(s, b, x, from, hero = false, half = BODY) {
  const [x0, x1] = arenaFloor(s, b);
  const floor = b.y0 ?? b.y;
  const inward = x <= (x0 + x1) / 2 ? 1 : -1;
  for (let d = 0; d <= x1 - x0; d += 0.5)
    for (const sx of d ? [x + inward * d, x - inward * d] : [x]) {
      if (sx - BODY < x0 || sx + BODY > x1) continue;
      if (!roomAt(s, sx, floor, HEADROOM, half)) continue;
      if (from === undefined || walkable(s, from, sx, floor, hero)) return sx;
    }
  return undefined;
}

/** Where Julien's failover takes him: the free spot nearest the far side. @param {Sim} s @param {Thing} b */
export function teleportTarget(s, b) {
  const [x0, x1] = arenaFloor(s, b);
  const want = b.x > (x0 + x1) / 2 ? x0 + 4 : x1 - 4;
  return spotNear(s, b, want) ?? want;
}

/**
 * Where the director goes before a step: Julien sends the racks down from his
 * console and runs the cables from his server racks; anyone leaps only with
 * his full headroom. Everything else is played where he stands.
 * @param {Sim} s @param {Thing} b @param {string} step
 */
function station(s, b, step) {
  const state = step.split(':')[0];
  const floor = b.y0 ?? b.y;
  if (state === 'leap')
    return leapRoom(s, b.x, floor) ? b.x : (spotNear(s, b, b.x, b.x, true, LEAP_HALF) ?? b.x);
  if ((s.boss?.id ?? 'techServicesDirector') === 'techServicesDirector' && (b.phase ?? 1) === 1) {
    const [x0] = arenaFloor(s, b);
    const want = state === 'rackDrop' ? b.home : state === 'cables' ? x0 + RACKS : undefined;
    if (want !== undefined) return spotNear(s, b, want, b.x, true) ?? b.x;
  }
  return b.x;
}

/** @param {Sim} s @param {Thing} b @param {string} step 'state' or 'state:variant'. */
function enter(s, b, step) {
  const [state, variant] = step.split(':');
  b.state = state;
  b.variant = variant;
  b.t = 0;
  b.vx = 0;
  if (state === 'consult') emit(s, 'consult', b.x, b.y + 2.2);
  else if (state !== 'hit' && state !== 'phase' && state !== 'walk')
    emit(s, 'telegraph', b.x, b.y + 2.3);
}

/** Plays the current step, walking to its station first. @param {Sim} s @param {Thing} b */
function begin(s, b) {
  const step = pattern(s, b)[b.step ?? 0];
  if (Math.abs(station(s, b, step) - b.x) > 0.05) enter(s, b, 'walk');
  else enter(s, b, step);
}

/** @param {Sim} s @param {Thing} b */
function nextAttack(s, b) {
  const seq = pattern(s, b);
  b.step = ((b.step ?? -1) + 1) % seq.length;
  begin(s, b);
}

/** Is the boss's timer crossing `at` during this step? @param {Thing} b @param {number} time */
const at = (b, time) => b.t >= time && b.t - DT < time;

/** Has everything of this kind landed or faded? @param {Sim} s @param {string} kind */
const spent = (s, kind) => !s.things.some((t) => t.alive && t.kind === kind);

/** @param {Sim} s @param {Thing} b @param {number} vx @param {number} vy */
function throwKpi(s, b, vx, vy) {
  const face = Math.sign(vx) || 1;
  s.things.push(make('kpi', b.x + face * 0.5, b.y + 1.7, { vx, vy, state: 'fly' }));
  emit(s, 'bossThrow', b.x, b.y + 1.8);
}

/**
 * A floor zone that warns, then strikes whoever stands on it.
 * @param {Sim} s @param {number} x @param {number} y @param {number} w @param {string} variant
 * @param {Partial<Thing>} [extra]
 */
const zone = (s, x, y, w, variant, extra = {}) =>
  s.things.push(make('zone', x, y, { w, state: 'warn', variant, ...extra }));

/** The floor's top at column c: one up where a riser stands. @param {Sim} s @param {number} c @param {number} floor */
const surface = (s, c, floor) =>
  solid(s, c, floor) && !solid(s, c, floor + 1) ? floor + 1 : floor;

/**
 * A zone over a stretch of the arena floor that also covers the risers'
 * tops: split wherever the floor steps up.
 * @param {Sim} s @param {number} x @param {number} floor @param {number} w @param {string} variant
 */
function floorZone(s, x, floor, w, variant) {
  let start = x;
  let y = surface(s, Math.floor(x), floor);
  for (let c = Math.floor(x) + 1; c < x + w; c++) {
    const yc = surface(s, c, floor);
    if (yc === y) continue;
    zone(s, start, y, c - start, variant);
    start = c;
    y = yc;
  }
  zone(s, start, y, x + w - start, variant);
}

/**
 * Brings the phase's risers in (Julien's racks rise from below the floor,
 * Rodolphe's trusses come down from the rig).
 * @param {Sim} s @param {Thing} b
 */
function addRisers(s, b) {
  const r = RISERS[s.boss?.id ?? 'techServicesDirector'];
  if ((b.phase ?? 1) !== r.from) return;
  const [x0] = arenaFloor(s, b);
  const floor = b.y0 ?? b.y;
  for (const c of r.cols) {
    const y = r.rise ? floor : floor + RIG;
    s.things.push(
      make('lift', x0 + c, y, {
        w: r.w,
        y0: y,
        y1: y,
        dy: 0,
        home: 1,
        variant: 'riser',
        dir: r.rise ? 1 : -1,
        state: 'moving',
      }),
    );
  }
}

/** Sets a riser's two tiles solid or clears them. @param {Sim} s @param {Thing} t @param {number} floor @param {boolean} on */
function riserTiles(s, t, floor, on) {
  for (let c = t.x; c < t.x + (t.w ?? 2); c++)
    s.tiles[c + floor * s.w] = on ? TILE.SOLID : TILE.EMPTY;
}

/** Does the hero overlap a riser's block or stand on its top? @param {Sim} s @param {Thing} t @param {number} floor */
function heroOn(s, t, floor) {
  const h = s.hero;
  const over = h.x + HERO.w > t.x && h.x < t.x + (t.w ?? 2);
  return over && h.state !== 'dead' && h.y < floor + 1.05 + (s.onLift === t ? 1 : 0);
}

/**
 * Moves the risers: in until they settle (a truss waits above the hero's head,
 * a rack lifts him), out once the director is convinced and nobody stands on them.
 * @param {Sim} s @param {number} floor
 */
function stepRisers(s, floor) {
  const top = floor + 1;
  for (const t of s.things) {
    if (!isRiser(t) || !t.alive) continue;
    const up = (t.dir ?? 1) > 0;
    let y = t.y;
    if (t.state === 'moving') {
      if (up) y = Math.min(top, y + RISE * DT);
      else {
        y = Math.max(top, y - DROP * DT);
        const h = s.hero;
        // Never down on the hero: it waits just above his head.
        if (h.x + HERO.w > t.x && h.x < t.x + (t.w ?? 2) && h.y < t.y - 0.5)
          y = Math.max(y, Math.min(t.y, h.y + HERO.h + 1.02));
      }
      const h = s.hero;
      const inside =
        h.x + HERO.w > t.x && h.x < t.x + (t.w ?? 2) && h.y < top - 0.01 && h.y + HERO.h > floor;
      if (y === top && !inside) {
        riserTiles(s, t, floor, true);
        Object.assign(t, { state: 'set', t: 0 });
        emit(s, up ? 'riserUp' : 'riserDown', t.x + (t.w ?? 2) / 2, top);
      }
    } else if (t.state === 'set' && s.bossDone && !heroOn(s, t, floor)) {
      riserTiles(s, t, floor, false);
      Object.assign(t, { state: 'away', t: 0 });
    } else if (t.state === 'away') {
      y = up ? y - RISE * DT : y + DROP * DT;
      if (up ? y <= floor : y >= floor + RIG) t.alive = false;
    }
    t.y0 = t.y1 = y;
  }
  if (s.things.some((t) => isRiser(t) && !t.alive)) {
    if (s.onLift && !s.onLift.alive) s.onLift = null;
    s.things = s.things.filter((t) => !isRiser(t) || t.alive);
  }
}

/** Takes the risers away at once (the duel starts over). @param {Sim} s @param {Thing} b */
function dropRisers(s, b) {
  const floor = b.y0 ?? b.y;
  for (const t of s.things) if (isRiser(t) && t.state === 'set') riserTiles(s, t, floor, false);
  s.things = s.things.filter((t) => !isRiser(t));
  if (s.onLift && isRiser(s.onLift)) s.onLift = null;
}

/**
 * @param {Sim} s
 * @param {Thing} b
 */
export function stepBoss(s, b) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  const [x0, x1] = arenaFloor(s, b);
  const mid = (x0 + x1) / 2;
  const face = Math.sign(hx - b.x) || -1;
  const floor = b.home === undefined ? b.y : (b.y0 ?? b.y);
  /** Alternates with every argument won and every retry. */
  const flip = Math.floor((b.hp ?? 0) + s.deaths) % 2;
  switch (b.state) {
    case 'idle':
      if (s.bossActive) {
        b.phase = 1;
        b.step = -1;
        b.y0 = b.y;
        enter(s, b, 'intro');
      }
      break;
    case 'intro':
      if (b.t > 1.8) nextAttack(s, b);
      break;
    case 'walk': {
      // To the next step's station, at a walk; the step starts on arrival.
      const step = pattern(s, b)[b.step ?? 0];
      const to = station(s, b, step);
      const d = to - b.x;
      if (Math.abs(d) <= WALK * DT || b.t > 3) {
        if (Math.abs(d) <= WALK * DT) b.x = to;
        b.vx = 0;
        // Never a leap without headroom: if there is no way to it, the next move comes first.
        if (step.startsWith('leap') && !leapRoom(s, b.x, floor)) nextAttack(s, b);
        else enter(s, b, step);
      } else {
        b.vx = Math.sign(d) * WALK;
        b.x += b.vx * DT;
      }
      break;
    }
    case 'volley':
      // Three throws, each released at the end of the arm's wind-up (0.89 s for the first).
      for (const k of [0.89, 1.44, 1.99]) if (at(b, k)) throwKpi(s, b, hx - b.x, 5.5);
      if (b.t > 2.4 && spent(s, 'kpi')) nextAttack(s, b);
      break;
    case 'rackDrop':
      if (b.variant === 'balancer') {
        // Load balancer: shadows on every other slot of the stage, then on the
        // others once the first batch has landed. Step aside, then step back.
        const batch = at(b, DT) ? 0 : at(b, 1.55) ? 1 : -1;
        if (batch >= 0) {
          // Racks every 3 tiles, the second batch offset by half a step: standing
          // still is never safe, stepping into the first batch's slots is.
          const off = ((flip + batch) % 2) * 1.5;
          for (let x = x0 + 0.5 + off; x <= x1 - 0.5; x += 3)
            if (Math.abs(x - b.x) > 1.2) {
              s.things.push(make('rack', x, floor, { state: 'warn', y0: floor }));
              underPlatform(s, x, floor);
            }
          if (batch) emit(s, 'telegraph', b.x, b.y + 2.3);
        }
        if (b.t > 3.3 && spent(s, 'rack')) nextAttack(s, b);
        break;
      }
      if (at(b, DT)) {
        // Shadows on the floor first, then the racks come down on them.
        for (const dx of [0, -3, 3]) {
          const x = Math.max(x0 + 0.5, Math.min(x1 - 0.5, hx + dx));
          s.things.push(make('rack', x, floor, { state: 'warn', y0: floor }));
        }
      }
      if (b.t > 2.2 && spent(s, 'rack')) nextAttack(s, b);
      break;
    case 'teleport':
      if (at(b, 0.55)) {
        // Fails over to the other side of the room, never onto the hero.
        const x = teleportTarget(s, b);
        if (Math.abs(hx - x) > 2) {
          b.x = x;
          emit(s, 'teleport', b.x, b.y + 1);
        }
      }
      if (b.t > 1) nextAttack(s, b);
      break;
    case 'cables': {
      // The floor is cut into two-tile runs; every other run goes live. On
      // failover the backup circuit (the other runs) is warned the moment the
      // main one dies down: step back onto the runs that just went dark.
      const failover = b.variant === 'failover';
      /** @param {number} odd */
      const circuit = (odd) => {
        for (let x = x0, i = 0; x < x1; x += 2, i++)
          if (i % 2 === odd) floorZone(s, x, floor, Math.min(2, x1 - x), 'cable');
        emit(s, 'cableWarn', mid, floor);
      };
      if (at(b, DT)) circuit(flip);
      if (failover && at(b, SWAP)) circuit(1 - flip);
      if (b.t > (failover ? 2 : 1) && spent(s, 'zone')) nextAttack(s, b);
      break;
    }
    case 'fan':
      if (at(b, 0.6)) {
        for (let i = 0; i < 5; i++) throwKpi(s, b, face * (2.2 + i * 1.6), 5 + (i % 2) * 2.5);
        emit(s, 'fan', b.x, b.y + 1.8);
      }
      if (b.t > 1.6 && spent(s, 'kpi')) nextAttack(s, b);
      break;
    case 'leap':
      // Crouch (telegraph), jump, slam: two shockwaves run outwards.
      if (at(b, DT) && !leapRoom(s, b.x, floor)) {
        // No room over his head: no leap from here.
        nextAttack(s, b);
        break;
      }
      if (at(b, 1.1)) {
        for (const dir of [-1, 1])
          s.things.push(make('wave', b.x + dir * 0.6, floor, { vx: dir * 6, state: 'run' }));
        emit(s, 'slam', b.x, floor);
      }
      if (b.t > 1.6 && spent(s, 'wave')) nextAttack(s, b);
      break;
    case 'dash': {
      // Arrows on the floor cover exactly the stretch he will run through,
      // then he crosses the stage. Past the arrow tips (or up high) is safe.
      if (at(b, DT)) b.dir = b.x > mid ? -1 : 1;
      const dir = b.dir ?? 1;
      // He ends up where he has room, as near the far side as he can run.
      const target = spotNear(s, b, dir > 0 ? x1 - 4 : x0 + 4, b.x) ?? b.x;
      if (at(b, DT)) {
        const from = Math.min(b.x, target) - 0.6;
        zone(s, from, floor, Math.abs(target - b.x) + 1.2, 'arrow', { dir });
      }
      if (b.t > 0.85 && b.t < 2.4) {
        if (at(b, 0.85 + DT)) emit(s, 'dash', b.x, b.y + 1);
        const nx = b.x + dir * 13 * DT;
        b.x = dir > 0 ? Math.min(target, nx) : Math.max(target, nx);
        b.vx = b.x === target ? 0 : dir * 13;
      }
      if (b.t > 2.4) nextAttack(s, b);
      break;
    }
    case 'zones': {
      if (b.variant === 'follow') {
        // Grand finale: the spotlight finds the hero three times. Step out of it.
        for (const k of [DT, 0.8, 1.6])
          if (at(b, k)) {
            const w = 3;
            floorZone(s, Math.max(x0, Math.min(x1 - w, hx - w / 2)), floor, w, 'spot');
            emit(s, 'zoneWarn', hx, floor);
          }
        if (b.t > 1.6 && spent(s, 'zone')) nextAttack(s, b);
        break;
      }
      // Two thirds of the stage light up; the encore then lights the spared
      // third the moment the others go dark.
      const third = (x1 - x0) / 3;
      const safe = (b.hp ?? 0) % 3;
      /** @param {number} i */
      const spot = (i) => floorZone(s, x0 + i * third, floor, third, 'spot');
      if (at(b, DT)) {
        for (let i = 0; i < 3; i++) if (i !== safe) spot(i);
        emit(s, 'zoneWarn', mid, floor);
      }
      const encore = b.variant === 'encore';
      if (encore && at(b, SWAP)) {
        // Not 'zoneWarn': its hint says to hide in the dark spot, which is now the target.
        spot(safe);
        emit(s, 'telegraph', b.x, b.y + 2.3);
      }
      if (b.t > (encore ? 2 : 1) && spent(s, 'zone')) nextAttack(s, b);
      break;
    }
    case 'consult':
      if (b.t > consultLength(s, b)) nextAttack(s, b);
      break;
    case 'hit':
      // Picks up at the next round of the sequence.
      if (b.t > 0.6) nextAttack(s, b);
      break;
    case 'phase':
      if (b.t > 1.8) {
        b.step = -1;
        nextAttack(s, b);
      }
      break;
    case 'convinced':
      if (b.t > 1.4) {
        b.state = 'sign';
        b.t = 0;
        emit(s, 'sign', b.x, b.y + 1.6);
        s.things.push(make('key', b.x - face * 1.3, floor + 0.6));
      }
      break;
    default:
      break;
  }
  stepRisers(s, floor);
  // Walking into a director pushes you back.
  const busy = b.state === 'idle' || b.state === 'convinced' || b.state === 'sign';
  if (!busy && hero.state !== 'dead' && Math.abs(hx - b.x) < 0.6 && hero.y < b.y + bossHeight(s)) {
    if (s.onLift) s.onLift = null;
    knock(s, hero, b.x, 'boss');
  }
}

/**
 * Where a rack dropped at `x` from height `y` comes to rest: on the first solid
 * tile under any part of it (a platform above the arena floor stops it).
 * @param {Sim} s @param {number} x @param {number} y
 */
function landing(s, x, y) {
  const c0 = Math.floor(x - 0.45),
    c1 = Math.floor(x + 0.45);
  for (let r = Math.floor(y) - 1; r >= 0; r--)
    for (let c = c0; c <= c1; c++) if (solid(s, c, r)) return r + 1;
  return 0;
}

/**
 * A load-balancer rack stopped by a platform would leave a shelter under it: the
 * backup current runs under that platform instead, so standing still stays unsafe.
 * @param {Sim} s @param {number} x @param {number} floor
 */
function underPlatform(s, x, floor) {
  const top = landing(s, x, floor + 7);
  // Only a platform with room to stand under it makes a shelter.
  if (top - 1 - floor < HERO.h) return;
  const r = top - 1;
  let c0 = Math.floor(x - 0.45);
  if (!solid(s, c0, r)) c0++;
  let c1 = c0;
  while (solid(s, c0 - 1, r)) c0--;
  while (solid(s, c1 + 1, r)) c1++;
  zone(s, c0, floor, c1 - c0 + 1, 'cable');
  emit(s, 'cableWarn', (c0 + c1 + 1) / 2, floor);
}

/** Server racks lowered from the ceiling, and floor zones that light up. @param {Sim} s @param {Thing} t */
export function stepHazard(s, t) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  if (t.kind === 'rack') {
    // `y` stays on the arena floor until the drop, 7 tiles above it; `y0` is where
    // the rack will land, so its warning shadow lies there and it only hurts on the way.
    if (t.state === 'warn') {
      t.y0 = landing(s, t.x, t.y + 7);
      if (t.t > 0.9) {
        Object.assign(t, { state: 'fall', y: t.y + 7, vy: 0, t: 0 });
        emit(s, 'rackDrop', t.x, t.y - 1);
      }
      return;
    }
    const floor = t.y0 ?? t.y;
    if (t.state === 'fall') {
      t.vy -= GRAVITY * DT;
      t.y = Math.max(floor, t.y + t.vy * DT);
      if (Math.abs(hx - t.x) < 0.5 + HERO.w / 2 && t.y < hero.y + HERO.h && t.y + 2 > hero.y)
        hurt(s, hero, 'rack');
      if (t.y === floor) {
        Object.assign(t, { state: 'landed', t: 0 });
        emit(s, 'rackLand', t.x, floor);
      }
    } else if (t.state === 'landed' && t.t > 0.7) t.alive = false;
    return;
  }
  const floor = t.y0 ?? t.y;
  // Zones: warn, then hit whoever stands on that stretch of floor.
  const onFloor = hero.state !== 'dead' && hero.y < floor + 0.3;
  const inside = hero.x + HERO.w > t.x && hero.x < t.x + (t.w ?? 1);
  if (t.variant === 'arrow') {
    if (t.t > 2.4) t.alive = false;
    return;
  }
  if (t.state === 'warn' && t.t > WARN) {
    Object.assign(t, { state: 'live', t: 0 });
    emit(s, t.variant === 'cable' ? 'cableZap' : 'zoneHit', t.x + (t.w ?? 1) / 2, floor);
  } else if (t.state === 'live') {
    if (onFloor && inside) hurt(s, hero, t.variant === 'cable' ? 'cable' : 'spot');
    if (t.t > LIVE) t.alive = false;
  }
}

/**
 * A CR reaches the boss: it only counts while he consults PRIMO.
 * @param {Sim} s @param {Thing} b
 */
export function hitBoss(s, b) {
  if (b.state !== 'consult') {
    emit(s, 'block', b.x, b.y + 1.6, 'boss');
    return;
  }
  const next = PATTERNS[s.boss?.id ?? 'techServicesDirector'].phases[(b.phase ?? 1) - 1];
  b.hp = (b.hp ?? 1) - 1;
  if (b.hp <= 0) {
    b.state = 'convinced';
    b.t = 0;
    b.vx = 0;
    s.bossDone = true;
    s.things = s.things.filter((k) => !BOSS_DEBRIS.has(k.kind));
    emit(s, 'bossDone', b.x, b.y + 2);
  } else if (next !== undefined && b.hp <= next) {
    // A new phase (Rodolphe's third one is his grand finale).
    b.phase = (b.phase ?? 1) + 1;
    b.state = 'phase';
    b.t = 0;
    b.vx = 0;
    s.things = s.things.filter((k) => !BOSS_DEBRIS.has(k.kind));
    addRisers(s, b);
    emit(s, 'bossHit', b.x, b.y + 2);
    emit(s, 'bossPhase', b.x, b.y + 2);
  } else {
    b.state = 'hit';
    b.t = 0;
    b.vx = 0;
    emit(s, 'bossHit', b.x, b.y + 2);
  }
}

/** Resets a boss after the hero respawns. @param {Sim} s @param {Thing} b */
export function resetBoss(s, b) {
  dropRisers(s, b);
  Object.assign(b, {
    state: 'idle',
    t: 0,
    hp: s.boss?.hp ?? 3,
    x: b.home ?? b.x,
    y: b.y0 ?? b.y,
    vx: 0,
    phase: 1,
    step: -1,
    variant: undefined,
  });
}
