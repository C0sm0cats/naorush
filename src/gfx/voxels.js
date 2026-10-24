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
    // Same packing as set(), with the bounds already clamped.
    const data = this.data;
    const sx = this.sx,
      sxy = this.sx * this.sy;
    const m = mat << 24;
    if (typeof color !== 'function') {
      const packed = mat === MAT.EMPTY ? 0 : (m | (color & 0xffffff)) >>> 0;
      for (let z = az; z < bz; z++)
        for (let y = ay; y < by; y++) {
          const row = y * sx + z * sxy;
          if (bx > ax) data.fill(packed, row + ax, row + bx);
        }
      return;
    }
    for (let z = az; z < bz; z++)
      for (let y = ay; y < by; y++) {
        const row = y * sx + z * sxy;
        for (let x = ax; x < bx; x++) {
          const c = color(x, y, z);
          data[row + x] = mat === MAT.EMPTY ? 0 : (m | (c & 0xffffff)) >>> 0;
        }
      }
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

/** Integers per quad in the mesher's scratch list: face, plane, i, j, w, h, voxel, ao. */
const QUAD = 8;

/**
 * Converts a volume to an interleaved vertex buffer with greedy meshing:
 * coplanar faces sharing colour, material and corner occlusion are merged
 * into larger quads, which keeps big flat surfaces cheap to draw.
 *
 * Visible faces are found in one pass over the packed array in memory order,
 * then merged layer by layer from those lists, so a whole stage meshes in a
 * fraction of the time a coordinate-based walk takes.
 * @param {Volume} vol
 * @returns {{data: ArrayBuffer, count: number}}
 */
