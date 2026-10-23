import { Mesh } from './renderer.js';
import { MAT, Volume, meshVolume, rgb } from './voxels.js';

/**
 * Small voxel models for everything that moves or changes state.
 * Each model is centred on x/z with its origin at the bottom (y = 0).
 * @param {WebGL2RenderingContext} gl
 */
export function buildThings(gl) {
  const S = 1 / 16;
  /**
   * @param {number} sx @param {number} sy @param {number} sz
   * @param {(v: Volume) => void} paint
   * @param {number} [cy] Vertical pivot in voxels (default: bottom).
   */
  const model = (sx, sy, sz, paint, cy = 0) => {
    const v = new Volume(sx, sy, sz, S, [(-sx / 2) * S, -cy * S, (-sz / 2) * S]);
    paint(v);
    return new Mesh(gl, meshVolume(v));
  };
  return {
    // Swile meal ticket: a pink card with a white logo strip.
    ticket: model(
      8,
      11,
      2,
      (v) => {
        v.box(0, 0, 0, 8, 11, 2, rgb('#ff4f9a'), MAT.GLOSSY);
        v.box(1, 6, 1, 7, 8, 2, rgb('#ffffff'));
        v.box(2, 2, 1, 4, 4, 2, rgb('#ffd1e6'));
      },
      5.5,
    ),
    // Signed purchase order: yellow folder with a stamp.
    key: model(
      10,
      13,
      2,
      (v) => {
        v.box(0, 0, 0, 10, 13, 2, rgb('#ffd166'));
        v.box(1, 2, 1, 9, 11, 2, rgb('#fffdf4'));
        for (let y = 4; y < 10; y += 2) v.box(2, y, 1, 8, y + 1, 2, rgb('#9aa3ad'));
        v.box(5, 2, 1, 8, 4, 2, rgb('#2fb36b'), MAT.EMISSIVE);
      },
      6.5,
    ),
    // Visitor badge on a lanyard.
    badge: model(
      10,
      16,
      2,
      (v) => {
        v.box(4, 10, 0, 6, 16, 1, rgb('#ff4f9a'));
        v.box(0, 0, 0, 10, 10, 2, rgb('#fbfbf6'), MAT.GLOSSY);
        v.box(1, 6, 1, 9, 9, 2, rgb('#27408b'));
        v.box(2, 1, 1, 5, 5, 2, rgb('#c6f432'));
        v.box(6, 2, 1, 9, 3, 2, rgb('#9aa3ad'));
      },
      8,
    ),
    // The NAO envelope: white, pink flap, lime seal.
    envelope: model(
      14,
      10,
      2,
      (v) => {
        v.box(0, 0, 0, 14, 10, 2, rgb('#fffaf0'), MAT.GLOSSY);
        for (let i = 0; i < 7; i++) v.box(i, 9 - i, 1, 14 - i, 10 - i, 2, rgb('#ff4f9a'));
        v.box(6, 3, 1, 8, 5, 2, rgb('#c6f432'), MAT.EMISSIVE);
      },
      5,
    ),
    loose: model(
      16,
      3,
      60,
      (v) => {
        v.box(0, 0, 0, 16, 3, 60, rgb('#6c7a92'));
        v.box(0, 2, 0, 16, 3, 60, (x, _y, z) =>
          (x + z) % 7 === 0 ? rgb('#3b4458') : rgb('#7e8ca6'),
        );
        v.box(0, 1, 58, 16, 2, 60, rgb('#ff9f43'), MAT.EMISSIVE);
      },
      3,
    ),
    panel: model(
      16,
      2,
      26,
      (v) => {
        v.box(0, 0, 0, 16, 2, 26, rgb('#f2efe8'));
        v.box(1, 0, 1, 15, 1, 25, rgb('#dcd7cc'));
      },
      0,
    ),
    bottle: model(
      10,
      10,
      16,
      (v) => {
        // Lying on its side; rolls around its long (z) axis.
        for (let y = 0; y < 10; y++)
          for (let x = 0; x < 10; x++)
            if ((x - 4.5) ** 2 + (y - 4.5) ** 2 < 22)
              v.box(x, y, 1, x + 1, y + 1, 15, rgb(y > 6 ? '#bfe6ff' : '#5fb4f5'), MAT.GLOSSY);
        v.box(3, 3, 0, 7, 7, 1, rgb('#2b6cb0'));
        v.box(2, 2, 6, 8, 8, 9, rgb('#ffffff'));
      },
      5,
    ),
    door: model(
      4,
      32,
      40,
      (v) => {
        v.box(0, 0, 0, 4, 32, 40, rgb('#2b3446'));
        v.box(1, 2, 3, 3, 30, 37, rgb('#9fd8ff'), MAT.GLOSSY);
        v.box(0, 14, 34, 4, 18, 36, rgb('#c6f432'), MAT.EMISSIVE);
      },
      0,
    ),
    reader: model(
      5,
      8,
      3,
      (v) => {
        v.box(0, 0, 0, 5, 8, 3, rgb('#2a2f3a'));
        v.box(1, 4, 2, 4, 7, 3, rgb('#ff5e5e'), MAT.EMISSIVE);
      },
      0,
    ),
    readerOn: model(
      5,
      8,
      3,
      (v) => {
        v.box(0, 0, 0, 5, 8, 3, rgb('#2a2f3a'));
        v.box(1, 4, 2, 4, 7, 3, rgb('#58ff9a'), MAT.EMISSIVE);
      },
      0,
    ),
    // Chronotime badge terminal on a post.
    checkpoint: model(
      6,
      22,
      4,
      (v) => {
        v.box(2, 0, 1, 4, 14, 3, rgb('#9aa3ad'));
        v.box(0, 14, 0, 6, 22, 4, rgb('#1e2433'));
        v.box(1, 17, 3, 5, 21, 4, rgb('#ffb347'), MAT.EMISSIVE);
      },
      0,
    ),
    checkpointOn: model(
      6,
      22,
      4,
      (v) => {
        v.box(2, 0, 1, 4, 14, 3, rgb('#9aa3ad'));
        v.box(0, 14, 0, 6, 22, 4, rgb('#1e2433'));
        v.box(1, 17, 3, 5, 21, 4, rgb('#58ff9a'), MAT.EMISSIVE);
      },
      0,
    ),
    // Meeting report (CR) in flight: a sheet with typed lines.
    cr: model(
      7,
      9,
      1,
      (v) => {
        v.box(0, 0, 0, 7, 9, 1, rgb('#ffffff'));
        for (let y = 2; y < 8; y += 2) v.box(1, y, 0, 6, y + 1, 1, rgb('#5a6b8c'));
        v.box(1, 7, 0, 4, 8, 1, rgb('#ff4f9a'));
      },
      4.5,
    ),
    // Ream of paper: refills the CR stock.
    ammo: model(
      9,
      5,
      6,
      (v) => {
        v.box(0, 0, 0, 9, 5, 6, rgb('#fbfbf6'));
        v.box(0, 1, 0, 9, 4, 6, rgb('#3d8bfd'));
        v.box(2, 2, 6 - 1, 7, 3, 6, rgb('#ffffff'));
      },
      2.5,
    ),
    exit: model(
      4,
      36,
      30,
      (v) => {
        v.box(0, 0, 0, 4, 36, 4, rgb('#c6f432'), MAT.EMISSIVE);
        v.box(0, 0, 26, 4, 36, 30, rgb('#c6f432'), MAT.EMISSIVE);
        v.box(0, 32, 0, 4, 36, 30, rgb('#c6f432'), MAT.EMISSIVE);
      },
      0,
    ),
  };
}
