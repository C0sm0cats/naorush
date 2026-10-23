/**
 * Dense voxel volume and mesher with per-vertex ambient occlusion.
 *
 * Each voxel stores an RGB colour plus a material byte (0 = empty, 1 = matte,
 * 2 = emissive, 3 = glossy). Meshing emits only visible faces; every vertex
 * gets an occlusion term from its three neighbours, which gives the soft,
 * "baked" look of hand-made voxel art without any post-processing.
 */

export const MAT = Object.freeze({ EMPTY: 0, MATTE: 1, EMISSIVE: 2, GLOSSY: 3 });

/**
 * @param {string} hex `#rrggbb`
 * @returns {number} 0xRRGGBB
 */
export const rgb = (hex) => parseInt(hex.slice(1, 7), 16);

export class Volume {
  /**
   * @param {number} sx Size in voxels along x.
   * @param {number} sy
   * @param {number} sz
   * @param {number} size World size of one voxel.
   * @param {[number, number, number]} [origin] World position of voxel (0,0,0)'s corner.
   */
  constructor(sx, sy, sz, size, origin = [0, 0, 0]) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.size = size;
    this.origin = origin;
    /** Packed 0xMMRRGGBB per voxel. */
    this.data = new Uint32Array(sx * sy * sz);
  }

  /** @param {number} x @param {number} y @param {number} z */
  index(x, y, z) {
    return x + this.sx * (y + this.sy * z);
  }

  /** @param {number} x @param {number} y @param {number} z */
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.data[this.index(x, y, z)];
  }

  /**
   * @param {number} x @param {number} y @param {number} z
   * @param {number} color 0xRRGGBB
   * @param {number} [mat]
   */
  set(x, y, z, color, mat = MAT.MATTE) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.data[this.index(x, y, z)] =
      mat === MAT.EMPTY ? 0 : ((mat << 24) | (color & 0xffffff)) >>> 0;
  }

  /**
   * Fills an axis-aligned box given in voxel coordinates (inclusive-exclusive).
   * `color` may be a function for patterns (wood grain, carpet, windows).
   * @param {number} x0 @param {number} y0 @param {number} z0
   * @param {number} x1 @param {number} y1 @param {number} z1
   * @param {number | ((x: number, y: number, z: number) => number)} color
   * @param {number} [mat]
   */
  box(x0, y0, z0, x1, y1, z1, color, mat = MAT.MATTE) {
    const ax = Math.max(0, Math.floor(Math.min(x0, x1)));
    const bx = Math.min(this.sx, Math.ceil(Math.max(x0, x1)));
    const ay = Math.max(0, Math.floor(Math.min(y0, y1)));
    const by = Math.min(this.sy, Math.ceil(Math.max(y0, y1)));
    const az = Math.max(0, Math.floor(Math.min(z0, z1)));
    const bz = Math.min(this.sz, Math.ceil(Math.max(z0, z1)));
    for (let z = az; z < bz; z++)
      for (let y = ay; y < by; y++)
        for (let x = ax; x < bx; x++)
          this.set(x, y, z, typeof color === 'function' ? color(x, y, z) : color, mat);
  }

  /**
   * Same as {@link box} but with world coordinates.
   * @param {number} x0 @param {number} y0 @param {number} z0
   * @param {number} x1 @param {number} y1 @param {number} z1
   * @param {number | ((x: number, y: number, z: number) => number)} color
   * @param {number} [mat]
   */
  worldBox(x0, y0, z0, x1, y1, z1, color, mat = MAT.MATTE) {
    const [ox, oy, oz] = this.origin;
    const s = this.size;
    this.box(
      Math.round((x0 - ox) / s),
      Math.round((y0 - oy) / s),
      Math.round((z0 - oz) / s),
      Math.round((x1 - ox) / s),
      Math.round((y1 - oy) / s),
      Math.round((z1 - oz) / s),
      color,
      mat,
    );
  }
}

// Face directions: normal, then the two in-plane axes used for AO sampling.
const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

/** Bytes per vertex: position 3×f32, normal 4×i8, colour 4×u8 (rgb + ao), material 4×u8. */
export const STRIDE = 24;

/**
 * Converts a volume to an interleaved vertex buffer with greedy meshing:
 * coplanar faces sharing colour, material and corner occlusion are merged
 * into larger quads, which keeps big flat surfaces cheap to draw.
 * @param {Volume} vol
 * @returns {{data: ArrayBuffer, count: number}}
 */
