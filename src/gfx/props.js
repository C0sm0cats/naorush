import { MeshBuilder } from './geometry.js';
import { Mesh } from './renderer.js';
import { MAT, rgb } from './voxels.js';

/**
 * Smooth "designer toy" props (office, server room, rooftop) built from rounded
 * primitives. Units are tiles; each mesh has its origin at the bottom centre
 * (except `kpi`, centred) and faces +z, towards the camera.
 */

const { MATTE, EMISSIVE, GLOSSY } = MAT;
const TAU = Math.PI * 2;

const LIME = '#c6f432';
const NAVY = '#1f2a44';
const PINK = '#ff4f9a';
const WHITE = '#f3f5f7';
const ALU = '#c3cad3';
const CHROME = '#e2e7ec';
const GRAPHITE = '#2b2f36';
const BLACK = '#1b1d22';

// ---------------------------------------------------------------------------
// 3x3 rotation helpers (row-major) and builder utilities.

/** @param {number} a @returns {number[]} */
const rotX = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
/** @param {number} a @returns {number[]} */
const rotY = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
/** @param {number} a @returns {number[]} */
const rotZ = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
/** @param {number[]} a @param {number[]} b @returns {number[]} */
const mul = (a, b) => {
  const r = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r;
};
/**
 * Rotation taking +y onto the unit vector `d`.
 * @param {number[]} d
 * @returns {number[]}
 */
const alignY = ([x, y, z]) => {
  if (y < -0.9999) return rotX(Math.PI);
  const k = 1 / (1 + y);
  const vx = z,
    vz = -x;
  return [
    1 - k * vz * vz,
    -vz,
    k * vx * vz,
    vz,
    1 - k * (vx * vx + vz * vz),
    -vx,
    k * vx * vz,
    vx,
    1 - k * vx * vx,
  ];
};

/** @param {MeshBuilder} b */
const mark = (b) => b.mat.length;

/**
 * Rotates then translates every vertex added since `start`.
 * @param {MeshBuilder} b @param {number} start @param {number[]} m @param {number[]} [t]
 */
function place(b, start, m, t = [0, 0, 0]) {
  const P = b.pos,
    N = b.nrm;
  for (let i = start * 3; i < P.length; i += 3) {
    const x = P[i],
      y = P[i + 1],
      z = P[i + 2];
    P[i] = m[0] * x + m[1] * y + m[2] * z + t[0];
    P[i + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
    P[i + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
    const a = N[i],
      c = N[i + 1],
      d = N[i + 2];
    N[i] = m[0] * a + m[1] * c + m[2] * d;
    N[i + 1] = m[3] * a + m[4] * c + m[5] * d;
    N[i + 2] = m[6] * a + m[7] * c + m[8] * d;
  }
}

/** @param {MeshBuilder} b @param {number} start */
function flipNormals(b, start) {
  for (let i = start * 3; i < b.nrm.length; i++) b.nrm[i] = -b.nrm[i];
}

/**
 * Sharp-edged box (12 triangles) for small details: LEDs, screens, bars.
 * @param {MeshBuilder} b @param {number[]} c @param {number[]} h @param {string} color
 * @param {number} [mat]
 */
function flatBox(b, c, h, color, mat = MATTE) {
  const col = rgb(color);
  for (let axis = 0; axis < 3; axis++)
    for (const s of [-1, 1]) {
      const a1 = (axis + 1) % 3,
        a2 = (axis + 2) % 3;
      b.grid(
        1,
        1,
        (u, v) => {
          const p = [0, 0, 0];
          p[axis] = s * h[axis];
          p[a1] = (u * 2 - 1) * h[a1];
          p[a2] = (v * 2 - 1) * h[a2];
          const n = [0, 0, 0];
          n[axis] = s;
          return { p: p.map((x, i) => x + c[i]), n };
        },
        col,
        mat,
      );
    }
}

/**
 * Parametric surface with numerical normals oriented towards `up`.
 * @param {MeshBuilder} b @param {number} nu @param {number} nv
 * @param {(u: number, v: number) => number[]} f @param {string} color @param {number} mat
 * @param {number[]} [up]
 */
function surf(b, nu, nv, f, color, mat, up = [0, 1, 0]) {
  const e = 1e-3;
  /** @param {number} x */
  const cl = (x) => Math.max(0, Math.min(1, x));
  b.grid(
    nu,
    nv,
    (u, v) => {
      const p = f(u, v);
      const pu0 = f(cl(u - e), v),
        pu1 = f(cl(u + e), v),
        pv0 = f(u, cl(v - e)),
        pv1 = f(u, cl(v + e));
      const du = pu1.map((x, i) => x - pu0[i]);
      const dv = pv1.map((x, i) => x - pv0[i]);
      let n = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0],
      ];
      const len = Math.hypot(...n);
      n = len < 1e-12 ? up : n.map((x) => x / len);
      if (n[0] * up[0] + n[1] * up[1] + n[2] * up[2] < 0) n = n.map((x) => -x);
      return { p, n };
    },
    rgb(color),
    mat,
  );
}

/**
 * Cylinder (with caps) standing on `c`.
 * @param {MeshBuilder} b @param {number[]} c @param {number} r @param {number} h
 * @param {string} color @param {{mat?: number, seg?: number, scaleZ?: number}} [o]
 */
function cyl(b, c, r, h, color, o = {}) {
  b.lathe(
    c,
    [
      [0, 0],
      [r, 0],
      [r, h],
      [0, h],
    ],
    color,
    { seg: 24, ...o },
  );
}

/**
 * Thin tube from `a` to `c`.
 * @param {MeshBuilder} b @param {number[]} a @param {number[]} c @param {number} r
 * @param {string} color @param {{mat?: number, seg?: number}} [o]
 */
function rod(b, a, c, r, color, o = {}) {
  const d = c.map((x, i) => x - a[i]);
  const len = Math.hypot(...d);
  const s = mark(b);
  b.lathe(
    [0, 0, 0],
    [
      [0, 0],
      [r, 0],
      [r, len],
      [0, len],
    ],
    color,
    { seg: o.seg ?? 10, mat: o.mat },
  );
  place(b, s, alignY(d.map((x) => x / len)), a);
}

/**
 * Torus-like ring lying flat (axis y), built as a lathe of a small circle.
 * @param {MeshBuilder} b @param {number[]} c @param {number} R @param {number} r
 * @param {string} color @param {{mat?: number, seg?: number, sides?: number}} [o]
 */
function ring(b, c, R, r, color, o = {}) {
  /** @type {number[][]} */
  const prof = [];
  const n = o.sides ?? 8;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    prof.push([R + Math.cos(a) * r, Math.sin(a) * r]);
  }
  b.lathe(c, prof, color, { seg: o.seg ?? 32, mat: o.mat });
}

/** Deterministic PRNG (mulberry32). @param {number} seed */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Leaf surface in local space: base at origin, growing along +z, face up.
 * @param {MeshBuilder} b @param {number} L @param {number} W @param {number} droop
 * @param {string} color @param {number[]} m @param {number[]} t
 */
function leaf(b, L, W, droop, color, m, t) {
  const s = mark(b);
  surf(
    b,
    10,
    6,
    (u, v) => {
      const k = v * 2 - 1;
      const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.8);
      return [k * w, -droop * u * u - 0.35 * k * k * w, u * L];
    },
    color,
    GLOSSY,
  );
  place(b, s, m, t);
}

/**
 * Compact city car facing +x; its flat roof is a platform at y = 1.35.
 * @param {MeshBuilder} b @param {string} paint
 */