export function meshVolume(vol) {
  const data = vol.data;
  const sx = vol.sx,
    sy = vol.sy,
    sz = vol.sz;
  const dims = [sx, sy, sz];
  const strides = [1, sx, sx * sy];
  // Pass 1, in memory order: every visible face with its corner occlusion, listed
  // per direction as (layer, cell in layer, voxel, ao).
  /** @type {Array<{n: number, layer: Int32Array, cell: Int32Array, vox: Uint32Array, ao: Uint8Array}>} */
  const lists = [];
  const start = Math.max(1024, (data.length >> 6) + 1);
  for (let f = 0; f < 6; f++)
    lists.push({
      n: 0,
      layer: new Int32Array(start),
      cell: new Int32Array(start),
      vox: new Uint32Array(start),
      ao: new Uint8Array(start),
    });
  /** @param {{n: number, layer: Int32Array, cell: Int32Array, vox: Uint32Array, ao: Uint8Array}} L */
  const grow = (L) => {
    const m = L.layer.length * 2;
    const layer = new Int32Array(m),
      cell = new Int32Array(m),
      vox = new Uint32Array(m),
      ao = new Uint8Array(m);
    layer.set(L.layer);
    cell.set(L.cell);
    vox.set(L.vox);
    ao.set(L.ao);
    L.layer = layer;
    L.cell = cell;
    L.vox = vox;
    L.ao = ao;
  };
  for (let z = 0, idx = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++, idx++) {
        const vox = data[idx];
        if (!vox) continue;
        for (let f = 0; f < 6; f++) {
          const d = f >> 1;
          const sign = f & 1 ? -1 : 1;
          const u = (d + 1) % 3;
          const v = (d + 2) % 3;
          const cd = d === 0 ? x : d === 1 ? y : z,
            ci = d === 0 ? y : d === 1 ? z : x,
            cj = d === 0 ? z : d === 1 ? x : y;
          const qd = cd + sign;
          let ao = 255;
          if (qd >= 0 && qd < dims[d]) {
            const q = idx + sign * strides[d];
            if (data[q]) continue;
            // Corner occlusion, sampled in the empty layer in front of the face.
            const du = dims[u],
              dv = dims[v],
              su = strides[u],
              sv = strides[v];
            const iL = ci > 0,
              iR = ci + 1 < du,
              jD = cj > 0,
              jU = cj + 1 < dv;
            const l = iL && data[q - su] ? 1 : 0,
              r = iR && data[q + su] ? 1 : 0,
              dn = jD && data[q - sv] ? 1 : 0,
              up = jU && data[q + sv] ? 1 : 0;
            const ld = iL && jD && data[q - su - sv] ? 1 : 0,
              rd = iR && jD && data[q + su - sv] ? 1 : 0,
              ru = iR && jU && data[q + su + sv] ? 1 : 0,
              lu = iL && jU && data[q - su + sv] ? 1 : 0;
            ao =
              (l && dn ? 0 : 3 - (l + dn + ld)) |
              ((r && dn ? 0 : 3 - (r + dn + rd)) << 2) |
              ((r && up ? 0 : 3 - (r + up + ru)) << 4) |
              ((l && up ? 0 : 3 - (l + up + lu)) << 6);
          }
          const L = lists[f];
          if (L.n === L.layer.length) grow(L);
          L.layer[L.n] = cd;
          L.cell[L.n] = ci + cj * dims[u];
          L.vox[L.n] = vox;
          L.ao[L.n] = ao;
          L.n++;
        }
      }
  // Pass 2, layer by layer: fill the mask from the list, then merge greedily
  // (coplanar faces sharing colour, material and occlusion become one quad).
  let quads = new Int32Array(QUAD * 4096);
  let nq = 0;
  const cells = Math.max(sy * sz, sz * sx, sx * sy);
  const keys = new Float64Array(cells);
  const aoMask = new Uint8Array(cells);
  for (let f = 0; f < 6; f++) {
    const { n } = FACES[f];
    const d = n[0] ? 0 : n[1] ? 1 : 2;
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const sign = n[d];
    const du = dims[u],
      dv = dims[v],
      nd = dims[d];
    const sd = strides[d],
      su = strides[u],
      sv = strides[v];
    const L = lists[f];
    // Bucket the faces by layer (counting sort).
    const offs = new Int32Array(nd + 1);
    for (let k = 0; k < L.n; k++) offs[L.layer[k] + 1]++;
    for (let k = 0; k < nd; k++) offs[k + 1] += offs[k];
    const order = new Int32Array(L.n);
    const fill = offs.slice(0, nd);
    for (let k = 0; k < L.n; k++) order[fill[L.layer[k]]++] = k;
    for (let layer = 0; layer < nd; layer++) {
      const a = offs[layer],
        b = offs[layer + 1];
      if (a === b) continue;
      let j0 = dv,
        j1 = -1;
      for (let o = a; o < b; o++) {
        const k = order[o];
        const c = L.cell[k];
        keys[c] = L.vox[k] * 256 + L.ao[k] + 1;
        aoMask[c] = L.ao[k];
        const j = (c / du) | 0;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
      const lb = layer * sd;
      const plane = layer + (sign > 0 ? 1 : 0);
      // Every set cell ends up in a quad, so the mask is all zero again afterwards.
      for (let j = j0; j <= j1; j++)
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
          for (let y = 0; y < h; y++) keys.fill(0, k + y * du, k + y * du + w);
          if (nq + QUAD > quads.length) {
            const grown = new Int32Array(quads.length * 2);
            grown.set(quads);
            quads = grown;
          }
          quads[nq] = f;
          quads[nq + 1] = plane;
          quads[nq + 2] = i;
          quads[nq + 3] = j;
          quads[nq + 4] = w;
          quads[nq + 5] = h;
          quads[nq + 6] = data[lb + i * su + j * sv];
          quads[nq + 7] = aoMask[k];
          nq += QUAD;
          i += w;
        }
    }
  }
  const quadCount = nq / QUAD;
  const buf = new ArrayBuffer(quadCount * 6 * STRIDE);
  const f32 = new Float32Array(buf);
  const i8 = new Int8Array(buf);
  const u8 = new Uint8Array(buf);
  const [ox, oy, oz] = vol.origin;
  const s = vol.size;
  const aoAt = [0, 0, 0, 0];
  const cu = [0, 0, 0, 0],
    cv = [0, 0, 0, 0];
  const pos = [0, 0, 0];
  const ORDER_A = [0, 1, 2, 0, 2, 3],
    ORDER_B = [1, 2, 3, 1, 3, 0];
  let base = 0;
  for (let q = 0; q < nq; q += QUAD) {
    const f = quads[q],
      plane = quads[q + 1],
      i = quads[q + 2],
      j = quads[q + 3],
      w = quads[q + 4],
      h = quads[q + 5],
      vox = quads[q + 6] >>> 0,
      ao = quads[q + 7];
    const { n } = FACES[f];
    const d = n[0] ? 0 : n[1] ? 1 : 2;
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    aoAt[0] = ao & 3;
    aoAt[1] = (ao >> 2) & 3;
    aoAt[2] = (ao >> 4) & 3;
    aoAt[3] = (ao >> 6) & 3;
    cu[0] = cu[3] = i;
    cu[1] = cu[2] = i + w;
    cv[0] = cv[1] = j;
    cv[2] = cv[3] = j + h;
    const order = aoAt[0] + aoAt[2] > aoAt[1] + aoAt[3] ? ORDER_A : ORDER_B;
    const r = (vox >> 16) & 255,
      g = (vox >> 8) & 255,
      bl = vox & 255,
      mat = (vox >>> 24) & 255;
    const nx = n[0] * 127,
      ny = n[1] * 127,
      nz = n[2] * 127;
    pos[d] = plane;
    for (let o = 0; o < 6; o++) {
      const k = order[o];
      pos[u] = cu[k];
      pos[v] = cv[k];
      const b4 = base >> 2;
      f32[b4] = ox + pos[0] * s;
      f32[b4 + 1] = oy + pos[1] * s;
      f32[b4 + 2] = oz + pos[2] * s;
      i8[base + 12] = nx;
      i8[base + 13] = ny;
      i8[base + 14] = nz;
      u8[base + 16] = r;
      u8[base + 17] = g;
      u8[base + 18] = bl;
      u8[base + 19] = aoAt[k] * 85;
      u8[base + 20] = mat;
      base += STRIDE;
    }
  }
  return { data: buf, count: quadCount * 6 };
}

