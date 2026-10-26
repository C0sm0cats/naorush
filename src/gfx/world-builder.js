import { TILE } from '../game/sim.js';
import { POSTER_H, WHITEBOARD_W, posterWidth } from '../data/inetum.js';
import { LEVELS, ROOM_W } from '../data/levels/index.js';
import { MAT, Volume, meshVolume, rgb } from './voxels.js';

/**
 * Builds the static office diorama for a level: floors with carpet, glass
 * façade with the Nantes skyline behind, ceiling lights, furniture.
 * Environment voxels are 1/8 of a tile.
 */

export const V = 8;
const Z_BACK = -3;
const Z_FRONT = 1.4;

/**
 * Deterministic hash noise for texture variation.
 * @param {number} x @param {number} y @param {number} z
 */
const noise = (x, y, z) => {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/**
 * Varies a colour slightly per voxel so large surfaces never look flat.
 * @param {number} c @param {number} amount @param {number} [grain]
 * @returns {(x: number, y: number, z: number) => number}
 */
const vary =
  (c, amount, grain = 1) =>
  (x, y, z) => {
    const k =
      1 +
      (noise(Math.floor(x / grain), Math.floor(y / grain), Math.floor(z / grain)) - 0.5) * amount;
    const r = Math.min(255, ((c >> 16) & 255) * k) | 0;
    const g = Math.min(255, ((c >> 8) & 255) * k) | 0;
    const b = Math.min(255, (c & 255) * k) | 0;
    return (r << 16) | (g << 8) | b;
  };

const STICKY = [rgb('#ffe066'), rgb('#ff8fc0'), rgb('#d8ff6a'), rgb('#9fd8ff')];

export const PALETTE = {
  carpet: rgb('#3e5170'),
  carpetEdge: rgb('#2f3b52'),
  fascia: rgb('#1f2a44'),
  accent: rgb('#c6f432'),
  wall: rgb('#c9c0b2'),
  wallLow: rgb('#a89e8f'),
  mullion: rgb('#2b3446'),
  ceiling: rgb('#f2efe8'),
  lamp: rgb('#fff6d8'),
  concrete: rgb('#8b8f99'),
  hazard: rgb('#ffcc33'),
  cable: rgb('#ff7a2f'),
  wood: rgb('#b9875a'),
  woodDark: rgb('#8a5f3c'),
  metal: rgb('#a9b2bd'),
  screen: rgb('#58d5ff'),
  leaf: rgb('#3f9d5a'),
  leafLight: rgb('#6cc46f'),
  pot: rgb('#e07a4f'),
};

/**
 * Light mood of a stage: the time of day and the kind of room it is set in. Levels
 * name it in their `mood` field; it drives the ceiling fixtures, floor and wall
 * finishes, the back row of furniture and what the windows look out on.
 *   dawn: parking B2, early Monday       morning: LCP7 open space, daylight
 *   night: T&S server hall               corporate: COPIL, regional head office
 *   dusk: rooftop terrace                idle: intercontrat plateau, a calm morning
 *   lounge: coffee break room            event: seminar evening, congress centre
 * @typedef {'dawn'|'morning'|'night'|'corporate'|'dusk'|'idle'|'lounge'|'event'} Mood
 */

/** Default mood of the non-office themes. */
const THEME_MOOD = /** @type {const} */ ({
  parking: 'dawn',
  datacenter: 'night',
  rooftop: 'dusk',
});

/**
 * Fallback for an office stage without a `mood` field, guessed from what furnishes
 * it: the seminar has its stage truss, the break room its bistro tables, the
 * steering committee its long meeting tables, a manned open space its desks and
 * whiteboards; a floor with none of them is the half-empty intercontrat plateau.
 * @param {import('../data/levels/index.js').Decor[]} decor
 * @param {string[]} map
 * @returns {Mood}
 */
export function officeMood(decor, map) {
  const has = (/** @type {string} */ type) => decor.some((d) => d.type === type);
  if (has('truss')) return 'event';
  if (has('bistro')) return 'lounge';
  if (map.some((row) => row.includes('Y'))) return 'corporate';
  if (has('desk') || has('whiteboard')) return 'morning';
  return 'idle';
}

/**
 * Mood of a stage: the explicit one if given, else the `mood` field of the level
 * these decor belong to, else a guess from the theme and furniture.
 * @param {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @param {import('../data/levels/index.js').Decor[]} decor
 * @param {string[]} map
 * @param {Mood} [mood]
 * @returns {Mood}
 */
export function stageMood(theme, decor, map, mood) {
  if (mood) return mood;
  const own = LEVELS.find((l) => l.decor === decor)?.mood;
  if (own) return own;
  return theme === 'office' ? officeMood(decor, map) : THEME_MOOD[theme];
}

/**
 * Ceiling fixtures per mood: emissive panel colour and the light it casts.
 * @type {Record<Mood, {panel: number, color: number[], radius: number}>}
 */
const FIXTURES = {
  dawn: { panel: rgb('#dff6ff'), color: [0.3, 0.55, 0.7], radius: 7.5 },
  morning: { panel: rgb('#fff6d8'), color: [0.52, 0.49, 0.42], radius: 6.5 },
  night: { panel: rgb('#bfe9ff'), color: [0.24, 0.46, 0.72], radius: 6.5 },
  corporate: { panel: rgb('#f4f8ff'), color: [0.52, 0.54, 0.58], radius: 6.8 },
  dusk: { panel: rgb('#ffd27a'), color: [0.62, 0.38, 0.16], radius: 5.5 },
  idle: { panel: rgb('#f6f4ec'), color: [0.54, 0.53, 0.5], radius: 6.5 },
  lounge: { panel: rgb('#ffdca0'), color: [0.72, 0.5, 0.28], radius: 5.5 },
  event: { panel: rgb('#ffcf8a'), color: [0.8, 0.5, 0.26], radius: 7 },
};

/**
 * Wall paint of an office stage per mood: plaster, skirting band, artwork panels,
 * pillars, and the tint of the reflections on the glass.
 * @type {Partial<Record<Mood, {wall: number, low: number, panel: number, pillar: number, glint: number}>>}
 */
const WALLS = {
  morning: {
    wall: PALETTE.wall,
    low: PALETTE.wallLow,
    panel: rgb('#d9d1c3'),
    pillar: rgb('#bdb4a6'),
    glint: rgb('#eaf6ff'),
  },
  corporate: {
    wall: rgb('#dcdad4'),
    low: rgb('#7d8796'),
    panel: rgb('#eeece6'),
    pillar: rgb('#c9c7c1'),
    glint: rgb('#f4f9ff'),
  },
  idle: {
    wall: rgb('#cdbf9f'),
    low: rgb('#998b6e'),
    panel: rgb('#ddd1b5'),
    pillar: rgb('#b9ab8c'),
    glint: rgb('#fff0d6'),
  },
  lounge: {
    wall: rgb('#eadac2'),
    low: rgb('#c4704e'),
    panel: rgb('#f3e8d6'),
    pillar: rgb('#d8c4a6'),
    glint: rgb('#fffaf0'),
  },
  event: {
    wall: rgb('#4e4060'),
    low: rgb('#2e2540'),
    panel: rgb('#625278'),
    pillar: rgb('#443857'),
    glint: rgb('#c9a8ff'),
  },
};

/**
 * Office floor finish per mood. Trapdoor columns keep the plain carpet the
 * disguised tile is drawn with, so no pattern gives the trap away.
 * @param {Mood} mood
 * @param {Set<number>} trapCols
 * @returns {(x: number, y: number, z: number) => number}
 */
function officeFloor(mood, trapCols) {
  const carpet = vary(PALETTE.carpet, 0.12, 4);
  switch (mood) {
    case 'corporate': {
      // Carpet tiles laid in alternating pile directions, with fine seams.
      const alt = vary(rgb('#46597b'), 0.1, 4);
      return (x, y, z) => {
        if (trapCols.has(x >> 3)) return carpet(x, y, z);
        if (x % 8 === 0 || z % 8 === 0) return rgb('#36445f');
        return ((x >> 3) + (z >> 3)) % 2 ? alt(x, y, z) : carpet(x, y, z);
      };
    }
    case 'event': {
      // Congress-hall carpet: the house blue with a sparse gold and pink motif.
      return (x, y, z) => {
        if (trapCols.has(x >> 3)) return carpet(x, y, z);
        const mx = x % 12,
          mz = z % 8;
        if ((mx === 3 && mz === 4) || (mx === 9 && mz === 0)) return rgb('#e8b84a');
        if ((mx === 2 || mx === 4) && mz === 4) return rgb('#b04a86');
        return carpet(x, y, z);
      };
    }
    case 'lounge': {
      // Warm oak parquet: staggered planks with dark joints.
      const oak = [rgb('#b9875a'), rgb('#a8774c'), rgb('#c49466'), rgb('#b07f52')];
      return (x, _y, z) => {
        const row = z >> 1;
        const off = (row * 5) % 12;
        if ((x + off) % 12 === 0) return rgb('#7a5236');
        return oak[Math.floor(noise(Math.floor((x + off) / 12), row, 7) * 4)];
      };
    }
    case 'idle': {
      // Worn checkerboard of sage carpet tiles and the odd coffee stain.
      const a = vary(rgb('#6b7a72'), 0.1, 4),
        b = vary(rgb('#5d6b66'), 0.1, 4);
      return (x, y, z) => {
        if (noise(x >> 1, z >> 1, 19) > 0.993) return rgb('#58564a');
        return ((x >> 3) + (z >> 3)) % 2 ? a(x, y, z) : b(x, y, z);
      };
    }
    default:
      return carpet;
  }
}

/** Daylight through the façade per mood: patch colour and strength. */
const SUN = /** @type {Partial<Record<Mood, [number, number]>>} */ ({
  morning: [rgb('#fff1c4'), 0.22],
  corporate: [rgb('#f6fbff'), 0.16],
  idle: [rgb('#ffe9b8'), 0.24],
});

/** Slant of the sun patches: voxels of x shift per voxel of depth. */
const SUN_SLANT = 0.6;

/**
 * Dresses an office floor: rugs under the steering committee tables, and in the
 * daylit moods the patches the windows throw on it, pane by pane, slanting with
 * the sun. No patch or rug comes near a hidden trapdoor, whose tile is drawn plain.
 * @param {(x: number, y: number, z: number) => number} finish
 * @param {Mood} mood
 * @param {string[]} map
 * @param {Set<number>} trapCols
 * @param {(x: number) => boolean} onPanel
 * @returns {(x: number, y: number, z: number) => number}
 */
function dressFloor(finish, mood, map, trapCols, onPanel) {
  /** @param {number} z */
  const zv = (z) => Math.round((z - Z_BACK) * V);
  /** @type {number[][]} */
  const rugs = [];
  if (mood === 'corporate')
    for (const row of map)
      for (const m of row.matchAll(/Y+/g)) {
        const c0 = /** @type {number} */ (m.index),
          c1 = c0 + m[0].length;
        rugs.push([
          trapCols.has(c0 - 1) ? c0 * V : c0 * V - 6,
          trapCols.has(c1) ? c1 * V : c1 * V + 6,
        ]);
      }
  const sun = SUN[mood];
  const z0 = zv(-2.6),
    z1 = zv(0.8),
    r0 = zv(-2.1),
    r1 = zv(1.1);
  /** @param {number} x */
  const nearTrap = (x) => {
    for (let k = -4; k <= 4; k++) if (trapCols.has((x >> 3) + k)) return true;
    return false;
  };
  return (x, y, z) => {
    for (const [a, b] of rugs)
      if (x >= a && x < b && z >= r0 && z < r1) {
        if (x === a || x === b - 1 || z === r0 || z === r1 - 1) return rgb('#c9a227');
        if (x === a + 1 || x === b - 2 || z === r0 + 1 || z === r1 - 2) return rgb('#5a1d2a');
        // Woven bands across the rug (along the depth, so the faces stay merged).
        return (x - a) % 8 < 2 ? rgb('#8e3446') : rgb('#7a2637');
      }
    const c = finish(x, y, z);
    if (!sun || z < z0 || z > z1) return c;
    const u = x + 2 * Math.floor(((z - z0) * SUN_SLANT) / 2);
    const m = u % 32;
    if (m < 3 || m > 29 || onPanel(u) || nearTrap(u) || nearTrap(x)) return c;
    return lerpColor(c, sun[0], sun[1]);
  };
}

/**
 * @param {import('../game/sim.js').Sim} sim
 * @param {import('../data/levels/index.js').Decor[]} decor
 * @param {string[]} [map] Level rows, used for tile styles ('M' meeting room, 'B' paper reams,
 *   'V' server rack, 'H' HVAC unit).
 * @param {'office'|'datacenter'|'rooftop'|'parking'} [theme]
 * @param {Mood} [moodName] Light mood (default: the level's `mood` field, see {@link stageMood}).
 */
export function buildOffice(sim, decor, map = [], theme = 'office', moodName) {
  const roof = theme === 'rooftop';
  const dc = theme === 'datacenter';
  const park = theme === 'parking';
  const mood = stageMood(theme, decor, map, moodName);
  const fixture = FIXTURES[mood];
  const paint = WALLS[mood] ?? /** @type {NonNullable<typeof WALLS.morning>} */ (WALLS.morning);
  const concrete = vary(rgb('#7b818c'), 0.08, 4);
  const pebbles = vary(rgb('#7d7a75'), 0.2, 1);
  /** Roof gravel: pebbles, with lighter washed patches and a few pale stones. */
  /** @param {number} x @param {number} y @param {number} z */
  const gravel = (x, y, z) => {
    const n = noise(x, y, z);
    if (n > 0.94) return rgb('#b3ada2');
    if (noise(x >> 3, z >> 2, 21) > 0.72) return vary(rgb('#908a80'), 0.18, 1)(x, y, z);
    return pebbles(x, y, z);
  };
  /** Parapet coping stones with dark joints. @param {number} x */
  const parapet = (x) => (x % (2 * V) === 0 ? rgb('#aaa396') : rgb('#d8d2c6'));
  /** Acoustic ceiling tiles in a light grid. @param {number} x @param {number} _y @param {number} z */
  const tiles = (x, _y, z) => (x % V === 0 || z % 6 === 2 ? rgb('#cfcabe') : PALETTE.ceiling);
  /** Columns holding a hidden trapdoor: their floor must match the disguised tile. */
  const trapCols = new Set();
  map.forEach((row) => [...row].forEach((ch, c) => ch === 'L' && trapCols.add(c)));
  const asphalt = vary(rgb('#3b3f47'), 0.16, 2);
  /** Floor finish: carpet in offices, raised-floor tiles in the server hall. */
  const floorTop = park
    ? /** @param {number} x @param {number} y @param {number} z */ (x, y, z) => {
        if (x % (3 * V) < 1 && z > zv(-1.8)) return rgb('#e9e6dc');
        // Oil stains where the cars stand.
        const bay = Math.abs((x % (3 * V)) - 1.5 * V);
        if (
          bay < 7 &&
          z > zv(-1.7) &&
          z < zv(0.6) &&
          !trapCols.has(x >> 3) &&
          noise(x >> 3, z >> 3, 5) > 0.55 &&
          noise(x >> 1, z >> 1, 11) > 0.45
        )
          return noise(x, z, 3) > 0.5 ? rgb('#25282d') : rgb('#2c2f35');
        // Painted arrows along the driving lane, pointing on towards the lifts.
        const dz = Math.abs(z - zv(0.9));
        const k = (x % (10 * V)) + dz;
        if (dz <= 3 && k >= 7 && k < 10 && !trapCols.has(x >> 3)) return rgb('#d9d6cc');
        return asphalt(x, y, z);
      }
    : dc
      ? /** @param {number} x @param {number} _y @param {number} z */ (x, _y, z) =>
          // Perforated cold-aisle grilles every fourth tile.
          (x >> 3) % 4 === 1 && !trapCols.has(x >> 3) && z > zv(-1.5) && z < zv(0.8)
            ? x % 2
              ? rgb('#5e6774')
              : rgb('#b8c1cc')
            : ((x >> 2) + (z >> 2)) % 2
              ? rgb('#a3acb7')
              : rgb('#8d96a2')
      : dressFloor(officeFloor(mood, trapCols), mood, map, trapCols, (x) => onPanel(x));
  /** Visual style of a solid tile, from the level's ASCII map. */
  /** @param {number} c @param {number} r */
  const styleAt = (c, r) => map[sim.h - 1 - r]?.[c] ?? '#';
  /**
   * Bottom-left tile of the free-standing block (two tiles wide, three tall, on a
   * floor, open on both sides and above) a tile belongs to, or null.
   * @param {number} c @param {number} r
   * @returns {[number, number] | null}
   */
  const vendingAt = (c, r) => {
    /** @param {number} cc @param {number} rr */
    const solidAt = (cc, rr) => sim.tiles[cc + rr * sim.w] === TILE.SOLID;
    /** @param {number} cc @param {number} rr */
    const empty = (cc, rr) => cc >= 0 && cc < sim.w && !solidAt(cc, rr);
    for (let c0 = c - 1; c0 <= c; c0++)
      for (let r0 = r - 2; r0 <= r; r0++) {
        if (c0 < 1 || r0 < 1 || c0 + 2 >= sim.w || r0 + 3 >= sim.h) continue;
        let ok = true;
        for (let k = 0; k < 2 && ok; k++) {
          if (!solidAt(c0 + k, r0 - 1) || !empty(c0 + k, r0 + 3)) ok = false;
          for (let j = 0; j < 3; j++) if (styleAt(c0 + k, r0 + j) !== '#') ok = false;
        }
        for (let j = 0; j < 3 && ok; j++)
          if (!empty(c0 - 1, r0 + j) || !empty(c0 + 2, r0 + j)) ok = false;
        if (ok) return [c0, r0];
      }
    return null;
  };
  const sx = sim.w * V;
  const sy = sim.h * V;
  const sz = Math.round((Z_FRONT - Z_BACK) * V);
  const vol = new Volume(sx, sy, sz, 1 / V, [0, 0, Z_BACK]);
  /** @param {number} z */
  const zv = (z) => Math.round((z - Z_BACK) * V);
  /** @type {Array<{pos: number[], radius: number, color: number[]}>} */
  const lights = [];

  // Back wall: plaster below, a glass façade above. Wherever Inetum artwork hangs,
  // the façade becomes a solid wall panel so nothing floats in front of the windows.
  const panels = decor
    .filter(
      (d) => !d.front && (d.type === 'poster' || d.type === 'whiteboard' || d.type === 'desk'),
    )
    .map((d) => {
      const w =
        d.type === 'whiteboard'
          ? WHITEBOARD_W
          : d.type === 'desk'
            ? 4.2
            : posterWidth(/** @type {string} */ (d.id));
      return [Math.floor((d.x - 0.35) * V), Math.ceil((d.x + w + 0.35) * V)];
    });
  /** @param {number} x */
  const onPanel = (x) => panels.some(([a, b]) => x >= a && x < b);
  const plan = floorPlan(sim, map, decor, onPanel, lights);
  const jokes = planJokes(plan, mood, panels, onPanel);
  const doors = planDoors(plan, theme, panels);
  // Car park: the ramp up to the street near the entrance, glowing with dawn light.
  let dawnAt = -1;
  for (let c = 1; park && dawnAt < 0 && c + 5 < sim.w; c++) {
    let ok = true;
    for (let x = c * V - 3; x < (c + 5) * V + 3; x++) if (onPanel(x)) ok = false;
    if (ok) dawnAt = c * V;
  }
  if (dawnAt >= 0)
    lights.push({ pos: [dawnAt / V + 2.5, 6, -2], radius: 6.5, color: [0.75, 0.5, 0.36] });
  /** Server hall: left voxel x of the T&S lettering, once per room, clear of the
   * artwork tall enough to reach the band. @type {number[]} */
  const bandAt = [];
  const tall = decor
    .filter(
      (d) =>
        !d.front &&
        ((d.type === 'poster' && d.y + 0.9 + POSTER_H > BAND_Y / V) ||
          (d.type === 'whiteboard' && d.y + 0.75 + WHITEBOARD_W * 0.75 > BAND_Y / V)),
    )
    .map((d) => {
      const w = d.type === 'whiteboard' ? WHITEBOARD_W : posterWidth(/** @type {string} */ (d.id));
      return [Math.floor((d.x - 0.35) * V), Math.ceil((d.x + w + 0.35) * V)];
    });
  for (let r0 = 0; dc && r0 < sim.w; r0 += 20)
    for (let c = r0 + 2; c < r0 + 15; c++) {
      const x0 = c * V - 2,
        x1 = c * V + 38;
      if (tall.some(([a, b]) => a < x1 && b > x0)) continue;
      bandAt.push(c * V);
      break;
    }
  if (roof) buildRoofBack(vol, sx, sim, decor);
  else
    for (let x = 0; x < sx; x++) {
      const panel = onPanel(x);
      for (let y = 0; y < sy; y++) {
        const ty = y / V;
        const inWindowBand = ty > 4.2 && ty < 9.6;
        if (park) {
          // Bare concrete, a blue level band and hazard stripes along the floor.
          const stripe = ty > 3.05 && ty < 3.45;
          const band = ty > 5.6 && ty < 6.1;
          if (dawnAt >= 0 && x >= dawnAt && x < dawnAt + 5 * V && ty > 4.2 && ty < 8.3) {
            const u = (x - dawnAt) / (5 * V),
              v = (ty - 4.2) / 4.1;
            if (x - dawnAt < 2 || dawnAt + 5 * V - x <= 2 || ty < 4.45 || ty > 8.05)
              vol.box(x, y, 0, x + 1, y + 1, 4, rgb('#4a4f58'));
            else if (v < 0.12 + u * 0.42) vol.box(x, y, 0, x + 1, y + 1, 1, rgb('#3a3e46'));
            else if (Math.hypot((u - 0.74) * 1.25, v - 0.6) < 0.075)
              vol.box(x, y, 0, x + 1, y + 1, 1, rgb('#fff1c9'), MAT.EMISSIVE);
            else
              vol.box(
                x,
                y,
                0,
                x + 1,
                y + 1,
                1,
                lerpColor(rgb('#d8643c'), rgb('#4f80b8'), v * 1.15 - 0.15),
                MAT.EMISSIVE,
              );
            continue;
          }
          // Neon strips under the ceiling: lime and pink, the Inetum colours.
          if (ty > 8.7 && ty < 8.85) {
            vol.box(x, y, 0, x + 1, y + 1, 4, rgb('#c6f432'), MAT.EMISSIVE);
            continue;
          }
          if (ty > 8.45 && ty < 8.55 && (x >> 5) % 3 === 0) {
            vol.box(x, y, 0, x + 1, y + 1, 4, rgb('#ff4f9a'), MAT.EMISSIVE);
            continue;
          }
          const c = stripe
            ? (x >> 2) % 2
              ? rgb('#f2c230')
              : rgb('#1c1c1c')
            : band
              ? rgb('#2f6fd6')
              : panel && inWindowBand
                ? rgb('#8e949e')
                : vary(rgb('#6b717c'), 0.07, 8)(x, y, 0);
          vol.box(x, y, 0, x + 1, y + 1, 3, c);
          continue;
        }
        if (dc && y >= BAND_Y && y < BAND_TOP) {
          // The T&S band filling the top of the glass, deep enough to stay in view under
          // the HUD: lime, with big navy pixel lettering once per room clear of artwork.
          const at = bandAt.find((b) => x >= b && x < b + 36);
          const lx = at === undefined ? -1 : x - at;
          const glyph = BAND_TEXT[Math.floor(lx / 12)];
          const px = (lx % 12) >> 1;
          const gy = (BAND_Y + 11 - y) >> 1;
          const letter =
            lx >= 0 &&
            glyph !== undefined &&
            px < 5 &&
            y >= BAND_Y + 2 &&
            y <= BAND_Y + 11 &&
            gy < 5 &&
            glyph[gy][px] === '1';
          vol.box(
            x,
            y,
            0,
            x + 1,
            y + 1,
            3,
            letter ? PALETTE.fascia : y === BAND_Y ? PALETTE.mullion : PALETTE.accent,
          );
          continue;
        }
        if (dc && inWindowBand && !panel) {
          // Server hall: rows of racks behind glass, LEDs blinking in the dark.
          const col = x % (V * 2);
          const frame = col < 1 || Math.abs(ty - 6.9) < 0.1;
          const led = col > 3 && col < 13 && y % 3 === 0 && noise(x, y, 7) > 0.72;
          const ledColor = [rgb('#46ff9b'), rgb('#58d5ff'), rgb('#ffb347')][(x + y) % 3];
          vol.box(x, y, 0, x + 1, y + 1, 1, frame ? rgb('#11161f') : rgb('#1d2430'));
          if (led) vol.box(x, y, 1, x + 1, y + 1, 2, ledColor, MAT.EMISSIVE);
          continue;
        }
        if (inWindowBand && !panel) {
          // Mullions, and a transom in the colour of the room.
          if (y === 56) vol.box(x, y, 0, x + 1, y + 1, 3, roomAccent(x >> 3, mood));
          else if (x % (V * 4) < 2 || Math.abs(ty - 6.9) < 0.12)
            vol.box(x, y, 0, x + 1, y + 1, 3, PALETTE.mullion);
          continue;
        }
        const base = dc ? rgb('#4a5568') : paint.wall;
        const c =
          ty < 1
            ? dc
              ? rgb('#2d3646')
              : paint.low
            : panel && inWindowBand
              ? dc
                ? rgb('#5b6678')
                : paint.panel
              : base;
        vol.box(x, y, 0, x + 1, y + 1, 3, vary(c, 0.05, 4)(x, y, 0));
        // A lime cable-tray stripe runs along the server hall.
        if (dc && Math.abs(ty - 3.6) < 0.07)
          vol.box(x, y, 3, x + 1, y + 1, 4, PALETTE.accent, MAT.EMISSIVE);
      }
    }
  if (!roof && !park) {
    // Panel edges: thin dark reveals so the wall panels read as built.
    for (const [a, b] of panels)
      for (const x of [a, b - 1]) vol.box(x, 4.2 * V, 3, x + 1, 9.6 * V, 4, PALETTE.mullion);
    // Window sills.
    vol.box(0, 4.2 * V - 1, 3, sx, 4.2 * V, 6, dc ? rgb('#2d3646') : paint.low);
  }
  if (theme === 'office') glassGlints(vol, sx, onPanel, paint.glint, mood === 'event');

  // Tiles.
  for (let r = 0; r < sim.h; r++)
    for (let c = 0; c < sim.w; c++) {
      const t = sim.tiles[c + r * sim.w];
      const x0 = c * V,
        y0 = r * V;
      const style = t === TILE.SOLID ? styleAt(c, r) : '';
      // Parked cars and meeting tables are drawn as props over their tiles.
      if (style === 'Q' || style === 'Y') continue;
      if (style === 'V') {
        // Server rack: graphite case, drive bays and status LEDs.
        vol.box(x0, y0, zv(-2.2), x0 + V, y0 + V, sz - 1, rgb('#232a36'));
        vol.box(x0, y0, sz - 1, x0 + V, y0 + V, sz, (x, y) =>
          x - x0 === 0 || x - x0 === V - 1
            ? rgb('#3a4252')
            : (y - y0) % 2
              ? rgb('#2c3441')
              : rgb('#171c25'),
        );
        for (let k = 1; k < V - 1; k += 2)
          if (noise(c, r, k) > 0.4)
            vol.box(
              x0 + k,
              y0 + 1 + ((c + k) % 5),
              sz - 1,
              x0 + k + 1,
              y0 + 2 + ((c + k) % 5),
              sz + 1,
              [rgb('#46ff9b'), rgb('#58d5ff'), rgb('#ffb347')][k % 3],
              MAT.EMISSIVE,
            );
        // Door handle, and a warning sticker on the bottom unit of some racks.
        vol.box(x0 + 6, y0 + 2, sz - 1, x0 + 7, y0 + 6, sz, PALETTE.metal, MAT.GLOSSY);
        if (styleAt(c, r - 1) !== 'V' && noise(c, r, 31) > 0.4) {
          vol.box(x0 + 1, y0 + 1, sz - 1, x0 + 4, y0 + 4, sz, PALETTE.hazard);
          vol.box(x0 + 2, y0 + 2, sz - 1, x0 + 3, y0 + 3, sz, rgb('#1b1b1b'));
        }
        if (styleAt(c, r + 1) !== 'V')
          vol.box(x0, y0 + V - 1, zv(-2.2), x0 + V, y0 + V, sz, PALETTE.accent);
        continue;
      }
      if (style === 'H') {
        // Rooftop HVAC unit: pale steel with louvres.
        vol.box(x0, y0, zv(-2), x0 + V, y0 + V, sz - 1, vary(rgb('#c7ccd3'), 0.04, 2));
        vol.box(x0, y0, sz - 1, x0 + V, y0 + V, sz, (_x, y) =>
          (y - y0) % 2 ? rgb('#9aa2ad') : rgb('#dfe3e8'),
        );
        if (styleAt(c, r + 1) !== 'H')
          vol.box(x0, y0 + V - 1, zv(-2), x0 + V, y0 + V, sz, rgb('#eef1f4'));
        continue;
      }
      if (style === 'M') {
        // Glass meeting room: frosted band, aluminium frame, a sign on top row.
        const top = styleAt(c, r + 1) !== 'M',
          bottom = styleAt(c, r - 1) !== 'M';
        vol.box(x0, y0, zv(-2.4), x0 + V, y0 + V, sz - 1, rgb('#6f8fa8'));
        vol.box(
          x0,
          y0,
          sz - 1,
          x0 + V,
          y0 + V,
          sz,
          (x, y) =>
            x - x0 === 0 || (top && y - y0 === V - 1) || (bottom && y - y0 === 0)
              ? rgb('#c9d1d9')
              : y - y0 === 3
                ? rgb('#e8f1f6')
                : rgb('#9cc6e0'),
          MAT.GLOSSY,
        );
        // Sticky notes left on the glass after the last workshop.
        for (let k = 0; k < 2; k++)
          if (noise(c, r, 17 + k) > 0.72) {
            const nx = x0 + 1 + Math.floor(noise(c, r, 23 + k) * 5);
            const ny = y0 + (k ? 4 : 1) + Math.floor(noise(c, r, 29 + k) * 2);
            vol.box(nx, ny, sz - 1, nx + 2, ny + 2, sz, STICKY[(c + r + k) % STICKY.length]);
          }
        if (bottom) vol.box(x0, y0 - 1, zv(-2.4), x0 + V, y0, sz, PALETTE.ceiling);
        continue;
      }
      if (style === 'B') {
        // Stacked reams of paper: white blocks with blue wrappers.
        vol.box(x0, y0, zv(-1.8), x0 + V, y0 + V, zv(0.8), (_x, y) =>
          (y - y0) % 4 < 1 ? rgb('#fbfbf6') : rgb('#3d8bfd'),
        );
        vol.box(x0 + 1, y0 + V, zv(-1.6), x0 + V - 1, y0 + V + 0, zv(0.6), rgb('#fbfbf6'));
        continue;
      }
      if (style === '#' && mood === 'lounge') {
        // Break room: a free-standing block two tiles wide and three tall is a vending machine.
        const vb = vendingAt(c, r);
        if (vb) {
          if (vb[0] === c && vb[1] === r) vendingMachine(vol, x0, y0, zv(-2.3), sz, c);
          continue;
        }
      }
      if (t === TILE.SOLID) {
        /** @param {number} dc @param {number} dr */
        const at = (dc, dr) => {
          const cc = c + dc,
            rr = r + dr;
          if (cc < 0 || cc >= sim.w || rr < 0 || rr >= sim.h) return TILE.SOLID;
          return sim.tiles[cc + rr * sim.w];
        };
        // Cars and meeting tables are props: the floor under them still gets its finish.
        const propAbove = 'QY'.includes(styleAt(c, r + 1));
        const above = propAbove ? TILE.EMPTY : at(0, 1),
          below = at(0, -1);
        const isCeiling = (r === sim.h - 1 && !roof) || (park && r >= 9 && above === TILE.SOLID);
        const isBase = r <= 1 || (roof && r <= 2);
        const floats = below !== TILE.SOLID && below !== TILE.HAZARD && !isCeiling;
        const depthBack = isCeiling || isBase ? 0 : zv(-2.4);
        if (roof && isBase) {
          // The building below: façade with lit windows, gravel roof and a parapet on top.
          const top = above !== TILE.SOLID;
          vol.box(x0, y0, zv(-2.6), x0 + V, y0 + V, sz, (x, y) =>
            !top && (x - x0) % 4 > 0 && (y - y0) % 4 > 1
              ? noise(x >> 2, y >> 2, 3) > 0.55
                ? rgb('#ffd98a')
                : rgb('#3b4a63')
              : rgb('#b9b2a6'),
          );
          if (top) {
            vol.box(x0, y0 + V - 2, zv(-2.6), x0 + V, y0 + V, sz, gravel);
            vol.box(x0, y0 + V - 2, sz - 2, x0 + V, y0 + V + 1, sz, parapet);
          }
          continue;
        }
        if (isBase) {
          // Building slab seen in section: concrete, with the floor below in shadow.
          vol.box(
            x0,
            y0,
            0,
            x0 + V,
            y0 + V,
            sz,
            r === 1 ? vary(PALETTE.concrete, 0.05, V) : rgb('#1a2132'),
          );
          if (r === 1) vol.box(x0, y0, sz - 1, x0 + V, y0 + 1, sz, rgb('#5c6170'));
        } else if (floats && park) {
          // Concrete slab with a painted safety edge.
          vol.box(x0, y0, depthBack, x0 + V, y0 + V, sz, concrete);
          vol.box(x0, y0, sz - 1, x0 + V, y0 + 2, sz, (x) =>
            (x >> 1) % 2 ? rgb('#f2c230') : rgb('#1c1c1c'),
          );
        } else if (floats) {
          // Free-standing platform: a module furnished for the room it stands in.
          floatModule(vol, mood, x0, y0, depthBack, sz, c, r, floorTop);
          // Steel posts down to the floor below, so mezzanines read as built, not floating.
          if (c % 3 === 0) {
            let fr = r - 1;
            while (fr > 0 && sim.tiles[c + fr * sim.w] === TILE.EMPTY) fr--;
            vol.box(
              x0 + 3,
              (fr + 1) * V,
              zv(-2.1),
              x0 + 5,
              y0,
              zv(-1.9),
              PALETTE.metal,
              MAT.GLOSSY,
            );
          }
        } else if (!isCeiling) {
          // Walls and pillars: painted plaster with a darker skirting.
          vol.box(
            x0,
            y0,
            depthBack,
            x0 + V,
            y0 + V,
            sz,
            park ? concrete : vary(dc ? rgb('#bdb4a6') : paint.pillar, 0.05, V),
          );
          wallFace(vol, theme, mood, paint, x0, y0, sz, c, r, {
            top: above !== TILE.SOLID,
            floor: below === TILE.SOLID && r - 1 <= (roof ? 2 : 1),
            left: at(-1, 0) !== TILE.SOLID,
            right: at(1, 0) !== TILE.SOLID,
          });
          if (above !== TILE.SOLID && roof) {
            // Raised roof terrace: gravel and a pale parapet.
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, gravel);
            vol.box(x0, y0 + V - 2, sz - 2, x0 + V, y0 + V + 1, sz, parapet);
          } else if (above !== TILE.SOLID)
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, floorTop);
        }
        if (above !== TILE.SOLID && !isCeiling && (isBase || (floats && park))) {
          // Carpet on top with a thin lime nosing on the front edge.
          vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, floorTop);
          vol.box(x0, y0 + V - 2, sz - 1, x0 + V, y0 + V - 1, sz, PALETTE.accent);
        }
        if (isCeiling) {
          vol.box(x0, y0, 0, x0 + V, y0 + V, sz, park ? concrete : rgb('#1a2132'));
          vol.box(
            x0,
            y0,
            0,
            x0 + V,
            y0 + 1,
            sz,
            park ? rgb('#8a909a') : dc ? PALETTE.ceiling : tiles,
          );
          const lamp = park ? c % 6 === 3 && below !== TILE.SOLID : c % 5 === 2;
          if (theme === 'office' && c % 5 === 0 && below !== TILE.SOLID)
            // Air diffusers between the light fittings.
            vol.box(x0 + 2, y0 - 1, zv(-1.4), x0 + 6, y0, zv(0), (x) =>
              x % 2 ? rgb('#9aa1aa') : rgb('#e2ded4'),
            );
          if (lamp && mood === 'lounge' && below !== TILE.SOLID) {
            // Break room: warm pendant shades on cords instead of ceiling panels.
            const cx = x0 + 3,
              z0 = zv(-1);
            vol.box(cx + 1, y0 - 6, z0 + 1, cx + 2, y0, z0 + 2, rgb('#2a2f38'));
            vol.box(cx - 1, y0 - 8, z0 - 1, cx + 4, y0 - 6, z0 + 4, rgb('#e86a3a'));
            vol.box(cx, y0 - 6, z0, cx + 3, y0 - 5, z0 + 3, rgb('#c4532b'));
            vol.box(cx, y0 - 9, z0, cx + 3, y0 - 8, z0 + 3, fixture.panel, MAT.EMISSIVE);
            lights.push({
              pos: [c + 0.5, r - 1.4, -0.6],
              radius: fixture.radius,
              color: fixture.color,
            });
          } else if (lamp) {
            // Office ceiling lights, cool tubes in the server room, neon in the car park.
            vol.box(
              x0 + (park ? 0 : 1),
              y0 - 1,
              zv(park ? -1.2 : -1.6),
              x0 + V - (park ? 0 : 1),
              y0,
              zv(park ? -0.6 : 0.4),
              fixture.panel,
              MAT.EMISSIVE,
            );
            lights.push({
              pos: [c + 0.5, r - 0.6, -0.6],
              radius: fixture.radius,
              color: fixture.color,
            });
          }
        }
      } else if (t === TILE.HAZARD) {
        // Open floor trap: cable trays with sparks.
        vol.box(x0, y0, zv(-2.4), x0 + V, y0 + 3, sz, PALETTE.concrete);
        for (let k = 0; k < 3; k++)
          vol.box(
            x0,
            y0 + 3 + k * 0,
            zv(-1.8) + k * 7,
            x0 + V,
            y0 + 5,
            zv(-1.8) + k * 7 + 3,
            k === 1 ? PALETTE.cable : rgb('#2b2b33'),
          );
        vol.box(x0, y0 + 2, sz - 2, x0 + V, y0 + 3, sz, (x) =>
          (x >> 1) % 2 ? PALETTE.hazard : rgb('#1b1b1b'),
        );
      }
    }

  const annex = jokes.some((j) => j.kind === 'foodtruck')
    ? new Volume(sx, sy, 17, 1 / V, [0, 0, -4.75])
    : null;
  furnish({
    vol,
    annex,
    sim,
    map,
    decor,
    theme,
    zv,
    onPanel,
    lights,
    mood,
    dawnAt,
    plan,
    jokes,
    doors,
  });
  for (const d of decor) placeDecor(vol, d, sz);
  let mesh = meshVolume(vol);
  for (const extra of [annex, buildForeground(plan, mood, trapCols), buildBackdrop(sim.w, mood)])
    if (extra) mesh = mergeMeshes(mesh, meshVolume(extra));
  return { vol, mesh, lights };
}

