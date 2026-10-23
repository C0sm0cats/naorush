import { TILE } from '../game/sim.js';
import { POSTERS, POSTER_H, WHITEBOARD_W } from '../data/inetum.js';
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
 * @param {import('../data/slice.js').Decor[]} decor
 * @param {string[]} [map] Level rows, used for tile styles ('M' meeting room, 'B' paper reams).
 */
export function buildOffice(sim, decor, map = []) {
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
            : POSTER_H * POSTERS[/** @type {string} */ (d.id)].aspect;
      return [Math.floor((d.x - 0.35) * V), Math.ceil((d.x + w + 0.35) * V)];
    });
  /** @param {number} x */
  const onPanel = (x) => panels.some(([a, b]) => x >= a && x < b);
  for (let x = 0; x < sx; x++) {
    const panel = onPanel(x);
    for (let y = 0; y < sy; y++) {
      const ty = y / V;
      const inWindowBand = ty > 4.2 && ty < 9.6;
      if (inWindowBand && !panel) {
        const mullion = x % (V * 4) < 2 || Math.abs(ty - 6.9) < 0.12;
        if (mullion) vol.box(x, y, 0, x + 1, y + 1, 3, PALETTE.mullion);
        continue;
      }
      const c = ty < 1 ? PALETTE.wallLow : panel && inWindowBand ? rgb('#d9d1c3') : PALETTE.wall;
      vol.box(x, y, 0, x + 1, y + 1, 3, vary(c, 0.05, 4)(x, y, 0));
    }
  }
  // Panel edges: thin dark reveals so the wall panels read as built.
  for (const [a, b] of panels)
    for (const x of [a, b - 1]) vol.box(x, 4.2 * V, 3, x + 1, 9.6 * V, 4, PALETTE.mullion);
  // Window sills.
  vol.box(0, 4.2 * V - 1, 3, sx, 4.2 * V, 6, PALETTE.wallLow);

  // Tiles.
  for (let r = 0; r < sim.h; r++)
    for (let c = 0; c < sim.w; c++) {
      const t = sim.tiles[c + r * sim.w];
      const x0 = c * V,
        y0 = r * V;
      const style = t === TILE.SOLID ? styleAt(c, r) : '';
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
        const above = at(0, 1),
          below = at(0, -1);
        const isCeiling = r === sim.h - 1;
        const isBase = r <= 1;
        const floats = below !== TILE.SOLID && below !== TILE.HAZARD && !isCeiling;
        const depthBack = isCeiling || isBase ? 0 : zv(-2.4);
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
          vol.box(x0, y0, depthBack, x0 + V, y0 + V, sz, vary(rgb('#bdb4a6'), 0.05, V));
          if (above !== TILE.SOLID)
            vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, vary(PALETTE.carpet, 0.14, 2));
        }
        if (above !== TILE.SOLID && !isCeiling && (isBase || floats)) {
          // Carpet on top with a thin lime nosing on the front edge.
          vol.box(x0, y0 + V - 2, depthBack, x0 + V, y0 + V, sz, vary(PALETTE.carpet, 0.14, 2));
          vol.box(x0, y0 + V - 2, sz - 1, x0 + V, y0 + V - 1, sz, PALETTE.accent);
        }
        if (isCeiling) {
          vol.box(x0, y0, 0, x0 + V, y0 + V, sz, rgb('#1a2132'));
          vol.box(x0, y0, 0, x0 + V, y0 + 1, sz, PALETTE.ceiling);
          if (c % 5 === 2) {
            vol.box(x0 + 1, y0 - 1, zv(-1.6), x0 + V - 1, y0, zv(0.4), PALETTE.lamp, MAT.EMISSIVE);
            lights.push({ pos: [c + 0.5, r - 0.6, -0.6], radius: 6.5, color: [0.55, 0.5, 0.42] });
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

  for (const d of decor) placeDecor(vol, d, zv, PALETTE, sz);
  return { vol, mesh: meshVolume(vol), lights };
}

/**
 * @param {Volume} vol
 * @param {import('../data/slice.js').Decor} d
 * @param {(z: number) => number} zv
 * @param {typeof PALETTE} P
 * @param {number} sz Volume depth in voxels.
 */
function placeDecor(vol, d, zv, P, sz) {
  const x = Math.round(d.x * V);
  const y = Math.round(d.y * V);
  switch (d.type) {
    case 'poster':
    case 'whiteboard': {
      // Frame and a small spotlight above the artwork (the image itself is a sprite).
      const w =
        d.type === 'whiteboard'
          ? WHITEBOARD_W
          : POSTER_H * POSTERS[/** @type {string} */ (d.id)].aspect;
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
    case 'desk': {
      // The supplied desk artwork stands on the floor; an office chair sits beside it.
      const z1 = zv(-1.6),
        cx = x + 35;
      vol.box(cx, y + 3, z1 + 1, cx + 5, y + 4, z1 + 5, rgb('#2c3346'));
      vol.box(cx, y + 4, z1, cx + 5, y + 10, z1 + 1, rgb('#2c3346'));
      vol.box(cx + 2, y, z1 + 2, cx + 3, y + 3, z1 + 3, P.metal);
      vol.box(cx, y, z1 + 1, cx + 5, y + 1, z1 + 5, rgb('#20242c'));
      break;
    }
    case 'plant': {
      const z = zv(-2);
      vol.box(x, y, z, x + 4, y + 4, z + 4, P.pot);
      for (let i = 0; i < 18; i++) {
        const lx = x + 2 + Math.round(Math.sin(i * 2.3) * (1 + i / 6));
        const ly = y + 4 + Math.round(i / 2.2);
        const lz = z + 2 + Math.round(Math.cos(i * 1.7) * 2);
        vol.box(lx, ly, lz, lx + 2, ly + 1, lz + 1, i % 3 ? P.leaf : P.leafLight);
      }
      break;
    }
    case 'coffee': {
      const z = zv(-2.3);
      vol.box(x, y, z, x + 7, y + 6, z + 6, rgb('#d7d2c8'));
      vol.box(x, y + 6, z, x + 7, y + 14, z + 6, rgb('#30353d'));
      vol.box(x + 1, y + 10, z + 6, x + 6, y + 13, z + 7, rgb('#8be08b'), MAT.EMISSIVE);
      vol.box(x + 2, y + 7, z + 6, x + 4, y + 9, z + 8, rgb('#ffffff'));
      break;
    }
    case 'printer': {
      const z = zv(-2.2);
      vol.box(x, y, z, x + 12, y + 7, z + 8, rgb('#e2e4e7'));
      vol.box(x, y + 7, z, x + 12, y + 9, z + 8, rgb('#565d68'));
      vol.box(x + 2, y + 4, z + 8, x + 10, y + 5, z + 9, rgb('#ffffff'));
      vol.box(x + 9, y + 6, z + 8, x + 11, y + 7, z + 9, rgb('#58ff9a'), MAT.EMISSIVE);
      break;
    }
    case 'cooler': {
      const z = zv(-2.1);
      vol.box(x, y, z, x + 6, y + 9, z + 6, rgb('#eef1f4'));
      vol.box(x + 1, y + 9, z + 1, x + 5, y + 15, z + 5, rgb('#7cc6ff'), MAT.GLOSSY);
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
