import { DT, GRAVITY, HERO, emit, hurt, knock, make } from './world.js';

/**
 * Boss duels. Both directors run a scripted sequence of telegraphed attacks,
 * then stop to consult PRIMO: the only moment a CR gets through. Below half
 * conviction they switch to a second, faster phase with new attacks. Once
 * convinced they sign the NAO envelope: everyone wins.
 *
 * Julien (Technologies & Services) deploys: KPI volleys, server racks dropped
 * from the ceiling, a failover teleport, live cable runs and, in phase 2, a
 * load balancer that lowers racks on every other slot, then on the others.
 * Rodolphe (Région Ouest) puts on a show: fans of slides, stage-shaking leaps,
 * a regional tour dash across the stage, spotlight zones and, in phase 2, an
 * encore where the spotlight comes back to the one spot it had spared.
 *
 * Every attack is announced at least 0.6 s before it can hurt. Each sequence
 * holds two rounds: after a successful CR the director moves on to the other
 * round, so the fight never repeats itself. A step written 'state:variant'
 * plays the state's pose with a twist (the variant is kept in `b.variant`).
 *
 * @typedef {import('./sim.js').Sim} Sim
 * @typedef {import('./world.js').Thing} Thing
 * @typedef {import('./world.js').BossId} BossId
 */

/** @type {Record<BossId, {phase2: number, seq: string[][], consult: number[]}>} */
export const PATTERNS = {
  techServicesDirector: {
    phase2: 2,
    seq: [
      ['volley', 'rackDrop', 'consult', 'rackDrop', 'volley', 'consult'],
      ['teleport', 'cables', 'volley', 'consult', 'teleport', 'rackDrop:balancer', 'consult'],
    ],
    consult: [2.8, 2.4],
  },
  regionalDirector: {
    phase2: 3,
    seq: [
      ['fan', 'leap', 'consult', 'leap', 'fan', 'consult'],
      ['dash', 'zones', 'fan', 'consult', 'leap', 'zones:encore', 'consult'],
    ],
    consult: [2.6, 2.3],
  },
};

/** Things a boss leaves around, cleared on respawn and phase change. */
export const BOSS_DEBRIS = new Set(['kpi', 'wave', 'rack', 'zone']);

/** @param {Sim} s @param {Thing} b */
const pattern = (s, b) => PATTERNS[s.boss?.id ?? 'techServicesDirector'].seq[(b.phase ?? 1) - 1];

/** @param {Sim} s @param {Thing} b @param {string} step 'state' or 'state:variant'. */
function enter(s, b, step) {
  const [state, variant] = step.split(':');
  b.state = state;
  b.variant = variant;
  b.t = 0;
  b.vx = 0;
  if (state === 'consult') emit(s, 'consult', b.x, b.y + 2.2);
  else if (state !== 'hit' && state !== 'phase') emit(s, 'telegraph', b.x, b.y + 2.3);
}

/** @param {Sim} s @param {Thing} b */
function nextAttack(s, b) {
  const seq = pattern(s, b);
  b.step = ((b.step ?? -1) + 1) % seq.length;
  enter(s, b, seq[b.step]);
}

/** Is the boss's timer crossing `at` during this step? @param {Thing} b @param {number} time */
const at = (b, time) => b.t >= time && b.t - DT < time;

/** @param {Sim} s @param {Thing} b @param {number} vx @param {number} vy */
function throwKpi(s, b, vx, vy) {
  const face = Math.sign(vx) || 1;
  s.things.push(make('kpi', b.x + face * 0.5, b.y + 1.7, { vx, vy, state: 'fly' }));
  emit(s, 'bossThrow', b.x, b.y + 1.8);
}

/**
 * @param {Sim} s
 * @param {Thing} b
 */
