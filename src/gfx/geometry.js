import { MAT, STRIDE, rgb } from './voxels.js';

/**
 * Smooth procedural geometry (rounded boxes, capsules, ellipsoids, lathes) written
 * into the same vertex format as voxel meshes, so both share one shader.
 */
export class MeshBuilder {
  constructor() {
    /** @type {number[]} */
    this.pos = [];
    /** @type {number[]} */
    this.nrm = [];
    /** @type {number[]} */
    this.col = [];
    /** @type {number[]} */
    this.mat = [];
  }

  /**
   * @param {number[]} p @param {number[]} n @param {number} color @param {number} mat @param {number} ao 0..1
   */
  vertex(p, n, color, mat, ao = 1) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push((color >> 16) & 255, (color >> 8) & 255, color & 255, Math.round(ao * 255));
    this.mat.push(mat);
  }

  /**
   * Adds a quad grid surface: `point(u, v)` returns position and normal for u, v in [0, 1].
   * @param {number} nu @param {number} nv
   * @param {(u: number, v: number) => {p: number[], n: number[], ao?: number}} point
   * @param {number} color @param {number} [mat]
   */
  grid(nu, nv, point, color, mat = MAT.MATTE) {
    /** @type {Array<{p: number[], n: number[], ao?: number}>} */
    const pts = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(point(i / nu, j / nv));
    /** @param {number} i @param {number} j */
    const at = (i, j) => pts[i + j * (nu + 1)];
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = at(i, j),
          b = at(i + 1, j),
          c = at(i + 1, j + 1),
          d = at(i, j + 1);
        for (const q of [a, b, c, a, c, d]) this.vertex(q.p, q.n, color, mat, q.ao ?? 1);
      }
  }

  /**
   * Rounded box centred on `c` with half extents `h` and corner radius `r`.
   * With r equal to two half extents it becomes a capsule.
   * @param {number[]} c @param {number[]} h @param {number} r @param {number | string} color
   * @param {{mat?: number, seg?: number, shade?: (n: number[]) => number}} [o]
   */
  roundedBox(c, h, r, color, o = {}) {
    const col = typeof color === 'string' ? rgb(color) : color;
    const seg = o.seg ?? 10;
    const inner = h.map((x) => Math.max(0, x - r));
    // Six cube faces, each a grid; points are pushed onto the rounded surface.
    const faces = [
      [0, 1, 2, 1],
      [0, 1, 2, -1],
      [1, 2, 0, 1],
      [1, 2, 0, -1],
      [2, 0, 1, 1],
      [2, 0, 1, -1],
    ];
    for (const [a1, a2, axis, sign] of faces) {
      this.grid(
        seg,
        seg,
        (u, v) => {
          const q = [0, 0, 0];
          q[axis] = sign;
          // Cosine spacing packs vertices into the rounded edges, where curvature is.
          q[a1] = Math.sin((u - 0.5) * Math.PI) * (sign > 0 ? 1 : -1);
          q[a2] = Math.sin((v - 0.5) * Math.PI);
          const p = q.map((x, i) => x * h[i]);
          const k = p.map((x, i) => Math.max(-inner[i], Math.min(inner[i], x)));
          const d = p.map((x, i) => x - k[i]);
          const len = Math.hypot(...d) || 1;
          const n = d.map((x) => x / len);
          return { p: k.map((x, i) => c[i] + x + n[i] * r), n, ao: o.shade ? o.shade(n) : 1 };
        },
        col,
        o.mat,
      );
    }
    return this;
  }

  /**
   * Ellipsoid centred on `c` with radii `r`.
   * @param {number[]} c @param {number[]} r @param {number | string} color
   * @param {{mat?: number, seg?: number, from?: number, to?: number}} [o] Optional latitude range (0 = bottom, 1 = top).
   */
  ellipsoid(c, r, color, o = {}) {
    const col = typeof color === 'string' ? rgb(color) : color;
    const seg = o.seg ?? 22;
    const from = o.from ?? 0,
      to = o.to ?? 1;
    this.grid(
      seg * 2,
      seg,
      (u, v) => {
        const lat = (from + (to - from) * v) * Math.PI - Math.PI / 2;
        const lon = u * Math.PI * 2;
        const s = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
        const n = [s[0] / r[0], s[1] / r[1], s[2] / r[2]];
        const len = Math.hypot(...n) || 1;
        return {
          p: [c[0] + s[0] * r[0], c[1] + s[1] * r[1], c[2] + s[2] * r[2]],
          n: n.map((x) => x / len),
        };
      },
      col,
      o.mat,
    );
    return this;
  }

  /**
   * Surface of revolution around the y axis through `c`: `profile` lists [radius, y] pairs.
   * @param {number[]} c @param {number[][]} profile @param {number | string} color
   * @param {{mat?: number, seg?: number, scaleZ?: number}} [o]
   */
  lathe(c, profile, color, o = {}) {
    const col = typeof color === 'string' ? rgb(color) : color;
    const seg = o.seg ?? 32;
    const sz = o.scaleZ ?? 1;
    for (let j = 0; j < profile.length - 1; j++) {
      const [r0, y0] = profile[j],
        [r1, y1] = profile[j + 1];
      const slope = (r0 - r1) / (y1 - y0 || 1e-6);
      this.grid(
        seg,
        1,
        (u, v) => {
          const a = u * Math.PI * 2;
          const r = v ? r1 : r0,
            y = v ? y1 : y0;
          const n = [Math.sin(a), slope, Math.cos(a) / sz];
          const len = Math.hypot(...n);
          return {
            p: [c[0] + Math.sin(a) * r, c[1] + y, c[2] + Math.cos(a) * r * sz],
            n: n.map((x) => x / len),
          };
        },
        col,
        o.mat,
      );
    }
    return this;
  }

  /** @returns {{data: ArrayBuffer, count: number}} */
  build() {
    const count = this.mat.length;
    const buf = new ArrayBuffer(count * STRIDE);
    const f32 = new Float32Array(buf);
    const i8 = new Int8Array(buf);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < count; i++) {
      const b = i * STRIDE;
      f32[b / 4] = this.pos[i * 3];
      f32[b / 4 + 1] = this.pos[i * 3 + 1];
      f32[b / 4 + 2] = this.pos[i * 3 + 2];
      i8[b + 12] = Math.round(this.nrm[i * 3] * 127);
      i8[b + 13] = Math.round(this.nrm[i * 3 + 1] * 127);
      i8[b + 14] = Math.round(this.nrm[i * 3 + 2] * 127);
      u8.set(this.col.slice(i * 4, i * 4 + 4), b + 16);
      u8[b + 20] = this.mat[i];
    }
    return { data: buf, count };
  }
}
