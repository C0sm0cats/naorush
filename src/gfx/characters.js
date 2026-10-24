import { MeshBuilder } from './geometry.js';
import { multiply, rotationX, rotationY, rotationZ, scaling, translation } from './mat4.js';
import { Mesh } from './renderer.js';
import { MAT, rgb } from './voxels.js';

/**
 * Smooth "designer toy" characters built from rounded primitives, split into
 * parts so they can be animated with joint rotations. Units are tiles; a hero
 * stands about 1.75 tiles tall, with a large head for readability on phones.
 *
 * @typedef {Object} Look
 * @property {string} skin
 * @property {string} hair
 * @property {'short'|'quiff'|'long'|'midlong'|'bun'|'curly'|'bald'|'bob'|'ponytail'} hairStyle
 * @property {string} jacket
 * @property {string} shirt
 * @property {string} legs Trousers or tights colour.
 * @property {string} shoes
 * @property {string} [tie]
 * @property {string} [skirt]
 * @property {string} [dress] Dress colour: shows below the jacket and in its V, instead of a shirt.
 * @property {string} [paws] Colour of cat paw prints scattered over the jacket.
 * @property {boolean} [crop] Cropped trousers showing the ankles.
 * @property {boolean} [sneakers] Low-top sneakers instead of town shoes.
 * @property {boolean} [openCollar] Shirt worn open at the neck (no tie).
 * @property {boolean} [glasses]
 * @property {boolean} [beard]
 * @property {boolean} [earrings]
 * @property {string} [lips]
 * @property {string} [eyes]
 * @property {string} [prop] Held item: 'tablet' | 'laptop' | 'phone' | 'mug' | 'folder'.
 * @property {string} [headset] Call headset colour: thin band, ear pads and a boom mic.
 * @property {string} [headphones] Big over-ear headphones colour.
 * @property {boolean} [turtleneck] The shirt is a ribbed turtleneck (no collar points).
 * @property {boolean} [cardigan] Soft knit cardigan: no lapels, a button band, ribbed hem and cuffs.
 * @property {string} [badge] Lanyard colour, with an ID badge hanging on the chest.
 * @property {string} [backpack] Backpack colour: straps over the shoulders, the pack on the back.
 * @property {string} [stripe] Sneaker side stripe colour (navy by default).
 *
 * @typedef {{mesh: Mesh, upright?: boolean}} Part
 */

// Joint positions (model space, feet at y = 0, facing +z).
const HIP_Y = 0.62;
const HIP_X = 0.1;
const SHOULDER_Y = 0.48; // above the hip
const SHOULDER_X = 0.235;
const NECK_Y = 0.52;
const EYE_Y = 0.27; // Eye centre, in head space.

/**
 * @param {string} hex
 * @param {number} amount -1..1
 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  /** @param {number} c */
  const f = (c) =>
    Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  return (
    '#' +
    [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {(b: MeshBuilder) => void} draw
 * @returns {Part}
 */
const part = (gl, draw) => {
  const b = new MeshBuilder();
  draw(b);
  return { mesh: new Mesh(gl, b.build()) };
};

// ---------------------------------------------------------------------------
// Sculpting helpers: parametric surfaces with numerical normals, lofts along y,
// tubes along curves and shells over the skull.

const TAU = Math.PI * 2;
/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + (b - a) * t;
/** @param {number} e0 @param {number} e1 @param {number} x */
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** @param {number} x @param {number} e */
const spow = (x, e) => Math.sign(x) * Math.abs(x) ** e;
/** @param {number[]} a @param {number[]} b */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {number[]} a @param {number[]} b */
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** @param {number[]} a */
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** @param {string} hex */
const luma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
};

/**
 * Parametric surface; normals come from finite differences and face away from `inside`.
 * @param {MeshBuilder} b @param {number} nu @param {number} nv
 * @param {(u: number, v: number) => number[]} f
 * @param {(u: number, v: number) => number[]} inside
 * @param {string} color @param {number} [mat]
 */
function surf(b, nu, nv, f, inside, color, mat = MAT.MATTE) {
  const e = 1e-3;
  b.grid(
    nu,
    nv,
    (u, v) => {
      const uu = Math.min(1 - e, Math.max(e, u));
      const vv = Math.min(1 - e, Math.max(e, v));
      const du = sub(f(uu + e, vv), f(uu - e, vv));
      const dv = sub(f(uu, vv + e), f(uu, vv - e));
      let n = unit(cross(du, dv));
      const o = sub(f(uu, vv), inside(uu, vv));
      if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) n = [-n[0], -n[1], -n[2]];
      return { p: f(u, v), n };
    },
    rgb(color),
    mat,
  );
}

/**
 * Rotates a vector by Euler angles (x, then y, then z).
 * @param {number[]} p @param {number[]} r
 */
function rot(p, r) {
  let [x, y, z] = p;
  if (r[0])
    [y, z] = [y * Math.cos(r[0]) - z * Math.sin(r[0]), y * Math.sin(r[0]) + z * Math.cos(r[0])];
  if (r[1])
    [x, z] = [x * Math.cos(r[1]) + z * Math.sin(r[1]), -x * Math.sin(r[1]) + z * Math.cos(r[1])];
  if (r[2])
    [x, y] = [x * Math.cos(r[2]) - y * Math.sin(r[2]), x * Math.sin(r[2]) + y * Math.cos(r[2])];
  return [x, y, z];
}

/**
 * Ellipsoid (or a patch of one) with optional rotation; longitude 0 faces +z.
 * @param {MeshBuilder} b @param {number[]} c @param {number[]} r @param {string} color
 * @param {{seg?: number, lon?: number[], lat?: number[], rot?: number[], mat?: number}} [o]
 */