function car(b, paint) {
  const GLASS = '#1c2633';
  // Lower body and cabin; the cabin top stays flat to stand on.
  b.roundedBox([0, 0.55, 0], [1.8, 0.3, 0.85], 0.22, paint, { mat: GLOSSY, seg: 7 });
  b.roundedBox([-0.12, 1.07, 0], [1.12, 0.28, 0.76], 0.16, paint, { mat: GLOSSY, seg: 7 });
  // Windows: windscreen, rear screen and two side windows each side.
  flatBox(b, [0.99, 1.08, 0], [0.012, 0.19, 0.64], GLASS, GLOSSY);
  flatBox(b, [-1.23, 1.08, 0], [0.012, 0.19, 0.62], GLASS, GLOSSY);
  for (const z of [-0.765, 0.765])
    for (const x of [-0.62, 0.42]) flatBox(b, [x, 1.09, z], [0.44, 0.17, 0.006], GLASS, GLOSSY);
  // Door seam, handles, mirrors.
  for (const z of [-0.852, 0.852]) {
    flatBox(b, [-0.12, 0.55, z], [0.008, 0.22, 0.002], '#2a3038');
    flatBox(b, [0.15, 0.68, z], [0.08, 0.015, 0.004], CHROME, GLOSSY);
    b.roundedBox([0.85, 0.92, z * 0.98], [0.06, 0.05, 0.05], 0.03, paint, { mat: GLOSSY, seg: 3 });
  }
  // Bumpers.
  for (const x of [-1.72, 1.72])
    b.roundedBox([x, 0.35, 0], [0.09, 0.09, 0.8], 0.06, '#3a3f48', { mat: GLOSSY, seg: 4 });
  flatBox(b, [1.805, 0.47, 0], [0.004, 0.05, 0.25], '#20242c');
  // Lights.
  for (const z of [-0.58, 0.58]) {
    b.ellipsoid([1.74, 0.64, z], [0.07, 0.07, 0.13], '#fff6cf', { mat: EMISSIVE, seg: 8 });
    b.ellipsoid([-1.75, 0.66, z], [0.06, 0.06, 0.12], '#ff3040', { mat: EMISSIVE, seg: 8 });
  }
  // Wheels: tyre, rim and hub, rolled to face the sides.
  for (const x of [-1.15, 1.15])
    for (const side of [-1, 1]) {
      const s = mark(b);
      b.lathe(
        [0, 0, 0],
        [
          [0, 0],
          [0.2, 0],
          [0.26, 0.02],
          [0.28, 0.1],
          [0.26, 0.18],
          [0.2, 0.2],
          [0, 0.2],
        ],
        BLACK,
        { seg: 24 },
      );
      b.lathe(
        [0, 0.2, 0],
        [
          [0.17, 0],
          [0.15, 0.012],
          [0.05, 0.02],
          [0, 0.03],
        ],
        CHROME,
        { mat: GLOSSY, seg: 20 },
      );
      place(b, s, side > 0 ? rotX(Math.PI / 2) : rotX(-Math.PI / 2), [x, 0.28, side * 0.62]);
    }
}

/**
 * Stage spotlight on a yoke, base at the origin, beam towards +z and slightly up.
 * @param {MeshBuilder} b
 */
function spot(b) {
  b.roundedBox([0, 0.02, 0], [0.12, 0.02, 0.1], 0.015, BLACK, { mat: GLOSSY, seg: 3 });
  cyl(b, [0, 0.04, 0], 0.03, 0.03, GRAPHITE, { mat: GLOSSY, seg: 12 });
  b.roundedBox([0, 0.075, 0], [0.15, 0.012, 0.025], 0.01, GRAPHITE, { mat: GLOSSY, seg: 3 });
  for (const x of [-0.145, 0.145])
    b.roundedBox([x, 0.165, 0], [0.012, 0.1, 0.025], 0.01, GRAPHITE, { mat: GLOSSY, seg: 3 });
  const s = mark(b);
  b.lathe(
    [0, 0, 0],
    [
      [0, -0.16],
      [0.07, -0.16],
      [0.1, -0.12],
      [0.11, 0.1],
      [0.12, 0.13],
      [0.12, 0.15],
      [0.1, 0.15],
    ],
    BLACK,
    { mat: GLOSSY, seg: 24 },
  );
  b.lathe(
    [0, 0, 0],
    [
      [0.1, 0.14],
      [0.06, 0.15],
      [0, 0.152],
    ],
    '#fff2c4',
    { mat: EMISSIVE, seg: 24 },
  );
  ring(b, [0, 0.0, 0], 0.112, 0.008, LIME, { seg: 24, sides: 4 });
  place(b, s, rotX(Math.PI / 2 - 0.3), [0, 0.24, 0]);
  for (const x of [-0.14, 0.14])
    b.ellipsoid([x * 1.07, 0.24, 0], [0.02, 0.03, 0.03], CHROME, { mat: GLOSSY, seg: 6 });
}

/**
 * 3×5 pixel glyphs drawn as small blocks on the +z face.
 * @param {MeshBuilder} b @param {string[]} rows @param {number[]} o top-left corner
 * @param {number} px @param {string} color
 */
function glyph(b, rows, o, px, color) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++)
      if (row[i] === '1')
        flatBox(
          b,
          [o[0] + (i + 0.5) * px, o[1] - (j + 0.5) * px, o[2]],
          [px / 2, px / 2, 0.003],
          color,
        );
  });
}

// ---------------------------------------------------------------------------
// Props.

/**
 * @typedef {'plant'|'plantSmall'|'cooler'|'printer'|'coffee'|'chair'|'rack'|'hvac'|'antenna'|'parasol'|'bistro'|'speaker'|'lampPost'|'monitor'|'kpi'|'wave'|'lift'|'gate'|'carBlue'|'carRed'|'carWhite'|'barrier'|'pillarSign'|'drawer'|'sprinkler'|'spray'|'paper'|'binders'|'vacuum'|'laptopStand'|'invite'|'cup'|'archive'|'copilTable'|'projector'|'truss'|'spotlight'|'curtain'|'shadow'|'warn'|'arrow'|'rackFall'|'confetti'} PropId
 */

