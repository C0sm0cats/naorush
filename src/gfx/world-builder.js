import { TILE } from '../game/sim.js';
import { POSTER_H, WHITEBOARD_W, posterWidth } from '../data/inetum.js';
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
 * Light mood of an office stage, read from what furnishes it: the seminar has its
 * stage truss, the break room its bistro tables, the steering committee its long
 * meeting tables, a manned open space its desks and whiteboards; a floor with none
 * of them is the half-empty intercontrat plateau late on a Friday.
 * @typedef {'morning'|'corporate'|'lounge'|'late'|'event'} Mood
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
  return 'late';
}

/**
 * Ceiling fixtures per mood: emissive panel colour and the light it casts.
 * @type {Record<Mood|'parking'|'datacenter', {panel: number, color: number[], radius: number}>}
 */
const FIXTURES = {
  morning: { panel: rgb('#fff6d8'), color: [0.52, 0.49, 0.42], radius: 6.5 },
  corporate: { panel: rgb('#f4f8ff'), color: [0.52, 0.54, 0.58], radius: 6.8 },
  lounge: { panel: rgb('#ffdca0'), color: [0.72, 0.5, 0.28], radius: 5.5 },
  late: { panel: rgb('#ffe7b8'), color: [0.58, 0.46, 0.32], radius: 6.5 },
  event: { panel: rgb('#ffcf8a'), color: [0.8, 0.5, 0.26], radius: 7 },
  parking: { panel: rgb('#dff6ff'), color: [0.3, 0.55, 0.7], radius: 7.5 },
  datacenter: { panel: rgb('#bfe9ff'), color: [0.24, 0.46, 0.72], radius: 6.5 },
};

/**
 * @param {import('../game/sim.js').Sim} sim
 * @param {import('../data/levels/index.js').Decor[]} decor
 * @param {string[]} [map] Level rows, used for tile styles ('M' meeting room, 'B' paper reams,
 *   'V' server rack, 'H' HVAC unit).
 * @param {'office'|'datacenter'|'rooftop'|'parking'} [theme]
 */
export function buildOffice(sim, decor, map = [], theme = 'office') {
  const roof = theme === 'rooftop';
  const dc = theme === 'datacenter';
  const park = theme === 'parking';
  const mood = theme === 'office' ? officeMood(decor, map) : null;
  const fixture = FIXTURES[mood ?? (park ? 'parking' : 'datacenter')];
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
      : vary(PALETTE.carpet, 0.14, 2);
  /** Visual style of a solid tile, from the level's ASCII map. */
  /** @param {number} c @param {number} r */
  const styleAt = (c, r) => map[sim.h - 1 - r]?.[c] ?? '#';
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
        if (dc && y >= 78 && y < 84) {
          // The T&S band: lime, with navy pixel lettering at the start of every room.
          const lx = x % (20 * V);
          const letter =
            lx > 6 * V &&
            lx < 10 * V &&
            (lx >> 1) % 4 !== 3 &&
            y > 78 &&
            y < 83 &&
            noise(x >> 1, y, 13) > 0.35;
          vol.box(x, y, 0, x + 1, y + 1, 3, letter ? PALETTE.fascia : PALETTE.accent);
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
          const mullion = x % (V * 4) < 2 || Math.abs(ty - 6.9) < 0.12;
          if (mullion) vol.box(x, y, 0, x + 1, y + 1, 3, PALETTE.mullion);
          continue;
        }
        const base = dc ? rgb('#4a5568') : PALETTE.wall;
        const c =
          ty < 1
            ? dc
              ? rgb('#2d3646')
              : PALETTE.wallLow
            : panel && inWindowBand
              ? dc
                ? rgb('#5b6678')
                : rgb('#d9d1c3')
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
    vol.box(0, 4.2 * V - 1, 3, sx, 4.2 * V, 6, dc ? rgb('#2d3646') : PALETTE.wallLow);
  }

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
          // Free-standing run of filing cabinets: drawers with chrome handles.
          vol.box(x0, y0, depthBack, x0 + V, y0 + V, sz - 1, rgb('#c9cfd6'));
          vol.box(x0, y0, sz - 1, x0 + V, y0 + V, sz, (x, y) =>
            y - y0 === 3 || x - x0 === 0 ? rgb('#9aa3ad') : rgb('#dfe4ea'),
          );
          vol.box(x0 + 3, y0 + 5, sz - 1, x0 + 5, y0 + 6, sz + 0, rgb('#7b8590'), MAT.GLOSSY);
          vol.box(x0 + 3, y0 + 1, sz - 1, x0 + 5, y0 + 2, sz + 0, rgb('#7b8590'), MAT.GLOSSY);
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
            park ? concrete : vary(rgb('#bdb4a6'), 0.05, V),
          );
          if (above !== TILE.SOLID && roof) {
            // Raised roof terrace: gravel and a pale parapet.
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, gravel);
            vol.box(x0, y0 + V - 2, sz - 2, x0 + V, y0 + V + 1, sz, parapet);
          } else if (above !== TILE.SOLID)
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, floorTop);
        }
        if (above !== TILE.SOLID && !isCeiling && (isBase || floats)) {
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
          // Friday 16:30 on the intercontrat floor: half the rows are already switched off.
          const off = mood === 'late' && c % 10 === 7;
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
              off ? rgb('#b9b6ae') : fixture.panel,
              off ? MAT.MATTE : MAT.EMISSIVE,
            );
            if (!off)
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

  furnish({ vol, sim, map, decor, theme, zv, onPanel, lights, mood });
  for (const d of decor) placeDecor(vol, d, sz);
  return { vol, mesh: meshVolume(vol), lights };
}