/**
 * @typedef {Object} FurnishContext
 * @property {Volume} vol
 * @property {Volume | null} annex Deck behind the roof edge (rooftop food truck), or null.
 * @property {import('../game/sim.js').Sim} sim
 * @property {string[]} map
 * @property {import('../data/levels/index.js').Decor[]} decor
 * @property {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @property {(z: number) => number} zv World z to voxel z.
 * @property {(x: number) => boolean} onPanel Whether a voxel column is reserved for artwork.
 * @property {Array<{pos: number[], radius: number, color: number[]}>} lights Point lights to add to.
 * @property {Mood} mood Light mood of the stage.
 * @property {number} dawnAt Car park: left voxel x of the daylight ramp opening (-1: none).
 * @property {FloorPlan} plan Ground floor survey (see {@link floorPlan}).
 * @property {Joke[]} jokes Joke props to build (see {@link planJokes}).
 * @property {number[]} doors Left columns of the doors in the back wall.
 */

/**
 * @typedef {Object} FloorPlan
 * @property {(c: number, r: number) => number} tile Tile at a column and row (solid outside).
 * @property {number[]} ground First empty row of every column.
 * @property {number} base The most common ground row: the ground floor.
 * @property {number} F Ground floor voxel y.
 * @property {number[]} arena Boss arena columns ([w, w] without a boss).
 * @property {Set<number>} busy Ground floor columns props and things keep for themselves.
 * @property {Set<number>} posts Columns where a post holds up a platform overhead.
 * @property {(c: number) => boolean} clear Whether column c is a plain, free stretch of ground floor.
 * @property {(c: number) => boolean} roomy Like `clear`, but a colleague, the start or a badge in
 *   front do not count.
 * @property {(x: number, y: number, z: number, radius: number, color: number[]) => void} pool
 *   Adds a light pool tied to a prop, at most two per 20-tile room.
 */

