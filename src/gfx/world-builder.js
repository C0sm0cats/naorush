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
  const concrete = vary(rgb('#7b818c'), 0.08, 2);
  /** Floor finish: carpet in offices, raised-floor tiles in the server hall. */
  const floorTop = park
    ? /** @param {number} x @param {number} y @param {number} z */ (x, y, z) =>
        x % (3 * V) < 1 && z > zv(-1.8) ? rgb('#e9e6dc') : vary(rgb('#3b3f47'), 0.18, 1)(x, y, z)
    : dc
      ? /** @param {number} x @param {number} _y @param {number} z */ (x, _y, z) =>
          ((x >> 2) + (z >> 2)) % 2 ? rgb('#a3acb7') : rgb('#8d96a2')
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
          const c = stripe
            ? (x >> 2) % 2
              ? rgb('#f2c230')
              : rgb('#1c1c1c')
            : band
              ? rgb('#2f6fd6')
              : panel && inWindowBand
                ? rgb('#8e949e')
                : vary(rgb('#6b717c'), 0.07, 3)(x, y, 0);
          vol.box(x, y, 0, x + 1, y + 1, 3, c);
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
            vol.box(x0, y0 + V - 2, zv(-2.6), x0 + V, y0 + V, sz, vary(rgb('#7d7a75'), 0.2, 1));
            vol.box(x0, y0 + V - 2, sz - 2, x0 + V, y0 + V + 1, sz, rgb('#d8d2c6'));
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
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, vary(rgb('#7d7a75'), 0.2, 1));
            vol.box(x0, y0 + V - 2, sz - 2, x0 + V, y0 + V + 1, sz, rgb('#d8d2c6'));
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
          vol.box(x0, y0, 0, x0 + V, y0 + 1, sz, park ? rgb('#8a909a') : PALETTE.ceiling);
          const lamp = park ? c % 6 === 3 && below !== TILE.SOLID : c % 5 === 2;
          if (lamp) {
            // Office ceiling lights, cool tubes in the server room, neon in the car park.
            vol.box(
              x0 + (park ? 0 : 1),
              y0 - 1,
              zv(park ? -1.2 : -1.6),
              x0 + V - (park ? 0 : 1),
              y0,
              zv(park ? -0.6 : 0.4),
              dc ? rgb('#bfe9ff') : park ? rgb('#e6f6ff') : PALETTE.lamp,
              MAT.EMISSIVE,
            );
            lights.push({
              pos: [c + 0.5, r - 0.6, -0.6],
              radius: park ? 7 : 6.5,
              color: dc ? [0.3, 0.45, 0.6] : park ? [0.42, 0.5, 0.62] : [0.55, 0.5, 0.42],
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

  for (const d of decor) placeDecor(vol, d, sz);
  return { vol, mesh: meshVolume(vol), lights };
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