/** @type {Record<PropId, (b: MeshBuilder) => void>} */
const BUILDERS = {
  plant(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.15, 0],
        [0.165, 0.02],
        [0.2, 0.3],
        [0.215, 0.31],
        [0.215, 0.345],
        [0.2, 0.352],
        [0.19, 0.336],
      ],
      '#f2efe9',
      { mat: GLOSSY, seg: 32 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.199, 0.262],
        [0.2018, 0.284],
      ],
      LIME,
      { seg: 32 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.19, 0.33],
        [0, 0.33],
      ],
      '#4a3324',
      { seg: 24 },
    );
    const n = 22;
    const greens = ['#3b9a4c', '#55b85c', '#2f7f3f'];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = i * 2.39996;
      const rs = 0.05 + 0.05 * (1 - t);
      const base = [Math.sin(ang) * rs, 0.5 + t * 0.62, Math.cos(ang) * rs];
      rod(b, [0, 0.32, 0], base, 0.011, '#4f7d39', { seg: 8 });
      const pitch = -(0.15 + t * 0.85);
      leaf(b, 0.26 - t * 0.05, 0.11, 0.07, greens[i % 3], mul(rotY(ang), rotX(pitch)), base);
    }
  },

  plantSmall(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.07, 0],
        [0.08, 0.01],
        [0.095, 0.13],
        [0.1, 0.14],
        [0.1, 0.15],
        [0.09, 0.15],
      ],
      NAVY,
      { mat: GLOSSY, seg: 32 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.0985, 0.115],
        [0.1, 0.128],
      ],
      LIME,
      { seg: 32 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.09, 0.145],
        [0, 0.145],
      ],
      '#7a5a3c',
      { seg: 24 },
    );
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = i * 2.39996;
      const tilt = 1.15 - t * 0.85;
      const len = 0.11 - t * 0.03;
      const s = mark(b);
      b.ellipsoid([0, len, 0], [0.026, len, 0.014], i % 2 ? '#7fbf8a' : '#93cf9a', {
        mat: GLOSSY,
        seg: 8,
      });
      place(b, s, mul(rotY(ang), rotX(tilt)), [0, 0.15, 0]);
    }
  },

  cooler(b) {
    b.roundedBox([0, 0.45, 0], [0.19, 0.45, 0.18], 0.05, '#eef1f5', { mat: GLOSSY, seg: 5 });
    b.roundedBox([0, 0.72, 0.165], [0.13, 0.11, 0.02], 0.02, '#c9d3dd', { seg: 4 });
    b.roundedBox([-0.06, 0.77, 0.2], [0.022, 0.028, 0.025], 0.014, '#3b8be8', { mat: GLOSSY });
    b.roundedBox([0.06, 0.77, 0.2], [0.022, 0.028, 0.025], 0.014, '#ff5a5a', { mat: GLOSSY });
    cyl(b, [-0.06, 0.72, 0.21], 0.008, 0.03, CHROME, { mat: GLOSSY, seg: 10 });
    cyl(b, [0.06, 0.72, 0.21], 0.008, 0.03, CHROME, { mat: GLOSSY, seg: 10 });
    b.roundedBox([0, 0.62, 0.2], [0.11, 0.012, 0.045], 0.01, '#9aa6b2', { mat: GLOSSY });
    for (let i = 0; i < 4; i++)
      flatBox(b, [0, 0.1 + i * 0.035, 0.181], [0.11, 0.007, 0.004], '#b7c1cc');
    flatBox(b, [0.12, 0.84, 0.181], [0.012, 0.012, 0.003], '#59ff8a', EMISSIVE);
    b.lathe(
      [0, 0.9, 0],
      [
        [0.13, -0.01],
        [0.135, 0.03],
        [0, 0.03],
      ],
      '#d4dbe2',
      { seg: 32 },
    );
    b.lathe(
      [0, 0.9, 0],
      [
        [0.04, 0],
        [0.04, 0.05],
        [0.1, 0.075],
        [0.142, 0.11],
        [0.15, 0.14],
        [0.15, 0.2],
        [0.142, 0.21],
        [0.15, 0.22],
        [0.15, 0.29],
        [0.142, 0.3],
        [0.15, 0.31],
        [0.15, 0.355],
        [0.13, 0.385],
        [0.08, 0.398],
        [0, 0.4],
      ],
      '#5fb0ee',
      { mat: GLOSSY, seg: 32 },
    );
  },

  printer(b) {
    b.roundedBox([0, 0.41, 0], [0.6, 0.41, 0.35], 0.05, '#dadee4', { mat: GLOSSY, seg: 5 });
    for (const y of [0.14, 0.38]) {
      b.roundedBox([0, y, 0.345], [0.54, 0.1, 0.015], 0.012, '#c8cdd4', { seg: 4 });
      flatBox(b, [0, y + 0.06, 0.362], [0.16, 0.012, 0.004], '#5a6372');
    }
    flatBox(b, [-0.42, 0.03, 0.352], [0.12, 0.012, 0.004], LIME);
    // Output slot and paper.
    flatBox(b, [-0.12, 0.66, 0.3], [0.36, 0.04, 0.06], '#3a4150');
    b.roundedBox([-0.12, 0.645, 0.38], [0.3, 0.008, 0.08], 0.006, '#b9c0c9', {
      mat: GLOSSY,
      seg: 3,
    });
    flatBox(b, [-0.12, 0.658, 0.37], [0.21, 0.004, 0.07], '#ffffff');
    // Dark scanner top with lid.
    b.roundedBox([0, 0.88, -0.01], [0.59, 0.07, 0.34], 0.04, '#3a4150', { mat: GLOSSY, seg: 5 });
    b.roundedBox([0, 0.96, -0.02], [0.55, 0.02, 0.3], 0.02, '#2a303c', { mat: GLOSSY, seg: 4 });
    // Tilted control panel on the right.
    const s = mark(b);
    b.roundedBox([0, 0, 0], [0.18, 0.025, 0.09], 0.02, '#2a303c', { mat: GLOSSY, seg: 4 });
    flatBox(b, [-0.04, 0.026, 0], [0.1, 0.002, 0.06], '#69c3ff', EMISSIVE);
    flatBox(b, [-0.06, 0.029, 0.03], [0.06, 0.001, 0.01], '#e6f5ff', EMISSIVE);
    flatBox(b, [-0.04, 0.029, -0.01], [0.08, 0.001, 0.006], '#a8dcff', EMISSIVE);
    flatBox(b, [0.12, 0.028, 0.04], [0.012, 0.003, 0.012], '#3dff6e', EMISSIVE);
    b.ellipsoid([0.12, 0.028, -0.02], [0.02, 0.008, 0.02], LIME, { mat: GLOSSY, seg: 8 });
    place(b, s, rotX(0.55), [0.36, 0.8, 0.36]);
  },

  coffee(b) {
    // Cabinet.
    b.roundedBox([0, 0.4, 0], [0.3, 0.4, 0.25], 0.03, '#d2ae84', { seg: 4 });
    flatBox(b, [0, 0.4, 0.251], [0.002, 0.34, 0.003], '#a7835c');
    for (const x of [-0.05, 0.05])
      flatBox(b, [x, 0.52, 0.255], [0.006, 0.05, 0.006], CHROME, GLOSSY);
    b.roundedBox([0, 0.815, 0], [0.31, 0.015, 0.26], 0.012, '#f2f2f0', { mat: GLOSSY, seg: 3 });
    // Machine.
    b.roundedBox([0, 1.06, -0.02], [0.21, 0.24, 0.19], 0.06, '#24272d', { mat: GLOSSY, seg: 6 });
    b.roundedBox([0, 0.97, 0.12], [0.14, 0.12, 0.06], 0.03, '#15171b', { seg: 4 });
    // Spout and drip grate.
    b.roundedBox([0, 1.08, 0.16], [0.06, 0.02, 0.04], 0.015, CHROME, { mat: GLOSSY, seg: 4 });
    for (const x of [-0.02, 0.02])
      b.lathe(
        [x, 1.02, 0.17],
        [
          [0.006, 0],
          [0.012, 0.045],
          [0.0, 0.045],
        ],
        CHROME,
        { mat: GLOSSY, seg: 16 },
      );
    b.roundedBox([0, 0.85, 0.13], [0.12, 0.012, 0.07], 0.01, CHROME, { mat: GLOSSY, seg: 3 });
    b.lathe(
      [0, 0.862, 0.15],
      [
        [0, 0],
        [0.028, 0],
        [0.034, 0.06],
        [0.03, 0.06],
        [0, 0.05],
      ],
      WHITE,
      { mat: GLOSSY, seg: 24 },
    );
    // Screen and buttons.
    flatBox(b, [0, 1.2, 0.171], [0.1, 0.045, 0.003], '#0d1220');
    flatBox(b, [0, 1.205, 0.175], [0.085, 0.032, 0.002], '#6fd0ff', EMISSIVE);
    flatBox(b, [-0.03, 1.215, 0.178], [0.045, 0.006, 0.001], '#e8f7ff', EMISSIVE);
    for (let i = 0; i < 3; i++)
      b.ellipsoid([-0.06 + i * 0.06, 1.13, 0.17], [0.014, 0.014, 0.008], i === 1 ? LIME : CHROME, {
        mat: GLOSSY,
        seg: 8,
      });
    // Bean hopper.
    b.lathe(
      [0, 1.3, -0.06],
      [
        [0.07, -0.01],
        [0.09, 0.0],
        [0.1, 0.04],
        [0.09, 0.05],
        [0, 0.05],
      ],
      '#3b2a20',
      { mat: GLOSSY, seg: 24 },
    );
  },

  chair(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0.08],
        [0.06, 0.08],
        [0.05, 0.13],
        [0, 0.13],
      ],
      GRAPHITE,
      { mat: GLOSSY, seg: 24 },
    );
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      const tip = [Math.sin(a) * 0.27, 0.07, Math.cos(a) * 0.27];
      const s = mark(b);
      b.roundedBox([0, 0, 0.14], [0.022, 0.018, 0.14], 0.016, GRAPHITE, { mat: GLOSSY, seg: 4 });
      place(b, s, mul(rotY(a), rotX(0.08)), [0, 0.1, 0]);
      b.ellipsoid([tip[0], 0.035, tip[2]], [0.03, 0.035, 0.03], BLACK, { mat: GLOSSY, seg: 10 });
    }
    cyl(b, [0, 0.12, 0], 0.035, 0.16, GRAPHITE, { mat: GLOSSY });
    cyl(b, [0, 0.27, 0], 0.022, 0.15, CHROME, { mat: GLOSSY });
    b.roundedBox([0, 0.42, 0], [0.1, 0.025, 0.1], 0.02, BLACK, { seg: 4 });
    b.roundedBox([0, 0.48, 0.02], [0.25, 0.05, 0.24], 0.05, NAVY, { seg: 6 });
    // Back spine and cushion.
    b.roundedBox([0, 0.55, -0.2], [0.03, 0.12, 0.02], 0.018, GRAPHITE, { mat: GLOSSY, seg: 4 });
    const s = mark(b);
    b.roundedBox([0, 0, 0], [0.23, 0.24, 0.045], 0.045, NAVY, { seg: 6 });
    b.roundedBox([0, 0.2, 0.03], [0.12, 0.012, 0.02], 0.01, LIME, { seg: 3 });
    place(b, s, rotX(-0.12), [0, 0.84, -0.23]);
    // Armrests.
    for (const x of [-0.27, 0.27]) {
      b.roundedBox([x, 0.56, 0.0], [0.02, 0.07, 0.02], 0.015, GRAPHITE, { mat: GLOSSY, seg: 4 });
      b.roundedBox([x, 0.64, 0.02], [0.035, 0.018, 0.12], 0.016, BLACK, { seg: 4 });
    }
  },

  rack(b) {
    b.roundedBox([0, 1, 0], [0.5, 1, 0.5], 0.035, GRAPHITE, { mat: GLOSSY, seg: 4 });
    flatBox(b, [0, 1.9, 0.502], [0.45, 0.025, 0.004], LIME, GLOSSY);
    flatBox(b, [0.44, 1.0, 0.51], [0.012, 0.12, 0.01], '#8a929c', GLOSSY);
    const r = rng(7);
    const leds = ['#3dff7a', '#4fb8ff', '#ffb02e'];
    for (let u = 0; u < 13; u++) {
      const y = 0.22 + u * 0.12;
      flatBox(b, [-0.02, y, 0.503], [0.4, 0.052, 0.004], u % 4 === 3 ? '#232830' : '#3a3f48');
      if (u % 4 === 3) {
        for (let k = 0; k < 10; k++)
          flatBox(b, [-0.38 + k * 0.08, y, 0.509], [0.025, 0.006, 0.002], '#15181d');
        continue;
      }
      for (let k = 0; k < 8; k++)
        flatBox(b, [-0.36 + k * 0.075, y - 0.008, 0.509], [0.03, 0.03, 0.003], '#4b515c');
      for (let k = 0; k < 8; k++) {
        if (r() < 0.25) continue;
        const c = leds[r() < 0.6 ? 0 : r() < 0.6 ? 1 : 2];
        flatBox(
          b,
          [-0.36 + k * 0.075 + 0.018, y + 0.034, 0.509],
          [0.008, 0.006, 0.003],
          c,
          EMISSIVE,
        );
      }
    }
    // Bottom vent.
    for (let i = 0; i < 4; i++)
      flatBox(b, [0, 0.05 + i * 0.03, 0.503], [0.4, 0.007, 0.003], '#1a1d22');
  },

  hvac(b) {
    for (const z of [-0.45, 0.45])
      b.roundedBox([0, 0.035, z], [0.98, 0.035, 0.07], 0.02, '#5b6270', { seg: 3 });
    b.roundedBox([0, 0.49, 0], [1, 0.42, 0.6], 0.06, '#d5dae0', { mat: GLOSSY, seg: 5 });
    // Front: louvres on the right, access panel on the left.
    for (let i = 0; i < 9; i++) {
      const s = mark(b);
      b.roundedBox([0, 0, 0], [0.42, 0.012, 0.02], 0.01, '#aeb5be', { seg: 3 });
      place(b, s, rotX(0.5), [0.45, 0.22 + i * 0.065, 0.6]);
    }
    b.roundedBox([-0.48, 0.47, 0.6], [0.4, 0.3, 0.01], 0.01, '#c7cdd4', { seg: 3 });
    for (const y of [0.3, 0.64])
      b.roundedBox([-0.18, y, 0.62], [0.012, 0.04, 0.012], 0.01, '#5b6270', {
        mat: GLOSSY,
        seg: 3,
      });
    flatBox(b, [-0.48, 0.12, 0.603], [0.4, 0.015, 0.003], LIME);
    // Two top fans.
    for (const x of [-0.48, 0.48]) {
      b.lathe(
        [x, 0.9, 0],
        [
          [0.36, -0.02],
          [0.37, 0.06],
          [0.36, 0.08],
          [0.32, 0.08],
          [0.31, 0.02],
        ],
        '#b9c0c9',
        { mat: GLOSSY, seg: 32 },
      );
      cyl(b, [x, 0.9, 0], 0.32, 0.015, '#20242b', { seg: 32 });
      for (let k = 0; k < 5; k++) {
        const s = mark(b);
        b.ellipsoid([0, 0, 0.15], [0.06, 0.008, 0.13], '#7c8592', { mat: GLOSSY, seg: 6 });
        place(b, s, mul(rotY((k / 5) * TAU), rotZ(0.35)), [x, 0.95, 0]);
      }
      b.ellipsoid([x, 0.955, 0], [0.05, 0.03, 0.05], '#5b6270', { mat: GLOSSY, seg: 8 });
      for (const R of [0.12, 0.22, 0.31])
        ring(b, [x, 0.975, 0], R, 0.006, '#3e4550', { seg: 32, sides: 4 });
      rod(b, [x - 0.32, 0.975, 0], [x + 0.32, 0.975, 0], 0.007, '#3e4550', { seg: 6 });
      rod(b, [x, 0.975, -0.32], [x, 0.975, 0.32], 0.007, '#3e4550', { seg: 6 });
    }
  },

  antenna(b) {
    b.roundedBox([0, 0.03, 0], [0.22, 0.03, 0.22], 0.02, '#5b6270', { seg: 4 });
    cyl(b, [0, 0.06, 0], 0.06, 0.06, '#7c8592', { mat: GLOSSY });
    cyl(b, [0, 0.1, 0], 0.03, 2.15, ALU, { mat: GLOSSY, seg: 16 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      rod(b, [0, 0.6, 0], [Math.sin(a) * 0.2, 0.06, Math.cos(a) * 0.2], 0.01, ALU, { seg: 6 });
    }
    // Dish (concave side towards +z, tilted up).
    const s = mark(b);
    /** @type {number[][]} */
    const back = [];
    /** @type {number[][]} */
    const front = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * 0.3;
      back.push([r, (r * r) / 0.6]);
      front.push([r, (r * r) / 0.6 + 0.012]);
    }
    b.lathe([0, 0, 0], back, '#c9d0d8', { mat: GLOSSY, seg: 32 });
    const f = mark(b);
    b.lathe([0, 0, 0], front, '#eef1f4', { mat: GLOSSY, seg: 32 });
    flipNormals(b, f);
    ring(b, [0, 0.156, 0], 0.3, 0.008, '#c9d0d8', { seg: 32 });
    rod(b, [0, 0.012, 0], [0, 0.22, 0], 0.008, '#7c8592', { seg: 6 });
    b.ellipsoid([0, 0.24, 0], [0.025, 0.035, 0.025], '#3e4550', { mat: GLOSSY, seg: 10 });
    place(b, s, rotX(1.15), [0, 1.75, 0.07]);
    b.roundedBox([0, 1.75, 0.04], [0.05, 0.05, 0.04], 0.02, '#7c8592', { seg: 3 });
    // Beacon.
    cyl(b, [0, 2.25, 0], 0.035, 0.04, '#3e4550', { mat: GLOSSY });
    b.ellipsoid([0, 2.32, 0], [0.035, 0.05, 0.035], '#ff4040', { mat: EMISSIVE, seg: 12 });
  },

  parasol(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.26, 0],
        [0.27, 0.03],
        [0.24, 0.08],
        [0.06, 0.1],
        [0, 0.1],
      ],
      '#5b6270',
      { mat: GLOSSY, seg: 32 },
    );
    cyl(b, [0, 0.08, 0], 0.025, 2.06, WHITE, { mat: GLOSSY, seg: 16 });
    const panels = 8,
      R = 0.9,
      top = 2.12,
      drop = 0.32;
    for (let i = 0; i < panels; i++) {
      const a0 = (i / panels) * TAU,
        a1 = ((i + 1) / panels) * TAU;
      const color = i % 2 ? WHITE : LIME;
      /** @param {number} u @param {number} v */
      const canopy = (u, v) => {
        const a = a0 + (a1 - a0) * v;
        const sag = 1 - 0.06 * Math.sin(Math.PI * v) * u;
        const r = u * R * sag;
        return [Math.sin(a) * r, top - drop * Math.pow(u, 1.4), Math.cos(a) * r];
      };
      surf(b, 8, 6, canopy, color, MATTE);
      // Scalloped valance.
      surf(
        b,
        2,
        6,
        (u, v) => {
          const p = canopy(1, v);
          const h = 0.09 * (0.6 + 0.4 * Math.sin(Math.PI * v));
          return [p[0], p[1] - u * h, p[2]];
        },
        color,
        MATTE,
        [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)],
      );
      rod(
        b,
        [0, top - 0.02, 0],
        [Math.sin(a0) * R * 0.98, top - drop - 0.01, Math.cos(a0) * R * 0.98],
        0.008,
        '#d8dde3',
        {
          seg: 6,
        },
      );
    }
    b.ellipsoid([0, top + 0.04, 0], [0.04, 0.05, 0.04], LIME, { mat: GLOSSY, seg: 12 });
  },

  bistro(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.3, 0],
        [0.29, 0.06],
        [0.24, 0.2],
        [0.17, 0.36],
        [0.125, 0.5],
        [0.115, 0.58],
        [0.125, 0.66],
        [0.17, 0.8],
        [0.25, 0.94],
        [0.32, 1.03],
        [0.35, 1.075],
        [0.35, 1.09],
        [0.33, 1.1],
        [0, 1.1],
      ],
      WHITE,
      { seg: 40 },
    );
    ring(b, [0, 0.58, 0], 0.118, 0.018, LIME, { seg: 32 });
    for (const s of [-1, 1]) {
      const st = mark(b);
      b.ellipsoid([0, 0, 0.04], [0.035, 0.022, 0.05], LIME, { seg: 10 });
      place(b, st, rotY(s * 0.5), [s * 0.03, 0.585, 0.12]);
    }
    b.ellipsoid([0, 0.585, 0.135], [0.02, 0.02, 0.015], LIME, { seg: 8 });
  },

  speaker(b) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI;
      const foot = [Math.sin(a) * 0.24, 0.0, Math.cos(a) * 0.24];
      rod(b, [0, 0.75, 0], foot, 0.014, BLACK, { seg: 8 });
      b.ellipsoid([foot[0], 0.015, foot[2]], [0.025, 0.015, 0.025], '#3a3d44', { seg: 8 });
    }
    cyl(b, [0, 0.65, 0], 0.025, 0.6, '#30333a', { mat: GLOSSY, seg: 16 });
    cyl(b, [0, 0.66, 0], 0.035, 0.12, BLACK, { seg: 16 });
    cyl(b, [0, 1.18, 0], 0.016, 0.06, CHROME, { mat: GLOSSY, seg: 12 });
    b.roundedBox([0, 1.55, 0], [0.22, 0.33, 0.19], 0.05, BLACK, { mat: GLOSSY, seg: 5 });
    b.roundedBox([0, 1.5, 0.17], [0.19, 0.26, 0.03], 0.03, '#2b2e35', { seg: 4 });
    // Woofer + tweeter facing +z.
    const s = mark(b);
    b.lathe(
      [0, 0, 0],
      [
        [0.15, 0],
        [0.15, 0.012],
        [0.12, 0.02],
        [0.06, 0.0],
        [0.035, 0.012],
        [0, 0.02],
      ],
      '#3a3e47',
      { mat: GLOSSY, seg: 32 },
    );
    place(b, s, rotX(Math.PI / 2), [0, 1.42, 0.2]);
    const s2 = mark(b);
    b.lathe(
      [0, 0, 0],
      [
        [0.06, 0],
        [0.06, 0.012],
        [0.03, 0.008],
        [0, 0.018],
      ],
      '#3a3e47',
      { mat: GLOSSY, seg: 24 },
    );
    place(b, s2, rotX(Math.PI / 2), [0, 1.69, 0.2]);
    flatBox(b, [0, 1.82, 0.18], [0.04, 0.008, 0.004], LIME);
    flatBox(b, [0.16, 1.27, 0.2], [0.008, 0.008, 0.003], '#4fb8ff', EMISSIVE);
    b.roundedBox([0, 1.89, 0], [0.08, 0.012, 0.03], 0.012, '#30333a', { seg: 3 });
  },

  lampPost(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.075, 0],
        [0.075, 0.03],
        [0.04, 0.07],
        [0, 0.07],
      ],
      NAVY,
      { mat: GLOSSY, seg: 24 },
    );
    cyl(b, [0, 0.06, 0], 0.022, 2.36, NAVY, { mat: GLOSSY, seg: 16 });
    ring(b, [0, 2.3, 0], 0.03, 0.008, LIME, { seg: 16 });
    b.lathe(
      [0, 2.4, 0],
      [
        [0, 0],
        [0.03, 0],
        [0.035, 0.06],
        [0, 0.06],
      ],
      '#30333a',
      { mat: GLOSSY, seg: 16 },
    );
    b.ellipsoid([0, 2.52, 0], [0.06, 0.075, 0.06], '#ffd98a', { mat: EMISSIVE, seg: 16 });
  },

  monitor(b) {
    b.lathe(
      [0, 0, -0.03],
      [
        [0, 0],
        [0.12, 0],
        [0.115, 0.014],
        [0, 0.016],
      ],
      '#30343c',
      { mat: GLOSSY, seg: 32, scaleZ: 0.6 },
    );
    b.roundedBox([0, 0.14, -0.05], [0.03, 0.13, 0.012], 0.01, '#3a3f48', { mat: GLOSSY, seg: 3 });
    b.roundedBox([0, 0.31, -0.01], [0.3, 0.185, 0.022], 0.02, '#20242c', { mat: GLOSSY, seg: 5 });
    const z = 0.0125;
    flatBox(b, [0, 0.32, z], [0.28, 0.16, 0.002], '#1e3a6e', EMISSIVE);
    flatBox(b, [0, 0.462, z + 0.002], [0.28, 0.018, 0.001], '#4fa3ff', EMISSIVE);
    flatBox(b, [-0.22, 0.3, z + 0.002], [0.05, 0.13, 0.001], '#16305c', EMISSIVE);
    flatBox(b, [0.06, 0.31, z + 0.002], [0.19, 0.12, 0.001], '#cfe6ff', EMISSIVE);
    for (let i = 0; i < 4; i++)
      flatBox(
        b,
        [0.0 + (i % 2) * 0.02, 0.4 - i * 0.05, z + 0.003],
        [0.11 - (i % 3) * 0.02, 0.007, 0.001],
        '#7fb2e8',
        EMISSIVE,
      );
    flatBox(b, [0.17, 0.25, z + 0.003], [0.05, 0.02, 0.001], LIME, EMISSIVE);
    flatBox(b, [0.27, 0.137, z], [0.005, 0.003, 0.002], '#ffffff', EMISSIVE);
  },

  kpi(b) {
    b.roundedBox([0, 0, 0], [0.25, 0.18, 0.025], 0.02, '#fbfbfd', { mat: GLOSSY, seg: 4 });
    const z = 0.026;
    flatBox(b, [0, 0.135, z], [0.21, 0.022, 0.002], NAVY);
    flatBox(b, [-0.12, 0.135, z + 0.002], [0.05, 0.008, 0.001], LIME, EMISSIVE);
    flatBox(b, [0, -0.13, z], [0.2, 0.004, 0.002], '#9aa3b2');
    flatBox(b, [-0.2, -0.03, z], [0.004, 0.1, 0.002], '#9aa3b2');
    const bars = [
      [LIME, 0.07],
      [PINK, 0.12],
      ['#3f8cff', 0.19],
    ];
    bars.forEach(([color, h], i) => {
      const hh = /** @type {number} */ (h) / 2;
      flatBox(
        b,
        [-0.09 + i * 0.11, -0.126 + hh, z + 0.001],
        [0.035, hh, 0.003],
        /** @type {string} */ (color),
        EMISSIVE,
      );
    });
    b.ellipsoid([0.17, 0.12, -0.026], [0.03, 0.03, 0.004], LIME, { seg: 12 });
  },

  wave(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0.3, 0],
        [0.36, 0.06],
        [0.42, 0.17],
        [0.46, 0.28],
        [0.49, 0.35],
        [0.5, 0.34],
        [0.5, 0.2],
        [0.49, 0.08],
        [0.47, 0],
      ],
      LIME,
      { mat: EMISSIVE, seg: 48, scaleZ: 0.6 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.28, 0],
        [0.33, 0.04],
        [0.38, 0.1],
      ],
      '#eaffb0',
      { mat: EMISSIVE, seg: 48, scaleZ: 0.6 },
    );
    b.lathe(
      [0, 0.004, 0],
      [
        [0.18, 0],
        [0.3, 0],
      ],
      '#9fd22a',
      { mat: EMISSIVE, seg: 48, scaleZ: 0.6 },
    );
  },

  lift(b) {
    b.roundedBox([0, 0.07, 0], [0.5, 0.045, 0.45], 0.02, ALU, { mat: GLOSSY, seg: 4 });
    for (let i = 0; i < 6; i++)
      flatBox(b, [0, 0.117, -0.35 + i * 0.14], [0.47, 0.002, 0.012], '#9aa3ad');
    b.roundedBox([0, 0.025, 0], [0.48, 0.025, 0.4], 0.015, '#8a929c', { seg: 3 });
    // Toe board with lime band.
    b.roundedBox([0, 0.17, 0.44], [0.5, 0.06, 0.012], 0.01, ALU, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0, 0.17, 0.454], [0.48, 0.02, 0.002], LIME);
    // Back rails.
    for (const x of [-0.47, 0, 0.47])
      rod(b, [x, 0.1, -0.42], [x, 0.62, -0.42], 0.016, ALU, { mat: GLOSSY, seg: 12 });
    for (const y of [0.36, 0.62])
      rod(b, [-0.5, y, -0.42], [0.5, y, -0.42], 0.018, ALU, { mat: GLOSSY, seg: 12 });
    // Stirrups and cables.
    for (const x of [-0.44, 0.44]) {
      b.roundedBox([x, 0.2, 0], [0.025, 0.1, 0.04], 0.015, '#5b6270', { mat: GLOSSY, seg: 3 });
      rod(b, [x, 0.3, 0], [x, 3.25, 0], 0.008, '#30333a', { seg: 6 });
    }
  },

  gate(b) {
    for (const x of [-0.47, 0.47])
      b.roundedBox([x, 0.5, 0], [0.03, 0.5, 0.15], 0.012, ALU, { mat: GLOSSY, seg: 3 });
    for (const y of [0.03, 0.97])
      b.roundedBox([0, y, 0], [0.45, 0.03, 0.06], 0.012, ALU, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0, 0.5, 0], [0.44, 0.44, 0.015], '#bfe3ef', GLOSSY);
    for (const z of [-0.017, 0.017]) flatBox(b, [0, 0.5, z], [0.44, 0.03, 0.002], LIME);
    flatBox(b, [-0.2, 0.75, 0.017], [0.12, 0.004, 0.001], '#ffffff', GLOSSY);
    flatBox(b, [-0.16, 0.72, 0.017], [0.06, 0.003, 0.001], '#ffffff', GLOSSY);
  },
  carBlue(b) {
    car(b, '#2f6fd6');
  },

  carRed(b) {
    car(b, '#e0393e');
  },

  carWhite(b) {
    car(b, '#eef1f4');
  },

  barrier(b) {
    b.roundedBox([0, 0.48, 0], [0.18, 0.48, 0.18], 0.04, '#e9edf1', { mat: GLOSSY, seg: 5 });
    b.roundedBox([0, 0.06, 0], [0.2, 0.06, 0.2], 0.02, '#3a3f48', { seg: 3 });
    flatBox(b, [0, 0.75, 0.181], [0.12, 0.03, 0.003], LIME);
    flatBox(b, [0, 0.55, 0.181], [0.06, 0.06, 0.003], '#20242c');
    // Pivot hub and striped arm along +x.
    const s = mark(b);
    cyl(b, [0, -0.13, 0], 0.08, 0.26, GRAPHITE, { mat: GLOSSY, seg: 20 });
    place(b, s, rotX(Math.PI / 2), [0, 1, 0]);
    for (let i = 0; i < 10; i++)
      b.roundedBox(
        [0.15 + i * 0.285, 1, 0.13],
        [0.1425, 0.045, 0.04],
        0.03,
        i % 2 ? BLACK : '#ffcf1f',
        { mat: GLOSSY, seg: 3 },
      );
    flatBox(b, [2.97, 1, 0.13], [0.02, 0.03, 0.042], '#ff3040', EMISSIVE);
    b.ellipsoid([0, 0.99, 0.14], [0.03, 0.03, 0.02], CHROME, { mat: GLOSSY, seg: 6 });
    // Warning lamp on top.
    b.ellipsoid([0, 0.96, -0.08], [0.05, 0.06, 0.05], '#ff9a1f', { mat: EMISSIVE, seg: 10 });
  },

  pillarSign(b) {
    b.roundedBox([0, 2, 0], [0.3, 2, 0.3], 0.02, '#bdb9b0', { seg: 3 });
    // Painted level band with a pixel "B2".
    flatBox(b, [0, 2.5, 0], [0.303, 0.3, 0.303], '#ffcf1f');
    flatBox(b, [0, 2.5, 0.306], [0.24, 0.24, 0.002], NAVY);
    const px = 0.06;
    glyph(b, ['110', '101', '110', '101', '110'], [-0.21, 2.65, 0.31], px, '#ffcf1f');
    glyph(b, ['111', '001', '111', '100', '111'], [0.03, 2.65, 0.31], px, '#ffcf1f');
    // Hazard stripes at the foot.
    for (let i = 0; i < 5; i++)
      flatBox(b, [-0.24 + i * 0.12, 0.25, 0.304], [0.03, 0.2, 0.003], i % 2 ? '#ffcf1f' : BLACK);
    // Green emergency light.
    b.roundedBox([0, 3.55, 0.33], [0.12, 0.06, 0.03], 0.02, WHITE, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0, 3.55, 0.362], [0.1, 0.045, 0.002], '#2bff7a', EMISSIVE);
    flatBox(b, [0.04, 3.55, 0.365], [0.02, 0.025, 0.001], WHITE, EMISSIVE);
  },

  drawer(b) {
    // Slides along +x: back face at x = 0, front panel at x = 0.9.
    const M = '#9aa4b0';
    flatBox(b, [0.43, -0.16, 0], [0.43, 0.015, 0.39], M);
    for (const z of [-0.385, 0.385]) flatBox(b, [0.43, -0.02, z], [0.43, 0.155, 0.015], M);
    flatBox(b, [0.015, -0.02, 0], [0.015, 0.155, 0.39], M);
    // Hanging folders.
    const cols = ['#f3d36b', PINK, '#6fc3ff', LIME, '#f3d36b', WHITE];
    cols.forEach((c, i) => flatBox(b, [0.1 + i * 0.12, 0.0, 0], [0.012, 0.13, 0.36], c));
    b.roundedBox([0.875, 0, 0], [0.025, 0.175, 0.4], 0.015, '#c3cad3', { mat: GLOSSY, seg: 4 });
    b.roundedBox([0.91, 0.02, 0], [0.012, 0.018, 0.14], 0.012, CHROME, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0.9005, 0.11, 0], [0.001, 0.035, 0.1], WHITE);
  },

  sprinkler(b) {
    cyl(b, [0, -0.03, 0], 0.05, 0.03, CHROME, { mat: GLOSSY, seg: 16 });
    cyl(b, [0, -0.06, 0], 0.018, 0.03, CHROME, { mat: GLOSSY, seg: 12 });
    for (const x of [-0.025, 0.025])
      rod(b, [x, -0.06, 0], [x * 0.6, -0.13, 0], 0.005, CHROME, { mat: GLOSSY, seg: 6 });
    b.ellipsoid([0, -0.095, 0], [0.008, 0.025, 0.008], '#ff2a3a', { mat: GLOSSY, seg: 8 });
    cyl(b, [0, -0.14, 0], 0.035, 0.008, CHROME, { mat: GLOSSY, seg: 16 });
    b.lathe(
      [0, -0.15, 0],
      [
        [0, 0],
        [0.012, 0],
        [0.012, 0.01],
        [0, 0.01],
      ],
      CHROME,
      { mat: GLOSSY, seg: 8 },
    );
  },

  spray(b) {
    // Wavy strands of water hanging from the top centre.
    const strands = [
      [0, 0, 0.17, '#bfe6ff', GLOSSY],
      [-0.12, 0.05, 0.08, '#e6f7ff', EMISSIVE],
      [0.12, -0.04, 0.08, '#e6f7ff', EMISSIVE],
      [0.02, 0.1, 0.06, '#9fd8ff', EMISSIVE],
    ];
    for (const [x0, z0, r, col, m] of strands) {
      const R = /** @type {number} */ (r),
        X = /** @type {number} */ (x0),
        Z = /** @type {number} */ (z0);
      b.grid(
        14,
        12,
        (u, v) => {
          const a = u * TAU;
          const y = -v;
          const w = 0.02 * Math.sin(v * 9 + X * 30);
          const rr = R * (0.75 + 0.25 * v) * (1 + 0.12 * Math.sin(v * 13 + a * 3));
          const n = [Math.sin(a), 0, Math.cos(a)];
          return { p: [X + w + n[0] * rr, y, Z + n[2] * rr * 0.6], n };
        },
        rgb(/** @type {string} */ (col)),
        /** @type {number} */ (m),
      );
    }
  },

  paper(b) {
    /** @param {number} u @param {number} v @param {number} off */
    const sheet = (u, v, off) => {
      const x = (u - 0.5) * 0.35,
        z = (v - 0.5) * 0.25;
      return [x, 0.015 * Math.cos(u * Math.PI) * -1 + 0.01 * (v - 0.5) * (v - 0.5) * 4 + off, z];
    };
    surf(b, 8, 4, (u, v) => sheet(u, v, 0.001), WHITE, MATTE);
    surf(b, 8, 4, (u, v) => sheet(u, v, -0.001), '#e4e8ee', MATTE, [0, -1, 0]);
    for (let i = 0; i < 4; i++)
      flatBox(
        b,
        [-0.04 + (i % 2) * 0.02, 0.0025, -0.07 + i * 0.045],
        [0.1 - (i % 2) * 0.03, 0.0008, 0.006],
        '#9aa3b2',
      );
  },

  binders(b) {
    const cols = [PINK, LIME, NAVY];
    cols.forEach((c, i) => {
      const s = mark(b);
      b.roundedBox([0, 0.012, 0], [0.4, 0.012, 0.2], 0.01, c, { mat: GLOSSY, seg: 3 });
      b.roundedBox([0, 0.188, 0], [0.4, 0.012, 0.2], 0.01, c, { mat: GLOSSY, seg: 3 });
      b.roundedBox([0, 0.1, 0.185], [0.4, 0.1, 0.018], 0.015, c, { mat: GLOSSY, seg: 4 });
      flatBox(b, [0, 0.1, -0.01], [0.385, 0.077, 0.18], WHITE);
      flatBox(b, [-0.12, 0.1, 0.204], [0.16, 0.05, 0.002], WHITE);
      flatBox(b, [-0.12, 0.11, 0.207], [0.11, 0.008, 0.001], '#5a6372');
      b.ellipsoid([0.26, 0.1, 0.2], [0.04, 0.025, 0.006], '#1b1d22', { seg: 8 });
      place(b, s, rotY([0.03, -0.035, 0.02][i]), [[0.0, 0.01, -0.01][i], i * 0.2, 0]);
    });
  },

  vacuum(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0.005],
        [0.3, 0.005],
        [0.33, 0.02],
        [0.34, 0.14],
        [0.32, 0.17],
        [0.2, 0.18],
        [0, 0.18],
      ],
      GRAPHITE,
      { mat: GLOSSY, seg: 40 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.345, 0.03],
        [0.35, 0.06],
        [0.35, 0.11],
        [0.345, 0.13],
      ],
      LIME,
      { mat: GLOSSY, seg: 40 },
    );
    b.lathe(
      [0, 0.181, 0],
      [
        [0.24, 0],
        [0.0, 0.002],
      ],
      '#3a3f48',
      { mat: GLOSSY, seg: 40 },
    );
    cyl(b, [0, 0.18, -0.06], 0.06, 0.012, '#4b515c', { mat: GLOSSY, seg: 20 });
    b.ellipsoid([0, 0.185, 0.2], [0.035, 0.012, 0.015], '#3fa9ff', { mat: EMISSIVE, seg: 8 });
    b.ellipsoid([0, 0.192, -0.06], [0.025, 0.008, 0.025], LIME, { mat: GLOSSY, seg: 8 });
    for (const x of [-0.12, 0.12])
      b.ellipsoid([x, 0.012, 0.2], [0.05, 0.01, 0.02], '#20242c', { seg: 6 });
  },

  laptopStand(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.26, 0],
        [0.27, 0.02],
        [0.22, 0.05],
        [0, 0.05],
      ],
      GRAPHITE,
      { mat: GLOSSY, seg: 32 },
    );
    b.roundedBox([0, 0.53, 0], [0.06, 0.48, 0.06], 0.03, ALU, { mat: GLOSSY, seg: 4 });
    b.roundedBox([0, 1.0, 0], [0.35, 0.02, 0.24], 0.015, WHITE, { mat: GLOSSY, seg: 4 });
    flatBox(b, [0, 1.0, 0.242], [0.33, 0.006, 0.002], LIME);
    // Laptop: base and keyboard.
    b.roundedBox([0, 1.028, 0.03], [0.19, 0.008, 0.13], 0.006, ALU, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0, 1.037, 0.0], [0.16, 0.001, 0.07], '#30343c');
    flatBox(b, [0, 1.037, 0.11], [0.05, 0.001, 0.03], '#aab2bc');
    // Lid with an emissive video-call grid.
    const s = mark(b);
    b.roundedBox([0, 0.125, 0], [0.19, 0.125, 0.006], 0.005, ALU, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0, 0.13, 0.007], [0.175, 0.11, 0.001], '#121a2c', EMISSIVE);
    const tiles = ['#ff6fae', LIME, '#4fa3ff', '#ffb347'];
    tiles.forEach((c, i) => {
      const x = (i % 2 ? 1 : -1) * 0.085,
        y = 0.13 + (i < 2 ? 1 : -1) * 0.052;
      flatBox(b, [x, y, 0.009], [0.08, 0.048, 0.001], c, EMISSIVE);
      flatBox(b, [x, y - 0.006, 0.0105], [0.018, 0.022, 0.001], '#ffffff', EMISSIVE);
      flatBox(b, [x, y + 0.026, 0.0105], [0.012, 0.012, 0.001], '#ffe2c4', EMISSIVE);
    });
    place(b, s, rotX(-0.22), [0, 1.03, -0.1]);
  },

  invite(b) {
    b.roundedBox([0, 0, 0], [0.2, 0.14, 0.02], 0.012, WHITE, { mat: GLOSSY, seg: 4 });
    // Flap edges as a shallow "V".
    for (const sx of [-1, 1]) {
      const s = mark(b);
      flatBox(b, [0, 0, 0], [0.115, 0.004, 0.001], '#c9d0d8');
      place(b, s, rotZ(sx * 0.6), [sx * 0.095, 0.075, 0.021]);
    }
    // Calendar badge.
    b.roundedBox([0.09, -0.05, 0.022], [0.065, 0.065, 0.01], 0.01, WHITE, { mat: GLOSSY, seg: 3 });
    flatBox(b, [0.09, 0.0, 0.032], [0.06, 0.016, 0.002], '#ff4f5a');
    for (let i = 0; i < 6; i++)
      flatBox(
        b,
        [0.06 + (i % 3) * 0.03, -0.045 - Math.floor(i / 3) * 0.035, 0.032],
        [0.01, 0.01, 0.002],
        i === 4 ? LIME : '#5a6372',
      );
    for (const x of [0.065, 0.115])
      b.roundedBox([x, 0.02, 0.034], [0.005, 0.012, 0.004], 0.004, GRAPHITE, { seg: 2 });
  },

  cup(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.075, 0],
        [0.078, 0.005],
        [0.1, 0.27],
        [0, 0.27],
      ],
      WHITE,
      { mat: GLOSSY, seg: 28 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [0.085, 0.08],
        [0.096, 0.2],
      ],
      '#b98b5a',
      { seg: 28 },
    );
    flatBox(b, [0, 0.14, 0.093], [0.035, 0.035, 0.002], LIME);
    b.lathe(
      [0, 0.26, 0],
      [
        [0.1, 0],
        [0.11, 0.01],
        [0.108, 0.03],
        [0.08, 0.04],
        [0.075, 0.06],
        [0, 0.06],
      ],
      '#3b2a20',
      { mat: GLOSSY, seg: 28 },
    );
    flatBox(b, [0, 0.32, 0.045], [0.012, 0.0015, 0.006], '#1b1d22');
  },

  archive(b) {
    // Exactly 1×1×1: body inset slightly so decals never leave the tile.
    const K = '#c79b67';
    flatBox(b, [0, 0.43, 0], [0.496, 0.43, 0.496], K);
    flatBox(b, [0, 0.93, 0], [0.5, 0.07, 0.5], '#b88c59');
    flatBox(b, [0, 0.862, 0], [0.4985, 0.004, 0.4985], '#8f6a42');
    // Handle cut-outs on the front and sides, white label on the front.
    flatBox(b, [0, 0.72, 0.4975], [0.13, 0.04, 0.0015], '#3a2a1c');
    for (const x of [-0.4975, 0.4975]) flatBox(b, [x, 0.72, 0], [0.0015, 0.04, 0.13], '#3a2a1c');
    flatBox(b, [0, 0.4, 0.4975], [0.25, 0.14, 0.0015], WHITE);
    for (let i = 0; i < 3; i++)
      flatBox(
        b,
        [-0.06 + i * 0.03, 0.46 - i * 0.05, 0.499],
        [0.17 - i * 0.03, 0.01, 0.0008],
        '#5a6372',
      );
    flatBox(b, [0.18, 0.31, 0.499], [0.04, 0.02, 0.0008], LIME);
  },

  copilTable(b) {
    // Repeats seamlessly along x: everything spans exactly x ∈ [-0.5, 0.5].
    flatBox(b, [0, 0.87, 0], [0.5, 0.03, 0.7], '#8a5632', GLOSSY);
    for (let i = 0; i < 5; i++)
      flatBox(b, [0, 0.9002, -0.55 + i * 0.27], [0.5, 0.0002, 0.012], '#7a4a2a', GLOSSY);
    flatBox(b, [0, 0.82, 0.68], [0.5, 0.02, 0.02], '#5e3a22', GLOSSY);
    flatBox(b, [0, 0.82, 0.701], [0.5, 0.005, 0.001], LIME);
    flatBox(b, [0, 0.41, 0], [0.5, 0.39, 0.03], NAVY);
    for (const z of [-0.45, 0.45]) flatBox(b, [0, 0.79, z], [0.5, 0.02, 0.02], '#3a3f48', GLOSSY);
    flatBox(b, [0, 0.01, 0], [0.5, 0.01, 0.25], '#3a3f48', GLOSSY);
  },

  projector(b) {
    b.roundedBox([0, 1.5, 0], [2.5, 1.5, 0.04], 0.03, BLACK, { mat: GLOSSY, seg: 3 });
    const z = 0.042;
    flatBox(b, [0, 1.55, z], [2.4, 1.35, 0.002], '#e6efff', EMISSIVE);
    flatBox(b, [0, 2.7, z + 0.002], [2.3, 0.08, 0.001], NAVY, EMISSIVE);
    flatBox(b, [-1.9, 2.7, z + 0.003], [0.25, 0.04, 0.001], LIME, EMISSIVE);
    // Axes and bars.
    flatBox(b, [0, 0.5, z + 0.002], [2.1, 0.012, 0.001], '#5a6372', EMISSIVE);
    flatBox(b, [-2.1, 1.45, z + 0.002], [0.012, 0.95, 0.001], '#5a6372', EMISSIVE);
    const bars = [0.4, 0.65, 0.55, 0.9, 1.2, 1.6];
    const cols = ['#4fa3ff', '#4fa3ff', PINK, '#4fa3ff', LIME, LIME];
    bars.forEach((h, i) =>
      flatBox(
        b,
        [-1.65 + i * 0.6, 0.512 + h / 2, z + 0.002],
        [0.17, h / 2, 0.001],
        cols[i],
        EMISSIVE,
      ),
    );
    // Trend line drawn as small steps.
    for (let i = 0; i < 12; i++)
      flatBox(
        b,
        [-1.8 + i * 0.3, 1.0 + i * 0.11, z + 0.003],
        [0.16, 0.02, 0.001],
        '#ff8a1f',
        EMISSIVE,
      );
    for (const x of [-2.3, 2.3])
      b.roundedBox([x, 0.02, 0], [0.12, 0.02, 0.18], 0.015, GRAPHITE, { mat: GLOSSY, seg: 3 });
  },

  truss(b) {
    const y0 = -0.02,
      y1 = -0.28,
      zz = 0.13;
    for (const y of [y0, y1])
      for (const z of [-zz, zz]) rod(b, [-1, y, z], [1, y, z], 0.018, ALU, { mat: GLOSSY, seg: 8 });
    for (let i = 0; i < 8; i++) {
      const xa = -1 + i * 0.25,
        xb = xa + 0.25;
      for (const z of [-zz, zz])
        rod(b, [xa, y0, z], [xb, y1, z], 0.008, ALU, { mat: GLOSSY, seg: 6 });
      for (const y of [y0, y1])
        rod(b, [xa, y, -zz], [xb, y, zz], 0.008, ALU, { mat: GLOSSY, seg: 6 });
    }
    // Clamp and hanging spotlight (upside down, beam towards +z and down).
    b.roundedBox([0, -0.31, 0], [0.05, 0.03, 0.05], 0.015, BLACK, { mat: GLOSSY, seg: 3 });
    const s = mark(b);
    spot(b);
    place(b, s, rotZ(Math.PI), [0, -0.33, 0]);
  },

  spotlight(b) {
    spot(b);
  },

  curtain(b) {
    /** @param {number} u @param {number} y */
    const fold = (u, y) => {
      const flare = 1 + 0.4 * (1 - y / 5);
      return [(u - 0.5) * 1, y, 0.07 * flare * Math.sin(u * TAU * 3 + y * 0.15)];
    };
    surf(b, 48, 12, (u, v) => fold(u, v * 5), '#a3122a', MATTE, [0, 0, 1]);
    // Gold trim and fringe following the folds.
    surf(
      b,
      48,
      2,
      (u, v) => {
        const p = fold(u, 0.04 + v * 0.14);
        return [p[0], p[1], p[2] + 0.012];
      },
      '#e2b13c',
      GLOSSY,
      [0, 0, 1],
    );
    surf(
      b,
      48,
      1,
      (u, v) => {
        const p = fold(u, v * 0.04);
        return [p[0], p[1], p[2] + 0.012];
      },
      '#b8861f',
      MATTE,
      [0, 0, 1],
    );
  },

  shadow(b) {
    b.lathe(
      [0, 0, 0],
      [
        [0, -0.005],
        [0.42, -0.005],
        [0.5, 0],
        [0.42, 0.005],
        [0, 0.005],
      ],
      '#0b0c10',
      { seg: 32 },
    );
  },

  warn(b) {
    flatBox(b, [0, 0.02, 0], [0.5, 0.02, 0.4], '#ff7a14', EMISSIVE);
    for (let i = 0; i < 5; i++)
      flatBox(b, [-0.4 + i * 0.2, 0.045, 0], [0.05, 0.005, 0.36], '#ffb347', EMISSIVE);
  },

  arrow(b) {
    const C = rgb('#ff8a1f');
    const h = 0.03;
    flatBox(b, [-0.2, h / 2, 0], [0.4, h / 2, 0.12], '#ff8a1f', EMISSIVE);
    // Triangular head from x = 0.2 to 0.6.
    const tip = [0.6, 0],
      l = [0.2, 0.3],
      r = [0.2, -0.3];
    for (const y of [0, h])
      b.grid(
        1,
        1,
        (u, v) => {
          const a = [l[0] + (r[0] - l[0]) * v, l[1] + (r[1] - l[1]) * v];
          return {
            p: [a[0] + (tip[0] - a[0]) * u, y, a[1] + (tip[1] - a[1]) * u],
            n: [0, y ? 1 : -1, 0],
          };
        },
        C,
        EMISSIVE,
      );
    for (const [a, c] of [
      [l, tip],
      [tip, r],
      [r, l],
    ]) {
      const n = [c[1] - a[1], 0, -(c[0] - a[0])];
      const len = Math.hypot(...n);
      b.grid(
        1,
        1,
        (u, v) => ({
          p: [a[0] + (c[0] - a[0]) * u, v * h, a[1] + (c[1] - a[1]) * u],
          n: n.map((x) => x / len),
        }),
        C,
        EMISSIVE,
      );
    }
  },

  rackFall(b) {
    BUILDERS.rack(b);
  },

  confetti(b) {
    b.roundedBox([0, 0.05, 0], [0.18, 0.05, 0.15], 0.03, NAVY, { mat: GLOSSY, seg: 4 });
    for (const x of [-0.1, 0.1])
      b.roundedBox([x, 0.19, 0], [0.015, 0.1, 0.04], 0.012, GRAPHITE, { mat: GLOSSY, seg: 3 });
    const s = mark(b);
    b.lathe(
      [0, 0, 0],
      [
        [0, -0.1],
        [0.06, -0.1],
        [0.075, -0.07],
        [0.09, 0.3],
        [0.075, 0.3],
        [0.07, 0.25],
        [0, 0.25],
      ],
      LIME,
      { mat: GLOSSY, seg: 24 },
    );
    for (const y of [0.05, 0.18]) ring(b, [0, y, 0], 0.085, 0.012, PINK, { seg: 24, sides: 6 });
    ring(b, [0, 0.3, 0], 0.085, 0.014, PINK, { seg: 24, sides: 6 });
    const r = rng(3);
    const bits = [PINK, LIME, '#4fa3ff', '#ffcf1f', WHITE];
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU,
        rr = r() * 0.05;
      flatBox(
        b,
        [Math.sin(a) * rr, 0.27 + r() * 0.04, Math.cos(a) * rr],
        [0.012, 0.004, 0.008],
        bits[i % 5],
        EMISSIVE,
      );
    }
    place(b, s, rotX(0.5), [0, 0.26, 0]);
  },
};