export function meshVolume(vol) {
  const dims = [vol.sx, vol.sy, vol.sz];
  /** @type {number[]} */
  const out = [];
  const get = (p) => vol.get(p[0], p[1], p[2]);
  for (let f = 0; f < 6; f++) {
    const { n } = FACES[f];
    const d = n[0] ? 0 : n[1] ? 1 : 2;
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const sign = n[d];
    const du = dims[u],
      dv = dims[v];
    const keys = new Float64Array(du * dv);
    const aoMask = new Uint8Array(du * dv);
    const p = [0, 0, 0];
    const q = [0, 0, 0];
    for (let layer = 0; layer < dims[d]; layer++) {
      // Build the mask of visible faces in this layer.
      for (let j = 0; j < dv; j++)
        for (let i = 0; i < du; i++) {
          p[d] = layer;
          p[u] = i;
          p[v] = j;
          const vox = get(p);
          const k = i + j * du;
          keys[k] = 0;
          if (!vox) continue;
          q[0] = p[0] + n[0];
          q[1] = p[1] + n[1];
          q[2] = p[2] + n[2];
          if (get(q)) continue;
          // Corner occlusion, sampled in the empty layer in front of the face.
          let ao = 0;
          const corner = (cu, cv, shift) => {
            const a = [...q],
              b = [...q],
              c = [...q];
            a[u] += cu;
            b[v] += cv;
            c[u] += cu;
            c[v] += cv;
            const s1 = get(a) ? 1 : 0,
              s2 = get(b) ? 1 : 0,
              s3 = get(c) ? 1 : 0;
            ao |= (s1 && s2 ? 0 : 3 - (s1 + s2 + s3)) << shift;
          };
          corner(-1, -1, 0);
          corner(1, -1, 2);
          corner(1, 1, 4);
          corner(-1, 1, 6);
          aoMask[k] = ao;
          keys[k] = vox * 256 + ao + 1;
        }
      // Greedy merge.
      for (let j = 0; j < dv; j++)
        for (let i = 0; i < du;) {
          const k = i + j * du;
          const key = keys[k];
          if (!key) {
            i++;
            continue;
          }
          let w = 1;
          while (i + w < du && keys[k + w] === key) w++;
          let h = 1;
          outer: while (j + h < dv) {
            for (let x = 0; x < w; x++) if (keys[k + x + h * du] !== key) break outer;
            h++;
          }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) keys[k + x + y * du] = 0;
          const vox = Math.floor((key - 1) / 256);
          out.push(f, layer + (sign > 0 ? 1 : 0), i, j, w, h, vox, aoMask[k], d, u, v);
          i += w;
        }
    }
  }
  const quadCount = out.length / 11;
  const buf = new ArrayBuffer(quadCount * 6 * STRIDE);
  const f32 = new Float32Array(buf);
  const i8 = new Int8Array(buf);
  const u8 = new Uint8Array(buf);
  const [ox, oy, oz] = vol.origin;
  const s = vol.size;
  let vi = 0;
  for (let q = 0; q < out.length; q += 11) {
    const [f, plane, i, j, w, h, vox, ao, d, u, v] = out.slice(q, q + 11);
    const { n } = FACES[f];
    const aoAt = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
    const cornersUV = [
      [i, j],
      [i + w, j],
      [i + w, j + h],
      [i, j + h],
    ];
    const order = aoAt[0] + aoAt[2] > aoAt[1] + aoAt[3] ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
    const r = (vox >> 16) & 255,
      g = (vox >> 8) & 255,
      bl = vox & 255,
      mat = (vox >>> 24) & 255;
    for (const k of order) {
      const pos = [0, 0, 0];
      pos[d] = plane;
      pos[u] = cornersUV[k][0];
      pos[v] = cornersUV[k][1];
      const base = vi * STRIDE;
      f32[base / 4] = ox + pos[0] * s;
      f32[base / 4 + 1] = oy + pos[1] * s;
      f32[base / 4 + 2] = oz + pos[2] * s;
      i8[base + 12] = n[0] * 127;
      i8[base + 13] = n[1] * 127;
      i8[base + 14] = n[2] * 127;
      u8[base + 16] = r;
      u8[base + 17] = g;
      u8[base + 18] = bl;
      u8[base + 19] = aoAt[k] * 85;
      u8[base + 20] = mat;
      vi++;
    }
  }
  return { data: buf, count: vi };
}