/**
 * A slice of a {@link partitionMesh} mesh: one band of the level along x, with its
 * own bounding box so the renderer can skip bands that are off screen.
 * Quads are stored as [camera-only][camera + sun][sun-only], so each pass draws
 * one contiguous range.
 * @typedef {Object} MeshPart
 * @property {number} first First index.
 * @property {number} count Indices seen by the camera (from `first`).
 * @property {number} shadowFirst First index the sun's depth pass needs.
 * @property {number} shadowCount
 * @property {number} total Every index of the part (from `first`).
 * @property {Float32Array} box Centre x, y, z then half extents x, y, z.
 */

/**
 * Reorders a voxel mesh ({@link meshVolume} output: 6 vertices per axis-aligned
 * quad) into bands of `band` world units along x, for culling, and drops faces a
 * pass can never use:
 * - the camera always looks from +z, so faces pointing to -z (always behind the
 *   front of their own solid) are left out of the camera pass;
 * - the shadow map keeps the nearest surface to the sun, which for closed voxel
 *   solids is always a face turned towards the sun, so faces turned away from it
 *   are left out of the depth pass.
 * Within each band the camera's quads facing +z come first, front to back, so
 * nearer surfaces fill the depth buffer before the ones they hide.
 * Quads longer than a band (long floors, walls) share one extra part.
 * @param {{data: ArrayBuffer, count: number}} geo
 * @param {number} band
 * @param {ArrayLike<number> | null} [sun] Direction the sunlight travels; null when the mesh casts no shadow.
 * @returns {{data: ArrayBuffer, count: number, index: Uint16Array | Uint32Array, vertices: number, parts: MeshPart[], sun: number[] | null}}
 *   Indexed (see {@link indexVertices}); part ranges count indices.
 */