export function stepBoss(s, b) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  const [x0, x1] = s.boss?.arena ?? [b.x - 8, b.x + 8];
  const id = s.boss?.id ?? 'techServicesDirector';
  const p = PATTERNS[id];
  const face = Math.sign(hx - b.x) || -1;
  const floor = b.home === undefined ? b.y : (b.y0 ?? b.y);
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
    case 'volley':
      // Three throws, each released at the end of the arm's wind-up (0.89 s for the first).
      for (const k of [0.89, 1.44, 1.99]) if (at(b, k)) throwKpi(s, b, hx - b.x, 5.5);
      if (b.t > 2.4) nextAttack(s, b);
      break;
    case 'rackDrop':
      if (b.variant === 'balancer') {
        // Load balancer: shadows on every other slot of the stage, then on the
        // others once the first batch has landed. Step aside, then step back.
        const batch = at(b, DT) ? 0 : at(b, 1.55) ? 1 : -1;
        if (batch >= 0) {
          // Racks every 3 tiles, the second batch offset by half a step: standing
          // still is never safe, stepping into the first batch's slots is.
          const flip = (Math.floor((b.hp ?? 0) + s.deaths) + batch) % 2;
          for (let x = x0 + 1 + flip * 1.5; x <= x1 - 1; x += 3)
            if (Math.abs(x - b.x) > 1.2)
              s.things.push(make('rack', x, floor, { state: 'warn', y0: floor }));
          if (batch) emit(s, 'telegraph', b.x, b.y + 2.3);
        }
        if (b.t > 3.3) nextAttack(s, b);
        break;
      }
      if (at(b, DT)) {
        // Shadows on the floor first, then the racks come down on them.
        for (const dx of [0, -3, 3]) {
          const x = Math.max(x0 + 1, Math.min(x1 - 1, hx + dx));
          s.things.push(make('rack', x, floor, { state: 'warn', y0: floor }));
        }
      }
      if (b.t > 2.6) nextAttack(s, b);
      break;
    case 'teleport':
      if (at(b, 0.55)) {
        // Fails over to the other side of the room, never onto the hero.
        const x = b.x > (x0 + x1) / 2 ? x0 + 2.5 : x1 - 2.5;
        if (Math.abs(hx - x) > 2) {
          b.x = x;
          emit(s, 'teleport', b.x, b.y + 1);
        }
      }
      if (b.t > 1) nextAttack(s, b);
      break;
    case 'cables':
      if (at(b, DT)) {
        // Every other two-tile run of floor goes live; the pattern alternates each time.
        const flip = Math.floor((b.hp ?? 0) + s.deaths) % 2;
        for (let x = x0 + 1, i = 0; x + 2 <= x1; x += 2, i++)
          if (i % 2 === flip)
            s.things.push(make('zone', x, floor, { w: 2, state: 'warn', variant: 'cable' }));
        emit(s, 'cableWarn', (x0 + x1) / 2, floor);
      }
      if (b.t > 2) nextAttack(s, b);
      break;
    case 'fan':
      if (at(b, 0.6)) {
        for (let i = 0; i < 5; i++) throwKpi(s, b, face * (2.2 + i * 1.6), 5 + (i % 2) * 2.5);
        emit(s, 'fan', b.x, b.y + 1.8);
      }
      if (b.t > 1.6) nextAttack(s, b);
      break;
    case 'leap':
      // Crouch (telegraph), jump, slam: two shockwaves run outwards.
      if (at(b, 1.1)) {
        for (const dir of [-1, 1])
          s.things.push(make('wave', b.x + dir * 0.6, floor, { vx: dir * 6, state: 'run' }));
        emit(s, 'slam', b.x, floor);
      }
      if (b.t > 1.6) nextAttack(s, b);
      break;
    case 'dash': {
      // An arrow on the floor shows the way, then he crosses the whole stage.
      if (at(b, DT)) {
        b.dir = b.x > (x0 + x1) / 2 ? -1 : 1;
        s.things.push(
          make('zone', Math.min(b.x, b.x + (b.dir ?? 1) * 12), floor, {
            w: 12,
            state: 'warn',
            variant: 'arrow',
            dir: b.dir,
          }),
        );
      }
      if (b.t > 0.85 && b.t < 2.4) {
        if (at(b, 0.85 + DT)) emit(s, 'dash', b.x, b.y + 1);
        const target = (b.dir ?? 1) > 0 ? x1 - 2.5 : x0 + 2.5;
        const nx = b.x + (b.dir ?? 1) * 13 * DT;
        b.x = (b.dir ?? 1) > 0 ? Math.min(target, nx) : Math.max(target, nx);
        b.vx = b.x === target ? 0 : (b.dir ?? 1) * 13;
      }
      if (b.t > 2.4) nextAttack(s, b);
      break;
    }
    case 'zones': {
      // Two thirds of the stage light up; the encore then lights the spared third.
      const third = (x1 - x0) / 3;
      const safe = (b.hp ?? 0) % 3;
      /** @param {number} i */
      const spot = (i) =>
        s.things.push(
          make('zone', x0 + i * third, floor, { w: third, state: 'warn', variant: 'spot' }),
        );
      if (at(b, DT)) {
        for (let i = 0; i < 3; i++) if (i !== safe) spot(i);
        emit(s, 'zoneWarn', (x0 + x1) / 2, floor);
      }
      const encore = b.variant === 'encore';
      if (encore && at(b, 1.3)) {
        // Not 'zoneWarn': its hint says to hide in the dark spot, which is now the target.
        spot(safe);
        emit(s, 'telegraph', b.x, b.y + 2.3);
      }
      if (b.t > (encore ? 3.1 : 2)) nextAttack(s, b);
      break;
    }
    case 'consult':
      if (b.t > p.consult[(b.phase ?? 1) - 1]) nextAttack(s, b);
      break;
    case 'hit':
      // Picks up at the other round of the sequence.
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
  // Walking into a director pushes you back.
  const busy = b.state === 'idle' || b.state === 'convinced' || b.state === 'sign';
  if (!busy && hero.state !== 'dead' && Math.abs(hx - b.x) < 0.6 && hero.y < b.y + 2) {
    if (s.onLift) s.onLift = null;
    knock(s, hero, b.x, 'boss');
  }
}