/**
 * Surveys the ground floor of a level: where it is, which columns props and things
 * already use, and which stretches are free for set dressing.
 * @param {import('../game/sim.js').Sim} sim
 * @param {string[]} map
 * @param {import('../data/levels/index.js').Decor[]} decor
 * @param {(x: number) => boolean} onPanel
 * @param {Array<{pos: number[], radius: number, color: number[]}>} lights
 * @returns {FloorPlan}
 */
export function floorPlan(sim, map, decor, onPanel, lights) {
  const { w, h, tiles } = sim;
  /** @param {number} c @param {number} r */
  const tile = (c, r) => (c < 0 || c >= w || r < 0 || r >= h ? TILE.SOLID : tiles[c + r * w]);
  /** First empty row from the bottom of a column (its ground level). @param {number} c */
  const groundOf = (c) => {
    let r = 0;
    while (r < h && tile(c, r) === TILE.SOLID) r++;
    return r;
  };
  const ground = Array.from({ length: w }, (_, c) => groundOf(c));
  /** @type {Record<number, number>} */
  const tally = {};
  for (const g of ground) tally[g] = (tally[g] ?? 0) + 1;
  const base = Number(Object.keys(tally).sort((a, b) => tally[+b] - tally[+a])[0]);
  const arena = sim.boss ? sim.boss.arena : [w, w];
  // Props and interactive things standing on the ground floor keep their space.
  const busy = new Set();
  for (const d of decor)
    if (d.type !== 'poster' && d.type !== 'whiteboard' && Math.abs(d.y - base) < 1.5)
      for (let c = Math.floor(d.x - 1.4); c <= Math.ceil(d.x + (d.type === 'desk' ? 6 : 1.4)); c++)
        busy.add(c);
  // Joke props only give way to the furniture-like things (a colleague, the start
  // or a badge stand in front of them well enough).
  const hard = new Set(busy);
  /** @type {Set<number>} */
  const posts = new Set();
  map.forEach((row, i) => {
    const r = h - 1 - i;
    if (r !== base && r !== base + 1) return;
    [...row].forEach((ch, c) => {
      if (!'dpPDEkJCnSX'.includes(ch)) return;
      for (let k = c - 1; k <= c + 1; k++) {
        busy.add(k);
        if (!'CnS'.includes(ch)) hard.add(k);
      }
    });
  });
  // Steel posts under the mezzanines (see floatModule) stand in the back too.
  for (let c = 0; c < w; c += 3)
    for (let r = base + 2; r < h - 1; r++)
      if (tile(c, r) === TILE.SOLID && tile(c, r - 1) === TILE.EMPTY) {
        busy.add(c);
        hard.add(c);
        posts.add(c);
      }
  /** @param {number} c */
  const clear = (c) =>
    ground[c] === base &&
    tile(c, base) === TILE.EMPTY &&
    tile(c, base + 1) === TILE.EMPTY &&
    !busy.has(c) &&
    (c < arena[0] - 1 || c > arena[1]) &&
    !onPanel(c * V) &&
    !onPanel(c * V + V - 1);
  /** @param {number} c */
  const roomy = (c) =>
    ground[c] === base &&
    tile(c, base) === TILE.EMPTY &&
    tile(c, base + 1) === TILE.EMPTY &&
    !hard.has(c) &&
    (c < arena[0] - 1 || c > arena[1]) &&
    !onPanel(c * V) &&
    !onPanel(c * V + V - 1);
  /** @type {Record<number, number>} */
  const perRoom = {};
  /** @type {FloorPlan['pool']} */
  const pool = (x, y, z, radius, color) => {
    const room = Math.floor(x / 20);
    if ((perRoom[room] ?? 0) >= 2) return;
    perRoom[room] = (perRoom[room] ?? 0) + 1;
    lights.push({ pos: [x, y, z], radius, color });
  };
  return { tile, ground, base, F: base * V, arena, busy, posts, clear, roomy, pool };
}

/**
 * Accent colour of the named room a column belongs to (rooms are 20 tiles wide):
 * door leaves, sign pictograms and the window transom take it, so each room has
 * its own colour on top of the house lime.
 * @param {number} c
 * @param {Mood} mood
 */
function roomAccent(c, mood) {
  const k = Math.floor(c / 20) % ROOM_ACCENTS.length;
  return mood === 'event' || mood === 'night'
    ? lerpColor(ROOM_ACCENTS[k], rgb('#1d1830'), 0.25)
    : ROOM_ACCENTS[k];
}
const ROOM_ACCENTS = [
  rgb('#9fd12a'),
  rgb('#e0408a'),
  rgb('#3d8bfd'),
  rgb('#f29a38'),
  rgb('#2fb5a3'),
];

/**
 * @typedef {Object} Joke
 * @property {'coffee'|'roadmap'|'monitoring'|'photobooth'|'foodtruck'} kind
 * @property {number} c Left column.
 * @property {number} w Width in tiles.
 */

/** Width in tiles of each joke prop, and whether it hangs on the back wall too. */
const JOKES = /** @type {const} */ ({
  coffee: { w: 3, wall: false },
  roadmap: { w: 5, wall: true },
  monitoring: { w: 5, wall: true },
  photobooth: { w: 2, wall: false },
  foodtruck: { w: 6, wall: false },
});

/**
 * One joke prop per stage mood, set in the longest free stretches of the ground
 * floor (the empty rooms of the director's notes): the COPIL coffee station and its
 * post-it roadmap, the PRIMO monitoring wall of the server hall, the seminar photo
 * booth and the rooftop food truck. Wall pieces reserve their columns of the façade
 * (pushed to `panels`), floor pieces their columns of the floor (`plan.busy`).
 * @param {FloorPlan} plan
 * @param {Mood} mood
 * @param {Array<number[]>} panels
 * @param {(x: number) => boolean} onPanel
 * @returns {Joke[]}
 */
function planJokes(plan, mood, panels, onPanel) {
  /** @type {Array<Joke['kind']>} */
  const kinds =
    mood === 'corporate'
      ? ['roadmap', 'coffee']
      : mood === 'night'
        ? ['monitoring']
        : mood === 'event'
          ? ['photobooth']
          : mood === 'dusk'
            ? ['foodtruck']
            : [];
  /** @type {Joke[]} */
  const out = [];
  const taken = new Set();
  const w = plan.ground.length;
  for (const kind of kinds) {
    const need = JOKES[kind].w;
    // Free runs: floor pieces want the floor and the wall above them clear; wall
    // pieces only the wall, and no platform in front hiding them; the food truck
    // parks behind the roof edge, clear of the billboards.
    const { wall } = JOKES[kind];
    /** @param {number} c */
    const open = (c) => {
      if (taken.has(c) || (c >= plan.arena[0] - 2 && c <= plan.arena[1])) return false;
      if (onPanel(c * V) || onPanel(c * V + V - 1)) return false;
      if (kind === 'foodtruck') return plan.ground[c] === plan.base;
      if (!wall)
        return plan.roomy(c) && [2, 3].every((k) => plan.tile(c, plan.base + k) === TILE.EMPTY);
      return (
        !plan.posts.has(c) && [1, 2, 3, 4].every((k) => plan.tile(c, plan.base + k) === TILE.EMPTY)
      );
    };
    let best = -1,
      bestLen = 0;
    for (let c = 1; c < w - 1;) {
      if (!open(c)) {
        c++;
        continue;
      }
      let e = c;
      while (e < w - 1 && open(e)) e++;
      if (e - c > bestLen) {
        bestLen = e - c;
        best = c;
      }
      c = e;
    }
    if (bestLen < need) continue;
    const c = best + Math.floor((bestLen - need) / 2);
    out.push({ kind, c, w: need });
    for (let k = c - 1; k <= c + need; k++) {
      plan.busy.add(k);
      taken.add(k);
    }
    if (JOKES[kind].wall) panels.push([c * V - 3, (c + need) * V + 3]);
  }
  return out;
}

/**
 * A door in the back wall at every room boundary, where the floor in front is free.
 * Their columns of the façade become solid wall (pushed to `panels`).
 * @param {FloorPlan} plan
 * @param {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @param {Array<number[]>} panels
 * @returns {number[]} Left column of each door (two tiles wide).
 */
function planDoors(plan, theme, panels) {
  if (theme !== 'office' && theme !== 'datacenter') return [];
  /** @type {number[]} */
  const out = [];
  const w = plan.ground.length;
  for (let b = 20; b < w - 4; b += 20)
    for (const d of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const c = b + d;
      if (!plan.clear(c) || !plan.clear(c + 1)) continue;
      out.push(c);
      for (let k = c - 1; k <= c + 2; k++) plan.busy.add(k);
      panels.push([c * V, c * V + 2 * V]);
      break;
    }
  return out;
}

/** Bottom voxel row of the T&S band of the server hall (in the top pane of the glass). */
const BAND_Y = 64;
/** First voxel row above the T&S band: the top of the glass. */
const BAND_TOP = Math.floor(9.6 * V) + 1;

/** "T&S" in 5×5 pixel glyphs (rows top to bottom), for the server hall band. */
const BAND_TEXT = [
  ['11111', '00100', '00100', '00100', '00100'],
  ['01100', '10010', '01101', '10010', '01101'],
  ['01111', '10000', '01110', '00001', '11110'],
];

/** 3×5 pixel digits for the car park bay numbers, rows top to bottom. */
const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001010010010',
  '111101111101111',
  '111101111001111',
];

/**
 * Purely visual dressing behind the gameplay plane: the back row of desks, signage,
 * cable trays, pipes, vents... Collision comes from the sim tiles, never from this.
 * @param {FurnishContext} ctx
 */
function furnish({
  vol,
  annex,
  sim,
  map,
  decor,
  theme,
  zv,
  onPanel,
  lights,
  mood,
  dawnAt,
  plan,
  jokes,
  doors,
}) {
  const { w, h } = sim;
  const { tile, ground, base, F, arena, busy, clear, pool } = plan;
  for (const j of jokes) jokeProp(j.kind === 'foodtruck' && annex ? annex : vol, j, F, pool);
  for (const c of doors) door(vol, theme, mood, c * V + 2, F, roomAccent(c + 1, mood));
  /** Whether column c is open under the ceiling (rows ceilRow-2 .. ceilRow-1). */
  /** @param {number} c @param {number} ceil */
  const openBelow = (c, ceil) =>
    tile(c, ceil - 1) === TILE.EMPTY && tile(c, ceil - 2) === TILE.EMPTY;

  if (theme === 'office') {
    // Far back row, in groups of three: desks in an open space, credenzas at the
    // head office, sofas in the break room, the buffet at the seminar.
    let pod = 0;
    for (let c = 1; c < w - 2;) {
      if (!clear(c) || !clear(c + 1)) {
        c++;
        pod = 0;
        continue;
      }
      backRow(vol, mood, c * V, F, noise(c, base, 41), pod, pool);
      c += 2;
      if (++pod === 3) {
        c++;
        pod = 0;
      }
    }
    // A skirting board in the wall's darker paint, cable trunking over it with a
    // double socket every other tile (the doors interrupt both).
    const skirting = (WALLS[mood] ?? WALLS.morning)?.low ?? PALETTE.wallLow;
    for (let c = 0; c < w; c++) {
      if (ground[c] !== base || tile(c, base) !== TILE.EMPTY) continue;
      if (doors.some((d) => c >= d && c < d + 2)) continue;
      vol.box(c * V, F - 1, 3, c * V + V, F + 2, 4, skirting);
      vol.box(c * V, F + 2, 3, c * V + V, F + 4, 5, (x) =>
        x % (2 * V) === 0 ? rgb('#c9c6be') : rgb('#e6e3dc'),
      );
      if (c % 2 === 0) vol.box(c * V + 3, F + 2, 5, c * V + 6, F + 4, 6, rgb('#f7f5ef'));
    }
    // Plant boxes on the window sills.
    for (let c = 2; c < w - 2; c += 7) {
      const x = c * V;
      if (onPanel(x - 2) || onPanel(x + V + 2) || tile(c, 4) !== TILE.EMPTY) continue;
      if (noise(c, 3, 43) < 0.25) continue;
      vol.box(x, 34, 3, x + V, 36, 6, rgb('#f0eee8'));
      vol.box(x, 35, 5, x + V, 36, 6, PALETTE.fascia);
      for (let px = x; px < x + V; px++)
        for (let pz = 3; pz < 6; pz++) {
          const top = 36 + Math.floor(noise(px, pz, 47) * 3.2);
          vol.box(
            px,
            36,
            pz,
            px + 1,
            top,
            pz + 1,
            noise(px, pz, 53) > 0.5 ? PALETTE.leaf : PALETTE.leafLight,
          );
        }
    }
    // Ceiling-hung room signs: navy, lime trim, a pictogram and the room's name.
    const rooms = LEVELS.find((l) => l.decor === decor)?.rooms ?? [];
    for (let room = 0; room * ROOM_W < w; room++) {
      const cx = room * ROOM_W + 9;
      if (cx >= arena[0] - 2) continue;
      const label = signLabel(rooms[room] ?? '', 52);
      const tw = label ? textWidth(label) : 0;
      const sw = tw ? 13 + tw : 24;
      const x0 = cx * V - (sw >> 1),
        x1 = x0 + sw;
      let ok = true;
      for (let x = x0 - 2; x < x1 + 2; x++) if (onPanel(x)) ok = false;
      for (let c = (x0 >> 3) - 1; c <= (x1 >> 3) + 1; c++) if (!openBelow(c, h - 1)) ok = false;
      if (!ok) continue;
      const top = (h - 1) * V;
      for (const wx of [x0 + 3, x1 - 4]) vol.box(wx, top - 4, 9, wx + 1, top, 10, rgb('#2a2f38'));
      vol.box(x0, top - 13, 8, x1, top - 4, 10, PALETTE.fascia);
      vol.box(x0, top - 13, 8, x1, top - 12, 11, PALETTE.accent);
      const tile = room % 3 === 1 ? rgb('#ff4f9a') : PALETTE.accent;
      vol.box(x0 + 2, top - 12, 10, x0 + 9, top - 5, 11, tile);
      PICTOS[signPicto(rooms[room] ?? '')].forEach((row, i) => {
        for (let k = 0; k < 5; k++)
          if (row[k] === '1')
            vol.box(x0 + 3 + k, top - 7 - i, 10, x0 + 4 + k, top - 6 - i, 12, PALETTE.fascia);
      });
      if (label) text(vol, label, x0 + 11, top - 11, 10, rgb('#f4f1ea'));
      else vol.box(x0 + 11, top - 9, 10, x0 + 20, top - 8, 11, rgb('#f4f1ea'));
    }
    const top = (h - 1) * V;
    if (mood === 'event')
      // Seminar: fabric banners hung from the ceiling, in the event colours.
      for (let c = 3; c < Math.min(w - 2, arena[0] - 2); c += 6) {
        if (c % 20 >= 7 && c % 20 <= 11) continue;
        if (onPanel(c * V - 1) || onPanel(c * V + V) || !openBelow(c, h - 1)) continue;
        if (tile(c, h - 4) !== TILE.EMPTY) continue;
        const x = c * V;
        const k = Math.floor(c / 6) % 3;
        const cloth = [rgb('#c2367f'), rgb('#5b3fa8'), rgb('#1f2a44')][k];
        vol.box(x - 1, top - 3, 5, x + V + 1, top - 2, 7, rgb('#2a2f38'));
        vol.box(x, top - 24, 6, x + V, top - 3, 7, cloth);
        vol.box(x, top - 22, 6, x + V, top - 21, 8, k === 1 ? rgb('#ff8fc8') : PALETTE.accent);
        vol.box(x + 2, top - 12, 6, x + 6, top - 8, 8, k === 2 ? rgb('#ff4f9a') : PALETTE.accent);
        vol.box(x + 3, top - 26, 6, x + 5, top - 24, 7, cloth);
      }
    if (mood === 'lounge')
      // Break room: trailing plants hung from the ceiling between the pendants.
      for (let c = 0; c < w; c += 5) {
        if (c % 20 >= 7 && c % 20 <= 11) continue;
        if (!openBelow(c, h - 1) || tile(c, h - 4) !== TILE.EMPTY) continue;
        const x = c * V + 2,
          z = zv(-1.8);
        vol.box(x + 1, top - 6, z + 1, x + 2, top, z + 2, rgb('#2a2f38'));
        vol.box(x - 1, top - 9, z - 1, x + 4, top - 6, z + 4, rgb('#f0eee8'));
        vol.box(x - 1, top - 7, z - 1, x + 4, top - 6, z + 4, rgb('#c4704e'));
        for (let k = -2; k < 6; k++) {
          const len = 2 + Math.floor(noise(c, k, 97) * 9);
          const lz = k % 2 ? z - 1 : z + 3;
          vol.box(
            x + k,
            top - 7 - len,
            lz,
            x + k + 1,
            top - 6,
            lz + 1,
            k % 3 ? PALETTE.leaf : PALETTE.leafLight,
          );
        }
      }
  }

  if (theme === 'datacenter') {
    // Ceiling cable tray with colour-coded runs, hung on threaded rods.
    const top = (h - 1) * V;
    const runs = [
      rgb('#3d8bfd'),
      rgb('#f2c230'),
      PALETTE.cable,
      PALETTE.accent,
      rgb('#46c9b8'),
      rgb('#3d8bfd'),
    ];
    for (let c = 0; c < w; c++) {
      if (!openBelow(c, h - 1)) continue;
      const x = c * V;
      vol.box(x, top - 4, 4, x + V, top - 3, 12, rgb('#5d6675'));
      for (const z of [4, 11]) vol.box(x, top - 3, z, x + V, top - 2, z + 1, rgb('#7c8594'));
      runs.forEach((col, k) => vol.box(x, top - 3, 5 + k, x + V, top - 2, 6 + k, col));
      if (c % 2 === 0)
        for (const z of [4, 11]) vol.box(x + 3, top - 2, z, x + 4, top, z + 1, PALETTE.metal);
    }
    // Floor-standing fire-suppression cylinders and cabling in the back.
    for (let c = 2; c < w - 2; c += 9)
      if (clear(c) && noise(c, 0, 61) > 0.3) {
        const x = c * V + 2;
        vol.box(x, F, 4, x + 3, F + 9, 7, rgb('#d23a3a'));
        vol.box(x + 1, F + 9, 5, x + 2, F + 10, 6, rgb('#2a2f38'));
        vol.box(x, F + 5, 6, x + 3, F + 7, 7, rgb('#f4f1ea'));
      }
  }

  if (theme === 'parking') {
    // Ceiling services: a ventilation duct and the red sprinkler main, on brackets.
    let ceil = h - 1;
    while (ceil > 0 && tile(Math.floor(w / 2), ceil - 1) === TILE.SOLID) ceil--;
    const top = ceil * V;
    for (let c = 0; c < w; c++) {
      if (!openBelow(c, ceil)) continue;
      const x = c * V;
      vol.box(x, top - 4, 3, x + V, top - 1, 7, (px) =>
        px % (2 * V) < 1 ? rgb('#7d838c') : rgb('#a3a9b2'),
      );
      vol.box(x, top - 2, 9, x + V, top - 1, 10, rgb('#d23a3a'));
      if (c % 3 === 0) vol.box(x + 4, top - 1, 4, x + 5, top, 10, rgb('#5c6170'));
      if (c % 4 === 2) vol.box(x + 5, top - 3, 9, x + 6, top - 2, 10, rgb('#c9a227'));
    }
    // Bay numbers on the wall and wheel stops on the floor.
    for (let bay = 0; bay * 3 < w; bay++) {
      const cx = bay * 3 * V + 12;
      const c = cx >> 3;
      if (ground[c] !== base || tile(c, base) !== TILE.EMPTY) continue;
      if (!onPanel(cx - 5) && !onPanel(cx + 5)) {
        const n = String(bay + 1).padStart(2, '0');
        [...n].forEach((ch, k) => {
          const g = DIGITS[+ch];
          for (let i = 0; i < 15; i++)
            if (g[i] === '1') {
              const px = cx - 4 + k * 5 + (i % 3);
              const py = F + 13 - Math.floor(i / 3);
              vol.box(px, py, 3, px + 1, py + 1, 4, rgb('#e9e6dc'));
            }
        });
      }
      if (!busy.has(c))
        vol.box(cx - 5, F, zv(-2.1), cx + 5, F + 1, zv(-1.85), (x) =>
          Math.abs(x - cx) > 3 ? rgb('#f2c230') : rgb('#c9c4b8'),
        );
    }
    // Fire extinguisher cabinets.
    for (let c = 6; c < w - 2; c += 13) {
      const x = c * V;
      if (ground[c] !== base || onPanel(x - 2) || onPanel(x + V + 2)) continue;
      if (dawnAt >= 0 && x + V + 8 > dawnAt && x - 8 < dawnAt + 5 * V) continue;
      vol.box(x + 1, F + 5, 3, x + 7, F + 13, 5, rgb('#d7263d'));
      vol.box(x + 2, F + 6, 4, x + 6, F + 12, 5, rgb('#f1f1f1'), MAT.GLOSSY);
      vol.box(x + 3, F + 7, 4, x + 5, F + 11, 6, rgb('#c41d2f'));
      vol.box(x + 3, F + 11, 5, x + 4, F + 12, 6, rgb('#2a2f38'));
      vol.box(x + 2, F + 14, 3, x + 6, F + 16, 4, rgb('#d7263d'));
    }
  }

  if (theme === 'rooftop') {
    // Mushroom vents, a cable duct along the back and a few antennas.
    for (let c = 1; c < w - 1; c++) {
      if (ground[c] !== base || tile(c, base) !== TILE.EMPTY) continue;
      const x = c * V;
      vol.box(x, F, 4, x + V, F + 2, 6, (px) =>
        px % (2 * V) === 0 ? rgb('#6f757e') : rgb('#9aa1aa'),
      );
      if (c % 2 === 0 && tile(c, base) === TILE.EMPTY)
        vol.box(x + 3, F, 6, x + 5, F + 1, 7, rgb('#5c6170'));
      if (!clear(c) || noise(c, 2, 67) < 0.72) continue;
      vol.box(x + 3, F, 9, x + 5, F + 4, 11, rgb('#c9ced5'));
      vol.box(x + 2, F + 4, 8, x + 6, F + 5, 12, rgb('#9aa2ad'));
    }
    for (let c = 3; c < w - 3; c += 11) {
      const x = c * V + 4;
      if (ground[c] !== base || onPanel(x - 6) || onPanel(x + 6) || c >= arena[0] - 2) continue;
      if (noise(c, 5, 71) < 0.35) continue;
      const hgt = 14 + Math.floor(noise(c, 6, 73) * 10);
      vol.box(x, F, 4, x + 1, F + hgt, 5, rgb('#4a505c'));
      for (let k = 1; k < 4; k++)
        vol.box(x - 3 + k, F + hgt - k * 4, 4, x + 4 - k, F + hgt - k * 4 + 1, 5, rgb('#4a505c'));
      vol.box(x, F + hgt, 4, x + 1, F + hgt + 1, 5, rgb('#ff3b3b'), MAT.EMISSIVE);
    }
    // Golden hour: festoon lights strung between posts over the terrace.
    const bulbs = [rgb('#ffd27a'), rgb('#ffb066'), rgb('#fff1c9')];
    const z = zv(-2);
    const top = (base + 5) * V;
    /** Whether a post can stand in column c, from the roof up to the string. @param {number} c */
    const post = (c) => {
      if (ground[c] !== base || onPanel(c * V) || c >= arena[0] - 2) return false;
      for (let r = base; r <= base + 5; r++) if (tile(c, r) !== TILE.EMPTY) return false;
      return true;
    };
    for (let c = 2; c + 10 < w; c += 10) {
      if (!post(c) || !post(c + 10)) continue;
      const a = c * V + 4,
        b = (c + 10) * V + 4;
      for (const px of [a, b]) vol.box(px, F, z, px + 1, top + 1, z + 1, rgb('#4a505c'));
      for (let x = a + 1; x < b; x++) {
        const t = (x - a) / (b - a);
        const y = top - Math.round(7 * 4 * t * (1 - t));
        if (tile(x >> 3, y >> 3) !== TILE.EMPTY) continue;
        vol.box(x, y, z, x + 1, y + 1, z + 1, rgb('#2a2f38'));
        if ((x - a) % 5 === 2)
          vol.box(x, y - 1, z, x + 1, y, z + 1, bulbs[(((x - a) / 5) % 3) | 0], MAT.EMISSIVE);
      }
      lights.push({ pos: [c + 5.5, base + 4.2, -1.6], radius: 5.5, color: [0.62, 0.38, 0.16] });
    }
  }

  if (theme === 'parking') {
    // The lime and pink neon strips wash the concrete in colour.
    for (let c = 2; c < w; c += 6) {
      const pink = c % 12 === 2;
      if (tile(c, 8) !== TILE.EMPTY) continue;
      lights.push({
        pos: [c + 0.5, pink ? 8.2 : 8.5, -2.4],
        radius: 5,
        color: pink ? [0.75, 0.14, 0.42] : [0.4, 0.62, 0.1],
      });
    }
  }

  if (theme === 'datacenter') {
    // Cold-aisle LED line along the skirting and a blue wash from the floor grilles.
    for (let c = 0; c < w; c++)
      if (ground[c] === base && tile(c, base) === TILE.EMPTY && !onPanel(c * V))
        vol.box(c * V, F, 3, c * V + V, F + 1, 4, rgb('#3fa9ff'), MAT.EMISSIVE);
    for (let c = 4; c < w; c += 10)
      if (ground[c] === base)
        lights.push({ pos: [c + 0.5, base + 0.5, -2.2], radius: 5, color: [0.08, 0.26, 0.6] });
    // Racks glow green from their status LEDs.
    for (let c = 0; c < w; c++)
      for (let r = 1; r < h - 1; r++) {
        const row = map[h - 1 - r];
        if (row?.[c] === 'V' && map[h - 2 - r]?.[c] !== 'V')
          lights.push({ pos: [c + 0.5, r + 0.5, 2], radius: 3.2, color: [0.08, 0.4, 0.3] });
      }
  }

  if (mood === 'event') {
    // Seminar evening: coloured uplights along the back wall.
    const tints = [
      [0.75, 0.18, 0.5],
      [0.85, 0.46, 0.14],
      [0.36, 0.26, 0.85],
    ];
    const lens = [rgb('#ff5fb4'), rgb('#ffb347'), rgb('#7d6bff')];
    let k = 0;
    for (let c = 3, last = -9; c < w - 2; c++) {
      if (c - last < 7 || ground[c] !== base || tile(c, base) !== TILE.EMPTY) continue;
      if (onPanel(c * V) || onPanel(c * V + V - 1) || busy.has(c)) continue;
      last = c;
      const x = c * V + 2;
      vol.box(x, F, 3, x + 4, F + 2, 6, rgb('#1d2028'));
      vol.box(x + 1, F + 2, 3, x + 3, F + 3, 5, lens[k % 3], MAT.EMISSIVE);
      lights.push({ pos: [c + 0.5, base + 0.6, -2.2], radius: 5.5, color: tints[k++ % 3] });
    }
  }
}