/** @type {PropId[]} */
export const PROP_IDS = [
  'plant',
  'plantSmall',
  'cooler',
  'printer',
  'coffee',
  'chair',
  'rack',
  'hvac',
  'antenna',
  'parasol',
  'bistro',
  'speaker',
  'lampPost',
  'monitor',
  'kpi',
  'wave',
  'lift',
  'gate',
  'carBlue',
  'carRed',
  'carWhite',
  'barrier',
  'pillarSign',
  'drawer',
  'sprinkler',
  'spray',
  'paper',
  'binders',
  'vacuum',
  'laptopStand',
  'invite',
  'cup',
  'archive',
  'copilTable',
  'projector',
  'truss',
  'spotlight',
  'curtain',
  'shadow',
  'warn',
  'arrow',
  'rackFall',
  'confetti',
];

/**
 * Geometry for one prop without touching GL (handy for tests and tools).
 * @param {PropId} id
 * @returns {{data: ArrayBuffer, count: number}}
 */
export function propGeometry(id) {
  const b = new MeshBuilder();
  BUILDERS[id](b);
  return b.build();
}

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {Record<PropId, Mesh>}
 */
export function buildProps(gl) {
  const out = /** @type {Record<PropId, Mesh>} */ ({});
  for (const id of PROP_IDS) out[id] = new Mesh(gl, propGeometry(id));
  return out;
}