/** Server racks lowered from the ceiling, and floor zones that light up. @param {Sim} s @param {Thing} t */
export function stepHazard(s, t) {
  const hero = s.hero;
  const hx = hero.x + HERO.w / 2;
  const floor = t.y0 ?? t.y;
  if (t.kind === 'rack') {
    if (t.state === 'warn' && t.t > 0.9) {
      Object.assign(t, { state: 'fall', y: floor + 7, vy: 0, t: 0 });
      emit(s, 'rackDrop', t.x, floor + 6);
    } else if (t.state === 'fall') {
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
  // Zones: warn, then hit whoever stands on that stretch of floor.
  const onFloor = hero.state !== 'dead' && hero.y < floor + 0.3;
  const inside = hero.x + HERO.w > t.x && hero.x < t.x + (t.w ?? 1);
  if (t.variant === 'arrow') {
    if (t.t > 2.4) t.alive = false;
    return;
  }
  if (t.state === 'warn' && t.t > 1) {
    Object.assign(t, { state: 'live', t: 0 });
    emit(s, t.variant === 'cable' ? 'cableZap' : 'zoneHit', t.x + (t.w ?? 1) / 2, floor);
  } else if (t.state === 'live') {
    if (onFloor && inside) hurt(s, hero, t.variant === 'cable' ? 'cable' : 'spot');
    if (t.t > 0.65) t.alive = false;
  }
}

/**
 * A CR reaches the boss: it only counts while he consults PRIMO.
 * @param {Sim} s @param {Thing} b
 */
export function hitBoss(s, b) {
  if (b.state !== 'consult') {
    emit(s, 'block', b.x, b.y + 1.6);
    return;
  }
  const p = PATTERNS[s.boss?.id ?? 'techServicesDirector'];
  b.hp = (b.hp ?? 1) - 1;
  if (b.hp <= 0) {
    b.state = 'convinced';
    b.t = 0;
    s.bossDone = true;
    s.things = s.things.filter((k) => !BOSS_DEBRIS.has(k.kind));
    emit(s, 'bossDone', b.x, b.y + 2);
  } else if (b.hp === p.phase2 && (b.phase ?? 1) === 1) {
    b.phase = 2;
    b.state = 'phase';
    b.t = 0;
    s.things = s.things.filter((k) => !BOSS_DEBRIS.has(k.kind));
    emit(s, 'bossHit', b.x, b.y + 2);
    emit(s, 'bossPhase', b.x, b.y + 2);
  } else {
    b.state = 'hit';
    b.t = 0;
    emit(s, 'bossHit', b.x, b.y + 2);
  }
}

/** Resets a boss after the hero respawns. @param {Sim} s @param {Thing} b */
export function resetBoss(s, b) {
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