/**
 * A free-standing platform tile, built as the furniture of its room so mezzanines
 * read as part of the place: a steel catwalk in the server hall and on the roof,
 * lockers in the open space, a bookcase on the intercontrat plateau, binders in a
 * walnut case at head office, open oak shelves in the break room, a carpeted riser
 * at the seminar. Whatever the module, the top is a flat deck with the lime nosing
 * every standable edge has. Collision is the tile's, never this.
 * @param {Volume} vol
 * @param {Mood} mood
 * @param {number} x0 @param {number} y0 Voxel corner of the tile.
 * @param {number} z0 Back voxel z. @param {number} sz Front voxel z.
 * @param {number} c @param {number} r Tile column and row (variation seed).
 * @param {(x: number, y: number, z: number) => number} floorTop Floor finish of the stage.
 */
function floatModule(vol, mood, x0, y0, z0, sz, c, r, floorTop) {
  const f = sz - 1;
  /** Front face pattern, in tile-local voxel coordinates. @param {(px: number, py: number) => number} paint */
  const front = (paint) => vol.box(x0, y0, f, x0 + V, y0 + 6, sz, (x, y) => paint(x - x0, y - y0));
  /** @param {number} body @param {number} deck */
  const body = (body, deck) => {
    vol.box(x0, y0, z0, x0 + V, y0 + 6, f, body);
    vol.box(x0, y0 + 6, z0, x0 + V, y0 + V, sz, deck);
  };
  if (mood === 'night' || mood === 'dusk') {
    // Steel catwalk: grating deck, yellow toe board, a braced girder in front of a dark web.
    const steel = mood === 'night' ? rgb('#7d8796') : rgb('#a7aeb7');
    body(rgb('#1e242e'), 0);
    vol.box(x0, y0 + 6, z0, x0 + V, y0 + V, sz, (x) => (x % 2 ? rgb('#5f6876') : rgb('#8a94a3')));
    const flip = c % 2;
    front((px, py) => {
      if (py === 0 || py === 5) return steel;
      const d = 1 + ((flip ? px : 7 - px) * 4) / 7;
      return Math.abs(py - d) < 0.7 ? steel : rgb('#232a35');
    });
    vol.box(x0, y0 + 6, f, x0 + V, y0 + 7, sz + 1, rgb('#e2b42a'));
  } else if (mood === 'morning') {
    // Steel lockers, two doors a tile, with vents, a handle and a number tag.
    const paints = [rgb('#7fa7c9'), rgb('#9fc3a8'), rgb('#e8c26e'), rgb('#c9a4d6')];
    const paint = paints[(c >> 1) % paints.length];
    const seam = lerpColor(paint, 0x000000, 0.35);
    body(lerpColor(paint, 0x000000, 0.2), rgb('#3a4252'));
    front((px, py) => {
      const dx = px % 4;
      if (dx === 0) return seam;
      if (py === 4 && dx !== 3) return rgb('#2b3446');
      if (py === 2 && dx === 3) return PALETTE.metal;
      if (py === 3 && dx === 1 && (c + px) % 3 === 0) return rgb('#f4f1ea');
      return paint;
    });
  } else if (mood === 'idle' || mood === 'corporate' || mood === 'lounge') {
    // Shelving: a frame with two shelves of books, binders or crockery.
    const wood =
      mood === 'corporate' ? rgb('#5a3c28') : mood === 'lounge' ? rgb('#c49466') : rgb('#8a5f3c');
    const back = lerpColor(wood, 0x000000, 0.45);
    body(back, wood);
    const books = [rgb('#c2367f'), rgb('#3d8bfd'), rgb('#e0a83a'), rgb('#2f8f8a'), rgb('#e8735a')];
    const binders = [
      PALETTE.fascia,
      rgb('#2b3a5e'),
      PALETTE.accent,
      rgb('#ff4f9a'),
      rgb('#3d8bfd'),
    ];
    front((px, py) => {
      if (px === 0 || py === 0 || py === 3) return wood;
      const shelf = py < 3 ? 0 : 1,
        hy = py - shelf * 3;
      const n = noise(c * 8 + px, r * 2 + shelf, 13);
      if (mood === 'corporate')
        // Binders standing in a row, white spine labels.
        return hy === 1 && px % 2 ? rgb('#f4f1ea') : binders[Math.floor(n * 5)];
      if (mood === 'lounge') {
        // Mugs, jars and a pot plant, with gaps between.
        const k = Math.floor(noise(c, r * 2 + shelf, 17) * 3);
        const item = (px + k) % 4;
        if (item === 0) return back;
        if (k === 0) return hy === 2 && item === 2 ? PALETTE.leafLight : rgb('#f4efe6');
        if (k === 1) return hy === 2 ? rgb('#d8643c') : rgb('#9fd8ff');
        return hy === 2 ? PALETTE.leaf : PALETTE.pot;
      }
      // Books of mixed heights, a gap now and then.
      if (n < 0.12) return back;
      return hy === 2 && n < 0.45 ? back : books[Math.floor(n * 97) % 5];
    });
  } else if (mood === 'event') {
    // Stage riser: pleated black skirt under a carpeted deck.
    body(rgb('#16141c'), 0);
    vol.box(x0, y0 + 6, z0, x0 + V, y0 + V, sz, floorTop);
    front((px) => (px % 2 ? rgb('#1a1822') : rgb('#262330')));
  } else {
    // Filing cabinets: drawers with chrome handles.
    body(rgb('#c9cfd6'), 0);
    vol.box(x0, y0 + 6, z0, x0 + V, y0 + V, sz, floorTop);
    front((px, py) =>
      py === 3 || px === 0
        ? rgb('#9aa3ad')
        : (py === 1 || py === 5) && px > 2 && px < 5
          ? rgb('#7b8590')
          : rgb('#dfe4ea'),
    );
  }
  // Lime nosing on the front edge of the deck: this is a floor.
  vol.box(x0, y0 + V - 2, f, x0 + V, y0 + V - 1, sz, PALETTE.accent);
}

/**
 * A vending machine filling a block of 2×3 tiles (its top is a floor): a lit header,
 * a glass front over rows of snacks or cans, the keypad, a card reader and the
 * pick-up flap. Red for drinks, navy for snacks, alternating along the room.
 * @param {Volume} vol
 * @param {number} x0 @param {number} y0 Voxel corner of the bottom-left tile.
 * @param {number} z0 Back voxel z. @param {number} sz Front voxel z.
 * @param {number} c Tile column (picks the kind).
 */
function vendingMachine(vol, x0, y0, z0, sz, c) {
  const drinks = c % 4 < 2;
  const body = drinks ? rgb('#d8343c') : PALETTE.fascia;
  const edge = lerpColor(body, 0, 0.3);
  const W = 2 * V,
    H = 3 * V,
    f = sz - 1;
  vol.box(x0, y0, z0, x0 + W, y0 + H, f, body);
  vol.box(x0, y0 + H - 1, z0, x0 + W, y0 + H, sz, rgb('#2b2f36'));
  const goods = drinks
    ? [rgb('#ff8a3d'), rgb('#58d5ff'), rgb('#c6f432'), rgb('#f4f1ea'), rgb('#ffd166')]
    : [rgb('#ffd166'), rgb('#ff4f9a'), rgb('#e0a83a'), rgb('#9b7bff'), rgb('#e8735a')];
  vol.box(x0, y0, f, x0 + W, y0 + H - 1, sz, (x, y) => {
    const px = x - x0,
      py = y - y0;
    if (px === 0 || px === W - 1) return edge;
    // Lit header with the house stripe.
    if (py >= H - 4)
      return py === H - 4 ? (drinks ? rgb('#f4f1ea') : PALETTE.accent) : rgb('#fff1e8');
    // Glass front: rows of products on spiral shelves, a sheen across it.
    if (px >= 2 && px <= 10 && py >= 6 && py <= H - 6) {
      if (px + py === 22 || px + py === 23) return rgb('#4a6078');
      const row = (py - 6) % 4;
      if (row === 0) return rgb('#8a94a3');
      if (row === 3 || px % 2 === 0) return rgb('#141b28');
      return goods[(Math.floor((py - 6) / 4) * 3 + (px >> 1) + c) % goods.length];
    }
    // Keypad side: display, keys, card reader, coin return.
    if (px >= 12 && px <= 14) {
      if (py === H - 7) return rgb('#46ff9b');
      if (py >= 11 && py <= 15) return (px + py) % 2 ? rgb('#e2e7ec') : edge;
      if (py === 9) return rgb('#ff4f9a');
      if (py === 6) return rgb('#1b1d22');
    }
    // Pick-up flap.
    if (px >= 2 && px <= 10 && py >= 2 && py <= 4)
      return py === 4 ? rgb('#4a5160') : rgb('#1b1d22');
    return body;
  });
  const lit = [
    [x0 + 1, y0 + H - 3, x0 + W - 1, y0 + H - 1],
    [x0 + 12, y0 + H - 7, x0 + 15, y0 + H - 6],
  ];
  for (const [a, b, c1, d] of lit)
    vol.box(a, b, f, c1, d, sz, drinks ? rgb('#fff1e8') : rgb('#e6f5ff'), MAT.EMISSIVE);
  vol.box(x0 + 12, y0 + H - 7, f, x0 + 15, y0 + H - 6, sz, rgb('#46ff9b'), MAT.EMISSIVE);
}

/**
 * Front face of a wall or pillar tile, so a tall block never reads as a blank grey
 * slab: cladding panels two tiles square with shadow joints (form-tie holes on
 * car-park concrete, block courses in the server hall), a skirting where it meets
 * the floor, corner beads, and now and then a fitting: an access hatch, a vent, a
 * socket, a safety sign or a framed photo. One voxel deep, on the front face only.
 * @param {Volume} vol
 * @param {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @param {Mood} mood
 * @param {{wall: number, low: number, panel: number, pillar: number}} paint
 * @param {number} x0 @param {number} y0 Voxel corner of the tile. @param {number} sz Front voxel z.
 * @param {number} c @param {number} r Tile column and row.
 * @param {{top: boolean, floor: boolean, left: boolean, right: boolean}} open Free sides.
 */
function wallFace(vol, theme, mood, paint, x0, y0, sz, c, r, open) {
  const f = sz - 1;
  const park = theme === 'parking',
    dc = theme === 'datacenter',
    roof = theme === 'rooftop';
  const face = park ? rgb('#767c87') : dc ? rgb('#bdb4a6') : roof ? rgb('#cfc6b6') : paint.pillar;
  const joint = lerpColor(face, rgb('#1b2233'), mood === 'event' ? 0.35 : 0.22);
  const lit = lerpColor(face, 0xffffff, 0.12);
  vol.box(x0, y0, f, x0 + V, y0 + V, sz, (x, y) => {
    if ((open.left && x === x0) || (open.right && x === x0 + V - 1)) return lit;
    if (park) {
      // Shuttered concrete: board marks and the holes of the form ties.
      if (x % 4 === 2 && y % 8 === 4) return lerpColor(face, 0, 0.3);
      return (y >> 1) % 4 === 0 ? lerpColor(face, 0, 0.05) : vary(face, 0.05, 8)(x, y, 0);
    }
    if (dc) {
      // Painted concrete blocks in stretcher bond.
      const row = y >> 2;
      if (y % 4 === 0 || (x + (row % 2) * 4) % 8 === 0) return joint;
      return vary(face, 0.06, 4)(x, y, 0);
    }
    // Cladding panels two tiles square, staggered by one tile every other course.
    const course = y >> 4;
    if (y % 16 === 0 || (x + (course % 2) * 8) % 16 === 0) return joint;
    return vary(face, 0.04, 8)(x, y, 0);
  });
  if (open.top) vol.box(x0, y0 + V - 3, f, x0 + V, y0 + V - 2, sz + 1, joint);
  if (open.floor)
    vol.box(
      x0,
      y0,
      f,
      x0 + V,
      y0 + 2,
      sz + 1,
      park ? rgb('#f2c230') : dc ? rgb('#2d3646') : paint.low,
    );
  // One fitting on some tiles, never on an edge tile of the block.
  if (open.top || open.left || open.right || roof) return;
  const n = noise(c, r, 61);
  const z = f;
  const k = Math.floor(noise(c, r, 67) * 4);
  if (n < 0.06) {
    // Access hatch: a shadow-gap frame, a lighter door and its lock.
    vol.box(x0 + 1, y0 + 1, z, x0 + 7, y0 + 7, z + 1, joint);
    vol.box(x0 + 2, y0 + 2, z, x0 + 6, y0 + 6, z + 1, lerpColor(face, 0xffffff, 0.18));
    vol.box(x0 + 5, y0 + 3, z, x0 + 6, y0 + 5, z + 1, rgb('#6b7280'));
  } else if (n < 0.11) {
    // Ventilation grille.
    vol.box(x0 + 1, y0 + 2, z, x0 + 7, y0 + 6, z + 1, (_x, y) =>
      (y - y0) % 2 ? rgb('#3a4252') : rgb('#d8dde3'),
    );
  } else if (n < 0.15) {
    // Safety sign: the green emergency-exit plate, or the red extinguisher plate.
    const green = k % 2 === 0;
    vol.box(x0 + 1, y0 + 3, z, x0 + 7, y0 + 6, z + 1, (x, y) =>
      (green ? (x - x0 + y - y0) % 4 === 0 && x > x0 + 2 : x === x0 + 3 && y > y0 + 3)
        ? rgb('#ffffff')
        : green
          ? rgb('#1f9e57')
          : rgb('#d8343c'),
    );
  } else if (n < 0.19 && !dc && !park) {
    // A framed team photo or a certificate.
    const pics = [rgb('#7fb4d9'), rgb('#e8c26e'), rgb('#f4f1ea'), rgb('#9fc3a8')];
    vol.box(x0 + 1, y0 + 2, z, x0 + 7, y0 + 7, z + 1, (x, y) =>
      x === x0 + 1 || x === x0 + 6 || y === y0 + 2 || y === y0 + 6
        ? rgb('#2b2f36')
        : y === y0 + 3 && x > x0 + 2 && x < x0 + 5
          ? k === 2
            ? rgb('#c9a227')
            : rgb('#3f9d5a')
          : pics[k],
    );
  }
}