export function partitionMesh(geo, band, sun = null) {
  const QV = 6;
  const QB = QV * STRIDE;
  const quads = Math.floor(geo.count / QV);
  const src = new Uint8Array(geo.data, 0, quads * QB);
  const f32 = new Float32Array(geo.data, 0, (quads * QB) >> 2);
  const i8 = new Int8Array(geo.data, 0, quads * QB);
  // Per quad: band (or the spanning part), pass group, and depth for sorting.
  let x0 = Infinity,
    x1 = -Infinity;
  for (let v = 0; v < quads * QV; v++) {
    const x = f32[(v * STRIDE) >> 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  const bands = Number.isFinite(x0) ? Math.max(1, Math.ceil((x1 - x0) / band)) : 1;
  const span = bands; // index of the spanning part
  const bandOf = new Int32Array(quads);
  const group = new Int8Array(quads);
  const depth = new Float32Array(quads);
  const sx = sun ? sun[0] : 0,
    sy = sun ? sun[1] : 0,
    sz = sun ? sun[2] : 0;
  for (let q = 0; q < quads; q++) {
    const b = q * QB;
    let mn = Infinity,
      mx = -Infinity;
    for (let k = 0; k < QV; k++) {
      const x = f32[(b + k * STRIDE) >> 2];
      if (x < mn) mn = x;
      if (x > mx) mx = x;
    }
    bandOf[q] =
      mx - mn > band ? span : Math.min(bands - 1, Math.floor(((mn + mx) / 2 - x0) / band));
    const nx = i8[b + 12],
      ny = i8[b + 13],
      nz = i8[b + 14];
    const camera = nz >= 0;
    // Without a sun direction every face stays available to a depth pass.
    const lit = !sun || nx * sx + ny * sy + nz * sz <= 0;
    // 0: camera only, 1: camera and sun, 2: sun only, 3: neither (dropped).
    group[q] = camera ? (lit ? 1 : 0) : lit ? 2 : 3;
    depth[q] = nz > 0 ? -f32[(b + 8) >> 2] : Infinity;
  }
  /** @type {number[][]} */
  const order = [];
  for (let p = 0; p <= span; p++) order.push([]);
  for (let q = 0; q < quads; q++) if (group[q] !== 3) order[bandOf[q]].push(q);
  const kept = order.reduce((n, o) => n + o.length, 0);
  const data = new ArrayBuffer(kept * QB);
  const dst = new Uint8Array(data);
  const out = new Float32Array(data);
  /** @type {MeshPart[]} */
  const parts = [];
  let w = 0;
  for (const list of order) {
    if (!list.length) continue;
    // Stable sort: group first; within a group, +z faces front to back, then the rest as built.
    list.sort((a, b) => group[a] - group[b] || depth[a] - depth[b] || a - b);
    const first = w * QV;
    let camEnd = first,
      sunStart = -1;
    for (const q of list) {
      dst.set(src.subarray(q * QB, q * QB + QB), w * QB);
      w++;
      if (group[q] <= 1) camEnd = w * QV;
      if (group[q] >= 1 && sunStart < 0) sunStart = (w - 1) * QV;
    }
    const end = w * QV;
    let lo0 = Infinity,
      lo1 = Infinity,
      lo2 = Infinity,
      hi0 = -Infinity,
      hi1 = -Infinity,
      hi2 = -Infinity;
    for (let v = first; v < end; v++) {
      const o = (v * STRIDE) >> 2;
      const a = out[o],
        b = out[o + 1],
        c = out[o + 2];
      if (a < lo0) lo0 = a;
      if (a > hi0) hi0 = a;
      if (b < lo1) lo1 = b;
      if (b > hi1) hi1 = b;
      if (c < lo2) lo2 = c;
      if (c > hi2) hi2 = c;
    }
    parts.push({
      first,
      count: camEnd - first,
      shadowFirst: sunStart < 0 ? end : sunStart,
      shadowCount: sunStart < 0 ? 0 : end - sunStart,
      total: end - first,
      box: new Float32Array([
        (lo0 + hi0) / 2,
        (lo1 + hi1) / 2,
        (lo2 + hi2) / 2,
        (hi0 - lo0) / 2,
        (hi1 - lo1) / 2,
        (hi2 - lo2) / 2,
      ]),
    });
  }
  return { ...indexVertices({ data, count: kept * QV }), parts, sun: sun ? [sx, sy, sz] : null };
}

/**
 * Merges identical vertices (every byte equal) and returns an index list, so the
 * GPU shades each shared corner once instead of once per triangle. Triangles,
 * their order and their attributes are unchanged.
 * @param {{data: ArrayBuffer, count: number}} geo Unindexed vertices.
 * @returns {{data: ArrayBuffer, count: number, index: Uint16Array | Uint32Array, vertices: number}}
 *   `count` is the number of indices (the old vertex count).
 */
export function indexVertices(geo) {
  const n = geo.count;
  const W = STRIDE / 4;
  const src = new Uint32Array(geo.data, 0, n * W);
  let size = 16;
  while (size < n * 2) size <<= 1;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const index = new Uint32Array(n);
  const out = new Uint32Array(n * W);
  let u = 0;
  for (let v = 0; v < n; v++) {
    const o = v * W;
    const a = src[o],
      b = src[o + 1],
      c = src[o + 2],
      d = src[o + 3],
      e = src[o + 4],
      f = src[o + 5];
    let h = 0x811c9dc5;
    h = Math.imul(h ^ a, 16777619);
    h = Math.imul(h ^ b, 16777619);
    h = Math.imul(h ^ c, 16777619);
    h = Math.imul(h ^ d, 16777619);
    h = Math.imul(h ^ e, 16777619);
    h = Math.imul(h ^ f, 16777619);
    let slot = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const hit = table[slot];
      if (hit < 0) {
        table[slot] = u;
        const w = u * W;
        out[w] = a;
        out[w + 1] = b;
        out[w + 2] = c;
        out[w + 3] = d;
        out[w + 4] = e;
        out[w + 5] = f;
        index[v] = u++;
        break;
      }
      const w = hit * W;
      if (
        out[w] === a &&
        out[w + 1] === b &&
        out[w + 2] === c &&
        out[w + 3] === d &&
        out[w + 4] === e &&
        out[w + 5] === f
      ) {
        index[v] = hit;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }
  return {
    data: out.slice(0, u * W).buffer,
    count: n,
    index: u <= 65536 ? Uint16Array.from(index) : index,
    vertices: u,
  };
}