function ell(b, c, r, color, o = {}) {
  const seg = o.seg ?? 8;
  const [l0, l1] = o.lon ?? [-Math.PI, Math.PI];
  const [a0, a1] = o.lat ?? [-Math.PI / 2, Math.PI / 2];
  const R = o.rot ?? [0, 0, 0];
  surf(
    b,
    Math.max(3, Math.round((seg * 2 * (l1 - l0)) / TAU)),
    Math.max(2, Math.round((seg * (a1 - a0)) / Math.PI)),
    (u, v) => {
      const lon = lerp(l0, l1, u),
        lat = lerp(a0, a1, v);
      const d = rot(
        [
          Math.cos(lat) * Math.sin(lon) * r[0],
          Math.sin(lat) * r[1],
          Math.cos(lat) * Math.cos(lon) * r[2],
        ],
        R,
      );
      return [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
    },
    () => c,
    color,
    o.mat,
  );
}

/**
 * Catmull-Rom spline through rows of numbers; t runs over [0, rows - 1].
 * @param {number[][]} keys
 * @returns {(t: number) => number[]}
 */
function spline(keys) {
  const n = keys.length;
  return (t) => {
    const i = Math.min(n - 2, Math.max(0, Math.floor(t)));
    const f = t - i;
    const p0 = keys[Math.max(0, i - 1)],
      p1 = keys[i],
      p2 = keys[i + 1],
      p3 = keys[Math.min(n - 1, i + 2)];
    return p1.map((b, k) => {
      const a = p0[k],
        c = p2[k],
        d = p3[k];
      return (
        0.5 *
        (2 * b +
          (-a + c) * f +
          (2 * a - 5 * b + 4 * c - d) * f * f +
          (-a + 3 * b - 3 * c + d) * f ** 3)
      );
    });
  };
}

/**
 * A loft profile: rows [y, rx, rz, cz?, squareness?, cx?] from bottom to top.
 * @typedef {{row: (t: number) => number[], n: number, tAt: (y: number) => number}} Profile
 * @param {number[][]} keys
 * @returns {Profile}
 */
function profile(keys) {
  const row = spline(keys.map((k) => [k[0], k[1], k[2], k[3] ?? 0, k[4] ?? 2, k[5] ?? 0]));
  const n = keys.length - 1;
  /** @param {number} y */
  const tAt = (y) => {
    let lo = 0,
      hi = n;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (row(m)[0] < y) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  return { row, n, tAt };
}

/**
 * Point on a loft ring at angle `a` (0 = front, +π/2 = +x), pushed out by `dr`.
 * @param {number[]} r @param {number} a @param {number} [dr]
 */
const ringPoint = (r, a, dr = 0) => [
  r[5] + (r[1] + dr) * spow(Math.sin(a), 2 / r[4]),
  r[0],
  r[3] + (r[2] + dr) * spow(Math.cos(a), 2 / r[4]),
];

/**
 * Lofted surface along y through superellipse rings.
 * @param {MeshBuilder} b @param {Profile} P @param {string} color
 * @param {{seg?: number, steps?: number, t0?: number, t1?: number, dr?: number, mat?: number,
 *   arc?: (r: number[]) => number[]}} [o]
 */
function loft(b, P, color, o = {}) {
  const t0 = o.t0 ?? 0,
    t1 = o.t1 ?? P.n;
  const dr = o.dr ?? 0;
  surf(
    b,
    o.seg ?? 20,
    Math.max(1, Math.ceil((t1 - t0) * (o.steps ?? 3))),
    (u, v) => {
      const r = P.row(lerp(t0, t1, v));
      const [a0, a1] = o.arc ? o.arc(r) : [0, TAU];
      return ringPoint(r, lerp(a0, a1, u), dr);
    },
    (_u, v) => {
      const r = P.row(lerp(t0, t1, v));
      return [r[5], r[0], r[3]];
    },
    color,
    o.mat,
  );
}

/**
 * Tube swept along a curve with an elliptical section [r1 along N, r2 along B].
 * @param {MeshBuilder} b @param {(t: number) => number[]} path
 * @param {(t: number) => number[]} rad @param {string} color
 * @param {{nu?: number, nv?: number, ref?: (t: number) => number[], mat?: number}} [o]
 */
function tube(b, path, rad, color, o = {}) {
  const ref = o.ref ?? (() => [0, 0, 1]);
  surf(
    b,
    o.nu ?? 8,
    o.nv ?? 8,
    (u, v) => {
      const c = path(v);
      const T = unit(sub(path(Math.min(1, v + 1e-3)), path(Math.max(0, v - 1e-3))));
      const N = unit(cross(T, ref(v)));
      const B = cross(N, T);
      const [r1, r2] = rad(v);
      const ca = Math.cos(u * TAU) * r1,
        sa = Math.sin(u * TAU) * r2;
      return [
        c[0] + N[0] * ca + B[0] * sa,
        c[1] + N[1] * ca + B[1] * sa,
        c[2] + N[2] * ca + B[2] * sa,
      ];
    },
    (_u, v) => path(v),
    color,
    o.mat,
  );
}

// Head: an ellipsoid centred above the neck joint.
const HEAD_C = [0, 0.25, 0];
const HEAD_R = [0.205, 0.215, 0.19];
/** Head surface depth at (x, y), plus `d`. @param {number} x @param {number} y @param {number} [d] */
const faceZ = (x, y, d = 0) =>
  HEAD_R[2] *
    Math.sqrt(Math.max(0, 1 - (x / HEAD_R[0]) ** 2 - ((y - HEAD_C[1]) / HEAD_R[1]) ** 2)) +
  d;
/** Rough height of each hairstyle's crown, as a multiple of the head radius. */
const HAIR_TOP = /** @type {Record<string, number>} */ ({
  short: 1.13,
  quiff: 1.12,
  long: 1.08,
  midlong: 1.12,
  bun: 1.1,
  ponytail: 1.1,
  curly: 1.26,
  bob: 1.08,
  bald: 1.0,
});
/** @param {number} x @param {number} y @param {number} z */
const dir = (x, y, z) => unit([x, y, z]);
/** Soft bump around direction `c`. @param {number[]} d @param {number[]} c @param {number} amp @param {number} w */
const bump = (d, c, amp, w) => amp * Math.exp(-(1 - (d[0] * c[0] + d[1] * c[1] + d[2] * c[2])) / w);

/**
 * Shell hugging the skull: longitude range, latitude bounds per longitude and a
 * radial push (fraction of the head radius) shape hair and beards.
 * @param {MeshBuilder} b @param {string} color
 * @param {{nu: number, nv: number, lon?: number[], lat: (lon: number) => number[],
 *   push: (d: number[], u: number, v: number) => number, mat?: number}} o
 */
function shell(b, color, o) {
  const [l0, l1] = o.lon ?? [-Math.PI, Math.PI];
  surf(
    b,
    o.nu,
    o.nv,
    (u, v) => {
      const lon = lerp(l0, l1, u);
      const [lo, hi] = o.lat(lon);
      const lat = lerp(lo, hi, v);
      const d = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
      const k = 1 + o.push(d, u, v);
      return [0, 1, 2].map((i) => HEAD_C[i] + d[i] * HEAD_R[i] * k);
    },
    () => HEAD_C,
    color,
    o.mat,
  );
}

/**
 * Flat shape lying on the face, slightly domed: `edge(a)` gives the outline offset
 * at angle a (0..2π) around (cx, cy); `d` lifts it off the skin, `h` domes the middle.
 * @param {MeshBuilder} b @param {number} cx @param {number} cy
 * @param {(a: number) => number[]} edge @param {number} d @param {number} h
 * @param {string} color @param {{nu?: number, nv?: number, mat?: number}} [o]
 */
function decal(b, cx, cy, edge, d, h, color, o = {}) {
  surf(
    b,
    o.nu ?? 20,
    o.nv ?? 3,
    (u, v) => {
      const [ex, ey] = edge(u * TAU);
      const x = cx + ex * v,
        y = cy + ey * v;
      return [x, y, faceZ(x, y, d + h * (1 - v * v))];
    },
    () => HEAD_C,
    color,
    o.mat,
  );
}

/**
 * Hairline latitude around the head: high over the forehead, `side` above or over
 * the ears, `back` at the nape; the face window spans longitudes w0..w1.
 * @param {number} front @param {number} side @param {number} back @param {number} w0 @param {number} w1
 */
const hairline = (front, side, back, w0, w1) => /** @param {number} lon */ (lon) => {
  const c = Math.cos(lon);
  const lo =
    c >= 0
      ? lerp(side, front, smooth(Math.cos(w1), Math.cos(w0), c))
      : lerp(side, back, smooth(0, 0.8, -c));
  return [lo, Math.PI / 2];
};

/**
 * Cat paw print lying on a loft surface (one main pad and four toe beans), each
 * pad a slightly domed disc in the local tangent plane, lifted off the cloth.
 * @param {MeshBuilder} b @param {Profile} P @param {number} a Ring angle (0 = front).
 * @param {number} y Height on the profile. @param {number} size @param {number} tilt
 * @param {string} color
 */
function pawPrint(b, P, a, y, size, tilt, color) {
  const e = 1e-3;
  /** @param {number} aa @param {number} yy */
  const at = (aa, yy) => ringPoint(P.row(P.tAt(yy)), aa);
  const speed = Math.hypot(...sub(at(a + e, y), at(a - e, y))) / (2 * e);
  const pads = [
    [0, -0.007, 0.0165, 0.0135, 0, 1],
    [-0.0195, 0.0115, 0.0062, 0.008, 0.4, 0],
    [-0.0072, 0.0215, 0.0062, 0.008, 0.12, 0],
    [0.0072, 0.0215, 0.0062, 0.008, -0.12, 0],
    [0.0195, 0.0115, 0.0062, 0.008, -0.4, 0],
  ];
  const ct = Math.cos(tilt),
    st = Math.sin(tilt);
  for (const [px, py, rx, ry, pr, main] of pads) {
    const dx = (px * ct - py * st) * size,
      dy = (px * st + py * ct) * size;
    const ac = a + dx / speed,
      yc = y + dy;
    const C = at(ac, yc);
    const Ta = unit(sub(at(ac + e, yc), at(ac - e, yc)));
    const Ty = unit(sub(at(ac, yc + e), at(ac, yc - e)));
    let N = unit(cross(Ty, Ta));
    const r = P.row(P.tAt(yc));
    const out = sub(C, [r[5], yc, r[3]]);
    if (N[0] * out[0] + N[1] * out[1] + N[2] * out[2] < 0) N = [-N[0], -N[1], -N[2]];
    const k = Ty[0] * N[0] + Ty[1] * N[1] + Ty[2] * N[2];
    const U = unit([Ty[0] - N[0] * k, Ty[1] - N[1] * k, Ty[2] - N[2] * k]);
    const rho = tilt + pr;
    const cr = Math.cos(rho),
      sr = Math.sin(rho);
    surf(
      b,
      main ? 14 : 9,
      2,
      (u, v) => {
        const ph = u * TAU;
        // The main pad narrows towards the toes, like a rounded triangle.
        const ex = rx * size * Math.cos(ph) * (main ? 1 - 0.2 * Math.sin(ph) : 1);
        const ey = ry * size * Math.sin(ph);
        const lx = (ex * cr - ey * sr) * v,
          ly = (ex * sr + ey * cr) * v;
        const h = 0.0026 + 0.0015 * (1 - v * v);
        return [0, 1, 2].map((i) => C[i] + N[i] * h + Ta[i] * lx + U[i] * ly);
      },
      () => [C[0] - N[0] * 0.05, C[1] - N[1] * 0.05, C[2] - N[2] * 0.05],
      color,
    );
  }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Look} look
 * @returns {Record<string, Part>}
 */
export function buildCharacter(gl, look) {
  const female = Boolean(look.lips);
  const skirted = Boolean(look.skirt || look.dress);
  const dark = '#1d1a24';
  const gloss = MAT.GLOSSY;
  const hair = look.hair;
  const style = look.hairStyle;

  // Head: origin at the neck joint.
  const head = part(gl, (b) => {
    b.ellipsoid(HEAD_C, HEAD_R, look.skin, { seg: 22 });
    for (const s of [-1, 1]) {
      // Ears with a shaded hollow.
      ell(b, [s * 0.198, 0.245, -0.01], [0.035, 0.052, 0.03], look.skin, { seg: 7 });
      ell(b, [s * 0.215, 0.245, 0.0], [0.014, 0.03, 0.016], shade(look.skin, -0.12), {
        seg: 5,
        lon: [s > 0 ? 0 : -Math.PI, s > 0 ? Math.PI : 0],
      });
    }
    ell(b, [0, 0.225, 0.188], [0.022, 0.028, 0.02], shade(look.skin, -0.08), { seg: 7 });

    if (look.beard) {
      // Trimmed full beard: from the sideburns along the jaw to a rounded chin,
      // leaving the mouth clear, with a moustache above it.
      const lonMax = 1.75;
      shell(b, hair, {
        nu: 28,
        nv: 12,
        lon: [-lonMax, lonMax],
        lat: (lon) => {
          const a = Math.abs(lon);
          const top = lerp(-0.62, 0.15, smooth(0.25, 1.45, a));
          return [-Math.PI / 2 + 0.05, top];
        },
        push: (d, u, v) =>
          (0.035 + bump(d, dir(0, -0.75, 0.66), 0.13, 0.12)) *
          smooth(1, 0.7, v) *
          smooth(0, 0.12, u) *
          smooth(1, 0.88, u),
        mat: gloss,
      });
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const x = s * lerp(0.004, 0.07, t);
            const y = 0.183 - t * t * 0.03;
            return [x, y, faceZ(x, y, 0.006)];
          },
          (t) => [0.017 * (1 - 0.55 * t), 0.012 * (1 - 0.4 * t)],
          hair,
          { nu: 7, nv: 6, mat: gloss },
        );
    }

    if (look.glasses) {
      // Rounded-rectangle rims following the face, a bridge and temples to the ears.
      for (const s of [-1, 1]) {
        const cx = s * 0.075,
          cy = 0.27;
        tube(
          b,
          (t) => {
            const a = t * TAU;
            const x = cx + spow(Math.cos(a), 0.7) * 0.047;
            const y = cy + spow(Math.sin(a), 0.7) * 0.036;
            return [x, y, faceZ(cx, cy, 0.02) - (x - cx) * s * 0.3];
          },
          () => [0.0065, 0.0065],
          dark,
          { nu: 6, nv: 28, mat: gloss },
        );
        tube(
          b,
          (t) => {
            const z = lerp(faceZ(0.075, 0.27, 0.006), -0.02, t);
            return [s * lerp(0.122, 0.2, Math.sqrt(t)), 0.275, z];
          },
          () => [0.005, 0.005],
          dark,
          { nu: 5, nv: 5, ref: () => [0, 1, 0], mat: gloss },
        );
      }
      tube(
        b,
        (t) => {
          const x = lerp(-0.03, 0.03, t);
          return [x, 0.276 + Math.sin(t * Math.PI) * 0.008, faceZ(0, 0.27, 0.017)];
        },
        () => [0.0055, 0.0055],
        dark,
        { nu: 5, nv: 5, mat: gloss },
      );
    }
    if (look.earrings)
      for (const s of [-1, 1])
        ell(b, [s * 0.205, 0.175, 0.005], [0.017, 0.017, 0.017], '#ffd166', { seg: 6, mat: gloss });

    // Headgear: a band arching over the hair between two ear pieces.
    const crown = HAIR_TOP[style] ?? 1.1;
    /**
     * @param {string} color @param {number} ax Half width at the ears.
     * @param {number} r1 Radial thickness. @param {number} r2 Band width. @param {number} z
     */
    const band = (color, ax, r1, r2, z) =>
      tube(
        b,
        (t) => {
          const a = lerp(-Math.PI / 2, Math.PI / 2, t);
          return [ax * Math.sin(a), HEAD_C[1] + (HEAD_R[1] * crown + r1) * Math.cos(a), z];
        },
        () => [r1, r2],
        color,
        { nu: 8, nv: 22, mat: gloss },
      );
    if (look.headset) {
      // Call headset: slim band, pads on both ears, a boom mic swinging to the mouth.
      const c = look.headset;
      band(c, 0.226, 0.006, 0.011, -0.02);
      for (const s of [-1, 1]) {
        ell(b, [s * 0.222, 0.245, -0.008], [0.02, 0.044, 0.044], shade(c, 0.25), { seg: 9 });
        ell(b, [s * 0.236, 0.245, -0.008], [0.014, 0.036, 0.036], c, { seg: 8, mat: gloss });
      }
      ell(b, [-0.249, 0.255, 0.008], [0.004, 0.006, 0.006], '#c6f432', {
        seg: 4,
        mat: MAT.EMISSIVE,
      });
      tube(
        b,
        (t) => {
          const x = lerp(-0.238, -0.06, t);
          const y = lerp(0.232, 0.162, t ** 1.4);
          return [x, y, Math.max(lerp(0.0, 0.17, t), faceZ(x, y, 0.03))];
        },
        (t) => [0.0055 - 0.0015 * t, 0.0055 - 0.0015 * t],
        c,
        { nu: 6, nv: 14, ref: () => [0, 1, 0], mat: gloss },
      );
      ell(b, [-0.052, 0.16, faceZ(-0.052, 0.16, 0.03)], [0.016, 0.013, 0.013], '#2a2a32', {
        seg: 6,
      });
    }
    if (look.headphones) {
      // Studio headphones: padded band, plush cushions and big cups with a lime ring.
      const c = look.headphones;
      band(c, 0.27, 0.011, 0.02, -0.01);
      tube(
        b,
        (t) => {
          const a = lerp(-0.75, 0.75, t);
          const ry = HEAD_R[1] * crown - 0.001;
          return [0.27 * Math.sin(a) * 0.93, HEAD_C[1] + ry * Math.cos(a), -0.01];
        },
        () => [0.008, 0.017],
        '#3a3a46',
        { nu: 8, nv: 12 },
      );
      for (const s of [-1, 1]) {
        ell(b, [s * 0.248, 0.24, -0.01], [0.024, 0.07, 0.064], '#3a3a46', { seg: 10 });
        ell(b, [s * 0.27, 0.24, -0.01], [0.026, 0.068, 0.06], c, { seg: 10, mat: gloss });
        tube(
          b,
          (t) => {
            const a = t * TAU;
            return [s * 0.291, 0.24 + Math.sin(a) * 0.04, -0.01 + Math.cos(a) * 0.035];
          },
          () => [0.005, 0.005],
          '#c6f432',
          { nu: 5, nv: 18, ref: () => [1, 0, 0], mat: gloss },
        );
      }
    }

    // Hair: one smooth shell melting into the skull, shaped per style.
    /** @param {number} v */
    const melt = (v) => 0.25 + 0.75 * smooth(0, 0.3, v);
    if (style === 'short')
      shell(b, hair, {
        nu: 36,
        nv: 14,
        lat: hairline(0.8, 0.28, -0.62, 0.5, 1.25),
        push: (d, _u, v) =>
          melt(v) *
          (0.08 + bump(d, dir(0.2, 0.66, 0.72), 0.08, 0.06) + bump(d, dir(0, 1, 0), 0.05, 0.2)),
        mat: gloss,
      });
    else if (style === 'quiff')
      shell(b, hair, {
        nu: 40,
        nv: 16,
        lat: hairline(0.76, 0.28, -0.62, 0.5, 1.25),
        push: (d, _u, v) =>
          0.07 * melt(v) +
          smooth(0, 0.12, v) *
            (bump(d, dir(0.12, 0.82, 0.56), 0.36, 0.05) +
              bump(d, dir(-0.18, 0.74, 0.64), 0.14, 0.04) +
              bump(d, dir(0, 1, -0.3), 0.05, 0.2)),
        mat: gloss,
      });
    else if (style === 'curly') {
      const line = hairline(0.72, 0.22, -0.55, 0.5, 1.25);
      shell(b, hair, {
        nu: 40,
        nv: 14,
        lat: line,
        push: (d, _u, v) => melt(v) * (0.09 + bump(d, dir(0, 0.8, 0.6), 0.05, 0.1)),
        mat: gloss,
      });
      // Springy curls scattered over the cap (golden-angle spiral).
      for (let i = 0; i < 64; i++) {
        const y = 1 - (i + 0.5) / 64;
        const lon = i * 2.39996;
        const lat = Math.asin(y);
        if (lat < line(lon)[0] + 0.1) continue;
        const d = [Math.cos(lat) * Math.sin(lon), y, Math.cos(lat) * Math.cos(lon)];
        const k = 1.02 + 0.02 * (i % 3);
        ell(
          b,
          [0, 1, 2].map((j) => HEAD_C[j] + d[j] * HEAD_R[j] * k),
          [0.046, 0.043, 0.046],
          shade(hair, (i % 3) * 0.05 - 0.04),
          { seg: 6, mat: gloss },
        );
      }
    } else if (style === 'long' || style === 'bob') {
      const bob = style === 'bob';
      shell(b, hair, {
        nu: 44,
        nv: 18,
        lat: hairline(0.82, bob ? -0.62 : -0.5, -0.82, 0.58, 1.08),
        push: (d, _u, v) => {
          const lat = Math.asin(d[1]);
          const side = Math.abs(d[0]) + Math.max(0, -d[2]);
          return (
            melt(v) *
            (0.07 +
              bump(d, bob ? dir(0, 0.6, 0.8) : dir(-0.35, 0.62, 0.7), bob ? 0.06 : 0.1, 0.05) +
              (bob ? 0.14 : 0.07) * smooth(0.3, -0.45, lat) * Math.min(1, side))
          );
        },
        mat: gloss,
      });
      if (!bob)
        // Locks framing the face down to the shoulders.
        for (const s of [-1, 1])
          loft(
            b,
            profile([
              [-0.07, 0.0, 0.0, -0.01, 2, s * 0.17],
              [-0.05, 0.04, 0.06, -0.01, 2, s * 0.175],
              [0.06, 0.05, 0.085, -0.02, 2, s * 0.19],
              [0.18, 0.045, 0.1, -0.02, 2, s * 0.2],
              [0.26, 0.03, 0.08, -0.03, 2, s * 0.19],
            ]),
            hair,
            { seg: 12, steps: 3, mat: gloss },
          );
    } else if (style === 'midlong') {
      // Shoulder-length cut: a full cap with a side sweep, tucked behind the ears,
      // ends flicking out at the shoulders, warm highlights combed through.
      const line = hairline(0.82, 0.2, -0.82, 0.58, 1.12);
      /** @param {number[]} d @param {number} v */
      const push = (d, v) => {
        const lat = Math.asin(d[1]);
        const back = Math.max(0, -d[2]);
        return (
          melt(v) *
          (0.075 +
            bump(d, dir(-0.4, 0.6, 0.7), 0.11, 0.05) +
            bump(d, dir(0, 0.9, 0.2), 0.04, 0.2) +
            0.1 * smooth(0.25, -0.5, lat) * Math.min(1, back * 1.6))
        );
      };
      shell(b, hair, { nu: 44, nv: 18, lat: line, push: (d, _u, v) => push(d, v), mat: gloss });
      const light = shade(hair, 0.2);
      for (const l of [-2.5, -1.25, -0.62, 0.42, 1.0, 1.9, 2.75])
        shell(b, light, {
          nu: 3,
          nv: 16,
          lon: [l - 0.07, l + 0.07],
          lat: line,
          push: (d, _u, v) => push(d, v) + 0.012 * smooth(0, 0.15, v),
          mat: gloss,
        });
      // Locks hanging behind the ears to the shoulders, flicking outwards.
      for (const s of [-1, 1]) {
        const L = profile([
          [-0.03, 0.0, 0.0, -0.075, 2, s * 0.215],
          [-0.018, 0.05, 0.062, -0.075, 2, s * 0.222],
          [0.04, 0.046, 0.072, -0.08, 2, s * 0.2],
          [0.15, 0.042, 0.085, -0.075, 2, s * 0.195],
          [0.26, 0.03, 0.08, -0.06, 2, s * 0.185],
        ]);
        loft(b, L, hair, { seg: 12, steps: 3, mat: gloss });
        loft(b, L, light, {
          seg: 3,
          steps: 3,
          t0: 0.4,
          dr: 0.003,
          arc: () => [s * 1.25, s * 1.55],
          mat: gloss,
        });
      }
    } else if (style === 'bun' || style === 'ponytail') {
      shell(b, hair, {
        nu: 36,
        nv: 14,
        lat: hairline(0.8, 0.25, -0.62, 0.5, 1.25),
        push: (d, _u, v) =>
          melt(v) *
          (0.07 + bump(d, dir(0.3, 0.6, 0.74), 0.05, 0.05) + bump(d, dir(0, 1, 0), 0.03, 0.2)),
        mat: gloss,
      });
      if (style === 'bun') {
        ell(b, [0, 0.47, -0.12], [0.085, 0.08, 0.085], hair, { seg: 10, mat: gloss });
        ell(b, [0, 0.43, -0.1], [0.06, 0.03, 0.06], shade(hair, 0.25), { seg: 6 });
      } else ell(b, [0, 0.33, -0.205], [0.04, 0.035, 0.03], '#ff6b8b', { seg: 7, mat: gloss });
    }
  });

  // Face features are separate small parts riding on the head transform, so they
  // can blink and change with the mood. Eyes: dark ovals with a catch-light.
  const front = /** @type {number[]} */ ([-1.7, 1.7]);
  const eyeColor = look.eyes ?? '#2a2236';
  const eyes = part(gl, (b) => {
    for (const s of [-1, 1]) {
      ell(b, [s * 0.072, EYE_Y, 0.172], [0.028, female ? 0.038 : 0.034, 0.02], eyeColor, {
        seg: 9,
        lon: front,
      });
      ell(b, [s * 0.064 + 0.006, EYE_Y + 0.014, 0.188], [0.009, 0.009, 0.006], '#ffffff', {
        seg: 5,
        lon: front,
        mat: MAT.EMISSIVE,
      });
      if (female)
        // Lashes flicking out of the outer corner.
        tube(
          b,
          (t) => {
            const x = s * lerp(0.088, 0.112, t);
            const y = EYE_Y + 0.026 + t * 0.012;
            return [x, y, faceZ(x, y, 0.002)];
          },
          (t) => [0.005 * (1 - t * 0.6), 0.004],
          dark,
          { nu: 5, nv: 3 },
        );
    }
  });
  // Squeezed "> <" eyes for the ouch face.
  const squint = part(gl, (b) => {
    for (const s of [-1, 1])
      tube(
        b,
        (t) => {
          const k = 1 - Math.abs(2 * t - 1);
          const x = s * lerp(0.098, 0.052, k ** 0.9);
          const y = EYE_Y + 0.002 + (1 - 2 * t) * 0.02 * (1 - 0.15 * k);
          return [x, y, faceZ(x, y, 0.004)];
        },
        (t) => [0.0085 * (0.75 + 0.25 * Math.sin(t * Math.PI)), 0.005],
        eyeColor,
        { nu: 6, nv: 12 },
      );
  });
  const cheeks = part(gl, (b) => {
    for (const s of [-1, 1])
      ell(b, [s * 0.12, 0.2, 0.148], [0.035, 0.022, 0.02], '#f19a92', { seg: 6, lon: front });
  });

  // Arched brows (hair-coloured, finer for female characters): `lift` raises them,
  // `tilt` raises the inner end (negative frowns), `arch` bends them.
  const bw = female ? 0.0065 : 0.011;
  const browColor = female ? dark : style === 'bald' ? shade(look.skin, -0.45) : hair;
  /** @param {number} lift @param {number} tilt @param {number} arch */
  const brows = (lift, tilt, arch) =>
    part(gl, (b) => {
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const x = s * lerp(0.04, 0.112, t);
            const y = 0.33 + lift + tilt * (1 - t) + Math.sin(t * Math.PI) * arch - t * 0.006;
            return [x, y, faceZ(x, y, 0.004)];
          },
          (t) => [bw * (0.75 + 0.35 * Math.sin(t * Math.PI * 0.9 + 0.2)), 0.007],
          browColor,
          { nu: 6, nv: 7 },
        );
    });

  // Mouths, one per mood. Lipstick looks keep their colour; bearded ones sit a little
  // lower so they peek out under the moustache.
  const lips = look.lips;
  const my = look.beard ? 0.146 : 0.153;
  const mouthDark = '#5c2333';
  const lineColor = '#8c4a3c';
  const mouthNeutral = part(gl, (b) => {
    if (lips)
      ell(b, [0, 0.155, 0.166], [0.048, 0.016, 0.02], lips, {
        seg: 8,
        lon: [-1.8, 1.8],
        mat: gloss,
      });
    else
      tube(
        b,
        (t) => {
          const x = lerp(-0.036, 0.036, t);
          const y = 0.152 + 0.012 * (2 * t - 1) ** 2;
          return [x, y, faceZ(x, y, 0.002)];
        },
        (t) => [0.0065 * (0.45 + 0.55 * Math.sin(t * Math.PI)), 0.004],
        lineColor,
        { nu: 5, nv: 8 },
      );
  });
  /** Open grin outline: flat-ish top, round bottom, corners curling up. @param {number} w @param {number} h */
  const grin = (w, h) => /** @param {number} a */ (a) => {
    const c = Math.cos(a),
      sn = Math.sin(a);
    return [w * c, (sn > 0 ? 0.18 * h * sn : h * sn) + 0.45 * h * c * c];
  };
  const mouthHappy = part(gl, (b) => {
    const w = look.beard ? 0.04 : 0.046,
      h = look.beard ? 0.03 : 0.04;
    const cy = my + 0.004;
    if (lips) decal(b, 0, cy, grin(w + 0.008, h + 0.009), 0.002, 0.002, lips, { mat: gloss });
    decal(b, 0, cy, grin(w, h), 0.004, 0.001, mouthDark, { nu: 22 });
    // Tongue at the bottom, a strip of teeth along the top.
    decal(
      b,
      0,
      cy - h * 0.62,
      (a) => [w * 0.5 * Math.cos(a), h * 0.3 * Math.sin(a)],
      0.005,
      0.001,
      '#e86f7e',
    );
    decal(
      b,
      0,
      cy + h * 0.02,
      (a) => {
        const c = Math.cos(a),
          sn = Math.sin(a);
        return [w * 0.78 * c, (sn > 0 ? 0.16 * h * sn : 0.2 * h * sn) + 0.3 * h * c * c];
      },
      0.0055,
      0.001,
      '#ffffff',
    );
  });
  const mouthOuch = part(gl, (b) => {
    const cy = my - 0.004;
    /** @param {number} w @param {number} h */
    const oval = (w, h) => /** @param {number} a */ (a) => [w * Math.cos(a), h * Math.sin(a)];
    decal(b, 0, cy, oval(0.023, 0.025), 0.002, 0.002, lips ?? shade(look.skin, -0.22), {
      mat: lips ? gloss : MAT.MATTE,
    });
    decal(b, 0, cy, oval(0.015, 0.017), 0.004, 0.001, mouthDark);
  });
  const mouthFocus = part(gl, (b) => {
    if (lips)
      ell(b, [0, 0.153, 0.166], [0.04, 0.0105, 0.02], lips, {
        seg: 8,
        lon: [-1.8, 1.8],
        mat: gloss,
      });
    else
      tube(
        b,
        (t) => {
          const x = lerp(-0.032, 0.032, t);
          const y = 0.15 - 0.004 * (2 * t - 1) ** 2;
          return [x, y, faceZ(x, y, 0.002)];
        },
        (t) => [0.006 * (0.5 + 0.5 * Math.sin(t * Math.PI)), 0.004],
        lineColor,
        { nu: 5, nv: 8 },
      );
  });

  // Long hair down the back, as its own part so it sways with the body.
  const longHair =
    style === 'long'
      ? part(gl, (b) =>
          loft(
            b,
            profile([
              [-0.37, 0.0, 0.0, -0.04],
              [-0.355, 0.12, 0.05, -0.04],
              [-0.3, 0.17, 0.07, -0.035],
              [-0.12, 0.19, 0.08, -0.03],
              [0.0, 0.2, 0.085, -0.02],
              [0.06, 0.18, 0.08, -0.02],
            ]),
            hair,
            { seg: 22, steps: 3, mat: gloss },
          ),
        )
      : style === 'midlong'
        ? part(gl, (b) => {
            // Shoulder-length back, flaring into a soft outward flick at the ends.
            const H = profile([
              [-0.3, 0.0, 0.0, -0.03],
              [-0.292, 0.16, 0.06, -0.03],
              [-0.262, 0.215, 0.08, -0.03],
              [-0.18, 0.192, 0.08, -0.03],
              [-0.05, 0.2, 0.085, -0.02],
              [0.06, 0.18, 0.08, -0.02],
            ]);
            loft(b, H, hair, { seg: 24, steps: 3, mat: gloss });
            const light = shade(hair, 0.2);
            for (const a of [Math.PI - 0.95, Math.PI - 0.3, Math.PI + 0.4, Math.PI + 1.05])
              loft(b, H, light, {
                seg: 3,
                steps: 3,
                t0: 0.8,
                dr: 0.003,
                arc: () => [a - 0.09, a + 0.09],
                mat: gloss,
              });
          })
        : style === 'ponytail'
          ? part(gl, (b) =>
              tube(
                b,
                (t) => [0, 0.04 - t * 0.3, -0.11 - Math.sin(t * 2.4) * 0.07],
                (t) => {
                  const r =
                    0.05 * Math.sin(Math.min(1, t * 3 + 0.25) * Math.PI * 0.5) * (1 - 0.75 * t);
                  return [r, r * 0.85];
                },
                hair,
                { nu: 12, nv: 12, ref: () => [1, 0, 0], mat: gloss },
              ),
            )
          : null;

  // Torso: origin at the hip; tailored jacket open in a V over the shirt.
  const yb = female ? 0.27 : 0.255; // Button point, where the V closes.
  const jacketKeys = female
    ? [
        [0.03, 0.16, 0.1],
        [0.05, 0.226, 0.154, 0, 2.2],
        [0.12, 0.208, 0.142, 0, 2.2],
        [0.2, 0.166, 0.114, 0, 2.3],
        [0.3, 0.195, 0.128, 0.008, 2.4],
        [0.4, 0.205, 0.122, 0, 2.6],
        [0.47, 0.215, 0.112, 0, 2.6],
        [0.505, 0.18, 0.094],
        [0.535, 0.085, 0.07],
        [0.548, 0.062, 0.058],
      ]
    : [
        [-0.03, 0.13, 0.09],
        [0.0, 0.188, 0.125, 0, 2.2],
        [0.07, 0.182, 0.12, 0, 2.3],
        [0.16, 0.18, 0.12, 0, 2.4],
        [0.28, 0.205, 0.132, 0.006, 2.5],
        [0.38, 0.222, 0.13, 0, 2.7],
        [0.46, 0.238, 0.12, 0, 2.8],
        [0.505, 0.2, 0.1],
        [0.535, 0.088, 0.072],
        [0.548, 0.062, 0.058],
      ];
  const J = profile(jacketKeys);
  /** V half-angle at height y. @param {number} y */
  const vee = (y) => 0.5 * smooth(yb, 0.5, y) ** 0.8;
  const lapelColor = shade(look.jacket, luma(look.jacket) < 0.25 ? 0.14 : -0.14);
  const torso = part(gl, (b) => {
    loft(b, J, look.jacket, {
      seg: 36,
      steps: 3,
      arc: (r) => {
        const a = vee(r[0]);
        return [a, TAU - a];
      },
    });
    // Shirt filling the V, set back inside the jacket.
    const ts = J.tAt(yb - 0.03);
    if (look.dress) {
      // Top of the dress in the V, with a soft scoop neckline showing the skin.
      const dress = look.dress;
      /** @param {number} y */
      const scoop = (y) => 0.42 * smooth(0.4, 0.53, y) ** 0.7;
      loft(b, J, look.skin, {
        seg: 12,
        steps: 3,
        t0: J.tAt(0.38),
        dr: -0.012,
        arc: () => [-0.75, 0.75],
      });
      for (const s of [-1, 1])
        loft(b, J, dress, {
          seg: 8,
          steps: 3,
          t0: ts,
          dr: -0.01,
          arc: (r) => (s > 0 ? [scoop(r[0]), 0.75] : [-0.75, -scoop(r[0])]),
        });
    } else
      loft(b, J, look.shirt, { seg: 12, steps: 3, t0: ts, dr: -0.01, arc: () => [-0.75, 0.75] });
    if (look.openCollar) {
      // Top button undone: a small V of skin at the throat, and a buttoned placket below.
      loft(b, J, look.skin, {
        seg: 8,
        steps: 4,
        t0: J.tAt(0.47),
        dr: -0.0075,
        arc: (r) => {
          const w = 0.34 * smooth(0.47, 0.545, r[0]);
          return [-w, w];
        },
      });
      for (const y of [0.35, 0.42])
        ell(
          b,
          ringPoint(J.row(J.tAt(y)), 0, -0.008),
          [0.006, 0.006, 0.003],
          shade(look.shirt, -0.18),
          {
            seg: 4,
            lon: [-1.6, 1.6],
          },
        );
    }
    // Lapels rolling along both edges of the V, widest at the chest; a cardigan has a
    // flat knitted button band instead.
    if (look.cardigan)
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const y = lerp(jacketKeys[1][0] + 0.01, 0.535, t);
            const r = J.row(J.tAt(y));
            return ringPoint(r, s * (vee(y) + 0.011 / r[1]), 0.002);
          },
          () => [0.011, 0.004],
          lapelColor,
          {
            nu: 6,
            nv: 14,
            ref: (t) => {
              const a = s * vee(lerp(jacketKeys[1][0] + 0.01, 0.535, t));
              return [Math.sin(a), 0, Math.cos(a)];
            },
          },
        );
    else
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const y = lerp(yb, 0.535, t);
            const r = J.row(J.tAt(y));
            const w = 0.008 + 0.024 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.75);
            return ringPoint(r, s * (vee(y) + (w * 0.9) / r[1]), 0.002);
          },
          (t) => [0.008 + 0.024 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.75), 0.0055],
          lapelColor,
          {
            nu: 8,
            nv: 12,
            ref: (t) => {
              const a = s * vee(lerp(yb, 0.535, t));
              return [Math.sin(a), 0, Math.cos(a)];
            },
          },
        );
    // Shirt collar points either side of the throat.
    const open = look.openCollar ? 1 : 0;
    if (!look.dress && !look.turtleneck)
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const y = lerp(0.545, 0.49 - 0.02 * open, t);
            const r = J.row(J.tAt(y));
            return ringPoint(r, s * lerp(0.15 + 0.2 * open, 0.4 + 0.12 * open, t), -0.004);
          },
          (t) => [(0.016 + 0.004 * open) * (1 - 0.7 * t), 0.004],
          shade(look.shirt, -0.04),
          { nu: 6, nv: 5, ref: () => [0, 0, 1] },
        );
    if (look.turtleneck) {
      // Rolled ribbed collar hugging the neck.
      const T = profile([
        [0.462, 0.066, 0.064, -0.004],
        [0.49, 0.078, 0.075, -0.004],
        [0.53, 0.075, 0.072, -0.004],
        [0.575, 0.066, 0.064, -0.006],
        [0.59, 0.056, 0.054, -0.006],
      ]);
      loft(b, T, look.shirt, { seg: 24, steps: 3 });
      for (let k = 0; k < 18; k++) {
        const a = (k + 0.5) * (TAU / 18);
        loft(b, T, shade(look.shirt, -0.07), {
          seg: 1,
          steps: 3,
          t0: 0.4,
          t1: 3.6,
          dr: 0.002,
          arc: () => [a - 0.03, a + 0.03],
        });
      }
    }
    if (look.badge) {
      // Lanyard from behind the neck down to a clipped ID badge.
      const zf = /** @param {number} y */ (y) => {
        const r = J.row(J.tAt(y));
        return r[2] + r[3];
      };
      for (const s of [-1, 1])
        tube(
          b,
          (t) => {
            const y = lerp(0.552, 0.37, t);
            return ringPoint(J.row(J.tAt(y)), s * lerp(1.4, 0.06, t ** 0.6), 0.008);
          },
          () => [0.0075, 0.0028],
          look.badge,
          {
            nu: 6,
            nv: 14,
            ref: (t) => {
              const a = s * lerp(1.4, 0.06, t ** 0.6);
              return [Math.sin(a), 0, Math.cos(a)];
            },
          },
        );
      // A clear holder edged in the lanyard colour, the card: header, photo, name lines.
      const zc = zf(0.31) + 0.017;
      ell(b, [0, 0.372, zf(0.372) + 0.01], [0.012, 0.012, 0.007], '#b9bec8', {
        seg: 5,
        mat: gloss,
      });
      b.roundedBox([0, 0.31, zc - 0.002], [0.046, 0.058, 0.003], 0.004, look.badge, { seg: 3 });
      b.roundedBox([0, 0.307, zc], [0.04, 0.05, 0.0035], 0.003, '#ffffff', { seg: 3 });
      b.roundedBox([0, 0.346, zc + 0.0015], [0.04, 0.011, 0.0035], 0.003, '#22346e', { seg: 2 });
      b.roundedBox([-0.017, 0.31, zc + 0.002], [0.013, 0.016, 0.002], 0.002, '#9fb4d8', {
        seg: 2,
      });
      ell(b, [-0.017, 0.313, zc + 0.004], [0.006, 0.007, 0.002], look.skin, { seg: 4 });
      for (const [y, w] of [
        [0.32, 0.014],
        [0.305, 0.01],
      ])
        b.roundedBox([0.014, y, zc + 0.002], [w, 0.003, 0.0015], 0.0015, '#5a6478', { seg: 2 });
      b.roundedBox([0, 0.274, zc + 0.002], [0.028, 0.005, 0.0015], 0.0015, look.badge, { seg: 2 });
    }
    if (look.backpack) {
      // Straps over the shoulders with a buckle, the pack sitting on the back.
      const bp = look.backpack;
      const strap = spline([
        [0.18, 1.2],
        [0.32, 0.84],
        [0.45, 0.6],
        [0.515, 0.66],
        [0.535, 1.57],
        [0.515, 2.45],
        [0.47, 2.55],
        [0.42, 2.6],
      ]);
      for (const s of [-1, 1]) {
        tube(
          b,
          (t) => {
            const [y, a] = strap(t * 7);
            return ringPoint(J.row(J.tAt(y)), s * a, 0.007);
          },
          () => [0.02, 0.005],
          shade(bp, -0.25),
          {
            nu: 6,
            nv: 32,
            ref: (t) => {
              const a = s * strap(t * 7)[1];
              return [Math.sin(a), 0, Math.cos(a)];
            },
          },
        );
        const [y, a] = strap(1.5);
        ell(b, ringPoint(J.row(J.tAt(y)), s * a, 0.013), [0.022, 0.013, 0.006], '#2a2a32', {
          seg: 5,
          rot: [0, s * a, 0],
          mat: gloss,
        });
      }
      const r = J.row(J.tAt(0.3));
      const zb = r[3] - r[2];
      b.roundedBox([0, 0.3, zb - 0.045], [0.135, 0.145, 0.05], 0.045, bp, { seg: 4 });
      b.roundedBox([0, 0.22, zb - 0.1], [0.1, 0.065, 0.022], 0.02, shade(bp, -0.12), { seg: 3 });
      tube(
        b,
        (t) => [lerp(-0.08, 0.08, t), 0.268, zb - 0.124],
        () => [0.003, 0.003],
        '#2a2a32',
        { nu: 4, nv: 4, ref: () => [0, 1, 0] },
      );
      tube(
        b,
        (t) => {
          const a = lerp(-Math.PI / 2, Math.PI / 2, t);
          return [Math.sin(a) * 0.035, 0.445 + Math.cos(a) * 0.025, zb - 0.045];
        },
        () => [0.006, 0.008],
        shade(bp, -0.25),
        { nu: 5, nv: 8 },
      );
    }
    if (look.tie) {
      const tieZ = /** @param {number} y */ (y) => J.row(J.tAt(y))[2] + J.row(J.tAt(y))[3] - 0.004;
      ell(b, [0, 0.49, tieZ(0.49) + 0.008], [0.022, 0.02, 0.014], look.tie, { seg: 6, mat: gloss });
      tube(
        b,
        (t) => {
          const y = lerp(0.475, yb - 0.02, t);
          return [0, y, tieZ(y)];
        },
        (t) => [0.012 + 0.016 * t - 0.02 * smooth(0.82, 1, t), 0.004],
        look.tie,
        { nu: 6, nv: 8, mat: gloss },
      );
    }
    // Closed front below the V: a seam and two buttons.
    tube(
      b,
      (t) => {
        const y = lerp(yb, jacketKeys[1][0] + 0.005, t);
        return ringPoint(J.row(J.tAt(y)), 0, 0.001);
      },
      () => [0.0035, 0.002],
      shade(look.jacket, -0.3),
      { nu: 4, nv: 4, ref: () => [1, 0, 0] },
    );
    if (look.cardigan) {
      // Small buttons down the band, a ribbed welt at the hem.
      for (let k = 0; k < 4; k++) {
        const y = lerp(0.4, jacketKeys[1][0] + 0.09, k / 3);
        const r = J.row(J.tAt(y));
        const p = ringPoint(r, y > yb ? -(vee(y) + 0.011 / r[1]) : 0, 0.007);
        ell(b, p, [0.008, 0.008, 0.004], shade(look.jacket, 0.55), { seg: 5, lon: [-1.6, 1.6] });
      }
      loft(b, J, lapelColor, { seg: 36, steps: 2, t0: 0, t1: J.tAt(0.045), dr: 0.003 });
      for (let k = 0; k < 28; k++) {
        const a = (k + 0.5) * (TAU / 28);
        loft(b, J, shade(lapelColor, -0.12), {
          seg: 1,
          steps: 2,
          t0: 0.05,
          t1: J.tAt(0.04),
          dr: 0.0045,
          arc: () => [a - 0.012, a + 0.012],
        });
      }
    } else
      for (const y of female ? [yb - 0.035] : [yb - 0.035, yb - 0.11]) {
        const p = ringPoint(J.row(J.tAt(y)), 0, 0.004);
        ell(b, p, [0.012, 0.012, 0.006], shade(look.jacket, -0.35), { seg: 5, lon: [-1.6, 1.6] });
      }
    // Hips in trousers (hidden under a skirt), and the neck.
    if (!skirted) ell(b, [0, 0.03, 0], [0.17, 0.08, 0.108], look.legs, { seg: 8 });
    // Cat paw prints scattered over the jacket, clear of the V and the button line.
    if (look.paws)
      for (const [a, y, tilt] of [
        [-0.62, 0.1, 0.25],
        [0.5, 0.2, -0.3],
        [1.05, 0.08, 0.15],
        [-1.05, 0.31, -0.2],
        [0.92, 0.4, 0.35],
        [-1.45, 0.14, 0.1],
        [1.55, 0.27, -0.15],
        [2.5, 0.2, 0.3],
        [-2.55, 0.36, -0.25],
        [3.05, 0.1, 0.1],
      ])
        pawPrint(b, J, a, y, 1.2, tilt, look.paws);
    loft(
      b,
      profile([
        [0.44, 0.05, 0.05],
        [0.6, 0.052, 0.05],
      ]),
      look.skin,
      { seg: 12, steps: 1 },
    );
  });

  const skirtColor = look.dress ?? look.skirt;
  const skirt = skirtColor
    ? part(gl, (b) => {
        const S = profile([
          [-0.25, 0.2, 0.13],
          [-0.24, 0.255, 0.17],
          [-0.15, 0.24, 0.16],
          [-0.04, 0.215, 0.145],
          [0.05, 0.2, 0.136],
        ]);
        loft(b, S, skirtColor, { seg: 32, steps: 3 });
      })
    : null;

  // Arm: origin at the shoulder, hanging down; tapered sleeve, cuff, mitten hand.
  const arm = part(gl, (b) => {
    ell(b, [0, -0.035, 0], [0.066, 0.056, 0.068], look.jacket, { seg: 9 });
    const sleeve = profile([
      [-0.358, 0.044, 0.046],
      [-0.352, 0.055, 0.057],
      [-0.3, 0.052, 0.054],
      [-0.18, 0.056, 0.058],
      [-0.06, 0.062, 0.064],
      [-0.02, 0.062, 0.064],
    ]);
    loft(b, sleeve, look.jacket, { seg: 16, steps: 2 });
    if (look.paws) pawPrint(b, sleeve, 0.35, -0.2, 0.85, 0.2, look.paws);
    if (look.cardigan)
      loft(
        b,
        profile([
          [-0.36, 0.047, 0.049],
          [-0.354, 0.058, 0.06],
          [-0.318, 0.056, 0.058],
          [-0.31, 0.05, 0.052],
        ]),
        shade(look.jacket, -0.12),
        { seg: 16, steps: 2 },
      );
    loft(
      b,
      profile([
        [-0.382, 0.036, 0.038],
        [-0.375, 0.046, 0.048],
        [-0.345, 0.046, 0.048],
      ]),
      look.dress ? look.skin : look.shirt,
      { seg: 14, steps: 2 },
    );
    // Mitten: palm and fingers in one rounded mass, thumb forward (shared by both arms).
    const hand = look.skin;
    ell(b, [0, -0.425, 0.0], [0.036, 0.056, 0.046], hand, { seg: 9 });
    ell(b, [0, -0.4, 0.04], [0.018, 0.032, 0.018], hand, { seg: 6, rot: [-0.5, 0, 0] });
  });

  // Leg: origin at the hip joint; tapered trousers with a hem, shoes with toe cap and sole.
  const lightShoes = luma(look.shoes) > 0.6;
  const sole = lightShoes ? '#c9ccd4' : shade(look.shoes, -0.55);
  const leg = part(gl, (b) => {
    if (skirted) {
      loft(
        b,
        profile([
          [-0.57, 0.03, 0.033],
          [-0.5, 0.034, 0.037],
          [-0.36, 0.044, 0.048],
          [-0.22, 0.05, 0.054],
          [0.0, 0.056, 0.058],
          [0.04, 0.03, 0.03],
          [0.05, 0.0, 0.0],
        ]),
        look.legs,
        { seg: 14, steps: 2 },
      );
      ell(b, [0, -0.587, 0.035], [0.046, 0.036, 0.09], look.shoes, {
        seg: 9,
        lat: [-0.1, Math.PI / 2],
        mat: gloss,
      });
      b.roundedBox([0, -0.613, 0.04], [0.045, 0.008, 0.085], 0.007, sole, { seg: 3 });
      b.roundedBox([0, -0.6, -0.04], [0.018, 0.022, 0.018], 0.012, look.shoes, {
        seg: 3,
        mat: gloss,
      });
    } else {
      const hem = look.crop
        ? [
            [-0.472, 0.052, 0.056],
            [-0.462, 0.062, 0.066],
            [-0.4, 0.064, 0.068],
          ]
        : [
            [-0.545, 0.054, 0.058],
            [-0.53, 0.07, 0.074],
            [-0.42, 0.066, 0.07],
          ];
      loft(
        b,
        profile([
          ...hem,
          [-0.24, 0.072, 0.077],
          [-0.05, 0.08, 0.084],
          [0.025, 0.07, 0.074],
          [0.055, 0.0, 0.0],
        ]),
        look.legs,
        { seg: 16, steps: 3 },
      );
      if (look.crop) {
        // Turned-up hem showing the lighter reverse of the denim, then bare ankles.
        loft(
          b,
          profile([
            [-0.479, 0.057, 0.061],
            [-0.473, 0.066, 0.07],
            [-0.452, 0.067, 0.071],
            [-0.444, 0.064, 0.068],
          ]),
          shade(look.legs, 0.2),
          { seg: 16, steps: 2 },
        );
        loft(
          b,
          profile([
            [-0.57, 0.034, 0.036],
            [-0.5, 0.035, 0.038],
            [-0.45, 0.04, 0.042],
          ]),
          look.skin,
          { seg: 12, steps: 2 },
        );
      }
      if (look.sneakers) {
        // Low-top leather sneaker: white upper, cupsole, laces, side stripe, heel tab.
        const up = look.shoes;
        /** Upper surface height. @param {number} x @param {number} z */
        const yUp = (x, z) =>
          -0.586 + 0.052 * Math.sqrt(Math.max(0, 1 - (x / 0.066) ** 2 - ((z - 0.03) / 0.108) ** 2));
        ell(b, [0, -0.586, 0.03], [0.066, 0.052, 0.108], up, {
          seg: 12,
          lat: [-0.25, Math.PI / 2],
          mat: gloss,
        });
        ell(b, [0, -0.592, 0.088], [0.061, 0.037, 0.058], shade(up, -0.035), {
          seg: 8,
          lon: [-1.9, 1.9],
          lat: [-0.2, Math.PI / 2],
          mat: gloss,
        });
        // Padded collar around the ankle.
        tube(
          b,
          (t) => {
            const a = t * TAU;
            return [Math.sin(a) * 0.045, -0.54 - 0.006 * Math.cos(a), -0.004 + Math.cos(a) * 0.05];
          },
          () => [0.009, 0.008],
          up,
          { nu: 6, nv: 16, ref: () => [0, 1, 0], mat: gloss },
        );
        b.roundedBox([0, -0.602, 0.032], [0.072, 0.016, 0.121], 0.014, '#f3f4f7', { seg: 4 });
        b.roundedBox([0, -0.616, 0.032], [0.0725, 0.0055, 0.1215], 0.005, '#b9bec8', { seg: 3 });
        for (let k = 0; k < 3; k++) {
          const z = 0.05 + k * 0.02;
          tube(
            b,
            (t) => {
              const x = lerp(-0.021, 0.021, t);
              return [x, yUp(x, z) + 0.003, z];
            },
            () => [0.004, 0.004],
            '#d4d8e0',
            { nu: 5, nv: 5, ref: () => [0, 0, 1] },
          );
        }
        for (const s of [-1, 1])
          tube(
            b,
            (t) => {
              const z = lerp(-0.05, 0.075, t);
              const y = lerp(-0.562, -0.597, t) + 0.006 * Math.sin(t * Math.PI);
              const k = 1 - ((y + 0.586) / 0.052) ** 2 - ((z - 0.03) / 0.108) ** 2;
              return [s * (0.066 * Math.sqrt(Math.max(0, k)) + 0.0015), y, z];
            },
            (t) => [0.0065 * (1 - 0.65 * t), 0.003],
            look.stripe ?? '#22346e',
            { nu: 5, nv: 10, ref: () => [1, 0, 0] },
          );
        b.roundedBox([0, -0.552, -0.062], [0.014, 0.02, 0.008], 0.007, '#c6f432', { seg: 3 });
      } else {
        ell(b, [0, -0.588, 0.03], [0.072, 0.058, 0.112], look.shoes, {
          seg: 10,
          lat: [-0.2, Math.PI / 2],
          mat: gloss,
        });
        ell(
          b,
          [0, -0.592, 0.085],
          [0.068, 0.046, 0.062],
          shade(look.shoes, lightShoes ? -0.06 : 0.1),
          {
            seg: 8,
            lon: [-1.9, 1.9],
            lat: [-0.2, Math.PI / 2],
            mat: gloss,
          },
        );
        b.roundedBox([0, -0.608, 0.032], [0.074, 0.013, 0.118], 0.011, sole, { seg: 3 });
      }
    }
  });

  /** @type {Part | null} */
  let prop = null;
  if (look.prop === 'phone')
    prop = part(gl, (b) => {
      b.roundedBox([0, 0, 0], [0.035, 0.07, 0.008], 0.008, dark, { mat: gloss });
      b.roundedBox([0, 0, 0.007], [0.028, 0.06, 0.002], 0.002, '#58d5ff', { mat: MAT.EMISSIVE });
    });
  else if (look.prop === 'tablet')
    prop = part(gl, (b) => {
      b.roundedBox([0, 0, 0], [0.12, 0.16, 0.012], 0.012, dark);
      b.roundedBox([0, 0, 0.011], [0.1, 0.14, 0.002], 0.002, '#4cc9f0', { mat: MAT.EMISSIVE });
    });
  else if (look.prop === 'folder')
    prop = part(gl, (b) => b.roundedBox([0, 0, 0], [0.11, 0.15, 0.015], 0.01, '#ffd166'));
  else if (look.prop === 'mug') {
    // Coffee mug kept level whatever the arm does: glazed body, rim, handle, coffee.
    prop = part(gl, (b) => {
      const c = [0, -0.035, 0.015];
      b.lathe(
        c,
        [
          [0.0, 0.0],
          [0.036, 0.0],
          [0.042, 0.008],
          [0.044, 0.07],
          [0.046, 0.08],
        ],
        '#fbfbfd',
        { mat: gloss },
      );
      b.lathe(
        c,
        [
          [0.046, 0.08],
          [0.04, 0.081],
          [0.039, 0.074],
        ],
        '#e6e8ee',
      );
      b.lathe(
        c,
        [
          [0.039, 0.072],
          [0.0, 0.072],
        ],
        '#5a3420',
        { mat: gloss },
      );
      b.lathe(
        c,
        [
          [0.0441, 0.03],
          [0.0446, 0.05],
        ],
        '#7a4fd6',
      );
      tube(
        b,
        (t) => {
          const a = lerp(-1.25, 1.25, t) * 1.15;
          return [0.042 + Math.cos(a) * 0.022, c[1] + 0.04 + Math.sin(a) * 0.024, c[2]];
        },
        () => [0.006, 0.0075],
        '#fbfbfd',
        { nu: 6, nv: 12, mat: gloss },
      );
    });
    prop.upright = true;
  }

  /** @type {Record<string, Part>} */
  const parts = {
    head,
    torso,
    armL: arm,
    armR: arm,
    legL: leg,
    legR: leg,
    eyes,
    squint,
    cheeks,
    browNeutral: brows(0, 0, 0.012),
    browHappy: brows(0.012, -0.002, 0.018),
    browOuch: brows(0.004, 0.014, 0.006),
    browFocus: brows(-0.008, -0.014, 0.008),
    mouthNeutral,
    mouthHappy,
    mouthOuch,
    mouthFocus,
  };
  if (longHair) parts.hair = longHair;
  if (skirt) parts.skirt = skirt;
  if (prop) parts.prop = prop;
  return parts;
}