/**
 * Reflections on the façade glass: a pair of short slanted streaks on some panes,
 * the cartoon shorthand for "there is a window here". Thin and sparse, so cheap.
 * @param {Volume} vol
 * @param {number} sx Volume width in voxels.
 * @param {(x: number) => boolean} onPanel
 * @param {number} color
 * @param {boolean} lit Evening: the streaks catch the room lights and glow.
 */
function glassGlints(vol, sx, onPanel, color, lit) {
  // Short streaks in the top corner of the upper pane: a glare, not a staircase.
  const y0 = Math.ceil(6.9 * V) + 2;
  const top = Math.floor(9.6 * V) - 1;
  const soft = lit ? lerpColor(color, rgb('#2a2040'), 0.35) : lerpColor(color, rgb('#9fb8d0'), 0.3);
  for (let bx = 0; bx < sx; bx += 4 * V) {
    if (noise(bx, 1, 83) < 0.5) continue;
    const start = bx + 4 + Math.floor(noise(bx, 1, 89) * 8);
    for (const [dx, w, len] of [
      [0, 2, 4],
      [4, 1, 2],
    ])
      for (let k = 0; k < len; k++) {
        const x = start + dx + k,
          y = top - len - 3 + k + (dx ? 2 : 0);
        if (y < y0 || onPanel(x) || onPanel(x + w - 1)) continue;
        vol.box(x, y, 1, x + w, y + 1, 2, soft, lit ? MAT.EMISSIVE : MAT.GLOSSY);
      }
  }
}

