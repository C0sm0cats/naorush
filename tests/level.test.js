import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels/index.js';
import { LCP7 } from '../src/data/levels/lcp7.js';
import { HERO, TILE, createSim, step, tileAt } from '../src/game/sim.js';
import { solve } from '../src/game/solver.js';

const HEROES = /** @type {const} */ (['kevin', 'charline']);

/**
 * Is the tile around a secret closed off by walls and archive boxes, so that only
 * knocking boxes down opens it? (A flood fill through everything that is not
 * structure or a box: it must stay inside the map and meet at least one box.)
 * @param {import('../src/game/sim.js').Sim} sim @param {{x: number, y: number}} spot
 */
function sealedByBoxes(sim, spot) {
  const seen = new Set();
  const todo = [[Math.floor(spot.x), Math.floor(spot.y)]];
  let boxes = 0;
  while (todo.length) {
    const [c, r] = /** @type {[number, number]} */ (todo.pop());
    if (c < 0 || c >= sim.w || r < 0 || r >= sim.h) return false;
    const k = c + r * sim.w;
    if (seen.has(k)) continue;
    const t = tileAt(sim, c, r);
    if (t === TILE.CRATE) {
      boxes++;
      continue;
    }
    if (t === TILE.SOLID) continue;
    seen.add(k);
    // A pocket the size of a room is no niche.
    if (seen.size > 60) return false;
    todo.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return boxes > 0;
}
/** Solver proofs are long searches (boss stages most of all): generous time limits. */
const SEARCH = 300_000;
const BOSS_SEARCH = 900_000;

describe.each(LEVELS)('$name', (level) => {
  it.each(HEROES)(
    '%s can finish it',
    (hero) => {
      const result = solve(createSim(level, hero), {
        // A boss stage adds the duel (its phases and risers) to the search.
        maxNodes: level.boss ? 300000 : 200000,
        allowDamage: Boolean(level.boss),
      });
      expect(result.won).toBe(true);
      // Replaying the found inputs on a fresh simulation reaches the exit too.
      const sim = createSim(level, hero);
      for (const input of result.inputs) step(sim, input);
      expect(sim.won).toBe(true);
    },
    level.boss ? BOSS_SEARCH : SEARCH,
  );

  it.runIf(Boolean(level.boss)).each(HEROES)(
    '%s can win the boss fight without taking a hit',
    (hero) => {
      // Every attack is telegraphed and dodgeable: the solver proves it.
      const sim = createSim(level, hero);
      const x = (level.boss?.arena[0] ?? 0) - 3;
      Object.assign(sim.hero, { x, y: 3 });
      sim.checkpoint = { x, y: 3 };
      expect(solve(sim, { maxNodes: 300000 }).won).toBe(true);
    },
    BOSS_SEARCH,
  );

  it('has no two-tile walls (too high to jump, too low to hang from)', () => {
    const sim = createSim(level, 'kevin');
    /** @param {number} c @param {number} r */
    const solid = (c, r) => tileAt(sim, c, r) === TILE.SOLID;
    const walls = [];
    for (let c = 1; c < sim.w - 1; c++)
      for (let r = 2; r < sim.h - 2; r++) {
        // A ledge top at r + 1 with headroom…
        if (!solid(c, r) || solid(c, r + 1) || solid(c, r + 2)) continue;
        // …next to a floor exactly two tiles lower, with room to stand.
        for (const side of [-1, 1])
          if (
            solid(c + side, r - 2) &&
            tileAt(sim, c + side, r - 1) === TILE.EMPTY &&
            !solid(c + side, r)
          )
            walls.push(`${c},${r}`);
      }
    expect(walls).toEqual([]);
  });

  it(
    'hides a secret for each hero, on their own route',
    () => {
      const sim = createSim(level, 'kevin');
      const spots = sim.things.filter((t) => t.kind === 'secret');
      expect(spots.length).toBe(2);
      // Kévin's sits behind archive boxes that only his CRs knock down; Charline's is
      // the other one, up a ledge for her double jump.
      const sealed = spots.filter((spot) => sealedByBoxes(sim, spot));
      expect(sealed.length).toBe(1);
      const own = { kevin: sealed[0], charline: spots.find((s) => s !== sealed[0]) };
      for (const hero of HEROES) {
        const spot = own[hero];
        if (!spot) throw new Error('no secret');
        const found = solve(createSim(level, hero), {
          maxNodes: 40000,
          allowDamage: true,
          goal: { x: spot.x, y: spot.y, done: (x) => x.secrets > 0 },
        }).won;
        expect(found, hero).toBe(true);
      }
    },
    SEARCH,
  );

  it('leaves headroom above every lift at the top of its run', () => {
    // A rider is never pushed into a ceiling.
    const sim = createSim(level, 'kevin');
    for (const l of level.lifts ?? []) {
      const w = l.w ?? 2;
      for (let c = Math.floor(l.x); c <= Math.floor(l.x + w - 1e-6); c++)
        for (let r = Math.floor(l.top); r <= Math.floor(l.top + HERO.h); r++)
          expect(tileAt(sim, c, r), `lift ${l.x}: ${c},${r}`).not.toBe(TILE.SOLID);
    }
  });

  it('keeps every row the same width', () => {
    expect(level.map.length).toBe(12);
    expect(new Set(level.map.map((r) => r.length)).size).toBe(1);
  });
});

describe('the colleague in a call', () => {
  it('cannot be passed without throwing a CR', async () => {
    const sim = createSim(LCP7, 'kevin');
    sim.ammo = 0;
    sim.things = sim.things.filter((t) => t.kind !== 'ammo');
    expect(solve(sim, { maxNodes: 20000 }).won).toBe(false);
  });
});