/**
 * @typedef {Object} Pose
 * @property {number} legL Swing angle (radians, + = forward).
 * @property {number} legR
 * @property {number} armL
 * @property {number} armR
 * @property {number} [armSpread] Sideways raise of both arms.
 * @property {number} [lean] Torso lean forward.
 * @property {number} [bob] Vertical body offset (1/16 tile).
 * @property {number} [head] Head nod.
 * @property {number} [squash] Vertical squash (−0.2..0.2).
 * @property {number} [blink] Eyelids, 0 = open, 1 = closed.
 * @property {'neutral'|'happy'|'ouch'|'focus'} [mood] Facial expression.
 */

const MOOD_NAMES = { neutral: 'Neutral', happy: 'Happy', ouch: 'Ouch', focus: 'Focus' };

/**
 * @typedef {import('./renderer.js').DrawItem} DrawItem
 * @typedef {{take: (mesh: Mesh, rim?: number, tint?: number[], noShadow?: boolean) => DrawItem, tint: (r: number, g: number, b: number) => number[]}} ItemSource
 * @typedef {{scale?: number, turn?: number, rim?: number, tint?: number[]}} PoseOptions
 */

/**
 * Recycles draw items, their model matrices and tints from frame to frame: reset()
 * when a frame starts, take() per item. Items stay valid until the next reset(), which
 * is enough for Renderer.render(), which consumes them synchronously.
 */