/** 3×5 pixel letters (rows top to bottom; É has its accent row on top). */
const FONT = {
  A: ['111', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  É: ['010', '111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '111', '110', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  B: ['110', '101', '110', '101', '110'],
  G: ['111', '100', '101', '101', '111'],
  J: ['001', '001', '001', '101', '111'],
  K: ['101', '101', '110', '101', '101'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  Q: ['111', '101', '101', '110', '011'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '&': ['010', '101', '010', '101', '011'],
  '-': ['00', '00', '11', '00', '00'],
  '.': ['0', '0', '0', '0', '1'],
  '’': ['1', '1', '0', '0', '0'],
  '%': ['101', '001', '010', '100', '101'],
  ...Object.fromEntries(
    DIGITS.map((g, k) => [String(k), [0, 3, 6, 9, 12].map((i) => g.slice(i, i + 3))]),
  ),
};

/**
 * Width in voxels of a line of pixel text (see {@link text}).
 * @param {string} str
 */
function textWidth(str) {
  let w = 0;
  for (const ch of str) {
    const g = FONT[/** @type {keyof typeof FONT} */ (ch)];
    w += g ? g[0].length + 1 : 2;
  }
  return w - 1;
}

const SIGN_STOP = new Set(['DU', 'DE', 'DES', 'LA', 'LE', 'LES', 'ET', 'AU', 'AUX', 'A', 'EN']);
const SIGN_GENERIC = new Set(['COIN', 'COULOIR', 'ESPACE', 'SALLE', 'BUREAU', 'GRANDE', 'SOUS']);

/**
 * What the hanging sign of a room says, in capitals without accents: its name, or
 * when too long, the name without its little words, then without its generic ones
 * (coin, couloir, salle…), then as many of the remaining words as fit, then its
 * longest word, shortened with a full stop at worst.
 * @param {string} name Room name (`rooms` of the level).
 * @param {number} max Widest text in voxels.
 */
export function signLabel(name, max) {
  const up = name
    .replace(/'/g, '’')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9&’.\- ]/g, '')
    .replace(/\b[LD]’/g, '')
    .replace('VIDEOPROJECTEUR', 'PROJECTEUR')
    .trim();
  if (!up) return '';
  const words = up.split(/\s+/).filter((x) => !SIGN_STOP.has(x));
  const core = words.filter((x) => !SIGN_GENERIC.has(x));
  const tries = [up, words.join(' '), core.join(' ')];
  for (let k = core.length - 1; k > 0; k--) tries.push(core.slice(0, k).join(' '));
  const long = [...(core.length ? core : words)].sort((a, b) => b.length - a.length)[0] ?? '';
  tries.push(long);
  for (let k = long.length - 1; k > 2; k--) tries.push(`${long.slice(0, k)}.`);
  return tries.find((t) => t && textWidth(t) <= max) ?? '';
}

/** 5×5 pictograms of the hanging signs. */
const PICTOS = {
  cup: ['00000', '11110', '11101', '11110', '01100'],
  printer: ['01110', '11111', '10001', '11111', '01110'],
  book: ['11011', '11011', '11011', '11011', '10101'],
  screen: ['11111', '10001', '10001', '11111', '00100'],
  up: ['00100', '01110', '10101', '00100', '00100'],
  right: ['00100', '00010', '11111', '00010', '00100'],
  people: ['01010', '01010', '00000', '11011', '11011'],
  ball: ['01110', '11011', '10001', '11011', '01110'],
  can: ['01110', '01010', '01110', '01010', '01110'],
  info: ['00100', '00000', '01100', '00100', '01110'],
};

/**
 * The pictogram of a room's sign, from the words of its name.
 * @param {string} name
 * @returns {keyof typeof PICTOS}
 */
function signPicto(name) {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/baby/.test(n)) return 'ball';
  if (/distribut/.test(n)) return 'can';
  if (/caf|pause|cocktail|buffet/.test(n)) return 'cup';
  if (/imprim|repro/.test(n)) return 'printer';
  if (/archiv|biblio|formation|etagere/.test(n)) return 'book';
  if (/visio|supervision|regie|projecteur|pleniere/.test(n)) return 'screen';
  if (/escalier|toit|ascenseur|terrasse/.test(n)) return 'up';
  if (/sortie|depart|accueil|entree|porte/.test(n)) return 'right';
  if (/bureau|directeur|business|copil|salle|open|fauteuil|photo/.test(n)) return 'people';
  return 'info';
}

/**
 * Pixel text, one voxel per pixel, its baseline at `y`.
 * @param {Volume} vol @param {string} str @param {number} x @param {number} y @param {number} z
 * @param {number} color @param {number} [mat]
 * @returns {number} Width in voxels.
 */
function text(vol, str, x, y, z, color, mat = MAT.MATTE) {
  let cx = x;
  for (const ch of str) {
    const g = FONT[/** @type {keyof typeof FONT} */ (ch)];
    if (!g) {
      cx += 2;
      continue;
    }
    g.forEach((row, i) => {
      for (let k = 0; k < row.length; k++)
        if (row[k] === '1')
          vol.box(cx + k, y + g.length - 1 - i, z, cx + k + 1, y + g.length - i, z + 1, color, mat);
    });
    cx += g[0].length + 1;
  }
  return cx - x - 1;
}

/**
 * A door in the back wall, two tiles wide slot: frame, leaf, vision panel, push
 * plate and a plate over it in the room's colour; a steel door with a badge
 * reader in the server hall.
 * @param {Volume} vol
 * @param {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @param {Mood} mood
 * @param {number} a Left voxel x. @param {number} F Floor voxel y. @param {number} accent
 */
function door(vol, theme, mood, a, F, accent) {
  const dc = theme === 'datacenter';
  const frame = dc ? rgb('#3a4252') : mood === 'event' ? rgb('#2a2440') : rgb('#9aa3ad');
  const leaf = dc
    ? rgb('#5b6678')
    : mood === 'corporate'
      ? rgb('#eeece6')
      : mood === 'event'
        ? rgb('#3a3350')
        : rgb('#c9a27a');
  vol.box(a, F, 3, a + 12, F + 19, 4, (x) =>
    (x - a) % 6 === 0 && x > a ? lerpColor(leaf, 0, 0.2) : leaf,
  );
  vol.box(a - 1, F, 3, a, F + 20, 5, frame);
  vol.box(a + 12, F, 3, a + 13, F + 20, 5, frame);
  vol.box(a - 1, F + 19, 3, a + 13, F + 20, 5, frame);
  // Vision panels and push plates on both leaves.
  for (const x of [a + 2, a + 8]) {
    vol.box(x, F + 10, 4, x + 2, F + 16, 5, rgb('#9cc6e0'), MAT.GLOSSY);
    vol.box(x, F + 8, 4, x + 2, F + 9, 5, PALETTE.metal, MAT.GLOSSY);
  }
  // The room plate over the door.
  vol.box(a + 3, F + 21, 3, a + 9, F + 24, 4, accent);
  vol.box(a + 4, F + 22, 4, a + 8, F + 23, 5, rgb('#f4f1ea'));
  if (dc) {
    vol.box(a, F + 1, 4, a + 12, F + 2, 5, (x) => ((x >> 1) % 2 ? PALETTE.hazard : rgb('#1b1b1b')));
    vol.box(a + 14, F + 9, 3, a + 16, F + 12, 5, rgb('#22262e'));
    vol.box(a + 14, F + 11, 5, a + 16, F + 12, 6, rgb('#ff3b3b'), MAT.EMISSIVE);
  }
}

/**
 * The joke prop of a stage (see {@link planJokes}).
 * @param {Volume} vol @param {Joke} j @param {number} F Floor voxel y.
 * @param {FloorPlan['pool']} pool
 */
function jokeProp(vol, j, F, pool) {
  const a = j.c * V;
  const base = F / V;
  switch (j.kind) {
    case 'coffee': {
      // The COPIL coffee station: walnut counter, the machine, a tower of cups,
      // thermos jugs, sugar and stirrers, and its name in lime neon.
      vol.box(a + 1, F, 4, a + 23, F + 8, 11, (x) =>
        (x - a) % 7 === 1 ? rgb('#3b2a1e') : rgb('#6e4b33'),
      );
      vol.box(a, F + 8, 3, a + 24, F + 9, 12, rgb('#e9e5dc'));
      text(vol, 'CAFÉ', a + 5, F + 2, 11, PALETTE.accent, MAT.EMISSIVE);
      vol.box(a + 2, F + 9, 4, a + 9, F + 18, 9, rgb('#2b2f36'));
      vol.box(a + 2, F + 18, 4, a + 9, F + 19, 9, PALETTE.metal, MAT.GLOSSY);
      vol.box(a + 3, F + 15, 9, a + 8, F + 16, 10, PALETTE.screen, MAT.EMISSIVE);
      vol.box(a + 4, F + 12, 8, a + 7, F + 13, 10, rgb('#1b1d22'));
      vol.box(a + 4, F + 9, 7, a + 6, F + 11, 9, rgb('#f4f1ea'));
      vol.box(a + 11, F + 9, 6, a + 13, F + 16, 8, (_x, y) =>
        (y - F) % 3 === 0 ? rgb('#ff4f9a') : rgb('#f4f1ea'),
      );
      for (const [x, col] of /** @type {Array<[number, number]>} */ ([
        [a + 14, rgb('#c3cad3')],
        [a + 17, PALETTE.fascia],
      ])) {
        vol.box(x, F + 9, 5, x + 2, F + 14, 8, col, MAT.GLOSSY);
        vol.box(x, F + 14, 6, x + 1, F + 15, 7, rgb('#22262e'));
      }
      vol.box(a + 20, F + 9, 6, a + 23, F + 11, 9, rgb('#f4f1ea'));
      vol.box(a + 21, F + 11, 7, a + 22, F + 14, 8, rgb('#c19a6b'));
      pool(j.c + 1.2, base + 1.7, -1.8, 4.5, [0.6, 0.42, 0.22]);
      break;
    }
    case 'roadmap': {
      // The post-it roadmap: one note in Q1, two in Q2, four in Q3, and Q4 overflowing
      // off the board, one already on the floor.
      const y0 = F + 11,
        y1 = F + 31,
        x1 = a + 40;
      vol.box(a, y0, 3, x1, y1, 4, rgb('#f4f2ec'));
      for (const [bx0, by0, bx1, by1] of [
        [a - 1, y0 - 1, x1 + 1, y0],
        [a - 1, y1, x1 + 1, y1 + 1],
        [a - 1, y0, a, y1],
        [x1, y0, x1 + 1, y1],
      ])
        vol.box(bx0, by0, 3, bx1, by1, 5, rgb('#b8c0c8'));
      vol.box(a, y0 - 2, 3, x1, y0 - 1, 6, PALETTE.metal);
      text(vol, 'ROADMAP', a + 2, y1 - 7, 4, PALETTE.fascia);
      vol.box(a + 2, y0 + 12, 4, x1 - 4, y0 + 13, 5, PALETTE.accent);
      for (let k = 0; k < 3; k++)
        vol.box(x1 - 4 + k, y0 + 10 + k, 4, x1 - 3 + k, y0 + 15 - k, 5, PALETTE.accent);
      for (let q = 0; q < 4; q++) {
        vol.box(a + 3 + q * 9, y0 + 11, 4, a + 4 + q * 9, y0 + 14, 5, PALETTE.fascia);
        const n = [1, 2, 4, 9][q];
        for (let i = 0; i < n; i++) {
          const nx = a + 2 + q * 9 + (i % 2) * 4 + (q === 3 ? Math.floor(i / 4) : 0);
          const ny = y0 + 7 - Math.floor(i / 2) * 3 + (q === 3 && i > 6 ? 9 : 0);
          vol.box(nx, ny, 4, nx + 3, ny + 3, 5, STICKY[(q + i) % STICKY.length]);
        }
      }
      vol.box(x1 - 1, y0 - 4, 4, x1 + 2, y0 - 1, 5, STICKY[1]);
      vol.box(a + 31, F, 12, a + 34, F + 1, 15, STICKY[0]);
      // The bin under it, full of crumpled versions.
      vol.box(a + 24, F, 5, a + 28, F + 5, 9, rgb('#3a4252'));
      vol.box(a + 24, F + 5, 5, a + 28, F + 6, 9, (x, _y, z) => STICKY[(x + z) % STICKY.length]);
      break;
    }
    case 'monitoring': {
      // The supervision wall: PRIMO on the big screen, KPIs below, a console in front.
      vol.box(a, F + 10, 3, a + 40, F + 33, 4, rgb('#11161f'));
      const bg = rgb('#0f2238');
      vol.box(a + 1, F + 23, 4, a + 39, F + 32, 5, bg, MAT.GLOSSY);
      text(vol, 'PRIMO', a + 10, F + 25, 5, PALETTE.accent, MAT.EMISSIVE);
      for (let k = 0; k < 3; k++)
        vol.box(
          a + 33 + k * 2,
          F + 27,
          5,
          a + 34 + k * 2,
          F + 28,
          6,
          k === 2 ? rgb('#ffb347') : rgb('#46ff9b'),
          MAT.EMISSIVE,
        );
      for (let s = 0; s < 3; s++) {
        const x0 = a + 1 + s * 13;
        vol.box(x0, F + 11, 4, x0 + 12, F + 22, 5, bg, MAT.GLOSSY);
        if (s === 0)
          for (let k = 0; k < 5; k++) {
            const hgt = 2 + Math.floor(noise(j.c, k, 7) * 7);
            vol.box(
              x0 + 1 + k * 2,
              F + 12,
              5,
              x0 + 2 + k * 2,
              F + 12 + hgt,
              6,
              k % 2 ? PALETTE.screen : PALETTE.accent,
              MAT.EMISSIVE,
            );
          }
        else if (s === 1) text(vol, '99%', x0 + 1, F + 15, 5, rgb('#46ff9b'), MAT.EMISSIVE);
        else
          for (let px = 0; px < 10; px++) {
            const py = F + 15 + Math.round(2.5 * Math.sin(px * 0.9 + j.c));
            vol.box(x0 + 1 + px, py, 5, x0 + 2 + px, py + 1, 6, rgb('#ff4f9a'), MAT.EMISSIVE);
          }
      }
      vol.box(a + 4, F + 6, 6, a + 36, F + 7, 14, rgb('#2b2f36'));
      for (const x of [a + 5, a + 34]) vol.box(x, F, 7, x + 1, F + 6, 13, rgb('#22262e'));
      for (const x of [a + 10, a + 24]) vol.box(x, F + 7, 10, x + 6, F + 8, 13, rgb('#4a505c'));
      vol.box(a + 18, F + 7, 9, a + 20, F + 9, 11, rgb('#ff4f9a'));
      pool(j.c + 2.5, base + 2.2, -2.2, 5.5, [0.12, 0.32, 0.62]);
      break;
    }
    case 'photobooth': {
      // Seminar photo booth: a pink cabinet under its lit sign, a curtain and the
      // sample strip of four poses, so everyone knows what the evening looked like.
      // Under three tiles tall, so a riser overhead never hides the sign.
      vol.box(a, F, 4, a + 16, F + 15, 14, rgb('#c2367f'));
      vol.box(a - 3, F + 15, 3, a + 19, F + 22, 15, rgb('#1d1830'));
      vol.box(a - 3, F + 22, 3, a + 19, F + 23, 16, PALETTE.accent, MAT.EMISSIVE);
      text(vol, 'PHOTO', a - 2, F + 16, 15, rgb('#ffcf8a'), MAT.EMISSIVE);
      vol.box(a + 1, F + 1, 14, a + 9, F + 13, 15, (x) =>
        (x - a) % 2 ? rgb('#5b3fa8') : rgb('#4a3290'),
      );
      vol.box(a + 1, F + 13, 14, a + 9, F + 14, 16, rgb('#2b2f36'));
      vol.box(a + 11, F + 4, 14, a + 15, F + 14, 15, rgb('#f4f1ea'));
      for (let k = 0; k < 4; k++)
        vol.box(
          a + 12,
          F + 5 + k * 2 + (k > 1 ? 1 : 0),
          15,
          a + 14,
          F + 6 + k * 2 + (k > 1 ? 1 : 0),
          16,
          STICKY[k],
        );
      vol.box(a + 11, F + 1, 14, a + 15, F + 3, 15, rgb('#22262e'));
      pool(j.c + 1, base + 1.5, -1.2, 4.5, [0.72, 0.3, 0.55]);
      break;
    }
    case 'foodtruck': {
      // Rooftop food truck, parked on a deck behind the roof edge (this volume is the
      // annex behind the play volume, z 0 at -4.75): cream body, lime stripe, striped
      // awning over the hatch, and its sign on the roof, so nobody has to ask.
      const cream = rgb('#f4efe6');
      const f = 13;
      vol.box(a - 8, F - V, 0, a + 56, F, vol.sz, (x) =>
        noise(x >> 2, 0, 5) > 0.5 ? rgb('#8d877d') : rgb('#7d7a75'),
      );
      vol.box(a - 8, F, 0, a + 56, F + 2, 1, (x) =>
        x % (2 * V) === 0 ? rgb('#aaa396') : rgb('#d8d2c6'),
      );
      vol.box(a + 2, F + 3, 3, a + 46, F + 5, f - 1, rgb('#2a2f38'));
      vol.box(a + 1, F + 5, 2, a + 34, F + 22, f, cream);
      vol.box(a + 34, F + 5, 2, a + 47, F + 16, f, cream);
      vol.box(a + 34, F + 16, 3, a + 44, F + 17, f - 1, cream);
      vol.box(a + 37, F + 10, f, a + 45, F + 15, f + 1, rgb('#3b4a63'), MAT.GLOSSY);
      vol.box(a + 47, F + 10, 3, a + 48, F + 15, f - 1, rgb('#3b4a63'), MAT.GLOSSY);
      vol.box(a + 1, F + 6, f, a + 47, F + 8, f + 1, PALETTE.accent);
      vol.box(a + 6, F + 11, f, a + 28, F + 19, f + 1, rgb('#2a2f38'));
      vol.box(a + 5, F + 10, f, a + 29, F + 11, f + 3, PALETTE.metal, MAT.GLOSSY);
      /** @param {number} x */
      const stripes = (x) => ((x >> 1) % 2 ? rgb('#ff4f9a') : rgb('#f4f1ea'));
      vol.box(a + 4, F + 19, f, a + 30, F + 20, f + 4, stripes);
      vol.box(a + 4, F + 20, f, a + 30, F + 21, f + 2, stripes);
      for (const x of [a + 9, a + 13, a + 22])
        vol.box(
          x,
          F + 11,
          f + 1,
          x + 2,
          F + 13,
          f + 2,
          x === a + 13 ? rgb('#ffd166') : rgb('#f4f1ea'),
        );
      // Wheels with a round profile and a silver hub.
      for (const xc of [a + 8, a + 38]) {
        for (let dx = -3; dx < 3; dx++) {
          const hh = Math.round(Math.sqrt(10 - (dx + 0.5) ** 2));
          vol.box(
            xc + dx,
            F + 3 - Math.min(3, hh),
            2,
            xc + dx + 1,
            F + 3 + hh,
            f + 1,
            rgb('#1b1d22'),
          );
        }
        vol.box(xc - 1, F + 2, f + 1, xc + 1, F + 4, f + 2, rgb('#c3cad3'), MAT.GLOSSY);
      }
      // The roof sign.
      for (const x of [a + 10, a + 34]) vol.box(x, F + 22, 5, x + 1, F + 23, 6, rgb('#4a505c'));
      vol.box(a + 6, F + 23, 5, a + 39, F + 38, 6, PALETTE.fascia);
      vol.box(a + 6, F + 37, 5, a + 39, F + 38, 7, PALETTE.accent, MAT.EMISSIVE);
      text(vol, 'SWILE', a + 12, F + 31, 6, PALETTE.accent, MAT.EMISSIVE);
      text(vol, 'ACCEPTÉ', a + 9, F + 24, 6, rgb('#fff1c9'), MAT.EMISSIVE);
      pool(j.c + 2.5, base + 1.8, -2.4, 5, [0.75, 0.48, 0.22]);
      break;
    }
  }
}

/**
 * One two-tile slot of the far back row, furnished for the mood.
 * @param {Volume} vol
 * @param {Mood} mood
 * @param {number} a Left voxel x.
 * @param {number} F Floor voxel y.
 * @param {number} seed 0..1, picks the variant.
 * @param {number} pod Position in its group of three.
 * @param {FloorPlan['pool']} pool
 */
function backRow(vol, mood, a, F, seed, pod, pool) {
  if (mood === 'corporate') {
    if (pod === 2) tallPlant(vol, a, F, seed);
    else credenza(vol, a, F, seed);
  } else if (mood === 'lounge') {
    if (pod === 1) sideTable(vol, a, F, seed, pool);
    else sofa(vol, a, F, seed);
  } else if (mood === 'event') {
    if (pod === 2) cocktailTable(vol, a, F);
    else buffet(vol, a, F, seed, pod === 0);
  } else backDesk(vol, a, F, seed, pod === 0, mood === 'idle', pool);
}

/**
 * One desk of the far back row: a white or oak top, a single or dual monitor, a
 * laptop or a desk lamp, a plant, a chair pushed in front. On the intercontrat
 * plateau a calm morning: a few desks stand empty (screen off, chair rolled
 * away, a moving box waiting for the next mission), the rest follow e-learning.
 * @param {Volume} vol
 * @param {number} a Left voxel x.
 * @param {number} floor Floor voxel y.
 * @param {number} seed 0..1
 * @param {boolean} first First desk of its pod (no divider on its left).
 * @param {boolean} idle
 * @param {FloorPlan['pool']} pool
 */
function backDesk(vol, a, floor, seed, first, idle, pool) {
  const legs = rgb('#3a4560');
  // Three desks by position: the classic, a standing desk raised on its columns
  // (no chair, an anti-fatigue mat), a corner desk with its return.
  const shape = Math.floor(seed * 211) % 3;
  let F = floor + (shape === 1 ? 3 : 0);
  const top = seed > 0.72 ? rgb('#d6bf98') : rgb('#ebe8e1');
  vol.box(a + 1, F + 5, 3, a + 15, F + 6, 10, top);
  if (shape === 1)
    for (const x of [a + 2, a + 13]) {
      vol.box(x, floor, 4, x + 1, F + 5, 8, legs);
      vol.box(x - 1, floor, 4, x + 2, floor + 1, 9, legs);
    }
  else {
    vol.box(a + 1, F, 4, a + 2, F + 5, 9, legs);
    vol.box(a + 14, F, 4, a + 15, F + 5, 9, legs);
  }
  if (shape === 2) {
    vol.box(a + 11, F + 5, 10, a + 15, F + 6, 15, top);
    vol.box(a + 14, F, 14, a + 15, F + 5, 15, legs);
  }
  if (!first) {
    vol.box(a, F + 5, 3, a + 1, F + 8, 10, rgb('#8a93a6'));
    vol.box(a, F + 8, 3, a + 1, F + 9, 10, PALETTE.accent);
  }
  // Monitor: lit with a spreadsheet, Teams or the intranet; some are off.
  const screens = [rgb('#58d5ff'), rgb('#7ee2a8'), rgb('#8b8cf7'), rgb('#d9f7ff')];
  const empty = idle && seed < 0.38;
  const on = !empty && seed > 0.18;
  const glow = on ? screens[Math.floor(seed * 97) % 4] : rgb('#20262f');
  const mat = on ? MAT.EMISSIVE : MAT.GLOSSY;
  const kind = Math.floor(seed * 89) % 4;
  if (kind === 1) {
    // Dual screens, slightly angled apart.
    for (const [x0, z] of [
      [a + 2, 5],
      [a + 9, 6],
    ]) {
      vol.box(x0 + 2, F + 6, z, x0 + 3, F + 7, z + 1, rgb('#22262e'));
      vol.box(x0, F + 7, z, x0 + 5, F + 10, z + 1, rgb('#1b1f27'));
      vol.box(x0 + 1, F + 8, z + 1, x0 + 4, F + 9, z + 2, glow, mat);
    }
  } else if (kind === 2) {
    // Laptop on a riser.
    vol.box(a + 5, F + 6, 6, a + 11, F + 7, 9, rgb('#c3cad3'));
    vol.box(a + 5, F + 7, 6, a + 11, F + 10, 7, rgb('#c3cad3'));
    vol.box(a + 6, F + 7, 7, a + 10, F + 9, 8, glow, mat);
  } else {
    vol.box(a + 7, F + 6, 6, a + 9, F + 7, 7, rgb('#22262e'));
    vol.box(a + 4, F + 7, 6, a + 12, F + 11, 7, rgb('#1b1f27'));
    vol.box(a + 5, F + 8, 7, a + 11, F + 10, 8, glow, mat);
  }
  if (kind === 3) {
    // Desk lamp: weighted foot, one arm, lime head.
    vol.box(a + 12, F + 6, 5, a + 14, F + 7, 7, rgb('#22262e'));
    vol.box(a + 13, F + 7, 5, a + 14, F + 11, 6, rgb('#22262e'));
    vol.box(a + 11, F + 11, 5, a + 14, F + 12, 7, PALETTE.accent);
    vol.box(a + 12, F + 10, 6, a + 13, F + 11, 7, rgb('#fff1c9'), MAT.EMISSIVE);
    pool(a / V + 1.6, F / V + 1.2, -2.1, 3.5, [0.5, 0.42, 0.22]);
  } else if (seed > 0.5) {
    // A small succulent in a terracotta pot.
    vol.box(a + 12, F + 6, 4, a + 14, F + 8, 6, PALETTE.pot);
    vol.box(a + 12, F + 8, 4, a + 14, F + 9, 6, PALETTE.leaf);
    vol.box(a + 13, F + 9, 4, a + 14, F + 10, 5, PALETTE.leafLight);
  }
  if (seed > 0.55 && kind !== 1)
    vol.box(a + 11, F + 10, 7, a + 12, F + 11, 8, STICKY[Math.floor(seed * 31) % 4]);
  vol.box(a + 5, F + 6, 9, a + 11, F + 7, 10, rgb('#d0d4da'));
  if (empty && (seed * 7) % 1 > 0.4) {
    // A moving box, taped shut, waiting for the next mission.
    vol.box(a + 2, F + 6, 7, a + 8, F + 10, 10, rgb('#c19a6b'));
    vol.box(a + 4, F + 9, 7, a + 6, F + 10, 10, rgb('#e6d6b8'));
  } else if ((seed * 7) % 1 > 0.5)
    vol.box(a + 2, F + 6, 8, a + 3, F + 8, 9, seed > 0.5 ? PALETTE.fascia : rgb('#f4f1ea'));
  else vol.box(a + 2, F + 6, 4, a + 5, F + 7, 7, rgb('#fbfbf6'));
  // Chair in front, a little off-centre; on the intercontrat floor some have rolled away.
  if (shape === 1) {
    vol.box(a + 4, floor, 10, a + 12, floor + 1, 15, rgb('#2b2f36'));
    return;
  }
  if (empty && seed < 0.2) return;
  F = floor;
  const dx = empty ? (seed > 0.3 ? 4 : -3) : (Math.floor(seed * 13) % 5) - 2;
  const dz = empty ? 2 : 0;
  const chair = [rgb('#34406a'), rgb('#3a3f4a'), rgb('#2f6d6a')][Math.floor(seed * 53) % 3];
  vol.box(a + 6 + dx, F, 11 + dz, a + 10 + dx, F + 1, 15 + dz, rgb('#22262e'));
  vol.box(a + 7 + dx, F + 1, 12 + dz, a + 9 + dx, F + 3, 14 + dz, rgb('#22262e'));
  vol.box(a + 5 + dx, F + 3, 11 + dz, a + 11 + dx, F + 4, 15 + dz, chair);
  vol.box(a + 5 + dx, F + 4, 14 + dz, a + 11 + dx, F + 8, 15 + dz, chair);
  vol.box(a + 6 + dx, F + 8, 14 + dz, a + 10 + dx, F + 9, 15 + dz, chair);
}

/**
 * Head-office credenza: walnut or white lacquer, with binders, a plant or the
 * team trophy on top.
 * @param {Volume} vol @param {number} a @param {number} F @param {number} seed
 */
function credenza(vol, a, F, seed) {
  const walnut = seed > 0.45;
  const body = walnut ? rgb('#6e4b33') : rgb('#eeece6');
  const seam = walnut ? rgb('#3b2a1e') : rgb('#c9c6be');
  vol.box(a + 1, F + 1, 3, a + 15, F + 7, 9, (x) => (x === a + 8 ? seam : body));
  vol.box(a, F + 7, 3, a + 16, F + 8, 10, walnut ? rgb('#5a3c28') : rgb('#2b3446'));
  vol.box(a + 2, F, 4, a + 14, F + 1, 8, rgb('#22262e'));
  for (const hx of [a + 6, a + 10])
    vol.box(hx, F + 4, 9, hx + 1, F + 6, 10, PALETTE.metal, MAT.GLOSSY);
  const what = Math.floor(seed * 71) % 3;
  if (what === 0) {
    const cols = [PALETTE.fascia, PALETTE.accent, rgb('#ff4f9a'), rgb('#3d8bfd')];
    for (let k = 0; k < 4; k++)
      vol.box(
        a + 2 + k * 2,
        F + 8,
        4,
        a + 4 + k * 2,
        F + 13,
        8,
        cols[(k + Math.floor(seed * 9)) % 4],
      );
  } else if (what === 1) {
    vol.box(a + 10, F + 8, 4, a + 14, F + 11, 8, rgb('#f0eee8'));
    vol.box(a + 9, F + 11, 3, a + 15, F + 15, 9, PALETTE.leaf);
    vol.box(a + 10, F + 15, 4, a + 14, F + 17, 8, PALETTE.leafLight);
  } else {
    // The trophy of the last Power UP Tour.
    vol.box(a + 6, F + 8, 5, a + 10, F + 9, 8, rgb('#22262e'));
    vol.box(a + 7, F + 9, 6, a + 9, F + 11, 7, rgb('#e8b84a'), MAT.GLOSSY);
    vol.box(a + 6, F + 11, 5, a + 10, F + 14, 8, rgb('#f6c453'), MAT.GLOSSY);
  }
}

/** A tall potted fig. @param {Volume} vol @param {number} a @param {number} F @param {number} seed */
function tallPlant(vol, a, F, seed) {
  vol.box(a + 5, F, 4, a + 11, F + 6, 10, seed > 0.5 ? rgb('#2b3446') : rgb('#f0eee8'));
  vol.box(a + 7, F + 6, 6, a + 9, F + 11, 8, PALETTE.woodDark);
  vol.box(a + 4, F + 10, 4, a + 12, F + 15, 10, PALETTE.leaf);
  vol.box(a + 3, F + 13, 5, a + 13, F + 17, 9, PALETTE.leafLight);
  vol.box(a + 5, F + 17, 5, a + 11, F + 20, 9, PALETTE.leaf);
}

/**
 * Break-room sofa in a cheerful fabric, with a contrasting cushion.
 * @param {Volume} vol @param {number} a @param {number} F @param {number} seed
 */
function sofa(vol, a, F, seed) {
  const fabrics = [rgb('#2f8f8a'), rgb('#e0a83a'), rgb('#e8735a'), rgb('#5b6fd6')];
  const k = Math.floor(seed * 37) % 4;
  const cloth = fabrics[k];
  const deep = lerpColor(cloth, 0x000000, 0.25);
  vol.box(a + 2, F, 6, a + 3, F + 1, 7, PALETTE.woodDark);
  vol.box(a + 13, F, 6, a + 14, F + 1, 7, PALETTE.woodDark);
  vol.box(a + 1, F + 1, 4, a + 15, F + 3, 13, deep);
  vol.box(a + 3, F + 3, 6, a + 13, F + 4, 13, (x) => (x === a + 8 ? deep : cloth));
  vol.box(a + 1, F + 3, 4, a + 15, F + 9, 6, cloth);
  vol.box(a + 1, F + 3, 6, a + 3, F + 6, 13, deep);
  vol.box(a + 13, F + 3, 6, a + 15, F + 6, 13, deep);
  vol.box(a + 4, F + 4, 6, a + 7, F + 7, 8, fabrics[(k + 2) % 4]);
}

/**
 * Low side table with a cup and a magazine; sometimes a reading lamp beside it.
 * @param {Volume} vol @param {number} a @param {number} F @param {number} seed
 * @param {FloorPlan['pool']} pool
 */
function sideTable(vol, a, F, seed, pool) {
  vol.box(a + 4, F + 4, 6, a + 12, F + 5, 12, PALETTE.wood);
  vol.box(a + 7, F, 8, a + 9, F + 4, 10, PALETTE.woodDark);
  vol.box(a + 5, F + 5, 7, a + 8, F + 6, 10, rgb('#ff4f9a'));
  vol.box(a + 9, F + 5, 8, a + 11, F + 7, 10, rgb('#f4f1ea'));
  if (seed < 0.5) return;
  vol.box(a + 13, F, 5, a + 15, F + 1, 7, rgb('#22262e'));
  vol.box(a + 13, F + 1, 5, a + 14, F + 14, 6, rgb('#22262e'));
  vol.box(a + 11, F + 14, 4, a + 16, F + 18, 8, rgb('#f6ead2'));
  vol.box(a + 12, F + 13, 5, a + 15, F + 14, 7, rgb('#ffe2a8'), MAT.EMISSIVE);
  pool(a / V + 1.7, F / V + 1.4, -2.1, 4, [0.62, 0.44, 0.22]);
}

/**
 * Seminar buffet table: white cloth with pleats, a lime runner, trays of petits
 * fours, rows of cups and, on the first table, the coffee urn.
 * @param {Volume} vol @param {number} a @param {number} F @param {number} seed @param {boolean} first
 */
function buffet(vol, a, F, seed, first) {
  vol.box(a, F + 5, 4, a + 16, F + 6, 12, rgb('#f7f5ef'));
  vol.box(a, F, 11, a + 16, F + 5, 12, (x) => (x % 3 === 0 ? rgb('#dedbd2') : rgb('#f7f5ef')));
  vol.box(a, F + 5, 7, a + 16, F + 6, 9, PALETTE.accent);
  vol.box(a, F, 4, a + 1, F + 5, 11, rgb('#dedbd2'));
  vol.box(a + 15, F, 4, a + 16, F + 5, 11, rgb('#dedbd2'));
  const sweets = [rgb('#ff8fc0'), rgb('#ffd166'), rgb('#8b5a3c'), rgb('#c6f432'), rgb('#9fd8ff')];
  vol.box(a + 2, F + 6, 6, a + 8, F + 7, 10, PALETTE.metal, MAT.GLOSSY);
  for (let k = 0; k < 3; k++)
    vol.box(
      a + 2 + k * 2,
      F + 7,
      7,
      a + 3 + k * 2,
      F + 8,
      8,
      sweets[(k + Math.floor(seed * 7)) % 5],
    );
  if (first) {
    vol.box(a + 11, F + 6, 5, a + 15, F + 13, 8, PALETTE.metal, MAT.GLOSSY);
    vol.box(a + 12, F + 13, 6, a + 14, F + 14, 7, rgb('#22262e'));
    vol.box(a + 12, F + 8, 8, a + 13, F + 9, 9, rgb('#22262e'));
  } else
    for (let k = 0; k < 3; k++)
      vol.box(
        a + 10 + k * 2,
        F + 6,
        6 + (k % 2) * 2,
        a + 11 + k * 2,
        F + 8,
        7 + (k % 2) * 2,
        rgb('#ffffff'),
      );
}

/** Standing cocktail table in a white stretch cover. @param {Volume} vol @param {number} a @param {number} F */
function cocktailTable(vol, a, F) {
  vol.box(a + 5, F + 9, 6, a + 11, F + 10, 12, rgb('#f7f5ef'));
  vol.box(a + 6, F, 7, a + 10, F + 9, 11, rgb('#f7f5ef'));
  vol.box(a + 6, F + 5, 7, a + 10, F + 6, 11, PALETTE.accent);
  vol.box(a + 7, F + 10, 8, a + 8, F + 12, 9, rgb('#ffcf8a'), MAT.GLOSSY);
}

/**
 * Rooftop backdrop: open sky, billboards on legs behind the posters and a stage
 * wall for the boss arena (Espace VIP).
 * @param {Volume} vol
 * @param {number} sx
 * @param {import('../game/sim.js').Sim} sim
 * @param {import('../data/levels/index.js').Decor[]} decor
 */
function buildRoofBack(vol, sx, sim, decor) {
  const arena = sim.boss ? sim.boss.arena.map((x) => x * V) : [sx, sx];
  // Stage wall: navy panels under a dark cornice (its top is out of frame during the
  // fight, so nothing bright sits up there), warm footlights along its base.
  vol.box(arena[0] - 4, 3 * V, 0, arena[1], 10 * V, 2, (x, y) =>
    (x >> 3) % 4 === 0 ? rgb('#18213a') : y % (V * 2) === 0 ? rgb('#27325a') : rgb('#1f2a44'),
  );
  vol.box(arena[0] - 4, 10 * V, 0, arena[1], 10 * V + 2, 3, rgb('#141a2c'));
  for (let x = arena[0]; x < arena[1]; x += 2 * V) {
    let g = 1;
    while (g < sim.h && sim.tiles[(x >> 3) + g * sim.w] !== TILE.EMPTY) g++;
    if (g > 4) continue;
    vol.box(x + 5, g * V, 2, x + 11, g * V + 2, 4, rgb('#2a2f38'));
    vol.box(x + 6, g * V + 1, 4, x + 10, g * V + 2, 5, rgb('#ffcf8a'), MAT.EMISSIVE);
  }
  for (const d of decor) {
    if (d.front || (d.type !== 'poster' && d.type !== 'whiteboard')) continue;
    const w = d.type === 'whiteboard' ? WHITEBOARD_W : posterWidth(/** @type {string} */ (d.id));
    const a = Math.floor((d.x - 0.3) * V),
      b = Math.ceil((d.x + w + 0.3) * V);
    if (a >= arena[0] - 8) continue;
    const y0 = Math.round((d.y + 0.5) * V);
    const y1 = Math.round((d.y + (d.type === 'poster' ? 0.9 + POSTER_H : 3.3) + 0.3) * V);
    vol.box(a, y0, 0, b, y1, 2, rgb('#f4f1ea'));
    vol.box(a, y1, 0, b, y1 + 1, 3, PALETTE.accent);
    // Legs down to the roof.
    let floor = Math.floor(d.y);
    while (floor > 0 && sim.tiles[Math.floor(a / V) + (floor - 1) * sim.w] === TILE.EMPTY) floor--;
    for (const lx of [a + 3, b - 5]) vol.box(lx, floor * V, 1, lx + 2, y0, 3, rgb('#5c6170'));
  }
}

/**
 * Concatenates two interleaved vertex buffers (same layout, plain triangle lists).
 * @param {{data: ArrayBuffer, count: number}} a
 * @param {{data: ArrayBuffer, count: number}} b
 */
function mergeMeshes(a, b) {
  const out = new Uint8Array(a.data.byteLength + b.data.byteLength);
  out.set(new Uint8Array(a.data), 0);
  out.set(new Uint8Array(b.data), a.data.byteLength);
  return { data: out.buffer, count: a.count + b.count };
}

/** @param {number} a @param {number} b @param {number} t */
const lerpColor = (a, b, t) => {
  const k = Math.max(0, Math.min(1, t));
  let out = 0;
  for (const sh of [16, 8, 0]) {
    const ca = (a >> sh) & 255,
      cb = (b >> sh) & 255;
    out |= Math.round(ca + (cb - ca) * k) << sh;
  }
  return out;
};

/**
 * What the windows of a stage look out on, between the façade and the distant
 * skyline: one coarse voxel layer per mood (a business park by the Erdre, the
 * city centre, a building site, a courtyard garden, the canal at nightfall, the
 * neighbouring roofs at dusk). It is merged into the office mesh, so it costs no
 * extra draw call; big flat faces keep the greedy mesher's quad count low.
 * @param {number} width Level width in tiles.
 * @param {Mood} mood
 * @returns {Volume | null}
 */
export function buildBackdrop(width, mood) {
  if (mood === 'dawn' || mood === 'night') return null;
  const S = 1 / 3;
  const X0 = -10,
    X1 = width + 10,
    Y0 = -2,
    Z0 = -15.5,
    Z1 = -3.3;
  const vol = new Volume(Math.ceil((X1 - X0) / S), Math.ceil(16 / S), Math.ceil((Z1 - Z0) / S), S, [
    X0,
    Y0,
    Z0,
  ]);
  let seed = 11 + width * 7 + mood.charCodeAt(0) * 131 + mood.length * 977;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  /** @param {number} a @param {number} b */
  const range = (a, b) => a + rand() * (b - a);
  /** @param {number[]} list */
  const pick = (list) => list[Math.floor(rand() * list.length)];
  /**
   * Box in world units.
   * @param {number} x0 @param {number} y0 @param {number} z0
   * @param {number} x1 @param {number} y1 @param {number} z1
   * @param {number | ((x: number, y: number, z: number) => number)} c
   * @param {number} [m]
   */
  const B = (x0, y0, z0, x1, y1, z1, c, m = MAT.MATTE) => {
    // Rounded to the grid, but never thinner than one voxel: slats and neon stay.
    const q = (/** @type {number} */ v, /** @type {number} */ o) => Math.round((v - o) / S);
    const ax = q(x0, X0),
      ay = q(y0, Y0),
      az = q(z0, Z0);
    vol.box(
      ax,
      ay,
      az,
      Math.max(ax + 1, q(x1, X0)),
      Math.max(ay + 1, q(y1, Y0)),
      Math.max(az + 1, q(z1, Z0)),
      c,
      m,
    );
  };

  /**
   * Round tree from stacked blocks: trunk, a wide crown and a lighter cap.
   * @param {number} x @param {number} z @param {number} h Crown base. @param {number} r
   * @param {number} leaf @param {number} light
   */
  const tree = (x, z, h, r, leaf, light) => {
    B(x - 0.17, Y0, z - 0.17, x + 0.17, h + 0.3, z + 0.17, rgb('#6b4a32'));
    // Stepped dome: widest in the middle, lighter towards the sun.
    const mid = lerpColor(leaf, light, 0.4);
    for (const [k, y0, y1, c] of [
      [0.7, 0, 0.3, leaf],
      [1, 0.3, 0.8, leaf],
      [1.1, 0.8, 1.3, mid],
      [0.95, 1.3, 1.65, mid],
      [0.6, 1.65, 1.9, light],
    ])
      B(x - r * k, h + r * y0, z - r * k * 0.7, x + r * k, h + r * y1, z + r * k * 0.7, c);
  };

  /**
   * Modern block with continuous ribbon glazing (one quad per band).
   * @param {number} x0 @param {number} x1 @param {number} z0 @param {number} z1 @param {number} top
   * @param {number} body @param {number} glass @param {number} [mat]
   */
  const ribbonBlock = (x0, x1, z0, z1, top, body, glass, mat = MAT.GLOSSY) => {
    B(x0, Y0, z0, x1, top, z1, body);
    for (let y = 0.4; y < top - 0.7; y += 1.34)
      B(x0 + 0.34, y, z1 - S, x1 - 0.34, y + 0.67, z1, glass, mat);
    B(x0 - 0.17, top, z0, x1 + 0.17, top + 0.34, z1 + 0.17, lerpColor(body, 0x000000, 0.18));
  };

  /**
   * Block with punched windows, some lit at night.
   * @param {number} x0 @param {number} x1 @param {number} z0 @param {number} z1 @param {number} top
   * @param {number} body @param {number} dark Unlit glass. @param {number} lit Share of lit windows.
   */
  const punchedBlock = (x0, x1, z0, z1, top, body, dark, lit) => {
    // Emissive colours come out bright: keep them deep so lit rooms read warm, not white.
    const warm = [rgb('#e0953f'), rgb('#eab05a'), rgb('#cf7536'), rgb('#6f98d0')];
    const ox = Math.round((x0 - X0) / S),
      ex = Math.round((x1 - X0) / S);
    const ty = Math.round((top - 0.6 - Y0) / S);
    const zf = Math.round((z1 - Z0) / S) - 1;
    // Windows only on the street face: the hidden faces stay flat and cheap.
    B(x0, Y0, z0, x1, top, z1, (x, y, z) =>
      z !== zf || y >= ty || (x - ox) % 3 === 0 || y % 3 === 0 || x >= ex - 1 ? body : dark,
    );
    if (lit > 0)
      for (let y = 1; y + 2 <= ty; y += 3)
        for (let x = ox + 1; x + 3 <= ex; x += 3)
          if (rand() < lit) vol.box(x, y, zf, x + 2, y + 2, zf + 1, pick(warm), MAT.EMISSIVE);
  };

  switch (mood) {
    case 'morning': {
      // La Chapelle-sur-Erdre business park: lawn, round trees, low white blocks.
      // Mown lawn: broad stripes, flat colours (a handful of quads).
      B(X0, Y0, Z0, X1, 0.7, Z1, (x) => (Math.floor(x / 9) % 2 ? rgb('#6aa84f') : rgb('#62a04a')));
      B(X0, 0.7, -7, X1, 1, -6.3, rgb('#d8d0bd'));
      for (let x = X0 + 1; x < X1 - 6;) {
        const w = range(7, 14);
        const top = range(4.4, 7.4);
        const z1 = range(-12.3, -11);
        const body = pick([rgb('#eceae4'), rgb('#e2e0da'), rgb('#f2efe8')]);
        const glass = pick([rgb('#7fa6c6'), rgb('#6f98bc'), rgb('#8bb3cf')]);
        ribbonBlock(x, x + w, z1 - 3, z1, top, body, glass);
        if (rand() > 0.5)
          B(x + w * 0.6, top, z1 - 2.2, x + w * 0.6 + 1.4, top + 0.67, z1 - 1, rgb('#b9bfc7'));
        x += w + range(1.5, 5);
      }
      for (let x = X0 + 1; x < X1; x += range(3.5, 7))
        tree(
          x,
          range(-9.5, -6),
          range(2.6, 3.8),
          range(1, 1.6),
          pick([rgb('#3f8f4a'), rgb('#4b9a52'), rgb('#367f45')]),
          rgb('#7cc46a'),
        );
      break;
    }
    case 'corporate': {
      // Nantes city centre from a high floor: curtain-wall towers and stone blocks.
      for (let x = X0; x < X1;) {
        const stone = rand() < 0.35;
        const w = stone ? range(6, 10) : range(5, 9);
        if (stone) {
          const top = range(6.5, 8.5);
          const z1 = range(-11, -9.8);
          punchedBlock(x, x + w, z1 - 3, z1, top, rgb('#e6dac2'), rgb('#4d5866'), 0);
          for (const by of [2.3, 5])
            if (by < top - 1) B(x, by, z1, x + w, by + S, z1 + S, rgb('#2c3138'));
          B(x + S, top, z1 - 2.7, x + w - S, top + 0.67, z1 - S, rgb('#7d8a97'));
          B(x + 2 * S, top + 0.67, z1 - 2.4, x + w - 2 * S, top + 1.34, z1 - 2 * S, rgb('#6e7b88'));
          for (let dx = 1; dx < w - 1; dx += 2.4)
            B(x + dx, top + 0.34, z1 - 0.67, x + dx + 0.67, top + 1, z1 - S, rgb('#e6dac2'));
        } else {
          const top = range(10, 17);
          const z1 = range(-14, -12);
          const ox = Math.round((x - X0) / S);
          const zf = Math.round((z1 - Z0) / S) - 1;
          const lo = rgb('#4f6f96'),
            hi = rgb('#b4d0ea');
          // Curtain wall: dark fins, spandrels, glass mirroring the sky (lighter higher up).
          B(x, Y0, z1 - 3, x + w, top, z1, (vx, vy, vz) => {
            if (vz !== zf) return rgb('#56657a');
            if ((vx - ox) % 3 === 0) return rgb('#2e3a4c');
            if (vy % 3 === 0) return rgb('#56657a');
            return lerpColor(lo, hi, (Math.floor(vy / 3) * 3 * S + Y0) / 16);
          });
          B(x - S, top, z1 - 3, x + w + S, top + 0.67, z1 + S, rgb('#2e3a4c'));
        }
        x += w + range(0.7, 3);
      }
      // A lower roof right across the street: plant room and a green terrace.
      for (let x = X0 + range(0, 8); x < X1; x += range(18, 30)) {
        const w = range(8, 13);
        B(x, Y0, -8, x + w, 2.4, -5.5, rgb('#c9c3b5'));
        B(x + 0.67, 2.4, -7.6, x + w * 0.45, 2.75, -5.9, vary(rgb('#5f9a4e'), 0.15, 1));
        B(x + w * 0.6, 2.4, -7.4, x + w * 0.6 + 2, 3.4, -6.2, rgb('#aeb5bf'));
      }
      break;
    }
    case 'idle': {
      // Across the street a building is going up: bare concrete frame, scaffolding,
      // green safety nets and a yellow tower crane, much like the next mission.
      const concrete = rgb('#a9a59c');
      const sites = [range(X0 + 2, width * 0.3), range(width * 0.55, width * 0.75)];
      let built = X0;
      for (const sx0 of sites) {
        const w = range(16, 22);
        const z1 = -9.6,
          z0 = -13.4;
        // Older neighbours fill the gap up to the site.
        for (let x = built; x < sx0 - 3;) {
          const bw = Math.min(range(5, 9), sx0 - 1 - x);
          punchedBlock(
            x,
            x + bw,
            -15,
            -12,
            range(5, 9),
            pick([rgb('#d8cdb4'), rgb('#cbbfa4')]),
            rgb('#5c6470'),
            0,
          );
          x += bw + range(0.6, 2);
        }
        built = sx0 + w + 2;
        const floors = 5;
        for (let f = 0; f < floors; f++) {
          const y = -1.3 + f * 1.8;
          B(sx0, y, z0, sx0 + w, y + S, z1, concrete);
          if (f === floors - 1) break;
          for (let cx = sx0; cx <= sx0 + w - S; cx += 2.4) {
            B(cx, y, z1 - S, cx + S, y + 1.8, z1, concrete);
            B(cx, y, z0, cx + S, y + 1.8, z0 + S, concrete);
          }
          // Safety nets over part of the lower floors.
          if (f < 3)
            for (let bx = sx0; bx + 2.4 <= sx0 + w; bx += 2.4)
              if (rand() < 0.45)
                B(bx, y + S, z1, bx + 2.4, y + 1.8, z1 + S, (_x, vy) =>
                  vy % 3 ? rgb('#3f8f5a') : rgb('#357a4c'),
                );
        }
        // Rebar sticking out of the top slab.
        for (let cx = sx0; cx <= sx0 + w - S; cx += 2.4)
          B(cx, 5.9 + S, z1 - S, cx + S, 6.9, z1, rgb('#6b4a3a'));
        // Scaffold: posts, ledgers and yellow toe boards up one side.
        const sw = Math.min(w, range(6, 9));
        for (let px = sx0; px <= sx0 + sw; px += 2)
          B(px, Y0, z1 + 0.67, px + S, 7.4, z1 + 1, rgb('#9aa3ad'));
        for (let f = 0; f < 4; f++) {
          const y = -1.3 + (f + 1) * 1.8;
          B(sx0, y, z1 + 0.34, sx0 + sw + S, y + S, z1 + 1, rgb('#9aa3ad'));
          B(sx0, y + S, z1 + 0.67, sx0 + sw + S, y + 2 * S, z1 + 1, rgb('#e2b42a'));
        }
      }
      for (let x = built; x < X1;) {
        const bw = range(5, 9);
        punchedBlock(
          x,
          x + bw,
          -15,
          -12,
          range(5, 9),
          pick([rgb('#d8cdb4'), rgb('#cbbfa4')]),
          rgb('#5c6470'),
          0,
        );
        x += bw + range(0.6, 2);
      }
      // Tower crane: lattice mast, jib, counter-jib with its weights, and a load.
      const cx = width * 0.42;
      const mast = (/** @type {number} */ _x, /** @type {number} */ y) =>
        y % 3 ? rgb('#f2c230') : rgb('#c99a1a');
      const jib = (/** @type {number} */ x) => (x % 3 ? rgb('#f2c230') : rgb('#c99a1a'));
      B(cx, Y0, -12, cx + 0.67, 12.4, -11.33, mast);
      B(cx - 10, 12.4, -12, cx + 4, 13.07, -11.33, jib);
      B(cx + 2.4, 11.4, -12.33, cx + 4, 12.4, -11, rgb('#8d9099'));
      B(cx - S, 11.4, -12.33, cx + 1, 12.4, -11, (_x, y) =>
        y % 3 === 1 ? rgb('#5b7c9a') : rgb('#f4f1ea'),
      );
      B(cx - 6.67, 7.2, -11.67, cx - 6.33, 12.4, -11.33, rgb('#2a2f38'));
      B(cx - 7.67, 6.2, -12, cx - 5.33, 7.2, -11, (x) => (x % 2 ? rgb('#b05a3a') : rgb('#8f4630')));
      // Site hoarding along the pavement, in the house colours.
      B(X0, Y0, -8.67, X1, 1.4, -8.33, (x) =>
        Math.floor(x / 24) % 2 ? PALETTE.fascia : rgb('#2b3a5e'),
      );
      B(X0, 1.07, -8.67, X1, 1.4, -8.33, PALETTE.accent);
      break;
    }
    case 'lounge': {
      // The inner courtyard: a row of low town houses (brick, cream render, pale
      // stone) of uneven heights under zinc roofs and chimneys, the sky above them,
      // window boxes, ivy, trees and a pergola.
      const flowers = [rgb('#ff5f8f'), rgb('#ffd166'), rgb('#ff8a3d'), rgb('#f4f1ea')];
      /** @type {number[][]} */
      const fronts = [
        [rgb('#b25a3d'), rgb('#93452f')],
        [rgb('#a04a34'), rgb('#7f3a28')],
        [rgb('#efe2c4'), rgb('#d9c9a6')],
        [rgb('#d8d2c2'), rgb('#bdb5a2')],
        [rgb('#e8b98f'), rgb('#cc9a70')],
      ];
      const zinc = rgb('#7d8794'),
        zincLit = rgb('#a3adb9');
      for (let x = X0; x < X1;) {
        const w = range(5.5, 9),
          h = range(5.4, 7.6),
          z = range(-13.4, -12.4);
        const [face, band] = fronts[Math.floor(rand() * fronts.length)];
        B(x, Y0, z - 2, x + w, h, z, face);
        B(x - S, h - S, z - 2, x + w + S, h, z + S, band);
        // Mansard roof: two steps of zinc, a chimney or two, a dormer now and then.
        B(x + S, h, z - 2, x + w - S, h + 0.67, z - S, zinc);
        B(x + 2 * S, h + 0.67, z - 1.7, x + w - 2 * S, h + 1, z - 0.7, zincLit);
        for (let cx = x + range(0.6, 1.6); cx < x + w - 1; cx += range(2.6, 4.5)) {
          B(cx, h + 0.67, z - 1.6, cx + 0.67, h + 1.67, z - 1, band);
          B(cx - S / 2, h + 1.67, z - 1.7, cx + 0.67 + S / 2, h + 1.84, z - 0.9, rgb('#5d4a40'));
        }
        // Windows, flush with the front: no relief, no ambient-occlusion seams.
        for (let y = 0.4; y < h - 1.4; y += 2.67)
          for (let wx = x + 0.84; wx < x + w - 1.3; wx += 2.34) {
            B(wx - S, y - S, z, wx + 1 + S, y + 1.67, z + S, rgb('#f4efe6'));
            B(wx, y, z, wx + 1, y + 1.34, z + S, rgb('#56677a'), MAT.GLOSSY);
            if (rand() < 0.3) {
              B(wx - S, y - 0.67, z + S, wx + 1 + S, y - S, z + 0.67, rgb('#c4704e'));
              B(wx - S, y - S, z + S, wx + 1 + S, y, z + 0.67, pick(flowers));
            }
          }
        x += w + (rand() < 0.3 ? range(0.7, 2) : 0);
      }
      // The courtyard's low garden wall, ivy spilling over it.
      B(X0, Y0, -11.84, X1, 1, -11.17, rgb('#d6ccb6'));
      B(X0, 1, -11.95, X1, 1.17, -11.05, rgb('#e4dccb'));
      for (let x = X0 + range(1, 5); x < X1; x += range(4, 9)) {
        const w = range(1.5, 3.5);
        const top = range(1.5, 2.3);
        B(x, -0.6, -11.17, x + w, top, -10.84, rgb('#3f7f3c'));
        B(x + S, top - 0.67, -10.84, x + w - S, top - S, -10.5, rgb('#5a9a48'));
      }
      for (let x = X0 + range(2, 6); x < X1; x += range(8, 13))
        tree(x, range(-9, -7.5), range(2.4, 3.2), range(1.1, 1.5), rgb('#4f9a4a'), rgb('#8ccc6a'));
      // Pergola with climbing vines, right outside the window.
      const wood = rgb('#8a5f3c');
      for (let x = X0 + range(0, 6); x < X1; x += range(22, 34)) {
        const w = range(9, 14);
        for (let px = x; px <= x + w; px += w / 3)
          for (const pz of [-7.4, -4.8]) B(px, Y0, pz, px + S, 3.5, pz + S, wood);
        for (const pz of [-7.4, -4.8]) B(x, 3.5, pz, x + w + S, 3.84, pz + S, wood);
        for (let rx = x; rx <= x + w; rx += 1) B(rx, 3.84, -7.8, rx + S, 4.17, -4.4, wood);
        for (let rx = x; rx < x + w; rx += 0.67)
          if (rand() < 0.55)
            B(rx, 4.17, range(-7.6, -6), rx + 0.67, 4.5, range(-5.6, -4.6), rgb('#5a9a48'));
      }
      break;
    }
    case 'event': {
      // The canal by the congress centre at nightfall: dark water full of reflections,
      // lit quays, a festoon of bulbs along the near bank.
      B(X0, Y0, Z0, X1, 0.34, Z1, rgb('#141b30'), MAT.GLOSSY);
      const glows = [rgb('#ffcf8a'), rgb('#ff6fb8'), rgb('#9b7bff'), rgb('#ffe2b0')];
      for (let i = 0; i < width * 1.2; i++) {
        const x = range(X0, X1),
          z = range(-11, -5);
        B(x, 0, z, x + range(0.67, 2), 0.34, z + S, pick(glows), MAT.EMISSIVE);
      }
      B(X0, Y0, -11.7, X1, 1, -11, vary(rgb('#4a4458'), 0.08, 2));
      const hall = width * 0.45;
      for (let x = X0; x < X1;) {
        if (x < hall + 20 && x + 9 > hall) {
          // The congress centre: a long glass hall glowing amber under a pink roof line.
          B(hall, Y0, -15, hall + 20, 5, -11.7, rgb('#2b2740'));
          B(
            hall + S,
            1.34,
            -12,
            hall + 20 - S,
            4.34,
            -11.7,
            (vx) => (vx % 4 === 0 ? rgb('#3a3350') : rgb('#e39a4c')),
            MAT.EMISSIVE,
          );
          B(hall, 5, -15, hall + 20, 5.34, -11.4, rgb('#c8387f'), MAT.EMISSIVE);
          x = hall + 20 + range(0.7, 2);
          continue;
        }
        const w = range(4, 8);
        punchedBlock(
          x,
          x + w,
          -15.4,
          -12,
          range(4, 11),
          pick([rgb('#2a2440'), rgb('#352f4d'), rgb('#3a3350')]),
          rgb('#1c1a2a'),
          0.3,
        );
        if (rand() < 0.3) B(x, 1, -12, x + w, 1.34, -11.7, rgb('#9b6bff'), MAT.EMISSIVE);
        x += w + range(0.4, 1.6);
      }
      // Festoon of bulbs strung between posts on the near quay.
      const bulbs = [rgb('#ffd27a'), rgb('#ffb066'), rgb('#fff1c9'), rgb('#ff8fc8')];
      for (let px = X0 + 2; px + 8 < X1; px += 8) {
        B(px, Y0, -6.17, px + S, 4.6, -5.83, rgb('#22202c'));
        for (let k = 1; k < 24; k++) {
          const t = k / 24;
          const y = 4.4 - 3.2 * t * (1 - t);
          B(
            px + t * 8,
            y,
            -6.17,
            px + t * 8 + S,
            y + S,
            -5.83,
            k % 2 ? pick(bulbs) : rgb('#22202c'),
            k % 2 ? MAT.EMISSIVE : MAT.MATTE,
          );
        }
      }
      break;
    }
    case 'dusk': {
      // Neighbouring roofs below the terrace: zinc and terracotta, water tanks,
      // the first lit windows, an antenna light and a billboard.
      for (let x = X0; x < X1;) {
        const w = range(4, 9);
        const far = rand() < 0.35;
        const z1 = far ? range(-13, -11) : range(-8, -5.5);
        const top = far ? range(2, 6.5) : range(-1, 2.2);
        const body = pick([rgb('#e3d3b8'), rgb('#cf9f7c'), rgb('#bfb8ad'), rgb('#d9c6a5')]);
        punchedBlock(x, x + w, z1 - range(2.5, 4), z1, top, body, rgb('#3b4a63'), 0.32);
        const roof = rand();
        if (roof < 0.4) {
          B(x + S, top, z1 - 2.2, x + w - S, top + 0.67, z1 - S, rgb('#8a95a3'));
          B(x + 0.67, top + 0.67, z1 - 1.9, x + w - 0.67, top + 1, z1 - 0.67, rgb('#7b8794'));
        } else if (roof < 0.7) {
          const tx = x + range(0.6, w - 2);
          for (const lx of [tx, tx + 1])
            B(lx, top, z1 - 1.6, lx + S, top + 0.67, z1 - 1.27, rgb('#4a505c'));
          B(tx - S, top + 0.67, z1 - 1.9, tx + 1.67, top + 1.67, z1 - 0.9, rgb('#9aa1aa'));
        } else if (far) {
          const ax = x + range(0.6, w - 1);
          B(ax, top, z1 - 1.3, ax + S, top + 2.4, z1 - 1, rgb('#4a505c'));
          B(ax, top + 2.4, z1 - 1.3, ax + S, top + 2.74, z1 - 1, rgb('#ff3b3b'), MAT.EMISSIVE);
        }
        x += w + range(0.3, 1.6);
      }
      const bx = width * 0.3;
      B(bx, 3, -12.4, bx + 0.34, 4.4, -12, rgb('#4a505c'));
      B(bx + 3, 3, -12.4, bx + 3.34, 4.4, -12, rgb('#4a505c'));
      // A rooftop sign: navy board, lime neon frame and a pink line of light.
      const neon = rgb('#9fd12a');
      B(bx - 0.67, 4.4, -12.4, bx + 4, 6.4, -12, rgb('#1f2a44'));
      B(bx - 0.67, 4.4, -12, bx + 4, 4.74, -11.67, neon, MAT.EMISSIVE);
      B(bx - 0.67, 6.07, -12, bx + 4, 6.4, -11.67, neon, MAT.EMISSIVE);
      B(bx - 0.67, 4.74, -12, bx - 0.33, 6.07, -11.67, neon, MAT.EMISSIVE);
      B(bx + 3.67, 4.74, -12, bx + 4, 6.07, -11.67, neon, MAT.EMISSIVE);
      B(bx + 0.33, 5.24, -12, bx + 3, 5.57, -11.67, rgb('#e0408a'), MAT.EMISSIVE);
      break;
    }
    default:
      return null;
  }
  return vol;
}

/**
 * Foreground objects between the camera and the play plane, about every 12 tiles:
 * a plant, a chair back, heads in the audience, a railing, in dimmed true colours.
 * They stand on the ground floor in front of the slab and stop a quarter tile above
 * the floor line, so in perspective they stay below it (camera at least 4.7 up):
 * they never cover the hero, a pickup or a hazard, and skip pits and trapdoors.
 * @param {FloorPlan} plan
 * @param {Mood} mood
 * @param {Set<number>} trapCols
 * @returns {Volume | null}
 */
export function buildForeground(plan, mood, trapCols) {
  const { ground, base, F, arena } = plan;
  const w = ground.length;
  if (base < 1) return null;
  const vol = new Volume(w * V, F + 3, 12, 1 / V, [0, 0, 1.6]);
  /** @param {number} q */
  const solidFloor = (q) =>
    ground[q] === base && !trapCols.has(q) && (q < arena[0] - 2 || q > arena[1] + 1);
  let any = false;
  for (let c0 = 5; c0 < w - 5; c0 += 12)
    for (let c = c0; c < c0 + 6; c++) {
      let ok = true;
      for (let q = c - 1; q <= c + 3; q++) if (!solidFloor(q)) ok = false;
      if (!ok) continue;
      silhouette(vol, mood, c * V, F, noise(c, base, 101));
      any = true;
      break;
    }
  return any ? vol : null;
}

/**
 * One foreground object, three tiles wide, top at most at F + 1: the near side of
 * the room, slightly out of focus. Its true colours are dimmed towards the room's
 * shadow tone (never black), and every outline breaks up into leaves, hair, rims or
 * spokes, so it reads as a plant, a chair or a head and never as a missing face.
 * @param {Volume} vol Foreground volume (z 0 at 1.6).
 * @param {Mood} mood @param {number} a Left voxel x. @param {number} F Floor voxel y.
 * @param {number} seed 0..1
 */
function silhouette(vol, mood, a, F, seed) {
  const ink = mood === 'event' ? rgb('#2a2236') : mood === 'dusk' ? rgb('#3a2a2e') : rgb('#24304a');
  /** The colour as seen in the shade near the camera. @param {string} hex @param {number} [k] */
  const dim = (hex, k = 0.42) => lerpColor(rgb(hex), ink, k);
  const top = F + 1;
  /**
   * Foliage: pointed leaves fanning out of a pot, each column its own height and
   * depth, two greens and a lit tip now and then.
   * @param {number} x0 @param {number} x1 @param {string} g1 @param {string} g2
   */
  const crown = (x0, x1, g1, g2) => {
    const mid = (x0 + x1) / 2,
      half = (x1 - x0) / 2;
    for (let x = x0; x < x1; x++) {
      const k = 1 - ((x - mid) / half) ** 2;
      const spike = (x - x0) % 3 === 1 ? 1 : (x - x0) % 3 === 0 ? -1 : 0;
      const t = Math.min(top, Math.round(F - 7 + k * 8 + spike + (noise(x, a, 7) - 0.5) * 3));
      const z0 = 2 + Math.floor(noise(x, a, 11) * 3),
        z1 = 7 + Math.floor(noise(x, a, 13) * 3);
      const leaf = (x >> 1) % 3 ? dim(g1) : dim(g2);
      vol.box(x, F - 12, z0, x + 1, t, z1, leaf);
      if (spike > 0 && t > F - 6) vol.box(x, t - 1, z1 - 1, x + 1, t, z1, dim(g2, 0.25));
    }
  };
  /**
   * Head and shoulders from behind: jacket, collar, neck, hair rounded on top.
   * @param {number} x Left. @param {string} hair @param {string} jacket @param {number} h Height offset.
   */
  const person = (x, hair, jacket, h) => {
    vol.box(x, F - 14, 3, x + 8, F - 7 + h, 10, dim(jacket));
    vol.box(x + 2, F - 7 + h, 5, x + 6, F - 6 + h, 9, dim('#f4f1ea', 0.5));
    vol.box(x + 3, F - 6 + h, 5, x + 5, F - 5 + h, 8, dim('#d9a27f', 0.5));
    for (const [y, dx] of [
      [F - 5, 2],
      [F - 4, 1],
      [F - 3, 1],
      [F - 2, 1],
      [F - 1, 2],
      [F, 3],
    ])
      if (y + h <= top) vol.box(x + dx, y + h, 4, x + 8 - dx, y + h + 1, 9, dim(hair));
    // Ears either side of the hair.
    vol.box(x + 1, F - 3 + h, 6, x + 2, F - 2 + h, 7, dim('#d9a27f', 0.5));
    vol.box(x + 6, F - 3 + h, 6, x + 7, F - 2 + h, 7, dim('#d9a27f', 0.5));
  };
  if (mood === 'event') {
    // The audience at the plenary, hair and jackets all different, one phone up to film it.
    const hairs = ['#5a3a24', '#1f1b1a', '#c9a35a', '#8d8d8d', '#7a2f1e'];
    const jackets = ['#1f2a44', '#6b2a3a', '#4b5563', '#2f5d50', '#3b3550'];
    for (let k = 0; k < 3; k++) {
      const n = Math.floor(noise(a, k, 5) * 5);
      person(a + k * 8, hairs[n], jackets[(n + k) % 5], k === 1 ? 1 : 0);
    }
    if (seed > 0.4) {
      vol.box(a + 14, F - 3, 10, a + 17, F + 1, 11, dim('#1b1d22', 0.2));
      vol.box(a + 15, F - 2, 11, a + 16, F, 12, rgb('#9fd8ff'), MAT.EMISSIVE);
    }
  } else if (mood === 'night') {
    // A bundle of colour-coded cables arching over a tray, a status LED on its tie.
    const runs = ['#3d8bfd', '#f2c230', '#ff7a2f', '#46c9b8'];
    vol.box(a, F - 10, 3, a + 24, F - 8, 10, dim('#7d8796'));
    for (let x = a; x < a + 24; x++) {
      const t = Math.round(
        F - 6 + 6 * Math.sin(((x - a) / 24) * Math.PI) + (noise(x, a, 3) - 0.5) * 2,
      );
      for (let k = 0; k < 4; k++)
        vol.box(x, F - 8, 4 + k, x + 1, Math.min(top, t - (k % 2)), 5 + k, dim(runs[k], 0.35));
    }
    vol.box(a + 11, F - 3, 9, a + 13, F - 1, 10, dim('#1b1d22', 0.2));
    vol.box(a + 11, F - 2, 10, a + 13, F - 1, 11, rgb('#46ff9b'), MAT.EMISSIVE);
  } else if (mood === 'dawn') {
    // A striped bollard and the bonnet of a car parked on the near side, headlight on.
    vol.box(a + 2, F - 14, 3, a + 6, F, 7, (_x, y) =>
      ((y - F) >> 1) % 2 ? dim('#f2c230', 0.3) : dim('#1c1c1c', 0.2),
    );
    vol.box(a + 3, F, 4, a + 5, top, 6, dim('#f2c230', 0.3));
    const paint = seed > 0.5 ? '#c8323c' : '#2f6fd6';
    for (let x = a + 9; x < a + 24; x++) {
      const t = F - 4 + Math.round(2 * Math.sin(((x - a - 9) / 15) * Math.PI));
      vol.box(x, F - 12, 1, x + 1, t, 11, dim(paint, 0.35));
      vol.box(x, t - 1, 4, x + 1, t, 8, dim(paint, 0.15));
    }
    vol.box(a + 10, F - 6, 10, a + 13, F - 5, 12, rgb('#fff6cf'), MAT.EMISSIVE);
  } else if (mood === 'dusk') {
    // The terrace railing, brushed steel catching the sunset, and a potted olive tree.
    for (let x = a; x < a + 24; x += 4) vol.box(x, F - 12, 6, x + 1, top, 7, dim('#a7aeb7', 0.3));
    vol.box(a, top, 5, a + 24, top + 1, 8, dim('#ffcf8a', 0.3));
    vol.box(a + 7, F - 14, 2, a + 15, F - 8, 6, dim('#c4704e'));
    vol.box(a + 6, F - 9, 2, a + 16, F - 8, 6, dim('#e08a5a'));
    crown(a + 4, a + 18, '#7f8f4e', '#a7b56a');
  } else if (seed < 0.7 || mood === 'lounge') {
    // A potted plant: a pot with a rim and broad pointed leaves.
    const pot = mood === 'lounge' ? '#c4704e' : seed < 0.35 ? '#f0eee8' : '#3a4252';
    vol.box(a + 7, F - 14, 2, a + 16, F - 9, 8, dim(pot));
    vol.box(a + 6, F - 9, 2, a + 17, F - 8, 8, dim(pot, 0.3));
    crown(a + 2 + Math.floor(seed * 4), a + 21, '#3f9d5a', '#6cc46f');
  } else {
    // The back of an office chair: fabric shell with a seam, a headrest and armrests.
    const fabric = ['#2f8f8a', '#4b5563', '#2b3a5e'][Math.floor(seed * 12) % 3];
    vol.box(a + 6, F - 14, 3, a + 18, F - 3, 6, dim(fabric));
    vol.box(a + 7, F - 3, 3, a + 17, F - 1, 6, dim(fabric));
    vol.box(a + 11, F - 12, 6, a + 13, F - 2, 7, dim(fabric, 0.6));
    vol.box(a + 9, F - 1, 3, a + 15, top, 6, dim('#2b2f36', 0.3));
    vol.box(a + 10, top - 1, 6, a + 14, top, 7, dim('#c6f432', 0.3));
    vol.box(a + 4, F - 10, 4, a + 6, F - 8, 9, dim('#2b2f36', 0.3));
    vol.box(a + 18, F - 10, 4, a + 20, F - 8, 9, dim('#2b2f36', 0.3));
  }
}

/**
 * Frames and spotlights for the artwork (the images themselves are sprites).
 * @param {Volume} vol
 * @param {import('../data/levels/index.js').Decor} d
 * @param {number} sz Volume depth in voxels.
 */
function placeDecor(vol, d, sz) {
  const x = Math.round(d.x * V);
  switch (d.type) {
    case 'poster':
    case 'whiteboard': {
      // Frame and a small spotlight above the artwork (the image itself is a sprite).
      const w = d.type === 'whiteboard' ? WHITEBOARD_W : posterWidth(/** @type {string} */ (d.id));
      const h = d.type === 'whiteboard' ? WHITEBOARD_W * 0.75 : POSTER_H;
      const y0 = Math.round((d.y + (d.type === 'whiteboard' ? 0.75 : 0.9)) * V);
      const x1 = Math.round((d.x + w) * V);
      const z = d.front ? sz : 3;
      const frame = d.type === 'whiteboard' ? rgb('#b8c0c8') : rgb('#1b2233');
      vol.box(x - 1, y0 - 1, z, x1 + 1, y0, z + 1, frame);
      vol.box(x - 1, y0 + h * V, z, x1 + 1, y0 + h * V + 1, z + 1, frame);
      vol.box(x - 1, y0, z, x, y0 + h * V, z + 1, frame);
      vol.box(x1, y0, z, x1 + 1, y0 + h * V, z + 1, frame);
      if (d.type === 'whiteboard') vol.box(x, y0 - 2, z, x1, y0 - 1, z + 3, rgb('#9aa3ad'));
      if (!d.front) {
        const cx = Math.round((x + x1) / 2);
        const top = Math.round(y0 + h * V + 2);
        vol.box(cx - 3, top, z, cx + 3, top + 1, z + 3, rgb('#22262e'));
        vol.box(cx - 2, top - 1, z + 2, cx + 2, top, z + 4, rgb('#fff1c9'), MAT.EMISSIVE);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * The Nantes skyline seen through the façade: Tour Bretagne, the cathedral,
 * the yellow Titan crane and the Loire, built at a coarse voxel size.
 * @param {number} width Level width in tiles.
 */
export function buildSkyline(width) {
  const S = 0.5;
  const vol = new Volume(Math.round((width + 80) / S), 130, 110, S, [-40, -20, -70]);
  /** @param {number} x */
  const X = (x) => Math.round((x + 40) / S);
  /** @param {number} y */
  const Y = (y) => Math.round((y + 20) / S);
  /** @param {number} z */
  const Z = (z) => Math.round((z + 70) / S);
  // The Loire.
  vol.box(0, 0, Z(-46), vol.sx, Y(-6), Z(-45), rgb('#3d6f9e'), MAT.GLOSSY);
  vol.box(0, 0, Z(-44), vol.sx, Y(-5), Z(-22), rgb('#59646f'));
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let bx = -40; bx < width + 40; bx += 3 + rand() * 4) {
    const h = 6 + rand() * 16;
    const w = 2 + rand() * 4;
    const z = -26 - rand() * 18;
    const tone = [rgb('#8fa6c4'), rgb('#a9b8cf'), rgb('#7d93b3'), rgb('#c2cada')][
      Math.floor(rand() * 4)
    ];
    vol.box(X(bx), Y(-5), Z(z - 3), X(bx + w), Y(h), Z(z), tone);
    // Window rows lit in amber or cool white.
    for (let wy = Y(-3); wy < Y(h) - 1; wy += 3)
      for (let wx = X(bx) + 1; wx < X(bx + w) - 1; wx += 2)
        if (rand() > 0.35)
          vol.set(wx, wy, Z(z), rand() > 0.7 ? rgb('#ffd98a') : rgb('#e8f1ff'), MAT.EMISSIVE);
  }
  // Tour Bretagne.
  const tb = width * 0.35;
  vol.box(X(tb), Y(-5), Z(-38), X(tb + 6), Y(34), Z(-33), rgb('#6e7f97'));
  for (let wy = Y(-2); wy < Y(33); wy += 2)
    vol.box(X(tb), wy, Z(-33), X(tb + 6), wy + 1, Z(-32), rgb('#c9d6e6'), MAT.GLOSSY);
  vol.box(X(tb + 2.5), Y(34), Z(-36), X(tb + 3.5), Y(40), Z(-35), rgb('#e8e8e8'));
  // Cathedral twin towers.
  const ca = width * 0.6;
  for (const dx of [0, 5])
    vol.box(X(ca + dx), Y(-5), Z(-42), X(ca + dx + 3), Y(22), Z(-38), rgb('#d9d2c2'));
  vol.box(X(ca), Y(-5), Z(-44), X(ca + 8), Y(14), Z(-40), rgb('#cfc7b5'));
  // Titan crane (Île de Nantes).
  const tc = width * 0.85;
  vol.box(X(tc), Y(-5), Z(-30), X(tc + 1.5), Y(24), Z(-28.5), rgb('#f2c230'));
  vol.box(X(tc - 14), Y(24), Z(-30), X(tc + 6), Y(26), Z(-28.5), rgb('#f2c230'));
  vol.box(X(tc - 13), Y(14), Z(-29.5), X(tc - 12.5), Y(24), Z(-29), rgb('#333333'));
  return meshVolume(vol);
}
