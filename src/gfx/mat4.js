/**
 * Minimal column-major 4×4 matrix helpers (WebGL convention).
 * Every helper returns a fresh matrix unless an `out` matrix is passed, so
 * hot paths can reuse their own storage and stay allocation-free.
 * @typedef {Float32Array} Mat4
 */

/**
 * @param {Mat4} [out]
 * @returns {Mat4}
 */
export function identity(out) {
  const m = out ?? new Float32Array(16);
  if (out) m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/**
 * a·b. `out` may alias `a` or `b`.
 * @param {Mat4} a
 * @param {Mat4} b
 * @param {Mat4} [out]
 * @returns {Mat4}
 */
export function multiply(a, b, out) {
  const o = out ?? new Float32Array(16);
  const a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3];
  const a4 = a[4],
    a5 = a[5],
    a6 = a[6],
    a7 = a[7];
  const a8 = a[8],
    a9 = a[9],
    a10 = a[10],
    a11 = a[11];
  const a12 = a[12],
    a13 = a[13],
    a14 = a[14],
    a15 = a[15];
  for (let c = 0; c < 16; c += 4) {
    const b0 = b[c],
      b1 = b[c + 1],
      b2 = b[c + 2],
      b3 = b[c + 3];
    // Same summation order as the reference loop (k = 0..3), so results are bit-identical.
    o[c] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3;
    o[c + 1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3;
    o[c + 2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3;
    o[c + 3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3;
  }
  return o;
}

/**
 * @param {number} fovy Radians.
 * @param {number} aspect
 * @param {number} near
 * @param {number} far
 * @param {Mat4} [out]
 */
export function perspective(fovy, aspect, near, far, out) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = out ? out.fill(0) : new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/**
 * @param {number} l @param {number} r @param {number} b @param {number} t @param {number} n @param {number} f
 * @param {Mat4} [out]
 */
export function ortho(l, r, b, t, n, f, out) {
  const m = out ? out.fill(0) : new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

const UP = [0, 1, 0];

/**
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} target
 * @param {ArrayLike<number>} [up]
 * @param {Mat4} [out]
 */
export function lookAt(eye, target, up = UP, out) {
  let zx = eye[0] - target[0],
    zy = eye[1] - target[1],
    zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l;
  zy /= l;
  zz /= l;
  let xx = up[1] * zz - up[2] * zy,
    xy = up[2] * zx - up[0] * zz,
    xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l;
  xy /= l;
  xz /= l;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  const m = out ?? new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[3] = 0;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[7] = 0;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

/**
 * @param {number} x @param {number} y @param {number} z
 * @param {Mat4} [out]
 */
export function translation(x, y, z, out) {
  const m = identity(out);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/**
 * @param {number} sx @param {number} sy @param {number} sz
 * @param {Mat4} [out]
 */
export function scaling(sx, sy, sz, out) {
  const m = identity(out);
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

/**
 * @param {number} a
 * @param {Mat4} [out]
 */
export function rotationX(a, out) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const m = identity(out);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

/**
 * @param {number} a
 * @param {Mat4} [out]
 */
export function rotationY(a, out) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const m = identity(out);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/**
 * @param {number} a
 * @param {Mat4} [out]
 */
export function rotationZ(a, out) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const m = identity(out);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Ping-pong scratch matrices for chain's intermediate products. */
const SCRATCH_A = new Float32Array(16);
const SCRATCH_B = new Float32Array(16);

/**
 * Chain of transforms applied right-to-left: chain(A, B, C) = A·B·C.
 * Only the result is allocated; intermediate products use scratch storage.
 * @param {...Mat4} ms
 */
export function chain(...ms) {
  const n = ms.length;
  if (n === 0) throw new TypeError('chain: no matrices');
  if (n === 1) return ms[0];
  let acc = ms[0];
  for (let i = 1; i < n - 1; i++) acc = multiply(acc, ms[i], i & 1 ? SCRATCH_A : SCRATCH_B);
  return multiply(acc, ms[n - 1]);
}

/**
 * Projects a world point to normalised device coordinates.
 * @param {Mat4} m
 * @param {number} x @param {number} y @param {number} z
 */
export function project(m, x, y, z) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: cx / cw, y: cy / cw };
}