export class DrawPool {
  constructor() {
    /** @type {DrawItem[]} */
    this.list = [];
    this.n = 0;
    /** @type {number[][]} */
    this.tints = [];
    this.nt = 0;
  }

  reset() {
    this.n = this.nt = 0;
  }

  /**
   * An item whose model matrix the caller fills in.
   * @param {Mesh} mesh @param {number} [rim] @param {number[]} [tint] @param {boolean} [noShadow]
   * @returns {DrawItem}
   */
  take(mesh, rim, tint, noShadow) {
    let it = this.list[this.n++];
    if (it) {
      it.mesh = mesh;
      it.rim = rim;
      it.tint = tint;
      it.noShadow = noShadow;
    } else this.list.push((it = { mesh, model: new Float32Array(16), rim, tint, noShadow }));
    return it;
  }

  /** A per-frame colour. @param {number} r @param {number} g @param {number} b */
  tint(r, g, b) {
    const c = (this.tints[this.nt++] ??= [0, 0, 0]);
    c[0] = r;
    c[1] = g;
    c[2] = b;
    return c;
  }
}

/** Without a pool every item is new, so callers may keep them. @type {ItemSource} */
export const FRESH = {
  take: (mesh, rim, tint, noShadow) => ({ mesh, model: new Float32Array(16), rim, tint, noShadow }),
  tint: (r, g, b) => [r, g, b],
};