/**
 * @typedef {Object} FurnishContext
 * @property {Volume} vol
 * @property {import('../game/sim.js').Sim} sim
 * @property {string[]} map
 * @property {import('../data/levels/index.js').Decor[]} decor
 * @property {'office'|'datacenter'|'rooftop'|'parking'} theme
 * @property {(z: number) => number} zv World z to voxel z.
 * @property {(x: number) => boolean} onPanel Whether a voxel column is reserved for artwork.
 * @property {Array<{pos: number[], radius: number, color: number[]}>} lights Point lights to add to.
 * @property {Mood|null} mood Light mood of an office stage.
 */

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
function furnish({ vol, sim, map, decor, theme, zv, onPanel, lights, mood }) {
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
  const F = base * V;
  const arena = sim.boss ? sim.boss.arena : [w, w];
  // Props and interactive things standing on the ground floor keep their space.
  const busy = new Set();
  for (const d of decor)
    if (d.type !== 'poster' && d.type !== 'whiteboard' && Math.abs(d.y - base) < 1.5)
      for (let c = Math.floor(d.x - 1.4); c <= Math.ceil(d.x + (d.type === 'desk' ? 6 : 1.4)); c++)
        busy.add(c);
  map.forEach((row, i) => {
    const r = h - 1 - i;
    if (r !== base && r !== base + 1) return;
    [...row].forEach((ch, c) => {
      if ('dpPDEkJCnSX'.includes(ch)) for (let k = c - 1; k <= c + 1; k++) busy.add(k);
    });
  });
  // Steel posts under the mezzanines (see the filing cabinets) stand in the back too.
  for (let c = 0; c < w; c += 3)
    for (let r = base + 2; r < h - 1; r++)
      if (tile(c, r) === TILE.SOLID && tile(c, r - 1) === TILE.EMPTY) busy.add(c);
  /** Whether column c has a clear, plain stretch of ground floor (two tiles of headroom). */
  /** @param {number} c */
  const clear = (c) =>
    ground[c] === base &&
    tile(c, base) === TILE.EMPTY &&
    tile(c, base + 1) === TILE.EMPTY &&
    !busy.has(c) &&
    (c < arena[0] - 1 || c > arena[1]) &&
    !onPanel(c * V) &&
    !onPanel(c * V + V - 1);
  /** Whether column c is open under the ceiling (rows ceilRow-2 .. ceilRow-1). */
  /** @param {number} c @param {number} ceil */
  const openBelow = (c, ceil) =>
    tile(c, ceil - 1) === TILE.EMPTY && tile(c, ceil - 2) === TILE.EMPTY;

  if (theme === 'office') {
    // Far back row of open-space desks, in pods of three.
    let pod = 0;
    for (let c = 1; c < w - 2;) {
      if (!clear(c) || !clear(c + 1)) {
        c++;
        pod = 0;
        continue;
      }
      backDesk(vol, c * V, F, noise(c, base, 41), pod === 0);
      c += 2;
      if (++pod === 3) {
        c++;
        pod = 0;
      }
    }
    // Cable trunking along the skirting.
    for (let c = 0; c < w; c++)
      if (ground[c] === base && tile(c, base) === TILE.EMPTY)
        vol.box(c * V, F - 2, 3, c * V + V, F + 1, 5, (x) =>
          x % (2 * V) === 0 ? rgb('#c9c6be') : rgb('#e6e3dc'),
        );
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
    // Ceiling-hung room signs: navy, lime trim, a pictogram and a line of "text".
    for (let room = 0; room * 20 < w; room++) {
      const cx = room * 20 + 9;
      const x0 = cx * V - 12,
        x1 = cx * V + 12;
      if (cx >= arena[0] - 2) continue;
      let ok = true;
      for (let x = x0 - 2; x < x1 + 2; x++) if (onPanel(x)) ok = false;
      for (let c = cx - 2; c <= cx + 2; c++) if (!openBelow(c, h - 1)) ok = false;
      if (!ok) continue;
      const top = (h - 1) * V;
      for (const wx of [x0 + 3, x1 - 4]) vol.box(wx, top - 4, 9, wx + 1, top, 10, rgb('#2a2f38'));
      vol.box(x0, top - 10, 8, x1, top - 4, 10, PALETTE.fascia);
      vol.box(x0, top - 10, 8, x1, top - 9, 11, PALETTE.accent);
      vol.box(
        x0 + 2,
        top - 8,
        10,
        x0 + 5,
        top - 5,
        11,
        room % 3 === 1 ? rgb('#ff4f9a') : PALETTE.accent,
      );
      const len = 8 + Math.floor(noise(room, 1, 59) * 9);
      vol.box(x0 + 7, top - 7, 10, x0 + 7 + len, top - 6, 11, rgb('#f4f1ea'));
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
 * One desk of the far back row: white top, monitor, a chair pushed in front.
 * @param {Volume} vol
 * @param {number} a Left voxel x.
 * @param {number} F Floor voxel y.
 * @param {number} seed 0..1
 * @param {boolean} first First desk of its pod (no divider on its left).
 */
function backDesk(vol, a, F, seed, first) {
  const legs = rgb('#3a4560');
  vol.box(a + 1, F + 5, 3, a + 15, F + 6, 10, rgb('#ebe8e1'));
  vol.box(a + 1, F, 4, a + 2, F + 5, 9, legs);
  vol.box(a + 14, F, 4, a + 15, F + 5, 9, legs);
  if (!first) {
    vol.box(a, F + 5, 3, a + 1, F + 8, 10, rgb('#8a93a6'));
    vol.box(a, F + 8, 3, a + 1, F + 9, 10, PALETTE.accent);
  }
  // Monitor: lit with a spreadsheet, Teams or the intranet; some are off.
  const screens = [rgb('#58d5ff'), rgb('#7ee2a8'), rgb('#8b8cf7'), rgb('#d9f7ff')];
  const on = seed > 0.18;
  vol.box(a + 7, F + 6, 6, a + 9, F + 7, 7, rgb('#22262e'));
  vol.box(a + 4, F + 7, 6, a + 12, F + 11, 7, rgb('#1b1f27'));
  vol.box(
    a + 5,
    F + 8,
    7,
    a + 11,
    F + 10,
    8,
    on ? screens[Math.floor(seed * 97) % 4] : rgb('#20262f'),
    on ? MAT.EMISSIVE : MAT.GLOSSY,
  );
  if (seed > 0.55) vol.box(a + 11, F + 10, 7, a + 12, F + 11, 8, STICKY[Math.floor(seed * 31) % 4]);
  vol.box(a + 5, F + 6, 9, a + 11, F + 7, 10, rgb('#d0d4da'));
  if ((seed * 7) % 1 > 0.5)
    vol.box(a + 12, F + 6, 8, a + 13, F + 7, 9, seed > 0.5 ? PALETTE.fascia : rgb('#f4f1ea'));
  else vol.box(a + 2, F + 6, 4, a + 5, F + 7, 7, rgb('#fbfbf6'));
  // Chair pushed in front, a little off-centre.
  const dx = (Math.floor(seed * 13) % 5) - 2;
  const chair = rgb('#34406a');
  vol.box(a + 6 + dx, F, 11, a + 10 + dx, F + 1, 15, rgb('#22262e'));
  vol.box(a + 7 + dx, F + 1, 12, a + 9 + dx, F + 3, 14, rgb('#22262e'));
  vol.box(a + 5 + dx, F + 3, 11, a + 11 + dx, F + 4, 15, chair);
  vol.box(a + 5 + dx, F + 4, 14, a + 11 + dx, F + 8, 15, chair);
  vol.box(a + 6 + dx, F + 8, 14, a + 10 + dx, F + 9, 15, chair);
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
  // Stage wall: navy panels with a lime trim and truss lights.
  vol.box(arena[0] - 4, 3 * V, 0, arena[1], 10 * V, 2, (x, y) =>
    (x >> 3) % 4 === 0 ? rgb('#18213a') : y % (V * 2) === 0 ? rgb('#27325a') : rgb('#1f2a44'),
  );
  vol.box(arena[0] - 4, 10 * V, 0, arena[1], 10 * V + 2, 4, PALETTE.accent, MAT.EMISSIVE);
  for (let x = arena[0]; x < arena[1]; x += 2 * V)
    vol.box(x + 6, 10 * V - 3, 2, x + 10, 10 * V - 1, 5, rgb('#fff1c9'), MAT.EMISSIVE);
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