/** @type {Required<Omit<PoseOptions, 'tint'>> & PoseOptions} */
const OPTS = { scale: 1, turn: 1.05, rim: 0.35, tint: undefined };

/**
 * Shared poseCharacter options object, overwritten on every call (use it right away).
 * @param {number} scale @param {number} turn @param {number} rim @param {number[]} [tint]
 */
export function poseOptions(scale, turn, rim, tint) {
  OPTS.scale = scale;
  OPTS.turn = turn;
  OPTS.rim = rim;
  OPTS.tint = tint;
  return OPTS;
}

// Scratch matrices: the root, torso and head transforms shared by several parts, and
// two factors. Products are taken left to right, exactly like chain().
const ROOT = new Float32Array(16);
const TORSO = new Float32Array(16);
const HEAD = new Float32Array(16);
const F1 = new Float32Array(16);
const F2 = new Float32Array(16);

/**
 * out = a·b·c (out must not be a or c).
 * @param {Float32Array} a @param {Float32Array} b @param {Float32Array} c @param {Float32Array} out
 */
function mul3(a, b, c, out) {
  return multiply(multiply(a, b, out), c, out);
}

/**
 * Turns a posed character into draw items.
 * @param {Record<string, Part>} parts
 * @param {number} x Feet position (world).
 * @param {number} y
 * @param {number} z
 * @param {number} facing 1 = right, −1 = left.
 * @param {Pose} pose
 * @param {PoseOptions} [o]
 * @param {DrawItem[]} [out] Items are appended here (a new array by default).
 * @param {ItemSource} [pool] Where items come from (new ones by default).
 * @returns {DrawItem[]} `out`.
 */
export function poseCharacter(parts, x, y, z, facing, pose, o = {}, out = [], pool = FRESH) {
  const scale = o.scale ?? 1;
  // Three-quarter turn: the face stays visible while running sideways.
  const yaw = facing * (o.turn ?? 1.05);
  const sq = pose.squash ?? 0;
  const lean = pose.lean ?? 0;
  const spread = pose.armSpread ?? 0;
  const rim = o.rim ?? 0.35;
  const tint = o.tint;
  // root = T(feet)·Ry(yaw)·S(squash)·T(bob); torso = root·T(hip)·Rx(lean); head = torso·T(neck)·Rx(nod).
  multiply(translation(x, y, z, F1), rotationY(yaw, F2), ROOT);
  multiply(
    ROOT,
    scaling(scale * (1 + sq * 0.5), scale * (1 - sq), scale * (1 + sq * 0.5), F1),
    ROOT,
  );
  multiply(ROOT, translation(0, (pose.bob ?? 0) / 16, 0, F1), ROOT);
  mul3(ROOT, translation(0, HIP_Y, 0, F1), rotationX(lean, F2), TORSO);
  mul3(TORSO, translation(0, NECK_Y, 0, F1), rotationX(pose.head ?? 0, F2), HEAD);
  /** Appends the next part and returns its model matrix. @param {string} name @param {true} [face] */
  const part = (name, face) => {
    const it = pool.take(parts[name].mesh, rim, tint, face);
    out.push(it);
    return it.model;
  };
  mul3(ROOT, translation(-HIP_X, HIP_Y, 0, F1), rotationX(-pose.legL, F2), part('legL'));
  mul3(ROOT, translation(HIP_X, HIP_Y, 0, F1), rotationX(-pose.legR, F2), part('legR'));
  part('torso').set(TORSO);
  part('head').set(HEAD);
  const armL = mul3(
    TORSO,
    translation(-SHOULDER_X, SHOULDER_Y, 0, F1),
    rotationZ(-spread, F2),
    part('armL'),
  );
  multiply(armL, rotationX(-pose.armL, F2), armL);
  const armR = mul3(
    TORSO,
    translation(SHOULDER_X, SHOULDER_Y, 0, F1),
    rotationZ(spread, F2),
    part('armR'),
  );
  multiply(armR, rotationX(-pose.armR, F2), armR);
  if (parts.eyes) {
    // Face decals cast no shadow.
    const mood = pose.mood ?? 'neutral';
    const name = MOOD_NAMES[mood] ?? 'Neutral';
    if (mood === 'ouch') part('squint', true).set(HEAD);
    else {
      // Lids close towards a line a little below the eye centre; happy cheeks push the
      // eyes up into smiling crescents, focus lowers the upper lid.
      const open =
        Math.max(0.08, 1 - Math.min(1, Math.max(0, pose.blink ?? 0))) *
        (mood === 'happy' ? 0.78 : mood === 'focus' ? 0.8 : 1);
      const py = EYE_Y - (mood === 'focus' ? 0.03 : 0.006);
      const eyes = mul3(
        HEAD,
        translation(0, py, 0, F1),
        scaling(1, open, 1, F2),
        part('eyes', true),
      );
      multiply(eyes, translation(0, -py, 0, F1), eyes);
    }
    const cheekUp = mood === 'happy' ? 0.008 : 0;
    multiply(HEAD, translation(0, cheekUp, 0, F1), part('cheeks', true));
    part('brow' + name, true).set(HEAD);
    part('mouth' + name, true).set(HEAD);
  }
  if (parts.hair)
    mul3(
      TORSO,
      translation(0, NECK_Y + 0.28, -0.1, F1),
      rotationX(0.08 - lean * 0.5, F2),
      part('hair'),
    );
  if (parts.skirt) multiply(TORSO, translation(0, 0.06, 0, F1), part('skirt'));
  // The prop is held in the right hand.
  if (parts.prop) {
    const p = multiply(armR, translation(0, -0.43, 0.06, F1), part('prop'));
    if (parts.prop.upright) multiply(p, rotationX(pose.armR, F2), p);
  }
  return out;
}
